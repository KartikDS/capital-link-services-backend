import {
  ClsOrder,
  ClsOrderDocuments,
  OrderDestinationNotes,
  OrderDlChecklist,
  OrderNotes,
  OrderTravellerDetails,
  UserClient,
} from '../../models';
import { scopeOfOrder } from '../../domain/checklist';
import { badRequest, conflict } from '../../shared/errors';
import { toIso, toLegacyDateTime } from '../../shared/dates';
import { storedPathOf } from '../../shared/storage/documents';
import { clean, fullName } from '../../shared/text';
import { logger } from '../../shared/logger';
import {
  CLS_ORDER_STATUS,
  DOCUMENT_STATUS,
  LEGACY_ORDER_STATUS,
  SERVICE_SLUG_TO_ORDER_TYPE,
} from '../../domain/codes';
import { toCommentView, toDestinationCommentView } from './orders.presenter';
import { clientReference, destinationIds } from './orders.service';
import type { ResolvedOrder } from './orders.service';

/**
 * The writes an order supports, and the honest limits of each.
 *
 * Every function here had to be designed around something the schema does not
 * have, and the comments say which. That is the whole character of this module:
 * the interesting decisions are about what *cannot* be recorded, and reporting
 * that to the caller rather than returning 200 and dropping it.
 */

// ---------------------------------------------------------------------------
// Attaching documents
// ---------------------------------------------------------------------------

export interface AttachedDocument {
  id: string;
  name: string;
  storedAs: string;
  state: string;
}

/**
 * Records uploaded files against an order.
 *
 * `tbl_cls_order_documents.document` is a `varchar(255)` holding a filename, and
 * the row has no size, no MIME type and no original-name column. So the stored
 * name goes in the column, and the client's own filename survives only as the
 * slug `middleware/upload.storedName` appends to it — enough for a human to tell
 * a passport from a birth certificate on the portal's documents screen, not
 * enough to reconstruct the name exactly. The response returns both, so the
 * uploading client sees the mapping.
 *
 * Called from three places now, and the third is the reason the first two are
 * worth naming: the portal's upload control, an order's own upload endpoint, and
 * `POST /api/orders/documents`, which is what stores the scans a client attaches
 * to the order form before they have an account at all. All three land in the
 * same table keyed on the same `order_id`, which is why a guest order's documents
 * appear in the portal the moment `orders.claim` stamps a `client_id` on the
 * order — the portal resolves documents *through* the order, so nothing has to be
 * re-pointed at the new account.
 *
 * Status is `UPLOADED` (1), not `APPROVED`. A document a client has just sent is
 * one CLS has not looked at, and the old application's review workflow moves it
 * from there.
 *
 * Only the newer order family can take attachments: the document table keys on
 * `order_id`, which `tbl_orders` does not have.
 */
export const attachDocuments = async (
  resolved: ResolvedOrder,
  files: readonly Express.Multer.File[]
): Promise<AttachedDocument[]> => {
  if (resolved.family !== 'cls') {
    throw conflict(
      'Documents cannot be attached to an order of this age. Please email them to your consultant.'
    );
  }

  const orderId = resolved.row.id;
  const now = toLegacyDateTime();

  /**
   * The order's own scope, stamped onto every row.
   *
   * These columns were left null until now, and that was a defect rather than an
   * omission: the old admin's document screen selects with
   *
   * ```sql
   * WHERE cod.country_id = ? AND cod.visa_type_id = ?
   *   AND cod.order_id = ? AND cod.traveller_id = ?
   * ```
   *
   * (`ManageOrderDocumentsController::listAction`) — so a row with them null
   * matched nothing, and a client's uploaded passport was **invisible to CLS
   * staff working in their own application**. Filling them is what makes an
   * upload findable there.
   *
   * `traveller_id` is the order's primary applicant. The old application knows
   * exactly which traveller a file belongs to, because the client clicks upload
   * on that traveller's checklist row; ours cannot, because the order form posts
   * its files with nothing but a reference. Attributing them to the lead
   * applicant is the honest approximation, and on every journey that uploads
   * that is the person placing the order.
   */
  const [scope, travellers] = await Promise.all([
    scopeOfOrder(resolved.row),
    OrderTravellerDetails.findAll({
      where: { order_id: orderId },
      order: [['id', 'ASC']],
    }),
  ]);

  const primary =
    travellers.find((traveller) => traveller.is_primary === 1) ?? travellers[0];

  /**
   * The declared lines this order is still waiting on files for.
   *
   * A legalisation order's documents are declared before they are sent: the form
   * collects "Birth Certificate Attestation ×1" as a checklist line and the scans
   * separately. The old application then joins the two by having the client click
   * upload *on a line* — `DocumentUploadsController::uploadDocAction` sets
   * `doc_file` on that exact row and never inserts.
   *
   * Ours could not, so both halves showed on the portal at once: the line as
   * "UPLOAD NEEDED — Files to follow: itinerary4.jpg" and the file beside it as a
   * loose "RECEIVED" row. The same document, twice, in two different states.
   *
   * The join is recoverable because the website writes the filenames it is
   * expecting into the line's own note (`Files to follow: …`), so an arriving
   * file can be matched back to the line that declared it.
   */
  const declared = await OrderDlChecklist.findAll({
    where: { order_no: orderId, doc_file: null },
    order: [['id', 'ASC']],
  });

  const claimed = new Set<number>();

  /**
   * The line that declared this file, or null.
   *
   * Matched on the client's own filename appearing in the note, and **only when
   * exactly one unclaimed line mentions it**. Two lines naming the same file, or
   * none, fall through to a loose row — attaching a birth certificate to the
   * passport line because it was the nearest guess would tell a consultant
   * something untrue about the order.
   */
  const declaredFor = (originalName: string): OrderDlChecklist | null => {
    const needle = clean(originalName)?.toLowerCase();
    if (!needle) return null;

    const matches = declared.filter(
      (row) =>
        !claimed.has(row.id) && (clean(row.note)?.toLowerCase().includes(needle) ?? false)
    );

    return matches.length === 1 ? (matches[0] ?? null) : null;
  };

  const attached: AttachedDocument[] = [];

  /**
   * Sequential, not `Promise.all`.
   *
   * Two files can name the same declared line, and `claimed` is what stops them
   * both taking it. Resolving the matches concurrently would have each read the
   * set before the other wrote to it, and one line would silently swallow both
   * uploads.
   */
  for (const file of files) {
    /**
     * The path to record, which is the same value whether the bytes went to the
     * S3 bucket or to `UPLOAD_DIR`: relative, forward slashes, matching how the
     * old application stores paths in this column.
     */
    const stored = storedPathOf(file);

    const line = declaredFor(file.originalname);

    if (line) {
      claimed.add(line.id);
      await line.update({ doc_file: stored });

      attached.push({
        id: `dl-${line.id}`,
        name: clean(line.type) ?? file.originalname,
        storedAs: stored,
        state: 'received',
      });

      continue;
    }

    const row = await ClsOrderDocuments.create({
      order_id: orderId,
      country_id: scope.countryId,
      visa_type_id: scope.visaTypeId,
      entry_option: scope.entryOption,
      process_location_id: scope.processLocationId,
      nationality: scope.nationality,
      region: scope.region,
      traveller_id: primary?.id ?? null,
      document: stored,
      status: DOCUMENT_STATUS.UPLOADED,
      created: now,
      modified: now,
    });

    attached.push({
      id: String(row.id),
      // The client's own filename, echoed back but not stored — see above.
      name: file.originalname || (clean(row.document) ?? 'Document'),
      storedAs: stored,
      state: 'received',
    });
  }

  logger.info('Documents attached', {
    orderId,
    count: attached.length,
    filledDeclaredLines: claimed.size,
  });

  return attached;
};

// ---------------------------------------------------------------------------
// Cancelling
// ---------------------------------------------------------------------------

export interface CancellationResult {
  reference: string;
  /** True when the order's own row was changed. */
  applied: boolean;
  /** True when the request was recorded for CLS but the order still stands. */
  pending: boolean;
  message: string;
}

/**
 * The string the numeric note key is read out of.
 *
 * Not `clientReference`, deliberately. `tbl_order_notes.order_no` is an `int`
 * that both order families' notes share, and `orders.service.comments` reads a
 * `tbl_cls_order`'s notes back by the digits in that order's own `order_no`
 * column — see `paymentKey`. So a note has to be filed under the same column the
 * read uses, even where that column holds something the client is never shown. An
 * order whose `order_no` carries no digits at all has no key either way, and the
 * callers refuse rather than writing a row nothing will ever select.
 */
const noteKeySource = (resolved: ResolvedOrder): string =>
  resolved.family === 'cls'
    ? (clean(resolved.row.order_no) ?? String(resolved.row.id))
    : String(resolved.row.order_no);

/**
 * Cancels an order, as far as the schema allows.
 *
 * **Neither order table has a cancelled state.** `tbl_cls_order.status` is
 * documented as `0=pending; 1=completed; 2=cls_confirmed` and `tbl_orders.status`
 * runs to `12=completed`. There is no code for "cancelled" and adding one would
 * be inventing a value the old application does not understand — it would read
 * an unknown status and display nothing, or worse, treat it as pending.
 *
 * So this does two different things depending on the family:
 *
 * - **Legacy orders** get `s_archive = 1`. That column is the old application's
 *   soft delete and archiving is what its own admin screens do, so the effect is
 *   one CLS staff already recognise.
 * - **Newer orders** have no archive column. The request is recorded as a client
 *   note and the response says `pending: true` — CLS has been told, and the order
 *   still stands until a consultant closes it.
 *
 * Reporting the second case as `applied: true` would tell a client their order
 * was cancelled when it was not, which is the one outcome worth writing thirty
 * lines of comment to avoid.
 */
export const cancelOrder = async (
  resolved: ResolvedOrder,
  reason: string | null,
  requestedBy: number
): Promise<CancellationResult> => {
  const reference = clientReference(resolved);

  if (resolved.family === 'legacy') {
    if (resolved.row.status === LEGACY_ORDER_STATUS.COMPLETED) {
      throw conflict('That order is already complete, so it cannot be cancelled.');
    }

    await resolved.row.update({ s_archive: 1 });

    await recordNote(
      resolved.row.order_no,
      reason ?? 'Cancellation requested by the client through the portal.',
      requestedBy
    );

    logger.info('Order archived on client request', { reference, requestedBy });

    return {
      reference,
      applied: true,
      pending: false,
      message: 'Your order has been cancelled.',
    };
  }

  if (resolved.row.status === CLS_ORDER_STATUS.COMPLETED) {
    throw conflict('That order is already complete, so it cannot be cancelled.');
  }

  // Recorded as a note against the numeric key `tbl_order_notes` joins on, which
  // is read out of the row rather than off the reference above: the reference is
  // what the client is answered with, and `orders.service.comments` reads these
  // notes back by the digits in `order_no`. Deriving the key from anything else
  // would file the note where that read cannot find it.
  const numeric = Number.parseInt(
    /(\d+)$/.exec(noteKeySource(resolved))?.[1] ?? '',
    10
  );

  if (Number.isSafeInteger(numeric)) {
    await recordNote(
      numeric,
      reason
        ? `Cancellation requested by the client: ${reason}`
        : 'Cancellation requested by the client through the portal.',
      requestedBy
    );
  }

  logger.info('Cancellation requested', { reference, requestedBy, recorded: Number.isSafeInteger(numeric) });

  return {
    reference,
    applied: false,
    pending: true,
    message:
      'We have passed your cancellation request to your consultant. They will confirm it with you — work already lodged with an embassy may not be refundable.',
  };
};

/**
 * Writes a note against an order.
 *
 * `tbl_order_notes` is MyISAM, so this cannot join a transaction — which is why
 * it is a separate call after the order update rather than part of it. A failure
 * here leaves the archive applied and the note missing, which is the better half
 * of the two to lose.
 */
const recordNote = async (
  orderNo: number,
  body: string,
  authorId: number
): Promise<void> => {
  try {
    await OrderNotes.create({
      order_no: orderNo,
      note: body,
      date_added: toLegacyDateTime(),
      note_by: authorId,
      user_type: 'client',
      // Not an internal note: the client wrote it and should see it back.
      is_admin: 0,
      is_deleted: 0,
      status: 'Action required',
    });
  } catch (error) {
    logger.warn('Could not record order note', {
      orderNo,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

// ---------------------------------------------------------------------------
// Client comments
// ---------------------------------------------------------------------------

/**
 * A note the client wrote on their own order.
 *
 * ## Why this exists
 *
 * The portal could read a consultant's notes and not answer them. The order view
 * screen has a comment box, and until now it appended to React state and lost the
 * text on the next navigation — a client who typed "my travel date has moved"
 * watched it appear on screen and reach nobody.
 *
 * ## Which table, and why it changed
 *
 * `tbl_order_destination_notes` when the order has a destination row, and that is
 * the whole point of this function. CLS's admin draws its consultant thread from
 * that table — every order-view screen posts `ticketComment[<destination id>]`
 * and `ViewOrderController` files it against the destination — so a note written
 * anywhere else is a note no consultant is shown. On the document-legalisation
 * screen specifically, the `tbl_order_notes` loop is filtered
 * `is_admin == 1 and note.document_type == notes.document_type`: it renders the
 * chargeable document lines and nothing else, so a client's note in that table
 * reached **no CLS screen at all**. It was written, it was readable back in the
 * portal, and it was invisible to the people it was addressed to.
 *
 * `tbl_order_notes` remains the fallback, because an order with no destination row
 * has no destination thread to write to — the clearance, voucher and
 * document-delivery lodges write none, matching their legacy controllers. Those
 * notes are still read back (`orders.service.comments` reads both), so a client on
 * one of those services is not talking into nothing; a consultant reads them where
 * they always did.
 *
 * ## The two flags, both load-bearing
 *
 * **`is_admin` is 0.** On this table that is not "not internal" — it is the
 * client-facing thread, the box CLS's admin labels "Client comment" and emails to
 * the client on save. `is_admin: 1` is staff-only ("Admin comment"), and a client's
 * own message written there would be hidden from them and filed among CLS's
 * private notes.
 *
 * **`user_type` is `Client`, capitalised.** The admin's template gates its
 * `[Edit]`/`[Delete]` controls on `note.user_type == 'Admin'` and prints the value
 * verbatim in the byline — `- by Alex Taylor (Client)`. So this exact spelling is
 * what makes a client's message render as theirs and stay uneditable by the
 * consultant, which is the correct treatment of somebody else's words.
 *
 * `status` does not exist on this table, so there is no triage column to leave
 * unset — and on the fallback path it is left unset for the reason it always was:
 * a client cannot decide their own order is 'Action required'.
 */
export const addClientComment = async (
  resolved: ResolvedOrder,
  body: string,
  authorId: number
): Promise<{
  comment: ReturnType<typeof toCommentView | typeof toDestinationCommentView>;
}> => {
  const note = clean(body);

  if (!note) {
    throw badRequest('Write something before posting it.');
  }

  const reference = clientReference(resolved);
  const client = await UserClient.findByPk(authorId);
  // Stored alongside the id because neither note table joins to a client, and
  // the admin's own screens read this column to say who wrote a line.
  const authorName = fullName(client?.fname, client?.lname) ?? 'Client';

  /**
   * The consultant thread, when this order has one.
   *
   * The first destination, where an order has several. A visa order with two
   * destinations has two threads in the admin and the client has one
   * conversation, so a reply has to be filed somewhere definite — the first is
   * the one the admin renders first and the one a consultant writing about the
   * order as a whole uses. The read merges all of them, so nothing is lost either
   * way.
   */
  const [destinationId] = await destinationIds(resolved);

  if (destinationId !== undefined) {
    const row = await OrderDestinationNotes.create({
      destination_id: destinationId,
      note,
      date_added: toLegacyDateTime(),
      note_by: authorId,
      note_by_name: authorName,
      user_type: 'Client',
      is_admin: 0,
      is_pin: 0,
    });

    logger.info('Client comment added to the consultant thread', {
      destinationId,
      noteId: row.id,
      clientId: authorId,
    });

    return { comment: toDestinationCommentView(row, reference) };
  }

  /**
   * The fallback, and the key it is filed under.
   *
   * The client is answered with the reference the order itself is presented under
   * — `clientReference`, which the website matches this note against when it
   * draws the order's thread. The row goes in under the digits:
   * `tbl_order_notes.order_no` is an `int` and a `tbl_cls_order` reference is
   * text, so the trailing number is the only key the two families' notes can
   * share — the same rule `orders.service.comments` reads them back by. An order
   * whose reference has no digits in it cannot be commented on, and that is
   * refused rather than written somewhere it would never be found.
   */
  const numeric =
    resolved.family === 'legacy'
      ? resolved.row.order_no
      : Number.parseInt(/(\d+)$/.exec(noteKeySource(resolved))?.[1] ?? '', 10);

  if (!Number.isSafeInteger(numeric)) {
    throw badRequest(
      'We cannot attach a comment to that order. Please email your consultant instead.'
    );
  }

  const row = await OrderNotes.create({
    order_no: numeric,
    note,
    date_added: toLegacyDateTime(),
    note_by: authorId,
    note_by_name: authorName,
    user_type: 'client',
    is_admin: 0,
    is_deleted: 0,
  });

  logger.info('Client comment added', {
    orderNo: numeric,
    noteId: row.id,
    clientId: authorId,
  });

  return { comment: toCommentView(row, reference) };
};

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

/**
 * The draft fields that have somewhere to live.
 *
 * A draft is an unsubmitted `tbl_cls_order` row, so only what that table has
 * columns for can be kept. Everything else in a wizard payload is reported back
 * as dropped rather than silently discarded.
 */
const DRAFT_COLUMNS: Record<string, keyof ClsOrder> = {
  destinationCountryId: 'destination',
  departureDate: 'departure_date',
  contactFirstName: 'contact_first_name',
  contactLastName: 'contact_last_name',
  contactEmail: 'contact_email',
  contactPhone: 'contact_phone',
  department: 'department',
  applicantCount: 'no_of_traveller',
  clearanceId: 'police_clearance_id',
  voucherTypeId: 'russian_visa_voucher_id',
  courierOptionId: 'courier_service_id',
  visaType: 'visa_type',
};

export interface DraftView {
  service: string;
  reference: string | null;
  orderId: number;
  savedAt: string | null;
  fields: Record<string, unknown>;
}

export interface DraftSaveResult {
  draft: DraftView;
  /**
   * Keys the caller sent that this schema cannot store.
   *
   * Returned so the website knows which parts of its form will not survive a
   * reload, rather than finding out when a client comes back to a half-empty
   * page.
   */
  dropped: string[];
}

const orderTypeFor = (serviceSlug: string): number => {
  const orderType = SERVICE_SLUG_TO_ORDER_TYPE[serviceSlug];

  if (!orderType) {
    throw badRequest(
      `We do not have a draft for "${serviceSlug}". Expected one of: ${Object.keys(SERVICE_SLUG_TO_ORDER_TYPE).join(', ')}.`
    );
  }

  return orderType;
};

const toDraftView = (order: ClsOrder, serviceSlug: string): DraftView => {
  const row = order as unknown as Record<string, unknown>;
  const fields: Record<string, unknown> = {};

  // An explicit loop rather than `Object.fromEntries` over a mapped array: the
  // array form loses the value type on the way through and the empty-value
  // filter reads better as a guard than as a predicate on a tuple.
  for (const [key, column] of Object.entries(DRAFT_COLUMNS)) {
    const value = row[column];
    if (value === null || value === undefined || value === '') continue;
    fields[key] = value;
  }

  return {
    service: serviceSlug,
    reference: clean(order.order_no),
    orderId: order.id,
    savedAt: toIso(order.date_last_saved),
    fields,
  };
};

/** Saves or updates the draft for one service. */
export const saveDraft = async (
  clientId: number,
  serviceSlug: string,
  payload: Record<string, unknown>
): Promise<DraftSaveResult> => {
  const orderType = orderTypeFor(serviceSlug);

  const values: Record<string, unknown> = {};
  const dropped: string[] = [];

  for (const [key, value] of Object.entries(payload)) {
    const column = DRAFT_COLUMNS[key];
    if (column) {
      values[column] = value === '' ? null : value;
    } else {
      dropped.push(key);
    }
  }

  const now = toLegacyDateTime();
  const { findClsDraft } = await import('./orders.repository');
  const existing = await findClsDraft(clientId, orderType);

  const order = existing
    ? await existing.update({ ...values, date_last_saved: now })
    : await ClsOrder.create({
        ...values,
        client_id: clientId,
        order_type: orderType,
        status: CLS_ORDER_STATUS.PENDING,
        payment_status: 0,
        // Null is what marks this a draft rather than an order.
        date_submitted: null,
        date_last_saved: now,
        order_no: '',
      });

  if (dropped.length > 0) {
    logger.debug('Draft fields dropped — no column for them', {
      service: serviceSlug,
      dropped,
    });
  }

  return { draft: toDraftView(order, serviceSlug), dropped };
};

/** Reads one service's draft, or every draft when `serviceSlug` is null. */
export const readDraft = async (
  clientId: number,
  serviceSlug: string | null
): Promise<DraftView[]> => {
  const { findClsDraft, listClsDrafts } = await import('./orders.repository');

  if (serviceSlug) {
    const draft = await findClsDraft(clientId, orderTypeFor(serviceSlug));
    return draft ? [toDraftView(draft, serviceSlug)] : [];
  }

  const drafts = await listClsDrafts(clientId);

  const slugOf = (orderType: number | null): string =>
    Object.entries(SERVICE_SLUG_TO_ORDER_TYPE).find(
      ([, code]) => code === orderType
    )?.[0] ?? 'unknown';

  return drafts.map((draft) => toDraftView(draft, slugOf(draft.order_type)));
};

/**
 * Discards a draft.
 *
 * A real delete, not an archive. A draft has never been submitted, so there is
 * no record CLS needs to keep — and leaving abandoned rows in `tbl_cls_order`
 * would put them in front of staff as pending work.
 */
export const discardDraft = async (
  clientId: number,
  serviceSlug: string
): Promise<boolean> => {
  const { findClsDraft } = await import('./orders.repository');
  const draft = await findClsDraft(clientId, orderTypeFor(serviceSlug));

  if (!draft) return false;

  await draft.destroy();
  logger.info('Draft discarded', { clientId, service: serviceSlug });

  return true;
};
