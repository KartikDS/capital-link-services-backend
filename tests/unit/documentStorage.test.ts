import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

/**
 * Where a client's documents go, and how they are read back.
 *
 * The behaviour under test is the seam that let S3 be added without touching what
 * the database records: a stored path — `clients/9210/1755781234-a3f2c1.pdf` — is
 * the same string whether the bytes went to a bucket or to `UPLOAD_DIR`, and the
 * read path tries every place one could be.
 *
 * ## Why every case reloads the module
 *
 * `config/env` validates the environment once, at import, and the storage module
 * decides its driver from the result at import too. That is deliberate — a
 * per-request re-read of the environment is a per-request chance for the answer to
 * change — but it means a test that wants a different configuration has to load a
 * fresh copy rather than mutate one.
 */

/** The storage module, freshly loaded with these variables in force. */
const load = async (overrides: Record<string, string | undefined>) => {
  const before = new Map<string, string | undefined>();

  for (const [name, value] of Object.entries(overrides)) {
    before.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  jest.resetModules();

  const documents = await import('../../src/shared/storage/documents');
  const s3 = await import('../../src/shared/storage/s3');

  // Restored immediately, so one case's bucket is not the next case's default.
  // The module copies already hold their own snapshot of what they read.
  for (const [name, value] of before) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  return { ...documents, ...s3 };
};

/** A stream of `text`, standing in for the one multer hands the storage engine. */
const streamOf = (text: string) => Readable.from([Buffer.from(text, 'utf8')]);

/** Every S3 variable set, which is what turns the bucket driver on. */
const CONFIGURED = {
  S3_BUCKET: 'cls-staging',
  S3_REGION: 'avvc',
  S3_ACCESS_KEY_ID: 'an-access-key-id',
  S3_SECRET_ACCESS_KEY: 'a-secret-access-key',
};

/**
 * The variables the test environment leaves unset — the local driver.
 *
 * Empty strings rather than `undefined`, because `config/env` runs
 * `dotenv.config()` on every load and dotenv fills in whatever is *absent*. A
 * deleted variable would come back as the developer's own bucket, which is both
 * non-deterministic and a real bucket. See the same note in `tests/setupEnv`.
 */
const UNCONFIGURED = {
  S3_BUCKET: '',
  S3_REGION: '',
  S3_ACCESS_KEY_ID: '',
  S3_SECRET_ACCESS_KEY: '',
  S3_PREFIX: '',
};

describe('which driver is in force', () => {
  it('writes to the local disk while the bucket is unconfigured', async () => {
    const storage = await load(UNCONFIGURED);

    expect(storage.documentStorageDriver).toBe('local');
    expect(storage.documentStorageIsRemote).toBe(false);
  });

  /**
   * `s3+local`, not `s3`. A configured bucket does not replace the disk — every
   * upload is written to both, and the name says so.
   */
  it('writes to the bucket and the disk once all four variables are set', async () => {
    const storage = await load(CONFIGURED);

    expect(storage.documentStorageDriver).toBe('s3+local');
    expect(storage.documentStorageIsRemote).toBe(true);
  });

  /**
   * The case worth being explicit about. A bucket name with no secret key cannot
   * store anything, and a driver that switched on for it would fail every upload
   * at the point a client had already handed over their passport scan. Falling
   * back to the disk keeps uploads working, and `/api/system/ready` is what says
   * the bucket is not being used.
   */
  it.each(Object.keys(CONFIGURED))(
    'falls back to the local disk when %s alone is missing',
    async (missing) => {
      const storage = await load({ ...CONFIGURED, [missing]: '' });

      expect(storage.documentStorageDriver).toBe('local');
    }
  );

  it('treats an empty value as unset rather than as a bucket named ""', async () => {
    const storage = await load({ ...CONFIGURED, S3_BUCKET: '   ' });

    expect(storage.documentStorageDriver).toBe('local');
  });
});

describe('the object key a stored path maps to', () => {
  it('is the stored path itself when no prefix is configured', async () => {
    const storage = await load({ ...CONFIGURED, S3_PREFIX: '' });

    expect(storage.objectKey('clients/9210/scan.pdf')).toBe('clients/9210/scan.pdf');
  });

  /**
   * `/cls/documents/` and `cls/documents` have to mean the same prefix, because
   * both are what somebody writes when configuring one. They do not mean the same
   * thing to S3: a leading slash makes an object whose key begins with one, which
   * is a different key and shows in a console as a folder with no name.
   */
  it.each(['cls/documents', '/cls/documents', 'cls/documents/', '/cls/documents/'])(
    'normalises the prefix %p to one trailing slash and no leading one',
    async (prefix) => {
      const storage = await load({ ...CONFIGURED, S3_PREFIX: prefix });

      expect(storage.objectKey('clients/9210/scan.pdf')).toBe(
        'cls/documents/clients/9210/scan.pdf'
      );
    }
  );
});

describe('safeStoredPath', () => {
  /**
   * The whole reason this function exists. `tbl_cls_order_documents.document` is
   * a `varchar` in a schema this API does not own, so its contents are input — and
   * a value used as a path or a key has to be refused rather than mangled into
   * something that might resolve to another client's file.
   */
  it.each([
    '../../etc/passwd',
    'clients/../../../etc/passwd',
    '..\\..\\windows\\system32\\config',
    '/etc/passwd',
    'C:\\Users\\Admin\\scan.pdf',
    'scan\u0000.php.pdf',
    '',
    '   ',
  ])('refuses %p', async (value) => {
    const storage = await load(UNCONFIGURED);

    expect(storage.safeStoredPath(value)).toBeNull();
  });

  it('keeps an ordinary stored path exactly as recorded', async () => {
    const storage = await load(UNCONFIGURED);

    expect(storage.safeStoredPath('clients/9210/1755781234-a3f2c1-passport.pdf')).toBe(
      'clients/9210/1755781234-a3f2c1-passport.pdf'
    );
  });

  /**
   * `..dossier` is not a traversal, and a client whose file is called that should
   * be able to download it. The check is on `..` as a whole segment rather than as
   * a substring for exactly this reason.
   */
  it('does not mistake a name that merely starts with dots for a traversal', async () => {
    const storage = await load(UNCONFIGURED);

    expect(storage.safeStoredPath('clients/9210/..dossier.pdf')).toBe(
      'clients/9210/..dossier.pdf'
    );
  });
});

describe('storedPathOf', () => {
  it('takes the key the storage engine set, whichever driver wrote it', async () => {
    const storage = await load(CONFIGURED);

    const file = {
      key: 'clients/9210/1755781234-a3f2c1-passport.pdf',
      path: 'clients/9210/1755781234-a3f2c1-passport.pdf',
    } as unknown as Express.Multer.File;

    expect(storage.storedPathOf(file)).toBe(
      'clients/9210/1755781234-a3f2c1-passport.pdf'
    );
  });

  /**
   * The fallback, which is what the older suites rely on: a file-shaped object
   * with an absolute `path` and no `key`, relativised against `UPLOAD_DIR` and
   * turned into forward slashes so the same value comes out on Windows.
   */
  it('relativises an absolute disk path when there is no key', async () => {
    const storage = await load(UNCONFIGURED);

    const file = {
      path: path.join(process.cwd(), 'uploads', 'unassigned', 'scan.pdf'),
    } as unknown as Express.Multer.File;

    expect(storage.storedPathOf(file)).toBe('unassigned/scan.pdf');
  });
});

/**
 * Writing and reading a real file, on the local driver.
 *
 * Against a temporary `UPLOAD_DIR` rather than the repository's own `uploads/`,
 * so a test run leaves nothing behind and cannot read a document a developer
 * happens to have uploaded locally.
 *
 * The bucket driver is not exercised here for the obvious reason — it would need
 * a bucket — and the seam is drawn so that the part worth testing without one is
 * the part above: which driver is chosen, and what key a stored path maps to.
 */
describe('the local driver, end to end', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cls-documents-'));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  const localStorage = () => load({ ...UNCONFIGURED, UPLOAD_DIR: root });

  it('creates the client directory, writes the file and counts the bytes', async () => {
    const storage = await localStorage();
    const body = 'a scanned passport, for the sake of argument';

    const saved = await storage.saveDocument({
      storedPath: 'clients/9210/1755781234-a3f2c1-passport.pdf',
      stream: streamOf(body),
      contentType: 'application/pdf',
    });

    expect(saved.bytes).toBe(Buffer.byteLength(body));
    expect(saved.copies).toEqual(['local']);
    expect(saved.absolutePath).toBe(
      path.join(root, 'clients', '9210', '1755781234-a3f2c1-passport.pdf')
    );
    expect(fs.readFileSync(saved.absolutePath as string, 'utf8')).toBe(body);
  });

  it('reads the file back with its size and the type its name implies', async () => {
    const storage = await localStorage();
    const stored = 'clients/9210/1755781234-a3f2c1-passport.pdf';
    const body = 'a scanned passport';

    await storage.saveDocument({
      storedPath: stored,
      stream: streamOf(body),
      contentType: 'application/pdf',
    });

    const opened = await storage.openDocument(stored);

    expect(opened).not.toBeNull();
    expect(opened?.from).toBe('local');
    // One entry, because there is one copy — and one entry per place is the rule
    // even when a place is reachable more than one way.
    expect(opened?.copies).toEqual(['local']);
    expect(opened?.bytes).toBe(Buffer.byteLength(body));
    expect(opened?.contentType).toBe('application/pdf');

    const chunks: Buffer[] = [];
    for await (const chunk of opened!.stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString('utf8')).toBe(body);
  });

  /**
   * The case the portal turns into "we hold a record of that document but not the
   * file itself" — a row whose file is not where it says. Null rather than a
   * throw, because the caller has a better sentence for it than a stack trace.
   */
  it('answers null for a row whose file is not there', async () => {
    const storage = await localStorage();

    expect(await storage.openDocument('clients/9210/never-written.pdf')).toBeNull();
  });

  it('answers null for a stored path that tries to escape the root', async () => {
    const storage = await localStorage();

    expect(await storage.openDocument('../../etc/passwd')).toBeNull();
  });

  it('locates the one copy it wrote, and nothing before it wrote it', async () => {
    const storage = await localStorage();
    const stored = 'unassigned/1755781234-a3f2c1-scan.pdf';

    expect(await storage.locateDocument(stored)).toEqual([]);

    await storage.saveDocument({
      storedPath: stored,
      stream: streamOf('x'),
      contentType: 'application/pdf',
    });

    expect(await storage.locateDocument(stored)).toEqual(['local']);
  });

  /**
   * The de-duplication, on the configuration that actually provokes it.
   *
   * Pointing `LEGACY_UPLOAD_DIR` at `UPLOAD_DIR` is a natural thing to try, and
   * every file then resolves under both roots. It is still one file: listing it
   * twice would have the download route serve it twice over and
   * `discardDocument` delete the same path twice, logging a failure for the
   * second attempt.
   */
  it('counts a file reachable through two roots as one copy', async () => {
    const storage = await load({
      ...UNCONFIGURED,
      UPLOAD_DIR: root,
      LEGACY_UPLOAD_DIR: root,
    });

    const stored = 'unassigned/1755781234-a3f2c1-scan.pdf';

    await storage.saveDocument({
      storedPath: stored,
      stream: streamOf('x'),
      contentType: 'application/pdf',
    });

    expect(await storage.locateDocument(stored)).toEqual(['local']);

    const opened = await storage.openDocument(stored);
    expect(opened?.copies).toEqual(['local']);

    // Destroyed rather than left: `openDocument` hands back an open read stream,
    // and one still waiting to open its file when `afterEach` removes the
    // directory emits an unhandled ENOENT that lands on whichever test is running
    // by then. The download route destroys it on the response's `close`.
    opened?.stream.destroy();
  });

  it('discards an abandoned upload, and says nothing when there is none', async () => {
    const storage = await localStorage();
    const stored = 'unassigned/1755781234-a3f2c1-too-big.pdf';

    const saved = await storage.saveDocument({
      storedPath: stored,
      stream: streamOf('most of a file'),
      contentType: 'application/pdf',
    });

    expect(saved.copies).toEqual(['local']);

    await storage.discardDocument(stored);

    expect(await storage.locateDocument(stored)).toEqual([]);

    // A second discard is what multer does when a request fails twice over. It
    // must not throw: the response it would fail is already an error response.
    await expect(storage.discardDocument(stored)).resolves.toBeUndefined();
  });
});

/**
 * The bucket and the disk together, which is the behaviour the split exists for.
 *
 * A local HTTP server stands in for the bucket: `S3_ENDPOINT` points at it, so the
 * SDK signs and sends real PUT/HEAD/GET/DELETE requests and these tests can see
 * exactly which keys they carried. That is worth the twenty lines — the
 * interesting cases here are the ones where *one* of the two sinks fails, and
 * nothing short of a real request-response can produce them.
 *
 * **The `error` log lines this block prints are the assertion passing.** Three of
 * these cases make a sink fail on purpose, and `saveDocument` is supposed to say
 * so loudly — a document stored in one place instead of two is the failure nothing
 * else reports.
 */
describe('the bucket and the disk together', () => {
  /** Object bodies, keyed by request path — the stand-in's whole storage. */
  let held: Map<string, Buffer>;
  let seen: { method: string; key: string }[];
  let bucket: http.Server;
  let endpoint: string;
  let root: string;

  /** When set, every request is answered with this status instead. */
  let refuseWith: number | null;

  beforeEach(async () => {
    held = new Map();
    seen = [];
    refuseWith = null;
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cls-both-'));

    bucket = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        // The SDK appends `?x-id=…`; the key is the path alone.
        const key = (req.url ?? '').split('?')[0] ?? '';
        seen.push({ method: req.method ?? '', key });

        if (refuseWith !== null) {
          res.writeHead(refuseWith);
          res.end();
          return;
        }

        if (req.method === 'PUT') {
          held.set(key, Buffer.concat(chunks));
          res.writeHead(200, { ETag: '"stand-in"' });
          res.end();
          return;
        }

        const body = held.get(key);

        if (!body) {
          res.writeHead(404, { 'Content-Type': 'application/xml' });
          res.end('<Error><Code>NoSuchKey</Code></Error>');
          return;
        }

        if (req.method === 'DELETE') {
          held.delete(key);
          res.writeHead(204);
          res.end();
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'application/pdf',
          'Content-Length': String(body.length),
        });
        // A HEAD carries the headers and no body.
        res.end(req.method === 'HEAD' ? undefined : body);
      });
    });

    await new Promise<void>((resolve) => bucket.listen(0, '127.0.0.1', resolve));
    endpoint = `http://127.0.0.1:${(bucket.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => bucket.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  });

  const bothDrivers = (uploadDir = root) =>
    load({
      ...CONFIGURED,
      S3_ENDPOINT: endpoint,
      S3_FORCE_PATH_STYLE: 'true',
      S3_PREFIX: 'documents',
      UPLOAD_DIR: uploadDir,
    });

  const STORED = 'clients/9210/1755781234-a3f2c1-passport.pdf';
  const KEY = `/cls-staging/documents/${STORED}`;
  const BODY = 'a scanned passport, for the sake of argument';

  it('writes the same bytes to the bucket and to the disk', async () => {
    const storage = await bothDrivers();

    const saved = await storage.saveDocument({
      storedPath: STORED,
      stream: streamOf(BODY),
      contentType: 'application/pdf',
    });

    expect(saved.copies).toEqual(['s3', 'local']);
    expect(saved.bytes).toBe(Buffer.byteLength(BODY));

    // The bucket's copy, under the prefix.
    expect(held.get(KEY)?.toString('utf8')).toBe(BODY);
    // And the local one, at the same relative path.
    expect(fs.readFileSync(path.join(root, ...STORED.split('/')), 'utf8')).toBe(BODY);
  });

  /**
   * The de-duplication the whole read path turns on: two copies, one document.
   * `locateDocument` names each place once, and `openDocument` returns a single
   * stream — the bucket's, per the precedence — rather than one per copy.
   */
  it('lists two copies once each and serves exactly one of them', async () => {
    const storage = await bothDrivers();

    await storage.saveDocument({
      storedPath: STORED,
      stream: streamOf(BODY),
      contentType: 'application/pdf',
    });

    expect(await storage.locateDocument(STORED)).toEqual(['s3', 'local']);

    const opened = await storage.openDocument(STORED);

    expect(opened?.from).toBe('s3');
    expect(opened?.copies).toEqual(['s3', 'local']);

    const chunks: Buffer[] = [];
    for await (const chunk of opened!.stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString('utf8')).toBe(BODY);
  });

  /**
   * A bucket outage must not throw away a scan that is already safely on disk.
   * The client is told their document was stored, because it was.
   */
  it('still stores the document when the bucket refuses it', async () => {
    const storage = await bothDrivers();
    refuseWith = 503;

    const saved = await storage.saveDocument({
      storedPath: STORED,
      stream: streamOf(BODY),
      contentType: 'application/pdf',
    });

    expect(saved.copies).toEqual(['local']);
    expect(saved.absolutePath).toBe(path.join(root, ...STORED.split('/')));
    expect(fs.readFileSync(saved.absolutePath as string, 'utf8')).toBe(BODY);
  }, 20_000);

  /**
   * And the other direction, which is the one a hardened deployment hits: a
   * read-only or unwritable `UPLOAD_DIR` must not break uploads on a deployment
   * whose bucket works perfectly.
   *
   * Provoked by pointing `UPLOAD_DIR` at a *file*, so `mkdir` under it fails — the
   * portable way to make a directory that cannot be created.
   */
  it('still stores the document when the disk cannot take it', async () => {
    const notADirectory = path.join(root, 'this-is-a-file');
    fs.writeFileSync(notADirectory, 'not a directory');

    const storage = await bothDrivers(notADirectory);

    const saved = await storage.saveDocument({
      storedPath: STORED,
      stream: streamOf(BODY),
      contentType: 'application/pdf',
    });

    expect(saved.copies).toEqual(['s3']);
    // Null, so nothing downstream believes there is a local file to unlink.
    expect(saved.absolutePath).toBeNull();
    expect(held.get(KEY)?.toString('utf8')).toBe(BODY);
  });

  /** Neither sink taking the bytes is the one case that fails the upload. */
  it('throws when neither the bucket nor the disk will take it', async () => {
    const notADirectory = path.join(root, 'this-is-a-file');
    fs.writeFileSync(notADirectory, 'not a directory');

    const storage = await bothDrivers(notADirectory);
    refuseWith = 503;

    await expect(
      storage.saveDocument({
        storedPath: STORED,
        stream: streamOf(BODY),
        contentType: 'application/pdf',
      })
    ).rejects.toThrow();
  }, 20_000);

  /**
   * A mirror that failed leaves one copy, and the read has to find it. This is
   * also the switch-over case: every document uploaded before the bucket existed
   * is exactly this shape.
   */
  it('reads the surviving copy when only the disk has it', async () => {
    const storage = await bothDrivers();
    refuseWith = 503;

    await storage.saveDocument({
      storedPath: STORED,
      stream: streamOf(BODY),
      contentType: 'application/pdf',
    });

    refuseWith = null;

    expect(await storage.locateDocument(STORED)).toEqual(['local']);

    const opened = await storage.openDocument(STORED);
    expect(opened?.from).toBe('local');
    expect(opened?.copies).toEqual(['local']);

    opened?.stream.destroy();
  }, 20_000);

  /**
   * Both copies, or the read path goes on serving the survivor — which is exactly
   * what an abandoned upload must not do.
   */
  it('discards both copies of an abandoned upload', async () => {
    const storage = await bothDrivers();

    await storage.saveDocument({
      storedPath: STORED,
      stream: streamOf(BODY),
      contentType: 'application/pdf',
    });

    expect(await storage.locateDocument(STORED)).toEqual(['s3', 'local']);

    await storage.discardDocument(STORED);

    expect(await storage.locateDocument(STORED)).toEqual([]);
    expect(held.has(KEY)).toBe(false);
    expect(fs.existsSync(path.join(root, ...STORED.split('/')))).toBe(false);
    expect(seen.some((entry) => entry.method === 'DELETE' && entry.key === KEY)).toBe(
      true
    );
  });
});
