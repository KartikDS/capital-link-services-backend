const listStageSources = jest.fn();
const countOutstandingDocuments = jest.fn();

jest.mock('../../src/modules/orders/orders.repository', () => ({
  listStageSources,
  countOutstandingDocuments,
}));

jest.mock('../../src/models', () => ({
  ClsOrder: {},
  ClsOrderDocuments: {},
  OrderDlChecklist: {},
  OrderDlQuotes: {},
  TravelAlerts: {},
  UserClient: {},
}));

import { stageCounts } from '../../src/modules/portal/portal.service';
import { clsStageOf, legacyStageOf, LEGACY_ORDER_STATUS } from '../../src/domain/codes';
import { readClsMilestoneDates } from '../../src/domain/milestones';

/**
 * The account-wide stage counts behind the portal's tiles and filter chips.
 *
 * These used to be two counts of two different pages -- the tiles over the
 * newest 200 orders, the chips over the newest 500 -- so an account with more
 * orders than either showed contradictory numbers on one screen: "Completed 164"
 * beside "Order on route and closed 404", the same stage counted twice over
 * different windows, and neither of them the account total.
 *
 * They now cover every order. What is worth testing is not the arithmetic but
 * the *agreement*: a count must bucket an order into exactly the stage the table
 * would show for it. That holds because both call the same clsStageOf,
 * legacyStageOf and readClsMilestoneDates -- and the last test asserts it
 * directly rather than trusting it.
 */

const DATE = '2026-08-20 10:00:00';

interface ClsOptions {
  documentStatuses?: number[];
  detailDates?: (string | null)[];
  destinations?: (string | null)[][];
}

const clsOrder = (id: number, options: ClsOptions = {}) => ({
  id,
  documents: (options.documentStatuses ?? []).map((status) => ({ status })),
  policeClearanceDetails: options.detailDates
    ? [
        {
          date_cls_received_all_items: options.detailDates[0],
          date_submitted_for_processing: options.detailDates[1],
          date_completed_and_received_at_cls: options.detailDates[2],
          date_order_on_route_and_closed: options.detailDates[3],
        },
      ]
    : [],
  voucherDetails: [],
  legalisationDetails: [],
  destinations: (options.destinations ?? []).map((dates) => ({
    visa_date_cls_received_all_items: dates[0],
    visa_date_submitted_for_processing: dates[1],
    visa_date_completed_and_received_at_cls: dates[2],
    visa_date_order_on_route_and_closed: dates[3],
  })),
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('stageCounts', () => {
  it('counts every order rather than a page of them', async () => {
    listStageSources.mockResolvedValue({
      cls: Array.from({ length: 600 }, (_, index) => clsOrder(index + 1)),
      legacy: Array.from({ length: 300 }, (_, index) => ({
        order_no: index + 1,
        status: LEGACY_ORDER_STATUS.COMPLETED,
      })),
    });

    const counts = await stageCounts(7);

    // 900 -- not 200 and not 500, the two page sizes this replaced.
    expect(counts.total).toBe(900);
    expect(counts['in-progress']).toBe(600);
    expect(counts.completed).toBe(300);
  });

  it('buckets a CLS order by its milestone dates', async () => {
    listStageSources.mockResolvedValue({
      cls: [
        clsOrder(1),
        clsOrder(2, { detailDates: [DATE, DATE, DATE, null] }),
        clsOrder(3, { detailDates: [DATE, DATE, DATE, DATE] }),
      ],
      legacy: [],
    });

    const counts = await stageCounts(7);

    expect(counts['in-progress']).toBe(1);
    expect(counts.ready).toBe(1);
    expect(counts.completed).toBe(1);
  });

  it('reads the dates off the destination rows when the detail row has none', async () => {
    // A public visa or legalisation order is stamped on its destination rows
    // rather than its detail row -- see domain/milestones.
    listStageSources.mockResolvedValue({
      cls: [clsOrder(1, { destinations: [[DATE, DATE, DATE, DATE]] })],
      legacy: [],
    });

    expect((await stageCounts(7)).completed).toBe(1);
  });

  it('needs every destination stamped before an order counts as closed', async () => {
    listStageSources.mockResolvedValue({
      cls: [
        clsOrder(1, {
          destinations: [
            [DATE, DATE, DATE, DATE],
            [DATE, DATE, null, null],
          ],
        }),
      ],
      legacy: [],
    });

    const counts = await stageCounts(7);

    expect(counts.completed).toBe(0);
    expect(counts['in-progress']).toBe(1);
  });

  it('lets an outstanding document outrank the dates', async () => {
    listStageSources.mockResolvedValue({
      cls: [
        clsOrder(1, {
          documentStatuses: [0],
          detailDates: [DATE, DATE, DATE, DATE],
        }),
      ],
      legacy: [],
    });

    const counts = await stageCounts(7);

    expect(counts['action-required']).toBe(1);
    expect(counts.completed).toBe(0);
  });

  it('counts a legacy order from its status alone', async () => {
    listStageSources.mockResolvedValue({
      cls: [],
      legacy: [
        { order_no: 1, status: LEGACY_ORDER_STATUS.COMPLETED },
        { order_no: 2, status: LEGACY_ORDER_STATUS.PAID },
        { order_no: 3, status: LEGACY_ORDER_STATUS.ORDERED },
        // No status recorded: treated as ordered rather than dropped.
        { order_no: 4, status: null },
      ],
    });

    const counts = await stageCounts(7);

    expect(counts.total).toBe(4);
    expect(counts.completed).toBe(1);
    expect(counts['in-progress']).toBe(3);
  });

  it('agrees with the stage the table would show for the same orders', async () => {
    const orders = [
      clsOrder(1),
      clsOrder(2, { detailDates: [DATE, DATE, DATE, null] }),
      clsOrder(3, { detailDates: [DATE, DATE, DATE, DATE] }),
      clsOrder(4, { documentStatuses: [3] }),
      clsOrder(5, { destinations: [[DATE, DATE, null, null]] }),
    ];

    listStageSources.mockResolvedValue({ cls: orders, legacy: [] });

    const counts = await stageCounts(7);

    const expected: Record<string, number> = {
      'action-required': 0,
      'in-progress': 0,
      ready: 0,
      completed: 0,
    };

    for (const order of orders) {
      const dates = readClsMilestoneDates(order);
      const outstanding = order.documents.some(
        (document) => document.status === 0 || document.status === 3
      );

      const stage = clsStageOf(outstanding, {
        completedAtCls: dates[2] !== null,
        closed: dates[3] !== null,
      });

      expected[stage] = (expected[stage] ?? 0) + 1;
    }

    expect({
      'action-required': counts['action-required'],
      'in-progress': counts['in-progress'],
      ready: counts.ready,
      completed: counts.completed,
    }).toEqual(expected);

    expect(legacyStageOf(LEGACY_ORDER_STATUS.COMPLETED, false)).toBe('completed');
    expect(legacyStageOf(LEGACY_ORDER_STATUS.PAID, false)).toBe('in-progress');
  });
});
