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

/** Parses the CREATE TABLE statements independently of the generator. */
const parseDump = (): Map<string, DumpTable> => {
  const sql = fs.readFileSync(DUMP, 'utf8');
  const tables = new Map<string, DumpTable>();

  const pattern = /CREATE TABLE `([^`]+)` \(\n([\s\S]*?)\n\)\s*ENGINE=/g;
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
