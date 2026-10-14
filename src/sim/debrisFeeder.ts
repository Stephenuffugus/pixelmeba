/**
 * E08 Debris feeder (SPEC §6.4, §6.5, §9 E08; CT §3.1 "E08 carriers detritus when no meal", §7.1;
 * D04 §5 "E08 Debris feeder", §13 "Detritus feeder captures live prey"; P3.7), and P09 Wheelgrazer's
 * native DETRITUS_FALLBACK (Phase 5 wave 12; SPEC §6.5 route 1 "meal-else-detritus"; CT §1.2 P09).
 *
 * Both set Profile.debrisFeeder (phenotype.ts deriveProfile) and share everything below; "carrier" means
 * either. P09 is not eligible for E08: its fallback is its own native ability, so the module card, its
 * guide notes (moduleNotes.ts, which tries only E08's eligible ancestors) and its feature mark (the
 * debris granule needs the E08 cue bit, render/features.ts) never describe P09's detritus intake as E08.
 * Before wave 12 P09 already reached detritus through its foodPriority ['detritus'] on the ordinary field
 * route, with the same request min(P, budget × avail(P)); the fallback changes the route (ROUTE_DETRITUS),
 * its cue (FLAG.detritusIntake) and its label ("Eating detritus"), not the amount.
 *
 * - Intake (stage 6, intake.ts): with no held meal (mealC = 0) a carrier may request local detritus,
 *   with its bound detritusN, under its ordinary budget (ceiling × suitability, halved over capacity):
 *   `min(P, budget × avail(P))`, the field-feeding request for a single food. Conversion is the
 *   carrier's ordinary aerobic one (O2 0.30 per C, 30 E per C) and the N rules of field feeding (bound
 *   N first, surplus bound N back to the cell). A held meal has exclusive priority. A capture in stage 5
 *   fills mealC (contacts.ts consumePrey takes min(prey B, room) > 0 into the meal), so stage 6 takes the
 *   meal route on the capture tick and the detritus request never forms.
 * - It grants digestion, never new prey: the prey list stays the ancestor's (CT §3.2).
 * - Movement (stage 4, movement.ts foodScore): F = max(existing F, avail(detritus)), never a sum.
 *   Pursuit of a valid prey runs before decide(), so a prey in range keeps priority.
 *
 * Nothing here draws randomness. A world without carriers never reaches any of it, so every shipped
 * world (no E08 and no P09 in its manifest) runs bit-identically.
 */
import { AVAIL_K } from './constants';
import type { Profile } from './phenotype';
import type { World } from './world';

function availOf(a: number): number {
  return a <= 0 ? 0 : a / (a + AVAIL_K);
}

/**
 * Detritus carbon a carrier (E08 or DETRITUS_FALLBACK) requests in its cell this tick, or 0 when it takes no detritus
 * route: not a carrier, a held meal (exclusive priority), or no detritus here.
 */
export function debrisRequest(world: World, prof: Profile, mealC: number, cell: number, budget: number): number {
  if (!prof.debrisFeeder || mealC > 0 || budget <= 0) return 0;
  const det = world.fields.detritus;
  if (!det) return 0;
  const P = det[cell]!;
  if (P <= 0) return 0;
  return Math.min(P, budget * availOf(P));
}

/** Detritus movement score of a cell for an E08 carrier: amount / (amount + 0.10); 0 for anyone else. */
export function debrisScore(world: World, prof: Profile, cell: number): number {
  if (!prof.debrisFeeder) return 0;
  const det = world.fields.detritus;
  return det ? availOf(det[cell]!) : 0;
}

/** The food score with E08's detritus term: the larger of the two, never their sum (SPEC §6.4). */
export function withDebrisScore(world: World, prof: Profile, cell: number, F: number): number {
  if (!prof.debrisFeeder) return F;
  return Math.max(F, debrisScore(world, prof, cell));
}
