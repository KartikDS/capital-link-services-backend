import cors from 'cors';
import compression from 'compression';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { accessLog, requestId } from './middleware/requestContext';
import { apiRouter } from './routes';
import { mountSwagger } from './config/swagger';

/**
 * The Express application, assembled but not listening.
 *
 * Separated from `server.ts` so the tests can mount this with Supertest without
 * binding a port — which is what lets the whole suite run in one process.
 *
 * Order matters here and is deliberate:
 *
 * 1. `requestId` first, so every later log line and error response can be tied
 *    back to one request.
 * 2. `helmet` before anything that writes a body.
 * 3. Body parsers before the router, but *not* before the multipart routes —
 *    `express.json()` would consume an upload's stream and multer would find
 *    nothing left to read.
 * 4. `notFoundHandler` then `errorHandler` last, in that order. Express picks
 *    the error handler by arity, so it has to be registered after every route.
 */

export const createApp = (): Express => {
  const app = express();

  // Behind a load balancer this is what makes `req.ip` the client rather than
  // the proxy — which the rate limiter keys on. One hop, not `true`: trusting
  // the whole chain lets a caller spoof their own address with a header.
  app.set('trust proxy', 1);

  // The stack trace of a 500 is not something to advertise, and neither is the
  // framework.
  app.disable('x-powered-by');

  app.use(requestId);

  app.use(
    helmet({
      // This API serves JSON and streamed file downloads, never HTML — except
      // the Swagger page, which mounts its own policy below.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    })
  );

  app.use(
    cors({
      /**
       * An allowlist, and a request with no origin is allowed through.
       *
       * No origin means a server-to-server call — which is how the website
       * actually talks to this API, since the access token lives in its session
       * cookie and never reaches a browser. Browser origins are only needed for
       * local tooling and the docs page.
       */
      origin: (origin, callback) => {
        if (!origin || env.allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: false,
      maxAge: 86_400,
    })
  );

  app.use(compression());

  // A 1 MB cap. Order payloads carry several applicants and their addresses, so
  // the default 100 KB is genuinely too small; anything above this is a file,
  // and files go through multer on their own routes.
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use(accessLog);

  mountSwagger(app);

  app.use('/api', apiRouter);

  // Kept off `/api` so a misconfigured load balancer health check still finds
  // something to hit at the root.
  app.get('/', (_req, res) => {
    res.json({
      service: 'Capital Link Services API',
      docs: '/api-docs',
      health: '/api/health',
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
