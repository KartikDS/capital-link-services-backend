/**
 * The client's own note on their order, and the two flags that decide whether
 * they ever see it back.
 *
 * `tbl_order_notes` is a flat log CLS's admin writes into, and `is_admin` is what
 * filters a row out of the client's view — so a note written on the client's
 * behalf with `is_admin: 1` would hide their own message from them. `status` is
 * the admin's triage column, so a client's note must not set it.
 *
 * The model layer is mocked rather than exercised: every assertion here is about
 * the row that is handed to `OrderNotes.create`, which is decided before any query
 * runs.
 */

const create = jest.fn();
const findByPk = jest.fn();

jest.mock('../../src/models', () => ({
  OrderNotes: { create },
  UserClient: { findByPk },
  ClsOrder: {},
  ClsOrderDocuments: {},
}));

import { addClientComment } from '../../src/modules/orders/orders.writes';
import type { ResolvedOrder } from '../../src/modules/orders/orders.service';

const clsOrder = (orderNo: string | null = 'CLS-000451'): ResolvedOrder =>
  ({
    family: 'cls',
    row: { id: 451, order_no: orderNo },
    clientId: 12,
  }) as unknown as ResolvedOrder;

const legacyOrder = (orderNo = 8891): ResolvedOrder =>
  ({
    family: 'legacy',
    row: { order_no: orderNo },
    clientId: 12,
  }) as unknown as ResolvedOrder;

beforeEach(() => {
  jest.clearAllMocks();
  findByPk.mockResolvedValue({ fname: 'Alex', lname: 'Taylor' });
  create.mockImplementation((values: Record<string, unknown>) =>
    Promise.resolve({ id: 41, ...values })
  );
});

describe('addClientComment', () => {
  it('files the note under the digits of the reference', async () => {
    await addClientComment(clsOrder(), 'My travel date has moved.', 12);

    // `order_no` on the notes table is an `int` and a `tbl_cls_order` reference is
    // text, so the digits are the only key the two families' notes can share —
    // and the same key `orders.service.comments` reads them back by.
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ order_no: 451, note: 'My travel date has moved.' })
    );
  });

  it('marks it as the client’s, and not as internal', async () => {
    await addClientComment(clsOrder(), 'Please expedite.', 12);

    const [values] = create.mock.calls[0];

    expect(values.user_type).toBe('client');
    // The flag that decides whether the client sees their own note back.
    expect(values.is_admin).toBe(0);
    expect(values.is_deleted).toBe(0);
  });

  it('leaves the admin’s triage column alone', async () => {
    await addClientComment(clsOrder(), 'Please expedite.', 12);

    const [values] = create.mock.calls[0];

    // A client cannot decide their own order is 'Action required'.
    expect(values.status).toBeUndefined();
  });

  it('records who wrote it, by id and by name', async () => {
    await addClientComment(clsOrder(), 'Please expedite.', 12);

    const [values] = create.mock.calls[0];

    expect(values.note_by).toBe(12);
    // The name as well as the id, because the notes table has no join to a client
    // and the admin's own screens read this column.
    expect(values.note_by_name).toBe('Alex Taylor');
  });

  it('falls back to "Client" when the account records no name', async () => {
    findByPk.mockResolvedValue(null);

    await addClientComment(clsOrder(), 'Please expedite.', 12);

    expect(create.mock.calls[0][0].note_by_name).toBe('Client');
  });

  it('takes a legacy order’s number as it stands', async () => {
    await addClientComment(legacyOrder(8891), 'Please expedite.', 12);

    expect(create.mock.calls[0][0].order_no).toBe(8891);
  });

  it('returns the stored note, keyed to the order’s reference', async () => {
    const { comment } = await addClientComment(clsOrder(), 'Hello.', 12);

    expect(comment).toMatchObject({
      id: '41',
      reference: 'CLS-000451',
      author: 'Alex Taylor',
      // Normalised, not the raw `client` from `user_type`: three screens compare
      // against this to decide which side of the thread a note belongs on.
      authorRole: 'Client',
      body: 'Hello.',
    });
  });

  it('refuses an empty note rather than storing a blank row', async () => {
    for (const body of ['', '   ', '\n\t']) {
      await expect(addClientComment(clsOrder(), body, 12)).rejects.toThrow(
        /Write something/
      );
    }

    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an order whose reference has no digits to key on', async () => {
    // Written somewhere nobody could find it is worse than refused with a reason.
    await expect(
      addClientComment(clsOrder('DRAFT'), 'Please expedite.', 12)
    ).rejects.toThrow(/cannot attach a comment/);

    expect(create).not.toHaveBeenCalled();
  });
});
