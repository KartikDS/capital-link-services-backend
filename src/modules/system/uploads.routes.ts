import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { authenticate } from '../../middleware/authenticate';
import { limits } from '../../middleware/rateLimit';
import { ALLOWED_EXTENSIONS, manyFiles } from '../../middleware/upload';
import { storedPathOf } from '../../shared/storage/documents';
import { badRequest } from '../../shared/errors';
import { created, ok } from '../../shared/http/responses';
import { validate } from '../../shared/validation';
import { logger } from '../../shared/logger';

/**
 * Uploads that are not yet attached to anything.
 *
 * Two endpoints, and the first is the more useful one.
 *
 * `POST /validate` is a **pre-flight check**: the browser sends the filename,
 * size and type before sending the bytes, and gets back whether they would be
 * accepted. That turns a client discovering a 12 MB scan is too large *after*
 * uploading it on a hotel connection into finding out immediately. The website's
 * upload control calls it on file selection.
 *
 * `POST /` accepts files with no order attached, which the portal uses when a
 * client drops documents in before choosing which job they belong to. They land
 * in an `unassigned` directory and are **not recorded in the database** — there
 * is no table for a file with no owner, and inventing one would be DDL. The
 * response returns the stored paths, and the client attaches them to an order in
 * a second call. Anything never attached is orphaned on disk, which is why the
 * response says so.
 */

export const uploadRoutes = Router();

const validateSchema = z.object({
  filename: z.string().trim().min(1, 'A filename is required').max(255),
  /** Bytes, as the browser reports them. */
  size: z.coerce.number().int().min(0),
  contentType: z.string().trim().max(255).optional(),
});

/**
 * POST /api/uploads/validate
 *
 * Public: it discloses nothing but this deployment's own limits, which
 * `/api/config/public` already publishes. Keeping it unauthenticated means the
 * check works on the order journeys that a guest can complete.
 */
uploadRoutes.post(
  '/validate',
  validate(validateSchema),
  (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof validateSchema>;
    const extension = path.extname(body.filename).toLowerCase();

    const problems: string[] = [];

    if (!extension) {
      problems.push('That file has no extension, so we cannot tell what it is.');
    } else if (!ALLOWED_EXTENSIONS.includes(extension)) {
      problems.push(
        `We accept ${ALLOWED_EXTENSIONS.join(', ')} files. That one is a ${extension}.`
      );
    }

    if (body.size > env.uploads.maxBytes) {
      problems.push(
        `That file is ${(body.size / (1024 * 1024)).toFixed(1)} MB. The limit is ${env.uploads.maxMb} MB.`
      );
    }

    if (body.size === 0) {
      problems.push('That file is empty.');
    }

    ok(res, {
      acceptable: problems.length === 0,
      problems,
      limits: {
        maxMb: env.uploads.maxMb,
        allowedExtensions: ALLOWED_EXTENSIONS,
      },
    });
  }
);

/**
 * POST /api/uploads
 *
 * Files with no order yet. Authenticated, because the directory they land in is
 * keyed by the client's id and an anonymous write would have nowhere safe to go.
 */
uploadRoutes.post(
  '/',
  authenticate,
  limits.upload,
  manyFiles,
  (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    if (files.length === 0) throw badRequest('Choose at least one file to upload.');

    logger.info('Unassigned files uploaded', {
      userId: req.auth?.sub,
      count: files.length,
    });

    created(res, {
      files: files.map((file) => ({
        storedAs: storedPathOf(file),
        name: file.originalname,
        sizeBytes: file.size,
        /**
         * Where the bytes went. One entry per place, so a file stored in both
         * the bucket and on disk appears once here as `['s3', 'local']` rather
         * than twice in the list above.
         */
        storedIn: file.storedIn ?? [],
      })),
      note:
        'These files are on disk but not recorded against an order. Attach them with POST /api/orders/{reference}/documents — anything left unattached is not visible to CLS.',
    });
  }
);
