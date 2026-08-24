import { notFound } from '../../shared/errors';
import { toIso } from '../../shared/dates';
import { clean, fullName } from '../../shared/text';
import { Countries, OrderReturnDocumentDetails } from '../../models';
import type { ClsOrder, Orders } from '../../models';
import { materialiseChecklistQuietly } from '../../domain/checklist';
import * as repository from './orders.repository';
import {
  buildTimeline,
  toCommentView,
  toDocumentView,
  toLegacyOrderView,
  toOrderView,
  toPaymentView,
  toTrackedView,
  type OrderView,
  type TimelineEntry,
} from './orders.presenter';

/**
 * Reading an order, whichever table it lives in.
 *
 * `resolve` is the function that matters. A reference arrives as a string and
 * could belong to either family, so it tries the newer table and falls back to
 * the older one — and returns the row *plus* which family it came from, because
 * everything downstream (documents, notes, payments) joins on a different column
 * depending on the answer.
 *
 * **Ownership failures are reported as 404.** Not 403. A client asking about
 * somebody else's reference gets the same answer as one asking about a reference
 * that does not exist. Distinguishing them turns the API into a way of
 * discovering which references are real, and in the legacy family they are
 * sequential integers — so that would be a short walk.
 */

export type ResolvedOrder =
  | { family: 'cls'; row: ClsOrder; clientId: number | null }
  | { family: 'legacy'; row: Orders; clientId: number | null };

/**
 * Finds an order by reference. Does not check who is asking.
 *
 * Kept separate from the ownership check so the public tracking lookup — which
 * authorises on a reference-plus-email pair instead of a session — can reuse it
 * without an authorisation model that does not apply to it.
 */
export const resolve = async (reference: string): Promise<ResolvedOrder | null> => {
  const cls = await repository.findClsOrderByReference(reference);
  if (cls) return { family: 'cls', row: cls, clientId: cls.client_id };

  const legacy = await repository.findLegacyOrderByReference(reference);
  if (legacy) return { family: 'legacy', row: legacy, clientId: legacy.client_id };

  return null;
};

/**
 * Finds an order the caller is entitled to see, or throws 404.
 *
 * `isAdmin` widens it to every order, which is what the back office needs. A
 * client sees only their own.
 */
export const resolveForClient = async (
  reference: string,
  clientId: number,
  isAdmin = false
): Promise<ResolvedOrder> => {
  const resolved = await resolve(reference);

  if (!resolved) throw notFound('We could not find an order with that reference.');

  if (!isAdmin && resolved.clientId !== clientId) {
    // Same message as above, deliberately.
    throw notFound('We could not find an order with that reference.');
  }

  return resolved;
};

/** The consultant on an order, from whichever column holds the staff id. */
const consultantFor = async (
  resolved: ResolvedOrder
): Promise<{ name: string | null; email: string | null } | null> => {
  const staffId =
    resolved.family === 'cls'
      ? resolved.row.visa_cls_team_member
      : resolved.row.visa_cls_team_member;

  const admin = await repository.findConsultant(staffId);
  if (!admin) return null;

  return {
    name: [clean(admin.fname), clean(admin.lname)].filter(Boolean).join(' ') || null,
    email: clean(admin.email),
  };
};

/**
 * The numeric key `tbl_payment.order_no` joins on.
 *
 * For a legacy order that is the primary key. For a `tbl_cls_order` the
 * reference is TEXT, so this only works when the reference happens to parse as
 * a number — and returns null when it does not. That is a genuine limitation of
 * joining an `int` column to a `text` one, and the alternative would be a
 * full-table scan with a cast on every payment lookup.
 */
const paymentKey = (resolved: ResolvedOrder): number | null => {
  if (resolved.family === 'legacy') return resolved.row.order_no;

  const reference = clean(resolved.row.order_no);
  if (!reference) return null;

  const digits = /(\d+)$/.exec(reference)?.[1];
  if (!digits) return null;

  const parsed = Number.parseInt(digits, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

/** One order, with its consultant and payment reference filled in. */
export const view = async (resolved: ResolvedOrder): Promise<OrderView> => {
  const consultant = await consultantFor(resolved);

  const base =
    resolved.family === 'cls'
      ? toOrderView(resolved.row, consultant)
      : toLegacyOrderView(resolved.row, consultant);

  const key = paymentKey(resolved);
  if (key === null) return base;

  const payments = await repository.listPayments(key);
  const settled = payments.find((payment) => payment.payment_status === 1);

  return {
    ...base,
    transactionId: settled ? clean(settled.transaction_id) : base.transactionId,
    paid: base.paid || settled !== undefined,
  };
};

export interface OrderListResult {
  orders: OrderView[];
  total: number;
}

/**
 * A client's orders, from both tables, newest first.
 *
 * Paged across two tables, which cannot be done exactly: `LIMIT` applied to each
 * separately then merged does not give the same page as `LIMIT` over the union.
 * So both are read at the requested depth, merged, sorted and sliced. That is
 * correct for the page the caller asked for, at the cost of reading up to twice
 * as many rows as it returns — acceptable because a client has tens of orders,
 * not thousands.
 *
 * The alternative — a raw `UNION` query — would mean writing the column mapping
 * for 145 legacy columns into SQL by hand, and losing the presenters.
 */
export const listForClient = async (
  clientId: number,
  options: { limit: number; offset: number; orderType?: number }
): Promise<OrderListResult> => {
  const depth = options.limit + options.offset;

  const [cls, legacy] = await Promise.all([
    repository.listClsOrders({
      clientId,
      limit: depth,
      offset: 0,
      ...(options.orderType ? { orderType: options.orderType } : {}),
    }),
    repository.listLegacyOrders({
      clientId,
      limit: depth,
      offset: 0,
      ...(options.orderType ? { orderType: options.orderType } : {}),
    }),
  ]);

  const merged = [
    ...cls.rows.map((row) => toOrderView(row)),
    ...legacy.rows.map((row) => toLegacyOrderView(row)),
  ].sort((left, right) => {
    // Nulls last: an order with no submission date is older than one with a
    // date, as far as a client scanning the list is concerned.
    const a = left.submittedAt ?? '';
    const b = right.submittedAt ?? '';
    return b.localeCompare(a);
  });

  return {
    orders: merged.slice(options.offset, options.offset + options.limit),
    total: cls.count + legacy.count,
  };
};

/**
 * The notes on an order, as the client may read them.
 *
 * `tbl_order_notes` joins on the legacy `order_no`, so a `tbl_cls_order` has no
 * notes to show unless its reference resolves to a number. Internal notes are
 * filtered out in the repository — see the note there, it is the most important
 * filter in this module.
 */
export const comments = async (resolved: ResolvedOrder) => {
  const key = paymentKey(resolved);
  if (key === null) return [];

  const reference =
    resolved.family === 'cls'
      ? (clean(resolved.row.order_no) ?? String(resolved.row.id))
      : String(resolved.row.order_no);

  const notes = await repository.listClientVisibleNotes(key);

  return notes.map((note) => toCommentView(note, reference));
};

/** The documents on an order, with any review note attached. */
export const documents = async (resolved: ResolvedOrder) => {
  if (resolved.family !== 'cls') {
    // `tbl_cls_order_documents` keys on `order_id`, which the legacy table does
    // not have. A legacy order's documents are the files named in its own
    // columns, which are not enumerable as a list.
    return [];
  }

  const reference = clean(resolved.row.order_no) ?? String(resolved.row.id);

  /**
   * The checklist is derived here too, if it has not been already.
   *
   * `ManageOrderDocumentsController::indexAction` does exactly this — a
   * consultant opening an order's documents materialises the checklist if the
   * order has none — and it is what makes the list appear on an order whose visa
   * type was only settled after it was lodged. The materialiser is idempotent and
   * returns early when rows exist, so this costs one `COUNT(*)` on the ordinary
   * path.
   *
   * Quietly: a read a client is waiting on must not fail because the catalogue
   * was unreachable, or because the deployment is running `DB_READ_ONLY`.
   */
  await materialiseChecklistQuietly(resolved.row);

  const [rows, notes] = await Promise.all([
    repository.listClsDocuments(resolved.row.id),
    repository.listDocumentNotes(resolved.row.id),
  ]);

  const noteFor = new Map(
    notes.map((note) => [note.order_document_id, note] as const)
  );

  return rows.map((row) => toDocumentView(row, reference, noteFor.get(row.id) ?? null));
};

/** Everything that has happened to an order, in order. */
export const timeline = async (
  resolved: ResolvedOrder
): Promise<TimelineEntry[]> => {
  const [order, key] = [await view(resolved), paymentKey(resolved)];

  const [notes, payments] = await Promise.all([
    key === null ? Promise.resolve([]) : repository.listClientVisibleNotes(key),
    key === null ? Promise.resolve([]) : repository.listPayments(key),
  ]);

  const milestoneDates =
    resolved.family === 'cls'
      ? clsMilestoneDates(resolved.row)
      : legacyMilestoneDates(resolved.row);

  return buildTimeline(order, milestoneDates, notes, payments);
};

/** The four milestone dates off whichever detail table this order has. */
const clsMilestoneDates = (row: ClsOrder): (string | null)[] => {
  const withIncludes = row as unknown as {
    policeClearanceDetails?: Record<string, unknown>[];
    voucherDetails?: Record<string, unknown>[];
    legalisationDetails?: Record<string, unknown>[];
  };

  const detail =
    withIncludes.policeClearanceDetails?.[0] ??
    withIncludes.voucherDetails?.[0] ??
    withIncludes.legalisationDetails?.[0];

  return [
    toIso(detail?.date_cls_received_all_items),
    toIso(detail?.date_submitted_for_processing),
    toIso(detail?.date_completed_and_received_at_cls),
    toIso(detail?.date_order_on_route_and_closed),
  ];
};

const legacyMilestoneDates = (row: Orders): (string | null)[] => [
  toIso(row.police_clearance_date_cls_received_all_items),
  toIso(row.police_clearance_date_submitted_for_processing),
  toIso(row.police_clearance_date_completed_and_received_at_cls),
  toIso(row.police_clearance_date_order_on_route_and_closed),
];

/** The payments and receipts on an order. */
export const payments = async (resolved: ResolvedOrder) => {
  const key = paymentKey(resolved);
  if (key === null) return [];

  const rows = await repository.listPayments(key);
  return rows.map(toPaymentView);
};

// ---------------------------------------------------------------------------
// Where the documents are going
// ---------------------------------------------------------------------------

/**
 * Where the finished documents are going, as recorded on **this order**.
 *
 * ## Why this is not the client's profile address
 *
 * The account has a delivery address and so does every order, and they are
 * routinely different: a client whose certificates go to their employer this
 * month and to their home next month has one account and two orders. The order
 * view screen shows the order's own address for that reason — reading the profile
 * there would tell a client their documents are going somewhere they are not.
 *
 * ## What each family can answer
 *
 * A `tbl_cls_order` keeps it in `tbl_order_return_document_details`, one row per
 * order, which is what the website's own order forms write. A legacy `tbl_orders`
 * row keeps it in its own `doc_delivery_*` columns — the same facts under
 * different names, read here so an old order does not show an empty panel. The
 * legacy block has no state column and no country, so those come back null rather
 * than guessed.
 *
 * Null when the order records no return address at all, which is ordinary: a
 * Russian voucher is issued electronically and has nothing to courier.
 */
export interface DeliveryView {
  company: string | null;
  contactName: string | null;
  contactNumber: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  /** The country's display name, resolved from `country_id`. */
  country: string | null;
  /** When CLS expects to send it back, if a consultant has set a date. */
  returningDate: string | null;
  /** The client's own delivery instructions — the one free-text column. */
  comment: string | null;
}

/** True once any part of the address was actually recorded. */
const hasAnyDetail = (view: DeliveryView): boolean =>
  Object.values(view).some((value) => value !== null);

const legacyDelivery = (row: Orders): DeliveryView | null => {
  const view: DeliveryView = {
    company: clean(row.doc_delivery_company),
    contactName:
      clean(row.doc_delivery_recipient_name) ??
      clean(row.doc_delivery_primary_receipient_contact_name),
    contactNumber:
      clean(row.doc_delivery_contact_no) ??
      clean(row.doc_delivery_primary_receipient_contact_no),
    email:
      clean(row.doc_delivery_email) ??
      clean(row.doc_delivery_primary_receipient_email),
    address: clean(row.doc_delivery_address),
    city: clean(row.doc_delivery_city),
    state: null,
    postcode: clean(row.doc_delivery_postcode),
    country: null,
    returningDate: null,
    comment: null,
  };

  // Every field empty means the row never carried a delivery address, which is a
  // different answer from "here is a blank one".
  return hasAnyDetail(view) ? view : null;
};

export const delivery = async (
  resolved: ResolvedOrder
): Promise<DeliveryView | null> => {
  if (resolved.family === 'legacy') return legacyDelivery(resolved.row);

  const row = await OrderReturnDocumentDetails.findOne({
    where: { order_id: resolved.row.id },
    // Newest first: the table has no uniqueness on `order_id`, and an order whose
    // address was corrected has two rows with the later one being the truth.
    order: [['id', 'DESC']],
  });

  if (!row) return null;

  /**
   * The country by name, not by id.
   *
   * Looked up rather than joined: `country_id` here has no foreign key, so the
   * association would be as loose as every other one in this schema and a single
   * `findByPk` is both cheaper and clearer. Null where the row named no country,
   * which most do not — the address is usually Australian.
   */
  const country =
    row.country_id === null ? null : await Countries.findByPk(row.country_id);

  return {
    company: clean(row.company),
    contactName: fullName(row.first_name, row.last_name),
    contactNumber: clean(row.contact_number),
    email: clean(row.email),
    address: clean(row.address),
    city: clean(row.city),
    state: clean(row.state),
    postcode: clean(row.postcode),
    country: country
      ? clean(country.country_name_display ?? country.country_name)
      : null,
    returningDate: toIso(row.returning_date),
    comment: clean(row.additional_comment),
  };
};

/**
 * The public tracking lookup.
 *
 * Reference and email, both required, and the response is a summary rather than
 * the order. Returns null for every failure — wrong reference, wrong email, no
 * such order — so the caller cannot tell which it was.
 */
export const track = async (reference: string, email: string) => {
  const cls = await repository.findClsOrderForTracking(reference, email);

  if (cls) {
    return toTrackedView(toOrderView(cls));
  }

  const legacy = await repository.findLegacyOrderForTracking(reference, email);

  if (legacy) {
    return toTrackedView(toLegacyOrderView(legacy));
  }

  return null;
};
