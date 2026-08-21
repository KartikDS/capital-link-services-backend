/**
 * The errors this API throws, and the one place their status codes are decided.
 *
 * Handlers throw these; `errorHandler` turns them into responses. That split is
 * what keeps a service function free of `res` — it can say "that order is not
 * yours" by throwing, without knowing whether it is being called by a route, a
 * script or a test.
 *
 * Every message here is written to be shown to a client. Anything a client must
 * not see — a SQL fragment, a column name, a file path — goes in `context`,
 * which is logged and never serialised into a response.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly context?: Record<string, unknown>;
  /** Field-level problems, for a form that needs to mark its own inputs. */
  readonly fields?: Record<string, string>;

  constructor(
    status: number,
    code: string,
    message: string,
    options: {
      context?: Record<string, unknown>;
      fields?: Record<string, string>;
      cause?: unknown;
    } = {}
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.context = options.context;
    this.fields = options.fields;
  }
}

export const badRequest = (
  message: string,
  fields?: Record<string, string>
): ApiError => new ApiError(400, 'bad_request', message, { fields });

export const unauthorized = (
  message = 'Please sign in to continue.'
): ApiError => new ApiError(401, 'unauthorized', message);

export const forbidden = (
  message = 'You do not have access to that.'
): ApiError => new ApiError(403, 'forbidden', message);

/**
 * Used for "does not exist" *and* "exists but is not yours".
 *
 * Deliberately the same answer for both. A 403 on someone else's order and a
 * 404 on one that never existed is enough to walk the API and discover which
 * references are real, so ownership failures are reported as absence.
 */
export const notFound = (message = 'We could not find that.'): ApiError =>
  new ApiError(404, 'not_found', message);

export const conflict = (message: string): ApiError =>
  new ApiError(409, 'conflict', message);

export const unprocessable = (
  message: string,
  fields?: Record<string, string>
): ApiError => new ApiError(422, 'unprocessable', message, { fields });

export const tooManyRequests = (
  message = 'Too many requests just now. Please try again shortly.'
): ApiError => new ApiError(429, 'too_many_requests', message);

export const serverError = (
  message = 'Something went wrong at our end. Please try again.',
  context?: Record<string, unknown>
): ApiError => new ApiError(500, 'server_error', message, { context });

export const serviceUnavailable = (
  message = 'That service is unavailable just now.',
  context?: Record<string, unknown>
): ApiError => new ApiError(503, 'service_unavailable', message, { context });

/**
 * Thrown when a write is attempted while `DB_READ_ONLY` is on.
 *
 * Its own type rather than a generic 403, because it is a deployment state
 * rather than a permission problem, and the message has to say so — otherwise
 * the read-only milestone looks like a bug in the client.
 */
export class ReadOnlyError extends ApiError {
  constructor(operation: string) {
    super(
      503,
      'read_only',
      'This deployment is in read-only mode, so that change was not saved.',
      { context: { operation } }
    );
    this.name = 'ReadOnlyError';
  }
}

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof ApiError;
