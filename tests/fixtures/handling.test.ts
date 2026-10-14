/**
 * P5.5 (Phase 5 wave 12, e3-predation): P10 Needlejaw's multi-tick handling (SPEC §3.2 row 5, §7.3 "capture
 * requires continuous contact for 1 s (P05 target: 4 s; E11 jacket: 1 + 3c s with c sampled at attempt start);
 * progress resets when contact breaks; target is not immobilized; cooldown starts only after a successful
 * capture"; D02 381–383; D04 155; CT §3.2, §12.5; D-0106; D-0122; src/sim/handling.ts).
 *
 * The dishes record P05, P07 and P10 through a test registry with allowUnimplemented: HANDLING (and
 * RADIUS_CAPTURE, DETRITUS_FALLBACK) join IMPLEMENTED_NATIVE_ABILITIES only at the wave 12 integration.
 * Positions are pinned right after stage 4 (StepHooks.afterStage), so stage 5 reads exactly the distance
 * under test while every other stage runs as in play.
 */
import { describe, expect, it } from 'vitest';
import { DT } from '../../src/sim/constants';
import { LIFE_PREPARING } from '../../src/sim/entities';
import { stageContacts } from '../../src/sim/contacts';
import type { SimEvent } from '../../src/sim/events';
import { cellIndex, SUB_SEDIMENT } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { det, STREAMS } from '../../src/sim/rng';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { CUE3_HANDLING, E_CUE3, ENT_STRIDE } from '../../src/worker/protocol';
import { packEntities } from '../../src/worker/snapshot';
import type { SystemFlag } from '../../src/sim/fields';
import { registryWith } from '../helpers/registry';
import { clearWater, place, pushEdges, registry } from '../helpers/world';

const shipped = registry().manifest;
const REG_P = registryWith(
  {
    enabledSpecies: [...shipped.enabledSpecies, 'A02', 'A03', 'A04', 'P05', 'P06', 'P07', 'P09', 'P10'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'silicate'].sort() as SystemFlag[],
  },
  { allowUnimplemented: true }, // HANDLING, RADIUS_CAPTURE, DETRITUS_FALLBACK: appended by the lead at integration
);

type Pins = Array<readonly [slot: number, x: number, y: number]>;

/** One tick with these organisms put at fixed positions right after stage 4 (movement). */
function stepPinned(w: World, pins: Pins | (() => Pins)): void {
  step(w, {
    afterStage: (s) => {
      if (s !== 4) return;
      for (const [slot, x, y] of typeof pins === 'function' ? pins() : pins) {
        if (!w.ents.isAlive(slot)) continue;
        w.ents.cols.x[slot] = x;
        w.ents.cols.y[slot] = y;
      }
      rebuildIndex(w);
    },
  });
}

const of = (w: World, type: SimEvent['type']) => w.events.ring.filter((e) => e.type === type);

function duel(preySp = 'P01', preyState: Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>> = {}, seed?: number) {
  const w = clearWater(seed === undefined ? {} : { seed }, REG_P);
  const p10 = place(w, 'P10', 64.5, 64.5, { E: 50 });
  const prey = place(w, preySp, 64.8, 64.5, preyState);
  return { w, p10, prey, preyBirth: w.ents.cols.birthId[prey]! };
}

/** Contact ticks until the prey is captured (pinned 0.3 apart), counting the start tick as the first. */
function contactTicksToCapture(w: World, p10: number, prey: number, birth: number, max = 80): number {
  for (let k = 1; k <= max; k++) {
    stepPinned(w, [[p10, 64.5, 64.5], [prey, 64.8, 64.5]]);
    if (!w.ents.refValid(prey, birth)) return k;
  }
  return -1;
}

/** The tick-boundary invariant (handling.ts): need > 0 ⇒ 0 < progress < need and preySlot ≥ 0; need 0 ⇒ progress 0. */
function expectInvariant(w: World): void {
  const c = w.ents.cols;
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const need = c.handlingNeed[i]!;
    const p = c.handlingProgress[i]!;
    if (need > 0) {
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(need);
      expect(c.preySlot[i]).toBeGreaterThanOrEqual(0);
    } else expect(p).toBe(0);
  }
}

describe('P10 handling (P5.5)', () => {
  it('captures a P01 on exactly the 10th consecutive contact tick (1 s), not the 9th; the attempt starts at 0.1 s', () => {
    const { w, p10, prey, preyBirth } = duel();
    const c = w.ents.cols;
    stepPinned(w, [[p10, 64.5, 64.5], [prey, 64.8, 64.5]]);
    const start = of(w, 'handlingStart');
    expect(start).toHaveLength(1);
    expect(start[0]).toMatchObject({ birthId: c.birthId[p10], detail: { prey: preyBirth, preySpecies: speciesIndex(w, 'P01'), need: 1 } });
    expect(c.handlingNeed[p10]).toBe(1);
    expect(c.handlingProgress[p10]).toBe(DT);
    expect(c.preySlot[p10]).toBe(prey);
    for (let k = 2; k <= 9; k++) {
      stepPinned(w, [[p10, 64.5, 64.5], [prey, 64.8, 64.5]]);
      expect(w.ents.refValid(prey, preyBirth)).toBe(true);
      expectInvariant(w);
    }
    expect(c.handlingProgress[p10]).toBeCloseTo(0.9, 12);
    stepPinned(w, [[p10, 64.5, 64.5], [prey, 64.8, 64.5]]);
    expect(w.ents.refValid(prey, preyBirth)).toBe(false);
    expect(c.handlingNeed[p10]).toBe(0);
    expect(c.handlingProgress[p10]).toBe(0);
    expect(of(w, 'handlingBreak')).toHaveLength(0);
    const cap = of(w, 'capture');
    expect(cap).toHaveLength(1);
    expect(cap[0]!.detail).toEqual({ prey: preyBirth, preySpecies: speciesIndex(w, 'P01'), handled: 1 });
  });

  it('P05 needs 4 s: captured on the 40th contact tick', () => {
    const { w, p10, prey, preyBirth } = duel('P05');
    expect(contactTicksToCapture(w, p10, prey, preyBirth)).toBe(40);
    expect(of(w, 'capture')[0]!.detail).toMatchObject({ handled: 4 });
  });

  it('a jacketed prey needs 1 + 3c s with c sampled at the start: c 0.5 → 25th, c 1 → 40th, c 0.125 → 14th', () => {
    for (const [jacket, ticks, need] of [[0.2, 25, 2.5], [0.4, 40, 4], [0.05, 14, 1.375], [0.8, 40, 4]] as const) {
      const { w, p10, prey, preyBirth } = duel('P01', { B: 4 });
      w.ents.cols.jacketMineral[prey] = jacket;
      w.ledger.inputs.m += jacket;
      expect(contactTicksToCapture(w, p10, prey, preyBirth)).toBe(ticks);
      expect(of(w, 'handlingStart')[0]!.detail!.need).toBeCloseTo(need, 12);
      expect(checkLedger(w).ok).toBe(true);
    }
  });

  it('raising the jacket mid-attempt keeps the need; a new attempt samples it again', () => {
    const { w, p10, prey, preyBirth } = duel('P01', { B: 4 });
    const c = w.ents.cols;
    c.jacketMineral[prey] = 0.2;
    w.ledger.inputs.m += 0.2;
    const pin: Pins = [[p10, 64.5, 64.5], [prey, 64.8, 64.5]];
    for (let k = 0; k < 5; k++) stepPinned(w, pin);
    expect(c.handlingNeed[p10]).toBe(2.5);
    c.jacketMineral[prey] = 0.4; // c 1 now
    w.ledger.inputs.m += 0.2;
    stepPinned(w, pin);
    expect(c.handlingNeed[p10]).toBe(2.5);
    // Break once (0.8 apart), then a new attempt samples c = 1: need 4.
    stepPinned(w, [[p10, 64.5, 64.5], [prey, 65.3, 64.5]]);
    expect(c.handlingNeed[p10]).toBe(0);
    stepPinned(w, pin);
    expect(c.handlingNeed[p10]).toBe(4);
    expect(w.ents.refValid(prey, preyBirth)).toBe(true);
  });

  it('a break resets: 6 contact ticks, then out of contact → need and progress 0 with one break (contact, 0.6); renewed contact needs 10 more', () => {
    const { w, p10, prey, preyBirth } = duel();
    const c = w.ents.cols;
    const pin: Pins = [[p10, 64.5, 64.5], [prey, 64.8, 64.5]];
    for (let k = 0; k < 6; k++) stepPinned(w, pin);
    expect(c.handlingProgress[p10]).toBeCloseTo(0.6, 12);
    stepPinned(w, [[p10, 64.5, 64.5], [prey, 65.1, 64.5]]); // 0.6 apart: out of contact
    expect(c.handlingNeed[p10]).toBe(0);
    expect(c.handlingProgress[p10]).toBe(0);
    expect(c.attackCooldown[p10]).toBe(0); // no cooldown after a break
    const br = of(w, 'handlingBreak');
    expect(br).toHaveLength(1);
    expect(br[0]!.detail!.why).toBe('contact');
    expect(br[0]!.detail!.prey).toBe(preyBirth);
    expect(br[0]!.detail!.progress as number).toBeCloseTo(0.6, 12);
    expect(c.preySlot[p10]).toBe(prey); // it keeps pursuing
    expectInvariant(w);
    // Back in contact: a new attempt from 0.1 s.
    stepPinned(w, pin);
    expect(c.handlingProgress[p10]).toBe(DT);
    expect(of(w, 'handlingStart')).toHaveLength(2);
    for (let k = 2; k <= 9; k++) stepPinned(w, pin);
    expect(w.ents.refValid(prey, preyBirth)).toBe(true);
    let cooldownAtCapture = -1;
    step(w, {
      afterStage: (s) => {
        if (s === 4) {
          c.x[p10] = 64.5;
          c.y[p10] = 64.5;
          c.x[prey] = 64.8;
          c.y[prey] = 64.5;
          rebuildIndex(w);
        }
        if (s === 5) cooldownAtCapture = c.attackCooldown[p10]!;
      },
    });
    expect(w.ents.refValid(prey, preyBirth)).toBe(false);
    expect(cooldownAtCapture).toBe(6); // the 6 s cooldown starts with the capture (CT §1.3 P10)
  });

  it('the target is not immobilized: an unpinned P01 keeps moving through the attempt', () => {
    const { w, p10, prey, preyBirth } = duel();
    const c = w.ents.cols;
    // B01 food draws the P01 away; the P10 is put 0.3 behind it after each movement stage.
    for (let k = 0; k < 6; k++) place(w, 'B01', 67.5 + k * 0.3, 64.5);
    const xs: number[] = [];
    for (let k = 0; k < 8; k++) {
      const before = c.x[prey]!;
      step(w, {
        afterStage: (s) => {
          if (s !== 4) return;
          xs.push(c.x[prey]! - before);
          c.x[p10] = c.x[prey]! - 0.3;
          c.y[p10] = c.y[prey]!;
          rebuildIndex(w);
        },
      });
      if (k >= 1) expect(c.handlingNeed[p10]).toBe(1);
    }
    expect(w.ents.refValid(prey, preyBirth)).toBe(true);
    expect(xs.slice(1).every((dx) => dx > 0)).toBe(true); // it moved every tick of the attempt
  });

  it('keeps its target through a decision tick when a nearer P02 appears (H1)', () => {
    const { w, p10, prey, preyBirth } = duel();
    const c = w.ents.cols;
    const p02 = place(w, 'P02', 64.6, 64.5);
    // The P01 is in contact first: the P02 arrives only after the attempt began.
    c.x[p02] = 70.5;
    rebuildIndex(w);
    const pins = (): Pins => [[p10, 64.5, 64.5], [prey, 64.8, 64.5]];
    stepPinned(w, pins);
    expect(c.preySlot[p10]).toBe(prey);
    for (let k = 2; k <= 9; k++) {
      stepPinned(w, () => [...pins(), [p02, 64.55, 64.5]]); // nearer than the P01, every tick, decision ticks included
      expect(c.preySlot[p10]).toBe(prey);
    }
    stepPinned(w, () => [...pins(), [p02, 64.55, 64.5]]);
    expect(w.ents.refValid(prey, preyBirth)).toBe(false);
    expect(w.ents.isAlive(p02)).toBe(true);
  });

  it('an invalid target ends the attempt as "target": the prey dies of age, or slips behind an S02', () => {
    {
      const { w, p10, prey } = duel();
      const pin: Pins = [[p10, 64.5, 64.5], [prey, 64.8, 64.5]];
      for (let k = 0; k < 3; k++) stepPinned(w, pin);
      w.ents.cols.age[prey] = 10_000; // dies of age in stage 7
      stepPinned(w, pin);
      stepPinned(w, pin);
      const br = of(w, 'handlingBreak');
      expect(br).toHaveLength(1);
      expect(br[0]!.detail!.why).toBe('target');
      expect(w.ents.cols.handlingNeed[p10]).toBe(0);
    }
    {
      const { w, p10, prey } = duel();
      pushEdges(w, [{ kind: 'S02', cell: cellIndex(64, 64), dir: 'R' }]);
      w.ents.cols.x[prey] = 64.8;
      const pin: Pins = [[p10, 64.5, 64.5], [prey, 64.8, 64.5]];
      for (let k = 0; k < 3; k++) stepPinned(w, pin);
      expect(w.ents.cols.handlingNeed[p10]).toBe(1);
      stepPinned(w, [[p10, 64.8, 64.5], [prey, 65.2, 64.5]]); // 0.4 apart, across the S02 (Large and Medium refused)
      const br = of(w, 'handlingBreak');
      expect(br).toHaveLength(1);
      expect(br[0]!.detail!.why).toBe('target');
      expect(w.ents.cols.handlingNeed[p10]).toBe(0);
    }
  });

  it('energy at 85 (no longer hungry) ends the attempt as "hunger"', () => {
    const { w, p10, prey } = duel();
    const pin: Pins = [[p10, 64.5, 64.5], [prey, 64.8, 64.5]];
    for (let k = 0; k < 4; k++) stepPinned(w, pin);
    w.ents.cols.E[p10] = 85;
    stepPinned(w, pin);
    const br = of(w, 'handlingBreak');
    expect(br).toHaveLength(1);
    expect(br[0]!.detail!.why).toBe('hunger');
    expect(br[0]!.detail!.progress as number).toBeCloseTo(0.4, 12);
    expect(w.ents.cols.handlingNeed[p10]).toBe(0);
    expect(w.ents.cols.handlingProgress[p10]).toBe(0);
  });

  it('a handler that leaves Active ends its attempt as "rest" at its next stage 5; no cooldown', () => {
    const { w, p10, prey } = duel();
    const pin: Pins = [[p10, 64.5, 64.5], [prey, 64.8, 64.5]];
    for (let k = 0; k < 3; k++) stepPinned(w, pin);
    const c = w.ents.cols;
    c.lifeState[p10] = LIFE_PREPARING; // test state: as dormancy.ts leaves it at the end of a stage 8
    rebuildIndex(w);
    stageContacts(w);
    const br = of(w, 'handlingBreak');
    expect(br).toHaveLength(1);
    expect(br[0]!.detail!.why).toBe('rest');
    expect(br[0]!.detail!.progress as number).toBeCloseTo(0.3, 12);
    expect(c.handlingNeed[p10]).toBe(0);
    expect(c.handlingProgress[p10]).toBe(0);
    expect(c.attackCooldown[p10]).toBe(0);
  });

  it('two P10 completing on one P01 together: one winner by the det priority (both slot orders, several seeds); the loser ends "taken" with no cooldown and no progress', () => {
    const winnersBySlot = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const reversed of [false, true]) {
        const w = clearWater({ seed }, REG_P);
        const c = w.ents.cols;
        const prey = reversed ? place(w, 'P01', 64.8, 64.5) : -1;
        const a = place(w, 'P10', 64.5, 64.5, { E: 50 });
        const b = place(w, 'P10', 65.1, 64.5, { E: 50 });
        const target = reversed ? prey : place(w, 'P01', 64.8, 64.5);
        const birth = c.birthId[target]!;
        const pin: Pins = [[a, 64.5, 64.5], [b, 65.1, 64.5], [target, 64.8, 64.5]];
        for (let k = 1; k <= 9; k++) stepPinned(w, pin);
        expect(c.handlingProgress[a]).toBeCloseTo(0.9, 12);
        expect(c.handlingProgress[b]).toBeCloseTo(0.9, 12);
        let cd: [number, number] = [-1, -1];
        step(w, {
          afterStage: (s) => {
            if (s === 4) {
              for (const [slot, x, y] of pin) {
                c.x[slot] = x;
                c.y[slot] = y;
              }
              rebuildIndex(w);
            }
            if (s === 5) cd = [c.attackCooldown[a]!, c.attackCooldown[b]!];
          },
        });
        expect(w.ents.refValid(target, birth)).toBe(false);
        expect(of(w, 'capture')).toHaveLength(1);
        const winner = of(w, 'capture')[0]!.birthId!;
        const loser = winner === c.birthId[a] ? b : a;
        expect(c.handlingNeed[a]).toBe(0);
        expect(c.handlingNeed[b]).toBe(0);
        expect(c.handlingProgress[loser]).toBe(0);
        expect(cd[loser === a ? 0 : 1]).toBe(0);
        expect(cd[loser === a ? 1 : 0]).toBe(6);
        const br = of(w, 'handlingBreak');
        expect(br).toHaveLength(1);
        expect(br[0]).toMatchObject({ birthId: c.birthId[loser], detail: { why: 'taken' } });
        // The winner is the det priority's choice, recomputed from the birthIds of the capture tick.
        const tick = of(w, 'capture')[0]!.tick;
        const pa = det(w.seed, STREAMS.contact, tick, 1, c.birthId[a]!);
        const pb = det(w.seed, STREAMS.contact, tick, 1, c.birthId[b]!);
        expect(winner).toBe(pa > pb || (pa === pb && c.birthId[a]! < c.birthId[b]!) ? c.birthId[a] : c.birthId[b]);
        winnersBySlot.add(winner === c.birthId[a] ? 'lower slot' : 'higher slot');
        expectInvariant(w);
      }
    }
    expect([...winnersBySlot].sort()).toEqual(['higher slot', 'lower slot']);
  });

  it('moves no material before the capture; the capture moves exactly consumePrey\'s amounts', () => {
    // Two dishes with the same organisms in the same cells: in contact (A, handling) and 0.7 apart (B, no
    // attempt). Every field is per cell, so any material the attempt moved would show as a difference.
    const dish = () => {
      const w = clearWater({}, REG_P);
      const p10 = place(w, 'P10', 64.5, 64.5, { E: 50 });
      const prey = place(w, 'P01', 64.8, 64.5);
      return { w, p10, prey };
    };
    const a = dish();
    const b = dish();
    const fieldIds = Object.keys(a.w.fields).sort() as (keyof World['fields'])[];
    for (let k = 1; k <= 9; k++) {
      stepPinned(a.w, [[a.p10, 64.5, 64.5], [a.prey, 64.8, 64.5]]);
      stepPinned(b.w, [[b.p10, 64.1, 64.5], [b.prey, 64.8, 64.5]]);
      expect(a.w.ents.cols.handlingNeed[a.p10]).toBe(1);
      expect(b.w.ents.cols.handlingNeed[b.p10]).toBe(0);
      for (const id of fieldIds) expect(Buffer.from(a.w.fields[id]!.buffer).equals(Buffer.from(b.w.fields[id]!.buffer))).toBe(true);
      for (const col of ['B', 'N', 'mealC', 'mealN', 'boundMineral', 'jacketMineral'] as const) {
        for (const s of [a.p10, a.prey]) expect(Object.is(a.w.ents.cols[col][s], b.w.ents.cols[col][s])).toBe(true);
      }
      expect(computeTotals(a.w)).toEqual(computeTotals(b.w));
    }
    const c = a.w.ents.cols;
    const B = c.B[a.prey]!;
    const N = c.N[a.prey]!;
    const before = computeTotals(a.w);
    stageContactsAtTick(a.w, [[a.p10, 64.5, 64.5], [a.prey, 64.8, 64.5]]);
    expect(a.w.ents.isAlive(a.prey)).toBe(false);
    expect(c.mealC[a.p10]).toBe(B); // all of it: the meal has room for 24
    expect(c.mealN[a.p10]).toBeCloseTo(N, 15);
    const after = computeTotals(a.w);
    expect(after.c).toBeCloseTo(before.c, 12);
    expect(after.n).toBeCloseTo(before.n, 12);
    expect(checkLedger(a.w).ok).toBe(true);
  });

  it('packEntities sets the CUE3 handling bit during the attempt and clears it after', () => {
    const { w, p10, prey, preyBirth } = duel();
    const cueOf = () => {
      const packed = packEntities(w, null, null);
      for (let k = 0; k < packed.count; k++) if (packed.ids[k] === w.ents.cols.birthId[p10]) return packed.ents[k * ENT_STRIDE + E_CUE3]!;
      throw new Error('P10 not packed');
    };
    expect(cueOf() & CUE3_HANDLING).toBe(0);
    const pin: Pins = [[p10, 64.5, 64.5], [prey, 64.8, 64.5]];
    for (let k = 1; k <= 9; k++) {
      stepPinned(w, pin);
      expect(cueOf() & CUE3_HANDLING).toBe(CUE3_HANDLING);
    }
    stepPinned(w, pin);
    expect(w.ents.refValid(prey, preyBirth)).toBe(false);
    expect(cueOf() & CUE3_HANDLING).toBe(0);
  });

  it('a held P04 (the trap pair set by hand) still captures a B01 in contact (D-0106)', () => {
    const regF = registryWith(
      { enabledSpecies: [...REG_P.manifest.enabledSpecies, 'F03'].sort(), enabledSystems: [...REG_P.manifest.enabledSystems] as SystemFlag[] },
      { allowUnimplemented: true }, // F03's TRAP: implemented by wave 13's e3-traps
    );
    const w = clearWater({}, regF);
    const c = w.ents.cols;
    // P04 lives in sediment: paint its cell.
    w.grid.substrate[cellIndex(64, 64)] = SUB_SEDIMENT;
    w.grid.substrate[cellIndex(65, 64)] = SUB_SEDIMENT;
    w.grid.geometryVersion++;
    const p04 = place(w, 'P04', 64.5, 64.5, { E: 50 });
    const trap = place(w, 'F03', 65.5, 64.5);
    c.heldBySlot[p04] = trap;
    c.heldByBirthId[p04] = c.birthId[trap]!;
    c.trapSlot[trap] = p04;
    c.trapBirthId[trap] = c.birthId[p04]!;
    const b01 = place(w, 'B01', 64.8, 64.5);
    const birth = c.birthId[b01]!;
    stageContacts(w);
    expect(w.ents.refValid(b01, birth)).toBe(false);
    expect(c.mealC[p04]).toBeGreaterThan(0);
  });
});

/** Stage 5 alone at the current tick, with positions pinned (the capture tick of the material test). */
function stageContactsAtTick(w: World, pins: Pins): void {
  for (const [slot, x, y] of pins) {
    w.ents.cols.x[slot] = x;
    w.ents.cols.y[slot] = y;
  }
  rebuildIndex(w);
  stageContacts(w);
}
