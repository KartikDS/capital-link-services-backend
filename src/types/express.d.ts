import type { AccessClaims } from '../shared/tokens';

/**
 * What the middleware adds to a request.
 *
 * Declared here rather than cast at each use, so a handler reading `req.auth`
 * gets the real type and a handler on a public route gets `undefined` — which is
 * the distinction that makes "did I remember to require a token on this route?"
 * a compile-time question instead of a runtime one.
 */
declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`. Undefined on public and internal routes. */
      auth?: AccessClaims;
      /** Set by `internalOnly`, for a server-to-server caller with no user. */
      internal?: true;
      /** Correlates every log line for one request. */
      requestId?: string;
    }
  }
}

export {};
