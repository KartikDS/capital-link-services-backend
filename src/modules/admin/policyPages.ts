import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { ContentPages } from '../../models';
import { notFound } from '../../shared/errors';
import { ok } from '../../shared/http/responses';
import { isBlankRichText, sanitizeRichText } from '../../shared/richText';
import { clean } from '../../shared/text';
import { validate, validParams } from '../../shared/validation';
import {
  POLICY_PAGES,
  findPolicyRow,
  isPolicySlug,
  policyTitle,
  type PolicySlug,
} from '../content/policyPages';

/**
 * The five policy pages staff edit from Content Pages — Privacy Policy, Terms,
 * Quality, Environmental, Health & Safety. See `content/policyPages.ts` for why
 * they are a fixed list keyed by slug rather than rows addressed by id.
 *
 * Unlike the generic content-page routes, the HTML saved here goes through a
 * real allow-list (`sanitizeRichText`), because the editor on the other end
 * produces a known, small set of tags and nothing outside it should be stored.
 */

export const policyPageAdminRoutes = Router();

const slugParam = z.object({
  slug: z.string().refine((value) => isPolicySlug(value), 'Unknown page'),
});

const saveBody = z.object({
  html: z.string().max(200_000),
  /** False keeps the saved copy but sends the website back to its shipped wording. */
  active: z.boolean().optional(),
});

const toPolicyView = (slug: PolicySlug, row: ContentPages | null) => ({
  slug,
  title: policyTitle(slug),
  saved: row !== null,
  active: row !== null && row.status === 'active',
});

/** GET /api/admin/content-pages/policies */
policyPageAdminRoutes.get('/', async (_req: Request, res: Response) => {
  const pages = await Promise.all(
    POLICY_PAGES.map(async ({ slug }) => toPolicyView(slug, await findPolicyRow(slug)))
  );

  ok(res, { pages });
});

/** GET /api/admin/content-pages/policies/:slug — `html` is empty until a copy is saved. */
policyPageAdminRoutes.get(
  '/:slug',
  validate(slugParam, 'params'),
  async (req: Request, res: Response) => {
    const { slug } = validParams<{ slug: PolicySlug }>(req);
    const row = await findPolicyRow(slug);

    ok(res, { page: { ...toPolicyView(slug, row), html: clean(row?.html) ?? '' } });
  }
);

/** PUT /api/admin/content-pages/policies/:slug — creates the row on first save. */
policyPageAdminRoutes.put(
  '/:slug',
  validate(slugParam, 'params'),
  async (req: Request, res: Response) => {
    const { slug } = validParams<{ slug: PolicySlug }>(req);
    const body = saveBody.parse(req.body);

    const html = isBlankRichText(body.html) ? '' : sanitizeRichText(body.html);
    const status = body.active === false ? 'inactive' : 'active';

    const existing = await findPolicyRow(slug);

    const row = existing
      ? await existing.update({ html, status })
      : await ContentPages.create({ title: policyTitle(slug), html, tags: slug, status });

    if (!row) throw notFound('We could not save that page.');

    ok(res, { page: { ...toPolicyView(slug, row), html } });
  }
);
