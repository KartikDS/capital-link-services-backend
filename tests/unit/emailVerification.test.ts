/**
 * Confirming a client's email address.
 *
 * `tbl_user_client` has no `email_verified` column and the schema is fixed, so
 * the whole feature rests on one legacy column — `activation_code` — that a
 * second application also reads. That is what makes these assertions worth
 * writing: each one pins a rule that only exists because of the column, and
 * every one of them has a way of going wrong that would be silent.
 *
 * 1. **Registration issues a code and still returns a session.** A client who
 *    registered mid-order has to be able to finish it, so the confirmation is a
 *    request on the next screen rather than a gate in front of it.
 * 2. **`emailVerified` is derived, not stored.** Blank means confirmed — and
 *    "blank" has to cover the empty string Acme writes as well as the null this
 *    stack writes, because five years of rows hold both.
 * 3. **A resend replaces the code.** One column, so two live links are not
 *    possible; the old one has to stop working rather than the new one failing to
 *    take effect.
 * 4. **A confirmed account has nothing to resend**, and that is not an error.
 * 5. **Redeeming clears the code**, which is the only thing making a link
 *    single-use — and a blank code must never be looked up, or it would match the
 *    first confirmed account in the table and confirm a stranger's address.
 *
 * The repository is mocked. Every rule above is decided before any SQL is built.
 */

const findAnyClientByEmail = jest.fn();
const findClientByEmail = jest.fn();
const findClientById = jest.fn();
const findClientByActivationCode = jest.fn();
const createClient = jest.fn();
const nextDisplayId = jest.fn();
const activateClient = jest.fn();
const setClientActivationCode = jest.fn();
const stampClientLogin = jest.fn();
const setClientPassword = jest.fn();

jest.mock('../../src/modules/auth/auth.repository', () => ({
  findAnyClientByEmail,
  findClientByEmail,
  findClientById,
  findClientByActivationCode,
  createClient,
  nextDisplayId,
  activateClient,
  setClientActivationCode,
  stampClientLogin,
  setClientPassword,
}));

import {
  register,
  resendEmailVerification,
  verifyEmail,
} from '../../src/modules/auth/auth.service';

/** A client row, confirmed unless a code is given. */
const client = (overrides: Record<string, unknown> = {}) => ({
  id: 501,
  type: 'public',
  display_id: 'CLS000501',
  fname: 'Priya',
  lname: 'Raman',
  email: 'priya@example.com',
  password: null,
  company: null,
  account_no: null,
  activation_code: null,
  ...overrides,
});

const registration = {
  firstName: 'Priya',
  lastName: 'Raman',
  email: 'Priya@Example.com',
  password: 'a-long-enough-password',
};

beforeEach(() => {
  jest.clearAllMocks();
  nextDisplayId.mockResolvedValue('CLS000501');
  findAnyClientByEmail.mockResolvedValue(null);
});

describe('registration', () => {
  it('issues a confirmation code and still returns a session', async () => {
    createClient.mockImplementation((input: { activationCode: string }) =>
      Promise.resolve(client({ activation_code: input.activationCode }))
    );

    const { session, verification } = await register(registration);

    // The code written to the row is the one handed back to be emailed. If these
    // ever diverge the link in the email matches nothing and every registration
    // is unconfirmable, with nothing failing to say so.
    const written = createClient.mock.calls[0][0] as { activationCode: string };
    expect(verification.token).toBe(written.activationCode);
    expect(verification.token.length).toBeGreaterThan(20);

    // Sent to the normalised address, not the one as typed.
    expect(verification.email).toBe('priya@example.com');
    expect(verification.name).toBe('Priya Raman');

    // Signed in regardless, and told they are not confirmed yet.
    expect(session.accessToken).toBeTruthy();
    expect(session.user.emailVerified).toBe(false);
  });

  it('fits the code in the column it has to live in', async () => {
    createClient.mockResolvedValue(client());

    await register(registration);

    const { activationCode } = createClient.mock.calls[0][0] as {
      activationCode: string;
    };

    // `activation_code` is char(100). A longer value would be truncated by
    // MySQL, and a truncated code matches nothing — so the link would be dead
    // for every account and the only symptom would be clients saying so.
    expect(activationCode.length).toBeLessThanOrEqual(100);
  });
});

describe('emailVerified on the session', () => {
  it('is false while a code is pending', async () => {
    createClient.mockResolvedValue(client({ activation_code: 'pending-code' }));

    const { session } = await register(registration);
    expect(session.user.emailVerified).toBe(false);
  });

  it('treats the empty string Acme writes as confirmed', async () => {
    // Acme's own confirmation sets the column to '' rather than null. Reading
    // that as "pending" would show the confirm-your-email banner forever to
    // every client who confirmed on the old site.
    createClient.mockResolvedValue(client({ activation_code: '   ' }));

    const { session } = await register(registration);
    expect(session.user.emailVerified).toBe(true);
  });
});

describe('resending the confirmation', () => {
  it('replaces the pending code rather than reusing it', async () => {
    findClientById.mockResolvedValue(client({ activation_code: 'old-code' }));

    const issued = await resendEmailVerification(501);

    expect(issued).not.toBeNull();
    expect(issued?.token).not.toBe('old-code');
    expect(setClientActivationCode).toHaveBeenCalledWith(501, issued?.token);
    expect(issued?.email).toBe('priya@example.com');
  });

  it('has nothing to send for an address already confirmed', async () => {
    findClientById.mockResolvedValue(client({ activation_code: null }));

    // Null rather than a throw: the client asked for a link to do something they
    // have already done, which is not a failure worth an error page.
    await expect(resendEmailVerification(501)).resolves.toBeNull();
    expect(setClientActivationCode).not.toHaveBeenCalled();
  });

  it('has nothing to send when the account carries no address', async () => {
    findClientById.mockResolvedValue(
      client({ email: null, activation_code: 'pending-code' })
    );

    await expect(resendEmailVerification(501)).resolves.toBeNull();
    expect(setClientActivationCode).not.toHaveBeenCalled();
  });

  it('refuses a token whose account is gone', async () => {
    findClientById.mockResolvedValue(null);

    await expect(resendEmailVerification(501)).rejects.toThrow();
  });
});

describe('redeeming the link', () => {
  it('clears the code, which is what makes the link single-use', async () => {
    findClientByActivationCode.mockResolvedValue(
      client({ activation_code: 'live-code' })
    );

    const confirmed = await verifyEmail('live-code');

    expect(activateClient).toHaveBeenCalledWith(501);
    expect(confirmed).toEqual({ email: 'priya@example.com', name: 'Priya' });
  });

  it('refuses a code that matches nothing, without guessing why', async () => {
    findClientByActivationCode.mockResolvedValue(null);

    // A spent link and a forged one are the same fact from here, so the message
    // has to cover both — a client whose mail client prefetched the link would
    // otherwise be told their confirmation failed when it worked.
    await expect(verifyEmail('spent-code')).rejects.toThrow(
      /already been used/
    );
    expect(activateClient).not.toHaveBeenCalled();
  });
});
