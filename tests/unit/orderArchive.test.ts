/**
 * Archiving an order: the SQL that hides it, and the search over the list of them.
 *
 * The models are mocked away; what is under test is the text of the conditions, the
 * way `queueSearch.test` reads its own.
 */

jest.mock('../../src/models', () => ({ ClsOrder: {}, UserAdmin: {} }));
jest.mock('../../src/config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../src/config/database';
import {
  archiveAvailable,
  archivedSearchSql,
  hideArchivedSql,
  notArchivedOrNullSql,
  notArchivedSql,
  resetArchiveProbe,
} from '../../src/modules/admin/orderArchive';

const query = sequelize.query as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  resetArchiveProbe();
});

describe('the hiding condition', () => {
  it('leaves out every order flagged archived, and only those', () => {
    const sql = notArchivedSql('ClsOrder.id');

    expect(sql).toContain(
      'ClsOrder.id NOT IN (SELECT a.order_id FROM tbl_ops_order_archive a'
    );
    expect(sql).toContain('a.is_archived = 1');
  });

  it('keeps a row with no order number, which NOT IN would otherwise drop', () => {
    expect(notArchivedOrNullSql('order_no')).toMatch(
      /^\(order_no IS NULL OR order_no NOT IN /
    );
  });
});

describe('whether the table is there', () => {
  it('says so once it is, and stops asking', async () => {
    query.mockResolvedValue([{ n: 1 }]);

    await expect(archiveAvailable()).resolves.toBe(true);
    await expect(archiveAvailable()).resolves.toBe(true);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('hides nothing, and breaks nothing, until the table exists', async () => {
    query.mockResolvedValue([{ n: 0 }]);

    await expect(archiveAvailable()).resolves.toBe(false);
    await expect(hideArchivedSql('ClsOrder.id')).resolves.toBeNull();
  });

  it('treats a failed probe as "not there" rather than failing the list', async () => {
    query.mockRejectedValue(new Error('connection lost'));

    await expect(hideArchivedSql('ClsOrder.id')).resolves.toBeNull();
  });

  it('gives the condition once the table is there', async () => {
    query.mockResolvedValue([{ n: 1 }]);

    await expect(hideArchivedSql('o.id')).resolves.toContain('o.id NOT IN');
    await expect(hideArchivedSql('order_no', true)).resolves.toContain(
      'order_no IS NULL OR'
    );
  });
});

describe('archivedSearchSql', () => {
  it('is no condition for an empty search', () => {
    expect(archivedSearchSql('  ')).toEqual({ sql: '', replacements: {} });
  });

  it('wants every word to match something the list shows', () => {
    const { sql, replacements } = archivedSearchSql('isaac pepe');

    expect(Object.keys(replacements)).toEqual(['w0', 'w1']);
    // One group per word, each opened with AND.
    expect(sql.startsWith(' AND (')).toBe(true);
    expect(sql).toContain('LIKE :w0');
    expect(sql).toContain('LIKE :w1');
    [
      'a.order_id',
      'contact_first_name',
      'contact_email',
      'country_name',
      'archive_note',
      'archived_by_name',
      'is_primary = 1',
    ].forEach((fragment) => expect(sql).toContain(fragment));
  });

  it('passes the words as values, never as SQL', () => {
    const { sql, replacements } = archivedSearchSql("o'brien; DROP TABLE x");

    expect(sql).not.toContain('brien');
    expect(sql).not.toContain('DROP');
    expect(replacements.w0).toBe("%o'brien;%");
  });

  it('keeps a typed wildcard a character', () => {
    expect(archivedSearchSql('50%').replacements.w0).toBe('%50\\%%');
    expect(archivedSearchSql('a_b').replacements.w0).toBe('%a\\_b%');
  });

  it('finds a service by the name on its tab', () => {
    expect(archivedSearchSql('public visas').sql).toContain('o.order_type IN (6)');
    expect(archivedSearchSql('police').sql).toContain('o.order_type IN (5)');
    expect(archivedSearchSql('zzz').sql).not.toContain('o.order_type IN');
  });
});
