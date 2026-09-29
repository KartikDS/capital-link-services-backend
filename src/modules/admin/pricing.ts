import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  PoliceClearances,
  RussianVisaVoucherTypes,
  SettingsDiscount,
  SettingsDocumentDelivery,
  TravelAlerts,
  VisaCourierOptions,
  WeightPrice,
} from '../../models';
import { notFound } from '../../shared/errors';
import { created, noContent, ok, paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { centsToNumber, toCents } from '../../shared/money';
import { clean } from '../../shared/text';
import { idParam, validate, validParams } from '../../shared/validation';

/**
 * Seven of the legacy "Manage Products & Prices" screens — the ones that are
 * genuinely a table of rows with a price and a status. Reproduces
 * `ManagePoliceClearancesController`, `ManageVisaCourierOptionsController`,
 * `ManageRussianVisaVoucherController`, `ManageTravelAlertsController`,
 * `ManageDiscountController`, `ManageWeightPriceController` and
 * `ManageDocumentDeliveryController`.
 *
 * Grouped in one file rather than seven, because each is genuinely small — a
 * handful of columns, list/create/update/delete over one table — and seven
 * files of that shape are seven places a shared review misses the same slip.
 * The four singleton settings screens (one row each, edit-only) are
 * `settings.ts`; `content.ts` covers content pages and sections;
 * `users.ts` the four account tables. Same reasoning throughout this admin
 * module: split where the *shape* differs, not where the legacy menu happens
 * to draw a line.
 *
 * Prices are cents in and out, as everywhere else in this API — the columns
 * themselves are decimal dollars, and `toCents`/`centsToNumber` are the one
 * place that boundary is crossed.
 */

const listQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(200).optional(),
});

const idParams = z.object({ id: idParam });

// ---------------------------------------------------------------------------
// Police clearances — the published fee list per clearance type
// ---------------------------------------------------------------------------

export const policeClearanceAdminRoutes = Router();

const clearanceBody = z.object({
  name: z.string().trim().min(1).max(255),
  nameAdditional: z.string().trim().max(255).optional(),
  priceCents: z.number().int().min(0),
  priceAdditionalCents: z.number().int().min(0).optional(),
  genInfo: z.string().max(20_000).optional(),
  status: z.union([z.literal(0), z.literal(1)]).optional(),
});

const toClearanceRow = (row: PoliceClearances) => ({
  id: row.id,
  name: clean(row.name),
  nameAdditional: clean(row.name_additional),
  priceCents: toCents(row.price),
  priceAdditionalCents: toCents(row.price_additional),
  genInfo: clean(row.gen_info),
  filePath: clean(row.file_path),
  status: row.status ?? 1,
});

policeClearanceAdminRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const page = readPage(req);
    const { rows, count } = await PoliceClearances.findAndCountAll({
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });
    paged(res, 'clearances', rows.map(toClearanceRow), pageMeta(page, count));
  }
);

policeClearanceAdminRoutes.get(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await PoliceClearances.findByPk(id);
    if (!row) throw notFound('We could not find that clearance type.');
    ok(res, { clearance: toClearanceRow(row) });
  }
);

policeClearanceAdminRoutes.post('/', async (req: Request, res: Response) => {
  const body = clearanceBody.parse(req.body);
  const row = await PoliceClearances.create({
    name: body.name,
    name_additional: body.nameAdditional ?? null,
    price: centsToNumber(body.priceCents),
    price_additional: centsToNumber(body.priceAdditionalCents ?? 0),
    gen_info: body.genInfo ?? null,
    status: body.status ?? 1,
  });
  created(res, { clearance: toClearanceRow(row) });
});

policeClearanceAdminRoutes.patch(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = clearanceBody.partial().parse(req.body);
    const row = await PoliceClearances.findByPk(id);
    if (!row) throw notFound('We could not find that clearance type.');

    await row.update({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.nameAdditional !== undefined
        ? { name_additional: body.nameAdditional }
        : {}),
      ...(body.priceCents !== undefined ? { price: centsToNumber(body.priceCents) } : {}),
      ...(body.priceAdditionalCents !== undefined
        ? { price_additional: centsToNumber(body.priceAdditionalCents) }
        : {}),
      ...(body.genInfo !== undefined ? { gen_info: body.genInfo } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    });

    ok(res, { clearance: toClearanceRow(row) });
  }
);

policeClearanceAdminRoutes.delete(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await PoliceClearances.findByPk(id);
    if (!row) throw notFound('We could not find that clearance type.');
    await row.destroy();
    noContent(res);
  }
);

// ---------------------------------------------------------------------------
// Visa courier options
// ---------------------------------------------------------------------------

export const courierOptionAdminRoutes = Router();

const courierBody = z.object({
  type: z.string().trim().min(1).max(255),
  costCents: z.number().int().min(0),
  active: z.boolean().optional(),
  availableForGov: z.boolean().optional(),
  availableForPublic: z.boolean().optional(),
  dhl: z.boolean().optional(),
  isCourierService: z.boolean().optional(),
  isAirportToAirport: z.boolean().optional(),
  isDocumentDelivery: z.boolean().optional(),
});

const toCourierRow = (row: VisaCourierOptions) => ({
  id: row.id,
  type: clean(row.type),
  costCents: toCents(row.cost),
  courierIcon: clean(row.courier_icon),
  active: row.s_active === 1,
  availableForGov: row.s_available_for_gov === 1,
  availableForPublic: row.s_available_for_public === 1,
  dhl: row.s_dhl === 1,
  isCourierService: row.is_courier_service === 1,
  isAirportToAirport: row.is_airport_to_airport === 1,
  isDocumentDelivery: row.is_document_delivery === 1,
});

const boolField = (value: boolean | undefined) =>
  value === undefined ? undefined : value ? 1 : 0;

courierOptionAdminRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const page = readPage(req);
    const { rows, count } = await VisaCourierOptions.findAndCountAll({
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });
    paged(res, 'options', rows.map(toCourierRow), pageMeta(page, count));
  }
);

courierOptionAdminRoutes.get(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await VisaCourierOptions.findByPk(id);
    if (!row) throw notFound('We could not find that courier option.');
    ok(res, { option: toCourierRow(row) });
  }
);

courierOptionAdminRoutes.post('/', async (req: Request, res: Response) => {
  const body = courierBody.parse(req.body);
  const row = await VisaCourierOptions.create({
    type: body.type,
    cost: centsToNumber(body.costCents),
    s_active: body.active === false ? 0 : 1,
    s_available_for_gov: boolField(body.availableForGov) ?? 0,
    s_available_for_public: boolField(body.availableForPublic) ?? 0,
    s_dhl: boolField(body.dhl) ?? 0,
    is_courier_service: boolField(body.isCourierService) ?? 0,
    is_airport_to_airport: boolField(body.isAirportToAirport) ?? 0,
    is_document_delivery: boolField(body.isDocumentDelivery) ?? 0,
  });
  created(res, { option: toCourierRow(row) });
});

courierOptionAdminRoutes.patch(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = courierBody.partial().parse(req.body);
    const row = await VisaCourierOptions.findByPk(id);
    if (!row) throw notFound('We could not find that courier option.');

    await row.update({
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.costCents !== undefined ? { cost: centsToNumber(body.costCents) } : {}),
      ...(body.active !== undefined ? { s_active: boolField(body.active) } : {}),
      ...(body.availableForGov !== undefined
        ? { s_available_for_gov: boolField(body.availableForGov) }
        : {}),
      ...(body.availableForPublic !== undefined
        ? { s_available_for_public: boolField(body.availableForPublic) }
        : {}),
      ...(body.dhl !== undefined ? { s_dhl: boolField(body.dhl) } : {}),
      ...(body.isCourierService !== undefined
        ? { is_courier_service: boolField(body.isCourierService) }
        : {}),
      ...(body.isAirportToAirport !== undefined
        ? { is_airport_to_airport: boolField(body.isAirportToAirport) }
        : {}),
      ...(body.isDocumentDelivery !== undefined
        ? { is_document_delivery: boolField(body.isDocumentDelivery) }
        : {}),
    });

    ok(res, { option: toCourierRow(row) });
  }
);

courierOptionAdminRoutes.delete(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await VisaCourierOptions.findByPk(id);
    if (!row) throw notFound('We could not find that courier option.');
    await row.destroy();
    noContent(res);
  }
);

// ---------------------------------------------------------------------------
// Russian visa voucher types
// ---------------------------------------------------------------------------

export const voucherTypeAdminRoutes = Router();

const voucherBody = z.object({
  type: z.string().trim().min(1).max(255),
  name: z.string().trim().min(1).max(255),
  entryOption: z.string().trim().max(255).optional(),
  typeOrder: z.string().trim().max(50).optional(),
  threeDaysProcessFeeCents: z.number().int().min(0).optional(),
  oneTwoDaysProcessFeeCents: z.number().int().min(0).optional(),
  twelveHrsProcessFeeCents: z.number().int().min(0).optional(),
  fourDaysFeeCents: z.number().int().min(0).optional(),
  thirteenDaysFeeCents: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});

const toVoucherRow = (row: RussianVisaVoucherTypes) => ({
  id: row.id,
  type: clean(row.type),
  name: clean(row.name),
  entryOption: clean(row.entry_option),
  typeOrder: clean(row.type_order),
  threeDaysProcessFeeCents: toCents(row.three_days_process_fee),
  oneTwoDaysProcessFeeCents: toCents(row.one_two_days_process_fee),
  twelveHrsProcessFeeCents: toCents(row.twelve_hrs_process_fee),
  fourDaysFeeCents: toCents(row.four_days),
  thirteenDaysFeeCents: toCents(row.thirteen_days),
  active: row.s_active === 1,
});

voucherTypeAdminRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const page = readPage(req);
    const { rows, count } = await RussianVisaVoucherTypes.findAndCountAll({
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });
    paged(res, 'types', rows.map(toVoucherRow), pageMeta(page, count));
  }
);

voucherTypeAdminRoutes.get(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await RussianVisaVoucherTypes.findByPk(id);
    if (!row) throw notFound('We could not find that voucher type.');
    ok(res, { type: toVoucherRow(row) });
  }
);

voucherTypeAdminRoutes.post('/', async (req: Request, res: Response) => {
  const body = voucherBody.parse(req.body);
  const row = await RussianVisaVoucherTypes.create({
    type: body.type,
    name: body.name,
    entry_option: body.entryOption ?? null,
    type_order: body.typeOrder ?? null,
    three_days_process_fee: centsToNumber(body.threeDaysProcessFeeCents ?? 0),
    one_two_days_process_fee: centsToNumber(body.oneTwoDaysProcessFeeCents ?? 0),
    twelve_hrs_process_fee: centsToNumber(body.twelveHrsProcessFeeCents ?? 0),
    four_days: centsToNumber(body.fourDaysFeeCents ?? 0),
    thirteen_days: centsToNumber(body.thirteenDaysFeeCents ?? 0),
    s_active: 1,
  });
  created(res, { type: toVoucherRow(row) });
});

voucherTypeAdminRoutes.patch(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = voucherBody.partial().parse(req.body);
    const row = await RussianVisaVoucherTypes.findByPk(id);
    if (!row) throw notFound('We could not find that voucher type.');

    await row.update({
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.entryOption !== undefined ? { entry_option: body.entryOption } : {}),
      ...(body.typeOrder !== undefined ? { type_order: body.typeOrder } : {}),
      ...(body.threeDaysProcessFeeCents !== undefined
        ? { three_days_process_fee: centsToNumber(body.threeDaysProcessFeeCents) }
        : {}),
      ...(body.oneTwoDaysProcessFeeCents !== undefined
        ? {
            one_two_days_process_fee: centsToNumber(body.oneTwoDaysProcessFeeCents),
          }
        : {}),
      ...(body.twelveHrsProcessFeeCents !== undefined
        ? { twelve_hrs_process_fee: centsToNumber(body.twelveHrsProcessFeeCents) }
        : {}),
      ...(body.fourDaysFeeCents !== undefined
        ? { four_days: centsToNumber(body.fourDaysFeeCents) }
        : {}),
      ...(body.thirteenDaysFeeCents !== undefined
        ? { thirteen_days: centsToNumber(body.thirteenDaysFeeCents) }
        : {}),
      ...(body.active !== undefined ? { s_active: body.active ? 1 : 0 } : {}),
    });

    ok(res, { type: toVoucherRow(row) });
  }
);

voucherTypeAdminRoutes.delete(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await RussianVisaVoucherTypes.findByPk(id);
    if (!row) throw notFound('We could not find that voucher type.');
    await row.destroy();
    noContent(res);
  }
);

// ---------------------------------------------------------------------------
// Travel alerts
// ---------------------------------------------------------------------------

export const travelAlertAdminRoutes = Router();

const alertBody = z.object({
  subject: z.string().trim().min(1).max(500),
  body: z.string().max(50_000),
  alertDate: z.string().max(32).optional(),
  status: z.string().max(20).optional(),
});

const toAlertRow = (row: TravelAlerts) => ({
  id: row.id,
  subject: clean(row.subject),
  body: clean(row.body),
  alertDate: clean(row.alert_date),
  featuredImage: clean(row.featured_image),
  status: clean(row.status) ?? 'active',
});

travelAlertAdminRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const page = readPage(req);
    const { rows, count } = await TravelAlerts.findAndCountAll({
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });
    paged(res, 'alerts', rows.map(toAlertRow), pageMeta(page, count));
  }
);

travelAlertAdminRoutes.get(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await TravelAlerts.findByPk(id);
    if (!row) throw notFound('We could not find that alert.');
    ok(res, { alert: toAlertRow(row) });
  }
);

travelAlertAdminRoutes.post('/', async (req: Request, res: Response) => {
  const body = alertBody.parse(req.body);
  const row = await TravelAlerts.create({
    subject: body.subject,
    body: body.body,
    alert_date: body.alertDate ?? null,
    status: body.status ?? 'active',
  });
  created(res, { alert: toAlertRow(row) });
});

travelAlertAdminRoutes.patch(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = alertBody.partial().parse(req.body);
    const row = await TravelAlerts.findByPk(id);
    if (!row) throw notFound('We could not find that alert.');

    await row.update({
      ...(body.subject !== undefined ? { subject: body.subject } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
      ...(body.alertDate !== undefined ? { alert_date: body.alertDate } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    });

    ok(res, { alert: toAlertRow(row) });
  }
);

travelAlertAdminRoutes.delete(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await TravelAlerts.findByPk(id);
    if (!row) throw notFound('We could not find that alert.');
    await row.destroy();
    noContent(res);
  }
);

// ---------------------------------------------------------------------------
// Discount codes
// ---------------------------------------------------------------------------

export const discountAdminRoutes = Router();

const discountBody = z.object({
  name: z.string().trim().min(1).max(255),
  code: z.string().trim().min(1).max(64),
  rate: z.number().min(0).max(100),
});

/**
 * `tbl_settings_discount.code` is stored as `varbinary`, not `varchar` — the
 * dump does not say why, and there is no encryption key involved, so this
 * treats it as plain text held in binary and converts at the boundary.
 */
const toDiscountRow = (row: SettingsDiscount) => ({
  id: row.id,
  name: clean(row.name),
  code: row.code ? row.code.toString('utf8') : null,
  rate: row.rate,
});

discountAdminRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const page = readPage(req);
    const { rows, count } = await SettingsDiscount.findAndCountAll({
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });
    paged(res, 'discounts', rows.map(toDiscountRow), pageMeta(page, count));
  }
);

discountAdminRoutes.get(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await SettingsDiscount.findByPk(id);
    if (!row) throw notFound('We could not find that discount code.');
    ok(res, { discount: toDiscountRow(row) });
  }
);

discountAdminRoutes.post('/', async (req: Request, res: Response) => {
  const body = discountBody.parse(req.body);
  const row = await SettingsDiscount.create({
    name: body.name,
    code: Buffer.from(body.code, 'utf8'),
    rate: body.rate,
  });
  created(res, { discount: toDiscountRow(row) });
});

discountAdminRoutes.patch(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = discountBody.partial().parse(req.body);
    const row = await SettingsDiscount.findByPk(id);
    if (!row) throw notFound('We could not find that discount code.');

    await row.update({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.code !== undefined ? { code: Buffer.from(body.code, 'utf8') } : {}),
      ...(body.rate !== undefined ? { rate: body.rate } : {}),
    });

    ok(res, { discount: toDiscountRow(row) });
  }
);

discountAdminRoutes.delete(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await SettingsDiscount.findByPk(id);
    if (!row) throw notFound('We could not find that discount code.');
    await row.destroy();
    noContent(res);
  }
);

// ---------------------------------------------------------------------------
// Weight price bands — document delivery pricing by weight range
// ---------------------------------------------------------------------------

export const weightPriceAdminRoutes = Router();

const weightBody = z.object({
  weightLowerLimit: z.number().min(0),
  weightUpperLimit: z.number().min(0),
  priceCents: z.number().int().min(0),
});

const toWeightRow = (row: WeightPrice) => ({
  id: row.id,
  weightLowerLimit: row.weight_lower_limit,
  weightUpperLimit: row.weight_upper_limit,
  priceCents: toCents(row.price),
});

weightPriceAdminRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const page = readPage(req);
    const { rows, count } = await WeightPrice.findAndCountAll({
      order: [['weight_lower_limit', 'ASC']],
      limit: page.limit,
      offset: page.offset,
    });
    paged(res, 'bands', rows.map(toWeightRow), pageMeta(page, count));
  }
);

weightPriceAdminRoutes.get(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await WeightPrice.findByPk(id);
    if (!row) throw notFound('We could not find that weight band.');
    ok(res, { band: toWeightRow(row) });
  }
);

weightPriceAdminRoutes.post('/', async (req: Request, res: Response) => {
  const body = weightBody.parse(req.body);
  const row = await WeightPrice.create({
    weight_lower_limit: body.weightLowerLimit,
    weight_upper_limit: body.weightUpperLimit,
    price: centsToNumber(body.priceCents) ?? 0,
  });
  created(res, { band: toWeightRow(row) });
});

weightPriceAdminRoutes.patch(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = weightBody.partial().parse(req.body);
    const row = await WeightPrice.findByPk(id);
    if (!row) throw notFound('We could not find that weight band.');

    await row.update({
      ...(body.weightLowerLimit !== undefined
        ? { weight_lower_limit: body.weightLowerLimit }
        : {}),
      ...(body.weightUpperLimit !== undefined
        ? { weight_upper_limit: body.weightUpperLimit }
        : {}),
      ...(body.priceCents !== undefined
        ? { price: centsToNumber(body.priceCents) ?? 0 }
        : {}),
    });

    ok(res, { band: toWeightRow(row) });
  }
);

weightPriceAdminRoutes.delete(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await WeightPrice.findByPk(id);
    if (!row) throw notFound('We could not find that weight band.');
    await row.destroy();
    noContent(res);
  }
);

// ---------------------------------------------------------------------------
// Document delivery types
// ---------------------------------------------------------------------------

export const documentDeliveryTypeAdminRoutes = Router();

const deliveryTypeBody = z.object({
  type: z.string().trim().min(1).max(255),
  costCents: z.number().int().min(0),
  status: z.union([z.literal(0), z.literal(1)]).optional(),
});

const toDeliveryTypeRow = (row: SettingsDocumentDelivery) => ({
  id: row.id,
  type: clean(row.type),
  costCents: toCents(row.cost),
  status: row.status ?? 1,
});

documentDeliveryTypeAdminRoutes.get(
  '/',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const page = readPage(req);
    const { rows, count } = await SettingsDocumentDelivery.findAndCountAll({
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });
    paged(res, 'types', rows.map(toDeliveryTypeRow), pageMeta(page, count));
  }
);

documentDeliveryTypeAdminRoutes.get(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await SettingsDocumentDelivery.findByPk(id);
    if (!row) throw notFound('We could not find that delivery type.');
    ok(res, { type: toDeliveryTypeRow(row) });
  }
);

documentDeliveryTypeAdminRoutes.post('/', async (req: Request, res: Response) => {
  const body = deliveryTypeBody.parse(req.body);
  const row = await SettingsDocumentDelivery.create({
    type: body.type,
    cost: centsToNumber(body.costCents),
    status: body.status ?? 1,
  });
  created(res, { type: toDeliveryTypeRow(row) });
});

documentDeliveryTypeAdminRoutes.patch(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = deliveryTypeBody.partial().parse(req.body);
    const row = await SettingsDocumentDelivery.findByPk(id);
    if (!row) throw notFound('We could not find that delivery type.');

    await row.update({
      ...(body.type !== undefined ? { type: body.type } : {}),
      ...(body.costCents !== undefined ? { cost: centsToNumber(body.costCents) } : {}),
      ...(body.status !== undefined ? { status: body.status } : {}),
    });

    ok(res, { type: toDeliveryTypeRow(row) });
  }
);

documentDeliveryTypeAdminRoutes.delete(
  '/:id',
  validate(idParams, 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await SettingsDocumentDelivery.findByPk(id);
    if (!row) throw notFound('We could not find that delivery type.');
    await row.destroy();
    noContent(res);
  }
);
