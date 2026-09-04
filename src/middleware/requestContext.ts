import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { forbidden } from '../shared/errors';
import { logger } from '../shared/logger';

/**
 * Request identity, access logging, and the internal-only gate.
 */

/**
 * Tags every request so its log lines can be tied together.
 *
 * An inbound `x-request-id` is honoured — the website generates one and passing
 * it through means one identifier spans the browser, the website's proxy and
 * this API. Bounded and stripped, because it is attacker-controlled and it ends
 * up in log output.
 */
export const requestId = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const inbound = req.headers['x-request-id'];
  const supplied =
    typeof inbound === 'string' ? inbound.replace(/[^\w-]/g, '').slice(0, 64) : '';

  req.requestId = supplied || crypto.randomUUID();
  res.setHeader('x-request-id', req.requestId);

  next();
};

/** Paths never worth a log line. */
const QUIET = new Set(['/api/health', '/api/health/live', '/favicon.ico']);

/**
 * One line per request, written when it finishes.
 *
 * On `finish` rather than on arrival, so the line carries the status and the
 * duration. Query strings are dropped: order references and email addresses
 * travel in them, and an access log is the wrong place for either.
 */
export const accessLog = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (QUIET.has(req.path)) {
    next();
    return;
  }

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

    logger.info('request', {
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: req.auth?.sub ?? null,
    });
  });

  next();
};

/**
 * Server-to-server only, guarded by a shared secret.
 *
 * The Stripe webhook lives on the website — Stripe's signature is verified
 * there — and it then has to tell this API that a payment landed. That call
 * carries no user session, so it carries this secret instead.
 *
 * Compared in constant time, and refused outright when the secret is unset. An
 * unset secret disables the route rather than opening it: the failure mode of
 * "compare against empty string" is that every caller passes.
 */
/**
 * Whether this request carries the shared secret.
 *
 * Extracted so the two guards below cannot drift: one refuses a caller without
 * it, the other merely notes one with it, and both have to compare the same way
 * — in constant time, and false when the secret is unset. An unset secret
 * disables an internal route rather than opening it, because the failure mode of
 * comparing against an empty string is that every caller passes.
 */
const carriesInternalSecret = (req: Request): boolean => {
  const expected = env.internalApiSecret;

  if (!expected) return false;

  const header = req.headers['x-internal-secret'];
  const supplied = typeof header === 'string' ? header : '';

  const a = Buffer.from(supplied, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

export const internalOnly = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!env.internalApiSecret) {
    logger.error('Internal endpoint called but INTERNAL_API_SECRET is not set', {
      path: req.originalUrl,
    });
    next(forbidden('This endpoint is not enabled on this deployment.'));
    return;
  }

  if (!carriesInternalSecret(req)) {
    logger.warn('Internal endpoint called with a bad secret', {
      path: req.originalUrl,
    });
    next(forbidden('This endpoint is not available.'));
    return;
  }

  req.internal = true;
  next();
};

/**
 * Notes an internal caller without requiring one.
 *
 * For a route that is public in one shape and internal in another, which is
 * `POST /api/enquiries/translation` and nothing else. Anyone may lodge a
 * translation enquiry — it is a public intake form — but the variant that
 * carries documents writes them to the S3 bucket, and an endpoint that lets an
 * anonymous caller do that on demand is a way to fill a bucket rather than a way
 * to ask for a translation.
 *
 * So the route lets everyone in and asks `req.internal` before it accepts a
 * file. The website's own server route is the only caller that sends documents,
 * and it holds the secret; a browser reaching the API directly through the
 * website's proxy does not, and gets the file-less path.
 *
 * Never rejects — that is the whole difference from `internalOnly`.
 */
export const markInternal = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (carriesInternalSecret(req)) req.internal = true;
  next();
};
