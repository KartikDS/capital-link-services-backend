import { sequelize } from '../../src/config/database';
import { logClientActivity, snippet } from '../../src/domain/orderActivity';

jest.mock('../../src/config/database', () => ({
  sequelize: { query: jest.fn() },
}));

const query = sequelize.query as unknown as jest.Mock;

describe('logClientActivity', () => {
  beforeEach(() => query.mockReset().mockResolvedValue([]));

  it('writes a client entry with no admin id', async () => {
    await logClientActivity(42, 'Sam uploaded 1 document: id.pdf');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, options] = query.mock.calls[0] as [
      string,
      { replacements: Record<string, unknown> },
    ];
    expect(sql).toContain('tbl_ops_activity');
    expect(sql).toContain("'client'");
    expect(sql).toContain('NULL');
    expect(options.replacements.orderId).toBe(42);
    expect(options.replacements.text).toBe('Sam uploaded 1 document: id.pdf');
  });

  it('keeps an entry within the column width', async () => {
    await logClientActivity(1, 'x'.repeat(900));

    const [, options] = query.mock.calls[0] as [
      string,
      { replacements: { text: string } },
    ];
    expect(options.replacements.text).toHaveLength(500);
  });

  it('never throws, so the client’s own action is never undone by it', async () => {
    query.mockRejectedValue(Object.assign(new Error("Table doesn't exist"), { code: 'ER_NO_SUCH_TABLE' }));
    await expect(logClientActivity(1, 'anything')).resolves.toBeUndefined();
  });
});

describe('snippet', () => {
  it('flattens whitespace and shortens long words with an ellipsis', () => {
    expect(snippet('  hello\n\n  world ')).toBe('hello world');
    const long = snippet('a'.repeat(300), 20);
    expect(long).toHaveLength(20);
    expect(long.endsWith('…')).toBe(true);
  });
});
