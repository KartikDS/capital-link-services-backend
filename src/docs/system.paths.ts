import { okObject, operation } from './shared';

/**
 * Health, configuration and schema diagnostics — plus file handling.
 *
 * Two tags, one file, because both come from `modules/system` and neither is more
 * than a handful of endpoints.
 */

const tag = 'System';
const uploads = 'Uploads';

export const systemPaths = {
  '/api/health': {
    get: operation('/api/health', {
      tag,
      summary: 'Service health, including a real database query',
      description:
        'Runs `SELECT 1`. Answers 503 when the database cannot be reached, so a broken deployment fails its health check rather than serving errors.\n\nUse this for a readiness probe. Use `/api/health/live` for a liveness probe.',
      errors: {},
      responses: {
        200: okObject('Healthy', {
          status: { type: 'string', example: 'ok' },
          database: {
            type: 'object',
            properties: {
              connected: { type: 'boolean' },
              latencyMs: { type: 'integer' },
              readOnly: { type: 'boolean' },
            },
          },
          uptimeSeconds: { type: 'integer' },
        }),
        503: { description: 'The database is unreachable' },
      },
    }),
  },

  '/api/health/live': {
    get: operation('/api/health/live', {
      tag,
      summary: 'Process liveness, with no database call',
      description:
        'For the orchestrator’s restart decision. Restarting this process does not fix a database that is down, so a liveness probe must not fail when the database does — which is why this is separate from `/api/health`.',
      errors: {},
      responses: {
        200: okObject('The process is up', {
          status: { type: 'string', example: 'ok' },
          uptimeSeconds: { type: 'integer' },
        }),
      },
    }),
  },

  '/api/system/ready': {
    get: operation('/api/system/ready', {
      tag,
      summary: 'Whether every dependency this service needs is present',
      description:
        'The database connection, the document storage and the configured secrets, each reported separately — so a deployment that is failing says which piece is missing rather than only that it is not ready. `documentStorage` is `s3+local` or `local`. `s3+local` means every document is written to the bucket **and** to `UPLOAD_DIR`; `local` means the bucket is not configured, so the only copy is on this machine’s own disk, which a replaceable container loses.',
      errors: {},
      responses: {
        200: okObject('Ready', {
          ready: { type: 'boolean' },
          checks: { type: 'object', additionalProperties: { type: 'boolean' } },
          documentStorage: { type: 'string', enum: ['s3+local', 'local'] },
        }),
        503: { description: 'Something it depends on is not available' },
      },
    }),
  },

  '/api/config/public': {
    get: operation('/api/config/public', {
      tag,
      summary: 'Feature flags and limits for the website',
      description:
        'What the browser is allowed to know: upload size and extension limits, the applicant ceiling, whether the database is read-only. Nothing secret, and nothing that changes per client.',
      errors: {},
      responses: {
        200: okObject('Configuration', {
          config: { type: 'object' },
        }),
      },
    }),
  },

  '/api/system/schema': {
    get: operation('/api/system/schema', {
      tag,
      summary: 'Compare the modelled tables against the live database',
      description:
        'Lists tables this API models that the database lacks, and tables present but unmodelled. `healthy: false` means an endpoint will fail when called.\n\nWorth running after any database restore: this schema is shared with the application CLS staff use, so it can change without this service being told.',
      errors: {},
      responses: {
        200: okObject('Schema comparison', {
          healthy: { type: 'boolean' },
          missingTables: { type: 'array', items: { type: 'string' } },
          unmodelledTables: { type: 'array', items: { type: 'string' } },
        }),
      },
    }),
  },

  '/api/uploads/validate': {
    post: operation('/api/uploads/validate', {
      tag: uploads,
      summary: 'Check a file would be accepted, before sending it',
      description:
        'Takes a name and a size, not the file. The point is to fail a 40 MB upload on a phone connection in one round trip rather than after the whole transfer — so the browser asks first and only then sends.',
      body: {
        schema: {
          type: 'object',
          required: ['fileName', 'sizeBytes'],
          properties: {
            fileName: { type: 'string', example: 'passport-biodata.pdf' },
            sizeBytes: { type: 'integer', example: 482_133 },
          },
        },
      },
      responses: {
        200: okObject('Whether it would be accepted, and why not if not', {
          accepted: { type: 'boolean' },
          reason: { type: 'string', nullable: true },
          limits: {
            type: 'object',
            properties: {
              maxBytes: { type: 'integer' },
              extensions: { type: 'array', items: { type: 'string' } },
            },
          },
        }),
      },
    }),
  },

  '/api/uploads': {
    post: operation('/api/uploads', {
      tag: uploads,
      summary: 'Upload a file not yet attached to an order',
      description:
        '`multipart/form-data`, field name `file`. For the journeys that collect a scan before the order exists.\n\nThe file lands under `UPLOAD_DIR` and nothing there is served statically — it is read back through a route that checks ownership first.',
      auth: 'bearer',
      responses: {
        201: okObject('Stored', {
          file: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              sizeBytes: { type: 'integer' },
            },
          },
        }),
        413: { description: 'Larger than the configured limit' },
        415: { description: 'That extension is not accepted' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },
} as const;
