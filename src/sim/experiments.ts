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
 *   declared change: a setup difference before tick 0 (`omitPatch`, `shade`), or commands applied to
 *   B through the ordinary command path at `atSecond`, after both arms were duplicated from one
 *   serialized state (the comparison model, SPEC §13.4). Both arms advance by equal tick counts.
 *
 * Everything measured here is observation: observers read world state, the event ring and history
 * accumulators through the tick's stage hooks, never draw simulation randomness and never write to
 * a world. A world run by this module is bit-identical to the same world run without it.
 *
 * Measurement ids (the grammar `parseMeasure` accepts; "run" = since the arms started):
 *   seconds · runSeconds · aliveTotal · biomassTotal · speciesAlive · oxygenMean
 *   inputCarbon (external carbon logged during the run) · interventionAccepted · interventionRejected
 *   alive.SP · biomass.SP · biomassStart.SP · biomassRatio.SP (0 when the start biomass is 0)
 *   births.SP · deaths.SP · deaths.SP.CAUSE (DEATH_* / REMOVED_*) · intake.SP (carbon taken in, all routes)
 *   captures.SP · capturedCarbon.SP (as predator) · meanEnergy.SP · extinctAt.SP (dish second, −1 if not)
 *   preyBiomass.SP (living biomass of the species SP can eat)
 *   field.F (current dish total of field F, carbon for carbon pools)
 *   consumed.F (net removal from pool F by feeding, stage 6; exact for pools feeding never adds to)
 *   converted.starch|oil|protein (carbon converted by that enzyme) · patchInput.N (recipe patch N's logged carbon)
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
import { applyNow, type CommandPayload, type CommandResult } from './commands';
import { TICKS_PER_SECOND } from './constants';
import { FIELD_DEFS, FIELD_IDS, isFieldId, type FieldId } from './fields';
import { maskCells } from './grid';
import { checkLedger, type MaterialTotals } from './ledger';
import { divisionBlocker } from './births';
import { realizeRecipe } from './recipes';
import { REASONS, reasonName } from './reasons';
import { deserializeWorld, serializeWorld, stateHash } from './serialize';
import { step } from './tick';
import { updateDerived } from './transport';
import type { World } from './world';

export class ExperimentError extends Error {}

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
] as const;
export type SpeciesMeasure = (typeof SPECIES_MEASURES)[number];

export const ENZYMES = ['starch', 'oil', 'protein'] as const;
export type Enzyme = (typeof ENZYMES)[number];

/** Pools feeding removes from. Feeding never adds to the first six; it returns sugar, metabolite and CO2. */
export const CONSUMABLE_POOLS = ['starch', 'oil', 'protein', 'broth', 'detritus', 'film', 'sugar', 'metabolite', 'co2'] as const satisfies readonly FieldId[];
export type ConsumablePool = (typeof CONSUMABLE_POOLS)[number];

export type MeasureRef =
  | { readonly kind: 'scalar'; readonly name: ScalarMeasure }
  | { readonly kind: 'species'; readonly stat: SpeciesMeasure; readonly species: string }
  | { readonly kind: 'deathCause'; readonly species: string; readonly cause: number }
  | { readonly kind: 'field'; readonly field: FieldId }
  | { readonly kind: 'consumed'; readonly field: ConsumablePool }
  | { readonly kind: 'converted'; readonly enzyme: Enzyme }
  | { readonly kind: 'patchInput'; readonly index: number };

const SPECIES_RE = /^[BYFAPXV][0-9]{2}$/;
const includes = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/** Parse a measurement id; returns a readable error string when it is not in the grammar. */
export function parseMeasure(id: string): MeasureRef | string {
  const parts = id.split('.');
  const [head, a, b] = parts;
  if (parts.length === 1) return includes(SCALAR_MEASURES, head!) ? { kind: 'scalar', name: head } : `unknown measurement "${id}"`;
  if (head === 'deaths' && parts.length === 3) {
    if (!SPECIES_RE.test(a!)) return `"${a}" is not a species id`;
    const cause = REASONS.indexOf(b as (typeof REASONS)[number]);
    if (cause < 0 || !(b!.startsWith('DEATH_') || b!.startsWith('REMOVED_'))) return `"${b}" is not a death cause`;
    return { kind: 'deathCause', species: a!, cause };
  }
  if (parts.length !== 2) return `unknown measurement "${id}"`;
  if (includes(SPECIES_MEASURES, head!)) {
    if (!SPECIES_RE.test(a!)) return `"${a}" is not a species id`;
    return { kind: 'species', stat: head, species: a! };
  }
  if (head === 'field') return isFieldId(a!) ? { kind: 'field', field: a } : `unknown field "${a}"`;
  if (head === 'consumed') return includes(CONSUMABLE_POOLS, a!) ? { kind: 'consumed', field: a } : `"${a}" is not a pool feeding removes from`;
  if (head === 'converted') return includes(ENZYMES, a!) ? { kind: 'converted', enzyme: a } : `unknown enzyme "${a}"`;
  if (head === 'patchInput') return /^(0|[1-9][0-9]?)$/.test(a!) ? { kind: 'patchInput', index: Number(a) } : `"${a}" is not a patch index`;
  return `unknown measurement "${id}"`;
}

function speciesOfRef(ref: MeasureRef): string | null {
  return ref.kind === 'species' || ref.kind === 'deathCause' ? ref.species : null;
}

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

// ------------------------------------------------------------------------------ observer

const NO_CAUSES = REASONS.length;

/** Per-arm, read-only observer. Attach before the first step of the arm; call after every step. */
export class ArmObserver {
  readonly startTick: number;
  readonly speciesIds: readonly string[];
  readonly biomassStart: Float64Array;
  readonly intake: Float64Array;
  readonly births: Float64Array;
  readonly deaths: Float64Array;
  /** species × reason code. */
  readonly causes: Float64Array;
  readonly captures: Float64Array;
  readonly capturedCarbon: Float64Array;
  readonly everPresent: Uint8Array;
  readonly extinctAt: Float64Array;
  readonly consumed: Partial<Record<ConsumablePool, number>> = {};
  readonly patchInputs: readonly number[];
  interventionAccepted = 0;
  interventionRejected = 0;
  private readonly conversionStart: { readonly starch: number; readonly oil: number; readonly protein: number };
  private readonly inputStart: number;
  private readonly tracked: readonly ConsumablePool[];
  private readonly pre6Intake: Float64Array;
  private readonly post6Intake: Float64Array;
  private readonly pre6Pool: Float64Array;
  private lastEventId: number;
  private lastSecond: number;
  private pendingBirths: number[];
  private pendingDeaths: number[];
  /** Stage hook for step(); reads only. */
  readonly hook: (stage: number, world: World) => void;

  /** `omittedPatch`: the source recipe's patch index this arm was realized without (omitPatch). */
  constructor(world: World, trackedPools: readonly ConsumablePool[], omittedPatch: number | null = null) {
    const n = world.species.length;
    this.startTick = world.tick;
    this.speciesIds = world.species.map((s) => s.id);
    this.biomassStart = new Float64Array(n);
    this.intake = new Float64Array(n);
    this.births = new Float64Array(n);
    this.deaths = new Float64Array(n);
    this.causes = new Float64Array(n * NO_CAUSES);
    this.captures = new Float64Array(n);
    this.capturedCarbon = new Float64Array(n);
    this.everPresent = new Uint8Array(n);
    this.extinctAt = new Float64Array(n).fill(-1);
    this.pre6Intake = new Float64Array(n);
    this.post6Intake = new Float64Array(n);
    this.tracked = trackedPools.filter((f) => world.fields[f] !== undefined);
    this.pre6Pool = new Float64Array(this.tracked.length);
    for (const f of this.tracked) this.consumed[f] = 0;
    const c = world.ents.cols;
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      this.biomassStart[c.species[i]!]! += c.B[i]!;
      this.everPresent[c.species[i]!] = 1;
    }
    this.conversionStart = { ...world.conversionTotals };
    this.inputStart = world.ledger.inputs.c;
    this.patchInputs = patchInputsOf(world, omittedPatch);
    this.lastEventId = world.counters.nextEventId - 1;
    this.lastSecond = world.history.seconds.at(-1)?.second ?? -1;
    this.pendingBirths = world.history.pendingBirths.slice();
    this.pendingDeaths = world.history.pendingDeaths.slice();
    this.hook = (stage, w) => {
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

  private sumIntake(world: World, out: Float64Array): void {
    out.fill(0);
    const c = world.ents.cols;
    for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1) out[c.species[i]!]! += c.intakeAccum[i]!;
  }

  /** Call once after every step of this arm's world. */
  afterTick(world: World): void {
    const h = world.history;
    const last = h.seconds.at(-1);
    const pushed = last !== undefined && last.second !== this.lastSecond ? last : null;
    if (last) this.lastSecond = last.second;
    for (let s = 0; s < this.births.length; s++) {
      this.births[s]! += (pushed ? pushed.births[s]! : 0) + h.pendingBirths[s]! - this.pendingBirths[s]!;
      this.deaths[s]! += (pushed ? pushed.deaths[s]! : 0) + h.pendingDeaths[s]! - this.pendingDeaths[s]!;
    }
    this.pendingBirths = h.pendingBirths.slice();
    this.pendingDeaths = h.pendingDeaths.slice();
    const ring = world.events.ring;
    let k = ring.length;
    while (k > 0 && ring[k - 1]!.id > this.lastEventId) k--;
    for (; k < ring.length; k++) {
      const ev = ring[k]!;
      if (ev.type === 'death' && ev.species !== undefined && ev.cause !== undefined && ev.cause >= 0 && ev.cause < NO_CAUSES) {
        this.causes[ev.species * NO_CAUSES + ev.cause]!++;
      } else if (ev.type === 'capture' && ev.species !== undefined) {
        this.captures[ev.species]!++;
        this.capturedCarbon[ev.species]! += ev.amount ?? 0;
      }
    }
    this.lastEventId = world.counters.nextEventId - 1;
    if (world.tick % TICKS_PER_SECOND === 0) {
      const alive = aliveCounts(world);
      for (let s = 0; s < alive.length; s++) {
        if (alive[s]! > 0) {
          this.everPresent[s] = 1;
          this.extinctAt[s] = -1;
        } else if (this.everPresent[s] === 1 && this.extinctAt[s]! < 0) this.extinctAt[s] = world.tick / TICKS_PER_SECOND;
      }
    }
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

/**
 * Carbon logged for each recipe field patch (ledger sources `recipe:patchN[:label]`), indexed by the
 * SOURCE recipe's patch index. An arm realized without patch k logs the later patches renumbered
 * (k+1 as k, …); they are mapped back so patchInput.K always names the same patch in both arms.
 */
function patchInputsOf(world: World, omittedPatch: number | null = null): number[] {
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

function poolTotal(world: World, id: FieldId): number {
  const arr = world.fields[id];
  if (!arr) return 0;
  const cells = maskCells();
  let s = 0;
  for (let k = 0; k < cells.length; k++) s += arr[cells[k]!]!;
  return s * (FIELD_DEFS[id].carbonPerUnit ?? 1);
}

function aliveCounts(world: World): number[] {
  const out = new Array<number>(world.species.length).fill(0);
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1) out[c.species[i]!]!++;
  return out;
}

// ------------------------------------------------------------------------------ measuring

interface SpeciesAgg {
  readonly alive: number[];
  readonly biomass: number[];
  readonly energy: number[];
}

function speciesAgg(world: World): SpeciesAgg {
  const n = world.species.length;
  const alive = new Array<number>(n).fill(0);
  const biomass = new Array<number>(n).fill(0);
  const energy = new Array<number>(n).fill(0);
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const s = c.species[i]!;
    alive[s]!++;
    biomass[s]! += c.B[i]!;
    energy[s]! += c.E[i]!;
  }
  return { alive, biomass, energy };
}

function oxygenMean(world: World): number {
  const o2 = world.fields.oxygen!;
  const cells = maskCells();
  let s = 0;
  for (let k = 0; k < cells.length; k++) s += o2[cells[k]!]!;
  return s / cells.length;
}

/** Measure one arm. `ids` restricts the record to those ids (the gate); null gives the full catalog. */
export function measureArm(world: World, obs: ArmObserver, ids: readonly string[] | null): Record<string, number> {
  let agg: SpeciesAgg | null = null;
  const getAgg = () => (agg ??= speciesAgg(world));
  const spIdx = (id: string) => {
    const i = obs.speciesIds.indexOf(id);
    if (i < 0) throw new ExperimentError(`species ${id} is not enabled in world ${world.worldId}`);
    return i;
  };
  const value = (ref: MeasureRef): number => {
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
        }
        break;
      }
      case 'deathCause':
        return obs.causes[spIdx(ref.species) * NO_CAUSES + ref.cause]!;
      case 'field':
        return world.fields[ref.field] ? poolTotal(world, ref.field) : 0;
      case 'consumed': {
        const v = obs.consumed[ref.field];
        if (v === undefined) throw new ExperimentError(`consumption of ${ref.field} is not tracked in world ${world.worldId}`);
        return v;
      }
      case 'converted':
        return obs.converted(world, ref.enzyme);
      case 'patchInput':
        return obs.patchInputs[ref.index] ?? 0;
    }
    throw new ExperimentError('unreachable measurement');
  };
  const out: Record<string, number> = {};
  const list = ids ?? catalogIds(world, obs);
  for (const id of list) {
    const ref = parseMeasure(id);
    if (typeof ref === 'string') throw new ExperimentError(ref);
    out[id] = value(ref);
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
  for (const id of FIELD_IDS) if (world.fields[id] && FIELD_DEFS[id].material !== 'none') ids.push(`field.${id}`);
  ids.push('field.oxygen');
  for (const f of CONSUMABLE_POOLS) if (obs.consumed[f] !== undefined) ids.push(`consumed.${f}`);
  for (const e of ENZYMES) ids.push(`converted.${e}`);
  obs.patchInputs.forEach((_, i) => ids.push(`patchInput.${i}`));
  return ids;
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

export interface InterventionRecord {
  readonly commandId: string;
  readonly payload: CommandPayload;
  readonly result: CommandResult | null;
}

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
  /** stateHash of the shared state both arms were duplicated from (paired cards). */
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

/**
 * Realize a card's arms. A single-arm card realizes its recipe. A paired card's arm B receives the
 * declared change: setup changes before tick 0; timed commands through the command path, after the
 * recipe ran to `atSecond` and both arms were duplicated from that one state.
 */
export function realizeExperimentArms(registry: ContentRegistry, idOrDef: string | ExperimentDef): ExperimentArms {
  const { def, recipe } = resolveExperiment(registry, idOrDef);
  const provenance: ExperimentWorldProvenance = { recipeId: recipe.id, recipeRevision: recipe.revision, createdFrom: 'experiment', experimentId: def.id };
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
    const A = realize(`${def.id}-single`);
    return { def, recipe, A, B: null, obsA: new ArmObserver(A, pools), obsB: null, startTick: 0, baselineHash: null, interventions: [] };
  }
  if (ch.kind === 'omitPatch' || ch.kind === 'shade') {
    const A = realize(`${def.id}-A`);
    const B =
      ch.kind === 'omitPatch'
        ? realize(`${def.id}-B`, (r) => ({ ...r, fieldPatches: r.fieldPatches.filter((_, i) => i !== ch.patchIndex) }))
        : realize(`${def.id}-B`);
    if (ch.kind === 'shade') applyWholeDishShade(B, ch.factor);
    const omitted = ch.kind === 'omitPatch' ? ch.patchIndex : null;
    return { def, recipe, A, B, obsA: new ArmObserver(A, pools), obsB: new ArmObserver(B, pools, omitted), startTick: 0, baselineHash: null, interventions: [] };
  }
  // Timed commands: run the recipe to the change, duplicate, then change B through the command path.
  const shared = realize(def.id);
  const t0 = Math.round(ch.atSecond * TICKS_PER_SECOND);
  while (shared.tick < t0) step(shared);
  const baseline = serializeWorld(shared);
  const baselineHash = stateHash(shared);
  const A = deserializeWorld({ ...baseline, worldId: `${def.id}-A` });
  const B = deserializeWorld({ ...baseline, worldId: `${def.id}-B` });
  const obsA = new ArmObserver(A, pools);
  const obsB = new ArmObserver(B, pools);
  const interventions: InterventionRecord[] = ch.commands.map((cmd, k) => {
    const applied = applyNow(B, `experiment:${def.id}:${k + 1}`, toPayload(cmd));
    obsB.interventionAccepted += applied.result?.accepted ?? 0;
    obsB.interventionRejected += applied.result?.rejected ?? 0;
    return { commandId: applied.commandId, payload: applied.payload, result: applied.result ?? null };
  });
  return { def, recipe, A, B, obsA, obsB, startTick: t0, baselineHash, interventions };
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
  readonly ledger: { readonly ok: boolean; readonly everyCheckOk: boolean; readonly relErr: MaterialTotals; readonly checks: number };
  readonly unattributedDeaths: number;
}

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
  /** Clause values at the moment the gate was reached, or at the end when it was not. */
  readonly clauses: readonly ClauseResult[];
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
  everyCheckOk: boolean;
  checks: number;
}

function stepArm(arm: ArmRun): void {
  step(arm.world, { afterStage: arm.obs.hook });
  arm.obs.afterTick(arm.world);
}

function sample(arm: ArmRun): void {
  const s = sampleArm(arm.world, arm.obs);
  arm.timeline.push(s);
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
    ledger: { ok: ledger.ok, everyCheckOk: arm.everyCheckOk && ledger.ok, relErr: ledger.relErr, checks: arm.checks + 1 },
    unattributedDeaths: arm.obs.unattributedDeaths(),
  };
}

/**
 * Run a card headlessly from its recipe to its stopping point (or to its gate with `stopAtGate`).
 * The gate is evaluated after every simulated second; reaching it records a journal stamp and the
 * run continues (completion never stops a world). Pure: same registry, card and options ⇒ same result.
 */
export function runExperiment(registry: ContentRegistry, idOrDef: string | ExperimentDef, opts: RunExperimentOptions = {}): ExperimentResult {
  const arms = realizeExperimentArms(registry, idOrDef);
  const { def, recipe } = arms;
  const clauses = gateClauses(def);
  const gateIds = clauses.map((c) => c.measure).filter((m, i, all) => all.indexOf(m) === i);
  const stopSecond = opts.stopAtSecond ?? def.stoppingSeconds;
  const stopTick = Math.round(stopSecond * TICKS_PER_SECOND);
  if (stopTick <= arms.startTick) throw new ExperimentError(`${def.id}: stopping point ${stopSecond} s is not after the arms start`);
  const sampleTicks = Math.max(1, Math.round((opts.sampleSeconds ?? 30) * TICKS_PER_SECOND));
  const mk = (world: World, obs: ArmObserver): ArmRun => ({ world, obs, startHash: stateHash(world), timeline: [], everyCheckOk: true, checks: 0 });
  const a = mk(arms.A, arms.obsA);
  const b = arms.B && arms.obsB ? mk(arms.B, arms.obsB) : null;
  sample(a);
  if (b) sample(b);

  let gate: GateStatus | null = null;
  let stamp: JournalStamp | null = null;
  let stoppedAtGate = false;
  const manifest = registry.manifest;
  const evaluate = () =>
    evaluateGate(clauses, { A: measureArm(a.world, a.obs, gateIds), B: b ? measureArm(b.world, b.obs, gateIds) : null });

  while (a.world.tick < stopTick) {
    stepArm(a);
    if (b) stepArm(b);
    const t = a.world.tick;
    if (b && b.world.tick !== t) throw new ExperimentError('arms advanced unequally');
    if (t % TICKS_PER_SECOND === 0 && gate === null) {
      const res = evaluate();
      if (res.pass) {
        const second = t / TICKS_PER_SECOND;
        gate = { reached: true, reachedAtSecond: second, clauses: res.clauses };
        const values: Record<string, number> = {};
        for (const c of res.clauses) values[`${c.arm}:${c.measure}`] = c.actual;
        stamp = {
          experimentId: def.id,
          journalStamp: def.completion.journalStamp,
          seed: def.seed,
          recipeId: recipe.id,
          recipeRevision: recipe.revision,
          contentVersion: manifest.contentVersion,
          contentHash: manifest.contentHash,
          reachedAtSecond: second,
          values,
          worldKeepsRunning: true,
        };
        if (opts.stopAtGate) {
          stoppedAtGate = true;
          break;
        }
      }
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
  if (gate === null) {
    const res = evaluate();
    gate = { reached: false, reachedAtSecond: null, clauses: res.clauses };
  }
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
    gate,
    stamp,
    A: finishArm(a, def),
    B: b ? finishArm(b, def) : null,
  };
}

/** Cards shipped in this build (phase ≤ build phase), in id order. */
export function experimentCatalog(registry: ContentRegistry): ExperimentDef[] {
  return registry.experimentIds.map((id) => registry.experiments[id]!).filter((e) => e.phase <= registry.manifest.buildPhase);
}

