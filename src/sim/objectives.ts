/**
 * The objective engine (P4.4; SPEC §13.5; CT §10.5; D09 §6; D-0071 "Objectives are evaluated, never
 * enforced in the sim").
 *
 * An objective is one of five named predicates over what a dish records:
 *
 * - keepSpeciesAlive { species }, durationSeconds — at least one living SP at every tick from Start for
 *   the duration → completed; no living SP at any tick → ended, latched (a later Add Life does not revive
 *   the attempt: ArmObserver's extinctAt resets when members return, so the latch is this engine's own);
 * - biomassThreshold { species?, threshold } — living biomass of SP (all living biomass when no species
 *   is named) ≥ threshold → completed;
 * - transferAcrossGate { gate, field, threshold } — the quantity of `field` moved across the named gate
 *   since Start ≥ threshold → completed. This build has no gate structure (S01–S12 are Phase 5): the
 *   amount is read through an injected `GateReading`, and a world without such a gate is not supported
 *   (the goal is never offered there);
 * - observeEvent { event, species?, enzyme? } — 'birth': a committed division of SP since Start (the
 *   observer's births.SP, from history.pendingBirths, which only births.ts commitDivision counts; a
 *   blocked division or a drawn proposal that never commits is never a birth); 'conversion': carbon the
 *   named enzyme actually converted since Start (converted.<enzyme>; the 'conversion' EventType is never
 *   emitted, and enzyme presence is not conversion), with no producer named (D09); any other event type:
 *   a record of that type (and species) in the event ring since Start;
 * - fieldInRange { field, region?, min, max }, durationSeconds — the mean of field F over region R's
 *   playable cells (TRAIT_REGIONS: the dish, or a quarter by quarterOf) within [min, max] at every tick
 *   for the duration → completed. Leaving the range resets the hold; it never ends the attempt.
 *
 * Observation only, like GateWatch (src/sim/experiments.ts): `ObjectiveWatch` reads entity columns,
 * fields, the event ring and its own ArmObserver (the measurement grammar of src/sim/pairedRun.ts), draws
 * no randomness and never writes to a world. It is evaluated after EVERY tick (not at whole seconds), so a
 * birth that commits between a whole second and a save is never missed, and a watch resumed after a load
 * (durations from `holdSinceTick`; event-ring goals from the saved `lastEventId`, the last ring record the
 * watch has seen, so a record a command added between the last evaluated tick and the save is counted at
 * the next tick as it would have been; births and conversion from a fresh observer at the load tick)
 * completes at the same tick as an uninterrupted run. Nothing in the tick or its stages imports this file;
 * the per-dish runner and the goal state live in the worker (src/worker/goals.ts, notebook state, D-0070).
 *
 * Completion and end ticks are the dish's tick after the step that showed them (world.tick when the watch
 * evaluates): a birth committed while tick T ran is recorded at T + 1, the moment the dish shows it.
 *
 * Phase 5 (P5.6 part 3; D-0106 "Play prompts extend the five SPEC §13.5 predicates with parameters; no new
 * types"; D-0131). Every parameter is optional, so a v1.0 goal record types, evaluates and saves exactly as
 * before (the old code paths below are kept verbatim for the old shapes):
 *
 * - keepSpeciesAlive { species: id | id[], minCount?, region? | regions? (aligned with the list), or
 *   minSpecies? instead of species }: every clause true at a tick holds; falling below a count or leaving a
 *   region resets the hold (fieldInRange's rule); the attempt ENDS (latched) only when a named species has no
 *   living member anywhere in the dish; a minSpecies goal never ends;
 * - biomassThreshold { measure? 'biomass' | 'count' | 'activeCount', region?, fromBelow? }: Start is refused
 *   ("This region already has 5 or more active organisms.") when the measure already reaches fromBelow;
 * - observeEvent { all?: clauses, window? 'cycle', endOn? ['linkBroken' | 'externalInput'] }: every clause
 *   must be seen (in one light cycle with the window); the measured pseudo-events 'intake' (a species' intake
 *   grew), 'consumption' (feeding removed carbon from a pool) and 'transfer' (route 'fungal': carbon moved
 *   along F02 transport links) take `atLeast` (the amount since Start; default > 0). They are measured here,
 *   per tick, with the formulas of ArmObserver (src/sim/pairedRun.ts) through this watch's own read-only
 *   stage hook (`hook`), and saved as progress `amounts`, so a resumed watch counts what it had;
 * - a REGION is a region id of the WORLD's recorded habitat (world.content.habitat.regions; habitatRules.ts
 *   regionContains) or a TRAIT_REGIONS id; never this build's registry.
 */
import type { ContentRegistry } from './content/registry';
import type { HabitatDef, Manifest, ObjectiveDef, Species, StructureDef } from './content/schema';
import { CELL_COUNT, CYCLE_PERIOD_TICKS, TICKS_PER_SECOND } from './constants';
import type { EventType } from './events';
import { allocatedFieldIds, FIELD_DEFS, isFieldId, type FieldId } from './fields';
import { cellX, cellY, inMask, maskCells } from './grid';
import { quarterOf, TRAIT_REGIONS, type TraitRegion } from './history';
import { aliveCounts, ArmObserver, CONSUMABLE_POOLS, ENZYMES, poolTotal, type ConsumablePool, type Enzyme } from './pairedRun';
import { regionContains } from './content/habitatRules';
import { LIFE_ACTIVE } from './entities';
import { entityCell } from './spatial';
import type { World } from './world';

/** The five named predicate types an objective may use (PredicateSchema's 'custom' is for experiment gates only). */
export const OBJECTIVE_TYPES = ['keepSpeciesAlive', 'biomassThreshold', 'transferAcrossGate', 'observeEvent', 'fieldInRange'] as const;
export type ObjectiveType = (typeof OBJECTIVE_TYPES)[number];

/** Event types read from the event ring or their own measures ('birth' and 'conversion'); every EventType. */
export const OBJECTIVE_RING_EVENTS = [
  'birth',
  'death',
  'introduce',
  'mutation',
  'capture',
  'conversion',
  'stressOnset',
  'command',
  'capacity',
  'branchCandidate',
  'branchEstablished',
  'branchExtinct',
  'secretionStart',
  'firstIntake',
  'rest',
  'wake',
  'linkFormed',
  'linkBroken',
  'linkRefused',
  'objectEmptied',
  // Phase 5 (P5.6 part 3): every Phase 5 EventType.
  'glowOn',
  'glowOff',
  'modeSwitch',
  'handlingStart',
  'handlingBreak',
  'trapArmed',
  'trapHold',
  'trapRelease',
] as const satisfies readonly EventType[];

/**
 * P5.6 part 3: the measured pseudo-events (no event record exists for them): 'intake' (species required: the
 * species' intake grew), 'consumption' (pool required: feeding removed carbon from that pool), 'transfer'
 * (route 'fungal': carbon moved along F02 transport links). Each takes `atLeast` (the amount since Start).
 */
export const OBJECTIVE_MEASURED_EVENTS = ['intake', 'consumption', 'transfer'] as const;
export type MeasuredEvent = (typeof OBJECTIVE_MEASURED_EVENTS)[number];

/** Event types an observeEvent objective may name: every EventType, then the measured pseudo-events. */
export const OBJECTIVE_EVENTS = [...OBJECTIVE_RING_EVENTS, ...OBJECTIVE_MEASURED_EVENTS] as const;
export type ObjectiveEvent = (typeof OBJECTIVE_EVENTS)[number];

/** P5.6: what ends an observeEvent attempt besides its own completion (endOn). */
export const OBJECTIVE_END_ON = ['linkBroken', 'externalInput'] as const;
export type ObjectiveEndOn = (typeof OBJECTIVE_END_ON)[number];

/** P5.6: the measures a biomassThreshold may read. */
export const BIOMASS_MEASURES = ['biomass', 'count', 'activeCount'] as const;
export type BiomassMeasure = (typeof BIOMASS_MEASURES)[number];

/** P5.6: clauses an all-of goal may list. */
export const OBJECTIVE_CLAUSES_MAX = 8;

/** An objective's predicate as content records it (PredicateSchema). */
export type ObjectivePredicate = ObjectiveDef['predicate'];

/** One observeEvent clause (P5.6 `all`; a single-event goal is one clause). */
export interface EventClause {
  readonly event: ObjectiveEvent;
  readonly species: string | null;
  readonly enzyme: Enzyme | null;
  /** 'consumption' only. */
  readonly pool: ConsumablePool | null;
  /** 'transfer' only. */
  readonly route: 'fungal' | null;
  /** Measured clauses only: the amount since Start that counts (null: any amount above 0). */
  readonly atLeast: number | null;
}

/** The typed parameters of each predicate type (objectivePredicateProblem guarantees these shapes). */
export type TypedPredicate =
  | {
      readonly type: 'keepSpeciesAlive';
      /** The one species named (null: a list or minSpecies). */
      readonly species: string | null;
      readonly durationSeconds: number;
      /** P5.6: the species list (every one must hold). */
      readonly speciesList?: readonly string[];
      /** P5.6: members each species needs (default 1 = "count > 0"). */
      readonly minCount?: number;
      /** P5.6: one region for every species. */
      readonly region?: string;
      /** P5.6: one region per listed species (aligned). */
      readonly regions?: readonly string[];
      /** P5.6: at least this many species with living members (instead of species). */
      readonly minSpecies?: number;
    }
  | {
      readonly type: 'biomassThreshold';
      readonly species: string | null;
      readonly threshold: number;
      /** P5.6: what is measured (absent: living biomass, as v1.0). */
      readonly measure?: BiomassMeasure;
      readonly region?: string;
      /** P5.6: Start is refused when the measure is already at or above this. */
      readonly fromBelow?: number;
    }
  | { readonly type: 'transferAcrossGate'; readonly gate: string; readonly field: FieldId; readonly threshold: number }
  | {
      readonly type: 'observeEvent';
      /** The single event (null: an all-of goal). */
      readonly event: ObjectiveEvent | null;
      readonly species: string | null;
      readonly enzyme: Enzyme | null;
      /** P5.6, a single measured event: its pool, route and amount. */
      readonly pool?: ConsumablePool;
      readonly route?: 'fungal';
      readonly atLeast?: number;
      /** P5.6: every clause must be seen. */
      readonly all?: readonly EventClause[];
      /** P5.6: every clause within one light cycle. */
      readonly window?: 'cycle';
      /** P5.6: what ends the attempt. */
      readonly endOn?: readonly ObjectiveEndOn[];
    }
  | {
      readonly type: 'fieldInRange';
      readonly field: FieldId;
      readonly region: TraitRegion;
      readonly min: number;
      readonly max: number;
      readonly durationSeconds: number;
    };

export type ObjectiveState = 'running' | 'completed' | 'ended';

/** A watch's serializable progress (kept in the goal record; a running goal resumes from it after a load). */
export interface ObjectiveProgress {
  /** The dish tick at which Start armed the predicate. */
  readonly startTick: number;
  /** Duration predicates: the tick the current continuous hold began (null: not holding; always null for the others). */
  readonly holdSinceTick: number | null;
  readonly state: ObjectiveState;
  /**
   * Event-ring goals only (`usesEventRing`: an observeEvent naming a ring event, or ending on 'linkBroken'):
   * the id of the last event record the watch has seen. A resumed watch counts the records after it, so
   * a record a command added after the last evaluated tick is counted at the next tick, as uninterrupted.
   * Absent on a record written before it existed (then the watch resumes at the load moment).
   */
  readonly lastEventId?: number;
  /** P5.6, all-of goals only: the dish tick each clause was first seen (null: not yet). */
  readonly clauses?: readonly (number | null)[];
  /** P5.6, goals with a measured clause only: the amount each clause accumulated since Start (0 for the others). */
  readonly amounts?: readonly number[];
  /** P5.6, cycle-window goals only: the light-cycle index the clause ticks and amounts belong to. */
  readonly cycle?: number;
  /**
   * P5.6 (fix round 1), goals ending on 'externalInput' only: the ledger's external inputs [c, n, m] at Start, so
   * a resumed watch compares with the same base (an input added between ticks and saved before the next tick
   * still ends the attempt at that tick, as uninterrupted).
   */
  readonly inputs?: readonly [number, number, number];
}

/**
 * The quantity of a material moved across a gate (P4.4: no gate structure exists in this build; Phase 5
 * gates provide one). `transferred` is the cumulative amount of `field` moved across gate structure
 * `gate` in `world` so far, or null when the world has no such gate.
 */
export interface GateReading {
  transferred(world: World, gate: string, field: FieldId): number | null;
  /** Organism crossings through the dish's gates of that kind so far, or null when it has none (Phase 5 wave 11). */
  organisms?(world: World, gate: string): number | null;
}

/** The tally record of structure `id` in world.gateTally (sorted by id), or null. Read only. */
function gateTallyRecord(world: World, id: number): World['gateTally'][number] | null {
  const list = world.gateTally;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid]!.id < id) lo = mid + 1;
    else hi = mid;
  }
  const t = list[lo];
  return t !== undefined && t.id === id ? t : null;
}

/**
 * The dish's own gates (Phase 5 wave 11; D-0108, D-0117, D-0119): a gate is an edge structure kind
 * ('S01' … 'S04', as the objective record names it). With no edge barrier of that kind in world.edges
 * the dish has no such gate (null). Otherwise the reading is the sum, over the current edges of that kind
 * in store order, of world.gateTally's cumulative amount (|flux| in either direction, field units; 0 for
 * an edge or a field without an amount). Removing a gate removes its share. Observation only: it reads
 * the saved, never-hashed tally and writes nothing.
 */
export const WORLD_GATES: GateReading = {
  transferred(world: World, gate: string, field: FieldId): number | null {
    let found = false;
    let sum = 0;
    for (const e of world.edges) {
      if (e.kind !== gate) continue;
      found = true;
      sum += gateTallyRecord(world, e.id)?.fields[field] ?? 0;
    }
    return found ? sum : null;
  },
  organisms(world: World, gate: string): number | null {
    let found = false;
    let sum = 0;
    for (const e of world.edges) {
      if (e.kind !== gate) continue;
      found = true;
      sum += gateTallyRecord(world, e.id)?.organisms ?? 0;
    }
    return found ? sum : null;
  },
};

export interface ObjectiveProblem {
  /** Path inside the objective record, e.g. 'predicate.params.species'. */
  readonly path: string;
  readonly message: string;
}

/** What an objective's references are checked against (the content packs being validated). */
export interface ObjectiveValidationContext {
  readonly species: Readonly<Record<string, Species>>;
  readonly structures: Readonly<Record<string, StructureDef>>;
  readonly recipes: Readonly<Record<string, unknown>>;
  /** The build's manifest; null when it did not parse (then only the shapes are checked). */
  readonly manifest: Manifest | null;
  /** P5.6: the habitat records (offerOnHabitats and the regions an objective names); absent: not checked. */
  readonly habitats?: Readonly<Record<string, HabitatDef>>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const posFinite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const includes = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
/** A region id as a predicate names it: a TRAIT_REGIONS id or a habitat region id (HabitatRegionSchema's pattern). */
const REGION_ID = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SPECIES_ID = /^[A-Z][A-Z0-9_]{0,31}$/;

/** The params keys each type accepts (an unknown key is a problem: a typo must never silently mean "any"). */
const PARAM_KEYS: Readonly<Record<ObjectiveType, readonly string[]>> = {
  keepSpeciesAlive: ['species', 'minCount', 'region', 'regions', 'minSpecies'],
  biomassThreshold: ['species', 'threshold', 'measure', 'region', 'fromBelow'],
  transferAcrossGate: ['gate', 'field', 'threshold'],
  observeEvent: ['event', 'species', 'enzyme', 'pool', 'route', 'atLeast', 'all', 'window', 'endOn'],
  fieldInRange: ['field', 'region', 'min', 'max'],
};
const CLAUSE_KEYS = ['event', 'species', 'enzyme', 'pool', 'route', 'atLeast'];
const NEEDS_DURATION: readonly ObjectiveType[] = ['keepSpeciesAlive', 'fieldInRange'];

/** The predicate types that hold for a duration (the only ones whose progress carries a holdSinceTick). */
export function holdsForDuration(type: string): boolean {
  return (NEEDS_DURATION as readonly string[]).includes(type);
}

const isMeasured = (e: ObjectiveEvent): e is MeasuredEvent => (OBJECTIVE_MEASURED_EVENTS as readonly string[]).includes(e);
/** A clause read from the event ring (every event but 'birth', 'conversion' and the measured pseudo-events). */
const isRingClause = (c: EventClause): boolean => c.event !== 'birth' && c.event !== 'conversion' && !isMeasured(c.event);

/** The clauses an observeEvent goal evaluates (its `all`, or its one event). */
export function eventClauses(t: Extract<TypedPredicate, { type: 'observeEvent' }>): readonly EventClause[] {
  if (t.all) return t.all;
  return [{ event: t.event!, species: t.species, enzyme: t.enzyme, pool: t.pool ?? null, route: t.route ?? null, atLeast: t.atLeast ?? null }];
}

/** True for a v1.0-shaped observeEvent (one non-measured event, no window, no endOn): it runs exactly as v1.0. */
function isPlainEvent(t: Extract<TypedPredicate, { type: 'observeEvent' }>): boolean {
  return t.all === undefined && t.window === undefined && t.endOn === undefined && t.event !== null && !isMeasured(t.event);
}

/**
 * An observeEvent goal that reads the event ring (and so saves `lastEventId`): a v1.0 single event other than
 * 'birth' and 'conversion', and (P5.6) any goal with a ring clause or ending on 'linkBroken'.
 */
export function usesEventRing(t: TypedPredicate): boolean {
  if (t.type !== 'observeEvent') return false;
  if (isPlainEvent(t)) return t.event !== 'birth' && t.event !== 'conversion';
  return eventClauses(t).some(isRingClause) || (t.endOn ?? []).includes('linkBroken');
}

/** P5.6: the progress keys a predicate's record carries besides v1.0's (absent for every v1.0 shape). */
export function progressKeysOf(t: TypedPredicate): { readonly clauses: number | null; readonly amounts: number | null; readonly cycle: boolean; readonly inputs: boolean } {
  if (t.type !== 'observeEvent') return { clauses: null, amounts: null, cycle: false, inputs: false };
  const cl = eventClauses(t);
  return { clauses: t.all ? cl.length : null, amounts: cl.some((c) => isMeasured(c.event)) ? cl.length : null, cycle: t.window === 'cycle', inputs: (t.endOn ?? []).includes('externalInput') };
}

/** One clause's typed form, or its first problem (`path` is the clause's path, e.g. 'predicate.params.all.2'). */
function clauseOf(raw: Readonly<Record<string, unknown>>, path: string): EventClause | ObjectiveProblem {
  const bad = (key: string, message: string): ObjectiveProblem => ({ path: `${path}.${key}`, message });
  const ev = raw.event;
  if (!includes(OBJECTIVE_EVENTS, ev)) return bad('event', `unknown event type "${String(ev)}"`);
  const sp = raw.species;
  if (sp !== undefined && (typeof sp !== 'string' || !SPECIES_ID.test(sp))) return bad('species', 'a species id is a string such as "B01"');
  const species = (sp) ?? null;
  let enzyme: Enzyme | null = null;
  let pool: ConsumablePool | null = null;
  let route: 'fungal' | null = null;
  if (ev === 'conversion') {
    if (!includes(ENZYMES, raw.enzyme)) return bad('enzyme', `unknown enzyme "${String(raw.enzyme)}" (${ENZYMES.join(', ')})`);
    // D09 "Do not invent a producer attribution": the reaction ledger counts converted carbon, not who made it.
    if (species !== null) return bad('species', 'a conversion goal names no producer species');
    enzyme = raw.enzyme;
  } else if (raw.enzyme !== undefined) return bad('enzyme', 'only a conversion goal names an enzyme');
  if (ev === 'intake' && species === null) return bad('species', 'an intake clause needs a species id');
  if (ev === 'consumption') {
    if (!includes(CONSUMABLE_POOLS, raw.pool)) return bad('pool', `unknown pool "${String(raw.pool)}" (${CONSUMABLE_POOLS.join(', ')})`);
    if (species !== null) return bad('species', 'a consumption clause measures a pool, not a species');
    pool = raw.pool;
  } else if (raw.pool !== undefined) return bad('pool', 'only a consumption clause names a pool');
  if (ev === 'transfer') {
    if (raw.route !== 'fungal') return bad('route', `unknown transfer route "${String(raw.route)}" (fungal)`);
    if (species !== null) return bad('species', 'a transfer clause measures a route, not a species');
    route = 'fungal';
  } else if (raw.route !== undefined) return bad('route', 'only a transfer clause names a route');
  let atLeast: number | null = null;
  if (raw.atLeast !== undefined) {
    if (!isMeasured(ev)) return bad('atLeast', 'only a measured clause (intake, consumption, transfer) takes atLeast');
    if (!posFinite(raw.atLeast)) return bad('atLeast', 'atLeast must be a finite number above 0');
    atLeast = raw.atLeast;
  }
  return { event: ev, species, enzyme, pool, route, atLeast };
}

/** A region parameter: a TRAIT_REGIONS id or a habitat region id (checked against a world or the habitats later). */
const regionOk = (v: unknown): v is string => typeof v === 'string' && REGION_ID.test(v);

/**
 * The predicate's typed form, or the first problem with its shape (types, numbers, names): the checks
 * that need no content. Never throws.
 */
export function typedPredicate(pred: { readonly type: string; readonly params: Readonly<Record<string, unknown>>; readonly durationSeconds?: number | undefined }): TypedPredicate | ObjectiveProblem {
  const bad = (key: string, message: string): ObjectiveProblem => ({ path: key === 'durationSeconds' ? 'predicate.durationSeconds' : `predicate.params.${key}`, message });
  if (pred.type === 'custom') return { path: 'predicate.type', message: 'objectives use the five named predicate types only, never "custom"' };
  if (!includes(OBJECTIVE_TYPES, pred.type)) return { path: 'predicate.type', message: `unknown predicate type "${pred.type}"` };
  const type = pred.type;
  const p = isObj(pred.params) ? pred.params : {};
  for (const k of Object.keys(p)) if (!PARAM_KEYS[type].includes(k)) return bad(k, `${type} has no parameter "${k}"`);
  const d = pred.durationSeconds;
  if (NEEDS_DURATION.includes(type)) {
    if (!posFinite(d)) return bad('durationSeconds', `${type} needs a finite durationSeconds above 0`);
  } else if (d !== undefined) return bad('durationSeconds', `${type} takes no durationSeconds`);
  const speciesOf = (required: boolean): string | null | ObjectiveProblem => {
    const s = p.species;
    if (s === undefined && !required) return null;
    if (typeof s !== 'string' || s.length === 0) return bad('species', `${type} needs a species id`);
    return s;
  };
  const isProblem = (v: unknown): v is ObjectiveProblem => isObj(v) && typeof v.path === 'string';
  switch (type) {
    case 'keepSpeciesAlive': {
      const extra: { speciesList?: string[]; minCount?: number; region?: string; regions?: string[]; minSpecies?: number } = {};
      let species: string | null = null;
      if (p.minSpecies !== undefined) {
        if (p.species !== undefined) return bad('minSpecies', 'minSpecies replaces species: name one or the other');
        if (!isInt(p.minSpecies, 2) || p.minSpecies > 64) return bad('minSpecies', 'minSpecies must be a whole number from 2 to 64');
        if (p.regions !== undefined) return bad('regions', 'regions are aligned with a species list; a minSpecies goal takes one region');
        extra.minSpecies = p.minSpecies;
      } else if (Array.isArray(p.species)) {
        const list = p.species as unknown[];
        if (list.length === 0 || list.length > 8) return bad('species', 'a species list names 1 to 8 species');
        for (const s of list) if (typeof s !== 'string' || !SPECIES_ID.test(s)) return bad('species', 'a species list holds species ids such as "B01"');
        if (list.some((x, i) => list.indexOf(x) !== i)) return bad('species', 'a species list names a species twice');
        extra.speciesList = list as string[];
      } else {
        const s = speciesOf(true);
        if (isProblem(s)) return s;
        species = s;
      }
      if (p.minCount !== undefined) {
        if (!isInt(p.minCount, 1) || p.minCount > 100_000) return bad('minCount', 'minCount must be a whole number of at least 1');
        extra.minCount = p.minCount;
      }
      if (p.region !== undefined) {
        if (p.regions !== undefined) return bad('regions', 'name one region or a region per species, not both');
        if (!regionOk(p.region)) return bad('region', `invalid region ${JSON.stringify(p.region)}`);
        extra.region = p.region;
      }
      if (p.regions !== undefined) {
        if (!extra.speciesList) return bad('regions', 'regions are aligned with a species list');
        const r = p.regions;
        if (!Array.isArray(r) || r.length !== extra.speciesList.length) return bad('regions', 'regions must list one region per species');
        for (const x of r as unknown[]) if (!regionOk(x)) return bad('regions', `invalid region ${JSON.stringify(x)}`);
        extra.regions = r as string[];
      }
      return { type, species, durationSeconds: d!, ...extra };
    }
    case 'biomassThreshold': {
      const species = speciesOf(false);
      if (isProblem(species)) return species;
      if (!posFinite(p.threshold)) return bad('threshold', 'threshold must be a finite number above 0');
      const extra: { measure?: BiomassMeasure; region?: string; fromBelow?: number } = {};
      if (p.measure !== undefined) {
        if (!includes(BIOMASS_MEASURES, p.measure)) return bad('measure', `unknown measure ${JSON.stringify(p.measure)} (${BIOMASS_MEASURES.join(', ')})`);
        extra.measure = p.measure;
      }
      if (p.region !== undefined) {
        if (!regionOk(p.region)) return bad('region', `invalid region ${JSON.stringify(p.region)}`);
        extra.region = p.region;
      }
      if (p.fromBelow !== undefined) {
        if (!isInt(p.fromBelow, 1)) return bad('fromBelow', 'fromBelow must be a whole number of at least 1');
        if (p.fromBelow > p.threshold) return bad('fromBelow', 'fromBelow cannot be above the threshold');
        extra.fromBelow = p.fromBelow;
      }
      return { type, species, threshold: p.threshold, ...extra };
    }
    case 'transferAcrossGate': {
      if (typeof p.gate !== 'string' || p.gate.length === 0) return bad('gate', 'transferAcrossGate needs a gate structure id');
      if (typeof p.field !== 'string' || !isFieldId(p.field)) return bad('field', `unknown field "${String(p.field)}"`);
      if (!posFinite(p.threshold)) return bad('threshold', 'threshold must be a finite number above 0');
      return { type, gate: p.gate, field: p.field, threshold: p.threshold };
    }
    case 'observeEvent': {
      const extra: { all?: EventClause[]; window?: 'cycle'; endOn?: ObjectiveEndOn[] } = {};
      if (p.window !== undefined) {
        if (p.window !== 'cycle') return bad('window', `unknown window ${JSON.stringify(p.window)} (cycle)`);
        extra.window = 'cycle';
      }
      if (p.endOn !== undefined) {
        const e = p.endOn;
        if (!Array.isArray(e) || e.length === 0) return bad('endOn', 'endOn lists linkBroken and/or externalInput');
        for (const x of e as unknown[]) if (!includes(OBJECTIVE_END_ON, x)) return bad('endOn', `unknown end "${String(x)}" (${OBJECTIVE_END_ON.join(', ')})`);
        if ((e as unknown[]).some((x, i) => e.indexOf(x) !== i)) return bad('endOn', 'endOn names an end twice');
        extra.endOn = e as ObjectiveEndOn[];
      }
      if (p.all !== undefined) {
        for (const k of ['event', 'species', 'enzyme', 'pool', 'route', 'atLeast']) if (p[k] !== undefined) return bad(k, `an all-of goal names its clauses in "all", not "${k}"`);
        const all = p.all;
        if (!Array.isArray(all) || all.length === 0 || all.length > OBJECTIVE_CLAUSES_MAX) return bad('all', `all lists 1 to ${OBJECTIVE_CLAUSES_MAX} clauses`);
        const out: EventClause[] = [];
        for (const [i, raw] of (all as unknown[]).entries()) {
          const path = `predicate.params.all.${i}`;
          if (!isObj(raw)) return { path, message: 'a clause is an object with an event' };
          for (const k of Object.keys(raw)) if (!CLAUSE_KEYS.includes(k)) return { path: `${path}.${k}`, message: `a clause has no parameter "${k}"` };
          const c = clauseOf(raw, path);
          if (isProblem(c)) return c;
          out.push(c);
        }
        extra.all = out;
        return { type, event: null, species: null, enzyme: null, ...extra };
      }
      if (!includes(OBJECTIVE_EVENTS, p.event)) return bad('event', `unknown event type "${String(p.event)}"`);
      const c = clauseOf(p, 'predicate.params');
      if (isProblem(c)) return c;
      return {
        type,
        event: c.event,
        species: c.species,
        enzyme: c.enzyme,
        ...(c.pool !== null ? { pool: c.pool } : {}),
        ...(c.route !== null ? { route: c.route } : {}),
        ...(c.atLeast !== null ? { atLeast: c.atLeast } : {}),
        ...extra,
      };
    }
    case 'fieldInRange': {
      if (typeof p.field !== 'string' || !isFieldId(p.field)) return bad('field', `unknown field "${String(p.field)}"`);
      const region = p.region === undefined ? 'dish' : p.region;
      if (!includes(TRAIT_REGIONS, region)) return bad('region', `unknown region ${JSON.stringify(region)} (${TRAIT_REGIONS.join(', ')})`);
      if (!finite(p.min) || !finite(p.max)) return bad('min', 'min and max must be finite numbers');
      if (p.min < 0 || p.max < p.min) return bad('max', 'the range must satisfy 0 ≤ min ≤ max');
      return { type, field: p.field, region, min: p.min, max: p.max, durationSeconds: d! };
    }
  }
}

function isProblem(v: TypedPredicate | ObjectiveProblem): v is ObjectiveProblem {
  return 'path' in v;
}

/** Every species a typed predicate names (lists and clauses included), in order, without repeats. */
export function speciesNamed(t: TypedPredicate): string[] {
  const out: string[] = [];
  const add = (s: string | null | undefined) => {
    if (s && !out.includes(s)) out.push(s);
  };
  if (t.type === 'keepSpeciesAlive') {
    add(t.species);
    for (const s of t.speciesList ?? []) add(s);
  } else if (t.type === 'biomassThreshold') add(t.species);
  else if (t.type === 'observeEvent') for (const c of eventClauses(t)) add(c.species);
  return out;
}

/** Every region a typed predicate names (TRAIT_REGIONS ids included), without repeats. */
export function regionsNamed(t: TypedPredicate): string[] {
  const out: string[] = [];
  const add = (r: string | undefined) => {
    if (r !== undefined && !out.includes(r)) out.push(r);
  };
  if (t.type === 'keepSpeciesAlive') {
    add(t.region);
    for (const r of t.regions ?? []) add(r);
  } else if (t.type === 'biomassThreshold') add(t.region);
  else if (t.type === 'fieldInRange') add(t.region);
  return out;
}

/** Whether a typed predicate can end (its attempt can stop before completing): it then needs `endedText`. */
export function predicateCanEnd(t: TypedPredicate): boolean {
  if (t.type === 'keepSpeciesAlive') return t.minSpecies === undefined;
  return t.type === 'observeEvent' && (t.endOn?.length ?? 0) > 0;
}

/** A content habitat's region ids (none recorded: []). */
const habitatRegionIds = (h: Pick<HabitatDef, 'regions'>): string[] => (h.regions ?? []).map((r) => r.id);
const isTraitRegion = (r: string): boolean => (TRAIT_REGIONS as readonly string[]).includes(r);

/**
 * The first problem with an objective record, or null (src/sim/content/registry.ts validateContent):
 * typed params (an unknown species, field, region, enzyme or event type; a non-finite or ≤ 0 duration or
 * threshold; 'custom'), its texts (a predicate that can end needs `endedText`), its `offerOn` recipes,
 * and — for an objective this build ships (phase ≤ buildPhase) — that the manifest enables what it
 * names: the species, the field's system, the enzymes system and STARCH-like enzyme food, and for
 * transferAcrossGate an enabled edge structure (a gate). An objective of a later phase is skipped after
 * its shape: it is not offered, and the content it names may not exist yet.
 *
 * P5.6: `offerOnHabitats` names known habitats (a shipped objective: enabled ones); a region the predicate
 * names exists in every habitat it is offered on (offerOnHabitats, and each offerOn recipe's habitat); a cycle
 * window is offered only where the habitat (or the recipe) runs the light cycle; an objective with a
 * `challengeTemplate` is offered only as a challenge starting point (no offerOn, no offerOnHabitats).
 */
export function objectivePredicateProblem(def: ObjectiveDef, ctx: ObjectiveValidationContext): ObjectiveProblem | null {
  const t = typedPredicate(def.predicate);
  if (isProblem(t)) return t;
  if (predicateCanEnd(t) && def.endedText === undefined) return { path: 'endedText', message: `${/^[aeiou]/.test(t.type) ? 'an' : 'a'} ${t.type} goal can end, so it needs endedText` };
  for (const [i, r] of def.offerOn.entries()) if (ctx.recipes[r] === undefined) return { path: `offerOn.${i}`, message: `unknown recipe "${r}"` };
  const onHabitats = def.offerOnHabitats ?? [];
  if (def.challengeTemplate !== undefined && (def.offerOn.length > 0 || onHabitats.length > 0))
    return { path: 'challengeTemplate', message: 'an objective with a challengeTemplate is a challenge starting point: it is never offered as a goal (no offerOn, no offerOnHabitats)' };
  const tools = def.challengeTemplate?.allowedTools ?? [];
  if (tools.some((x, i) => tools.indexOf(x) !== i)) return { path: 'challengeTemplate.allowedTools', message: 'a challengeTemplate names a tool group twice' };
  const habitats = ctx.habitats;
  if (habitats !== undefined) {
    for (const [i, h] of onHabitats.entries()) if (habitats[h] === undefined) return { path: `offerOnHabitats.${i}`, message: `unknown habitat "${h}"` };
    // Where it is offered: each named habitat, and each offerOn recipe's habitat (with the recipe's light mode).
    const places: { path: string; habitat: HabitatDef; cycle: boolean }[] = [];
    for (const [i, h] of onHabitats.entries()) places.push({ path: `offerOnHabitats.${i}`, habitat: habitats[h]!, cycle: (habitats[h]!.lightMode ?? 'fixed') === 'cycle' });
    for (const [i, id] of def.offerOn.entries()) {
      const r = ctx.recipes[id] as { readonly habitatId?: string; readonly lightMode?: string } | undefined;
      const h = r?.habitatId !== undefined ? habitats[r.habitatId] : undefined;
      if (h !== undefined) places.push({ path: `offerOn.${i}`, habitat: h, cycle: (r?.lightMode ?? h.lightMode ?? 'fixed') === 'cycle' });
    }
    for (const region of regionsNamed(t)) {
      if (isTraitRegion(region)) continue;
      if (places.length === 0 && def.challengeTemplate === undefined) return { path: 'predicate.params.region', message: `region "${region}" needs a habitat that records it (offerOnHabitats)` };
      for (const pl of places) if (!habitatRegionIds(pl.habitat).includes(region)) return { path: pl.path, message: `habitat "${pl.habitat.id}" has no region "${region}"` };
    }
    if (t.type === 'observeEvent' && t.window === 'cycle') for (const pl of places) if (!pl.cycle) return { path: pl.path, message: `a cycle-window goal needs the light cycle, and "${pl.habitat.id}" runs fixed light` };
  }
  const m = ctx.manifest;
  if (m === null || def.phase > m.buildPhase) return null;
  for (const sp of speciesNamed(t)) {
    const path = t.type === 'observeEvent' && t.all ? 'predicate.params.all' : 'predicate.params.species';
    if (ctx.species[sp] === undefined) return { path, message: `unknown species "${sp}"` };
    if (!m.enabledSpecies.includes(sp)) return { path, message: `"${sp}" is not enabled in this build` };
  }
  if (t.type === 'fieldInRange' || t.type === 'transferAcrossGate') {
    const sys = FIELD_DEFS[t.field].system;
    if (sys !== 'core' && !m.enabledSystems.includes(sys)) return { path: 'predicate.params.field', message: `field "${t.field}" needs the "${sys}" system (not in enabledSystems)` };
  }
  if (t.type === 'observeEvent') {
    for (const c of eventClauses(t)) {
      if (c.event === 'conversion' && !m.enabledSystems.includes('enzymes'))
        return { path: t.all ? 'predicate.params.all' : 'predicate.params.enzyme', message: 'a conversion goal needs the "enzymes" system (not in enabledSystems)' };
      if (c.pool !== null) {
        const sys = FIELD_DEFS[c.pool].system;
        if (sys !== 'core' && !m.enabledSystems.includes(sys)) return { path: 'predicate.params.all', message: `pool "${c.pool}" needs the "${sys}" system (not in enabledSystems)` };
      }
    }
  }
  if (t.type === 'transferAcrossGate') {
    const st = ctx.structures[t.gate];
    if (st === undefined || st.kind !== 'edge' || !(m.enabledStructures ?? []).includes(t.gate))
      return { path: 'predicate.params.gate', message: `no enabled gate structure provides "${t.gate}"` };
  }
  for (const [i, h] of onHabitats.entries()) if (!m.enabledHabitats.includes(h)) return { path: `offerOnHabitats.${i}`, message: `habitat "${h}" is not enabled in this build` };
  return null;
}

/** The objectives this build ships (phase ≤ build phase), in id order. */
export function objectiveCatalog(registry: ContentRegistry): ObjectiveDef[] {
  return registry.objectiveIds.map((id) => registry.objectives[id]!).filter((o) => o.phase <= registry.manifest.buildPhase);
}

/** The enzyme each conversion measure's food is, by material record id (the starch goal also needs STARCH recorded). */
const ENZYME_MATERIAL: Readonly<Record<Enzyme, string>> = { starch: 'STARCH', oil: 'OIL', protein: 'PROTEIN' };

/**
 * Why a dish recorded under `m` could not run the predicate, or null: the manifest must enable what the
 * predicate names (the species; the field's system; for a conversion goal the enzymes system and the
 * enzyme's food material). A gate goal is never supported without a reader (`objectiveSupportProblem`).
 * The Play card asks this of the shipped manifest before a dish exists.
 */
export function objectiveManifestProblem(m: Manifest, pred: ObjectivePredicate): string | null {
  const t = typedPredicate(pred);
  if (isProblem(t)) return t.message;
  for (const sp of speciesNamed(t)) if (!m.enabledSpecies.includes(sp)) return `this dish has no ${sp}`;
  if (t.type === 'fieldInRange' || t.type === 'transferAcrossGate') {
    const sys = FIELD_DEFS[t.field].system;
    if (sys !== 'core' && !m.enabledSystems.includes(sys)) return `this dish has no ${t.field}`;
  }
  if (t.type === 'observeEvent') {
    for (const c of eventClauses(t)) {
      if (c.event === 'conversion') {
        if (!m.enabledSystems.includes('enzymes')) return 'this dish has no enzymes';
        if (!m.enabledMaterials.includes(ENZYME_MATERIAL[c.enzyme!])) return `this dish has no ${c.enzyme}`;
      }
      if (c.pool !== null) {
        const sys = FIELD_DEFS[c.pool].system;
        if (sys !== 'core' && !m.enabledSystems.includes(sys)) return `this dish has no ${c.pool}`;
      }
    }
  }
  if (t.type === 'transferAcrossGate') return 'this dish has no such gate';
  return null;
}

/** What a dish recorded that decides which predicates it can run (plain values: a save's notebook check uses them too). */
export interface ObjectiveWorldRefs {
  /** The dish's own recorded manifest (world.content.manifest). */
  readonly manifest: Manifest;
  /** world.species ids. */
  readonly speciesIds: readonly string[];
  /** The fields the dish allocated (allocatedFieldIds(world.fields)). */
  readonly fieldIds: readonly string[];
  /** P5.6: the region ids of the dish's recorded habitat (absent: regions are not checked). */
  readonly regions?: readonly string[];
  /** P5.6: whether the dish runs the light cycle (absent: not checked). */
  readonly cycle?: boolean;
}

/** `world`'s ObjectiveWorldRefs. */
export function objectiveWorldRefsOf(world: World): ObjectiveWorldRefs {
  return {
    manifest: world.content.manifest,
    speciesIds: world.species.map((s) => s.id),
    fieldIds: allocatedFieldIds(world.fields),
    regions: habitatRegionIds(world.content.habitat),
    cycle: worldCycles(world),
  };
}

/** Whether the world runs the light cycle now (lightMode 'cycle' with its recorded start). */
function worldCycles(world: World): boolean {
  return world.settings.lightMode === 'cycle' && world.settings.cycleStartTick !== undefined;
}

/**
 * Why a dish with `refs` cannot run the predicate, or null when it can (objectiveSupportProblem without a
 * gate reader, so a gate goal is never supported here): the recorded manifest must have everything the
 * predicate names (objectiveManifestProblem), and its species and fields must be in the dish. A save's
 * notebook check refuses a running goal with any such problem (src/persistence/notebookGoals.ts).
 * P5.6: a habitat region the dish does not record, and a cycle window on a dish without the light cycle.
 */
export function objectiveRefsProblem(refs: ObjectiveWorldRefs, pred: ObjectivePredicate): string | null {
  const t = typedPredicate(pred);
  if (isProblem(t)) return t.message;
  if (t.type === 'transferAcrossGate') return refs.fieldIds.includes(t.field) ? 'this dish has no such gate' : `this dish has no ${t.field}`;
  const m = objectiveManifestProblem(refs.manifest, pred);
  if (m !== null) return m;
  for (const sp of speciesNamed(t)) if (!refs.speciesIds.includes(sp)) return `this dish has no ${sp}`;
  if (t.type === 'fieldInRange' && !refs.fieldIds.includes(t.field)) return `this dish has no ${t.field}`;
  if (t.type === 'observeEvent') for (const c of eventClauses(t)) if (c.pool !== null && !refs.fieldIds.includes(c.pool)) return `this dish has no ${c.pool}`;
  if (refs.regions !== undefined) for (const r of regionsNamed(t)) if (!isTraitRegion(r) && !refs.regions.includes(r)) return `this dish has no region ${r}`;
  if (refs.cycle !== undefined && t.type === 'observeEvent' && t.window === 'cycle' && !refs.cycle) return 'this dish has no light cycle';
  return null;
}

/**
 * Why `world` cannot run the predicate, or null when it can: the world's own recorded manifest must have
 * everything the predicate names (objectiveManifestProblem), its species and fields must be in the world,
 * and a gate goal needs a gate the reader finds. Never a build constant, so an old save is offered only
 * what it recorded. P5.6: a region must be one of the world's recorded habitat (or a TRAIT_REGIONS id), with
 * its label in the message when known; a cycle window needs the dish's light cycle.
 */
export function objectiveSupportProblem(world: World, pred: ObjectivePredicate, gates: GateReading | null = WORLD_GATES, checkCycle = true): string | null {
  const t = typedPredicate(pred);
  if (isProblem(t)) return t.message;
  if (t.type === 'transferAcrossGate') {
    if (world.fields[t.field] === undefined) return `this dish has no ${t.field}`;
    return gates === null || gates.transferred(world, t.gate, t.field) === null ? 'this dish has no such gate' : null;
  }
  const all = objectiveWorldRefsOf(world);
  const { cycle: _cycle, ...refs } = all;
  return objectiveRefsProblem(checkCycle ? all : refs, pred);
}

/** P5.6: a Start that a precondition refuses (biomassThreshold's fromBelow); the message is the player's sentence. */
export class ObjectiveStartRefusal extends Error {}

/** The words for fromBelow's refusal ("This region already has 5 or more active organisms."). */
export function fromBelowText(t: Extract<TypedPredicate, { type: 'biomassThreshold' }>): string {
  const where = t.region === undefined || t.region === 'dish' ? 'This dish' : 'This region';
  const n = t.fromBelow!;
  const what = t.measure === 'activeCount' ? 'active organisms' : t.measure === 'count' ? 'living organisms' : 'carbon of living biomass';
  return `${where} already has ${n} or more ${what}.`;
}

/**
 * Why a Start of `pred` on `world` now is refused by its own precondition, or null (P5.6: a fromBelow
 * goal whose measure already reaches fromBelow). Read-only. The challenge editor asks this of its baseline.
 */
export function objectiveStartProblem(world: World, pred: ObjectivePredicate): string | null {
  const t = typedPredicate(pred);
  if (isProblem(t) || t.type !== 'biomassThreshold' || t.fromBelow === undefined) return null;
  if (objectiveSupportProblem(world, pred) !== null) return null;
  return biomassMeasure(world, t, regionMask(world, t.region ?? 'dish')) >= t.fromBelow ? fromBelowText(t) : null;
}

/** The playable cells of each TRAIT_REGIONS region (dish; then the four quarters by quarterOf). */
let regionCells: Int32Array[] | null = null;
function cellsOf(region: TraitRegion): Int32Array {
  if (!regionCells) {
    const mask = maskCells();
    const quarters: number[][] = [[], [], [], []];
    for (const cell of mask) quarters[quarterOf(cellX(cell), cellY(cell)) - 1]!.push(cell);
    regionCells = [mask, ...quarters.map((q) => Int32Array.from(q))];
  }
  return regionCells[TRAIT_REGIONS.indexOf(region)]!;
}

/** The mean of field `field` over region `region`'s playable cells (0 when the world has no such field). */
export function regionMean(world: World, field: FieldId, region: TraitRegion): number {
  const arr = world.fields[field];
  if (!arr) return 0;
  const cells = cellsOf(region);
  let s = 0;
  for (let k = 0; k < cells.length; k++) s += arr[cells[k]!]!;
  return s / cells.length;
}

/**
 * P5.6: 1 per cell of region `id` (CELL_COUNT): a TRAIT_REGIONS region's playable cells, or a region of the
 * WORLD's recorded habitat (habitatRules.ts regionContains: inside its shape and the dish). Null when the world
 * records no such region (objectiveSupportProblem refuses such a predicate first).
 */
export function regionMask(world: World, id: string): Uint8Array | null {
  const mask = new Uint8Array(CELL_COUNT);
  if (isTraitRegion(id)) {
    for (const cell of cellsOf(id as TraitRegion)) mask[cell] = 1;
    return mask;
  }
  const def = (world.content.habitat.regions ?? []).find((r) => r.id === id);
  if (def === undefined) return null;
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    const x = cellX(cell);
    const y = cellY(cell);
    if (inMask(x, y) && regionContains(def, x, y)) mask[cell] = 1;
  }
  return mask;
}

/** Living biomass of species index `sp` (all living biomass when sp < 0). */
function livingBiomass(world: World, sp: number): number {
  const c = world.ents.cols;
  let s = 0;
  for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && (sp < 0 || c.species[i] === sp)) s += c.B[i]!;
  return s;
}

/** P5.6 biomassThreshold measures: biomass, living count or Active count of a species (or all) inside `mask`. */
function biomassMeasure(world: World, t: Extract<TypedPredicate, { type: 'biomassThreshold' }>, mask: Uint8Array | null): number {
  const c = world.ents.cols;
  const sp = t.species === null ? -1 : world.species.findIndex((s) => s.id === t.species);
  if (t.species !== null && sp < 0) return 0;
  const measure = t.measure ?? 'biomass';
  let v = 0;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || (sp >= 0 && c.species[i] !== sp)) continue;
    if (mask !== null && mask[entityCell(c.x[i]!, c.y[i]!)] !== 1) continue;
    if (measure === 'biomass') v += c.B[i]!;
    else if (measure === 'count' || c.lifeState[i] === LIFE_ACTIVE) v++;
  }
  return v;
}

/** The light-cycle index of tick `t` (null: the dish runs fixed light now). */
function cycleIndex(world: World, t: number): number | null {
  if (!worldCycles(world)) return null;
  return Math.max(0, Math.floor((t - world.settings.cycleStartTick!) / CYCLE_PERIOD_TICKS));
}

export class ObjectiveError extends Error {}

/** P5.6: the keepSpeciesAlive targets: one (species index, region mask) per clause. */
interface KeepTarget {
  readonly sp: number;
  readonly mask: Uint8Array | null;
}

/**
 * One armed objective on one world (read-only). Construct at Start (no `resume`), or from saved progress
 * after a load (`resume`, state 'running'). Call `afterTick(world)` once after every step of that world;
 * it returns true when the state changed on that tick. P5.6: a goal with a measured clause (intake,
 * consumption) also needs its read-only stage hook `hook` in that step (step(world, { afterStage })).
 */
export class ObjectiveWatch {
  readonly predicate: TypedPredicate;
  /** P5.6: read-only stage hook (stages 5 and 6) for the measured clauses; a no-op for every other goal. */
  readonly hook: (stage: number, world: World) => void;
  private readonly obs: ArmObserver;
  private readonly spIdx: number;
  private startTick: number;
  private holdSince: number | null;
  private stateNow: ObjectiveState = 'running';
  private endedAt: number | null = null;
  private valueNow: number | null = null;
  private lastEventId: number;
  private gateBase = 0;
  private lastTick: number;
  // P5.6 ------------------------------------------------------------------------------------------
  /** The v1.0 shapes run exactly as v1.0 (these flags pick the old code paths). */
  private readonly plain: boolean;
  private readonly clauses: readonly EventClause[];
  private readonly clauseSpIdx: readonly number[];
  private readonly seenAt: (number | null)[];
  private readonly amounts: number[];
  private readonly tickAmount: Float64Array;
  private cycleNow: number | null;
  private readonly inputBase: { readonly c: number; readonly n: number; readonly m: number };
  private birthsSeen: number[];
  private conversionSeen: Record<Enzyme, number>;
  private transferPending: number;
  private transferSecond: number;
  private readonly pre5: Float64Array;
  private readonly keepTargets: readonly KeepTarget[];
  private readonly keepMinCount: number;
  private readonly biomassMask: Uint8Array | null;

  constructor(
    pred: ObjectivePredicate,
    world: World,
    resume: ObjectiveProgress | null = null,
    private readonly gates: GateReading | null = WORLD_GATES,
  ) {
    const t = typedPredicate(pred);
    if (isProblem(t)) throw new ObjectiveError(t.message);
    // A resumed cycle-window goal is not refused for fixed light: the player may switch the light between ticks
    // (setLightMode), and the watch ends that attempt at its next tick, as uninterrupted (fix round 1).
    const why = objectiveSupportProblem(world, pred, gates, resume === null);
    if (why !== null) throw new ObjectiveError(why);
    if (resume !== null && (resume.state !== 'running' || resume.startTick > world.tick)) throw new ObjectiveError('only a running goal from this dish’s past resumes');
    const savedEvent = resume?.lastEventId;
    if (savedEvent !== undefined && !(Number.isInteger(savedEvent) && savedEvent >= 0 && savedEvent < world.counters.nextEventId))
      throw new ObjectiveError('its saved event position is not in this dish’s past');
    this.predicate = t;
    const sp = t.type === 'keepSpeciesAlive' || t.type === 'biomassThreshold' || t.type === 'observeEvent' ? t.species : null;
    this.spIdx = sp === null ? -1 : world.species.findIndex((s) => s.id === sp);
    this.obs = new ArmObserver(world);
    this.startTick = resume?.startTick ?? world.tick;
    this.holdSince = resume?.holdSinceTick ?? null;
    // Event-ring goals resume after the last record they saw (a command's records since then still count).
    this.lastEventId = savedEvent ?? world.counters.nextEventId - 1;
    this.lastTick = world.tick;
    if (t.type === 'transferAcrossGate') {
      // Resumed: the amount moved before the load is not known to a fresh reader; the threshold counts from the load.
      this.gateBase = gates!.transferred(world, t.gate, t.field)!;
    }
    // P5.6 state (empty for the v1.0 shapes).
    this.plain =
      (t.type === 'keepSpeciesAlive' && t.speciesList === undefined && t.minCount === undefined && t.region === undefined && t.minSpecies === undefined) ||
      (t.type === 'biomassThreshold' && t.measure === undefined && t.region === undefined && t.fromBelow === undefined) ||
      (t.type === 'observeEvent' && isPlainEvent(t)) ||
      t.type === 'transferAcrossGate' ||
      t.type === 'fieldInRange';
    this.clauses = t.type === 'observeEvent' ? eventClauses(t) : [];
    this.clauseSpIdx = this.clauses.map((c) => (c.species === null ? -1 : world.species.findIndex((s) => s.id === c.species)));
    const keys = progressKeysOf(t);
    const n = this.clauses.length;
    const saved = (list: readonly (number | null)[] | undefined, len: number | null, what: string): void => {
      if (resume === null) return;
      if (len === null) {
        if (list !== undefined) throw new ObjectiveError(`its saved ${what} do not belong to this goal`);
      } else if (list === undefined || list.length !== len) throw new ObjectiveError(`its saved ${what} do not match this goal`);
    };
    saved(resume?.clauses, keys.clauses, 'clauses');
    saved(resume?.amounts, keys.amounts, 'amounts');
    if (resume !== null && keys.cycle !== (resume.cycle !== undefined)) throw new ObjectiveError('its saved light cycle does not match this goal');
    if (resume !== null && keys.inputs !== (resume.inputs !== undefined)) throw new ObjectiveError('its saved input base does not match this goal');
    const inp = world.ledger.inputs;
    if (resume?.inputs !== undefined && !(resume.inputs.length === 3 && resume.inputs.every((v) => Number.isFinite(v) && v >= 0) && resume.inputs[0] <= inp.c && resume.inputs[1] <= inp.n && resume.inputs[2] <= inp.m))
      throw new ObjectiveError('its saved input base is not in this dish’s past');
    for (const tk of resume?.clauses ?? []) if (tk !== null && !(Number.isInteger(tk) && tk >= this.startTick && tk <= world.tick)) throw new ObjectiveError('a saved clause tick is not in this dish’s past');
    for (const a of resume?.amounts ?? []) if (!(Number.isFinite(a) && a >= 0)) throw new ObjectiveError('a saved amount is not a measured amount');
    this.seenAt = keys.clauses !== null && resume?.clauses ? [...resume.clauses] : new Array<number | null>(n).fill(null);
    this.amounts = resume?.amounts ? [...resume.amounts] : new Array<number>(n).fill(0);
    this.tickAmount = new Float64Array(n);
    this.cycleNow = resume?.cycle ?? (keys.cycle ? cycleIndex(world, world.tick) : null);
    this.inputBase = resume?.inputs !== undefined ? { c: resume.inputs[0], n: resume.inputs[1], m: resume.inputs[2] } : { ...world.ledger.inputs };
    this.birthsSeen = new Array<number>(world.species.length).fill(0);
    this.conversionSeen = { ...world.conversionTotals };
    this.transferPending = world.history.pendingFungalTransfer ?? 0;
    this.transferSecond = world.history.seconds.at(-1)?.second ?? -1;
    this.pre5 = new Float64Array(n);
    if (t.type === 'keepSpeciesAlive' && !this.plain) {
      const regionOfAll = t.region ?? null;
      const ids = t.minSpecies !== undefined ? world.species.map((s) => s.id) : (t.speciesList ?? [t.species!]);
      this.keepTargets = ids.map((id, k) => {
        const r = t.regions?.[k] ?? regionOfAll;
        return { sp: world.species.findIndex((s) => s.id === id), mask: r === null || r === 'dish' ? null : regionMask(world, r) };
      });
      this.keepMinCount = t.minCount ?? 1;
    } else {
      this.keepTargets = [];
      this.keepMinCount = 1;
    }
    this.biomassMask = t.type === 'biomassThreshold' && t.region !== undefined && t.region !== 'dish' ? regionMask(world, t.region) : null;
    const measured = this.clauses.some((c) => c.event === 'intake' || c.event === 'consumption');
    this.hook = measured ? (stage, w) => this.measureStage(stage, w) : () => undefined;
    if (resume === null && t.type === 'biomassThreshold' && t.fromBelow !== undefined && biomassMeasure(world, t, this.biomassMask) >= t.fromBelow)
      throw new ObjectiveStartRefusal(fromBelowText(t));
    // Start arms the predicate at the current tick: a state predicate is checked at once (Sprinters gone
    // already ends; a held range starts its hold now). A resumed watch was checked at its saved tick.
    if (resume === null) this.evaluate(world, true);
  }

  get state(): ObjectiveState {
    return this.stateNow;
  }

  /** The tick it completed or ended (null while running). */
  get endTick(): number | null {
    return this.endedAt;
  }

  /** The measured value behind the result (births, converted carbon, biomass, the field mean, alive count), when there is one. */
  get value(): number | null {
    return this.valueNow;
  }

  progress(): ObjectiveProgress {
    const keys = progressKeysOf(this.predicate);
    return {
      startTick: this.startTick,
      holdSinceTick: this.holdSince,
      state: this.stateNow,
      ...(usesEventRing(this.predicate) ? { lastEventId: this.lastEventId } : {}),
      ...(keys.clauses !== null ? { clauses: [...this.seenAt] } : {}),
      ...(keys.amounts !== null ? { amounts: [...this.amounts] } : {}),
      ...(keys.cycle ? { cycle: this.cycleNow ?? 0 } : {}),
      ...(keys.inputs ? { inputs: [this.inputBase.c, this.inputBase.n, this.inputBase.m] as const } : {}),
    };
  }

  /** Call once after every step of the watched world. Returns true when the state changed. */
  afterTick(world: World): boolean {
    if (this.stateNow !== 'running') return false;
    // Only a tick advances an objective: a command between ticks (a sample taken, Add Life) is seen at the next tick.
    if (world.tick === this.lastTick) return false;
    this.lastTick = world.tick;
    this.obs.afterTick(world);
    return this.evaluate(world, false);
  }

  /**
   * P5.6 read-only stage hook: the measured clauses' amount in this tick, with ArmObserver's formulas
   * (pairedRun.ts): intake = the species' intakeAccum after stage 6 minus after stage 5; consumption = the
   * pool's total after stage 5 minus after stage 6. A tick's amount below 0 (feeding returned more to the pool
   * than it took) counts as 0, so an amount only grows.
   */
  private measureStage(stage: number, world: World): void {
    if (stage !== 5 && stage !== 6) return;
    for (let k = 0; k < this.clauses.length; k++) {
      const c = this.clauses[k]!;
      let v: number;
      if (c.event === 'intake') {
        const sp = this.clauseSpIdx[k]!;
        const col = world.ents.cols;
        v = 0;
        if (sp >= 0) for (let i = 0; i < world.ents.highWater; i++) if (col.alive[i] === 1 && col.species[i] === sp) v += col.intakeAccum[i]!;
      } else if (c.event === 'consumption') v = world.fields[c.pool!] !== undefined ? poolTotal(world, c.pool!) : 0;
      else continue;
      if (stage === 5) this.pre5[k] = v;
      else {
        const d = c.event === 'intake' ? v - this.pre5[k]! : this.pre5[k]! - v;
        this.tickAmount[k] = d > 0 ? d : 0;
      }
    }
  }

  private finish(state: 'completed' | 'ended', world: World, value: number | null): true {
    this.stateNow = state;
    this.endedAt = world.tick;
    this.valueNow = value;
    return true;
  }

  private evaluate(world: World, atStart: boolean): boolean {
    const t = this.predicate;
    const now = world.tick;
    switch (t.type) {
      case 'keepSpeciesAlive': {
        if (!this.plain) return this.evaluateKeep(world, t);
        const alive = aliveCounts(world)[this.spIdx] ?? 0;
        if (alive === 0) return this.finish('ended', world, 0);
        this.holdSince ??= this.startTick;
        if (now - this.holdSince >= t.durationSeconds * TICKS_PER_SECOND) return this.finish('completed', world, alive);
        return false;
      }
      case 'biomassThreshold': {
        if (!this.plain) {
          const v = biomassMeasure(world, t, this.biomassMask);
          return v >= t.threshold ? this.finish('completed', world, v) : false;
        }
        const b = livingBiomass(world, this.spIdx);
        return b >= t.threshold ? this.finish('completed', world, b) : false;
      }
      case 'transferAcrossGate': {
        const moved = (this.gates!.transferred(world, t.gate, t.field) ?? this.gateBase) - this.gateBase;
        return moved >= t.threshold ? this.finish('completed', world, moved) : false;
      }
      case 'fieldInRange': {
        const mean = regionMean(world, t.field, t.region);
        if (mean < t.min || mean > t.max) {
          this.holdSince = null;
          return false;
        }
        this.holdSince ??= now;
        return now - this.holdSince >= t.durationSeconds * TICKS_PER_SECOND ? this.finish('completed', world, mean) : false;
      }
      case 'observeEvent': {
        if (atStart) return false; // only what happens after Start counts
        if (!this.plain) return this.evaluateClauses(world, t);
        if (t.event === 'birth') {
          let n = 0;
          for (let s = 0; s < this.obs.births.length; s++) if (this.spIdx < 0 || s === this.spIdx) n += this.obs.births[s]!;
          return n > 0 ? this.finish('completed', world, n) : false;
        }
        if (t.event === 'conversion') {
          const c = this.obs.converted(world, t.enzyme!);
          return c > 0 ? this.finish('completed', world, c) : false;
        }
        const ring = world.events.ring;
        let k = ring.length;
        while (k > 0 && ring[k - 1]!.id > this.lastEventId) k--;
        let n = 0;
        for (; k < ring.length; k++) {
          const ev = ring[k]!;
          if (ev.type === t.event && (this.spIdx < 0 || ev.species === this.spIdx)) n++;
        }
        this.lastEventId = world.counters.nextEventId - 1;
        return n > 0 ? this.finish('completed', world, n) : false;
      }
    }
  }

  /**
   * P5.6 keepSpeciesAlive with parameters: the attempt ends when a NAMED species has no living member anywhere
   * in the dish (a minSpecies goal never ends); every clause (each species' count in its region ≥ minCount, or
   * at least minSpecies species so) holds at this tick or the hold resets; a full hold completes it.
   */
  private evaluateKeep(world: World, t: Extract<TypedPredicate, { type: 'keepSpeciesAlive' }>): boolean {
    const now = world.tick;
    const c = world.ents.cols;
    const alive = aliveCounts(world);
    const counts = new Array<number>(this.keepTargets.length).fill(0);
    for (let k = 0; k < this.keepTargets.length; k++) {
      const target = this.keepTargets[k]!;
      if (target.sp < 0) continue;
      if (target.mask === null) {
        counts[k] = alive[target.sp] ?? 0;
        continue;
      }
      let n = 0;
      for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && c.species[i] === target.sp && target.mask[entityCell(c.x[i]!, c.y[i]!)] === 1) n++;
      counts[k] = n;
    }
    if (t.minSpecies === undefined && this.keepTargets.some((x) => x.sp < 0 || (alive[x.sp] ?? 0) === 0)) return this.finish('ended', world, 0);
    const holding = t.minSpecies !== undefined ? counts.filter((n) => n >= this.keepMinCount).length >= t.minSpecies : counts.every((n) => n >= this.keepMinCount);
    if (!holding) {
      this.holdSince = null;
      return false;
    }
    this.holdSince ??= now;
    if (now - this.holdSince < t.durationSeconds * TICKS_PER_SECOND) return false;
    const value = t.minSpecies !== undefined ? counts.filter((n) => n >= this.keepMinCount).length : Math.min(...counts);
    return this.finish('completed', world, value);
  }

  /**
   * P5.6 observeEvent with clauses: each clause not yet seen is checked against this tick (a ring record of
   * its type and species; a committed birth; converted carbon; a measured amount reaching atLeast). With the
   * cycle window, the seen clauses and the amounts are forgotten when the light-cycle index of the tick that
   * ran changes (a tick the dish ran on fixed light ends the attempt, fix round 1). endOn: a 'linkBroken' record, or any growth of
   * the ledger's external inputs since Start, ends the attempt; an end on the same tick as the last clause
   * wins (the bridge broke within that tick).
   */
  private evaluateClauses(world: World, t: Extract<TypedPredicate, { type: 'observeEvent' }>): boolean {
    const now = world.tick;
    const n = this.clauses.length;
    // What this tick recorded, per clause (ring records, births, conversion, measured amounts).
    const hit = new Array<boolean>(n).fill(false);
    let broken = false;
    if (usesEventRing(t)) {
      const ring = world.events.ring;
      let k = ring.length;
      while (k > 0 && ring[k - 1]!.id > this.lastEventId) k--;
      for (; k < ring.length; k++) {
        const ev = ring[k]!;
        if (ev.type === 'linkBroken') broken = true;
        for (let j = 0; j < n; j++) {
          const c = this.clauses[j]!;
          if (isRingClause(c) && ev.type === c.event && (this.clauseSpIdx[j]! < 0 || ev.species === this.clauseSpIdx[j])) hit[j] = true;
        }
      }
      this.lastEventId = world.counters.nextEventId - 1;
    }
    const births = this.obs.births;
    const transferNow = this.transferMoved(world);
    for (let j = 0; j < n; j++) {
      const c = this.clauses[j]!;
      if (c.event === 'birth') {
        const sp = this.clauseSpIdx[j]!;
        let b = 0;
        for (let s = 0; s < births.length; s++) if (sp < 0 || s === sp) b += births[s]! - (this.birthsSeen[s] ?? 0);
        if (b > 0) hit[j] = true;
      } else if (c.event === 'conversion') {
        if (world.conversionTotals[c.enzyme!] > this.conversionSeen[c.enzyme!]) hit[j] = true;
      }
    }
    this.birthsSeen = Array.from(births);
    this.conversionSeen = { ...world.conversionTotals };
    if (t.endOn?.includes('linkBroken') && broken) return this.finish('ended', world, null);
    const inp = world.ledger.inputs;
    if (t.endOn?.includes('externalInput') && (inp.c > this.inputBase.c || inp.n > this.inputBase.n || inp.m > this.inputBase.m)) return this.finish('ended', world, null);
    if (t.window === 'cycle') {
      const idx = cycleIndex(world, now - 1);
      // Fix round 1: the dish was switched to fixed light (setLightMode, an ordinary command): it cannot run
      // a cycle window any more ("this dish has no light cycle"), so this attempt ends at this tick (endReason
      // 'zero', the objective's endedText), keeping the clause ticks and amounts it had.
      if (idx === null) return this.finish('ended', world, null);
      if (idx !== this.cycleNow) {
        this.seenAt.fill(null);
        this.amounts.fill(0);
        this.cycleNow = idx;
      }
    }
    for (let j = 0; j < n; j++) {
      const c = this.clauses[j]!;
      if (c.event === 'intake' || c.event === 'consumption') this.amounts[j]! += this.tickAmount[j]!;
      else if (c.event === 'transfer') this.amounts[j]! += transferNow;
      this.tickAmount[j] = 0;
      if (this.seenAt[j] !== null) continue;
      const measured = isMeasured(c.event);
      if (measured ? (c.atLeast === null ? this.amounts[j]! > 0 : this.amounts[j]! >= c.atLeast) : hit[j]) this.seenAt[j] = now;
    }
    if (this.seenAt.some((x) => x === null)) return false;
    const measuredOne = n === 1 && isMeasured(this.clauses[0]!.event);
    return this.finish('completed', world, measuredOne ? this.amounts[0]! : n);
  }

  /** Carbon moved along F02 transport links in the tick that just ran (ArmObserver's transfer.fungal formula; ≥ 0). */
  private transferMoved(world: World): number {
    const h = world.history;
    const last = h.seconds.at(-1);
    const pushed = last !== undefined && last.second !== this.transferSecond ? last : null;
    if (last) this.transferSecond = last.second;
    const pending = h.pendingFungalTransfer ?? 0;
    const moved = (pushed?.fungalTransfer ?? 0) + pending - this.transferPending;
    this.transferPending = pending;
    return moved > 0 ? moved : 0;
  }
}
