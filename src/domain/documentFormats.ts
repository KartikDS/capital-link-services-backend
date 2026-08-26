import path from 'node:path';

/**
 * What may be uploaded, and what a stored file is served back as.
 *
 * Shared rather than kept beside the upload middleware, because two unrelated
 * places need the same table and they need it to agree. The middleware reads it
 * to decide whether to accept a file; the download route reads it to decide what
 * `Content-Type` to put on the response. When those two disagree, a `.docx` goes
 * in and comes back out as `application/octet-stream`, and the client's browser
 * offers to save a file it cannot name.
 *
 * ## Why both extension and MIME type
 *
 * Both have to agree for a file to be accepted. A browser will happily report
 * `application/pdf` for a file called `x.php`, and the extension is what ends up
 * in a `varchar` column that some other system may later hand to a web server.
 */
const FORMATS: Record<string, readonly string[]> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.heic': ['image/heic', 'image/heif'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

/** Every extension a client may upload, lower case and with the dot. */
export const ALLOWED_EXTENSIONS = Object.keys(FORMATS);

/** The media types this extension may legitimately arrive as, or null. */
export const mediaTypesFor = (extension: string): readonly string[] | null =>
  FORMATS[extension.toLowerCase()] ?? null;

/**
 * What to serve a stored file back as, from its name alone.
 *
 * The name is all there is for a file on the local disk, and for one in the
 * bucket it is the fallback when the object carries no `Content-Type` of its own.
 * `application/octet-stream` for anything unrecognised — a stored name that is
 * not on the allowlist predates it, and guessing at that point would be inventing
 * a type for a file nothing has validated.
 */
export const contentTypeFor = (filename: string): string => {
  const types = mediaTypesFor(path.extname(filename));
  return types?.[0] ?? 'application/octet-stream';
};
