/**
 * The Public Visa admin order screen's writes, with the model layer mocked — no
 * database, nothing written anywhere.
 *
 * Each case pins a rule the legacy `viewPublicVisaAction` had (or should have had)
 * that a refactor could silently lose:
 *
 * - **Public visa only.** Any other order type is a 404, on reads and on writes.
 * - **One ticket per destination, and the destination must be this order's.** The
 *   destination table has no foreign key; the id in the URL is all there is.
 * - **An admin comment suppresses the client email and never reaches the client
 *   lane's attachments.**
 * - **Closed ⇒ status 2 only when every destination is closed.**
 * - **Lane gating** on comment edit/delete.
 * - **Processing location** is the first destination's and must be one of the
 *   locations offered for its visa type.
 * - **DHL** — a stored label is printed, a new one is never faked.
 * - **Viewing a Client Centre document** marks an uploaded one reviewed, and only that.
 */

const mockModel = () => ({
  findByPk: jest.fn(),
  findOne: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  destroy: jest.fn(),
  update: jest.fn(),
});

const mockModels = {
  AdditionalServices: mockModel(),
  ClsOrder: mockModel(),
  ClsOrderDestinations: mockModel(),
  ClsOrderDocuments: mockModel(),
  Countries: mockModel(),
  Documents: mockModel(),
  ManualPayment: mockModel(),
  OrderAdditionalServices: mockModel(),
  OrderCourierServiceDetails: mockModel(),
  OrderDestinationNotes: mockModel(),
  OrderFollowUpDate: mockModel(),
  OrderNotes: mockModel(),
  OrderReturnDocumentDetails: mockModel(),
  OrderTravellerDetails: mockModel(),
  PassportTypes: mockModel(),
  Payment: mockModel(),
  PublicVisaAdditionalRequirements: mockModel(),
  PublicVisaTypeLocations: mockModel(),
  PublicVisaTypes: mockModel(),
  UserAdmin: mockModel(),
  UserClient: mockModel(),
  VisaCourierOptions: mockModel(),
};

jest.mock('../../src/models', () => mockModels);

const mockDiscardDocument = jest.fn();
const mockOpenDocument = jest.fn();

jest.mock('../../src/shared/storage/documents', () => ({
  storedPathOf: (file: { key: string }) => file.key,
  discardDocument: (...args: unknown[]): unknown => mockDiscardDocument(...args),
  openDocument: (...args: unknown[]): unknown => mockOpenDocument(...args),
}));

jest.mock('../../src/middleware/upload', () => ({
  LEGALISATION_NOTE_FIELDS: { client: 'comment_attachment', admin: 'admin_attachment' },
  legalisationNoteUpload:
    () =>
    (
      req: { headers: Record<string, string | undefined>; files?: unknown },
      _res: unknown,
      next: () => void
    ) => {
      const header = req.headers['x-test-files'];
      req.files = header ? JSON.parse(header) : {};
      next();
    },
}));

import { Readable } from 'node:stream';
import express from 'express';
import request from 'supertest';
import {
  buildInvoiceLines,
  labelPdfFrom,
  parseTravelPurpose,
  publicVisaOrderRoutes,
} from '../../src/modules/admin/publicVisaOrder';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';

const audit = jest.fn(() => Promise.resolve());

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.auth = { sub: 7, aud: 'admin' } as never;
  next();
});
app.use('/api/admin/orders', publicVisaOrderRoutes(audit));
app.use(notFoundHandler);
app.use(errorHandler);

const base = '/api/admin/orders/10034100/public-visa';

/** A model-like row: its columns, plus a recording `update`/`destroy`. */
const row = <T extends object>(columns: T) => ({
  ...columns,
  update: jest.fn(function (this: T, patch: Partial<T>) {
    Object.assign(this, patch);
    return Promise.resolve(this);
  }),
  destroy: jest.fn(() => Promise.resolve()),
});

const makeOrder = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 10034100,
    order_no: '10034100',
    order_type: 6,
    client_id: 12,
    status: 1,
    is_bulk: 0,
    is_address_confirmed: 0,
    destination: 5,
    visa_type: '9',
    courier_service_id: null as number | null,
    contact_email: 'client@example.com',
    contact_first_name: 'Jo',
    contact_last_name: 'Bloggs',
    contact_phone: '0400',
    department: null as string | null,
    no_of_traveller: 1,
    date_submitted: '2026-09-01 10:00:00',
    departure_date: null,
    visa_cls_team_member: null as number | null,
    visa_is_delivered_to_embassy: 0,
    visa_is_delivered_to_embassy_date: null,
    visa_next_embassy: 'Spain',
    visa_fee: null,
    visa_application_fee: null,
    service_fee: '100.00',
    additional_service_fee: null,
    courier_service_fee: null,
    total_fee: '110.00',
    payment_status: 0,
    ...overrides,
  });

const makeDestination = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 26400,
    order_id: 10034100,
    country_id: 5,
    visa_type_id: 9,
    nationality: 1,
    entry_option: 2,
    process_location_id: null as number | null,
    visa_additional_requirement_id: null,
    visa_date_cls_received_all_items: null as string | null,
    visa_date_submitted_for_processing: null as string | null,
    visa_date_completed_and_received_at_cls: null as string | null,
    visa_date_order_on_route_and_closed: null as string | null,
    visa_shipped_by: null,
    visa_com_note_no: null,
    visa_com_note_in: null,
    visa_invoice_no: null,
    visa_follow_up_date: null as string | null,
    sig_name: null,
    signature: null as string | null,
    travel_purpose: null,
    dhl_shipment_validate_label: null as string | null,
    return_dhl_shipment_validate_label: null as string | null,
    ...overrides,
  });

const note = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 100,
    destination_id: 26400,
    note: 'hello',
    date_added: '2026-09-02 09:00:00',
    note_by: 7,
    note_by_name: 'Sam',
    user_type: 'Admin',
    is_pin: 0,
    is_admin: 0,
    attachment: null as string | null,
    ...overrides,
  });

let order: ReturnType<typeof makeOrder>;
let destination: ReturnType<typeof makeDestination>;

beforeEach(() => {
  jest.clearAllMocks();
  for (const model of Object.values(mockModels)) {
    for (const fn of Object.values(model)) fn.mockReset();
  }
  audit.mockImplementation(() => Promise.resolve());
  mockDiscardDocument.mockResolvedValue(undefined);

  order = makeOrder();
  destination = makeDestination();

  mockModels.ClsOrder.findByPk.mockResolvedValue(order);
  mockModels.ClsOrderDestinations.findByPk.mockResolvedValue(destination);
  mockModels.ClsOrderDestinations.findAll.mockResolvedValue([destination]);
  mockModels.ClsOrderDestinations.update.mockResolvedValue([1]);
  mockModels.UserAdmin.findByPk.mockResolvedValue({
    id: 7,
    fname: 'Sam',
    lname: 'Staff',
  });
  mockModels.UserAdmin.findOne.mockResolvedValue({ id: 3 });
  mockModels.UserAdmin.findAll.mockResolvedValue([]);
  mockModels.UserClient.findByPk.mockResolvedValue({
    fname: 'Jo',
    lname: 'Bloggs',
    email: 'account@example.com',
  });
  mockModels.Countries.findByPk.mockResolvedValue({
    id: 5,
    country_name: 'Spain',
    rep_name: 'Embassy of Spain',
  });
  mockModels.Countries.findAll.mockResolvedValue([]);
  mockModels.OrderDestinationNotes.findAll.mockResolvedValue([]);
  mockModels.OrderDestinationNotes.create.mockResolvedValue({});
  mockModels.OrderFollowUpDate.destroy.mockResolvedValue(1);
  mockModels.OrderFollowUpDate.findAll.mockResolvedValue([]);
  mockModels.OrderNotes.findAll.mockResolvedValue([]);
  for (const lookup of [
    mockModels.PublicVisaTypes,
    mockModels.PublicVisaAdditionalRequirements,
    mockModels.AdditionalServices,
    mockModels.PassportTypes,
    mockModels.Documents,
  ]) {
    lookup.findAll.mockResolvedValue([]);
  }
});

/** What `openDocument` resolves with — enough for `streamDocument`. */
const opened = () => ({
  stream: Readable.from(['x']),
  bytes: 1,
  contentType: 'application/pdf',
  from: 'local',
  copies: ['local'],
});

const files = (value: Record<string, { key: string }[]>) => JSON.stringify(value);

// ---------------------------------------------------------------------------

describe('public visa orders only', () => {
  it('404s the screen and a write for any other order type', async () => {
    mockModels.ClsOrder.findByPk.mockResolvedValue(makeOrder({ order_type: 9 }));

    await request(app).get(base).expect(404);
    await request(app).patch(`${base}/order`).send({ nextEmbassy: 'x' }).expect(404);
    await request(app).get(`${base}/invoice`).expect(404);
  });
});

describe('GET the screen', () => {
  it('assembles every panel for a one-destination order', async () => {
    mockModels.OrderTravellerDetails.findAll.mockResolvedValue([
      {
        id: 1,
        first_name: 'Jo',
        last_name: 'Bloggs',
        is_primary: 1,
        is_client: 0,
        nationality: 1,
        passport_number: 'P1',
      },
    ]);
    mockModels.OrderReturnDocumentDetails.findOne.mockResolvedValue({
      first_name: 'Jo',
      last_name: 'Bloggs',
      address: '1 Street',
      city: 'Canberra',
      state: 'ACT',
      postcode: '2600',
      email: 'ret@example.com',
      country_id: 1,
      additional_comment: 'Leave at door',
      returning_date: null,
    });
    mockModels.Payment.findOne.mockResolvedValue({ s_paid: 1, fname: 'Jo', lname: 'B' });
    mockModels.PublicVisaTypes.findAll.mockResolvedValue([{ id: 9, type: 'Tourist' }]);
    mockModels.PublicVisaTypes.findByPk.mockResolvedValue({ id: 9, type: 'Tourist' });
    mockModels.PublicVisaTypeLocations.findAll.mockResolvedValue([
      { id: 1, location: 'Canberra' },
    ]);
    mockModels.ClsOrderDocuments.findAll.mockResolvedValue([
      {
        id: 4,
        document: 'clients/12/passport.pdf',
        document_id: null,
        status: 1,
        modified: '2026-09-02 10:00:00',
      },
    ]);
    mockModels.OrderAdditionalServices.findAll.mockResolvedValue([]);
    mockModels.OrderNotes.findAll.mockResolvedValue([]);

    const res = await request(app).get(base).expect(200);
    const screen = res.body.data?.publicVisa ?? res.body.publicVisa;

    expect(screen.order.orderNo).toBe('10034100');
    expect(screen.destinations).toHaveLength(1);
    expect(screen.destinations[0].visaOptions.visaTypeName).toBe('Tourist');
    expect(screen.processLocation.options).toEqual([{ id: 1, location: 'Canberra' }]);
    expect(screen.newFlow.returnAddress.email).toBe('ret@example.com');
    expect(screen.newFlow.returnAddress.comment).toBe('Leave at door');
    expect(screen.documents[0]).toMatchObject({
      fileName: 'passport.pdf',
      hasFile: true,
    });
    expect(screen.options.shippedBy).toContain('Star Track');
  });
});

describe('a destination’s ticket', () => {
  it('lets the first changed stamp decide the milestone', async () => {
    const res = await request(app)
      .patch(`${base}/destinations/26400/ticket`)
      .send({
        allItemsReceivedAtCLS: '2026-10-01 09:00:00',
        submittedForProcessing: '2026-10-02 09:00:00',
      })
      .expect(200);

    const { notification } = res.body.data ?? res.body;
    expect(notification.scantype).toBe('first');
    expect(notification.suppress).toBe(false);
    expect(destination.visa_date_submitted_for_processing).toBe('2026-10-02 09:00:00');
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      'public-visa.received',
      expect.objectContaining({ destinationId: 26400 })
    );
  });

  it('suppresses the client email for an admin comment and keeps lane 1 out of the attachments', async () => {
    const res = await request(app)
      .patch(`${base}/destinations/26400/ticket`)
      .set(
        'x-test-files',
        files({
          comment_attachment: [{ key: 'notes/a.pdf' }],
          admin_attachment: [{ key: 'internal/secret.pdf' }],
        })
      )
      .send({ clientComment: 'Hi', adminComment: 'Private' })
      .expect(200);

    const { notification } = res.body.data ?? res.body;
    expect(notification.suppress).toBe(true);
    expect(notification.attachments).toEqual(['notes/a.pdf']);
    expect(mockModels.OrderDestinationNotes.create).toHaveBeenCalledWith(
      expect.objectContaining({ is_admin: 1, attachment: 'internal/secret.pdf' })
    );
    expect(mockModels.OrderDestinationNotes.create).toHaveBeenCalledWith(
      expect.objectContaining({ is_admin: 0, attachment: 'notes/a.pdf' })
    );
  });

  it('refuses an attachment with no comment and throws the files away', async () => {
    await request(app)
      .patch(`${base}/destinations/26400/ticket`)
      .set('x-test-files', files({ comment_attachment: [{ key: 'notes/a.pdf' }] }))
      .send({})
      .expect(400);

    expect(mockDiscardDocument).toHaveBeenCalledWith('notes/a.pdf');
  });

  it('404s a destination that belongs to another order, and discards the files', async () => {
    mockModels.ClsOrderDestinations.findByPk.mockResolvedValue(
      makeDestination({ order_id: 999 })
    );

    await request(app)
      .patch(`${base}/destinations/26400/ticket`)
      .set('x-test-files', files({ comment_attachment: [{ key: 'notes/a.pdf' }] }))
      .send({ clientComment: 'Hi' })
      .expect(404);

    expect(mockDiscardDocument).toHaveBeenCalledWith('notes/a.pdf');
    expect(mockModels.OrderDestinationNotes.create).not.toHaveBeenCalled();
  });

  it('moves the order to status 2 only when every destination is closed', async () => {
    const other = makeDestination({ id: 26401 });
    mockModels.ClsOrderDestinations.findAll.mockResolvedValue([destination, other]);

    await request(app)
      .patch(`${base}/destinations/26400/ticket`)
      .send({ orderOnRouteAndClosed: '2026-10-05 09:00:00' })
      .expect(200);
    expect(order.status).toBe(1);

    other.visa_date_order_on_route_and_closed = '2026-10-04 09:00:00';
    await request(app)
      .patch(`${base}/destinations/26400/ticket`)
      .send({ orderOnRouteAndClosed: '2026-10-06 09:00:00' })
      .expect(200);
    expect(order.status).toBe(2);
  });
});

describe('the order-level row', () => {
  it('refuses a processing location that is not offered for the visa type', async () => {
    mockModels.PublicVisaTypeLocations.findOne.mockResolvedValue(null);

    await request(app)
      .patch(`${base}/order`)
      .send({ processLocationId: '77' })
      .expect(400);
    expect(destination.update).not.toHaveBeenCalled();
  });

  it('writes the processing location to the first destination', async () => {
    mockModels.PublicVisaTypeLocations.findOne.mockResolvedValue({ id: 3 });

    await request(app)
      .patch(`${base}/order`)
      .send({ processLocationId: '3' })
      .expect(200);
    expect(destination.update).toHaveBeenCalledWith({ process_location_id: 3 });
  });

  it('replaces this admin’s follow-up rows and mirrors the date to every destination', async () => {
    await request(app)
      .patch(`${base}/order`)
      .send({ followUpDate: '2026-11-02' })
      .expect(200);

    expect(mockModels.OrderFollowUpDate.destroy).toHaveBeenCalledWith({
      where: { order_id: 10034100, admin_id: 7 },
    });
    expect(mockModels.OrderFollowUpDate.create).toHaveBeenCalledWith(
      expect.objectContaining({ admin_id: 7, follow_up_date: '2026-11-02 00:00:00' })
    );
    expect(mockModels.ClsOrderDestinations.update).toHaveBeenCalledWith(
      { visa_follow_up_date: '2026-11-02' },
      { where: { order_id: 10034100 } }
    );
  });

  it('saves the team member, embassy strip and next embassy on the order', async () => {
    await request(app)
      .patch(`${base}/order`)
      .send({
        clsTeamMember: '3',
        deliveredToEmbassy: '1',
        embassyDeliveredDate: '2026-10-09',
        nextEmbassy: 'Italy',
      })
      .expect(200);

    expect(order.visa_cls_team_member).toBe(3);
    expect(order.visa_is_delivered_to_embassy).toBe(1);
    expect(order.visa_is_delivered_to_embassy_date).toBe('2026-10-09');
    expect(order.visa_next_embassy).toBe('Italy');
  });
});

describe('the document tracker', () => {
  it('scopes “remove” to this order', async () => {
    mockModels.OrderNotes.destroy.mockResolvedValue(2);

    await request(app).delete(`${base}/tracking?documentType=Passport`).expect(200);
    expect(mockModels.OrderNotes.destroy).toHaveBeenCalledWith({
      where: { order_no: 10034100, document_type: 'Passport' },
    });
  });

  it('refuses a location that is not in the region’s list', async () => {
    await request(app)
      .post(`${base}/tracking`)
      .send({
        rows: [
          { documentType: 'Passport', location: 'Moon', price: '5', status: 'Received' },
        ],
      })
      .expect(400);
  });

  it('refuses to delete a row that belongs to another order', async () => {
    mockModels.OrderNotes.findByPk.mockResolvedValue(row({ id: 9, order_no: 777 }));

    await request(app).delete(`${base}/tracking/9`).expect(404);
  });
});

describe('comments', () => {
  it('will not edit a client’s own reply', async () => {
    mockModels.OrderDestinationNotes.findByPk.mockResolvedValue(
      note({ user_type: 'Client' })
    );

    await request(app)
      .patch(`${base}/comments/100`)
      .send({ comment: 'changed' })
      .expect(403);
  });

  it('will not touch a note on another order’s destination', async () => {
    mockModels.OrderDestinationNotes.findByPk.mockResolvedValue(
      note({ destination_id: 555 })
    );

    await request(app).delete(`${base}/comments/100`).expect(404);
  });

  it('lets staff edit and delete their own, either lane', async () => {
    const internal = note({ is_admin: 1 });
    mockModels.OrderDestinationNotes.findByPk.mockResolvedValue(internal);

    await request(app).patch(`${base}/comments/100`).send({ comment: 'new' }).expect(200);
    expect(internal.note).toBe('new');

    await request(app).delete(`${base}/comments/100`).expect(200);
    expect(internal.destroy).toHaveBeenCalled();
  });

  it('streams an attachment of either lane', async () => {
    mockModels.OrderDestinationNotes.findByPk.mockResolvedValue(
      note({ is_admin: 1, attachment: 'internal/secret.pdf' })
    );
    mockOpenDocument.mockResolvedValue(opened());

    await request(app).get(`${base}/comments/100/attachment`).expect(200);
  });
});

describe('DHL', () => {
  const pdf = Buffer.from('%PDF-1.4 label').toString('base64');
  const xml = `<res:ShipmentResponse><LabelImage><OutputImage>${pdf}</OutputImage></LabelImage></res:ShipmentResponse>`;

  it('decodes a stored label out of DHL’s response', () => {
    expect(labelPdfFrom(xml)?.subarray(0, 4).toString()).toBe('%PDF');
    expect(labelPdfFrom('<x><OutputImage>bm90IGEgcGRm</OutputImage></x>')).toBeNull();
    expect(labelPdfFrom(null)).toBeNull();
  });

  it('prints the stored pickup label and 404s when there is none', async () => {
    destination.dhl_shipment_validate_label = xml;

    const printed = await request(app).get(`${base}/dhl-label/pickup`).expect(200);
    expect(printed.headers['content-type']).toContain('application/pdf');

    await request(app).get(`${base}/dhl-label/return`).expect(404);
  });

  it('runs the legacy checks, then says it is not connected — never a fake label', async () => {
    // Not a DHL courier.
    order.courier_service_id = 14;
    mockModels.VisaCourierOptions.findByPk.mockResolvedValue({ s_dhl: 0 });
    mockModels.OrderReturnDocumentDetails.findOne.mockResolvedValue({ state: 'NSW' });
    await request(app).post(`${base}/dhl/inbound`).expect(409);

    // A return to ACT is hand-delivered.
    mockModels.VisaCourierOptions.findByPk.mockResolvedValue({ s_dhl: 1 });
    mockModels.OrderReturnDocumentDetails.findOne.mockResolvedValue({ state: 'ACT' });
    await request(app).post(`${base}/dhl/inbound`).expect(409);

    // Everything legacy checked passes: the live API is the part that is missing.
    mockModels.OrderReturnDocumentDetails.findOne.mockResolvedValue({ state: 'NSW' });
    const res = await request(app).post(`${base}/dhl/inbound`).expect(503);
    expect(JSON.stringify(res.body)).toContain('not connected');

    // Outbound needs the address confirmed first.
    await request(app).post(`${base}/dhl/outbound`).expect(409);
  });

  it('saves the shipping-details modal to both rows, creating them when missing', async () => {
    mockModels.OrderCourierServiceDetails.findOne.mockResolvedValue(null);
    mockModels.OrderReturnDocumentDetails.findOne.mockResolvedValue(null);

    const person = {
      company: '',
      firstName: 'Jo',
      lastName: 'Bloggs',
      contactNumber: '0400',
      address: '1 Street',
      city: 'Sydney',
      state: 'NSW',
      postcode: '2000',
    };
    await request(app)
      .patch(`${base}/dhl-details`)
      .send({
        pickup: {
          ...person,
          date: '2026-10-10',
          readyHour: '09',
          readyMinute: '30',
          closeHour: '17',
          closeMinute: '0',
        },
        return: person,
      })
      .expect(200);

    expect(mockModels.OrderCourierServiceDetails.create).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: 10034100, courier_pickup_city: 'Sydney' })
    );
    expect(mockModels.OrderReturnDocumentDetails.create).toHaveBeenCalledWith(
      expect.objectContaining({ order_id: 10034100, first_name: 'Jo' })
    );
  });
});

describe('Client Centre documents', () => {
  it('marks an uploaded document reviewed when it is opened', async () => {
    const uploaded = row({ id: 4, order_id: 10034100, document: 'a.pdf', status: 1 });
    mockModels.ClsOrderDocuments.findByPk.mockResolvedValue(uploaded);
    mockOpenDocument.mockResolvedValue(opened());

    await request(app).get(`${base}/documents/4/file`).expect(200);
    expect(uploaded.status).toBe(2);
  });

  it('leaves a reviewer’s verdict alone, and refuses another order’s document', async () => {
    const approved = row({ id: 5, order_id: 10034100, document: 'a.pdf', status: 4 });
    mockModels.ClsOrderDocuments.findByPk.mockResolvedValue(approved);
    mockOpenDocument.mockResolvedValue(opened());

    await request(app).get(`${base}/documents/5/file`).expect(200);
    expect(approved.status).toBe(4);

    mockModels.ClsOrderDocuments.findByPk.mockResolvedValue(
      row({ id: 6, order_id: 1, document: 'a.pdf', status: 1 })
    );
    await request(app).get(`${base}/documents/6/file`).expect(404);
  });
});

describe('status and address confirmation', () => {
  it('saves both selects, and refuses when there is no payment row', async () => {
    mockModels.Payment.findOne.mockResolvedValue(null);
    await request(app)
      .patch(`${base}/status`)
      .send({ orderStatus: 2, paymentStatus: 1 })
      .expect(409);
    expect(order.status).toBe(1);

    const payment = row({ s_paid: 0 });
    mockModels.Payment.findOne.mockResolvedValue(payment);
    await request(app)
      .patch(`${base}/status`)
      .send({ orderStatus: 2, paymentStatus: 1 })
      .expect(200);
    expect(order.status).toBe(2);
    expect(payment.s_paid).toBe(1);
  });

  it('discards the notification only when it is the unseen kind', async () => {
    order.is_address_confirmed = 1;
    await request(app).post(`${base}/address-confirmation/acknowledge`).expect(200);
    expect(order.is_address_confirmed).toBe(2);

    order.is_address_confirmed = 0;
    await request(app).post(`${base}/address-confirmation/acknowledge`).expect(200);
    expect(order.is_address_confirmed).toBe(0);
  });
});

describe('print sheets and the invoice', () => {
  it('needs a destination and a traveller for a label, and checks both are this order’s', async () => {
    await request(app).get(`${base}/print/traveller-label`).expect(400);

    mockModels.OrderTravellerDetails.findByPk.mockResolvedValue({
      id: 3,
      order_id: 4242,
      first_name: 'A',
      last_name: 'B',
    });
    await request(app)
      .get(`${base}/print/traveller-label?destination=26400&traveller=3`)
      .expect(404);
  });

  it('prints one embassy sheet per destination', async () => {
    mockModels.ClsOrderDestinations.findAll.mockResolvedValue([
      destination,
      makeDestination({ id: 26401, country_id: 6 }),
    ]);
    mockModels.Countries.findAll.mockResolvedValue([
      { id: 5, country_name: 'Spain', rep_name: 'Embassy of Spain' },
      { id: 6, country_name: 'Italy', rep_name: 'Embassy of Italy' },
    ]);

    const res = await request(app).get(`${base}/print/embassy-to-from`).expect(200);
    const { print } = res.body.data ?? res.body;
    expect(print.embassies.map((e: { country: string }) => e.country)).toEqual([
      'Spain',
      'Italy',
    ]);
  });

  it('builds the invoice from the order’s fee columns by the legacy arithmetic', () => {
    const { lines, source } = buildInvoiceLines({
      items: null,
      destinations: [{ requirements: ['Express'] }],
      travellers: 2,
      serviceFee: '100.00',
      applicationFee: '40.00',
      additionalFee: '10.00',
      courierFee: '20.00',
      additionalServiceTitles: ['Photos'],
      courierName: 'DHL',
    });

    expect(source).toBe('order-fees');
    // Service fee: 100 x 2 + 10% GST.
    expect(lines[0]).toMatchObject({ quantity: 2, totalCents: 22000, gst: '10%' });
    // Application fee: no GST, not multiplied.
    expect(lines[1]).toMatchObject({ totalCents: 4000, gst: '0%', detail: ['Express'] });
    // Additional services: 10 x 2 + 10%.
    expect(lines[2]).toMatchObject({ totalCents: 2200, detail: ['Photos'] });
    // Courier: 20 + 10%.
    expect(lines[3]).toMatchObject({ description: 'Courier Fee: DHL', totalCents: 2200 });
  });

  it('prefers the manual-payment items when there are any', () => {
    const { lines, source } = buildInvoiceLines({
      items: [{ description: 'Hand-priced', price: '50', quantity: 2 }],
      destinations: [{ requirements: [] }],
      travellers: 1,
      serviceFee: '100',
      applicationFee: null,
      additionalFee: null,
      courierFee: null,
      additionalServiceTitles: [],
      courierName: null,
    });

    expect(source).toBe('manual-items');
    expect(lines).toEqual([
      expect.objectContaining({ description: 'Hand-priced', totalCents: 11000 }),
    ]);
  });

  it('returns a paid order’s invoice with nothing due', async () => {
    mockModels.OrderTravellerDetails.findAll.mockResolvedValue([
      { first_name: 'Jo', last_name: 'Bloggs' },
    ]);
    mockModels.Payment.findOne.mockResolvedValue({ s_paid: 1 });
    mockModels.ManualPayment.findOne.mockResolvedValue(null);
    mockModels.OrderAdditionalServices.findAll.mockResolvedValue([]);

    const res = await request(app).get(`${base}/invoice`).expect(200);
    const { invoice } = res.body.data ?? res.body;
    expect(invoice.balanceDueCents).toBe(0);
    expect(invoice.paymentStatus).toBe('Success');
    expect(invoice.totalCents).toBeGreaterThan(0);
  });
});

describe('parseTravelPurpose', () => {
  it('reads the corporate journey’s labelled lines back out, and keeps the rest', () => {
    expect(
      parseTravelPurpose(
        [
          'Visa category: business',
          'Length of stay: 90 days',
          'Entry: multiple',
          'Account: 1234',
          'PO: PO-9',
          'Two staff travelling.',
          'Please call first.',
        ].join('\n')
      )
    ).toEqual({
      visaCategory: 'business',
      lengthOfStay: '90 days',
      entryType: 'multiple',
      account: '1234',
      purchaseOrder: 'PO-9',
      description: 'Two staff travelling.\nPlease call first.',
    });
  });

  it('treats a legacy free-text purpose as the description', () => {
    expect(parseTravelPurpose('Tourism')).toMatchObject({
      visaCategory: null,
      description: 'Tourism',
    });
    expect(parseTravelPurpose(null).description).toBeNull();
  });
});
