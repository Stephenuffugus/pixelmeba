/**
 * G0 fixture: determinism (SPEC §15). Same recipe, seed and command log ⇒ identical state hashes;
 * stepping in different chunk sizes (the headless analogue of 1× vs 4×) and observing the world
 * (hashing, serializing) never change the outcome; save at tick 3000 → reload → tick 6000 equals the
 * uninterrupted run. One uninterrupted reference run (hashed every 500 ticks) is shared by the tests
 * so the 6000-tick comparison is paid for once. The G1 command-log/host version of this fixture is
 * deterministic-state.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { queueCommand } from '../../src/sim/commands';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registry } from '../helpers/world';
import { inactiveFieldsNonZero } from '../../src/sim/transport';

/** Long runs on a shared machine: well above the 120 s default so load cannot fail them. */
const LONG = 600_000;
const CHECKPOINT = 500;

function fresh(): World {
  const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
  queueCommand(w, 'amoeba', { kind: 'inoculate', speciesId: 'P01', x: 48.5, y: 64.5, radius: 3, count: 2 }, 600);
  queueCommand(w, 'sugar', { kind: 'deposit', materialId: 'SUGAR', points: [[60, 80], [70, 82], [80, 80]], radius: 3, dose: 0.5 }, 1500);
  queueCommand(w, 'recyclers', { kind: 'inoculate', speciesId: 'B04', x: 66.5, y: 48.5, radius: 3, count: 5 }, 4200);
  return w;
}

interface Reference {
  /** hashes[k] = state hash at tick k × 500, k = 0..12. */
  readonly hashes: readonly string[];
  readonly world: World;
}

let reference: Reference | null = null;

/** The uninterrupted run to tick 6000; inactive fields are checked at every checkpoint. */
function uninterrupted(): Reference {
  if (reference) return reference;
  const w = fresh();
  const hashes = [stateHash(w)];
  for (let k = 0; k < 12; k++) {
    run(w, CHECKPOINT);
    hashes.push(stateHash(w));
    expect(inactiveFieldsNonZero(w)).toEqual([]);
  }
  reference = { hashes, world: w };
  return reference;
}

let secondAt3000: World | null = null;

describe('G0 determinism', () => {
  it(
    'two fresh runs produce identical hashes at every checkpoint',
    () => {
      const a = uninterrupted();
      const b = fresh();
      expect(stateHash(b)).toBe(a.hashes[0]);
      for (let k = 1; k <= 6; k++) {
        run(b, CHECKPOINT);
        expect(stateHash(b)).toBe(a.hashes[k]);
        expect(inactiveFieldsNonZero(b)).toEqual([]);
      }
      secondAt3000 = b;
    },
    LONG,
  );

  it(
    'chunk size and observation do not change the outcome (1× vs 4× analogue)',
    () => {
      const a = uninterrupted();
      const b = fresh();
      for (let t = 0; t < 2000; t += 4) {
        step(b);
        step(b);
        stateHash(b); // observing must not perturb
        step(b);
        step(b);
        if (t % 400 === 0) serializeWorld(b);
      }
      expect(b.tick).toBe(2000);
      expect(stateHash(b)).toBe(a.hashes[4]);
    },
    LONG,
  );

  it(
    'save at 3000 → reload → 6000 equals the uninterrupted run',
    () => {
      const ref = uninterrupted();
      const first =
        secondAt3000 ??
        (() => {
          const w = fresh();
          run(w, 3000);
          return w;
        })();
      expect(first.tick).toBe(3000);
      const json = JSON.stringify(serializeWorld(first));
      const reloaded = deserializeWorld(JSON.parse(json) as ReturnType<typeof serializeWorld>);
      expect(stateHash(reloaded)).toBe(stateHash(first));
      run(reloaded, 3000);
      expect(reloaded.tick).toBe(6000);
      expect(stateHash(reloaded)).toBe(ref.hashes[12]);
      expect(reloaded.events.totals.birth).toBe(ref.world.events.totals.birth);
      console.info(`determinism: endpoint ${ref.hashes[12]} at tick 6000; alive ${ref.world.ents.count}`);
    },
    LONG,
  );

  it('a different seed produces a different history from the same visible setup', () => {
    const a = realizeRecipe(registry(), 'FIRST_DISH_V1');
    const b = realizeRecipe(registry(), 'FIRST_DISH_V1', { seed: 130363 });
    run(a, 300);
    run(b, 300);
    expect(stateHash(a)).not.toBe(stateHash(b));
  });
});
