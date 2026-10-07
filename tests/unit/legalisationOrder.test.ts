/**
 * The Document Legalisation admin order screen's writes, with the model layer
 * mocked — no database, nothing written anywhere.
 *
 * ## What is being asserted, and why it is these things
 *
 * Each case pins a rule the legacy `viewDocLegalisationAction` had (or should have
 * had) that a refactor could silently lose:
 *
 * - **Milestone priority.** Legacy chose the client email with an `if / elseif`
 *   chain, so when several stamps move in one save only the first decides.
 * - **An admin comment suppresses the client email.** Lane 1 is CLS-internal; the
 *   email is the one place a staff member's words physically leave the building.
 * - **Closed ⇒ status 2**, only when every destination is closed.
 * - **Lane gating** on edit and delete: lane 1 always, lane 0 only for staff-written
 *   rows.
 * - **Ownership of every child id.** The tables are MyISAM with no foreign keys; the
 *   id in the URL is the only thing between one order and another's rows.
 * - **The tracker's "remove" is scoped to the order** (legacy deleted across all
 *   of them).
 *
 * The multer middleware is replaced by one that takes the "uploaded" files from a
 * header, because what matters here is what the handler does with files, not that
 * busboy can parse a body.
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
  Countries: mockModel(),
  DocumentLegalizationOrderDetails: mockModel(),
  OrderDestinationNotes: mockModel(),
  OrderDlChecklist: mockModel(),
  OrderFollowUpDate: mockModel(),
  OrderNotes: mockModel(),
  OrderReturnDocumentDetails: mockModel(),
  OrderTravellerDetails: mockModel(),
  Payment: mockModel(),
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
  commentOf,
  legalisationOrderRoutes,
  noteIsEditable,
  parseDay,
  parseStamp,
  pickMilestone,
  trackingOf,
} from '../../src/modules/admin/legalisationOrder';
import { errorHandler, notFoundHandler } from '../../src/middleware/errorHandler';

const audit = jest.fn(() => Promise.resolve());

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.auth = { sub: 7, aud: 'admin' } as never;
  next();
});
app.use('/api/admin/orders', legalisationOrderRoutes(audit));
app.use(notFoundHandler);
app.use(errorHandler);

const base = '/api/admin/orders/10034012/legalisation';

/** A model-like row: its columns, plus a recording `update`/`destroy`. */
const row = <T extends object>(columns: T) => ({
  ...columns,
  update: jest.fn(function (this: T, patch: Partial<T>) {
    Object.assign(this, patch);
    return Promise.resolve(this);
  }),
  destroy: jest.fn(() => Promise.resolve()),
});

let order: ReturnType<typeof makeOrder>;
let destination: ReturnType<typeof makeDestination>;

const makeOrder = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 10034012,
    order_no: '10034012',
    order_type: 9,
    client_id: 12,
    status: 1,
    is_bulk: 0,
    is_address_confirmed: 0,
    destination: 5,
    courier_service_id: null as number | null,
    contact_email: 'client@example.com',
    contact_first_name: 'Jo',
    contact_last_name: 'Bloggs',
    contact_phone: '0400',
    date_submitted: '2026-09-01 10:00:00',
    visa_cls_team_member: null as number | null,
    visa_is_delivered_to_embassy: 0,
    visa_is_delivered_to_embassy_date: null,
    visa_next_embassy: null as string | null,
    ...overrides,
  });

const makeDestination = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 26358,
    order_id: 10034012,
    country_id: 5,
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
    ...overrides,
  });

const note = (overrides: Record<string, unknown> = {}) =>
  row({
    id: 100,
    destination_id: 26358,
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
  mockModels.ClsOrderDestinations.findOne.mockResolvedValue(destination);
  mockModels.ClsOrderDestinations.findAll.mockResolvedValue([destination]);
  mockModels.UserAdmin.findByPk.mockResolvedValue({ id: 7, fname: 'Sam', lname: 'Staff' });
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
  mockModels.OrderDestinationNotes.findAll.mockResolvedValue([]);
  mockModels.OrderDestinationNotes.create.mockResolvedValue({});
  mockModels.OrderFollowUpDate.destroy.mockResolvedValue(1);
  mockModels.OrderNotes.findAll.mockResolvedValue([]);
});

const files = (value: Record<string, { key: string }[]>) => JSON.stringify(value);

// ---------------------------------------------------------------------------

describe('milestone priority', () => {
  const stored = {
    visa_date_cls_received_all_items: null,
    visa_date_submitted_for_processing: null,
    visa_date_completed_and_received_at_cls: null,
    visa_date_order_on_route_and_closed: null,
  };

  it('lets the first changed stamp win when several move at once', () => {
    const picked = pickMilestone(stored, {
      allItemsReceivedAtCLS: '2026-10-01 09:00:00',
      submittedForProcessing: '2026-10-02 09:00:00',
      orderOnRouteAndClosed: '2026-10-05 09:00:00',
    });

    expect(picked?.scantype).toBe('first');
  });

  it('falls through to the next stamp when the earlier one is unchanged', () => {
    const picked = pickMilestone(
      { ...stored, visa_date_cls_received_all_items: '2026-10-01 09:00:00' },
      {
        allItemsReceivedAtCLS: '2026-10-01 09:00:00',
        submittedForProcessing: '2026-10-02 09:00:00',
        completedReceivedAtCLS: '2026-10-03 09:00:00',
      }
    );

    expect(picked?.scantype).toBe('second');
  });

  it('walks all four in order: third beats fourth', () => {
    expect(
      pickMilestone(stored, {
        completedReceivedAtCLS: '2026-10-03 09:00:00',
        orderOnRouteAndClosed: '2026-10-05 09:00:00',
      })?.scantype
    ).toBe('third');
    expect(
      pickMilestone(stored, { orderOnRouteAndClosed: '2026-10-05 09:00:00' })?.scantype
    ).toBe('fourth');
  });

  it('does not count a cleared stamp, or an unchanged one, as a milestone', () => {
    expect(
      pickMilestone(
        { ...stored, visa_date_cls_received_all_items: '2026-10-01 09:00:00' },
        { allItemsReceivedAtCLS: null }
      )
    ).toBeNull();
    expect(
      pickMilestone(
        { ...stored, visa_date_cls_received_all_items: '2026-10-01 09:00:00' },
        { allItemsReceivedAtCLS: '2026-10-01 09:00:00' }
      )
    ).toBeNull();
  });

  it('reports the scantype and writes the stamps when PATCH /ticket runs', async () => {
    const response = await request(app).patch(`${base}/ticket`).send({
      allItemsReceivedAtCLS: '2026-10-01T09:00:00',
      submittedForProcessing: '2026-10-02T09:00:00',
    });

    expect(response.status).toBe(200);
    expect(response.body.notification.scantype).toBe('first');
    expect(destination.update).toHaveBeenCalledWith(
      expect.objectContaining({
        visa_date_cls_received_all_items: '2026-10-01 09:00:00',
        visa_date_submitted_for_processing: '2026-10-02 09:00:00',
      })
    );
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      'legalisation.received',
      expect.objectContaining({ scantype: 'first' })
    );
  });

  it('writes the generic "processed" audit line when no stamp moved', async () => {
    const response = await request(app).patch(`${base}/ticket`).send({ shippedBy: 'DHL' });

    expect(response.status).toBe(200);
    expect(response.body.notification.scantype).toBe('');
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      'legalisation.processed',
      expect.any(Object)
    );
  });
});

describe('date parsing', () => {
  it('reads blank as clear, naive as Sydney wall-clock, and garbage as invalid', () => {
    expect(parseStamp('')).toBeNull();
    expect(parseStamp('2026-10-01T09:05')).toBe('2026-10-01 09:05:00');
    expect(parseStamp('2026-02-31T09:00')).toBeUndefined();
    expect(parseStamp('yesterday')).toBeUndefined();
    expect(parseDay('2026-10-01')).toBe('2026-10-01');
    expect(parseDay('')).toBeNull();
  });

  it('converts a zoned instant into Sydney wall-clock', () => {
    // 2026-10-01T00:00Z is 11:00 in Sydney (AEDT starts 4 Oct, so still +10).
    expect(parseStamp('2026-10-01T00:00:00Z')).toBe('2026-10-01 10:00:00');
  });
});

describe('comments on PATCH /ticket', () => {
  it('suppresses the client email when an admin comment is set, and files it on lane 1', async () => {
    const response = await request(app)
      .patch(`${base}/ticket`)
      .set('x-test-files', files({ admin_attachment: [{ key: '12/10034012/internal/a.pdf' }] }))
      .send({ adminComment: 'chase the notary', clientComment: 'we have your docs' });

    expect(response.status).toBe(200);
    expect(response.body.notification.suppress).toBe(true);

    const created = mockModels.OrderDestinationNotes.create.mock.calls.map(
      ([values]) => values as { is_admin: number; note: string; attachment: string | null }
    );
    expect(created).toEqual([
      expect.objectContaining({ is_admin: 0, note: 'we have your docs', attachment: null }),
      expect.objectContaining({
        is_admin: 1,
        note: 'chase the notary',
        attachment: '12/10034012/internal/a.pdf',
        user_type: 'Admin',
        destination_id: 26358,
      }),
    ]);
  });

  it('does not suppress, and writes one note per file, for a client comment alone', async () => {
    const response = await request(app)
      .patch(`${base}/ticket`)
      .set(
        'x-test-files',
        files({
          comment_attachment: [
            { key: '12/10034012/notes/one.pdf' },
            { key: '12/10034012/notes/two.png' },
          ],
        })
      )
      .send({ clientComment: 'Please see attached' });

    expect(response.status).toBe(200);
    expect(response.body.notification).toMatchObject({
      suppress: false,
      clientComment: 'Please see attached',
      attachments: ['12/10034012/notes/one.pdf', '12/10034012/notes/two.png'],
      clientEmail: 'client@example.com',
      embassyName: 'Embassy of Spain',
    });
    expect(mockModels.OrderDestinationNotes.create).toHaveBeenCalledTimes(2);
    expect(
      mockModels.OrderDestinationNotes.create.mock.calls.every(
        ([values]) => (values as { is_admin: number }).is_admin === 0
      )
    ).toBe(true);
  });

  it('never lists a lane-1 file in the notification attachments', async () => {
    const response = await request(app)
      .patch(`${base}/ticket`)
      .set(
        'x-test-files',
        files({
          comment_attachment: [{ key: '12/10034012/notes/public.pdf' }],
          admin_attachment: [{ key: '12/10034012/internal/secret.pdf' }],
        })
      )
      .send({ clientComment: 'hi', adminComment: 'internal' });

    expect(response.body.notification.attachments).toEqual(['12/10034012/notes/public.pdf']);
  });

  it('refuses an attachment with no comment text, and throws the uploaded file away', async () => {
    const response = await request(app)
      .patch(`${base}/ticket`)
      .set('x-test-files', files({ comment_attachment: [{ key: '12/10034012/notes/x.pdf' }] }))
      .send({ shippedBy: 'TNT' });

    expect(response.status).toBe(400);
    expect(mockDiscardDocument).toHaveBeenCalledWith('12/10034012/notes/x.pdf');
    expect(mockModels.OrderDestinationNotes.create).not.toHaveBeenCalled();
    expect(destination.update).not.toHaveBeenCalled();
  });

  it('writes the follow-up date to both the table and the destination column', async () => {
    const response = await request(app).patch(`${base}/ticket`).send({ followUpDate: '2026-10-20' });

    expect(response.status).toBe(200);
    expect(destination.update).toHaveBeenCalledWith(
      expect.objectContaining({ visa_follow_up_date: '2026-10-20' })
    );
    expect(mockModels.OrderFollowUpDate.destroy).toHaveBeenCalledWith({
      where: { order_id: 10034012, admin_id: 7 },
    });
    expect(mockModels.OrderFollowUpDate.create).toHaveBeenCalledWith({
      admin_id: 7,
      order_id: 10034012,
      follow_up_date: '2026-10-20 00:00:00',
    });
  });
});

describe('closed ⇒ status 2', () => {
  it('confirms the order when the only destination is closed', async () => {
    const response = await request(app)
      .patch(`${base}/ticket`)
      .send({ orderOnRouteAndClosed: '2026-10-09T09:00:00' });

    expect(response.status).toBe(200);
    expect(order.update).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }));
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      'order.status',
      expect.objectContaining({ from: 1, to: 2 })
    );
  });

  it('leaves the status alone while another destination is still open', async () => {
    mockModels.ClsOrderDestinations.findAll.mockResolvedValue([
      destination,
      makeDestination({ id: 26359, visa_date_order_on_route_and_closed: null }),
    ]);

    await request(app)
      .patch(`${base}/ticket`)
      .send({ orderOnRouteAndClosed: '2026-10-09T09:00:00' });

    expect(order.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 2 }));
  });

  it('does not confirm an order whose closed stamp was cleared', async () => {
    destination.visa_date_order_on_route_and_closed = '2026-10-09 09:00:00';

    await request(app).patch(`${base}/ticket`).send({ orderOnRouteAndClosed: '' });

    expect(order.update).not.toHaveBeenCalledWith(expect.objectContaining({ status: 2 }));
  });
});

describe('the order-type guard', () => {
  it('answers 404 for an order that is not document legalisation, on every route', async () => {
    mockModels.ClsOrder.findByPk.mockResolvedValue(makeOrder({ order_type: 6 }));

    const results = await Promise.all([
      request(app).get(base),
      request(app).patch(`${base}/ticket`).send({}),
      request(app).patch(`${base}/payment-status`).send({ paymentStatus: 1 }),
      request(app).post(`${base}/address-confirmation/acknowledge`),
      request(app).get(`${base}/print/order-label`),
    ]);

    expect(results.map((r) => r.status)).toEqual([404, 404, 404, 404, 404]);
    expect(destination.update).not.toHaveBeenCalled();
  });
});

describe('lane gating on comment edit and delete', () => {
  it('lets staff edit and delete a lane-1 note whatever its user_type', async () => {
    const lane1 = note({ id: 7, is_admin: 1, user_type: 'Client' });
    mockModels.OrderDestinationNotes.findByPk.mockResolvedValue(lane1);

    const edited = await request(app).patch(`${base}/comments/7`).send({ comment: 'fixed' });
    const deleted = await request(app).delete(`${base}/comments/7`);

    expect(edited.status).toBe(200);
    expect(deleted.status).toBe(200);
    expect(lane1.update).toHaveBeenCalledWith({ note: 'fixed' });
    expect(lane1.destroy).toHaveBeenCalled();
  });

  it('lets staff edit a lane-0 note they wrote', async () => {
    const lane0 = note({ id: 8, is_admin: 0, user_type: 'Admin' });
    mockModels.OrderDestinationNotes.findByPk.mockResolvedValue(lane0);

    const edited = await request(app).patch(`${base}/comments/8`).send({ comment: 'x' });

    expect(edited.status).toBe(200);
    expect(lane0.update).toHaveBeenCalled();
  });

  it("refuses to edit or delete a client's own reply on lane 0", async () => {
    const reply = note({ id: 9, is_admin: 0, user_type: 'Client' });
    mockModels.OrderDestinationNotes.findByPk.mockResolvedValue(reply);

    const edited = await request(app).patch(`${base}/comments/9`).send({ comment: 'x' });
    const deleted = await request(app).delete(`${base}/comments/9`);

    expect(edited.status).toBe(403);
    expect(deleted.status).toBe(403);
    expect(reply.update).not.toHaveBeenCalled();
    expect(reply.destroy).not.toHaveBeenCalled();
  });

  it('marks editability the same way in what the screen returns', () => {
    expect(noteIsEditable(note({ is_admin: 1, user_type: 'Client' }) as never)).toBe(true);
    expect(noteIsEditable(note({ is_admin: 0, user_type: 'Client' }) as never)).toBe(false);
    expect(noteIsEditable(note({ is_admin: null, user_type: 'Admin' }) as never)).toBe(true);
    expect(commentOf(note({ is_admin: 1, attachment: 'a/b/c.pdf' }) as never)).toMatchObject({
      lane: 'admin',
      attachment: 'c.pdf',
      editable: true,
    });
  });
});

describe('cross-order id rejection', () => {
  it("404s a comment that belongs to another order's destination", async () => {
    const foreign = note({ id: 50, destination_id: 99999, is_admin: 1 });
    mockModels.OrderDestinationNotes.findByPk.mockResolvedValue(foreign);

    const results = await Promise.all([
      request(app).patch(`${base}/comments/50`).send({ comment: 'x' }),
      request(app).delete(`${base}/comments/50`),
      request(app).get(`${base}/comments/50/attachment`),
    ]);

    expect(results.map((r) => r.status)).toEqual([404, 404, 404]);
    expect(foreign.update).not.toHaveBeenCalled();
    expect(foreign.destroy).not.toHaveBeenCalled();
    expect(mockOpenDocument).not.toHaveBeenCalled();
  });

  it('rejects a checklist save naming a row of another order, and changes none', async () => {
    const mine = row({ id: 1, order_no: 10034012, type: 'a', number: 1, note: null, doc_file: null });
    mockModels.OrderDlChecklist.findAll.mockResolvedValue([mine]);

    const response = await request(app)
      .patch(`${base}/checklist`)
      .send({
        rows: [
          { id: 1, type: 'Birth certificate', number: 2, note: 'n' },
          { id: 777, type: 'Passport', number: 1, note: '' },
        ],
      });

    expect(response.status).toBe(404);
    expect(mine.update).not.toHaveBeenCalled();
  });

  it("404s a checklist file that belongs to another order's row", async () => {
    mockModels.OrderDlChecklist.findByPk.mockResolvedValue(
      row({ id: 4, order_no: 555, doc_file: 'x.pdf' })
    );

    const response = await request(app).get(`${base}/checklist/4/file`);

    expect(response.status).toBe(404);
    expect(mockOpenDocument).not.toHaveBeenCalled();
  });

  it('saves a checklist whose every row is this order’s', async () => {
    const one = row({ id: 1, order_no: 10034012, type: 'a', number: 1, note: null, doc_file: null });
    mockModels.OrderDlChecklist.findAll.mockResolvedValue([one]);

    const response = await request(app)
      .patch(`${base}/checklist`)
      .send({ rows: [{ id: 1, type: 'Birth certificate', number: '', note: 'n' }] });

    expect(response.status).toBe(200);
    expect(one.update).toHaveBeenCalledWith({
      type: 'Birth certificate',
      number: null,
      note: 'n',
    });
  });

  it("404s a single tracker row of another order and does not delete it", async () => {
    const foreign = row({ id: 31, order_no: 4242, document_type: 'Deed' });
    mockModels.OrderNotes.findByPk.mockResolvedValue(foreign);

    const response = await request(app).delete(`${base}/tracking/31`);

    expect(response.status).toBe(404);
    expect(foreign.destroy).not.toHaveBeenCalled();
  });

  it('deletes a tracker row that is this order’s', async () => {
    const mine = row({ id: 32, order_no: 10034012, document_type: 'Deed' });
    mockModels.OrderNotes.findByPk.mockResolvedValue(mine);

    const response = await request(app).delete(`${base}/tracking/32`);

    expect(response.status).toBe(200);
    expect(mine.destroy).toHaveBeenCalled();
  });
});

describe('the tracker', () => {
  it('scopes "remove this document type" to the order in the path', async () => {
    mockModels.OrderNotes.destroy.mockResolvedValue(3);

    const response = await request(app).delete(`${base}/tracking?documentType=Birth%20Certificate`);

    expect(response.status).toBe(200);
    expect(mockModels.OrderNotes.destroy).toHaveBeenCalledWith({
      where: { order_no: 10034012, document_type: 'Birth Certificate' },
    });
  });

  it('answers 404 when that order has no such document type', async () => {
    mockModels.OrderNotes.destroy.mockResolvedValue(0);

    const response = await request(app).delete(`${base}/tracking?documentType=Nope`);

    expect(response.status).toBe(404);
  });

  it('adds a NEW history row per submitted line, and validates the location', async () => {
    const good = await request(app)
      .post(`${base}/tracking`)
      .send({
        rows: [{ documentType: 'Deed', location: 'Notary', price: '$85', status: 'Delivered' }],
      });

    expect(good.status).toBe(200);
    expect(mockModels.OrderNotes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        order_no: 10034012,
        document_type: 'Deed',
        location: 'Notary',
        price: 85,
        status: 'Delivered',
        is_admin: 1,
        user_type: 'Admin',
        note_by_name: 'Sam',
      })
    );
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      'legalisation.tracking',
      expect.objectContaining({ documentType: 'Deed', location: 'Notary' })
    );

    mockModels.OrderNotes.create.mockClear();
    const bad = await request(app)
      .post(`${base}/tracking`)
      .send({
        rows: [{ documentType: 'Deed', location: 'Moon', price: 1, status: 'Received' }],
      });

    expect(bad.status).toBe(400);
    expect(mockModels.OrderNotes.create).not.toHaveBeenCalled();
  });

  it('groups history newest first, with the newest row as `latest`', () => {
    const groups = trackingOf([
      row({ id: 1, document_type: 'Deed', location: 'Notary', price: 5, status: 'Delivered', is_admin: 1 }),
      row({ id: 2, document_type: 'Deed', location: 'DFAT', price: 5, status: 'Received', is_admin: 1 }),
      row({ id: 3, document_type: null, location: 'x', price: 1, status: 'x', is_admin: 1 }),
    ] as never);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.latest.location).toBe('DFAT');
    expect(groups[0]?.rows.map((r) => r.id)).toEqual([2, 1]);
  });
});

describe('Order Status and Payment Status', () => {
  it('writes both, with one audit line per field that changed', async () => {
    const payment = row({ s_paid: 0 });
    mockModels.Payment.findOne.mockResolvedValue(payment);

    const response = await request(app).patch(`${base}/status`).send({ orderStatus: 2, paymentStatus: 1 });

    expect(response.status).toBe(200);
    expect(order.update).toHaveBeenCalledWith(expect.objectContaining({ status: 2 }));
    expect(payment.update).toHaveBeenCalledWith({ s_paid: 1 });
    expect(audit).toHaveBeenCalledWith(expect.anything(), 'order.status', expect.any(Object));
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      'order.payment-status',
      expect.objectContaining({ to: 1, label: 'paid online' })
    );
  });

  it('writes nothing when there is no payment row to update', async () => {
    mockModels.Payment.findOne.mockResolvedValue(null);

    const response = await request(app).patch(`${base}/status`).send({ orderStatus: 2, paymentStatus: 1 });

    expect(response.status).toBe(409);
    expect(order.update).not.toHaveBeenCalled();
  });
});

describe('Discard Notification', () => {
  it('moves is_address_confirmed from 1 to 2', async () => {
    order.is_address_confirmed = 1;

    const response = await request(app).post(`${base}/address-confirmation/acknowledge`);

    expect(response.body).toMatchObject({ addressConfirmed: 2, changed: true });
    expect(order.update).toHaveBeenCalledWith(expect.objectContaining({ is_address_confirmed: 2 }));
  });

  it('leaves an unconfirmed order alone', async () => {
    order.is_address_confirmed = 0;

    const response = await request(app).post(`${base}/address-confirmation/acknowledge`);

    expect(response.body).toMatchObject({ addressConfirmed: 0, changed: false });
    expect(order.update).not.toHaveBeenCalled();
  });
});

describe('GET /legalisation', () => {
  it('returns the contract shape, both lanes, the DHL flag and the AU locations', async () => {
    order.courier_service_id = 3;
    destination.signature = '[{"lx":1,"ly":2,"mx":3,"my":4}]';
    destination.visa_follow_up_date = '2026-10-20';
    mockModels.VisaCourierOptions.findByPk.mockResolvedValue({ s_dhl: 1 });
    mockModels.OrderDestinationNotes.findAll.mockResolvedValue([
      note({ id: 2, is_admin: 1, note: 'internal', user_type: 'Admin' }),
      note({ id: 1, is_admin: 0, note: 'to client', user_type: 'Admin', attachment: '12/1/notes/a.pdf' }),
    ]);
    mockModels.OrderReturnDocumentDetails.findOne.mockResolvedValue({
      first_name: 'Jo',
      last_name: 'Bloggs',
      address: '1 Street',
      city: 'Sydney',
      state: 'NSW',
      postcode: '2000',
      company: 'Acme',
      email: 'a@b.c',
      contact_number: '1',
      returning_date: null,
    });
    mockModels.Payment.findOne.mockResolvedValue({ s_paid: 1, mba_address: null });
    mockModels.OrderTravellerDetails.findOne.mockResolvedValue({ first_name: 'Trav', last_name: 'Eller' });
    mockModels.Countries.findAll.mockResolvedValue([{ id: 5, country_name: 'Spain' }]);
    mockModels.DocumentLegalizationOrderDetails.findOne.mockResolvedValue({
      destination: 5,
      nationality: 6,
      type_of_document: 2,
      ref_no: 'R1',
      com_invoice_no: 'N1',
    });
    mockModels.OrderDlChecklist.findAll.mockResolvedValue([
      { id: 1, type: 'Passport', number: 1, note: null, doc_file: 'x.pdf' },
    ]);

    const response = await request(app).get(base);
    const screen = response.body.legalisation;

    expect(response.status).toBe(200);
    expect(screen.order).toMatchObject({
      id: 10034012,
      orderNo: '10034012',
      status: 1,
      clientName: 'Trav Eller',
      addressConfirmed: 0,
      courierServiceId: 3,
      isDhlCourier: true,
    });
    expect(screen.destination).toEqual({
      id: 26358,
      countryId: 5,
      countryName: 'Spain',
      embassyName: 'Embassy of Spain',
    });
    expect(screen.comments.map((c: { lane: string }) => c.lane)).toEqual(['admin', 'client']);
    expect(screen.comments[1].attachment).toBe('a.pdf');
    expect(screen.ticket.signature).toEqual({
      kind: 'strokes',
      strokes: [{ lx: 1, ly: 2, mx: 3, my: 4 }],
    });
    expect(screen.ticket.followUpDate).toBe('2026-10-20');
    expect(screen.locations).toEqual(['Notary', 'Chamber', 'DFAT', 'CMO', 'AFP', 'Embassy']);
    expect(screen.delivery).toMatchObject({ hasAddress: true, city: 'Sydney' });
    expect(screen.payment).toEqual({ status: 1, billing: null });
    expect(screen.details).toMatchObject({ typeOfDocument: 2, nationalityId: 6 });
    expect(screen.checklist).toEqual([
      { id: 1, type: 'Passport', number: 1, note: null, hasFile: true },
    ]);
  });
});

describe('GET /legalisation/signature', () => {
  const opened = () => ({
    contentType: 'image/png',
    bytes: 3,
    from: 'local',
    copies: ['local'],
    stream: Readable.from([Buffer.from('png')]),
  });

  it('streams the png the destination row names, from dev/order_signature', async () => {
    destination.signature = 'abc123_10034012_26358.png';
    mockOpenDocument.mockResolvedValue(opened());

    const response = await request(app).get(`${base}/signature`);

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/image\/png/);
    expect(mockOpenDocument).toHaveBeenCalledWith('dev/order_signature/abc123_10034012_26358.png');
  });

  it('serves only the base name, so a path in the column cannot leave the folder', async () => {
    destination.signature = '../../secret/abc_10034012_26358.png';
    mockOpenDocument.mockResolvedValue(opened());

    const response = await request(app).get(`${base}/signature`);

    expect(response.status).toBe(200);
    expect(mockOpenDocument).toHaveBeenCalledWith('dev/order_signature/abc_10034012_26358.png');
  });

  it('404s a signature whose name belongs to another order or destination', async () => {
    destination.signature = 'abc123_555_26358.png';

    const response = await request(app).get(`${base}/signature`);

    expect(response.status).toBe(404);
    expect(mockOpenDocument).not.toHaveBeenCalled();
  });

  it('404s an SVG, a stroke-JSON signature and an empty one', async () => {
    for (const value of ['abc_10034012_26358.svg', '[{"lx":1}]', null]) {
      destination.signature = value;
      const response = await request(app).get(`${base}/signature`);
      expect(response.status).toBe(404);
    }
    expect(mockOpenDocument).not.toHaveBeenCalled();
  });

  it('404s when the file is not in storage', async () => {
    destination.signature = 'abc123_10034012_26358.png';
    mockOpenDocument.mockResolvedValue(null);

    const response = await request(app).get(`${base}/signature`);

    expect(response.status).toBe(404);
  });

  it('404s an order that is not a document-legalisation order', async () => {
    order.order_type = 1;

    const response = await request(app).get(`${base}/signature`);

    expect(response.status).toBe(404);
  });
});

describe('portal reference and the delivery state', () => {
  it('carries the client-facing reference on the screen, the notification and the confirmation', async () => {
    mockModels.OrderReturnDocumentDetails.findOne.mockResolvedValue({
      first_name: 'Jo',
      last_name: 'Bloggs',
      address: '1 Street',
      city: 'Sydney',
      state: 'ACT',
      postcode: '2600',
      company: null,
      email: null,
      contact_number: null,
      returning_date: null,
    });
    mockModels.Payment.findOne.mockResolvedValue(null);
    mockModels.DocumentLegalizationOrderDetails.findOne.mockResolvedValue(null);
    mockModels.OrderTravellerDetails.findOne.mockResolvedValue(null);
    mockModels.Countries.findAll.mockResolvedValue([]);
    mockModels.OrderDlChecklist.findAll.mockResolvedValue([]);

    const screen = await request(app).get(base);
    const ticket = await request(app).patch(`${base}/ticket`).send({ shippedBy: 'DHL' });
    const confirmation = await request(app).get(`${base}/address-confirmation`);

    expect(screen.body.legalisation.order.reference).toBe('CLS-10034012');
    expect(screen.body.legalisation.delivery.state).toBe('ACT');
    expect(ticket.body.notification.reference).toBe('CLS-10034012');
    expect(confirmation.body.confirmation.reference).toBe('CLS-10034012');
  });
});
