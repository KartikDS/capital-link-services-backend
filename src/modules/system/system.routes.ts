import { Router, type Request, type Response } from 'express';
import { QueryTypes } from 'sequelize';
import { env } from '../../config/env';
import { isDatabaseConnected, sequelize } from '../../config/database';
import { UNMODELLED_TABLES, generatedModels } from '../../models';
import { ALLOWED_EXTENSIONS } from '../../middleware/upload';
import { ok } from '../../shared/http/responses';
import { logger } from '../../shared/logger';

/**
 * Health, configuration and schema diagnostics.
 */

export const systemRoutes = Router();

/**
 * GET /api/health
 *
 * Actually queries the database. A health check that only reports "the process
 * is up" passes while every request fails, which is the one case it exists to
 * catch — so this runs `SELECT 1` and answers 503 when it cannot.
 */
systemRoutes.get('/health', async (_req: Request, res: Response) => {
  const startedAt = Date.now();

  try {
    await sequelize.query('SELECT 1', { type: QueryTypes.SELECT });

    ok(res, {
      status: 'ok',
      database: {
        connected: true,
        latencyMs: Date.now() - startedAt,
        readOnly: env.database.readOnly,
      },
      uptimeSeconds: Math.round(process.uptime()),
    });
  } catch (error) {
    logger.error('Health check failed', {
      message: error instanceof Error ? error.message : String(error),
    });

    res.status(503).json({
      status: 'unavailable',
      error: 'We could not reach our records just now.',
      message: 'We could not reach our records just now.',
      code: 'database_unavailable',
      database: { connected: false, readOnly: env.database.readOnly },
    });
  }
});

/**
 * GET /api/health/live
 *
 * Process liveness only, no database. For the orchestrator's restart decision:
 * restarting this process does not fix a database that is down, so a liveness
 * probe must not fail when the database does.
 */
systemRoutes.get('/health/live', (_req: Request, res: Response) => {
  ok(res, { status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

/**
 * GET /api/config/public
 *
 * What the website needs to know about this deployment. Feature flags rather
 * than secrets — whether the address lookup is available, what may be uploaded
 * and how large — so a form can hide a control that cannot work instead of
 * offering it and failing.
 */
systemRoutes.get('/config/public', (_req: Request, res: Response) => {
  ok(res, {
    config: {
      addressLookupEnabled: env.googleMapsApiKey !== null,
      uploads: {
        maxMb: env.uploads.maxMb,
        allowedExtensions: ALLOWED_EXTENSIONS,
      },
      readOnly: env.database.readOnly,
      currency: 'AUD',
      gstRate: 0.1,
      timezone: 'Australia/Sydney',
    },
  });
});

/**
 * GET /api/system/schema
 *
 * Compares the tables this API models against the tables that actually exist.
 *
 * This is the check that would have caught the previous build's central
 * problem — a backend whose model layer named twenty-three tables that the
 * client's database had never heard of. It reads `information_schema`, which is
 * a read and needs no privileges beyond the ones the API already has.
 */
systemRoutes.get('/system/schema', async (_req: Request, res: Response) => {
  interface TableRow {
    TABLE_NAME: string;
  }

  const rows = await sequelize.query<TableRow>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = :schema AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME`,
    { type: QueryTypes.SELECT, replacements: { schema: env.database.name } }
  );

  const live = new Set(rows.map((row) => row.TABLE_NAME));
  const modelled = new Set(
    Object.values(generatedModels).map((model) => model.getTableName() as string)
  );
  const skipped = new Set<string>(UNMODELLED_TABLES);

  // A table this API queries that the database does not have. Every one of
  // these is a broken endpoint waiting to be called.
  const missing = [...modelled].filter((table) => !live.has(table)).sort();

  // A table in the database with no model. Expected for the backups we skip on
  // purpose; anything else is a table nobody has looked at yet.
  const unmodelled = [...live]
    .filter((table) => !modelled.has(table) && !skipped.has(table))
    .sort();

  ok(res, {
    schema: {
      database: env.database.name,
      liveTables: live.size,
      modelledTables: modelled.size,
      deliberatelySkipped: [...skipped].sort(),
      missingFromDatabase: missing,
      presentButUnmodelled: unmodelled,
      healthy: missing.length === 0,
    },
  });
});

/**
 * GET /api/system/ready
 *
 * Whether this deployment is wired up enough to serve the portal. Reports the
 * pieces that are configuration rather than code, which are the ones that go
 * wrong on a new environment.
 */
systemRoutes.get('/system/ready', (_req: Request, res: Response) => {
  const checks = {
    database: isDatabaseConnected(),
    internalSecret: env.internalApiSecret !== null,
    legacyDocumentsMounted: env.uploads.legacyDir !== null,
    addressLookup: env.googleMapsApiKey !== null,
    writesEnabled: !env.database.readOnly,
  };

  ok(res, { ready: checks.database, checks });
});
