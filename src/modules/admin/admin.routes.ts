import { Op } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ClsOrder,
  ClsOrderDocumentNotes,
  ClsOrderDocuments,
  Countries,
  Inquiries,
  Logs,
  OrderDlQuotes,
  OrderNotes,
  Orders,
  Payment,
  UserAdmin,
  UserClient,
} from '../../models';
import { authenticate, currentUserId, requireAdmin } from '../../middleware/authenticate';
import { badRequest, forbidden, notFound } from '../../shared/errors';
import { created, ok, paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { toIso, toLegacyDateTime } from '../../shared/dates';
import { centsToNumber, toCents } from '../../shared/money';
import { clean, cleanOr, fullName, truncate } from '../../shared/text';
import { idParam, validate, validParams, validQuery } from '../../shared/validation';
import { logger } from '../../shared/logger';
import {
  CLS_ORDER_STATUS,
  DOCUMENT_STATUS,
  ENABLED,
  LOG_AREA,
  PAYMENT_STATUS,
} from '../../domain/codes';
import * as orderService from '../orders/orders.service';

/**
 * The back office. Staff tokens only.
 *
 * `requireAdmin` is applied once at the top of the router. A client token that
 * reaches any route below is refused before the handler runs — the audience on
 * the token records which user table it came from, and `tbl_user_client` is not
 * `tbl_user_admin`.
 *
 * ## Audit
 *
 * `tbl_logs` is the schema's audit table — `area`, `user_id`, `user_type`,
 * `log_datetime`, `log_details` — and every write below records to it. That is
 * the one piece of accountability this schema does provide, and using it means
 * CLS's existing log viewer shows what the new API did alongside what the old
 * application did.
 */

export const adminRoutes = Router();

adminRoutes.use(authenticate, requireAdmin);

/**
 * Writes an audit entry.
 *
 * Failures are swallowed and logged. An audit write that fails must not fail the
 * action it was recording — but it must be noticeable, which is what the
 * `logger.error` is for.
 */
const audit = async (
  req: Request,
  action: string,
  detail: Record<string, unknown>
): Promise<void> => {
  try {
    await Logs.create({
      area: LOG_AREA.ADMIN,
      user_id: req.auth?.sub ?? null,
      user_type: 'admin',
      log_datetime: toLegacyDateTime(),
      log_details: JSON.stringify({ action, ...detail }).slice(0, 60_000),
    });
  } catch (error) {
    logger.error('Audit write failed', {
      action,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/dashboard
 *
 * Counts rather than lists. Each is a `COUNT(*)` with a `WHERE`, run in
 * parallel — which is cheap even against five years of rows, and much cheaper
 * than pulling the rows back to count them here.
 */
adminRoutes.get('/dashboard', async (_req: Request, res: Response) => {
  const [
    pendingOrders,
    completedOrders,
    unpaidOrders,
    newEnquiries,
    clientsTotal,
    documentsAwaitingReview,
  ] = await Promise.all([
    ClsOrder.count({
      where: { status: CLS_ORDER_STATUS.PENDING, date_submitted: { [Op.ne]: null } },
    }),
    ClsOrder.count({ where: { status: CLS_ORDER_STATUS.COMPLETED } }),
    ClsOrder.count({
      where: {
        payment_status: PAYMENT_STATUS.FAILED,
        date_submitted: { [Op.ne]: null },
      },
    }),
    Inquiries.count({ where: { status: 'new' } }),
    UserClient.count({ where: { s_enabled: ENABLED } }),
    ClsOrderDocuments.count({ where: { status: DOCUMENT_STATUS.UPLOADED } }),
  ]);

  ok(res, {
    metrics: {
      pendingOrders,
      completedOrders,
      unpaidOrders,
      newEnquiries,
      clientsTotal,
      documentsAwaitingReview,
    },
  });
});

// ---------------------------------------------------------------------------
// The order queue
// ---------------------------------------------------------------------------

const queueQuerySchema = z.object({
  status: z.coerce.number().int().min(0).max(2).optional(),
  orderType: z.coerce.number().int().min(1).max(9).optional(),
  consultantId: z.coerce.number().int().positive().optional(),
  unassigned: z.enum(['true', 'false']).optional(),
  unpaid: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(64).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
});

/**
 * GET /api/admin/orders
 *
 * The work queue, from `tbl_cls_order` only. The legacy table is readable
 * one-by-one through `/api/orders/:reference`, but it is not in the queue: an
 * order placed through the old application is worked in the old application, and
 * showing it here would put the same job in two systems with two sets of
 * controls.
 */
adminRoutes.get(
  '/orders',
  validate(queueQuerySchema, 'query'),
  async (req: Request, res: Response) => {
    const query = validQuery<z.infer<typeof queueQuerySchema>>(req);
    const page = readPage(req);

    const { rows, count } = await ClsOrder.findAndCountAll({
      where: {
        date_submitted: { [Op.ne]: null },
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.orderType ? { order_type: query.orderType } : {}),
        ...(query.consultantId
          ? { visa_cls_team_member: query.consultantId }
          : {}),
        ...(query.unassigned === 'true'
          ? { visa_cls_team_member: { [Op.is]: null } }
          : {}),
        ...(query.unpaid === 'true'
          ? { payment_status: PAYMENT_STATUS.FAILED }
          : {}),
        ...(query.search
          ? {
              [Op.or]: [
                { order_no: { [Op.like]: `%${query.search}%` } },
                { contact_email: { [Op.like]: `%${query.search}%` } },
                { contact_last_name: { [Op.like]: `%${query.search}%` } },
              ],
            }
          : {}),
      },
      include: [{ model: Countries, as: 'destinationCountry', required: false }],
      order: [['date_submitted', 'DESC']],
      limit: page.limit,
      offset: page.offset,
      distinct: true,
    });

    paged(
      res,
      'orders',
      rows.map((row) => ({
        id: row.id,
        reference: clean(row.order_no) ?? String(row.id),
        orderType: row.order_type,
        clientId: row.client_id,
        contact: fullName(row.contact_first_name, row.contact_last_name),
        contactEmail: clean(row.contact_email),
        destination: clean(
          (row as unknown as { destinationCountry?: { country_name: string | null } })
            .destinationCountry?.country_name
        ),
        applicants: row.no_of_traveller,
        totalCents: toCents(row.total_fee),
        paid: row.payment_status === PAYMENT_STATUS.COMPLETE,
        status: row.status,
        consultantId: row.visa_cls_team_member,
        submittedAt: toIso(row.date_submitted),
      })),
      pageMeta(page, count)
    );
  }
);

/** PATCH /api/admin/orders/:id/assign — put a consultant on a job. */
adminRoutes.patch(
  '/orders/:id/assign',
  validate(z.object({ id: idParam }), 'params'),
  validate(z.object({ consultantId: z.coerce.number().int().positive().nullable() })),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const { consultantId } = req.body as { consultantId: number | null };

    const order = await ClsOrder.findByPk(id);
    if (!order) throw notFound('We could not find that order.');

    if (consultantId !== null) {
      const consultant = await UserAdmin.findOne({
        where: { id: consultantId, s_enabled: ENABLED },
      });
      if (!consultant) throw badRequest('That consultant is not on the roster.');
    }

    await order.update({
      visa_cls_team_member: consultantId,
      date_last_saved: toLegacyDateTime(),
    });

    await audit(req, 'order.assign', { orderId: id, consultantId });

    ok(res, { orderId: id, consultantId });
  }
);

/**
 * PATCH /api/admin/orders/:id/status
 *
 * Only the three values `tbl_cls_order.status` documents. A status outside that
 * set would be a number the old application does not recognise, and it reads the
 * same column.
 */
adminRoutes.patch(
  '/orders/:id/status',
  validate(z.object({ id: idParam }), 'params'),
  validate(
    z.object({
      status: z.union([
        z.literal(CLS_ORDER_STATUS.PENDING),
        z.literal(CLS_ORDER_STATUS.COMPLETED),
        z.literal(CLS_ORDER_STATUS.CLS_CONFIRMED),
      ]),
    })
  ),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const { status } = req.body as { status: number };

    const order = await ClsOrder.findByPk(id);
    if (!order) throw notFound('We could not find that order.');

    const previous = order.status;
    await order.update({ status, date_last_saved: toLegacyDateTime() });

    await audit(req, 'order.status', { orderId: id, from: previous, to: status });

    ok(res, { orderId: id, status });
  }
);

/**
 * POST /api/admin/orders/:reference/notes
 *
 * `internal: true` marks a note staff-only. The client-facing read filters on
 * `is_admin`, so this flag is the difference between a note a client sees and
 * one they do not — and getting it the wrong way round would publish internal
 * commentary to a client portal.
 */
adminRoutes.post(
  '/orders/:reference/notes',
  validate(
    z.object({ reference: z.string().trim().min(1).max(64) }),
    'params'
  ),
  validate(
    z.object({
      note: z.string().trim().min(1, 'Write a note').max(20_000),
      internal: z.boolean().optional(),
      actionRequired: z.boolean().optional(),
    })
  ),
  async (req: Request, res: Response) => {
    const { reference } = validParams<{ reference: string }>(req);
    const body = req.body as {
      note: string;
      internal?: boolean;
      actionRequired?: boolean;
    };

    const resolved = await orderService.resolve(reference);
    if (!resolved) throw notFound('We could not find that order.');

    const orderNo =
      resolved.family === 'legacy'
        ? resolved.row.order_no
        : Number.parseInt(/(\d+)$/.exec(reference)?.[1] ?? '', 10);

    if (!Number.isSafeInteger(orderNo)) {
      throw badRequest(
        'A note cannot be attached to that reference — the notes table is keyed by order number and this reference has none.'
      );
    }

    const admin = await UserAdmin.findByPk(currentUserId(req));

    const row = await OrderNotes.create({
      order_no: orderNo,
      note: body.note,
      date_added: toLegacyDateTime(),
      note_by: currentUserId(req),
      note_by_name: fullName(admin?.fname, admin?.lname),
      user_type: 'admin',
      is_admin: body.internal === false ? 0 : 1,
      is_deleted: 0,
      ...(body.actionRequired ? { status: 'Action required' } : {}),
    });

    await audit(req, 'order.note', {
      orderNo,
      noteId: row.id,
      internal: body.internal !== false,
    });

    created(res, {
      note: {
        id: String(row.id),
        internal: body.internal !== false,
        postedAt: toIso(row.date_added),
      },
    });
  }
);

/** GET /api/admin/orders/:reference/notes — every note, internal included. */
adminRoutes.get(
  '/orders/:reference/notes',
  validate(z.object({ reference: z.string().trim().min(1).max(64) }), 'params'),
  async (req: Request, res: Response) => {
    const { reference } = validParams<{ reference: string }>(req);
    const resolved = await orderService.resolve(reference);

    if (!resolved) throw notFound('We could not find that order.');

    const orderNo =
      resolved.family === 'legacy'
        ? resolved.row.order_no
        : Number.parseInt(/(\d+)$/.exec(reference)?.[1] ?? '', 10);

    if (!Number.isSafeInteger(orderNo)) return ok(res, { notes: [] });

    const { listAllNotes } = await import('../orders/orders.repository');
    const notes = await listAllNotes(orderNo);

    return ok(res, {
      notes: notes.map((note) => ({
        id: String(note.id),
        body: clean(note.note),
        author: clean(note.note_by_name),
        authorType: clean(note.user_type),
        internal: note.is_admin === 1,
        postedAt: toIso(note.date_added),
      })),
    });
  }
);

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

const MILESTONE_COLUMNS = {
  received: 'date_cls_received_all_items',
  submitted: 'date_submitted_for_processing',
  completed: 'date_completed_and_received_at_cls',
  closed: 'date_order_on_route_and_closed',
} as const;

/**
 * PATCH /api/admin/orders/:id/milestone
 *
 * Stamps one of the four milestone dates on whichever detail table the order
 * has. The progress bar a client sees is counted from these, so this is the
 * endpoint that moves it — there is no separate progress column to set.
 */
adminRoutes.patch(
  '/orders/:id/milestone',
  validate(z.object({ id: idParam }), 'params'),
  validate(
    z.object({
      milestone: z.enum(['received', 'submitted', 'completed', 'closed']),
      /** Null clears it, for a milestone stamped by mistake. */
      at: z.string().trim().max(32).nullable().optional(),
    })
  ),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = req.body as {
      milestone: keyof typeof MILESTONE_COLUMNS;
      at?: string | null;
    };

    const order = await ClsOrder.findByPk(id);
    if (!order) throw notFound('We could not find that order.');

    const column = MILESTONE_COLUMNS[body.milestone];
    const value =
      body.at === null
        ? null
        : body.at
          ? toLegacyDateTime(new Date(body.at))
          : toLegacyDateTime();

    const {
      DocumentLegalizationOrderDetails,
      PoliceClearanceOrderDetails,
      RussianVisaVoucherOrderDetails,
    } = await import('../../models');

    /**
     * Whichever detail row this order has.
     *
     * All three tables carry the same four milestone columns, but they are three
     * distinct model types — so the row is found first and updated through a
     * widened handle. Sequelize's `update` is typed per-model and a union of the
     * three has no callable signature in common, which is a type-level problem
     * rather than a runtime one: the column exists on all three.
     */
    const detail =
      (await PoliceClearanceOrderDetails.findOne({ where: { order_id: id } })) ??
      (await RussianVisaVoucherOrderDetails.findOne({ where: { order_id: id } })) ??
      (await DocumentLegalizationOrderDetails.findOne({ where: { order_id: id } }));

    if (!detail) {
      throw badRequest(
        'That order has no service detail row, so milestone dates cannot be recorded against it.'
      );
    }

    await (detail as unknown as {
      update: (values: Record<string, string | null>) => Promise<unknown>;
    }).update({ [column]: value });
    await order.update({ date_last_saved: toLegacyDateTime() });

    await audit(req, 'order.milestone', { orderId: id, milestone: body.milestone, at: value });

    ok(res, { orderId: id, milestone: body.milestone, at: toIso(value) });
  }
);

// ---------------------------------------------------------------------------
// Document review
// ---------------------------------------------------------------------------

/**
 * PATCH /api/admin/documents/:id/review
 *
 * Approve or reject an uploaded document, with a note. The note is what turns
 * "rejected" into something a client can act on, so a rejection without one is
 * refused.
 */
adminRoutes.patch(
  '/documents/:id/review',
  validate(z.object({ id: idParam }), 'params'),
  validate(
    z.object({
      decision: z.enum(['approve', 'reject', 'reviewed']),
      note: z.string().trim().max(20_000).optional(),
    })
  ),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = req.body as { decision: 'approve' | 'reject' | 'reviewed'; note?: string };

    const document = await ClsOrderDocuments.findByPk(id);
    if (!document) throw notFound('We could not find that document.');

    if (body.decision === 'reject' && !clean(body.note)) {
      throw badRequest(
        'Tell the client why it was rejected — a rejection with no reason gives them nothing to fix.'
      );
    }

    const status =
      body.decision === 'approve'
        ? DOCUMENT_STATUS.APPROVED
        : body.decision === 'reject'
          ? DOCUMENT_STATUS.REJECTED
          : DOCUMENT_STATUS.REVIEWED;

    await document.update({ status, modified: toLegacyDateTime() });

    if (clean(body.note) && document.order_id) {
      await ClsOrderDocumentNotes.create({
        order_id: document.order_id,
        document_id: document.document_id,
        order_document_id: document.id,
        notes: body.note,
        is_approved: body.decision === 'approve' ? 1 : 0,
        created: toLegacyDateTime(),
        modified: toLegacyDateTime(),
      });
    }

    await audit(req, 'document.review', {
      documentId: id,
      decision: body.decision,
      status,
    });

    ok(res, { documentId: id, status, decision: body.decision });
  }
);

/** GET /api/admin/documents/awaiting-review */
adminRoutes.get('/documents/awaiting-review', async (req: Request, res: Response) => {
  const page = readPage(req);

  const { rows, count } = await ClsOrderDocuments.findAndCountAll({
    where: { status: DOCUMENT_STATUS.UPLOADED },
    order: [['created', 'ASC']],
    limit: page.limit,
    offset: page.offset,
  });

  paged(
    res,
    'documents',
    rows.map((row) => ({
      id: String(row.id),
      orderId: row.order_id,
      name: clean(row.document),
      uploadedAt: toIso(row.created),
    })),
    pageMeta(page, count)
  );
});

// ---------------------------------------------------------------------------
// Legalisation quotes
// ---------------------------------------------------------------------------

/**
 * POST /api/admin/orders/:reference/quote
 *
 * Raises the quote lines a legalisation order is priced by. This is the one place
 * in the API where a staff member sets an amount by hand — legalisation has no
 * published rate, which is why `tbl_order_dl_quotes` exists.
 *
 * `sent_group` batches the lines that go out together, and the portal reads one
 * group as one invoice.
 */
adminRoutes.post(
  '/orders/:reference/quote',
  validate(z.object({ reference: z.string().trim().min(1).max(64) }), 'params'),
  validate(
    z.object({
      lines: z
        .array(
          z.object({
            description: z.string().trim().min(1).max(2000),
            quantity: z.coerce.number().int().min(1).max(1000),
            unitCents: z.coerce.number().int().min(0),
            gstDollars: z.coerce.number().int().min(0).optional(),
          })
        )
        .min(1, 'Add at least one line'),
      send: z.boolean().optional(),
    })
  ),
  async (req: Request, res: Response) => {
    const { reference } = validParams<{ reference: string }>(req);
    const body = req.body as {
      lines: { description: string; quantity: number; unitCents: number; gstDollars?: number }[];
      send?: boolean;
    };

    const resolved = await orderService.resolve(reference);
    if (!resolved) throw notFound('We could not find that order.');

    const orderNo =
      resolved.family === 'legacy'
        ? resolved.row.order_no
        : Number.parseInt(/(\d+)$/.exec(reference)?.[1] ?? '', 10);

    if (!Number.isSafeInteger(orderNo)) {
      throw badRequest(
        'A quote cannot be raised against that reference — the quotes table is keyed by order number.'
      );
    }

    // One group per batch. Derived from the highest existing group, because the
    // column has no sequence behind it.
    const latest = await OrderDlQuotes.findOne({
      where: { order_no: orderNo },
      order: [['sent_group', 'DESC']],
    });

    const sentGroup = (latest?.sent_group ?? 0) + 1;
    const now = toLegacyDateTime();

    const rows = await Promise.all(
      body.lines.map((line) =>
        OrderDlQuotes.create({
          order_no: orderNo,
          description: line.description,
          quantity: line.quantity,
          price: centsToNumber(line.unitCents),
          // `gst` is `int(11)` — whole dollars only, which is what the column can
          // hold. Cents of GST cannot be represented here.
          gst: line.gstDollars ?? 0,
          total: centsToNumber(line.unitCents * line.quantity),
          admin_id: currentUserId(req),
          sent_group: sentGroup,
          // Null until sent: the portal only shows quotes with a `sent_date`.
          sent_date: body.send === false ? null : now,
        })
      )
    );

    const totalCents = body.lines.reduce(
      (total, line) => total + line.unitCents * line.quantity,
      0
    );

    // Reflect the quote on the order, so the client's screens show a figure.
    if (resolved.family === 'cls' && body.send !== false) {
      const { centsToLegacyString } = await import('../../shared/money');
      await resolved.row.update({ total_fee: centsToLegacyString(totalCents) });
    }

    await audit(req, 'order.quote', {
      orderNo,
      sentGroup,
      lines: rows.length,
      totalCents,
    });

    created(res, {
      quote: {
        group: sentGroup,
        lines: rows.length,
        totalCents,
        sent: body.send !== false,
      },
      note:
        'GST is stored in whole dollars — tbl_order_dl_quotes.gst is an int(11), so cents of GST cannot be recorded.',
    });
  }
);

// ---------------------------------------------------------------------------
// Clients and staff
// ---------------------------------------------------------------------------

adminRoutes.get(
  '/clients',
  validate(
    z.object({
      search: z.string().trim().max(255).optional(),
      page: z.coerce.number().int().positive().optional(),
      perPage: z.coerce.number().int().positive().max(100).optional(),
    }),
    'query'
  ),
  async (req: Request, res: Response) => {
    const { search } = validQuery<{ search?: string }>(req);
    const page = readPage(req);

    const { rows, count } = await UserClient.findAndCountAll({
      where: search
        ? {
            [Op.or]: [
              { email: { [Op.like]: `%${search}%` } },
              { lname: { [Op.like]: `%${search}%` } },
              { company: { [Op.like]: `%${search}%` } },
              { display_id: { [Op.like]: `%${search}%` } },
            ],
          }
        : {},
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(
      res,
      'clients',
      rows.map((row) => ({
        id: row.id,
        accountNumber: clean(row.display_id),
        name: fullName(row.fname, row.lname),
        email: clean(row.email),
        company: clean(row.company),
        type: clean(row.type),
        enabled: row.s_enabled === ENABLED,
        archived: row.s_archive === 1,
        onAccount: row.can_charge_cost_to_account === 1,
        lastLogin: toIso(row.last_login),
      })),
      pageMeta(page, count)
    );
  }
);

/**
 * PATCH /api/admin/clients/:id
 *
 * Enabling account terms and suspending are both here. `can_get_special_price`
 * and `special_price` are left alone deliberately — a discount rate is a
 * commercial decision, and this API has no screen or approval flow behind it.
 */
adminRoutes.patch(
  '/clients/:id',
  validate(z.object({ id: idParam }), 'params'),
  validate(
    z.object({
      enabled: z.boolean().optional(),
      onAccount: z.boolean().optional(),
      accountNumber: z.string().trim().max(50).optional().nullable(),
    })
  ),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = req.body as {
      enabled?: boolean;
      onAccount?: boolean;
      accountNumber?: string | null;
    };

    const client = await UserClient.findByPk(id);
    if (!client) throw notFound('We could not find that client.');

    await client.update({
      ...(body.enabled !== undefined ? { s_enabled: body.enabled ? 1 : 0 } : {}),
      ...(body.onAccount !== undefined
        ? { can_charge_cost_to_account: body.onAccount ? 1 : 0 }
        : {}),
      ...(body.accountNumber !== undefined
        ? { account_no: clean(body.accountNumber) }
        : {}),
    });

    await audit(req, 'client.update', { clientId: id, ...body });

    ok(res, { clientId: id });
  }
);

/**
 * GET /api/admin/consultants
 *
 * The staff roster from `tbl_user_admin`. Note what is absent: no phone, no job
 * title, no photograph, because the table has no columns for them. See
 * `domain/company.ts` for how the portal fills that gap honestly.
 */
adminRoutes.get('/consultants', async (_req: Request, res: Response) => {
  const rows = await UserAdmin.findAll({
    where: { s_enabled: ENABLED },
    order: [['fname', 'ASC']],
  });

  ok(res, {
    consultants: rows.map((row) => ({
      id: row.id,
      name: fullName(row.fname, row.lname),
      email: clean(row.email),
      isDriver: row.s_driver === 1,
      lastLogin: clean(row.last_login),
    })),
  });
});

/**
 * PATCH /api/admin/consultants/:id
 *
 * An administrator cannot disable their own account. That is the one mistake
 * that locks every administrator out of the system, and it is worth a guard
 * rather than a support call.
 */
adminRoutes.patch(
  '/consultants/:id',
  validate(z.object({ id: idParam }), 'params'),
  validate(z.object({ enabled: z.boolean() })),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const { enabled } = req.body as { enabled: boolean };

    if (id === currentUserId(req) && !enabled) {
      throw forbidden('You cannot disable your own account.');
    }

    const admin = await UserAdmin.findByPk(id);
    if (!admin) throw notFound('We could not find that staff member.');

    await admin.update({ s_enabled: enabled ? 1 : 0 });
    await audit(req, 'consultant.update', { consultantId: id, enabled });

    ok(res, { consultantId: id, enabled });
  }
);

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

adminRoutes.get(
  '/logs',
  validate(
    z.object({
      area: z.enum(['admin', 'dfat', 'client']).optional(),
      userId: z.coerce.number().int().positive().optional(),
      page: z.coerce.number().int().positive().optional(),
      perPage: z.coerce.number().int().positive().max(100).optional(),
    }),
    'query'
  ),
  async (req: Request, res: Response) => {
    const query = validQuery<{ area?: string; userId?: number }>(req);
    const page = readPage(req);

    const { rows, count } = await Logs.findAndCountAll({
      where: {
        ...(query.area ? { area: query.area } : {}),
        ...(query.userId ? { user_id: query.userId } : {}),
      },
      order: [['log_datetime', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(
      res,
      'logs',
      rows.map((row) => ({
        id: row.log_id,
        area: clean(row.area),
        userId: row.user_id,
        userType: clean(row.user_type),
        at: toIso(row.log_datetime),
        detail: truncate(clean(row.log_details), 2000),
      })),
      pageMeta(page, count)
    );
  }
);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * GET /api/admin/orders/export
 *
 * CSV, streamed as a download. Capped at 5,000 rows: an unbounded export of a
 * table with five years of orders would hold a pooled connection for the length
 * of the download and buffer the result in this process's memory first.
 */
adminRoutes.get('/orders/export', async (req: Request, res: Response) => {
  const rows = await ClsOrder.findAll({
    where: { date_submitted: { [Op.ne]: null } },
    order: [['date_submitted', 'DESC']],
    limit: 5000,
  });

  /**
   * One CSV cell.
   *
   * Typed to the primitives a cell can hold rather than `unknown`. An `unknown`
   * would let an object through and write `[object Object]` into a column, which
   * nobody notices until a client opens the export.
   */
  const escape = (value: string | number | null): string => {
    const text = value === null ? '' : String(value);
    // Quote anything containing a delimiter, a quote or a newline.
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const header = [
    'reference',
    'order_type',
    'client_id',
    'contact_name',
    'contact_email',
    'applicants',
    'total_cents',
    'paid',
    'status',
    'submitted_at',
  ];

  const lines = rows.map((row) =>
    [
      clean(row.order_no) ?? String(row.id),
      row.order_type,
      row.client_id,
      fullName(row.contact_first_name, row.contact_last_name),
      clean(row.contact_email),
      row.no_of_traveller,
      toCents(row.total_fee),
      row.payment_status === PAYMENT_STATUS.COMPLETE ? 'yes' : 'no',
      row.status,
      toIso(row.date_submitted),
    ]
      .map(escape)
      .join(',')
  );

  await audit(req, 'orders.export', { rows: rows.length });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="cls-orders-${toLegacyDateTime().slice(0, 10)}.csv"`
  );
  res.send([header.join(','), ...lines].join('\r\n'));
});

/** GET /api/admin/payments/reconcile — payments with no matching order. */
adminRoutes.get('/payments/reconcile', async (_req: Request, res: Response) => {
  const payments = await Payment.findAll({
    where: { payment_status: PAYMENT_STATUS.COMPLETE },
    order: [['date_paid', 'DESC']],
    limit: 500,
  });

  const orphans: { paymentId: number; orderNo: number | null; amountCents: number | null }[] = [];

  for (const payment of payments) {
    if (payment.order_no === null) {
      orphans.push({
        paymentId: payment.id,
        orderNo: null,
        amountCents: toCents(payment.total_order_price),
      });
      continue;
    }

    const [legacy, cls] = await Promise.all([
      Orders.count({ where: { order_no: payment.order_no } }),
      ClsOrder.count({
        where: { order_no: { [Op.like]: `%${payment.order_no}%` } },
      }),
    ]);

    if (legacy === 0 && cls === 0) {
      orphans.push({
        paymentId: payment.id,
        orderNo: payment.order_no,
        amountCents: toCents(payment.total_order_price),
      });
    }
  }

  ok(res, {
    orphans,
    checked: payments.length,
    note:
      'A payment with no matching order is money received against a reference nobody can find. Worth investigating each one.',
  });
});

/** GET /api/admin/enquiries — convenience alias for the enquiry queue. */
adminRoutes.get('/enquiries', async (req: Request, res: Response) => {
  const page = readPage(req);

  const { rows, count } = await Inquiries.findAndCountAll({
    order: [['created', 'DESC']],
    limit: page.limit,
    offset: page.offset,
  });

  paged(
    res,
    'enquiries',
    rows.map((row) => ({
      id: String(row.id),
      name: cleanOr(row.name, ''),
      email: cleanOr(row.email, ''),
      subject: cleanOr(row.subject, ''),
      summary: truncate(clean(row.query), 160),
      status: cleanOr(row.status, 'new'),
      createdAt: toIso(row.created),
    })),
    pageMeta(page, count)
  );
});

/** POST /api/admin/enquiries/:id/convert — turn an enquiry into an order. */
adminRoutes.post(
  '/enquiries/:id/convert',
  validate(z.object({ id: idParam }), 'params'),
  validate(z.object({ orderType: z.coerce.number().int().min(1).max(9) })),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const { orderType } = req.body as { orderType: number };

    const enquiry = await Inquiries.findByPk(id);
    if (!enquiry) throw notFound('We could not find that enquiry.');

    // Matched on email. There is no client id on `tbl_inquiries`, so an enquiry
    // from someone without an account converts to an order with no `client_id` —
    // traceable by its contact address, and linkable once they register.
    const client = clean(enquiry.email)
      ? await UserClient.findOne({
          where: { email: clean(enquiry.email) as string },
          order: [['id', 'ASC']],
        })
      : null;

    const [first, ...rest] = cleanOr(enquiry.name, 'Client').split(' ');
    const now = toLegacyDateTime();

    const order = await ClsOrder.create({
      client_id: client?.id ?? null,
      order_type: orderType,
      contact_first_name: first ?? 'Client',
      contact_last_name: rest.join(' ') || '—',
      contact_email: cleanOr(enquiry.email, ''),
      contact_phone: clean(enquiry.phone),
      status: CLS_ORDER_STATUS.PENDING,
      payment_status: PAYMENT_STATUS.FAILED,
      visa_cls_team_member: currentUserId(req),
      date_last_saved: now,
      date_submitted: now,
      order_no: '',
    });

    await order.update({ order_no: `CLS-${String(order.id).padStart(6, '0')}` });
    await enquiry.update({ status: 'converted', updated: now });

    await audit(req, 'enquiry.convert', {
      enquiryId: id,
      orderId: order.id,
      reference: order.order_no,
    });

    created(res, {
      order: { id: order.id, reference: clean(order.order_no) },
      enquiryId: String(id),
    });
  }
);
