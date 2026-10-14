/**
 * Predation handling and radius capture (Phase 5 wave 12, P5.5 E3-PREDATION; SPEC §3.2 row 5, §7.3, §9 E11,
 * §9.19; CT §3.2, §6.2, §12.5; D02 381–383; D04 155; D-0106, D-0122).
 *
 * - HANDLING (P10): a capture needs continuous contact with one target. The attempt's need is sampled when
 *   the attempt starts and kept until contact breaks: the prey's contactSeconds (CT §3.2: P01, P02, P07
 *   1 s; P05 4 s), or 1 + 3c s for a prey wearing an E11 jacket (c = its coverage at that moment; CT
 *   §12.5, D04 155). A need of 0 is an ordinary instant claim. The start tick counts as the first contact
 *   tick, so a 1 s need completes on the 10th consecutive contact tick (D-0122). A break (the target out
 *   of contact, gone, no longer allowed or behind a refusing edge; the handler left Active or stopped
 *   being hungry; another claimant took the prey) zeroes need and progress together with one
 *   'handlingBreak' event; nothing else changes (no cooldown: it starts only after a capture, contacts.ts
 *   consumePrey). The target is not immobilized. The attempt's state lives in the existing columns:
 *   preySlot/preyBirthId (the target), handlingProgress (seconds held, hashed since v1.0) and handlingNeed
 *   (schema 5, hash-neutral while 0).
 * - RADIUS_CAPTURE (P06): the contact test uses a fixed centre distance of 1.0 cell (inclusive, Euclidean)
 *   instead of 0.5; a rule, not sensing (CT §6.2).
 *
 * Both tables are cached per species table (a WeakMap keyed on world.species, as climate.ts canopySpecies
 * does) and are null when no species of the world's recorded manifest has the ability, so a world without
 * them never reads a new column in the claim loop (D-0103). Nothing here draws randomness.
 *
 * Tick-boundary invariant (asserted by tests): handlingNeed > 0 implies 0 < handlingProgress < handlingNeed
 * and preySlot >= 0 (the reference may be stale after a later-stage death); handlingNeed === 0 implies
 * handlingProgress === 0. The import (persistence/phase5State.ts) refuses part of the rest: a negative need
 * or progress, either on a species without HANDLING, progress without a need, and progress >= need. It
 * accepts the unreachable remainder (a need with progress 0, a need with no prey slot, an outsized need),
 * which loads and runs deterministically (wave 12 lead ruling).
 */
import { DT, HANDLING_JACKET_BASE_SECONDS, HANDLING_JACKET_SECONDS_PER_COVERAGE, JACKET_COVERAGE_FRACTION } from './constants';
import { emit } from './events';
import { R } from './reasons';
import { entityCell } from './spatial';
import type { NativeAbilityId } from './content/schema';
import type { SpeciesRT } from './species';
import type { World } from './world';

/** Timer comparisons tolerate float accumulation of DT (0.1 is not exact in binary); the dormancy.ts EPS. */
export const HANDLING_EPS = 1e-9;

/** Why an attempt ended without a capture ('handlingBreak' detail.why), or 'capture' (no event). */
export type HandlingEnd = 'contact' | 'target' | 'hunger' | 'taken' | 'rest' | 'division' | 'capture';

/** Jacket coverage c = min(1, max(0, jacketMineral / (0.10 × B))); 0 when B ≤ 0 (SPEC §9 E11). */
export function jacketCoverage(jacketMineral: number, B: number): number {
  if (B <= 0) return 0;
  return Math.min(1, Math.max(0, jacketMineral / (JACKET_COVERAGE_FRACTION * B)));
}

/**
 * Seconds of continuous contact predator species `predSp` needs to capture `prey` now: 1 + 3c for a
 * jacketed prey (jacketMineral > 0), else the prey list's contactSeconds (0 = an instant claim).
 */
export function handlingNeedOf(world: World, predSp: SpeciesRT, prey: number): number {
  const c = world.ents.cols;
  const jacket = c.jacketMineral[prey]!;
  if (jacket > 0) return HANDLING_JACKET_BASE_SECONDS + HANDLING_JACKET_SECONDS_PER_COVERAGE * jacketCoverage(jacket, c.B[prey]!);
  return predSp.preyContact[c.species[prey]!]!;
}

// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated
const handlingFlags = new WeakMap<readonly SpeciesRT[], Uint8Array | null>();
// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated
const radiusFlags = new WeakMap<readonly SpeciesRT[], Uint8Array | null>();

function abilityTable(cache: WeakMap<readonly SpeciesRT[], Uint8Array | null>, species: readonly SpeciesRT[], ability: NativeAbilityId): Uint8Array | null {
  let f = cache.get(species);
  if (f === undefined) {
    const flags = Uint8Array.from(species, (sp) => (sp.isPredator && sp.abilities.includes(ability) ? 1 : 0));
    f = flags.includes(1) ? flags : null;
    cache.set(species, f);
  }
  return f;
}

/** Per species index: 1 for a predator with HANDLING; null when the world records none. */
export function handlingSpecies(world: Pick<World, 'species'>): Uint8Array | null {
  return abilityTable(handlingFlags, world.species, 'HANDLING');
}

/** Per species index: 1 for a predator with RADIUS_CAPTURE; null when the world records none. */
export function radiusCaptureSpecies(world: Pick<World, 'species'>): Uint8Array | null {
  return abilityTable(radiusFlags, world.species, 'RADIUS_CAPTURE');
}

/**
 * Open an attempt by handler `i` on `prey` with `need` seconds (> 0): the target, the need, and the start
 * tick counted as the first contact tick (progress = DT); one 'handlingStart' event.
 */
export function startAttempt(world: World, i: number, prey: number, need: number): void {
  const c = world.ents.cols;
  c.preySlot[i] = prey;
  c.preyBirthId[i] = c.birthId[prey]!;
  c.handlingNeed[i] = need;
  c.handlingProgress[i] = DT;
  emit(world.events, world.counters, {
    tick: world.tick,
    type: 'handlingStart',
    species: c.species[i]!,
    birthId: c.birthId[i]!,
    cell: entityCell(c.x[i]!, c.y[i]!),
    cause: R.PRED_HANDLING_IN_PROGRESS,
    detail: { prey: c.birthId[prey]!, preySpecies: c.species[prey]!, need },
  });
}

/**
 * End handler `i`'s open attempt (no-op without one): one 'handlingBreak' with the progress held, unless it
 * ended in a capture; then need and progress are 0 together. preySlot is untouched, so the predator keeps
 * pursuing (movement cancels an invalid target at its next stage 4).
 */
export function endAttempt(world: World, i: number, why: HandlingEnd): void {
  const c = world.ents.cols;
  if (!(c.handlingNeed[i]! > 0)) return;
  if (why !== 'capture') {
    emit(world.events, world.counters, {
      tick: world.tick,
      type: 'handlingBreak',
      species: c.species[i]!,
      birthId: c.birthId[i]!,
      cell: entityCell(c.x[i]!, c.y[i]!),
      detail: { prey: c.preyBirthId[i]!, why, progress: c.handlingProgress[i]! },
    });
  }
  c.handlingNeed[i] = 0;
  c.handlingProgress[i] = 0;
}
