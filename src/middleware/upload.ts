import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer, { type FileFilterCallback } from 'multer';
import type { Request } from 'express';
import { env } from '../config/env';
import { badRequest } from '../shared/errors';

/**
 * Accepting uploaded files.
 *
 * The legacy tables store a filename in a `varchar(255)` — `document`,
 * `passport_photo`, `attachment_file` — and the old application resolved it
 * against a directory on its own server. This API writes new files under
 * `UPLOAD_DIR` and records the same kind of relative name, so the two remain
 * interchangeable.
 *
 * **Nothing is served statically.** `/uploads` is not mounted as a static
 * directory anywhere in this codebase, and it must not be: these files are
 * passport scans and birth certificates, and a static mount makes every one of
 * them readable by anyone who can guess a filename. Downloads go through an
 * endpoint that checks ownership first.
 */

/**
 * What may be uploaded.
 *
 * An allowlist by both extension and MIME type, and both have to agree. A
 * browser will happily report `application/pdf` for a file called `x.php`, and
 * the extension is what ends up in a `varchar` column that some other system
 * may later hand to a web server.
 */
const ALLOWED: Record<string, readonly string[]> = {
  '.pdf': ['application/pdf'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.webp': ['image/webp'],
  '.heic': ['image/heic', 'image/heif'],
  '.doc': ['application/msword'],
  '.docx': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED);

/**
 * A stored name that cannot escape its directory or collide.
 *
 * The client's filename is never used on disk. It arrives from a browser, it can
 * contain `../`, a null byte or four hundred characters of Unicode, and any of
 * those in a path is a problem. The original is kept in the database column
 * instead, where it is only ever data.
 */
const storedName = (originalName: string): string => {
  const extension = path.extname(originalName).toLowerCase();
  const stamp = Date.now();
  const nonce = crypto.randomBytes(6).toString('hex');
  return `${stamp}-${nonce}${extension}`;
};

const ensureDir = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true });
};

const storage = multer.diskStorage({
  destination: (req: Request, _file, callback) => {
    // One subdirectory per client, so a directory listing does not put every
    // client's documents side by side, and a mistaken bulk delete is bounded.
    const owner = req.auth?.sub;
    const dir = owner
      ? path.join(env.uploads.dir, 'clients', String(owner))
      : path.join(env.uploads.dir, 'unassigned');

    try {
      ensureDir(dir);
      callback(null, dir);
    } catch (error) {
      callback(error as Error, dir);
    }
  },

  filename: (_req, file, callback) => {
    callback(null, storedName(file.originalname));
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback
): void => {
  const extension = path.extname(file.originalname).toLowerCase();
  const permitted = ALLOWED[extension];

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
  storage,
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
 * Where a stored name resolves to on disk, or null if it escapes the root.
 *
 * The null case is the point. A column value of `../../etc/passwd` — whether
 * from an old bug or a deliberate write — must not resolve, and checking the
 * resolved path is inside the root is the only reliable way to know.
 */
export const resolveUploadPath = (
  storedPath: string,
  root: string = env.uploads.dir
): string | null => {
  const resolved = path.resolve(root, storedPath);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;

  return resolved === root || resolved.startsWith(rootWithSep) ? resolved : null;
};

/**
 * Where a legacy document lives, or null.
 *
 * Null when `LEGACY_UPLOAD_DIR` is unset, which is the default. Until CLS
 * mounts the old application's document directory, a download of a legacy file
 * answers "not available" rather than reading from a path this process guessed.
 */
export const resolveLegacyPath = (storedPath: string): string | null => {
  if (!env.uploads.legacyDir) return null;
  return resolveUploadPath(storedPath, env.uploads.legacyDir);
};

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

/** Size on disk, or null when the file is missing. */
export const fileSize = (absolutePath: string): number | null => {
  try {
    return fs.statSync(absolutePath).size;
  } catch {
    return null;
  }
};
