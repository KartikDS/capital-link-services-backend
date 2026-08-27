import { Op, type Order as SequelizeOrder, type WhereOptions } from 'sequelize';
import {
  ClsOrder,
  ClsOrderDestinations,
  ClsOrderDocumentNotes,
  ClsOrderDocuments,
  Countries,
  DocumentLegalizationOrderDetails,
  OrderDestinationNotes,
  OrderDestinations,
  OrderDlChecklist,
  OrderDlQuotes,
  OrderNotes,
  OrderTravellerDetails,
  OrderTravellers,
  Orders,
  Payment,
  PoliceClearanceOrderDetails,
  RussianVisaVoucherOrderDetails,
  UserAdmin,
  UserClient,
} from '../../models';
import { orderIdFromReference } from '../../domain/orderReference';
import type { ClsMilestoneSources } from '../../domain/milestones';
import { LEGACY_SUBMITTED_FROM } from '../../domain/codes';

/**
 * Reading orders out of two different tables.
 *
 * The schema holds two generations of order model and both are live, so almost
 * every function here comes in a pair — one for `tbl_cls_order`, one for
 * `tbl_orders`. That duplication is the schema's, not a design choice: the two
 * tables have different primary keys (`id` vs `order_no`), different reference
 * columns, and their satellites join on different names (`order_id` vs
 * `order_no`). A single abstraction over them would have to lie about one.
 *
 * The service layer above picks. It reads the newer family first, because that
 * is where a currently-placed order lands, and falls back to the older one so a
 * client quoting a reference from 2022 still gets an answer.
 */

// ---------------------------------------------------------------------------
// tbl_cls_order — the newer family
// ---------------------------------------------------------------------------

/**
 * Rows that count as submitted orders.
 *
 * `date_submitted` rather than `status`. `tbl_cls_order.status` starts at 0 for
 * "pending", which is also what a half-finished basket sits at — so status
 * cannot distinguish an order awaiting processing from a form somebody
 * abandoned. A submission date can only have been written when the client
 * pressed the button.
 */
const CLS_SUBMITTED: WhereOptions = { date_submitted: { [Op.ne]: null } };

/**
 * Everything an order detail screen needs, in one query.
 *
 * The three `*_order_details` tables **and** the destination rows, because the
 * four milestone dates are on one or the other depending on the service — a
 * public visa or a document legalisation keeps them on its destination row. See
 * `domain/milestones`. Leaving the destinations out is what made a legalisation
 * order's timeline read as four blank steps while CLS's admin showed it moving.
 */
const clsDetailIncludes = [
  { model: Countries, as: 'destinationCountry', required: false },
  { model: OrderTravellerDetails, as: 'travellers', required: false },
  { model: ClsOrderDocuments, as: 'documents', required: false },
  { model: ClsOrderDestinations, as: 'destinations', required: false },
  { model: PoliceClearanceOrderDetails, as: 'policeClearanceDetails', required: false },
  { model: RussianVisaVoucherOrderDetails, as: 'voucherDetails', required: false },
  {
    model: DocumentLegalizationOrderDetails,
    as: 'legalisationDetails',
    required: false,
  },
];

/**
 * The milestone sources, for the list queries.
 *
 * `separate: true` on every one: a list already joins documents and travellers,
 * and four more `hasMany` joins would multiply the result set — three documents
 * times two travellers times two destinations is twelve rows per order before
 * Sequelize dedupes them. Separate queries keep the row count flat and keep the
 * `count` honest, at four extra round trips per page of orders.
 */
const clsMilestoneIncludes = [
  { model: ClsOrderDestinations, as: 'destinations', required: false, separate: true },
  {
    model: PoliceClearanceOrderDetails,
    as: 'policeClearanceDetails',
    required: false,
    separate: true,
  },
  {
    model: RussianVisaVoucherOrderDetails,
    as: 'voucherDetails',
    required: false,
    separate: true,
  },
  {
    model: DocumentLegalizationOrderDetails,
    as: 'legalisationDetails',
    required: false,
    separate: true,
  },
];

/**
 * Finds a `tbl_cls_order` by the reference a client quotes.
 *
 * `order_no` is a TEXT column, so this is a string comparison. Trimmed because
 * five years of a web form writing into TEXT means some of these have trailing
 * whitespace, and a client pasting a clean reference would otherwise miss.
 */
export const findClsOrderById = (id: number): Promise<ClsOrder | null> =>
  ClsOrder.findByPk(id, { include: clsDetailIncludes });

/**
 * Resolves a reference to a `tbl_cls_order` id, and nothing else.
 *
 * Two steps rather than one, because of how Sequelize aliases tables. `order_no`
 * is TEXT, so a reference with trailing whitespace — and five years of a web
 * form writing into TEXT has produced some — needs a `TRIM()` comparison. But
 * once a query carries an `include`, Sequelize aliases the main table by its
 * *model* name (`ClsOrder`), not its table name, and a hand-written
 * `col('tbl_cls_order.order_no')` then fails as an unknown column.
 *
 * So the match runs on its own, with no includes and therefore no aliasing, and
 * the row is loaded by primary key afterwards. One extra round trip on a lookup
 * that happens once per request, in exchange for a query that cannot break when
 * the include list changes.
 */
export const findClsOrderIdByReference = async (
  reference: string
): Promise<number | null> => {
  const trimmed = reference.trim();

  /**
   * The website's own reference, read as the id it was derived from.
   *
   * This is now the common case: `order_no` holds the id CLS's admin keys on, so
   * a client quoting `CLS-000012` is asking about row 12 and no string comparison
   * will say so. The column matches below still run, because references issued
   * while this API wrote `'CLS-000012'` into `order_no` are in clients' inboxes
   * and have to keep resolving. See `domain/orderReference`.
   */
  const derived = orderIdFromReference(trimmed);

  if (derived !== null) {
    const row = await ClsOrder.findOne({
      attributes: ['id'],
      where: { id: derived },
    });

    if (row) return row.id;
  }

  // The exact match, which uses the column directly.
  const exact = await ClsOrder.findOne({
    attributes: ['id'],
    where: { order_no: trimmed },
  });

  if (exact) return exact.id;

  // The dirty-data case.
  const trimmedMatch = await ClsOrder.findOne({
    attributes: ['id'],
    where: {
      [Op.and]: [
        ClsOrder.sequelize!.where(
          ClsOrder.sequelize!.fn('TRIM', ClsOrder.sequelize!.col('order_no')),
          trimmed
        ),
      ],
    },
  });

  return trimmedMatch?.id ?? null;
};

export const findClsOrderByReference = async (
  reference: string
): Promise<ClsOrder | null> => {
  const id = await findClsOrderIdByReference(reference);
  return id === null ? null : findClsOrderById(id);
};

export interface OrderListFilter {
  clientId: number;
  /** `date_submitted` above this, for "orders since". */
  since?: string;
  orderType?: number;
  status?: number;
  limit: number;
  offset: number;
}

const listOrder: SequelizeOrder = [['date_submitted', 'DESC']];

/**
 * The columns a list row is built from, rather than every column there is.
 *
 * ## Why the lists project and the detail reads do not
 *
 * A client's whole order history has to come back in one request for the portal
 * table's counts, filters and search to mean anything — they run in the browser
 * over the rows it holds. That read is the one that has to be cheap, and the
 * cheapest thing available was to stop selecting columns nobody renders:
 * `tbl_orders` is 145 columns wide and `toLegacyOrderView` reads fourteen of
 * them, `tbl_cls_order` is 37 and `toOrderView` reads ten. Reading a walk-in
 * account's four hundred orders was timing out; most of what it carried was
 * never looked at.
 *
 * `visa_cls_team_member` is here for `listForClient`, which batches the
 * consultant lookup off it, and the primary key is here because `findAndCountAll`
 * counts on it and the `separate: true` includes join on it.
 *
 * **A narrowed column does not throw when read — it is `undefined`.** So these
 * lists are pinned by `tests/unit/orderListProjection.test.ts`, which drives the
 * presenters against a recording proxy and fails if either reads a column that
 * is not selected here. Add a field to a presenter and that test tells you to
 * add it here; it is the only thing standing between a narrowed select and a
 * column silently rendering blank for every order on the screen.
 */
export const CLS_LIST_ATTRIBUTES = [
  'id',
  'contact_first_name',
  'contact_last_name',
  'date_last_saved',
  'date_submitted',
  'departure_date',
  'order_type',
  'payment_status',
  'status',
  'total_fee',
  'visa_cls_team_member',
] as const;

export const LEGACY_LIST_ATTRIBUTES = [
  // `order_no` *is* this table's primary key -- an auto_increment int. There is
  // no `id` column, and selecting one fails the whole query with
  // "Unknown column 'Orders.id'".
  'order_no',
  'order_type',
  'status',
  'grand_total',
  'date_last_saved',
  'date_submitted',
  'departure_date',
  'primary_traveller_name',
  'pri_dept_contact_fname',
  'pri_dept_contact_lname',
  'police_clearance_date_cls_received_all_items',
  'police_clearance_date_submitted_for_processing',
  'police_clearance_date_completed_and_received_at_cls',
  'police_clearance_date_order_on_route_and_closed',
  'visa_cls_team_member',
] as const;

export const listClsOrders = (
  filter: OrderListFilter
): Promise<{ rows: ClsOrder[]; count: number }> =>
  ClsOrder.findAndCountAll({
    attributes: [...CLS_LIST_ATTRIBUTES],
    where: {
      client_id: filter.clientId,
      ...CLS_SUBMITTED,
      ...(filter.orderType ? { order_type: filter.orderType } : {}),
      ...(filter.status !== undefined ? { status: filter.status } : {}),
      ...(filter.since ? { date_submitted: { [Op.gte]: filter.since } } : {}),
    },
    include: [
      { model: Countries, as: 'destinationCountry', required: false },
      /**
       * `separate: true` on both, for the reason given on `clsMilestoneIncludes`.
       *
       * These two were plain joins while the four milestone includes were
       * separate, which is the worst of both: an order with three documents and
       * two travellers came back as six identical copies of itself, and the
       * whole page's rows multiplied before Sequelize deduped them in memory.
       * Two extra round trips is the cheaper half of that trade by a wide
       * margin, and it is what lets a client's full history be read at once.
       */
      { model: ClsOrderDocuments, as: 'documents', required: false, separate: true },
      // Needed for the "2 applicants · Dubai" line the portal cards render.
      // Without it the count is zero and the line loses its first half.
      {
        model: OrderTravellerDetails,
        as: 'travellers',
        required: false,
        separate: true,
      },
      // The progress bar and stage on each card are counted from the milestone
      // dates, so a list that does not load them shows every order at zero.
      ...clsMilestoneIncludes,
    ],
    order: listOrder,
    limit: filter.limit,
    offset: filter.offset,
    // `include` with `hasMany` makes `count` count joined rows rather than
    // orders, which turns "you have 4 orders" into "you have 19".
    distinct: true,
  });

/**
 * Just enough of every order to work out what stage it is at, and nothing else.
 *
 * ## Why this is not another list read
 *
 * The portal's stage counts — the four tiles and the five filter badges — were
 * each computed by loading a page of orders and counting it in JavaScript, over
 * two different page sizes. So the tiles counted the newest 200 and the badges
 * counted the newest 500, and a walk-in account with more orders than either got
 * two different sets of numbers on one screen, neither of them its total.
 *
 * The fix is to count every order rather than a page of them, which is only
 * affordable if a countable order is cheap. It is: `stage` needs the outstanding
 * document flag and two of the four milestone dates for a `tbl_cls_order` row,
 * and nothing but `status` for a `tbl_orders` row. So this reads ids and dates —
 * no names, no totals, no 145-column rows — and the whole account comes back for
 * less than one page of the list read.
 *
 * ## Why it does not count in SQL
 *
 * Because `stage` is derived, not stored, and the derivation is subtle: the four
 * dates live in either a per-service detail table or the destination rows
 * depending on which admin screen stamped them, and a multi-destination order
 * counts a slot as reached only when every destination has it. Writing that as
 * SQL would mean a second implementation of `domain/milestones` and
 * `clsStageOf`, and the first time the two drifted the tiles would disagree with
 * the table again — which is the bug being fixed. So the rows come back and the
 * existing functions bucket them. One rule, one place.
 */
const MILESTONE_DATE_COLUMNS = [
  'date_cls_received_all_items',
  'date_submitted_for_processing',
  'date_completed_and_received_at_cls',
  'date_order_on_route_and_closed',
];

const DESTINATION_DATE_COLUMNS = MILESTONE_DATE_COLUMNS.map(
  (column) => `visa_${column}`
);

/**
 * One order, carrying only what decides its stage.
 *
 * Declared rather than inferred because the model classes do not describe their
 * associations — `ClsOrder` has no `documents` property as far as TypeScript is
 * concerned, which is the same gap that lets a narrowed `attributes` list go
 * unnoticed (see `CLS_LIST_ATTRIBUTES`). Extending `ClsMilestoneSources` is what
 * makes this row passable straight to `readClsMilestoneDates`.
 */
export interface ClsStageSource extends ClsMilestoneSources {
  id: number;
  documents?: readonly { status?: number | null }[] | null;
}

export interface LegacyStageSource {
  order_no: number;
  status: number | null;
}

export const listStageSources = async (
  clientId: number
): Promise<{ cls: ClsStageSource[]; legacy: LegacyStageSource[] }> => {
  const [cls, legacy] = await Promise.all([
    ClsOrder.findAll({
      attributes: ['id'],
      where: { client_id: clientId, ...CLS_SUBMITTED },
      include: [
        {
          model: ClsOrderDestinations,
          as: 'destinations',
          required: false,
          separate: true,
          attributes: ['order_id', ...DESTINATION_DATE_COLUMNS],
        },
        {
          model: PoliceClearanceOrderDetails,
          as: 'policeClearanceDetails',
          required: false,
          separate: true,
          attributes: ['order_id', ...MILESTONE_DATE_COLUMNS],
        },
        {
          model: RussianVisaVoucherOrderDetails,
          as: 'voucherDetails',
          required: false,
          separate: true,
          attributes: ['order_id', ...MILESTONE_DATE_COLUMNS],
        },
        {
          model: DocumentLegalizationOrderDetails,
          as: 'legalisationDetails',
          required: false,
          separate: true,
          attributes: ['order_id', ...MILESTONE_DATE_COLUMNS],
        },
        // `status` only: which document it is does not change the stage, and the
        // one question asked of it is whether any is unattended or rejected.
        {
          model: ClsOrderDocuments,
          as: 'documents',
          required: false,
          separate: true,
          attributes: ['order_id', 'status'],
        },
      ],
    }),
    // A legacy order's stage is `status` and nothing else — `legacyStageOf` takes
    // no dates. Two columns for the whole family.
    Orders.findAll({
      attributes: ['order_no', 'status'],
      where: { client_id: clientId, ...LEGACY_SUBMITTED },
    }),
  ]);

  // Cast rather than typed through: `findAll` returns the model class, which
  // declares every column and no association, so it describes neither what was
  // selected nor what was included. The declared shapes above are the honest
  // description of what these rows carry.
  return {
    cls: cls as unknown as ClsStageSource[],
    legacy: legacy as unknown as LegacyStageSource[],
  };
};

/** Unsubmitted rows — the legacy schema's equivalent of a saved draft. */
export const listClsDrafts = (clientId: number): Promise<ClsOrder[]> =>
  ClsOrder.findAll({
    where: { client_id: clientId, date_submitted: { [Op.is]: null } },
    order: [['date_last_saved', 'DESC']],
    limit: 20,
  });

export const findClsDraft = (
  clientId: number,
  orderType: number
): Promise<ClsOrder | null> =>
  ClsOrder.findOne({
    where: {
      client_id: clientId,
      order_type: orderType,
      date_submitted: { [Op.is]: null },
    },
    order: [['date_last_saved', 'DESC']],
  });

// ---------------------------------------------------------------------------
// tbl_orders — the original family
// ---------------------------------------------------------------------------

/**
 * A submitted legacy order.
 *
 * Here `status` *is* the test, because `tbl_orders.status` documents its own
 * wizard steps as 1–4 and its real states as 10 and up. Anything below 10 is a
 * basket. `s_archive` is the old application's soft delete.
 */
const LEGACY_SUBMITTED: WhereOptions = {
  status: { [Op.gte]: LEGACY_SUBMITTED_FROM },
  [Op.or]: [{ s_archive: { [Op.is]: null } }, { s_archive: 0 }],
};

const legacyDetailIncludes = [
  { model: Countries, as: 'destinationCountry', required: false },
  { model: OrderTravellers, as: 'travellers', required: false },
  { model: OrderNotes, as: 'notes', required: false },
  // `tbl_orders` keeps only the police clearance milestone dates on the order
  // row; every other service's are on its destinations.
  { model: OrderDestinations, as: 'destinations', required: false },
];

/**
 * Finds a legacy order by reference.
 *
 * `tbl_orders.order_no` is the integer primary key, so a reference only matches
 * here if it parses as a number. A non-numeric reference cannot be a legacy
 * order, and returning null immediately avoids a pointless query.
 */
export const findLegacyOrderByReference = async (
  reference: string
): Promise<Orders | null> => {
  const asNumber = Number.parseInt(reference.trim(), 10);
  if (!Number.isFinite(asNumber) || String(asNumber) !== reference.trim()) {
    return null;
  }

  return Orders.findOne({
    where: { order_no: asNumber },
    include: legacyDetailIncludes,
  });
};

export const listLegacyOrders = (
  filter: OrderListFilter
): Promise<{ rows: Orders[]; count: number }> =>
  Orders.findAndCountAll({
    // Sixteen of this table's 145 columns — see `LEGACY_LIST_ATTRIBUTES`.
    attributes: [...LEGACY_LIST_ATTRIBUTES],
    where: {
      client_id: filter.clientId,
      ...LEGACY_SUBMITTED,
      ...(filter.orderType ? { order_type: filter.orderType } : {}),
    },
    include: [
      { model: Countries, as: 'destinationCountry', required: false },
      { model: OrderDestinations, as: 'destinations', required: false, separate: true },
    ],
    order: [['date_submitted', 'DESC']],
    limit: filter.limit,
    offset: filter.offset,
    distinct: true,
  });

// ---------------------------------------------------------------------------
// Satellites, keyed by whichever order they belong to
// ---------------------------------------------------------------------------

/**
 * The notes on an order, as a client may read them.
 *
 * `is_admin` marks a note a consultant wrote for other staff. Those are
 * excluded — an internal note is written on the assumption nobody outside CLS
 * will see it, and publishing five years of them through a new portal would be
 * the single worst thing this API could do.
 *
 * `is_deleted` is honoured for the same reason a soft delete exists.
 */
export const listClientVisibleNotes = (orderNo: number): Promise<OrderNotes[]> =>
  OrderNotes.findAll({
    where: {
      order_no: orderNo,
      is_deleted: 0,
      [Op.or]: [{ is_admin: { [Op.is]: null } }, { is_admin: 0 }],
    },
    order: [['date_added', 'DESC']],
    limit: 200,
  });

/** Every note, internal ones included. Admin routes only. */
export const listAllNotes = (orderNo: number): Promise<OrderNotes[]> =>
  OrderNotes.findAll({
    where: { order_no: orderNo, is_deleted: 0 },
    order: [['date_added', 'DESC']],
    limit: 500,
  });

// ---------------------------------------------------------------------------
// The consultant thread — `tbl_order_destination_notes`
// ---------------------------------------------------------------------------

/**
 * The destination rows an order has, which is what its consultant thread hangs
 * off.
 *
 * ## Why the thread is not keyed on the order
 *
 * Because CLS's admin does not key it on the order. Every order-view screen in
 * `CLSadminBundle` draws its "Client comment" and "Admin comment" boxes inside a
 * destination block and posts them as `ticketComment[<destination id>]` — so
 * `ViewOrderController` writes `OrderDestinationNotes` with
 * `setDestinationId($destinations[$i]['id'])`, never the order number. A thread
 * read by order id would find nothing a consultant has ever written.
 *
 * One function per family, as everything else in this module: a `tbl_cls_order`
 * has its destinations in `tbl_cls_order_destinations` keyed on `order_id`, and a
 * `tbl_orders` has them in `tbl_order_destinations` keyed on `order_no`.
 *
 * ## Why a list and not one id
 *
 * A visa order can have several destinations, each with its own thread, and the
 * admin renders one comment box per destination. The client has one conversation
 * about their order, so the portal reads all of them — and an order with no
 * destination row at all (clearance, voucher, document delivery: their legacy
 * controllers write none) correctly has no destination thread rather than an
 * error.
 */
export const listClsDestinationIds = async (orderId: number): Promise<number[]> =>
  (
    await ClsOrderDestinations.findAll({
      attributes: ['id'],
      where: { order_id: orderId },
      order: [['id', 'ASC']],
    })
  ).map((row) => row.id);

export const listLegacyDestinationIds = async (orderNo: number): Promise<number[]> =>
  (
    await OrderDestinations.findAll({
      attributes: ['id'],
      where: { order_no: orderNo },
      order: [['id', 'ASC']],
    })
  ).map((row) => row.id);

/**
 * The consultant thread on an order, as a client may read it.
 *
 * ## The two lanes, and which one leaves CLS
 *
 * `is_admin` means the opposite of what the admin's labels suggest, which is the
 * whole reason to read the Acme controller rather than the screenshot. The box
 * labelled "Client comment" writes `is_admin = 0` — the message *to* the client,
 * which `ViewOrderController` also emails them. The box labelled "Admin comment"
 * writes `is_admin = 1`: CLS's own working notes on the order.
 *
 * **Only the first lane is returned.** An internal note is written on the
 * assumption that nobody outside CLS will read it, and a portal that publishes it
 * is not showing the client more of their order — it is disclosing the firm's
 * private working record to the person it is about.
 *
 * ## The reversal, and why it is recorded here
 *
 * On 2026-08-26 this filter was removed at CLS's request: staff reach for the
 * box by its label — "Admin comment" is the one that *sounds* like the box an
 * admin types in — so most of what is ever written about an order lands in the
 * internal lane, and orders such as 10034012 showed a client "No messages yet"
 * through a whole finished legalisation. Marking the lane instead of hiding it
 * looked like the way to give them that history back.
 *
 * **CLS reversed it again on 2026-08-27, and this is the position that stands.**
 * A badge is a presentation choice; confidentiality is not something a client can
 * be asked to read past. The visibility problem is real but it is CLS's to fix at
 * the point of writing — a note meant for the client goes in the "Client comment"
 * box — and no amount of labelling makes the other box safe to publish.
 *
 * So the lane is a filter again, and it is the only one that decides this: the
 * presenter's `internal` flag and the website's own guard are there to catch a
 * row that somehow gets past this clause, not to do the work of it.
 *
 * Nothing else reads this table. Admin surfaces both lanes from CLS's own admin,
 * which queries MySQL directly, so a staff screen loses nothing to this filter.
 *
 * `is_deleted` has no counterpart here: this table has no such column, so a note
 * the admin "deletes" is genuinely gone (`deleteDestCommentAction` issues a
 * `DELETE`) and there is nothing to honour.
 */
export const listClientVisibleDestinationNotes = (
  destinationIds: readonly number[]
): Promise<OrderDestinationNotes[]> =>
  destinationIds.length === 0
    ? Promise.resolve([])
    : OrderDestinationNotes.findAll({
        where: {
          destination_id: { [Op.in]: [...destinationIds] },
          // Null is the MyISAM default on rows written before the column
          // existed; those predate the internal box and are ordinary
          // correspondence, so they stay on the client-facing side.
          [Op.or]: [{ is_admin: { [Op.is]: null } }, { is_admin: 0 }],
        },
        order: [['date_added', 'DESC']],
        limit: 200,
      });

/** One note from the thread, by id. Ownership is checked by the caller. */
export const findDestinationNote = (id: number): Promise<OrderDestinationNotes | null> =>
  OrderDestinationNotes.findByPk(id);

export const listClsDocuments = (orderId: number): Promise<ClsOrderDocuments[]> =>
  ClsOrderDocuments.findAll({
    where: { order_id: orderId },
    order: [['created', 'DESC']],
  });

export const findClsDocument = (id: number): Promise<ClsOrderDocuments | null> =>
  ClsOrderDocuments.findByPk(id);

/**
 * Review notes on a document.
 *
 * `is_approved` on the note is what tells a client *why* a document was
 * rejected, which is the one piece of information that turns "rejected" into
 * something they can act on.
 */
export const listDocumentNotes = (orderId: number): Promise<ClsOrderDocumentNotes[]> =>
  ClsOrderDocumentNotes.findAll({
    where: { order_id: orderId },
    order: [['created', 'DESC']],
    limit: 200,
  });

/**
 * The documents a legalisation order declared it was sending.
 *
 * `tbl_order_dl_checklist.order_no` holds the `tbl_cls_order.id` — see the note
 * in `orders.lodge` — so this is keyed the same way the uploaded documents are,
 * despite the column's name. No timestamp on the table, so its own id order is
 * the only sequence it has.
 */
export const listOrderChecklist = (orderId: number): Promise<OrderDlChecklist[]> =>
  OrderDlChecklist.findAll({
    where: { order_no: orderId },
    order: [['id', 'ASC']],
    limit: 200,
  });

/** The legalisation quote lines a consultant has raised against an order. */
export const listLegalisationQuotes = (orderNo: number): Promise<OrderDlQuotes[]> =>
  OrderDlQuotes.findAll({
    where: { order_no: orderNo },
    order: [['sent_date', 'DESC']],
  });

/**
 * Payments against an order.
 *
 * `tbl_payment.order_no` is an integer, so it lines up with the legacy family's
 * key directly. For a `tbl_cls_order` the reference is TEXT, and this is called
 * with the parsed number when that reference happens to be numeric — which most
 * are. A non-numeric reference has no payment row to find, and that is a real
 * limitation of joining an int column to a TEXT one.
 */
export const listPayments = (orderNo: number): Promise<Payment[]> =>
  Payment.findAll({
    where: { order_no: orderNo },
    order: [['date_paid', 'DESC']],
  });

export const findPaymentByTransaction = (
  transactionId: string
): Promise<Payment | null> =>
  Payment.findOne({ where: { transaction_id: transactionId } });

/** The consultant assigned to an order, from `visa_cls_team_member`. */
export const findConsultant = (id: number | null): Promise<UserAdmin | null> => {
  if (!id) return Promise.resolve(null);
  return UserAdmin.findByPk(id);
};

/**
 * The consultants on a set of orders, in one query.
 *
 * For the list screens. `findConsultant` per row would be an N+1 against
 * `tbl_user_admin`, and a client's dashboard renders every order they have — so
 * the distinct staff ids are collected and looked up together.
 *
 * Returns a map keyed by admin id. Ids with no row are simply absent, which is
 * the same "unassigned" answer as a null `visa_cls_team_member`: staff rows do
 * get deleted, and an order pointing at a gone one has no consultant rather than
 * a broken card.
 */
export const findConsultants = async (
  ids: readonly (number | null)[]
): Promise<Map<number, UserAdmin>> => {
  const wanted = [...new Set(ids.filter((id): id is number => Boolean(id)))];

  if (wanted.length === 0) return new Map();

  const rows = await UserAdmin.findAll({ where: { id: { [Op.in]: wanted } } });

  return new Map(rows.map((row) => [row.id, row]));
};

// ---------------------------------------------------------------------------
// Public tracking
// ---------------------------------------------------------------------------

/**
 * Looks an order up by reference *and* email, for the public tracking screen.
 *
 * Both are required. A reference on its own is a guessable token — they are
 * sequential integers in the legacy family — so the email is what makes this a
 * lookup rather than an enumeration. The email is matched against the order's
 * own contact address and against the account it belongs to, because a
 * department contact often places an order for somebody else.
 */
export const findClsOrderForTracking = async (
  reference: string,
  email: string
): Promise<ClsOrder | null> => {
  const id = await findClsOrderIdByReference(reference);
  if (id === null) return null;

  const order = await ClsOrder.findOne({
    where: { id, ...CLS_SUBMITTED },
    include: [
      { model: Countries, as: 'destinationCountry', required: false },
      { model: UserClient, as: 'client', required: false },
    ],
  });

  if (!order) return null;

  const target = email.trim().toLowerCase();

  // The order's own contact address, and the account it belongs to. Both,
  // because a department contact often places an order for somebody else and
  // either of them may be the person tracking it.
  const contact = order.contact_email?.trim().toLowerCase() ?? '';
  const owner =
    (order as unknown as { client?: { email?: string | null } }).client?.email
      ?.trim()
      .toLowerCase() ?? '';

  // Null for a mismatch, so the caller cannot tell a wrong email from a
  // reference that does not exist.
  return contact === target || owner === target ? order : null;
};

export const findLegacyOrderForTracking = async (
  reference: string,
  email: string
): Promise<Orders | null> => {
  const order = await findLegacyOrderByReference(reference);
  if (!order) return null;

  const target = email.trim().toLowerCase();

  // `tbl_orders` has no contact email of its own beyond the department contact,
  // so both that and the account address are checked.
  const contact = order.pri_dept_contact_email?.trim().toLowerCase() ?? '';

  if (contact === target) return order;

  if (order.client_id) {
    const client = await UserClient.findByPk(order.client_id);
    if (client?.email?.trim().toLowerCase() === target) return order;
  }

  return null;
};

// ---------------------------------------------------------------------------
// Counts, for the dashboard tiles
// ---------------------------------------------------------------------------

export const countClsOrders = (
  clientId: number,
  where: WhereOptions = {}
): Promise<number> =>
  ClsOrder.count({ where: { client_id: clientId, ...CLS_SUBMITTED, ...where } });

export const countLegacyOrders = (
  clientId: number,
  where: WhereOptions = {}
): Promise<number> =>
  Orders.count({ where: { client_id: clientId, ...LEGACY_SUBMITTED, ...where } });

/**
 * Documents on this client's orders that CLS is still waiting for.
 *
 * The count behind the "waiting on you" tile. Joined through the order rather
 * than filtered on the document alone, because `tbl_cls_order_documents` has no
 * client column — a document only knows its order.
 */
export const countOutstandingDocuments = async (clientId: number): Promise<number> => {
  const orders = await ClsOrder.findAll({
    attributes: ['id'],
    where: { client_id: clientId, ...CLS_SUBMITTED },
  });

  if (orders.length === 0) return 0;

  return ClsOrderDocuments.count({
    where: {
      order_id: { [Op.in]: orders.map((order) => order.id) },
      // Unattended or rejected: both are the client's move.
      status: { [Op.in]: [0, 3] },
    },
  });
};

export { CLS_SUBMITTED, LEGACY_SUBMITTED };
