import { notFound } from '../../shared/errors';
import { toIso } from '../../shared/dates';
import { clean, fullName } from '../../shared/text';
import { Countries, OrderReturnDocumentDetails } from '../../models';
import type { ClsOrder, Orders } from '../../models';
import { materialiseChecklistQuietly } from '../../domain/checklist';
import { orderReference } from '../../domain/orderReference';
import {
  readClsMilestoneDates,
  readLegacyMilestoneDates,
  type ClsMilestoneSources,
} from '../../domain/milestones';
import * as repository from './orders.repository';
import {
  buildTimeline,
  toCommentView,
  toDestinationCommentView,
  toDocumentView,
  toLegacyOrderView,
  toLegalisationDocumentView,
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

/**
 * The reference a client sees for a resolved order, in one place.
 *
 * The two families keep their reference in different shapes and only one of them
 * is quotable. `tbl_orders.order_no` is a real reference number. `tbl_cls_order`
 * has no reference of its own — this API writes the row's own id into `order_no`
 * because CLS's admin keys on it (see `domain/orderReference`) — so reading that
 * column back gives `'10034341'`, which is not what the order itself is
 * presented as. `toOrderView` derives `CLS-10034341` from the id.
 *
 * Everything hung off an order used to build its reference inline from
 * `order_no`, which meant an order and its own documents came back under two
 * different references. The website filters an order's satellites by reference —
 * reasonably, since a list endpoint can carry more than one order's rows — so a
 * client's uploaded scans and their consultant's replies were fetched, returned,
 * and then dropped on the floor by a string comparison that could never be true.
 * The documents screen showed them because `portal.service` derived the reference
 * from the id, as here.
 */
export const clientReference = (resolved: ResolvedOrder): string =>
  resolved.family === 'cls'
    ? orderReference(resolved.row.id)
    : String(resolved.row.order_no);

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

  /**
   * The assigned consultants, loaded once for the whole page.
   *
   * These lists used to render every order as unassigned, because they called
   * the presenter with no consultant while the detail view passed one. Same
   * order, two answers: the dashboard card said "A consultant will be assigned
   * shortly" and the order page named them — which reads to a client as CLS
   * losing track of their job.
   *
   * Batched rather than resolved per row: this runs for every order a client
   * has, and `findConsultant` in a `map` would be an N+1.
   */
  const consultants = await repository.findConsultants([
    ...cls.rows.map((row) => row.visa_cls_team_member),
    ...legacy.rows.map((row) => row.visa_cls_team_member),
  ]);

  const consultantFor = (staffId: number | null) => {
    const admin = staffId === null ? undefined : consultants.get(staffId);
    if (!admin) return null;

    return {
      name: [clean(admin.fname), clean(admin.lname)].filter(Boolean).join(' ') || null,
      email: clean(admin.email),
    };
  };

  const merged = [
    ...cls.rows.map((row) => toOrderView(row, consultantFor(row.visa_cls_team_member))),
    ...legacy.rows.map((row) =>
      toLegacyOrderView(row, consultantFor(row.visa_cls_team_member))
    ),
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
 * The destination rows this order's consultant thread hangs off.
 *
 * Exported because `orders.writes.addClientComment` needs the same answer to
 * decide where a client's reply goes, and asking twice in two ways is how the
 * read and the write drift apart.
 */
export const destinationIds = (resolved: ResolvedOrder): Promise<number[]> =>
  resolved.family === 'cls'
    ? repository.listClsDestinationIds(resolved.row.id)
    : repository.listLegacyDestinationIds(resolved.row.order_no);

/**
 * The notes on an order, as the client may read them — both tables, one thread.
 *
 * ## Why two tables
 *
 * Because CLS writes in one and this API used to write in the other, and neither
 * could see the other's messages.
 *
 * `tbl_order_destination_notes` is where a consultant actually types. Every
 * order-view screen in CLS's admin puts its "Client comment" box inside the
 * destination block and posts `ticketComment[<destination id>]`, and
 * `ViewOrderController` files it against the destination — so this is the table
 * holding the message a client is waiting to read. On the document-legalisation
 * screen it is the *only* thread: that template's `tbl_order_notes` loop is
 * `is_admin == 1 and note.document_type == notes.document_type`, which renders
 * the chargeable "Notary / DFAT / $85" lines and nothing else. A client note
 * written to `tbl_order_notes` appeared on no CLS screen at all.
 *
 * `tbl_order_notes` stays in the read for two reasons: it holds every note
 * already written there — including the "Website order form" summary
 * `orders.lodge` files at submission — and it is the only place an order with no
 * destination row (clearance, voucher, document delivery) can have a thread.
 *
 * ## Which notes come back
 *
 * From both tables, the client-facing lane only. `is_admin = 1` marks CLS's own
 * working notes and they do not leave the firm: on `tbl_order_destination_notes`
 * they are the "Admin comment" box — internal correspondence about the order —
 * and on `tbl_order_notes` they are the chargeable "Notary / DFAT / $85" fee
 * lines, which are reported as charges rather than as messages. The filters are
 * in `listClientVisibleDestinationNotes` and `listClientVisibleNotes`; the first
 * carries the history of a request that was granted on 2026-08-26 and withdrawn
 * on 2026-08-27.
 *
 * ## Ordering
 *
 * Newest first, matching what each table returned on its own, so the website's
 * existing sort is unaffected. Merged on `postedAt` rather than concatenated,
 * because a consultant's reply and a client's question have to interleave to read
 * as a conversation. A note whose `date_added` will not parse sorts last rather
 * than being dropped — it is still a message somebody sent.
 */
export const comments = async (resolved: ResolvedOrder) => {
  const reference = clientReference(resolved);
  const key = paymentKey(resolved);

  const [orderNotes, destinationNotes] = await Promise.all([
    key === null ? Promise.resolve([]) : repository.listClientVisibleNotes(key),
    destinationIds(resolved).then(repository.listClientVisibleDestinationNotes),
  ]);

  return [
    ...orderNotes.map((note) => toCommentView(note, reference)),
    ...destinationNotes.map((note) => toDestinationCommentView(note, reference)),
  ].sort((left, right) => (right.postedAt ?? '').localeCompare(left.postedAt ?? ''));
};

/**
 * One attachment from the consultant thread, checked twice before it is served.
 *
 * The checks are the point, and there are two of them: the note must be on the
 * client-facing lane, and it must belong to this order. Each is explained where
 * it is made. Together they are the difference between a download route and a
 * way of reading any note's file by counting.
 *
 * Returns the bare stored filename; the route decides where to look for it.
 */
export const commentAttachment = async (
  resolved: ResolvedOrder,
  commentId: string
): Promise<{ filename: string }> => {
  const missing = notFound('We could not find that attachment.');

  const numeric = /^dn-(\d+)$/.exec(commentId.trim())?.[1];
  if (!numeric) throw missing;

  const note = await repository.findDestinationNote(Number.parseInt(numeric, 10));
  if (!note) throw missing;

  /**
   * The client-facing lane only, because an internal note's attachment is as
   * internal as its text.
   *
   * `findDestinationNote` is a lookup by primary key with no lane clause on it —
   * it has to be, since the caller only has an id — so this is where the lane is
   * enforced for the download route. Without it a client who guessed a note id
   * would be served the file a consultant attached to a working note, and the
   * thread filter above would have been the only thing standing between them and
   * it.
   *
   * Between 2026-08-26 and 2026-08-27 this check was dropped, on the reasoning
   * that the thread listed the note so it had to serve the file. The thread no
   * longer lists it. See `listClientVisibleDestinationNotes`.
   *
   * Refused as "not found", not as "forbidden": the answer must not tell the
   * caller that a note they cannot read exists.
   */
  if (note.is_admin === 1) throw missing;

  /**
   * The ownership check, which is the other half.
   *
   * A note id is a small integer from a MyISAM table with no order column on it,
   * so the only way to know an attachment belongs to the caller's order is to
   * confirm its `destination_id` is one of that order's destinations.
   */
  const ids = await destinationIds(resolved);
  if (note.destination_id === null || !ids.includes(note.destination_id)) {
    // Same wording as a note that does not exist: this must not become a way of
    // asking which note ids are real.
    throw missing;
  }

  const filename = clean(note.attachment);
  if (!filename) throw missing;

  return { filename };
};

/** The documents on an order, with any review note attached. */
export const documents = async (resolved: ResolvedOrder) => {
  if (resolved.family !== 'cls') {
    // `tbl_cls_order_documents` keys on `order_id`, which the legacy table does
    // not have. A legacy order's documents are the files named in its own
    // columns, which are not enumerable as a list.
    return [];
  }

  const reference = clientReference(resolved);

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

  /**
   * Both tables an order's documents can be in.
   *
   * `tbl_cls_order_documents` holds uploads and the materialised checklist. A
   * legalisation order's documents are somewhere else entirely: the attestation
   * form collects them as declared lines in `tbl_order_dl_checklist` — "Birth
   * Certificate Attestation ×1" — and `orders.writes.attachDocuments` fills a
   * line's `doc_file` when the matching scan arrives rather than inserting a row
   * beside it. So on an attestation order the uploaded documents *are* those
   * lines, and reading only the first table showed the client an empty tab on an
   * order they had sent four certificates for. Their documents screen listed
   * them, because `portal.service` reads both.
   *
   * There is no double-counting between the two. `materialiseChecklist` needs a
   * visa scope to write anything and an attestation order has none, so an order
   * with declared lines has no materialised rows to duplicate them.
   */
  const [rows, notes, declared] = await Promise.all([
    repository.listClsDocuments(resolved.row.id),
    repository.listDocumentNotes(resolved.row.id),
    repository.listOrderChecklist(resolved.row.id),
  ]);

  const noteFor = new Map(
    notes.map((note) => [note.order_document_id, note] as const)
  );

  return [
    ...rows.map((row) => toDocumentView(row, reference, noteFor.get(row.id) ?? null)),
    // Last, and not interleaved: `tbl_order_dl_checklist` has no timestamps at
    // all, so these carry a null `createdAt` and cannot be sorted against the
    // dated rows. `portal.service.documents` orders them the same way.
    ...declared.map((row) => toLegalisationDocumentView(row, reference)),
  ];
};

/**
 * Everything that has happened to an order, in order.
 *
 * Both note tables feed it, for the reason `comments` explains: the consultant's
 * own messages live in `tbl_order_destination_notes`, so a timeline reading only
 * `tbl_order_notes` showed the milestones and none of the correspondence. The
 * destination notes' ids are prefixed on the way in so `note-<id>` stays unique
 * across the two tables.
 */
export const timeline = async (
  resolved: ResolvedOrder
): Promise<TimelineEntry[]> => {
  const [order, key] = [await view(resolved), paymentKey(resolved)];

  const [notes, destinationNotes, payments] = await Promise.all([
    key === null ? Promise.resolve([]) : repository.listClientVisibleNotes(key),
    destinationIds(resolved).then(repository.listClientVisibleDestinationNotes),
    key === null ? Promise.resolve([]) : repository.listPayments(key),
  ]);

  const milestoneDates =
    resolved.family === 'cls'
      ? clsMilestoneDates(resolved.row)
      : legacyMilestoneDates(resolved.row);

  return buildTimeline(
    order,
    milestoneDates,
    [
      ...notes,
      ...destinationNotes.map((note) => ({
        id: `dn-${note.id}`,
        date_added: note.date_added,
        note: note.note,
      })),
    ],
    payments
  );
};

/**
 * The four milestone dates, from wherever this order's service records them.
 *
 * Both readers live in `domain/milestones` so the timeline entries below and the
 * stepper in `orders.presenter` can never disagree about where the dates are —
 * they did, and a legalisation order's timeline went missing in the portal as a
 * result.
 */
const clsMilestoneDates = (row: ClsOrder): (string | null)[] =>
  // Cast because the include aliases are not on the model type: `ClsOrder`
  // declares its own columns, and the eager-loaded children arrive beside them.
  readClsMilestoneDates(row as ClsOrder & ClsMilestoneSources);

const legacyMilestoneDates = (row: Orders): (string | null)[] =>
  readLegacyMilestoneDates(row);

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
