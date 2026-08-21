import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env';

/**
 * Verifying the passwords already in the database.
 *
 * `tbl_user_client.password` and `tbl_user_admin.password` are `char(100)`, and
 * that width fits a bcrypt hash, an MD5 hex digest, a SHA-1 or a SHA-256. Which
 * one the old application used is not recorded anywhere in the schema, and the
 * dump carries no rows to look at — so this module handles all of them and the
 * deployment either states the algorithm in `LEGACY_PASSWORD_ALGO` or leaves it
 * on `auto` and lets the stored value's shape decide.
 *
 * Existing clients have to be able to sign in with the password they already
 * have. That is the whole requirement: a portal that made five years of clients
 * reset their password on day one would be a portal nobody signed in to.
 *
 * **New hashes are always bcrypt.** The legacy formats are only ever verified,
 * never written. `LEGACY_PASSWORD_REHASH` controls whether a successful legacy
 * sign-in quietly upgrades the stored hash — off by default, because that column
 * is one the old application also reads, and a bcrypt value in it would lock
 * that application out until it is retired or taught the new format.
 */

/** Work factor for new hashes. */
const BCRYPT_ROUNDS = 12;

export type PasswordAlgorithm = 'bcrypt' | 'md5' | 'sha1' | 'sha256' | 'unknown';

const BCRYPT_SHAPE = /^\$2[aby]?\$\d{2}\$[./A-Za-z0-9]{53}$/;
const HEX_32 = /^[a-f0-9]{32}$/i;
const HEX_40 = /^[a-f0-9]{40}$/i;
const HEX_64 = /^[a-f0-9]{64}$/i;

/**
 * What a stored value looks like.
 *
 * By shape rather than by trying each algorithm in turn: a 32-character hex
 * string is an MD5 digest and cannot be anything else, so there is no reason to
 * spend a bcrypt comparison finding that out.
 */
export const detectAlgorithm = (hash: string): PasswordAlgorithm => {
  const trimmed = hash.trim();

  if (BCRYPT_SHAPE.test(trimmed)) return 'bcrypt';
  if (HEX_32.test(trimmed)) return 'md5';
  if (HEX_40.test(trimmed)) return 'sha1';
  if (HEX_64.test(trimmed)) return 'sha256';

  return 'unknown';
};

const digest = (algorithm: 'md5' | 'sha1' | 'sha256', password: string): string =>
  crypto.createHash(algorithm).update(password, 'utf8').digest('hex');

/**
 * Compares two strings without leaking their difference through timing.
 *
 * `===` on a hex digest returns as soon as it finds a differing character, and
 * the time that takes is measurable. Not a large risk on a password digest, but
 * this is the one comparison in the codebase where it costs nothing to remove.
 */
const constantTimeEqual = (left: string, right: string): boolean => {
  const a = Buffer.from(left.toLowerCase(), 'utf8');
  const b = Buffer.from(right.toLowerCase(), 'utf8');

  // `timingSafeEqual` throws on a length mismatch, which is itself a leak — but
  // only of the hash's length, which the algorithm already tells you.
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
};

export interface VerificationResult {
  valid: boolean;
  /** What the stored hash turned out to be, for the rehash decision and logs. */
  algorithm: PasswordAlgorithm;
  /** True when the stored hash is a legacy format that bcrypt should replace. */
  needsUpgrade: boolean;
}

/**
 * Checks a submitted password against whatever is stored.
 *
 * A null or empty stored hash is never a match. The old application leaves
 * `password` null on accounts created by an administrator that have not yet
 * been activated, and treating null as "no password required" would make every
 * one of those accounts open to anyone who knew the email address.
 */
export const verifyPassword = async (
  password: string,
  storedHash: string | null | undefined
): Promise<VerificationResult> => {
  const hash = storedHash?.trim();

  if (!hash || !password) {
    return { valid: false, algorithm: 'unknown', needsUpgrade: false };
  }

  const configured = env.auth.legacyPasswordAlgo;
  const algorithm = configured === 'auto' ? detectAlgorithm(hash) : configured;

  if (algorithm === 'bcrypt') {
    const valid = await bcrypt.compare(password, hash);
    return { valid, algorithm: 'bcrypt', needsUpgrade: false };
  }

  if (algorithm === 'md5' || algorithm === 'sha1' || algorithm === 'sha256') {
    const valid = constantTimeEqual(digest(algorithm, password), hash);
    return { valid, algorithm, needsUpgrade: valid };
  }

  return { valid: false, algorithm: 'unknown', needsUpgrade: false };
};

/** Hashes a new password. Always bcrypt, whatever the legacy rows hold. */
export const hashPassword = (password: string): Promise<string> =>
  bcrypt.hash(password, BCRYPT_ROUNDS);

/** Whether a verified legacy hash should be replaced with bcrypt on sign-in. */
export const shouldRehash = (result: VerificationResult): boolean =>
  env.auth.legacyPasswordRehash && result.valid && result.needsUpgrade;

/**
 * A random token, and its digest.
 *
 * Password reset and email verification hand the client the token and store the
 * digest. `tbl_user_client.reset_pin` is only `char(10)`, so the token issued
 * for the legacy column is short — which is why reset tokens are also
 * rate-limited hard and expire quickly. A ten-character column cannot hold
 * anything with real entropy, and that is a property of the schema rather than
 * a choice made here.
 */
export const newResetPin = (): string =>
  crypto.randomBytes(8).toString('base64url').slice(0, 10);

/** A full-strength token for anything not constrained to `char(10)`. */
export const newToken = (): string => crypto.randomBytes(32).toString('base64url');

export const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value, 'utf8').digest('hex');
