/**
 * Curated dishes L301, L303, L304, L306 (CT §9.3; D04 §8; P3.9) and the recipe extensions they and the
 * P3.9 experiments use: recipe `ops` (W5-11), founder placement 'scatter' (W5-12), listed `cells`,
 * `initial` values (W5-13) and `links: 'chain'`.
 *
 * Curated dishes: Water Garden defaults elsewhere (stones, background sugar 0.02), lid open, fixed
 * light 0.8, Standard evolution, founders scattered among the valid cells of their patch with the
 * recipe seed (= the recipe number). Pre-seeded genomes are labelled (L306's Matrix builder);
 * Diverse founders' abilities are their own founder.module draws, present at creation.
 */
import { describe, expect, it } from 'vitest';
import type { RecipeDef } from '../../src/sim/content/schema';
import { diverseModuleFor, founderSummary } from '../../src/sim/founders';
import { cellIndex, diskCells, inMask, SUB_GEL, SUB_WATER } from '../../src/sim/grid';
import { field as lineageField } from '../../src/sim/lineage';
import { canOccupy } from '../../src/sim/movement';
import { fungalLinkKind, LINK_TRANSPORT } from '../../src/sim/links';
import { detPermutation, STREAMS } from '../../src/sim/rng';
import { realizeRecipe, RecipeError, recipeGrid, recipeShapeProblems } from '../../src/sim/recipes';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import { canonicalJson } from '../../src/sim/hash';
import { speciesIndex, type World } from '../../src/sim/world';
import { registry } from '../experiments/helpers';

const CURATED = ['L301_TWO_LUNCHES', 'L303_PUBLIC_KITCHEN', 'L304_EMPTY_AFTER_THE_FEAST', 'L306_BORROWED_SHELTER'] as const;

/** Lattice cells within r of (cx, cy) (SPEC §13.1 patch mask: squared distance ≤ r²). */
function diskCount(r: number): number {
  let n = 0;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) n++;
  return n;
}

interface Founder {
  readonly slot: number;
  readonly birthId: number;
  readonly species: string;
  readonly cell: number;
  readonly modules: readonly string[];
  readonly origin: number;
}

/** Living founders in birth order (generation 0, tick 0). */
function founders(w: World): Founder[] {
  const c = w.ents.cols;
  const out: Founder[] = [];
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1 || c.generation[i] !== 0) continue;
    out.push({
      slot: i,
      birthId: c.birthId[i]!,
      species: w.species[c.species[i]!]!.id,
      cell: cellIndex(Math.floor(c.x[i]!), Math.floor(c.y[i]!)),
      modules: w.genomes.get(c.genome[i]!).modules,
      origin: lineageField(w.lineage, 'origin', c.birthId[i]!) ?? 0,
    });
  }
  return out.sort((a, b) => a.birthId - b.birthId);
}

/** The cells a scatter group takes, computed independently: row-major eligible disk cells, permuted by the recipe seed. */
function expectedScatter(w: World, recipe: RecipeDef, group: number, used: Set<number>): number[] {
  const f = recipe.founders[group]!;
  const sp = w.species[speciesIndex(w, f.species)]!;
  const eligible: number[] = [];
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      if ((x - f.center[0]) ** 2 + (y - f.center[1]) ** 2 > f.radius ** 2 || !inMask(x, y)) continue;
      const i = cellIndex(x, y);
      if (!used.has(i) && canOccupy(w, sp, i)) eligible.push(i);
    }
  return detPermutation(eligible.length, w.seed, STREAMS.founderPlace, group)
    .slice(0, f.count)
    .map((k) => eligible[k]!);
}

describe('curated dishes (CT §9.3)', () => {
  const reg = registry();

  it('ship with seed = recipe number, Water Garden defaults, lid open, fixed light 0.8, Standard evolution and a question', () => {
    const expected: Record<string, { seed: number; mode: string; question: string }> = {
      L301_TWO_LUNCHES: { seed: 301, mode: 'varied', question: 'Do separate neighborhoods stay different?' },
      L303_PUBLIC_KITCHEN: { seed: 303, mode: 'diverse', question: 'Who benefits from accessible food?' },
      L304_EMPTY_AFTER_THE_FEAST: { seed: 304, mode: 'diverse', question: 'What happens when success consumes its opportunity?' },
      L306_BORROWED_SHELTER: { seed: 306, mode: 'identical', question: 'Who pays for the film, who benefits?' },
    };
    for (const id of CURATED) {
      const r = reg.recipes[id]!;
      expect(r.phase, id).toBeLessThanOrEqual(reg.manifest.buildPhase);
      expect(r.seed, id).toBe(expected[id]!.seed);
      expect(r.founderMode, id).toBe(expected[id]!.mode);
      expect(r.question, id).toBe(expected[id]!.question);
      expect(r.habitatId, id).toBe('WATER_GARDEN');
      expect(r.removeStones, id).toBe(false);
      expect(r.backgroundOverrides, id).toEqual({});
      expect(r.mutationPreset, id).toBe('standard');
      for (const f of r.founders) expect(f.placement, id).toBe('scatter');
      const w = realizeRecipe(reg, id);
      expect(w.seed, id).toBe(expected[id]!.seed);
      expect(w.settings.lid, id).toBe('open');
      expect(w.settings.lightMode, id).toBe('fixed');
      // Fixed light 0.8 everywhere in the dish; stones stay (Water Garden defaults).
      let stones = 0;
      for (let i = 0; i < 128 * 128; i++) if (inMask(i % 128, Math.floor(i / 128))) {
        expect(w.grid.lightBase[i]).toBe(0.8);
        if (w.grid.structure[i] !== 0) stones++;
      }
      expect(stones, id).toBe(2 * diskCount(9));
      // Background sugar 0.02 away from the patches.
      expect(w.fields.sugar![cellIndex(64, 20)], id).toBe(0.02);
    }
    // Only L306 seeds genomes, and it says so.
    expect(reg.recipes.L306_BORROWED_SHELTER!.labels).toContain('Pre-seeded genomes');
    for (const id of ['L301_TWO_LUNCHES', 'L303_PUBLIC_KITCHEN', 'L304_EMPTY_AFTER_THE_FEAST']) expect(reg.recipes[id]!.labels).not.toContain('Pre-seeded genomes');
  });

  it('realize with exact counts, patch cells and patch totals', () => {
    const cases: Record<string, { founders: Record<string, number>; patches: { cells: number; c: number; n: number }[] }> = {
      L301_TWO_LUNCHES: { founders: { B01: 60 }, patches: [{ cells: 197, c: 0.5, n: 0.2 }, { cells: 197, c: 0.5, n: 0.2 }] },
      // Protein 0.5 C with 0.05 bound N; free nutrient set to 0.1, the Water Garden's own value (no change logged).
      L303_PUBLIC_KITCHEN: { founders: { Y02: 20, B08: 20 }, patches: [{ cells: 197, c: 0.5, n: 0.05 }] },
      L304_EMPTY_AFTER_THE_FEAST: { founders: { B01: 60 }, patches: [{ cells: 317, c: 0.8, n: 0.2 }] },
      L306_BORROWED_SHELTER: { founders: { B06: 40 }, patches: [{ cells: 197, c: 0.6, n: 0.2 }] },
    };
    expect(diskCount(8)).toBe(197);
    for (const id of CURATED) {
      const recipe = reg.recipes[id]!;
      const w = realizeRecipe(reg, id);
      const counts: Record<string, number> = {};
      for (const f of founders(w)) counts[f.species] = (counts[f.species] ?? 0) + 1;
      expect(counts, id).toEqual(cases[id]!.founders);
      cases[id]!.patches.forEach((p, k) => {
        const patch = recipe.fieldPatches[k]!;
        const sub = patch.substrate === 'gel' ? SUB_GEL : SUB_WATER;
        const cells = diskCells(patch.center[0], patch.center[1], patch.radius).filter((i) => w.grid.substrate[i] === sub && w.grid.structure[i] === 0);
        expect(cells.length, `${id} patch ${k}`).toBe(p.cells);
        const entry = w.ledger.entries.find((e) => e.source.startsWith(`recipe:patch${k}`))!;
        expect(entry.c, `${id} patch ${k} carbon`).toBeCloseTo(p.cells * p.c, 9);
        expect(entry.n, `${id} patch ${k} nutrient`).toBeCloseTo(p.cells * p.n, 9);
      });
      // Every founder stands on its own group's patch cells.
      for (const f of founders(w)) {
        const x = f.cell % 128;
        const y = Math.floor(f.cell / 128);
        expect(recipe.fieldPatches.some((p) => (x - p.center[0]) ** 2 + (y - p.center[1]) ** 2 <= p.radius ** 2), `${id} founder at (${x},${y})`).toBe(true);
      }
    }
  });

  it('the initial ledger is exactly the preloads: the habitat, each patch and each founder', () => {
    for (const id of CURATED) {
      const w = realizeRecipe(reg, id);
      const L = w.ledger;
      let c = 0;
      let n = 0;
      for (const e of L.entries) {
        expect(e.tick).toBe(0);
        expect(e.source, id).toMatch(new RegExp(`^(recipe:patch\\d+(:.*)?|introduce:recipe:${id}|recipe:${id}:initial)$`));
        c += e.c;
        n += e.n;
      }
      expect(L.inputs.c, id).toBeCloseTo(c, 9);
      expect(L.inputs.n, id).toBeCloseTo(n, 9);
      const introduced = founders(w).reduce((a, f) => a + w.species[speciesIndex(w, f.species)]!.def.b0, 0);
      const patches = L.entries.filter((e) => e.source.startsWith('recipe:patch')).reduce((a, e) => a + e.c, 0);
      expect(L.inputs.c, id).toBeCloseTo(introduced + patches, 9);
      expect(L.energy.earned, id).toBe(0);
    }
  });

  it('placement is the documented scatter: deterministic, seed-dependent, never a repeated cell, and not nearest-first', () => {
    for (const id of CURATED) {
      const recipe = reg.recipes[id]!;
      const a = realizeRecipe(reg, id);
      const b = realizeRecipe(reg, id);
      expect(canonicalJson(serializeWorld(a)), id).toBe(canonicalJson(serializeWorld(b)));
      expect(stateHash(a)).toBe(stateHash(b));
      const fa = founders(a);
      expect(new Set(fa.map((f) => f.cell)).size, id).toBe(fa.length);
      // Independently computed: row-major eligible cells permuted by det(seed, 'founder.place', group).
      const used = new Set<number>();
      let k = 0;
      recipe.founders.forEach((f, g) => {
        const cells = expectedScatter(a, recipe, g, used);
        for (const cell of cells) used.add(cell);
        expect(fa.slice(k, k + f.count).map((x) => x.cell), `${id} group ${g}`).toEqual(cells);
        k += f.count;
      });
      // Another seed scatters differently; nearest-first would pack the founders around the centre.
      const other = founders(realizeRecipe(reg, id, { seed: recipe.seed + 1 }));
      expect(other.map((f) => f.cell), id).not.toEqual(fa.map((f) => f.cell));
      const nearest = founders(realizeRecipe(reg, id, { transform: (r) => ({ ...r, founders: r.founders.map((f) => ({ ...f, placement: 'nearest' as const })) }) }));
      expect(nearest.map((f) => f.cell), id).not.toEqual(fa.map((f) => f.cell));
    }
  });

  it('L301 carries no modules; L306 has Matrix builder on exactly the 20 odd founders (lineage origin 2)', () => {
    const l301 = founders(realizeRecipe(reg, 'L301_TWO_LUNCHES'));
    for (const f of l301) {
      expect(f.modules).toEqual([]);
      expect(f.origin).toBe(1);
    }
    const w = realizeRecipe(reg, 'L306_BORROWED_SHELTER');
    const l306 = founders(w);
    expect(l306).toHaveLength(40);
    l306.forEach((f, k) => {
      const odd = (k + 1) % 2 === 1;
      expect(f.modules, `founder ${k + 1}`).toEqual(odd ? ['E10'] : []);
      expect(f.origin, `founder ${k + 1}`).toBe(odd ? 2 : 1);
    });
    const summary = founderSummary(w);
    expect(summary).toHaveLength(1);
    expect(summary[0]!.withModule).toBe(20);
    expect(summary[0]!.modules).toEqual([{ id: 'E10', count: 20 }]);
    // The recipe's gel disk is painted by its own ops.
    expect(w.grid.substrate[cellIndex(64, 64)]).toBe(SUB_GEL);
    expect(w.grid.substrate[cellIndex(64, 64 + 9)]).toBe(SUB_WATER);
  });

  it('L303 and L304 (Diverse) carry only their own founder.module draws at creation, as founderSummary reports', () => {
    for (const id of ['L303_PUBLIC_KITCHEN', 'L304_EMPTY_AFTER_THE_FEAST']) {
      const w = realizeRecipe(reg, id);
      const fs = founders(w);
      const byModule: Record<string, Record<string, number>> = {};
      let seeded = 0;
      for (const f of fs) {
        // Each founder's ability is exactly the stateless draw for its birthId (none declared by the recipe).
        const draw = diverseModuleFor(w, f.species, f.birthId, []);
        expect(f.modules, `${id} birth ${f.birthId}`).toEqual(draw === null ? [] : [draw]);
        expect(f.origin, `${id} birth ${f.birthId}`).toBe(draw === null ? 1 : 2);
        if (draw !== null) {
          seeded++;
          (byModule[f.species] ??= {})[draw] = (byModule[f.species]![draw] ?? 0) + 1;
        }
      }
      for (const row of founderSummary(w)) {
        const sp = w.species[row.species]!.id;
        const mine = byModule[sp] ?? {};
        expect(row.withModule, `${id} ${sp}`).toBe(Object.values(mine).reduce((a, b) => a + b, 0));
        expect(row.modules, `${id} ${sp}`).toEqual(Object.keys(mine).sort().map((m) => ({ id: m, count: mine[m]! })));
      }
      // Only legal Phase 3 gains (D-0059: B01 E01/E03/E04/E05/E10/E12; Y02 E01/E03/E04/E05/E09; B08 E03/E04/E05).
      const legal: Record<string, readonly string[]> = { B01: ['E01', 'E03', 'E04', 'E05', 'E10', 'E12'], Y02: ['E01', 'E03', 'E04', 'E05', 'E09'], B08: ['E03', 'E04', 'E05'] };
      for (const f of fs) for (const m of f.modules) expect(legal[f.species], `${id} ${f.species} ${m}`).toContain(m);
      // About 10 % of eligible founders (an independent chance each): some, never most.
      expect(seeded, id).toBeLessThan(fs.length / 2);
    }
  });
});

describe('recipe extensions (P3.9): ops, listed cells, initial values, chain links', () => {
  const reg = registry();

  it('a recipe’s own ops paint exactly recipeGrid(), and recipes without ops keep the habitat grid', () => {
    for (const id of [...CURATED, 'FUNGAL_SUPPLY_LINE_V1', 'FIRST_DISH_V1', 'SHARED_LUNCH_V1']) {
      const r = reg.recipes[id]!;
      const w = realizeRecipe(reg, id);
      const g = recipeGrid(reg.habitats[r.habitatId]!, r);
      expect(Array.from(w.grid.substrate), id).toEqual(Array.from(g.substrate));
      expect(Array.from(w.grid.structure), id).toEqual(Array.from(g.structure));
      expect(w.grid.geometryVersion, id).toBe(1);
    }
    expect(reg.recipes.FIRST_DISH_V1!.ops).toEqual([]);
  });

  it('chain links and initial values: FUNGAL_SUPPLY_LINE_V1 links its listed segments in order', () => {
    const w = realizeRecipe(reg, 'FUNGAL_SUPPLY_LINE_V1');
    const fs = founders(w);
    expect(fs.map((f) => [f.cell % 128, Math.floor(f.cell / 128)])).toEqual([
      [60, 64],
      [61, 64],
      [62, 64],
      [63, 64],
    ]);
    expect(fungalLinkKind(w, fs[0]!.slot, fs[1]!.slot)).toBe(LINK_TRANSPORT);
    expect(fungalLinkKind(w, fs[1]!.slot, fs[2]!.slot)).toBe(LINK_TRANSPORT);
    expect(fungalLinkKind(w, fs[2]!.slot, fs[3]!.slot)).toBe(LINK_TRANSPORT);
    expect(fungalLinkKind(w, fs[0]!.slot, fs[2]!.slot)).toBe(0);
    const initial = w.ledger.entries.find((e) => e.source === 'recipe:FUNGAL_SUPPLY_LINE_V1:initial')!;
    expect([initial.c, initial.n]).toEqual([2, expect.closeTo(0.2, 12)]);
    // An E other than 50 goes to the energy ledger, never to the material inputs.
    const hot = realizeRecipe(reg, 'FUNGAL_SUPPLY_LINE_V1', {
      transform: (r) => ({ ...r, founders: r.founders.map((f) => ({ ...f, initial: [{ B: 4, N: 0.4, E: 80 }, {}, {}, { E: 30 }] })) }),
    });
    expect(hot.ledger.inputs.c).toBe(w.ledger.inputs.c);
    expect(hot.ledger.energy.earned).toBe(30);
    expect(hot.ledger.energy.other).toBe(20);
  });

  it('refuses bad founder cells, links and initial lists (registry problem and RecipeError)', () => {
    const base = reg.recipes.FUNGAL_SUPPLY_LINE_V1!;
    const habitat = reg.habitats.WATER_GARDEN!;
    const withGroup = (patch: Partial<RecipeDef['founders'][number]>): RecipeDef => ({ ...base, founders: [{ ...base.founders[0]!, ...patch }] });
    const problems = (r: RecipeDef) => recipeShapeProblems(r, habitat, reg.species).map((p) => `${p.path}: ${p.message}`);
    expect(problems(base)).toEqual([]);
    expect(problems(withGroup({ cells: [[60, 64], [61, 64], [61, 64], [63, 64]] })).join(' ')).toMatch(/listed twice/);
    expect(problems(withGroup({ cells: [[60, 64], [61, 64], [63, 64], [62, 64]] })).join(' ')).toMatch(/not a four-neighbour/);
    expect(problems(withGroup({ cells: [[60, 64], [61, 64], [62, 64]] })).join(' ')).toMatch(/lists 3 cells for 4/);
    expect(problems(withGroup({ initial: [{}, {}] })).join(' ')).toMatch(/2 entries for 4 founders/);
    expect(problems(withGroup({ placement: 'scatter' })).join(' ')).toMatch(/exclude each other/);
    expect(problems(withGroup({ cells: [[60, 64], [61, 64], [62, 64], [66, 64]] })).join(' ')).toMatch(/outside r 2/);
    expect(problems({ ...withGroup({ species: 'B01' }) }).join(' ')).toMatch(/does not form transport links/);
    expect(problems({ ...base, ops: [{ op: 'rect', x0: 5, x1: 4, y0: 0, y1: 1 }] }).join(' ')).toMatch(/x0 ≤ x1/);
    // A listed cell the species cannot occupy (a stone) is refused at realization, never moved.
    const stone: RecipeDef = { ...base, removeStones: false, founders: [{ ...base.founders[0]!, center: [42, 45], radius: 3, cells: [[42, 45], [43, 45], [44, 45], [45, 45]] }] };
    expect(problems(stone).join(' ')).toMatch(/holds a structure/);
    expect(() => realizeRecipe(reg, stone)).toThrow(RecipeError);
  });
});
