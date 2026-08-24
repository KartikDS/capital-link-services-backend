import type { NextFunction, Request, Response } from 'express';
import { tooManyRequests } from '../shared/errors';
import { logger } from '../shared/logger';

/**
 * Rate limiting, in memory.
 *
 * In memory because there is nowhere else to put it: the schema is fixed and has
 * no table for this, and adding Redis to the deployment for the sake of five
 * counters is a new piece of infrastructure to run. The tradeoff is stated
 * rather than hidden — with more than one process, each keeps its own count, so
 * the effective limit is the configured one multiplied by the number of
 * processes. For the endpoints this guards, that is still the difference between
 * ten attempts and ten thousand.
 *
 * What it actually protects. `tbl_user_client.password` may be MD5 — the schema
 * cannot tell us otherwise — and an unthrottled sign-in endpoint against MD5
 * hashes is a password-guessing service. The reset endpoint is limited because
 * `reset_pin` is `char(10)`, which is not enough entropy to survive being
 * guessed at speed.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

export interface RateLimitOptions {
  /** How many requests are allowed in the window. */
  max: number;
  windowMs: number;
  /** Names the limiter in logs and keeps buckets from different routes apart. */
  name: string;
  /**
   * What counts as "the same caller".
   *
   * Defaults to the client IP. Sign-in keys on the *email* as well, so one
   * attacker cannot use a rotating IP to work through a single account, and one
   * office behind a shared NAT does not lock out its colleagues.
   */
  keyOf?: (req: Request) => string;
}

const buckets = new Map<string, Bucket>();

/**
 * Drops expired buckets.
 *
 * Without this the map grows by one entry per distinct IP forever, which on a
 * public endpoint is a slow memory leak. Swept on write rather than on a timer,
 * so an idle process does nothing.
 */
const sweep = (now: number): void => {
  if (buckets.size < 5_000) return;

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

/** The caller's address, honouring one proxy hop. */
const clientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    // Leftmost is the original client; the rest are proxies.
    return forwarded.split(',')[0]?.trim() ?? req.ip ?? 'unknown';
  }

  return req.ip ?? 'unknown';
};

export const rateLimit = (options: RateLimitOptions) => {
  const { max, windowMs, name, keyOf } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    sweep(now);

    const key = `${name}:${keyOf ? keyOf(req) : clientIp(req)}`;
    const existing = buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    existing.count += 1;

    if (existing.count > max) {
      const retryAfter = Math.ceil((existing.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));

      logger.warn('Rate limit exceeded', {
        limiter: name,
        path: req.originalUrl,
        retryAfter,
      });

      next(tooManyRequests());
      return;
    }

    next();
  };
};

/** Clears every bucket. Tests only — a shared counter across tests is a flake. */
export const resetRateLimits = (): void => buckets.clear();

/**
 * The limits, in one place.
 *
 * Numbers chosen against what the endpoint costs and what a real person does:
 * nobody signs in ten times in five minutes, and a client who has genuinely
 * forgotten their password does not need six reset emails in a quarter of an
 * hour.
 */
const emailKey = (req: Request): string => {
  const body = req.body as { email?: unknown } | undefined;
  const email = typeof body?.email === 'string' ? body.email.toLowerCase() : '';
  return `${clientIp(req)}|${email}`;
};

export const limits = {
  signIn: rateLimit({
    name: 'sign-in',
    max: 10,
    windowMs: 5 * 60_000,
    keyOf: emailKey,
  }),

  passwordReset: rateLimit({
    name: 'password-reset',
    max: 5,
    windowMs: 15 * 60_000,
    keyOf: emailKey,
  }),

  register: rateLimit({ name: 'register', max: 5, windowMs: 60 * 60_000 }),

  /**
   * Resending a confirmation email.
   *
   * Keyed on the caller's IP rather than the account, because the endpoint is
   * authenticated and the account is already known from the token. Three in a
   * quarter of an hour: a client whose email has not arrived presses the button
   * once, maybe twice, and each press sends real mail from CLS's mailbox --
   * so this is as much about not turning the portal into a way of posting mail
   * to an address as it is about the write behind it.
   */
  emailVerification: rateLimit({
    name: 'email-verification',
    max: 3,
    windowMs: 15 * 60_000,
  }),

  /** The live "is this email taken?" check, called as someone types. */
  availability: rateLimit({ name: 'availability', max: 20, windowMs: 60_000 }),

  /** Public order tracking: a reference plus an email is a guessable pair. */
  tracking: rateLimit({ name: 'tracking', max: 20, windowMs: 5 * 60_000 }),

  /** The public intake forms. Generous, because a real person may retry. */
  enquiry: rateLimit({ name: 'enquiry', max: 10, windowMs: 10 * 60_000 }),

  /** Uploads are the most expensive thing an authenticated client can do. */
  upload: rateLimit({ name: 'upload', max: 60, windowMs: 10 * 60_000 }),
};
