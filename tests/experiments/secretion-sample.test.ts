/** Experiment timeline samples tally secretion by the organism's producer rules (wave C, as tools/sim-tune.ts). */
import { describe, expect, it } from 'vitest';
import { introduceOrganism } from '../../src/sim/commands';
import { cellIndex } from '../../src/sim/grid';
import { sampleArm } from '../../src/sim/experiments';
import { profileOf } from '../../src/sim/profiles';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { speciesIndex } from '../../src/sim/world';
import { clearWater, setField } from '../helpers/world';

describe('experiment samples: secretion tally', () => {
  it('counts E01 carriers as well as native producers, and no plain organism', () => {
    const w = clearWater();
    const put = (id: string, x: number, modules: readonly string[]): number => {
      const s = introduceOrganism(w, speciesIndex(w, id), cellIndex(x, 64), 'test', { modules, exactCenter: true });
      rebuildIndex(w);
      return s;
    };
    const plain = put('B01', 40, []);
    const carriers = [44, 48, 52].map((x) => put('B01', x, ['E01']));
    expect(carriers.map((s) => profileOf(w, s).starch?.source)).toEqual(['E01', 'E01', 'E01']);
    put('B06', 80, []);
    for (const x of [44, 48, 80]) setField(w, 'starch', cellIndex(x, 64), 0.6);
    step(w);
    expect(profileOf(w, plain).starch).toBeNull();
    const sample = sampleArm(w, { everPresent: new Uint8Array(w.species.length).fill(1) });
    const b01 = sample.species.find((s) => s.id === 'B01')!;
    const b06 = sample.species.find((s) => s.id === 'B06')!;
    expect(b01.alive).toBe(4);
    // Shares of the four living Sprinters: two carriers secreting, one without substrate; the plain one is not a producer.
    expect(b01.secretion).toEqual({ SECRETING: 0.5, SECRETION_NO_SUBSTRATE: 0.25 });
    expect(b06.secretion).toEqual({ SECRETING: 1 });
  });
});
