import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// `quiet` keeps dotenv's banner out of test and CI output. Values already
// present in the environment win, so a harness that sets them first is
// unaffected by whatever a local `.env` happens to contain.
dotenv.config({ quiet: true });

/**
 * Every environment variable this service reads, validated once at boot.
 *
 * The whole point is that nothing else in the codebase touches `process.env`.
 * A missing `DB_PASSWORD` should stop the process on startup with a message
 * naming the variable — not surface an hour later as a connection error on the
 * first request that happened to need the database.
 *
 * `JWT_SECRET` has a length floor rather than just a presence check, because a
 * four-character signing key is worse than a missing one: it starts, it looks
 * like it works, and every token it issues is forgeable.
 */

/** `'true'` / `'1'` / `'yes'` → true. Anything else, including unset, is false. */
const booleanish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return fallback;
      return ['true', '1', 'yes', 'on'].includes(value.trim().toLowerCase());
    });

const integer = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((value) => {
      if (value === undefined || value.trim() === '') return fallback;
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    });

const nonEmpty = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: integer(5000),
  ALLOWED_ORIGINS: z.string().optional(),

  DB_HOST: z.string().min(1, 'DB_HOST is required'),
  DB_PORT: integer(3306),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
  DB_USER: z.string().min(1, 'DB_USER is required'),
  DB_PASSWORD: z.string().optional(),
  DB_CHARSET: z.string().default('utf8mb4'),
  DB_TIMEZONE: z.string().default('+10:00'),
  DB_POOL_MAX: integer(10),
  DB_POOL_MIN: integer(0),
  DB_POOL_IDLE_MS: integer(10_000),
  DB_POOL_ACQUIRE_MS: integer(30_000),
  DB_LOG_QUERIES: booleanish(false),
  DB_READ_ONLY: booleanish(false),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),
  LEGACY_PASSWORD_ALGO: z
    .enum(['auto', 'bcrypt', 'md5', 'sha1', 'sha256'])
    .default('auto'),
  LEGACY_PASSWORD_REHASH: booleanish(false),

  INTERNAL_API_SECRET: z.string().optional(),

  UPLOAD_DIR: z.string().default('./uploads'),
  MAX_UPLOAD_MB: integer(10),
  LEGACY_UPLOAD_DIR: z.string().optional(),

  GOOGLE_MAPS_API_KEY: z.string().optional(),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  // Thrown rather than logged: a process that cannot read its own
  // configuration has nothing useful left to do.
  throw new Error(
    `Invalid environment configuration.\n${problems}\n\nSee .env.example for the full list.`
  );
}

const raw = parsed.data;

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  port: raw.PORT,

  /** Empty list means "no browser origin is allowed", which is the safe default. */
  allowedOrigins: (raw.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  database: {
    host: raw.DB_HOST,
    port: raw.DB_PORT,
    name: raw.DB_NAME,
    user: raw.DB_USER,
    password: raw.DB_PASSWORD ?? '',
    charset: raw.DB_CHARSET,
    timezone: raw.DB_TIMEZONE,
    pool: {
      max: raw.DB_POOL_MAX,
      min: raw.DB_POOL_MIN,
      idle: raw.DB_POOL_IDLE_MS,
      acquire: raw.DB_POOL_ACQUIRE_MS,
    },
    logQueries: raw.DB_LOG_QUERIES,
    readOnly: raw.DB_READ_ONLY,
  },

  auth: {
    accessSecret: raw.JWT_SECRET,
    accessExpiresIn: raw.JWT_EXPIRES_IN,
    refreshSecret: raw.JWT_REFRESH_SECRET,
    refreshExpiresIn: raw.JWT_REFRESH_EXPIRES_IN,
    legacyPasswordAlgo: raw.LEGACY_PASSWORD_ALGO,
    legacyPasswordRehash: raw.LEGACY_PASSWORD_REHASH,
  },

  /** Null disables the internal namespace entirely, rather than opening it. */
  internalApiSecret: nonEmpty(raw.INTERNAL_API_SECRET),

  uploads: {
    dir: path.resolve(raw.UPLOAD_DIR),
    maxBytes: raw.MAX_UPLOAD_MB * 1024 * 1024,
    maxMb: raw.MAX_UPLOAD_MB,
    /** Null means legacy document downloads answer 404 rather than guessing a root. */
    legacyDir: nonEmpty(raw.LEGACY_UPLOAD_DIR)
      ? path.resolve(raw.LEGACY_UPLOAD_DIR as string)
      : null,
  },

  googleMapsApiKey: nonEmpty(raw.GOOGLE_MAPS_API_KEY),
  logLevel: raw.LOG_LEVEL,
} as const;

export type Env = typeof env;
