import { PAGING, body, f, okList, okObject, operation } from './shared';

/**
 * The back office. Staff tokens only.
 *
 * `requireAdmin` is applied to the router itself, so every route here refuses a
 * client token with 403 rather than each handler remembering to check.
 *
 * ## The queue is `tbl_cls_order` only
 *
 * A legacy order is readable one at a time through `/api/orders/{reference}`, but it
 * is not in this queue: an order placed through the old application is worked in the
 * old application, and showing it here would put the same job in two systems with
 * two sets of controls.
 *
 * ## What staff can and cannot set
 *
 * `POST /api/admin/orders/{reference}/quote` is the one place in this API where a
 * staff member sets an amount by hand — legalisation has no published rate, which is
 * why `tbl_order_dl_quotes` exists. Everywhere else an amount is computed from the
 * fee tables, for staff and clients alike.
 */

const tag = 'Admin';

export const adminPaths = {
  '/api/admin/dashboard': {
    get: operation('/api/admin/dashboard', {
      tag,
      summary: 'The back office figures',
      description:
        'Counts rather than lists. Each is a `COUNT(*)` with a `WHERE`, run in parallel — which is cheap even against five years of rows, and much cheaper than pulling the rows back to count them here.',
      auth: 'bearer',
      responses: {
        200: okObject('The figures', { dashboard: { type: 'object' } }),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),
  },

  '/api/admin/orders': {
    get: operation('/api/admin/orders', {
      tag,
      summary: 'The work queue',
      description:
        'The work queue, from `tbl_cls_order` only — see the note at the top of this tag for why the legacy table is excluded.',
      auth: 'bearer',
      query: [
        {
          name: 'status',
          description: 'Filter on `tbl_cls_order.status`.',
          type: 'integer',
        },
        { name: 'assignedTo', description: '`tbl_user_admin.id`.', type: 'integer' },
        { name: 'service', description: 'Filter by order type.' },
        { name: 'search', description: 'Matches reference, contact name or email.' },
        ...PAGING,
      ],
      responses: {
        200: okList('The queue', 'orders', 'Order', true),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),
  },

  '/api/admin/orders/export': {
    get: operation('/api/admin/orders/export', {
      tag,
      summary: 'Export the queue as CSV',
      description:
        'CSV, streamed as a download. **Capped at 5,000 rows**: an unbounded export of a table with five years of orders would hold a pooled connection for the length of the download and buffer the result in this process’s memory first.',
      auth: 'bearer',
      query: [
        {
          name: 'status',
          description: 'Filter on `tbl_cls_order.status`.',
          type: 'integer',
        },
        { name: 'from', description: 'ISO date. Orders placed on or after this day.' },
        { name: 'to', description: 'ISO date. Orders placed on or before this day.' },
      ],
      responses: {
        200: {
          description: 'The CSV',
          content: { 'text/csv': { schema: { type: 'string' } } },
        },
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),
  },

  '/api/admin/orders/{id}/assign': {
    patch: operation('/api/admin/orders/{id}/assign', {
      tag,
      summary: 'Assign an order to a consultant',
      description:
        'Sets the consultant the client’s portal then shows as handling their order. Pass `null` to unassign.',
      auth: 'bearer',
      body: {
        schema: body({ consultantId: f.id('`tbl_user_admin.id`. Null to unassign.') }, [
          'consultantId',
        ]),
      },
      responses: {
        200: okObject('Assigned', { order: { $ref: '#/components/schemas/Order' } }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/admin/orders/{id}/status': {
    patch: operation('/api/admin/orders/{id}/status', {
      tag,
      summary: 'Change an order’s status',
      description:
        'Only the three values `tbl_cls_order.status` documents. A status outside that set would be a number the old application does not recognise, and it reads the same column.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            status: {
              type: 'integer',
              enum: [1, 2, 3],
              description:
                'The three values the column documents. Nothing else is accepted.',
            },
          },
          ['status']
        ),
      },
      responses: {
        200: okObject('Updated', { order: { $ref: '#/components/schemas/Order' } }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/admin/orders/{id}/milestone': {
    patch: operation('/api/admin/orders/{id}/milestone', {
      tag,
      summary: 'Stamp a milestone date',
      description:
        'Stamps one of the four milestone dates on whichever detail table the order has. **The progress bar a client sees is counted from these**, so this is the endpoint that moves it — there is no separate progress column to set.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            milestone: {
              type: 'string',
              enum: ['received', 'lodged', 'processing', 'returned'],
              description: 'Which of the four dates to stamp.',
            },
            at: f.string('ISO-8601. Defaults to now.'),
          },
          ['milestone']
        ),
      },
      responses: {
        200: okObject('Stamped', { order: { $ref: '#/components/schemas/Order' } }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/admin/orders/{reference}/notes': {
    get: operation('/api/admin/orders/{reference}/notes', {
      tag,
      summary: 'Every note on an order, internal ones included',
      description:
        'Unlike `/api/orders/{reference}/comments`, this is not filtered on `is_admin` — staff see the internal notes as well as the client-facing ones.',
      auth: 'bearer',
      responses: {
        200: okObject('Notes', {
          notes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                body: { type: 'string' },
                internal: { type: 'boolean' },
                author: { type: 'string', nullable: true },
                createdAt: { type: 'string', format: 'date-time', nullable: true },
              },
            },
          },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),

    post: operation('/api/admin/orders/{reference}/notes', {
      tag,
      summary: 'Add a note to an order',
      description:
        '`internal: true` marks a note staff-only. The client-facing read filters on `is_admin`, so **this flag is the difference between a note a client sees and one they do not** — and getting it the wrong way round would publish internal commentary to a client portal.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            note: f.string(),
            internal: f.bool(
              'True keeps it out of the client’s portal. Defaults to true.'
            ),
          },
          ['note']
        ),
      },
      responses: {
        201: okObject('Added', { note: { type: 'object' } }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/admin/orders/{reference}/quote': {
    post: operation('/api/admin/orders/{reference}/quote', {
      tag,
      summary: 'Raise the quote lines an order is priced by',
      description:
        'Raises the quote lines a legalisation order is priced by. **This is the one place in the API where a staff member sets an amount by hand** — legalisation has no published rate, which is why `tbl_order_dl_quotes` exists.\n\n`sent_group` batches the lines that go out together, and the portal reads one group as one invoice.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            lines: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['label', 'amountCents'],
                properties: {
                  label: f.string('What the client is being charged for.'),
                  amountCents: f.cents(),
                },
              },
            },
            note: f.string('Shown with the quote.'),
          },
          ['lines']
        ),
      },
      responses: {
        201: okObject('Raised', {
          quote: { $ref: '#/components/schemas/Quote' },
          sentGroup: {
            type: 'integer',
            description: 'The batch these lines belong to. One group is one invoice.',
          },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/admin/documents/awaiting-review': {
    get: operation('/api/admin/documents/awaiting-review', {
      tag,
      summary: 'Documents waiting on a consultant',
      auth: 'bearer',
      query: [...PAGING],
      responses: {
        200: okList('Awaiting review', 'documents', 'Document', true),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),
  },

  '/api/admin/documents/{id}/review': {
    patch: operation('/api/admin/documents/{id}/review', {
      tag,
      summary: 'Approve or reject an uploaded document',
      description:
        'Approve or reject an uploaded document, with a note. **The note is what turns "rejected" into something a client can act on**, so a rejection without one is refused.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            decision: { type: 'string', enum: ['approved', 'rejected'] },
            note: f.string('Required on a rejection. What the client has to fix.'),
          },
          ['decision']
        ),
      },
      responses: {
        200: okObject('Reviewed', {
          document: { $ref: '#/components/schemas/Document' },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/admin/clients': {
    get: operation('/api/admin/clients', {
      tag,
      summary: 'The client list',
      auth: 'bearer',
      query: [
        {
          name: 'search',
          description: 'Matches name, email, company or account number.',
        },
        {
          name: 'type',
          description: 'Filter on `tbl_user_client.type`.',
          enum: ['public', 'corporate', 'government'],
        },
        ...PAGING,
      ],
      responses: {
        200: okObject('Clients', {
          clients: { type: 'array', items: { type: 'object' } },
          pagination: { $ref: '#/components/schemas/Pagination' },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),
  },

  '/api/admin/clients/{id}': {
    patch: operation('/api/admin/clients/{id}', {
      tag,
      summary: 'Change a client’s account settings',
      description:
        'Enabling account terms and suspending are both here. `can_get_special_price` and `special_price` are left alone deliberately — a discount rate is a commercial decision, and this API has no screen or approval flow behind it.',
      auth: 'bearer',
      body: {
        schema: body({
          canChargeToAccount: f.bool(
            'Whether they may settle against account rather than by card.'
          ),
          active: f.bool('False suspends sign-in.'),
          type: {
            type: 'string',
            enum: ['public', 'corporate', 'government'],
          },
        }),
      },
      responses: {
        200: okObject('Updated', { client: { type: 'object' } }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/admin/consultants': {
    get: operation('/api/admin/consultants', {
      tag,
      summary: 'The staff roster',
      description:
        'The staff roster from `tbl_user_admin`. Note what is absent: no phone, no job title, no photograph, because the table has no columns for them.',
      auth: 'bearer',
      responses: {
        200: okObject('Consultants', {
          consultants: { type: 'array', items: { type: 'object' } },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),
  },

  '/api/admin/consultants/{id}': {
    patch: operation('/api/admin/consultants/{id}', {
      tag,
      summary: 'Change a staff account',
      description:
        '**An administrator cannot disable their own account.** That is the one mistake that locks every administrator out of the system, and it is worth a guard rather than a support call.',
      auth: 'bearer',
      body: {
        schema: body({
          name: f.string(),
          active: f.bool('False disables sign-in. Refused on your own account.'),
        }),
      },
      responses: {
        200: okObject('Updated', { consultant: { type: 'object' } }),
        403: { $ref: '#/components/responses/Forbidden' },
        409: { description: 'You cannot disable your own account' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/admin/enquiries': {
    get: operation('/api/admin/enquiries', {
      tag,
      summary: 'The enquiry queue, from the admin tag',
      description:
        'The same queue as `/api/enquiries/admin`. Both paths exist because the website’s back office was built against this one and the public module owns the other; neither can move without breaking a screen already in production.',
      auth: 'bearer',
      query: [{ name: 'status', description: 'Filter by status. Free text.' }, ...PAGING],
      responses: {
        200: okList('The queue', 'enquiries', 'Enquiry', true),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),
  },

  '/api/admin/enquiries/{id}/convert': {
    post: operation('/api/admin/enquiries/{id}/convert', {
      tag,
      summary: 'Turn an enquiry into an order',
      description:
        'Creates a `tbl_cls_order` row from what the enquiry holds and links the two by noting the enquiry reference on the order. There is no foreign key to make that link structural — there are none anywhere in this schema — so it is recorded in text.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            orderType: f.int('`order_type` — 1=visa … 9=document legalisation.'),
            clientId: f.id('Attach it to an existing client, if there is one.'),
          },
          ['orderType']
        ),
      },
      responses: {
        201: okObject('Converted', {
          order: { $ref: '#/components/schemas/Order' },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/admin/payments/reconcile': {
    get: operation('/api/admin/payments/reconcile', {
      tag,
      summary: 'Payments and orders that do not agree',
      description:
        'Orders marked paid with no payment row, and payments with no order. With no foreign keys in the schema, both happen — so this is the report that finds them rather than a constraint that prevents them.',
      auth: 'bearer',
      query: [
        { name: 'from', description: 'ISO date.' },
        { name: 'to', description: 'ISO date.' },
      ],
      responses: {
        200: okObject('The mismatches', {
          ordersWithoutPayment: { type: 'array', items: { type: 'object' } },
          paymentsWithoutOrder: { type: 'array', items: { type: 'object' } },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),
  },

  '/api/admin/logs': {
    get: operation('/api/admin/logs', {
      tag,
      summary: 'The audit trail',
      description:
        'What staff have changed, from whichever log table the old application writes. Read-only here: this API appends to the trail as a side effect of the endpoints above rather than letting anything write to it directly.',
      auth: 'bearer',
      query: [
        { name: 'userId', description: '`tbl_user_admin.id`.', type: 'integer' },
        { name: 'from', description: 'ISO date.' },
        { name: 'to', description: 'ISO date.' },
        ...PAGING,
      ],
      responses: {
        200: okObject('Log entries', {
          logs: { type: 'array', items: { type: 'object' } },
          pagination: { $ref: '#/components/schemas/Pagination' },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),
  },
} as const;
