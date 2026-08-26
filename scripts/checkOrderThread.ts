/**
 * Shows exactly what is on one order's consultant thread, and who can see it.
 *
 * Run with `npm run thread:check -- 10034352`.
 *
 * ## Why this exists
 *
 * "I replied in the admin and the client cannot see it" has three possible
 * causes and the screens cannot tell them apart: the note was written to the
 * staff-only side, the note was written against a different destination row, or
 * the note was never saved at all. All three look identical in a browser. This
 * prints the rows, so the answer takes one command instead of an argument.
 *
 * The column that decides it is `is_admin`, and **it reads backwards from its
 * name**: the admin box labelled "Client comment" writes `0` and is the message
 * *to* the client; "Admin comment" writes `1` and never leaves CLS. So a note
 * printed below as `internal` is invisible to the client by design, however much
 * it looks like a reply on the admin screen.
 *
 * Strictly read-only. Every statement is a SELECT, and the query guard in
 * `config/database` would refuse anything else.
 */

import { QueryTypes } from 'sequelize';
import {
  assertDatabaseConnection,
  closeDatabase,
  sequelize,
} from '../src/config/database';

interface NoteRow {
  id: number;
  destination_id: number | null;
  is_admin: number | null;
  user_type: string | null;
  note_by_name: string | null;
  date_added: string | null;
  note: string | null;
  attachment: string | null;
}

const main = async (): Promise<void> => {
  const raw = process.argv[2];
  const orderId = Number.parseInt(raw ?? '', 10);

  if (!Number.isSafeInteger(orderId)) {
    console.error('Usage: npm run thread:check -- <order id>, e.g. 10034352');
    console.error('The id is the number in the admin URL and after "CLS-".');
    process.exit(1);
  }

  await assertDatabaseConnection();

  const destinations = await sequelize.query<{ id: number }>(
    'SELECT id FROM tbl_cls_order_destinations WHERE order_id = :orderId ORDER BY id',
    { type: QueryTypes.SELECT, replacements: { orderId } }
  );

  const ids = destinations.map((row) => row.id);

  console.log(`\nOrder ${orderId} (CLS-${orderId})`);
  console.log(
    `Destination rows: ${ids.length ? ids.join(', ') : 'none — the thread has nowhere to hang'}`
  );

  if (ids.length > 0) {
    const notes = await sequelize.query<NoteRow>(
      `SELECT id, destination_id, is_admin, user_type, note_by_name, date_added,
              note, attachment
         FROM tbl_order_destination_notes
        WHERE destination_id IN (:ids)
        ORDER BY date_added, id`,
      { type: QueryTypes.SELECT, replacements: { ids } }
    );

    console.log(`\nConsultant thread — ${notes.length} note(s):\n`);

    if (notes.length === 0) {
      console.log('  (nothing written yet)');
    }

    for (const note of notes) {
      // Null counts as client-visible: the column defaults to 0 and rows written
      // before it existed have no value.
      const visible = note.is_admin === null || note.is_admin === 0;

      console.log(
        [
          `  #${note.id}`,
          visible ? 'CLIENT SEES THIS' : 'internal — client cannot see it',
          `by ${note.note_by_name ?? '?'} (${note.user_type ?? '?'})`,
          note.date_added ?? 'no date',
          note.attachment ? `file: ${note.attachment}` : '',
        ]
          .filter(Boolean)
          .join('  |  ')
      );
      console.log(`      ${(note.note ?? '').replace(/\s+/g, ' ').slice(0, 100)}`);
    }

    const hidden = notes.filter(
      (note) => note.is_admin !== null && note.is_admin !== 0
    ).length;

    if (hidden > 0) {
      console.log(
        `\n  ${hidden} note(s) are staff-only. If one of those was meant for the client,` +
          '\n  it was typed into the "Admin comment" box; retype it in "Client comment".'
      );
    }
  }

  const orderNotes = await sequelize.query<NoteRow & { is_deleted: number }>(
    `SELECT id, is_admin, is_deleted, user_type, note_by_name, date_added, note
       FROM tbl_order_notes
      WHERE order_no = :orderId
      ORDER BY date_added, id`,
    { type: QueryTypes.SELECT, replacements: { orderId } }
  );

  console.log(`\ntbl_order_notes — ${orderNotes.length} row(s)`);
  console.log(
    '  (the order-form summary and the chargeable document lines live here;' +
      '\n   it is the thread only on orders with no destination row)\n'
  );

  for (const note of orderNotes) {
    console.log(
      `  #${note.id}  ${note.is_admin ? 'internal' : 'client-visible'}  by ${
        note.note_by_name ?? '?'
      }  ${note.date_added ?? ''}`
    );
  }

  await closeDatabase();
};

main().catch((error: unknown) => {
  console.error('FAILED:', error instanceof Error ? error.message : error);
  process.exit(1);
});
