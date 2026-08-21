import path from 'node:path';
import { ClsOrder, ClsOrderDocuments, OrderNotes } from '../../models';
import { badRequest, conflict } from '../../shared/errors';
import { toIso, toLegacyDateTime } from '../../shared/dates';
import { clean } from '../../shared/text';
import { logger } from '../../shared/logger';
import {
  CLS_ORDER_STATUS,
  DOCUMENT_STATUS,
  LEGACY_ORDER_STATUS,
  SERVICE_SLUG_TO_ORDER_TYPE,
} from '../../domain/codes';
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
 * name goes in the column and the client's own filename is *not* preserved
 * anywhere — there is nowhere to put it. The response returns both, so the
 * uploading client sees the mapping even though CLS's own screens will show the
 * stored name.
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

  const created = await Promise.all(
    files.map((file) =>
      ClsOrderDocuments.create({
        order_id: orderId,
        // Relative to UPLOAD_DIR, matching how the old application stores paths.
        document: path.relative(
          path.resolve(process.env.UPLOAD_DIR ?? './uploads'),
          file.path
        ).replace(/\\/g, '/'),
        status: DOCUMENT_STATUS.UPLOADED,
        created: now,
        modified: now,
      })
    )
  );

  logger.info('Documents attached', {
    orderId,
    count: created.length,
  });

  return created.map((row, index) => ({
    id: String(row.id),
    // The client's own filename, echoed back but not stored — see above.
    name: files[index]?.originalname ?? clean(row.document) ?? 'Document',
    storedAs: clean(row.document) ?? '',
    state: 'received',
  }));
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
  const reference =
    resolved.family === 'cls'
      ? (clean(resolved.row.order_no) ?? String(resolved.row.id))
      : String(resolved.row.order_no);

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

  // Recorded as a note against the numeric part of the reference, which is the
  // only key `tbl_order_notes` can be written with.
  const numeric = Number.parseInt(
    /(\d+)$/.exec(reference)?.[1] ?? '',
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
