import {
  AdditionalServices,
  Countries,
  PoliceClearances,
  PublicVisaAdditionalRequirements,
  PublicVisaTypes,
  RussianVisaVoucherTypes,
  VisaCourierOptions,
} from '../models';
import { badRequest, notFound } from '../shared/errors';
import { gstCents, toCents } from '../shared/money';
import { clean } from '../shared/text';

/**
 * What an order costs, computed here and nowhere else.
 *
 * **A request names ids; it never names amounts.** Every figure below is read
 * out of the catalogue tables by id. A tampered payload can therefore ask for a
 * different order — a faster processing tier, a courier upgrade — but it cannot
 * ask for a different price, because no price in the request is ever read.
 *
 * The catalogue tables are the ones the old admin screens maintain, so a rate
 * CLS changes in their own system changes here on the next request. There is no
 * second copy of the rate card in this codebase to drift from it.
 *
 * ## Which services have a published price
 *
 * Police clearance and the Russian voucher do: `tbl_police_clearances.price`
 * and the five fee columns on `tbl_russian_visa_voucher_types`. Public visas do:
 * `tbl_public_visa_types.cost`.
 *
 * Document legalisation and government visa work do **not**. A consultant
 * prices those per job — that is what `tbl_order_dl_quotes` exists for — so
 * those journeys return `quoteRequired: true` and no amount. Returning a zero,
 * or an estimate, would put a number in front of a client that CLS has not
 * agreed to.
 */

export interface QuoteLine {
  id: string;
  label: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
}

export interface Quote {
  lines: QuoteLine[];
  subtotalCents: number;
  gstCents: number;
  totalCents: number;
  currency: 'AUD';
  /** True when CLS prices this by hand and no total can be given yet. */
  quoteRequired: boolean;
  /**
   * Why there is no total, when there is not one.
   *
   * Shown to the client verbatim. "A consultant will send you a quote" is a
   * different thing from a failure, and without this the website would have to
   * invent wording for a state only the API knows the reason for.
   */
  reason?: string;
}

/** A quote with nothing in it, for the services a consultant prices. */
export const quoteOnApplication = (reason: string): Quote => ({
  lines: [],
  subtotalCents: 0,
  gstCents: 0,
  totalCents: 0,
  currency: 'AUD',
  quoteRequired: true,
  reason,
});

const finalise = (lines: QuoteLine[]): Quote => {
  const subtotalCents = lines.reduce((total, line) => total + line.totalCents, 0);
  // GST once, on the subtotal. Rounding each line and summing produces a total
  // that disagrees with ten per cent of the subtotal by a cent or two, and then
  // the printed invoice and the card charge do not match.
  const gst = gstCents(subtotalCents);

  return {
    lines,
    subtotalCents,
    gstCents: gst,
    totalCents: subtotalCents + gst,
    currency: 'AUD',
    quoteRequired: false,
  };
};

/**
 * A courier line, if one was chosen.
 *
 * Returns null rather than a zero line when no courier was selected, so an order
 * with no delivery does not show "Courier — A$0.00" on its quote.
 */
const courierLine = async (
  courierOptionId: number | null | undefined
): Promise<QuoteLine | null> => {
  if (!courierOptionId) return null;

  const option = await VisaCourierOptions.findOne({
    where: { id: courierOptionId, s_active: 1 },
  });

  if (!option) throw badRequest('Choose a delivery option from the list.');

  const unitCents = toCents(option.cost) ?? 0;

  return {
    id: `courier-${option.id}`,
    label: clean(option.type) ?? 'Delivery',
    quantity: 1,
    unitCents,
    totalCents: unitCents,
  };
};

// ---------------------------------------------------------------------------
// Police clearance
// ---------------------------------------------------------------------------

export interface ClearanceQuoteInput {
  clearanceId: number;
  applicants: number;
  courierOptionId?: number | null;
}

/**
 * Police clearance, priced from `tbl_police_clearances`.
 *
 * Two columns, because CLS charges a different rate for the first applicant and
 * for each one after: `price` then `price_additional`. Where
 * `price_additional` is not set, every applicant is charged at the full rate —
 * which is the old application's behaviour and the safer reading of a null.
 */
export const quoteClearance = async (
  input: ClearanceQuoteInput
): Promise<Quote> => {
  const clearance = await PoliceClearances.findOne({
    where: { id: input.clearanceId, status: 1 },
  });

  if (!clearance) throw notFound('That police clearance is not one we offer.');

  const first = toCents(clearance.price);
  if (first === null) {
    // The row exists but carries no price. Priced on application rather than
    // guessed at.
    return quoteOnApplication(
      'This clearance has no published fee. A consultant will confirm the cost.'
    );
  }

  const additionalUnit = toCents(clearance.price_additional) ?? first;
  const extras = Math.max(0, input.applicants - 1);

  const lines: QuoteLine[] = [
    {
      id: `clearance-${clearance.id}`,
      label: clean(clearance.name) ?? 'Police clearance',
      quantity: 1,
      unitCents: first,
      totalCents: first,
    },
  ];

  if (extras > 0) {
    lines.push({
      id: `clearance-${clearance.id}-additional`,
      label:
        clean(clearance.name_additional) ?? 'Additional applicant',
      quantity: extras,
      unitCents: additionalUnit,
      totalCents: additionalUnit * extras,
    });
  }

  const courier = await courierLine(input.courierOptionId);
  if (courier) lines.push(courier);

  return finalise(lines);
};

// ---------------------------------------------------------------------------
// Russian visa voucher
// ---------------------------------------------------------------------------

/** The five processing tiers, mapped to the columns that hold their fees. */
const VOUCHER_TIERS = {
  'thirteen-days': { column: 'thirteen_days', label: '13 day processing' },
  'four-days': { column: 'four_days', label: '4 day processing' },
  'three-days': { column: 'three_days_process_fee', label: '3 day processing' },
  'one-two-days': { column: 'one_two_days_process_fee', label: '1–2 day processing' },
  'twelve-hours': { column: 'twelve_hrs_process_fee', label: '12 hour processing' },
} as const;

export type VoucherTier = keyof typeof VOUCHER_TIERS;

export const VOUCHER_TIER_IDS = Object.keys(VOUCHER_TIERS) as VoucherTier[];

export interface VoucherQuoteInput {
  voucherTypeId: number;
  tier: VoucherTier;
  applicants: number;
  courierOptionId?: number | null;
}

/**
 * The Russian voucher, priced from the tier the client picked.
 *
 * The five fees sit across five columns of one row, so the tier selects a column
 * rather than a row. An unpriced tier means CLS does not offer that speed for
 * that voucher type — a refusal, not a zero, because charging nothing for a
 * twelve-hour turnaround is the one outcome nobody wants.
 */
export const quoteVoucher = async (input: VoucherQuoteInput): Promise<Quote> => {
  const voucher = await RussianVisaVoucherTypes.findOne({
    where: { id: input.voucherTypeId, s_active: 1 },
  });

  if (!voucher) throw notFound('That voucher type is not one we offer.');

  const tier = VOUCHER_TIERS[input.tier];
  const raw = (voucher as unknown as Record<string, unknown>)[tier.column];
  const unitCents = toCents(raw);

  if (unitCents === null) {
    throw badRequest(
      `We do not offer ${tier.label.toLowerCase()} for that voucher. Please choose another processing time.`
    );
  }

  const lines: QuoteLine[] = [
    {
      id: `voucher-${voucher.id}-${input.tier}`,
      label: `${clean(voucher.name) ?? 'Russian visa voucher'} — ${tier.label}`,
      quantity: input.applicants,
      unitCents,
      totalCents: unitCents * input.applicants,
    },
  ];

  const courier = await courierLine(input.courierOptionId);
  if (courier) lines.push(courier);

  return finalise(lines);
};

// ---------------------------------------------------------------------------
// Public visa
// ---------------------------------------------------------------------------

export interface VisaQuoteInput {
  visaTypeId: number;
  applicants: number;
  /** Ids from `tbl_public_visa_additional_requirements`. */
  requirementIds?: readonly number[];
  additionalServiceIds?: readonly number[];
  courierOptionId?: number | null;
}

/**
 * A public visa, priced from the catalogue plus whatever extras were chosen.
 *
 * Mandatory requirements are added whether the client selected them or not.
 * `s_required` on the requirement row means exactly that — the embassy will not
 * process without it — so leaving it out of the quote would mean charging for it
 * later or absorbing it.
 */
export const quoteVisa = async (input: VisaQuoteInput): Promise<Quote> => {
  const visa = await PublicVisaTypes.findOne({
    where: { id: input.visaTypeId, status: 1 },
  });

  if (!visa) throw notFound('That visa type is not one we offer.');

  const baseCents = toCents(visa.cost);

  if (baseCents === null) {
    return quoteOnApplication(
      'This visa is priced per application. A consultant will confirm the cost.'
    );
  }

  const lines: QuoteLine[] = [
    {
      id: `visa-${visa.id}`,
      label: clean(visa.title ?? visa.visa_label ?? visa.type) ?? 'Visa',
      quantity: input.applicants,
      unitCents: baseCents,
      totalCents: baseCents * input.applicants,
    },
  ];

  const requirements = await PublicVisaAdditionalRequirements.findAll({
    where: { visa_id: visa.id, status: 1 },
  });

  const chosen = new Set(input.requirementIds ?? []);

  for (const requirement of requirements) {
    const mandatory = requirement.s_required === 1;
    if (!mandatory && !chosen.has(requirement.id)) continue;

    const unitCents = toCents(requirement.cost);
    // A requirement with no cost is a document the client has to supply, not a
    // service CLS charges for. Skipped rather than added as a zero line.
    if (unitCents === null || unitCents === 0) continue;

    lines.push({
      id: `requirement-${requirement.id}`,
      label: clean(requirement.requirement) ?? 'Additional requirement',
      quantity: input.applicants,
      unitCents,
      totalCents: unitCents * input.applicants,
    });
  }

  if (input.additionalServiceIds && input.additionalServiceIds.length > 0) {
    const services = await AdditionalServices.findAll({
      where: { id: input.additionalServiceIds as number[], status: 1 },
    });

    for (const service of services) {
      const unitCents = toCents(service.charges);
      if (unitCents === null) continue;

      lines.push({
        id: `service-${service.id}`,
        label: clean(service.title) ?? 'Additional service',
        quantity: 1,
        unitCents,
        totalCents: unitCents,
      });
    }
  }

  const courier = await courierLine(input.courierOptionId);
  if (courier) lines.push(courier);

  return finalise(lines);
};

// ---------------------------------------------------------------------------
// Document legalisation and attestation
// ---------------------------------------------------------------------------

/**
 * Legalisation, which has no published price.
 *
 * `tbl_countries.cls_service_fee` and `standard_service_fee` exist and are
 * returned as *indicative* figures where they are set, because the website's
 * attestation page shows a from-price. They are not a quote: the real cost
 * depends on the document, the destination authority and the number of pages,
 * and it is raised by a consultant into `tbl_order_dl_quotes`.
 */
export const quoteLegalisation = async (
  countryId: number | null
): Promise<Quote & { indicativeFromCents: number | null }> => {
  let indicativeFromCents: number | null = null;

  if (countryId) {
    const country = await Countries.findByPk(countryId);
    if (country) {
      indicativeFromCents =
        toCents(country.cls_service_fee) ?? toCents(country.standard_service_fee);
    }
  }

  return {
    ...quoteOnApplication(
      'Legalisation is priced per document. A consultant will send you a quote.'
    ),
    indicativeFromCents,
  };
};
