/**
 * Story cards (P4.2; SPEC §12.7, UX §5.9, D08 §07): the notebook kind 'stories' (D-0070). A card is a
 * chronological memory of something recorded in this dish, built in the worker (src/worker/stories.ts)
 * from events and observation only, and kept in the per-dish notebook record next to the world save:
 * never in the world state, its checksum or its stateHash, and never read by src/sim.
 *
 * - Every card carries at least one evidence id ('event:<id>', 'reaction:<enzyme>:<second>:<cell>',
 *   'branch:<id>', 'traits:<region>:<second>', 'command:<seq>'), and each template needs its own kinds
 *   (D08 "Required evidence"). A card without them is refused.
 * - The summary keeps the measured values its captions need (ids, species ids, counts, amounts, ticks),
 *   so a card outlives the raw events it was built from (D08 "Retain the compact evidence summary with
 *   the card when raw events expire"). No player text is copied in (branch names are the generated ones).
 * - At most STORIES_MAX cards per dish (CT §12.10 "bookmarks 50 text"; D08 "Reuse existing bookmark …
 *   limits"). Adding one more removes the oldest dismissed card, else the oldest opened, else the oldest.
 * - imageRefs stays empty until P4.6 adds pictures: no card has a snapshot, so every card is a memory,
 *   not a replay (SPEC §12.7).
 *
 * Pure data functions; nothing here imports the world model (the world-reference checks take plain values).
 */
import type { BranchTrait } from '@sim/branches';
import type { LineageModuleCost, LineageRules } from '@sim/lineage';

export const STORY_TEMPLATES = ['firstSplit', 'enzymeAtWork', 'familyChanged', 'placeChanged'] as const;
export type StoryTemplate = (typeof STORY_TEMPLATES)[number];

/** CT §12.10 "bookmarks 50 text": story cards kept per dish. */
export const STORIES_MAX = 50;
/** Evidence ids one card keeps (later evidence joining a card stops adding at this many). */
export const STORY_EVIDENCE_MAX = 16;
/** D08 "at most one new card notification per 60 simulated seconds" and the dedupe window: 600 ticks. */
export const STORY_WINDOW_TICKS = 600;

export const STORY_ENZYMES = ['starch', 'oil', 'protein'] as const;
export type StoryEnzyme = (typeof STORY_ENZYMES)[number];
/** TRAIT_REGIONS (src/sim/history.ts) by name; quarters 1–4. */
export const STORY_REGIONS = ['dish', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const;
export type StoryRegion = (typeof STORY_REGIONS)[number];
export const PLACE_COMMANDS = ['deposit', 'inoculate', 'placeObject'] as const;
export type PlaceCommand = (typeof PLACE_COMMANDS)[number];

export interface StoryRuleset {
  readonly simulationVersion: number;
  readonly evolutionRulesVersion: number;
  readonly moduleRegistryVersion: number;
  readonly contentHash: string;
}

/** One recorded change one daughter carries (from its birth record and its parent's recorded genome). */
export interface DaughterChange {
  readonly daughter: number;
  readonly kind: 'locus' | 'gained' | 'lost' | 'policy' | 'preference';
  /** Locus index (-1 unless kind 'locus'). */
  readonly locus: number;
  /** Recorded values of that locus in the parent and the daughter (-1 unless kind 'locus'). */
  readonly from: number;
  readonly to: number;
  /** Module id and content name for 'gained' / 'lost' (null otherwise). */
  readonly module: string | null;
  readonly moduleName: string | null;
}

export interface FirstSplitSummary {
  /** Species id of the parent. */
  readonly species: string;
  readonly parent: number;
  readonly daughterA: number;
  readonly daughterB: number;
  readonly changedA: number;
  readonly changedB: number;
  /** The parent's recorded birth tick (-1: not recorded any more). */
  readonly parentBirthTick: number;
  readonly splitTick: number;
  /** The parent's cell at the split. */
  readonly cell: number;
  /** A followed family's root this split belongs to (0: none). */
  readonly familyRoot: number;
  /** Whether the daughters' birth records were read (false: a change is known, not its values). */
  readonly recorded: boolean;
  readonly changes: readonly DaughterChange[];
}

export interface EnzymeSummary {
  readonly enzyme: StoryEnzyme;
  /** The whole simulated second the conversion was recorded in (ticks 10s…10s+9). */
  readonly second: number;
  /** The cell that converted most in that second, and its recorded carbon. */
  readonly cell: number;
  readonly amount: number;
  /** Carbon converted by that enzyme over the whole dish in that second. */
  readonly dishAmount: number;
  readonly region: StoryRegion;
  /** Species ids releasing that enzyme in the cell or a neighbour (D-0051 provenance); [] when none. */
  readonly producers: readonly string[];
}

export interface FamilySummary {
  readonly branch: number;
  readonly shortId: string;
  /** The generated branch name ("Species · Descriptor · ShortID"), never a player's name. */
  readonly name: string;
  readonly species: string;
  readonly rootBirthId: number;
  readonly rootCell: number;
  readonly candidateTick: number;
  readonly establishedTick: number;
  readonly members: number;
  readonly depth: number;
  /** The generated name of the branch it descends from (null: the species' ancestral line). */
  readonly parentName: string | null;
  readonly trait: BranchTrait | null;
  readonly descriptor: string;
  readonly module: LineageModuleCost | null;
  readonly locusValues: { readonly ancestor: number; readonly branch: number } | null;
  /** The content name of the locus the difference names (null otherwise). */
  readonly locusName: string | null;
  readonly rules: LineageRules | null;
}

export interface PlaceSummary {
  readonly seq: number;
  readonly command: PlaceCommand;
  readonly commandTick: number;
  /** The material id (deposit, placeObject) or species id (inoculate). */
  readonly what: string;
  /** Cells covered (deposit), organisms added (inoculate) or objects placed (placeObject). */
  readonly accepted: number;
  readonly x: number;
  readonly y: number;
  readonly region: StoryRegion;
  readonly beforeSecond: number;
  readonly afterSecond: number;
  /** The species whose count in the region changed most (ties: the lowest index), and its counts. */
  readonly species: string;
  readonly before: number;
  readonly after: number;
  /** Species whose count in the region changed. */
  readonly changedSpecies: number;
  /** Other accepted changes to the dish recorded between the command and the later sample. */
  readonly others: number;
}

interface StoryCardBase {
  /** 'story-<n>', in creation order. */
  readonly id: string;
  /** template + ':' + its lineage root or region (dedupe). */
  readonly key: string;
  readonly worldId: string;
  readonly ruleset: StoryRuleset;
  readonly evidence: readonly string[];
  /** [first, last] tick of its evidence. */
  readonly timeRange: readonly [number, number];
  /** P4.6 adds pictures; empty until then. */
  readonly imageRefs: readonly string[];
  /** The followed family it concerns (null: none). */
  readonly favoriteId: string | null;
  readonly notified: boolean;
  readonly seen: boolean;
  readonly dismissed: boolean;
}

export type StoryCard =
  | (StoryCardBase & { readonly template: 'firstSplit'; readonly summary: FirstSplitSummary })
  | (StoryCardBase & { readonly template: 'enzymeAtWork'; readonly summary: EnzymeSummary })
  | (StoryCardBase & { readonly template: 'familyChanged'; readonly summary: FamilySummary })
  | (StoryCardBase & { readonly template: 'placeChanged'; readonly summary: PlaceSummary });

// ---------------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const CARD_KEYS = ['id', 'template', 'key', 'worldId', 'ruleset', 'evidence', 'summary', 'timeRange', 'imageRefs', 'favoriteId', 'notified', 'seen', 'dismissed'];
const RULESET_KEYS = ['simulationVersion', 'evolutionRulesVersion', 'moduleRegistryVersion', 'contentHash'];
const SPECIES_RE = /^[A-Z][A-Z0-9_]{0,31}$/;

export const EVIDENCE_PATTERNS = {
  event: /^event:(0|[1-9][0-9]{0,11})$/,
  reaction: /^reaction:(starch|oil|protein):(0|[1-9][0-9]{0,9}):(0|[1-9][0-9]{0,5})$/,
  branch: /^branch:(0|[1-9][0-9]{0,6})$/,
  traits: /^traits:(dish|topLeft|topRight|bottomLeft|bottomRight):(0|[1-9][0-9]{0,9})$/,
  command: /^command:([1-9][0-9]{0,11})$/,
} as const;
export type EvidenceKind = keyof typeof EVIDENCE_PATTERNS;

/** The kind of one evidence id, or null when it is not one. */
export function evidenceKind(id: unknown): EvidenceKind | null {
  if (typeof id !== 'string') return null;
  for (const k of Object.keys(EVIDENCE_PATTERNS) as EvidenceKind[]) if (EVIDENCE_PATTERNS[k].test(id)) return k;
  return null;
}

/** The evidence kinds each template needs (D08 "Required evidence"), at least once each. */
const REQUIRED_EVIDENCE: Readonly<Record<StoryTemplate, readonly EvidenceKind[]>> = {
  firstSplit: ['event'],
  enzymeAtWork: ['reaction'],
  familyChanged: ['event', 'branch'],
  placeChanged: ['command', 'traits'],
};

/** A JSON value of bounded size whose every number is finite (null when fine). */
function valueProblem(v: unknown, depth: number): string | null {
  if (v === null || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? null : 'a story card holds a value that is not a finite number';
  if (typeof v === 'string') return v.length <= 200 ? null : 'a story card holds an overlong text';
  if (depth > 6) return 'a story card is nested too deeply';
  if (Array.isArray(v)) {
    if (v.length > 64) return 'a story card holds an overlong list';
    for (const x of v) {
      const p = valueProblem(x, depth + 1);
      if (p) return p;
    }
    return null;
  }
  if (isObj(v)) {
    const keys = Object.keys(v);
    if (keys.length > 64) return 'a story card holds an overlong record';
    for (const k of keys) {
      const p = valueProblem(v[k], depth + 1);
      if (p) return p;
    }
    return null;
  }
  return 'a story card holds a value of an unknown kind';
}

type FieldCheck = (v: unknown) => boolean;
const int0: FieldCheck = (v) => isInt(v, 0);
const intM1: FieldCheck = (v) => isInt(v, -1);
const int1: FieldCheck = (v) => isInt(v, 1);
const num: FieldCheck = isNum;
const species: FieldCheck = (v) => typeof v === 'string' && SPECIES_RE.test(v);
const text: FieldCheck = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200;
const textOrNull: FieldCheck = (v) => v === null || text(v);
const objOrNull: FieldCheck = (v) => v === null || isObj(v);
const region: FieldCheck = (v) => STORY_REGIONS.includes(v as StoryRegion);
const flag01: FieldCheck = (v) => v === 0 || v === 1;

const DAUGHTER_KEYS = ['daughter', 'kind', 'locus', 'from', 'to', 'module', 'moduleName'];
const daughterChanges: FieldCheck = (v) =>
  Array.isArray(v) &&
  v.length <= 8 &&
  v.every(
    (c) =>
      isObj(c) &&
      Object.keys(c).every((k) => DAUGHTER_KEYS.includes(k)) &&
      isInt(c.daughter, 1) &&
      ['locus', 'gained', 'lost', 'policy', 'preference'].includes(c.kind as string) &&
      isInt(c.locus, -1) &&
      isInt(c.from, -1) &&
      isInt(c.to, -1) &&
      textOrNull(c.module) &&
      textOrNull(c.moduleName) &&
      (c.kind !== 'locus' || (isInt(c.locus, 0) && c.locus < 8)) &&
      ((c.kind !== 'gained' && c.kind !== 'lost') || text(c.module)),
  );

/** Every field each template's summary needs, with its check (an unknown field is refused too). */
const SUMMARY_FIELDS: Readonly<Record<StoryTemplate, Readonly<Record<string, FieldCheck>>>> = {
  firstSplit: {
    species,
    parent: int1,
    daughterA: int1,
    daughterB: int1,
    changedA: flag01,
    changedB: flag01,
    parentBirthTick: intM1,
    splitTick: int0,
    cell: int0,
    familyRoot: int0,
    recorded: (v) => typeof v === 'boolean',
    changes: daughterChanges,
  },
  enzymeAtWork: {
    enzyme: (v) => STORY_ENZYMES.includes(v as StoryEnzyme),
    second: int0,
    cell: int0,
    amount: (v) => isNum(v) && v > 0,
    dishAmount: (v) => isNum(v) && v > 0,
    region,
    producers: (v) => Array.isArray(v) && v.length <= 32 && v.every(species),
  },
  familyChanged: {
    branch: int0,
    shortId: text,
    name: text,
    species,
    rootBirthId: int1,
    rootCell: intM1,
    candidateTick: int0,
    establishedTick: int0,
    members: int0,
    depth: int0,
    parentName: textOrNull,
    trait: objOrNull,
    descriptor: (v) => typeof v === 'string' && v.length <= 200,
    module: objOrNull,
    locusValues: (v) => v === null || (isObj(v) && isNum(v.ancestor) && isNum(v.branch)),
    locusName: textOrNull,
    rules: (v) => v === null || (isObj(v) && isObj(v.ancestor) && isObj(v.branch) && Array.isArray(v.modules)),
  },
  placeChanged: {
    seq: int1,
    command: (v) => PLACE_COMMANDS.includes(v as PlaceCommand),
    commandTick: int0,
    what: text,
    accepted: int1,
    x: num,
    y: num,
    region,
    beforeSecond: int0,
    afterSecond: int0,
    species,
    before: int0,
    after: int0,
    changedSpecies: int1,
    others: int0,
  },
};

/** The first problem with one card, or null. `worldId`: the record's. */
export function storyCardProblem(raw: unknown, worldId: string): string | null {
  if (!isObj(raw)) return 'a story card is not an object';
  for (const k of Object.keys(raw)) if (!CARD_KEYS.includes(k)) return `a story card has an unknown field "${k.slice(0, 40)}"`;
  if (typeof raw.id !== 'string' || !/^story-[1-9][0-9]{0,8}$/.test(raw.id)) return 'a story card has an invalid id';
  const template = raw.template as StoryTemplate;
  if (!STORY_TEMPLATES.includes(template)) return 'a story card has an unknown template';
  if (typeof raw.key !== 'string' || raw.key.length > 120 || !raw.key.startsWith(`${template}:`)) return 'a story card has an invalid key';
  if (raw.worldId !== worldId) return 'a story card belongs to another dish';
  const rs = raw.ruleset;
  if (
    !isObj(rs) ||
    Object.keys(rs).some((k) => !RULESET_KEYS.includes(k)) ||
    !isInt(rs.simulationVersion, 1) ||
    !isInt(rs.evolutionRulesVersion, 1) ||
    !isInt(rs.moduleRegistryVersion, 1) ||
    typeof rs.contentHash !== 'string' ||
    rs.contentHash.length === 0 ||
    rs.contentHash.length > 200
  )
    return 'a story card has an invalid ruleset';
  // No card without its evidence (D08 "Required evidence"; SPEC §12.7 "evidence IDs").
  if (!Array.isArray(raw.evidence) || raw.evidence.length === 0) return 'a story card has no evidence';
  if (raw.evidence.length > STORY_EVIDENCE_MAX) return 'a story card has too much evidence';
  const kinds = raw.evidence.map(evidenceKind);
  if (kinds.some((k) => k === null)) return 'a story card has an invalid evidence id';
  if (new Set(raw.evidence).size !== raw.evidence.length) return 'a story card repeats an evidence id';
  for (const need of REQUIRED_EVIDENCE[template]) if (!kinds.includes(need)) return 'a story card lacks the evidence its template needs';
  const tr = raw.timeRange;
  if (!Array.isArray(tr) || tr.length !== 2 || !isInt(tr[0], 0) || !isInt(tr[1], 0) || tr[0] > tr[1]) return 'a story card has an invalid time range';
  if (!Array.isArray(raw.imageRefs) || raw.imageRefs.length !== 0) return 'a story card has pictures this version cannot show';
  if (raw.favoriteId !== null && (typeof raw.favoriteId !== 'string' || !/^fav-[1-9][0-9]{0,8}$/.test(raw.favoriteId))) return 'a story card names an invalid family';
  if (typeof raw.notified !== 'boolean' || typeof raw.seen !== 'boolean' || typeof raw.dismissed !== 'boolean') return 'a story card has an invalid flag';
  const s = raw.summary;
  if (!isObj(s)) return 'a story card has no summary';
  const p = valueProblem(s, 0);
  if (p) return p;
  const fields = SUMMARY_FIELDS[template];
  for (const k of Object.keys(s)) if (!Object.prototype.hasOwnProperty.call(fields, k)) return `a story card's summary has an unknown field "${k.slice(0, 40)}"`;
  for (const k of Object.keys(fields)) {
    if (!Object.prototype.hasOwnProperty.call(s, k)) return `a story card's summary is missing "${k}"`;
    if (!fields[k]!(s[k])) return `a story card's summary has an invalid "${k}"`;
  }
  return null;
}

/** The notebook kind validator (notebook.ts KIND_PROBLEMS.stories): a missing key arrives as []. */
export function storiesProblem(raw: unknown, record: Record<string, unknown>): string | null {
  if (!Array.isArray(raw)) return 'story cards is not a list';
  if (raw.length > STORIES_MAX) return 'too many story cards';
  const worldId = record.worldId as string;
  const ids: string[] = [];
  for (const c of raw as unknown[]) {
    const p = storyCardProblem(c, worldId);
    if (p) return p;
    const id = (c as StoryCard).id;
    if (ids.includes(id)) return 'two story cards share an id';
    ids.push(id);
  }
  return null;
}

/** The species, organisms and ticks a card names, checked against the dish the file carries (null: fine). */
export function storiesRefsProblem(
  raw: unknown,
  refs: { readonly speciesIds: readonly string[]; readonly nextBirthId: number; readonly tick: number },
): string | null {
  const list = (Array.isArray(raw) ? raw : []) as readonly StoryCard[];
  for (const c of list) {
    if (c.timeRange[1] > refs.tick) return 'a story card records a time after the dish’s time';
    const sp: string[] = [];
    const births: number[] = [];
    switch (c.template) {
      case 'firstSplit':
        sp.push(c.summary.species);
        births.push(c.summary.parent, c.summary.daughterA, c.summary.daughterB, ...c.summary.changes.map((x) => x.daughter));
        if (c.summary.familyRoot > 0) births.push(c.summary.familyRoot);
        break;
      case 'enzymeAtWork':
        sp.push(...c.summary.producers);
        break;
      case 'familyChanged':
        sp.push(c.summary.species);
        births.push(c.summary.rootBirthId);
        break;
      case 'placeChanged':
        sp.push(c.summary.species);
        if (c.summary.command === 'inoculate') sp.push(c.summary.what);
        break;
    }
    if (sp.some((s) => !refs.speciesIds.includes(s))) return 'a story card names a species this dish does not have';
    if (births.some((b) => b >= refs.nextBirthId)) return 'a story card names an organism this dish never had';
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Record operations (pure; the worker owns the record)
// ---------------------------------------------------------------------------------------------------

export function storyNumber(id: string): number {
  return Number(id.slice(6));
}

/** The tick of the event a card is about (the split, the second converted, the branch named, the change made). */
export function storyEventTick(c: StoryCard): number {
  switch (c.template) {
    case 'firstSplit':
      return c.summary.splitTick;
    case 'enzymeAtWork':
      return c.summary.second * 10;
    case 'familyChanged':
      return c.summary.establishedTick;
    case 'placeChanged':
      return c.summary.commandTick;
  }
}

/** The next card id: one past the highest id kept (cards are removed oldest first, so ids only grow while kept). */
export function nextStoryId(list: readonly StoryCard[]): string {
  let n = 0;
  for (const c of list) n = Math.max(n, storyNumber(c.id));
  return `story-${n + 1}`;
}

/**
 * The card to remove so one more fits (null while there is room): the oldest dismissed card, else the
 * oldest opened (seen) one, else the oldest card. Oldest = lowest id (creation order).
 */
export function storyToRemove(list: readonly StoryCard[]): StoryCard | null {
  if (list.length < STORIES_MAX) return null;
  const oldest = (f: (c: StoryCard) => boolean) => {
    let best: StoryCard | null = null;
    for (const c of list) if (f(c) && (best === null || storyNumber(c.id) < storyNumber(best.id))) best = c;
    return best;
  };
  return oldest((c) => c.dismissed) ?? oldest((c) => c.seen) ?? oldest(() => true);
}

/** `list` with `card` added (removing one by storyToRemove's order when full). */
export function addStory(list: readonly StoryCard[], card: StoryCard): { list: StoryCard[]; removed: StoryCard | null } {
  const removed = storyToRemove(list);
  const kept = removed ? list.filter((c) => c !== removed) : [...list];
  kept.push(card);
  return { list: kept, removed };
}

/** `list` with the card `id` marked seen or dismissed (null: no such card). Dismissing also marks it seen. */
export function markStory(list: readonly StoryCard[], id: string, mark: 'seen' | 'dismissed'): StoryCard[] | null {
  const i = list.findIndex((c) => c.id === id);
  if (i < 0) return null;
  const c = list[i]!;
  const next: StoryCard = mark === 'seen' ? { ...c, seen: true } : { ...c, seen: true, dismissed: true };
  const out = [...list];
  out[i] = next;
  return out;
}

/** Whether any card was removed to keep STORIES_MAX (ids are given in order; a full list with a higher id lost some). */
export function storiesWereRemoved(list: readonly StoryCard[]): boolean {
  return list.length >= STORIES_MAX && storyNumber(nextStoryId(list)) - 1 > list.length;
}
