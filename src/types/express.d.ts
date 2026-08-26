import type { AccessClaims } from '../shared/tokens';

/**
 * What the middleware adds to a request.
 *
 * Declared here rather than cast at each use, so a handler reading `req.auth`
 * gets the real type and a handler on a public route gets `undefined` — which is
 * the distinction that makes "did I remember to require a token on this route?"
 * a compile-time question instead of a runtime one.
 */
declare global {
  namespace Express {
    interface Request {
      /** Set by `authenticate`. Undefined on public and internal routes. */
      auth?: AccessClaims;
      /** Set by `internalOnly`, for a server-to-server caller with no user. */
      internal?: true;
      /** Correlates every log line for one request. */
      requestId?: string;
    }

    namespace Multer {
      interface File {
        /**
         * Where the file was stored, relative to the upload root — set by the
         * `DocumentStorage` engine in `middleware/upload`.
         *
         * This is the value that goes into `tbl_cls_order_documents.document`,
         * and the one thing that is the same whether the bytes went to the S3
         * bucket or to `UPLOAD_DIR`. `path` is not: it is an absolute disk path
         * under the local driver and the key itself under S3, so read this
         * through `storedPathOf` rather than relativising `path` by hand.
         *
         * Optional because multer's own engines do not set it, and because it is
         * absent on the file-shaped objects the unit tests build.
         */
        key?: string;

        /**
         * Every place this file's bytes reached — `['s3', 'local']` for a normal
         * upload with a bucket configured, `['local']` without one.
         *
         * Reported rather than assumed because a mirror can fail on its own: the
         * upload still succeeds with one copy, and this is what says so. Deduped
         * by `saveDocument`, so a file present in two places is listed once per
         * place and never twice for the same one.
         */
        storedIn?: ('s3' | 'local' | 'legacy')[];
      }
    }
  }
}

export {};
