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
 */
import type { ContentRegistry } from './content/registry';
import type { Manifest, ObjectiveDef, Species, StructureDef } from './content/schema';
import { TICKS_PER_SECOND } from './constants';
import type { EventType } from './events';
import { allocatedFieldIds, FIELD_DEFS, isFieldId, type FieldId } from './fields';
import { cellX, cellY, maskCells } from './grid';
import { quarterOf, TRAIT_REGIONS, type TraitRegion } from './history';
import { aliveCounts, ArmObserver, ENZYMES, type Enzyme } from './pairedRun';
import type { World } from './world';

/** The five named predicate types an objective may use (PredicateSchema's 'custom' is for experiment gates only). */
export const OBJECTIVE_TYPES = ['keepSpeciesAlive', 'biomassThreshold', 'transferAcrossGate', 'observeEvent', 'fieldInRange'] as const;
export type ObjectiveType = (typeof OBJECTIVE_TYPES)[number];

/** Event types an observeEvent objective may name (every EventType; 'birth' and 'conversion' have their own measures). */
export const OBJECTIVE_EVENTS = [
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
] as const satisfies readonly EventType[];

/** An objective's predicate as content records it (PredicateSchema). */
export type ObjectivePredicate = ObjectiveDef['predicate'];

/** The typed parameters of each predicate type (objectivePredicateProblem guarantees these shapes). */
export type TypedPredicate =
  | { readonly type: 'keepSpeciesAlive'; readonly species: string; readonly durationSeconds: number }
  | { readonly type: 'biomassThreshold'; readonly species: string | null; readonly threshold: number }
  | { readonly type: 'transferAcrossGate'; readonly gate: string; readonly field: FieldId; readonly threshold: number }
  | { readonly type: 'observeEvent'; readonly event: EventType; readonly species: string | null; readonly enzyme: Enzyme | null }
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
   * Event-ring goals only (observeEvent of a type other than 'birth' and 'conversion', `usesEventRing`):
   * the id of the last event record the watch has seen. A resumed watch counts the records after it, so
   * a record a command added after the last evaluated tick is counted at the next tick, as uninterrupted.
   * Absent on a record written before it existed (then the watch resumes at the load moment).
   */
  readonly lastEventId?: number;
}

/**
 * The quantity of a material moved across a gate (P4.4: no gate structure exists in this build; Phase 5
 * gates provide one). `transferred` is the cumulative amount of `field` moved across gate structure
 * `gate` in `world` so far, or null when the world has no such gate.
 */
export interface GateReading {
  transferred(world: World, gate: string, field: FieldId): number | null;
}

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
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const posFinite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const includes = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);

/** The params keys each type accepts (an unknown key is a problem: a typo must never silently mean "any"). */
const PARAM_KEYS: Readonly<Record<ObjectiveType, readonly string[]>> = {
  keepSpeciesAlive: ['species'],
  biomassThreshold: ['species', 'threshold'],
  transferAcrossGate: ['gate', 'field', 'threshold'],
  observeEvent: ['event', 'species', 'enzyme'],
  fieldInRange: ['field', 'region', 'min', 'max'],
};
const NEEDS_DURATION: readonly ObjectiveType[] = ['keepSpeciesAlive', 'fieldInRange'];

/** The predicate types that hold for a duration (the only ones whose progress carries a holdSinceTick). */
export function holdsForDuration(type: string): boolean {
  return (NEEDS_DURATION as readonly string[]).includes(type);
}

/** An observeEvent goal read from the event ring (every event type but 'birth' and 'conversion', which have their own measures). */
export function usesEventRing(t: TypedPredicate): boolean {
  return t.type === 'observeEvent' && t.event !== 'birth' && t.event !== 'conversion';
}

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
      const species = speciesOf(true);
      if (isProblem(species)) return species;
      return { type, species: species!, durationSeconds: d! };
    }
    case 'biomassThreshold': {
      const species = speciesOf(false);
      if (isProblem(species)) return species;
      if (!posFinite(p.threshold)) return bad('threshold', 'threshold must be a finite number above 0');
      return { type, species, threshold: p.threshold };
    }
    case 'transferAcrossGate': {
      if (typeof p.gate !== 'string' || p.gate.length === 0) return bad('gate', 'transferAcrossGate needs a gate structure id');
      if (typeof p.field !== 'string' || !isFieldId(p.field)) return bad('field', `unknown field "${String(p.field)}"`);
      if (!posFinite(p.threshold)) return bad('threshold', 'threshold must be a finite number above 0');
      return { type, gate: p.gate, field: p.field, threshold: p.threshold };
    }
    case 'observeEvent': {
      if (!includes(OBJECTIVE_EVENTS, p.event)) return bad('event', `unknown event type "${String(p.event)}"`);
      const species = speciesOf(false);
      if (isProblem(species)) return species;
      let enzyme: Enzyme | null = null;
      if (p.event === 'conversion') {
        if (!includes(ENZYMES, p.enzyme)) return bad('enzyme', `unknown enzyme "${String(p.enzyme)}" (${ENZYMES.join(', ')})`);
        // D09 "Do not invent a producer attribution": the reaction ledger counts converted carbon, not who made it.
        if (species !== null) return bad('species', 'a conversion goal names no producer species');
        enzyme = p.enzyme;
      } else if (p.enzyme !== undefined) return bad('enzyme', 'only a conversion goal names an enzyme');
      return { type, event: p.event, species, enzyme };
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

/** The species a typed predicate names, or null. */
function speciesOfPredicate(t: TypedPredicate): string | null {
  return t.type === 'keepSpeciesAlive' || t.type === 'biomassThreshold' || t.type === 'observeEvent' ? t.species : null;
}

/**
 * The first problem with an objective record, or null (src/sim/content/registry.ts validateContent):
 * typed params (an unknown species, field, region, enzyme or event type; a non-finite or ≤ 0 duration or
 * threshold; 'custom'), its texts (a predicate that can end needs `endedText`), its `offerOn` recipes,
 * and — for an objective this build ships (phase ≤ buildPhase) — that the manifest enables what it
 * names: the species, the field's system, the enzymes system and STARCH-like enzyme food, and for
 * transferAcrossGate an enabled edge structure (a gate). An objective of a later phase is skipped after
 * its shape: it is not offered, and the content it names may not exist yet.
 */
export function objectivePredicateProblem(def: ObjectiveDef, ctx: ObjectiveValidationContext): ObjectiveProblem | null {
  const t = typedPredicate(def.predicate);
  if (isProblem(t)) return t;
  if (t.type === 'keepSpeciesAlive' && def.endedText === undefined) return { path: 'endedText', message: 'a keepSpeciesAlive goal can end, so it needs endedText' };
  for (const [i, r] of def.offerOn.entries()) if (ctx.recipes[r] === undefined) return { path: `offerOn.${i}`, message: `unknown recipe "${r}"` };
  const m = ctx.manifest;
  if (m === null || def.phase > m.buildPhase) return null;
  const sp = speciesOfPredicate(t);
  if (sp !== null) {
    if (ctx.species[sp] === undefined) return { path: 'predicate.params.species', message: `unknown species "${sp}"` };
    if (!m.enabledSpecies.includes(sp)) return { path: 'predicate.params.species', message: `"${sp}" is not enabled in this build` };
  }
  if (t.type === 'fieldInRange' || t.type === 'transferAcrossGate') {
    const sys = FIELD_DEFS[t.field].system;
    if (sys !== 'core' && !m.enabledSystems.includes(sys)) return { path: 'predicate.params.field', message: `field "${t.field}" needs the "${sys}" system (not in enabledSystems)` };
  }
  if (t.type === 'observeEvent' && t.event === 'conversion' && !m.enabledSystems.includes('enzymes'))
    return { path: 'predicate.params.enzyme', message: 'a conversion goal needs the "enzymes" system (not in enabledSystems)' };
  if (t.type === 'transferAcrossGate') {
    const st = ctx.structures[t.gate];
    if (st === undefined || st.kind !== 'edge' || !(m.enabledStructures ?? []).includes(t.gate))
      return { path: 'predicate.params.gate', message: `no enabled gate structure provides "${t.gate}"` };
  }
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
  const sp = speciesOfPredicate(t);
  if (sp !== null && !m.enabledSpecies.includes(sp)) return `this dish has no ${sp}`;
  if (t.type === 'fieldInRange' || t.type === 'transferAcrossGate') {
    const sys = FIELD_DEFS[t.field].system;
    if (sys !== 'core' && !m.enabledSystems.includes(sys)) return `this dish has no ${t.field}`;
  }
  if (t.type === 'observeEvent' && t.event === 'conversion') {
    if (!m.enabledSystems.includes('enzymes')) return 'this dish has no enzymes';
    if (!m.enabledMaterials.includes(ENZYME_MATERIAL[t.enzyme!])) return `this dish has no ${t.enzyme}`;
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
}

/** `world`'s ObjectiveWorldRefs. */
export function objectiveWorldRefsOf(world: World): ObjectiveWorldRefs {
  return { manifest: world.content.manifest, speciesIds: world.species.map((s) => s.id), fieldIds: allocatedFieldIds(world.fields) };
}

/**
 * Why a dish with `refs` cannot run the predicate, or null when it can (objectiveSupportProblem without a
 * gate reader, so a gate goal is never supported here): the recorded manifest must have everything the
 * predicate names (objectiveManifestProblem), and its species and fields must be in the dish. A save's
 * notebook check refuses a running goal with any such problem (src/persistence/notebookGoals.ts).
 */
export function objectiveRefsProblem(refs: ObjectiveWorldRefs, pred: ObjectivePredicate): string | null {
  const t = typedPredicate(pred);
  if (isProblem(t)) return t.message;
  if (t.type === 'transferAcrossGate') return refs.fieldIds.includes(t.field) ? 'this dish has no such gate' : `this dish has no ${t.field}`;
  const m = objectiveManifestProblem(refs.manifest, pred);
  if (m !== null) return m;
  const sp = speciesOfPredicate(t);
  if (sp !== null && !refs.speciesIds.includes(sp)) return `this dish has no ${sp}`;
  if (t.type === 'fieldInRange' && !refs.fieldIds.includes(t.field)) return `this dish has no ${t.field}`;
  return null;
}

/**
 * Why `world` cannot run the predicate, or null when it can: the world's own recorded manifest must have
 * everything the predicate names (objectiveManifestProblem), its species and fields must be in the world,
 * and a gate goal needs a gate the reader finds. Never a build constant, so an old save is offered only
 * what it recorded.
 */
export function objectiveSupportProblem(world: World, pred: ObjectivePredicate, gates: GateReading | null = null): string | null {
  const t = typedPredicate(pred);
  if (isProblem(t)) return t.message;
  if (t.type === 'transferAcrossGate') {
    if (world.fields[t.field] === undefined) return `this dish has no ${t.field}`;
    return gates === null || gates.transferred(world, t.gate, t.field) === null ? 'this dish has no such gate' : null;
  }
  return objectiveRefsProblem(objectiveWorldRefsOf(world), pred);
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

/** Living biomass of species index `sp` (all living biomass when sp < 0). */
function livingBiomass(world: World, sp: number): number {
  const c = world.ents.cols;
  let s = 0;
  for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && (sp < 0 || c.species[i] === sp)) s += c.B[i]!;
  return s;
}

export class ObjectiveError extends Error {}

/**
 * One armed objective on one world (read-only). Construct at Start (no `resume`), or from saved progress
 * after a load (`resume`, state 'running'). Call `afterTick(world)` once after every step of that world;
 * it returns true when the state changed on that tick.
 */
export class ObjectiveWatch {
  readonly predicate: TypedPredicate;
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

  constructor(
    pred: ObjectivePredicate,
    world: World,
    resume: ObjectiveProgress | null = null,
    private readonly gates: GateReading | null = null,
  ) {
    const t = typedPredicate(pred);
    if (isProblem(t)) throw new ObjectiveError(t.message);
    const why = objectiveSupportProblem(world, pred, gates);
    if (why !== null) throw new ObjectiveError(why);
    if (resume !== null && (resume.state !== 'running' || resume.startTick > world.tick)) throw new ObjectiveError('only a running goal from this dish’s past resumes');
    const savedEvent = resume?.lastEventId;
    if (savedEvent !== undefined && !(Number.isInteger(savedEvent) && savedEvent >= 0 && savedEvent < world.counters.nextEventId))
      throw new ObjectiveError('its saved event position is not in this dish’s past');
    this.predicate = t;
    const sp = speciesOfPredicate(t);
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
    return {
      startTick: this.startTick,
      holdSinceTick: this.holdSince,
      state: this.stateNow,
      ...(usesEventRing(this.predicate) ? { lastEventId: this.lastEventId } : {}),
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
        const alive = aliveCounts(world)[this.spIdx] ?? 0;
        if (alive === 0) return this.finish('ended', world, 0);
        this.holdSince ??= this.startTick;
        if (now - this.holdSince >= t.durationSeconds * TICKS_PER_SECOND) return this.finish('completed', world, alive);
        return false;
      }
      case 'biomassThreshold': {
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
}
