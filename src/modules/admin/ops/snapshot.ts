import { QueryTypes, type Transaction } from 'sequelize';
import { sequelize } from '../../../config/database';
import { toIso } from '../../../shared/dates';
import { clean } from '../../../shared/text';
import {
  DEFAULT_SLA,
  LIST_KEYS,
  STAGE_LABEL,
  deriveStage,
  slaFor,
  type DestGroup,
  type DocKind,
  type Lists,
  type OpsStage,
  type Pathway,
  type SlaClock,
  type SlaSettings,
} from '../../../domain/opsRules';

/**
 * Reads the Phase 1 picture of document legalisation orders.
 *
 * Everything here is a plain SELECT over the legacy tables plus the eight
 * `tbl_ops_*` tables. Nothing is written, and nothing about an order is stored
 * that can be derived: the stage, the SLA clock and the next action are computed
 * from the documents and their legs every time, so they cannot drift from the
 * data they describe.
 */

export const sql = <T>(
  query: string,
  replacements: Record<string, unknown> = {},
  transaction?: Transaction
): Promise<T[]> =>
  sequelize.query(query, {
    type: QueryTypes.SELECT,
    replacements,
    transaction,
  }) as Promise<T[]>;

// ---------------------------------------------------------------------------
// Is the migration applied?
// ---------------------------------------------------------------------------

let availableAt = 0;
let availableValue = false;

/** True once `tbl_ops_department` exists. Cached briefly so a probe is not per request. */
export const opsAvailable = async (): Promise<boolean> => {
  const now = Date.now();
  if (availableValue || now - availableAt < 15_000) {
    if (availableValue) return true;
    if (now - availableAt < 15_000) return false;
  }

  try {
    const [row] = await sql<{ n: number }>(
      `SELECT COUNT(*) AS n FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tbl_ops_department'`
    );
    availableValue = Number(row?.n ?? 0) > 0;
  } catch {
    availableValue = false;
  }

  availableAt = now;
  return availableValue;
};

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const readSla = async (): Promise<SlaSettings> => {
  const rows = await sql<{ k: string; v: string }>(
    `SELECT k, v FROM tbl_ops_setting WHERE k LIKE 'sla\\_%'`
  );
  const get = (key: string, fallback: number): number => {
    const found = rows.find((r) => r.k === key);
    const value = found ? Number(found.v) : NaN;
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };

  return {
    claimH: get('sla_claim_h', DEFAULT_SLA.claimH),
    verifyH: get('sla_verify_h', DEFAULT_SLA.verifyH),
    chaseH: get('sla_chase_h', DEFAULT_SLA.chaseH),
    routeH: get('sla_route_h', DEFAULT_SLA.routeH),
    readyH: get('sla_ready_h', DEFAULT_SLA.readyH),
  };
};

export interface AutomationSettings {
  autoAssign: boolean;
  autoChase: boolean;
  autoQueue: boolean;
  autoReview: boolean;
  autoWallet: boolean;
}

export const AUTOMATION_KEYS: Record<keyof AutomationSettings, string> = {
  autoAssign: 'auto_assign',
  autoChase: 'auto_chase',
  autoQueue: 'auto_queue',
  autoReview: 'auto_review',
  autoWallet: 'auto_wallet',
};

/** Saved preferences. Off until someone turns them on: nothing here acts yet. */
export const readAutomation = async (): Promise<AutomationSettings> => {
  const rows = await sql<{ k: string; v: string }>(
    `SELECT k, v FROM tbl_ops_setting WHERE k LIKE 'auto\\_%'`
  );
  const on = (key: string): boolean => rows.find((r) => r.k === key)?.v === '1';
  return {
    autoAssign: on(AUTOMATION_KEYS.autoAssign),
    autoChase: on(AUTOMATION_KEYS.autoChase),
    autoQueue: on(AUTOMATION_KEYS.autoQueue),
    autoReview: on(AUTOMATION_KEYS.autoReview),
    autoWallet: on(AUTOMATION_KEYS.autoWallet),
  };
};

const probes = new Map<string, { at: number; ok: boolean }>();

/** True once every named table exists. Positive answers stick; negative ones are rechecked after 15 seconds. */
const tablesExist = async (names: readonly string[]): Promise<boolean> => {
  const key = names.join(',');
  const known = probes.get(key);
  const now = Date.now();
  if (known?.ok) return true;
  if (known && now - known.at < 15_000) return false;
  let ok = false;
  try {
    const [row] = await sql<{ n: number }>(
      `SELECT COUNT(*) AS n FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:names)`,
      { names }
    );
    ok = Number(row?.n ?? 0) === names.length;
  } catch {
    ok = false;
  }
  probes.set(key, { at: now, ok });
  return ok;
};

/** True once the route-template tables exist (they arrive with the same migration file). */
export const templatesAvailable = (): Promise<boolean> =>
  tablesExist(['tbl_ops_route_template', 'tbl_ops_route_template_leg']);

/** True once the table that holds proof of hand-recorded payments exists. */
export const proofsAvailable = (): Promise<boolean> =>
  tablesExist(['tbl_ops_payment_proof']);

/** True once the table of documents that need no legalisation exists. */
export const skipsAvailable = (): Promise<boolean> => tablesExist(['tbl_ops_doc_skip']);

/** True once the rule tables (checks, department types, checklists, lists) exist. */
export const configAvailable = (): Promise<boolean> =>
  tablesExist([
    'tbl_ops_check_def',
    'tbl_ops_dept_type',
    'tbl_ops_leg_rule',
    'tbl_ops_list_item',
  ]);

export interface CheckDef {
  code: string;
  label: string;
  active: boolean;
}

export const loadChecks = async (): Promise<CheckDef[]> => {
  if (!(await configAvailable())) return [];
  const rows = await sql<{ code: string; label: string; is_active: number }>(
    `SELECT code, label, is_active FROM tbl_ops_check_def ORDER BY sort_order, id`
  );
  return rows.map((r) => ({ code: r.code, label: r.label, active: r.is_active === 1 }));
};

export interface DeptTypeDef {
  code: string;
  label: string;
  active: boolean;
  send: string[];
  receive: string[];
}

export const loadDeptTypes = async (): Promise<DeptTypeDef[]> => {
  if (!(await configAvailable())) return [];
  const [types, rules] = await Promise.all([
    sql<{ code: string; label: string; is_active: number }>(
      `SELECT code, label, is_active FROM tbl_ops_dept_type ORDER BY sort_order, id`
    ),
    sql<{ type_code: string; phase: string; label: string }>(
      `SELECT type_code, phase, label FROM tbl_ops_leg_rule ORDER BY type_code, phase, sort_order, id`
    ),
  ]);
  return types.map((t) => ({
    code: t.code,
    label: t.label,
    active: t.is_active === 1,
    send: rules
      .filter((r) => r.type_code === t.code && r.phase === 'send')
      .map((r) => r.label),
    receive: rules
      .filter((r) => r.type_code === t.code && r.phase === 'receive')
      .map((r) => r.label),
  }));
};

export const loadLists = async (): Promise<Lists> => {
  const lists: Lists = { hague: [], arab: [], civil_doc: [], police_doc: [] };
  if (!(await configAvailable())) return lists;
  const rows = await sql<{ list_key: string; value: string }>(
    `SELECT list_key, value FROM tbl_ops_list_item ORDER BY list_key, sort_order, id`
  );
  for (const r of rows) {
    if ((LIST_KEYS as readonly string[]).includes(r.list_key)) {
      lists[r.list_key as keyof Lists].push(r.value);
    }
  }
  return lists;
};

/** The checks to run for a leg of this department type: send when it leaves CLS, receive when it returns. */
export const checklistFor = async (
  departmentType: string,
  kind: 'sent' | 'received'
): Promise<string[]> => {
  const types = await loadDeptTypes();
  const found = types.find((t) => t.code === departmentType);
  return found ? (kind === 'sent' ? found.send : found.receive) : [];
};

export interface TemplateLegView {
  seq: number;
  /** Null for a stop that is a department type (the embassy of the destination). */
  departmentId: number | null;
  deptType: string | null;
  code: string | null;
  name: string | null;
  shortName: string | null;
  type: string | null;
  active: boolean;
}

export interface TemplateView {
  id: number;
  destination: string | null;
  destGroup: DestGroup;
  docKind: DocKind;
  docLabel: string | null;
  pathway: Pathway;
  usualDays: number;
  active: boolean;
  legs: TemplateLegView[];
}

export const loadTemplates = async (): Promise<TemplateView[]> => {
  const [templates, legs] = await Promise.all([
    sql<{
      id: number;
      destination: string | null;
      dest_group: string;
      doc_kind: string;
      doc_label: string | null;
      pathway: string;
      usual_days: number;
      is_active: number;
    }>(`SELECT * FROM tbl_ops_route_template ORDER BY is_active DESC, destination, id`),
    sql<{
      template_id: number;
      seq: number;
      department_id: number | null;
      dept_type: string | null;
      code: string | null;
      name: string | null;
      short_name: string | null;
      type: string | null;
      is_active: number | null;
    }>(
      `SELECT l.template_id, l.seq, l.department_id, l.dept_type, d.code, d.name, d.short_name, d.type, d.is_active
         FROM tbl_ops_route_template_leg l
         LEFT JOIN tbl_ops_department d ON d.id = l.department_id
        ORDER BY l.template_id, l.seq`
    ),
  ]);

  return templates.map((t) => ({
    id: t.id,
    destination: t.destination,
    destGroup: t.dest_group as DestGroup,
    docKind: t.doc_kind as DocKind,
    docLabel: t.doc_label,
    pathway: t.pathway as Pathway,
    usualDays: t.usual_days,
    active: t.is_active === 1,
    legs: legs
      .filter((l) => l.template_id === t.id)
      .map((l) => ({
        seq: l.seq,
        departmentId: l.department_id,
        deptType: l.dept_type,
        code: l.code,
        name: l.name,
        shortName: l.short_name,
        type: l.type,
        active: l.is_active === 1,
      })),
  }));
};

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface StaffRef {
  id: number;
  name: string;
}

export interface LegView {
  id: number;
  seq: number;
  departmentId: number;
  department: string;
  departmentName: string;
  departmentType: string;
  service: string | null;
  price: number;
  responsibleId: number | null;
  responsible: string | null;
  status: 'todo' | 'out' | 'done';
  sentAt: string | null;
  sentBy: string | null;
  sentException: string | null;
  sentRef: string | null;
  receivedAt: string | null;
  receivedBy: string | null;
  receivedException: string | null;
  tatDays: number;
}

export interface DocView {
  id: number;
  type: string;
  qty: number;
  file: string | null;
  verification: 'pending' | 'ok' | 'issue';
  ticks: Record<string, boolean>;
  verifiedAt: string | null;
  verifiedBy: string | null;
  /** True when staff decided this document does not need legalising. Legs already back stay as history. */
  skipped: boolean;
  legs: LegView[];
  currentLeg: number;
}

export interface PendingView {
  id: number;
  docId: number | null;
  text: string;
  owner: string;
  who: string | null;
  raisedAt: string | null;
  raisedBy: string | null;
  dueAt: string | null;
  reminders: number;
  resolved: boolean;
}

export interface NextAction {
  text: string;
  act:
    | 'claim'
    | 'verify'
    | 'resolve'
    | 'waiting'
    | 'route'
    | 'send'
    | 'receive'
    | 'view'
    | 'return'
    | 'open';
  button: string;
  waiting: boolean;
  departmentId?: number;
  itemId?: number;
}

export interface ReturnAddressView {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  countryId: number | null;
  country: string | null;
}

export interface OrderOps {
  id: number;
  client: string;
  company: string | null;
  email: string | null;
  destination: string | null;
  destinationCode: string | null;
  documentType: 'commercial' | 'personal' | null;
  receivedAt: string | null;
  assigneeId: number | null;
  assignee: string | null;
  claimedAt: string | null;
  payment: 'paid' | 'unpaid';
  addressConfirmed: boolean;
  returnMethod: 'collect' | 'courier' | null;
  returnedAt: string | null;
  /** Where the documents go back to, when CLS delivers. Null when none is on file. */
  returnAddress: ReturnAddressView | null;
  stage: OpsStage;
  stageLabel: string;
  sla: (SlaClock & { dueAtIso: string }) | null;
  next: NextAction;
  docs: DocView[];
  items: PendingView[];
}

const ms = (value: unknown): number | null => {
  const iso = toIso(value);
  return iso ? Date.parse(iso) : null;
};

const NAME_OF = (
  staff: Map<number, string>,
  id: number | null | undefined
): string | null => (id ? (staff.get(id) ?? null) : null);

export const loadStaff = async (): Promise<{
  names: Map<number, string>;
  assignable: StaffRef[];
}> => {
  const rows = await sql<{
    id: number;
    fname: string | null;
    lname: string | null;
    s_enabled: number | null;
    s_driver: number | null;
  }>(`SELECT id, fname, lname, s_enabled, s_driver FROM tbl_user_admin`);

  const names = new Map<number, string>();
  const assignable: StaffRef[] = [];

  for (const r of rows) {
    const name =
      `${clean(r.fname) ?? ''} ${clean(r.lname) ?? ''}`.trim() || `Staff ${r.id}`;
    names.set(r.id, name);
    if (r.s_enabled === 1 && r.s_driver !== 1) assignable.push({ id: r.id, name });
  }

  assignable.sort((a, b) => a.name.localeCompare(b.name));
  return { names, assignable };
};

// ---------------------------------------------------------------------------
// The snapshot
// ---------------------------------------------------------------------------

interface OrderRow {
  id: number;
  fn: string | null;
  ln: string | null;
  email: string | null;
  assignee: number | null;
  submitted: string | null;
  pay: number | null;
  addr_ok: number | null;
  dest: string | null;
  dest_code: string | null;
  dtype: number | null;
  closed_a: string | null;
  closed_b: string | null;
  company: string | null;
}

export interface SnapshotOptions {
  /** Restrict to these orders (any order type; non-legalisation ids are ignored). */
  ids?: number[];
  /** Include orders already returned to the client. Default: open orders only. */
  includeClosed?: boolean;
  /** When including closed orders, how many of the most recent. */
  closedLimit?: number;
  /**
   * Only orders a consultant has claimed in the Ops flow, that is, those with a
   * `tbl_ops_order_state` row. Orders worked entirely in the old system never get
   * one, so this keeps them out.
   */
  claimedOnly?: boolean;
  limit?: number;
}

const idsClause = (ids: number[] | undefined): string =>
  ids ? (ids.length ? 'AND o.id IN (:ids)' : 'AND 1 = 0') : '';

const claimedClause = (claimedOnly: boolean | undefined): string =>
  claimedOnly
    ? 'AND o.id IN (SELECT s.order_id FROM tbl_ops_order_state s WHERE s.claimed_by IS NOT NULL)'
    : '';

/**
 * Document legalisation orders that have been placed, with their Ops state.
 *
 * "Placed" means `date_submitted` is set — the same line the legacy dashboard
 * draws between an order in the client's hands and one CLS has to work.
 */
export const loadOrders = async (opts: SnapshotOptions = {}): Promise<OrderOps[]> => {
  const [sla, staff, checkDefs] = await Promise.all([
    readSla(),
    loadStaff(),
    loadChecks(),
  ]);
  const checkKeys = checkDefs.filter((c) => c.active).map((c) => c.code);

  const base = `
    SELECT o.id, o.contact_first_name AS fn, o.contact_last_name AS ln, o.contact_email AS email,
           o.visa_cls_team_member AS assignee, o.date_submitted AS submitted,
           o.payment_status AS pay, o.is_address_confirmed AS addr_ok,
           c.country_name AS dest, c.country_code AS dest_code,
           d.type_of_document AS dtype, d.closed_a AS closed_a,
           (SELECT x.visa_date_order_on_route_and_closed FROM tbl_cls_order_destinations x
             WHERE x.order_id = o.id ORDER BY x.id LIMIT 1) AS closed_b,
           (SELECT r.company FROM tbl_order_return_document_details r
             WHERE r.order_id = o.id ORDER BY r.id LIMIT 1) AS company
      FROM tbl_cls_order o
      LEFT JOIN tbl_countries c ON c.id = o.destination
      LEFT JOIN (SELECT order_id, MAX(type_of_document) AS type_of_document,
                        MAX(date_order_on_route_and_closed) AS closed_a
                   FROM tbl_document_legalization_order_details GROUP BY order_id) d
             ON d.order_id = o.id
     WHERE o.order_type = 9 AND o.date_submitted IS NOT NULL ${idsClause(opts.ids)} ${claimedClause(opts.claimedOnly)}`;

  const raw = await sql<OrderRow>(`${base} ORDER BY o.id DESC LIMIT :cap`, {
    ids: opts.ids ?? [],
    cap: Math.min(opts.limit ?? 1500, 3000),
  });

  if (raw.length === 0) return [];
  const orderIds = raw.map((r) => r.id);

  const [docs, checks, legs, items, states, skips, addresses] = await Promise.all([
    sql<{
      id: number;
      order_no: number;
      type: string | null;
      number: number | null;
      doc_file: string | null;
    }>(
      `SELECT id, order_no, type, number, doc_file FROM tbl_order_dl_checklist
        WHERE order_no IN (:ids) ORDER BY id`,
      { ids: orderIds }
    ),
    sql<{
      doc_id: number;
      status: string;
      ticks: string | null;
      verified_by: number | null;
      verified_at: string | null;
    }>(
      `SELECT doc_id, status, ticks, verified_by, verified_at FROM tbl_ops_doc_check
        WHERE order_id IN (:ids)`,
      { ids: orderIds }
    ),
    sql<{
      id: number;
      order_id: number;
      doc_id: number;
      seq: number;
      department_id: number;
      service_label: string | null;
      price: string;
      responsible_id: number | null;
      status: string;
      sent_at: string | null;
      sent_by: number | null;
      sent_exception: string | null;
      sent_ref: string | null;
      received_at: string | null;
      received_by: number | null;
      received_exception: string | null;
      code: string;
      dname: string;
      dshort: string;
      dtype: string;
      tat_days: number;
    }>(
      `SELECT l.id, l.order_id, l.doc_id, l.seq, l.department_id, l.service_label, l.price,
              l.responsible_id, l.status, l.sent_at, l.sent_by, l.sent_exception, l.sent_ref,
              l.received_at, l.received_by, l.received_exception,
              d.code, d.name AS dname, d.short_name AS dshort, d.type AS dtype, d.tat_days
         FROM tbl_ops_doc_leg l JOIN tbl_ops_department d ON d.id = l.department_id
        WHERE l.order_id IN (:ids) ORDER BY l.doc_id, l.seq, l.id`,
      { ids: orderIds }
    ),
    sql<{
      id: number;
      order_id: number;
      doc_id: number | null;
      text: string;
      owner: string;
      who: string | null;
      raised_by: number | null;
      raised_at: string | null;
      due_at: string | null;
      reminders: number;
      resolved_at: string | null;
    }>(
      `SELECT id, order_id, doc_id, text, owner, who, raised_by, raised_at, due_at, reminders, resolved_at
         FROM tbl_ops_pending_item WHERE order_id IN (:ids) ORDER BY id`,
      { ids: orderIds }
    ),
    sql<{
      order_id: number;
      claimed_by: number | null;
      claimed_at: string | null;
      return_method: string | null;
      returned_at: string | null;
    }>(
      `SELECT order_id, claimed_by, claimed_at, return_method, returned_at
         FROM tbl_ops_order_state WHERE order_id IN (:ids)`,
      { ids: orderIds }
    ),
    skipsAvailable().then((on) =>
      on
        ? sql<{ doc_id: number }>(
            `SELECT doc_id FROM tbl_ops_doc_skip WHERE order_id IN (:ids)`,
            { ids: orderIds }
          )
        : []
    ),
    sql<{
      order_id: number;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      contact_number: string | null;
      company: string | null;
      address: string | null;
      city: string | null;
      state: string | null;
      postcode: string | null;
      country_id: number | null;
      country_name: string | null;
    }>(
      `SELECT r.order_id, r.first_name, r.last_name, r.email, r.contact_number, r.company,
              r.address, r.city, r.state, r.postcode, r.country_id, c.country_name
         FROM tbl_order_return_document_details r
         LEFT JOIN tbl_countries c ON c.id = r.country_id
        WHERE r.order_id IN (:ids) ORDER BY r.id`,
      { ids: orderIds }
    ),
  ]);

  const skipped = new Set(skips.map((k) => k.doc_id));
  const addressByOrder = new Map<number, ReturnAddressView>();
  for (const a of addresses) {
    if (addressByOrder.has(a.order_id)) continue;
    addressByOrder.set(a.order_id, {
      firstName: clean(a.first_name),
      lastName: clean(a.last_name),
      email: clean(a.email),
      phone: clean(a.contact_number),
      company: clean(a.company),
      address: clean(a.address),
      city: clean(a.city),
      state: clean(a.state),
      postcode: clean(a.postcode),
      countryId: a.country_id,
      country: clean(a.country_name),
    });
  }
  const checkByDoc = new Map(checks.map((c) => [c.doc_id, c]));
  const stateByOrder = new Map(states.map((s) => [s.order_id, s]));
  const legsByDoc = new Map<number, LegView[]>();
  const lastStageEvent = new Map<number, number>();

  for (const l of legs) {
    const view: LegView = {
      id: l.id,
      seq: l.seq,
      departmentId: l.department_id,
      department: l.dshort,
      departmentName: l.dname,
      departmentType: l.dtype,
      service: clean(l.service_label),
      price: Number(l.price),
      responsibleId: l.responsible_id,
      responsible: NAME_OF(staff.names, l.responsible_id),
      status: l.status === 'done' ? 'done' : l.status === 'out' ? 'out' : 'todo',
      sentAt: toIso(l.sent_at),
      sentBy: NAME_OF(staff.names, l.sent_by),
      sentException: clean(l.sent_exception),
      sentRef: clean(l.sent_ref),
      receivedAt: toIso(l.received_at),
      receivedBy: NAME_OF(staff.names, l.received_by),
      receivedException: clean(l.received_exception),
      tatDays: l.tat_days,
    };
    const list = legsByDoc.get(l.doc_id) ?? [];
    list.push(view);
    legsByDoc.set(l.doc_id, list);

    const stamp = Math.max(ms(l.received_at) ?? 0, ms(l.sent_at) ?? 0);
    if (stamp)
      lastStageEvent.set(
        l.order_id,
        Math.max(lastStageEvent.get(l.order_id) ?? 0, stamp)
      );
  }

  const docsByOrder = new Map<number, DocView[]>();
  for (const d of docs) {
    const check = checkByDoc.get(d.id);
    let ticks: Record<string, boolean> = {};
    try {
      ticks = check?.ticks ? (JSON.parse(check.ticks) as Record<string, boolean>) : ticks;
    } catch {
      ticks = {};
    }
    for (const key of checkKeys) ticks[key] = Boolean(ticks[key]);

    const docLegs = legsByDoc.get(d.id) ?? [];
    const cur = docLegs.findIndex((l) => l.status !== 'done');

    const view: DocView = {
      id: d.id,
      type: clean(d.type) ?? 'Document',
      qty: d.number && d.number > 0 ? d.number : 1,
      file: clean(d.doc_file),
      verification:
        check?.status === 'ok' ? 'ok' : check?.status === 'issue' ? 'issue' : 'pending',
      ticks,
      verifiedAt: toIso(check?.verified_at),
      verifiedBy: NAME_OF(staff.names, check?.verified_by),
      skipped: skipped.has(d.id),
      legs: docLegs,
      currentLeg: skipped.has(d.id) ? -1 : cur,
    };
    const list = docsByOrder.get(d.order_no) ?? [];
    list.push(view);
    docsByOrder.set(d.order_no, list);
  }

  const itemsByOrder = new Map<number, PendingView[]>();
  for (const i of items) {
    const list = itemsByOrder.get(i.order_id) ?? [];
    list.push({
      id: i.id,
      docId: i.doc_id,
      text: i.text,
      owner: i.owner,
      who: clean(i.who),
      raisedAt: toIso(i.raised_at),
      raisedBy: NAME_OF(staff.names, i.raised_by),
      dueAt: toIso(i.due_at),
      reminders: i.reminders,
      resolved: Boolean(i.resolved_at),
    });
    itemsByOrder.set(i.order_id, list);
  }

  const now = Date.now();
  const out: OrderOps[] = [];

  for (const r of raw) {
    const state = stateByOrder.get(r.id);
    const returnedAt = toIso(state?.returned_at);
    const closedMs = ms(r.closed_a) ?? ms(r.closed_b);
    const closed = Boolean(returnedAt) || closedMs !== null;

    if (closed && !opts.includeClosed) continue;

    const orderDocs = docsByOrder.get(r.id) ?? [];
    const orderItems = itemsByOrder.get(r.id) ?? [];
    const openItems = orderItems.filter((i) => !i.resolved);

    const stage = deriveStage({
      closed,
      assigned: r.assignee !== null && r.assignee !== 0,
      docs: orderDocs.map((d) => ({
        verification: d.verification,
        skipped: d.skipped,
        legs: d.legs,
      })),
      openItems: openItems.length,
    });

    const receivedAt = ms(r.submitted) ?? now;
    const nextChase = openItems
      .map((i) => (i.dueAt ? Date.parse(i.dueAt) : null))
      .filter((x): x is number => x !== null);

    const clock = slaFor(
      {
        stage,
        receivedAt,
        stageSince: lastStageEvent.get(r.id) ?? ms(state?.claimed_at) ?? null,
        nextChaseAt: nextChase.length ? Math.min(...nextChase) : null,
        now,
      },
      sla
    );

    const returnMethod =
      state?.return_method === 'collect' || state?.return_method === 'courier'
        ? state.return_method
        : null;

    const order: OrderOps = {
      id: r.id,
      client: `${clean(r.fn) ?? ''} ${clean(r.ln) ?? ''}`.trim() || `Order ${r.id}`,
      company: clean(r.company),
      email: clean(r.email),
      destination: clean(r.dest),
      destinationCode: clean(r.dest_code),
      documentType: r.dtype === 1 ? 'commercial' : r.dtype === 2 ? 'personal' : null,
      receivedAt: toIso(r.submitted),
      assigneeId: r.assignee || null,
      assignee: NAME_OF(staff.names, r.assignee),
      claimedAt: toIso(state?.claimed_at),
      payment: r.pay === 1 ? 'paid' : 'unpaid',
      addressConfirmed: r.addr_ok === 1,
      returnMethod,
      returnedAt,
      returnAddress: addressByOrder.get(r.id) ?? null,
      stage,
      stageLabel: STAGE_LABEL[stage],
      sla: clock ? { ...clock, dueAtIso: new Date(clock.dueAt).toISOString() } : null,
      next: { text: '', act: 'view', button: 'Open', waiting: true },
      docs: orderDocs,
      items: orderItems,
    };
    order.next = nextActionOf(order, staff.names);
    out.push(order);
  }

  if (opts.includeClosed && opts.closedLimit !== undefined) {
    const open = out.filter((o) => o.stage !== 'done');
    const closedOnes = out.filter((o) => o.stage === 'done').slice(0, opts.closedLimit);
    return [...open, ...closedOnes];
  }

  return out;
};

// ---------------------------------------------------------------------------
// Next action
// ---------------------------------------------------------------------------

export const currentLegsOf = (order: OrderOps): { doc: DocView; leg: LegView }[] =>
  order.docs.flatMap((doc) => {
    const leg = doc.legs[doc.currentLeg];
    return leg ? [{ doc, leg }] : [];
  });

/** The single next thing a consultant should do on an order. */
export const nextActionOf = (
  order: OrderOps,
  _names?: Map<number, string>
): NextAction => {
  const plural = (k: number): string => (k === 1 ? '' : 's');

  switch (order.stage) {
    case 'new':
      return {
        text: 'Claim and start verification',
        act: 'claim',
        button: 'Claim',
        waiting: false,
      };

    case 'verify': {
      const k = order.docs.filter((d) => d.verification === 'pending').length;
      return k > 0
        ? {
            text: `Verify ${k} document${plural(k)}`,
            act: 'verify',
            button: 'Verify',
            waiting: false,
          }
        : {
            text: 'No documents on this order yet — add one',
            act: 'open',
            button: 'Open',
            waiting: false,
          };
    }

    case 'pending': {
      const open = order.items
        .filter((i) => !i.resolved)
        .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))[0];

      if (!open)
        return {
          text: 'Resolve the document issue',
          act: 'open',
          button: 'Open',
          waiting: false,
        };

      if (open.owner === 'client') {
        return {
          text: `Waiting on client: ${open.text}`,
          act: 'waiting',
          button: 'View item',
          waiting: true,
          itemId: open.id,
        };
      }
      if (open.owner === 'third' || open.owner === 'dept') {
        return {
          text: `Waiting on ${open.who ?? (open.owner === 'dept' ? 'the department' : 'a third party')}: ${open.text}`,
          act: 'waiting',
          button: 'View item',
          waiting: true,
          itemId: open.id,
        };
      }
      return {
        text: open.text,
        act: 'resolve',
        button: 'Resolve',
        waiting: false,
        itemId: open.id,
      };
    }

    case 'route': {
      const k = order.docs.filter((d) => !d.skipped && d.legs.length === 0).length;
      return {
        text: `Plan the route for ${k} document${plural(k)}`,
        act: 'route',
        button: 'Apply suggested',
        waiting: false,
      };
    }

    case 'process': {
      const cur = currentLegsOf(order);
      const toSend = cur.filter((c) => c.leg.status === 'todo');
      if (toSend.length) {
        const first = toSend[0]!.leg;
        const k = toSend.filter((c) => c.leg.departmentId === first.departmentId).length;
        return {
          text: `Send ${k} doc${plural(k)} to ${first.department}`,
          act: 'send',
          button: 'Mark sent',
          waiting: false,
          departmentId: first.departmentId,
        };
      }
      const out = cur[0]!;
      const since = out.leg.sentAt
        ? new Date(out.leg.sentAt).toLocaleDateString('en-AU')
        : 'recently';
      return {
        text: `At ${out.leg.department} since ${since}. Receive when it's back`,
        act: 'receive',
        button: 'Mark received',
        waiting: true,
        departmentId: out.leg.departmentId,
      };
    }

    case 'ready':
      return order.returnMethod === 'collect' || !order.returnMethod
        ? {
            text: 'Ready to return: hand over or dispatch',
            act: 'return',
            button: 'Return',
            waiting: false,
          }
        : {
            text: 'Ready to return: dispatch to the client',
            act: 'return',
            button: 'Dispatch',
            waiting: false,
          };

    default:
      return { text: 'Completed', act: 'view', button: 'View', waiting: true };
  }
};

export const loadOrder = async (id: number): Promise<OrderOps | null> => {
  const [order] = await loadOrders({ ids: [id], includeClosed: true });
  return order ?? null;
};
