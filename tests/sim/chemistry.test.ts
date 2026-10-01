/**
 * P3.1 Chemistry and environment materials (SPEC §2.3, §4.1–4.5; CT §3.4, §5.1, §12.2, §13).
 *
 * Stage 2 (src/sim/transport.ts stageEnvironment: diffuse → gas exchange → decays → neutralize →
 * derived) and the readings the cell inspector shows (src/sim/chemistry.ts): neutralization, the pH
 * display, salinity, inhibitor decay and category targets, film halving exposure once, growth and
 * damage from exposure, the lid, sediment's slower gas exchange, shade, and the ledger of every Lab
 * material. Already proven elsewhere and not repeated here: open-lid exchange toward 0.8/0.5 and its
 * carbon ledger, closed lid on one tick, and pH/neutralization next to diffusion
 * (tests/sim/transport.test.ts); shade paint × 0.1 / erase → 1.0 and substrate paint
 * (tests/sim/lab-commands.test.ts 'paint substrate (P2.7)' and 'shade (P2.7)').
 */
import { describe, expect, it } from 'vitest';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import { CELL_COUNT, DT, INHIBITOR_DAMAGE } from '../../src/sim/constants';
import type { ContentRegistry } from '../../src/sim/content/registry';
import type { RecipeDef } from '../../src/sim/content/schema';
import {
  cellPh,
  exposureBreakdown,
  INHIBITORS,
  inhibitorCategoryOf,
  lightFactors,
  phDisplay,
  salinityIndex,
} from '../../src/sim/chemistry';
import { FIELD_DEFS, FIELD_IDS, type FieldId } from '../../src/sim/fields';
import { cellIndex, maskCells, SUB_SEDIMENT } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { stageMaintenance } from '../../src/sim/maintenance';
import { profileOf } from '../../src/sim/profiles';
import { realizeRecipe } from '../../src/sim/recipes';
import { buildSpeciesTable } from '../../src/sim/species';
import { inhibitorExposure, suitabilityAt } from '../../src/sim/suitability';
import { step } from '../../src/sim/tick';
import { stageEnvironment, updateDerived } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { G2_LISTS, registryWith, withEnabled } from '../helpers/registry';
import { clearWater, fillField, place, rebaseLedger, registry } from '../helpers/world';

function sum(w: World, id: FieldId): number {
  const a = w.fields[id]!;
  let s = 0;
  for (const k of maskCells()) s += a[k]!;
  return s;
}

/** A clear-water dish (no stones, no sugar, no life) realized from `reg`. */
function clearWaterOf(reg: ContentRegistry, overrides: Partial<RecipeDef> = {}): World {
  const base = reg.recipes.FIRST_DISH_V1!;
  return realizeRecipe(
    reg,
    {
      ...base,
      id: 'TEST_CHEM',
      removeStones: true,
      fieldPatches: [],
      founders: [],
      scheduledCommands: [],
      backgroundOverrides: { sugar: 0 },
      mutationPreset: 'fixed',
      ...overrides,
    },
    { worldId: 'chem' },
  );
}

let n = 0;
function cmd(w: World, payload: CommandPayload) {
  const c = applyNow(w, `chem-${++n}`, payload);
  return c.result!;
}

const C = cellIndex(64, 64);
const INHIBITOR_MATERIAL: Partial<Record<FieldId, string>> = {
  inhBact: 'INH_BACT',
  inhFung: 'INH_FUNG',
  inhPhoto: 'INH_PHOTO',
};

describe('acid, base and buffer (SPEC §4.3)', () => {
  it('equal equivalents neutralize each tick: acid 0.30 and base 0.20 everywhere leave acid 0.10 and base 0', () => {
    const w = clearWater();
    fillField(w, 'acid', 0.3);
    fillField(w, 'base', 0.2);
    step(w);
    for (const k of maskCells()) {
      expect(w.fields.acid![k]).toBeCloseTo(0.1, 12);
      expect(w.fields.base![k]).toBe(0);
    }
    // pH display follows: 7 + (0 − 0.10)/(1 + 0).
    expect(w.derived.ph[C]).toBeCloseTo(6.9, 12);
  });

  it('pH_display = clamp(7 + (base − acid)/(1 + buffer), 2, 12); stored amounts are never clamped', () => {
    const cases: [number, number, number, number][] = [
      [0, 0, 0, 7],
      [0, 3, 0, 10],
      [0, 6, 0, 12],
      [2, 0, 1, 6],
      [20, 0, 0, 2],
    ];
    for (const [acid, base, buffer, ph] of cases) {
      expect(phDisplay(acid, base, buffer)).toBe(ph);
      const w = clearWater();
      w.fields.acid![C] = acid;
      w.fields.base![C] = base;
      w.fields.buffer![C] = buffer;
      for (const id of ['acid', 'base', 'buffer'] as const) w.derived.fieldActive[FIELD_IDS.indexOf(id)] = 1;
      updateDerived(w);
      expect(w.derived.ph[C]).toBe(ph);
      expect(cellPh(w, C)).toBe(ph);
      expect([w.fields.acid![C], w.fields.base![C], w.fields.buffer![C]]).toEqual([acid, base, buffer]);
    }
    // A whole dish at base 6: a tick (diffusion, decay, neutralization) keeps 6 stored; the display says 12.
    const w = clearWater();
    fillField(w, 'base', 6);
    step(w);
    expect(w.fields.base![C]).toBe(6);
    expect(w.derived.ph[C]).toBe(12);
  });
});

describe('salt (SPEC §4.3; CT §13)', () => {
  it('salinity index is the salt amount, unclamped; salt diffuses, never decays, and its total is constant over 1,000 ticks', () => {
    const w = clearWater();
    w.settings.lid = 'closed';
    w.fields.salt![C] = 3;
    w.derived.fieldActive[FIELD_IDS.indexOf('salt')] = 1;
    expect(salinityIndex(w, C)).toBe(3); // may exceed 1
    const before = sum(w, 'salt');
    for (let t = 0; t < 1000; t++) stageEnvironment(w);
    expect(Math.abs(sum(w, 'salt') - before)).toBeLessThan(1e-12);
    expect(w.fields.salt![C]).toBeLessThan(3); // it spread
    expect(w.fields.salt![cellIndex(70, 64)]).toBeGreaterThan(0);
    // A uniform dish keeps exactly its salt: no decay at all.
    const u = clearWater();
    fillField(u, 'salt', 0.5);
    for (let t = 0; t < 100; t++) stageEnvironment(u);
    for (const k of maskCells()) expect(u.fields.salt![k]).toBe(0.5);
  });
});

describe('inhibitors (SPEC §4.3; CT §3.4)', () => {
  it('each inhibitor loses exactly 0.2 % per tick (filled everywhere, so diffusion moves nothing)', () => {
    for (const { field } of INHIBITORS) {
      const w = clearWater();
      fillField(w, field, 0.5);
      let v = 0.5;
      for (let t = 0; t < 5; t++) {
        step(w);
        v = v * (1 - 0.002);
        for (const k of maskCells()) expect(w.fields[field]![k]).toBe(v);
      }
    }
  });

  it('a single dosed cell also loses some to diffusion in that tick; the dish total loses exactly 0.2 %', () => {
    for (const { field } of INHIBITORS) {
      const w = clearWater();
      const materialId = INHIBITOR_MATERIAL[field]!;
      expect(
        cmd(w, { kind: 'deposit', materialId, points: [[64.5, 64.5]], radius: 0.5, dose: 0.5 }).accepted,
      ).toBe(1);
      step(w);
      expect(w.fields[field]![C]).toBeLessThan(0.5 * (1 - 0.002));
      expect(w.fields[field]![cellIndex(65, 64)]).toBeGreaterThan(0);
      expect(sum(w, field)).toBeCloseTo(0.5 * (1 - 0.002), 12);
    }
  });

  it('each inhibitor affects exactly its CT §3.4 targets, across all 38 species records', () => {
    const reg = registry();
    const records = Object.keys(reg.species)
      .sort()
      .map((id) => reg.species[id]!);
    expect(records.length).toBe(38);
    const table = buildSpeciesTable(records);
    // CT §3.4, by ID: parasites, viruses and animals are unaffected.
    const ids = (p: string, a: number, b: number) =>
      Array.from({ length: b - a + 1 }, (_, k) => `${p}${String(a + k).padStart(2, '0')}`);
    const targets: Record<string, readonly string[]> = {
      inhBact: ids('B', 1, 13),
      inhFung: [...ids('F', 1, 4), 'Y01', 'Y02'], // record ID order
      inhPhoto: ids('A', 1, 5),
    };
    const w = clearWater();
    for (const { field, category } of INHIBITORS) {
      for (const f of ['inhBact', 'inhFung', 'inhPhoto'] as const) w.fields[f]![C] = f === field ? 0.4 : 0;
      const hit = table.filter((sp) => inhibitorExposure(w, sp, C) > 0).map((sp) => sp.id);
      expect(hit, field).toEqual(targets[field]);
      for (const sp of table) {
        const e = inhibitorExposure(w, sp, C);
        expect(e).toBe(targets[field]!.includes(sp.id) ? 0.4 : 0);
        expect(inhibitorCategoryOf(sp.def.category) === category).toBe(targets[field]!.includes(sp.id));
      }
    }
  });

  it('growth × 1/(1 + exposure) and 8 × exposure health per second; other categories untouched', () => {
    const w = clearWater();
    const v = 0.25;
    fillField(w, 'inhBact', v);
    const b01 = place(w, 'B01', 64.5, 64.5, { E: 50 });
    const a01 = place(w, 'A01', 64.5, 64.5, { E: 50 });
    const sp = (slot: number) => w.species[w.ents.cols.species[slot]!]!;
    const prof = (slot: number) => profileOf(w, slot);
    expect(suitabilityAt(w, sp(b01), prof(b01), C).value).toBeCloseTo(1 / (1 + v), 15);
    expect(suitabilityAt(w, sp(b01), prof(b01), C).exposure).toBe(v);
    expect(suitabilityAt(w, sp(a01), prof(a01), C).exposure).toBe(0);
    const line = exposureBreakdown(w, C).lines.find((l) => l.category === 'bacterial')!;
    expect(line).toMatchObject({ amount: v, exposure: v, growthFactor: 1 / (1 + v), damagePerSecond: 8 * v });
    w.ents.cols.dmgInhib[b01] = 0;
    w.ents.cols.dmgInhib[a01] = 0;
    stageMaintenance(w);
    expect(w.ents.cols.dmgInhib[b01]).toBeCloseTo(INHIBITOR_DAMAGE * v * DT, 15);
    expect(INHIBITOR_DAMAGE * v * DT).toBeCloseTo(8 * 0.25 * 0.1, 15);
    expect(w.ents.cols.dmgInhib[a01]).toBe(0);
  });

  it('film halves total exposure once (D-0008)', () => {
    const reg = withEnabled(registry(), { systems: ['film'] });
    const w = clearWaterOf(reg);
    expect(w.fields.film).toBeDefined();
    const [b01] = buildSpeciesTable([registry().species.B01!]);
    w.fields.inhBact![C] = 0.4;
    expect(inhibitorExposure(w, b01!, C)).toBe(0.4);
    w.fields.film![C] = 0.01;
    expect(inhibitorExposure(w, b01!, C)).toBe(0.2);
    const bd = exposureBreakdown(w, C);
    expect(bd.filmHalves).toBe(true);
    expect(bd.lines.map((l) => [l.category, l.amount, l.exposure])).toEqual([
      ['bacterial', 0.4, 0.2],
      ['fungal', 0, 0],
      ['photosynthetic', 0, 0],
    ]);
  });

  it("enabling 'chemistry' allocates the three inhibitor fields at zero (no material, nothing ledgered); the g2 content set allocates none", () => {
    const w = clearWater();
    for (const id of ['inhBact', 'inhFung', 'inhPhoto'] as const) {
      expect(FIELD_DEFS[id]).toMatchObject({ system: 'chemistry', material: 'none', diffusion: 'normal' });
      expect(w.fields[id]!.every((v) => v === 0)).toBe(true);
    }
    const g2 = clearWaterOf(registryWith(G2_LISTS));
    expect(g2.fields.inhBact).toBeUndefined();
    expect(exposureBreakdown(g2, C).lines).toEqual([]);
  });
});

describe('gas exchange and the lid (SPEC §4.2)', () => {
  it('a closed lid exchanges nothing for 100 ticks: exchangeC, oxygen and CO2 stay exactly as they were', () => {
    const w = clearWater();
    applyNow(w, 'lid', { kind: 'setLid', lid: 'closed' });
    fillField(w, 'oxygen', 0.2);
    fillField(w, 'co2', 0.1);
    for (let t = 0; t < 100; t++) step(w);
    expect(w.ledger.exchangeC).toBe(0);
    expect(w.ledger.exchangeO2).toBe(0);
    for (const k of maskCells()) {
      expect(w.fields.oxygen![k]).toBe(0.2);
      expect(w.fields.co2![k]).toBe(0.1);
    }
    expect(checkLedger(w).ok).toBe(true);
  });

  it('sediment exchanges at 0.1 × the water rate', () => {
    const w = clearWater();
    for (const k of maskCells()) if (Math.floor(k / 128) >= 64) w.grid.substrate[k] = SUB_SEDIMENT;
    w.grid.geometryVersion++;
    fillField(w, 'oxygen', 0.2);
    fillField(w, 'co2', 0.1);
    stageEnvironment(w);
    // Cells far from the boundary: every neighbour equal, so diffusion moves nothing.
    expect(w.fields.oxygen![cellIndex(64, 20)]).toBeCloseTo(0.2 + 0.02 * 0.6, 15);
    expect(w.fields.oxygen![cellIndex(64, 100)]).toBeCloseTo(0.2 + 0.002 * 0.6, 15);
    expect(w.fields.co2![cellIndex(64, 20)]).toBeCloseTo(0.1 + 0.02 * 0.4, 15);
    expect(w.fields.co2![cellIndex(64, 100)]).toBeCloseTo(0.1 + 0.002 * 0.4, 15);
  });
});

describe('light (SPEC §4.4)', () => {
  it('shade changes only light, × 0.1; the inspector factors are baseline × shade', () => {
    const w = clearWater();
    const fields = FIELD_IDS.filter((id) => w.fields[id]).map((id) => w.fields[id]!.slice());
    const before = w.derived.light[C]!;
    expect(lightFactors(w, C)).toEqual({ baseline: 0.8, shade: 1, effective: before });
    expect(
      cmd(w, { kind: 'paintShade', erase: false, points: [[64.5, 64.5]], radius: 1 }).accepted,
    ).toBeGreaterThan(0);
    expect(w.derived.light[C]).toBeCloseTo(before * 0.1, 15);
    expect(lightFactors(w, C)).toEqual({ baseline: 0.8, shade: 0.1, effective: w.derived.light[C] });
    FIELD_IDS.filter((id) => w.fields[id]).forEach((id, k) => expect(w.fields[id]!).toEqual(fields[k]));
  });
});

describe('Lab materials: deposits, companions and the ledger (SPEC §2.3, §3.4; CT §5.1)', () => {
  const DOSE = 0.5;

  it('every enabled material input is ledgered by what it adds, including companion N; oxygen is not a ledgered material', () => {
    const w = clearWater();
    const mats = w.content.materials.filter((m) => m.kind === 'field' || m.kind === 'deposit');
    expect(mats.map((m) => m.id)).toEqual([
      'ACID',
      'BASE',
      'BUFFER',
      'CO2',
      'DEBRIS',
      'INH_BACT',
      'INH_FUNG',
      'INH_PHOTO',
      'METABOLITE',
      'NUTRIENT',
      'OIL',
      'OXYGEN',
      'PROTEIN',
      'SALT',
      'STARCH',
      'SUGAR',
    ]);
    for (const m of mats) {
      const before = { ...w.ledger.inputs };
      const totals = computeTotals(w);
      const r = cmd(w, { kind: 'deposit', materialId: m.id, points: [[64.5, 64.5]], radius: 3, dose: DOSE });
      expect(r.accepted, m.id).toBeGreaterThan(0);
      const def = FIELD_DEFS[m.target as FieldId];
      const added = r.accepted * DOSE;
      const companion = def.companion ? added * m.companionNutrientPerCarbon : 0;
      const dC = def.material === 'carbon' ? added : 0;
      const dN = (def.material === 'nutrient' ? added : 0) + companion;
      expect(w.ledger.inputs.c - before.c, m.id).toBeCloseTo(dC, 12);
      expect(w.ledger.inputs.n - before.n, m.id).toBeCloseTo(dN, 12);
      expect(w.ledger.inputs.m - before.m, m.id).toBe(0);
      // Dish totals are sums over ~11,000 cells: equal to summation round-off.
      const after = computeTotals(w);
      expect(after.c - totals.c, m.id).toBeCloseTo(dC, 8);
      expect(after.n - totals.n, m.id).toBeCloseTo(dN, 8);
      expect(checkLedger(w).ok, m.id).toBe(true);
    }
    // Organic debris carries 0.10 N per C as detritusN; CO2 is carbon; oxygen is display-only.
    expect(w.content.materials.find((m) => m.id === 'DEBRIS')!.companionNutrientPerCarbon).toBe(0.1);
    expect(w.fields.detritusN![C]).toBeCloseTo(DOSE * 0.1, 15);
    expect(FIELD_DEFS.co2.material).toBe('carbon');
    expect(FIELD_DEFS.oxygen.material).toBe('none');
    for (let t = 0; t < 50; t++) step(w);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('deposits never diffuse: starch, oil, protein and debris stay exactly in their cells', () => {
    const w = clearWater();
    w.settings.lid = 'closed';
    rebaseLedger(w);
    const ids = ['STARCH', 'OIL', 'PROTEIN', 'DEBRIS'];
    for (const id of ids)
      cmd(w, { kind: 'deposit', materialId: id, points: [[64.5, 64.5]], radius: 0.5, dose: DOSE });
    for (let t = 0; t < 100; t++) stageEnvironment(w);
    for (const f of ['starch', 'oil', 'protein', 'detritus', 'detritusN'] as const) {
      const a = w.fields[f]!;
      let elsewhere = 0;
      for (let k = 0; k < CELL_COUNT; k++) if (k !== C && a[k] !== 0) elsewhere++;
      expect(elsewhere, f).toBe(0);
      expect(a[C], f).toBe(f === 'detritusN' ? DOSE * 0.1 : DOSE);
    }
  });
});
