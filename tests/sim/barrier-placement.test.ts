/**
 * Phase 5 wave 9 barrier-movement: placement across edge barriers, S05 shelter occupancy and the S06
 * attachment mesh (D-0106 "daughter or fungal placement never cross an edge that blocks either party's
 * class"; CT §4 S05 "blocks Medium/Large", S06 "attachment for B02, B13, fungi, P06; no protection";
 * CT §5.3; src/sim/edgePassage.ts pairPermitted / shelterRefuses, barriers.ts classOf, births.ts
 * findPlacement, fungi.ts fungalPlacement, movement.ts canOccupy, crossing.ts enterCell, attachment.ts).
 *
 * Worlds: clear water under barrierRegistry(), test geometry painted straight into the grid
 * (geometryVersion bumped), barriers and devices pushed with pushEdges / pushDevices. Ready parents
 * follow tests/sim/movement-births-tick.test.ts and tests/fixtures/fungal-branching.test.ts (state set
 * directly, logged as inputs by place()).
 */
import { describe, expect, it } from 'vitest';
import { attachmentMask, cellSurfaces, SURF_MESH } from '../../src/sim/attachment';
import type { EdgeBarrier } from '../../src/sim/barriers';
import { applyNow } from '../../src/sim/commands';
import type { RecipeDef } from '../../src/sim/content/schema';
import { cellIndex, maskCells, ST_STONE, SUB_GEL, SUB_SEDIMENT, SUB_WATER } from '../../src/sim/grid';
import { fungalNeighbors } from '../../src/sim/links';
import { canOccupy, traceFraction } from '../../src/sim/movement';
import { realizeRecipe, RecipeError } from '../../src/sim/recipes';
import { entityCell, rebuildIndex } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import { markField, updateDerived } from '../../src/sim/transport';
import { speciesIndex, type World } from '../../src/sim/world';
import { aliveOf, barrierDish, barrierRegistry, clearWater, place, preOrganismFlipRegistry, pushDevices, pushEdges, verticalLine } from '../helpers/world';

type Edge = Omit<EdgeBarrier, 'id'>;
const Y = 64;
const S01R = (x: number, y: number): Edge => ({ kind: 'S01', cell: cellIndex(x, y), dir: 'R' });
const S01D = (x: number, y: number): Edge => ({ kind: 'S01', cell: cellIndex(x, y), dir: 'D' });
const cx = (w: World, s: number) => Math.floor(w.ents.cols.x[s]!);
const cy = (w: World, s: number) => Math.floor(w.ents.cols.y[s]!);

function paint(w: World, f: (x: number, y: number) => number | null): void {
  for (const cell of maskCells()) {
    const v = f(cell % 128, Math.floor(cell / 128));
    if (v !== null) w.grid.substrate[cell] = v;
  }
  w.grid.geometryVersion++;
  updateDerived(w);
}

function setSugar(w: World, f: (x: number, y: number) => number): void {
  const s = w.fields.sugar!;
  for (const cell of maskCells()) s[cell] = f(cell % 128, Math.floor(cell / 128));
  markField(w, 'sugar');
}

/** A B01 ready to divide at (64.5, 64.5) after `edges`; the cells of the two B01 after one tick. */
function divideB01(seed: number, edges: readonly Edge[]): [number, number][] {
  const w = barrierDish({ seed });
  if (edges.length > 0) pushEdges(w, edges);
  place(w, 'B01', 64.5, Y + 0.5, { B: 2, N: 0.2, E: 90, H: 100, age: 20 });
  run(w, 1);
  const out = aliveOf(w, 'B01').map((s) => [cx(w, s), cy(w, s)] as [number, number]);
  expect(out).toHaveLength(2);
  return out;
}

describe('daughter placement never crosses a refusing edge (births.ts findPlacement)', () => {
  it('inside a cell whose four edges are S01 the daughter stays in the parent’s cell (20 seeds); without them it goes east', () => {
    const box = [S01R(63, Y), S01R(64, Y), S01D(64, Y - 1), S01D(64, Y)];
    for (let seed = 1; seed <= 20; seed++) {
      expect(divideB01(seed * 7919, box), `seed ${seed}`).toEqual([
        [64, Y],
        [64, Y],
      ]);
    }
    expect(
      divideB01(7919, [])
        .map(([x]) => x)
        .sort(),
    ).toEqual([64, 65]);
  });

  it('with S01 on the east edge only, no daughter lands east, north-east or south-east (20 seeds)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const cells = divideB01(seed * 104729, [S01R(64, Y)]);
      for (const [x] of cells) expect(x, `seed ${seed}`).toBeLessThanOrEqual(64);
    }
  });

  it('an attached B02 (Fixed) never places a daughter across an S02, over generations; without it daughters go east', () => {
    const grow = (gate: boolean): { across: number; total: number } => {
      const w = barrierDish();
      paint(w, () => SUB_GEL);
      if (gate) pushEdges(w, verticalLine('S02', 63, 0, 127));
      place(w, 'B02', 63.5, Y + 0.5, { B: 2.2, N: 0.22, E: 90, H: 100, age: 30 });
      let across = 0;
      for (let t = 0; t < 600; t++) {
        setSugar(w, (x, y) => (Math.abs(x - 63) <= 4 && Math.abs(y - Y) <= 4 ? 0.6 : 0));
        step(w);
        for (const s of aliveOf(w, 'B02')) if (cx(w, s) >= 64) across++;
      }
      return { across, total: aliveOf(w, 'B02').length };
    };
    const gated = grow(true);
    expect(gated.across).toBe(0);
    expect(gated.total).toBeGreaterThan(2); // it did divide (more than one generation)
    expect(grow(false).across).toBeGreaterThan(0);
  }, 30_000);
});

describe('fungal placement never crosses a refusing edge (fungi.ts fungalPlacement)', () => {
  it('a ready F01 whose first-ranked (east) neighbour is across S01 places its segment elsewhere, linked on its own side', () => {
    const w = barrierDish();
    paint(w, () => SUB_GEL);
    setSugar(w, () => 0);
    pushEdges(w, [S01R(30, Y)]);
    const p = place(w, 'F01', 30.5, Y + 0.5, { B: 4.2, E: 80, age: 100 });
    step(w);
    const born = aliveOf(w, 'F01').filter((s) => s !== p);
    expect(born).toHaveLength(1);
    const b = born[0]!;
    expect([cx(w, b), cy(w, b)]).not.toEqual([31, Y]);
    expect(fungalNeighbors(w, p)).toEqual([b]);
    // Control: without the edge the east neighbour is taken (fungal-branching's "E first").
    const o = barrierDish();
    paint(o, () => SUB_GEL);
    setSugar(o, () => 0);
    const q = place(o, 'F01', 30.5, Y + 0.5, { B: 4.2, E: 80, age: 100 });
    step(o);
    const ob = aliveOf(o, 'F01').filter((s) => s !== q);
    expect(ob.map((s) => [cx(o, s), cy(o, s)])).toEqual([[31, Y]]);
  });

  it('F02 networks growing on both sides of an S01 line never place a segment or make a link across it', () => {
    const w = barrierDish();
    paint(w, () => SUB_GEL);
    pushEdges(w, verticalLine('S01', 63, 0, 127));
    const sides = new Map<number, boolean>(); // birthId → started east of the line
    for (const [x, east] of [
      [62.5, false],
      [61.5, false],
      [64.5, true],
      [65.5, true],
    ] as const) {
      const s = place(w, 'F02', x, Y + 0.5, { B: 4.4, E: 90, age: 60 });
      sides.set(w.ents.cols.birthId[s]!, east);
    }
    const c = w.ents.cols;
    let links = 0;
    let segments = 0;
    for (let t = 0; t < 1000; t++) {
      setSugar(w, (x, y) => (Math.abs(x - 63.5) <= 6 && Math.abs(y - Y) <= 6 ? 0.6 : 0));
      const before = new Set(aliveOf(w, 'F02'));
      step(w);
      for (const s of aliveOf(w, 'F02')) {
        const east = cx(w, s) >= 64;
        if (!before.has(s)) segments++;
        for (const n of fungalNeighbors(w, s)) {
          links++;
          expect(cx(w, n) >= 64, `link ${c.birthId[s]}–${c.birthId[n]} at tick ${w.tick}`).toBe(east);
        }
      }
    }
    expect(segments).toBeGreaterThan(4);
    expect(links).toBeGreaterThan(0);
  }, 60_000);
});

describe('S05 porous shelter occupancy (movement.ts canOccupy, crossing.ts enterCell)', () => {
  function sheltered(w: World, x0: number, x1: number, y0: number, y1: number): void {
    const devices = [];
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) devices.push({ kind: 'S05' as const, cell: cellIndex(x, y) });
    pushDevices(w, devices);
  }

  it('canOccupy refuses Medium and Large species and admits Small and Fixed ones in a shelter cell', () => {
    const w = barrierDish();
    sheltered(w, 64, 64, Y, Y);
    const cell = cellIndex(64, Y);
    const sp = (id: string) => w.species[speciesIndex(w, id)]!;
    expect(canOccupy(w, sp('P01'), cell)).toBe(false); // Medium
    expect(canOccupy(w, sp('A01'), cell)).toBe(false); // Medium
    expect(canOccupy(w, sp('B01'), cell)).toBe(true); // Small
    expect(canOccupy(w, sp('X01'), cell)).toBe(true); // Small
    expect(canOccupy(w, sp('P01'), cellIndex(65, Y))).toBe(true); // the next cell holds no shelter
  });

  it('a species that lives attached is Fixed and admitted: P06 and B02 on a stone-edge cell holding a shelter; P01 is still refused (D-0115)', () => {
    // barrierRegistry()'s lists (the shipped ones before the organism flip, D-0127) plus P06.
    const reg = preOrganismFlipRegistry({ species: ['P06'] });
    const w = clearWater({}, reg);
    w.grid.structure[cellIndex(65, Y)] = ST_STONE; // (64, Y) becomes a stone-edge water cell
    w.grid.geometryVersion++;
    updateDerived(w);
    const cell = cellIndex(64, Y);
    const sp = (id: string) => w.species[speciesIndex(w, id)]!;
    expect(canOccupy(w, sp('P06'), cell)).toBe(true); // control: the surface admits it before the shelter
    sheltered(w, 64, 64, Y, Y);
    expect(canOccupy(w, sp('P06'), cell)).toBe(true); // Fixed: unaffected (CT §5.3 "attached P06")
    expect(canOccupy(w, sp('B02'), cell)).toBe(true); // Fixed: unaffected (admitted under the wave 8a rule too: P06 is D-0115's case)
    expect(canOccupy(w, sp('P01'), cell)).toBe(false); // Medium
  });

  it('inoculating P01 into shelter cells places nobody there; B01 is placed', () => {
    const w = barrierDish();
    sheltered(w, 60, 68, 60, 68);
    const p = applyNow(w, 'inoc-p01', {
      kind: 'inoculate',
      speciesId: 'P01',
      x: 64.5,
      y: Y + 0.5,
      radius: 2,
      count: 5,
    }).result!;
    expect(p.accepted).toBe(0);
    expect(aliveOf(w, 'P01')).toEqual([]);
    const b = applyNow(w, 'inoc-b01', {
      kind: 'inoculate',
      speciesId: 'B01',
      x: 64.5,
      y: Y + 0.5,
      radius: 2,
      count: 5,
    }).result!;
    expect(b.accepted).toBe(5);
    expect(aliveOf(w, 'B01')).toHaveLength(5);
  });

  it('a recipe founder of a Medium species in a cell the recipe gives a shelter is refused (RecipeError); a Small founder is not', () => {
    const reg = barrierRegistry();
    const base = reg.recipes.FIRST_DISH_V1!;
    const recipe = (species: string): RecipeDef => ({
      ...base,
      id: 'TEST_SHELTER_FOUNDER',
      removeStones: true,
      fieldPatches: [],
      scheduledCommands: [],
      devices: [{ structure: 'S05', at: [64, 64] }],
      founders: [
        {
          species,
          count: 1,
          center: [64, 64],
          radius: 0,
          cells: [[64, 64]],
          modules: [],
          moduleAssignment: 'all',
        },
      ],
    });
    expect(() => realizeRecipe(reg, recipe('P01'))).toThrow(RecipeError);
    expect(() => realizeRecipe(reg, recipe('P01'))).toThrow(/P01 cannot live in founder cell \(64,64\)/);
    const ok = realizeRecipe(reg, recipe('B01'));
    expect(aliveOf(ok, 'B01').map((s) => entityCell(ok.ents.cols.x[s]!, ok.ents.cols.y[s]!))).toEqual([
      cellIndex(64, 64),
    ]);
  });

  it('P04 never enters a shelter, crossing water or on sediment; its crossing trace stops before one', () => {
    const strip = (): World => {
      const w = barrierDish();
      paint(w, (x) => (x <= 59 || x >= 62 ? SUB_SEDIMENT : SUB_WATER));
      return w;
    };
    const w = strip();
    const sp = w.species[speciesIndex(w, 'P04')]!;
    expect(traceFraction(w, sp, 59.5, Y + 0.5, 62.5, Y + 0.5, 0, null)).toBe(1);
    sheltered(w, 60, 60, Y - 8, Y + 8); // water shelters
    sheltered(w, 57, 57, Y - 8, Y + 8); // sediment shelters
    expect(canOccupy(w, sp, cellIndex(57, Y))).toBe(false);
    const t = traceFraction(w, sp, 59.5, Y + 0.5, 62.5, Y + 0.5, 0, null);
    expect(59.5 + 3 * t).toBeLessThan(60);
    const worm = place(w, 'P04', 58.5, Y + 0.5, { E: 50 });
    const prey = place(w, 'B04', 62.5, Y + 0.5);
    const c = w.ents.cols;
    for (let k = 0; k < 300 && w.ents.isAlive(worm); k++) {
      if (w.ents.isAlive(prey)) {
        c.x[prey] = 62.5;
        c.y[prey] = Y + 0.5;
      }
      c.E[worm] = 50;
      rebuildIndex(w);
      step(w);
      expect([57, 60]).not.toContain(cx(w, worm));
    }
  });
});

describe('S06 attachment mesh (attachment.ts SURF_MESH)', () => {
  it('without devices the mask is cellSurfaces byte for byte; an S06 adds SURF_MESH to its cell only', () => {
    const w = barrierDish();
    const expected = new Uint8Array(w.grid.substrate.length);
    for (const i of maskCells()) expected[i] = cellSurfaces(w.grid, i);
    expect(Buffer.from(attachmentMask(w)).equals(Buffer.from(expected))).toBe(true);
    const mesh = cellIndex(70, Y);
    pushDevices(w, [
      { kind: 'S06', cell: mesh },
      { kind: 'S05', cell: cellIndex(71, Y) },
    ]);
    const after = attachmentMask(w);
    for (const i of maskCells())
      expect(after[i], `cell ${i}`).toBe(i === mesh ? expected[i]! | SURF_MESH : expected[i]);
  });

  it('emptying the device store without a geometryVersion bump (in place or by a new array) drops the mesh, as a reload does', () => {
    const emptyings: ((w: World) => void)[] = [
      (w) => {
        w.devices.length = 0;
      },
      (w) => {
        w.devices = [];
      },
    ];
    for (const empty of emptyings) {
      const w = barrierDish();
      const expected = new Uint8Array(w.grid.substrate.length);
      for (const i of maskCells()) expected[i] = cellSurfaces(w.grid, i);
      const mesh = cellIndex(70, Y);
      pushDevices(w, [{ kind: 'S06', cell: mesh }]);
      expect(attachmentMask(w)[mesh]! & SURF_MESH).toBe(SURF_MESH);
      const gv = w.grid.geometryVersion;
      empty(w);
      expect(w.grid.geometryVersion).toBe(gv);
      expect(Buffer.from(attachmentMask(w)).equals(Buffer.from(expected))).toBe(true);
    }
  });

  it('B02 cannot live on an open water cell, and can on the same cell holding an S06 (canOccupy, inoculation); B01 is unaffected', () => {
    const w = barrierDish();
    const cell = cellIndex(70, Y);
    const b02 = w.species[speciesIndex(w, 'B02')]!;
    const b01 = w.species[speciesIndex(w, 'B01')]!;
    expect(canOccupy(w, b02, cell)).toBe(false);
    expect(
      applyNow(w, 'inoc-b02-water', {
        kind: 'inoculate',
        speciesId: 'B02',
        x: 70.5,
        y: Y + 0.5,
        radius: 0,
        count: 1,
      }).result!.accepted,
    ).toBe(0);
    pushDevices(w, [{ kind: 'S06', cell }]);
    expect(canOccupy(w, b02, cell)).toBe(true);
    expect(canOccupy(w, b01, cell)).toBe(true);
    const res = applyNow(w, 'inoc-b02-mesh', {
      kind: 'inoculate',
      speciesId: 'B02',
      x: 70.5,
      y: Y + 0.5,
      radius: 0,
      count: 1,
    }).result!;
    expect(res.accepted).toBe(1);
    const [s] = aliveOf(w, 'B02');
    expect(entityCell(w.ents.cols.x[s!]!, w.ents.cols.y[s!]!)).toBe(cell);
    // It lives there: a few ticks later it is still alive on the mesh.
    run(w, 50);
    expect(aliveOf(w, 'B02').length).toBeGreaterThan(0);
  });
});
