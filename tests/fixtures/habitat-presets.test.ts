/**
 * P3.2 habitat presets (CT §8.1; SPEC §2.2, §6.3): every playable cell of Water Garden, Gel Colony and
 * Sediment Edge starts exactly as CT §8.1 says (substrate, structure, light, every field, moisture),
 * the initial ledger is what is preloaded, realization is deterministic, the New Dish habitat starts
 * build the same dishes, and suitability responds to habitat: water-only Sunbead scores 0 on gel,
 * attached Velvet (B02, built from its record) is refused in open water and accepted on gel, sediment,
 * a stone-edge water cell and a porous bead. Habitat paint replaces substrate without deleting life,
 * deposits or fields; the organisms there respond only through ordinary suitability.
 *
 * Expected values are written from CT §8.1 here, independently of the content files; cell counts are
 * the dish geometry (mask r 60 at (63.5, 63.5): 11,304 cells).
 */
import { describe, expect, it } from 'vitest';
import { applyNow } from '../../src/sim/commands';
import { CELL_COUNT } from '../../src/sim/constants';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { FIELD_IDS, type FieldId } from '../../src/sim/fields';
import {
  cellIndex,
  inDisk,
  isStoneEdge,
  maskCells,
  ST_BEAD,
  ST_NONE,
  ST_STONE,
  SUB_GEL,
  SUB_SEDIMENT,
  SUB_WATER,
} from '../../src/sim/grid';
import { computeTotals } from '../../src/sim/ledger';
import { canOccupy } from '../../src/sim/movement';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { realizeRecipe, recipeOverridesOf, withHabitatOverride } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { buildSpeciesTable } from '../../src/sim/species';
import { habitatCompatible, suitabilityAt } from '../../src/sim/suitability';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { FakeClockHost } from '../helpers/host';
import { trajectoryDigest } from '../helpers/trajectory';
import { place, registry } from '../helpers/world';

type Cls = 'water' | 'gel' | 'sediment' | 'stone';

interface Expected {
  readonly cls: Cls;
  readonly light: number;
  readonly fields: Partial<Record<FieldId, number>>;
}

/** CT §8.1, cell by cell. */
const PRESETS: Record<
  string,
  { counts: Partial<Record<Cls, number>>; at: (x: number, y: number) => Expected }
> = {
  WATER_GARDEN: {
    counts: { water: 11304 - 2 * 253, stone: 2 * 253 },
    at: (x, y) =>
      inDisk(x, y, 42, 45, 9) || inDisk(x, y, 83, 82, 9)
        ? { cls: 'stone', light: 0.8, fields: {} }
        : { cls: 'water', light: 0.8, fields: { oxygen: 0.8, co2: 0.5, nutrient: 0.1, sugar: 0.02 } },
  },
  GEL_COLONY: {
    counts: { water: 1200, gel: 11304 - 1200 },
    at: (x) => ({
      cls: x >= 59 && x <= 68 ? 'water' : 'gel',
      light: 0.5,
      fields: { oxygen: 0.8, co2: 0.5, nutrient: 0.1, sugar: 0.1 },
    }),
  },
  SEDIMENT_EDGE: {
    counts: { water: 5123, sediment: 5652, stone: 529 },
    at: (x, y) =>
      inDisk(x, y, 45, 43, 13)
        ? { cls: 'stone', light: 0.8, fields: {} }
        : y < 64
          ? { cls: 'water', light: 0.8, fields: { oxygen: 0.8, co2: 0.5, nutrient: 0.1 } }
          : // PROPOSED DECISION (environment report): 0.010 bound N per sediment cell, the DEBRIS ratio.
            {
              cls: 'sediment',
              light: 0.15,
              fields: { oxygen: 0.2, co2: 0.5, nutrient: 0.1, detritus: 0.1, detritusN: 0.01 },
            },
  },
};

/** A habitat-only dish on `habitatId`, exactly as the New Dish habitat starts build it (host.ts build). */
function preset(habitatId: string, reg: ContentRegistry = registry(), seed = 104729): World {
  const base = reg.recipes.FIRST_DISH_V1!;
  const r = withHabitatOverride(base, habitatId);
  return realizeRecipe(
    reg,
    {
      ...r,
      founders: [],
      fieldPatches: [],
      scheduledCommands: [],
      ...(habitatId === base.habitatId ? { backgroundOverrides: {} } : {}),
    },
    { worldId: habitatId, seed },
  );
}

describe('habitat presets (CT §8.1)', () => {
  for (const id of Object.keys(PRESETS)) {
    it(`${id}: every playable cell's substrate, structure, light, moisture and fields; the initial ledger is what is preloaded`, () => {
      const p = PRESETS[id]!;
      const w = preset(id);
      expect(w.content.habitat.id).toBe(id);
      expect(w.settings.lid).toBe('open');
      expect(w.settings.lightMode).toBe('fixed');
      expect(w.settings.warmth).toBe(0.5);
      const counts: Partial<Record<Cls, number>> = {};
      let bad = 0;
      let c = 0;
      let nn = 0;
      for (const cell of maskCells()) {
        const x = cell % 128;
        const y = Math.floor(cell / 128);
        const e = p.at(x, y);
        counts[e.cls] = (counts[e.cls] ?? 0) + 1;
        const sub = w.grid.substrate[cell];
        const st = w.grid.structure[cell];
        if (e.cls === 'stone') {
          if (st !== ST_STONE) bad++;
        } else {
          if (st !== ST_NONE) bad++;
          if (sub !== { water: SUB_WATER, gel: SUB_GEL, sediment: SUB_SEDIMENT }[e.cls]) bad++;
          if (w.derived.moisture[cell] !== (e.cls === 'water' ? 1 : 0.8)) bad++;
        }
        if (w.grid.lightBase[cell] !== e.light) bad++;
        if (w.grid.shade[cell] !== 1) bad++;
        if (e.cls !== 'stone' && w.derived.light[cell] !== e.light) bad++;
        if (w.derived.ph[cell] !== 7) bad++;
        for (const f of FIELD_IDS) {
          const arr = w.fields[f];
          if (!arr) continue;
          if (arr[cell] !== (e.fields[f] ?? 0)) bad++;
        }
        c += (e.fields.sugar ?? 0) + (e.fields.co2 ?? 0) + (e.fields.detritus ?? 0);
        nn += (e.fields.nutrient ?? 0) + (e.fields.detritusN ?? 0);
      }
      expect(counts).toEqual(p.counts);
      expect(bad).toBe(0);
      expect(w.ents.count).toBe(0);
      expect(w.ledger.initialized).toBe(true);
      expect(w.ledger.inputs).toEqual({ c: 0, n: 0, m: 0 });
      const t = computeTotals(w);
      expect(w.ledger.initial).toEqual({ c: t.c, n: t.n, m: t.m });
      expect(w.ledger.initial.c).toBeCloseTo(c, 8);
      expect(w.ledger.initial.n).toBeCloseTo(nn, 8);
      expect(w.ledger.initial.m).toBe(0);
    });
  }

  it('realization is deterministic (state hash and biology digest), and a tick of each preset keeps its ledger', () => {
    for (const id of Object.keys(PRESETS)) {
      const a = preset(id);
      const b = preset(id);
      expect(stateHash(a)).toBe(stateHash(b));
      expect(trajectoryDigest(a, 'full')).toBe(trajectoryDigest(b, 'full'));
      step(a);
      step(b);
      expect(stateHash(a)).toBe(stateHash(b));
    }
  });

  it('the New Dish habitat starts build these presets: CT §8.1 exactly (no sugar override), recorded in provenance', () => {
    for (const [habitatId, start] of [
      ['GEL_COLONY', 'Empty Gel Colony'],
      ['SEDIMENT_EDGE', 'Empty Sediment Edge'],
    ] as const) {
      const h = new FakeClockHost();
      h.create(start, {
        kind: 'recipe',
        recipeId: 'FIRST_DISH_V1',
        seed: 104729,
        overrides: { mutationPreset: 'standard', founderMode: 'identical', empty: true, habitatId },
      });
      const w = h.world;
      expect(w.content.habitat.id).toBe(habitatId);
      expect(recipeOverridesOf(w)).toEqual({
        seed: 104729,
        empty: true,
        habitatId,
        mutationPreset: 'standard',
        founderMode: 'identical',
      });
      const ref = preset(habitatId);
      expect(trajectoryDigest(w, 'full')).toBe(trajectoryDigest(ref, 'full'));
      if (habitatId === 'GEL_COLONY') expect(w.fields.sugar![cellIndex(30, 64)]).toBe(0.1);
      // The preview carries the same layout (habitatGrid) and the habitat's rules text.
      h.host.handle({
        type: 'newDishPreview',
        requestId: 9001,
        recipeId: 'FIRST_DISH_V1',
        seed: 104729,
        overrides: { empty: true, habitatId },
      });
      const msg = h.out.find((m) => m.type === 'newDishPreview' && m.requestId === 9001);
      if (!msg || msg.type !== 'newDishPreview') throw new Error('no preview');
      expect(msg.preview.habitat.name).toBe(w.content.habitat.name);
      expect(msg.preview.habitat.rules).toBe(w.content.habitat.guide.rules);
      expect(msg.preview.empty).toBe(true);
      expect(msg.preview.founders).toEqual([]);
      expect(Array.from(msg.preview.habitat.grid!.substrate)).toEqual(Array.from(w.grid.substrate));
      expect(Array.from(msg.preview.habitat.grid!.structure)).toEqual(Array.from(w.grid.structure));
      expect(msg.preview.ledger.total.c).toBeCloseTo(computeTotals(w).c, 9);
    }
    // An unknown or unshipped habitat builds nothing.
    const h = new FakeClockHost();
    h.host.handle({
      type: 'create',
      requestId: 1,
      dishId: 'bad',
      source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1', overrides: { empty: true, habitatId: 'H05' } },
    });
    expect(h.out.some((m) => m.type === 'error')).toBe(true);
    expect(h.out.some((m) => m.type === 'ready')).toBe(false);
    // The Garden's own habitat changes nothing: Empty Water Garden still has no sugar (its recipe's override).
    const wg = new FakeClockHost();
    wg.create('wg', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', overrides: { empty: true } });
    expect(wg.world.fields.sugar![cellIndex(64, 64)]).toBe(0);
  });
});

describe('suitability responds to habitat (SPEC §2.2, §6.3)', () => {
  it('Sunbead (water only) is 0 on gel and fine in the channel; Velvet is refused in open water and accepted on every surface', () => {
    const w = preset('GEL_COLONY');
    const sunbead = place(w, 'A01', 30.5, 64.5);
    const s = w.species[w.ents.cols.species[sunbead]!]!;
    const prof = profileOf(w, sunbead);
    const onGel = suitabilityAt(w, s, prof, cellIndex(30, 64));
    expect(onGel.value).toBe(0);
    expect(onGel.reason).toBe(R.SUIT_HABITAT);
    expect(suitabilityAt(w, s, prof, cellIndex(64, 64)).value).toBeGreaterThan(0);

    const [velvet] = buildSpeciesTable([registry().species.B02!]);
    const v = velvet!;
    // Gel Colony: gel yes, channel water no.
    expect(habitatCompatible(w, v, cellIndex(30, 64))).toBe(true);
    expect(habitatCompatible(w, v, cellIndex(64, 64))).toBe(false);
    // Sediment Edge: sediment yes, open water no, a water cell beside the stone yes, a porous bead yes.
    const e = preset('SEDIMENT_EDGE');
    expect(habitatCompatible(e, v, cellIndex(64, 100))).toBe(true);
    const open = cellIndex(100, 30);
    expect(e.grid.substrate[open]).toBe(SUB_WATER);
    expect(isStoneEdge(e.grid, open)).toBe(false);
    expect(habitatCompatible(e, v, open)).toBe(false);
    const edge = maskCells().find((c) => e.grid.substrate[c] === SUB_WATER && isStoneEdge(e.grid, c))!;
    expect(edge).toBeDefined();
    expect(habitatCompatible(e, v, edge)).toBe(true);
    applyNow(e, 'bead', { kind: 'placeStructure', structure: 'bead', points: [[100.5, 30.5]], radius: 1 });
    expect(e.grid.structure[open]).toBe(ST_BEAD);
    expect(habitatCompatible(e, v, open)).toBe(true);
    // A free swimmer (Sprinter) may not sit on the bead; Velvet's profile-free check is the same rule.
    const sprinter = e.species.find((x) => x.id === 'B01')!;
    expect(canOccupy(e, sprinter, open)).toBe(false);
    expect(canOccupy(e, sprinter, cellIndex(100, 20))).toBe(true);
  });

  it('habitat paint keeps life, deposits and fields; the newly unsuitable organism responds only through suitability', () => {
    const w = preset('WATER_GARDEN');
    const cell = cellIndex(64, 30);
    const slot = place(w, 'A01', 64.5, 30.5, { E: 60 });
    applyNow(w, 'starch', {
      kind: 'deposit',
      materialId: 'STARCH',
      points: [[64.5, 30.5]],
      radius: 0.5,
      dose: 0.5,
    });
    const fields = FIELD_IDS.filter((f) => w.fields[f]).map((f) => w.fields[f]!.slice());
    const before = {
      x: w.ents.cols.x[slot],
      y: w.ents.cols.y[slot],
      B: w.ents.cols.B[slot],
      E: w.ents.cols.E[slot],
      H: w.ents.cols.H[slot],
    };
    const sp = w.species[w.ents.cols.species[slot]!]!;
    expect(suitabilityAt(w, sp, profileOf(w, slot), cell).value).toBeGreaterThan(0);
    const r = applyNow(w, 'gel', {
      kind: 'paintSubstrate',
      substrate: 'gel',
      points: [[64.5, 30.5]],
      radius: 3,
    }).result!;
    expect(r.accepted).toBeGreaterThan(0);
    expect(w.grid.substrate[cell]).toBe(SUB_GEL);
    // Nothing was deleted or moved: the organism, the starch deposit and every field are as they were.
    expect(w.ents.cols.alive[slot]).toBe(1);
    expect({
      x: w.ents.cols.x[slot],
      y: w.ents.cols.y[slot],
      B: w.ents.cols.B[slot],
      E: w.ents.cols.E[slot],
      H: w.ents.cols.H[slot],
    }).toEqual(before);
    FIELD_IDS.filter((f) => w.fields[f]).forEach((f, k) => expect(w.fields[f]!, f).toEqual(fields[k]));
    expect(w.fields.starch![cell]).toBe(0.5);
    // It now responds through ordinary suitability: 0 for habitat, the explained reason.
    const now = suitabilityAt(w, sp, profileOf(w, slot), cell);
    expect(now.value).toBe(0);
    expect(now.reason).toBe(R.SUIT_HABITAT);
    step(w);
    expect(w.ents.cols.alive[slot]).toBe(1); // no instant removal: stress acts over time
    expect(w.ents.cols.suitability[slot]).toBe(0);
    for (let i = 0; i < CELL_COUNT; i++) if (i !== cell) expect(w.fields.starch![i]).toBe(0);
  });
});
