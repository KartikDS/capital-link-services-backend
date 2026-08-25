import { Op, type Transaction } from 'sequelize';
import { UserAdmin, UserClient } from '../../models';
import { toLegacyDate, toLegacyDateTime } from '../../shared/dates';
import { normaliseEmail } from '../../shared/text';
import { ENABLED } from '../../domain/codes';

/**
 * Every query the auth module makes.
 *
 * Two user tables, not one. `tbl_user_client` holds clients and
 * `tbl_user_admin` holds staff, with no shared key and no role column between
 * them — so "find the user with this email" is two lookups, and an email could
 * in principle exist in both. Which of the two is consulted is the caller's
 * choice rather than a fallback chain: `signIn` looks in one table per attempt,
 * and the website's sign-in only ever asks for the client one. See the note on
 * `signIn` for why staff credentials are not accepted there.
 *
 * `tbl_user_embassy` and `tbl_user_tpn` are two further sets of credentials in
 * this schema. They are not wired into sign-in: nothing on the website signs an
 * embassy officer in, and adding a path for it without a screen behind it would
 * be an authentication surface with no purpose.
 */

/**
 * Accounts that may sign in.
 *
 * `s_enabled` is the old application's switch and `s_archive` its soft delete,
 * and both are nullable — five years of rows include accounts where neither was
 * ever set. A null `s_enabled` is treated as *not* enabled, because the column
 * exists to be an opt-in and defaulting the other way would let every
 * half-created row sign in.
 */
const signInScope = {
  s_enabled: ENABLED,
  s_archive: { [Op.or]: [{ [Op.is]: null }, { [Op.ne]: 1 }] },
};

export const findClientByEmail = async (
  email: string
): Promise<UserClient | null> => {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;

  // `email` is `char(100)` with no unique index, so duplicates are possible in
  // five years of data. Ordered by id so the same row wins every time rather
  // than whichever MySQL happens to return first.
  return UserClient.findOne({
    where: { email: normalised, ...signInScope },
    order: [['id', 'ASC']],
  });
};

/** Any client with this address, enabled or not — for the availability check. */
export const findAnyClientByEmail = async (
  email: string
): Promise<UserClient | null> => {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;

  return UserClient.findOne({
    where: { email: normalised },
    order: [['id', 'ASC']],
  });
};

export const findClientById = (id: number): Promise<UserClient | null> =>
  UserClient.findOne({ where: { id, ...signInScope } });

export const findAdminByEmail = async (email: string): Promise<UserAdmin | null> => {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;

  return UserAdmin.findOne({
    where: { email: normalised, s_enabled: ENABLED },
    order: [['id', 'ASC']],
  });
};

export const findAdminById = (id: number): Promise<UserAdmin | null> =>
  UserAdmin.findOne({ where: { id, s_enabled: ENABLED } });

/** Finds a client by their reset pin. Used only after the token has verified. */
export const findClientByResetPin = async (
  pin: string
): Promise<UserClient | null> => {
  if (!pin) return null;

  return UserClient.findOne({
    where: { reset_pin: pin },
    order: [['id', 'ASC']],
  });
};

/**
 * Finds a client by their activation code.
 *
 * The code is what `activation_code` holds while an address is unconfirmed, and
 * it is cleared the moment it is used -- so a second lookup with the same code
 * finds nothing, which is what makes a confirmation link single-use.
 *
 * A blank argument is refused before the query runs. `activation_code` is blank
 * on every confirmed account in the table, so a query for `''` would match the
 * first of them and confirm a stranger's address.
 *
 * Archived rows are excluded, and that matters because `activateClient` sets
 * `s_enabled` as well as clearing the code. `s_archive` is this schema's soft
 * delete: without the exclusion, an old link to an account somebody deleted would
 * switch it back on, which is a deletion undone by an email from years ago.
 * Disabled-but-not-archived rows are still reachable on purpose -- that is the
 * ordinary state of a legacy account waiting on the confirmation Acme asked it
 * for, and refusing them is refusing the one case this lookup exists to serve.
 */
export const findClientByActivationCode = async (
  code: string
): Promise<UserClient | null> => {
  const trimmed = code.trim();
  if (!trimmed) return null;

  return UserClient.findOne({
    where: {
      activation_code: trimmed,
      s_archive: { [Op.or]: [{ [Op.is]: null }, { [Op.ne]: 1 }] },
    },
    order: [['id', 'ASC']],
  });
};

export interface NewClient {
  type: string;
  title: string | null;
  fname: string;
  lname: string;
  email: string;
  password: string;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  displayId: string;
  /**
   * The pending email confirmation, or null for an account that needs none.
   *
   * `char(100)` and nullable. The Acme application reads it as "this account has
   * not confirmed its email address yet" and refuses the login while it is set --
   * see `CLShomeBundle/Controller/UserLoginController.php`, which answers "Your
   * account is not verified." on a non-empty value.
   *
   * That is now a *pending* confirmation rather than a lockout, and it is the
   * change that made writing a code here safe: the website emails the link, the
   * website has a page that redeems it, and `activateClient` clears the column.
   * Neither of those existed when this was documented as always-null, which is
   * why it was.
   *
   * Still null on one path: `orders.claim` opens an account for a guest who
   * checked out without one. They never asked to register and CLS emails them
   * their credentials, so there is no confirmation for them to be waiting on --
   * writing a code would bar them from the Acme site over a link they were never
   * expecting.
   */
  activationCode: string | null;
}

/**
 * Creates a client account.
 *
 * `s_enabled` is set to 1 so the new client can sign in immediately, which is
 * what the website's register-then-continue flow expects: the account is usable
 * straight away rather than locked, because the alternative strands anyone whose
 * confirmation email is delayed halfway through placing an order.
 *
 * **`activation_code` carries the pending email confirmation**, on the one path
 * that has a confirmation to be pending: registration. It was null for a while,
 * and the reason was sound at the time -- a code that nothing emailed and nothing
 * could clear was a permanent Acme lockout dressed up as a confirmation. Both
 * halves now exist, so a code written here is redeemed by the link in the
 * verification email and cleared by `activateClient`. Guest-checkout accounts
 * still pass null; see `NewClient.activationCode`.
 *
 * `is_address_confirmed` is left at the column's own default. The old admin
 * screens use it to mark an address a consultant has checked, and a new account
 * has not had one checked.
 */
export const createClient = (
  input: NewClient,
  /**
   * The transaction to enlist in, where the caller has one.
   *
   * Optional because registration has nothing else to write and so has no
   * transaction to offer. `orders.claim` does: it creates the account *and*
   * stamps the order's `client_id`, and an account left behind by a failed
   * stamp would be a login the client was never told about.
   */
  transaction?: Transaction
): Promise<UserClient> =>
  UserClient.create({
    type: input.type,
    display_id: input.displayId,
    title: input.title,
    fname: input.fname,
    lname: input.lname,
    password: input.password,
    email: input.email,
    phone: input.phone,
    mobile: input.mobile,
    company: input.company,
    activation_code: input.activationCode,
    s_enabled: ENABLED,
    s_archive: 0,
    last_login: null,
  }, transaction ? { transaction } : {});

/**
 * Replaces a stored password hash.
 *
 * Also clears `reset_pin`, in the same statement. A reset that left the pin
 * behind would leave it usable a second time, and there is no separate
 * "consumed" column in this schema to mark it with.
 */
export const setClientPassword = async (
  id: number,
  passwordHash: string
): Promise<void> => {
  await UserClient.update(
    { password: passwordHash, reset_pin: null },
    { where: { id } }
  );
};

export const setClientResetPin = async (
  id: number,
  pin: string | null
): Promise<void> => {
  await UserClient.update({ reset_pin: pin }, { where: { id } });
};

/**
 * Marks an address confirmed.
 *
 * Clearing `activation_code` is the whole confirmation: it is the column the Acme
 * login reads to decide whether an account is verified, and it is what
 * `emailVerified` on the session is derived from. Null rather than the empty
 * string Acme writes -- the column is nullable, the model types it as nullable,
 * and Acme's own check (`!= ''`) treats null and `''` alike.
 *
 * `s_enabled` is set in the same statement. It is already 1 on anything this
 * stack created, but a legacy row carrying a code Acme issued may not be, and an
 * account that confirmed its address and still could not sign in would be a
 * confirmation that did nothing.
 */
export const activateClient = async (id: number): Promise<void> => {
  await UserClient.update(
    { s_enabled: ENABLED, activation_code: null },
    { where: { id } }
  );
};

/**
 * Replaces the pending confirmation code.
 *
 * For a resend. The old code stops working the moment this lands, which is the
 * point: a client who asked for a second email should not be left with two live
 * links, and only one column is available to hold either of them.
 */
export const setClientActivationCode = async (
  id: number,
  code: string
): Promise<void> => {
  await UserClient.update({ activation_code: code }, { where: { id } });
};

/**
 * Stamps the sign-in.
 *
 * `tbl_user_client.last_login` is a `date` and `tbl_user_admin.last_login` is a
 * `char(20)`, so the two tables need different values for the same event —
 * which is why this is two functions rather than one with a table argument.
 *
 * Both swallow their errors. A sign-in that succeeded must not fail because a
 * bookkeeping column could not be written, and in read-only mode this write is
 * refused by design.
 */
export const stampClientLogin = async (id: number): Promise<void> => {
  await UserClient.update({ last_login: toLegacyDate() }, { where: { id } });
};

export const stampAdminLogin = async (id: number): Promise<void> => {
  await UserAdmin.update({ last_login: toLegacyDateTime() }, { where: { id } });
};

/**
 * The next account number.
 *
 * `display_id` is the human-facing account number the old application shows on
 * invoices, and it is a `varchar` with no sequence behind it. Derived from the
 * highest existing id rather than a count, because a count skips numbers as
 * soon as one row is deleted and two clients would end up sharing a number.
 */
export const nextDisplayId = async (): Promise<string> => {
  const latest = await UserClient.findOne({
    attributes: ['id'],
    order: [['id', 'DESC']],
  });

  const next = (latest?.id ?? 0) + 1;
  return `CLS${String(next).padStart(6, '0')}`;
};
