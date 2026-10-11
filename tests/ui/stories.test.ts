/**
 * P4.2 story cards (SPEC §12.7, §12.9; UX §5.9; D08 §07; BUILD_DIRECTIVE P4.2 "Done when").
 *
 * - No card without evidence: each template is refused without any evidence and without the evidence
 *   kind it needs; the detector never records a card a load would refuse.
 * - Caption resolution: every caption comes from the stored summary plus the dish's names; a species the
 *   dish no longer names falls back to its id; times are m:ss; SPEC's exact sentences.
 * - Pacing: one notification per 600 ticks; a key seen again within the window joins its card; priority
 *   favorite → unseen template → earliest; the cards not chosen enter the notebook quietly.
 * - Spotlight moves only the camera: it never reaches the worker (no command, no request).
 * - Pause and restore (D08 §07; the Field Guide's convention): a story opened from the notice on a
 *   running dish returns to it at its prior speed through Spotlight or the Notebook's Back
 *   (`leaveNotebook`); opened any other way, the speed is left as it is.
 * - Words: "A"/"An" before a species name; a count of a species is plural unless it is one; a family
 *   card lists its game rules in the Lineage sheet's wording and never calls one line "the tradeoff".
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { realizeRecipe } from '../../src/sim/recipes';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { emptyNotebook, notebookProblem, sealNotebook, type NotebookRecord } from '../../src/persistence/notebook';
import {
  addStory,
  STORIES_MAX,
  STORY_TEMPLATES,
  STORY_WINDOW_TICKS,
  storyCardProblem,
  storyEventTick,
  storyToRemove,
  type StoryCard,
  type StoryTemplate,
} from '../../src/persistence/notebookStories';
import { pickStory, StoryDetector, StoryPacer } from '../../src/worker/stories';
import type { NotebookChange } from '../../src/worker/protocol';
import {
  ENZYME_CAPTIONS,
  SPLIT_CAPTION,
  STORY_TEXT,
  storyNoticeText,
  speciesCount,
  storyPanels,
  withArticle,
  type StoryNames,
} from '../../src/ui/strings/stories';
import { LINEAGE_TEXT, ruleLines } from '../../src/ui/strings/lineage';
import { registry } from '../helpers/world';

// state.ts is replaced by a stand-in (the real one starts a Worker): a client call would throw here.
const ui = vi.hoisted(() => ({ zoom: [] as unknown[][], requests: 0, speeds: [] as number[] }));
vi.mock('../../src/ui/state', async () => {
  const { signal } = await import('@preact/signals');
  return {
    dishInfo: signal<unknown>(null),
    route: signal<unknown>({ name: 'notebook', tab: 'stories' }),
    meta: signal<unknown>(null),
    setSpeed: (s: number) => ui.speeds.push(s),
    sheet: signal<string>('none'),
    toast: signal<string | null>(null),
    showToast: () => undefined,
    select: () => undefined,
    autosave: () => Promise.resolve(true),
    onDishSnapshot: () => () => undefined,
    getRenderer: () => ({
      positionOf: () => [10.5, 20.5],
      zoomPreset: (...a: unknown[]) => ui.zoom.push(a),
    }),
    getClient: () => {
      ui.requests++;
      throw new Error('no client in this test');
    },
  };
});

const REG = registry();
const WORLD = 'w-test';
const RULESET = { simulationVersion: 3, evolutionRulesVersion: 1, moduleRegistryVersion: 2, contentHash: 'abc' };

const NAMES: StoryNames = {
  speciesIds: ['B01', 'B06', 'A01'],
  speciesNames: ['Sprinter', 'Crumbsmith', 'Sunbead'],
  materials: [
    { id: 'SUGAR', name: 'Sugar' },
    { id: 'M10', name: 'Sugar pellet' },
  ],
};

const SUMMARIES: Record<StoryTemplate, StoryCard['summary']> = {
  firstSplit: {
    species: 'B01',
    parent: 10,
    daughterA: 81,
    daughterB: 82,
    changedA: 0,
    changedB: 0,
    parentBirthTick: 0,
    splitTick: 350,
    cell: 7090,
    familyRoot: 0,
    recorded: true,
    changes: [],
  },
  enzymeAtWork: {
    enzyme: 'starch',
    second: 24,
    cell: 7871,
    amount: 0.0037,
    dishAmount: 0.21,
    region: 'topLeft',
    producers: ['B06'],
  },
  familyChanged: {
    branch: 0,
    shortId: 'a1',
    name: 'Sprinter · Quick · a1',
    species: 'B01',
    rootBirthId: 400,
    rootCell: 8000,
    candidateTick: 1200,
    establishedTick: 2410,
    members: 6,
    depth: 3,
    parentName: null,
    trait: { kind: 'locus', locus: 0, delta: 8, mean: false },
    descriptor: 'Quick',
    module: null,
    locusValues: { ancestor: 50, branch: 58 },
    locusName: 'Motility investment',
    rules: null,
  },
  placeChanged: {
    seq: 1,
    command: 'deposit',
    commandTick: 300,
    what: 'SUGAR',
    accepted: 32,
    x: 54,
    y: 54,
    region: 'topLeft',
    beforeSecond: 30,
    afterSecond: 90,
    species: 'B01',
    before: 13,
    after: 59,
    changedSpecies: 4,
    others: 2,
  },
};

const EVIDENCE: Record<StoryTemplate, string[]> = {
  firstSplit: ['event:73'],
  enzymeAtWork: ['reaction:starch:24:7871'],
  familyChanged: ['event:900', 'branch:0'],
  placeChanged: ['command:1', 'traits:topLeft:30', 'traits:topLeft:90'],
};

function card(template: StoryTemplate, n: number, over: Partial<StoryCard> = {}): StoryCard {
  return {
    id: `story-${n}`,
    template,
    key: `${template}:k${n}`,
    worldId: WORLD,
    ruleset: RULESET,
    evidence: EVIDENCE[template],
    summary: SUMMARIES[template],
    timeRange: [0, 400],
    imageRefs: [],
    favoriteId: null,
    notified: false,
    seen: false,
    dismissed: false,
    ...over,
  } as StoryCard;
}

afterEach(() => {
  ui.zoom.length = 0;
  ui.requests = 0;
  ui.speeds.length = 0;
});

describe('no card without evidence', () => {
  it('every template is valid with its evidence and refused without any', () => {
    for (const t of STORY_TEMPLATES) {
      expect(storyCardProblem(card(t, 1), WORLD)).toBeNull();
      expect(storyCardProblem(card(t, 1, { evidence: [] }), WORLD)).toBe('a story card has no evidence');
      const { evidence: _e, ...without } = card(t, 1);
      expect(storyCardProblem(without, WORLD)).toBe('a story card has no evidence');
    }
  });

  it('each template is refused without the evidence kind it needs, or with a malformed id', () => {
    expect(storyCardProblem(card('firstSplit', 1, { evidence: ['branch:0'] }), WORLD)).toMatch(/lacks the evidence/);
    expect(storyCardProblem(card('enzymeAtWork', 1, { evidence: ['event:5'] }), WORLD)).toMatch(/lacks the evidence/);
    expect(storyCardProblem(card('familyChanged', 1, { evidence: ['event:900'] }), WORLD)).toMatch(/lacks the evidence/);
    expect(storyCardProblem(card('familyChanged', 1, { evidence: ['branch:0'] }), WORLD)).toMatch(/lacks the evidence/);
    expect(storyCardProblem(card('placeChanged', 1, { evidence: ['command:1'] }), WORLD)).toMatch(/lacks the evidence/);
    expect(storyCardProblem(card('placeChanged', 1, { evidence: ['traits:topLeft:30'] }), WORLD)).toMatch(/lacks the evidence/);
    expect(storyCardProblem(card('firstSplit', 1, { evidence: ['event:-1'] }), WORLD)).toMatch(/invalid evidence/);
    expect(storyCardProblem(card('firstSplit', 1, { evidence: ['event:1', 'event:1'] }), WORLD)).toMatch(/repeats/);
  });

  it('refuses an unknown template, a non-finite value, a missing summary field, pictures, and more than 50 cards', async () => {
    expect(storyCardProblem({ ...card('firstSplit', 1), template: 'aWinner' }, WORLD)).toBe('a story card has an unknown template');
    expect(storyCardProblem(card('enzymeAtWork', 1, { summary: { ...SUMMARIES.enzymeAtWork, amount: Infinity } as never }), WORLD)).toMatch(/finite/);
    expect(storyCardProblem(card('placeChanged', 1, { summary: { ...SUMMARIES.placeChanged, before: NaN } as never }), WORLD)).toMatch(/finite/);
    const { before: _b, ...noBefore } = SUMMARIES.placeChanged as Extract<StoryCard, { template: 'placeChanged' }>['summary'];
    expect(storyCardProblem(card('placeChanged', 1, { summary: noBefore as never }), WORLD)).toBe('a story card\'s summary is missing "before"');
    const { changes: _c, ...noChanges } = SUMMARIES.firstSplit as Extract<StoryCard, { template: 'firstSplit' }>['summary'];
    expect(storyCardProblem(card('firstSplit', 1, { summary: noChanges as never }), WORLD)).toMatch(/missing "changes"/);
    expect(storyCardProblem(card('firstSplit', 1, { imageRefs: ['x.png'] }), WORLD)).toMatch(/pictures/);
    expect(storyCardProblem(card('firstSplit', 1, { worldId: 'other' }), WORLD)).toMatch(/another dish/);
    // The notebook as a whole: 51 cards are refused (a record a build could never write).
    const many = Array.from({ length: STORIES_MAX + 1 }, (_, i) => card('firstSplit', i + 1));
    const rec = await sealNotebook({ ...emptyNotebook(WORLD), stories: many });
    expect(await notebookProblem(rec, WORLD)).toBe('too many story cards');
    const ok = await sealNotebook({ ...emptyNotebook(WORLD), stories: many.slice(0, STORIES_MAX) });
    expect(await notebookProblem(ok, WORLD)).toBeNull();
  });

  it('50 cards plus one removes the oldest dismissed, else the oldest opened, else the oldest', () => {
    const full = Array.from({ length: STORIES_MAX }, (_, i) => card('firstSplit', i + 1));
    expect(storyToRemove(full.slice(0, 49))).toBeNull();
    expect(storyToRemove(full)!.id).toBe('story-1');
    const seen = full.map((c) => (c.id === 'story-7' || c.id === 'story-9' ? { ...c, seen: true } : c));
    expect(storyToRemove(seen)!.id).toBe('story-7');
    const dismissed = seen.map((c) => (c.id === 'story-30' || c.id === 'story-12' ? { ...c, seen: true, dismissed: true } : c));
    expect(storyToRemove(dismissed)!.id).toBe('story-12');
    const r = addStory(dismissed, card('enzymeAtWork', 51));
    expect(r.removed!.id).toBe('story-12');
    expect(r.list).toHaveLength(STORIES_MAX);
    expect(r.list.at(-1)!.id).toBe('story-51');
  });
});

describe('caption resolution', () => {
  it('A first split: the exact SPEC sentence, m:ss times, and the daughters from the summary', () => {
    const p = storyPanels(card('firstSplit', 1), NAMES);
    expect(p.map((x) => x.caption)).toEqual(['A Sprinter was growing.', SPLIT_CAPTION, 'Both daughters carry the parent’s traits.']);
    expect(SPLIT_CAPTION).toBe('A cell split. Its offspring inherited these traits.');
    expect(p.map((x) => x.time)).toEqual(['0:00', '0:35', '0:35']);
    expect(p[1]!.details[0]).toBe('Daughters #81 and #82, from parent #10.');
    const changed = card('firstSplit', 2, {
      summary: {
        ...SUMMARIES.firstSplit,
        changedB: 1,
        changes: [{ daughter: 82, kind: 'locus', locus: 3, from: 50, to: 48, module: null, moduleName: null }],
      } as never,
    });
    expect(storyPanels(changed, NAMES)[2]!.caption).toBe('1 of 2 daughters carry a recorded change: Division 50 → 48.');
    const unrecorded = card('firstSplit', 3, { summary: { ...SUMMARIES.firstSplit, changedA: 1, changedB: 1, recorded: false } as never });
    expect(storyPanels(unrecorded, NAMES)[2]!.caption).toBe('2 of 2 daughters carry a recorded change.');
  });

  it('An enzyme at work: the exact sentence; a producer only with recorded provenance', () => {
    const p = storyPanels(card('enzymeAtWork', 1), NAMES);
    expect(p[0]!.caption).toBe('Starch became sugar here.');
    expect(p[0]!.time).toBe('0:24');
    expect(p[0]!.details[0]).toContain('in the top left');
    expect(p[1]!.caption).toBe('Made here by Crumbsmith.');
    const none = storyPanels(card('enzymeAtWork', 2, { summary: { ...SUMMARIES.enzymeAtWork, producers: [] } as never }), NAMES);
    expect(none).toHaveLength(1);
    expect(none.map((x) => [x.caption, ...x.details].join(' ')).join(' ')).not.toMatch(/Made here|Crumbsmith/);
    expect(ENZYME_CAPTIONS).toEqual({ starch: 'Starch became sugar here.', oil: 'Oil became metabolite here.', protein: 'Protein became broth here.' });
  });

  it('A family changed: the inherited difference and tradeoff in the Lineage wording, never a benefit claim', () => {
    const p = storyPanels(card('familyChanged', 1), NAMES);
    expect(p[0]!.caption).toBe('Inherited difference: Motility investment +8 (50 → 58).');
    expect(p[0]!.time).toBe('2:00');
    expect(p[1]!.caption).toBe('A branch was named: Sprinter · Quick · a1.');
    expect(p[1]!.time).toBe('4:01');
    expect(p[2]!.caption).toBe('Game rules');
    expect(p[2]!.details).toEqual([STORY_TEXT.noAncestorRules, LINEAGE_TEXT.notVerdict]); // rules: null
    const all = p.flatMap((x) => [x.caption, ...x.details]);
    expect(all).toContain(LINEAGE_TEXT.notVerdict); // "… does not show that this branch does better or worse."
    const claims = all.filter((l) => l !== LINEAGE_TEXT.notVerdict).join(' ');
    expect(claims).not.toMatch(/\b(better|adapted|helps|superior|advanced|perfect|immune|winner)\b/i);
  });

  it('A place changed: the change, before and after counts with m:ss, the other changes in between, no cause claimed', () => {
    const p = storyPanels(card('placeChanged', 1), NAMES);
    expect(p.map((x) => x.caption)).toEqual(['You added sugar', 'Before: 13 Sprinters in the top left', 'After: 59 Sprinters in the top left']);
    expect(p.map((x) => x.time)).toEqual(['0:30', '0:30', '1:30']);
    expect(p[2]!.details).toContain('Other recorded changes in between: 2');
    expect(p[2]!.details).toContain(STORY_TEXT.sequenceNote);
    expect(p.flatMap((x) => [x.caption, ...x.details]).join(' ')).not.toMatch(/because|caused by|thanks to/i);
  });

  it('a species the dish does not name falls back to its id; at most 3 panels; the notice text', () => {
    const p = storyPanels(card('placeChanged', 1, { summary: { ...SUMMARIES.placeChanged, species: 'Q09' } as never }), NAMES);
    expect(p[1]!.caption).toBe('Before: 13 Q09 in the top left');
    for (const t of STORY_TEMPLATES) expect(storyPanels(card(t, 1), NAMES).length).toBeLessThanOrEqual(3);
    expect(storyNoticeText(card('firstSplit', 1))).toBe('Something happened: A first split');
    expect(STORY_TEXT.badge).toBe('Memory, not replay');
  });
});

/**
 * A real family card: story-8 of the Garden (FIRST_DISH_V1, seed 104729) with the StoryDetector to tick
 * 6898, as the worker stored it (tmp/stories-minors/family.ts; wave-verify.md item 3's repro).
 */
const REAL_FAMILY = {
  id: 'story-8',
  template: 'familyChanged',
  key: 'familyChanged:root-885',
  worldId: WORLD,
  ruleset: RULESET,
  evidence: ['event:2448', 'branch:0'],
  summary: {
    branch: 0,
    shortId: 'CC9',
    name: 'Sprinter · Patient · CC9',
    species: 'B01',
    rootBirthId: 885,
    rootCell: 6970,
    candidateTick: 2986,
    establishedTick: 6897,
    members: 5,
    depth: 3,
    parentName: null,
    trait: { kind: 'locus', locus: 3, delta: -10, mean: false },
    descriptor: 'Patient',
    module: null,
    locusValues: { ancestor: 50, branch: 40 },
    locusName: 'Division investment',
    rules: {
      ancestor: {
        speed: 0.25, moveCostPerCell: 0.2, intake: 0.18, maintenance: 0.5, upkeep: 0, sensing: 2, minDivisionAge: 12, divisionCost: 20, energyCap: 100,
        ph: [6, 8], salinity: [0, 0.2], warmth: [0.35, 0.65], restAfter: null, policy: 'ordered', foods: ['sugar'], weights: null, modules: [],
      },
      branch: {
        speed: 0.25, moveCostPerCell: 0.2, intake: 0.18, maintenance: 0.5, upkeep: 0, sensing: 2, minDivisionAge: 13.200000000000001, divisionCost: 18, energyCap: 100,
        ph: [6, 8], salinity: [0, 0.2], warmth: [0.35, 0.65], restAfter: null, policy: 'ordered', foods: ['sugar'], weights: null, modules: [],
      },
      modules: [],
    },
  },
  timeRange: [2986, 6897],
  imageRefs: [],
  favoriteId: null,
  notified: true,
  seen: false,
  dismissed: false,
} as unknown as StoryCard;

describe('words', () => {
  it('a real family card (Garden 104729, story-8): the Lineage sheet’s wording and structure, no line called a tradeoff', () => {
    expect(storyCardProblem(JSON.parse(JSON.stringify(REAL_FAMILY)), WORLD)).toBeNull();
    const p = storyPanels(REAL_FAMILY, NAMES);
    expect(p.map((x) => [x.time, x.caption, ...x.details])).toEqual([
      ['4:58', 'Inherited difference: Division investment -10 (50 → 40).', 'Ancestor: the Sprinter founder of this line.'],
      ['11:29', 'A branch was named: Sprinter · Patient · CC9.', '5 living descendants across 3 generations when named.'],
      [
        '11:29',
        'Game rules',
        'Game rule: it can split once it is 13.2 s old (ancestor: 12 s).',
        'Game rule: each split costs 18 energy (ancestor: 20).',
        LINEAGE_TEXT.notVerdict,
      ],
    ]);
    // The rule lines are exactly the Lineage sheet's (ruleLines), all of them, in its order.
    if (REAL_FAMILY.template === 'familyChanged') expect(p[2]!.details.slice(0, -1)).toEqual(ruleLines(REAL_FAMILY.summary.rules));
    // A motility branch: its first rule line is the faster speed (a gain side), and still nothing is a "tradeoff".
    const s = (REAL_FAMILY as Extract<StoryCard, { template: 'familyChanged' }>).summary;
    const quick = { ...REAL_FAMILY, summary: { ...s, rules: { ...s.rules!, branch: { ...s.rules!.branch, minDivisionAge: 12, divisionCost: 20, speed: 0.3, moveCostPerCell: 0.24 } } } } as StoryCard;
    const q = storyPanels(quick, NAMES)[2]!;
    expect(q.caption).toBe('Game rules');
    expect(q.details).toEqual([
      'Game rule: it moves up to 0.3 cells per second (ancestor: 0.25).',
      'Game rule: each cell it moves costs 0.24 energy (ancestor: 0.2).',
      LINEAGE_TEXT.notVerdict,
    ]);
    // Rules recorded but none differs (a locus that changes no rule number).
    const same = { ...REAL_FAMILY, summary: { ...s, rules: { ...s.rules!, branch: s.rules!.ancestor } } } as StoryCard;
    expect(storyPanels(same, NAMES)[2]!.details).toEqual(['Game rule: none of its rule numbers differ from its ancestor’s.', LINEAGE_TEXT.notVerdict]); // ruleLines' own line
    for (const c of [REAL_FAMILY, quick, same]) expect(storyPanels(c, NAMES).flatMap((x) => [x.caption, ...x.details]).join(' ')).not.toMatch(/tradeoff/i);
  });

  it('"A" or "An" before a species name; a count of a species is plural unless it is one', () => {
    const names: StoryNames = { ...NAMES, speciesIds: [...NAMES.speciesIds, 'B07', 'P01'], speciesNames: [...NAMES.speciesNames, 'Oilwick', 'Amoeba'] };
    const grow = (species: string) => storyPanels(card('firstSplit', 1, { summary: { ...SUMMARIES.firstSplit, species } as never }), names)[0]!.caption;
    expect(grow('B07')).toBe('An Oilwick was growing.');
    expect(grow('P01')).toBe('An Amoeba was growing.');
    expect(grow('B01')).toBe('A Sprinter was growing.');
    const place = (over: object) => storyPanels(card('placeChanged', 1, { summary: { ...SUMMARIES.placeChanged, ...over } as never }), names).map((x) => x.caption);
    expect(place({})).toEqual(['You added sugar', 'Before: 13 Sprinters in the top left', 'After: 59 Sprinters in the top left']);
    expect(place({ before: 1, after: 0 }).slice(1)).toEqual(['Before: 1 Sprinter in the top left', 'After: 0 Sprinters in the top left']);
    expect(place({ species: 'P01', before: 2, after: 1 }).slice(1)).toEqual(['Before: 2 Amoebae in the top left', 'After: 1 Amoeba in the top left']);
    expect(place({ command: 'inoculate', what: 'B01', accepted: 5 })[0]).toBe('You added 5 Sprinters');
    expect(place({ command: 'inoculate', what: 'P01', accepted: 5 })[0]).toBe('You added 5 Amoebae');
    expect(place({ command: 'inoculate', what: 'B07', accepted: 1 })[0]).toBe('You added 1 Oilwick');
    expect(withArticle('Oilwick')).toBe('An Oilwick');
    expect(speciesCount(names, 'Q09', 13)).toBe('13 Q09'); // an id is not pluralized
  });
});

describe('pacing', () => {
  it('one notification per 600 ticks; the cards not chosen stay quiet', () => {
    const cards = [card('firstSplit', 1), card('enzymeAtWork', 2), card('placeChanged', 3)];
    const p = new StoryPacer(null);
    p.offer('story-1');
    p.offer('story-2');
    expect(p.next(100, cards)).toBe('story-2'); // window open: one is chosen (the earliest event, 0:24)
    expect(p.pending).toEqual([]); // the other entered the notebook quietly
    p.offer('story-3');
    expect(p.next(100 + STORY_WINDOW_TICKS - 1, cards)).toBeNull(); // still inside 600 ticks: waits
    expect(p.next(100 + STORY_WINDOW_TICKS, cards)).toBe('story-3');
    // A pacer started at tick 1000 (StoryDetector.bind always starts it closed at the watch's tick, D-0079)
    // waits a full window from its start.
    const q = new StoryPacer(1000);
    q.offer('story-1');
    expect(q.next(1599, cards)).toBeNull();
    expect(q.next(1600, cards)).toBe('story-1');
  });

  it('priority: a followed family first, then a template not yet seen, then the earliest event', () => {
    const a = card('enzymeAtWork', 1); // event 0:24
    const b = card('placeChanged', 2); // event 0:30
    const c = card('firstSplit', 3); // event 0:35
    expect(pickStory([a, b, c], [a, b, c])!.id).toBe('story-1'); // earliest
    const seenEnzyme = card('enzymeAtWork', 9, { seen: true });
    expect(pickStory([a, b, c], [a, b, c, seenEnzyme])!.id).toBe('story-2'); // enzyme already seen
    const announced = card('placeChanged', 10, { notified: true });
    expect(pickStory([a, b, c], [a, b, c, seenEnzyme, announced])!.id).toBe('story-3');
    const fav = card('familyChanged', 4, { favoriteId: 'fav-1' });
    expect(pickStory([a, b, c, fav], [a, b, c, fav, seenEnzyme])!.id).toBe('story-4'); // favorite first
    expect(pickStory([{ ...a, dismissed: true }], [a])).toBeNull();
  });

  function garden(seed = 104729): World {
    return realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: WORLD, seed });
  }

  it('in a running Garden: a key seen again within the window joins its card; ≤ 1 notification per 600 ticks; quiet cards are recorded', () => {
    const w = garden();
    let record: NotebookRecord = emptyNotebook(WORLD);
    const det = new StoryDetector(w, { get: () => record, set: (r) => (record = r) });
    const changes: { tick: number; change: NotebookChange }[] = [];
    for (let t = 0; t < 2300; t++) {
      step(w);
      for (const change of det.afterTick(w)) changes.push({ tick: w.tick, change });
    }
    const cards = record.stories ?? [];
    expect(cards.length).toBeGreaterThan(2);
    // Every recorded card passes the load-time check (no card without its evidence).
    for (const c of cards) expect(storyCardProblem(JSON.parse(JSON.stringify(c)), WORLD)).toBeNull();
    // One card per key here: later evidence within 600 ticks joined it.
    const keys = cards.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    const joined = cards.find((c) => c.template === 'enzymeAtWork' && c.evidence.length > 1);
    expect(joined).toBeDefined();
    expect(changes.some((x) => x.change.kind === 'story' && x.change.id === joined!.id && !x.change.notify)).toBe(true);
    // Notifications at least 600 ticks apart; every other card was recorded quietly.
    const notifyTicks = changes.filter((x) => x.change.kind === 'story' && x.change.notify).map((x) => x.tick);
    expect(notifyTicks.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < notifyTicks.length; i++) expect(notifyTicks[i]! - notifyTicks[i - 1]!).toBeGreaterThanOrEqual(STORY_WINDOW_TICKS);
    expect(cards.filter((c) => c.notified)).toHaveLength(notifyTicks.length);
    expect(cards.some((c) => !c.notified)).toBe(true);
    // A first split was recorded from a committed birth event with its parent and daughters.
    const split = cards.find((c) => c.template === 'firstSplit')!;
    const ev = Number(split.evidence[0]!.split(':')[1]);
    expect(ev).toBeLessThan(w.counters.nextEventId);
    if (split.template === 'firstSplit') expect(split.summary.daughterA).toBeGreaterThan(split.summary.parent);
  }, 120_000);

  /** Run a detector on `w` for `ticks` steps; the notifications with their ticks, and the cards just before the first. */
  function watchFrom(w: World, ticks: number) {
    let record: NotebookRecord = emptyNotebook(WORLD);
    const start = w.tick;
    const det = new StoryDetector(w, { get: () => record, set: (r) => (record = r) });
    const notified: { tick: number; id: string }[] = [];
    let beforeFirst: readonly StoryCard[] = [];
    for (let t = 0; t < ticks; t++) {
      const prior = record.stories ?? [];
      step(w);
      for (const c of det.afterTick(w))
        if (c.kind === 'story' && c.notify) {
          if (notified.length === 0) beforeFirst = prior;
          notified.push({ tick: w.tick, id: c.id });
        }
    }
    return { start, notified, beforeFirst, record };
  }

  it('D-0079 first minute: a fresh dish announces nothing before its start tick + 600, then the pickStory choice among the cards that waited', () => {
    const { start, notified, beforeFirst, record } = watchFrom(garden(), STORY_WINDOW_TICKS + 20);
    expect(start).toBe(0);
    // Cards were found during the first minute (recorded quietly as now) …
    const waited = beforeFirst.filter((c) => storyEventTick(c) < start + STORY_WINDOW_TICKS);
    expect(waited.length).toBeGreaterThan(1);
    expect(waited.every((c) => !c.notified)).toBe(true);
    // … but the first notification comes exactly when the window opens, and it is pickStory's choice.
    expect(notified.length).toBeGreaterThan(0);
    expect(notified[0]!.tick).toBe(start + STORY_WINDOW_TICKS);
    expect(notified[0]!.id).toBe(pickStory(beforeFirst, beforeFirst)!.id);
    expect((record.stories ?? []).filter((c) => c.notified).map((c) => c.id)).toEqual([notified[0]!.id]);
  }, 120_000);

  it('D-0079 first minute: a watch that starts at tick T > 0 (Continue, a load, a copy) waits until T + 600', () => {
    const w = garden();
    for (let t = 0; t < 700; t++) step(w); // played before this watch began (no detector)
    const { start, notified } = watchFrom(w, STORY_WINDOW_TICKS + 40);
    expect(start).toBe(700);
    expect(notified.length).toBeGreaterThan(0);
    expect(notified[0]!.tick).toBeGreaterThanOrEqual(start + STORY_WINDOW_TICKS);
  }, 120_000);
});

describe('Spotlight', () => {
  it('moves only the camera: no client request (so no command), the speed untouched', async () => {
    vi.useFakeTimers();
    try {
      const { spotlightStory } = await import('../../src/ui/stories');
      const state = await import('../../src/ui/state');
      spotlightStory(card('enzymeAtWork', 1));
      await vi.advanceTimersByTimeAsync(200);
      expect(ui.requests).toBe(0);
      expect((state.route as unknown as { value: unknown }).value).toEqual({ name: 'dish' });
      // The enzyme card's recorded cell 7871 = (63, 61): its centre.
      expect(ui.zoom).toEqual([['neighborhood', [63.5, 61.5]]]);
      expect(ui.speeds).toEqual([]); // not opened from the notice: the speed is left as it is
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('pause and restore (D08 §07: the Field Guide’s convention)', () => {
  type Sig<T> = { value: T };
  async function setup(speed: number, from: unknown = { name: 'dish' }) {
    const stories = await import('../../src/ui/stories');
    const state = await import('../../src/ui/state');
    stories.wireStories();
    (state.dishInfo as unknown as Sig<unknown>).value = { dishId: 'd1', speciesIds: [], speciesNames: [], materials: [] };
    (state.meta as unknown as Sig<unknown>).value = { speed };
    (state.route as unknown as Sig<unknown>).value = from;
    stories.openStory('story-1'); // the notice's Open
    // Leaving the dish screen pauses it (state.ts, D-0028): the speed the snapshot reports is now 0.
    (state.meta as unknown as Sig<unknown>).value = { speed: 0 };
    return { stories, route: state.route as unknown as Sig<unknown>, dishInfo: state.dishInfo as unknown as Sig<unknown> };
  }

  it('Open on a running dish, then Spotlight: back to the dish at its prior speed, once', async () => {
    vi.useFakeTimers();
    try {
      const { stories, route } = await setup(4);
      expect(route.value).toEqual({ name: 'notebook', tab: 'stories' });
      expect(ui.speeds).toEqual([]);
      stories.spotlightStory(card('enzymeAtWork', 1));
      expect(route.value).toEqual({ name: 'dish' });
      expect(ui.speeds).toEqual([4]);
      await vi.advanceTimersByTimeAsync(200);
      expect(ui.requests).toBe(0); // still no client request: setSpeed is the app's own speed control
      // The record is used once: a later Spotlight (another visit) leaves the speed as it is.
      route.value = { name: 'notebook', tab: 'stories' };
      stories.spotlightStory(card('enzymeAtWork', 1));
      expect(ui.speeds).toEqual([4]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('the Notebook’s Back (leaveNotebook) during that visit returns to the dish at its prior speed; tab changes keep the visit', async () => {
    const { stories, route } = await setup(2);
    route.value = { name: 'notebook', tab: 'favorites' };
    expect(stories.leaveNotebook()).toBe(true);
    expect(route.value).toEqual({ name: 'dish' });
    expect(ui.speeds).toEqual([2]);
    expect(stories.leaveNotebook()).toBe(false); // used once
  });

  it('a paused dish stays paused; opened any other way, or after the visit ended, nothing changes speed', async () => {
    vi.useFakeTimers();
    try {
      let s = await setup(0);
      expect(s.stories.leaveNotebook()).toBe(true);
      expect(ui.speeds).toEqual([]); // it was paused before Open
      // Open while not on the dish screen (e.g. Home): no record.
      s = await setup(4, { name: 'home' });
      expect(s.stories.leaveNotebook()).toBe(false);
      s.stories.spotlightStory(card('enzymeAtWork', 1));
      expect(ui.speeds).toEqual([]);
      // Leaving the Notebook another way (Home) ends the visit: back in the Notebook, Spotlight keeps the pause.
      s = await setup(4);
      s.route.value = { name: 'home' };
      s.route.value = { name: 'notebook', tab: 'stories' };
      s.stories.spotlightStory(card('enzymeAtWork', 1));
      expect(ui.speeds).toEqual([]);
      // Another dish open by then: no restore.
      s = await setup(4);
      s.dishInfo.value = { dishId: 'd2', speciesIds: [], speciesNames: [], materials: [] };
      expect(s.stories.leaveNotebook()).toBe(false);
      expect(ui.speeds).toEqual([]);
      await vi.advanceTimersByTimeAsync(4000);
    } finally {
      vi.useRealTimers();
    }
  });
});
