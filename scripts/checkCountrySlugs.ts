import fs from 'node:fs';
import path from 'node:path';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../src/config/database';

/**
 * Does every country the website can offer resolve to exactly one CLS row?
 *
 * Read-only. Run it against whichever database the API is pointed at:
 *
 * ```bash
 * npm run db:countries
 * ```
 *
 * ## Why this exists
 *
 * Every country field on every journey — the destination, the applicant's
 * nationality, a document's country of origin, the return address and the Russian
 * voucher's employer address — is chosen on the website as a **slug** and stored
 * as `tbl_countries.id`. One function does that translation
 * (`resolveCountryId` in the website's `lib/orderApi`), and it matches on the slug
 * the API derives from `country_name`, falling back to the slugified display name.
 *
 * That join is only as good as the data. Two rows whose names reduce to the same
 * slug are indistinguishable to it, and the old index silently let the last one
 * win — so an order could record a country the client never picked, with nothing
 * in the logs to find it by. The website now refuses an ambiguous slug and lodges
 * the field blank instead, which is safe but still means a field CLS wanted is
 * empty.
 *
 * So the fix is in the data, and this script is what finds the rows to fix.
 *
 * ## What it reports
 *
 * 1. **Collisions** — slugs claimed by more than one row. These are the ones that
 *    now resolve to nothing. Fix by making `country_name` distinct, or by
 *    disabling the row that should not be offered.
 * 2. **Rows that reduce to an empty slug** — a name with no letters or digits in
 *    it at all, which can never be matched.
 * 3. **Disabled rows** — excluded from `/api/lookups/countries` by default, so a
 *    client choosing one gets a blank field. Listed because "the country is in
 *    the table" and "the API offers it" are different things.
 * 4. **Coverage of the website's own list** — all 237 countries a client can
 *    actually pick, read from `data/order/nationalities.ts` in the sibling
 *    checkout, split into those that resolve to one row, those that are ambiguous
 *    and those CLS has no row for. The last two both store a blank country.
 */

/** The API's rule, character for character. Keep the two in step. */
const slugify = (value: string | null): string | null => {
  const text = (value ?? '').trim();
  if (!text) return null;

  return (
    text
      .toLowerCase()
      .normalize('NFD')
      // Combining diacritical marks, so 'Côte d'Ivoire' slugs like the API does.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || null
  );
};

interface CountryRow {
  id: number;
  country_name: string | null;
  country_name_display: string | null;
  disabled: number | null;
}

/** Countries the journeys name often enough to be worth checking even alone. */
const SPOT_CHECK = [
  'australia',
  'canada',
  'saudi-arabia',
  'united-arab-emirates',
  'qatar',
  'india',
  'china',
  'russia',
  'united-states-of-america',
  'united-kingdom',
  'afghanistan',
];

/**
 * Every country the website can actually offer, read from its own list.
 *
 * `data/order/nationalities.ts` is the single list behind every Destination and
 * Origin select, and behind the police clearance and voucher forms — so it is the
 * complete set of slugs that can ever reach `resolveCountryId`. Checking against
 * it is the difference between "these eleven work" and "every country a client
 * can pick works".
 *
 * Read from the sibling checkout rather than copied here, because a copy would
 * drift and then quietly report on a list nobody uses. When the website is not
 * beside this repo the script falls back to `SPOT_CHECK` and says so.
 */
const websiteCountryIds = (): { ids: string[]; source: string } => {
  const candidates = [
    path.resolve(process.cwd(), '../CapitallinkservicesFrontend/src/data/order/nationalities.ts'),
    path.resolve(process.cwd(), '../frontend/src/data/order/nationalities.ts'),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;

    const source = fs.readFileSync(file, 'utf8');
    const start = source.indexOf('const NATIONALITY_NAMES = [');
    if (start === -1) continue;

    const block = source.slice(start, source.indexOf('] as const;', start));
    const names = [...block.matchAll(/'([^']*)'/g)].map((match) => match[1] ?? '');

    // The website's own id rule, which is `toId` in that same file.
    const ids = names
      .map((name) =>
        name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      )
      .filter(Boolean);

    if (ids.length > 0) return { ids, source: file };
  }

  return { ids: SPOT_CHECK, source: 'built-in spot check (website list not found)' };
};

const main = async (): Promise<void> => {
  const rows = await sequelize.query<CountryRow>(
    `SELECT id, country_name, country_name_display, disabled
       FROM tbl_countries ORDER BY id`,
    { type: QueryTypes.SELECT }
  );

  const live = rows.filter((row) => !row.disabled);

  console.log(`tbl_countries: ${rows.length} rows, ${live.length} offered by the API\n`);

  // --- 1. Collisions on the slug the matcher actually keys on -----------------
  const bySlug = new Map<string, CountryRow[]>();
  const unslugged: CountryRow[] = [];

  for (const row of live) {
    const slug = slugify(row.country_name) ?? slugify(row.country_name_display);

    if (!slug) {
      unslugged.push(row);
      continue;
    }

    bySlug.set(slug, [...(bySlug.get(slug) ?? []), row]);
  }

  const collisions = [...bySlug.entries()].filter(([, group]) => group.length > 1);

  if (collisions.length === 0) {
    console.log('No slug collisions. Every offered country resolves to one row.\n');
  } else {
    console.log(`${collisions.length} slug collision(s) — these now resolve to NOTHING:\n`);
    for (const [slug, group] of collisions) {
      console.log(`  "${slug}"`);
      for (const row of group) {
        console.log(
          `      id ${row.id}  country_name=${JSON.stringify(row.country_name)}` +
            `  display=${JSON.stringify(row.country_name_display)}`
        );
      }
    }
    console.log();
  }

  // --- 2. Names that cannot produce a slug at all -----------------------------
  if (unslugged.length > 0) {
    console.log(`${unslugged.length} row(s) with no usable slug — never matchable:`);
    for (const row of unslugged) {
      console.log(`  id ${row.id}  ${JSON.stringify(row.country_name)}`);
    }
    console.log();
  }

  // --- 3. Disabled rows -------------------------------------------------------
  const disabled = rows.filter((row) => row.disabled);
  if (disabled.length > 0) {
    console.log(
      `${disabled.length} disabled row(s) — not offered by /api/lookups/countries, ` +
        'so an order naming one records a blank country:'
    );
    for (const row of disabled.slice(0, 20)) {
      console.log(`  id ${row.id}  ${JSON.stringify(row.country_name)}`);
    }
    if (disabled.length > 20) console.log(`  … and ${disabled.length - 20} more`);
    console.log();
  }

  // --- 4. Every country the website can offer ---------------------------------
  const { ids, source } = websiteCountryIds();
  console.log(`Checking ${ids.length} website country ids against tbl_countries`);
  console.log(`  source: ${source}\n`);

  const missing: string[] = [];
  const ambiguous: string[] = [];

  for (const slug of ids) {
    const group = bySlug.get(slug) ?? [];
    if (group.length === 1) continue;
    (group.length === 0 ? missing : ambiguous).push(slug);
  }

  console.log(
    `  resolve to exactly one row : ${ids.length - missing.length - ambiguous.length}`
  );
  console.log(`  ambiguous (stored blank)   : ${ambiguous.length}`);
  console.log(`  no CLS row (stored blank)  : ${missing.length}\n`);

  if (ambiguous.length > 0) {
    console.log('Ambiguous — a client picking these records NO country:');
    for (const slug of ambiguous) {
      const group = bySlug.get(slug) ?? [];
      console.log(`  ${slug.padEnd(30)} ids ${group.map((row) => row.id).join(', ')}`);
    }
    console.log();
  }

  if (missing.length > 0) {
    console.log('Offered by the website, absent from tbl_countries — records NO country:');
    for (const slug of missing) console.log(`  ${slug}`);
    console.log();
  }

  await sequelize.close();
};

main().catch((error: unknown) => {
  console.error(
    'Country check failed:',
    error instanceof Error ? error.message : String(error)
  );
  process.exit(1);
});
