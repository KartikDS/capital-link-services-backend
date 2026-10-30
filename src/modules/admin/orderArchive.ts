import { QueryTypes } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../../config/database';
import { ClsOrder, UserAdmin } from '../../models';
import { currentUserId } from '../../middleware/authenticate';
import { ORDER_TYPE_LABEL } from '../../domain/codes';
import { notFound, serviceUnavailable } from '../../shared/errors';
import { ok, paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { toIso, toLegacyDateTime } from '../../shared/dates';
import { clean, fullName } from '../../shared/text';
import { idParam, validate, validParams } from '../../shared/validation';
import { SERVICE_WORDS, searchWords } from './queueSearch';

/**
 * Archiving an order: hiding it from the working lists without deleting anything.
 *
 * ## Where the switch lives
 *
 * `tbl_ops_order_archive` — one row per order that has ever been archived, with an
 * `is_archived` flag (1 hides, 0 shows). It is a table of our own because the
 * legacy `tbl_cls_order` is CLS's, and this app issues no DDL against it. The
 * migration is `db/migrations/2026-10-30-ops-order-archive.sql`.
 *
 * ## What it hides
 *
 * Every screen that lists or counts orders for staff leaves an archived one out:
 * the five service queues, All services, the dashboard counts and the rail's
 * badges, the Document Hub, the payments list and the CSV export. It hides nothing
 * about the order itself — its rows, payments and documents are untouched, the
 * client still sees it in their portal, and staff can still open it by its link —
 * so unarchiving brings back exactly what was there.
 *
 * ## When the table is not there yet
 *
 * The filters quietly do nothing and the lists look exactly as before; archiving
 * itself answers 503 with what to ask for. The deploy that carries this code does
 * not have to wait for the DBA.
 */

/** The orders currently archived, as a subquery of ids. */
const ARCHIVED_IDS =
  '(SELECT a.order_id FROM tbl_ops_order_archive a WHERE a.is_archived = 1)';

/** `column` is not an archived order. */
export const notArchivedSql = (column: string): string =>
  `${column} NOT IN ${ARCHIVED_IDS}`;

/**
 * As `notArchivedSql`, for a column that can be null — a payment with no order
 * number must stay in the list, and `NULL NOT IN (…)` would drop it.
 */
export const notArchivedOrNullSql = (column: string): string =>
  `(${column} IS NULL OR ${notArchivedSql(column)})`;

// ---------------------------------------------------------------------------
// Is the migration applied?
// ---------------------------------------------------------------------------

let probe: { at: number; ok: boolean } | null = null;
const PROBE_MS = 15_000;

/** True once `tbl_ops_order_archive` exists. Probed at most every 15 seconds. */
export const archiveAvailable = async (): Promise<boolean> => {
  const now = Date.now();
  if (probe && (probe.ok || now - probe.at < PROBE_MS)) return probe.ok;

  let found = false;
  try {
    const [row] = await sequelize.query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_ops_order_archive'`,
      { type: QueryTypes.SELECT }
    );
    found = Number(row?.n ?? 0) > 0;
  } catch {
    found = false;
  }

  probe = { at: now, ok: found };
  return found;
};

/** Test seam. */
export const resetArchiveProbe = (): void => {
  probe = null;
};

/**
 * The condition that leaves archived orders out, or null where there is nothing to
 * leave out (the migration has not been applied).
 */
export const hideArchivedSql = async (
  column: string,
  nullable = false
): Promise<string | null> =>
  (await archiveAvailable())
    ? nullable
      ? notArchivedOrNullSql(column)
      : notArchivedSql(column)
    : null;

// ---------------------------------------------------------------------------
// The Archived orders list
// ---------------------------------------------------------------------------

/** `%`, `_` and `\` are characters when typed, not wildcards. */
const likeText = (word: string): string => word.replace(/[\\%_]/g, '\\$&');

/**
 * The search over the Archived orders list, word by word like the other lists:
 * every word has to match something the list shows — the order number, the name,
 * the destination, the service, who archived it, or the note.
 */
export const archivedSearchSql = (
  search: string | undefined
): { sql: string; replacements: Record<string, string> } => {
  const replacements: Record<string, string> = {};

  const conditions = searchWords(search).map((word, index) => {
    const key = `w${index}`;
    replacements[key] = `%${likeText(word)}%`;

    const wanted = word.toLowerCase();
    // By the names staff use on the Orders tabs, and by what a client is told.
    const services = SERVICE_WORDS.filter(
      ({ code, label }) =>
        label.toLowerCase().includes(wanted) ||
        (ORDER_TYPE_LABEL[code] ?? '').toLowerCase().includes(wanted)
    ).map(({ code }) => code);

    const parts = [
      `CAST(a.order_id AS CHAR) LIKE :${key}`,
      `o.contact_first_name LIKE :${key}`,
      `o.contact_last_name LIKE :${key}`,
      `CONCAT_WS(' ', o.contact_first_name, o.contact_last_name) LIKE :${key}`,
      `o.contact_email LIKE :${key}`,
      `c.country_name LIKE :${key}`,
      `a.archive_note LIKE :${key}`,
      `a.archived_by_name LIKE :${key}`,
      `a.order_id IN (SELECT t.order_id FROM tbl_order_traveller_details t WHERE t.order_id IS NOT NULL AND t.is_primary = 1 AND (t.first_name LIKE :${key} OR t.last_name LIKE :${key} OR CONCAT_WS(' ', t.first_name, t.last_name) LIKE :${key} OR t.email LIKE :${key}))`,
    ];
    if (services.length > 0) parts.push(`o.order_type IN (${services.join(', ')})`);

    return `(${parts.join(' OR ')})`;
  });

  return {
    sql: conditions.length > 0 ? ` AND ${conditions.join(' AND ')}` : '',
    replacements,
  };
};

const FROM = `
  FROM tbl_ops_order_archive a
  JOIN tbl_cls_order o ON o.id = a.order_id
  LEFT JOIN tbl_countries c ON c.id = o.destination
 WHERE a.is_archived = 1`;

interface ArchivedRow {
  id: number;
  order_type: number | null;
  status: number | null;
  date_submitted: string | null;
  fn: string | null;
  ln: string | null;
  email: string | null;
  traveller: string | null;
  dest: string | null;
  archived_at: string | null;
  archived_by_name: string | null;
  archive_note: string | null;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

type Audit = (
  req: Request,
  action: string,
  detail: Record<string, unknown>
) => Promise<void>;

const UNAVAILABLE =
  'Archiving is not set up on this database yet. Ask the DBA to apply db/migrations/2026-10-30-ops-order-archive.sql.';

/** Who is acting, by name, for the record the row keeps. */
const actorOf = async (req: Request): Promise<{ id: number; name: string }> => {
  const id = currentUserId(req);
  const admin = await UserAdmin.findByPk(id);

  return { id, name: fullName(admin?.fname, admin?.lname) ?? `Staff #${id}` };
};

export const archiveRoutes = (audit: Audit): Router => {
  const router = Router();

  /** GET /archived-orders — every order currently archived, newest first. */
  router.get(
    '/archived-orders',
    validate(
      z.object({
        search: z.string().trim().max(100).optional(),
        page: z.coerce.number().int().positive().optional(),
        perPage: z.coerce.number().int().positive().max(100).optional(),
      }),
      'query'
    ),
    async (req: Request, res: Response) => {
      const page = readPage(req);
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;

      if (!(await archiveAvailable())) {
        return ok(res, {
          available: false,
          orders: [],
          pagination: pageMeta(page, 0),
        });
      }

      const { sql: searchSql, replacements } = archivedSearchSql(search);

      const [count] = await sequelize.query<{ n: number }>(
        `SELECT COUNT(*) AS n ${FROM}${searchSql}`,
        { type: QueryTypes.SELECT, replacements }
      );
      const rows = await sequelize.query<ArchivedRow>(
        `SELECT a.order_id AS id, o.order_type, o.status, o.date_submitted,
                o.contact_first_name AS fn, o.contact_last_name AS ln, o.contact_email AS email,
                (SELECT CONCAT_WS(' ', t.first_name, t.last_name)
                   FROM tbl_order_traveller_details t
                  WHERE t.order_id = a.order_id AND t.is_primary = 1 LIMIT 1) AS traveller,
                c.country_name AS dest, a.archived_at, a.archived_by_name, a.archive_note
           ${FROM}${searchSql}
          ORDER BY a.archived_at DESC, a.order_id DESC
          LIMIT :limit OFFSET :offset`,
        {
          type: QueryTypes.SELECT,
          replacements: { ...replacements, limit: page.limit, offset: page.offset },
        }
      );

      return paged(
        res,
        'orders',
        rows.map((row) => ({
          id: row.id,
          orderType: row.order_type,
          service: row.order_type
            ? (SERVICE_WORDS.find(({ code }) => code === row.order_type)?.label ??
              ORDER_TYPE_LABEL[row.order_type] ??
              null)
            : null,
          status: row.status,
          // The traveller for the visa and clearance orders, the contact for the
          // rest — the same choice the queues make.
          name: clean(row.traveller) ?? clean(fullName(row.fn, row.ln)) ?? null,
          email: clean(row.email),
          destination: clean(row.dest),
          submittedAt: toIso(row.date_submitted),
          archivedAt: toIso(row.archived_at),
          archivedBy: clean(row.archived_by_name),
          note: clean(row.archive_note),
        })),
        pageMeta(page, Number(count?.n ?? 0))
      );
    }
  );

  /** GET /orders/:id/archive — whether one order is archived, for its own screen. */
  router.get(
    '/orders/:id/archive',
    validate(z.object({ id: idParam }), 'params'),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);

      if (!(await archiveAvailable()))
        return ok(res, { available: false, archived: false });

      const [row] = await sequelize.query<{
        archived_at: string | null;
        archived_by_name: string | null;
        archive_note: string | null;
      }>(
        'SELECT archived_at, archived_by_name, archive_note FROM tbl_ops_order_archive WHERE order_id = :id AND is_archived = 1',
        { type: QueryTypes.SELECT, replacements: { id } }
      );

      return ok(res, {
        available: true,
        archived: Boolean(row),
        archivedAt: toIso(row?.archived_at ?? null),
        archivedBy: clean(row?.archived_by_name),
        note: clean(row?.archive_note),
      });
    }
  );

  /** POST /orders/:id/archive — hide an order from the lists. Safe to repeat. */
  router.post(
    '/orders/:id/archive',
    validate(z.object({ id: idParam }), 'params'),
    validate(z.object({ note: z.string().trim().max(500).optional() }).default({})),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const { note } = (req.body ?? {}) as { note?: string };

      if (!(await archiveAvailable())) throw serviceUnavailable(UNAVAILABLE);
      if (!(await ClsOrder.findByPk(id, { attributes: ['id'] }))) {
        throw notFound('We could not find that order.');
      }

      const actor = await actorOf(req);

      // One row per order. Archiving an order that was archived before and since
      // restored writes over its flag and clears the restore, and keeps the row.
      await sequelize.query(
        `INSERT INTO tbl_ops_order_archive
           (order_id, is_archived, archived_at, archived_by, archived_by_name, archive_note,
            unarchived_at, unarchived_by, unarchived_by_name)
         VALUES (:id, 1, :at, :by, :name, :note, NULL, NULL, NULL)
         ON DUPLICATE KEY UPDATE is_archived = 1, archived_at = VALUES(archived_at),
           archived_by = VALUES(archived_by), archived_by_name = VALUES(archived_by_name),
           archive_note = VALUES(archive_note), unarchived_at = NULL, unarchived_by = NULL,
           unarchived_by_name = NULL`,
        {
          type: QueryTypes.INSERT,
          replacements: {
            id,
            at: toLegacyDateTime(),
            by: actor.id,
            name: actor.name,
            note: note ? note : null,
          },
        }
      );

      await audit(req, 'order.archive', { orderId: id, note: note ?? null });

      return ok(res, { orderId: id, archived: true });
    }
  );

  /** POST /orders/:id/unarchive — show an archived order again. Safe to repeat. */
  router.post(
    '/orders/:id/unarchive',
    validate(z.object({ id: idParam }), 'params'),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);

      if (!(await archiveAvailable())) throw serviceUnavailable(UNAVAILABLE);

      const actor = await actorOf(req);

      // The row stays, flagged 0: who archived it and why is still on record.
      await sequelize.query(
        `UPDATE tbl_ops_order_archive
            SET is_archived = 0, unarchived_at = :at, unarchived_by = :by, unarchived_by_name = :name
          WHERE order_id = :id AND is_archived = 1`,
        {
          type: QueryTypes.UPDATE,
          replacements: { id, at: toLegacyDateTime(), by: actor.id, name: actor.name },
        }
      );

      await audit(req, 'order.unarchive', { orderId: id });

      return ok(res, { orderId: id, archived: false });
    }
  );

  return router;
};
