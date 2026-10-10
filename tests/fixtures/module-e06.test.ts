/**
 * P3.7 E06 Shade collector (SPEC §6.5, §9 E06; CT §7.1; D04 §5 "E06 Shade collector"; BUILD_DIRECTIVE
 * P3.7, W4-13; src/sim/intake.ts photoLightResponse / photoCeilingShare).
 *
 *  - The photosynthetic request: at light 0.10 a carrier may reach 0.70 × (0.10 / 0.35) = 0.20 of the
 *    ancestral ceiling (0.10 without E06); at light 1.0, 0.70 (1.0 without). Checked on the pure share
 *    and on one real tick against a plain Sunbead in an identical dish (intake ratio 2.0 and 0.70).
 *  - The inherited feeding investment applies to the reduced ceiling (feeding locus 80 scales both).
 *  - The leading constraint compares the carrier's light response, not raw light: at light 0.50 (response
 *    1) it is not LIGHT_LIMITED; at light 0.10 it is, and the value it reports is the measured light 0.10,
 *    when that response (0.2857) is the smallest supplied fraction.
 *  - Usable intake and Profile.q stay unscaled (the × 0.70 lives on the photosynthetic route only).
 *  - The module card's "active now" follows real photosynthesis; the ledger closes over a run.
 *
 * Worlds: closed-lid clear water (FIRST_DISH_V1 without stones, background sugar 0), CO2 and nutrient
 * filled so neither limits, uniform light through grid.lightBase. Registry: the shipped manifest plus
 * E06 and E08 (registryWith; the lead enables them after the wave).
 */
import { describe, expect, it } from 'vitest';
import { introduceOrganism } from '../../src/sim/commands';
import { DT } from '../../src/sim/constants';
import { FLAG } from '../../src/sim/entities';
import { L_FEEDING, neutralGenome } from '../../src/sim/genome';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { photoCeilingShare, photoLightResponse } from '../../src/sim/intake';
import { checkLedger } from '../../src/sim/ledger';
import { moduleSummaries } from '../../src/sim/moduleView';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { rebuildIndex } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import { speciesIndex, type World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { fillField, registry } from '../helpers/world';

const SHIPPED_MODULES = registry().manifest.enabledModules;
const REG = registryWith({ enabledModules: [...SHIPPED_MODULES, 'E06', 'E08'].sort() });

const X = 60.5;
const Y = 64.5;

/** Closed-lid clear water with uniform light; CO2 and nutrient filled so neither limits intake. */
function dish(light: number): World {
  const base = REG.recipes.FIRST_DISH_V1!;
  const w = realizeRecipe(
    REG,
    { ...base, id: 'TEST_E06', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' },
    { worldId: 'e06' },
  );
  w.settings.lid = 'closed';
  for (const cell of maskCells()) w.grid.lightBase[cell] = light;
  w.grid.geometryVersion++;
  updateDerived(w);
  fillField(w, 'co2', 50);
  fillField(w, 'nutrient', 5);
  return w;
}

/** One Sunbead at (X, Y) carrying `modules`; `loci` overrides genome loci. */
function sunbead(w: World, modules: readonly string[], loci: Readonly<Record<number, number>> = {}): number {
  const sp = speciesIndex(w, 'A01');
  const base = neutralGenome('A01');
  const l = [...base.loci];
  for (const [k, v] of Object.entries(loci)) l[Number(k)] = v;
  const genome = w.genomes.intern({ ...base, loci: l, modules: [...modules] });
  const slot = introduceOrganism(w, sp, cellIndex(Math.floor(X), Math.floor(Y)), 'test', { genome, exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  rebuildIndex(w);
  return slot;
}

/** Carbon fixed by `slot` in one tick (stage 6 intake), with its budget q × suitability × dt. */
function oneTick(light: number, modules: readonly string[], loci: Readonly<Record<number, number>> = {}): { fixed: number; budget: number; w: World; s: number } {
  const w = dish(light);
  const s = sunbead(w, modules, loci);
  const before = w.ents.cols.intakeAccum[s]!;
  step(w);
  const c = w.ents.cols;
  return { fixed: c.intakeAccum[s]! - before, budget: profileOf(w, s).q * c.suitability[s]! * DT, w, s };
}

describe('P3.7 E06 Shade collector', () => {
  it('the photosynthetic share of the ancestral ceiling is 0.20 at light 0.10 and 0.70 at light 1.0 (0.10 and 1.0 without E06)', () => {
    const w = dish(1);
    const plain = profileOf(w, sunbead(w, []));
    const shade = profileOf(w, sunbead(w, ['E06']));
    expect(shade.shade).toEqual({ lightHalf: 0.35, ceilingFactor: 0.7 });
    expect(plain.shade).toBeNull();
    expect(photoCeilingShare(shade, 0.1)).toBeCloseTo(0.7 * (0.1 / 0.35), 15);
    expect(photoCeilingShare(shade, 0.1)).toBeCloseTo(0.2, 15);
    expect(photoCeilingShare(plain, 0.1)).toBe(0.1);
    expect(photoCeilingShare(shade, 1.0)).toBe(0.7);
    expect(photoCeilingShare(plain, 1.0)).toBe(1.0);
    // Any light of 0.35 or more is full response, never above 1.
    expect(photoLightResponse(shade, 0.35)).toBe(1);
    expect(photoLightResponse(shade, 0.5)).toBe(1);
    expect(photoLightResponse(shade, 0.1)).toBeCloseTo(0.1 / 0.35, 15);
    expect(photoLightResponse(plain, 0.5)).toBe(0.5);
    // The 0.70 stays out of Profile.q (usable-intake threshold, lineage intake line).
    expect(shade.q).toBe(plain.q);
  });

  it('one real tick: a carrier fixes 2.0 × a plain Sunbead at light 0.10 and 0.70 × at light 1.0', () => {
    for (const [light, ratio] of [
      [0.1, 2.0],
      [1.0, 0.7],
    ] as const) {
      const a = oneTick(light, ['E06']);
      const b = oneTick(light, []);
      expect(a.w.derived.light[cellIndex(Math.floor(X), Math.floor(Y))]).toBeCloseTo(light, 12);
      expect(a.budget).toBe(b.budget);
      expect(a.fixed).toBeGreaterThan(0);
      expect(a.fixed / b.fixed).toBeCloseTo(ratio, 9);
      // Both are under the ceiling share (avail(CO2) < 1), carrier at 0.70 × response.
      expect(a.fixed / a.budget).toBeLessThanOrEqual((light === 0.1 ? 0.2 : 0.7) + 1e-12);
      expect(a.fixed / a.budget).toBeGreaterThan((light === 0.1 ? 0.2 : 0.7) * 0.99);
    }
  });

  it('the feeding locus applies to the reduced ceiling', () => {
    const hi = oneTick(1.0, ['E06'], { [L_FEEDING]: 80 });
    const lo = oneTick(1.0, ['E06']);
    const plainHi = oneTick(1.0, [], { [L_FEEDING]: 80 });
    expect(hi.fixed / lo.fixed).toBeCloseTo(profileOf(hi.w, hi.s).q / profileOf(lo.w, lo.s).q, 9);
    expect(hi.fixed / plainHi.fixed).toBeCloseTo(0.7, 9);
  });

  it('leading constraint: at light 0.50 the carrier is not LIGHT_LIMITED; at light 0.10 it is, reporting light 0.10', () => {
    const bright = oneTick(0.5, ['E06']);
    const cb = bright.w.ents.cols;
    expect(cb.limitCode[bright.s]).not.toBe(R.LIGHT_LIMITED);
    expect(cb.limitCode[bright.s]).toBe(R.NONE);

    const dim = oneTick(0.1, ['E06']);
    const cd = dim.w.ents.cols;
    expect(cd.limitCode[dim.s]).toBe(R.LIGHT_LIMITED);
    expect(cd.limitValue[dim.s]).toBeCloseTo(0.1, 12); // the measured light, which the Lab line prints
    // Usable intake still reads the unscaled ceiling (Profile.q).
    const prof = profileOf(dim.w, dim.s);
    expect((cd.flags[dim.s]! & FLAG.feeding) !== 0).toBe(true);
    expect(dim.fixed).toBeGreaterThan(0.01 * prof.q * DT);
  });

  it('the module card is active only while it makes food from light; the ledger closes over a run', () => {
    const w = dish(0.2);
    const s = sunbead(w, ['E06']);
    step(w);
    expect(moduleSummaries(w, s).find((m) => m.id === 'E06')!.activeNow).toBe(true);
    run(w, 300);
    expect(checkLedger(w).ok).toBe(true);

    const dark = dish(0);
    const d = sunbead(dark, ['E06']);
    step(dark);
    expect(moduleSummaries(dark, d).find((m) => m.id === 'E06')!.activeNow).toBe(false);
    expect(dark.ents.cols.limitCode[d]).toBe(R.LIGHT_LIMITED);
  });
});
