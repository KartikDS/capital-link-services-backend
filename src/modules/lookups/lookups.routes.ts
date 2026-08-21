import { Op, type WhereOptions } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  AdditionalServices,
  CardTypes,
  Categories,
  Countries,
  CreditCardProcessing,
  Departments,
  Documents,
  Locations,
  NameTitle,
  PassportTypes,
  PoliceClearances,
  PublicVisaAdditionalRequirements,
  PublicVisaTypeLocations,
  PublicVisaTypes,
  RussianVisaVoucherTypes,
  SettingsDocumentDelivery,
  SettingsPassport,
  SettingsTpn,
  States,
  Terminals,
  VisaAdditionalRequirements,
  VisaCourierOptions,
  VisaTypes,
  WeightPrice,
} from '../../models';
import { notFound } from '../../shared/errors';
import { ok } from '../../shared/http/responses';
import { toCents } from '../../shared/money';
import { clean, cleanOr, toBoolean } from '../../shared/text';
import { idParam, validate, validQuery } from '../../shared/validation';
import * as present from './lookups.presenter';

/**
 * Reference data: countries, visa types, published fees and the rest.
 *
 * All public and all cacheable — the website reads these with an hour's
 * revalidation. None of it is client-specific, so none of it needs a token.
 *
 * Filtering happens in SQL rather than after the fact. `tbl_countries` holds 237
 * rows and `tbl_documents` considerably more, and pulling the table in to filter
 * it in JavaScript is a habit that stops being harmless the moment one of these
 * tables grows.
 */

export const lookupRoutes = Router();

/**
 * `disabled` on `tbl_countries` is nullable, and most rows never set it.
 *
 * So "not disabled" has to mean null *or* zero. Filtering on `disabled: 0` alone
 * would hide almost every country in the table.
 */
const notDisabled = {
  [Op.or]: [{ disabled: { [Op.is]: null } }, { disabled: 0 }],
};

/** The service flags a caller can filter countries by. */
const SERVICE_COLUMN = {
  'police-clearance': 'police_clearances',
  'document-delivery': 'secure_document_delivery',
  'document-legalisation': 'document_legalisation',
  translation: 'translation_services',
} as const;

const countryQuery = z.object({
  service: z.enum(Object.keys(SERVICE_COLUMN) as [keyof typeof SERVICE_COLUMN]).optional(),
  popular: z.enum(['true', 'false']).optional(),
  search: z.string().trim().max(100).optional(),
  /** Include countries the old admin has switched off. Off by default. */
  includeDisabled: z.enum(['true', 'false']).optional(),
});

/**
 * GET /api/lookups/countries
 *
 * Ordered by `priority` before name. That column is how CLS pins its busiest
 * destinations to the top of the select, and ignoring it would bury the UAE
 * under Afghanistan and Albania.
 */
lookupRoutes.get(
  '/countries',
  validate(countryQuery, 'query'),
  async (req: Request, res: Response) => {
    const query = validQuery<z.infer<typeof countryQuery>>(req);

    const where: WhereOptions = {
      ...(query.includeDisabled === 'true' ? {} : notDisabled),
      ...(query.service ? { [SERVICE_COLUMN[query.service]]: { [Op.gt]: 0 } } : {}),
      ...(query.popular === 'true' ? { s_popular_destination: { [Op.gt]: 0 } } : {}),
      ...(query.search
        ? {
            [Op.or]: [
              { country_name: { [Op.like]: `%${query.search}%` } },
              { country_name_display: { [Op.like]: `%${query.search}%` } },
              { country_code: query.search.toUpperCase() },
            ],
          }
        : {}),
    };

    const rows = await Countries.findAll({
      where,
      // `priority` is nullable, and MySQL sorts NULL first ascending — which
      // would put every unprioritised country above the pinned ones. Descending
      // on a coalesced value keeps the pinned ones first and the rest by name.
      order: [
        [Countries.sequelize!.literal('COALESCE(priority, 0)'), 'DESC'],
        ['country_name', 'ASC'],
      ],
    });

    ok(res, { countries: rows.map(present.toCountry), total: rows.length });
  }
);

/** GET /api/lookups/countries/:id — the full record for a destination page. */
lookupRoutes.get(
  '/countries/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validQuery<{ id: number }>(req) ?? { id: 0 };
    const resolved = id || Number((req.params as { id: string }).id);

    const row = await Countries.findByPk(resolved);
    if (!row) throw notFound('We do not have a record for that country.');

    ok(res, { country: present.toCountryDetail(row) });
  }
);

/**
 * GET /api/lookups/nationalities
 *
 * The same table as countries. A separate endpoint because the two are separate
 * selects on every order form and they are filtered differently — a nationality
 * list is never narrowed by which services CLS offers there.
 */
lookupRoutes.get('/nationalities', async (_req: Request, res: Response) => {
  const rows = await Countries.findAll({
    where: notDisabled,
    order: [['country_name', 'ASC']],
  });

  ok(res, {
    nationalities: rows.map((row) => ({
      id: row.id,
      code: clean(row.country_code),
      name: cleanOr(row.country_name_display ?? row.country_name, 'Unknown'),
      label: cleanOr(row.country_name_display ?? row.country_name, 'Unknown'),
      slug: present.slugify(row.country_name),
    })),
    total: rows.length,
  });
});

/** GET /api/lookups/states?countryId=13 */
lookupRoutes.get(
  '/states',
  validate(
    z.object({ countryId: z.coerce.number().int().positive().optional() }),
    'query'
  ),
  async (req: Request, res: Response) => {
    const { countryId } = validQuery<{ countryId?: number }>(req);

    const rows = await States.findAll({
      where: countryId ? { country_id: countryId } : {},
      order: [
        [States.sequelize!.literal('COALESCE(s_main, 0)'), 'DESC'],
        ['name', 'ASC'],
      ],
    });

    ok(res, { states: rows.map(present.toState) });
  }
);

/** GET /api/lookups/titles — Mr, Mrs, Dr. `?forVoucher=true` for the RVV form. */
lookupRoutes.get(
  '/titles',
  validate(z.object({ forVoucher: z.enum(['true', 'false']).optional() }), 'query'),
  async (req: Request, res: Response) => {
    const { forVoucher } = validQuery<{ forVoucher?: string }>(req);

    const rows = await NameTitle.findAll({
      where: forVoucher === 'true' ? { is_rvv: 1 } : {},
      order: [
        [NameTitle.sequelize!.literal('COALESCE(priority, 999)'), 'ASC'],
        ['title', 'ASC'],
      ],
    });

    ok(res, { titles: rows.map(present.toTitle) });
  }
);

lookupRoutes.get('/passport-types', async (_req: Request, res: Response) => {
  const rows = await PassportTypes.findAll({ order: [['id', 'ASC']] });
  ok(res, { passportTypes: rows.map(present.toPassportType) });
});

lookupRoutes.get('/departments', async (_req: Request, res: Response) => {
  const rows = await Departments.findAll({ order: [['name', 'ASC']] });
  ok(res, { departments: rows.map(present.toDepartment) });
});

/**
 * GET /api/lookups/police-clearances
 *
 * The published fee list. These are the prices the website quotes before
 * checkout, and the only source for them — an order's amount is computed from
 * this table server-side, never from what the client's payload claims.
 */
lookupRoutes.get('/police-clearances', async (_req: Request, res: Response) => {
  const rows = await PoliceClearances.findAll({
    where: { status: 1 },
    order: [['name', 'ASC']],
  });

  ok(res, { clearances: rows.map(present.toPoliceClearance) });
});

/** GET /api/lookups/voucher-types — the Russian visa voucher price matrix. */
lookupRoutes.get('/voucher-types', async (_req: Request, res: Response) => {
  const rows = await RussianVisaVoucherTypes.findAll({
    where: { s_active: 1 },
    order: [['type_order', 'ASC']],
  });

  ok(res, { voucherTypes: rows.map(present.toVoucherType) });
});

const visaTypeQuery = z.object({
  countryId: z.coerce.number().int().positive().optional(),
  audience: z.enum(['public', 'government']).optional(),
});

/**
 * GET /api/lookups/visa-types
 *
 * Two tables behind one endpoint. `tbl_public_visa_types` and `tbl_visa_types`
 * hold the same kind of row for different audiences — a walk-in client and a
 * government department get different lists and different prices. `?audience`
 * picks one; without it, both come back tagged.
 */
lookupRoutes.get(
  '/visa-types',
  validate(visaTypeQuery, 'query'),
  async (req: Request, res: Response) => {
    const { countryId, audience } = validQuery<z.infer<typeof visaTypeQuery>>(req);
    const where = countryId ? { country_id: countryId, status: 1 } : { status: 1 };

    const [publicTypes, governmentTypes] = await Promise.all([
      audience === 'government'
        ? Promise.resolve([])
        : PublicVisaTypes.findAll({ where, order: [['title', 'ASC']] }),
      audience === 'public'
        ? Promise.resolve([])
        : VisaTypes.findAll({ where, order: [['type', 'ASC']] }),
    ]);

    ok(res, {
      visaTypes: [
        ...publicTypes.map(present.toPublicVisaType),
        ...governmentTypes.map(present.toVisaType),
      ],
    });
  }
);

/**
 * GET /api/lookups/visa-types/:id/requirements
 *
 * The extra requirements and the consulates a visa is processed at. Both are
 * keyed on `visa_id` / `visa_type_id`, and the public and government
 * requirement tables are separate with identical shapes — so both are read and
 * merged rather than guessing which audience the caller meant.
 */
lookupRoutes.get(
  '/visa-types/:id/requirements',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const id = Number((req.params as { id: string }).id);

    const [publicRequirements, governmentRequirements, locations] = await Promise.all([
      PublicVisaAdditionalRequirements.findAll({
        where: { visa_id: id, status: 1 },
        order: [['item_order', 'ASC']],
      }),
      VisaAdditionalRequirements.findAll({
        where: { visa_id: id, status: 1 },
        order: [['item_order', 'ASC']],
      }),
      PublicVisaTypeLocations.findAll({ where: { visa_type_id: id } }),
    ]);

    ok(res, {
      requirements: [
        // `tbl_public_visa_additional_requirements` and
        // `tbl_visa_additional_requirements` are two tables with identical
        // columns, so one presenter reads both.
        ...publicRequirements.map((row) => present.toRequirement(row)),
        ...governmentRequirements.map(present.toRequirement),
      ],
      locations: locations.map((row) => ({
        id: row.id,
        location: clean(row.location),
        label: clean(row.location),
        group: row.location_group,
      })),
    });
  }
);

/** GET /api/lookups/courier-options?audience=public */
lookupRoutes.get(
  '/courier-options',
  validate(
    z.object({ audience: z.enum(['public', 'government']).optional() }),
    'query'
  ),
  async (req: Request, res: Response) => {
    const { audience } = validQuery<{ audience?: 'public' | 'government' }>(req);

    const rows = await VisaCourierOptions.findAll({
      where: {
        s_active: 1,
        ...(audience === 'public' ? { s_available_for_public: 1 } : {}),
        ...(audience === 'government' ? { s_available_for_gov: 1 } : {}),
      },
      order: [['cost', 'ASC']],
    });

    ok(res, { courierOptions: rows.map(present.toCourierOption) });
  }
);

lookupRoutes.get('/locations', async (_req: Request, res: Response) => {
  const rows = await Locations.findAll({
    where: { status: 1 },
    order: [['name', 'ASC']],
  });

  ok(res, { locations: rows.map(present.toLocation) });
});

const documentQuery = z.object({
  countryId: z.coerce.number().int().positive().optional(),
  visaTypeId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  nationalityId: z.coerce.number().int().positive().optional(),
});

/**
 * GET /api/lookups/document-types
 *
 * What a client has to supply for a given visa. Narrowed by whichever of the
 * four keys the caller supplies — unnarrowed this is every document requirement
 * CLS has ever recorded, which is a list nobody wants.
 */
lookupRoutes.get(
  '/document-types',
  validate(documentQuery, 'query'),
  async (req: Request, res: Response) => {
    const query = validQuery<z.infer<typeof documentQuery>>(req);

    const rows = await Documents.findAll({
      where: {
        status: 1,
        ...(query.countryId ? { country_id: query.countryId } : {}),
        ...(query.visaTypeId ? { visa_type_id: query.visaTypeId } : {}),
        ...(query.categoryId ? { category_id: query.categoryId } : {}),
        ...(query.nationalityId ? { nationality: query.nationalityId } : {}),
      },
      order: [['document_name', 'ASC']],
      limit: 500,
    });

    ok(res, { documentTypes: rows.map(present.toDocumentType) });
  }
);

/** GET /api/lookups/categories?countryId=&visaTypeId= */
lookupRoutes.get(
  '/categories',
  validate(documentQuery, 'query'),
  async (req: Request, res: Response) => {
    const query = validQuery<z.infer<typeof documentQuery>>(req);

    const rows = await Categories.findAll({
      where: {
        status: 1,
        ...(query.countryId ? { country_id: query.countryId } : {}),
        ...(query.visaTypeId ? { visa_type_id: query.visaTypeId } : {}),
      },
      order: [['category', 'ASC']],
      limit: 500,
    });

    ok(res, { categories: rows.map(present.toCategory) });
  }
);

/** GET /api/lookups/additional-services?visaId= */
lookupRoutes.get(
  '/additional-services',
  validate(z.object({ visaId: z.coerce.number().int().positive().optional() }), 'query'),
  async (req: Request, res: Response) => {
    const { visaId } = validQuery<{ visaId?: number }>(req);

    const rows = await AdditionalServices.findAll({
      where: { status: 1, ...(visaId ? { visa_id: visaId } : {}) },
      order: [['title', 'ASC']],
    });

    ok(res, { additionalServices: rows.map(present.toAdditionalService) });
  }
);

lookupRoutes.get('/card-types', async (_req: Request, res: Response) => {
  const rows = await CardTypes.findAll({ order: [['id', 'ASC']] });
  ok(res, { cardTypes: rows.map(present.toCardType) });
});

lookupRoutes.get('/terminals', async (_req: Request, res: Response) => {
  const rows = await Terminals.findAll({
    order: [
      [Terminals.sequelize!.literal('COALESCE(popular_terminal, 0)'), 'DESC'],
      ['terminal_name', 'ASC'],
    ],
  });

  ok(res, { terminals: rows.map(present.toTerminal) });
});

/**
 * GET /api/lookups/settings
 *
 * The single-row fee tables, gathered into one response. `tbl_settings_tpn`,
 * `tbl_settings_passport`, `tbl_credit_card_processing` each hold one row of
 * configuration, and five requests to fetch five numbers is worse than one.
 */
lookupRoutes.get('/settings', async (_req: Request, res: Response) => {
  const [tpn, passport, delivery, cardFee, weights] = await Promise.all([
    SettingsTpn.findOne({ order: [['id', 'DESC']] }),
    SettingsPassport.findOne({ order: [['id', 'DESC']] }),
    SettingsDocumentDelivery.findAll({ where: { status: 1 }, order: [['cost', 'ASC']] }),
    CreditCardProcessing.findOne({ order: [['id', 'DESC']] }),
    WeightPrice.findAll({ order: [['weight_lower_limit', 'ASC']] }),
  ]);

  ok(res, {
    settings: {
      tpn: {
        feeCents: toCents(tpn?.tpn),
        additionalFeeCents: toCents(tpn?.tpn_additional),
      },
      passport: {
        feeCents: toCents(passport?.cost),
        additionalFeeCents: toCents(passport?.additional_cost),
      },
      documentDelivery: delivery.map((row) => ({
        id: row.id,
        type: clean(row.type),
        label: clean(row.type),
        costCents: toCents(row.cost),
        enabled: toBoolean(row.status),
      })),
      /** A percentage, not an amount — the column is a bare `double`. */
      creditCardFeePercent: cardFee?.fee ?? null,
      weightBands: weights.map(present.toWeightPrice),
    },
  });
});
