import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { badRequest, conflict, unauthorized } from '../../shared/errors';
import { logger } from '../../shared/logger';
import {
  hashPassword,
  NEVER_MATCHES,
  newResetPin,
  newToken,
  shouldRehash,
  verifyPassword,
} from '../../shared/passwords';
import { clean, fullName, normaliseEmail } from '../../shared/text';
import {
  accessTokenSeconds,
  issueAccessToken,
  issueRefreshToken,
  verifyRefreshToken,
  type Audience,
} from '../../shared/tokens';
import { CLIENT_TYPE } from '../../domain/codes';
import type { UserAdmin, UserClient } from '../../models';
import * as repository from './auth.repository';

/**
 * The rules around signing in.
 *
 * Separated from the queries because the rules are the interesting part — "a
 * disabled account cannot sign in", "a wrong password and an unknown address
 * give the same answer" — and those read badly with SQL in between them.
 *
 * ## What the schema does not give us
 *
 * There is no session table, no refresh-token table and no `password_reset`
 * table anywhere in these ninety-four tables, and the schema is fixed. Three
 * consequences, each handled rather than ignored:
 *
 * - **Sessions are stateless.** Nothing to delete on sign-out, so `logout` is
 *   the website discarding its cookie. Access tokens are short (an hour) so the
 *   window a stolen one is useful for is small.
 * - **Reset tokens carry their own expiry.** `reset_pin` is `char(10)` with no
 *   expiry column beside it. So the pin goes in the column and the client
 *   receives a signed token that *contains* the pin and an expiry — the column
 *   proves the pin is still current, the signature proves it has not been
 *   tampered with, and the `exp` claim provides the timeout the column cannot.
 * - **Ten characters is not much entropy.** Hence the hard rate limit on the
 *   reset endpoints, and the short expiry. Both are in place because the column
 *   width is not negotiable.
 */

export interface SignedInUser {
  id: number;
  audience: Audience;
  email: string | null;
  name: string | null;
  clientType: string | null;
  company: string | null;
  accountNumber: string | null;
  /**
   * Whether the address on the account has been confirmed.
   *
   * Derived from `activation_code` being blank, because there is no
   * `email_verified` column on `tbl_user_client` and the schema is fixed. That
   * column is the only place either application records the answer -- see
   * `isEmailVerified` below.
   *
   * Reported rather than enforced. An unconfirmed client still gets a session:
   * registration is followed straight away by "carry on with your order", and
   * barring them at that point strands anyone whose email is slow. The website
   * uses this to ask them to confirm, not to lock them out.
   */
  emailVerified: boolean;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires, so the caller can refresh early. */
  expiresIn: number;
  user: SignedInUser;
}

/**
 * Whether a client's address is confirmed.
 *
 * A blank `activation_code` means yes. That is not a convention invented here --
 * it is what the Acme application already reads: its login refuses an account
 * whose code is non-empty with "Your account is not verified.", and its
 * confirmation action clears the column. Written as one function so this stack
 * and that one cannot drift on what "verified" means.
 *
 * `clean` rather than a null check, because Acme writes the empty string where
 * this stack writes null and five years of rows hold both.
 */
const isEmailVerified = (row: UserClient): boolean =>
  clean(row.activation_code) === null;

const clientToUser = (row: UserClient): SignedInUser => ({
  id: row.id,
  audience: 'client',
  email: clean(row.email),
  name: fullName(row.fname, row.lname),
  clientType: clean(row.type) ?? CLIENT_TYPE.PUBLIC,
  company: clean(row.company),
  accountNumber: clean(row.display_id) ?? clean(row.account_no),
  emailVerified: isEmailVerified(row),
});

const adminToUser = (row: UserAdmin): SignedInUser => ({
  id: row.id,
  audience: 'admin',
  email: clean(row.email),
  name: fullName(row.fname, row.lname),
  clientType: null,
  company: 'Capital Link Services',
  accountNumber: null,
  // `tbl_user_admin` has no activation column. A staff account is opened by
  // another member of staff, so there is no address to confirm and nothing to
  // ask them for -- true rather than null, so the website has no third state to
  // render.
  emailVerified: true,
});

const startSession = (user: SignedInUser): Session => {
  const sid = crypto.randomUUID();

  return {
    accessToken: issueAccessToken({
      sub: user.id,
      aud: user.audience,
      email: user.email,
      clientType: user.clientType,
      sid,
    }),
    refreshToken: issueRefreshToken({ sub: user.id, aud: user.audience, sid }),
    expiresIn: accessTokenSeconds(),
    user,
  };
};

/**
 * Bookkeeping that must never fail a sign-in.
 *
 * `last_login` and a password upgrade are both nice to have. In read-only mode
 * they are refused outright, and even with writes on, a failure here means the
 * client still signed in successfully — so the error is logged and swallowed.
 */
const recordSuccessfulSignIn = async (
  user: SignedInUser,
  rehashTo: string | null
): Promise<void> => {
  try {
    if (user.audience === 'client') {
      if (rehashTo) await repository.setClientPassword(user.id, rehashTo);
      await repository.stampClientLogin(user.id);
    } else {
      await repository.stampAdminLogin(user.id);
    }
  } catch (error) {
    logger.warn('Could not record sign-in bookkeeping', {
      userId: user.id,
      audience: user.audience,
      readOnly: env.database.readOnly,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Which set of credentials a sign-in is allowed to match.
 *
 * There is no role column anywhere: staff live in `tbl_user_admin` and clients
 * in `tbl_user_client`, two tables with no shared key, so "what is this account"
 * is answered by which table the row came out of. That makes the caller's
 * intended audience the only sensible input — the door decides which table is
 * consulted, rather than the row deciding which door it came through.
 */
export type SignInAudience = 'client' | 'admin';

/** The one thing every refusal says. See the note on `signIn`. */
const REFUSED = 'Check your email address and password.';

/**
 * Email and password to a session.
 *
 * One message for every failure — unknown address, wrong password, disabled
 * account. Telling them apart is an account-enumeration oracle: an attacker with
 * a list of addresses learns which ones are CLS clients, which is itself worth
 * something.
 *
 * The password is verified even when no account was found, against a throwaway
 * hash. Skipping that returns "no such user" measurably faster than "wrong
 * password", which reintroduces exactly the oracle the shared message removes.
 *
 * ## One audience per attempt, and it defaults to the client
 *
 * This used to try `tbl_user_client` and then fall back to `tbl_user_admin`, so a
 * member of staff could sign in on the client portal with their back-office
 * credentials. The session they got was useless — the audience is stamped on the
 * token and `/api/portal/*` refuses anything that is not a client — so what it
 * actually produced was a signed-in staff member looking at a portal that
 * refused every read on it. **Staff credentials are now simply not accepted
 * here**, and the refusal is the same sentence as a wrong password: an admin who
 * types their back-office details into the portal is told the pair did not
 * match, which is both true and the only answer that does not confirm to a
 * stranger that the address belongs to CLS staff.
 *
 * `audience: 'admin'` is how the back office asks instead — `/api/admin/*` needs
 * a staff token from somewhere, and this is the one place that mints one. It has
 * to be asked for explicitly, so no caller reaches it by accident and the portal
 * cannot reach it at all.
 *
 * Only the requested table is queried, which also keeps the timing honest: a
 * client address and a staff address take the same one lookup, so the response
 * time cannot be used to tell a staff account from an unknown one.
 */
export const signIn = async (
  email: string,
  password: string,
  audience: SignInAudience = 'client'
): Promise<Session> => {
  const normalised = normaliseEmail(email);

  if (!normalised) throw unauthorized(REFUSED);

  const client =
    audience === 'client' ? await repository.findClientByEmail(normalised) : null;
  const admin =
    audience === 'admin' ? await repository.findAdminByEmail(normalised) : null;
  const row = client ?? admin;

  // `NEVER_MATCHES` rather than a hash written out here: the literal that used
  // to be inline was 59 characters, which is not a bcrypt hash. It was detected
  // as `unknown` and refused without hashing anything, so an unknown address
  // answered measurably faster than a wrong password -- the exact oracle the
  // comparison exists to close.
  const result = await verifyPassword(password, row?.password ?? NEVER_MATCHES);

  if (!row || !result.valid) {
    logger.info('Sign-in refused', {
      email: normalised,
      audience,
      found: Boolean(row),
    });
    throw unauthorized(REFUSED);
  }

  const user = client ? clientToUser(client) : adminToUser(admin as UserAdmin);

  const rehashTo = shouldRehash(result) ? await hashPassword(password) : null;
  await recordSuccessfulSignIn(user, rehashTo);

  logger.info('Signed in', {
    userId: user.id,
    audience: user.audience,
    hashAlgorithm: result.algorithm,
  });

  return startSession(user);
};

/**
 * A refresh token to a fresh session.
 *
 * The account is re-read rather than trusted from the token. A client suspended
 * since the token was issued must stop being able to refresh, and the token
 * itself cannot know that — it was signed before the change.
 */
export const refreshSession = async (refreshToken: string): Promise<Session> => {
  const claims = verifyRefreshToken(refreshToken);

  const user =
    claims.aud === 'admin'
      ? await repository.findAdminById(claims.sub).then((row) =>
          row ? adminToUser(row) : null
        )
      : await repository.findClientById(claims.sub).then((row) =>
          row ? clientToUser(row) : null
        );

  if (!user) throw unauthorized('Your session has ended. Please sign in again.');

  return startSession(user);
};

export interface RegistrationInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  title?: string | null;
  phone?: string | null;
  mobile?: string | null;
  company?: string | null;
  clientType?: string | null;
}

/**
 * A pending email confirmation: the code stored, and who to send it to.
 *
 * Shaped like `beginPasswordReset`'s return for the same reason -- the API cannot
 * send mail, so it hands the website the code and the address and the website
 * sends the link. Never rendered anywhere; the website's own route consumes it.
 */
export interface EmailVerification {
  /** Goes in `activation_code`, and in the link. */
  token: string;
  email: string;
  name: string | null;
}

/** A new account, plus the confirmation the website has to email. */
export interface Registration {
  session: Session;
  verification: EmailVerification;
}

/**
 * Creates a client account and signs them straight in.
 *
 * `tbl_user_client.email` has no unique index, so uniqueness is checked here
 * rather than caught from a constraint violation. That check is not atomic —
 * two simultaneous registrations for the same address can both pass it — and
 * there is no way to make it atomic without adding an index, which would be
 * DDL. The duplicate is survivable: sign-in orders by id and always resolves to
 * the same row.
 *
 * **The account is created unconfirmed, and still signed in.** The confirmation
 * code goes into `activation_code` and the token comes back for the website to
 * email; the session comes back beside it, because a client who has just
 * registered mid-order has to be able to carry on. So the confirmation is
 * something they are asked for on the next screen rather than a gate in front of
 * it. The one place it does bite is the Acme site, whose login refuses an account
 * with a code set — which is that application's own rule, and is now a wait for
 * an email rather than the permanent lockout it would have been before anything
 * here could clear the column.
 */
export const register = async (
  input: RegistrationInput
): Promise<Registration> => {
  const email = normaliseEmail(input.email);
  if (!email) throw badRequest('Enter a valid email address.');

  const existing = await repository.findAnyClientByEmail(email);
  if (existing) {
    throw conflict('That email address is already registered. Try signing in.');
  }

  const [passwordHash, displayId] = await Promise.all([
    hashPassword(input.password),
    repository.nextDisplayId(),
  ]);

  // Full strength, unlike the reset pin: `activation_code` is `char(100)` and a
  // 32-byte base64url token is 43 of them, so nothing here has to be traded away
  // to fit the column. The code *is* the token — there is no second place to keep
  // a digest of it, and no expiry column to pair it with, so a confirmation link
  // does not expire. That is the schema's answer rather than a preference: the
  // worst case is a link that still works in a month, and the code is replaced
  // outright by every resend.
  const activationCode = newToken();

  const created = await repository.createClient({
    type: clean(input.clientType) ?? CLIENT_TYPE.PUBLIC,
    title: clean(input.title),
    fname: input.firstName.trim(),
    lname: input.lastName.trim(),
    email,
    password: passwordHash,
    phone: clean(input.phone),
    mobile: clean(input.mobile),
    company: clean(input.company),
    displayId,
    activationCode,
  });

  logger.info('Client registered', { userId: created.id, displayId });

  return {
    session: startSession(clientToUser(created)),
    verification: {
      token: activationCode,
      email,
      name: fullName(created.fname, created.lname),
    },
  };
};

/**
 * Issues a fresh confirmation code for an account that has not confirmed yet.
 *
 * Authenticated rather than by email address, and that is what keeps it off the
 * enumeration surface entirely: the caller has already proved whose account it is,
 * so there is no "does this address exist" to be learned here. The website's
 * banner is only shown to a signed-in client, so there is no path that needs the
 * public version.
 *
 * Null when there is nothing to send — the address is already confirmed, or the
 * account has no address on it. The caller sends no email and says the same thing
 * either way, because "already confirmed" is not a failure worth an error page.
 */
export const resendEmailVerification = async (
  userId: number
): Promise<EmailVerification | null> => {
  const client = await repository.findClientById(userId);
  if (!client) throw unauthorized();

  const email = clean(client.email);

  if (!email || isEmailVerified(client)) {
    logger.info('Verification resend had nothing to send', {
      userId,
      alreadyVerified: Boolean(email) && isEmailVerified(client),
    });
    return null;
  }

  // Replaces the previous code rather than reusing it, so a client who asks
  // twice is not left with two live links and only one of them working.
  const token = newToken();
  await repository.setClientActivationCode(client.id, token);

  logger.info('Verification resent', { userId });

  return { token, email, name: fullName(client.fname, client.lname) };
};

/** Whether an address can still be registered, for the live check on the form. */
export const isEmailAvailable = async (email: string): Promise<boolean> => {
  const normalised = normaliseEmail(email);
  if (!normalised) return false;

  const existing = await repository.findAnyClientByEmail(normalised);
  return existing === null;
};

interface ResetTokenClaims {
  sub: number;
  pin: string;
  purpose: 'password-reset';
}

/**
 * Starts a password reset.
 *
 * Always resolves, whether the address exists or not, and the caller always
 * sends the same response. The returned token is null for an unknown address —
 * the endpoint then has nothing to email, and the client sees the same "if that
 * address is registered, a link is on its way" either way.
 */
export const beginPasswordReset = async (
  email: string
): Promise<{ token: string; email: string; name: string | null } | null> => {
  const normalised = normaliseEmail(email);
  if (!normalised) return null;

  const client = await repository.findClientByEmail(normalised);
  if (!client) {
    logger.info('Password reset requested for an unknown address', {
      email: normalised,
    });
    return null;
  }

  const pin = newResetPin();
  await repository.setClientResetPin(client.id, pin);

  // The expiry lives in the token because the column has nowhere to put it.
  const token = jwt.sign(
    { sub: client.id, pin, purpose: 'password-reset' } satisfies ResetTokenClaims,
    env.auth.accessSecret,
    { expiresIn: '1h', issuer: 'cls-api' }
  );

  logger.info('Password reset issued', { userId: client.id });

  return { token, email: normalised, name: fullName(client.fname, client.lname) };
};

/**
 * Completes a password reset.
 *
 * Three things have to hold: the token verifies, it has not expired, and the pin
 * it carries still matches the column. The last is what makes a token
 * single-use — completing a reset clears `reset_pin`, so replaying the same
 * token afterwards finds nothing to match.
 */
export const completePasswordReset = async (
  token: string,
  newPassword: string
): Promise<{ email: string | null; name: string | null }> => {
  let claims: ResetTokenClaims;

  try {
    claims = jwt.verify(token, env.auth.accessSecret, {
      issuer: 'cls-api',
    }) as unknown as ResetTokenClaims;
  } catch {
    throw badRequest('That reset link has expired. Please request a new one.');
  }

  if (claims.purpose !== 'password-reset') {
    throw badRequest('That reset link is not valid.');
  }

  const client = await repository.findClientById(claims.sub);

  if (!client || !client.reset_pin || client.reset_pin !== claims.pin) {
    throw badRequest('That reset link has already been used or has expired.');
  }

  await repository.setClientPassword(client.id, await hashPassword(newPassword));

  logger.info('Password reset completed', { userId: client.id });

  /**
   * Who it was, so the website can tell them their password changed.
   *
   * Returned rather than kept, because a password that changed without the owner
   * doing it is the one account event they have to be told about — and only the
   * website can send mail. Not a leak: the caller has just proved possession of a
   * valid, single-use reset token for this account, so the address it belongs to
   * is not news to them.
   */
  return { email: clean(client.email), name: clean(client.fname) };
};

/**
 * Changes a password from inside the portal.
 *
 * The current password is required even though the caller is already
 * authenticated. An access token on a shared machine should not be enough to
 * lock the real owner out of their account.
 */
export const changePassword = async (
  userId: number,
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const client = await repository.findClientById(userId);
  if (!client) throw unauthorized();

  const result = await verifyPassword(currentPassword, client.password);
  if (!result.valid) throw badRequest('That is not your current password.');

  await repository.setClientPassword(userId, await hashPassword(newPassword));

  logger.info('Password changed', { userId });
};

/**
 * Confirms an email address using the code from the link.
 *
 * The code is looked up in `activation_code` and cleared on success, which is
 * what makes the link single-use — a replay finds no row. It also means a spent
 * link and a forged one are indistinguishable from here, so the message covers
 * both rather than guessing which happened. That matters in practice: a client
 * who clicks the link twice, or whose mail client prefetched it, would otherwise
 * be told their confirmation failed when it worked the first time.
 *
 * Returns who was confirmed, so the caller can name them. Not a leak — the caller
 * has just presented a valid single-use code for this one account.
 */
export const verifyEmail = async (
  code: string
): Promise<{ email: string | null; name: string | null }> => {
  const client = await repository.findClientByActivationCode(code);

  if (!client) {
    throw badRequest(
      'That confirmation link is not valid, or it has already been used. If your address is already confirmed, just sign in.'
    );
  }

  await repository.activateClient(client.id);
  logger.info('Email verified', { userId: client.id });

  return { email: clean(client.email), name: clean(client.fname) };
};

/** The signed-in user, re-read from the database rather than from the token. */
export const currentUser = async (
  id: number,
  audience: Audience
): Promise<SignedInUser> => {
  if (audience === 'admin') {
    const admin = await repository.findAdminById(id);
    if (!admin) throw unauthorized();
    return adminToUser(admin);
  }

  const client = await repository.findClientById(id);
  if (!client) throw unauthorized();
  return clientToUser(client);
};
