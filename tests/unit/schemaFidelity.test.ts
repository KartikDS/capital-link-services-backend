import fs from 'node:fs';
import path from 'node:path';
import type { Model, ModelStatic } from 'sequelize';
import { UNMODELLED_TABLES, generatedModels } from '../../src/models';

/**
 * Proves the model layer matches the schema dump, column for column.
 *
 * This is the test that would have caught the previous build's central problem:
 * a backend whose models named twenty-three tables the client's database had
 * never heard of. It reads `db/schema/clspubli_staging.sql` and compares it
 * against what the models actually declare — no database required, so it runs in
 * CI and on a laptop with no MySQL.
 *
 * If CLS supplies a new dump, this fails until `npm run models:generate` is run
 * again. That is the intended behaviour: the dump is the authority.
 */

const DUMP = path.resolve(__dirname, '../../db/schema/clspubli_staging.sql');

interface DumpTable {
  name: string;
  columns: Set<string>;
}

/**
 * Parses the CREATE TABLE statements independently of the generator.
 *
 * ## The duplication with `scripts/generateModels.ts` is deliberate — keep it
 *
 * That script has a `parseDump` of its own and this one does not import it. If
 * it did, a bug in the generator's parser would be invisible here: the gate
 * would compare the generator's misreading of the dump against models built from
 * that same misreading, and agree with itself. Two independent readers of one
 * fixture is the whole mechanism by which this file can fail.
 *
 * **But the dump-format assumptions must stay in sync.** Twice now a single
 * detail of the fixture has killed both parsers at once — most recently the
 * `\(\n` anchor below, against a dump that is 100% CRLF, which left both reading
 * zero tables. So: change either parser's handling of *the file's shape* — line
 * endings, the CREATE TABLE framing, how a column line is recognised — and make
 * the same change in the other. Change how either one *interprets* what it
 * parsed, and leave the other alone; that difference is the point.
 */
const parseDump = (): Map<string, DumpTable> => {
  const sql = fs.readFileSync(DUMP, 'utf8');
  const tables = new Map<string, DumpTable>();

  // `\r?\n`, not `\n`: the dump is checked in with CRLF endings, and a pattern
  // anchored on a bare newline matched nothing in it — `parseDump` returned zero
  // tables, every assertion below became a comparison against an empty map, and
  // the suite reported 183 failures that were all the same failure. A gate that
  // cannot parse its own fixture is worse than no gate, because it reads as 183
  // real problems and gets scrolled past.
  const pattern = /CREATE TABLE `([^`]+)` \(\r?\n([\s\S]*?)\r?\n\)\s*ENGINE=/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(sql)) !== null) {
    const [, name, body] = match;
    if (!name || !body) continue;

    const columns = new Set<string>();

    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      if (/^(PRIMARY KEY|UNIQUE KEY|KEY|CONSTRAINT|FOREIGN KEY)\b/i.test(trimmed)) {
        continue;
      }

      const column = /^`([^`]+)`/.exec(trimmed);
      if (column?.[1]) columns.add(column[1]);
    }

    tables.set(name, { name, columns });
  }

  return tables;
};

const dump = parseDump();

describe('the schema dump', () => {
  it('is present and parses', () => {
    // A guard on the test itself: a dump that parsed to nothing would make every
    // assertion below vacuously true.
    expect(dump.size).toBe(94);
  });
});

describe('every model matches a real table', () => {
  /**
   * Widened to `ModelStatic<Model>` so the list can be iterated.
   *
   * Sequelize types each model's statics against its own attributes, so a union
   * of eighty-nine of them shares no callable `getAttributes`. The runtime shape
   * is identical; only the compile-time narrowing is lost, and these assertions
   * do not need it.
   */
  const models = Object.entries(generatedModels) as [string, ModelStatic<Model>][];

  it('models every table except the ones deliberately skipped', () => {
    expect(models.length).toBe(dump.size - UNMODELLED_TABLES.length);
  });

  it.each(models)('%s points at a table that exists', (_name, model) => {
    const tableName = model.getTableName() as string;
    expect(dump.has(tableName)).toBe(true);
  });

  it.each(models)('%s declares only columns the table has', (_name, model) => {
    const tableName = model.getTableName() as string;
    const table = dump.get(tableName);
    expect(table).toBeDefined();

    // Every attribute maps to a real column. A typo here is a runtime
    // "Unknown column" against a live database.
    const declared = Object.values(model.getAttributes()).map(
      (attribute) => attribute.field ?? ''
    );

    const missing = declared.filter((column) => !table?.columns.has(column));
    expect(missing).toEqual([]);
  });

  it.each(models)('%s declares every column the table has', (_name, model) => {
    const tableName = model.getTableName() as string;
    const table = dump.get(tableName);

    const declared = new Set(
      Object.values(model.getAttributes()).map((attribute) => attribute.field ?? '')
    );

    // A column in the table with no attribute is data this API cannot see.
    const unmapped = [...(table?.columns ?? [])].filter(
      (column) => !declared.has(column)
    );

    expect(unmapped).toEqual([]);
  });
});

describe('the skipped tables', () => {
  it('names only tables that are really in the dump', () => {
    // A stale entry here would silently exempt nothing.
    for (const table of UNMODELLED_TABLES) {
      expect(dump.has(table)).toBe(true);
    }
  });

  it('skips only backups, test copies and debug scratchpads', () => {
    // Every skipped name carries its reason in its name. A table that did not
    // would be one somebody had quietly excluded.
    for (const table of UNMODELLED_TABLES) {
      expect(table).toMatch(/\d{1,2}-\d{1,2}-\d{4}$|issuetest|debug|development/);
    }
  });
});

describe('table naming', () => {
  const all = Object.entries(generatedModels) as [string, ModelStatic<Model>][];

  it('never lets Sequelize pluralise a table name', () => {
    // `freezeTableName` is set on every model. Without it, `tbl_payment` becomes
    // `tbl_payments` and fails against a table that does not exist.
    for (const [, model] of all) {
      const tableName = model.getTableName() as string;
      expect(tableName).toMatch(/^tbl_/);
      expect(dump.has(tableName)).toBe(true);
    }
  });

  it('has no timestamp columns Sequelize manages on its own', () => {
    // This schema has no consistent convention — `created`/`modified` on some
    // tables, `created_at` on others, nothing on the lookups. So Sequelize must
    // manage none of them, or it writes to columns that are not there.
    for (const [, model] of all) {
      const options = model.options as { timestamps?: boolean };
      expect(options.timestamps).toBe(false);
    }
  });
});

describe('the biggest tables are mapped in full', () => {
  it('maps all 145 columns of tbl_orders', () => {
    // The wide legacy order table is where a missed column is most likely and
    // least visible.
    const columnCount = dump.get('tbl_orders')?.columns.size ?? 0;

    expect(columnCount).toBe(145);
    expect(Object.keys(generatedModels.Orders.getAttributes())).toHaveLength(
      columnCount
    );
  });

  it('maps all of tbl_payment, including the card columns it must never use', () => {
    // The columns are mapped because the table has them; nothing in the codebase
    // reads or writes them. See the note in payments.routes.ts.
    const attributes = generatedModels.Payment.getAttributes();
    expect(attributes.card_number).toBeDefined();
    expect(attributes.ccv_number).toBeDefined();
  });
});
