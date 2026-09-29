import path from 'node:path';
import { Op } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Countries, FreeVisaDocument, PublicVisaTypes, UserClient } from '../../models';
import { notFound } from '../../shared/errors';
import { paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { streamDocument } from '../../shared/http/streamDocument';
import { openDocument } from '../../shared/storage/documents';
import { toIso } from '../../shared/dates';
import { clean, fullName } from '../../shared/text';
import { idParam, validate, validParams, validQuery } from '../../shared/validation';

/**
 * The legacy "Free Visa Document" screen — reproduces
 * `ManagePassportOfficePickupDeliveryController::freeVisaDocumentAction` /
 * `freeVisaDocumentListAction` / `freeVisaDocumentDownloadAction`.
 *
 * Read-only, exactly as the legacy screen was — no create, edit or delete
 * route exists there, only a list and a download. `tbl_free_visa_document`
 * is written by the client-facing free-visa-document upload flow, not by
 * staff.
 */

export const freeVisaDocumentAdminRoutes = Router();

/**
 * Named after the legacy directory (`web/dev/user_freevisa_document/`) for
 * the same reason `TRANSLATION_DOCUMENT_DIR` is — an operator can bridge the
 * two with a mount or a bucket sync without anyone re-reading this file.
 */
const FREE_VISA_DOCUMENT_DIR = 'user_freevisa_document';

const listQuery = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(200).optional(),
});

/** GET /api/admin/free-visa-documents */
freeVisaDocumentAdminRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const { search } = validQuery<{ search?: string }>(req);
    const page = readPage(req);

    const { rows, count } = await FreeVisaDocument.findAndCountAll({
      include: [
        { model: Countries, as: 'destinationCountry', required: false },
        { model: UserClient, as: 'client', required: false },
      ],
      where: search
        ? {
            [Op.or]: [
              { '$client.fname$': { [Op.like]: `%${search}%` } },
              { '$client.lname$': { [Op.like]: `%${search}%` } },
              { '$client.email$': { [Op.like]: `%${search}%` } },
            ],
          }
        : {},
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
      subQuery: false,
    });

    const visaTypeIds = [...new Set(rows.map((row) => row.visa_type))];
    const visaTypes = visaTypeIds.length
      ? await PublicVisaTypes.findAll({ where: { id: visaTypeIds } })
      : [];
    const visaTypeName = new Map(
      visaTypes.map((row) => [row.id, clean(row.title)])
    );

    paged(
      res,
      'documents',
      rows.map((row) => {
        const wide = row as unknown as {
          destinationCountry?: { country_name: string | null };
          client?: { fname: string | null; lname: string | null; email: string | null };
        };

        return {
          id: row.id,
          clientName: fullName(wide.client?.fname, wide.client?.lname),
          clientEmail: clean(wide.client?.email),
          destination: clean(wide.destinationCountry?.country_name),
          visaType: visaTypeName.get(row.visa_type) ?? null,
          documentName: clean(row.document_name),
          createdAt: toIso(row.created),
        };
      }),
      pageMeta(page, count)
    );
  }
);

/** GET /api/admin/free-visa-documents/:id/file */
freeVisaDocumentAdminRoutes.get(
  '/:id/file',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);

    const row = await FreeVisaDocument.findByPk(id);
    if (!row) throw notFound('We could not find that document.');

    const filename = clean(row.document_name);
    if (!filename) throw notFound('That row has no document on file.');

    const opened = await openDocument(`${FREE_VISA_DOCUMENT_DIR}/${filename}`);
    if (!opened) throw notFound('We could not find that document file.');

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${path.basename(filename)}"`
    );
    streamDocument(opened, res, { freeVisaDocumentId: id });
  }
);
