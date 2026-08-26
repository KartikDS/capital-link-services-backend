import type {
  OrderDlQuotes,
  TravelAlerts,
  UserClient,
} from '../../models';
import { daysSince, isPast, toIso } from '../../shared/dates';
import { toCents, toCentsOrZero } from '../../shared/money';
import { clean, cleanOr, fullName, stripHtml, truncate } from '../../shared/text';
import type { OrderView } from '../orders/orders.presenter';

/**
 * The portal's shapes, and where each one comes from.
 *
 * Two of these features have no table behind them, and that is the interesting
 * part of this file. The website's portal was designed against a schema that
 * would have had one; this one does not, so each is mapped onto the nearest
 * thing the database actually records and the gap is stated rather than papered
 * over.
 */

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export interface AddressView {
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  countryId: number | null;
}

/**
 * The three addresses on a client's account.
 *
 * `tbl_user_client` carries them as three sets of columns with different
 * prefixes: bare (`address`, `city`, …), `mdda_` for where finished documents
 * are couriered, and `mba_` for billing. That is why the portal has three
 * addresses rather than one — CLS delivers to one and invoices another often
 * enough that collapsing them would break the common case.
 *
 * **There is no second address line.** The columns are `address char(225)` and
 * `mba_address char(225)` — one field each. So `line2` is always null on the way
 * out, and a client whose address needs "Unit 4" has to put it in `line1`. That
 * is the column, not a choice made here.
 */
const addressFrom = (
  line1: string | null,
  city: string | null,
  state: string | null,
  postcode: string | null,
  countryId: number | null
): AddressView => ({
  line1: clean(line1),
  line2: null,
  city: clean(city),
  state: clean(state),
  postcode: clean(postcode),
  countryId,
});

export interface ProfileView {
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  clientType: string | null;
  accountNumber: string | null;
  /** Masked. The portal never needs the full number and a response body leaks. */
  passportNumber: string | null;
  address: AddressView;
  delivery: AddressView;
  billing: AddressView;
  canChargeToAccount: boolean;
  lastLogin: string | null;
}

export const toProfileView = (client: UserClient): ProfileView => ({
  title: clean(client.title),
  firstName: clean(client.fname),
  lastName: clean(client.lname),
  email: clean(client.email),
  phone: clean(client.phone),
  mobile: clean(client.mobile),
  company: clean(client.company),
  clientType: clean(client.type),
  accountNumber: clean(client.display_id) ?? clean(client.account_no),
  // Deliberately masked even to its owner — see `maskPassport`.
  passportNumber: clean(client.passport_number)
    ? `••••${clean(client.passport_number)?.slice(-4)}`
    : null,
  address: addressFrom(
    client.address,
    client.city,
    client.state,
    client.postcode,
    client.country_id
  ),
  delivery: addressFrom(
    client.mdda_address,
    client.mdda_city,
    client.mdda_state,
    client.mdda_postcode,
    client.mdda_country_id
  ),
  billing: addressFrom(
    client.mba_address,
    client.mba_city,
    client.mba_state,
    client.mba_postcode,
    client.mba_country_id
  ),
  /** `can_charge_cost_to_account` — a corporate client with terms. */
  canChargeToAccount: client.can_charge_cost_to_account === 1,
  lastLogin: toIso(client.last_login),
});

// ---------------------------------------------------------------------------
// Notices — from tbl_travel_alerts
// ---------------------------------------------------------------------------

/**
 * A portal notice.
 *
 * Mapped to `tbl_travel_alerts`, which is what it is: a dated, subject-lined
 * message an administrator publishes. The old application shows these on its own
 * dashboard, so the two systems display the same notices — which is the right
 * outcome, and better than a portal-only announcement channel nobody at CLS
 * would remember to post to.
 *
 * The body is stripped to text. It is operator-authored HTML from a CMS field,
 * and handing it to a client to inject into a page is how stored XSS happens.
 */
export const toNoticeView = (alert: TravelAlerts) => ({
  id: String(alert.id),
  title: cleanOr(alert.subject, 'Notice'),
  body: stripHtml(alert.body) ?? '',
  posted: toIso(alert.alert_date),
  image: clean(alert.featured_image),
});

// ---------------------------------------------------------------------------
// Invoices — synthesised, because there is no invoice table
// ---------------------------------------------------------------------------

export type InvoiceState = 'paid' | 'due' | 'overdue' | 'refunded';

export interface InvoiceLineView {
  description: string;
  quantity: number;
  unitCents: number;
  gstCents: number;
  totalCents: number;
}

export interface InvoiceView {
  id: string;
  number: string;
  reference: string;
  service: string;
  issuedAt: string | null;
  dueAt: string | null;
  amountCents: number;
  state: InvoiceState;
  lines: InvoiceLineView[];
  /** Where this invoice was assembled from, since none is stored as such. */
  source: 'dl_quote' | 'order_total';
}

/** How long a client has to pay. No column records terms, so this is the policy. */
const PAYMENT_TERMS_DAYS = 14;

const dueDateFrom = (issuedAt: string | null): string | null => {
  if (!issuedAt) return null;
  const issued = new Date(issuedAt);
  if (Number.isNaN(issued.getTime())) return null;
  return new Date(issued.getTime() + PAYMENT_TERMS_DAYS * 86_400_000).toISOString();
};

/**
 * Whether an invoice is settled, due or late.
 *
 * Computed on read, every time. The alternative — writing a state and having a
 * nightly job flip it to overdue — means an invoice looks current for as long as
 * that job stays broken, and nobody notices a job that fails silently.
 */
const stateFor = (paid: boolean, dueAt: string | null): InvoiceState => {
  if (paid) return 'paid';
  return isPast(dueAt) ? 'overdue' : 'due';
};

/**
 * A legalisation quote, as an invoice.
 *
 * `tbl_order_dl_quotes` is the closest thing to an invoice in this schema, and
 * arguably is one: it has a description, a quantity, a price, a GST figure, a
 * total, and a `sent_date` for when it went to the client. `sent_group` batches
 * the lines that went out together, so one group is one invoice.
 *
 * **The total is summed from the lines, not read from them.** Each row carries
 * its own `total`, and a typo in one of those would otherwise hide behind a
 * header figure that disagrees with the arithmetic underneath it.
 */
export const toInvoiceFromQuotes = (
  quotes: readonly OrderDlQuotes[],
  reference: string,
  paid: boolean
): InvoiceView | null => {
  if (quotes.length === 0) return null;

  const first = quotes[0];
  if (!first) return null;

  const lines: InvoiceLineView[] = quotes.map((quote) => {
    const unitCents = toCentsOrZero(quote.price);
    const quantity = quote.quantity ?? 1;

    return {
      description: cleanOr(quote.description, 'Legalisation service'),
      quantity,
      unitCents,
      // `gst` is an `int(11)` here — a whole-dollar figure in a column that
      // cannot hold cents, so it is read as dollars and converted.
      gstCents: (quote.gst ?? 0) * 100,
      totalCents: toCents(quote.total) ?? unitCents * quantity,
    };
  });

  const issuedAt = toIso(first.sent_date);
  const dueAt = dueDateFrom(issuedAt);

  return {
    id: `dlq-${first.sent_group ?? first.id}`,
    number: `Q-${String(first.sent_group ?? first.id).padStart(5, '0')}`,
    reference,
    service: 'Document legalisation',
    issuedAt,
    dueAt,
    amountCents: lines.reduce((total, line) => total + line.totalCents, 0),
    state: stateFor(paid, dueAt),
    lines,
    source: 'dl_quote',
  };
};

/**
 * An order's own total, as an invoice.
 *
 * For every service that is not legalisation, the order carries the figure and
 * there is no quote table — so the invoice is the order. Returns null when no
 * amount is set, because an unpriced order is not a debt and putting a zero on
 * the invoices screen would invite a client to pay it.
 */
export const toInvoiceFromOrder = (order: OrderView): InvoiceView | null => {
  if (order.amountCents === null || order.amountCents === 0) return null;

  const issuedAt = order.submittedAt;
  const dueAt = dueDateFrom(issuedAt);

  return {
    id: `ord-${order.reference}`,
    number: order.reference,
    reference: order.reference,
    service: order.service ?? 'Capital Link Services',
    issuedAt,
    dueAt,
    amountCents: order.amountCents,
    state: stateFor(order.paid, dueAt),
    lines: [
      {
        description: order.service ?? 'Capital Link Services order',
        quantity: 1,
        unitCents: order.amountCents,
        gstCents: 0,
        totalCents: order.amountCents,
      },
    ],
    source: 'order_total',
  };
};

export interface BalanceView {
  outstandingCents: number;
  dueCents: number;
  overdueCents: number;
  payableIds: string[];
}

/** The three figures the portal's balance panel shows. */
export const toBalance = (invoices: readonly InvoiceView[]): BalanceView => {
  const unpaid = invoices.filter((invoice) => invoice.state !== 'paid');

  return {
    outstandingCents: unpaid.reduce((total, invoice) => total + invoice.amountCents, 0),
    dueCents: unpaid
      .filter((invoice) => invoice.state === 'due')
      .reduce((total, invoice) => total + invoice.amountCents, 0),
    overdueCents: unpaid
      .filter((invoice) => invoice.state === 'overdue')
      .reduce((total, invoice) => total + invoice.amountCents, 0),
    payableIds: unpaid.map((invoice) => invoice.id),
  };
};

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export type StatTone = 'navy' | 'sky' | 'alert' | 'done';

export interface StatView {
  id: string;
  label: string;
  value: number;
  hint: string;
  tone: StatTone;
}

/**
 * The dashboard tiles.
 *
 * The ids match the website's `STAT_ICONS` map exactly — it looks an icon up by
 * id and falls back to a neutral one for an id it has not heard of. So a new
 * tile added here renders; it just renders without a bespoke icon until the
 * website learns about it.
 *
 * Every tile carries a `hint`, because a bare number on a dashboard invites the
 * wrong reading. "3" next to "Action required" needs the line underneath saying
 * what the three are.
 */
export const buildStats = (input: {
  activeOrders: number;
  actionRequired: number;
  readyDocuments: number;
  completedOrders: number;
  overdueCents: number;
}): StatView[] => [
  {
    id: 'active-orders',
    label: 'Active orders',
    value: input.activeOrders,
    hint:
      input.activeOrders === 0
        ? 'Nothing in progress just now'
        : 'Jobs we are working on for you',
    tone: 'navy',
  },
  {
    id: 'action-required',
    label: 'Waiting on you',
    value: input.actionRequired,
    hint:
      input.actionRequired === 0
        ? 'Nothing needed from you'
        : 'Documents we still need before we can proceed',
    tone: input.actionRequired > 0 ? 'alert' : 'navy',
  },
  {
    id: 'ready-docs',
    label: 'Documents ready',
    value: input.readyDocuments,
    hint:
      input.readyDocuments === 0
        ? 'Nothing ready to collect yet'
        : 'Approved and on their way back to you',
    tone: 'sky',
  },
  {
    id: 'completed-jobs',
    label: 'Completed',
    value: input.completedOrders,
    hint: 'Orders we have finished for you',
    tone: 'done',
  },
];

// ---------------------------------------------------------------------------
// Notifications — derived, because there is no table for them
// ---------------------------------------------------------------------------

export interface NotificationView {
  id: string;
  title: string;
  body: string;
  at: string | null;
  kind: 'document' | 'invoice' | 'order';
  /**
   * Always false.
   *
   * There is no read/unread column anywhere in this schema and no table to add
   * one to. So every notification is reported unread, and marking one read
   * cannot be persisted — the endpoint that does it says so in its response
   * rather than returning 200 and forgetting.
   */
  read: false;
  /** What the client should do about it, when there is something. */
  href: string | null;
}

/**
 * The notifications a client has, worked out from their records.
 *
 * Assembled on each request from outstanding documents, overdue invoices and
 * recent order movement. That is the honest version of a notification feed built
 * on a schema with no notification table: the facts are all there, they are
 * simply not stored as messages.
 */
export const buildNotifications = (input: {
  outstandingDocuments: { reference: string; name: string; at: string | null }[];
  overdueInvoices: InvoiceView[];
  recentOrders: OrderView[];
}): NotificationView[] => {
  const notifications: NotificationView[] = [];

  for (const document of input.outstandingDocuments) {
    notifications.push({
      id: `doc-${document.reference}-${document.name}`,
      title: 'We need a document',
      body: `${document.name} is still outstanding on order ${document.reference}.`,
      at: document.at,
      kind: 'document',
      read: false,
      href: `/dashboard/orders/${document.reference}`,
    });
  }

  for (const invoice of input.overdueInvoices) {
    const days = daysSince(invoice.dueAt);

    notifications.push({
      id: `inv-${invoice.id}`,
      title: 'An invoice is overdue',
      body: `Invoice ${invoice.number} was due${days ? ` ${days} days ago` : ''}.`,
      at: invoice.dueAt,
      kind: 'invoice',
      read: false,
      href: '/dashboard/invoices',
    });
  }

  for (const order of input.recentOrders) {
    if (!order.milestone) continue;

    notifications.push({
      id: `ord-${order.reference}`,
      title: truncate(order.service, 60) ?? 'Order update',
      body: `${order.reference}: ${order.milestone}.`,
      at: order.updated,
      kind: 'order',
      read: false,
      href: `/dashboard/orders/${order.reference}`,
    });
  }

  // Newest first, and nulls last.
  return notifications.sort((left, right) =>
    (right.at ?? '').localeCompare(left.at ?? '')
  );
};

// ---------------------------------------------------------------------------
// Passport photo
// ---------------------------------------------------------------------------

/**
 * The client's passport photo.
 *
 * `tbl_user_client.passport_photo` is a single `varchar(255)` with a
 * `passport_updated_at` beside it. That is **one photo per client**, with no
 * review state, no per-order association and no history.
 *
 * The website's portal was built for a submission queue — several photos, each
 * with a state moving through in-review, approved, printing, posted. None of
 * those states has a column. So this returns the one photo, reports its state as
 * `received`, and the route that would withdraw a submission says plainly that
 * it cannot.
 *
 * Making this work properly needs a passport-photo table, which is a schema
 * change and therefore CLS's to make.
 */
export const toPhotoView = (client: UserClient) => {
  const stored = clean(client.passport_photo);
  if (!stored) return null;

  return {
    id: `photo-${client.id}`,
    applicant: fullName(client.fname, client.lname) ?? 'Account holder',
    reference: null,
    submittedAt: toIso(client.passport_updated_at),
    // `received` rather than `in-review`: CLS has it, and nothing records
    // whether anyone has looked at it.
    state: 'received' as const,
    note: '',
    storedAs: stored,
  };
};
