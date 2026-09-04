import crypto from 'node:crypto';
import path from 'node:path';
import multer, { type FileFilterCallback, type StorageEngine } from 'multer';
import type { Request } from 'express';
import { env } from '../config/env';
import {
  ALLOWED_EXTENSIONS,
  contentTypeFor,
  mediaTypesFor,
} from '../domain/documentFormats';
import {
  MAX_TRANSLATION_DOCUMENTS,
  TRANSLATION_DOCUMENT_DIR,
  TRANSLATION_SLUG_MAX,
} from '../domain/translationDocuments';
import { discardDocument, saveDocument } from '../shared/storage/documents';
import { badRequest } from '../shared/errors';

/**
 * Accepting uploaded files.
 *
 * The legacy tables store a filename in a `varchar(255)` — `document`,
 * `passport_photo`, `attachment_file` — and the old application resolved it
 * against a directory on its own server. This API records the same kind of
 * relative name and hands the bytes to `shared/storage/documents`, which puts
 * them in the S3 bucket when one is configured and under `UPLOAD_DIR` when it is
 * not. **The recorded name is identical either way**, so a row written before the
 * bucket existed and one written after are interchangeable — see that module for
 * why they have to be.
 *
 * **Nothing is served statically, from either place.** `/uploads` is not mounted
 * as a static directory anywhere in this codebase and the bucket holds no public
 * objects: these files are passport scans and birth certificates, and either would
 * make every one of them readable by anyone who can guess a name. Downloads go
 * through an endpoint that checks ownership first.
 */

export { ALLOWED_EXTENSIONS };

/**
 * Where a stored document resolves to, re-exported.
 *
 * These moved to `shared/storage/documents` when S3 arrived, because the read
 * path needs them and importing the upload middleware to get at a path resolver
 * would have pulled multer into it. Re-exported so the existing callers and their
 * tests keep their import.
 */
export { resolveLegacyPath, resolveUploadPath } from '../shared/storage/documents';

/**
 * The client's own filename, reduced to something safe to put in a path.
 *
 * Letters, digits and dashes only, so nothing survives that could mean anything
 * to a filesystem or a shell: no `..`, no separators, no null bytes, no Unicode.
 * Capped at 60 characters because the whole stored name has to fit a
 * `varchar(255)` alongside its directory prefix.
 *
 * An empty result is normal — a file called `照片.jpg` slugs to nothing — and the
 * caller drops the segment entirely rather than leaving a stray dash.
 */
export const slugForPath = (name: string): string =>
  path
    .basename(name, path.extname(name))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

/**
 * A stored name that cannot escape its directory or collide.
 *
 * The client's filename is never used on disk — or as a bucket key — *as given*.
 * It arrives from a browser, it can contain `../`, a null byte or four hundred
 * characters of Unicode, and any of those in a path is a problem.
 *
 * ## Why a slug of it is kept anyway
 *
 * `tbl_cls_order_documents` has no original-name column, so the stored name is
 * the only name anything downstream can show — and `1755781234-a3f2c1.pdf` told
 * both the client and their consultant nothing. Whoever opened the portal's
 * documents screen saw a list of timestamps and had to download each one to find
 * out which was the passport. A slugged copy of the original rides along in the
 * same `varchar(255)`: `1755781234-a3f2c1-passport-john.pdf`.
 *
 * The timestamp and nonce still lead, so uniqueness never depends on the part
 * that came from the browser, and the slug is an allowlist rather than an escape
 * — a name that slugs to nothing simply loses the segment.
 */
export const storedName = (originalName: string): string => {
  const extension = path.extname(originalName).toLowerCase();
  const stamp = Date.now();
  const nonce = crypto.randomBytes(6).toString('hex');
  const slug = slugForPath(originalName);

  return `${stamp}-${nonce}${slug ? `-${slug}` : ''}${extension}`;
};

/**
 * A stored name for a translation enquiry's document — the same guarantees, in
 * fewer characters.
 *
 * `storedName` spends 25 characters on a decimal millisecond timestamp and a
 * twelve-character nonce before it gets to the slug, which is free when the value
 * has a `varchar(255)` row to itself. A translation enquiry has one
 * `varchar(225)` for **every** document on it, so the same budget has to cover
 * five names and their separators — see `domain/translationDocuments` for the
 * arithmetic that fixes the cap.
 *
 * Base-36 milliseconds and three random bytes get the prefix from 25 characters
 * to 14 while keeping what the prefix is for: ordering by time, and uniqueness
 * that does not depend on anything the browser said. Three bytes is 16.7 million
 * values within a single millisecond, against the five files one request can
 * carry.
 */
export const translationStoredName = (originalName: string): string => {
  const extension = path.extname(originalName).toLowerCase();
  const stamp = Date.now().toString(36);
  const nonce = crypto.randomBytes(3).toString('hex');

  // Re-stripped after the cut: slicing `birth-certificate-long` to 20 can land
  // on a dash, and a trailing one would read as a missing name segment.
  const slug = slugForPath(originalName)
    .slice(0, TRANSLATION_SLUG_MAX)
    .replace(/-+$/g, '');

  return `${stamp}-${nonce}${slug ? `-${slug}` : ''}${extension}`;
};

/**
 * The directory segment a request's uploads belong under.
 *
 * One per client, so neither a bucket listing nor a directory listing puts every
 * client's documents side by side, and a mistaken bulk delete is bounded. A
 * request with no session — a guest lodging an order through the internal
 * documents endpoint — lands in `unassigned`, and the row that records it is what
 * ties it to an order.
 */
const directoryFor = (req: Request): string => {
  const owner = req.auth?.sub;
  return owner ? `clients/${String(owner)}` : 'unassigned';
};

/**
 * Multer's storage, delegating to whichever driver is configured.
 *
 * A custom engine rather than `multer.diskStorage` or `multer-s3`. The first
 * cannot reach a bucket; the second is a second dependency that would know only
 * about S3, leaving the local path to be handled by swapping engines at boot and
 * two code paths to keep in step. This one asks `storage/documents` to write the
 * stream and reports back whichever of a disk path or a bucket key came of it.
 *
 * ## What the callback has to return
 *
 * `info` is merged onto the file object, so `size` is what downstream reads as
 * `file.size` and `key` is what `storedPathOf` reads to build the database value.
 * `key` is set on the file **before** the write begins as well, because multer's
 * abort path only cleans up an in-flight file that has a `path` on it — see
 * `_removeFile`.
 */
/** What a `DocumentStorage` may be told to do differently. */
interface DocumentStorageOptions {
  /**
   * The directory segment this engine's uploads belong under. Defaults to
   * `directoryFor` — one per signed-in client, `unassigned` for a guest.
   */
  directory?: (req: Request) => string;
  /**
   * How a stored file is named. Defaults to `storedName`; the translation
   * enquiry's engine passes the shorter one, because five of its names have to
   * share a single column.
   */
  name?: (originalName: string) => string;
}

class DocumentStorage implements StorageEngine {
  constructor(private readonly options: DocumentStorageOptions = {}) {}

  _handleFile(
    req: Request,
    file: Express.Multer.File,
    callback: (error?: unknown, info?: Partial<Express.Multer.File>) => void
  ): void {
    const directory = (this.options.directory ?? directoryFor)(req);
    const filename = (this.options.name ?? storedName)(file.originalname);
    const storedPath = `${directory}/${filename}`;

    // Set now rather than in the callback, so a request that fails while this
    // file is still being written leaves multer something to clean up. This
    // mirrors what `diskStorage` does with `file.path`.
    file.key = storedPath;
    file.path = path.join(env.uploads.dir, storedPath);

    // Already gone — the request was aborted before this file's turn. Matches
    // `diskStorage`, which returns without calling back so multer's pending
    // count is settled by the abort rather than by a write that never happened.
    if (file.stream.destroyed) return;

    saveDocument({
      storedPath,
      stream: file.stream,
      // The mimetype the browser sent, which `fileFilter` has already checked
      // against the extension. Derived from the name only if it is missing.
      contentType: file.mimetype || contentTypeFor(file.originalname),
    })
      .then((saved) => {
        callback(null, {
          key: storedPath,
          storedIn: saved.copies,
          destination: path.dirname(file.path),
          filename,
          // The local copy's path when the disk took it. When only the bucket
          // did, the path it *would* have had — nothing reads it to find the
          // bytes (`storedPathOf` and `discardDocument` both work from `key`),
          // and a null here would be a lie of a different kind.
          path: saved.absolutePath ?? file.path,
          size: saved.bytes,
        });
      })
      .catch((error: unknown) => callback(error));
  }

  /**
   * Throws away every copy of a file multer has abandoned.
   *
   * Called for each file already written when a request fails — one file in a set
   * breaking the size limit is the ordinary cause, and it must not leave the other
   * nine stored against nothing. `discardDocument` works from the stored path and
   * removes the bucket object *and* the local copy, which matters here: removing
   * one of the two would leave the read path happily serving the other.
   *
   * The callback is always given `null`. `discardDocument` logs what it could not
   * remove; surfacing it here would replace the client's "that file is too large"
   * with a storage error about the cleanup.
   */
  _removeFile(
    _req: Request,
    file: Express.Multer.File,
    callback: (error: Error | null) => void
  ): void {
    void discardDocument(file.key ?? file.path).then(() => callback(null));
  }
}

/**
 * What may be uploaded.
 *
 * An allowlist by both extension and MIME type, and both have to agree. A browser
 * will happily report `application/pdf` for a file called `x.php`, and the
 * extension is what ends up in a `varchar` column that some other system may
 * later hand to a web server. The table itself lives in `domain/documentFormats`,
 * because the download route needs the same one to decide what to serve a file
 * back as.
 */
const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback
): void => {
  const extension = path.extname(file.originalname).toLowerCase();
  const permitted = mediaTypesFor(extension);

  if (!permitted) {
    callback(
      badRequest(
        `We accept ${ALLOWED_EXTENSIONS.join(', ')} files. That one is a ${extension || 'file with no extension'}.`
      )
    );
    return;
  }

  if (!permitted.includes(file.mimetype)) {
    callback(
      badRequest(
        'That file’s contents do not match its name. Please re-save it and try again.'
      )
    );
    return;
  }

  callback(null, true);
};

export const upload = multer({
  storage: new DocumentStorage(),
  fileFilter,
  limits: {
    fileSize: env.uploads.maxBytes,
    // Ten per request. A client attaching more than ten documents to one order
    // in a single go is a bulk job that should be a conversation with CLS.
    files: 10,
    fields: 30,
  },
});

/** One file, on the field the website's forms post. */
export const singleFile = upload.single('file');

/** Several files, matching the portal's multi-select upload. */
export const manyFiles = upload.array('documents', 10);

/**
 * The documents attached to a NAATI translation enquiry.
 *
 * Its own multer instance rather than a third field on `upload`, because two of
 * the three things that make an upload are different here. The bytes go to
 * `service_translation/` instead of under the client's own directory — a
 * translation enquiry is not an order, has no `client_id` to file it under, and
 * is answered out of a queue CLS's admin already resolves against that directory
 * name. And the names are the compact ones, because the enquiry's whole document
 * record is one `varchar(225)`.
 *
 * The file cap is `MAX_TRANSLATION_DOCUMENTS` for that same reason, and is
 * derived from the column width rather than chosen — multer refusing the sixth
 * file is the same limit the browser's picker enforces, so the two cannot drift.
 */
export const translationEnquiryFiles = multer({
  storage: new DocumentStorage({
    directory: () => TRANSLATION_DOCUMENT_DIR,
    name: translationStoredName,
  }),
  fileFilter,
  limits: {
    fileSize: env.uploads.maxBytes,
    files: MAX_TRANSLATION_DOCUMENTS,
    fields: 30,
  },
}).array('documents', MAX_TRANSLATION_DOCUMENTS);

/** Extension and size, for the `meta` line the portal renders. */
export const describeFile = (
  filename: string | null,
  bytes: number | null
): string | null => {
  if (!filename) return null;

  const extension = path.extname(filename).replace('.', '').toUpperCase();
  const parts: string[] = [];

  if (extension) parts.push(extension);
  if (bytes !== null && bytes > 0) {
    parts.push(
      bytes < 1024 * 1024
        ? `${Math.max(1, Math.round(bytes / 1024))} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    );
  }

  return parts.length > 0 ? parts.join(' · ') : null;
};
