/**
 * A client's reply on their order: which table it lands in, and the flags that
 * decide whether CLS ever sees it.
 *
 * ## What is actually being asserted
 *
 * That a reply goes where a consultant reads. CLS's admin draws its consultant
 * thread from `tbl_order_destination_notes`, keyed on a destination row — every
 * order-view screen in `CLSadminBundle` posts `ticketComment[<destination id>]`
 * and `ViewOrderController` files it against the destination. `tbl_order_notes`
 * is the fallback for an order with no destination row, and nothing more: on the
 * document-legalisation screen its only loop is
 * `is_admin == 1 and note.document_type == notes.document_type`, so a client note
 * written there reached no CLS screen at all.
 *
 * `is_admin` is the flag that matters on both tables and it means the *same*
 * thing on each, despite the admin's labels: 0 is the shared client-facing
 * thread, 1 is staff-only. A client's own note written as 1 would be hidden from
 * them and filed among CLS's private notes.
 *
 * The model layer is mocked rather than exercised: every assertion here is about
 * the row handed to `create`, which is decided before any query runs.
 */

const orderNoteCreate = jest.fn();
const destinationNoteCreate = jest.fn();
const destinationNoteFindAll = jest.fn();
const destinationFindAll = jest.fn();
const legacyDestinationFindAll = jest.fn();
const findByPk = jest.fn();

jest.mock('../../src/models', () => ({
  OrderNotes: { create: orderNoteCreate },
  OrderDestinationNotes: {
    create: destinationNoteCreate,
    findAll: destinationNoteFindAll,
  },
  ClsOrderDestinations: { findAll: destinationFindAll },
  OrderDestinations: { findAll: legacyDestinationFindAll },
  UserClient: { findByPk },
  ClsOrder: {},
  ClsOrderDocuments: {},
  ClsOrderDocumentNotes: {},
  Countries: {},
  DocumentLegalizationOrderDetails: {},
  OrderDlChecklist: {},
  OrderDlQuotes: {},
  OrderReturnDocumentDetails: {},
  OrderTravellerDetails: {},
  OrderTravellers: {},
  Orders: {},
  Payment: {},
  PoliceClearanceOrderDetails: {},
  RussianVisaVoucherOrderDetails: {},
  UserAdmin: {},
}));

import { Op } from 'sequelize';
import { addClientComment } from '../../src/modules/orders/orders.writes';
import { listClientVisibleDestinationNotes } from '../../src/modules/orders/orders.repository';
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

/** An order with a destination row, so the consultant thread exists. */
const withDestination = (id = 77) => destinationFindAll.mockResolvedValue([{ id }]);

/** An order with none — a clearance, voucher or document-delivery order. */
const withoutDestination = () => destinationFindAll.mockResolvedValue([]);

beforeEach(() => {
  jest.clearAllMocks();
  findByPk.mockResolvedValue({ fname: 'Alex', lname: 'Taylor' });
  destinationFindAll.mockResolvedValue([]);
  legacyDestinationFindAll.mockResolvedValue([]);

  for (const create of [orderNoteCreate, destinationNoteCreate]) {
    create.mockImplementation((values: Record<string, unknown>) =>
      Promise.resolve({ id: 41, ...values })
    );
  }
});

describe('addClientComment — the consultant thread', () => {
  it('files the note against the order’s destination, where CLS reads it', async () => {
    withDestination(77);

    await addClientComment(clsOrder(), 'My travel date has moved.', 12);

    expect(destinationNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        destination_id: 77,
        note: 'My travel date has moved.',
      })
    );
    // Not the other table. A note in `tbl_order_notes` is invisible on the
    // document-legalisation screen, which is the bug this replaced.
    expect(orderNoteCreate).not.toHaveBeenCalled();
  });

  it('marks it as the client’s, and not as internal', async () => {
    withDestination();

    await addClientComment(clsOrder(), 'Please expedite.', 12);

    const [values] = destinationNoteCreate.mock.calls[0];

    // Capitalised, exactly: the admin's template gates its [Edit]/[Delete]
    // controls on `user_type == 'Admin'` and prints this value verbatim in the
    // byline — "- by Alex Taylor (Client)".
    expect(values.user_type).toBe('Client');
    // 0 is the shared thread, 1 is staff-only. See the file header.
    expect(values.is_admin).toBe(0);
  });

  it('records who wrote it, by id and by name', async () => {
    withDestination();

    await addClientComment(clsOrder(), 'Please expedite.', 12);

    const [values] = destinationNoteCreate.mock.calls[0];

    expect(values.note_by).toBe(12);
    // The name as well as the id, because neither note table joins to a client
    // and the admin's own screens read this column.
    expect(values.note_by_name).toBe('Alex Taylor');
  });

  it('does not pin it to the top of the consultant’s list', async () => {
    withDestination();

    await addClientComment(clsOrder(), 'Please expedite.', 12);

    // `is_pin` is the admin's own ordering control. A client cannot decide their
    // message sits above everything else on the order.
    expect(destinationNoteCreate.mock.calls[0][0].is_pin).toBe(0);
  });

  it('uses the first destination when an order has several', async () => {
    destinationFindAll.mockResolvedValue([{ id: 77 }, { id: 78 }]);

    await addClientComment(clsOrder(), 'Please expedite.', 12);

    // The one the admin renders first. The read merges every destination's
    // thread, so filing against one loses nothing.
    expect(destinationNoteCreate.mock.calls[0][0].destination_id).toBe(77);
  });

  it('reads a legacy order’s destinations from the legacy table', async () => {
    legacyDestinationFindAll.mockResolvedValue([{ id: 512 }]);

    await addClientComment(legacyOrder(8891), 'Please expedite.', 12);

    // `tbl_order_destinations` joins on `order_no`, not `order_id`.
    expect(legacyDestinationFindAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: { order_no: 8891 } })
    );
    expect(destinationNoteCreate.mock.calls[0][0].destination_id).toBe(512);
  });

  it('returns the stored note, prefixed and keyed to the reference', async () => {
    withDestination();

    const { comment } = await addClientComment(clsOrder(), 'Hello.', 12);

    expect(comment).toMatchObject({
      // Prefixed: both note tables auto-increment from 1, so a bare id would
      // collide across the merged thread.
      id: 'dn-41',
      reference: 'CLS-000451',
      author: 'Alex Taylor',
      authorRole: 'Client',
      body: 'Hello.',
    });
  });

  it('carries no attachment when the client sent no file with it', async () => {
    withDestination();

    const { comment } = await addClientComment(clsOrder(), 'Hello.', 12);

    // Absent rather than an empty array, so the website has nothing to test for.
    expect(comment).not.toHaveProperty('attachments');
  });
});

describe('addClientComment — the fallback', () => {
  it('uses `tbl_order_notes` for an order with no destination row', async () => {
    withoutDestination();

    await addClientComment(clsOrder(), 'My travel date has moved.', 12);

    // Clearance, voucher and document-delivery orders have no destination row —
    // their legacy controllers write none — so there is no destination thread to
    // file against and this is the only place the note can go.
    expect(destinationNoteCreate).not.toHaveBeenCalled();
    expect(orderNoteCreate).toHaveBeenCalledWith(
      expect.objectContaining({ order_no: 451, note: 'My travel date has moved.' })
    );
  });

  it('files it under the digits of the reference', async () => {
    withoutDestination();

    await addClientComment(clsOrder(), 'Please expedite.', 12);

    // `order_no` is an `int` and a `tbl_cls_order` reference is text, so the
    // digits are the only key the two families' notes can share — the same key
    // `orders.service.comments` reads them back by.
    expect(orderNoteCreate.mock.calls[0][0].order_no).toBe(451);
  });

  it('marks it as the client’s, and not as internal', async () => {
    withoutDestination();

    await addClientComment(clsOrder(), 'Please expedite.', 12);

    const [values] = orderNoteCreate.mock.calls[0];

    expect(values.user_type).toBe('client');
    expect(values.is_admin).toBe(0);
    expect(values.is_deleted).toBe(0);
  });

  it('leaves the admin’s triage column alone', async () => {
    withoutDestination();

    await addClientComment(clsOrder(), 'Please expedite.', 12);

    // A client cannot decide their own order is 'Action required'.
    expect(orderNoteCreate.mock.calls[0][0].status).toBeUndefined();
  });

  it('takes a legacy order’s number as it stands', async () => {
    withoutDestination();

    await addClientComment(legacyOrder(8891), 'Please expedite.', 12);

    expect(orderNoteCreate.mock.calls[0][0].order_no).toBe(8891);
  });

  it('refuses an order whose reference has no digits to key on', async () => {
    withoutDestination();

    // Written somewhere nobody could find it is worse than refused with a reason.
    await expect(
      addClientComment(clsOrder('DRAFT'), 'Please expedite.', 12)
    ).rejects.toThrow(/cannot attach a comment/);

    expect(orderNoteCreate).not.toHaveBeenCalled();
  });

  it('still reaches the consultant thread on a draft-referenced order', async () => {
    // The digits rule is the *fallback's* limitation, not the thread's: a
    // destination note is keyed on the destination row, so an unparseable
    // reference is no obstacle to filing one.
    withDestination(77);

    const { comment } = await addClientComment(clsOrder('DRAFT'), 'Please expedite.', 12);

    expect(destinationNoteCreate.mock.calls[0][0].destination_id).toBe(77);
    expect(comment.id).toBe('dn-41');
  });
});

describe('listClientVisibleDestinationNotes', () => {
  /**
   * The filter that keeps CLS's internal notes inside CLS.
   *
   * Asserted rather than commented, because the column name argues for the
   * opposite reading every time somebody new looks at it. `is_admin = 1` is the
   * “Admin comment” box — staff talking to staff about a client's order — and it
   * must never be returned to that client. Getting this backwards would publish
   * CLS's private notes to the people they are about.
   */
  it('asks only for notes on the client-facing side of the thread', async () => {
    destinationNoteFindAll.mockResolvedValue([]);

    await listClientVisibleDestinationNotes([77, 78]);

    const [query] = destinationNoteFindAll.mock.calls[0];

    // Null counts as client-facing: the column defaults to 0 and MyISAM rows
    // written before it existed have no value, so an old note is shown rather
    // than silently withheld.
    expect(query.where[Op.or]).toEqual([
      { is_admin: { [Op.is]: null } },
      { is_admin: 0 },
    ]);
    expect(query.where.destination_id).toEqual({ [Op.in]: [77, 78] });
  });

  it('does not query at all for an order with no destinations', async () => {
    await expect(listClientVisibleDestinationNotes([])).resolves.toEqual([]);

    // `IN ()` is a syntax error, and there is nothing to ask for anyway.
    expect(destinationNoteFindAll).not.toHaveBeenCalled();
  });
});

describe('addClientComment — either table', () => {
  it('refuses an empty note rather than storing a blank row', async () => {
    withDestination();

    for (const body of ['', '   ', '\n\t']) {
      await expect(addClientComment(clsOrder(), body, 12)).rejects.toThrow(
        /Write something/
      );
    }

    expect(destinationNoteCreate).not.toHaveBeenCalled();
    expect(orderNoteCreate).not.toHaveBeenCalled();
  });

  it('falls back to "Client" when the account records no name', async () => {
    findByPk.mockResolvedValue(null);
    withDestination();

    await addClientComment(clsOrder(), 'Please expedite.', 12);

    expect(destinationNoteCreate.mock.calls[0][0].note_by_name).toBe('Client');
  });
});
