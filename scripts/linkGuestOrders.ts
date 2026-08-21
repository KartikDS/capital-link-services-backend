/**
 * Links orders that were lodged before an account was found for them.
 *
 * Run with `npm run orders:link` to see what it would do, and
 * `npm run orders:link -- --apply` to do it.
 *
 * `orders.lodge` now attaches a guest order to the account whose email is the
 * order's own contact address, so this only matters for rows written before that
 * — a client who ordered while signed out, whose order sits in
 * `tbl_cls_order` with `client_id` null and therefore appears in nobody's portal.
 * This is the one-off that catches those up.
 *
 * ## What it will and will not touch
 *
 * It sets `client_id` on submitted `tbl_cls_order` rows that have none, where
 * exactly one enabled account has that contact email. Nothing else: no other
 * column, no other table, and no row where the email matches two accounts —
 * `tbl_user_client.email` has no unique index, so duplicates exist, and guessing
 * which of two accounts an order belongs to is worse than leaving it for a
 * consultant.
 *
 * It also links the payment rows that belong to those orders, because
 * `tbl_payment.client_id` is what `GET /api/payments/mine` reads and a paid guest
 * order would otherwise show in the portal with no receipt behind it.
 *
 * Read-only unless `--apply` is passed. `DB_READ_ONLY=true` in `.env` refuses the
 * writes regardless, which is the safer of the two switches.
 */

import { Op } from 'sequelize';
import { env } from '../src/config/env';
import {
  assertDatabaseConnection,
  closeDatabase,
} from '../src/config/database';
import { ClsOrder, Payment, UserClient } from '../src/models';
import { ENABLED } from '../src/domain/codes';

const apply = process.argv.includes('--apply');

/** Accounts that may sign in — the same scope the auth module uses. */
const signInScope = {
  s_enabled: ENABLED,
  s_archive: { [Op.or]: [{ [Op.is]: null }, { [Op.ne]: 1 }] },
};

interface Candidate {
  order: ClsOrder;
  clientId: number;
  email: string;
}

const main = async (): Promise<void> => {
  console.log(
    `${apply ? 'Linking' : 'Checking'} unattached orders in ${env.database.name}\n`
  );

  await assertDatabaseConnection();

  const unattached = await ClsOrder.findAll({
    where: {
      client_id: { [Op.is]: null },
      // Submitted only. An unsubmitted row is somebody's abandoned form, and
      // attaching one would put a half-finished basket in a client's portal.
      date_submitted: { [Op.ne]: null },
      contact_email: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] },
    },
    order: [['id', 'ASC']],
  });

  if (unattached.length === 0) {
    console.log('No submitted order is missing its account. Nothing to do.');
    return;
  }

  console.log(`${unattached.length} submitted order(s) with no client_id.\n`);

  const candidates: Candidate[] = [];
  let ambiguous = 0;
  let unmatched = 0;

  for (const order of unattached) {
    const email = order.contact_email?.trim().toLowerCase() ?? '';
    const reference = order.order_no?.trim() || `id ${order.id}`;

    const accounts = await UserClient.findAll({
      attributes: ['id', 'email'],
      where: { email, ...signInScope },
      order: [['id', 'ASC']],
    });

    if (accounts.length === 0) {
      unmatched += 1;
      console.log(`  ${reference}  ${email}  → no account, left as a guest order`);
      continue;
    }

    if (accounts.length > 1) {
      ambiguous += 1;
      console.log(
        `  ${reference}  ${email}  → ${accounts.length} accounts share that address, SKIPPED`
      );
      continue;
    }

    const clientId = accounts[0]!.id;
    candidates.push({ order, clientId, email });
    console.log(`  ${reference}  ${email}  → client ${clientId}`);
  }

  console.log(
    `\n${candidates.length} to link, ${unmatched} with no account, ${ambiguous} ambiguous.`
  );

  if (!apply) {
    console.log('\nNothing was written. Re-run with --apply to link them.');
    return;
  }

  let orders = 0;
  let payments = 0;

  for (const { order, clientId } of candidates) {
    await order.update({ client_id: clientId });
    orders += 1;

    // The payments on this order, by the numeric key `tbl_payment.order_no`
    // holds — the digits of the reference, which is the order's own id. Only
    // rows with no client of their own are touched.
    const [updated] = await Payment.update(
      { client_id: clientId },
      { where: { order_no: order.id, client_id: { [Op.is]: null } } }
    );

    payments += updated;
  }

  console.log(`\nLinked ${orders} order(s) and ${payments} payment row(s).`);
};

main()
  .then(() => closeDatabase())
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      `\nFailed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
