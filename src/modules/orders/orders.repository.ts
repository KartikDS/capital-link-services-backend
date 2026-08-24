import { Op, type Order as SequelizeOrder, type WhereOptions } from 'sequelize';
import {
  ClsOrder,
  ClsOrderDocumentNotes,
  ClsOrderDocuments,
  Countries,
  DocumentLegalizationOrderDetails,
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

/** Everything an order detail screen needs, in one query. */
const clsDetailIncludes = [
  { model: Countries, as: 'destinationCountry', required: false },
  { model: OrderTravellerDetails, as: 'travellers', required: false },
  { model: ClsOrderDocuments, as: 'documents', required: false },
  { model: PoliceClearanceOrderDetails, as: 'policeClearanceDetails', required: false },
  { model: RussianVisaVoucherOrderDetails, as: 'voucherDetails', required: false },
  {
    model: DocumentLegalizationOrderDetails,
    as: 'legalisationDetails',
    required: false,
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

export const listClsOrders = (
  filter: OrderListFilter
): Promise<{ rows: ClsOrder[]; count: number }> =>
  ClsOrder.findAndCountAll({
    where: {
      client_id: filter.clientId,
      ...CLS_SUBMITTED,
      ...(filter.orderType ? { order_type: filter.orderType } : {}),
      ...(filter.status !== undefined ? { status: filter.status } : {}),
      ...(filter.since ? { date_submitted: { [Op.gte]: filter.since } } : {}),
    },
    include: [
      { model: Countries, as: 'destinationCountry', required: false },
      { model: ClsOrderDocuments, as: 'documents', required: false },
      // Needed for the "2 applicants · Dubai" line the portal cards render.
      // Without it the count is zero and the line loses its first half.
      { model: OrderTravellerDetails, as: 'travellers', required: false },
    ],
    order: listOrder,
    limit: filter.limit,
    offset: filter.offset,
    // `include` with `hasMany` makes `count` count joined rows rather than
    // orders, which turns "you have 4 orders" into "you have 19".
    distinct: true,
  });

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
    where: {
      client_id: filter.clientId,
      ...LEGACY_SUBMITTED,
      ...(filter.orderType ? { order_type: filter.orderType } : {}),
    },
    include: [{ model: Countries, as: 'destinationCountry', required: false }],
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
