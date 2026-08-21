import {
  clean,
  cleanOr,
  fullName,
  maskEmail,
  maskPassport,
  normaliseEmail,
  repairMojibake,
  stripHtml,
  toBoolean,
  truncate,
} from '../../src/shared/text';

/**
 * Most of this schema is `latin1` and a few tables are `utf8`. Where a UTF-8
 * form post was written into a latin1 column, the bytes were stored as separate
 * characters — so five years of client names contain mojibake, and reading them
 * back has to undo it without breaking the ones that are already correct.
 */

describe('repairMojibake', () => {
  it('repairs UTF-8 that was stored as latin1', () => {
    expect(repairMojibake('CafÃ©')).toBe('Café');
    expect(repairMojibake('MÃ¼ller')).toBe('Müller');
    expect(repairMojibake('BjÃ¶rn')).toBe('Björn');
  });

  it('leaves correct text alone', () => {
    // The guard matters more than the repair: running the round trip on a clean
    // value can corrupt it.
    expect(repairMojibake('Café')).toBe('Café');
    expect(repairMojibake('Müller')).toBe('Müller');
    expect(repairMojibake('Smith')).toBe('Smith');
    expect(repairMojibake('')).toBe('');
  });

  it('leaves a mixed string alone rather than half-decoding it', () => {
    // Any code point above 0xFF was never a latin1 byte, so this string is
    // partly correct already and re-decoding would lose the good half.
    expect(repairMojibake('Café Ã©')).toBe('Café Ã©');
  });
});

describe('clean', () => {
  it('turns the schema’s empty strings into null', () => {
    // These columns are full of `''` where the old application meant "not
    // supplied". Null is what the portal renders its "not recorded" wording for.
    expect(clean('')).toBeNull();
    expect(clean('   ')).toBeNull();
    expect(clean(null)).toBeNull();
    expect(clean(undefined)).toBeNull();
  });

  it('trims and repairs in one pass', () => {
    expect(clean('  CafÃ©  ')).toBe('Café');
  });

  it('stringifies a number, since some columns hold them as text', () => {
    expect(clean(42)).toBe('42');
  });

  it('falls back only when asked', () => {
    expect(cleanOr(null, 'Unknown')).toBe('Unknown');
    expect(cleanOr('Sydney', 'Unknown')).toBe('Sydney');
  });
});

describe('fullName', () => {
  it('joins the parts that are present', () => {
    expect(fullName('Alex', 'Taylor')).toBe('Alex Taylor');
    expect(fullName('Alex', 'J', 'Taylor')).toBe('Alex J Taylor');
  });

  it('does not leave a double space where a middle name was null', () => {
    expect(fullName('Alex', null, 'Taylor')).toBe('Alex Taylor');
    expect(fullName('Alex', '', 'Taylor')).toBe('Alex Taylor');
  });

  it('returns null when nothing was supplied', () => {
    expect(fullName(null, null)).toBeNull();
    expect(fullName('', '  ')).toBeNull();
  });
});

describe('masking', () => {
  it('masks an email down to its first character', () => {
    expect(maskEmail('alex.taylor@example.com')).toBe('a***@example.com');
  });

  it('returns null rather than a broken mask', () => {
    expect(maskEmail('not-an-email')).toBeNull();
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail('@example.com')).toBeNull();
  });

  it('keeps only the last four of a passport number', () => {
    expect(maskPassport('PA1234567')).toBe('*****4567');
    expect(maskPassport('AB12')).toBe('****');
    expect(maskPassport(null)).toBeNull();
  });

  it('lowercases and trims an email for comparison', () => {
    expect(normaliseEmail('  Alex@Example.COM ')).toBe('alex@example.com');
    expect(normaliseEmail('')).toBeNull();
  });
});

describe('stripHtml', () => {
  it('flattens stored CMS markup to text', () => {
    expect(stripHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('removes script and style content, not just the tags', () => {
    // Leaving the body behind would put executable text in a JSON field.
    expect(stripHtml('<script>alert(1)</script>Safe')).toBe('Safe');
    expect(stripHtml('<style>body{}</style>Safe')).toBe('Safe');
  });

  it('decodes the entities the CMS writes', () => {
    expect(stripHtml('Fish &amp; Chips')).toBe('Fish & Chips');
    expect(stripHtml('a&nbsp;b')).toBe('a b');
  });

  it('returns null for empty markup', () => {
    expect(stripHtml('<p></p>')).toBeNull();
    expect(stripHtml(null)).toBeNull();
  });
});

describe('truncate', () => {
  it('breaks on a word where it can', () => {
    expect(truncate('the quick brown fox jumps', 15)).toBe('the quick brown…');
  });

  it('leaves a short string alone', () => {
    expect(truncate('short', 20)).toBe('short');
    expect(truncate(null, 20)).toBeNull();
  });
});

describe('toBoolean', () => {
  it('reads the schema’s integer flags', () => {
    expect(toBoolean(1)).toBe(true);
    expect(toBoolean(0)).toBe(false);
    expect(toBoolean(null)).toBe(false);
  });

  it('treats any non-zero integer as set', () => {
    // Several of these columns are tinyint(1) but hold other small integers.
    expect(toBoolean(2)).toBe(true);
  });

  it('reads the string forms too', () => {
    expect(toBoolean('1')).toBe(true);
    expect(toBoolean('0')).toBe(false);
    expect(toBoolean('yes')).toBe(true);
    expect(toBoolean('no')).toBe(false);
    expect(toBoolean('')).toBe(false);
  });
});
