import { Op } from 'sequelize';
import { Countries } from '../models';
import { logger } from '../shared/logger';
import { slugify } from '../shared/text';

/**
 * Which `tbl_countries` row the website means when an order names a country.
 *
 * ## Why an order carries a slug at all
 *
 * The website chooses countries by slug (`'saudi-arabia'`); the order tables
 * join on `tbl_countries.id`. Somebody has to translate, and until now only the
 * website did — it read `/api/lookups/countries`, matched the slug, and posted
 * the integer.
 *
 * That works only while the list it matched against and the database the order
 * lands in are the same rows. When they are not, the translation silently
 * succeeds and means something else: an order for Saudi Arabia recorded as
 * country 2 reads back as whatever country 2 is *here*, and CLS's admin shows a
 * destination the client never chose. Nothing in the order says otherwise,
 * because by then the country is a number.
 *
 * The website's list can fall out of step for ordinary reasons — it is cached
 * for an hour and its index is memoised per server process, the API can be
 * repointed at another database, and `tbl_countries` can be edited in the old
 * admin while both are running. So an id resolved elsewhere is a hint, not an
 * answer.
 *
 * ## What this does about it
 *
 * The slug is resolved **here**, against the same connection the order is
 * written on. The country recorded is therefore the country named, whatever any
 * other copy of the list happens to say.
 *
 * A slug that matches nothing, or matches two rows, is *not* resolved to a
 * best guess — `resolveCountrySlug` reports it and the caller refuses the order.
 * A destination is the one field a visa order cannot be actioned without, and
 * putting a client's documents on a plane to the wrong embassy is worse than
 * asking them to call.
 */

/**
 * `disabled` on `tbl_countries` is nullable and most rows never set it, so "not
 * disabled" has to mean null *or* zero. The same filter `/api/lookups/countries`
 * applies — a country the website cannot offer must not resolve here either.
 */
const notDisabled = {
  [Op.or]: [{ disabled: { [Op.is]: null } }, { disabled: 0 }],
};

export type CountryMatch =
  /** Exactly one row answers to the slug. */
  | { kind: 'match'; id: number; name: string }
  /** No row does — a country CLS does not list, or one that is switched off. */
  | { kind: 'unknown' }
  /** Two or more do, so no single id can be returned for it. */
  | { kind: 'ambiguous'; ids: readonly number[] };

/**
 * Resolves one country slug.
 *
 * Matched on `country_name` first and on `country_name_display` only when the
 * first says nothing — the same order of preference the published list uses,
 * because its `slug` is derived from `country_name`. Keeping the levels separate
 * matters: a display name that happens to slug to another country's real name
 * must not be able to answer for it.
 *
 * The table is read in full rather than queried by name. The slug is a lossy
 * projection of the name — `Côte d'Ivoire`, `Korea, Republic of` and
 * `Timor-Leste` all lose characters on the way in — so there is no `WHERE` that
 * inverts it. 237 rows, on a path that runs once per order.
 */
/**
 * The country table, held for half a minute.
 *
 * An order can name several countries — a destination, an origin, a return
 * address, a nationality per applicant — and resolving each with its own
 * `findAll` would read the same 237 rows five or six times for one lodgement.
 *
 * This is emphatically **not** the kind of cache that caused the bug this module
 * exists for. That one was a website holding a snapshot of a *different*
 * database across a process lifetime. This is the API's own table, on its own
 * connection, re-read every thirty seconds — the window in which somebody would
 * have to rename a country in the old admin *and* have an order name it, to see
 * a stale answer that a retry corrects.
 */
const CACHE_MS = 30_000;

interface CountryRow {
  id: number;
  country_name: string | null;
  country_name_display: string | null;
}

/**
 * The *promise*, not the rows.
 *
 * An order resolves its countries concurrently — `Promise.all` over the
 * applicants, and the destination and origin alongside them — so caching the
 * settled value alone would cache nothing: every read starts before the first
 * one returns, and each does its own query. Holding the in-flight promise is
 * what makes six fields on one lodgement a single scan.
 */
let cache: { rows: Promise<CountryRow[]>; at: number } | null = null;

/** Test seam, and the way to force a re-read after editing `tbl_countries`. */
export const resetCountryCache = (): void => {
  cache = null;
};

const countryRows = (): Promise<CountryRow[]> => {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.rows;

  const rows = Countries.findAll({
    where: notDisabled,
    attributes: ['id', 'country_name', 'country_name_display'],
  }).catch((error: unknown) => {
    // A failed read must not be held for thirty seconds — the next order should
    // try the database again rather than inherit the outage.
    cache = null;
    throw error;
  });

  cache = { rows, at: Date.now() };
  return rows;
};

export const resolveCountrySlug = async (
  slug: string
): Promise<CountryMatch> => {
  const wanted = slugify(slug);
  if (!wanted) return { kind: 'unknown' };

  const rows = await countryRows();

  for (const column of ['country_name', 'country_name_display'] as const) {
    const matches = rows.filter((row) => slugify(row[column]) === wanted);

    const [row] = matches;

    if (matches.length === 1 && row) {
      return {
        kind: 'match',
        id: row.id,
        name: row.country_name ?? row.country_name_display ?? String(row.id),
      };
    }

    if (matches.length > 1) {
      return { kind: 'ambiguous', ids: matches.map((row) => row.id) };
    }
  }

  return { kind: 'unknown' };
};

/**
 * The country id an order should be recorded against, given what it named.
 *
 * Takes both of what the website can send — the slug the client picked and the
 * id the website resolved for it — and answers with the row *this* database
 * agrees with.
 *
 * - **The slug resolves.** Its id wins, always. It is derived from the country
 *   the client actually chose, read from the database the order is stored in, so
 *   it is the only one of the two answers that cannot be a translation of some
 *   other copy of the list. Where the caller's id disagrees, the disagreement is
 *   logged — that log line is the standing alarm that the website's country list
 *   and this database have drifted apart — but the order still goes through, on
 *   the right country.
 * - **The slug resolves to nothing, or to two rows.** There is no trustworthy
 *   answer to substitute, so the caller's id stands and the reason is logged.
 *   Refusing here would turn a data problem CLS can fix at leisure into orders
 *   the website cannot take at all, and the id is no worse than what would have
 *   been recorded before any of this existed.
 * - **No slug sent.** The id is taken as given. Journeys not yet moved over, and
 *   anything posting to the API directly, are unaffected.
 *
 * An earlier version of this refused the order outright on a disagreement. That
 * was wrong, and worth saying why: refusal is only the safer choice while the
 * right answer is unknown. Here it is known — it is `match.id` — so refusing
 * would have cost the client an order to protect them from a country nobody was
 * going to record.
 */
export const destinationCountryId = async (input: {
  slug?: string | null;
  id?: number | null;
  /** Named in the log line, so a drift can be traced to a journey. */
  journey: string;
}): Promise<number | null> => {
  const slug = input.slug?.trim();

  if (!slug) return input.id ?? null;

  const match = await resolveCountrySlug(slug);

  if (match.kind === 'ambiguous') {
    logger.error(
      `${input.journey}: "${slug}" matches ${match.ids.length} tbl_countries rows (${match.ids.join(', ')}), so the slug cannot decide the destination. Recording the id the caller sent instead. Fix the duplicate country names — see scripts/checkCountrySlugs.ts.`
    );

    return input.id ?? null;
  }

  if (match.kind === 'unknown') {
    logger.error(
      `${input.journey}: no tbl_countries row matches "${slug}", so the slug cannot decide the destination. Recording the id the caller sent instead. Either the website offers a country this database does not have, or the row is disabled.`
    );

    return input.id ?? null;
  }

  if (input.id != null && input.id !== match.id) {
    logger.error(
      `${input.journey}: the caller resolved "${slug}" to country ${input.id}; this database has it as ${match.id} (${match.name}). Recording ${match.id}. The website's country list is out of step with this database — that is what files an order for one country under another.`
    );
  }

  return match.id;
};
