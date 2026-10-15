/**
 * E11 Mineral jacket (Phase 5 wave 13, P5.5 E3-JACKET; SPEC §3.2 rows 4 and 8, §3.4, §6.8, §9 E11, §9.19;
 * CT §1.2, §7.1, §12.3, §12.5; D-0045 the stage 8 reservation framework; D-0108 jacketMineral reuses the
 * pre-neutral column).
 *
 * Stage 8 module action E11 (actions.ts, after E10). While the carrier is Active (stage 8 runs the table only
 * for Active organisms, so resting, preparing, waking and dead carriers never build), not held in a trap
 * (heldBySlot < 0), its energy REMAINING this tick is at least the recorded minEnergy (15: "skip while E < 15",
 * so 15 itself builds) and its jacket is below its target targetPerBody × B (0.10 per CURRENT body), it requests
 *
 *     min(buildRate × B0' × dt, target − jacketMineral, remainingEnergy / energyPerMineral)
 *
 * mineral through ActionContext.requestMineral(cell, amount, energyPerMineral): the request holds its full
 * energy cost (10 E per mineral) against every later action of this organism; no body carbon is held.
 *
 * The shared mineral pass (`jacketPass`, run by structures.ts right after the film construction pass) then
 * resolves every request of the tick from ONE silicate snapshot:
 *
 *   per cell, ascending: headroom = silicate(snapshot);
 *   if Σ requested > headroom every request in the cell is scaled by headroom / Σ requested;
 *   each carrier binds its accepted mineral (silicate → jacketMineral, both mineral: an internal move) and is
 *   charged energyPerMineral × accepted only (ledger.energy.construction); the rest of each reservation is
 *   returned (it was never deducted).
 *
 * A scaled cell (or one a float subtraction left below 0) ends at exactly 0 silicate: the dust (a few ulps)
 * is recorded in ledger.roundoff.m so the material ledger still closes; a dust above PIN_DUST_MAX is a defect
 * and throws. Equal requests get equal shares whatever their slots (canonical order: cell, slot, submission).
 *
 * Coverage c = handling.ts jacketCoverage(jacketMineral, B) everywhere (stage 4 speed, P10 handling, the
 * view): speed × (1 − speedPenalty × c) in movement.ts. Division splits the jacket (births.ts); a daughter
 * without E11 drops hers as grit in her own cell at the end of birth processing (births.ts reconciliation);
 * death and capture send it to grit (maintenance.ts killEntity, contacts.ts consumePrey). No other protection.
 *
 * Gated on the world's own recorded manifest: only a carrier (a recorded E11 in its genome) applies, and a
 * world without the silicate system (field and recorded flag) never builds. Nothing here draws randomness.
 *
 * Observation (never read by the simulation, never hashed or saved): which carriers had mineral accepted in
 * the latest pass (`jacketBuiltNow`, the module card's "active now"), and `jacketView` for the inspector.
 */
import { DT } from './constants';
import type { ActionContext, Stage8Action } from './actions';
import { worldHasSystem } from './gates';
import { jacketCoverage } from './handling';
import type { Profile } from './phenotype';
import { profileOf } from './profiles';
import { R } from './reasons';
import { entityCell } from './spatial';
import { markField } from './transport';
import type { World } from './world';

/** One E11 carrier's request for the shared mineral pass (ActionContext.requestMineral). */
export interface MineralRequest {
  readonly slot: number;
  readonly cell: number;
  /** Mineral offered (the most this carrier may bind this tick). */
  readonly mineral: number;
  /** Energy held for the full offer (energyPerMineral × mineral). */
  readonly energyReserved: number;
  /** Energy charged per mineral actually accepted. */
  readonly energyPerMineral: number;
}

export interface MineralOutcome {
  readonly slot: number;
  readonly cell: number;
  /** Mineral moved from the cell's silicate into the jacket. */
  readonly accepted: number;
  /** Energy charged (energyPerMineral × accepted). */
  readonly charged: number;
  /** Reserved energy returned unused (energyReserved − charged). */
  readonly returned: number;
}

/** Why an E11 action did or did not request this tick (tests and diagnostics; never saved). */
export type JacketOutcome = 'requested' | 'noSilicate' | 'held' | 'energy' | 'full';

/** Most dust a pinned cell may carry before it is set to 0 (anything larger is a defect). */
const PIN_DUST_MAX = 1e-12;

/** The E11 action applies to an organism whose genome carries a recorded E11. */
export const jacketApplies: Stage8Action['applies'] = (prof: Profile) => prof.jacket !== null;

/**
 * The mineral an E11 carrier would request now (0 when refused), with the outcome. A pure read of the
 * context's remaining budget, the carrier's columns and the silicate field (silicate only changes in the pass).
 */
export function jacketRequest(ctx: ActionContext): { readonly outcome: JacketOutcome; readonly amount: number; readonly cell: number } {
  const world = ctx.world;
  const i = ctx.i;
  const c = world.ents.cols;
  const prof = ctx.profile;
  const rules = prof.jacket;
  if (rules === null) throw new Error(`stage 8: organism slot ${i} has no E11 jacket rules`);
  const cell = entityCell(c.x[i]!, c.y[i]!);
  // E11 needs the silicate system (MODULE_SYSTEM_NEEDS), so a valid world never takes this branch.
  if (world.fields.silicate === undefined || !worldHasSystem(world, 'silicate')) return { outcome: 'noSilicate', amount: 0, cell };
  if (c.heldBySlot[i]! >= 0) return { outcome: 'held', amount: 0, cell };
  const remE = ctx.remainingEnergy();
  if (!(remE >= rules.minEnergy)) return { outcome: 'energy', amount: 0, cell };
  const deficit = rules.targetPerBody * c.B[i]! - c.jacketMineral[i]!;
  if (!(deficit > 0)) return { outcome: 'full', amount: 0, cell };
  let amount = Math.min(rules.buildRate * prof.b0 * DT, deficit);
  // Never reserve more energy than remains: at most what the remaining energy can pay at energyPerMineral.
  if (rules.energyPerMineral > 0 && rules.energyPerMineral * amount > remE) {
    amount = remE / rules.energyPerMineral;
    if (rules.energyPerMineral * amount > remE) amount -= amount * Number.EPSILON; // one rounding step down
  }
  if (!(amount > 0)) return { outcome: 'energy', amount: 0, cell };
  return { outcome: 'requested', amount, cell };
}

/**
 * The E11 action: request shared mineral binding, or refuse. Returns ENERGY_LOW when refused for energy, NONE
 * otherwise (a carrier has no saved refusal column; the outcome is in jacketRequest).
 */
export const jacketRun: Stage8Action['run'] = (ctx: ActionContext): number => {
  const r = jacketRequest(ctx);
  if (r.outcome === 'requested') {
    ctx.requestMineral(r.cell, r.amount, ctx.profile.jacket!.energyPerMineral);
    return R.NONE;
  }
  return r.outcome === 'energy' ? R.ENERGY_LOW : R.NONE;
};

/** Request indices in canonical order: cell ascending, then slot, then submission order. */
function canonicalOrder(requests: readonly MineralRequest[]): number[] {
  const order = requests.map((_, k) => k);
  order.sort((a, b) => requests[a]!.cell - requests[b]!.cell || requests[a]!.slot - requests[b]!.slot || a - b);
  return order;
}

/**
 * Resolve every mineral request submitted in this stage (one silicate snapshot, one commit). Returns the outcome
 * per request in canonical order (cell, slot). Throws on a malformed request or when a world without the
 * silicate field receives one. Returns at once (touching nothing) when nothing was requested.
 */
export function jacketPass(world: World, requests: readonly MineralRequest[]): MineralOutcome[] {
  if (requests.length === 0) return [];
  const silicate = world.fields.silicate;
  if (!silicate) throw new Error('stage 8: mineral requested in a world without the silicate system');
  const c = world.ents.cols;
  for (let k = 0; k < requests.length; k++) {
    const r = requests[k]!;
    if (c.alive[r.slot] !== 1) throw new Error(`stage 8: mineral request from empty slot ${r.slot}`);
    if (!(r.mineral > 0) || !Number.isFinite(r.mineral)) throw new Error(`stage 8: invalid mineral amount ${r.mineral}`);
    if (!(r.energyPerMineral >= 0) || !Number.isFinite(r.energyPerMineral)) throw new Error(`stage 8: invalid mineral energy rate ${r.energyPerMineral}`);
    if (!(r.energyReserved >= r.energyPerMineral * r.mineral)) throw new Error(`stage 8: mineral request from slot ${r.slot} reserves too little energy`);
    if (!(r.cell >= 0 && r.cell < silicate.length)) throw new Error(`stage 8: mineral cell ${r.cell} is outside the grid`);
  }
  const order = canonicalOrder(requests);

  // Read phase: every amount from the snapshot (silicate before any commit).
  const n = order.length;
  const accepted = new Float64Array(n);
  const groupStart: number[] = [];
  /** Whether the cell was scaled from a positive headroom (then it is pinned to exactly 0). */
  const groupScaled: boolean[] = [];
  let k = 0;
  while (k < n) {
    const cell = requests[order[k]!]!.cell;
    let end = k;
    let sum = 0;
    while (end < n && requests[order[end]!]!.cell === cell) {
      sum += requests[order[end]!]!.mineral;
      end++;
    }
    const headroom = Math.max(0, silicate[cell]!);
    const scaled = sum > headroom;
    const scale = scaled ? headroom / sum : 1;
    for (let q = k; q < end; q++) {
      const r = requests[order[q]!]!;
      accepted[q] = scaled ? r.mineral * scale : r.mineral;
    }
    groupStart.push(k);
    groupScaled.push(scaled && headroom > 0);
    k = end;
  }

  // Commit phase: all moves together.
  const EL = world.ledger.energy;
  const out: MineralOutcome[] = [];
  for (let g = 0; g < groupStart.length; g++) {
    const start = groupStart[g]!;
    const end = g + 1 < groupStart.length ? groupStart[g + 1]! : n;
    const cell = requests[order[start]!]!.cell;
    let moved = false;
    for (let q = start; q < end; q++) {
      const r = requests[order[q]!]!;
      const a = accepted[q]!;
      const charged = r.energyPerMineral * a;
      if (a > 0) {
        c.jacketMineral[r.slot]! += a;
        silicate[cell]! -= a;
        moved = true;
      }
      if (charged > 0) {
        c.E[r.slot]! -= charged;
        EL.construction += charged;
      }
      out.push({ slot: r.slot, cell, accepted: a, charged, returned: r.energyReserved - charged });
    }
    // A scaled cell ends at exactly 0; so does an unscaled one that a float subtraction left a few ulps below 0.
    if (groupScaled[g] || (moved && silicate[cell]! < 0)) {
      const dust = -silicate[cell]!;
      if (Math.abs(dust) > PIN_DUST_MAX) throw new Error(`stage 8: silicate in cell ${cell} missed 0 by ${dust} — allocation defect`);
      silicate[cell] = 0;
      world.ledger.roundoff.m += dust;
    }
  }
  markField(world, 'silicate');
  return out;
}

// ---- Observation: accepted this tick -----------------------------------------------------------

/** Per world: slot → birthId of an E11 carrier whose request was accepted (> 0 mineral) in the latest pass. */
// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated (a WeakMap cannot be)
const builtNow = new WeakMap<World, Float64Array>();

/**
 * Record which E11 carriers had mineral accepted by this tick's shared mineral pass (structures.ts calls it
 * right after jacketPass). Observation only.
 */
export function recordJacketBuilt(world: World, outcomes: readonly MineralOutcome[]): void {
  let rec = builtNow.get(world);
  if (rec !== undefined) rec.fill(0);
  const c = world.ents.cols;
  for (let k = 0; k < outcomes.length; k++) {
    const o = outcomes[k]!;
    if (!(o.accepted > 0)) continue;
    if (rec === undefined) {
      rec = new Float64Array(c.alive.length);
      builtNow.set(world, rec);
    }
    rec[o.slot] = c.birthId[o.slot]!;
  }
}

/** Whether organism `i` had E11 mineral accepted in the latest stage 8 pass (module card "active now"). */
export function jacketBuiltNow(world: World, i: number): boolean {
  const rec = builtNow.get(world);
  const c = world.ents.cols;
  return rec !== undefined && c.alive[i] === 1 && rec[i] !== 0 && rec[i] === c.birthId[i];
}

/** What the inspector shows for an organism's jacket (observation only). */
export interface JacketView {
  /** Jacket mineral held. */
  readonly mineral: number;
  /** Its target now: targetPerBody × current B. */
  readonly target: number;
  /** Coverage c = jacketCoverage(mineral, B), 0..1. */
  readonly coverage: number;
  /** The stage 4 speed factor 1 − speedPenalty × c (1 without a jacket). */
  readonly speedFactor: number;
}

/**
 * The jacket view of organism `i`, or null when it neither carries E11 nor holds a jacket. A jacket left on
 * an organism without E11 (an imported dish) shows with no target and the plain speed factor 1.
 */
export function jacketView(world: World, i: number): JacketView | null {
  const c = world.ents.cols;
  if (c.alive[i] !== 1) return null;
  const rules = profileOf(world, i).jacket;
  const mineral = c.jacketMineral[i]!;
  if (rules === null && !(mineral > 0)) return null;
  const B = c.B[i]!;
  const coverage = jacketCoverage(mineral, B);
  return {
    mineral,
    target: rules === null ? 0 : rules.targetPerBody * B,
    coverage,
    speedFactor: rules !== null && mineral > 0 ? 1 - rules.speedPenalty * coverage : 1,
  };
}
