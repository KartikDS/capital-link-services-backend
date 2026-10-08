import { body, f, okObject, operation } from './shared';

/**
 * The Public Visa order screen. Staff tokens only. Kept apart from
 * `admin.paths.ts` so it can be documented without editing that file while others
 * do. See `modules/admin/publicVisaOrder.ts`.
 *
 * Every route is for **public visa orders only** (`order_type` 6): any other order
 * is a 404. A destination, comment, tracker row or document named in the path is
 * checked against the order in the path first.
 */

const tag = 'Admin';
const notFound = { $ref: '#/components/responses/NotFound' };
const badRequest = { $ref: '#/components/responses/BadRequest' };
const base = '/api/admin/orders/{id}/public-visa';

export const adminPublicVisaPaths = {
  [base]: {
    get: operation(base, {
      tag,
      summary: 'Everything the Public Visa order screen renders',
      description:
        'Read-and-write counterpart of `GET /api/admin/orders/{id}/detail` for **public visa orders only**. Reproduces the legacy `viewPublicVisaAction`: one block per destination (milestones, Ticket, signature, both comment lanes, visa type + additional requirement, DHL numbers), the order-level row (team member, delivered to embassy, next embassy, follow-up date, processing location), the document-type tracker, Travel/Traveller/Payment details, the pickup and return panels, the Client Centre Documents table — **plus every field the new order journey stores** (`newFlow`: the return address with its email, country, returning date and comment; the corporate request parsed out of `travel_purpose`; the fee breakdown; each destination’s `newFlow` and each traveller’s extra fields).\n\n`destinations[].comments` carries **both** lanes (`lane: "client"` is `is_admin` 0, emailed to the client; `lane: "admin"` is `is_admin` 1, CLS-internal). That is correct for this staff-only route and must never be copied to a client-facing one. `stamps` are ISO instants; dates elsewhere are plain `YYYY-MM-DD`.\n\n`processLocation` is null where the destination table has no `process_location_id` (NZ). `options.shippedBy` and `options.locations` are the region’s dropdown lists.',
      auth: 'bearer',
      responses: {
        200: okObject('The screen', { publicVisa: { type: 'object' } }),
        404: notFound,
      },
    }),
  },

  [`${base}/destinations/{destinationId}/ticket`]: {
    patch: operation(`${base}/destinations/{destinationId}/ticket`, {
      tag,
      summary: 'One destination’s Update — milestones, Ticket, comments',
      description:
        '`multipart/form-data`. Reproduces the legacy `updateTicket` for one destination. Only fields present are written; `\'\'` clears a stamp or text field.\n\n**Milestone email:** the first changed stamp (received, submitted, completed, closed — in that order) sets `notification.scantype`; a *cleared* stamp is not a milestone. **`notification.suppress` is true when an admin comment was written** — legacy never emailed the client then. The backend sends no email; the caller builds it from `notification`.\n\n**Comments:** `clientComment` creates lane-0 note(s), one per `comment_attachment` file (text repeated); `adminComment` creates lane-1 note(s) per `admin_attachment` file — confidential. Attachments are `.pdf/.png/.jpg/.jpeg` only; anything else is a 400 "File you are trying to upload is restricted and operation is aborted!!". An attachment with no comment text is a 400.\n\n**Auto-close:** when the closed stamp is set and every destination of the order is closed, `tbl_cls_order.status` becomes 2.',
      auth: 'bearer',
      body: {
        contentType: 'multipart/form-data',
        schema: body({
          allItemsReceivedAtCLS: f.string('ISO-8601 instant, or empty to clear.'),
          submittedForProcessing: f.string('ISO-8601 instant, or empty to clear.'),
          completedReceivedAtCLS: f.string('ISO-8601 instant, or empty to clear.'),
          orderOnRouteAndClosed: f.string('ISO-8601 instant, or empty to clear.'),
          shippedBy: f.string(),
          comNoteNo: f.string('Outbound consignment number.'),
          comNoteIn: f.string('Inbound consignment number.'),
          invoiceNo: f.string(),
          signeeName: f.string(),
          clientComment: f.string('Lane 0 — emailed to the client.'),
          adminComment: f.string('Lane 1 — CLS-internal, confidential.'),
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
        400: badRequest,
        404: notFound,
      },
    }),
  },

  [`${base}/destinations/{destinationId}/signature`]: {
    get: operation(`${base}/destinations/{destinationId}/signature`, {
      tag,
      summary: 'A destination’s stored signature image',
      description:
        'For `signature.kind === "image"`: the PNG legacy `saveSignatureAction` stored at `dev/order_signature/{md5}_{orderId}_{destinationId}.png`. The file served is always the one **this destination row names**, and a name that does not end `_{orderId}_{destinationId}`, or is an SVG, is a 404. Stroke-JSON signatures have no file.',
      auth: 'bearer',
      responses: {
        200: { description: 'The image.' },
        404: notFound,
      },
    }),
  },

  [`${base}/order`]: {
    patch: operation(`${base}/order`, {
      tag,
      summary:
        'The order-level row — team member, embassy, follow-up date, processing location',
      description:
        'Only fields present are written. `followUpDate` replaces **this admin’s** rows in `tbl_order_follow_up_date` (as legacy) and is mirrored onto every destination’s `visa_follow_up_date`. `processLocationId` is written to the **first** destination (as legacy) and must be one of the locations offered for its visa type, or empty to clear; it is ignored in a region without the column.',
      auth: 'bearer',
      body: {
        schema: body({
          clsTeamMember: f.string('`tbl_user_admin.id`, or empty for none.'),
          deliveredToEmbassy: { type: 'string', enum: ['1', '0'] },
          embassyDeliveredDate: f.string('`YYYY-MM-DD`, or empty.'),
          nextEmbassy: f.string(),
          followUpDate: f.string('`YYYY-MM-DD`, or empty.'),
          processLocationId: f.string('`tbl_public_visa_type_locations.id`, or empty.'),
        }),
      },
      responses: {
        200: okObject('Saved', { orderId: f.int(), processLocationId: f.int() }),
        400: badRequest,
        404: notFound,
      },
    }),
  },

  [`${base}/tracking`]: {
    post: operation(`${base}/tracking`, {
      tag,
      summary: 'Add steps to the document-type tracker',
      description:
        'Each row is a NEW `tbl_order_notes` history row — legacy never edited one in place. `location` must be one of `options.locations`.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            rows: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  documentType: f.string(),
                  location: f.string(),
                  price: { type: 'number' },
                  status: { type: 'string', enum: ['Delivered', 'Received'] },
                },
              },
            },
          },
          ['rows']
        ),
      },
      responses: {
        200: okObject('Saved', {
          tracking: { type: 'array', items: { type: 'object' } },
        }),
        400: badRequest,
        404: notFound,
      },
    }),
    delete: operation(`${base}/tracking`, {
      tag,
      summary: 'Remove a document type from the tracker',
      description:
        'Deletes every row of that type **on this order only** — legacy deleted it across every order.',
      auth: 'bearer',
      query: [
        {
          name: 'documentType',
          description: 'The document type to remove.',
          required: true,
        },
      ],
      responses: {
        200: okObject('Removed', {
          tracking: { type: 'array', items: { type: 'object' } },
        }),
        404: notFound,
      },
    }),
  },

  [`${base}/tracking/{noteId}`]: {
    delete: operation(`${base}/tracking/{noteId}`, {
      tag,
      summary: 'Remove one tracker row',
      auth: 'bearer',
      responses: {
        200: okObject('Removed', {
          tracking: { type: 'array', items: { type: 'object' } },
        }),
        404: notFound,
      },
    }),
  },

  [`${base}/comments/{noteId}`]: {
    patch: operation(`${base}/comments/{noteId}`, {
      tag,
      summary: 'Edit a destination comment',
      description:
        'Lane 1 always; lane 0 only when staff wrote it (`user_type` Admin) — a client’s own reply is a 403. The note must belong to one of this order’s destinations.',
      auth: 'bearer',
      body: { schema: body({ comment: f.string() }, ['comment']) },
      responses: {
        200: okObject('Saved', { comment: { type: 'object' } }),
        403: { $ref: '#/components/responses/Forbidden' },
        404: notFound,
      },
    }),
    delete: operation(`${base}/comments/{noteId}`, {
      tag,
      summary: 'Delete a destination comment',
      description:
        'Same gate as editing. The stored file is left where it is, as legacy did.',
      auth: 'bearer',
      responses: {
        200: okObject('Deleted', { deleted: f.int() }),
        403: { $ref: '#/components/responses/Forbidden' },
        404: notFound,
      },
    }),
  },

  [`${base}/comments/{noteId}/attachment`]: {
    get: operation(`${base}/comments/{noteId}/attachment`, {
      tag,
      summary: 'A comment’s attachment (either lane)',
      description:
        'Staff only. The client portal has its own gated route that serves lane 0 only; this one never reaches a client.',
      auth: 'bearer',
      responses: { 200: { description: 'The file.' }, 404: notFound },
    }),
  },

  [`${base}/documents/{documentId}/file`]: {
    get: operation(`${base}/documents/{documentId}/file`, {
      tag,
      summary: 'View a Client Centre document',
      description:
        'Streams a `tbl_cls_order_documents` file that belongs to this order. As in legacy `ManageOrderDocumentsController::viewAction`, opening an uploaded document marks it reviewed (status 1 → 2); a rejected or approved one is left as it is.',
      auth: 'bearer',
      responses: { 200: { description: 'The file.' }, 404: notFound },
    }),
  },

  [`${base}/dhl-details`]: {
    patch: operation(`${base}/dhl-details`, {
      tag,
      summary: 'Update shipping details (the DHL modal)',
      description:
        'Legacy `updDhladdress`: the inbound pickup details (`tbl_order_courier_service_details`) and the outbound return details (`tbl_order_return_document_details`) in one save; each row is created when the order has none. Every field but the company is required.',
      auth: 'bearer',
      body: {
        schema: body({ pickup: { type: 'object' }, return: { type: 'object' } }, [
          'pickup',
          'return',
        ]),
      },
      responses: {
        200: okObject('Saved', { orderId: f.int() }),
        400: badRequest,
        404: notFound,
      },
    }),
  },

  [`${base}/dhl-label/{labelType}`]: {
    get: operation(`${base}/dhl-label/{labelType}`, {
      tag,
      summary: 'Print a stored DHL label',
      description:
        'Legacy `printDhlLabelAction`: DHL’s shipment-validation response is stored on the first destination row and holds the label as a base64 PDF; this decodes it. `pickup` (Inbound) or `return` (Outbound). 404 "No DHL label found." when none was ever generated.',
      auth: 'bearer',
      responses: { 200: { description: 'The PDF.' }, 404: notFound },
    }),
  },

  [`${base}/dhl/{labelType}`]: {
    post: operation(`${base}/dhl/{labelType}`, {
      tag,
      summary: 'Generate a DHL label — NOT CONNECTED',
      description:
        '`inbound` or `outbound`. Runs the checks the legacy ran before calling DHL (the courier is a DHL service; a return address exists and is not hand-delivered; for outbound, the address is confirmed) and then answers **503**: creating a label needs DHL’s live XML shipment API and CLS’s DHL SiteID/password/account, which are not configured on this system. It never reports a label that was not made.',
      auth: 'bearer',
      responses: {
        200: {
          description:
            'Reserved for when DHL is connected (the label would then be stored on the destination row). **This deployment never returns it** — see 503.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { orderId: f.int() } },
            },
          },
        },
        409: { description: 'A legacy precondition failed; the message says which.' },
        503: { description: 'DHL label generation is not connected.' },
        404: notFound,
      },
    }),
  },

  [`${base}/status`]: {
    patch: operation(`${base}/status`, {
      tag,
      summary: 'Order Status and Payment Status together',
      description:
        'The legacy `updateStatus` form: `tbl_cls_order.status` (0 Pending, 1 Completed, 2 Cls Confirmed) and the newest `tbl_payment.s_paid` (0 Pending, 1 Paid - Online), one audit line per value that changed. 409 when the order has no payment row — use `order-status` then.',
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
        404: notFound,
        409: { description: 'No payment record on this order.' },
      },
    }),
  },

  [`${base}/order-status`]: {
    patch: operation(`${base}/order-status`, {
      tag,
      summary: 'Order Status alone',
      description:
        'For an order with no payment row, where there is no payment status to change.',
      auth: 'bearer',
      body: {
        schema: body({ orderStatus: { type: 'integer', enum: [0, 1, 2] } }, [
          'orderStatus',
        ]),
      },
      responses: {
        200: okObject('Saved', { orderId: f.int(), orderStatus: f.int() }),
        404: notFound,
      },
    }),
  },

  [`${base}/address-confirmation/acknowledge`]: {
    post: operation(`${base}/address-confirmation/acknowledge`, {
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
        404: notFound,
      },
    }),
  },

  [`${base}/address-confirmation`]: {
    get: operation(`${base}/address-confirmation`, {
      tag,
      summary: 'Data for the address-confirmation email',
      description:
        'What the legacy `sendClientAddressConfirmationEmailAction` read: the client’s email (the order contact email, or the account email when the order is bulk), names, return address and the destination’s display name. The backend has no mailer — the Next route sends it.',
      auth: 'bearer',
      responses: {
        200: okObject('The data', { confirmation: { type: 'object' } }),
        404: notFound,
      },
    }),
  },

  [`${base}/print/{visaSheet}`]: {
    get: operation(`${base}/print/{visaSheet}`, {
      tag,
      summary: 'Data for a printable sheet',
      description:
        'The legacy PHP print scripts are not in this repository, so these are designed sheets rather than ports: `return-address` (the return address as a label), `embassy-to-from` (CLS to each destination’s embassy, from the `tbl_countries` record; `?destination=` narrows it to one) and `traveller-label` (needs `?destination=` and `?traveller=`).',
      auth: 'bearer',
      query: [
        {
          name: 'destination',
          description: 'A destination id of this order.',
          type: 'integer',
        },
        {
          name: 'traveller',
          description: 'A traveller id of this order.',
          type: 'integer',
        },
      ],
      responses: {
        200: okObject('The sheet', { print: { type: 'object' } }),
        400: badRequest,
        404: notFound,
      },
    }),
  },

  [`${base}/invoice`]: {
    get: operation(`${base}/invoice`, {
      tag,
      summary: 'The invoice behind Reprint Invoice',
      description:
        'The legacy `reprintPublicVisa` invoice, as data: name, company and address (courier pickup, then return address, then the account — field by field), the lines by the legacy template’s arithmetic (CLS Service Fee × travellers + 10% GST, one Visa Application Fee per requirement with no GST, Additional Services, Courier Fee), sub total, total and balance due. Lines come from the `tbl_manual_payment` items when present, else from the order’s fee columns. There is no card-fee line. The PDF the legacy rendered with dompdf is not reproduced: the website prints this page.',
      auth: 'bearer',
      responses: {
        200: okObject('The invoice', { invoice: { type: 'object' } }),
        404: notFound,
      },
    }),
  },
} as const;
