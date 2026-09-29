import path from 'node:path';
import { Op } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { UserClient } from '../../models';
import { notFound } from '../../shared/errors';
import { paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { streamDocument } from '../../shared/http/streamDocument';
import { openDocument } from '../../shared/storage/documents';
import { toIso } from '../../shared/dates';
import { clean, fullName } from '../../shared/text';
import { idParam, validate, validParams } from '../../shared/validation';

/**
 * The legacy "Passport Photos" screen — every client account that has ever
 * uploaded one, newest first. Reproduces
 * `ManagePassportOfficePickupDeliveryController::passportPhotosAction` /
 * `passportPhotoListAction`.
 *
 * ## Read-only, on purpose
 *
 * The legacy screen has no approve, reject or delete action of its own — it is
 * a list with a thumbnail and a way to open the full photo. `tbl_user_client`
 * holds exactly one photo per client, in one column, with no review state; see
 * the long note on `toPhotoView` in the portal module for what that means and
 * why a proper review queue needs a schema change CLS has not made. This mirrors
 * that limitation rather than inventing states the database cannot record.
 *
 * ## What counts as "has a photo"
 *
 * `passport_photo IS NOT NULL AND != ''`. The legacy query has no such
 * condition — it lists every client and lets the template show a placeholder
 * image where the column is blank — but that means paging through five years of
 * clients who never submitted one to find the handful who did. Filtering
 * server-side is the one deliberate improvement over the original screen.
 */

export const passportPhotoRoutes = Router();

const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
});

/** GET /api/admin/passport-photos */
passportPhotoRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const page = readPage(req);

    const { rows, count } = await UserClient.findAndCountAll({
      where: { passport_photo: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: '' }] } },
      order: [['passport_updated_at', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(
      res,
      'photos',
      rows.map((row) => ({
        id: row.id,
        name: fullName(row.fname, row.lname),
        email: clean(row.email),
        type: clean(row.type),
        updatedAt: toIso(row.passport_updated_at),
      })),
      pageMeta(page, count)
    );
  }
);

/**
 * GET /api/admin/passport-photos/:id/file
 *
 * Streams the client's stored photo, the way `/api/portal/passport-photos/:id/download`
 * does for the client themselves — same storage helpers, so a photo on S3 or on
 * local disk is served the same way from either screen.
 */
passportPhotoRoutes.get(
  '/:id/file',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);

    const client = await UserClient.findByPk(id);
    if (!client || !clean(client.passport_photo)) {
      throw notFound('That client has no passport photo on file.');
    }

    const opened = await openDocument(client.passport_photo!);
    if (!opened) throw notFound('We could not find that photo file.');

    res.setHeader(
      'Content-Disposition',
      `inline; filename="${path.basename(client.passport_photo!)}"`
    );
    streamDocument(opened, res, { clientId: id });
  }
);
