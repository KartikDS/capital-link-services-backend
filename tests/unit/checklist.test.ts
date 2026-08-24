import type { ClsOrder } from '../../src/models';
import {
  Categories,
  CategoryLocations,
  CategoryNationalities,
  ClsOrderDestinations,
  ClsOrderDocuments,
  Documents,
  OrderTravellerDetails,
} from '../../src/models';
import {
  materialiseChecklist,
  materialiseChecklistQuietly,
  resolveRequiredDocuments,
  scopeOfOrder,
} from '../../src/domain/checklist';
import { DOCUMENT_STATUS } from '../../src/domain/codes';

/**
 * Deriving an order's document checklist from the catalogue.
 *
 * This is the behaviour the old application has and this API did not: a
 * consultant could see what a client had *sent* but never what the order still
 * *needed*, because nothing ever wrote the `status = 0` rows.
 *
 * The properties worth holding are about restraint as much as about output —
 * a checklist built from a half-resolved category is a list of the wrong
 * documents, which is worse than no list at all:
 *
 * 1. One row per required document × traveller, at `UNATTENDED`.
 * 2. Never twice for the same order.
 * 3. Nothing at all when the scope is incomplete, or the catalogue is silent.
 * 4. A failure never reaches the caller, because every caller is doing something
 *    more important — recording a payment, answering a read.
 */

const orderRow = (fields: Record<string, unknown> = {}) =>
  ({ id: 1482, destination: 14, visa_type: null, ...fields }) as unknown as ClsOrder;

const destinationRow = (fields: Record<string, unknown> = {}) =>
  ({
    id: 1,
    order_id: 1482,
    country_id: 14,
    visa_type_id: 7,
    nationality: 241,
    entry_option: 1,
    process_location_id: 10,
    region: 'NSW',
    ...fields,
  }) as unknown as ClsOrderDestinations;

const documentRow = (fields: Record<string, unknown>) =>
  ({
    country_id: 14,
    visa_type_id: 7,
    category_id: 55,
    document: 'passport-bio.pdf',
    ...fields,
  }) as unknown as Documents;

const travellerRow = (id: number, isPrimary = 0) =>
  ({ id, order_id: 1482, is_primary: isPrimary }) as unknown as OrderTravellerDetails;

/** Everything resolving, so a test only has to override what it is about. */
const catalogueResolves = () => {
  jest
    .spyOn(ClsOrderDestinations, 'findOne')
    .mockResolvedValue(destinationRow());
  jest
    .spyOn(CategoryNationalities, 'findAll')
    .mockResolvedValue([{ category_id: 40 }] as unknown as CategoryNationalities[]);
  jest
    .spyOn(CategoryLocations, 'findAll')
    .mockResolvedValue([{ category_id: 40 }] as unknown as CategoryLocations[]);
  jest
    .spyOn(Categories, 'findAll')
    // Matched parent, then its children.
    .mockResolvedValueOnce([{ id: 40 }] as unknown as Categories[])
    .mockResolvedValueOnce([{ id: 55 }] as unknown as Categories[]);
};

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('scopeOfOrder', () => {
  it('reads the scope off the order destination row', async () => {
    jest.spyOn(ClsOrderDestinations, 'findOne').mockResolvedValue(destinationRow());

    await expect(scopeOfOrder(orderRow())).resolves.toEqual({
      countryId: 14,
      visaTypeId: 7,
      nationality: 241,
      entryOption: 1,
      processLocationId: 10,
      region: 'NSW',
    });
  });

  it('falls back to the header when there is no destination row', async () => {
    jest.spyOn(ClsOrderDestinations, 'findOne').mockResolvedValue(null);

    // A clearance or a voucher has a destination country and no visa type, which
    // is exactly the case that must not produce a checklist.
    await expect(scopeOfOrder(orderRow({ destination: 14 }))).resolves.toMatchObject({
      countryId: 14,
      visaTypeId: null,
      entryOption: null,
    });
  });

  it('reads the visa type off the header when the destination row lacks one', async () => {
    jest
      .spyOn(ClsOrderDestinations, 'findOne')
      .mockResolvedValue(destinationRow({ visa_type_id: null }));

    // `tbl_cls_order.visa_type` is a varchar, so it comes back as a string.
    await expect(
      scopeOfOrder(orderRow({ visa_type: '7' }))
    ).resolves.toMatchObject({ visaTypeId: 7 });
  });

  it('treats an unparseable visa type as absent rather than as NaN', async () => {
    jest
      .spyOn(ClsOrderDestinations, 'findOne')
      .mockResolvedValue(destinationRow({ visa_type_id: null }));

    await expect(
      scopeOfOrder(orderRow({ visa_type: 'to be confirmed' }))
    ).resolves.toMatchObject({ visaTypeId: null });
  });
});

describe('resolveRequiredDocuments', () => {
  const scope = {
    countryId: 14,
    visaTypeId: 7,
    nationality: 241,
    entryOption: 1,
    processLocationId: 10,
    region: 'NSW',
  };

  it('scopes documents to the matched categories children', async () => {
    catalogueResolves();
    const findDocuments = jest
      .spyOn(Documents, 'findAll')
      .mockResolvedValue([documentRow({ id: 1, document_name: 'Passport' })]);

    await resolveRequiredDocuments(scope);

    // The child category (55), not the parent (40) — the old code collects only
    // `$childCategory['id']`.
    expect(findDocuments.mock.calls[0]?.[0]?.where).toMatchObject({
      country_id: 14,
      visa_type_id: 7,
      category_id: { [Symbol.for('in')]: [55] },
    });
  });

  it('falls back to country and visa type when no category matches', async () => {
    jest.spyOn(CategoryNationalities, 'findAll').mockResolvedValue([]);
    jest.spyOn(CategoryLocations, 'findAll').mockResolvedValue([]);
    const findDocuments = jest.spyOn(Documents, 'findAll').mockResolvedValue([]);

    await resolveRequiredDocuments(scope);

    // No `category_id` filter at all, which is the old query's else-branch.
    expect(findDocuments.mock.calls[0]?.[0]?.where).not.toHaveProperty('category_id');
  });

  it('requires the category to appear in both join tables', async () => {
    // Nationality allows category 40, location allows 41. Neither is eligible.
    jest
      .spyOn(CategoryNationalities, 'findAll')
      .mockResolvedValue([{ category_id: 40 }] as unknown as CategoryNationalities[]);
    jest
      .spyOn(CategoryLocations, 'findAll')
      .mockResolvedValue([{ category_id: 41 }] as unknown as CategoryLocations[]);
    const findCategories = jest.spyOn(Categories, 'findAll').mockResolvedValue([]);
    jest.spyOn(Documents, 'findAll').mockResolvedValue([]);

    await resolveRequiredDocuments(scope);

    // The old query inner-joins both, so a category in only one of them is out —
    // and with nothing eligible the category lookup is never even run.
    expect(findCategories).not.toHaveBeenCalled();
  });

  it('returns nothing when the visa type is unknown', async () => {
    const findDocuments = jest.spyOn(Documents, 'findAll').mockResolvedValue([]);

    await expect(
      resolveRequiredDocuments({ ...scope, visaTypeId: null })
    ).resolves.toEqual([]);
    expect(findDocuments).not.toHaveBeenCalled();
  });

  it('returns nothing when the entry option is unknown', async () => {
    const findDocuments = jest.spyOn(Documents, 'findAll').mockResolvedValue([]);

    await expect(
      resolveRequiredDocuments({ ...scope, entryOption: null })
    ).resolves.toEqual([]);
    expect(findDocuments).not.toHaveBeenCalled();
  });
});

describe('materialiseChecklist', () => {
  it('writes one row per document per traveller, unattended', async () => {
    catalogueResolves();
    jest.spyOn(ClsOrderDocuments, 'count').mockResolvedValue(0);
    jest
      .spyOn(Documents, 'findAll')
      .mockResolvedValue([
        documentRow({ id: 1, document_name: 'Passport', document: 'passport.pdf' }),
        documentRow({ id: 2, document_name: 'Photo', document: 'photo.pdf' }),
      ]);
    jest
      .spyOn(OrderTravellerDetails, 'findAll')
      .mockResolvedValue([travellerRow(900, 1), travellerRow(901)]);
    const bulkCreate = jest
      .spyOn(ClsOrderDocuments, 'bulkCreate')
      .mockResolvedValue([]);

    await expect(materialiseChecklist(orderRow())).resolves.toEqual({ created: 4 });

    const rows: readonly Record<string, unknown>[] = bulkCreate.mock.calls[0]?.[0] ?? [];
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      order_id: 1482,
      country_id: 14,
      visa_type_id: 7,
      entry_option: 1,
      process_location_id: 10,
      nationality: 241,
      region: 'NSW',
      category_id: 55,
      document_id: 1,
      traveller_id: 900,
      // The catalogue's filename, not an upload — the upload overwrites it.
      document: 'passport.pdf',
      status: DOCUMENT_STATUS.UNATTENDED,
    });
    // Every document reaches every traveller.
    expect(rows.map((row) => [row.document_id, row.traveller_id])).toEqual([
      [1, 900],
      [1, 901],
      [2, 900],
      [2, 901],
    ]);
  });

  it('does nothing when the order already has a checklist', async () => {
    jest.spyOn(ClsOrderDocuments, 'count').mockResolvedValue(6);
    const bulkCreate = jest.spyOn(ClsOrderDocuments, 'bulkCreate');

    // Idempotent, because it runs from the payment, from lodgement and from every
    // read of the order's documents.
    await expect(materialiseChecklist(orderRow())).resolves.toEqual({
      created: 0,
      reason: 'already-materialised',
    });
    expect(bulkCreate).not.toHaveBeenCalled();
  });

  it('writes nothing for an order with no visa type', async () => {
    jest.spyOn(ClsOrderDocuments, 'count').mockResolvedValue(0);
    jest
      .spyOn(ClsOrderDestinations, 'findOne')
      .mockResolvedValue(destinationRow({ visa_type_id: null }));
    const bulkCreate = jest.spyOn(ClsOrderDocuments, 'bulkCreate');

    // A police clearance and a Russian voucher never have one, and an attestation
    // gets its type from a consultant later.
    await expect(materialiseChecklist(orderRow())).resolves.toEqual({
      created: 0,
      reason: 'no-scope',
    });
    expect(bulkCreate).not.toHaveBeenCalled();
  });

  it('writes nothing when the catalogue names no documents', async () => {
    catalogueResolves();
    jest.spyOn(ClsOrderDocuments, 'count').mockResolvedValue(0);
    jest.spyOn(Documents, 'findAll').mockResolvedValue([]);
    jest.spyOn(OrderTravellerDetails, 'findAll').mockResolvedValue([travellerRow(900, 1)]);
    const bulkCreate = jest.spyOn(ClsOrderDocuments, 'bulkCreate');

    await expect(materialiseChecklist(orderRow())).resolves.toEqual({
      created: 0,
      reason: 'no-documents',
    });
    expect(bulkCreate).not.toHaveBeenCalled();
  });

  it('writes nothing when the order has no travellers to attach them to', async () => {
    catalogueResolves();
    jest.spyOn(ClsOrderDocuments, 'count').mockResolvedValue(0);
    jest
      .spyOn(Documents, 'findAll')
      .mockResolvedValue([documentRow({ id: 1, document_name: 'Passport' })]);
    jest.spyOn(OrderTravellerDetails, 'findAll').mockResolvedValue([]);
    const bulkCreate = jest.spyOn(ClsOrderDocuments, 'bulkCreate');

    await expect(materialiseChecklist(orderRow())).resolves.toEqual({
      created: 0,
      reason: 'no-travellers',
    });
    expect(bulkCreate).not.toHaveBeenCalled();
  });
});

describe('materialiseChecklistQuietly', () => {
  it('swallows a failure, because the caller has already taken the money', async () => {
    jest
      .spyOn(ClsOrderDocuments, 'count')
      .mockRejectedValue(new Error('read-only transaction'));

    // A recorded payment must not become an error because a catalogue lookup or
    // a DB_READ_ONLY guard refused.
    await expect(materialiseChecklistQuietly(orderRow())).resolves.toBeUndefined();
  });
});
