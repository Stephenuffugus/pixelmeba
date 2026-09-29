/**
 * npm run sim:tune -- [--recipes FIRST_DISH_V1[,…]] [--seeds 104729,130363,…] [--seconds 600]
 *   [--extend 1200] [--presets standard,accelerated | --preset standard] [--horizon 1200]
 *   [--plain-check] [--out docs/reports/tune-g2.md]
 *
 * Development-seed tuning report (BUILD_DIRECTIVE P1.12 and P2.9; CONTENT_TABLES §11; D06 §18).
 *
 * Protocol: realize each recipe at each development seed and each mutation preset, no interventions,
 * and step to --seconds. If no inherited difference exists by then (events.totals.mutation === 0) the
 * run continues to --extend while keeping the first checkpoint's numbers. Everything here only READS
 * world state between ticks (plus a read-only afterStage hook), so the endpoint hash is the same as a
 * plain run; --plain-check proves it per seed by re-running each seed with no observer at all and
 * comparing the state hashes at every checkpoint.
 *
 * --horizon adds a supplementary checkpoint (not the D06 stopping rule): every seed continues past its
 * D06 endpoint to that time and a separate "supplementary horizon" section reports it. The D06 tables
 * are taken before and are unchanged by it.
 *
 * The header records the build: git HEAD, whether src/sim/ and content/ (everything the simulated
 * numbers depend on) differ from it, and the manifest's rule versions.
 *
 * Censoring: a milestone that has not happened by the stopping time is reported as censored and is
 * never treated as an event at the stopping time. The median ranks censored values above every
 * observed value (valid because all seeds share the checkpoint time).
 *
 * Module draws (D06 §9, §18): every committed daughter is one trial. A module draw picks gain or loss
 * and then a legal option; a draw with no legal option changes nothing and leaves no trace in the
 * genome. The tool therefore recomputes each committed daughter's draw from its recorded keys (seed,
 * parent birthId, daughter index) with the simulation's own pure draft function (`draftDaughter`),
 * probing the same keys with a module set that has a legal gain and one that has a legal loss. It also
 * re-drafts every daughter from its parent's recorded genome and checks that the result is exactly the
 * recorded genome and mutation descriptor ("draws reproduced").
 *
 * If the --out file already exists, any text between `<!-- analysis:start -->` and
 * `<!-- analysis:end -->` is carried over, so hand-written observations survive a regenerated table.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { generatedBranchName, subtreeAlive, type BranchTrait } from '../src/sim/branches';
import type { ContentRegistry } from '../src/sim/content/registry';
import { GRID_W, TICKS_PER_SECOND } from '../src/sim/constants';
import { FLAG, LIFE_ACTIVE } from '../src/sim/entities';
import { genomeKey, type Genome } from '../src/sim/genome';
import { diskCells, inMask, maskCells } from '../src/sim/grid';
import { FIELD_DEFS, isFieldId } from '../src/sim/fields';
import { checkLedger } from '../src/sim/ledger';
import { eligibleGains, lossOptions } from '../src/sim/modules';
import { reserveBand } from '../src/sim/moduleView';
import {
  draftDaughter,
  MUT_MODULE_GAIN,
  MUT_MODULE_LOSS,
  MUT_PREF,
  MUT_QUANT,
  MUT_QUANT_NEUTRAL,
  ratesFor,
  type MutationRates,
} from '../src/sim/mutation';
import { profileOf } from '../src/sim/profiles';
import { realizeRecipe } from '../src/sim/recipes';
import { reasonName } from '../src/sim/reasons';
import { stateHash } from '../src/sim/serialize';
import { entityCell } from '../src/sim/spatial';
import { step } from '../src/sim/tick';
import type { HistorySample } from '../src/sim/history';
import type { World } from '../src/sim/world';
import { loadRegistryFs, REPO_ROOT } from './lib/content-fs';

export type Preset = 'standard' | 'accelerated';
export const PRESETS: readonly Preset[] = ['standard', 'accelerated'];
export const DEV_SEEDS: readonly number[] = [104729, 130363, 155921, 196613, 262147, 314159];
/** D06 §18 pacing targets (proposed recipe targets, never engine exceptions). */
export const TARGET_INTAKE_SECONDS = 15;
export const TARGET_DIVISION_SECONDS = 120;
export const TARGET_SEEDS_REQUIRED = 5;
const DEFAULT_SAMPLE_SECONDS: readonly number[] = [15, 60, 120, 300, 600, 900, 1200];
export const ANALYSIS_START = '<!-- analysis:start -->';
export const ANALYSIS_END = '<!-- analysis:end -->';

export interface TuneSeedOptions {
  readonly recipe: string;
  readonly seed: number;
  readonly preset: Preset;
  /** First checkpoint (simulated seconds). */
  readonly seconds: number;
  /** Continue to this time when no inherited difference exists at the first checkpoint. */
  readonly extendSeconds: number;
  /**
   * Supplementary horizon (not the D06 stopping rule): continue every seed to this time after the D06
   * checkpoints and record one more checkpoint. 0 or absent: none.
   */
  readonly horizonSeconds?: number;
  /** Seconds at which living organisms' recorded reason codes are sampled. */
  readonly sampleSeconds?: readonly number[];
}

export type Tally = Record<string, number>;

export interface SpeciesSample {
  alive: number;
  meanE: number;
  meanBOverB0: number;
  meanH: number;
  stressedFraction: number;
  /** Mean free nutrient / oxygen / sugar in the organisms' cells. */
  meanCellNutrient: number;
  meanCellOxygen: number;
  meanCellSugar: number;
  /** Mean carbon taken in the last completed second (intakeLastSecond). */
  meanIntakePerSecond: number;
  /** Mean position (cell units). */
  meanX: number;
  meanY: number;
  /** Histograms of recorded reason codes (names from src/sim/reasons.ts). */
  limit: Tally;
  /** Sum of the measured value recorded with each limit code (limitValue), for per-code means. */
  limitValueSum: Tally;
  divBlock: Tally;
  /**
   * Starch-enzyme outcomes (secretionCode) of every organism whose profile has producer rules —
   * native producers and E01 carriers alike. The secretion stage writes a code only for Active
   * organisms, so a producer that is Preparing, Resting or Waking is tallied under its recorded
   * state reason (limitCode) instead of a stale secretion outcome.
   */
  secretion: Tally;
}

export interface ReasonSample {
  readonly second: number;
  readonly species: Record<string, SpeciesSample>;
  /** Carbon still present, in each recipe field patch's disk, of the carbon fields that patch added. */
  readonly patches: readonly { label: string; carbon: number }[];
}

interface PatchProbe {
  readonly label: string;
  readonly fields: readonly string[];
  readonly cells: readonly number[];
}

function patchProbes(world: World, registry: ContentRegistry, recipe: string): PatchProbe[] {
  const def = registry.recipes[recipe]!;
  return def.fieldPatches.map((p, n) => ({
    label: `${p.label ?? `patch ${n}`} (${p.center[0]},${p.center[1]}) r${p.radius}`,
    fields: Object.keys(p.add)
      .filter((k) => isFieldId(k) && FIELD_DEFS[k].material === 'carbon' && world.fields[k] !== undefined)
      .sort(),
    cells: diskCells(p.center[0], p.center[1], p.radius).filter((i) => inMask(i % 128, Math.floor(i / 128))),
  }));
}

function patchCarbon(world: World, probes: readonly PatchProbe[]): { label: string; carbon: number }[] {
  return probes.map((p) => {
    let carbon = 0;
    for (const f of p.fields) {
      const arr = world.fields[f as keyof typeof world.fields]!;
      for (const i of p.cells) carbon += arr[i]!;
    }
    return { label: `${p.label}: ${p.fields.join('+')}`, carbon };
  });
}

export interface FoodTotals {
  sugar: number;
  starch: number;
  detritus: number;
  total: number;
}

// ---------------------------------------------------------------------------- inherited variation

/** How one committed daughter's module draw came out (D06 §9: a draw that chose gain is a gain attempt). */
export type ModuleDraw = 'none' | 'gain' | 'loss' | 'unknown';

export interface SpeciesDraws {
  daughters: number;
  gainAttempts: number;
  gains: number;
  lossAttempts: number;
  losses: number;
}

/** Per-daughter draw counts over committed daughters (two per division). */
export interface InheritanceTally {
  /** Committed daughters: the per-daughter trials. */
  daughters: number;
  /** Daughters whose parent genome had at least one legal gain (D06 §9 "eligible daughter births"). */
  gainEligible: number;
  /** Daughters of species with at least two supported foods (the only ones a preference draw can change). */
  prefEligible: number;
  /** Quantitative draws: a changed locus plus clamped (neutral) draws. */
  quantDraws: number;
  prefDraws: number;
  /** Module draws that fired, gain or loss, whether or not a legal option existed. */
  moduleDraws: number;
  gainAttempts: number;
  gains: number;
  gainNoOption: number;
  lossAttempts: number;
  losses: number;
  lossNoOption: number;
  /** Daughters whose draw could not be recomputed (parent record compacted; species with no legal module). */
  unknown: number;
  /** Daughters re-drafted from the parent's recorded genome, and those whose genome and descriptor matched. */
  drawsChecked: number;
  drawsMatched: number;
  /** Recorded module changes that disagree with the recomputed draw (must be 0). */
  mismatches: number;
  bySpecies: Record<string, SpeciesDraws>;
  gainsByModule: Tally;
  lossesByModule: Tally;
  /**
   * Per-module trials (D06 §18 "for rare modules, report events per daughter trial"): daughters whose
   * parent could legally gain the module, by module then species, and the gains expected at the preset
   * chance (a gain draw picks uniformly among the parent's legal gains, so one module's chance is the
   * gain-attempt chance ÷ the number of legal gains). Losses likewise over daughters of carriers whose
   * loss is legal.
   */
  gainTrialsByModule: Record<string, Tally>;
  expectedGainsByModule: Tally;
  lossTrialsByModule: Record<string, Tally>;
  expectedLossesByModule: Tally;
  /** Birth tick of the first committed daughter with that outcome, or null (censored). */
  firstGainAttemptTick: number | null;
  firstGainTick: number | null;
  firstLossTick: number | null;
  /** Tick of the first branch-candidate event ("variation observed"), or null. */
  firstCandidateTick: number | null;
}

/** One committed module change (a gain or a loss) in birth order. */
export interface ModuleEvent {
  readonly birthId: number;
  readonly tick: number;
  readonly species: string;
  readonly module: string;
  readonly gained: boolean;
}

export interface BranchRow {
  readonly id: number;
  readonly species: string;
  /** The generated name the player sees (species · descriptor · short id). */
  readonly name: string;
  readonly traitKind: BranchTrait['kind'] | 'unknown';
  readonly trait: string;
  readonly candidateTick: number;
  readonly establishedTick: number;
  readonly extinctTick: number | null;
  readonly membersAtEstablish: number | null;
  readonly depthAtEstablish: number | null;
  /** Own living members, and living members including branches descended from it. */
  readonly alive: number;
  readonly subtreeAlive: number;
  readonly peak: number | null;
}

/**
 * What a module's carriers were doing, sampled at the end of every simulated second (carrier-seconds):
 * E05 carriers with energy above their base cap (the chamber's extra room in use, fill band ≥ 1), E03
 * carriers not Active (preparing, resting or waking), E01 carriers secreting.
 */
export interface CarrierSeconds {
  carrierSeconds: number;
  reserveInUse: number;
  notActive: number;
  secreting: number;
  /**
   * E01 carriers only. The recorded outcome of the starch-enzyme action (secretionCode while Active,
   * else the state reason), by reason name. The secretion stage tests energy before substrate
   * (src/sim/structures.ts), so the two conditions are also measured directly: deposited starch in or
   * beside the carrier's cell (the stage's own substrate test) and energy at or below the carrier's
   * recorded release threshold; `bothBlocked` counts carrier-seconds with low energy and no starch.
   */
  outcomes: Tally;
  starchWithinReach: number;
  energyAtOrBelowThreshold: number;
  bothBlocked: number;
}

/** The secretion stage's substrate test (src/sim/structures.ts substrateNear): starch in the cell or a four-neighbour. */
export function starchWithinReach(world: World, cell: number): boolean {
  const sub = world.fields.starch;
  if (!sub) return false;
  if (sub[cell]! > 0) return true;
  const x = cell % GRID_W;
  if (x + 1 < GRID_W && sub[cell + 1]! > 0) return true;
  if (x > 0 && sub[cell - 1]! > 0) return true;
  if (cell + GRID_W < sub.length && sub[cell + GRID_W]! > 0) return true;
  if (cell - GRID_W >= 0 && sub[cell - GRID_W]! > 0) return true;
  return false;
}

/** Living carriers of one module in one species at a checkpoint, beside the same species' plain organisms. */
export interface CarrierState {
  readonly module: string;
  readonly species: string;
  readonly alive: number;
  readonly meanE: number;
  /** Mean energy cap of the carriers (base cap plus any chamber room). */
  readonly meanCap: number;
  /** Organisms of the same species carrying no module, and their mean energy. */
  readonly plainAlive: number;
  readonly plainMeanE: number;
}

export interface InheritanceSnapshot extends InheritanceTally {
  readonly events: readonly ModuleEvent[];
  /** Carrier-seconds per module and species since the start (key "E05 A01"). */
  readonly carrierSeconds: Record<string, CarrierSeconds>;
  /** Living carriers per module and species at this checkpoint. */
  readonly carrierStates: readonly CarrierState[];
  /** Living carriers of each module by species. */
  readonly carriersByModule: Record<string, Tally>;
  /** Living carriers per committed gain (keyed by the gaining daughter's birthId). */
  readonly carriersFromGain: Record<number, number>;
  /** Living carriers whose gain could not be found in the retained records (or that carried it from creation). */
  readonly carriersUnattributed: number;
  readonly branches: readonly BranchRow[];
  readonly firstBranchTick: number | null;
  readonly firstModuleBranchTick: number | null;
}

function emptyTally(): InheritanceTally {
  return {
    daughters: 0,
    gainEligible: 0,
    prefEligible: 0,
    quantDraws: 0,
    prefDraws: 0,
    moduleDraws: 0,
    gainAttempts: 0,
    gains: 0,
    gainNoOption: 0,
    lossAttempts: 0,
    losses: 0,
    lossNoOption: 0,
    unknown: 0,
    drawsChecked: 0,
    drawsMatched: 0,
    mismatches: 0,
    bySpecies: {},
    gainsByModule: {},
    lossesByModule: {},
    gainTrialsByModule: {},
    expectedGainsByModule: {},
    lossTrialsByModule: {},
    expectedLossesByModule: {},
    firstGainAttemptTick: null,
    firstGainTick: null,
    firstLossTick: null,
    firstCandidateTick: null,
  };
}

/** Module sets for probing one ancestor's draw keys: one with a legal gain, one with a legal loss. */
function probeSets(world: World, ancestor: string): { gain: readonly string[]; loss: readonly string[] } | null {
  const gains = eligibleGains(world, { ancestor, modules: [] });
  if (gains.length === 0) return null;
  return { gain: [], loss: [gains[0]!] };
}

/**
 * The module draw of daughter `d` of the parent with birthId `pb`, recomputed with the simulation's pure
 * draft function. The probe genomes differ from the parent only in their module sets, and the module
 * draw's keys never depend on the genome, so the result is the draw the parent's daughter received.
 * Read-only: nothing is interned or written.
 */
export function moduleDrawOf(world: World, parent: Genome, pb: number, d: number): ModuleDraw {
  const probe = probeSets(world, parent.ancestor);
  if (!probe) return 'unknown';
  if ((draftDaughter(world, { ...parent, modules: probe.gain }, pb, d).flags & MUT_MODULE_GAIN) !== 0) return 'gain';
  if ((draftDaughter(world, { ...parent, modules: probe.loss }, pb, d).flags & MUT_MODULE_LOSS) !== 0) return 'loss';
  return 'none';
}

/**
 * Observes committed daughters between ticks (lineage records appended since the last call), so the
 * tallies survive lineage compaction. Never writes to the world.
 */
export class InheritanceObserver {
  private next: number;
  private readonly tally = emptyTally();
  private readonly events: ModuleEvent[] = [];
  private readonly carrierSeconds: Record<string, CarrierSeconds> = {};
  /** Cumulative daughters and gain-eligible daughters at the end of each simulated second (index = second). */
  readonly daughtersBySecond: number[] = [0];
  readonly gainEligibleBySecond: number[] = [0];

  constructor(world: World) {
    this.next = world.lineage.base;
  }

  afterTick(world: World): void {
    const L = world.lineage;
    const t = this.tally;
    const end = L.base + L.parent.length;
    for (let b = Math.max(this.next, L.base); b < end; b++) this.observeRecord(world, b);
    this.next = end;
    if (t.firstCandidateTick === null && (world.events.totals.branchCandidate ?? 0) > 0) t.firstCandidateTick = world.tick - 1;
    if (world.tick % TICKS_PER_SECOND === 0) {
      this.daughtersBySecond[world.tick / TICKS_PER_SECOND] = t.daughters;
      this.gainEligibleBySecond[world.tick / TICKS_PER_SECOND] = t.gainEligible;
      this.sampleCarriers(world);
    }
  }

  private sampleCarriers(world: World): void {
    const c = world.ents.cols;
    for (let i = 0; i < world.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      const g = world.genomes.get(c.genome[i]!);
      if (g.modules.length === 0) continue;
      const sp = world.species[c.species[i]!]!.id;
      for (const m of g.modules) {
        const s = (this.carrierSeconds[`${m} ${sp}`] ??= {
          carrierSeconds: 0,
          reserveInUse: 0,
          notActive: 0,
          secreting: 0,
          outcomes: {},
          starchWithinReach: 0,
          energyAtOrBelowThreshold: 0,
          bothBlocked: 0,
        });
        s.carrierSeconds++;
        if (m === 'E05' && reserveBand(c.E[i]!, profileOf(world, i)) > 0) s.reserveInUse++;
        if (m === 'E03' && c.lifeState[i] !== LIFE_ACTIVE) s.notActive++;
        if (m === 'E01') {
          if (c.secreting[i] === 1) s.secreting++;
          // The secretion stage writes a code only for Active organisms (as sampleReasons counts it).
          const code = c.lifeState[i] === LIFE_ACTIVE ? c.secretionCode[i]! : c.limitCode[i]!;
          inc(s.outcomes, reasonName(code), 1);
          const near = starchWithinReach(world, entityCell(c.x[i]!, c.y[i]!));
          const rules = profileOf(world, i).starch;
          const low = rules !== null && c.E[i]! <= rules.minEnergy;
          if (near) s.starchWithinReach++;
          if (low) s.energyAtOrBelowThreshold++;
          if (low && !near) s.bothBlocked++;
        }
      }
    }
  }

  private observeRecord(world: World, b: number): void {
    const L = world.lineage;
    const t = this.tally;
    const k = b - L.base;
    if (L.origin[k] !== 0) return; // founders and added organisms are not daughter trials
    const pb = L.parent[k]!;
    // Daughters of one division get consecutive birthIds, daughter 0 first (a parent divides once).
    const d = k > 0 && L.parent[k - 1] === pb && L.origin[k - 1] === 0 ? 1 : 0;
    const flags = L.mutFlags[k]!;
    const tick = L.birthTick[k]!;
    const sp = world.species[L.species[k]!]!;
    const spDraws = (t.bySpecies[sp.id] ??= { daughters: 0, gainAttempts: 0, gains: 0, lossAttempts: 0, losses: 0 });
    t.daughters++;
    spDraws.daughters++;
    if ((flags & (MUT_QUANT | MUT_QUANT_NEUTRAL)) !== 0) t.quantDraws++;
    if (sp.foods.length >= 2) t.prefEligible++;
    if ((flags & MUT_PREF) !== 0) t.prefDraws++;
    const moduleId = (): string => world.content.modules[L.mutModule[k]!]?.id ?? `#${L.mutModule[k]}`;
    if ((flags & MUT_MODULE_GAIN) !== 0) {
      t.gains++;
      spDraws.gains++;
      const m = moduleId();
      t.gainsByModule[m] = (t.gainsByModule[m] ?? 0) + 1;
      t.firstGainTick ??= tick;
      this.events.push({ birthId: b, tick, species: sp.id, module: m, gained: true });
    }
    if ((flags & MUT_MODULE_LOSS) !== 0) {
      t.losses++;
      spDraws.losses++;
      const m = moduleId();
      t.lossesByModule[m] = (t.lossesByModule[m] ?? 0) + 1;
      t.firstLossTick ??= tick;
      this.events.push({ birthId: b, tick, species: sp.id, module: m, gained: false });
    }
    if (pb < L.base) {
      t.unknown++;
      return;
    }
    const parent = world.genomes.get(L.genome[pb - L.base]!);
    const legalGains = eligibleGains(world, parent);
    const canGain = legalGains.length > 0;
    if (canGain) t.gainEligible++;
    // Per-module trials and the chance each had at the preset in effect (the draft's own rates).
    const half = ratesFor(world.settings.mutationPreset, world.content.manifest.developmentalEnabled).module / 2;
    for (const m of legalGains) {
      inc((t.gainTrialsByModule[m] ??= {}), sp.id, 1);
      inc(t.expectedGainsByModule, m, half / legalGains.length);
    }
    const legalLosses = lossOptions(world, parent);
    for (const m of legalLosses) {
      inc((t.lossTrialsByModule[m] ??= {}), sp.id, 1);
      inc(t.expectedLossesByModule, m, half / legalLosses.length);
    }
    // Full re-draft: the recorded genome and descriptor are exactly the draw from the recorded keys.
    const draft = draftDaughter(world, parent, pb, d);
    t.drawsChecked++;
    if (
      draft.flags === flags &&
      draft.locus === L.mutLocus[k] &&
      draft.delta === L.mutDelta[k] &&
      draft.module === L.mutModule[k] &&
      genomeKey(draft.input) === genomeKey(world.genomes.get(L.genome[k]!))
    )
      t.drawsMatched++;
    const draw = moduleDrawOf(world, parent, pb, d);
    if (draw === 'unknown') {
      t.unknown++;
      return;
    }
    if (draw === 'gain') {
      t.moduleDraws++;
      t.gainAttempts++;
      spDraws.gainAttempts++;
      t.firstGainAttemptTick ??= tick;
      if ((flags & MUT_MODULE_GAIN) === 0) {
        if (canGain) t.mismatches++;
        else t.gainNoOption++;
      }
    } else if (draw === 'loss') {
      t.moduleDraws++;
      t.lossAttempts++;
      spDraws.lossAttempts++;
      if ((flags & MUT_MODULE_LOSS) === 0) {
        if (legalLosses.length > 0) t.mismatches++;
        else t.lossNoOption++;
      }
    }
    if (((flags & MUT_MODULE_GAIN) !== 0 && draw !== 'gain') || ((flags & MUT_MODULE_LOSS) !== 0 && draw !== 'loss'))
      t.mismatches++;
  }

  /** Deep copy of the tallies, plus living carriers and branch records read from the world now. */
  snapshot(world: World): InheritanceSnapshot {
    const t = this.tally;
    const bySpecies: Record<string, SpeciesDraws> = {};
    for (const [id, s] of Object.entries(t.bySpecies)) bySpecies[id] = { ...s };
    const carriers = carriersOf(world);
    const branches = branchRows(world);
    const firstOf = (rows: readonly BranchRow[]): number | null =>
      rows.length === 0 ? null : Math.min(...rows.map((r) => r.establishedTick));
    const carrierSeconds: Record<string, CarrierSeconds> = {};
    for (const [m, s] of Object.entries(this.carrierSeconds)) carrierSeconds[m] = { ...s, outcomes: { ...s.outcomes } };
    const copyNested = (x: Record<string, Tally>): Record<string, Tally> =>
      Object.fromEntries(Object.entries(x).map(([k, v]) => [k, { ...v }]));
    return {
      ...t,
      bySpecies,
      gainsByModule: { ...t.gainsByModule },
      lossesByModule: { ...t.lossesByModule },
      gainTrialsByModule: copyNested(t.gainTrialsByModule),
      expectedGainsByModule: { ...t.expectedGainsByModule },
      lossTrialsByModule: copyNested(t.lossTrialsByModule),
      expectedLossesByModule: { ...t.expectedLossesByModule },
      events: [...this.events],
      carrierSeconds,
      carrierStates: carrierStates(world),
      carriersByModule: carriers.byModule,
      carriersFromGain: carriers.fromGain,
      carriersUnattributed: carriers.unattributed,
      branches,
      firstBranchTick: firstOf(branches),
      firstModuleBranchTick: firstOf(branches.filter((r) => r.traitKind === 'module')),
    };
  }
}

/** Living carriers of each module, attributed to the nearest committed gain in their retained ancestry. */
function carriersOf(world: World): {
  byModule: Record<string, Tally>;
  fromGain: Record<number, number>;
  unattributed: number;
} {
  const L = world.lineage;
  const c = world.ents.cols;
  const byModule: Record<string, Tally> = {};
  const fromGain: Record<number, number> = {};
  let unattributed = 0;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const g = world.genomes.get(c.genome[i]!);
    if (g.modules.length === 0) continue;
    const sp = world.species[c.species[i]!]!.id;
    for (const m of g.modules) {
      const per = (byModule[m] ??= {});
      per[sp] = (per[sp] ?? 0) + 1;
      const idx = world.content.modules.findIndex((def) => def.id === m);
      let b = c.birthId[i]!;
      let found = -1;
      for (let guard = 0; guard <= L.parent.length; guard++) {
        if (b < L.base || b >= L.base + L.parent.length) break;
        const k = b - L.base;
        if (L.origin[k] !== 0) break; // carried from creation or added with it: not a gain in this dish
        if ((L.mutFlags[k]! & MUT_MODULE_GAIN) !== 0 && L.mutModule[k] === idx) {
          found = b;
          break;
        }
        b = L.parent[k]!;
      }
      if (found >= 0) fromGain[found] = (fromGain[found] ?? 0) + 1;
      else unattributed++;
    }
  }
  return { byModule, fromGain, unattributed };
}

/** Living carriers per module and species, with the same species' module-free organisms beside them. */
function carrierStates(world: World): CarrierState[] {
  const c = world.ents.cols;
  const acc: Record<string, { alive: number; e: number; cap: number }> = {};
  const plain: Record<string, { alive: number; e: number }> = {};
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const sp = world.species[c.species[i]!]!.id;
    const g = world.genomes.get(c.genome[i]!);
    if (g.modules.length === 0) {
      const p = (plain[sp] ??= { alive: 0, e: 0 });
      p.alive++;
      p.e += c.E[i]!;
      continue;
    }
    const cap = profileOf(world, i).energyCap;
    for (const m of g.modules) {
      const a = (acc[`${m} ${sp}`] ??= { alive: 0, e: 0, cap: 0 });
      a.alive++;
      a.e += c.E[i]!;
      a.cap += cap;
    }
  }
  return Object.keys(acc)
    .sort()
    .map((key) => {
      const [module, species] = key.split(' ') as [string, string];
      const a = acc[key]!;
      const p = plain[species];
      return {
        module,
        species,
        alive: a.alive,
        meanE: a.e / a.alive,
        meanCap: a.cap / a.alive,
        plainAlive: p?.alive ?? 0,
        plainMeanE: p && p.alive > 0 ? p.e / p.alive : 0,
      };
    });
}

function traitText(world: World, trait: BranchTrait | undefined): string {
  if (!trait) return 'not recorded';
  switch (trait.kind) {
    case 'module':
      return `${trait.gained ? 'gained' : 'lost'} ${trait.module}`;
    case 'locus': {
      const name = world.content.loci[trait.locus]?.name ?? `locus ${trait.locus}`;
      return `${name} ${trait.delta > 0 ? '+' : ''}${trait.delta}${trait.mean ? ' (mean-difference rule)' : ''}`;
    }
    case 'policy':
      return `feeding policy ${trait.policy}`;
    case 'weight':
      return `food weight ${trait.food} ${trait.delta > 0 ? '+' : ''}${trait.delta.toFixed(2)}`;
  }
}

function branchRows(world: World): BranchRow[] {
  const book = world.branches;
  return book.branches.map((br) => ({
    id: br.id,
    species: world.species[br.species]?.id ?? `#${br.species}`,
    name: generatedBranchName(world, br),
    traitKind: br.trait?.kind ?? 'unknown',
    trait: traitText(world, br.trait),
    candidateTick: br.candidateTick,
    establishedTick: br.establishedTick,
    extinctTick: br.extinctTick >= 0 ? br.extinctTick : null,
    membersAtEstablish: br.membersAtEstablish ?? null,
    depthAtEstablish: br.depthAtEstablish ?? null,
    alive: br.alive,
    subtreeAlive: subtreeAlive(book, br.id),
    peak: br.peak ?? null,
  }));
}

// ---------------------------------------------------------------------------- checkpoints

export interface Checkpoint {
  tick: number;
  seconds: number;
  /** Milestone ticks (tick index during which the event happened) or null when censored. */
  firstIntakeTick: number | null;
  firstIntakeBySpecies: Record<string, number | null>;
  firstDivisionTick: number | null;
  firstDivisionBySpecies: Record<string, number | null>;
  firstMutationTick: number | null;
  /** Committed divisions (one birth event per division; each makes two daughters). */
  births: number;
  deaths: number;
  birthsBySpecies: Tally;
  deathsBySpecies: Tally;
  /** Death causes tallied from retained lineage records (world.lineage.deathCause). */
  deathsByCause: Tally;
  deathsBySpeciesCause: Record<string, Tally>;
  deathCauseCoverage: { tallied: number; total: number; compactedRecords: number };
  counts: Tally;
  biomass: Tally;
  food: FoodTotals;
  nutrientFree: number;
  oxygenMean: number;
  /** Net carbon exchanged with the air through the open lid (ledger), and starch converted by enzyme. */
  carbonFromAir: number;
  starchConverted: number;
  mutations: number;
  /** Mutation descriptor kinds over retained birth records (daughters). */
  mutationKinds: {
    quantitative: number;
    neutralDraws: number;
    preference: number;
    moduleGain: number;
    moduleLoss: number;
  };
  /** Per-daughter draws, module changes, living carriers and branch records (observed every tick). */
  inheritance: InheritanceSnapshot;
  branchCandidateEvents: number;
  branchCandidatesLive: number;
  branchesEstablished: number;
  branchesAlive: number;
  /** Founding species with no living organism at this time. */
  extinct: string[];
  /** Per-second history: first second of the final run of zero counts, per extinct species. */
  extinctionSecond: Record<string, number>;
  peak: Record<string, { count: number; second: number }>;
  ledger: { ok: boolean; relErrC: number; relErrN: number; relErrM: number };
  hash: string;
  wall: { ticks: number; totalMs: number; meanMs: number; p95Ms: number; effectiveSpeed: number };
}

export interface SeedRun {
  recipe: string;
  recipeRevision: number | null;
  seed: number;
  preset: Preset;
  /** Per-daughter chances of the preset in effect (never changed during a tuning run). */
  rates: MutationRates;
  contentHash: string;
  simulationVersion: number;
  /** The world's recorded rule versions (content/manifest.json) and world schema version. */
  rules: RuleVersions;
  /** Module display names of the world's recorded registry (id → name). */
  moduleNames: Record<string, string>;
  founders: Tally;
  species: string[];
  initialFood: FoodTotals;
  initialPatches: { label: string; carbon: number }[];
  initialHash: string;
  checkpoint: Checkpoint;
  /** Same object as checkpoint when the run was not extended. */
  final: Checkpoint;
  extended: boolean;
  /** Supplementary horizon checkpoint (not the D06 rule), or null; the same object as `final` when they coincide. */
  horizon: Checkpoint | null;
  /** State hashes of a plain run of the same seed (no observer, no hooks) by tick, or null when not checked. */
  plain: Record<number, string> | null;
  /** Counts per species every 60 s (from the per-second history), to the last checkpoint taken. */
  countSeries: { second: number; counts: Tally }[];
  /** Cumulative committed daughters and gain-eligible daughters at the end of each second (index = second). */
  daughtersBySecond: number[];
  gainEligibleBySecond: number[];
  samples: ReasonSample[];
}

export interface RuleVersions {
  readonly simulation: number;
  readonly evolutionRules: number;
  readonly moduleRegistry: number;
  readonly phenotypeMapping: number;
  readonly content: number;
  readonly worldSchema: number;
}

function ruleVersions(world: World): RuleVersions {
  const m = world.content.manifest;
  return {
    simulation: m.simulationVersion,
    evolutionRules: m.evolutionRulesVersion,
    moduleRegistry: m.moduleRegistryVersion,
    phenotypeMapping: m.phenotypeMappingVersion,
    content: m.contentVersion,
    worldSchema: world.schemaVersion,
  };
}

// ---------------------------------------------------------------------------- measurement

function foodTotals(world: World): FoodTotals {
  const cells = maskCells();
  const f = world.fields;
  let sugar = 0;
  let starch = 0;
  let detritus = 0;
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    sugar += f.sugar?.[i] ?? 0;
    starch += f.starch?.[i] ?? 0;
    detritus += f.detritus?.[i] ?? 0;
  }
  return { sugar, starch, detritus, total: sugar + starch + detritus };
}

function inc(t: Tally, key: string, by: number): void {
  t[key] = (t[key] ?? 0) + by;
}

function allHistory(world: World): HistorySample[] {
  return [...world.history.minutes, ...world.history.seconds];
}

export function sampleReasons(
  world: World,
  second: number,
  probes: readonly PatchProbe[] = [],
): ReasonSample {
  const c = world.ents.cols;
  const nutrient = world.fields.nutrient;
  const oxygen = world.fields.oxygen;
  const sugar = world.fields.sugar;
  const acc: Record<string, SpeciesSample> = {};
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const sp = world.species[c.species[i]!]!;
    const s = (acc[sp.id] ??= {
      alive: 0,
      meanE: 0,
      meanBOverB0: 0,
      meanH: 0,
      stressedFraction: 0,
      meanCellNutrient: 0,
      meanCellOxygen: 0,
      meanCellSugar: 0,
      meanIntakePerSecond: 0,
      meanX: 0,
      meanY: 0,
      limit: {},
      limitValueSum: {},
      divBlock: {},
      secretion: {},
    });
    const cell = entityCell(c.x[i]!, c.y[i]!);
    s.alive++;
    s.meanE += c.E[i]!;
    s.meanBOverB0 += c.B[i]! / sp.def.b0;
    s.meanH += c.H[i]!;
    if ((c.flags[i]! & FLAG.stressed) !== 0) s.stressedFraction++;
    s.meanCellNutrient += nutrient?.[cell] ?? 0;
    s.meanCellOxygen += oxygen?.[cell] ?? 0;
    s.meanCellSugar += sugar?.[cell] ?? 0;
    s.meanIntakePerSecond += c.intakeLastSecond[i]!;
    s.meanX += c.x[i]!;
    s.meanY += c.y[i]!;
    const limitName = reasonName(c.limitCode[i]!);
    inc(s.limit, limitName, 1);
    inc(s.limitValueSum, limitName, c.limitValue[i]!);
    inc(s.divBlock, reasonName(c.divBlockCode[i]!), 1);
    // Producer rules come from the organism's profile (native producer or E01 carrier), never the
    // species alone.
    if (profileOf(world, i).starch !== null) {
      const code = c.lifeState[i] === LIFE_ACTIVE ? c.secretionCode[i]! : c.limitCode[i]!;
      inc(s.secretion, reasonName(code), 1);
    }
  }
  for (const id of Object.keys(acc)) {
    const s = acc[id]!;
    const n = s.alive;
    s.meanE /= n;
    s.meanBOverB0 /= n;
    s.meanH /= n;
    s.stressedFraction /= n;
    s.meanCellNutrient /= n;
    s.meanCellOxygen /= n;
    s.meanCellSugar /= n;
    s.meanIntakePerSecond /= n;
    s.meanX /= n;
    s.meanY /= n;
  }
  return { second, species: acc, patches: patchCarbon(world, probes) };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

function takeCheckpoint(
  world: World,
  speciesIds: readonly string[],
  firstIntakeBySpecies: Record<string, number | null>,
  tickMs: readonly number[],
  observer: InheritanceObserver,
): Checkpoint {
  const ev = world.events;
  const m = ev.milestones;
  const ms = (name: string): number | null => (m[name] === undefined ? null : m[name]);
  const c = world.ents.cols;

  const counts: Tally = {};
  const biomass: Tally = {};
  for (const id of speciesIds) {
    counts[id] = 0;
    biomass[id] = 0;
  }
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const id = world.species[c.species[i]!]!.id;
    inc(counts, id, 1);
    biomass[id] = (biomass[id] ?? 0) + c.B[i]!;
  }

  // Deaths by cause from retained lineage records (the event ring keeps only the last 500 events).
  const L = world.lineage;
  const deathsByCause: Tally = {};
  const deathsBySpeciesCause: Record<string, Tally> = {};
  let tallied = 0;
  const mutationKinds = { quantitative: 0, neutralDraws: 0, preference: 0, moduleGain: 0, moduleLoss: 0 };
  for (let k = 0; k < L.parent.length; k++) {
    const flags = L.mutFlags[k]!;
    if (flags & MUT_QUANT) mutationKinds.quantitative++;
    if (flags & MUT_QUANT_NEUTRAL) mutationKinds.neutralDraws++;
    if (flags & MUT_PREF) mutationKinds.preference++;
    if (flags & MUT_MODULE_GAIN) mutationKinds.moduleGain++;
    if (flags & MUT_MODULE_LOSS) mutationKinds.moduleLoss++;
    const cause = L.deathCause[k]!;
    if (L.deathTick[k]! < 0 || cause <= 0) continue; // alive (0) or ended by division (-1)
    const name = reasonName(cause);
    const sp = world.species[L.species[k]!]!.id;
    inc(deathsByCause, name, 1);
    inc((deathsBySpeciesCause[sp] ??= {}), name, 1);
    tallied++;
  }

  // Per-species births/deaths, extinction and peaks from the per-second history.
  const hist = allHistory(world);
  const birthsBySpecies: Tally = {};
  const deathsBySpecies: Tally = {};
  const peak: Record<string, { count: number; second: number }> = {};
  const extinctionSecond: Record<string, number> = {};
  world.species.forEach((sp, j) => {
    if (!speciesIds.includes(sp.id)) return;
    let b = 0;
    let d = 0;
    let best = { count: -1, second: 0 };
    let lastAlive = -1;
    for (const s of hist) {
      b += s.births[j] ?? 0;
      d += s.deaths[j] ?? 0;
      const n = s.count[j] ?? 0;
      if (n > best.count) best = { count: n, second: s.second };
      if (n > 0) lastAlive = s.second;
    }
    birthsBySpecies[sp.id] = b;
    deathsBySpecies[sp.id] = d;
    peak[sp.id] = best;
    const last = hist.at(-1);
    if (last && (last.count[j] ?? 0) === 0 && lastAlive >= 0) {
      const after = hist.find((s) => s.second > lastAlive);
      if (after) extinctionSecond[sp.id] = after.second;
    }
  });

  const firstDivisionBySpecies: Record<string, number | null> = {};
  for (const id of speciesIds) firstDivisionBySpecies[id] = ms(`firstDivision:${id}`);

  const cells = maskCells();
  let nutrientFree = 0;
  let oxygenSum = 0;
  for (let k = 0; k < cells.length; k++) {
    nutrientFree += world.fields.nutrient?.[cells[k]!] ?? 0;
    oxygenSum += world.fields.oxygen?.[cells[k]!] ?? 0;
  }

  const ledger = checkLedger(world);
  const sorted = [...tickMs].sort((a, b) => a - b);
  const totalMs = tickMs.reduce((a, b) => a + b, 0);
  const meanMs = tickMs.length > 0 ? totalMs / tickMs.length : 0;
  const tickSeconds = 1000 / TICKS_PER_SECOND;
  return {
    tick: world.tick,
    seconds: world.tick / TICKS_PER_SECOND,
    firstIntakeTick: ms('firstIntake'),
    firstIntakeBySpecies: { ...firstIntakeBySpecies },
    firstDivisionTick: ms('firstDivision'),
    firstDivisionBySpecies,
    firstMutationTick: ms('firstMutation'),
    births: ev.totals.birth ?? 0,
    deaths: ev.totals.death ?? 0,
    birthsBySpecies,
    deathsBySpecies,
    deathsByCause,
    deathsBySpeciesCause,
    deathCauseCoverage: { tallied, total: ev.totals.death ?? 0, compactedRecords: L.compacted },
    counts,
    biomass,
    food: foodTotals(world),
    nutrientFree,
    oxygenMean: oxygenSum / cells.length,
    carbonFromAir: world.ledger.exchangeC,
    starchConverted: world.conversionTotals.starch,
    mutations: ev.totals.mutation ?? 0,
    mutationKinds,
    inheritance: observer.snapshot(world),
    branchCandidateEvents: ev.totals.branchCandidate ?? 0,
    branchCandidatesLive: Object.keys(world.branches.candidates).length,
    branchesEstablished: world.branches.established,
    branchesAlive: world.branches.branches.filter((b) => b.alive > 0).length,
    extinct: speciesIds.filter((id) => counts[id] === 0),
    extinctionSecond,
    peak,
    ledger: { ok: ledger.ok, relErrC: ledger.relErr.c, relErrN: ledger.relErr.n, relErrM: ledger.relErr.m },
    hash: stateHash(world),
    wall: {
      ticks: tickMs.length,
      totalMs,
      meanMs,
      p95Ms: percentile(sorted, 0.95),
      effectiveSpeed: meanMs > 0 ? tickSeconds / meanMs : 0,
    },
  };
}

/** Run one recipe at one seed under the §11 protocol. Observation only: never alters the world. */
export function tuneSeed(registry: ContentRegistry, opts: TuneSeedOptions): SeedRun {
  const preset = opts.preset;
  const world = realizeRecipe(registry, opts.recipe, {
    seed: opts.seed,
    transform: (r) => ({ ...r, mutationPreset: preset }),
  });
  const recipeDef = registry.recipes[opts.recipe]!;
  const founders: Tally = {};
  for (const f of recipeDef.founders) inc(founders, f.species, f.count);
  const speciesIds = Object.keys(founders);
  for (const sp of world.species) if (!speciesIds.includes(sp.id)) speciesIds.push(sp.id);

  const firstIntakeBySpecies: Record<string, number | null> = {};
  for (const id of speciesIds) firstIntakeBySpecies[id] = null;
  let pendingIntake = speciesIds.length;
  // Read-only observer after stage 6: the feeding flag is set exactly when an organism took carbon.
  const hooks = {
    afterStage: (stage: number, w: World) => {
      if (stage !== 6 || pendingIntake === 0) return;
      const c = w.ents.cols;
      for (let i = 0; i < w.ents.highWater; i++) {
        if (c.alive[i] !== 1 || (c.flags[i]! & FLAG.feeding) === 0) continue;
        const id = w.species[c.species[i]!]!.id;
        if (firstIntakeBySpecies[id] === null) {
          firstIntakeBySpecies[id] = w.tick;
          pendingIntake--;
        }
      }
    },
  };

  const probes = patchProbes(world, registry, opts.recipe);
  const initialPatches = patchCarbon(world, probes);
  const initialFood = foodTotals(world);
  const initialHash = stateHash(world);
  const observer = new InheritanceObserver(world);
  const checkTick = Math.round(opts.seconds * TICKS_PER_SECOND);
  const extendTick = Math.max(checkTick, Math.round(opts.extendSeconds * TICKS_PER_SECOND));
  const sampleTicks = (opts.sampleSeconds ?? DEFAULT_SAMPLE_SECONDS).map((s) =>
    Math.round(s * TICKS_PER_SECOND),
  );
  const samples: ReasonSample[] = [];
  const tickMs: number[] = [];

  const runTo = (target: number) => {
    while (world.tick < target) {
      const t0 = performance.now();
      step(world, hooks);
      tickMs.push(performance.now() - t0);
      observer.afterTick(world);
      if (sampleTicks.includes(world.tick))
        samples.push(sampleReasons(world, world.tick / TICKS_PER_SECOND, probes));
    }
  };

  const take = () => takeCheckpoint(world, speciesIds, firstIntakeBySpecies, tickMs, observer);
  runTo(checkTick);
  const checkpoint = take();
  const extended = checkpoint.mutations === 0 && extendTick > checkTick;
  // The supplementary horizon never changes the D06 checkpoints: it is taken on the way to, at, or
  // after the D06 endpoint of the same run.
  const horizonTick = Math.round((opts.horizonSeconds ?? 0) * TICKS_PER_SECOND);
  let horizon: Checkpoint | null = null;
  if (extended && horizonTick > checkTick && horizonTick < extendTick) {
    runTo(horizonTick);
    horizon = take();
  }
  let final = checkpoint;
  if (extended) {
    runTo(extendTick);
    final = take();
  }
  if (horizonTick > checkTick && horizon === null) {
    if (horizonTick === final.tick) horizon = final;
    else {
      runTo(horizonTick);
      horizon = take();
    }
  }

  const countSeries: { second: number; counts: Tally }[] = [];
  for (const s of allHistory(world)) {
    if (s.second % 60 !== 0) continue;
    const counts: Tally = {};
    world.species.forEach((sp, j) => {
      if (speciesIds.includes(sp.id)) counts[sp.id] = s.count[j] ?? 0;
    });
    countSeries.push({ second: s.second, counts });
  }

  return {
    recipe: opts.recipe,
    recipeRevision: world.content.provenance.recipeRevision,
    seed: world.seed,
    preset,
    rates: ratesFor(world.settings.mutationPreset, world.content.manifest.developmentalEnabled),
    contentHash: world.content.manifest.contentHash,
    simulationVersion: world.content.manifest.simulationVersion,
    rules: ruleVersions(world),
    moduleNames: Object.fromEntries(world.content.modules.map((m) => [m.id, m.name])),
    founders,
    species: speciesIds,
    initialFood,
    initialPatches,
    initialHash,
    checkpoint,
    final,
    extended,
    horizon,
    plain: null,
    countSeries,
    daughtersBySecond: [...observer.daughtersBySecond],
    gainEligibleBySecond: [...observer.gainEligibleBySecond],
    samples: samples.filter((s) => s.second <= final.seconds),
  };
}

/**
 * State hashes of a plain run of the same recipe, seed and preset (realizeRecipe, then step with no
 * hooks and no observer) at the given ticks: the evidence that the tuner only observes.
 */
export function plainRunHashes(
  registry: ContentRegistry,
  opts: { readonly recipe: string; readonly seed: number; readonly preset: Preset },
  ticks: readonly number[],
): Record<number, string> {
  const world = realizeRecipe(registry, opts.recipe, {
    seed: opts.seed,
    transform: (r) => ({ ...r, mutationPreset: opts.preset }),
  });
  const out: Record<number, string> = {};
  for (const t of [...new Set(ticks)].sort((a, b) => a - b)) {
    while (world.tick < t) step(world);
    out[t] = stateHash(world);
  }
  return out;
}

/** The checkpoints a run took, in time order, without repeats. */
export function checkpointsOf(r: SeedRun): Checkpoint[] {
  const all = [r.checkpoint, r.final, ...(r.horizon ? [r.horizon] : [])];
  return [...new Map(all.map((c) => [c.tick, c] as const)).values()].sort((a, b) => a.tick - b.tick);
}

/** Checkpoint ticks whose plain-run hash differs from the observed run's (empty when all agree). */
export function plainMismatches(r: SeedRun): number[] {
  if (r.plain === null) return [];
  return checkpointsOf(r)
    .filter((c) => r.plain![c.tick] !== c.hash)
    .map((c) => c.tick);
}

// ---------------------------------------------------------------------------- statistics

export interface CensoredStats {
  n: number;
  events: number;
  censored: number;
  /** Seconds, or a lower bound when the median rank falls on censored values. */
  median: { value: number; lowerBound: boolean } | null;
  min: number | null;
  max: number | null;
}

/**
 * Median/range over seeds where some values may be censored at a common time T (seconds).
 * Censored values rank above every observed value; they are never treated as events at T.
 */
export function censoredStats(
  valuesSeconds: readonly (number | null)[],
  censorSeconds: number,
): CensoredStats {
  const obs = valuesSeconds.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const n = valuesSeconds.length;
  const events = obs.length;
  const at = (k: number): number | null => (k < events ? obs[k]! : null);
  let median: CensoredStats['median'] = null;
  if (n > 0) {
    if (n % 2 === 1) {
      const v = at((n - 1) / 2);
      median = v === null ? { value: censorSeconds, lowerBound: true } : { value: v, lowerBound: false };
    } else {
      const lo = at(n / 2 - 1);
      const hi = at(n / 2);
      if (lo !== null && hi !== null) median = { value: (lo + hi) / 2, lowerBound: false };
      else if (lo !== null) median = { value: (lo + censorSeconds) / 2, lowerBound: true };
      else median = { value: censorSeconds, lowerBound: true };
    }
  }
  return {
    n,
    events,
    censored: n - events,
    median,
    min: events > 0 ? obs[0]! : null,
    max: events > 0 ? obs[events - 1]! : null,
  };
}

/**
 * Central 95 % range of the number of events in `trials` independent per-daughter draws of chance `p`:
 * exact Poisson quantiles for rare draws (p ≤ 0.02, the module rates), a normal approximation to the
 * binomial otherwise. The range covers at least 95 % of outcomes; it describes the rate, not a target.
 */
export function countRange95(trials: number, p: number): [number, number] {
  const mean = trials * p;
  if (!(mean > 0)) return [0, 0];
  if (p <= 0.02 && mean <= 700) {
    let k = 0;
    let pmf = Math.exp(-mean);
    let cdf = pmf;
    let lo: number | null = cdf >= 0.025 ? 0 : null;
    while (cdf < 0.975) {
      k++;
      pmf *= mean / k;
      cdf += pmf;
      if (lo === null && cdf >= 0.025) lo = k;
    }
    return [lo ?? 0, k];
  }
  const sd = Math.sqrt(trials * p * (1 - p));
  return [Math.max(0, Math.floor(mean - 1.96 * sd)), Math.ceil(mean + 1.96 * sd)];
}

/** Chance that none of `trials` independent draws of chance `p` fired. */
export function chanceOfNone(trials: number, p: number): number {
  if (p <= 0) return 1;
  return Math.exp(trials * Math.log1p(-p));
}

/**
 * First second by which the chance of no event among the counted trials fell to one half (the median
 * wait for this dish's own daughter production), or null when it never did by the end of the series.
 */
export function medianWaitSecond(cumulativeTrials: readonly number[], p: number): number | null {
  if (p <= 0) return null;
  const needed = Math.log(0.5) / Math.log1p(-p);
  for (let s = 0; s < cumulativeTrials.length; s++) if ((cumulativeTrials[s] ?? 0) >= needed) return s;
  return null;
}

// ---------------------------------------------------------------------------- report

const sec = (tick: number | null): number | null => (tick === null ? null : tick / TICKS_PER_SECOND);
const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const sci = (v: number) => (v === 0 ? '0' : v.toExponential(1));
/** A chance as a percentage with up to three significant digits: 8 %, 0.1 %, 10.5 %. */
export function pct(v: number): string {
  const x = 100 * v;
  const s = x === 0 ? '0' : x >= 10 ? x.toFixed(1) : x >= 1 ? x.toFixed(2) : x.toPrecision(2);
  return `${/^\d+\.\d+$/.test(s) ? s.replace(/\.?0+$/, '') : s} %`;
}
const presetLabel = (p: Preset) => (p === 'standard' ? 'Standard' : 'Accelerated');

/**
 * Whether a milestone happened inside a target window. A milestone censored at a stopping time shorter
 * than the window is unknown, never a miss: the event may still have happened inside the window.
 */
export function withinTarget(
  tick: number | null,
  targetSeconds: number,
  stopSeconds: number,
): 'yes' | 'no' | 'unknown' {
  if (tick !== null) return tick < targetSeconds * TICKS_PER_SECOND ? 'yes' : 'no';
  return stopSeconds < targetSeconds ? 'unknown' : 'no';
}

function tickCell(tick: number | null, censorAt: number): string {
  return tick === null ? `none by ${censorAt} s` : `${f1(tick / TICKS_PER_SECOND)} s (t${tick})`;
}

function medianText(s: CensoredStats): string {
  return s.median === null
    ? '—'
    : s.median.lowerBound
      ? `≥ ${f1(s.median.value)} s (not estimable)`
      : `${f1(s.median.value)} s`;
}

function statsLine(label: string, s: CensoredStats, T: number): string {
  const range = s.min === null ? '—' : `${f1(s.min)}–${f1(s.max!)} s`;
  return `| ${label} | ${s.events}/${s.n} | ${medianText(s)} | ${range} | ${s.censored}/${s.n} (no event by ${T} s) |`;
}

function tallyText(t: Tally, total?: number): string {
  const keys = Object.keys(t).sort((a, b) => t[b]! - t[a]! || (a < b ? -1 : 1));
  if (keys.length === 0) return '—';
  const sum = total ?? keys.reduce((a, k) => a + t[k]!, 0);
  return keys.map((k) => `${k} ${t[k]}${sum > 0 ? ` (${Math.round((100 * t[k]!) / sum)}%)` : ''}`).join(', ');
}

/** "E05 3, E01 1" (no shares). */
function countsText(t: Tally): string {
  const keys = Object.keys(t).sort((a, b) => t[b]! - t[a]! || (a < b ? -1 : 1));
  return keys.length === 0 ? '—' : keys.map((k) => `${k} ${t[k]}`).join(', ');
}

function limitText(t: Tally, valueSum: Tally): string {
  const keys = Object.keys(t).sort((a, b) => t[b]! - t[a]! || (a < b ? -1 : 1));
  if (keys.length === 0) return '—';
  const sum = keys.reduce((a, k) => a + t[k]!, 0);
  return keys
    .map((k) => `${k} ${Math.round((100 * t[k]!) / sum)}% (${((valueSum[k] ?? 0) / t[k]!).toFixed(2)})`)
    .join(', ');
}

/** Median and range of per-seed values: "12 (8–19)". */
function medianRange(values: readonly number[], digits = 0): string {
  if (values.length === 0) return '—';
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  const med = n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
  const fmt = (v: number) => v.toFixed(Number.isInteger(v) && digits === 0 ? 0 : Math.max(digits, 1));
  return `${fmt(med)} (${fmt(s[0]!)}–${fmt(s[n - 1]!)})`;
}

const sumTally = (t: Tally) => Object.values(t).reduce((a, b) => a + b, 0);
const carriersAlive = (cp: Checkpoint) =>
  Object.values(cp.inheritance.carriersByModule).reduce((a, t) => a + sumTally(t), 0);
const gainsWithCarrier = (cp: Checkpoint) =>
  cp.inheritance.events.filter((e) => e.gained && (cp.inheritance.carriersFromGain[e.birthId] ?? 0) > 0).length;
const confirmed = (cp: Checkpoint, kind?: BranchRow['traitKind']) =>
  cp.inheritance.branches.filter((b) => kind === undefined || b.traitKind === kind).length;

/** The code revision a report was generated from (read-only git queries). */
export interface BuildInfo {
  /** git HEAD when generated, or null outside a git checkout. */
  readonly commit: string | null;
  /** Uncommitted paths under src/sim/ and content/: everything the simulated numbers depend on. */
  readonly simChanges: readonly string[];
  /** Uncommitted paths under the report tool's own code (observation only). */
  readonly toolChanges: readonly string[];
}

export const SIM_ROOTS: readonly string[] = ['src/sim', 'content'];
export const TOOL_ROOTS: readonly string[] = ['tools/sim-tune.ts', 'tools/lib'];

/** HEAD and the uncommitted paths under SIM_ROOTS and TOOL_ROOTS; never takes the index lock. */
export function buildInfo(root: string = REPO_ROOT): BuildInfo {
  const git = (...args: string[]) =>
    spawnSync('git', ['--no-optional-locks', ...args], { cwd: root, encoding: 'utf8' });
  const head = git('rev-parse', 'HEAD');
  if (head.status !== 0) return { commit: null, simChanges: [], toolChanges: [] };
  const changed = (roots: readonly string[]): string[] => {
    const r = git('status', '--porcelain=v1', '--untracked-files=all', '--', ...roots);
    if (r.status !== 0) return ['(git status failed)'];
    return r.stdout
      .split('\n')
      .filter((l) => l.length > 3)
      .map((l) => l.slice(3))
      .sort();
  };
  return { commit: head.stdout.trim(), simChanges: changed(SIM_ROOTS), toolChanges: changed(TOOL_ROOTS) };
}

/** The header line naming the build. */
export function buildLine(b: BuildInfo): string {
  if (b.commit === null) return '- Build: not a git checkout; the code revision is unknown.';
  const sim =
    b.simChanges.length === 0
      ? 'identical to that commit'
      : `**not identical to that commit** (uncommitted: ${b.simChanges.join(', ')})`;
  const tool =
    b.toolChanges.length === 0
      ? ''
      : ` The report tool has uncommitted changes (${b.toolChanges.join(', ')}); it only reads the world, so they change what is reported, not the simulated numbers.`;
  return `- Build: git \`${b.commit}\` (HEAD when generated). src/sim/ and content/, everything the simulated numbers depend on, are ${sim}.${tool}`;
}

export interface ReportMeta {
  readonly command: string;
  readonly seconds: number;
  readonly extendSeconds: number;
  /** Supplementary horizon (seconds; 0 or absent: none). The horizon sections read it from the runs. */
  readonly horizonSeconds?: number;
  /** True when every seed was also run with no observer and its hashes compared (SeedRun.plain). */
  readonly plainCheck?: boolean;
  /** Kept for single-preset callers; the presets reported are read from the runs. */
  readonly preset?: Preset;
  readonly machine: string;
  readonly generatedAt: string;
  readonly wallSeconds: number;
  /** 1-minute load averages at start and end (wall-time numbers are only comparable on a quiet machine). */
  readonly loadAverage?: readonly [number, number];
  /** The code revision the tables came from. */
  readonly build?: BuildInfo;
}

/** Which checkpoint of a run a table reads. */
type Pick = (r: SeedRun) => Checkpoint;
const atCheckpoint: Pick = (r) => r.checkpoint;
const atHorizon: Pick = (r) => r.horizon!;

const foundingSpecies = (r0: SeedRun): string[] => r0.species.filter((id) => (r0.founders[id] ?? 0) > 0);
const moduleLabel = (r0: SeedRun, m: string): string => (r0.moduleNames[m] ? `${m} ${r0.moduleNames[m]}` : m);

function perTrialText(events: number, trials: number): string {
  return trials === 0 ? '—' : events === 0 ? '0' : `${pct(events / trials)} (1 in ${Math.round(trials / events)})`;
}

/** Expected count and its 95 % range for `trials` draws whose chances sum to `expected`. */
function expectedText(trials: number, expected: number): string {
  if (trials === 0) return '—';
  const [lo, hi] = countRange95(trials, expected / trials);
  return `${f1(expected)} (${lo}–${hi})`;
}

/** "2900 (B01 2856, B04 44)". */
function trialsText(t: Tally): string {
  const n = sumTally(t);
  return n === 0 ? '0' : `${n} (${countsText(t)})`;
}

/** Birth tick of the first committed gain of module `m`, or null. */
const firstGainOf = (cp: Checkpoint, m: string): number | null => {
  const e = cp.inheritance.events.find((x) => x.gained && x.module === m);
  return e === undefined ? null : e.tick;
};

/** Plain-run check of the given checkpoints of one run. */
function plainCell(r: SeedRun, cps: readonly Checkpoint[]): string {
  if (r.plain === null) return 'not run';
  const bad = cps.filter((c) => r.plain![c.tick] !== c.hash);
  if (bad.length === 0) return `same at ${cps.map((c) => `${c.seconds} s`).join(' and ')}`;
  return bad.map((c) => `DIFFERS at ${c.seconds} s: \`${r.plain![c.tick] ?? 'not recorded'}\``).join('; ');
}

/** Pooled per-daughter rates of every draw at one checkpoint, and the per-species split. */
function renderRates(out: string[], rs: readonly SeedRun[], pick: Pick, T: number): void {
  const rates = rs[0]!.rates;
  const cps = rs.map(pick);
  const pool = (f: (t: InheritanceSnapshot) => number) => cps.reduce((a, c) => a + f(c.inheritance), 0);
  const D = pool((t) => t.daughters);
  const minutes = (rs.length * T) / 60;
  out.push(`#### Per-daughter rates, pooled over ${rs.length} seeds (${T} s each)`);
  out.push('');
  out.push(
    `A small batch characterizes this prototype dish; it does not establish population-wide probabilities (D06 §18). "Per simulated minute" is the pooled count ÷ ${f1(minutes)} dish-minutes (mean per dish per minute).`,
  );
  out.push('');
  out.push(
    '| Draw | Daughter trials | Events | Per daughter trial | Preset chance | Expected at the preset chance (95 % range) | Per simulated minute |',
  );
  out.push('|---|---|---|---|---|---|---|');
  const rateRow = (label: string, trials: number, events: number, p: number | null) => {
    const expected = p === null ? '— (needs a legal option)' : expectedText(trials, trials * p);
    out.push(
      `| ${label} | ${trials} | ${events} | ${perTrialText(events, trials)} | ${p === null ? '—' : pct(p)} | ${expected} | ${(events / minutes).toFixed(3)} |`,
    );
  };
  rateRow('Quantitative draw (changed or clamped)', D, pool((t) => t.quantDraws), rates.quantitative);
  rateRow('Preference draw (species with ≥ 2 foods)', pool((t) => t.prefEligible), pool((t) => t.prefDraws), rates.preference);
  rateRow('Module draw (gain or loss)', D, pool((t) => t.moduleDraws), rates.module);
  rateRow('Gain attempt', D, pool((t) => t.gainAttempts), rates.module / 2);
  rateRow('Gain committed', D, pool((t) => t.gains), null);
  rateRow('Loss attempt', D, pool((t) => t.lossAttempts), rates.module / 2);
  rateRow('Loss committed', D, pool((t) => t.losses), null);
  out.push('');
  const spIds = [...new Set(cps.flatMap((c) => Object.keys(c.inheritance.bySpecies)))].sort();
  out.push(
    `By species (pooled): ${spIds
      .map((id) => {
        const d = cps.reduce((a, c) => a + (c.inheritance.bySpecies[id]?.daughters ?? 0), 0);
        const ga = cps.reduce((a, c) => a + (c.inheritance.bySpecies[id]?.gainAttempts ?? 0), 0);
        const g = cps.reduce((a, c) => a + (c.inheritance.bySpecies[id]?.gains ?? 0), 0);
        return `${id} ${d} daughters, ${ga} gain attempts, ${g} gains`;
      })
      .join('; ')}.`,
  );
  out.push('');
}

/** Per-module trials, events and expected counts at one checkpoint (D06 §18 rare modules). */
function renderModuleRates(out: string[], rs: readonly SeedRun[], pick: Pick, T: number): void {
  const r0 = rs[0]!;
  const cps = rs.map(pick);
  const minutes = (rs.length * T) / 60;
  const modules = [
    ...new Set(
      cps.flatMap((c) => [
        ...Object.keys(c.inheritance.gainTrialsByModule),
        ...Object.keys(c.inheritance.lossTrialsByModule),
        ...Object.keys(c.inheritance.gainsByModule),
        ...Object.keys(c.inheritance.lossesByModule),
      ]),
    ),
  ].sort();
  out.push(`#### Per-module rates, pooled over ${rs.length} seeds (${T} s each)`);
  out.push('');
  out.push(
    "D06 §18: for rare modules, events per daughter trial as well as per minute. A daughter is a trial for a module's gain when its parent could legally gain that module (eligible species, a free slot, nothing excluding it); a gain draw picks uniformly among the parent's legal gains, so its chance for one module is the gain-attempt chance ÷ the parent's number of legal gains (three for a Sprinter with no module, one for a Sunbead). A daughter is a trial for a module's loss when its parent carried it. \"Expected\" sums those chances over the trials (95 % range: Poisson). Per simulated minute = count ÷ dish-minutes, observed (expected).",
  );
  out.push('');
  if (modules.length === 0) {
    out.push(`No daughter was a trial for any module by ${T} s.`);
    out.push('');
    return;
  }
  out.push(
    '| Module | Gain trials (by species) | Gains | Per gain trial | Expected gains (95 % range) | Gains per simulated minute (expected) | Loss trials (by species) | Losses | Per loss trial | Expected losses (95 % range) | Losses per simulated minute (expected) |',
  );
  out.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const m of modules) {
    const nested = (f: (t: InheritanceSnapshot) => Record<string, Tally>): Tally => {
      const bySp: Tally = {};
      for (const c of cps) for (const [sp, n] of Object.entries(f(c.inheritance)[m] ?? {})) inc(bySp, sp, n);
      return bySp;
    };
    const at = (f: (t: InheritanceSnapshot) => Tally) => cps.reduce((a, c) => a + (f(c.inheritance)[m] ?? 0), 0);
    const gT = nested((t) => t.gainTrialsByModule);
    const lT = nested((t) => t.lossTrialsByModule);
    const gains = at((t) => t.gainsByModule);
    const losses = at((t) => t.lossesByModule);
    const eG = at((t) => t.expectedGainsByModule);
    const eL = at((t) => t.expectedLossesByModule);
    const perMin = (n: number, e: number) => `${(n / minutes).toFixed(3)} (${(e / minutes).toFixed(3)})`;
    out.push(
      `| ${moduleLabel(r0, m)} | ${trialsText(gT)} | ${gains} | ${perTrialText(gains, sumTally(gT))} | ${expectedText(sumTally(gT), eG)} | ${perMin(gains, eG)} | ${trialsText(lT)} | ${losses} | ${perTrialText(losses, sumTally(lT))} | ${expectedText(sumTally(lT), eL)} | ${perMin(losses, eL)} |`,
    );
  }
  out.push('');
}

/** Waiting time for a gain attempt and for a committed gain, per seed, at the D06 checkpoint. */
function renderWaiting(out: string[], rs: readonly SeedRun[], T: number): void {
  const r0 = rs[0]!;
  const pGain = r0.rates.module / 2;
  out.push(`#### Waiting time for a module gain (${presetLabel(r0.preset)}; gain attempt ${pct(pGain)} per daughter)`);
  out.push('');
  out.push(
    "A gain attempt can fall on any daughter; it commits a gain only when the parent has a legal gain (a gain-eligible daughter). Computed from the preset chance and each dish's own daughters, not from the observed gains: the chance that no daughter drew a gain attempt (all daughters), the chance that no gain was committed (gain-eligible daughters), and the second by which the latter first fell to one half (the median wait for a committed gain at this dish's daughter production). The last two columns are what happened.",
  );
  out.push('');
  out.push(
    `| Seed | Daughters by ${T} s | Chance of no gain attempt by ${T} s | Gain-eligible daughters by ${T} s | Chance of no committed gain by ${T} s | Median wait for a committed gain (s) | First gain attempt | First gain |`,
  );
  out.push('|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    const inh = r.checkpoint.inheritance;
    const wait = medianWaitSecond(r.gainEligibleBySecond.slice(0, T + 1), pGain);
    out.push(
      `| ${r.seed} | ${inh.daughters} | ${pct(chanceOfNone(inh.daughters, pGain))} | ${inh.gainEligible} | ${pct(chanceOfNone(inh.gainEligible, pGain))} | ${wait === null ? `not reached by ${T} s` : wait} | ${tickCell(inh.firstGainAttemptTick, T)} | ${tickCell(inh.firstGainTick, T)} |`,
    );
  }
  out.push('');
}

/** Module carriers pooled over seeds at one checkpoint, and the Starch release outcomes. */
function renderCarriers(out: string[], rs: readonly SeedRun[], pick: Pick, T: number): void {
  const cps = rs.map(pick);
  out.push(`#### Module carriers, pooled over ${rs.length} seeds`);
  out.push('');
  out.push(
    `Carrier-seconds are carriers counted at the end of every simulated second up to ${T} s. "Extra room in use" = an E05 carrier with energy above its base cap (reserve fill band 1–3); "not active" = an E03 carrier preparing, resting or waking; "secreting" = an E01 carrier releasing enzyme. Energy columns compare living carriers at ${T} s with the same species' organisms that carry no module.`,
  );
  out.push('');
  const keys = [...new Set(cps.flatMap((c) => Object.keys(c.inheritance.carrierSeconds)))].sort();
  if (keys.length === 0) {
    out.push(`No organism carried a module on any seed by ${T} s.`);
    out.push('');
    return;
  }
  out.push(
    `| Module | Species | Carrier-seconds (seeds) | Extra room in use | Not active | Secreting | Carriers alive at ${T} s | Mean E carriers (mean cap) | Mean E same species, no module |`,
  );
  out.push('|---|---|---|---|---|---|---|---|---|');
  const pooled = (key: string) =>
    cps.map((c) => c.inheritance.carrierSeconds[key]).filter((x): x is CarrierSeconds => x !== undefined);
  for (const key of keys) {
    const [m, sp] = key.split(' ') as [string, string];
    const cs = pooled(key);
    const n = cs.reduce((a, x) => a + x.carrierSeconds, 0);
    const share = (f: (x: CarrierSeconds) => number) => {
      const k = cs.reduce((a, x) => a + f(x), 0);
      return n > 0 ? `${k} (${pct(k / n)})` : '—';
    };
    const states = cps.flatMap((c) => c.inheritance.carrierStates.filter((x) => x.module === m && x.species === sp));
    const alive = states.reduce((a, x) => a + x.alive, 0);
    const meanE = alive > 0 ? states.reduce((a, x) => a + x.meanE * x.alive, 0) / alive : 0;
    const meanCap = alive > 0 ? states.reduce((a, x) => a + x.meanCap * x.alive, 0) / alive : 0;
    const plainN = states.reduce((a, x) => a + x.plainAlive, 0);
    const plainE = plainN > 0 ? states.reduce((a, x) => a + x.plainMeanE * x.plainAlive, 0) / plainN : 0;
    out.push(
      `| ${m} | ${sp} | ${n} (${cs.length}) | ${m === 'E05' ? share((x) => x.reserveInUse) : '—'} | ${m === 'E03' ? share((x) => x.notActive) : '—'} | ${m === 'E01' ? share((x) => x.secreting) : '—'} | ${alive} (${states.length} seeds) | ${alive > 0 ? `${f1(meanE)} (${f1(meanCap)})` : '—'} | ${plainN > 0 ? `${f1(plainE)} (${plainN} organisms)` : '—'} |`,
    );
  }
  out.push('');
  const e01 = keys.filter((k) => k.startsWith('E01 '));
  if (e01.length === 0) return;
  out.push(
    `Starch release (E01) carriers, every carrier-second to ${T} s. The secretion stage checks energy before substrate (src/sim/structures.ts), so a recorded outcome names only the first condition that failed; the last three columns measure both conditions directly at the end of each second: deposited starch in or beside the carrier's cell (the stage's own substrate test) and energy at or below the carrier's recorded release threshold.`,
  );
  out.push('');
  out.push(
    '| Species | Carrier-seconds (seeds) | Recorded outcome (share) | Starch in or beside its cell | Energy at or below the release threshold | Both: low energy and no starch within reach |',
  );
  out.push('|---|---|---|---|---|---|');
  for (const key of e01) {
    const sp = key.split(' ')[1]!;
    const cs = pooled(key);
    const n = cs.reduce((a, x) => a + x.carrierSeconds, 0);
    const outcomes: Tally = {};
    for (const x of cs) for (const [k, v] of Object.entries(x.outcomes)) inc(outcomes, k, v);
    const share = (f: (x: CarrierSeconds) => number) => {
      const k = cs.reduce((a, x) => a + f(x), 0);
      return n > 0 ? `${k} (${pct(k / n)})` : '—';
    };
    out.push(
      `| ${sp} | ${n} (${cs.length}) | ${tallyText(outcomes)} | ${share((x) => x.starchWithinReach)} | ${share((x) => x.energyAtOrBelowThreshold)} | ${share((x) => x.bothBlocked)} |`,
    );
  }
  out.push('');
}

/** Every confirmed branch of every seed, at the D06 checkpoint. */
function renderBranchList(out: string[], rs: readonly SeedRun[], T: number): void {
  out.push(`### Branch confirmations by ${T} s`);
  out.push('');
  out.push(
    'A candidate is confirmed as a branch when at least 5 qualifying members are alive and one lives at least 3 generations beyond its root (SPEC §8.5); a single mutation is never a branch. The name is the generated name a player sees. "Alive" counts own members, then members including branches descended from it.',
  );
  out.push('');
  const anyBranch = rs.some((r) => r.checkpoint.inheritance.branches.length > 0);
  if (!anyBranch) {
    out.push(`No branch was confirmed on any seed by ${T} s.`);
  } else {
    out.push(
      `| Seed | Branch | Difference from its ancestor | Variation observed at | Confirmed at | Members at confirmation (generations) | Alive at ${T} s (with sub-branches) | Peak | Extinct at |`,
    );
    out.push('|---|---|---|---|---|---|---|---|---|');
    for (const r of rs) {
      for (const b of r.checkpoint.inheritance.branches) {
        out.push(
          `| ${r.seed} | ${b.name} | ${b.trait} | ${f1(b.candidateTick / TICKS_PER_SECOND)} s | ${f1(b.establishedTick / TICKS_PER_SECOND)} s | ${b.membersAtEstablish ?? '?'} (${b.depthAtEstablish ?? '?'}) | ${b.alive} (${b.subtreeAlive}) | ${b.peak ?? '?'} | ${b.extinctTick === null ? '—' : `${f1(b.extinctTick / TICKS_PER_SECOND)} s`} |`,
        );
      }
    }
  }
  out.push('');
}

/** Living count per species every 60 s, over (from, to]. */
function renderCountSeries(out: string[], rs: readonly SeedRun[], species: readonly string[], from: number, to: number, title: string): void {
  out.push(title);
  out.push('');
  const seconds = [
    ...new Set(rs.flatMap((r) => r.countSeries.map((s) => s.second).filter((s) => s > from && s <= to))),
  ].sort((a, b) => a - b);
  out.push(`| Seed | ${seconds.map((s) => `${s} s`).join(' | ')} |`);
  out.push(`|---|${seconds.map(() => '---').join('|')}|`);
  for (const r of rs) {
    const cells = seconds.map((s) => {
      const row = r.countSeries.find((x) => x.second === s);
      return row ? species.map((id) => row.counts[id] ?? 0).join('/') : '';
    });
    out.push(`| ${r.seed} | ${cells.join(' | ')} |`);
  }
  out.push('');
}

/** One recipe at one preset over the seeds, at the D06 checkpoint. */
function renderGroup(out: string[], rs: readonly SeedRun[], meta: ReportMeta): void {
  const T = meta.seconds;
  const r0 = rs[0]!;
  const species = foundingSpecies(r0);
  const spHead = species.join(' / ');
  const rates = r0.rates;
  out.push(`## ${r0.recipe} · ${presetLabel(r0.preset)} (revision ${r0.recipeRevision ?? '?'})`);
  out.push('');
  out.push(
    `Founders: ${species.map((id) => `${r0.founders[id]} ${id}`).join(', ')}. Initial food (sum over dish cells, C): sugar ${f2(r0.initialFood.sugar)}, starch ${f2(r0.initialFood.starch)}, detritus ${f2(r0.initialFood.detritus)}. Per-daughter chances at this preset: quantitative ${pct(rates.quantitative)}, preference ${pct(rates.preference)}, module ${pct(rates.module)} (gain attempt ${pct(rates.module / 2)}), developmental ${pct(rates.developmental)}.`,
  );
  out.push('');

  // Table 1 — pacing
  out.push(`### Pacing at the ${T} s checkpoint`);
  out.push('');
  out.push(
    `| Seed | First intake (any) | First intake ${spHead} | First division (any) | First division ${spHead} | Intake < ${TARGET_INTAKE_SECONDS} s | Division < ${TARGET_DIVISION_SECONDS} s |`,
  );
  out.push('|---|---|---|---|---|---|---|');
  for (const r of rs) {
    const cp = r.checkpoint;
    const intakeSp = species.map((id) => tickCell(cp.firstIntakeBySpecies[id] ?? null, T)).join(' / ');
    const divSp = species.map((id) => tickCell(cp.firstDivisionBySpecies[id] ?? null, T)).join(' / ');
    const okI = withinTarget(cp.firstIntakeTick, TARGET_INTAKE_SECONDS, T);
    const okD = withinTarget(cp.firstDivisionTick, TARGET_DIVISION_SECONDS, T);
    out.push(
      `| ${r.seed} | ${tickCell(cp.firstIntakeTick, T)} | ${intakeSp} | ${tickCell(cp.firstDivisionTick, T)} | ${divSp} | ${okI} | ${okD} |`,
    );
  }
  out.push('');

  // Table 2 — population
  out.push(`### Population at the ${T} s checkpoint`);
  out.push('');
  out.push(
    `| Seed | Divisions (births) ${spHead} | Deaths ${spHead} | Deaths by cause (lineage) | Cause coverage | Alive ${spHead} | Biomass ${spHead} | Peak ${spHead} (at s) | Extinct (s) |`,
  );
  out.push('|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    const cp = r.checkpoint;
    const cov = cp.deathCauseCoverage;
    const extinct = cp.extinct
      .filter((id) => species.includes(id))
      .map((id) => `${id}${cp.extinctionSecond[id] !== undefined ? ` (${cp.extinctionSecond[id]})` : ''}`);
    out.push(
      `| ${r.seed} | ${cp.births}: ${species.map((id) => cp.birthsBySpecies[id] ?? 0).join(' / ')} | ${cp.deaths}: ${species.map((id) => cp.deathsBySpecies[id] ?? 0).join(' / ')} | ${tallyText(cp.deathsByCause)} | ${cov.tallied}/${cov.total}${cov.compactedRecords > 0 ? ` (${cov.compactedRecords} records compacted)` : ''} | ${species.map((id) => cp.counts[id] ?? 0).join(' / ')} | ${species.map((id) => f1(cp.biomass[id] ?? 0)).join(' / ')} | ${species.map((id) => `${cp.peak[id]?.count ?? 0} (${cp.peak[id]?.second ?? 0})`).join(' / ')} | ${extinct.length > 0 ? extinct.join(', ') : 'none'} |`,
    );
  }
  out.push('');

  // Table 3 — food and inheritance
  out.push(`### Food and inherited variation at the ${T} s checkpoint`);
  out.push('');
  out.push(
    '| Seed | Sugar | Starch | Detritus | Food total | Starch converted | C from air (net) | Free nutrient | O2 mean | Mutation events | Kinds (quant / neutral draws / pref / module gain / module loss) | First mutation | Candidates (emitted / live) | Established (alive) |',
  );
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    const cp = r.checkpoint;
    const k = cp.mutationKinds;
    out.push(
      `| ${r.seed} | ${f2(cp.food.sugar)} | ${f2(cp.food.starch)} | ${f2(cp.food.detritus)} | ${f2(cp.food.total)} | ${f2(cp.starchConverted)} | ${f1(cp.carbonFromAir)} | ${f2(cp.nutrientFree)} | ${cp.oxygenMean.toFixed(3)} | ${cp.mutations} | ${k.quantitative} / ${k.neutralDraws} / ${k.preference} / ${k.moduleGain} / ${k.moduleLoss} | ${tickCell(cp.firstMutationTick, T)} | ${cp.branchCandidateEvents} / ${cp.branchCandidatesLive} | ${cp.branchesEstablished} (${cp.branchesAlive}) |`,
    );
  }
  out.push('');

  // Table 4 — module draws per daughter trial
  out.push(`### Module draws per daughter trial at the ${T} s checkpoint`);
  out.push('');
  out.push(
    'Each division commits two daughters; each daughter is one trial of every draw. A module draw picks gain or loss with equal chance, then a legal option; with no legal option nothing changes (for example a loss drawn by an organism that carries no module). "Carriers alive" counts living organisms carrying each module; "gains with a living carrier" counts committed gains that still have at least one living descendant carrying the module.',
  );
  out.push('');
  out.push(
    '| Seed | Daughters (trials) | Module draws: gain / loss | Gains (module) | Gain draws with no legal option | Losses | Loss draws with nothing to lose | Gains by species | Carriers alive (module: species) | Gains with a living carrier | First gain | Draws reproduced | Mismatches |',
  );
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    const inh = r.checkpoint.inheritance;
    const gainsBySp: Tally = {};
    for (const [id, s] of Object.entries(inh.bySpecies)) if (s.gains > 0) gainsBySp[id] = s.gains;
    const carriers = Object.keys(inh.carriersByModule)
      .sort()
      .map((m) => `${m}: ${countsText(inh.carriersByModule[m]!)}`)
      .join('; ');
    out.push(
      `| ${r.seed} | ${inh.daughters} | ${inh.gainAttempts} / ${inh.lossAttempts} | ${inh.gains}${inh.gains > 0 ? ` (${countsText(inh.gainsByModule)})` : ''} | ${inh.gainNoOption} | ${inh.losses}${inh.losses > 0 ? ` (${countsText(inh.lossesByModule)})` : ''} | ${inh.lossNoOption} | ${countsText(gainsBySp)} | ${carriers || 'none'} | ${gainsWithCarrier(r.checkpoint)}/${inh.gains} | ${tickCell(inh.firstGainTick, T)} | ${inh.drawsMatched}/${inh.drawsChecked}${inh.unknown > 0 ? ` (${inh.unknown} not checkable)` : ''} | ${inh.mismatches} |`,
    );
  }
  out.push('');

  renderRates(out, rs, atCheckpoint, T);
  renderModuleRates(out, rs, atCheckpoint, T);
  renderWaiting(out, rs, T);
  renderCarriers(out, rs, atCheckpoint, T);
  renderBranchList(out, rs, T);

  // Table 5 — integrity and speed
  out.push('### Integrity and speed');
  out.push('');
  out.push(
    `| Seed | Stopped at | Extended | Wall ms/tick mean (p95) | Effective speed | Ledger relErr C / N (${T} s) | Ledger ok | Hash at ${T} s | Endpoint hash (extended runs) | Plain run (no observer) |`,
  );
  out.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    const cp = r.checkpoint;
    const fin = r.final;
    out.push(
      `| ${r.seed} | ${fin.seconds} s | ${r.extended ? `yes (no mutation by ${T} s)` : 'no'} | ${fin.wall.meanMs.toFixed(3)} (${fin.wall.p95Ms.toFixed(3)}) | ${f1(fin.wall.effectiveSpeed)}× | ${sci(cp.ledger.relErrC)} / ${sci(cp.ledger.relErrN)} | ${cp.ledger.ok && fin.ledger.ok ? 'yes' : 'NO'} | \`${cp.hash}\` | ${r.extended ? `\`${fin.hash}\`` : `— (not extended: the ${T} s checkpoint is the endpoint)`} | ${plainCell(r, r.extended ? [cp, fin] : [cp])} |`,
    );
  }
  out.push('');
  out.push(
    'Effective speed = 0.1 s of simulated time ÷ mean wall time per tick (how many times faster than real time this machine could step the dish, with no rendering). "Plain run" re-runs the seed with no observer and no hooks (realizeRecipe, then step) and compares its state hash with this run\'s: equal hashes show the tuner only observed.',
  );
  out.push('');

  const ext = rs.filter((r) => r.extended);
  if (ext.length > 0) {
    out.push(`### Extended runs (to ${meta.extendSeconds} s)`);
    out.push('');
    out.push(
      '| Seed | First division (any) | Divisions | Deaths | Alive ' +
        spHead +
        ' | Mutation events | Gains | Candidates | Established | Food total | Extinct |',
    );
    out.push('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of ext) {
      const f = r.final;
      out.push(
        `| ${r.seed} | ${tickCell(f.firstDivisionTick, f.seconds)} | ${f.births} | ${f.deaths} | ${species.map((id) => f.counts[id] ?? 0).join(' / ')} | ${f.mutations} | ${f.inheritance.gains} | ${f.branchCandidateEvents} | ${f.branchesEstablished} | ${f2(f.food.total)} | ${f.extinct.filter((id) => species.includes(id)).join(', ') || 'none'} |`,
      );
    }
    out.push('');
  }

  // Summary statistics
  const cps = rs.map(atCheckpoint);
  out.push(`### Summary over ${rs.length} seeds (censored at ${T} s)`);
  out.push('');
  out.push('| Milestone | Events | Median | Range (observed) | No event by the stopping time |');
  out.push('|---|---|---|---|---|');
  const line = (label: string, ticks: (number | null)[]) =>
    out.push(statsLine(label, censoredStats(ticks.map(sec), T), T));
  line('First intake (any species)', cps.map((c) => c.firstIntakeTick));
  for (const id of species) line(`First intake ${id}`, cps.map((c) => c.firstIntakeBySpecies[id] ?? null));
  line('First division (any species)', cps.map((c) => c.firstDivisionTick));
  for (const id of species) line(`First division ${id}`, cps.map((c) => c.firstDivisionBySpecies[id] ?? null));
  line('First inherited difference (mutation)', cps.map((c) => c.firstMutationTick));
  line('First gain attempt (committed daughter)', cps.map((c) => c.inheritance.firstGainAttemptTick));
  line('First module gain (committed)', cps.map((c) => c.inheritance.firstGainTick));
  for (const m of Object.keys(r0.moduleNames).sort())
    line(`First ${moduleLabel(r0, m)} gain`, cps.map((c) => firstGainOf(c, m)));
  line('First branch candidate (variation observed)', cps.map((c) => c.inheritance.firstCandidateTick));
  line('First branch confirmation', cps.map((c) => c.inheritance.firstBranchTick));
  line('First module-branch confirmation', cps.map((c) => c.inheritance.firstModuleBranchTick));
  out.push('');
  const intakeW = cps.map((c) => withinTarget(c.firstIntakeTick, TARGET_INTAKE_SECONDS, T));
  const divW = cps.map((c) => withinTarget(c.firstDivisionTick, TARGET_DIVISION_SECONDS, T));
  const intakeOk = intakeW.filter((w) => w === 'yes').length;
  const divOk = divW.filter((w) => w === 'yes').length;
  const bothOk = cps.filter((_, k) => intakeW[k] === 'yes' && divW[k] === 'yes').length;
  const unknown = cps.filter((_, k) => intakeW[k] === 'unknown' || divW[k] === 'unknown').length;
  const b01Div = species.includes('B01')
    ? cps.filter(
        (c) => withinTarget(c.firstDivisionBySpecies.B01 ?? null, TARGET_DIVISION_SECONDS, T) === 'yes',
      ).length
    : null;
  const noVariation = rs.filter((r) => r.final.mutations === 0).length;
  out.push(
    `**D06 targets** (≥ ${TARGET_SEEDS_REQUIRED} of the 6 development seeds; targets to check, not to force):`,
  );
  out.push('');
  const unk = (w: readonly string[]) => {
    const u = w.filter((x) => x === 'unknown').length;
    return u > 0 ? ` (${u} unknown: stopped before the window closed)` : '';
  };
  out.push(`- Intake within ${TARGET_INTAKE_SECONDS} s: **${intakeOk}/${rs.length}**${unk(intakeW)}.`);
  out.push(`- First division within ${TARGET_DIVISION_SECONDS} s: **${divOk}/${rs.length}**${unk(divW)}.`);
  const devSet = rs.length === DEV_SEEDS.length && DEV_SEEDS.every((d) => rs.some((r) => r.seed === d));
  const verdict = !devSet
    ? 'not assessable: the verdict is defined only for the 6 development seeds'
    : bothOk >= TARGET_SEEDS_REQUIRED
      ? 'met'
      : bothOk + unknown < TARGET_SEEDS_REQUIRED
        ? 'NOT met'
        : `not assessable: ${unknown} seed(s) stopped before a target window closed`;
  out.push(`- Both: **${bothOk}/${rs.length}** — target ${verdict}.`);
  if (b01Div !== null)
    out.push(
      `- (Supplementary) a Sprinter (B01) division within ${TARGET_DIVISION_SECONDS} s: ${b01Div}/${rs.length}.`,
    );
  out.push(`- Seeds with no inherited difference by their stopping time: ${noVariation}/${rs.length}.`);
  out.push(
    `- Seeds with no committed module gain by ${T} s: ${cps.filter((c) => c.inheritance.firstGainTick === null).length}/${rs.length}; with no confirmed branch: ${cps.filter((c) => c.inheritance.firstBranchTick === null).length}/${rs.length}; with no confirmed module branch: ${cps.filter((c) => c.inheritance.firstModuleBranchTick === null).length}/${rs.length}.`,
  );
  out.push('');

  // Count series, to each run's D06 endpoint (a supplementary horizon has its own table).
  renderCountSeries(
    out,
    rs.map((r) => ({ ...r, countSeries: r.countSeries.filter((s) => s.second <= r.final.seconds) })),
    species,
    0,
    Infinity,
    '### Living count every 60 s (' + spHead + ')',
  );

  // Death causes pooled per species
  out.push(`### Deaths by species and cause, pooled over seeds (${T} s checkpoint, lineage tally)`);
  out.push('');
  out.push('| Species | Deaths | Causes |');
  out.push('|---|---|---|');
  for (const id of species) {
    const pooled: Tally = {};
    for (const c of cps)
      for (const [k, v] of Object.entries(c.deathsBySpeciesCause[id] ?? {})) inc(pooled, k, v);
    const n = Object.values(pooled).reduce((a, b) => a + b, 0);
    out.push(`| ${id} | ${n} | ${tallyText(pooled)} |`);
  }
  out.push('');

  // Recipe patches: carbon left in each patch disk
  const patchLabels = r0.initialPatches.map((p) => p.label);
  if (patchLabels.length > 0) {
    out.push('### Carbon left in each recipe patch (mean over seeds, min–max)');
    out.push('');
    out.push(
      'Sum over the patch disk of the carbon fields that patch added. It includes carbon arriving later (diffusion, exudate, dead bodies), so it can rise.',
    );
    out.push('');
    out.push(`| t (s) | ${patchLabels.join(' | ')} |`);
    out.push(`|---|${patchLabels.map(() => '---').join('|')}|`);
    out.push(`| 0 | ${r0.initialPatches.map((p) => f2(p.carbon)).join(' | ')} |`);
    const times = [...new Set(rs.flatMap((r) => r.samples.map((s) => s.second)))].sort((a, b) => a - b);
    for (const t of times) {
      const cells = patchLabels.map((_, j) => {
        const vals = rs.flatMap((r) => {
          const smp = r.samples.find((x) => x.second === t);
          return smp ? [smp.patches[j]!.carbon] : [];
        });
        if (vals.length === 0) return '';
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        return `${f2(mean)} (${f2(Math.min(...vals))}–${f2(Math.max(...vals))})`;
      });
      out.push(`| ${t} | ${cells.join(' | ')} |`);
    }
    out.push('');
  }

  // Reason samples pooled
  out.push('### Recorded reasons of living organisms, pooled over seeds');
  out.push('');
  out.push(
    "Sampled at the end of the listed ticks. `limit` = leading intake constraint (limitCode), `division` = first failing division gate or placement block (divBlockCode), `secretion` = starch-enzyme outcome (secretionCode) of every organism with producer rules, native or gained through E01 (a producer that is preparing, resting or waking is counted under its state reason). Means are per organism; cell values are the free field in the organism's cell.",
  );
  out.push('');
  out.push(
    '| t (s) | Species | Alive (seeds) | Mean position | Mean E | Mean B/b0 | Mean H | Stressed | Intake C/s | Cell nutrient | Cell O2 | Cell sugar | limit (share, mean value) | division | secretion |',
  );
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const sampleSeconds = [...new Set(rs.flatMap((r) => r.samples.map((s) => s.second)))].sort(
    (a, b) => a - b,
  );
  for (const t of sampleSeconds) {
    for (const id of species) {
      let alive = 0;
      let seedsWith = 0;
      let e = 0;
      let b = 0;
      let h = 0;
      let st = 0;
      let cn = 0;
      let co = 0;
      let cs = 0;
      let ci = 0;
      let px = 0;
      let py = 0;
      const limit: Tally = {};
      const limitV: Tally = {};
      const div: Tally = {};
      const secr: Tally = {};
      let seedsSampled = 0;
      for (const r of rs) {
        const s = r.samples.find((x) => x.second === t);
        if (!s) continue;
        seedsSampled++;
        const sp = s.species[id];
        if (!sp) continue;
        seedsWith++;
        alive += sp.alive;
        e += sp.meanE * sp.alive;
        b += sp.meanBOverB0 * sp.alive;
        h += sp.meanH * sp.alive;
        st += sp.stressedFraction * sp.alive;
        cn += sp.meanCellNutrient * sp.alive;
        co += sp.meanCellOxygen * sp.alive;
        cs += sp.meanCellSugar * sp.alive;
        ci += sp.meanIntakePerSecond * sp.alive;
        px += sp.meanX * sp.alive;
        py += sp.meanY * sp.alive;
        for (const [k, v] of Object.entries(sp.limit)) inc(limit, k, v);
        for (const [k, v] of Object.entries(sp.limitValueSum)) inc(limitV, k, v);
        for (const [k, v] of Object.entries(sp.divBlock)) inc(div, k, v);
        for (const [k, v] of Object.entries(sp.secretion)) inc(secr, k, v);
      }
      if (alive === 0) {
        out.push(`| ${t} | ${id} | 0 (0/${seedsSampled}) | | | | | | | | | | | | |`);
        continue;
      }
      out.push(
        `| ${t} | ${id} | ${alive} (${seedsWith}/${seedsSampled}) | (${f1(px / alive)}, ${f1(py / alive)}) | ${f1(e / alive)} | ${f2(b / alive)} | ${f1(h / alive)} | ${Math.round((100 * st) / alive)}% | ${(ci / alive).toFixed(4)} | ${(cn / alive).toFixed(3)} | ${(co / alive).toFixed(3)} | ${(cs / alive).toFixed(3)} | ${limitText(limit, limitV)} | ${tallyText(div)} | ${Object.keys(secr).length > 0 ? tallyText(secr) : '—'} |`,
      );
    }
  }
  out.push('');
}

/** One recipe at one preset over the seeds, at the supplementary horizon (not the D06 rule). */
function renderHorizon(out: string[], rs: readonly SeedRun[], T: number): void {
  const r0 = rs[0]!;
  const H = r0.horizon!.seconds;
  const species = foundingSpecies(r0);
  const spHead = species.join(' / ');
  out.push(
    `## ${r0.recipe} · ${presetLabel(r0.preset)} — supplementary horizon, ${H} s (revision ${r0.recipeRevision ?? '?'})`,
  );
  out.push('');
  out.push(
    `Not the D06 stopping rule (the tables above are the D06 report): the same runs continue past their D06 endpoint to ${H} s with no interventions. The D06 checkpoints were taken before this point and are unchanged by it. Counts, rates and carrier-seconds are cumulative from 0 s.`,
  );
  out.push('');
  out.push(`### Per seed at ${H} s`);
  out.push('');
  out.push(
    `| Seed | Divisions | Deaths (by cause, lineage) | Alive ${spHead} | Agents | Food total (C) | Daughters | Mutation events | Gains (module) | Losses (module) | Module carriers alive | Branches confirmed (module / quantitative / policy / food weight) | First branch | First module branch | Extinct (s) | Hash at ${H} s | Plain run (no observer) |`,
  );
  out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    const h = r.horizon!;
    const inh = h.inheritance;
    const cov = h.deathCauseCoverage;
    const kinds = (['module', 'locus', 'policy', 'weight'] as const)
      .map((k) => inh.branches.filter((b) => b.traitKind === k).length)
      .join(' / ');
    const extinct = h.extinct
      .filter((id) => species.includes(id))
      .map((id) => `${id}${h.extinctionSecond[id] !== undefined ? ` (${h.extinctionSecond[id]})` : ''}`);
    out.push(
      `| ${r.seed} | ${h.births} | ${h.deaths}: ${tallyText(h.deathsByCause)}${cov.tallied !== cov.total ? ` (${cov.tallied}/${cov.total} tallied; ${cov.compactedRecords} records compacted)` : ''} | ${species.map((id) => h.counts[id] ?? 0).join(' / ')} | ${sumTally(h.counts)} | ${f2(h.food.total)} | ${inh.daughters} | ${h.mutations} | ${inh.gains}${inh.gains > 0 ? ` (${countsText(inh.gainsByModule)})` : ''} | ${inh.losses}${inh.losses > 0 ? ` (${countsText(inh.lossesByModule)})` : ''} | ${carriersAlive(h)} | ${inh.branches.length}: ${kinds} (${h.branchesAlive} alive) | ${tickCell(inh.firstBranchTick, H)} | ${tickCell(inh.firstModuleBranchTick, H)} | ${extinct.length > 0 ? extinct.join(', ') : 'none'} | \`${h.hash}\` | ${plainCell(r, [h])} |`,
    );
  }
  out.push('');
  out.push(
    `Draws reproduced by ${H} s: ${rs.map((r) => `${r.horizon!.inheritance.drawsMatched}/${r.horizon!.inheritance.drawsChecked}`).join(', ')} (seeds in order); mismatches ${rs.reduce((a, r) => a + r.horizon!.inheritance.mismatches, 0)}; daughters whose draw could not be recomputed ${rs.reduce((a, r) => a + r.horizon!.inheritance.unknown, 0)}; ledger ok at ${H} s on ${rs.filter((r) => r.horizon!.ledger.ok).length}/${rs.length} seeds (max relErr C ${sci(Math.max(...rs.map((r) => r.horizon!.ledger.relErrC)))}, N ${sci(Math.max(...rs.map((r) => r.horizon!.ledger.relErrN)))}).`,
  );
  out.push('');
  renderCountSeries(out, rs, species, T, H, `### Living count every 60 s after ${T} s (${spHead})`);
  renderRates(out, rs, atHorizon, H);
  renderModuleRates(out, rs, atHorizon, H);
  renderCarriers(out, rs, atHorizon, H);

  // Branches pooled by generated name (without the short ID)
  out.push(`### Branch confirmations by ${H} s, pooled by generated name`);
  out.push('');
  out.push(
    'Species · descriptor of every confirmed branch (the short ID left out), how many were confirmed, in how many dishes, and how many had no living member (nor sub-branch) at the horizon.',
  );
  out.push('');
  const byName: Record<string, { kind: string; n: number; seeds: number[]; extinct: number }> = {};
  for (const r of rs)
    for (const b of r.horizon!.inheritance.branches) {
      const name = b.name.split(' · ').slice(0, 2).join(' · ');
      const e = (byName[name] ??= { kind: b.traitKind, n: 0, seeds: [], extinct: 0 });
      e.n++;
      if (!e.seeds.includes(r.seed)) e.seeds.push(r.seed);
      if (b.subtreeAlive === 0) e.extinct++;
    }
  const names = Object.keys(byName).sort((a, b) => byName[b]!.n - byName[a]!.n || (a < b ? -1 : 1));
  if (names.length === 0) out.push(`No branch was confirmed on any seed by ${H} s.`);
  else {
    out.push(`| Name (species · descriptor) | Difference kind | Confirmed | Dishes | Extinct at ${H} s |`);
    out.push('|---|---|---|---|---|');
    for (const name of names) {
      const e = byName[name]!;
      out.push(`| ${name} | ${e.kind} | ${e.n} | ${e.seeds.length} | ${e.extinct} |`);
    }
  }
  out.push('');

  const cps = rs.map(atHorizon);
  out.push(`### Summary over ${rs.length} seeds (censored at ${H} s)`);
  out.push('');
  out.push('| Milestone | Events | Median | Range (observed) | No event by the stopping time |');
  out.push('|---|---|---|---|---|');
  const line = (label: string, ticks: (number | null)[]) =>
    out.push(statsLine(label, censoredStats(ticks.map(sec), H), H));
  line('First module gain (committed)', cps.map((c) => c.inheritance.firstGainTick));
  for (const m of Object.keys(r0.moduleNames).sort())
    line(`First ${moduleLabel(r0, m)} gain`, cps.map((c) => firstGainOf(c, m)));
  line('First branch confirmation', cps.map((c) => c.inheritance.firstBranchTick));
  line('First module-branch confirmation', cps.map((c) => c.inheritance.firstModuleBranchTick));
  out.push('');
}

/** Presets side by side for one recipe at one checkpoint (only when more than one preset was run). */
function renderComparison(
  out: string[],
  groups: readonly (readonly SeedRun[])[],
  pick: Pick,
  T: number,
  title: string,
): void {
  const recipe = groups[0]![0]!.recipe;
  out.push(`## ${recipe}: ${groups.map((g) => presetLabel(g[0]!.preset)).join(' and ')} side by side (${title})`);
  out.push('');
  out.push(
    'Median over seeds (range). Milestone medians rank seeds with no event above every observed value and are never an event at the stopping time.',
  );
  out.push('');
  out.push(`| Measure | ${groups.map((g) => `${presetLabel(g[0]!.preset)} (${g.length} seeds)`).join(' | ')} |`);
  out.push(`|---|${groups.map(() => '---').join('|')}|`);
  const row = (label: string, f: (cp: Checkpoint) => number, digits = 0) =>
    out.push(`| ${label} | ${groups.map((g) => medianRange(g.map((r) => f(pick(r))), digits)).join(' | ')} |`);
  const seeds = (label: string, f: (cp: Checkpoint) => boolean) =>
    out.push(`| ${label} | ${groups.map((g) => `${g.filter((r) => f(pick(r))).length}/${g.length}`).join(' | ')} |`);
  const milestone = (label: string, f: (cp: Checkpoint) => number | null) =>
    out.push(
      `| ${label} | ${groups
        .map((g) => {
          const s = censoredStats(g.map((r) => sec(f(pick(r)))), T);
          const range = s.min === null ? 'no event' : `observed ${f1(s.min)}–${f1(s.max!)} s`;
          return `${medianText(s)}; ${range}; ${s.censored}/${s.n} none by ${T} s`;
        })
        .join(' | ')} |`,
    );
  row('Divisions', (c) => c.births);
  row('Deaths', (c) => c.deaths);
  row('Alive (all species)', (c) => sumTally(c.counts));
  row('Biomass (all species)', (c) => sumTally(c.biomass), 1);
  row('Food total (C)', (c) => c.food.total, 1);
  row('Mutation events (daughters with a changed genome)', (c) => c.mutations);
  row('Daughter trials', (c) => c.inheritance.daughters);
  row('Module draws (gain or loss)', (c) => c.inheritance.moduleDraws);
  row('Gain attempts', (c) => c.inheritance.gainAttempts);
  row('Gains committed', (c) => c.inheritance.gains);
  row('Losses committed', (c) => c.inheritance.losses);
  row('Module carriers alive', carriersAlive);
  row('Gains with a living carrier', gainsWithCarrier);
  row('Branch candidates emitted', (c) => c.branchCandidateEvents);
  row('Branches confirmed', (c) => confirmed(c));
  row('Module branches confirmed', (c) => confirmed(c, 'module'));
  seeds('Seeds with at least one committed gain', (c) => c.inheritance.gains > 0);
  seeds('Seeds with a living module carrier', (c) => carriersAlive(c) > 0);
  seeds('Seeds with a confirmed branch', (c) => confirmed(c) > 0);
  seeds('Seeds with a confirmed module branch', (c) => confirmed(c, 'module') > 0);
  milestone('First division', (c) => c.firstDivisionTick);
  milestone('First inherited difference', (c) => c.firstMutationTick);
  milestone('First module gain', (c) => c.inheritance.firstGainTick);
  milestone('First branch confirmation', (c) => c.inheritance.firstBranchTick);
  milestone('First module-branch confirmation', (c) => c.inheritance.firstModuleBranchTick);
  row('Effective speed (×, headless)', (c) => c.wall.effectiveSpeed, 1);
  out.push('');
}

export function renderReport(runs: readonly SeedRun[], meta: ReportMeta, analysis: string | null): string {
  const out: string[] = [];
  const recipes = [...new Set(runs.map((r) => r.recipe))];
  const presets = PRESETS.filter((p) => runs.some((r) => r.preset === p));
  const T = meta.seconds;
  out.push(`# Development-seed tuning report — ${recipes.join(', ')} (${presets.join(', ')})`);
  out.push('');
  out.push(
    `Generated by \`${meta.command}\` (tools/sim-tune.ts, tasks P1.12 and P2.9; CONTENT_TABLES §11; D06 §18).`,
  );
  out.push('');
  const r0 = runs[0];
  if (r0) {
    const v = r0.rules;
    out.push(
      `- Content hash \`${r0.contentHash}\`; rule versions (content/manifest.json): simulation ${v.simulation}, evolution rules ${v.evolutionRules}, module registry ${v.moduleRegistry}, phenotype mapping ${v.phenotypeMapping}, content ${v.content}; world schema ${v.worldSchema}. Mutation preset${presets.length > 1 ? 's' : ''} **${presets.join('**, **')}**, no interventions.`,
    );
  }
  if (meta.build) out.push(buildLine(meta.build));
  out.push(
    `- Stopping rule: run to ${T} s; if no inherited difference (zero mutation events) by then, continue to ${meta.extendSeconds} s, keeping the ${T} s checkpoint.`,
  );
  const H = meta.horizonSeconds ?? 0;
  if (H > 0)
    out.push(
      `- Supplementary horizon (not the D06 rule): every seed also continues to ${H} s after its D06 endpoint, reported in the "supplementary horizon" sections; the D06 tables are taken before it and are unchanged by it.`,
    );
  if (meta.plainCheck)
    out.push(
      '- Plain-run check: every seed was run a second time with no observer and no hooks (realizeRecipe, then step) and its state hash compared with this run\'s at every checkpoint ("Plain run" columns).',
    );
  out.push(
    `- Machine: ${meta.machine}. Generated ${meta.generatedAt}. Total wall time ${f1(meta.wallSeconds)} s (headless Node, single thread; not the browser worker)${meta.loadAverage ? `; 1-min load average ${f2(meta.loadAverage[0])} at start, ${f2(meta.loadAverage[1])} at end` : ''}.`,
  );
  out.push(
    '- Time convention: a milestone at tick *t* happened while simulating tick *t* (seconds shown = t / 10). "Within 15 s" means t < 150; "within 120 s" means t < 1200.',
  );
  out.push(
    '- Censoring: "none by T s" means no event before the stopping time. It is never counted as an event at T. Medians rank censored seeds above every observed value; when the median rank lands on a censored seed only a lower bound is given.',
  );
  out.push(
    '- Deaths by cause are tallied from `world.lineage.deathCause` over retained birth records (the event ring keeps only the last 500 events). The coverage column compares that tally with the total death-event counter; they differ only if lineage records were compacted.',
  );
  out.push(
    '- First intake per species is observed read-only after stage 6 each tick from the feeding flag (set exactly when an organism took carbon that tick); the world milestone `firstIntake` covers any species, photosynthesis included.',
  );
  out.push(
    '- Daughter trials and module draws are observed after every tick from the new birth records (so lineage compaction cannot lose them). A module draw that finds no legal option changes nothing and leaves no trace in the genome, so each committed daughter\'s draw is recomputed from its recorded keys (seed, parent birth id, daughter index) with the simulation\'s pure `draftDaughter`, probing a module set with a legal gain and one with a legal loss. "Draws reproduced" re-drafts every daughter from its parent\'s recorded genome and compares the genome and mutation descriptor with the record; "mismatches" counts recorded module changes that disagree with the recomputed draw (both must be clean). D06 §9 calls a module draw that chose gain a *gain attempt*; module events are dated by the daughter\'s birth tick.',
  );
  out.push('');

  for (const recipe of recipes) {
    const groups = presets
      .map((p) => runs.filter((r) => r.recipe === recipe && r.preset === p))
      .filter((g) => g.length > 0);
    for (const g of groups) renderGroup(out, g, meta);
    if (groups.length > 1) renderComparison(out, groups, atCheckpoint, T, `${T} s checkpoint`);
    const withHorizon = groups.filter((g) => g.every((r) => r.horizon !== null));
    for (const g of withHorizon) renderHorizon(out, g, T);
    if (withHorizon.length > 1) {
      const h = withHorizon[0]![0]!.horizon!.seconds;
      renderComparison(out, withHorizon, atHorizon, h, `supplementary horizon, ${h} s`);
    }
  }

  // Written back byte-for-byte so regenerating the tables never alters the hand-written analysis.
  out.push(
    `${ANALYSIS_START}${analysis ?? '\n## Observations\n\n_Not written yet._\n\n## Proposed recipe revisions\n\n_Not written yet._\n'}${ANALYSIS_END}`,
  );
  out.push('');
  return out.join('\n');
}

export function extractAnalysis(text: string): string | null {
  const a = text.indexOf(ANALYSIS_START);
  const b = text.indexOf(ANALYSIS_END);
  if (a < 0 || b < a) return null;
  return text.slice(a + ANALYSIS_START.length, b);
}

// ---------------------------------------------------------------------------- CLI

export interface TuneArgs {
  recipes: string[];
  seeds: number[];
  seconds: number;
  extend: number;
  /** Supplementary horizon in seconds (0: none). */
  horizon: number;
  /** Re-run every seed with no observer and compare the state hashes at every checkpoint. */
  plainCheck: boolean;
  presets: Preset[];
  out: string | null;
}

/** Command-line options; `--presets standard,accelerated` runs both presets into one report. */
export function parseTuneArgs(argv: readonly string[]): TuneArgs {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const recipes = (get('recipes') ?? get('recipe') ?? 'FIRST_DISH_V1')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const seeds = (get('seeds') ?? DEV_SEEDS.join(',')).split(',').map((s) => Number(s.trim()));
  if (seeds.some((s) => !Number.isInteger(s) || s < 0))
    throw new Error('--seeds must be a comma-separated list of non-negative integers');
  const seconds = Number(get('seconds') ?? '600');
  const extend = Number(get('extend') ?? '1200');
  if (!(seconds > 0) || !(extend >= 0)) throw new Error('--seconds must be > 0 and --extend ≥ 0');
  const horizon = Number(get('horizon') ?? '0');
  if (!(horizon === 0 || horizon > seconds))
    throw new Error('--horizon must be later than --seconds (or 0 for none)');
  const presets = (get('presets') ?? get('preset') ?? 'standard').split(',').map((s) => s.trim());
  if (presets.length === 0 || presets.some((p) => p !== 'standard' && p !== 'accelerated'))
    throw new Error('--preset/--presets must be standard, accelerated or both (comma-separated)');
  return {
    recipes,
    seeds,
    seconds,
    extend,
    horizon,
    plainCheck: argv.includes('--plain-check'),
    presets: presets as Preset[],
    out: get('out') ?? null,
  };
}

/** Everything that makes a tuning run invalid evidence (the CLI exits 2 when any is found). */
export function integrityProblems(runs: readonly SeedRun[]): string[] {
  const problems: string[] = [];
  for (const r of runs) {
    const who = `${r.recipe} ${r.preset} seed ${r.seed}`;
    for (const c of checkpointsOf(r)) {
      if (!c.ledger.ok) problems.push(`${who}: ledger not ok at ${c.seconds} s`);
      if (c.inheritance.mismatches > 0) problems.push(`${who}: ${c.inheritance.mismatches} draw mismatches by ${c.seconds} s`);
      if (c.inheritance.drawsMatched !== c.inheritance.drawsChecked)
        problems.push(`${who}: ${c.inheritance.drawsChecked - c.inheritance.drawsMatched} daughters not reproduced by ${c.seconds} s`);
    }
    for (const t of plainMismatches(r)) problems.push(`${who}: plain-run hash differs at ${t / TICKS_PER_SECOND} s`);
  }
  return problems;
}

function main(): void {
  const args = parseTuneArgs(process.argv.slice(2));
  const registry = loadRegistryFs();
  for (const r of args.recipes) if (!registry.recipes[r]) throw new Error(`unknown recipe ${r}`);
  // The code on disk when this process started is the code it runs.
  const build = buildInfo();
  const runs: SeedRun[] = [];
  const wall0 = performance.now();
  const load0 = loadavg()[0]!;
  for (const recipe of args.recipes) {
    for (const preset of args.presets) {
      for (const seed of args.seeds) {
        const t0 = performance.now();
        const run = tuneSeed(registry, {
          recipe,
          seed,
          preset,
          seconds: args.seconds,
          extendSeconds: args.extend,
          horizonSeconds: args.horizon,
        });
        const cp = run.checkpoint;
        const inh = cp.inheritance;
        const last = checkpointsOf(run).at(-1)!;
        console.error(
          `${recipe} ${preset} seed ${seed}: ${run.final.seconds} s${run.extended ? ' (extended)' : ''}${run.horizon ? ` + horizon ${run.horizon.seconds} s` : ''} · intake t${cp.firstIntakeTick ?? '-'} · division t${cp.firstDivisionTick ?? '-'} · births ${cp.births} · deaths ${cp.deaths} · mutations ${cp.mutations} · daughters ${inh.daughters} · module draws ${inh.moduleDraws} · gains ${inh.gains} · branches ${inh.branches.length} · reproduced ${inh.drawsMatched}/${inh.drawsChecked} · mismatches ${inh.mismatches} · hash ${run.final.hash}${run.horizon ? ` · horizon hash ${run.horizon.hash}` : ''} · ${((performance.now() - t0) / 1000).toFixed(1)} s wall`,
        );
        if (args.plainCheck) {
          const t1 = performance.now();
          run.plain = plainRunHashes(registry, run, checkpointsOf(run).map((c) => c.tick));
          console.error(
            `  plain run to ${last.seconds} s: ${plainMismatches(run).length === 0 ? 'same hashes' : `DIFFERS at ${plainMismatches(run).join(', ')}`} · ${((performance.now() - t1) / 1000).toFixed(1)} s wall`,
          );
        }
        runs.push(run);
      }
    }
  }
  const outPath = args.out === null ? null : isAbsolute(args.out) ? args.out : join(process.cwd(), args.out);
  const previous =
    outPath !== null && existsSync(outPath) ? extractAnalysis(readFileSync(outPath, 'utf8')) : null;
  const report = renderReport(
    runs,
    {
      command: `npx tsx tools/sim-tune.ts ${process.argv.slice(2).join(' ')}`.trim(),
      seconds: args.seconds,
      extendSeconds: args.extend,
      horizonSeconds: args.horizon,
      plainCheck: args.plainCheck,
      machine: `${process.platform} ${process.arch} node ${process.version}, ${cpus().length} CPU(s)`,
      generatedAt: new Date().toISOString(),
      wallSeconds: (performance.now() - wall0) / 1000,
      loadAverage: [load0, loadavg()[0]!],
      build,
    },
    previous,
  );
  if (outPath !== null) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, report);
    console.error(`wrote ${outPath.startsWith(REPO_ROOT) ? outPath.slice(REPO_ROOT.length + 1) : outPath}`);
  }
  console.log(report);
  const problems = integrityProblems(runs);
  for (const p of problems) console.error(`INTEGRITY: ${p}`);
  if (problems.length > 0) process.exit(2);
}

if (process.argv[1]?.endsWith('sim-tune.ts')) main();
