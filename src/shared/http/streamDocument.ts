import type { Response } from 'express';
import type { OpenedDocument } from '../storage/documents';
import { logger } from '../logger';

/**
 * Streams an opened document to the response.
 *
 * Replaced `res.sendFile`, which can only serve a path on this machine's disk —
 * and a document uploaded since the S3 bucket was configured is not on it. The
 * headers it used to set for us are set here instead: the type from the stored
 * name or the object's own `Content-Type`, and the length when the source could
 * say what it was.
 *
 * Shared rather than local to one router: the portal serves documents and
 * passport photos through it, and an order serves the files a consultant attached
 * to a message on the thread. All four are "bytes from wherever this document
 * turned out to be", and the error handling below is the part worth having once.
 *
 * ## Why the error handling is worth the lines
 *
 * A read that dies part-way — a dropped connection to the bucket, a disk fault —
 * has already sent a 200 and some of the body, so there is no status left to
 * change. Destroying the response is the only honest ending: the client sees a
 * truncated transfer rather than a passport scan that looks complete and is not.
 *
 * The `close` handler is the other direction. A client who cancels a download
 * mid-stream would otherwise leave the source open until it timed out, which for
 * S3 means holding a connection from a small pool.
 *
 * **The `error` listener below is the second one on that stream, and that is not
 * a duplicate to be tidied away.** `openDocument` attaches its own at creation —
 * see `guarded` in `storage/documents` — because these streams fail *after* they
 * are returned: `fs.createReadStream` defers its `open`, so a file deleted
 * between `locateDocument` seeing it and this read emits ENOENT, and an `error`
 * with no listener is an uncaught exception rather than a rejected promise. Both
 * are meant to run: that one logs which copy failed, this one destroys the
 * response. Removing either loses something the other does not do.
 */
export const streamDocument = (
  opened: OpenedDocument,
  res: Response,
  context: Record<string, unknown>
): void => {
  res.setHeader('Content-Type', opened.contentType);
  if (opened.bytes !== null) res.setHeader('Content-Length', String(opened.bytes));

  opened.stream.on('error', (error: Error) => {
    logger.error('Streaming a document failed part-way through', {
      ...context,
      from: opened.from,
      error: error.message,
    });

    res.destroy(error);
  });

  res.on('close', () => opened.stream.destroy());

  opened.stream.pipe(res);
};
