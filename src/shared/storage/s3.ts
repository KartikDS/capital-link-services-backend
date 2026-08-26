import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { env } from '../../config/env';

/**
 * The bucket the documents live in, and nothing else.
 *
 * This module is the only place in the codebase that knows S3 exists. Everything
 * above it — the upload middleware, the download routes — talks to
 * `storage/documents`, which picks between here and the local disk. That split is
 * what let S3 be added without a second copy of the path-safety rules or the
 * ownership checks appearing beside it.
 *
 * ## Why the client is built lazily
 *
 * `config/env` validates at import, and every suite in `tests/` imports it. A
 * client constructed at module load would be constructed by every one of them,
 * and — with credentials that point nowhere in the test environment — would be a
 * connection attempt on a machine with no bucket. Built on first use instead, so
 * a deployment with no S3 configured never builds one at all.
 *
 * ## Why the endpoint is configurable
 *
 * `S3_REGION` for this deployment is `avvc`, which is not an AWS region — so the
 * bucket is on an S3-compatible provider rather than on AWS itself. Those need
 * their own endpoint, and most of them need path-style addressing because their
 * certificates do not cover `bucket.host`. Both are environment variables, so
 * pointing this at AWS proper later is a configuration change and not a code one.
 */

const settings = env.uploads.s3;

/** Whether this deployment has a bucket to write to. */
export const s3Configured = settings !== null;

let client: S3Client | null = null;

/**
 * The configured bucket, or a thrown error.
 *
 * Every function here is unreachable unless `s3Configured` — `storage/documents`
 * checks it once — so this is a guard for the type checker rather than a case
 * that happens at runtime.
 */
const required = (): NonNullable<typeof settings> => {
  if (!settings) {
    throw new Error(
      'S3 is not configured. Set S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.'
    );
  }

  return settings;
};

const s3 = (): S3Client => {
  if (client) return client;

  const config = required();

  const options: S3ClientConfig = {
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
  };

  // Only when set: passing `endpoint: undefined` is fine, but passing an empty
  // string is not — the SDK treats it as a URL and fails to parse it.
  if (config.endpoint) options.endpoint = config.endpoint;

  client = new S3Client(options);

  return client;
};

/**
 * The object key a stored path maps to.
 *
 * The database holds the same relative path it always did — `clients/9210/…` —
 * because `tbl_cls_order_documents.document` is CLS's column and its contents
 * have to stay readable by their own application. The prefix is added here, on
 * the way to the bucket, and stripped implicitly on the way back.
 *
 * **The prefix is set once.** Changing it after files exist does not move them;
 * it points every subsequent read at a location the old objects are not in.
 */
export const objectKey = (storedPath: string): string =>
  `${required().prefix}${storedPath}`;

/** The bucket's name, for a log line or a readiness check. */
export const bucketName = (): string => required().bucket;

/**
 * Streams a file into the bucket.
 *
 * `Upload` rather than `PutObject` because the body is a stream whose length is
 * not known in advance — an upload arrives as a multipart part, and busboy hands
 * it over without a length. `Upload` does a single `PutObject` for anything under
 * the part size and a multipart upload above it, and aborts the multipart on
 * failure rather than leaving the parts to be billed for.
 */
export const putObject = async (args: {
  storedPath: string;
  body: Readable;
  contentType: string | null;
}): Promise<void> => {
  const upload = new Upload({
    client: s3(),
    params: {
      Bucket: required().bucket,
      Key: objectKey(args.storedPath),
      Body: args.body,
      ...(args.contentType ? { ContentType: args.contentType } : {}),
      // These are passport scans and birth certificates. Nothing in the bucket is
      // public, and the download route is what checks ownership before streaming
      // one — see `portal.routes`.
      ContentDisposition: 'attachment',
    },
    leavePartsOnError: false,
  });

  await upload.done();
};

/**
 * Whether a `NoSuchKey`-shaped failure came back.
 *
 * Checked by name *and* by status, because the S3-compatible providers do not
 * agree on which they send: AWS answers `NoSuchKey` on a GET and `NotFound` on a
 * HEAD, and several others answer a bare 404 with no modelled error at all.
 */
const isMissing = (error: unknown): boolean => {
  const name = (error as { name?: string } | null)?.name;
  const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode;

  return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
};

/** What a fetched object is, or null when the bucket does not hold it. */
export interface FetchedObject {
  stream: Readable;
  bytes: number | null;
  contentType: string | null;
}

/**
 * Fetches an object, or null.
 *
 * Null rather than a throw for a missing key, because a missing key is an
 * ordinary case rather than a fault: a document row written before this bucket
 * existed has its file on the local disk, and the caller falls through to look
 * there. Every other failure — a bad credential, a network fault, a bucket that
 * refuses the read — throws, because answering "not found" to those would tell a
 * client their passport scan is gone when it is not.
 */
export const getObject = async (storedPath: string): Promise<FetchedObject | null> => {
  try {
    const response = await s3().send(
      new GetObjectCommand({
        Bucket: required().bucket,
        Key: objectKey(storedPath),
      })
    );

    if (!response.Body) return null;

    return {
      stream: response.Body as Readable,
      bytes: response.ContentLength ?? null,
      contentType: response.ContentType ?? null,
    };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
};

/** Whether the bucket holds this object. Cheaper than fetching it to find out. */
export const objectExists = async (storedPath: string): Promise<boolean> => {
  try {
    await s3().send(
      new HeadObjectCommand({
        Bucket: required().bucket,
        Key: objectKey(storedPath),
      })
    );

    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
};

/**
 * Deletes an object.
 *
 * Called when multer abandons an upload — a file that broke the size limit, or a
 * request that failed after some of its files had already gone up. A delete of a
 * key that is not there succeeds in S3, which is what makes this safe to call
 * without checking first.
 */
export const deleteObject = async (storedPath: string): Promise<void> => {
  await s3().send(
    new DeleteObjectCommand({
      Bucket: required().bucket,
      Key: objectKey(storedPath),
    })
  );
};
