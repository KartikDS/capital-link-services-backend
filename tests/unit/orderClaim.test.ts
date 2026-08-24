/**
 * Giving a guest order an account.
 *
 * The behaviour under test is the one that decides whether somebody who ordered
 * without signing in ever sees that order again. Four things have to hold, and
 * each is a way the flow has broken elsewhere:
 *
 * 1. An order that already has an owner is left alone — no second account, no
 *    second password.
 * 2. An address that is already registered is *linked*, not registered again.
 * 3. An address that is new gets an account, and the caller gets the password
 *    once so it can be emailed.
 * 4. A second call for the same reference produces nothing, because a Stripe
 *    redelivery and the success page both call this.
 *
 * The model layer is mocked. The assertions are about which of the four branches
 * runs and what it hands back, and those are decided before any SQL is built.
 */

const findByPk = jest.fn();
const findTravellers = jest.fn();
const findClsOrderIdByReference = jest.fn();
const findAnyClientByEmail = jest.fn();
const findClientById = jest.fn();
const createClient = jest.fn();
const nextDisplayId = jest.fn();

jest.mock('../../src/config/database', () => ({
  sequelize: {
    // A stand-in transaction, so the writes happen inline and in order. The real
    // one also takes a row lock; that it is requested is asserted below, because
    // it is what makes two simultaneous callers safe.
    transaction: (body: (t: unknown) => Promise<unknown>) =>
      body({ LOCK: { UPDATE: 'UPDATE' } }),
  },
}));

jest.mock('../../src/models', () => ({
  ClsOrder: { findByPk },
  OrderTravellerDetails: { findAll: findTravellers },
}));

jest.mock('../../src/modules/orders/orders.repository', () => ({
  findClsOrderIdByReference,
}));

jest.mock('../../src/modules/auth/auth.repository', () => ({
  findAnyClientByEmail,
  findClientById,
  createClient,
  nextDisplayId,
}));

import { claim } from '../../src/modules/orders/orders.claim';

/** An unowned guest order, as lodged by the checkout. */
const guestOrder = (overrides: Record<string, unknown> = {}) => ({
  id: 1482,
  client_id: null,
  contact_first_name: 'Priya',
  contact_last_name: 'Raman',
  contact_email: 'priya@example.com',
  contact_phone: '0400 000 000',
  update: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

/** An applicant row, as lodgement writes it: primary, and not yet the client. */
const traveller = (overrides: Record<string, unknown> = {}) => ({
  id: 900,
  is_primary: 1,
  is_client: 0,
  update: jest.fn().mockResolvedValue(undefined),
  ...overrides,
});

beforeEach(() => {
  findTravellers.mockResolvedValue([]);
  findClsOrderIdByReference.mockResolvedValue(1482);
  nextDisplayId.mockResolvedValue('CLS000042');
  createClient.mockImplementation((input: { email: string }) =>
    Promise.resolve({ id: 77, email: input.email, fname: 'Priya' })
  );
});

describe('claim', () => {
  it('creates an account for an address that is not registered', async () => {
    const order = guestOrder();
    findByPk.mockResolvedValue(order);
    findAnyClientByEmail.mockResolvedValue(null);

    const result = await claim('CLS-001482');

    expect(result.created).toBe(true);
    expect(result.linked).toBe(true);
    expect(result.clientId).toBe(77);
    expect(result.email).toBe('priya@example.com');
    // The one call that produces a password, and the caller needs it to email.
    expect(result.password).toEqual(expect.any(String));
    expect(result.password).toHaveLength(14);

    // The order is stamped, which is the whole point: the portal filters on it.
    expect(order.update).toHaveBeenCalledWith(
      { client_id: 77 },
      expect.objectContaining({ transaction: expect.anything() })
    );
  });

  it('stores a hash and never the password itself', async () => {
    findByPk.mockResolvedValue(guestOrder());
    findAnyClientByEmail.mockResolvedValue(null);

    const result = await claim('CLS-001482');

    const stored = createClient.mock.calls[0][0] as { password: string };

    expect(stored.password).not.toBe(result.password);
    // bcrypt, which is what `hashPassword` writes whatever the legacy rows hold.
    expect(stored.password).toMatch(/^\$2[aby]?\$\d{2}\$/);
  });

  it('leaves activation_code null, so the account can sign in to Acme too', async () => {
    findByPk.mockResolvedValue(guestOrder());
    findAnyClientByEmail.mockResolvedValue(null);

    await claim('CLS-001482');

    const stored = createClient.mock.calls[0][0] as { activationCode: unknown };

    // This used to be random bytes. The Acme client login reads a non-empty
    // activation_code as an unconfirmed email address and refuses the sign-in,
    // and nothing in this stack ever clears it -- the claim emails a password,
    // not a confirmation link. So the code confirmed nothing and locked the
    // client out of the site CLS staff still use.
    expect(stored.activationCode).toBeNull();
  });

  it('takes the row lock, so two callers cannot both create an account', async () => {
    findByPk.mockResolvedValue(guestOrder());
    findAnyClientByEmail.mockResolvedValue(null);

    await claim('CLS-001482');

    expect(findByPk).toHaveBeenCalledWith(
      1482,
      expect.objectContaining({ lock: 'UPDATE' })
    );
  });

  it('links an address that is already registered instead of registering it again', async () => {
    const order = guestOrder();
    findByPk.mockResolvedValue(order);
    findAnyClientByEmail.mockResolvedValue({
      id: 12,
      email: 'priya@example.com',
      fname: 'Priya',
    });

    const result = await claim('CLS-001482');

    expect(result.created).toBe(false);
    expect(result.linked).toBe(true);
    expect(result.clientId).toBe(12);
    // No password, because they already have one.
    expect(result.password).toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
    expect(order.update).toHaveBeenCalledWith(
      { client_id: 12 },
      expect.anything()
    );
  });

  it('leaves an order that already has an owner alone', async () => {
    const order = guestOrder({ client_id: 12 });
    findByPk.mockResolvedValue(order);
    findClientById.mockResolvedValue({
      id: 12,
      email: 'priya@example.com',
      fname: 'Priya',
    });

    const result = await claim('CLS-001482');

    expect(result).toMatchObject({ created: false, linked: false, clientId: 12 });
    expect(result.password).toBeUndefined();
    expect(createClient).not.toHaveBeenCalled();
    expect(order.update).not.toHaveBeenCalled();
  });

  it('is idempotent: the second call finds the order owned and sends nothing', async () => {
    const order = guestOrder();
    findByPk.mockResolvedValue(order);
    findAnyClientByEmail.mockResolvedValue(null);

    const first = await claim('CLS-001482');

    // What the first call did to the row, which is what a second caller reads.
    const owned = guestOrder({ client_id: 77 });
    findByPk.mockResolvedValue(owned);
    findClientById.mockResolvedValue({
      id: 77,
      email: 'priya@example.com',
      fname: 'Priya',
    });

    const second = await claim('CLS-001482');

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    // Exactly one password between them, which is what stops a Stripe
    // redelivery from emailing a client two different ones.
    expect(second.password).toBeUndefined();
    expect(createClient).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a reference that names no order', async () => {
    findClsOrderIdByReference.mockResolvedValue(null);

    const result = await claim('CLS-999999');

    expect(result).toMatchObject({
      created: false,
      linked: false,
      clientId: null,
      reason: 'unknown-order',
    });
    expect(findByPk).not.toHaveBeenCalled();
  });

  it('does nothing for an order carrying no contact address', async () => {
    findByPk.mockResolvedValue(guestOrder({ contact_email: null }));

    const result = await claim('CLS-001482');

    expect(result).toMatchObject({
      created: false,
      linked: false,
      reason: 'no-contact-email',
    });
    expect(createClient).not.toHaveBeenCalled();
  });

  it('normalises the address before looking it up or storing it', async () => {
    findByPk.mockResolvedValue(
      guestOrder({ contact_email: '  Priya@Example.COM ' })
    );
    findAnyClientByEmail.mockResolvedValue(null);

    const result = await claim('CLS-001482');

    // Both, because a mixed-case duplicate is how a client ends up with two
    // accounts and an order under the one they cannot sign into.
    expect(findAnyClientByEmail).toHaveBeenCalledWith('priya@example.com');
    expect(createClient.mock.calls[0][0]).toMatchObject({
      email: 'priya@example.com',
    });
    expect(result.email).toBe('priya@example.com');
  });

  it('falls back to the local part when the order carries no contact name', async () => {
    findByPk.mockResolvedValue(
      guestOrder({ contact_first_name: null, contact_last_name: null })
    );
    findAnyClientByEmail.mockResolvedValue(null);

    await claim('CLS-001482');

    // `fname` is what the old admin screens list clients by; a blank one reads
    // as a broken row.
    expect(createClient.mock.calls[0][0]).toMatchObject({
      fname: 'priya',
      lname: '',
    });
  });

  /**
   * `is_client` marks the applicant who *is* the account holder, rather than
   * somebody being travelled for. The old application sets it on applicant zero
   * exactly when the order opens the account
   * (`VisaInformationController.php:793`), and lodgement cannot: at that point a
   * guest order has no account for them to be the holder of.
   */
  describe('the lead applicant is marked as the client', () => {
    it('stamps the primary applicant when an account is created', async () => {
      const primary = traveller();
      const companion = traveller({ id: 901, is_primary: 0 });
      findByPk.mockResolvedValue(guestOrder());
      findAnyClientByEmail.mockResolvedValue(null);
      findTravellers.mockResolvedValue([primary, companion]);

      await claim('CLS-001482');

      expect(primary.update).toHaveBeenCalledWith(
        { is_client: 1 },
        expect.anything()
      );
      // A family member on the same order is not the account holder.
      expect(companion.update).not.toHaveBeenCalled();
    });

    it('stamps them when the order is linked to an account that already existed', async () => {
      const primary = traveller();
      findByPk.mockResolvedValue(guestOrder());
      findAnyClientByEmail.mockResolvedValue({
        id: 12,
        email: 'priya@example.com',
        fname: 'Priya',
      });
      findTravellers.mockResolvedValue([primary]);

      await claim('CLS-001482');

      expect(primary.update).toHaveBeenCalledWith(
        { is_client: 1 },
        expect.anything()
      );
    });

    it('leaves the applicants alone on an order that already had an owner', async () => {
      const primary = traveller();
      findByPk.mockResolvedValue(guestOrder({ client_id: 12 }));
      findClientById.mockResolvedValue({ id: 12, email: 'priya@example.com', fname: 'Priya' });
      findTravellers.mockResolvedValue([primary]);

      await claim('CLS-001482');

      // Nothing changed hands, so nothing is restamped — this is the path a
      // Stripe redelivery takes.
      expect(primary.update).not.toHaveBeenCalled();
    });

    it('falls back to the first applicant when none is flagged primary', async () => {
      const first = traveller({ is_primary: 0 });
      findByPk.mockResolvedValue(guestOrder());
      findAnyClientByEmail.mockResolvedValue(null);
      findTravellers.mockResolvedValue([first, traveller({ id: 901, is_primary: 0 })]);

      await claim('CLS-001482');

      expect(first.update).toHaveBeenCalledWith({ is_client: 1 }, expect.anything());
    });

    it('does not fail an order that has no applicant rows', async () => {
      findByPk.mockResolvedValue(guestOrder());
      findAnyClientByEmail.mockResolvedValue(null);
      findTravellers.mockResolvedValue([]);

      // A legalisation order can be lodged with no applicants at all.
      await expect(claim('CLS-001482')).resolves.toMatchObject({ created: true });
    });
  });

  it('creates the account in the same transaction as the stamp', async () => {
    findByPk.mockResolvedValue(guestOrder());
    findAnyClientByEmail.mockResolvedValue(null);

    await claim('CLS-001482');

    // Otherwise a failed stamp leaves a login nobody was told about.
    expect(createClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ LOCK: expect.anything() })
    );
  });
});
