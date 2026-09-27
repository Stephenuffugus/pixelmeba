/**
 * G0 fixture: determinism (SPEC §15). Same recipe, seed and command log ⇒ identical state hashes;
 * stepping in different chunk sizes (the headless analogue of 1× vs 4×) and observing the world
 * (hashing, serializing) never change the outcome; save at tick 3000 → reload → tick 6000 equals the
 * uninterrupted run.
 */
import { describe, expect, it } from 'vitest';
import { queueCommand } from '../../src/sim/commands';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registry } from '../helpers/world';
import { inactiveFieldsNonZero } from '../../src/sim/transport';

function fresh(): World {
  const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
  queueCommand(w, 'amoeba', { kind: 'inoculate', speciesId: 'P01', x: 48.5, y: 64.5, radius: 3, count: 2 }, 600);
  queueCommand(w, 'sugar', { kind: 'deposit', materialId: 'SUGAR', points: [[60, 80], [70, 82], [80, 80]], radius: 3, dose: 0.5 }, 1500);
  queueCommand(w, 'recyclers', { kind: 'inoculate', speciesId: 'B04', x: 66.5, y: 48.5, radius: 3, count: 5 }, 4200);
  return w;
}

describe('G0 determinism', () => {
  it('two fresh runs produce identical hashes at every checkpoint', () => {
    const a = fresh();
    const b = fresh();
    expect(stateHash(a)).toBe(stateHash(b));
    for (let k = 0; k < 6; k++) {
      run(a, 500);
      run(b, 500);
      expect(stateHash(a)).toBe(stateHash(b));
      expect(inactiveFieldsNonZero(a)).toEqual([]);
    }
  });

  it('chunk size and observation do not change the outcome (1× vs 4× analogue)', () => {
    const a = fresh();
    const b = fresh();
    run(a, 2000);
    for (let t = 0; t < 2000; t += 4) {
      step(b);
      step(b);
      stateHash(b); // observing must not perturb
      step(b);
      step(b);
      if (t % 400 === 0) serializeWorld(b);
    }
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it('save at 3000 → reload → 6000 equals the uninterrupted run', () => {
    const uninterrupted = fresh();
    run(uninterrupted, 6000);
    const first = fresh();
    run(first, 3000);
    const json = JSON.stringify(serializeWorld(first));
    const reloaded = deserializeWorld(JSON.parse(json) as ReturnType<typeof serializeWorld>);
    expect(stateHash(reloaded)).toBe(stateHash(first));
    run(reloaded, 3000);
    expect(reloaded.tick).toBe(6000);
    expect(stateHash(reloaded)).toBe(stateHash(uninterrupted));
    expect(reloaded.events.totals.birth).toBe(uninterrupted.events.totals.birth);
    console.info(`determinism: endpoint ${stateHash(uninterrupted)} at tick 6000; alive ${uninterrupted.ents.count}`);
  });

  it('a different seed produces a different history from the same visible setup', () => {
    const a = realizeRecipe(registry(), 'FIRST_DISH_V1');
    const b = realizeRecipe(registry(), 'FIRST_DISH_V1', { seed: 130363 });
    run(a, 300);
    run(b, 300);
    expect(stateHash(a)).not.toBe(stateHash(b));
  });
});
