import { Op } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  Banners,
  ContentPages,
  GeneralSettings,
  HomeAds,
  HomeImageSlider,
  Sections,
  Services,
  TravelAlerts,
  VideoTutorials,
  VisaPopupContent,
} from '../../models';
import { authenticate, requireAdmin } from '../../middleware/authenticate';
import { notFound } from '../../shared/errors';
import { created, message, ok } from '../../shared/http/responses';
import { toIso, toLegacyDateTime } from '../../shared/dates';
import { toCents } from '../../shared/money';
import { clean, cleanOr, stripHtml, toBoolean, truncate } from '../../shared/text';
import { idParam, validate, validParams, validQuery } from '../../shared/validation';
import { logger } from '../../shared/logger';

/**
 * Editable page copy, from the CMS tables.
 *
 * The website ships its own copy for every page and reads these as *overrides*.
 * So the important convention here is the response shape: a page with no row in
 * the database answers `available: false` rather than 404, and the website keeps
 * rendering what it shipped.
 *
 * That is the normal case, not the exception. Most of the website's seventy-odd
 * marketing pages have no row in `tbl_content_pages`, and a 404 for each would
 * fill the logs with errors that are not errors.
 *
 * ## HTML
 *
 * `tbl_content_pages.html` and `tbl_sections.content` are `longtext` holding
 * operator-authored HTML. It is returned as HTML, because the pages render it as
 * formatted copy — but every *summary* field is stripped to plain text, so
 * anything using this for a list or a meta description cannot pick up markup.
 * The website is responsible for sanitising what it renders; this API does not
 * pretend the stored value is safe.
 */

export const contentRoutes = Router();

// ---------------------------------------------------------------------------
// Pages and sections
// ---------------------------------------------------------------------------

const isPublished = {
  [Op.or]: [
    { status: { [Op.is]: null } },
    { status: { [Op.notIn]: ['draft', 'Draft', 'DRAFT', 'inactive', '0'] } },
  ],
};

/**
 * GET /api/content/pages/:slug
 *
 * `tbl_content_pages` has no slug column — it has `title` and `tags`. So a slug
 * is matched against both: the title slugified, and the tag list. That is how the
 * old application finds these rows, and inventing a slug column would be DDL.
 */
contentRoutes.get(
  '/pages/:slug',
  validate(
    z.object({ slug: z.string().trim().min(1).max(255).regex(/^[a-z0-9-]+$/) }),
    'params'
  ),
  async (req: Request, res: Response) => {
    const { slug } = validParams<{ slug: string }>(req);
    const spaced = slug.replace(/-/g, ' ');

    const page = await ContentPages.findOne({
      where: {
        ...isPublished,
        [Op.or]: [
          { title: { [Op.like]: spaced } },
          { tags: { [Op.like]: `%${slug}%` } },
        ],
      },
    });

    if (!page) {
      // Not a 404: no override is the normal state, and the website falls back
      // to the copy it ships.
      return ok(res, { available: false, page: null });
    }

    return ok(res, {
      available: true,
      page: {
        id: String(page.id),
        slug,
        title: cleanOr(page.title, ''),
        html: clean(page.html),
        summary: truncate(stripHtml(page.html), 300),
        tags: clean(page.tags)?.split(',').map((tag) => tag.trim()).filter(Boolean) ?? [],
      },
    });
  }
);

/**
 * GET /api/content/sections?page=about
 *
 * `tbl_sections` is the one CMS table with a unique key (`section_key`), which
 * makes it the reliable one to address by name. `page_slug` groups the sections
 * that belong to one page.
 */
contentRoutes.get(
  '/sections',
  validate(
    z.object({
      page: z.string().trim().max(255).optional(),
      key: z.string().trim().max(255).optional(),
    }),
    'query'
  ),
  async (req: Request, res: Response) => {
    const query = validQuery<{ page?: string; key?: string }>(req);

    const rows = await Sections.findAll({
      where: {
        status: 'active',
        ...(query.page ? { page_slug: query.page } : {}),
        ...(query.key ? { section_key: query.key } : {}),
      },
      limit: 200,
    });

    ok(res, {
      available: rows.length > 0,
      sections: rows.map((row) => ({
        id: String(row.id),
        key: clean(row.section_key),
        title: clean(row.title),
        content: clean(row.content),
        summary: truncate(stripHtml(row.content), 300),
        image: clean(row.image),
        page: clean(row.page_slug),
      })),
    });
  }
);

// ---------------------------------------------------------------------------
// Home page furniture
// ---------------------------------------------------------------------------

/** GET /api/content/banners?location=home */
contentRoutes.get(
  '/banners',
  validate(z.object({ location: z.string().trim().max(255).optional() }), 'query'),
  async (req: Request, res: Response) => {
    const { location } = validQuery<{ location?: string }>(req);

    const rows = await Banners.findAll({
      where: { status: 1, ...(location ? { location } : {}) },
      order: [['created', 'DESC']],
    });

    ok(res, {
      available: rows.length > 0,
      banners: rows.map((row) => ({
        id: String(row.id),
        title: cleanOr(row.title, ''),
        subtitle: clean(row.sub_title),
        image: clean(row.banner_image),
        location: clean(row.location),
        updatedAt: toIso(row.updated),
      })),
    });
  }
);

/** GET /api/content/home — the slider and the ad slots, in one call. */
contentRoutes.get('/home', async (_req: Request, res: Response) => {
  const [slides, ads] = await Promise.all([
    HomeImageSlider.findAll({ where: { s_enabled: 1 }, order: [['id', 'ASC']] }),
    HomeAds.findAll({ where: { s_enabled: 1 }, order: [['id', 'ASC']] }),
  ]);

  ok(res, {
    available: slides.length > 0 || ads.length > 0,
    slider: slides.map((row) => ({
      id: String(row.id),
      image: clean(row.image),
      html: clean(row.front_html),
    })),
    ads: ads.map((row) => ({
      id: String(row.id),
      image: clean(row.image),
      link: clean(row.link),
    })),
  });
});

/**
 * GET /api/content/services
 *
 * `tbl_services.parent_id` makes this a two-level tree, so it is returned nested
 * rather than flat — the website renders a service and its sub-services together
 * and would otherwise have to rebuild the tree itself.
 */
contentRoutes.get('/services', async (_req: Request, res: Response) => {
  const rows = await Services.findAll({
    where: { status: 1 },
    order: [['title', 'ASC']],
  });

  const toView = (row: Services) => ({
    id: String(row.id),
    title: cleanOr(row.title, ''),
    subtitle: clean(row.sub_title),
    description: clean(row.short_description),
    image: clean(row.image),
    chargesCents: toCents(row.charges),
  });

  const parents = rows.filter((row) => !row.parent_id);
  const childrenOf = (parentId: number) =>
    rows.filter((row) => row.parent_id === parentId).map(toView);

  ok(res, {
    available: rows.length > 0,
    services: parents.map((parent) => ({
      ...toView(parent),
      children: childrenOf(parent.id),
    })),
  });
});

/** GET /api/content/travel-alerts — also served to the portal as notices. */
contentRoutes.get('/travel-alerts', async (_req: Request, res: Response) => {
  const rows = await TravelAlerts.findAll({
    where: { status: { [Op.notIn]: ['draft', 'Draft', 'DRAFT'] } },
    order: [['alert_date', 'DESC']],
    limit: 50,
  });

  ok(res, {
    available: rows.length > 0,
    alerts: rows.map((row) => ({
      id: String(row.id),
      subject: cleanOr(row.subject, ''),
      body: clean(row.body),
      summary: truncate(stripHtml(row.body), 200),
      image: clean(row.featured_image),
      date: toIso(row.alert_date),
    })),
  });
});

/** GET /api/content/video-tutorials?type=client */
contentRoutes.get(
  '/video-tutorials',
  validate(z.object({ type: z.string().trim().max(50).optional() }), 'query'),
  async (req: Request, res: Response) => {
    const { type } = validQuery<{ type?: string }>(req);

    const rows = await VideoTutorials.findAll({
      where: type ? { type } : {},
      order: [['id', 'ASC']],
    });

    ok(res, {
      available: rows.length > 0,
      videos: rows.map((row) => ({
        id: String(row.id),
        title: cleanOr(row.title, ''),
        video: clean(row.video),
        type: clean(row.type),
      })),
    });
  }
);

/** GET /api/content/visa-popup — the copy shown over the visa selector. */
contentRoutes.get('/visa-popup', async (_req: Request, res: Response) => {
  const row = await VisaPopupContent.findOne({ order: [['id', 'DESC']] });

  ok(res, {
    available: row !== null,
    content: clean(row?.content),
  });
});

/**
 * GET /api/content/settings
 *
 * `tbl_general_settings` is a key/value table — `slug`, `field_type`, `value` —
 * so it is returned as an object keyed by slug rather than as a list. `value` is
 * `text`, and `field_type` says how to read it, so numbers and booleans are
 * coerced here rather than leaving every caller to guess.
 */
contentRoutes.get('/settings', async (_req: Request, res: Response) => {
  const rows = await GeneralSettings.findAll({ where: { status: 1 } });

  const settings: Record<string, string | number | boolean | null> = {};

  for (const row of rows) {
    const key = clean(row.slug);
    if (!key) continue;

    const raw = clean(row.value);
    const type = clean(row.field_type)?.toLowerCase();

    settings[key] =
      type === 'number'
        ? raw === null
          ? null
          : Number(raw)
        : type === 'boolean' || type === 'checkbox'
          ? toBoolean(raw)
          : raw;
  }

  ok(res, { settings });
});

// ---------------------------------------------------------------------------
// Authoring
// ---------------------------------------------------------------------------

const authoringRoutes = Router();

authoringRoutes.use(authenticate, requireAdmin);

/**
 * PUT /api/content/admin/sections/:key
 *
 * Upserts by `section_key`, which is the one uniquely-indexed text column in the
 * CMS tables — so this is the only content write that cannot create a duplicate.
 */
authoringRoutes.put(
  '/sections/:key',
  validate(z.object({ key: z.string().trim().min(1).max(255) }), 'params'),
  validate(
    z.object({
      title: z.string().trim().max(255).optional().nullable(),
      content: z.string().max(200_000).optional().nullable(),
      image: z.string().trim().max(255).optional().nullable(),
      page: z.string().trim().max(255).optional().nullable(),
    })
  ),
  async (req: Request, res: Response) => {
    const { key } = validParams<{ key: string }>(req);
    const body = req.body as {
      title?: string | null;
      content?: string | null;
      image?: string | null;
      page?: string | null;
    };

    const existing = await Sections.findOne({ where: { section_key: key } });

    const values = {
      section_key: key,
      title: clean(body.title),
      content: clean(body.content),
      image: clean(body.image),
      page_slug: clean(body.page),
      status: 'active',
    };

    const row = existing
      ? await existing.update(values)
      : await Sections.create(values);

    logger.info('Content section saved', { key, id: row.id });

    ok(res, { section: { id: String(row.id), key } });
  }
);

/** POST /api/content/admin/travel-alerts — publish a notice. */
authoringRoutes.post(
  '/travel-alerts',
  validate(
    z.object({
      subject: z.string().trim().min(1, 'Enter a subject').max(1000),
      body: z.string().max(60_000).optional().nullable(),
      image: z.string().trim().max(255).optional().nullable(),
      date: z.string().trim().max(32).optional().nullable(),
      publish: z.boolean().optional(),
    })
  ),
  async (req: Request, res: Response) => {
    const body = req.body as {
      subject: string;
      body?: string | null;
      image?: string | null;
      date?: string | null;
      publish?: boolean;
    };

    const row = await TravelAlerts.create({
      subject: body.subject,
      body: clean(body.body),
      featured_image: clean(body.image),
      alert_date: body.date ?? toLegacyDateTime().slice(0, 10),
      admin_id: req.auth?.sub ?? null,
      status: body.publish === false ? 'draft' : 'published',
    });

    logger.info('Travel alert published', { id: row.id, by: req.auth?.sub });

    created(res, { alert: { id: String(row.id), subject: body.subject } });
  }
);

authoringRoutes.delete(
  '/travel-alerts/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await TravelAlerts.findByPk(id);

    if (!row) throw notFound('We could not find that alert.');

    await row.destroy();
    message(res, 'That alert has been removed.');
  }
);

contentRoutes.use('/admin', authoringRoutes);
