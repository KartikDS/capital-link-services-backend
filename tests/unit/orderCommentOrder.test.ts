/**
 * The order an order's thread comes back in.
 *
 * ## What went wrong
 *
 * CLS reported that comments "do not appear in order of when the message was
 * sent", and the cause was not the sort — it was what the sort had to work with.
 * `postedAt` separates these notes far less often than it looks like it should:
 *
 * - `ViewOrderController` builds one `$datetime` at the top of the action and
 *   stamps every note that submit writes with it, so a "Client comment" and the
 *   "Admin comment" typed beside it share a second.
 * - Its multi-file upload writes **one row per file**, looping over `$_FILES`
 *   and repeating the same text and the same `$datetime`.
 *
 * Both note tables are MyISAM with no index on `date_added`, so `ORDER BY
 * date_added DESC` alone is a filesort and a filesort says nothing about equal
 * keys. The rows came back in one order on one read and another order on the
 * next, and merging two such lists compounded it.
 *
 * ## What is asserted here
 *
 * That the answer is a total order, not merely a sorted one. Every case below
 * feeds the same notes in a *different* input order and expects the same result,
 * because "deterministic" is the property that was missing and a test that only
 * checks a happy path would not have caught its absence.
 *
 * The repository is mocked: this is about the merge, and the query's own
 * tiebreaker is asserted in `orderComments.test.ts`.
 */

const listClsDocuments = jest.fn();
const listDocumentNotes = jest.fn();
const listOrderChecklist = jest.fn();
const listClientVisibleNotes = jest.fn();
const listClsDestinationIds = jest.fn();
const listLegacyDestinationIds = jest.fn();
const listClientVisibleDestinationNotes = jest.fn();

jest.mock('../../src/modules/orders/orders.repository', () => ({
  listClsDocuments,
  listDocumentNotes,
  listOrderChecklist,
  listClientVisibleNotes,
  listClsDestinationIds,
  listLegacyDestinationIds,
  listClientVisibleDestinationNotes,
}));

jest.mock('../../src/domain/checklist', () => ({
  materialiseChecklistQuietly: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/models', () => ({
  Countries: {},
  OrderReturnDocumentDetails: {},
}));

import { comments } from '../../src/modules/orders/orders.service';
import type { ResolvedOrder } from '../../src/modules/orders/orders.service';

const clsOrder = (id = 10034341): ResolvedOrder =>
  ({
    family: 'cls',
    row: { id, order_no: String(id) },
    clientId: 12,
  }) as unknown as ResolvedOrder;

/** A `tbl_order_notes` row, which the presenter answers with a bare id. */
const orderNote = (id: number, date_added: string | null, note = `note ${id}`) => ({
  id,
  note,
  date_added,
  note_by_name: 'Sapna Sharma',
  user_type: 'Admin',
  status: null,
});

/** A `tbl_order_destination_notes` row, which comes back prefixed `dn-`. */
const destinationNote = (
  id: number,
  date_added: string | null,
  note = `destination note ${id}`
) => ({
  id,
  note,
  date_added,
  note_by_name: 'Sapna Sharma',
  user_type: 'Admin',
  is_admin: 0,
  attachment: null,
});

/** The thread's ids, in the order a client would read them. */
const threadOrder = async (): Promise<string[]> =>
  (await comments(clsOrder())).map((comment) => comment.id);

beforeEach(() => {
  jest.clearAllMocks();
  listClsDestinationIds.mockResolvedValue([77]);
  listLegacyDestinationIds.mockResolvedValue([]);
  listClientVisibleNotes.mockResolvedValue([]);
  listClientVisibleDestinationNotes.mockResolvedValue([]);
});

describe('the merged thread', () => {
  it('interleaves the two tables by when each note was written', async () => {
    // Neither table's own list is the answer: the conversation alternates
    // between them, which is the whole reason the read merges rather than
    // concatenates.
    listClientVisibleNotes.mockResolvedValue([
      orderNote(9, '2026-06-19 16:00:00'),
      orderNote(4, '2026-06-19 09:00:00'),
    ]);
    listClientVisibleDestinationNotes.mockResolvedValue([
      destinationNote(31, '2026-06-19 14:00:00'),
      destinationNote(12, '2026-06-19 11:00:00'),
    ]);

    // Newest first, which is the direction the API answers in; the website
    // reverses it to draw the thread.
    await expect(threadOrder()).resolves.toEqual(['9', 'dn-31', 'dn-12', '4']);
  });

  it('puts a note with no usable date last, not first', async () => {
    // `date_added` is nullable on both tables and MySQL's zero date reads as
    // null too. Sorted as a string, the empty value beat every real timestamp
    // and an undated note opened the thread — reading as the first thing anyone
    // ever said about the order, which is the one thing it is not.
    listClientVisibleNotes.mockResolvedValue([
      orderNote(4, null),
      orderNote(9, '2026-06-19 16:00:00'),
    ]);
    listClientVisibleDestinationNotes.mockResolvedValue([
      destinationNote(12, '2026-06-19 11:00:00'),
    ]);

    await expect(threadOrder()).resolves.toEqual(['9', 'dn-12', '4']);
  });
});

describe('notes written on the same second', () => {
  /**
   * The case CLS actually hit: one admin submit, several rows, one timestamp.
   * Nothing about `date_added` separates these, so the id — the insertion
   * sequence on an auto-increment column — has to.
   */
  it('come back in the order they were written', async () => {
    listClientVisibleDestinationNotes.mockResolvedValue([
      destinationNote(52, '2026-06-19 15:30:10'),
      destinationNote(50, '2026-06-19 15:30:10'),
      destinationNote(51, '2026-06-19 15:30:10'),
    ]);

    await expect(threadOrder()).resolves.toEqual(['dn-52', 'dn-51', 'dn-50']);
  });

  it('come back the same way whatever order the query returned them in', async () => {
    // The point of the assertion. A filesort over equal keys is free to hand
    // these back in any order, so the merge must not inherit one.
    const notes = [
      destinationNote(50, '2026-06-19 15:30:10'),
      destinationNote(51, '2026-06-19 15:30:10'),
      destinationNote(52, '2026-06-19 15:30:10'),
    ];

    listClientVisibleDestinationNotes.mockResolvedValue([...notes].reverse());
    const first = await threadOrder();

    listClientVisibleDestinationNotes.mockResolvedValue([notes[1], notes[2], notes[0]]);
    const second = await threadOrder();

    expect(first).toEqual(['dn-52', 'dn-51', 'dn-50']);
    expect(second).toEqual(first);
  });

  it('settles a tie across the two tables the same way every time', async () => {
    // Two tables, both auto-incrementing from 1, so the ids say nothing about
    // each other. The rank between them is arbitrary — being *fixed* is not.
    listClientVisibleNotes.mockResolvedValue([orderNote(50, '2026-06-19 15:30:10')]);
    listClientVisibleDestinationNotes.mockResolvedValue([
      destinationNote(50, '2026-06-19 15:30:10'),
    ]);

    const first = await threadOrder();

    listClientVisibleNotes.mockResolvedValue([orderNote(50, '2026-06-19 15:30:10')]);
    listClientVisibleDestinationNotes.mockResolvedValue([
      destinationNote(50, '2026-06-19 15:30:10'),
    ]);

    expect(first).toHaveLength(2);
    await expect(threadOrder()).resolves.toEqual(first);
  });
});
