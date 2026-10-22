/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/unbound-method -- jest stubs for async model calls */
import request from 'supertest';
import { Op } from 'sequelize';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { issueAccessToken } from '../../src/shared/tokens';
import { resetRateLimits } from '../../src/middleware/rateLimit';
import { GeneralSettings } from '../../src/models';
import { LEGACY_SETTING_MAX_ID } from '../../src/domain/generalSettings';

/**
 * The seven settings the old application left behind are hidden from the new
 * back office and the public settings read, never deleted. The model layer is
 * stubbed; what is asserted is the filter every query carries.
 */

let app: Express;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  resetRateLimits();
  jest.restoreAllMocks();
});

const adminToken = (): string =>
  issueAccessToken({
    sub: 7,
    aud: 'admin',
    email: 'staff@example.com',
    clientType: null,
    sid: 'test-session',
  });

const auth = () => ({ Authorization: `Bearer ${adminToken()}` });

const setting = (over: Partial<Record<string, unknown>> = {}) =>
  ({
    id: 12,
    title: 'Opening hours',
    slug: 'OPENING_HOURS',
    field_type: '1',
    value: '9 to 5',
    status: null,
    created: '2026-10-22 10:00:00',
    updated: '2026-10-22 10:00:00',
    destroy: jest.fn(async () => undefined),
    update: jest.fn(),
    ...over,
  }) as unknown as GeneralSettings;

/** The `where` a stubbed call received, as the `id` condition it carries. */
const idCondition = (where: unknown): unknown => {
  const w = where as Record<symbol | string, unknown>;
  const and = w[Op.and as unknown as string] as unknown[] | undefined;
  const fragments = and ?? [w];
  const withId = fragments.find(
    (part) => (part as { id?: unknown }).id !== undefined
  ) as { id: unknown } | undefined;
  return withId?.id;
};

describe('GET /api/admin/general-settings', () => {
  it('leaves the legacy rows out of the list', async () => {
    const spy = jest
      .spyOn(GeneralSettings, 'findAndCountAll')
      .mockResolvedValue({ rows: [], count: 0 } as never);

    const response = await request(app)
      .get('/api/admin/general-settings')
      .set(auth());

    expect(response.status).toBe(200);
    const where = spy.mock.calls[0]?.[0]?.where as { id: Record<symbol, number> };
    expect(where.id[Op.gt]).toBe(LEGACY_SETTING_MAX_ID);
  });

  it('keeps the legacy filter when a search is applied', async () => {
    const spy = jest
      .spyOn(GeneralSettings, 'findAndCountAll')
      .mockResolvedValue({ rows: [], count: 0 } as never);

    await request(app).get('/api/admin/general-settings?search=hours').set(auth());

    const where = spy.mock.calls[0]?.[0]?.where as Record<symbol | string, unknown>;
    expect((where.id as Record<symbol, number>)[Op.gt]).toBe(LEGACY_SETTING_MAX_ID);
    expect(where[Op.or as unknown as string]).toBeDefined();
  });
});

describe('a single setting', () => {
  it('cannot be fetched, edited or deleted by guessing a legacy id', async () => {
    const find = jest.spyOn(GeneralSettings, 'findOne').mockResolvedValue(null);

    const get = await request(app).get('/api/admin/general-settings/1').set(auth());
    const patch = await request(app)
      .patch('/api/admin/general-settings/1')
      .set(auth())
      .send({ title: 'Changed' });
    const del = await request(app).delete('/api/admin/general-settings/1').set(auth());

    expect([get.status, patch.status, del.status]).toEqual([404, 404, 404]);
    for (const call of find.mock.calls) {
      const id = idCondition(call[0]?.where);
      expect(id).toBe(1);
      const where = call[0]?.where as Record<symbol, unknown[]>;
      const fragments = where[Op.and as unknown as symbol] as {
        id: Record<symbol, number>;
      }[];
      expect(fragments[1]?.id[Op.gt]).toBe(LEGACY_SETTING_MAX_ID);
    }
  });

  it('is found when it was created from the new back office', async () => {
    jest.spyOn(GeneralSettings, 'findOne').mockResolvedValue(setting());

    const response = await request(app).get('/api/admin/general-settings/12').set(auth());

    expect(response.status).toBe(200);
    expect(response.body.setting).toMatchObject({ slug: 'OPENING_HOURS' });
  });
});

describe('GET /api/content/settings', () => {
  it('does not serve the legacy rows either', async () => {
    const spy = jest.spyOn(GeneralSettings, 'findAll').mockResolvedValue([setting()]);

    const response = await request(app).get('/api/content/settings');

    expect(response.status).toBe(200);
    expect(response.body.settings).toEqual({ OPENING_HOURS: '9 to 5' });
    const where = spy.mock.calls[0]?.[0]?.where as {
      status: number;
      id: Record<symbol, number>;
    };
    expect(where.status).toBe(1);
    expect(where.id[Op.gt]).toBe(LEGACY_SETTING_MAX_ID);
  });
});
