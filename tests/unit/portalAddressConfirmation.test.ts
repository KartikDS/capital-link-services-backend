/**
 * The client's confirmation of an order's return address.
 *
 * What matters: only the owner can do it, only `0 -> 1` is ever written, a
 * repeat is harmless, and a dismissed request (2) is not reopened. The order
 * service is mocked; the assertion is about the write and the answer.
 */

const resolveForClient = jest.fn();
const delivery = jest.fn();
const update = jest.fn();

jest.mock('../../src/models', () => ({
  ClsOrder: { update },
}));

jest.mock('../../src/modules/orders/orders.service', () => ({
  resolveForClient,
  delivery,
  clientReference: (resolved: { row: { id: number } }) => `CLS-${resolved.row.id}`,
}));

import {
  addressConfirmationState,
  confirmAddress,
} from '../../src/modules/portal/portal.addressConfirmation';

const ADDRESS = { address: '1 Test St', city: 'Sydney' };

const clsOrder = (flag: number | null) => ({
  family: 'cls',
  clientId: 7,
  row: { id: 42, client_id: 7, is_address_confirmed: flag },
});

beforeEach(() => {
  jest.clearAllMocks();
  delivery.mockResolvedValue(ADDRESS);
  update.mockResolvedValue([1]);
});

describe('confirmAddress', () => {
  it('sets the flag when it is 0, and says it changed', async () => {
    resolveForClient.mockResolvedValue(clsOrder(0));

    const result = await confirmAddress(7, 'CLS-42');

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0]?.[0]).toEqual({ is_address_confirmed: 1 });
    expect(update.mock.calls[0]?.[1].where.id).toBe(42);
    expect(update.mock.calls[0]?.[1].where.client_id).toBe(7);
    expect(result).toMatchObject({ status: 'confirmed', changed: true, address: ADDRESS });
  });

  it('also treats an unset flag as not yet confirmed', async () => {
    resolveForClient.mockResolvedValue(clsOrder(null));

    expect((await confirmAddress(7, 'CLS-42')).changed).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('is idempotent: an already-confirmed order is not written again', async () => {
    resolveForClient.mockResolvedValue(clsOrder(1));

    const result = await confirmAddress(7, 'CLS-42');

    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'confirmed', changed: false });
  });

  it('does not reopen a request the consultant dismissed', async () => {
    resolveForClient.mockResolvedValue(clsOrder(2));

    const result = await confirmAddress(7, 'CLS-42');

    expect(update).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'dismissed', changed: false });
  });

  it('reports confirmed, unchanged, when a concurrent request won the write', async () => {
    resolveForClient.mockResolvedValue(clsOrder(0));
    update.mockResolvedValue([0]);

    expect(await confirmAddress(7, 'CLS-42')).toMatchObject({
      status: 'confirmed',
      changed: false,
    });
  });

  it('lets the ownership failure through untouched, and writes nothing', async () => {
    resolveForClient.mockRejectedValue(new Error('not found'));

    await expect(confirmAddress(8, 'CLS-42')).rejects.toThrow('not found');
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a legacy order, which has no flag', async () => {
    resolveForClient.mockResolvedValue({ family: 'legacy', clientId: 7, row: {} });

    await expect(confirmAddress(7, '1001')).rejects.toMatchObject({ status: 400 });
    expect(update).not.toHaveBeenCalled();
  });

  it('resolves the order as the caller, never as an admin', async () => {
    resolveForClient.mockResolvedValue(clsOrder(0));

    await confirmAddress(7, 'CLS-42');

    expect(resolveForClient).toHaveBeenCalledWith('CLS-42', 7);
  });
});

describe('addressConfirmationState', () => {
  it.each([
    [0, 'pending'],
    [null, 'pending'],
    [1, 'confirmed'],
    [2, 'dismissed'],
  ])('maps flag %s to %s without writing', async (flag, status) => {
    resolveForClient.mockResolvedValue(clsOrder(flag));

    expect(await addressConfirmationState(7, 'CLS-42')).toMatchObject({
      status,
      changed: false,
      address: ADDRESS,
    });
    expect(update).not.toHaveBeenCalled();
  });
});
