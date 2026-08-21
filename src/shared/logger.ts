import { env } from '../config/env';

/**
 * A structured logger, deliberately small.
 *
 * One JSON line per event, because the thing that reads these in production is
 * a log aggregator rather than a person, and a multi-line pretty-printed object
 * arrives there as several unrelated records.
 *
 * No dependency: this is roughly forty lines of behaviour, and pulling in a
 * logging framework to get it would mean a transport layer, a serialiser
 * registry and a redaction config to maintain for the same output.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const;

export type LogLevel = keyof typeof LEVELS;

/** Field names whose values are replaced before anything is written. */
const REDACTED = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'card_number',
  'ccv_number',
  'cardNumber',
  'secret',
]);

/**
 * Replaces sensitive values, and only the values.
 *
 * Keeping the key means a log line still shows that a password was involved,
 * which is what makes an auth failure diagnosable without recording the
 * credential itself.
 */
const redact = (value: unknown, depth = 0): unknown => {
  if (depth > 4 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const output: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = REDACTED.has(key) ? '[redacted]' : redact(item, depth + 1);
  }

  return output;
};

const threshold = LEVELS[env.logLevel];

const write = (level: LogLevel, message: string, context?: unknown): void => {
  if (LEVELS[level] > threshold) return;

  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    message,
    ...(context === undefined ? {} : { context: redact(context) }),
  });

  // Errors and warnings to stderr, the rest to stdout: that is the split every
  // process supervisor already understands.
  if (level === 'error' || level === 'warn') {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
};

export const logger = {
  error: (message: string, context?: unknown) => write('error', message, context),
  warn: (message: string, context?: unknown) => write('warn', message, context),
  info: (message: string, context?: unknown) => write('info', message, context),
  debug: (message: string, context?: unknown) => write('debug', message, context),
};
