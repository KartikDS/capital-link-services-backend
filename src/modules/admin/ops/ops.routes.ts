import { QueryTypes, type Transaction } from 'sequelize';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { sequelize } from '../../../config/database';
import { ClsOrder, OrderReturnDocumentDetails } from '../../../models';
import { currentUserId } from '../../../middleware/authenticate';
import {
  badRequest,
  conflict,
  notFound,
  serviceUnavailable,
} from '../../../shared/errors';
import { ok } from '../../../shared/http/responses';
import { toIso, toLegacyDateTime } from '../../../shared/dates';
import { idParam, validate, validParams } from '../../../shared/validation';
import {
  DEST_GROUPS,
  DOC_KINDS,
  LIST_KEYS,
  PATHWAYS,
  STAGE_LABEL,
  matchTemplate,
  serviceFor,
  uniqueCode,
  type ListKey,
  returnChecksOf,
} from '../../../domain/opsRules';
import {
  AUTOMATION_KEYS,
  configAvailable,
  currentLegsOf,
  loadChecks,
  loadDeptTypes,
  loadLists,
  loadOrder,
  loadOrders,
  loadStaff,
  loadTemplates,
  opsAvailable,
  readAutomation,
  readSla,
  sql,
  skipsAvailable,
  templatesAvailable,
  type DocView,
  type LegView,
  type OrderOps,
} from './snapshot';

/**
 * CLS Ops, Phase 1: the document route layer on top of the existing admin.
 *
 * Mounted at `/api/admin/ops`. Everything here reads the legacy tables and the
 * eight `tbl_ops_*` tables, and writes only to the `tbl_ops_*` tables, with three
 * deliberate exceptions that are the same writes the existing admin already
 * makes: assigning a consultant (`tbl_cls_order.visa_cls_team_member`, as
 * `PATCH /orders/:id/assign` does) and adding a document line
 * (`tbl_order_dl_checklist`, as `POST /orders/:id/documents` does).
 *
 * Until `db/migrations/2026-10-14-ops-document-routes.sql` is applied every read
 * answers `{ available: false }` and every write is a 503, so a deploy that gets
 * ahead of the migration degrades to empty screens and breaks nothing.
 */

type Audit = (
  req: Request,
  action: string,
  detail: Record<string, unknown>
) => Promise<void>;

const stamp = (): string => toLegacyDateTime();

const done = (res: Response, payload: Record<string, unknown>): Response =>
  ok(res, { available: true, ...payload });

const insert = async (
  query: string,
  replacements: Record<string, unknown>,
  transaction?: Transaction
): Promise<number> => {
  const [id] = await sequelize.query(query, {
    type: QueryTypes.INSERT,
    replacements,
    transaction,
  });
  return id;
};

const exec = async (
  query: string,
  replacements: Record<string, unknown>,
  transaction?: Transaction
): Promise<void> => {
  await sequelize.query(query, { type: QueryTypes.UPDATE, replacements, transaction });
};

const activity = (
  orderId: number,
  kind: string,
  text: string,
  adminId: number | null,
  transaction?: Transaction
): Promise<number> =>
  insert(
    `INSERT INTO tbl_ops_activity (order_id, kind, text, admin_id, created_at)
     VALUES (:orderId, :kind, :text, :adminId, :at)`,
    { orderId, kind, text: text.slice(0, 500), adminId, at: stamp() },
    transaction
  );

const bodyId = z.coerce.number().int().positive();

export const opsRoutes = (audit: Audit): Router => {
  const router = Router();

  // Degrade, don't crash, when the tables are not there yet.
  router.use(async (req, res, next) => {
    if (await opsAvailable()) return next();
    if (req.method === 'GET') return ok(res, { available: false });
    throw serviceUnavailable(
      'CLS Ops is not set up on this database yet. Ask the DBA to apply db/migrations/2026-10-14-ops-document-routes.sql.'
    );
  });

  const need = async (id: number): Promise<OrderOps> => {
    const order = await loadOrder(id);
    if (!order) throw notFound('We could not find that document legalisation order.');
    return order;
  };

  const docOf = (order: OrderOps, docId: number): DocView => {
    const doc = order.docs.find((d) => d.id === docId);
    if (!doc) throw notFound('That document is not on this order.');
    return doc;
  };

  const needClaimed = (order: OrderOps): void => {
    if (!order.assigneeId) throw conflict('Claim the order first.');
  };

  const notClosed = (order: OrderOps): void => {
    if (order.stage === 'done')
      throw conflict('This order has already been returned to the client.');
  };

  const canSign = (order: OrderOps, leg: LegView, me: number): boolean =>
    order.assigneeId === me || leg.responsibleId === me;

  // -------------------------------------------------------------------------
  // Meta, settings and departments
  // -------------------------------------------------------------------------

  router.get('/meta', async (_req, res) => {
    const [sla, staff, automation, checks, types] = await Promise.all([
      readSla(),
      loadStaff(),
      readAutomation(),
      loadChecks(),
      loadDeptTypes(),
    ]);
    done(res, {
      sla,
      automation,
      docKinds: DOC_KINDS,
      pathways: PATHWAYS,
      destGroups: DEST_GROUPS,
      staff: staff.assignable,
      departmentTypes: Object.fromEntries(
        types.filter((t) => t.active).map((t) => [t.code, t.label])
      ),
      docChecks: checks
        .filter((c) => c.active)
        .map((c) => ({ key: c.code, label: c.label })),
      legRules: Object.fromEntries(
        types.map((t) => [t.code, { send: t.send, receive: t.receive }])
      ),
      stages: STAGE_LABEL,
    });
  });

  router.patch(
    '/settings',
    validate(
      z.object({
        claimH: z.coerce.number().positive().max(720).optional(),
        verifyH: z.coerce.number().positive().max(720).optional(),
        chaseH: z.coerce.number().positive().max(720).optional(),
        routeH: z.coerce.number().positive().max(720).optional(),
        readyH: z.coerce.number().positive().max(720).optional(),
        autoAssign: z.boolean().optional(),
        autoChase: z.boolean().optional(),
        autoQueue: z.boolean().optional(),
        autoReview: z.boolean().optional(),
        autoWallet: z.boolean().optional(),
      })
    ),
    async (req, res) => {
      const body = req.body as Record<string, number | boolean | undefined>;
      for (const [prop, key] of Object.entries(AUTOMATION_KEYS)) {
        const value = body[prop];
        if (typeof value !== 'boolean') continue;
        await exec(
          `INSERT INTO tbl_ops_setting (k, v) VALUES (:k, :v) ON DUPLICATE KEY UPDATE v = :v`,
          { k: key, v: value ? '1' : '0' }
        );
      }
      const keys: Record<string, string> = {
        claimH: 'sla_claim_h',
        verifyH: 'sla_verify_h',
        chaseH: 'sla_chase_h',
        routeH: 'sla_route_h',
        readyH: 'sla_ready_h',
      };
      for (const [prop, key] of Object.entries(keys)) {
        const value = body[prop];
        if (value === undefined) continue;
        await exec(
          `INSERT INTO tbl_ops_setting (k, v) VALUES (:k, :v) ON DUPLICATE KEY UPDATE v = :v`,
          { k: key, v: String(value) }
        );
      }
      await audit(req, 'ops.settings', body);
      done(res, { sla: await readSla(), automation: await readAutomation() });
    }
  );

  const departmentBody = z.object({
    name: z.string().trim().min(2).max(200),
    shortName: z.string().trim().min(1).max(32),
    type: z.string().trim().min(1, 'Pick a department type.').max(24),
    email: z.string().trim().max(190).optional().default(''),
    phone: z.string().trim().max(60).optional().default(''),
    address: z.string().trim().max(300).optional().default(''),
    tatDays: z.coerce.number().int().min(0).max(60).default(1),
    defaultFee: z.coerce.number().min(0).max(99999).default(0),
  });

  router.get('/departments', async (_req, res) => {
    const rows = await sql<{
      id: number;
      code: string;
      name: string;
      short_name: string;
      type: string;
      email: string | null;
      phone: string | null;
      address: string | null;
      tat_days: number;
      default_fee: string;
      is_active: number;
    }>(`SELECT * FROM tbl_ops_department ORDER BY is_active DESC, type, name`);

    done(res, {
      departments: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        shortName: r.short_name,
        type: r.type,
        email: r.email,
        phone: r.phone,
        address: r.address,
        tatDays: r.tat_days,
        defaultFee: Number(r.default_fee),
        active: r.is_active === 1,
      })),
    });
  });

  /** A department's type must be one of the configured types (any, until the rule tables exist). */
  const needDeptType = async (type: string): Promise<void> => {
    const types = await loadDeptTypes();
    if (types.length > 0 && !types.some((t) => t.code === type))
      throw badRequest('Pick a department type.');
  };

  router.post('/departments', validate(departmentBody), async (req, res) => {
    const b = req.body as z.infer<typeof departmentBody>;
    await needDeptType(b.type);
    const base =
      b.shortName
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 18) || 'DEPT';
    let code = base;
    for (let n = 2; ; n += 1) {
      const [hit] = await sql<{ n: number }>(
        `SELECT COUNT(*) AS n FROM tbl_ops_department WHERE code = :code`,
        { code }
      );
      if (!hit || Number(hit.n) === 0) break;
      code = `${base}_${n}`;
    }
    const id = await insert(
      `INSERT INTO tbl_ops_department
         (code, name, short_name, type, email, phone, address, tat_days, default_fee, is_active, created_at, updated_at)
       VALUES (:code, :name, :short, :type, :email, :phone, :address, :tat, :fee, 1, :at, :at)`,
      {
        code,
        name: b.name,
        short: b.shortName,
        type: b.type,
        email: b.email || null,
        phone: b.phone || null,
        address: b.address || null,
        tat: b.tatDays,
        fee: b.defaultFee,
        at: stamp(),
      }
    );
    await audit(req, 'ops.department.create', { id, code });
    done(res, { id, code });
  });

  router.patch(
    '/departments/:id',
    validate(z.object({ id: idParam }), 'params'),
    validate(departmentBody),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const b = req.body as z.infer<typeof departmentBody>;
      await needDeptType(b.type);
      await exec(
        `UPDATE tbl_ops_department SET name = :name, short_name = :short, type = :type, email = :email,
                phone = :phone, address = :address, tat_days = :tat, default_fee = :fee, updated_at = :at
          WHERE id = :id`,
        {
          id,
          name: b.name,
          short: b.shortName,
          type: b.type,
          email: b.email || null,
          phone: b.phone || null,
          address: b.address || null,
          tat: b.tatDays,
          fee: b.defaultFee,
          at: stamp(),
        }
      );
      await audit(req, 'ops.department.update', { id });
      done(res, { id });
    }
  );

  router.post(
    '/departments/:id/toggle',
    validate(z.object({ id: idParam }), 'params'),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      await exec(
        `UPDATE tbl_ops_department SET is_active = 1 - is_active, updated_at = :at WHERE id = :id`,
        {
          id,
          at: stamp(),
        }
      );
      await audit(req, 'ops.department.toggle', { id });
      done(res, { id });
    }
  );

  router.delete(
    '/departments/:id',
    validate(z.object({ id: idParam }), 'params'),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const [legs] = await sql<{ n: number }>(
        `SELECT COUNT(*) AS n FROM tbl_ops_doc_leg WHERE department_id = :id`,
        { id }
      );
      if (Number(legs?.n ?? 0) > 0)
        throw conflict(
          'Documents have been routed through this department, so it cannot be deleted. Deactivate it instead.'
        );
      if (await templatesAvailable()) {
        const [used] = await sql<{ n: number }>(
          `SELECT COUNT(*) AS n FROM tbl_ops_route_template_leg WHERE department_id = :id`,
          { id }
        );
        if (Number(used?.n ?? 0) > 0)
          throw conflict(
            'A route template uses this department. Remove it from the template first, or deactivate it.'
          );
      }
      await exec(`DELETE FROM tbl_ops_department WHERE id = :id`, { id });
      await audit(req, 'ops.department.delete', { id });
      done(res, { id });
    }
  );

  // -------------------------------------------------------------------------
  // Route templates
  // -------------------------------------------------------------------------

  const needTemplates = async (): Promise<void> => {
    if (!(await templatesAvailable()))
      throw serviceUnavailable(
        'Route templates are not set up on this database yet. Ask the DBA to apply db/migrations/2026-10-14-ops-document-routes.sql.'
      );
  };

  const blank = (v: string | null | undefined): string | null =>
    v && v.trim() !== '' ? v.trim() : null;

  const templateBody = z.object({
    destination: z.string().trim().max(100).nullable().optional(),
    destGroup: z.enum(DEST_GROUPS).default('any'),
    docKind: z.enum(DOC_KINDS).default('any'),
    docLabel: z.string().trim().max(150).nullable().optional(),
    pathway: z.enum(PATHWAYS),
    usualDays: z.coerce.number().int().min(0).max(120).default(1),
    active: z.boolean().default(true),
    legs: z
      .array(
        z.union([
          z.object({ departmentId: bodyId }),
          z.object({ deptType: z.string().trim().min(1).max(24) }),
        ])
      )
      .min(1, 'Add at least one stop.')
      .max(8, 'A route can have at most eight stops.'),
  });

  const writeTemplate = async (
    id: number | null,
    b: z.infer<typeof templateBody>
  ): Promise<number> => {
    const wanted = [
      ...new Set(b.legs.flatMap((l) => ('departmentId' in l ? [l.departmentId] : []))),
    ];
    if (wanted.length > 0) {
      const found = await sql<{ id: number }>(
        `SELECT id FROM tbl_ops_department WHERE id IN (:ids)`,
        { ids: wanted }
      );
      if (found.length !== wanted.length)
        throw badRequest('One of the stops is not a department.');
    }
    const types = await loadDeptTypes();
    for (const l of b.legs) {
      if (
        'deptType' in l &&
        types.length > 0 &&
        !types.some((t) => t.code === l.deptType)
      )
        throw badRequest('One of the stops names a department type that does not exist.');
    }

    return sequelize.transaction(async (t) => {
      let tid = id;
      const params = {
        dest: blank(b.destination),
        grp: blank(b.destination) ? 'any' : b.destGroup,
        kind: b.docKind,
        label: blank(b.docLabel),
        pathway: b.pathway,
        days: b.usualDays,
        active: b.active ? 1 : 0,
        at: stamp(),
      };
      if (tid === null) {
        tid = await insert(
          `INSERT INTO tbl_ops_route_template
             (destination, dest_group, doc_kind, doc_label, pathway, usual_days, is_active, created_at, updated_at)
           VALUES (:dest, :grp, :kind, :label, :pathway, :days, :active, :at, :at)`,
          params,
          t
        );
      } else {
        await exec(
          `UPDATE tbl_ops_route_template SET destination = :dest, dest_group = :grp, doc_kind = :kind, doc_label = :label,
                  pathway = :pathway, usual_days = :days, is_active = :active, updated_at = :at
            WHERE id = :id`,
          { ...params, id: tid },
          t
        );
        await exec(
          `DELETE FROM tbl_ops_route_template_leg WHERE template_id = :id`,
          { id: tid },
          t
        );
      }
      for (const [i, leg] of b.legs.entries()) {
        await exec(
          `INSERT INTO tbl_ops_route_template_leg (template_id, seq, department_id, dept_type) VALUES (:tid, :seq, :dept, :dtype)`,
          {
            tid,
            seq: i + 1,
            dept: 'departmentId' in leg ? leg.departmentId : null,
            dtype: 'deptType' in leg ? leg.deptType : null,
          },
          t
        );
      }
      return tid;
    });
  };

  router.get('/route-templates', async (_req, res) => {
    const available = await templatesAvailable();
    const countries = await sql<{ name: string; code: string | null }>(
      `SELECT country_name AS name, country_code AS code FROM tbl_countries
        WHERE country_name IS NOT NULL AND country_name <> '' ORDER BY country_name`
    ).catch(() => []);
    done(res, {
      templatesAvailable: available,
      templates: available ? await loadTemplates() : [],
      countries,
    });
  });

  router.post('/route-templates', validate(templateBody), async (req, res) => {
    await needTemplates();
    const id = await writeTemplate(null, req.body as z.infer<typeof templateBody>);
    await audit(req, 'ops.template.create', { id });
    done(res, { id });
  });

  router.patch(
    '/route-templates/:id',
    validate(z.object({ id: idParam }), 'params'),
    validate(templateBody),
    async (req, res) => {
      await needTemplates();
      const { id } = validParams<{ id: number }>(req);
      const [row] = await sql<{ id: number }>(
        `SELECT id FROM tbl_ops_route_template WHERE id = :id`,
        { id }
      );
      if (!row) throw notFound('That route template does not exist.');
      await writeTemplate(id, req.body as z.infer<typeof templateBody>);
      await audit(req, 'ops.template.update', { id });
      done(res, { id });
    }
  );

  router.delete(
    '/route-templates/:id',
    validate(z.object({ id: idParam }), 'params'),
    async (req, res) => {
      await needTemplates();
      const { id } = validParams<{ id: number }>(req);
      await sequelize.transaction(async (t) => {
        await exec(
          `DELETE FROM tbl_ops_route_template_leg WHERE template_id = :id`,
          { id },
          t
        );
        await exec(`DELETE FROM tbl_ops_route_template WHERE id = :id`, { id }, t);
      });
      await audit(req, 'ops.template.delete', { id });
      done(res, { id });
    }
  );

  // -------------------------------------------------------------------------
  // Rule configuration: checks, department types and checklists, lists
  // -------------------------------------------------------------------------

  const needConfig = async (): Promise<void> => {
    if (!(await configAvailable()))
      throw serviceUnavailable(
        'The routing rules are not set up on this database yet. Ask the DBA to apply db/migrations/2026-10-14-ops-document-routes.sql.'
      );
  };

  const text = (max: number) => z.string().trim().min(1, 'Fill in every label.').max(max);

  router.get('/config', async (_req, res) => {
    const available = await configAvailable();
    done(res, {
      configAvailable: available,
      checks: await loadChecks(),
      deptTypes: await loadDeptTypes(),
      lists: await loadLists(),
    });
  });

  router.put(
    '/config/checks',
    validate(
      z.object({
        checks: z
          .array(
            z.object({
              code: z.string().trim().max(40).optional(),
              label: text(200),
              active: z.boolean().default(true),
            })
          )
          .max(40),
      })
    ),
    async (req, res) => {
      await needConfig();
      const { checks } = req.body as {
        checks: { code?: string; label: string; active: boolean }[];
      };
      if (checks.length > 0 && !checks.some((c) => c.active))
        throw badRequest('Keep at least one check switched on.');

      const existing = new Set((await loadChecks()).map((c) => c.code));
      const kept = new Set(
        checks.flatMap((c) => (c.code && existing.has(c.code) ? [c.code] : []))
      );
      const taken = new Set(kept);

      await sequelize.transaction(async (t) => {
        for (const code of existing) {
          if (!kept.has(code))
            await exec(`DELETE FROM tbl_ops_check_def WHERE code = :code`, { code }, t);
        }
        for (const [i, c] of checks.entries()) {
          if (c.code && existing.has(c.code)) {
            await exec(
              `UPDATE tbl_ops_check_def SET label = :label, is_active = :active, sort_order = :sort WHERE code = :code`,
              { code: c.code, label: c.label, active: c.active ? 1 : 0, sort: i + 1 },
              t
            );
          } else {
            const code = uniqueCode(c.label, taken, 40);
            taken.add(code);
            await exec(
              `INSERT INTO tbl_ops_check_def (code, label, sort_order, is_active) VALUES (:code, :label, :sort, :active)`,
              { code, label: c.label, sort: i + 1, active: c.active ? 1 : 0 },
              t
            );
          }
        }
      });
      await audit(req, 'ops.config.checks', { count: checks.length });
      done(res, { checks: await loadChecks() });
    }
  );

  router.put(
    '/config/dept-types',
    validate(
      z.object({
        types: z
          .array(
            z.object({
              code: z.string().trim().max(24).optional(),
              label: text(120),
              active: z.boolean().default(true),
              send: z.array(text(300)).max(30).default([]),
              receive: z.array(text(300)).max(30).default([]),
            })
          )
          .max(40),
      })
    ),
    async (req, res) => {
      await needConfig();
      const { types } = req.body as {
        types: {
          code?: string;
          label: string;
          active: boolean;
          send: string[];
          receive: string[];
        }[];
      };

      const existing = (await loadDeptTypes()).map((t) => t.code);
      const known = new Set(existing);
      const kept = new Set(
        types.flatMap((t) => (t.code && known.has(t.code) ? [t.code] : []))
      );

      for (const code of existing.filter((c) => !kept.has(c))) {
        const [dept] = await sql<{ n: number }>(
          `SELECT COUNT(*) AS n FROM tbl_ops_department WHERE type = :code`,
          { code }
        );
        if (Number(dept?.n ?? 0) > 0)
          throw conflict(
            `Departments still use the "${code}" type. Move them to another type, or switch this one off instead.`
          );
        if (await templatesAvailable()) {
          const [leg] = await sql<{ n: number }>(
            `SELECT COUNT(*) AS n FROM tbl_ops_route_template_leg WHERE dept_type = :code`,
            { code }
          );
          if (Number(leg?.n ?? 0) > 0)
            throw conflict(
              `A route template has a stop of the "${code}" type. Change that template first, or switch this type off instead.`
            );
        }
      }

      const taken = new Set(kept);
      await sequelize.transaction(async (t) => {
        for (const code of existing.filter((c) => !kept.has(c))) {
          await exec(`DELETE FROM tbl_ops_dept_type WHERE code = :code`, { code }, t);
        }
        for (const [i, ty] of types.entries()) {
          let code = ty.code && known.has(ty.code) ? ty.code : null;
          if (code) {
            await exec(
              `UPDATE tbl_ops_dept_type SET label = :label, is_active = :active, sort_order = :sort WHERE code = :code`,
              { code, label: ty.label, active: ty.active ? 1 : 0, sort: i + 1 },
              t
            );
          } else {
            code = uniqueCode(ty.label, taken, 24);
            taken.add(code);
            await exec(
              `INSERT INTO tbl_ops_dept_type (code, label, sort_order, is_active) VALUES (:code, :label, :sort, :active)`,
              { code, label: ty.label, sort: i + 1, active: ty.active ? 1 : 0 },
              t
            );
          }
          await exec(`DELETE FROM tbl_ops_leg_rule WHERE type_code = :code`, { code }, t);
          for (const phase of ['send', 'receive'] as const) {
            for (const [n, label] of ty[phase].entries()) {
              await exec(
                `INSERT INTO tbl_ops_leg_rule (type_code, phase, label, sort_order) VALUES (:code, :phase, :label, :sort)`,
                { code, phase, label, sort: n + 1 },
                t
              );
            }
          }
        }
        // Checklists of a deleted type go with it.
        await exec(
          `DELETE FROM tbl_ops_leg_rule WHERE type_code NOT IN (SELECT code FROM tbl_ops_dept_type)`,
          {},
          t
        );
      });
      await audit(req, 'ops.config.deptTypes', { count: types.length });
      done(res, { deptTypes: await loadDeptTypes() });
    }
  );

  router.put(
    '/config/lists/:key',
    validate(z.object({ key: z.enum(LIST_KEYS) }), 'params'),
    validate(z.object({ values: z.array(z.string().trim().min(1).max(150)).max(500) })),
    async (req, res) => {
      await needConfig();
      const { key } = validParams<{ key: ListKey }>(req);
      const { values } = req.body as { values: string[] };
      const seen = new Set<string>();
      const unique = values.filter((v) => {
        const k = v.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      await sequelize.transaction(async (t) => {
        await exec(`DELETE FROM tbl_ops_list_item WHERE list_key = :key`, { key }, t);
        for (const [i, value] of unique.entries()) {
          await exec(
            `INSERT INTO tbl_ops_list_item (list_key, value, sort_order) VALUES (:key, :value, :sort)`,
            { key, value, sort: i + 1 },
            t
          );
        }
      });
      await audit(req, 'ops.config.list', { key, count: unique.length });
      done(res, { values: (await loadLists())[key] });
    }
  );

  // -------------------------------------------------------------------------
  // One order
  // -------------------------------------------------------------------------

  const returnChecks = (o: OrderOps) => returnChecksOf(o);

  const orderPayload = async (id: number, me: number) => {
    const [order, staff, activityRows] = await Promise.all([
      need(id),
      loadStaff(),
      sql<{
        id: number;
        kind: string;
        text: string;
        admin_id: number | null;
        created_at: string;
      }>(
        `SELECT id, kind, text, admin_id, created_at FROM tbl_ops_activity
          WHERE order_id = :id ORDER BY id DESC LIMIT 100`,
        { id }
      ),
    ]);

    const events = await sql<{
      id: number;
      doc_id: number;
      kind: string;
      admin_id: number | null;
      detail: string | null;
      exception: string | null;
      undone: number;
      created_at: string;
    }>(
      `SELECT id, doc_id, kind, admin_id, detail, exception, undone, created_at
         FROM tbl_ops_leg_event WHERE order_id = :id ORDER BY id DESC LIMIT 200`,
      { id }
    );

    return {
      me,
      order,
      staff: staff.assignable,
      checks: returnChecks(order),
      activity: activityRows.map((a) => ({
        id: a.id,
        kind: a.kind,
        text: a.text,
        by: a.admin_id ? (staff.names.get(a.admin_id) ?? null) : 'System',
        at: toIso(a.created_at),
      })),
      events: events.map((e) => ({
        id: e.id,
        docId: e.doc_id,
        kind: e.kind,
        by: e.admin_id ? (staff.names.get(e.admin_id) ?? null) : null,
        detail: e.detail,
        exception: e.exception,
        undone: e.undone === 1,
        at: toIso(e.created_at),
      })),
    };
  };

  router.get(
    '/orders/:id',
    validate(z.object({ id: idParam }), 'params'),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      done(res, await orderPayload(id, currentUserId(req)));
    }
  );

  /** Stage, SLA and next action for a page of orders, so existing lists can show them. */
  router.get('/summary', async (req, res) => {
    const ids = (typeof req.query.ids === 'string' ? req.query.ids : '')
      .split(',')
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0)
      .slice(0, 200);
    const orders = await loadOrders({ ids, includeClosed: true });
    done(res, {
      summary: Object.fromEntries(
        orders.map((o) => [
          o.id,
          {
            stage: o.stage,
            stageLabel: o.stageLabel,
            sla: o.sla,
            next: o.next,
            assigneeId: o.assigneeId,
            assignee: o.assignee,
            docs: o.docs.length,
          },
        ])
      ),
    });
  });

  // -------------------------------------------------------------------------
  // Claim and verification
  // -------------------------------------------------------------------------

  router.post(
    '/orders/:id/claim',
    validate(z.object({ id: idParam }), 'params'),
    validate(z.object({ adminId: bodyId.optional() })),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const me = currentUserId(req);
      const target = (req.body as { adminId?: number }).adminId ?? me;
      const order = await need(id);
      notClosed(order);

      const staff = await loadStaff();
      if (!staff.assignable.some((s) => s.id === target)) {
        throw badRequest('That consultant is not on the roster.');
      }

      const row = await ClsOrder.findByPk(id);
      if (!row) throw notFound('We could not find that order.');
      await row.update({ visa_cls_team_member: target, date_last_saved: stamp() });

      await exec(
        `INSERT INTO tbl_ops_order_state (order_id, claimed_by, claimed_at, created_at, updated_at)
         VALUES (:id, :by, :at, :at, :at)
         ON DUPLICATE KEY UPDATE claimed_by = :by, claimed_at = :at, updated_at = :at`,
        { id, by: target, at: stamp() }
      );
      await activity(
        id,
        'assign',
        target === me && !order.assigneeId
          ? `Claimed by ${staff.names.get(me) ?? 'a consultant'}`
          : `Assigned to ${staff.names.get(target) ?? 'a consultant'}`,
        me
      );
      await audit(req, 'ops.claim', { orderId: id, consultantId: target });
      done(res, await orderPayload(id, me));
    }
  );

  const upsertCheck = async (
    orderId: number,
    docId: number,
    patch: {
      status?: 'pending' | 'ok' | 'issue';
      ticks?: Record<string, boolean>;
      by?: number;
    },
    transaction?: Transaction
  ): Promise<void> => {
    const [existing] = await sql<{ ticks: string | null; status: string }>(
      `SELECT ticks, status FROM tbl_ops_doc_check WHERE doc_id = :docId`,
      { docId },
      transaction
    );
    let ticks: Record<string, boolean> = {};
    try {
      ticks = existing?.ticks
        ? (JSON.parse(existing.ticks) as Record<string, boolean>)
        : {};
    } catch {
      ticks = {};
    }
    ticks = { ...ticks, ...(patch.ticks ?? {}) };
    const status =
      patch.status ?? (existing?.status as 'pending' | 'ok' | 'issue') ?? 'pending';

    await exec(
      `INSERT INTO tbl_ops_doc_check (order_id, doc_id, status, ticks, verified_by, verified_at, created_at, updated_at)
       VALUES (:orderId, :docId, :status, :ticks, :by, :vat, :at, :at)
       ON DUPLICATE KEY UPDATE status = :status, ticks = :ticks,
         verified_by = IF(:status = 'ok', :by, NULL), verified_at = IF(:status = 'ok', :vat, NULL), updated_at = :at`,
      {
        orderId,
        docId,
        status,
        ticks: JSON.stringify(ticks),
        by: patch.by ?? null,
        vat: status === 'ok' ? stamp() : null,
        at: stamp(),
      },
      transaction
    );
  };

  router.patch(
    '/orders/:id/docs/:docId/tick',
    validate(z.object({ id: idParam, docId: idParam }), 'params'),
    validate(
      z.object({
        key: z.string().trim().min(1).max(40),
        value: z.boolean(),
      })
    ),
    async (req, res) => {
      const { id, docId } = validParams<{ id: number; docId: number }>(req);
      const { key, value } = req.body as { key: string; value: boolean };
      const checks = await loadChecks();
      if (!checks.some((c) => c.active && c.code === key))
        throw badRequest('That check does not exist.');
      const order = await need(id);
      notClosed(order);
      needClaimed(order);
      const doc = docOf(order, docId);
      if (doc.verification === 'ok') throw conflict('This document is already verified.');
      await upsertCheck(id, docId, { ticks: { [key]: value } });
      done(res, { docId, key, value });
    }
  );

  const verifyDocs = async (
    req: Request,
    orderId: number,
    docIds: number[]
  ): Promise<void> => {
    const me = currentUserId(req);
    const order = await need(orderId);
    notClosed(order);
    needClaimed(order);
    const activeChecks = (await loadChecks()).filter((c) => c.active);
    for (const docId of docIds) {
      const doc = docOf(order, docId);
      await upsertCheck(orderId, docId, {
        status: 'ok',
        ticks: Object.fromEntries(activeChecks.map((c) => [c.code, true])),
        by: me,
      });
      await activity(orderId, 'verify', `${doc.type} verified`, me);
    }
    await audit(req, 'ops.verify', { orderId, docIds });
  };

  router.post(
    '/orders/:id/docs/:docId/verify',
    validate(z.object({ id: idParam, docId: idParam }), 'params'),
    async (req, res) => {
      const { id, docId } = validParams<{ id: number; docId: number }>(req);
      await verifyDocs(req, id, [docId]);
      done(res, await orderPayload(id, currentUserId(req)));
    }
  );

  router.post(
    '/orders/:id/verify-all',
    validate(z.object({ id: idParam }), 'params'),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const order = await need(id);
      await verifyDocs(
        req,
        id,
        order.docs.filter((d) => d.verification !== 'ok').map((d) => d.id)
      );
      done(res, await orderPayload(id, currentUserId(req)));
    }
  );

  router.post(
    '/orders/:id/docs',
    validate(z.object({ id: idParam }), 'params'),
    validate(
      z.object({
        type: z.string().trim().min(2).max(200),
        qty: z.coerce.number().int().min(1).max(999).default(1),
      })
    ),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const me = currentUserId(req);
      const { type, qty } = req.body as { type: string; qty: number };
      const order = await need(id);
      notClosed(order);
      needClaimed(order);
      const docId = await insert(
        `INSERT INTO tbl_order_dl_checklist (order_no, type, number) VALUES (:id, :type, :qty)`,
        { id, type, qty }
      );
      await activity(id, 'note', `Document added: ${qty} × ${type}`, me);
      await audit(req, 'ops.doc.add', { orderId: id, docId, type, qty });
      done(res, await orderPayload(id, me));
    }
  );

  // -------------------------------------------------------------------------
  // Pending items
  // -------------------------------------------------------------------------

  router.post(
    '/orders/:id/pending',
    validate(z.object({ id: idParam }), 'params'),
    validate(
      z.object({
        docId: bodyId.nullable().optional(),
        text: z.string().trim().min(2).max(500),
        owner: z.enum(['client', 'consultant', 'dept', 'third']).default('client'),
        who: z.string().trim().max(120).optional().default(''),
        dueH: z.coerce.number().positive().max(720).optional(),
      })
    ),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const me = currentUserId(req);
      const b = req.body as {
        docId?: number | null;
        text: string;
        owner: string;
        who: string;
        dueH?: number;
      };
      const order = await need(id);
      notClosed(order);
      needClaimed(order);
      if (b.docId) docOf(order, b.docId);

      const sla = await readSla();
      const due = new Date(Date.now() + (b.dueH ?? sla.chaseH) * 3_600_000);
      const itemId = await insert(
        `INSERT INTO tbl_ops_pending_item (order_id, doc_id, text, owner, who, raised_by, raised_at, due_at)
         VALUES (:id, :docId, :text, :owner, :who, :me, :at, :due)`,
        {
          id,
          docId: b.docId ?? null,
          text: b.text,
          owner: b.owner,
          who: b.who || null,
          me,
          at: stamp(),
          due: toLegacyDateTime(due),
        }
      );
      if (b.docId) await upsertCheck(id, b.docId, { status: 'issue' });
      await activity(id, 'issue', `Item raised (waiting on ${b.owner}): ${b.text}`, me);
      await audit(req, 'ops.pending.raise', { orderId: id, itemId });
      done(res, { itemId, ...(await orderPayload(id, me)) });
    }
  );

  const itemOf = async (itemId: number) => {
    const [item] = await sql<{
      id: number;
      order_id: number;
      doc_id: number | null;
      text: string;
      owner: string;
      resolved_at: string | null;
    }>(
      `SELECT id, order_id, doc_id, text, owner, resolved_at FROM tbl_ops_pending_item WHERE id = :itemId`,
      { itemId }
    );
    if (!item) throw notFound('We could not find that item.');
    return item;
  };

  router.post(
    '/pending/:id/remind',
    validate(z.object({ id: idParam }), 'params'),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const me = currentUserId(req);
      const item = await itemOf(id);
      if (item.resolved_at) throw conflict('That item is already resolved.');
      const sla = await readSla();
      await exec(
        `UPDATE tbl_ops_pending_item SET reminders = reminders + 1, last_reminded_at = :at, due_at = :due WHERE id = :id`,
        {
          id,
          at: stamp(),
          due: toLegacyDateTime(new Date(Date.now() + sla.chaseH * 3_600_000)),
        }
      );
      await activity(item.order_id, 'mail', `Reminder recorded: ${item.text}`, me);
      await audit(req, 'ops.pending.remind', { itemId: id });
      done(res, await orderPayload(item.order_id, me));
    }
  );

  router.post(
    '/pending/:id/resolve',
    validate(z.object({ id: idParam }), 'params'),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const me = currentUserId(req);
      const item = await itemOf(id);
      if (!item.resolved_at) {
        await exec(
          `UPDATE tbl_ops_pending_item SET resolved_at = :at, resolved_by = :me WHERE id = :id`,
          {
            id,
            at: stamp(),
            me,
          }
        );
        if (item.doc_id) {
          const [left] = await sql<{ n: number }>(
            `SELECT COUNT(*) AS n FROM tbl_ops_pending_item WHERE doc_id = :d AND resolved_at IS NULL`,
            { d: item.doc_id }
          );
          if (Number(left?.n ?? 0) === 0) {
            await exec(
              `UPDATE tbl_ops_doc_check SET status = 'pending', updated_at = :at WHERE doc_id = :d AND status = 'issue'`,
              { d: item.doc_id, at: stamp() }
            );
          }
        }
        await activity(item.order_id, 'resolve', `Item resolved: ${item.text}`, me);
        await audit(req, 'ops.pending.resolve', { itemId: id });
      }
      done(res, await orderPayload(item.order_id, me));
    }
  );

  // -------------------------------------------------------------------------
  // Routes and legs
  // -------------------------------------------------------------------------

  const event = (
    orderId: number,
    docId: number,
    legId: number | null,
    kind: string,
    adminId: number,
    extra: { detail?: unknown; checks?: string[]; exception?: string | null } = {},
    transaction?: Transaction
  ): Promise<number> =>
    insert(
      `INSERT INTO tbl_ops_leg_event (order_id, doc_id, leg_id, kind, admin_id, detail, checks, exception, created_at)
       VALUES (:orderId, :docId, :legId, :kind, :adminId, :detail, :checks, :exception, :at)`,
      {
        orderId,
        docId,
        legId,
        kind,
        adminId,
        detail:
          extra.detail === undefined ? null : JSON.stringify(extra.detail).slice(0, 2000),
        checks: extra.checks ? JSON.stringify(extra.checks) : null,
        exception: extra.exception ?? null,
        at: stamp(),
      },
      transaction
    );

  const readyToRoute = (order: OrderOps): void => {
    if (order.docs.length === 0)
      throw conflict('Add a document before planning a route.');
    if (order.docs.some((d) => d.verification !== 'ok')) {
      throw conflict('Routes unlock once every document is verified.');
    }
    if (order.items.some((i) => !i.resolved))
      throw conflict('Clear the open items before planning a route.');
  };

  type Dept = { id: number; short_name: string; name: string; default_fee: string };

  /** The department a type stands for on an order: the embassy of the destination, or the first active one of that type. */
  const departmentOfType = async (
    type: string,
    destination: string | null
  ): Promise<Dept | null> => {
    if (type === 'embassy') {
      const rows = await sql<Dept>(
        `SELECT id, short_name, name, default_fee FROM tbl_ops_department
          WHERE type = 'embassy' AND is_active = 1`
      );
      const needle = (destination ?? '').toLowerCase();
      return needle
        ? (rows.find((r) => `${r.name} ${r.short_name}`.toLowerCase().includes(needle)) ??
            null)
        : null;
    }
    const [row] = await sql<Dept>(
      `SELECT id, short_name, name, default_fee FROM tbl_ops_department WHERE type = :type AND is_active = 1 ORDER BY id LIMIT 1`,
      { type }
    );
    return row ?? null;
  };

  const applyRouteTo = async (
    order: OrderOps,
    doc: DocView,
    me: number,
    transaction: Transaction
  ): Promise<string[]> => {
    const notes: string[] = [];
    const input = {
      destination: order.destination,
      documentType:
        order.documentType === 'commercial'
          ? (1 as const)
          : order.documentType === 'personal'
            ? (2 as const)
            : null,
      docType: doc.type,
    };

    // The matching route template decides the legs. There is no built-in rule: with
    // no match the document gets no suggested route and the consultant adds the
    // legs by hand (or someone adds a template).
    const template = (await templatesAvailable())
      ? matchTemplate(await loadTemplates(), input, await loadLists())
      : null;
    if (!template || template.legs.length === 0) {
      return [
        `No route template matches ${doc.type} for ${order.destination ?? 'this destination'}. Add the legs by hand, or add a template in Routes, SLA & automation.`,
      ];
    }

    const legs: { dept: Dept | null; service: string; code: string; type: string }[] = [];
    for (const l of template.legs) {
      let dept: Dept | null = null;
      let type = l.type ?? l.deptType ?? 'other';
      if (l.departmentId !== null) {
        const [row] = await sql<Dept>(
          `SELECT id, short_name, name, default_fee FROM tbl_ops_department WHERE id = :id AND is_active = 1`,
          { id: l.departmentId }
        );
        dept = row ?? null;
      } else if (l.deptType) {
        type = l.deptType;
        dept = await departmentOfType(l.deptType, order.destination);
      }
      legs.push({
        dept,
        service: serviceFor(type, template.pathway),
        code: l.deptType ?? l.code ?? '',
        type,
      });
    }
    let seq = 1;
    for (const leg of legs) {
      const dept = leg.dept;
      if (!dept) {
        notes.push(
          leg.type === 'embassy'
            ? `No embassy department for ${order.destination ?? 'this destination'}. Add it in User manager > Embassies & departments.`
            : `No active ${leg.type} department. Add one in User manager > Embassies & departments.`
        );
        continue;
      }
      const legId = await insert(
        `INSERT INTO tbl_ops_doc_leg (order_id, doc_id, seq, department_id, service_label, price, responsible_id, status, created_at, updated_at)
         VALUES (:o, :d, :seq, :dept, :svc, :price, :resp, 'todo', :at, :at)`,
        {
          o: order.id,
          d: doc.id,
          seq: seq++,
          dept: dept.id,
          svc: leg.service,
          price: Number(dept.default_fee),
          resp: order.assigneeId ?? me,
          at: stamp(),
        },
        transaction
      );
      await event(
        order.id,
        doc.id,
        legId,
        'planned',
        me,
        { detail: { department: dept.short_name, service: leg.service } },
        transaction
      );
    }
    return notes;
  };

  router.post(
    '/orders/:id/route/apply',
    validate(z.object({ id: idParam }), 'params'),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const me = currentUserId(req);
      const order = await need(id);
      notClosed(order);
      needClaimed(order);
      readyToRoute(order);

      const notes: string[] = [];
      await sequelize.transaction(async (t) => {
        for (const doc of order.docs.filter((d) => !d.skipped && d.legs.length === 0)) {
          notes.push(...(await applyRouteTo(order, doc, me, t)));
        }
        await activity(id, 'route', 'Suggested route applied', me, t);
      });
      await audit(req, 'ops.route.apply', { orderId: id });
      done(res, { notes, ...(await orderPayload(id, me)) });
    }
  );

  router.put(
    '/orders/:id/docs/:docId/route',
    validate(z.object({ id: idParam, docId: idParam }), 'params'),
    validate(
      z.object({
        legs: z
          .array(
            z.object({
              departmentId: bodyId,
              price: z.coerce.number().min(0).max(99999).optional(),
            })
          )
          .min(1)
          .max(8),
      })
    ),
    async (req, res) => {
      const { id, docId } = validParams<{ id: number; docId: number }>(req);
      const me = currentUserId(req);
      const { legs } = req.body as { legs: { departmentId: number; price?: number }[] };
      const order = await need(id);
      notClosed(order);
      needClaimed(order);
      readyToRoute(order);
      const doc = docOf(order, docId);
      if (doc.skipped)
        throw conflict(
          'This document is marked as not needing legalisation. Mark it as needing legalisation before planning a route.'
        );
      if (doc.legs.some((l) => l.status !== 'todo')) {
        throw conflict(
          'This document has already left CLS, so its route can no longer be replaced.'
        );
      }

      const depts = await sql<{
        id: number;
        short_name: string;
        default_fee: string;
        is_active: number;
      }>(
        `SELECT id, short_name, default_fee, is_active FROM tbl_ops_department WHERE id IN (:ids)`,
        { ids: legs.map((l) => l.departmentId) }
      );
      for (const l of legs) {
        const d = depts.find((x) => x.id === l.departmentId);
        if (!d || d.is_active !== 1)
          throw badRequest('One of those departments is not available.');
      }

      await sequelize.transaction(async (t) => {
        await exec(
          `DELETE FROM tbl_ops_doc_leg WHERE doc_id = :docId AND status = 'todo'`,
          { docId },
          t
        );
        let seq = 1;
        for (const l of legs) {
          const d = depts.find((x) => x.id === l.departmentId)!;
          const legId = await insert(
            `INSERT INTO tbl_ops_doc_leg (order_id, doc_id, seq, department_id, price, responsible_id, status, created_at, updated_at)
             VALUES (:o, :d, :seq, :dept, :price, :resp, 'todo', :at, :at)`,
            {
              o: id,
              d: docId,
              seq: seq++,
              dept: d.id,
              price: l.price ?? Number(d.default_fee),
              resp: order.assigneeId ?? me,
              at: stamp(),
            },
            t
          );
          await event(
            id,
            docId,
            legId,
            'planned',
            me,
            { detail: { department: d.short_name } },
            t
          );
        }
        await activity(id, 'route', `Route set for ${doc.type}`, me, t);
      });
      await audit(req, 'ops.route.set', { orderId: id, docId });
      done(res, await orderPayload(id, me));
    }
  );

  router.post(
    '/orders/:id/docs/:docId/legs',
    validate(z.object({ id: idParam, docId: idParam }), 'params'),
    validate(
      z.object({
        departmentId: bodyId,
        // Compulsory: a leg with no price is a cost nobody has looked at.
        // A blank box is not a price of zero.
        price: z.preprocess(
          (value) => (value === '' || value === null ? undefined : value),
          z.coerce.number({ message: 'Enter the price for this leg.' }).min(0).max(99999)
        ),
      })
    ),
    async (req, res) => {
      const { id, docId } = validParams<{ id: number; docId: number }>(req);
      const me = currentUserId(req);
      const { departmentId, price } = req.body as {
        departmentId: number;
        price: number;
      };
      const order = await need(id);
      notClosed(order);
      needClaimed(order);
      const doc = docOf(order, docId);
      if (doc.verification !== 'ok')
        throw conflict('Verify the document before adding a leg.');
      if (doc.skipped)
        throw conflict(
          'This document is marked as not needing legalisation. Mark it as needing legalisation before adding a leg.'
        );

      const [dept] = await sql<{
        id: number;
        short_name: string;
        default_fee: string;
        is_active: number;
      }>(
        `SELECT id, short_name, default_fee, is_active FROM tbl_ops_department WHERE id = :departmentId`,
        { departmentId }
      );
      if (!dept || dept.is_active !== 1)
        throw badRequest('That department is not available.');

      const seq = doc.legs.reduce((m, l) => Math.max(m, l.seq), 0) + 1;
      const legId = await insert(
        `INSERT INTO tbl_ops_doc_leg (order_id, doc_id, seq, department_id, price, responsible_id, status, created_at, updated_at)
         VALUES (:o, :d, :seq, :dept, :price, :resp, 'todo', :at, :at)`,
        {
          o: id,
          d: docId,
          seq,
          dept: dept.id,
          price: price ?? Number(dept.default_fee),
          resp: order.assigneeId ?? me,
          at: stamp(),
        }
      );
      await event(id, docId, legId, 'planned', me, {
        detail: { department: dept.short_name },
      });
      await activity(id, 'route', `${dept.short_name} leg added to ${doc.type}`, me);
      done(res, await orderPayload(id, me));
    }
  );

  router.put(
    '/orders/:id/docs/:docId/legalise',
    validate(z.object({ id: idParam, docId: idParam }), 'params'),
    validate(z.object({ required: z.boolean() })),
    async (req, res) => {
      const { id, docId } = validParams<{ id: number; docId: number }>(req);
      const me = currentUserId(req);
      const { required } = req.body as { required: boolean };
      const order = await need(id);
      notClosed(order);
      needClaimed(order);
      readyToRoute(order);
      const doc = docOf(order, docId);

      if (!(await skipsAvailable()))
        throw conflict(
          'Marking a document as not needing legalisation is not switched on for this database yet.'
        );

      await sequelize.transaction(async (t) => {
        if (required) {
          if (doc.skipped) {
            await exec(
              `DELETE FROM tbl_ops_doc_skip WHERE doc_id = :docId`,
              { docId },
              t
            );
            await activity(id, 'route', `${doc.type} needs legalisation again`, me, t);
          }
          return;
        }
        if (doc.skipped) return;

        // Checked inside the transaction, on the rows themselves: a leg sent a
        // moment ago is not in the snapshot this handler loaded.
        const [row] = await sequelize.query<{ n: number }>(
          `SELECT COUNT(*) AS n FROM tbl_ops_doc_leg WHERE doc_id = :docId AND status = 'out' FOR UPDATE`,
          { type: QueryTypes.SELECT, replacements: { docId }, transaction: t }
        );
        if (Number(row?.n ?? 0) > 0)
          throw conflict(
            'This document is at a department. Receive it back before marking it as not needing legalisation.'
          );
        await exec(
          `DELETE FROM tbl_ops_doc_leg WHERE doc_id = :docId AND status = 'todo'`,
          { docId },
          t
        );
        await exec(
          `INSERT INTO tbl_ops_doc_skip (order_id, doc_id, skipped_by, skipped_at)
           VALUES (:id, :docId, :me, :at)
           ON DUPLICATE KEY UPDATE skipped_by = VALUES(skipped_by), skipped_at = VALUES(skipped_at)`,
          { id, docId, me, at: stamp() },
          t
        );
        await activity(
          id,
          'route',
          `${doc.type} marked as not needing legalisation`,
          me,
          t
        );
      });
      await audit(req, 'ops.route.legalise', { orderId: id, docId, required });
      done(res, await orderPayload(id, me));
    }
  );

  const legOf = async (legId: number) => {
    const [leg] = await sql<{
      id: number;
      order_id: number;
      doc_id: number;
      status: string;
      responsible_id: number | null;
    }>(
      `SELECT id, order_id, doc_id, status, responsible_id FROM tbl_ops_doc_leg WHERE id = :legId`,
      { legId }
    );
    if (!leg) throw notFound('We could not find that leg.');
    return leg;
  };

  router.patch(
    '/legs/:id',
    validate(z.object({ id: idParam }), 'params'),
    validate(
      z.object({
        price: z.coerce.number().min(0).max(99999).optional(),
        responsibleId: bodyId.optional(),
      })
    ),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const me = currentUserId(req);
      const b = req.body as { price?: number; responsibleId?: number };
      const leg = await legOf(id);
      const order = await need(leg.order_id);
      notClosed(order);
      const live = order.docs.flatMap((d) => d.legs).find((l) => l.id === id);
      if (!live || live.status !== 'todo')
        throw conflict('Only a leg that has not been sent can be edited.');
      if (!canSign(order, live, me)) {
        throw conflict(
          "Only the order's consultant or the leg's responsible person can change it."
        );
      }
      if (b.responsibleId) {
        const staff = await loadStaff();
        if (!staff.assignable.some((s) => s.id === b.responsibleId))
          throw badRequest('That person is not on the roster.');
      }
      if (b.price !== undefined)
        await exec(
          `UPDATE tbl_ops_doc_leg SET price = :v, updated_at = :at WHERE id = :id`,
          { id, v: b.price, at: stamp() }
        );
      if (b.responsibleId)
        await exec(
          `UPDATE tbl_ops_doc_leg SET responsible_id = :v, updated_at = :at WHERE id = :id`,
          { id, v: b.responsibleId, at: stamp() }
        );
      await event(
        leg.order_id,
        leg.doc_id,
        id,
        b.price !== undefined ? 'price' : 'responsible',
        me,
        { detail: b }
      );
      done(res, await orderPayload(leg.order_id, me));
    }
  );

  router.delete(
    '/legs/:id',
    validate(z.object({ id: idParam }), 'params'),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const me = currentUserId(req);
      const leg = await legOf(id);
      const order = await need(leg.order_id);
      notClosed(order);
      const live = order.docs.flatMap((d) => d.legs).find((l) => l.id === id);
      if (!live || live.status !== 'todo')
        throw conflict('Only a leg that has not been sent can be removed.');
      if (!canSign(order, live, me))
        throw conflict(
          "Only the order's consultant or the leg's responsible person can remove it."
        );
      await exec(`DELETE FROM tbl_ops_doc_leg WHERE id = :id AND status = 'todo'`, {
        id,
      });
      await event(leg.order_id, leg.doc_id, id, 'removed', me, {
        detail: { department: live.department },
      });
      await activity(leg.order_id, 'route', `${live.department} leg removed`, me);
      done(res, await orderPayload(leg.order_id, me));
    }
  );

  // -------------------------------------------------------------------------
  // Sign-off: sent to department, received at CLS
  // -------------------------------------------------------------------------

  router.post(
    '/legs/sign',
    validate(
      z.object({
        kind: z.enum(['sent', 'received']),
        legIds: z.array(bodyId).min(1).max(100),
        checks: z.array(z.string().max(300)).max(20).default([]),
        exception: z.string().trim().max(500).optional().default(''),
        ref: z.string().trim().max(120).optional().default(''),
        prices: z
          .record(z.string(), z.coerce.number().min(0).max(99999))
          .optional()
          .default({}),
        take: z.boolean().optional().default(false),
      })
    ),
    async (req, res) => {
      const me = currentUserId(req);
      const b = req.body as {
        kind: 'sent' | 'received';
        legIds: number[];
        checks: string[];
        exception: string;
        ref: string;
        prices: Record<string, number>;
        take: boolean;
      };

      const rows = await sql<{ id: number; order_id: number }>(
        `SELECT id, order_id FROM tbl_ops_doc_leg WHERE id IN (:ids)`,
        { ids: b.legIds }
      );
      if (rows.length !== b.legIds.length)
        throw notFound('One of those legs no longer exists.');

      const orderIds = [...new Set(rows.map((r) => r.order_id))];
      const orders = await loadOrders({ ids: orderIds, includeClosed: true });
      const picks: { order: OrderOps; doc: DocView; leg: LegView }[] = [];

      for (const legId of b.legIds) {
        let found: { order: OrderOps; doc: DocView; leg: LegView } | null = null;
        for (const order of orders) {
          for (const doc of order.docs) {
            const leg = doc.legs.find((l) => l.id === legId);
            if (leg) found = { order, doc, leg };
          }
        }
        if (!found) throw notFound('One of those legs no longer exists.');
        picks.push(found);
      }

      const dept = picks[0]!.leg.departmentId;
      if (picks.some((p) => p.leg.departmentId !== dept))
        throw badRequest('Pick documents going to the same department.');

      for (const p of picks) {
        notClosed(p.order);
        needClaimed(p.order);
        const cur = p.doc.legs[p.doc.currentLeg];
        if (!cur || cur.id !== p.leg.id)
          throw conflict(`${p.doc.type} is not at that step of its route.`);
        if (b.kind === 'sent' && p.leg.status !== 'todo')
          throw conflict(`${p.doc.type} has already been sent.`);
        if (b.kind === 'received' && p.leg.status !== 'out')
          throw conflict(`${p.doc.type} has not been sent yet.`);
      }

      const typeDef = (await loadDeptTypes()).find(
        (t) => t.code === picks[0]!.leg.departmentType
      );
      const rules = (b.kind === 'sent' ? typeDef?.send : typeDef?.receive) ?? [];
      const exception = b.exception || null;
      if (!exception && rules.some((r) => !b.checks.includes(r))) {
        throw badRequest('Tick every check, or record an exception.');
      }

      const notMine = picks.filter((p) => !canSign(p.order, p.leg, me));
      if (notMine.length && !b.take) {
        throw conflict(
          "Only the order's consultant or the leg's responsible person can sign off. Take responsibility to continue."
        );
      }

      await sequelize.transaction(async (t) => {
        for (const p of picks) {
          if (notMine.includes(p) && b.take) {
            await exec(
              `UPDATE tbl_ops_doc_leg SET responsible_id = :me WHERE id = :id`,
              { me, id: p.leg.id },
              t
            );
          }
          const price = b.prices[String(p.leg.id)];
          if (b.kind === 'sent') {
            await exec(
              `UPDATE tbl_ops_doc_leg SET status = 'out', sent_at = :at, sent_by = :me, sent_exception = :exc, sent_ref = :ref,
                      price = COALESCE(:price, price), updated_at = :at WHERE id = :id`,
              {
                id: p.leg.id,
                at: stamp(),
                me,
                exc: exception,
                ref: b.ref || null,
                price: price ?? null,
              },
              t
            );
          } else {
            await exec(
              `UPDATE tbl_ops_doc_leg SET status = 'done', received_at = :at, received_by = :me, received_exception = :exc, updated_at = :at WHERE id = :id`,
              { id: p.leg.id, at: stamp(), me, exc: exception },
              t
            );
          }
          await event(
            p.order.id,
            p.doc.id,
            p.leg.id,
            b.kind,
            me,
            {
              detail: {
                department: p.leg.department,
                price: price ?? p.leg.price,
                ref: b.ref || null,
              },
              checks: b.checks,
              exception,
            },
            t
          );
          await activity(
            p.order.id,
            b.kind === 'sent' ? 'out' : 'back',
            `${p.doc.qty} × ${p.doc.type} ${b.kind === 'sent' ? 'sent to' : 'received from'} ${p.leg.department}${exception ? ' (exception recorded)' : ''}`,
            me,
            t
          );
        }
      });

      await audit(req, 'ops.leg.sign', {
        kind: b.kind,
        legIds: b.legIds,
        exception: Boolean(exception),
      });
      const refreshed = await loadOrders({ ids: orderIds, includeClosed: true });
      done(res, {
        ready: refreshed.filter((o) => o.stage === 'ready').map((o) => o.id),
        orders: refreshed.map((o) => ({ id: o.id, stage: o.stage })),
      });
    }
  );

  router.post(
    '/orders/:id/docs/:docId/undo',
    validate(z.object({ id: idParam, docId: idParam }), 'params'),
    async (req, res) => {
      const { id, docId } = validParams<{ id: number; docId: number }>(req);
      const me = currentUserId(req);
      const order = await need(id);
      notClosed(order);
      const doc = docOf(order, docId);

      const [last] = await sql<{ id: number; kind: string; leg_id: number }>(
        `SELECT id, kind, leg_id FROM tbl_ops_leg_event
          WHERE doc_id = :docId AND kind IN ('sent','received') AND undone = 0 ORDER BY id DESC LIMIT 1`,
        { docId }
      );
      if (!last) throw conflict('Nothing to undo.');
      const leg = doc.legs.find((l) => l.id === last.leg_id);
      if (!leg || !canSign(order, leg, me))
        throw conflict(
          "Only the order's consultant or the leg's responsible person can undo."
        );

      await sequelize.transaction(async (t) => {
        if (last.kind === 'received') {
          await exec(
            `UPDATE tbl_ops_doc_leg SET status = 'out', received_at = NULL, received_by = NULL, received_exception = NULL, updated_at = :at WHERE id = :id`,
            { id: leg.id, at: stamp() },
            t
          );
        } else {
          await exec(
            `UPDATE tbl_ops_doc_leg SET status = 'todo', sent_at = NULL, sent_by = NULL, sent_exception = NULL, sent_ref = NULL, updated_at = :at WHERE id = :id`,
            { id: leg.id, at: stamp() },
            t
          );
        }
        await exec(
          `UPDATE tbl_ops_leg_event SET undone = 1 WHERE id = :id`,
          { id: last.id },
          t
        );
        await event(
          id,
          docId,
          leg.id,
          'undo',
          me,
          { detail: { undid: last.kind, department: leg.department } },
          t
        );
        await activity(
          id,
          'note',
          `Undid "${last.kind}" for ${doc.type} (${leg.department})`,
          me,
          t
        );
      });
      await audit(req, 'ops.leg.undo', { orderId: id, docId });
      done(res, await orderPayload(id, me));
    }
  );

  // -------------------------------------------------------------------------
  // Return to the client
  // -------------------------------------------------------------------------

  router.post(
    '/orders/:id/return',
    validate(z.object({ id: idParam }), 'params'),
    validate(
      z.object({
        method: z.enum(['collect', 'courier']),
        by: z.string().trim().max(120).optional().default(''),
      })
    ),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const me = currentUserId(req);
      const { method, by } = req.body as { method: 'collect' | 'courier'; by: string };
      const order = await need(id);
      notClosed(order);
      if (order.stage !== 'ready')
        throw conflict(
          'Every document must be back at CLS before the order is returned.'
        );
      if (method === 'collect' && !by)
        throw badRequest('Enter who collected the documents.');

      // The screen greys the buttons out until these hold; the API holds the same
      // line, so a stale tab or a direct call cannot close an unpaid order.
      const unmet = returnChecks({ ...order, returnMethod: method }).filter((c) => !c.ok);
      if (unmet.length)
        throw conflict(
          `This order cannot be returned yet: ${unmet.map((c) => c.bad.toLowerCase()).join('; ')}.`
        );

      await exec(
        `INSERT INTO tbl_ops_order_state (order_id, return_method, returned_by, returned_at, created_at, updated_at)
         VALUES (:id, :method, :by, :at, :at, :at)
         ON DUPLICATE KEY UPDATE return_method = :method, returned_by = :by, returned_at = :at, updated_at = :at`,
        { id, method, by: by || null, at: stamp() }
      );
      await activity(
        id,
        'done',
        method === 'collect'
          ? `Handed to ${by} (photo ID sighted). Order closed.`
          : 'Dispatched to the client. Order closed.',
        me
      );
      await audit(req, 'ops.return', { orderId: id, method });
      done(res, await orderPayload(id, me));
    }
  );

  // -------------------------------------------------------------------------
  // Where the documents go back to
  // -------------------------------------------------------------------------

  /**
   * Sets the return address for an order — the one the client gave, corrected, or
   * one staff take over the phone when a client who meant to collect asks CLS to
   * deliver instead. Staff saying "the client confirmed this" is what marks the
   * address confirmed, so Dispatch unlocks. Allowed at any stage, closed included:
   * a client can change their mind after the documents were handed back.
   */
  router.put(
    '/orders/:id/return-address',
    validate(z.object({ id: idParam }), 'params'),
    validate(
      z.object({
        firstName: z.string().trim().max(255).optional().default(''),
        lastName: z.string().trim().max(255).optional().default(''),
        company: z.string().trim().max(255).optional().default(''),
        email: z.string().trim().max(255).optional().default(''),
        phone: z.string().trim().max(255).optional().default(''),
        address: z.string().trim().min(3, 'Enter the street address.').max(255),
        city: z.string().trim().min(1, 'Enter the city.').max(255),
        state: z.string().trim().max(255).optional().default(''),
        postcode: z.string().trim().max(255).optional().default(''),
        countryId: z.coerce.number().int().positive().nullable().optional(),
      })
    ),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const me = currentUserId(req);
      const b = req.body as {
        firstName: string;
        lastName: string;
        company: string;
        email: string;
        phone: string;
        address: string;
        city: string;
        state: string;
        postcode: string;
        countryId?: number | null;
      };
      const order = await need(id);
      needClaimed(order);

      const values = {
        first_name: b.firstName || null,
        last_name: b.lastName || null,
        company: b.company || null,
        email: b.email || null,
        contact_number: b.phone || null,
        address: b.address,
        city: b.city,
        state: b.state || null,
        postcode: b.postcode || null,
        country_id: b.countryId ?? null,
        status: 1,
      };

      await sequelize.transaction(async (t) => {
        const existing = await OrderReturnDocumentDetails.findOne({
          where: { order_id: id },
          order: [['id', 'ASC']],
          transaction: t,
        });
        if (existing) await existing.update(values, { transaction: t });
        else
          await OrderReturnDocumentDetails.create(
            { order_id: id, ...values },
            { transaction: t }
          );

        await ClsOrder.update(
          { is_address_confirmed: 1, date_last_saved: stamp() },
          { where: { id }, transaction: t }
        );
        await activity(id, 'note', 'Return address set and confirmed by staff', me, t);
      });
      await audit(req, 'ops.return-address', { orderId: id });
      done(res, await orderPayload(id, me));
    }
  );

  /**
   * A client who collected, or meant to, asks CLS to deliver after all. Closed
   * orders cannot be returned a second time, so this is its own action: it needs
   * a confirmed return address, records the change, and leaves the order closed
   * with the courier as its method.
   */
  router.post(
    '/orders/:id/return/dispatch-instead',
    validate(z.object({ id: idParam }), 'params'),
    async (req, res) => {
      const { id } = validParams<{ id: number }>(req);
      const me = currentUserId(req);
      const order = await need(id);
      if (order.stage !== 'done' || order.returnMethod !== 'collect')
        throw conflict(
          'Only an order handed over for collection can be changed to a dispatch.'
        );
      if (!order.addressConfirmed || !order.returnAddress)
        throw conflict('Add and confirm the return address first.');

      await exec(
        `UPDATE tbl_ops_order_state SET return_method = 'courier', returned_by = NULL, returned_at = :at, updated_at = :at
          WHERE order_id = :id`,
        { id, at: stamp() }
      );
      await activity(
        id,
        'done',
        'Client asked CLS to deliver instead of collecting. Dispatched to the return address.',
        me
      );
      await audit(req, 'ops.return.dispatch-instead', { orderId: id });
      done(res, await orderPayload(id, me));
    }
  );

  // -------------------------------------------------------------------------
  // Document Hub
  // -------------------------------------------------------------------------

  type HubState = 'intake' | 'unplanned' | 'tosend' | 'out' | 'complete' | 'returned';

  const hubStateOf = (order: OrderOps, doc: DocView): HubState => {
    if (order.stage === 'done') return 'returned';
    if (doc.verification !== 'ok') return 'intake';
    if (doc.skipped) return 'complete';
    if (doc.legs.length === 0) return 'unplanned';
    const leg = doc.legs[doc.currentLeg];
    if (!leg) return 'complete';
    return leg.status === 'out' ? 'out' : 'tosend';
  };

  router.get('/documents', async (req, res) => {
    const q = req.query as Record<string, string | undefined>;
    const state = q.state ?? '';
    const orders = await loadOrders({ includeClosed: true, closedLimit: 60 });

    const all = orders.flatMap((order) =>
      order.docs.map((doc) => {
        const s = hubStateOf(order, doc);
        const leg = doc.legs[doc.currentLeg] ?? null;
        const since =
          s === 'out'
            ? leg?.sentAt
            : s === 'complete'
              ? doc.legs[doc.legs.length - 1]?.receivedAt
              : s === 'tosend' && doc.currentLeg > 0
                ? doc.legs[doc.currentLeg - 1]?.receivedAt
                : (doc.verifiedAt ?? order.receivedAt);
        const outMs =
          s === 'out' && leg?.sentAt ? Date.now() - Date.parse(leg.sentAt) : null;
        const tatMs = leg ? leg.tatDays * 86_400_000 : null;

        return {
          orderId: order.id,
          docId: doc.id,
          type: doc.type,
          qty: doc.qty,
          code: `DOC-${String(order.id).slice(-4)}-${doc.id}`,
          client: order.client,
          destination: order.destination,
          destinationCode: order.destinationCode,
          state: s,
          currentDepartment: leg?.department ?? null,
          currentDepartmentId: leg?.departmentId ?? null,
          currentDepartmentType: leg?.departmentType ?? null,
          currentDepartmentName: leg?.departmentName ?? null,
          assigneeId: order.assigneeId,
          price: leg?.price ?? null,
          sentAt: leg?.sentAt ?? null,
          legIndex: doc.currentLeg,
          skipped: doc.skipped,
          legId: leg?.id ?? null,
          route: doc.legs.map((l, i) => ({
            id: l.id,
            department: l.department,
            type: l.departmentType,
            status: l.status,
            current: i === doc.currentLeg,
          })),
          since: since ?? order.receivedAt,
          late: outMs !== null && tatMs !== null && outMs > tatMs,
          responsibleId: leg?.responsibleId ?? order.assigneeId,
          responsible: leg?.responsible ?? order.assignee,
          canSign: false,
        };
      })
    );

    const counts = {
      all: all.length,
      intake: 0,
      unplanned: 0,
      tosend: 0,
      out: 0,
      complete: 0,
      returned: 0,
    };
    for (const r of all) counts[r.state] += 1;

    const needle = (q.q ?? '').trim().toLowerCase();
    const rows = all
      .filter((r) =>
        state === '' || state === 'live'
          ? r.state !== 'returned'
          : state === 'all'
            ? true
            : r.state === state
      )
      .filter((r) => !q.dept || String(r.currentDepartmentId) === q.dept)
      .filter((r) => !q.who || String(r.responsibleId) === q.who)
      .filter((r) => !q.dest || r.destinationCode === q.dest)
      .filter(
        (r) =>
          !needle ||
          `${r.type} ${r.orderId} ${r.client} ${r.code}`.toLowerCase().includes(needle)
      )
      .sort((a, b) => (a.since ?? '').localeCompare(b.since ?? ''));

    const [departments, staff] = await Promise.all([
      sql<{ id: number; short_name: string; name: string }>(
        `SELECT id, short_name, name FROM tbl_ops_department WHERE is_active = 1 ORDER BY short_name`
      ),
      loadStaff(),
    ]);

    done(res, {
      me: currentUserId(req),
      counts,
      total: rows.length,
      rows: rows.slice(0, 200),
      departments: departments.map((d) => ({
        id: d.id,
        shortName: d.short_name,
        name: d.name,
      })),
      staff: staff.assignable,
    });
  });

  router.get(
    '/documents/:orderId/:docId',
    validate(z.object({ orderId: idParam, docId: idParam }), 'params'),
    async (req, res) => {
      const { orderId, docId } = validParams<{ orderId: number; docId: number }>(req);
      const payload = await orderPayload(orderId, currentUserId(req));
      const doc = docOf(payload.order, docId);
      const order = payload.order;

      type Step = {
        title: string;
        status: 'done' | 'cur' | 'next' | 'todo';
        at: string | null;
        by: string | null;
        note: string | null;
      };
      const steps: Step[] = [
        {
          title: 'Intake',
          status: 'done',
          at: order.receivedAt,
          by: 'System',
          note: 'Order received',
        },
        {
          title: 'Verified by CLS',
          status: doc.verification === 'ok' ? 'done' : 'cur',
          at: doc.verifiedAt,
          by: doc.verifiedBy,
          note:
            doc.verification === 'ok'
              ? 'Checklist complete'
              : doc.verification === 'issue'
                ? 'Item open'
                : 'To verify',
        },
      ];
      if (doc.skipped)
        steps.push({
          title: 'No legalisation needed',
          status: 'done',
          at: null,
          by: null,
          note: 'Marked by staff. It takes no further route.',
        });
      doc.legs.forEach((l, i) => {
        steps.push({
          title: `Sent to ${l.department}`,
          status: l.sentAt ? 'done' : i === doc.currentLeg ? 'next' : 'todo',
          at: l.sentAt,
          by: l.sentBy,
          note: l.sentAt
            ? `${l.sentException ? `Exception: ${l.sentException}` : 'Checklist complete'}${l.sentRef ? ` · ref ${l.sentRef}` : ''}`
            : `${l.responsible ?? 'Unassigned'} responsible`,
        });
        if (l.status === 'out') {
          steps.push({
            title: `At ${l.department}`,
            status: 'cur',
            at: l.sentAt,
            by: null,
            note: `Usually ${l.tatDays} day${l.tatDays === 1 ? '' : 's'}`,
          });
        }
        steps.push({
          title: `Received at CLS from ${l.department}`,
          status: l.receivedAt ? 'done' : 'todo',
          at: l.receivedAt,
          by: l.receivedBy,
          note: l.receivedAt
            ? l.receivedException
              ? `Exception: ${l.receivedException}`
              : 'Checklist complete'
            : null,
        });
      });
      steps.push({
        title:
          order.returnMethod === 'collect' ? 'Collected by client' : 'Returned to client',
        status: order.returnedAt ? 'done' : order.stage === 'ready' ? 'next' : 'todo',
        at: order.returnedAt,
        by: null,
        note: null,
      });

      done(res, { order, doc, steps, hubState: hubStateOf(order, doc) });
    }
  );

  // -------------------------------------------------------------------------
  // Dashboard
  // -------------------------------------------------------------------------

  router.get('/dashboard', async (req, res) => {
    const me = currentUserId(req);
    const orders = await loadOrders();
    const staff = await loadStaff();

    const mineList = orders.filter((o) => o.assigneeId === me);
    const requested =
      req.query.scope === 'team' ? 'team' : req.query.scope === 'mine' ? 'mine' : null;
    const scope = requested ?? (mineList.length ? 'mine' : 'team');
    const inScope = scope === 'team' ? orders : mineList;

    const claimed = inScope.filter((o) => o.stage !== 'new');
    const queue = claimed
      .map((o) => ({ order: o }))
      .sort((a, b) => (a.order.sla?.dueAt ?? Infinity) - (b.order.sla?.dueAt ?? Infinity))
      .slice(0, 30)
      .map(({ order }) => ({
        id: order.id,
        client: order.client,
        destination: order.destination,
        destinationCode: order.destinationCode,
        stage: order.stage,
        stageLabel: order.stageLabel,
        sla: order.sla,
        next: order.next,
        assigneeId: order.assigneeId,
        assignee: order.assignee,
      }));

    const atDept = inScope
      .flatMap((o) => currentLegsOf(o).map(({ doc, leg }) => ({ o, doc, leg })))
      .filter((x) => x.leg.status === 'out')
      .sort((a, b) => (a.leg.sentAt ?? '').localeCompare(b.leg.sentAt ?? ''));

    const today = new Date().toDateString();
    const pipeline = ['new', 'verify', 'pending', 'route', 'process', 'ready'].map(
      (k) => ({
        key: k,
        label: STAGE_LABEL[k as keyof typeof STAGE_LABEL],
        value: inScope.filter((o) => o.stage === k).length,
      })
    );

    const scopeIds = inScope.map((o) => o.id);
    const feed = scopeIds.length
      ? await sql<{
          id: number;
          order_id: number;
          kind: string;
          text: string;
          admin_id: number | null;
          created_at: string;
        }>(
          `SELECT id, order_id, kind, text, admin_id, created_at FROM tbl_ops_activity
            WHERE order_id IN (:ids) ORDER BY id DESC LIMIT 14`,
          { ids: scopeIds.slice(0, 500) }
        )
      : [];

    done(res, {
      scope,
      me,
      mineCount: mineList.length,
      kpi: {
        open: inScope.length,
        receivedToday: inScope.filter(
          (o) => o.receivedAt && new Date(o.receivedAt).toDateString() === today
        ).length,
        action: claimed.filter((o) => !o.next.waiting).length,
        breach: inScope.filter((o) => o.sla?.state === 'breach').length,
        risk: inScope.filter((o) => o.sla?.state === 'risk').length,
        waitingClient: inScope.filter((o) =>
          o.items.some((i) => !i.resolved && i.owner === 'client')
        ).length,
        waitingOther: inScope.filter((o) =>
          o.items.some(
            (i) => !i.resolved && i.owner !== 'client' && i.owner !== 'consultant'
          )
        ).length,
        atDept: atDept.length,
        deptCount: new Set(atDept.map((x) => x.leg.departmentId)).size,
        ready: inScope.filter((o) => o.stage === 'ready').length,
      },
      queue,
      unassigned: orders
        .filter((o) => o.stage === 'new')
        .slice(0, 8)
        .map((o) => ({
          id: o.id,
          client: o.client,
          destination: o.destination,
          docs: o.docs.length,
          receivedAt: o.receivedAt,
          sla: o.sla,
        })),
      atDept: atDept.slice(0, 8).map(({ o, doc, leg }) => ({
        orderId: o.id,
        docId: doc.id,
        type: doc.type,
        legId: leg.id,
        department: leg.department,
        sentAt: leg.sentAt,
        late: leg.sentAt
          ? Date.now() - Date.parse(leg.sentAt) > leg.tatDays * 86_400_000
          : false,
      })),
      pipeline,
      activity: feed.map((a) => ({
        id: a.id,
        orderId: a.order_id,
        kind: a.kind,
        text: a.text,
        by: a.admin_id ? (staff.names.get(a.admin_id) ?? null) : 'System',
        at: toIso(a.created_at),
      })),
    });
  });

  /**
   * The saved views on the Orders list: how many open legalisation orders each
   * holds, and the rows of the one asked for (`?view=`). A view is a filter over
   * the derived stage, so it is computed here rather than in SQL.
   */
  router.get('/views', async (req, res) => {
    const me = currentUserId(req);
    const orders = await loadOrders();

    const VIEWS: Record<string, (o: (typeof orders)[number]) => boolean> = {
      mine: (o) => o.assigneeId === me,
      unassigned: (o) => o.stage === 'new',
      sla: (o) => o.sla?.state === 'breach' || o.sla?.state === 'risk',
      waiting: (o) => o.items.some((i) => !i.resolved && i.owner === 'client'),
      dept: (o) => currentLegsOf(o).some(({ leg }) => leg.status === 'out'),
      ready: (o) => o.stage === 'ready',
      open: () => true,
    };

    const counts = Object.fromEntries(
      Object.entries(VIEWS).map(([key, test]) => [key, orders.filter(test).length])
    );

    const asked = typeof req.query.view === 'string' ? req.query.view : null;
    const test = asked ? VIEWS[asked] : undefined;
    const rows = test
      ? orders
          .filter(test)
          .sort((a, b) => (a.sla?.dueAt ?? Infinity) - (b.sla?.dueAt ?? Infinity))
          .slice(0, 200)
          .map((o) => ({
            id: o.id,
            client: o.client,
            destination: o.destination,
            destinationCode: o.destinationCode,
            receivedAt: o.receivedAt,
            stage: o.stage,
            stageLabel: o.stageLabel,
            sla: o.sla,
            next: o.next,
            assigneeId: o.assigneeId,
            assignee: o.assignee,
            docs: o.docs.length,
          }))
      : [];

    done(res, { me, view: test ? asked : null, counts, rows });
  });

  return router;
};
