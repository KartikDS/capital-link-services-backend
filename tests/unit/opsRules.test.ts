import {
  DEFAULT_SLA,
  deriveStage,
  inCountryList,
  kindOfDoc,
  matchTemplate,
  serviceFor,
  slaFor,
  slaState,
  slugCode,
  uniqueCode,
  type Lists,
  type TemplateMatch,
} from '../../src/domain/opsRules';

const HOUR = 3_600_000;

const lists: Lists = {
  hague: ['Italy', 'Spain', 'Saudi Arabia'],
  arab: ['Qatar', 'Kuwait', 'Saudi Arabia'],
  civil_doc: ['Birth', 'Marriage', 'Change of Name'],
  police_doc: ['Police'],
};

describe('country lists', () => {
  it('matches case-insensitively and ignores punctuation', () => {
    expect(inCountryList(lists.hague, 'italy')).toBe(true);
    expect(inCountryList(lists.hague, ' ITALY. ')).toBe(true);
    expect(inCountryList(lists.hague, 'Qatar')).toBe(false);
    expect(inCountryList(lists.hague, null)).toBe(false);
    expect(inCountryList([], 'Italy')).toBe(false);
  });
});

describe('codes', () => {
  it('makes a short stable code from a label', () => {
    expect(slugCode('Seal & stamp!')).toBe('seal_stamp');
    expect(slugCode('!!!')).toBe('item');
  });

  it('never repeats a code that is taken', () => {
    expect(uniqueCode('Seal', new Set(['seal']))).toBe('seal_2');
    expect(uniqueCode('Seal', new Set(['seal', 'seal_2']))).toBe('seal_3');
    expect(uniqueCode('Seal', new Set())).toBe('seal');
  });
});

describe('deriveStage', () => {
  const doc = (
    verification: 'pending' | 'ok' | 'issue',
    legs: ('todo' | 'out' | 'done')[] = []
  ) => ({
    verification,
    legs: legs.map((status) => ({ status })),
  });

  it('walks an order through every stage', () => {
    expect(deriveStage({ closed: false, assigned: false, docs: [], openItems: 0 })).toBe(
      'new'
    );
    expect(
      deriveStage({ closed: false, assigned: true, docs: [doc('pending')], openItems: 0 })
    ).toBe('verify');
    expect(
      deriveStage({ closed: false, assigned: true, docs: [doc('ok')], openItems: 1 })
    ).toBe('pending');
    expect(
      deriveStage({ closed: false, assigned: true, docs: [doc('ok')], openItems: 0 })
    ).toBe('route');
    expect(
      deriveStage({
        closed: false,
        assigned: true,
        docs: [doc('ok', ['done', 'out'])],
        openItems: 0,
      })
    ).toBe('process');
    expect(
      deriveStage({
        closed: false,
        assigned: true,
        docs: [doc('ok', ['done', 'done'])],
        openItems: 0,
      })
    ).toBe('ready');
    expect(
      deriveStage({
        closed: true,
        assigned: true,
        docs: [doc('ok', ['done'])],
        openItems: 0,
      })
    ).toBe('done');
  });

  it('keeps an order with no documents in verification rather than ready', () => {
    expect(deriveStage({ closed: false, assigned: true, docs: [], openItems: 0 })).toBe(
      'verify'
    );
  });
});

describe('slaFor', () => {
  const base = { receivedAt: 0, stageSince: null, nextChaseAt: null };

  it('gives a new order 90 minutes to be claimed', () => {
    const clock = slaFor({ ...base, stage: 'new', now: 40 * 60_000 }, DEFAULT_SLA);
    expect(clock?.label).toBe('Claim by');
    expect(clock?.dueAt).toBe(1.5 * HOUR);
    expect(clock?.state).toBe('risk');
  });

  it('flags a breach once the deadline passes', () => {
    expect(slaFor({ ...base, stage: 'new', now: 2 * HOUR }, DEFAULT_SLA)?.state).toBe(
      'breach'
    );
  });

  it('has no clock once completed, or while a document is out (turnaround is per leg)', () => {
    expect(slaFor({ ...base, stage: 'done', now: 0 }, DEFAULT_SLA)).toBeNull();
    expect(slaFor({ ...base, stage: 'process', now: 0 }, DEFAULT_SLA)).toBeNull();
  });

  it('treats the last quarter of the window, or the last hour, as at risk', () => {
    expect(slaState(30 * 60_000, 24 * HOUR)).toBe('risk');
    expect(slaState(10 * HOUR, 24 * HOUR)).toBe('ok');
    expect(slaState(-1, 24 * HOUR)).toBe('breach');
  });
});

describe('route templates', () => {
  const t = (over: Partial<TemplateMatch> & { id: number }): TemplateMatch => ({
    destination: null,
    destGroup: 'any',
    docKind: 'any',
    docLabel: null,
    active: true,
    ...over,
  });
  const input = { destination: 'Qatar', documentType: 2, docType: 'Degree Certificate' };

  it('classifies a document by who it is for and what it is called', () => {
    expect(kindOfDoc(1, 'Invoice', lists)).toBe('commercial');
    expect(kindOfDoc(2, 'Police Clearance (AFP)', lists)).toBe('police');
    expect(kindOfDoc(2, 'Birth Certificate', lists)).toBe('civil');
    expect(kindOfDoc(null, 'Degree Certificate', lists)).toBe('personal');
    // Commercial wins over a civil-sounding name.
    expect(kindOfDoc(1, 'Birth announcement', lists)).toBe('commercial');
  });

  it('uses the words on the lists, so editing a list changes the kind', () => {
    expect(kindOfDoc(2, 'Degree Certificate', { ...lists, civil_doc: ['Degree'] })).toBe(
      'civil'
    );
  });

  it('returns null when nothing matches, so no route is suggested', () => {
    expect(matchTemplate([], input, lists)).toBeNull();
    expect(matchTemplate([t({ id: 1, destination: 'Italy' })], input, lists)).toBeNull();
    expect(matchTemplate([t({ id: 1, docKind: 'commercial' })], input, lists)).toBeNull();
  });

  it('ignores inactive templates', () => {
    expect(matchTemplate([t({ id: 1, active: false })], input, lists)).toBeNull();
  });

  it('applies a country group only to countries on that list', () => {
    const hague = t({ id: 1, destGroup: 'hague' });
    const nonHague = t({ id: 2, destGroup: 'non_hague' });
    const arab = t({ id: 3, destGroup: 'arab' });
    const to = (destination: string) => ({ ...input, destination });

    expect(matchTemplate([hague, nonHague], to('Italy'), lists)?.id).toBe(1);
    expect(matchTemplate([hague, nonHague], to('Qatar'), lists)?.id).toBe(2);
    expect(matchTemplate([hague], to('Qatar'), lists)).toBeNull();
    expect(matchTemplate([arab], to('Italy'), lists)).toBeNull();
    expect(matchTemplate([arab], to('Kuwait'), lists)?.id).toBe(3);
  });

  it('prefers the narrower Arab group over a Hague one when a country is on both', () => {
    const hague = t({ id: 1, destGroup: 'hague' });
    const arab = t({ id: 2, destGroup: 'arab' });
    expect(
      matchTemplate([hague, arab], { ...input, destination: 'Saudi Arabia' }, lists)?.id
    ).toBe(2);
  });

  it('prefers a named destination, then a named document, then a group, then a kind', () => {
    const any = t({ id: 1 });
    const kind = t({ id: 2, docKind: 'personal' });
    const group = t({ id: 3, destGroup: 'non_hague' });
    const label = t({ id: 4, docLabel: 'degree certificate' });
    const dest = t({ id: 5, destination: 'qatar' });
    expect(matchTemplate([any, kind, group, label, dest], input, lists)?.id).toBe(5);
    expect(matchTemplate([any, kind, group, label], input, lists)?.id).toBe(4);
    expect(matchTemplate([any, kind, group], input, lists)?.id).toBe(3);
    expect(matchTemplate([any, kind], input, lists)?.id).toBe(2);
  });

  it('breaks a tie with the older template', () => {
    expect(matchTemplate([t({ id: 9 }), t({ id: 5 })], input, lists)?.id).toBe(5);
  });

  it('labels each stop by where it goes', () => {
    expect(serviceFor('govt', 'apostille')).toBe('Apostille');
    expect(serviceFor('govt', 'embassy')).toBe('Authentication');
    expect(serviceFor('embassy', 'embassy')).toBe('Legalisation');
    expect(serviceFor('notary', 'apostille')).toBe('Notarise');
    expect(serviceFor(null, 'embassy')).toBe('Process');
  });
});
