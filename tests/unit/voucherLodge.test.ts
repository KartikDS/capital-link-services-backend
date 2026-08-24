/**
 * Lodging a Russian visa voucher order, and the one column that has to be read
 * back by an application this one did not write.
 *
 * `voucher_col` is an integer whose meaning is the old voucher form's radio
 * value: `RussianVisaVoucher/step_three.html.twig` numbers the invitation
 * table's three speeds `1`–`3` and the business table's two `4`–`5`, and reads
 * those same numbers back to re-check the radio on a saved order. It was being
 * derived from the API's own tier order — the schema's column order, which
 * starts at `thirteen_days` — so a 13-day order was written as `1`, the number
 * that form reads as "3 days processing".
 */

const clsOrderCreate = jest.fn();
const voucherDetailsCreate = jest.fn();
const travellerCreate = jest.fn();
const orderUpdate = jest.fn();
const findClientByEmail = jest.fn();

jest.mock('../../src/config/database', () => ({
  sequelize: {
    transaction: (body: (t: unknown) => Promise<unknown>) => body({}),
  },
}));

jest.mock('../../src/models', () => ({
  ClsOrder: { create: clsOrderCreate },
  ClsOrderDestinations: { create: jest.fn() },
  DocumentLegalizationOrderDetails: { create: jest.fn() },
  OrderCourierServiceDetails: { create: jest.fn() },
  OrderDlChecklist: { create: jest.fn() },
  OrderNotes: { create: jest.fn() },
  OrderReturnDocumentDetails: { create: jest.fn() },
  OrderTravellerDetails: { create: travellerCreate },
  PoliceClearanceOrderDetails: { create: jest.fn() },
  RussianVisaVoucherOrderDetails: { create: voucherDetailsCreate },
}));

jest.mock('../../src/modules/auth/auth.repository', () => ({ findClientByEmail }));

// The voucher's own pricing is exercised by `quotes.test.ts`; what matters here
// is which column the tier is recorded in.
jest.mock('../../src/domain/quotes', () => ({
  quoteVoucher: jest.fn().mockResolvedValue({
    lines: [{ label: '4 day processing', unitCents: 34300, quantity: 1 }],
    subtotalCents: 34300,
    gstCents: 3430,
    totalCents: 37730,
    currency: 'AUD',
    quoteRequired: false,
  }),
  quoteClearance: jest.fn(),
  quoteLegalisation: jest.fn(),
  quoteVisa: jest.fn(),
  quoteOnApplication: jest.fn(),
  VOUCHER_TIER_IDS: [],
}));

jest.mock('../../src/domain/checklist', () => ({
  materialiseChecklistQuietly: jest.fn().mockResolvedValue(undefined),
}));

import { lodgeVoucherOrder } from '../../src/modules/orders/orders.lodge';

const order = {
  clientId: null,
  voucherTypeId: 1,
  contact: {
    firstName: 'Alex',
    lastName: 'Novak',
    email: 'alex@example.com',
    phone: '+61 400 111 222',
  },
  applicants: [{ firstName: 'Alex', lastName: 'Novak' }],
} as const;

beforeEach(() => {
  jest.clearAllMocks();
  findClientByEmail.mockResolvedValue(null);
  orderUpdate.mockResolvedValue(undefined);
  clsOrderCreate.mockResolvedValue({
    id: 10_034_500,
    order_no: 'CLS-10034500',
    update: orderUpdate,
  });
});

describe('lodgeVoucherOrder', () => {
  it.each([
    ['three-days', 1],
    ['one-two-days', 2],
    ['twelve-hours', 3],
    ['thirteen-days', 4],
    ['four-days', 5],
  ] as const)('records %s as voucher_col %i', async (tier, column) => {
    await lodgeVoucherOrder({ ...order, tier });

    expect(voucherDetailsCreate.mock.calls[0][0]).toMatchObject({
      order_id: 10_034_500,
      russian_visa_voucher_id: 1,
      voucher_col: column,
      // `getRussianVisaVoucherOrderDetailsByOrderId` filters on this; at `0` the
      // voucher's own details are invisible to the admin.
      status: 1,
    });
  });

  it('keeps the voucher row id on the order itself, which the admin joins on', async () => {
    await lodgeVoucherOrder({ ...order, tier: 'four-days' });

    expect(orderUpdate).toHaveBeenCalledWith(
      { russian_visa_voucher_id: 1 },
      expect.anything()
    );
  });
});
