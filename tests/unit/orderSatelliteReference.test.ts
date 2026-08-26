/**
 * The reference an order's satellites come back under.
 *
 * A `tbl_cls_order` has no reference column: the id is the fact, `CLS-10034341`
 * is derived from it, and the id is *also* written into `order_no` because CLS's
 * admin keys on that — see `domain/orderReference`. So there are two strings in
 * play for one order, and only one of them is the reference.
 *
 * The documents and notes endpoints used to answer with the other one. The order
 * came back as `CLS-10034341` and its own documents as `10034341`, and the portal
 * — which matches an order's rows to the order by reference — fetched a client's
 * uploaded scans and then showed them an empty documents tab. Their documents
 * screen listed the same files, because `portal.service` derived the reference
 * from the id as it should.
 *
 * These assertions are about that one string. The models and repository are
 * mocked: nothing here depends on a query.
 */

const listClsDocuments = jest.fn();
const listDocumentNotes = jest.fn();
const listOrderChecklist = jest.fn();
const listClientVisibleNotes = jest.fn();
const listClsDestinationIds = jest.fn();
const listLegacyDestinationIds = jest.fn();
const listDestinationNotes = jest.fn();

jest.mock('../../src/modules/orders/orders.repository', () => ({
  listClsDocuments,
  listDocumentNotes,
  listOrderChecklist,
  listClientVisibleNotes,
  listClsDestinationIds,
  listLegacyDestinationIds,
  listDestinationNotes,
}));

jest.mock('../../src/domain/checklist', () => ({
  materialiseChecklistQuietly: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/models', () => ({
  Countries: {},
  OrderReturnDocumentDetails: {},
}));

import {
  clientReference,
  comments,
  documents,
} from '../../src/modules/orders/orders.service';
import type { ResolvedOrder } from '../../src/modules/orders/orders.service';

/** As the row actually comes back: `order_no` holds the id, as a string. */
const clsOrder = (id = 10034341): ResolvedOrder =>
  ({
    family: 'cls',
    row: { id, order_no: String(id) },
    clientId: 12,
  }) as unknown as ResolvedOrder;

const legacyOrder = (orderNo = 8891): ResolvedOrder =>
  ({
    family: 'legacy',
    row: { order_no: orderNo },
    clientId: 12,
  }) as unknown as ResolvedOrder;

beforeEach(() => {
  jest.clearAllMocks();
  listClsDocuments.mockResolvedValue([
    { id: 7, document: 'passport-scan.pdf', status: 1, created: null, modified: null },
  ]);
  listDocumentNotes.mockResolvedValue([]);
  listOrderChecklist.mockResolvedValue([]);
  listClientVisibleNotes.mockResolvedValue([
    {
      id: 3,
      note: 'Passport received.',
      user_type: 'admin',
      date_added: null,
      note_by_name: 'Sapna Sharma',
    },
  ]);
  listClsDestinationIds.mockResolvedValue([]);
  listLegacyDestinationIds.mockResolvedValue([]);
  listDestinationNotes.mockResolvedValue([]);
});

describe('clientReference', () => {
  it('derives a newer order’s reference from its id', () => {
    expect(clientReference(clsOrder(10034341))).toBe('CLS-10034341');
    expect(clientReference(clsOrder(12))).toBe('CLS-000012');
  });

  it('takes a legacy order’s number as it stands', () => {
    // `tbl_orders` keeps a real reference of its own, so nothing is derived.
    expect(clientReference(legacyOrder(8891))).toBe('8891');
  });
});

describe('an order’s documents', () => {
  it('come back under the reference the order itself is presented as', async () => {
    const [document] = await documents(clsOrder(10034341));

    expect(document).toMatchObject({
      id: '7',
      name: 'passport-scan.pdf',
      // Not '10034341'. The portal drops any row whose reference does not match
      // the order on screen, so this string is what makes the file visible.
      reference: 'CLS-10034341',
    });
  });

  it('include the lines an attestation order declared it was sending', async () => {
    // `attachDocuments` fills a declared line's `doc_file` rather than inserting
    // beside it, so on a legalisation order these rows *are* the uploads.
    listClsDocuments.mockResolvedValue([]);
    listOrderChecklist.mockResolvedValue([
      { id: 14, type: 'Birth Certificate', number: 1, doc_file: 'orders/birth.pdf', note: null },
    ]);

    const [document] = await documents(clsOrder(10034341));

    expect(document).toMatchObject({
      // Prefixed: both tables auto-increment from 1, so a bare id would collide.
      id: 'dl-14',
      name: 'Birth Certificate',
      reference: 'CLS-10034341',
      state: 'received',
    });
  });

  it('are empty for an order family whose documents cannot be listed', async () => {
    // `tbl_cls_order_documents` keys on `order_id`, which `tbl_orders` has not.
    await expect(documents(legacyOrder())).resolves.toEqual([]);
    expect(listClsDocuments).not.toHaveBeenCalled();
  });
});

describe('an order’s notes', () => {
  it('come back under the same reference as its documents', async () => {
    const [note] = await comments(clsOrder(10034341));

    expect(note).toMatchObject({
      reference: 'CLS-10034341',
      body: 'Passport received.',
    });
  });

  it('are still read by the numeric key the notes table joins on', async () => {
    await comments(clsOrder(10034341));

    expect(listClientVisibleNotes).toHaveBeenCalledWith(10034341);
  });

  it('carry the same reference when they come from the consultant thread', async () => {
    // `tbl_order_destination_notes` is keyed on a destination row, not on the
    // order — so the reference cannot come from the note and is derived from the
    // order exactly as the documents' is.
    listClientVisibleNotes.mockResolvedValue([]);
    listClsDestinationIds.mockResolvedValue([77]);
    listDestinationNotes.mockResolvedValue([
      {
        id: 3,
        note: 'Please send the original certificate.',
        user_type: 'Admin',
        date_added: null,
        note_by_name: 'Bhavika Batra',
        attachment: null,
        is_admin: 0,
      },
    ]);

    const [note] = await comments(clsOrder(10034341));

    expect(note).toMatchObject({
      // Prefixed for the same reason `dl-` is: both note tables auto-increment
      // from 1, so a bare id would collide across the merged thread.
      id: 'dn-3',
      reference: 'CLS-10034341',
      authorRole: 'Consultant',
      body: 'Please send the original certificate.',
    });
  });

  it('reads the thread from the destinations the order actually has', async () => {
    listClsDestinationIds.mockResolvedValue([77, 78]);

    await comments(clsOrder(10034341));

    // Every destination, because the admin renders one comment box per
    // destination and the client has one conversation about the order.
    expect(listDestinationNotes).toHaveBeenCalledWith([77, 78]);
  });
});
