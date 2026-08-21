import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../config/env';
import { logger } from '../../shared/logger';

/**
 * Holding an order's confirmation until the money lands.
 *
 * ## The problem this exists to solve
 *
 * An order that has not been paid for is not confirmed, so nothing may be sent
 * about it — not to the client, not to CLS. Only the payment turns it into an
 * order anybody should act on.
 *
 * That is easy to state and awkward to implement, because of *where* the
 * confirmation can be rendered. The website renders it at checkout, and has to:
 * the order tables fold the second entry dates, the lodgement post, the purpose
 * and the passport dates into single free-text columns (see the note on `comment`
 * in the website's `voucherOrderRequest`), so an email built by reading the order
 * back afterwards cannot print those as the rows the client's own template asks
 * for. The full application exists exactly once, in the request that placed it.
 *
 * So the confirmation is rendered at checkout and **parked here**, and the
 * payment path takes it back out and posts it. Rendered early, sent late.
 *
 * ## Why a spool file rather than a table
 *
 * There is no table for it and there cannot be one: this schema is CLS's, it is
 * fixed, and adding a column is DDL this API does not do. A row in
 * `tbl_order_notes` would be the alternative, and that is a MyISAM table whose
 * contents CLS's own screens display — an HTML email body is not a note a
 * consultant should be shown.
 *
 * So: one JSON file per unpaid order, under `UPLOAD_DIR`, which this deployment
 * already treats as its writable state. They are transient by design.
 *
 * ## The two properties that make this safe
 *
 * **Taking is atomic.** `/api/webhooks/stripe` and `/payment/success` both confirm
 * the same payment, and both ask for the parked confirmation. `take` claims it by
 * creating a marker file with the exclusive-create flag — which either creates the
 * file or fails with `EEXIST`, and cannot do both — so the loser gets null and
 * sends nothing. One payment, one confirmation, with no second deduplication
 * mechanism to keep in step.
 *
 * It is worth saying why it is not the obvious `rename`, which is the usual way to
 * claim a file: **`rename` is not exclusive on Windows**, which this deployment
 * runs on. Concurrent renames of the same source all report success there — four
 * simultaneous takers won 147 times out of 200 in a stress test — because libuv's
 * `MoveFileEx` path retries rather than reporting that the source has gone. The
 * `wx` open won 0 times out of 200. `tests/unit/orderConfirmations` keeps that
 * honest with a concurrent take.
 *
 * **Nothing lingers.** The file is deleted the moment it has been handed over.
 * These hold names, passport numbers and addresses, so an abandoned checkout must
 * not leave one on disk indefinitely: `park` sweeps anything older than
 * `MAX_AGE_MS` on its way past, which bounds the directory without needing a
 * scheduled job.
 */

const DIRECTORY = 'pending-confirmations';

/**
 * What marks a confirmation as taken.
 *
 * Its existence is the claim, so it outlives the confirmation itself and is
 * removed by the sweep rather than by the taker. Empty, and named after the
 * reference only — it holds nothing.
 */
const CLAIM_SUFFIX = '.claim';

/**
 * How long an unpaid order's confirmation is kept.
 *
 * A Stripe checkout session expires after 24 hours, so a parked confirmation
 * older than that can never be claimed by a payment — it belongs to a checkout
 * nobody completed. Two days rather than one so that a client who pays at the
 * very edge of the window, or a webhook that is redelivered after an outage,
 * still finds it.
 */
const MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

/** What the website parks: the rendered email and where it goes. */
export interface ParkedConfirmation {
  /** The rendered email — subject, HTML and plain text. */
  content: { subject: string; html: string; text: string };
  /**
   * The client's address, or null.
   *
   * Null is real: a guest can reach the checkout without giving one, and the
   * order still stands. The caller sends CLS's copy alone in that case.
   */
  recipient: string | null;
}

const directory = (): string => path.join(env.uploads.dir, DIRECTORY);

/**
 * A reference turned into a filename that cannot escape the directory.
 *
 * Whitelisted rather than escaped. `order_no` is TEXT in a schema this API does
 * not control, so a reference is not guaranteed to be `CLS-000451` — and a
 * reference containing `../` used as a path is how a spool directory becomes a
 * write primitive. Anything outside the pattern is refused rather than mangled
 * into something that might collide with another order's file.
 */
const fileFor = (reference: string): string | null => {
  const trimmed = reference.trim();

  if (!/^[A-Za-z0-9._-]{1,64}$/.test(trimmed)) return null;
  // Belt and braces: the pattern already excludes both, but a filename that is
  // `.` or `..` resolves to the directory itself.
  if (trimmed === '.' || trimmed === '..') return null;

  return path.join(directory(), `${trimmed}.json`);
};

/**
 * Deletes confirmations too old to belong to a live checkout.
 *
 * Runs on the way past rather than on a timer, because a deployment that parks
 * nothing has nothing to sweep and one that parks constantly sweeps constantly.
 * Failures are swallowed: a full or unreadable directory must not stop an order
 * being parked, which is the thing the client is waiting on.
 */
const sweep = async (): Promise<void> => {
  try {
    const names = await fs.readdir(directory());
    const cutoff = Date.now() - MAX_AGE_MS;
    let removed = 0;

    for (const name of names) {
      // Both the parked confirmations and the markers left by taking one. A
      // marker is empty and holds nothing, but there is no reason to keep it
      // once no payment could still arrive for that order.
      if (!name.endsWith('.json') && !name.endsWith(CLAIM_SUFFIX)) continue;

      const file = path.join(directory(), name);
      const stats = await fs.stat(file).catch(() => null);

      if (stats && stats.mtimeMs < cutoff) {
        await fs.unlink(file).catch(() => {});
        removed += 1;
      }
    }

    if (removed > 0) {
      logger.info('Swept confirmations for checkouts nobody completed', {
        removed,
      });
    }
  } catch {
    // Nothing parked yet, or the directory is unreadable. Neither is worth
    // failing a checkout over.
  }
};

/**
 * Holds an order's confirmation until its payment arrives.
 *
 * Written to a temporary name and renamed into place, so a reader can never see
 * half a file. Overwrites any existing one for the same reference: a client who
 * returns to the order page and starts a second checkout should have the newer
 * confirmation sent, not the abandoned one.
 */
export const park = async (
  reference: string,
  parked: ParkedConfirmation
): Promise<boolean> => {
  const file = fileFor(reference);

  if (!file) {
    logger.warn('Refused to park a confirmation for an odd-looking reference', {
      reference,
    });
    return false;
  }

  await fs.mkdir(directory(), { recursive: true });
  await sweep();

  const temporary = `${file}.${process.pid}.tmp`;

  try {
    await fs.writeFile(temporary, JSON.stringify(parked), 'utf8');
    await fs.rename(temporary, file);
    // A marker left by an earlier take would make this new confirmation
    // unclaimable. Parking means it has not been sent, whatever happened before.
    await fs.unlink(`${file}${CLAIM_SUFFIX}`).catch(() => {});
  } catch (error) {
    await fs.unlink(temporary).catch(() => {});
    throw error;
  }

  logger.info('Order confirmation parked until payment', { reference });

  return true;
};

/**
 * Takes an order's confirmation, once.
 *
 * The claim marker is the whole mechanism: `wx` either creates the file or fails
 * with `EEXIST`, and cannot do both, so of two callers racing exactly one gets
 * past it. The winner sends the email; the loser sends nothing and is not an
 * error, because "somebody else already did it" is the expected outcome on one of
 * the two payment paths every single time.
 *
 * The marker is deliberately left behind. It is what makes the claim durable —
 * delete it and a Stripe redelivery an hour later could take a confirmation that
 * has already gone out. It holds nothing, and the sweep removes it on the same
 * two-day rule as everything else here.
 *
 * Null also covers the ordinary cases — an order that was never parked, one whose
 * confirmation has been swept, or a reference that is not a plausible filename. A
 * caller cannot tell those apart and should not need to: in every one of them
 * there is no confirmation to send.
 */
export const take = async (
  reference: string
): Promise<ParkedConfirmation | null> => {
  const file = fileFor(reference);
  if (!file) return null;

  try {
    // Not `writeFile`, which would truncate an existing marker and hand the
    // confirmation to a second caller. `wx` is the flag that refuses.
    const handle = await fs.open(`${file}${CLAIM_SUFFIX}`, 'wx');
    await handle.close();
  } catch {
    // EEXIST — already taken. Or ENOENT on the directory, which means nothing
    // was ever parked here.
    return null;
  }

  try {
    const raw = await fs.readFile(file, 'utf8');

    return JSON.parse(raw) as ParkedConfirmation;
  } catch {
    // Never parked, or swept. Not an error: the marker now records that this
    // reference has been asked for and answered.
    return null;
  } finally {
    // Deleted whether or not it parsed. It holds the client's own details and
    // the marker means nothing will ever read it again.
    await fs.unlink(file).catch(() => {});
  }
};

/**
 * Discards an order's parked confirmation without sending it.
 *
 * For a checkout that failed after the order was lodged — Stripe unreachable, a
 * session that never opened. The order stands and a consultant can see it, but
 * nothing was charged, so there is no confirmation to send and no reason to leave
 * the client's details sitting on disk until the sweep notices.
 */
export const discard = async (reference: string): Promise<void> => {
  const file = fileFor(reference);
  if (!file) return;

  await fs.unlink(file).catch(() => {});
  await fs.unlink(`${file}${CLAIM_SUFFIX}`).catch(() => {});
};
