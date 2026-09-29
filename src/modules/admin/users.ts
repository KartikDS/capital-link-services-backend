import { Op } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { UserAdmin, UserClient, UserEmbassy, UserTpn } from '../../models';
import { conflict, notFound } from '../../shared/errors';
import { created, noContent, ok, paged } from '../../shared/http/responses';
import { pageMeta, readPage } from '../../shared/http/pagination';
import { toIso } from '../../shared/dates';
import { clean, fullName } from '../../shared/text';
import { hashPassword } from '../../shared/passwords';
import { idParam, validate, validParams, validQuery } from '../../shared/validation';
import { ENABLED } from '../../domain/codes';

/**
 * Full CRUD for the four account types the legacy sidebar's "Users" menu opens:
 * Clients, TPN Staff, Embassy and Staff. Reproduces `ClientsController`,
 * `DfatStaffController`, `EmbassyController` and `StaffController`.
 *
 * ## One router, four tables
 *
 * The four legacy controllers are near-identical — list, new, edit, delete, each
 * against its own table — and differ mainly in which columns their table has.
 * One router with four sub-paths (`/clients`, `/tpn`, `/embassy`, `/staff`)
 * keeps that similarity visible rather than writing the same shape four times
 * with the differences buried in each copy.
 *
 * ## Email uniqueness is checked across all four tables
 *
 * The legacy `sEmailAvailable` — used by all four `new` actions — checks
 * `tbl_user_client`, `tbl_user_admin`, `tbl_user_tpn` and `tbl_user_embassy` in
 * turn, because one email must not open two kinds of account. Reproduced here as
 * `emailTakenAnywhere`, run before every create and before an edit that changes
 * the address.
 *
 * ## Passwords
 *
 * New accounts and edits that submit a password are hashed with `hashPassword`
 * (always bcrypt, whatever the legacy formats elsewhere in this schema look
 * like — see the note on that function). An edit with no password submitted
 * leaves the stored hash alone, exactly as the legacy `if (trim(password) != '')`
 * guards did.
 */

export const userRoutes = Router();

const listQuery = z.object({
  search: z.string().trim().max(255).optional(),
  page: z.coerce.number().int().positive().optional(),
  perPage: z.coerce.number().int().positive().max(100).optional(),
});

/**
 * Whether an address is already in use, in any of the four tables.
 *
 * `excludeId` and `excludeTable` let an edit pass its own row without tripping
 * over itself — checking `tbl_user_client` for a client editing their own email
 * would otherwise always report it taken.
 */
const emailTakenAnywhere = async (
  email: string,
  exclude?: { table: 'client' | 'admin' | 'embassy' | 'tpn'; id: number }
): Promise<boolean> => {
  const where = (table: typeof exclude extends undefined ? never : string) =>
    exclude?.table === table
      ? { email, id: { [Op.ne]: exclude.id } }
      : { email };

  const [client, admin, embassy, tpn] = await Promise.all([
    UserClient.count({ where: where('client') }),
    UserAdmin.count({ where: where('admin') }),
    UserEmbassy.count({ where: where('embassy') }),
    UserTpn.count({ where: where('tpn') }),
  ]);

  return client + admin + embassy + tpn > 0;
};

// ---------------------------------------------------------------------------
// Clients — public, corporate and government accounts
// ---------------------------------------------------------------------------

const clientBody = z.object({
  type: z.enum(['public', 'corporate', 'government']),
  title: z.string().trim().max(20).optional(),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(100),
  password: z.string().min(1).max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  mobile: z.string().trim().max(50).optional(),
  departmentId: z.coerce.number().int().positive().optional().nullable(),
  company: z.string().trim().max(1000).optional(),
  address: z.string().trim().max(1000).optional(),
  city: z.string().trim().max(255).optional(),
  state: z.string().trim().max(255).optional(),
  postcode: z.string().trim().max(20).optional(),
  countryId: z.coerce.number().int().positive().optional().nullable(),
  onAccount: z.boolean().optional(),
  accountNumber: z.string().trim().max(50).optional(),
  specialPrice: z.boolean().optional(),
  specialPriceRate: z.coerce.number().optional(),
});

const toClientRow = (row: UserClient) => ({
  id: row.id,
  type: clean(row.type),
  accountNumber: clean(row.display_id),
  title: clean(row.title),
  firstName: clean(row.fname),
  lastName: clean(row.lname),
  email: clean(row.email),
  phone: clean(row.phone),
  mobile: clean(row.mobile),
  company: clean(row.company),
  enabled: row.s_enabled === ENABLED,
  archived: row.s_archive === 1,
  onAccount: row.can_charge_cost_to_account === 1,
  lastLogin: toIso(row.last_login),
});

/**
 * GET /api/admin/users/clients
 *
 * Every client except government accounts — the legacy list excludes
 * `type != 'government'`, because government users are managed as embassy
 * accounts through a different screen even though they share this table.
 */
userRoutes.get(
  '/clients',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const { search } = validQuery<{ search?: string }>(req);
    const page = readPage(req);

    const { rows, count } = await UserClient.findAndCountAll({
      where: {
        type: { [Op.ne]: 'government' },
        ...(search
          ? {
              [Op.or]: [
                { fname: { [Op.like]: `%${search}%` } },
                { lname: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
                { company: { [Op.like]: `%${search}%` } },
              ],
            }
          : {}),
      },
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(res, 'clients', rows.map(toClientRow), pageMeta(page, count));
  }
);

userRoutes.get(
  '/clients/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await UserClient.findByPk(id);
    if (!row) throw notFound('We could not find that client.');

    ok(res, {
      client: {
        ...toClientRow(row),
        departmentId: row.department_id,
        address: clean(row.address),
        city: clean(row.city),
        state: clean(row.state),
        postcode: clean(row.postcode),
        countryId: row.country_id,
        specialPrice: row.can_get_special_price === 1,
        specialPriceRate: row.special_price,
      },
    });
  }
);

userRoutes.post('/clients', async (req: Request, res: Response) => {
  const body = clientBody.parse(req.body);

  if (await emailTakenAnywhere(body.email)) {
    throw conflict(`${body.email} is already used.`);
  }

  const password = body.password?.trim()
    ? await hashPassword(body.password)
    : await hashPassword(Math.random().toString(36).slice(2, 12));

  const row = await UserClient.create({
    type: body.type,
    title: body.title ?? null,
    fname: body.firstName,
    lname: body.lastName,
    email: body.email,
    password,
    phone: body.phone ?? null,
    mobile: body.mobile ?? null,
    department_id: body.type === 'government' ? (body.departmentId ?? null) : null,
    company: body.type === 'government' ? null : (body.company ?? null),
    address: body.address ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    postcode: body.postcode ?? null,
    country_id: body.countryId ?? null,
    can_charge_cost_to_account: body.onAccount ? 1 : 0,
    account_no: body.accountNumber ?? null,
    can_get_special_price: body.specialPrice ? 1 : 0,
    special_price: body.specialPriceRate ?? null,
    s_enabled: ENABLED,
  });

  created(res, { client: toClientRow(row) });
});

userRoutes.patch(
  '/clients/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = clientBody.partial().parse(req.body);

    const row = await UserClient.findByPk(id);
    if (!row) throw notFound('We could not find that client.');

    if (
      body.email &&
      body.email !== row.email &&
      (await emailTakenAnywhere(body.email, { table: 'client', id }))
    ) {
      throw conflict(`${body.email} is already used.`);
    }

    await row.update({
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.firstName !== undefined ? { fname: body.firstName } : {}),
      ...(body.lastName !== undefined ? { lname: body.lastName } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.password?.trim()
        ? { password: await hashPassword(body.password) }
        : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.mobile !== undefined ? { mobile: body.mobile } : {}),
      ...(body.departmentId !== undefined
        ? { department_id: body.departmentId }
        : {}),
      ...(body.company !== undefined ? { company: body.company } : {}),
      ...(body.address !== undefined ? { address: body.address } : {}),
      ...(body.city !== undefined ? { city: body.city } : {}),
      ...(body.state !== undefined ? { state: body.state } : {}),
      ...(body.postcode !== undefined ? { postcode: body.postcode } : {}),
      ...(body.countryId !== undefined ? { country_id: body.countryId } : {}),
      ...(body.onAccount !== undefined
        ? { can_charge_cost_to_account: body.onAccount ? 1 : 0 }
        : {}),
      ...(body.accountNumber !== undefined
        ? { account_no: body.accountNumber }
        : {}),
      ...(body.specialPrice !== undefined
        ? { can_get_special_price: body.specialPrice ? 1 : 0 }
        : {}),
      ...(body.specialPriceRate !== undefined
        ? { special_price: body.specialPriceRate }
        : {}),
    });

    ok(res, { client: toClientRow(row) });
  }
);

/**
 * DELETE /api/admin/users/clients/:id
 *
 * The legacy `deleteClientAction` runs a cascading raw `DELETE ... JOIN`, on the
 * grounds that a client's own orders are otherwise orphaned. Reproduced as three
 * scoped deletes rather than one join, because Sequelize does not offer a
 * multi-table delete and three deletes is what the same statement does anyway —
 * destinations, then orders, then the client. **Genuinely destructive** and kept
 * that way deliberately: the legacy screen has always deleted, not archived, and
 * changing that here would leave this admin unable to do what the one it
 * replaces could.
 */
userRoutes.delete(
  '/clients/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await UserClient.findByPk(id);
    if (!row) throw notFound('We could not find that client.');

    const { Orders, ClsOrderDestinations } = await import('../../models');
    const clientOrders = await Orders.findAll({ where: { client_id: id } });
    const orderNos = clientOrders
      .map((o) => o.order_no)
      .filter((n): n is number => n !== null);

    if (orderNos.length > 0) {
      await ClsOrderDestinations.destroy({
        where: { order_id: { [Op.in]: orderNos } },
      });
      await Orders.destroy({ where: { client_id: id } });
    }

    await row.destroy();
    noContent(res);
  }
);

// ---------------------------------------------------------------------------
// Staff — tbl_user_admin
// ---------------------------------------------------------------------------

const staffBody = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(100),
  password: z.string().min(1).max(255).optional(),
  isDriver: z.boolean().optional(),
});

const toStaffRow = (row: UserAdmin) => ({
  id: row.id,
  firstName: clean(row.fname),
  lastName: clean(row.lname),
  name: fullName(row.fname, row.lname),
  email: clean(row.email),
  isDriver: row.s_driver === 1,
  enabled: row.s_enabled === ENABLED,
  lastLogin: toIso(row.last_login),
});

userRoutes.get(
  '/staff',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const { search } = validQuery<{ search?: string }>(req);
    const page = readPage(req);

    const { rows, count } = await UserAdmin.findAndCountAll({
      where: search
        ? {
            [Op.or]: [
              { fname: { [Op.like]: `%${search}%` } },
              { lname: { [Op.like]: `%${search}%` } },
              { email: { [Op.like]: `%${search}%` } },
            ],
          }
        : {},
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(res, 'staff', rows.map(toStaffRow), pageMeta(page, count));
  }
);

userRoutes.get(
  '/staff/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await UserAdmin.findByPk(id);
    if (!row) throw notFound('We could not find that staff member.');
    ok(res, { staff: toStaffRow(row) });
  }
);

userRoutes.post('/staff', async (req: Request, res: Response) => {
  const body = staffBody.parse(req.body);

  if (await emailTakenAnywhere(body.email)) {
    throw conflict(`${body.email} is already used.`);
  }

  const row = await UserAdmin.create({
    fname: body.firstName,
    lname: body.lastName,
    email: body.email,
    password: await hashPassword(
      body.password?.trim() || Math.random().toString(36).slice(2, 12)
    ),
    s_enabled: ENABLED,
    s_driver: body.isDriver ? 1 : 0,
  });

  created(res, { staff: toStaffRow(row) });
});

userRoutes.patch(
  '/staff/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = staffBody.partial().parse(req.body);

    const row = await UserAdmin.findByPk(id);
    if (!row) throw notFound('We could not find that staff member.');

    if (
      body.email &&
      body.email !== row.email &&
      (await emailTakenAnywhere(body.email, { table: 'admin', id }))
    ) {
      throw conflict(`${body.email} is already used.`);
    }

    await row.update({
      ...(body.firstName !== undefined ? { fname: body.firstName } : {}),
      ...(body.lastName !== undefined ? { lname: body.lastName } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.password?.trim()
        ? { password: await hashPassword(body.password) }
        : {}),
      ...(body.isDriver !== undefined
        ? { s_driver: body.isDriver ? 1 : 0 }
        : {}),
    });

    ok(res, { staff: toStaffRow(row) });
  }
);

/**
 * DELETE /api/admin/users/staff/:id
 *
 * Unguarded against deleting your own account, matching the legacy screen — the
 * self-protection this API has is on *disabling* an account (see
 * `PATCH /api/admin/consultants/:id`), because deletion here is a straight port
 * of a screen that never had the guard either.
 */
userRoutes.delete(
  '/staff/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await UserAdmin.findByPk(id);
    if (!row) throw notFound('We could not find that staff member.');
    await row.destroy();
    noContent(res);
  }
);

// ---------------------------------------------------------------------------
// Embassy — tbl_user_embassy
// ---------------------------------------------------------------------------

const embassyBody = z.object({
  // Unlike the other three tables, `tbl_user_embassy.title` is a foreign key
  // into `tbl_name_title`, not free text — the legacy form renders it as a
  // dropdown of titles by id. See `GET /api/lookups/nationalities`'s sibling
  // for the title list.
  titleId: z.coerce.number().int().positive().optional().nullable(),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(100),
  password: z.string().min(1).max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  mobile: z.string().trim().max(50).optional(),
  countryId: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().trim().max(4000).optional(),
});

const toEmbassyRow = (row: UserEmbassy) => ({
  id: row.id,
  titleId: row.title,
  firstName: clean(row.fname),
  lastName: clean(row.lname),
  name: fullName(row.fname, row.lname),
  email: clean(row.email),
  phone: clean(row.phone),
  mobile: clean(row.mobile),
  countryId: row.country,
  notes: clean(row.notes),
  enabled: row.status === ENABLED,
});

userRoutes.get(
  '/embassy',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const { search } = validQuery<{ search?: string }>(req);
    const page = readPage(req);

    const { rows, count } = await UserEmbassy.findAndCountAll({
      where: search
        ? {
            [Op.or]: [
              { fname: { [Op.like]: `%${search}%` } },
              { lname: { [Op.like]: `%${search}%` } },
              { email: { [Op.like]: `%${search}%` } },
            ],
          }
        : {},
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(res, 'embassy', rows.map(toEmbassyRow), pageMeta(page, count));
  }
);

userRoutes.get(
  '/embassy/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await UserEmbassy.findByPk(id);
    if (!row) throw notFound('We could not find that embassy user.');
    ok(res, { embassy: toEmbassyRow(row) });
  }
);

userRoutes.post('/embassy', async (req: Request, res: Response) => {
  const body = embassyBody.parse(req.body);

  if (await emailTakenAnywhere(body.email)) {
    throw conflict(`${body.email} is already used.`);
  }

  const row = await UserEmbassy.create({
    title: body.titleId ?? null,
    fname: body.firstName,
    lname: body.lastName,
    email: body.email,
    password: await hashPassword(
      body.password?.trim() || Math.random().toString(36).slice(2, 12)
    ),
    phone: body.phone ?? null,
    mobile: body.mobile ?? null,
    country: body.countryId ?? null,
    notes: body.notes ?? null,
    status: ENABLED,
  });

  created(res, { embassy: toEmbassyRow(row) });
});

userRoutes.patch(
  '/embassy/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = embassyBody.partial().parse(req.body);

    const row = await UserEmbassy.findByPk(id);
    if (!row) throw notFound('We could not find that embassy user.');

    if (
      body.email &&
      body.email !== row.email &&
      (await emailTakenAnywhere(body.email, { table: 'embassy', id }))
    ) {
      throw conflict(`${body.email} is already used.`);
    }

    await row.update({
      ...(body.titleId !== undefined ? { title: body.titleId } : {}),
      ...(body.firstName !== undefined ? { fname: body.firstName } : {}),
      ...(body.lastName !== undefined ? { lname: body.lastName } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.password?.trim()
        ? { password: await hashPassword(body.password) }
        : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.mobile !== undefined ? { mobile: body.mobile } : {}),
      ...(body.countryId !== undefined ? { country: body.countryId } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    });

    ok(res, { embassy: toEmbassyRow(row) });
  }
);

userRoutes.delete(
  '/embassy/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await UserEmbassy.findByPk(id);
    if (!row) throw notFound('We could not find that embassy user.');
    await row.destroy();
    noContent(res);
  }
);

// ---------------------------------------------------------------------------
// TPN staff — tbl_user_tpn ("DFAT" in the legacy controller name)
// ---------------------------------------------------------------------------

const tpnBody = z.object({
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  email: z.string().trim().email().max(100),
  password: z.string().min(1).max(255).optional(),
  phone: z.string().trim().max(50).optional(),
});

const toTpnRow = (row: UserTpn) => ({
  id: row.id,
  firstName: clean(row.fname),
  lastName: clean(row.lname),
  name: fullName(row.fname, row.lname),
  email: clean(row.email),
  phone: clean(row.phone),
  enabled: row.s_enabled === ENABLED,
  lastLogin: toIso(row.date_last_login),
});

userRoutes.get(
  '/tpn',
  validate(listQuery, 'query'),
  async (req: Request, res: Response) => {
    const { search } = validQuery<{ search?: string }>(req);
    const page = readPage(req);

    const { rows, count } = await UserTpn.findAndCountAll({
      where: search
        ? {
            [Op.or]: [
              { fname: { [Op.like]: `%${search}%` } },
              { lname: { [Op.like]: `%${search}%` } },
              { email: { [Op.like]: `%${search}%` } },
            ],
          }
        : {},
      order: [['id', 'DESC']],
      limit: page.limit,
      offset: page.offset,
    });

    paged(res, 'tpn', rows.map(toTpnRow), pageMeta(page, count));
  }
);

userRoutes.get(
  '/tpn/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await UserTpn.findByPk(id);
    if (!row) throw notFound('We could not find that TPN user.');
    ok(res, { tpn: toTpnRow(row) });
  }
);

userRoutes.post('/tpn', async (req: Request, res: Response) => {
  const body = tpnBody.parse(req.body);

  if (await emailTakenAnywhere(body.email)) {
    throw conflict(`${body.email} is already used.`);
  }

  const row = await UserTpn.create({
    fname: body.firstName,
    lname: body.lastName,
    email: body.email,
    password: await hashPassword(
      body.password?.trim() || Math.random().toString(36).slice(2, 12)
    ),
    phone: body.phone ?? null,
    s_enabled: ENABLED,
  });

  created(res, { tpn: toTpnRow(row) });
});

userRoutes.patch(
  '/tpn/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const body = tpnBody.partial().parse(req.body);

    const row = await UserTpn.findByPk(id);
    if (!row) throw notFound('We could not find that TPN user.');

    if (
      body.email &&
      body.email !== row.email &&
      (await emailTakenAnywhere(body.email, { table: 'tpn', id }))
    ) {
      throw conflict(`${body.email} is already used.`);
    }

    await row.update({
      ...(body.firstName !== undefined ? { fname: body.firstName } : {}),
      ...(body.lastName !== undefined ? { lname: body.lastName } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.password?.trim()
        ? { password: await hashPassword(body.password) }
        : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
    });

    ok(res, { tpn: toTpnRow(row) });
  }
);

userRoutes.delete(
  '/tpn/:id',
  validate(z.object({ id: idParam }), 'params'),
  async (req: Request, res: Response) => {
    const { id } = validParams<{ id: number }>(req);
    const row = await UserTpn.findByPk(id);
    if (!row) throw notFound('We could not find that TPN user.');
    await row.destroy();
    noContent(res);
  }
);
