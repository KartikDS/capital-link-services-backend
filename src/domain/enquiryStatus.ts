/**
 * The enquiry pipeline: New / Contacted / Quoted / Won / Lost.
 *
 * `tbl_inquiries.status` is a free `char(100)`, so these are stored as-is and
 * need no schema change. Rows written before this pipeline carry the older
 * vocabulary; those are *read* as the nearest stage but never rewritten, so what
 * the database holds is still what whoever set it wrote.
 */
export const ENQUIRY_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'] as const;

export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

/** Older values, and the stage each is read as. */
const LEGACY_STATUS: Readonly<Record<string, EnquiryStatus>> = {
  'in-progress': 'contacted',
  converted: 'won',
  closed: 'lost',
};

/** The stage a stored value stands for; an unrecognised one reads as `new`. */
export const readEnquiryStatus = (stored: string | null | undefined): EnquiryStatus => {
  const value = (stored ?? '').trim().toLowerCase();
  if ((ENQUIRY_STATUSES as readonly string[]).includes(value)) {
    return value as EnquiryStatus;
  }
  return LEGACY_STATUS[value] ?? 'new';
};

/** Every stored value that reads as `status`, for filtering the queue. */
export const storedValuesFor = (status: EnquiryStatus): string[] => [
  status,
  ...Object.entries(LEGACY_STATUS)
    .filter(([, mapped]) => mapped === status)
    .map(([legacy]) => legacy),
];
