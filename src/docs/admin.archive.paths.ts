import { body, f, okObject, operation, PAGING } from './shared';

/**
 * Archiving an order. Staff tokens only. See `modules/admin/orderArchive.ts`.
 *
 * Until `db/migrations/2026-10-30-ops-order-archive.sql` is applied, the list
 * answers `{ "available": false }`, an order reads as not archived, and archiving
 * or restoring is a 503 — so a deploy that gets ahead of the migration changes
 * nothing for the existing admin.
 */

const tag = 'Admin';
const notFound = { $ref: '#/components/responses/NotFound' };
const unavailable = {
  description: 'The archive table has not been applied to this database yet.',
};

export const adminArchivePaths = {
  '/api/admin/archived-orders': {
    get: operation('/api/admin/archived-orders', {
      tag,
      summary: 'Orders that have been archived',
      description:
        'Every order currently archived, most recently archived first. `search` matches word by word over the order number, the name, the email, the destination, the service, who archived it and the note. Archived orders are left out of every other order list, the Document Hub, the payments list and the dashboard counts.',
      auth: 'bearer',
      query: [
        {
          name: 'search',
          description: 'Words to match, all of which must be found.',
          type: 'string',
        },
        ...PAGING,
      ],
      responses: {
        200: okObject('The archived orders', {
          available: { type: 'boolean' },
          orders: { type: 'array', items: { type: 'object' } },
          pagination: { $ref: '#/components/schemas/Pagination' },
        }),
      },
    }),
  },

  '/api/admin/orders/{id}/archive': {
    get: operation('/api/admin/orders/{id}/archive', {
      tag,
      summary: 'Whether an order is archived',
      description:
        'For an order’s own screen: whether it is archived, and who archived it, when and why.',
      auth: 'bearer',
      responses: {
        200: okObject('The state', {
          available: { type: 'boolean' },
          archived: { type: 'boolean' },
          archivedAt: f.string(),
          archivedBy: f.string(),
          note: f.string(),
        }),
      },
    }),
    post: operation('/api/admin/orders/{id}/archive', {
      tag,
      summary: 'Archive an order',
      description:
        'Hides the order from the order lists, the Document Hub, the payments list and the dashboard counts. Nothing about the order is changed or deleted, the client still sees it, and staff can still open it by its link. Safe to repeat.',
      auth: 'bearer',
      body: {
        schema: body({ note: f.string('Why — optional, up to 500 characters.') }),
      },
      responses: {
        200: okObject('Archived', {
          orderId: { type: 'integer' },
          archived: { type: 'boolean' },
        }),
        404: notFound,
        503: unavailable,
      },
    }),
  },

  '/api/admin/orders/{id}/unarchive': {
    post: operation('/api/admin/orders/{id}/unarchive', {
      tag,
      summary: 'Show an archived order again',
      description:
        'Brings the order back into every list it was hidden from. The archive row is kept with who restored it and when. Safe to repeat.',
      auth: 'bearer',
      responses: {
        200: okObject('Restored', {
          orderId: { type: 'integer' },
          archived: { type: 'boolean' },
        }),
        503: unavailable,
      },
    }),
  },
};
