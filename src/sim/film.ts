/**
 * Biofilm (SPEC §7.1; CT §3.5, §12.6, §13 film row; D-0008, D-0038, D-0045; P3.3).
 *
 * Film is a per-cell carbon deposit (`film`) with its bound nutrient (`filmN`). It has no owner and is
 * not an organism. It exists only in worlds whose recorded manifest enables the film system (the
 * fields are allocated from that manifest), so every rule here is gated on the world, never on a
 * build constant: a g2 save never gains film.
 *
 * Native B02 deposition (stage 8, action table entry BIOFILM, actions.ts):
 *   - `filmSeconds` counts continuous seconds the builder has been Active on one of its attachment
 *     surfaces. It resets to 0 when it is not on a surface (here) or not Active (stage 2,
 *     transport.ts `filmStage`, because stage 8 runs actions only for Active organisms).
 *   - Once 10 s are complete (the clock is read before this tick's second is added, so the first
 *     deposit happens on the 101st attached tick), while the energy remaining this tick is above 40:
 *     request min(0.05 × dt, remainingBody − B0') body carbon for the shared construction pass, only
 *     when that amount is positive. construction.ts applies the 0.50 per-cell headroom shared
 *     proportionally with every builder and moves N at N/B. Native film costs no energy
 *     (energyPerC 0; SPEC §7.1 and CT §12.6 name none — E10's 2 E/C is its own; proposed decision).
 *
 * Film effects implemented elsewhere: halved dissolved transport across every edge of a film cell
 * (transport.ts filmCoefficients), combined inhibitor exposure halved once (suitability.ts
 * inhibitorExposure, D-0008), decay of 0.1 %/s of C and N into detritus (transport.ts filmStage).
 *
 * Film as food (D-0038, CT §3.5): species flagged `digestsFilm` (B04, F01) eat film "as detritus",
 * only in worlds with the film system and only where film is present. Film never joins `sp.foods`
 * (preference mutations draw over sp.foods), so intake adds at most one film request: after the listed
 * foods under the ordered policy, or with the species' detritus weight under the weighted policy.
 * No film in the cell means no request at all, so film-free cells and worlds run bit-identically.
 */
import { AVAIL_K, DT } from './constants';
import type { ActionContext } from './actions';
import { attachmentBits, onAttachmentSurface } from './attachment';
import { worldHasSystem } from './gates';
import type { Profile } from './phenotype';
import { R } from './reasons';
import type { SpeciesRT } from './species';
import { entityCell } from './spatial';
import type { World } from './world';

/** Seconds attached and Active before a native film builder starts depositing (CT §12.6). */
export const FILM_ATTACH_SECONDS = 10;
/** Native film: energy must be above this (CT §12.6). */
export const FILM_MIN_ENERGY = 40;
/** Native film: body carbon offered per second (CT §12.6). */
export const FILM_RATE_PER_SECOND = 0.05;
/** Film decay: fraction of film C and N moved into detritus per second (CT §12.6, §13). */
export const FILM_DECAY_PER_SECOND = 0.001;

/** Timer tolerance (as dormancy.ts): a clock summed in 0.1 s steps counts as complete within 1e-9. */
const EPS = 1e-9;

// ---- Stage 8: native deposition ----------------------------------------------------------------

/** The BIOFILM action applies to an organism whose builder rules are native (B02). */
export function biofilmApplies(prof: Profile): boolean {
  return prof.builder !== null && prof.builder.source === 'native';
}

/** Whether organism `i` sits on one of its own attachment surfaces now. */
export function onOwnSurface(world: World, i: number): boolean {
  const c = world.ents.cols;
  const bits = attachmentBits(world.species[c.species[i]!]!.def);
  return bits >= 0 && onAttachmentSurface(world, bits, entityCell(c.x[i]!, c.y[i]!));
}

/**
 * One tick of native film building for the Active organism in `ctx` (stage 8). Returns a reason code
 * (NONE; the action has no player-facing refusal code of its own).
 */
export function biofilmRun(ctx: ActionContext): number {
  const world = ctx.world;
  const i = ctx.i;
  const c = world.ents.cols;
  const prof = ctx.profile;
  const rules = prof.builder;
  if (rules === null) throw new Error(`stage 8: organism slot ${i} has no builder rules`);
  if (!onOwnSurface(world, i)) {
    c.filmSeconds[i] = 0;
    return R.NONE;
  }
  // The seconds completed before this tick decide; then this tick's attached second is counted.
  const held = c.filmSeconds[i]!;
  c.filmSeconds[i] = Math.min(FILM_ATTACH_SECONDS, held + DT);
  if (held < FILM_ATTACH_SECONDS - EPS) return R.NONE;
  if (world.fields.film === undefined || !worldHasSystem(world, 'film')) return R.NONE;
  if (ctx.remainingEnergy() <= rules.minEnergy) return R.NONE;
  const amount = Math.min(rules.ratePerSecond * DT, ctx.remainingBody() - rules.bodyFloor * prof.b0);
  if (amount > 0) ctx.requestConstruction(entityCell(c.x[i]!, c.y[i]!), amount, rules.energyPerC);
  return R.NONE;
}

// ---- Stage 6: film as food (D-0038) ------------------------------------------------------------

/** Film this species may eat in `cell` (0 for a non-digester, a world without the film system, or no film). */
export function edibleFilmAt(world: World, sp: SpeciesRT, cell: number): number {
  if (!sp.def.digestsFilm) return 0;
  const film = world.fields.film;
  if (film === undefined || !worldHasSystem(world, 'film')) return 0;
  return film[cell]!;
}

function availability(a: number): number {
  return a <= 0 ? 0 : a / (a + AVAIL_K);
}

/**
 * Ordered policy: the film request after the listed foods, from the budget `rem` they left
 * (min(rem × avail(film), film); 0 when nothing is left or there is no edible film).
 */
export function orderedFilmRequest(world: World, sp: SpeciesRT, cell: number, rem: number): number {
  const P = edibleFilmAt(world, sp, cell);
  if (P <= 0 || !(rem > 0)) return 0;
  return Math.min(rem * availability(P), P);
}

/** Weighted policy: film is eaten as detritus, with the weight this genome gives detritus (0 if it lists none). */
export function filmWeight(prof: Profile): number {
  if (prof.weights === null) return 0;
  const k = prof.foods.indexOf('detritus');
  return k < 0 ? 0 : (prof.weights[k] ?? 0);
}

/** Weighted policy: the film request, min(film, budget × (w / W) × avail(film)), as for every listed food. */
export function weightedFilmRequest(P: number, budget: number, w: number, W: number): number {
  if (P <= 0 || w <= 0 || W <= 0) return 0;
  return Math.min(P, budget * (w / W) * availability(P));
}
