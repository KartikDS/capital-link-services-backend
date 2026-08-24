/**
 * The reusable halves of the document: security schemes, schemas and responses.
 *
 * Split out of `config/swagger.ts` so that file is the assembly — info, tags,
 * servers — and nothing else. What lives here is anything more than one path refers
 * to; a shape used by a single endpoint stays inline in that endpoint, where it can
 * be read without a jump.
 */

export const components = {
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'The access token from `POST /api/auth/login`.',
    },
    internalSecret: {
      type: 'apiKey',
      in: 'header',
      name: 'x-internal-secret',
      description:
        'Shared secret for server-to-server calls. Never send this from a browser.',
    },
  },

  schemas: {
    Error: {
      type: 'object',
      properties: {
        error: { type: 'string', example: 'We could not find that.' },
        message: { type: 'string', example: 'We could not find that.' },
        code: { type: 'string', example: 'not_found' },
        fields: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: 'Present on validation failures, keyed by input name.',
        },
        reference: {
          type: 'string',
          description:
            'Only on a 5xx. Quote it to support — it finds the server log line.',
        },
      },
    },

    Pagination: {
      type: 'object',
      properties: {
        page: { type: 'integer', example: 1 },
        perPage: { type: 'integer', example: 20 },
        total: { type: 'integer', example: 143 },
        totalPages: { type: 'integer', example: 8 },
      },
    },

    SignedInUser: {
      type: 'object',
      properties: {
        id: {
          type: 'integer',
          description: 'Row id in the table named by `audience`.',
        },
        audience: { type: 'string', enum: ['client', 'admin'] },
        email: { type: 'string', nullable: true },
        name: { type: 'string', nullable: true },
        clientType: {
          type: 'string',
          nullable: true,
          enum: ['public', 'corporate', 'government', null],
          description: '`tbl_user_client.type`. Null for staff.',
        },
        company: { type: 'string', nullable: true },
        accountNumber: {
          type: 'string',
          nullable: true,
          description: '`tbl_user_client.display_id` — the number on invoices.',
        },
        emailVerified: {
          type: 'boolean',
          description:
            'Whether the address has been confirmed. There is no `email_verified` column on `tbl_user_client`, so this is derived from `activation_code` being blank — the same column the Acme application reads. Always true for staff, who have no address to confirm.

Reported, not enforced: an unconfirmed client is still issued a session, so a registration that happened mid-order can be carried on. Use it to ask them to confirm, not to bar them.',
        },
      },
    },

    Session: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
        expiresIn: {
          type: 'integer',
          example: 3600,
          description:
            'Seconds until the access token expires. Refresh before this, not after.',
        },
        user: { $ref: '#/components/schemas/SignedInUser' },
      },
    },

    Order: {
      type: 'object',
      description:
        'One order, drawn from `tbl_cls_order` or `tbl_orders` depending on which family holds the reference.',
      properties: {
        reference: { type: 'string', example: 'CLS-100482' },
        orderType: {
          type: 'string',
          nullable: true,
          example: 'Document legalisation',
        },
        orderTypeCode: {
          type: 'integer',
          nullable: true,
          description: '`order_type` as stored. 1=visa … 9=document legalisation.',
        },
        service: { type: 'string', nullable: true },
        detail: {
          type: 'string',
          nullable: true,
          example: '2 applicants · Dubai',
        },
        applicant: { type: 'string', nullable: true },
        destination: { type: 'string', nullable: true },
        stage: {
          type: 'string',
          enum: ['action-required', 'in-progress', 'ready', 'completed'],
          description: 'Derived — no single column holds this.',
        },
        status: { type: 'string' },
        statusLabel: { type: 'string' },
        progress: {
          type: 'integer',
          description:
            'Percentage from how many milestone dates are set. Approximate by nature.',
        },
        milestone: { type: 'string', nullable: true },
        eta: { type: 'string', format: 'date-time', nullable: true },
        updated: { type: 'string', format: 'date-time' },
        submittedAt: { type: 'string', format: 'date-time', nullable: true },
        departureDate: { type: 'string', format: 'date', nullable: true },
        amountCents: { type: 'integer', nullable: true },
        quoteRequired: {
          type: 'boolean',
          description: 'True when no figure is set because a consultant prices it.',
        },
        transactionId: { type: 'string', nullable: true },
        source: {
          type: 'string',
          enum: ['cls_order', 'legacy_order'],
          description: 'Which order family this row came from.',
        },
      },
    },

    Country: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        code: { type: 'string', nullable: true, example: 'AE' },
        name: { type: 'string' },
        displayName: { type: 'string', nullable: true },
        services: {
          type: 'object',
          description: 'Which CLS services this country is offered for.',
          properties: {
            policeClearance: { type: 'boolean' },
            documentDelivery: { type: 'boolean' },
            documentLegalisation: { type: 'boolean' },
            translation: { type: 'boolean' },
          },
        },
      },
    },

    /**
     * What every lodgement answers with.
     *
     * The reference is the point: it is what the client quotes afterwards, and what
     * the Stripe webhook records the payment against.
     */
    LodgedOrder: {
      type: 'object',
      properties: {
        order: {
          type: 'object',
          properties: {
            reference: { type: 'string', example: 'CLS-100482' },
            orderId: {
              type: 'integer',
              description: '`tbl_cls_order.id`, for the detail endpoints.',
            },
            quote: { $ref: '#/components/schemas/Quote' },
          },
        },
      },
    },

    Quote: {
      type: 'object',
      description:
        'A price, itemised. Computed from the fee tables — no amount in a request is ever read.',
      properties: {
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              label: { type: 'string' },
              quantity: { type: 'integer' },
              unitCents: { type: 'integer' },
              totalCents: { type: 'integer' },
            },
          },
        },
        subtotalCents: { type: 'integer' },
        gstCents: { type: 'integer' },
        totalCents: { type: 'integer' },
        currency: { type: 'string', example: 'AUD' },
        quoteRequired: {
          type: 'boolean',
          description:
            'True when CLS prices this service by hand, so there is no total yet.',
        },
        reason: {
          type: 'string',
          description: 'Why there is no total, when there is not.',
        },
      },
    },

    Applicant: {
      type: 'object',
      description:
        'One person on an order. Lengths are the columns’ own — a truncated passport name is a rejected application.',
      required: ['firstName', 'lastName'],
      properties: {
        title: { type: 'string', nullable: true },
        firstName: { type: 'string', maxLength: 255 },
        middleName: { type: 'string', nullable: true },
        lastName: { type: 'string', maxLength: 255 },
        email: { type: 'string', format: 'email', nullable: true },
        phone: { type: 'string', nullable: true },
        dateOfBirth: { type: 'string', format: 'date', nullable: true },
        nationalityId: {
          type: 'integer',
          nullable: true,
          description: '`tbl_countries.id`.',
        },
        passportNumber: { type: 'string', nullable: true },
        passportType: { type: 'integer', nullable: true },
        passportIssueDate: { type: 'string', format: 'date', nullable: true },
        passportExpiryDate: { type: 'string', format: 'date', nullable: true },
        gender: { type: 'string', nullable: true },
        occupation: { type: 'string', nullable: true },
        organisation: { type: 'string', nullable: true },
        departureDate: { type: 'string', format: 'date', nullable: true },
      },
    },

    Contact: {
      type: 'object',
      description: 'Whose order it is. Where the confirmation goes.',
      required: ['firstName', 'lastName', 'email'],
      properties: {
        firstName: { type: 'string', maxLength: 255 },
        lastName: { type: 'string', maxLength: 255 },
        email: { type: 'string', format: 'email' },
        phone: { type: 'string', nullable: true },
        department: { type: 'string', nullable: true },
      },
    },

    ReturnAddress: {
      type: 'object',
      description:
        'Where the finished documents are couriered. One street line — the table holds one.',
      properties: {
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
        email: { type: 'string', format: 'email', nullable: true },
        phone: { type: 'string', nullable: true },
        company: { type: 'string', nullable: true },
        address: { type: 'string', nullable: true, maxLength: 255 },
        city: { type: 'string', nullable: true },
        state: { type: 'string', nullable: true },
        postcode: { type: 'string', nullable: true },
        countryId: { type: 'integer', nullable: true },
        returningDate: { type: 'string', format: 'date', nullable: true },
        comment: { type: 'string', nullable: true, maxLength: 2000 },
      },
    },

    Document: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description:
            'A string, not an integer, because two tables hold a client’s documents and both auto-increment from 1. An uploaded document is its bare `tbl_cls_order_documents.id`; a document listed on a legalisation order is its `tbl_document_legalization_documents.id` prefixed with `dl-`. Pass it back verbatim to the download and delete routes.',
        },
        name: { type: 'string' },
        reference: {
          type: 'string',
          description: 'The order the document belongs to.',
        },
        state: {
          type: 'string',
          enum: ['awaiting', 'received', 'in-review', 'rejected', 'ready'],
          description:
            'Five states, from `status` on whichever table the row came from. The website collapses them into three for display and reads `note` to tell a rejection from a review.',
        },
        meta: {
          type: 'string',
          nullable: true,
          description:
            'A pre-formatted line: the file type, the number of copies, or “Listed on your order” where the row is a declaration with no file behind it.',
        },
        note: {
          type: 'string',
          nullable: true,
          description: 'The reviewer’s reason, on a rejection.',
        },
        createdAt: {
          type: 'string',
          format: 'date-time',
          nullable: true,
          description:
            'Null on a legalisation row: `tbl_document_legalization_documents` has no timestamps, and a date guessed from an auto-increment id would put a document in a week it was not added.',
        },
        updatedAt: { type: 'string', format: 'date-time', nullable: true },
        downloadable: {
          type: 'boolean',
          description:
            'False where no filename is recorded. Whether the file is actually on disk is a question only the download route can answer, and it answers it with a 404.',
        },
        removable: {
          type: 'boolean',
          description:
            'False once CLS has reviewed an upload, and always false for a document listed on a legalisation order — removing one of those changes what the order asks CLS to legalise rather than withdrawing a file. The delete route refuses either way; this is so a client is not offered the control.',
        },
      },
    },

    Comment: {
      type: 'object',
      description:
        'A note on an order, from `tbl_order_notes`. The same shape whether a consultant or the client wrote it — `authorRole` is what tells them apart, and a note a consultant marked internal is never returned at all.',
      properties: {
        id: { type: 'string' },
        reference: { type: 'string' },
        author: { type: 'string', nullable: true },
        authorRole: { type: 'string', enum: ['Client', 'Consultant'] },
        postedAt: { type: 'string', format: 'date-time', nullable: true },
        body: { type: 'string' },
      },
    },

    Invoice: {
      type: 'object',
      description:
        'Assembled rather than stored — this schema has no invoice table. Built from the quote lines a consultant sent, or from the order total.',
      properties: {
        id: { type: 'string' },
        orderReference: { type: 'string', nullable: true },
        issuedAt: { type: 'string', format: 'date-time', nullable: true },
        dueAt: { type: 'string', format: 'date-time', nullable: true },
        status: { type: 'string', enum: ['paid', 'outstanding', 'overdue'] },
        subtotalCents: { type: 'integer', nullable: true },
        gstCents: { type: 'integer', nullable: true },
        totalCents: { type: 'integer', nullable: true },
        lines: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              amountCents: { type: 'integer', nullable: true },
            },
          },
        },
      },
    },

    Payment: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        orderReference: { type: 'string', nullable: true },
        amountCents: { type: 'integer', nullable: true },
        status: { type: 'string', enum: ['paid', 'failed', 'pending'] },
        method: {
          type: 'string',
          nullable: true,
          description: '`s_paid` — 1 is online, 2 is settled against account.',
        },
        transactionId: { type: 'string', nullable: true },
        paidAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },

    Enquiry: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        reference: { type: 'string', example: 'ENQ-41' },
        name: { type: 'string', nullable: true },
        email: { type: 'string', nullable: true },
        phone: { type: 'string', nullable: true },
        subject: { type: 'string', nullable: true },
        message: { type: 'string', nullable: true },
        status: {
          type: 'string',
          nullable: true,
          description:
            '`char(100)` with no enumeration. A value the old application wrote is preserved as-is.',
        },
        receivedAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },

    Notification: {
      type: 'object',
      description:
        'Derived, not stored — there is no notifications table. `persisted: false` says a read receipt cannot be kept.',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string', nullable: true },
        orderReference: { type: 'string', nullable: true },
        createdAt: { type: 'string', format: 'date-time', nullable: true },
        read: { type: 'boolean' },
        persisted: {
          type: 'boolean',
          description: 'False when marking it read cannot be recorded anywhere.',
        },
      },
    },
  },

  responses: {
    BadRequest: {
      description: 'Validation failed. `fields` names the inputs.',
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/Error' } },
      },
    },
    Unauthorized: {
      description: 'No token, or an expired one.',
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/Error' } },
      },
    },
    Forbidden: {
      description: 'Authenticated, but not permitted.',
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/Error' } },
      },
    },
    NotFound: {
      description: 'No such record — or one that is not yours.',
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/Error' } },
      },
    },
    ReadOnly: {
      description:
        '`DB_READ_ONLY` is on, so the write was refused before reaching MySQL.',
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/Error' } },
      },
    },
    TooManyRequests: {
      description: 'Rate limited. Wait and retry.',
      content: {
        'application/json': { schema: { $ref: '#/components/schemas/Error' } },
      },
    },
  },
} as const;
