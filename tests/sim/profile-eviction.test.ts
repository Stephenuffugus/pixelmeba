/**
 * P4.13 (D-0066's hash-neutral first step): src/sim/profiles.ts evictProfiles, run by step() every
 * PROFILE_EVICT_TICKS, drops cached derived profiles of genomes nothing current refers to.
 *
 * A profile is a pure derivation of (species, genome, the world's modules), so a dropped one is rebuilt
 * with the same values and float order. Proven here three ways over 6,000 ticks of FIRST_DISH_V1 and 3,000
 * of the 6,000-agent stress world (tools/perf-stress.ts --hashes carries it to 9,000 ticks; perf-rc1.md):
 * the stateHash and the full trajectory digest are equal with the shipped
 * cadence and with every genome's profile kept forever (the cache before P4.13), and (Garden) with every
 * profile thrown away every tick. A world reloaded mid-run continues exactly as the live one. Profiles are never saved:
 * serialize.ts serializeWorld writes `genomes` from world.genomes.list and has no `profiles` field, and
 * stateHash hashes genomeKey(g) for every genome, never a profile (serialize.ts stateHash).
 */
import { describe, expect, it } from 'vitest';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { evictProfiles, PROFILE_EVICT_TICKS, profileOfGenome } from '../../src/sim/profiles';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { buildStressWorld } from '../../tools/perf-stress';
import { trajectoryDigest } from '../helpers/trajectory';
import { registry } from '../helpers/world';

type Mode = 'shipped' | 'evictAll' | 'keepAll';

function garden(): World {
  const reg = registry();
  return realizeRecipe(reg, reg.recipes.FIRST_DISH_V1!);
}

/** Fill every genome's profile (the cache as it was before P4.13: nothing ever evicted). */
function keepAll(w: World): void {
  for (let g = 0; g < w.genomes.size; g++) {
    if (w.profiles[g] !== undefined) continue;
    const s = w.species.findIndex((sp) => sp.id === w.genomes.get(g).ancestor);
    if (s >= 0) profileOfGenome(w, g, s);
  }
}

function run(w: World, ticks: number, mode: Mode, marks: number[] = []): { at: Record<number, string> } {
  const at: Record<number, string> = {};
  for (let t = 0; t < ticks; t++) {
    step(w);
    if (mode === 'evictAll') w.profiles.length = 0;
    else if (mode === 'keepAll') keepAll(w);
    if (marks.includes(w.tick)) at[w.tick] = `${stateHash(w)} ${trajectoryDigest(w, 'full')}`;
  }
  return { at };
}

describe('profile eviction (P4.13, D-0066)', () => {
  it('FIRST_DISH_V1: equal stateHash and trajectory with the shipped cadence, evict-everything and keep-everything; it does evict', () => {
    const marks = [1500, 3000, 4500, 6000];
    const a = garden();
    const b = garden();
    const c = garden();
    const ra = run(a, 6000, 'shipped', marks);
    const rb = run(b, 6000, 'evictAll', marks);
    const rc = run(c, 6000, 'keepAll', marks);
    expect(rb.at).toEqual(ra.at);
    expect(rc.at).toEqual(ra.at);
    // Not vacuous: the kept-everything cache holds profiles the shipped cadence dropped.
    const cached = (w: World) => w.profiles.filter((p) => p !== undefined).length;
    expect(cached(c)).toBe(c.genomes.size);
    expect(evictProfiles(c)).toBeGreaterThan(0);
    expect(cached(a)).toBeLessThan(a.genomes.size);
    expect(a.tick % PROFILE_EVICT_TICKS).toBe(0);
  }, 600_000);

  it('a world reloaded mid-run continues exactly as the live one; profiles are not in the save', () => {
    const live = garden();
    run(live, 3000, 'shipped');
    const saved = serializeWorld(live);
    expect(Object.keys(saved)).not.toContain('profiles');
    expect(JSON.stringify(saved)).not.toMatch(/"profiles"/);
    const reloaded = deserializeWorld(JSON.parse(JSON.stringify(saved)));
    expect(reloaded.profiles.filter((p) => p !== undefined).length).toBe(0);
    expect(stateHash(reloaded)).toBe(stateHash(live));
    run(live, 3000, 'shipped');
    run(reloaded, 3000, 'shipped');
    expect(stateHash(reloaded)).toBe(stateHash(live));
    expect(trajectoryDigest(reloaded, 'full')).toBe(trajectoryDigest(live, 'full'));
  }, 600_000);

  it('the 6,000-agent stress world: equal stateHash and trajectory over 3,000 ticks with the shipped cadence and with nothing ever evicted', () => {
    // The pre-P4.13 cache (keepAll: every genome's profile kept) against the shipped eviction every 600
    // ticks. (Throwing the whole cache away often is proven on the Garden above; on this dish it rebuilds
    // ~1,000 profiles each time and takes too long for the suite; 3,000 ticks hold five evictions, and the
    // suite's time matters: wave 7a integration trimmed it from 6,000.)
    const a = buildStressWorld().world;
    const b = buildStressWorld().world;
    const marks = [600, 1800, 3000];
    const ra = run(a, 3000, 'shipped', marks);
    const rb = run(b, 3000, 'keepAll', marks);
    expect(rb.at).toEqual(ra.at);
    expect(b.profiles.filter((p) => p !== undefined).length).toBeGreaterThan(a.profiles.filter((p) => p !== undefined).length);
  }, 1_800_000);
});
