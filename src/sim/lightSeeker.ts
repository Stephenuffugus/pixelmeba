/**
 * E07 Light seeker (SPEC §6.4, §6.7, §9 E07; CT §7.1; D04 §5 "E07 Light seeker" and §13 "A light
 * seeker is trapped or resting"; BUILD_DIRECTIVE P3.7).
 *
 *  - Phenotype (phenotype.ts): the recorded baseSpeed (0.15 cells/s) and lightSensing (2 cells) become
 *    the mapped baselines of the motility and sensing loci, which E07 activates at their stored values
 *    (activeLoci); the profile is self-propelled (Profile.selfPropelled).
 *  - Decision (movement.ts decide, every 0.5 s while Active, unheld and unanchored): the ordinary
 *    candidate solver (same candidates, edge-checked trace, habitat rules) with F = effective light
 *    (world.derived.light) in 0.5·F + 0.4·S − 0.1·C. Only its own cell and cells brighter than it by
 *    at least brighterBy (0.01) are candidates (`brightEnough`); with no brighter cell it stays (no
 *    wander). Ties use the ordinary det(seed, 'tiebreak', tick, birthId). No crowd avoidance beyond
 *    −0.1·C.
 *  - Cost (stage 7, `movementCost`): moveCostFactor × (0.5 + g_mot)² × dt (0.10 × (0.5 + g)² E/s) on
 *    every tick it actually self-propels (moved > 0), and nothing on a tick it stays, is blocked by a
 *    wall, is resting or is anchored. It replaces the per-cell cost, never both (SPEC §6.7).
 *  - Loss: a daughter without E07 is not self-propelled and stays in its current valid cell.
 */
import { DT, MOVE_COST_PER_CELL } from './constants';
import type { Profile } from './phenotype';
import type { World } from './world';

/** Float tolerance for the brighter-by comparison (light values are sums of products of decimals). */
const LIGHT_EPS = 1e-12;

/**
 * Stage 7 movement energy for this tick. For a non-E07 profile this is exactly the ordinary
 * MOVE_COST_PER_CELL × distance × motility factor; for an E07 carrier the per-second cost on a tick it
 * moved, else 0.
 */
export function movementCost(world: World, i: number, prof: Profile): number {
  const moved = world.ents.cols.movedThisTick[i]!;
  const seeker = prof.lightSeeker;
  if (seeker === null) return MOVE_COST_PER_CELL * moved * prof.motilityFactor;
  return moved > 0 ? lightSeekerCostPerSecond(prof) * DT : 0;
}

/** E07 self-propulsion cost per second while moving: moveCostFactor × (0.5 + g_mot)² (0 for non-carriers). */
export function lightSeekerCostPerSecond(prof: Profile): number {
  const seeker = prof.lightSeeker;
  if (seeker === null) return 0;
  return seeker.moveCostFactor * prof.motilityFactor * prof.motilityFactor;
}

/** Whether `cell` is bright enough to be a light seeker's candidate: at least brighterBy over its own cell. */
export function brightEnough(world: World, prof: Profile, own: number, cell: number): boolean {
  const light = world.derived.light;
  return light[cell]! - light[own]! >= prof.lightSeeker!.brighterBy - LIGHT_EPS;
}

/** The decision's food term for a light seeker: the effective light at the cell. */
export function lightScore(world: World, cell: number): number {
  return world.derived.light[cell]!;
}
