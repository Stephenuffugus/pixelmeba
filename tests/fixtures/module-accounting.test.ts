/**
 * P2.1 fixture: supplementary module accounting (SPEC §9, §7.6, §9.19; CT §7, §12.7;
 * BUILD_DIRECTIVE P2.1 "Done when").
 *
 *  - E05 grants capacity only: +40 cap and 0.05 E/s of carrying costs, never energy.
 *  - E01 cannot duplicate a native ability (B06's E_STARCH_SECRETION counts), and a carrier gains
 *    the producer behavior with its costs but no starch intake.
 *  - E03 pays its full entry (10 E), rest (0.01 E/s replacing all upkeep) and wake (5 E) costs.
 *  - A module loss frees no material; energy above a daughter's new cap dissipates, ledgered.
 *  - The 0.02 E/s surcharge per carried module is charged exactly once per tick (and not at all
 *    while Resting, where the rest rule replaces it).
 * Test-only state (energy or biomass set directly) is labelled where used; material overrides are
 * logged as ledger inputs so conservation checks stay exact.
 */
import { describe, expect, it } from 'vitest';
import { introduceOrganism } from '../../src/sim/commands';
import { DT } from '../../src/sim/constants';
import { validateContent } from '../../src/sim/content/registry';
import { LIFE_ACTIVE, LIFE_PREPARING, LIFE_RESTING, LIFE_WAKING } from '../../src/sim/entities';
import { ModuleSetError } from '../../src/sim/founders';
import { neutralGenome } from '../../src/sim/genome';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { field } from '../../src/sim/lineage';
import { eligibleGains, validateModuleSet } from '../../src/sim/modules';
import { draftDaughter, MUT_MODULE_GAIN, MUT_MODULE_LOSS } from '../../src/sim/mutation';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { step } from '../../src/sim/tick';
import { rebuildIndex } from '../../src/sim/spatial';
import { speciesIndex, type World } from '../../src/sim/world';
import { loadRawPacksFs } from '../../tools/lib/content-fs';
import { aliveOf, clearWater, setField } from '../helpers/world';

type Energy = World['ledger']['energy'];

/** Place one organism carrying `modules` at an exact position (material overrides are logged). */
function placeWith(w: World, speciesId: string, x: number, y: number, modules: readonly string[], state: Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>> = {}): number {
  const slot = introduceOrganism(w, speciesIndex(w, speciesId), cellIndex(Math.floor(x), Math.floor(y)), 'test', { modules, exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  const c = w.ents.cols;
  c.x[slot] = x;
  c.y[slot] = y;
  for (const key of ['B', 'N', 'E', 'H', 'age'] as const) {
    const v = state[key];
    if (v === undefined) continue;
    if (key === 'B') w.ledger.inputs.c += v - c.B[slot]!;
    if (key === 'N') w.ledger.inputs.n += v - c.N[slot]!;
    c[key][slot] = v;
  }
  rebuildIndex(w);
  return slot;
}

function snapshotEnergy(e: Energy): Energy {
  return { ...e };
}

/** Every recorded energy flow for a one-organism dish: ΔE must equal earned − everything spent/lost. */
function energyBalance(before: Energy, after: Energy): number {
  const d = (k: keyof Energy) => after[k] - before[k];
  return d('earned') - d('maintenance') - d('surcharge') - d('upkeep') - d('movement') - d('secretion') - d('division') - d('dormancy') - d('construction') - d('dissipated') - d('other');
}

function fillSugar(w: World, cx: number, cy: number, r: number, amount: number): void {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) setField(w, 'sugar', cellIndex(cx + dx, cy + dy), amount);
}

describe('P2.1 module accounting', () => {
  it('E05 grants capacity only: +40 cap, 0.05 E/s carrying cost, never energy', () => {
    // Introduction: a carrier starts with exactly the ordinary founder energy and material.
    const w0 = clearWater();
    const plain0 = placeWith(w0, 'B01', 40.5, 64.5, []);
    const res0 = placeWith(w0, 'B01', 88.5, 64.5, ['E05']);
    const c0 = w0.ents.cols;
    expect(c0.E[plain0]).toBe(50);
    expect(c0.E[res0]).toBe(50);
    expect(c0.B[res0]).toBe(c0.B[plain0]);
    expect(profileOf(w0, plain0).energyCap).toBe(100);
    expect(profileOf(w0, res0).energyCap).toBe(140);
    expect(profileOf(w0, res0).upkeep).toBeCloseTo(0.03, 15);
    expect(w0.ledger.energy.earned).toBe(0);

    // Twin dishes, one organism each, same food and the same (labelled test) starting energy 95:
    // their intake is identical, so the carrier's energy trails by exactly its carrying cost until
    // the plain cell is full; after that only the carrier keeps what it eats, up to 140.
    const make = (mods: readonly string[]) => {
      const w = clearWater();
      fillSugar(w, 64, 64, 3, 0.8);
      const s = placeWith(w, 'B01', 64.5, 64.5, mods, { E: 95 });
      return { w, s };
    };
    const A = make([]);
    const B = make(['E05']);
    let sawAboveBase = false;
    for (let t = 1; t <= 90; t++) {
      const ea = snapshotEnergy(A.w.ledger.energy);
      const eb = snapshotEnergy(B.w.ledger.energy);
      const Ea = A.w.ents.cols.E[A.s]!;
      const Eb = B.w.ents.cols.E[B.s]!;
      step(A.w);
      step(B.w);
      expect(aliveOf(A.w)).toEqual([A.s]);
      expect(aliveOf(B.w)).toEqual([B.s]);
      const Ea1 = A.w.ents.cols.E[A.s]!;
      const Eb1 = B.w.ents.cols.E[B.s]!;
      // No energy appears from nowhere: every change is a recorded flow.
      expect(Ea1 - Ea).toBeCloseTo(energyBalance(ea, A.w.ledger.energy), 10);
      expect(Eb1 - Eb).toBeCloseTo(energyBalance(eb, B.w.ledger.energy), 10);
      // Same intake in both dishes (capacity is not intake).
      expect(B.w.ledger.energy.earned).toBeCloseTo(A.w.ledger.energy.earned, 10);
      expect(Ea1).toBeLessThanOrEqual(100);
      expect(Eb1).toBeLessThanOrEqual(140);
      if (A.w.ledger.energy.dissipated === 0) expect(Eb1).toBeCloseTo(Ea1 - 0.05 * DT * t, 9);
      if (Eb1 > 100) sawAboveBase = true;
    }
    expect(A.w.ledger.energy.dissipated).toBeGreaterThan(0); // the plain cell overflowed its cap
    expect(sawAboveBase).toBe(true); // the carrier stored earned energy above 100
    expect(B.w.ledger.energy.upkeep).toBeCloseTo(0.03 * DT * 90, 10);
    expect(B.w.ledger.energy.surcharge).toBeCloseTo(0.02 * DT * 90, 10);
    expect(checkLedger(A.w).ok).toBe(true);
    expect(checkLedger(B.w).ok).toBe(true);
  });

  it('E01 cannot duplicate a native ability: Crumbsmith (native E_STARCH) is refused everywhere', () => {
    const w = clearWater({ mutationPreset: 'accelerated' });
    // Eligible lists for the Phase 2 roster (D06: B01/B04 may gain E01; B06 never).
    expect(eligibleGains(w, { ancestor: 'B01', modules: [] })).toEqual(['E01', 'E03', 'E05']);
    expect(eligibleGains(w, { ancestor: 'B04', modules: [] })).toEqual(['E01', 'E03', 'E05']);
    expect(eligibleGains(w, { ancestor: 'B06', modules: [] })).toEqual(['E03', 'E05']);
    expect(validateModuleSet(w, 'B06', ['E01'])).toMatch(/natively/);
    // An introduction with the duplicate is refused before anything is allocated or logged.
    const before = { count: w.ents.count, next: w.counters.nextBirthId, inputs: { ...w.ledger.inputs } };
    expect(() => placeWith(w, 'B06', 64.5, 64.5, ['E01'])).toThrow(ModuleSetError);
    expect(w.ents.count).toBe(before.count);
    expect(w.counters.nextBirthId).toBe(before.next);
    expect(w.ledger.inputs).toEqual(before.inputs);
    // A shipped recipe cannot seed it either.
    const raw = loadRawPacksFs();
    const bad = JSON.parse(JSON.stringify(raw)) as typeof raw;
    const recipe = bad.recipes.find((f) => f.file.endsWith('FIRST_DISH_V1.json'))!.data as { founders: { species: string; modules: string[] }[] };
    recipe.founders.find((f) => f.species === 'B06')!.modules = ['E01'];
    const errs = validateContent(bad).issues.filter((i) => i.severity === 'error');
    expect(errs.some((e) => e.path.endsWith('.modules') && /natively/.test(e.message))).toBe(true);
    // Mutation never proposes it: many Crumbsmith daughters gain modules, none gains E01.
    const b06 = w.genomes.get(w.genomes.intern(neutralGenome('B06')));
    const gained: Record<string, number> = {};
    for (let pb = 1; pb <= 40000; pb++) {
      for (const d of [0, 1]) {
        const draft = draftDaughter(w, b06, pb, d);
        if (draft.flags & MUT_MODULE_GAIN) for (const m of draft.input.modules) gained[m] = (gained[m] ?? 0) + 1;
      }
    }
    expect(gained.E01).toBeUndefined();
    expect((gained.E03 ?? 0) + (gained.E05 ?? 0)).toBeGreaterThan(100);
  });

  it('E01 gives a carrier the starch producer behavior with its costs, and no starch intake', () => {
    const w = clearWater();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) setField(w, 'starch', cellIndex(64 + dx, 64 + dy), 0.6);
    const s = placeWith(w, 'B01', 64.5, 64.5, ['E01'], { E: 60 });
    const prof = profileOf(w, s);
    expect(prof.starch?.source).toBe('E01');
    expect(prof.foods).toEqual(['sugar']); // grants no starch intake
    const starch0 = maskCells().reduce((a, k) => a + w.fields.starch![k]!, 0);
    let emitting = 0;
    for (let t = 0; t < 200; t++) {
      const sec = w.ledger.energy.secretion;
      step(w);
      if (w.ents.cols.alive[s] !== 1) break;
      const paid = w.ledger.energy.secretion - sec;
      if (w.ents.cols.secretionCode[s] === R.SECRETING) {
        emitting++;
        expect(paid).toBeCloseTo(0.4 * DT, 12);
      } else expect(paid).toBe(0);
    }
    expect(emitting).toBeGreaterThan(10);
    // Starch left the dish only through enzyme conversion, never through the carrier's intake.
    const starch1 = maskCells().reduce((a, k) => a + w.fields.starch![k]!, 0);
    expect(starch0 - starch1).toBeCloseTo(w.conversionTotals.starch, 10);
    expect(w.conversionTotals.starch).toBeGreaterThan(0);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('E03 pays the full entry (10 E), rest (0.01 E/s replacing all upkeep) and wake (5 E) costs', () => {
    const w = clearWater();
    const s = placeWith(w, 'B01', 64.5, 64.5, ['E03']);
    const c = w.ents.cols;
    const prof = profileOf(w, s);
    const ordinary = (prof.m + prof.upkeep) * DT; // (0.5 + 0.02) × dt with neutral loci
    expect(ordinary).toBeCloseTo(0.052, 12);
    expect(prof.dormancyTriggerSeconds).toBeCloseTo(20, 12);
    const E = () => c.E[s]!;
    const dormancy = () => w.ledger.energy.dormancy;

    // Active without food: the trigger needs 20 s without usable intake (200 ticks).
    let entryTick = -1;
    for (let t = 0; t < 400 && entryTick < 0; t++) {
      const e0 = E();
      const mv = w.ledger.energy.movement;
      step(w);
      if (c.lifeState[s] === LIFE_PREPARING) {
        entryTick = w.tick - 1;
        // Entry tick: ordinary maintenance and this tick's movement, then 10 E to prepare, once.
        expect(dormancy()).toBe(10);
        expect(e0 - E()).toBeCloseTo(ordinary + (w.ledger.energy.movement - mv) + 10, 12);
      } else expect(dormancy()).toBe(0);
    }
    expect(entryTick).toBe(199);
    // Preparing: 5 s of ordinary maintenance (no movement), nothing else charged.
    for (let t = 0; t < 50; t++) {
      const e0 = E();
      step(w);
      expect(e0 - E()).toBeCloseTo(ordinary, 12);
      expect(c.movedThisTick[s]).toBe(0);
    }
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    expect(c.limitCode[s]).toBe(R.RESTING_FOOD_SCARCE);
    // Resting: exactly 0.01 E/s, no surcharge, no intake.
    const sur = w.ledger.energy.surcharge;
    for (let t = 0; t < 100; t++) {
      const e0 = E();
      step(w);
      expect(e0 - E()).toBeCloseTo(0.01 * DT, 12);
    }
    expect(w.ledger.energy.surcharge).toBe(sur);
    expect(dormancy()).toBe(10);
    // Food returns: after 10 s of usable food (E ≥ 5) it pays 5 E once and starts waking.
    fillSugar(w, 64, 64, 2, 0.5);
    let wakeTick = -1;
    for (let t = 0; t < 120 && wakeTick < 0; t++) {
      const e0 = E();
      step(w);
      expect(w.ledger.energy.earned).toBe(0); // no intake while resting
      if (c.lifeState[s] === LIFE_WAKING) {
        wakeTick = t;
        expect(e0 - E()).toBeCloseTo(0.01 * DT + 5, 12);
      }
    }
    expect(wakeTick).toBe(99);
    expect(dormancy()).toBe(15);
    // Waking: 5 s, ordinary maintenance, still no feeding even with sugar in the cell.
    for (let t = 0; t < 50; t++) {
      const e0 = E();
      step(w);
      expect(e0 - E()).toBeCloseTo(ordinary, 12);
    }
    expect(c.lifeState[s]).toBe(LIFE_ACTIVE);
    expect(w.ledger.energy.earned).toBe(0);
    expect(c.lockoutTimer[s]).toBe(30);
    // Active again: it feeds from the next tick; no energy was ever granted by the machine.
    step(w);
    expect(w.ledger.energy.earned).toBeGreaterThan(0);
    expect(dormancy()).toBe(15);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('a module loss frees no material; energy above the new cap dissipates with a ledger record', () => {
    // Find a seed whose first founder (birthId 1) proposes a daughter that loses E05 (accelerated).
    const probe = clearWater({ mutationPreset: 'accelerated' });
    const parentGenome = probe.genomes.get(probe.genomes.intern({ ...neutralGenome('B01'), modules: ['E03', 'E05'] }));
    let seed = -1;
    for (let sd = 1; sd < 200000 && seed < 0; sd++) {
      const view = { ...probe, seed: sd } as World;
      const d0 = draftDaughter(view, parentGenome, 1, 0);
      if ((d0.flags & MUT_MODULE_LOSS) !== 0 && d0.input.modules.join() === 'E03') seed = sd;
    }
    expect(seed).toBeGreaterThan(0);
    const w = clearWater({ seed, mutationPreset: 'accelerated' });
    // Labelled test state: ready to divide, with energy far above any reachable level (300) so the
    // reconciliation rule is visible: half after the cost exceeds both daughters' caps.
    const p = placeWith(w, 'B01', 64.5, 64.5, ['E03', 'E05'], { B: 2, N: 0.2, E: 300, age: 20 });
    expect(w.ents.cols.birthId[p]).toBe(1);
    const c = w.ents.cols;
    const fieldTotals = () => {
      const t = computeTotals(w).breakdown;
      const out: Record<string, number> = {};
      for (const k of Object.keys(t).sort()) if (!k.startsWith('body') && !k.startsWith('meal')) out[k] = t[k]!;
      return out;
    };
    const fields0 = fieldTotals();
    const inputs0 = { ...w.ledger.inputs };
    const exports0 = { ...w.ledger.exports };
    const bodyC0 = c.B[p]!;
    const bodyN0 = c.N[p]!;
    const cost = profileOf(w, p).divisionCost;
    // Stages 1–8 run before the birth: capture the parent's energy just before stage 9 commits.
    let E1 = NaN;
    const dis0 = w.ledger.energy.dissipated;
    step(w, { afterStage: (stage) => (stage === 8 ? (E1 = c.E[p]!) : undefined) });
    const kids = aliveOf(w);
    expect(kids).toHaveLength(2);
    const byGenome = kids.map((k) => ({ k, mods: w.genomes.get(c.genome[k]!).modules.join('+') }));
    const lost = byGenome.find((x) => x.mods === 'E03')!;
    expect(lost).toBeDefined();
    expect(field(w.lineage, 'mutFlags', c.birthId[lost.k]!)! & MUT_MODULE_LOSS).toBeTruthy();
    // No material appeared anywhere: body pools split exactly, nothing entered or left any field.
    expect(kids.reduce((a, k) => a + c.B[k]!, 0)).toBeCloseTo(bodyC0, 12);
    expect(kids.reduce((a, k) => a + c.N[k]!, 0)).toBeCloseTo(bodyN0, 12);
    expect(fieldTotals()).toEqual(fields0);
    expect(w.ledger.inputs).toEqual(inputs0);
    expect(w.ledger.exports).toEqual(exports0);
    expect(checkLedger(w).ok).toBe(true);
    // Energy: split first, then each daughter's own cap; the overflow is dissipated and recorded.
    const half = (E1 - cost) / 2;
    const kept = byGenome.find((x) => x.k !== lost.k)!;
    const keptCap = profileOf(w, kept.k).energyCap;
    expect(c.E[lost.k]).toBe(100);
    expect(c.E[kept.k]).toBe(Math.min(half, keptCap));
    expect(w.ledger.energy.dissipated - dis0).toBeCloseTo(half - 100 + Math.max(0, half - keptCap), 10);
    // Both daughters start Active with fresh dormancy clocks (no energy gift for the E03 keeper).
    for (const k of kids) {
      expect(c.lifeState[k]).toBe(LIFE_ACTIVE);
      expect(c.lockoutTimer[k]).toBe(0);
    }
  });

  it('the 0.02 E/s surcharge per carried module is charged exactly once per tick', () => {
    const make = (mods: readonly string[]) => {
      const w = clearWater();
      const s = placeWith(w, 'B01', 64.5, 64.5, mods);
      return { w, s };
    };
    const A = make([]);
    const B = make(['E01', 'E03', 'E05']);
    const ticks = 150; // < 20 s: no dormancy yet; no starch: E01 never emits
    for (let t = 1; t <= ticks; t++) {
      step(A.w);
      step(B.w);
      const dE = A.w.ents.cols.E[A.s]! - B.w.ents.cols.E[B.s]!;
      // Identical paths; the only difference is three surcharges plus the chamber's upkeep.
      expect(dE).toBeCloseTo((3 * 0.02 + 0.03) * DT * t, 10);
    }
    expect(B.w.ledger.energy.surcharge).toBeCloseTo(3 * 0.02 * DT * ticks, 10);
    expect(B.w.ledger.energy.upkeep).toBeCloseTo(0.03 * DT * ticks, 10);
    expect(B.w.ledger.energy.maintenance).toBeCloseTo(A.w.ledger.energy.maintenance, 10);
    expect(B.w.ledger.energy.secretion).toBe(0);
    expect(A.w.ledger.energy.surcharge).toBe(0);
  });
});
