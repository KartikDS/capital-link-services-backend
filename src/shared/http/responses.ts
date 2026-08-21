import type { Response } from 'express';

/**
 * The shape of every response this API sends.
 *
 * One envelope, decided here, because the website's `apiClient` reads a
 * `message` or `error` field off a failure and a named collection off a success
 * — and it does that for all hundred-odd endpoints. A handler that invents its
 * own shape is a handler the frontend renders as a blank panel.
 *
 * Successes carry their payload under a **named key** rather than a generic
 * `data`: `{ orders: [...] }`, `{ profile: {...} }`. That is what the frontend
 * already destructures, and it means a response says what it holds without a
 * schema to hand.
 */

export interface Paged {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

/**
 * `{ orders: [...] }`, status 200.
 *
 * Constrained to `object` rather than `Record<string, unknown>`. The stricter
 * type reads well until a handler wants to return a declared interface, which
 * has no index signature — and the fix for that is either an index signature on
 * every response interface or a cast at every call site. Both are noise around
 * a helper whose whole job is `res.json`.
 */
export const ok = <T extends object>(res: Response, payload: T): Response =>
  res.status(200).json(payload);

/** For a resource this request brought into existence. */
export const created = <T extends object>(res: Response, payload: T): Response =>
  res.status(201).json(payload);

/**
 * A collection with its paging alongside it.
 *
 * The count sits next to the rows rather than in a header, because the portal
 * tables render "showing 20 of 143" and a header would mean the client reading
 * two places to draw one line.
 */
export const paged = <T>(
  res: Response,
  key: string,
  rows: readonly T[],
  meta: Paged
): Response => res.status(200).json({ [key]: rows, pagination: meta });

/** 204, for a delete or a state change with nothing to say back. */
export const noContent = (res: Response): Response => res.status(204).send();

/**
 * A message and nothing else.
 *
 * Used by the flows that must not confirm what they did — "if that address is
 * registered, a reset link is on its way" — where the whole point is that the
 * response is the same whether the account existed or not.
 */
export const message = (res: Response, text: string, status = 200): Response =>
  res.status(status).json({ message: text });
