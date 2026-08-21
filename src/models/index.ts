import { generatedModels } from './generated';
import { applyAssociations } from './associations';

/**
 * The model layer's public surface.
 *
 * Importing this module wires the associations exactly once, so no caller has
 * to remember to. Everything else in the codebase imports models from here
 * rather than from `./generated`, which keeps "did the associations run?" from
 * depending on import order.
 */

applyAssociations();

export * from './generated';
export { generatedModels } from './generated';
export type { GeneratedModelName } from './generated';

/** Convenience alias used across the service layer. */
export const db = generatedModels;

/**
 * Tables present in the database but deliberately unmodelled.
 *
 * Listed so the schema check script can report them as known-skipped rather
 * than as drift. See `scripts/generateModels.ts` for why each one is here.
 */
export const UNMODELLED_TABLES = [
  'tbl_cls_order-19-2-2021',
  'tbl_orders-21-2-2021',
  'tbl_user_client-issuetest',
  'tbl_migration_debug',
  'tbl_myob_keys_development',
] as const;
