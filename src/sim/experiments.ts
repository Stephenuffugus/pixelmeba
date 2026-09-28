/**
 * Experiments (SPEC §13.2, CT §10, D06 §8, BUILD_DIRECTIVE P2.5).
 *
 * An experiment card is content: question, recipe, suggested intervention (text plus its applied,
 * structured `change`), predicted tradeoff, measurements, stopping point, confounds, an observation
 * gate and completion behavior (journal stamp; the world keeps running). This module validates cards
 * against their recipe and runs them headlessly:
 *
 * - Single-arm cards realize the recipe and run it.
 * - Paired cards realize arm A (the recipe as written) and arm B, which differs by exactly the
 *   declared change: a setup difference before tick 0 (`omitPatch`, `omitScheduled`, `shade`), or
 *   commands applied to B through the ordinary command path at `atSecond`, after both arms were
 *   duplicated from one serialized state. Both arms then advance as one paired run.
 *
 * Measuring uses the one paired-run model shared with the comparison engine (src/sim/pairedRun.ts):
 * the same observer, stepping and measurement grammar (listed there). Everything measured is
 * observation: a world run by this module is bit-identical to the same world run without it.
 *
 * The same arms and gate run in the app (src/worker/host.ts): `realizeExperimentArms` builds them,
 * `GateWatch` evaluates the gate each simulated second and produces the journal stamp.
 */
import { z } from 'zod';
import type { ContentRegistry } from './content/registry';
import type {
  ExperimentChange,
  ExperimentCommand,
  ExperimentDef,
  Manifest,
  MaterialDef,
  RecipeDef,
  Species,
} from './content/schema';
import { ExperimentCommandSchema } from './content/schema';
import { applyNow, type CommandPayload } from './commands';
import { TICKS_PER_SECOND } from './constants';
import { FIELD_DEFS, isFieldId, type FieldId } from './fields';
import { maskCells } from './grid';
import { checkLedger, type MaterialTotals } from './ledger';
import { divisionBlocker } from './births';
import {
  ArmObserver,
  groupModules,
  measureArm,
  median,
  oxygenMean,
  PairedRun,
  PAIRED_RUN_LABEL,
  parseMeasure,
  poolTotal,
  SINGLE_RUN_LABEL,
  speciesOfRef,
  stepObserved,
  type ConsumablePool,
  type Intervention,
} from './pairedRun';
import { realizeRecipe } from './recipes';
import { reasonName } from './reasons';
import { deserializeWorld, serializeWorld, stateHash } from './serialize';
import { step } from './tick';
import { updateDerived } from './transport';
import type { World } from './world';

// The measurement grammar and observer are the shared paired-run model; re-exported for cards and tests.
export {
  ArmObserver,
  catalogIds,
  CONSUMABLE_POOLS,
  ENZYMES,
  GROUP_MEASURES,
  measureArm,
  PAIRED_RUN_LABEL,
  parseMeasure,
  SCALAR_MEASURES,
  SINGLE_RUN_LABEL,
  SPECIES_MEASURES,
  type ConsumablePool,
  type Enzyme,
  type GroupMeasure,
  type MeasureRef,
  type ScalarMeasure,
  type SpeciesMeasure,
} from './pairedRun';

export class ExperimentError extends Error {}

// ------------------------------------------------------------------------------ observation gate

export const GATE_ARMS = ['A', 'B', 'diff', 'absDiff'] as const;
export type GateArm = (typeof GATE_ARMS)[number];
export const GATE_OPS = ['gt', 'gte', 'lt', 'lte', 'eq', 'ne'] as const;
export type GateOp = (typeof GATE_OPS)[number];

const GateClauseSchema = z
  .object({
    measure: z.string().min(1),
    /** Which arm's value is tested: A, B, B − A ('diff') or |B − A| ('absDiff'). */
    arm: z.enum(GATE_ARMS).default('A'),
    op: z.enum(GATE_OPS),
    value: z.number().refine(Number.isFinite, 'must be finite'),
    label: z.string().optional(),
  })
  .strict();
export type GateClause = z.infer<typeof GateClauseSchema>;

/** An experiment gate is a `custom` predicate whose params hold measurement clauses that must all hold. */
export const GateParamsSchema = z.object({ all: z.array(GateClauseSchema).min(1) }).strict();

export function gateClauses(def: ExperimentDef): GateClause[] {
  if (def.gate.type !== 'custom') throw new ExperimentError(`${def.id}: gate type "${def.gate.type}" is not supported for experiments`);
  const res = GateParamsSchema.safeParse(def.gate.params);
  if (!res.success) throw new ExperimentError(`${def.id}: invalid gate params: ${res.error.issues.map((i) => i.message).join('; ')}`);
  return res.data.all;
}

export interface ClauseResult {
  readonly measure: string;
  readonly arm: GateArm;
  readonly op: GateOp;
  readonly value: number;
  readonly label?: string;
  readonly actual: number;
  readonly pass: boolean;
}

function compare(actual: number, op: GateOp, value: number): boolean {
  switch (op) {
    case 'gt':
      return actual > value;
    case 'gte':
      return actual >= value;
    case 'lt':
      return actual < value;
    case 'lte':
      return actual <= value;
    case 'eq':
      return actual === value;
    case 'ne':
      return actual !== value;
  }
}

/** Evaluate gate clauses against per-arm measurement records (B is null for a single-arm card). */
export function evaluateGate(
  clauses: readonly GateClause[],
  records: { readonly A: Readonly<Record<string, number>>; readonly B: Readonly<Record<string, number>> | null },
): { readonly pass: boolean; readonly clauses: readonly ClauseResult[] } {
  const value = (rec: Readonly<Record<string, number>> | null, id: string): number => {
    if (rec === null) throw new ExperimentError(`gate clause on ${id} needs arm B, but this card has one arm`);
    const v = rec[id];
    if (v === undefined) throw new ExperimentError(`measurement ${id} was not recorded`);
    return v;
  };
  const out = clauses.map((c) => {
    const actual =
      c.arm === 'A'
        ? value(records.A, c.measure)
        : c.arm === 'B'
          ? value(records.B, c.measure)
          : c.arm === 'diff'
            ? value(records.B, c.measure) - value(records.A, c.measure)
            : Math.abs(value(records.B, c.measure) - value(records.A, c.measure));
    return { measure: c.measure, arm: c.arm, op: c.op, value: c.value, ...(c.label !== undefined ? { label: c.label } : {}), actual, pass: compare(actual, c.op, c.value) };
  });
  return { pass: out.every((c) => c.pass), clauses: out };
}

// ------------------------------------------------------------------------------ player steps and living counts

/** A step of a card's completion evidence that the player takes in the app (CT §10.1; completion.playerSteps). */
export type PlayerStep = ExperimentDef['completion']['playerSteps'][number];

/** Steps taken on a paired run's screen; the other steps are taken on the card's own dish. */
export const PAIRED_STEPS: readonly PlayerStep[] = ['viewComparison', 'viewPreyHistory'];

const GROUP_ENERGY_HEADS = ['groupEnergy', 'groupEnergyMedian', 'groupEnergyMin', 'groupEnergyMax'];

/**
 * The living count an energy measurement needs beside it: a mean, median, lowest or highest energy is
 * recorded as 0 when nothing is alive, and the count tells that apart from a real value (`alive.SP` for
 * meanEnergy.SP, `descendants.SP.GROUP` for a founder group's energies). Null for every other id.
 */
export function livingCountFor(id: string): string | null {
  const [head, a, b] = id.split('.');
  if (head === 'meanEnergy' && a) return `alive.${a}`;
  if (head !== undefined && GROUP_ENERGY_HEADS.includes(head) && a && b) return `descendants.${a}.${b}`;
  return null;
}

// ------------------------------------------------------------------------------ validation

export interface ExperimentProblem {
  /** Which file the problem belongs to: the experiment card or its recipe. */
  readonly target: 'experiment' | 'recipe';
  readonly path: string;
  readonly message: string;
}

export interface ExperimentValidationContext {
  readonly species: Readonly<Record<string, Species>>;
  readonly materials: Readonly<Record<string, MaterialDef>>;
  /** When given and the card belongs to this build's phase, all content it uses must be enabled. */
  readonly manifest?: Manifest | null;
}

const tickAligned = (s: number) => Math.abs(s * TICKS_PER_SECOND - Math.round(s * TICKS_PER_SECOND)) < 1e-9;

/** Cross-reference checks for one card (the registry reports them against the right file). */
export function experimentProblems(def: ExperimentDef, recipe: RecipeDef | undefined, ctx: ExperimentValidationContext): ExperimentProblem[] {
  const out: ExperimentProblem[] = [];
  const bad = (path: string, message: string, target: ExperimentProblem['target'] = 'experiment') => out.push({ target, path, message });
  const shipped = ctx.manifest && def.phase <= ctx.manifest.buildPhase ? ctx.manifest : null;
  const speciesOk = (id: string, path: string, target: ExperimentProblem['target'] = 'experiment') => {
    if (ctx.species[id] === undefined) bad(path, `unknown species "${id}"`, target);
    else if (shipped && !shipped.enabledSpecies.includes(id)) bad(path, `"${id}" is not enabled in this build`, target);
  };
  const commandOk = (cmd: ExperimentCommand, path: string, target: ExperimentProblem['target']) => {
    if (cmd.kind === 'inoculate') speciesOk(cmd.speciesId, `${path}.speciesId`, target);
    if (cmd.kind === 'deposit') {
      const mat = ctx.materials[cmd.materialId];
      if (mat === undefined) bad(`${path}.materialId`, `unknown material "${cmd.materialId}"`, target);
      else {
        if (!isFieldId(mat.target)) bad(`${path}.materialId`, `material "${cmd.materialId}" is not a field material`, target);
        if (shipped && !shipped.enabledMaterials.includes(cmd.materialId)) bad(`${path}.materialId`, `"${cmd.materialId}" is not enabled in this build`, target);
      }
    }
  };
  const measureOk = (id: string, path: string) => {
    const ref = parseMeasure(id);
    if (typeof ref === 'string') return bad(path, ref);
    const sp = speciesOfRef(ref);
    if (sp !== null) speciesOk(sp, path);
    if (ref.kind === 'group' && shipped) for (const m of groupModules(ref.group)) if (!shipped.enabledModules.includes(m)) bad(path, `module "${m}" is not enabled in this build`);
    if (ref.kind === 'field' && FIELD_DEFS[ref.field].system !== 'core' && shipped && !shipped.enabledSystems.includes(FIELD_DEFS[ref.field].system))
      bad(path, `field "${ref.field}" needs system "${FIELD_DEFS[ref.field].system}", which this build does not enable`);
    if (ref.kind === 'patchInput' && recipe && ref.index >= recipe.fieldPatches.length) bad(path, `recipe ${recipe.id} has no field patch ${ref.index}`);
    if ((ref.kind === 'scalar' && (ref.name === 'interventionAccepted' || ref.name === 'interventionRejected')) && def.change.kind !== 'commands')
      bad(path, `"${id}" needs a 'commands' change`);
  };

  // Every part SPEC §13.2 names is present (the schema defaults some of them to empty text).
  if (!def.intervention?.trim()) bad('intervention', 'a card suggests one intervention');
  if (!def.predictedTradeoff.trim()) bad('predictedTradeoff', 'a card states its predicted tradeoff');
  if (!def.confounds.trim()) bad('confounds', 'a card explains its confounds');
  if (!(def.stoppingSeconds > 0) || !tickAligned(def.stoppingSeconds)) bad('stoppingSeconds', 'must be a positive whole number of ticks (0.1 s)');
  def.measurements.forEach((m, i) => measureOk(m, `measurements.${i}`));
  if (def.measurements.length === 0) bad('measurements', 'a card reports at least one measurement');
  // An energy of a group with no living member is recorded as 0; the card also reports the count, so
  // the value can always be shown as "none alive" instead of a real zero.
  def.measurements.forEach((m, i) => {
    const needs = livingCountFor(m);
    if (needs !== null && !def.measurements.includes(needs)) bad(`measurements.${i}`, `"${m}" is 0 when nothing is alive; also report "${needs}" so an empty group reads "none alive"`);
  });
  // Player steps happen where the card runs: the dish view for one dish, the paired-run results for two.
  def.completion.playerSteps.forEach((st, i) => {
    if (PAIRED_STEPS.includes(st) !== def.paired) bad(`completion.playerSteps.${i}`, `"${st}" ${def.paired ? 'needs a card with one dish' : 'needs a paired card'}`);
  });

  // Gate: a custom predicate over measured state.
  if (def.gate.type !== 'custom') bad('gate.type', `gate type "${def.gate.type}" is not supported for experiments (use "custom" with measurement clauses)`);
  else {
    const res = GateParamsSchema.safeParse(def.gate.params);
    if (!res.success) res.error.issues.forEach((iss) => bad(`gate.params.${iss.path.map(String).join('.')}`, iss.message));
    else
      res.data.all.forEach((c, i) => {
        measureOk(c.measure, `gate.params.all.${i}.measure`);
        if (!def.paired && c.arm !== 'A') bad(`gate.params.all.${i}.arm`, `arm "${c.arm}" needs a paired card`);
      });
  }
  if (def.gate.durationSeconds !== undefined) bad('gate.durationSeconds', 'experiment gates are evaluated each second; durations are not supported');

  // Paired ⇔ exactly one declared change.
  const ch = def.change;
  if (def.paired && ch.kind === 'none') bad('change', 'a paired card declares the one change arm B receives');
  if (!def.paired && ch.kind !== 'none') bad('change', 'only paired cards declare a change');
  if (ch.kind === 'omitPatch' && recipe && ch.patchIndex >= recipe.fieldPatches.length) bad('change.patchIndex', `recipe ${recipe.id} has no field patch ${ch.patchIndex}`);
  if (ch.kind === 'omitScheduled')
    ch.indexes.forEach((k, i) => {
      if (recipe && k >= recipe.scheduledCommands.length) bad(`change.indexes.${i}`, `recipe ${recipe.id} has no scheduled command ${k}`);
      if (ch.indexes.indexOf(k) !== i) bad(`change.indexes.${i}`, `scheduled command ${k} is listed twice`);
    });
  if (ch.kind === 'commands') {
    if (!tickAligned(ch.atSecond)) bad('change.atSecond', 'must fall on a tick (0.1 s)');
    if (ch.atSecond >= def.stoppingSeconds) bad('change.atSecond', 'must come before the stopping point');
    ch.commands.forEach((cmd, i) => commandOk(cmd, `change.commands.${i}`, 'experiment'));
  }

  if (recipe) {
    if (shipped && recipe.phase > shipped.buildPhase) bad('recipeId', `recipe "${recipe.id}" belongs to phase ${recipe.phase} (build phase ${shipped.buildPhase})`);
    // The recipe's scheduled commands are applied through the command path: their payloads must be real commands.
    recipe.scheduledCommands.forEach((sc, i) => {
      const res = ExperimentCommandSchema.safeParse(sc.payload);
      if (!res.success) {
        res.error.issues.forEach((iss) => bad(`scheduledCommands.${i}.payload.${iss.path.map(String).join('.')}`, iss.message, 'recipe'));
        return;
      }
      if (res.data.kind !== sc.kind) bad(`scheduledCommands.${i}.kind`, `kind "${sc.kind}" does not match payload kind "${res.data.kind}"`, 'recipe');
      if (!tickAligned(sc.atSecond)) bad(`scheduledCommands.${i}.atSecond`, 'must fall on a tick (0.1 s)', 'recipe');
      commandOk(res.data, `scheduledCommands.${i}.payload`, 'recipe');
    });
  }
  return out;
}

// ------------------------------------------------------------------------------ timeline (inspection)

export interface SpeciesSample {
  readonly id: string;
  readonly alive: number;
  readonly biomass: number;
  readonly meanE: number;
  readonly meanB: number;
  readonly meanH: number;
  /** Mean position of living members, or null when none are alive. */
  readonly centroid: readonly [number, number] | null;
  /** Share of living members by leading limit code (reason names). */
  readonly limits: Readonly<Record<string, number>>;
  /** Share by secretion code (only species that secrete). */
  readonly secretion: Readonly<Record<string, number>>;
  /** Share by first failing division gate ('NONE' = may divide). */
  readonly divisionBlocks: Readonly<Record<string, number>>;
}

export interface TimelineSample {
  readonly second: number;
  readonly species: readonly SpeciesSample[];
  /** Dish totals (carbon for carbon pools). */
  readonly fields: Readonly<Record<string, number>>;
  readonly oxygenMean: number;
  readonly ledgerOk: boolean;
}

const TIMELINE_FIELDS: readonly FieldId[] = ['sugar', 'starch', 'detritus', 'nutrient', 'co2'];

/** One founder group's energy distribution at a timeline moment (null values: no living member). */
export interface GroupEnergySample {
  /** "SP.GROUP", e.g. "B01.E05" (pairedRun.ts founder groups). */
  readonly group: string;
  readonly alive: number;
  readonly meanE: number | null;
  readonly medianE: number | null;
  readonly minE: number | null;
  readonly maxE: number | null;
}

/**
 * Founder groups' energy distributions at one timeline moment (CT §9.2 "record energy distributions").
 * Kept beside `timeline`, sampled at the same seconds, so the wave A timeline records stay unchanged.
 */
export interface GroupTimelineSample {
  readonly second: number;
  readonly groups: readonly GroupEnergySample[];
}

function sampleGroups(world: World, obs: ArmObserver): GroupTimelineSample {
  const lists = obs.groupEnergyLists(world);
  return {
    second: world.tick / TICKS_PER_SECOND,
    groups: obs.groupKeys.map((group, g) => {
      const e = lists[g]!;
      const n = e.length;
      let sum = 0;
      for (const v of e) sum += v;
      return { group, alive: n, meanE: n > 0 ? sum / n : null, medianE: n > 0 ? median(e) : null, minE: n > 0 ? e[0]! : null, maxE: n > 0 ? e[n - 1]! : null };
    }),
  };
}

function shares(counts: Record<string, number>, n: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of Object.keys(counts).sort()) out[k] = n > 0 ? counts[k]! / n : 0;
  return out;
}

function sampleArm(world: World, obs: ArmObserver): TimelineSample {
  const c = world.ents.cols;
  const species: SpeciesSample[] = [];
  world.species.forEach((sp, s) => {
    let alive = 0;
    let B = 0;
    let E = 0;
    let H = 0;
    let X = 0;
    let Y = 0;
    const limits: Record<string, number> = {};
    const secretion: Record<string, number> = {};
    const blocks: Record<string, number> = {};
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] !== 1 || c.species[i] !== s) continue;
      alive++;
      B += c.B[i]!;
      E += c.E[i]!;
      H += c.H[i]!;
      X += c.x[i]!;
      Y += c.y[i]!;
      const lim = reasonName(c.limitCode[i]!);
      limits[lim] = (limits[lim] ?? 0) + 1;
      if (sp.secretesStarch) {
        const sec = reasonName(c.secretionCode[i]!);
        secretion[sec] = (secretion[sec] ?? 0) + 1;
      }
      const blk = reasonName(divisionBlocker(world, i));
      blocks[blk] = (blocks[blk] ?? 0) + 1;
    }
    if (alive === 0 && obs.everPresent[s] !== 1) return;
    species.push({
      id: sp.id,
      alive,
      biomass: B,
      meanE: alive > 0 ? E / alive : 0,
      meanB: alive > 0 ? B / alive : 0,
      meanH: alive > 0 ? H / alive : 0,
      centroid: alive > 0 ? [X / alive, Y / alive] : null,
      limits: shares(limits, alive),
      secretion: shares(secretion, alive),
      divisionBlocks: shares(blocks, alive),
    });
  });
  const fields: Record<string, number> = {};
  for (const f of TIMELINE_FIELDS) if (world.fields[f]) fields[f] = poolTotal(world, f);
  return { second: world.tick / TICKS_PER_SECOND, species, fields, oxygenMean: oxygenMean(world), ledgerOk: checkLedger(world).ok };
}

// ------------------------------------------------------------------------------ realization

export type ArmName = 'A' | 'B';

export interface ExperimentWorldProvenance {
  readonly recipeId: string;
  readonly recipeRevision: number;
  readonly createdFrom: 'experiment';
  readonly experimentId: string;
}

/** A command arm B received (the comparison engine's Intervention). */
export type InterventionRecord = Intervention;

/** Paint shade over every dish cell (SHADE: light × factor), as B's setup before tick 0. */
export function applyWholeDishShade(world: World, factor: number): void {
  const cells = maskCells();
  for (let k = 0; k < cells.length; k++) world.grid.shade[cells[k]!] = factor;
  world.grid.geometryVersion++;
  updateDerived(world);
}

function toPayload(cmd: ExperimentCommand): CommandPayload {
  switch (cmd.kind) {
    case 'inoculate':
      return { kind: 'inoculate', speciesId: cmd.speciesId, x: cmd.x, y: cmd.y, radius: cmd.radius, count: cmd.count };
    case 'deposit':
      return { kind: 'deposit', materialId: cmd.materialId, points: cmd.points.map(([x, y]) => [x, y] as const), radius: cmd.radius, dose: cmd.dose };
    case 'setLid':
      return { kind: 'setLid', lid: cmd.lid };
    case 'setMutationPreset':
      return { kind: 'setMutationPreset', preset: cmd.preset };
  }
}

/** Pools whose consumption this card measures (only these are tracked, to keep observation cheap). */
function trackedPools(def: ExperimentDef): ConsumablePool[] {
  const ids = [...def.measurements, ...gateClauses(def).map((c) => c.measure)];
  const out: ConsumablePool[] = [];
  for (const id of ids) {
    const ref = parseMeasure(id);
    if (typeof ref !== 'string' && ref.kind === 'consumed' && !out.includes(ref.field)) out.push(ref.field);
  }
  return out;
}

/** The two (or one) worlds of a card at the moment its arms start, before any observed step. */
export interface ExperimentArms {
  readonly def: ExperimentDef;
  readonly recipe: RecipeDef;
  readonly A: World;
  readonly B: World | null;
  readonly obsA: ArmObserver;
  readonly obsB: ArmObserver | null;
  /** Dish tick at which the arms started (0, or the change's atSecond for timed commands). */
  readonly startTick: number;
  /** stateHash of the shared state both arms were duplicated from (timed commands). */
  readonly baselineHash: string | null;
  readonly interventions: readonly InterventionRecord[];
}

export function resolveExperiment(registry: ContentRegistry, idOrDef: string | ExperimentDef): { def: ExperimentDef; recipe: RecipeDef } {
  const def = typeof idOrDef === 'string' ? registry.experiments[idOrDef] : idOrDef;
  if (!def) throw new ExperimentError(`unknown experiment ${typeof idOrDef === 'string' ? idOrDef : idOrDef.id}`);
  const recipe = registry.recipes[def.recipeId];
  if (!recipe) throw new ExperimentError(`${def.id}: unknown recipe ${def.recipeId}`);
  const problems = experimentProblems(def, recipe, { species: registry.species, materials: registry.materials, manifest: registry.manifest });
  if (problems.length > 0) throw new ExperimentError(`${def.id}: ${problems.map((p) => `${p.target} ${p.path}: ${p.message}`).join('; ')}`);
  return { def, recipe };
}

export interface RealizeArmsOptions {
  /** World ids for the arms (defaults `<card>-A`, `<card>-B`, `<card>-single`, and `<card>` for a shared start). */
  readonly worldIds?: { readonly A?: string; readonly B?: string; readonly shared?: string };
}

/**
 * Realize a card's arms. A single-arm card realizes its recipe. A paired card's arm B receives the
 * declared change: setup changes before tick 0; timed commands through the command path, after the
 * recipe ran to `atSecond` and both arms were duplicated from that one state. The recorded recipe and
 * seed are never altered; world ids do not enter the state hash.
 */
export function realizeExperimentArms(registry: ContentRegistry, idOrDef: string | ExperimentDef, opts: RealizeArmsOptions = {}): ExperimentArms {
  const { def, recipe } = resolveExperiment(registry, idOrDef);
  const provenance: ExperimentWorldProvenance = { recipeId: recipe.id, recipeRevision: recipe.revision, createdFrom: 'experiment', experimentId: def.id };
  const ids = opts.worldIds ?? {};
  const realize = (name: string, transform?: (r: RecipeDef) => RecipeDef) =>
    realizeRecipe(registry, recipe, {
      seed: def.seed,
      worldId: name,
      provenance,
      ...(transform ? { transform } : {}),
    });
  const pools = trackedPools(def);
  const ch: ExperimentChange = def.change;
  if (ch.kind === 'none') {
    const A = realize(ids.A ?? `${def.id}-single`);
    return { def, recipe, A, B: null, obsA: new ArmObserver(A, { pools }), obsB: null, startTick: 0, baselineHash: null, interventions: [] };
  }
  if (ch.kind === 'omitPatch' || ch.kind === 'omitScheduled' || ch.kind === 'shade') {
    const A = realize(ids.A ?? `${def.id}-A`);
    const B =
      ch.kind === 'omitPatch'
        ? realize(ids.B ?? `${def.id}-B`, (r) => ({ ...r, fieldPatches: r.fieldPatches.filter((_, i) => i !== ch.patchIndex) }))
        : ch.kind === 'omitScheduled'
          ? realize(ids.B ?? `${def.id}-B`, (r) => ({ ...r, scheduledCommands: r.scheduledCommands.filter((_, i) => !ch.indexes.includes(i)) }))
          : realize(ids.B ?? `${def.id}-B`);
    if (ch.kind === 'shade') applyWholeDishShade(B, ch.factor);
    const omittedPatch = ch.kind === 'omitPatch' ? ch.patchIndex : null;
    return { def, recipe, A, B, obsA: new ArmObserver(A, { pools }), obsB: new ArmObserver(B, { pools, omittedPatch }), startTick: 0, baselineHash: null, interventions: [] };
  }
  // Timed commands: run the recipe to the change, duplicate, then change B through the command path.
  const shared = realize(ids.shared ?? def.id);
  const t0 = Math.round(ch.atSecond * TICKS_PER_SECOND);
  while (shared.tick < t0) step(shared);
  const baseline = serializeWorld(shared);
  const baselineHash = stateHash(shared);
  const A = deserializeWorld({ ...baseline, worldId: ids.A ?? `${def.id}-A` });
  const B = deserializeWorld({ ...baseline, worldId: ids.B ?? `${def.id}-B` });
  const obsA = new ArmObserver(A, { pools });
  const obsB = new ArmObserver(B, { pools });
  const interventions: InterventionRecord[] = ch.commands.map((cmd, k) => {
    const applied = applyNow(B, `experiment:${def.id}:${k + 1}`, toPayload(cmd));
    obsB.watchIntervention(applied);
    return { commandId: applied.commandId, payload: applied.payload, result: applied.result ?? null };
  });
  return { def, recipe, A, B, obsA, obsB, startTick: t0, baselineHash, interventions };
}

// ------------------------------------------------------------------------------ the gate, as it runs

export interface JournalStamp {
  readonly experimentId: string;
  readonly journalStamp: string;
  readonly seed: number;
  readonly recipeId: string;
  readonly recipeRevision: number;
  readonly contentVersion: number;
  readonly contentHash: string;
  readonly reachedAtSecond: number;
  /** Gate clause values when it was reached, keyed "arm:measure". */
  readonly values: Readonly<Record<string, number>>;
  readonly worldKeepsRunning: true;
}

export interface GateStatus {
  readonly reached: boolean;
  /** Dish second at which every clause first held together, or null. */
  readonly reachedAtSecond: number | null;
  /** Clause values at the moment the gate was reached, or at the latest evaluation when it was not. */
  readonly clauses: readonly ClauseResult[];
}

/** One arm as the gate reads it. */
export interface ArmRef {
  readonly world: World;
  readonly obs: ArmObserver;
}

/**
 * The observation gate of one running card (headless runner and app alike). Call `afterTick` after
 * every tick of the arms (both at the same tick): the gate is evaluated at each whole simulated second
 * until every clause holds together; that tick records the journal stamp. Reaching it never stops a
 * world. Reads only.
 */
export class GateWatch {
  readonly clauses: readonly GateClause[];
  /** The measurement ids the clauses read (each once). */
  readonly gateIds: readonly string[];
  private reachedAt: GateStatus | null = null;
  stamp: JournalStamp | null = null;

  constructor(
    readonly def: ExperimentDef,
    readonly recipe: RecipeDef,
    private readonly manifest: Manifest,
  ) {
    this.clauses = gateClauses(def);
    this.gateIds = this.clauses.map((c) => c.measure).filter((m, i, all) => all.indexOf(m) === i);
  }

  get reached(): boolean {
    return this.reachedAt !== null;
  }

  private evaluate(a: ArmRef, b: ArmRef | null) {
    return evaluateGate(this.clauses, { A: measureArm(a.world, a.obs, this.gateIds), B: b ? measureArm(b.world, b.obs, this.gateIds) : null });
  }

  /** Returns the stamp on the tick the gate is first reached, else null. */
  afterTick(a: ArmRef, b: ArmRef | null): JournalStamp | null {
    const t = a.world.tick;
    if (this.reachedAt !== null || t % TICKS_PER_SECOND !== 0) return null;
    const res = this.evaluate(a, b);
    if (!res.pass) return null;
    const second = t / TICKS_PER_SECOND;
    this.reachedAt = { reached: true, reachedAtSecond: second, clauses: res.clauses };
    const values: Record<string, number> = {};
    for (const c of res.clauses) values[`${c.arm}:${c.measure}`] = c.actual;
    this.stamp = {
      experimentId: this.def.id,
      journalStamp: this.def.completion.journalStamp,
      seed: this.def.seed,
      recipeId: this.recipe.id,
      recipeRevision: this.recipe.revision,
      contentVersion: this.manifest.contentVersion,
      contentHash: this.manifest.contentHash,
      reachedAtSecond: second,
      values,
      worldKeepsRunning: true,
    };
    return this.stamp;
  }

  /** The reached status, or (not reached) every clause's value at this moment. */
  status(a: ArmRef, b: ArmRef | null): GateStatus {
    if (this.reachedAt) return this.reachedAt;
    return { reached: false, reachedAtSecond: null, clauses: this.evaluate(a, b).clauses };
  }

  /** The card's own measurement list for each arm at this moment. */
  measured(a: ArmRef, b: ArmRef | null): { readonly A: Record<string, number>; readonly B: Record<string, number> | null } {
    return { A: measureArm(a.world, a.obs, this.def.measurements), B: b ? measureArm(b.world, b.obs, this.def.measurements) : null };
  }
}

/**
 * The player steps one running card lists (completion.playerSteps), noted from UI events by the app
 * (src/worker/host.ts): opening the resource history, the inspector showing an organism's food use,
 * the paired run's results and population history. Worker state only — never simulation state, never
 * saved in a world; the headless runner has no player and records the measured gate alone. A card's
 * stamp needs its measured gate AND every step listed here.
 */
export class PlayerSteps {
  readonly required: readonly PlayerStep[];
  private readonly done: PlayerStep[] = [];

  constructor(def: ExperimentDef) {
    this.required = def.completion.playerSteps.filter((st, i, all) => all.indexOf(st) === i);
  }

  /** True while `step` is listed and not yet taken. */
  needs(step: PlayerStep): boolean {
    return this.required.includes(step) && !this.done.includes(step);
  }

  /** Note a step the player took; returns true when it was a listed step not taken before. */
  note(step: PlayerStep): boolean {
    if (!this.needs(step)) return false;
    this.done.push(step);
    return true;
  }

  get complete(): boolean {
    return this.required.every((st) => this.done.includes(st));
  }

  /** Every listed step in the card's order, with whether it was taken. */
  status(): { readonly step: PlayerStep; readonly done: boolean }[] {
    return this.required.map((step) => ({ step, done: this.done.includes(step) }));
  }
}

/**
 * The species a card's player steps follow: those its gate measures (e.g. B01 for Food trail), else
 * those its measurements name. Recorded content only.
 */
export function stepSpecies(def: ExperimentDef): string[] {
  const from = (ids: readonly string[]) => {
    const out: string[] = [];
    for (const id of ids) {
      const ref = parseMeasure(id);
      const sp = typeof ref === 'string' ? null : speciesOfRef(ref);
      if (sp !== null && !out.includes(sp)) out.push(sp);
    }
    return out;
  };
  const gate = from(gateClauses(def).map((c) => c.measure));
  return gate.length > 0 ? gate : from(def.measurements);
}

/**
 * "The inspector identifies food use" (CT §10.1): the organism the inspector shows (`birthId`) is alive,
 * belongs to one of `species` (any species when empty) and took in food during the last simulated
 * second — the inspector then shows that intake and "It took in … carbon in the last second". Reads only.
 */
export function inspectShowsFoodUse(world: World, birthId: number, species: readonly string[]): boolean {
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || c.birthId[i] !== birthId) continue;
    const sp = world.species[c.species[i]!]!.id;
    return (species.length === 0 || species.includes(sp)) && c.intakeLastSecond[i]! > 0;
  }
  return false;
}

/** The experiment card a world was made from (its recorded provenance), or null for any other dish. */
export function experimentOf(world: World): string | null {
  const p = world.content.provenance as Partial<ExperimentWorldProvenance> & World['content']['provenance'];
  return p.createdFrom === 'experiment' && typeof p.experimentId === 'string' ? p.experimentId : null;
}

// ------------------------------------------------------------------------------ running

export interface ArmResult {
  readonly worldId: string;
  /** stateHash when the arm started (after B's change) and at the end. */
  readonly startHash: string;
  readonly endHash: string;
  /** Every catalog measurement at the end. */
  readonly measurements: Readonly<Record<string, number>>;
  /** The card's own measurement list at the end. */
  readonly reported: Readonly<Record<string, number>>;
  readonly timeline: readonly TimelineSample[];
  /** Founder groups' energy distributions at the timeline's seconds (an addition beside `timeline`). */
  readonly groupTimeline: readonly GroupTimelineSample[];
  readonly ledger: { readonly ok: boolean; readonly everyCheckOk: boolean; readonly relErr: MaterialTotals; readonly checks: number };
  readonly unattributedDeaths: number;
}

export interface ExperimentResult {
  readonly experimentId: string;
  readonly title: string;
  readonly label: typeof PAIRED_RUN_LABEL | typeof SINGLE_RUN_LABEL;
  readonly seed: number;
  readonly recipeId: string;
  readonly recipeRevision: number;
  readonly contentVersion: number;
  readonly contentHash: string;
  readonly paired: boolean;
  readonly change: ExperimentChange;
  readonly startTick: number;
  readonly endTick: number;
  readonly stoppedAtGate: boolean;
  readonly baselineHash: string | null;
  readonly interventions: readonly InterventionRecord[];
  readonly gate: GateStatus;
  readonly stamp: JournalStamp | null;
  readonly A: ArmResult;
  readonly B: ArmResult | null;
}

export interface RunExperimentOptions {
  /** Stop as soon as the gate is reached (default false: completion never stops the world). */
  readonly stopAtGate?: boolean;
  /** Override the stopping point (absolute dish seconds). */
  readonly stopAtSecond?: number;
  /** Timeline sample interval in simulated seconds (default 30; the end is always sampled). */
  readonly sampleSeconds?: number;
}

interface ArmRun {
  readonly world: World;
  readonly obs: ArmObserver;
  readonly startHash: string;
  readonly timeline: TimelineSample[];
  readonly groupTimeline: GroupTimelineSample[];
  everyCheckOk: boolean;
  checks: number;
}

function sample(arm: ArmRun): void {
  const s = sampleArm(arm.world, arm.obs);
  arm.timeline.push(s);
  arm.groupTimeline.push(sampleGroups(arm.world, arm.obs));
  arm.checks++;
  if (!s.ledgerOk) arm.everyCheckOk = false;
}

function finishArm(arm: ArmRun, def: ExperimentDef): ArmResult {
  const w = arm.world;
  const ledger = checkLedger(w);
  return {
    worldId: w.worldId,
    startHash: arm.startHash,
    endHash: stateHash(w),
    measurements: measureArm(w, arm.obs, null),
    reported: measureArm(w, arm.obs, def.measurements),
    timeline: arm.timeline,
    groupTimeline: arm.groupTimeline,
    ledger: { ok: ledger.ok, everyCheckOk: arm.everyCheckOk && ledger.ok, relErr: ledger.relErr, checks: arm.checks + 1 },
    unattributedDeaths: arm.obs.unattributedDeaths(),
  };
}

/**
 * Run a card headlessly from its recipe to its stopping point (or to its gate with `stopAtGate`).
 * A paired card's arms advance as one PairedRun (the comparison engine's model). The gate is
 * evaluated after every simulated second; reaching it records a journal stamp and the run continues
 * (completion never stops a world). Pure: same registry, card and options ⇒ same result.
 */
export function runExperiment(registry: ContentRegistry, idOrDef: string | ExperimentDef, opts: RunExperimentOptions = {}): ExperimentResult {
  const arms = realizeExperimentArms(registry, idOrDef);
  const { def, recipe } = arms;
  const watch = new GateWatch(def, recipe, registry.manifest);
  const stopSecond = opts.stopAtSecond ?? def.stoppingSeconds;
  const stopTick = Math.round(stopSecond * TICKS_PER_SECOND);
  if (stopTick <= arms.startTick) throw new ExperimentError(`${def.id}: stopping point ${stopSecond} s is not after the arms start`);
  const sampleTicks = Math.max(1, Math.round((opts.sampleSeconds ?? 30) * TICKS_PER_SECOND));
  const mk = (world: World, obs: ArmObserver): ArmRun => ({ world, obs, startHash: stateHash(world), timeline: [], groupTimeline: [], everyCheckOk: true, checks: 0 });
  const a = mk(arms.A, arms.obsA);
  const b = arms.B && arms.obsB ? mk(arms.B, arms.obsB) : null;
  const paired =
    b && arms.obsB
      ? new PairedRun({ tick: arms.startTick, ledger: { inputs: { c: arms.obsA.inputStart } } }, a.world, b.world, stopTick - arms.startTick, {
          obsA: arms.obsA,
          obsB: arms.obsB,
          inputBaseB: arms.obsB.inputStart,
        })
      : null;
  sample(a);
  if (b) sample(b);

  let stoppedAtGate = false;
  while (a.world.tick < stopTick) {
    if (paired) paired.stepPair();
    else stepObserved(a.world, a.obs);
    const t = a.world.tick;
    if (b && b.world.tick !== t) throw new ExperimentError('arms advanced unequally');
    if (watch.afterTick(a, b) && opts.stopAtGate) {
      stoppedAtGate = true;
      break;
    }
    if ((t - arms.startTick) % sampleTicks === 0 && t < stopTick) {
      sample(a);
      if (b) sample(b);
    }
  }
  const lastA = a.timeline.at(-1);
  if (!lastA || lastA.second !== a.world.tick / TICKS_PER_SECOND) {
    sample(a);
    if (b) sample(b);
  }
  const manifest = registry.manifest;
  return {
    experimentId: def.id,
    title: def.title,
    label: def.paired ? PAIRED_RUN_LABEL : SINGLE_RUN_LABEL,
    seed: def.seed,
    recipeId: recipe.id,
    recipeRevision: recipe.revision,
    contentVersion: manifest.contentVersion,
    contentHash: manifest.contentHash,
    paired: def.paired,
    change: def.change,
    startTick: arms.startTick,
    endTick: a.world.tick,
    stoppedAtGate,
    baselineHash: arms.baselineHash,
    interventions: arms.interventions,
    gate: watch.status(a, b),
    stamp: watch.stamp,
    A: finishArm(a, def),
    B: b ? finishArm(b, def) : null,
  };
}

/** Cards shipped in this build (phase ≤ build phase), in id order. */
export function experimentCatalog(registry: ContentRegistry): ExperimentDef[] {
  return registry.experimentIds.map((id) => registry.experiments[id]!).filter((e) => e.phase <= registry.manifest.buildPhase);
}

// ------------------------------------------------------------------------------ the card, as the app shows it

/** A recipe field patch or scheduled command, for describing a card's setup and change in words. */
export interface CardPatch {
  readonly index: number;
  readonly label: string | null;
  readonly center: readonly [number, number];
  readonly radius: number;
  /** Per-cell additions (carbon for carbon pools as recorded). */
  readonly add: Readonly<Record<string, number>>;
}

export interface CardScheduled {
  readonly index: number;
  readonly atSecond: number;
  readonly label: string;
  readonly payload: CommandPayload;
}

/**
 * Everything the Notebook shows about one card (recorded content only; serializable). Names are
 * resolved here so the UI words measurements without loading content itself.
 */
export interface ExperimentCardView {
  readonly id: string;
  readonly title: string;
  readonly question: string;
  readonly seed: number;
  readonly recipeId: string;
  readonly recipeRevision: number;
  readonly recipeName: string;
  /** Recipe labels, shown wherever the card is shown (e.g. "Seeded traits demonstration"). */
  readonly labels: readonly string[];
  readonly expectedObservations: string;
  readonly intervention: string;
  readonly predictedTradeoff: string;
  readonly measurements: readonly string[];
  readonly stoppingSeconds: number;
  readonly confounds: string;
  readonly paired: boolean;
  readonly change: ExperimentChange;
  readonly gate: readonly GateClause[];
  readonly journalStamp: string;
  /** The player steps the stamp also needs (completion.playerSteps, CT §10.1), in the card's order. */
  readonly playerSteps: readonly PlayerStep[];
  /** The species those steps follow (e.g. the Sprinters whose food use the inspector must show). */
  readonly stepSpecies: readonly string[];
  readonly patches: readonly CardPatch[];
  readonly scheduled: readonly CardScheduled[];
  readonly founders: readonly { readonly speciesId: string; readonly count: number; readonly modules: readonly string[]; readonly assignment: string; readonly label: string | null }[];
  readonly speciesNames: Readonly<Record<string, string>>;
  readonly materialNames: Readonly<Record<string, string>>;
  readonly moduleNames: Readonly<Record<string, string>>;
}

export function experimentCardView(registry: ContentRegistry, def: ExperimentDef): ExperimentCardView {
  const recipe = registry.recipes[def.recipeId];
  if (!recipe) throw new ExperimentError(`${def.id}: unknown recipe ${def.recipeId}`);
  const speciesNames: Record<string, string> = {};
  for (const id of registry.manifest.enabledSpecies) speciesNames[id] = registry.species[id]?.name ?? id;
  const materialNames: Record<string, string> = {};
  for (const id of registry.manifest.enabledMaterials) materialNames[id] = registry.materials[id]?.name ?? id;
  const moduleNames: Record<string, string> = {};
  for (const id of registry.manifest.enabledModules) moduleNames[id] = registry.modules[id]?.name ?? id;
  return {
    id: def.id,
    title: def.title,
    question: def.question,
    seed: def.seed,
    recipeId: recipe.id,
    recipeRevision: recipe.revision,
    recipeName: recipe.name,
    labels: [...recipe.labels],
    expectedObservations: recipe.expectedObservationsText,
    intervention: def.intervention ?? '',
    predictedTradeoff: def.predictedTradeoff,
    measurements: [...def.measurements],
    stoppingSeconds: def.stoppingSeconds,
    confounds: def.confounds,
    paired: def.paired,
    change: def.change,
    gate: gateClauses(def),
    journalStamp: def.completion.journalStamp,
    playerSteps: def.completion.playerSteps.filter((st, i, all) => all.indexOf(st) === i),
    stepSpecies: stepSpecies(def),
    patches: recipe.fieldPatches.map((p, index) => ({ index, label: p.label ?? null, center: p.center, radius: p.radius, add: { ...p.add } })),
    scheduled: recipe.scheduledCommands.map((sc, index) => ({ index, atSecond: sc.atSecond, label: sc.label, payload: sc.payload as unknown as CommandPayload })),
    founders: recipe.founders.map((f) => ({ speciesId: f.species, count: f.count, modules: [...f.modules], assignment: f.moduleAssignment, label: f.label ?? null })),
    speciesNames,
    materialNames,
    moduleNames,
  };
}
