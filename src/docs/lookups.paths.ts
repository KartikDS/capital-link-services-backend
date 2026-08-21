import { okObject, okRows, operation, type QueryParam } from './shared';

/**
 * Countries, visa types, fees and other reference data.
 *
 * All public, all cacheable — the website reads these with an hour's revalidation.
 * Nothing here takes a token and nothing here writes.
 *
 * **The fee endpoints are the source of truth for prices.** The website quotes from
 * them and the order endpoints price from the same rows, so a rate CLS changes in
 * their own admin moves the quote and the charge together. No amount is ever read
 * from a request body.
 */

const tag = 'Lookups';

/** A plain reference list: no parameters, no auth, one array back. */
const list = (
  path: string,
  summary: string,
  key: string,
  description?: string,
  query?: readonly QueryParam[]
) => ({
  get: operation(path, {
    tag,
    summary,
    ...(description ? { description } : {}),
    ...(query ? { query } : {}),
    errors: {},
    responses: { 200: okRows(summary, key) },
  }),
});

export const lookupPaths = {
  '/api/lookups/countries': {
    get: operation('/api/lookups/countries', {
      tag,
      summary: 'Every country, in CLS’s own order',
      description:
        'Ordered by `priority` before name. That column is how CLS pins its busiest destinations to the top of the select, and ignoring it would bury the UAE under Afghanistan and Albania.\n\n`services` on each row says which CLS services that country is offered for, so a form can narrow its own list.',
      query: [
        {
          name: 'service',
          description: 'Only countries offered for this service.',
          enum: [
            'police-clearance',
            'document-delivery',
            'document-legalisation',
            'translation',
          ],
        },
      ],
      errors: {},
      responses: {
        200: okObject('Countries', {
          countries: {
            type: 'array',
            items: { $ref: '#/components/schemas/Country' },
          },
        }),
      },
    }),
  },

  '/api/lookups/countries/{id}': {
    get: operation('/api/lookups/countries/{id}', {
      tag,
      summary: 'One country, with its service detail',
      description:
        'The extra columns a country page needs — processing notes, the service fee where one is recorded — which are too wide to send on every row of the list.',
      errors: { 404: { $ref: '#/components/responses/NotFound' } },
      responses: {
        200: okObject('The country', {
          country: { $ref: '#/components/schemas/Country' },
        }),
      },
    }),
  },

  '/api/lookups/nationalities': list(
    '/api/lookups/nationalities',
    'Nationalities for the applicant selects',
    'nationalities',
    'The same table as countries. A separate endpoint because the two are separate selects on every order form and they are filtered differently — a nationality list is never narrowed by which services CLS offers there.'
  ),

  '/api/lookups/states': list(
    '/api/lookups/states',
    'Australian states and territories',
    'states'
  ),

  '/api/lookups/titles': list(
    '/api/lookups/titles',
    'Name titles — Mr, Ms, Dr',
    'titles'
  ),

  '/api/lookups/passport-types': list(
    '/api/lookups/passport-types',
    'Passport types',
    'passportTypes',
    'Ordinary, diplomatic, official and the rest. The type changes which visa class an applicant is eligible for, which is why it is asked rather than assumed.'
  ),

  '/api/lookups/departments': list(
    '/api/lookups/departments',
    'Government departments, for the government visa journey',
    'departments'
  ),

  '/api/lookups/police-clearances': {
    get: operation('/api/lookups/police-clearances', {
      tag,
      summary: 'The police clearance fee list',
      description:
        'The published fee list. These are the prices the website quotes before checkout, and the only source for them — an order’s amount is computed from this table server-side, never from what the client’s payload claims.\n\nTwo prices per row: `priceCents` for the certificate and `additional.priceCents` for each extra applicant on the same order. A row with no price cannot be checked out.',
      errors: {},
      responses: {
        200: okObject('Clearances and their fees', {
          clearances: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'integer',
                  description:
                    '`tbl_police_clearances.id`. This is what an order is stored against.',
                },
                name: { type: 'string' },
                label: { type: 'string' },
                priceCents: { type: 'integer', nullable: true },
                additional: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', nullable: true },
                    priceCents: { type: 'integer', nullable: true },
                  },
                },
                information: {
                  type: 'string',
                  nullable: true,
                  description: '`gen_info` — CLS’s own description.',
                },
                form: {
                  type: 'string',
                  nullable: true,
                  description: 'A form the applicant has to print, if there is one.',
                },
              },
            },
          },
        }),
      },
    }),
  },

  '/api/lookups/voucher-types': {
    get: operation('/api/lookups/voucher-types', {
      tag,
      summary: 'The Russian voucher price matrix',
      description:
        'Five processing speeds across the columns of one row, which is why this is a matrix rather than a list: the website renders it as a table and needs each cell labelled.\n\n**A tier with a null fee is one CLS does not offer for that voucher.** The old price table drew those cells as a dash, and the order endpoint refuses a tier with no fee — so a form must not offer one either.',
      errors: {},
      responses: {
        200: okObject('Voucher types and their fees', {
          voucherTypes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'integer',
                  description:
                    '`tbl_russian_visa_voucher_types.id`. This is what an order is stored against.',
                },
                type: {
                  type: 'string',
                  nullable: true,
                  example: 'Tourist',
                },
                name: { type: 'string', example: '3 months' },
                label: { type: 'string' },
                entryOption: {
                  type: 'string',
                  nullable: true,
                  example: 'Single Entry',
                },
                active: { type: 'boolean' },
                sortOrder: { type: 'string', nullable: true },
                processing: {
                  type: 'array',
                  description: 'The five speeds, in column order.',
                  items: {
                    type: 'object',
                    properties: {
                      id: {
                        type: 'string',
                        enum: [
                          'thirteen-days',
                          'four-days',
                          'three-days',
                          'one-two-days',
                          'twelve-hours',
                        ],
                        description: 'Send this back as `tier` when lodging the order.',
                      },
                      label: { type: 'string', example: '1–2 days' },
                      feeCents: {
                        type: 'integer',
                        nullable: true,
                        description:
                          'Null means this voucher is not issued at that speed.',
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      },
    }),
  },

  '/api/lookups/visa-types': {
    get: operation('/api/lookups/visa-types', {
      tag,
      summary: 'Visa types, for either audience',
      description:
        'Two tables behind one endpoint. `tbl_public_visa_types` and `tbl_visa_types` hold the same kind of row for different audiences — a walk-in client and a government department get different lists and different prices. `?audience` picks one; without it, both come back tagged.',
      query: [
        {
          name: 'audience',
          description: 'Which table to read. Omit for both, each row tagged.',
          enum: ['public', 'government'],
        },
        {
          name: 'countryId',
          description: 'Only types for this destination.',
          type: 'integer',
        },
      ],
      errors: {},
      responses: { 200: okRows('Visa types', 'visaTypes') },
    }),
  },

  '/api/lookups/visa-types/{id}/requirements': {
    get: operation('/api/lookups/visa-types/{id}/requirements', {
      tag,
      summary: 'What a visa needs, and where it is processed',
      description:
        'The extra requirements and the consulates a visa is processed at. Both are keyed on `visa_id` / `visa_type_id`, and the public and government requirement tables are separate with identical shapes — so both are read and merged rather than guessing which audience the caller meant.',
      errors: { 404: { $ref: '#/components/responses/NotFound' } },
      responses: {
        200: okObject('Requirements and consulates', {
          requirements: { type: 'array', items: { type: 'object' } },
          locations: { type: 'array', items: { type: 'object' } },
        }),
      },
    }),
  },

  '/api/lookups/courier-options': list(
    '/api/lookups/courier-options',
    'Return courier options and their charges',
    'courierOptions',
    'What the client can choose for getting documents back. Priced per option, and the charge is added to the order server-side from this table.'
  ),

  '/api/lookups/locations': list(
    '/api/lookups/locations',
    'CLS offices and the consulates it lodges at',
    'locations'
  ),

  '/api/lookups/document-types': {
    get: operation('/api/lookups/document-types', {
      tag,
      summary: 'The documents a visa requires',
      description:
        'What a client has to supply for a given visa. Narrowed by whichever of the four keys the caller supplies — unnarrowed this is every document requirement CLS has ever recorded, which is a list nobody wants.',
      query: [
        {
          name: 'visaTypeId',
          description: 'Requirements for one visa type.',
          type: 'integer',
        },
        {
          name: 'countryId',
          description: 'Requirements for one destination.',
          type: 'integer',
        },
        {
          name: 'nationalityId',
          description: 'Requirements for one nationality.',
          type: 'integer',
        },
        {
          name: 'audience',
          description: 'Which visa table the type id belongs to.',
          enum: ['public', 'government'],
        },
      ],
      errors: {},
      responses: { 200: okRows('Document requirements', 'documentTypes') },
    }),
  },

  '/api/lookups/categories': list(
    '/api/lookups/categories',
    'Service categories, for the website’s navigation',
    'categories'
  ),

  '/api/lookups/additional-services': list(
    '/api/lookups/additional-services',
    'Optional extras and their charges',
    'additionalServices'
  ),

  '/api/lookups/card-types': list(
    '/api/lookups/card-types',
    'Accepted card types and their surcharges',
    'cardTypes',
    'The surcharge is per card type — `tbl_credit_card_processing` records a different rate for Amex — so a total cannot be computed without knowing which card is being used.'
  ),

  '/api/lookups/terminals': list(
    '/api/lookups/terminals',
    'Payment terminals, for the back office',
    'terminals'
  ),

  '/api/lookups/settings': {
    get: operation('/api/lookups/settings', {
      tag,
      summary: 'The single-row fee tables, gathered into one response',
      description:
        'The single-row fee tables, gathered into one response. `tbl_settings_tpn`, `tbl_settings_passport` and `tbl_credit_card_processing` each hold one row of configuration, and five requests to fetch five numbers is worse than one.',
      errors: {},
      responses: {
        200: okObject('Settings', { settings: { type: 'object' } }),
      },
    }),
  },
} as const;
