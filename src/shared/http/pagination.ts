import type { Request } from 'express';
import type { Paged } from './responses';

/**
 * Reading `?page` and `?perPage` off a request.
 *
 * A ceiling on `perPage` rather than trusting the caller. Some of these tables
 * hold five years of rows and `tbl_orders` is 145 columns wide — one request
 * asking for `perPage=100000` would pull the table into this process's memory
 * and hold a pooled connection while it did.
 */

export const DEFAULT_PER_PAGE = 20;
export const MAX_PER_PAGE = 100;

export interface PageRequest {
  page: number;
  perPage: number;
  /** Ready to spread into a Sequelize `findAll`. */
  limit: number;
  offset: number;
}

const positiveInt = (value: unknown, fallback: number): number => {
  if (typeof value !== 'string') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * `maxPerPage` overrides the ceiling for one endpoint.
 *
 * The default is the right answer for a public list. It is the wrong answer for
 * a screen that has to be correct rather than quick: the portal's orders table
 * runs its search, its stage filters and their counts over the rows it holds, so
 * a page smaller than the client's history makes every one of those numbers a
 * count of the page. Those endpoints raise the ceiling deliberately and say why
 * at the call site.
 *
 * Note that raising it is cheaper than paging to the same depth —
 * `orders.listForClient` reads `limit + offset` rows to return `limit` of them,
 * so five pages of 100 read 1,500 rows where one page of 500 reads 500.
 */
export const readPage = (req: Request, maxPerPage = MAX_PER_PAGE): PageRequest => {
  const page = positiveInt(req.query.page, 1);
  const requested = positiveInt(req.query.perPage ?? req.query.limit, DEFAULT_PER_PAGE);
  const perPage = Math.min(requested, maxPerPage);

  return {
    page,
    perPage,
    limit: perPage,
    offset: (page - 1) * perPage,
  };
};

export const pageMeta = (request: PageRequest, total: number): Paged => ({
  page: request.page,
  perPage: request.perPage,
  total,
  // At least one, so a client rendering "page 1 of 0" for an empty list does not
  // have to special-case it.
  totalPages: Math.max(1, Math.ceil(total / request.perPage)),
});
