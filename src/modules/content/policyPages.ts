import { Op } from 'sequelize';
import { ContentPages } from '../../models';
import { clean } from '../../shared/text';

/**
 * The five corporate pages whose copy staff maintain from the admin.
 *
 * They are fixed on purpose. The website owns the routes, the hero images and
 * the layout; staff own only the words. So the admin never offers "new page" for
 * these, and the slug — not a database id — is what the two sides agree on.
 *
 * ## Where the row lives
 *
 * `tbl_content_pages` has no slug column, so the slug is stored in `tags`, the
 * way the generic page lookup already reads it. A page with no row is the
 * normal state: the website keeps rendering the copy it ships until staff save
 * one.
 *
 * The legacy site loaded these five by row id (22–26). Those ids are
 * deliberately *not* used: the rows behind them were never verified against the
 * copy CLS approved for the new site, and a lookup that silently adopted them
 * would swap the approved wording for whatever happens to sit in those rows.
 */
export const POLICY_PAGES = [
  { slug: 'privacy-policy', title: 'Privacy Policy' },
  { slug: 'terms-and-conditions', title: 'Terms, Conditions & Disclaimer' },
  { slug: 'quality-policy', title: 'Quality Policy' },
  { slug: 'environmental-policy', title: 'Environmental Policy' },
  { slug: 'health-and-safety', title: 'Health & Safety' },
] as const;

export type PolicySlug = (typeof POLICY_PAGES)[number]['slug'];

export const policySlugs: readonly string[] = POLICY_PAGES.map((p) => p.slug);

export const isPolicySlug = (value: string): value is PolicySlug =>
  policySlugs.includes(value);

export const policyTitle = (slug: PolicySlug): string =>
  POLICY_PAGES.find((p) => p.slug === slug)?.title ?? slug;

const hasTag = (tags: string | null, slug: string): boolean =>
  (
    clean(tags)
      ?.split(',')
      .map((tag) => tag.trim().toLowerCase()) ?? []
  ).includes(slug);

/** The row holding a policy's copy, or null when staff have not saved one. */
export const findPolicyRow = async (slug: PolicySlug): Promise<ContentPages | null> => {
  const candidates = await ContentPages.findAll({
    where: { tags: { [Op.like]: `%${slug}%` } },
    order: [['id', 'ASC']],
  });

  return candidates.find((row) => hasTag(row.tags, slug)) ?? null;
};
