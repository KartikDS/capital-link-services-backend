/**
 * The client's reference and CLS's order number, and why they are not the same
 * string. The reasoning is in `domain/orderReference`; these are the two
 * properties everything else depends on.
 */

import { orderIdFromReference, orderReference } from '../../src/domain/orderReference';

describe('orderReference', () => {
  it.each([
    [12, 'CLS-000012'],
    [1, 'CLS-000001'],
    [1_482, 'CLS-001482'],
    // Longer than the padding: an id is never truncated to fit the format.
    [10_034_500, 'CLS-10034500'],
  ])('formats %i as %s', (id, reference) => {
    expect(orderReference(id)).toBe(reference);
  });

  it('round-trips every reference it produces', () => {
    for (const id of [1, 9, 10, 12, 999_999, 10_034_500]) {
      expect(orderIdFromReference(orderReference(id))).toBe(id);
    }
  });
});

describe('orderIdFromReference', () => {
  it('reads a reference a client quotes, however they type it', () => {
    expect(orderIdFromReference('  CLS-000012 ')).toBe(12);
    expect(orderIdFromReference('cls-000012')).toBe(12);
  });

  it('does not read a bare number as one of ours', () => {
    /**
     * The property that keeps the two order families apart. `tbl_orders` keeps
     * real reference numbers in its own `order_no` and they are numeric, so a
     * client quoting `10034324` must reach that lookup — not whichever
     * `tbl_cls_order` row happens to have that id.
     */
    expect(orderIdFromReference('12')).toBeNull();
    expect(orderIdFromReference('10034324')).toBeNull();
  });

  it('is null for anything that is not the website\u2019s format', () => {
    expect(orderIdFromReference('')).toBeNull();
    expect(orderIdFromReference('CLS-')).toBeNull();
    expect(orderIdFromReference('CLS-00A012')).toBeNull();
    expect(orderIdFromReference('ORDER-000012')).toBeNull();
    expect(orderIdFromReference('CLS-000012-A')).toBeNull();
  });
});
