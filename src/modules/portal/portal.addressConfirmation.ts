import { Op } from 'sequelize';
import { ClsOrder } from '../../models';
import { badRequest } from '../../shared/errors';
import { logger } from '../../shared/logger';
import * as orders from '../orders/orders.service';

/**
 * The client's half of "address confirmation".
 *
 * An admin sends the client the return address recorded on a Document
 * Legalisation (or public visa) order and asks them to confirm it. The old
 * system answered that link with an unauthenticated GET keyed on `order_id` and
 * `client_id` — both small integers — which flipped the flag for anyone who could
 * count. Here the caller must be the signed-in owner of the order, and
 * `orders.resolveForClient` answers 404 for anybody else.
 *
 * ## `tbl_cls_order.is_address_confirmed`
 *
 * `0` (or null) not yet confirmed, `1` the client confirmed, `2` the admin
 * discarded the notification. This writes only `0 -> 1`. A `2` stays `2`: a
 * consultant who has dismissed the request has not asked for it again, and a
 * late click on an old email must not reopen it.
 *
 * **This is not `tbl_user_client.is_address_confirmed`.** Changing a profile
 * address resets that CLIENT-level flag (`portal.service.saveAddress`). It is a
 * different column on a different table and is left alone here.
 *
 * Only `tbl_cls_order` carries the column; a legacy `tbl_orders` row has nothing
 * to confirm, and is refused rather than reported as confirmed.
 */

export type AddressConfirmationStatus = 'pending' | 'confirmed' | 'dismissed';

export interface AddressConfirmation {
  reference: string;
  status: AddressConfirmationStatus;
  /** True when this call was the one that changed the flag. */
  changed: boolean;
  /** The return address on the order — what the client is being asked to confirm. */
  address: orders.DeliveryView | null;
}

const statusOf = (flag: number | null): AddressConfirmationStatus =>
  flag === 1 ? 'confirmed' : flag === 2 ? 'dismissed' : 'pending';

const resolveClsOrder = async (clientId: number, reference: string) => {
  const resolved = await orders.resolveForClient(reference, clientId);

  if (resolved.family !== 'cls') {
    throw badRequest('This order does not have a return address to confirm.');
  }

  return resolved;
};

/** Where the order stands, and the address in question. Writes nothing. */
export const addressConfirmationState = async (
  clientId: number,
  reference: string
): Promise<AddressConfirmation> => {
  const resolved = await resolveClsOrder(clientId, reference);

  return {
    reference: orders.clientReference(resolved),
    status: statusOf(resolved.row.is_address_confirmed),
    changed: false,
    address: await orders.delivery(resolved),
  };
};

/**
 * Confirms the order's return address.
 *
 * Idempotent: the update is conditional on the flag still being unset, so a
 * second click, a double submit or two tabs write once and answer the same way.
 * The conditional `UPDATE` rather than read-then-write is what makes the
 * concurrent case safe without a transaction.
 */
export const confirmAddress = async (
  clientId: number,
  reference: string
): Promise<AddressConfirmation> => {
  const resolved = await resolveClsOrder(clientId, reference);
  const address = await orders.delivery(resolved);

  if (resolved.row.is_address_confirmed === 1) {
    return {
      reference: orders.clientReference(resolved),
      status: 'confirmed',
      changed: false,
      address,
    };
  }

  if (resolved.row.is_address_confirmed === 2) {
    return {
      reference: orders.clientReference(resolved),
      status: 'dismissed',
      changed: false,
      address,
    };
  }

  const [affected] = await ClsOrder.update(
    { is_address_confirmed: 1 },
    {
      where: {
        id: resolved.row.id,
        client_id: clientId,
        [Op.or]: [{ is_address_confirmed: 0 }, { is_address_confirmed: null }],
      },
    }
  );

  if (affected > 0) {
    logger.info('Order return address confirmed by client', {
      orderId: resolved.row.id,
      clientId,
    });
  }

  return {
    reference: orders.clientReference(resolved),
    // Zero rows means another request got there first, which is also "confirmed".
    status: 'confirmed',
    changed: affected > 0,
    address,
  };
};
