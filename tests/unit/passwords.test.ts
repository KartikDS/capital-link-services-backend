import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  detectAlgorithm,
  generatePassword,
  hashPassword,
  NEVER_MATCHES,
  newResetPin,
  verifyPassword,
} from '../../src/shared/passwords';

/**
 * `tbl_user_client.password` is `char(100)`, and nothing in the schema records
 * which algorithm produced what is in it. So all the plausible ones have to
 * verify — otherwise five years of clients cannot sign in with the password
 * they already have.
 */

const md5 = (value: string) => crypto.createHash('md5').update(value).digest('hex');
/** What `GlobalModel::passGenerator()` produces: `md5(md5($password))`. */
const md5x2 = (value: string) => md5(md5(value));
const sha1 = (value: string) => crypto.createHash('sha1').update(value).digest('hex');
const sha256 = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');

describe('detectAlgorithm', () => {
  it('identifies each format by its shape', () => {
    expect(detectAlgorithm(bcrypt.hashSync('x', 4))).toBe('bcrypt');
    expect(detectAlgorithm(md5('x'))).toBe('md5');
    expect(detectAlgorithm(sha1('x'))).toBe('sha1');
    expect(detectAlgorithm(sha256('x'))).toBe('sha256');
  });

  it('cannot tell double MD5 from single, and says md5 for both', () => {
    // Both are 32 hex characters. `verifyPassword` settles which by comparing;
    // there is nothing in the stored value to detect.
    expect(detectAlgorithm(md5x2('x'))).toBe('md5');
    expect(detectAlgorithm(md5('x'))).toBe('md5');
  });

  it('reports anything else as unknown rather than guessing', () => {
    expect(detectAlgorithm('plaintext')).toBe('unknown');
    expect(detectAlgorithm('')).toBe('unknown');
    expect(detectAlgorithm('deadbeef')).toBe('unknown');
  });
});

describe('verifyPassword', () => {
  it('verifies a bcrypt hash', async () => {
    const hash = await hashPassword('correct horse battery');
    const result = await verifyPassword('correct horse battery', hash);

    expect(result.valid).toBe(true);
    expect(result.algorithm).toBe('bcrypt');
    // Already the target format, so nothing to upgrade.
    expect(result.needsUpgrade).toBe(false);
  });

  it('verifies the legacy digests and flags them for upgrade', async () => {
    for (const [algorithm, digest] of [
      ['md5', md5('hunter2')],
      ['sha1', sha1('hunter2')],
      ['sha256', sha256('hunter2')],
    ] as const) {
      const result = await verifyPassword('hunter2', digest);

      expect(result.valid).toBe(true);
      expect(result.algorithm).toBe(algorithm);
      expect(result.needsUpgrade).toBe(true);
    }
  });

  it('accepts an uppercase digest, since MySQL comparisons are not case sensitive', async () => {
    const result = await verifyPassword('hunter2', md5('hunter2').toUpperCase());
    expect(result.valid).toBe(true);
  });

  it('rejects a wrong password in every format', async () => {
    expect((await verifyPassword('wrong', md5('hunter2'))).valid).toBe(false);
    expect((await verifyPassword('wrong', sha1('hunter2'))).valid).toBe(false);
    expect((await verifyPassword('wrong', await hashPassword('hunter2'))).valid).toBe(
      false
    );
  });

  it('never treats a null or empty stored hash as a match', async () => {
    // The old application leaves `password` null on accounts an administrator
    // created but nobody activated. Treating that as "no password needed" would
    // open every one of them.
    expect((await verifyPassword('anything', null)).valid).toBe(false);
    expect((await verifyPassword('anything', '')).valid).toBe(false);
    expect((await verifyPassword('anything', '   ')).valid).toBe(false);
  });

  it('never treats an empty submitted password as a match', async () => {
    expect((await verifyPassword('', md5(''))).valid).toBe(false);
  });

  it('rejects a stored value it cannot identify', async () => {
    // A plaintext password in the column must not authenticate by string
    // equality — that would be the one case where storing plaintext works.
    expect((await verifyPassword('hunter2', 'hunter2')).valid).toBe(false);
  });
});

/**
 * The reason the two applications could not share a login.
 *
 * Acme writes `md5(md5($password))` and this API used to verify a single MD5
 * against it. Same shape, different scheme, so every account opened on the Acme
 * site was refused here with "check your email address and password" -- and
 * every account opened here was refused there, because the Acme login compares
 * the hash inside a `WHERE` clause and bcrypt is salted.
 *
 * These are the tests that fail if either half of that regresses.
 */
describe('interoperability with the Acme application', () => {
  it('signs in an account Acme created', async () => {
    // Exactly what passGenerator() would have left in tbl_user_client.password.
    const result = await verifyPassword('hunter2', md5x2('hunter2'));

    expect(result.valid).toBe(true);
    expect(result.algorithm).toBe('md5x2');
    // Verified from the plaintext, so this is the one moment it can be upgraded
    // without sending a reset email.
    expect(result.needsUpgrade).toBe(true);
  });

  it('refuses the wrong password against an Acme hash', async () => {
    expect((await verifyPassword('wrong', md5x2('hunter2'))).valid).toBe(false);
  });

  it('reads a non-ASCII password as UTF-8, the way PHP md5() did', async () => {
    // PHP hashed the raw bytes it was posted, and every Acme template declares
    // charset=utf-8. The latin1 reading of the same password is a different
    // digest, so this asserts which one we agree with -- changing it would lock
    // out every client whose password is not pure ASCII, silently.
    const password = 'café-Straße-2024';
    const asLatin1 = md5(
      crypto.createHash('md5').update(Buffer.from(password, 'latin1')).digest('hex')
    );

    expect((await verifyPassword(password, md5x2(password))).valid).toBe(true);
    expect(asLatin1).not.toBe(md5x2(password));
    expect((await verifyPassword(password, asLatin1)).valid).toBe(false);
  });

  it('still verifies a single MD5, for rows of other provenance', async () => {
    const result = await verifyPassword('hunter2', md5('hunter2'));

    expect(result.valid).toBe(true);
    expect(result.algorithm).toBe('md5');
  });

  it('does not let one scheme vouch for another password', async () => {
    // Trying two schemes must not become "any digest of anything will do".
    expect((await verifyPassword('hunter2', md5('other'))).valid).toBe(false);
    expect((await verifyPassword('hunter2', md5x2('other'))).valid).toBe(false);
  });

  it('emits a hash PHP password_verify can read', async () => {
    const hash = await hashPassword('hunter2');

    // 60 characters, a $2 prefix, then cost, salt and digest. That is the shape
    // GlobalModel::verifyPassword() dispatches on, and PHP crypt() needs the
    // prefix and the length exactly -- a re-encoded or truncated value fails
    // there by returning false rather than by raising anything.
    expect(hash).toHaveLength(60);
    expect(hash).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
  });
});

describe('NEVER_MATCHES', () => {
  it('is a real bcrypt hash, so verifying against it does the bcrypt work', () => {
    // Not decoration. The literal this replaced was 59 characters, which is not
    // a bcrypt hash: it was detected as `unknown` and refused without hashing
    // anything, so "no such account" returned measurably faster than "wrong
    // password". Sign-in uses this precisely to make those two cost the same.
    expect(NEVER_MATCHES).toHaveLength(60);
    expect(detectAlgorithm(NEVER_MATCHES)).toBe('bcrypt');
  });

  it('matches nothing', async () => {
    for (const attempt of ['', 'password', 'hunter2', NEVER_MATCHES]) {
      expect((await verifyPassword(attempt, NEVER_MATCHES)).valid).toBe(false);
    }
  });
});

describe('newResetPin', () => {
  it('fits the char(10) column it is stored in', () => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const pin = newResetPin();
      expect(pin.length).toBeLessThanOrEqual(10);
      expect(pin.length).toBeGreaterThan(0);
    }
  });

  it('does not repeat itself', () => {
    const pins = new Set(Array.from({ length: 200 }, () => newResetPin()));
    // Ten characters is not much entropy, which is why the reset endpoints are
    // rate limited — but it must at least not collide over a small sample.
    expect(pins.size).toBe(200);
  });
});

describe('hashPassword', () => {
  it('always produces bcrypt, whatever the legacy rows hold', async () => {
    expect(detectAlgorithm(await hashPassword('x'))).toBe('bcrypt');
  });

  it('salts, so the same password hashes differently each time', async () => {
    const [first, second] = await Promise.all([
      hashPassword('same'),
      hashPassword('same'),
    ]);

    expect(first).not.toBe(second);
    expect((await verifyPassword('same', first)).valid).toBe(true);
    expect((await verifyPassword('same', second)).valid).toBe(true);
  });
});

/**
 * The password CLS emails to a guest whose account it opened for them.
 *
 * Two competing requirements, and the tests below are the line between them: it
 * has to be strong enough to be the only thing protecting a client's passport
 * scans, and typable enough that somebody reading it off a phone gets it right
 * first time.
 */
describe('generatePassword', () => {
  it('is long enough that the reduced alphabet costs nothing', () => {
    expect(generatePassword()).toHaveLength(14);
  });

  it('omits the characters that get mistyped when read off a screen', () => {
    const sample = Array.from({ length: 200 }, generatePassword).join('');

    // 0/O/o and 1/l/I. A client transcribing a password cannot tell them apart,
    // and a wrong guess reads as "the password you sent me does not work".
    expect(sample).not.toMatch(/[0O o1lI]/);
  });

  it('always carries a digit and a symbol', () => {
    // So a client whose employer enforces a password policy does not have to
    // reset the one CLS has just sent them.
    for (let i = 0; i < 100; i += 1) {
      const password = generatePassword();

      expect(password).toMatch(/[23456789]/);
      expect(password).toMatch(/[!?@#$%&*+=]/);
    }
  });

  it('does not always put the symbol and the digit in the same place', () => {
    // They are generated first and shuffled in. Without the shuffle every
    // password would start "!7", which tells an attacker two positions.
    const firstCharacters = new Set(
      Array.from({ length: 100 }, () => generatePassword()[0])
    );

    expect(firstCharacters.size).toBeGreaterThan(5);
  });

  it('does not repeat', () => {
    const passwords = new Set(Array.from({ length: 500 }, generatePassword));

    expect(passwords.size).toBe(500);
  });

  it('produces something the sign-in path accepts', async () => {
    const password = generatePassword();

    // The round trip that matters: generated here, hashed into the row by the
    // claim, and verified on sign-in by the same function the website calls.
    expect((await verifyPassword(password, await hashPassword(password))).valid).toBe(
      true
    );
  });
});
