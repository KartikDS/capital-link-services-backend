import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  authenticate,
  authenticateOptional,
  currentUserId,
} from '../../middleware/authenticate';
import { limits } from '../../middleware/rateLimit';
import { internalOnly } from '../../middleware/requestContext';
import { manyFiles } from '../../middleware/upload';
import { badRequest, notFound } from '../../shared/errors';
import { created, ok, paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { validate, validParams, validQuery } from '../../shared/validation';
import { destinationCountryId } from '../../domain/countries';
import {
  quoteClearance,
  quoteLegalisation,
  quoteVisa,
  quoteVoucher,
  type VoucherTier,
} from '../../domain/quotes';
import * as claimService from './orders.claim';
import * as confirmations from './orders.confirmations';
import * as lodge from './orders.lodge';
import * as schemas from './orders.schemas';
import * as service from './orders.service';
import {
  addClientComment,
  attachDocuments,
  cancelOrder,
  readDraft,
  saveDraft,
  discardDraft,
} from './orders.writes';

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

/**
 * The country id a field should be recorded against.
 *
 * Thin wrapper over `domain/countries`, which never throws: where the slug
 * resolves it wins, and where it cannot the caller's id stands. So there is no
 * failure path to map to a status here — an order is never refused over a
 * country, it is simply recorded against the row this database agrees the client
 * named.
 *
 * Every country on every journey goes through here: destinations, the document's
 * country of origin, the requesting country on a clearance, each applicant's
 * nationality and the return address. They are one bug, not seven — an id
 * resolved somewhere else means whatever that integer happens to name here.
 */
const resolveCountry = async (
  slug: string | null | undefined,
  id: number | null | undefined,
  journey: string
): Promise<number | null> => destinationCountryId({ slug, id, journey });

/**
 * The return address, with its country resolved.
 *
 * Kept separate because this is the one country field that moves a parcel: it is
 * where CLS couriers the finished passports and documents back to. A wrong row
 * here is not a label in an admin screen, it is a delivery to another country.
 */
const resolveReturnAddress = async <
  T extends { countryId?: number | null; countrySlug?: string | null },
>(
  address: T | undefined,
  journey: string
): Promise<T | undefined> =>
  address
    ? {
        ...address,
        countryId: await resolveCountry(
          address.countrySlug,
          address.countryId,
          `${journey} return address`
        ),
      }
    : undefined;

/** Each applicant's nationality, resolved the same way. */
const resolveApplicants = async <
  T extends { nationalityId?: number | null; nationalitySlug?: string | null },
>(
  applicants: readonly T[],
  journey: string
): Promise<T[]> =>
  Promise.all(
    applicants.map(async (applicant) => ({
      ...applicant,
      nationalityId: await resolveCountry(
        applicant.nationalitySlug,
        applicant.nationalityId,
        `${journey} applicant nationality`
      ),
    }))
  );


/** POST /api/orders/police-clearance */
orderRoutes.post(
  '/police-clearance',
  authenticateOptional,
  validate(schemas.clearanceOrderSchema),
  async (req: Request, res: Response) => {
    const body = req.body as schemas.ClearanceOrderBody;
    const journey = 'Police clearance order';

    const result = await lodge.lodgeClearanceOrder({
      ...body,
      countryId: await resolveCountry(body.countrySlug, body.countryId, journey),
      applicants: await resolveApplicants(body.applicants, journey),
      returnAddress: await resolveReturnAddress(body.returnAddress, journey),
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
    const journey = 'Russian voucher order';

    const result = await lodge.lodgeVoucherOrder({
      ...body,
      tier: body.tier as VoucherTier,
      applicants: await resolveApplicants(body.applicants, journey),
      // The employer's country travels on the invitation itself, so it is as
      // much a fact of the order as the traveller's nationality.
      employer: body.employer
        ? {
            ...body.employer,
            countryId: await resolveCountry(
              body.employer.countrySlug,
              body.employer.countryId,
              `${journey} employer`
            ),
          }
        : undefined,
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
  const journey = 'Legalisation order';

  const result = await lodge.lodgeLegalisationOrder({
    ...body,
    // The destination decides which authority legalises the documents; the
    // origin decides whether an apostille is available at all. Both are resolved
    // from the name the client chose, in this database.
    destinationCountryId: await resolveCountry(
      body.destinationCountrySlug,
      body.destinationCountryId,
      `${journey} destination`
    ),
    nationalityCountryId: await resolveCountry(
      body.nationalityCountrySlug,
      body.nationalityCountryId,
      `${journey} origin`
    ),
    applicants: body.applicants
      ? await resolveApplicants(body.applicants, journey)
      : undefined,
    returnAddress: await resolveReturnAddress(body.returnAddress, journey),
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

/**
 * POST /api/orders/visa
 *
 * The destination is resolved from the slug the website named rather than taken
 * from the integer it sent — see `domain/countries` for the failure that
 * motivated it. Where the two disagree the slug wins and the drift is logged: it
 * is the answer read from this database, so it is the one that names the country
 * the client actually chose.
 */
orderRoutes.post(
  '/visa',
  authenticateOptional,
  validate(schemas.visaOrderSchema),
  async (req: Request, res: Response) => {
    const body = req.body as schemas.VisaOrderBody;

    const journey = 'Visa order';

    const destinationCountryId =
      (await resolveCountry(
        body.destinationCountrySlug,
        body.destinationCountryId,
        `${journey} destination`
      )) ?? body.destinationCountryId;

    const result = await lodge.lodgeVisaOrder({
      ...body,
      destinationCountryId,
      applicants: await resolveApplicants(body.applicants, journey),
      returnAddress: await resolveReturnAddress(body.returnAddress, journey),
      // `optionalId` yields `undefined` when the field is absent and `null` when
      // it is sent as null; the lodgement takes one shape for "not known".
      visaTypeId: body.visaTypeId ?? null,
      clientId: ownerOf(req),
    });

    created(res, result);
  }
);

// ---------------------------------------------------------------------------
// Confirmations held until payment
// ---------------------------------------------------------------------------

/**
 * An order that has not been paid for is not confirmed, so nothing is sent about
 * it. But the confirmation can only be *rendered* at checkout — the order tables
 * fold half of what the client's template prints into free text — so the website
 * renders it there, parks it here, and posts it when the payment lands.
 *
 * Both endpoints are internal-only. The parked body is the client's whole
 * application: their name, their passport numbers, their return address.
 */

const parkSchema = z.object({
  reference: z.string().trim().min(1, 'An order reference is required').max(64),
  content: z.object({
    subject: z.string().min(1).max(998),
    html: z.string().min(1).max(1_000_000),
    text: z.string().min(1).max(1_000_000),
  }),
  /** Null when the client gave no address anywhere in the order. */
  recipient: z.string().trim().max(320).nullable().optional(),
});

const referenceSchema = z.object({
  reference: z.string().trim().min(1, 'An order reference is required').max(64),
});

/**
 * POST /api/orders/confirmation/park
 *
 * Holds a rendered confirmation against an unpaid order. Overwrites any previous
 * one for the same reference — a client who restarts a checkout should have the
 * newer confirmation sent, not the abandoned one.
 */
orderRoutes.post(
  '/confirmation/park',
  internalOnly,
  validate(parkSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof parkSchema>;

    const parked = await confirmations.park(body.reference, {
      content: body.content,
      recipient: body.recipient ?? null,
    });

    ok(res, { parked });
  }
);

/**
 * POST /api/orders/confirmation/take
 *
 * Hands back an order's parked confirmation, **once**, and deletes it.
 *
 * A second caller gets `confirmation: null`, and so does an order that was never
 * parked or whose confirmation has been swept. That is not an error and must not
 * be treated as one: the webhook and the success page both ask, every time, and
 * exactly one of them is meant to get it.
 */
orderRoutes.post(
  '/confirmation/take',
  internalOnly,
  validate(referenceSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof referenceSchema>;

    ok(res, { confirmation: await confirmations.take(body.reference) });
  }
);

/**
 * POST /api/orders/confirmation/discard
 *
 * Throws a parked confirmation away unsent, for a checkout that failed after the
 * order was lodged. Nothing was charged, so there is nothing to confirm — and the
 * client's details should not sit on disk until the sweep notices.
 */
orderRoutes.post(
  '/confirmation/discard',
  internalOnly,
  validate(referenceSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof referenceSchema>;

    await confirmations.discard(body.reference);

    ok(res, { discarded: true });
  }
);

// ---------------------------------------------------------------------------
// Claiming a guest order
// ---------------------------------------------------------------------------

const claimSchema = z.object({
  reference: z.string().trim().min(1, 'An order reference is required').max(64),
});

/**
 * POST /api/orders/claim
 *
 * Server-to-server. Attaches a guest order to a client account, opening one if
 * the address is new, and returns the password when it did.
 *
 * ## Why this is internal-only, and why the reference is in the body
 *
 * **Internal**, because a success response can carry a plaintext password. There
 * is no session that should ever be allowed to ask for one — the only legitimate
 * caller is the website confirming a payment or an order, holding the shared
 * secret. `/api/cls/[...path]` blocks the path as well, so a browser cannot reach
 * it even by mistake.
 *
 * **The reference is in the body** rather than the path for the same reason: a
 * fixed path is one entry in that proxy's blocklist, where `orders/:reference/claim`
 * would need a pattern.
 *
 * ## Why a miss is a 200
 *
 * Every outcome that is not an outright failure comes back as a result the caller
 * can read — including "no such order" and "no address on it". The callers are a
 * Stripe webhook and an order confirmation: neither should retry, and neither
 * should fail the payment it has just recorded, because an account could not be
 * opened. Anything genuinely broken still throws and becomes a 5xx.
 */
orderRoutes.post(
  '/claim',
  internalOnly,
  validate(claimSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof claimSchema>;
    const result = await claimService.claim(body.reference);

    ok(res, { claim: result });
  }
);

// ---------------------------------------------------------------------------
// Documents attached while placing an order
// ---------------------------------------------------------------------------

const journeyDocumentsSchema = z.object({
  reference: z.string().trim().min(1, 'An order reference is required').max(64),
});

/**
 * POST /api/orders/documents
 *
 * `multipart/form-data`, server-to-server. The scans a client attached to the
 * order form itself, stored against the order the moment it is lodged.
 *
 * ## Why this exists when `/:reference/documents` already does
 *
 * That route sits behind `authenticate`, and the person this one serves has no
 * token: the clearance, voucher and legalisation journeys can all be completed by
 * a guest. Their scans used to be dropped on the floor — the website collected
 * `File` objects, never sent them, and said so in a comment — so a client who
 * attached their passport at 2am got a consultant emailing to ask for it.
 *
 * **Internal**, because there is no session to check ownership against, so the
 * only thing standing between this and an open write endpoint is the shared
 * secret. `/api/cls/[...path]` blocks the path too. The website's own route
 * forwards a browser's upload and is the only caller.
 *
 * **The reference is in the body**, for the same reason `claim` puts it there: a
 * fixed path is one entry in that proxy's blocklist where a pattern would be
 * needed otherwise. It also has to be — `manyFiles` has already consumed the
 * stream by the time a handler could read a path parameter, and multipart text
 * fields land on `req.body` beside the files.
 *
 * ## Ordering
 *
 * `manyFiles` runs before `validate`, because the reference is a multipart field
 * and multer is what parses it onto `req.body`. Validating first would read an
 * empty body and reject every request.
 *
 * ## Why an unknown reference is a 404 here, and not a 200 like `claim`
 *
 * `claim` swallows a miss because its caller has just taken a payment and must
 * not fail. This runs at lodgement, before money moves, and its caller can still
 * show the client something honest. A silent 200 would leave the website
 * believing the scans were stored.
 */
orderRoutes.post(
  '/documents',
  internalOnly,
  limits.upload,
  manyFiles,
  validate(journeyDocumentsSchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof journeyDocumentsSchema>;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];

    if (files.length === 0) throw badRequest('Choose at least one file to upload.');

    const resolved = await service.resolve(body.reference);

    if (!resolved) {
      throw notFound('We could not find that order, so there is nowhere to store these files.');
    }

    created(res, { documents: await attachDocuments(resolved, files) });
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
 * GET /api/orders/:reference/delivery
 *
 * Where the finished documents are going, as recorded on this order — not the
 * account's own delivery address, which is a different fact. Null where the order
 * records none, which is ordinary for anything issued electronically.
 */
referenceRoutes.get('/delivery', async (req: Request, res: Response) => {
  ok(res, { delivery: await service.delivery(await resolveFromParams(req)) });
});

/**
 * POST /api/orders/:reference/comments
 *
 * The client's own note on their order, written into the same `tbl_order_notes`
 * log a consultant reads and replies in. Not marked internal, so the client sees
 * it back — see `addClientComment` for why that flag matters.
 */
referenceRoutes.post(
  '/comments',
  validate(
    z.object({
      body: z.string().trim().min(1, 'Write something before posting it').max(4000),
    })
  ),
  async (req: Request, res: Response) => {
    const resolved = await resolveFromParams(req);
    const { body } = req.body as { body: string };

    created(res, await addClientComment(resolved, body, currentUserId(req)));
  }
);

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
