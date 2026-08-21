import crypto from 'node:crypto';
import { sequelize } from '../../config/database';
import { ClsOrder } from '../../models';
import * as authRepository from '../auth/auth.repository';
import { findClsOrderIdByReference } from './orders.repository';
import { CLIENT_TYPE } from '../../domain/codes';
import { generatePassword, hashPassword } from '../../shared/passwords';
import { clean, normaliseEmail } from '../../shared/text';
import { logger } from '../../shared/logger';

/**
 * Giving a guest order an account to belong to.
 *
 * Three of the ordering journeys are open to visitors — police clearance,
 * Russian visa voucher and document legalisation — so an order can be placed,
 * paid for and confirmed by somebody who has never signed in. Until this module
 * existed, that order was stored with `client_id` NULL and stayed that way
 * forever: the portal filters on `client_id`, so the client could register the
 * next day with the same address and still be told they had no orders.
 *
 * `claim` closes that. Given a reference, it works out which account the order
 * belongs to and attaches it — creating the account when there is not one yet,
 * and handing the caller a password to email.
 *
 * ## The three outcomes, and why the caller has to tell them apart
 *
 * | Outcome | `created` | `linked` | What the caller sends |
 * | --- | --- | --- | --- |
 * | Order already had an account, or an account already existed for the address | `false` | `false` / `true` | Nothing. They have a password already. |
 * | No account existed, so one was made | `true` | `true` | The credentials email. |
 * | No contact address on the order | `false` | `false` | Nothing. There is nobody to write to. |
 *
 * The middle row is the only one that produces a plaintext password, and it
 * produces it exactly once — the second call for the same reference finds the
 * order already linked and returns the first row instead. That is what stops a
 * Stripe redelivery, or the success page racing the webhook, from sending a
 * client two different passwords.
 *
 * ## Why it locks the order row
 *
 * Two callers can arrive at the same moment: `/api/webhooks/stripe` and
 * `/payment/success` both confirm a payment, and both claim before recording it.
 * Without a lock they can both read `client_id` as NULL, both create an account
 * for the same address, and both email a password — of which only one works.
 *
 * `tbl_cls_order` is InnoDB, so `SELECT … FOR UPDATE` on the order row serialises
 * them: the second waits, re-reads, finds the `client_id` the first wrote, and
 * returns "already claimed". The lock is on the *order*, not on the account,
 * which is the right grain — two different guests registering the same address
 * at the same instant is a race this schema cannot close at all (there is no
 * unique index on `tbl_user_client.email` and adding one would be DDL), but two
 * callers claiming *one order* is the case that actually happens, and it is
 * closed.
 *
 * ## Only `tbl_cls_order`
 *
 * The legacy `tbl_orders` family is not claimable. Nothing in this API lodges
 * into it — see the note at the top of `orders.lodge` — so a legacy order with no
 * client is a five-year-old row that a consultant, not a webhook, should attach.
 */

export interface ClaimResult {
  /** Whether an account was created by this call. Only then is `password` set. */
  created: boolean;
  /** Whether this call attached the order to an account. */
  linked: boolean;
  /** The account the order now belongs to, or null when it still has none. */
  clientId: number | null;
  /** The address the account uses, for the caller's email. */
  email: string | null;
  /** The client's name, so the credentials email can greet them. */
  firstName: string | null;
  /**
   * The plaintext password, present only on `created`.
   *
   * It exists for the length of one request: generated here, hashed into the
   * row, returned to the caller to be emailed, and never written anywhere else.
   * Nothing logs it. The endpoint that returns it is internal-only for this
   * reason and no other.
   */
  password?: string;
  /** Why nothing happened, for the caller's log. Absent when something did. */
  reason?: 'unknown-order' | 'no-contact-email';
}

const nothing = (reason: ClaimResult['reason']): ClaimResult => ({
  created: false,
  linked: false,
  clientId: null,
  email: null,
  firstName: null,
  reason,
});

/**
 * The name to open the account under.
 *
 * From the order's own contact fields, which are required at lodgement, so this
 * is the name the client themselves typed. Falls back to the local part of the
 * address rather than to an empty string: `tbl_user_client.fname` is what the
 * old admin screens list clients by, and a blank one reads as a broken row.
 */
const nameFrom = (
  order: ClsOrder,
  email: string
): { firstName: string; lastName: string } => {
  const firstName = clean(order.contact_first_name);
  const lastName = clean(order.contact_last_name);

  if (firstName) return { firstName, lastName: lastName ?? '' };

  return { firstName: email.split('@')[0] ?? 'Client', lastName: lastName ?? '' };
};

/**
 * Attaches an order to an account, creating one if the address is new.
 *
 * Never throws for an ordinary miss — an unknown reference, a legacy row, an
 * order with no contact address all come back as a result with a `reason`. The
 * callers are a payment webhook and an order confirmation, and neither should
 * fail because an account could not be opened: the order is real and paid either
 * way, and a client without a portal login can still be served.
 */
export const claim = async (reference: string): Promise<ClaimResult> => {
  /**
   * Resolved to an id before the transaction opens.
   *
   * `order_no` is TEXT with no index and five years of rows in it, some with
   * whitespace around the reference — which is why the repository's lookup has a
   * `TRIM` fallback and why that lookup, rather than a `where` clause here, is
   * what finds the row. Doing it first also keeps the locked transaction to a
   * single primary-key read instead of holding it open across a table scan.
   */
  const orderId = await findClsOrderIdByReference(reference);

  if (orderId === null) {
    logger.info('Order claim skipped: no tbl_cls_order row for that reference', {
      reference,
    });

    return nothing('unknown-order');
  }

  return sequelize.transaction(async (transaction) => {
    const order = await ClsOrder.findByPk(orderId, {
      // The lock that makes this safe to call twice at once. See the note above.
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    // Deleted between the lookup and the lock. Not worth its own reason code —
    // it is the same outcome as never having existed.
    if (!order) return nothing('unknown-order');

    if (order.client_id !== null) {
      // Already somebody's — because they were signed in when they ordered,
      // because `ownerFor` matched their address at lodgement, or because this
      // ran a moment ago on the other confirmation path.
      const owner = await authRepository.findClientById(order.client_id);

      return {
        created: false,
        linked: false,
        clientId: order.client_id,
        email: clean(owner?.email),
        firstName: clean(owner?.fname),
      };
    }

    const email = normaliseEmail(order.contact_email);

    if (!email) {
      // A guest order with no address on it. Rare, and already logged loudly by
      // the checkout that produced it; there is nothing to open an account with.
      logger.warn('Order claim skipped: order has no contact email', { reference });

      return nothing('no-contact-email');
    }

    /**
     * An existing account for that address, enabled or not.
     *
     * `findAnyClientByEmail` rather than the sign-in scoped lookup, because a
     * suspended account is still that person's account. Creating a second one
     * beside it would give CLS two rows for one client and hand the client a
     * password for the wrong one.
     */
    const existing = await authRepository.findAnyClientByEmail(email);

    if (existing) {
      await order.update({ client_id: existing.id }, { transaction });

      logger.info('Guest order claimed by an existing account', {
        reference,
        clientId: existing.id,
      });

      return {
        created: false,
        linked: true,
        clientId: existing.id,
        email: clean(existing.email) ?? email,
        firstName: clean(existing.fname),
      };
    }

    const password = generatePassword();
    const { firstName, lastName } = nameFrom(order, email);

    const [passwordHash, displayId] = await Promise.all([
      hashPassword(password),
      authRepository.nextDisplayId(),
    ]);

    const client = await authRepository.createClient(
      {
        type: CLIENT_TYPE.PUBLIC,
        title: null,
        fname: firstName,
        lname: lastName,
        email,
        password: passwordHash,
        phone: clean(order.contact_phone),
        mobile: null,
        company: null,
        displayId,
        activationCode: crypto.randomBytes(16).toString('hex'),
      },
      // In the same transaction as the stamp below, so the pair is atomic: an
      // account with no order attached is a login nobody was told about.
      transaction
    );

    await order.update({ client_id: client.id }, { transaction });

    // The password is deliberately not in this line, and must not be added to
    // it. It reaches the client by email and nowhere else.
    logger.info('Account created from a guest order', {
      reference,
      clientId: client.id,
      displayId,
    });

    return {
      created: true,
      linked: true,
      clientId: client.id,
      email,
      firstName,
      password,
    };
  });
};
