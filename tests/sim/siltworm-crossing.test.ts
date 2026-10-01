/**
 * P3.4 P04 Siltworm crossing (SPEC §6.4 last bullet; CT §1.3 "sediment (+ ≤ 2 water cells)"; D-0007;
 * src/sim/crossing.ts). From sediment a Siltworm may enter up to two consecutive open water cells:
 * they are passable and count as its habitat while it crosses (no SUIT_HABITAT, no stress damage),
 * a third water cell is refused both as a decision candidate and in the edge-checked trace, the
 * `waterCrossed` column counts the water cells and resets on sediment, and a worm that met too much
 * water can always turn back. Inoculation, births and the Life brush keep refusing water.
 */
import { describe, expect, it } from 'vitest';
import { applyNow } from '../../src/sim/commands';
import { crossesWater, entitySuitabilityAt, MAX_WATER_CELLS, waterCount } from '../../src/sim/crossing';
import { FLAG, MOVE_TARGET } from '../../src/sim/entities';
import { cellIndex, maskCells, SUB_SEDIMENT, SUB_WATER } from '../../src/sim/grid';
import { canOccupy, stageSenseAndMove, traceFraction } from '../../src/sim/movement';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { entityCell, rebuildIndex } from '../../src/sim/spatial';
import { suitabilityAt } from '../../src/sim/suitability';
import { step } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import { speciesIndex, type World } from '../../src/sim/world';
import { buildInspector } from '../../src/worker/snapshot';
import { aliveOf, clearWater, place } from '../helpers/world';

/** Sediment for x ≤ 59 and for x ≥ 60 + strip; open water in the strip between them. */
function strip(width: number, seed = 104729): World {
  const w = clearWater({ seed });
  for (const cell of maskCells()) {
    const x = cell % 128;
    w.grid.substrate[cell] = x <= 59 || x >= 60 + width ? SUB_SEDIMENT : SUB_WATER;
  }
  w.grid.geometryVersion++;
  updateDerived(w);
  return w;
}

const Y = 64;

function cellX(w: World, slot: number): number {
  return Math.floor(w.ents.cols.x[slot]!);
}

/** Step the world with the prey pinned in place (only the worm's path is under test). */
function chase(w: World, worm: number, prey: number, px: number, py: number, ticks: number, each: (tick: number) => void): void {
  const c = w.ents.cols;
  for (let t = 0; t < ticks; t++) {
    if (!w.ents.isAlive(prey)) break;
    c.x[prey] = px;
    c.y[prey] = py;
    c.E[worm] = 50; // stays hungry; energy is not under test
    rebuildIndex(w);
    step(w);
    each(t);
  }
}

describe('P04 Siltworm crosses at most two water cells (P3.4; D-0007)', () => {
  it('carries the ability in its record and lives only in sediment: canOccupy, inoculate and the habitat rule refuse water', () => {
    const w = strip(2);
    const sp = w.species[speciesIndex(w, 'P04')]!;
    expect(crossesWater(sp)).toBe(true);
    expect(sp.def.habitats).toEqual(['sediment']);
    expect(MAX_WATER_CELLS).toBe(2);
    const water = cellIndex(60, Y);
    expect(w.grid.substrate[water]).toBe(SUB_WATER);
    expect(canOccupy(w, sp, water)).toBe(false);
    expect(canOccupy(w, sp, cellIndex(59, Y))).toBe(true);
    // Inoculation (and births, which use the same canOccupy) never put a worm in water.
    const res = applyNow(w, 'inoc-water', { kind: 'inoculate', speciesId: 'P04', x: 61, y: Y + 0.5, radius: 1, count: 5 }).result!;
    for (const slot of aliveOf(w, 'P04')) expect(w.grid.substrate[entityCell(w.ents.cols.x[slot]!, w.ents.cols.y[slot]!)]).toBe(SUB_SEDIMENT);
    expect(res.accepted).toBe(aliveOf(w, 'P04').length);
    // Other species never cross.
    for (const other of w.species) if (other.id !== 'P04') expect(crossesWater(other), other.id).toBe(false);
  });

  it('the edge trace passes two water cells, refuses the third, and other species are traced by habitat only', () => {
    const two = strip(2);
    const three = strip(3);
    const sp2 = two.species[speciesIndex(two, 'P04')]!;
    const sp3 = three.species[speciesIndex(three, 'P04')]!;
    // From sediment (state 0) straight across.
    expect(traceFraction(two, sp2, 59.5, Y + 0.5, 62.5, Y + 0.5, 0)).toBe(1);
    const t = traceFraction(three, sp3, 59.5, Y + 0.5, 63.5, Y + 0.5, 0);
    expect(t).toBeLessThan(1);
    expect(Math.floor(59.5 + 4 * t)).toBe(61); // stops inside the second water cell
    // A diagonal path entering three water cells is refused too (consecutive cells, not columns).
    expect(traceFraction(two, sp2, 59.5, Y + 0.5, 61.5, Y + 2.5, 0)).toBeLessThan(1);
    // Without a crossing state the trace is the habitat rule: no water at all.
    expect(traceFraction(two, sp2, 59.5, Y + 0.5, 62.5, Y + 0.5)).toBeLessThan(1);
  });

  it('crosses a two-cell strip: waterCrossed reads 1 then 2, resets to 0 on sediment; no SUIT_HABITAT, no stress damage; the inspector shows stage 4’s value', () => {
    const w = strip(2);
    // Prey within the worm's sensing radius (4 cells) on the far sediment.
    const worm = place(w, 'P04', 58.5, Y + 0.5, { E: 50 });
    const prey = place(w, 'B04', 62.5, Y + 0.5);
    const birth = w.ents.cols.birthId[worm]!;
    const sp = w.species[speciesIndex(w, 'P04')]!;
    const c = w.ents.cols;
    const seen = new Map<number, number>();
    let inWater = 0;
    let before = { cell: entityCell(c.x[worm]!, c.y[worm]!), value: entitySuitabilityAt(w, worm, sp, profileOf(w, worm), entityCell(c.x[worm]!, c.y[worm]!)).value };
    chase(w, worm, prey, 62.5, Y + 0.5, 200, () => {
      if (!w.ents.isAlive(worm)) throw new Error('worm died');
      // Stage 4 stored the suitability of the cell it started the tick in.
      expect(c.suitability[worm]).toBe(before.value);
      const x = cellX(w, worm);
      const cell = entityCell(c.x[worm]!, c.y[worm]!);
      const n = c.waterCrossed[worm]!;
      if (w.grid.substrate[cell] === SUB_WATER) {
        inWater++;
        seen.set(x, waterCount(n));
        const suit = entitySuitabilityAt(w, worm, sp, profileOf(w, worm), cell);
        expect(suit.reason).not.toBe(R.SUIT_HABITAT);
        expect(suit.value).toBeGreaterThan(0.5);
        // The record's habitat rule alone would say "can't live here": the crossing check is what differs.
        expect(suitabilityAt(w, sp, profileOf(w, worm), cell).reason).toBe(R.SUIT_HABITAT);
        const insp = buildInspector(w, { kind: 'entity', birthId: birth });
        if (insp.kind !== 'entity' || !insp.entity) throw new Error('not inspected');
        expect(insp.entity.suitFactors.reason).toBe(suit.reason);
        expect(insp.entity.suitability).toBe(c.suitability[worm]);
      } else {
        expect(n).toBe(0);
      }
      expect(c.H[worm]).toBe(100);
      expect(c.flags[worm]! & FLAG.stressed).toBe(0);
      before = { cell, value: entitySuitabilityAt(w, worm, sp, profileOf(w, worm), cell).value };
    });
    expect(inWater).toBeGreaterThan(0);
    expect(seen.get(60)).toBe(1);
    expect(seen.get(61)).toBe(2);
    // It reached the far sediment (and caught the prey there), with its count back at 0.
    expect(w.ents.isAlive(prey)).toBe(false);
    expect(cellX(w, worm)).toBeGreaterThanOrEqual(62);
    expect(c.waterCrossed[worm]).toBe(0);
  });

  it('never enters a third water cell while chasing, and turns back to its sediment afterwards', () => {
    const w = strip(3);
    const worm = place(w, 'P04', 59.2, Y + 0.5, { E: 50 });
    const prey = place(w, 'B04', 63.5, Y + 0.5);
    const c = w.ents.cols;
    let maxX = 0;
    let stuckTicks = 0;
    chase(w, worm, prey, 63.5, Y + 0.5, 300, () => {
      const x = cellX(w, worm);
      maxX = Math.max(maxX, x);
      expect(x).not.toBe(62);
      if (x === 61) {
        stuckTicks++;
        expect(waterCount(c.waterCrossed[worm]!)).toBe(2);
      }
      expect(c.H[worm]).toBe(100);
    });
    expect(maxX).toBe(61);
    expect(stuckTicks).toBeGreaterThan(100);
    expect(w.ents.isAlive(prey)).toBe(true);
    // Prey back on its own side: the worm steps back through the water it came from.
    chase(w, worm, prey, 58.5, Y + 0.5, 300, () => undefined);
    expect(w.ents.isAlive(prey)).toBe(false);
    expect(cellX(w, worm)).toBeLessThanOrEqual(59);
    expect(c.waterCrossed[worm]).toBe(0);
  });

  it('decision candidates include only water cells reachable within two water cells (never the third), and only for a crosser', () => {
    const targets = new Set<number>();
    const control = new Set<number>();
    for (const seed of [101, 102, 103, 104, 105, 106]) {
      for (const crosser of [true, false]) {
        const w = strip(3, seed);
        // Salted sediment near the strip makes open water (and the unsalted sediment beyond x 55) the
        // better candidates (salinity 0.6 is outside P04's 0–0.20: suitability 0 there).
        for (const cell of maskCells()) if (w.grid.substrate[cell] === SUB_SEDIMENT && cell % 128 >= 56) w.fields.salt![cell] = 0.6;
        const idx = speciesIndex(w, 'P04');
        if (!crosser) {
          const sp = w.species[idx]!;
          (w.species as unknown as unknown[])[idx] = { ...sp, abilities: sp.abilities.filter((a) => a !== 'SEDIMENT_WATER_CROSSING') };
        }
        for (const y of [Y - 2, Y, Y + 2]) {
          const worm = place(w, 'P04', 59.5, y + 0.5, { E: 90 }); // not hungry: it decides, it does not hunt
          w.ents.cols.decisionTimer[worm] = 0;
          w.tick = seed + y;
          stageSenseAndMove(w);
          const c = w.ents.cols;
          expect(c.moveMode[worm]).toBe(MOVE_TARGET);
          const cell = cellIndex(Math.floor(c.targetX[worm]!), Math.floor(c.targetY[worm]!));
          (crosser ? targets : control).add(cell);
        }
      }
    }
    const water = [...targets].filter((cell) => w0Substrate(cell) === SUB_WATER);
    expect(water.length).toBeGreaterThan(0);
    expect(water.some((cell) => cell % 128 === 61)).toBe(true); // a second water cell is a candidate
    for (const cell of targets) expect(cell % 128 <= 55 || cell % 128 === 60 || cell % 128 === 61, `target x ${cell % 128}`).toBe(true);
    expect(control.size).toBeGreaterThan(0);
    for (const cell of control) {
      expect(w0Substrate(cell)).toBe(SUB_SEDIMENT);
      expect(cell % 128).toBeLessThanOrEqual(55);
    }
  });

  it('a worm stranded by water painted under it is not crossing: SUIT_HABITAT, and it may only step onto sediment', () => {
    const w = strip(2);
    const worm = place(w, 'P04', 60.5, Y + 0.5, { E: 50 }); // placed in water directly (never entered it)
    const sp = w.species[speciesIndex(w, 'P04')]!;
    expect(w.ents.cols.waterCrossed[worm]).toBe(0);
    const suit = entitySuitabilityAt(w, worm, sp, profileOf(w, worm), cellIndex(60, Y));
    expect(suit.value).toBe(0);
    expect(suit.reason).toBe(R.SUIT_HABITAT);
    expect(traceFraction(w, sp, 60.5, Y + 0.5, 61.5, Y + 0.5, 2 | (4 << 2))).toBeLessThan(1);
    expect(traceFraction(w, sp, 60.5, Y + 0.5, 59.5, Y + 0.5, 2 | (4 << 2))).toBe(1);
  });
});

/** Substrate of a cell in the strip(3) geometry (every world above shares it). */
function w0Substrate(cell: number): number {
  const x = cell % 128;
  return x <= 59 || x >= 63 ? SUB_SEDIMENT : SUB_WATER;
}
