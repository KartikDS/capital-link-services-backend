import { Op } from 'sequelize';
import {
  ClsOrder,
  ClsOrderDocuments,
  OrderDlChecklist,
  OrderDlQuotes,
  TravelAlerts,
  UserClient,
} from '../../models';
import { notFound } from '../../shared/errors';
import { toLegacyDate, toLegacyDateTime } from '../../shared/dates';
import { clean } from '../../shared/text';
import { logger } from '../../shared/logger';
import { DOCUMENT_STATUS, ENABLED } from '../../domain/codes';
import { orderIdFromReference, orderReference } from '../../domain/orderReference';
import { toConsultantView } from '../../domain/company';
import * as orders from '../orders/orders.service';
import * as orderRepository from '../orders/orders.repository';
import { toDocumentView } from '../orders/orders.presenter';
import type { AddressInput } from '../../shared/validation';
import * as present from './portal.presenter';

/**
 * Everything the signed-in client's portal reads and writes.
 *
 * The screens behind this were built against a design with tables this schema
 * does not have — an invoice table, a notifications table, a passport-photo
 * queue. Each is handled by mapping onto what the database does record, and
 * `portal.presenter` explains each mapping where it happens.
 */

const requireClient = async (clientId: number): Promise<UserClient> => {
  const client = await UserClient.findOne({
    where: { id: clientId, s_enabled: ENABLED },
  });

  if (!client) throw notFound('We could not find your account.');

  return client;
};

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export const profile = async (clientId: number) =>
  present.toProfileView(await requireClient(clientId));

export interface ProfileUpdate {
  title?: string | null;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  mobile?: string | null;
  company?: string | null;
}

/**
 * Saves the client's own details.
 *
 * Email is deliberately not updatable here. It is the sign-in identifier, there
 * is no unique index on the column to catch a collision, and changing it would
 * let a client take an address another account already uses — after which
 * `findClientByEmail` resolves to whichever has the lower id. Changing an email
 * needs a consultant.
 */
export const saveProfile = async (
  clientId: number,
  update: ProfileUpdate
): Promise<present.ProfileView> => {
  const client = await requireClient(clientId);

  await client.update({
    ...(update.title !== undefined ? { title: clean(update.title) } : {}),
    ...(update.firstName !== undefined ? { fname: update.firstName } : {}),
    ...(update.lastName !== undefined ? { lname: update.lastName } : {}),
    ...(update.phone !== undefined ? { phone: clean(update.phone) } : {}),
    ...(update.mobile !== undefined ? { mobile: clean(update.mobile) } : {}),
    ...(update.company !== undefined ? { company: clean(update.company) } : {}),
  });

  logger.info('Profile updated', { clientId });

  return present.toProfileView(client);
};

/** Which of the three address column sets a request means. */
export type AddressKind = 'account' | 'delivery' | 'billing';

const ADDRESS_COLUMNS: Record<
  AddressKind,
  { line1: string; city: string; state: string; postcode: string; countryId: string }
> = {
  account: {
    line1: 'address',
    city: 'city',
    state: 'state',
    postcode: 'postcode',
    countryId: 'country_id',
  },
  delivery: {
    line1: 'mdda_address',
    city: 'mdda_city',
    state: 'mdda_state',
    postcode: 'mdda_postcode',
    countryId: 'mdda_country_id',
  },
  billing: {
    line1: 'mba_address',
    city: 'mba_city',
    state: 'mba_state',
    postcode: 'mba_postcode',
    countryId: 'mba_country_id',
  },
};

/**
 * Updates one address without touching the other two.
 *
 * Patchable individually on purpose. Sending the whole profile to change a
 * postcode is how the other two addresses get overwritten with whatever the form
 * happened to have loaded — which is a real failure mode, not a hypothetical
 * one.
 *
 * `line2` is accepted and ignored: there is one address column per set, and
 * silently appending it to `line1` would corrupt the value on the next read.
 * The response shows what was actually stored.
 */
export const saveAddress = async (
  clientId: number,
  kind: AddressKind,
  address: AddressInput
): Promise<{ address: present.AddressView; ignored: string[] }> => {
  const client = await requireClient(clientId);
  const columns = ADDRESS_COLUMNS[kind];

  const values: Record<string, unknown> = {};

  if (address.line1 !== undefined) values[columns.line1] = clean(address.line1);
  if (address.city !== undefined) values[columns.city] = clean(address.city);
  if (address.state !== undefined) values[columns.state] = clean(address.state);
  if (address.postcode !== undefined) {
    values[columns.postcode] = clean(address.postcode);
  }
  if (address.countryId !== undefined) {
    values[columns.countryId] = address.countryId ?? null;
  }

  await client.update(values);

  // Changing an address invalidates whatever a consultant had checked.
  if (kind === 'delivery' || kind === 'account') {
    await client.update({ is_address_confirmed: 0 });
  }

  logger.info('Address updated', { clientId, kind });

  const view = present.toProfileView(client);

  return {
    address:
      kind === 'account'
        ? view.address
        : kind === 'delivery'
          ? view.delivery
          : view.billing,
    ignored: address.line2 ? ['line2'] : [],
  };
};

// ---------------------------------------------------------------------------
// Orders and stats
// ---------------------------------------------------------------------------

export const portalOrders = async (clientId: number, limit = 50) => {
  const result = await orders.listForClient(clientId, { limit, offset: 0 });
  return result.orders;
};

/**
 * The dashboard tiles.
 *
 * Counted from the orders themselves rather than from a summary table, because
 * there is not one. Four counts over a client's own rows is cheap; a client has
 * tens of orders, not thousands.
 */
export const stats = async (clientId: number): Promise<present.StatView[]> => {
  const [list, outstanding] = await Promise.all([
    orders.listForClient(clientId, { limit: 200, offset: 0 }),
    orderRepository.countOutstandingDocuments(clientId),
  ]);

  const active = list.orders.filter(
    (order) => order.stage === 'in-progress' || order.stage === 'action-required'
  ).length;

  const completed = list.orders.filter((order) => order.stage === 'completed').length;
  const ready = list.orders.filter((order) => order.stage === 'ready').length;

  return present.buildStats({
    activeOrders: active,
    actionRequired: outstanding,
    readyDocuments: ready,
    completedOrders: completed,
    overdueCents: 0,
  });
};

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * Every document across the client's orders, from both tables that hold one.
 *
 * ## What was missing
 *
 * This used to read `tbl_cls_order_documents` and nothing else, which meant the
 * portal's documents screen was blind to every document on a legalisation order.
 * Those live in `tbl_document_legalization_documents` — a different table with a
 * different shape, written by `orders.lodge` when an attestation order comes in —
 * so a client who lodged a document-attestation order and then opened Documents
 * saw an empty screen, while their own order card said CLS was waiting on the
 * very files they had listed.
 *
 * Both are read now and merged, newest first. `source` says which table a row
 * came from, because the two are not equally actionable: an uploaded scan can be
 * downloaded and removed, and a legalisation row is a *listed* document — the
 * client's declaration of what they are sending — which may have no file behind
 * it at all.
 *
 * ## Why the submitted-date filter is gone
 *
 * The old query took only orders with a `date_submitted`, which is how this
 * schema marks a draft: an unsubmitted `tbl_cls_order` row is a half-finished
 * basket. That looked reasonable and hid real documents. A client who saved a
 * draft, attached their passport scan to it and came back the next day found the
 * document nowhere — the file was stored, indexed against the order, and simply
 * not returned. Documents are now read across every order the client owns, and a
 * draft's documents are the client's own files either way.
 *
 * Two queries rather than a join, because the join would be against tables with
 * no index on `order_id` and the id list is small.
 */
export const documents = async (
  clientId: number,
  options: { reference?: string; limit: number }
) => {
  /**
   * Filtered by id when the reference is one of ours, by the column when it is
   * not. `order_no` holds the id CLS's admin keys on, so `CLS-000012` never
   * matches it as a string — see `domain/orderReference`. The column comparison
   * stays for the references issued while this API wrote them into `order_no`.
   */
  const asId = options.reference ? orderIdFromReference(options.reference) : null;

  const ownedOrders = await ClsOrder.findAll({
    attributes: ['id', 'order_no'],
    where: {
      client_id: clientId,
      ...(asId !== null ? { id: asId } : {}),
      ...(options.reference && asId === null ? { order_no: options.reference } : {}),
    },
    limit: 500,
  });

  if (ownedOrders.length === 0) return [];

  const referenceOf = new Map(
    ownedOrders.map((order) => [order.id, orderReference(order.id)])
  );

  const orderIds = [...referenceOf.keys()];

  const [uploaded, legalisation] = await Promise.all([
    ClsOrderDocuments.findAll({
      where: { order_id: { [Op.in]: orderIds } },
      order: [['created', 'DESC']],
      limit: options.limit,
    }),
    /**
     * `tbl_order_dl_checklist`, which is where a legalisation order's document
     * lines actually live — see the note in `orders.lodge`. The other table,
     * `tbl_document_legalization_documents`, has no reader in CLS's own
     * application and this API no longer writes it.
     */
    OrderDlChecklist.findAll({
      where: { order_no: { [Op.in]: orderIds } },
      // No timestamp on this table, so its own id order is the only sequence it
      // has — which is insertion order, and therefore newest last.
      order: [['id', 'DESC']],
      limit: options.limit,
    }),
  ]);

  /**
   * Newest first — and the undated rows are not allowed to be starved by it.
   *
   * `tbl_document_legalization_documents` has no timestamps at all, so its rows
   * carry a null `createdAt` and cannot be interleaved by date. Sorting them last
   * is the honest answer — the screen groups by state anyway, and a date guessed
   * from an auto-increment id would put a document in a week it was not added.
   *
   * But "last" plus a cap means "never" for a client with more uploads than the
   * limit: a hundred scans would push every legalisation row off the end, which is
   * exactly the client whose documents screen this change exists to fix. So the
   * undated rows keep their places and the dated ones are trimmed to fit around
   * them. Legalisation rows are a handful per order — the documents the client
   * declared — so the reservation cannot swallow the list either.
   */
  const declared = legalisation.map((row) =>
    present.toLegalisationDocumentView(
      row,
      // `order_no` on the checklist table holds the `tbl_cls_order.id`.
      referenceOf.get(row.order_no ?? 0) ?? '—'
    )
  );

  const dated = uploaded
    .map((row) => toDocumentView(row, referenceOf.get(row.order_id ?? 0) ?? '—'))
    .sort((left, right) => (right.createdAt ?? '').localeCompare(left.createdAt ?? ''));

  const room = Math.max(0, options.limit - declared.length);

  return [...dated.slice(0, room), ...declared.slice(0, options.limit)];
};

/**
 * Which table a document id names.
 *
 * Two auto-increment tables hold a client's documents and both start at 1, so the
 * ids overlap. `documents` above returns the legalisation ones prefixed — `dl-14`
 * — and this is the one place that prefix is understood. Everything downstream
 * gets a table and a number rather than a string to re-parse.
 *
 * A malformed id is `null` rather than an exception: the caller turns it into the
 * same "we could not find that document" a wrong-but-well-formed id gets, which is
 * what stops the shape of an id being something to probe.
 */
type DocumentSource = 'uploaded' | 'legalisation';

const parseDocumentId = (
  id: string
): { source: DocumentSource; rowId: number } | null => {
  const match = /^(dl-)?(\d+)$/.exec(id.trim());
  if (!match) return null;

  const rowId = Number.parseInt(match[2] ?? '', 10);
  if (!Number.isSafeInteger(rowId) || rowId <= 0) return null;

  return { source: match[1] ? 'legalisation' : 'uploaded', rowId };
};

/** True when the order exists and belongs to the caller. Same answer for both. */
const ownsOrder = async (clientId: number, orderId: number | null): Promise<boolean> => {
  if (!orderId) return false;

  const order = await ClsOrder.findOne({
    where: { id: orderId, client_id: clientId },
  });

  return order !== null;
};

/**
 * Finds one document, confirming it belongs to the caller first.
 *
 * The ownership check is the reason this is not just `findByPk`. The previous
 * build served `/uploads` statically, which meant anyone with a filename could
 * read anyone's passport scan. Every download goes through here instead.
 *
 * It now resolves both document tables, because both are listed on the client's
 * documents screen — see `documents` above. Which table an id names is decided by
 * its prefix and nothing else: an unprefixed id is never looked up in the
 * legalisation table, so the two id spaces cannot be confused for one another.
 *
 * A legalisation row may have no file at all, which is not an error — the
 * attestation form lets a client declare a document they are posting in. It
 * answers the same "no longer available" as an uploaded row with an empty column,
 * because from the client's side the two are the same fact.
 */
export const findOwnedDocument = async (
  clientId: number,
  documentId: string
): Promise<{ storedPath: string; name: string }> => {
  const parsed = parseDocumentId(documentId);

  // Not yours, does not exist, and not a document id all give the same answer.
  if (!parsed) throw notFound('We could not find that document.');

  const stored =
    parsed.source === 'uploaded'
      ? await (async () => {
          const document = await ClsOrderDocuments.findByPk(parsed.rowId);
          if (!document) return null;
          if (!(await ownsOrder(clientId, document.order_id))) return null;
          return clean(document.document);
        })()
      : await (async () => {
          const document = await OrderDlChecklist.findByPk(parsed.rowId);
          if (!document) return null;
          // `order_no` on this table holds the `tbl_cls_order.id`.
          if (!(await ownsOrder(clientId, document.order_no))) return null;
          return clean(document.doc_file);
        })();

  if (stored === null) throw notFound('We could not find that document.');
  if (!stored) throw notFound('That document is no longer available.');

  return { storedPath: stored, name: stored.split('/').pop() ?? 'document' };
};

/**
 * Removes a document a client uploaded.
 *
 * Only one CLS has not yet reviewed. Once a document is `REVIEWED` or
 * `APPROVED` it is part of a submission — possibly one already lodged with an
 * embassy — and a client deleting it would leave CLS's record of what was sent
 * incomplete.
 *
 * A legalisation row is refused outright, whatever its status. Those are not
 * uploads: each is a line on the order saying what the client is sending to be
 * legalised, so removing one changes what CLS has been asked to do rather than
 * withdrawing a file. The message says so, and says who can change it.
 */
export const removeDocument = async (
  clientId: number,
  documentId: string
): Promise<void> => {
  const parsed = parseDocumentId(documentId);
  if (!parsed) throw notFound('We could not find that document.');

  const { conflict } = await import('../../shared/errors');

  if (parsed.source === 'legalisation') {
    throw conflict(
      'That document is part of what your order asks us to legalise, so it cannot be removed here. Speak to your consultant if the order itself needs changing.'
    );
  }

  const document = await ClsOrderDocuments.findByPk(parsed.rowId);
  if (!document?.order_id) throw notFound('We could not find that document.');

  if (!(await ownsOrder(clientId, document.order_id))) {
    throw notFound('We could not find that document.');
  }

  const reviewed =
    document.status === DOCUMENT_STATUS.REVIEWED ||
    document.status === DOCUMENT_STATUS.APPROVED;

  if (reviewed) {
    throw conflict(
      'We have already reviewed that document, so it cannot be removed. Speak to your consultant if it needs replacing.'
    );
  }

  await document.destroy();
  logger.info('Document removed by client', { clientId, documentId });
};

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

/**
 * The client's invoices, assembled from two sources.
 *
 * Legalisation orders have real quote lines in `tbl_order_dl_quotes`, which read
 * as invoices. Everything else has only the order's own total. Both are produced
 * here and tagged with `source`, so a caller can tell a quoted invoice from a
 * derived one.
 */
export const invoices = async (clientId: number): Promise<present.InvoiceView[]> => {
  const list = await orders.listForClient(clientId, { limit: 200, offset: 0 });

  const results: present.InvoiceView[] = [];

  for (const order of list.orders) {
    const numeric = Number.parseInt(/(\d+)$/.exec(order.reference)?.[1] ?? '', 10);

    if (Number.isSafeInteger(numeric)) {
      const quotes = await OrderDlQuotes.findAll({
        where: { order_no: numeric, sent_date: { [Op.ne]: null } },
        order: [['sent_group', 'ASC']],
      });

      if (quotes.length > 0) {
        // One invoice per batch that was sent to the client.
        const groups = new Map<number, OrderDlQuotes[]>();

        for (const quote of quotes) {
          const key = quote.sent_group ?? quote.id;
          groups.set(key, [...(groups.get(key) ?? []), quote]);
        }

        for (const group of groups.values()) {
          const invoice = present.toInvoiceFromQuotes(group, order.reference, order.paid);
          if (invoice) results.push(invoice);
        }

        continue;
      }
    }

    const fromOrder = present.toInvoiceFromOrder(order);
    if (fromOrder) results.push(fromOrder);
  }

  return results.sort((left, right) =>
    (right.issuedAt ?? '').localeCompare(left.issuedAt ?? '')
  );
};

export const balance = async (clientId: number): Promise<present.BalanceView> =>
  present.toBalance(await invoices(clientId));

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

/**
 * Published notices, from `tbl_travel_alerts`.
 *
 * `status` on that table is a `char(10)` holding words rather than a flag, so
 * "published" is anything not explicitly draft — matching how the old
 * application filters it. Being permissive here is the safer direction: a notice
 * CLS meant to publish showing up is better than one going unseen.
 */
export const notices = async (limit = 10) => {
  const rows = await TravelAlerts.findAll({
    where: { status: { [Op.notIn]: ['draft', 'Draft', 'DRAFT'] } },
    order: [['alert_date', 'DESC']],
    limit,
  });

  return rows.map(present.toNoticeView);
};

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notifications = async (
  clientId: number
): Promise<present.NotificationView[]> => {
  const [list, outstandingDocuments, allInvoices] = await Promise.all([
    orders.listForClient(clientId, { limit: 20, offset: 0 }),
    outstandingDocumentSummaries(clientId),
    invoices(clientId),
  ]);

  return present.buildNotifications({
    outstandingDocuments,
    overdueInvoices: allInvoices.filter((invoice) => invoice.state === 'overdue'),
    recentOrders: list.orders.slice(0, 5),
  });
};

const outstandingDocumentSummaries = async (clientId: number) => {
  const ownedOrders = await ClsOrder.findAll({
    attributes: ['id', 'order_no'],
    where: { client_id: clientId, date_submitted: { [Op.ne]: null } },
    limit: 200,
  });

  if (ownedOrders.length === 0) return [];

  const referenceOf = new Map(
    ownedOrders.map((order) => [order.id, orderReference(order.id)])
  );

  const rows = await ClsOrderDocuments.findAll({
    where: {
      order_id: { [Op.in]: [...referenceOf.keys()] },
      status: { [Op.in]: [DOCUMENT_STATUS.UNATTENDED, DOCUMENT_STATUS.REJECTED] },
    },
    limit: 50,
  });

  return rows.map((row) => ({
    reference: referenceOf.get(row.order_id ?? 0) ?? '—',
    name: clean(row.document) ?? 'Document',
    at: row.modified ?? row.created ?? null,
  }));
};

// ---------------------------------------------------------------------------
// Passport photo
// ---------------------------------------------------------------------------

export const passportPhotos = async (clientId: number) => {
  const client = await requireClient(clientId);
  const photo = present.toPhotoView(client);

  return photo ? [photo] : [];
};

/**
 * Replaces the client's passport photo.
 *
 * Replaces, not adds. There is one column, so a second submission overwrites the
 * first and the previous file is left on disk unreferenced rather than deleted —
 * deleting it would destroy the only copy if the new upload turns out to be
 * unusable, and CLS has no way to ask for the old one back.
 */
export const savePassportPhoto = async (
  clientId: number,
  storedPath: string
): Promise<void> => {
  const client = await requireClient(clientId);

  await client.update({
    passport_photo: storedPath,
    passport_updated_at: toLegacyDateTime(),
  });

  logger.info('Passport photo replaced', { clientId });
};

// ---------------------------------------------------------------------------
// Consultant and account
// ---------------------------------------------------------------------------

/**
 * The consultant looking after this client.
 *
 * Read from their most recent order's `visa_cls_team_member`, because
 * `tbl_user_client` has no consultant column — the assignment lives on the work,
 * not on the account. A client with no orders yet has no assigned consultant,
 * and null is the honest answer.
 */
export const consultant = async (clientId: number) => {
  const recent = await ClsOrder.findOne({
    where: { client_id: clientId, visa_cls_team_member: { [Op.ne]: null } },
    order: [['date_submitted', 'DESC']],
  });

  const admin = await orderRepository.findConsultant(
    recent?.visa_cls_team_member ?? null
  );

  if (!admin) return null;

  return toConsultantView(
    [clean(admin.fname), clean(admin.lname)].filter(Boolean).join(' ') || null,
    clean(admin.email)
  );
};

/**
 * Closes an account.
 *
 * A request, not a deletion. `s_enabled = 0` stops sign-in and `s_archive = 1`
 * hides the account from the old admin's active lists, but the rows stay: CLS is
 * required to keep a record of what it legalised, and the orders reference this
 * client. Deleting the row would orphan them — and with no foreign keys, nothing
 * would stop it.
 */
export const closeAccount = async (
  clientId: number,
  reason: string | null
): Promise<{ closed: boolean; message: string }> => {
  const client = await requireClient(clientId);

  await client.update({
    s_enabled: 0,
    s_archive: 1,
    last_login: toLegacyDate(),
  });

  logger.info('Account closed on client request', { clientId, reason });

  return {
    closed: true,
    message:
      'Your account is closed and you will no longer be able to sign in. Your order history is retained, as we are required to keep records of the documents we have legalised.',
  };
};
