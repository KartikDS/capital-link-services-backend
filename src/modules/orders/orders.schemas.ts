import { z } from 'zod';
import { VOUCHER_TIER_IDS } from '../../domain/quotes';
import { dateField, emailField, phoneField } from '../../shared/validation';

/**
 * What an order request may contain.
 *
 * The rule these schemas enforce, and the reason they are worth reading: **no
 * amount is accepted from a client.** There is no `price`, `total` or
 * `amountCents` field anywhere below. A request names catalogue ids and
 * `domain/quotes` looks the figures up. A payload that tried to state its own
 * total would have that field stripped by Zod before a handler ever saw it.
 *
 * Lengths are the columns' rather than opinions. `first_name` is
 * `varchar(255)` on `tbl_order_traveller_details`, `contact_email` the same on
 * `tbl_cls_order` — so a longer value would be silently truncated by MySQL, and
 * a truncated passport name on an embassy submission is a rejected application.
 */

const id = z.coerce.number().int().positive();
const optionalId = id.optional().nullable();

export const applicantSchema = z.object({
  title: z.string().trim().max(255).optional().nullable(),
  firstName: z.string().trim().min(1, 'Enter the applicant’s first name').max(255),
  middleName: z.string().trim().max(255).optional().nullable(),
  lastName: z.string().trim().min(1, 'Enter the applicant’s last name').max(255),
  email: emailField.optional().nullable(),
  phone: phoneField.optional().nullable(),
  dateOfBirth: dateField.optional().nullable(),
  nationalityId: optionalId,
  passportNumber: z.string().trim().max(255).optional().nullable(),
  passportType: optionalId,
  passportIssueDate: dateField.optional().nullable(),
  passportExpiryDate: dateField.optional().nullable(),
  gender: z.string().trim().max(255).optional().nullable(),
  occupation: z.string().trim().max(255).optional().nullable(),
  organisation: z.string().trim().max(255).optional().nullable(),
  departureDate: dateField.optional().nullable(),
});

/**
 * At least one applicant, at most twenty.
 *
 * The ceiling is not arbitrary: `tbl_cls_order.no_of_traveller` records the
 * count and each applicant is a row written in the same transaction. Twenty is
 * past any real order and is the point at which this becomes a bulk job — which
 * the old application has its own `tbl_order_bulk_public_visa` flow for.
 */
export const applicantsField = z
  .array(applicantSchema)
  .min(1, 'Add at least one applicant')
  .max(20, 'For more than twenty applicants, please contact us directly');

export const contactSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(255),
  lastName: z.string().trim().min(1, 'Enter your last name').max(255),
  email: emailField,
  phone: phoneField.optional().nullable(),
  department: z.string().trim().max(255).optional().nullable(),
});

export const returnAddressSchema = z.object({
  firstName: z.string().trim().max(255).optional().nullable(),
  lastName: z.string().trim().max(255).optional().nullable(),
  email: emailField.optional().nullable(),
  phone: phoneField.optional().nullable(),
  company: z.string().trim().max(255).optional().nullable(),
  address: z.string().trim().max(255).optional().nullable(),
  city: z.string().trim().max(255).optional().nullable(),
  state: z.string().trim().max(255).optional().nullable(),
  postcode: z.string().trim().max(255).optional().nullable(),
  countryId: optionalId,
  returningDate: dateField.optional().nullable(),
  comment: z.string().trim().max(2000).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Police clearance
// ---------------------------------------------------------------------------

export const clearanceOrderSchema = z.object({
  clearanceId: id,
  contact: contactSchema,
  applicants: applicantsField,
  countryId: optionalId,
  departureDate: dateField.optional().nullable(),
  courierOptionId: optionalId,
  returnAddress: returnAddressSchema.optional(),

  /**
   * The answers with no column of their own, as prepared text.
   *
   * Why a clearance needs one: the wizard collects a purpose and a free-text
   * note, and the only column either could reach was `additional_comment` on the
   * return-address row — so on an order where the client did not give a return
   * address, both were dropped. `tbl_order_notes` is the schema's own place for
   * what an order says in words, and it does not depend on there being an address
   * to hang it off.
   */
  notes: z.string().trim().max(4000).optional().nullable(),
});

export const clearanceQuoteSchema = z.object({
  clearanceId: id,
  applicants: z.coerce.number().int().min(1).max(20),
  courierOptionId: optionalId,
});

// ---------------------------------------------------------------------------
// Russian visa voucher
// ---------------------------------------------------------------------------

/**
 * The processing tier, as one of five named speeds.
 *
 * Named rather than numbered because the five fees live in five differently
 * named columns, and `tier: 3` would leave a caller guessing whether that meant
 * the third column or the three-day service.
 */
export const voucherTierField = z.enum(VOUCHER_TIER_IDS as [string, ...string[]]);

export const voucherOrderSchema = z.object({
  voucherTypeId: id,
  tier: voucherTierField,
  contact: contactSchema,
  applicants: applicantsField,
  entryDate: dateField.optional().nullable(),
  departureDate: dateField.optional().nullable(),
  /** The second visit: `double_entry_date` and `double_departure_date`. */
  secondEntryDate: dateField.optional().nullable(),
  secondDepartureDate: dateField.optional().nullable(),
  cities: z.string().trim().max(255).optional().nullable(),
  hotels: z.string().trim().max(2000).optional().nullable(),
  appliedAt: z.string().trim().max(255).optional().nullable(),
  employer: z
    .object({
      company: z.string().trim().max(255).optional().nullable(),
      position: z.string().trim().max(255).optional().nullable(),
      phone: phoneField.optional().nullable(),
      address: z.string().trim().max(2000).optional().nullable(),
      city: z.string().trim().max(255).optional().nullable(),
      state: z.string().trim().max(255).optional().nullable(),
      postcode: z.string().trim().max(255).optional().nullable(),
      countryId: optionalId,
    })
    .optional(),
  comment: z.string().trim().max(2000).optional().nullable(),
  courierOptionId: optionalId,
});

export const voucherQuoteSchema = z.object({
  voucherTypeId: id,
  tier: voucherTierField,
  applicants: z.coerce.number().int().min(1).max(20),
  courierOptionId: optionalId,
});

// ---------------------------------------------------------------------------
// Document legalisation / attestation
// ---------------------------------------------------------------------------

export const legalisationOrderSchema = z.object({
  contact: contactSchema,
  destinationCountryId: optionalId,
  nationalityCountryId: optionalId,
  documents: z
    .array(
      z.object({
        documentType: z.string().trim().min(1, 'Choose a document type').max(255),
        quantity: z.coerce.number().int().min(1).max(100),
        note: z.string().trim().max(2000).optional().nullable(),
      })
    )
    .min(1, 'Add at least one document'),
  applicants: z.array(applicantSchema).max(20).optional(),
  returnAddress: returnAddressSchema.optional(),
  courierOptionId: optionalId,

  /**
   * The client's own reference and their commercial invoice number.
   *
   * Both have a column of their own — `ref_no` and `com_invoice_no` on
   * `tbl_document_legalization_order_details` — and both were being collected by
   * the website's form and then dropped on the way in. A commercial invoice
   * number in particular is what an export order is matched against at the other
   * end, so losing it is losing the thread of the job.
   */
  clientReference: z.string().trim().max(220).optional().nullable(),
  commercialInvoiceNumber: z.string().trim().max(220).optional().nullable(),

  /**
   * Everything the client answered that no column can hold.
   *
   * The attestation form asks which services are wanted, which pathway, how the
   * documents are being delivered, when they are needed by and whether the
   * originals are coming to the office. None of that has a column in the
   * legalisation tables, and all of it is what a consultant needs in order to
   * quote — so it arrives as prepared text and is written to `tbl_order_notes`,
   * which is the schema's own place for what an order says in words.
   */
  notes: z.string().trim().max(4000).optional().nullable(),
});

// ---------------------------------------------------------------------------
// Visa
// ---------------------------------------------------------------------------

export const visaOrderSchema = z.object({
  /**
   * Optional, because a real order often arrives without it.
   *
   * The website's corporate visa journey collects a company, a destination and a
   * travel date — the exact visa type is what the consultant confirms, and
   * frequently the reason the client is calling. Requiring it here would mean
   * refusing to record an order CLS would happily take.
   *
   * Absent, the order lodges against its destination with no type and no price,
   * and `quoteRequired` comes back true. Present, it is priced from
   * `tbl_public_visa_types` as usual.
   */
  visaTypeId: optionalId,
  destinationCountryId: id,
  contact: contactSchema,
  applicants: applicantsField,
  entryOption: z.coerce.number().int().min(1).max(3).optional().nullable(),
  processLocationId: optionalId,
  travelPurpose: z.string().trim().max(2000).optional().nullable(),
  departureDate: dateField.optional().nullable(),
  entryDate: dateField.optional().nullable(),
  exitDate: dateField.optional().nullable(),
  requirementIds: z.array(id).max(50).optional(),
  additionalServiceIds: z.array(id).max(50).optional(),
  courierOptionId: optionalId,
  returnAddress: returnAddressSchema.optional(),
});

export const visaQuoteSchema = z.object({
  visaTypeId: id,
  applicants: z.coerce.number().int().min(1).max(20),
  requirementIds: z.array(id).max(50).optional(),
  additionalServiceIds: z.array(id).max(50).optional(),
  courierOptionId: optionalId,
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The public tracking lookup.
 *
 * The character restriction is not cosmetic. A reference is used in a `LIKE`
 * and in a filename comparison downstream, and an unrestricted string here
 * means anything a caller sends reaches the database — `../../etc/passwd`
 * included. It is not exploitable through Sequelize's parameter binding, but a
 * reference is a reference, and rejecting a non-reference at the edge is
 * cheaper than reasoning about every place it might travel to.
 */
export const trackQuerySchema = z.object({
  reference: z
    .string()
    .trim()
    .min(1, 'Enter your order reference')
    .max(64)
    .regex(/^[A-Za-z0-9/_-]+$/, 'That reference is not valid'),
  email: emailField,
});

export const myOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
  orderType: z.coerce.number().int().min(1).max(9).optional(),
  stage: z.enum(['action-required', 'in-progress', 'ready', 'completed']).optional(),
});

export const referenceParamSchema = z.object({
  reference: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9/_-]+$/, 'That reference is not valid'),
});

export type ApplicantInputSchema = z.infer<typeof applicantSchema>;
export type ClearanceOrderBody = z.infer<typeof clearanceOrderSchema>;
export type VoucherOrderBody = z.infer<typeof voucherOrderSchema>;
export type LegalisationOrderBody = z.infer<typeof legalisationOrderSchema>;
export type VisaOrderBody = z.infer<typeof visaOrderSchema>;
