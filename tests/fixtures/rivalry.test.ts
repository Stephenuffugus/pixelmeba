/**
 * Phase 5 wave 11, e2-signals: B13 Rampart's rivalry and the RIVAL targets (SPEC §7.9, §4.3, §3.3; CT §3.4,
 * §12.6; D-0119; src/sim/rivalry.ts, suitability.ts inhibitorExposure, chemistry.ts exposureBreakdown).
 *
 * - A B13 attached on gel with E remaining > 50 secretes 0.02 × DT RIVAL per tick into its cell, paying
 *   0.60 × DT under 'secretion', when a stage-start Active B01, B10 or B11 lies within two cells (the 5 × 5
 *   window) and local RIVAL < 1.0. Nothing for a target three cells away, a resting target, E ≤ 50, local
 *   RIVAL ≥ 1.0 or a non-target (B04).
 * - Targets add 0.25 × RIVAL to their exposure, halved once with film: growth × 1/(1 + exposure), damage
 *   8 × exposure per second. Non-targets (B04, P01) are exactly unchanged. B13 gains nothing.
 * - M08 raises the same field through the generic deposit command; RIVAL_EXPOSURE names the reason when the
 *   rival term dominates; the breakdown's rival line; slot order never changes the field.
 *
 * Registry: the shipped manifest plus B09, B10, B11, B13, E02, M06–M08 and 'signals'/'rivalry', with
 * allowUnimplemented: RIVALRY, SIGNAL_GLOW and E02 are implemented here and listed as implemented by the lead
 * at integration (D-0119).
 */
import { describe, expect, it } from 'vitest';
import { exposureBreakdown } from '../../src/sim/chemistry';
import { applyNow } from '../../src/sim/commands';
import { DT, INHIBITOR_DAMAGE, RIVAL_EMIT_COST, RIVAL_EMIT_RATE, RIVAL_EXPOSURE_FACTOR } from '../../src/sim/constants';
import { ENTITY_COLUMNS, FLAG, LIFE_RESTING } from '../../src/sim/entities';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex, SUB_GEL } from '../../src/sim/grid';
import { stageMaintenance } from '../../src/sim/maintenance';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { RIVAL_TARGETS, rivalExposure } from '../../src/sim/rivalry';
import { entityCell } from '../../src/sim/spatial';
import { stageStructures } from '../../src/sim/structures';
import { inhibitorExposure, suitabilityAt } from '../../src/sim/suitability';
import { run } from '../../src/sim/tick';
import { markField } from '../../src/sim/transport';
import { speciesIndex, type World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, paintRect, place, placeWith, preOrganismFlipRegistry, registry, setField } from '../helpers/world';

const shipped = registry().manifest;
const REG = registryWith(
  {
    enabledSpecies: [...shipped.enabledSpecies, 'B09', 'B10', 'B11', 'B13'].sort(),
    enabledModules: [...shipped.enabledModules, 'E02'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'rivalry', 'signals'].sort() as SystemFlag[],
    enabledMaterials: [...shipped.enabledMaterials, 'M06', 'M07', 'M08'].sort(),
  },
  { allowUnimplemented: true },
);

/** A clear-water dish with a gel square x, y ∈ [50, 78] (B13 attaches on gel, CT §1.1). */
function gelDish(): World {
  const w = clearWater({}, REG);
  paintRect(w, SUB_GEL, 50, 50, 78, 78);
  return w;
}
const cellOf = (w: World, s: number): number => entityCell(w.ents.cols.x[s]!, w.ents.cols.y[s]!);
const spOf = (w: World, id: string) => w.species[speciesIndex(w, id)]!;

/** One stage 8 with a B13 at (64, 64) and `others` placed first; returns the RIVAL its cell gained and the secretion paid. */
function oneStage(e13: number, others: (w: World) => void, setup?: (w: World, b13: number) => void) {
  const w = gelDish();
  others(w);
  const s = place(w, 'B13', 64.5, 64.5, { E: e13 });
  setup?.(w, s);
  const r0 = w.fields.rival![cellOf(w, s)]!;
  const sec0 = w.ledger.energy.secretion;
  stageStructures(w);
  return { w, s, gained: w.fields.rival![cellOf(w, s)]! - r0, paid: w.ledger.energy.secretion - sec0 };
}

describe('RIVAL secretion (SPEC §7.9; CT §12.6)', () => {
  it('a B13 on gel with E 60 and a B01 two cells away secretes exactly 0.02 × DT per tick and pays 0.60 × DT under secretion', () => {
    const { w, s, gained, paid } = oneStage(60, (w) => place(w, 'B01', 66.5, 64.5, { E: 60 }));
    expect(profileOf(w, s).rivalry).not.toBeNull();
    expect(w.ents.cols.flags[s]! & FLAG.attached).toBe(FLAG.attached); // attached, as its record requires
    expect(gained).toBe(RIVAL_EMIT_RATE * DT);
    expect(paid).toBe(RIVAL_EMIT_COST * DT);
    expect(w.ents.cols.E[s]).toBe(60 - RIVAL_EMIT_COST * DT);
    expect(w.ledger.energy.signal).toBe(0); // RIVAL is ordinary secretion (D-0119)
    expect(w.ents.cols.secretionCode[s]).toBe(R.SECRETING);
    expect(w.ents.cols.secreting[s]).toBe(8); // EMITTER_BIT.rival
    // Diagonal two cells away counts too (Chebyshev window).
    expect(oneStage(60, (w) => place(w, 'B10', 62.5, 66.5, { E: 60 })).gained).toBe(RIVAL_EMIT_RATE * DT);
    expect(oneStage(60, (w) => place(w, 'B11', 66.5, 62.5, { E: 60 })).gained).toBe(RIVAL_EMIT_RATE * DT);
  });

  it('nothing when the only B01 is three cells away, resting (E03), when E ≤ 50, when local RIVAL ≥ 1.0, or for a B04', () => {
    const far = oneStage(60, (w) => place(w, 'B01', 67.5, 64.5, { E: 60 }));
    expect(far.gained).toBe(0);
    expect(far.paid).toBe(0);
    expect(far.w.ents.cols.secretionCode[far.s]).toBe(R.NONE);
    const resting = oneStage(60, (w) => {
      const b = placeWith(w, 'B01', 66.5, 64.5, ['E03'], { E: 60 });
      w.ents.cols.lifeState[b] = LIFE_RESTING; // test-only state
    });
    expect(resting.gained).toBe(0);
    const low = oneStage(50, (w) => place(w, 'B01', 66.5, 64.5, { E: 60 }));
    expect(low.gained).toBe(0);
    expect(low.w.ents.cols.secretionCode[low.s]).toBe(R.SECRETION_ENERGY_LOW);
    const capped = oneStage(
      60,
      (w) => place(w, 'B01', 66.5, 64.5, { E: 60 }),
      (w, s) => setField(w, 'rival', cellOf(w, s), 1.0),
    );
    expect(capped.gained).toBe(0);
    expect(capped.w.ents.cols.secretionCode[capped.s]).toBe(R.SECRETION_SATURATED);
    const b04 = oneStage(60, (w) => place(w, 'B04', 65.5, 64.5, { E: 60 }));
    expect(b04.gained).toBe(0);
  });

  it('the trigger is a stage-start snapshot: a target entering Preparing this tick still counts, whichever slot comes first', () => {
    const build = (b13First: boolean) => {
      const w = gelDish();
      const place13 = () => place(w, 'B13', 64.5, 64.5, { E: 60 });
      const placeB01 = () => {
        const b = placeWith(w, 'B01', 66.5, 64.5, ['E03'], { E: 60 });
        w.ents.cols.stateTimer[b] = 1000; // test-only: its no-intake trigger has long held (Preparing this tick)
        return b;
      };
      const s = b13First ? place13() : (placeB01(), place13());
      const b = b13First ? placeB01() : s - 1;
      stageStructures(w);
      return { gained: w.fields.rival![cellOf(w, s)]!, state: w.ents.cols.lifeState[b] };
    };
    const a = build(true);
    const b = build(false);
    expect(a.state).toBe(1); // LIFE_PREPARING
    expect(b.state).toBe(1);
    expect(a.gained).toBe(RIVAL_EMIT_RATE * DT);
    expect(b.gained).toBe(a.gained);
  });

  it('two B13 sharing targets, placed in either slot order, produce identical RIVAL fields', () => {
    const field = (reverse: boolean) => {
      const w = gelDish();
      for (const [x, y] of [
        [63.5, 66.5],
        [65.5, 66.5],
        [64.5, 67.5],
      ] as const)
        place(w, 'B01', x, y, { E: 70 });
      const ramparts: [number, number][] = [
        [63.5, 64.5],
        [65.5, 64.5],
      ];
      if (reverse) ramparts.reverse();
      for (const [x, y] of ramparts) place(w, 'B13', x, y, { E: 90 });
      run(w, 200);
      expect(w.fields.rival!.reduce((a, v) => a + v, 0)).toBeGreaterThan(0.02); // they did secrete (at least 10 secretions' worth after decay)
      return Buffer.from(w.fields.rival!.buffer.slice(0)).toString('base64');
    };
    const a = field(false);
    expect(field(true)).toBe(a);
  });

  it('M08 raises the same field through the generic deposit command', () => {
    const w = gelDish();
    const cell = cellIndex(64, 64);
    expect(w.fields.rival![cell]).toBe(0);
    applyNow(w, 'm08', { kind: 'deposit', materialId: 'M08', points: [[64.5, 64.5]], radius: 1, dose: 0.5 });
    expect(w.fields.rival![cell]!).toBeGreaterThan(0);
  });
});

describe('RIVAL exposure (SPEC §4.3; CT §3.4)', () => {
  /** A cell holding inhBact 0.2 and RIVAL 0.4 (optionally film), with a B01, a B04 and a P01 in it. */
  function exposed(film: boolean, rival = 0.4) {
    const w = clearWater({}, REG);
    const cell = cellIndex(64, 64);
    setField(w, 'inhBact', cell, 0.2);
    setField(w, 'rival', cell, rival);
    if (film) setField(w, 'film', cell, 0.1);
    const b01 = place(w, 'B01', 64.5, 64.5);
    const b04 = place(w, 'B04', 64.5, 64.5);
    const p01 = place(w, 'P01', 64.5, 64.5);
    return { w, cell, b01, b04, p01 };
  }

  it('a B01 with inhBact 0.2 and RIVAL 0.4 has exposure 0.2 + 0.25 × 0.4, halved once with film; growth 1/(1 + exposure); damage 8 × exposure per second', () => {
    const { w, cell, b01 } = exposed(false);
    const sp = spOf(w, 'B01');
    expect(sp.rivalTarget).toBe(true);
    const e = inhibitorExposure(w, sp, cell);
    expect(e).toBe(0.2 + RIVAL_EXPOSURE_FACTOR * 0.4);
    expect(e).toBeCloseTo(0.3, 15);
    const suit = suitabilityAt(w, sp, profileOf(w, b01), cell);
    expect(suit.exposure).toBe(e);
    expect(suit.value).toBeCloseTo(1 / (1 + e), 12);
    expect(suit.reason).toBe(R.INHIBITOR_EXPOSURE); // the inhibitor part (0.2) is larger than the rival term (0.1)
    stageMaintenance(w);
    expect(w.ents.cols.dmgInhib[b01]).toBe(INHIBITOR_DAMAGE * e * DT);
    const f = exposed(true);
    const ef = inhibitorExposure(f.w, spOf(f.w, 'B01'), f.cell);
    expect(ef).toBe((0.2 + RIVAL_EXPOSURE_FACTOR * 0.4) * 0.5);
    expect(ef).toBeCloseTo(0.15, 15);
  });

  it('a B04 and a P01 in that cell have exactly the exposure they had without RIVAL; B13 gains nothing from RIVAL', () => {
    for (const film of [false, true]) {
      const a = exposed(film, 0.4);
      const b = exposed(film, 0);
      for (const id of ['B04', 'P01', 'B13', 'B09'] as const) {
        expect(spOf(a.w, id).rivalTarget).toBe(false);
        expect(Object.is(inhibitorExposure(a.w, spOf(a.w, id), a.cell), inhibitorExposure(b.w, spOf(b.w, id), b.cell))).toBe(true);
      }
    }
    // B13's own columns over 300 ticks, with and without RIVAL around it (no target near: no secretion).
    const cols = (rival: number) => {
      const w = gelDish();
      const s = place(w, 'B13', 64.5, 64.5, { E: 80 });
      const r = w.fields.rival!;
      for (let y = 55; y <= 73; y++) for (let x = 55; x <= 73; x++) r[cellIndex(x, y)] = rival;
      markField(w, 'rival');
      run(w, 300);
      const c = w.ents.cols as unknown as Record<string, ArrayLike<number>>;
      return ENTITY_COLUMNS.map(([name]) => [name, c[name]![s]] as const);
    };
    const without = cols(0);
    const withR = cols(0.8);
    without.forEach(([name, v], k) => expect(Object.is(v, withR[k]![1]), name).toBe(true));
  });

  it('RIVAL_EXPOSURE is the reason where the rival term dominates; INHIBITOR_EXPOSURE otherwise', () => {
    const w = clearWater({}, REG);
    const cell = cellIndex(64, 64);
    setField(w, 'rival', cell, 0.8);
    const b01 = place(w, 'B01', 64.5, 64.5);
    const sp = spOf(w, 'B01');
    expect(suitabilityAt(w, sp, profileOf(w, b01), cell).reason).toBe(R.RIVAL_EXPOSURE);
    setField(w, 'inhBact', cell, 0.3);
    expect(suitabilityAt(w, sp, profileOf(w, b01), cell).reason).toBe(R.INHIBITOR_EXPOSURE);
    setField(w, 'rival', cell, 2.0);
    expect(suitabilityAt(w, sp, profileOf(w, b01), cell).reason).toBe(R.RIVAL_EXPOSURE);
  });

  it('exposureBreakdown.rival: present with the recorded targets where RIVAL > 0; absent without the field or at 0', () => {
    const { w, cell } = exposed(true);
    const br = exposureBreakdown(w, cell);
    expect(br.rival).toEqual({ amount: 0.4, exposure: RIVAL_EXPOSURE_FACTOR * 0.4 * 0.5, targets: ['B01', 'B10', 'B11'] });
    expect(br.lines.map((l) => l.category)).toEqual(['bacterial', 'fungal', 'photosynthetic']);
    expect(exposureBreakdown(w, cellIndex(10, 64)).rival).toBeUndefined();
    const plain = clearWater({}, preOrganismFlipRegistry()); // no rivalry system (shipped since the organism flip, D-0127)
    expect(plain.fields.rival).toBeUndefined();
    expect(exposureBreakdown(plain, cell).rival).toBeUndefined();
    expect(Object.keys(exposureBreakdown(plain, cell))).toEqual(['filmHalves', 'lines']);
    expect(RIVAL_TARGETS).toEqual(['B01', 'B10', 'B11']);
    expect(rivalExposure(w, cell)).toEqual({ amount: 0.4, term: RIVAL_EXPOSURE_FACTOR * 0.4, filmHalves: true });
    expect(rivalExposure(plain, cell)).toEqual({ amount: 0, term: 0, filmHalves: false });
  });
});
