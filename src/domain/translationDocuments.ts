/**
 * Where a translation enquiry's documents are kept, and how their names fit the
 * one column the schema gives them.
 *
 * ## The column is the whole constraint
 *
 * `tbl_translation_services` has exactly one place for a document:
 * `document_name varchar(225)`. There is no join table, no `order_id` to hang
 * rows off, and this API issues no DDL — so every attachment on a translation
 * enquiry has to be findable from that single string. That is the reason this
 * module exists rather than the packing being three lines in the route.
 *
 * ## The value is a bare filename, because that is what the admin reads
 *
 * CLS's own admin already has a download for these:
 * `ManageGeneralSettings:translationServicesDownload` takes `?filename=` and
 * resolves it against `web/dev/service_translation/`. The legacy public form fed
 * it by writing the client's own upload name straight into the column and
 * moving the bytes into that directory.
 *
 * So the value stays a **bare filename** and the directory stays a constant. A
 * single-document enquiry — which is nearly all of them, and all of them under
 * the old form — produces exactly the shape that admin already handles, and only
 * the directory it looks in has to move.
 *
 * ## What changes, and what it buys
 *
 * The legacy form used the client's own filename verbatim. Two clients attaching
 * `scan.pdf` overwrote each other, silently, and the second enquiry's row pointed
 * at the first client's document. The stored name now leads with a timestamp and
 * a nonce, so uniqueness never depends on anything a browser said, and carries a
 * slug of the original so a consultant reading the queue can still tell a
 * passport from a birth certificate.
 *
 * ## Why several names in one column, and why the cap is what it is
 *
 * The form takes more than one file — a certificate and its previous translation
 * is an ordinary pair — so the column holds a comma-separated list. That list has
 * to fit 225 characters in the worst case, not the average one, because the
 * failure mode of guessing is a truncated filename that resolves to nothing.
 *
 * `MAX_TRANSLATION_DOCUMENTS` is therefore derived from the arithmetic below
 * rather than picked, and `translationDocuments.test.ts` asserts the relation
 * holds. Nothing here rounds up: a name that would not fit is reported to the
 * caller so the client is told, rather than being stored against a column entry
 * that was cut in half.
 */

/**
 * The directory the bytes go in, under `UPLOAD_DIR` and under `S3_PREFIX` alike.
 *
 * Named after the legacy one on purpose. CLS's admin resolves `?filename=`
 * against `web/dev/service_translation/`, so keeping the last segment identical
 * means the two paths differ only by their root — which is the difference an
 * operator can bridge with a mount or a bucket sync, without anybody re-reading
 * the column format.
 */
export const TRANSLATION_DOCUMENT_DIR = 'service_translation';

/** `tbl_translation_services.document_name` is a `varchar(225)`. Not 255. */
export const TRANSLATION_DOCUMENT_NAME_MAX = 225;

/**
 * How the names are joined in that column.
 *
 * A comma and no space, both to save a character per document and because a
 * consumer splitting the value wants one unambiguous delimiter. A stored name
 * cannot contain a comma: `slugForPath` reduces the client's name to `[a-z0-9-]`,
 * and the timestamp, nonce and extension add nothing else.
 */
export const TRANSLATION_DOCUMENT_SEPARATOR = ',';

/**
 * How much of the client's own filename survives into the stored one.
 *
 * Shorter than the 60 an order document gets, and for a reason that is arithmetic
 * rather than taste: an order document has a `varchar(255)` row of its own, while
 * these share one column with every other document on the enquiry. Twenty is
 * enough for `birth-certificate` and `passport-john`, which is what the slug is
 * for.
 */
export const TRANSLATION_SLUG_MAX = 20;

/** Base-36 milliseconds — eight characters until the year 5138. */
const STAMP_LENGTH = 8;

/** Three random bytes as hex. */
const NONCE_LENGTH = 6;

/**
 * The longest extension on the upload allowlist, with its dot — `.jpeg`,
 * `.docx`, `.webp`.
 *
 * Asserted against `ALLOWED_EXTENSIONS` in the tests rather than derived from it
 * here, because importing the allowlist would make this module depend on the
 * upload middleware's half of the story instead of only stating the column's.
 */
const LONGEST_EXTENSION = 5;

/**
 * The longest a stored name can be: stamp, nonce, slug and extension.
 *
 * Every separator counted — one after the stamp, one before the slug.
 */
export const TRANSLATION_NAME_MAX =
  STAMP_LENGTH + 1 + NONCE_LENGTH + 1 + TRANSLATION_SLUG_MAX + LONGEST_EXTENSION;

/**
 * How many documents one translation enquiry can carry.
 *
 * Derived, not chosen: it is the largest number of worst-case names that fit the
 * column with their separators. The picker on both surfaces of the form is capped
 * at the same number, so a client is stopped at the control rather than told
 * afterwards that a document they attached had nowhere to go.
 */
export const MAX_TRANSLATION_DOCUMENTS = Math.floor(
  (TRANSLATION_DOCUMENT_NAME_MAX + TRANSLATION_DOCUMENT_SEPARATOR.length) /
    (TRANSLATION_NAME_MAX + TRANSLATION_DOCUMENT_SEPARATOR.length)
);

/** The stored path for one of these documents, as `saveDocument` wants it. */
export const translationDocumentPath = (filename: string): string =>
  `${TRANSLATION_DOCUMENT_DIR}/${filename}`;

/** What a set of stored names came to once packed into the column. */
export interface PackedTranslationDocuments {
  /** The column value, or null when there is nothing to record. */
  value: string | null;
  /** The names the column holds, in the order they were attached. */
  stored: string[];
  /**
   * The names that did not fit, so the caller can discard their bytes and say so.
   *
   * Empty in every case the form can produce — the picker's cap is derived from
   * the same arithmetic. It is not empty when this endpoint is called directly
   * with more files than the form would allow, and an unreferenced object in the
   * bucket is worse than a refusal.
   */
  dropped: string[];
}

/**
 * Fits as many stored names into `document_name` as the column will hold.
 *
 * Greedy and in order, so the first document a client attached is the one that is
 * certain to be kept. Blank entries are skipped rather than producing an empty
 * list item, which would read back as a filename of nothing and resolve to the
 * directory itself.
 */
export const packTranslationDocumentNames = (
  names: readonly string[]
): PackedTranslationDocuments => {
  const stored: string[] = [];
  const dropped: string[] = [];
  let length = 0;

  for (const name of names) {
    const trimmed = name.trim();

    if (!trimmed) continue;

    const cost =
      trimmed.length +
      (stored.length > 0 ? TRANSLATION_DOCUMENT_SEPARATOR.length : 0);

    if (length + cost > TRANSLATION_DOCUMENT_NAME_MAX) {
      dropped.push(trimmed);
      continue;
    }

    stored.push(trimmed);
    length += cost;
  }

  return {
    value: stored.length > 0 ? stored.join(TRANSLATION_DOCUMENT_SEPARATOR) : null,
    stored,
    dropped,
  };
};

/** What one enquiry has to fit into `document_name`. */
export interface TranslationColumnInput {
  /**
   * The packed filename list — `packTranslationDocumentNames(...).value` — or
   * null when nothing was attached.
   *
   * Packed by the caller rather than here, because the caller needs the rest of
   * that result anyway: `stored` to build its response, `dropped` to discard the
   * bytes nothing will reference.
   */
  documents: string | null;
  /** What the client says they are sending, in words. Null when they did not. */
  documentName: string | null;
  /** A free-text note. Null when there is none. */
  note: string | null;
}

/** The column, and whether the note made it in. */
export interface TranslationColumnChoice {
  /** What to write, or null when there is nothing to record. */
  value: string | null;
  /**
   * Whether the note is in the value.
   *
   * False whenever a note was given and did not fit, **including** when there
   * was no document name to append it to — that is the case the first version
   * of this got wrong, reporting a lost note as a stored one. The caller turns
   * false into the warning that tells the client to email it.
   */
  noteStored: boolean;
}

/**
 * Decides what goes in `document_name`.
 *
 * One column, three things that want it, and a priority that is not arbitrary:
 *
 * 1. **The stored filenames**, when documents were attached. A name that does
 *    not resolve is a document nobody can open, and the bytes are already in
 *    the bucket — so this is the only value that can lose something
 *    irrecoverable by being left out.
 * 2. **The document name with the note appended**, when both were given and
 *    the pair fits. This is the legacy behaviour and it stands untouched for an
 *    enquiry with nothing attached.
 * 3. **The document name alone**, when the pair does not fit.
 *
 * A note is never truncated to make it fit. Half a sentence in a queue is worse
 * than a warning telling the client where to send the whole one.
 */
export const chooseTranslationColumn = (
  input: TranslationColumnInput
): TranslationColumnChoice => {
  const documentName = input.documentName?.trim() || null;
  const note = input.note?.trim() || null;

  const withNote =
    documentName && note
      ? `${documentName} — ${note}`
      : null;

  const fitsWithNote =
    withNote !== null && withNote.length <= TRANSLATION_DOCUMENT_NAME_MAX;

  if (input.documents !== null) {
    // The filenames take the column, so a note given alongside them is not in
    // it — whether or not it would have fitted on its own.
    return { value: input.documents, noteStored: false };
  }

  if (fitsWithNote) return { value: withNote, noteStored: true };

  return { value: documentName, noteStored: false };
};

/**
 * The filenames a `document_name` holds.
 *
 * The read half of the format, and deliberately tolerant of what the legacy form
 * left behind. A value written before this change is one filename with no
 * separator in it, which comes back as a single-entry list; a value that is a
 * client's free-text note rather than a filename comes back as that one string,
 * which is exactly what the admin queue has always rendered.
 */
export const splitTranslationDocumentNames = (
  value: string | null | undefined
): string[] =>
  (value ?? '')
    .split(TRANSLATION_DOCUMENT_SEPARATOR)
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
