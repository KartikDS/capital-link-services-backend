import {
  PoliceClearances,
  PublicVisaAdditionalRequirements,
  PublicVisaTypes,
  RussianVisaVoucherTypes,
  VisaCourierOptions,
} from '../../src/models';
import {
  VOUCHER_TIER_IDS,
  quoteClearance,
  quoteVisa,
  quoteVoucher,
} from '../../src/domain/quotes';

/**
 * Pricing, with the catalogue tables mocked.
 *
 * The property these tests exist to hold: **a request names ids and never
 * amounts.** So the assertions are about what comes out of the catalogue, what
 * happens when a catalogue row carries no price, and that GST is rounded once.
 *
 * The catalogue is mocked rather than seeded because the interesting cases are
 * the awkward rows — a `varchar` fee holding `TBA`, a tier with no fee, a
 * requirement marked mandatory — and creating those in a real database would
 * mean writing to CLS's tables to test them.
 */

/** Only the fields the pricing functions read. */
const clearanceRow = (fields: Record<string, unknown>) =>
  fields as unknown as PoliceClearances;

const voucherRow = (fields: Record<string, unknown>) =>
  fields as unknown as RussianVisaVoucherTypes;

const visaRow = (fields: Record<string, unknown>) =>
  fields as unknown as PublicVisaTypes;

const courierRow = (fields: Record<string, unknown>) =>
  fields as unknown as VisaCourierOptions;

const requirementRow = (fields: Record<string, unknown>) =>
  fields as unknown as PublicVisaAdditionalRequirements;

beforeEach(() => {
  jest.restoreAllMocks();
});

describe('quoteClearance', () => {
  it('charges the first applicant at the base rate', async () => {
    jest.spyOn(PoliceClearances, 'findOne').mockResolvedValue(
      clearanceRow({
        id: 3,
        name: 'UAE police clearance',
        price: 250,
        price_additional: 150,
        name_additional: 'Additional applicant',
      })
    );

    const quote = await quoteClearance({ clearanceId: 3, applicants: 1 });

    expect(quote.quoteRequired).toBe(false);
    expect(quote.subtotalCents).toBe(25_000);
    expect(quote.gstCents).toBe(2_500);
    expect(quote.totalCents).toBe(27_500);
    expect(quote.lines).toHaveLength(1);
  });

  it('charges each extra applicant at the additional rate', async () => {
    jest.spyOn(PoliceClearances, 'findOne').mockResolvedValue(
      clearanceRow({
        id: 3,
        name: 'UAE police clearance',
        price: 250,
        price_additional: 150,
        name_additional: 'Additional applicant',
      })
    );

    const quote = await quoteClearance({ clearanceId: 3, applicants: 3 });

    // 250 for the first, 150 each for the other two.
    expect(quote.subtotalCents).toBe(25_000 + 2 * 15_000);
    expect(quote.lines[1]?.quantity).toBe(2);
    expect(quote.lines[1]?.unitCents).toBe(15_000);
  });

  it('falls back to the full rate when no additional rate is set', async () => {
    // A null `price_additional` is read as "no discount for extras", which is
    // the old application's behaviour and the safer reading.
    jest.spyOn(PoliceClearances, 'findOne').mockResolvedValue(
      clearanceRow({ id: 3, name: 'Clearance', price: 250, price_additional: null })
    );

    const quote = await quoteClearance({ clearanceId: 3, applicants: 2 });

    expect(quote.subtotalCents).toBe(50_000);
  });

  it('quotes on application when the row carries no price', async () => {
    // The row exists but the fee was never set. A zero here would be a free
    // clearance on screen.
    jest.spyOn(PoliceClearances, 'findOne').mockResolvedValue(
      clearanceRow({ id: 3, name: 'Clearance', price: null, price_additional: null })
    );

    const quote = await quoteClearance({ clearanceId: 3, applicants: 1 });

    expect(quote.quoteRequired).toBe(true);
    expect(quote.totalCents).toBe(0);
    expect(quote.reason).toMatch(/consultant/i);
  });

  it('refuses a clearance that is not on the list', async () => {
    jest.spyOn(PoliceClearances, 'findOne').mockResolvedValue(null);

    await expect(quoteClearance({ clearanceId: 999, applicants: 1 })).rejects.toThrow(
      /not one we offer/
    );
  });

  it('adds the courier the client chose', async () => {
    jest.spyOn(PoliceClearances, 'findOne').mockResolvedValue(
      clearanceRow({ id: 3, name: 'Clearance', price: 250, price_additional: null })
    );
    jest.spyOn(VisaCourierOptions, 'findOne').mockResolvedValue(
      courierRow({ id: 8, type: 'DHL Express', cost: 45 })
    );

    const quote = await quoteClearance({
      clearanceId: 3,
      applicants: 1,
      courierOptionId: 8,
    });

    expect(quote.subtotalCents).toBe(25_000 + 4_500);
    expect(quote.lines.at(-1)?.label).toBe('DHL Express');
  });

  it('refuses a courier option that is not active', async () => {
    jest.spyOn(PoliceClearances, 'findOne').mockResolvedValue(
      clearanceRow({ id: 3, name: 'Clearance', price: 250, price_additional: null })
    );
    jest.spyOn(VisaCourierOptions, 'findOne').mockResolvedValue(null);

    await expect(
      quoteClearance({ clearanceId: 3, applicants: 1, courierOptionId: 99 })
    ).rejects.toThrow(/delivery option/);
  });
});

describe('quoteVoucher', () => {
  const voucher = voucherRow({
    id: 2,
    name: 'Business voucher',
    thirteen_days: 90,
    four_days: 140,
    three_days_process_fee: 180,
    one_two_days_process_fee: 240,
    twelve_hrs_process_fee: null,
  });

  it('prices from the column matching the chosen tier', async () => {
    jest.spyOn(RussianVisaVoucherTypes, 'findOne').mockResolvedValue(voucher);

    const quote = await quoteVoucher({
      voucherTypeId: 2,
      tier: 'four-days',
      applicants: 1,
    });

    expect(quote.subtotalCents).toBe(14_000);
  });

  it('multiplies by the number of applicants', async () => {
    jest.spyOn(RussianVisaVoucherTypes, 'findOne').mockResolvedValue(voucher);

    const quote = await quoteVoucher({
      voucherTypeId: 2,
      tier: 'thirteen-days',
      applicants: 4,
    });

    expect(quote.subtotalCents).toBe(4 * 9_000);
    expect(quote.lines[0]?.quantity).toBe(4);
  });

  it('refuses a tier the voucher has no fee for', async () => {
    // A null fee means CLS does not offer that speed for that voucher. Charging
    // nothing for a twelve-hour turnaround is the outcome to avoid.
    jest.spyOn(RussianVisaVoucherTypes, 'findOne').mockResolvedValue(voucher);

    await expect(
      quoteVoucher({ voucherTypeId: 2, tier: 'twelve-hours', applicants: 1 })
    ).rejects.toThrow(/do not offer/);
  });

  it('prices every tier the voucher does have a fee for', async () => {
    jest.spyOn(RussianVisaVoucherTypes, 'findOne').mockResolvedValue(voucher);

    const priced = VOUCHER_TIER_IDS.filter((tier) => tier !== 'twelve-hours');

    for (const tier of priced) {
      const quote = await quoteVoucher({
        voucherTypeId: 2,
        tier,
        applicants: 1,
      });

      expect(quote.subtotalCents).toBeGreaterThan(0);
    }
  });

  it('reads a fee stored as a string with currency noise', async () => {
    // These columns are `double` on this table, but the same value arrives as a
    // string from other fee columns — the parser has to cope either way.
    jest.spyOn(RussianVisaVoucherTypes, 'findOne').mockResolvedValue(
      voucherRow({ id: 2, name: 'Voucher', four_days: '$1,250.00' })
    );

    const quote = await quoteVoucher({
      voucherTypeId: 2,
      tier: 'four-days',
      applicants: 1,
    });

    expect(quote.subtotalCents).toBe(125_000);
  });
});

describe('quoteVisa', () => {
  it('prices the visa itself', async () => {
    jest.spyOn(PublicVisaTypes, 'findOne').mockResolvedValue(
      visaRow({ id: 5, title: 'Saudi business visa', cost: 320 })
    );
    jest.spyOn(PublicVisaAdditionalRequirements, 'findAll').mockResolvedValue([]);

    const quote = await quoteVisa({ visaTypeId: 5, applicants: 2 });

    expect(quote.subtotalCents).toBe(2 * 32_000);
    expect(quote.gstCents).toBe(6_400);
  });

  it('adds a mandatory requirement the client did not select', async () => {
    // `s_required` means the embassy will not process without it. Leaving it out
    // means charging for it later or absorbing it.
    jest.spyOn(PublicVisaTypes, 'findOne').mockResolvedValue(
      visaRow({ id: 5, title: 'Visa', cost: 320 })
    );
    jest.spyOn(PublicVisaAdditionalRequirements, 'findAll').mockResolvedValue([
      requirementRow({ id: 11, requirement: 'Biometrics', cost: 55, s_required: 1 }),
    ]);

    const quote = await quoteVisa({ visaTypeId: 5, applicants: 1 });

    expect(quote.lines).toHaveLength(2);
    expect(quote.subtotalCents).toBe(32_000 + 5_500);
  });

  it('leaves out an optional requirement the client did not select', async () => {
    jest.spyOn(PublicVisaTypes, 'findOne').mockResolvedValue(
      visaRow({ id: 5, title: 'Visa', cost: 320 })
    );
    jest.spyOn(PublicVisaAdditionalRequirements, 'findAll').mockResolvedValue([
      requirementRow({ id: 12, requirement: 'Courier', cost: 40, s_required: 0 }),
    ]);

    const quote = await quoteVisa({ visaTypeId: 5, applicants: 1 });

    expect(quote.subtotalCents).toBe(32_000);
  });

  it('includes an optional requirement the client did select', async () => {
    jest.spyOn(PublicVisaTypes, 'findOne').mockResolvedValue(
      visaRow({ id: 5, title: 'Visa', cost: 320 })
    );
    jest.spyOn(PublicVisaAdditionalRequirements, 'findAll').mockResolvedValue([
      requirementRow({ id: 12, requirement: 'Priority', cost: 40, s_required: 0 }),
    ]);

    const quote = await quoteVisa({
      visaTypeId: 5,
      applicants: 1,
      requirementIds: [12],
    });

    expect(quote.subtotalCents).toBe(32_000 + 4_000);
  });

  it('ignores a selected requirement that belongs to another visa', async () => {
    // The requirement query is scoped to the visa, so an id from elsewhere finds
    // nothing rather than being priced.
    jest.spyOn(PublicVisaTypes, 'findOne').mockResolvedValue(
      visaRow({ id: 5, title: 'Visa', cost: 320 })
    );
    jest.spyOn(PublicVisaAdditionalRequirements, 'findAll').mockResolvedValue([]);

    const quote = await quoteVisa({
      visaTypeId: 5,
      applicants: 1,
      requirementIds: [9_999],
    });

    expect(quote.subtotalCents).toBe(32_000);
  });

  it('skips a requirement with no cost rather than adding a zero line', async () => {
    // A costless requirement is a document the client supplies, not a charge.
    jest.spyOn(PublicVisaTypes, 'findOne').mockResolvedValue(
      visaRow({ id: 5, title: 'Visa', cost: 320 })
    );
    jest.spyOn(PublicVisaAdditionalRequirements, 'findAll').mockResolvedValue([
      requirementRow({ id: 13, requirement: 'Passport copy', cost: 0, s_required: 1 }),
    ]);

    const quote = await quoteVisa({ visaTypeId: 5, applicants: 1 });

    expect(quote.lines).toHaveLength(1);
  });

  it('quotes on application when the visa carries no cost', async () => {
    jest.spyOn(PublicVisaTypes, 'findOne').mockResolvedValue(
      visaRow({ id: 5, title: 'Visa', cost: null })
    );

    const quote = await quoteVisa({ visaTypeId: 5, applicants: 1 });

    expect(quote.quoteRequired).toBe(true);
    expect(quote.totalCents).toBe(0);
  });
});

describe('GST across a whole quote', () => {
  it('rounds once on the subtotal, not per line', async () => {
    // Three lines of 33.33 sum to 99.99. Ten per cent of that is 10.00 once
    // rounded; rounding each line first gives 9.99 and the invoice stops
    // matching the card charge.
    jest.spyOn(PublicVisaTypes, 'findOne').mockResolvedValue(
      visaRow({ id: 5, title: 'Visa', cost: 33.33 })
    );
    jest.spyOn(PublicVisaAdditionalRequirements, 'findAll').mockResolvedValue([]);

    const quote = await quoteVisa({ visaTypeId: 5, applicants: 3 });

    expect(quote.subtotalCents).toBe(9_999);
    expect(quote.gstCents).toBe(1_000);
    expect(quote.subtotalCents + quote.gstCents).toBe(quote.totalCents);
  });

  it('always reports a total that equals subtotal plus GST', async () => {
    jest.spyOn(PublicVisaTypes, 'findOne').mockResolvedValue(
      visaRow({ id: 5, title: 'Visa', cost: 17.77 })
    );
    jest.spyOn(PublicVisaAdditionalRequirements, 'findAll').mockResolvedValue([]);

    for (const applicants of [1, 2, 3, 7, 11, 20]) {
      const quote = await quoteVisa({ visaTypeId: 5, applicants });
      expect(quote.subtotalCents + quote.gstCents).toBe(quote.totalCents);
    }
  });
});
