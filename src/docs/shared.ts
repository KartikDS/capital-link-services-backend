/**
 * The pieces every path file uses.
 *
 * ## Why the spec is split up at all
 *
 * It used to be one object in `config/swagger.ts`, and it documented nine of the
 * API's one hundred and thirty-one routes. Six of the nine tags had no paths under
 * them at all — the Portal section rendered in Swagger UI as a heading with nothing
 * beneath it. A single file that has to be edited by hand for every new route is a
 * file that stops being edited.
 *
 * So the paths live beside the module they describe, one file per tag, and
 * `tests/unit/openapi.test.ts` asserts the two sides agree: every registered route
 * has an entry, and every entry names a route that exists. **Adding a route without
 * documenting it fails the test.** That is the part that keeps this true; the split
 * is only what makes it pleasant.
 *
 * ## Path parameters
 *
 * Declared once here, by name, rather than repeated on each of the forty-odd paths
 * that take one. There are six distinct parameter names in the whole API, and
 * `operation()` attaches the right declarations by reading the path — so a path
 * cannot be written with an undeclared `{id}` in it, which is the most common way
 * an OpenAPI document ends up invalid.
 */

export const bearer = [{ bearerAuth: [] }];
export const internal = [{ internalSecret: [] }];

/** The response bodies most endpoints can return, described once. */
export const errorResponses = {
  400: { $ref: '#/components/responses/BadRequest' },
  401: { $ref: '#/components/responses/Unauthorized' },
  404: { $ref: '#/components/responses/NotFound' },
} as const;

/** What a signed-in read can answer. */
export const authedResponses = {
  401: { $ref: '#/components/responses/Unauthorized' },
} as const;

/** What a staff-only endpoint can answer. */
export const adminResponses = {
  401: { $ref: '#/components/responses/Unauthorized' },
  403: { $ref: '#/components/responses/Forbidden' },
} as const;

/** What any write can answer, including the read-only refusal. */
export const writeResponses = {
  ...errorResponses,
  503: { $ref: '#/components/responses/ReadOnly' },
} as const;

/**
 * Every path parameter this API uses, described once.
 *
 * Six names across a hundred and thirty-one routes. `operation()` picks the ones a
 * path needs, so these descriptions are written once and appear on all forty-odd
 * paths that take them.
 */
const PATH_PARAMS: Record<string, Record<string, unknown>> = {
  id: {
    name: 'id',
    in: 'path',
    required: true,
    schema: { type: 'integer' },
    description: 'The row id, as returned by the list endpoint above it.',
  },
  reference: {
    name: 'reference',
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description:
      'The order reference the client holds — `CLS-100482`, or a bare integer for an order placed through the old application.',
  },
  service: {
    name: 'service',
    in: 'path',
    required: true,
    schema: {
      type: 'string',
      enum: [
        'visa',
        'police-clearance',
        'russian-visa-voucher',
        'attestation',
        'document-legalisation',
      ],
    },
    description: 'Which order journey the draft belongs to.',
  },
  slug: {
    name: 'slug',
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description:
      'The page slug. `tbl_content_pages` has no slug column, so this is matched against the slugified title and the tag list.',
  },
  key: {
    name: 'key',
    in: 'path',
    required: true,
    schema: { type: 'string' },
    description:
      '`tbl_sections.section_key` — the one uniquely-indexed text column in the CMS tables.',
  },
  kind: {
    name: 'kind',
    in: 'path',
    required: true,
    schema: { type: 'string', enum: ['residential', 'postal', 'billing'] },
    description: 'Which of the three addresses on the client row to change.',
  },
};

export interface QueryParam {
  name: string;
  description: string;
  /** Defaults to `string`. */
  type?: 'string' | 'integer' | 'boolean';
  enum?: readonly string[];
  required?: boolean;
  example?: string | number;
}

const toQueryParam = (param: QueryParam): Record<string, unknown> => ({
  name: param.name,
  in: 'query',
  required: param.required ?? false,
  description: param.description,
  schema: {
    type: param.type ?? 'string',
    ...(param.enum ? { enum: [...param.enum] } : {}),
  },
  ...(param.example === undefined ? {} : { example: param.example }),
});

/** `?page` and `?perPage`, on every list endpoint that pages. */
export const PAGING: readonly QueryParam[] = [
  { name: 'page', description: 'One-based page number.', type: 'integer', example: 1 },
  {
    name: 'perPage',
    description: 'Rows per page. Capped server-side.',
    type: 'integer',
    example: 20,
  },
];

export interface OperationInput {
  tag: string;
  summary: string;
  /** Markdown. This is where the *why* goes — Swagger UI renders it. */
  description?: string;
  /** How the caller proves who they are. Omit for a public endpoint. */
  auth?: 'bearer' | 'internal';
  query?: readonly QueryParam[];
  /**
   * A request body schema. `required` defaults to true.
   *
   * `contentType` defaults to `application/json`, which is every endpoint here
   * bar the uploads: a multipart operation has to declare
   * `multipart/form-data` or Swagger UI renders a JSON textarea for a request
   * that needs a file picker, and the generated clients send the wrong header.
   */
  body?: {
    schema: Record<string, unknown>;
    required?: boolean;
    contentType?: string;
  };
  /** Merged over the defaults, so a specific 409 or 503 can be named. */
  responses?: Record<string | number, unknown>;
  /** Overrides the response set chosen from `auth`. */
  errors?: Record<string | number, unknown>;
}

/**
 * A stable id for one operation, for the client generators.
 *
 * Derived from the method and the path rather than written by hand, so it cannot
 * drift from the route and cannot collide — a path and method pair is unique by
 * definition. `GET /api/orders/{reference}/documents` becomes
 * `getOrdersByReferenceDocuments`, which is not elegant but is predictable, which
 * matters more in generated code nobody reads.
 *
 * Stamped on by `stampOperationIds` in `./index`, not by `operation()`: the method
 * is the key an operation sits under, which the operation itself cannot see.
 */
export const operationId = (method: string, path: string): string => {
  const parts = path
    .replace(/^\/api\//, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      const param = segment.match(/^\{(\w+)\}$/);

      return param?.[1] ? `by-${param[1]}` : segment;
    })
    .flatMap((segment) => segment.split('-'))
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1));

  return `${method}${parts.join('')}`;
};

/**
 * One operation, with its path parameters filled in from the path.
 *
 * The path is passed so `{id}` and `{reference}` do not have to be declared by
 * hand on every entry — see the note on `PATH_PARAMS`. An unknown parameter name
 * throws rather than being silently omitted, because an undeclared path parameter
 * is an invalid document and Swagger UI shows it as a missing input box rather
 * than as an error.
 */
export const operation = (
  path: string,
  input: OperationInput
): Record<string, unknown> => {
  const names = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);

  const pathParams = names.map((name) => {
    const declared = name && PATH_PARAMS[name];

    if (!declared) {
      throw new Error(
        `No description for the path parameter {${name}} used by ${path}. Add it to PATH_PARAMS in src/docs/shared.ts.`
      );
    }

    return declared;
  });

  const parameters = [...pathParams, ...(input.query ?? []).map(toQueryParam)];

  const defaultErrors =
    input.errors ??
    (input.auth === 'bearer'
      ? { ...errorResponses }
      : input.auth === 'internal'
        ? { 403: { $ref: '#/components/responses/Forbidden' } }
        : { 400: { $ref: '#/components/responses/BadRequest' } });

  /**
   * Public endpoints say `security: []` rather than leaving it out.
   *
   * An absent `security` means "inherit whatever the document declares at the
   * root", and there is nothing at the root here — so the two are equivalent in
   * effect. They are not equivalent to read: an empty array states that the
   * endpoint needs no token, where an omission leaves a reader wondering whether
   * it was decided or forgotten. Every operation in this document is explicit
   * about it.
   */
  const security =
    input.auth === 'bearer' ? bearer : input.auth === 'internal' ? internal : [];

  return {
    tags: [input.tag],
    summary: input.summary,
    ...(input.description ? { description: input.description } : {}),
    security,
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(input.body
      ? {
          requestBody: {
            required: input.body.required ?? true,
            content: {
              [input.body.contentType ?? 'application/json']: {
                schema: input.body.schema,
              },
            },
          },
        }
      : {}),
    responses: {
      ...defaultErrors,
      ...(input.responses ?? { 200: { description: 'OK' } }),
    },
  };
};

/** A 200 whose body is a named component. */
export const okRef = (description: string, ref: string): Record<string, unknown> => ({
  description,
  content: {
    'application/json': { schema: { $ref: `#/components/schemas/${ref}` } },
  },
});

/** A 200 whose body is an inline object. */
export const okObject = (
  description: string,
  properties: Record<string, unknown>
): Record<string, unknown> => ({
  description,
  content: {
    'application/json': { schema: { type: 'object', properties } },
  },
});

/** A 200 carrying a named list under `key`, plus pagination. */
export const okList = (
  description: string,
  key: string,
  ref: string,
  paged = false
): Record<string, unknown> =>
  okObject(description, {
    [key]: { type: 'array', items: { $ref: `#/components/schemas/${ref}` } },
    ...(paged ? { pagination: { $ref: '#/components/schemas/Pagination' } } : {}),
  });

/** A 200 carrying a list of loosely-shaped rows — the reference-data endpoints. */
export const okRows = (
  description: string,
  key: string,
  paged = false
): Record<string, unknown> =>
  okObject(description, {
    [key]: { type: 'array', items: { type: 'object' } },
    ...(paged ? { pagination: { $ref: '#/components/schemas/Pagination' } } : {}),
  });

/** An object schema for a request body. */
export const body = (
  properties: Record<string, unknown>,
  required: readonly string[] = []
): Record<string, unknown> => ({
  type: 'object',
  ...(required.length > 0 ? { required: [...required] } : {}),
  properties,
});

/** The field types that recur across the order and enquiry bodies. */
export const f = {
  string: (description?: string) => ({
    type: 'string',
    ...(description ? { description } : {}),
  }),
  email: () => ({ type: 'string', format: 'email' }),
  date: (description?: string) => ({
    type: 'string',
    format: 'date',
    ...(description ? { description } : {}),
  }),
  int: (description?: string) => ({
    type: 'integer',
    ...(description ? { description } : {}),
  }),
  id: (description: string) => ({
    type: 'integer',
    nullable: true,
    description,
  }),
  bool: (description?: string) => ({
    type: 'boolean',
    ...(description ? { description } : {}),
  }),
  cents: (description = 'Integer cents. 12345 is A$123.45.') => ({
    type: 'integer',
    description,
  }),
} as const;
