/**
 * Checks this API against a real CLS database.
 *
 * Run with `npm run db:check`. It connects, compares the modelled tables against
 * what is actually there, reports a row count per table, and reads one row from
 * each of the tables the API depends on most.
 *
 * This is the first thing to run against a restored copy of `clspubli`, and it
 * answers the two questions that block everything else:
 *
 * 1. **Does the schema match?** A table this API models that the database lacks
 *    is a broken endpoint waiting to be called.
 * 2. **Which tables are actually live?** The dump is structure-only, so it cannot
 *    say whether `tbl_orders` or `tbl_cls_order` is the family CLS currently
 *    writes to. Row counts and latest timestamps answer that in one look.
 *
 * It is strictly read-only. Every statement is a `SELECT`, and the query guard
 * in `config/database.ts` would refuse anything else.
 */

import { QueryTypes } from 'sequelize';
import { env } from '../src/config/env';
import { assertDatabaseConnection, closeDatabase, sequelize } from '../src/config/database';
import { UNMODELLED_TABLES, generatedModels } from '../src/models';

const pad = (value: string | number, width: number): string =>
  String(value).padEnd(width);

const padLeft = (value: string | number, width: number): string =>
  String(value).padStart(width);

interface TableRow {
  TABLE_NAME: string;
  TABLE_ROWS: number | null;
  ENGINE: string | null;
  TABLE_COLLATION: string | null;
}

const heading = (text: string): void => {
  console.log(`\n${text}`);
  console.log('─'.repeat(text.length));
};

const main = async (): Promise<void> => {
  console.log(`Checking ${env.database.user}@${env.database.host}/${env.database.name}`);

  await assertDatabaseConnection();

  // ---------------------------------------------------------------------
  // Schema comparison
  // ---------------------------------------------------------------------

  const live = await sequelize.query<TableRow>(
    `SELECT TABLE_NAME, TABLE_ROWS, ENGINE, TABLE_COLLATION
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = :schema AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
    { type: QueryTypes.SELECT, replacements: { schema: env.database.name } }
  );

  const liveNames = new Set(live.map((row) => row.TABLE_NAME));
  const modelled = new Map(
    Object.entries(generatedModels).map(([name, model]) => [
      model.getTableName() as string,
      name,
    ])
  );
  const skipped = new Set<string>(UNMODELLED_TABLES);

  const missing = [...modelled.keys()].filter((table) => !liveNames.has(table)).sort();
  const unmodelled = [...liveNames]
    .filter((table) => !modelled.has(table) && !skipped.has(table))
    .sort();

  heading('Schema');
  console.log(`Live tables:      ${liveNames.size}`);
  console.log(`Modelled tables:  ${modelled.size}`);
  console.log(`Skipped on purpose: ${skipped.size}`);

  if (missing.length > 0) {
    console.log(`\n✗ MODELLED BUT NOT IN THE DATABASE (${missing.length}):`);
    for (const table of missing) {
      console.log(`    ${table}  →  model ${modelled.get(table) ?? '?'}`);
    }
    console.log('  Every endpoint touching these will fail. Regenerate the models');
    console.log('  from a current dump, or ask CLS which tables were renamed.');
  } else {
    console.log('\n✓ Every modelled table exists.');
  }

  if (unmodelled.length > 0) {
    console.log(`\n! IN THE DATABASE BUT NOT MODELLED (${unmodelled.length}):`);
    for (const table of unmodelled) console.log(`    ${table}`);
    console.log('  Not an error — but nothing in this API can read them.');
  }

  // ---------------------------------------------------------------------
  // Row counts, so the dead tables are obvious
  // ---------------------------------------------------------------------

  heading('Row counts (from information_schema — approximate for InnoDB)');
  console.log(
    `${pad('table', 46)}${padLeft('rows', 12)}  ${pad('engine', 8)}collation`
  );

  const populated = live.filter((row) => (row.TABLE_ROWS ?? 0) > 0);
  const empty = live.filter((row) => (row.TABLE_ROWS ?? 0) === 0);

  for (const row of populated.sort((a, b) => (b.TABLE_ROWS ?? 0) - (a.TABLE_ROWS ?? 0))) {
    console.log(
      `${pad(row.TABLE_NAME, 46)}${padLeft(row.TABLE_ROWS ?? 0, 12)}  ${pad(
        row.ENGINE ?? '?',
        8
      )}${row.TABLE_COLLATION ?? '?'}`
    );
  }

  console.log(`\n${empty.length} table(s) report zero rows:`);
  console.log(`    ${empty.map((row) => row.TABLE_NAME).join(', ')}`);
  console.log(
    '  InnoDB row counts are estimates, so treat a zero here as "probably unused"'
  );
  console.log('  rather than proof. An exact count needs COUNT(*) per table.');

  // ---------------------------------------------------------------------
  // Which order family is live — the question that blocks the write work
  // ---------------------------------------------------------------------

  heading('Which order family is current?');

  const familyProbe = async (
    table: string,
    dateColumn: string
  ): Promise<{ total: number; latest: string | null }> => {
    const [row] = await sequelize.query<{ total: number; latest: string | null }>(
      `SELECT COUNT(*) AS total, MAX(\`${dateColumn}\`) AS latest FROM \`${table}\``,
      { type: QueryTypes.SELECT }
    );

    return row ?? { total: 0, latest: null };
  };

  try {
    const [cls, legacy] = await Promise.all([
      familyProbe('tbl_cls_order', 'date_submitted'),
      familyProbe('tbl_orders', 'date_submitted'),
    ]);

    console.log(
      `tbl_cls_order   ${padLeft(cls.total, 8)} rows, newest submission ${cls.latest ?? 'none'}`
    );
    console.log(
      `tbl_orders      ${padLeft(legacy.total, 8)} rows, newest submission ${legacy.latest ?? 'none'}`
    );

    const clsNewer = (cls.latest ?? '') > (legacy.latest ?? '');
    console.log(
      `\n→ The more recently written family is ${clsNewer ? 'tbl_cls_order' : 'tbl_orders'}.`
    );
    console.log(
      '  Confirm with CLS before enabling writes — this is a reading of the data,'
    );
    console.log('  not a statement of intent from whoever maintains the old application.');
  } catch (error) {
    console.log(
      `Could not probe the order tables: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // ---------------------------------------------------------------------
  // Password format — the other question that blocks sign-in
  // ---------------------------------------------------------------------

  heading('Stored password format');

  try {
    const rows = await sequelize.query<{ len: number; sample: string | null; total: number }>(
      `SELECT LENGTH(password) AS len, COUNT(*) AS total, MIN(LEFT(password, 4)) AS sample
         FROM tbl_user_client
        WHERE password IS NOT NULL AND password <> ''
        GROUP BY LENGTH(password)
        ORDER BY total DESC`,
      { type: QueryTypes.SELECT }
    );

    if (rows.length === 0) {
      console.log('No populated password column found.');
    } else {
      for (const row of rows) {
        // Length alone identifies the algorithm: 60 is bcrypt, 32 is MD5 hex,
        // 40 is SHA-1, 64 is SHA-256. The first four characters confirm bcrypt.
        const guess =
          row.len === 60 || row.sample?.startsWith('$2')
            ? 'bcrypt'
            : row.len === 32
              ? 'MD5'
              : row.len === 40
                ? 'SHA-1'
                : row.len === 64
                  ? 'SHA-256'
                  : 'unrecognised';

        console.log(
          `  length ${padLeft(row.len, 3)} → ${pad(guess, 14)}${padLeft(row.total, 8)} account(s)`
        );
      }

      console.log('\n  Set LEGACY_PASSWORD_ALGO to whichever dominates, or leave it');
      console.log('  on `auto` if there is a mixture — auto detects per row.');
    }
  } catch (error) {
    console.log(
      `Could not inspect passwords: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // ---------------------------------------------------------------------
  // Data hazards this API has to cope with
  // ---------------------------------------------------------------------

  heading('Data hazards');

  const myisam = live.filter((row) => row.ENGINE === 'MyISAM');
  console.log(
    `MyISAM tables (no transactions): ${myisam.length}${myisam.length > 0 ? ` — ${myisam.map((r) => r.TABLE_NAME).join(', ')}` : ''}`
  );

  const collations = new Set(
    live.map((row) => row.TABLE_COLLATION ?? 'unknown')
  );
  console.log(`Distinct collations: ${[...collations].join(', ')}`);

  try {
    const [orphans] = await sequelize.query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM tbl_cls_order o
        LEFT JOIN tbl_user_client c ON c.id = o.client_id
        WHERE o.client_id IS NOT NULL AND c.id IS NULL`,
      { type: QueryTypes.SELECT }
    );

    console.log(
      `Orders pointing at a client row that is gone: ${orphans?.total ?? 0}`
    );
    console.log(
      '  Expected above zero — the schema has no foreign keys, so reads tolerate it.'
    );
  } catch {
    console.log('Could not check for orphaned orders.');
  }

  console.log('\nDone. Nothing was written.');
};

main()
  .then(() => closeDatabase())
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      `\nFailed: ${error instanceof Error ? error.message : String(error)}`
    );
    console.error(
      '\nCheck DB_HOST, DB_NAME, DB_USER and DB_PASSWORD in .env, and that the'
    );
    console.error('account has SELECT on this schema.');
    process.exit(1);
  });
