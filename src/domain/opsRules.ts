/**
 * CLS Ops, Phase 1: the rules that are not data.
 *
 * Deliberately plain TypeScript with no database access, so it can be tested
 * without one and ported to the NZ backend as a straight copy.
 *
 * What is NOT here is just as deliberate: the verification checks, the department
 * types and their send/receive checklists, the Hague and Arab country lists, the
 * words that mark a civil or police document, and the route templates are all
 * business configuration. They live in `tbl_ops_*` tables, are seeded once by the
 * migration, and are edited from Routes, SLA & automation. This file only knows
 * how to read them.
 */

export const DOC_KINDS = ['any', 'commercial', 'personal', 'civil', 'police'] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export const DEST_GROUPS = ['any', 'hague', 'non_hague', 'arab'] as const;
export type DestGroup = (typeof DEST_GROUPS)[number];

export const PATHWAYS = ['apostille', 'embassy'] as const;
export type Pathway = (typeof PATHWAYS)[number];

/** The plain lists the routing rules read. */
export const LIST_KEYS = ['hague', 'arab', 'civil_doc', 'police_doc'] as const;
export type ListKey = (typeof LIST_KEYS)[number];
export type Lists = Record<ListKey, string[]>;

export const norm = (name: string | null | undefined): string =>
  (name ?? '')
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Whether a country is on a list of country names (case and punctuation ignored). */
export const inCountryList = (
  list: readonly string[],
  country: string | null | undefined
): boolean => {
  const wanted = norm(country);
  return wanted !== '' && list.some((c) => norm(c) === wanted);
};

const hasWord = (words: readonly string[], text: string): boolean => {
  const hay = text.toLowerCase();
  return words.some((w) => w.trim() !== '' && hay.includes(w.trim().toLowerCase()));
};

/**
 * What kind of document this is, for matching a template: commercial when the
 * order says so, otherwise police or civil when its name holds one of the listed
 * words, otherwise personal.
 */
export const kindOfDoc = (
  documentType: number | null,
  docType: string,
  lists: Pick<Lists, 'civil_doc' | 'police_doc'>
): Exclude<DocKind, 'any'> => {
  if (documentType === 1) return 'commercial';
  if (hasWord(lists.police_doc, docType)) return 'police';
  if (hasWord(lists.civil_doc, docType)) return 'civil';
  return 'personal';
};

/** A short, stable code from a label: "Seal & stamp!" becomes "seal_stamp". */
export const slugCode = (label: string, max = 24): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max) || 'item';

/** A code not already taken: seal, seal_2, seal_3 ... */
export const uniqueCode = (
  label: string,
  taken: ReadonlySet<string>,
  max = 24
): string => {
  const base = slugCode(label, max - 3);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const next = `${base}_${n}`;
    if (!taken.has(next)) return next;
  }
};

export interface RouteInput {
  destination: string | null;
  /** 1 = commercial, 2 = personal, as `tbl_document_legalization_order_details`. */
  documentType: number | null;
  docType: string;
}

/** The label a leg carries, from where it goes and which pathway the template is on. */
export const serviceFor = (type: string | null, pathway: Pathway): string => {
  switch (type) {
    case 'notary':
      return 'Notarise';
    case 'chamber':
      return 'Certify';
    case 'govt':
      return pathway === 'apostille' ? 'Apostille' : 'Authentication';
    case 'embassy':
      return 'Legalisation';
    case 'police':
      return 'Police check';
    case 'translation':
      return 'Translate';
    default:
      return 'Process';
  }
};

export interface TemplateMatch {
  id: number;
  /** Null: any destination. */
  destination: string | null;
  destGroup: DestGroup;
  docKind: DocKind;
  /** Null: any document. */
  docLabel: string | null;
  active: boolean;
}

/**
 * The template that applies to a document, or null (then the order gets no
 * suggested route and staff add the legs by hand).
 *
 * A template must agree on every field it names. The most specific wins: a named
 * destination, then a named document, then a country group (the Arab list beats
 * the Hague lists, being the narrower), then a kind of document. Ties go to the
 * older template, so the result never depends on row order.
 */
export const matchTemplate = <T extends TemplateMatch>(
  templates: readonly T[],
  input: RouteInput,
  lists: Lists
): T | null => {
  const kind = kindOfDoc(input.documentType, input.docType, lists);
  const dest = norm(input.destination);
  const label = input.docType.trim().toLowerCase();
  const hague = inCountryList(lists.hague, input.destination);
  const arab = inCountryList(lists.arab, input.destination);
  let best: { t: T; score: number } | null = null;

  for (const t of templates) {
    if (!t.active) continue;
    if (t.destination !== null && norm(t.destination) !== dest) continue;
    if (t.docLabel !== null && t.docLabel.trim().toLowerCase() !== label) continue;
    if (t.docKind !== 'any' && t.docKind !== kind) continue;
    if (t.destGroup === 'hague' && !hague) continue;
    if (t.destGroup === 'non_hague' && hague) continue;
    if (t.destGroup === 'arab' && !arab) continue;

    const score =
      (t.destination !== null ? 32 : 0) +
      (t.docLabel !== null ? 16 : 0) +
      (t.destGroup === 'arab' ? 6 : t.destGroup !== 'any' ? 4 : 0) +
      (t.docKind !== 'any' ? 1 : 0);

    if (!best || score > best.score || (score === best.score && t.id < best.t.id)) {
      best = { t, score };
    }
  }

  return best ? best.t : null;
};

// ---------------------------------------------------------------------------
// Stages, SLA and the next action
// ---------------------------------------------------------------------------

export type OpsStage =
  'new' | 'verify' | 'pending' | 'route' | 'process' | 'ready' | 'done';

export const STAGE_LABEL: Record<OpsStage, string> = {
  new: 'New',
  verify: 'Verification',
  pending: 'Pending items',
  route: 'Route planning',
  process: 'In process',
  ready: 'Ready to return',
  done: 'Completed',
};

export interface SlaSettings {
  claimH: number;
  verifyH: number;
  chaseH: number;
  routeH: number;
  readyH: number;
}

export const DEFAULT_SLA: SlaSettings = {
  claimH: 1.5,
  verifyH: 24,
  chaseH: 48,
  routeH: 4,
  readyH: 24,
};

export interface StageInput {
  closed: boolean;
  assigned: boolean;
  docs: {
    verification: 'pending' | 'ok' | 'issue';
    legs: { status: 'todo' | 'out' | 'done' }[];
  }[];
  openItems: number;
}

/**
 * The stage is derived, never stored. `tbl_cls_order.status` has three values and
 * the legacy admin reads it, so Phase 1 reads the order's documents instead.
 */
export const deriveStage = (input: StageInput): OpsStage => {
  if (input.closed) return 'done';
  if (!input.assigned) return 'new';
  if (input.docs.length === 0) return 'verify';
  if (input.docs.some((d) => d.verification === 'pending')) return 'verify';
  if (input.openItems > 0 || input.docs.some((d) => d.verification === 'issue'))
    return 'pending';
  if (input.docs.some((d) => d.legs.length === 0)) return 'route';
  if (input.docs.some((d) => d.legs.some((l) => l.status !== 'done'))) return 'process';
  return 'ready';
};

export type SlaState = 'ok' | 'risk' | 'breach';

export interface SlaClock {
  label: string;
  dueAt: number;
  leftMs: number;
  state: SlaState;
}

const HOUR = 3_600_000;

/** Within a quarter of the window (and at most an hour) of the deadline is "at risk". */
export const slaState = (leftMs: number, windowMs: number): SlaState =>
  leftMs < 0 ? 'breach' : leftMs < Math.max(HOUR, windowMs * 0.25) ? 'risk' : 'ok';

export interface SlaInput {
  stage: OpsStage;
  /** All instants in epoch milliseconds. */
  receivedAt: number;
  stageSince: number | null;
  nextChaseAt: number | null;
  now: number;
}

export const slaFor = (input: SlaInput, sla: SlaSettings): SlaClock | null => {
  const { stage, receivedAt, stageSince, nextChaseAt, now } = input;
  const since = stageSince ?? receivedAt;
  let dueAt: number;
  let windowMs: number;
  let label: string;

  switch (stage) {
    case 'done':
      return null;
    case 'new':
      windowMs = sla.claimH * HOUR;
      dueAt = receivedAt + windowMs;
      label = 'Claim by';
      break;
    case 'verify':
      windowMs = sla.verifyH * HOUR;
      dueAt = receivedAt + windowMs;
      label = 'Verify by';
      break;
    case 'pending':
      windowMs = sla.chaseH * HOUR;
      dueAt = nextChaseAt ?? since + windowMs;
      label = 'Chase by';
      break;
    case 'route':
      windowMs = sla.routeH * HOUR;
      dueAt = since + windowMs;
      label = 'Route by';
      break;
    case 'process':
      // The promised date lives on the order and is not modelled in Phase 1, so
      // process has no clock of its own; per-leg turnaround is shown instead.
      return null;
    default:
      windowMs = sla.readyH * HOUR;
      dueAt = since + windowMs;
      label = 'Hand over by';
  }

  const leftMs = dueAt - now;
  return { label, dueAt, leftMs, state: slaState(leftMs, windowMs) };
};
