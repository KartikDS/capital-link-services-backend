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
export const internalOnly = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const expected = env.internalApiSecret;

  if (!expected) {
    logger.error('Internal endpoint called but INTERNAL_API_SECRET is not set', {
      path: req.originalUrl,
    });
    next(forbidden('This endpoint is not enabled on this deployment.'));
    return;
  }

  const header = req.headers['x-internal-secret'];
  const supplied = typeof header === 'string' ? header : '';

  const a = Buffer.from(supplied, 'utf8');
  const b = Buffer.from(expected, 'utf8');

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    logger.warn('Internal endpoint called with a bad secret', {
      path: req.originalUrl,
    });
    next(forbidden('This endpoint is not available.'));
    return;
  }

  req.internal = true;
  next();
};
