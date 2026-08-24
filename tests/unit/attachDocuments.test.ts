/**
 * Attaching uploads to the line that declared them.
 *
 * A legalisation order declares its documents before they are sent: the form
 * collects "Birth Certificate Attestation ×1" as a checklist line and the scans
 * separately. The old application joins the two by having the client click upload
 * *on a line* — `DocumentUploadsController::uploadDocAction` sets `doc_file` on
 * that exact row and never inserts.
 *
 * Ours could not, so the portal showed both halves at once: the line as
 * "UPLOAD NEEDED — Files to follow: itinerary4.jpg" and the file beside it as a
 * loose "RECEIVED" row. The same document, twice, in two states.
 */

const checklistFindAll = jest.fn();
const travellerFindAll = jest.fn();
const documentCreate = jest.fn();
const destinationFindOne = jest.fn();

jest.mock('../../src/models', () => ({
  ClsOrderDocuments: { create: documentCreate },
  ClsOrderDestinations: { findOne: destinationFindOne },
  OrderDlChecklist: { findAll: checklistFindAll },
  OrderNotes: { create: jest.fn() },
  OrderTravellerDetails: { findAll: travellerFindAll },
  UserClient: {},
  ClsOrder: {},
}));

jest.mock('../../src/domain/checklist', () => ({
  scopeOfOrder: jest.fn().mockResolvedValue({
    countryId: 14,
    visaTypeId: null,
    nationality: 241,
    entryOption: null,
    processLocationId: null,
    region: null,
  }),
}));

import { attachDocuments } from '../../src/modules/orders/orders.writes';

/** A declared line, as lodgement writes it — note carries the expected files. */
const line = (id: number, type: string, note: string) => ({
  id,
  type,
  note,
  doc_file: null,
  update: jest.fn().mockResolvedValue(undefined),
});

const upload = (originalname: string) =>
  ({ originalname, path: `${process.cwd()}/uploads/unassigned/x-${originalname}` }) as
    unknown as Express.Multer.File;

const order = {
  family: 'cls' as const,
  row: { id: 10_034_329 } as never,
  clientId: 9210,
};

beforeEach(() => {
  jest.clearAllMocks();
  travellerFindAll.mockResolvedValue([{ id: 900, is_primary: 1 }]);
  documentCreate.mockImplementation((values: Record<string, unknown>) =>
    Promise.resolve({ id: 555, ...values })
  );
});

describe('attachDocuments', () => {
  it('fills the declared line that named the file, instead of adding a second row', async () => {
    const birth = line(26_092, 'Birth Certificate Attestation', 'Files to follow: itinerany4.jpg');
    checklistFindAll.mockResolvedValue([birth]);

    const result = await attachDocuments(order, [upload('itinerany4.jpg')]);

    expect(birth.update).toHaveBeenCalledWith({
      doc_file: 'unassigned/x-itinerany4.jpg',
    });
    // The whole point: no loose row beside the line it belongs to.
    expect(documentCreate).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        id: 'dl-26092',
        name: 'Birth Certificate Attestation',
        storedAs: 'unassigned/x-itinerany4.jpg',
        state: 'received',
      },
    ]);
  });

  it('sends each file to its own line when several were declared', async () => {
    const birth = line(1, 'Birth Certificate', 'Files to follow: birth.jpg');
    const medical = line(2, 'Medical Certificate', 'Files to follow: medical.jpg');
    checklistFindAll.mockResolvedValue([birth, medical]);

    await attachDocuments(order, [upload('medical.jpg'), upload('birth.jpg')]);

    expect(medical.update).toHaveBeenCalledWith({ doc_file: 'unassigned/x-medical.jpg' });
    expect(birth.update).toHaveBeenCalledWith({ doc_file: 'unassigned/x-birth.jpg' });
    expect(documentCreate).not.toHaveBeenCalled();
  });

  it('never lets two files claim the same line', async () => {
    // Both lines name the same file, so neither can be told apart — but the
    // second upload must not overwrite whatever the first claimed either.
    const only = line(1, 'Birth Certificate', 'Files to follow: scan.jpg');
    checklistFindAll.mockResolvedValue([only]);

    await attachDocuments(order, [upload('scan.jpg'), upload('scan.jpg')]);

    expect(only.update).toHaveBeenCalledTimes(1);
    // The second file still lands, as a loose row rather than nowhere.
    expect(documentCreate).toHaveBeenCalledTimes(1);
  });

  it('falls back to a loose row when no line names the file', async () => {
    checklistFindAll.mockResolvedValue([
      line(1, 'Birth Certificate', 'Files to follow: birth.jpg'),
    ]);

    const result = await attachDocuments(order, [upload('passport.jpg')]);

    expect(documentCreate).toHaveBeenCalledTimes(1);
    expect(result[0]?.id).toBe('555');
  });

  it('refuses to guess when two lines name the same file', async () => {
    const a = line(1, 'Birth Certificate', 'Files to follow: scan.jpg');
    const b = line(2, 'Marriage Certificate', 'Files to follow: scan.jpg');
    checklistFindAll.mockResolvedValue([a, b]);

    await attachDocuments(order, [upload('scan.jpg')]);

    // Attaching it to the wrong line would tell a consultant something untrue.
    expect(a.update).not.toHaveBeenCalled();
    expect(b.update).not.toHaveBeenCalled();
    expect(documentCreate).toHaveBeenCalledTimes(1);
  });

  it('still stamps the scoping columns on a loose row', async () => {
    checklistFindAll.mockResolvedValue([]);

    await attachDocuments(order, [upload('passport.jpg')]);

    // Null here made the upload invisible to CLS's own document screen.
    expect(documentCreate.mock.calls[0][0]).toMatchObject({
      order_id: 10_034_329,
      country_id: 14,
      nationality: 241,
      traveller_id: 900,
      status: 1,
    });
  });
});
