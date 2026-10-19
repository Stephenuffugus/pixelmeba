/**
 * Custom challenges, the notebook kind 'challenges' (P4.8 part c; SPEC §13.5 "Custom challenge editor:
 * saved baseline, allowed tools, optional command budget, one objective, numeric targets; restrictions
 * apply only inside that challenge; exported with stable IDs, region masks and baseline checksum; no
 * scripts"; D02 §20; D07 line 107; D09 line 134; D-0070 "Notebook state is not world state"; D-0071
 * "Objectives are evaluated, never enforced in the sim").
 *
 * A dish keeps at most CHALLENGES_MAX challenge records in its notebook record (src/persistence/notebook.ts),
 * next to the world save and outside the state checksum and stateHash; nothing in src/sim reads them. Each
 * record is data only — no scripts, no expressions:
 *
 * - `id`: 'ch-<n>', one more than the highest id the dish holds (records are never removed, so an id is
 *   never reused); stable through export and import;
 * - `name`: text that is only displayed (≤ 60 characters, cleaned like a dish name);
 * - `objective`: one of the engine's five named predicate types with numeric targets and ids from lists
 *   (src/sim/objectives.ts typedPredicate checks it exactly as a content objective's predicate); the region
 *   of a fieldInRange objective is the record's `region` (the engine's TRAIT_REGIONS: the dish or a quarter),
 *   so `objective.params` never carries one;
 * - `allowedTools`: the tool groups the challenge allows (CHALLENGE_TOOL_GROUPS); `commandBudget`: null or an
 *   integer 1…99 (successful actions of the counted groups, src/worker/challenge.ts);
 * - `horizonSeconds`: the turn length (60 / 180 / 600, as Try my dish);
 * - `baseline`: the world id, tick and state checksum of the saved starting point (the shelf record written
 *   when the challenge was saved; the exported file's own checksum).
 *
 * `challengesProblem` validates the kind (notebook.ts KIND_PROBLEMS); `challengesWorldProblem` checks it
 * against the dish the file carries (its recorded manifest, species and fields: objectiveRefsProblem). Any
 * problem drops the whole notebook with a message and the world still loads (D-0073).
 */
import { objectiveRefsProblem, OBJECTIVE_TYPES, typedPredicate, type ObjectivePredicate, type ObjectiveType } from '@sim/objectives';
import type { GoalWorldRefs } from './notebookGoals';

/** Tool groups a challenge can allow (PROPOSED DECISION, docs/reports/reviews/g4-wave-6b/challenge-editor-build.md). */
export const CHALLENGE_TOOL_GROUPS = ['addLife', 'feed', 'habitat', 'sample', 'cleanWater', 'lid', 'evolution'] as const;
export type ChallengeToolGroup = (typeof CHALLENGE_TOOL_GROUPS)[number];

/** Records kept per dish (the 21st is refused). */
export const CHALLENGES_MAX = 20;
export const CHALLENGE_NAME_MAX = 60;
export const CHALLENGE_BUDGET_MIN = 1;
export const CHALLENGE_BUDGET_MAX = 99;
/** Turn lengths, as Try my dish (CT §12.10). */
export const CHALLENGE_HORIZON_SECONDS = [60, 180, 600] as const;
export type ChallengeHorizonSeconds = (typeof CHALLENGE_HORIZON_SECONDS)[number];
export const CHALLENGE_HORIZON_DEFAULT = 180;
/** The engine's quarters (src/sim/history.ts TRAIT_REGIONS without 'dish'). */
export const CHALLENGE_QUARTERS = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const;
export type ChallengeQuarter = (typeof CHALLENGE_QUARTERS)[number];

/**
 * Where a challenge measures. P5.6 (D-0131): `habitat` is a region of the baseline dish's RECORDED habitat
 * (world.content.habitat.regions, listed by label in the editor), measured by a biomassThreshold objective
 * (Recover a neighborhood); quarters stay.
 */
export type ChallengeRegion = { readonly kind: 'dish' } | { readonly kind: 'quarter'; readonly id: ChallengeQuarter } | { readonly kind: 'habitat'; readonly id: string };
/** A habitat region id (HabitatRegionSchema's pattern). */
const HABITAT_REGION_ID = /^[A-Z][A-Z0-9_]{0,63}$/;

/** One objective: a named predicate type, its numeric targets and ids, and its duration when it holds for one. */
export interface ChallengeObjective {
  readonly type: ObjectiveType;
  readonly params: Readonly<Record<string, string | number>>;
  readonly durationSeconds?: number;
}

export interface ChallengeBaseline {
  readonly worldId: string;
  readonly tick: number;
  /** The baseline save's state checksum ('sha256:…'). */
  readonly checksum: string;
}

export interface ChallengeRecord {
  readonly id: string;
  readonly name: string;
  readonly objective: ChallengeObjective;
  readonly allowedTools: readonly ChallengeToolGroup[];
  readonly commandBudget: number | null;
  readonly horizonSeconds: ChallengeHorizonSeconds;
  readonly region: ChallengeRegion;
  readonly baseline: ChallengeBaseline;
}

/** What the editor sends to be saved (the worker adds the id and the baseline). */
export type ChallengeInput = Omit<ChallengeRecord, 'id' | 'baseline'>;

const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const includes = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const RECORD_KEYS = ['id', 'name', 'objective', 'allowedTools', 'commandBudget', 'horizonSeconds', 'region', 'baseline'];
const INPUT_KEYS = RECORD_KEYS.filter((k) => k !== 'id' && k !== 'baseline');
const OBJECTIVE_KEYS = ['type', 'params', 'durationSeconds'];
const BASELINE_KEYS = ['worldId', 'tick', 'checksum'];
/** Ids a parameter may name (species, field, event, enzyme, gate): never free text. */
const PARAM_ID = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

/** A challenge name as written into a record: control characters become spaces, trimmed, at most 60 characters. */
export function cleanChallengeName(name: unknown): string {
  if (typeof name !== 'string') return '';
  const s = Array.from(name)
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .trim();
  return Array.from(s).slice(0, CHALLENGE_NAME_MAX).join('').trim();
}

/** The challenge id's number, or null when it is not 'ch-<n>'. */
export function challengeNumber(id: unknown): number | null {
  const m = typeof id === 'string' ? /^ch-([1-9][0-9]{0,8})$/.exec(id) : null;
  return m ? Number(m[1]) : null;
}

/** The objective id a challenge's goal attempt and turn record carry ('ch-3' → 'CHALLENGE_3'). */
export function challengeObjectiveId(id: string): string {
  return `CHALLENGE_${challengeNumber(id) ?? 0}`;
}

/** The region id the engine measures (src/sim/history.ts TRAIT_REGIONS, or P5.6 a habitat region id). */
export function regionIdOf(region: ChallengeRegion): string {
  return region.kind === 'dish' ? 'dish' : region.id;
}

/**
 * The engine predicate of a challenge (a fieldInRange objective measured in the record's region; P5.6: a
 * biomassThreshold measured in a quarter or a habitat region, with no region key for the dish, so every record
 * written before reads exactly as before).
 */
export function challengePredicate(c: Pick<ChallengeRecord, 'objective' | 'region'>): ObjectivePredicate {
  const o = c.objective;
  const inject = o.type === 'fieldInRange' || (o.type === 'biomassThreshold' && c.region.kind !== 'dish' && (o.params.measure !== undefined || o.params.fromBelow !== undefined));
  return {
    type: o.type,
    params: inject ? { ...o.params, region: regionIdOf(c.region) } : { ...o.params },
    ...(o.durationSeconds !== undefined ? { durationSeconds: o.durationSeconds } : {}),
  };
}

function regionProblem(raw: unknown): string | null {
  if (!isObj(raw)) return 'a challenge has an invalid region';
  if (raw.kind === 'dish') return Object.keys(raw).length === 1 ? null : 'a challenge has an invalid region';
  if (Object.keys(raw).some((k) => k !== 'kind' && k !== 'id')) return 'a challenge has an unknown region';
  if (raw.kind === 'habitat') return typeof raw.id === 'string' && HABITAT_REGION_ID.test(raw.id) ? null : 'a challenge has an unknown region';
  if (raw.kind !== 'quarter' || !includes(CHALLENGE_QUARTERS, raw.id)) return 'a challenge has an unknown region';
  return null;
}

/**
 * The first problem with the parts of a challenge the editor writes (everything but its id and baseline), or
 * null: typed values only. The objective is checked by the engine's predicate check (typedPredicate: the five
 * named types, never 'custom'; finite thresholds and durations above 0; known fields, regions, events and
 * enzymes), and a duration must fit in the turn.
 */
export function challengeInputProblem(raw: unknown): string | null {
  if (!isObj(raw)) return 'a challenge is not an object';
  for (const k of Object.keys(raw)) if (!INPUT_KEYS.includes(k)) return `a challenge has an unknown field "${k.slice(0, 40)}"`;
  if (typeof raw.name !== 'string' || raw.name.length === 0 || cleanChallengeName(raw.name) !== raw.name) return 'a challenge has an invalid name';
  const o = raw.objective;
  if (!isObj(o) || Object.keys(o).some((k) => !OBJECTIVE_KEYS.includes(k))) return 'a challenge has an invalid objective';
  if (o.type === 'custom') return 'a challenge uses the five named objective types only, never "custom"';
  if (!includes(OBJECTIVE_TYPES, o.type)) return `a challenge has an unknown objective type "${String(o.type).slice(0, 40)}"`;
  if (!isObj(o.params)) return 'a challenge has invalid objective values';
  for (const [k, v] of Object.entries(o.params)) {
    if (k === 'region') return 'a challenge keeps its region outside its objective';
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return 'a challenge has a number that is not finite';
    } else if (typeof v !== 'string' || !PARAM_ID.test(v)) return 'a challenge has an invalid objective value';
  }
  if (o.durationSeconds !== undefined && typeof o.durationSeconds !== 'number') return 'a challenge has an invalid duration';
  if (!(CHALLENGE_HORIZON_SECONDS as readonly unknown[]).includes(raw.horizonSeconds)) return 'a challenge has an invalid turn length';
  const region = regionProblem(raw.region);
  if (region) return region;
  const kind = (raw.region as ChallengeRegion).kind;
  // P5.6: a biomass challenge with a Phase 5 parameter (measure or fromBelow: Recover a neighborhood) may measure a
  // quarter or a habitat region; a field range a quarter. Every v1.0 shape keeps its rule (only a field range
  // measures a quarter), so a record refused before is refused still.
  const regional = o.type === 'biomassThreshold' && isObj(o.params) && (o.params.measure !== undefined || o.params.fromBelow !== undefined);
  if (o.type === 'fieldInRange' && kind === 'habitat') return 'a field-range challenge measures the dish or a quarter';
  if (o.type !== 'fieldInRange' && !regional && kind !== 'dish') return 'only a field-range challenge measures a quarter';
  const typed = typedPredicate(challengePredicate({ objective: o as unknown as ChallengeObjective, region: raw.region as ChallengeRegion }));
  if ('path' in typed) return `a challenge has an invalid objective (${typed.message})`;
  if (typeof o.durationSeconds === 'number' && o.durationSeconds > (raw.horizonSeconds as number)) return 'a challenge needs longer than its turn';
  if (!Array.isArray(raw.allowedTools) || raw.allowedTools.length > CHALLENGE_TOOL_GROUPS.length) return 'a challenge has an invalid tool list';
  const seen: string[] = [];
  for (const t of raw.allowedTools as unknown[]) {
    if (!includes(CHALLENGE_TOOL_GROUPS, t)) return `a challenge names an unknown tool group "${String(t).slice(0, 40)}"`;
    if (seen.includes(t)) return 'a challenge names a tool group twice';
    seen.push(t);
  }
  const b = raw.commandBudget;
  if (b !== null && !(isInt(b, CHALLENGE_BUDGET_MIN) && b <= CHALLENGE_BUDGET_MAX)) return `a challenge's action budget must be ${CHALLENGE_BUDGET_MIN}–${CHALLENGE_BUDGET_MAX} or none`;
  return null;
}

/** The first problem with one challenge record, or null. */
export function challengeProblem(raw: unknown): string | null {
  if (!isObj(raw)) return 'a challenge is not an object';
  for (const k of Object.keys(raw)) if (!RECORD_KEYS.includes(k)) return `a challenge has an unknown field "${k.slice(0, 40)}"`;
  if (challengeNumber(raw.id) === null) return 'a challenge has an invalid id';
  const b = raw.baseline;
  if (!isObj(b) || Object.keys(b).some((k) => !BASELINE_KEYS.includes(k))) return 'a challenge has an invalid baseline';
  if (typeof b.worldId !== 'string' || b.worldId.length === 0 || b.worldId.length > 200) return 'a challenge has an invalid baseline';
  if (!isInt(b.tick, 0)) return 'a challenge has an invalid baseline tick';
  if (typeof b.checksum !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(b.checksum)) return 'a challenge has an invalid baseline checksum';
  const { id: _id, baseline: _baseline, ...input } = raw;
  return challengeInputProblem(input);
}

/** The first problem with the challenges kind, or null (notebook.ts KIND_PROBLEMS.challenges; a missing key reads as []). */
export function challengesProblem(raw: unknown): string | null {
  if (!Array.isArray(raw)) return 'challenges is not a list';
  if (raw.length > CHALLENGES_MAX) return 'too many challenges';
  const ids: string[] = [];
  for (const c of raw as unknown[]) {
    const p = challengeProblem(c);
    if (p) return p;
    const id = (c as ChallengeRecord).id;
    if (ids.includes(id)) return 'two challenges share an id';
    ids.push(id);
  }
  return null;
}

/**
 * The first challenge the dish the file carries cannot run, or null: its objective must name only what the
 * dish recorded (objectiveRefsProblem: the recorded manifest, species and fields; a gate goal is never
 * supported before Phase 5). Without the manifest refs only the species are checked.
 */
export function challengesWorldProblem(raw: Record<string, unknown>, refs: GoalWorldRefs): string | null {
  for (const c of (raw.challenges ?? []) as readonly ChallengeRecord[]) {
    const pred = challengePredicate(c);
    const sp = pred.params.species;
    if (typeof sp === 'string' && !refs.speciesIds.includes(sp)) return 'a challenge names a species this dish does not have';
    if (refs.manifest !== undefined && refs.fieldIds !== undefined) {
      // P5.6: with the recorded habitat's regions (a habitat region the dish does not record is refused).
      const why = objectiveRefsProblem({ manifest: refs.manifest, speciesIds: refs.speciesIds, fieldIds: refs.fieldIds, ...(refs.regions !== undefined ? { regions: refs.regions } : {}) }, pred);
      if (why !== null) return `a challenge cannot run in this dish (${why})`;
    }
  }
  return null;
}

/** The dish's challenge records (an absent kind reads as []). */
export function challengesOf(record: { readonly challenges?: readonly ChallengeRecord[] }): readonly ChallengeRecord[] {
  return record.challenges ?? [];
}

/** The id the next challenge of this record gets. */
export function nextChallengeId(record: { readonly challenges?: readonly ChallengeRecord[] }): string {
  return `ch-${challengesOf(record).reduce((m, c) => Math.max(m, challengeNumber(c.id) ?? 0), 0) + 1}`;
}

/** "Export without names or notes" (D-0029): every challenge name becomes "Shared challenge". Unsealed. */
export function withoutChallengeNames<T extends { readonly challenges?: readonly ChallengeRecord[] }>(record: T): T {
  if (challengesOf(record).length === 0) return record;
  return { ...record, challenges: challengesOf(record).map((c) => ({ ...c, name: SHARED_CHALLENGE_NAME })) };
}

export const SHARED_CHALLENGE_NAME = 'Shared challenge';
