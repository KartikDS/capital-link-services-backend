/**
 * Reading an order's four processing milestones out of the right table.
 *
 * This suite is a regression from a real order in CLS's admin. Document
 * legalisation order 10034355 had been received and submitted — the admin's own
 * "Order View - Document Legalisation Application" screen showed
 * `26-08-2026 09:28:15` against "All items received at CLS" — and the client
 * portal drew all four steps as Pending. Nothing had failed: the API read the
 * four dates off `tbl_document_legalization_order_details`, and that screen
 * writes them to the order's row in `tbl_cls_order_destinations`.
 *
 * A police clearance order taken through the same admin *did* update in the
 * portal, because its screen and this API happened to agree on a table. That
 * asymmetry is what these tests pin down.
 */

import {
  readClsMilestoneDates,
  readLegacyMilestoneDates,
} from '../../src/domain/milestones';

/** What a detail row holds — a subset is enough, the rest is never read. */
const detailRow = (
  received: string | null = null,
  submitted: string | null = null,
  completed: string | null = null,
  closed: string | null = null
) => ({
  date_cls_received_all_items: received,
  date_submitted_for_processing: submitted,
  date_completed_and_received_at_cls: completed,
  date_order_on_route_and_closed: closed,
});

/** The same four dates as the legacy admin screens write them. */
const destinationRow = (
  received: string | null = null,
  submitted: string | null = null,
  completed: string | null = null,
  closed: string | null = null
) => ({
  visa_date_cls_received_all_items: received,
  visa_date_submitted_for_processing: submitted,
  visa_date_completed_and_received_at_cls: completed,
  visa_date_order_on_route_and_closed: closed,
});

/** Sydney wall clock in, UTC instant out — the whole of `toIso`'s job. */
const RECEIVED = '2026-08-26 09:28:15';
const RECEIVED_ISO = '2026-08-25T23:28:15.000Z';
const SUBMITTED = '2026-08-26 11:00:00';
const SUBMITTED_ISO = '2026-08-26T01:00:00.000Z';

describe('readClsMilestoneDates', () => {
  it('reads the timeline a legalisation order keeps on its destination row', () => {
    // Order 10034355: a legalisation detail row exists and is blank, because the
    // admin screen that stamped this order never writes to it.
    expect(
      readClsMilestoneDates({
        legalisationDetails: [detailRow()],
        destinations: [destinationRow(RECEIVED, SUBMITTED)],
      })
    ).toEqual([RECEIVED_ISO, SUBMITTED_ISO, null, null]);
  });

  it('reads a public visa order, which has no detail row at all', () => {
    expect(
      readClsMilestoneDates({
        destinations: [destinationRow(RECEIVED)],
      })
    ).toEqual([RECEIVED_ISO, null, null, null]);
  });

  it('still reads a police clearance order off its detail table', () => {
    expect(
      readClsMilestoneDates({
        policeClearanceDetails: [detailRow(RECEIVED, SUBMITTED)],
      })
    ).toEqual([RECEIVED_ISO, SUBMITTED_ISO, null, null]);
  });

  it('prefers the detail row per slot and falls back for the rest', () => {
    expect(
      readClsMilestoneDates({
        voucherDetails: [detailRow(RECEIVED)],
        destinations: [destinationRow('2026-01-01 00:00:00', SUBMITTED)],
      })
    ).toEqual([RECEIVED_ISO, SUBMITTED_ISO, null, null]);
  });

  it('holds a step until every destination has reached it', () => {
    expect(
      readClsMilestoneDates({
        destinations: [destinationRow(RECEIVED), destinationRow(null)],
      })
    ).toEqual([null, null, null, null]);
  });

  it('reports the last destination to reach a step, not the first', () => {
    expect(
      readClsMilestoneDates({
        destinations: [destinationRow(RECEIVED), destinationRow(SUBMITTED)],
      })
    ).toEqual([SUBMITTED_ISO, null, null, null]);
  });

  it('treats the blanks these varchar columns really hold as not reached', () => {
    expect(
      readClsMilestoneDates({
        destinations: [destinationRow('', '0000-00-00 00:00:00', '   ', 'n/a')],
      })
    ).toEqual([null, null, null, null]);
  });

  it('gives four nulls for an order with nothing loaded', () => {
    expect(readClsMilestoneDates({})).toEqual([null, null, null, null]);
  });
});

describe('readLegacyMilestoneDates', () => {
  it('reads the police clearance dates off the order row', () => {
    expect(
      readLegacyMilestoneDates({
        police_clearance_date_cls_received_all_items: RECEIVED,
        police_clearance_date_submitted_for_processing: SUBMITTED,
      })
    ).toEqual([RECEIVED_ISO, SUBMITTED_ISO, null, null]);
  });

  it('falls back to the destinations for a legacy visa order', () => {
    // `tbl_orders` carries only the police clearance copy of these columns, so
    // before the fallback every legacy visa order read as zero progress.
    expect(
      readLegacyMilestoneDates({
        destinations: [destinationRow(RECEIVED, SUBMITTED)],
      })
    ).toEqual([RECEIVED_ISO, SUBMITTED_ISO, null, null]);
  });
});
