import { body, f, okObject, operation } from './shared';

/**
 * The driver page: find an order, take the receiver's signature, or sign a group.
 * Staff tokens only. See `modules/admin/driver.ts`.
 */

const tag = 'Admin';

const strokes = {
  description:
    'The signature pad’s strokes, `[{ lx, ly, mx, my }, …]`. Stored as JSON on the destination row, which is the format the order screens and print sheets replay.',
  type: 'array',
  items: { type: 'object' },
};

export const adminDriverPaths = {
  '/api/admin/driver/orders': {
    get: operation('/api/admin/driver/orders', {
      tag,
      summary: 'Find an order by number for the driver page',
      description:
        'One order or nothing. A blank `search` is an empty answer, not every order — a driver’s phone is never sent the whole history.',
      auth: 'bearer',
      responses: {
        200: okObject('The order, or none', { orders: { type: 'array', items: { type: 'object' } } }),
        400: { $ref: '#/components/responses/BadRequest' },
      },
    }),
  },

  '/api/admin/driver/orders/{id}': {
    get: operation('/api/admin/driver/orders/{id}', {
      tag,
      summary: 'One order as the driver page shows it',
      description:
        '`country` optionally picks which destination of the order to show.',
      auth: 'bearer',
      responses: {
        200: okObject('The order', { order: { type: 'object' } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/driver/orders/{id}/signature': {
    post: operation('/api/admin/driver/orders/{id}/signature', {
      tag,
      summary: 'Record the receiver’s signature on an order',
      description:
        'Writes `signature`, `sig_name` and the submitted-for-processing date on the destination row. A signed order is never overwritten: a second request is a 409.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            signature: strokes,
            name: f.string(),
            destinationId: f.int(),
          },
          ['signature', 'name']
        ),
      },
      responses: {
        200: okObject('Signed', { signed: { type: 'boolean' } }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { description: 'The order has already been signed.' },
      },
    }),
  },

  '/api/admin/driver/group': {
    get: operation('/api/admin/driver/group', {
      tag,
      summary: 'The orders in this driver’s group',
      description: 'The driver’s own rows in `tbl_scan_group`.',
      auth: 'bearer',
      responses: {
        200: okObject('The group', { group: { type: 'array', items: { type: 'object' } } }),
      },
    }),
    post: operation('/api/admin/driver/group', {
      tag,
      summary: 'Scan an order into the group',
      description: 'The order is named by its number or reference.',
      auth: 'bearer',
      body: { schema: body({ order: f.string() }, ['order']) },
      responses: {
        201: okObject('Added', { group: { type: 'array', items: { type: 'object' } } }),
        400: { $ref: '#/components/responses/BadRequest' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/driver/group/{id}': {
    delete: operation('/api/admin/driver/group/{id}', {
      tag,
      summary: 'Take an order out of the group',
      description: 'Only the driver’s own rows can be removed.',
      auth: 'bearer',
      responses: {
        200: okObject('Removed', { group: { type: 'array', items: { type: 'object' } } }),
        404: { $ref: '#/components/responses/NotFound' },
      },
    }),
  },

  '/api/admin/driver/group/signature': {
    post: operation('/api/admin/driver/group/signature', {
      tag,
      summary: 'Sign for every order in the group at once',
      description:
        'All or nothing, in one transaction. An order signed since it was scanned in is left alone rather than overwritten. The group is emptied afterwards.',
      auth: 'bearer',
      body: {
        schema: body({ signature: strokes, name: f.string() }, ['signature', 'name']),
      },
      responses: {
        200: okObject('Signed', { signed: { type: 'integer' } }),
        400: { $ref: '#/components/responses/BadRequest' },
      },
    }),
  },
};
