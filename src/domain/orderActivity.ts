import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { toLegacyDateTime } from '../shared/dates';
import { logger } from '../shared/logger';

/**
 * What a client does on an order, written into the order's Activity feed.
 *
 * The Activity tab on the admin order screen reads `tbl_ops_activity`. Staff
 * actions land there already; this adds the client's side (a document they
 * uploaded, a message they posted, a cancellation they asked for, a return
 * address they confirmed) so a consultant sees the whole story in one place.
 *
 * ## Best effort, and never in the client's way
 *
 * The client's own action has already succeeded by the time this runs. A feed
 * entry failing to write — the Ops tables not applied on this database, a
 * read-only deployment, a dropped connection — must not turn their upload or
 * message into an error, so every failure is swallowed and logged. The entry is
 * kind `client` with no admin id; the feed shows its author as "Client".
 */
export const logClientActivity = async (
  orderId: number,
  text: string
): Promise<void> => {
  try {
    await sequelize.query(
      `INSERT INTO tbl_ops_activity (order_id, kind, text, admin_id, created_at)
       VALUES (:orderId, 'client', :text, NULL, :at)`,
      {
        type: QueryTypes.INSERT,
        replacements: {
          orderId,
          text: text.slice(0, 500),
          at: toLegacyDateTime(),
        },
      }
    );
  } catch (error) {
    logger.warn('Could not record client activity on the order feed', {
      orderId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
};

/** A line of the client's own words, shortened for a feed entry. */
export const snippet = (value: string, max = 120): string => {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
