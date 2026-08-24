/**
 * Lodging a document legalisation order, and the two rows the old admin needs.
 *
 * Both assertions here are regressions from a 500 seen on a real order in CLS's
 * own admin, and both are about writing the table the old application reads
 * rather than the one that looks right:
 *
 * 1. **A traveller row always exists.** `ViewOrderController:3527` flattens
 *    `order_travellers[0]` into `travellers` and `docLegalisation.html.twig:39`
 *    reads `orderData.travellers.first_name` unguarded. No rows meant a Twig
 *    fatal on a real order.
 * 2. **Document lines go to `tbl_order_dl_checklist`.**
 *    `tbl_document_legalization_documents` has no reader anywhere in the legacy
 *    codebase, so lines written there left the admin's checklist empty.
 */

const clsOrderCreate = jest.fn();
const destinationCreate = jest.fn();
const travellerCreate = jest.fn();
const checklistCreate = jest.fn();
const dlDetailsCreate = jest.fn();
const returnAddressCreate = jest.fn();
const courierCreate = jest.fn();
const notesCreate = jest.fn();
const findClientByEmail = jest.fn();

jest.mock('../../src/config/database', () => ({
  sequelize: {
    transaction: (body: (t: unknown) => Promise<unknown>) => body({}),
  },
}));

jest.mock('../../src/models', () => ({
  ClsOrder: { create: clsOrderCreate },
  ClsOrderDestinations: { create: destinationCreate },
  DocumentLegalizationOrderDetails: { create: dlDetailsCreate },
  OrderCourierServiceDetails: { create: courierCreate },
  OrderDlChecklist: { create: checklistCreate },
  OrderNotes: { create: notesCreate },
  OrderReturnDocumentDetails: { create: returnAddressCreate },
  OrderTravellerDetails: { create: travellerCreate },
  PoliceClearanceOrderDetails: { create: jest.fn() },
  RussianVisaVoucherOrderDetails: { create: jest.fn() },
}));

jest.mock('../../src/modules/auth/auth.repository', () => ({ findClientByEmail }));

// Legalisation is quoted, never priced from a rate card.
jest.mock('../../src/domain/quotes', () => ({
  quoteLegalisation: jest.fn().mockResolvedValue({
    lines: [],
    subtotalCents: 0,
    gstCents: 0,
    totalCents: 0,
    currency: 'AUD',
    quoteRequired: true,
    reason: 'Priced per job',
  }),
  quoteClearance: jest.fn(),
  quoteVisa: jest.fn(),
  quoteVoucher: jest.fn(),
  quoteOnApplication: jest.fn(),
  VOUCHER_TIER_IDS: [],
}));

// The checklist materialiser is exercised by its own suite.
jest.mock('../../src/domain/checklist', () => ({
  materialiseChecklistQuietly: jest.fn().mockResolvedValue(undefined),
}));

import { lodgeLegalisationOrder } from '../../src/modules/orders/orders.lodge';

const contact = {
  firstName: 'Harshita',
  lastName: 'Agarwal',
  email: 'harshita@example.com',
  phone: '+61 400 000 000',
};

beforeEach(() => {
  jest.clearAllMocks();
  findClientByEmail.mockResolvedValue(null);
  clsOrderCreate.mockResolvedValue({
    id: 10_034_324,
    order_no: 'CLS-10034324',
    update: jest.fn().mockResolvedValue(undefined),
  });
});

describe('lodgeLegalisationOrder', () => {
  const order = {
    clientId: null,
    contact,
    destinationCountryId: 14,
    nationalityCountryId: 241,
    documents: [
      {
        documentType: 'Police Clearance Certificate Attestation',
        quantity: 1,
        note: 'Files to follow',
      },
    ],
  };

  it('writes a primary traveller from the contact when no applicants were collected', async () => {
    await lodgeLegalisationOrder(order);

    // Without this row the old admin's DL view fatals — see the note above.
    expect(travellerCreate).toHaveBeenCalledTimes(1);
    expect(travellerCreate.mock.calls[0][0]).toMatchObject({
      order_id: 10_034_324,
      first_name: 'Harshita',
      last_name: 'Agarwal',
      email: 'harshita@example.com',
      is_primary: 1,
      // A legalisation's contact *is* the client, which is what the old
      // application records here too.
      is_client: 1,
      nationality: 241,
      status: 1,
    });
  });

  it('uses the applicants when the journey did collect them', async () => {
    await lodgeLegalisationOrder({
      ...order,
      applicants: [
        { firstName: 'Priya', lastName: 'Raman' },
        { firstName: 'Sam', lastName: 'Raman' },
      ],
    });

    // Two real applicants, and no synthesised contact row beside them.
    expect(travellerCreate).toHaveBeenCalledTimes(2);
    expect(travellerCreate.mock.calls[0][0]).toMatchObject({
      first_name: 'Priya',
      is_primary: 1,
    });
    expect(travellerCreate.mock.calls[1][0]).toMatchObject({
      first_name: 'Sam',
      is_primary: 0,
    });
  });

  it('writes the document lines to tbl_order_dl_checklist, keyed by the order id', async () => {
    await lodgeLegalisationOrder(order);

    expect(checklistCreate).toHaveBeenCalledTimes(1);
    expect(checklistCreate.mock.calls[0][0]).toMatchObject({
      // `order_no` on this table holds the tbl_cls_order id — it is the key the
      // admin's `getOrderDLChecklistsByOrderId` reads by.
      order_no: 10_034_324,
      type: 'Police Clearance Certificate Attestation',
      number: 1,
      note: 'Files to follow',
    });
  });

  it('still writes the detail row the admin DL queue joins on, flagged active', async () => {
    await lodgeLegalisationOrder(order);

    expect(dlDetailsCreate.mock.calls[0][0]).toMatchObject({
      order_id: 10_034_324,
      destination: 14,
      nationality: 241,
      /**
       * `getDLOrderDetailsByOrderId` is
       * `WHERE ddod.status = 1 AND ddod.order_id = :orderId`. Written `0` the
       * row exists and the admin cannot see it — the DL view then rendered
       * `dl_order_details => array()` and lost the destination, nationality,
       * reference and commercial invoice number.
       */
      status: 1,
    });
  });

  it('writes the destination row the DL view interpolates unguarded', async () => {
    await lodgeLegalisationOrder(order);

    /**
     * `docLegalisation.html.twig` uses `{{orderData.travels.id}}` with no
     * `is defined` guard in seventeen places — line 117 is the first — and
     * `travels` is this row. Without it the admin page is a Twig 500.
     */
    expect(destinationCreate).toHaveBeenCalledTimes(1);
    expect(destinationCreate.mock.calls[0][0]).toMatchObject({
      order_id: 10_034_324,
      country_id: 14,
      nationality: 241,
      status: 1,
    });
  });

  it('marks the order placed, because a quoted order has no payment to wait for', async () => {
    await lodgeLegalisationOrder(order);

    // status 1 = placed by the client. Left at 0 it reads to CLS as an
    // abandoned basket.
    expect(clsOrderCreate.mock.calls[0][0]).toMatchObject({ status: 1 });
  });
});
