import type {
  AdditionalServices,
  CardTypes,
  Categories,
  Countries,
  Departments,
  Documents,
  Locations,
  NameTitle,
  PassportTypes,
  PoliceClearances,
  PublicVisaTypes,
  RussianVisaVoucherTypes,
  States,
  Terminals,
  VisaAdditionalRequirements,
  VisaCourierOptions,
  VisaTypes,
  WeightPrice,
} from '../../models';
import { toCents } from '../../shared/money';
import { clean, cleanOr, stripHtml, toBoolean, truncate } from '../../shared/text';
import { ENTRY_OPTION_LABEL } from '../../domain/codes';

/**
 * Turning reference rows into the shapes the website's selects consume.
 *
 * Two conventions run through all of it.
 *
 * **A slug alongside the id.** The website's order forms were built against
 * slug-keyed data (`'united-arab-emirates'`), and its pages link by slug. The
 * database keys on an integer. Both are returned, so a form can keep rendering
 * by slug while the order it eventually posts carries the integer the tables
 * actually join on.
 *
 * **Amounts in cents, or null.** `tbl_countries.cls_service_fee` is a
 * `varchar(255)` and holds `250`, `250.00` and the occasional `POA`. A figure
 * that cannot be read comes back as null and the website renders "on
 * application" — which is what CLS means by it.
 */

/** `United Arab Emirates` → `united-arab-emirates`. */
export const slugify = (value: string | null): string | null => {
  const text = clean(value);
  if (!text) return null;

  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

export interface CountryView {
  id: number;
  slug: string | null;
  code: string | null;
  name: string;
  label: string;
  displayName: string | null;
  popular: boolean;
  priority: number | null;
  isCls: boolean;
  services: {
    policeClearance: boolean;
    documentDelivery: boolean;
    documentLegalisation: boolean;
    translation: boolean;
  };
  fees: {
    clsServiceCents: number | null;
    standardServiceCents: number | null;
  };
}

export const toCountry = (row: Countries): CountryView => {
  const name = cleanOr(row.country_name_display ?? row.country_name, 'Unknown');

  return {
    id: row.id,
    slug: slugify(row.country_name ?? row.country_name_display),
    code: clean(row.country_code),
    name,
    // `label` as well as `name`, because that is the key the website's existing
    // select options use and this is meant to be a drop-in for them.
    label: name,
    displayName: clean(row.country_name_display),
    popular: toBoolean(row.s_popular_destination),
    priority: row.priority,
    isCls: toBoolean(row.is_cls),
    services: {
      policeClearance: toBoolean(row.police_clearances),
      documentDelivery: toBoolean(row.secure_document_delivery),
      documentLegalisation: toBoolean(row.document_legalisation),
      translation: toBoolean(row.translation_services),
    },
    fees: {
      clsServiceCents: toCents(row.cls_service_fee),
      standardServiceCents: toCents(row.standard_service_fee),
    },
  };
};

/**
 * The full country record, for a destination page.
 *
 * The `*_html` columns hold operator-authored HTML. They are returned as HTML
 * because the destination pages render them as formatted copy — but the summary
 * fields are flattened to text, so anything consuming this for a list or a
 * meta description cannot inject markup by accident.
 */
export const toCountryDetail = (row: Countries) => ({
  ...toCountry(row),
  representative: clean(row.rep_name),
  visaInformation: clean(row.visa_information),
  details: clean(row.country_details),
  summary: truncate(stripHtml(row.country_details), 300),
  noVisaRequired: {
    public: toBoolean(row.public_s_no_visa_required),
    publicHtml: clean(row.public_s_no_visa_required_html),
    government: toBoolean(row.gov_s_no_visa_required),
    governmentHtml: clean(row.gov_s_no_visa_required_html),
  },
  embassy: {
    addressLine1: clean(row.embassy_address_line1),
    addressLine2: clean(row.embassy_address_line2),
    street: clean(row.embassy_street),
    city: clean(row.embassy_city),
    state: clean(row.embassy_state),
    postcode: clean(row.embassy_postcode),
    phone: clean(row.embassy_phone),
  },
  images: {
    flag: clean(row.country_image),
    banner: clean(row.country_banner_image),
    applicationForm: clean(row.country_application_form),
  },
  clsDescription: clean(row.cls_description),
});

export const toState = (row: States) => ({
  id: row.id,
  name: cleanOr(row.name, 'Unknown'),
  label: cleanOr(row.name, 'Unknown'),
  code: clean(row.code),
  countryId: row.country_id,
  /** `s_main` marks the Australian states the forms show first. */
  primary: toBoolean(row.s_main),
});

export const toTitle = (row: NameTitle) => ({
  id: row.id,
  title: cleanOr(row.title, ''),
  label: cleanOr(row.title, ''),
  gender: clean(row.gender),
  priority: row.priority,
  /** `is_rvv` — this title is offered on the Russian voucher form specifically. */
  forVoucher: toBoolean(row.is_rvv),
});

export const toPassportType = (row: PassportTypes) => ({
  id: row.id,
  type: cleanOr(row.type, ''),
  label: cleanOr(row.type, ''),
});

export const toDepartment = (row: Departments) => ({
  id: row.id,
  code: clean(row.code),
  name: cleanOr(row.name, ''),
  label: cleanOr(row.name, ''),
});

/**
 * A police clearance and its published fee.
 *
 * Two prices per row: `price` for the certificate and `price_additional` for
 * each extra applicant on the same order. Both are `double` here, which makes
 * these among the few money columns in the schema that need no rescue.
 */
export const toPoliceClearance = (row: PoliceClearances) => ({
  id: row.id,
  name: cleanOr(row.name, 'Police clearance'),
  label: cleanOr(row.name, 'Police clearance'),
  priceCents: toCents(row.price),
  additional: {
    name: clean(row.name_additional),
    priceCents: toCents(row.price_additional),
  },
  information: clean(row.gen_info),
  form: clean(row.file_path),
});

/**
 * The Russian voucher price matrix.
 *
 * Five processing speeds across the columns of one row, which is why this is a
 * matrix rather than a list: the website renders it as a table and needs each
 * cell labelled. The column names are the schema's
 * (`one_two_days_process_fee`), and the labels here are what CLS calls them.
 */
export const toVoucherType = (row: RussianVisaVoucherTypes) => ({
  id: row.id,
  type: clean(row.type),
  name: cleanOr(row.name, ''),
  label: cleanOr(row.name, ''),
  entryOption: clean(row.entry_option),
  active: toBoolean(row.s_active),
  sortOrder: clean(row.type_order),
  processing: [
    { id: 'thirteen-days', label: '13 days', feeCents: toCents(row.thirteen_days) },
    { id: 'four-days', label: '4 days', feeCents: toCents(row.four_days) },
    { id: 'three-days', label: '3 days', feeCents: toCents(row.three_days_process_fee) },
    {
      id: 'one-two-days',
      label: '1–2 days',
      feeCents: toCents(row.one_two_days_process_fee),
    },
    {
      id: 'twelve-hours',
      label: '12 hours',
      feeCents: toCents(row.twelve_hrs_process_fee),
    },
  ],
});

export const toVisaType = (row: VisaTypes) => ({
  id: row.id,
  audience: 'government' as const,
  countryId: row.country_id,
  type: cleanOr(row.type, ''),
  label: cleanOr(row.type, ''),
  slug: slugify(row.type),
  costCents: toCents(row.cost),
  information: clean(row.visa_information),
  attachments: [clean(row.file_attachment), clean(row.second_file_attachment)].filter(
    (value): value is string => value !== null
  ),
  active: row.status === 1,
});

export const toPublicVisaType = (row: PublicVisaTypes) => ({
  id: row.id,
  audience: 'public' as const,
  countryId: row.country_id,
  type: cleanOr(row.type, ''),
  title: clean(row.title),
  label: cleanOr(row.visa_label ?? row.title ?? row.type, ''),
  slug: slugify(row.visa_label ?? row.title ?? row.type),
  costCents: toCents(row.cost),
  description: clean(row.description),
  information: clean(row.visa_information),
  processingTime: clean(row.processing_time),
  /** `is_process_location` — this visa is issued from a named consulate. */
  hasProcessLocation: toBoolean(row.is_process_location),
  attachments: [
    clean(row.file_attachment),
    clean(row.second_file_attachment),
    clean(row.bulk_document_pack_attachment),
  ].filter((value): value is string => value !== null),
  active: row.status === 1,
});

export const toRequirement = (row: VisaAdditionalRequirements) => ({
  id: row.id,
  visaId: row.visa_id,
  requirement: cleanOr(row.requirement, ''),
  label: cleanOr(row.requirement, ''),
  costCents: toCents(row.cost),
  /** `s_required` — not optional; the client cannot decline it. */
  mandatory: toBoolean(row.s_required),
  sortOrder: row.item_order,
  active: row.status === 1,
});

export const toCourierOption = (row: VisaCourierOptions) => ({
  id: row.id,
  type: cleanOr(row.type, ''),
  label: cleanOr(row.type, ''),
  costCents: toCents(row.cost),
  icon: clean(row.courier_icon),
  active: toBoolean(row.s_active),
  availability: {
    government: toBoolean(row.s_available_for_gov),
    public: toBoolean(row.s_available_for_public),
  },
  /** DHL options carry a live booking integration in the old application. */
  isDhl: toBoolean(row.s_dhl),
  isCourierService: toBoolean(row.is_courier_service),
  isAirportToAirport: toBoolean(row.is_airport_to_airport),
  isDocumentDelivery: toBoolean(row.is_document_delivery),
});

export const toLocation = (row: Locations) => ({
  id: row.id,
  name: cleanOr(row.name, ''),
  label: cleanOr(row.name, ''),
  active: toBoolean(row.status),
});

export const toDocumentType = (row: Documents) => ({
  id: row.id,
  countryId: row.country_id,
  visaTypeId: row.visa_type_id,
  categoryId: row.category_id,
  nationalityId: row.nationality,
  entryOption: clean(row.entry_option),
  name: cleanOr(row.document_name, 'Document'),
  label: cleanOr(row.document_name, 'Document'),
  description: clean(row.description),
  /** A sample the client can download to see what is wanted. */
  sample: toBoolean(row.is_sample) ? clean(row.sample_doc) : null,
  active: toBoolean(row.status),
});

export const toCategory = (row: Categories) => ({
  id: row.id,
  countryId: row.country_id,
  visaTypeId: row.visa_type_id,
  parentId: row.parent_id,
  category: cleanOr(row.category, ''),
  label: cleanOr(row.category, ''),
  region: clean(row.region),
  location: clean(row.location),
  entryOption: clean(row.entry_option),
  entryOptionLabel: row.entry_option
    ? (ENTRY_OPTION_LABEL[Number(row.entry_option)] ?? clean(row.entry_option))
    : null,
  nationalityId: row.nationality,
  isProcessLocation: toBoolean(row.is_process_location),
  description: clean(row.description),
  active: toBoolean(row.status),
});

export const toAdditionalService = (row: AdditionalServices) => ({
  id: row.id,
  visaId: row.visa_id,
  title: cleanOr(row.title, ''),
  label: cleanOr(row.title, ''),
  description: clean(row.short_description),
  chargesCents: toCents(row.charges),
  active: toBoolean(row.status),
});

export const toCardType = (row: CardTypes) => ({
  id: row.id,
  name: cleanOr(row.name, ''),
  label: cleanOr(row.name, ''),
});

export const toTerminal = (row: Terminals) => ({
  id: row.id,
  name: cleanOr(row.terminal_name, ''),
  label: cleanOr(row.terminal_name, ''),
  popular: toBoolean(row.popular_terminal),
});

/**
 * A weight band for document delivery.
 *
 * Returned with both limits, because the old application's own bands overlap in
 * places and a consumer needs to see the raw pair rather than a derived range
 * that hides the overlap.
 */
export const toWeightPrice = (row: WeightPrice) => ({
  id: row.id,
  lowerLimit: row.weight_lower_limit,
  upperLimit: row.weight_upper_limit,
  priceCents: toCents(row.price),
});
