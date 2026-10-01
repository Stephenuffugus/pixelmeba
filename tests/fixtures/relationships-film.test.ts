/**
 * P3.3 relationships of B02 Velvet and F01 Threadlace (CT §3.1, §3.2, §3.5; SPEC §6.5, §7.1, §7.3;
 * D-0038).
 *
 *  - P01 Amoeba eats B02 ('any'): an amoeba beside a Velvet on a stone-edge water cell captures it.
 *  - P04 Siltworm eats B02 ('any') in sediment. P04's SEDIMENT_WATER_CROSSING is implemented by the
 *    organisms builder of this wave, so the world is realized with registryWith(…, allowUnimplemented).
 *  - P02 Ciliate never captures B02 (not in its list), while the same setup with B01 is a capture.
 *  - B02 eats sugar, then protein (ordered policy, exact requests), and never film.
 *  - F01 eats detritus, starch, protein and film, in that order (film last, eaten as detritus).
 */
import { describe, expect, it } from 'vitest';
import { AVAIL_K, DT } from '../../src/sim/constants';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { cellIndex, isStoneEdge, maskCells, ST_NONE, SUB_WATER } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { field as lineageField } from '../../src/sim/lineage';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { realizeRecipe, withHabitatOverride } from '../../src/sim/recipes';
import { PREY_NONE } from '../../src/sim/species';
import { step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { fillField, place, registry, setField } from '../helpers/world';

function dish(habitatId: string, reg: ContentRegistry = registry()): World {
  const r = withHabitatOverride(reg.recipes.FIRST_DISH_V1!, habitatId);
  const w = realizeRecipe(
    reg,
    {
      ...r,
      founders: [],
      fieldPatches: [],
      scheduledCommands: [],
      mutationPreset: 'fixed',
      ...(habitatId === r.habitatId ? { backgroundOverrides: {} } : {}),
    },
    { worldId: 'relationships-film' },
  );
  fillField(w, 'sugar', 0);
  return w;
}

/** The first open water cell beside a stone (Water Garden keeps its stones). */
function stoneEdgeWater(w: World): number {
  for (const cell of maskCells()) {
    if (
      w.grid.substrate[cell] === SUB_WATER &&
      w.grid.structure[cell] === ST_NONE &&
      isStoneEdge(w.grid, cell)
    )
      return cell;
  }
  throw new Error('no stone edge');
}

/** Run until `prey` dies or `ticks` pass; the tick it died at, or −1. */
function runUntilGone(w: World, prey: number, ticks: number): number {
  const birth = w.ents.cols.birthId[prey]!;
  for (let t = 0; t < ticks; t++) {
    step(w);
    if (w.ents.cols.alive[prey] !== 1 || w.ents.cols.birthId[prey] !== birth) return t;
  }
  return -1;
}

function predationFixture(
  w: World,
  cell: number,
  predator: string,
  preyId: string,
): { pred: number; prey: number; preyBirth: number } {
  const x = (cell % 128) + 0.5;
  const y = Math.floor(cell / 128) + 0.5;
  const prey = place(w, preyId, x, y);
  const pred = place(w, predator, x + 0.1, y, { E: 50 });
  return { pred, prey, preyBirth: w.ents.cols.birthId[prey]! };
}

describe('P3.3 who eats Velvet', () => {
  it('P01 Amoeba captures a B02 on a stone-edge water cell', () => {
    const w = dish('WATER_GARDEN');
    const { pred, prey, preyBirth } = predationFixture(w, stoneEdgeWater(w), 'P01', 'B02');
    expect(w.species[speciesIndex(w, 'P01')]!.prey[speciesIndex(w, 'B02')]).not.toBe(PREY_NONE);
    expect(runUntilGone(w, prey, 50)).toBeGreaterThanOrEqual(0);
    expect(lineageField(w.lineage, 'deathCause', preyBirth)).toBe(R.DEATH_PREDATION);
    expect(w.ents.cols.mealC[pred]!).toBeGreaterThan(0);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('P04 Siltworm captures a B02 in sediment', () => {
    const shipped = registry();
    const species = [...new Set([...shipped.manifest.enabledSpecies, 'B02', 'P04'])].sort();
    // P04's SEDIMENT_WATER_CROSSING belongs to this wave's organisms builder.
    const w = dish('SEDIMENT_EDGE', registryWith({ enabledSpecies: species }, { allowUnimplemented: true }));
    const cell = cellIndex(90, 90);
    expect(w.grid.substrate[cell]).toBe(2);
    const { pred, prey, preyBirth } = predationFixture(w, cell, 'P04', 'B02');
    expect(runUntilGone(w, prey, 50)).toBeGreaterThanOrEqual(0);
    expect(lineageField(w.lineage, 'deathCause', preyBirth)).toBe(R.DEATH_PREDATION);
    expect(w.ents.cols.mealC[pred]!).toBeGreaterThan(0);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('P02 Ciliate never captures B02, though it captures B01 in the same place', () => {
    const w = dish('WATER_GARDEN');
    expect(w.species[speciesIndex(w, 'P02')]!.prey[speciesIndex(w, 'B02')]).toBe(PREY_NONE);
    const cell = stoneEdgeWater(w);
    const { prey } = predationFixture(w, cell, 'P02', 'B02');
    expect(runUntilGone(w, prey, 300)).toBe(-1);
    const w2 = dish('WATER_GARDEN');
    const b01 = predationFixture(w2, cell, 'P02', 'B01');
    expect(runUntilGone(w2, b01.prey, 300)).toBeGreaterThanOrEqual(0);
  });
});

const avail = (a: number): number => (a <= 0 ? 0 : a / (a + AVAIL_K));

/**
 * One tick for `slot` with the given pools in its cell: the requests the ordered policy should make,
 * from the stage-5 snapshot, and what each pool lost in stage 6.
 */
function orderedTick(
  w: World,
  slot: number,
  cell: number,
  pools: readonly string[],
): { expected: number[]; lost: number[] } {
  const f = (id: string) => w.fields[id as 'sugar']!;
  const before: number[] = [];
  let expected: number[] = [];
  const lost: number[] = [];
  step(w, {
    afterStage: (stage) => {
      if (stage === 5) {
        const c = w.ents.cols;
        let rem = profileOf(w, slot).q * c.suitability[slot]! * DT;
        expected = pools.map((id) => {
          const P = f(id)[cell]!;
          before.push(P);
          if (P <= 0 || rem <= 0) return 0;
          const r = Math.min(rem * avail(P), P);
          rem -= r;
          return r;
        });
      }
      if (stage === 6) pools.forEach((id, k) => lost.push(before[k]! - f(id)[cell]!));
    },
  });
  return { expected, lost };
}

describe('P3.3 what Velvet and Threadlace eat', () => {
  it('B02 eats sugar, then protein, and never film', () => {
    const w = dish('GEL_COLONY');
    const cell = cellIndex(30, 64);
    setField(w, 'sugar', cell, 0.05);
    setField(w, 'protein', cell, 0.3);
    setField(w, 'proteinN', cell, 0.03);
    setField(w, 'film', cell, 0.3);
    setField(w, 'filmN', cell, 0.03);
    const s = place(w, 'B02', 30.5, 64.5);
    expect(profileOf(w, s).foods).toEqual(['sugar', 'protein']);
    const { expected, lost } = orderedTick(w, s, cell, ['sugar', 'protein', 'film']);
    expect(expected[0]).toBeGreaterThan(0);
    expect(expected[1]).toBeGreaterThan(0);
    expect(lost[0]).toBeCloseTo(expected[0]!, 15);
    expect(lost[1]).toBeCloseTo(expected[1]!, 15);
    expect(lost[2]).toBe(0); // film only decays (stage 2); B02 does not digest it
    expect(checkLedger(w).ok).toBe(true);
  });

  it('F01 eats detritus, starch, protein and then film', () => {
    const w = dish('GEL_COLONY');
    const cell = cellIndex(30, 64);
    for (const id of ['detritus', 'starch', 'protein', 'film'] as const) {
      setField(w, id, cell, 0.02);
      setField(w, `${id}N`, cell, 0.002);
    }
    const s = place(w, 'F01', 30.5, 64.5);
    expect(profileOf(w, s).foods).toEqual(['detritus', 'starch', 'protein']);
    const { expected, lost } = orderedTick(w, s, cell, ['detritus', 'starch', 'protein', 'film']);
    for (let k = 0; k < 4; k++) {
      expect(expected[k]).toBeGreaterThan(0);
      expect(lost[k]).toBeCloseTo(expected[k]!, 15);
    }
    expect(checkLedger(w).ok).toBe(true);
  });
});
