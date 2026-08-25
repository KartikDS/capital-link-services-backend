import type { Transaction } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  ClsOrder,
  ClsOrderDestinations,
  DocumentLegalizationOrderDetails,
  OrderCourierServiceDetails,
  OrderDlChecklist,
  OrderNotes,
  OrderReturnDocumentDetails,
  OrderTravellerDetails,
  PoliceClearanceOrderDetails,
  RussianVisaVoucherOrderDetails,
} from '../../models';
import { findClientByEmail } from '../auth/auth.repository';
import { dateOnlyForWrite, toLegacyDateTime } from '../../shared/dates';
import { centsToLegacyString } from '../../shared/money';
import { clean } from '../../shared/text';
import { logger } from '../../shared/logger';
import {
  CLS_ORDER_STATUS,
  ORDER_CONTACT,
  ORDER_TYPE,
  PAYMENT_STATUS,
  type OrderTypeCode,
} from '../../domain/codes';
import { materialiseChecklistQuietly } from '../../domain/checklist';
import {
  quoteClearance,
  quoteLegalisation,
  quoteOnApplication,
  quoteVisa,
  quoteVoucher,
  type Quote,
  type VoucherTier,
} from '../../domain/quotes';
import { orderReference } from '../../domain/orderReference';

/**
 * Lodging a new order into the legacy tables.
 *
 * Everything here writes to `tbl_cls_order` and its `order_id` satellites — the
 * newer family — because that is the generation with per-service detail tables
 * and the one a new order belongs in. Nothing writes to `tbl_orders`: adding a
 * row to a 145-column table whose meaning depends on which of nine services it
 * is would mean this code deciding what forty unrelated columns should hold.
 *
 * ## Three things every lodgement does
 *
 * **Prices server-side.** The request names catalogue ids; the amount comes from
 * `domain/quotes`. A payload cannot state its own total.
 *
 * **Writes in a transaction.** `tbl_cls_order` and its satellites are all
 * InnoDB, so an order and its applicants either both land or neither does. This
 * is deliberately the only part of the API that relies on that — the note and
 * clearance tables are MyISAM and cannot participate, which is why nothing here
 * touches them.
 *
 * **Writes local Sydney time.** Via `toLegacyDateTime`, so a row this API
 * inserts is indistinguishable from one the old application inserted and the
 * old admin screens show it at the right time of day.
 *
 * ## The reference
 *
 * There is no sequence behind `order_no` and nothing unique about it, so the
 * order's identity is the auto-increment `id` and the client's reference is
 * derived from it — `orderReference` in `domain/orderReference`, which is also
 * where the reason `order_no` holds the id rather than the reference is written
 * down. In short: CLS's own admin reads that column as an id, and an order it
 * cannot open is worse than a column that repeats the primary key.
 */

export interface ApplicantInput {
  title?: string | null;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  nationalityId?: number | null;
  passportNumber?: string | null;
  passportType?: number | null;
  passportIssueDate?: string | null;
  passportExpiryDate?: string | null;
  gender?: string | null;
  occupation?: string | null;
  organisation?: string | null;
  departureDate?: string | null;
}

export interface ContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  department?: string | null;
}

export interface ReturnAddressInput {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  countryId?: number | null;
  returningDate?: string | null;
  comment?: string | null;
}

interface OrderHeaderInput {
  clientId: number | null;
  orderType: OrderTypeCode;
  /**
   * Whether this lodgement is the client's final act on the order.
   *
   * `tbl_cls_order.status` is `0` until the order is placed and non-zero after —
   * see `CLS_ORDER_STATUS`. The old application splits that across two screens:
   * the details step writes `0`, and the place-order step writes `1` once the
   * payment has gone through.
   *
   * Our journeys divide the same way, just not across two requests. A clearance
   * or a voucher is lodged *before* Stripe, so it stays at `0` until
   * `payments/record` moves it — exactly what the old flow does. An attestation
   * or a corporate visa is quoted rather than charged, so lodging it is the
   * place-order step and there is nothing to wait for.
   *
   * Leaving a quoted order at `0` would read to CLS's own screens as a basket
   * somebody abandoned.
   */
  placed: boolean;
  contact: ContactInput;
  destinationCountryId?: number | null;
  departureDate?: string | null;
  applicants: readonly ApplicantInput[];
  courierOptionId?: number | null;
  quote: Quote;
}

/**
 * The account an order belongs to.
 *
 * `input.clientId` when the client was signed in, and that is the end of it.
 * When it is null the order came through a guest checkout — the clearance,
 * voucher and attestation journeys are all open to visitors — and this looks for
 * an enabled account whose email is the one the client typed into the order's own
 * contact field. If there is one, the order is attached to it.
 *
 * **Why this is the right link to make.** Without it a guest order is invisible
 * for good: `client_id` stays null, the portal filters on `client_id`, and a
 * client who ordered before signing in is told they have no orders. The contact
 * email is not a guess at who they are — it is the address they gave as the
 * order's contact, the address the confirmation is sent to, and the address the
 * public tracking screen already authorises on. So the account holder can
 * already read this order in their inbox; showing it in their portal discloses
 * nothing new.
 *
 * A miss leaves `client_id` null, which is still a real order: it has a contact
 * address, it appears in CLS's own screens, and a consultant can link it.
 */
const ownerFor = async (input: OrderHeaderInput): Promise<number | null> => {
  if (input.clientId !== null) return input.clientId;

  const matched = await findClientByEmail(input.contact.email);

  if (!matched) return null;

  logger.info('Guest order linked to an account by its contact email', {
    clientId: matched.id,
    orderType: input.orderType,
  });

  return matched.id;
};

/**
 * Creates the `tbl_cls_order` row and gives it its reference.
 *
 * `status` follows `input.placed` — `PENDING` for an order still waiting on a
 * payment, `COMPLETED` (which this schema means as "placed by the client") for
 * one that is final on lodgement. See the field's own note.
 *
 * `payment_status` is always `FAILED`, which is this schema's zero and means "not
 * paid" rather than "a payment failed". That is what the old application sets on
 * a fresh order, and `payments/record` moves it when money actually arrives.
 */
const createHeader = async (
  input: OrderHeaderInput,
  transaction: Transaction
): Promise<ClsOrder> => {
  const now = toLegacyDateTime();

  const order = await ClsOrder.create(
    {
      client_id: await ownerFor(input),
      order_type: input.orderType,
      destination: input.destinationCountryId ?? null,
      departure_date: dateOnlyForWrite(input.departureDate),
      no_of_traveller: input.applicants.length,
      courier_service_id: input.courierOptionId ?? null,

      // Every fee column is a varchar in this table, so amounts are written as
      // `'450.00'` — the format the old application's own writes use and its
      // screens parse back.
      total_fee: centsToLegacyString(
        input.quote.quoteRequired ? null : input.quote.totalCents
      ),
      service_fee: centsToLegacyString(
        input.quote.quoteRequired ? null : input.quote.subtotalCents
      ),

      order_contact_option: ORDER_CONTACT.ORDER_CONTACT,
      contact_first_name: input.contact.firstName,
      contact_last_name: input.contact.lastName,
      contact_email: input.contact.email,
      contact_phone: clean(input.contact.phone),
      department: clean(input.contact.department),

      status: input.placed ? CLS_ORDER_STATUS.COMPLETED : CLS_ORDER_STATUS.PENDING,
      payment_status: PAYMENT_STATUS.FAILED,
      is_bulk: 0,
      is_address_confirmed: 0,
      date_last_saved: now,
      date_submitted: now,
      // Placeholder: replaced below, once the auto-increment id is known.
      order_no: '',
    },
    { transaction }
  );

  /**
   * The id, written back into `order_no` now that the insert has produced one.
   *
   * Not the client's reference, which is what this used to write. CLS's admin
   * treats this column as an order id — its voucher queue links its View button
   * with `order_id=` this value and the view behind it looks the order up by
   * primary key — so a `'CLS-000010'` here is a link to nothing, and their staff
   * could not open a paid order. See `domain/orderReference`.
   */
  await order.update({ order_no: String(order.id) }, { transaction });

  await createCourierDetails(order, input, transaction);

  return order;
};

/**
 * The courier row, when the client chose a courier.
 *
 * `courier_service_id` on the order header names the product; this table is what
 * the old admin's courier tab actually reads, and it looks the row up by
 * `order_id` alone. `VisaInformationController.php:755` upserts one on every
 * save, so an order with a courier has always had one.
 *
 * It is written thin, and that is honest rather than lazy: the pickup columns —
 * date, ready and close times, the pickup contact and address — are collected by
 * the old application's own courier step, and none of the website's journeys ask
 * for them. Writing the row with what we do know means the tab finds a courier
 * instead of a null, and a consultant fills the pickup in when they book it.
 *
 * Skipped entirely when no courier was chosen, rather than written empty: a row
 * here is what "this order has a courier" means.
 */
const createCourierDetails = async (
  order: ClsOrder,
  input: OrderHeaderInput,
  transaction: Transaction
): Promise<void> => {
  if (!input.courierOptionId) return;

  await OrderCourierServiceDetails.create(
    {
      order_id: order.id,
      courier_service_id: input.courierOptionId,
      country_id: input.destinationCountryId ?? null,
    },
    { transaction }
  );
};

/** Writes the applicants. The first is marked primary, as the old admin expects. */
const createApplicants = async (
  orderId: number,
  applicants: readonly ApplicantInput[],
  transaction: Transaction
): Promise<void> => {
  await Promise.all(
    applicants.map((applicant, index) =>
      OrderTravellerDetails.create(
        {
          order_id: orderId,
          title: clean(applicant.title),
          first_name: applicant.firstName,
          middle_name: clean(applicant.middleName),
          last_name: applicant.lastName,
          email: clean(applicant.email),
          phone: clean(applicant.phone),
          date_of_birth: dateOnlyForWrite(applicant.dateOfBirth),
          nationality: applicant.nationalityId ?? null,
          citizenship: applicant.nationalityId ?? null,
          passport_number: clean(applicant.passportNumber),
          passport_type: applicant.passportType ?? null,
          passport_issue_date: dateOnlyForWrite(applicant.passportIssueDate),
          passport_expiry_date: dateOnlyForWrite(applicant.passportExpiryDate),
          gender: clean(applicant.gender),
          occupation: clean(applicant.occupation),
          organisation: clean(applicant.organisation),
          departure_date: dateOnlyForWrite(applicant.departureDate),
          is_primary: index === 0 ? 1 : 0,
          is_client: 0,
          status: 1,
        },
        { transaction }
      )
    )
  );
};

/** The return address, where the finished documents are couriered. */
const createReturnAddress = async (
  orderId: number,
  address: ReturnAddressInput | undefined,
  transaction: Transaction
): Promise<void> => {
  if (!address) return;

  await OrderReturnDocumentDetails.create(
    {
      order_id: orderId,
      first_name: clean(address.firstName),
      last_name: clean(address.lastName),
      email: clean(address.email),
      contact_number: clean(address.phone),
      company: clean(address.company),
      address: clean(address.address),
      city: clean(address.city),
      state: clean(address.state),
      country_id: address.countryId ?? null,
      postcode: clean(address.postcode),
      returning_date: dateOnlyForWrite(address.returningDate),
      additional_comment: clean(address.comment),
      status: 1,
    },
    { transaction }
  );
};

/**
 * Writes what the order says in words to `tbl_order_notes`.
 *
 * **Outside the transaction, and that is not an oversight.** `tbl_order_notes`
 * is MyISAM, so it cannot join one — a rollback would leave the note behind. It
 * is written after the commit instead, and a failure is logged rather than
 * raised: the order itself is already safely stored, and losing the order
 * because the note table was unavailable would be the worse trade.
 *
 * `order_no` is the order's id. That column is an int and a `tbl_cls_order`
 * reference is TEXT, so the id is the only value the two families' notes can
 * share — and it is already what `orders.service` reads notes back by.
 *
 * Not marked `is_admin`: this is the client's own account of their order, so
 * they see it on the order in their portal alongside the consultant's replies.
 */
const recordOrderNote = async (
  orderId: number,
  note: string | null | undefined
): Promise<void> => {
  const body = clean(note);
  if (!body) return;

  try {
    await OrderNotes.create({
      order_no: orderId,
      note: body,
      date_added: toLegacyDateTime(),
      note_by_name: 'Website order form',
      user_type: 'client',
      is_admin: 0,
      is_deleted: 0,
    });
  } catch (error) {
    logger.error('Order lodged but its note could not be written', {
      orderId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export interface LodgedOrder {
  reference: string;
  orderId: number;
  quote: Quote;
}

const finish = (order: ClsOrder, quote: Quote): LodgedOrder => {
  const reference = orderReference(order.id);

  logger.info('Order lodged', {
    orderId: order.id,
    reference,
    orderType: order.order_type,
    totalCents: quote.quoteRequired ? null : quote.totalCents,
  });

  return { reference, orderId: order.id, quote };
};

// ---------------------------------------------------------------------------
// Police clearance
// ---------------------------------------------------------------------------

export interface ClearanceOrderInput {
  clientId: number | null;
  clearanceId: number;
  contact: ContactInput;
  applicants: readonly ApplicantInput[];
  countryId?: number | null;
  departureDate?: string | null;
  courierOptionId?: number | null;
  returnAddress?: ReturnAddressInput;
  /** The answers with no column of their own. Written to `tbl_order_notes`. */
  notes?: string | null;
}

export const lodgeClearanceOrder = async (
  input: ClearanceOrderInput
): Promise<LodgedOrder> => {
  const quote = await quoteClearance({
    clearanceId: input.clearanceId,
    applicants: input.applicants.length,
    courierOptionId: input.courierOptionId,
  });

  return sequelize
    .transaction(async (transaction) => {
      const order = await createHeader(
        {
          clientId: input.clientId,
          orderType: ORDER_TYPE.POLICE_CLEARANCE,
          // Charged online: the payment moves it to placed.
          placed: false,
          contact: input.contact,
          destinationCountryId: input.countryId,
          departureDate: input.departureDate,
          applicants: input.applicants,
          courierOptionId: input.courierOptionId,
          quote,
        },
        transaction
      );

      await order.update({ police_clearance_id: input.clearanceId }, { transaction });

      const [first, additional] = [quote.lines[0], quote.lines[1]];

      await PoliceClearanceOrderDetails.create(
        {
          order_id: order.id,
          police_clearance_id: input.clearanceId,
          clearance_price: centsToLegacyString(first?.totalCents ?? null),
          basic_additional_price: centsToLegacyString(additional?.unitCents ?? null),
          clearance_additional_price: centsToLegacyString(additional?.totalCents ?? null),
          /**
           * `0` here, unlike its sibling detail tables — deliberately.
           *
           * The DL and voucher detail rows are written `1` because their readers
           * filter on it. `ApplicationPoliceClearanceController` never sets this
           * column at all, and no reader filters on it, so there is no `1` to
           * match. Left explicit so it does not read as an oversight next to the
           * two rows above it.
           */
          status: 0,
        },
        { transaction }
      );

      await createApplicants(order.id, input.applicants, transaction);
      await createReturnAddress(order.id, input.returnAddress, transaction);

      return finish(order, quote);
    })
    .then(async (lodged) => {
      // After the commit: see `recordOrderNote` for why this cannot be inside it.
      await recordOrderNote(lodged.orderId, input.notes);
      return lodged;
    });
};

// ---------------------------------------------------------------------------
// Russian visa voucher
// ---------------------------------------------------------------------------

export interface VoucherOrderInput {
  clientId: number | null;
  voucherTypeId: number;
  tier: VoucherTier;
  contact: ContactInput;
  applicants: readonly ApplicantInput[];
  entryDate?: string | null;
  departureDate?: string | null;
  /**
   * The second visit, for a voucher raised on more than one entry.
   *
   * Written whether or not the plan says it should be: the website only collects
   * a second pair where the voucher has one, and a date the client gave is not
   * something to drop on a guess about which plan they bought.
   */
  secondEntryDate?: string | null;
  secondDepartureDate?: string | null;
  cities?: string | null;
  hotels?: string | null;
  appliedAt?: string | null;
  employer?: {
    company?: string | null;
    position?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    postcode?: string | null;
    countryId?: number | null;
  };
  comment?: string | null;
  courierOptionId?: number | null;
}

/**
 * `voucher_col`, numbered as the old application numbers the fee columns.
 *
 * Not the order the API lists the tiers in. The number is the value of the radio
 * on the old voucher form, which draws the invitation table's three speeds first
 * and the business table's two after them: `RussianVisaVoucher/step_three.html.twig`
 * writes `id:1` to `id:5` for 3 days, 1-2 days, 12 hours, 13 days and 4 days, and
 * reads the same numbers back to re-check the radio on a saved order.
 *
 * Taking the tier's position in `VOUCHER_TIER_IDS` instead — the schema's column
 * order, which starts at `thirteen_days` — wrote a 13-day order as `1`, and `1` is
 * the number that form reads as "3 days processing". A consultant reading the
 * order back saw a turnaround the client never bought.
 */
const VOUCHER_COL: Record<VoucherTier, number> = {
  'three-days': 1,
  'one-two-days': 2,
  'twelve-hours': 3,
  'thirteen-days': 4,
  'four-days': 5,
};

/**
 * The Russian voucher.
 *
 * `voucher_col` records which processing tier was bought, as the integer the old
 * application's own form numbers that column with — see `VOUCHER_COL`.
 */
export const lodgeVoucherOrder = async (
  input: VoucherOrderInput
): Promise<LodgedOrder> => {
  const quote = await quoteVoucher({
    voucherTypeId: input.voucherTypeId,
    tier: input.tier,
    applicants: input.applicants.length,
    courierOptionId: input.courierOptionId,
  });

  return sequelize.transaction(async (transaction) => {
    const order = await createHeader(
      {
        clientId: input.clientId,
        orderType: ORDER_TYPE.RUSSIAN_VISA_VOUCHER,
        // Charged online: the payment moves it to placed.
        placed: false,
        contact: input.contact,
        departureDate: input.departureDate,
        applicants: input.applicants,
        courierOptionId: input.courierOptionId,
        quote,
      },
      transaction
    );

    await order.update({ russian_visa_voucher_id: input.voucherTypeId }, { transaction });

    await RussianVisaVoucherOrderDetails.create(
      {
        order_id: order.id,
        russian_visa_voucher_id: input.voucherTypeId,
        voucher_col: VOUCHER_COL[input.tier],
        voucher_col_cost: centsToLegacyString(quote.lines[0]?.unitCents ?? null),
        first_entry_date: dateOnlyForWrite(input.entryDate),
        first_departure_date: dateOnlyForWrite(input.departureDate),
        double_entry_date: dateOnlyForWrite(input.secondEntryDate),
        double_departure_date: dateOnlyForWrite(input.secondDepartureDate),
        list_of_cities: clean(input.cities),
        list_of_hotels: clean(input.hotels),
        visa_applied_at: clean(input.appliedAt),
        comment: clean(input.comment),
        company: clean(input.employer?.company),
        position: clean(input.employer?.position),
        company_phone: clean(input.employer?.phone),
        address: clean(input.employer?.address),
        city: clean(input.employer?.city),
        state: clean(input.employer?.state),
        postcode: clean(input.employer?.postcode),
        country_id: input.employer?.countryId ?? null,
        // Same flag as the DL detail row above: `getRussianVisaVoucherOrderDetailsByOrderId`
        // filters `rvvod.status = 1`, and `ApplicationRussianVisaVoucherController:487`
        // writes it. At `0` the voucher's own details are invisible to the admin.
        status: 1,
      },
      { transaction }
    );

    await createApplicants(order.id, input.applicants, transaction);

    return finish(order, quote);
  });
};

// ---------------------------------------------------------------------------
// Document legalisation / attestation
// ---------------------------------------------------------------------------

export interface LegalisationDocumentInput {
  documentType: string;
  quantity: number;
  note?: string | null;
}

export interface LegalisationOrderInput {
  clientId: number | null;
  contact: ContactInput;
  destinationCountryId?: number | null;
  nationalityCountryId?: number | null;
  documents: readonly LegalisationDocumentInput[];
  applicants?: readonly ApplicantInput[];
  returnAddress?: ReturnAddressInput;
  courierOptionId?: number | null;
  /** The client's own reference for the job. `ref_no` on the detail row. */
  clientReference?: string | null;
  /** `com_invoice_no`, which an export order is matched against downstream. */
  commercialInvoiceNumber?: string | null;
  /** The answers with no column of their own. Written to `tbl_order_notes`. */
  notes?: string | null;
}

/**
 * Legalisation, lodged without a price.
 *
 * `quoteRequired` comes back true and no amount is written to `total_fee`. A
 * consultant raises the real figure into `tbl_order_dl_quotes` afterwards. This
 * is the honest shape of the service — the cost depends on the document, the
 * destination authority and the page count, none of which a form can price.
 */
export const lodgeLegalisationOrder = async (
  input: LegalisationOrderInput
): Promise<LodgedOrder> => {
  const quote = await quoteLegalisation(input.destinationCountryId ?? null);

  return sequelize
    .transaction(async (transaction) => {
      const order = await createHeader(
        {
          clientId: input.clientId,
          orderType: ORDER_TYPE.DOCUMENT_LEGALISATION,
          // Quoted, not charged — lodging it is the place-order step.
          placed: true,
          contact: input.contact,
          destinationCountryId: input.destinationCountryId,
          applicants: input.applicants ?? [],
          courierOptionId: input.courierOptionId,
          quote,
        },
        transaction
      );

      /**
       * A legalisation order gets a destination row, and it is not optional.
       *
       * `docLegalisation.html.twig` interpolates `{{orderData.travels.id}}`
       * **unguarded** in seventeen places — line 117's `shippedBy[…]` is the first
       * — and `travels` is this row, flattened. With none, opening the order in
       * CLS's admin is a Twig 500.
       *
       * It is only this template: the clearance, voucher and document-delivery
       * views all guard with `is defined`, and their legacy controllers
       * correspondingly do not write a destination row.
       * `ApplicationDocumentLegalisationController:148-160` does, with exactly
       * these four fields.
       */
      await ClsOrderDestinations.create(
        {
          order_id: order.id,
          country_id: input.destinationCountryId ?? null,
          nationality: input.nationalityCountryId ?? null,
          status: 1,
        },
        { transaction }
      );

      await DocumentLegalizationOrderDetails.create(
        {
          order_id: order.id,
          destination: input.destinationCountryId ?? null,
          nationality: input.nationalityCountryId ?? null,
          ref_no: clean(input.clientReference),
          com_invoice_no: clean(input.commercialInvoiceNumber),
          /**
           * `1`, not `0`, and it is load-bearing.
           *
           * `status` on these detail tables is not a workflow state — it is an
           * "this row counts" flag, and the reader enforces it:
           * `getDLOrderDetailsByOrderId` is
           * `WHERE ddod.status = 1 AND ddod.order_id = :orderId`. Written as `0`
           * the row exists and the admin cannot see it, so the DL view rendered
           * `dl_order_details => array()` and lost the destination, nationality,
           * reference and commercial invoice number.
           * `ApplicationDocumentLegalisationController:179` writes `1`.
           */
          status: 1,
        },
        { transaction }
      );

      /**
       * The document lines go to `tbl_order_dl_checklist`, not to
       * `tbl_document_legalization_documents`.
       *
       * That looks like the wrong table and is the right one. Both exist; only one
       * is read. **`tbl_document_legalization_documents` has no reader anywhere in
       * the legacy codebase** — grep it — while `tbl_order_dl_checklist` is what
       * every DL screen uses:
       *
       * - `CLSadminBundle` `docLegalisation.html.twig:499` renders
       *   `orderData.order_dl_checklist`, and `ViewOrderController:3441` writes the
       *   consultant's edits back into those same rows;
       * - `GlobalController::getOrderDLChecklistsByOrderId` loads them with
       *   `WHERE dlc.order_no = :orderId`, passing the **`tbl_cls_order.id`**;
       * - CLS's own new API (`Acme/cls-node-api`) writes here too.
       *
       * Writing the other table meant an attestation order appeared in the admin's
       * DL queue — the details row is what that list joins — and then opened with
       * an empty document checklist.
       *
       * `order_no` holding a `tbl_cls_order.id` is the legacy id-collision hazard
       * and is unavoidable: it is the key the admin reads by.
       */
      await Promise.all(
        input.documents.map((document) =>
          OrderDlChecklist.create(
            {
              order_no: order.id,
              type: document.documentType,
              number: document.quantity,
              note: clean(document.note),
            },
            { transaction }
          )
        )
      );

      /**
       * A legalisation order always gets a traveller row, even with no applicants.
       *
       * The attestation journey does not collect applicants — a document is being
       * legalised, not a person travelling — so this used to write none. That is a
       * shape the old admin cannot render: its DL view does
       *
       * ```php
       * $orderData['travellers'] = $orderData['order_travellers'][0] ?: [];
       * ```
       *
       * (`ViewOrderController:3527`) and the template then reads
       * `orderData.travellers.first_name` unguarded at `docLegalisation.html.twig:39`.
       * With no rows that is `[]`, and opening the order **fatals with a Twig
       * "Item first_name for Array does not exist"** — a 500 on a real order a
       * consultant has been asked to work.
       *
       * The old application never hits it because it always writes exactly one row
       * from the order contact (`ApplicationDocumentLegalisationController:195-210`),
       * flagged primary and `is_client = 1` — for a legalisation the contact *is*
       * the client. This does the same.
       */
      if (input.applicants && input.applicants.length > 0) {
        await createApplicants(order.id, input.applicants, transaction);
      } else {
        await OrderTravellerDetails.create(
          {
            order_id: order.id,
            first_name: input.contact.firstName,
            last_name: input.contact.lastName,
            email: input.contact.email,
            phone: clean(input.contact.phone),
            organisation: clean(input.returnAddress?.company),
            nationality: input.nationalityCountryId ?? null,
            citizenship: input.nationalityCountryId ?? null,
            is_primary: 1,
            is_client: 1,
            status: 1,
          },
          { transaction }
        );
      }

      await createReturnAddress(order.id, input.returnAddress, transaction);

      return finish(order, quote);
    })
    .then(async (lodged) => {
      // After the commit: see `recordOrderNote` for why this cannot be inside it.
      await recordOrderNote(lodged.orderId, input.notes);
      return lodged;
    });
};

// ---------------------------------------------------------------------------
// Visa
// ---------------------------------------------------------------------------

export interface VisaOrderInput {
  clientId: number | null;
  /** Null when the consultant is still to confirm which visa this is. */
  visaTypeId: number | null;
  destinationCountryId: number;
  contact: ContactInput;
  applicants: readonly ApplicantInput[];
  entryOption?: number | null;
  processLocationId?: number | null;
  travelPurpose?: string | null;
  departureDate?: string | null;
  entryDate?: string | null;
  exitDate?: string | null;
  requirementIds?: readonly number[];
  additionalServiceIds?: readonly number[];
  courierOptionId?: number | null;
  returnAddress?: ReturnAddressInput;
}

/**
 * A visa order, with one destination row.
 *
 * `tbl_cls_order_destinations` is a `hasMany`, because the old application
 * supports one order covering several countries. This lodges one — the website's
 * visa journey collects a single destination — and the table's shape leaves room
 * for the multi-destination case without this code pretending to handle it.
 */
export const lodgeVisaOrder = async (input: VisaOrderInput): Promise<LodgedOrder> => {
  /**
   * Priced only when the visa type is known.
   *
   * Without one there is no row to read a fee from, so the order is recorded
   * quote-required and a consultant prices it — which is what happens anyway on
   * the corporate journeys, where the type is part of what the client is asking
   * CLS to work out.
   */
  const quote =
    input.visaTypeId === null
      ? quoteOnApplication(
          'A consultant will confirm the visa type and the fee for this order.'
        )
      : await quoteVisa({
          visaTypeId: input.visaTypeId,
          applicants: input.applicants.length,
          requirementIds: input.requirementIds,
          additionalServiceIds: input.additionalServiceIds,
          courierOptionId: input.courierOptionId,
        });

  return sequelize
    .transaction(async (transaction) => {
      const order = await createHeader(
        {
          clientId: input.clientId,
          orderType: ORDER_TYPE.PUBLIC_VISA,
          // Quoted by a consultant — lodging it is the place-order step.
          placed: true,
          contact: input.contact,
          destinationCountryId: input.destinationCountryId,
          departureDate: input.departureDate,
          applicants: input.applicants,
          courierOptionId: input.courierOptionId,
          quote,
        },
        transaction
      );

      if (input.visaTypeId !== null) {
        await order.update({ visa_type: String(input.visaTypeId) }, { transaction });
      }

      await ClsOrderDestinations.create(
        {
          order_id: order.id,
          country_id: input.destinationCountryId,
          visa_type_id: input.visaTypeId,
          // Null is a legitimate value here: the destination is recorded and the
          // type is confirmed later.
          entry_option: input.entryOption ?? null,
          process_location_id: input.processLocationId ?? null,
          nationality: input.applicants[0]?.nationalityId ?? null,
          departure_date: dateOnlyForWrite(input.departureDate),
          entry_date_country: dateOnlyForWrite(input.entryDate),
          departure_date_country: dateOnlyForWrite(input.exitDate),
          travel_purpose: clean(input.travelPurpose),
          selected_visa_type_price: centsToLegacyString(
            quote.lines[0]?.unitCents ?? null
          ),
          // `VisaInformationController.php:835` and the gov controllers all write
          // `1` here. No reader filters on it today, but the value is the old
          // application's and there is no reason for ours to differ.
          status: 1,
        },
        { transaction }
      );

      await createApplicants(order.id, input.applicants, transaction);
      await createReturnAddress(order.id, input.returnAddress, transaction);

      return { lodged: finish(order, quote), order };
    })
    .then(async ({ lodged, order }) => {
      /**
       * The document checklist, derived from the catalogue.
       *
       * After the commit rather than inside it, because the read it does spans the
       * category tables and the write is a `bulkCreate` — holding the order's
       * transaction open across both buys nothing, and the materialiser is
       * idempotent so a failure here is retried the next time anybody opens the
       * order.
       *
       * The old application does this after the *payment*. A corporate visa is
       * quoted rather than charged, so there is no payment to hang it on and
       * lodgement is the equivalent moment. Where the visa type is still to be
       * confirmed by a consultant, no category resolves and no checklist is
       * written — see `domain/checklist`.
       */
      await materialiseChecklistQuietly(order);
      return lodged;
    });
};
