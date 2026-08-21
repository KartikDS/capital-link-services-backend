import {
  GST_RATE,
  centsToLegacyString,
  centsToNumber,
  formatAud,
  gstCents,
  sumCents,
  toCents,
  toCentsOrZero,
  withGst,
} from '../../src/shared/money';

/**
 * The money columns in this schema are `double`, `varchar(255)` and
 * `float(10,2)`, sometimes for the same figure. Five years of a web form writing
 * into a string column means the varchar ones hold anything.
 *
 * These tests are the rate card for that mess: every shape that is actually in
 * the database, and what it has to become.
 */

describe('toCents', () => {
  it('reads the clean cases', () => {
    expect(toCents(450)).toBe(45_000);
    expect(toCents('450')).toBe(45_000);
    expect(toCents('450.00')).toBe(45_000);
    expect(toCents(450.5)).toBe(45_050);
  });

  it('strips the currency noise real rows contain', () => {
    expect(toCents('$450.00')).toBe(45_000);
    expect(toCents('1,250.00')).toBe(125_000);
    expect(toCents('$1,250.00')).toBe(125_000);
    expect(toCents('450.00 AUD')).toBe(45_000);
    expect(toCents('A$450')).toBe(45_000);
    expect(toCents(' 450 ')).toBe(45_000);
  });

  it('returns null for a column holding words, not zero', () => {
    // These are real values in the varchar fee columns. Zero would put a free
    // order in front of a client.
    expect(toCents('TBA')).toBeNull();
    expect(toCents('POA')).toBeNull();
    expect(toCents('on request')).toBeNull();
    expect(toCents('')).toBeNull();
    expect(toCents(null)).toBeNull();
    expect(toCents(undefined)).toBeNull();
  });

  it('distinguishes a recorded zero from no figure at all', () => {
    // `'0'` means somebody set it to nothing; null means nobody set it. The
    // first is free, the second is quote-required.
    expect(toCents('0')).toBe(0);
    expect(toCents('0.00')).toBe(0);
    expect(toCents(null)).toBeNull();
  });

  it('refuses a value that would overflow a safe integer', () => {
    expect(toCents('1e21')).toBeNull();
  });

  it('rounds to the nearest cent rather than truncating', () => {
    expect(toCents(10.005)).toBe(1001);
    expect(toCents('99.999')).toBe(10_000);
  });

  it('treats an unreadable value as zero only when asked to', () => {
    expect(toCentsOrZero('TBA')).toBe(0);
    expect(toCentsOrZero(null)).toBe(0);
    expect(toCentsOrZero('12.50')).toBe(1250);
  });
});

describe('sumCents', () => {
  it('ignores the entries that hold no figure', () => {
    expect(sumCents(['100.00', null, 'TBA', '50.50'])).toBe(15_050);
  });

  it('sums an empty set to zero', () => {
    expect(sumCents([])).toBe(0);
  });
});

describe('gst', () => {
  it('uses the Australian rate', () => {
    expect(GST_RATE).toBe(0.1);
  });

  it('rounds once, on the subtotal', () => {
    // Three lines of 33.33 come to 99.99, and ten per cent of that is 10.00 —
    // 9.999 rounded once. Rounding each line first gives 3 × 3.33 = 9.99, a cent
    // short, and then the invoice and the card charge disagree.
    const subtotal = 9_999;
    expect(gstCents(subtotal)).toBe(1_000);

    const perLine = 3 * Math.round(3_333 * 0.1);
    expect(perLine).not.toBe(gstCents(subtotal));
  });

  it('keeps the breakdown internally consistent', () => {
    const money = withGst(45_000);
    expect(money.subtotalCents).toBe(45_000);
    expect(money.gstCents).toBe(4_500);
    expect(money.totalCents).toBe(49_500);
    expect(money.subtotalCents + money.gstCents).toBe(money.totalCents);
  });
});

describe('writing back', () => {
  it('writes the format the legacy varchar columns already use', () => {
    expect(centsToLegacyString(45_000)).toBe('450.00');
    expect(centsToLegacyString(1250)).toBe('12.50');
    expect(centsToLegacyString(0)).toBe('0.00');
  });

  it('passes null through rather than writing a zero', () => {
    expect(centsToLegacyString(null)).toBeNull();
    expect(centsToNumber(null)).toBeNull();
  });

  it('writes a number for the double columns', () => {
    expect(centsToNumber(45_000)).toBe(450);
    expect(centsToNumber(1250)).toBe(12.5);
  });

  it('survives a round trip', () => {
    for (const cents of [0, 1, 99, 100, 1250, 45_000, 999_999]) {
      expect(toCents(centsToLegacyString(cents))).toBe(cents);
      expect(toCents(centsToNumber(cents))).toBe(cents);
    }
  });
});

describe('formatAud', () => {
  it('formats for an email or a printed invoice', () => {
    expect(formatAud(45_000)).toBe('A$450.00');
    expect(formatAud(0)).toBe('A$0.00');
  });

  it('returns null for no figure, so the caller words it themselves', () => {
    expect(formatAud(null)).toBeNull();
  });
});
