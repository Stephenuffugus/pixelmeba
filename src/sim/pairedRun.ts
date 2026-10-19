/**
 * The paired-run measurement model (SPEC §13.4 comparison; §13.2 experiment cards; D06 §8).
 *
 * One model serves both the comparison engine (src/worker/comparison.ts) and experiment cards
 * (src/sim/experiments.ts): two worlds — A and B — that start at the same tick advance together, one
 * tick each per pair, so they always hold the same simulated time. A single-arm experiment is the
 * same model with arm A only.
 *
 * Measuring is observation. `ArmObserver` reads what each tick recorded (history accumulators, the
 * event ring, the capacity counter, entity columns, the lineage parent links) through the tick's
 * stage hooks and after every tick. It never draws simulation randomness and never writes to a world,
 * so a world run with an observer is bit-identical to the same world run without one.
 *
 * Two read-outs of the same observer:
 * - `measureArm` — named measurement ids (the grammar below), used by experiment cards and gates;
 * - `measureSummary` — the comparison panel's summary (counts, biomass, diversity, oxygen, deaths by
 *   cause, trait distributions, module frequencies, capacity-limited intervals, carbon added).
 *
 * Measurement ids (`parseMeasure`; "run" = since the observer started):
 *   seconds · runSeconds · aliveTotal · biomassTotal · speciesAlive · oxygenMean
 *   inputCarbon (external carbon logged during the run) · interventionAccepted · interventionRejected
 *   alive.SP · biomass.SP · biomassStart.SP · biomassRatio.SP (0 when the start biomass is 0)
 *   births.SP · deaths.SP · deaths.SP.CAUSE (DEATH_* / REMOVED_*) · intake.SP (carbon taken in, all routes)
 *   captures.SP · capturedCarbon.SP (as predator) · meanEnergy.SP · extinctAt.SP (dish second, −1 if not)
 *   preyBiomass.SP (living biomass of the species SP can eat)
 *   reserveHeld.SP (energy living SP hold above the normal energy cap; only a reserve chamber allows it)
 *   reservePeak.SP (the most reserveHeld.SP at the end of any tick of the run)
 *   field.F (current dish total of field F, carbon for carbon pools)
 *   consumed.F (net removal from pool F by feeding, stage 6; exact for pools feeding never adds to)
 *   converted.starch|oil|protein (carbon converted by that enzyme) · patchInput.N (recipe patch N's logged carbon)
 * Founder groups — the organisms alive when the run starts, grouped by species and supplementary
 * module set (GROUP = `none` or module ids joined by `+`, e.g. `E05`); every organism born later
 * belongs to its parent's group, and an organism introduced during the run belongs to none:
 *   founders.SP.GROUP (members at the start) · descendants.SP.GROUP (living members now: founders not
 *   yet divided plus their living descendants) · groupEnergy.SP.GROUP (their mean energy, 0 when none)
 *   groupExtinctAt.SP.GROUP (dish second the group had no living member, −1 if not)
 *   groupEnergyMedian.SP.GROUP · groupEnergyMin.SP.GROUP · groupEnergyMax.SP.GROUP (the distribution of
 *   their energy: median, lowest and highest over living members, 0 when none — CT §9.2 "record energy
 *   distributions"; a card that shows any group energy also lists descendants.SP.GROUP, so an empty
 *   group always reads "none alive", never as a real zero)
 * Tracked measures (P3.9; recorded only when the observer is asked for them — `observe` — because the
 * comparison engine shares this observer; measuring one that is not tracked is a MeasureError):
 *   infections.SP (organisms of SP newly infected by a virus during the run: infectedBy set with the
 *   infection timer at 0 after stage 5, the tick it happened)
 *   limitSeconds.SP.REASON (organism-seconds of living SP whose reading was REASON at the end of a tick:
 *   the leading intake limit (limitCode) for intake reasons, and for suitability reasons (SUIT_*,
 *   INHIBITOR_EXPOSURE) the suitability reason the inspector shows (entitySuitabilityAt); 0.1 s per
 *   organism per tick)
 *   transfer.fungal (carbon moved along F02 transport links during the run; fungalTransport's edges,
 *   as the history sums them)
 *   wholeUnitCells.SP (the most cells at the end of any tick holding at least one whole Pinphage unit
 *   (v01 ≥ 1) and a living SP: the precondition of an infection there)
 * Phase 5 (P5.6; CT §10.3; D-0131). Plain reads (not tracked):
 *   resting.SP (living SP in a life state other than Active now: Preparing, Resting or Waking)
 *   glowing.SP (living SP with glowState 1 now) · glowingStart.SP (that count when the observer started:
 *   "the copies were made from a glowing dish") · attached.SP (living SP riding a host now: hostBirthId ≠ 0)
 *   firstCaptureAt.SP (the dish second at the end of the tick that wrote SP's first 'capture' record in the run,
 *   (record tick + 1) / 10, the clock seconds, extinctAt and a gate's second read; −1 if none)
 * Phase 5 tracked measures (recorded only when `observe` names them):
 *   events.TYPE.SP (event RECORDS of TYPE naming species SP since the run started, counted from the event
 *   ring after every tick; TYPE in EVENT_MEASURE_TYPES. A count of records, never of organisms: one
 *   'modeSwitch' record stands for every switch of that species to that mode in one tick, D-0126)
 *   intakePhoto.SP · intakeSugar.SP (carbon SP took in during the run while its mode column read Photo /
 *   Sugar: each organism's intake between the stage 5 and stage 6 hooks, split by its mode at stage 6; 0
 *   for a species without MIXOTROPHY, whose mode is always none)
 *   infections.SP.VIRUS · wholeUnitCells.SP.VIRUS (as the two-part ids, restricted to one virus: the
 *   infectedBy code of that virus, and that virus's own unit field, v01 or v02)
 *   secretingSeconds.SP (organism-seconds of living SP that released something this tick — an enzyme,
 *   RIVAL or the glow signal: the `secreting` bits, the inspector's SECRETING — 0.1 s per organism per tick)
 *   gateTransfer.KIND.F (field F moved across the dish's edges of structure KIND, S01–S04, since the run
 *   started: the gate tally (objectives.ts WORLD_GATES.transferred) now minus its value at the start)
 *   gateCrossings.KIND (organism crossings of those edges since the run started, WORLD_GATES.organisms)
 *   alive.SP@REGION · resting.SP@REGION · biomass.SP@REGION (living SP whose cell, entityCell, lies in the
 *   region) · mean.F@REGION (mean of field F over the region's cells) · moisture@REGION (mean of the derived
 *   moisture over the region's cells). REGION is a region of the WORLD's recorded habitat
 *   (world.content.habitat.regions; habitatRules.ts regionCells), never this build's registry.
 * A gate measure whose dish has no edge of that kind, or a region measure naming a region the world's habitat
 * does not record, is a MeasureError when the observer is created. catalogIds lists none of these unless the
 * observer was asked for them (the comparison engine's rows are unchanged).
 */
import type { CommandPayload, CommandResult } from './commands';
import { AGENT_CAP, CELL_COUNT, ENERGY_CAP_BASE, TICKS_PER_SECOND } from './constants';
import { FIELD_DEFS, FIELD_IDS, isFieldId, type FieldId } from './fields';
import { entitySuitabilityAt } from './crossing';
import { maskCells } from './grid';
import { field as lineageField } from './lineage';
import { activeLoci } from './phenotype';
import { profileOf } from './profiles';
import { regionCells } from './content/habitatRules';
import { LIFE_ACTIVE } from './entities';
import type { EventType } from './events';
import { MODE_PHOTO, MODE_SUGAR } from './mixotrophy';
import { REASONS } from './reasons';
import { entityCell } from './spatial';
import { isFieldVirus, virusIdOfCode } from './viruses';
import { stateHash } from './serialize';
import { step } from './tick';
import type { World } from './world';

export class MeasureError extends Error {}

/** Every paired result carries this label; one pair is never generalised (D06 §8). */
export const PAIRED_RUN_LABEL = 'this paired run';
export const SINGLE_RUN_LABEL = 'this run';

// ------------------------------------------------------------------------------ measurement grammar

export const SCALAR_MEASURES = [
  'seconds',
  'runSeconds',
  'aliveTotal',
  'biomassTotal',
  'speciesAlive',
  'oxygenMean',
  'inputCarbon',
  'interventionAccepted',
  'interventionRejected',
] as const;
export type ScalarMeasure = (typeof SCALAR_MEASURES)[number];

export const SPECIES_MEASURES = [
  'alive',
  'biomass',
  'biomassStart',
  'biomassRatio',
  'births',
  'deaths',
  'intake',
  'captures',
  'capturedCarbon',
  'meanEnergy',
  'extinctAt',
  'preyBiomass',
  'reserveHeld',
  'reservePeak',
] as const;
export type SpeciesMeasure = (typeof SPECIES_MEASURES)[number];

/** Per founder group (species × module set at the start of the run). */
export const GROUP_MEASURES = ['founders', 'descendants', 'groupEnergy', 'groupExtinctAt', 'groupEnergyMedian', 'groupEnergyMin', 'groupEnergyMax'] as const;
export type GroupMeasure = (typeof GROUP_MEASURES)[number];

export const ENZYMES = ['starch', 'oil', 'protein'] as const;
export type Enzyme = (typeof ENZYMES)[number];

/** Pools feeding removes from. Feeding never adds to the first six; it returns sugar, metabolite and CO2. */
export const CONSUMABLE_POOLS = ['starch', 'oil', 'protein', 'broth', 'detritus', 'film', 'sugar', 'metabolite', 'co2'] as const satisfies readonly FieldId[];
export type ConsumablePool = (typeof CONSUMABLE_POOLS)[number];

/** P5.6: per-species reads of the current state (not tracked; never listed by catalogIds). */
export const STATE_MEASURES = ['resting', 'glowing', 'attached'] as const;
export type StateMeasure = (typeof STATE_MEASURES)[number];

/** P5.6: the event types events.TYPE.SP counts (records naming that species). */
export const EVENT_MEASURE_TYPES = [
  'glowOn',
  'glowOff',
  'modeSwitch',
  'rest',
  'wake',
  'trapArmed',
  'trapHold',
  'trapRelease',
  'handlingStart',
  'handlingBreak',
  'capture',
  'linkFormed',
  'linkBroken',
] as const satisfies readonly EventType[];
export type EventMeasureType = (typeof EVENT_MEASURE_TYPES)[number];

/** P5.6: the edge structures a gate measure reads (CT §4). */
export const GATE_KINDS = ['S01', 'S02', 'S03', 'S04'] as const;
export type GateKind = (typeof GATE_KINDS)[number];

/** P5.6: the per-species measures that take an @REGION suffix (besides mean.F@REGION and moisture@REGION). */
export const REGION_SPECIES_MEASURES = ['alive', 'resting', 'biomass'] as const;
export type RegionSpeciesMeasure = (typeof REGION_SPECIES_MEASURES)[number];

/**
 * P5.6: the measurement heads Phase 5 adds (p5-polish words each one). Besides these, the existing heads gain
 * three forms: infections.SP.VIRUS, wholeUnitCells.SP.VIRUS, and the @REGION suffix on alive.SP and biomass.SP.
 */
export const P5_MEASURE_HEADS = [
  'resting',
  'glowing',
  'glowingStart',
  'attached',
  'events',
  'firstCaptureAt',
  'intakePhoto',
  'intakeSugar',
  'secretingSeconds',
  'gateTransfer',
  'gateCrossings',
  'mean',
  'moisture',
] as const;

export type MeasureRef =
  | { readonly kind: 'scalar'; readonly name: ScalarMeasure }
  | { readonly kind: 'species'; readonly stat: SpeciesMeasure; readonly species: string }
  | { readonly kind: 'deathCause'; readonly species: string; readonly cause: number }
  | { readonly kind: 'group'; readonly stat: GroupMeasure; readonly species: string; readonly group: string }
  | { readonly kind: 'field'; readonly field: FieldId }
  | { readonly kind: 'consumed'; readonly field: ConsumablePool }
  | { readonly kind: 'converted'; readonly enzyme: Enzyme }
  | { readonly kind: 'patchInput'; readonly index: number }
  /** `virus` (P5.6): restricted to one virus (infections.SP.VIRUS); absent = any virus (the P3.9 id). */
  | { readonly kind: 'infections'; readonly species: string; readonly virus?: string }
  | { readonly kind: 'limitSeconds'; readonly species: string; readonly reason: number }
  | { readonly kind: 'transfer'; readonly route: 'fungal' }
  /** `virus` (P5.6): that virus's units (wholeUnitCells.SP.VIRUS); absent = Pinphage v01 (the P3.9 id). */
  | { readonly kind: 'wholeUnitCells'; readonly species: string; readonly virus?: string }
  // ---- P5.6
  | { readonly kind: 'state'; readonly stat: StateMeasure; readonly species: string }
  | { readonly kind: 'glowingStart'; readonly species: string }
  | { readonly kind: 'firstCaptureAt'; readonly species: string }
  | { readonly kind: 'events'; readonly type: EventMeasureType; readonly species: string }
  | { readonly kind: 'intakeMode'; readonly mode: 'photo' | 'sugar'; readonly species: string }
  | { readonly kind: 'secretingSeconds'; readonly species: string }
  | { readonly kind: 'gateTransfer'; readonly gate: GateKind; readonly field: FieldId }
  | { readonly kind: 'gateCrossings'; readonly gate: GateKind }
  | { readonly kind: 'region'; readonly stat: RegionSpeciesMeasure; readonly species: string; readonly region: string }
  | { readonly kind: 'regionMean'; readonly field: FieldId; readonly region: string }
  | { readonly kind: 'regionMoisture'; readonly region: string };

/** P3.9: reasons a limitSeconds measure reads from the suitability (the inspector's), not the intake limit. */
export function isSuitabilityReason(name: string): boolean {
  // P5.6: RIVAL_EXPOSURE is the suitability reason where RIVAL leads the exposure (suitability.ts, D-0119).
  return name.startsWith('SUIT_') || name === 'INHIBITOR_EXPOSURE' || name === 'RIVAL_EXPOSURE';
}

const SPECIES_RE = /^[BYFAPXV][0-9]{2}$/;
const GROUP_RE = /^(none|E[0-9]{2}(\+E[0-9]{2})*)$/;
const REGION_RE = /^[A-Z][A-Z0-9_]*$/;
const includes = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/** Parse a measurement id; returns a readable error string when it is not in the grammar. */
export function parseMeasure(id: string): MeasureRef | string {
  const at = id.indexOf('@');
  if (at >= 0) return parseRegionMeasure(id, id.slice(0, at), id.slice(at + 1));
  const parts = id.split('.');
  const [head, a, b] = parts;
  if (head === 'mean' || head === 'moisture') return `"${id}" needs a region, e.g. ${head === 'mean' ? 'mean.salt' : 'moisture'}@REGION`;
  if (parts.length === 1) return includes(SCALAR_MEASURES, head!) ? { kind: 'scalar', name: head } : `unknown measurement "${id}"`;
  if (head === 'limitSeconds') {
    if (parts.length !== 3) return `"${id}" needs a species and a reason, e.g. limitSeconds.B01.OXYGEN_LIMITED`;
    if (!SPECIES_RE.test(a!)) return `"${a}" is not a species id`;
    const reason = REASONS.indexOf(b as (typeof REASONS)[number]);
    if (reason <= 0) return `"${b}" is not a reason code`;
    return { kind: 'limitSeconds', species: a!, reason };
  }
  if (head === 'deaths' && parts.length === 3) {
    if (!SPECIES_RE.test(a!)) return `"${a}" is not a species id`;
    const cause = REASONS.indexOf(b as (typeof REASONS)[number]);
    if (cause < 0 || !(b!.startsWith('DEATH_') || b!.startsWith('REMOVED_'))) return `"${b}" is not a death cause`;
    return { kind: 'deathCause', species: a!, cause };
  }
  if (includes(GROUP_MEASURES, head!)) {
    if (parts.length !== 3) return `"${id}" needs a species and a founder group, e.g. ${head}.B01.none`;
    if (!SPECIES_RE.test(a!)) return `"${a}" is not a species id`;
    if (!GROUP_RE.test(b!)) return `"${b}" is not a founder group (none, or module ids joined by +)`;
    return { kind: 'group', stat: head, species: a!, group: b! };
  }
  if (head === 'events') {
    if (parts.length !== 3) return `"${id}" needs an event type and a species, e.g. events.glowOn.B09`;
    if (!includes(EVENT_MEASURE_TYPES, a!)) return `"${a}" is not a counted event type (${EVENT_MEASURE_TYPES.join(', ')})`;
    if (!SPECIES_RE.test(b!)) return `"${b}" is not a species id`;
    return { kind: 'events', type: a, species: b! };
  }
  if ((head === 'infections' || head === 'wholeUnitCells') && parts.length === 3) {
    if (!SPECIES_RE.test(a!)) return `"${a}" is not a species id`;
    if (!isFieldVirus(b!) || !isFieldId(b!.toLowerCase())) return `"${b}" is not a virus`;
    return { kind: head, species: a!, virus: b! };
  }
  if (head === 'gateTransfer') {
    if (parts.length !== 3) return `"${id}" needs an edge structure and a field, e.g. gateTransfer.S01.sugar`;
    if (!includes(GATE_KINDS, a!)) return `"${a}" is not an edge structure (S01, S02, S03 or S04)`;
    return isFieldId(b!) ? { kind: 'gateTransfer', gate: a, field: b } : `unknown field "${b}"`;
  }
  if (parts.length !== 2) return `unknown measurement "${id}"`;
  if (head === 'gateCrossings') return includes(GATE_KINDS, a!) ? { kind: 'gateCrossings', gate: a } : `"${a}" is not an edge structure (S01, S02, S03 or S04)`;
  if (includes(STATE_MEASURES, head!) || head === 'glowingStart' || head === 'firstCaptureAt' || head === 'intakePhoto' || head === 'intakeSugar' || head === 'secretingSeconds') {
    if (!SPECIES_RE.test(a!)) return `"${a}" is not a species id`;
    if (includes(STATE_MEASURES, head)) return { kind: 'state', stat: head, species: a! };
    if (head === 'intakePhoto' || head === 'intakeSugar') return { kind: 'intakeMode', mode: head === 'intakePhoto' ? 'photo' : 'sugar', species: a! };
    return { kind: head, species: a! };
  }
  if (includes(SPECIES_MEASURES, head!)) {
    if (!SPECIES_RE.test(a!)) return `"${a}" is not a species id`;
    return { kind: 'species', stat: head, species: a! };
  }
  if (head === 'field') return isFieldId(a!) ? { kind: 'field', field: a } : `unknown field "${a}"`;
  if (head === 'consumed') return includes(CONSUMABLE_POOLS, a!) ? { kind: 'consumed', field: a } : `"${a}" is not a pool feeding removes from`;
  if (head === 'converted') return includes(ENZYMES, a!) ? { kind: 'converted', enzyme: a } : `unknown enzyme "${a}"`;
  if (head === 'patchInput') return /^(0|[1-9][0-9]?)$/.test(a!) ? { kind: 'patchInput', index: Number(a) } : `"${a}" is not a patch index`;
  if (head === 'infections' || head === 'wholeUnitCells') {
    if (!SPECIES_RE.test(a!)) return `"${a}" is not a species id`;
    return { kind: head, species: a! };
  }
  if (head === 'transfer') return a === 'fungal' ? { kind: 'transfer', route: 'fungal' } : `"${a}" is not a transfer route (fungal)`;
  return `unknown measurement "${id}"`;
}

/** P5.6: an id with an @REGION suffix (alive.SP, resting.SP, biomass.SP, mean.F, moisture). */
function parseRegionMeasure(id: string, base: string, region: string): MeasureRef | string {
  if (!REGION_RE.test(region)) return `"${region}" is not a region id`;
  const parts = base.split('.');
  const [head, a] = parts;
  if (head === 'moisture' && parts.length === 1) return { kind: 'regionMoisture', region };
  if (head === 'mean' && parts.length === 2) return isFieldId(a!) ? { kind: 'regionMean', field: a, region } : `unknown field "${a}"`;
  if (includes(REGION_SPECIES_MEASURES, head!) && parts.length === 2) {
    if (!SPECIES_RE.test(a!)) return `"${a}" is not a species id`;
    return { kind: 'region', stat: head, species: a!, region };
  }
  return `"${id}" cannot be measured in a region (alive.SP, resting.SP, biomass.SP, mean.F or moisture, then @REGION)`;
}

export function speciesOfRef(ref: MeasureRef): string | null {
  return 'species' in ref ? ref.species : null;
}

/** P5.6: the region a measurement reads, or null. */
export function regionOfRef(ref: MeasureRef): string | null {
  return ref.kind === 'region' || ref.kind === 'regionMean' || ref.kind === 'regionMoisture' ? ref.region : null;
}

/** P3.9: whether a measurement is a tracked one (recorded only when the observer is asked for it). */
export function isTrackedRef(ref: MeasureRef): boolean {
  switch (ref.kind) {
    case 'infections':
    case 'limitSeconds':
    case 'transfer':
    case 'wholeUnitCells':
    case 'events':
    case 'intakeMode':
    case 'secretingSeconds':
    case 'gateTransfer':
    case 'gateCrossings':
    case 'region':
    case 'regionMean':
    case 'regionMoisture':
      return true;
    default:
      return false;
  }
}

/** The module ids a founder-group name lists (`none` → []). */
export function groupModules(group: string): string[] {
  return group === 'none' ? [] : group.split('+');
}

/** A founder group's name for a module set (sorted ids joined by `+`, or `none`). */
export function groupName(modules: readonly string[]): string {
  return modules.length === 0 ? 'none' : [...modules].sort().join('+');
}

// ------------------------------------------------------------------------------ shared reads

/** Current dish total of one field over the playable cells (carbon for carbon pools). */
export function poolTotal(world: World, id: FieldId): number {
  const arr = world.fields[id];
  if (!arr) return 0;
  const cells = maskCells();
  let s = 0;
  for (let k = 0; k < cells.length; k++) s += arr[cells[k]!]!;
  return s * (FIELD_DEFS[id].carbonPerUnit ?? 1);
}

/** Mean dissolved oxygen over the dish's playable cells (the same measure as History); 0 without the field. */
export function oxygenMean(world: World): number {
  const o2 = world.fields.oxygen;
  if (!o2) return 0;
  const cells = maskCells();
  let s = 0;
  for (let k = 0; k < cells.length; k++) s += o2[cells[k]!]!;
  return s / cells.length;
}

export function aliveCounts(world: World): number[] {
  const out = new Array<number>(world.species.length).fill(0);
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1) out[c.species[i]!]!++;
  return out;
}

/**
 * Carbon logged for each recipe field patch (ledger sources `recipe:patchN[:label]`), indexed by the
 * SOURCE recipe's patch index. An arm realized without patch k logs the later patches renumbered
 * (k+1 as k, …); they are mapped back so patchInput.K always names the same patch in both arms.
 */
export function patchInputsOf(world: World, omittedPatch: number | null = null): number[] {
  const out: number[] = [];
  for (const e of world.ledger.entries) {
    const m = /^recipe:patch(\d+)(?::|$)/.exec(e.source);
    if (!m) continue;
    const logged = Number(m[1]);
    const idx = omittedPatch !== null && logged >= omittedPatch ? logged + 1 : logged;
    while (out.length <= idx) out.push(0);
    out[idx]! += e.c;
  }
  return out;
}

// ------------------------------------------------------------------------------ observer

/**
 * One tracked measure as the observer keeps it (P3.9; P5.6). A gate measure records its start reading and a
 * region measure its region's cells; a gate the dish does not have, or a region its recorded habitat does not
 * record, is a MeasureError here, when the observer is created.
 */
function trackedOf(world: World, id: string, ref: MeasureRef, speciesIds: readonly string[]): Tracked {
  const sp = speciesOfRef(ref);
  let cells: number[] | null = null;
  let inRegion: Uint8Array | null = null;
  let start = 0;
  let virusCode = 0;
  let unitField: FieldId | null = null;
  if (ref.kind === 'gateTransfer' || ref.kind === 'gateCrossings') {
    const r = gateReading(world, ref.gate, ref.kind === 'gateTransfer' ? ref.field : null);
    if (r === null) throw new MeasureError(`${id}: world ${world.worldId} has no ${ref.gate} edge`);
    start = r;
  }
  const region = regionOfRef(ref);
  if (region !== null) {
    const def = (world.content.habitat.regions ?? []).find((r) => r.id === region);
    if (def === undefined) throw new MeasureError(`${id}: the habitat ${world.content.habitat.id} of world ${world.worldId} records no region ${region}`);
    cells = regionCells(def);
    if (ref.kind === 'region') {
      inRegion = new Uint8Array(CELL_COUNT);
      for (const cell of cells) inRegion[cell] = 1;
    }
  }
  if ((ref.kind === 'infections' || ref.kind === 'wholeUnitCells') && ref.virus !== undefined) {
    virusCode = virusCodeOf(ref.virus);
    const f = ref.virus.toLowerCase();
    unitField = isFieldId(f) ? f : null;
  }
  return { id, ref, species: sp === null ? -1 : speciesIds.indexOf(sp), value: 0, cells, inRegion, start, virusCode, unitField };
}

const NO_CAUSES = REASONS.length;

export interface ArmObserverOptions {
  /** Pools whose consumption by feeding is measured (consumed.F); only these are tracked. */
  readonly pools?: readonly ConsumablePool[];
  /** The source recipe's patch index this arm was realized without (an omitPatch setup change). */
  readonly omittedPatch?: number | null;
  /**
   * P3.9: measurement ids to track (infections.SP, limitSeconds.SP.REASON, transfer.fungal,
   * wholeUnitCells.SP; other ids are ignored). Only these are recorded, so an observer asked for none
   * (the comparison engine's) does no extra work.
   */
  readonly observe?: readonly string[];
}

/** Scratch cell marks for wholeUnitCells (always all 0 between uses). */
const cellMark = new Uint8Array(CELL_COUNT);

/** One tracked measure's running value (P3.9). */
interface Tracked {
  readonly id: string;
  readonly ref: MeasureRef;
  /** Species index in this world (−1: not in this world, so it stays 0). */
  readonly species: number;
  value: number;
  /** P5.6 region measures: the region's cells (regionCells of the world's recorded habitat); null otherwise. */
  readonly cells: readonly number[] | null;
  /** P5.6 region species measures: 1 per cell of the region (CELL_COUNT); null otherwise. */
  readonly inRegion: Uint8Array | null;
  /** P5.6 gate measures: the reading when the observer started; 0 otherwise. */
  readonly start: number;
  /** P5.6 virus-restricted infections / wholeUnitCells: the virus's infectedBy code and unit field. */
  readonly virusCode: number;
  readonly unitField: FieldId | null;
}

/** P5.6: the dish's gate reading (objectives.ts WORLD_GATES, read here without importing objectives.ts, which imports this file). */
function gateTallyRecordOf(world: World, id: number): World['gateTally'][number] | undefined {
  const list = world.gateTally;
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (list[mid]!.id < id) lo = mid + 1;
    else hi = mid;
  }
  const t = list[lo];
  return t !== undefined && t.id === id ? t : undefined;
}

/**
 * P5.6: the cumulative tally of the dish's edges of structure `gate` — field `field` moved (|flux|, field units)
 * or, with field null, organism crossings — or null when the dish has no edge of that kind. The same sum as
 * objectives.ts WORLD_GATES.transferred / organisms (current edges in store order). Reads only.
 */
export function gateReading(world: World, gate: string, field: FieldId | null): number | null {
  let found = false;
  let sum = 0;
  for (const e of world.edges) {
    if (e.kind !== gate) continue;
    found = true;
    const t = gateTallyRecordOf(world, e.id);
    if (t === undefined) continue;
    sum += field === null ? t.organisms : (t.fields[field] ?? 0);
  }
  return found ? sum : null;
}

/** The infectedBy code of a virus species (viruses.ts VIRUSES: V01 → 1, V02 → 2), found by its code. */
function virusCodeOf(virus: string): number {
  for (let code = 1; code < 16; code++) if (virusIdOfCode(code) === virus) return code;
  return 0;
}

/** P5.6 per-slot scratch for intakePhoto / intakeSugar (birthId and intakeAccum at the stage 5 hook). */
interface ModeScratch {
  readonly birth: Uint32Array;
  readonly accum: Float64Array;
}

/**
 * Per-arm, read-only observer. Construct it when the arm starts; step the world with `hook` as its
 * stage hook and call `afterTick` after every step.
 */
export class ArmObserver {
  readonly startTick: number;
  readonly speciesIds: readonly string[];
  readonly biomassStart: Float64Array;
  readonly intake: Float64Array;
  readonly births: Float64Array;
  readonly deaths: Float64Array;
  /** species × reason code (death records that name their species). */
  readonly causes: Float64Array;
  /** Indexed by reason code: every death record with a cause. */
  readonly byCause: Float64Array;
  readonly captures: Float64Array;
  readonly capturedCarbon: Float64Array;
  readonly everPresent: Uint8Array;
  readonly extinctAt: Float64Array;
  /** Most energy each species held above the normal cap at the end of any tick of the run. */
  readonly reservePeak: Float64Array;
  readonly consumed: Partial<Record<ConsumablePool, number>> = {};
  readonly patchInputs: readonly number[];
  /** P5.6: living organisms of each species with glowState 1 when the observer started (glowingStart.SP). */
  readonly glowingStart: Float64Array;
  /** P5.6: dish second (record tick / 10) of each species' first 'capture' record in the run, −1 if none. */
  readonly firstCaptureAt: Float64Array;
  /** Founder groups, in first-seen order: "SP.GROUP", species index, members at the start. */
  readonly groupKeys: string[] = [];
  readonly groupSpecies: number[] = [];
  readonly groupFounders: number[] = [];
  readonly groupExtinctAt: number[] = [];
  /** Group index by birthId (−1: born of no start group, or introduced during the run). */
  private readonly groupOf: number[];
  interventionAccepted = 0;
  interventionRejected = 0;
  /** Ticks during the run in which the agent cap blocked a birth or placement. */
  capacityTicks = 0;
  /** Inclusive absolute tick ranges [from, to] that were capacity-limited. */
  readonly intervals: [number, number][] = [];
  /** External carbon logged in this world when the observer started. */
  readonly inputStart: number;
  private readonly conversionStart: { readonly starch: number; readonly oil: number; readonly protein: number };
  private readonly tracked: readonly ConsumablePool[];
  private readonly pre6Intake: Float64Array;
  private readonly post6Intake: Float64Array;
  private readonly pre6Pool: Float64Array;
  private readonly heldNow: Float64Array;
  private readonly watched: { readonly cmd: { readonly result?: CommandResult }; counted: boolean }[] = [];
  private lastEventId: number;
  private lastSecond: number;
  private pendingBirths: number[];
  private pendingDeaths: number[];
  private lastCapacityTicks: number;
  /** P3.9 tracked measures, by id (insertion = first-requested order). */
  private readonly trackedMeasures: Tracked[] = [];
  private pendingTransfer: number;
  /** P5.6 tracked event counts (events.TYPE.SP) and intake-by-mode measures, split out of trackedMeasures. */
  private readonly eventCounts: Tracked[] = [];
  private readonly modeIntake: Tracked[] = [];
  private modeScratch: ModeScratch | null = null;
  /** Stage hook for step(); reads only. */
  readonly hook: (stage: number, world: World) => void;

  constructor(world: World, opts: ArmObserverOptions = {}) {
    const n = world.species.length;
    this.startTick = world.tick;
    this.speciesIds = world.species.map((s) => s.id);
    this.biomassStart = new Float64Array(n);
    this.intake = new Float64Array(n);
    this.births = new Float64Array(n);
    this.deaths = new Float64Array(n);
    this.causes = new Float64Array(n * NO_CAUSES);
    this.byCause = new Float64Array(NO_CAUSES);
    this.captures = new Float64Array(n);
    this.capturedCarbon = new Float64Array(n);
    this.everPresent = new Uint8Array(n);
    this.extinctAt = new Float64Array(n).fill(-1);
    this.glowingStart = new Float64Array(n);
    this.firstCaptureAt = new Float64Array(n).fill(-1);
    this.reservePeak = new Float64Array(n);
    this.heldNow = new Float64Array(n);
    this.pre6Intake = new Float64Array(n);
    this.post6Intake = new Float64Array(n);
    this.tracked = (opts.pools ?? []).filter((f) => world.fields[f] !== undefined);
    this.pre6Pool = new Float64Array(this.tracked.length);
    for (const f of this.tracked) this.consumed[f] = 0;
    this.groupOf = new Array<number>(world.counters.nextBirthId).fill(-1);
    const c = world.ents.cols;
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      const s = c.species[i]!;
      this.biomassStart[s]! += c.B[i]!;
      this.everPresent[s] = 1;
      if (c.glowState[i] === 1) this.glowingStart[s]!++;
      const key = `${this.speciesIds[s]}.${groupName(world.genomes.get(c.genome[i]!).modules)}`;
      let g = this.groupKeys.indexOf(key);
      if (g < 0) {
        g = this.groupKeys.length;
        this.groupKeys.push(key);
        this.groupSpecies.push(s);
        this.groupFounders.push(0);
        this.groupExtinctAt.push(-1);
      }
      this.groupFounders[g]!++;
      this.groupOf[c.birthId[i]!] = g;
    }
    this.conversionStart = { ...world.conversionTotals };
    this.inputStart = world.ledger.inputs.c;
    this.patchInputs = patchInputsOf(world, opts.omittedPatch ?? null);
    this.lastEventId = world.counters.nextEventId - 1;
    this.lastSecond = world.history.seconds.at(-1)?.second ?? -1;
    this.pendingBirths = world.history.pendingBirths.slice();
    this.pendingDeaths = world.history.pendingDeaths.slice();
    this.lastCapacityTicks = world.capacityLimitedTicks;
    this.pendingTransfer = world.history.pendingFungalTransfer ?? 0;
    for (const id of opts.observe ?? []) {
      const ref = parseMeasure(id);
      if (typeof ref === 'string' || !isTrackedRef(ref) || this.trackedMeasures.some((t) => t.id === id)) continue;
      const t = trackedOf(world, id, ref, this.speciesIds);
      this.trackedMeasures.push(t);
      if (ref.kind === 'events') this.eventCounts.push(t);
      if (ref.kind === 'intakeMode') this.modeIntake.push(t);
    }
    const infections = this.trackedMeasures.filter((t) => t.ref.kind === 'infections' && t.species >= 0);
    const modeIntake = this.modeIntake.filter((t) => t.species >= 0);
    if (modeIntake.length > 0) this.modeScratch = { birth: new Uint32Array(AGENT_CAP), accum: new Float64Array(AGENT_CAP) };
    this.hook = (stage, w) => {
      if (stage === 5 && infections.length > 0) this.countInfections(w, infections);
      if (this.modeScratch !== null && (stage === 5 || stage === 6)) this.intakeByMode(w, stage, modeIntake, this.modeScratch);
      if (stage === 5) {
        this.sumIntake(w, this.pre6Intake);
        for (let k = 0; k < this.tracked.length; k++) this.pre6Pool[k] = poolTotal(w, this.tracked[k]!);
      } else if (stage === 6) {
        const now = this.post6Intake;
        this.sumIntake(w, now);
        for (let s = 0; s < now.length; s++) this.intake[s]! += now[s]! - this.pre6Intake[s]!;
        for (let k = 0; k < this.tracked.length; k++) {
          const f = this.tracked[k]!;
          this.consumed[f] = this.consumed[f]! + (this.pre6Pool[k]! - poolTotal(w, f));
        }
      }
    };
  }

  /** After stage 5: organisms infected this tick hold infectedBy ≠ 0 with the timer still at 0 (viruses.ts). */
  private countInfections(world: World, list: readonly Tracked[]): void {
    const c = world.ents.cols;
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] !== 1 || c.infectedBy[i] === 0 || c.infectionTimer[i] !== 0) continue;
      for (const t of list) if (t.species === c.species[i] && (t.virusCode === 0 || t.virusCode === c.infectedBy[i])) t.value++;
    }
  }

  /**
   * P5.6 intakePhoto / intakeSugar: at the stage 5 hook, each living organism's birthId and intakeAccum; at the
   * stage 6 hook, the same organism's intake since then is added under the mode its metabolicMode column reads.
   */
  private intakeByMode(world: World, stage: number, list: readonly Tracked[], scratch: ModeScratch): void {
    const c = world.ents.cols;
    const hw = world.ents.highWater;
    if (stage === 5) {
      for (let i = 0; i < hw; i++) {
        scratch.birth[i] = c.alive[i] === 1 ? c.birthId[i]! : 0;
        scratch.accum[i] = c.intakeAccum[i]!;
      }
      return;
    }
    for (let i = 0; i < hw; i++) {
      if (c.alive[i] !== 1 || scratch.birth[i] !== c.birthId[i]) continue;
      const mode = c.metabolicMode[i];
      if (mode !== MODE_PHOTO && mode !== MODE_SUGAR) continue;
      const d = c.intakeAccum[i]! - scratch.accum[i]!;
      if (d === 0) continue;
      for (const t of list) if (t.species === c.species[i] && (t.ref.kind === 'intakeMode' && (t.ref.mode === 'photo') === (mode === MODE_PHOTO))) t.value += d;
    }
  }

  /** The P3.9 tracked measures after a tick (limit seconds, fungal transfer, whole-unit cells). */
  private afterTickTracked(world: World, pushed: { readonly fungalTransfer?: number } | null): void {
    const h = world.history;
    const pending = h.pendingFungalTransfer ?? 0;
    const moved = (pushed?.fungalTransfer ?? 0) + pending - this.pendingTransfer;
    this.pendingTransfer = pending;
    const c = world.ents.cols;
    for (const t of this.trackedMeasures) {
      const ref = t.ref;
      if (ref.kind === 'transfer') {
        t.value += moved;
        continue;
      }
      if (t.species < 0) continue;
      if (ref.kind === 'secretingSeconds') {
        let n = 0;
        for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && c.species[i] === t.species && c.secreting[i] !== 0) n++;
        t.value += n / TICKS_PER_SECOND;
        continue;
      }
      if (ref.kind === 'limitSeconds') {
        const suit = isSuitabilityReason(REASONS[ref.reason]!);
        let n = 0;
        for (let i = 0; i < world.ents.highWater; i++) {
          if (c.alive[i] !== 1 || c.species[i] !== t.species) continue;
          const code = suit ? entitySuitabilityAt(world, i, world.species[t.species]!, profileOf(world, i), entityCell(c.x[i]!, c.y[i]!)).reason : c.limitCode[i]!;
          if (code === ref.reason) n++;
        }
        t.value += n / TICKS_PER_SECOND;
      } else if (ref.kind === 'wholeUnitCells') {
        const units = world.fields[t.unitField ?? 'v01'];
        if (!units) continue;
        const seen: number[] = [];
        for (let i = 0; i < world.ents.highWater; i++) {
          if (c.alive[i] !== 1 || c.species[i] !== t.species) continue;
          const cell = entityCell(c.x[i]!, c.y[i]!);
          if (units[cell]! >= 1 && cellMark[cell] === 0) {
            cellMark[cell] = 1;
            seen.push(cell);
          }
        }
        for (const cell of seen) cellMark[cell] = 0;
        if (seen.length > t.value) t.value = seen.length;
      }
    }
  }

  /**
   * A tracked measure's value, or undefined when this observer does not track it. The P5.6 gate and region
   * measures are read from the world now (gate: the reading minus its start; region: a pass over its cells).
   */
  trackedValue(id: string, world?: World): number | undefined {
    const t = this.trackedMeasures.find((m) => m.id === id);
    if (t === undefined) return undefined;
    const ref = t.ref;
    if (world === undefined) return t.value;
    switch (ref.kind) {
      case 'gateTransfer':
      case 'gateCrossings':
        return (gateReading(world, ref.gate, ref.kind === 'gateTransfer' ? ref.field : null) ?? t.start) - t.start;
      case 'regionMean':
      case 'regionMoisture': {
        const arr = ref.kind === 'regionMean' ? world.fields[ref.field] : world.derived.moisture;
        const cells = t.cells!;
        if (!arr || cells.length === 0) return 0;
        let sum = 0;
        for (let k = 0; k < cells.length; k++) sum += arr[cells[k]!]!;
        return sum / cells.length;
      }
      case 'region': {
        if (t.species < 0) return 0;
        const c = world.ents.cols;
        const mask = t.inRegion!;
        let v = 0;
        for (let i = 0; i < world.ents.highWater; i++) {
          if (c.alive[i] !== 1 || c.species[i] !== t.species || mask[entityCell(c.x[i]!, c.y[i]!)] !== 1) continue;
          if (ref.stat === 'alive') v++;
          else if (ref.stat === 'biomass') v += c.B[i]!;
          else if (c.lifeState[i] !== LIFE_ACTIVE) v++;
        }
        return v;
      }
      default:
        return t.value;
    }
  }

  /** The ids this observer tracks (P3.9), in the order requested. */
  trackedIds(): string[] {
    return this.trackedMeasures.map((t) => t.id);
  }

  private sumIntake(world: World, out: Float64Array): void {
    out.fill(0);
    const c = world.ents.cols;
    for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1) out[c.species[i]!]! += c.intakeAccum[i]!;
  }

  /**
   * Count a command applied to this arm as the run's intervention (interventionAccepted/Rejected).
   * A command already applied counts now; one queued for a later tick counts when it is applied.
   */
  watchIntervention(cmd: { readonly result?: CommandResult }): void {
    const w = { cmd, counted: false };
    this.watched.push(w);
    this.countWatched();
  }

  private countWatched(): void {
    for (const w of this.watched) {
      if (w.counted || w.cmd.result === undefined) continue;
      w.counted = true;
      this.interventionAccepted += w.cmd.result.accepted;
      this.interventionRejected += w.cmd.result.rejected;
    }
  }

  /** Call once after every step of this arm's world. */
  afterTick(world: World): void {
    const h = world.history;
    const last = h.seconds.at(-1);
    const pushed = last !== undefined && last.second !== this.lastSecond ? last : null;
    if (last) this.lastSecond = last.second;
    // Births/deaths this tick = (sample closed this tick ? its count : 0) + pending now − pending before.
    for (let s = 0; s < this.births.length; s++) {
      this.births[s]! += (pushed ? pushed.births[s]! : 0) + h.pendingBirths[s]! - this.pendingBirths[s]!;
      this.deaths[s]! += (pushed ? pushed.deaths[s]! : 0) + h.pendingDeaths[s]! - this.pendingDeaths[s]!;
    }
    this.pendingBirths = h.pendingBirths.slice();
    this.pendingDeaths = h.pendingDeaths.slice();
    if (this.trackedMeasures.length > 0) this.afterTickTracked(world, pushed);
    // Causes and captures come from the detailed event records emitted since the previous tick.
    const ring = world.events.ring;
    let k = ring.length;
    while (k > 0 && ring[k - 1]!.id > this.lastEventId) k--;
    for (; k < ring.length; k++) {
      const ev = ring[k]!;
      if (ev.type === 'death' && ev.cause !== undefined && ev.cause >= 0 && ev.cause < NO_CAUSES) {
        this.byCause[ev.cause]!++;
        if (ev.species !== undefined) this.causes[ev.species * NO_CAUSES + ev.cause]!++;
      } else if (ev.type === 'capture' && ev.species !== undefined) {
        this.captures[ev.species]!++;
        this.capturedCarbon[ev.species]! += ev.amount ?? 0;
        // A record's tick is the tick that ran (world.tick − 1 after it); the dish clock then reads tick + 1 (cards-curated, E214).
        if (this.firstCaptureAt[ev.species]! < 0) this.firstCaptureAt[ev.species] = (ev.tick + 1) / TICKS_PER_SECOND;
      }
      if (this.eventCounts.length > 0 && ev.species !== undefined)
        for (const t of this.eventCounts) if (t.species === ev.species && t.ref.kind === 'events' && t.ref.type === ev.type) t.value++;
    }
    this.lastEventId = world.counters.nextEventId - 1;
    // The tick that just ran is world.tick − 1.
    if (world.capacityLimitedTicks > this.lastCapacityTicks) {
      const t = world.tick - 1;
      this.capacityTicks += world.capacityLimitedTicks - this.lastCapacityTicks;
      const tail = this.intervals.at(-1);
      if (tail && tail[1] === t - 1) tail[1] = t;
      else this.intervals.push([t, t]);
    }
    this.lastCapacityTicks = world.capacityLimitedTicks;
    // Founder groups: every birth belongs to its parent's group (lineage parent links are recent records).
    for (let id = this.groupOf.length; id < world.counters.nextBirthId; id++) {
      const parent = lineageField(world.lineage, 'parent', id) ?? 0;
      this.groupOf.push(parent > 0 && parent < id ? (this.groupOf[parent] ?? -1) : -1);
    }
    // Energy held above the normal cap (only a reserve chamber raises the cap).
    const held = this.heldNow;
    held.fill(0);
    const c = world.ents.cols;
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      const e = c.E[i]!;
      if (e > ENERGY_CAP_BASE) held[c.species[i]!]! += e - ENERGY_CAP_BASE;
    }
    for (let s = 0; s < held.length; s++) if (held[s]! > this.reservePeak[s]!) this.reservePeak[s] = held[s]!;
    if (this.watched.length > 0) this.countWatched();
    if (world.tick % TICKS_PER_SECOND === 0) {
      const alive = aliveCounts(world);
      for (let s = 0; s < alive.length; s++) {
        if (alive[s]! > 0) {
          this.everPresent[s] = 1;
          this.extinctAt[s] = -1;
        } else if (this.everPresent[s] === 1 && this.extinctAt[s]! < 0) this.extinctAt[s] = world.tick / TICKS_PER_SECOND;
      }
      if (this.groupKeys.length > 0) {
        const members = this.groupMembers(world).count;
        for (let g = 0; g < members.length; g++) {
          if (members[g]! > 0) this.groupExtinctAt[g] = -1;
          else if (this.groupExtinctAt[g]! < 0) this.groupExtinctAt[g] = world.tick / TICKS_PER_SECOND;
        }
      }
    }
  }

  /** Founder group index of the living organism in `slot` (−1 when it belongs to none). */
  groupOfSlot(world: World, slot: number): number {
    return this.groupOf[world.ents.cols.birthId[slot]!] ?? -1;
  }

  /** Living members and their summed energy per founder group. */
  groupMembers(world: World): { readonly count: number[]; readonly energy: number[] } {
    const count = new Array<number>(this.groupKeys.length).fill(0);
    const energy = new Array<number>(this.groupKeys.length).fill(0);
    const c = world.ents.cols;
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      const g = this.groupOf[c.birthId[i]!] ?? -1;
      if (g < 0) continue;
      count[g]!++;
      energy[g]! += c.E[i]!;
    }
    return { count, energy };
  }

  /** Living members' energies per founder group, each list ascending (the group's energy distribution). */
  groupEnergyLists(world: World): number[][] {
    const out: number[][] = this.groupKeys.map(() => []);
    const c = world.ents.cols;
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      const g = this.groupOf[c.birthId[i]!] ?? -1;
      if (g >= 0) out[g]!.push(c.E[i]!);
    }
    for (const list of out) list.sort((x, y) => x - y);
    return out;
  }

  converted(world: World, enzyme: Enzyme): number {
    return world.conversionTotals[enzyme] - this.conversionStart[enzyme];
  }

  inputCarbon(world: World): number {
    return world.ledger.inputs.c - this.inputStart;
  }

  /** Deaths (exact, from history) whose cause record was not seen (the event ring overflowed in a tick). */
  unattributedDeaths(): number {
    let deaths = 0;
    let causes = 0;
    for (let s = 0; s < this.deaths.length; s++) deaths += this.deaths[s]!;
    for (let k = 0; k < this.causes.length; k++) causes += this.causes[k]!;
    return deaths - causes;
  }
}

/** Step one arm's world by one tick with its observer attached. */
export function stepObserved(world: World, obs: ArmObserver): void {
  step(world, { afterStage: obs.hook });
  obs.afterTick(world);
}

// ------------------------------------------------------------------------------ named measurements

interface SpeciesAgg {
  readonly alive: number[];
  readonly biomass: number[];
  readonly energy: number[];
  readonly held: number[];
}

function speciesAgg(world: World): SpeciesAgg {
  const n = world.species.length;
  const alive = new Array<number>(n).fill(0);
  const biomass = new Array<number>(n).fill(0);
  const energy = new Array<number>(n).fill(0);
  const held = new Array<number>(n).fill(0);
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const s = c.species[i]!;
    alive[s]!++;
    biomass[s]! += c.B[i]!;
    energy[s]! += c.E[i]!;
    if (c.E[i]! > ENERGY_CAP_BASE) held[s]! += c.E[i]! - ENERGY_CAP_BASE;
  }
  return { alive, biomass, energy, held };
}

/** Measure one arm. `ids` restricts the record to those ids (a gate); null gives the full catalog. */
export function measureArm(world: World, obs: ArmObserver, ids: readonly string[] | null): Record<string, number> {
  let agg: SpeciesAgg | null = null;
  const getAgg = () => (agg ??= speciesAgg(world));
  let groups: { readonly count: number[]; readonly energy: number[] } | null = null;
  const getGroups = () => (groups ??= obs.groupMembers(world));
  let dist: number[][] | null = null;
  const getDist = () => (dist ??= obs.groupEnergyLists(world));
  const spIdx = (id: string) => {
    const i = obs.speciesIds.indexOf(id);
    if (i < 0) throw new MeasureError(`species ${id} is not enabled in world ${world.worldId}`);
    return i;
  };
  const value = (ref: MeasureRef, id: string): number => {
    switch (ref.kind) {
      case 'scalar':
        switch (ref.name) {
          case 'seconds':
            return world.tick / TICKS_PER_SECOND;
          case 'runSeconds':
            return (world.tick - obs.startTick) / TICKS_PER_SECOND;
          case 'aliveTotal':
            return getAgg().alive.reduce((a, b) => a + b, 0);
          case 'biomassTotal':
            return getAgg().biomass.reduce((a, b) => a + b, 0);
          case 'speciesAlive':
            return getAgg().alive.filter((a) => a > 0).length;
          case 'oxygenMean':
            return oxygenMean(world);
          case 'inputCarbon':
            return obs.inputCarbon(world);
          case 'interventionAccepted':
            return obs.interventionAccepted;
          case 'interventionRejected':
            return obs.interventionRejected;
        }
        break;
      case 'species': {
        const s = spIdx(ref.species);
        const a = getAgg();
        switch (ref.stat) {
          case 'alive':
            return a.alive[s]!;
          case 'biomass':
            return a.biomass[s]!;
          case 'biomassStart':
            return obs.biomassStart[s]!;
          case 'biomassRatio':
            return obs.biomassStart[s]! > 0 ? a.biomass[s]! / obs.biomassStart[s]! : 0;
          case 'births':
            return obs.births[s]!;
          case 'deaths':
            return obs.deaths[s]!;
          case 'intake':
            return obs.intake[s]!;
          case 'captures':
            return obs.captures[s]!;
          case 'capturedCarbon':
            return obs.capturedCarbon[s]!;
          case 'meanEnergy':
            return a.alive[s]! > 0 ? a.energy[s]! / a.alive[s]! : 0;
          case 'extinctAt':
            return obs.extinctAt[s]!;
          case 'preyBiomass': {
            const prey = world.species[s]!.prey;
            let sum = 0;
            for (let j = 0; j < prey.length; j++) if (prey[j]! >= 0) sum += a.biomass[j]!;
            return sum;
          }
          case 'reserveHeld':
            return a.held[s]!;
          case 'reservePeak':
            return obs.reservePeak[s]!;
        }
        break;
      }
      case 'deathCause':
        return obs.causes[spIdx(ref.species) * NO_CAUSES + ref.cause]!;
      case 'group': {
        spIdx(ref.species);
        const g = obs.groupKeys.indexOf(`${ref.species}.${ref.group}`);
        // A group with no member at the start of the run is empty throughout.
        if (g < 0) return ref.stat === 'groupExtinctAt' ? -1 : 0;
        switch (ref.stat) {
          case 'founders':
            return obs.groupFounders[g]!;
          case 'descendants':
            return getGroups().count[g]!;
          case 'groupEnergy': {
            const m = getGroups();
            return m.count[g]! > 0 ? m.energy[g]! / m.count[g]! : 0;
          }
          case 'groupExtinctAt':
            return obs.groupExtinctAt[g]!;
          case 'groupEnergyMedian':
          case 'groupEnergyMin':
          case 'groupEnergyMax': {
            const list = getDist()[g]!;
            if (list.length === 0) return 0;
            return ref.stat === 'groupEnergyMin' ? list[0]! : ref.stat === 'groupEnergyMax' ? list[list.length - 1]! : median(list);
          }
        }
        break;
      }
      case 'field':
        return world.fields[ref.field] ? poolTotal(world, ref.field) : 0;
      case 'consumed': {
        const v = obs.consumed[ref.field];
        if (v === undefined) throw new MeasureError(`consumption of ${ref.field} is not tracked in world ${world.worldId}`);
        return v;
      }
      case 'converted':
        return obs.converted(world, ref.enzyme);
      case 'patchInput':
        return obs.patchInputs[ref.index] ?? 0;
      case 'infections':
      case 'limitSeconds':
      case 'transfer':
      case 'wholeUnitCells':
      case 'events':
      case 'intakeMode':
      case 'secretingSeconds':
      case 'region':
      case 'gateTransfer':
      case 'gateCrossings':
      case 'regionMean':
      case 'regionMoisture': {
        const sp = speciesOfRef(ref);
        if (sp !== null) spIdx(sp);
        const v = obs.trackedValue(id, world);
        if (v === undefined) throw new MeasureError(`${id} is not tracked in world ${world.worldId}`);
        return v;
      }
      case 'state': {
        const s = spIdx(ref.species);
        const c = world.ents.cols;
        let n = 0;
        for (let i = 0; i < world.ents.highWater; i++) {
          if (c.alive[i] !== 1 || c.species[i] !== s) continue;
          if (ref.stat === 'resting' ? c.lifeState[i] !== LIFE_ACTIVE : ref.stat === 'glowing' ? c.glowState[i] === 1 : c.hostBirthId[i] !== 0) n++;
        }
        return n;
      }
      case 'glowingStart':
        return obs.glowingStart[spIdx(ref.species)]!;
      case 'firstCaptureAt':
        return obs.firstCaptureAt[spIdx(ref.species)]!;
    }
    throw new MeasureError('unreachable measurement');
  };
  const out: Record<string, number> = {};
  const list = ids ?? catalogIds(world, obs);
  for (const id of list) {
    const ref = parseMeasure(id);
    if (typeof ref === 'string') throw new MeasureError(ref);
    out[id] = value(ref, id);
  }
  return out;
}

/** Every measurement id defined for this arm (deaths by cause only where non-zero). */
export function catalogIds(world: World, obs: ArmObserver): string[] {
  const ids: string[] = [...SCALAR_MEASURES];
  obs.speciesIds.forEach((sp, s) => {
    for (const stat of SPECIES_MEASURES) ids.push(`${stat}.${sp}`);
    for (let cause = 0; cause < NO_CAUSES; cause++) if (obs.causes[s * NO_CAUSES + cause]! > 0) ids.push(`deaths.${sp}.${REASONS[cause]}`);
  });
  for (const key of obs.groupKeys) for (const stat of GROUP_MEASURES) ids.push(`${stat}.${key}`);
  for (const id of FIELD_IDS) if (world.fields[id] && FIELD_DEFS[id].material !== 'none') ids.push(`field.${id}`);
  ids.push('field.oxygen');
  for (const f of CONSUMABLE_POOLS) if (obs.consumed[f] !== undefined) ids.push(`consumed.${f}`);
  for (const e of ENZYMES) ids.push(`converted.${e}`);
  obs.patchInputs.forEach((_, i) => ids.push(`patchInput.${i}`));
  // P3.9 tracked measures exist only where the observer was asked for them (in the order asked).
  ids.push(...obs.trackedIds());
  return ids;
}

// ------------------------------------------------------------------------------ comparison summary

export interface Intervention {
  readonly commandId: string;
  readonly payload: CommandPayload;
  readonly result: CommandResult | null;
}

export interface SpeciesSummary {
  readonly idx: number;
  readonly id: string;
  readonly name: string;
  readonly count: number;
  readonly biomass: number;
  readonly births: number;
  readonly deaths: number;
}

/** Distribution of one quantitative locus among the living members of one species. */
export interface TraitDistribution {
  readonly species: number;
  readonly locus: number;
  readonly locusName: string;
  readonly n: number;
  readonly median: number;
  readonly min: number;
  readonly max: number;
}

/** How many living members of a species carry a supplementary module (genome modules only). */
export interface ModuleFrequency {
  readonly species: number;
  readonly moduleId: string;
  /** Player-facing name from the world's recorded module registry. */
  readonly name: string;
  readonly count: number;
  /** count / living members of that species. */
  readonly share: number;
}

export interface DeathCause {
  /** Reason code (DEATH_*), see src/sim/reasons.ts. */
  readonly cause: number;
  readonly name: string;
  readonly count: number;
}

export interface ArmMeasures {
  readonly tick: number;
  readonly hash: string;
  readonly alive: number;
  readonly biomass: number;
  readonly species: readonly SpeciesSummary[];
  /** Diversity: kinds of organism with at least one living member. */
  readonly speciesAlive: number;
  /**
   * Diversity index: Shannon H = −Σ pᵢ ln pᵢ with pᵢ = living count of species i / all living
   * organisms (natural log; 0 when one kind or none is alive, ln k when k kinds are equally common).
   */
  readonly shannon: number;
  /** Mean dissolved oxygen over the dish's playable cells (the same measure as History). */
  readonly oxygenMean: number;
  readonly births: number;
  readonly deaths: number;
  readonly deathsByCause: readonly DeathCause[];
  /** Deaths whose detailed event record was not kept (the event ring overflowed within a tick). */
  readonly deathsUnattributed: number;
  readonly traits: readonly TraitDistribution[];
  readonly modules: readonly ModuleFrequency[];
  /** Ticks during this paired run in which the simulation's agent cap blocked a birth or placement. */
  readonly capacityLimitedTicks: number;
  /** Inclusive tick ranges [from, to] (absolute simulation ticks) that were capacity-limited. */
  readonly capacityIntervals: readonly (readonly [number, number])[];
  /** Carbon externally added to this arm since the baseline was captured (interventions, schedules). */
  readonly carbonAdded: number;
}

export interface MeasureRow {
  readonly key: 'alive' | 'biomass' | 'speciesAlive' | 'shannon' | 'oxygenMean' | 'births' | 'deaths' | 'capacitySeconds' | 'carbonAdded' | 'speciesCount' | 'speciesBiomass';
  /** Species index for per-species rows. */
  readonly species?: number;
  readonly a: number;
  readonly b: number;
  /** Absolute difference in game units, B − A (never a percentage). */
  readonly diff: number;
}

export interface ComparisonResults {
  readonly label: typeof PAIRED_RUN_LABEL;
  readonly baselineTick: number;
  /** Ticks each arm advanced during the paired run (always equal). */
  readonly ticks: number;
  readonly horizonTicks: number | null;
  readonly stoppedEarly: boolean;
  readonly interventions: readonly Intervention[];
  readonly a: ArmMeasures;
  readonly b: ArmMeasures;
  readonly rows: readonly MeasureRow[];
}

export function median(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const m = n >> 1;
  return n % 2 === 1 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

/** Shannon H over living counts (natural log). */
export function shannonIndex(counts: readonly number[]): number {
  let total = 0;
  for (const c of counts) total += c;
  if (total <= 0) return 0;
  let h = 0;
  for (const c of counts) {
    if (c <= 0) continue;
    const p = c / total;
    h -= p * Math.log(p);
  }
  return h === 0 ? 0 : h;
}

/**
 * The comparison panel's summary of one arm. Pure read of world state plus the observer; `hash` is
 * the arm's state hash at this moment, `inputBase` the external carbon it had when the baseline was
 * captured (carbonAdded counts from there).
 */
export function measureSummary(world: World, obs: ArmObserver, hash: string, inputBase: number): ArmMeasures {
  const e = world.ents;
  const c = e.cols;
  const nSp = world.species.length;
  const count = new Array<number>(nSp).fill(0);
  const biomass = new Array<number>(nSp).fill(0);
  const loci: number[][][] = Array.from({ length: nSp }, () => [] as number[][]);
  const moduleCounts: { id: string; count: number }[][] = Array.from({ length: nSp }, () => []);
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const s = c.species[i]!;
    count[s]!++;
    biomass[s]! += c.B[i]!;
    const g = world.genomes.get(c.genome[i]!);
    const perLocus = loci[s]!;
    // Per organism: E03 makes the dormancy locus active for its carrier (SPEC §8.2, phenotype.ts).
    const act = activeLoci(world.species[s]!, g);
    for (let l = 0; l < g.loci.length; l++) if (act[l]) (perLocus[l] ??= []).push(g.loci[l]!);
    const mods = moduleCounts[s]!;
    for (const id of g.modules) {
      const found = mods.find((m) => m.id === id);
      if (found) found.count++;
      else mods.push({ id, count: 1 });
    }
  }
  const species: SpeciesSummary[] = world.species.map((sp, idx) => ({
    idx,
    id: sp.id,
    name: sp.def.name,
    count: count[idx]!,
    biomass: biomass[idx]!,
    births: obs.births[idx]!,
    deaths: obs.deaths[idx]!,
  }));
  const traits: TraitDistribution[] = [];
  for (let s = 0; s < nSp; s++) {
    const perLocus = loci[s]!;
    for (let l = 0; l < perLocus.length; l++) {
      const vals = (perLocus[l] ?? []).slice().sort((x, y) => x - y);
      if (vals.length === 0) continue;
      traits.push({
        species: s,
        locus: l,
        locusName: world.content.loci.find((d) => d.index === l)?.name ?? `locus ${l}`,
        n: vals.length,
        median: median(vals),
        min: vals[0]!,
        max: vals[vals.length - 1]!,
      });
    }
  }
  const modules: ModuleFrequency[] = [];
  for (let s = 0; s < nSp; s++) {
    const mods = moduleCounts[s]!.slice().sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    for (const m of mods) modules.push({ species: s, moduleId: m.id, name: world.content.modules.find((d) => d.id === m.id)?.name ?? m.id, count: m.count, share: count[s]! > 0 ? m.count / count[s]! : 0 });
  }
  const deathsByCause: DeathCause[] = [];
  let attributed = 0;
  obs.byCause.forEach((n, cause) => {
    if (n <= 0) return;
    attributed += n;
    deathsByCause.push({ cause, name: REASONS[cause] ?? 'NONE', count: n });
  });
  const deaths = obs.deaths.reduce((a, b) => a + b, 0);
  let alive = 0;
  let totalB = 0;
  for (let s = 0; s < nSp; s++) {
    alive += count[s]!;
    totalB += biomass[s]!;
  }
  return {
    tick: world.tick,
    hash,
    alive,
    biomass: totalB,
    species,
    speciesAlive: count.filter((n) => n > 0).length,
    shannon: shannonIndex(count),
    oxygenMean: oxygenMean(world),
    births: obs.births.reduce((a, b) => a + b, 0),
    deaths,
    deathsByCause,
    deathsUnattributed: Math.max(0, deaths - attributed),
    traits,
    modules,
    capacityLimitedTicks: obs.capacityTicks,
    capacityIntervals: obs.intervals.map(([a, b]) => [a, b] as const),
    carbonAdded: world.ledger.inputs.c - inputBase,
  };
}

/** The measures table: every row is A, B and the absolute difference B − A in game units. */
export function measureRows(a: ArmMeasures, b: ArmMeasures): MeasureRow[] {
  const row = (key: MeasureRow['key'], va: number, vb: number, species?: number): MeasureRow => ({ key, ...(species !== undefined ? { species } : {}), a: va, b: vb, diff: vb - va });
  const rows: MeasureRow[] = [
    row('alive', a.alive, b.alive),
    row('biomass', a.biomass, b.biomass),
    row('speciesAlive', a.speciesAlive, b.speciesAlive),
    row('shannon', a.shannon, b.shannon),
    row('oxygenMean', a.oxygenMean, b.oxygenMean),
    row('births', a.births, b.births),
    row('deaths', a.deaths, b.deaths),
    row('capacitySeconds', a.capacityLimitedTicks / 10, b.capacityLimitedTicks / 10),
    row('carbonAdded', a.carbonAdded, b.carbonAdded),
  ];
  for (let s = 0; s < a.species.length; s++) {
    const sa = a.species[s]!;
    const sb = b.species[s]!;
    if (sa.count === 0 && sb.count === 0 && sa.deaths === 0 && sb.deaths === 0) continue;
    rows.push(row('speciesCount', sa.count, sb.count, s));
    rows.push(row('speciesBiomass', sa.biomass, sb.biomass, s));
  }
  return rows;
}

// ------------------------------------------------------------------------------ the paired run

/** What a paired run needs from its baseline: the start tick and the external carbon logged by then. */
export interface BaselineRef {
  readonly tick: number;
  readonly ledger: { readonly inputs: { readonly c: number } };
}

export interface PairedRunOptions {
  /** Observers attached before the arms' setup (an experiment card's); default: new ones now. */
  readonly obsA?: ArmObserver;
  readonly obsB?: ArmObserver;
  /** External carbon B had at its own start when B was not copied from the baseline (a setup change). */
  readonly inputBaseB?: number;
}

/**
 * The paired run: A and B advance together, one tick each per pair (A, then B), so their tick counts
 * are equal after every pair. `horizonTicks === null` runs until the player stops. Wall-clock time
 * only ever paces how many pairs run; it never decides how many ticks either arm receives.
 */
export class PairedRun {
  readonly startTick: number;
  ticksRun = 0;
  readonly obsA: ArmObserver;
  readonly obsB: ArmObserver;
  private readonly inputBaseB: number;

  constructor(
    readonly baseline: BaselineRef,
    readonly a: World,
    readonly b: World,
    readonly horizonTicks: number | null,
    opts: PairedRunOptions = {},
  ) {
    if (a.tick !== b.tick || a.tick !== baseline.tick) throw new Error(`comparison arms must start at the baseline tick ${baseline.tick} (A ${a.tick}, B ${b.tick})`);
    if (horizonTicks !== null && (!Number.isInteger(horizonTicks) || horizonTicks <= 0)) throw new Error(`invalid comparison horizon ${horizonTicks}`);
    this.startTick = a.tick;
    this.obsA = opts.obsA ?? new ArmObserver(a);
    this.obsB = opts.obsB ?? new ArmObserver(b);
    this.inputBaseB = opts.inputBaseB ?? baseline.ledger.inputs.c;
  }

  get done(): boolean {
    return this.horizonTicks !== null && this.ticksRun >= this.horizonTicks;
  }

  /** Advance A by one tick, then B by one tick. */
  stepPair(): void {
    if (this.done) return;
    stepObserved(this.a, this.obsA);
    stepObserved(this.b, this.obsB);
    this.ticksRun++;
    if (this.a.tick !== this.b.tick) throw new Error(`comparison arms diverged in time (A ${this.a.tick}, B ${this.b.tick})`);
  }

  /** The comparison panel's results for the ticks run so far. */
  results(interventions: readonly Intervention[]): ComparisonResults {
    const a = measureSummary(this.a, this.obsA, stateHash(this.a), this.baseline.ledger.inputs.c);
    const b = measureSummary(this.b, this.obsB, stateHash(this.b), this.inputBaseB);
    return {
      label: PAIRED_RUN_LABEL,
      baselineTick: this.startTick,
      ticks: this.ticksRun,
      horizonTicks: this.horizonTicks,
      stoppedEarly: this.horizonTicks !== null && this.ticksRun < this.horizonTicks,
      interventions,
      a,
      b,
      rows: measureRows(a, b),
    };
  }
}
