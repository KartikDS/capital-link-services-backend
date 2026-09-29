import path from 'node:path';
import { Op } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { TranslationServices } from '../../models';
import { notFound } from '../../shared/errors';
import { paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { streamDocument } from '../../shared/http/streamDocument';
import { openDocument } from '../../shared/storage/documents';
import { toIso } from '../../shared/dates';
import { clean } from '../../shared/text';
import { idParam, validate, validParams, validQuery } from '../../shared/validation';
import {
  splitTranslationDocumentNames,
  translationDocumentPath,
} from '../../domain/translationDocuments';

/**
 * The legacy "Translation Services" screen — reproduces
 * `ManageGeneralSettingsController::translationServicesAction` /
 * `translationServicesListAction` / `translationServicesDownloadAction`.
 *
 * ## Read-only, and it always was
 *
 * The legacy screen has no create, edit or delete action — only a list and a
 * download. `tbl_translation_services` is filled by the public translation
 * enquiry form, not by staff, so there is nothing here to write. The
 * `new.html.twig`/`edit.html.twig` files that sit next to the legacy
 * templates under this name are dead code left over from a copy-paste of the
 * General Settings screen (they post to *that* screen's routes, not this
 * one) — this reproduces what the controller's actions actually do, not what
 * the orphaned templates imply.
 *
 * ## The download is per-row, unlike the legacy one
 *
 * The legacy download took a bare `?filename=` against a fixed directory with
 * no check that the filename belonged to the enquiry a consultant was even
 * looking at. This resolves it against the specific row's own
 * `document_name` list instead — a stricter check the legacy screen didn't
 * have, not a smaller version of it.
 */

export const translationServiceRoutes = Router();

/** GET /api/admin/translation-services */
translationServiceRoutes.get(
  '/',
  validate(
    z.object({
      search: z.string().trim().min(1).max(200).optional(),
      page: z.coerce.number().int().positive().optional(),
      perPage: z.coerce.number().int().positive().max(100).optional(),
    }),
    'query'
  ),
  async (req: Request, res: Response) => {
    const { search } = validQuery<{ search?: string }>(req);
    const page = readPage(req);

    const { rows, count } = await TranslationServices.findAndCountAll({
      where: search
        ? {
            [Op.or]: [
              { full_name: { [Op.like]: `%${search}%` } },
              { email: { [Op.like]: `%${search}%` } },
              { language_from: { [Op.like]: `%${search}%` } },
              { language_to: { [Op.like]: `%${search}%` } },
            ],
          }
        : {},
      order: [['created', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(
      res,
      'enquiries',
      rows.map((row) => ({
        id: row.id,
        fullName: clean(row.full_name),
        email: clean(row.email),
        phone: clean(row.phone),
        languageFrom: clean(row.language_from),
        languageTo: clean(row.language_to),
        documents: splitTranslationDocumentNames(row.document_name),
        createdAt: toIso(row.created),
      })),
      pageMeta(page, count)
    );
  }
);

/**
 * GET /api/admin/translation-services/:id/documents/:filename/file
 *
 * `:filename` must be one of the row's own `document_name` entries — see the
 * module doc comment on why this checks that rather than trusting the path
 * the way the legacy download did.
 */
translationServiceRoutes.get(
  '/:id/documents/:filename/file',
  validate(
    z.object({ id: idParam, filename: z.string().trim().min(1).max(225) }),
    'params'
  ),
  async (req: Request, res: Response) => {
    const { id, filename } = validParams<{ id: number; filename: string }>(req);

    const row = await TranslationServices.findByPk(id);
    if (!row) throw notFound('We could not find that enquiry.');

    const documents = splitTranslationDocumentNames(row.document_name);
    if (!documents.includes(filename)) {
      throw notFound('That enquiry has no such document.');
    }

    const opened = await openDocument(translationDocumentPath(filename));
    if (!opened) throw notFound('We could not find that document file.');

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${path.basename(filename)}"`
    );
    streamDocument(opened, res, { translationServiceId: id });
  }
);
