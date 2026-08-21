import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';
import { badRequest } from './errors';

/**
 * Request validation, as middleware.
 *
 * Zod rather than a validator chain, because the schema and the TypeScript type
 * come from the same declaration. With `express-validator` the two are written
 * separately and drift: the validator says a field is optional, the handler's
 * type says it is required, and nothing catches the disagreement until a request
 * arrives without it.
 *
 * A failure comes back as a 400 with `fields`, keyed by input name. The
 * website's forms mark their own inputs from that, so `{ email: 'Enter a valid
 * email address' }` puts the message under the right box rather than in a banner
 * at the top of the page.
 */

/** Zod issues to the flat `{ field: message }` map the forms consume. */
const toFieldErrors = (error: z.ZodError): Record<string, string> => {
  const fields: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    // First message per field wins: a form shows one message per input, and the
    // first is the most specific.
    if (!(key in fields)) fields[key] = issue.message;
  }

  return fields;
};

type Source = 'body' | 'query' | 'params';

/**
 * Validates one part of the request and replaces it with the parsed result.
 *
 * Replacing matters: after this runs, `req.body` is the coerced, stripped object
 * Zod produced, so a handler cannot accidentally read a field the schema did not
 * allow. That is what stops an unexpected `role: 'admin'` in a registration
 * payload reaching the model layer.
 */
export const validate =
  <T>(schema: ZodType<T>, source: Source = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      next(
        badRequest(
          'Some of those details need checking.',
          toFieldErrors(result.error)
        )
      );
      return;
    }

    // `query` and `params` are getter-only on the Express 5 request, so the
    // parsed value is stashed alongside rather than assigned over the top.
    if (source === 'body') {
      req.body = result.data;
    } else {
      Object.defineProperty(req, source === 'query' ? 'validQuery' : 'validParams', {
        value: result.data,
        configurable: true,
        enumerable: false,
      });
    }

    next();
  };

/** Reads what `validate(schema, 'query')` parsed. */
export const validQuery = <T>(req: Request): T =>
  (req as unknown as { validQuery: T }).validQuery;

/** Reads what `validate(schema, 'params')` parsed. */
export const validParams = <T>(req: Request): T =>
  (req as unknown as { validParams: T }).validParams;

// ---------------------------------------------------------------------------
// Field types the CLS forms use, defined once
// ---------------------------------------------------------------------------

/**
 * Email, lowercased and trimmed.
 *
 * `char(100)` in every table that holds one, so the length cap is the column's
 * rather than an opinion — a longer address would be silently truncated by
 * MySQL and then never match on sign-in.
 */
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, 'Enter an email address')
  .max(100, 'That email address is too long')
  .email('Enter a valid email address');

/**
 * Password, on the way in.
 *
 * Eight characters minimum and no composition rules. A length floor stops the
 * genuinely trivial; requiring a symbol and a digit produces `Password1!` and a
 * sticky note, which is worse than a long passphrase this would have rejected.
 */
export const passwordField = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(200, 'That password is too long');

/** Phone. Kept as typed — these columns hold `+61 2 6282 7155` and worse. */
export const phoneField = z
  .string()
  .trim()
  .max(50, 'That phone number is too long');

/** A legacy integer primary key, arriving as a string in a URL. */
export const idParam = z.coerce
  .number()
  .int('That reference is not valid')
  .positive('That reference is not valid');

/**
 * An order reference as a client quotes it.
 *
 * `tbl_cls_order.order_no` is TEXT and `tbl_orders.order_no` is an integer, so a
 * reference can be either. Accepted as a bounded string and resolved by the
 * order service, which knows which family it belongs to.
 */
export const referenceField = z
  .string()
  .trim()
  .min(1, 'Enter your order reference')
  .max(64, 'That reference is not valid')
  .regex(/^[A-Za-z0-9/_-]+$/, 'That reference is not valid');

/** `YYYY-MM-DD`, as every date input on the website submits. */
export const dateField = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker to choose a date');

export const optionalString = (max: number) =>
  z.string().trim().max(max).optional().nullable();

/**
 * The address shape the website's `AddressFields` component posts.
 *
 * One definition, because the same component collects the account address, the
 * document return address and the billing address, and three near-identical
 * schemas would drift until one of them lost the second address line — which is
 * exactly what happened in the previous build.
 */
export const addressSchema = z.object({
  line1: z.string().trim().max(1000).optional().nullable(),
  line2: z.string().trim().max(1000).optional().nullable(),
  city: z.string().trim().max(225).optional().nullable(),
  state: z.string().trim().max(225).optional().nullable(),
  postcode: z.string().trim().max(50).optional().nullable(),
  countryId: z.coerce.number().int().positive().optional().nullable(),
});

export type AddressInput = z.infer<typeof addressSchema>;

export { z };
