/**
 * Reading and writing the legacy date columns.
 *
 * Every date in this database is a wall-clock string with no zone attached.
 * `tbl_cls_order.date_submitted` holds `2026-08-20 10:17:00`, and what that
 * means is "ten past ten in Sydney" — the old application ran there and wrote
 * local time. Nothing in the column says so.
 *
 * So the connection runs with `dateStrings: true` and the driver hands these
 * over untouched, and this file is the only place that decides what they mean.
 * The alternative — letting `mysql2` build `Date` objects — applies the
 * connection's offset to a value that already had one implied, and every
 * timestamp in the portal lands ten or eleven hours out. Which of the two it is
 * depends on daylight saving, so the bug would come and go twice a year.
 *
 * Three column shapes need handling, and the third is the reason this is not
 * a one-liner:
 *
 * - `datetime` → `2026-08-20 10:17:00`
 * - `date` → `2026-08-20`
 * - `char(10)` / `char(20)` → whatever an operator typed. `tbl_orders` stores
 *   `date_doc_sent` as `char(10)` and `dl_date_doc_returned` as `char(20)`, so
 *   these hold `20/08/2026`, `2026-08-20`, `n/a`, and empty strings. They are
 *   parsed leniently and return null when they cannot be read, because a null
 *   renders as "not recorded" and a guess renders as a date CLS never wrote.
 */

/** The zone every legacy timestamp is in, whatever the server is set to. */
export const CLS_TIMEZONE = 'Australia/Sydney';

const ISO_LIKE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const DAY_FIRST = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/;

/** MySQL writes this for "no date" in a NOT NULL datetime column. */
const ZERO_DATES = new Set([
  '0000-00-00',
  '0000-00-00 00:00:00',
  '1970-01-01 00:00:00',
]);

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CLS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/**
 * The zone's offset, in minutes, at a given instant.
 *
 * Computed by formatting the instant in Sydney and comparing the result with
 * the same instant in UTC. That is more code than hard-coding `+10:00`, and it
 * is the difference between a timestamp being right all year and being an hour
 * out from October to April.
 */
const offsetMinutesAt = (instant: Date): number => {
  const parts = partsFormatter.formatToParts(instant);
  const lookup: Record<string, number> = {};

  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = Number(part.value);
  }

  const asUtc = Date.UTC(
    lookup.year ?? 1970,
    (lookup.month ?? 1) - 1,
    lookup.day ?? 1,
    lookup.hour === 24 ? 0 : (lookup.hour ?? 0),
    lookup.minute ?? 0,
    lookup.second ?? 0
  );

  return (asUtc - instant.getTime()) / 60_000;
};

/**
 * A Sydney wall-clock reading to the instant it names.
 *
 * Two passes: guess that the wall time is UTC, find the offset that applied at
 * that guess, then correct. A second pass catches the hour either side of a
 * daylight-saving change, where the first guess lands on the wrong side of the
 * transition and picks up the wrong offset.
 */
const wallClockToInstant = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date => {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);

  let instant = new Date(naive - offsetMinutesAt(new Date(naive)) * 60_000);
  instant = new Date(naive - offsetMinutesAt(instant) * 60_000);

  return instant;
};

const isBlank = (value: unknown): boolean =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '');

/**
 * A legacy column to an ISO-8601 instant, or null.
 *
 * Null for blank, for MySQL's zero date, and for anything unparseable. The
 * frontend treats null as "not recorded yet" and renders wording for it, so an
 * unreadable value becomes an honest gap rather than 1 January 1970.
 */
export const toIso = (value: unknown): string | null => {
  if (isBlank(value)) return null;

  // A `Date` arrives only if a column slipped past `dateStrings`, or from code
  // that built one itself.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  if (typeof value === 'number') {
    const fromEpoch = new Date(value);
    return Number.isNaN(fromEpoch.getTime()) ? null : fromEpoch.toISOString();
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (ZERO_DATES.has(trimmed)) return null;

  const iso = ISO_LIKE.exec(trimmed);
  if (iso) {
    const [, year, month, day, hour, minute, second] = iso;
    return wallClockToInstant(
      Number(year),
      Number(month),
      Number(day),
      Number(hour ?? 0),
      Number(minute ?? 0),
      Number(second ?? 0)
    ).toISOString();
  }

  // `20/08/2026`. Day-first, because these were typed by Australian staff.
  const dayFirst = DAY_FIRST.exec(trimmed);
  if (dayFirst) {
    const [, day, month, year] = dayFirst;
    const monthNumber = Number(month);
    const dayNumber = Number(day);

    // Rejected rather than swapped: `03/04/2026` is ambiguous and guessing
    // would silently move an order's departure by a month.
    if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
      return null;
    }

    return wallClockToInstant(Number(year), monthNumber, dayNumber, 0, 0, 0).toISOString();
  }

  return null;
};

/**
 * A legacy column to a plain `YYYY-MM-DD`, or null.
 *
 * For `date` columns, where the time of day was never recorded and inventing
 * midnight-in-a-zone only creates a value that can shift across a boundary.
 * A departure date is a calendar day, and this keeps it one.
 */
export const toDateOnly = (value: unknown): string | null => {
  if (isBlank(value)) return null;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (ZERO_DATES.has(trimmed)) return null;

    const iso = ISO_LIKE.exec(trimmed);
    if (iso) {
      const [, year, month, day] = iso;
      return `${year}-${month}-${day}`;
    }

    const dayFirst = DAY_FIRST.exec(trimmed);
    if (dayFirst) {
      const [, day, month, year] = dayFirst;
      const monthNumber = Number(month);
      const dayNumber = Number(day);
      if (monthNumber < 1 || monthNumber > 12 || dayNumber < 1 || dayNumber > 31) {
        return null;
      }
      return `${year}-${String(monthNumber).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
    }

    return null;
  }

  const asIso = toIso(value);
  return asIso ? (asIso.slice(0, 10) ?? null) : null;
};

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * An instant to the string these columns expect: `YYYY-MM-DD HH:MM:SS`, Sydney.
 *
 * Used for every write, so a row this API inserts is indistinguishable from one
 * the old application inserted. Writing UTC instead would be correct in
 * isolation and wrong in the table, where every neighbouring row is local — and
 * the old admin screens would show new orders ten hours in the past.
 */
export const toLegacyDateTime = (instant: Date = new Date()): string => {
  const parts = partsFormatter.formatToParts(instant);
  const lookup: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== 'literal') lookup[part.type] = part.value;
  }

  const hour = lookup.hour === '24' ? '00' : (lookup.hour ?? '00');

  return `${lookup.year}-${lookup.month}-${lookup.day} ${hour}:${lookup.minute}:${lookup.second}`;
};

/** An instant to `YYYY-MM-DD` in Sydney, for the `date` columns. */
export const toLegacyDate = (instant: Date = new Date()): string =>
  toLegacyDateTime(instant).slice(0, 10);

/** `2026-08-20` → the legacy `date` string, passing null through. */
export const dateOnlyForWrite = (value: string | null | undefined): string | null => {
  const normalised = toDateOnly(value);
  return normalised;
};

/**
 * Whole days from `iso` until now, or null.
 *
 * Used for the invoice `overdue` state and the "waiting on you" counts, both of
 * which are computed on read rather than written by a nightly job — a job that
 * can fail silently leaves an invoice looking current for a week.
 */
export const daysSince = (iso: string | null, now = Date.now()): number | null => {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  return Math.floor((now - then) / 86_400_000);
};

export const isPast = (iso: string | null, now = Date.now()): boolean => {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  return !Number.isNaN(then) && then < now;
};

/** Adds days to an instant, for due dates and token expiry. */
export const addDays = (days: number, from: Date = new Date()): Date =>
  new Date(from.getTime() + days * 86_400_000);

export { pad as padTwo };
