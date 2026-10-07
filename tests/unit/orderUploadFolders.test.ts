import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

/**
 * Where an upload lands, through the real multer engine.
 *
 * A temporary `UPLOAD_DIR` and no bucket, so the whole path is exercised — folder
 * lookup, naming, writing — without touching S3 or a table. What matters:
 *
 * - the file is stored in the folder the lookup names, **never anywhere else**;
 * - a lookup that fails (an order the caller does not own, an unknown reference)
 *   refuses the upload **before a byte is written**;
 * - a request with several files asks for the folder once.
 */

/** The upload middleware, freshly loaded against this directory and no bucket. */
const load = async (root: string) => {
  const overrides: Record<string, string> = {
    UPLOAD_DIR: root,
    S3_BUCKET: '',
    S3_REGION: '',
    S3_ACCESS_KEY_ID: '',
    S3_SECRET_ACCESS_KEY: '',
    S3_PREFIX: '',
  };
  const before = new Map<string, string | undefined>();

  for (const [name, value] of Object.entries(overrides)) {
    before.set(name, process.env[name]);
    process.env[name] = value;
  }

  jest.resetModules();

  const upload = await import('../../src/middleware/upload');
  const documents = await import('../../src/shared/storage/documents');

  for (const [name, value] of before) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  return { ...upload, ...documents };
};

const PDF = Buffer.from('%PDF-1.4 a scanned passport');

/** Every file under `root`, relative, with forward slashes. */
const filesUnder = (root: string, dir = ''): string[] =>
  fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? filesUnder(root, path.posix.join(dir, entry.name))
        : [path.posix.join(dir, entry.name)]
    );

describe('orderDocumentsUpload', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cls-order-folders-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** A tiny app that stores into whatever folder `folderFor` answers with. */
  const appWith = async (folderFor: (req: Request) => Promise<string>) => {
    const { orderDocumentsUpload, storedPathOf } = await load(root);
    const app = express();

    app.post('/orders/:ref/documents', orderDocumentsUpload(folderFor), (req, res) => {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      res.status(201).json({ stored: files.map((file) => storedPathOf(file)) });
    });

    app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
      res.status(403).json({ message: error.message });
    });

    return app;
  };

  it('stores the file in the order’s folder and in no other', async () => {
    const app = await appWith((req) => Promise.resolve(`77/${String(req.params.ref)}`));

    const response = await request(app)
      .post('/orders/1482/documents')
      .attach('documents', PDF, { filename: 'Passport - John.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(201);

    const stored = (response.body.stored as string[])[0] as string;

    // `{clientId}/{orderId}/{timestamp}-{nonce}-{name}` — the name is the same
    // safe, readable one the project has always used.
    expect(stored).toMatch(/^77\/1482\/[0-9]+-[0-9a-f]{12}-passport-john\.pdf$/);
    expect(filesUnder(root)).toEqual([stored]);
    expect(fs.readFileSync(path.join(root, stored))).toEqual(PDF);
  });

  it('parks a guest order’s files in incoming', async () => {
    const app = await appWith((req) => Promise.resolve(`incoming/${String(req.params.ref)}`));

    const response = await request(app)
      .post('/orders/1482/documents')
      .attach('documents', PDF, { filename: 'passport.pdf', contentType: 'application/pdf' });

    expect((response.body.stored as string[])[0]).toMatch(/^incoming\/1482\//);
  });

  it('refuses before storing anything when the folder lookup fails', async () => {
    const app = await appWith(() => Promise.reject(new Error('We could not find an order with that reference.')));

    const response = await request(app)
      .post('/orders/9999/documents')
      .attach('documents', PDF, { filename: 'passport.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/could not find an order/);
    // Nothing on disk — not even an empty directory for the refused order.
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it('asks for the folder once, however many files the request carries', async () => {
    const folderFor = jest.fn(() => Promise.resolve('77/1482'));
    const app = await appWith(folderFor);

    const response = await request(app)
      .post('/orders/1482/documents')
      .attach('documents', PDF, { filename: 'one.pdf', contentType: 'application/pdf' })
      .attach('documents', PDF, { filename: 'two.pdf', contentType: 'application/pdf' })
      .attach('documents', PDF, { filename: 'three.pdf', contentType: 'application/pdf' });

    expect(response.status).toBe(201);
    expect(folderFor).toHaveBeenCalledTimes(1);
    expect(filesUnder(root)).toHaveLength(3);
    expect((response.body.stored as string[]).every((p) => p.startsWith('77/1482/'))).toBe(true);
  });

  it('can read a text field that was sent before the files', async () => {
    // How the order form and the portal name the order: `reference` first, files
    // after. The engine runs while the files arrive, so only an earlier field is
    // on `req.body` by then.
    const seen: unknown[] = [];
    const app = await appWith((req) => {
      seen.push((req.body as { reference?: string }).reference);
      return Promise.resolve('77/1482');
    });

    await request(app)
      .post('/orders/1482/documents')
      .field('reference', 'CLS-001482')
      .attach('documents', PDF, { filename: 'passport.pdf', contentType: 'application/pdf' });

    expect(seen).toEqual(['CLS-001482']);
  });

  it('does not store a disallowed file type', async () => {
    const app = await appWith(() => Promise.resolve('77/1482'));

    const response = await request(app)
      .post('/orders/1482/documents')
      .attach('documents', Buffer.from('<?php ?>'), {
        filename: 'shell.php',
        contentType: 'application/x-php',
      });

    expect(response.status).toBe(403);
    expect(fs.readdirSync(root)).toEqual([]);
  });
});

describe('profilePhotoUpload', () => {
  it('files a client’s photo under {clientId}/profile', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cls-profile-'));

    try {
      const { profilePhotoUpload, storedPathOf } = await load(root);
      const app = express();

      app.post(
        '/photo',
        (req, _res, next) => {
          req.auth = { sub: 42 } as never;
          next();
        },
        profilePhotoUpload,
        (req, res) => {
          res.status(201).json({ stored: storedPathOf(req.file as Express.Multer.File) });
        }
      );

      const response = await request(app)
        .post('/photo')
        .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), {
          filename: 'me.jpg',
          contentType: 'image/jpeg',
        });

      expect(response.status).toBe(201);
      expect(response.body.stored).toMatch(/^42\/profile\/[0-9]+-[0-9a-f]{12}-me\.jpg$/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
