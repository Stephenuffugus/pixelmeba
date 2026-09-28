/**
 * Comparison engine (SPEC §13.4, UX §5.6, BUILD_DIRECTIVE P2.4).
 *
 * A comparison captures the current dish once as an immutable baseline (a serialized world state),
 * realizes two identical copies from it — A, the untouched baseline arm, and B, which receives the
 * player's intervention through the ordinary command path — and advances both by exactly the same
 * number of ticks. The pair is always stepped together (A one tick, then B one tick), so at every
 * moment the two arms are at the same simulated time; wall-clock time only paces how many pairs run
 * per frame and never decides how many ticks either arm receives.
 *
 * The paired run itself and everything it measures live in one model shared with experiment cards
 * (src/sim/pairedRun.ts): the same observer, the same stepping, the same measurements. Measuring is
 * observation — it never draws simulation randomness or writes to a world — so A and B each stay
 * exactly as deterministic as any other dish (A's hash equals an untouched duplicate run for the same
 * ticks). Comparison records are worker/UI state, never simulation state: nothing about a comparison
 * is stored inside a world.
 *
 * An experiment card's paired run (P2.5) is a comparison too: its arms come from the card
 * (src/sim/experiments.ts realizeExperimentArms), its one change is the card's, and `experiment`
 * carries the card's gate and measurements.
 *
 * Results always describe "this paired run": one baseline, one change, one horizon.
 */
import { applyNow, type CommandPayload } from '@sim/commands';
import type { ExperimentChange } from '@sim/content/schema';
import type { GateStatus, JournalStamp, PlayerStep } from '@sim/experiments';
import { PairedRun, type ComparisonResults, type Intervention } from '@sim/pairedRun';
import { deserializeWorld, serializeWorld, type WorldState } from '@sim/serialize';
import type { World } from '@sim/world';
import type { Speed } from './protocol';

// One model: the paired run and its measurements are shared with experiment cards.
export {
  ArmObserver,
  measureRows,
  measureSummary,
  PairedRun,
  PAIRED_RUN_LABEL,
  shannonIndex,
  type ArmMeasures,
  type ComparisonResults,
  type DeathCause,
  type Intervention,
  type MeasureRow,
  type ModuleFrequency,
  type SpeciesSummary as SpeciesMeasure,
  type TraitDistribution,
} from '@sim/pairedRun';

/** Horizons offered to the player in simulated seconds (CT §12.10); `null` runs until Stop. */
export const COMPARE_HORIZONS_S = [60, 180, 600] as const;

/** Pacing only: 0 pauses, 1/2/4 are the usual speeds, 'max' runs as many pairs as the frame budget allows. */
export type CompareSpeed = 0 | 1 | 2 | 4 | 'max';

export type CompareStatus = 'setup' | 'running' | 'complete' | 'failed';

/**
 * An experiment card's paired run (P2.5): the card, the change B received, its fixed horizon, and the
 * observation gate as measured so far. All values are measured by the worker.
 */
export interface ComparisonExperiment {
  readonly cardId: string;
  readonly title: string;
  /** Recipe labels shown wherever the run is shown (e.g. "Seeded traits demonstration"). */
  readonly labels: readonly string[];
  readonly recipeId: string;
  readonly recipeRevision: number;
  readonly seed: number;
  /** The one declared difference B received (setup change or commands). */
  readonly change: ExperimentChange;
  /** Ticks both arms run: the card's stopping point minus the start. */
  readonly horizonTicks: number;
  /** The measured gate: reached (with the second and clause values) or the clause values so far. */
  readonly gate: GateStatus | null;
  /**
   * The player steps the card lists (completion.playerSteps, CT §10.1) and whether each was taken on
   * this run's screen. The stamp needs the measured gate and every step.
   */
  readonly steps: readonly { readonly step: PlayerStep; readonly done: boolean }[];
  /** The journal stamp, once the measured gate held and every listed step was taken (null until then). */
  readonly stamp: JournalStamp | null;
  /** The card's measurements in A and B at the latest evaluation (the gate moment, then the end). */
  readonly measured: { readonly A: Readonly<Record<string, number>>; readonly B: Readonly<Record<string, number>> } | null;
}

/** What the worker tells the UI about a comparison (no world data beyond the results). */
export interface ComparisonState {
  readonly compareId: string;
  readonly sourceDishId: string;
  readonly aDishId: string;
  readonly bDishId: string;
  readonly baselineTick: number;
  readonly status: CompareStatus;
  readonly horizonTicks: number | null;
  readonly ticksRun: number;
  readonly speed: CompareSpeed;
  /** The source dish's speed when the comparison opened (restored when it closes). */
  readonly priorSpeed: Speed;
  readonly interventions: readonly Intervention[];
  readonly results: ComparisonResults | null;
  readonly error: string | null;
  /** Set when this comparison is an experiment card's paired run (P2.5). */
  readonly experiment?: ComparisonExperiment;
}

/** A fresh world from the stored baseline under its own world id (the baseline itself is never touched). */
export function realizeArm(baseline: WorldState, worldId: string): World {
  return deserializeWorld({ ...baseline, worldId });
}

/** Capture a dish once as an immutable baseline. */
export function captureBaseline(world: World): WorldState {
  return serializeWorld(world);
}

/**
 * Headless comparison (ARCH §7 `compare {baseline, interventionCommands[], ticks}`): realize A and B
 * from the baseline, apply the interventions to B only as paused edits at the baseline tick, and run
 * both for `ticks`. Used by fixtures; the worker runs the same PairedRun live.
 */
export function runPairedComparison(
  baseline: WorldState,
  interventions: readonly { readonly commandId: string; readonly payload: CommandPayload }[],
  ticks: number,
): { readonly a: World; readonly b: World; readonly results: ComparisonResults } {
  const a = realizeArm(baseline, `${baseline.worldId}+A`);
  const b = realizeArm(baseline, `${baseline.worldId}+B`);
  const applied: Intervention[] = interventions.map((iv) => ({ commandId: iv.commandId, payload: iv.payload, result: applyNow(b, iv.commandId, iv.payload).result ?? null }));
  const run = new PairedRun(baseline, a, b, ticks);
  while (!run.done) run.stepPair();
  return { a, b, results: run.results(applied) };
}
