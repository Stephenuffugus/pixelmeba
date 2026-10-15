/**
 * Suggested Communities of the eight Phase 5 habitats (P5.4 part 2; CT §8.2 "Suggested Community places
 * five of each named species in valid cells of a radius-10 patch near its region; previewed and recorded;
 * never silently"; D02 "never inoculate incompatible life silently"; D-0128).
 *
 * Worlds: habitatStart(habitatRegistry(), id, { community: true }, seed), the New Dish route. For every
 * habitat at two seeds: per group exactly five organisms of its species, each in a distinct cell inside
 * its region, within r 10 of the region's anchor and occupiable; the class rules the D-table relies on
 * (water-only species on water, P04 on sediment, the fungi on their attachment surfaces, B10 in brine,
 * H10's two sides, H11's grazers apart from the meadow); the ledger records the community as the input it
 * is; the seeds differ only in the cells. The Empty and Suggested starts differ only in the life and the
 * community patches. A group with too few valid cells is refused, never cropped, by realizeRecipe and by
 * tools/content-validate's check.
 */
import { describe, expect, it } from 'vitest';
import { communityOffered, regionContains } from '../../src/sim/content/habitatRules';
import type { ContentRegistry } from '../../src/sim/content/registry';
import type { HabitatDef } from '../../src/sim/content/schema';
import { FIELD_IDS } from '../../src/sim/fields';
import { cellIndex, diskCells, inDisk, inMask, SUB_GEL, SUB_SEDIMENT, SUB_WATER } from '../../src/sim/grid';
import { canOccupy } from '../../src/sim/movement';
import { applyRecipeOverrides, CommunityError, realizeRecipe, RecipeError, recipeOverridesOf, validPatchCells } from '../../src/sim/recipes';
import { detPermutation, STREAMS } from '../../src/sim/rng';
import { speciesIndex, type World } from '../../src/sim/world';
import { communityRealizationIssues } from '../../tools/content-validate';
import { HABITAT_IDS, habitatRegistry, habitatStart, type HabitatId } from '../helpers/habitats';
import { aliveOf } from '../helpers/world';

const reg = habitatRegistry();
const SEEDS = [104729, 1] as const;
const TOTAL: Readonly<Record<HabitatId, number>> = {
  H04_LEAF_POOL: 25,
  H05_BRINE_MOSAIC: 10,
  H06_DUSK_MARSH: 20,
  H07_GLASS_GARDEN: 20,
  H08_NIGHT_LANTERNS: 15,
  H09_DRYING_LACE: 10,
  H10_GATE_LAB: 10,
  H11_GRAZING_MEADOW: 20,
};
const WATER_ONLY = ['A01', 'A02', 'A03', 'B09', 'P01', 'P05', 'P09', 'P10'];

const cache: Record<string, World> = {};
function start(id: HabitatId, seed: number): World {
  return (cache[`${id}:${seed}`] ??= habitatStart(reg, id, { community: true }, seed));
}

const cellOf = (w: World, slot: number): number => cellIndex(Math.floor(w.ents.cols.x[slot]!), Math.floor(w.ents.cols.y[slot]!));
const xy = (i: number): [number, number] => [i % 128, Math.floor(i / 128)];

function cellsOf(w: World, sp: string): number[] {
  return aliveOf(w, sp).map((s) => cellOf(w, s));
}

describe('Suggested Community placement', () => {
  it('every habitat offers its community under the shipped manifest (the registry with the eight enabled)', () => {
    for (const id of HABITAT_IDS) expect(communityOffered(reg.habitats[id]!, reg.manifest, reg.species), id).toBe(true);
  });

  for (const id of HABITAT_IDS) {
    for (const seed of SEEDS) {
      it(`${id} seed ${seed}: five of each group, distinct cells, in region, within r 10 of the anchor, occupiable`, () => {
        const w = start(id, seed);
        const h = w.content.habitat;
        const groups = h.suggestedCommunity!.groups;
        let total = 0;
        const all: number[] = [];
        for (let s = 0; s < w.ents.highWater; s++) if (w.ents.cols.alive[s] === 1) all.push(cellOf(w, s));
        expect(all.length).toBe(TOTAL[id]);
        expect(new Set(all).size).toBe(all.length);
        for (const g of groups) {
          const region = h.regions!.find((r) => r.id === g.region)!;
          const cells = cellsOf(w, g.species);
          expect(cells.length, `${g.species}`).toBe(5);
          total += cells.length;
          const sp = w.species[speciesIndex(w, g.species)]!;
          for (const i of cells) {
            const [x, y] = xy(i);
            expect(regionContains(region, x, y), `${g.species} (${x},${y}) in ${region.id}`).toBe(true);
            expect(inDisk(x, y, region.anchor[0], region.anchor[1], 10)).toBe(true);
            expect(canOccupy(w, sp, i)).toBe(true);
            // Placed at the cell centre and logged as a community introduction.
            expect(w.ents.cols.x[aliveOf(w, g.species)[cells.indexOf(i)]!]! % 1).toBe(0.5);
          }
        }
        expect(total).toBe(TOTAL[id]);
        // One 'introduce' event per organism, each naming the community as its source.
        const introduced = w.events.ring.filter((e) => e.type === 'introduce');
        expect(introduced.length).toBe(TOTAL[id]);
        for (const e of introduced) expect(e.detail).toEqual({ source: `community:${id}` });
      });
    }
  }

  it('class rules: water-only species on water, P04 on sediment, fungi on their surfaces, B10 in brine', () => {
    for (const seed of SEEDS) {
      for (const id of HABITAT_IDS) {
        const w = start(id, seed);
        for (const g of w.content.habitat.suggestedCommunity!.groups) {
          if (!WATER_ONLY.includes(g.species)) continue;
          for (const i of cellsOf(w, g.species)) expect(w.grid.substrate[i], `${id} ${g.species}`).toBe(SUB_WATER);
        }
      }
      const h06 = start('H06_DUSK_MARSH', seed);
      for (const i of cellsOf(h06, 'P04')) {
        expect(h06.grid.substrate[i]).toBe(SUB_SEDIMENT);
        expect(xy(i)[1]).toBeGreaterThanOrEqual(60);
      }
      const meshAt = (w: World, i: number) => w.devices.some((d) => d.cell === i && d.kind === 'S06');
      const h04 = start('H04_LEAF_POOL', seed);
      for (const i of cellsOf(h04, 'F02')) expect(meshAt(h04, i)).toBe(true);
      const h11 = start('H11_GRAZING_MEADOW', seed);
      for (const i of cellsOf(h11, 'F02')) expect(h11.grid.substrate[i]).toBe(SUB_SEDIMENT);
      const h09 = start('H09_DRYING_LACE', seed);
      for (const i of cellsOf(h09, 'F04')) expect(h09.grid.substrate[i]).toBe(SUB_GEL);
      const h05 = start('H05_BRINE_MOSAIC', seed);
      for (const i of cellsOf(h05, 'B10')) expect(h05.fields.salt![i]).toBeCloseTo(0.6, 12);
      for (const i of cellsOf(h05, 'B01')) expect(h05.fields.salt![i] ?? 0).toBe(0);
    }
  });

  it("H10: the left side's B06 all at x <= 63 and the right side's B01 all at x >= 65; H11's grazers each in its own water", () => {
    for (const seed of SEEDS) {
      const h10 = start('H10_GATE_LAB', seed);
      for (const i of cellsOf(h10, 'B06')) expect(xy(i)[0]).toBeLessThanOrEqual(63);
      for (const i of cellsOf(h10, 'B01')) expect(xy(i)[0]).toBeGreaterThanOrEqual(65);
      const h11 = start('H11_GRAZING_MEADOW', seed);
      const regions = h11.content.habitat.regions!;
      const meadow = regions.find((r) => r.id === 'MEADOW')!;
      const own: Record<string, string> = { P08: 'NORTH_WATER', P09: 'SOUTHWEST_WATER', P10: 'SOUTHEAST_WATER' };
      for (const [sp, rid] of Object.entries(own)) {
        const r = regions.find((x) => x.id === rid)!;
        for (const i of cellsOf(h11, sp)) {
          const [x, y] = xy(i);
          expect(regionContains(r, x, y)).toBe(true);
          expect(regionContains(meadow, x, y)).toBe(false);
          for (const other of Object.values(own)) if (other !== rid) expect(regionContains(regions.find((q) => q.id === other)!, x, y)).toBe(false);
        }
      }
    }
  });

  it("the ledger: 'introduce:community:<id>' equals the founders' starting B, N and bound mineral; H10's starch patch is 0.5 x its cells", () => {
    for (const id of HABITAT_IDS) {
      const w = start(id, 104729);
      const c = w.ents.cols;
      let B = 0;
      let N = 0;
      let M = 0;
      for (let s = 0; s < w.ents.highWater; s++) {
        if (c.alive[s] !== 1) continue;
        B += c.B[s]!;
        N += c.N[s]!;
        M += c.boundMineral[s]!;
      }
      const entries = w.ledger.entries.filter((e) => e.source === `introduce:community:${id}`);
      expect(entries.length, id).toBe(1);
      expect(entries[0]!.c).toBeCloseTo(B, 9);
      expect(entries[0]!.n).toBeCloseTo(N, 9);
      expect(entries[0]!.m).toBeCloseTo(M, 9);
      if (id === 'H07_GLASS_GARDEN') expect(M).toBeGreaterThan(0); // A02 and P05 carry shells
      expect(w.ledger.entries.some((e) => e.source.startsWith('recipe:'))).toBe(false);
    }
    const h10 = start('H10_GATE_LAB', 104729);
    const patch = h10.ledger.entries.filter((e) => e.source === 'community:H10_GATE_LAB:patch0:Starch');
    expect(patch.length).toBe(1);
    const cells = validPatchCells(h10.grid, [55, 64], 6, SUB_WATER);
    expect(cells.length).toBeGreaterThan(100);
    expect(patch[0]!.c).toBeCloseTo(0.5 * cells.length, 9);
    expect(patch[0]!.n).toBe(0);
  });

  it("the cells are exactly the first five of detPermutation(eligible, seed, 'community.place', group index) (recomputed independently)", () => {
    for (const seed of SEEDS) {
      for (const id of HABITAT_IDS) {
        const w = start(id, seed);
        const empty = habitatStart(reg, id, {}, seed);
        const h = w.content.habitat;
        const used = new Set<number>();
        h.suggestedCommunity!.groups.forEach((g, k) => {
          const region = h.regions!.find((r) => r.id === g.region)!;
          const sp = empty.species[speciesIndex(empty, g.species)]!;
          const eligible = diskCells(region.anchor[0], region.anchor[1], 10).filter((i) => {
            const [x, y] = xy(i);
            return inMask(x, y) && regionContains(region, x, y) && canOccupy(empty, sp, i) && !used.has(i);
          });
          const want = detPermutation(eligible.length, seed, STREAMS.communityPlace, k).slice(0, 5).map((j) => eligible[j]!);
          for (const i of want) used.add(i);
          expect(cellsOf(w, g.species).sort((a, b) => a - b), `${id} ${g.species}`).toEqual([...want].sort((a, b) => a - b));
        });
      }
    }
  });

  it('a recorded community choice must be a boolean (recipeOverridesOf: else null, as for the other keys)', () => {
    const w = start('H05_BRINE_MOSAIC', 104729);
    expect(recipeOverridesOf(w)).toEqual({ seed: 104729, empty: true, habitatId: 'H05_BRINE_MOSAIC', community: true });
    const prov = w.content.provenance as unknown as { overrides: Record<string, unknown> };
    const withCommunity = (v: unknown) => ({ ...w, content: { ...w.content, provenance: { ...prov, overrides: { ...prov.overrides, community: v } } } }) as unknown as World;
    expect(recipeOverridesOf(withCommunity('yes'))).toBeNull();
    expect(recipeOverridesOf(withCommunity(1))).toBeNull();
    expect(recipeOverridesOf(withCommunity(false))).not.toBeNull();
  });

  it('the two seeds place the same counts in different cells', () => {
    for (const id of HABITAT_IDS) {
      const a = start(id, SEEDS[0]);
      const b = start(id, SEEDS[1]);
      let differs = false;
      for (const g of a.content.habitat.suggestedCommunity!.groups) {
        const ca = cellsOf(a, g.species).sort((x, y) => x - y);
        const cb = cellsOf(b, g.species).sort((x, y) => x - y);
        expect(cb.length).toBe(ca.length);
        if (ca.join() !== cb.join()) differs = true;
      }
      expect(differs, id).toBe(true);
    }
  });

  it('Empty and Suggested starts share the grid, devices, edges, objects and every field outside the community patches', () => {
    for (const id of HABITAT_IDS) {
      const e = habitatStart(reg, id, {}, 104729);
      const s = start(id, 104729);
      expect(aliveOf(e).length).toBe(0);
      expect(Array.from(s.grid.substrate)).toEqual(Array.from(e.grid.substrate));
      expect(Array.from(s.grid.structure)).toEqual(Array.from(e.grid.structure));
      expect(Array.from(s.grid.lightBase)).toEqual(Array.from(e.grid.lightBase));
      expect(s.devices).toEqual(e.devices);
      expect(s.edges).toEqual(e.edges);
      expect(s.objects).toEqual(e.objects);
      expect(s.settings).toEqual(e.settings);
      const patchCells = new Set<number>();
      for (const p of s.content.habitat.suggestedCommunity!.patches ?? [])
        for (const i of validPatchCells(s.grid, p.center, p.radius, SUB_WATER)) patchCells.add(i);
      expect(patchCells.size > 0).toBe(id === 'H10_GATE_LAB');
      for (const f of FIELD_IDS) {
        const fe = e.fields[f];
        const fs = s.fields[f];
        expect(fs === undefined, `${id} ${f}`).toBe(fe === undefined);
        if (!fe || !fs) continue;
        for (let i = 0; i < fe.length; i++) if (!patchCells.has(i) && fs[i] !== fe[i]) throw new Error(`${id}: field ${f} differs at (${i % 128},${Math.floor(i / 128)})`);
      }
    }
  });
});

describe('a group with too few valid cells is refused, never cropped', () => {
  /** H06 with P04's group moved to a 2 x 2 sediment region: exactly four valid cells for five Siltworms. */
  function tinyRegistry(): ContentRegistry {
    const h = reg.habitats.H06_DUSK_MARSH!;
    const tiny: HabitatDef = {
      ...h,
      regions: [...h.regions!, { id: 'TINY', label: 'Tiny bank', shape: { kind: 'rect', x0: 64, x1: 65, y0: 60, y1: 61 }, anchor: [64, 60] }],
      suggestedCommunity: { ...h.suggestedCommunity!, groups: h.suggestedCommunity!.groups.map((g) => (g.species === 'P04' ? { ...g, region: 'TINY' } : g)) },
    };
    return { ...reg, habitats: { ...reg.habitats, H06_DUSK_MARSH: tiny } };
  }

  it('realizeRecipe throws a RecipeError naming the count, the species and the region', () => {
    const r = tinyRegistry();
    let err: unknown = null;
    try {
      habitatStart(r, 'H06_DUSK_MARSH', { community: true });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RecipeError);
    expect(err).toBeInstanceOf(CommunityError);
    expect((err as Error).message).toBe('habitat H06_DUSK_MARSH: its Suggested Community has only 4 valid cells for 5 Siltworm in Tiny bank');
    expect((err as CommunityError).path).toBe('suggestedCommunity.groups.3');
    // The Empty start of the same habitat is unaffected.
    expect(() => habitatStart(r, 'H06_DUSK_MARSH')).not.toThrow();
  });

  it("P04 in open water: no valid cell at all", () => {
    const h = reg.habitats.H06_DUSK_MARSH!;
    const wet: HabitatDef = { ...h, suggestedCommunity: { ...h.suggestedCommunity!, groups: h.suggestedCommunity!.groups.map((g) => (g.species === 'P04' ? { ...g, region: 'OPEN_WATER' } : g)) } };
    const r: ContentRegistry = { ...reg, habitats: { ...reg.habitats, H06_DUSK_MARSH: wet } };
    expect(() => habitatStart(r, 'H06_DUSK_MARSH', { community: true })).toThrow('has only 0 valid cells for 5 Siltworm in Open water');
  });

  it("tools/content-validate's community check reports it on the habitat's file and group", () => {
    const issues = communityRealizationIssues(tinyRegistry(), [{ file: 'content/habitats/H06_DUSK_MARSH.json', data: { id: 'H06_DUSK_MARSH' } }]);
    expect(issues).toEqual([
      {
        severity: 'error',
        file: 'content/habitats/H06_DUSK_MARSH.json',
        path: 'suggestedCommunity.groups.3',
        message: 'habitat H06_DUSK_MARSH: its Suggested Community has only 4 valid cells for 5 Siltworm in Tiny bank',
      },
    ]);
    // The shipped content (with the eight habitats enabled, and as shipped) passes.
    expect(communityRealizationIssues(reg, [])).toEqual([]);
  });

  it('a recipe asking for a community on a habitat without one is refused', () => {
    expect(() => realizeRecipe(reg, 'FIRST_DISH_V1', { transform: (r) => applyRecipeOverrides(r, { empty: true, community: true }) })).toThrow(
      'recipe FIRST_DISH_V1: habitat WATER_GARDEN has no Suggested Community',
    );
  });
});
