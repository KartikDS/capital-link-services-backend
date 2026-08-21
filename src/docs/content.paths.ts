import { body, f, okObject, okRows, operation } from './shared';

/**
 * Editable page copy from the CMS tables.
 *
 * The reads are public and cacheable. The three writes under `/admin` are staff
 * only.
 *
 * **Almost nothing in these tables has a unique key.** `tbl_content_pages` has no
 * slug column, `tbl_services` has no code, `tbl_general_settings` is key/value with
 * a `slug` that is not indexed. `tbl_sections.section_key` is the one exception,
 * which is why it is the only content row addressable by name — and the only write
 * here that cannot create a duplicate.
 */

const tag = 'Content';

export const contentPaths = {
  '/api/content/pages/{slug}': {
    get: operation('/api/content/pages/{slug}', {
      tag,
      summary: 'One CMS page',
      description:
        '`tbl_content_pages` has no slug column — it has `title` and `tags`. So a slug is matched against both: the title slugified, and the tag list. That is how the old application finds these rows, and inventing a slug column would be DDL.',
      errors: { 404: { $ref: '#/components/responses/NotFound' } },
      responses: {
        200: okObject('The page', { page: { type: 'object' } }),
      },
    }),
  },

  '/api/content/sections': {
    get: operation('/api/content/sections', {
      tag,
      summary: 'Addressable copy blocks',
      description:
        '`tbl_sections` is the one CMS table with a unique key (`section_key`), which makes it the reliable one to address by name. `page_slug` groups the sections that belong to one page.',
      query: [
        {
          name: 'page',
          description: 'Only the sections on this page.',
          example: 'about',
        },
      ],
      errors: {},
      responses: { 200: okRows('Sections', 'sections') },
    }),
  },

  '/api/content/banners': {
    get: operation('/api/content/banners', {
      tag,
      summary: 'Home page banners',
      errors: {},
      responses: { 200: okRows('Banners', 'banners') },
    }),
  },

  '/api/content/home': {
    get: operation('/api/content/home', {
      tag,
      summary: 'Everything the home page needs, in one call',
      description:
        'Banners, featured services and the current travel alerts together. The home page would otherwise open with four requests before it could render anything.',
      errors: {},
      responses: {
        200: okObject('The home page', {
          banners: { type: 'array', items: { type: 'object' } },
          services: { type: 'array', items: { type: 'object' } },
          travelAlerts: { type: 'array', items: { type: 'object' } },
        }),
      },
    }),
  },

  '/api/content/services': {
    get: operation('/api/content/services', {
      tag,
      summary: 'The service tree',
      description:
        '`tbl_services.parent_id` makes this a two-level tree, so it is returned nested rather than flat — the website renders a service and its sub-services together and would otherwise have to rebuild the tree itself.',
      errors: {},
      responses: { 200: okRows('Services, nested', 'services') },
    }),
  },

  '/api/content/travel-alerts': {
    get: operation('/api/content/travel-alerts', {
      tag,
      summary: 'Current travel alerts',
      errors: {},
      responses: { 200: okRows('Alerts', 'travelAlerts') },
    }),
  },

  '/api/content/video-tutorials': {
    get: operation('/api/content/video-tutorials', {
      tag,
      summary: 'How-to videos',
      errors: {},
      responses: { 200: okRows('Videos', 'videoTutorials') },
    }),
  },

  '/api/content/visa-popup': {
    get: operation('/api/content/visa-popup', {
      tag,
      summary: 'The visa notice the website shows over a service page',
      errors: {},
      responses: {
        200: okObject('The notice, or null when none is set', {
          visaPopup: { type: 'object', nullable: true },
        }),
      },
    }),
  },

  '/api/content/settings': {
    get: operation('/api/content/settings', {
      tag,
      summary: 'Site settings, as an object',
      description:
        '`tbl_general_settings` is a key/value table — `slug`, `field_type`, `value` — so it is returned as an object keyed by slug rather than as a list. `value` is `text`, and `field_type` says how to read it, so numbers and booleans are coerced here rather than leaving every caller to guess.',
      errors: {},
      responses: {
        200: okObject('Settings', { settings: { type: 'object' } }),
      },
    }),
  },

  '/api/content/admin/sections/{key}': {
    put: operation('/api/content/admin/sections/{key}', {
      tag,
      summary: 'Create or replace a copy block',
      description:
        'Upserts by `section_key`, which is the one uniquely-indexed text column in the CMS tables — so this is the only content write that cannot create a duplicate.',
      auth: 'bearer',
      body: {
        schema: body(
          {
            pageSlug: f.string('Which page this block belongs to.'),
            heading: f.string(),
            bodyHtml: f.string('Stored as-is. Sanitise before rendering.'),
            sortOrder: f.int(),
          },
          []
        ),
      },
      responses: {
        200: okObject('Saved', { section: { type: 'object' } }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/content/admin/travel-alerts': {
    post: operation('/api/content/admin/travel-alerts', {
      tag,
      summary: 'Publish a travel alert',
      auth: 'bearer',
      body: {
        schema: body(
          {
            title: f.string(),
            message: f.string(),
            countryId: f.id('`tbl_countries.id`, when the alert is about one place.'),
          },
          ['title']
        ),
      },
      responses: {
        201: okObject('Published', { travelAlert: { type: 'object' } }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },

  '/api/content/admin/travel-alerts/{id}': {
    delete: operation('/api/content/admin/travel-alerts/{id}', {
      tag,
      summary: 'Withdraw a travel alert',
      auth: 'bearer',
      responses: {
        200: okObject('Withdrawn', { message: { type: 'string' } }),
        403: { $ref: '#/components/responses/Forbidden' },
        503: { $ref: '#/components/responses/ReadOnly' },
      },
    }),
  },
} as const;
