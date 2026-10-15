import { Op } from 'sequelize';

jest.mock('../../src/models', () => ({}));

import { countKey } from '../../src/modules/admin/queues';

describe('countKey', () => {
  it('tells a search from the unfiltered list', () => {
    const plain = { order_type: 9 };
    const searched = {
      order_type: 9,
      [Op.or]: [{ order_no: { [Op.like]: '%smith%' } }],
    };

    // JSON.stringify drops symbol keys, which is how both used to share a count.
    expect(JSON.stringify(searched)).toBe(JSON.stringify(plain));
    expect(countKey(searched)).not.toBe(countKey(plain));
  });

  it('tells two searches apart and the same one together', () => {
    const search = (term: string) => ({
      order_type: 9,
      [Op.or]: [{ order_no: { [Op.like]: `%${term}%` } }],
    });

    expect(countKey(search('a'))).not.toBe(countKey(search('b')));
    expect(countKey(search('a'))).toBe(countKey(search('a')));
  });
});
