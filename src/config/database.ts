import { Sequelize } from 'sequelize';
import { env } from './env';
import { logger } from '../shared/logger';
import { ReadOnlyError, serverError } from '../shared/errors';

/**
 * The connection to the existing CLS database.
 *
 * Two things about this file matter more than the rest of the codebase put
 * together, because the database on the other end is five years old, live, and
 * not ours to change.
 *
 * **This application never issues DDL.** Not on boot, not on migrate, not by
 * accident. `sequelize.sync()` is replaced with a throw below, and the query
 * guard rejects `CREATE`, `ALTER`, `DROP`, `TRUNCATE` and `RENAME` before they
 * reach MySQL. The database account should also lack those privileges — this is
 * the second lock, not the only one, because a guard in the process that issues
 * the query is the one that produces a clear error instead of a mystery.
 *
 * **Writes can be switched off entirely.** With `DB_READ_ONLY=true` the guard
 * also rejects `INSERT`, `UPDATE`, `DELETE` and `REPLACE`. That is what makes
 * the read-only milestone real rather than a promise: a mapping mistake becomes
 * a 503 with the statement in the log, not a modified legacy row.
 *
 * The model definitions themselves are in `src/models`, and they mirror the
 * dump in `db/schema/clspubli_staging.sql` column for column. That file is
 * reference material — it is never executed by anything here.
 */

/** Statements that change structure. Refused always, in every environment. */
const DDL_PATTERN =
  /^\s*(?:CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE)\b/i;

/** Statements that change data. Refused only while `DB_READ_ONLY` is on. */
const WRITE_PATTERN = /^\s*(?:INSERT|UPDATE|DELETE|REPLACE|SET\s+@|LOCK|UNLOCK)\b/i;

/**
 * `SET` statements the driver itself issues on connect.
 *
 * `mysql2` sends `SET time_zone`, `SET NAMES` and similar when a pooled
 * connection is established. Those are session settings rather than writes, so
 * the guard has to let them through or read-only mode cannot connect at all.
 */
const SESSION_SETUP_PATTERN = /^\s*SET\s+(?:time_zone|NAMES|autocommit|SESSION|@@)/i;

const firstStatement = (sql: string): string => sql.trim().slice(0, 240);

export const sequelize = new Sequelize({
  dialect: 'mysql',
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  username: env.database.user,
  password: env.database.password,

  // The legacy tables are a mix of latin1 and utf8. Connecting as utf8mb4 makes
  // MySQL transcode on the way out, so this process only ever sees valid UTF-8
  // and never has to know which table a string came from.
  dialectOptions: {
    charset: env.database.charset,
    dateStrings: true,
    typeCast: true,
    // A statement that has not answered in thirty seconds is not going to.
    connectTimeout: 30_000,
  },

  // The old application writes local Sydney times into DATETIME columns with no
  // zone recorded. Reading them back in the same offset is what stops every
  // date in the portal shifting by ten hours. Combined with `dateStrings` above,
  // DATE and DATETIME arrive as the strings MySQL holds, and are interpreted in
  // exactly one place (`shared/dates.ts`) rather than by the driver's guesswork.
  timezone: env.database.timezone,

  pool: env.database.pool,

  define: {
    // Every table name in this schema is fixed and explicit. Freezing it stops
    // Sequelize pluralising `tbl_payment` into `tbl_payments`, which would fail
    // at runtime against a table that does not exist.
    freezeTableName: true,
    // The schema has no consistent timestamp convention — `created`/`modified`
    // on some tables, `created_at`/`updated_at` on others, `date_submitted` on
    // the order tables, nothing at all on the lookups. So Sequelize manages
    // none of them, and each model declares the columns it actually has.
    timestamps: false,
    underscored: false,
  },

  logging: env.database.logQueries
    ? (sql: string) => logger.debug('sql', { sql: firstStatement(sql) })
    : false,
});

/**
 * Refuses a statement, from either guard below.
 *
 * DDL is refused in every environment. Data changes are refused only while
 * `DB_READ_ONLY` is on, and the session setup `mysql2` issues on connect is
 * always allowed — without that exception, read-only mode cannot connect at all.
 */
const inspect = (sql: string, source: 'sql' | 'type'): void => {
  if (DDL_PATTERN.test(sql)) {
    logger.error('Refused a DDL statement', { sql: firstStatement(sql), source });
    throw serverError('This service does not modify the database schema.', {
      sql: firstStatement(sql),
    });
  }

  if (
    env.database.readOnly &&
    WRITE_PATTERN.test(sql) &&
    !SESSION_SETUP_PATTERN.test(sql)
  ) {
    logger.warn('Refused a write in read-only mode', {
      sql: firstStatement(sql),
      source,
    });
    throw new ReadOnlyError('write');
  }
};

/**
 * The guard, wrapped around `sequelize.query`.
 *
 * **Why here and not in the `beforeQuery` hook.** The hook looks like the right
 * place and is not: Sequelize 6 constructs the query object, runs the hook, and
 * only *then* assigns the statement — so `query.sql` is `undefined` when a hook
 * reads it. A guard written there silently passes everything, which is worse
 * than no guard, because it reads as protection.
 *
 * `sequelize.query` is the real choke point. In 6.37 there is no `queryRaw`, and
 * every statement — raw, and everything the model layer generates — passes
 * through this one method with the finished SQL as its first argument. Verified
 * rather than assumed: `INSERT`, `UPDATE`, `DELETE` and `SELECT` from a model
 * call all arrive here as strings.
 */
type QueryArgs = Parameters<typeof sequelize.query>;
const runQuery = sequelize.query.bind(sequelize);

/**
 * `async` so a refusal is a rejected promise, not a synchronous throw.
 *
 * `sequelize.query` returns a promise, so every caller either awaits it or
 * attaches a `.catch()`. A guard that threw synchronously would escape the
 * second kind entirely — the `.catch()` never runs, because the exception was
 * raised before a promise existed. Making the wrapper `async` means the two
 * failure paths behave identically.
 */
sequelize.query = (async (...args: QueryArgs) => {
  const first = args[0];
  // `query` accepts a string or a `{ query, values }` pair.
  const sql =
    typeof first === 'string' ? first : ((first as { query?: string })?.query ?? '');

  inspect(sql, 'sql');

  return runQuery(...args);
}) as typeof sequelize.query;

/**
 * A second layer, on the query type rather than the text.
 *
 * `options.type` *is* populated when the hook runs — `INSERT`, `UPDATE`,
 * `DELETE` and so on — so this catches a model write even if a future Sequelize
 * version stops routing it through `sequelize.query`. Two independent checks,
 * because the cost of this one being wrong is a write against a five-year-old
 * production database.
 */
const WRITE_TYPES = new Set([
  'INSERT',
  'UPDATE',
  'BULKUPDATE',
  'DELETE',
  'BULKDELETE',
  'UPSERT',
]);

sequelize.addHook('beforeQuery', (options) => {
  if (!env.database.readOnly) return;

  const type = (options as { type?: string }).type ?? '';

  if (WRITE_TYPES.has(type.toUpperCase())) {
    logger.warn('Refused a write in read-only mode', { queryType: type });
    throw new ReadOnlyError(type.toLowerCase());
  }
});

/**
 * Replaces `sync()`, which would create or alter tables.
 *
 * Left as a throw rather than a no-op: silently doing nothing would let a
 * future caller believe the schema had been reconciled.
 */
sequelize.sync = (): never => {
  throw serverError(
    'sequelize.sync() is disabled. The CLS schema is owned by the database, not by this application.'
  );
};

/** True once `assertDatabaseConnection` has succeeded, for the health check. */
let connected = false;

export const isDatabaseConnected = (): boolean => connected;

/**
 * Proves the connection works, without touching the schema.
 *
 * Called on boot so a bad password fails at startup rather than on the first
 * request. `authenticate` issues `SELECT 1`, which the guard above allows.
 */
export const assertDatabaseConnection = async (): Promise<void> => {
  await sequelize.authenticate();
  connected = true;

  logger.info('Connected to MySQL', {
    host: env.database.host,
    port: env.database.port,
    database: env.database.name,
    readOnly: env.database.readOnly,
  });
};

export const closeDatabase = async (): Promise<void> => {
  connected = false;
  await sequelize.close();
};
