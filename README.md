# Capital Link Services API

TypeScript REST API over the existing `clspubli` MySQL database.

```bash
cp .env.example .env    # fill in DB_* and the two JWT secrets
npm install
npm run db:check        # confirms the schema matches before you start
npm run dev             # http://localhost:5000, docs at /api-docs
```

---

## The one thing to understand first

**This API does not own its schema.** It reads and writes CLS's existing
database: 94 tables, all prefixed `tbl_`, five years old, and shared with the
application CLS staff use every day. The reference dump is in
[`db/schema/clspubli_staging.sql`](db/schema/clspubli_staging.sql) and it is
never executed by anything here.

Three rules follow, and they explain most of the design:

| | |
| --- | --- |
| **No DDL, ever** | No `CREATE`, `ALTER`, `DROP`. `sequelize.sync()` throws. A query guard refuses DDL in every environment, and the database account should lack the privilege too. |
| **Writes can be switched off** | `DB_READ_ONLY=true` refuses every `INSERT`/`UPDATE`/`DELETE` before it reaches MySQL. Use it for the read-only milestone. |
| **Features bend to the schema** | Where a feature needs storage the schema does not have, the feature is absent or degraded — and the response says so. It never returns `200` and drops the data. |

## Layout

```
src/
  config/       env (validated on boot), database (the guard), swagger
  models/
    generated/  89 models, one per table — generated, do not edit
    associations.ts   every relationship, hand-written and justified
  domain/       codes.ts (the schema's magic numbers), quotes.ts (pricing), company.ts
  shared/       dates, money, text, passwords, tokens, errors, validation, http
  middleware/   authenticate, errorHandler, rateLimit, upload, requestContext
  modules/      auth, orders, portal, enquiries, lookups, content, payments, admin, system
  routes/       index.ts — every mount point in one file
db/schema/      the reference dump
scripts/        generateModels.ts, checkDatabase.ts
tests/          unit/ and routes/
```

## The models are generated

Ninety-four tables, some with 145 columns. Hand-typing them would guarantee a
typo in a column name, and a typo in a column name is a runtime error against a
production database. So they are generated from the dump:

```bash
npm run models:generate    # rewrites src/models/generated
```

The output is committed, so the build needs no codegen step and a reviewer can
read exactly what the application believes each table looks like. Re-run it only
when CLS supplies a new dump.

`tests/unit/schemaFidelity.test.ts` compares every model against the dump in
both directions — no column declared that the table lacks, no column in the
table left unmapped. That is 275 of the 410 tests, and it is the check that
would have caught the previous build's central problem: a backend naming
twenty-three tables this database had never heard of.

**Five tables are deliberately unmodelled** — `tbl_cls_order-19-2-2021`,
`tbl_orders-21-2-2021`, `tbl_user_client-issuetest`, `tbl_migration_debug`,
`tbl_myob_keys_development`. Dated backups, a test copy and debug scratchpads.
They stay in the database untouched; they get no model because a model is an
invitation to query them.

## The two order families

The database holds two generations of order model, **both live**:

| | `tbl_orders` | `tbl_cls_order` |
| --- | --- | --- |
| Key | `order_no` (int) | `id` (int) |
| Reference | the key itself | `order_no` (TEXT) |
| Shape | one 145-column row per order | header + per-service detail tables |
| Satellites join on | `order_no` | `order_id` |

An order lookup tries the newer family first and falls back to the older one, so
a reference from 2022 still resolves. New orders are written to `tbl_cls_order`.

**Which family CLS currently writes is unconfirmed.** `npm run db:check` reports
the row counts and newest submission date for both, which answers it from the
data — confirm with CLS before enabling writes.

## What the schema cannot store

Every one of these is a feature the website's portal was designed around and the
database has no column for. In each case the API does the nearest honest thing
and says so in its response.

| Feature | What happens |
| --- | --- |
| **Invoices** | No invoice table. Assembled from `tbl_order_dl_quotes` (real quote lines, batched by `sent_group`) or from the order's own total. Each carries `source` saying which. |
| **Notifications** | No table, no read/unread column. Derived on each request from outstanding documents, overdue invoices and recent order movement. Marking one read returns `persisted: false`. |
| **Passport photos** | `tbl_user_client.passport_photo` is one column holding one filename. A submission queue with review states cannot exist. Uploading replaces; withdrawing is refused with a reason. |
| **Order drafts** | No JSON column. A draft is an unsubmitted `tbl_cls_order` row, so only fields with real columns persist — the response lists the keys it had to drop. |
| **Cancellation** | Neither order table has a cancelled state. Legacy orders get `s_archive = 1`; newer ones record a request and return `pending: true` rather than claiming the order was cancelled. |
| **Password reset expiry** | `reset_pin` is `char(10)` with no expiry column. The pin goes in the column and the client's token carries the expiry in its signature. Ten characters is not much entropy, hence the hard rate limit. |
| **Sessions** | No session or refresh-token table. Tokens are stateless and short-lived; `logout` tells the caller to discard them rather than implying a revocation. |
| **Consultant details** | `tbl_user_admin` has a name, email and password — no phone, title or photo. The API returns the real name and email plus CLS's published switchboard, so every field is true. See [`src/domain/company.ts`](src/domain/company.ts). |
| **Notes on a `tbl_cls_order`** | `tbl_order_notes` is keyed by the integer `order_no`, so a non-numeric reference has no notes. |

## What the data will fight you on

- **No foreign keys.** Not one, across 94 tables. Orphaned rows exist, so reads
  use `LEFT` joins and render a gap rather than dropping the row.
- **18 MyISAM tables** — including `tbl_order_notes`, `tbl_tpn` and
  `tbl_police_clearances`. No transactions. Nothing in the lodgement path
  touches them, which is why order writes can be transactional.
- **Mixed collations** — `latin1_swedish_ci`, `utf8_general_ci`,
  `utf8_unicode_ci`. UTF-8 written into a latin1 column is already stored as
  mojibake; [`shared/text.ts`](src/shared/text.ts) repairs it on read and never
  writes the repair back.
- **Money in three formats** — `double`, `varchar(255)` and `float(10,2)`. The
  varchar ones hold `450`, `$1,250.00` and `TBA`.
  [`shared/money.ts`](src/shared/money.ts) normalises all of it to integer cents,
  and returns `null` — not `0` — for a column holding a word.
- **Dates with no zone.** Local Sydney wall-clock times, daylight saving
  included. [`shared/dates.ts`](src/shared/dates.ts) is the only place that
  interprets them. Several are `char(10)`/`char(20)` holding whatever an operator
  typed; unreadable values come back `null`.
- **`tbl_payment` stores raw card data** — `card_number`, `ccv_number`,
  `name_on_card`, `card_expiry_*`. **Nothing here reads or writes them.** Storing
  a CVV is a PCI-DSS violation; the columns are inherited and this API will not
  add to it. Worth raising with CLS separately.

## Money and pricing

Every amount in a request or response is **integer cents**. A request names
catalogue ids and never amounts — the figures come from
[`src/domain/quotes.ts`](src/domain/quotes.ts), reading the same tables CLS's own
admin maintains. A tampered payload can ask for a different order; it cannot ask
for a different price.

GST is 10%, rounded **once on the subtotal**. Rounding per line produces a total
that disagrees with the arithmetic underneath it by a cent or two, and then the
printed invoice and the card charge stop matching.

Police clearance, the Russian voucher and public visas have published rates.
Document legalisation and government visa work do not — those return
`quoteRequired: true` with a reason, because a consultant prices them per job.

## Authentication

`POST /api/auth/login` returns an access token (1 hour) and a refresh token.
Send the access token as `Authorization: Bearer <token>`.

Clients live in `tbl_user_client` and staff in `tbl_user_admin` — separate tables
with no shared key — so a token records which table it came from and admin routes
accept only the `admin` audience.

**One table per sign-in, and it is the client table by default.** `login` takes an
optional `audience` (`client` | `admin`); omitted, only `tbl_user_client` is
checked, so a member of staff typing their back-office credentials into the
website is refused with the same wording as a wrong password. A back office asks
for `audience: "admin"` explicitly — that is the only way a staff token is
issued, and it is deliberately not something a caller reaches by default.

**Existing passwords may be bcrypt, double MD5, MD5, SHA-1 or SHA-256.** The
schema does not say which; all are verified so five years of clients can sign in
with the password they already have. New passwords are always bcrypt. Set
`LEGACY_PASSWORD_ALGO` once `npm run db:check` has told you the format, or leave
it on `auto`.

Every sign-in failure returns the same message, and the password is verified even
when no account was found — otherwise the response time tells an attacker which
addresses are registered.

### One login, two applications

The Acme Symfony site and this API authenticate **the same rows** —
`tbl_user_client` and `tbl_user_admin` — and write passwords differently. Both
sides have to understand both formats or half the accounts cannot sign in.

| | writes | verifies |
|---|---|---|
| Acme (`GlobalModel`) | `md5(md5($password))` | that, and bcrypt |
| this API | bcrypt, cost 12 | that, `md5(md5())`, MD5, SHA-1, SHA-256 |

Two things make it work, and they ship together:

- **`md5x2` here.** `md5(md5($password))` is what `passGenerator()` wrote, and it
  is 32 hex characters — the same shape as a plain MD5. Verifying only the
  single digest against it is why accounts created on the Acme site were refused
  here.
- **Fetch-then-verify there.** All four Acme login paths compared the hash inside
  the `WHERE` clause. bcrypt is salted, so the same password hashes differently
  every time and `WHERE password = ?` can never match one — which is why
  accounts created here were refused there. They now read the row by email and
  call `GlobalModel::verifyPassword()`. `matchPassword()` scans every row for the
  address, because `email` has no unique index.

`$2b$` vs `$2y$`: bcryptjs emits `$2b$`, and PHP's bundled crypt rejects that
prefix on older builds — returning a failure string, which reads as "wrong
password". `verifyBcryptHash()` relabels it to `$2y$`, the same algorithm under a
prefix every PHP since 5.3.7 accepts.

**Deploy both halves together.** Shipping this API alone leaves Acme unable to
read bcrypt; shipping the Acme patch alone is harmless but fixes nothing.

`LEGACY_PASSWORD_REHASH` upgrades a legacy hash to bcrypt on a successful
sign-in, and is safe to turn on **only once the Acme patch is live** — before
that it migrates a client to bcrypt and locks them out of the Acme site. Leaving
it off is fine: nothing breaks, the rows simply stay double MD5. Note that Acme
still *writes* `md5(md5())` on a password change or reset, so a rehashed account
can go back to the legacy format. That is survivable in both directions and is
why the rehash is an optimisation rather than a migration.

**`activation_code` is written null.** The Acme client login refuses any row
whose `activation_code` is not empty, with "Your account is not verified."
Registration here used to fill it with random bytes while nothing in the stack
ever sent a confirmation link — the welcome email has none and the website has no
verify-email page — so it confirmed nothing and permanently locked new accounts
out of Acme. `POST /api/auth/verify-email` still works, for legacy rows carrying
a code Acme issued. If email confirmation is wanted later, build the link and the
page first; the column is only meaningful once something can clear it.

## Errors

```json
{ "error": "...", "message": "...", "code": "not_found", "fields": {} }
```

`error` and `message` carry the same text — the website reads one, other callers
the other. `fields` appears on validation failures, keyed by input name, so a
form can mark its own boxes.

**A record that is not yours returns 404, not 403.** Distinguishing them lets the
API be walked to discover which references are real, and the legacy family's
references are sequential integers.

A database error never reaches a client. Sequelize messages carry table names,
column names and sometimes the values being written; those go to the log and the
client gets wording they can act on plus an opaque reference to quote.

## Scripts

| | |
| --- | --- |
| `npm run dev` | Watch mode |
| `npm run build` / `start` | Compile to `dist/`, then run it |
| `npm test` | 410 tests. No database needed. |
| `npm run test:coverage` | With coverage |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` / `lint:fix` | ESLint, type-aware |
| `npm run db:check` | Compare models against a real database, report row counts, password formats and data hazards. Read-only. |
| `npm run models:generate` | Regenerate models from the dump |

## Endpoints

131 routes across nine modules, all documented at `/api-docs` with the spec at
`/api-docs.json`. The mount points are fixed: the website is already built
against them and its own tests assert on those paths.

```
/api/health  /api/config/public  /api/system/schema  /api/system/ready
/api/auth/*        login, refresh, register, passwords, verify-email, me
/api/lookups/*     countries, visa types, fees, courier options, settings
/api/content/*     pages, sections, banners, services, travel alerts
/api/enquiries/*   five intake forms + /admin queue
/api/orders/*      track, quote/*, drafts/*, lodgement, /:reference/*
/api/portal/*      profile, orders, stats, documents, invoices, photos
/api/payments/*    record (internal), receipts, /admin
/api/invoices/:id  printable
/api/uploads/*     validate, unassigned
/api/admin/*       queue, assignment, milestones, review, quotes, logs, export
```

## Before this goes near live data

1. **Restore a copy of the database locally** and run `npm run db:check`. Do not
   point `.env` at live.
2. **Confirm the order family** — `tbl_orders` or `tbl_cls_order`. Writing to the
   wrong one produces orders CLS staff never see.
3. **Confirm the password hash format** from the `db:check` output.
4. **Grant `SELECT`/`INSERT`/`UPDATE` only.** No `CREATE`, `ALTER` or `DROP`. The
   in-process guard is the second lock, not the only one.
5. **Run with `DB_READ_ONLY=true` first.** Reads prove the mapping; a mistake
   becomes a 503 with the statement in the log instead of a modified legacy row.
6. **Set `LEGACY_UPLOAD_DIR`** if legacy document downloads are needed. Unset, a
   legacy file answers 404 rather than reading from a guessed path.

`/uploads` is never served statically. These are passport scans; every download
goes through an endpoint that checks ownership first.
