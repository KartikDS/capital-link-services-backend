/**
 * Resolving a traveller's nationality.
 *
 * A nationality is not a country CLS serves. `tbl_countries.disabled` says "do not
 * offer this as a destination", yet resolving a nationality through the destination
 * lookup — which skips disabled rows — dropped the nationality of anyone from
 * Belize, Taiwan or Poland. The two lookups are separate for that reason, and this
 * suite holds the line between them.
 */

const findAll = jest.fn();
const logError = jest.fn();

jest.mock('../../src/models', () => ({
  Countries: { findAll },
}));

jest.mock('../../src/shared/logger', () => ({
  logger: {
    error: logError,
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  nationalityCountryId,
  resetCountryCache,
  resetNationalityCache,
  resolveNationalitySlug,
} from '../../src/domain/countries';

const country = (
  id: number,
  country_name: string,
  country_name_display: string = country_name
) => ({ id, country_name, country_name_display });

/** What `tbl_countries` holds that the destination lookup is allowed to see. */
const ENABLED = [
  country(1, 'United States of America', 'the United States of America'),
  country(2, 'Australia'),
  country(3, 'Czech Republic'),
  country(4, 'South Korea'),
];

/** Rows CLS has switched off as destinations: still nationalities. */
const DISABLED = [
  country(24, 'Belize'),
  country(114, 'Korea'),
  country(141, 'Moldova, Republic of'),
];

beforeEach(() => {
  jest.clearAllMocks();
  resetCountryCache();
  resetNationalityCache();
  // The destination lookup filters `disabled`; the nationality one's second step
  // reads everything.
  findAll.mockImplementation((options?: { where?: unknown }) =>
    Promise.resolve(options?.where ? ENABLED : [...ENABLED, ...DISABLED])
  );
});

describe('resolveNationalitySlug', () => {
  it('resolves a country the destination lookup offers', async () => {
    await expect(resolveNationalitySlug('australia')).resolves.toEqual({
      kind: 'match',
      id: 2,
      name: 'Australia',
    });
  });

  it('resolves a country CLS has disabled as a destination', async () => {
    await expect(resolveNationalitySlug('belize')).resolves.toEqual({
      kind: 'match',
      id: 24,
      name: 'Belize',
    });
  });

  it('bridges the website’s spelling to the table’s', async () => {
    await expect(resolveNationalitySlug('united-states')).resolves.toMatchObject({
      kind: 'match',
      id: 1,
    });
    await expect(resolveNationalitySlug('czechia')).resolves.toMatchObject({
      kind: 'match',
      id: 3,
    });
    await expect(resolveNationalitySlug('moldova')).resolves.toMatchObject({
      kind: 'match',
      id: 141,
    });
  });

  it('keeps the two Koreas apart', async () => {
    await expect(resolveNationalitySlug('south-korea')).resolves.toMatchObject({
      id: 4,
    });
    await expect(resolveNationalitySlug('north-korea')).resolves.toMatchObject({
      id: 114,
    });
  });

  it('says unknown for a country the table does not hold at all', async () => {
    await expect(resolveNationalitySlug('montenegro')).resolves.toEqual({
      kind: 'unknown',
    });
    await expect(resolveNationalitySlug('')).resolves.toEqual({
      kind: 'unknown',
    });
  });

  it('prefers the enabled row when a country has both', async () => {
    findAll.mockImplementation((options?: { where?: unknown }) =>
      Promise.resolve(
        options?.where
          ? [country(2, 'Australia')]
          : [country(2, 'Australia'), country(999, 'Australia')]
      )
    );

    await expect(resolveNationalitySlug('australia')).resolves.toMatchObject({
      kind: 'match',
      id: 2,
    });
  });
});

describe('nationalityCountryId', () => {
  it('records the row the slug names, whatever id the caller sent', async () => {
    await expect(
      nationalityCountryId({ slug: 'belize', id: 5, journey: 'Visa order' })
    ).resolves.toBe(24);
  });

  it('falls back to the caller’s id, and says so, for a slug that matches nothing', async () => {
    await expect(
      nationalityCountryId({ slug: 'montenegro', id: 77, journey: 'Visa order' })
    ).resolves.toBe(77);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it('is null when there is no slug and no id', async () => {
    await expect(
      nationalityCountryId({ slug: '  ', journey: 'Visa order' })
    ).resolves.toBeNull();
    expect(findAll).not.toHaveBeenCalled();
  });
});
