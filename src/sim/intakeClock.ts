/**
 * The usable-intake clock (D-0035; SPEC §9 E04 and E12 "10 s without intake"; P3.7).
 *
 * `noUsableIntakeSeconds` counts the seconds since the organism's last usable intake under D-0019's
 * 1 % rule: stage 6 (intake.ts, parasites.ts) sets FLAG.usableIntake on a tick whose intake reached
 * USABLE_INTAKE_FRACTION of the intake ceiling. Diffusion traces therefore never reset it, unlike
 * `lastIntakeTick`.
 *
 * It is advanced once per tick per living organism from stage 8's release hook (actions.ts
 * releaseInvalidLinks), before the E04 and E12 detach checks read it, and only for an organism whose
 * genome carries E04 or E12: for everyone else the column is never written, so it stays at its empty
 * value 0 and stateHash stays hash-neutral (D-0035) for worlds without those modules.
 */
import { DT } from './constants';
import { FLAG } from './entities';
import type { Profile } from './phenotype';
import type { World } from './world';

/** The modules whose rules read the clock (SPEC §9 E04 detach, E12 sever). */
const CLOCK_MODULES: readonly string[] = ['E04', 'E12'];

/** Whether this organism's genome carries a module that reads the usable-intake clock. */
export function readsIntakeClock(prof: Profile): boolean {
  const mods = prof.modules;
  for (let k = 0; k < mods.length; k++) if (CLOCK_MODULES.includes(mods[k]!)) return true;
  return false;
}

/** Advance (no usable intake this tick) or reset (usable intake) the clock of one living organism. */
export function advanceIntakeClock(world: World, i: number, prof: Profile): void {
  if (!readsIntakeClock(prof)) return;
  const c = world.ents.cols;
  if ((c.flags[i]! & FLAG.usableIntake) !== 0) c.noUsableIntakeSeconds[i] = 0;
  else c.noUsableIntakeSeconds[i]! += DT;
}
