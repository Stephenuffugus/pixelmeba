/**
 * P4.5 Paired Garden variants (R2): a What if? idea of the Garden (R-G1, R-G2, R-G3) run side by side
 * with the unchanged Garden (R-G0) for the existing 180-simulation-second paired comparison (SPEC
 * §13.3–§13.4; CT §9.4, §12.10; UX §3.4, §5.6; D09 line 115).
 *
 * - Both arms are realized from content at tick 0 (realizeVariant), each under its own world id: A is
 *   R-G0, B is the idea. Nothing else differs and no command is ever added ("no extra commands by
 *   default"): the one difference is the idea's recorded patch.
 * - The horizon is fixed at 1800 ticks (180 s). Stop ends both arms at the same tick.
 * - Paired mode steps A one tick then B one tick (the comparison engine's PairedRun). Sequential mode
 *   ("sequentially if memory requires", SPEC §13.4) runs A to the horizon first, takes A's half of the
 *   results, lets A's world go, then realizes B and runs it to exactly the same tick count. Both modes
 *   compose the same ComparisonResults (src/sim/pairedRun.ts measureSummary / measureRows), and the
 *   fixture tests/fixtures/variants-paired.test.ts proves they are deep-equal.
 *
 * Worker state only: nothing here is saved, hashed or read by the simulation. Measuring is observation
 * (ArmObserver, poolTotal), so each arm stays exactly as deterministic as the same dish run alone.
 */
import type { ContentRegistry } from '@sim/content/registry';
import { FIELD_DEFS } from '@sim/fields';
import { ArmObserver, measureRows, measureSummary, PairedRun, PAIRED_RUN_LABEL, poolTotal, stepObserved, type ArmMeasures, type ComparisonResults } from '@sim/pairedRun';
import { deserializeWorld, serializeWorld, stateHash, type WorldState } from '@sim/serialize';
import { realizeVariant, variantPreview, variantSupportProblem, type VariantChange } from '@sim/variants';
import type { World } from '@sim/world';

/** The unchanged Garden every idea is compared with (CT §9.4). */
export const VARIANT_PAIR_BASE = 'R-G0';
/** D09 line 115: "the existing 180-simulation-second paired comparison". */
export const VARIANT_PAIR_SECONDS = 180;
export const VARIANT_PAIR_TICKS = VARIANT_PAIR_SECONDS * 10;

/** Dish total of sugar (carbon) in A and B. */
export interface VariantPairSugar {
  readonly a: number;
  readonly b: number;
}

/** What the comparison state says about a Garden variant pair (ComparisonState.variantPair). */
export interface ComparisonVariantPair {
  readonly variantId: string;
  readonly revision: number;
  readonly title: string;
  readonly question: string;
  /** "R-G1 / revision 1 / seed 104729" (SPEC §14.4 form). */
  readonly identity: string;
  /** The Garden's own identifier, "R-G0 / revision 1 / seed 104729". */
  readonly baseIdentity: string;
  /** The plain statement of the changed input: "B's sugar patch held 0.20 C per cell instead of 0.40." */
  readonly change: string;
  /** The same without "B's" and the full stop ("sugar patch held 0.20 C per cell instead of 0.40"), for a result card. */
  readonly changeShort: string;
  /** The two dishes run one after the other (SPEC §13.4 "sequentially if memory requires"). */
  readonly sequential: boolean;
  /** Sequential mode while running: the dish running now. Null in paired mode and outside a run. */
  readonly phase: 'A' | 'B' | null;
  /** Ticks each dish runs: the horizon, or where Stop ended A (sequential B runs to exactly this). */
  readonly targetTicks: number;
  /** Sugar in the whole dish at tick 0. */
  readonly sugarStart: VariantPairSugar;
  /** "Sugar left in the dish" at the end of the run (null until the results). */
  readonly sugarEnd: VariantPairSugar | null;
}

/** The fixed facts of a pair, before anything runs. */
export type VariantPairFacts = Omit<ComparisonVariantPair, 'sequential' | 'phase' | 'targetTicks' | 'sugarEnd'>;

/** Refusal texts (readable as-is; nothing was started, saved or changed). */
export const VARIANT_PAIR_TEXT = {
  base: 'The Garden is what every idea is compared with; choose one of its ideas to compare.',
  unknown: (id: string) => `There is no What if? idea "${id}" in this version of Pixelmeba, so nothing was started.`,
  notGarden: (title: string) => `“${title}” is not an idea of the Garden, so it cannot be compared with it.`,
  busy: 'A comparison is already open; finish or close it first. Nothing was started.',
  ids: 'The comparison needs new, distinct dish ids. Nothing was started.',
  horizon: `A Garden comparison always runs ${VARIANT_PAIR_SECONDS} seconds of dish time.`,
  stopB: 'B is catching up with A: both dishes get exactly the same time, so this run can only stop while A runs.',
  noChange: 'The two dishes run as designed: this comparison takes no other change.',
  noReset: 'This comparison has no change of yours to clear: its one difference is the idea.',
} as const;

/** A readable refusal, or null when `variantId` can be compared with the Garden on this build. */
export function variantPairRefusal(registry: ContentRegistry, variantId: string): string | null {
  const v = registry.variants[variantId];
  if (v === undefined || v.phase > registry.manifest.buildPhase) return VARIANT_PAIR_TEXT.unknown(variantId);
  if (variantId === VARIANT_PAIR_BASE) return VARIANT_PAIR_TEXT.base;
  const base = registry.variants[VARIANT_PAIR_BASE];
  if (base === undefined) return VARIANT_PAIR_TEXT.unknown(VARIANT_PAIR_BASE);
  if (v.sourceId !== base.sourceId || v.sourceRevision !== base.sourceRevision || v.patch.kind === 'none') return VARIANT_PAIR_TEXT.notGarden(v.title);
  const unsupported = variantSupportProblem(registry, v) ?? variantSupportProblem(registry, base);
  return unsupported !== null ? `${unsupported}.` : null;
}

function amount(v: number): string {
  return v.toFixed(2);
}

function cellText(c: readonly [number, number]): string {
  return `(${c[0]}, ${c[1]})`;
}

/** The changed patch's name in a sentence ("sugar patch"; "field patch 2" when it has no label). */
function patchWord(change: Exclude<VariantChange, { kind: 'unchanged' }>): string {
  return change.patchLabel ? change.patchLabel.toLowerCase() : `field patch ${change.patchIndex}`;
}

/**
 * The plain statement of the changed input, in the What if? wording (D09 line 115 "a plain statement of
 * the changed input"), without "B's" and the full stop. Amounts are fictional game units.
 */
export function variantChangeShort(change: VariantChange): string {
  switch (change.kind) {
    case 'unchanged':
      return 'nothing was changed';
    case 'amount': {
      const unit = FIELD_DEFS[change.field].material === 'carbon' ? 'C' : change.field;
      return `${patchWord(change)} held ${amount(change.after)} ${unit} per cell instead of ${amount(change.before)}`;
    }
    case 'moved':
      return `${patchWord(change)} was moved from ${cellText(change.from)} to ${cellText(change.to)}`;
  }
}

/** "B's sugar patch held 0.20 C per cell instead of 0.40." */
export function variantChangeStatement(change: VariantChange): string {
  return change.kind === 'unchanged' ? 'Nothing was changed.' : `B's ${variantChangeShort(change)}.`;
}

function identity(id: string, revision: number, seed: number): string {
  return `${id} / revision ${revision} / seed ${seed}`;
}

/** A pair realized from content, ready to open: the start states of A and B and the idea's own world. */
export interface PreparedVariantPair {
  readonly facts: VariantPairFacts;
  /** A's start (R-G0) under A's world id. */
  readonly startA: WorldState;
  /** B's start (the idea) under B's world id. */
  readonly startB: WorldState;
  /** The idea's start as a dish of its own (world id = `ids.dish`), opened after the comparison. */
  readonly ideaWorld: World;
}

/**
 * Realize both arms from content at tick 0 (pure: touches no dish). Throws a readable VariantError when
 * either cannot be built; call variantPairRefusal first.
 */
export async function prepareVariantPair(registry: ContentRegistry, variantId: string, ids: { readonly dish: string; readonly a: string; readonly b: string }): Promise<PreparedVariantPair> {
  const problem = variantPairRefusal(registry, variantId);
  if (problem !== null) throw new Error(problem);
  const base = await realizeVariant(registry, VARIANT_PAIR_BASE, { worldId: ids.a });
  const ideaWorld = await realizeVariant(registry, variantId, { worldId: ids.dish });
  const preview = variantPreview(registry, variantId);
  const v = registry.variants[variantId]!;
  const b = registry.variants[VARIANT_PAIR_BASE]!;
  const startA = serializeWorld(base);
  const startB: WorldState = { ...serializeWorld(ideaWorld), worldId: ids.b };
  return {
    facts: {
      variantId,
      revision: v.revision,
      title: v.title,
      question: v.question,
      identity: identity(v.id, v.revision, preview.seed),
      baseIdentity: identity(b.id, b.revision, preview.seed),
      change: variantChangeStatement(preview.change),
      changeShort: variantChangeShort(preview.change),
      sugarStart: { a: poolTotal(base, 'sugar'), b: poolTotal(ideaWorld, 'sugar') },
    },
    startA,
    startB,
    ideaWorld,
  };
}

/** A fresh world from a stored start under its own world id (the start itself is never touched). */
export function realizePairArm(start: WorldState, worldId: string = start.worldId): World {
  return deserializeWorld({ ...start, worldId });
}

/** What one step did: 'aDone' on the tick sequential A reached its target (A's world is still readable). */
export type VariantPairStep = 'aDone' | 'done' | null;

/**
 * One Garden variant pair's run, paired or sequential, to `VARIANT_PAIR_TICKS` (or where Stop ended it).
 * `a` and `b` are the arms' live worlds: in sequential mode `a` becomes null once A's half is measured
 * and `b` is null until A is done.
 */
export class VariantPairRun {
  readonly horizonTicks = VARIANT_PAIR_TICKS;
  readonly sequential: boolean;
  a: World | null;
  b: World | null;
  private obsA: ArmObserver | null;
  private obsB: ArmObserver | null;
  private readonly paired: PairedRun | null;
  private target = VARIANT_PAIR_TICKS;
  private ticksA = 0;
  private ticksB = 0;
  private aMeasures: ArmMeasures | null = null;
  private aSugar = 0;
  private finished: { readonly results: ComparisonResults; readonly sugarEnd: VariantPairSugar } | null = null;
  /** 'A' then 'B' in sequential mode; 'pair' in paired mode; 'done' at the end. */
  private stage: 'pair' | 'A' | 'B' | 'done';

  /**
   * `a` (and in paired mode `b`) may be given as already realized worlds at tick 0 from the same starts
   * (the host shows them during setup); otherwise they are realized here.
   */
  constructor(
    private readonly startA: WorldState,
    private readonly startB: WorldState,
    sequential: boolean,
    worlds: { readonly a?: World; readonly b?: World } = {},
  ) {
    this.sequential = sequential;
    this.a = worlds.a ?? realizePairArm(startA);
    if (this.a.tick !== startA.tick) throw new Error('A must start at its recorded start');
    if (sequential) {
      this.b = null;
      this.obsA = new ArmObserver(this.a);
      this.obsB = null;
      this.paired = null;
      this.stage = 'A';
    } else {
      this.b = worlds.b ?? realizePairArm(startB);
      // The comparison engine's paired run: A one tick, then B one tick; B's carbon added counts from B's start.
      this.paired = new PairedRun(startA, this.a, this.b, VARIANT_PAIR_TICKS, { inputBaseB: startB.ledger.inputs.c });
      this.obsA = this.paired.obsA;
      this.obsB = this.paired.obsB;
      this.stage = 'pair';
    }
  }

  get done(): boolean {
    return this.stage === 'done';
  }

  /** The dish running now in sequential mode ('A' or 'B'); null in paired mode or when done. */
  get phase(): 'A' | 'B' | null {
    return this.stage === 'A' || this.stage === 'B' ? this.stage : null;
  }

  /** Ticks the arm running now has advanced (paired: both arms). */
  get ticksRun(): number {
    if (this.paired) return this.paired.ticksRun;
    return this.stage === 'A' ? this.ticksA : this.ticksB;
  }

  /** Ticks each arm runs: the horizon, or where Stop ended the run. */
  get targetTicks(): number {
    return this.target;
  }

  /**
   * Advance by one unit of work: a pair (A then B) in paired mode, one tick of the running arm in
   * sequential mode. Returns 'aDone' when sequential A has just reached its target, 'done' at the end.
   */
  step(): VariantPairStep {
    switch (this.stage) {
      case 'done':
        return 'done';
      case 'pair': {
        const run = this.paired!;
        run.stepPair();
        if (run.ticksRun >= this.target) return this.finish();
        return null;
      }
      case 'A':
        stepObserved(this.a!, this.obsA!);
        this.ticksA++;
        if (this.ticksA >= this.target) return this.endA();
        return null;
      case 'B':
        if (this.b === null) this.startArmB();
        if (this.ticksB >= this.target) return this.finish();
        stepObserved(this.b!, this.obsB!);
        this.ticksB++;
        if (this.ticksB >= this.target) return this.finish();
        return null;
    }
  }

  /**
   * Stop now. Paired: both arms end at this tick. Sequential while A runs: A ends here and B will run to
   * exactly the same tick count (returns 'aDone'; B still has to run). Sequential while B runs: refused
   * (A already ended at the target, so stopping B early would give the two dishes unequal time).
   */
  stop(): VariantPairStep {
    switch (this.stage) {
      case 'done':
        return 'done';
      case 'pair':
        this.target = this.paired!.ticksRun;
        return this.finish();
      case 'A':
        this.target = this.ticksA;
        return this.endA();
      case 'B':
        throw new Error(VARIANT_PAIR_TEXT.stopB);
    }
  }

  /** The results (only once done). */
  results(): ComparisonResults {
    if (!this.finished) throw new Error('This comparison has not finished.');
    return this.finished.results;
  }

  sugarEnd(): VariantPairSugar {
    if (!this.finished) throw new Error('This comparison has not finished.');
    return this.finished.sugarEnd;
  }

  /** Sequential: A's half of the results, measured exactly as the paired run measures it at the end. */
  private endA(): VariantPairStep {
    const a = this.a!;
    this.aMeasures = measureSummary(a, this.obsA!, stateHash(a), this.startA.ledger.inputs.c);
    this.aSugar = poolTotal(a, 'sugar');
    this.stage = 'B';
    return 'aDone';
  }

  /** Sequential: let A's world go, then realize B at its start (and its observer, as the paired run does). */
  private startArmB(): void {
    this.a = null;
    this.obsA = null;
    const b = realizePairArm(this.startB);
    this.b = b;
    this.obsB = new ArmObserver(b);
  }

  private finish(): VariantPairStep {
    if (this.paired) {
      const run = this.paired;
      this.finished = { results: run.results([]), sugarEnd: { a: poolTotal(run.a, 'sugar'), b: poolTotal(run.b, 'sugar') } };
    } else {
      if (this.b === null) this.startArmB();
      const b = this.b!;
      const a = this.aMeasures!;
      const bm = measureSummary(b, this.obsB!, stateHash(b), this.startB.ledger.inputs.c);
      // The same record PairedRun.results composes (src/sim/pairedRun.ts), from the two halves.
      const results: ComparisonResults = {
        label: PAIRED_RUN_LABEL,
        baselineTick: this.startA.tick,
        ticks: this.target,
        horizonTicks: VARIANT_PAIR_TICKS,
        stoppedEarly: this.target < VARIANT_PAIR_TICKS,
        interventions: [],
        a,
        b: bm,
        rows: measureRows(a, bm),
      };
      this.finished = { results, sugarEnd: { a: this.aSugar, b: poolTotal(b, 'sugar') } };
    }
    this.stage = 'done';
    return 'done';
  }
}

/** Headless: realize and run one pair to the end (fixtures). */
export async function runVariantPair(
  registry: ContentRegistry,
  variantId: string,
  sequential: boolean,
): Promise<{ readonly prepared: PreparedVariantPair; readonly run: VariantPairRun }> {
  const prepared = await prepareVariantPair(registry, variantId, { dish: `${variantId}-dish`, a: `${variantId}-pair:A`, b: `${variantId}-pair:B` });
  const run = new VariantPairRun(prepared.startA, prepared.startB, sequential);
  while (!run.done) run.step();
  return { prepared, run };
}
