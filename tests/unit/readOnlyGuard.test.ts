/**
 * The read-only guard and the DDL refusal.
 *
 * These exist because the first version of this guard did not work. It read
 * `query.sql` inside a `beforeQuery` hook, and Sequelize 6 assigns that property
 * *after* running the hook — so the guard saw an empty string, matched nothing,
 * and passed every write through while looking exactly like protection.
 *
 * It was caught by running a write against a real database with
 * `DB_READ_ONLY=true` and finding the row had landed. A guard whose failure mode
 * is silent approval has to be tested, not reasoned about, which is what this
 * file is for.
 *
 * The database is never reached: each test asserts that the statement is refused
 * before it goes out, so the connection is never established.
 */

const loadDatabase = async (readOnly: boolean) => {
  // Re-imported per test, because the guard reads `env.database.readOnly` once
  // when the module is evaluated.
  jest.resetModules();
  process.env.DB_READ_ONLY = readOnly ? 'true' : 'false';

  return import('../../src/config/database');
};

const originalReadOnly = process.env.DB_READ_ONLY;

afterEach(() => {
  process.env.DB_READ_ONLY = originalReadOnly;
  jest.resetModules();
});

describe('read-only mode', () => {
  it('refuses an INSERT before it reaches the database', async () => {
    const { sequelize } = await loadDatabase(true);

    await expect(
      sequelize.query("INSERT INTO tbl_inquiries (name) VALUES ('x')")
    ).rejects.toThrow(/read-only mode/);
  });

  it('refuses an UPDATE', async () => {
    const { sequelize } = await loadDatabase(true);

    await expect(
      sequelize.query('UPDATE tbl_user_client SET s_enabled = 0')
    ).rejects.toThrow(/read-only mode/);
  });

  it('refuses a DELETE', async () => {
    const { sequelize } = await loadDatabase(true);

    await expect(sequelize.query('DELETE FROM tbl_cls_order')).rejects.toThrow(
      /read-only mode/
    );
  });

  it('refuses a REPLACE', async () => {
    const { sequelize } = await loadDatabase(true);

    await expect(
      sequelize.query("REPLACE INTO tbl_sections (section_key) VALUES ('x')")
    ).rejects.toThrow(/read-only mode/);
  });

  it('refuses a write regardless of leading whitespace or case', async () => {
    const { sequelize } = await loadDatabase(true);

    await expect(
      sequelize.query("\n   insert into tbl_inquiries (name) values ('x')")
    ).rejects.toThrow(/read-only mode/);
  });

  it('carries the code the website can act on', async () => {
    const { sequelize } = await loadDatabase(true);

    await expect(
      sequelize.query('DELETE FROM tbl_cls_order')
    ).rejects.toMatchObject({ code: 'read_only', status: 503 });
  });
});

describe('DDL', () => {
  it('is refused even when writes are enabled', async () => {
    // Not a read-only rule. This application never changes the schema, in any
    // environment, because the schema belongs to the database.
    const { sequelize } = await loadDatabase(false);

    for (const statement of [
      'CREATE TABLE nope (id INT)',
      'ALTER TABLE tbl_orders ADD COLUMN nope INT',
      'DROP TABLE tbl_orders',
      'TRUNCATE TABLE tbl_orders',
      'RENAME TABLE tbl_orders TO tbl_orders_old',
    ]) {
      await expect(sequelize.query(statement)).rejects.toThrow(
        /does not modify the database schema/
      );
    }
  });

  it('refuses GRANT and REVOKE too', async () => {
    const { sequelize } = await loadDatabase(false);

    await expect(
      sequelize.query('GRANT ALL ON clspubli.* TO someone')
    ).rejects.toThrow(/does not modify the database schema/);
  });
});

describe('sequelize.sync', () => {
  it('throws rather than quietly doing nothing', async () => {
    // A no-op would let a caller believe the schema had been reconciled.
    const { sequelize } = await loadDatabase(false);

    expect(() => sequelize.sync()).toThrow(/disabled/);
  });
});

describe('when writes are enabled', () => {
  it('does not refuse an INSERT at the guard', async () => {
    const { sequelize } = await loadDatabase(false);

    // It still fails — there is no database behind these tests — but the failure
    // has to come from the connection, not from the guard. That distinction is
    // what proves the guard is off rather than accidentally always on.
    await expect(
      sequelize.query("INSERT INTO tbl_inquiries (name) VALUES ('x')")
    ).rejects.not.toThrow(/read-only mode/);
  });
});
