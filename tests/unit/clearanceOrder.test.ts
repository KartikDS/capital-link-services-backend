/**
 * The Police Clearance admin order screen, with the model layer mocked — no
 * database, nothing written anywhere.
 *
 * What is pinned, each a rule the legacy `viewPoliceClearanceAction` had that a
 * refactor could silently lose:
 *
 * - **Milestone priority** (received, submitted, completed, closed) and that a
 *   cleared stamp is a correction rather than a milestone.
 * - **The ticket comment lands in `tbl_order_notes`** on the client-facing lane,
 *   not under the order id in `tbl_order_destination_notes` (where it would
 *   collide with a legalisation destination id).
 * - **A closed stamp confirms the order** (`status = 2`).
 * - **Only clearance orders** — anything else is a 404.
 * - **Ownership of the document id** in the URL, and **no card data** in the read.
 * - The shared payment state (`orderPayment`) is embedded for the Payment Details block.
 */

const mockModel = () => ({
  findByPk: jest.fn(),
  findOne: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  destroy: jest.fn(),
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
  PoliceClearanceOrderDetails: mockModel(),
  PoliceClearances: mockModel(),
  UserAdmin: mockModel(),
  UserClient: mockModel(),
  VisaCourierOptions: mockModel(),
};

jest.mock('../../src/models', () => mockModels);

jest.mock('../../src/modules/admin/orderPayment', () => ({
  readPaymentState: () => Promise.resolve({ hasPayment: false, paymentStatus: null }),
}));

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
  clearanceOrderRoutes,
  pickClearanceMilestone,
  purposeOf,
} from '../../src/modules/admin/clearanceOrder';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';

const audit = jest.fn(() => Promise.resolve());

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.auth = { sub: 7, aud: 'admin' } as never;
  next();
});
app.use('/api/admin/orders', clearanceOrderRoutes(audit));
app.use(notFoundHandler);
app.use(errorHandler);

const base = '/api/admin/orders/10034100/clearance';

const row = <T extends object>(columns: T) => ({
  ...columns,
  update: jest.fn(function (this: T, patch: Partial<T>) {
    Object.assign(this, patch);
    return Promise.resolve(this);
  }),
  destroy: jest.fn(() => Promise.resolve()),
});

let order: ReturnType<typeof makeOrder>;
let details: ReturnType<typeof makeDetails>;

const makeOrder = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 10034100,
    order_no: '10034100',
    order_type: 5,
    client_id: 12,
    status: 0,
    destination: 14,
    police_clearance_id: 3,
    courier_service_id: null as number | null,
    no_of_traveller: 1,
    contact_email: 'client@example.com',
    contact_first_name: 'Jo',
    contact_last_name: 'Bloggs',
    contact_phone: '0400',
    department: null,
    departure_date: null,
    service_fee: '120.00',
    total_fee: '132.00',
    date_submitted: '2026-10-01 08:55:54',
    visa_cls_team_member: null as number | null,
    ...overrides,
  });

const makeDetails = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 1,
    order_id: 10034100,
    clearance_price: '120.00',
    basic_additional_price: '0.00',
    clearance_additional_price: '0.00',
    date_cls_received_all_items: null as string | null,
    date_submitted_for_processing: null as string | null,
    date_completed_and_received_at_cls: null as string | null,
    date_order_on_route_and_closed: null as string | null,
    ...overrides,
  });

beforeEach(() => {
  jest.clearAllMocks();
  for (const model of Object.values(mockModels)) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  audit.mockImplementation(() => Promise.resolve());

  order = makeOrder();
  details = makeDetails();

  mockModels.ClsOrder.findByPk.mockResolvedValue(order);
  mockModels.PoliceClearanceOrderDetails.findOne.mockResolvedValue(details);
  mockModels.PoliceClearances.findByPk.mockResolvedValue({ name: 'SAPS Clearance Certificate' });
  mockModels.UserAdmin.findByPk.mockResolvedValue({ id: 7, fname: 'Sam', lname: 'Staff' });
  mockModels.UserAdmin.findOne.mockResolvedValue({ id: 3 });
  mockModels.UserAdmin.findAll.mockResolvedValue([{ id: 3, fname: 'Tess', lname: 'Team' }]);
  mockModels.UserClient.findByPk.mockResolvedValue({
    fname: 'Jo',
    lname: 'Bloggs',
    email: 'account@example.com',
    account_no: '1234567',
  });
  mockModels.Countries.findByPk.mockResolvedValue({ id: 14, country_name: 'South Africa' });
  mockModels.OrderNotes.findAll.mockResolvedValue([]);
  mockModels.OrderNotes.create.mockResolvedValue({});
  mockModels.OrderTravellerDetails.findAll.mockResolvedValue([]);
  mockModels.OrderReturnDocumentDetails.findOne.mockResolvedValue(null);
  mockModels.ClsOrderDocuments.findAll.mockResolvedValue([]);
  mockModels.Payment.findOne.mockResolvedValue(null);
});

describe('milestone priority', () => {
  const stored = {
    date_cls_received_all_items: null,
    date_submitted_for_processing: null,
    date_completed_and_received_at_cls: null,
    date_order_on_route_and_closed: null,
  };

  it('lets the first changed stamp win, falls through when unchanged', () => {
    expect(
      pickClearanceMilestone(stored, {
        allItemsReceivedAtCLS: '2026-10-01 09:00:00',
        orderOnRouteAndClosed: '2026-10-05 09:00:00',
      })?.scantype
    ).toBe('first');
    expect(
      pickClearanceMilestone(
        { ...stored, date_cls_received_all_items: '2026-10-01 09:00:00' },
        {
          allItemsReceivedAtCLS: '2026-10-01 09:00:00',
          completedReceivedAtCLS: '2026-10-03 09:00:00',
          orderOnRouteAndClosed: '2026-10-05 09:00:00',
        }
      )?.scantype
    ).toBe('third');
  });

  it('does not treat a cleared stamp as a milestone', () => {
    expect(
      pickClearanceMilestone(
        { ...stored, date_cls_received_all_items: '2026-10-01 09:00:00' },
        { allItemsReceivedAtCLS: null }
      )
    ).toBeNull();
  });
});

describe('PATCH /ticket', () => {
  it('writes the stamps to the clearance details and reports the scantype', async () => {
    const response = await request(app).patch(`${base}/ticket`).send({
      allItemsReceivedAtCLS: '2026-10-01T09:00:00',
      submittedForProcessing: '2026-10-02T09:00:00',
    });

    expect(response.status).toBe(200);
    expect(response.body.notification.scantype).toBe('first');
    expect(details.update).toHaveBeenCalledWith({
      date_cls_received_all_items: '2026-10-01 09:00:00',
      date_submitted_for_processing: '2026-10-02 09:00:00',
    });
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      'clearance.received',
      expect.objectContaining({ scantype: 'first' })
    );
  });

  it('files a ticket comment in tbl_order_notes on the client lane', async () => {
    const response = await request(app)
      .patch(`${base}/ticket`)
      .send({ ticketComments: '  We need a clearer scan.  ' });

    expect(response.status).toBe(200);
    expect(mockModels.OrderNotes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        order_no: 10034100,
        note: 'We need a clearer scan.',
        user_type: 'Admin',
        is_admin: 0,
        note_by_name: 'Sam',
      })
    );
    expect(response.body.notification.clientComment).toBe('We need a clearer scan.');
    expect(response.body.notification.scantype).toBe('');
  });

  it('writes no note for an empty comment box', async () => {
    await request(app).patch(`${base}/ticket`).send({ ticketComments: '   ' });

    expect(mockModels.OrderNotes.create).not.toHaveBeenCalled();
  });

  it('confirms the order when the closed stamp is set', async () => {
    const response = await request(app)
      .patch(`${base}/ticket`)
      .send({ orderOnRouteAndClosed: '2026-10-05T09:00:00' });

    expect(response.status).toBe(200);
    expect(response.body.notification.scantype).toBe('fourth');
    expect(order.update).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }));
  });

  it('refuses a team member who is not on the roster', async () => {
    mockModels.UserAdmin.findOne.mockResolvedValue(null);

    const response = await request(app).patch(`${base}/ticket`).send({ clsTeamMember: '99' });

    expect(response.status).toBe(400);
    expect(details.update).not.toHaveBeenCalled();
  });

  it('refuses an unreadable date before writing anything', async () => {
    const response = await request(app)
      .patch(`${base}/ticket`)
      .send({ allItemsReceivedAtCLS: 'yesterday' });

    expect(response.status).toBe(400);
    expect(details.update).not.toHaveBeenCalled();
  });

  it('is a 404 for an order that is not a police clearance', async () => {
    order.order_type = 9;

    const response = await request(app).patch(`${base}/ticket`).send({});

    expect(response.status).toBe(404);
  });
});

describe('GET /clearance', () => {
  it('assembles the legacy panels and the new-flow ones, with no card data', async () => {
    mockModels.OrderNotes.findAll.mockResolvedValue([
      row({
        id: 5,
        note: 'Purpose: visa-application',
        note_by_name: 'Website order form',
        user_type: 'client',
        date_added: '2026-10-01 08:55:54',
      }),
    ]);
    mockModels.OrderTravellerDetails.findAll.mockResolvedValue([
      {
        id: 9,
        is_primary: 1,
        first_name: 'Maria',
        middle_name: null,
        last_name: 'Silva',
        email: 'm@example.com',
        phone: '0411',
        passport_number: 'P123',
        nationality: 14,
        date_of_birth: '1990-02-03',
        passport_issue_date: '2020-01-01',
        passport_expiry_date: '2030-01-01',
      },
    ]);
    mockModels.Countries.findAll.mockResolvedValue([{ id: 14, country_name: 'South Africa' }]);
    mockModels.OrderReturnDocumentDetails.findOne.mockResolvedValue({
      company: 'Acme',
      address: '1 Main St',
      city: 'Canberra',
      state: 'ACT',
      postcode: '2600',
      first_name: 'Maria',
      last_name: 'Silva',
      contact_number: '0411',
      email: 'client@example.com',
      country_id: null,
      returning_date: null,
      additional_comment: 'Purpose: visa-application',
    });
    mockModels.Payment.findOne.mockResolvedValue({
      s_paid: 1,
      transaction_id: 'pi_1',
      date_paid: '2026-10-01 09:00:00',
      total_order_price: 132,
      card_type: 1,
      fname: 'Jo',
      lname: 'Bloggs',
      card_number: '4242424242424242',
      ccv_number: '123',
    });

    const response = await request(app).get(base);

    expect(response.status).toBe(200);
    const screen = response.body.clearance;
    expect(screen.order.clearanceType).toBe('SAPS Clearance Certificate');
    expect(screen.order.accountNumber).toBe('1234567');
    expect(screen.history[0].body).toBe('Purpose: visa-application');
    expect(screen.requirements.purposeId).toBe('visa-application');
    expect(screen.requirements.requestingCountry).toBe('South Africa');
    expect(screen.applicants[0].passportExpiryDate).toBe('2030-01-01');
    expect(screen.applicants[0].nationality).toBe('South Africa');
    expect(screen.returnDocument.hasAddress).toBe(true);
    expect(screen.pricing.totalFeeCents).toBe(13200);
    expect(screen.payment.status).toBe(1);
    expect(screen.paymentState.hasPayment).toBe(false);
    expect(JSON.stringify(screen)).not.toContain('4242');
    expect(JSON.stringify(screen)).not.toContain('ccv');
  });

  it('reads the purpose from the first note that has one', () => {
    expect(purposeOf([row({ note: 'hello' }) as never, row({ note: 'a\nPurpose: study' }) as never])).toBe(
      'study'
    );
    expect(purposeOf([])).toBeNull();
  });
});

describe('GET /documents/:documentId/file', () => {
  it('serves a document that belongs to this order', async () => {
    mockModels.ClsOrderDocuments.findByPk.mockResolvedValue({
      id: 4,
      order_id: 10034100,
      document: '12/10034100/passport.pdf',
    });
    mockOpenDocument.mockResolvedValue({
      stream: Readable.from([Buffer.from('pdf')]),
      bytes: 3,
      from: 'local',
      copies: ['local'],
      contentType: 'application/pdf',
    });

    const response = await request(app).get(`${base}/documents/4/file`);

    expect(response.status).toBe(200);
    expect(response.headers['content-disposition']).toContain('passport.pdf');
  });

  it("is a 404 for another order's document", async () => {
    mockModels.ClsOrderDocuments.findByPk.mockResolvedValue({
      id: 4,
      order_id: 999,
      document: 'x.pdf',
    });

    const response = await request(app).get(`${base}/documents/4/file`);

    expect(response.status).toBe(404);
    expect(mockOpenDocument).not.toHaveBeenCalled();
  });
});
