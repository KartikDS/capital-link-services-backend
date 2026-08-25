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

  it('writes the id into order_no, which is what CLS’s admin keys on', async () => {
    await lodgeVoucherOrder({ ...order, tier: 'four-days' });

    /**
     * Their voucher queue links its View button with `order_id=` this column and
     * the view behind it looks the order up by primary key, so a `'CLS-010034500'`
     * here is a link to nothing — which is how a paid order became one their staff
     * could not open. See `domain/orderReference`.
     */
    expect(orderUpdate).toHaveBeenCalledWith({ order_no: '10034500' }, expect.anything());
  });

  it('records the second visit in the columns the old application uses', async () => {
    await lodgeVoucherOrder({
      ...order,
      tier: 'four-days',
      entryDate: '2026-10-01',
      departureDate: '2026-10-14',
      secondEntryDate: '2026-12-01',
      secondDepartureDate: '2026-12-10',
    });

    /**
     * `ApplicationRussianVisaVoucherController:471` writes the second pair to
     * `double_*` for any voucher that is not single entry. The website used to
     * fold these into the order note, which put the dates the second invitation
     * is raised from somewhere nobody's form field could show them.
     */
    expect(voucherDetailsCreate.mock.calls[0][0]).toMatchObject({
      first_entry_date: '2026-10-01',
      first_departure_date: '2026-10-14',
      double_entry_date: '2026-12-01',
      double_departure_date: '2026-12-10',
    });
  });

  it('records where the visa will be lodged, verbatim', async () => {
    const appliedAt =
      'The Russian Embassy, 78 Canberra Avenue, Griffith ACT– CANBERRA AUSTRALIA';

    await lodgeVoucherOrder({ ...order, tier: 'four-days', appliedAt });

    // Stored exactly as given: their admin matches this against its own literal
    // to decide which "Visa to be applied at" radio to check.
    expect(voucherDetailsCreate.mock.calls[0][0]).toMatchObject({
      visa_applied_at: appliedAt,
    });
  });

  it('still answers with the reference the client is quoted', async () => {
    const lodged = await lodgeVoucherOrder({ ...order, tier: 'four-days' });

    // Derived from the id rather than read back from the column.
    expect(lodged.reference).toBe('CLS-10034500');
  });
});
