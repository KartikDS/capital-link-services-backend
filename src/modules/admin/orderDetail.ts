import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ClsOrder,
  ClsOrderDestinations,
  Countries,
  DocumentLegalizationOrderDetails,
  OrderCourierServiceDetails,
  OrderDlChecklist,
  OrderDocDeliveryDetails,
  OrderNotes,
  OrderReturnDocumentDetails,
  OrderTravellerDetails,
  Payment,
  PoliceClearanceOrderDetails,
  PoliceClearances,
  RussianVisaVoucherOrderDetails,
  RussianVisaVoucherTypes,
  UserAdmin,
  UserClient,
  VisaCourierOptions,
} from '../../models';
import {
  adminChecklistFileUpload,
  adminVoucherPassportFileUpload,
} from '../../middleware/upload';
import { ok } from '../../shared/http/responses';
import { badRequest, notFound } from '../../shared/errors';
import { toIso } from '../../shared/dates';
import { toCents } from '../../shared/money';
import { discardDocument, storedPathOf } from '../../shared/storage/documents';
import { clean } from '../../shared/text';
import { idParam, validate, validParams } from '../../shared/validation';
import { ORDER_TYPE } from '../../domain/codes';

/**
 * One order, with everything the legacy admin's order screen shows.
 *
 * ## Why this is not `/api/admin/orders?search=`
 *
 * Because that is the queue, and the back office was reading one row out of a
 * hundred-row page to render this screen — a hundred rows fetched, joined and
 * serialised to display one. This reads exactly one order and exactly the
 * satellite rows that order's service actually has.
 *
 * ## The response is shaped per service, and deliberately so
 *
 * The legacy `ViewOrder` templates are one file per service and they do not agree
 * about what an order is: a police clearance screen has four panels, a public
 * visa has thirteen, a voucher has an Employment Details panel nothing else has.
 * So the response carries a common core — the order, its progress, its contact,
 * its payment — plus a `detail` block whose shape depends on `service`.
 *
 * A caller renders the core the same way for every service and switches once on
 * `service` for the rest, which is what the old templates did in five files.
 *
 * ## Only the rows this order needs
 *
 * The per-service detail is read in a second query chosen by `order_type`, rather
 * than eagerly joining all five detail tables and discarding four. The
 * Ticket-panel notes, the document checklist and the courier catalogue lookup
 * are likewise only read for the services whose legacy templates use them.
 */

export const orderDetailRoutes = Router();

/** The four milestone columns, which every per-service detail table carries. */
interface MilestoneRow {
  date_cls_received_all_items?: string | null;
  date_submitted_for_processing?: string | null;
  date_completed_and_received_at_cls?: string | null;
  date_order_on_route_and_closed?: string | null;
}

const milestonesOf = (row: MilestoneRow | null) => ({
  received: toIso(row?.date_cls_received_all_items ?? null),
  submitted: toIso(row?.date_submitted_for_processing ?? null),
  completed: toIso(row?.date_completed_and_received_at_cls ?? null),
  closed: toIso(row?.date_order_on_route_and_closed ?? null),
});

/**
 * The visa milestone columns on `tbl_cls_order_destinations`, which are named
 * `visa_date_*` rather than `date_*` — a separate shape because the legacy
 * public-visa and document-legalisation templates stamp these per destination,
 * not on the service's own detail table.
 */
const visaMilestonesOf = (row: ClsOrderDestinations) => ({
  received: toIso(row.visa_date_cls_received_all_items),
  submitted: toIso(row.visa_date_submitted_for_processing),
  completed: toIso(row.visa_date_completed_and_received_at_cls),
  closed: toIso(row.visa_date_order_on_route_and_closed),
});

/**
 * The applicant panel, from the primary traveller row.
 *
 * Every field the legacy templates render, including the ones only some services
 * show — a caller renders what its service's panel had. Cheaper than five
 * near-identical shapes, and the row is read once either way.
 */
const travellerOf = (row: OrderTravellerDetails | null) =>
  row === null
    ? null
    : {
        title: clean(row.title),
        firstName: clean(row.first_name),
        middleName: clean(row.middle_name),
        lastName: clean(row.last_name),
        email: clean(row.email),
        phone: clean(row.phone),
        gender: clean(row.gender),
        dateOfBirth: toIso(row.date_of_birth),
        nationality: clean(row.nationality),
        citizenship: clean(row.citizenship),
        occupation: clean(row.occupation),
        organisation: clean(row.organisation),
        passportNumber: clean(row.passport_number),
        passportType: clean(row.passport_type),
        passportIssueDate: toIso(row.passport_issue_date),
        passportExpiryDate: toIso(row.passport_expiry_date),
        departureDate: toIso(row.departure_date),
        nearestCapitalCity: clean(row.nearest_capital_city),
      };

/** The "Document Details" / "Return Document Details" panel. */
const returnDocumentOf = (row: OrderReturnDocumentDetails | null) =>
  row === null
    ? null
    : {
        company: clean(row.company),
        address: clean(row.address),
        city: clean(row.city),
        state: clean(row.state),
        postcode: clean(row.postcode),
        countryId: row.country_id,
        firstName: clean(row.first_name),
        lastName: clean(row.last_name),
        contactNumber: clean(row.contact_number),
        email: clean(row.email),
        returningDate: toIso(row.returning_date),
        additionalComment: clean(row.additional_comment),
      };

/** The "Pick Up Details" panel — courier collection address for the sender. */
const courierPickupOf = (row: OrderCourierServiceDetails | null) =>
  row === null
    ? null
    : {
        company: clean(row.courier_pickup_company),
        firstName: clean(row.courier_pickup_first_name),
        lastName: clean(row.courier_pickup_last_name),
        email: clean(row.courier_pickup_email),
        contactNumber: clean(row.courier_pickup_contact_number),
        address: clean(row.courier_pickup_address),
        city: clean(row.courier_pickup_city),
        state: clean(row.courier_pickup_state),
        postcode: clean(row.courier_pickup_postcode),
        date: toIso(row.courier_pickup_date),
        readyHour: clean(row.courier_pickup_ready_by_time_hr),
        readyMinute: clean(row.courier_pickup_ready_by_time_min),
        closeHour: clean(row.courier_pickup_close_time_hr),
        closeMinute: clean(row.courier_pickup_close_time_min),
        additionalComment: clean(row.courier_pickup_additional_comment),
      };

/**
 * The "Ticket" panel + embassy tracking, from one `tbl_cls_order_destinations`
 * row.
 *
 * Document legalisation renders exactly one of these (the order's only
 * destination); public/plain visa renders one per destination, in a tab per
 * country. Both legacy templates read the same columns, so one mapper serves
 * both.
 */
const destinationOf = (row: ClsOrderDestinations & { country?: { country_name: string | null } }) => ({
  id: row.id,
  countryId: row.country_id,
  countryName: clean(row.country?.country_name),
  entryOption: row.entry_option,
  milestones: visaMilestonesOf(row),
  ticket: {
    shippedBy: clean(row.visa_shipped_by),
    // Inbound/outbound consignment numbers — named `comNoteIn`/`comNoteNo` to
    // match the legacy field names exactly (`visa_com_note_no` is outbound,
    // despite the name).
    comNoteIn: clean(row.visa_com_note_in),
    comNoteNo: clean(row.visa_com_note_no),
    invoiceNo: clean(row.visa_invoice_no),
    signature: clean(row.signature),
    signeeName: clean(row.sig_name),
    followUpDate: toIso(row.visa_follow_up_date),
  },
  dhl: {
    confirmationNumber: clean(row.dhl_confirmation_number),
    airwaybillNumber: clean(row.dhl_airwaybill_number),
    returnConfirmationNumber: clean(row.return_dhl_confirmation_number),
    returnAirwaybillNumber: clean(row.return_dhl_airwaybill_number),
  },
});

/**
 * Groups the document-type/location/price/status tracking rows in
 * `tbl_order_notes` by `document_type` — the "Add new type of comment"
 * mechanism on the document-legalisation and public-visa screens.
 *
 * This is a *different* feature from the invoice-line quotes in
 * `tbl_order_dl_quotes` (see `POST /orders/:reference/quote`): this one tracks
 * where each physical document currently is (Translator, Notary, Embassy, …)
 * and what it costs, not what the client is billed.
 */
const documentTrackingOf = (rows: OrderNotes[]) => {
  const byType = new Map<string, OrderNotes[]>();
  for (const row of rows) {
    const type = clean(row.document_type);
    if (!type) continue;
    const bucket = byType.get(type) ?? [];
    bucket.push(row);
    byType.set(type, bucket);
  }
  return [...byType.entries()].map(([documentType, entries]) => {
    const latest = entries[entries.length - 1] as OrderNotes;
    return {
      documentType,
      location: clean(latest.location),
      price: latest.price,
      status: clean(latest.status),
      history: entries
        .filter((row) => row.is_admin === 1)
        .map((row) => ({
          id: row.id,
          location: clean(row.location),
          price: row.price,
          status: clean(row.status),
          noteByName: clean(row.note_by_name),
          dateAdded: toIso(row.date_added),
        })),
    };
  });
};

/** One row of `tbl_order_dl_checklist` — the Document Checklist panel. */
const checklistRowOf = (row: OrderDlChecklist) => ({
  id: row.id,
  type: clean(row.type),
  number: row.number,
  note: clean(row.note),
  hasFile: Boolean(clean(row.doc_file)),
});

/** The services whose legacy templates carry a Ticket panel and embassy tracking. */
const HAS_TICKET_PANEL = new Set<number>([
  ORDER_TYPE.DOCUMENT_LEGALISATION,
  ORDER_TYPE.VISA,
  ORDER_TYPE.PUBLIC_VISA,
]);

/**
 * GET /api/admin/orders/:id/detail
 *
 * Mounted under `/orders/:id/detail` rather than at `/orders/:id`, because the
 * queue already owns `/orders` and a bare `/orders/:id` there would be read as a
 * row from it. The suffix says what this is: the whole record, not the row.
 */
orderDetailRoutes.get(
  '/:id/detail',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);

    const order = await ClsOrder.findByPk(id, {
      include: [
        { model: Countries, as: 'destinationCountry', required: false },
        { model: UserClient, as: 'client', required: false },
        { model: PoliceClearances, as: 'clearanceType', required: false },
        {
          model: RussianVisaVoucherTypes,
          as: 'voucherCatalogue',
          required: false,
        },
        {
          model: ClsOrderDestinations,
          as: 'destinations',
          required: false,
          include: [{ model: Countries, as: 'country', required: false }],
        },
        { model: OrderCourierServiceDetails, as: 'courierDetails', required: false },
      ],
    });

    if (!order) throw notFound('We could not find that order.');

    const wide = order as unknown as {
      destinationCountry?: { country_name: string | null; country_name_display: string | null };
      client?: { display_id: string | null; email: string | null; company: string | null };
      clearanceType?: { name: string | null };
      voucherCatalogue?: { type: string | null; name: string | null };
      destinations?: (ClsOrderDestinations & {
        country?: { country_name: string | null };
      })[];
      courierDetails?: OrderCourierServiceDetails[];
    };

    const service = order.order_type;
    const showTicketPanel = service !== null && HAS_TICKET_PANEL.has(service);
    const showCourier =
      service === ORDER_TYPE.DOCUMENT_DELIVERY || order.courier_service_id === 14;

    /**
     * The satellite rows, chosen by service.
     *
     * The traveller and the return-document rows are read for every service
     * because every legacy template renders at least part of one or the other.
     * The notes, checklist and courier catalogue reads are gated on the
     * service, because only some templates have those panels.
     */
    const [
      traveller,
      allTravellers,
      returnDocument,
      payment,
      consultant,
      notes,
      checklist,
      courierOption,
    ] = await Promise.all([
      OrderTravellerDetails.findOne({
        where: { order_id: id, is_primary: 1 },
      }),
      service === ORDER_TYPE.VISA || service === ORDER_TYPE.PUBLIC_VISA
        ? OrderTravellerDetails.findAll({ where: { order_id: id } })
        : Promise.resolve([]),
      OrderReturnDocumentDetails.findOne({ where: { order_id: id } }),
      // The order's own payment row, by the order number the payment table keys
      // on. Newest first: a re-attempted payment writes a second row and the
      // latest is the one that settled.
      order.order_no
        ? Payment.findOne({
            where: { order_no: Number.parseInt(String(order.id), 10) },
            order: [['date_paid', 'DESC']],
          })
        : Promise.resolve(null),
      order.visa_cls_team_member
        ? UserAdmin.findByPk(order.visa_cls_team_member)
        : Promise.resolve(null),
      // Only for the document-type/location/price/status tracker — the general
      // comment thread is already `GET /orders/:reference/notes`, which reads
      // every row unfiltered; this query exists so the tracker can group just
      // the rows that carry a `document_type`.
      //
      // `tbl_order_notes.order_no` is an int with no real foreign key — for
      // orders in this (newer) family the legacy admin writes the
      // `tbl_cls_order.id` straight into it, exactly like the payment lookup
      // above, so this is a direct query rather than the model's association
      // (which points at the older `tbl_orders` family instead).
      showTicketPanel
        ? OrderNotes.findAll({
            where: { order_no: id, is_deleted: 0 },
            order: [['id', 'ASC']],
          })
        : Promise.resolve([]),
      service === ORDER_TYPE.DOCUMENT_LEGALISATION
        ? OrderDlChecklist.findAll({ where: { order_no: id }, order: [['id', 'ASC']] })
        : Promise.resolve([]),
      order.courier_service_id
        ? VisaCourierOptions.findByPk(order.courier_service_id)
        : Promise.resolve(null),
    ]);

    /**
     * The per-service detail row, and the milestones that live on it.
     *
     * One query, chosen by `order_type` — not four joins with three discarded.
     * A service with no detail table of its own (a plain visa) simply has none,
     * and its milestones come back all-null, which is what an unstamped order is.
     */
    const detailRow =
      service === ORDER_TYPE.POLICE_CLEARANCE
        ? await PoliceClearanceOrderDetails.findOne({ where: { order_id: id } })
        : service === ORDER_TYPE.RUSSIAN_VISA_VOUCHER
          ? await RussianVisaVoucherOrderDetails.findOne({ where: { order_id: id } })
          : service === ORDER_TYPE.DOCUMENT_LEGALISATION
            ? await DocumentLegalizationOrderDetails.findOne({ where: { order_id: id } })
            : service === ORDER_TYPE.DOCUMENT_DELIVERY
              ? await OrderDocDeliveryDetails.findOne({ where: { order_id: id } })
              : null;

    /** The service-specific panels, keyed to what each legacy template renders. */
    const detail =
      service === ORDER_TYPE.POLICE_CLEARANCE
        ? {
            clearanceType: clean(wide.clearanceType?.name),
            clearancePriceCents: toCents(
              (detailRow as PoliceClearanceOrderDetails | null)?.clearance_price ?? null
            ),
            basicAdditionalPriceCents: toCents(
              (detailRow as PoliceClearanceOrderDetails | null)?.basic_additional_price ?? null
            ),
            clearanceAdditionalPriceCents: toCents(
              (detailRow as PoliceClearanceOrderDetails | null)?.clearance_additional_price ??
                null
            ),
          }
        : service === ORDER_TYPE.RUSSIAN_VISA_VOUCHER
          ? (() => {
              const row = detailRow as RussianVisaVoucherOrderDetails | null;
              return {
                voucherType: clean(wide.voucherCatalogue?.type),
                voucher: clean(wide.voucherCatalogue?.name),
                voucherColumn: clean(row?.voucher_col),
                voucherCostCents: toCents(row?.voucher_col_cost ?? null),
                firstEntryDate: toIso(row?.first_entry_date ?? null),
                firstDepartureDate: toIso(row?.first_departure_date ?? null),
                doubleEntryDate: toIso(row?.double_entry_date ?? null),
                doubleDepartureDate: toIso(row?.double_departure_date ?? null),
                multipleEntryDate: toIso(row?.multiple_entry_date ?? null),
                multipleDepartureDate: toIso(row?.multiple_departure_date ?? null),
                listOfCities: clean(row?.list_of_cities),
                listOfHotels: clean(row?.list_of_hotels),
                visaAppliedAt: clean(row?.visa_applied_at),
                comment: clean(row?.comment),
                // The one file this service's legacy screen links but the rest
                // of the admin API doesn't otherwise expose.
                hasPassportFile: Boolean(clean(row?.passport_file)),
                // The Employment Details panel, which only this service has.
                employment: {
                  company: clean(row?.company),
                  position: clean(row?.position),
                  address: clean(row?.address),
                  city: clean(row?.city),
                  state: clean(row?.state),
                  postcode: clean(row?.postcode),
                  countryId: row?.country_id ?? null,
                  phone: clean(row?.company_phone),
                },
              };
            })()
          : service === ORDER_TYPE.DOCUMENT_LEGALISATION
            ? (() => {
                const row = detailRow as DocumentLegalizationOrderDetails | null;
                return {
                  typeOfDocument: row?.type_of_document ?? null,
                  invoiceNo: clean(row?.com_invoice_no),
                  referenceNo: clean(row?.ref_no),
                  nationalityId: row?.nationality ?? null,
                  // The Document Checklist panel — one row per document the
                  // client must supply, independent of the invoice-line quotes.
                  checklist: checklist.map(checklistRowOf),
                  // The "Add new type of comment" tracker: where each document
                  // currently sits (Translator, Notary, Embassy, …) and its fee.
                  documentTracking: documentTrackingOf(notes),
                };
              })()
            : service === ORDER_TYPE.DOCUMENT_DELIVERY
              ? (() => {
                  const row = detailRow as OrderDocDeliveryDetails | null;
                  return {
                    securityNumber: clean(row?.secuirity_number),
                    serviceCode: clean(row?.service_code),
                    referenceNo: clean(row?.ref_no),
                    courierType: clean(courierOption?.type),
                    // Pick Up Details — the courier's collection address.
                    pickupAddress: courierPickupOf(wide.courierDetails?.[0] ?? null),
                    pickup: {
                      contactName: clean(row?.contact_name),
                      contactArea: clean(row?.contact_area),
                      date: toIso(row?.package_pickup_date ?? null),
                      readyHour: row?.package_ready_time_by_hr ?? null,
                      readyMinute: row?.package_ready_time_by_min ?? null,
                      readyAmPm: clean(row?.package_ready_time_by_am_pm),
                      closeHour: row?.package_close_time_by_hr ?? null,
                      closeMinute: row?.package_close_time_by_min ?? null,
                      closeAmPm: clean(row?.package_close_time_by_am_pm),
                    },
                    // Delivery Details
                    delivery: {
                      receiverContactName: clean(row?.receiver_contact_name),
                      receiverContactArea: clean(row?.receiver_contact_area),
                      primaryRecipientName: clean(row?.primary_receipient_name),
                      primaryRecipientArea: clean(row?.primary_receipient_area),
                      primaryRecipientEmail: clean(row?.primary_receipient_email),
                      primaryRecipientContactNo: clean(
                        row?.primary_receipient_contact_no
                      ),
                      alternativeFirstName: clean(
                        row?.alternative_receipient_name_first
                      ),
                      alternativeFirstArea: clean(
                        row?.alternative_receipient_area_first
                      ),
                      alternativeFirstPhone: clean(
                        row?.alternative_receipient_phone_first
                      ),
                      alternativeSecondName: clean(
                        row?.alternative_receipient_name_second
                      ),
                      alternativeSecondArea: clean(
                        row?.alternative_receipient_area_second
                      ),
                      alternativeSecondPhone: clean(
                        row?.alternative_receipient_phone_second
                      ),
                      deliveredToEmbassy: row?.is_delivered_to_embassy === 1,
                      deliveredToEmbassyDate: toIso(
                        row?.delivered_to_embassy_date ?? null
                      ),
                    },
                    // Package Details
                    package: {
                      totalPieces: row?.package_total_pieces ?? null,
                      weight: row?.package_weight ?? null,
                      weightPriceCents: toCents(row?.package_weight_price ?? null),
                      extraWeight: row?.package_extra_weight ?? null,
                      extraWeightPriceCents: toCents(
                        row?.package_extra_weight_price ?? null
                      ),
                      totalWeightPriceCents: toCents(
                        row?.package_total_weight_price ?? null
                      ),
                      condition: clean(row?.package_condition),
                      comment: clean(row?.comment),
                    },
                  };
                })()
              : service === ORDER_TYPE.VISA || service === ORDER_TYPE.PUBLIC_VISA
                ? {
                    courierType: clean(courierOption?.type),
                    travellers: allTravellers.map((row) => ({
                      ...travellerOf(row),
                      isClient: row.is_client === 1,
                      isPrimary: row.is_primary === 1,
                    })),
                    pickupAddress: showCourier
                      ? courierPickupOf(wide.courierDetails?.[0] ?? null)
                      : null,
                    // The document-type/location/price/status tracker — the
                    // same mechanism document legalisation uses.
                    documentTracking: documentTrackingOf(notes),
                  }
                : null;

    ok(res, {
      order: {
        id: order.id,
        reference: clean(order.order_no) ?? String(order.id),
        orderType: order.order_type,
        status: order.status,
        clientId: order.client_id,
        accountNumber: clean(wide.client?.display_id),
        isBulk: order.is_bulk === 1,
        contact: {
          firstName: clean(order.contact_first_name),
          lastName: clean(order.contact_last_name),
          email: clean(order.contact_email),
          phone: clean(order.contact_phone),
        },
        destination: clean(wide.destinationCountry?.country_name),
        destinationDisplay: clean(wide.destinationCountry?.country_name_display),
        applicants: order.no_of_traveller,
        departureDate: toIso(order.departure_date),
        totalFeeCents: toCents(order.total_fee),
        dateSubmitted: toIso(order.date_submitted),
        consultant: consultant
          ? {
              id: consultant.id,
              name: clean(
                [consultant.fname, consultant.lname].filter(Boolean).join(' ')
              ),
            }
          : null,
        // The embassy-tracking strip every Ticket-panel screen shows below the
        // per-destination cards: which team member owns it, whether it has
        // reached the embassy, and the address-confirmation banner.
        embassy: showTicketPanel
          ? {
              deliveredToEmbassy: order.visa_is_delivered_to_embassy === 1,
              deliveredToEmbassyDate: toIso(order.visa_is_delivered_to_embassy_date),
              nextEmbassy: clean(order.visa_next_embassy),
              addressConfirmed: order.is_address_confirmed === 1,
            }
          : null,
      },
      // The four dates the Order Progress panel shows, and the client's tracker
      // is counted from. All null on a service with no detail table.
      milestones: milestonesOf(detailRow as MilestoneRow | null),
      // The Ticket panel(s) — one destination for document legalisation, one per
      // country for a (possibly bulk) visa order. Empty for the services whose
      // legacy screens never had one (police clearance, Russian voucher).
      destinations: showTicketPanel ? (wide.destinations ?? []).map(destinationOf) : [],
      applicant: travellerOf(traveller),
      returnDocument: returnDocumentOf(returnDocument),
      payment: payment
        ? {
            id: payment.id,
            transactionId: clean(payment.transaction_id),
            paidAt: toIso(payment.date_paid),
            totalCents: toCents(payment.total_order_price),
            // `s_paid` — 0 pending, 1 online, 2 by account. The Payment Status
            // dropdown on the legacy screen reads this column, not
            // `tbl_cls_order.status`.
            paidVia: payment.s_paid,
            paymentStatus: payment.payment_status,
            accountNo: clean(payment.account_no),
            cardType: clean(payment.card_type),
            // The "Your Details" panel on document delivery, and the Payment
            // Details panel on public visa — the same payer record either way.
            payer: {
              firstName: clean(payment.fname),
              lastName: clean(payment.lname),
              email: clean(payment.email),
              phone: clean(payment.phone),
              mobile: clean(payment.mobile),
              address: clean(payment.address),
            },
            // The Billing Details panel, shown only when a manual bank/account
            // payment actually recorded one — most orders have none.
            billing: clean(payment.mba_address)
              ? {
                  organisationName: clean(payment.mba_organisation_name),
                  firstName: clean(payment.mba_fname),
                  lastName: clean(payment.mba_lname),
                  address: clean(payment.mba_address),
                  city: clean(payment.mba_city),
                  state: clean(payment.mba_state),
                  postcode: clean(payment.mba_postcode),
                  countryId: payment.mba_country_id,
                }
              : null,
          }
        : null,
      detail,
    });
  }
);

/**
 * PATCH /api/admin/orders/:id/checklist/:checklistId/file
 *
 * Replaces a Document Checklist row's file — `tbl_order_dl_checklist` has no
 * `order_no` foreign key constraint, so `:id` is checked against the row's
 * own `order_no` rather than trusted from the URL alone.
 */
orderDetailRoutes.patch(
  '/:id/checklist/:checklistId/file',
  validate(z.object({ id: idParam, checklistId: idParam }), 'params'),
  adminChecklistFileUpload,
  async (req: Request, res: Response) => {
    const { id, checklistId } = validParams<{ id: number; checklistId: number }>(
      req
    );
    if (!req.file) throw badRequest('Attach a file.');

    const row = await OrderDlChecklist.findByPk(checklistId);
    if (!row || row.order_no !== id) {
      throw notFound('We could not find that checklist row.');
    }

    const previous = clean(row.doc_file);
    await row.update({ doc_file: storedPathOf(req.file) });
    if (previous) void discardDocument(previous);

    ok(res, { checklist: checklistRowOf(row) });
  }
);

/**
 * PATCH /api/admin/orders/:id/voucher/passport-file
 *
 * Replaces the passport scan on a Russian visa voucher order — the one file
 * that service's legacy screen links but the read side of this API only
 * ever flagged as present, not exposed for writing (see the note in the
 * `detail` block below on `hasPassportFile`).
 */
orderDetailRoutes.patch(
  '/:id/voucher/passport-file',
  validate(z.object({ id: idParam }), 'params'),
  adminVoucherPassportFileUpload,
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    if (!req.file) throw badRequest('Attach a file.');

    const row = await RussianVisaVoucherOrderDetails.findOne({
      where: { order_id: id },
    });
    if (!row) throw notFound('We could not find that order’s voucher details.');

    const previous = clean(row.passport_file);
    await row.update({ passport_file: storedPathOf(req.file) });
    if (previous) void discardDocument(previous);

    ok(res, { hasPassportFile: true });
  }
);
