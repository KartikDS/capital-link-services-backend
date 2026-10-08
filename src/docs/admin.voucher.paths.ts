import { body, f, okObject, operation } from './shared';

/**
 * The Russian visa voucher order screen, and the payment actions the order screens
 * share. Staff tokens only. Kept apart from `admin.paths.ts` so the screens can be
 * documented without editing that file while others do.
 *
 * The payment routes work for **any** order (`tbl_cls_order`); the voucher routes
 * for Russian visa voucher orders only. See `modules/admin/orderPayment.ts` and
 * `modules/admin/russianVoucherOrder.ts`.
 */

const tag = 'Admin';

export const adminVoucherPaths = {
  '/api/admin/orders/{id}/voucher': {
    get: operation('/api/admin/orders/{id}/voucher', {
      tag,
      summary: 'Everything the Russian Visa Voucher order screen renders',
      description:
        'Counterpart of `GET /api/admin/orders/{id}/detail` for **Russian visa voucher orders only** (`order_type` 8; any other order is a 404). Reproduces the legacy `viewRussianVisaVoucherAction`: the four Order Progress stamps, cities, hotels, “Visa to be applied at”, Applicant Details, Passport File and Comment, Employment Details and Payment Details — plus every field the new order journey stores (plan and processing speed, fee, second/multiple entry dates, order contact, totals) and the documents the client attached.\n\nThe legacy screen was read-only apart from the four stamps; so is this. `payment` is the shared `AdminPaymentState` (see `/api/admin/orders/{id}/payment`).',
      auth: 'bearer',
      responses: {
        200: okObject('The screen', { voucher: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/voucher/progress': {
    patch: operation('/api/admin/orders/{id}/voucher/progress', {
      tag,
      summary: 'Order Progress → Submit — the four milestone stamps',
      description:
        'Each stamp is an ISO-8601 instant, a naive `YYYY-MM-DDTHH:mm[:ss]` (Sydney wall-clock) or `\'\'` to clear; absent means unchanged. Nothing is written when no stamp differs from the stored one.\n\n`notification.scantype` is the **first** changed stamp in the legacy priority order (`first` received, `second` submitted, `third` completed, `fourth` closed) — or `\'\'`; the website uses it to email the client. Clearing a stamp is not a milestone. Newly setting the closed stamp moves the order to status 2.',
      auth: 'bearer',
      body: {
        schema: body({
          allItemsReceivedAtCLS: f.string('All items received at CLS.'),
          submittedForProcessing: f.string('Submitted for processing.'),
          completedReceivedAtCLS: f.string('Completed & received at CLS.'),
          orderOnRouteAndClosed: f.string('Order on route and closed.'),
        }),
      },
      responses: {
        200: okObject('Saved', {
          saved: { type: 'boolean' },
          stamps: { type: 'object' },
          notification: { type: 'object' },
        }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/voucher/documents/{documentId}/file': {
    get: operation('/api/admin/orders/{id}/voucher/documents/{documentId}/file', {
      tag,
      summary: 'Stream a file the client attached to a voucher order',
      description:
        'A `tbl_cls_order_documents` row of this order (the passport scan the journey uploads lands here). Ownership is checked against the order. Admin only.',
      auth: 'bearer',
      responses: {
        200: { description: 'The file' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/payment': {
    get: operation('/api/admin/orders/{id}/payment', {
      tag,
      summary: 'The Payment Details panel — status, account number, amounts',
      description:
        'Shared by every order screen; any `tbl_cls_order` order. `paymentStatus` is the newest `tbl_payment.s_paid` (0 pending, 1 online, 2 by account), null when the order has no payment row.',
      auth: 'bearer',
      responses: {
        200: okObject('The state', { payment: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/payment/status': {
    patch: operation('/api/admin/orders/{id}/payment/status', {
      tag,
      summary: 'Order Status, Payment Status and Account Number',
      description:
        'Any of the three. One audit line per value that changed. A `paymentStatus` on an order with no payment row is a 409 and nothing is saved. `accountNumber` is the client’s `tbl_user_client.account_no`.',
      auth: 'bearer',
      body: {
        schema: body({
          orderStatus: { type: 'integer', enum: [0, 1, 2], description: 'Pending, Completed, CLS Confirmed.' },
          paymentStatus: { type: 'integer', enum: [0, 1, 2], description: 'Pending, Paid - Online, Paid - By Account.' },
          accountNumber: f.string('The client’s account number; empty clears it.'),
        }),
      },
      responses: {
        200: okObject('Saved', { payment: { type: 'object' } }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { description: 'The order has no payment record to set a status on.' },
      },
    }),
  },

  '/api/admin/orders/{id}/payment/pay-now': {
    post: operation('/api/admin/orders/{id}/payment/pay-now', {
      tag,
      summary: 'Pay Now — record a payment taken by staff',
      description:
        '`method: "account"` needs a client with account terms and an `accountNumber` equal to theirs (“You are not allowed to Pay on Account!” / “Account number is not correct!”). `method: "marked-paid"` records the order as paid without an account check. **Card payments are not taken here** — this system holds no card details; the client pays by card at the secure checkout. An existing payment row is completed, not duplicated; an order already recorded as paid is a 409. Amount defaults to the order total.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            method: { type: 'string', enum: ['account', 'marked-paid'] },
            accountNumber: f.string(),
            amountCents: f.cents('Defaults to the order total.'),
            payer: { type: 'object', description: 'firstName, lastName, email, phone — default to the order contact.' },
          },
          ['method']
        ),
      },
      responses: {
        200: okObject('Recorded', { payment: { type: 'object' }, notification: { type: 'object' } }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { description: 'Already recorded as paid.' },
      },
    }),
  },

  '/api/admin/orders/{id}/payment/invoice': {
    get: operation('/api/admin/orders/{id}/payment/invoice', {
      tag,
      summary: 'The invoice data — for Send Invoice and Reprint Invoice',
      description:
        'The order’s invoice in the portal’s own shape (a single line for the order total — there is no invoice table), its payments and the client it is billed to. An order with no price is a 409: there is nothing to invoice.',
      auth: 'bearer',
      responses: {
        200: okObject('The invoice', { invoice: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
        409: { description: 'The order has no price, so there is no invoice.' },
      },
    }),
  },
} as const;
