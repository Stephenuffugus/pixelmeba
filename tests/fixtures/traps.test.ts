/**
 * P5.5 (Phase 5 wave 13, e3-traps): F03 Traplace's trap (SPEC §7.17, §3.2 rows 5–8, §6.5, §6.8; CT §3.3, §10.3
 * E213, §12.3, §12.5; D02 391–393; D-0106, D-0108, D-0124; src/sim/traps.ts).
 *
 * The dishes record F03 through a test registry with allowUnimplemented: TRAP joins IMPLEMENTED_NATIVE_ABILITIES
 * only when the lead appends it at the wave 13 integration (nothing is enabled before the organism flip, D-0104).
 * P04 is shipped. Positions are pinned right after stage 4 where a test needs an exact cell.
 *
 * The timeline asserted (armed at stage 8 of tick A): held at stage 5 of A + 1; drained in stage 6 of A + 1 …
 * A + 80 (80 drains: 8 s); released at stage 8 of A + 80; the cooldown counts down at stage 8 of A + 81 … A + 380
 * and is 0 there; the trap catches again at stage 5 of A + 381 (300 full ticks without a capture).
 */
import { describe, expect, it } from 'vitest';
import { ActionContext } from '../../src/sim/actions';
import { divisionBlocker } from '../../src/sim/births';
import { consumePrey } from '../../src/sim/contacts';
import {
  AVAIL_K,
  DT,
  TRAP_ARM_ENERGY,
  TRAP_COOLDOWN_SECONDS,
  TRAP_HOLD_SECONDS,
  TRAP_RESERVE_C,
} from '../../src/sim/constants';
import { ENTITY_COLUMNS } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { FIELD_DEFS, FIELD_IDS } from '../../src/sim/fields';
import { cellIndex, maskCells, SUB_SEDIMENT } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { det, STREAMS } from '../../src/sim/rng';
import { objectTotals } from '../../src/sim/objects';
import { sampleTotals } from '../../src/sim/sampleSlot';
import { rebuildIndex } from '../../src/sim/spatial';
import { run, step, type StepHooks } from '../../src/sim/tick';
import { KIND_TRAP, trapApplies, trapArmRun, trapView, heldView } from '../../src/sim/traps';
import type { World } from '../../src/sim/world';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { registryWith } from '../helpers/registry';
import { RC1_SAVE_FILES, readRc1SaveText } from '../helpers/rc1-saves';
import { clearWater, fillField, place, preOrganismFlipRegistry, rebaseLedger, registry, setField } from '../helpers/world';

const shipped = registry().manifest;
// TRAP is appended to IMPLEMENTED_NATIVE_ABILITIES by the lead at the wave 13 integration (e3-traps).
const REG_T = registryWith({ enabledSpecies: [...shipped.enabledSpecies, 'F03'].sort() }, { allowUnimplemented: true });
const CENTER = cellIndex(64, 64);

type State = Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>>;

/** Sediment on every cell whose centre lies within r of (cx, cy) (CT §10.3 E213: "sediment r 15 at (64, 64)"). */
function sedimentDisc(w: World, cx = 64, cy = 64, r = 15): void {
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) w.grid.substrate[cellIndex(x, y)] = SUB_SEDIMENT;
  w.grid.geometryVersion++;
}

/** The E213 shape: sediment r 15 at (64, 64), F03 B 2.8, N 0.28, E 80 and one P04 at the centre, no broth. */
function e213(opts: { seed?: number; f03?: State; p04?: State; p04At?: readonly [number, number] } = {}) {
  const w = clearWater(opts.seed === undefined ? {} : { seed: opts.seed }, REG_T);
  sedimentDisc(w);
  fillField(w, 'broth', 0);
  const f = place(w, 'F03', 64.5, 64.5, { B: 2.8, N: 0.28, E: 80, ...opts.f03 });
  const at = opts.p04At ?? [64.6, 64.5];
  const p = place(w, 'P04', at[0], at[1], { E: 100, ...opts.p04 });
  rebaseLedger(w);
  return { w, f, p, c: w.ents.cols };
}

/** Keep organisms (by birthId) at fixed positions right after stage 4 (movement). */
function pinHook(pins: () => ReadonlyArray<readonly [birthId: number, x: number, y: number]>): StepHooks {
  return {
    afterStage: (s, w) => {
      if (s !== 4) return;
      const c = w.ents.cols;
      for (const [b, x, y] of pins()) {
        for (let i = 0; i < w.ents.highWater; i++) {
          if (c.alive[i] !== 1 || c.birthId[i] !== b) continue;
          c.x[i] = x;
          c.y[i] = y;
        }
      }
      rebuildIndex(w);
    },
  };
}

function both(...hooks: StepHooks[]): StepHooks {
  return { afterStage: (s, w) => hooks.forEach((h) => h.afterStage?.(s, w)) };
}

const of = (w: World, type: SimEvent['type']) => w.events.ring.filter((e) => e.type === type);
const atTick = (w: World, type: SimEvent['type'], tick: number) => of(w, type).filter((e) => e.tick === tick);

/** Tick-boundary invariants of the trap (traps.ts; D-0124). */
function expectTrapInvariants(w: World): void {
  const c = w.ents.cols;
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const timer = c.trapTimer[i]!;
    const cd = c.trapCooldown[i]!;
    expect(cd).toBeGreaterThanOrEqual(0);
    expect(cd).toBeLessThanOrEqual(TRAP_COOLDOWN_SECONDS);
    if (c.trapSlot[i]! >= 0) {
      const t = c.trapSlot[i]!;
      expect(w.ents.refValid(t, c.trapBirthId[i]!)).toBe(true);
      expect(c.heldBySlot[t]).toBe(i);
      expect(c.heldByBirthId[t]).toBe(c.birthId[i]);
      expect(timer).toBeGreaterThan(0);
      expect(timer).toBeLessThan(TRAP_HOLD_SECONDS);
      expect(cd).toBe(0);
      // A held organism is in its owner's cell.
      expect(Math.floor(c.x[t]!)).toBe(Math.floor(c.x[i]!));
      expect(Math.floor(c.y[t]!)).toBe(Math.floor(c.y[i]!));
    } else {
      expect(timer).toBe(0);
      expect(c.trapBirthId[i]).toBe(0);
    }
    if (c.trapSlot[i]! >= 0 || cd > 0 || timer !== 0 || c.trapReserveN[i] !== 0) expect(c.trapReserveC[i]).toBeGreaterThan(0);
    if (c.heldBySlot[i]! >= 0) {
      const h = c.heldBySlot[i]!;
      expect(w.ents.refValid(h, c.heldByBirthId[i]!)).toBe(true);
      expect(c.trapSlot[h]).toBe(i);
    } else expect(c.heldByBirthId[i]).toBe(0);
  }
}

describe('F03 arms its trap (stage 8; SPEC §7.17, CT §12.5)', () => {
  it('E213: moves exactly 0.20 C and 0.02 N into the reserve, spends 8 E under construction, one trapArmed', () => {
    const { w, f, c } = e213();
    const before = { B: 0, N: 0, E: 0, cons: 0 };
    let after8 = { B: 0, N: 0, E: 0, cons: 0 };
    step(w, {
      afterStage: (s) => {
        if (s === 7) Object.assign(before, { B: c.B[f]!, N: c.N[f]!, E: c.E[f]!, cons: w.ledger.energy.construction });
        if (s === 8) after8 = { B: c.B[f]!, N: c.N[f]!, E: c.E[f]!, cons: w.ledger.energy.construction };
      },
    });
    expect(before.B).toBe(2.8);
    expect(before.N).toBe(0.28);
    expect(Object.is(c.trapReserveC[f], TRAP_RESERVE_C)).toBe(true);
    expect(Object.is(c.trapReserveN[f], (0.28 * 0.2) / 2.8)).toBe(true);
    expect(c.trapReserveN[f]).toBeCloseTo(0.02, 15);
    expect(Object.is(after8.B, 2.8 - 0.2)).toBe(true);
    expect(Object.is(after8.N, 0.28 - (0.28 * 0.2) / 2.8)).toBe(true);
    expect(after8.B).toBeCloseTo(2.6, 14);
    expect(after8.N).toBeCloseTo(0.26, 14);
    expect(Object.is(after8.E, before.E - TRAP_ARM_ENERGY)).toBe(true);
    expect(Object.is(after8.cons, before.cons + 8)).toBe(true);
    const armed = of(w, 'trapArmed');
    expect(armed).toHaveLength(1);
    expect(armed[0]).toMatchObject({ tick: 0, birthId: c.birthId[f], cell: CENTER, amount: 0.2, detail: { reserveN: c.trapReserveN[f], energy: 8 } });
    // Internal move: the ledger closes with the reserve counted.
    expect(checkLedger(w).ok).toBe(true);
    expect(computeTotals(w).breakdown.trapC).toBe(0.2);
    expect(trapView(w, f)).toMatchObject({ state: 'armed', reserveC: 0.2, target: null, heldSeconds: 0, cooldownLeft: 0 });
  });

  it('refuses at E 49.99 and B 2.59; E 50 and B 2.6 = 1.3 × 2 arm (inclusive)', () => {
    const armWith = (E: number, B: number) => {
      const { w, f, c } = e213();
      step(w, {
        afterStage: (s) => {
          if (s !== 7) return;
          c.E[f] = E;
          c.B[f] = B;
        },
      });
      return c.trapReserveC[f]! > 0;
    };
    expect(armWith(49.99, 2.8)).toBe(false);
    expect(armWith(50, 2.8)).toBe(true);
    expect(armWith(80, 2.59)).toBe(false);
    expect(armWith(80, 2.6)).toBe(true);
    // The run's reason codes, on the same states.
    const { w, f, c } = e213();
    const ctx = new ActionContext(w);
    c.E[f] = 49.99;
    ctx.begin(f, profileOf(w, f));
    expect(trapArmRun(ctx)).toBe(R.ENERGY_LOW);
    expect(c.trapReserveC[f]).toBe(0);
  });

  it("never below B0': the guard binds on a body of b0 0.5 (F03's own b0 2 cannot reach it: 1.3 × 2 − 0.2 = 2.4 ≥ 2)", () => {
    const { w, f, c } = e213();
    const small = { ...profileOf(w, f), b0: 0.5 };
    const ctx = new ActionContext(w);
    c.E[f] = 80;
    c.B[f] = 0.69; // ≥ 1.3 × 0.5 = 0.65, but 0.69 − 0.20 = 0.49 < 0.5
    ctx.begin(f, small);
    expect(trapArmRun(ctx)).toBe(R.NONE);
    expect(c.trapReserveC[f]).toBe(0);
    expect(c.B[f]).toBe(0.69);
    c.B[f] = 0.75; // 0.55 ≥ 0.5
    ctx.begin(f, small);
    trapArmRun(ctx);
    expect(c.trapReserveC[f]).toBe(0.2);
  });
});

describe('the hold, the drain, the release and the cooldown (E213 timeline)', () => {
  it('holds at A + 1, drains 80 times by the closed form, releases at A + 80, catches again at A + 381 and not before', () => {
    const { w, f, p, c } = e213();
    const fBirth = c.birthId[f]!;
    const pBirth = c.birthId[p]!;
    const sp = w.species[c.species[f]!]!;
    expect(sp.def.drainRate).toBe(0.03);
    step(w); // tick A = 0: armed in stage 8
    const A = 0;
    expect(atTick(w, 'trapArmed', A)).toHaveLength(1);
    let snap: Record<string, number> | null = null;
    let drains = 0;
    const drainCheck: StepHooks = {
      afterStage: (s, ww) => {
        if (s === 5) {
          snap =
            c.heldBySlot[p] === f
              ? {
                  tB: c.B[p]!,
                  tN: c.N[p]!,
                  fB: c.B[f]!,
                  fN: c.N[f]!,
                  fE: c.E[f]!,
                  co2: ww.fields.co2![CENTER]!,
                  met: ww.fields.metabolite![CENTER]!,
                  o2: ww.fields.oxygen![CENTER]!,
                  nut: ww.fields.nutrient![CENTER]!,
                }
              : null;
        }
        if (s === 6 && snap !== null) {
          const C = Math.min(sp.def.drainRate * DT, snap.tB!);
          const bound = (snap.tN! * C) / snap.tB!;
          expect(Math.max(0, 0.05 * C - bound)).toBe(0); // P04's bound N covers F03's 0.05 N per C
          expect(C).toBeCloseTo(0.003, 15);
          expect(Object.is(c.B[p], snap.tB! - C)).toBe(true);
          expect(Object.is(c.N[p], snap.tN! - bound)).toBe(true);
          expect(Object.is(c.B[f], snap.fB! + 0.5 * C)).toBe(true);
          expect(Object.is(c.N[f], snap.fN! + 0.05 * C)).toBe(true);
          expect(Object.is(c.E[f], snap.fE! + 30 * C)).toBe(true);
          expect(Object.is(ww.fields.co2![CENTER], snap.co2! + 0.3 * C)).toBe(true);
          expect(Object.is(ww.fields.metabolite![CENTER], snap.met! + 0.2 * C)).toBe(true);
          expect(Object.is(ww.fields.oxygen![CENTER], snap.o2)).toBe(true); // no O2 debit
          expect(Object.is(ww.fields.nutrient![CENTER], snap.nut! + (bound + 0 - 0.05 * C))).toBe(true); // surplus bound N
          expect(0.5 * C).toBeCloseTo(0.0015, 15);
          expect(30 * C).toBeCloseTo(0.09, 14);
          drains++;
        }
      },
    };
    // A + 1: the hold starts at stage 5.
    step(w, drainCheck);
    const held = atTick(w, 'trapHold', A + 1);
    expect(held).toHaveLength(1);
    expect(held[0]).toMatchObject({ birthId: fBirth, cell: CENTER, cause: R.HELD_IN_TRAP, detail: { target: pBirth, targetSpecies: c.species[p] } });
    expect(heldView(w, p)).toMatchObject({ ownerBirthId: fBirth, ownerSpeciesIdx: c.species[f] });
    const x1 = c.x[p]!;
    const y1 = c.y[p]!;
    expectTrapInvariants(w);
    for (let t = A + 2; t <= A + 80; t++) {
      step(w, drainCheck);
      if (t < A + 80) {
        expect(c.heldBySlot[p]).toBe(f);
        expect(c.x[p]).toBe(x1); // a held organism never moves (T3)
        expect(c.y[p]).toBe(y1);
        expect(trapView(w, f)!.state).toBe('holding');
      }
      expectTrapInvariants(w);
    }
    expect(drains).toBe(80);
    expect(c.B[p]).toBeCloseTo(8 - 80 * 0.003, 12);
    const rel = of(w, 'trapRelease');
    expect(rel).toHaveLength(1);
    expect(rel[0]).toMatchObject({ tick: A + 80, birthId: fBirth, detail: { target: pBirth, why: 'timer', seconds: 8 } });
    expect(c.trapSlot[f]).toBe(-1);
    expect(c.trapBirthId[f]).toBe(0);
    expect(c.heldBySlot[p]).toBe(-1);
    expect(c.heldByBirthId[p]).toBe(0);
    expect(c.trapTimer[f]).toBe(0);
    expect(c.trapCooldown[f]).toBe(TRAP_COOLDOWN_SECONDS);
    expect(trapView(w, f)).toMatchObject({ state: 'cooldown', cooldownLeft: 30 });
    // One trap only: never a second arm while the reserve exists, even after release.
    expect(trapApplies(profileOf(w, f), w, f)).toBe(false);
    // 300 ticks with the P04 kept in the trap's cell: no capture.
    const keep = pinHook(() => [[pBirth, 64.6, 64.5]]);
    for (let t = A + 81; t <= A + 380; t++) {
      step(w, keep);
      expect(atTick(w, 'trapHold', t)).toHaveLength(0);
      expectTrapInvariants(w);
    }
    expect(c.trapCooldown[f]).toBe(0);
    expect(trapView(w, f)!.state).toBe('armed');
    step(w, keep); // A + 381
    expect(atTick(w, 'trapHold', A + 381)).toHaveLength(1);
    expect(of(w, 'trapArmed')).toHaveLength(1);
    expect(c.trapReserveC[f]).toBe(0.2);
  });

  it('the P04 moves again after its release', () => {
    const { w, p, c } = e213();
    run(w, 81);
    expect(of(w, 'trapRelease')).toHaveLength(1);
    const x = c.x[p]!;
    const y = c.y[p]!;
    let moved = false;
    for (let k = 0; k < 40 && !moved; k++) {
      step(w);
      moved = c.x[p] !== x || c.y[p] !== y;
    }
    expect(moved).toBe(true);
  });

  it('a holding F03 requests no broth; after release it requests min(budget × availability, P)', () => {
    const { w, f, c } = e213();
    for (let y = 62; y <= 66; y++) for (let x = 62; x <= 66; x++) setField(w, 'broth', cellIndex(x, y), 0.5);
    let before = 0;
    let budgetReq = 0;
    const watch: StepHooks = {
      afterStage: (s, ww) => {
        if (s === 5) {
          before = ww.fields.broth![CENTER]!;
          const prof = profileOf(ww, f);
          const budget = prof.q * c.suitability[f]! * DT * (ww.derived.cellLoad[CENTER]! > 8 ? 0.5 : 1);
          budgetReq = Math.min(before, budget * (before / (before + AVAIL_K)));
        }
      },
    };
    let brothDelta = 0;
    const measure: StepHooks = { afterStage: (s, ww) => s === 6 && (brothDelta = before - ww.fields.broth![CENTER]!) };
    step(w, both(watch, measure)); // arm (it ate broth: not holding)
    expect(brothDelta).toBeGreaterThan(0);
    step(w, both(watch, measure)); // the hold starts at stage 5 of this tick: no broth in stage 6
    expect(c.trapSlot[f]).toBeGreaterThanOrEqual(0);
    expect(brothDelta).toBe(0);
    for (let k = 0; k < 78; k++) {
      step(w, both(watch, measure));
      expect(brothDelta).toBe(0);
    }
    step(w, both(watch, measure)); // A + 80: still held in stage 6, released in stage 8
    expect(brothDelta).toBe(0);
    expect(c.trapSlot[f]).toBe(-1);
    step(w, both(watch, measure)); // released: broth again, exactly its request (the only eater, L = 1)
    expect(before).toBeGreaterThan(0);
    expect(brothDelta).toBeGreaterThan(0);
    expect(brothDelta).toBeCloseTo(budgetReq, 15);
  });
});

describe('who is caught (stage 5)', () => {
  it('two P04 in the cell: the nearer is held', () => {
    const { w, f, p: far, c } = e213({ p04At: [64.9, 64.9] });
    const near = place(w, 'P04', 64.6, 64.5, { E: 100 });
    const pins = pinHook(() => [
      [c.birthId[near]!, 64.6, 64.5],
      [c.birthId[far]!, 64.9, 64.9],
    ]);
    step(w, pins);
    step(w, pins);
    expect(c.trapSlot[f]).toBe(near);
    expect(c.heldBySlot[far]).toBe(-1);
    expect(of(w, 'trapHold')).toHaveLength(1);
  });

  /** Two F03 in one cell and one P04 between them; returns the birthId of the winner. */
  function duel(seed: number, reverse: boolean): number {
    const w = clearWater({ seed }, REG_T);
    sedimentDisc(w);
    fillField(w, 'broth', 0);
    const posA = [64.3, 64.5] as const;
    const posB = [64.7, 64.5] as const;
    const first = reverse ? posB : posA;
    const second = reverse ? posA : posB;
    const s0 = place(w, 'F03', first[0], first[1], { B: 2.8, N: 0.28, E: 80 });
    const s1 = place(w, 'F03', second[0], second[1], { B: 2.8, N: 0.28, E: 80 });
    const p = place(w, 'P04', 64.5, 64.5, { E: 100 });
    const c = w.ents.cols;
    if (reverse) {
      // Same identities at the same positions, in reversed slots: birthId 1 at posA, 2 at posB.
      c.birthId[s0] = 2;
      c.birthId[s1] = 1;
    }
    const pins = pinHook(() => [[c.birthId[p]!, 64.5, 64.5], [1, posA[0], posA[1]], [2, posB[0], posB[1]]]);
    step(w, pins);
    step(w, pins);
    expect(of(w, 'trapHold')).toHaveLength(1);
    const winner = c.heldByBirthId[p]!;
    expect(winner === 1 || winner === 2).toBe(true);
    return winner;
  }

  it('two F03 in one cell and one P04: one winner by the det priority (KIND_TRAP 5), slot order irrelevant; a seed exists for each winner', () => {
    const expected = (seed: number) => {
      // contacts.ts's kind list: 5 is the trap (never 1, the attack priority).
      const p1 = det(seed, STREAMS.contact, 1, 5, 1);
      const p2 = det(seed, STREAMS.contact, 1, 5, 2);
      return p1 > p2 || p1 === p2 ? 1 : 2;
    };
    expect(KIND_TRAP).toBe(5);
    const seen = new Set<number>();
    for (let seed = 1; seed <= 40 && seen.size < 2; seed++) {
      const want = expected(seed);
      if (seen.has(want)) continue;
      expect(duel(seed, false)).toBe(want);
      expect(duel(seed, true)).toBe(want);
      seen.add(want);
    }
    expect([...seen].sort()).toEqual([1, 2]);
  });

  it('a P04 in the neighbouring cell 0.3 away is never held; in the cell it is', () => {
    const { w, f, p, c } = e213({ p04At: [65.2, 64.5] });
    c.x[f] = 64.9;
    rebuildIndex(w);
    const pBirth = c.birthId[p]!;
    let x = 65.2;
    const pins = pinHook(() => [[pBirth, x, 64.5], [c.birthId[f]!, 64.9, 64.5]]);
    for (let k = 0; k < 100; k++) step(w, pins);
    expect(of(w, 'trapHold')).toHaveLength(0);
    x = 64.95;
    step(w, pins);
    expect(of(w, 'trapHold')).toHaveLength(1);
  });

  it('a held P04 still captures a B01 in contact (D-0106)', () => {
    const { w, f, p, c } = e213({ p04: { E: 70 } });
    step(w);
    step(w);
    expect(c.trapSlot[f]).toBe(p);
    const b01 = place(w, 'B01', c.x[p]! + 0.2, c.y[p]!);
    const bBirth = c.birthId[b01]!;
    const px = c.x[p]!;
    const py = c.y[p]!;
    step(w, pinHook(() => [[bBirth, px + 0.2, py]]));
    const cap = of(w, 'capture');
    expect(cap).toHaveLength(1);
    expect(cap[0]).toMatchObject({ birthId: c.birthId[p], detail: { prey: bBirth } });
    expect(c.heldBySlot[p]).toBe(f);
  });
});

describe('deaths, division and removal', () => {
  it("drain death: a P04 at B 2.0005 dies in the stage 7 after B falls below 0.25 × 8; the trap starts its 30 s wait", () => {
    const { w, f, p, c } = e213({ p04: { B: 2.0005, N: 0.20005 } });
    const pBirth = c.birthId[p]!;
    step(w);
    step(w);
    const deaths = of(w, 'death');
    expect(deaths).toHaveLength(1);
    expect(deaths[0]).toMatchObject({ tick: 1, birthId: pBirth, cause: R.DEATH_TRAP_DRAIN });
    expect(of(w, 'trapRelease')).toHaveLength(1);
    expect(of(w, 'trapRelease')[0]).toMatchObject({ tick: 1, birthId: c.birthId[f], detail: { target: pBirth, why: 'targetDied' } });
    expect(c.trapSlot[f]).toBe(-1);
    expect(c.trapCooldown[f]).toBe(TRAP_COOLDOWN_SECONDS);
    expect(checkLedger(w).ok).toBe(true);
    expectTrapInvariants(w);
  });

  it("the owner's death (age) releases the P04 alive in place and puts the reserve into detritus in its cell", () => {
    const { w, f, p, c } = e213({ f03: { age: 1399.55 } });
    let det0 = 0;
    let detN0 = 0;
    let parts = { B: 0, meal: 0, N: 0, mealN: 0, rc: 0, rn: 0 };
    const hook: StepHooks = {
      afterStage: (s, ww) => {
        if (s !== 6 || c.alive[f] !== 1) return;
        det0 = ww.fields.detritus![CENTER]!;
        detN0 = ww.fields.detritusN![CENTER]!;
        parts = { B: c.B[f]!, meal: c.mealC[f]!, N: c.N[f]!, mealN: c.mealN[f]!, rc: c.trapReserveC[f]!, rn: c.trapReserveN[f]! };
      },
    };
    const pBirth = c.birthId[p]!;
    const fBirth = c.birthId[f]!;
    step(w, hook);
    step(w, hook);
    expect(c.heldBySlot[p]).toBe(f);
    let deathTick = -1;
    for (let k = 0; k < 10 && deathTick < 0; k++) {
      const x = c.x[p]!;
      step(w, hook);
      if (c.alive[f] !== 1 || c.birthId[f] !== fBirth) {
        deathTick = w.tick - 1;
        expect(c.x[p]).toBe(x); // released in place
      }
    }
    expect(of(w, 'death').filter((e) => e.birthId === fBirth)[0]).toMatchObject({ tick: deathTick, cause: R.DEATH_AGE });
    expect(c.alive[p]).toBe(1);
    expect(c.birthId[p]).toBe(pBirth);
    expect(c.heldBySlot[p]).toBe(-1);
    expect(c.heldByBirthId[p]).toBe(0);
    expect(of(w, 'trapRelease')[0]).toMatchObject({ tick: deathTick, birthId: fBirth, detail: { target: pBirth, why: 'ownerDied' } });
    expect(parts.rc).toBe(0.2);
    expect(Object.is(w.fields.detritus![CENTER], det0 + (parts.B + parts.meal) + parts.rc)).toBe(true);
    expect(Object.is(w.fields.detritusN![CENTER], detN0 + (parts.N + parts.mealN) + parts.rn)).toBe(true);
    expect(checkLedger(w).ok).toBe(true);
  });

  it("F03 divides while holding (T2): the retained daughter keeps reserve, timer and target; the new daughter has no trap", () => {
    const { w, f, p, c } = e213();
    step(w);
    step(w);
    expect(c.trapSlot[f]).toBe(p);
    const parentBirth = c.birthId[f]!;
    c.B[f] = 4.5;
    c.N[f] = 0.45;
    c.E[f] = 95;
    c.age[f] = 50;
    c.H[f] = 100;
    rebaseLedger(w);
    let born = -1;
    for (let k = 0; k < 20 && born < 0; k++) {
      step(w);
      const b = of(w, 'birth').find((e) => w.species[e.species!]!.id === 'F03');
      if (b) born = 1;
    }
    expect(born).toBe(1);
    const f03s: number[] = [];
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && w.species[c.species[i]!]!.id === 'F03') f03s.push(i);
    expect(f03s).toHaveLength(2);
    expect(c.birthId[f]).not.toBe(parentBirth);
    expect(c.trapSlot[f]).toBe(p);
    expect(c.trapBirthId[f]).toBe(c.birthId[p]);
    expect(c.heldByBirthId[p]).toBe(c.birthId[f]);
    expect(c.trapReserveC[f]).toBe(0.2);
    expect(c.trapTimer[f]).toBeGreaterThan(0);
    const d = f03s.find((i) => i !== f)!;
    for (const col of ['trapReserveC', 'trapReserveN', 'trapTimer', 'trapCooldown', 'trapBirthId', 'heldByBirthId'] as const) expect(c[col][d]).toBe(0);
    expect(c.trapSlot[d]).toBe(-1);
    expect(c.heldBySlot[d]).toBe(-1);
    expect(trapApplies(profileOf(w, d), w, d)).toBe(true); // she must arm her own
    expectTrapInvariants(w);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('a held P04 never divides (T1: DIV_BLOCK_STATE), and divides once released', () => {
    const { w, f, p, c } = e213();
    step(w);
    step(w);
    expect(c.trapSlot[f]).toBe(p);
    c.B[p] = 17;
    c.N[p] = 1.7;
    c.E[p] = 100;
    c.age[p] = 80;
    c.H[p] = 100;
    rebaseLedger(w);
    expect(divisionBlocker(w, p)).toBe(R.DIV_BLOCK_STATE);
    const p04Births = () => of(w, 'birth').filter((e) => w.species[e.species!]!.id === 'P04').length;
    for (let k = 0; k < 78; k++) {
      c.E[p] = 100;
      step(w);
      expect(p04Births()).toBe(0);
    }
    expect(c.heldBySlot[p]).toBe(f);
    c.E[p] = 100;
    step(w); // A + 80: released in stage 8, so stage 9 of this tick may already divide it
    let births = p04Births();
    for (let k = 0; k < 3 && births === 0; k++) {
      c.E[p] = 100;
      step(w);
      births = p04Births();
    }
    expect(c.heldBySlot[p]).toBe(-1);
    expect(births).toBe(1);
  });

  it('consumePrey of a held P04 or of a holding F03 (test-only prey list) releases the pair as removed', () => {
    // A held P04 taken: its trap starts the wait.
    {
      const { w, f, p, c } = e213();
      step(w);
      step(w);
      const pred = place(w, 'P01', 70.5, 64.5, { E: 50 });
      rebaseLedger(w);
      const pBirth = c.birthId[p]!;
      consumePrey(w, pred, p);
      expect(of(w, 'trapRelease')[0]).toMatchObject({ birthId: c.birthId[f], detail: { target: pBirth, why: 'removed' } });
      expect(c.trapSlot[f]).toBe(-1);
      expect(c.trapBirthId[f]).toBe(0);
      expect(c.trapCooldown[f]).toBe(TRAP_COOLDOWN_SECONDS);
      expect(checkLedger(w).ok).toBe(true);
    }
    // A holding F03 taken: the P04 goes free, the reserve to detritus.
    {
      const { w, f, p, c } = e213();
      step(w);
      step(w);
      const pred = place(w, 'P01', 70.5, 64.5, { E: 50 });
      rebaseLedger(w);
      const fBirth = c.birthId[f]!;
      consumePrey(w, pred, f);
      expect(of(w, 'trapRelease')[0]).toMatchObject({ birthId: fBirth, detail: { target: c.birthId[p], why: 'removed' } });
      expect(c.heldBySlot[p]).toBe(-1);
      expect(c.heldByBirthId[p]).toBe(0);
      expect(c.alive[p]).toBe(1);
      expect(computeTotals(w).breakdown.trapC).toBe(0);
      expect(checkLedger(w).ok).toBe(true);
    }
  });
});

describe('conservation and neutrality', () => {
  it('closed lid, no input: 6 F03, 10 P04, broth and B01 prey over 10,000 ticks: C and N reconcile with the reserve counted', { timeout: 900_000 }, () => {
    const w = clearWater({ lid: 'closed', seed: 913 }, REG_T);
    sedimentDisc(w, 64, 64, 12);
    for (let y = 56; y <= 72; y++) for (let x = 56; x <= 72; x++) w.fields.broth![cellIndex(x, y)] = 0.3;
    const owners = [
      [60.5, 60.5],
      [64.5, 60.5],
      [68.5, 60.5],
      [60.5, 67.5],
      [64.5, 67.5],
      [68.5, 67.5],
    ] as const;
    for (const [x, y] of owners) place(w, 'F03', x, y, { B: 2.8, N: 0.28, E: 80 });
    for (let k = 0; k < 10; k++) place(w, 'P04', 59.5 + k, 63.5 + (k % 3), { E: 60 });
    for (let k = 0; k < 40; k++) place(w, 'B01', 56.5 + (k % 16), 58.5 + Math.floor(k / 16) * 6);
    rebaseLedger(w);
    let worstC = 0;
    let worstN = 0;
    const worstAbs = { c: 0, n: 0 };
    let sawReserve = 0;
    for (let chunk = 0; chunk < 20; chunk++) {
      run(w, 500);
      const check = checkLedger(w);
      worstC = Math.max(worstC, check.relErr.c);
      worstN = Math.max(worstN, check.relErr.n);
      worstAbs.c = Math.max(worstAbs.c, Math.abs(check.actual.c - check.expected.c));
      worstAbs.n = Math.max(worstAbs.n, Math.abs(check.actual.n - check.expected.n));
      expect(check.ok, `tick ${w.tick}: ${JSON.stringify(check)}`).toBe(true);
      sawReserve = Math.max(sawReserve, computeTotals(w).breakdown.trapC!);
      expectTrapInvariants(w);
      if (process.env.TRAPS_TRACE) console.info(`chunk ${chunk} alive ${w.ents.count} t=${performance.now().toFixed(0)}`);
    }
    expect(w.tick).toBe(10000);
    expect(w.ledger.inputs).toEqual({ c: 0, n: 0, m: 0 });
    expect(worstC).toBeLessThan(1e-5);
    expect(worstN).toBeLessThan(1e-5);
    expect(worstAbs.c).toBeLessThan(1e-8);
    expect(worstAbs.n).toBeLessThan(1e-8);
    // The traps were built, caught and let go during the run.
    expect(w.events.totals.trapArmed ?? 0).toBeGreaterThanOrEqual(6);
    expect(w.events.totals.trapHold ?? 0).toBeGreaterThan(0);
    expect(w.events.totals.trapRelease ?? 0).toBeGreaterThan(0);
    expect(sawReserve).toBeGreaterThan(0);
    console.info(
      `traps conservation: worst rel C ${worstC.toExponential(3)}, N ${worstN.toExponential(3)}; abs C ${worstAbs.c.toExponential(3)}, N ${worstAbs.n.toExponential(3)}; ` +
        `armed ${w.events.totals.trapArmed ?? 0}, holds ${w.events.totals.trapHold ?? 0}, releases ${w.events.totals.trapRelease ?? 0}, alive ${w.ents.count}`,
    );
  });

  it('NEUTRAL: shipped species (P04 included) under the shipped registry and under REG_T (F03 recorded, none placed) stay byte-identical for 2,000 ticks', () => {
    const build = (reg: ReturnType<typeof registry>) => {
      const w = clearWater({ seed: 4242 }, reg);
      sedimentDisc(w, 64, 64, 10);
      for (let y = 58; y <= 70; y++) for (let x = 58; x <= 70; x++) w.fields.broth![cellIndex(x, y)] = 0.2;
      for (let k = 0; k < 4; k++) place(w, 'P04', 60.5 + 2 * k, 64.5, { E: 60 });
      for (let k = 0; k < 30; k++) place(w, 'B01', 58.5 + (k % 10), 60.5 + Math.floor(k / 10) * 3);
      for (let k = 0; k < 3; k++) place(w, 'P01', 40.5 + 4 * k, 40.5);
      for (let k = 0; k < 6; k++) place(w, 'A01', 80.5 + k, 80.5);
      rebaseLedger(w);
      return w;
    };
    // Both sides from the pre-organism-flip lists (D-0127): the shipped manifest records the subject itself since the flip.
    const a = build(preOrganismFlipRegistry());
    const b = build(preOrganismFlipRegistry({ species: ['F03'] }));
    expect(b.species.some((s) => s.id === 'F03')).toBe(true);
    for (let chunk = 0; chunk < 4; chunk++) {
      run(a, 500);
      run(b, 500);
      expect(b.ents.highWater).toBe(a.ents.highWater);
      const ca = a.ents.cols;
      const cb = b.ents.cols;
      for (const [name] of ENTITY_COLUMNS) {
        const xa = ca[name] as ArrayLike<number>;
        const xb = cb[name] as ArrayLike<number>;
        for (let i = 0; i < a.ents.highWater; i++) {
          if (name === 'species') {
            if (ca.alive[i] === 1) expect(b.species[xb[i]!]!.id).toBe(a.species[xa[i]!]!.id);
            continue;
          }
          if (!Object.is(xa[i], xb[i])) throw new Error(`tick ${a.tick}: column ${name} slot ${i}: ${xa[i]} vs ${xb[i]}`);
        }
      }
      for (const id of FIELD_IDS) {
        const fa = a.fields[id];
        const fb = b.fields[id];
        expect(fb === undefined).toBe(fa === undefined);
        if (!fa || !fb) continue;
        for (let k = 0; k < fa.length; k++) if (!Object.is(fa[k], fb[k])) throw new Error(`tick ${a.tick}: field ${id} cell ${k}`);
      }
      const ta = computeTotals(a);
      const tb = computeTotals(b);
      expect(Object.is(ta.c, tb.c) && Object.is(ta.n, tb.n)).toBe(true);
    }
    expect(a.events.totals.capture ?? 0).toBeGreaterThan(0);
  });

  /** HEAD's computeTotals (before the trap reserve term), for the bit-identity check. */
  function headTotals(world: World): { c: number; n: number } {
    const cells = maskCells();
    let c = 0;
    let n = 0;
    for (const id of FIELD_IDS) {
      const arr = world.fields[id];
      if (!arr) continue;
      const def = FIELD_DEFS[id];
      if (def.material === 'none') continue;
      let s = 0;
      for (let k = 0; k < cells.length; k++) s += arr[cells[k]!]!;
      const amount = s * (def.carbonPerUnit ?? 1);
      if (def.material === 'carbon') c += amount;
      else if (def.material === 'nutrient') n += amount;
    }
    const cols = world.ents.cols;
    let bodyC = 0;
    let bodyN = 0;
    let mealC = 0;
    let mealN = 0;
    for (let i = 0; i < world.ents.highWater; i++) {
      if (cols.alive[i] !== 1) continue;
      bodyC += cols.B[i]!;
      bodyN += cols.N[i]!;
      mealC += cols.mealC[i]!;
      mealN += cols.mealN[i]!;
    }
    c += bodyC + mealC;
    n += bodyN + mealN;
    const obj = objectTotals(world.objects);
    const smp = headSampleTotals(world);
    c += obj.c + smp.c;
    n += obj.n + smp.n;
    return { c, n };
  }

  /** HEAD's sampleTotals (rows B + mealC, N + mealN), via the current one on a copy without the reserve term. */
  function headSampleTotals(world: World): { c: number; n: number } {
    const s = world.sample;
    if (s === null) return { c: 0, n: 0 };
    for (const r of s.rows) {
      expect(r.cols.trapReserveC).toBe(0);
      expect(r.cols.trapReserveN).toBe(0);
    }
    return sampleTotals(s);
  }

  it("computeTotals' c and n are Object.is-equal to HEAD's on every rc1 save", async () => {
    for (const file of RC1_SAVE_FILES) {
      const { world } = await loadSaveFile(readRc1SaveText(file));
      const now = computeTotals(world);
      const head = headTotals(world);
      expect(Object.is(now.c, head.c), file).toBe(true);
      expect(Object.is(now.n, head.n), file).toBe(true);
      expect(now.breakdown.trapC).toBe(0);
    }
  });
});
