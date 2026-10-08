/**
 * The Russian Visa Voucher admin order screen, with the model layer mocked — no
 * database, nothing written anywhere.
 *
 * Pinned: the milestone priority (first change wins), that clearing a stamp is not a
 * milestone, that a Submit with nothing changed writes nothing, that closing moves
 * the order to status 2 only on the save that sets it, the screen's read shape
 * (including the new-flow fields), and that every route is voucher-only.
 */

const mockModel = () => ({
  findByPk: jest.fn(),
  findOne: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
});

const mockModels = {
  ClsOrder: mockModel(),
  ClsOrderDocuments: mockModel(),
  ClsOrderDestinations: mockModel(),
  Countries: mockModel(),
  DocumentLegalizationOrderDetails: mockModel(),
  OrderDestinationNotes: mockModel(),
  OrderDlChecklist: mockModel(),
  OrderFollowUpDate: mockModel(),
  OrderNotes: mockModel(),
  OrderReturnDocumentDetails: mockModel(),
  OrderTravellerDetails: mockModel(),
  Payment: mockModel(),
  PoliceClearances: mockModel(),
  RussianVisaVoucherOrderDetails: mockModel(),
  RussianVisaVoucherTypes: mockModel(),
  UserAdmin: mockModel(),
  UserClient: mockModel(),
  VisaCourierOptions: mockModel(),
};

jest.mock('../../src/models', () => mockModels);

const mockOpenDocument = jest.fn();

jest.mock('../../src/shared/storage/documents', () => ({
  storedPathOf: (file: { key: string }) => file.key,
  discardDocument: jest.fn(),
  openDocument: (...args: unknown[]): unknown => mockOpenDocument(...args),
}));

jest.mock('../../src/middleware/upload', () => ({
  LEGALISATION_NOTE_FIELDS: { client: 'comment_attachment', admin: 'admin_attachment' },
  legalisationNoteUpload: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { Readable } from 'node:stream';
import express from 'express';
import request from 'supertest';
import {
  pickVoucherMilestone,
  russianVoucherOrderRoutes,
} from '../../src/modules/admin/russianVoucherOrder';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';

const audit = jest.fn(() => Promise.resolve());

const app = express();
app.use(express.json());
app.use('/api/admin/orders', russianVoucherOrderRoutes(audit));
app.use(notFoundHandler);
app.use(errorHandler);

const base = '/api/admin/orders/31/voucher';

const row = <T extends object>(columns: T) => ({
  ...columns,
  update: jest.fn(function (this: T, patch: Partial<T>) {
    Object.assign(this, patch);
    return Promise.resolve(this);
  }),
});

let order: ReturnType<typeof makeOrder>;
let details: ReturnType<typeof makeDetails>;

const makeOrder = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 31,
    order_no: '31',
    order_type: 8,
    client_id: 12,
    status: 1,
    payment_status: 0,
    is_bulk: 0,
    total_fee: '120.00',
    service_fee: '109.09',
    no_of_traveller: 1,
    departure_date: '2026-12-01',
    russian_visa_voucher_id: 3,
    police_clearance_id: null,
    contact_first_name: 'Jo',
    contact_last_name: 'Bloggs',
    contact_email: 'jo@example.com',
    contact_phone: '0400',
    department: null,
    date_submitted: '2026-09-01 10:00:00',
    ...overrides,
  });

const makeDetails = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 4,
    order_id: 31,
    russian_visa_voucher_id: 3,
    voucher_col: 4,
    voucher_col_cost: '109.09',
    first_entry_date: '2026-12-01',
    first_departure_date: '2026-12-10',
    double_entry_date: null,
    double_departure_date: null,
    multiple_entry_date: null,
    multiple_departure_date: null,
    list_of_cities: 'Moscow',
    list_of_hotels: 'Hotel Metropol',
    visa_applied_at: 'The Russian Embassy, 78 Canberra Avenue, Griffith ACT– CANBERRA AUSTRALIA',
    passport_file: 'clients/12/passport.pdf',
    comment: 'Plan: Tourist\nPlease hurry',
    company: null,
    position: null,
    address: null,
    city: null,
    state: null,
    postcode: null,
    country_id: null,
    company_phone: null,
    date_cls_received_all_items: null,
    date_submitted_for_processing: null,
    date_completed_and_received_at_cls: null,
    date_order_on_route_and_closed: null,
    ...overrides,
  });

beforeEach(() => {
  jest.clearAllMocks();
  order = makeOrder();
  details = makeDetails();

  mockModels.ClsOrder.findByPk.mockResolvedValue(order);
  mockModels.RussianVisaVoucherOrderDetails.findOne.mockResolvedValue(details);
  mockModels.RussianVisaVoucherTypes.findByPk.mockResolvedValue({
    type: 'tourist',
    name: 'Tourist Voucher',
    entry_option: 'Single Entry',
  });
  mockModels.UserClient.findByPk.mockResolvedValue({
    id: 12,
    fname: 'Jo',
    lname: 'Bloggs',
    email: 'jo@example.com',
    account_no: 'ACC-1',
    can_charge_cost_to_account: 0,
  });
  mockModels.OrderTravellerDetails.findAll.mockResolvedValue([
    {
      id: 1,
      is_primary: 1,
      title: 'Mr',
      first_name: 'Ivan',
      middle_name: null,
      last_name: 'Petrov',
      email: 'ivan@example.com',
      phone: '0411',
      date_of_birth: '1990-05-06',
      passport_number: 'P123',
      gender: 'male',
      passport_issue_date: '2020-01-01',
      passport_expiry_date: '2030-01-01',
      nationality: 5,
      citizenship: 5,
      passport_type: null,
      occupation: null,
      organisation: null,
    },
  ]);
  mockModels.ClsOrderDocuments.findAll.mockResolvedValue([
    { id: 8, order_id: 31, document: 'clients/12/scan.pdf', status: 0, created: '2026-09-01 10:01:00' },
  ]);
  mockModels.Countries.findAll.mockResolvedValue([{ id: 5, country_name: 'Australia' }]);
  mockModels.Payment.findOne.mockResolvedValue(null);
});

describe('pickVoucherMilestone', () => {
  const stored = {
    date_cls_received_all_items: null,
    date_submitted_for_processing: null,
    date_completed_and_received_at_cls: null,
    date_order_on_route_and_closed: null,
  };

  it('lets the first changed stamp decide when several move', () => {
    const picked = pickVoucherMilestone(stored, {
      submittedForProcessing: '2026-09-02 09:00:00',
      orderOnRouteAndClosed: '2026-09-05 09:00:00',
    });

    expect(picked?.scantype).toBe('second');
  });

  it('does not count a cleared stamp as a milestone', () => {
    const picked = pickVoucherMilestone(
      { ...stored, date_cls_received_all_items: '2026-09-01 08:00:00' },
      { allItemsReceivedAtCLS: null }
    );

    expect(picked).toBeNull();
  });

  it('ignores a stamp equal to the stored one', () => {
    const picked = pickVoucherMilestone(
      { ...stored, date_cls_received_all_items: '2026-09-01 08:00:00' },
      { allItemsReceivedAtCLS: '2026-09-01 08:00:00' }
    );

    expect(picked).toBeNull();
  });
});

describe('GET /voucher', () => {
  it('returns the legacy fields and the new-flow fields', async () => {
    const res = await request(app).get(base);
    const screen = res.body.voucher;

    expect(res.status).toBe(200);
    expect(screen.order).toMatchObject({
      id: 31,
      clientName: 'Jo Bloggs',
      totalFeeCents: 12000,
      departureDate: '2026-12-01',
    });
    expect(screen.voucher).toMatchObject({
      type: 'tourist',
      name: 'Tourist Voucher',
      entryOption: 'Single Entry',
      processing: { column: 4, label: '13 days processing' },
      costCents: 10909,
      firstEntryDate: '2026-12-01',
      listOfCities: 'Moscow',
      passportFile: { hasFile: true, name: 'passport.pdf' },
      employment: { provided: false },
    });
    expect(screen.applicants[0]).toMatchObject({
      firstName: 'Ivan',
      gender: 'male',
      dateOfBirth: '1990-05-06',
      nationality: 'Australia',
    });
    expect(screen.documents).toEqual([
      expect.objectContaining({ id: 8, name: 'scan.pdf' }),
    ]);
    expect(screen.payment.paymentStatus).toBeNull();
    expect(screen.voucher.visaAppliedAtOptions).toHaveLength(2);
  });

  it('is a 404 for an order that is not a voucher', async () => {
    mockModels.ClsOrder.findByPk.mockResolvedValue(makeOrder({ order_type: 5 }));

    expect((await request(app).get(base)).status).toBe(404);
  });
});

describe('PATCH /voucher/progress', () => {
  it('writes the changed stamps, audits the milestone and reports its scantype', async () => {
    const res = await request(app)
      .patch(`${base}/progress`)
      .send({ allItemsReceivedAtCLS: '2026-09-02T09:30:00', submittedForProcessing: '' });

    expect(res.status).toBe(200);
    expect(details.update).toHaveBeenCalledWith({
      date_cls_received_all_items: '2026-09-02 09:30:00',
    });
    expect(res.body.notification).toMatchObject({
      scantype: 'first',
      clientEmail: 'jo@example.com',
      clientFirstName: 'Jo',
    });
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      'voucher.received',
      expect.anything()
    );
  });

  it('writes nothing and sends no scantype when nothing changed', async () => {
    const res = await request(app).patch(`${base}/progress`).send({
      allItemsReceivedAtCLS: '',
      submittedForProcessing: '',
      completedReceivedAtCLS: '',
      orderOnRouteAndClosed: '',
    });

    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(false);
    expect(res.body.notification.scantype).toBe('');
    expect(details.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('moves the order to status 2 when the closed stamp is newly set', async () => {
    await request(app)
      .patch(`${base}/progress`)
      .send({ orderOnRouteAndClosed: '2026-09-09T10:00:00' });

    expect(order.update).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }));
  });

  it('leaves the status alone when the closed stamp was already set', async () => {
    details.date_order_on_route_and_closed = '2026-09-09 10:00:00' as never;
    order.status = 0;

    await request(app)
      .patch(`${base}/progress`)
      .send({ orderOnRouteAndClosed: '2026-09-09T10:00:00' });

    expect(order.update).not.toHaveBeenCalled();
  });

  it('rejects a stamp that is not a date', async () => {
    const res = await request(app)
      .patch(`${base}/progress`)
      .send({ allItemsReceivedAtCLS: 'tomorrow-ish' });

    expect(res.status).toBe(400);
  });
});

describe('GET /voucher/passport-file', () => {
  it('streams the stored file', async () => {
    mockOpenDocument.mockResolvedValue({
      stream: Readable.from([Buffer.from('pdf')]),
      bytes: 3,
      contentType: 'application/pdf',
      from: 'local',
      copies: ['local'],
    });

    const res = await request(app).get(`${base}/passport-file`);

    expect(res.status).toBe(200);
    expect(mockOpenDocument).toHaveBeenCalledWith('clients/12/passport.pdf');
  });

  it('is a 404 when the order has no passport file', async () => {
    details.passport_file = null as never;

    expect((await request(app).get(`${base}/passport-file`)).status).toBe(404);
  });
});

describe('GET /voucher/documents/:documentId/file', () => {
  it('refuses a document that belongs to another order', async () => {
    mockModels.ClsOrderDocuments.findByPk.mockResolvedValue({
      id: 8,
      order_id: 99,
      document: 'clients/1/x.pdf',
    });

    const res = await request(app).get(`${base}/documents/8/file`);

    expect(res.status).toBe(404);
    expect(mockOpenDocument).not.toHaveBeenCalled();
  });
});
