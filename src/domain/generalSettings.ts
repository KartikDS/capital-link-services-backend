import { Op } from 'sequelize';

/**
 * The general settings the old application left behind.
 *
 * `tbl_general_settings` holds seven rows, ids 1 to 11, created between 2019 and
 * 2022. Nothing in this codebase or in the old PHP reads any of them by name, and
 * several are test entries. The new back office starts with a blank list, so
 * these are filtered out of every read and write here.
 *
 * They are **hidden, not deleted**: the app issues no destructive change to
 * CLS's live data, the rows stay in the table exactly as they were, and anything
 * outside this codebase that does read them is unaffected. Settings created from
 * the new back office get higher ids and show as normal.
 */
export const LEGACY_SETTING_MAX_ID = 11;

/** A `where` fragment that leaves out the legacy rows. */
export const visibleSettings = { id: { [Op.gt]: LEGACY_SETTING_MAX_ID } };
