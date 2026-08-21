/**
 * Reading and writing the money columns.
 *
 * The schema stores amounts three different ways, sometimes for the same figure:
 *
 * - `double` — `tbl_orders.grand_total`, `tbl_police_clearances.price`
 * - `varchar(255)` — `tbl_cls_order.total_fee`, `visa_fee`, `service_fee`
 * - `float(10,2)` — `tbl_order_notes.price`
 *
 * The `varchar` ones are the problem. Five years of a web form writing straight
 * into a string column means they hold `450`, `450.00`, `$450.00`, `1,250.00`,
 * `450.00 AUD`, `TBA`, `` and `0`. Every one of those has to become a number
 * or an honest null, and it has to happen in one place — a `parseFloat` at each
 * of forty call sites is forty chances to get `NaN` into a total.
 *
 * **Cents, everywhere above this layer.** The API's own shapes and the website's
 * checkout are in integer cents, because `0.1 + 0.2` is not `0.3` in a double
 * and an invoice total that disagrees with the sum of its lines by one cent is
 * a support call. The database keeps whatever type it already had; conversion
 * happens here, on the way in and out.
 */

/** GST rate on CLS service fees. Australian GST, 10%. */
export const GST_RATE = 0.1;

const CURRENCY_NOISE = /[$\s,]|AUD|A\$/gi;

/**
 * A legacy money column to cents, or null.
 *
 * Null means "no figure recorded", which is a real state in this schema — an
 * attestation priced by a consultant has no amount until they quote it, and the
 * frontend renders "we will confirm" for it. Returning 0 instead would put a
 * free order on screen.
 */
export const toCents = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : null;
  }

  if (typeof value !== 'string') return null;

  const cleaned = value.replace(CURRENCY_NOISE, '');
  if (cleaned === '') return null;

  // `TBA`, `on request`, `n/a` — a real value in these columns, and not a price.
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;

  // Guards against a stray `1.2e21` in a text column becoming an unsafe integer.
  if (!Number.isSafeInteger(Math.round(parsed * 100))) return null;

  return Math.round(parsed * 100);
};

/** Same as `toCents`, but an unreadable or absent value counts as zero. */
export const toCentsOrZero = (value: unknown): number => toCents(value) ?? 0;

/** Sums a set of legacy columns, ignoring the ones that hold no figure. */
export const sumCents = (values: readonly unknown[]): number =>
  values.reduce<number>((total, value) => total + toCentsOrZero(value), 0);

/**
 * Cents back to what the column expects.
 *
 * The `varchar` fee columns get `'450.00'` — two decimals, no symbol, no
 * separator — because that is the format the old application's own writes use
 * and the format its screens parse back. Anything prettier here would be a
 * value the old admin cannot read.
 */
export const centsToLegacyString = (cents: number | null): string | null => {
  if (cents === null) return null;
  return (cents / 100).toFixed(2);
};

/** Cents to the number a `double` column expects. */
export const centsToNumber = (cents: number | null): number | null => {
  if (cents === null) return null;
  return Number((cents / 100).toFixed(2));
};

/**
 * GST on a subtotal, rounded once.
 *
 * Once, on the subtotal — not per line. Rounding each line and adding them up
 * produces a total that differs from ten per cent of the subtotal by a cent or
 * two, and then the printed invoice and the card charge disagree.
 */
export const gstCents = (subtotalCents: number): number =>
  Math.round(subtotalCents * GST_RATE);

export interface MoneyBreakdown {
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
}

export const withGst = (subtotalCents: number): MoneyBreakdown => {
  const gst = gstCents(subtotalCents);
  return {
    subtotalCents,
    gstCents: gst,
    totalCents: subtotalCents + gst,
  };
};

/** `45000` → `A$450.00`, for emails and printable documents. */
export const formatAud = (cents: number | null): string | null => {
  if (cents === null) return null;
  return `A$${(cents / 100).toFixed(2)}`;
};
