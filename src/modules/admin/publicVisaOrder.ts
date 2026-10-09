import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  AdditionalServices,
  ClsOrder,
  ClsOrderDestinations,
  ClsOrderDocuments,
  Countries,
  Documents,
  ManualPayment,
  OrderAdditionalServices,
  OrderCourierServiceDetails,
  OrderDestinationNotes,
  OrderFollowUpDate,
  OrderNotes,
  OrderReturnDocumentDetails,
  OrderTravellerDetails,
  PassportTypes,
  Payment,
  PublicVisaAdditionalRequirements,
  PublicVisaTypeLocations,
  PublicVisaTypes,
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
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  serviceUnavailable,
} from '../../shared/errors';
import { streamDocument } from '../../shared/http/streamDocument';
import { toDateOnly, toIso, toLegacyDateTime } from '../../shared/dates';
import {
  discardDocument,
  openDocument,
  storedPathOf,
} from '../../shared/storage/documents';
import { orderFolder } from '../../shared/storage/documentFolders';
import { toCents, toCentsOrZero, GST_RATE } from '../../shared/money';
import { clean, fullName } from '../../shared/text';
import { idParam, validate, validParams, validQuery } from '../../shared/validation';
import { CLS_CONTACT } from '../../domain/company';
import { DOCUMENT_STATUS, ENABLED, ORDER_TYPE } from '../../domain/codes';
import { orderReference } from '../../domain/orderReference';
import {
  LEGALISATION_LOCATIONS,
  LEGALISATION_REGION,
  commentOf,
  noteIsEditable,
  normaliseStored,
  parseDay,
  parseStamp,
  pickMilestone,
  trackingOf,
  type LegalisationComment,
  type LegalisationLane,
  type LegalisationScantype,
  type LegalisationSignature,
  type LegalisationTrackingGroup,
} from './legalisationOrder';

/**
 * The Public Visa order screen — every read and write behind it.
 *
 * Reproduces `viewPublicVisaAction` and `viewPublicVisaMediaAction` of the legacy
 * `CLSadminBundle` `ViewOrderController` (and the small actions around them),
 * read in full: `publicVisaProcessing.html.twig` and its `_v2` twin, the DHL
 * pickup/return code, `reprintPublicVisa`, `sendClientAddressConfirmationEmailAction`
 * and the document view of `ManageOrderDocumentsController`. It is the public-visa
 * counterpart of `legalisationOrder.ts` and deliberately shares that module's
 * helpers (date parsing, milestone priority, the comment/tracker shaping) rather
 * than re-deriving them.
 *
 * ## What is different from the legalisation screen
 *
 * **One ticket per destination.** A public visa order can cover several countries
 * (a bulk or multi-country order): every `tbl_cls_order_destinations` row has its
 * own four milestones, its own Ticket, its own signature and its own two comment
 * lanes. So the ticket routes are `/destinations/:destinationId/ticket`, and the
 * order-level row (team member, delivered to embassy, next embassy, follow-up date,
 * processing location) is a separate `/order` write — the screen's one Update
 * button fires them in turn.
 *
 * **Only `order_type = PUBLIC_VISA` (6).** The legacy screen served the public
 * queue and nothing else; government visa orders (type 1) have their own legacy
 * templates and keep the generic read.
 *
 * ## Lane 1 is confidential — same rules as legalisation
 *
 * `tbl_order_destination_notes.is_admin` reads backwards from its name: 0 is the
 * "Client comment" CLS sends to the client, 1 the "Admin comment", CLS-internal
 * (memory `consultant-thread-destination-notes`). The client email is suppressed
 * whenever an admin comment is written, lane-1 files live in an `internal/`
 * folder, and only lane 0 is ever named in `notification.attachments`.
 *
 * ## What is NOT reproduced, and why it is said rather than faked
 *
 * - **Generating a DHL label** (the Inbound/Outbound Label buttons): legacy posts
 *   a DHL XML shipment to DHL's live API with a SiteID/password that exist nowhere
 *   in this repository. The route validates what legacy validated and then says it
 *   is not connected. **Printing an existing label is reproduced**: legacy stores
 *   DHL's response (a base64 PDF) on the destination row and its "Pickup Inbound
 *   Label"/"Return Outbound Label" links just decode it.
 * - **The legacy PHP print scripts** (`pdfc/print-*.php`) are not in the
 *   repository; the sheets here are designed from the data they printed.
 * - **Pay Now / Send Invoice** are commented out of both legacy twigs (only
 *   Reprint Invoice is live), so they are not built.
 */

/** Records one audit line. See `audit()` in `admin.routes.ts`. */
export type PublicVisaAudit = (
  req: Request,
  action: string,
  detail: Record<string, unknown>
) => Promise<void>;

// ---------------------------------------------------------------------------
// Reference data — per region (the NZ port changes this block)
// ---------------------------------------------------------------------------

/**
 * Region facts, kept as data so the NZ port swaps one object, not logic.
 *
 * `shippedBy` is the legacy "Shipped by" dropdown, in the twig's own order. AU's
 * list is the AU twig's; NZ's differs (NZ couriers, NZ post, DHL, FedEx, CLS,
 * Picked up by client). `hasProcessLocation` is whether the destination table has
 * the AU-only `process_location_id` and the screen shows the Processing Location
 * select. `locations` is the document-tracker's Location list.
 */
export const PUBLIC_VISA_REGION = {
  shippedBy: [
    'TNT',
    'DHL',
    'Toll',
    'CLS',
    'Express Post Platinum',
    'Registered Post',
    'Picked up by client',
    'Next Flight Service',
    'Star Track',
  ],
  locations: LEGALISATION_LOCATIONS[LEGALISATION_REGION] as readonly string[],
  hasProcessLocation: true,
  /** The country the legacy DHL panels print under the address blocks. */
  homeCountry: 'Australia',
  /** The state whose returns legacy hand-delivers: the DHL buttons hide for it. */
  handDeliveredState: 'ACT',
  /**
   * How the legacy invoice template does its sums, which differs per country.
   * AU multiplies the service and additional-services fees by the traveller count
   * and drops GST from the visa application fee ("10%-->0%"); NZ prints the count
   * but does not multiply, charges GST on the application fee, and discounts the
   * service fee by the client's special-price percentage.
   */
  invoice: {
    multiplyByTravellers: true,
    gstOnApplicationFee: false,
    specialPriceDiscount: false,
  },
} as const;

/** The legacy twig's literal: the courier option whose pickup/return panels show. */
export const DHL_PANEL_COURIER_ID = 14;

// ---------------------------------------------------------------------------
// Response types — the contract the frontend is built against
// ---------------------------------------------------------------------------

export interface PublicVisaTravellerView {
  id: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  departureDate: string | null;
  dateOfBirth: string | null;
  passportNumber: string | null;
  isClient: boolean;
  isPrimary: boolean;
  /** The new order form's extra applicant fields (all stored by `createApplicants`). */
  title: string | null;
  middleName: string | null;
  gender: string | null;
  nationality: string | null;
  citizenship: string | null;
  passportType: string | null;
  passportIssueDate: string | null;
  passportExpiryDate: string | null;
  occupation: string | null;
  organisation: string | null;
}

export interface PublicVisaDestinationView {
  id: number;
  countryId: number | null;
  countryName: string | null;
  embassyName: string | null;
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
    signature: LegalisationSignature;
  };
  comments: LegalisationComment[];
  /** Legacy "VISA Options": the visa type and its selected additional requirement(s). */
  visaOptions: {
    visaTypeId: number | null;
    visaTypeName: string | null;
    requirements: string[];
  };
  /** 1 single, 2 double, 3 multiple — legacy "Number of Entries". */
  entryOption: 1 | 2 | 3 | null;
  dhl: {
    confirmationNumber: string | null;
    airwaybillNumber: string | null;
    returnConfirmationNumber: string | null;
    returnAirwaybillNumber: string | null;
    hasPickupLabel: boolean;
    hasReturnLabel: boolean;
  };
  /** What the new order form stored on the destination row. */
  newFlow: {
    nationalityId: number | null;
    nationality: string | null;
    region: string | null;
    departureDate: string | null;
    entryDate: string | null;
    exitDate: string | null;
    travelPurpose: string | null;
    quotedVisaFee: string | null;
    quotedRequirementFee: string | null;
  };
}

export interface PublicVisaCourierAddress {
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  email?: string | null;
  contactNumber: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
}

export interface PublicVisaScreen {
  order: {
    id: number;
    orderNo: string;
    reference: string;
    status: 0 | 1 | 2;
    clientId: number | null;
    clientName: string | null;
    clientEmail: string | null;
    dateSubmitted: string | null;
    isBulk: boolean;
    addressConfirmed: 0 | 1 | 2;
    courierServiceId: number | null;
    courierName: string | null;
    isDhlCourier: boolean;
    destinationName: string | null;
    visaTypeName: string | null;
    contact: {
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      department: string | null;
    };
    applicants: number | null;
    departureDate: string | null;
    accountNumber: string | null;
  };
  destinations: PublicVisaDestinationView[];
  team: { memberId: number | null; options: { id: number; name: string }[] };
  embassy: {
    deliveredToEmbassy: boolean;
    deliveredDate: string | null;
    nextEmbassy: string | null;
  };
  /** `YYYY-MM-DD`; this admin's own row first, then the newest, then the column. */
  followUpDate: string | null;
  /** Null on a region whose destination table has no `process_location_id`. */
  processLocation: {
    selectedId: number | null;
    options: { id: number; location: string }[];
  } | null;
  tracking: LegalisationTrackingGroup[];
  options: { shippedBy: string[]; locations: string[] };
  travellers: PublicVisaTravellerView[];
  /** The Pickup Details / Return Document Details panels (courier 14 only). */
  courier: {
    showPanels: boolean;
    canPrintPickupLabel: boolean;
    canPrintReturnLabel: boolean;
    pickup:
      | (PublicVisaCourierAddress & {
          date: string | null;
          readyHour: string | null;
          readyMinute: string | null;
          closeHour: string | null;
          closeMinute: string | null;
          additionalComment: string | null;
        })
      | null;
    return: PublicVisaCourierAddress | null;
  };
  payment: {
    name: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    address: string | null;
    status: 0 | 1 | 2 | null;
    accountNo: string | null;
    transactionId: string | null;
    totalCents: number | null;
    paidAt: string | null;
    billing: {
      address: string | null;
      city: string | null;
      state: string | null;
      postcode: string | null;
      country: string | null;
    } | null;
  };
  /** The "Client Centre Documents (n)" table — `tbl_cls_order_documents`. */
  documents: {
    id: number;
    document: string | null;
    fileName: string | null;
    uploadedAt: string | null;
    status: number;
    hasFile: boolean;
  }[];
  /** The new order form's own fields that are stored, grouped by where they landed. */
  newFlow: {
    /** `tbl_order_return_document_details` — "Delivery & return". */
    returnAddress: {
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      company: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      postcode: string | null;
      country: string | null;
      returningDate: string | null;
      comment: string | null;
    } | null;
    /** The corporate visa request, parsed back out of `travel_purpose`. */
    request: {
      visaCategory: string | null;
      lengthOfStay: string | null;
      entryType: string | null;
      account: string | null;
      purchaseOrder: string | null;
      company: string | null;
      billingContact: string | null;
      description: string | null;
    };
    pricing: {
      visaFeeCents: number | null;
      applicationFeeCents: number | null;
      serviceFeeCents: number | null;
      additionalServicesFeeCents: number | null;
      courierFeeCents: number | null;
      totalFeeCents: number | null;
      additionalServices: { title: string | null; feeCents: number | null }[];
    };
  };
}

export interface PublicVisaNotification {
  scantype: LegalisationScantype;
  clientComment: string | null;
  /** True when an admin comment was written: legacy `$isMailToClient = false`. */
  suppress: boolean;
  orderNo: string;
  reference: string;
  clientEmail: string | null;
  clientFirstName: string | null;
  destinationName: string | null;
  embassyName: string | null;
  nextEmbassy: string | null;
  /** Stored paths of the lane-0 files only. Never lane 1. */
  attachments: string[];
}

export interface PublicVisaTicketResult {
  notification: PublicVisaNotification;
  comments: LegalisationComment[];
}

export type PublicVisaPrintKind =
  'return-address' | 'embassy-to-from' | 'traveller-label';

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

export type PublicVisaPrintView =
  | { kind: 'return-address'; orderId: number; orderNo: string; to: PrintAddress }
  | {
      kind: 'embassy-to-from';
      orderId: number;
      orderNo: string;
      from: { company: string; phone: string };
      /** The client's return address — the other end of each label. */
      client: PrintAddress;
      /** One sheet per destination, as the order can cover several embassies. */
      embassies: {
        destinationId: number;
        name: string | null;
        country: string | null;
        addressLine1: string | null;
        addressLine2: string | null;
        street: string | null;
        city: string | null;
        state: string | null;
        postcode: string | null;
        phone: string | null;
      }[];
    }
  | {
      kind: 'traveller-label';
      orderId: number;
      orderNo: string;
      destination: string | null;
      /** The destination's country code, which the courier label's barcode carries. */
      destinationCode: string | null;
      /** CLS's number for courier pickup, printed on the label. */
      pickupPhone: string;
      visaType: string | null;
      traveller: {
        name: string | null;
        passportNumber: string | null;
        dateOfBirth: string | null;
        /** The traveller's own departure date, else the order's. */
        departureDate: string | null;
        nationality: string | null;
      };
    };

export interface PublicVisaInvoice {
  orderId: number;
  orderNo: string;
  /** `Success` once paid, else `Pending` — the legacy "Payment Status" row. */
  paymentStatus: 'Success' | 'Pending';
  invoiceDate: string | null;
  name: string | null;
  company: string | null;
  address: {
    address: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
  };
  phone: string | null;
  service: string[];
  lines: {
    description: string;
    detail: string[];
    unitCents: number;
    quantity: number;
    /** `10%` or `0%`, as printed. */
    gst: string;
    totalCents: number;
  }[];
  subtotalCents: number;
  totalCents: number;
  balanceDueCents: number;
  /** Where the lines came from: the manual-payment items, or the order's fee columns. */
  source: 'manual-items' | 'order-fees';
}

export interface PublicVisaAddressConfirmation {
  orderId: number;
  orderNo: string;
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
  countryDisplay: string | null;
  /** The service word the email uses ("Visa"). */
  serviceLabel: string;
}

// ---------------------------------------------------------------------------
// Loading and shaping
// ---------------------------------------------------------------------------

/** The order, or a 404 when it is missing or not a public visa order. */
const loadOrder = async (id: number): Promise<ClsOrder> => {
  const order = await ClsOrder.findByPk(id);
  if (!order || order.order_type !== ORDER_TYPE.PUBLIC_VISA) {
    throw notFound('We could not find that public visa order.');
  }
  return order;
};

const loadDestinations = async (orderId: number): Promise<ClsOrderDestinations[]> =>
  ClsOrderDestinations.findAll({ where: { order_id: orderId }, order: [['id', 'ASC']] });

/** One of this order's destinations, or 404 — the id in the URL is never trusted. */
const loadOwnedDestination = async (
  orderId: number,
  destinationId: number
): Promise<ClsOrderDestinations> => {
  const destination = await ClsOrderDestinations.findByPk(destinationId);
  if (!destination || destination.order_id !== orderId) {
    throw notFound('We could not find that destination on this order.');
  }
  return destination;
};

const orderNoOf = (order: ClsOrder): string => clean(order.order_no) ?? String(order.id);

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

const laneOf = (note: OrderDestinationNotes): LegalisationLane =>
  note.is_admin === 1 ? 'admin' : 'client';

const asTriState = (value: number | null): 0 | 1 | 2 =>
  value === 1 || value === 2 ? value : 0;

const entryOptionOf = (value: number | null): 1 | 2 | 3 | null =>
  value === 1 || value === 2 || value === 3 ? value : null;

/** The legacy signature column, as `legalisationOrder.signatureOf` reads it. */
const signatureOf = (value: string | null): LegalisationSignature => {
  const stored = clean(value);
  if (!stored) return null;

  if (stored.startsWith('[')) {
    try {
      const strokes: unknown = JSON.parse(stored);
      return Array.isArray(strokes) ? { kind: 'strokes', strokes } : null;
    } catch {
      return null;
    }
  }

  if (/\.(png|jpe?g|gif|svg)$/i.test(stored)) {
    return { kind: 'image', file: path.basename(stored.replace(/\\/g, '/')) };
  }

  return null;
};

/** Where legacy `saveSignatureAction` kept the signature pad PNGs. */
const SIGNATURE_DIRECTORY = 'dev/order_signature';

const loadOwnedNote = async (
  destinationIds: readonly number[],
  noteId: number
): Promise<OrderDestinationNotes> => {
  const note = await OrderDestinationNotes.findByPk(noteId);
  if (
    !note ||
    note.destination_id === null ||
    !destinationIds.includes(note.destination_id)
  ) {
    throw notFound('We could not find that comment on this order.');
  }
  return note;
};

const listComments = async (destinationId: number): Promise<LegalisationComment[]> => {
  const notes = await OrderDestinationNotes.findAll({
    where: { destination_id: destinationId },
    order: [['id', 'DESC']],
  });
  return notes.map(commentOf);
};

/**
 * The selected additional requirement(s) of a destination, by name.
 *
 * Legacy `extractSelectedVisaTypeRequirements` splits the column on `;` and `,`
 * and reads the first piece as the id. In this schema the column is an `int`, so
 * there is one id; the split is kept so a value written as `5,50;6,0` by some
 * older path still resolves.
 */
const requirementIdsOf = (value: unknown): number[] =>
  (typeof value === 'string' || typeof value === 'number' ? String(value) : '')
    .split(';')
    .map((part) => Number.parseInt(part.split(',')[0] ?? '', 10))
    .filter((id) => Number.isSafeInteger(id) && id > 0);

/**
 * The corporate journey folds everything with no column of its own into
 * `travel_purpose` as `Label: value` lines (`app/api/orders/visa/route.ts`). This
 * reads them back so staff see them as fields; whatever is not a labelled line is
 * the client's own description.
 */
export const parseTravelPurpose = (text: string | null) => {
  const found = {
    visaCategory: null as string | null,
    lengthOfStay: null as string | null,
    entryType: null as string | null,
    account: null as string | null,
    purchaseOrder: null as string | null,
    company: null as string | null,
    billingContact: null as string | null,
  };
  const rest: string[] = [];

  for (const line of (text ?? '').split(/\r?\n/)) {
    const match = /^(Visa category|Length of stay|Entry|Account|PO|Company|Billing contact):\s*(.*)$/.exec(
      line.trim()
    );
    if (!match) {
      rest.push(line);
      continue;
    }
    const value = clean(match[2]);
    switch (match[1]) {
      case 'Visa category':
        found.visaCategory = value;
        break;
      case 'Length of stay':
        found.lengthOfStay = value;
        break;
      case 'Entry':
        found.entryType = value;
        break;
      case 'Account':
        found.account = value;
        break;
      case 'Company':
        found.company = value;
        break;
      case 'Billing contact':
        found.billingContact = value;
        break;
      default:
        found.purchaseOrder = value;
    }
  }

  return { ...found, description: clean(rest.join('\n')) };
};

/** Extracts DHL's base64 label PDF from the XML response stored on the row. */
export const labelPdfFrom = (stored: string | null): Buffer | null => {
  const xml = clean(stored);
  if (!xml) return null;

  const match = /<(?:\w+:)?OutputImage[^>]*>([\s\S]*?)<\/(?:\w+:)?OutputImage>/i.exec(
    xml
  );
  const encoded = match?.[1]?.replace(/\s+/g, '');
  if (!encoded) return null;

  const bytes = Buffer.from(encoded, 'base64');
  // A PDF starts `%PDF`; anything else is not a label we can print.
  return bytes.subarray(0, 4).toString('latin1') === '%PDF' ? bytes : null;
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const idParams = validate(z.object({ id: idParam }), 'params');
const destinationParams = validate(
  z.object({ id: idParam, destinationId: idParam }),
  'params'
);
const noteParams = validate(z.object({ id: idParam, noteId: idParam }), 'params');

const optionalText = (max: number) => z.string().max(max).optional();

const stampField = z
  .string()
  .max(40)
  .refine((value) => parseStamp(value) !== undefined, 'Enter a valid date and time');

const dayField = z
  .string()
  .max(40)
  .refine((value) => parseDay(value) !== undefined, 'Enter a valid date');

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
});

type TicketBody = z.infer<typeof ticketSchema>;

const orderSchema = z.object({
  clsTeamMember: z.string().trim().regex(/^\d*$/, 'Choose a team member').optional(),
  deliveredToEmbassy: z.enum(['1', '0']).optional(),
  embassyDeliveredDate: dayField.optional(),
  nextEmbassy: optionalText(255),
  followUpDate: dayField.optional(),
  processLocationId: z.string().trim().regex(/^\d*$/, 'Choose a location').optional(),
});

const required = (label: string) => z.string().trim().min(1, `Enter ${label}`).max(255);

/** The legacy "Update shipping details" modal — every field but the company is required. */
const dhlDetailsSchema = z.object({
  pickup: z.object({
    company: z.string().trim().max(255),
    firstName: required('the first name'),
    lastName: required('the last name'),
    contactNumber: required('a contact number'),
    address: required('the street address'),
    city: required('the city'),
    state: required('the state'),
    postcode: required('the postcode'),
    date: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter the pickup date'),
    readyHour: z
      .string()
      .trim()
      .regex(/^\d{2}$/, 'Choose the ready-by hour'),
    readyMinute: z
      .string()
      .trim()
      .regex(/^\d{1,2}$/, 'Choose the ready-by minute'),
    closeHour: z
      .string()
      .trim()
      .regex(/^\d{2}$/, 'Choose the closing hour'),
    closeMinute: z
      .string()
      .trim()
      .regex(/^\d{1,2}$/, 'Choose the closing minute'),
  }),
  return: z.object({
    company: z.string().trim().max(255),
    firstName: required('the first name'),
    lastName: required('the last name'),
    contactNumber: required('a contact number'),
    address: required('the street address'),
    city: required('the city'),
    state: required('the state'),
    postcode: required('the postcode'),
  }),
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
        status: z.enum(['Delivered', 'Received'], 'Select a status'),
      })
    )
    .min(1)
    .max(50),
});

// ---------------------------------------------------------------------------
// Invoice (legacy `reprintPublicVisa` / `invoice_template.html.twig`)
// ---------------------------------------------------------------------------

/**
 * The invoice lines, by the legacy template's own arithmetic.
 *
 * When a manual-payment row exists its `items` JSON are the lines (as legacy:
 * `post.items`), each priced `price × quantity` plus GST. Otherwise they come
 * from the order's fee columns, per destination: "CLS Service Fee", one "Visa
 * Application Fee" per selected requirement, then "Additional Services Fee" and
 * "Courier Fee". The legacy "Sub Total" row summed the GST-inclusive item totals,
 * and so does this. There is no credit-card fee line: this site charges none
 * (memory `card-fee-removed`).
 *
 * Which lines are multiplied by the traveller count, whether the application fee
 * carries GST, and whether a special-price discount applies are the region's call
 * — see `PUBLIC_VISA_REGION.invoice`.
 */
export const buildInvoiceLines = (input: {
  items: readonly { description: string; price: unknown; quantity: unknown }[] | null;
  destinations: readonly { requirements: string[] }[];
  travellers: number;
  serviceFee: unknown;
  applicationFee: unknown;
  additionalFee: unknown;
  courierFee: unknown;
  additionalServiceTitles: readonly string[];
  courierName: string | null;
  /** The client's special-price percentage; only a region with the discount reads it. */
  specialPricePercent?: number | null;
}): { lines: PublicVisaInvoice['lines']; source: PublicVisaInvoice['source'] } => {
  const rules = PUBLIC_VISA_REGION.invoice;
  const gstLabel = `${Math.round(GST_RATE * 100)}%`;
  const withGst = (cents: number): number => Math.round(cents + cents * GST_RATE);

  if (input.items && input.items.length > 0) {
    return {
      source: 'manual-items',
      lines: input.items.map((item) => {
        const unitCents = toCentsOrZero(item.price);
        const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
        return {
          description: item.description,
          detail: [],
          unitCents,
          quantity,
          gst: gstLabel,
          totalCents: withGst(unitCents * quantity),
        };
      }),
    };
  }

  const travellers = input.travellers > 0 ? input.travellers : 1;
  const times = rules.multiplyByTravellers ? travellers : 1;
  const lines: PublicVisaInvoice['lines'] = [];

  // NZ only: `unit - unit × percent`. A negative percentage is read as none, which
  // is what the legacy meant by its `specialprice = 0` branch.
  const discount =
    rules.specialPriceDiscount && (input.specialPricePercent ?? 0) > 0
      ? (input.specialPricePercent as number) / 100
      : 0;

  for (const destination of input.destinations) {
    const listCents = toCentsOrZero(input.serviceFee);
    const unitCents = Math.round(listCents - listCents * discount);
    lines.push({
      description: 'CLS Service Fee',
      detail: [],
      unitCents,
      quantity: travellers,
      gst: gstLabel,
      totalCents: withGst(unitCents * times),
    });

    for (const requirement of destination.requirements) {
      const feeCents = toCentsOrZero(input.applicationFee);
      lines.push({
        description: 'Visa Application Fee',
        detail: [requirement],
        unitCents: feeCents,
        quantity: travellers,
        // AU's template prints "10%-->0%": the rate was dropped from these lines.
        gst: rules.gstOnApplicationFee ? gstLabel : '0%',
        totalCents: rules.gstOnApplicationFee ? withGst(feeCents) : feeCents,
      });
    }
  }

  const additionalCents = toCentsOrZero(input.additionalFee);
  lines.push({
    description: 'Additional Services Fee',
    detail: [...input.additionalServiceTitles],
    unitCents: additionalCents,
    quantity: travellers,
    gst: gstLabel,
    totalCents: withGst(additionalCents * times),
  });

  const courierCents = toCentsOrZero(input.courierFee);
  lines.push({
    description: `Courier Fee: ${input.courierName ?? ''}`.trim(),
    detail: [],
    unitCents: courierCents,
    quantity: 1,
    gst: gstLabel,
    totalCents: withGst(courierCents),
  });

  return { source: 'order-fees', lines };
};

// ---------------------------------------------------------------------------
// The router
// ---------------------------------------------------------------------------

/**
 * Where a lane-0/lane-1 attachment goes: the order's own folder, once the order is
 * known to exist and to be a public visa order — refused before a byte is stored
 * otherwise.
 */
const noteUploadFolder = async (req: Request): Promise<string> => {
  const order = await ClsOrder.findByPk(Number(req.params.id), {
    attributes: ['id', 'client_id', 'order_type'],
  });
  if (!order || order.order_type !== ORDER_TYPE.PUBLIC_VISA) {
    throw notFound('We could not find that public visa order.');
  }
  return orderFolder({ id: order.id, client_id: order.client_id });
};

/**
 * The router. `audit` is `admin.routes.ts`'s own audit writer — see
 * `legalisationOrder.ts` for why it is passed in.
 */
export const publicVisaOrderRoutes = (audit: PublicVisaAudit): Router => {
  const router = Router();

  const authorOf = async (req: Request) => {
    const id = currentUserId(req);
    const admin = await UserAdmin.findByPk(id);
    return { id, name: clean(admin?.fname) };
  };

  // -------------------------------------------------------------------------
  // GET /:id/public-visa — everything the screen renders
  // -------------------------------------------------------------------------

  const buildScreen = async (
    req: Request,
    order: ClsOrder
  ): Promise<PublicVisaScreen> => {
    const orderId = order.id;
    const adminId = currentUserId(req);

    const [
      contact,
      destinations,
      travellers,
      staff,
      courierOption,
      returnDocument,
      courierDetails,
      payment,
      orderNotes,
      followUps,
      additionalServices,
      clsDocuments,
      visaType,
      destinationCountry,
    ] = await Promise.all([
      clientContactOf(order),
      loadDestinations(orderId),
      OrderTravellerDetails.findAll({
        where: { order_id: orderId, status: 1 },
        order: [['id', 'ASC']],
      }),
      UserAdmin.findAll({
        where: { s_enabled: ENABLED, s_driver: 0 },
        order: [['fname', 'ASC']],
      }),
      order.courier_service_id
        ? VisaCourierOptions.findByPk(order.courier_service_id)
        : null,
      OrderReturnDocumentDetails.findOne({
        where: { order_id: orderId },
        order: [['id', 'ASC']],
      }),
      OrderCourierServiceDetails.findOne({
        where: { order_id: orderId },
        order: [['id', 'ASC']],
      }),
      Payment.findOne({ where: { order_no: orderId }, order: [['date_paid', 'DESC']] }),
      OrderNotes.findAll({ where: { order_no: orderId, is_deleted: 0 } }),
      OrderFollowUpDate.findAll({
        where: { order_id: orderId },
        order: [['id', 'DESC']],
      }),
      OrderAdditionalServices.findAll({
        where: { order_id: orderId },
        order: [['id', 'ASC']],
      }),
      ClsOrderDocuments.findAll({ where: { order_id: orderId }, order: [['id', 'ASC']] }),
      order.visa_type ? PublicVisaTypes.findByPk(Number(order.visa_type)) : null,
      order.destination ? Countries.findByPk(order.destination) : null,
    ]);

    const countryIds = [
      ...new Set(
        [
          ...destinations.map((row) => row.country_id),
          ...destinations.map((row) => row.nationality),
          ...travellers.map((row) => row.nationality),
          ...travellers.map((row) => row.citizenship),
          returnDocument?.country_id ?? null,
          payment?.mba_country_id ?? null,
        ].filter((value): value is number => typeof value === 'number' && value > 0)
      ),
    ];

    const visaTypeIds = [
      ...new Set(
        destinations
          .map((row) => row.visa_type_id)
          .filter((value): value is number => typeof value === 'number' && value > 0)
      ),
    ];
    const requirementIds = [
      ...new Set(
        destinations.flatMap((row) =>
          requirementIdsOf(row.visa_additional_requirement_id)
        )
      ),
    ];
    const serviceIds = additionalServices
      .map((row) => row.additional_service_id)
      .filter((value): value is number => typeof value === 'number');
    const passportTypeIds = [
      ...new Set(
        travellers
          .map((row) => row.passport_type)
          .filter((value): value is number => typeof value === 'number')
      ),
    ];
    const documentIds = [
      ...new Set(
        clsDocuments
          .map((row) => row.document_id)
          .filter((value): value is number => typeof value === 'number')
      ),
    ];

    const firstVisaTypeId =
      destinations[0]?.visa_type_id ?? (order.visa_type ? Number(order.visa_type) : null);

    const [
      countries,
      visaTypes,
      requirements,
      services,
      passportTypes,
      documentRows,
      locations,
      embassies,
    ] = await Promise.all([
      countryIds.length > 0 ? Countries.findAll({ where: { id: countryIds } }) : [],
      visaTypeIds.length > 0
        ? PublicVisaTypes.findAll({ where: { id: visaTypeIds } })
        : [],
      requirementIds.length > 0
        ? PublicVisaAdditionalRequirements.findAll({ where: { id: requirementIds } })
        : [],
      serviceIds.length > 0
        ? AdditionalServices.findAll({ where: { id: serviceIds } })
        : [],
      passportTypeIds.length > 0
        ? PassportTypes.findAll({ where: { id: passportTypeIds } })
        : [],
      documentIds.length > 0 ? Documents.findAll({ where: { id: documentIds } }) : [],
      PUBLIC_VISA_REGION.hasProcessLocation && firstVisaTypeId
        ? PublicVisaTypeLocations.findAll({
            where: { visa_type_id: firstVisaTypeId },
            order: [['id', 'ASC']],
          })
        : [],
      // The per-destination comment threads, in one query each destination.
      Promise.all(destinations.map((row) => listComments(row.id))),
    ]);

    const countryOf = new Map(countries.map((row) => [row.id, row]));
    const visaTypeOf = new Map(visaTypes.map((row) => [row.id, row]));
    const requirementOf = new Map(requirements.map((row) => [row.id, row]));
    const serviceOf = new Map(services.map((row) => [row.id, row]));
    const passportTypeOf = new Map(passportTypes.map((row) => [row.id, row]));
    const documentOf = new Map(documentRows.map((row) => [row.id, row]));

    const primary =
      travellers.find((row) => row.is_primary === 1) ?? travellers[0] ?? null;
    const clientName =
      fullName(contact.client?.fname, contact.client?.lname) ||
      fullName(primary?.first_name, primary?.last_name) ||
      fullName(order.contact_first_name, order.contact_last_name) ||
      null;

    const followUp =
      followUps.find((row) => row.admin_id === adminId) ?? followUps[0] ?? null;

    const returnCountry = returnDocument?.country_id
      ? countryOf.get(returnDocument.country_id)
      : undefined;
    const billingCountry = payment?.mba_country_id
      ? countryOf.get(payment.mba_country_id)
      : undefined;
    const isDhl = courierOption?.s_dhl === 1;
    const handDelivered =
      clean(returnDocument?.state)?.toUpperCase() ===
      PUBLIC_VISA_REGION.handDeliveredState;
    const confirmed = asTriState(order.is_address_confirmed) > 0;
    const first = destinations[0] ?? null;

    const destinationViews: PublicVisaDestinationView[] = destinations.map(
      (row, index) => {
        const country = row.country_id ? countryOf.get(row.country_id) : undefined;
        const type = row.visa_type_id ? visaTypeOf.get(row.visa_type_id) : undefined;
        const nationality = row.nationality ? countryOf.get(row.nationality) : undefined;

        return {
          id: row.id,
          countryId: row.country_id,
          countryName: clean(country?.country_name),
          // Legacy `embassy_name` is `tbl_countries.rep_name` of the destination.
          embassyName: clean(country?.rep_name),
          stamps: {
            received: toIso(row.visa_date_cls_received_all_items),
            submitted: toIso(row.visa_date_submitted_for_processing),
            completed: toIso(row.visa_date_completed_and_received_at_cls),
            closed: toIso(row.visa_date_order_on_route_and_closed),
          },
          ticket: {
            shippedBy: clean(row.visa_shipped_by),
            comNoteNo: clean(row.visa_com_note_no),
            comNoteIn: clean(row.visa_com_note_in),
            invoiceNo: clean(row.visa_invoice_no),
            signeeName: clean(row.sig_name),
            signature: signatureOf(row.signature),
          },
          comments: embassies[index] ?? [],
          visaOptions: {
            visaTypeId: row.visa_type_id,
            visaTypeName: clean(type?.type),
            requirements: requirementIdsOf(row.visa_additional_requirement_id)
              .map((id) => clean(requirementOf.get(id)?.requirement))
              .filter((value): value is string => value !== null),
          },
          entryOption: entryOptionOf(row.entry_option),
          dhl: {
            confirmationNumber: clean(row.dhl_confirmation_number),
            airwaybillNumber: clean(row.dhl_airwaybill_number),
            returnConfirmationNumber: clean(row.return_dhl_confirmation_number),
            returnAirwaybillNumber: clean(row.return_dhl_airwaybill_number),
            hasPickupLabel: labelPdfFrom(row.dhl_shipment_validate_label) !== null,
            hasReturnLabel: labelPdfFrom(row.return_dhl_shipment_validate_label) !== null,
          },
          newFlow: {
            nationalityId: row.nationality,
            nationality: clean(nationality?.country_name),
            region: clean(row.region),
            departureDate: toDateOnly(row.departure_date),
            entryDate: toDateOnly(row.entry_date_country),
            exitDate: toDateOnly(row.departure_date_country),
            travelPurpose: clean(row.travel_purpose),
            quotedVisaFee: clean(row.selected_visa_type_price),
            quotedRequirementFee: clean(row.selected_additional_requirement_price),
          },
        };
      }
    );

    const pickupAddress = (
      row: OrderCourierServiceDetails
    ): PublicVisaCourierAddress & {
      date: string | null;
      readyHour: string | null;
      readyMinute: string | null;
      closeHour: string | null;
      closeMinute: string | null;
      additionalComment: string | null;
    } => ({
      company: clean(row.courier_pickup_company),
      firstName: clean(row.courier_pickup_first_name),
      lastName: clean(row.courier_pickup_last_name),
      email: clean(row.courier_pickup_email),
      contactNumber: clean(row.courier_pickup_contact_number),
      address: clean(row.courier_pickup_address),
      city: clean(row.courier_pickup_city),
      state: clean(row.courier_pickup_state),
      postcode: clean(row.courier_pickup_postcode),
      date: toDateOnly(row.courier_pickup_date),
      readyHour: clean(row.courier_pickup_ready_by_time_hr),
      readyMinute: clean(row.courier_pickup_ready_by_time_min),
      closeHour: clean(row.courier_pickup_close_time_hr),
      closeMinute: clean(row.courier_pickup_close_time_min),
      additionalComment: clean(row.courier_pickup_additional_comment),
    });

    const showPanels = order.courier_service_id === DHL_PANEL_COURIER_ID;
    const dhlEligible = isDhl && returnDocument !== null && !handDelivered;

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
        isBulk: order.is_bulk === 1,
        addressConfirmed: asTriState(order.is_address_confirmed),
        courierServiceId: order.courier_service_id,
        courierName: clean(courierOption?.type),
        isDhlCourier: isDhl,
        destinationName: clean(destinationCountry?.country_name),
        visaTypeName: clean(visaType?.type),
        contact: {
          firstName: clean(order.contact_first_name),
          lastName: clean(order.contact_last_name),
          email: clean(order.contact_email),
          phone: clean(order.contact_phone),
          department: clean(order.department),
        },
        applicants: order.no_of_traveller,
        departureDate: toDateOnly(order.departure_date),
        accountNumber:
          clean(contact.client?.display_id) ?? clean(contact.client?.account_no),
      },
      destinations: destinationViews,
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
      followUpDate:
        toDateOnly(followUp?.follow_up_date) ?? toDateOnly(first?.visa_follow_up_date),
      processLocation: PUBLIC_VISA_REGION.hasProcessLocation
        ? {
            selectedId: first?.process_location_id ?? null,
            options: locations.map((row) => ({
              id: row.id,
              location: clean(row.location) ?? String(row.id),
            })),
          }
        : null,
      tracking: trackingOf(orderNotes),
      options: {
        shippedBy: [...PUBLIC_VISA_REGION.shippedBy],
        locations: [...PUBLIC_VISA_REGION.locations],
      },
      travellers: travellers.map((row) => ({
        id: row.id,
        firstName: clean(row.first_name),
        lastName: clean(row.last_name),
        email: clean(row.email),
        phone: clean(row.phone),
        departureDate: toDateOnly(row.departure_date),
        dateOfBirth: toDateOnly(row.date_of_birth),
        passportNumber: clean(row.passport_number),
        isClient: row.is_client === 1,
        isPrimary: row.is_primary === 1,
        title: clean(row.title),
        middleName: clean(row.middle_name),
        gender: clean(row.gender),
        nationality: clean(
          row.nationality ? countryOf.get(row.nationality)?.country_name : null
        ),
        citizenship: clean(
          row.citizenship ? countryOf.get(row.citizenship)?.country_name : null
        ),
        passportType: clean(
          row.passport_type ? passportTypeOf.get(row.passport_type)?.type : null
        ),
        passportIssueDate: toDateOnly(row.passport_issue_date),
        passportExpiryDate: toDateOnly(row.passport_expiry_date),
        occupation: clean(row.occupation),
        organisation: clean(row.organisation),
      })),
      courier: {
        showPanels,
        // Legacy: "Pickup Inbound Label" shows for a DHL courier whose return
        // state is not ACT; "Return Outbound Label" additionally needs the
        // address confirmed. Both just print the stored DHL response.
        canPrintPickupLabel: dhlEligible,
        canPrintReturnLabel: dhlEligible && confirmed,
        pickup: courierDetails ? pickupAddress(courierDetails) : null,
        return: returnDocument
          ? {
              company:
                clean(returnDocument.company) ??
                fullName(returnDocument.first_name, returnDocument.last_name),
              firstName: clean(returnDocument.first_name),
              lastName: clean(returnDocument.last_name),
              contactNumber: clean(returnDocument.contact_number),
              address: clean(returnDocument.address),
              city: clean(returnDocument.city),
              state: clean(returnDocument.state),
              postcode: clean(returnDocument.postcode),
            }
          : null,
      },
      payment: {
        name: fullName(payment?.fname, payment?.lname),
        email: clean(payment?.email),
        phone: clean(payment?.phone),
        mobile: clean(payment?.mobile),
        address: clean(payment?.address),
        status: payment ? asTriState(payment.s_paid) : null,
        accountNo: clean(payment?.account_no),
        transactionId: clean(payment?.transaction_id),
        totalCents: toCents(payment?.total_order_price),
        paidAt: toIso(payment?.date_paid),
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
      documents: clsDocuments.map((row) => {
        const stored = clean(row.document);
        const named = clean(
          row.document_id ? documentOf.get(row.document_id)?.document_name : null
        );
        return {
          id: row.id,
          document: named ?? stored,
          fileName: stored ? path.basename(stored.replace(/\\/g, '/')) : null,
          uploadedAt:
            row.status && row.status > DOCUMENT_STATUS.UNATTENDED
              ? toIso(row.modified)
              : null,
          status: row.status ?? 0,
          hasFile: stored !== null,
        };
      }),
      newFlow: {
        returnAddress: returnDocument
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
              returningDate: toIso(returnDocument.returning_date),
              comment: clean(returnDocument.additional_comment),
            }
          : null,
        request: parseTravelPurpose(clean(first?.travel_purpose)),
        pricing: {
          visaFeeCents: toCents(order.visa_fee),
          applicationFeeCents: toCents(order.visa_application_fee),
          serviceFeeCents: toCents(order.service_fee),
          additionalServicesFeeCents: toCents(order.additional_service_fee),
          courierFeeCents: toCents(order.courier_service_fee),
          totalFeeCents: toCents(order.total_fee),
          additionalServices: additionalServices.map((row) => ({
            title: clean(
              row.additional_service_id
                ? serviceOf.get(row.additional_service_id)?.title
                : null
            ),
            feeCents: toCents(row.additional_service_fee),
          })),
        },
      },
    };
  };

  router.get('/:id/public-visa', idParams, async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const order = await loadOrder(id);

    ok(res, { publicVisa: await buildScreen(req, order) });
  });

  // -------------------------------------------------------------------------
  // PATCH /:id/public-visa/destinations/:destinationId/ticket — one destination's Update
  // -------------------------------------------------------------------------

  router.patch(
    '/:id/public-visa/destinations/:destinationId/ticket',
    destinationParams,
    legalisationNoteUpload(noteUploadFolder),
    validate(ticketSchema),
    async (req: Request, res: Response) => {
      const { id, destinationId } = validParams<{ id: number; destinationId: number }>(
        req
      );
      const body = req.body as TicketBody;

      const uploaded = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
      const clientFiles = uploaded[LEGALISATION_NOTE_FIELDS.client] ?? [];
      const adminFiles = uploaded[LEGALISATION_NOTE_FIELDS.admin] ?? [];

      // Files are on disk before this handler runs, so anything that rejects the
      // request before a note row points at them has to throw them away again.
      let referenced = false;
      try {
        const result = await applyTicket(
          req,
          id,
          destinationId,
          body,
          clientFiles,
          adminFiles,
          () => {
            referenced = true;
          }
        );
        ok(res, result);
      } catch (error) {
        if (!referenced) {
          await Promise.all(
            [...clientFiles, ...adminFiles].map((file) =>
              discardDocument(storedPathOf(file))
            )
          );
        }
        throw error;
      }
    }
  );

  const applyTicket = async (
    req: Request,
    id: number,
    destinationId: number,
    body: TicketBody,
    clientFiles: Express.Multer.File[],
    adminFiles: Express.Multer.File[],
    markReferenced: () => void
  ): Promise<PublicVisaTicketResult> => {
    const order = await loadOrder(id);
    const destination = await loadOwnedDestination(id, destinationId);

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

    const submitted: Partial<
      Record<
        | 'allItemsReceivedAtCLS'
        | 'submittedForProcessing'
        | 'completedReceivedAtCLS'
        | 'orderOnRouteAndClosed',
        string | null
      >
    > = {};
    for (const key of [
      'allItemsReceivedAtCLS',
      'submittedForProcessing',
      'completedReceivedAtCLS',
      'orderOnRouteAndClosed',
    ] as const) {
      const raw = body[key];
      if (raw !== undefined) submitted[key] = parseStamp(raw) ?? null;
    }

    const author = await authorOf(req);
    const orderNo = orderNoOf(order);
    // The legacy priority: received, submitted, completed, closed — first wins.
    const milestone = pickMilestone(destination, submitted);

    const patch: Record<string, string | null> = {};
    const columnOf = {
      allItemsReceivedAtCLS: 'visa_date_cls_received_all_items',
      submittedForProcessing: 'visa_date_submitted_for_processing',
      completedReceivedAtCLS: 'visa_date_completed_and_received_at_cls',
      orderOnRouteAndClosed: 'visa_date_order_on_route_and_closed',
    } as const;
    for (const [key, column] of Object.entries(columnOf)) {
      const value = submitted[key as keyof typeof columnOf];
      if (value !== undefined) patch[column] = value;
    }
    const text = (value: string | undefined): string | null | undefined =>
      value === undefined ? undefined : clean(value);
    for (const [column, value] of Object.entries({
      visa_shipped_by: text(body.shippedBy),
      visa_com_note_no: text(body.comNoteNo),
      visa_com_note_in: text(body.comNoteIn),
      visa_invoice_no: text(body.invoiceNo),
      sig_name: text(body.signeeName),
    })) {
      if (value !== undefined) patch[column] = value;
    }

    if (Object.keys(patch).length > 0) await destination.update(patch);

    await audit(
      req,
      `public-visa.${milestone ? milestoneAudit[milestone.scantype] : 'processed'}`,
      {
        orderId: id,
        orderNo,
        destinationId,
        ...(milestone ? { scantype: milestone.scantype } : {}),
        // Legacy's "issued" line names the embassy: "…has been issued from the
        // EMBASSY OF {NEXT EMBASSY}".
        ...(milestone?.scantype === 'third'
          ? { embassy: clean(order.visa_next_embassy)?.toUpperCase() ?? '' }
          : {}),
      }
    );

    // ---- Comments (one note per file, text repeated) ----------------------
    const adminCommentSet = adminComment !== '';
    const baseNote = {
      destination_id: destination.id,
      date_added: toLegacyDateTime(),
      note_by: author.id,
      note_by_name: author.name,
      user_type: 'Admin',
      is_pin: 0,
    };

    const clientAttachments: string[] = [];
    if (clientComment !== '') {
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
      await audit(req, 'public-visa.comment.added', {
        orderId: id,
        orderNo,
        destinationId,
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
      await audit(req, 'public-visa.admin-comment.added', {
        orderId: id,
        orderNo,
        destinationId,
        attachments: adminFiles.length,
      });
    }

    // ---- Closed on every destination ⇒ status 2 (CLS confirmed) ----------
    const closedNow =
      submitted.orderOnRouteAndClosed !== undefined
        ? submitted.orderOnRouteAndClosed
        : normaliseStored(destination.visa_date_order_on_route_and_closed);

    if (closedNow !== null && order.status !== 2) {
      const siblings = await loadDestinations(id);
      const allClosed = siblings.every(
        (row) =>
          row.id === destination.id || Boolean(row.visa_date_order_on_route_and_closed)
      );
      if (allClosed) {
        const previous = order.status;
        await order.update({ status: 2, date_last_saved: toLegacyDateTime() });
        await audit(req, 'order.status', {
          orderId: id,
          from: previous,
          to: 2,
          reason: 'all destinations closed',
        });
      }
    }

    const [contact, country] = await Promise.all([
      clientContactOf(order),
      destination.country_id ? Countries.findByPk(destination.country_id) : null,
    ]);

    return {
      notification: {
        scantype: milestone?.scantype ?? '',
        clientComment: clientComment !== '' ? clientComment : null,
        suppress: adminCommentSet,
        orderNo,
        reference: orderReference(order.id),
        clientEmail: contact.email,
        clientFirstName: contact.firstName,
        destinationName: clean(country?.country_name),
        embassyName: clean(country?.rep_name),
        nextEmbassy: clean(order.visa_next_embassy),
        attachments: clientAttachments,
      },
      comments: await listComments(destination.id),
    };
  };

  const milestoneAudit: Record<Exclude<LegalisationScantype, ''>, string> = {
    first: 'received',
    second: 'submitted',
    third: 'issued',
    fourth: 'closed',
  };

  // -------------------------------------------------------------------------
  // PATCH /:id/public-visa/order — the order-level row of the Update
  // -------------------------------------------------------------------------

  router.patch(
    '/:id/public-visa/order',
    idParams,
    validate(orderSchema),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const body = req.body as z.infer<typeof orderSchema>;

      const order = await loadOrder(id);
      const destinations = await loadDestinations(id);
      const author = await authorOf(req);

      const orderPatch: Partial<{
        visa_cls_team_member: number | null;
        visa_is_delivered_to_embassy: number;
        visa_is_delivered_to_embassy_date: string | null;
        visa_next_embassy: string | null;
        date_last_saved: string;
      }> = {};

      if (body.clsTeamMember !== undefined) {
        const member = body.clsTeamMember === '' ? null : Number(body.clsTeamMember);
        // Validated only when it changes, so re-saving an order whose member has
        // since left the roster does not fail.
        if (member !== null && member !== (order.visa_cls_team_member || null)) {
          const found = await UserAdmin.findOne({
            where: { id: member, s_enabled: ENABLED },
          });
          if (!found) throw badRequest('That team member is not on the roster.');
        }
        orderPatch.visa_cls_team_member = member;
      }
      if (body.deliveredToEmbassy !== undefined) {
        orderPatch.visa_is_delivered_to_embassy = body.deliveredToEmbassy === '1' ? 1 : 0;
      }
      if (body.embassyDeliveredDate !== undefined) {
        orderPatch.visa_is_delivered_to_embassy_date =
          parseDay(body.embassyDeliveredDate) ?? null;
      }
      if (body.nextEmbassy !== undefined)
        orderPatch.visa_next_embassy = clean(body.nextEmbassy);

      // The Processing Location is the first destination's, as legacy wrote it.
      let processLocationWritten: number | null | undefined;
      if (body.processLocationId !== undefined && PUBLIC_VISA_REGION.hasProcessLocation) {
        const first = destinations[0];
        if (!first) throw notFound('This order has no destination row to work on.');

        const wanted =
          body.processLocationId === '' ? null : Number(body.processLocationId);
        if (wanted !== null && wanted !== first.process_location_id) {
          const typeId =
            first.visa_type_id ?? (order.visa_type ? Number(order.visa_type) : null);
          const allowed = typeId
            ? await PublicVisaTypeLocations.findOne({
                where: { id: wanted, visa_type_id: typeId },
              })
            : null;
          if (!allowed)
            throw badRequest(
              'That processing location is not offered for this visa type.'
            );
        }
        if (wanted !== first.process_location_id) {
          await first.update({ process_location_id: wanted });
          await audit(req, 'public-visa.process-location', {
            orderId: id,
            destinationId: first.id,
            processLocationId: wanted,
          });
        }
        processLocationWritten = wanted;
      }

      if (Object.keys(orderPatch).length > 0) {
        orderPatch.date_last_saved = toLegacyDateTime();
        await order.update(orderPatch);
        await audit(req, 'public-visa.order', { orderId: id, orderNo: orderNoOf(order) });
      }

      if (body.followUpDate !== undefined) {
        const followUp = parseDay(body.followUpDate) ?? null;
        // This admin's own rows only, as legacy deleted.
        await OrderFollowUpDate.destroy({ where: { order_id: id, admin_id: author.id } });
        if (followUp !== null) {
          await OrderFollowUpDate.create({
            admin_id: author.id,
            order_id: id,
            follow_up_date: `${followUp} 00:00:00`,
          });
        }
        // The destination column is what the queues select, so it moves with it.
        await ClsOrderDestinations.update(
          { visa_follow_up_date: followUp },
          { where: { order_id: id } }
        );
        await audit(req, 'public-visa.follow-up', { orderId: id, followUp });
      }

      ok(res, { orderId: id, processLocationId: processLocationWritten ?? null });
    }
  );

  // -------------------------------------------------------------------------
  // The document-type tracker (`tbl_order_notes`) — "Add new type of comment"
  // -------------------------------------------------------------------------

  const trackingNow = async (id: number) =>
    trackingOf(await OrderNotes.findAll({ where: { order_no: id, is_deleted: 0 } }));

  router.post(
    '/:id/public-visa/tracking',
    idParams,
    validate(trackingSchema),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const { rows } = req.body as z.infer<typeof trackingSchema>;

      await loadOrder(id);

      const allowed: readonly string[] = PUBLIC_VISA_REGION.locations;
      if (rows.some((row) => !allowed.includes(row.location))) {
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

        await audit(req, 'public-visa.tracking', {
          orderId: id,
          documentType: row.documentType,
          location: row.location,
          status: row.status,
          price: row.price,
        });
      }

      ok(res, { tracking: await trackingNow(id) });
    }
  );

  router.delete(
    '/:id/public-visa/tracking',
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

      await audit(req, 'public-visa.tracking.removed', {
        orderId: id,
        documentType,
        rows: removed,
      });

      ok(res, { tracking: await trackingNow(id) });
    }
  );

  router.delete(
    '/:id/public-visa/tracking/:noteId',
    noteParams,
    async (req: Request, res: Response) => {
      const { id, noteId } = validParams<{ id: number; noteId: number }>(req);

      await loadOrder(id);

      const row = await OrderNotes.findByPk(noteId);
      if (!row || row.order_no !== id) {
        throw notFound('We could not find that tracker row on this order.');
      }
      await row.destroy();

      await audit(req, 'public-visa.tracking.removed', {
        orderId: id,
        noteId,
        documentType: clean(row.document_type),
      });

      ok(res, { tracking: await trackingNow(id) });
    }
  );

  // -------------------------------------------------------------------------
  // Destination comments (both lanes): edit, delete, attachment
  // -------------------------------------------------------------------------

  const ownedNote = async (id: number, noteId: number) => {
    await loadOrder(id);
    const destinations = await loadDestinations(id);
    return loadOwnedNote(
      destinations.map((row) => row.id),
      noteId
    );
  };

  router.patch(
    '/:id/public-visa/comments/:noteId',
    noteParams,
    validate(
      z.object({ comment: z.string().trim().min(1, 'Write a comment').max(20_000) })
    ),
    async (req: Request, res: Response) => {
      const { id, noteId } = validParams<{ id: number; noteId: number }>(req);
      const { comment } = req.body as { comment: string };

      const note = await ownedNote(id, noteId);

      // Lane 1 always, lane 0 only when staff wrote it: a client's own reply is not
      // the admin's to rewrite. 403, not 404 — the caller is staff and may *see* it.
      if (!noteIsEditable(note)) {
        throw forbidden('That comment was written by the client and cannot be edited.');
      }

      await note.update({ note: comment });
      await audit(req, 'public-visa.comment.edited', {
        orderId: id,
        noteId,
        lane: laneOf(note),
      });

      ok(res, { comment: commentOf(note) });
    }
  );

  router.delete(
    '/:id/public-visa/comments/:noteId',
    noteParams,
    async (req: Request, res: Response) => {
      const { id, noteId } = validParams<{ id: number; noteId: number }>(req);

      const note = await ownedNote(id, noteId);

      if (!noteIsEditable(note)) {
        throw forbidden('That comment was written by the client and cannot be deleted.');
      }

      // The stored file is left where it is, as legacy did.
      await note.destroy();
      await audit(req, 'public-visa.comment.deleted', {
        orderId: id,
        noteId,
        lane: laneOf(note),
      });

      ok(res, { deleted: noteId });
    }
  );

  router.get(
    '/:id/public-visa/comments/:noteId/attachment',
    noteParams,
    async (req: Request, res: Response) => {
      const { id, noteId } = validParams<{ id: number; noteId: number }>(req);

      const note = await ownedNote(id, noteId);

      // Any lane — this route is staff-only (`requireAdmin` on the parent router).
      // The client portal's own route refuses lane 1; that gate is untouched.
      const stored = clean(note.attachment);
      if (!stored) throw notFound('That comment has no attachment.');

      // Files written by the legacy app are bare names under
      // `dev/destination_notes_file/` (`viewPublicVisaMediaAction`, mediaSource 1).
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
  // A destination's signature image
  // -------------------------------------------------------------------------

  router.get(
    '/:id/public-visa/destinations/:destinationId/signature',
    destinationParams,
    async (req: Request, res: Response) => {
      const { id, destinationId } = validParams<{ id: number; destinationId: number }>(
        req
      );

      await loadOrder(id);
      const destination = await loadOwnedDestination(id, destinationId);

      const signature = signatureOf(destination.signature);
      if (signature?.kind !== 'image')
        throw notFound('This destination has no signature image.');

      // The file served is the one THIS destination row names, and only if it ends
      // `_{orderId}_{destinationId}` (the legacy convention) — see the legalisation
      // twin for why. SVG is refused: it can carry script.
      const file = signature.file;
      const ownedSuffix = new RegExp(
        `_${id}_${destination.id}\\.(?:png|jpe?g|gif)$`,
        'i'
      );
      if (!ownedSuffix.test(file))
        throw notFound('That signature does not belong to this order.');

      const opened = await openDocument(`${SIGNATURE_DIRECTORY}/${file}`);
      if (!opened)
        throw notFound('We hold a record of that signature but not the file itself.');

      res.setHeader('Content-Disposition', `inline; filename="${file}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      streamDocument(opened, res, { orderId: id, destinationId });
    }
  );

  // -------------------------------------------------------------------------
  // Client Centre Documents — view
  // -------------------------------------------------------------------------

  router.get(
    '/:id/public-visa/documents/:documentId/file',
    validate(z.object({ id: idParam, documentId: idParam }), 'params'),
    async (req: Request, res: Response) => {
      const { id, documentId } = validParams<{ id: number; documentId: number }>(req);

      await loadOrder(id);

      const row = await ClsOrderDocuments.findByPk(documentId);
      if (!row || row.order_id !== id) {
        throw notFound('We could not find that document on this order.');
      }

      const stored = clean(row.document);
      if (!stored) throw notFound('No file has been uploaded for that document.');

      // This API stores full paths; the legacy admin read
      // `dev/order_documents/order_{orderId}/{file}` (`ManageOrderDocumentsController::viewAction`).
      const opened =
        (await openDocument(stored)) ??
        (await openDocument(`dev/order_documents/order_${id}/${stored}`));
      if (!opened)
        throw notFound('We hold a record of that document but not the file itself.');

      // Legacy `viewAction` marked an opened document "reviewed" (status 2) when it
      // was below that. Only an uploaded one (1) moves: 0 has no file to open, and
      // 3/4 are a reviewer's own verdict that opening must not overwrite.
      if (row.status === DOCUMENT_STATUS.UPLOADED) {
        await row.update({
          status: DOCUMENT_STATUS.REVIEWED,
          modified: toLegacyDateTime(),
        });
        await audit(req, 'document.review', {
          documentId,
          decision: 'reviewed',
          status: DOCUMENT_STATUS.REVIEWED,
          via: 'viewed',
        });
      }

      res.setHeader(
        'Content-Disposition',
        `inline; filename="${path.basename(stored.replace(/\\/g, '/'))}"`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      streamDocument(opened, res, { orderId: id, documentId });
    }
  );

  // -------------------------------------------------------------------------
  // DHL — details modal, printing a stored label, and the not-connected generator
  // -------------------------------------------------------------------------

  router.patch(
    '/:id/public-visa/dhl-details',
    idParams,
    validate(dhlDetailsSchema),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const body = req.body as z.infer<typeof dhlDetailsSchema>;

      await loadOrder(id);

      const pickup = body.pickup;
      const pickupValues = {
        courier_pickup_date: pickup.date,
        courier_pickup_ready_by_time_hr: pickup.readyHour,
        courier_pickup_ready_by_time_min: pickup.readyMinute,
        courier_pickup_close_time_hr: pickup.closeHour,
        courier_pickup_close_time_min: pickup.closeMinute,
        courier_pickup_first_name: pickup.firstName,
        courier_pickup_last_name: pickup.lastName,
        courier_pickup_contact_number: pickup.contactNumber,
        courier_pickup_company: clean(pickup.company),
        courier_pickup_address: pickup.address,
        courier_pickup_city: pickup.city,
        courier_pickup_state: pickup.state,
        courier_pickup_postcode: pickup.postcode,
      };

      // Legacy `updDhladdress`: the courier row and the return row are each
      // updated, or created when the order has none.
      const courier = await OrderCourierServiceDetails.findOne({
        where: { order_id: id },
      });
      if (courier) await courier.update(pickupValues);
      else await OrderCourierServiceDetails.create({ order_id: id, ...pickupValues });

      const ret = body.return;
      const returnValues = {
        first_name: ret.firstName,
        last_name: ret.lastName,
        contact_number: ret.contactNumber,
        company: clean(ret.company),
        address: ret.address,
        city: ret.city,
        state: ret.state,
        postcode: ret.postcode,
      };
      const returnRow = await OrderReturnDocumentDetails.findOne({
        where: { order_id: id },
      });
      if (returnRow) await returnRow.update(returnValues);
      else await OrderReturnDocumentDetails.create({ order_id: id, ...returnValues });

      await audit(req, 'public-visa.dhl-details', { orderId: id });

      ok(res, { orderId: id });
    }
  );

  /**
   * Prints an existing DHL label — legacy `printDhlLabelAction`.
   *
   * Legacy stored DHL's shipment-validation response on the destination row and
   * its "Pickup Inbound Label" / "Return Outbound Label" links decode the base64
   * PDF out of it. `pickup` reads `dhl_shipment_validate_label`, `return` reads
   * `return_dhl_shipment_validate_label`, both from the order's first destination.
   */
  router.get(
    '/:id/public-visa/dhl-label/:labelType',
    validate(
      z.object({ id: idParam, labelType: z.enum(['pickup', 'return']) }),
      'params'
    ),
    async (req: Request, res: Response) => {
      const { id, labelType } = validParams<{
        id: number;
        labelType: 'pickup' | 'return';
      }>(req);

      await loadOrder(id);
      const [first] = await loadDestinations(id);

      const stored =
        labelType === 'pickup'
          ? first?.dhl_shipment_validate_label
          : first?.return_dhl_shipment_validate_label;
      const pdf = labelPdfFrom(stored ?? null);
      if (!pdf) throw notFound('No DHL label found.');

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Length', String(pdf.length));
      res.setHeader(
        'Content-Disposition',
        `inline; filename="dhl-${labelType}-label-${id}.pdf"`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.end(pdf);
    }
  );

  /**
   * "Inbound Label" / "Outbound Label" — generating a new DHL label.
   *
   * Runs the checks legacy ran before it called DHL and then refuses, because the
   * call itself — an XML `BookPURequest` + `ShipmentRequest` to DHL's live API
   * under a SiteID, password and account number — has no credentials anywhere in
   * this repository. It never pretends to have created a label.
   */
  router.post(
    '/:id/public-visa/dhl/:labelType',
    validate(
      z.object({ id: idParam, labelType: z.enum(['inbound', 'outbound']) }),
      'params'
    ),
    async (req: Request) => {
      const { id, labelType } = validParams<{
        id: number;
        labelType: 'inbound' | 'outbound';
      }>(req);

      const order = await loadOrder(id);
      if (!order.courier_service_id) {
        throw conflict(
          'Courier service option is not configured for DHL shipment service, please check visa courier services in admin.'
        );
      }
      const [option, returnRow] = await Promise.all([
        VisaCourierOptions.findByPk(order.courier_service_id),
        OrderReturnDocumentDetails.findOne({ where: { order_id: id } }),
      ]);
      if (option?.s_dhl !== 1) {
        throw conflict(
          'Courier service option is not configured for DHL shipment service, please check visa courier services in admin.'
        );
      }
      if (
        !returnRow ||
        clean(returnRow.state)?.toUpperCase() === PUBLIC_VISA_REGION.handDeliveredState
      ) {
        throw conflict(
          `Courier service option is not available for ${PUBLIC_VISA_REGION.handDeliveredState} location, please check the configuration.`
        );
      }
      if (labelType === 'outbound' && asTriState(order.is_address_confirmed) === 0) {
        throw conflict('The client has not confirmed the return address yet.');
      }

      throw serviceUnavailable(
        'DHL label generation is not connected: it needs DHL’s live shipment API and CLS’s DHL credentials, which are not configured on this system. Create the label in DHL’s own system.'
      );
    }
  );

  // -------------------------------------------------------------------------
  // Order Status / Payment Status
  // -------------------------------------------------------------------------

  const PAYMENT_LABEL: Record<number, string> = {
    0: 'pending',
    1: 'paid online',
    2: 'paid by account',
  };

  router.patch(
    '/:id/public-visa/status',
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

      const previousStatus = order.status;
      await order.update({ status: orderStatus, date_last_saved: toLegacyDateTime() });
      if (previousStatus !== orderStatus) {
        await audit(req, 'order.status', {
          orderId: id,
          from: previousStatus,
          to: orderStatus,
        });
      }

      const previousPayment = payment.s_paid;
      await payment.update({ s_paid: paymentStatus });
      if (previousPayment !== paymentStatus) {
        await audit(req, 'order.payment-status', {
          orderId: id,
          from: previousPayment,
          to: paymentStatus,
          label: PAYMENT_LABEL[paymentStatus],
        });
      }

      ok(res, { orderId: id, orderStatus, paymentStatus });
    }
  );

  /** Order Status alone, for an order with no payment row (nothing to change there). */
  router.patch(
    '/:id/public-visa/order-status',
    idParams,
    validate(
      z.object({ orderStatus: z.union([z.literal(0), z.literal(1), z.literal(2)]) })
    ),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const { orderStatus } = req.body as { orderStatus: 0 | 1 | 2 };

      const order = await loadOrder(id);
      const previous = order.status;
      await order.update({ status: orderStatus, date_last_saved: toLegacyDateTime() });
      if (previous !== orderStatus) {
        await audit(req, 'order.status', {
          orderId: id,
          from: previous,
          to: orderStatus,
        });
      }

      ok(res, { orderId: id, orderStatus });
    }
  );

  // -------------------------------------------------------------------------
  // Address confirmation
  // -------------------------------------------------------------------------

  router.post(
    '/:id/public-visa/address-confirmation/acknowledge',
    idParams,
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const order = await loadOrder(id);

      // 1 = the client confirmed and nobody has seen it; 2 = discarded. Anything
      // else has nothing to discard, and writing 2 over a 0 would hide the next
      // confirmation, so it is left alone.
      if (order.is_address_confirmed !== 1) {
        ok(res, {
          orderId: id,
          addressConfirmed: asTriState(order.is_address_confirmed),
          changed: false,
        });
        return;
      }

      await order.update({
        is_address_confirmed: 2,
        date_last_saved: toLegacyDateTime(),
      });
      await audit(req, 'public-visa.address-confirmation.discarded', { orderId: id });

      ok(res, { orderId: id, addressConfirmed: 2, changed: true });
    }
  );

  router.get(
    '/:id/public-visa/address-confirmation',
    idParams,
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const order = await loadOrder(id);

      const [contact, returnDocument, country] = await Promise.all([
        clientContactOf(order),
        OrderReturnDocumentDetails.findOne({ where: { order_id: id } }),
        order.destination ? Countries.findByPk(order.destination) : null,
      ]);

      const confirmation: PublicVisaAddressConfirmation = {
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
        serviceLabel: 'Visa',
      };

      ok(res, { confirmation });
    }
  );

  // -------------------------------------------------------------------------
  // Printable sheets
  // -------------------------------------------------------------------------

  router.get(
    '/:id/public-visa/print/:visaSheet',
    validate(
      z.object({
        id: idParam,
        visaSheet: z.enum(['return-address', 'embassy-to-from', 'traveller-label']),
      }),
      'params'
    ),
    validate(
      z.object({
        destination: idParam.optional(),
        traveller: idParam.optional(),
      }),
      'query'
    ),
    async (req: Request, res: Response) => {
      const { id, visaSheet: kind } = validParams<{
        id: number;
        visaSheet: PublicVisaPrintKind;
      }>(req);
      const query = validQuery<{ destination?: number; traveller?: number }>(req);

      const order = await loadOrder(id);
      const orderNo = orderNoOf(order);
      const destinations = await loadDestinations(id);

      let print: PublicVisaPrintView;

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
            name: fullName(returnDocument?.first_name, returnDocument?.last_name),
            company: clean(returnDocument?.company),
            address: clean(returnDocument?.address),
            city: clean(returnDocument?.city),
            state: clean(returnDocument?.state),
            postcode: clean(returnDocument?.postcode),
            country: clean(country?.country_name) ?? PUBLIC_VISA_REGION.homeCountry,
            phone: clean(returnDocument?.contact_number),
            email: clean(returnDocument?.email),
          },
        };
      } else if (kind === 'embassy-to-from') {
        const wanted = query.destination
          ? destinations.filter((row) => row.id === query.destination)
          : destinations;
        if (query.destination && wanted.length === 0) {
          throw notFound('We could not find that destination on this order.');
        }
        const countries = await Countries.findAll({
          where: {
            id: wanted
              .map((row) => row.country_id)
              .filter((v): v is number => v !== null),
          },
        });
        const countryOf = new Map(countries.map((row) => [row.id, row]));

        // The client's return address, which the sheet prints as the other half of
        // each label: embassy to client on one, client to embassy on the other.
        const returnDocument = await OrderReturnDocumentDetails.findOne({
          where: { order_id: id },
        });
        const clientCountry = returnDocument?.country_id
          ? await Countries.findByPk(returnDocument.country_id)
          : null;

        print = {
          kind,
          orderId: id,
          orderNo,
          // CLS's street address is not held anywhere in this codebase or schema,
          // so the "From" block is the company and its published number only.
          from: { company: CLS_CONTACT.companyName, phone: CLS_CONTACT.phone },
          client: {
            name: fullName(returnDocument?.first_name, returnDocument?.last_name),
            company: clean(returnDocument?.company),
            address: clean(returnDocument?.address),
            city: clean(returnDocument?.city),
            state: clean(returnDocument?.state),
            postcode: clean(returnDocument?.postcode),
            country: clean(clientCountry?.country_name),
            phone: clean(returnDocument?.contact_number),
            email: clean(returnDocument?.email),
          },
          embassies: wanted.map((row) => {
            const country = row.country_id ? countryOf.get(row.country_id) : undefined;
            return {
              destinationId: row.id,
              name: clean(country?.rep_name),
              country: clean(country?.country_name),
              addressLine1: clean(country?.embassy_address_line1),
              addressLine2: clean(country?.embassy_address_line2),
              street: clean(country?.embassy_street),
              city: clean(country?.embassy_city),
              state: clean(country?.embassy_state),
              postcode: clean(country?.embassy_postcode),
              phone: clean(country?.embassy_phone),
            };
          }),
        };
      } else {
        if (!query.destination || !query.traveller) {
          throw badRequest('Say which destination and which traveller the label is for.');
        }
        const destination = destinations.find((row) => row.id === query.destination);
        const traveller = await OrderTravellerDetails.findByPk(query.traveller);
        if (!destination || !traveller || traveller.order_id !== id) {
          throw notFound('We could not find that traveller on this order.');
        }
        const [country, type, nationality] = await Promise.all([
          destination.country_id ? Countries.findByPk(destination.country_id) : null,
          destination.visa_type_id
            ? PublicVisaTypes.findByPk(destination.visa_type_id)
            : null,
          traveller.nationality ? Countries.findByPk(traveller.nationality) : null,
        ]);

        print = {
          kind,
          orderId: id,
          orderNo,
          destination: clean(country?.country_name),
          destinationCode: clean(country?.country_code),
          pickupPhone: CLS_CONTACT.phone,
          visaType: clean(type?.type),
          traveller: {
            name: fullName(traveller.first_name, traveller.last_name),
            passportNumber: clean(traveller.passport_number),
            dateOfBirth: toDateOnly(traveller.date_of_birth),
            departureDate:
              toDateOnly(traveller.departure_date) ?? toDateOnly(order.departure_date),
            nationality: clean(nationality?.country_name),
          },
        };
      }

      ok(res, { print });
    }
  );

  // -------------------------------------------------------------------------
  // Reprint Invoice
  // -------------------------------------------------------------------------

  router.get(
    '/:id/public-visa/invoice',
    idParams,
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const order = await loadOrder(id);

      const [
        destinations,
        travellers,
        returnDocument,
        courierDetails,
        payment,
        manual,
        client,
        courier,
        services,
      ] = await Promise.all([
        loadDestinations(id),
        OrderTravellerDetails.findAll({
          where: { order_id: id, status: 1 },
          order: [['id', 'ASC']],
        }),
        OrderReturnDocumentDetails.findOne({ where: { order_id: id } }),
        OrderCourierServiceDetails.findOne({ where: { order_id: id } }),
        Payment.findOne({ where: { order_no: id }, order: [['date_paid', 'DESC']] }),
        ManualPayment.findOne({
          where: { order_no: String(id) },
          order: [['id', 'ASC']],
        }),
        order.client_id ? UserClient.findByPk(order.client_id) : null,
        order.courier_service_id
          ? VisaCourierOptions.findByPk(order.courier_service_id)
          : null,
        OrderAdditionalServices.findAll({ where: { order_id: id } }),
      ]);

      const countryIds = destinations
        .map((row) => row.country_id)
        .filter((value): value is number => typeof value === 'number');
      const typeIds = destinations
        .map((row) => row.visa_type_id)
        .filter((value): value is number => typeof value === 'number');
      const requirementIds = destinations.flatMap((row) =>
        requirementIdsOf(row.visa_additional_requirement_id)
      );
      const serviceIds = services
        .map((row) => row.additional_service_id)
        .filter((value): value is number => typeof value === 'number');

      const [countries, types, requirements, serviceRows] = await Promise.all([
        countryIds.length ? Countries.findAll({ where: { id: countryIds } }) : [],
        typeIds.length ? PublicVisaTypes.findAll({ where: { id: typeIds } }) : [],
        requirementIds.length
          ? PublicVisaAdditionalRequirements.findAll({ where: { id: requirementIds } })
          : [],
        serviceIds.length
          ? AdditionalServices.findAll({ where: { id: serviceIds } })
          : [],
      ]);
      const countryOf = new Map(countries.map((row) => [row.id, row]));
      const typeOf = new Map(types.map((row) => [row.id, row]));
      const requirementOf = new Map(requirements.map((row) => [row.id, row]));
      const serviceOf = new Map(serviceRows.map((row) => [row.id, row]));

      let items: { description: string; price: unknown; quantity: unknown }[] | null =
        null;
      if (manual?.items) {
        try {
          const parsed: unknown = JSON.parse(manual.items);
          if (Array.isArray(parsed)) {
            items = parsed.map((entry: Record<string, unknown>) => ({
              description: typeof entry.description === 'string' ? entry.description : '',
              price: entry.price,
              quantity: entry.quantity,
            }));
          }
        } catch {
          items = null;
        }
      }

      const { lines, source } = buildInvoiceLines({
        items,
        destinations: destinations.map((row) => ({
          requirements: requirementIdsOf(row.visa_additional_requirement_id)
            .map((reqId) => clean(requirementOf.get(reqId)?.requirement))
            .filter((value): value is string => value !== null),
        })),
        travellers: order.no_of_traveller ?? travellers.length,
        serviceFee: order.service_fee,
        applicationFee: order.visa_application_fee,
        additionalFee: order.additional_service_fee,
        courierFee: order.courier_service_fee,
        additionalServiceTitles: services
          .map((row) =>
            clean(
              row.additional_service_id
                ? serviceOf.get(row.additional_service_id)?.title
                : null
            )
          )
          .filter((value): value is string => value !== null),
        courierName: clean(courier?.type),
        specialPricePercent:
          client?.can_get_special_price === 1 ? client.special_price : null,
      });

      const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);
      const paid = payment !== null && (payment.s_paid === 1 || payment.s_paid === 2);

      // The legacy address cascade: courier pickup, then the return address, then the
      // client's own record — each field falls through independently.
      const pick = (...values: (string | null | undefined)[]): string | null =>
        values.map(clean).find((value) => value !== null) ?? null;

      const invoice: PublicVisaInvoice = {
        orderId: id,
        orderNo: orderNoOf(order),
        paymentStatus: order.payment_status === 1 || paid ? 'Success' : 'Pending',
        invoiceDate: toIso(order.date_submitted),
        name:
          travellers
            .map((row) => fullName(row.first_name, row.last_name))
            .filter(Boolean)
            .join(', ') || null,
        company: clean(returnDocument?.company),
        address: {
          address: pick(
            courierDetails?.courier_pickup_address,
            returnDocument?.address,
            client?.address
          ),
          city: pick(
            courierDetails?.courier_pickup_city,
            returnDocument?.city,
            client?.city
          ),
          state: pick(
            courierDetails?.courier_pickup_state,
            returnDocument?.state,
            client?.state
          ),
          postcode: pick(
            courierDetails?.courier_pickup_postcode,
            returnDocument?.postcode,
            client?.postcode
          ),
        },
        phone: clean(client?.phone),
        service: destinations.map((row) =>
          [
            clean(row.country_id ? countryOf.get(row.country_id)?.country_name : null),
            clean(row.visa_type_id ? typeOf.get(row.visa_type_id)?.type : null),
          ]
            .filter(Boolean)
            .join(' ')
        ),
        lines,
        subtotalCents,
        totalCents: subtotalCents,
        balanceDueCents: paid ? 0 : subtotalCents,
        source,
      };

      await audit(req, 'public-visa.invoice.reprinted', { orderId: id });

      ok(res, { invoice });
    }
  );

  return router;
};
