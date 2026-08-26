import fs from 'node:fs';
import path from 'node:path';
import {
  CLS_LIST_ATTRIBUTES,
  LEGACY_LIST_ATTRIBUTES,
} from '../../src/modules/orders/orders.repository';
import {
  toOrderView,
  toLegacyOrderView,
} from '../../src/modules/orders/orders.presenter';

/**
 * Pins the list queries' column projections to what the presenters read.
 *
 * The order lists select a named subset of columns rather than every column,
 * because `tbl_orders` is 145 wide and a list row is built from fourteen of
 * them — reading a walk-in account's four hundred orders in full was timing out
 * on rows nobody rendered.
 *
 * The danger in that is quiet. Sequelize does not throw when a presenter reads a
 * column the query did not select; the property is simply `undefined`, so the
 * field renders blank and the order looks like it has no departure date, or no
 * applicant, for every row on the screen. Nothing in the type system catches it
 * either, because the model class declares every column regardless of what was
 * selected.
 *
 * So each presenter is driven against a proxy that records every property it
 * touches, and the recorded set has to be covered by the attribute list. Add a
 * field to a presenter without adding its column here and this fails, naming the
 * column — which is the whole point.
 */

/** Association names the presenters read through rather than plain columns. */
const CLS_ASSOCIATIONS = [
  'travellers',
  'documents',
  'destinations',
  'notes',
  'destinationCountry',
  'policeClearanceDetails',
  'voucherDetails',
  'legalisationDetails',
];

const LEGACY_ASSOCIATIONS = ['travellers', 'destinations', 'notes', 'destinationCountry'];

/**
 * A stand-in order that remembers what was asked of it.
 *
 * Associations answer with an empty list (or null for the `belongsTo`) so the
 * presenter walks its whole body instead of stopping at the first `.map`.
 */
const recordingOrder = (associations: readonly string[], seen: Set<string>): unknown =>
  new Proxy(
    {},
    {
      get(_target, property: string | symbol) {
        if (typeof property !== 'string') return undefined;
        seen.add(property);
        if (!associations.includes(property)) return null;
        return property === 'destinationCountry' ? null : [];
      },
    }
  );

const columnsReadBy = (
  present: (order: never) => unknown,
  associations: readonly string[]
): string[] => {
  const seen = new Set<string>();
  present(recordingOrder(associations, seen) as never);
  return [...seen].filter((name) => !associations.includes(name));
};

describe('the order list column projections', () => {
  it('selects every column the CLS list presenter reads', () => {
    const read = columnsReadBy(
      (order) =>
        toOrderView(order, { name: 'Marla Europeo', email: 'marla@example.com' }),
      CLS_ASSOCIATIONS
    );

    const missing = read.filter(
      (column) => !(CLS_LIST_ATTRIBUTES as readonly string[]).includes(column)
    );

    expect(missing).toEqual([]);
    // A guard against the list being emptied or the probe silently reading
    // nothing, which would make the assertion above vacuously true.
    expect(read.length).toBeGreaterThan(5);
  });

  it('selects every column the legacy list presenter reads', () => {
    const read = columnsReadBy(
      (order) =>
        toLegacyOrderView(order, { name: 'Marian Rizk', email: 'marian@example.com' }),
      LEGACY_ASSOCIATIONS
    );

    const missing = read.filter(
      (column) => !(LEGACY_LIST_ATTRIBUTES as readonly string[]).includes(column)
    );

    expect(missing).toEqual([]);
    expect(read.length).toBeGreaterThan(5);
  });

  it('carries the consultant column, which the service reads rather than the presenter', () => {
    // `listForClient` batches the consultant lookup off this column, so it is
    // needed by the page even though neither presenter touches it.
    expect(CLS_LIST_ATTRIBUTES).toContain('visa_cls_team_member');
    expect(LEGACY_LIST_ATTRIBUTES).toContain('visa_cls_team_member');
  });

  it('carries the primary key, which the count and the separate includes join on', () => {
    expect(CLS_LIST_ATTRIBUTES).toContain('id');
    /**
     * `tbl_orders` has no `id`. Its primary key is `order_no`, an
     * auto_increment int, and that is also the column the `destinations`
     * include joins on.
     *
     * Asserted as an absence because selecting a column that does not exist
     * does not degrade the way a missing-but-real column does: MySQL rejects
     * the entire query with "Unknown column 'Orders.id' in 'field list'", so
     * every order on the screen disappears rather than one field going blank.
     * That is how it was caught — the projection tests above all passed, and it
     * took running a real query to find.
     */
    expect(LEGACY_LIST_ATTRIBUTES).toContain('order_no');
    expect(LEGACY_LIST_ATTRIBUTES).not.toContain('id');
  });

  it('stays far narrower than the tables themselves', () => {
    // The point of the exercise: 145 columns down to sixteen, 37 down to eleven.
    expect(LEGACY_LIST_ATTRIBUTES.length).toBeLessThan(25);
    expect(CLS_LIST_ATTRIBUTES.length).toBeLessThan(15);
  });
});

/**
 * The columns a table really has, read from the dump.
 *
 * This is the check that matters most, and the one that was missing when a
 * plausible-looking `'id'` went into the legacy list. Every assertion above
 * compares the projection against the *presenters*, and all of them passed:
 * the presenters never read `id` either, the model class declares it, and
 * TypeScript accepted it. Nothing failed until a real query reached MySQL and
 * was rejected outright with "Unknown column 'Orders.id' in 'field list'".
 *
 * A column that does not exist is not a degraded field, it is a dead query --
 * the whole list comes back empty rather than one value going blank. So the
 * projection is checked against the schema itself, `db/schema/clspubli_staging.sql`
 * being the authority for it: the same fixture `schemaFidelity` reads, parsed the
 * same way, CRLF anchors included.
 */
const dumpColumns = (table: string): Set<string> => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../../db/schema/clspubli_staging.sql'),
    'utf8'
  );

  const body = new RegExp(
    'CREATE TABLE `' + table + '` \\(\\r?\\n([\\s\\S]*?)\\r?\\n\\)\\s*ENGINE='
  ).exec(sql)?.[1];
  if (!body) throw new Error(`no CREATE TABLE for ${table} in the dump`);

  const columns = new Set<string>();

  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (/^(PRIMARY KEY|UNIQUE KEY|KEY|CONSTRAINT|FOREIGN KEY)\\\b/i.test(trimmed))
      continue;
    const column = /^`([^`]+)`/.exec(trimmed)?.[1];
    if (column) columns.add(column);
  }

  return columns;
};

describe('the projections name columns that exist', () => {
  it('every CLS attribute is a real column of tbl_cls_order', () => {
    const real = dumpColumns('tbl_cls_order');
    expect(real.size).toBeGreaterThan(10);
    expect(CLS_LIST_ATTRIBUTES.filter((column) => !real.has(column))).toEqual([]);
  });

  it('every legacy attribute is a real column of tbl_orders', () => {
    const real = dumpColumns('tbl_orders');
    expect(real.size).toBeGreaterThan(100);
    expect(LEGACY_LIST_ATTRIBUTES.filter((column) => !real.has(column))).toEqual([]);
    // The specific mistake this guards: tbl_orders is keyed on order_no.
    expect(real.has('id')).toBe(false);
  });
});
