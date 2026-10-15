/**
 * The eight Phase 5 habitats as realized (P5.4; CT §8.2, §4, §5.2, §14; SPEC §2.4, §13.1; D-0106, D-0128).
 * Worlds are Empty New Dish starts (habitatStart: FIRST_DISH_V1 with { empty, habitatId }, as host.ts
 * build() realizes them) under habitatRegistry() (the shipped registry with the eight enabled), plus a bare
 * test recipe on the habitat (its own environment and geometry, no founders) to show both routes realize
 * the same habitat. Per habitat: the worked coordinates of the D-table (substrate, structure, fields, light),
 * the placed structures (count, ids, kinds, cells), the objects and their ledger inputs, the environment
 * (lid, light mode, drying, cycle start) and the regions. Every start round-trips through a save file at
 * tick 0 and after 50 ticks (the import accepts it; equal stateHash).
 * Mutants checked by hand: a furnished disk of r 8 numbered 196 cells; perimeter as the whole disk;
 * withHabitatOverride keeping the recipe's lid (H06 open); objects without the input entry.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeDef } from '../../src/sim/content/schema';
import { regionAnchorCell, regionContains } from '../../src/sim/content/habitatRules';
import { FIELD_IDS, type FieldId } from '../../src/sim/fields';
import { cellIndex, inMask, maskCells, ST_NONE, ST_WALL, SUB_GEL, SUB_SEDIMENT, SUB_WATER } from '../../src/sim/grid';
import { computeTotals, expectedTotals } from '../../src/sim/ledger';
import { applyRecipeOverrides, realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { HABITAT_IDS, habitatRegistry, habitatStart } from '../helpers/habitats';

const reg = habitatRegistry();
const starts = new Map<string, World>();
const start = (id: string): World => {
  if (!starts.has(id)) starts.set(id, habitatStart(reg, id));
  return starts.get(id)!;
};
const at = (x: number, y: number) => cellIndex(x, y);
const sub = (w: World, x: number, y: number) => w.grid.substrate[at(x, y)];
const st = (w: World, x: number, y: number) => w.grid.structure[at(x, y)];
const field = (w: World, f: FieldId, x: number, y: number) => w.fields[f]![at(x, y)]!;
const deviceAt = (w: World, x: number, y: number) => w.devices.find((d) => d.cell === at(x, y))?.kind ?? null;
const ids = (w: World) => [...w.edges.map((e) => e.id), ...w.devices.map((d) => d.id)].sort((a, b) => a - b);
const range = (n: number) => Array.from({ length: n }, (_, k) => k + 1);

/** A bare test recipe on the habitat: its own environment and geometry, no founders. */
function bareRecipe(habitatId: string): RecipeDef {
  return { ...reg.recipes.FIRST_DISH_V1!, id: 'TEST_BARE', habitatId, lid: undefined, lightMode: undefined, drying: undefined, backgroundOverrides: {}, fieldPatches: [], founders: [], scheduledCommands: [] };
}

describe('H04 Leaf Pool', () => {
  const w = start('H04_LEAF_POOL');
  it('water, no stones, light 0.6', () => {
    expect([sub(w, 42, 45), sub(w, 83, 82)]).toEqual([SUB_WATER, SUB_WATER]);
    expect([st(w, 42, 45), st(w, 83, 82)]).toEqual([ST_NONE, ST_NONE]);
    expect(w.grid.lightBase[at(64, 64)]).toBeCloseTo(0.6, 12);
    expect(w.grid.lightBase[at(10, 64)]).toBeCloseTo(0.6, 12);
  });
  it('mesh over r 8 at (64,64), baskets at the wafers: 199 devices, ids 1..199', () => {
    for (const [x, y] of [[64, 56], [64, 72], [56, 64], [72, 64]] as const) expect(deviceAt(w, x, y)).toBe('S06');
    expect(deviceAt(w, 64, 55)).toBeNull();
    expect(deviceAt(w, 45, 64)).toBe('S07');
    expect(deviceAt(w, 80, 64)).toBe('S07');
    expect(w.devices.length).toBe(199);
    expect(w.devices.filter((d) => d.kind === 'S06').length).toBe(197);
    expect(ids(w)).toEqual(range(199));
    // The explicit baskets come first (ids 1, 2), then the mesh row-major (D-0128 id order).
    expect(w.devices.find((d) => d.cell === at(45, 64))!.id).toBe(1);
    expect(w.devices.find((d) => d.cell === at(80, 64))!.id).toBe(2);
    expect(w.devices.find((d) => d.cell === at(64, 56))!.id).toBe(3);
    expect(w.counters.nextDeviceId).toBe(200);
  });
  it('two full wafers, each logged as a habitat input; the ledger balances at tick 0', () => {
    expect(w.objects.map((o) => [o.cell, o.kind, o.pools.starch, o.pools.protein, o.n])).toEqual([
      [at(45, 64), 'wafer', 6, 4, 1],
      [at(80, 64), 'wafer', 6, 4, 1],
    ]);
    // Two inputs of C 10, N 1 (one per wafer); the ledger merges consecutive entries of one source and tick.
    const entries = w.ledger.entries.filter((e) => e.source === 'habitat:H04_LEAF_POOL:M11');
    expect(entries.map((e) => [e.tick, e.c, e.n, e.m])).toEqual([[0, 20, 2, 0]]);
    expect(w.ledger.inputs).toEqual({ c: 20, n: 2, m: 0 });
    const t = computeTotals(w);
    const e = expectedTotals(w);
    expect(t.c).toBeCloseTo(e.c, 9);
    expect(t.n).toBeCloseTo(e.n, 9);
    expect(t.m).toBeCloseTo(e.m, 9);
  });
});

describe('H05 Brine Mosaic', () => {
  const w = start('H05_BRINE_MOSAIC');
  it('gel with two water disks and a channel', () => {
    expect([sub(w, 10, 64), sub(w, 40, 45)]).toEqual([SUB_GEL, SUB_GEL]);
    for (const [x, y] of [[40, 64], [40, 47], [64, 62], [64, 65]] as const) expect(sub(w, x, y), `(${x},${y})`).toBe(SUB_WATER);
    expect([sub(w, 64, 61), sub(w, 64, 66)]).toEqual([SUB_GEL, SUB_GEL]);
  });
  it('salt 0.6 in the right disk (its channel cells too), none in the channel middle or the left pool', () => {
    expect(field(w, 'salt', 88, 64)).toBeCloseTo(0.6, 12);
    expect(field(w, 'salt', 75, 63)).toBeCloseTo(0.6, 12);
    expect(field(w, 'salt', 64, 63)).toBe(0);
    expect(field(w, 'salt', 40, 64)).toBe(0);
    expect(w.devices.length + w.edges.length + w.objects.length).toBe(0);
  });
});

describe('H06 Dusk Marsh', () => {
  const w = start('H06_DUSK_MARSH');
  it('water above y 60, sediment below with its own fields', () => {
    expect(sub(w, 64, 59)).toBe(SUB_WATER);
    expect(sub(w, 64, 60)).toBe(SUB_SEDIMENT);
    expect(field(w, 'oxygen', 64, 30)).toBeCloseTo(0.8, 12);
    expect(field(w, 'oxygen', 64, 90)).toBeCloseTo(0.15, 12);
    expect(field(w, 'detritus', 64, 90)).toBeCloseTo(0.2, 12);
    expect(field(w, 'detritusN', 64, 90)).toBeCloseTo(0.02, 12);
    expect(field(w, 'detritus', 64, 30)).toBe(0);
    expect(field(w, 'detritusN', 64, 30)).toBe(0);
    expect(w.grid.lightBase[at(64, 90)]).toBeCloseTo(0.8, 12);
  });
  it('closed lid and a light cycle from tick 0, through the New Dish route and a bare recipe alike', () => {
    expect(w.settings.lid).toBe('closed');
    expect(w.settings.lightMode).toBe('cycle');
    expect(w.settings.cycleStartTick).toBe(0);
    const bare = realizeRecipe(reg, bareRecipe('H06_DUSK_MARSH'), { seed: 104729 });
    expect([bare.settings.lid, bare.settings.lightMode, bare.settings.cycleStartTick]).toEqual(['closed', 'cycle', 0]);
  });
  it("a recipe's own environment is kept on its own habitat and dropped on another (withHabitatOverride)", () => {
    const own: RecipeDef = { ...bareRecipe('H06_DUSK_MARSH'), lid: 'open', lightMode: 'fixed' };
    const kept = applyRecipeOverrides(own, { habitatId: 'H06_DUSK_MARSH' });
    expect([kept.lid, kept.lightMode]).toEqual(['open', 'fixed']);
    const w2 = realizeRecipe(reg, kept, { seed: 104729 });
    expect([w2.settings.lid, w2.settings.lightMode]).toEqual(['open', 'fixed']);
    const moved = applyRecipeOverrides({ ...own, habitatId: 'WATER_GARDEN' }, { habitatId: 'H06_DUSK_MARSH' });
    expect([moved.lid, moved.lightMode, moved.drying, moved.baseLight, moved.edges, moved.devices, moved.ops, moved.removeStones]).toEqual([undefined, undefined, undefined, undefined, undefined, undefined, [], false]);
  });
});

describe('H07 Glass Garden', () => {
  const w = start('H07_GLASS_GARDEN');
  it('two mesh strips at x 40 and 88, y 35-90: 112 devices', () => {
    for (const [x, y] of [[40, 35], [40, 90], [88, 35], [88, 90]] as const) expect(deviceAt(w, x, y), `(${x},${y})`).toBe('S06');
    for (const [x, y] of [[40, 34], [40, 91], [41, 60]] as const) expect(deviceAt(w, x, y), `(${x},${y})`).toBeNull();
    expect(w.devices.length).toBe(112);
    expect(ids(w)).toEqual(range(112));
  });
  it('silicate 0.3 in every open cell; the ledger starts with exactly that mineral', () => {
    expect(field(w, 'silicate', 64, 64)).toBeCloseTo(0.3, 12);
    expect(field(w, 'silicate', 10, 64)).toBeCloseTo(0.3, 12);
    const open = Array.from(maskCells()).filter((i) => w.grid.structure[i] === ST_NONE).length;
    expect(Math.abs(w.ledger.initial.m - 0.3 * open) / (0.3 * open)).toBeLessThan(1e-12);
  });
});

describe('H08 Night Lanterns', () => {
  const w = start('H08_NIGHT_LANTERNS');
  it('metabolite 0.2 in r 14 at (64,64), closed lid, cycle', () => {
    expect(field(w, 'metabolite', 64, 64)).toBeCloseTo(0.2, 12);
    expect(field(w, 'metabolite', 64, 50)).toBeCloseTo(0.2, 12);
    expect(field(w, 'metabolite', 64, 49)).toBe(0);
    expect(field(w, 'nutrient', 64, 64)).toBeCloseTo(0.1, 12);
    expect(w.settings.lid).toBe('closed');
    expect(w.settings.lightMode).toBe('cycle');
    expect(w.grid.shade[at(64, 64)]).toBe(w.grid.shade[at(10, 64)]);
  });
});

describe('H09 Drying Lace', () => {
  const w = start('H09_DRYING_LACE');
  it('gel with a water channel x 24-31, a wick on its bank and a roof over r 8: 198 devices', () => {
    expect([sub(w, 24, 64), sub(w, 31, 64)]).toEqual([SUB_WATER, SUB_WATER]);
    expect([sub(w, 23, 64), sub(w, 32, 64)]).toEqual([SUB_GEL, SUB_GEL]);
    expect(deviceAt(w, 88, 56)).toBe('S11');
    expect(deviceAt(w, 88, 55)).toBeNull();
    expect(deviceAt(w, 32, 64)).toBe('S12');
    expect(w.devices.find((d) => d.cell === at(32, 64))!.id).toBe(1);
    expect(w.devices.length).toBe(198);
    expect(ids(w)).toEqual(range(198));
  });
  it('drying on, light 0.5', () => {
    expect(w.settings.drying).toBe(true);
    expect(w.grid.lightBase[at(60, 64)]).toBeCloseTo(0.5, 12);
  });
});

describe('H10 Gate Lab', () => {
  const w = start('H10_GATE_LAB');
  it('a wall along x 64 with six open cells at y 61-66', () => {
    for (const [x, y] of [[64, 4], [64, 60], [64, 67], [64, 123]] as const) expect(st(w, x, y), `(${x},${y})`).toBe(ST_WALL);
    for (let y = 61; y <= 66; y++) {
      expect(st(w, 64, y)).toBe(ST_NONE);
      expect(sub(w, 64, y)).toBe(SUB_WATER);
    }
    const walls = Array.from(maskCells()).filter((i) => w.grid.structure[i] === ST_WALL);
    expect(walls.length).toBe(114);
    for (const i of walls) for (const f of FIELD_IDS) {
      const arr = w.fields[f];
      if (arr) expect(arr[i], f).toBe(0);
    }
  });
  it('exactly six S01 edges on the west sides of the open cells', () => {
    expect(w.edges.map((e) => [e.kind, e.dir, e.cell])).toEqual([61, 62, 63, 64, 65, 66].map((y) => ['S01', 'R', at(63, y)]));
    expect(w.edges.map((e) => e.id)).toEqual(range(6));
    expect(w.devices).toEqual([]);
    expect([w.settings.lid, w.settings.lightMode]).toEqual(['open', 'fixed']);
  });
});

describe('H11 Grazing Meadow', () => {
  const w = start('H11_GRAZING_MEADOW');
  it('a sediment disk r 16 ringed by 88 mesh cells', () => {
    expect([sub(w, 64, 64), sub(w, 64, 48)]).toEqual([SUB_SEDIMENT, SUB_SEDIMENT]);
    expect(sub(w, 64, 47)).toBe(SUB_WATER);
    for (const [x, y] of [[64, 48], [48, 64], [80, 64]] as const) expect(deviceAt(w, x, y), `(${x},${y})`).toBe('S06');
    expect(deviceAt(w, 64, 49)).toBeNull();
    expect(deviceAt(w, 64, 64)).toBeNull();
    expect(w.devices.length).toBe(88);
    expect(ids(w)).toEqual(range(88));
    // Every mesh cell is sediment with a water 4-neighbour (D-0106).
    for (const d of w.devices) {
      const x = d.cell % 128;
      const y = Math.floor(d.cell / 128);
      expect(w.grid.substrate[d.cell]).toBe(SUB_SEDIMENT);
      expect(([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => w.grid.substrate[at(x + dx, y + dy)] === SUB_WATER)).toBe(true);
    }
  });
  it('debris in the disk, nutrient 0.15 everywhere, cycle', () => {
    expect(field(w, 'detritus', 64, 64)).toBeCloseTo(0.1, 12);
    expect(field(w, 'detritus', 64, 40)).toBe(0);
    expect(field(w, 'nutrient', 64, 30)).toBeCloseTo(0.15, 12);
    expect(field(w, 'nutrient', 64, 64)).toBeCloseTo(0.15, 12);
    expect(w.settings.lightMode).toBe('cycle');
  });
});

const REGIONS: Record<string, readonly (readonly [string, number, number])[]> = {
  H04_LEAF_POOL: [['WEST_WAFER', 45, 64], ['MESH', 64, 64], ['EAST_WAFER', 80, 64]],
  H05_BRINE_MOSAIC: [['FRESH_POOL', 40, 64], ['BRINE_POOL', 88, 64], ['CHANNEL', 64, 63]],
  H06_DUSK_MARSH: [['OPEN_WATER', 64, 44], ['MARSH_FLOOR', 64, 76]],
  H07_GLASS_GARDEN: [['WEST_BAY', 52, 62], ['EAST_BAY', 76, 62]],
  H08_NIGHT_LANTERNS: [['LANTERN_PATCH', 64, 64]],
  H09_DRYING_LACE: [['CHANNEL', 28, 64], ['ROOF', 88, 64], ['OPEN_GEL', 60, 64]],
  H10_GATE_LAB: [['LEFT_SIDE', 55, 64], ['RIGHT_SIDE', 72, 64], ['MEMBRANES', 63, 63]],
  H11_GRAZING_MEADOW: [['MEADOW', 64, 64], ['NORTH_WATER', 64, 30], ['SOUTHWEST_WATER', 34, 86], ['SOUTHEAST_WATER', 94, 86]],
};

describe('regions and the realized habitat record', () => {
  it.each(HABITAT_IDS)('%s: regions as the D-table, each anchor inside its region on an open cell', (id) => {
    const h = reg.habitats[id]!;
    const regions = h.regions ?? [];
    expect(regions.map((r) => [r.id, r.anchor[0], r.anchor[1]])).toEqual(REGIONS[id]!.map((r) => [...r]));
    for (const r of regions) {
      expect(regionContains(r, r.anchor[0], r.anchor[1]), r.id).toBe(true);
      expect(inMask(r.anchor[0], r.anchor[1])).toBe(true);
      expect(start(id).grid.structure[regionAnchorCell(r)], r.id).toBe(ST_NONE);
    }
    // The world records the habitat it was built on (saves keep it).
    expect(start(id).content.habitat).toEqual(h);
  });
});

describe('a habitat start round-trips through a save file', () => {
  it.each(HABITAT_IDS)('%s at tick 0 and after 50 ticks', async (id) => {
    const w = habitatStart(reg, id);
    for (const ticks of [0, 50]) {
      run(w, ticks);
      const built = await buildSaveFile(w, { name: id, savedAt: '2026-10-15T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
      const loaded = (await loadSaveFile(built.text)).world;
      expect(stateHash(loaded), `${id} t${w.tick}`).toBe(stateHash(w));
    }
  }, 120_000);
});
