import { Op } from 'sequelize';
import {
  ClsOrder,
  ClsOrderDocuments,
  OrderDlQuotes,
  TravelAlerts,
  UserClient,
} from '../../models';
import { notFound } from '../../shared/errors';
import { toLegacyDate, toLegacyDateTime } from '../../shared/dates';
import { clean } from '../../shared/text';
import { logger } from '../../shared/logger';
import { DOCUMENT_STATUS, ENABLED } from '../../domain/codes';
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
      kind === 'account' ? view.address : kind === 'delivery' ? view.delivery : view.billing,
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
 * Every document across the client's orders.
 *
 * `tbl_cls_order_documents` has no client column, so the client's order ids are
 * gathered first and the documents read by those. Two queries rather than a
 * join, because the join would be against a table with no index on `order_id`
 * and the id list is small.
 */
export const documents = async (
  clientId: number,
  options: { reference?: string; limit: number }
) => {
  const ownedOrders = await ClsOrder.findAll({
    attributes: ['id', 'order_no'],
    where: {
      client_id: clientId,
      ...(options.reference
        ? { order_no: options.reference }
        : { date_submitted: { [Op.ne]: null } }),
    },
    limit: 500,
  });

  if (ownedOrders.length === 0) return [];

  const referenceOf = new Map(
    ownedOrders.map((order) => [order.id, clean(order.order_no) ?? String(order.id)])
  );

  const rows = await ClsOrderDocuments.findAll({
    where: { order_id: { [Op.in]: [...referenceOf.keys()] } },
    order: [['created', 'DESC']],
    limit: options.limit,
  });

  return rows.map((row) =>
    toDocumentView(row, referenceOf.get(row.order_id ?? 0) ?? '—')
  );
};

/**
 * Finds one document, confirming it belongs to the caller first.
 *
 * The ownership check is the reason this is not just `findByPk`. The previous
 * build served `/uploads` statically, which meant anyone with a filename could
 * read anyone's passport scan. Every download goes through here instead.
 */
export const findOwnedDocument = async (
  clientId: number,
  documentId: number
): Promise<{ storedPath: string; name: string }> => {
  const document = await ClsOrderDocuments.findByPk(documentId);

  if (!document?.order_id) throw notFound('We could not find that document.');

  const order = await ClsOrder.findOne({
    where: { id: document.order_id, client_id: clientId },
  });

  // Not yours and does not exist give the same answer.
  if (!order) throw notFound('We could not find that document.');

  const stored = clean(document.document);
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
 */
export const removeDocument = async (
  clientId: number,
  documentId: number
): Promise<void> => {
  const document = await ClsOrderDocuments.findByPk(documentId);
  if (!document?.order_id) throw notFound('We could not find that document.');

  const order = await ClsOrder.findOne({
    where: { id: document.order_id, client_id: clientId },
  });
  if (!order) throw notFound('We could not find that document.');

  const reviewed =
    document.status === DOCUMENT_STATUS.REVIEWED ||
    document.status === DOCUMENT_STATUS.APPROVED;

  if (reviewed) {
    const { conflict } = await import('../../shared/errors');
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
    ownedOrders.map((order) => [order.id, clean(order.order_no) ?? String(order.id)])
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
