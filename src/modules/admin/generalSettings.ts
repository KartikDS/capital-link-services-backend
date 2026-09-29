import { Op } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { GeneralSettings } from '../../models';
import { notFound } from '../../shared/errors';
import { created, noContent, ok, paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { toLegacyDateTime } from '../../shared/dates';
import { clean } from '../../shared/text';
import { idParam, validate, validParams, validQuery } from '../../shared/validation';

/**
 * The legacy "General Settings" screen — reproduces
 * `ManageGeneralSettingsController::indexAction`/`newAction`/`editAction`.
 *
 * ## A key/value table, not a singleton form
 *
 * Unlike the four singleton settings screens in `settings.ts` (passport
 * delivery pricing, the Saudi visa popup, the credit card fee, the doc
 * legalisation attachment — each one row, fixed at `id = 1`), this is a
 * genuine CRUD list: an arbitrary number of named settings, each either a
 * free-text value or a yes/no toggle. The legacy screen names the toggle
 * "Field Type" and stores it as the string `"1"` (Text) or `"2"` (Yes/No) —
 * kept as a string here rather than coerced to a number, because that is
 * exactly what `tbl_general_settings.field_type` is.
 *
 * ## No delete route in the legacy screen — this adds one anyway
 *
 * `ManageGeneralSettingsController` never wires a delete action to this
 * screen (confirmed by reading the index template's own JS globals — only a
 * list and an open URL are declared, no delete URL). Every other CRUD list in
 * this admin — the seven pricing tables, the four user tables — has one, and
 * a settings row that should not have existed is exactly the kind of mistake
 * a consultant needs to be able to undo. This is the rebuild adding a safety
 * net the legacy screen lacked, not a field or a workflow the legacy screen
 * had that this one is missing.
 */

export const generalSettingsAdminRoutes = Router();

const listQuery = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(200).optional(),
});

const idParams = z.object({ id: idParam });

const settingBody = z.object({
  title: z.string().trim().min(1).max(255),
  // The legacy "Constant" field. Free text rather than auto-slugified from
  // the title, because the legacy form let staff type it directly and a
  // setting a client's code already reads by this value must not shift under
  // an edit that only meant to reword the title.
  slug: z.string().trim().min(1).max(255),
  fieldType: z.enum(['1', '2']),
  // Required when `fieldType` is `1` (Text), ignored when it is `2`
  // (Yes/No) — the legacy form hides whichever half doesn't apply rather
  // than validating it away, and this does the same.
  value: z.string().max(20_000).optional(),
  enabled: z.boolean().optional(),
});

const toSettingRow = (row: GeneralSettings) => ({
  id: row.id,
  title: clean(row.title) ?? '',
  slug: clean(row.slug) ?? '',
  fieldType: clean(row.field_type) === '2' ? '2' : '1',
  value: clean(row.value),
  enabled: row.status === 1,
});

/** GET /api/admin/general-settings */
generalSettingsAdminRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const { search } = validQuery<{ search?: string }>(req);
    const page = readPage(req);

    const { rows, count } = await GeneralSettings.findAndCountAll({
      where: search
        ? {
            [Op.or]: [
              { title: { [Op.like]: `%${search}%` } },
              { slug: { [Op.like]: `%${search}%` } },
            ],
          }
        : {},
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(res, 'settings', rows.map(toSettingRow), pageMeta(page, count));
  }
);

/** GET /api/admin/general-settings/:id */
generalSettingsAdminRoutes.get(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await GeneralSettings.findByPk(id);
    if (!row) throw notFound('We could not find that setting.');
    ok(res, { setting: toSettingRow(row) });
  }
);

/** POST /api/admin/general-settings */
generalSettingsAdminRoutes.post(
  '/',
  validate(settingBody),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof settingBody>;

    const row = await GeneralSettings.create({
      title: body.title,
      slug: body.slug,
      field_type: body.fieldType,
      value: body.fieldType === '1' ? (body.value?.trim() || null) : null,
      status: body.fieldType === '2' ? (body.enabled ? 1 : 0) : null,
      created: toLegacyDateTime(),
      updated: toLegacyDateTime(),
    });

    created(res, { setting: toSettingRow(row) });
  }
);

/** PATCH /api/admin/general-settings/:id */
generalSettingsAdminRoutes.patch(
  '/:id',
  validate(idParams, 'params'),
  validate(settingBody.partial()),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = req.body as Partial<z.infer<typeof settingBody>>;

    const row = await GeneralSettings.findByPk(id);
    if (!row) throw notFound('We could not find that setting.');

    const fieldType = body.fieldType ?? clean(row.field_type) ?? '1';

    await row.update({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.slug !== undefined ? { slug: body.slug } : {}),
      ...(body.fieldType !== undefined ? { field_type: body.fieldType } : {}),
      ...(fieldType === '1' && body.value !== undefined
        ? { value: body.value.trim() || null }
        : {}),
      ...(fieldType === '2' && body.enabled !== undefined
        ? { status: body.enabled ? 1 : 0 }
        : {}),
      updated: toLegacyDateTime(),
    });

    ok(res, { setting: toSettingRow(row) });
  }
);

/** DELETE /api/admin/general-settings/:id — see the module doc comment. */
generalSettingsAdminRoutes.delete(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await GeneralSettings.findByPk(id);
    if (!row) throw notFound('We could not find that setting.');
    await row.destroy();
    noContent(res);
  }
);
