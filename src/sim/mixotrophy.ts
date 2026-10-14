/**
 * A04 mixotrophy and A03's low-light curve (Phase 5 wave 12, P5.3 E2-LIGHT-ALGAE; SPEC §3.2 row 4, §6.4,
 * §6.5 route 2, §7.10; CT §1.2, §3.1; D-0106).
 *
 * Saved mode (entities.ts metabolicMode: 0 none, 1 Photo, 2 Sugar; protocol 3's CUE3 mode values). A
 * MIXOTROPHY organism's mode is set in stage 4, right after its suitability and before the life-state
 * overrides (SPEC §3.2 row 4), from the effective light stage 2 of the same tick computed (D-0113):
 *  - initialization: an organism with mode 0 (just introduced: inoculation, recipe founder or specimen,
 *    all through commands.ts introduceOrganism, which writes no mode) takes Photo at light ≥ 0.35, else
 *    Sugar. It runs at its first stage 4, in the tick it was introduced (stage 1 reads no light: the
 *    invariant in climate.ts's header that keeps a reload identical), so no Active A04 reaches stage 6
 *    with mode 0;
 *  - hysteresis: Photo at light ≥ 0.35, Sugar at light ≤ 0.25, otherwise the saved mode is kept. The
 *    thresholds are inclusive and compared exactly on the stored light (no tolerance);
 *  - a switch (Photo ↔ Sugar, never from 0) emits one 'modeSwitch' (cause R.MODE_PHOTO / R.MODE_SUGAR,
 *    detail.light). Initialization and birth emit nothing: a first mode is a state, not a transition;
 *  - a newborn (births.ts commitDivision) takes nextMode(its own cell's light, the parent's mode): Photo
 *    at ≥ 0.35, Sugar at ≤ 0.25, else the parent's (D-0106).
 *
 * Gating (D-0103): a world whose species table holds no mixotroph never calls updateMode (hasMixotroph is
 * cached per species table, keyed on the metabolism a species records, never on a build constant).
 * Nothing here draws randomness.
 */
import { LOW_LIGHT_SATURATION, MODE_PHOTO_LIGHT, MODE_SUGAR_LIGHT } from './constants';
import { emit } from './events';
import { R } from './reasons';
import type { SpeciesRT } from './species';
import type { World } from './world';

/** metabolicMode values (entities.ts; protocol.ts CUE3 mode field). */
export const MODE_NONE = 0;
export const MODE_PHOTO = 1;
export const MODE_SUGAR = 2;

/** The first mode of an organism without one (SPEC §7.10 "initialized from light ≥ 0.35"). */
export function initialMode(light: number): number {
  return light >= MODE_PHOTO_LIGHT ? MODE_PHOTO : MODE_SUGAR;
}

/**
 * The saved mode after reading `light` (SPEC §7.10): Photo at ≥ 0.35, Sugar at ≤ 0.25, else `mode` held
 * (an organism without a mode is initialized). Also the newborn rule with the parent's mode (D-0106).
 */
export function nextMode(light: number, mode: number): number {
  return light >= MODE_PHOTO_LIGHT ? MODE_PHOTO : light <= MODE_SUGAR_LIGHT ? MODE_SUGAR : mode === MODE_NONE ? initialMode(light) : mode;
}

/** A03 (LOW_LIGHT_CURVE) light response: min(1, light / 0.30) (SPEC §6.5 route 2; CT §1.2). */
export function lowLightResponse(light: number): number {
  return Math.min(1, light / LOW_LIGHT_SATURATION);
}

// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated
const mixotrophCache = new WeakMap<readonly SpeciesRT[], boolean>();

/** Whether this world's species table records a mixotroph (cached per table; never a build constant). */
export function hasMixotroph(world: Pick<World, 'species'>): boolean {
  let f = mixotrophCache.get(world.species);
  if (f === undefined) {
    f = world.species.some((sp) => sp.mixotroph);
    mixotrophCache.set(world.species, f);
  }
  return f;
}

/**
 * Stage 4 mode update of one living mixotroph in `cell` (movement.ts stageSenseAndMove). Reads the light
 * stage 2 of this tick computed; emits 'modeSwitch' only for a Photo ↔ Sugar change.
 */
export function updateMode(world: World, i: number, cell: number): void {
  const c = world.ents.cols;
  const old = c.metabolicMode[i]!;
  const light = world.derived.light[cell]!;
  const mode = nextMode(light, old);
  if (mode === old) return;
  c.metabolicMode[i] = mode;
  if (old === MODE_NONE) return;
  emit(world.events, world.counters, {
    tick: world.tick,
    type: 'modeSwitch',
    species: c.species[i]!,
    birthId: c.birthId[i]!,
    cell,
    cause: mode === MODE_PHOTO ? R.MODE_PHOTO : R.MODE_SUGAR,
    detail: { light },
  });
}
