import type { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
import {
  BaseError as SequelizeError,
  ConnectionError,
  DatabaseError,
  UniqueConstraintError,
  ValidationError,
} from 'sequelize';
import { ApiError, isApiError } from '../shared/errors';
import { logger } from '../shared/logger';
import { env } from '../config/env';

/**
 * The last thing that runs, and the only thing that writes an error response.
 *
 * Express 5 forwards a rejected promise from an async handler to here on its
 * own, so handlers do not need a `try/catch` or an `asyncHandler` wrapper —
 * they throw, and this decides what the client sees.
 *
 * The rule it enforces: **a database error never reaches a client**. A
 * Sequelize message carries table names, column names and sometimes the values
 * that were being written. Those go to the log; the response gets wording a
 * client can act on. That is not only about leaking schema detail — "Unknown
 * column 'fname' in 'field list'" is also useless to the person reading it.
 */

/** A short id so a client can quote something a log search will find. */
const errorReference = (): string =>
  Math.random().toString(36).slice(2, 10).toUpperCase();

interface Translated {
  status: number;
  code: string;
  message: string;
  fields?: Record<string, string>;
  /** Logged, never sent. */
  detail?: Record<string, unknown>;
}

/**
 * Turns a Sequelize failure into something sayable.
 *
 * The interesting case is `DatabaseError` against this particular schema. A
 * legacy column is `char(100)` and a form let someone type 300 characters, so
 * MySQL raises "Data too long for column" — which is a validation problem the
 * client can fix, not a server fault, and so it becomes a 400 rather than a 500.
 */
const translateSequelize = (error: SequelizeError): Translated => {
  if (error instanceof ConnectionError) {
    return {
      status: 503,
      code: 'database_unavailable',
      message: 'We could not reach our records just now. Please try again shortly.',
      detail: { name: error.name, message: error.message },
    };
  }

  if (error instanceof UniqueConstraintError) {
    return {
      status: 409,
      code: 'conflict',
      message: 'That record already exists.',
      detail: { fields: error.fields, message: error.message },
    };
  }

  if (error instanceof ValidationError) {
    const fields: Record<string, string> = {};
    for (const item of error.errors) {
      if (item.path) fields[item.path] = item.message;
    }

    return {
      status: 400,
      code: 'bad_request',
      message: 'Some of those details need checking.',
      fields,
      detail: { message: error.message },
    };
  }

  if (error instanceof DatabaseError) {
    const raw = error.message;

    // A legacy column narrower than the form that feeds it.
    if (/Data too long for column/i.test(raw)) {
      return {
        status: 400,
        code: 'value_too_long',
        message: 'One of those values is longer than we can store. Please shorten it.',
        detail: { message: raw },
      };
    }

    // Almost always a mapping mistake in this codebase rather than bad input.
    if (/Unknown column|doesn't exist/i.test(raw)) {
      return {
        status: 500,
        code: 'schema_mismatch',
        message: 'Something went wrong at our end. Please try again.',
        detail: { message: raw, hint: 'Model does not match the live schema.' },
      };
    }

    return {
      status: 500,
      code: 'database_error',
      message: 'Something went wrong at our end. Please try again.',
      detail: { message: raw },
    };
  }

  return {
    status: 500,
    code: 'database_error',
    message: 'Something went wrong at our end. Please try again.',
    detail: { name: error.name, message: error.message },
  };
};

const translate = (error: unknown): Translated => {
  if (isApiError(error)) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      fields: error.fields,
      detail: error.context,
    };
  }

  if (error instanceof MulterError) {
    // The size limit is the one a client can do something about.
    const tooBig = error.code === 'LIMIT_FILE_SIZE';

    return {
      status: 400,
      code: tooBig ? 'file_too_large' : 'upload_failed',
      message: tooBig
        ? `That file is larger than the ${env.uploads.maxMb} MB limit.`
        : 'That file could not be accepted.',
      detail: { code: error.code, field: error.field },
    };
  }

  if (error instanceof SequelizeError) return translateSequelize(error);

  if (error instanceof SyntaxError && 'body' in error) {
    // `express.json()` rejecting a malformed payload.
    return {
      status: 400,
      code: 'bad_request',
      message: 'That request body could not be read.',
    };
  }

  return {
    status: 500,
    code: 'server_error',
    message: 'Something went wrong at our end. Please try again.',
    detail: {
      name: error instanceof Error ? error.name : typeof error,
      message: error instanceof Error ? error.message : String(error),
    },
  };
};

export const errorHandler = (
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Something already started writing; anything more would corrupt the response.
  if (res.headersSent) {
    next(error);
    return;
  }

  const translated = translate(error);
  const reference = errorReference();

  const logContext = {
    reference,
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    status: translated.status,
    code: translated.code,
    userId: req.auth?.sub ?? null,
    ...translated.detail,
    ...(error instanceof Error && translated.status >= 500
      ? { stack: error.stack }
      : {}),
  };

  if (translated.status >= 500) {
    logger.error(translated.message, logContext);
  } else {
    logger.warn(translated.message, logContext);
  }

  res.status(translated.status).json({
    error: translated.message,
    // Both keys, same value: the website's `apiClient` reads `message` first
    // and falls back to `error`, and other callers do the reverse.
    message: translated.message,
    code: translated.code,
    ...(translated.fields ? { fields: translated.fields } : {}),
    // Only on a server fault, and only ever an opaque id — it is the string a
    // client quotes when they ring up, and it finds the log line above.
    ...(translated.status >= 500 ? { reference } : {}),
  });
};

/** Anything that reached the router without matching a route. */
export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    error: `No such endpoint: ${req.method} ${req.path}`,
    message: 'We could not find that.',
    code: 'not_found',
  });
};

export { ApiError };
