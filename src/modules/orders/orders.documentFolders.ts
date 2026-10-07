import type { Request } from 'express';
import { ClsOrderDocuments, OrderDlChecklist } from '../../models';
import { badRequest, conflict } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { clean } from '../../shared/text';
import { copyDocument, discardDocument } from '../../shared/storage/documents';
import { filedPath, isIncomingFor, orderFolder } from '../../shared/storage/documentFolders';
import type { ResolvedOrder } from './orders.service';

/**
 * Filing an order's documents under its client.
 *
 * `{clientId}/{orderId}/…` — see `shared/storage/documentFolders` for the layout and
 * for why the only exception is an order whose client does not exist yet.
 */

/**
 * The folder a new upload for this order goes into.
 *
 * Refuses an order of the older family here, before any byte is stored: the
 * document table keys on `order_id`, which `tbl_orders` does not have, so
 * `attachDocuments` would refuse the same upload — but only after the file had
 * already been written to the bucket and left there unreferenced.
 */
export const documentFolderOf = (resolved: ResolvedOrder): string => {
  if (resolved.family !== 'cls') {
    throw conflict(
      'Documents cannot be attached to an order of this age. Please email them to your consultant.'
    );
  }

  return orderFolder({ id: resolved.row.id, client_id: resolved.row.client_id });
};

/**
 * The order reference a multipart request names in its `reference` field.
 *
 * Read while the files are still arriving, which only works because the field is
 * sent **before** them — multipart fields are processed in the order they appear,
 * and both of this site's upload forms append `reference` first. A request that
 * sends it after the files is refused with a message that says so, rather than
 * storing the files somewhere that cannot be tied to an order.
 */
export const referenceFromForm = (req: Request): string => {
  const body = req.body as { reference?: unknown } | undefined;
  const reference = typeof body?.reference === 'string' ? body.reference.trim() : '';

  if (!reference) {
    throw badRequest(
      'Tell us which order these documents are for — send the order reference before the files.'
    );
  }

  return reference;
};

/**
 * Moves a guest order's waiting documents into its new client's folder.
 *
 * Called once the claim has given the order a client. A new client's scans were
 * uploaded straight after lodging, before any account existed, and wait in
 * `incoming/{orderId}/`; this files them under `{clientId}/{orderId}/`.
 *
 * ## The order of the steps is the safety
 *
 * For each file: copy it, then point the database row at the copy, and only then
 * delete the original. A failure at any step leaves the row pointing at a file that
 * exists — the worst outcome is a file that stays in `incoming/` and is still
 * served from there. Idempotent for the same reason: a file already moved no
 * longer matches `incoming/`, so a repeated claim does nothing.
 *
 * Returns how many files were moved.
 */
export const filePendingDocuments = async (
  orderId: number,
  clientId: number
): Promise<number> => {
  const [documents, checklist] = await Promise.all([
    ClsOrderDocuments.findAll({ where: { order_id: orderId } }),
    OrderDlChecklist.findAll({ where: { order_no: orderId } }),
  ]);

  const waiting: {
    path: string;
    save: (target: string) => Promise<unknown>;
  }[] = [];

  for (const row of documents) {
    const stored = clean(row.document);
    if (stored && isIncomingFor(stored, orderId)) {
      waiting.push({ path: stored, save: (target) => row.update({ document: target }) });
    }
  }

  for (const row of checklist) {
    const stored = clean(row.doc_file);
    if (stored && isIncomingFor(stored, orderId)) {
      waiting.push({ path: stored, save: (target) => row.update({ doc_file: target }) });
    }
  }

  let moved = 0;

  for (const file of waiting) {
    const target = filedPath(file.path, clientId, orderId);
    if (!target) continue;

    const copies = await copyDocument(file.path, target);

    // Nothing could be copied, so the original stays where the row says it is.
    if (copies.length === 0) {
      logger.warn('A waiting document could not be filed under its client', {
        orderId,
        clientId,
        path: file.path,
      });
      continue;
    }

    try {
      await file.save(target);
    } catch (error) {
      // The row still names the original, so the copy is the one to remove.
      await discardDocument(target);

      logger.warn('A waiting document was copied but its record could not be updated', {
        orderId,
        clientId,
        path: file.path,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    await discardDocument(file.path);
    moved += 1;
  }

  if (moved > 0) logger.info('Documents filed under their client', { orderId, clientId, moved });

  return moved;
};
