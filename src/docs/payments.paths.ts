import { PAGING, body, f, okList, okObject, operation } from './shared';

/**
 * Recording payments and reading invoices.
 *
 * ## The one place an amount is taken from a request
 *
 * `POST /api/payments/record` reads the amount from its body, and it is the only
 * endpoint in this API that does. That is deliberate: the figure is what Stripe
 * actually captured, which is the authoritative number — and the caller is the
 * website's webhook handler holding a shared secret, not a browser. A browser
 * cannot reach the route, and the website's proxy blocks the path explicitly.
 *
 * Everywhere else, an amount is computed from the fee tables.
 *
 * ## What this schema cannot record
 *
 * There is no refund table and no refund status. `s_paid` is `1=online; 2=by
 * account` with no third value. So a refund is recorded by setting the payment's
 * status to failed and noting the original amount — which is lossy, and the
 * response says so rather than implying a clean refund record.
 */

const tag = 'Payments';

export const paymentPaths = {
  '/api/payments/record': {
    post: operation('/api/payments/record', {
      tag,
      summary: 'Record a payment (server-to-server)',
      description:
        "Called by the website's Stripe webhook after it has verified Stripe's signature. Guarded by `x-internal-secret`, never reachable from a browser, and **idempotent** because Stripe redelivers — a second call with the same `transactionId` is recognised and answers 200 without writing again.\n\nMarks the order paid and writes `tbl_payment`. The amount comes from the body because it is what Stripe captured; see the note at the top of this tag.",
      auth: 'internal',
      body: {
        schema: body(
          {
            reference: f.string('The order reference, from the Stripe session metadata.'),
            transactionId: f.string('Stripe’s id. This is the idempotency key.'),
            amountCents: f.cents('What Stripe actually captured.'),
            currency: f.string('Defaults to AUD.'),
            method: f.int('`s_paid` — 1 is online, 2 is settled against account.'),
            paidAt: f.string('ISO-8601. Defaults to now.'),
          },
          ['reference', 'transactionId', 'amountCents']
        ),
      },
      responses: {
        200: okObject('Recorded, or already recorded', {
          payment: { $ref: '#/components/schemas/Payment' },
          alreadyRecorded: {
            type: 'boolean',
            description: 'True when this transaction had already been written.',
          },
        }),
        404: { $ref: '#/components/responses/NotFound' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/payments/mine': {
    get: operation('/api/payments/mine', {
      tag,
      summary: 'Your own payments',
      description:
        'Joined through `client_id` rather than through the client’s orders, because a payment made before an account existed can still have been linked to it afterwards.',
      auth: 'bearer',
      query: [...PAGING],
      responses: { 200: okList('Your payments', 'payments', 'Payment', true) },
    }),
  },

  '/api/payments/{id}/receipt': {
    get: operation('/api/payments/{id}/receipt', {
      tag,
      summary: 'A receipt for one payment',
      description:
        'Ownership is checked on the payment’s `client_id`. A payment with no client — a guest checkout — has no owner to check against, so it is admin-only.',
      auth: 'bearer',
      responses: {
        200: okObject('The receipt', { receipt: { type: 'object' } }),
      },
    }),
  },

  '/api/invoices/{id}': {
    get: operation('/api/invoices/{id}', {
      tag,
      summary: 'One invoice, ready to print',
      description:
        'One invoice, in the shape a printable document needs. The invoices themselves are assembled rather than stored — see the Portal tag — so this re-derives the client’s set and picks the one asked for. Reading them all to return one is acceptable at a client’s scale and avoids a second, differently-derived definition of an invoice.',
      auth: 'bearer',
      responses: {
        200: okObject('The invoice', {
          invoice: { $ref: '#/components/schemas/Invoice' },
        }),
      },
    }),
  },

  '/api/payments/admin': {
    get: operation('/api/payments/admin', {
      tag,
      summary: 'Every payment, for the back office',
      auth: 'bearer',
      query: [
        {
          name: 'status',
          description: 'Filter by state.',
          enum: ['paid', 'failed', 'pending'],
        },
        { name: 'from', description: 'ISO date. Payments on or after this day.' },
        { name: 'to', description: 'ISO date. Payments on or before this day.' },
        ...PAGING,
      ],
      responses: {
        200: okList('Payments', 'payments', 'Payment', true),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),
  },

  '/api/payments/admin/on-account': {
    post: operation('/api/payments/admin/on-account', {
      tag,
      summary: 'Record a payment settled against a client’s account',
      description:
        'For a corporate client with terms rather than a card. `can_charge_cost_to_account` on the client row is what says they may, and this refuses when they may not — rather than letting a consultant grant credit by accident.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            reference: f.string('The order reference.'),
            amountCents: f.cents(),
            note: f.string('Why, for the audit trail.'),
          },
          ['reference', 'amountCents']
        ),
      },
      responses: {
        201: okObject('Recorded', {
          payment: { $ref: '#/components/schemas/Payment' },
        }),
        403: {
          description: 'That client is not approved for account terms.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Error' } },
          },
        },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/payments/admin/{id}/refund': {
    post: operation('/api/payments/admin/{id}/refund', {
      tag,
      summary: 'Record that a refund happened',
      description:
        '**Records that a refund happened; it does not perform one.** The money moves in Stripe.\n\nThis schema has no refund table and no refund status — `s_paid` is `1=online; 2=by account` with no third value — so the refund is recorded by setting the payment’s status to failed and noting the original amount. That is lossy, and the response says so. A proper refund record needs a column this schema does not have.',
      auth: 'bearer',
      body: {
        schema: body({ reason: f.string('Why the money went back.') }, ['reason']),
      },
      responses: {
        200: okObject('Recorded, with a note on what could not be', {
          payment: { $ref: '#/components/schemas/Payment' },
          warning: {
            type: 'string',
            description: 'How the record is lossy, in words fit to show a consultant.',
          },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },
} as const;
