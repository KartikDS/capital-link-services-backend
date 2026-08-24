import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app';
import { issueAccessToken } from '../../src/shared/tokens';
import { resetRateLimits } from '../../src/middleware/rateLimit';

/**
 * The application's own behaviour, without a database.
 *
 * Every route asserted here answers before the model layer is reached — a
 * health probe, a config read, a validation failure, an authorisation refusal.
 * That is deliberate: these are the paths that must keep working when MySQL is
 * unreachable, and mocking a database to test them would prove nothing about
 * that.
 */

let app: Express;

beforeAll(() => {
  app = createApp();
});

beforeEach(() => {
  // Rate-limit buckets are process-wide, so one test's requests would otherwise
  // count against the next one's.
  resetRateLimits();
});

const clientToken = (): string =>
  issueAccessToken({
    sub: 42,
    aud: 'client',
    email: 'client@example.com',
    clientType: 'public',
    sid: 'test-session',
  });

const adminToken = (): string =>
  issueAccessToken({
    sub: 7,
    aud: 'admin',
    email: 'staff@example.com',
    clientType: null,
    sid: 'test-session',
  });

describe('liveness and configuration', () => {
  it('reports liveness without touching the database', async () => {
    // Separate from /api/health on purpose: restarting the process does not fix
    // a database that is down, so a liveness probe must not fail when one is.
    const response = await request(app).get('/api/health/live');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.uptimeSeconds).toBe('number');
  });

  it('publishes the limits a form needs to know', async () => {
    const response = await request(app).get('/api/config/public');

    expect(response.status).toBe(200);
    expect(response.body.config).toMatchObject({
      currency: 'AUD',
      gstRate: 0.1,
      timezone: 'Australia/Sydney',
    });
    expect(response.body.config.uploads.maxMb).toBe(10);
    expect(response.body.config.uploads.allowedExtensions).toContain('.pdf');
  });

  it('answers the root with something useful', async () => {
    const response = await request(app).get('/');

    expect(response.status).toBe(200);
    expect(response.body.docs).toBe('/api-docs');
  });

  it('serves the OpenAPI document', async () => {
    const response = await request(app).get('/api-docs.json');

    expect(response.status).toBe(200);
    expect(response.body.openapi).toBe('3.0.3');
    expect(response.body.info.title).toBe('Capital Link Services API');
  });
});

describe('request identity', () => {
  it('returns a request id', async () => {
    const response = await request(app).get('/api/health/live');
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('honours an inbound id so one trace spans both services', async () => {
    const response = await request(app)
      .get('/api/health/live')
      .set('x-request-id', 'website-abc-123');

    expect(response.headers['x-request-id']).toBe('website-abc-123');
  });

  it('strips an inbound id rather than echoing it back verbatim', async () => {
    // It is caller-controlled and it ends up in log output.
    const response = await request(app)
      .get('/api/health/live')
      .set('x-request-id', 'bad id with spaces');

    expect(response.headers['x-request-id']).toBe('badidwithspaces');
  });
});

describe('the upload pre-flight check', () => {
  it('accepts a file within the limits', async () => {
    const response = await request(app)
      .post('/api/uploads/validate')
      .send({ filename: 'passport.pdf', size: 2_000_000 });

    expect(response.status).toBe(200);
    expect(response.body.acceptable).toBe(true);
    expect(response.body.problems).toEqual([]);
  });

  it('refuses a file that is too large, before it is sent', async () => {
    const response = await request(app)
      .post('/api/uploads/validate')
      .send({ filename: 'scan.pdf', size: 20_000_000 });

    expect(response.body.acceptable).toBe(false);
    expect(response.body.problems[0]).toContain('The limit is 10 MB');
  });

  it('refuses a type we do not accept', async () => {
    const response = await request(app)
      .post('/api/uploads/validate')
      .send({ filename: 'script.php', size: 100 });

    expect(response.body.acceptable).toBe(false);
    expect(response.body.problems[0]).toContain('.php');
  });

  it('refuses a file with no extension', async () => {
    const response = await request(app)
      .post('/api/uploads/validate')
      .send({ filename: 'document', size: 100 });

    expect(response.body.acceptable).toBe(false);
  });

  it('refuses an empty file', async () => {
    const response = await request(app)
      .post('/api/uploads/validate')
      .send({ filename: 'empty.pdf', size: 0 });

    expect(response.body.acceptable).toBe(false);
    expect(response.body.problems).toContain('That file is empty.');
  });
});

describe('authentication', () => {
  it('refuses a portal read with no token', async () => {
    // A 401, never a 200 with an empty body. The previous build's optional-auth
    // portal told a client with eight live jobs that they had none.
    const response = await request(app).get('/api/portal/profile');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('unauthorized');
  });

  it('refuses a malformed authorization header', async () => {
    const response = await request(app)
      .get('/api/portal/profile')
      .set('Authorization', 'Basic abc123');

    expect(response.status).toBe(401);
  });

  it('refuses a token this API did not sign', async () => {
    const response = await request(app)
      .get('/api/portal/profile')
      .set('Authorization', 'Bearer not.a.real.token');

    expect(response.status).toBe(401);
  });

  it('keeps a client token out of the back office', async () => {
    // The audience records which user table the session came from, and
    // tbl_user_client is not tbl_user_admin.
    const response = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${clientToken()}`);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('forbidden');
  });

  it('does not say whether a token was expired or forged', async () => {
    const response = await request(app)
      .get('/api/portal/profile')
      .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.wrong');

    expect(response.status).toBe(401);
    expect(response.body.message).toMatch(/sign in/i);
  });
});

describe('the internal namespace', () => {
  it('refuses a payment record with no secret', async () => {
    const response = await request(app)
      .post('/api/payments/record')
      .send({ transactionId: 'pi_1', reference: 'CLS-000001', amountCents: 100 });

    expect(response.status).toBe(403);
  });

  it('refuses a payment record with the wrong secret', async () => {
    const response = await request(app)
      .post('/api/payments/record')
      .set('x-internal-secret', 'not-the-secret')
      .send({ transactionId: 'pi_1', reference: 'CLS-000001', amountCents: 100 });

    expect(response.status).toBe(403);
  });

  it('does not accept an admin token in place of the secret', async () => {
    // A staff session must not be a route into the server-to-server namespace.
    const response = await request(app)
      .post('/api/payments/record')
      .set('Authorization', `Bearer ${adminToken()}`)
      .send({ transactionId: 'pi_1', reference: 'CLS-000001', amountCents: 100 });

    expect(response.status).toBe(403);
  });

  /**
   * `POST /api/orders/documents` writes a file against whatever order it is given
   * a reference for, with no session behind it — so the secret is the only thing
   * that stands in front of it. It is also the newest of these endpoints and the
   * only one that takes multipart, which is worth its own coverage: `manyFiles`
   * runs before the guard could see a JSON body, so the order of the middleware
   * is load-bearing.
   */
  describe('document uploads from an order form', () => {
    it('refuses an upload with no secret', async () => {
      const response = await request(app)
        .post('/api/orders/documents')
        .field('reference', 'CLS-000001')
        .attach('documents', Buffer.from('%PDF-1.4 test'), 'passport.pdf');

      expect(response.status).toBe(403);
    });

    it('refuses an upload with the wrong secret', async () => {
      const response = await request(app)
        .post('/api/orders/documents')
        .set('x-internal-secret', 'not-the-secret')
        .field('reference', 'CLS-000001')
        .attach('documents', Buffer.from('%PDF-1.4 test'), 'passport.pdf');

      expect(response.status).toBe(403);
    });

    it('does not accept a client token in place of the secret', async () => {
      // The signed-in half of the site uploads through
      // `/api/orders/:reference/documents`, which checks ownership. A bearer token
      // must not be a way past that check into the unowned one.
      const response = await request(app)
        .post('/api/orders/documents')
        .set('Authorization', `Bearer ${clientToken()}`)
        .field('reference', 'CLS-000001')
        .attach('documents', Buffer.from('%PDF-1.4 test'), 'passport.pdf');

      expect(response.status).toBe(403);
    });

    it('refuses an upload with no reference, having read the multipart body', async () => {
      // Proves the middleware order: without `manyFiles` first, the reference
      // field would never reach `req.body` and this would fail for the wrong
      // reason. 400 rather than 403, so the guard has already passed.
      const response = await request(app)
        .post('/api/orders/documents')
        .set('x-internal-secret', 'test-internal-secret')
        .attach('documents', Buffer.from('%PDF-1.4 test'), 'passport.pdf');

      expect(response.status).toBe(400);
    });

    it('refuses a file type the allowlist does not name', async () => {
      const response = await request(app)
        .post('/api/orders/documents')
        .set('x-internal-secret', 'test-internal-secret')
        .field('reference', 'CLS-000001')
        .attach('documents', Buffer.from('#!/bin/sh'), 'payload.sh');

      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/we accept/i);
    });

    it('refuses a file whose extension and contents disagree', async () => {
      // A browser will happily report `application/pdf` for anything, and the
      // extension is what ends up in a `varchar` some other system may hand to a
      // web server.
      const response = await request(app)
        .post('/api/orders/documents')
        .set('x-internal-secret', 'test-internal-secret')
        .field('reference', 'CLS-000001')
        .attach('documents', Buffer.from('<?php ?>'), {
          filename: 'passport.pdf',
          contentType: 'application/x-php',
        });

      expect(response.status).toBe(400);
    });
  });
});

describe('validation', () => {
  it('names the offending field so a form can mark its own input', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'not-an-email', password: 'x' });

    expect(response.status).toBe(400);
    expect(response.body.fields.email).toBe('Enter a valid email address');
  });

  it('reports a missing field rather than treating it as empty', async () => {
    const response = await request(app).post('/api/auth/login').send({});

    expect(response.status).toBe(400);
    expect(Object.keys(response.body.fields)).toEqual(
      expect.arrayContaining(['email', 'password'])
    );
  });

  it('rejects a malformed JSON body with readable wording', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ not json');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('That request body could not be read.');
  });

  it('rejects a reference that is not reference-shaped', async () => {
    const response = await request(app)
      .get('/api/orders/track')
      .query({ reference: '../../etc/passwd', email: 'a@example.com' });

    expect(response.status).toBe(400);
  });

  it('rejects an applicant count beyond what the tables should take', async () => {
    const response = await request(app)
      .post('/api/orders/quote/police-clearance')
      .send({ clearanceId: 1, applicants: 500 });

    expect(response.status).toBe(400);
  });
});

describe('rate limiting', () => {
  it('refuses a burst of sign-in attempts on one account', async () => {
    const attempt = () =>
      request(app)
        .post('/api/auth/login')
        .send({ email: 'target@example.com', password: 'guess' });

    // The limit is 10 per five minutes. These fail at the database before any
    // credential is checked, so the earlier statuses vary — what matters is that
    // the eleventh is refused by the limiter rather than attempted.
    const statuses: number[] = [];
    for (let index = 0; index < 12; index += 1) {
      statuses.push((await attempt()).status);
    }

    expect(statuses).toContain(429);
  });

  it('tells the caller when to come back', async () => {
    for (let index = 0; index < 11; index += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'burst@example.com', password: 'guess' });
    }

    const refused = await request(app)
      .post('/api/auth/login')
      .send({ email: 'burst@example.com', password: 'guess' });

    expect(refused.status).toBe(429);
    expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('keys sign-in on the email, so one account cannot lock out another', async () => {
    for (let index = 0; index < 11; index += 1) {
      await request(app)
        .post('/api/auth/login')
        .send({ email: 'noisy@example.com', password: 'guess' });
    }

    const other = await request(app)
      .post('/api/auth/login')
      .send({ email: 'quiet@example.com', password: 'guess' });

    expect(other.status).not.toBe(429);
  });
});

describe('unknown routes and headers', () => {
  it('answers 404 in the same shape as every other error', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('not_found');
    // Both keys carry the text: the website reads one, other callers the other.
    expect(response.body.error).toBeTruthy();
    expect(response.body.message).toBeTruthy();
  });

  it('does not advertise the framework', async () => {
    const response = await request(app).get('/api/health/live');
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('sets the security headers helmet provides', async () => {
    const response = await request(app).get('/api/health/live');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });
});

/**
 * The literal prefixes under `/api/orders` must stay mounted before `/:reference`.
 *
 * `orderRoutes` mounts `/quote`, `/drafts` and then `/:reference`, and Express
 * matches in registration order. Move `/:reference` above the other two and
 * `/api/orders/drafts` becomes an order lookup for a reference called "drafts" —
 * six endpoints silently unreachable, every one of them answering a plausible-
 * looking 404.
 *
 * Nothing else would catch that. The OpenAPI coverage test would still pass: the
 * routes are all still registered, they are simply shadowed. So the ordering is
 * asserted here, through real requests.
 */
describe('the order routes resolve in the right order', () => {
  it('reaches the drafts endpoint rather than treating "drafts" as a reference', async () => {
    const response = await request(app).get('/api/orders/drafts');

    // 401 is the drafts handler refusing an anonymous caller. A 404 would mean the
    // request had been read as a lookup for an order referenced "drafts".
    expect(response.status).toBe(401);
  });

  it('reaches the quote endpoints rather than treating "quote" as a reference', async () => {
    const response = await request(app)
      .post('/api/orders/quote/police-clearance')
      .send({});

    // 400 is the quote schema rejecting an empty body. A 404 would mean the path
    // had been shadowed.
    expect(response.status).toBe(400);
  });

  it('still reads a real reference through the same prefix', async () => {
    const response = await request(app).get('/api/orders/CLS-100482');

    // Not a 404-from-shadowing: without a token this is an authorisation refusal,
    // which proves the reference route is reachable.
    expect(response.status).toBe(401);
  });
});
