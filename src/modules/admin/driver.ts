import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  ClsOrder,
  ClsOrderDestinations,
  OrderTravellerDetails,
  ScanGroup,
} from '../../models';
import { sequelize } from '../../config/database';
import { created, ok } from '../../shared/http/responses';
import { badRequest, conflict, notFound } from '../../shared/errors';
import { toIso, toLegacyDateTime } from '../../shared/dates';
import { clean, fullName } from '../../shared/text';
import { idParam, validate, validParams, validQuery } from '../../shared/validation';
import { ORDER_TYPE } from '../../domain/codes';
import { orderIdFromReference, orderReference } from '../../domain/orderReference';
import { currentUserId } from '../../middleware/authenticate';

/**
 * The driver page: find an order, take the receiver's signature, or sign a group.
 *
 * ## What this replaces
 *
 * The legacy `CLSdriverBundle` — a separate mobile login on the old site where a
 * courier opened an order, handed the phone over, and the receiver drew a
 * signature and typed their name. This is the same job over the new API. It is not
 * a port of the code: the legacy built SQL by string concatenation from the
 * request and wrote the whole page's state through a session.
 *
 * ## What it writes
 *
 * Three columns on the order's destination row, exactly the three the legacy
 * wrote, so nothing downstream has to learn a new shape:
 *
 * - `signature` — the signature pad's strokes as JSON, `[{ lx, ly, mx, my }, …]`.
 *   Not a PNG: the Document Legalisation screen, the print sheets and the legacy
 *   site itself already replay that format, and a file would add storage the
 *   screen does not need.
 * - `sig_name` — who signed.
 * - `visa_date_submitted_for_processing` — when. The legacy stamped it on signing
 *   and it is what the queues read as "submitted for processing".
 *
 * and, for a group, the driver's own rows in `tbl_scan_group`.
 *
 * ## What it will not do
 *
 * Overwrite a signature. The legacy hid the form once an order was signed, but its
 * save endpoint would still replace one if posted to; a signature that proves a
 * hand-over should not be replaceable by a second request, so this answers 409.
 */

/** What the legacy driver screens called each order type. */
const DRIVER_ORDER_TYPE_LABEL: Record<number, string> = {
  [ORDER_TYPE.POLICE_CLEARANCE]: 'Police Clearance',
  [ORDER_TYPE.PUBLIC_VISA]: 'Public Visa Application',
  [ORDER_TYPE.DOCUMENT_DELIVERY]: 'Document Delivery',
  [ORDER_TYPE.RUSSIAN_VISA_VOUCHER]: 'Russian Visa Voucher',
  [ORDER_TYPE.DOCUMENT_LEGALISATION]: 'Document Legalisation',
};

/** The longest stroke list accepted. A real signature is a few hundred segments. */
export const MAX_SEGMENTS = 6000;

/** `signature` is a TEXT column (65,535 bytes); stay well inside it. */
export const MAX_SIGNATURE_LENGTH = 60_000;

export interface Segment {
  lx: number;
  ly: number;
  mx: number;
  my: number;
}

const segmentSchema = z.object({
  lx: z.number().finite(),
  ly: z.number().finite(),
  mx: z.number().finite(),
  my: z.number().finite(),
});

const round = (value: number): number => Math.round(value * 100) / 100;

/**
 * The strokes as they are stored, or a reason they are not acceptable.
 *
 * Validated rather than trusted: the column is replayed by other screens, so a
 * body that is not what the pad produces would break them. Coordinates are rounded
 * to two places, which the eye cannot tell and which keeps a signature small.
 */
export const serialiseSignature = (
  strokes: unknown
): { ok: true; json: string } | { ok: false; reason: string } => {
  if (!Array.isArray(strokes) || strokes.length === 0) {
    return { ok: false, reason: 'Please draw the receiver’s signature.' };
  }

  if (strokes.length > MAX_SEGMENTS) {
    return { ok: false, reason: 'That signature is too long. Please clear it and try again.' };
  }

  const parsed = z.array(segmentSchema).safeParse(strokes);

  if (!parsed.success) {
    return { ok: false, reason: 'That signature could not be read. Please clear it and try again.' };
  }

  const json = JSON.stringify(
    parsed.data.map(({ lx, ly, mx, my }) => ({
      lx: round(lx),
      ly: round(ly),
      mx: round(mx),
      my: round(my),
    }))
  );

  if (json.length > MAX_SIGNATURE_LENGTH) {
    return { ok: false, reason: 'That signature is too long. Please clear it and try again.' };
  }

  return { ok: true, json };
};

export interface DriverSearch {
  orderId: number;
  /** The legacy `12-AE` form: the destination the driver is collecting for. */
  countryCode: string | null;
}

/**
 * What a driver types or scans: `12`, `12-AE` (the label the legacy printed, with
 * the destination's country code), or `CLS-000012`.
 *
 * Null for anything else. The legacy took `explode('-')[0]` of whatever it was
 * given and concatenated it into SQL, so `12abc` quietly became order 12; here it
 * is simply not an order number.
 */
export const parseDriverSearch = (raw: string): DriverSearch | null => {
  const text = raw.trim();

  const reference = orderIdFromReference(text);
  if (reference !== null) return { orderId: reference, countryCode: null };

  const match = /^(\d{1,9})(?:-([A-Za-z]{2,3}))?$/.exec(text);
  if (!match) return null;

  const orderId = Number(match[1]);
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return null;

  return { orderId, countryCode: match[2] ? match[2].toUpperCase() : null };
};

export interface DriverOrder {
  id: number;
  reference: string;
  /** `tbl_cls_order.status`: 0 ordered, 1 paid, 2 CLS confirmed. */
  status: number;
  orderType: string | null;
  destination: string | null;
  /** The destination row's id: the row the signature is written to. */
  destinationId: number | null;
  primaryTraveller: string | null;
  signed: boolean;
  signeeName: string | null;
  /**
   * The stored strokes, so the completed screen can show what was signed. Null when
   * unsigned, and when the column holds a PNG filename (a public visa signature taken
   * on the admin screen), which this page does not draw.
   */
  signature: unknown[] | null;
  /** When it was signed for, ISO 8601. */
  processedAt: string | null;
}

/**
 * The destination a driver is signing for.
 *
 * With a country code, the destination in that country — that is what the `-AE`
 * on a label is for. Without one, the order's first destination, which is what the
 * legacy used (`findOneBy order_id`). Null when the order has no destination row,
 * or none in that country.
 */
const pickDestination = (
  destinations: readonly ClsOrderDestinations[],
  countryCode: string | null
): ClsOrderDestinations | null => {
  if (countryCode === null) return destinations[0] ?? null;

  return (
    destinations.find(
      (destination) =>
        clean(
          (destination as unknown as { country?: { country_code: string | null } | null })
            .country?.country_code
        )?.toUpperCase() === countryCode
    ) ?? null
  );
};

const loadDestinations = (orderId: number): Promise<ClsOrderDestinations[]> =>
  ClsOrderDestinations.findAll({
    where: { order_id: orderId },
    include: [{ association: 'country', required: false }],
    order: [['id', 'ASC']],
  });

const strokesOf = (stored: string | null | undefined): unknown[] | null => {
  const text = clean(stored);
  if (!text?.startsWith('[')) return null;

  try {
    const parsed: unknown = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const presentOrder = async (
  order: ClsOrder,
  destination: ClsOrderDestinations | null
): Promise<DriverOrder> => {
  const travellers = await OrderTravellerDetails.findAll({
    where: { order_id: order.id },
    order: [
      ['is_primary', 'DESC'],
      ['id', 'ASC'],
    ],
    limit: 1,
  });
  const traveller = travellers[0] ?? null;

  const country = (destination as unknown as {
    country?: { country_name: string | null } | null;
  } | null)?.country;

  return {
    id: order.id,
    reference: orderReference(order.id),
    status: order.status ?? 0,
    orderType: DRIVER_ORDER_TYPE_LABEL[order.order_type ?? 0] ?? null,
    destination: clean(country?.country_name),
    destinationId: destination?.id ?? null,
    primaryTraveller: traveller
      ? fullName(traveller.first_name, traveller.last_name) || null
      : null,
    signed: clean(destination?.signature) !== null,
    signeeName: clean(destination?.sig_name),
    signature: strokesOf(destination?.signature),
    processedAt: toIso(destination?.visa_date_submitted_for_processing ?? null),
  };
};

/** One order for the driver, or null when there is no such order or country. */
const findDriverOrder = async (search: DriverSearch): Promise<DriverOrder | null> => {
  const order = await ClsOrder.findByPk(search.orderId);
  if (!order) return null;

  const destinations = await loadDestinations(order.id);
  const destination = pickDestination(destinations, search.countryCode);

  if (search.countryCode !== null && !destination) return null;

  return presentOrder(order, destination);
};

const searchQuery = z.object({ search: z.string().trim().max(32).optional() });
const idParams = validate(z.object({ id: idParam }), 'params');

const signBody = z.object({
  signature: z.unknown(),
  name: z.string().trim().min(1, 'Enter the receiver’s name.').max(255, 'That name is too long.'),
  /** The destination the driver was shown, so a second destination is not signed by accident. */
  destinationId: idParam.optional(),
});

const groupAddBody = z.object({ order: z.string().trim().min(1).max(32) });
const groupSignBody = z.object({
  signature: z.unknown(),
  name: z.string().trim().min(1, 'Enter the receiver’s name.').max(255, 'That name is too long.'),
});

export type DriverAudit = (
  req: Request,
  action: string,
  detail: Record<string, unknown>
) => Promise<void>;

/** `/api/admin/driver/…`. Inherits `authenticate, requireAdmin` from the admin router. */
export const driverRoutes = (audit: DriverAudit): Router => {
  const router = Router();

  /**
   * Looks one order up by number, the way the legacy search box did: one order or
   * nothing. A blank search is an empty answer, not "every order" — a driver's
   * phone should not be sent five years of them.
   */
  router.get('/orders', validate(searchQuery, 'query'), async (req: Request, res: Response) => {
    const { search } = validQuery<{ search?: string }>(req);

    if (!search) return ok(res, { orders: [] });

    const parsed = parseDriverSearch(search);
    const found = parsed ? await findDriverOrder(parsed) : null;

    return ok(res, { orders: found ? [found] : [] });
  });

  router.get('/orders/:id', idParams, validate(z.object({ country: z.string().trim().max(3).optional() }), 'query'), async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const { country } = validQuery<{ country?: string }>(req);

    const order = await findDriverOrder({
      orderId: id,
      countryCode: country ? country.toUpperCase() : null,
    });
    if (!order) throw notFound('We could not find that order.');

    return ok(res, { order });
  });

  /** The receiver's signature for one order. */
  router.post('/orders/:id/signature', idParams, validate(signBody), async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const { signature, name, destinationId } = req.body as z.infer<typeof signBody>;

    const strokes = serialiseSignature(signature);
    if (!strokes.ok) throw badRequest(strokes.reason, { signature: strokes.reason });

    const order = await ClsOrder.findByPk(id);
    if (!order) throw notFound('We could not find that order.');

    const destinations = await loadDestinations(id);
    const destination = destinationId
      ? (destinations.find((candidate) => candidate.id === destinationId) ?? null)
      : (destinations[0] ?? null);
    if (!destination) throw notFound('That order has no destination to sign for.');

    if (clean(destination.signature) !== null) {
      throw conflict('This order has already been signed for.');
    }

    const processedAt = toLegacyDateTime();
    await destination.update({
      signature: strokes.json,
      sig_name: name,
      visa_date_submitted_for_processing: processedAt,
    });

    await audit(req, 'driver.signature', {
      orderId: id,
      destinationId: destination.id,
      signee: name,
    });

    return created(res, { order: await presentOrder(order, destination) });
  });

  // -------------------------------------------------------------------------
  // Group scan
  // -------------------------------------------------------------------------

  const groupOf = async (userId: number) => {
    const rows = await ScanGroup.findAll({ where: { user_id: userId }, order: [['id', 'ASC']] });
    const orders: DriverOrder[] = [];

    for (const row of rows) {
      const order = row.order_no ? await ClsOrder.findByPk(row.order_no) : null;
      if (!order) continue;
      const destinations = await loadDestinations(order.id);
      orders.push(await presentOrder(order, destinations[0] ?? null));
    }

    return orders;
  };

  /** The orders this driver has scanned into their group so far. */
  router.get('/group', async (req: Request, res: Response) =>
    ok(res, { orders: await groupOf(currentUserId(req)) })
  );

  /** Adds an order to the driver's group. Adding it twice is not an error and not a second row. */
  router.post('/group', validate(groupAddBody), async (req: Request, res: Response) => {
    const userId = currentUserId(req);
    const parsed = parseDriverSearch((req.body as z.infer<typeof groupAddBody>).order);
    if (!parsed) throw badRequest('That is not an order number.');

    const found = await findDriverOrder(parsed);
    if (!found) throw notFound('We could not find that order.');
    if (found.signed) throw conflict('This order has already been signed for.');

    const existing = await ScanGroup.findOne({ where: { user_id: userId, order_no: found.id } });
    if (!existing) await ScanGroup.create({ user_id: userId, order_no: found.id, type: null, status: null });

    return created(res, { orders: await groupOf(userId) });
  });

  /** Takes one order out of the driver's group. Only the driver's own row: the legacy deleted everyone's. */
  router.delete('/group/:id', idParams, async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const userId = currentUserId(req);

    await ScanGroup.destroy({ where: { user_id: userId, order_no: id } });

    return ok(res, { orders: await groupOf(userId) });
  });

  /**
   * One signature for the whole group, then the group is emptied.
   *
   * All or nothing: every destination is signed in one transaction, so a failure
   * halfway cannot leave some orders signed and the group still holding them. An
   * order signed since it was scanned in is left alone rather than overwritten.
   */
  router.post('/group/signature', validate(groupSignBody), async (req: Request, res: Response) => {
    const userId = currentUserId(req);
    const { signature, name } = req.body as z.infer<typeof groupSignBody>;

    const strokes = serialiseSignature(signature);
    if (!strokes.ok) throw badRequest(strokes.reason, { signature: strokes.reason });

    const rows = await ScanGroup.findAll({ where: { user_id: userId } });
    if (rows.length === 0) throw conflict('There are no orders in the group to sign for.');

    const processedAt = toLegacyDateTime();
    const signed: number[] = [];
    const skipped: number[] = [];

    await sequelize.transaction(async (transaction) => {
      for (const row of rows) {
        const orderId = row.order_no;
        if (!orderId) continue;

        const destination = await ClsOrderDestinations.findOne({
          where: { order_id: orderId },
          order: [['id', 'ASC']],
          transaction,
          lock: transaction.LOCK.UPDATE,
        });

        if (!destination || clean(destination.signature) !== null) {
          skipped.push(orderId);
          continue;
        }

        await destination.update(
          {
            signature: strokes.json,
            sig_name: name,
            visa_date_submitted_for_processing: processedAt,
          },
          { transaction }
        );
        signed.push(orderId);
      }

      await ScanGroup.destroy({ where: { user_id: userId }, transaction });
    });

    await audit(req, 'driver.group-signature', { orderIds: signed, skipped, signee: name });

    return ok(res, { signed, skipped });
  });

  return router;
};
