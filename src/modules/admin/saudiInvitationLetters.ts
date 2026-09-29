import { Op } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { SaudiInvitationLetters } from '../../models';
import { badRequest, notFound } from '../../shared/errors';
import { created, noContent, ok, paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { toIso, toLegacyDateTime } from '../../shared/dates';
import { clean } from '../../shared/text';
import { idParam, validate, validParams, validQuery } from '../../shared/validation';

/**
 * The legacy "Saudi Invitation Letters" screen — reproduces
 * `SaudiInvitationLetterController::indexAction` / `viewApplicantDetailsAction`.
 *
 * ## An application is a group of rows, not one row
 *
 * `tbl_saudi_invitation_letters` has no `application_id` — a submission with
 * co-applicants is a primary row (`parent_id = 0`) plus up to four more rows
 * whose `parent_id` points back at the primary's own `id`. The list screen
 * shows one row per application (`parent_id = 0`); the detail screen reads
 * the primary and every row pointing at it.
 *
 * ## What this does not expose
 *
 * `region`, `invitation_file` and `status` are real columns, but the legacy
 * admin controller and its templates never read or write any of the three —
 * they are set or consumed by a process outside this screen. Exposing them
 * here would be inventing a control the legacy screen never had, so they are
 * left off the wire shape entirely rather than shown read-only.
 *
 * `file` (the applicant's own uploaded document) and sending the
 * verification email on completion both need infrastructure this admin API
 * doesn't have yet — a signed upload path and a mailer — so this screen is
 * data-only for now: every field but those two.
 */

export const saudiInvitationLetterAdminRoutes = Router();

const listQuery = z.object({
  search: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(200).optional(),
});

const idParams = z.object({ id: idParam });

const applicantBody = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(255).optional(),
  passportNumber: z.string().trim().max(255).optional(),
  gender: z.string().trim().max(255).optional(),
  nationalityId: z.coerce.number().int().positive().optional(),
  issuingLocation: z.enum(['Canberra', 'Sydney']).optional(),
  destinationId: z.coerce.number().int().positive().optional(),
  visaTypeId: z.coerce.number().int().positive().optional(),
  entryOption: z.coerce.number().int().min(1).max(3).optional(),
  durationOfStay: z.string().trim().max(255).optional(),
  validity: z.string().trim().max(255).optional(),
  occupation: z.string().trim().max(255).optional(),
  // Primary applicant only.
  sponsorName: z.string().trim().max(255).optional(),
  sponsorIdNumber: z.string().trim().max(255).optional(),
  sponsorPhone: z.string().trim().max(255).optional(),
  sponsorAddress: z.string().trim().max(20_000).optional(),
  multiApplyBeforeDate: z.string().trim().max(32).optional(),
  comment: z.string().trim().max(20_000).optional(),
});

const toApplicantRow = (row: SaudiInvitationLetters) => ({
  id: row.id,
  parentId: row.parent_id,
  orderId: row.order_id,
  name: clean(row.name),
  email: clean(row.email),
  phone: clean(row.phone),
  hasFile: Boolean(clean(row.file)),
  passportNumber: clean(row.passport_number),
  gender: clean(row.gender),
  nationalityId: row.nationality,
  issuingLocation: clean(row.issuing_location),
  destinationId: row.destination,
  visaTypeId: row.visa_type,
  entryOption: row.entry_option,
  durationOfStay: clean(row.duration_of_stay),
  validity: clean(row.validity),
  occupation: clean(row.occupation),
  sponsorName: clean(row.sponsor_name),
  sponsorIdNumber: clean(row.sponsor_id_number),
  sponsorPhone: clean(row.sponsor_phone),
  sponsorAddress: clean(row.sponsor_address),
  multiApplyBeforeDate: toIso(row.multi_apply_before_date),
  comment: clean(row.comment),
  createdAt: toIso(row.created_at),
});

/** GET /api/admin/saudi-invitation-letters — one row per application. */
saudiInvitationLetterAdminRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const { search } = validQuery<{ search?: string }>(req);
    const page = readPage(req);

    const { rows, count } = await SaudiInvitationLetters.findAndCountAll({
      where: {
        parent_id: 0,
        ...(search
          ? {
              [Op.or]: [
                { name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { phone: { [Op.like]: `%${search}%` } },
              ],
            }
          : {}),
      },
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(res, 'applications', rows.map(toApplicantRow), pageMeta(page, count));
  }
);

/**
 * GET /api/admin/saudi-invitation-letters/:id
 *
 * `:id` is the primary applicant's row id. The response carries the primary
 * plus every row whose `parent_id` points at it, in the order they were
 * added.
 */
saudiInvitationLetterAdminRoutes.get(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);

    const primary = await SaudiInvitationLetters.findByPk(id);
    if (!primary || primary.parent_id !== 0) {
      throw notFound('We could not find that application.');
    }

    const coApplicants = await SaudiInvitationLetters.findAll({
      where: { parent_id: id },
      order: [['id', 'ASC']],
    });

    ok(res, {
      application: {
        primary: toApplicantRow(primary),
        coApplicants: coApplicants.map(toApplicantRow),
      },
    });
  }
);

/** PATCH /api/admin/saudi-invitation-letters/applicants/:rowId */
saudiInvitationLetterAdminRoutes.patch(
  '/applicants/:rowId',
  validate(z.object({ rowId: idParam }), 'params'),
  validate(applicantBody),
  async (req: Request, res: Response) => {
    const { rowId } = validParams<{ rowId: number }>(req);
    const body = req.body as z.infer<typeof applicantBody>;

    const row = await SaudiInvitationLetters.findByPk(rowId);
    if (!row) throw notFound('We could not find that applicant.');

    const isPrimary = row.parent_id === 0;

    await row.update({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.passportNumber !== undefined
        ? { passport_number: body.passportNumber }
        : {}),
      ...(body.gender !== undefined ? { gender: body.gender } : {}),
      ...(body.nationalityId !== undefined
        ? { nationality: body.nationalityId }
        : {}),
      ...(body.issuingLocation !== undefined
        ? { issuing_location: body.issuingLocation }
        : {}),
      ...(body.destinationId !== undefined
        ? { destination: body.destinationId }
        : {}),
      ...(body.visaTypeId !== undefined ? { visa_type: body.visaTypeId } : {}),
      ...(body.entryOption !== undefined
        ? { entry_option: body.entryOption }
        : {}),
      ...(body.durationOfStay !== undefined
        ? { duration_of_stay: body.durationOfStay }
        : {}),
      ...(body.validity !== undefined ? { validity: body.validity } : {}),
      ...(body.occupation !== undefined ? { occupation: body.occupation } : {}),
      // The legacy form only ever shows these on applicant 1.
      ...(isPrimary && body.sponsorName !== undefined
        ? { sponsor_name: body.sponsorName }
        : {}),
      ...(isPrimary && body.sponsorIdNumber !== undefined
        ? { sponsor_id_number: body.sponsorIdNumber }
        : {}),
      ...(isPrimary && body.sponsorPhone !== undefined
        ? { sponsor_phone: body.sponsorPhone }
        : {}),
      ...(isPrimary && body.sponsorAddress !== undefined
        ? { sponsor_address: body.sponsorAddress }
        : {}),
      ...(isPrimary && body.multiApplyBeforeDate !== undefined
        ? { multi_apply_before_date: body.multiApplyBeforeDate }
        : {}),
      ...(isPrimary && body.comment !== undefined
        ? { comment: body.comment }
        : {}),
      modified_at: toLegacyDateTime(),
    });

    ok(res, { applicant: toApplicantRow(row) });
  }
);

/**
 * POST /api/admin/saudi-invitation-letters/:id/applicants
 *
 * Adds a co-applicant to an existing application. The legacy form caps an
 * application at five people (the primary plus four more); this refuses a
 * sixth rather than creating a row nothing in the legacy screen ever showed.
 */
saudiInvitationLetterAdminRoutes.post(
  '/:id/applicants',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);

    const primary = await SaudiInvitationLetters.findByPk(id);
    if (!primary || primary.parent_id !== 0) {
      throw notFound('We could not find that application.');
    }

    const existing = await SaudiInvitationLetters.count({
      where: { parent_id: id },
    });
    if (existing >= 4) {
      throw badRequest('An application can carry at most five applicants.');
    }

    const row = await SaudiInvitationLetters.create({
      order_id: primary.order_id,
      parent_id: id,
      destination: primary.destination,
      created_at: toLegacyDateTime(),
      modified_at: toLegacyDateTime(),
    });

    created(res, { applicant: toApplicantRow(row) });
  }
);

/**
 * DELETE /api/admin/saudi-invitation-letters/applicants/:rowId
 *
 * Refuses on the primary applicant — deleting them would orphan any
 * co-applicants left pointing at a `parent_id` that no longer exists, and the
 * legacy screen has no "delete this application" action to reproduce anyway.
 */
saudiInvitationLetterAdminRoutes.delete(
  '/applicants/:rowId',
  validate(z.object({ rowId: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { rowId } = validParams<{ rowId: number }>(req);

    const row = await SaudiInvitationLetters.findByPk(rowId);
    if (!row) throw notFound('We could not find that applicant.');

    if (row.parent_id === 0) {
      throw badRequest('The primary applicant on an application cannot be removed.');
    }

    await row.destroy();
    noContent(res);
  }
);
