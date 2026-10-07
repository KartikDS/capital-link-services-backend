import { Op, type FindOptions, type WhereOptions } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ClsOrder,
  Countries,
  DocumentLegalizationOrderDetails,
  OrderDocDeliveryDetails,
  OrderReturnDocumentDetails,
  OrderTravellerDetails,
  PoliceClearances,
  RussianVisaVoucherTypes,
} from '../../models';
import { paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { cached } from '../../shared/ttlCache';
import { toIso } from '../../shared/dates';
import { clean } from '../../shared/text';
import { validate, validParams, validQuery } from '../../shared/validation';
import { CLS_ORDER_STATUS, ORDER_TYPE } from '../../domain/codes';

/**
 * The five service queues the back office opens on.
 *
 * ## Why these are not one endpoint with a filter
 *
 * `/api/admin/orders` already offers a unified, filterable queue, and it stays.
 * These are different: each one reproduces a specific screen from the admin CLS
 * has used for years, down to which columns it shows and which rows it includes.
 * A police clearance queue lists *every* order of that type including unplaced
 * ones; the public visa queue lists only submitted, paid ones. A document
 * legalisation row shows an invoice number and a reference that no other service
 * has. Folding those into one shape would mean either the widest possible row
 * with most fields null, or five sets of conditionals at the call site.
 *
 * So each queue is its own handler with its own joins, mirroring the query in
 * `HomeController.php` that it replaces. Where this deviates from the legacy
 * query, the deviation is commented.
 *
 * ## What is faithfully copied, and what is not
 *
 * **Copied:** the row filters, the joins, the columns and their order, and the
 * `id DESC` sort. These are what make the new screen show the same work as the
 * old one, and a difference here is a consultant missing a job.
 *
 * **Not copied:** the legacy returns every matching row in one response and lets
 * DataTables page it in the browser. These page on the server. Five years of
 * orders is too many rows to ship on every load, and the old screens were
 * visibly slow for exactly that reason.
 */

export const queueRoutes = Router();

/** The five queues, and the `order_type` each one reads. */
const QUEUE_TYPE = {
  'public-visa': ORDER_TYPE.PUBLIC_VISA,
  'police-clearance': ORDER_TYPE.POLICE_CLEARANCE,
  'russian-visa-voucher': ORDER_TYPE.RUSSIAN_VISA_VOUCHER,
  'document-delivery': ORDER_TYPE.DOCUMENT_DELIVERY,
  'document-legalisation': ORDER_TYPE.DOCUMENT_LEGALISATION,
} as const;

type QueueName = keyof typeof QUEUE_TYPE;

const queueParam = z.object({
  queue: z.enum(Object.keys(QUEUE_TYPE) as [QueueName, ...QueueName[]]),
});

const queueQuery = z.object({
  search: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(200).optional(),
});

/**
 * The primary traveller's row.
 *
 * `is_primary = 1` on the join, exactly as the legacy queries have it. Without
 * it an order for four applicants appears four times in the queue — which is the
 * bug that condition exists to prevent.
 *
 * `required: false`, so an order whose traveller rows are missing still appears
 * with a blank name rather than vanishing. The legacy uses a LEFT JOIN with the
 * condition in the `WITH` clause, which behaves the same way.
 */
const primaryTraveller = {
  model: OrderTravellerDetails,
  as: 'travellers',
  required: false,
  separate: true,
  where: { is_primary: 1 },
} as const;

/** `hh:mm` from the two columns the schema splits a time across. */
const joinTime = (hour: number | null, minute: number | null): string | null => {
  if (hour === null && minute === null) return null;
  // The legacy does `CONCAT(hr, ':', min)` with no padding, so `9:5` is what the
  // old screen shows. Padded here — the column is a time and `9:05` is what it
  // means — which is the one cosmetic liberty taken in this file.
  const hh = String(hour ?? 0).padStart(2, '0');
  const mm = String(minute ?? 0).padStart(2, '0');
  return `${hh}:${mm}`;
};

/** The name search every queue offers, over the columns that queue displays. */
const searchWhere = (
  search: string | undefined,
  columns: readonly string[]
): WhereOptions => {
  if (!search) return {};
  return {
    [Op.or]: columns.map((column) => ({
      [column]: { [Op.like]: `%${search}%` },
    })),
  };
};

const firstTraveller = (row: ClsOrder) =>
  (
    row as unknown as {
      travellers?: { first_name: string | null; last_name: string | null }[];
    }
  ).travellers?.[0] ?? null;

/** How long a queue's total is reused. See `shared/ttlCache`. */
const COUNT_TTL_MS = 60_000;

/**
 * One page of a queue, and the total behind it.
 *
 * The total is counted on `tbl_cls_order` alone. The includes are all LEFT
 * JOINs to child tables, so they cannot change how many orders there are — but
 * they made the count take ~14s on the legalisation queue, because those child
 * tables have no index on `order_id`. The child rows are loaded with
 * `separate: true` for just the page's ids instead of joined across the whole
 * table.
 *
 * Even on the orders table alone the count is a full scan (no index on
 * `order_type`), so the total is cached for a minute per queue and search. The
 * page of rows is always read live.
 */
const findPage = async (
  options: FindOptions
): Promise<{ rows: ClsOrder[]; count: number }> => {
  const [count, rows] = await Promise.all([
    cached(`queue-count:${JSON.stringify(options.where)}`, COUNT_TTL_MS, () =>
      ClsOrder.count({ where: options.where })
    ),
    ClsOrder.findAll(options),
  ]);
  return { rows, count };
};

/**
 * GET /api/admin/queues/:queue
 *
 * One of the five service queues. The response's `rows` carry only the columns
 * that queue's screen shows, so a caller cannot accidentally render a field the
 * old screen did not have.
 *
 * Named `:queue` rather than `:service` because the docs already declare a
 * `service` path parameter, for the order-draft routes, whose enum is a
 * different set of names. Two meanings on one parameter name would make the
 * published document wrong for one of them.
 */
queueRoutes.get(
  '/:queue',
  validate(queueParam, 'params'),
  validate(queueQuery, 'query'),
  async (req: Request, res: Response) => {
    const { queue } = validParams<{ queue: QueueName }>(req);
    const { search } = validQuery<{ search?: string }>(req);
    const page = readPage(req, 200);

    const orderType = QUEUE_TYPE[queue];

    if (queue === 'police-clearance') {
      /**
       * `policeClearancesListAction`.
       *
       * Note what is *absent*: no `date_submitted IS NOT NULL` and no status
       * filter. This queue deliberately shows unplaced orders too, which is why
       * the screenshot of it carries rows reading "Pending".
       */
      const { rows, count } = await findPage({
        where: { order_type: orderType, ...searchWhere(search, ['order_no']) },
        include: [
          primaryTraveller,
          {
            model: PoliceClearances,
            as: 'clearanceType',
            required: false,
          },
        ],
        order: [['id', 'DESC']],
        limit: page.limit,
        offset: page.offset,
      });

      return paged(
        res,
        'rows',
        rows.map((row) => {
          const traveller = firstTraveller(row);
          return {
            id: row.id,
            firstName: clean(traveller?.first_name),
            lastName: clean(traveller?.last_name),
            clearanceType: clean(
              (row as unknown as { clearanceType?: { name: string | null } })
                .clearanceType?.name
            ),
            status: row.status,
          };
        }),
        pageMeta(page, count)
      );
    }

    if (queue === 'public-visa') {
      /**
       * `publicVisaListAction`.
       *
       * The narrowest of the five: submitted *and* `status = 1`. So an unpaid or
       * half-finished public visa never reaches this screen, which is why its
       * counts are lower than the police clearance queue's on the same data.
       */
      const { rows, count } = await findPage({
        where: {
          order_type: orderType,
          date_submitted: { [Op.ne]: null },
          status: CLS_ORDER_STATUS.COMPLETED,
          ...searchWhere(search, ['order_no']),
        },
        include: [
          primaryTraveller,
          { model: Countries, as: 'destinationCountry', required: false },
        ],
        order: [['id', 'DESC']],
        limit: page.limit,
        offset: page.offset,
      });

      return paged(
        res,
        'rows',
        rows.map((row) => {
          const traveller = firstTraveller(row);
          return {
            id: row.id,
            dateSubmitted: toIso(row.date_submitted),
            firstName: clean(traveller?.first_name),
            lastName: clean(traveller?.last_name),
            destination: clean(
              (row as unknown as { destinationCountry?: { country_name: string | null } })
                .destinationCountry?.country_name
            ),
            departureDate: toIso(row.departure_date),
            status: row.status,
            // The old system's reference, carried over on migrated orders. The
            // legacy column header calls it "Migrated Order No".
            migratedOrderNo: clean(row.order_no),
          };
        }),
        pageMeta(page, count)
      );
    }

    if (queue === 'russian-visa-voucher') {
      /** `russianVisaVoucherListAction`. */
      const { rows, count } = await findPage({
        where: { order_type: orderType, ...searchWhere(search, ['order_no']) },
        include: [
          primaryTraveller,
          {
            model: RussianVisaVoucherTypes,
            as: 'voucherCatalogue',
            required: false,
          },
        ],
        order: [['id', 'DESC']],
        limit: page.limit,
        offset: page.offset,
      });

      return paged(
        res,
        'rows',
        rows.map((row) => {
          const traveller = firstTraveller(row);
          const voucher = (
            row as unknown as {
              voucherCatalogue?: { type: string | null; name: string | null };
            }
          ).voucherCatalogue;

          return {
            id: row.id,
            dateSubmitted: toIso(row.date_submitted),
            // Two different columns on the same catalogue row, and the old
            // screen shows both: `type` is the class of voucher, `name` is the
            // particular one.
            voucherType: clean(voucher?.type),
            firstName: clean(traveller?.first_name),
            lastName: clean(traveller?.last_name),
            voucher: clean(voucher?.name),
            status: row.status,
            migratedOrderNo: clean(row.order_no),
          };
        }),
        pageMeta(page, count)
      );
    }

    if (queue === 'document-delivery') {
      /**
       * `docDeliveryListAction`.
       *
       * The only queue that reads the contact name off the order itself rather
       * than a traveller row — a courier booking has no applicant.
       */
      const { rows, count } = await findPage({
        where: {
          order_type: orderType,
          ...searchWhere(search, ['order_no', 'contact_first_name', 'contact_last_name']),
        },
        include: [
          {
            model: OrderDocDeliveryDetails,
            as: 'docDeliveryDetails',
            required: false,
            separate: true,
          },
        ],
        order: [['id', 'DESC']],
        limit: page.limit,
        offset: page.offset,
      });

      return paged(
        res,
        'rows',
        rows.map((row) => {
          const detail = (
            row as unknown as {
              docDeliveryDetails?: {
                package_total_pieces: number | null;
                package_pickup_date: string | null;
                package_ready_time_by_hr: number | null;
                package_ready_time_by_min: number | null;
                package_close_time_by_hr: number | null;
                package_close_time_by_min: number | null;
              }[];
            }
          ).docDeliveryDetails?.[0];

          return {
            id: row.id,
            dateSubmitted: toIso(row.date_submitted),
            firstName: clean(row.contact_first_name),
            lastName: clean(row.contact_last_name),
            pieces: detail?.package_total_pieces ?? null,
            pickupDate: toIso(detail?.package_pickup_date ?? null),
            pickupTime: joinTime(
              detail?.package_ready_time_by_hr ?? null,
              detail?.package_ready_time_by_min ?? null
            ),
            officeCloseTime: joinTime(
              detail?.package_close_time_by_hr ?? null,
              detail?.package_close_time_by_min ?? null
            ),
            status: row.status,
            migratedOrderNo: clean(row.order_no),
          };
        }),
        pageMeta(page, count)
      );
    }

    /**
     * `documentLegalisationAction`.
     *
     * Note the column the old screen uses for the destination:
     * `country_name_display`, not `country_name`. The two differ for a handful
     * of countries, and this queue is the one place the display form is what
     * staff read — so it is copied rather than normalised.
     *
     * Its status filter is commented out in the legacy source, so every
     * legalisation order appears here whatever its state. Left that way.
     */
    const { rows, count } = await findPage({
      where: {
        order_type: orderType,
        ...searchWhere(search, ['order_no', 'contact_first_name', 'contact_last_name']),
      },
      include: [
        { model: Countries, as: 'destinationCountry', required: false },
        {
          model: DocumentLegalizationOrderDetails,
          as: 'legalisationDetails',
          required: false,
          separate: true,
        },
        {
          model: OrderReturnDocumentDetails,
          as: 'returnDocumentDetails',
          required: false,
          separate: true,
        },
      ],
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    return paged(
      res,
      'rows',
      rows.map((row) => {
        const wide = row as unknown as {
          destinationCountry?: { country_name_display: string | null };
          legalisationDetails?: {
            com_invoice_no: string | null;
            ref_no: string | null;
          }[];
          returnDocumentDetails?: { company: string | null }[];
        };

        const detail = wide.legalisationDetails?.[0];

        return {
          id: row.id,
          dateSubmitted: toIso(row.date_submitted),
          firstName: clean(row.contact_first_name),
          lastName: clean(row.contact_last_name),
          destination: clean(wide.destinationCountry?.country_name_display),
          company: clean(wide.returnDocumentDetails?.[0]?.company),
          invoiceNo: clean(detail?.com_invoice_no),
          referenceNo: clean(detail?.ref_no),
          status: row.status,
          migratedOrderNo: clean(row.order_no),
        };
      }),
      pageMeta(page, count)
    );
  }
);
