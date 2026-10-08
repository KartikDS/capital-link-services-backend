import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ClsOrder,
  ClsOrderDestinations,
  Countries,
  DocumentLegalizationOrderDetails,
  OrderDestinationNotes,
  OrderDlChecklist,
  OrderFollowUpDate,
  OrderNotes,
  OrderReturnDocumentDetails,
  OrderTravellerDetails,
  Payment,
  UserAdmin,
  UserClient,
  VisaCourierOptions,
} from '../../models';
import { currentUserId } from '../../middleware/authenticate';
import {
  LEGALISATION_NOTE_FIELDS,
  legalisationNoteUpload,
} from '../../middleware/upload';
import { ok } from '../../shared/http/responses';
import { badRequest, conflict, forbidden, notFound } from '../../shared/errors';
import { streamDocument } from '../../shared/http/streamDocument';
import { toDateOnly, toIso, toLegacyDateTime } from '../../shared/dates';
import { discardDocument, openDocument, storedPathOf } from '../../shared/storage/documents';
import { orderFolder } from '../../shared/storage/documentFolders';
import { clean, fullName } from '../../shared/text';
import { idParam, validate, validParams, validQuery } from '../../shared/validation';
import { CLS_CONTACT } from '../../domain/company';
import { ENABLED, ORDER_TYPE } from '../../domain/codes';
import { orderReference } from '../../domain/orderReference';
import { requestOf, type LegalisationRequest } from './legalisationRequest';

/**
 * The Document Legalisation order screen — every read and write behind it.
 *
 * Reproduces `viewDocLegalisationAction` (and the small actions around it) from
 * the legacy `CLSadminBundle` `ViewOrderController`, read in full rather than
 * grepped (memory `cls-order-detail-field-audit`). `GET /orders/:id/detail` stays
 * the generic read for every other service; this is the DL-specific, writable
 * counterpart, so the DL screen can do what the old one did.
 *
 * ## Shape of this module
 *
 * - **Every route checks the order is a document-legalisation order and answers
 *   404 otherwise.** The generic `AdminOrderView` keeps serving public visas,
 *   vouchers and clearances, and a DL write against one of those would stamp a
 *   milestone on a job that has no such milestones.
 * - **Every id that arrives in the URL or body is checked against THIS order**
 *   before it is used. `tbl_order_notes`, `tbl_order_dl_checklist` and
 *   `tbl_order_destination_notes` are MyISAM with no foreign keys, so nothing
 *   below the application stops `/orders/5/legalisation/tracking/9` from naming a
 *   row that belongs to order 6. The legacy actions took a bare id and deleted it
 *   (and `deleteOrderNotesComment` deleted a *document type across every order*);
 *   this scopes all of it to the order in the path.
 * - **`audit` is injected, not imported.** It is private to `admin.routes.ts`
 *   (which mounts this router), and importing it back would be a cycle. Passing
 *   it also lets the tests assert exactly which audit lines each write produces.
 *
 * ## Lane 1 is confidential — three of the four gates live here
 *
 * `tbl_order_destination_notes.is_admin` reads backwards from its name: 0 is the
 * "Client comment" CLS *sends* to the client, 1 is the "Admin comment", CLS's own
 * working note, which must never reach a client (memory
 * `consultant-thread-destination-notes`). This router is staff-only, so it may
 * read both lanes — but it must never *publish* lane 1, so: the client email is
 * suppressed whenever an admin comment is written (`suppress`), lane-1 files are
 * stored in a separate `internal/` folder, and only lane 0 is ever named in
 * `notification.attachments`. The client portal's own gates
 * (`listClientVisibleDestinationNotes`, `commentAttachment`) are untouched.
 *
 * ## Dates
 *
 * Stamps (`visa_date_*`) are `DATETIME`; the embassy and follow-up dates are
 * `DATEONLY`. Reads return an ISO instant for the first and a plain
 * `YYYY-MM-DD` for the second — a date-only value pushed through a Sydney
 * midnight conversion arrives a day early in half the world. Writes accept an ISO
 * instant (converted to Sydney wall-clock like every other write here), a naive
 * `YYYY-MM-DDTHH:mm[:ss]` (taken as Sydney wall-clock as it stands), or `''` to
 * clear.
 */

/** Records one audit line. See `audit()` in `admin.routes.ts`. */
export type LegalisationAudit = (
  req: Request,
  action: string,
  detail: Record<string, unknown>
) => Promise<void>;

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

/**
 * The "Location" options on the document-type tracker, per region.
 *
 * Kept as data keyed by region so the NZ port swaps one constant rather than
 * editing logic. AU's list is the one in the legacy `docLegalisation.html.twig`
 * (Notary, Chamber, DFAT, CMO, AFP, Embassy), in the twig's own order. NZ has a
 * different list (and a leading "Translator" on the add-new-row form only) and is
 * ported separately — it is deliberately not guessed here.
 */
export const LEGALISATION_LOCATIONS = {
  AU: ['Notary', 'Chamber', 'DFAT', 'CMO', 'AFP', 'Embassy'],
} as const;

/** The region this backend serves. The NZ repo changes this and the table above. */
export const LEGALISATION_REGION: keyof typeof LEGALISATION_LOCATIONS = 'AU';

const locationsForRegion = (): readonly string[] =>
  LEGALISATION_LOCATIONS[LEGALISATION_REGION];

/** Where legacy `saveSignatureAction` kept the signature pad PNGs, under the upload root. */
export const SIGNATURE_DIRECTORY = 'dev/order_signature';

/** The two statuses the tracker's select offers. */
export const TRACKING_STATUSES = ['Delivered', 'Received'] as const;

// ---------------------------------------------------------------------------
// Response types — the contract the frontend is built against
// ---------------------------------------------------------------------------

export type LegalisationLane = 'client' | 'admin';

export interface LegalisationComment {
  id: number;
  /** `client` = `is_admin` 0 (emailed, portal-visible); `admin` = `is_admin` 1 (confidential). */
  lane: LegalisationLane;
  body: string;
  byName: string | null;
  userType: string | null;
  dateAdded: string | null;
  /** The attachment's file name only — fetch it from `…/comments/:id/attachment`. */
  attachment: string | null;
  /** Whether [Edit]/[Delete] show: lane 1 always, lane 0 only when `user_type` is `Admin`. */
  editable: boolean;
}

export interface LegalisationTrackingRow {
  id: number;
  location: string | null;
  price: number | null;
  status: string | null;
  noteByName: string | null;
  dateAdded: string | null;
}

export interface LegalisationTrackingGroup {
  documentType: string;
  rows: LegalisationTrackingRow[];
  latest: { location: string | null; price: number | null; status: string | null };
}

export type LegalisationSignature =
  | { kind: 'strokes'; strokes: unknown[] }
  | { kind: 'image'; file: string }
  | null;

export interface LegalisationScreen {
  order: {
    id: number;
    orderNo: string;
    /** The client-facing portal reference (`CLS-000012`), which `/dashboard/orders/[reference]` is keyed by. */
    reference: string;
    status: 0 | 1 | 2;
    clientId: number | null;
    clientName: string | null;
    clientEmail: string | null;
    dateSubmitted: string | null;
    addressConfirmed: 0 | 1 | 2;
    courierServiceId: number | null;
    isDhlCourier: boolean;
  };
  destination: {
    id: number;
    countryId: number | null;
    countryName: string | null;
    embassyName: string | null;
  };
  stamps: {
    received: string | null;
    submitted: string | null;
    completed: string | null;
    closed: string | null;
  };
  ticket: {
    shippedBy: string | null;
    comNoteNo: string | null;
    comNoteIn: string | null;
    invoiceNo: string | null;
    signeeName: string | null;
    /** `YYYY-MM-DD`. */
    followUpDate: string | null;
    signature: LegalisationSignature;
  };
  comments: LegalisationComment[];
  team: {
    memberId: number | null;
    options: { id: number; name: string }[];
  };
  embassy: {
    deliveredToEmbassy: boolean;
    /** `YYYY-MM-DD`. */
    deliveredDate: string | null;
    nextEmbassy: string | null;
  };
  tracking: LegalisationTrackingGroup[];
  details: {
    destinationCountryId: number | null;
    nationalityId: number | null;
    typeOfDocument: 1 | 2 | null;
    refNo: string | null;
    comInvoiceNo: string | null;
    countries: { id: number; name: string }[];
  };
  contact: {
    company: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  };
  checklist: {
    id: number;
    type: string | null;
    number: number | null;
    note: string | null;
    hasFile: boolean;
  }[];
  delivery: {
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    company: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
    /** `tbl_countries.country_name` of the return address's country. */
    country: string | null;
    /** `additional_comment`: the order instructions the client wrote on the new form. */
    comment: string | null;
    returningDate: string | null;
    hasAddress: boolean;
  } | null;
  /**
   * Everything the new attestation order form collected, read back from where it was
   * stored. See `legalisationRequest.ts` for what is a column and what is the note.
   */
  request: LegalisationRequest;
  payment: {
    status: 0 | 1 | 2 | null;
    billing: {
      address: string | null;
      city: string | null;
      state: string | null;
      postcode: string | null;
      country: string | null;
    } | null;
  };
  locations: string[];
}

export type LegalisationScantype = 'first' | 'second' | 'third' | 'fourth' | '';

export interface LegalisationNotification {
  scantype: LegalisationScantype;
  clientComment: string | null;
  /** True when an admin comment was written: legacy `$isMailToClient = false`. */
  suppress: boolean;
  orderNo: string;
  /** The portal reference, for the "track your order" link in the client email. */
  reference: string;
  clientEmail: string | null;
  clientFirstName: string | null;
  embassyName: string | null;
  nextEmbassy: string | null;
  /** Stored paths of the lane-0 files only. Never lane 1. */
  attachments: string[];
}

export interface LegalisationTicketResult {
  notification: LegalisationNotification;
  comments: LegalisationComment[];
}

export interface LegalisationAddressConfirmation {
  orderId: number;
  orderNo: string;
  /** The portal reference, for the "Confirm Address" link. */
  reference: string;
  clientEmail: string | null;
  clientFirstName: string | null;
  clientLastName: string | null;
  isBulk: boolean;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  phone: string | null;
  /** `tbl_countries.country_name_display` of the order's destination. */
  countryDisplay: string | null;
}

export type LegalisationPrintKind = 'return-address' | 'embassy-to-from' | 'order-label';

interface PrintAddress {
  name: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
}

export type LegalisationPrintView =
  | {
      kind: 'return-address';
      orderId: number;
      orderNo: string;
      to: PrintAddress;
    }
  | {
      kind: 'embassy-to-from';
      orderId: number;
      orderNo: string;
      from: { company: string; phone: string };
      to: {
        name: string | null;
        country: string | null;
        addressLine1: string | null;
        addressLine2: string | null;
        street: string | null;
        city: string | null;
        state: string | null;
        postcode: string | null;
        phone: string | null;
      };
    }
  | {
      kind: 'order-label';
      orderId: number;
      orderNo: string;
      destination: string | null;
      clientName: string | null;
      checklistRows: number;
      documentCount: number;
    };

// ---------------------------------------------------------------------------
// Date handling
// ---------------------------------------------------------------------------

const ZONED_ISO = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i;
const NAIVE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * A submitted stamp to the legacy `YYYY-MM-DD HH:MM:SS` string.
 *
 * `null` for blank (clear it), the string for a readable value, `undefined` for
 * one that cannot be read — which the caller turns into a 400.
 */
export const parseStamp = (value: string): string | null | undefined => {
  const trimmed = value.trim();
  if (trimmed === '') return null;

  if (ZONED_ISO.test(trimmed)) {
    const instant = new Date(trimmed);
    return Number.isNaN(instant.getTime()) ? undefined : toLegacyDateTime(instant);
  }

  const match = NAIVE_ISO.exec(trimmed);
  if (!match) return undefined;

  const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
  const probe = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    probe.getUTCFullYear() !== Number(year) ||
    probe.getUTCMonth() !== Number(month) - 1 ||
    probe.getUTCDate() !== Number(day) ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  ) {
    return undefined;
  }

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
};

/** A submitted calendar day to `YYYY-MM-DD`; same null/undefined contract. */
export const parseDay = (value: string): string | null | undefined => {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const stamp = parseStamp(trimmed);
    return stamp === undefined || stamp === null ? undefined : trimmed;
  }

  const stamp = parseStamp(trimmed);
  return typeof stamp === 'string' ? stamp.slice(0, 10) : stamp;
};

/**
 * A stored stamp in the same `YYYY-MM-DD HH:MM:SS` form `parseStamp` produces, so
 * the two can be compared as strings. Null for blank or unreadable.
 */
export const normaliseStored = (value: unknown): string | null => {
  const iso = toIso(value);
  return iso ? toLegacyDateTime(new Date(iso)) : null;
};

const stampField = z
  .string()
  .max(40)
  .refine((value) => parseStamp(value) !== undefined, 'Enter a valid date and time');

const dayField = z
  .string()
  .max(40)
  .refine((value) => parseDay(value) !== undefined, 'Enter a valid date');

// ---------------------------------------------------------------------------
// Milestones and the client email they trigger
// ---------------------------------------------------------------------------

type StampKey =
  | 'allItemsReceivedAtCLS'
  | 'submittedForProcessing'
  | 'completedReceivedAtCLS'
  | 'orderOnRouteAndClosed';

type StampColumn =
  | 'visa_date_cls_received_all_items'
  | 'visa_date_submitted_for_processing'
  | 'visa_date_completed_and_received_at_cls'
  | 'visa_date_order_on_route_and_closed';

/**
 * The four milestones **in the legacy priority order**. Legacy tested them with an
 * `if / elseif` chain, so when several change in one save only the first one in
 * this list decides the email — hence an ordered array, not an object.
 */
const MILESTONES: readonly {
  key: StampKey;
  column: StampColumn;
  scantype: Exclude<LegalisationScantype, ''>;
  audit: string;
}[] = [
  {
    key: 'allItemsReceivedAtCLS',
    column: 'visa_date_cls_received_all_items',
    scantype: 'first',
    audit: 'legalisation.received',
  },
  {
    key: 'submittedForProcessing',
    column: 'visa_date_submitted_for_processing',
    scantype: 'second',
    audit: 'legalisation.submitted',
  },
  {
    key: 'completedReceivedAtCLS',
    column: 'visa_date_completed_and_received_at_cls',
    scantype: 'third',
    audit: 'legalisation.issued',
  },
  {
    key: 'orderOnRouteAndClosed',
    column: 'visa_date_order_on_route_and_closed',
    scantype: 'fourth',
    audit: 'legalisation.closed',
  },
];

/**
 * Which milestone this save advanced, or none.
 *
 * `submitted` holds only the stamps the request carried, already normalised
 * (`null` = cleared). A stamp counts as a change when it is **set** and differs
 * from what is stored. Legacy compared `stored != submitted`, which also fired on
 * a *cleared* stamp — so un-stamping "all items received" emailed the client
 * "your documents have arrived". Clearing is a correction, not a milestone, so it
 * is deliberately not treated as one here.
 */
export const pickMilestone = (
  stored: Partial<Record<StampColumn, unknown>>,
  submitted: Partial<Record<StampKey, string | null>>
): (typeof MILESTONES)[number] | null => {
  for (const milestone of MILESTONES) {
    const next = submitted[milestone.key];
    if (next === undefined || next === null) continue;
    if (normaliseStored(stored[milestone.column]) !== next) return milestone;
  }
  return null;
};

// ---------------------------------------------------------------------------
// Loading and shaping
// ---------------------------------------------------------------------------

/** The order, or a 404 when it is missing or not a document-legalisation order. */
const loadOrder = async (id: number): Promise<ClsOrder> => {
  const order = await ClsOrder.findByPk(id);
  if (!order || order.order_type !== ORDER_TYPE.DOCUMENT_LEGALISATION) {
    throw notFound('We could not find that document legalisation order.');
  }
  return order;
};

/**
 * The order's destination row — the one the Ticket panel, both comment lanes and
 * the milestones hang on. A DL order has exactly one; the oldest wins if data ever
 * says otherwise.
 */
const loadDestination = async (orderId: number): Promise<ClsOrderDestinations> => {
  const destination = await ClsOrderDestinations.findOne({
    where: { order_id: orderId },
    order: [['id', 'ASC']],
  });
  if (!destination) {
    throw notFound('This order has no destination row to work on.');
  }
  return destination;
};

/** Who the client email goes to. Bulk orders use the account's address, as legacy did. */
const clientContactOf = async (order: ClsOrder) => {
  const client = order.client_id ? await UserClient.findByPk(order.client_id) : null;
  const email =
    order.is_bulk === 1
      ? clean(client?.email)
      : (clean(order.contact_email) ?? clean(client?.email));

  return {
    client,
    email,
    firstName: clean(client?.fname) ?? clean(order.contact_first_name),
    lastName: clean(client?.lname) ?? clean(order.contact_last_name),
  };
};

const orderNoOf = (order: ClsOrder): string => clean(order.order_no) ?? String(order.id);

const laneOf = (note: OrderDestinationNotes): LegalisationLane =>
  // null counts as the client lane, matching `listClientVisibleDestinationNotes`.
  note.is_admin === 1 ? 'admin' : 'client';

export const commentOf = (note: OrderDestinationNotes): LegalisationComment => {
  const lane = laneOf(note);
  const attachment = clean(note.attachment);

  return {
    id: note.id,
    lane,
    body: note.note ?? '',
    byName: clean(note.note_by_name),
    userType: clean(note.user_type),
    dateAdded: toIso(note.date_added),
    attachment: attachment ? path.basename(attachment.replace(/\\/g, '/')) : null,
    editable: lane === 'admin' || note.user_type === 'Admin',
  };
};

/**
 * Whether a note may be edited or deleted.
 *
 * Lane 1 always (it is CLS's own); lane 0 only when a staff member wrote it — a
 * client's own reply is `user_type = 'Client'` and is not the admin's to rewrite.
 */
export const noteIsEditable = (note: OrderDestinationNotes): boolean =>
  laneOf(note) === 'admin' || note.user_type === 'Admin';

const listComments = async (destinationId: number): Promise<LegalisationComment[]> => {
  const notes = await OrderDestinationNotes.findAll({
    where: { destination_id: destinationId },
    order: [['id', 'DESC']],
  });
  return notes.map(commentOf);
};

/**
 * One destination note, only if it belongs to this order's destination.
 *
 * `tbl_order_destination_notes` has no order column and no foreign key; the
 * destination id is the only link, so it is the ownership check. Absence and
 * "someone else's" give the same 404.
 */
const loadOwnedNote = async (
  destination: ClsOrderDestinations,
  noteId: number
): Promise<OrderDestinationNotes> => {
  const note = await OrderDestinationNotes.findByPk(noteId);
  if (!note || note.destination_id !== destination.id) {
    throw notFound('We could not find that comment on this order.');
  }
  return note;
};

const signatureOf = (value: string | null): LegalisationSignature => {
  const stored = clean(value);
  if (!stored) return null;

  // The legacy signature pad stored its strokes as a JSON array in this column.
  if (stored.startsWith('[')) {
    try {
      const strokes: unknown = JSON.parse(stored);
      return Array.isArray(strokes) ? { kind: 'strokes', strokes } : null;
    } catch {
      return null;
    }
  }

  // `saveSignatureAction` stores `{md5}_{order}_{destination}.png` instead.
  if (/\.(png|jpe?g|gif|svg)$/i.test(stored)) {
    return { kind: 'image', file: path.basename(stored.replace(/\\/g, '/')) };
  }

  return null;
};

/**
 * Groups the order's tracker rows by `document_type`.
 *
 * Group order and row order are newest first, as the legacy lists were
 * (`getOrderNotesByOrderNo` is `ORDER BY id DESC`). `latest` is the newest row of
 * the group — the one the "Update" form is pre-filled from; legacy's
 * `GROUP BY document_type` picked an arbitrary row (in practice the oldest) for it.
 * Only `is_admin = 1` rows are history lines, as in the twig.
 */
export const trackingOf = (rows: OrderNotes[]): LegalisationTrackingGroup[] => {
  const newestFirst = [...rows].sort((a, b) => b.id - a.id);
  const groups = new Map<string, OrderNotes[]>();

  for (const row of newestFirst) {
    const type = clean(row.document_type);
    if (!type) continue;
    const bucket = groups.get(type) ?? [];
    bucket.push(row);
    groups.set(type, bucket);
  }

  return [...groups.entries()].map(([documentType, entries]) => {
    const latest = entries[0] as OrderNotes;
    return {
      documentType,
      rows: entries
        .filter((row) => row.is_admin === 1)
        .map((row) => ({
          id: row.id,
          location: clean(row.location),
          price: row.price,
          status: clean(row.status),
          noteByName: clean(row.note_by_name),
          dateAdded: toIso(row.date_added),
        })),
      latest: {
        location: clean(latest.location),
        price: latest.price,
        status: clean(latest.status),
      },
    };
  });
};

const hasReturnAddress = (row: OrderReturnDocumentDetails | null): boolean =>
  Boolean(clean(row?.address) && clean(row?.city) && clean(row?.postcode));

const asTriState = (value: number | null): 0 | 1 | 2 =>
  value === 1 || value === 2 ? value : 0;

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

const idParams = validate(z.object({ id: idParam }), 'params');

/**
 * Where a lane-0/lane-1 attachment goes: the order's own folder, once the order is
 * known to exist and to be a DL order — refused before a byte is stored otherwise.
 */
const noteUploadFolder = async (req: Request): Promise<string> => {
  const order = await ClsOrder.findByPk(Number(req.params.id), {
    attributes: ['id', 'client_id', 'order_type'],
  });
  if (!order || order.order_type !== ORDER_TYPE.DOCUMENT_LEGALISATION) {
    throw notFound('We could not find that document legalisation order.');
  }
  return orderFolder({ id: order.id, client_id: order.client_id });
};

const optionalText = (max: number) => z.string().max(max).optional();

const ticketSchema = z.object({
  allItemsReceivedAtCLS: stampField.optional(),
  submittedForProcessing: stampField.optional(),
  completedReceivedAtCLS: stampField.optional(),
  orderOnRouteAndClosed: stampField.optional(),
  shippedBy: optionalText(255),
  comNoteNo: optionalText(255),
  comNoteIn: optionalText(255),
  invoiceNo: optionalText(255),
  signeeName: optionalText(255),
  clientComment: optionalText(20_000),
  adminComment: optionalText(20_000),
  clsTeamMember: z
    .string()
    .trim()
    .regex(/^\d*$/, 'Choose a team member')
    .optional(),
  deliveredToEmbassy: z.enum(['1', '0']).optional(),
  embassyDeliveredDate: dayField.optional(),
  nextEmbassy: optionalText(255),
  followUpDate: dayField.optional(),
});

type TicketBody = z.infer<typeof ticketSchema>;

const detailsSchema = z.object({
  destinationCountryId: z.coerce.number().int().positive(),
  nationalityId: z.coerce.number().int().positive(),
  typeOfDocument: z.union([z.literal(1), z.literal(2)]),
  refNo: z.string().trim().max(255),
  comInvoiceNo: z.string().trim().max(255),
});

const checklistSchema = z.object({
  rows: z
    .array(
      z.object({
        id: z.coerce.number().int().positive(),
        type: z.string().trim().max(255),
        number: z
          .union([z.literal(''), z.coerce.number().int().min(0).max(100_000)])
          .nullable()
          .optional(),
        note: z.string().max(5_000).nullable().optional(),
      })
    )
    .min(1)
    .max(200),
});

const trackingSchema = z.object({
  rows: z
    .array(
      z.object({
        documentType: z.string().trim().min(1, 'Enter the type of document').max(255),
        location: z.string().trim().min(1, 'Select a location').max(100),
        price: z
          .union([z.number(), z.string().trim().min(1, 'Enter a price')])
          .transform((value) =>
            typeof value === 'number' ? value : Number(value.replace(/^\$/, ''))
          )
          .refine((value) => Number.isFinite(value) && value >= 0, 'Enter a valid price'),
        status: z.enum(TRACKING_STATUSES, 'Select a status'),
      })
    )
    .min(1)
    .max(50),
});

const notePathSchema = z.object({ id: idParam, noteId: idParam });

/**
 * The router. `audit` is `admin.routes.ts`'s own audit writer — see the module
 * comment for why it is passed in.
 */
export const legalisationOrderRoutes = (audit: LegalisationAudit): Router => {
  const router = Router();

  /** The staff member making the request, for the byline on what they write. */
  const authorOf = async (req: Request) => {
    const id = currentUserId(req);
    const admin = await UserAdmin.findByPk(id);
    return { id, name: clean(admin?.fname) };
  };

  // -------------------------------------------------------------------------
  // GET /:id/legalisation — everything the screen renders
  // -------------------------------------------------------------------------

  const buildScreen = async (
    order: ClsOrder,
    destination: ClsOrderDestinations
  ): Promise<LegalisationScreen> => {
    const orderId = order.id;

    const [
      contact,
      traveller,
      destinationCountry,
      countries,
      details,
      checklist,
      orderNotes,
      comments,
      staff,
      returnDocument,
      payment,
      courierOption,
      followUp,
    ] = await Promise.all([
      clientContactOf(order),
      OrderTravellerDetails.findOne({ where: { order_id: orderId, is_primary: 1 } }),
      destination.country_id ? Countries.findByPk(destination.country_id) : null,
      Countries.findAll({
        attributes: ['id', 'country_name'],
        order: [['country_name', 'ASC']],
      }),
      DocumentLegalizationOrderDetails.findOne({ where: { order_id: orderId } }),
      OrderDlChecklist.findAll({ where: { order_no: orderId }, order: [['id', 'ASC']] }),
      OrderNotes.findAll({ where: { order_no: orderId, is_deleted: 0 } }),
      listComments(destination.id),
      // Legacy `getAdminUsers`: enabled, non-driver staff.
      UserAdmin.findAll({
        where: { s_enabled: ENABLED, s_driver: 0 },
        order: [['fname', 'ASC']],
      }),
      OrderReturnDocumentDetails.findOne({ where: { order_id: orderId } }),
      // Newest first: a re-attempted payment writes a second row. Keyed on the
      // order id, as `orderDetail.ts` does.
      Payment.findOne({ where: { order_no: orderId }, order: [['date_paid', 'DESC']] }),
      order.courier_service_id ? VisaCourierOptions.findByPk(order.courier_service_id) : null,
      // Only consulted when the destination column is empty — see `followUpDate` below.
      destination.visa_follow_up_date
        ? null
        : OrderFollowUpDate.findOne({ where: { order_id: orderId }, order: [['id', 'DESC']] }),
    ]);

    const billingCountry = payment?.mba_country_id
      ? await Countries.findByPk(payment.mba_country_id)
      : null;

    const returnCountry = returnDocument?.country_id
      ? await Countries.findByPk(returnDocument.country_id)
      : null;

    const clientName =
      fullName(traveller?.first_name, traveller?.last_name) ||
      fullName(order.contact_first_name, order.contact_last_name) ||
      fullName(contact.client?.fname, contact.client?.lname) ||
      null;

    return {
      order: {
        id: order.id,
        orderNo: orderNoOf(order),
        reference: orderReference(order.id),
        status: asTriState(order.status),
        clientId: order.client_id,
        clientName,
        clientEmail: contact.email,
        dateSubmitted: toIso(order.date_submitted),
        addressConfirmed: asTriState(order.is_address_confirmed),
        courierServiceId: order.courier_service_id,
        isDhlCourier: courierOption?.s_dhl === 1,
      },
      destination: {
        id: destination.id,
        countryId: destination.country_id,
        countryName: clean(destinationCountry?.country_name),
        // Legacy `embassy_name` is `tbl_countries.rep_name` of the destination.
        embassyName: clean(destinationCountry?.rep_name),
      },
      stamps: {
        received: toIso(destination.visa_date_cls_received_all_items),
        submitted: toIso(destination.visa_date_submitted_for_processing),
        completed: toIso(destination.visa_date_completed_and_received_at_cls),
        closed: toIso(destination.visa_date_order_on_route_and_closed),
      },
      ticket: {
        shippedBy: clean(destination.visa_shipped_by),
        comNoteNo: clean(destination.visa_com_note_no),
        comNoteIn: clean(destination.visa_com_note_in),
        invoiceNo: clean(destination.visa_invoice_no),
        signeeName: clean(destination.sig_name),
        // Legacy wrote `tbl_order_follow_up_date` but displayed the destination
        // column, so what it saved was never read back. Both are written now;
        // read the column, fall back to the newest per-admin row.
        followUpDate:
          toDateOnly(destination.visa_follow_up_date) ?? toDateOnly(followUp?.follow_up_date),
        signature: signatureOf(destination.signature),
      },
      comments,
      team: {
        memberId: order.visa_cls_team_member || null,
        options: staff.map((member) => ({
          id: member.id,
          name: fullName(member.fname, member.lname) || String(member.id),
        })),
      },
      embassy: {
        deliveredToEmbassy: order.visa_is_delivered_to_embassy === 1,
        deliveredDate: toDateOnly(order.visa_is_delivered_to_embassy_date),
        nextEmbassy: clean(order.visa_next_embassy),
      },
      tracking: trackingOf(orderNotes),
      details: {
        destinationCountryId: details?.destination ?? destination.country_id,
        nationalityId: details?.nationality ?? null,
        typeOfDocument:
          details?.type_of_document === 1 || details?.type_of_document === 2
            ? details.type_of_document
            : null,
        refNo: clean(details?.ref_no),
        comInvoiceNo: clean(details?.com_invoice_no),
        countries: countries.map((row) => ({
          id: row.id,
          name: clean(row.country_name) ?? String(row.id),
        })),
      },
      contact: {
        company: clean(returnDocument?.company),
        firstName: clean(order.contact_first_name),
        lastName: clean(order.contact_last_name),
        email: clean(order.contact_email),
        phone: clean(order.contact_phone),
      },
      checklist: checklist.map((row) => ({
        id: row.id,
        type: clean(row.type),
        number: row.number,
        note: clean(row.note),
        hasFile: Boolean(clean(row.doc_file)),
      })),
      delivery: returnDocument
        ? {
            firstName: clean(returnDocument.first_name),
            lastName: clean(returnDocument.last_name),
            email: clean(returnDocument.email),
            phone: clean(returnDocument.contact_number),
            company: clean(returnDocument.company),
            address: clean(returnDocument.address),
            city: clean(returnDocument.city),
            state: clean(returnDocument.state),
            postcode: clean(returnDocument.postcode),
            country: clean(returnCountry?.country_name),
            comment: clean(returnDocument.additional_comment),
            returningDate: toIso(returnDocument.returning_date),
            hasAddress: hasReturnAddress(returnDocument),
          }
        : null,
      request: requestOf({
        notes: orderNotes,
        checklist,
        returnDocument,
        department: order.department,
      }),
      payment: {
        status: payment ? asTriState(payment.s_paid) : null,
        billing: clean(payment?.mba_address)
          ? {
              address: clean(payment?.mba_address),
              city: clean(payment?.mba_city),
              state: clean(payment?.mba_state),
              postcode: clean(payment?.mba_postcode),
              country: clean(billingCountry?.country_name),
            }
          : null,
      },
      locations: [...locationsForRegion()],
    };
  };

  router.get('/:id/legalisation', idParams, async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const order = await loadOrder(id);
    const destination = await loadDestination(id);

    ok(res, { legalisation: await buildScreen(order, destination) });
  });

  // -------------------------------------------------------------------------
  // PATCH /:id/legalisation/ticket — the main Update (legacy `updateTicket`)
  // -------------------------------------------------------------------------

  router.patch(
    '/:id/legalisation/ticket',
    idParams,
    legalisationNoteUpload(noteUploadFolder),
    validate(ticketSchema),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const body = req.body as TicketBody;

      const uploaded = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      const clientFiles = uploaded[LEGALISATION_NOTE_FIELDS.client] ?? [];
      const adminFiles = uploaded[LEGALISATION_NOTE_FIELDS.admin] ?? [];

      // Files are on disk before this handler runs (multer streams them straight
      // to storage), so anything that rejects the request *before* a note row
      // points at them has to throw them away again.
      let referenced = false;
      const discardUnreferenced = async (): Promise<void> => {
        if (referenced) return;
        await Promise.all(
          [...clientFiles, ...adminFiles].map((file) => discardDocument(storedPathOf(file)))
        );
      };

      try {
        const result = await applyTicket(req, id, body, clientFiles, adminFiles, () => {
          referenced = true;
        });
        ok(res, result);
      } catch (error) {
        await discardUnreferenced();
        throw error;
      }
    }
  );

  const applyTicket = async (
    req: Request,
    id: number,
    body: TicketBody,
    clientFiles: Express.Multer.File[],
    adminFiles: Express.Multer.File[],
    markReferenced: () => void
  ): Promise<LegalisationTicketResult> => {
    const order = await loadOrder(id);
    const destination = await loadDestination(id);

    const clientComment = (body.clientComment ?? '').trim();
    const adminComment = (body.adminComment ?? '').trim();

    if (clientFiles.length > 0 && clientComment === '') {
      throw badRequest('Write a comment to go with the attachment.', {
        clientComment: 'Write a comment to go with the attachment.',
      });
    }
    if (adminFiles.length > 0 && adminComment === '') {
      throw badRequest('Write a comment to go with the attachment.', {
        adminComment: 'Write a comment to go with the attachment.',
      });
    }

    // The submitted stamps, normalised; `undefined` = not on the request.
    const submitted: Partial<Record<StampKey, string | null>> = {};
    for (const { key } of MILESTONES) {
      const raw = body[key];
      if (raw !== undefined) submitted[key] = parseStamp(raw) ?? null;
    }

    // Team member: validated only when it changes, so re-saving an order whose
    // member has since left the roster does not fail.
    let teamMember: number | null | undefined;
    if (body.clsTeamMember !== undefined) {
      teamMember = body.clsTeamMember === '' ? null : Number(body.clsTeamMember);
      if (teamMember !== null && teamMember !== (order.visa_cls_team_member || null)) {
        const member = await UserAdmin.findOne({
          where: { id: teamMember, s_enabled: ENABLED },
        });
        if (!member) throw badRequest('That team member is not on the roster.');
      }
    }

    const author = await authorOf(req);
    const orderNo = orderNoOf(order);
    const milestone = pickMilestone(destination, submitted);

    // ---- The destination row: stamps, ticket, signee ----------------------
    const destinationPatch: Partial<Record<StampColumn, string | null>> & {
      visa_shipped_by?: string | null;
      visa_com_note_no?: string | null;
      visa_com_note_in?: string | null;
      visa_invoice_no?: string | null;
      sig_name?: string | null;
      visa_follow_up_date?: string | null;
    } = {};

    for (const { key, column } of MILESTONES) {
      if (submitted[key] !== undefined) destinationPatch[column] = submitted[key] ?? null;
    }
    const text = (value: string | undefined): string | null | undefined =>
      value === undefined ? undefined : clean(value);
    const ticketText = {
      visa_shipped_by: text(body.shippedBy),
      visa_com_note_no: text(body.comNoteNo),
      visa_com_note_in: text(body.comNoteIn),
      visa_invoice_no: text(body.invoiceNo),
      sig_name: text(body.signeeName),
    };
    for (const [column, value] of Object.entries(ticketText)) {
      if (value !== undefined) {
        (destinationPatch as Record<string, string | null>)[column] = value;
      }
    }

    let followUp: string | null | undefined;
    if (body.followUpDate !== undefined) {
      followUp = parseDay(body.followUpDate) ?? null;
      destinationPatch.visa_follow_up_date = followUp;
    }

    if (Object.keys(destinationPatch).length > 0) {
      await destination.update(destinationPatch);
    }

    // The audit line for the milestone — or the generic "processed" line when no
    // stamp moved, as legacy's `else` branch wrote.
    const nextEmbassy =
      body.nextEmbassy !== undefined ? clean(body.nextEmbassy) : clean(order.visa_next_embassy);
    await audit(req, milestone?.audit ?? 'legalisation.processed', {
      orderId: id,
      orderNo,
      ...(milestone ? { scantype: milestone.scantype } : {}),
      // Legacy's "issued" line names the embassy: "…has been issued from the
      // EMBASSY OF {NEXT EMBASSY}".
      ...(milestone?.scantype === 'third' ? { embassy: nextEmbassy?.toUpperCase() ?? '' } : {}),
    });

    // ---- Comments ---------------------------------------------------------
    const adminCommentSet = adminComment !== '';
    const stampNow = toLegacyDateTime();
    const baseNote = {
      destination_id: destination.id,
      date_added: stampNow,
      note_by: author.id,
      note_by_name: author.name,
      user_type: 'Admin',
      is_pin: 0,
    };

    const clientAttachments: string[] = [];
    if (clientComment !== '') {
      // One note per file, repeating the text — the model is one attachment per
      // row. No file means one note without an attachment.
      const rows = clientFiles.length > 0 ? clientFiles.map(storedPathOf) : [null];
      for (const attachment of rows) {
        await OrderDestinationNotes.create({
          ...baseNote,
          note: clientComment,
          is_admin: 0,
          attachment,
        });
        markReferenced();
        if (attachment) clientAttachments.push(attachment);
      }
      await audit(req, 'legalisation.comment.added', {
        orderId: id,
        orderNo,
        attachments: clientAttachments.length,
      });
    }

    if (adminCommentSet) {
      const rows = adminFiles.length > 0 ? adminFiles.map(storedPathOf) : [null];
      for (const attachment of rows) {
        await OrderDestinationNotes.create({
          ...baseNote,
          note: adminComment,
          is_admin: 1,
          attachment,
        });
        markReferenced();
      }
      await audit(req, 'legalisation.admin-comment.added', {
        orderId: id,
        orderNo,
        attachments: adminFiles.length,
      });
    }

    // ---- The order row: team, embassy strip, auto-close -------------------
    const orderPatch: Partial<{
      visa_cls_team_member: number | null;
      visa_is_delivered_to_embassy: number;
      visa_is_delivered_to_embassy_date: string | null;
      visa_next_embassy: string | null;
      status: number;
      date_last_saved: string;
    }> = {};

    if (teamMember !== undefined) orderPatch.visa_cls_team_member = teamMember;
    if (body.deliveredToEmbassy !== undefined) {
      orderPatch.visa_is_delivered_to_embassy = body.deliveredToEmbassy === '1' ? 1 : 0;
    }
    if (body.embassyDeliveredDate !== undefined) {
      orderPatch.visa_is_delivered_to_embassy_date = parseDay(body.embassyDeliveredDate) ?? null;
    }
    if (body.nextEmbassy !== undefined) orderPatch.visa_next_embassy = clean(body.nextEmbassy);

    // Closed ⇒ confirmed: once the destination carries a "closed" stamp and every
    // destination of the order does, the order is `status = 2` (CLS confirmed).
    // Legacy intended this and compared `count($destinations)` — the column count
    // of one row — so it practically never fired; this does what it meant.
    const closedNow =
      submitted.orderOnRouteAndClosed !== undefined
        ? submitted.orderOnRouteAndClosed
        : normaliseStored(destination.visa_date_order_on_route_and_closed);

    if (closedNow !== null && order.status !== 2) {
      const siblings = await ClsOrderDestinations.findAll({ where: { order_id: id } });
      const allClosed = siblings.every(
        (row) => row.id === destination.id || Boolean(row.visa_date_order_on_route_and_closed)
      );
      if (allClosed) orderPatch.status = 2;
    }

    if (Object.keys(orderPatch).length > 0) {
      orderPatch.date_last_saved = stampNow;
      const previousStatus = order.status;
      await order.update(orderPatch);
      if (orderPatch.status !== undefined) {
        await audit(req, 'order.status', {
          orderId: id,
          from: previousStatus,
          to: orderPatch.status,
          reason: 'all destinations closed',
        });
      }
    }

    // ---- Follow-up date: the per-admin table as well as the column --------
    if (followUp !== undefined) {
      // This admin's own rows only, as legacy deleted.
      await OrderFollowUpDate.destroy({ where: { order_id: id, admin_id: author.id } });
      if (followUp !== null) {
        await OrderFollowUpDate.create({
          admin_id: author.id,
          order_id: id,
          follow_up_date: `${followUp} 00:00:00`,
        });
      }
      await audit(req, 'legalisation.follow-up', { orderId: id, orderNo, followUp });
    }

    const contact = await clientContactOf(order);
    const embassy = destination.country_id
      ? await Countries.findByPk(destination.country_id)
      : null;

    return {
      notification: {
        scantype: milestone?.scantype ?? '',
        clientComment: clientComment !== '' ? clientComment : null,
        suppress: adminCommentSet,
        orderNo,
        reference: orderReference(order.id),
        clientEmail: contact.email,
        clientFirstName: contact.firstName,
        embassyName: clean(embassy?.rep_name),
        nextEmbassy,
        attachments: clientAttachments,
      },
      comments: await listComments(destination.id),
    };
  };

  // -------------------------------------------------------------------------
  // PATCH /:id/legalisation/details — Document Details
  // -------------------------------------------------------------------------

  router.patch(
    '/:id/legalisation/details',
    idParams,
    validate(detailsSchema),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const body = req.body as z.infer<typeof detailsSchema>;

      const order = await loadOrder(id);
      const destination = await loadDestination(id);

      const [destinationCountry, nationality, row] = await Promise.all([
        Countries.findByPk(body.destinationCountryId),
        Countries.findByPk(body.nationalityId),
        DocumentLegalizationOrderDetails.findOne({ where: { order_id: id } }),
      ]);
      if (!destinationCountry) throw badRequest('That destination is not on the list.');
      if (!nationality) throw badRequest('That origin is not on the list.');
      if (!row) throw notFound('This order has no document details to update.');

      await row.update({
        destination: body.destinationCountryId,
        nationality: body.nationalityId,
        type_of_document: body.typeOfDocument,
        ref_no: clean(body.refNo),
        com_invoice_no: clean(body.comInvoiceNo),
      });
      // The destination also lives on the order and its destination row; legacy
      // moved all three together.
      await order.update({
        destination: body.destinationCountryId,
        date_last_saved: toLegacyDateTime(),
      });
      await destination.update({ country_id: body.destinationCountryId });

      await audit(req, 'legalisation.details', {
        orderId: id,
        destinationCountryId: body.destinationCountryId,
        nationalityId: body.nationalityId,
        typeOfDocument: body.typeOfDocument,
      });

      ok(res, {
        details: {
          destinationCountryId: body.destinationCountryId,
          nationalityId: body.nationalityId,
          typeOfDocument: body.typeOfDocument,
          refNo: clean(body.refNo),
          comInvoiceNo: clean(body.comInvoiceNo),
        },
      });
    }
  );

  // -------------------------------------------------------------------------
  // PATCH /:id/legalisation/checklist — Document Checklist text fields
  // -------------------------------------------------------------------------

  router.patch(
    '/:id/legalisation/checklist',
    idParams,
    validate(checklistSchema),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const { rows } = req.body as z.infer<typeof checklistSchema>;

      await loadOrder(id);

      // Every id is proved to be this order's before any row is touched, so a
      // request naming one foreign id changes nothing at all.
      const owned = await OrderDlChecklist.findAll({ where: { order_no: id } });
      const byId = new Map(owned.map((row) => [row.id, row]));
      const missing = rows.filter((row) => !byId.has(row.id));
      if (missing.length > 0) {
        throw notFound('One of those checklist rows is not on this order.');
      }

      for (const input of rows) {
        const row = byId.get(input.id) as OrderDlChecklist;
        await row.update({
          type: clean(input.type),
          number: input.number === '' || input.number === undefined ? null : input.number,
          note: clean(input.note),
        });
      }

      await audit(req, 'legalisation.checklist', {
        orderId: id,
        rows: rows.map((row) => row.id),
      });

      ok(res, {
        checklist: owned.map((row) => ({
          id: row.id,
          type: clean(row.type),
          number: row.number,
          note: clean(row.note),
          hasFile: Boolean(clean(row.doc_file)),
        })),
      });
    }
  );

  // -------------------------------------------------------------------------
  // The document-type tracker (`tbl_order_notes`)
  // -------------------------------------------------------------------------

  router.post(
    '/:id/legalisation/tracking',
    idParams,
    validate(trackingSchema),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const { rows } = req.body as z.infer<typeof trackingSchema>;

      await loadOrder(id);

      const allowed = locationsForRegion();
      const badLocation = rows.find((row) => !allowed.includes(row.location));
      if (badLocation) {
        throw badRequest('Select a location from the list.', {
          location: 'Select a location from the list.',
        });
      }

      const author = await authorOf(req);

      // A NEW history row each time — legacy never edited one in place.
      for (const row of rows) {
        await OrderNotes.create({
          order_no: id,
          document_type: row.documentType,
          location: row.location,
          price: row.price,
          status: row.status,
          date_added: toLegacyDateTime(),
          note_by: author.id,
          note_by_name: author.name,
          user_type: 'Admin',
          is_admin: 1,
          is_deleted: 0,
        });

        await audit(req, 'legalisation.tracking', {
          orderId: id,
          documentType: row.documentType,
          location: row.location,
          status: row.status,
          price: row.price,
        });
      }

      const notes = await OrderNotes.findAll({ where: { order_no: id, is_deleted: 0 } });
      ok(res, { tracking: trackingOf(notes) });
    }
  );

  router.delete(
    '/:id/legalisation/tracking',
    idParams,
    validate(z.object({ documentType: z.string().trim().min(1).max(255) }), 'query'),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const { documentType } = validQuery<{ documentType: string }>(req);

      await loadOrder(id);

      // Scoped to THIS order. Legacy deleted `WHERE document_type = ?` across every
      // order in the table.
      const removed = await OrderNotes.destroy({
        where: { order_no: id, document_type: documentType },
      });
      if (removed === 0) throw notFound('That document type is not on this order.');

      await audit(req, 'legalisation.tracking.removed', {
        orderId: id,
        documentType,
        rows: removed,
      });

      const notes = await OrderNotes.findAll({ where: { order_no: id, is_deleted: 0 } });
      ok(res, { tracking: trackingOf(notes) });
    }
  );

  router.delete(
    '/:id/legalisation/tracking/:noteId',
    validate(notePathSchema, 'params'),
    async (req: Request, res: Response) => {
      const { id, noteId } = validParams<{ id: number; noteId: number }>(req);

      await loadOrder(id);

      const row = await OrderNotes.findByPk(noteId);
      if (!row || row.order_no !== id) {
        throw notFound('We could not find that tracker row on this order.');
      }
      await row.destroy();

      await audit(req, 'legalisation.tracking.removed', {
        orderId: id,
        noteId,
        documentType: clean(row.document_type),
      });

      const notes = await OrderNotes.findAll({ where: { order_no: id, is_deleted: 0 } });
      ok(res, { tracking: trackingOf(notes) });
    }
  );

  // -------------------------------------------------------------------------
  // Destination comments (both lanes): edit, delete, attachment
  // -------------------------------------------------------------------------

  router.patch(
    '/:id/legalisation/comments/:noteId',
    validate(notePathSchema, 'params'),
    validate(z.object({ comment: z.string().trim().min(1, 'Write a comment').max(20_000) })),
    async (req: Request, res: Response) => {
      const { id, noteId } = validParams<{ id: number; noteId: number }>(req);
      const { comment } = req.body as { comment: string };

      await loadOrder(id);
      const destination = await loadDestination(id);
      const note = await loadOwnedNote(destination, noteId);

      // The gate: lane 1 always, lane 0 only when staff wrote it. A client's own
      // reply is not the admin's to rewrite. Refused as 403, not 404 — the caller
      // is staff and the note is theirs to *see*, just not to change.
      if (!noteIsEditable(note)) {
        throw forbidden('That comment was written by the client and cannot be edited.');
      }

      await note.update({ note: comment });
      await audit(req, 'legalisation.comment.edited', {
        orderId: id,
        noteId,
        lane: laneOf(note),
      });

      ok(res, { comment: commentOf(note) });
    }
  );

  router.delete(
    '/:id/legalisation/comments/:noteId',
    validate(notePathSchema, 'params'),
    async (req: Request, res: Response) => {
      const { id, noteId } = validParams<{ id: number; noteId: number }>(req);

      await loadOrder(id);
      const destination = await loadDestination(id);
      const note = await loadOwnedNote(destination, noteId);

      if (!noteIsEditable(note)) {
        throw forbidden('That comment was written by the client and cannot be deleted.');
      }

      // The stored file is left where it is, as legacy did: nothing here proves no
      // other row (a pre-existing legacy note) shares the filename.
      await note.destroy();
      await audit(req, 'legalisation.comment.deleted', {
        orderId: id,
        noteId,
        lane: laneOf(note),
      });

      ok(res, { deleted: noteId });
    }
  );

  router.get(
    '/:id/legalisation/comments/:noteId/attachment',
    validate(notePathSchema, 'params'),
    async (req: Request, res: Response) => {
      const { id, noteId } = validParams<{ id: number; noteId: number }>(req);

      await loadOrder(id);
      const destination = await loadDestination(id);
      const note = await loadOwnedNote(destination, noteId);

      // Any lane — this route is staff-only (`requireAdmin` on the parent router).
      // The client portal's own route refuses lane 1; that gate is untouched.
      const stored = clean(note.attachment);
      if (!stored) throw notFound('That comment has no attachment.');

      // Files written by the legacy app are bare names under
      // `dev/destination_notes_file/`; this API writes full stored paths.
      const opened =
        (await openDocument(stored)) ??
        (await openDocument(`dev/destination_notes_file/${stored}`));
      if (!opened) {
        throw notFound('We hold a record of that attachment but not the file itself.');
      }

      res.setHeader(
        'Content-Disposition',
        `inline; filename="${path.basename(stored.replace(/\\/g, '/'))}"`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      streamDocument(opened, res, { orderId: id, noteId });
    }
  );

  // -------------------------------------------------------------------------
  // Checklist document
  // -------------------------------------------------------------------------

  router.get(
    '/:id/legalisation/checklist/:checklistId/file',
    validate(z.object({ id: idParam, checklistId: idParam }), 'params'),
    async (req: Request, res: Response) => {
      const { id, checklistId } = validParams<{ id: number; checklistId: number }>(req);

      await loadOrder(id);

      const row = await OrderDlChecklist.findByPk(checklistId);
      if (!row || row.order_no !== id) {
        throw notFound('We could not find that checklist row on this order.');
      }

      const stored = clean(row.doc_file);
      if (!stored) throw notFound('No document has been uploaded for that row.');

      // This API stores full paths; the legacy admin read
      // `dev/dl_documents/{orderId}_{doc_file}` (`mediaSource=3`).
      const opened =
        (await openDocument(stored)) ??
        (await openDocument(`dev/dl_documents/${id}_${stored}`)) ??
        (await openDocument(`dev/dl_documents/${stored}`));
      if (!opened) {
        throw notFound('We hold a record of that document but not the file itself.');
      }

      res.setHeader(
        'Content-Disposition',
        `inline; filename="${path.basename(stored.replace(/\\/g, '/'))}"`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      streamDocument(opened, res, { orderId: id, checklistId });
    }
  );

  // -------------------------------------------------------------------------
  // Signature image
  // -------------------------------------------------------------------------

  /**
   * The stored signature, when it is an image file (`signature.kind === 'image'`).
   *
   * Legacy `saveSignatureAction` wrote the pad's PNG to `dev/order_signature/` as
   * `{md5}_{orderId}_{destinationId}.png` and kept the bare name in
   * `tbl_cls_order_destinations.signature`. Nothing in the screen payload can carry
   * those bytes, so the screen links here.
   *
   * Two things stop this being a way to read an arbitrary file. The name served is
   * the one **this order's destination row holds** — never one taken from the URL —
   * reduced to its base name, so a column holding `../../x.png` still resolves only
   * under `order_signature/`. And a name that does not end `_{orderId}_{destinationId}`
   * (the legacy convention) or is an SVG (script-capable) is refused, so a row that was edited to point at another
   * order's signature cannot expose it.
   */
  router.get('/:id/legalisation/signature', idParams, async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);

    await loadOrder(id);
    const destination = await loadDestination(id);

    const signature = signatureOf(destination.signature);
    if (signature?.kind !== 'image') {
      throw notFound('This order has no signature image.');
    }

    const file = signature.file;
    const ownedSuffix = new RegExp(`_${id}_${destination.id}\\.(?:png|jpe?g|gif)$`, 'i');
    if (!ownedSuffix.test(file)) {
      throw notFound('That signature does not belong to this order.');
    }

    const opened = await openDocument(`${SIGNATURE_DIRECTORY}/${file}`);
    if (!opened) {
      throw notFound('We hold a record of that signature but not the file itself.');
    }

    res.setHeader('Content-Disposition', `inline; filename="${file}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    streamDocument(opened, res, { orderId: id, destinationId: destination.id });
  });

  // -------------------------------------------------------------------------
  // Order Status / Payment Status
  // -------------------------------------------------------------------------

  const paymentStatusSchema = z.object({
    paymentStatus: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  });

  const PAYMENT_LABEL: Record<number, string> = {
    0: 'pending',
    1: 'paid online',
    2: 'paid by account',
  };

  /** Writes `tbl_payment.s_paid`, and the legacy-style audit line when it changed. */
  const setPaymentStatus = async (
    req: Request,
    orderId: number,
    paymentStatus: 0 | 1 | 2
  ): Promise<void> => {
    const payment = await Payment.findOne({
      where: { order_no: orderId },
      order: [['date_paid', 'DESC']],
    });
    if (!payment) throw conflict('This order has no payment record to update.');

    const previous = payment.s_paid;
    await payment.update({ s_paid: paymentStatus });

    if (previous !== paymentStatus) {
      await audit(req, 'order.payment-status', {
        orderId,
        from: previous,
        to: paymentStatus,
        label: PAYMENT_LABEL[paymentStatus],
      });
    }
  };

  const setOrderStatus = async (
    req: Request,
    order: ClsOrder,
    status: 0 | 1 | 2
  ): Promise<void> => {
    const previous = order.status;
    await order.update({ status, date_last_saved: toLegacyDateTime() });

    if (previous !== status) {
      await audit(req, 'order.status', { orderId: order.id, from: previous, to: status });
    }
  };

  router.patch(
    '/:id/legalisation/payment-status',
    idParams,
    validate(paymentStatusSchema),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const { paymentStatus } = req.body as z.infer<typeof paymentStatusSchema>;

      await loadOrder(id);
      await setPaymentStatus(req, id, paymentStatus);

      ok(res, { orderId: id, paymentStatus });
    }
  );

  /** The two selects in one save, as the legacy `updateStatus` form posted them. */
  router.patch(
    '/:id/legalisation/status',
    idParams,
    validate(
      z.object({
        orderStatus: z.union([z.literal(0), z.literal(1), z.literal(2)]),
        paymentStatus: z.union([z.literal(0), z.literal(1), z.literal(2)]),
      })
    ),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const { orderStatus, paymentStatus } = req.body as {
        orderStatus: 0 | 1 | 2;
        paymentStatus: 0 | 1 | 2;
      };

      const order = await loadOrder(id);

      // The payment is resolved first: with no payment row the legacy form fatalled
      // half-way, having already saved the order status. Refusing up front leaves
      // nothing half-written.
      const payment = await Payment.findOne({
        where: { order_no: id },
        order: [['date_paid', 'DESC']],
      });
      if (!payment) throw conflict('This order has no payment record to update.');

      await setOrderStatus(req, order, orderStatus);
      await setPaymentStatus(req, id, paymentStatus);

      ok(res, { orderId: id, orderStatus, paymentStatus });
    }
  );

  // -------------------------------------------------------------------------
  // Address confirmation
  // -------------------------------------------------------------------------

  router.post(
    '/:id/legalisation/address-confirmation/acknowledge',
    idParams,
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const order = await loadOrder(id);

      // 1 = the client confirmed and nobody has seen it; 2 = discarded. Anything
      // else has nothing to discard, and writing 2 over a 0 would hide the next
      // confirmation, so it is left alone rather than overwritten.
      if (order.is_address_confirmed !== 1) {
        ok(res, { orderId: id, addressConfirmed: asTriState(order.is_address_confirmed), changed: false });
        return;
      }

      await order.update({ is_address_confirmed: 2, date_last_saved: toLegacyDateTime() });
      await audit(req, 'legalisation.address-confirmation.discarded', { orderId: id });

      ok(res, { orderId: id, addressConfirmed: 2, changed: true });
    }
  );

  router.get(
    '/:id/legalisation/address-confirmation',
    idParams,
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const order = await loadOrder(id);

      const [contact, returnDocument, country] = await Promise.all([
        clientContactOf(order),
        OrderReturnDocumentDetails.findOne({ where: { order_id: id } }),
        order.destination ? Countries.findByPk(order.destination) : null,
      ]);

      const confirmation: LegalisationAddressConfirmation = {
        orderId: order.id,
        orderNo: orderNoOf(order),
        reference: orderReference(order.id),
        clientEmail: contact.email,
        clientFirstName: contact.firstName,
        clientLastName: contact.lastName,
        isBulk: order.is_bulk === 1,
        company: clean(returnDocument?.company),
        address: clean(returnDocument?.address),
        city: clean(returnDocument?.city),
        state: clean(returnDocument?.state),
        postcode: clean(returnDocument?.postcode),
        phone: clean(order.contact_phone),
        countryDisplay: clean(country?.country_name_display),
      };

      ok(res, { confirmation });
    }
  );

  // -------------------------------------------------------------------------
  // Printable sheets
  // -------------------------------------------------------------------------

  router.get(
    '/:id/legalisation/print/:sheet',
    validate(
      z.object({
        id: idParam,
        sheet: z.enum(['return-address', 'embassy-to-from', 'order-label']),
      }),
      'params'
    ),
    async (req: Request, res: Response) => {
      const { id, sheet: kind } = validParams<{ id: number; sheet: LegalisationPrintKind }>(req);
      const order = await loadOrder(id);
      const destination = await loadDestination(id);
      const orderNo = orderNoOf(order);

      let print: LegalisationPrintView;

      if (kind === 'return-address') {
        const returnDocument = await OrderReturnDocumentDetails.findOne({
          where: { order_id: id },
        });
        const country = returnDocument?.country_id
          ? await Countries.findByPk(returnDocument.country_id)
          : null;

        print = {
          kind,
          orderId: id,
          orderNo,
          to: {
            name: fullName(returnDocument?.first_name, returnDocument?.last_name) || null,
            company: clean(returnDocument?.company),
            address: clean(returnDocument?.address),
            city: clean(returnDocument?.city),
            state: clean(returnDocument?.state),
            postcode: clean(returnDocument?.postcode),
            country: clean(country?.country_name),
            phone: clean(returnDocument?.contact_number),
            email: clean(returnDocument?.email),
          },
        };
      } else if (kind === 'embassy-to-from') {
        const country = destination.country_id
          ? await Countries.findByPk(destination.country_id)
          : null;

        print = {
          kind,
          orderId: id,
          orderNo,
          // CLS's street address is not held anywhere in this codebase or schema,
          // so the "From" block is the company and its published number only.
          from: { company: CLS_CONTACT.companyName, phone: CLS_CONTACT.phone },
          to: {
            name: clean(country?.rep_name),
            country: clean(country?.country_name),
            addressLine1: clean(country?.embassy_address_line1),
            addressLine2: clean(country?.embassy_address_line2),
            street: clean(country?.embassy_street),
            city: clean(country?.embassy_city),
            state: clean(country?.embassy_state),
            postcode: clean(country?.embassy_postcode),
            phone: clean(country?.embassy_phone),
          },
        };
      } else {
        const [country, traveller, checklist] = await Promise.all([
          destination.country_id ? Countries.findByPk(destination.country_id) : null,
          OrderTravellerDetails.findOne({ where: { order_id: id, is_primary: 1 } }),
          OrderDlChecklist.findAll({ where: { order_no: id } }),
        ]);

        print = {
          kind,
          orderId: id,
          orderNo,
          destination: clean(country?.country_name),
          clientName:
            fullName(traveller?.first_name, traveller?.last_name) ||
            fullName(order.contact_first_name, order.contact_last_name) ||
            null,
          checklistRows: checklist.length,
          // The checklist's `number` is the quantity of that document type.
          documentCount: checklist.reduce((sum, row) => sum + (row.number ?? 1), 0),
        };
      }

      ok(res, { print });
    }
  );

  return router;
};
