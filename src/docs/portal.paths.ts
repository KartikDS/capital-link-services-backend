import { PAGING, body, f, okList, okObject, operation } from './shared';

/**
 * The signed-in client's own records. Every route here requires a token.
 *
 * ## Three places the schema shapes what the portal can offer
 *
 * These are worth reading before the endpoints, because each looks like a missing
 * feature and is not:
 *
 * - **Invoices are assembled, not stored.** There is no invoice table. An invoice
 *   is built from the quote lines a consultant sent (`tbl_order_dl_quotes`,
 *   grouped by `sent_group`) or from the order total where there are none.
 * - **Notifications are derived, not stored.** There is no notifications table
 *   either. They are computed from what has changed on a client's orders, and a row
 *   that cannot record a read receipt says `persisted: false` rather than pretending
 *   the tick was saved.
 * - **A client has one passport photo, ever.** `tbl_user_client.passport_photo` is a
 *   single column with no status beside it. That is why there is no submission
 *   queue, and why withdrawing a photo is refused rather than faked.
 */

const tag = 'Portal';

export const portalPaths = {
  '/api/portal/profile': {
    get: operation('/api/portal/profile', {
      tag,
      summary: 'Your own profile',
      description:
        'The client row, plus its three addresses. Note what is not here: `tbl_user_client` has no job title and no photograph, because it has no columns for them.',
      auth: 'bearer',
      responses: {
        200: okObject('Your profile', { profile: { type: 'object' } }),
      },
    }),

    put: operation('/api/portal/profile', {
      tag,
      summary: 'Update your profile',
      description:
        'Names, phone and company. The email is not changeable here: it is the sign-in identity, and `tbl_user_client` has no unique index on it to make a change safe.',
      auth: 'bearer',
      body: {
        schema: body({
          firstName: f.string(),
          lastName: f.string(),
          phone: f.string(),
          company: f.string(),
        }),
      },
      responses: {
        200: okObject('Saved', { profile: { type: 'object' } }),
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/portal/profile/addresses/{kind}': {
    patch: operation('/api/portal/profile/addresses/{kind}', {
      tag,
      summary: 'Change one address',
      description:
        'One address at a time. Sending the whole profile to change a postcode is how the other two addresses get overwritten.',
      auth: 'bearer',
      body: {
        schema: body({
          line1: f.string(),
          line2: f.string(),
          city: f.string(),
          state: f.string(),
          postcode: f.string(),
          countryId: f.id('`tbl_countries.id`.'),
        }),
      },
      responses: {
        200: okObject('Saved', { address: { type: 'object' } }),
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/portal/orders': {
    get: operation('/api/portal/orders', {
      tag,
      summary: 'Your orders, for the portal table',
      description:
        'The same rows as `/api/orders/mine`, in the shape the portal’s table renders. Both families, merged and paged, with `pagination.total` counted over both order tables rather than over the page.' +
        '\n\n**`perPage` goes up to 500 here**, against 100 elsewhere. The portal’s table runs its search, its sort, its stage filters and their counts in the browser over the rows it holds — `stage` is derived from joined milestone rows and the two families are merged after the read, so there is no column to filter or count in SQL. A page shorter than the client’s history therefore makes every number on that screen a count of the page, which is what it did: a walk-in account of four hundred orders was served fifty and badged them "All orders 50".' +
        '\n\nRaising the ceiling is also cheaper than paging to the same depth, because `listForClient` reads `limit + offset` rows to return `limit` of them.',
      auth: 'bearer',
      // No `stage` parameter. It was documented here and never implemented — the
      // route reads no query beyond the paging — so a caller filtering on it got
      // an unfiltered list and no error. Stage is derived rather than stored, so
      // filtering it in SQL is not a parameter's worth of work; the portal does
      // it in the browser over the whole history instead.
      query: [...PAGING],
      responses: { 200: okList('Your orders', 'orders', 'Order', true) },
    }),
  },

  '/api/portal/stats': {
    get: operation('/api/portal/stats', {
      tag,
      summary: 'The dashboard tiles',
      description:
        'Counts: orders in progress, documents awaiting the client, outstanding balance. Each is a `COUNT(*)` or a `SUM`, which is cheaper than pulling the rows back to count them here.',
      auth: 'bearer',
      responses: {
        200: okObject('Your figures', {
          stats: { type: 'array', items: { type: 'object' } },
        }),
      },
    }),
  },

  '/api/portal/notices': {
    get: operation('/api/portal/notices', {
      tag,
      summary: 'Anything needing the client’s attention',
      description:
        'A rejected document, an unpaid invoice, a passport expiring before the travel date. Derived from the client’s own rows rather than stored, so a notice cannot go stale.',
      auth: 'bearer',
      responses: {
        200: okObject('Notices', {
          notices: { type: 'array', items: { type: 'object' } },
        }),
      },
    }),
  },

  '/api/portal/consultant': {
    get: operation('/api/portal/consultant', {
      tag,
      summary: 'Who is handling your orders',
      description:
        'The consultant assigned to the client’s most recent order. `tbl_user_admin` has a name and an email and nothing else — no phone, no job title, no photograph — so anything beyond those two is absent here rather than invented.',
      auth: 'bearer',
      responses: {
        200: okObject('Your consultant, or null when none is assigned', {
          consultant: { type: 'object', nullable: true },
        }),
      },
    }),
  },

  '/api/portal/documents': {
    get: operation('/api/portal/documents', {
      tag,
      summary: 'Every document on your orders',
      auth: 'bearer',
      query: [
        {
          name: 'status',
          description: 'Filter by review state.',
          enum: ['pending', 'approved', 'rejected'],
        },
        ...PAGING,
      ],
      description:
        'Both tables that hold a client’s documents: the files uploaded against an order (`tbl_cls_order_documents`) and the documents listed on a legalisation order (`tbl_document_legalization_documents`), which the attestation form writes and which may be a declaration with no file behind it. Merged, newest first, with the undated legalisation rows last. `id` carries a `dl-` prefix on the second set — see the `Document` schema.',
      responses: { 200: okList('Documents', 'documents', 'Document', true) },
    }),

    post: operation('/api/portal/documents', {
      tag,
      summary: 'Upload a document against an order',
      description:
        '`multipart/form-data`. **`reference` is required**: a document with no order has nowhere to be stored — `tbl_cls_order_documents.order_id` is how the table is keyed, and CLS’s own screens find a document through its order.\n\nUse `POST /api/uploads` for a file collected before the order exists.',
      auth: 'bearer',
      responses: {
        201: okObject('Stored', {
          document: { $ref: '#/components/schemas/Document' },
        }),
        413: { description: 'Larger than the configured limit' },
        415: { description: 'That extension is not accepted' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/portal/documents/{id}/download': {
    get: operation('/api/portal/documents/{id}/download', {
      tag,
      summary: 'Download one of your documents',
      description:
        'Streams the file after checking it belongs to the caller. Nothing under the upload directory is served statically — that is the whole point of this route.\n\nA legacy path is resolved under `LEGACY_UPLOAD_DIR`, which is unset by default; until CLS mounts the old application’s document directory, a legacy file answers 404 rather than this process reading from a guessed location.',
      auth: 'bearer',
      responses: {
        200: {
          description: 'The file',
          content: {
            'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
          },
        },
      },
    }),
  },

  '/api/portal/documents/{id}': {
    delete: operation('/api/portal/documents/{id}', {
      tag,
      summary: 'Delete one of your documents',
      description:
        'Removes the row and the file. Refused once a consultant has reviewed or approved the document — at that point it is part of a submission, possibly one already lodged with an embassy, and not a draft upload.\n\nAlso refused for a `dl-` prefixed id: those are documents listed on a legalisation order, so removing one changes what CLS has been asked to legalise. `removable` on the document says which is which.',
      auth: 'bearer',
      responses: {
        200: okObject('Deleted', { message: { type: 'string' } }),
        409: { description: 'Already approved, so it cannot be withdrawn here' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/portal/invoices': {
    get: operation('/api/portal/invoices', {
      tag,
      summary: 'Your invoices',
      description:
        'Assembled rather than stored — there is no invoice table. Built from the quote lines a consultant sent, grouped by `sent_group`, or from the order total where there are none.',
      auth: 'bearer',
      query: [
        {
          name: 'status',
          description: 'Filter by payment state.',
          enum: ['paid', 'outstanding', 'overdue'],
        },
        ...PAGING,
      ],
      responses: { 200: okList('Invoices', 'invoices', 'Invoice', true) },
    }),
  },

  '/api/portal/invoices/summary': {
    get: operation('/api/portal/invoices/summary', {
      tag,
      summary: 'What you owe, in total',
      description:
        'For the balance card. `null` amounts are meaningful: an order a consultant has not priced yet contributes nothing to the total rather than a zero.',
      auth: 'bearer',
      responses: {
        200: okObject('Your balance', {
          outstandingCents: { type: 'integer', nullable: true },
          overdueCents: { type: 'integer', nullable: true },
          invoiceCount: { type: 'integer' },
          nextDueAt: { type: 'string', format: 'date-time', nullable: true },
        }),
      },
    }),
  },

  '/api/portal/passport-photos': {
    get: operation('/api/portal/passport-photos', {
      tag,
      summary: 'Your passport photo',
      description:
        'At most one, ever. `tbl_user_client.passport_photo` is a single column with no status beside it — which is why the portal has no submission queue for these, and why the list can never hold two.',
      auth: 'bearer',
      responses: {
        200: okObject('The photo, or an empty list', {
          photos: { type: 'array', maxItems: 1, items: { type: 'object' } },
        }),
      },
    }),

    post: operation('/api/portal/passport-photos', {
      tag,
      summary: 'Upload a passport photo',
      description:
        '`multipart/form-data`. **Replaces whatever was there**, because the column holds one filename. There is nowhere to keep the previous one.',
      auth: 'bearer',
      responses: {
        201: okObject('Stored', { photo: { type: 'object' } }),
        413: { description: 'Larger than the configured limit' },
        415: { description: 'That extension is not accepted' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/portal/passport-photos/{id}/download': {
    get: operation('/api/portal/passport-photos/{id}/download', {
      tag,
      summary: 'Download your passport photo',
      auth: 'bearer',
      responses: {
        200: {
          description: 'The image',
          content: {
            'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
          },
        },
      },
    }),
  },

  '/api/portal/passport-photos/{id}': {
    delete: operation('/api/portal/passport-photos/{id}', {
      tag,
      summary: 'Withdraw a passport photo (refused, and says why)',
      description:
        'Answers honestly that it cannot do what the website asks.\n\nWithdrawing a submission needs a state to move it to, and the schema has one column holding one filename with no status beside it. Clearing the column would delete the photo outright rather than withdraw it, which is a different and less recoverable thing than the client asked for — so this refuses and explains, instead of returning 200 and destroying the file.',
      auth: 'bearer',
      errors: { 401: { $ref: '#/components/responses/Unauthorized' } },
      responses: {
        409: {
          description:
            'Not supported by the schema. The body explains what to do instead.',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/Error' } },
          },
        },
      },
    }),
  },

  '/api/portal/passport-photos/guidelines': {
    get: operation('/api/portal/passport-photos/guidelines', {
      tag,
      summary: 'What makes a passport photo acceptable',
      description:
        'The size, background and framing rules, plus the file limits this API enforces — so the client reads them before uploading rather than after a rejection.',
      auth: 'bearer',
      responses: {
        200: okObject('Guidelines', {
          guidelines: { type: 'array', items: { type: 'string' } },
          limits: { type: 'object' },
        }),
      },
    }),
  },

  '/api/portal/notifications': {
    get: operation('/api/portal/notifications', {
      tag,
      summary: 'Your notifications',
      description:
        'Derived from what has changed on the client’s orders — there is no notifications table. A row with `persisted: false` is one whose read state cannot be recorded anywhere, which the portal shows rather than hiding.',
      auth: 'bearer',
      query: [...PAGING],
      responses: {
        200: okList('Notifications', 'notifications', 'Notification', true),
      },
    }),
  },

  '/api/portal/notifications/{id}/read': {
    patch: operation('/api/portal/notifications/{id}/read', {
      tag,
      summary: 'Mark one notification read',
      description:
        'Recorded only where the underlying row has somewhere to hold it. The response repeats `persisted`, so a caller can tell a saved tick from one that will be back next time.',
      auth: 'bearer',
      responses: {
        200: okObject('Marked', {
          persisted: { type: 'boolean' },
          message: { type: 'string' },
        }),
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/portal/notifications/read-all': {
    patch: operation('/api/portal/notifications/read-all', {
      tag,
      summary: 'Mark every notification read',
      auth: 'bearer',
      responses: {
        200: okObject('Marked', {
          persisted: { type: 'integer', description: 'How many could be recorded.' },
          message: { type: 'string' },
        }),
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/portal/account': {
    delete: operation('/api/portal/account', {
      tag,
      summary: 'Close your account',
      description:
        '**Disables the account; it does not erase it.** The orders, payments and documents on it are business records CLS is required to keep, and there is no anonymisation path through a schema with no foreign keys — deleting the client row would orphan every one of them.\n\nSo the row is marked inactive, sign-in stops working, and the response says what was and was not removed rather than implying an erasure.',
      auth: 'bearer',
      body: {
        schema: body({ password: f.string('Confirms it is the account holder.') }, [
          'password',
        ]),
      },
      responses: {
        200: okObject('Closed', {
          message: { type: 'string' },
          erased: {
            type: 'boolean',
            description: 'Always false, and the message explains why.',
          },
        }),
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },
} as const;
