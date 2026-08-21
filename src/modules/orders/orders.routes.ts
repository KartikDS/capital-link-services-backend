import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  authenticate,
  authenticateOptional,
  currentUserId,
} from '../../middleware/authenticate';
import { limits } from '../../middleware/rateLimit';
import { manyFiles } from '../../middleware/upload';
import { badRequest, notFound } from '../../shared/errors';
import { created, ok, paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { validate, validParams, validQuery } from '../../shared/validation';
import {
  quoteClearance,
  quoteLegalisation,
  quoteVisa,
  quoteVoucher,
  type VoucherTier,
} from '../../domain/quotes';
import * as lodge from './orders.lodge';
import * as schemas from './orders.schemas';
import * as service from './orders.service';
import { attachDocuments, cancelOrder, readDraft, saveDraft, discardDraft } from './orders.writes';

/**
 * Order endpoints: lodging, tracking, reading and attaching to.
 *
 * ## Route order matters here
 *
 * `/drafts` and `/track` are declared **before** `/:reference`. Express matches
 * in declaration order, so a `/:reference` route registered first would swallow
 * `/api/orders/drafts` and try to look up an order called "drafts".
 *
 * ## Who may see what
 *
 * `/track` is public and takes a reference *and* an email. Everything else needs
 * a token, and a reference that is not the caller's answers 404 — see
 * `orders.service.resolveForClient` for why it is not a 403.
 */

export const orderRoutes = Router();

// ---------------------------------------------------------------------------
// Public tracking
// ---------------------------------------------------------------------------

/**
 * GET /api/orders/track?reference=&email=
 *
 * Rate limited, because a reference plus an email is a guessable pair and the
 * legacy family's references are sequential integers.
 *
 * A miss and a mismatch both answer 404 with the same wording. Saying "that
 * reference exists but the email is wrong" would confirm the reference.
 */
orderRoutes.get(
  '/track',
  limits.tracking,
  validate(schemas.trackQuerySchema, 'query'),
  async (req: Request, res: Response) => {
    const { reference, email } = validQuery<z.infer<typeof schemas.trackQuerySchema>>(req);

    const tracked = await service.track(reference, email);

    if (!tracked) {
      throw notFound(
        'We could not find an order with that reference and email address.'
      );
    }

    ok(res, { order: tracked });
  }
);

// ---------------------------------------------------------------------------
// Quotes — priced from the catalogue, no order created
// ---------------------------------------------------------------------------

/**
 * The quote endpoints exist so the website can show a total before checkout
 * without lodging anything. Same pricing functions the lodgement path uses, so
 * the figure quoted and the figure charged cannot disagree.
 */
const quoteRoutes = Router();

quoteRoutes.post(
  '/police-clearance',
  validate(schemas.clearanceQuoteSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof schemas.clearanceQuoteSchema>;
    ok(res, { quote: await quoteClearance(body) });
  }
);

quoteRoutes.post(
  '/russian-visa-voucher',
  validate(schemas.voucherQuoteSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof schemas.voucherQuoteSchema>;
    ok(res, {
      quote: await quoteVoucher({ ...body, tier: body.tier as VoucherTier }),
    });
  }
);

quoteRoutes.post(
  '/visa',
  validate(schemas.visaQuoteSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof schemas.visaQuoteSchema>;
    ok(res, { quote: await quoteVisa(body) });
  }
);

/**
 * POST /api/orders/quote/attestation
 *
 * Always answers `quoteRequired: true`. Legalisation is priced per document by a
 * consultant, and the indicative from-price is the country's service fee where
 * one is recorded — clearly labelled as indicative, not as a quote.
 */
quoteRoutes.post(
  '/attestation',
  validate(
    z.object({ destinationCountryId: z.coerce.number().int().positive().optional() })
  ),
  async (req: Request, res: Response) => {
    const { destinationCountryId } = req.body as { destinationCountryId?: number };
    ok(res, { quote: await quoteLegalisation(destinationCountryId ?? null) });
  }
);

orderRoutes.use('/quote', quoteRoutes);

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

/**
 * Drafts, which are unsubmitted order rows.
 *
 * This schema has no table for a saved form. What it has is the old
 * application's own answer to the same problem: an order row with
 * `date_submitted` still null, which is exactly what a half-finished basket is.
 * So a draft here is a real `tbl_cls_order` row that has not been submitted, and
 * submitting it later stamps the date.
 *
 * **What that cannot hold.** A draft only keeps the fields the order tables
 * have. Free-form wizard state — which step the client was on, a partially typed
 * address — has no column and is not persisted. The response says which keys
 * were dropped rather than pretending they were saved, because a draft that
 * silently loses half a form is worse than no draft at all.
 */
const draftRoutes = Router();

draftRoutes.use(authenticate);

draftRoutes.get('/', async (req: Request, res: Response) => {
  ok(res, { drafts: await readDraft(currentUserId(req), null) });
});

draftRoutes.post(
  '/',
  validate(
    z.object({
      service: z.string().trim().min(1).max(64),
      payload: z.record(z.string(), z.unknown()),
    })
  ),
  async (req: Request, res: Response) => {
    const { service: serviceSlug, payload } = req.body as {
      service: string;
      payload: Record<string, unknown>;
    };

    ok(res, await saveDraft(currentUserId(req), serviceSlug, payload));
  }
);

draftRoutes.get(
  '/:service',
  validate(z.object({ service: z.string().trim().min(1).max(64) }), 'params'),
  async (req: Request, res: Response) => {
    const { service: serviceSlug } = validParams<{ service: string }>(req);
    const drafts = await readDraft(currentUserId(req), serviceSlug);

    if (drafts.length === 0) throw notFound('You have no saved draft for that service.');

    ok(res, { draft: drafts[0] });
  }
);

draftRoutes.delete(
  '/:service',
  validate(z.object({ service: z.string().trim().min(1).max(64) }), 'params'),
  async (req: Request, res: Response) => {
    const { service: serviceSlug } = validParams<{ service: string }>(req);
    ok(res, { discarded: await discardDraft(currentUserId(req), serviceSlug) });
  }
);

orderRoutes.use('/drafts', draftRoutes);

// ---------------------------------------------------------------------------
// Lodging an order
// ---------------------------------------------------------------------------

/**
 * The client an order belongs to.
 *
 * Null for a guest checkout, which the website supports — the clearance,
 * voucher and attestation journeys can all be completed without an account.
 * Null here is not the last word on ownership: `orders.lodge` then looks for an
 * enabled account whose email is the one given as the order's contact, so a
 * client who ordered before signing in still finds the order in their portal.
 * See `ownerFor` there for why the contact address is a sound link to make.
 *
 * Populated by `authenticateOptional`, applied to the lodgement routes below.
 * That middleware is what makes the distinction work: a signed-in client's order
 * is attached to them, a guest's is not, and a *bad* token is still refused
 * rather than quietly downgraded to a guest order the client never sees again.
 */
const ownerOf = (req: Request): number | null => req.auth?.sub ?? null;


/** POST /api/orders/police-clearance */
orderRoutes.post(
  '/police-clearance',
  authenticateOptional,
  validate(schemas.clearanceOrderSchema),
  async (req: Request, res: Response) => {
    const body = req.body as schemas.ClearanceOrderBody;

    const result = await lodge.lodgeClearanceOrder({
      ...body,
      clientId: ownerOf(req),
    });

    created(res, result);
  }
);

/** POST /api/orders/russian-visa-voucher */
orderRoutes.post(
  '/russian-visa-voucher',
  authenticateOptional,
  validate(schemas.voucherOrderSchema),
  async (req: Request, res: Response) => {
    const body = req.body as schemas.VoucherOrderBody;

    const result = await lodge.lodgeVoucherOrder({
      ...body,
      tier: body.tier as VoucherTier,
      clientId: ownerOf(req),
    });

    created(res, result);
  }
);

/**
 * POST /api/orders/attestation
 *
 * Also mounted at `/document-legalisation`. The website's journey posts to
 * `attestation`, which is what CLS calls it publicly; the schema calls it "DL".
 * Both paths, one handler — renaming either side would break something.
 */
const lodgeLegalisation = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as schemas.LegalisationOrderBody;

  const result = await lodge.lodgeLegalisationOrder({
    ...body,
    clientId: ownerOf(req),
  });

  created(res, result);
};

orderRoutes.post(
  '/attestation',
  authenticateOptional,
  validate(schemas.legalisationOrderSchema),
  lodgeLegalisation
);

orderRoutes.post(
  '/document-legalisation',
  authenticateOptional,
  validate(schemas.legalisationOrderSchema),
  lodgeLegalisation
);

/** POST /api/orders/visa */
orderRoutes.post(
  '/visa',
  authenticateOptional,
  validate(schemas.visaOrderSchema),
  async (req: Request, res: Response) => {
    const body = req.body as schemas.VisaOrderBody;

    const result = await lodge.lodgeVisaOrder({
      ...body,
      // `optionalId` yields `undefined` when the field is absent and `null` when
      // it is sent as null; the lodgement takes one shape for "not known".
      visaTypeId: body.visaTypeId ?? null,
      clientId: ownerOf(req),
    });

    created(res, result);
  }
);

// ---------------------------------------------------------------------------
// A client's own orders
// ---------------------------------------------------------------------------

/**
 * GET /api/orders/mine
 *
 * Both order families, merged and paged. `?stage` filters on the derived stage,
 * which no column holds — so it is applied after the merge, and the total
 * reflects the filter rather than the table count.
 */
orderRoutes.get(
  '/mine',
  authenticate,
  validate(schemas.myOrdersQuerySchema, 'query'),
  async (req: Request, res: Response) => {
    const query = validQuery<z.infer<typeof schemas.myOrdersQuerySchema>>(req);
    const page = readPage(req);

    const result = await service.listForClient(currentUserId(req), {
      limit: page.limit,
      offset: page.offset,
      ...(query.orderType ? { orderType: query.orderType } : {}),
    });

    const orders = query.stage
      ? result.orders.filter((order) => order.stage === query.stage)
      : result.orders;

    paged(res, 'orders', orders, pageMeta(page, query.stage ? orders.length : result.total));
  }
);

/** GET /api/orders/my-applications — the dashboard's condensed list. */
orderRoutes.get('/my-applications', authenticate, async (req: Request, res: Response) => {
  const result = await service.listForClient(currentUserId(req), {
    limit: 10,
    offset: 0,
  });

  ok(res, {
    applications: result.orders.map((order) => ({
      reference: order.reference,
      service: order.service,
      stage: order.stage,
      statusLabel: order.statusLabel,
      progress: order.progress,
      submittedAt: order.submittedAt,
      actionRequired: order.actionRequired,
    })),
    total: result.total,
  });
});

// ---------------------------------------------------------------------------
// One order
// ---------------------------------------------------------------------------

/**
 * Resolves the reference in the URL to an order the caller may see.
 *
 * Factored out because six routes below need the same three steps — parse the
 * reference, resolve it across both families, check ownership — and doing it
 * inline six times is six chances to forget the third one.
 */
const resolveFromParams = async (req: Request) => {
  const { reference } = validParams<{ reference: string }>(req);

  return service.resolveForClient(
    reference,
    currentUserId(req),
    req.auth?.aud === 'admin'
  );
};

/**
 * `mergeParams` is required, not optional.
 *
 * This router is mounted at `/:reference`, and without it Express does not pass
 * the parent's route parameters down — so every handler below would see an empty
 * `req.params` and the reference would arrive as undefined.
 */
const referenceRoutes = Router({ mergeParams: true });

referenceRoutes.use(authenticate);
referenceRoutes.use(validate(schemas.referenceParamSchema, 'params'));

referenceRoutes.get('/', async (req: Request, res: Response) => {
  ok(res, { order: await service.view(await resolveFromParams(req)) });
});

referenceRoutes.get('/timeline', async (req: Request, res: Response) => {
  ok(res, { timeline: await service.timeline(await resolveFromParams(req)) });
});

referenceRoutes.get('/comments', async (req: Request, res: Response) => {
  ok(res, { comments: await service.comments(await resolveFromParams(req)) });
});

referenceRoutes.get('/documents', async (req: Request, res: Response) => {
  ok(res, { documents: await service.documents(await resolveFromParams(req)) });
});

referenceRoutes.get('/payments', async (req: Request, res: Response) => {
  ok(res, { payments: await service.payments(await resolveFromParams(req)) });
});

/**
 * POST /api/orders/:reference/documents
 *
 * Multipart. `manyFiles` runs before the body is read, because `express.json()`
 * would otherwise have consumed the stream.
 */
referenceRoutes.post(
  '/documents',
  limits.upload,
  manyFiles,
  async (req: Request, res: Response) => {
    const resolved = await resolveFromParams(req);
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    if (files.length === 0) throw badRequest('Choose at least one file to upload.');

    created(res, { documents: await attachDocuments(resolved, files) });
  }
);

/** POST /api/orders/:reference/cancel */
referenceRoutes.post(
  '/cancel',
  validate(z.object({ reason: z.string().trim().max(2000).optional() })),
  async (req: Request, res: Response) => {
    const resolved = await resolveFromParams(req);
    const { reason } = req.body as { reason?: string };

    ok(res, await cancelOrder(resolved, reason ?? null, currentUserId(req)));
  }
);

// Mounted last, so the literal paths above win.
orderRoutes.use('/:reference', referenceRoutes);
