import type { NextFunction, Request, Response } from 'express';
import { forbidden, unauthorized } from '../shared/errors';
import { bearerToken, verifyAccessToken, type Audience } from '../shared/tokens';

/**
 * Who is calling, and whether they may.
 *
 * `authenticate` is mandatory: no token means 401, always. There is deliberately
 * no "optional auth" variant here. The previous build had one on the portal
 * routes, and the effect was that an expired session got a `200` with an empty
 * body — a client with eight live jobs shown a portal saying they had none. A
 * 401 is the answer that lets the website refresh the token and retry.
 */

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const token = bearerToken(req.headers.authorization);

  if (!token) {
    next(unauthorized());
    return;
  }

  // `verifyAccessToken` throws an ApiError, which Express 5 forwards.
  req.auth = verifyAccessToken(token);
  next();
};

/**
 * Populates `req.auth` when a token is present, and carries on when it is not.
 *
 * **Only for the order lodgement routes.** Those journeys are deliberately open
 * to guests — the website lets someone order a police clearance or a voucher
 * without an account — but a signed-in client placing the same order must have
 * it attached to them. Without this, a valid token on a lodgement route would be
 * ignored and the order saved with no `client_id`, so it would never appear in
 * that client's portal.
 *
 * A *bad* token is still refused. That is the difference between this and the
 * kind of optional auth worth avoiding: an expired session gets a 401 and the
 * chance to refresh, not a silent downgrade to guest. The only accepted absence
 * is no `Authorization` header at all.
 *
 * It must never be used on a route that reads existing records. See the note on
 * `authenticate` above for what that cost the previous build.
 */
export const authenticateOptional = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const token = bearerToken(req.headers.authorization);

  if (!token) {
    next();
    return;
  }

  req.auth = verifyAccessToken(token);
  next();
};

/**
 * Narrows a route to particular user tables.
 *
 * `requireAudience('admin')` on the back-office routes, so a valid *client*
 * token cannot reach them. The check is on the audience the token was issued
 * for rather than a role column, because this schema keeps staff and clients in
 * different tables (`tbl_user_admin`, `tbl_user_client`) and the table a session
 * came from is the authority on what it is.
 */
export const requireAudience =
  (...allowed: readonly Audience[]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      next(unauthorized());
      return;
    }

    if (!allowed.includes(req.auth.aud)) {
      next(forbidden());
      return;
    }

    next();
  };

/** The back office. `tbl_user_admin` only. */
export const requireAdmin = requireAudience('admin');

/** A signed-in client. `tbl_user_client` only. */
export const requireClient = requireAudience('client');

/**
 * The signed-in client's id, or a 401.
 *
 * A helper rather than `req.auth!.sub` at forty call sites: the non-null
 * assertion is the thing that turns a missing `authenticate` on a route into a
 * crash instead of a clean 401.
 */
export const currentUserId = (req: Request): number => {
  if (!req.auth) throw unauthorized();
  return req.auth.sub;
};

/**
 * True when the caller may act on records belonging to `clientId`.
 *
 * Admins may act on anyone's. A client may act only on their own. Used by every
 * read that takes an id from the URL, and the reason those reads answer 404
 * rather than 403 when it returns false — see `notFound` in `shared/errors`.
 */
export const canActFor = (req: Request, clientId: number | null): boolean => {
  if (!req.auth) return false;
  if (req.auth.aud === 'admin') return true;
  return clientId !== null && req.auth.sub === clientId;
};
