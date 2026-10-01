/**
 * E10 Matrix builder (SPEC §7.1, §9 E10; CT §7.1, §12.6; D04 §2 C08, §6 E10, §9 and §13 "Two matrix
 * builders fill the same cell"; D-0045, D-0047; P3.7).
 *
 * Stage 8 module action E10 (actions.ts, after E09). While the carrier is Active (stage 8 runs the
 * table only for Active organisms), its energy REMAINING this tick is above the recorded minEnergy
 * (35), its body carbon remaining this tick is above minBodyMultiple × B0' (1.2) and the film in its
 * cell is below the recorded filmCap (0.50), it requests
 *
 *     min(rate × dt, remainingBody − 1.2 B0', filmCap − film, remainingEnergy / energyPerCarbon)
 *
 * body carbon through ActionContext.requestConstruction(cell, amount, energyPerCarbon): the request
 * holds the carbon and its full energy cost (2 E per C) against every later action of this organism.
 * The shared construction pass (construction.ts) then resolves every builder of the tick — B02 and
 * every E10 carrier alike — from one film snapshot with proportional headroom, commits all moves
 * together, charges 2 E per ACCEPTED carbon only (ledger.energy.construction) and returns the rest of
 * each reservation; N moves with the carbon in proportion (N × accepted / B). Nothing else: no extra
 * protection, no film rule of its own, the film belongs to no one (SPEC §7.1).
 *
 * The film system is gated on the world's own recorded manifest (worldHasSystem 'film' and an
 * allocated film field), never on a build constant; a world without film never builds.
 *
 * Observation (never read by the simulation, never hashed or saved): which organisms had an E10
 * request accepted in the latest stage 8 pass, keyed by world and verified by birthId, for the module
 * card's "active now" (moduleView.ts). A reloaded world starts with none until its next tick.
 */
import { DT } from './constants';
import type { ActionContext, Stage8Action } from './actions';
import type { ConstructionOutcome } from './construction';
import { worldHasSystem } from './gates';
import type { Profile } from './phenotype';
import { profileOf } from './profiles';
import { R } from './reasons';
import { entityCell } from './spatial';
import type { World } from './world';

/** Why an E10 action did or did not request this tick (tests and diagnostics; never saved). */
export type MatrixOutcome = 'requested' | 'noFilmSystem' | 'energy' | 'body' | 'filmFull';

/** The E10 action applies to an organism whose builder rules came from E10. */
export const matrixApplies: Stage8Action['applies'] = (prof: Profile) => prof.builder !== null && prof.builder.source === 'E10';

/**
 * The body carbon an E10 carrier would request now (0 when refused), with the outcome. A pure read of
 * the context's remaining budget and the film snapshot (film only changes in the shared pass).
 */
export function matrixRequest(ctx: ActionContext): { readonly outcome: MatrixOutcome; readonly amount: number; readonly cell: number } {
  const world = ctx.world;
  const i = ctx.i;
  const c = world.ents.cols;
  const prof = ctx.profile;
  const rules = prof.builder;
  if (rules === null || rules.source !== 'E10') throw new Error(`stage 8: organism slot ${i} has no E10 builder rules`);
  const cell = entityCell(c.x[i]!, c.y[i]!);
  const film = world.fields.film;
  if (film === undefined || world.fields.filmN === undefined || !worldHasSystem(world, 'film')) return { outcome: 'noFilmSystem', amount: 0, cell };
  const remE = ctx.remainingEnergy();
  if (!(remE > rules.minEnergy)) return { outcome: 'energy', amount: 0, cell };
  const bodyRoom = ctx.remainingBody() - rules.bodyFloor * prof.b0;
  if (!(bodyRoom > 0)) return { outcome: 'body', amount: 0, cell };
  const cap = rules.filmCap ?? 0;
  const filmRoom = cap - film[cell]!;
  if (!(filmRoom > 0)) return { outcome: 'filmFull', amount: 0, cell };
  let amount = Math.min(rules.ratePerSecond * DT, bodyRoom, filmRoom);
  // Never reserve more energy than remains: at most what the remaining energy can pay at energyPerC.
  if (rules.energyPerC > 0 && rules.energyPerC * amount > remE) {
    amount = remE / rules.energyPerC;
    if (rules.energyPerC * amount > remE) amount -= amount * Number.EPSILON; // one rounding step down
  }
  if (!(amount > 0)) return { outcome: 'energy', amount: 0, cell };
  return { outcome: 'requested', amount, cell };
}

/**
 * The E10 action: request shared construction, or refuse. Returns ENERGY_LOW when refused for energy,
 * NONE otherwise (a builder has no saved refusal column; the outcome is in matrixRequest).
 */
export const matrixRun: Stage8Action['run'] = (ctx: ActionContext): number => {
  const r = matrixRequest(ctx);
  if (r.outcome === 'requested') {
    ctx.requestConstruction(r.cell, r.amount, ctx.profile.builder!.energyPerC);
    return R.NONE;
  }
  return r.outcome === 'energy' ? R.ENERGY_LOW : R.NONE;
};

// ---- Observation: accepted this tick -----------------------------------------------------------

/** Per world: slot → birthId of an E10 carrier whose request was accepted (> 0 C) in the latest pass. */
// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated (a WeakMap cannot be)
const builtNow = new WeakMap<World, Float64Array>();

/**
 * Record which E10 carriers had carbon accepted by this tick's shared construction pass (structures.ts
 * calls it right after constructionPass). Observation only.
 */
export function recordMatrixBuilt(world: World, outcomes: readonly ConstructionOutcome[]): void {
  let rec = builtNow.get(world);
  if (rec !== undefined) rec.fill(0);
  const c = world.ents.cols;
  for (let k = 0; k < outcomes.length; k++) {
    const o = outcomes[k]!;
    if (!(o.accepted > 0)) continue;
    if (!matrixApplies(profileOf(world, o.slot), world, o.slot)) continue;
    if (rec === undefined) {
      rec = new Float64Array(c.alive.length);
      builtNow.set(world, rec);
    }
    rec[o.slot] = c.birthId[o.slot]!;
  }
}

/** Whether organism `i` had an E10 request accepted in the latest stage 8 pass (module card "active now"). */
export function matrixBuiltNow(world: World, i: number): boolean {
  const rec = builtNow.get(world);
  const c = world.ents.cols;
  return rec !== undefined && c.alive[i] === 1 && rec[i] !== 0 && rec[i] === c.birthId[i];
}
