import {
  addDays,
  daysSince,
  isPast,
  toDateOnly,
  toIso,
  toLegacyDate,
  toLegacyDateTime,
} from '../../src/shared/dates';

/**
 * The date layer is where this API is most likely to be quietly wrong, so these
 * tests assert the awkward cases rather than the happy path.
 *
 * The legacy columns hold local Sydney wall-clock times with no zone recorded,
 * a `char(10)` holding whatever an operator typed, and MySQL's zero date. Each
 * of those has to come out as either a correct instant or an honest null.
 */

describe('toIso', () => {
  it('reads a legacy DATETIME as Sydney local time, not UTC', () => {
    // 20 August is AEST (+10:00). Ten past ten in Sydney is 00:17 UTC.
    expect(toIso('2026-08-20 10:17:00')).toBe('2026-08-20T00:17:00.000Z');
  });

  it('applies daylight saving where it actually applied', () => {
    // January is AEDT (+11:00), so the same wall clock is an hour earlier in UTC.
    // A hard-coded +10:00 offset would put this at 00:17Z and be wrong for five
    // months of every year.
    expect(toIso('2026-01-20 10:17:00')).toBe('2026-01-19T23:17:00.000Z');
  });

  it('treats MySQL’s zero date as no date', () => {
    expect(toIso('0000-00-00 00:00:00')).toBeNull();
    expect(toIso('0000-00-00')).toBeNull();
  });

  it('returns null for blanks rather than the epoch', () => {
    expect(toIso(null)).toBeNull();
    expect(toIso(undefined)).toBeNull();
    expect(toIso('')).toBeNull();
    expect(toIso('   ')).toBeNull();
  });

  it('reads the char(10) columns an operator typed into', () => {
    // `tbl_orders.date_doc_sent` is char(10) and holds day-first dates.
    expect(toIso('20/08/2026')).toBe('2026-08-19T14:00:00.000Z');
  });

  it('refuses text that is not a date instead of guessing', () => {
    // These are real values in char(10)/char(20) columns.
    expect(toIso('n/a')).toBeNull();
    expect(toIso('TBA')).toBeNull();
    expect(toIso('pending')).toBeNull();
  });

  it('rejects an out-of-range day rather than swapping it for the month', () => {
    // 13 cannot be a month, so `13/20/2026` is not a date read either way round.
    expect(toIso('13/20/2026')).toBeNull();
  });

  it('handles a DATE column with no time', () => {
    expect(toIso('2026-08-20')).toBe('2026-08-19T14:00:00.000Z');
  });
});

describe('toDateOnly', () => {
  it('keeps a calendar day a calendar day', () => {
    // A departure date is a day, not an instant. Converting it to one and back
    // is how it lands on the wrong side of midnight.
    expect(toDateOnly('2026-08-20')).toBe('2026-08-20');
    expect(toDateOnly('2026-08-20 10:17:00')).toBe('2026-08-20');
  });

  it('normalises a day-first date', () => {
    expect(toDateOnly('5/9/2026')).toBe('2026-09-05');
  });

  it('returns null for the zero date and for junk', () => {
    expect(toDateOnly('0000-00-00')).toBeNull();
    expect(toDateOnly('not a date')).toBeNull();
  });
});

describe('toLegacyDateTime', () => {
  it('writes the format the legacy columns hold', () => {
    const written = toLegacyDateTime(new Date('2026-08-20T00:17:00.000Z'));
    expect(written).toBe('2026-08-20 10:17:00');
  });

  it('round-trips through toIso', () => {
    const instant = new Date('2026-06-15T04:30:00.000Z');
    expect(toIso(toLegacyDateTime(instant))).toBe(instant.toISOString());
  });

  it('round-trips across a daylight-saving boundary too', () => {
    const summer = new Date('2026-12-15T04:30:00.000Z');
    expect(toIso(toLegacyDateTime(summer))).toBe(summer.toISOString());
  });

  it('writes a date-only value for the DATE columns', () => {
    expect(toLegacyDate(new Date('2026-08-20T00:17:00.000Z'))).toBe('2026-08-20');
  });
});

describe('daysSince and isPast', () => {
  const now = new Date('2026-08-20T00:00:00.000Z').getTime();

  it('counts whole days', () => {
    expect(daysSince('2026-08-18T00:00:00.000Z', now)).toBe(2);
    expect(daysSince('2026-08-20T00:00:00.000Z', now)).toBe(0);
  });

  it('returns null rather than zero for an absent date', () => {
    // Zero would read as "due today" on an invoice with no due date at all.
    expect(daysSince(null, now)).toBeNull();
  });

  it('treats an absent date as not past', () => {
    expect(isPast(null, now)).toBe(false);
    expect(isPast('2026-08-19T00:00:00.000Z', now)).toBe(true);
    expect(isPast('2026-08-21T00:00:00.000Z', now)).toBe(false);
  });
});

describe('addDays', () => {
  it('adds whole days', () => {
    const from = new Date('2026-08-20T00:00:00.000Z');
    expect(addDays(14, from).toISOString()).toBe('2026-09-03T00:00:00.000Z');
  });
});
