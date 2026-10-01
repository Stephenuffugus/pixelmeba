/**
 * P3.7 E07 Light seeker (SPEC §6.4, §6.7, §9 E07; CT §7.1; D04 §5 "E07 Light seeker", §13 "A light
 * seeker is trapped or resting"; BUILD_DIRECTIVE P3.7, W4-04, W4-09, W4-10; src/sim/lightSeeker.ts).
 *
 *  - The brighter-by rule: an A01 carrier beside a cell 0.009 brighter never moves; beside one 0.01
 *    brighter it moves into that cell and stays there. In a 0.01-per-cell gradient it climbs, and the
 *    light of its cell never falls.
 *  - Cost: exactly 0.10 × (0.5 + g_mot)² × dt of 'movement' on each tick it moved (neutral g and
 *    g = 0.8), and nothing on stationary ticks or while walled off from brighter light (trapped).
 *  - Barriers and habitat: it never crosses a wall toward brighter light, nor enters bright gel.
 *  - Loci: motility and sensing are active for carriers in phenotype (0.15 and 2 become the mapped
 *    baselines), mutation (a quantitative draw can pick them) and branch qualification (a motility
 *    difference qualifies only between carriers).
 *  - Lineage: the summary reports the per-second cost instead of a per-cell cost; the "Game rule:"
 *    lines say "moving costs {v} energy per second" and "senses light up to {v} cells away".
 *  - Loss: a carrier whose genome loses E07 stops where it is.
 *  - The ledger closes; Σ energy spent = Σ ledger categories.
 *
 * Light is set per cell through grid.lightBase (geometryVersion bumped, updateDerived), since shade
 * paint only gives ×0.1 steps. Worlds: clear water (FIRST_DISH_V1 without stones, background sugar 0)
 * under the shipped manifest plus E04 and E07 (registryWith; the lead enables them after the wave).
 */
import { describe, expect, it } from 'vitest';
import { qualifies, sharedActiveLoci } from '../../src/sim/branches';
import { applyNow, introduceOrganism } from '../../src/sim/commands';
import { DT, GRID_W } from '../../src/sim/constants';
import { L_MOTILITY, L_SENSING, neutralGenome } from '../../src/sim/genome';
import { cellIndex, maskCells, ST_NONE, ST_WALL, SUB_GEL } from '../../src/sim/grid';
import { FIELD_IDS } from '../../src/sim/fields';
import { checkLedger } from '../../src/sim/ledger';
import { profileSummary } from '../../src/sim/lineage';
import { MUT_QUANT, draftDaughter } from '../../src/sim/mutation';
import { activeLoci } from '../../src/sim/phenotype';
import { profileOf } from '../../src/sim/profiles';
import { realizeRecipe } from '../../src/sim/recipes';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import { speciesIndex, type World } from '../../src/sim/world';
import { ruleLines } from '../../src/ui/strings/lineage';
import { registryWith } from '../helpers/registry';
import { registry, setField } from '../helpers/world';

const SHIPPED_MODULES = registry().manifest.enabledModules;
const REG = registryWith({ enabledModules: [...SHIPPED_MODULES, 'E04', 'E07'].sort() });

const Y = 64;

function dish(mutationPreset: 'fixed' | 'accelerated' = 'fixed'): World {
  const base = REG.recipes.FIRST_DISH_V1!;
  return realizeRecipe(
    REG,
    { ...base, id: 'TEST_E07', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset },
    { worldId: 'e07' },
  );
}

/** Set the light baseline of every dish cell from `f(x, y)` (test setup; light is not an inventory). */
function setLight(w: World, f: (x: number, y: number) => number): void {
  for (const cell of maskCells()) w.grid.lightBase[cell] = f(cell % GRID_W, Math.floor(cell / GRID_W));
  w.grid.geometryVersion++;
  updateDerived(w);
}

function lightAt(w: World, x: number, y: number): number {
  return w.derived.light[cellIndex(Math.floor(x), Math.floor(y))]!;
}

/** An A01 at a cell centre, carrying E07 unless `modules` says otherwise; `loci` overrides genome loci. */
function sunbead(w: World, x: number, modules: readonly string[] = ['E07'], loci: Readonly<Record<number, number>> = {}): number {
  const sp = speciesIndex(w, 'A01');
  const base = neutralGenome('A01');
  const l = [...base.loci];
  for (const [k, v] of Object.entries(loci)) l[Number(k)] = v;
  const genome = w.genomes.intern({ ...base, loci: l, modules: [...modules] });
  const slot = introduceOrganism(w, sp, cellIndex(Math.floor(x), Y), 'test', { genome, exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  rebuildIndex(w);
  return slot;
}

/** Step `n` ticks recording, per tick, the movement energy charged and the distance moved by `s`. */
function track(w: World, s: number, n: number): { cost: number; moved: number }[] {
  const out: { cost: number; moved: number }[] = [];
  for (let k = 0; k < n; k++) {
    const before = w.ledger.energy.movement;
    step(w);
    out.push({ cost: w.ledger.energy.movement - before, moved: w.ents.cols.movedThisTick[s]! });
  }
  return out;
}

describe('P3.7 E07 light seeker', () => {
  it('a 0.009 brighter neighbour is ignored: it never moves and pays nothing (brighter-by 0.01 rule)', () => {
    const w = dish();
    setLight(w, (x, y) => (x === 31 && y === Y ? 0.509 : 0.5));
    const s = sunbead(w, 30.5);
    const x0 = w.ents.cols.x[s]!;
    const ticks = track(w, s, 120);
    for (const t of ticks) {
      expect(t.moved).toBe(0);
      expect(t.cost).toBe(0);
    }
    expect(w.ents.cols.x[s]).toBe(x0);
    expect(w.ents.cols.moveMode[s]).toBe(0);
  });

  it('a 0.01 brighter neighbour is reached, then it stays (no wander)', () => {
    const w = dish();
    setLight(w, (x, y) => (x === 31 && y === Y ? 0.51 : 0.5));
    const s = sunbead(w, 30.5);
    const c = w.ents.cols;
    const ticks = track(w, s, 200);
    expect(Math.floor(c.x[s]!)).toBe(31);
    expect(Math.floor(c.y[s]!)).toBe(Y);
    // It moved, then stopped for good: every tick after the last moving one is free and still.
    const last = ticks.map((t) => t.moved > 0).lastIndexOf(true);
    expect(last).toBeGreaterThan(0);
    expect(last).toBeLessThan(150);
    for (const t of ticks.slice(last + 1)) {
      expect(t.moved).toBe(0);
      expect(t.cost).toBe(0);
    }
  });

  it('climbs a 0.01-per-cell gradient; the light of its cell never falls', () => {
    const w = dish();
    setLight(w, (x) => Math.min(1, 0.3 + 0.01 * Math.max(0, x - 20)));
    const s = sunbead(w, 30.5);
    const c = w.ents.cols;
    let light = lightAt(w, c.x[s]!, c.y[s]!);
    for (let k = 0; k < 400; k++) {
      step(w);
      const now = lightAt(w, c.x[s]!, c.y[s]!);
      expect(now).toBeGreaterThanOrEqual(light);
      light = now;
    }
    expect(c.x[s]!).toBeGreaterThan(34);
  });

  it('pays exactly 0.10 × (0.5 + g)² × dt on moving ticks and nothing on still ticks (neutral g and g = 0.8)', () => {
    for (const g of [50, 80]) {
      const w = dish();
      setLight(w, (x) => Math.min(1, 0.3 + 0.01 * Math.max(0, x - 20)));
      const s = sunbead(w, 30.5, ['E07'], { [L_MOTILITY]: g });
      const prof = profileOf(w, s);
      const mf = 0.5 + g / 100;
      expect(prof.motilityFactor).toBeCloseTo(mf, 12);
      expect(prof.speed).toBeCloseTo(0.15 * mf, 12);
      const per = 0.1 * mf * mf * DT;
      const ticks = track(w, s, 200);
      let moving = 0;
      for (const t of ticks) {
        if (t.moved > 0) {
          moving++;
          expect(t.cost).toBeCloseTo(per, 12);
        } else expect(t.cost).toBe(0);
      }
      expect(moving).toBeGreaterThan(100);
    }
  });

  it('never crosses a wall toward brighter light (edge-checked trace); trapped ticks cost nothing', () => {
    const w = dish();
    // A one-cell-thick wall at x 32 (test-only geometry written straight into the grid, its cells
    // emptied of solutes first and logged as exports): brighter open water at x 33 is within the
    // carrier's sensing radius 2, but only through the wall.
    const wallCells: number[] = [];
    for (let y = Y - 10; y <= Y + 10; y++) wallCells.push(cellIndex(32, y));
    for (const cell of wallCells) {
      for (const id of FIELD_IDS) {
        const f = w.fields[id];
        if (f !== undefined && f[cell]! !== 0) setField(w, id, cell, 0);
      }
      w.grid.structure[cell] = ST_WALL;
    }
    setLight(w, (x) => (x >= 33 ? 0.9 : 0.5));
    const s = sunbead(w, 31.5);
    expect(profileOf(w, s).sensing).toBe(2);
    const ticks = track(w, s, 200);
    for (const t of ticks) {
      expect(t.moved).toBe(0);
      expect(t.cost).toBe(0);
    }
    expect(Math.floor(w.ents.cols.x[s]!)).toBe(31);
    expect(checkLedger(w).ok).toBe(true);
    // Control: with the wall removed it does go east.
    for (const cell of wallCells) w.grid.structure[cell] = ST_NONE;
    setLight(w, (x) => (x >= 33 ? 0.9 : 0.5));
    track(w, s, 300);
    expect(w.ents.cols.x[s]!).toBeGreaterThan(33);
  });

  it('never enters brighter gel (habitat rule)', () => {
    const w = dish();
    const gel = [];
    for (let y = Y - 6; y <= Y + 6; y++) gel.push([36.5, y + 0.5] as [number, number]);
    applyNow(w, 'e07-gel', { kind: 'paintSubstrate', substrate: 'gel', points: gel, radius: 3 } as never);
    expect(w.grid.substrate[cellIndex(33, Y)]).toBe(SUB_GEL);
    expect(w.grid.substrate[cellIndex(32, Y)]).not.toBe(SUB_GEL);
    setLight(w, (x) => (x >= 32 ? 0.9 : 0.5));
    const s = sunbead(w, 30.5);
    for (let k = 0; k < 300; k++) {
      step(w);
      expect(w.grid.substrate[cellIndex(Math.floor(w.ents.cols.x[s]!), Math.floor(w.ents.cols.y[s]!))]).not.toBe(SUB_GEL);
    }
    // It did go toward the light, as far as the water allows.
    expect(Math.floor(w.ents.cols.x[s]!)).toBe(32);
  });

  it('activates the motility and sensing loci for carriers: phenotype, mutation and branch qualification', () => {
    const w = dish('accelerated');
    const sp = w.species[speciesIndex(w, 'A01')]!;
    const plainG = { ...neutralGenome('A01'), id: '' };
    const seekG = { ...plainG, modules: ['E07'] };
    expect(activeLoci(sp, plainG)[L_MOTILITY]).toBe(false);
    expect(activeLoci(sp, plainG)[L_SENSING]).toBe(false);
    expect(activeLoci(sp, seekG)[L_MOTILITY]).toBe(true);
    expect(activeLoci(sp, seekG)[L_SENSING]).toBe(true);
    // Phenotype: the recorded baselines, scaled by the stored loci.
    const plain = sunbead(w, 20.5, []);
    const neutral = sunbead(w, 24.5);
    const tuned = sunbead(w, 28.5, ['E07'], { [L_MOTILITY]: 80, [L_SENSING]: 100 });
    expect(profileOf(w, plain).speed).toBe(0);
    expect(profileOf(w, plain).sensing).toBe(0);
    expect(profileOf(w, plain).selfPropelled).toBe(false);
    expect(profileOf(w, neutral).speed).toBeCloseTo(0.15, 12);
    expect(profileOf(w, neutral).sensing).toBe(2);
    expect(profileOf(w, neutral).selfPropelled).toBe(true);
    expect(profileOf(w, tuned).speed).toBeCloseTo(0.15 * 1.3, 12);
    expect(profileOf(w, tuned).sensing).toBe(3);
    // Mutation: quantitative draws can pick motility or sensing only for a carrier.
    const parentPlain = w.genomes.get(w.ents.cols.genome[plain]!);
    const parentSeek = w.genomes.get(w.ents.cols.genome[neutral]!);
    const picked = (parent: typeof parentPlain) => {
      const loci = new Set<number>();
      for (let pb = 1; pb <= 3000; pb++) {
        for (const d of [0, 1]) {
          const draft = draftDaughter(w, parent, pb, d);
          if (draft.flags & MUT_QUANT) loci.add(draft.locus);
        }
      }
      return loci;
    };
    const plainLoci = picked(parentPlain);
    const seekLoci = picked(parentSeek);
    expect(plainLoci.size).toBeGreaterThan(0);
    expect(plainLoci.has(L_MOTILITY) || plainLoci.has(L_SENSING)).toBe(false);
    expect(seekLoci.has(L_MOTILITY)).toBe(true);
    expect(seekLoci.has(L_SENSING)).toBe(true);
    // Branch qualification: a motility difference of 15 qualifies between carriers only.
    const fast = (base: typeof plainG) => ({ ...base, loci: base.loci.map((v, l) => (l === L_MOTILITY ? v + 15 : v)) });
    const ai = speciesIndex(w, 'A01');
    expect(qualifies(seekG, fast(seekG), sharedActiveLoci(w, ai, seekG, fast(seekG)))).toBe(true);
    expect(qualifies(plainG, fast(plainG), sharedActiveLoci(w, ai, plainG, fast(plainG)))).toBe(false);
  });

  it('lineage: the summary reports the per-second cost; the Game rule lines name light and per-second cost', () => {
    const w = dish();
    const plain = profileOf(w, sunbead(w, 20.5, []));
    const seek = profileOf(w, sunbead(w, 24.5));
    const a = profileSummary(plain);
    const b = profileSummary(seek);
    expect(b.moveCostPerCell).toBe(0);
    expect(b.moveCostPerSecond).toBeCloseTo(0.1, 12);
    expect(b.sensesLight).toBe(true);
    expect(a.moveCostPerSecond).toBeUndefined();
    const lines = ruleLines({ ancestor: a, branch: b, modules: [] });
    expect(lines).toContain('Game rule: it senses light up to 2 cells away (ancestor: none).');
    expect(lines).toContain('Game rule: moving costs 0.1 energy per second (ancestor: it did not move on its own).');
    expect(lines.some((l) => l.includes('each cell it moves costs'))).toBe(false);
    // Two carriers with different motility: the per-second costs are compared.
    const fast = profileOf(w, sunbead(w, 28.5, ['E07'], { [L_MOTILITY]: 80 }));
    const lines2 = ruleLines({ ancestor: b, branch: profileSummary(fast), modules: [] });
    expect(lines2).toContain('Game rule: moving costs 0.17 energy per second (ancestor: 0.1).');
    // An ordinary swimmer keeps the per-cell line.
    const b01 = profileSummary(profileOf(w, introduceOrganism(w, speciesIndex(w, 'B01'), cellIndex(40, Y), 'test', { exactCenter: true })));
    expect(b01.moveCostPerCell).toBeCloseTo(0.2, 12);
    expect(b01.moveCostPerSecond).toBeUndefined();
  });

  it('module loss: a carrier whose genome loses E07 stops where it is', () => {
    const w = dish();
    setLight(w, (x) => Math.min(1, 0.3 + 0.01 * Math.max(0, x - 20)));
    const s = sunbead(w, 30.5);
    const c = w.ents.cols;
    for (let k = 0; k < 60; k++) step(w);
    // Test-only: swap in the same genome without E07 (what a daughter that lost it inherits).
    const g = w.genomes.get(c.genome[s]!);
    c.genome[s] = w.genomes.intern({ ...g, modules: [] });
    const x0 = c.x[s]!;
    const ticks = track(w, s, 100);
    for (const t of ticks) {
      expect(t.moved).toBe(0);
      expect(t.cost).toBe(0);
    }
    expect(c.x[s]).toBe(x0);
  });

  it('the ledger closes; Σ energy spent = Σ ledger categories while seeking light', () => {
    const w = dish();
    setLight(w, (x) => Math.min(1, 0.3 + 0.01 * Math.max(0, x - 20)));
    const s = sunbead(w, 30.5);
    const c = w.ents.cols;
    const e0 = { ...w.ledger.energy };
    const E0 = c.E[s]!;
    for (let k = 0; k < 300; k++) step(w);
    const d = (key: keyof typeof e0) => w.ledger.energy[key] - e0[key];
    const balance = d('earned') - d('maintenance') - d('surcharge') - d('upkeep') - d('movement') - d('secretion') - d('division') - d('dormancy') - d('construction') - d('dissipated') - d('other');
    expect(c.alive[s]).toBe(1);
    expect(d('movement')).toBeGreaterThan(0);
    expect(c.E[s]! - E0).toBeCloseTo(balance, 9);
    expect(checkLedger(w).ok).toBe(true);
  });
});
