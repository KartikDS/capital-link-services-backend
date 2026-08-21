/**
 * Who a lodged order belongs to.
 *
 * This is the one behaviour in the lodgement path that decides whether a client
 * ever sees their own order. `tbl_cls_order.client_id` is what the portal filters
 * on, so an order written with a null there is invisible for good — and three of
 * the four journeys on the website are open to visitors, which is how a client
 * who ordered before signing in ends up being told they have no orders.
 *
 * The model layer is mocked rather than exercised: the assertion is about which
 * `client_id` is handed to `ClsOrder.create`, and that is decided before any
 * query runs.
 */

const create = jest.fn();
const update = jest.fn();
const findClientByEmail = jest.fn();
const detailCreate = jest.fn();

jest.mock('../../src/config/database', () => ({
  sequelize: {
    // Runs the callback with a stand-in transaction, so the lodgement's writes
    // happen inline and in order.
    transaction: (body: (t: unknown) => Promise<unknown>) => body({}),
  },
}));

jest.mock('../../src/models', () => ({
  ClsOrder: { create },
  PoliceClearanceOrderDetails: { create: detailCreate },
  OrderTravellerDetails: { create: detailCreate },
  OrderReturnDocumentDetails: { create: detailCreate },
  ClsOrderDestinations: { create: detailCreate },
  DocumentLegalizationDocuments: { create: detailCreate },
  DocumentLegalizationOrderDetails: { create: detailCreate },
  RussianVisaVoucherOrderDetails: { create: detailCreate },
  OrderNotes: { create: detailCreate },
}));

jest.mock('../../src/modules/auth/auth.repository', () => ({
  findClientByEmail,
}));

jest.mock('../../src/domain/quotes', () => ({
  quoteClearance: jest.fn().mockResolvedValue({
    lines: [{ id: 'clearance-1', label: 'UAE', quantity: 1, unitCents: 25000, totalCents: 25000 }],
    subtotalCents: 25000,
    gstCents: 2500,
    totalCents: 27500,
    currency: 'AUD',
    quoteRequired: false,
  }),
  VOUCHER_TIER_IDS: ['thirteen-days'],
}));

import { lodgeClearanceOrder } from '../../src/modules/orders/orders.lodge';

const order = {
  clearanceId: 1,
  contact: {
    firstName: 'Jordan',
    lastName: 'Lee',
    email: 'jordan@example.com',
  },
  applicants: [{ firstName: 'Jordan', lastName: 'Lee' }],
};

/** The values `ClsOrder.create` was called with. */
interface WrittenHeader {
  client_id: number | null;
  date_submitted: string | null;
}

const writtenHeader = (): WrittenHeader | undefined =>
  create.mock.calls[0]?.[0] as WrittenHeader | undefined;

/** What `client_id` the header was written with. */
const writtenClientId = (): number | null =>
  writtenHeader()?.client_id ?? null;

beforeEach(() => {
  create.mockResolvedValue({ id: 71, order_no: 'CLS-000071', update });
  update.mockResolvedValue(undefined);
  detailCreate.mockResolvedValue({ id: 1 });
  findClientByEmail.mockResolvedValue(null);
});

describe('the account a lodged order is attached to', () => {
  it('uses the signed-in client, and does not go looking for another', async () => {
    await lodgeClearanceOrder({ ...order, clientId: 9 });

    expect(writtenClientId()).toBe(9);
    // The session is the authority on who is ordering. Matching on the contact
    // email as well would let a signed-in client's order be filed against a
    // different account by typing somebody else's address into the form.
    expect(findClientByEmail).not.toHaveBeenCalled();
  });

  it('attaches a guest order to the account whose email is the order contact', async () => {
    findClientByEmail.mockResolvedValue({ id: 4 });

    await lodgeClearanceOrder({ ...order, clientId: null });

    expect(findClientByEmail).toHaveBeenCalledWith('jordan@example.com');
    expect(writtenClientId()).toBe(4);
  });

  it('leaves a guest order unattached when no account has that email', async () => {
    await lodgeClearanceOrder({ ...order, clientId: null });

    // Still a real order: it carries the contact address, CLS's own screens show
    // it, and a consultant can link it to an account later.
    expect(writtenClientId()).toBeNull();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('stamps the submission date, which is what marks the row as more than a basket', async () => {
    await lodgeClearanceOrder({ ...order, clientId: 9 });

    // `tbl_cls_order.status` starts at 0 for a submitted order *and* for an
    // abandoned form, so the portal's reads filter on `date_submitted` instead.
    // A lodgement that left it null would store the order and hide it.
    expect(writtenHeader()?.date_submitted).toBeTruthy();
  });
});
