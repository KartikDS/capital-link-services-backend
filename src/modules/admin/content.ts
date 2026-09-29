import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ContentPages, Sections } from '../../models';
import { adminSectionImageUpload } from '../../middleware/upload';
import { notFound } from '../../shared/errors';
import { created, ok, paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { storedPathOf } from '../../shared/storage/documents';
import { clean } from '../../shared/text';
import { idParam, validate, validParams } from '../../shared/validation';

/**
 * "Manage Content Pages" and "Manage Section" — the legacy sidebar's two
 * content-editing screens. Reproduces `ManageContentPagesController` and
 * `ManageSectionsController`.
 *
 * ## Content Pages has a create action; Sections does not
 *
 * That is the legacy admin's own design, not an omission here. Content pages
 * are freestanding (a title and a block of HTML, and CLS can add as many as it
 * wants). Sections are fixed rows the website's templates already reference by
 * `page_slug` — the "What We Do" block on the homepage, say — so a new one
 * would need a template to render it, and adding one from this screen was never
 * possible in the original either. Sections can only be edited and toggled.
 *
 * ## The HTML is trusted, and it is a member of staff's to write
 *
 * The legacy screens ran `strip_tags($_POST['html'], $mod->acceptTagsExceptScript())`
 * — everything except `<script>`. Reproduced the same way here: a crude
 * `<script>` strip on the way in, not a full sanitiser, because this content is
 * authored by staff behind `requireAdmin` and rendered on the public site
 * exactly as they wrote it — the same trust boundary the legacy admin operated
 * under.
 */

export const contentPageAdminRoutes = Router();
export const sectionAdminRoutes = Router();

const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
});

/** Drops `<script>...</script>` and bare `<script ...>` tags. Not a full sanitiser — see the module note. */
const stripScripts = (html: string): string =>
  html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*\/?>/gi, '');

// ---------------------------------------------------------------------------
// Content Pages
// ---------------------------------------------------------------------------

const contentPageBody = z.object({
  title: z.string().trim().min(1).max(255),
  html: z.string().max(200_000),
});

const toContentPageRow = (row: ContentPages) => ({
  id: row.id,
  title: clean(row.title),
  status: clean(row.status) ?? 'active',
});

contentPageAdminRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const page = readPage(req);

    const { rows, count } = await ContentPages.findAndCountAll({
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(res, 'pages', rows.map(toContentPageRow), pageMeta(page, count));
  }
);

contentPageAdminRoutes.get(
  '/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await ContentPages.findByPk(id);
    if (!row) throw notFound('We could not find that page.');

    ok(res, { page: { ...toContentPageRow(row), html: clean(row.html) ?? '' } });
  }
);

contentPageAdminRoutes.post('/', async (req: Request, res: Response) => {
  const body = contentPageBody.parse(req.body);

  const row = await ContentPages.create({
    title: body.title,
    html: stripScripts(body.html),
    status: 'active',
  });

  created(res, { page: { ...toContentPageRow(row), html: clean(row.html) ?? '' } });
});

contentPageAdminRoutes.patch(
  '/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = contentPageBody.partial().parse(req.body);

    const row = await ContentPages.findByPk(id);
    if (!row) throw notFound('We could not find that page.');

    await row.update({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.html !== undefined ? { html: stripScripts(body.html) } : {}),
    });

    ok(res, { page: { ...toContentPageRow(row), html: clean(row.html) ?? '' } });
  }
);

/** PATCH /api/admin/content-pages/:id/status — toggles active/inactive, as the legacy screen does. */
contentPageAdminRoutes.patch(
  '/:id/status',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await ContentPages.findByPk(id);
    if (!row) throw notFound('We could not find that page.');

    const next = row.status === 'active' ? 'inactive' : 'active';
    await row.update({ status: next });

    ok(res, { id, status: next });
  }
);

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const sectionBody = z.object({
  title: z.string().trim().min(1).max(255),
  content: z.string().max(200_000),
});

const toSectionRow = (row: Sections) => ({
  id: row.id,
  title: clean(row.title),
  pageSlug: clean(row.page_slug),
  status: clean(row.status) ?? 'active',
});

sectionAdminRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const page = readPage(req);

    const { rows, count } = await Sections.findAndCountAll({
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(res, 'sections', rows.map(toSectionRow), pageMeta(page, count));
  }
);

sectionAdminRoutes.get(
  '/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await Sections.findByPk(id);
    if (!row) throw notFound('We could not find that section.');

    ok(res, {
      section: {
        ...toSectionRow(row),
        content: clean(row.content) ?? '',
        image: clean(row.image),
      },
    });
  }
);

/**
 * PATCH /api/admin/sections/:id
 *
 * No POST alongside it — sections are fixed rows the website's templates
 * already reference by `page_slug`. See the module note.
 *
 * `adminSectionImageUpload` runs first so a multipart body's text fields land
 * on `req.body` the same as a JSON one's — multer has to populate it before
 * anything downstream reads it. A request with no `image` field is exactly
 * as valid as before: the image column is only touched when one arrives.
 */
sectionAdminRoutes.patch(
  '/:id',
  validate(z.object({ id: idParam }), 'params'),
  adminSectionImageUpload,
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = sectionBody.partial().parse(req.body);

    const row = await Sections.findByPk(id);
    if (!row) throw notFound('We could not find that section.');

    await row.update({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.content !== undefined ? { content: stripScripts(body.content) } : {}),
      ...(req.file ? { image: storedPathOf(req.file) } : {}),
      status: 'active',
    });

    ok(res, {
      section: { ...toSectionRow(row), content: clean(row.content) ?? '' },
    });
  }
);

sectionAdminRoutes.patch(
  '/:id/status',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await Sections.findByPk(id);
    if (!row) throw notFound('We could not find that section.');

    const next = row.status === 'active' ? 'inactive' : 'active';
    await row.update({ status: next });

    ok(res, { id, status: next });
  }
);
