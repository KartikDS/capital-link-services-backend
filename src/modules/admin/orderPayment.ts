import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ClsOrder,
  OrderTravellerDetails,
  Payment,
  PoliceClearances,
  RussianVisaVoucherTypes,
  UserClient,
} from '../../models';
import { ok } from '../../shared/http/responses';
import { badRequest, conflict, notFound } from '../../shared/errors';
import { toIso, toLegacyDateTime } from '../../shared/dates';
import { centsToNumber, toCents } from '../../shared/money';
import { clean, fullName } from '../../shared/text';
import { idParam, validate, validParams } from '../../shared/validation';
import {
  CLS_ORDER_STATUS,
  ORDER_TYPE_LABEL,
  PAID_VIA,
  PAYMENT_OPTION,
  PAYMENT_STATUS,
} from '../../domain/codes';
import { orderReference } from '../../domain/orderReference';

/**
 * The payment actions every admin order screen shares: Order Status, Payment
 * Status, Account Number, **Pay Now**, **Send Invoice** and **Reprint Invoice**.
 *
 * Built once, for the Russian visa voucher screen, and meant to be reused as it is
 * by the police clearance screen (and anything after it): nothing below knows
 * about a voucher. The only service-specific thing is the invoice's description
 * line, and that is derived from the order's own catalogue row.
 *
 * ## The stable API (do not rename — add)
 *
 * All paths are under `/api/admin/orders/:id/payment`, admin-guarded, and work for
 * **any** `tbl_cls_order` order (a 404 for a missing one). Every write is audited.
 *
 * | Method + path          | What it is                                                                  |
 * |------------------------|-----------------------------------------------------------------------------|
 * | `GET   /payment`        | `{ payment: AdminPaymentState }` — what the Payment Details panel shows    |
 * | `PATCH /payment/status` | `{ orderStatus?, paymentStatus?, accountNumber? }` — the Update button      |
 * | `POST  /payment/pay-now`| `{ method, accountNumber?, amountCents?, payer? }` → `{ payment, notification }` |
 * | `GET   /payment/invoice`| `{ invoice }` — everything the invoice email and the printable page need   |
 *
 * The browser side is `components/admin/orderScreen/AdminPaymentActions.tsx`, whose
 * props are `{ orderId, payment, serviceLabel }` — `payment` being the
 * `AdminPaymentState` this module returns, which a screen's own GET embeds by
 * calling `readPaymentState`.
 *
 * ## What each button does, and what it does not
 *
 * **Order Status / Payment Status** — `tbl_cls_order.status` and the newest
 * `tbl_payment.s_paid`, one audit line per value that actually changed (legacy
 * `updateStatus`). With no payment row there is nothing to set `s_paid` on, so the
 * payment select is refused (409) rather than half-saving.
 *
 * **Account Number** — the client's `tbl_user_client.account_no`, the number Pay
 * Now checks an on-account payment against. The legacy field sat in the same form.
 *
 * **Pay Now** — the legacy "Process Payment" screen offered three payment types:
 * on account, credit card (keyed into eWAY by staff) and "marked as paid". The
 * first and last are here. **Card is deliberately not**: this system holds no
 * card details and has no gateway call that takes them — a card is paid by the
 * client at the secure checkout, and the screen says so and points at Send
 * Invoice. Both of the other two reproduce the legacy rules: on account needs the
 * client to have account terms and the typed number to equal theirs ("You are not
 * allowed to Pay on Account!" / "Account number is not correct!").
 *
 * **Send Invoice / Reprint Invoice** — the legacy invoice was a PDF rendered from
 * `invoice_template.html.twig` by dompdf. Neither dompdf nor that template is in
 * this codebase, so the invoice is the portal's own tax-invoice document
 * (`PortalInvoiceDocument`): Reprint opens it printable, Send Invoice emails the
 * invoice figures. This endpoint returns the data; mail is sent by the website
 * (the backend has no mailer).
 */

export type PaymentAudit = (
  req: Request,
  action: string,
  detail: Record<string, unknown>
) => Promise<void>;

/** `tbl_payment.s_paid` as the screen's select knows it. */
export type AdminPaidVia = 0 | 1 | 2;

export interface AdminPaymentState {
  orderId: number;
  orderNo: string;
  reference: string;
  /** `tbl_cls_order.status`. */
  orderStatus: 0 | 1 | 2;
  /** The newest `tbl_payment.s_paid`; null when the order has no payment row. */
  paymentStatus: AdminPaidVia | null;
  hasPayment: boolean;
  clientId: number | null;
  /** `tbl_user_client.account_no` — the Account Number field. */
  accountNumber: string | null;
  /** `can_charge_cost_to_account`. */
  canChargeToAccount: boolean;
  /** `tbl_cls_order.total_fee`, cents; null when the order is not priced. */
  totalCents: number | null;
  paidCents: number | null;
  paidAt: string | null;
  transactionId: string | null;
  /** Where the client's invoice and receipts go. */
  clientEmail: string | null;
  /** The Pay Now form's starting values. */
  payer: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null };
}

export interface AdminPayNowNotification {
  orderId: number;
  orderNo: string;
  reference: string;
  service: string;
  payerName: string | null;
  payerEmail: string | null;
  amountCents: number;
  method: 'account' | 'marked-paid';
  accountNumber: string | null;
  paidAt: string | null;
  transactionId: string | null;
}

export interface AdminInvoiceData {
  invoice: {
    id: string;
    number: string;
    reference: string;
    service: string;
    issuedAt: string | null;
    dueAt: string | null;
    amountCents: number;
    state: 'paid' | 'due';
    lines: {
      description: string;
      quantity: number;
      unitCents: number;
      gstCents: number;
      totalCents: number;
    }[];
    itemised: false;
  };
  payments: {
    id: string;
    transactionId: string | null;
    paidAt: string | null;
    amountCents: number;
    status: 'complete' | 'failed';
    method: 'card' | 'account';
  }[];
  /** The client the invoice is to, and where it is sent. */
  billTo: {
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    accountNumber: string | null;
    address: { line1: string | null; city: string | null; state: string | null; postcode: string | null };
    billing: { line1: string | null; city: string | null; state: string | null; postcode: string | null };
  };
  applicant: string | null;
  orderNo: string;
}

const asStatus = (value: number | null): 0 | 1 | 2 =>
  value === 1 ? 1 : value === 2 ? 2 : 0;

const asPaidVia = (value: number | null): AdminPaidVia | null =>
  value === null ? null : value === 1 ? 1 : value === 2 ? 2 : 0;

const orderNoOf = (order: ClsOrder): string => clean(order.order_no) ?? String(order.id);

const newestPayment = (orderId: number): Promise<Payment | null> =>
  Payment.findOne({ where: { order_no: orderId }, order: [['date_paid', 'DESC']] });

/** The order, or a 404. Any service. */
export const loadAnyOrder = async (id: number): Promise<ClsOrder> => {
  const order = await ClsOrder.findByPk(id);
  if (!order) throw notFound('We could not find that order.');
  return order;
};

/** Everything the Payment Details panel renders. Exported for the screens' own GETs. */
export const readPaymentState = async (order: ClsOrder): Promise<AdminPaymentState> => {
  const [client, payment] = await Promise.all([
    order.client_id ? UserClient.findByPk(order.client_id) : null,
    newestPayment(order.id),
  ]);

  return {
    orderId: order.id,
    orderNo: orderNoOf(order),
    reference: orderReference(order.id),
    orderStatus: asStatus(order.status),
    paymentStatus: payment ? asPaidVia(payment.s_paid) : null,
    hasPayment: payment !== null,
    clientId: order.client_id,
    accountNumber: clean(client?.account_no),
    canChargeToAccount: client?.can_charge_cost_to_account === 1,
    totalCents: toCents(order.total_fee),
    paidCents:
      payment && payment.payment_status === PAYMENT_STATUS.COMPLETE
        ? toCents(payment.total_order_price)
        : null,
    paidAt: payment ? toIso(payment.date_paid) : null,
    transactionId: clean(payment?.transaction_id),
    clientEmail: clean(client?.email) ?? clean(order.contact_email),
    payer: {
      firstName: clean(payment?.fname) ?? clean(order.contact_first_name),
      lastName: clean(payment?.lname) ?? clean(order.contact_last_name),
      email: clean(payment?.email) ?? clean(order.contact_email) ?? clean(client?.email),
      phone: clean(payment?.phone) ?? clean(order.contact_phone),
    },
  };
};

const PAID_VIA_LABEL: Record<number, string> = {
  0: 'pending',
  1: 'paid online',
  2: 'paid by account',
};

const statusSchema = z.object({
  orderStatus: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  paymentStatus: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  accountNumber: z.string().trim().max(50).optional(),
});

const payNowSchema = z.object({
  method: z.enum(['account', 'marked-paid']),
  accountNumber: z.string().trim().max(50).optional(),
  amountCents: z.coerce.number().int().positive().max(100_000_000).optional(),
  payer: z
    .object({
      firstName: z.string().trim().max(255).optional(),
      lastName: z.string().trim().max(255).optional(),
      email: z.string().trim().max(255).optional(),
      phone: z.string().trim().max(64).optional(),
    })
    .optional(),
});

/** What the invoice's one line says the client is paying for. */
const describeService = async (order: ClsOrder): Promise<string> => {
  const base = order.order_type ? (ORDER_TYPE_LABEL[order.order_type] ?? null) : null;
  const label = base ?? 'Capital Link Services order';

  if (order.russian_visa_voucher_id) {
    const voucher = await RussianVisaVoucherTypes.findByPk(order.russian_visa_voucher_id);
    const name = clean(voucher?.name);
    if (name) return `${label} — ${name}`;
  }

  if (order.police_clearance_id) {
    const clearance = await PoliceClearances.findByPk(order.police_clearance_id);
    const name = clean(clearance?.name);
    if (name) return `${label} — ${name}`;
  }

  return label;
};

export const orderPaymentRoutes = (audit: PaymentAudit): Router => {
  const router = Router();
  const idParams = validate(z.object({ id: idParam }), 'params');

  router.get('/:id/payment', idParams, async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    ok(res, { payment: await readPaymentState(await loadAnyOrder(id)) });
  });

  router.patch(
    '/:id/payment/status',
    idParams,
    validate(statusSchema),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const body = req.body as z.infer<typeof statusSchema>;

      const order = await loadAnyOrder(id);

      // Resolved first so a refusal leaves nothing half-written: the legacy form
      // saved the order status, then fatalled on a missing payment row.
      const payment = body.paymentStatus !== undefined ? await newestPayment(id) : null;
      if (body.paymentStatus !== undefined && !payment) {
        throw conflict('This order has no payment record to update.');
      }

      const client =
        body.accountNumber !== undefined && order.client_id
          ? await UserClient.findByPk(order.client_id)
          : null;
      if (body.accountNumber !== undefined && !client) {
        throw conflict('This order has no client account to hold an account number.');
      }

      if (body.orderStatus !== undefined && body.orderStatus !== order.status) {
        const previous = order.status;
        await order.update({
          status: body.orderStatus,
          date_last_saved: toLegacyDateTime(),
        });
        await audit(req, 'order.status', { orderId: id, from: previous, to: body.orderStatus });
      }

      if (payment && body.paymentStatus !== undefined && body.paymentStatus !== payment.s_paid) {
        const previous = payment.s_paid;
        await payment.update({ s_paid: body.paymentStatus });
        await audit(req, 'order.payment-status', {
          orderId: id,
          from: previous,
          to: body.paymentStatus,
          label: PAID_VIA_LABEL[body.paymentStatus],
        });
      }

      if (client && body.accountNumber !== undefined) {
        const next = clean(body.accountNumber);
        if (next !== clean(client.account_no)) {
          await client.update({ account_no: next });
          await audit(req, 'client.update', { clientId: client.id, accountNumber: next });
        }
      }

      ok(res, { payment: await readPaymentState(order) });
    }
  );

  router.post(
    '/:id/payment/pay-now',
    idParams,
    validate(payNowSchema),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const body = req.body as z.infer<typeof payNowSchema>;

      const order = await loadAnyOrder(id);
      const state = await readPaymentState(order);

      if (state.paidCents !== null && state.paymentStatus !== 0) {
        throw conflict(
          'This order is already recorded as paid. Use Payment Status if that record needs correcting.'
        );
      }

      const amountCents = body.amountCents ?? state.totalCents;
      if (!amountCents || amountCents <= 0) {
        throw badRequest(
          'This order has no price to take payment for. Enter the amount being paid.'
        );
      }

      const client = order.client_id ? await UserClient.findByPk(order.client_id) : null;

      if (body.method === 'account') {
        // The legacy rules and wording, in the legacy order.
        if (!client || client.can_charge_cost_to_account !== 1) {
          throw badRequest('You are not allowed to Pay on Account!');
        }
        if (clean(body.accountNumber) !== clean(client.account_no)) {
          throw badRequest('Account number is not correct!');
        }
      }

      const payer = {
        firstName: clean(body.payer?.firstName) ?? state.payer.firstName,
        lastName: clean(body.payer?.lastName) ?? state.payer.lastName,
        email: clean(body.payer?.email) ?? state.payer.email,
        phone: clean(body.payer?.phone) ?? state.payer.phone,
      };

      const now = toLegacyDateTime();
      const transactionId = `${body.method === 'account' ? 'ACCT' : 'MANUAL'}-${id}-${Date.now()}`;

      // An existing row (the legacy created one when the order was started) is
      // completed rather than duplicated — the legacy did the same.
      const existing = await newestPayment(id);
      const values = {
        date_paid: now,
        fname: payer.firstName,
        lname: payer.lastName,
        email: payer.email,
        phone: payer.phone,
        total_order_price: centsToNumber(amountCents),
        payment_option: PAYMENT_OPTION.ON_ACCOUNT,
        s_paid: PAID_VIA.ON_ACCOUNT,
        payment_status: PAYMENT_STATUS.COMPLETE,
        transaction_id: transactionId,
        account_no: body.method === 'account' ? clean(body.accountNumber) : null,
      };

      const payment = existing
        ? await existing.update(values)
        : await Payment.create({
            ...values,
            client_id: order.client_id,
            order_no: id,
          });

      // The same forward-only placement `payments/record` does for a card payment:
      // an unplaced order becomes placed, one a consultant has moved on is left.
      await order.update({
        payment_status: PAYMENT_STATUS.COMPLETE,
        ...(order.status === CLS_ORDER_STATUS.PENDING || order.status === null
          ? { status: CLS_ORDER_STATUS.COMPLETED }
          : {}),
        ...(order.date_submitted ? {} : { date_submitted: now }),
        date_last_saved: now,
      });

      await audit(req, 'order.pay-now', {
        orderId: id,
        method: body.method,
        amountCents,
        paymentId: payment.id,
      });

      const notification: AdminPayNowNotification = {
        orderId: id,
        orderNo: orderNoOf(order),
        reference: orderReference(id),
        service: await describeService(order),
        payerName: fullName(payer.firstName, payer.lastName) || null,
        payerEmail: payer.email,
        amountCents,
        method: body.method,
        accountNumber: clean(payment.account_no),
        paidAt: toIso(payment.date_paid),
        transactionId,
      };

      ok(res, { payment: await readPaymentState(order), notification });
    }
  );

  router.get('/:id/payment/invoice', idParams, async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const order = await loadAnyOrder(id);

    const amountCents = toCents(order.total_fee);
    if (!amountCents) {
      throw conflict(
        'This order has no price, so there is no invoice to send. Set the price first.'
      );
    }

    const [client, payments, traveller, service] = await Promise.all([
      order.client_id ? UserClient.findByPk(order.client_id) : null,
      Payment.findAll({ where: { order_no: id }, order: [['date_paid', 'ASC']] }),
      OrderTravellerDetails.findOne({ where: { order_id: id, is_primary: 1 } }),
      describeService(order),
    ]);

    const settled = payments.some((row) => row.payment_status === PAYMENT_STATUS.COMPLETE);
    const issuedAt = toIso(order.date_submitted);

    const data: AdminInvoiceData = {
      invoice: {
        id: `ord-${orderReference(id)}`,
        number: orderReference(id),
        reference: orderReference(id),
        service,
        issuedAt,
        dueAt: null,
        amountCents,
        state: settled || order.payment_status === PAYMENT_STATUS.COMPLETE ? 'paid' : 'due',
        lines: [
          {
            description: service,
            quantity: 1,
            unitCents: amountCents,
            gstCents: 0,
            totalCents: amountCents,
          },
        ],
        itemised: false,
      },
      payments: payments.map((row) => ({
        id: String(row.id),
        transactionId: clean(row.transaction_id),
        paidAt: toIso(row.date_paid),
        amountCents: toCents(row.total_order_price) ?? 0,
        status: row.payment_status === PAYMENT_STATUS.COMPLETE ? 'complete' : 'failed',
        method: row.payment_option === PAYMENT_OPTION.CREDIT_CARD ? 'card' : 'account',
      })),
      billTo: {
        firstName: clean(client?.fname) ?? clean(order.contact_first_name),
        lastName: clean(client?.lname) ?? clean(order.contact_last_name),
        company: clean(client?.company),
        email: clean(client?.email) ?? clean(order.contact_email),
        phone: clean(client?.phone) ?? clean(order.contact_phone),
        mobile: clean(client?.mobile),
        accountNumber: clean(client?.display_id) ?? clean(client?.account_no),
        address: {
          line1: clean(client?.address),
          city: clean(client?.city),
          state: clean(client?.state),
          postcode: clean(client?.postcode),
        },
        billing: {
          line1: clean(client?.mba_address),
          city: clean(client?.mba_city),
          state: clean(client?.mba_state),
          postcode: clean(client?.mba_postcode),
        },
      },
      applicant: traveller ? fullName(traveller.first_name, traveller.last_name) || null : null,
      orderNo: orderNoOf(order),
    };

    ok(res, { invoice: data });
  });

  return router;
};
