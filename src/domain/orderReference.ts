/**
 * The reference a client quotes, and the order number CLS's own admin reads.
 *
 * These are two different things and the difference is the whole file.
 *
 * ## What the legacy admin does
 *
 * `tbl_cls_order` has no reference column of its own worth the name: the legacy
 * application never writes `order_no` on that table, and every screen it built
 * keys on the auto-increment `id` instead. Its own order lists prove it — the
 * document legalisation queue prints `<b>Order No.:</b>` followed by the id, and
 * the Russian voucher queue links its View button with
 * `full[8] == "" ? full[0] : full[8]`: *the order number if there is one, and the
 * id when there is not*. The order views on the other end of those links then
 * look the order up **by id**, and `tbl_payment.order_no` — which this API
 * already writes — holds that same id.
 *
 * So `order_no` on this table is an id as far as CLS's admin is concerned. Writing
 * `'CLS-000010'` into it, as this API used to, made that voucher link resolve to
 * `WHERE id = 'CLS-000010'`, which matches nothing: their admin could not open an
 * order the website had taken money for.
 *
 * ## What the website needs
 *
 * A client cannot be asked to quote "12". The website, its emails and its portal
 * URLs all use a padded, prefixed reference, and that reference has been in
 * clients' inboxes since the first order — so it cannot be redefined either.
 *
 * The resolution is that the reference is **derived** rather than stored: the id
 * is the single fact, `orderReference` formats it for a human, and
 * `orderIdFromReference` reads it back. Nothing is lost in the round trip, and
 * `order_no` is free to hold what CLS's admin expects it to hold.
 */

const REFERENCE_PREFIX = 'CLS';

/** `12` → `CLS-000012`. Padded so references sort and read consistently. */
export const orderReference = (id: number): string =>
  `${REFERENCE_PREFIX}-${String(id).padStart(6, '0')}`;

/**
 * `CLS-000012` → `12`, or null for anything that is not one of ours.
 *
 * Deliberately strict about the prefix. A bare `'12'` is *not* read as an id
 * here, because `tbl_orders` — the other order family, which does keep real
 * reference numbers in its own `order_no` — is full of numeric references, and a
 * client quoting one of those must not be answered with whichever
 * `tbl_cls_order` row happens to carry that id. Bare numbers stay the business of
 * the column comparison in `findClsOrderIdByReference`; this reads the website's
 * own format only.
 */
export const orderIdFromReference = (reference: string): number | null => {
  const match = /^CLS-0*(\d{1,9})$/i.exec(reference.trim());

  return match ? Number(match[1]) : null;
};
