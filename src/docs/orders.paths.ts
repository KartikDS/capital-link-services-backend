import { PAGING, body, f, okList, okObject, okRef, operation } from './shared';

/**
 * Lodging, tracking and reading orders.
 *
 * ## The rule that shapes every request body here
 *
 * **No amount is accepted from a client.** There is no `price`, `total` or
 * `amountCents` field on any lodgement below. A request names catalogue ids — a
 * clearance, a voucher tier, a visa type — and the fee is looked up from the same
 * tables `/api/lookups` publishes. A payload that stated its own total would have
 * that field stripped before a handler saw it.
 *
 * The `/quote` endpoints exist so a website can show a total before lodging
 * anything. They run the same pricing functions the lodgement path does, so the
 * figure quoted and the figure charged cannot disagree.
 *
 * ## Two order families
 *
 * A reference lookup tries `tbl_cls_order` first and falls back to `tbl_orders`.
 * Both are live — the older application still writes the second — so `source` on
 * the response says which family a row came from.
 *
 * ## `drafts` and `quote` are literal prefixes, not references
 *
 * `/api/orders/drafts/{service}` and `/api/orders/{reference}/timeline` have the
 * same shape, so `/api/orders/drafts/anything` matches both patterns. Express
 * resolves it by registration order — `/quote` and `/drafts` are mounted before
 * `/:reference` — so the literal prefixes win and **`drafts` and `quote` cannot be
 * used as order references.** Neither is a plausible reference, so nothing is lost.
 *
 * That ordering is load-bearing: reversing it would shadow six endpoints, each
 * answering a plausible-looking 404. `tests/routes/app.test.ts` asserts it.
 *
 * ## Signing in is optional on a lodgement
 *
 * Send a bearer token and the order is attached to the account, so it appears in
 * that client's portal. Omit it and the order still lodges as a guest order,
 * traceable by its contact address and linkable to an account later. A **bad** token
 * is still refused — the choice is between "no token" and "a valid one", not
 * between "checked" and "unchecked".
 */

const tag = 'Orders';

/** Every lodgement answers the same way. */
const lodged = {
  201: okRef('Lodged', 'LodgedOrder'),
  503: { $ref: '#/components/responses/ReadOnly' },
} as const;

const contact = { $ref: '#/components/schemas/Contact' };
const applicants = {
  type: 'array',
  minItems: 1,
  maxItems: 20,
  items: { $ref: '#/components/schemas/Applicant' },
  description:
    'At least one, at most twenty. `tbl_cls_order.no_of_traveller` records the count and each applicant is a row written in the same transaction; past twenty this becomes a bulk job, which the old application has its own flow for.',
};
const returnAddress = { $ref: '#/components/schemas/ReturnAddress' };

export const orderPaths = {
  // -------------------------------------------------------------------------
  // Quotes — priced from the catalogue, no order created
  // -------------------------------------------------------------------------

  '/api/orders/quote/police-clearance': {
    post: operation('/api/orders/quote/police-clearance', {
      tag,
      summary: 'Price a police clearance without lodging it',
      description:
        'The clearance charge, the additional applicants and GST, itemised. Priced from `tbl_police_clearances` — the same rows `/api/lookups/police-clearances` publishes.',
      body: {
        schema: body(
          {
            clearanceId: f.int('`tbl_police_clearances.id`.'),
            applicants: f.int('How many people are on the application.'),
            courierOptionId: f.id(
              '`tbl_visa_courier_options.id`, when a return courier is chosen.'
            ),
          },
          ['clearanceId', 'applicants']
        ),
      },
      responses: {
        200: okObject('The quote', { quote: { $ref: '#/components/schemas/Quote' } }),
      },
    }),
  },

  '/api/orders/quote/russian-visa-voucher': {
    post: operation('/api/orders/quote/russian-visa-voucher', {
      tag,
      summary: 'Price a Russian voucher without lodging it',
      description:
        'Priced from the fee column named by `tier`. A tier the voucher has no fee for is refused rather than priced at zero — see `/api/lookups/voucher-types`.',
      body: {
        schema: body(
          {
            voucherTypeId: f.int('`tbl_russian_visa_voucher_types.id`.'),
            tier: {
              type: 'string',
              enum: [
                'thirteen-days',
                'four-days',
                'three-days',
                'one-two-days',
                'twelve-hours',
              ],
              description: 'Which of the row’s five fee columns to charge.',
            },
            applicants: f.int(),
            courierOptionId: f.id('`tbl_visa_courier_options.id`.'),
          },
          ['voucherTypeId', 'tier', 'applicants']
        ),
      },
      responses: {
        200: okObject('The quote', { quote: { $ref: '#/components/schemas/Quote' } }),
      },
    }),
  },

  '/api/orders/quote/visa': {
    post: operation('/api/orders/quote/visa', {
      tag,
      summary: 'Price a visa without lodging it',
      description:
        'Priced from the visa type’s own row. The government and public tables hold different prices for the same visa, so the type id decides which — there is no separate audience field on the quote.',
      body: {
        schema: body(
          {
            visaTypeId: f.int('`tbl_public_visa_types.id` or `tbl_visa_types.id`.'),
            applicants: f.int(),
            courierOptionId: f.id('`tbl_visa_courier_options.id`.'),
          },
          ['visaTypeId', 'applicants']
        ),
      },
      responses: {
        200: okObject('The quote', { quote: { $ref: '#/components/schemas/Quote' } }),
      },
    }),
  },

  '/api/orders/quote/attestation': {
    post: operation('/api/orders/quote/attestation', {
      tag,
      summary: 'Ask what an attestation costs (it is quoted by hand)',
      description:
        'Always answers `quoteRequired: true`. Legalisation is priced per document by a consultant — that is what `tbl_order_dl_quotes` exists for — and the indicative from-price is the country’s service fee where one is recorded, clearly labelled as indicative rather than as a quote.',
      body: {
        schema: body({
          destinationCountryId: f.id('`tbl_countries.id`.'),
          documents: f.int('How many documents.'),
        }),
      },
      responses: {
        200: okObject(
          'A quote-required answer, with an indicative figure if there is one',
          {
            quote: { $ref: '#/components/schemas/Quote' },
          }
        ),
      },
    }),
  },

  // -------------------------------------------------------------------------
  // Lodging
  // -------------------------------------------------------------------------

  '/api/orders/police-clearance': {
    post: operation('/api/orders/police-clearance', {
      tag,
      summary: 'Lodge a police clearance order',
      description:
        'Writes `tbl_cls_order` plus `tbl_police_clearance_order_details` and one applicant row each. The amount is computed from `clearanceId` and the applicant count — nothing in this body sets a price.\n\n`countryId` is the country whose employer, embassy or agency asked for the certificate. It is not the country issuing it: that is a property of the clearance.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            clearanceId: f.int('`tbl_police_clearances.id`.'),
            contact,
            applicants,
            countryId: f.id(
              'Who asked for the certificate. Optional — plenty of clients order one for their own records.'
            ),
            departureDate: f.date(),
            courierOptionId: f.id('`tbl_visa_courier_options.id`.'),
            returnAddress,
          },
          ['clearanceId', 'contact', 'applicants']
        ),
      },
      responses: lodged,
    }),
  },

  '/api/orders/russian-visa-voucher': {
    post: operation('/api/orders/russian-visa-voucher', {
      tag,
      summary: 'Lodge a Russian visa voucher order',
      description:
        'Writes `tbl_cls_order` plus `tbl_russian_visa_voucher_order_details`. Charged from the fee column named by `tier`.\n\n`comment` is the only free-text column on the detail table, so anything the form collected that has no column of its own — a second entry pair on a double-entry voucher, where the visa will be lodged — belongs there rather than nowhere.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            voucherTypeId: f.int('`tbl_russian_visa_voucher_types.id`.'),
            tier: {
              type: 'string',
              enum: [
                'thirteen-days',
                'four-days',
                'three-days',
                'one-two-days',
                'twelve-hours',
              ],
            },
            contact,
            applicants,
            entryDate: f.date('First entry into Russia.'),
            departureDate: f.date('First departure.'),
            cities: f.string('Cities being visited. `varchar(255)`.'),
            hotels: f.string('Where the traveller is staying.'),
            appliedAt: f.string('Where the visa will be lodged.'),
            employer: {
              type: 'object',
              description:
                'Required in practice on a business voucher — the Russian host needs it to raise the invitation — and optional on a tourist one.',
              properties: {
                company: f.string(),
                position: f.string(),
                phone: f.string(),
                address: f.string(),
                city: f.string(),
                state: f.string(),
                postcode: f.string(),
                countryId: f.id('`tbl_countries.id`.'),
              },
            },
            comment: f.string('Up to 2000 characters.'),
            courierOptionId: f.id('`tbl_visa_courier_options.id`.'),
          },
          ['voucherTypeId', 'tier', 'contact', 'applicants']
        ),
      },
      responses: lodged,
    }),
  },

  '/api/orders/visa': {
    post: operation('/api/orders/visa', {
      tag,
      summary: 'Lodge a visa order',
      description:
        'Writes `tbl_cls_order` plus its visa detail and applicant rows.\n\n**`visaTypeId` may be null.** The corporate journey collects a visa *category* from the list a service page publishes rather than a catalogue row, and the two have no shared key — guessing which row a category means would put a wrong fee on the order. So a null type records the destination, answers `quoteRequired: true`, and a consultant confirms the type.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            visaTypeId: f.id(
              '`tbl_public_visa_types.id`, or null when it is not known yet.'
            ),
            destinationCountryId: f.int('`tbl_countries.id`.'),
            contact,
            applicants,
            entryOption: f.id(
              'Single, double or multiple, where the visa distinguishes them.'
            ),
            travelPurpose: f.string(
              'Free text. The one field for anything the detail table has no column for.'
            ),
            departureDate: f.date(),
            entryDate: f.date(),
            exitDate: f.date(),
            courierOptionId: f.id('`tbl_visa_courier_options.id`.'),
            returnAddress,
          },
          ['destinationCountryId', 'contact', 'applicants']
        ),
      },
      responses: lodged,
    }),
  },

  '/api/orders/attestation': {
    post: operation('/api/orders/attestation', {
      tag,
      summary: 'Lodge a document attestation order',
      description:
        'Writes `tbl_cls_order` plus the legalisation detail and one row per document.\n\n**No amount is recorded, and that is correct rather than incomplete.** Legalisation is priced per document by a consultant, so the response answers `quoteRequired: true` and the quote follows through `POST /api/admin/orders/{reference}/quote`.\n\n`documents[].note` is the only free-text column the legalisation tables have, so anything a client wrote that has no column of its own goes there.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            contact,
            destinationCountryId: f.id('Where the documents are going.'),
            nationalityCountryId: f.id('Where they were issued.'),
            documents: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['documentType'],
                properties: {
                  documentType: f.string('What the document is — "Birth certificate".'),
                  quantity: f.int('Defaults to 1.'),
                  note: f.string(),
                },
              },
            },
            returnAddress,
          },
          ['contact', 'documents']
        ),
      },
      responses: lodged,
    }),
  },

  '/api/orders/document-legalisation': {
    post: operation('/api/orders/document-legalisation', {
      tag,
      summary: 'Lodge a document legalisation order',
      description:
        'The same body and the same tables as `/api/orders/attestation`. Both names exist because the website uses both words for the service and its own routes were built against both — and changing either would break a page already in production.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            contact,
            destinationCountryId: f.id('Where the documents are going.'),
            nationalityCountryId: f.id('Where they were issued.'),
            documents: {
              type: 'array',
              minItems: 1,
              items: {
                type: 'object',
                required: ['documentType'],
                properties: {
                  documentType: f.string(),
                  quantity: f.int(),
                  note: f.string(),
                },
              },
            },
            returnAddress,
          },
          ['contact', 'documents']
        ),
      },
      responses: lodged,
    }),
  },

  // -------------------------------------------------------------------------
  // Tracking and reading
  // -------------------------------------------------------------------------

  '/api/orders/track': {
    get: operation('/api/orders/track', {
      tag,
      summary: 'Look up an order by reference and email',
      description:
        'For a client with no account. Rate limited, because a reference plus an email is a guessable pair and the legacy family’s references are sequential integers.\n\n**A miss and a mismatch both answer 404 with the same wording.** Saying "that reference exists but the email is wrong" would confirm the reference.\n\nCarries no amounts, deliberately: anyone who guesses a pair learns the service and its stage, and nothing about what it cost.',
      query: [
        {
          name: 'reference',
          description: 'The order reference.',
          required: true,
          example: 'CLS-100482',
        },
        {
          name: 'email',
          description: 'The address on the order.',
          required: true,
        },
      ],
      responses: {
        200: okObject('The order', { order: { $ref: '#/components/schemas/Order' } }),
        404: { $ref: '#/components/responses/NotFound' },
        429: { $ref: '#/components/responses/TooManyRequests' },
      },
    }),
  },

  '/api/orders/mine': {
    get: operation('/api/orders/mine', {
      tag,
      summary: 'Your own orders, from both families',
      description:
        'Both order families, merged and paged. `?stage` filters on the derived stage, which no column holds — so it is applied after the merge, and the total reflects the filter rather than the table count.',
      auth: 'bearer',
      query: [
        {
          name: 'stage',
          description: 'Filter on the derived stage.',
          enum: ['action-required', 'in-progress', 'ready', 'completed'],
        },
        ...PAGING,
      ],
      responses: { 200: okList('Your orders', 'orders', 'Order', true) },
    }),
  },

  '/api/orders/my-applications': {
    get: operation('/api/orders/my-applications', {
      tag,
      summary: 'Your orders, in the old application’s shape',
      description:
        'The same rows as `/api/orders/mine` under the field names the old application’s screens use. Kept because something is already built against them; new callers should use `/api/orders/mine`.',
      auth: 'bearer',
      query: [...PAGING],
      responses: {
        200: okObject('Your applications', {
          applications: { type: 'array', items: { type: 'object' } },
          pagination: { $ref: '#/components/schemas/Pagination' },
        }),
      },
    }),
  },

  '/api/orders/{reference}': {
    get: operation('/api/orders/{reference}', {
      tag,
      summary: 'One order',
      description:
        'Tries `tbl_cls_order` first, then `tbl_orders`. A reference that is not yours answers 404, not 403 — distinguishing the two lets the API be walked to discover which references are real.',
      auth: 'bearer',
      responses: {
        200: okObject('The order', { order: { $ref: '#/components/schemas/Order' } }),
      },
    }),
  },

  '/api/orders/{reference}/timeline': {
    get: operation('/api/orders/{reference}/timeline', {
      tag,
      summary: 'What has happened to an order',
      description:
        'Built from the milestone dates on the order’s detail table. There is no event log in this schema, so the timeline is what those four dates imply rather than a record of every change.',
      auth: 'bearer',
      responses: {
        200: okObject('The timeline', {
          timeline: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                at: { type: 'string', format: 'date-time', nullable: true },
                done: { type: 'boolean' },
              },
            },
          },
        }),
      },
    }),
  },

  '/api/orders/{reference}/comments': {
    get: operation('/api/orders/{reference}/comments', {
      tag,
      summary: 'The client-visible notes on an order',
      description:
        'Filtered on `is_admin`, so a note a consultant marked internal is not returned here. That flag is the whole difference between a note a client sees and one they do not.',
      auth: 'bearer',
      responses: {
        200: okObject('Comments', {
          comments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'integer' },
                body: { type: 'string' },
                author: { type: 'string', nullable: true },
                createdAt: { type: 'string', format: 'date-time', nullable: true },
              },
            },
          },
        }),
      },
    }),
  },

  '/api/orders/{reference}/documents': {
    get: operation('/api/orders/{reference}/documents', {
      tag,
      summary: 'The documents on an order',
      auth: 'bearer',
      responses: {
        200: okList('Documents', 'documents', 'Document'),
      },
    }),

    post: operation('/api/orders/{reference}/documents', {
      tag,
      summary: 'Upload documents against an order',
      description:
        '`multipart/form-data`, field name `files` — several at once. The multipart parser runs before the body is read, because `express.json()` would otherwise have consumed the stream.\n\nNothing under the upload directory is served statically; a file is read back through `/api/portal/documents/{id}/download`, which checks ownership first.',
      auth: 'bearer',
      responses: {
        201: okList('Stored', 'documents', 'Document'),
        413: { description: 'A file was larger than the configured limit' },
        415: { description: 'An extension that is not accepted' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/orders/{reference}/payments': {
    get: operation('/api/orders/{reference}/payments', {
      tag,
      summary: 'What has been paid on an order',
      auth: 'bearer',
      responses: { 200: okList('Payments', 'payments', 'Payment') },
    }),
  },

  '/api/orders/{reference}/cancel': {
    post: operation('/api/orders/{reference}/cancel', {
      tag,
      summary: 'Ask for an order to be cancelled',
      description:
        '**This does not set a cancelled status, because there is not one.** `tbl_cls_order.status` has three documented values and none of them is cancelled, and the old application reads the same column — so inventing a fourth would be a number it does not recognise.\n\nWhat this does instead is record the request as a note on the order and answer `pending: true`, so a consultant actions it. The response says so plainly rather than reporting a cancellation that did not happen.',
      auth: 'bearer',
      body: { schema: body({ reason: f.string('Why. Shown to the consultant.') }) },
      responses: {
        200: okObject('The request was recorded', {
          pending: {
            type: 'boolean',
            description: 'Always true. A consultant has to action it.',
          },
          message: { type: 'string' },
        }),
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  // -------------------------------------------------------------------------
  // Drafts
  // -------------------------------------------------------------------------

  '/api/orders/drafts': {
    get: operation('/api/orders/drafts', {
      tag,
      summary: 'Your saved order drafts',
      description:
        'A half-filled order journey, kept so a client can come back to it from another device. One per service.',
      auth: 'bearer',
      responses: {
        200: okObject('Drafts', {
          drafts: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                service: { type: 'string' },
                savedAt: { type: 'string', format: 'date-time', nullable: true },
                draft: { type: 'object' },
              },
            },
          },
        }),
      },
    }),

    post: operation('/api/orders/drafts', {
      tag,
      summary: 'Save an order draft',
      description:
        'Replaces the draft for that service — one per service, per client. The payload is stored as-is and never read for pricing.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            service: {
              type: 'string',
              enum: [
                'visa',
                'police-clearance',
                'russian-visa-voucher',
                'attestation',
                'document-legalisation',
              ],
            },
            draft: {
              type: 'object',
              description: 'Whatever the journey holds. Opaque to the API.',
            },
          },
          ['service', 'draft']
        ),
      },
      responses: {
        200: okObject('Saved', { message: { type: 'string' } }),
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/orders/drafts/{service}': {
    get: operation('/api/orders/drafts/{service}', {
      tag,
      summary: 'One saved draft',
      auth: 'bearer',
      responses: {
        200: okObject('The draft', {
          draft: { type: 'object', nullable: true },
          savedAt: { type: 'string', format: 'date-time', nullable: true },
        }),
      },
    }),

    delete: operation('/api/orders/drafts/{service}', {
      tag,
      summary: 'Discard a saved draft',
      auth: 'bearer',
      responses: {
        200: okObject('Discarded', { message: { type: 'string' } }),
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },
} as const;
