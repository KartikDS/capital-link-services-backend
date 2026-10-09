import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ClsOrder,
  ClsOrderDocuments,
  Countries,
  OrderNotes,
  OrderReturnDocumentDetails,
  OrderTravellerDetails,
  Payment,
  PoliceClearanceOrderDetails,
  PoliceClearances,
  UserAdmin,
  UserClient,
  VisaCourierOptions,
} from '../../models';
import { currentUserId } from '../../middleware/authenticate';
import { ok } from '../../shared/http/responses';
import { badRequest, notFound } from '../../shared/errors';
import { streamDocument } from '../../shared/http/streamDocument';
import { toDateOnly, toIso, toLegacyDateTime } from '../../shared/dates';
import { toCents } from '../../shared/money';
import { openDocument } from '../../shared/storage/documents';
import { clean, fullName } from '../../shared/text';
import { idParam, validate, validParams } from '../../shared/validation';
import { ENABLED, ORDER_TYPE, DOCUMENT_STATE } from '../../domain/codes';
import { orderReference } from '../../domain/orderReference';
import {
  normaliseStored,
  parseStamp,
  type LegalisationAudit,
} from './legalisationOrder';
import { readPaymentState, type AdminPaymentState } from './orderPayment';

/**
 * The Police Clearance order screen — every read and write behind it.
 *
 * Reproduces `viewPoliceClearanceAction` and `policeClearance.html.twig` from the
 * legacy `CLSadminBundle`, read in full (memory `cls-order-detail-field-audit`).
 * Modelled on `legalisationOrder.ts`; `GET /orders/:id/detail` stays the generic
 * read for the services that have no screen of their own.
 *
 * ## What the legacy screen is
 *
 * Smaller than the legalisation one, and mostly a record. Only four things on it
 * were ever editable: the four milestone boxes, the CLS Team Member, the "Ticket
 * Comments" box, and the two status selects. Applicant Details and Document
 * Details are `disabled` inputs — a record of what the client typed — and so are
 * served here read-only.
 *
 * ## Where this deliberately differs from the legacy
 *
 * - **The comment is not filed under `destination_id = order id`.** A clearance
 *   has no destination row, so the legacy keyed its one comment on the *order* id
 *   in `tbl_order_destination_notes` — a column that holds destination-row ids
 *   everywhere else. The same number is some other order's legalisation
 *   destination, whose client-facing thread would then show this order's message.
 *   The comment goes to `tbl_order_notes` (`order_no` = the order id) instead: the
 *   table the website's own "Purpose: …" line is already in, the one the portal
 *   reads back for an order with no destination, and the list the legacy screen
 *   printed under the box. Not a new place for staff to look — the same list.
 * - **The closed box shows what is stored.** The legacy form always rendered it
 *   empty (`value=""`), so a consultant never saw the date they had saved, and
 *   re-submitting the page cleared it.
 * - **A cleared stamp is not a milestone**, as on the legalisation screen.
 *
 * ## The client email
 *
 * The legacy action built the milestone email and then had the send commented
 * out, so a clearance client was never emailed by this screen. This one returns
 * the same `notification` block the legalisation update does and the Next route
 * sends it, because the owner asked for the milestone emails. The wording is the
 * legacy's.
 */

// ---------------------------------------------------------------------------
// Response types — the contract the frontend is built against
// ---------------------------------------------------------------------------

export interface ClearanceHistoryRow {
  id: number;
  body: string;
  byName: string | null;
  userType: string | null;
  dateAdded: string | null;
}

export interface ClearanceApplicant {
  id: number;
  isPrimary: boolean;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  passportNumber: string | null;
  /** The applicant's nationality, by country name. */
  nationality: string | null;
  /** `YYYY-MM-DD`. */
  dateOfBirth: string | null;
  passportIssueDate: string | null;
  passportExpiryDate: string | null;
}

export interface ClearanceScreen {
  order: {
    id: number;
    orderNo: string;
    /** The client-facing portal reference (`CLS-000012`). */
    reference: string;
    status: 0 | 1 | 2;
    clientId: number | null;
    clientName: string | null;
    clientEmail: string | null;
    dateSubmitted: string | null;
    /** `tbl_police_clearances.name` — the legacy "Type: …" line. */
    clearanceType: string | null;
    /** `tbl_user_client.account_no` — the legacy Account Number box. */
    accountNumber: string | null;
  };
  stamps: {
    received: string | null;
    submitted: string | null;
    completed: string | null;
    closed: string | null;
  };
  team: {
    memberId: number | null;
    options: { id: number; name: string }[];
  };
  /** The Ticket Comments history: every `tbl_order_notes` row, oldest first. */
  history: ClearanceHistoryRow[];
  applicants: ClearanceApplicant[];
  /** The legacy Document Details panel, and the columns the new flow adds to it. */
  returnDocument: {
    company: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
    firstName: string | null;
    lastName: string | null;
    contactNumber: string | null;
    email: string | null;
    country: string | null;
    returningDate: string | null;
    additionalComment: string | null;
    hasAddress: boolean;
  } | null;
  /** What the new order journey recorded about the order itself. */
  requirements: {
    clearanceType: string | null;
    /** The country that asked for the certificate: `tbl_cls_order.destination`. */
    requestingCountry: string | null;
    /** The website's purpose slug, read back from the order's "Purpose:" note. */
    purposeId: string | null;
    applicantCount: number | null;
    departureDate: string | null;
    courier: string | null;
    contact: {
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      department: string | null;
    };
  };
  /** Cents; the three prices `tbl_police_clearance_order_details` stores, and the order's fees. */
  pricing: {
    clearancePriceCents: number | null;
    basicAdditionalPriceCents: number | null;
    clearanceAdditionalPriceCents: number | null;
    serviceFeeCents: number | null;
    totalFeeCents: number | null;
  };
  documents: {
    id: number;
    name: string;
    state: string;
    uploaded: string | null;
  }[];
  /**
   * The shared Payment Details state (`orderPayment.readPaymentState`) — what the
   * Order Status / Payment Status / Account Number / Pay Now / Send Invoice /
   * Reprint Invoice block is built from.
   */
  paymentState: AdminPaymentState;
  payment: {
    /** `tbl_payment.s_paid`: 0 Pending, 1 Paid - Online, 2 Paid - By Account. */
    status: 0 | 1 | 2 | null;
    transactionId: string | null;
    paidAt: string | null;
    totalCents: number | null;
    cardType: string | null;
    payer: {
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      mobile: string | null;
      address: string | null;
    };
  } | null;
}

export type ClearanceScantype = 'first' | 'second' | 'third' | 'fourth' | '';

export interface ClearanceNotification {
  scantype: ClearanceScantype;
  /** The comment typed in this save, which replaces the milestone sentence. */
  clientComment: string | null;
  orderNo: string;
  reference: string;
  clientEmail: string | null;
  clientFirstName: string | null;
}

export type ClearancePrintView = {
  kind: 'return-address';
  orderId: number;
  orderNo: string;
  to: {
    name: string | null;
    company: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
    country: string | null;
    phone: string | null;
    email: string | null;
  };
};

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

type StampKey =
  | 'allItemsReceivedAtCLS'
  | 'submittedForProcessing'
  | 'completedReceivedAtCLS'
  | 'orderOnRouteAndClosed';

type StampColumn =
  | 'date_cls_received_all_items'
  | 'date_submitted_for_processing'
  | 'date_completed_and_received_at_cls'
  | 'date_order_on_route_and_closed';

/** The four milestones in the legacy `if / elseif` priority order. */
const MILESTONES: readonly {
  key: StampKey;
  column: StampColumn;
  scantype: Exclude<ClearanceScantype, ''>;
  audit: string;
}[] = [
  {
    key: 'allItemsReceivedAtCLS',
    column: 'date_cls_received_all_items',
    scantype: 'first',
    audit: 'clearance.received',
  },
  {
    key: 'submittedForProcessing',
    column: 'date_submitted_for_processing',
    scantype: 'second',
    audit: 'clearance.submitted',
  },
  {
    key: 'completedReceivedAtCLS',
    column: 'date_completed_and_received_at_cls',
    scantype: 'third',
    audit: 'clearance.issued',
  },
  {
    key: 'orderOnRouteAndClosed',
    column: 'date_order_on_route_and_closed',
    scantype: 'fourth',
    audit: 'clearance.closed',
  },
];

/**
 * Which milestone this save advanced: the first, in priority order, that is set
 * and differs from what is stored. `submitted` holds only the stamps the request
 * carried (`null` = cleared, which is a correction and not a milestone).
 */
export const pickClearanceMilestone = (
  stored: Partial<Record<StampColumn, unknown>>,
  submitted: Partial<Record<StampKey, string | null>>
): (typeof MILESTONES)[number] | null => {
  for (const milestone of MILESTONES) {
    const next = submitted[milestone.key];
    if (next === undefined || next === null) continue;
    if (normaliseStored(stored[milestone.column]) !== next) return milestone;
  }
  return null;
};

const stampField = z
  .string()
  .max(40)
  .refine((value) => parseStamp(value) !== undefined, 'Enter a valid date and time');

// ---------------------------------------------------------------------------
// Loading and shaping
// ---------------------------------------------------------------------------

const loadOrder = async (id: number): Promise<ClsOrder> => {
  const order = await ClsOrder.findByPk(id);
  if (!order || order.order_type !== ORDER_TYPE.POLICE_CLEARANCE) {
    throw notFound('We could not find that police clearance order.');
  }
  return order;
};

const orderNoOf = (order: ClsOrder): string => clean(order.order_no) ?? String(order.id);

const asTriState = (value: number | null): 0 | 1 | 2 =>
  value === 1 || value === 2 ? value : 0;

/** Who the client email goes to, as the legacy computed it. */
const clientContactOf = async (order: ClsOrder) => {
  const client = order.client_id ? await UserClient.findByPk(order.client_id) : null;
  const email = clean(order.contact_email) ?? clean(client?.email);

  return {
    client,
    email,
    firstName: clean(order.contact_first_name) ?? clean(client?.fname),
  };
};

const PURPOSE_LINE = /^Purpose:\s*(.+?)\s*$/m;

/** The purpose slug the website wrote into the order's first matching note. */
export const purposeOf = (rows: readonly OrderNotes[]): string | null => {
  for (const row of rows) {
    const match = PURPOSE_LINE.exec(row.note ?? '');
    if (match?.[1]) return match[1];
  }
  return null;
};

const historyOf = (rows: readonly OrderNotes[]): ClearanceHistoryRow[] =>
  [...rows]
    .filter((row) => clean(row.note) !== null)
    .sort((a, b) => a.id - b.id)
    .map((row) => ({
      id: row.id,
      body: row.note ?? '',
      byName: clean(row.note_by_name),
      userType: clean(row.user_type),
      dateAdded: toIso(row.date_added),
    }));

const hasReturnAddress = (row: OrderReturnDocumentDetails | null): boolean =>
  Boolean(clean(row?.address) && clean(row?.city) && clean(row?.postcode));

const idParams = validate(z.object({ id: idParam }), 'params');

const ticketSchema = z.object({
  allItemsReceivedAtCLS: stampField.optional(),
  submittedForProcessing: stampField.optional(),
  completedReceivedAtCLS: stampField.optional(),
  orderOnRouteAndClosed: stampField.optional(),
  clsTeamMember: z.string().trim().regex(/^\d*$/, 'Choose a team member').optional(),
  ticketComments: z.string().max(20_000).optional(),
});

type TicketBody = z.infer<typeof ticketSchema>;

/**
 * The router. `audit` is `admin.routes.ts`'s own writer, passed in for the reason
 * given on `legalisationOrderRoutes`.
 */
export const clearanceOrderRoutes = (audit: LegalisationAudit): Router => {
  const router = Router();

  const loadHistory = (orderId: number): Promise<OrderNotes[]> =>
    OrderNotes.findAll({ where: { order_no: orderId, is_deleted: 0 } });

  const buildScreen = async (order: ClsOrder): Promise<ClearanceScreen> => {
    const orderId = order.id;

    const [
      contact,
      details,
      clearance,
      travellers,
      returnDocument,
      notes,
      staff,
      payment,
      documents,
      destinationCountry,
      courier,
    ] = await Promise.all([
      clientContactOf(order),
      PoliceClearanceOrderDetails.findOne({ where: { order_id: orderId } }),
      order.police_clearance_id ? PoliceClearances.findByPk(order.police_clearance_id) : null,
      OrderTravellerDetails.findAll({ where: { order_id: orderId }, order: [['id', 'ASC']] }),
      OrderReturnDocumentDetails.findOne({ where: { order_id: orderId } }),
      OrderNotes.findAll({ where: { order_no: orderId, is_deleted: 0 } }),
      // Legacy `getAdminUsers`: enabled, non-driver staff.
      UserAdmin.findAll({
        where: { s_enabled: ENABLED, s_driver: 0 },
        order: [['fname', 'ASC']],
      }),
      Payment.findOne({ where: { order_no: orderId }, order: [['date_paid', 'DESC']] }),
      ClsOrderDocuments.findAll({ where: { order_id: orderId }, order: [['id', 'ASC']] }),
      order.destination ? Countries.findByPk(order.destination) : null,
      order.courier_service_id ? VisaCourierOptions.findByPk(order.courier_service_id) : null,
    ]);

    const returnCountry = returnDocument?.country_id
      ? await Countries.findByPk(returnDocument.country_id)
      : null;

    const nationalityIds = [
      ...new Set(
        travellers.map((row) => row.nationality).filter((id): id is number => id !== null)
      ),
    ];
    const nationalityCountries =
      nationalityIds.length > 0 ? await Countries.findAll({ where: { id: nationalityIds } }) : [];
    const nationalityName = new Map(
      nationalityCountries.map((row) => [row.id, clean(row.country_name)])
    );

    const primary = travellers.find((row) => row.is_primary === 1) ?? travellers[0] ?? null;
    const clientName =
      fullName(contact.client?.fname, contact.client?.lname) ||
      fullName(primary?.first_name, primary?.last_name) ||
      fullName(order.contact_first_name, order.contact_last_name) ||
      null;

    const clearanceType = clean(clearance?.name);

    return {
      order: {
        id: order.id,
        orderNo: orderNoOf(order),
        reference: orderReference(order.id),
        status: asTriState(order.status),
        clientId: order.client_id,
        clientName,
        clientEmail: contact.email,
        dateSubmitted: toIso(order.date_submitted),
        clearanceType,
        accountNumber: clean(contact.client?.account_no),
      },
      stamps: {
        received: toIso(details?.date_cls_received_all_items),
        submitted: toIso(details?.date_submitted_for_processing),
        completed: toIso(details?.date_completed_and_received_at_cls),
        closed: toIso(details?.date_order_on_route_and_closed),
      },
      team: {
        memberId: order.visa_cls_team_member || null,
        options: staff.map((member) => ({
          id: member.id,
          name: fullName(member.fname, member.lname) || String(member.id),
        })),
      },
      history: historyOf(notes),
      applicants: travellers.map((row) => ({
        id: row.id,
        isPrimary: row.is_primary === 1,
        firstName: clean(row.first_name),
        middleName: clean(row.middle_name),
        lastName: clean(row.last_name),
        email: clean(row.email),
        phone: clean(row.phone),
        passportNumber: clean(row.passport_number),
        nationality: row.nationality ? (nationalityName.get(row.nationality) ?? null) : null,
        dateOfBirth: toDateOnly(row.date_of_birth),
        passportIssueDate: toDateOnly(row.passport_issue_date),
        passportExpiryDate: toDateOnly(row.passport_expiry_date),
      })),
      returnDocument: returnDocument
        ? {
            company: clean(returnDocument.company),
            address: clean(returnDocument.address),
            city: clean(returnDocument.city),
            state: clean(returnDocument.state),
            postcode: clean(returnDocument.postcode),
            firstName: clean(returnDocument.first_name),
            lastName: clean(returnDocument.last_name),
            contactNumber: clean(returnDocument.contact_number),
            email: clean(returnDocument.email),
            country: clean(returnCountry?.country_name),
            returningDate: toDateOnly(returnDocument.returning_date),
            additionalComment: clean(returnDocument.additional_comment),
            hasAddress: hasReturnAddress(returnDocument),
          }
        : null,
      requirements: {
        clearanceType,
        requestingCountry: clean(destinationCountry?.country_name),
        purposeId: purposeOf(notes),
        applicantCount: order.no_of_traveller,
        departureDate: toDateOnly(order.departure_date),
        courier: clean(courier?.type),
        contact: {
          firstName: clean(order.contact_first_name),
          lastName: clean(order.contact_last_name),
          email: clean(order.contact_email),
          phone: clean(order.contact_phone),
          department: clean(order.department),
        },
      },
      pricing: {
        clearancePriceCents: toCents(details?.clearance_price ?? null),
        basicAdditionalPriceCents: toCents(details?.basic_additional_price ?? null),
        clearanceAdditionalPriceCents: toCents(details?.clearance_additional_price ?? null),
        serviceFeeCents: toCents(order.service_fee),
        totalFeeCents: toCents(order.total_fee),
      },
      documents: documents.map((row) => ({
        id: row.id,
        name: clean(row.document) ?? 'Document',
        state: DOCUMENT_STATE[row.status ?? 0] ?? 'awaiting',
        uploaded: toIso(row.created),
      })),
      paymentState: await readPaymentState(order),
      payment: payment
        ? {
            status: asTriState(payment.s_paid),
            transactionId: clean(payment.transaction_id),
            paidAt: toIso(payment.date_paid),
            totalCents: toCents(payment.total_order_price),
            cardType: clean(payment.card_type === null ? null : String(payment.card_type)),
            payer: {
              firstName: clean(payment.fname),
              lastName: clean(payment.lname),
              email: clean(payment.email),
              phone: clean(payment.phone),
              mobile: clean(payment.mobile),
              address: clean(payment.address),
            },
          }
        : null,
    };
  };

  router.get('/:id/clearance', idParams, async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const order = await loadOrder(id);

    ok(res, { clearance: await buildScreen(order) });
  });

  // -------------------------------------------------------------------------
  // PATCH /:id/clearance/ticket — Order Progress "Submit"
  // -------------------------------------------------------------------------

  router.patch(
    '/:id/clearance/ticket',
    idParams,
    validate(ticketSchema),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const body = req.body as TicketBody;

      const order = await loadOrder(id);
      const details = await PoliceClearanceOrderDetails.findOne({ where: { order_id: id } });
      if (!details) throw notFound('This order has no clearance details to update.');

      const submitted: Partial<Record<StampKey, string | null>> = {};
      for (const { key } of MILESTONES) {
        const raw = body[key];
        if (raw !== undefined) submitted[key] = parseStamp(raw) ?? null;
      }

      let teamMember: number | null | undefined;
      if (body.clsTeamMember !== undefined) {
        teamMember = body.clsTeamMember === '' ? null : Number(body.clsTeamMember);
        // Validated only when it changes, so re-saving an order whose member has
        // since left the roster does not fail.
        if (teamMember !== null && teamMember !== (order.visa_cls_team_member || null)) {
          const member = await UserAdmin.findOne({
            where: { id: teamMember, s_enabled: ENABLED },
          });
          if (!member) throw badRequest('That team member is not on the roster.');
        }
      }

      const author = await UserAdmin.findByPk(currentUserId(req));
      const authorName = clean(author?.fname);
      const orderNo = orderNoOf(order);
      const milestone = pickClearanceMilestone(details, submitted);

      const detailsPatch: Partial<Record<StampColumn, string | null>> = {};
      for (const { key, column } of MILESTONES) {
        if (submitted[key] !== undefined) detailsPatch[column] = submitted[key] ?? null;
      }
      if (Object.keys(detailsPatch).length > 0) await details.update(detailsPatch);

      // The audit line for the milestone, or the generic "processed" line, as
      // legacy's `else` branch wrote.
      await audit(req, milestone?.audit ?? 'clearance.processed', {
        orderId: id,
        orderNo,
        ...(milestone ? { scantype: milestone.scantype } : {}),
      });

      const comment = (body.ticketComments ?? '').trim();
      if (comment !== '') {
        await OrderNotes.create({
          order_no: id,
          note: comment,
          date_added: toLegacyDateTime(),
          note_by: author?.id ?? currentUserId(req),
          note_by_name: authorName,
          // Capitalised, as the legacy byline printed it: "- by Alex (Admin)".
          user_type: 'Admin',
          // The client-facing lane, like the DL "Client comment" box.
          is_admin: 0,
          is_deleted: 0,
        });
        await audit(req, 'clearance.comment.added', { orderId: id, orderNo });
      }

      const orderPatch: Partial<{
        visa_cls_team_member: number | null;
        status: number;
        date_last_saved: string;
      }> = {};
      if (teamMember !== undefined) orderPatch.visa_cls_team_member = teamMember;

      // Legacy: any non-empty "closed" box confirms the order (`status = 2`).
      const closedNow =
        submitted.orderOnRouteAndClosed !== undefined
          ? submitted.orderOnRouteAndClosed
          : normaliseStored(details.date_order_on_route_and_closed);
      if (closedNow !== null && order.status !== 2) orderPatch.status = 2;

      if (Object.keys(orderPatch).length > 0) {
        orderPatch.date_last_saved = toLegacyDateTime();
        const previous = order.status;
        await order.update(orderPatch);
        if (orderPatch.status !== undefined) {
          await audit(req, 'order.status', {
            orderId: id,
            from: previous,
            to: orderPatch.status,
            reason: 'order on route and closed',
          });
        }
      }

      const contact = await clientContactOf(order);
      const notification: ClearanceNotification = {
        scantype: milestone?.scantype ?? '',
        clientComment: comment !== '' ? comment : null,
        orderNo,
        reference: orderReference(order.id),
        clientEmail: contact.email,
        clientFirstName: contact.firstName,
      };

      ok(res, { notification, history: historyOf(await loadHistory(id)) });
    }
  );

  // -------------------------------------------------------------------------
  // A document the client uploaded (passport copies, mostly)
  // -------------------------------------------------------------------------

  router.get(
    '/:id/clearance/documents/:documentId/file',
    validate(z.object({ id: idParam, documentId: idParam }), 'params'),
    async (req: Request, res: Response) => {
      const { id, documentId } = validParams<{ id: number; documentId: number }>(req);
      await loadOrder(id);

      // `tbl_cls_order_documents` has no foreign key: the order id on the row is
      // the only thing tying it to this order.
      const row = await ClsOrderDocuments.findByPk(documentId);
      if (!row || row.order_id !== id) {
        throw notFound('We could not find that document on this order.');
      }

      const stored = clean(row.document);
      if (!stored) throw notFound('That document has no file.');

      const opened = await openDocument(stored);
      if (!opened) {
        throw notFound('We hold a record of that document but not the file itself.');
      }

      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${path.basename(stored.replace(/\\/g, '/'))}"`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      streamDocument(opened, res, { orderId: id, documentId });
    }
  );

  // -------------------------------------------------------------------------
  // Print Return Address Label
  // -------------------------------------------------------------------------

  router.get(
    '/:id/clearance/print/return-address',
    idParams,
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const order = await loadOrder(id);

      const returnDocument = await OrderReturnDocumentDetails.findOne({
        where: { order_id: id },
      });
      const country = returnDocument?.country_id
        ? await Countries.findByPk(returnDocument.country_id)
        : null;

      const print: ClearancePrintView = {
        kind: 'return-address',
        orderId: id,
        orderNo: orderNoOf(order),
        to: {
          name: fullName(returnDocument?.first_name, returnDocument?.last_name) || null,
          company: clean(returnDocument?.company),
          address: clean(returnDocument?.address),
          city: clean(returnDocument?.city),
          state: clean(returnDocument?.state),
          postcode: clean(returnDocument?.postcode),
          country: clean(country?.country_name),
          phone: clean(returnDocument?.contact_number),
          email: clean(returnDocument?.email),
        },
      };

      ok(res, { print });
    }
  );

  return router;
};
