/**
 * The schema's magic numbers, written down once.
 *
 * Every constant here is copied from a `COMMENT` in
 * `db/schema/clspubli_staging.sql`. That is the only documentation these
 * columns have, and it is the reason this file exists: `status = 11` appearing
 * in a query is unreadable, and worse, unverifiable — the next person cannot
 * tell whether 11 was the right number or a typo for 1.
 *
 * Nothing here is invented. Where the schema's comment is incomplete, the gap
 * is noted rather than filled in with a guess.
 */

// ---------------------------------------------------------------------------
// Order type — `tbl_orders.order_type`, `tbl_cls_order.order_type`
//
// Schema comment, verbatim:
//   1=visa; 2=tpn; 3=tpn+visa; 4=passport delivery; 5=police clearance;
//   6=public visa; 7=document delivery; 8=russian visa voucher; 9=DL
// ---------------------------------------------------------------------------

export const ORDER_TYPE = {
  VISA: 1,
  TPN: 2,
  TPN_AND_VISA: 3,
  PASSPORT_DELIVERY: 4,
  POLICE_CLEARANCE: 5,
  PUBLIC_VISA: 6,
  DOCUMENT_DELIVERY: 7,
  RUSSIAN_VISA_VOUCHER: 8,
  /** "DL" in the schema comment — document legalisation. */
  DOCUMENT_LEGALISATION: 9,
} as const;

export type OrderTypeCode = (typeof ORDER_TYPE)[keyof typeof ORDER_TYPE];

/** What CLS calls each one to a client. */
export const ORDER_TYPE_LABEL: Record<number, string> = {
  [ORDER_TYPE.VISA]: 'Visa service',
  [ORDER_TYPE.TPN]: 'Travel Passport Notification',
  [ORDER_TYPE.TPN_AND_VISA]: 'TPN and visa service',
  [ORDER_TYPE.PASSPORT_DELIVERY]: 'Passport delivery',
  [ORDER_TYPE.POLICE_CLEARANCE]: 'Police clearance certificate',
  [ORDER_TYPE.PUBLIC_VISA]: 'Visa service',
  [ORDER_TYPE.DOCUMENT_DELIVERY]: 'Secure document delivery',
  [ORDER_TYPE.RUSSIAN_VISA_VOUCHER]: 'Russian visa voucher',
  [ORDER_TYPE.DOCUMENT_LEGALISATION]: 'Document legalisation',
};

/**
 * The tracking categories the website's public tracking screen renders.
 *
 * Five rails for nine order types, so several types share one. The website's
 * `TrackCategoryId` is the fixed set; this maps onto it rather than the other
 * way round, because changing it would mean changing the website.
 */
export type TrackCategoryId =
  | 'visa'
  | 'document-legalisation'
  | 'police-clearance'
  | 'russian-visa-voucher'
  | 'document-delivery';

export const ORDER_TYPE_CATEGORY: Record<number, TrackCategoryId> = {
  [ORDER_TYPE.VISA]: 'visa',
  [ORDER_TYPE.TPN]: 'visa',
  [ORDER_TYPE.TPN_AND_VISA]: 'visa',
  [ORDER_TYPE.PUBLIC_VISA]: 'visa',
  [ORDER_TYPE.PASSPORT_DELIVERY]: 'document-delivery',
  [ORDER_TYPE.DOCUMENT_DELIVERY]: 'document-delivery',
  [ORDER_TYPE.POLICE_CLEARANCE]: 'police-clearance',
  [ORDER_TYPE.RUSSIAN_VISA_VOUCHER]: 'russian-visa-voucher',
  [ORDER_TYPE.DOCUMENT_LEGALISATION]: 'document-legalisation',
};

/** The slugs the website's order journeys post, mapped to the schema's codes. */
export const SERVICE_SLUG_TO_ORDER_TYPE: Record<string, OrderTypeCode> = {
  visa: ORDER_TYPE.PUBLIC_VISA,
  'document-attestation': ORDER_TYPE.DOCUMENT_LEGALISATION,
  'document-legalisation': ORDER_TYPE.DOCUMENT_LEGALISATION,
  attestation: ORDER_TYPE.DOCUMENT_LEGALISATION,
  'police-clearance': ORDER_TYPE.POLICE_CLEARANCE,
  'russian-visa-voucher': ORDER_TYPE.RUSSIAN_VISA_VOUCHER,
  'document-delivery': ORDER_TYPE.DOCUMENT_DELIVERY,
  'passport-delivery': ORDER_TYPE.PASSPORT_DELIVERY,
  tpn: ORDER_TYPE.TPN,
};

// ---------------------------------------------------------------------------
// Order status
// ---------------------------------------------------------------------------

/**
 * `tbl_orders.status`.
 *
 * Schema comment, verbatim:
 *   1=destination; 2=Review TPN; 3=Review Order; 4=Place Order;
 *   10= ordered; 11=paid; 12=completed
 *
 * Note the gap: 1–4 are steps in the *wizard*, so a row with `status = 2` is a
 * half-finished basket rather than an order. 10 and up are real orders. That
 * split is why `isSubmitted` exists below — listing a client's orders without it
 * shows them every abandoned form they ever started.
 */
export const LEGACY_ORDER_STATUS = {
  WIZARD_DESTINATION: 1,
  WIZARD_REVIEW_TPN: 2,
  WIZARD_REVIEW_ORDER: 3,
  WIZARD_PLACE_ORDER: 4,
  ORDERED: 10,
  PAID: 11,
  COMPLETED: 12,
} as const;

/** Below this, the row is an unfinished wizard step and not an order. */
export const LEGACY_SUBMITTED_FROM = LEGACY_ORDER_STATUS.ORDERED;

/**
 * `tbl_cls_order.status`.
 *
 * Schema comment, verbatim: `0=pending; 1=completed; 2=cls_confirmed`
 *
 * **"completed" means the client completed the order, not that CLS completed the
 * job.** The comment reads the other way and it misleads; what the old
 * application actually does is unambiguous, and it does it in every flow:
 *
 * | Old application | Writes |
 * | --- | --- |
 * | `ApplicationPoliceClearanceController.php:733` — details saved | `0` |
 * | `ApplicationPoliceClearanceController.php:1300` — payment succeeded | `1` |
 * | `ApplicationRussianVisaVoucherController.php:421` / `:1063` | `0` then `1` |
 * | `VisaInformationController.php:1294` — payment succeeded | `1` |
 * | `ApplicationDocumentLegalisationController.php:896` — order placed | `2` |
 *
 * So the ladder is: `0` = in the client's hands and not yet placed, non-zero =
 * placed, `2` = CLS has acknowledged it. An order left at `0` reads to CLS's own
 * screens as an abandoned basket.
 *
 * That is why nothing here derives "the job is finished" from this column — the
 * milestone dates on the per-service detail tables are what record that, and
 * `clsStageOf` reads those instead.
 */
export const CLS_ORDER_STATUS = {
  PENDING: 0,
  /** Placed by the client. The schema calls it "completed"; see above. */
  COMPLETED: 1,
  CLS_CONFIRMED: 2,
} as const;

/** `tbl_cls_order.payment_status`, and `tbl_payment.payment_status`. */
export const PAYMENT_STATUS = {
  /** `tbl_payment` comment: `0=>failed,1=>complete`. */
  FAILED: 0,
  COMPLETE: 1,
} as const;

/** `tbl_payment.payment_option` — comment: `0 = account; 1=creditcard`. */
export const PAYMENT_OPTION = {
  ON_ACCOUNT: 0,
  CREDIT_CARD: 1,
} as const;

/** `tbl_payment.s_paid` — comment: `1=online; 2=by account`. */
export const PAID_VIA = {
  ONLINE: 1,
  ON_ACCOUNT: 2,
} as const;

// ---------------------------------------------------------------------------
// Documents — `tbl_cls_order_documents.status`
//
// Schema comment, verbatim:
//   0=unattended;1=uploaded;2=reviewed;3=rejected;4=approved
// ---------------------------------------------------------------------------

export const DOCUMENT_STATUS = {
  UNATTENDED: 0,
  UPLOADED: 1,
  REVIEWED: 2,
  REJECTED: 3,
  APPROVED: 4,
} as const;

/**
 * The five states the API publishes for a document.
 *
 * The website collapses these into three for display, which is its business —
 * the API reports what CLS actually recorded so that the review note can say
 * which of `in-review` and `rejected` a client is looking at.
 */
export type DocumentState = 'awaiting' | 'received' | 'in-review' | 'ready' | 'rejected';

export const DOCUMENT_STATE: Record<number, DocumentState> = {
  [DOCUMENT_STATUS.UNATTENDED]: 'awaiting',
  [DOCUMENT_STATUS.UPLOADED]: 'received',
  [DOCUMENT_STATUS.REVIEWED]: 'in-review',
  [DOCUMENT_STATUS.REJECTED]: 'rejected',
  [DOCUMENT_STATUS.APPROVED]: 'ready',
};

// ---------------------------------------------------------------------------
// Other coded columns
// ---------------------------------------------------------------------------

/** `entry_option` — comment: `1=single,2=double,3=multiple`. */
export const ENTRY_OPTION = {
  SINGLE: 1,
  DOUBLE: 2,
  MULTIPLE: 3,
} as const;

export const ENTRY_OPTION_LABEL: Record<number, string> = {
  [ENTRY_OPTION.SINGLE]: 'Single entry',
  [ENTRY_OPTION.DOUBLE]: 'Double entry',
  [ENTRY_OPTION.MULTIPLE]: 'Multiple entry',
};

/** `order_contact_option` — comment: `1=traveller; 2=OrderContact`. */
export const ORDER_CONTACT = {
  TRAVELLER: 1,
  ORDER_CONTACT: 2,
} as const;

/** `tbl_tpn.status` — comment: `0=pending; 1=approved; 2=rejected`. */
export const TPN_STATUS = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
} as const;

/** `tbl_user_client.type` — comment: `government, public, corporate`. */
export const CLIENT_TYPE = {
  GOVERNMENT: 'government',
  PUBLIC: 'public',
  CORPORATE: 'corporate',
} as const;

export type ClientType = (typeof CLIENT_TYPE)[keyof typeof CLIENT_TYPE];

/** `tbl_logs.area` — comment: `admin; dfat; client`. */
export const LOG_AREA = {
  ADMIN: 'admin',
  DFAT: 'dfat',
  CLIENT: 'client',
} as const;

/**
 * `s_enabled` and the `status` flags on the catalogue tables.
 *
 * `1=active; 0=inactive` on `tbl_visa_types.status` and friends. Written as a
 * constant because a query filtering `status: 1` reads as a magic number and
 * this schema has three different columns that mean "on".
 */
export const ENABLED = 1;
export const DISABLED = 0;

// ---------------------------------------------------------------------------
// Derived views the API publishes
// ---------------------------------------------------------------------------

/**
 * The stage the portal renders, from what the tables actually record.
 *
 * The website's `PortalOrderStage` has four values and neither order table has a
 * column that maps to them, so this is a derivation rather than a lookup:
 *
 * - `action-required` — CLS is waiting on the client (a rejected or unattended
 *   document on the order)
 * - `ready` — CLS has finished and the documents are on their way back
 * - `completed` — closed
 * - `in-progress` — everything else, which is most of the life of an order
 *
 * `in-progress` is the fallback rather than an error state, because a status
 * this map has not seen is still an order the client should see on their
 * dashboard.
 */
export type PortalStage = 'action-required' | 'in-progress' | 'ready' | 'completed';

/**
 * How far through the job an order is, from the milestone dates.
 *
 * Not from `status`, and that is the correction: `status = 1` means the *client*
 * placed the order (see `CLS_ORDER_STATUS`), so reading it as "finished" marked
 * every paid order completed the moment the money landed.
 *
 * The four milestone dates are what the old application stamps as a job moves,
 * and the last two are the two the client cares about:
 *
 * - `date_completed_and_received_at_cls` — the work is done and the documents are
 *   back with CLS, which is `ready`
 * - `date_order_on_route_and_closed` — they are on their way, which closes it
 */
export const clsStageOf = (
  hasOutstandingDocuments: boolean,
  milestones: { completedAtCls: boolean; closed: boolean }
): PortalStage => {
  if (hasOutstandingDocuments) return 'action-required';
  if (milestones.closed) return 'completed';
  if (milestones.completedAtCls) return 'ready';
  return 'in-progress';
};

export const legacyStageOf = (
  status: number | null,
  hasOutstandingDocuments: boolean
): PortalStage => {
  if (hasOutstandingDocuments) return 'action-required';
  if (status === LEGACY_ORDER_STATUS.COMPLETED) return 'completed';
  return 'in-progress';
};

/**
 * A rough percentage for the progress bar, from the milestone dates.
 *
 * The `*_order_details` tables record four dates as a job moves —
 * `date_cls_received_all_items`, `date_submitted_for_processing`,
 * `date_completed_and_received_at_cls`, `date_order_on_route_and_closed` — and
 * counting how many are set is the only progress signal the schema has. It is
 * approximate and deliberately so: the alternative is showing no progress bar,
 * and a client watching a legalisation for three weeks wants to see movement.
 */
export const progressFromMilestones = (
  dates: readonly (string | null)[]
): number => {
  const reached = dates.filter((date) => date !== null && date !== '').length;
  if (dates.length === 0) return 0;
  return Math.round((reached / dates.length) * 100);
};

/** The four milestone dates, in the order they happen, for progress and timeline. */
export const MILESTONE_LABELS = [
  'Received by CLS',
  'Submitted for processing',
  'Completed and back at CLS',
  'On its way to you',
] as const;

/** True when a legacy `tbl_orders` row is a real order rather than a draft. */
export const isSubmittedLegacyOrder = (status: number | null): boolean =>
  status !== null && status >= LEGACY_SUBMITTED_FROM;
