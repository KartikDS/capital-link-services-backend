/**
 * The file a consultant attached to a note, and the two things checked before a
 * client is handed it.
 *
 * `GET /api/orders/:reference/comments/:id/attachment` takes a note id, and a
 * note id is a small integer from a MyISAM table with no order column on it. So
 * neither of the facts that matter — that the note belongs to this order, and
 * that it is on the lane a client may read — can be read off the request. Both
 * are established here, in `commentAttachment`, and both refuse with the same
 * "not found" wording so the endpoint cannot be used to learn which note ids are
 * real or which of them a client is not allowed to see.
 *
 * The lane check is the one this file was written for. Between 2026-08-26 and
 * 2026-08-27 it was absent: the thread was showing internal notes, so refusing
 * their attachments would have listed a file and then 404'd on the click. The
 * thread no longer shows them, and a route that still served their files would
 * have left the confidential lane one guessed integer away from a client.
 *
 * The repository is mocked: nothing here depends on a query.
 */

const findDestinationNote = jest.fn();
const listClsDestinationIds = jest.fn();
const listLegacyDestinationIds = jest.fn();

jest.mock('../../src/modules/orders/orders.repository', () => ({
  findDestinationNote,
  listClsDestinationIds,
  listLegacyDestinationIds,
}));

jest.mock('../../src/domain/checklist', () => ({
  materialiseChecklistQuietly: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/models', () => ({
  Countries: {},
  OrderReturnDocumentDetails: {},
}));

import { commentAttachment } from '../../src/modules/orders/orders.service';
import type { ResolvedOrder } from '../../src/modules/orders/orders.service';

const order = (): ResolvedOrder =>
  ({
    family: 'cls',
    row: { id: 10034012, order_no: '10034012' },
    clientId: 12,
  }) as unknown as ResolvedOrder;

/** As the row comes back, with the lane and the owning destination as given. */
const note = (is_admin: number | null, destination_id: number | null = 26358) => ({
  id: 23596,
  destination_id,
  is_admin,
  attachment: 'CLS Order Form Australia (005).pdf',
});

beforeEach(() => {
  jest.clearAllMocks();
  listClsDestinationIds.mockResolvedValue([26358]);
  listLegacyDestinationIds.mockResolvedValue([]);
});

describe('commentAttachment', () => {
  it('serves a file attached to a note on the client-facing lane', async () => {
    findDestinationNote.mockResolvedValue(note(0));

    await expect(commentAttachment(order(), 'dn-23596')).resolves.toEqual({
      filename: 'CLS Order Form Australia (005).pdf',
    });
  });

  it('serves one on a row whose lane was never recorded', async () => {
    // Null is the MyISAM default on rows written before the column existed.
    // Those predate the internal box and are ordinary correspondence.
    findDestinationNote.mockResolvedValue(note(null));

    await expect(commentAttachment(order(), 'dn-23596')).resolves.toEqual({
      filename: 'CLS Order Form Australia (005).pdf',
    });
  });

  it('refuses one attached to an internal note, as if it did not exist', async () => {
    findDestinationNote.mockResolvedValue(note(1));

    await expect(commentAttachment(order(), 'dn-23596')).rejects.toThrow(
      /could not find that attachment/
    );

    // Refused on the lane alone, before the order is even consulted: the file is
    // confidential whoever is asking, so there is nothing to check ownership of.
    expect(listClsDestinationIds).not.toHaveBeenCalled();
  });

  it('refuses a note belonging to somebody else’s order', async () => {
    findDestinationNote.mockResolvedValue(note(0, 99999));

    await expect(commentAttachment(order(), 'dn-23596')).rejects.toThrow(
      /could not find that attachment/
    );
  });

  it('refuses an id that is not one of this thread’s', async () => {
    // The prefix is the thread's, and a bare integer is not an id this route
    // takes — `tbl_order_notes` has no attachment column to serve from.
    for (const id of ['23596', 'note-23596', 'dn-', '']) {
      await expect(commentAttachment(order(), id)).rejects.toThrow(
        /could not find that attachment/
      );
    }

    expect(findDestinationNote).not.toHaveBeenCalled();
  });

  it('refuses a note that records no file', async () => {
    findDestinationNote.mockResolvedValue({ ...note(0), attachment: null });

    await expect(commentAttachment(order(), 'dn-23596')).rejects.toThrow(
      /could not find that attachment/
    );
  });
});
