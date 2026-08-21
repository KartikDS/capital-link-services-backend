import fs from 'node:fs';
import path from 'node:path';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { env } from '../../config/env';
import { authenticate, currentUserId } from '../../middleware/authenticate';
import { limits } from '../../middleware/rateLimit';
import {
  ALLOWED_EXTENSIONS,
  manyFiles,
  resolveLegacyPath,
  resolveUploadPath,
  singleFile,
} from '../../middleware/upload';
import { badRequest, notFound } from '../../shared/errors';
import { created, message, ok } from '../../shared/http/responses';
import { addressSchema, idParam, validate, validParams, validQuery } from '../../shared/validation';
import { logger } from '../../shared/logger';
import * as orderWrites from '../orders/orders.writes';
import * as orderService from '../orders/orders.service';
import * as service from './portal.service';

/**
 * The signed-in client's own records.
 *
 * **Every route here requires a token.** The router applies `authenticate`
 * once, at the top, rather than per-route. The previous build used an optional
 * variant, and the effect was that an expired session got a `200` and an empty
 * portal — a client with eight live jobs being told they had none. A 401 is what
 * lets the website refresh and retry.
 */

export const portalRoutes = Router();

portalRoutes.use(authenticate);

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

portalRoutes.get('/profile', async (req: Request, res: Response) => {
  ok(res, { profile: await service.profile(currentUserId(req)) });
});

const profileUpdateSchema = z.object({
  title: z.string().trim().max(10).optional().nullable(),
  firstName: z.string().trim().min(1, 'Enter your first name').max(50).optional(),
  lastName: z.string().trim().min(1, 'Enter your last name').max(50).optional(),
  phone: z.string().trim().max(50).optional().nullable(),
  mobile: z.string().trim().max(50).optional().nullable(),
  company: z.string().trim().max(1000).optional().nullable(),
});

portalRoutes.put(
  '/profile',
  validate(profileUpdateSchema),
  async (req: Request, res: Response) => {
    const update = req.body as z.infer<typeof profileUpdateSchema>;
    ok(res, { profile: await service.saveProfile(currentUserId(req), update) });
  }
);

/**
 * PATCH /api/portal/profile/addresses/:kind
 *
 * One address at a time. Sending the whole profile to change a postcode is how
 * the other two addresses get overwritten.
 */
portalRoutes.patch(
  '/profile/addresses/:kind',
  validate(
    z.object({ kind: z.enum(['account', 'delivery', 'billing']) }),
    'params'
  ),
  validate(addressSchema),
  async (req: Request, res: Response) => {
    const { kind } = validParams<{ kind: service.AddressKind }>(req);
    const address = req.body as z.infer<typeof addressSchema>;

    const result = await service.saveAddress(currentUserId(req), kind, address);

    ok(res, {
      address: result.address,
      // `line2` is accepted and dropped — there is one address column per set.
      ...(result.ignored.length > 0
        ? {
            ignored: result.ignored,
            note: 'This schema stores a single address line, so line2 was not saved.',
          }
        : {}),
    });
  }
);

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

portalRoutes.get('/orders', async (req: Request, res: Response) => {
  ok(res, { orders: await service.portalOrders(currentUserId(req)) });
});

portalRoutes.get('/stats', async (req: Request, res: Response) => {
  ok(res, { stats: await service.stats(currentUserId(req)) });
});

portalRoutes.get('/notices', async (_req: Request, res: Response) => {
  ok(res, { notices: await service.notices() });
});

portalRoutes.get('/consultant', async (req: Request, res: Response) => {
  ok(res, { consultant: await service.consultant(currentUserId(req)) });
});

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const documentQuerySchema = z.object({
  reference: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

portalRoutes.get(
  '/documents',
  validate(documentQuerySchema, 'query'),
  async (req: Request, res: Response) => {
    const query = validQuery<z.infer<typeof documentQuerySchema>>(req);

    const documents = await service.documents(currentUserId(req), {
      ...(query.reference ? { reference: query.reference } : {}),
      limit: query.limit ?? 100,
    });

    ok(res, { documents });
  }
);

/**
 * POST /api/portal/documents
 *
 * Uploads against a named order. `reference` is required: a document with no
 * order has nowhere to be stored — `tbl_cls_order_documents.order_id` is how the
 * table is keyed, and CLS's own screens find a document through its order.
 */
portalRoutes.post(
  '/documents',
  limits.upload,
  manyFiles,
  async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) throw badRequest('Choose at least one file to upload.');

    const body = req.body as { reference?: string };
    const reference = body.reference?.trim();

    if (!reference) {
      throw badRequest(
        'Tell us which order these documents are for — we store documents against an order.'
      );
    }

    const resolved = await orderService.resolveForClient(
      reference,
      currentUserId(req)
    );

    created(res, { documents: await orderWrites.attachDocuments(resolved, files) });
  }
);

/**
 * GET /api/portal/documents/:id/download
 *
 * Streams the file after checking it belongs to the caller. Nothing under
 * `UPLOAD_DIR` is served statically — that is the whole point of this route.
 *
 * A legacy path is resolved under `LEGACY_UPLOAD_DIR`, which is unset by
 * default; until CLS mounts the old application's document directory, a legacy
 * file answers 404 rather than this process reading from a guessed location.
 */
portalRoutes.get(
  '/documents/:id/download',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const { storedPath, name } = await service.findOwnedDocument(
      currentUserId(req),
      id
    );

    const resolved =
      resolveUploadPath(storedPath) ?? resolveLegacyPath(storedPath);

    if (!resolved || !fs.existsSync(resolved)) {
      logger.warn('Document row exists but the file does not', {
        documentId: id,
        storedPath,
        legacyDirConfigured: env.uploads.legacyDir !== null,
      });

      throw notFound(
        'We hold a record of that document but not the file itself. Please contact your consultant.'
      );
    }

    // `attachment` rather than inline: these are passport scans, and a browser
    // rendering one in a tab is a browser caching one in a tab.
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(name)}"`);
    res.sendFile(resolved);
  }
);

portalRoutes.delete(
  '/documents/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    await service.removeDocument(currentUserId(req), id);

    message(res, 'That document has been removed.');
  }
);

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

portalRoutes.get('/invoices', async (req: Request, res: Response) => {
  ok(res, { invoices: await service.invoices(currentUserId(req)) });
});

portalRoutes.get('/invoices/summary', async (req: Request, res: Response) => {
  ok(res, { summary: await service.balance(currentUserId(req)) });
});

// ---------------------------------------------------------------------------
// Passport photos
// ---------------------------------------------------------------------------

/**
 * GET /api/portal/passport-photos
 *
 * At most one, ever. `tbl_user_client.passport_photo` is a single column — see
 * `toPhotoView` for what that costs the portal's submission-queue design.
 */
portalRoutes.get('/passport-photos', async (req: Request, res: Response) => {
  const photos = await service.passportPhotos(currentUserId(req));

  ok(res, {
    photos,
    // Stated in the response rather than left for the caller to discover from
    // an array that never grows past one.
    note:
      'This account holds a single passport photo. Submitting a new one replaces it — there is no submission history.',
  });
});

portalRoutes.post(
  '/passport-photos',
  limits.upload,
  singleFile,
  async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) throw badRequest('Choose a photo to upload.');

    const relative = path
      .relative(env.uploads.dir, file.path)
      .replace(/\\/g, '/');

    await service.savePassportPhoto(currentUserId(req), relative);

    created(res, {
      photo: (await service.passportPhotos(currentUserId(req)))[0] ?? null,
      replaced: true,
    });
  }
);

portalRoutes.get(
  '/passport-photos/:id/download',
  async (req: Request, res: Response) => {
    const photos = await service.passportPhotos(currentUserId(req));
    const photo = photos[0];

    if (!photo) throw notFound('You have not submitted a passport photo.');

    const resolved =
      resolveUploadPath(photo.storedAs) ?? resolveLegacyPath(photo.storedAs);

    if (!resolved || !fs.existsSync(resolved)) {
      throw notFound('We could not find that photo file.');
    }

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${path.basename(photo.storedAs)}"`
    );
    res.sendFile(resolved);
  }
);

/**
 * DELETE /api/portal/passport-photos/:id
 *
 * Answers honestly that it cannot do what the website asks.
 *
 * Withdrawing a submission needs a state to move it to, and the schema has one
 * column holding one filename with no status beside it. Clearing the column
 * would delete the photo outright rather than withdraw it, which is a different
 * and less recoverable thing than the client asked for — so this refuses and
 * says why, instead of returning 200 and destroying the file.
 */
portalRoutes.delete('/passport-photos/:id', (_req: Request, res: Response) => {
  res.status(409).json({
    error:
      'A passport photo cannot be withdrawn once submitted. Upload a replacement instead, or ask your consultant to remove it.',
    message:
      'A passport photo cannot be withdrawn once submitted. Upload a replacement instead, or ask your consultant to remove it.',
    code: 'not_supported',
  });
});

/** GET /api/portal/passport-photos/guidelines — what CLS requires of a photo. */
portalRoutes.get('/passport-photos/guidelines', (_req: Request, res: Response) => {
  ok(res, {
    guidelines: {
      acceptedFormats: ALLOWED_EXTENSIONS.filter((extension) =>
        ['.jpg', '.jpeg', '.png', '.heic'].includes(extension)
      ),
      maxMb: env.uploads.maxMb,
      requirements: [
        'Plain white or light grey background',
        'Face the camera squarely with a neutral expression',
        'No hair across the eyes and no head covering, unless worn for religious reasons',
        'No glare on glasses — remove them if in doubt',
        'Taken within the last six months',
      ],
    },
  });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

portalRoutes.get('/notifications', async (req: Request, res: Response) => {
  const items = await service.notifications(currentUserId(req));

  ok(res, {
    notifications: items,
    unread: items.length,
    note:
      'Notifications are derived from your current orders, documents and invoices. There is no read/unread state stored, so they reappear until the underlying item is resolved.',
  });
});

/**
 * PATCH /api/portal/notifications/:id/read and /read-all
 *
 * Both accept the request and report that nothing was persisted.
 *
 * There is no notifications table and no read column anywhere in this schema, so
 * a read flag has nowhere to live. Returning 200 with `persisted: false` is the
 * honest answer: the website can dismiss the item locally for the session, and
 * it knows not to expect it to stay dismissed. Returning a plain 200 would make
 * the notification's reappearance on the next page load look like a bug.
 */
const notificationReadNote =
  'Accepted, but not stored: this schema has no read/unread column, so the notification will reappear until the document or invoice behind it is resolved.';

portalRoutes.patch('/notifications/read-all', (_req: Request, res: Response) => {
  ok(res, { persisted: false, marked: 0, note: notificationReadNote });
});

portalRoutes.patch('/notifications/:id/read', (_req: Request, res: Response) => {
  ok(res, { persisted: false, note: notificationReadNote });
});

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

portalRoutes.delete(
  '/account',
  validate(z.object({ reason: z.string().trim().max(2000).optional() })),
  async (req: Request, res: Response) => {
    const { reason } = req.body as { reason?: string };
    ok(res, await service.closeAccount(currentUserId(req), reason ?? null));
  }
);
