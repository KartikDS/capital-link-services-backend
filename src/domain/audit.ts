import type { Request } from 'express';
import { Logs } from '../models';
import { toLegacyDateTime } from '../shared/dates';
import { logger } from '../shared/logger';
import { LOG_AREA } from './codes';

/**
 * Writes an audit entry: one row in `tbl_logs`, area `admin`, whose detail is
 * the action name plus whatever the caller thought worth recording.
 *
 * Failures are swallowed and logged. An audit write that fails must not fail the
 * action it was recording — but it must be noticeable, which is what the
 * `logger.error` is for.
 *
 * Lives here rather than inside the admin router so the other modules that carry
 * admin writes (the enquiry queue, for one) record them the same way, into the
 * same table, for the same Audit log screen to show.
 */
export const audit = async (
  req: Request,
  action: string,
  detail: Record<string, unknown>
): Promise<void> => {
  try {
    await Logs.create({
      area: LOG_AREA.ADMIN,
      user_id: req.auth?.sub ?? null,
      user_type: 'admin',
      log_datetime: toLegacyDateTime(),
      log_details: JSON.stringify({ action, ...detail }).slice(0, 60_000),
    });
  } catch (error) {
    logger.error('Audit write failed', {
      action,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
