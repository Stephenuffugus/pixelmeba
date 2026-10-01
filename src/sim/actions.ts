/**
 * Stage 8 action table and per-organism budget (SPEC §3.2 stage 8, §3.3; D04 §2 C08 and §9
 * "Canonical resource and state resolution"; P3.7).
 *
 * Within stage 8, each Active organism, in ascending slot order, reserves energy and body material
 * in this fixed order:
 *   1. mandatory transitions — dormancy (dormancy.ts, run for every living organism), then the
 *      release of invalid links/anchors (`releaseInvalidLinks`), then any mandatory table entries
 *      (none ship yet; Phase 7 life-stage transitions belong here);
 *   2. native optional actions in stable action-ID order;
 *   3. supplementary-module actions E01 … E17 in ascending module number.
 *
 * Action IDs (DECISIONS: "native action IDs = the NativeAbility enum index"): a native action's ID is
 * the index of its ability in the NativeAbility enum (src/sim/content/schema.ts,
 * `NativeAbility.options.indexOf(id)`), so E_STARCH_SECRETION (0) < E_OIL_SECRETION (1) <
 * E_PROTEIN_SECRETION (2) < BIOFILM (3) < … ; the enum is append-only, so the IDs never move. A
 * module action's ID is its module number (E01 → 1). Mandatory entries carry an explicit ID.
 *
 * Each action checks its conditions against the energy (and body carbon) REMAINING after earlier
 * actions of the same organism this tick (`ActionContext.remainingEnergy/remainingBody`) and either
 * commits a self-contained cost at once (`spend`, e.g. secretion) or reserves its full maximum for
 * the shared construction pass (`requestConstruction`). Nothing is retried; a refused action stays
 * refused this tick and no later action receives a refund. Unused construction reservations are
 * returned by construction.ts before births (they were only ever held, never deducted).
 *
 * The table is an array in a fixed, validated order: never Map/Set/object-key iteration. Tests may
 * build their own tables with `buildActionTable`; the shipped `STAGE8_ACTIONS` is frozen and no test
 * registration can change it or any shipped world.
 */
import { NativeAbility, type NativeAbilityId } from './content/schema';
import type { ConstructionRequest } from './construction';
import type { Ledger } from './ledger';
import type { Profile } from './phenotype';
import { producerApplies, producerRun } from './secretion';
import { biofilmApplies, biofilmRun } from './film';
import { matrixApplies, matrixRun } from './matrixBuilder';
import { advanceIntakeClock } from './intakeClock';
import { anchorStep } from './anchor';
import { adhesionRelease } from './adhesion';
import type { World } from './world';

export type ActionTier = 'mandatory' | 'native' | 'module';

/** Energy-ledger categories an action may spend into (energy is not conserved but always recorded). */
export type EnergyCategory = keyof Ledger['energy'];

export interface Stage8Action {
  readonly tier: ActionTier;
  /** NativeAbility id (native), module id 'E01'… (module) or a mandatory transition name. */
  readonly key: string;
  /** Stable action ID within its tier (see the file comment). */
  readonly id: number;
  /** Whether this organism has the action at all (a pure read of its profile/state). */
  readonly applies: (prof: Profile, world: World, i: number) => boolean;
  /** Try the action once; returns a reason code (R.*) describing the outcome. */
  readonly run: (ctx: ActionContext) => number;
}

const TIER_RANK: Readonly<Record<ActionTier, number>> = { mandatory: 0, native: 1, module: 2 };

/** A native optional action; its ID is the NativeAbility enum index. */
export function nativeAction(key: NativeAbilityId, applies: Stage8Action['applies'], run: Stage8Action['run']): Stage8Action {
  const id = NativeAbility.options.indexOf(key);
  if (id < 0) throw new Error(`stage 8: "${key}" is not a native ability`);
  return Object.freeze({ tier: 'native', key, id, applies, run });
}

/** A supplementary-module action; its ID is the module number (E01 → 1). */
export function moduleAction(key: string, applies: Stage8Action['applies'], run: Stage8Action['run']): Stage8Action {
  const m = /^E(\d\d)$/.exec(key);
  if (!m) throw new Error(`stage 8: "${key}" is not a module id`);
  return Object.freeze({ tier: 'module', key, id: Number(m[1]), applies, run });
}

/** A mandatory transition entry (runs after dormancy and link release, before every optional action). */
export function mandatoryAction(key: string, id: number, applies: Stage8Action['applies'], run: Stage8Action['run']): Stage8Action {
  if (!Number.isInteger(id) || id < 0) throw new Error(`stage 8: mandatory action "${key}" needs a non-negative integer id`);
  return Object.freeze({ tier: 'mandatory', key, id, applies, run });
}

function compareActions(a: Stage8Action, b: Stage8Action): number {
  return TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.id - b.id;
}

/**
 * A validated, frozen action table in canonical order (mandatory → native by ID → modules
 * ascending). Two actions with the same tier and ID are an error.
 */
export function buildActionTable(actions: readonly Stage8Action[]): readonly Stage8Action[] {
  const out = [...actions].sort(compareActions);
  for (let k = 1; k < out.length; k++) {
    if (compareActions(out[k - 1]!, out[k]!) === 0) throw new Error(`stage 8: duplicate action ${out[k]!.tier} ${out[k]!.key}`);
  }
  return Object.freeze(out);
}

/**
 * The shipped table, written in canonical order (checked at load): the native producers E_STARCH (0),
 * E_OIL (1), E_PROTEIN (2), native BIOFILM (3), then modules E01 (starch release), E09 (protein
 * release, secretion.ts) and E10 (matrix builder, matrixBuilder.ts). The native producers apply only
 * to a producer whose rules are native, the module producers only to one whose rules came from that
 * module (a module never duplicates a native ability, SPEC §9), so a native B06 and an E01 carrier
 * each run exactly one starch action. Where the other modules act is listed in structures.ts.
 */
const SHIPPED: readonly Stage8Action[] = [
  nativeAction('E_STARCH_SECRETION', producerApplies('starch', 'native'), producerRun('starch')),
  nativeAction('E_OIL_SECRETION', producerApplies('oil', 'native'), producerRun('oil')),
  nativeAction('E_PROTEIN_SECRETION', producerApplies('protein', 'native'), producerRun('protein')),
  nativeAction('BIOFILM', biofilmApplies, biofilmRun),
  moduleAction('E01', producerApplies('starch', 'E01'), producerRun('starch')),
  moduleAction('E09', producerApplies('protein', 'E09'), producerRun('protein')),
  moduleAction('E10', matrixApplies, matrixRun),
];

export const STAGE8_ACTIONS: readonly Stage8Action[] = buildActionTable(SHIPPED);
for (let k = 0; k < SHIPPED.length; k++) {
  if (STAGE8_ACTIONS[k] !== SHIPPED[k]) throw new Error('stage 8: the shipped action table is not written in canonical order');
}

/**
 * One organism's stage-8 budget. One context serves a whole stage call (`begin` resets it per
 * organism); its construction requests accumulate for the shared pass after every organism has acted.
 */
export class ActionContext {
  readonly world: World;
  /** Every construction request submitted this stage, in submission (ascending slot) order. */
  readonly requests: ConstructionRequest[] = [];
  i = -1;
  prof: Profile | null = null;
  /** Energy held for shared construction by this organism this tick (not yet deducted). */
  reservedE = 0;
  /** Body carbon held for shared construction by this organism this tick (not yet deducted). */
  reservedB = 0;

  constructor(world: World) {
    this.world = world;
  }

  begin(i: number, prof: Profile): void {
    this.i = i;
    this.prof = prof;
    this.reservedE = 0;
    this.reservedB = 0;
  }

  get profile(): Profile {
    if (this.prof === null) throw new Error('stage 8: action context used before begin()');
    return this.prof;
  }

  /** Energy left for this action after earlier actions' commits and reservations this tick. */
  remainingEnergy(): number {
    return this.world.ents.cols.E[this.i]! - this.reservedE;
  }

  /** Body carbon left for this action after earlier construction reservations this tick. */
  remainingBody(): number {
    return this.world.ents.cols.B[this.i]! - this.reservedB;
  }

  /** Commit a self-contained cost now, recorded under `category`. Never more than what remains. */
  spend(amount: number, category: EnergyCategory): void {
    if (!(amount >= 0) || !Number.isFinite(amount)) throw new Error(`stage 8: invalid spend ${amount}`);
    if (amount > this.remainingEnergy()) throw new Error(`stage 8: ${amount} E exceeds the ${this.remainingEnergy()} E left (reserved energy is not available)`);
    this.world.ents.cols.E[this.i]! -= amount;
    this.world.ledger.energy[category] += amount;
  }

  /**
   * Reserve body carbon and its full energy cost for the shared construction pass (construction.ts):
   * the pass may accept less (proportional headroom), charges only accepted × energyPerC and returns
   * the rest. Both reservations count against everything this organism tries later this tick.
   */
  requestConstruction(cell: number, bodyC: number, energyPerC: number): void {
    if (!(bodyC > 0) || !Number.isFinite(bodyC)) throw new Error(`stage 8: invalid construction amount ${bodyC}`);
    if (!(energyPerC >= 0) || !Number.isFinite(energyPerC)) throw new Error(`stage 8: invalid construction energy rate ${energyPerC}`);
    const energyReserved = energyPerC * bodyC;
    if (bodyC > this.remainingBody()) throw new Error(`stage 8: construction of ${bodyC} C exceeds the ${this.remainingBody()} C left`);
    if (energyReserved > this.remainingEnergy()) throw new Error(`stage 8: construction reserve ${energyReserved} E exceeds the ${this.remainingEnergy()} E left`);
    this.reservedB += bodyC;
    this.reservedE += energyReserved;
    this.requests.push({ slot: this.i, cell, bodyC, energyReserved, energyPerC });
  }
}

/**
 * Release invalid links and anchors (SPEC §3.2 stage 8, after dormancy transitions; D04 §9). A no-op
 * until the links/anchor rules land (wave 4: E04 anchors, E12 links, F02 links on rest); it runs for
 * every living organism, Active or not, because resting releases anchors.
 */
export function releaseInvalidLinks(world: World, i: number, prof: Profile): void {
  advanceIntakeClock(world, i, prof); // D-0035 usable-intake clock (E04/E12 carriers only), before the checks that read it
  anchorStep(world, i, prof); // E04 surface anchor: detach, lockout, attach (anchor.ts)
  adhesionRelease(world, i, prof); // E12 colony links: sever on module loss, rest, no intake, low E, separation (adhesion.ts)
}

/** Run the mandatory and optional table entries for one Active organism, in table order. */
export function runActions(ctx: ActionContext, table: readonly Stage8Action[], i: number, prof: Profile): void {
  ctx.begin(i, prof);
  const world = ctx.world;
  for (let k = 0; k < table.length; k++) {
    const a = table[k]!;
    if (!a.applies(prof, world, i)) continue;
    a.run(ctx);
  }
}
