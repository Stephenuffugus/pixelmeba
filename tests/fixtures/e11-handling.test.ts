/**
 * P5.5 (Phase 5 wave 13, e3-jacket): the E11 × P10 handling fixture with REAL jackets (SPEC §7.3 "E11 jacket:
 * 1 + 3c s with c sampled at attempt start"; §9 E11; CT §12.5 "jacket 1 + 3c"; D04 155; D-0122). No jacket
 * column is set by hand: a P07 carrying E11 binds silicate in stage 8 (jacket.ts), and wave 12's handling
 * (handling.ts) samples its coverage when the attempt starts.
 *
 * Positions are pinned right after stage 4 (StepHooks.afterStage), so stage 5 reads exactly the distance under
 * test while every other stage — including the jacket's stage 8 building — runs as in play.
 *
 * NOTHING is enabled (D-0104): E11 joins IMPLEMENTED_MODULES at the organism flip; allowUnimplemented.
 */
import { describe, expect, it } from 'vitest';
import { DT } from '../../src/sim/constants';
import type { SimEvent } from '../../src/sim/events';
import type { SystemFlag } from '../../src/sim/fields';
import { HANDLING_EPS, jacketCoverage } from '../../src/sim/handling';
import { checkLedger } from '../../src/sim/ledger';
import { entityCell, rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, fillField, place, placeWith, registry } from '../helpers/world';

const shipped = registry().manifest;
const REG_J = registryWith(
  {
    enabledModules: [...shipped.enabledModules, 'E11'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'silicate'].sort() as SystemFlag[],
    enabledSpecies: [...shipped.enabledSpecies, 'P07', 'P10'].sort(),
  },
  { allowUnimplemented: true }, // E11 joins IMPLEMENTED_MODULES only at the organism flip (D-0104)
);

type Pins = Array<readonly [slot: number, x: number, y: number]>;
const of = (w: World, type: SimEvent['type']) => w.events.ring.filter((e) => e.type === type);

function stepPinned(w: World, pins: Pins): void {
  step(w, {
    afterStage: (s) => {
      if (s !== 4) return;
      for (const [slot, x, y] of pins) {
        if (!w.ents.isAlive(slot)) continue;
        w.ents.cols.x[slot] = x;
        w.ents.cols.y[slot] = y;
      }
      rebuildIndex(w);
    },
  });
}

/** Contact ticks wave 12's rule needs for `need` (the start tick counts; progress accumulates DT; HANDLING_EPS). */
function ticksFor(need: number): number {
  let p = DT;
  let k = 1;
  while (p < need - HANDLING_EPS) {
    p += DT;
    k++;
  }
  return k;
}

/**
 * A P07 with E11 alone on silicate until its coverage reaches `c` (built in stage 8, never set by hand), far
 * from where the duel happens; it is pinned in place while building so it stays on its own cell.
 */
function jacketedP07(c: number | null, seed?: number): { w: World; prey: number } {
  const w = clearWater(seed === undefined ? {} : { seed }, REG_J);
  fillField(w, 'silicate', 0.3);
  const prey = c === null ? place(w, 'P07', 64.8, 64.5, { E: 90 }) : placeWith(w, 'P07', 64.8, 64.5, ['E11'], { E: 90 });
  const cols = w.ents.cols;
  if (c !== null) {
    let guard = 0;
    while (jacketCoverage(cols.jacketMineral[prey]!, cols.B[prey]!) < c) {
      stepPinned(w, [[prey, 64.8, 64.5]]);
      expect(++guard).toBeLessThan(400);
    }
  }
  return { w, prey };
}

/** Place a hungry P10 beside the prey and hold the pair in contact until capture; returns the capture tick count. */
function duel(w: World, prey: number, max = 80) {
  const p10 = place(w, 'P10', 64.5, 64.5, { E: 50 });
  const c = w.ents.cols;
  const birth = c.birthId[prey]!;
  const jacketAtStart = c.jacketMineral[prey]!;
  const BAtStart = c.B[prey]!;
  const pins: Pins = [[p10, 64.5, 64.5], [prey, 64.8, 64.5]];
  let needSeen = -1;
  let jacketGrew = false;
  for (let k = 1; k <= max; k++) {
    const before = c.jacketMineral[prey]!;
    const cell = entityCell(64.8, 64.5);
    const grit0 = w.fields.grit![cell]!;
    stepPinned(w, pins);
    if (!w.ents.refValid(prey, birth)) {
      return { k, p10, needSeen, jacketAtStart, BAtStart, jacketGrew, gritGain: w.fields.grit![cell]! - grit0, jacketAtCapture: before };
    }
    if (needSeen < 0) needSeen = c.handlingNeed[p10]!;
    else expect(c.handlingNeed[p10]).toBe(needSeen); // the need never changes during the attempt
    if (c.jacketMineral[prey]! > before) jacketGrew = true;
  }
  throw new Error('no capture');
}

describe('E11 × P10 handling with real jackets (SPEC §7.3)', () => {
  it('an unjacketed P07 is captured on the 10th contact tick', () => {
    const { w, prey } = jacketedP07(null);
    const r = duel(w, prey);
    expect(r.k).toBe(10);
    expect(of(w, 'capture')[0]!.detail).toMatchObject({ handled: 1 });
  });

  it('a P07 that built c 0.5: need 1 + 3c sampled at the start (≈ 2.5 s), captured on exactly the k-th tick (25), not k − 1; the jacket keeps growing but the need does not change', () => {
    const { w, prey } = jacketedP07(0.5);
    const r = duel(w, prey);
    const start = of(w, 'handlingStart');
    expect(start).toHaveLength(1);
    const need = start[0]!.detail!.need as number;
    // c sampled at the attempt start: the jacket as it was before that tick's stage 8.
    expect(Object.is(need, 1 + 3 * jacketCoverage(r.jacketAtStart, r.BAtStart))).toBe(true);
    expect(need).toBeCloseTo(2.5, 2);
    expect(need).toBeGreaterThanOrEqual(2.5);
    const k = ticksFor(need);
    expect(k).toBe(25);
    expect(r.k).toBe(k);
    expect(r.k).not.toBe(k - 1);
    expect(r.needSeen).toBe(need);
    expect(r.jacketGrew).toBe(true);
    expect(r.jacketAtCapture).toBeGreaterThan(r.jacketAtStart);
    // The capture puts the whole jacket to grit and names the need it took.
    const cap = of(w, 'capture');
    expect(cap).toHaveLength(1);
    expect(cap[0]!.detail).toMatchObject({ handled: need });
    expect(r.gritGain).toBeCloseTo(r.jacketAtCapture, 15);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('a broken contact, then a new attempt samples the larger c', () => {
    const { w, prey } = jacketedP07(0.5);
    const p10 = place(w, 'P10', 64.5, 64.5, { E: 50 });
    const c = w.ents.cols;
    const pins: Pins = [[p10, 64.5, 64.5], [prey, 64.8, 64.5]];
    for (let k = 0; k < 8; k++) stepPinned(w, pins);
    const need1 = c.handlingNeed[p10]!;
    expect(need1).toBeGreaterThan(2.49);
    stepPinned(w, [[p10, 64.5, 64.5], [prey, 65.3, 64.5]]); // out of contact
    expect(c.handlingNeed[p10]).toBe(0);
    expect(of(w, 'handlingBreak').at(-1)!.detail).toMatchObject({ why: 'contact' });
    const j = c.jacketMineral[prey]!;
    const B = c.B[prey]!;
    stepPinned(w, pins);
    const need2 = c.handlingNeed[p10]!;
    expect(Object.is(need2, 1 + 3 * jacketCoverage(j, B))).toBe(true);
    expect(need2).toBeGreaterThan(need1);
    expect(of(w, 'handlingStart')).toHaveLength(2);
  });

  it('c 1 (a full jacket, 0.10 × B): captured on the 40th contact tick', () => {
    const { w, prey } = jacketedP07(1);
    const cols = w.ents.cols;
    expect(cols.jacketMineral[prey]).toBe(0.1 * cols.B[prey]!);
    const r = duel(w, prey);
    expect(r.needSeen).toBe(4);
    expect(r.k).toBe(40);
    expect(r.k).toBe(ticksFor(4));
    expect(r.jacketGrew).toBe(false); // a full jacket requests nothing
    expect(of(w, 'capture')[0]!.detail).toMatchObject({ handled: 4 });
    expect(r.gritGain).toBeCloseTo(r.jacketAtCapture, 15);
  });
});
