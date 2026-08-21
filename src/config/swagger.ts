import type { Express, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { components, paths, tags } from '../docs';
import { env } from './env';

/**
 * The OpenAPI document, and the page that renders it.
 *
 * This file is the assembly: the prose that introduces the API, the tag list, the
 * server, and the page mount. **The paths live in `src/docs`, one file per tag**,
 * beside the module each describes.
 *
 * Written by hand rather than generated from decorators, and that is a deliberate
 * choice rather than an omission. The endpoints are shaped by what the website
 * already calls and by what a fixed legacy schema can answer, and both of those
 * need explaining in prose — a generated spec would list the fields and say nothing
 * about why `tbl_cls_order` is read before `tbl_orders`, or why an attestation has
 * no price until a consultant quotes it.
 *
 * The cost of writing it by hand is drift, and this document had drifted badly:
 * nine of a hundred and thirty-one routes, with six of the nine tags holding no
 * paths at all — the Portal section rendered as a heading with nothing under it. So
 * `tests/unit/openapi.test.ts` now compares the document against the Express
 * routers and fails when the two disagree: **a route added without a doc entry
 * breaks the build.** That test is what makes hand-writing safe.
 */

/**
 * The prose at the top of the docs page.
 *
 * Four facts about the database and one about errors, because between them they
 * explain most of the design a reader is about to scroll through. Anyone who reads
 * only this should still understand why an amount can be null and why a record that
 * is not theirs answers 404.
 */
const DESCRIPTION = `
REST API for the Capital Link Services client portal, order journeys and back
office.

## The database

This API reads and writes **the existing \`clspubli\` MySQL database**. That
schema is fixed: ninety-four tables, all prefixed \`tbl_\`, five years old and
shared with the application CLS staff use every day.

Three things follow, and they explain most of the design below:

- **No DDL, ever.** This service issues no \`CREATE\`, \`ALTER\` or \`DROP\`.
  \`sequelize.sync()\` is disabled and a query guard rejects DDL before it
  reaches MySQL. Where a feature needs storage the schema does not have, the
  feature is absent rather than the schema changed.
- **Two order families.** The database holds both \`tbl_orders\` (integer
  \`order_no\`, one very wide row) and \`tbl_cls_order\` (integer \`id\` with a
  TEXT \`order_no\` reference and per-service detail tables). Both are live, so
  an order lookup tries the newer family first and falls back to the older one.
- **No foreign keys.** Not one, anywhere in the schema. Orphaned rows exist, so
  reads tolerate a missing parent and report a gap rather than dropping the row.

## Money

Every amount in a request or response is **integer cents**. The database stores
amounts as \`double\` in some columns and \`varchar(255)\` in others — including
values like \`$1,250.00\` and \`TBA\` — and all of that is normalised here.

An amount of \`null\` is meaningful: it means no figure has been set. An
attestation priced by a consultant has no total until they quote it, and the
response says \`quoteRequired: true\` rather than inventing a zero.

**No amount is ever read from a request body**, with one documented exception:
\`POST /api/payments/record\`, which takes what Stripe actually captured and is
reachable only with a shared secret. Everywhere else a request names catalogue
ids and the figures are looked up server-side.

## Dates

Responses use ISO-8601 instants. The database stores local Sydney wall-clock
times with no zone recorded, so they are interpreted as \`Australia/Sydney\`
including daylight saving. A date that cannot be read — several columns are
\`char(10)\` holding whatever an operator typed — comes back as \`null\`.

## Authentication

\`POST /api/auth/login\` returns an access token and a refresh token. Send the
access token as \`Authorization: Bearer <token>\`.

Clients live in \`tbl_user_client\` and staff in \`tbl_user_admin\`, which are
separate tables with no shared key — so a token records which table it came from
and admin routes accept only the admin audience.

Existing passwords may be bcrypt, MD5 or SHA-1; the schema does not say which.
All are verified, and new passwords are always bcrypt.

## Errors

Every failure returns the same shape:

\`\`\`json
{ "error": "...", "message": "...", "code": "not_found", "fields": {} }
\`\`\`

\`error\` and \`message\` carry the same text — the website reads one and other
callers read the other. \`fields\` appears on validation failures, keyed by input
name, so a form can mark its own boxes.

**A record that is not yours returns 404, not 403.** Distinguishing the two lets
the API be walked to discover which references are real.

## Completeness

Every route this service serves is documented here. That is enforced rather than
promised: a test compares this document against the Express routers and fails
when either side has something the other does not.
`.trim();

export const openApiDocument = {
  openapi: '3.0.3',

  info: {
    title: 'Capital Link Services API',
    version: '2.0.0',
    description: DESCRIPTION,
    // Stated rather than left blank: a reader who finds this document should know
    // it describes a private service, not something they may build against.
    license: { name: 'Proprietary — Capital Link Services' },
  },

  servers: [{ url: `http://localhost:${env.port}`, description: 'Local development' }],

  tags,
  components,
  paths,
} as const;

/**
 * Mounts the docs.
 *
 * The JSON is served as well as the page, because that is what a client
 * generator or a Postman import needs.
 */
export const mountSwagger = (app: Express): void => {
  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.json(openApiDocument);
  });

  app.use(
    '/api-docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'Capital Link Services API',
      swaggerOptions: {
        // A hundred and thirty endpoints expanded by default is a page nobody
        // can scan. `filter` gives the reader a search box instead.
        docExpansion: 'none',
        persistAuthorization: true,
        tagsSorter: 'alpha',
        filter: true,
      },
    })
  );
};
