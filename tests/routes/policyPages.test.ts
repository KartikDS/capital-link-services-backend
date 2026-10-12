/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method -- jest stubs for async model calls */
import request from 'supertest';
import { Op } from 'sequelize';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { issueAccessToken } from '../../src/shared/tokens';
import { resetRateLimits } from '../../src/middleware/rateLimit';
import { ContentPages } from '../../src/models';

/**
 * The five policy pages staff edit from Content Pages — the admin API and the
 * public read the website uses. The model layer is stubbed; what is asserted is
 * how a row is found, what is stored, and what is served.
 */

let app: Express;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  resetRateLimits();
});

const adminToken = (): string =>
  issueAccessToken({
    sub: 7,
    aud: 'admin',
    email: 'staff@example.com',
    clientType: null,
    sid: 'test-session',
  });

const row = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 5,
    title: 'Privacy Policy',
    html: '<p>Saved</p>',
    tags: 'privacy-policy',
    status: 'active',
    update: jest.fn(async function update(this: Record<string, unknown>, v: object) {
      Object.assign(this, v);
      return this;
    }),
    ...over,
  }) as unknown as ContentPages;

describe('GET /api/content/policies/:slug', () => {
  it('serves the saved copy', async () => {
    jest.spyOn(ContentPages, 'findAll').mockResolvedValue([row()]);

    const response = await request(app).get('/api/content/policies/privacy-policy');

    expect(response.status).toBe(200);
    expect(response.body.available).toBe(true);
    expect(response.body.page).toMatchObject({
      slug: 'privacy-policy',
      title: 'Privacy Policy',
      html: '<p>Saved</p>',
    });
  });

  it('only matches the exact tag, not a longer one containing it', async () => {
    jest
      .spyOn(ContentPages, 'findAll')
      .mockResolvedValue([row({ tags: 'old-privacy-policy-draft' })]);

    const response = await request(app).get('/api/content/policies/privacy-policy');

    expect(response.body.available).toBe(false);
  });

  it.each([
    ['no row', []],
    ['a switched-off row', [row({ status: 'inactive' })]],
    ['an empty row', [row({ html: '' })]],
  ])('is not available for %s', async (_label, rows) => {
    jest.spyOn(ContentPages, 'findAll').mockResolvedValue(rows);

    const response = await request(app).get('/api/content/policies/privacy-policy');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ available: false, page: null });
  });

  it('is not available for a slug that is not one of the five', async () => {
    const findAll = jest.spyOn(ContentPages, 'findAll');

    const response = await request(app).get('/api/content/policies/contact-us');

    expect(response.body).toEqual({ available: false, page: null });
    expect(findAll).not.toHaveBeenCalled();
  });
});

describe('admin policy pages', () => {
  it('requires an admin', async () => {
    const response = await request(app).get('/api/admin/content-pages/policies');

    expect(response.status).toBe(401);
  });

  it('lists all five pages, saved or not', async () => {
    jest.spyOn(ContentPages, 'findAll').mockImplementation(async (options) => {
      // `Op.like` is a symbol key, which JSON.stringify would drop.
      const tags = (options?.where as { tags?: Record<symbol, string> })?.tags;
      const pattern = tags ? String(tags[Op.like]) : '';
      return pattern.includes('quality-policy') ? [row({ tags: 'quality-policy' })] : [];
    });

    const response = await request(app)
      .get('/api/admin/content-pages/policies')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(response.status).toBe(200);
    expect(response.body.pages.map((p: { slug: string }) => p.slug)).toEqual([
      'privacy-policy',
      'terms-and-conditions',
      'quality-policy',
      'environmental-policy',
      'health-and-safety',
    ]);
    const saved = response.body.pages.filter((p: { saved: boolean }) => p.saved);
    expect(saved.map((p: { slug: string }) => p.slug)).toEqual(['quality-policy']);
  });

  it('creates the row on first save, tagged with the slug, with the HTML cleaned', async () => {
    jest.spyOn(ContentPages, 'findAll').mockResolvedValue([]);
    const create = jest
      .spyOn(ContentPages, 'create')
      .mockImplementation(async (values) => row({ ...(values as object) }));

    const response = await request(app)
      .put('/api/admin/content-pages/policies/quality-policy')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ html: '<h2>Hi</h2><p onclick="x()">Body<script>alert(1)</script></p>' });

    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledWith({
      title: 'Quality Policy',
      html: '<h2>Hi</h2><p>Body</p>',
      tags: 'quality-policy',
      status: 'active',
    });
  });

  it('updates the existing row and can switch it off', async () => {
    const existing = row({ tags: 'quality-policy' });
    jest.spyOn(ContentPages, 'findAll').mockResolvedValue([existing]);

    const response = await request(app)
      .put('/api/admin/content-pages/policies/quality-policy')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ html: '<p>New</p>', active: false });

    expect(response.status).toBe(200);
    expect(existing.update).toHaveBeenCalledWith({
      html: '<p>New</p>',
      status: 'inactive',
    });
  });

  it('stores nothing for an empty editor, so the website keeps its own wording', async () => {
    jest.spyOn(ContentPages, 'findAll').mockResolvedValue([]);
    const create = jest
      .spyOn(ContentPages, 'create')
      .mockImplementation(async (values) => row({ ...(values as object) }));

    await request(app)
      .put('/api/admin/content-pages/policies/quality-policy')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ html: '<p></p>' });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ html: '' }));
  });

  it('refuses a slug that is not one of the five', async () => {
    const create = jest.spyOn(ContentPages, 'create');

    const response = await request(app)
      .put('/api/admin/content-pages/policies/anything-else')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ html: '<p>x</p>' });

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
