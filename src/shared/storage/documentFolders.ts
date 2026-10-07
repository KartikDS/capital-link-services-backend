/**
 * Which folder a document is filed in.
 *
 * Every document belongs to a client, and inside the client to an order:
 *
 * ```
 * {clientId}/{orderId}/{timestamp}-{nonce}-{name}.pdf
 * ```
 *
 * One folder per order, whoever put the file there — the client at checkout, the
 * client later from the portal, or CLS staff. Who uploaded it and when is the
 * database's business, not the path's, so the same order never has its files
 * scattered over several sub-folders.
 *
 * ## The one exception: an order with no client yet
 *
 * A guest's scans are uploaded straight after the order is lodged, and a brand-new
 * client has no account until the payment is confirmed (`orders.claim`). Until
 * then the order has no client id to file under, so its documents wait in
 * `incoming/{orderId}/` and `orders.documentFolders` moves them into the client's
 * folder the moment the account exists.
 *
 * ## Why none of this is derived at read time
 *
 * The full path is stored in `tbl_cls_order_documents.document`, and reads use
 * that. These helpers only decide where a *new* file goes, so renaming a folder
 * convention later, or merging two clients, never strands an old file.
 */

/** Where an unclaimed guest order's documents wait for an account. */
export const INCOMING_DIR = 'incoming';

/** Folder names for files that belong to a client but to no order. */
export type ClientFolderKind = 'profile' | 'unattached';

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/**
 * The folder for an order's documents.
 *
 * A client id of null — or the zero some legacy rows hold — means there is no
 * client yet, so the order's documents wait in `incoming/`.
 */
export const orderFolder = (order: {
  id: number;
  client_id: number | null;
}): string => {
  if (!isId(order.id)) {
    throw new Error(`Cannot file documents under order id ${String(order.id)}.`);
  }

  return isId(order.client_id)
    ? `${order.client_id}/${order.id}`
    : `${INCOMING_DIR}/${order.id}`;
};

/**
 * The folder for a client's files that belong to no order: the passport photo on
 * their account (`profile`), or documents dropped in before they chose an order
 * (`unattached`).
 */
export const clientFolder = (clientId: number | string, kind: ClientFolderKind): string => {
  const id = Number(clientId);

  if (!isId(id)) {
    throw new Error(`Cannot file documents under client id ${String(clientId)}.`);
  }

  return `${id}/${kind}`;
};

/** Whether a stored path is one of this order's waiting-for-an-account files. */
export const isIncomingFor = (storedPath: string, orderId: number): boolean =>
  storedPath.replace(/\\/g, '/').startsWith(`${INCOMING_DIR}/${orderId}/`);

/**
 * Where a waiting file goes once its order has a client, or null if the path is
 * not one of that order's waiting files.
 *
 * Only the folder changes. The file name — and so its timestamp, nonce and slug —
 * is carried over untouched, which is what keeps the move from ever colliding.
 */
export const filedPath = (
  storedPath: string,
  clientId: number,
  orderId: number
): string | null => {
  if (!isId(clientId) || !isIncomingFor(storedPath, orderId)) return null;

  const normalised = storedPath.replace(/\\/g, '/');
  const name = normalised.slice(`${INCOMING_DIR}/${orderId}/`.length);

  return name ? `${clientId}/${orderId}/${name}` : null;
};
