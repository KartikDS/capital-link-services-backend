import type { OrderDlChecklist, OrderNotes, OrderReturnDocumentDetails } from '../../models';
import { clean } from '../../shared/text';

/**
 * What the NEW document-attestation order form collected, read back out of what
 * `orders.lodge.ts` persisted — for the admin Document Legalisation screen.
 *
 * ## Why this is a parser and not a set of columns
 *
 * The legacy schema has columns for about a third of what the website's form asks
 * (see `lodgeLegalisationOrder`). The rest — services wanted, pathway, document
 * type, the "needed by" date, delivery handling, whether the originals are coming to
 * the office, the contact's full address, the return address and whether it is
 * available yet — has no column, so the website writes it as ONE note to
 * `tbl_order_notes` (`note_by_name = 'Website order form'`, `user_type = 'client'`),
 * one `label: value` line per answer, built by the frontend's `orderNoteFrom` out of
 * `describeAttestationRequest`. That note is the only place those answers exist, so
 * this reads it back.
 *
 * The labels below are therefore a contract with `describeAttestationRequest` in the
 * frontend (`lib/attestationRequest.ts`). A line that is not one of them is a
 * continuation of the line above (an instruction that wrapped), never a new field —
 * a free-text instruction containing `Foo: bar` must not become a row called "Foo".
 * The note is returned verbatim as `raw` as well, so a label this parser has not
 * learnt yet is never invisible to staff.
 *
 * What does have a column is read from the column, not the note: the document rows
 * (`tbl_order_dl_checklist`), the company (`tbl_cls_order.department`), the return
 * address (`order_return_document_details`, including its country and the order
 * instructions in `additional_comment`).
 */

/** Who writes the note — `recordOrderNote` in `orders.lodge.ts`. Keep in step. */
export const WEBSITE_NOTE_AUTHOR = 'Website order form';

/** `DeliveryHandlingId` in the frontend's `config/attestationCatalogue`, as labelled there. */
const DELIVERY_LABEL: Record<string, string> = {
  cls: 'CLS handles it',
  self: 'I’ll handle it',
};

/** The line `describeAttestationRequest` writes when the client has no return address yet. */
const RETURN_ADDRESS_PENDING = 'Not available yet';

/** Every label `describeAttestationRequest` can write. Anything else is a continuation. */
const KNOWN_LABELS = [
  'Destination',
  'Document origin',
  'Indicative route',
  'Document type',
  'Services',
  'Contact',
  'Email',
  'Phone',
  'Address',
  'Delivery',
  'Company',
  'Needed by',
  'Documents',
  'Original documents',
  'Client reference',
  'Commercial invoice no.',
  'Return address',
  'Order instructions',
] as const;

type KnownLabel = (typeof KNOWN_LABELS)[number];

const KNOWN = new Set<string>(KNOWN_LABELS);

export interface LegalisationRequestAddress {
  /** The address exactly as the form stored it, comma separated. */
  raw: string;
  /** Address lines 1 and 2, joined. Null when the text could not be split. */
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  country: string | null;
}

export interface LegalisationRequestDocument {
  id: number;
  name: string | null;
  quantity: number | null;
  /** The client's note on this document, without the "Files to follow" suffix. */
  note: string | null;
  /** File names the client attached to this document in the form. */
  files: string[];
}

export interface LegalisationRequest {
  /**
   * Whether the order carries the website form's summary note. False for an order
   * CLS keyed in by hand (or lodged by the legacy application): the panels then
   * show only what has a column.
   */
  fromWebsite: boolean;
  /** `tbl_order_notes.id` of that note, so the screen can say where it came from. */
  noteId: number | null;
  requirements: {
    destination: string | null;
    documentOrigin: string | null;
    /** The pathway the client asked for ("Apostille", "Embassy legalisation", …). */
    indicativeRoute: string | null;
    /** The document group the client chose: personal or commercial documents. */
    documentType: string | null;
    /** The Type of Service tick-list, one entry per ticked service ("Other: …" included). */
    services: string[];
    /** The "latest date documents needed", as the form sent it. */
    neededBy: string | null;
    /** The "Sending Originals to CLS Office" tick. */
    sendingOriginals: boolean;
    clientReference: string | null;
    commercialInvoiceNumber: string | null;
  };
  contact: {
    /** `tbl_cls_order.department` — where the form's Company is stored. */
    company: string | null;
    address: LegalisationRequestAddress | null;
  };
  documents: LegalisationRequestDocument[];
  delivery: {
    /** `cls` | `self`, or null when the order has no website note. */
    handling: 'cls' | 'self' | null;
    handlingLabel: string | null;
    /** "Return address is not available at this time" was ticked. */
    returnAddressUnavailable: boolean;
    /**
     * Whether the return address is the contact address. **Derived**, not stored:
     * the form resolves "same as my contact address" into the spelled-out address
     * before it sends, so equality is the only trace left. Null when there is
     * nothing to compare.
     */
    sameAsContactAddress: boolean | null;
    /** The return address as the form's summary line has it, when one was given. */
    returnAddress: string | null;
    /** The order instructions (`additional_comment`, falling back to the note's line). */
    instructions: string | null;
  };
  /** The whole note as stored, for anything the parser above does not map. */
  raw: string | null;
}

/** The first line of the note's text for each known label, with wrapped lines folded in. */
const parseLines = (text: string): Map<KnownLabel, string> => {
  const fields = new Map<KnownLabel, string>();
  let open: KnownLabel | null = null;

  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Za-z][A-Za-z .]{0,30}):[ \t]*(.*)$/.exec(line);

    const label = match?.[1] ?? '';

    if (match && KNOWN.has(label) && !fields.has(label as KnownLabel)) {
      open = label as KnownLabel;
      fields.set(open, (match[2] ?? '').trim());
      continue;
    }

    // A wrapped value: keep the author's own line breaks.
    if (open) fields.set(open, `${fields.get(open) ?? ''}\n${line}`.trimEnd());
  }

  return fields;
};

/**
 * `"1 High St, Unit 2, Sydney, NSW, 2000, Australia"` → its parts.
 *
 * The form writes `line1, line2, city, state, postcode, country` with blanks
 * dropped; line1, city, state, postcode and country are all required, so at least
 * five parts survive and the last four are always city to country. A value with
 * fewer is returned as `raw` only, rather than guessed at.
 */
export const splitAddress = (raw: string | null): LegalisationRequestAddress | null => {
  const text = clean(raw);
  if (!text) return null;

  const parts = text.split(',').map((part) => part.trim());

  if (parts.length < 5) {
    return { raw: text, address: null, city: null, state: null, postcode: null, country: null };
  }

  const [country, postcode, state, city] = [...parts].reverse();

  return {
    raw: text,
    address: parts.slice(0, -4).join(', ') || null,
    city: city || null,
    state: state || null,
    postcode: postcode || null,
    country: country || null,
  };
};

/** `"Files to follow: a.pdf, b.pdf"` rides on the document note — see the attestation route handler in the frontend. */
const FILES_SUFFIX = /(?:^|\s—\s)Files to follow:\s*(.*)$/;

/** A checklist row's note, split into the client's words and the file names. */
export const splitDocumentNote = (
  value: string | null
): { note: string | null; files: string[] } => {
  const text = clean(value);
  if (!text) return { note: null, files: [] };

  const match = FILES_SUFFIX.exec(text);
  if (!match) return { note: text, files: [] };

  return {
    note: clean(text.slice(0, match.index)),
    files: (match[1] ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean),
  };
};

/** The oldest website-form note on the order, or null. */
export const websiteNoteOf = (rows: readonly OrderNotes[]): OrderNotes | null => {
  const candidates = rows
    .filter((row) => clean(row.note_by_name) === WEBSITE_NOTE_AUTHOR && !clean(row.document_type))
    .sort((a, b) => a.id - b.id);

  return candidates[0] ?? null;
};

const splitList = (value: string | null): string[] =>
  (value ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);

export const requestOf = (input: {
  notes: readonly OrderNotes[];
  checklist: readonly OrderDlChecklist[];
  returnDocument: OrderReturnDocumentDetails | null;
  /** `tbl_cls_order.department`. */
  department: string | null;
}): LegalisationRequest => {
  const note = websiteNoteOf(input.notes);
  const raw = clean(note?.note);
  const fields = raw ? parseLines(raw) : new Map<KnownLabel, string>();
  const value = (label: KnownLabel): string | null => clean(fields.get(label));

  const contactAddress = splitAddress(value('Address'));
  const returnLine = value('Return address');
  const unavailable = returnLine?.startsWith(RETURN_ADDRESS_PENDING) ?? false;
  const returnAddress = returnLine && !unavailable ? returnLine : null;
  const handling = value('Delivery');

  return {
    fromWebsite: raw !== null,
    noteId: note?.id ?? null,
    requirements: {
      destination: value('Destination'),
      documentOrigin: value('Document origin'),
      indicativeRoute: value('Indicative route'),
      documentType: value('Document type'),
      services: splitList(value('Services')),
      neededBy: value('Needed by'),
      sendingOriginals: fields.has('Original documents'),
      clientReference: value('Client reference'),
      commercialInvoiceNumber: value('Commercial invoice no.'),
    },
    contact: {
      company: clean(input.department),
      address: contactAddress,
    },
    documents: input.checklist.map((row) => {
      const { note: text, files } = splitDocumentNote(row.note);

      return { id: row.id, name: clean(row.type), quantity: row.number, note: text, files };
    }),
    delivery: {
      handling: handling === 'cls' || handling === 'self' ? handling : null,
      handlingLabel: handling ? (DELIVERY_LABEL[handling] ?? handling) : null,
      returnAddressUnavailable: unavailable,
      sameAsContactAddress:
        returnAddress && contactAddress ? returnAddress === contactAddress.raw : null,
      returnAddress,
      instructions: clean(input.returnDocument?.additional_comment) ?? value('Order instructions'),
    },
    raw,
  };
};
