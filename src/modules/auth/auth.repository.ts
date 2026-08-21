import { Op } from 'sequelize';
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
 * in principle exist in both. Client is checked first, because that is who signs
 * in through the website.
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

export const findClientByActivationCode = async (
  code: string
): Promise<UserClient | null> => {
  if (!code) return null;
  return UserClient.findOne({ where: { activation_code: code } });
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
  activationCode: string;
}

/**
 * Creates a client account.
 *
 * `s_enabled` is set to 1 so the new client can sign in immediately, which is
 * what the website's register-then-continue flow expects. The activation code is
 * still stored and still verifiable — the account is usable while unverified
 * rather than locked, because the alternative strands anyone whose confirmation
 * email is delayed halfway through placing an order.
 *
 * `is_address_confirmed` is left at the column's own default. The old admin
 * screens use it to mark an address a consultant has checked, and a new account
 * has not had one checked.
 */
export const createClient = (input: NewClient): Promise<UserClient> =>
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
  });

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

export const activateClient = async (id: number): Promise<void> => {
  await UserClient.update(
    { s_enabled: ENABLED, activation_code: null },
    { where: { id } }
  );
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
