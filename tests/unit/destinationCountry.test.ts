/**
 * Resolving an order's destination, and refusing to guess at it.
 *
 * This suite is a regression from a real order in CLS's admin: a corporate visa
 * order placed for **Saudi Arabia** was displayed as **Canada**. Nothing had gone
 * wrong in the request — the website resolved its slug to an integer against the
 * country list it had, posted the integer, and the API wrote it down. The integer
 * simply named a different row in the database that read it back.
 *
 * So the country an order records is resolved from the slug, here, against the
 * connection the order is written on. Where the website's id and the slug
 * disagree the slug wins — it is the answer read from the database that will
 * render the order back — and the disagreement is logged as the drift it is.
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
  destinationCountryId,
  resolveCountrySlug,
} from '../../src/domain/countries';

/** The shape `resolveCountrySlug` reads: id, name, display name. */
const country = (
  id: number,
  country_name: string | null,
  country_name_display: string | null = country_name
) => ({ id, country_name, country_name_display });

/** The two rows the reported order sat between. */
const REAL_LIST = [
  country(2, 'Canada'),
  country(185, 'Saudi Arabia'),
];

beforeEach(() => {
  jest.clearAllMocks();
  findAll.mockResolvedValue(REAL_LIST);
});

describe('resolveCountrySlug', () => {
  it('matches on the name the published slug is derived from', async () => {
    await expect(resolveCountrySlug('saudi-arabia')).resolves.toEqual({
      kind: 'match',
      id: 185,
      name: 'Saudi Arabia',
    });
  });

  it('matches a display name only when no country_name answers', async () => {
    findAll.mockResolvedValue([
      country(41, 'Korea, Republic of', 'South Korea'),
      country(42, 'Korea, Democratic People’s Republic of', 'North Korea'),
    ]);

    await expect(resolveCountrySlug('south-korea')).resolves.toEqual({
      kind: 'match',
      id: 41,
      name: 'Korea, Republic of',
    });
  });

  it('reports a slug two rows answer to rather than picking one', async () => {
    findAll.mockResolvedValue([
      country(60, 'Congo'),
      country(61, 'Congo!'),
    ]);

    await expect(resolveCountrySlug('congo')).resolves.toEqual({
      kind: 'ambiguous',
      ids: [60, 61],
    });
  });

  it('reports a country this database does not have', async () => {
    await expect(resolveCountrySlug('atlantis')).resolves.toEqual({
      kind: 'unknown',
    });
  });
});

describe('destinationCountryId', () => {
  it('records the row the slug names, not the id the caller resolved', async () => {
    // Exactly the reported failure: the website's list had Saudi Arabia at 2,
    // this database has 2 as Canada. 185 is recorded — the client's own choice,
    // read from the database that will render the order back.
    await expect(
      destinationCountryId({ slug: 'saudi-arabia', id: 2, journey: 'Visa order' })
    ).resolves.toBe(185);

    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('this database has it as 185 (Saudi Arabia)')
    );
  });

  it('agrees silently when the two answers match', async () => {
    await expect(
      destinationCountryId({ slug: 'saudi-arabia', id: 185, journey: 'Visa order' })
    ).resolves.toBe(185);

    expect(logError).not.toHaveBeenCalled();
  });

  it('resolves the slug when the caller sent no id at all', async () => {
    await expect(
      destinationCountryId({ slug: 'canada', journey: 'Visa order' })
    ).resolves.toBe(2);
  });

  it('takes the id as given when no slug was sent', async () => {
    // A caller posting to the API directly, and every journey not yet moved
    // over, must keep working exactly as before.
    await expect(
      destinationCountryId({ id: 185, journey: 'Visa order' })
    ).resolves.toBe(185);

    expect(findAll).not.toHaveBeenCalled();
  });

  it('falls back to the id when the slug matches nothing, and says why', async () => {
    // No trustworthy answer to substitute. Refusing would turn a data gap into
    // an order CLS cannot take at all, which is worse than what was recorded
    // before any of this existed.
    await expect(
      destinationCountryId({ slug: 'atlantis', id: 2, journey: 'Visa order' })
    ).resolves.toBe(2);

    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('no tbl_countries row matches "atlantis"')
    );
  });

  it('falls back to the id when two rows answer to the slug', async () => {
    findAll.mockResolvedValue([country(60, 'Congo'), country(61, 'Congo!')]);

    await expect(
      destinationCountryId({ slug: 'congo', id: 60, journey: 'Visa order' })
    ).resolves.toBe(60);

    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('matches 2 tbl_countries rows')
    );
  });

  it('narrows the list in SQL rather than filtering it here', async () => {
    // A country the website cannot offer must not resolve here either.
    await resolveCountrySlug('canada');

    expect(findAll).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything() })
    );
  });
});
