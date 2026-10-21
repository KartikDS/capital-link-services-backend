/**
 * The driver page's lookup, signature and group scan, with the model layer mocked —
 * no database, nothing written anywhere.
 *
 * Each case pins a rule the legacy `CLSdriverBundle` had, or should have had:
 *
 * - **An order number is an order number.** `12`, `12-AE` and `CLS-000012` are read;
 *   `12abc` is not quietly order 12, and a blank search lists nothing.
 * - **The strokes stored are the pad's own shape**, validated, so the screens that
 *   replay the column are not handed something else.
 * - **A signature is never replaced.** The second request is a 409 and writes nothing.
 * - **The three columns the legacy wrote** — and only those.
 * - **A group is signed in one transaction** and emptied for the driver alone.
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
  ClsOrderDestinations: mockModel(),
  OrderTravellerDetails: mockModel(),
  ScanGroup: mockModel(),
};

jest.mock('../../src/models', () => mockModels);

jest.mock('../../src/config/database', () => ({
  sequelize: {
    transaction: (work: (t: unknown) => Promise<unknown>) =>
      work({ LOCK: { UPDATE: 'UPDATE' } }),
  },
}));

import express from 'express';
import request from 'supertest';
import {
  MAX_SEGMENTS,
  driverRoutes,
  parseDriverSearch,
  serialiseSignature,
} from '../../src/modules/admin/driver';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';

const audit = jest.fn(() => Promise.resolve());

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.auth = { sub: 7, aud: 'admin' } as never;
  next();
});
app.use('/api/admin/driver', driverRoutes(audit));
app.use(notFoundHandler);
app.use(errorHandler);

const stroke = { lx: 10.123, ly: 20, mx: 5, my: 15.5 };

const makeDestination = (overrides: Record<string, unknown> = {}) => {
  const destination: Record<string, unknown> = {
    id: 55,
    order_id: 12,
    signature: null,
    sig_name: null,
    visa_date_submitted_for_processing: null,
    country: { country_code: 'AE', country_name: 'United Arab Emirates' },
    ...overrides,
  };
  destination.update = jest.fn((patch: Record<string, unknown>) => {
    Object.assign(destination, patch);
    return Promise.resolve(destination);
  });
  return destination;
};

const order = { id: 12, status: 1, order_type: 9 };

beforeEach(() => {
  jest.clearAllMocks();
  mockModels.ClsOrder.findByPk.mockResolvedValue(order);
  mockModels.OrderTravellerDetails.findAll.mockResolvedValue([
    { first_name: 'Amal', last_name: 'Said' },
  ]);
});

describe('parseDriverSearch', () => {
  it('reads the three shapes a driver types or scans', () => {
    expect(parseDriverSearch('12')).toEqual({ orderId: 12, countryCode: null });
    expect(parseDriverSearch(' 12-ae ')).toEqual({ orderId: 12, countryCode: 'AE' });
    expect(parseDriverSearch('CLS-000012')).toEqual({ orderId: 12, countryCode: null });
  });

  it('does not read 12abc as order 12', () => {
    expect(parseDriverSearch('12abc')).toBeNull();
    expect(parseDriverSearch("12' OR 1=1")).toBeNull();
    expect(parseDriverSearch('0')).toBeNull();
    expect(parseDriverSearch('')).toBeNull();
  });
});

describe('serialiseSignature', () => {
  it('stores the pad shape, rounded to two places', () => {
    const result = serialiseSignature([stroke]);
    expect(result).toEqual({
      ok: true,
      json: JSON.stringify([{ lx: 10.12, ly: 20, mx: 5, my: 15.5 }]),
    });
  });

  it('refuses nothing drawn, the wrong shape and an oversized drawing', () => {
    expect(serialiseSignature([]).ok).toBe(false);
    expect(serialiseSignature('x').ok).toBe(false);
    expect(serialiseSignature([{ lx: 'a', ly: 1, mx: 1, my: 1 }]).ok).toBe(false);
    expect(serialiseSignature([{ lx: Infinity, ly: 1, mx: 1, my: 1 }]).ok).toBe(false);
    expect(serialiseSignature(Array(MAX_SEGMENTS + 1).fill(stroke)).ok).toBe(false);
  });
});

describe('GET /orders', () => {
  it('lists nothing for a blank search', async () => {
    const res = await request(app).get('/api/admin/driver/orders');
    expect(res.status).toBe(200);
    expect(res.body.orders).toEqual([]);
    expect(mockModels.ClsOrder.findByPk).not.toHaveBeenCalled();
  });

  it('finds one order with its destination, traveller and signed state', async () => {
    mockModels.ClsOrderDestinations.findAll.mockResolvedValue([makeDestination()]);
    const res = await request(app).get('/api/admin/driver/orders?search=12');

    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0]).toMatchObject({
      id: 12,
      reference: 'CLS-000012',
      destination: 'United Arab Emirates',
      destinationId: 55,
      primaryTraveller: 'Amal Said',
      orderType: 'Document Legalisation',
      signed: false,
    });
  });

  it('answers nothing for an unknown order or a country the order is not going to', async () => {
    mockModels.ClsOrder.findByPk.mockResolvedValue(null);
    expect((await request(app).get('/api/admin/driver/orders?search=999')).body.orders).toEqual([]);

    mockModels.ClsOrder.findByPk.mockResolvedValue(order);
    mockModels.ClsOrderDestinations.findAll.mockResolvedValue([makeDestination()]);
    expect((await request(app).get('/api/admin/driver/orders?search=12-FR')).body.orders).toEqual([]);
  });
});

describe('POST /orders/:id/signature', () => {
  const post = (body: unknown) =>
    request(app).post('/api/admin/driver/orders/12/signature').send(body as object);

  it('writes the signature, the name and the time, and nothing else', async () => {
    const destination = makeDestination();
    mockModels.ClsOrderDestinations.findAll.mockResolvedValue([destination]);

    const res = await post({ signature: [stroke], name: '  Amal Said ' });

    expect(res.status).toBe(201);
    const patch = (destination.update as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual([
      'sig_name',
      'signature',
      'visa_date_submitted_for_processing',
    ]);
    expect(patch.sig_name).toBe('Amal Said');
    expect(JSON.parse(patch.signature as string)).toHaveLength(1);
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      'driver.signature',
      expect.objectContaining({ orderId: 12 })
    );
    expect(res.body.order.signed).toBe(true);
  });

  it('refuses to replace a signature that is already there', async () => {
    const destination = makeDestination({ signature: '[{"lx":1,"ly":1,"mx":1,"my":1}]' });
    mockModels.ClsOrderDestinations.findAll.mockResolvedValue([destination]);

    const res = await post({ signature: [stroke], name: 'Someone Else' });

    expect(res.status).toBe(409);
    expect(destination.update).not.toHaveBeenCalled();
  });

  it('refuses a missing name, an empty drawing and a destination from another order', async () => {
    mockModels.ClsOrderDestinations.findAll.mockResolvedValue([makeDestination()]);

    expect((await post({ signature: [stroke], name: '   ' })).status).toBe(400);
    expect((await post({ signature: [], name: 'A' })).status).toBe(400);
    expect((await post({ signature: [stroke], name: 'A', destinationId: 999 })).status).toBe(404);
  });
});

describe('group scan', () => {
  it('signs every unsigned order in one go, skips a signed one, and empties the group', async () => {
    const fresh = makeDestination({ id: 1, order_id: 12 });
    const already = makeDestination({
      id: 2,
      order_id: 13,
      signature: '[{"lx":1,"ly":1,"mx":1,"my":1}]',
    });
    mockModels.ScanGroup.findAll.mockResolvedValue([{ order_no: 12 }, { order_no: 13 }]);
    mockModels.ClsOrderDestinations.findOne
      .mockResolvedValueOnce(fresh)
      .mockResolvedValueOnce(already);

    const res = await request(app)
      .post('/api/admin/driver/group/signature')
      .send({ signature: [stroke], name: 'Receiver' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ signed: [12], skipped: [13] });
    expect(fresh.update).toHaveBeenCalledTimes(1);
    expect(already.update).not.toHaveBeenCalled();
    // The driver's own rows only: the legacy deleted by order number across everyone.
    expect(mockModels.ScanGroup.destroy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 7 } })
    );
  });

  it('will not sign an empty group', async () => {
    mockModels.ScanGroup.findAll.mockResolvedValue([]);
    const res = await request(app)
      .post('/api/admin/driver/group/signature')
      .send({ signature: [stroke], name: 'Receiver' });
    expect(res.status).toBe(409);
  });

  it('removes only this driver row for an order', async () => {
    mockModels.ScanGroup.findAll.mockResolvedValue([]);
    await request(app).delete('/api/admin/driver/group/12');
    expect(mockModels.ScanGroup.destroy).toHaveBeenCalledWith({
      where: { user_id: 7, order_no: 12 },
    });
  });
});
