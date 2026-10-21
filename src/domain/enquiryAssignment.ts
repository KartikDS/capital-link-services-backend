import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { logger } from '../shared/logger';

/**
 * Who is handling an enquiry — `tbl_inquiries.assigned_to`, a `tbl_user_admin.id`.
 *
 * ## Why raw SQL and not the model
 *
 * The column comes from `db/migrations/2026-10-21-enquiry-assignment.sql`, which
 * CLS's DBA applies; it is not in the schema dump the models are generated from.
 * Adding it to `Inquiries` would make every `SELECT` on that table name a column
 * that may not exist yet, and take the public enquiry forms down with it. These
 * helpers touch the column alone and report "not available" instead of throwing,
 * so the screen works before and after the migration.
 */

/** MySQL's "Unknown column" — the migration has not been applied. */
const isMissingColumn = (error: unknown): boolean => {
  const cause = error as { original?: { code?: string }; parent?: { code?: string } };
  const code = cause.original?.code ?? cause.parent?.code;
  return code === 'ER_BAD_FIELD_ERROR';
};

export interface AssignmentLookup {
  /** False until the column exists. */
  available: boolean;
  byEnquiry: ReadonlyMap<number, number>;
}

/** The assignee of each enquiry in `ids`; unassigned ones are simply absent. */
export const readAssignments = async (
  ids: readonly number[]
): Promise<AssignmentLookup> => {
  if (ids.length === 0) return { available: true, byEnquiry: new Map() };

  try {
    const rows = await sequelize.query<{ id: number; assigned_to: number | null }>(
      'SELECT id, assigned_to FROM tbl_inquiries WHERE id IN (:ids)',
      { replacements: { ids: [...ids] }, type: QueryTypes.SELECT }
    );
    const byEnquiry = new Map<number, number>();
    for (const row of rows) {
      if (row.assigned_to !== null) byEnquiry.set(row.id, row.assigned_to);
    }
    return { available: true, byEnquiry };
  } catch (error) {
    if (!isMissingColumn(error)) throw error;
    logger.warn(
      'tbl_inquiries.assigned_to is missing; apply the enquiry-assignment migration'
    );
    return { available: false, byEnquiry: new Map() };
  }
};

/** Enquiry ids assigned to `adminId` — the "assigned to" filter. `null` if the column is absent. */
export const enquiryIdsAssignedTo = async (adminId: number): Promise<number[] | null> => {
  try {
    const rows = await sequelize.query<{ id: number }>(
      'SELECT id FROM tbl_inquiries WHERE assigned_to = :adminId',
      { replacements: { adminId }, type: QueryTypes.SELECT }
    );
    return rows.map((row) => row.id);
  } catch (error) {
    if (isMissingColumn(error)) return null;
    throw error;
  }
};

/** Sets or clears the assignee. Returns false when the column does not exist yet. */
export const writeAssignment = async (
  enquiryId: number,
  adminId: number | null
): Promise<boolean> => {
  try {
    await sequelize.query(
      'UPDATE tbl_inquiries SET assigned_to = :adminId WHERE id = :enquiryId',
      { replacements: { adminId, enquiryId } }
    );
    return true;
  } catch (error) {
    if (isMissingColumn(error)) return false;
    throw error;
  }
};
