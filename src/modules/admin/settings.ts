import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  CreditCardProcessing,
  DocLegalizationAttachments,
  SettingsPassport,
  VisaPopupContent,
} from '../../models';
import { adminDocLegalisationAttachmentUpload } from '../../middleware/upload';
import { badRequest } from '../../shared/errors';
import { noContent, ok } from '../../shared/http/responses';
import { discardDocument, storedPathOf } from '../../shared/storage/documents';
import { centsToNumber, toCents } from '../../shared/money';
import { clean } from '../../shared/text';

/**
 * Four legacy screens that are a single row, not a table — each controller had
 * only an `indexAction` that both shows and saves. `findOrCreate` is used
 * throughout so a fresh database with no seeded row still has something to
 * edit, rather than every one of these 404ing the first time it is opened.
 *
 * ## Credit Card Processing Fee is retained but not removed
 *
 * [[card-fee-removed]] — the credit card processing fee was removed from every
 * price on the website as of 2026-09-03; only the historical invoice row still
 * shows it. This screen is kept because the legacy admin has it and the column
 * still exists, but the response says plainly that nothing on the site reads
 * it any more, so a consultant does not spend time tuning a number that has no
 * effect.
 */

export const settingsAdminRoutes = Router();

/** GET/PATCH /api/admin/settings/passport-delivery — `SettingsPassport`. */
const passportBody = z.object({
  costCents: z.number().int().min(0).optional(),
  additionalCostCents: z.number().int().min(0).optional(),
});

settingsAdminRoutes.get('/passport-delivery', async (_req: Request, res: Response) => {
  const [row] = await SettingsPassport.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, cost: 0, additional_cost: 0 },
  });

  ok(res, {
    settings: {
      costCents: toCents(row.cost),
      additionalCostCents: toCents(row.additional_cost),
    },
  });
});

settingsAdminRoutes.patch('/passport-delivery', async (req: Request, res: Response) => {
  const body = passportBody.parse(req.body);
  const [row] = await SettingsPassport.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, cost: 0, additional_cost: 0 },
  });

  await row.update({
    ...(body.costCents !== undefined ? { cost: centsToNumber(body.costCents) } : {}),
    ...(body.additionalCostCents !== undefined
      ? { additional_cost: centsToNumber(body.additionalCostCents) }
      : {}),
  });

  ok(res, {
    settings: {
      costCents: toCents(row.cost),
      additionalCostCents: toCents(row.additional_cost),
    },
  });
});

/** GET/PATCH /api/admin/settings/saudi-visa-popup — `VisaPopupContent`. */
const popupBody = z.object({ content: z.string().max(50_000) });

settingsAdminRoutes.get('/saudi-visa-popup', async (_req: Request, res: Response) => {
  const [row] = await VisaPopupContent.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, content: '' },
  });
  ok(res, { content: clean(row.content) ?? '' });
});

settingsAdminRoutes.patch('/saudi-visa-popup', async (req: Request, res: Response) => {
  const body = popupBody.parse(req.body);
  const [row] = await VisaPopupContent.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, content: '' },
  });
  await row.update({ content: body.content });
  ok(res, { content: clean(row.content) ?? '' });
});

/**
 * GET/PATCH /api/admin/settings/credit-card-fee — `CreditCardProcessing`.
 *
 * See the module note: nothing on the site reads this column any more.
 */
const feeBody = z.object({ feeCents: z.number().int().min(0) });

settingsAdminRoutes.get('/credit-card-fee', async (_req: Request, res: Response) => {
  const [row] = await CreditCardProcessing.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, fee: 0 },
  });
  ok(res, {
    feeCents: toCents(row.fee),
    // So the screen can say plainly that this no longer does anything.
    deprecated: true,
    deprecationNote:
      'The credit card processing fee was removed from every price on the website as of 2026-09-03. This value is stored but nothing on the site reads it.',
  });
});

settingsAdminRoutes.patch('/credit-card-fee', async (req: Request, res: Response) => {
  const body = feeBody.parse(req.body);
  const [row] = await CreditCardProcessing.findOrCreate({
    where: { id: 1 },
    defaults: { id: 1, fee: 0 },
  });
  await row.update({ fee: centsToNumber(body.feeCents) });
  ok(res, { feeCents: toCents(row.fee) });
});

/**
 * GET/POST/DELETE /api/admin/settings/doc-legalisation-attachment —
 * `DocLegalizationAttachments`.
 *
 * Reproduces `ManageDocumentLegalizationAttachmentController::indexAction`
 * (upload) and its removal action. The current filename is returned on every
 * call so a consultant can see what is live.
 */
settingsAdminRoutes.get(
  '/doc-legalisation-attachment',
  async (_req: Request, res: Response) => {
    const [row] = await DocLegalizationAttachments.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1, attachment_file: null },
    });
    ok(res, { attachmentFile: clean(row.attachment_file) });
  }
);

settingsAdminRoutes.post(
  '/doc-legalisation-attachment',
  adminDocLegalisationAttachmentUpload,
  async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('Attach a file.');

    const [row] = await DocLegalizationAttachments.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1, attachment_file: null },
    });

    const previous = clean(row.attachment_file);
    await row.update({ attachment_file: storedPathOf(req.file) });
    if (previous) void discardDocument(previous);

    ok(res, { attachmentFile: clean(row.attachment_file) });
  }
);

settingsAdminRoutes.delete(
  '/doc-legalisation-attachment',
  async (_req: Request, res: Response) => {
    const [row] = await DocLegalizationAttachments.findOrCreate({
      where: { id: 1 },
      defaults: { id: 1, attachment_file: null },
    });

    const previous = clean(row.attachment_file);
    await row.update({ attachment_file: null });
    if (previous) void discardDocument(previous);

    noContent(res);
  }
);
