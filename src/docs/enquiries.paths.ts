import { PAGING, body, f, okList, okObject, operation } from './shared';

/**
 * The public intake forms, and the queue staff work them from.
 *
 * Every form on the website lands in `tbl_inquiries`, except the translation one,
 * which has its own table because its request is structured — a source language, a
 * target language and a document — and folding those into free text would make the
 * queue unusable for the one service where the request is not prose.
 *
 * **`tbl_inquiries` has five usable columns**: name, email, phone, subject and
 * query. Anything a form collects beyond those is folded into the message as
 * labelled lines. That is lossy in shape but not in content — a consultant reading
 * the record sees everything the client typed.
 */

const tag = 'Enquiries';

/** The columns every intake form fills. */
const baseFields = {
  name: f.string(),
  email: f.email(),
  phone: f.string(),
  message: f.string(),
  subject: f.string('Becomes the queue’s filter label.'),
};

const persisted = okObject('Recorded', {
  enquiry: { $ref: '#/components/schemas/Enquiry' },
  message: { type: 'string' },
  warning: {
    type: 'string',
    description: 'Set when part of the submission had nowhere to be stored.',
  },
});

export const enquiryPaths = {
  '/api/enquiries': {
    post: operation('/api/enquiries', {
      tag,
      summary: 'The general contact form',
      description:
        'The website’s main enquiry form. The company and the page it was sent from are folded into the message as labelled lines, because the table has no columns for them.',
      body: {
        schema: body({ ...baseFields, company: f.string() }, [
          'name',
          'email',
          'message',
        ]),
      },
      responses: { 201: persisted, 503: { $ref: '#/components/responses/ReadOnly' } },
    }),
  },

  '/api/enquiries/visa': {
    post: operation('/api/enquiries/visa', {
      tag,
      summary: 'The visa Apply Now card',
      description:
        'The card’s four catalogue answers plus the applicant’s contact details. The destination and nationality arrive as text rather than as `tbl_countries` ids: an enquiry is not an order, nothing joins on them, and a consultant reading "Destination: Saudi Arabia" needs no id.\n\n`heardAboutUs` is the referral answer the card now asks for, already resolved to a label ("Google Search", not "google-search"), and is folded into `query` alongside the destination and visa type.',
      body: {
        schema: body(
          {
            ...baseFields,
            company: f.string(),
            destination: f.string(),
            nationality: f.string(),
            visaType: f.string(),
            heardAboutUs: f.string(),
          },
          ['name', 'email']
        ),
      },
      responses: { 201: persisted, 503: { $ref: '#/components/responses/ReadOnly' } },
    }),
  },

  '/api/enquiries/translation': {
    post: operation('/api/enquiries/translation', {
      tag,
      summary: 'The NAATI translation form',
      description:
        'Its own table, because the request is structured. Note the shorter column widths — `varchar(225)` here against `varchar(255)` on `tbl_inquiries` — which is why this schema is separate rather than reusing the base one.\n\n`tbl_translation_services` has no message column. A free-text note is appended to `document_name` only if it fits; otherwise it is reported as not stored in `warning`, because truncating a client’s note halfway through a sentence is worse than telling them to send it by email.',
      body: {
        schema: body(
          {
            name: f.string(),
            email: f.email(),
            phone: f.string(),
            languageFrom: f.string(),
            languageTo: f.string(),
            documentName: f.string(),
            message: f.string('Appended to the document name if it fits.'),
          },
          ['name', 'email', 'languageFrom', 'languageTo']
        ),
      },
      responses: { 201: persisted, 503: { $ref: '#/components/responses/ReadOnly' } },
    }),
  },

  '/api/enquiries/corporate': {
    post: operation('/api/enquiries/corporate', {
      tag,
      summary: 'The corporate account enquiry',
      description:
        'For a company wanting terms rather than a one-off order. The volumes and the services wanted are folded into the message.',
      body: {
        schema: body(
          {
            ...baseFields,
            company: f.string(),
            position: f.string(),
            services: {
              type: 'array',
              items: { type: 'string' },
              description: 'Which services the company is asking about.',
            },
          },
          ['name', 'email', 'company']
        ),
      },
      responses: { 201: persisted, 503: { $ref: '#/components/responses/ReadOnly' } },
    }),
  },

  '/api/enquiries/call-back': {
    post: operation('/api/enquiries/call-back', {
      tag,
      summary: 'Request a call back',
      description:
        'The shortest form on the website: a name, a number and a time. The message is optional here, unlike every other form, because the whole point is that the client would rather talk than type.',
      body: {
        schema: body(
          {
            name: f.string(),
            phone: f.string(),
            email: f.email(),
            preferredTime: f.string('Free text — "after 3pm", "weekday mornings".'),
            message: f.string(),
          },
          ['name', 'phone']
        ),
      },
      responses: { 201: persisted, 503: { $ref: '#/components/responses/ReadOnly' } },
    }),
  },

  '/api/enquiries/admin': {
    get: operation('/api/enquiries/admin', {
      tag,
      summary: 'The enquiry queue',
      auth: 'bearer',
      query: [
        {
          name: 'status',
          description:
            'Filter by status. Free text, because the column is `char(100)` with no enumeration.',
        },
        { name: 'search', description: 'Matches name, email or message.' },
        ...PAGING,
      ],
      responses: {
        200: okList('The queue', 'enquiries', 'Enquiry', true),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),
  },

  '/api/enquiries/admin/{id}': {
    get: operation('/api/enquiries/admin/{id}', {
      tag,
      summary: 'One enquiry',
      auth: 'bearer',
      responses: {
        200: okObject('The enquiry', {
          enquiry: { $ref: '#/components/schemas/Enquiry' },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),

    patch: operation('/api/enquiries/admin/{id}', {
      tag,
      summary: 'Change an enquiry’s status',
      description:
        '`status` is a `char(100)` with no enumeration, so any word fits. The values below are the ones this API uses; a status the old application wrote is preserved rather than normalised, because it means something to whoever set it.',
      auth: 'bearer',
      body: {
        schema: body({
          status: {
            type: 'string',
            enum: ['new', 'in-progress', 'answered', 'closed'],
            description: 'Any string is accepted. These are the ones this API sets.',
          },
        }),
      },
      responses: {
        200: okObject('Updated', {
          enquiry: { $ref: '#/components/schemas/Enquiry' },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),

    delete: operation('/api/enquiries/admin/{id}', {
      tag,
      summary: 'Delete an enquiry',
      description: 'For spam. There is no soft delete on this table.',
      auth: 'bearer',
      responses: {
        200: okObject('Deleted', { message: { type: 'string' } }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/enquiries/admin/{id}/notes': {
    post: operation('/api/enquiries/admin/{id}/notes', {
      tag,
      summary: 'Add a note to an enquiry',
      description:
        'Appended to `query`, because there is no notes column on this table. Prefixed with a timestamp and the word "Note" so a consultant reading the record can tell their colleague’s addition from what the client originally wrote.',
      auth: 'bearer',
      body: { schema: body({ note: f.string() }, ['note']) },
      responses: {
        200: okObject('Appended', {
          enquiry: { $ref: '#/components/schemas/Enquiry' },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/enquiries/admin/translation/list': {
    get: operation('/api/enquiries/admin/translation/list', {
      tag,
      summary: 'The translation queue',
      description:
        'A separate queue because translation enquiries are in their own table, with a structured request the general queue has no columns to show.',
      auth: 'bearer',
      query: [...PAGING],
      responses: {
        200: okObject('The translation queue', {
          enquiries: { type: 'array', items: { type: 'object' } },
          pagination: { $ref: '#/components/schemas/Pagination' },
        }),
        403: { $ref: '#/components/responses/Forbidden' },
      },
    }),
  },
} as const;
