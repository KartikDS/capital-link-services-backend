import { body, f, okObject, operation } from './shared';

/**
 * CLS Ops, Phase 1: the document route layer on top of the existing admin.
 * Staff tokens only. See `modules/admin/ops/ops.routes.ts`.
 *
 * Until `db/migrations/2026-10-14-ops-document-routes.sql` is applied, every read
 * answers `{ "available": false }` and every write is a 503, so a deploy that gets
 * ahead of the migration changes nothing for the existing admin.
 */

const tag = 'Admin';

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

const entry = (
  path: string,
  method: Method,
  summary: string,
  description: string,
  input: { body?: Record<string, unknown>; props?: Record<string, unknown> } = {}
): [string, Record<string, unknown>] => [
  path,
  {
    [method]: operation(path, {
      tag,
      summary,
      description,
      auth: 'bearer',
      ...(input.body ? { body: { schema: input.body } } : {}),
      responses: {
        200: okObject('Done', { available: { type: 'boolean' }, ...(input.props ?? {}) }),
        404: { $ref: '#/components/responses/NotFound' },
        503: {
          description: 'The Ops tables have not been applied to this database yet.',
        },
      },
    }),
  },
];

const merge = (
  list: [string, Record<string, unknown>][]
): Record<string, Record<string, unknown>> => {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [path, ops] of list) out[path] = { ...(out[path] ?? {}), ...ops };
  return out;
};

const P = '/api/admin/ops';
const legalisation = 'Document legalisation orders only (`order_type` 9).';

export const adminOpsPaths = merge([
  entry(
    `${P}/meta`,
    'get',
    'Ops reference data',
    'SLA hours, assignable staff, department types, document checks and the send/receive checklists per department type.'
  ),
  entry(
    `${P}/settings`,
    'patch',
    'Change the SLA hours and the automation switches',
    'Hours for claim, verify, chase, route and hand-over, and the five automation preferences. Absent means unchanged.',
    {
      body: body({
        claimH: f.int(),
        verifyH: f.int(),
        chaseH: f.int(),
        routeH: f.int(),
        readyH: f.int(),
        autoAssign: { type: 'boolean' },
        autoChase: { type: 'boolean' },
        autoQueue: { type: 'boolean' },
        autoReview: { type: 'boolean' },
        autoWallet: { type: 'boolean' },
      }),
    }
  ),
  entry(
    `${P}/departments`,
    'get',
    'Embassies and departments',
    'The master list documents are sent to, including inactive ones.'
  ),
  entry(
    `${P}/departments`,
    'post',
    'Add an embassy or department',
    'Creates a department and a unique code from its short name.',
    {
      body: body(
        { name: f.string(), shortName: f.string(), type: f.string(), tatDays: f.int() },
        ['name', 'shortName', 'type']
      ),
    }
  ),
  entry(
    `${P}/departments/{id}`,
    'patch',
    'Edit an embassy or department',
    'Replaces the editable fields.',
    {
      body: body(
        { name: f.string(), shortName: f.string(), type: f.string(), tatDays: f.int() },
        ['name', 'shortName', 'type']
      ),
    }
  ),
  entry(
    `${P}/departments/{id}/toggle`,
    'post',
    'Activate or deactivate a department',
    'A deactivated department is hidden from new routes; existing legs keep it.'
  ),
  entry(
    `${P}/departments/{id}`,
    'delete',
    'Delete a department',
    'Refused (409) once documents have been routed through it or a route template uses it; deactivate it instead.'
  ),
  entry(
    `${P}/route-templates`,
    'get',
    'Route templates',
    'Every template with its ordered stops, and the country list for the editor. `templatesAvailable: false` until the migration is applied.'
  ),
  entry(
    `${P}/route-templates`,
    'post',
    'Add a route template',
    'A destination (blank for any), a kind or named document, a pathway and the ordered departments.',
    {
      body: body(
        {
          destination: f.string(),
          docKind: f.string(),
          docLabel: f.string(),
          pathway: f.string(),
          usualDays: f.int(),
          active: { type: 'boolean' },
          legs: { type: 'array', items: { type: 'object' } },
        },
        ['pathway', 'legs']
      ),
    }
  ),
  entry(
    `${P}/route-templates/{id}`,
    'patch',
    'Edit a route template',
    'Replaces the template and its stops.',
    {
      body: body(
        {
          destination: f.string(),
          docKind: f.string(),
          docLabel: f.string(),
          pathway: f.string(),
          usualDays: f.int(),
          active: { type: 'boolean' },
          legs: { type: 'array', items: { type: 'object' } },
        },
        ['pathway', 'legs']
      ),
    }
  ),
  entry(
    `${P}/route-templates/{id}`,
    'delete',
    'Delete a route template',
    'Orders already routed are unaffected; with no matching template the built-in rule is used.'
  ),
  entry(
    `${P}/config`,
    'get',
    'The routing rules',
    'Verification checks, department types with their send/receive checklists, and the country and document-name lists. `configAvailable: false` until the migration is applied.'
  ),
  entry(
    `${P}/config/checks`,
    'put',
    'Replace the verification checks',
    'Items without a code are new; a check left out is deleted. At least one must stay switched on.',
    {
      body: body({ checks: { type: 'array', items: { type: 'object' } } }, ['checks']),
    }
  ),
  entry(
    `${P}/config/dept-types`,
    'put',
    'Replace the department types and checklists',
    'Items without a code are new. A type that departments or templates still use cannot be removed (409).',
    {
      body: body({ types: { type: 'array', items: { type: 'object' } } }, ['types']),
    }
  ),
  entry(
    `${P}/config/lists/{key}`,
    'put',
    'Replace one rule list',
    '`key` is hague, arab, civil_doc or police_doc.',
    {
      body: body({ values: { type: 'array', items: { type: 'string' } } }, ['values']),
    }
  ),
  entry(
    `${P}/orders/{id}`,
    'get',
    'The Ops view of one order',
    `Stage, SLA clock, next action, documents with their legs, pending items, activity and return checks. ${legalisation}`
  ),
  entry(
    `${P}/summary`,
    'get',
    'Stage, SLA and next action for a page of orders',
    'Takes `?ids=1,2,3`. Orders that are not placed legalisation orders are omitted.'
  ),
  entry(
    `${P}/orders/{id}/claim`,
    'post',
    'Claim or reassign an order',
    'Sets the consultant, the same column the existing assign route writes.',
    {
      body: body({ adminId: f.int('Defaults to the caller.') }),
    }
  ),
  entry(
    `${P}/orders/{id}/docs/{docId}/tick`,
    'patch',
    'Tick one verification check',
    'One of `orig`, `sign`, `req`, `scan`.',
    {
      body: body({ key: f.string(), value: { type: 'boolean' } }, ['key', 'value']),
    }
  ),
  entry(
    `${P}/orders/{id}/docs/{docId}/verify`,
    'post',
    'Mark a document verified',
    'Ticks every check and records who and when.'
  ),
  entry(
    `${P}/orders/{id}/verify-all`,
    'post',
    'Verify every document on the order',
    'Same as verifying each document in turn.'
  ),
  entry(
    `${P}/orders/{id}/docs`,
    'post',
    'Add a document to the order',
    'Adds a line to `tbl_order_dl_checklist`, for documents that arrived but were not listed.',
    { body: body({ type: f.string(), qty: f.int() }, ['type']) }
  ),
  entry(
    `${P}/orders/{id}/pending`,
    'post',
    'Raise a pending item',
    'Starts a chase clock and, when tied to a document, marks it as having an issue.',
    {
      body: body(
        {
          docId: f.int(),
          text: f.string(),
          owner: f.string(),
          who: f.string(),
          dueH: f.int(),
        },
        ['text']
      ),
    }
  ),
  entry(
    `${P}/pending/{id}/remind`,
    'post',
    'Record a reminder',
    'Increments the reminder count and restarts the chase clock.'
  ),
  entry(
    `${P}/pending/{id}/resolve`,
    'post',
    'Resolve a pending item',
    'When the last open item on a document clears, the document returns to "to verify".'
  ),
  entry(
    `${P}/orders/{id}/route/apply`,
    'post',
    'Apply the suggested route',
    'Plans legs for every document without one, once every document is verified and no item is open.'
  ),
  entry(
    `${P}/orders/{id}/docs/{docId}/route`,
    'put',
    'Replace a document route',
    'Only while no leg has been sent.',
    {
      body: body({ legs: { type: 'array', items: { type: 'object' } } }, ['legs']),
    }
  ),
  entry(
    `${P}/orders/{id}/docs/{docId}/legs`,
    'post',
    'Add a leg to a document',
    'Appends a stop to the route.',
    {
      body: body({ departmentId: f.int(), price: f.int() }, ['departmentId']),
    }
  ),
  entry(
    `${P}/legs/{id}`,
    'patch',
    'Change a planned leg',
    "Price or responsible person. Only before the leg is sent, and only by the order's consultant or the leg's responsible person.",
    { body: body({ price: f.int(), responsibleId: f.int() }) }
  ),
  entry(
    `${P}/legs/{id}`,
    'delete',
    'Remove a planned leg',
    'Only before the leg is sent.'
  ),
  entry(
    `${P}/legs/sign`,
    'post',
    'Sign off sent or received',
    "Signs one or more legs going to the same department against that department type's checklist, or with a recorded exception.",
    {
      body: body(
        {
          kind: f.string(),
          legIds: { type: 'array', items: { type: 'integer' } },
          checks: { type: 'array', items: { type: 'string' } },
          exception: f.string(),
          ref: f.string(),
        },
        ['kind', 'legIds']
      ),
    }
  ),
  entry(
    `${P}/orders/{id}/docs/{docId}/undo`,
    'post',
    'Undo the last sign-off on a document',
    'The leg returns to its previous state and the undo is logged.'
  ),
  entry(
    `${P}/orders/{id}/return`,
    'post',
    'Return the order to the client',
    'Collection or dispatch, once every document is back at CLS.',
    {
      body: body({ method: f.string(), by: f.string() }, ['method']),
    }
  ),
  entry(
    `${P}/documents`,
    'get',
    'The Document Hub',
    'Every document across every open order with where it is now; filters `state`, `dept`, `who`, `dest`, `q`.'
  ),
  entry(
    `${P}/documents/{orderId}/{docId}`,
    'get',
    'One document and its lifecycle',
    'The document, its legs and the timeline of hand-offs.'
  ),
  entry(
    `${P}/dashboard`,
    'get',
    'The consultant dashboard',
    'Action queue sorted by SLA, KPIs, new orders to claim, documents at departments, pipeline and activity. `?scope=mine|team`.'
  ),
  entry(
    `${P}/views`,
    'get',
    'The Orders list views',
    'Counts for My open orders, Unassigned, SLA at risk, Waiting on client, At departments, Review & ready and All open, plus the rows of `?view=`.'
  ),
]);
