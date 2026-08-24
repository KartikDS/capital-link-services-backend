import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { env } from '../config/env';
import type { ClsOrder } from '../models';
import {
  Categories,
  CategoryLocations,
  CategoryNationalities,
  ClsOrderDestinations,
  ClsOrderDocuments,
  Documents,
  OrderTravellerDetails,
} from '../models';
import { toLegacyDateTime } from '../shared/dates';
import { clean } from '../shared/text';
import { logger } from '../shared/logger';
import { DOCUMENT_STATUS } from './codes';

/**
 * The document checklist: deriving what an order needs, and writing it down.
 *
 * This reproduces the old application's behaviour, which had no equivalent here
 * and is the one place a new order looked materially different to a consultant.
 *
 * ## What the old application does
 *
 * A checklist is not typed in by anybody. It is *derived* from the catalogue —
 * `tbl_categories` → `tbl_category_documents`/`tbl_documents` — and then frozen
 * onto the order as one `tbl_cls_order_documents` row per **required document ×
 * traveller**, at `status = 0` (unattended). The client then uploads against a
 * row, which flips it to `1`, and a consultant reviews it to `2`/`3`/`4`.
 *
 * Two places in the old code do the materialising, and both guard on the order
 * having no rows yet:
 *
 * - `CLShomeBundle/Controller/VisaInformationController.php:1309` — right after
 *   the payment succeeds.
 * - `CLSadminBundle/Controller/ManageOrderDocumentsController.php:47` — lazily,
 *   when a staff member opens the order's documents page.
 *
 * So it is idempotent and may run at any point. That is what makes it safe to
 * call it from more than one place here too.
 *
 * ## Why this matters beyond parity
 *
 * Without it a consultant sees what the client *sent* and never what the order
 * still *needs*: the "unattended" state simply never occurs. The old admin's
 * document screen also has nothing to list, because it queries by
 * `(country_id, visa_type_id, order_id, traveller_id)` and rows with those left
 * null match nothing.
 *
 * ## What it will not do
 *
 * It never guesses. A category resolves from five inputs — country, visa type,
 * nationality, entry option and process location — and an order that has not got
 * them (a police clearance and a Russian voucher never do; an attestation gets
 * its visa type from a consultant later) yields no documents and gets no
 * checklist. A list of the wrong documents is worse than no list, and the old
 * application takes the same view: its own matcher returns nothing rather than
 * widening.
 */

// ---------------------------------------------------------------------------
// Resolving the category
// ---------------------------------------------------------------------------

/** What the matcher needs. Any missing piece means no checklist. */
export interface ChecklistScope {
  countryId: number | null;
  visaTypeId: number | null;
  nationality: number | null;
  entryOption: number | null;
  processLocationId: number | null;
  region: string | null;
}

/**
 * `tbl_documents.entry_option` is a comma-separated set, not an integer.
 *
 * The old query uses `FIND_IN_SET(:entryOption, dt.entry_option)`, and there is
 * no Sequelize operator for that — so this is one of the few places that drops
 * to a literal. The value is an integer that has already been through Zod, and
 * it is interpolated as a bound replacement rather than concatenated, so it
 * cannot carry anything but a number.
 */
const FIND_IN_SET_ENTRY_OPTION = 'FIND_IN_SET(:entryOption, `tbl_documents`.`entry_option`)';

/**
 * The categories matching a scope, and their children.
 *
 * Mirrors `GlobalController::getAllDocumentsByCategory` lines 223-247: match on
 * country + visa type, joined through `tbl_category_nationalities` and
 * `tbl_category_locations`, then collect the **children** of each match.
 *
 * The parent's own id is deliberately not collected — the old code appends only
 * `$childCategory['id']`, so a parent category contributes its children's
 * documents and none of its own. Reproduced rather than corrected, because the
 * catalogue was built against that behaviour and "fixing" it here would attach
 * documents to orders that CLS has never seen attached.
 */
const childCategoryIds = async (scope: ChecklistScope): Promise<number[]> => {
  if (
    scope.countryId === null ||
    scope.visaTypeId === null ||
    scope.nationality === null ||
    scope.processLocationId === null
  ) {
    return [];
  }

  const [nationalityRows, locationRows] = await Promise.all([
    CategoryNationalities.findAll({
      attributes: ['category_id'],
      where: { nationality_id: scope.nationality },
    }),
    CategoryLocations.findAll({
      attributes: ['category_id'],
      where: { location_id: scope.processLocationId },
    }),
  ]);

  // The old query inner-joins both tables, so a category has to appear in each.
  const byLocation = new Set(
    locationRows.map((row) => row.category_id).filter((id): id is number => id !== null)
  );
  const eligible = nationalityRows
    .map((row) => row.category_id)
    .filter((id): id is number => id !== null && byLocation.has(id));

  if (eligible.length === 0) return [];

  const matched = await Categories.findAll({
    attributes: ['id'],
    where: {
      id: { [Op.in]: eligible },
      country_id: scope.countryId,
      visa_type_id: scope.visaTypeId,
    },
  });

  if (matched.length === 0) return [];

  const children = await Categories.findAll({
    attributes: ['id'],
    where: { parent_id: { [Op.in]: matched.map((row) => row.id) } },
    order: [['category', 'ASC']],
  });

  return children.map((row) => row.id);
};

/**
 * The documents an order requires, in the order the old application lists them.
 *
 * Mirrors lines 249-280 of the same function: scope to the matched child
 * categories when there are any, fall back to country + visa type alone when
 * there are not, and in both cases require the entry option to be in the
 * document's set. `ORDER BY document_name` throughout.
 */
export const resolveRequiredDocuments = async (
  scope: ChecklistScope
): Promise<Documents[]> => {
  if (scope.countryId === null || scope.visaTypeId === null || scope.entryOption === null) {
    return [];
  }

  const categoryIds = await childCategoryIds(scope);

  return Documents.findAll({
    where: {
      country_id: scope.countryId,
      visa_type_id: scope.visaTypeId,
      ...(categoryIds.length > 0 ? { category_id: { [Op.in]: categoryIds } } : {}),
      [Op.and]: sequelize.literal(FIND_IN_SET_ENTRY_OPTION),
    },
    replacements: { entryOption: scope.entryOption },
    order: [['document_name', 'ASC']],
  });
};

// ---------------------------------------------------------------------------
// Writing it onto the order
// ---------------------------------------------------------------------------

/**
 * The scope of an order, read off the header and its destination row.
 *
 * `nationality` comes from the destination row rather than the client, matching
 * `VisaInformationController.php:1305` — the nationality that decides which
 * documents an embassy wants is the traveller's, which is what was recorded on
 * the destination when the order was placed.
 */
export const scopeOfOrder = async (order: ClsOrder): Promise<ChecklistScope> => {
  const destination = await ClsOrderDestinations.findOne({
    where: { order_id: order.id },
    order: [['id', 'ASC']],
  });

  const visaTypeId =
    destination?.visa_type_id ?? Number.parseInt(clean(order.visa_type) ?? '', 10);

  return {
    countryId: destination?.country_id ?? order.destination ?? null,
    visaTypeId: Number.isSafeInteger(visaTypeId) ? visaTypeId : null,
    nationality: destination?.nationality ?? null,
    entryOption: destination?.entry_option ?? null,
    processLocationId: destination?.process_location_id ?? null,
    region: clean(destination?.region),
  };
};

export interface ChecklistResult {
  /** Rows written. Zero when the scope resolved nothing, or one already existed. */
  created: number;
  /** Why nothing was written, for the caller's log. Absent when something was. */
  reason?: 'already-materialised' | 'no-scope' | 'no-documents' | 'no-travellers';
}

/**
 * Writes the checklist for an order, once.
 *
 * Guarded three ways, in the order the old application guards: the order must
 * have no checklist rows already, the scope must resolve documents, and there
 * must be travellers to attach them to. Every guard returns a reason rather than
 * throwing — every caller is doing something else more important (recording a
 * payment, answering a read) and none of them should fail because a catalogue
 * lookup came back empty.
 *
 * `status` is `UNATTENDED` and `document` holds the **catalogue's** filename, not
 * an upload — that is what `VisaInformationController.php:1332` writes, and the
 * upload path overwrites it when a file arrives.
 */
export const materialiseChecklist = async (
  order: ClsOrder
): Promise<ChecklistResult> => {
  const existing = await ClsOrderDocuments.count({ where: { order_id: order.id } });
  if (existing > 0) return { created: 0, reason: 'already-materialised' };

  const scope = await scopeOfOrder(order);
  if (scope.countryId === null || scope.visaTypeId === null || scope.entryOption === null) {
    return { created: 0, reason: 'no-scope' };
  }

  const [documents, travellers] = await Promise.all([
    resolveRequiredDocuments(scope),
    OrderTravellerDetails.findAll({
      where: { order_id: order.id },
      order: [['id', 'ASC']],
    }),
  ]);

  if (documents.length === 0) return { created: 0, reason: 'no-documents' };
  if (travellers.length === 0) return { created: 0, reason: 'no-travellers' };

  const now = toLegacyDateTime();

  // One row per document per traveller — the old application's nested loop.
  const rows = documents.flatMap((document) =>
    travellers.map((traveller) => ({
      order_id: order.id,
      country_id: document.country_id,
      visa_type_id: document.visa_type_id,
      entry_option: scope.entryOption,
      process_location_id: scope.processLocationId,
      nationality: scope.nationality,
      region: scope.region,
      category_id: document.category_id,
      document_id: document.id,
      traveller_id: traveller.id,
      document: document.document,
      status: DOCUMENT_STATUS.UNATTENDED,
      created: now,
      modified: now,
    }))
  );

  await ClsOrderDocuments.bulkCreate(rows);

  logger.info('Document checklist materialised', {
    orderId: order.id,
    documents: documents.length,
    travellers: travellers.length,
    rows: rows.length,
  });

  return { created: rows.length };
};

/**
 * Materialises without ever failing the caller.
 *
 * For the paths where the checklist is a side effect of something that has
 * already succeeded — a payment that has been taken, a read a client is waiting
 * on. A catalogue that cannot be reached must not turn either into an error.
 *
 * `DB_READ_ONLY` is checked rather than caught. The guard would refuse the
 * insert anyway, but this runs on every read of an order's documents, and a
 * read-only deployment would then log an error per request for a condition that
 * is deliberate and unchanging.
 */
export const materialiseChecklistQuietly = async (order: ClsOrder): Promise<void> => {
  if (env.database.readOnly) return;

  try {
    await materialiseChecklist(order);
  } catch (error) {
    logger.error('Could not materialise the document checklist', {
      orderId: order.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
