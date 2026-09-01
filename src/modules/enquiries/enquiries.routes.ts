import { Op } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { Inquiries, TranslationServices } from '../../models';
import { requireAdmin } from '../../middleware/authenticate';
import { authenticate } from '../../middleware/authenticate';
import { limits } from '../../middleware/rateLimit';
import { notFound } from '../../shared/errors';
import { created, message, ok, paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { toIso, toLegacyDateTime } from '../../shared/dates';
import { clean, cleanOr, truncate } from '../../shared/text';
import { emailField, idParam, phoneField, validate, validParams, validQuery } from '../../shared/validation';
import { logger } from '../../shared/logger';

/**
 * The public intake forms, and the admin side of the queue they land in.
 *
 * Five forms on the website — general contact, visa, translation, corporate and
 * a call-back request — and two tables to hold them.
 *
 * **"How did you hear about us?"** is asked by all three of the website's enquiry
 * forms and has no column on either table. The visa card sends it as
 * `heardAboutUs` and it is folded into `query` with everything else this schema
 * has no room for; the general form folds it into its own `message` before it
 * gets here, which is why only one route names it. `tbl_translation_services` has
 * no free-text column to fold anything into — its only one is `document_name`,
 * which the admin queue renders as the document — so the translation form's
 * answer travels in the email to the help inbox and stops there until that table
 * gains a column.
 *
 * `tbl_inquiries` takes four of the five. It has `name`, `email`, `phone`,
 * `subject` and `query`, which is enough for any of them: the form's own name
 * goes in `subject` so the queue can be filtered by which form it came from, and
 * anything the table has no column for is folded into `query` as labelled text
 * rather than dropped.
 *
 * `tbl_translation_services` takes the translation form, because it has the
 * columns that form actually needs — `language_from`, `language_to`,
 * `document_name` — and folding those into a free-text field would make the
 * queue unusable for the one service where the request is structured.
 *
 * **Every intake persists.** The website previously emailed the general form and
 * stored nothing, so an enquiry lost in an inbox was an enquiry lost.
 */

export const enquiryRoutes = Router();

/**
 * Turns the fields a table has no column for into labelled text.
 *
 * Appended to `query` rather than discarded. `tbl_inquiries` has five columns
 * and the visa form collects nine things — the destination, the travel date, the
 * nationality. Losing those would leave a consultant ringing the client to ask
 * what they already typed.
 */
const foldExtras = (
  body: string,
  extras: Record<string, string | number | null | undefined>
): string => {
  const lines = Object.entries(extras)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => {
      const label = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (character) => character.toUpperCase());
      return `${label}: ${String(value)}`;
    });

  if (lines.length === 0) return body;

  return `${body}\n\n---\n${lines.join('\n')}`;
};

const baseEnquirySchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(255),
  email: emailField.transform((value) => value.slice(0, 255)),
  phone: phoneField.max(255).optional().nullable(),
  message: z.string().trim().min(1, 'Tell us how we can help').max(5000),
});

/** `subject` doubles as the form's identity, so the queue can be filtered. */
const SUBJECTS = {
  general: 'General enquiry',
  visa: 'Visa enquiry',
  corporate: 'Corporate enquiry',
  callback: 'Call-back request',
} as const;

const persistEnquiry = async (input: {
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  query: string;
}) => {
  const now = toLegacyDateTime();

  const row = await Inquiries.create({
    name: input.name,
    email: input.email,
    // `phone` is NOT NULL on this table, so an omitted number is stored as an
    // empty string rather than failing the insert.
    phone: input.phone ?? '',
    subject: input.subject,
    query: input.query,
    status: 'new',
    created: now,
    updated: now,
  });

  logger.info('Enquiry received', { enquiryId: row.id, subject: input.subject });

  return row;
};

// ---------------------------------------------------------------------------
// Public intake
// ---------------------------------------------------------------------------

/** POST /api/enquiries — the general contact form. */
enquiryRoutes.post(
  '/',
  limits.enquiry,
  validate(
    baseEnquirySchema.extend({
      subject: z.string().trim().max(255).optional(),
    })
  ),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof baseEnquirySchema> & { subject?: string };

    const row = await persistEnquiry({
      name: body.name,
      email: body.email,
      phone: clean(body.phone),
      subject: clean(body.subject) ?? SUBJECTS.general,
      query: body.message,
    });

    created(res, {
      enquiry: { id: String(row.id), reference: `ENQ-${row.id}` },
      message: 'Thank you — we have your enquiry and will be in touch shortly.',
    });
  }
);

const visaEnquirySchema = baseEnquirySchema.extend({
  destination: z.string().trim().max(255).optional().nullable(),
  nationality: z.string().trim().max(255).optional().nullable(),
  visaType: z.string().trim().max(255).optional().nullable(),
  departureDate: z.string().trim().max(64).optional().nullable(),
  travellers: z.coerce.number().int().min(1).max(100).optional().nullable(),
  company: z.string().trim().max(255).optional().nullable(),
  /**
   * How the applicant found CLS, already resolved to a label by the website.
   *
   * Optional here although the card requires it, because this schema's job is to
   * decide whether an enquiry can be stored, not to re-run the form's rules — and
   * an enquiry refused over marketing attribution is an enquiry lost for the one
   * field on the card no consultant needs.
   */
  heardAboutUs: z.string().trim().max(255).optional().nullable(),
});

/** POST /api/enquiries/visa */
enquiryRoutes.post(
  '/visa',
  limits.enquiry,
  validate(visaEnquirySchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof visaEnquirySchema>;

    const row = await persistEnquiry({
      name: body.name,
      email: body.email,
      phone: clean(body.phone),
      subject: SUBJECTS.visa,
      query: foldExtras(body.message, {
        destination: body.destination,
        nationality: body.nationality,
        visaType: body.visaType,
        departureDate: body.departureDate,
        travellers: body.travellers,
        company: body.company,
        heardAboutUs: body.heardAboutUs,
      }),
    });

    created(res, {
      enquiry: { id: String(row.id), reference: `ENQ-${row.id}` },
      message: 'Thank you — a visa consultant will be in touch shortly.',
    });
  }
);

const translationEnquirySchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(225),
  email: emailField.transform((value) => value.slice(0, 225)),
  phone: phoneField.max(225).optional().nullable(),
  languageFrom: z.string().trim().min(1, 'Choose the source language').max(225),
  languageTo: z.string().trim().min(1, 'Choose the target language').max(255),
  documentName: z.string().trim().max(225).optional().nullable(),
  message: z.string().trim().max(5000).optional().nullable(),
});

/**
 * POST /api/enquiries/translation
 *
 * Its own table, because the request is structured. Note the shorter column
 * widths — `varchar(225)` here against `varchar(255)` on `tbl_inquiries` — which
 * is why this schema is separate rather than reusing the base one.
 *
 * `tbl_translation_services` has no message column. A free-text note is appended
 * to `document_name` only if it fits; otherwise it is reported as not stored,
 * because truncating a client's note halfway through a sentence is worse than
 * telling them to send it by email.
 */
enquiryRoutes.post(
  '/translation',
  limits.enquiry,
  validate(translationEnquirySchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof translationEnquirySchema>;
    const now = toLegacyDateTime();

    const documentName = clean(body.documentName);
    const note = clean(body.message);

    // 225 is the column. Only combine when the result actually fits.
    const combined =
      documentName && note && `${documentName} — ${note}`.length <= 225
        ? `${documentName} — ${note}`
        : documentName;

    const row = await TranslationServices.create({
      full_name: body.name,
      email: body.email,
      phone: clean(body.phone),
      language_from: body.languageFrom,
      language_to: body.languageTo,
      document_name: combined,
      created: now,
      updated: now,
    });

    logger.info('Translation enquiry received', { enquiryId: row.id });

    const noteStored = combined !== documentName;

    created(res, {
      enquiry: { id: String(row.id), reference: `TRN-${row.id}` },
      message: 'Thank you — a NAATI translator will be in touch with a quote.',
      ...(note && !noteStored
        ? {
            warning:
              'Your note was too long to store against this enquiry. Please email it to us so it reaches your translator.',
          }
        : {}),
    });
  }
);

/** POST /api/enquiries/corporate */
enquiryRoutes.post(
  '/corporate',
  limits.enquiry,
  validate(
    baseEnquirySchema.extend({
      company: z.string().trim().min(1, 'Enter your company name').max(255),
      role: z.string().trim().max(255).optional().nullable(),
      volume: z.string().trim().max(255).optional().nullable(),
    })
  ),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof baseEnquirySchema> & {
      company: string;
      role?: string | null;
      volume?: string | null;
    };

    const row = await persistEnquiry({
      name: body.name,
      email: body.email,
      phone: clean(body.phone),
      subject: SUBJECTS.corporate,
      query: foldExtras(body.message, {
        company: body.company,
        role: body.role,
        expectedVolume: body.volume,
      }),
    });

    created(res, {
      enquiry: { id: String(row.id), reference: `ENQ-${row.id}` },
      message: 'Thank you — our corporate team will be in touch.',
    });
  }
);

/**
 * POST /api/enquiries/call-back
 *
 * The shortest form on the website: a name, a number and a time. The message is
 * optional here, unlike every other form, because the whole point is that the
 * client would rather talk than type.
 */
enquiryRoutes.post(
  '/call-back',
  limits.enquiry,
  validate(
    z.object({
      name: z.string().trim().min(1, 'Enter your name').max(255),
      phone: phoneField.min(1, 'Enter a phone number we can call').max(255),
      email: emailField.optional().nullable(),
      preferredTime: z.string().trim().max(255).optional().nullable(),
      message: z.string().trim().max(2000).optional().nullable(),
    })
  ),
  async (req: Request, res: Response) => {
    const body = req.body as {
      name: string;
      phone: string;
      email?: string | null;
      preferredTime?: string | null;
      message?: string | null;
    };

    const row = await persistEnquiry({
      name: body.name,
      email: clean(body.email) ?? '',
      phone: body.phone,
      subject: SUBJECTS.callback,
      query: foldExtras(clean(body.message) ?? 'Call-back requested.', {
        preferredTime: body.preferredTime,
      }),
    });

    created(res, {
      enquiry: { id: String(row.id), reference: `ENQ-${row.id}` },
      message: 'Thank you — we will call you back shortly.',
    });
  }
);

// ---------------------------------------------------------------------------
// Admin queue
// ---------------------------------------------------------------------------

const toEnquiryView = (row: Inquiries) => ({
  id: String(row.id),
  reference: `ENQ-${row.id}`,
  name: cleanOr(row.name, ''),
  email: cleanOr(row.email, ''),
  phone: clean(row.phone),
  subject: cleanOr(row.subject, 'Enquiry'),
  message: cleanOr(row.query, ''),
  summary: truncate(clean(row.query), 160),
  status: cleanOr(row.status, 'new'),
  createdAt: toIso(row.created),
  updatedAt: toIso(row.updated),
});

const adminRoutes = Router();

adminRoutes.use(authenticate, requireAdmin);

const listQuerySchema = z.object({
  status: z.string().trim().max(100).optional(),
  subject: z.string().trim().max(255).optional(),
  search: z.string().trim().max(255).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
});

/** GET /api/enquiries/admin — the queue. */
adminRoutes.get(
  '/',
  validate(listQuerySchema, 'query'),
  async (req: Request, res: Response) => {
    const query = validQuery<z.infer<typeof listQuerySchema>>(req);
    const page = readPage(req);

    const { rows, count } = await Inquiries.findAndCountAll({
      where: {
        ...(query.status ? { status: query.status } : {}),
        ...(query.subject ? { subject: query.subject } : {}),
        ...(query.search
          ? {
              [Op.or]: [
                { name: { [Op.like]: `%${query.search}%` } },
                { email: { [Op.like]: `%${query.search}%` } },
                { query: { [Op.like]: `%${query.search}%` } },
              ],
            }
          : {}),
      },
      order: [['created', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(res, 'enquiries', rows.map(toEnquiryView), pageMeta(page, count));
  }
);

adminRoutes.get(
  '/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await Inquiries.findByPk(id);

    if (!row) throw notFound('We could not find that enquiry.');

    ok(res, { enquiry: toEnquiryView(row) });
  }
);

/**
 * PATCH /api/enquiries/admin/:id
 *
 * `status` is a `char(100)` with no enumeration, so any word fits. The values
 * below are the ones this API uses; a status the old application wrote is
 * preserved rather than normalised, because it means something to whoever set it.
 */
adminRoutes.patch(
  '/:id',
  validate(z.object({ id: idParam }), 'params'),
  validate(
    z.object({
      status: z.enum(['new', 'in-progress', 'quoted', 'converted', 'closed']),
    })
  ),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const { status } = req.body as { status: string };

    const row = await Inquiries.findByPk(id);
    if (!row) throw notFound('We could not find that enquiry.');

    await row.update({ status, updated: toLegacyDateTime() });

    logger.info('Enquiry status changed', { enquiryId: id, status });

    ok(res, { enquiry: toEnquiryView(row) });
  }
);

/**
 * POST /api/enquiries/admin/:id/notes
 *
 * Appended to `query`, because there is no notes column on this table. Prefixed
 * with a timestamp and the word "Note" so a consultant reading the record can
 * tell their colleague's addition from what the client originally wrote.
 */
adminRoutes.post(
  '/:id/notes',
  validate(z.object({ id: idParam }), 'params'),
  validate(z.object({ note: z.string().trim().min(1).max(2000) })),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const { note } = req.body as { note: string };

    const row = await Inquiries.findByPk(id);
    if (!row) throw notFound('We could not find that enquiry.');

    const stamped = `\n\n[Note ${toLegacyDateTime()}] ${note}`;

    await row.update({
      query: `${cleanOr(row.query, '')}${stamped}`,
      updated: toLegacyDateTime(),
    });

    ok(res, {
      enquiry: toEnquiryView(row),
      note:
        'Notes are appended to the enquiry text — this table has no separate notes column.',
    });
  }
);

adminRoutes.delete(
  '/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await Inquiries.findByPk(id);

    if (!row) throw notFound('We could not find that enquiry.');

    await row.destroy();
    logger.info('Enquiry deleted', { enquiryId: id });

    message(res, 'That enquiry has been deleted.');
  }
);

/** GET /api/enquiries/admin/translation — the translation queue. */
adminRoutes.get('/translation/list', async (req: Request, res: Response) => {
  const page = readPage(req);

  const { rows, count } = await TranslationServices.findAndCountAll({
    order: [['created', 'DESC']],
    limit: page.limit,
    offset: page.offset,
  });

  paged(
    res,
    'enquiries',
    rows.map((row) => ({
      id: String(row.id),
      reference: `TRN-${row.id}`,
      name: clean(row.full_name),
      email: clean(row.email),
      phone: clean(row.phone),
      languageFrom: clean(row.language_from),
      languageTo: clean(row.language_to),
      documentName: clean(row.document_name),
      createdAt: toIso(row.created),
    })),
    pageMeta(page, count)
  );
});

enquiryRoutes.use('/admin', adminRoutes);
