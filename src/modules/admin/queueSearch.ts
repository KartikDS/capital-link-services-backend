/**
 * The search box on the five service queues.
 *
 * ## What it used to do, and why it "sometimes worked"
 *
 * It searched `tbl_cls_order.order_no` and nothing else. On the queue screens that
 * column is headed **Migrated Order No** — the old system's reference, present only
 * on orders carried over — so a search for the Order No. a consultant can see in the
 * first column (`10034668`, which is the order's `id`), or a name, a destination, a
 * status or a team member, found nothing. It matched only when what was typed
 * happened to be a migrated order number, which is the "sometimes".
 *
 * ## What it does now
 *
 * The text is split into words and **every word has to match something on the row**,
 * where "something" is any column that queue shows — including the ones that live on
 * other tables (the traveller's name, the destination, the team member, the scan
 * status, the processing location). So `isaac pepe`, `saudi paid`, `rania` and
 * `10034675` all find what they say, and `28 nov` finds departures on that day.
 *
 * Words rather than one phrase because the screen shows a name as two cells and a
 * date as a formatted string, and nobody types the string the database holds.
 *
 * ## Why SQL fragments and not Sequelize conditions
 *
 * The matches reach through other tables, and the queue's total is counted on
 * `tbl_cls_order` alone (see `findPage` — the joins made it take 14 seconds). A
 * condition written as `$destinationCountry.country_name$` would break that count, so
 * every cross-table match is a self-contained `IN (SELECT …)` that works the same
 * whether the query has its joins or not. Values never appear in the SQL text: each
 * word is passed through the caller's `escape`, and the `LIKE` wildcards in it are
 * escaped first so a typed `%` or `_` is a character and not a pattern.
 *
 * This file imports no models, so the SQL it writes can be read in a test.
 *
 * The same search serves the "All services" list (`all-services`), which shows
 * orders of every type, and — for the lists that are one table — Translation and
 * Passport photos.
 */

import { orderIdFromReference } from '../../domain/orderReference';

export type SearchQueue =
  | 'all-services'
  | 'public-visa'
  | 'police-clearance'
  | 'russian-visa-voucher'
  | 'document-delivery'
  | 'document-legalisation';

/** Quotes a value for SQL — in production, `sequelize.escape`. */
export type Escape = (value: string) => string;

/** More words than this are ignored; nobody searching types a paragraph. */
const MAX_WORDS = 6;

/** The words of a search, wildcards neutralised. */
export const searchWords = (search: string | undefined): string[] =>
  (search ?? '')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word !== '')
    .slice(0, MAX_WORDS);

/** `%`, `_` and `\` are characters when a person types them, not wildcards. */
const likeText = (word: string): string => word.replace(/[\\%_]/g, '\\$&');

/**
 * What a date column reads like to the person searching.
 *
 * Every shape staff type or read: `29 Oct 2026 5:30 AM` (the screen), `29 October`,
 * `29/10/2026`, `29-10-2026` and `2026-10-29`. The values are Sydney wall-clock
 * strings (see `shared/dates`), so formatting them in the database gives the same
 * text the screen shows, with no zone arithmetic.
 */
const dateText = (column: string, withTime = false): string =>
  `CONCAT_WS(' | ', ${
    withTime
      ? `DATE_FORMAT(${column}, '%e %b %Y %l:%i %p')`
      : `DATE_FORMAT(${column}, '%e %b %Y')`
  }, DATE_FORMAT(${column}, '%d %b %Y'), DATE_FORMAT(${column}, '%e %M %Y'), DATE_FORMAT(${column}, '%d/%m/%Y'), DATE_FORMAT(${column}, '%d-%m-%Y'), DATE_FORMAT(${column}, '%Y-%m-%d'))`;

/** The words the queues print for `tbl_cls_order.status`, by code. */
const STATUS_WORDS: readonly { code: number; words: readonly string[] }[] = [
  { code: 0, words: ['Pending'] },
  { code: 1, words: ['Paid'] },
  { code: 2, words: ['Completed', 'Cls Confirmed'] },
];

/** How far a legalisation or visa order has got, in the words the queue prints. */
const SCAN_WORDS = {
  none: 'Not received yet',
  first: 'Scan1 (All items received)',
  second: 'Scan2 (Submitted for processing)',
  third: 'Scan3 (Completed & received)',
  fourth: 'Scan4 (On route & closed)',
} as const;

/** The four milestone stamps on a destination, lowest first. */
const STAMPS = [
  'visa_date_cls_received_all_items',
  'visa_date_submitted_for_processing',
  'visa_date_completed_and_received_at_cls',
  'visa_date_order_on_route_and_closed',
] as const;

const ORDER = 'ClsOrder';

/** Orders having a destination with this stamp written (not null, blank or zero). */
const hasStamp = (stamp: (typeof STAMPS)[number]): string =>
  `${ORDER}.id IN (SELECT d.order_id FROM tbl_cls_order_destinations d WHERE d.order_id IS NOT NULL AND d.${stamp} IS NOT NULL AND CAST(d.${stamp} AS CHAR) NOT IN ('', '0000-00-00', '0000-00-00 00:00:00'))`;

/** The condition for "the furthest stamp reached is this one". */
const scanLevel = (level: keyof typeof SCAN_WORDS): string => {
  const one = hasStamp('visa_date_cls_received_all_items');
  const two = hasStamp('visa_date_submitted_for_processing');
  const three = hasStamp('visa_date_completed_and_received_at_cls');
  const four = hasStamp('visa_date_order_on_route_and_closed');
  const not = (sql: string) => `NOT (${sql})`;

  switch (level) {
    case 'none':
      return [one, two, three, four].map(not).join(' AND ');
    case 'first':
      return [one, not(two), not(three), not(four)].join(' AND ');
    case 'second':
      return [two, not(three), not(four)].join(' AND ');
    case 'third':
      return [three, not(four)].join(' AND ');
    default:
      return four;
  }
};

type Predicate = (like: string, word: string, escape: Escape) => string | null;

const idMatches: Predicate = (like) => `CAST(${ORDER}.id AS CHAR) LIKE ${like}`;

const migratedMatches: Predicate = (like) => `${ORDER}.order_no LIKE ${like}`;

const submittedMatches: Predicate = (like) =>
  `${dateText(`${ORDER}.date_submitted`, true)} LIKE ${like}`;

const statusMatches: Predicate = (_like, word) => {
  const wanted = word.toLowerCase();
  const codes = STATUS_WORDS.filter(({ words }) =>
    words.some((label) => label.toLowerCase().includes(wanted))
  ).map(({ code }) => code);

  return codes.length > 0 ? `${ORDER}.status IN (${codes.join(', ')})` : null;
};

/** The traveller the queue names — the primary one, as the queue's own join has it. */
const travellerMatches: Predicate = (like) =>
  `${ORDER}.id IN (SELECT t.order_id FROM tbl_order_traveller_details t WHERE t.order_id IS NOT NULL AND t.is_primary = 1 AND (t.first_name LIKE ${like} OR t.last_name LIKE ${like} OR CONCAT_WS(' ', t.first_name, t.last_name) LIKE ${like} OR t.email LIKE ${like}))`;

/** The contact on the order itself, for the queues with no traveller. */
const contactMatches: Predicate = (like) =>
  `(${ORDER}.contact_first_name LIKE ${like} OR ${ORDER}.contact_last_name LIKE ${like} OR CONCAT_WS(' ', ${ORDER}.contact_first_name, ${ORDER}.contact_last_name) LIKE ${like} OR ${ORDER}.contact_email LIKE ${like})`;

/** Team Member / Assigned To: by name or by email. */
const teamMatches: Predicate = (like) =>
  `${ORDER}.visa_cls_team_member IN (SELECT u.id FROM tbl_user_admin u WHERE u.fname LIKE ${like} OR u.lname LIKE ${like} OR CONCAT_WS(' ', u.fname, u.lname) LIKE ${like} OR u.email LIKE ${like})`;

const destinationMatches =
  (columns: readonly string[]): Predicate =>
  (like) =>
    `${ORDER}.destination IN (SELECT c.id FROM tbl_countries c WHERE ${columns
      .map((column) => `c.${column} LIKE ${like}`)
      .join(' OR ')})`;

const departureMatches: Predicate = (like) =>
  `${dateText(`${ORDER}.departure_date`)} LIKE ${like}`;

const locationMatches: Predicate = (like) =>
  `${ORDER}.id IN (SELECT d.order_id FROM tbl_cls_order_destinations d JOIN tbl_public_visa_type_locations l ON l.id = d.process_location_id WHERE d.order_id IS NOT NULL AND l.location LIKE ${like})`;

const scanMatches: Predicate = (_like, word) => {
  const wanted = word.toLowerCase();
  const levels = (Object.keys(SCAN_WORDS) as (keyof typeof SCAN_WORDS)[]).filter(
    (level) => SCAN_WORDS[level].toLowerCase().includes(wanted)
  );

  return levels.length > 0
    ? `(${levels.map((level) => `(${scanLevel(level)})`).join(' OR ')})`
    : null;
};

const clearanceTypeMatches: Predicate = (like) =>
  `${ORDER}.police_clearance_id IN (SELECT p.id FROM tbl_police_clearances p WHERE p.name LIKE ${like})`;

const voucherMatches: Predicate = (like) =>
  `${ORDER}.russian_visa_voucher_id IN (SELECT v.id FROM tbl_russian_visa_voucher_types v WHERE v.type LIKE ${like} OR v.name LIKE ${like})`;

/** Pieces, pickup date, and the two times, as the delivery queue prints them. */
const deliveryMatches: Predicate = (like) =>
  `${ORDER}.id IN (SELECT x.order_id FROM tbl_order_doc_delivery_details x WHERE x.order_id IS NOT NULL AND (CAST(x.package_total_pieces AS CHAR) LIKE ${like} OR ${dateText('x.package_pickup_date')} LIKE ${like} OR CONCAT(LPAD(IFNULL(x.package_ready_time_by_hr, 0), 2, '0'), ':', LPAD(IFNULL(x.package_ready_time_by_min, 0), 2, '0')) LIKE ${like} OR CONCAT(LPAD(IFNULL(x.package_close_time_by_hr, 0), 2, '0'), ':', LPAD(IFNULL(x.package_close_time_by_min, 0), 2, '0')) LIKE ${like}))`;

const companyMatches: Predicate = (like) =>
  `${ORDER}.id IN (SELECT r.order_id FROM tbl_order_return_document_details r WHERE r.order_id IS NOT NULL AND r.company LIKE ${like})`;

const legalisationRefMatches: Predicate = (like) =>
  `${ORDER}.id IN (SELECT l.order_id FROM tbl_document_legalization_order_details l WHERE l.order_id IS NOT NULL AND (l.com_invoice_no LIKE ${like} OR l.ref_no LIKE ${like}))`;

/**
 * A reference as the website writes it — `CLS-034668` — is the order id. The
 * order screen and the client's email both quote it, so staff paste it.
 */
const referenceMatches: Predicate = (_like, word) => {
  const id = orderIdFromReference(word);

  return id !== null ? `${ORDER}.id = ${id}` : null;
};

/** `tbl_cls_order.order_type`, in the words the Orders tabs use. */
const SERVICE_WORDS: readonly { code: number; label: string }[] = [
  { code: 1, label: 'Visa' },
  { code: 2, label: 'TPN' },
  { code: 3, label: 'TPN and Visa' },
  { code: 4, label: 'Passport Delivery' },
  { code: 5, label: 'Police Clearance' },
  { code: 6, label: 'Public Visas' },
  { code: 7, label: 'Document Delivery' },
  { code: 8, label: 'Russian Visa Voucher' },
  { code: 9, label: 'Document Legalisation' },
];

const serviceMatches: Predicate = (_like, word) => {
  const wanted = word.toLowerCase();
  const codes = SERVICE_WORDS.filter(({ label }) =>
    label.toLowerCase().includes(wanted)
  ).map(({ code }) => code);

  return codes.length > 0 ? `${ORDER}.order_type IN (${codes.join(', ')})` : null;
};

/** The Payment column: Paid, or Unpaid. Matched from the start, so "paid" is not "unpaid". */
const paymentMatches: Predicate = (_like, word) => {
  const wanted = word.toLowerCase();
  const codes = [
    { code: 1, label: 'paid' },
    { code: 0, label: 'unpaid' },
  ]
    .filter(({ label }) => label.startsWith(wanted))
    .map(({ code }) => code);

  return codes.length > 0 ? `${ORDER}.payment_status IN (${codes.join(', ')})` : null;
};

/** The Total column, whether or not the `$` was typed. */
const totalMatches: Predicate = (_like, word, escape) => {
  const amount = word.replace(/[$,]/g, '');

  return /^\d+(\.\d+)?$/.test(amount)
    ? `CAST(${ORDER}.total_fee AS CHAR) LIKE ${escape(`%${likeText(amount)}%`)}`
    : null;
};

/** Every column of the destination country, as the unified list prints it. */
const countryName = destinationMatches(['country_name', 'country_name_display']);

/** The columns each queue shows, as what a word can match. */
const PREDICATES: Record<SearchQueue, readonly Predicate[]> = {
  'all-services': [
    idMatches,
    referenceMatches,
    migratedMatches,
    submittedMatches,
    serviceMatches,
    contactMatches,
    travellerMatches,
    countryName,
    statusMatches,
    paymentMatches,
    totalMatches,
    teamMatches,
  ],
  'public-visa': [
    submittedMatches,
    idMatches,
    travellerMatches,
    destinationMatches(['country_name', 'country_name_display']),
    departureMatches,
    statusMatches,
    migratedMatches,
    scanMatches,
    locationMatches,
    teamMatches,
  ],
  'police-clearance': [
    idMatches,
    submittedMatches,
    travellerMatches,
    clearanceTypeMatches,
    statusMatches,
    teamMatches,
    migratedMatches,
  ],
  'russian-visa-voucher': [
    idMatches,
    submittedMatches,
    voucherMatches,
    travellerMatches,
    migratedMatches,
    statusMatches,
  ],
  'document-delivery': [
    idMatches,
    submittedMatches,
    contactMatches,
    deliveryMatches,
    migratedMatches,
    statusMatches,
  ],
  'document-legalisation': [
    idMatches,
    submittedMatches,
    contactMatches,
    destinationMatches(['country_name_display', 'country_name']),
    companyMatches,
    scanMatches,
    teamMatches,
    legalisationRefMatches,
    migratedMatches,
    statusMatches,
  ],
};

/**
 * One SQL condition per word; the row must satisfy all of them.
 *
 * An empty search gives no conditions, which is the unfiltered queue.
 */
export const queueSearchSql = (
  queue: SearchQueue,
  search: string | undefined,
  escape: Escape
): string[] =>
  searchWords(search).map((word) => {
    const like = escape(`%${likeText(word)}%`);
    const matches = PREDICATES[queue]
      .map((predicate) => predicate(like, word, escape))
      .filter((sql): sql is string => sql !== null);

    return `(${matches.join(' OR ')})`;
  });

/**
 * Translation enquiries: one table, so plain columns. Name, email, phone, both
 * languages, the uploaded file names and the submitted date.
 */
export const translationSearchSql = (
  search: string | undefined,
  escape: Escape
): string[] =>
  searchWords(search).map((word) => {
    const like = escape(`%${likeText(word)}%`);

    return `(CAST(id AS CHAR) LIKE ${like} OR full_name LIKE ${like} OR email LIKE ${like} OR phone LIKE ${like} OR language_from LIKE ${like} OR language_to LIKE ${like} OR document_name LIKE ${like} OR ${dateText('created', true)} LIKE ${like})`;
  });

/** Passport photos: the client's name (in either order), email, type and date. */
export const passportPhotoSearchSql = (
  search: string | undefined,
  escape: Escape
): string[] =>
  searchWords(search).map((word) => {
    const like = escape(`%${likeText(word)}%`);

    return `(CAST(id AS CHAR) LIKE ${like} OR fname LIKE ${like} OR lname LIKE ${like} OR CONCAT_WS(' ', fname, lname) LIKE ${like} OR email LIKE ${like} OR type LIKE ${like} OR ${dateText('passport_updated_at', true)} LIKE ${like})`;
  });
