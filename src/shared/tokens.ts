import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { unauthorized } from './errors';

/**
 * Issuing and checking the tokens.
 *
 * Two keys, not one. A leaked access-token key lets an attacker forge a session
 * that expires in an hour; if the same key also signed refresh tokens, it would
 * let them mint new sessions indefinitely. Separating them means the cheap
 * secret and the expensive one are not the same secret.
 *
 * The database gives us nothing to work with for session storage. There is no
 * table for refresh tokens or sessions anywhere in this schema, and the schema
 * is fixed — so revocation cannot be done by deleting a row. Sessions are
 * therefore stateless, access tokens are short-lived by design, and the refresh
 * token carries a `sid` so that a future revocation list has something to key
 * on if CLS ever provisions a place to keep one.
 */

/** Which user table the subject came from. */
export type Audience = 'client' | 'admin' | 'embassy' | 'tpn';

export interface AccessClaims {
  /** The row id in the table named by `aud`. */
  sub: number;
  aud: Audience;
  email: string | null;
  /** `tbl_user_client.type` — government, public or corporate. Null for staff. */
  clientType: string | null;
  /** Session id, so an access and refresh pair can be tied together in logs. */
  sid: string;
}

export interface RefreshClaims {
  sub: number;
  aud: Audience;
  sid: string;
}

const sign = (
  payload: object,
  secret: string,
  expiresIn: string
): string =>
  jwt.sign(payload, secret, {
    expiresIn,
    issuer: 'cls-api',
  } as SignOptions);

export const issueAccessToken = (claims: AccessClaims): string =>
  sign(claims, env.auth.accessSecret, env.auth.accessExpiresIn);

export const issueRefreshToken = (claims: RefreshClaims): string =>
  sign(claims, env.auth.refreshSecret, env.auth.refreshExpiresIn);

/**
 * How long the access token lasts, in seconds.
 *
 * Returned to the website so its session can refresh an hour *before* expiry
 * rather than discovering the expiry through a failed request — which is what
 * turns a token rollover into a client being logged out mid-upload.
 */
export const accessTokenSeconds = (): number => {
  const decoded = jwt.decode(issueAccessToken({
    sub: 0,
    aud: 'client',
    email: null,
    clientType: null,
    sid: 'probe',
  }));

  if (decoded !== null && typeof decoded === 'object') {
    const { exp, iat } = decoded;
    if (typeof exp === 'number' && typeof iat === 'number') return exp - iat;
  }

  return 3600;
};

const verify = <T>(token: string, secret: string): T => {
  try {
    return jwt.verify(token, secret, { issuer: 'cls-api' }) as T;
  } catch (error) {
    // The reason is deliberately not passed on. "Expired" and "bad signature"
    // are different facts, and telling an unauthenticated caller which one
    // applies tells them whether they had a real token.
    const expired = error instanceof jwt.TokenExpiredError;
    throw unauthorized(
      expired
        ? 'Your session has ended. Please sign in again.'
        : 'Please sign in to continue.'
    );
  }
};

export const verifyAccessToken = (token: string): AccessClaims =>
  verify<AccessClaims>(token, env.auth.accessSecret);

export const verifyRefreshToken = (token: string): RefreshClaims =>
  verify<RefreshClaims>(token, env.auth.refreshSecret);

/** `Authorization: Bearer <token>` → the token, or null. */
export const bearerToken = (header: string | undefined): string | null => {
  if (!header) return null;

  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;

  return token.trim() || null;
};
