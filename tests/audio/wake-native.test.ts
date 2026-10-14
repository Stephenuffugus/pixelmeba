/**
 * Phase 5 wave 12 (structures-art-audio): wake coalescing for the native resters (D-0112's audit: "the generic
 * dormancy step emits 'wake' for native resters too, and cues.ts coalesces wakes into one cue within the world
 * budget"; UX §8.1 "≤ 4 world cues/s; coalesce repeats").
 *   - Under resterRegistry() (the shipped manifest plus B12, F04, P08, V02, X02 and the Phase 5 systems), two each
 *     of B12 Sleeper, F04 Sporeveil and P08 Waterbear, put by hand at the end of Waking so they wake together,
 *     emit one 'wake' event each in the same tick; snapshot visualEvents passes them; worldCueCounts maps them
 *     to wake (none to division).
 *   - The rate limiter (fake clock, the game's per-cue gaps) plays ONE wake cue for them within the 1000 ms
 *     coalescing window and plays again for a wake 1.5 s later.
 *   - Wakes are not division cues: a bacterial (B12) wake is not silenced by the bacterial-division rule.
 */
import { describe, expect, it } from 'vitest';
import { coalesceMsOf, isWorldCue, WORLD_CUE_COALESCE_MS } from '../../src/audio/patches';
import { CueRateLimiter } from '../../src/audio/rateLimiter';
import { divisionAudible, worldCueCounts } from '../../src/audio/cues';
import { LIFE_ACTIVE, LIFE_WAKING } from '../../src/sim/entities';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { visualEvents } from '../../src/worker/snapshot';
import { clearWater, place, resterRegistry } from '../helpers/world';

const RESTERS = ['B12', 'F04', 'P08'] as const;
const REG = resterRegistry();
/** Each species' recorded category in the dish's species order (as the host's DishInfo.speciesCategories). */
const categoriesOf = (w: World): string[] => w.species.map((s) => REG.species[s.id]!.category);

/** Two of each native rester at the very end of Waking: the next step wakes all six together. */
function wakingDish(): { w: World; slots: number[] } {
  const w = clearWater({}, REG);
  const slots: number[] = [];
  RESTERS.forEach((id, k) => {
    for (let j = 0; j < 2; j++) slots.push(place(w, id, 50.5 + 6 * k, 60.5 + 6 * j, { E: 40 }));
  });
  const c = w.ents.cols;
  for (const s of slots) {
    c.lifeState[s] = LIFE_WAKING;
    c.stateTimer[s] = 1e6; // past every species' wakeSeconds
  }
  return { w, slots };
}

describe('native resters wake: one wake event each, one coalesced cue', () => {
  it('B12, F04 and P08 woken in the same tick emit one wake event each; visualEvents passes them; the cue counter maps them to wake', () => {
    const { w, slots } = wakingDish();
    const since = w.counters.nextEventId - 1;
    step(w);
    const c = w.ents.cols;
    for (const s of slots) expect(c.lifeState[s]).toBe(LIFE_ACTIVE);
    const wakes = w.events.ring.filter((e) => e.id > since && e.type === 'wake');
    expect(wakes.map((e) => e.birthId!).sort((a, b) => a - b)).toEqual(slots.map((s) => c.birthId[s]!).sort((a, b) => a - b));
    expect(new Set(wakes.map((e): string => w.species[e.species!]!.id))).toEqual(new Set(RESTERS));
    const vis = visualEvents(w.events.ring, since).filter((e) => e.type === 'wake');
    expect(vis.length).toBe(6);
    expect(worldCueCounts(vis, divisionAudible(categoriesOf(w)))).toEqual({ division: 0, wake: 6 });
  });

  it('the limiter plays one wake cue for them within the 1000 ms window, and again 1.5 s later', () => {
    expect(WORLD_CUE_COALESCE_MS.wake).toBe(1000);
    let t = 0;
    const lim = new CueRateLimiter({ now: () => t, isWorld: isWorldCue, coalesceOf: coalesceMsOf });
    // The six wakes arrive over the snapshots of one second (eventCues asks once per snapshot with its count).
    let plays = 0;
    for (const [at, n] of [
      [0, 2],
      [100, 2],
      [400, 1],
      [900, 1],
    ] as const) {
      t = at;
      if (lim.request('wake', n).play) plays++;
    }
    expect(plays).toBe(1);
    expect(lim.playsInWindow().find((p) => p.id === 'wake')?.count).toBe(6);
    t = 1500; // a later wake, past the coalescing window: a new cue
    expect(lim.request('wake').play).toBe(true);
  });

  it('wakes are not division cues: a bacterial wake still counts (the bacterial-division silence is births only)', () => {
    const { w } = wakingDish();
    const since = w.counters.nextEventId - 1;
    step(w);
    const b12 = w.species.findIndex((s) => s.id === 'B12');
    expect(categoriesOf(w)[b12]).toBe('bacterium');
    const vis = visualEvents(w.events.ring, since).filter((e) => e.type === 'wake' && e.species === b12);
    expect(vis.length).toBe(2);
    const audible = divisionAudible(categoriesOf(w));
    expect(audible(b12)).toBe(false); // its births never sound …
    expect(worldCueCounts(vis, audible).wake).toBe(2); // … its wakes do
  });
});
