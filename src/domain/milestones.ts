import { toIso } from '../shared/dates';

/**
 * Where an order's four processing milestone dates actually live.
 *
 * The portal draws one stepper — received, submitted, completed, on its way —
 * and the schema records those four dates in **two** different places, depending
 * on which screen in CLS's admin stamps them:
 *
 * - **The per-service detail tables.** `tbl_police_clearance_order_details`,
 *   `tbl_russian_visa_voucher_order_details` and
 *   `tbl_document_legalization_order_details` each carry their own copy of
 *   `date_cls_received_all_items` and its three siblings.
 *   `ViewOrderController:viewPoliceClearance` and `:viewRussianVisaVoucher`
 *   write there.
 *
 * - **The destination rows.** `tbl_cls_order_destinations` — and
 *   `tbl_order_destinations` for the older family — carry the same four dates
 *   under `visa_date_*` names. `ViewOrderController:viewPublicVisa` and
 *   `:viewDocLegalisation` write *there*, and the template reads them back from
 *   there too: `docLegalisation.html.twig:62` binds the "All items received at
 *   CLS" field to `orderData.travels.visa_date_cls_received_all_items`, which is
 *   the destination row.
 *
 * So a document legalisation order's timeline is stamped on its destination row
 * and never on its legalisation detail row, whichever site the order was placed
 * through. Reading only the detail tables is what left a legalisation order
 * showing four pending steps in the portal while CLS's own admin showed it
 * received and submitted: the dates were in the database the whole time, one
 * table over. Both places are read here, and a slot the detail row does not
 * carry falls back to the destinations.
 *
 * Precedence is per slot, detail row first. The two hold the same four facts and
 * in practice only one screen writes an order's timeline, so they rarely both
 * carry a value — and where they do, the service's own detail table is the more
 * specific record.
 *
 * ## Orders with several destinations
 *
 * A public visa order carries a destination row per country, each stamped as
 * that embassy gets to it. The portal's stepper is one line for the whole order,
 * so a slot counts as reached only when **every** destination has it — the same
 * rule the legacy admin applies when it decides an order is closed
 * (`count(destinations) == count_order_closed`) — and the date reported is the
 * last of them, which is when the order as a whole got there.
 */

/** The four slots, in the order they happen. Every reader returns this length. */
export const MILESTONE_SLOTS = 4;

/**
 * A per-service detail row: police clearance, voucher or legalisation.
 *
 * Typed as `unknown` per column because these are `varchar` in the dump and hold
 * whatever the old application wrote — `2026-08-26 09:28:15`, `0000-00-00`, or
 * an empty string. `toIso` is the one place that decides what a value means.
 */
export interface MilestoneDetailRow {
  date_cls_received_all_items?: unknown;
  date_submitted_for_processing?: unknown;
  date_completed_and_received_at_cls?: unknown;
  date_order_on_route_and_closed?: unknown;
}

/** A destination row, in either family — the columns are named the same. */
export interface MilestoneDestinationRow {
  visa_date_cls_received_all_items?: unknown;
  visa_date_submitted_for_processing?: unknown;
  visa_date_completed_and_received_at_cls?: unknown;
  visa_date_order_on_route_and_closed?: unknown;
}

/** The copy `tbl_orders` keeps on the order row itself. */
export interface LegacyMilestoneRow {
  police_clearance_date_cls_received_all_items?: unknown;
  police_clearance_date_submitted_for_processing?: unknown;
  police_clearance_date_completed_and_received_at_cls?: unknown;
  police_clearance_date_order_on_route_and_closed?: unknown;
}

/** What a `tbl_cls_order` read has to have loaded for its timeline to be right. */
export interface ClsMilestoneSources {
  policeClearanceDetails?: readonly MilestoneDetailRow[] | null;
  voucherDetails?: readonly MilestoneDetailRow[] | null;
  legalisationDetails?: readonly MilestoneDetailRow[] | null;
  destinations?: readonly MilestoneDestinationRow[] | null;
}

/**
 * Column readers rather than column names, so the compiler checks each one.
 *
 * A `Record<string, unknown>` index would let a typo compile and return null
 * forever, which is exactly the failure this module exists to fix.
 */
const DETAIL_READERS: readonly ((row: MilestoneDetailRow) => unknown)[] = [
  (row) => row.date_cls_received_all_items,
  (row) => row.date_submitted_for_processing,
  (row) => row.date_completed_and_received_at_cls,
  (row) => row.date_order_on_route_and_closed,
];

const DESTINATION_READERS: readonly ((row: MilestoneDestinationRow) => unknown)[] = [
  (row) => row.visa_date_cls_received_all_items,
  (row) => row.visa_date_submitted_for_processing,
  (row) => row.visa_date_completed_and_received_at_cls,
  (row) => row.visa_date_order_on_route_and_closed,
];

const LEGACY_READERS: readonly ((row: LegacyMilestoneRow) => unknown)[] = [
  (row) => row.police_clearance_date_cls_received_all_items,
  (row) => row.police_clearance_date_submitted_for_processing,
  (row) => row.police_clearance_date_completed_and_received_at_cls,
  (row) => row.police_clearance_date_order_on_route_and_closed,
];

/** The four dates off one row, as ISO instants or null. */
const fromRow = <Row>(
  row: Row | null | undefined,
  readers: readonly ((row: Row) => unknown)[]
): (string | null)[] => readers.map((read) => (row ? toIso(read(row)) : null));

/**
 * The four dates across every destination on the order.
 *
 * Null for a slot any destination is still missing, and the latest of them
 * otherwise. ISO-8601 instants compare correctly as strings — they are all UTC
 * with the same precision, straight out of `toIso`.
 */
const fromDestinations = (rows: readonly MilestoneDestinationRow[]): (string | null)[] =>
  DESTINATION_READERS.map((read) => {
    if (rows.length === 0) return null;

    let latest: string | null = null;

    for (const row of rows) {
      const date = toIso(read(row));
      // One destination not there yet means the order as a whole is not.
      if (date === null) return null;
      if (latest === null || date > latest) latest = date;
    }

    return latest;
  });

const merge = (
  preferred: readonly (string | null)[],
  fallback: readonly (string | null)[]
): (string | null)[] =>
  Array.from({ length: MILESTONE_SLOTS }, (_, index) => {
    const first = preferred[index] ?? null;
    return first ?? fallback[index] ?? null;
  });

/**
 * The four milestone dates for a `tbl_cls_order` row, as ISO instants or null.
 *
 * The row must have been read with its detail tables **and** its destinations
 * eager-loaded; a missing include reads as "no date recorded", which is the bug
 * this module was written for. Both are in `orders.repository`'s include lists.
 */
export const readClsMilestoneDates = (order: ClsMilestoneSources): (string | null)[] => {
  const detail =
    order.policeClearanceDetails?.[0] ??
    order.voucherDetails?.[0] ??
    order.legalisationDetails?.[0] ??
    null;

  return merge(
    fromRow(detail, DETAIL_READERS),
    fromDestinations(order.destinations ?? [])
  );
};

/**
 * The same for a `tbl_orders` row.
 *
 * That table keeps only the police clearance set of the four columns on the order
 * itself, so its visa and legalisation orders showed no progress at all. Their
 * dates are on `tbl_order_destinations`, under the same `visa_date_*` names as
 * the newer family — so the same fallback applies, and a legacy visa order reads
 * back the timeline CLS stamped on it.
 */
export const readLegacyMilestoneDates = (
  order: LegacyMilestoneRow & {
    destinations?: readonly MilestoneDestinationRow[] | null;
  }
): (string | null)[] =>
  merge(fromRow(order, LEGACY_READERS), fromDestinations(order.destinations ?? []));
