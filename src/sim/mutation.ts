/**
 * Daughter genome proposals and mutation draws (SPEC §8.3, D03 §6, D04 §3, D05 §13).
 *
 * Every draw is stateless: det(seed, stream, parentBirthId, divisionOrdinal=0, daughterIndex, k).
 * Draws happen once, when the proposal is created, and the proposal is saved — so waiting for room,
 * saving and reloading can never reroll a daughter. Rates never scale with speed or need.
 */
import { detFloat, detInt, STREAMS } from './rng';
import type { FeedingPolicy, Genome, GenomeInput } from './genome';
import { eligibleGains, lossOptions } from './modules';
import { activeLoci } from './phenotype';
import type { World, MutationPreset } from './world';
import type { CreationFounders } from './founders';

export interface MutationRates {
  readonly quantitative: number;
  readonly preference: number;
  readonly module: number;
  readonly developmental: number;
}

/** The three evolution presets (SPEC §8.6), in the order the New Dish flow offers them. */
export const MUTATION_PRESETS: readonly MutationPreset[] = ['standard', 'accelerated', 'fixed'];

export function isMutationPreset(x: unknown): x is MutationPreset {
  return typeof x === 'string' && (MUTATION_PRESETS as readonly string[]).includes(x);
}

/**
 * Per-daughter chances for a preset (SPEC §8.3/§8.6, CT §12.8). The only inputs are the preset and
 * whether developmental changes exist yet (Phase 7): playback speed, frame rate, tick cost and the
 * environment can never reach a rate (P2.2 "faster playback never changes per-birth rates").
 */
export function ratesFor(preset: MutationPreset, developmentalEnabled: boolean): MutationRates {
  switch (preset) {
    case 'standard':
      return { quantitative: 0.08, preference: 0.02, module: 0.002, developmental: developmentalEnabled ? 0.01 : 0 };
    case 'accelerated':
      return { quantitative: 0.16, preference: 0.04, module: 0.01, developmental: developmentalEnabled ? 0.02 : 0 };
    case 'fixed':
      return { quantitative: 0, preference: 0, module: 0, developmental: 0 };
  }
}

/** Mutation descriptor bits (saved with the proposal, then copied to the birth record). */
export const MUT_QUANT = 1;
export const MUT_QUANT_NEUTRAL = 2;
export const MUT_PREF = 4;
export const MUT_POLICY_ESTABLISHED = 8;
export const MUT_MODULE_GAIN = 16;
export const MUT_MODULE_LOSS = 32;
export const MUT_DEV = 64;

export interface DaughterDraw {
  readonly genome: number;
  readonly flags: number;
  /** Changed locus index, or -1. */
  readonly locus: number;
  /** Signed locus change actually applied (0 for a clamped neutral draw). */
  readonly delta: number;
  /** Index of the gained/lost module in the world's module list, or -1. */
  readonly module: number;
}

export interface DaughterProposal {
  readonly genomes: readonly [number, number];
  readonly draws: readonly [DaughterDraw, DaughterDraw];
}

const DRAW_ROLL = 0;
const DRAW_PICK = 1;
const DRAW_SIZE = 2;
const DRAW_SIGN = 3;
const DRAW_TO = 4;

export interface DaughterDraft {
  readonly input: GenomeInput;
  readonly flags: number;
  readonly locus: number;
  readonly delta: number;
  readonly module: number;
}

/**
 * One daughter's inherited genome, drawn once from (seed, stream, parentBirthId, 0, daughterIndex).
 * Pure: the same inputs always give the same draft (exported for fixtures and tuning tools).
 */
export function draftDaughter(world: World, parent: Genome, pb: number, d: number): DaughterDraft {
  return mutateDaughter(world, parent, pb, d);
}

function mutateDaughter(world: World, parent: Genome, pb: number, d: number): DaughterDraft {
  const seed = world.seed;
  const sp = world.species.find((s) => s.id === parent.ancestor)!;
  const rates = ratesFor(world.settings.mutationPreset, world.content.manifest.developmentalEnabled);
  let loci = parent.loci;
  let policy: FeedingPolicy = parent.policy;
  let weights = parent.weights;
  let modules = parent.modules;
  let flags = 0;
  let locus = -1;
  let delta = 0;
  let module = -1;

  // 1. Quantitative: one active locus, ±2 (80 %) or ±5, clamped to 0–100.
  if (rates.quantitative > 0 && detFloat(seed, STREAMS.mutQuant, pb, 0, d, DRAW_ROLL) < rates.quantitative) {
    // Loci that act for the parent genome (E03 carriers also vary their dormancy threshold).
    const active: number[] = [];
    activeLoci(sp, parent).forEach((on, l) => {
      if (on) active.push(l);
    });
    if (active.length > 0) {
      const l = active[detInt(seed, STREAMS.mutQuant, active.length, pb, 0, d, DRAW_PICK)]!;
      const size = detFloat(seed, STREAMS.mutQuant, pb, 0, d, DRAW_SIZE) < 0.8 ? 2 : 5;
      const sign = detFloat(seed, STREAMS.mutQuant, pb, 0, d, DRAW_SIGN) < 0.5 ? -1 : 1;
      const before = loci[l]!;
      const after = Math.min(100, Math.max(0, before + sign * size));
      locus = l;
      delta = after - before;
      flags |= delta === 0 ? MUT_QUANT_NEUTRAL : MUT_QUANT;
      if (delta !== 0) {
        const next = [...loci];
        next[l] = after;
        loci = next;
      }
    }
  }

  // 2. Preference: needs ≥ 2 supported foods. Ordered first becomes weighted (D04 C01).
  const n = sp.foods.length;
  if (rates.preference > 0 && n >= 2 && detFloat(seed, STREAMS.mutPref, pb, 0, d, DRAW_ROLL) < rates.preference) {
    let w: number[];
    if (policy === 'ordered' || weights === null) {
      w = sp.foods.map((_, k) => (k === 0 ? 2 / (n + 1) : 1 / (n + 1)));
      policy = 'weighted';
      flags |= MUT_POLICY_ESTABLISHED;
    } else w = [...weights];
    const from = detInt(seed, STREAMS.mutPref, n, pb, 0, d, DRAW_PICK);
    const toRaw = detInt(seed, STREAMS.mutPref, n - 1, pb, 0, d, DRAW_TO);
    const to = toRaw >= from ? toRaw + 1 : toRaw;
    const amount = Math.min(0.05, w[from]!);
    w[from] = w[from]! - amount;
    w[to] = w[to]! + amount;
    // Renormalize defensively against roundoff; weights sum to 1.
    const sum = w.reduce((a, b) => a + b, 0);
    weights = w.map((x) => x / sum);
    flags |= MUT_PREF;
  }

  // 3. Module change: gain or loss with equal probability; uniform among the legal options of the
  // world's recorded registry (combinations validated here, at proposal time); no reroll. A draw with
  // no legal option changes nothing.
  if (rates.module > 0 && detFloat(seed, STREAMS.mutModule, pb, 0, d, DRAW_ROLL) < rates.module) {
    const gain = detFloat(seed, STREAMS.mutModule, pb, 0, d, DRAW_SIZE) < 0.5;
    const options = gain ? eligibleGains(world, { ancestor: parent.ancestor, modules }) : lossOptions(world, { ancestor: parent.ancestor, modules });
    if (options.length > 0) {
      const id = options[detInt(seed, STREAMS.mutModule, options.length, pb, 0, d, DRAW_PICK)]!;
      modules = gain ? [...modules, id].sort() : modules.filter((m) => m !== id);
      module = world.content.modules.findIndex((m) => m.id === id);
      flags |= gain ? MUT_MODULE_GAIN : MUT_MODULE_LOSS;
    }
  }

  // 4. Developmental changes arrive with Phase 7 (rate is 0 until enabled).

  return {
    input: { ancestor: parent.ancestor, loci, policy, weights: policy === 'weighted' ? weights : null, modules, dev: parent.dev },
    flags,
    locus,
    delta,
    module,
  };
}

export function proposeDaughters(world: World, parentSlot: number): DaughterProposal {
  const c = world.ents.cols;
  const parent = world.genomes.get(c.genome[parentSlot]!);
  const pb = c.birthId[parentSlot]!;
  const draws = [0, 1].map((d) => {
    const m = mutateDaughter(world, parent, pb, d);
    const genome = m.flags & (MUT_QUANT | MUT_PREF | MUT_MODULE_GAIN | MUT_MODULE_LOSS | MUT_POLICY_ESTABLISHED) ? world.genomes.intern(m.input) : c.genome[parentSlot]!;
    return { genome, flags: m.flags, locus: m.locus, delta: m.delta, module: m.module };
  }) as [DaughterDraw, DaughterDraw];
  return { genomes: [draws[0].genome, draws[1].genome], draws };
}

// ------------------------------------------------------------------ preset changes (P2.2)

/**
 * One recorded change of the evolution setting: a timestamped intervention in the command log
 * (SPEC §8.6 "Rate changes are timestamped interventions"). `tick` is the tick it took effect: every
 * daughter proposal created from that tick on uses the new rates; proposals made earlier keep their
 * recorded draws (a proposal is never redrawn).
 */
export interface PresetChange {
  readonly tick: number;
  readonly seq: number;
  readonly commandId: string;
  /** The setting before the change (absent in a command recorded without it). */
  readonly from: MutationPreset | null;
  readonly to: MutationPreset;
}

/** Accepted evolution-setting changes still in the command log, oldest first. */
export function presetChanges(world: World): PresetChange[] {
  const out: PresetChange[] = [];
  for (const cmd of world.commands.log) {
    const p = cmd.payload;
    if (p.kind !== 'setMutationPreset' || !cmd.result || cmd.result.accepted <= 0 || !isMutationPreset(p.preset)) continue;
    const from = cmd.result.presetFrom;
    out.push({ tick: cmd.targetTick, seq: cmd.seq, commandId: cmd.commandId, from: isMutationPreset(from) ? from : null, to: p.preset });
  }
  return out;
}

/** The world's evolution setting as the UI shows it (Advanced panel; read-only, from recorded state). */
export interface EvolutionState {
  readonly preset: MutationPreset;
  readonly founderMode: World['settings']['founderMode'];
  /** Per-daughter chances in effect now. */
  readonly rates: MutationRates;
  readonly developmentalEnabled: boolean;
  /** Recorded changes during play (bounded by the command log), oldest first. */
  readonly changes: readonly PresetChange[];
  /**
   * The founders the dish was made with and the modules present at creation (founders.ts
   * creationFounders; the host adds it, so the Evolution sheet never states a founder mode's rule as a
   * fact about this dish's founders).
   */
  readonly creation?: CreationFounders;
}

export function evolutionState(world: World): EvolutionState {
  const dev = world.content.manifest.developmentalEnabled;
  return {
    preset: world.settings.mutationPreset,
    founderMode: world.settings.founderMode,
    rates: ratesFor(world.settings.mutationPreset, dev),
    developmentalEnabled: dev,
    changes: presetChanges(world),
  };
}

/**
 * SPEC §8.7 pacing statement: the chance of at least one module-gain attempt in `births` eligible
 * daughter births (a module draw is a gain or a loss with equal probability). An attempt is not a
 * surviving branch.
 */
export function moduleGainAttemptChance(rates: MutationRates, births: number): number {
  return 1 - Math.pow(1 - rates.module / 2, births);
}
