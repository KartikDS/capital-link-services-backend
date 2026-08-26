import fs from 'node:fs';
import path from 'node:path';
import {
  PassThrough,
  Transform,
  type Readable,
  type TransformCallback,
} from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { env } from '../../config/env';
import { contentTypeFor } from '../../domain/documentFormats';
import { logger } from '../logger';
import { deleteObject, getObject, objectExists, putObject, s3Configured } from './s3';

/**
 * Where a client's documents are kept, and how they are read back.
 *
 * One module, two drivers. Everything above this — the upload middleware, the
 * portal's download routes, `orders.writes` — asks for a document by the same
 * relative path it always used and never learns which of the two answered.
 *
 * ## The stored path is unchanged, and has to be
 *
 * `tbl_cls_order_documents.document` is a `varchar(255)` holding a path relative
 * to the upload root — `clients/9210/1755781234-a3f2c1-passport.pdf`. That column
 * is CLS's, their own admin reads it, and this API issues no DDL: so moving the
 * bytes into a bucket must not change what goes in the column. The bucket key is
 * that same path with `S3_PREFIX` in front, added inside `storage/s3` and never
 * stored.
 *
 * The consequence worth stating: **a stored path does not say where the file is.**
 * A row written last month has its file on the local disk; one written after S3
 * was configured has it in the bucket; a row from the old application has it under
 * `LEGACY_UPLOAD_DIR`. The three are indistinguishable in the database, which is
 * why `openDocument` tries all three rather than trusting the driver.
 *
 * ## Why the local disk is still here
 *
 * Two reasons, and neither is reluctance to commit.
 *
 * The first is the switch-over. Every document uploaded before the bucket was
 * configured is on disk, and a read path that only looked in S3 would answer "we
 * hold a record of that document but not the file itself" for all of them.
 *
 * The second is that S3 is optional by configuration: `S3_BUCKET` and its
 * credentials are unset until CLS provides them, and a deployment with them unset
 * has to keep working rather than refuse every upload. `documentStorageDriver`
 * says which is in force, and `/api/system/ready` reports it — because a
 * production container writing passport scans to its own ephemeral disk is a
 * configuration mistake worth being able to see.
 */

/**
 * Where new uploads are written.
 *
 * `s3+local` rather than `s3`, because a configured bucket does not replace the
 * disk — `saveDocument` writes both copies. See its note for why one sink failing
 * is not the upload failing.
 */
export type DocumentStorageDriver = 's3+local' | 'local';

export const documentStorageDriver: DocumentStorageDriver = s3Configured
  ? 's3+local'
  : 'local';

/** Whether documents are written somewhere other than this machine's disk. */
export const documentStorageIsRemote = s3Configured;

// ---------------------------------------------------------------------------
// Stored paths
// ---------------------------------------------------------------------------

/** `..` as a whole segment, under either separator. */
const TRAVERSAL = /(^|[/\\])\.\.($|[/\\])/;

/**
 * A stored path that is safe to use, or null.
 *
 * The null case is the point. `document` is a `varchar` in a schema this API does
 * not control, so its contents are input: a value of `../../etc/passwd` — whether
 * from an old bug or a deliberate write — must not resolve to anything. Rejected
 * rather than sanitised, because a mangled path that resolved to a *different*
 * client's file would be worse than a 404.
 *
 * A check and not a rewrite: the value comes back as it went in, so a legacy
 * filename holding a backslash still resolves the way the old application wrote
 * it.
 */
export const safeStoredPath = (storedPath: string): string | null => {
  const trimmed = storedPath.trim();

  if (!trimmed) return null;
  // A null byte truncates a path in some C libraries, which is how a `.pdf`
  // becomes a `.php` on the way to a filesystem.
  if (trimmed.includes('\u0000')) return null;
  if (path.isAbsolute(trimmed) || /^[A-Za-z]:/.test(trimmed)) return null;
  if (TRAVERSAL.test(trimmed)) return null;

  return trimmed;
};

/** The bucket-key form: forward slashes, whatever the row happens to hold. */
const asKey = (storedPath: string): string => storedPath.replace(/\\/g, '/');

/**
 * Where a stored path resolves to on disk, or null if it escapes the root.
 *
 * A resolved-path containment check rather than a string check, because that is
 * the only reliable way to know: symlinks, `.` segments and Windows short names
 * all mean the same file under different spellings.
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
 * Null when `LEGACY_UPLOAD_DIR` is unset, which is the default. Until CLS mounts
 * the old application's document directory, a download of a legacy file answers
 * "not available" rather than reading from a path this process guessed.
 */
export const resolveLegacyPath = (storedPath: string): string | null => {
  if (!env.uploads.legacyDir) return null;
  return resolveUploadPath(storedPath, env.uploads.legacyDir);
};

/**
 * The path to record for a file multer has just accepted.
 *
 * `key` is what the storage engine sets, and it is the stored path directly. The
 * fallback exists for the one case where it is absent: a test that hands
 * `attachDocuments` a file-shaped object with a `path` and nothing else, which is
 * how the declared-line matching is exercised without a multipart request.
 */
export const storedPathOf = (file: Express.Multer.File): string => {
  const key = file.key;
  if (key) return asKey(key);

  return path.relative(env.uploads.dir, file.path).replace(/\\/g, '/');
};

// ---------------------------------------------------------------------------
// Which copies exist
// ---------------------------------------------------------------------------

/** One of the three places a stored document can be. */
export type DocumentLocation = 's3' | 'local' | 'legacy';

/**
 * Every place that holds this document, in the order a read should prefer them,
 * each appearing at most once.
 *
 * ## Why the order is bucket, then disk, then legacy
 *
 * Not a preference for the newer thing. A bucket object is only ever *complete*:
 * a `PutObject` either happened or did not, and `Upload` aborts a failed
 * multipart rather than leaving its parts behind. A file on disk can be a
 * truncated write from a mirror that died halfway — `saveDocument` unlinks those,
 * but a process killed between the two would leave one. So the copy that cannot
 * be half-written is read first.
 *
 * `legacy` last because it is the old application's directory: the copy under
 * `UPLOAD_DIR` is the one this API wrote.
 *
 * ## Why a Set
 *
 * Because the same file can genuinely be found twice and the caller has to see it
 * once. Two copies are the same document when they have the same stored path —
 * that is what the database recorded, and it is deliberately the same string in
 * the bucket and on the disk.
 *
 * The `legacy` guard is the case that actually bites. A deployment that points
 * `LEGACY_UPLOAD_DIR` at `UPLOAD_DIR`, which is a natural thing to try, would
 * otherwise report two copies of every file: a caller removing "all of them"
 * would delete the same path twice and log a failure for the second.
 */
export const locateDocument = async (storedPath: string): Promise<DocumentLocation[]> => {
  const safe = safeStoredPath(storedPath);

  if (!safe) {
    logger.warn('Refused to locate a document by an unsafe stored path', {
      storedPath,
    });

    return [];
  }

  const found = new Set<DocumentLocation>();

  if (s3Configured && (await objectExists(asKey(safe)))) found.add('s3');

  const local = resolveUploadPath(safe);
  if (local && fs.existsSync(local)) found.add('local');

  const legacy = resolveLegacyPath(safe);
  // `legacy !== local` is the de-duplication: one absolute path reached through
  // two configured roots is one copy, not two.
  if (legacy && legacy !== local && fs.existsSync(legacy)) found.add('legacy');

  // Insertion order is the precedence order above, which is what callers rely on.
  return [...found];
};

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * Counts what passes through, and passes it through unchanged.
 *
 * Neither sink reports a size for free: multer's own `diskStorage` reads
 * `bytesWritten` off the write stream, `Upload` has no equivalent, and with two
 * sinks the count has to be taken once anyway rather than trusted from whichever
 * happened to finish. The size goes into the response the portal renders its
 * `meta` line from, and a missing one shows there as a document with no size.
 */
class ByteCounter extends Transform {
  bytes = 0;

  override _transform(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: TransformCallback
  ): void {
    this.bytes += chunk.length;
    callback(null, chunk);
  }
}

/** What a completed write came to. */
export interface SavedDocument {
  /** Bytes read from the client, whichever sinks took them. */
  bytes: number;
  /** The local copy's path, or null when the disk did not take it. */
  absolutePath: string | null;
  /** Every place the bytes reached. Never empty — a write with no copy throws. */
  copies: DocumentLocation[];
}

/**
 * Writes the local copy, and leaves nothing behind if it cannot.
 *
 * The unlink is the part worth having. A failed write leaves a partial file, and
 * half a passport scan that reads as present is worse than none: `locateDocument`
 * would report a copy that is not one, and a client would download a PDF that
 * does not open.
 */
const writeToDisk = async (source: Readable, absolutePath: string): Promise<void> => {
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });

  try {
    await pipeline(source, fs.createWriteStream(absolutePath));
  } catch (error) {
    await fs.promises.unlink(absolutePath).catch(() => undefined);
    throw error;
  }
};

/**
 * Writes a document to every place it belongs, from one read of the client.
 *
 * ## Both, not one
 *
 * With a bucket configured the bytes go to the bucket **and** under `UPLOAD_DIR`.
 * Two copies of a passport scan is the point: the bucket survives the container
 * being replaced, the local copy survives the bucket being unreachable, and the
 * read path prefers whichever is there.
 *
 * ## One read of the client's stream
 *
 * An upload arrives as a multipart part that can be read exactly once — it is not
 * a file this process can open twice — so the stream is tee'd into the two sinks
 * rather than buffered and replayed. Buffering would have been simpler and would
 * put `MAX_UPLOAD_MB` per concurrent file into the heap; a tee costs two
 * `PassThrough`s and the backpressure of the slower sink, which is the bucket.
 *
 * ## Why one sink failing is not the upload failing
 *
 * `Promise.allSettled`, and success is **either** sink taking the bytes. The
 * alternative is worse in both directions: failing the request because the bucket
 * was unreachable throws away a scan already safely on disk, and failing it
 * because the disk is read-only — a normal way to harden a container — would
 * break every upload on a deployment whose bucket works perfectly.
 *
 * A single-copy write is logged at `error` even though it succeeded, because it is
 * the failure nothing else will report: the client is told their document was
 * stored, and it was.
 */
export const saveDocument = async (args: {
  storedPath: string;
  stream: Readable;
  contentType: string | null;
}): Promise<SavedDocument> => {
  const counter = new ByteCounter();
  const absolutePath = path.join(env.uploads.dir, args.storedPath);

  // No bucket to mirror to, so the disk is the only copy and its failure is the
  // upload's failure.
  if (!s3Configured) {
    await writeToDisk(args.stream.pipe(counter), absolutePath);

    return { bytes: counter.bytes, absolutePath, copies: ['local'] };
  }

  const toDisk = new PassThrough();
  const toBucket = new PassThrough();

  /**
   * A listener on each, so that destroying one cannot take the process down.
   *
   * Both are destroyed on a source failure below, and by then their consumer may
   * already have let go of them — a stream destroyed with an error and no
   * listener is an uncaught exception, not a rejected promise. The consumers see
   * the failure through their own paths regardless.
   */
  toDisk.on('error', () => undefined);
  toBucket.on('error', () => undefined);

  // `pipe` does not forward a source failure to its destinations. A client whose
  // connection dies mid-upload has to fail both sinks, not truncate either into
  // one and call it stored.
  const failBoth = (error: Error): void => {
    toDisk.destroy(error);
    toBucket.destroy(error);
  };

  args.stream.on('error', failBoth);
  counter.on('error', failBoth);

  args.stream.pipe(counter);
  counter.pipe(toDisk);
  counter.pipe(toBucket);

  /**
   * Draining a sink whose consumer never arrived.
   *
   * Both `writeToDisk` and `putObject` can fail *before* reading anything — an
   * unwritable directory, a bucket that refuses the request outright. Its
   * `PassThrough` would then fill and stop draining, and because the two share
   * one source that stalls the *other* sink as well: the upload would hang rather
   * than finish with one copy. `resume` discards whatever is still coming and
   * lets the source finish feeding the sink that is still working.
   */
  const drainOnFailure = async <T>(work: Promise<T>, sink: PassThrough): Promise<T> => {
    try {
      return await work;
    } catch (error) {
      sink.resume();
      throw error;
    }
  };

  const [disk, bucket] = await Promise.allSettled([
    drainOnFailure(writeToDisk(toDisk, absolutePath), toDisk),
    drainOnFailure(
      putObject({
        storedPath: asKey(args.storedPath),
        body: toBucket,
        contentType: args.contentType,
      }),
      toBucket
    ),
  ]);

  // In precedence order, so `copies[0]` is the copy a read would prefer.
  const copies: DocumentLocation[] = [];
  if (bucket.status === 'fulfilled') copies.push('s3');
  if (disk.status === 'fulfilled') copies.push('local');

  const bucketError = bucket.status === 'rejected' ? String(bucket.reason) : null;
  const diskError = disk.status === 'rejected' ? String(disk.reason) : null;

  if (copies.length === 0) {
    logger.error('A document could not be stored anywhere', {
      storedPath: args.storedPath,
      bucketError,
      diskError,
    });

    // Both are rejected here by definition, so the final branch is unreachable
    // and exists only to satisfy the narrowing.
    throw bucket.status === 'rejected'
      ? (bucket.reason as Error)
      : disk.status === 'rejected'
        ? (disk.reason as Error)
        : new Error('The document was not stored, and neither sink said why.');
  }

  if (copies.length === 1) {
    logger.error('A document was stored in only one of the two places', {
      storedPath: args.storedPath,
      storedIn: copies,
      bucketError,
      diskError,
    });
  }

  return {
    bytes: counter.bytes,
    absolutePath: disk.status === 'fulfilled' ? absolutePath : null,
    copies,
  };
};

/**
 * Throws away every copy of a file multer has abandoned.
 *
 * Multer calls its engine's `_removeFile` for each file already written when a
 * request fails — one file in a set breaking the size limit is the ordinary
 * cause, and it must not leave the other nine stored against nothing. With two
 * copies of everything, removing one would be worse than removing neither: the
 * read path would go on serving the survivor.
 *
 * Locating first rather than deleting blind, so a path reached through two roots
 * is deleted once and the log says what was actually there.
 *
 * Failures are logged and swallowed. The request is already failing, and the
 * client's error should say what was wrong with their upload rather than what went
 * wrong cleaning up after it.
 */
export const discardDocument = async (storedPath: string): Promise<void> => {
  const safe = safeStoredPath(storedPath);
  if (!safe) return;

  for (const location of await locateDocument(safe)) {
    try {
      if (location === 's3') {
        await deleteObject(asKey(safe));
        continue;
      }

      const absolutePath =
        location === 'local' ? resolveUploadPath(safe) : resolveLegacyPath(safe);

      if (absolutePath) await fs.promises.unlink(absolutePath);
    } catch (error) {
      logger.warn('Could not discard a copy of an abandoned upload', {
        storedPath: safe,
        location,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** An open document, ready to stream to a response. */
export interface OpenedDocument {
  stream: Readable;
  /** Null when the source could not say — a stream is still valid without it. */
  bytes: number | null;
  contentType: string;
  /** Which copy this is. */
  from: DocumentLocation;
  /**
   * Every place that holds it, this one first.
   *
   * Reported so a caller can log that a document was mirrored — or that it was
   * not — without asking a second time. A document written normally reads
   * `['s3', 'local']`; one whose mirror failed reads with a single entry.
   */
  copies: DocumentLocation[];
}

const sizeOnDisk = (absolutePath: string): number | null => {
  try {
    return fs.statSync(absolutePath).size;
  } catch {
    return null;
  }
};

/**
 * A stream that cannot take the process down on its way out.
 *
 * An `error` with no listener is an uncaught exception, not a rejected promise —
 * and the streams handed out here fail *after* they are returned, which is the
 * worst shape for that. `fs.createReadStream` defers its `open`, so a file
 * deleted in the moment between `locateDocument` seeing it and the response
 * reading it emits ENOENT with nothing attached; the bucket's stream can drop its
 * connection the same way.
 *
 * So one listener is attached here, at creation, and it logs. A caller that
 * attaches its own — the download route destroys the response, because a
 * half-sent passport scan must not look complete — still gets the error, since
 * both listeners run. A caller that forgets gets a log line rather than a dead
 * process.
 */
const guarded = (
  stream: Readable,
  storedPath: string,
  location: DocumentLocation
): Readable => {
  stream.on('error', (error: Error) => {
    logger.warn('Reading a stored document failed', {
      storedPath,
      location,
      error: error.message,
    });
  });

  return stream;
};

/** Opens one named copy, or null when that copy is not actually there. */
const openCopy = async (
  location: DocumentLocation,
  storedPath: string
): Promise<Omit<OpenedDocument, 'copies'> | null> => {
  if (location === 's3') {
    const object = await getObject(asKey(storedPath));
    if (!object) return null;

    return {
      stream: guarded(object.stream, storedPath, location),
      bytes: object.bytes,
      contentType: object.contentType ?? contentTypeFor(storedPath),
      from: 's3',
    };
  }

  const absolutePath =
    location === 'local' ? resolveUploadPath(storedPath) : resolveLegacyPath(storedPath);

  if (!absolutePath || !fs.existsSync(absolutePath)) return null;

  return {
    stream: guarded(fs.createReadStream(absolutePath), storedPath, location),
    bytes: sizeOnDisk(absolutePath),
    contentType: contentTypeFor(storedPath),
    from: location,
  };
};

/**
 * Opens a stored document — once — wherever it is, or null when nothing holds it.
 *
 * ## Both places are checked, and one stream comes back
 *
 * `locateDocument` is what does the checking, and it de-duplicates: a document
 * written to the bucket *and* the disk is one document with two copies, so it is
 * listed once and served once, from the copy that is preferred rather than from
 * both. Nothing downstream has to know there were two — the response is a single
 * file, and `copies` is there for the log line.
 *
 * All three places are checked on every read regardless of the configured driver,
 * because the database cannot say which one a given row's file is in: a row
 * written before the bucket existed has its file on disk, and one whose mirror
 * failed has it in only one of the two.
 *
 * ## Why it re-tries the next copy
 *
 * `locateDocument` and the read are two round trips, and an object can be deleted
 * between them. Falling through to the next copy rather than answering "not
 * found" is the whole reason for keeping two.
 *
 * Null means the file genuinely is not anywhere, and the caller turns that into
 * the portal's "we hold a record of that document but not the file itself". A
 * failure that is *not* a missing file — a bad credential, an unreachable bucket —
 * throws instead, so a client is never told their document is gone because of an
 * outage.
 */
export const openDocument = async (
  storedPath: string
): Promise<OpenedDocument | null> => {
  const safe = safeStoredPath(storedPath);
  if (!safe) return null;

  const copies = await locateDocument(safe);
  if (copies.length === 0) return null;

  for (const location of copies) {
    const opened = await openCopy(location, safe);
    if (opened) return { ...opened, copies };

    logger.warn('A located copy of a document had gone by the time it was read', {
      storedPath: safe,
      location,
      copies,
    });
  }

  return null;
};
