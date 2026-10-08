/**
 * The shared admin payment actions — Order Status, Payment Status, Account Number,
 * Pay Now and the invoice data — with the model layer mocked. Nothing is read from
 * or written to a database.
 *
 * What is pinned, and why:
 *
 * - **Pay Now on account keeps the legacy refusals and their wording**: no account
 *   terms, and a number that does not match.
 * - **Card is not a method.** The schema refuses it rather than pretending.
 * - **An order already paid is not paid twice.**
 * - **A refused status save leaves nothing half-written** — the legacy form saved
 *   the order status and then fatalled on a missing payment row.
 * - **One audit line per value that actually changed.**
 */

const mockModel = () => ({
  findByPk: jest.fn(),
  findOne: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
});

const mockModels = {
  ClsOrder: mockModel(),
  OrderTravellerDetails: mockModel(),
  Payment: mockModel(),
  PoliceClearances: mockModel(),
  RussianVisaVoucherTypes: mockModel(),
  UserClient: mockModel(),
};

jest.mock('../../src/models', () => mockModels);

import express from 'express';
import request from 'supertest';
import { orderPaymentRoutes } from '../../src/modules/admin/orderPayment';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';

const audit = jest.fn(() => Promise.resolve());

const app = express();
app.use(express.json());
app.use('/api/admin/orders', orderPaymentRoutes(audit));
app.use(notFoundHandler);
app.use(errorHandler);

const base = '/api/admin/orders/31/payment';

const row = <T extends object>(columns: T) => ({
  ...columns,
  update: jest.fn(function (this: T, patch: Partial<T>) {
    Object.assign(this, patch);
    return Promise.resolve(this);
  }),
});

let order: ReturnType<typeof makeOrder>;
let client: ReturnType<typeof makeClient>;
let payment: ReturnType<typeof makePayment>;

const makeOrder = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 31,
    order_no: '31',
    order_type: 8,
    client_id: 12,
    status: 1,
    payment_status: 0,
    total_fee: '120.00',
    russian_visa_voucher_id: null as number | null,
    police_clearance_id: null as number | null,
    contact_first_name: 'Jo',
    contact_last_name: 'Bloggs',
    contact_email: 'jo@example.com',
    contact_phone: '0400',
    date_submitted: '2026-09-01 10:00:00',
    ...overrides,
  });

const makeClient = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 12,
    fname: 'Jo',
    lname: 'Bloggs',
    email: 'jo@example.com',
    account_no: 'ACC-1',
    can_charge_cost_to_account: 1,
    ...overrides,
  });

const makePayment = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 5,
    s_paid: 0,
    payment_status: 0,
    total_order_price: null,
    date_paid: null,
    transaction_id: null,
    account_no: null,
    fname: null,
    lname: null,
    email: null,
    phone: null,
    ...overrides,
  });

beforeEach(() => {
  jest.clearAllMocks();
  order = makeOrder();
  client = makeClient();
  payment = makePayment();

  mockModels.ClsOrder.findByPk.mockResolvedValue(order);
  mockModels.UserClient.findByPk.mockResolvedValue(client);
  mockModels.Payment.findOne.mockResolvedValue(payment);
  mockModels.Payment.findAll.mockResolvedValue([]);
  mockModels.Payment.create.mockImplementation((values: object) =>
    Promise.resolve(makePayment({ id: 9, ...values }))
  );
  mockModels.OrderTravellerDetails.findOne.mockResolvedValue(null);
});

describe('GET /payment', () => {
  it('reports the statuses, the account number and the total', async () => {
    const res = await request(app).get(base);

    expect(res.status).toBe(200);
    expect(res.body.payment).toMatchObject({
      orderId: 31,
      orderStatus: 1,
      paymentStatus: 0,
      accountNumber: 'ACC-1',
      canChargeToAccount: true,
      totalCents: 12000,
      hasPayment: true,
    });
  });

  it('says there is no payment status when no payment row exists', async () => {
    mockModels.Payment.findOne.mockResolvedValue(null);

    const res = await request(app).get(base);

    expect(res.body.payment.paymentStatus).toBeNull();
    expect(res.body.payment.hasPayment).toBe(false);
  });

  it('is a 404 for an order that does not exist', async () => {
    mockModels.ClsOrder.findByPk.mockResolvedValue(null);

    expect((await request(app).get(base)).status).toBe(404);
  });
});

describe('PATCH /payment/status', () => {
  it('writes the changed values and audits each once', async () => {
    const res = await request(app)
      .patch(`${base}/status`)
      .send({ orderStatus: 2, paymentStatus: 1, accountNumber: 'NEW-9' });

    expect(res.status).toBe(200);
    expect(order.update).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }));
    expect(payment.update).toHaveBeenCalledWith({ s_paid: 1 });
    expect(client.update).toHaveBeenCalledWith({ account_no: 'NEW-9' });
    expect(audit.mock.calls.map((call) => (call as unknown[])[1])).toEqual([
      'order.status',
      'order.payment-status',
      'client.update',
    ]);
  });

  it('audits nothing when nothing changed', async () => {
    const res = await request(app)
      .patch(`${base}/status`)
      .send({ orderStatus: 1, paymentStatus: 0, accountNumber: 'ACC-1' });

    expect(res.status).toBe(200);
    expect(order.update).not.toHaveBeenCalled();
    expect(payment.update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it('refuses a payment status with no payment row, saving nothing', async () => {
    mockModels.Payment.findOne.mockResolvedValue(null);

    const res = await request(app)
      .patch(`${base}/status`)
      .send({ orderStatus: 2, paymentStatus: 1 });

    expect(res.status).toBe(409);
    expect(order.update).not.toHaveBeenCalled();
  });

  it('rejects an order status outside 0..2', async () => {
    const res = await request(app).patch(`${base}/status`).send({ orderStatus: 7 });

    expect(res.status).toBe(400);
  });
});

describe('POST /payment/pay-now', () => {
  it('refuses on account when the client has no account terms', async () => {
    client.can_charge_cost_to_account = 0;

    const res = await request(app)
      .post(`${base}/pay-now`)
      .send({ method: 'account', accountNumber: 'ACC-1' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('You are not allowed to Pay on Account!');
    expect(mockModels.Payment.create).not.toHaveBeenCalled();
  });

  it('refuses on account when the number does not match', async () => {
    const res = await request(app)
      .post(`${base}/pay-now`)
      .send({ method: 'account', accountNumber: 'WRONG' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Account number is not correct!');
  });

  it('records an on-account payment, completes the order and returns the receipt data', async () => {
    mockModels.Payment.findOne.mockResolvedValue(null);

    const res = await request(app)
      .post(`${base}/pay-now`)
      .send({ method: 'account', accountNumber: 'ACC-1' });

    expect(res.status).toBe(200);
    expect(mockModels.Payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        order_no: 31,
        client_id: 12,
        s_paid: 2,
        payment_status: 1,
        total_order_price: 120,
        account_no: 'ACC-1',
      })
    );
    expect(order.update).toHaveBeenCalledWith(
      expect.objectContaining({ payment_status: 1 })
    );
    expect(res.body.notification).toMatchObject({
      amountCents: 12000,
      method: 'account',
      payerEmail: 'jo@example.com',
      payerName: 'Jo Bloggs',
    });
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      'order.pay-now',
      expect.objectContaining({ method: 'account', amountCents: 12000 })
    );
  });

  it('completes an existing unpaid payment row instead of adding a second', async () => {
    const res = await request(app)
      .post(`${base}/pay-now`)
      .send({ method: 'marked-paid' });

    expect(res.status).toBe(200);
    expect(mockModels.Payment.create).not.toHaveBeenCalled();
    expect(payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ s_paid: 2, payment_status: 1 })
    );
  });

  it('does not take a card', async () => {
    const res = await request(app).post(`${base}/pay-now`).send({ method: 'card' });

    expect(res.status).toBe(400);
  });

  it('refuses an order that is already paid', async () => {
    payment = makePayment({ s_paid: 1, payment_status: 1, total_order_price: '120.00' });
    mockModels.Payment.findOne.mockResolvedValue(payment);

    const res = await request(app).post(`${base}/pay-now`).send({ method: 'marked-paid' });

    expect(res.status).toBe(409);
  });

  it('needs an amount when the order has no price', async () => {
    order.total_fee = null as never;

    const res = await request(app).post(`${base}/pay-now`).send({ method: 'marked-paid' });

    expect(res.status).toBe(400);
  });
});

describe('GET /payment/invoice', () => {
  it('returns the order as one invoice line, with its payments and the bill-to', async () => {
    mockModels.Payment.findAll.mockResolvedValue([
      makePayment({
        s_paid: 2,
        payment_status: 1,
        total_order_price: '120.00',
        payment_option: 0,
        transaction_id: 'ACCT-1',
      }),
    ]);

    const res = await request(app).get(`${base}/invoice`);

    expect(res.status).toBe(200);
    expect(res.body.invoice.invoice).toMatchObject({
      amountCents: 12000,
      state: 'paid',
      lines: [{ quantity: 1, totalCents: 12000 }],
    });
    expect(res.body.invoice.payments).toHaveLength(1);
    expect(res.body.invoice.billTo.email).toBe('jo@example.com');
  });

  it('is a 409 for an order with no price', async () => {
    order.total_fee = null as never;

    expect((await request(app).get(`${base}/invoice`)).status).toBe(409);
  });
});
