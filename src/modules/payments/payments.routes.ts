import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Payment, UserClient } from '../../models';
import { authenticate, currentUserId, requireAdmin } from '../../middleware/authenticate';
import { internalOnly } from '../../middleware/requestContext';
import { badRequest, notFound } from '../../shared/errors';
import { created, ok } from '../../shared/http/responses';
import { toIso, toLegacyDateTime } from '../../shared/dates';
import { centsToNumber, formatAud, toCents } from '../../shared/money';
import { clean, fullName, maskEmail } from '../../shared/text';
import { emailField, idParam, validate, validParams } from '../../shared/validation';
import { logger } from '../../shared/logger';
import {
  CLS_ORDER_STATUS,
  PAID_VIA,
  PAYMENT_OPTION,
  PAYMENT_STATUS,
} from '../../domain/codes';
import * as orderService from '../orders/orders.service';

/**
 * Recording payments, and reading them back.
 *
 * ## Why the webhook is not here
 *
 * Stripe's signature has to be verified against the raw request body, and the
 * website already receives the webhook and does that. So the flow is: Stripe →
 * the website's `/api/webhooks/stripe` (verifies the signature) → this API's
 * `POST /api/payments/record` (guarded by a shared secret). Verifying the
 * signature in two places would mean two copies of the Stripe secret.
 *
 * ## Idempotency
 *
 * Stripe redelivers. It redelivers on a timeout, on a non-2xx, and sometimes
 * just because. So `record` looks for an existing row with the same
 * `transaction_id` and returns success without writing a second one. Without
 * that, a retried webhook charges a client's order twice in CLS's records.
 *
 * ## What is deliberately not written
 *
 * `tbl_payment` has `card_number`, `ccv_number`, `card_expiry_month`,
 * `card_expiry_year` and `name_on_card`. **Nothing in this codebase writes or
 * reads them.** Storing a CVV is a straight PCI-DSS violation; the columns are a
 * liability CLS inherited and this API will not add to it. Stripe holds the card
 * and we keep the transaction id.
 */

export const paymentRoutes = Router();

/**
 * `"Alex Taylor"` becomes `{ first: 'Alex', last: 'Taylor' }`.
 *
 * Stripe collects a cardholder's name as one string; `tbl_payment` has `fname`
 * and `lname`. The last whitespace-separated word is taken as the surname and
 * everything before it as the given names — wrong for some names, right for
 * most, and the same split the old application's own forms produce.
 *
 * A single word becomes the first name with no surname rather than the other way
 * round, so a receipt reads "Madonna" and not ", Madonna".
 */
const splitName = (
  value: string | null | undefined
): { first: string | null; last: string | null } => {
  const parts = clean(value)?.split(/\s+/).filter(Boolean) ?? [];

  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0] ?? null, last: null };

  return { first: parts.slice(0, -1).join(' '), last: parts.at(-1) ?? null };
};

const recordSchema = z.object({
  /** Stripe's payment intent or session id. The idempotency key. */
  transactionId: z.string().trim().min(1, 'A transaction id is required').max(255),
  reference: z.string().trim().min(1, 'An order reference is required').max(64),
  amountCents: z.coerce.number().int().min(0),
  currency: z.string().trim().length(3).optional(),
  payer: z
    .object({
      name: z.string().trim().max(225).optional().nullable(),
      email: emailField.optional().nullable(),
      phone: z.string().trim().max(50).optional().nullable(),
    })
    .optional(),
  paidAt: z.string().trim().max(64).optional().nullable(),
});

/**
 * POST /api/payments/record
 *
 * Server-to-server. Marks an order paid and records the payment.
 *
 * The amount is taken from the request here — unlike everywhere else in this
 * API — because it is what Stripe actually captured, and that is the
 * authoritative figure. The caller is the website's webhook handler holding a
 * shared secret, not a browser; a browser cannot reach this route, and the proxy
 * blocks the path explicitly.
 */
paymentRoutes.post(
  '/record',
  internalOnly,
  validate(recordSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof recordSchema>;

    const existing = await Payment.findOne({
      where: { transaction_id: body.transactionId },
    });

    if (existing) {
      // Stripe redelivered. Not an error, and not a second row.
      logger.info('Payment already recorded — ignoring redelivery', {
        transactionId: body.transactionId,
        paymentId: existing.id,
      });

      return ok(res, {
        payment: { id: String(existing.id), duplicate: true },
        message: 'That payment was already recorded.',
      });
    }

    const resolved = await orderService.resolve(body.reference);

    if (!resolved) {
      // Logged loudly: a payment taken against a reference we cannot find is
      // money received with nothing to attach it to, and somebody has to look.
      logger.error('Payment received for an unknown order reference', {
        transactionId: body.transactionId,
        reference: body.reference,
        amountCents: body.amountCents,
      });

      throw notFound(
        'We could not find an order with that reference, so the payment was not recorded.'
      );
    }

    const orderNo =
      resolved.family === 'legacy'
        ? resolved.row.order_no
        : Number.parseInt(/(\d+)$/.exec(body.reference)?.[1] ?? '', 10);

    const client = resolved.clientId
      ? await UserClient.findByPk(resolved.clientId)
      : null;

    const payerName = splitName(body.payer?.name);

    const payment = await Payment.create({
      client_id: resolved.clientId,
      order_no: Number.isSafeInteger(orderNo) ? orderNo : null,
      date_paid: body.paidAt ? toLegacyDateTime(new Date(body.paidAt)) : toLegacyDateTime(),
      // Split rather than dropped whole into `fname`. Stripe sends one `name`
      // and this table has two columns, so writing the full name into `fname`
      // while `lname` still came from the account read back on the receipt as
      // "Alex Taylor Taylor".
      fname: payerName.first ?? clean(client?.fname),
      lname: payerName.last ?? clean(client?.lname),
      email: clean(body.payer?.email) ?? clean(client?.email),
      phone: clean(body.payer?.phone) ?? clean(client?.phone),
      total_order_price: centsToNumber(body.amountCents),
      payment_option: PAYMENT_OPTION.CREDIT_CARD,
      s_paid: PAID_VIA.ONLINE,
      transaction_id: body.transactionId,
      payment_status: PAYMENT_STATUS.COMPLETE,
      // Card columns deliberately left null. See the note at the top.
    });

    // Move the order's own payment flag, so CLS's screens show it as paid.
    if (resolved.family === 'cls') {
      await resolved.row.update({
        payment_status: PAYMENT_STATUS.COMPLETE,
        status: resolved.row.status ?? CLS_ORDER_STATUS.PENDING,
      });
    } else {
      const { LEGACY_ORDER_STATUS } = await import('../../domain/codes');

      // Only forward. An order already marked complete must not be dragged back
      // to "paid" by a webhook arriving late.
      if ((resolved.row.status ?? 0) < LEGACY_ORDER_STATUS.PAID) {
        await resolved.row.update({ status: LEGACY_ORDER_STATUS.PAID });
      }
    }

    logger.info('Payment recorded', {
      paymentId: payment.id,
      reference: body.reference,
      amountCents: body.amountCents,
      family: resolved.family,
    });

    return created(res, {
      payment: {
        id: String(payment.id),
        reference: body.reference,
        amountCents: body.amountCents,
        duplicate: false,
      },
    });
  }
);

// ---------------------------------------------------------------------------
// Reading payments
// ---------------------------------------------------------------------------

const toReceipt = (payment: Payment, reference: string) => ({
  id: String(payment.id),
  receiptNumber: `RCP-${String(payment.id).padStart(6, '0')}`,
  reference,
  transactionId: clean(payment.transaction_id),
  paidAt: toIso(payment.date_paid),
  amountCents: toCents(payment.total_order_price),
  amountFormatted: formatAud(toCents(payment.total_order_price)),
  method: payment.payment_option === PAYMENT_OPTION.CREDIT_CARD ? 'card' : 'account',
  status: payment.payment_status === PAYMENT_STATUS.COMPLETE ? 'complete' : 'failed',
  payer: {
    name: fullName(payment.fname, payment.lname),
    email: maskEmail(payment.email),
  },
});

/**
 * GET /api/payments/mine
 *
 * A client's own payments. Joined through `client_id` rather than through their
 * orders, because a payment made before an account existed can still have been
 * linked to it afterwards.
 */
paymentRoutes.get('/mine', authenticate, async (req: Request, res: Response) => {
  const rows = await Payment.findAll({
    where: { client_id: currentUserId(req) },
    order: [['date_paid', 'DESC']],
    limit: 100,
  });

  ok(res, {
    payments: rows.map((row) => toReceipt(row, String(row.order_no ?? '—'))),
  });
});

/**
 * GET /api/payments/:id/receipt
 *
 * Ownership is checked on the payment's `client_id`. A payment with no client —
 * a guest checkout — has no owner to check against, so it is admin-only.
 */
paymentRoutes.get(
  '/:id/receipt',
  authenticate,
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const payment = await Payment.findByPk(id);

    if (!payment) throw notFound('We could not find that receipt.');

    const isAdmin = req.auth?.aud === 'admin';
    const isOwner =
      payment.client_id !== null && payment.client_id === currentUserId(req);

    if (!isAdmin && !isOwner) throw notFound('We could not find that receipt.');

    ok(res, { receipt: toReceipt(payment, String(payment.order_no ?? '—')) });
  }
);

// ---------------------------------------------------------------------------
// Back office
// ---------------------------------------------------------------------------

const adminPaymentRoutes = Router();

adminPaymentRoutes.use(authenticate, requireAdmin);

/**
 * POST /api/payments/admin/on-account
 *
 * Records a payment settled against a client's account rather than by card.
 * `can_charge_cost_to_account` on the client row is what says they may — a
 * corporate client with terms — and this refuses when they may not, rather than
 * letting a consultant grant credit by accident.
 */
adminPaymentRoutes.post(
  '/on-account',
  validate(
    z.object({
      reference: z.string().trim().min(1).max(64),
      amountCents: z.coerce.number().int().positive(),
      note: z.string().trim().max(2000).optional(),
    })
  ),
  async (req: Request, res: Response) => {
    const body = req.body as {
      reference: string;
      amountCents: number;
      note?: string;
    };

    const resolved = await orderService.resolve(body.reference);
    if (!resolved) throw notFound('We could not find an order with that reference.');

    const client = resolved.clientId
      ? await UserClient.findByPk(resolved.clientId)
      : null;

    if (!client || client.can_charge_cost_to_account !== 1) {
      throw badRequest(
        'That client is not set up to charge costs to an account. Take payment by card, or enable account terms on their record first.'
      );
    }

    const orderNo =
      resolved.family === 'legacy'
        ? resolved.row.order_no
        : Number.parseInt(/(\d+)$/.exec(body.reference)?.[1] ?? '', 10);

    const payment = await Payment.create({
      client_id: client.id,
      order_no: Number.isSafeInteger(orderNo) ? orderNo : null,
      date_paid: toLegacyDateTime(),
      fname: clean(client.fname),
      lname: clean(client.lname),
      email: clean(client.email),
      account_no: clean(client.account_no),
      total_order_price: centsToNumber(body.amountCents),
      payment_option: PAYMENT_OPTION.ON_ACCOUNT,
      s_paid: PAID_VIA.ON_ACCOUNT,
      // No Stripe id, so one is synthesised to keep the idempotency check
      // meaningful for these too.
      transaction_id: `ACCT-${client.id}-${Date.now()}`,
      payment_status: PAYMENT_STATUS.COMPLETE,
    });

    if (resolved.family === 'cls') {
      await resolved.row.update({ payment_status: PAYMENT_STATUS.COMPLETE });
    }

    logger.info('On-account payment recorded', {
      paymentId: payment.id,
      clientId: client.id,
      reference: body.reference,
      by: currentUserId(req),
      note: body.note,
    });

    created(res, { payment: toReceipt(payment, body.reference) });
  }
);

/**
 * POST /api/payments/admin/:id/refund
 *
 * Records that a refund happened; it does not perform one. The money moves in
 * Stripe, and this schema has no refund table and no refund status — `s_paid` is
 * `1=online; 2=by account` with no third value — so the refund is recorded by
 * setting the payment's status to failed and noting the original amount.
 *
 * That is lossy, and the response says so. A proper refund record needs a column
 * this schema does not have.
 */
adminPaymentRoutes.post(
  '/:id/refund',
  validate(z.object({ id: idParam }), 'params'),
  validate(
    z.object({
      amountCents: z.coerce.number().int().positive().optional(),
      reason: z.string().trim().max(2000).optional(),
    })
  ),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = req.body as { amountCents?: number; reason?: string };

    const payment = await Payment.findByPk(id);
    if (!payment) throw notFound('We could not find that payment.');

    const originalCents = toCents(payment.total_order_price);

    await payment.update({ payment_status: PAYMENT_STATUS.FAILED });

    logger.warn('Refund recorded', {
      paymentId: id,
      originalCents,
      refundedCents: body.amountCents ?? originalCents,
      reason: body.reason,
      by: currentUserId(req),
    });

    ok(res, {
      payment: toReceipt(payment, String(payment.order_no ?? '—')),
      note:
        'Recorded by marking the payment unsuccessful. This schema has no refund table or refund status, so the refunded amount and reason exist only in the server log — process the refund itself in Stripe.',
    });
  }
);

/** GET /api/payments/admin — every payment, newest first. */
adminPaymentRoutes.get('/', async (_req: Request, res: Response) => {
  const rows = await Payment.findAll({
    order: [['date_paid', 'DESC']],
    limit: 200,
  });

  ok(res, {
    payments: rows.map((row) => toReceipt(row, String(row.order_no ?? '—'))),
  });
});

paymentRoutes.use('/admin', adminPaymentRoutes);

// ---------------------------------------------------------------------------
// Invoices, printable
// ---------------------------------------------------------------------------

export const invoiceRoutes = Router();

invoiceRoutes.use(authenticate);

/**
 * GET /api/invoices/:id
 *
 * One invoice, in the shape a printable document needs. The invoices themselves
 * are assembled rather than stored — see `portal.presenter` — so this re-derives
 * the client's set and picks the one asked for. Reading them all to return one is
 * acceptable at a client's scale and avoids a second, differently-derived
 * definition of an invoice.
 */
invoiceRoutes.get(
  '/:id',
  validate(z.object({ id: z.string().trim().min(1).max(64) }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: string }>(req);
    const { invoices } = await import('../portal/portal.service');

    const all = await invoices(currentUserId(req));
    const invoice = all.find((candidate) => candidate.id === id);

    if (!invoice) throw notFound('We could not find that invoice.');

    const client = await UserClient.findByPk(currentUserId(req));

    ok(res, {
      invoice: {
        ...invoice,
        amountFormatted: formatAud(invoice.amountCents),
        billTo: {
          name: fullName(client?.fname, client?.lname),
          company: clean(client?.company),
          accountNumber: clean(client?.display_id) ?? clean(client?.account_no),
          address: {
            line1: clean(client?.mba_address) ?? clean(client?.address),
            city: clean(client?.mba_city) ?? clean(client?.city),
            state: clean(client?.mba_state) ?? clean(client?.state),
            postcode: clean(client?.mba_postcode) ?? clean(client?.postcode),
          },
        },
        issuer: {
          name: 'Capital Link Services',
          abn: null,
        },
      },
    });
  }
);
