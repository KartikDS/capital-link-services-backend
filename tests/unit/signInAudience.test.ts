/**
 * Who may sign in where.
 *
 * `tbl_user_client` and `tbl_user_admin` are two separate tables with no role
 * column between them, and sign-in used to try one and then the other. So a
 * member of staff could sign in on the client portal with their back-office
 * password and land on a dashboard where every read was then refused, because
 * the audience is stamped on the token and `/api/portal/*` only accepts
 * `client`.
 *
 * Each assertion below pins one half of the rule that replaced that:
 *
 * 1. **A client signs in as before.** The change must not have made the portal's
 *    own sign-in stricter than it was.
 * 2. **Staff credentials are refused on a client sign-in**, with the same
 *    sentence a wrong password gets — an attacker must not be able to learn from
 *    the wording that an address belongs to CLS staff.
 * 3. **`tbl_user_admin` is not even queried** on a client sign-in. That is what
 *    keeps the timing equal: a staff address and an unknown one both cost one
 *    lookup, so the response time cannot tell them apart either.
 * 4. **The staff door still opens** when a caller asks for it, because
 *    `/api/admin/*` needs a token from somewhere and this is the only place that
 *    issues one.
 * 5. **A staff sign-in does not fall back to the client table**, so the audience
 *    on the token is always the table the row came from.
 *
 * The repository is mocked: every rule above is decided before any SQL is built.
 */

const findClientByEmail = jest.fn();
const findAdminByEmail = jest.fn();
const stampClientLogin = jest.fn();
const stampAdminLogin = jest.fn();
const setClientPassword = jest.fn();

jest.mock('../../src/modules/auth/auth.repository', () => ({
  findClientByEmail,
  findAdminByEmail,
  stampClientLogin,
  stampAdminLogin,
  setClientPassword,
}));

import { hashPassword } from '../../src/shared/passwords';
import { signIn } from '../../src/modules/auth/auth.service';
import { verifyAccessToken } from '../../src/shared/tokens';

const PASSWORD = 'a-long-enough-password';

/** The one sentence every refusal uses, wrong password or wrong site alike. */
const REFUSED = 'Check your email address and password.';

let hash: string;

beforeAll(async () => {
  // Hashed once: bcrypt is deliberately slow and every test here uses the same
  // password.
  hash = await hashPassword(PASSWORD);
});

const clientRow = () => ({
  id: 501,
  type: 'public',
  display_id: 'CLS000501',
  fname: 'Priya',
  lname: 'Raman',
  email: 'priya@example.com',
  password: hash,
  company: null,
  account_no: null,
  activation_code: null,
});

const adminRow = () => ({
  id: 7,
  fname: 'Sam',
  lname: 'Okafor',
  email: 'sam@capitallinkservices.com.au',
  password: hash,
});

beforeEach(() => {
  findClientByEmail.mockResolvedValue(null);
  findAdminByEmail.mockResolvedValue(null);
});

describe('a client signing in on the portal', () => {
  it('is signed in with a client audience', async () => {
    findClientByEmail.mockResolvedValue(clientRow());

    const session = await signIn('priya@example.com', PASSWORD);

    expect(session.user.audience).toBe('client');
    expect(session.user.id).toBe(501);
    expect(verifyAccessToken(session.accessToken).aud).toBe('client');
  });
});

describe('staff credentials on the portal', () => {
  it('are refused with the same message as a wrong password', async () => {
    findAdminByEmail.mockResolvedValue(adminRow());

    // The right password for a real, enabled staff account — the only thing
    // wrong with it is the door it was typed into.
    await expect(
      signIn('sam@capitallinkservices.com.au', PASSWORD)
    ).rejects.toMatchObject({ status: 401, message: REFUSED });

    // And identical to what an address CLS has never heard of gets, so the
    // wording cannot be used to sort staff addresses out of a list.
    await expect(signIn('nobody@example.com', 'whatever')).rejects.toMatchObject({
      status: 401,
      message: REFUSED,
    });
  });

  it('are not looked up at all, so the timing cannot tell them apart', async () => {
    findAdminByEmail.mockResolvedValue(adminRow());

    await expect(
      signIn('sam@capitallinkservices.com.au', PASSWORD)
    ).rejects.toThrow();

    // The fallback that used to be here is what made this a two-lookup answer
    // for staff and a one-lookup answer for everyone else.
    expect(findClientByEmail).toHaveBeenCalledWith('sam@capitallinkservices.com.au');
    expect(findAdminByEmail).not.toHaveBeenCalled();
  });

  it('does not sign an admin in even when the same address is a client', async () => {
    // The address exists in both tables with the same password. The portal must
    // resolve it to the client row, which is the account the portal can serve.
    findClientByEmail.mockResolvedValue(clientRow());
    findAdminByEmail.mockResolvedValue(adminRow());

    const session = await signIn('priya@example.com', PASSWORD);

    expect(session.user.audience).toBe('client');
    expect(session.user.id).toBe(501);
  });
});

describe('the staff door', () => {
  it('opens for a staff account when the caller asks for it', async () => {
    findAdminByEmail.mockResolvedValue(adminRow());

    const session = await signIn(
      'sam@capitallinkservices.com.au',
      PASSWORD,
      'admin'
    );

    // `/api/admin/*` requires this audience on the token, so this is the only
    // way a back office gets in.
    expect(session.user.audience).toBe('admin');
    expect(verifyAccessToken(session.accessToken).aud).toBe('admin');
    expect(stampAdminLogin).toHaveBeenCalledWith(7);
  });

  it('does not fall back to the client table', async () => {
    // A client's own credentials must not mint a staff token, which is what a
    // fallback in this direction would do.
    findClientByEmail.mockResolvedValue(clientRow());

    await expect(
      signIn('priya@example.com', PASSWORD, 'admin')
    ).rejects.toMatchObject({ status: 401, message: REFUSED });

    expect(findClientByEmail).not.toHaveBeenCalled();
  });
});
