import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ClsOrder,
  ClsOrderDocuments,
  Countries,
  OrderTravellerDetails,
  RussianVisaVoucherOrderDetails,
  RussianVisaVoucherTypes,
  UserClient,
} from '../../models';
import { ok } from '../../shared/http/responses';
import { conflict, notFound } from '../../shared/errors';
import { streamDocument } from '../../shared/http/streamDocument';
import { toDateOnly, toIso, toLegacyDateTime } from '../../shared/dates';
import { openDocument } from '../../shared/storage/documents';
import { toCents } from '../../shared/money';
import { clean, fullName } from '../../shared/text';
import { idParam, validate, validParams } from '../../shared/validation';
import { CLS_ORDER_STATUS, ORDER_TYPE } from '../../domain/codes';
import { orderReference } from '../../domain/orderReference';
import { normaliseStored, parseStamp } from './legalisationOrder';
import { readPaymentState, type AdminPaymentState } from './orderPayment';

/**
 * The Russian Visa Voucher order screen — every read and write behind it.
 *
 * Reproduces `viewRussianVisaVoucherAction` and `russianVisaVoucher.html.twig` from
 * the legacy `CLSadminBundle`, read in full (memory `cls-order-detail-field-audit`),
 * and adds the fields the NEW order journey collects (see "New-flow fields" below).
 *
 * ## What the legacy screen could and could not edit
 *
 * Only the four Order Progress datetimes were editable, and Submit saved exactly
 * those (plus the milestone email). **Everything else on the legacy screen was a
 * disabled input** — the cities, the hotels, the Visa-to-be-applied-at radios, every
 * Applicant Details field (Gender, Date Of Birth, both passport dates included), the
 * Passport Comment and the Employment Details. This module keeps that exactly: the
 * only write is `PATCH …/voucher/progress`; the rest of the screen is read-only, and
 * the one extra is replacing the passport scan (`PATCH …/voucher/passport-file`,
 * which already existed in `orderDetail.ts`).
 *
 * Order Status, Payment Status, Account Number, Pay Now, Send Invoice and Reprint
 * Invoice are the shared payment actions — `orderPayment.ts`. This screen's GET
 * embeds their state so the panel renders from one read.
 *
 * ## The milestone email
 *
 * Legacy compared each posted stamp with the stored one **in priority order, first
 * difference wins** (`first` … `fourth`) and emailed the client a line chosen by
 * which. Reproduced here as `notification.scantype`; the website sends the mail.
 * Two deliberate deviations, both shared with the Document Legalisation screen:
 * clearing a stamp is a correction rather than a milestone and sends no email; and
 * setting the closed stamp moves the order to `CLS_CONFIRMED` only when this save
 * newly sets it — legacy forced status 2 on every save while it was set, which
 * silently reverted a status a consultant had chosen.
 *
 * ## New-flow fields
 *
 * `tbl_russian_visa_voucher_order_details` and the traveller row hold more than the
 * legacy template showed: the voucher plan and processing speed (`voucher_col`),
 * its fee, the second and multiple entry/departure dates, the client's note (which
 * carries the plan line `withVoucherPlan` writes at the top), the employer block on
 * every voucher (the legacy showed it for business only), the applicant's title and
 * nationality, the order contact and the order's totals. All of them are in the
 * response; none is editable (no legacy equivalent was).
 */

export type VoucherAudit = (
  req: Request,
  action: string,
  detail: Record<string, unknown>
) => Promise<void>;

/**
 * "Visa to be applied at" radio values, exactly as the legacy twig spells them
 * (the en dash, the stray space before a comma, and all). The stored value is
 * compared against these byte for byte to pick a radio; anything else is "Other".
 * Per region: the NZ port swaps this list.
 */
export const VISA_APPLIED_AT_OPTIONS = [
  'The Russian Embassy, 78 Canberra Avenue, Griffith ACT– CANBERRA AUSTRALIA',
  'The Consulate General of Russian Federation ,7-9 Fullerton St, Woollahra NSW 2025',
] as const;

/**
 * `voucher_col`, as the old application's form numbers it — the inverse of the
 * mapping in `orders.lodge.ts` (3 days, 1-2 days, 12 hours, 13 days, 4 days).
 */
const PROCESSING_LABEL: Record<number, string> = {
  1: '3 days processing',
  2: '1-2 days processing',
  3: '12 hours processing',
  4: '13 days processing',
  5: '4 days processing',
};

export interface VoucherApplicant {
  id: number;
  isPrimary: boolean;
  title: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  /** `YYYY-MM-DD`. */
  dateOfBirth: string | null;
  passportNumber: string | null;
  /** `male` / `female` as stored. */
  gender: string | null;
  passportIssueDate: string | null;
  passportExpiryDate: string | null;
  nationality: string | null;
  citizenship: string | null;
  passportType: number | null;
  occupation: string | null;
  organisation: string | null;
}

export interface VoucherScreen {
  order: {
    id: number;
    orderNo: string;
    reference: string;
    status: 0 | 1 | 2;
    clientId: number | null;
    clientName: string | null;
    dateSubmitted: string | null;
    applicantCount: number | null;
    departureDate: string | null;
    totalFeeCents: number | null;
    serviceFeeCents: number | null;
    isBulk: boolean;
    contact: {
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      phone: string | null;
      department: string | null;
    };
  };
  stamps: {
    received: string | null;
    submitted: string | null;
    completed: string | null;
    closed: string | null;
  };
  voucher: {
    /** `tbl_russian_visa_voucher_types.type` — tourist / business. */
    type: string | null;
    /** `…types.name` — the Voucher Type on the Payment Details panel. */
    name: string | null;
    entryOption: string | null;
    processing: { column: number | null; label: string | null };
    costCents: number | null;
    firstEntryDate: string | null;
    firstDepartureDate: string | null;
    doubleEntryDate: string | null;
    doubleDepartureDate: string | null;
    multipleEntryDate: string | null;
    multipleDepartureDate: string | null;
    listOfCities: string | null;
    listOfHotels: string | null;
    visaAppliedAt: string | null;
    visaAppliedAtOptions: readonly string[];
    /** The Passport Comment: `tbl_russian_visa_voucher_order_details.comment`. */
    comment: string | null;
    passportFile: { hasFile: boolean; name: string | null };
    employment: {
      company: string | null;
      position: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      postcode: string | null;
      country: string | null;
      phone: string | null;
      /** True when any of the above is filled in — decides if the panel shows. */
      provided: boolean;
    };
  };
  applicants: VoucherApplicant[];
  documents: { id: number; name: string; status: number | null; uploadedAt: string | null }[];
  payment: AdminPaymentState;
}

const idParams = validate(z.object({ id: idParam }), 'params');

/** The order, or a 404 when it is missing or not a Russian visa voucher order. */
const loadOrder = async (id: number): Promise<ClsOrder> => {
  const order = await ClsOrder.findByPk(id);
  if (!order || order.order_type !== ORDER_TYPE.RUSSIAN_VISA_VOUCHER) {
    throw notFound('We could not find that Russian visa voucher order.');
  }
  return order;
};

const loadDetails = async (orderId: number): Promise<RussianVisaVoucherOrderDetails> => {
  const row = await RussianVisaVoucherOrderDetails.findOne({ where: { order_id: orderId } });
  if (!row) throw notFound('We could not find that order’s voucher details.');
  return row;
};

const orderNoOf = (order: ClsOrder): string => clean(order.order_no) ?? String(order.id);

const stampField = z
  .string()
  .max(40)
  .refine((value) => parseStamp(value) !== undefined, 'Enter a valid date and time');

const progressSchema = z.object({
  allItemsReceivedAtCLS: stampField.optional(),
  submittedForProcessing: stampField.optional(),
  completedReceivedAtCLS: stampField.optional(),
  orderOnRouteAndClosed: stampField.optional(),
});

type StampKey = keyof z.infer<typeof progressSchema>;
type StampColumn =
  | 'date_cls_received_all_items'
  | 'date_submitted_for_processing'
  | 'date_completed_and_received_at_cls'
  | 'date_order_on_route_and_closed';

/** The four milestones in the legacy priority order — first difference wins. */
const MILESTONES: readonly {
  key: StampKey;
  column: StampColumn;
  scantype: 'first' | 'second' | 'third' | 'fourth';
  audit: string;
}[] = [
  {
    key: 'allItemsReceivedAtCLS',
    column: 'date_cls_received_all_items',
    scantype: 'first',
    audit: 'voucher.received',
  },
  {
    key: 'submittedForProcessing',
    column: 'date_submitted_for_processing',
    scantype: 'second',
    audit: 'voucher.submitted',
  },
  {
    key: 'completedReceivedAtCLS',
    column: 'date_completed_and_received_at_cls',
    scantype: 'third',
    audit: 'voucher.completed',
  },
  {
    key: 'orderOnRouteAndClosed',
    column: 'date_order_on_route_and_closed',
    scantype: 'fourth',
    audit: 'voucher.closed',
  },
];

/**
 * Which milestone this save advanced, or none — see the note on the equivalent in
 * `legalisationOrder.ts`: a stamp counts only when it is **set** and differs from
 * what is stored; clearing is a correction, not a milestone.
 */
export const pickVoucherMilestone = (
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

const dateOnly = (value: unknown): string | null => toDateOnly(value);

const countryNames = async (ids: (number | null | undefined)[]): Promise<Map<number, string>> => {
  const unique = [...new Set(ids.filter((value): value is number => typeof value === 'number'))];
  if (unique.length === 0) return new Map();
  const rows = await Countries.findAll({ where: { id: unique } });
  return new Map(rows.map((row) => [row.id, clean(row.country_name) ?? '']));
};

const buildScreen = async (order: ClsOrder): Promise<VoucherScreen> => {
  const [details, client, travellers, documents, payment] = await Promise.all([
    RussianVisaVoucherOrderDetails.findOne({ where: { order_id: order.id } }),
    order.client_id ? UserClient.findByPk(order.client_id) : null,
    OrderTravellerDetails.findAll({ where: { order_id: order.id }, order: [['id', 'ASC']] }),
    ClsOrderDocuments.findAll({ where: { order_id: order.id }, order: [['id', 'ASC']] }),
    readPaymentState(order),
  ]);

  const voucherId = details?.russian_visa_voucher_id ?? order.russian_visa_voucher_id;
  const catalogue = voucherId ? await RussianVisaVoucherTypes.findByPk(voucherId) : null;

  const countries = await countryNames([
    details?.country_id,
    ...travellers.flatMap((row) => [row.nationality, row.citizenship]),
  ]);
  const countryOf = (id: number | null | undefined): string | null =>
    id ? (countries.get(id) ?? null) : null;

  const passportFile = clean(details?.passport_file);

  const employment = {
    company: clean(details?.company),
    position: clean(details?.position),
    address: clean(details?.address),
    city: clean(details?.city),
    state: clean(details?.state),
    postcode: clean(details?.postcode),
    country: countryOf(details?.country_id),
    phone: clean(details?.company_phone),
  };

  return {
    order: {
      id: order.id,
      orderNo: orderNoOf(order),
      reference: orderReference(order.id),
      status: order.status === 1 ? 1 : order.status === 2 ? 2 : 0,
      clientId: order.client_id,
      clientName: client ? fullName(client.fname, client.lname) || null : null,
      dateSubmitted: toIso(order.date_submitted),
      applicantCount: order.no_of_traveller,
      departureDate: dateOnly(order.departure_date),
      totalFeeCents: toCents(order.total_fee),
      serviceFeeCents: toCents(order.service_fee),
      isBulk: order.is_bulk === 1,
      contact: {
        firstName: clean(order.contact_first_name),
        lastName: clean(order.contact_last_name),
        email: clean(order.contact_email),
        phone: clean(order.contact_phone),
        department: clean(order.department),
      },
    },
    stamps: {
      received: toIso(details?.date_cls_received_all_items),
      submitted: toIso(details?.date_submitted_for_processing),
      completed: toIso(details?.date_completed_and_received_at_cls),
      closed: toIso(details?.date_order_on_route_and_closed),
    },
    voucher: {
      type: clean(catalogue?.type),
      name: clean(catalogue?.name),
      entryOption: clean(catalogue?.entry_option),
      processing: {
        column: details?.voucher_col ?? null,
        label: details?.voucher_col ? (PROCESSING_LABEL[details.voucher_col] ?? null) : null,
      },
      costCents: toCents(details?.voucher_col_cost),
      firstEntryDate: dateOnly(details?.first_entry_date),
      firstDepartureDate: dateOnly(details?.first_departure_date),
      doubleEntryDate: dateOnly(details?.double_entry_date),
      doubleDepartureDate: dateOnly(details?.double_departure_date),
      multipleEntryDate: dateOnly(details?.multiple_entry_date),
      multipleDepartureDate: dateOnly(details?.multiple_departure_date),
      listOfCities: clean(details?.list_of_cities),
      listOfHotels: clean(details?.list_of_hotels),
      visaAppliedAt: clean(details?.visa_applied_at),
      visaAppliedAtOptions: VISA_APPLIED_AT_OPTIONS,
      comment: clean(details?.comment),
      passportFile: {
        hasFile: passportFile !== null,
        name: passportFile ? path.basename(passportFile.replace(/\\/g, '/')) : null,
      },
      employment: {
        ...employment,
        provided: Object.values(employment).some((value) => value !== null),
      },
    },
    applicants: travellers.map((row) => ({
      id: row.id,
      isPrimary: row.is_primary === 1,
      title: clean(row.title),
      firstName: clean(row.first_name),
      middleName: clean(row.middle_name),
      lastName: clean(row.last_name),
      email: clean(row.email),
      phone: clean(row.phone),
      dateOfBirth: dateOnly(row.date_of_birth),
      passportNumber: clean(row.passport_number),
      gender: clean(row.gender),
      passportIssueDate: dateOnly(row.passport_issue_date),
      passportExpiryDate: dateOnly(row.passport_expiry_date),
      nationality: countryOf(row.nationality),
      citizenship: countryOf(row.citizenship),
      passportType: row.passport_type,
      occupation: clean(row.occupation),
      organisation: clean(row.organisation),
    })),
    documents: documents.map((row) => ({
      id: row.id,
      name: path.basename((clean(row.document) ?? `Document ${row.id}`).replace(/\\/g, '/')),
      status: row.status,
      uploadedAt: toIso(row.created),
    })),
    payment,
  };
};

export const russianVoucherOrderRoutes = (audit: VoucherAudit): Router => {
  const router = Router();

  router.get('/:id/voucher', idParams, async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    ok(res, { voucher: await buildScreen(await loadOrder(id)) });
  });

  /**
   * Order Progress → Submit: the four stamps, and which milestone moved.
   *
   * Nothing is written when no stamp differs from what is stored (a Submit with
   * nothing changed was a no-op that still emailed the client in legacy).
   */
  router.patch(
    '/:id/voucher/progress',
    idParams,
    validate(progressSchema),
    async (req: Request, res: Response) => {
      const { id } = validParams<{ id: number }>(req);
      const body = req.body as z.infer<typeof progressSchema>;

      const order = await loadOrder(id);
      const details = await loadDetails(id);

      // `null` = cleared, a string = a stamp, undefined = not sent.
      const submitted: Partial<Record<StampKey, string | null>> = {};
      for (const milestone of MILESTONES) {
        const raw = body[milestone.key];
        if (raw !== undefined) submitted[milestone.key] = parseStamp(raw) ?? null;
      }

      const picked = pickVoucherMilestone(details, submitted);

      const changes: Partial<Record<StampColumn, string | null>> = {};
      for (const milestone of MILESTONES) {
        const next = submitted[milestone.key];
        if (next === undefined) continue;
        if (normaliseStored(details[milestone.column]) !== next) {
          changes[milestone.column] = next;
        }
      }

      const closing = changes.date_order_on_route_and_closed;

      if (Object.keys(changes).length > 0) {
        await details.update(changes);

        // Newly setting the closed stamp closes the order, as legacy's
        // `$count_order_closed` did — but only on the save that sets it.
        if (typeof closing === 'string' && order.status !== CLS_ORDER_STATUS.CLS_CONFIRMED) {
          await order.update({
            status: CLS_ORDER_STATUS.CLS_CONFIRMED,
            date_last_saved: toLegacyDateTime(),
          });
        } else {
          await order.update({ date_last_saved: toLegacyDateTime() });
        }

        await audit(req, picked?.audit ?? 'voucher.updated', {
          orderId: id,
          changed: Object.keys(changes),
        });
      }

      const client = order.client_id ? await UserClient.findByPk(order.client_id) : null;

      ok(res, {
        saved: Object.keys(changes).length > 0,
        stamps: {
          received: toIso(details.date_cls_received_all_items),
          submitted: toIso(details.date_submitted_for_processing),
          completed: toIso(details.date_completed_and_received_at_cls),
          closed: toIso(details.date_order_on_route_and_closed),
        },
        notification: {
          scantype: picked?.scantype ?? '',
          orderNo: orderNoOf(order),
          reference: orderReference(id),
          // The legacy mailed the account's address and greeted the account holder.
          clientEmail: clean(client?.email) ?? clean(order.contact_email),
          clientFirstName: clean(client?.fname) ?? clean(order.contact_first_name),
        },
      });
    }
  );

  /**
   * The Passport File link: streams the stored scan, admin only.
   *
   * The API stores a full path relative to the upload root; the legacy admin read
   * `dev/rvv/{clientId}/{orderId}/{file}` (`attachment_url ~ 'dev/rvv/…'`), so both
   * are tried.
   */
  router.get('/:id/voucher/passport-file', idParams, async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const order = await loadOrder(id);
    const details = await loadDetails(id);

    const stored = clean(details.passport_file);
    if (!stored) throw notFound('No passport file has been uploaded for this order.');

    const opened =
      (await openDocument(stored)) ??
      (await openDocument(`dev/rvv/${order.client_id}/${id}/${stored}`));
    if (!opened) {
      throw notFound('We hold a record of that passport file but not the file itself.');
    }

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${path.basename(stored.replace(/\\/g, '/'))}"`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    streamDocument(opened, res, { orderId: id });
  });

  /** One of the files the client attached through the order journey. */
  router.get(
    '/:id/voucher/documents/:documentId/file',
    validate(z.object({ id: idParam, documentId: idParam }), 'params'),
    async (req: Request, res: Response) => {
      const { id, documentId } = validParams<{ id: number; documentId: number }>(req);
      await loadOrder(id);

      const row = await ClsOrderDocuments.findByPk(documentId);
      if (!row || row.order_id !== id) {
        throw notFound('We could not find that document on this order.');
      }

      const stored = clean(row.document);
      if (!stored) throw conflict('That document row has no file recorded.');

      const opened = await openDocument(stored);
      if (!opened) {
        throw notFound('We hold a record of that document but not the file itself.');
      }

      res.setHeader(
        'Content-Disposition',
        `inline; filename="${path.basename(stored.replace(/\\/g, '/'))}"`
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      streamDocument(opened, res, { orderId: id, documentId });
    }
  );

  return router;
};
