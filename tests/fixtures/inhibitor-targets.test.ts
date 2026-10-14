/**
 * Phase 5 wave 11, e2-signals: inhibitor and RIVAL targets for every species (CT §3.4, D02 A6), and the B10
 * Brine and B11 Sour tolerance groups (CT §1.2, §2) — proofs without new code.
 *
 * - Category inhibitors (species.ts inhibitorField; chemistry.ts INHIBITORS): every bacterium B01–B13 →
 *   inhBact; Y01, Y02, F01–F04 → inhFung; A01–A05 → inhPhoto; every consumer, parasite and virus → none.
 * - RIVAL targets by ancestor id: exactly B01, B10, B11 (rivalry.ts RIVAL_TARGETS).
 * - B10: salinity 0.4–0.8, full suitability at 0.6, the 0.20 shoulder below and above (0 at 0.2 and 0.1).
 * - B11: pH 4.5–6, full at 5, the 1.0 shoulder (0 at pH 7); its intake emits 0.40 acid per consumed carbon
 *   through intake.ts's generic acidPerCarbon.
 *
 * Registries use allowUnimplemented: the Phase 5 species' abilities are implemented by this wave and earlier
 * ones and listed as implemented by the lead at the organism flip (D-0104, D-0119).
 */
import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { INHIBITORS, inhibitorCategoryOf } from '../../src/sim/chemistry';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { buildSpeciesTable } from '../../src/sim/species';
import { response, SHOULDER_PH, SHOULDER_SALINITY, suitabilityAt } from '../../src/sim/suitability';
import { step } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import { speciesIndex, type World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, place, registry, setField } from '../helpers/world';

const shipped = registry().manifest;
const ALL_SPECIES = readdirSync(join(__dirname, '../../content/species'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.slice(0, -5))
  .sort();
const ALL = registryWith(
  { enabledSpecies: ALL_SPECIES, enabledSystems: [...new Set([...shipped.enabledSystems, 'rivalry', 'signals', 'silicate'])].sort() as SystemFlag[] },
  { allowUnimplemented: true },
);
const REG = registryWith(
  {
    enabledSpecies: [...shipped.enabledSpecies, 'B09', 'B10', 'B11', 'B13'].sort(),
    enabledModules: [...shipped.enabledModules, 'E02'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'rivalry', 'signals'].sort() as SystemFlag[],
    enabledMaterials: [...shipped.enabledMaterials, 'M06', 'M07', 'M08'].sort(),
  },
  { allowUnimplemented: true },
);

const range = (p: string, a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => `${p}${String(a + k).padStart(2, '0')}`);

describe('A6: inhibitor targets by category and RIVAL targets by ancestor id (CT §3.4)', () => {
  it('every species: B01–B13 → inhBact; Y01, Y02, F01–F04 → inhFung; A01–A05 → inhPhoto; consumers, parasites, viruses → none; RIVAL targets exactly B01, B10, B11', () => {
    expect(ALL_SPECIES).toHaveLength(38); // A01–A05, B01–B13, F01–F04, P01–P10, V01–V02, X01–X02, Y01–Y02
    const defs = ALL.manifest.enabledSpecies.map((id) => ALL.species[id]!);
    const table = buildSpeciesTable(defs);
    const field = Object.fromEntries(table.map((sp) => [sp.id, sp.inhibitorField]));
    const expected: Record<string, string | null> = {};
    for (const id of range('B', 1, 13)) expected[id] = 'inhBact';
    for (const id of ['Y01', 'Y02', ...range('F', 1, 4)]) expected[id] = 'inhFung';
    for (const id of range('A', 1, 5)) expected[id] = 'inhPhoto';
    for (const id of [...range('P', 1, 10), 'X01', 'X02', 'V01', 'V02']) expected[id] = null;
    expect(Object.keys(expected).sort()).toEqual(ALL_SPECIES);
    expect(field).toEqual(expected);
    expect(table.filter((sp) => sp.rivalTarget).map((sp) => sp.id)).toEqual(['B01', 'B10', 'B11']);
    // chemistry.ts's category table agrees with the species table (the inspector and the simulation read the same rule).
    for (const sp of table) {
      const cat = inhibitorCategoryOf(sp.def.category);
      expect(cat === null ? null : INHIBITORS.find((x) => x.category === cat)!.field).toBe(sp.inhibitorField);
    }
  });
});

/** Suitability of a fresh organism of `id` in a cell with the given salt and acid (other factors at the dish's values). */
function suit(w: World, id: string, cell: number) {
  const sp = w.species[speciesIndex(w, id)]!;
  const slot = place(w, id, (cell % 128) + 0.5, Math.floor(cell / 128) + 0.5);
  return { sp, slot, r: suitabilityAt(w, sp, profileOf(w, slot), cell) };
}

describe('B10 Brine and B11 Sour tolerances (CT §2; no new mechanism)', () => {
  it('B10: full at salinity 0.6, the 0.20 shoulder below 0.4 and above 0.8, 0 at 0.2 and 0.1', () => {
    const w = clearWater({}, REG);
    const p = profileOf(w, place(w, 'B10', 20.5, 64.5));
    expect(p.salinity).toEqual([0.4, 0.8]);
    expect(SHOULDER_SALINITY).toBe(0.2);
    const points: readonly [number, number][] = [
      [0.6, 1],
      [0.4, 1],
      [0.8, 1],
      [0.3, response(0.3, 0.4, 0.8, 0.2)],
      [0.9, response(0.9, 0.4, 0.8, 0.2)],
      [0.2, 0],
      [0.1, 0],
    ];
    points.forEach(([salt, expected], k) => {
      const cell = cellIndex(40 + 4 * k, 64);
      setField(w, 'salt', cell, salt);
      const { r } = suit(w, 'B10', cell);
      expect(r.value, `salinity ${salt}`).toBe(expected);
      expect(r.reason).toBe(expected === 1 ? R.NONE : R.SUIT_SALINITY);
    });
    expect(response(0.3, 0.4, 0.8, 0.2)).toBeCloseTo(0.5, 12);
    expect(response(0.9, 0.4, 0.8, 0.2)).toBeCloseTo(0.5, 12);
  });

  it('B11: full at pH 5, the 1.0 pH shoulder (0.5 at 6.5, 0 at 7 and 3.5); its intake emits 0.40 acid per consumed carbon', () => {
    const w = clearWater({}, REG);
    const p = profileOf(w, place(w, 'B11', 20.5, 64.5));
    expect(p.ph).toEqual([4.5, 6]);
    expect(SHOULDER_PH).toBe(1);
    const points: readonly [number, number][] = [
      [5, 1],
      [4.5, 1],
      [6, 1],
      [6.5, 0.5],
      [7, 0],
      [3.5, 0],
    ];
    points.forEach(([ph, expected], k) => {
      const cell = cellIndex(40 + 4 * k, 64);
      // pH = 7 + (base − acid)/(1 + buffer): set acid for the target pH (no base in a clear-water dish).
      const buffer = w.fields.buffer?.[cell] ?? 0;
      const base = w.fields.base?.[cell] ?? 0;
      setField(w, 'acid', cell, base + (7 - ph) * (1 + buffer));
      updateDerived(w);
      expect(w.derived.ph[cell]).toBeCloseTo(ph, 12);
      const { r } = suit(w, 'B11', cell);
      expect(r.value, `pH ${ph}`).toBeCloseTo(expected, 12);
    });
    // Acid per consumed carbon, measured over stage 6 only (acid and sugar read right before and after it).
    const m = clearWater({}, REG);
    const cell = cellIndex(64, 64);
    const buffer = m.fields.buffer?.[cell] ?? 0;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const k = cellIndex(64 + dx, 64 + dy);
        setField(m, 'acid', k, 2 * (1 + buffer)); // pH 5
        setField(m, 'sugar', k, 1);
      }
    updateDerived(m);
    const s = place(m, 'B11', 64.5, 64.5, { E: 40 });
    let measured = 0;
    let consumed = 0;
    for (let t = 0; t < 20; t++) {
      const at: { acid: number; sugar: number }[] = [];
      const c = m.ents.cols;
      let k = -1;
      step(m, {
        afterStage: (st, world) => {
          if (st === 5) {
            k = cellIndex(Math.floor(c.x[s]!), Math.floor(c.y[s]!));
            at.push({ acid: world.fields.acid![k]!, sugar: world.fields.sugar![k]! });
          } else if (st === 6) at.push({ acid: world.fields.acid![k]!, sugar: world.fields.sugar![k]! });
        },
      });
      measured += at[1]!.acid - at[0]!.acid;
      consumed += at[0]!.sugar - at[1]!.sugar;
    }
    expect(consumed).toBeGreaterThan(0);
    expect(measured / consumed).toBeCloseTo(0.4, 9);
  });
});
