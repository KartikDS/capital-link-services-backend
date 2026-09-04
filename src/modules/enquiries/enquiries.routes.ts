import { Op } from 'sequelize';
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { z } from 'zod';
import { Inquiries, TranslationServices } from '../../models';
import { requireAdmin } from '../../middleware/authenticate';
import { translationEnquiryFiles } from '../../middleware/upload';
import { markInternal } from '../../middleware/requestContext';
import { authenticate } from '../../middleware/authenticate';
import { limits } from '../../middleware/rateLimit';
import {
  chooseTranslationColumn,
  packTranslationDocumentNames,
  translationDocumentPath,
} from '../../domain/translationDocuments';
import {
  discardDocument,
  storedPathOf,
} from '../../shared/storage/documents';
import { forbidden, notFound } from '../../shared/errors';
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
 * Refuses a multipart translation enquiry from a caller with no secret.
 *
 * Ordered **before** `translationEnquiryFiles` deliberately. Checking after it
 * would mean every refused request had already written its files to the bucket
 * and the disk, leaving the guard to delete what it should never have accepted
 * — and leaving an attacker a way to spend the storage anyway.
 *
 * The content type is what it reads, because that is all there is to read at
 * this point: the body has not been parsed, so there is no `req.files` yet. A
 * multipart body with no files in it is refused too, which costs nothing — the
 * form only sends one when it has documents to send.
 *
 * The public, file-less shape is untouched. Anyone may still lodge a translation
 * enquiry as JSON, which is what this form has always been.
 */
const documentsNeedInternal = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const contentType = req.headers['content-type'] ?? '';

  if (contentType.includes('multipart/form-data') && !req.internal) {
    logger.warn(
      'A translation enquiry tried to attach documents without the internal secret'
    );
    next(
      forbidden(
        'Documents cannot be attached to an enquiry sent directly to this API. Use the website form.'
      )
    );
    return;
  }

  next();
};

/**
 * The bare filename a stored translation document is recorded under.
 *
 * `storedPathOf` answers with the path relative to the upload root —
 * `service_translation/mfk2p3x1-a3f2c1-passport.pdf` — and the column holds only
 * the last segment, because CLS's admin download supplies the directory itself.
 * See `domain/translationDocuments` for why the two halves are split that way.
 */
const storedFilenameOf = (file: Express.Multer.File): string => {
  const stored = storedPathOf(file);

  return stored.slice(stored.lastIndexOf('/') + 1);
};

/**
 * Throws away translation documents nothing will ever reference.
 *
 * Two callers, one meaning: bytes are on disk and in the bucket, and the column
 * entry that would have named them was never written. Sequential rather than
 * `Promise.all` because this runs on a failure path where the count is at most
 * five and the log order is worth more than the millisecond.
 */
const discardTranslationDocuments = async (
  names: readonly string[]
): Promise<void> => {
  for (const name of names) {
    await discardDocument(translationDocumentPath(name));
  }
};

/**
 * POST /api/enquiries/translation
 *
 * Its own table, because the request is structured. Note the shorter column
 * widths — `varchar(225)` here against `varchar(255)` on `tbl_inquiries` — which
 * is why this schema is separate rather than reusing the base one.
 *
 * ## Two content types, one route
 *
 * `application/json` when the client attached nothing, `multipart/form-data` when
 * they did. Multer only touches a multipart body and calls `next()` on anything
 * else, so `express.json()` still parses the first and the fields land on
 * `req.body` either way.
 *
 * `translationEnquiryFiles` runs **before** `validate`, because the scalar fields
 * of a multipart request are parsed by multer and there is nothing on `req.body`
 * until it has. This is the same ordering, for the same reason, as
 * `POST /api/orders/documents`.
 *
 * ## The documents, and the one column they have
 *
 * The bytes go to `service_translation/` in the S3 bucket and under
 * `UPLOAD_DIR` — `saveDocument` writes both — and the stored filenames go into
 * `document_name` as a comma-separated list. That column is the only place this
 * table has for a document, so `domain/translationDocuments` owns the format and
 * the cap derived from its width. Before this, the website collected these files
 * in the browser and dropped them: a client who attached a birth certificate got
 * a consultant emailing the next day to ask for it.
 *
 * ## Why a note and a document compete for the same column
 *
 * Because they are the same `varchar(225)`. With no files attached the old
 * behaviour stands — a short note is appended to the document name if it fits.
 * With files attached the filenames win, because a name that does not resolve is
 * a document nobody can open, while a note has an inbox to arrive in. Either way
 * a note that could not be stored comes back as a `warning` rather than being
 * silently truncated mid-sentence.
 */
enquiryRoutes.post(
  '/translation',
  limits.enquiry,
  markInternal,
  documentsNeedInternal,
  translationEnquiryFiles,
  validate(translationEnquirySchema),
  async (req: Request, res: Response) => {
    const body = req.body as z.infer<typeof translationEnquirySchema>;
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const now = toLegacyDateTime();

    const documentName = clean(body.documentName);
    const note = clean(body.message);

    /**
     * Kept beside the files rather than recomputed, because `documents` in the
     * response has to pair each file with its own stored name and packing is
     * greedy: a short name after a long one is kept while the long one is
     * dropped, so the two lists are not index-aligned.
     */
    const filenames = files.map(storedFilenameOf);
    const packed = packTranslationDocumentNames(filenames);
    const kept = new Set(packed.stored);

    /**
     * What the one column ends up holding, and whether the note is in it.
     *
     * The filenames when there are files, and otherwise the old text shape — so
     * an enquiry with nothing attached still records what the client said they
     * were sending. `domain/translationDocuments` owns the priority and the
     * arithmetic; this route only reports the outcome.
     */
    const column = chooseTranslationColumn({
      documents: packed.value,
      documentName,
      note,
    });

    let row: TranslationServices;

    try {
      row = await TranslationServices.create({
        full_name: body.name,
        email: body.email,
        phone: clean(body.phone),
        language_from: body.languageFrom,
        language_to: body.languageTo,
        document_name: column.value,
        created: now,
        updated: now,
      });
    } catch (error) {
      /**
       * The bytes are already written, and the row that would have referenced
       * them does not exist — so nothing will ever find them again. Removed
       * before the error goes up, because the alternative is a bucket that
       * accumulates one unreferenced passport scan per failed insert.
       */
      await discardTranslationDocuments([...packed.stored, ...packed.dropped]);
      throw error;
    }

    /**
     * Stored, but with nowhere in the column to be named — so equally
     * unreachable. Only possible when this endpoint is called directly with more
     * files than the form's own picker allows.
     */
    await discardTranslationDocuments(packed.dropped);

    logger.info('Translation enquiry received', {
      enquiryId: row.id,
      documents: packed.stored.length,
      dropped: packed.dropped.length,
    });

    const noteLost = Boolean(note) && !column.noteStored;

    created(res, {
      enquiry: { id: String(row.id), reference: `TRN-${row.id}` },
      documents: files.flatMap((file, index) => {
        const filename = filenames[index];

        // Dropped for want of room in the column, so not reported as stored.
        if (!filename || !kept.has(filename)) return [];

        return [
          {
            // What the client called it, echoed back but not stored — the
            // column has no room for an original name beside the stored one.
            name: file.originalname,
            storedAs: filename,
            storedIn: file.storedIn ?? [],
          },
        ];
      }),
      message: 'Thank you — a NAATI translator will be in touch with a quote.',
      ...(packed.dropped.length > 0
        ? {
            warning: `We could only attach ${packed.stored.length} of your ${
              packed.stored.length + packed.dropped.length
            } documents to this enquiry. Please email the rest to us so they reach your translator.`,
          }
        : noteLost
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
