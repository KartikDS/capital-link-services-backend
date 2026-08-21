import { listRoutes } from '../../scripts/listRoutes';
import { openApiDocument } from '../../src/config/swagger';

/**
 * The OpenAPI document against the routers it claims to describe.
 *
 * This test exists because the document had drifted to nine of a hundred and
 * thirty-one routes without anything noticing. Six of its nine tags held no paths
 * at all — Swagger UI rendered the Portal section as a heading with nothing under
 * it, and nothing failed.
 *
 * A hand-written spec is worth having: it explains why `tbl_cls_order` is read
 * before `tbl_orders` and why an attestation has no total, which no generator
 * would. But hand-written only stays true if something checks it, and this is that
 * something. **Both directions are asserted**, because each catches a different
 * mistake:
 *
 * - A route with no entry is an endpoint nobody outside this repo can discover.
 * - An entry with no route is worse: it is documentation for something that will
 *   404, which sends an integrator looking for a bug in their own code.
 */

/** `/api/orders/:reference` → `/api/orders/{reference}`. */
const toOpenApiPath = (expressPath: string): string =>
  expressPath.replace(/:(\w+)/g, '{$1}');

const routes = listRoutes();

const registered = new Set(
  routes.map((route) => `${route.method} ${toOpenApiPath(route.path)}`)
);

const paths = openApiDocument.paths as Record<string, Record<string, unknown>>;

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

const documented = new Set(
  Object.entries(paths).flatMap(([path, operations]) =>
    METHODS.filter((method) => method in operations).map(
      (method) => `${method.toUpperCase()} ${path}`
    )
  )
);

describe('the OpenAPI document covers the API', () => {
  it('found the routers to compare against', () => {
    // If the route walker breaks — Express changes shape, the instrumentation
    // stops firing — every other assertion here would pass vacuously. So this
    // one fails loudly instead.
    expect(routes.length).toBeGreaterThan(100);
  });

  it('documents every registered route', () => {
    const missing = [...registered].filter((key) => !documented.has(key)).sort();

    expect(missing).toEqual([]);
  });

  it('documents nothing that is not registered', () => {
    const extra = [...documented].filter((key) => !registered.has(key)).sort();

    expect(extra).toEqual([]);
  });

  it('has an entry for every tag it declares', () => {
    // A tag with no paths renders as an empty section, which reads as a broken
    // page rather than as an API with nothing in that group.
    const used = new Set<string>(
      Object.values(paths).flatMap((operations) =>
        METHODS.filter((method) => method in operations).flatMap(
          (method) => (operations[method] as { tags?: string[] }).tags ?? []
        )
      )
    );

    const empty = openApiDocument.tags
      .map((tag) => tag.name)
      .filter((name) => !used.has(name));

    expect(empty).toEqual([]);
  });

  it('tags every operation with a tag it declares', () => {
    const declared = new Set<string>(openApiDocument.tags.map((tag) => tag.name));
    const undeclared: string[] = [];

    for (const [path, operations] of Object.entries(paths)) {
      for (const method of METHODS) {
        if (!(method in operations)) continue;

        const tags = (operations[method] as { tags?: string[] }).tags ?? [];

        for (const tag of tags) {
          if (!declared.has(tag)) {
            undeclared.push(`${method.toUpperCase()} ${path} → ${tag}`);
          }
        }
      }
    }

    expect(undeclared).toEqual([]);
  });
});

describe('every operation is described well enough to use', () => {
  const operations = Object.entries(paths).flatMap(([path, byMethod]) =>
    METHODS.filter((method) => method in byMethod).map((method) => ({
      key: `${method.toUpperCase()} ${path}`,
      path,
      operation: byMethod[method] as Record<string, unknown>,
    }))
  );

  it('has a summary on each one', () => {
    const unsummarised = operations
      .filter((entry) => !entry.operation.summary)
      .map((entry) => entry.key);

    expect(unsummarised).toEqual([]);
  });

  it('gives each one a unique operationId', () => {
    // These become method names in a generated client. A duplicate produces two
    // functions with one name rather than an error, which is the kind of thing
    // that goes unnoticed until the generated code will not compile.
    const ids = operations.map(
      (entry) => entry.operation.operationId as string | undefined
    );

    expect(ids.filter((id) => !id)).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('says explicitly whether each one needs a token', () => {
    // An absent `security` means "inherit the root", and there is no root
    // declaration here — so it reads as undecided rather than as public. Every
    // operation states it, public ones with an empty array.
    const unstated = operations
      .filter((entry) => entry.operation.security === undefined)
      .map((entry) => entry.key);

    expect(unstated).toEqual([]);
  });

  it('declares every path parameter the path uses', () => {
    // An undeclared `{id}` makes the document invalid, and Swagger UI shows it as
    // a missing input box rather than as an error — so it goes unnoticed.
    const undeclared: string[] = [];

    for (const { key, path, operation } of operations) {
      const used = [...path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);
      const declared = new Set(
        ((operation.parameters as { in: string; name: string }[]) ?? [])
          .filter((parameter) => parameter.in === 'path')
          .map((parameter) => parameter.name)
      );

      for (const name of used) {
        if (name && !declared.has(name)) undeclared.push(`${key} → {${name}}`);
      }
    }

    expect(undeclared).toEqual([]);
  });

  it('says what a success looks like', () => {
    const noSuccess = operations
      .filter((entry) => {
        const responses = (entry.operation.responses ?? {}) as Record<string, unknown>;

        return !Object.keys(responses).some((status) => status.startsWith('2'));
      })
      .map((entry) => entry.key);

    // The one exception is deliberate: withdrawing a passport photo has no success
    // case, because the schema cannot support the operation and the endpoint says
    // so with a 409.
    expect(noSuccess).toEqual(['DELETE /api/portal/passport-photos/{id}']);
  });

  it('marks the authenticated routes as authenticated', () => {
    // Every route under /api/portal and /api/admin requires a token. A missing
    // `security` block means Swagger UI sends the request without one, and the
    // reader concludes the endpoint is broken.
    const unsecured = operations
      .filter(
        (entry) =>
          (entry.path.startsWith('/api/portal') || entry.path.startsWith('/api/admin')) &&
          !entry.operation.security
      )
      .map((entry) => entry.key);

    expect(unsecured).toEqual([]);
  });

  it('references only schemas that exist', () => {
    const defined = new Set<string>(Object.keys(openApiDocument.components.schemas));
    const responses = new Set<string>(Object.keys(openApiDocument.components.responses));

    const dangling: string[] = [];
    const serialised = JSON.stringify(openApiDocument);

    for (const match of serialised.matchAll(
      /#\/components\/(schemas|responses)\/(\w+)/g
    )) {
      const [, kind, name] = match;
      const known = kind === 'schemas' ? defined : responses;

      if (name && !known.has(name)) dangling.push(`${kind}/${name}`);
    }

    expect([...new Set(dangling)].sort()).toEqual([]);
  });
});
