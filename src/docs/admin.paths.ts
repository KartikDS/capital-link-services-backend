import { PAGING, body, f, okList, okObject, okRows, operation } from './shared';

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
        'Stamps one of the four milestone dates on whichever detail table the order has, and on its destination rows — which is where CLS’s own public-visa and document-legalisation screens read them back from. **The progress bar a client sees is counted from these**, so this is the endpoint that moves it — there is no separate progress column to set.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            milestone: {
              type: 'string',
              enum: ['received', 'submitted', 'completed', 'closed'],
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

  '/api/admin/users/clients': {
    get: operation('/api/admin/users/clients', {
      tag,
      summary: 'Client accounts',
      description:
        'Every client account except `type = government` — the legacy list excludes those, since government users are worked through this same table by a different screen.',
      auth: 'bearer',
      query: [{ name: 'search', description: 'Name, email or company.' }, ...PAGING],
      responses: { 200: okRows('Clients', 'clients', true) },
    }),
    post: operation('/api/admin/users/clients', {
      tag,
      summary: 'Create a client account',
      description:
        'Reproduces `ClientsController::newClientAction`. The email is checked against all four user tables — one address must not open two kinds of account.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            type: f.string('public, corporate or government.'),
            firstName: f.string(),
            lastName: f.string(),
            email: f.email(),
            password: f.string('Left blank, a random one is generated.'),
            company: f.string(),
            departmentId: f.id('For a government account.'),
          },
          ['type', 'firstName', 'lastName', 'email']
        ),
      },
      responses: {
        201: okObject('Created', { client: { type: 'object' } }),
        409: { description: 'That email is already used, in any of the four tables.' },
      },
    }),
  },

  '/api/admin/users/clients/{id}': {
    get: operation('/api/admin/users/clients/{id}', {
      tag,
      summary: 'One client, in full',
      auth: 'bearer',
      responses: {
        200: okObject('Client', { client: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/users/clients/{id}', {
      tag,
      summary: 'Update a client account',
      description:
        'Every field optional — send only what changed. A blank password leaves the stored hash untouched, matching the legacy edit screen.',
      auth: 'bearer',
      body: { schema: body({ firstName: f.string(), email: f.email() }) },
      responses: {
        200: okObject('Updated', { client: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
        409: { description: 'That email is already used.' },
      },
    }),
    delete: operation('/api/admin/users/clients/{id}', {
      tag,
      summary: 'Delete a client account',
      description:
        '**Destructive, and cascades.** Reproduces the legacy `DELETE ... JOIN` across the client, their orders and those orders’ destinations. Kept destructive deliberately — the screen it replaces has always deleted, not archived.',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/users/staff': {
    get: operation('/api/admin/users/staff', {
      tag,
      summary: 'Staff accounts (`tbl_user_admin`)',
      auth: 'bearer',
      query: [{ name: 'search', description: 'Name or email.' }, ...PAGING],
      responses: { 200: okRows('Staff', 'staff', true) },
    }),
    post: operation('/api/admin/users/staff', {
      tag,
      summary: 'Create a staff account',
      auth: 'bearer',
      body: {
        schema: body(
          {
            firstName: f.string(),
            lastName: f.string(),
            email: f.email(),
            password: f.string(),
            isDriver: f.bool(),
          },
          ['firstName', 'lastName', 'email']
        ),
      },
      responses: {
        201: okObject('Created', { staff: { type: 'object' } }),
        409: { description: 'That email is already used.' },
      },
    }),
  },

  '/api/admin/users/staff/{id}': {
    get: operation('/api/admin/users/staff/{id}', {
      tag,
      summary: 'One staff account',
      auth: 'bearer',
      responses: {
        200: okObject('Staff', { staff: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/users/staff/{id}', {
      tag,
      summary: 'Update a staff account',
      auth: 'bearer',
      body: { schema: body({ firstName: f.string(), isDriver: f.bool() }) },
      responses: {
        200: okObject('Updated', { staff: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/users/staff/{id}', {
      tag,
      summary: 'Delete a staff account',
      description:
        'Unguarded against deleting your own account, matching the legacy screen. Disabling one instead — where that guard lives — is `PATCH /api/admin/consultants/{id}`.',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/users/embassy': {
    get: operation('/api/admin/users/embassy', {
      tag,
      summary: 'Embassy accounts',
      auth: 'bearer',
      query: [{ name: 'search', description: 'Name or email.' }, ...PAGING],
      responses: { 200: okRows('Embassy users', 'embassy', true) },
    }),
    post: operation('/api/admin/users/embassy', {
      tag,
      summary: 'Create an embassy account',
      auth: 'bearer',
      body: {
        schema: body(
          {
            titleId: f.id('`tbl_name_title.id`; unlike the other three tables this is a lookup, not free text.'),
            firstName: f.string(),
            lastName: f.string(),
            email: f.email(),
            countryId: f.id('`tbl_countries.id`.'),
            notes: f.string(),
          },
          ['firstName', 'lastName', 'email']
        ),
      },
      responses: {
        201: okObject('Created', { embassy: { type: 'object' } }),
        409: { description: 'That email is already used.' },
      },
    }),
  },

  '/api/admin/users/embassy/{id}': {
    get: operation('/api/admin/users/embassy/{id}', {
      tag,
      summary: 'One embassy account',
      auth: 'bearer',
      responses: {
        200: okObject('Embassy user', { embassy: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/users/embassy/{id}', {
      tag,
      summary: 'Update an embassy account',
      auth: 'bearer',
      body: { schema: body({ firstName: f.string(), notes: f.string() }) },
      responses: {
        200: okObject('Updated', { embassy: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/users/embassy/{id}', {
      tag,
      summary: 'Delete an embassy account',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/users/tpn': {
    get: operation('/api/admin/users/tpn', {
      tag,
      summary: 'TPN staff accounts (`tbl_user_tpn`, the legacy "DFAT" screen)',
      auth: 'bearer',
      query: [{ name: 'search', description: 'Name or email.' }, ...PAGING],
      responses: { 200: okRows('TPN staff', 'tpn', true) },
    }),
    post: operation('/api/admin/users/tpn', {
      tag,
      summary: 'Create a TPN staff account',
      auth: 'bearer',
      body: {
        schema: body(
          {
            firstName: f.string(),
            lastName: f.string(),
            email: f.email(),
            phone: f.string(),
          },
          ['firstName', 'lastName', 'email']
        ),
      },
      responses: {
        201: okObject('Created', { tpn: { type: 'object' } }),
        409: { description: 'That email is already used.' },
      },
    }),
  },

  '/api/admin/users/tpn/{id}': {
    get: operation('/api/admin/users/tpn/{id}', {
      tag,
      summary: 'One TPN staff account',
      auth: 'bearer',
      responses: {
        200: okObject('TPN user', { tpn: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/users/tpn/{id}', {
      tag,
      summary: 'Update a TPN staff account',
      auth: 'bearer',
      body: { schema: body({ firstName: f.string(), phone: f.string() }) },
      responses: {
        200: okObject('Updated', { tpn: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/users/tpn/{id}', {
      tag,
      summary: 'Delete a TPN staff account',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/passport-photos': {
    get: operation('/api/admin/passport-photos', {
      tag,
      summary: 'Every client passport photo on file',
      description:
        'Reproduces `ManagePassportOfficePickupDeliveryController::passportPhotosAction`. `tbl_user_client.passport_photo` is one column, one photo per client, with no review state — so this is read-only, newest upload first.',
      auth: 'bearer',
      query: [...PAGING],
      responses: { 200: okRows('Photos', 'photos', true) },
    }),
  },

  '/api/admin/passport-photos/{id}/file': {
    get: operation('/api/admin/passport-photos/{id}/file', {
      tag,
      summary: "One client's photo file",
      description:
        'Streams the stored file, the same way `/api/portal/passport-photos/{id}/download` does for the client themselves.',
      auth: 'bearer',
      responses: {
        200: { description: 'The image', content: { 'image/*': { schema: { type: 'string', format: 'binary' } } } },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/translation-services': {
    get: operation('/api/admin/translation-services', {
      tag,
      summary: 'Every translation-service enquiry on file',
      description:
        'Reproduces `ManageGeneralSettingsController::translationServicesAction`. Read-only — the legacy screen never had a create, edit or delete action, only a list and a download.',
      auth: 'bearer',
      query: [
        { name: 'search', description: 'Matches the name, email or either language.' },
        ...PAGING,
      ],
      responses: { 200: okRows('Enquiries', 'enquiries', true) },
    }),
  },

  '/api/admin/translation-services/{id}/documents/{filename}/file': {
    get: operation('/api/admin/translation-services/{id}/documents/{filename}/file', {
      tag,
      summary: "One enquiry's attached document",
      description:
        '`filename` must be one of that row’s own `document_name` entries — a stricter check than the legacy download, which trusted a bare `?filename=` against a fixed directory with no ownership check at all.',
      auth: 'bearer',
      responses: {
        200: { description: 'The file', content: { 'application/octet-stream': { schema: { type: 'string', format: 'binary' } } } },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/general-settings': {
    get: operation('/api/admin/general-settings', {
      tag,
      summary: 'Named key/value settings',
      description:
        'Reproduces `ManageGeneralSettingsController::indexAction`. A CRUD list of arbitrary settings, each a free-text value or a yes/no toggle — not a singleton form.',
      auth: 'bearer',
      query: [
        { name: 'search', description: 'Matches the title or the constant.' },
        ...PAGING,
      ],
      responses: { 200: okRows('Settings', 'settings', true) },
    }),
    post: operation('/api/admin/general-settings', {
      tag,
      summary: 'Create a setting',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: { 201: okObject('Created', {}) },
    }),
  },

  '/api/admin/general-settings/{id}': {
    get: operation('/api/admin/general-settings/{id}', {
      tag,
      summary: 'One setting, in full',
      auth: 'bearer',
      responses: {
        200: okObject('Setting', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/general-settings/{id}', {
      tag,
      summary: 'Update a setting',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: {
        200: okObject('Updated', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/general-settings/{id}', {
      tag,
      summary: 'Delete a setting',
      description:
        'The legacy screen never wired a delete action to this list — this adds one, as a safety net rather than a ported feature. See the note on `generalSettings.ts`.',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/saudi-invitation-letters': {
    get: operation('/api/admin/saudi-invitation-letters', {
      tag,
      summary: 'Saudi invitation letter applications',
      description:
        'Reproduces `SaudiInvitationLetterController::indexAction`. One row per application — `tbl_saudi_invitation_letters` rows with `parent_id = 0`; co-applicants are read through the detail endpoint below.',
      auth: 'bearer',
      query: [
        { name: 'search', description: 'Matches the name, email or phone.' },
        ...PAGING,
      ],
      responses: { 200: okRows('Applications', 'applications', true) },
    }),
  },

  '/api/admin/saudi-invitation-letters/{id}': {
    get: operation('/api/admin/saudi-invitation-letters/{id}', {
      tag,
      summary: 'One application, primary and co-applicants',
      description:
        '`{id}` is the primary applicant’s own row id. Reproduces `viewApplicantDetailsAction`.',
      auth: 'bearer',
      responses: {
        200: okObject('Application', {
          application: {
            type: 'object',
            properties: {
              primary: { type: 'object' },
              coApplicants: { type: 'array', items: { type: 'object' } },
            },
          },
        }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/saudi-invitation-letters/{id}/applicants': {
    post: operation('/api/admin/saudi-invitation-letters/{id}/applicants', {
      tag,
      summary: 'Add a co-applicant to an application',
      description: 'Refuses past five applicants total, the legacy form’s own cap.',
      auth: 'bearer',
      responses: {
        201: okObject('Created', { applicant: { type: 'object' } }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/saudi-invitation-letters/applicants/{rowId}': {
    patch: operation('/api/admin/saudi-invitation-letters/applicants/{rowId}', {
      tag,
      summary: 'Update one applicant',
      description:
        'The sponsor fields, the multi-apply-before date and the comment only ever apply to applicant 1 in the legacy form and are silently ignored on anyone else’s row.',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: {
        200: okObject('Updated', { applicant: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/saudi-invitation-letters/applicants/{rowId}', {
      tag,
      summary: 'Remove a co-applicant',
      description: 'Refuses on the primary applicant — see the note on `saudiInvitationLetters.ts`.',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/free-visa-documents': {
    get: operation('/api/admin/free-visa-documents', {
      tag,
      summary: 'Free visa documents clients have uploaded',
      description:
        'Reproduces `ManagePassportOfficePickupDeliveryController::freeVisaDocumentAction`. Read-only — the legacy screen has no create, edit or delete action, only a list and a download.',
      auth: 'bearer',
      query: [
        { name: 'search', description: 'Matches the client’s name or email.' },
        ...PAGING,
      ],
      responses: { 200: okRows('Documents', 'documents', true) },
    }),
  },

  '/api/admin/free-visa-documents/{id}/file': {
    get: operation('/api/admin/free-visa-documents/{id}/file', {
      tag,
      summary: "One document's file",
      auth: 'bearer',
      responses: {
        200: {
          description: 'The file',
          content: {
            'application/octet-stream': { schema: { type: 'string', format: 'binary' } },
          },
        },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/content-pages': {
    get: operation('/api/admin/content-pages', {
      tag,
      summary: 'Freestanding content pages',
      description: 'Reproduces `ManageContentPagesController`. A title and a block of HTML, rendered on the public site exactly as staff wrote it.',
      auth: 'bearer',
      query: [...PAGING],
      responses: { 200: okRows('Pages', 'pages', true) },
    }),
    post: operation('/api/admin/content-pages', {
      tag,
      summary: 'Create a content page',
      auth: 'bearer',
      body: { schema: body({ title: f.string(), html: f.string() }, ['title', 'html']) },
      responses: { 201: okObject('Created', { page: { type: 'object' } }) },
    }),
  },

  '/api/admin/content-pages/{id}': {
    get: operation('/api/admin/content-pages/{id}', {
      tag,
      summary: 'One content page, HTML included',
      auth: 'bearer',
      responses: {
        200: okObject('Page', { page: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/content-pages/{id}', {
      tag,
      summary: 'Update a content page',
      auth: 'bearer',
      body: { schema: body({ title: f.string(), html: f.string() }) },
      responses: {
        200: okObject('Updated', { page: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/content-pages/{id}/status': {
    patch: operation('/api/admin/content-pages/{id}/status', {
      tag,
      summary: 'Toggle a page active/inactive',
      auth: 'bearer',
      responses: {
        200: okObject('Toggled', { id: { type: 'integer' }, status: { type: 'string' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/sections': {
    get: operation('/api/admin/sections', {
      tag,
      summary: 'Fixed content sections the website templates reference',
      description: 'Reproduces `ManageSectionsController`. No create here — each row is already wired into a template by `page_slug`, so a new one would have nothing to render it.',
      auth: 'bearer',
      query: [...PAGING],
      responses: { 200: okRows('Sections', 'sections', true) },
    }),
  },

  '/api/admin/sections/{id}': {
    get: operation('/api/admin/sections/{id}', {
      tag,
      summary: 'One section, content included',
      auth: 'bearer',
      responses: {
        200: okObject('Section', { section: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/sections/{id}', {
      tag,
      summary: 'Update a section',
      description:
        'Accepts a plain JSON body or `multipart/form-data` with the same fields plus an optional `image` file — the image column is only touched when one is attached.',
      auth: 'bearer',
      body: { schema: body({ title: f.string(), content: f.string() }) },
      responses: {
        200: okObject('Updated', { section: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/sections/{id}/status': {
    patch: operation('/api/admin/sections/{id}/status', {
      tag,
      summary: 'Toggle a section active/inactive',
      auth: 'bearer',
      responses: {
        200: okObject('Toggled', { id: { type: 'integer' }, status: { type: 'string' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },


  '/api/admin/pricing/police-clearances': {
    get: operation('/api/admin/pricing/police-clearances', {
      tag,
      summary: 'Police clearance types',
      auth: 'bearer',
      query: [...PAGING],
      responses: { 200: okRows('Police clearance types', 'clearances', true) },
    }),
    post: operation('/api/admin/pricing/police-clearances', {
      tag,
      summary: 'Create a police clearance type row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: { 201: okObject('Created', {}) },
    }),
  },

  '/api/admin/pricing/police-clearances/{id}': {
    get: operation('/api/admin/pricing/police-clearances/{id}', {
      tag,
      summary: 'One row, in full',
      auth: 'bearer',
      responses: {
        200: okObject('Row', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/pricing/police-clearances/{id}', {
      tag,
      summary: 'Update a row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: {
        200: okObject('Updated', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/pricing/police-clearances/{id}', {
      tag,
      summary: 'Delete a row',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/pricing/courier-options': {
    get: operation('/api/admin/pricing/courier-options', {
      tag,
      summary: 'Visa courier options',
      auth: 'bearer',
      query: [...PAGING],
      responses: { 200: okRows('Visa courier options', 'options', true) },
    }),
    post: operation('/api/admin/pricing/courier-options', {
      tag,
      summary: 'Create a visa courier option row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: { 201: okObject('Created', {}) },
    }),
  },

  '/api/admin/pricing/courier-options/{id}': {
    get: operation('/api/admin/pricing/courier-options/{id}', {
      tag,
      summary: 'One row, in full',
      auth: 'bearer',
      responses: {
        200: okObject('Row', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/pricing/courier-options/{id}', {
      tag,
      summary: 'Update a row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: {
        200: okObject('Updated', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/pricing/courier-options/{id}', {
      tag,
      summary: 'Delete a row',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/pricing/voucher-types': {
    get: operation('/api/admin/pricing/voucher-types', {
      tag,
      summary: 'Russian visa voucher types',
      auth: 'bearer',
      query: [...PAGING],
      responses: { 200: okRows('Russian visa voucher types', 'types', true) },
    }),
    post: operation('/api/admin/pricing/voucher-types', {
      tag,
      summary: 'Create a russian visa voucher type row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: { 201: okObject('Created', {}) },
    }),
  },

  '/api/admin/pricing/voucher-types/{id}': {
    get: operation('/api/admin/pricing/voucher-types/{id}', {
      tag,
      summary: 'One row, in full',
      auth: 'bearer',
      responses: {
        200: okObject('Row', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/pricing/voucher-types/{id}', {
      tag,
      summary: 'Update a row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: {
        200: okObject('Updated', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/pricing/voucher-types/{id}', {
      tag,
      summary: 'Delete a row',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/pricing/travel-alerts': {
    get: operation('/api/admin/pricing/travel-alerts', {
      tag,
      summary: 'Travel alerts',
      auth: 'bearer',
      query: [...PAGING],
      responses: { 200: okRows('Travel alerts', 'alerts', true) },
    }),
    post: operation('/api/admin/pricing/travel-alerts', {
      tag,
      summary: 'Create a travel alert row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: { 201: okObject('Created', {}) },
    }),
  },

  '/api/admin/pricing/travel-alerts/{id}': {
    get: operation('/api/admin/pricing/travel-alerts/{id}', {
      tag,
      summary: 'One row, in full',
      auth: 'bearer',
      responses: {
        200: okObject('Row', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/pricing/travel-alerts/{id}', {
      tag,
      summary: 'Update a row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: {
        200: okObject('Updated', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/pricing/travel-alerts/{id}', {
      tag,
      summary: 'Delete a row',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/pricing/discounts': {
    get: operation('/api/admin/pricing/discounts', {
      tag,
      summary: 'Discount codes',
      auth: 'bearer',
      query: [...PAGING],
      responses: { 200: okRows('Discount codes', 'discounts', true) },
    }),
    post: operation('/api/admin/pricing/discounts', {
      tag,
      summary: 'Create a discount code row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: { 201: okObject('Created', {}) },
    }),
  },

  '/api/admin/pricing/discounts/{id}': {
    get: operation('/api/admin/pricing/discounts/{id}', {
      tag,
      summary: 'One row, in full',
      auth: 'bearer',
      responses: {
        200: okObject('Row', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/pricing/discounts/{id}', {
      tag,
      summary: 'Update a row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: {
        200: okObject('Updated', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/pricing/discounts/{id}', {
      tag,
      summary: 'Delete a row',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/pricing/weight-price': {
    get: operation('/api/admin/pricing/weight-price', {
      tag,
      summary: 'Weight price bands',
      auth: 'bearer',
      query: [...PAGING],
      responses: { 200: okRows('Weight price bands', 'bands', true) },
    }),
    post: operation('/api/admin/pricing/weight-price', {
      tag,
      summary: 'Create a weight price band row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: { 201: okObject('Created', {}) },
    }),
  },

  '/api/admin/pricing/weight-price/{id}': {
    get: operation('/api/admin/pricing/weight-price/{id}', {
      tag,
      summary: 'One row, in full',
      auth: 'bearer',
      responses: {
        200: okObject('Row', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/pricing/weight-price/{id}', {
      tag,
      summary: 'Update a row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: {
        200: okObject('Updated', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/pricing/weight-price/{id}', {
      tag,
      summary: 'Delete a row',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/pricing/document-delivery-types': {
    get: operation('/api/admin/pricing/document-delivery-types', {
      tag,
      summary: 'Document delivery types',
      auth: 'bearer',
      query: [...PAGING],
      responses: { 200: okRows('Document delivery types', 'types', true) },
    }),
    post: operation('/api/admin/pricing/document-delivery-types', {
      tag,
      summary: 'Create a document delivery type row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: { 201: okObject('Created', {}) },
    }),
  },

  '/api/admin/pricing/document-delivery-types/{id}': {
    get: operation('/api/admin/pricing/document-delivery-types/{id}', {
      tag,
      summary: 'One row, in full',
      auth: 'bearer',
      responses: {
        200: okObject('Row', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/pricing/document-delivery-types/{id}', {
      tag,
      summary: 'Update a row',
      auth: 'bearer',
      body: { schema: body({}, []) },
      responses: {
        200: okObject('Updated', {}),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/pricing/document-delivery-types/{id}', {
      tag,
      summary: 'Delete a row',
      auth: 'bearer',
      responses: {
        204: { description: 'Deleted.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/settings/passport-delivery': {
    get: operation('/api/admin/settings/passport-delivery', {
      tag,
      summary: 'Passport office pickup/delivery pricing (one row)',
      description: 'Reproduces `ManagePassportOfficePickupDeliveryController::indexAction`. A single row — `tbl_settings_passport` — not a table.',
      auth: 'bearer',
      responses: { 200: okObject('Settings', { settings: { type: 'object' } }) },
    }),
    patch: operation('/api/admin/settings/passport-delivery', {
      tag,
      summary: 'Update the passport delivery pricing',
      auth: 'bearer',
      body: { schema: body({ costCents: f.cents(), additionalCostCents: f.cents() }) },
      responses: { 200: okObject('Updated', { settings: { type: 'object' } }) },
    }),
  },

  '/api/admin/settings/saudi-visa-popup': {
    get: operation('/api/admin/settings/saudi-visa-popup', {
      tag,
      summary: 'The Saudi visa popup content (one row)',
      auth: 'bearer',
      responses: { 200: okObject('Content', { content: { type: 'string' } }) },
    }),
    patch: operation('/api/admin/settings/saudi-visa-popup', {
      tag,
      summary: 'Update the popup content',
      auth: 'bearer',
      body: { schema: body({ content: f.string() }, ['content']) },
      responses: { 200: okObject('Updated', { content: { type: 'string' } }) },
    }),
  },

  '/api/admin/settings/credit-card-fee': {
    get: operation('/api/admin/settings/credit-card-fee', {
      tag,
      summary: 'The credit card processing fee (retained, unused)',
      description: 'The fee was removed from every price on the website as of 2026-09-03. This screen and column are kept because the legacy admin has them, and the response says so — see the module note on `settings.ts`.',
      auth: 'bearer',
      responses: { 200: okObject('Fee', { feeCents: { type: 'integer' }, deprecated: { type: 'boolean' } }) },
    }),
    patch: operation('/api/admin/settings/credit-card-fee', {
      tag,
      summary: 'Update the fee (has no effect on pricing)',
      auth: 'bearer',
      body: { schema: body({ feeCents: f.cents() }, ['feeCents']) },
      responses: { 200: okObject('Updated', { feeCents: { type: 'integer' } }) },
    }),
  },

  '/api/admin/settings/doc-legalisation-attachment': {
    get: operation('/api/admin/settings/doc-legalisation-attachment', {
      tag,
      summary: 'The current document legalisation attachment',
      auth: 'bearer',
      responses: { 200: okObject('Attachment', { attachmentFile: { type: 'string', nullable: true } }) },
    }),
    post: operation('/api/admin/settings/doc-legalisation-attachment', {
      tag,
      summary: 'Replace the attachment',
      description:
        'Reproduces `ManageDocumentLegalizationAttachmentController::indexAction`’s upload. `multipart/form-data` with a single `file` field.',
      auth: 'bearer',
      responses: {
        200: okObject('Replaced', { attachmentFile: { type: 'string', nullable: true } }),
        400: { $ref: '#/components/responses/BadRequest' },
      },
    }),
    delete: operation('/api/admin/settings/doc-legalisation-attachment', {
      tag,
      summary: 'Remove the attachment',
      auth: 'bearer',
      responses: { 204: { description: 'Removed.' } },
    }),
  },

  '/api/admin/orders/{id}/detail': {
    get: operation('/api/admin/orders/{id}/detail', {
      tag,
      summary: 'One order, in full',
      description:
        'Everything the legacy admin’s order screen shows, for one order.\n\n**Shaped per service.** A common core — the order, its four milestone dates, the primary applicant, the return-document details and the payment — plus a `detail` block whose fields depend on `order.orderType`. The old `ViewOrder` templates are one file per service and do not agree about what an order is: a police clearance screen has four panels, a public visa thirteen, a voucher an Employment Details panel nothing else has.\n\n**Reads only the rows this order needs.** The per-service detail is a second query chosen by `order_type`, not four joins with three discarded. Use this rather than searching the queue for one row.',
      auth: 'bearer',
      responses: {
        200: okObject('The order', {
          order: { type: 'object' },
          milestones: {
            type: 'object',
            description:
              'The four dates the Order Progress panel shows. All null on a service with no detail table of its own.',
          },
          applicant: { type: 'object', nullable: true },
          returnDocument: { type: 'object', nullable: true },
          payment: { type: 'object', nullable: true },
          detail: {
            type: 'object',
            nullable: true,
            description: 'Service-specific panels. Null for a plain visa.',
          },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/checklist/{checklistId}/file': {
    patch: operation('/api/admin/orders/{id}/checklist/{checklistId}/file', {
      tag,
      summary: 'Replace a Document Checklist row’s file',
      description:
        '`multipart/form-data` with a single `file` field. `{checklistId}` must belong to the order named by `{id}` — `tbl_order_dl_checklist` has no foreign key of its own, so this checks it rather than trusting the URL.',
      auth: 'bearer',
      responses: {
        200: okObject('Replaced', { checklist: { type: 'object' } }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/voucher/passport-file': {
    get: operation('/api/admin/orders/{id}/voucher/passport-file', {
      tag,
      summary: 'Stream a Russian visa voucher order’s passport scan',
      description:
        'The legacy screen’s “Passport File” link. **Voucher orders only** (any other order is a 404). Tries the stored path, then the legacy `dev/rvv/{clientId}/{orderId}/{file}` location. Admin only.',
      auth: 'bearer',
      responses: {
        200: { description: 'The file' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    patch: operation('/api/admin/orders/{id}/voucher/passport-file', {
      tag,
      summary: 'Replace a Russian visa voucher order’s passport scan',
      description: '`multipart/form-data` with a single `file` field.',
      auth: 'bearer',
      responses: {
        200: okObject('Replaced', { hasPassportFile: { type: 'boolean' } }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation': {
    get: operation('/api/admin/orders/{id}/legalisation', {
      tag,
      summary: 'Everything the Document Legalisation order screen renders',
      description:
        'Read-and-write counterpart of `GET /api/admin/orders/{id}/detail` for **document-legalisation orders only** (`order_type` 9) — any other order is a 404. Reproduces the legacy `viewDocLegalisationAction` screen: milestones, Ticket, both comment lanes, document-type tracker, Document Details, Contact, Checklist, Delivery, Billing and the Location option list.\n\n`comments` carries **both** lanes (`lane: "client"` is `is_admin` 0, emailed to the client; `lane: "admin"` is `is_admin` 1, CLS-internal). That is correct for this staff-only route and must never be copied to a client-facing one. `stamps` are ISO instants; `ticket.followUpDate`, `embassy.deliveredDate` are plain `YYYY-MM-DD`.\n\n`order.reference` is the client-facing portal reference (`CLS-000012`) that `/dashboard/orders/[reference]` is keyed by; `order.orderNo` is CLS’s own number.\n\n`order.isDhlCourier` is `tbl_visa_courier_options.s_dhl` for the order’s courier; the legacy DHL Label button additionally needs `delivery` state other than `ACT`.\n\n`request` is what the **new attestation order form** collected: requirements (document type, services ticked, pathway, needed-by date, originals being sent, reference, commercial invoice no.), the contact’s company and full address, the document rows with their file names, and delivery & return (CLS handles it / I’ll handle it, return address, "not available at this time", instructions). Most of it has no column, so it is read back from the website’s summary note in `tbl_order_notes`; `request.raw` is that note verbatim and `request.fromWebsite` is false for an order CLS keyed in by hand. `delivery.country` and `delivery.comment` are the return address’s country and the order instructions.',
      auth: 'bearer',
      responses: {
        200: okObject('The screen', { legalisation: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/ticket': {
    patch: operation('/api/admin/orders/{id}/legalisation/ticket', {
      tag,
      summary: 'The main Update — milestones, Ticket, comments, embassy strip',
      description:
        '`multipart/form-data`. Reproduces the legacy `updateTicket`. Only fields present are written; `\'\'` clears a stamp or text field.\n\n**Milestone email:** the first changed stamp (received, submitted, completed, closed — in that order) sets `notification.scantype`. A stamp that is *cleared* is not a milestone. **`notification.suppress` is true when an admin comment was written** — legacy never emailed the client in that case. The backend sends no email; the caller builds it from `notification`.\n\n**Comments:** `clientComment` creates lane-0 note(s), one per `comment_attachment` file (the text repeated); `adminComment` creates lane-1 note(s) per `admin_attachment` file — confidential. Attachments are `.pdf/.png/.jpg/.jpeg` only (legacy `checkMediaTypeFromAttachment`); anything else is a 400 "File you are trying to upload is restricted and operation is aborted!!". An attachment with no comment text is a 400.\n\n**Auto-close:** when the closed stamp is set and every destination of the order is closed, `tbl_cls_order.status` becomes 2.\n\nThe follow-up date is written to both `tbl_order_follow_up_date` (this admin’s rows replaced) and `visa_follow_up_date`.',
      auth: 'bearer',
      body: {
        contentType: 'multipart/form-data',
        schema: body({
          allItemsReceivedAtCLS: f.string('ISO-8601 instant, or empty to clear.'),
          submittedForProcessing: f.string('ISO-8601 instant, or empty to clear.'),
          completedReceivedAtCLS: f.string('ISO-8601 instant, or empty to clear.'),
          orderOnRouteAndClosed: f.string('ISO-8601 instant, or empty to clear.'),
          shippedBy: f.string(),
          comNoteNo: f.string('Com Note Out.'),
          comNoteIn: f.string(),
          invoiceNo: f.string(),
          signeeName: f.string(),
          clientComment: f.string('Lane 0 — emailed to the client.'),
          adminComment: f.string('Lane 1 — CLS-internal, confidential.'),
          clsTeamMember: f.string('`tbl_user_admin.id`, or empty for none.'),
          deliveredToEmbassy: { type: 'string', enum: ['1', '0'] },
          embassyDeliveredDate: f.string('`YYYY-MM-DD`, or empty.'),
          nextEmbassy: f.string(),
          followUpDate: f.string('`YYYY-MM-DD`, or empty.'),
          comment_attachment: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'Lane-0 files, up to 10.',
          },
          admin_attachment: {
            type: 'array',
            items: { type: 'string', format: 'binary' },
            description: 'Lane-1 files, up to 10.',
          },
        }),
      },
      responses: {
        200: okObject('Saved', {
          notification: { type: 'object' },
          comments: { type: 'array', items: { type: 'object' } },
        }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/details': {
    patch: operation('/api/admin/orders/{id}/legalisation/details', {
      tag,
      summary: 'Document Details — destination, origin, type, reference',
      description:
        'Also sets `tbl_cls_order.destination` and `tbl_cls_order_destinations.country_id` to the new destination, as legacy did. Both countries must exist.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            destinationCountryId: f.int(),
            nationalityId: f.int('The Origin select.'),
            typeOfDocument: { type: 'integer', enum: [1, 2], description: '1 Commercial, 2 Personal.' },
            refNo: f.string(),
            comInvoiceNo: f.string('The Number field.'),
          },
          ['destinationCountryId', 'nationalityId', 'typeOfDocument', 'refNo', 'comInvoiceNo']
        ),
      },
      responses: {
        200: okObject('Saved', { details: { type: 'object' } }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/checklist': {
    patch: operation('/api/admin/orders/{id}/legalisation/checklist', {
      tag,
      summary: 'Document Checklist — type, number and note per row',
      description:
        'Every `id` must be a `tbl_order_dl_checklist` row of this order; one foreign id rejects the whole request (404) and nothing is changed. Files are replaced by `PATCH /api/admin/orders/{id}/checklist/{checklistId}/file`.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            rows: {
              type: 'array',
              items: body(
                {
                  id: f.int(),
                  type: f.string(),
                  number: { type: 'integer', nullable: true },
                  note: { type: 'string', nullable: true },
                },
                ['id', 'type']
              ),
            },
          },
          ['rows']
        ),
      },
      responses: {
        200: okObject('Saved', { checklist: { type: 'array', items: { type: 'object' } } }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/checklist/{checklistId}/file': {
    get: operation('/api/admin/orders/{id}/legalisation/checklist/{checklistId}/file', {
      tag,
      summary: 'Stream a checklist row’s uploaded document',
      description:
        'The legacy "Show Uploaded Document" link. Ownership is checked: the row must belong to this order. Tries the stored path, then the legacy `dev/dl_documents/{orderId}_{file}` location.',
      auth: 'bearer',
      responses: {
        200: { description: 'The file' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/tracking': {
    post: operation('/api/admin/orders/{id}/legalisation/tracking', {
      tag,
      summary: 'Add document-tracker history rows',
      description:
        'Each row is a NEW `tbl_order_notes` row (`is_admin` 1, `user_type` Admin) — legacy never edited one in place. `location` must be one of the region’s Location options (returned as `locations` by the screen read); `status` is `Delivered` or `Received`.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            rows: {
              type: 'array',
              items: body(
                {
                  documentType: f.string(),
                  location: f.string(),
                  price: { type: 'number' },
                  status: { type: 'string', enum: ['Delivered', 'Received'] },
                },
                ['documentType', 'location', 'price', 'status']
              ),
            },
          },
          ['rows']
        ),
      },
      responses: {
        200: okObject('The tracker after the change', {
          tracking: { type: 'array', items: { type: 'object' } },
        }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/orders/{id}/legalisation/tracking', {
      tag,
      summary: 'Remove every tracker row of one document type on this order',
      description:
        'The legacy `remove` button. Scoped to this order — legacy deleted the document type across **every** order.',
      auth: 'bearer',
      query: [{ name: 'documentType', description: 'The exact document type.' }],
      responses: {
        200: okObject('The tracker after the change', {
          tracking: { type: 'array', items: { type: 'object' } },
        }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/tracking/{noteId}': {
    delete: operation('/api/admin/orders/{id}/legalisation/tracking/{noteId}', {
      tag,
      summary: 'Remove one tracker history row',
      description: 'The row must belong to this order (`tbl_order_notes.order_no`), else 404.',
      auth: 'bearer',
      responses: {
        200: okObject('The tracker after the change', {
          tracking: { type: 'array', items: { type: 'object' } },
        }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/comments/{noteId}': {
    patch: operation('/api/admin/orders/{id}/legalisation/comments/{noteId}', {
      tag,
      summary: 'Edit a destination comment',
      description:
        'The note must belong to this order’s destination (404 otherwise). **Lane gate:** lane 1 (admin comment) is always editable; lane 0 only when `user_type` is `Admin` — a client’s own reply is a 403.',
      auth: 'bearer',
      body: { schema: body({ comment: f.string() }, ['comment']) },
      responses: {
        200: okObject('Saved', { comment: { type: 'object' } }),
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
    delete: operation('/api/admin/orders/{id}/legalisation/comments/{noteId}', {
      tag,
      summary: 'Delete a destination comment',
      description:
        'Same ownership and lane gate as the edit. The stored attachment file is left in place, as in legacy.',
      auth: 'bearer',
      responses: {
        200: okObject('Deleted', { deleted: f.int() }),
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/comments/{noteId}/attachment': {
    get: operation('/api/admin/orders/{id}/legalisation/comments/{noteId}/attachment', {
      tag,
      summary: 'Stream a comment’s attachment (either lane)',
      description:
        'Staff only — lane 1 files are readable here and **nowhere** a client can reach (the portal’s own attachment route refuses `is_admin` 1). Ownership is checked against this order’s destination.',
      auth: 'bearer',
      responses: {
        200: { description: 'The file' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/signature': {
    get: operation('/api/admin/orders/{id}/legalisation/signature', {
      tag,
      summary: 'Stream the order’s signature image',
      description:
        'For `ticket.signature.kind === "image"`: legacy `saveSignatureAction` stored the signature pad’s PNG at `dev/order_signature/{md5}_{orderId}_{destinationId}.png` and its bare name on the destination row. Staff only. The file served is always the one **this order’s destination row names** — never one taken from the URL — and a name that does not end `_{orderId}_{destinationId}`, or is an SVG, is refused with a 404. Stroke-JSON signatures are returned inline by `GET /legalisation` and have no file, so they 404 here.',
      auth: 'bearer',
      responses: {
        200: { description: 'The signature image' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/status': {
    patch: operation('/api/admin/orders/{id}/legalisation/status', {
      tag,
      summary: 'Order Status and Payment Status in one save',
      description:
        'The legacy `updateStatus` form. `orderStatus` is `tbl_cls_order.status` (0 Pending, 1 Completed, 2 Cls Confirmed); `paymentStatus` is `tbl_payment.s_paid` (0 Pending, 1 Paid - Online; 2 Paid by account is accepted but not offered by the DL screen). Needs a payment row — 409 otherwise, before anything is written. One audit line per field that actually changed.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            orderStatus: { type: 'integer', enum: [0, 1, 2] },
            paymentStatus: { type: 'integer', enum: [0, 1, 2] },
          },
          ['orderStatus', 'paymentStatus']
        ),
      },
      responses: {
        200: okObject('Saved', {
          orderId: f.int(),
          orderStatus: f.int(),
          paymentStatus: f.int(),
        }),
        404: { $ref: '#/components/responses/NotFound' },
        409: { description: 'No payment record on this order.' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/payment-status': {
    patch: operation('/api/admin/orders/{id}/legalisation/payment-status', {
      tag,
      summary: 'Payment Status alone',
      description: 'Writes `tbl_payment.s_paid` only. See the combined `…/status` route.',
      auth: 'bearer',
      body: {
        schema: body({ paymentStatus: { type: 'integer', enum: [0, 1, 2] } }, [
          'paymentStatus',
        ]),
      },
      responses: {
        200: okObject('Saved', { orderId: f.int(), paymentStatus: f.int() }),
        404: { $ref: '#/components/responses/NotFound' },
        409: { description: 'No payment record on this order.' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/address-confirmation/acknowledge': {
    post: operation(
      '/api/admin/orders/{id}/legalisation/address-confirmation/acknowledge',
      {
        tag,
        summary: 'Discard Notification — hide the "client confirmed the address" banner',
        description:
          'Sets `tbl_cls_order.is_address_confirmed` from 1 to 2. Idempotent: any other current value is left alone and `changed` is false.',
        auth: 'bearer',
        responses: {
          200: okObject('Done', {
            orderId: f.int(),
            addressConfirmed: f.int(),
            changed: f.bool(),
          }),
          404: { $ref: '#/components/responses/NotFound' },
        },
      }
    ),
  },

  '/api/admin/orders/{id}/legalisation/address-confirmation': {
    get: operation('/api/admin/orders/{id}/legalisation/address-confirmation', {
      tag,
      summary: 'Data for the address-confirmation email',
      description:
        'What the legacy `sendClientAddressConfirmationEmailAction` read: the client’s email (the order contact email, or the account email when the order is bulk), names, return address and the destination’s display name. The backend has no mailer — the Next route sends it.',
      auth: 'bearer',
      responses: {
        200: okObject('The data', { confirmation: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/legalisation/print/{sheet}': {
    get: operation('/api/admin/orders/{id}/legalisation/print/{sheet}', {
      tag,
      summary: 'Data for a printable sheet',
      description:
        'The legacy PHP print scripts are not in this repository, so these are designed sheets rather than ports: `return-address` (the client’s return address as a label), `embassy-to-from` (CLS to the destination embassy, from the `tbl_countries` record) and `order-label`.',
      auth: 'bearer',
      responses: {
        200: okObject('The sheet', { print: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/clearance': {
    get: operation('/api/admin/orders/{id}/clearance', {
      tag,
      summary: 'Everything the Police Clearance order screen renders',
      description:
        'Read-and-write counterpart of `GET /api/admin/orders/{id}/detail` for **police-clearance orders only** (`order_type` 5) — any other order is a 404. Reproduces the legacy `viewPoliceClearanceAction` screen: the four milestones, CLS Team Member, the Ticket Comments history, Applicant Details, Document Details and Payment Details; plus what the new order journey stores (`requirements`, `pricing`, the applicants’ date of birth and passport dates, the return address’s email, country and comment, the uploaded `documents`, the payment record).\n\n`history` is every `tbl_order_notes` row for the order, oldest first — the website’s own "Purpose: …" line among them. `requirements.purposeId` is that line’s slug. `stamps` are ISO instants; applicant dates are plain `YYYY-MM-DD`. `paymentState` is the shared Payment Details state from `GET /orders/{id}/payment` (Order Status, Payment Status, Account Number, Pay Now, invoices). Card details are never returned.',
      auth: 'bearer',
      responses: {
        200: okObject('The screen', { clearance: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/clearance/ticket': {
    patch: operation('/api/admin/orders/{id}/clearance/ticket', {
      tag,
      summary: 'Order Progress Submit — milestones, team member, ticket comment',
      description:
        'Reproduces the legacy update. Only fields present are written; `\'\'` clears a stamp. The first changed stamp (received, submitted, completed, closed — in that order) sets `notification.scantype`; a cleared stamp is not a milestone. A non-empty `ticketComments` appends a `tbl_order_notes` row (`user_type` Admin, `is_admin` 0 — the client-facing lane). A set "closed" stamp moves `tbl_cls_order.status` to 2, as the legacy did. The backend sends no email; the caller builds it from `notification`.',
      auth: 'bearer',
      body: {
        schema: body({
          allItemsReceivedAtCLS: f.string('ISO-8601 instant, or empty to clear.'),
          submittedForProcessing: f.string('ISO-8601 instant, or empty to clear.'),
          completedReceivedAtCLS: f.string('ISO-8601 instant, or empty to clear.'),
          orderOnRouteAndClosed: f.string('ISO-8601 instant, or empty to clear.'),
          clsTeamMember: f.string('`tbl_user_admin.id`, or empty for none.'),
          ticketComments: f.string('A new comment; emailed to the client.'),
        }),
      },
      responses: {
        200: okObject('Saved', {
          notification: { type: 'object' },
          history: { type: 'array', items: { type: 'object' } },
        }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/clearance/documents/{documentId}/file': {
    get: operation('/api/admin/orders/{id}/clearance/documents/{documentId}/file', {
      tag,
      summary: 'A document the client uploaded to the order',
      description:
        'Streams one `tbl_cls_order_documents` file (the passport copies, mostly), as an attachment. Staff only. The row must belong to this order.',
      auth: 'bearer',
      responses: {
        200: { description: 'The file.' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/orders/{id}/clearance/print/return-address': {
    get: operation('/api/admin/orders/{id}/clearance/print/return-address', {
      tag,
      summary: 'Data for the Print Return Address Label sheet',
      description:
        'The legacy `print-return-address-label.php` is not in this repository, so this is a designed sheet: the order’s return address as a shipping label.',
      auth: 'bearer',
      responses: {
        200: okObject('The sheet', { print: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/queues/{queue}': {
    get: operation('/api/admin/queues/{queue}', {
      tag,
      summary: 'One of the five service queues',
      description:
        'Reproduces a specific screen from the admin CLS has used for years, down to which columns it shows and which rows it includes — so each queue returns a **different row shape**.\n\nThey differ in what they include, not just what they display. `police-clearance` lists every order of that type, unplaced ones among them. `public-visa` lists only orders that were submitted *and* carry `status = 1`. `document-legalisation` has an invoice number and a reference no other service does.\n\nUse `/api/admin/orders` instead where one filterable queue across all services is wanted; this is for parity with the screens being replaced.',
      auth: 'bearer',
      query: [
        {
          name: 'search',
          description:
            'Matches the reference, and the contact name on the two queues that show one.',
        },
        ...PAGING,
      ],
      responses: {
        200: okObject('The queue', {
          rows: {
            type: 'array',
            items: { type: 'object' },
            description:
              'Columns vary by queue — see the description. Every row carries `id` and `status`.',
          },
          pagination: { type: 'object' },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
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
        {
          name: 'area',
          description: '`admin`, `dfat` or `client` — `tbl_logs.area`.',
        },
        { name: 'userId', description: '`tbl_user_admin.id`.', type: 'integer' },
        {
          name: 'search',
          description:
            'Substring match against the JSON blob in `log_details` — the same "Reference No." search the legacy Activity Log had, since nothing in this row is a structured reference column.',
        },
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
