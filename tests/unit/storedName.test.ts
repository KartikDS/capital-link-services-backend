import path from 'node:path';
import {
  resolveUploadPath,
  slugForPath,
  storedName,
} from '../../src/middleware/upload';

/**
 * The name an uploaded file is stored under.
 *
 * Two jobs, and they pull against each other. It has to be **safe** — it goes
 * into a path, and it came from a browser, so it can contain `../`, a null byte
 * or four hundred characters of Unicode. And it has to be **readable**, because
 * `tbl_cls_order_documents` has no original-name column: the stored name is the
 * only name the portal's documents screen and CLS's own admin can show. A list of
 * `1755781234-a3f2c1.pdf` meant a client had to download all four files to find
 * their passport.
 *
 * The resolution is an allowlist rather than an escape: the timestamp and nonce
 * lead, so uniqueness never depends on anything the browser said, and a slug of
 * the client's name follows for legibility.
 */

describe('slugForPath', () => {
  it('keeps a name a person can recognise', () => {
    expect(slugForPath('Passport - John Smith.pdf')).toBe('passport-john-smith');
  });

  it('drops the extension, which the caller adds back separately', () => {
    expect(slugForPath('birth-certificate.PDF')).toBe('birth-certificate');
  });

  it('strips every path separator and traversal', () => {
    for (const name of [
      '../../etc/passwd.pdf',
      '..\\..\\windows\\system32\\config.pdf',
      '/absolute/path/scan.pdf',
      'C:\\Users\\Admin\\scan.pdf',
    ]) {
      const slug = slugForPath(name);

      expect(slug).not.toContain('/');
      expect(slug).not.toContain('\\');
      expect(slug).not.toContain('..');
      expect(slug).toMatch(/^[a-z0-9-]*$/);
    }
  });

  it('strips a null byte', () => {
    // A null in a path truncates it in some C libraries, which is how a `.pdf`
    // becomes a `.php` on the way to a filesystem.
    expect(slugForPath('scan\u0000.php.pdf')).toMatch(/^[a-z0-9-]*$/);
  });

  it('is empty rather than partial for a name with nothing to keep', () => {
    // A Chinese or Cyrillic filename slugs to nothing, and that is the ordinary
    // case for a phone photo — not an error.
    expect(slugForPath('照片.jpg')).toBe('');
    expect(slugForPath('___.pdf')).toBe('');
  });

  it('caps a long name without leaving a trailing dash', () => {
    const slug = slugForPath(`${'a b '.repeat(60)}.pdf`);

    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).not.toMatch(/-$/);
  });
});

describe('storedName', () => {
  it('leads with the timestamp and nonce, then the client’s own name', () => {
    expect(storedName('Passport - John.pdf')).toMatch(
      /^\d+-[0-9a-f]{12}-passport-john\.pdf$/
    );
  });

  it('lower-cases the extension, because the column is read by other systems', () => {
    expect(storedName('scan.PDF')).toMatch(/\.pdf$/);
  });

  it('drops the slug segment entirely rather than leaving a stray dash', () => {
    expect(storedName('照片.jpg')).toMatch(/^\d+-[0-9a-f]{12}\.jpg$/);
  });

  it('does not collide for two files with the same name', () => {
    const names = new Set(
      Array.from({ length: 50 }, () => storedName('passport.pdf'))
    );

    // Uniqueness comes from the nonce, not from the part the browser supplied —
    // two clients uploading `passport.pdf` in the same millisecond is ordinary.
    expect(names.size).toBe(50);
  });

  it('fits the varchar(255) the column is', () => {
    expect(storedName(`${'long name '.repeat(40)}.pdf`).length).toBeLessThan(120);
  });

  it('never produces a name that escapes the upload root', () => {
    const root = path.resolve('/tmp/uploads');

    for (const name of [
      '../../etc/passwd.pdf',
      '..\\..\\secrets.pdf',
      '/etc/shadow.pdf',
    ]) {
      const stored = storedName(name);

      // The real guarantee, stated where it is enforced: whatever the browser
      // called the file, the stored name resolves inside the root.
      expect(resolveUploadPath(stored, root)).not.toBeNull();
      expect(path.basename(stored)).toBe(stored);
    }
  });
});
