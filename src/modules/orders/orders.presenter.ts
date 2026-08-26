import type {
  ClsOrder,
  ClsOrderDocumentNotes,
  ClsOrderDocuments,
  OrderDlChecklist,
  OrderNotes,
  OrderTravellerDetails,
  OrderTravellers,
  Orders,
  Payment,
} from '../../models';
import { toDateOnly, toIso } from '../../shared/dates';
import { toCents } from '../../shared/money';
import { clean, fullName, maskEmail, truncate } from '../../shared/text';
import { describeFile } from '../../middleware/upload';
import {
  CLS_ORDER_STATUS,
  DOCUMENT_STATE,
  DOCUMENT_STATUS,
  LEGACY_ORDER_STATUS,
  MILESTONE_LABELS,
  ORDER_TYPE_CATEGORY,
  ORDER_TYPE_LABEL,
  PAYMENT_STATUS,
  clsStageOf,
  legacyStageOf,
  progressFromMilestones,
  type PortalStage,
  type TrackCategoryId,
} from '../../domain/codes';
import { orderReference } from '../../domain/orderReference';
import { toConsultantView, type ConsultantView } from '../../domain/company';

/**
 * Turning an order row into the shape the website renders.
 *
 * The target shape is fixed: it is `WireOrder` in the website's
 * `lib/portalApi.ts`, which its portal screens and their tests are built
 * against. So this file's job is to produce that from two different tables, and
 * the interesting parts are the fields the schema has no column for.
 *
 * **`eta` is always null.** Neither order table records a promised ready date.
 * There is `departure_date` (when the client travels), `visa_follow_up_date`
 * (when a consultant means to chase the embassy) and four milestone dates — but
 * nothing that says "your documents will be ready on the 14th". The website
 * renders null as "we will confirm a date", which is honest. Deriving an
 * estimate from processing times would put a date in front of a client that CLS
 * never committed to.
 *
 * **`progress` is approximate and says so.** Counted from how many of the four
 * milestone dates are set. That is the only progress signal in the schema.
 *
 * **`stage` is derived.** No column holds the website's four-value stage, so it
 * comes from the status plus whether any document is waiting on the client.
 */

/** One of the four processing milestones, with the date it happened or null. */
export interface OrderMilestoneView {
  /** `received`, `submitted`, `completed`, `closed` — the admin's own names. */
  id: string;
  label: string;
  /** ISO timestamp, or null where CLS has not stamped it yet. */
  at: string | null;
  reached: boolean;
}

export interface OrderView {
  reference: string;
  orderType: string | null;
  orderTypeCode: number | null;
  service: string | null;
  detail: string | null;
  applicant: string | null;
  destination: string | null;
  stage: PortalStage;
  status: string;
  statusLabel: string;
  progress: number;
  milestone: string | null;
  /**
   * All four milestones, reached or not.
   *
   * `progress` and `milestone` answer "how far along is this"; these answer "what
   * are the four steps and which have happened". The order view screen draws the
   * second question as a grid of four dated cards, and it cannot be derived from
   * the timeline — that drops an undated milestone entirely, so a step not yet
   * reached and a step that does not exist look identical there.
   *
   * Always four entries, in order, whatever the service. All three
   * `*_order_details` tables carry the same four columns, and an order with no
   * detail row at all gets four nulls rather than an empty list, because a screen
   * showing three of four steps is worse than one showing four blanks.
   */
  milestones: readonly OrderMilestoneView[];
  eta: string | null;
  updated: string | null;
  submittedAt: string | null;
  departureDate: string | null;
  amountCents: number | null;
  /** True when no amount is set because a consultant prices this service. */
  quoteRequired: boolean;
  paid: boolean;
  transactionId: string | null;
  consultant: ConsultantView | null;
  actionRequired: boolean;
  /** Which table this came from, so a caller can tell them apart. */
  source: 'cls_order' | 'legacy_order';
}

// ---------------------------------------------------------------------------
// Shared derivations
// ---------------------------------------------------------------------------

/** `2 applicants · Dubai`, the line the dashboard card shows under the service. */
const detailLine = (
  travellerCount: number,
  destination: string | null
): string | null => {
  const parts: string[] = [];

  if (travellerCount > 0) {
    parts.push(`${travellerCount} applicant${travellerCount === 1 ? '' : 's'}`);
  }
  if (destination) parts.push(destination);

  return parts.length > 0 ? parts.join(' · ') : null;
};

/**
 * How far through the milestones an order is, and what to call where it is.
 *
 * The four dates live on the per-service detail tables — police clearance,
 * voucher and legalisation each have their own copy of the same four columns.
 * Whichever detail row an order has, the dates mean the same thing, so they are
 * read into one array and counted.
 */
interface Milestones {
  progress: number;
  milestone: string | null;
  dates: readonly (string | null)[];
  /** The same four dates, labelled, for the order view's status grid. */
  slots: readonly OrderMilestoneView[];
}

/**
 * The stable ids for the four milestone slots.
 *
 * The same words `PATCH /api/admin/orders/:id/milestone` takes, so a screen that
 * reads a slot and a consultant who stamps one are naming the same thing.
 */
const MILESTONE_IDS = ['received', 'submitted', 'completed', 'closed'] as const;

const readMilestones = (
  received: unknown,
  submitted: unknown,
  completed: unknown,
  closed: unknown
): Milestones => {
  const dates = [toIso(received), toIso(submitted), toIso(completed), toIso(closed)];

  const reached = dates.filter((date) => date !== null).length;

  return {
    progress: progressFromMilestones(dates),
    // The label of the last milestone reached, or null before the first one —
    // which the website renders as the status instead.
    milestone: reached > 0 ? (MILESTONE_LABELS[reached - 1] ?? null) : null,
    dates,
    slots: dates.map((at, index) => ({
      id: MILESTONE_IDS[index] ?? String(index),
      label: MILESTONE_LABELS[index] ?? 'Progress',
      at,
      reached: at !== null,
    })),
  };
};

// ---------------------------------------------------------------------------
// tbl_cls_order
// ---------------------------------------------------------------------------

/**
 * What each `tbl_cls_order.status` is called to a client.
 *
 * `1` is "Placed", not "Completed". The column's schema comment says completed
 * and it means the *client* completed the order — see `CLS_ORDER_STATUS`. An
 * order that has just been paid for is at `1`, and telling its owner it was
 * complete while a consultant had not started is the bug this wording fixes.
 */
const CLS_STATUS_LABEL: Record<number, string> = {
  [CLS_ORDER_STATUS.PENDING]: 'Awaiting submission',
  [CLS_ORDER_STATUS.COMPLETED]: 'Placed',
  [CLS_ORDER_STATUS.CLS_CONFIRMED]: 'Confirmed by CLS',
};

const CLS_STATUS_ID: Record<number, string> = {
  [CLS_ORDER_STATUS.PENDING]: 'pending',
  [CLS_ORDER_STATUS.COMPLETED]: 'placed',
  [CLS_ORDER_STATUS.CLS_CONFIRMED]: 'confirmed',
};

/** The eager-loaded shape `orders.repository` returns for a detail read. */
interface ClsOrderWithIncludes extends ClsOrder {
  destinationCountry?: {
    country_name: string | null;
    country_name_display: string | null;
  } | null;
  travellers?: OrderTravellerDetails[];
  documents?: ClsOrderDocuments[];
  policeClearanceDetails?: {
    date_cls_received_all_items: string | null;
    date_submitted_for_processing: string | null;
    date_completed_and_received_at_cls: string | null;
    date_order_on_route_and_closed: string | null;
  }[];
  voucherDetails?: {
    date_cls_received_all_items: string | null;
    date_submitted_for_processing: string | null;
    date_completed_and_received_at_cls: string | null;
    date_order_on_route_and_closed: string | null;
  }[];
  legalisationDetails?: {
    date_cls_received_all_items: string | null;
    date_submitted_for_processing: string | null;
    date_completed_and_received_at_cls: string | null;
    date_order_on_route_and_closed: string | null;
  }[];
}

const countryName = (
  country:
    | { country_name: string | null; country_name_display: string | null }
    | null
    | undefined
): string | null =>
  country ? clean(country.country_name_display ?? country.country_name) : null;

/**
 * The milestone dates for whichever service this order is.
 *
 * Each `*_order_details` table carries its own copy of the same four columns,
 * so the first detail row present wins. An order with no detail row at all —
 * which happens for the plain visa types — falls back to four nulls, giving
 * zero progress rather than an error.
 */
const clsMilestones = (order: ClsOrderWithIncludes): Milestones => {
  const detail =
    order.policeClearanceDetails?.[0] ??
    order.voucherDetails?.[0] ??
    order.legalisationDetails?.[0] ??
    null;

  return readMilestones(
    detail?.date_cls_received_all_items,
    detail?.date_submitted_for_processing,
    detail?.date_completed_and_received_at_cls,
    detail?.date_order_on_route_and_closed
  );
};

export const toOrderView = (
  order: ClsOrderWithIncludes,
  consultant: { name: string | null; email: string | null } | null = null
): OrderView => {
  const destination = countryName(order.destinationCountry);
  const travellers = order.travellers ?? [];
  const documents = order.documents ?? [];

  // Unattended or rejected: either way the next move is the client's.
  const actionRequired = documents.some(
    (document) => document.status === 0 || document.status === 3
  );

  const milestones = clsMilestones(order);
  const status = order.status ?? CLS_ORDER_STATUS.PENDING;

  // `total_fee` is a varchar and holds anything from `1250.00` to `TBA`.
  const amountCents = toCents(order.total_fee);

  const primary =
    travellers.find((traveller) => traveller.is_primary === 1) ?? travellers[0];

  const applicant =
    fullName(primary?.first_name, primary?.last_name) ??
    fullName(order.contact_first_name, order.contact_last_name);

  return {
    // Derived, not read: `order_no` on this table holds the id CLS's admin keys
    // on. See `domain/orderReference`.
    reference: orderReference(order.id),
    orderType: order.order_type ? (ORDER_TYPE_LABEL[order.order_type] ?? null) : null,
    orderTypeCode: order.order_type,
    service: order.order_type ? (ORDER_TYPE_LABEL[order.order_type] ?? null) : null,
    detail: detailLine(travellers.length, destination),
    applicant,
    destination,
    stage: clsStageOf(actionRequired, {
      completedAtCls: milestones.dates[2] !== null,
      closed: milestones.dates[3] !== null,
    }),
    status: CLS_STATUS_ID[status] ?? 'pending',
    statusLabel: CLS_STATUS_LABEL[status] ?? 'In progress',
    progress: milestones.progress,
    milestone: milestones.milestone,
    milestones: milestones.slots,
    // No column records a promised ready date. See the note at the top.
    eta: null,
    updated: toIso(order.date_last_saved) ?? toIso(order.date_submitted),
    submittedAt: toIso(order.date_submitted),
    departureDate: toDateOnly(order.departure_date),
    amountCents,
    quoteRequired: amountCents === null,
    paid: order.payment_status === PAYMENT_STATUS.COMPLETE,
    // `tbl_cls_order` holds no transaction id; it lives on `tbl_payment`, and
    // the service layer fills this in when it has read one.
    transactionId: null,
    consultant: consultant ? toConsultantView(consultant.name, consultant.email) : null,
    actionRequired,
    source: 'cls_order',
  };
};

// ---------------------------------------------------------------------------
// tbl_orders
// ---------------------------------------------------------------------------

const LEGACY_STATUS_LABEL: Record<number, string> = {
  [LEGACY_ORDER_STATUS.ORDERED]: 'Received',
  [LEGACY_ORDER_STATUS.PAID]: 'Paid',
  [LEGACY_ORDER_STATUS.COMPLETED]: 'Completed',
};

const LEGACY_STATUS_ID: Record<number, string> = {
  [LEGACY_ORDER_STATUS.ORDERED]: 'received',
  [LEGACY_ORDER_STATUS.PAID]: 'paid',
  [LEGACY_ORDER_STATUS.COMPLETED]: 'completed',
};

interface LegacyOrderWithIncludes extends Orders {
  destinationCountry?: {
    country_name: string | null;
    country_name_display: string | null;
  } | null;
  travellers?: OrderTravellers[];
  notes?: OrderNotes[];
}

/**
 * A legacy order to the same view.
 *
 * The milestone dates here are on the order row itself rather than a detail
 * table — `police_clearance_date_cls_received_all_items` and its three
 * siblings — which is one of the differences that made `tbl_cls_order` worth
 * building. Only the police clearance set exists on this table, so a legacy
 * visa order shows no progress. That is a gap in the data, not in this code.
 */
export const toLegacyOrderView = (
  order: LegacyOrderWithIncludes,
  consultant: { name: string | null; email: string | null } | null = null
): OrderView => {
  const destination = countryName(order.destinationCountry);
  const travellers = order.travellers ?? [];
  const status = order.status ?? LEGACY_ORDER_STATUS.ORDERED;

  const milestones = readMilestones(
    order.police_clearance_date_cls_received_all_items,
    order.police_clearance_date_submitted_for_processing,
    order.police_clearance_date_completed_and_received_at_cls,
    order.police_clearance_date_order_on_route_and_closed
  );

  const amountCents = toCents(order.grand_total);

  return {
    reference: String(order.order_no),
    orderType: order.order_type ? (ORDER_TYPE_LABEL[order.order_type] ?? null) : null,
    orderTypeCode: order.order_type,
    service: order.order_type ? (ORDER_TYPE_LABEL[order.order_type] ?? null) : null,
    detail: detailLine(travellers.length, destination),
    applicant:
      clean(order.primary_traveller_name) ??
      fullName(order.pri_dept_contact_fname, order.pri_dept_contact_lname),
    destination,
    stage: legacyStageOf(status, false),
    status: LEGACY_STATUS_ID[status] ?? 'received',
    statusLabel: LEGACY_STATUS_LABEL[status] ?? 'Received',
    progress: milestones.progress,
    milestone: milestones.milestone,
    milestones: milestones.slots,
    eta: null,
    updated: toIso(order.date_last_saved) ?? toIso(order.date_submitted),
    submittedAt: toIso(order.date_submitted),
    departureDate: toDateOnly(order.departure_date),
    amountCents,
    quoteRequired: amountCents === null,
    paid: status >= LEGACY_ORDER_STATUS.PAID,
    transactionId: null,
    consultant: consultant ? toConsultantView(consultant.name, consultant.email) : null,
    actionRequired: false,
    source: 'legacy_order',
  };
};

// ---------------------------------------------------------------------------
// Satellites
// ---------------------------------------------------------------------------

/**
 * A consultant's note, as a client reads it.
 *
 * Matches the website's `PortalOrderComment`. `postedAt` is a full timestamp
 * rather than relative wording because two notes written on the same day have
 * to sort by the hour.
 */
export const toCommentView = (note: OrderNotes, reference: string) => ({
  id: String(note.id),
  reference,
  author: clean(note.note_by_name) ?? 'Capital Link Services',
  /**
   * Which side wrote it, in two values only.
   *
   * `user_type` holds `client` or `admin` — the old application's own words, and
   * not a desk despite what the website's type comment once claimed. It used to be
   * passed through raw, which meant a client's own note came back as the lowercase
   * `client` and every screen comparing against `'Client'` silently treated it as
   * a consultant's. Now that clients can post notes, that comparison decides which
   * side of the thread a message is drawn on, so the value is normalised here
   * rather than at each of the three places that read it.
   */
  authorRole: clean(note.user_type)?.toLowerCase() === 'client' ? 'Client' : 'Consultant',
  postedAt: toIso(note.date_added),
  body: clean(note.note) ?? '',
  // Only present when true. The website's type has it as `actionRequired?: true`,
  // so an absent key and `false` mean the same thing and the absent one is
  // cheaper to read.
  ...(clean(note.status)?.toLowerCase() === 'action required'
    ? { actionRequired: true as const }
    : {}),
});

/**
 * A document on an order.
 *
 * `document` holds the stored filename and the size is not recorded anywhere —
 * `tbl_cls_order_documents` has no byte count — so `meta` carries the type
 * alone. The website appends the date itself.
 */
export const toDocumentView = (
  document: ClsOrderDocuments,
  reference: string,
  note: ClsOrderDocumentNotes | null = null
) => ({
  id: String(document.id),
  name: clean(document.document) ?? 'Document',
  reference,
  state: DOCUMENT_STATE[document.status ?? 0] ?? 'received',
  meta: describeFile(clean(document.document), null),
  note: note ? truncate(clean(note.notes), 300) : null,
  createdAt: toIso(document.created),
  updatedAt: toIso(document.modified),
  /**
   * Whether the website should offer a download and a remove control.
   *
   * Carried on the row rather than inferred by the website, because the answer
   * differs per document *source* and the website has no business knowing which
   * table a document came from. An uploaded document has a file and can be
   * withdrawn until CLS reviews it; a legalisation row often has neither — see
   * `toLegalisationDocumentView` below.
   *
   * `downloadable` is "there is a filename recorded", not "the file is on disk".
   * The download route is the only thing that can answer the second question, and
   * it answers it with a 404 and a message naming the consultant.
   */
  downloadable: clean(document.document) !== null,
  /**
   * False once CLS has reviewed it. The same rule the delete route enforces, said
   * here so the website can grey the control out rather than offering an action
   * that will be refused — a reviewed document may already be part of a
   * submission lodged with an embassy.
   */
  removable:
    document.status !== DOCUMENT_STATUS.REVIEWED &&
    document.status !== DOCUMENT_STATUS.APPROVED,
});

// ---------------------------------------------------------------------------
// Legalisation documents
// ---------------------------------------------------------------------------

/**
 * A document on a legalisation order, in the same shape as an uploaded one.
 *
 * ## Why this exists at all
 *
 * The portal's documents screen used to read `tbl_cls_order_documents` and
 * nothing else, so every document on a document-attestation order was invisible
 * to the client who lodged it. Those rows are in
 * `tbl_document_legalization_documents`, written by `orders.lodge` from the
 * attestation form's own document table, and there is no reason a client should
 * see the passport scan they uploaded but not the four certificates they told us
 * they were sending.
 *
 * ## Why the id is prefixed
 *
 * `dl-14` rather than `14`. Both tables auto-increment from 1, so a bare id would
 * collide — and the download route resolves an id straight to a stored file. A
 * client asking for their own document 14 could have been handed a different
 * document 14 on another of their own orders. The prefix makes the two id spaces
 * distinguishable, and `portal.service` dispatches on it.
 *
 * ## What is different about these rows
 *
 * They are a **declaration** as much as a file. The attestation form asks what
 * documents are being sent, how many of each, and lets the client name the files
 * they will attach — so a row can exist with `document_file` null, meaning "the
 * client says this is coming". That is worth showing: it is the list a consultant
 * checks the envelope against. It is also why these are not removable — deleting
 * one would take a line off the order rather than withdraw an upload.
 *
 * There is no status column on this table, so the state is derived from whether
 * a file has arrived — see the note on `state` below.
 */
export const toLegalisationDocumentView = (
  document: OrderDlChecklist,
  reference: string
) => {
  const stored = clean(document.doc_file);
  const quantity = document.number ?? 0;

  return {
    id: `dl-${document.id}`,
    name: clean(document.type) ?? 'Document',
    reference,
    /**
     * Derived, because `tbl_order_dl_checklist` has no status column.
     *
     * The old admin's own DL screen makes the same distinction the same way — it
     * renders a "Show Uploaded Document" link when `doc_file` is set and nothing
     * when it is not. A row with a file has been received; one without is a line
     * the client said was coming and CLS is still waiting for.
     */
    state: stored ? DOCUMENT_STATE[DOCUMENT_STATUS.UPLOADED] : 'awaiting',
    /**
     * The type and the count, or "Listed on your order" where there is no file.
     *
     * `describeFile` answers null without a filename, and a blank meta line on a
     * row that is deliberately fileless reads as missing data rather than as a
     * document still to arrive.
     */
    meta:
      [
        describeFile(stored, null),
        quantity > 1 ? `${quantity} copies` : null,
        stored ? null : 'Listed on your order',
      ]
        .filter(Boolean)
        .join(' · ') || null,
    note: truncate(clean(document.note), 300),
    // No timestamps on this table at all. Null rather than a guess from the id —
    // see the sort note in `portal.service.documents`.
    createdAt: null,
    updatedAt: null,
    /** False when there is no file behind the row, so no download is offered. */
    downloadable: stored !== null,
    /**
     * Never. A client removing one of these takes a document off their own order,
     * which is a change to what CLS has been asked to legalise rather than the
     * withdrawal of an upload.
     */
    removable: false,
  };
};

/**
 * A payment, as a receipt line.
 *
 * Every card column on `tbl_payment` — `card_number`, `ccv_number`,
 * `name_on_card`, `card_expiry_*` — is deliberately absent from this shape and
 * from every other shape in this codebase. Those columns should not exist and
 * this API will not be the thing that reads them out over HTTP.
 */
export const toPaymentView = (payment: Payment) => ({
  id: String(payment.id),
  transactionId: clean(payment.transaction_id),
  paidAt: toIso(payment.date_paid),
  amountCents: toCents(payment.total_order_price),
  status: payment.payment_status === PAYMENT_STATUS.COMPLETE ? 'complete' : 'failed',
  method: payment.payment_option === 1 ? 'card' : 'account',
  payer: {
    name: fullName(payment.fname, payment.lname),
    // Masked even on a client's own receipt: a response body is a thing that
    // gets logged, cached and forwarded.
    email: maskEmail(payment.email),
  },
});

/**
 * The timeline of an order, built from whatever dates are recorded.
 *
 * Assembled rather than read: there is no event table, so "what happened when"
 * has to come from the milestone columns and the notes. Entries with no date are
 * dropped, so a timeline shows what is known and does not imply the rest.
 */
export interface TimelineEntry {
  id: string;
  label: string;
  at: string;
  kind: 'submitted' | 'milestone' | 'note' | 'payment';
}

export const buildTimeline = (
  order: OrderView,
  milestoneDates: readonly (string | null)[],
  notes: readonly OrderNotes[],
  payments: readonly Payment[]
): TimelineEntry[] => {
  const entries: TimelineEntry[] = [];

  if (order.submittedAt) {
    entries.push({
      id: 'submitted',
      label: 'Order received by CLS',
      at: order.submittedAt,
      kind: 'submitted',
    });
  }

  milestoneDates.forEach((date, index) => {
    if (!date) return;
    entries.push({
      id: `milestone-${index}`,
      label: MILESTONE_LABELS[index] ?? 'Progress',
      at: date,
      kind: 'milestone',
    });
  });

  for (const payment of payments) {
    const at = toIso(payment.date_paid);
    if (!at || payment.payment_status !== PAYMENT_STATUS.COMPLETE) continue;

    entries.push({
      id: `payment-${payment.id}`,
      label: 'Payment received',
      at,
      kind: 'payment',
    });
  }

  for (const note of notes) {
    const at = toIso(note.date_added);
    if (!at) continue;

    entries.push({
      id: `note-${note.id}`,
      label: truncate(clean(note.note), 120) ?? 'Note added',
      at,
      kind: 'note',
    });
  }

  return entries.sort((left, right) => left.at.localeCompare(right.at));
};

// ---------------------------------------------------------------------------
// Public tracking
// ---------------------------------------------------------------------------

/**
 * The tracking response — deliberately thin.
 *
 * A reference plus an email is the only credential this lookup has, and both are
 * guessable in combination. So the response carries the service, where it is
 * going, and how far along it is. No addresses, no passport details, no full
 * email, no amounts.
 */
export interface TrackedOrderView {
  reference: string;
  serviceLabel: string;
  categoryId: TrackCategoryId | null;
  applicant: string;
  destination: string;
  statusId: string;
  statusLabel: string;
  progress: number;
  milestone: string | null;
  placedAt: string | null;
}

export const toTrackedView = (order: OrderView): TrackedOrderView => ({
  reference: order.reference,
  serviceLabel: order.service ?? 'Capital Link Services order',
  categoryId: order.orderTypeCode
    ? (ORDER_TYPE_CATEGORY[order.orderTypeCode] ?? null)
    : null,
  // Initials only. A full name against a guessed reference would confirm who a
  // client is to whoever guessed it.
  applicant: order.applicant
    ? order.applicant
        .split(/\s+/)
        .map((part) => part.charAt(0).toUpperCase())
        .join('')
    : '—',
  destination: order.destination ?? '—',
  statusId: order.status,
  statusLabel: order.statusLabel,
  progress: order.progress,
  milestone: order.milestone,
  placedAt: order.submittedAt,
});
