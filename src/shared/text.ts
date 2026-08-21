/**
 * Cleaning up the text columns.
 *
 * Most of this schema is `latin1`, a few tables are `utf8`, and one column
 * (`tbl_myob_keys.access_token`) declares its own charset. The connection runs
 * as `utf8mb4` so MySQL transcodes on the way out, which handles the honest
 * case: a `latin1` byte sequence becomes the character it represents.
 *
 * What it cannot fix is the dishonest case. When a UTF-8 form post was written
 * into a `latin1` column, MySQL stored the individual bytes as separate
 * characters, and reading them back gives `Ã©` where `é` was meant. That is
 * mojibake, it is already in five years of client names and addresses, and
 * `repairMojibake` below undoes it on read.
 *
 * Nothing here writes to the database. Repairing a stored value would mean
 * updating rows the old application still reads, on a judgement about what the
 * name was supposed to be.
 */

/**
 * The signature of UTF-8 read as latin1.
 *
 * `Ã` / `Â` / `â` followed by a character in the range a continuation byte
 * would occupy. Checked as a pattern rather than attempting the round trip on
 * every string, because the round trip on a clean value can corrupt it.
 */
const MOJIBAKE = /[ÃÂâ][-¿–—‚-„†-•]/;

/**
 * `Ã©` → `é`, and anything already correct is returned untouched.
 *
 * The repair is a round trip: take the characters, read their code points back
 * as the bytes they originally were, and decode those bytes as UTF-8. Guarded
 * by the pattern above, and by a check that the result is actually shorter —
 * a successful repair always collapses two characters into one, so a result
 * that did not shrink means the guess was wrong and the original stands.
 */
export const repairMojibake = (value: string): string => {
  if (!MOJIBAKE.test(value)) return value;

  try {
    const bytes = Uint8Array.from(
      [...value].map((character) => character.codePointAt(0) ?? 0)
    );

    // Any code point above 0xFF was never a latin1 byte, so this string is a
    // mixture and re-decoding it would lose the parts that are already right.
    if ([...value].some((character) => (character.codePointAt(0) ?? 0) > 0xff)) {
      return value;
    }

    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);

    return decoded.length < value.length ? decoded : value;
  } catch {
    // Not valid UTF-8 underneath, so it was not mojibake after all.
    return value;
  }
};

/**
 * Every string that leaves this API goes through here.
 *
 * Trims, repairs, and turns an empty result into null. The empty-to-null step
 * matters more than it looks: these columns are full of `''` where the old
 * application meant "not supplied", and `''` renders as a blank field on screen
 * while `null` renders as the "not recorded" wording the portal was built with.
 */
export const clean = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;

  if (typeof value !== 'string') {
    if (typeof value === 'number') return String(value);
    return null;
  }

  const trimmed = repairMojibake(value).trim();
  return trimmed === '' ? null : trimmed;
};

/** `clean`, with a fallback for the places a string is required. */
export const cleanOr = (value: unknown, fallback: string): string =>
  clean(value) ?? fallback;

/**
 * Joins name parts, dropping the ones that are absent.
 *
 * The schema splits names into `fname` / `mname` / `lname` on some tables and
 * `first_name` / `middle_name` / `last_name` on others, and any of them can be
 * null or empty. Joining with a filter avoids the `John  Smith` and
 * `John Smith ` that a template string produces.
 */
export const fullName = (
  ...parts: readonly (string | null | undefined)[]
): string | null => {
  const joined = parts
    .map((part) => clean(part))
    .filter((part): part is string => part !== null)
    .join(' ');

  return joined === '' ? null : joined;
};

/**
 * `alex.taylor@example.com` → `a***@example.com`.
 *
 * For the public order tracking response, where the reference a client pastes
 * in is the only credential. Showing enough to confirm "yes, that is my order"
 * without handing a full address to anyone who guesses a reference.
 */
export const maskEmail = (value: unknown): string | null => {
  const email = clean(value);
  if (!email) return null;

  const at = email.lastIndexOf('@');
  if (at <= 0) return null;

  const local = email.slice(0, at);
  const domain = email.slice(at);

  return `${local.charAt(0)}***${domain}`;
};

/**
 * Keeps the last four characters of a passport number.
 *
 * Passport numbers are in this database in several places and must never be
 * returned in full — not to the client who owns it either, since the portal has
 * no need to display it back and a response body is a place data leaks from.
 */
export const maskPassport = (value: unknown): string | null => {
  const passport = clean(value);
  if (!passport) return null;
  if (passport.length <= 4) return '****';
  return `${'*'.repeat(passport.length - 4)}${passport.slice(-4)}`;
};

/** Lowercased and trimmed, for the email comparisons every lookup does. */
export const normaliseEmail = (value: unknown): string | null => {
  const email = clean(value);
  return email ? email.toLowerCase() : null;
};

/**
 * Strips HTML to plain text.
 *
 * The CMS tables (`tbl_content_pages.html`, `tbl_sections.content`) hold
 * operator-authored HTML. Where the API returns it as a summary rather than for
 * rendering, it is flattened here — passing raw stored HTML into a JSON field
 * that a client might inject into a page is how stored XSS happens.
 */
export const stripHtml = (value: unknown): string | null => {
  const html = clean(value);
  if (!html) return null;

  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return text === '' ? null : text;
};

/** Shortens for a summary line, breaking on a word where it can. */
export const truncate = (value: string | null, limit: number): string | null => {
  if (!value || value.length <= limit) return value;

  const cut = value.slice(0, limit);
  const lastSpace = cut.lastIndexOf(' ');

  return `${lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
};

/** A legacy `0`/`1`/null flag to a boolean. Anything non-zero counts as true. */
export const toBoolean = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return trimmed !== '' && trimmed !== '0' && trimmed !== 'false' && trimmed !== 'no';
  }
  return false;
};
