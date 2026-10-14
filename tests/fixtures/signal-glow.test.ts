/**
 * Phase 5 wave 11, e2-signals: S_GLOW emission and glow (SPEC §7.8, §9 E02, §3.2 stage 8, §3.3, §4.4, §12.3;
 * CT §12.6; D-0106, D-0108, D-0119; src/sim/signals.ts).
 *
 * - Emission (native SIGNAL_GLOW action 5, E02 module action 2): 0.02 × DT S_GLOW into the emitter's cell and
 *   0.20 × DT E under 'signal' per tick while E remaining > 35 and local S_GLOW < 1.0; an existing excess is
 *   kept (no clamp).
 * - Hysteresis from the stage-start sensed value S_GLOW / (1 + quencher): on after ≥ 0.30 for 50 consecutive
 *   ticks, off after ≤ 0.15 for 50, or at once when E < 15; never on below 15 E (the dwell keeps its count);
 *   0.30 × DT E per tick under 'signal' while glowing; no light.
 * - Off in every non-Active state (the dormancy entry clears it in the same tick), never inherited (both
 *   daughters dim), a reused slot starts dim, and no result depends on slot order.
 * The signal is held at a value by a stage hook that writes it right before stage 8 (sGlow is an activity
 * field with no material, so the ledger is untouched).
 *
 * Registry: the shipped manifest plus B09, B10, B11, B13, E02, M06–M08 and the 'signals' and 'rivalry' systems,
 * with allowUnimplemented: SIGNAL_GLOW, RIVALRY and E02 are implemented here and listed as implemented by the
 * lead at integration (D-0119).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DT, GLOW_COST, SIGNAL_EMIT_COST, SIGNAL_EMIT_RATE } from '../../src/sim/constants';
import type { SystemFlag } from '../../src/sim/fields';
import { LIFE_ACTIVE, LIFE_PREPARING, LIFE_RESTING, LIFE_WAKING } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { cellIndex, SUB_GEL } from '../../src/sim/grid';
import { killEntity } from '../../src/sim/maintenance';
import { moduleSummaries } from '../../src/sim/moduleView';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { sensedSignal } from '../../src/sim/signals';
import { entityCell } from '../../src/sim/spatial';
import { stageStructures } from '../../src/sim/structures';
import { step, type StepHooks } from '../../src/sim/tick';
import { markField } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, paintRect, place, placeWith, registry, setField } from '../helpers/world';

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

const dish = (): World => clearWater({}, REG);
const cellOf = (w: World, s: number): number => entityCell(w.ents.cols.x[s]!, w.ents.cols.y[s]!);

interface Hold {
  /** S_GLOW written into each held organism's cell right before stage 8 (null: leave the field alone). */
  signal?: number | null;
  quencher?: number;
  /** Energy written right before stage 8 (test-only state; energy is not a conserved material). */
  E?: number;
}

/** One tick with the stage-start state of `slots` held (written after stage 7, i.e. right before stage 8). */
function stepHeld(w: World, slots: readonly number[], hold: Hold): void {
  const hooks: StepHooks = {
    afterStage: (st, world) => {
      if (st !== 7) return;
      const c = world.ents.cols;
      for (const s of slots) {
        if (c.alive[s] !== 1) continue;
        const cell = cellOf(world, s);
        if (hold.signal !== undefined && hold.signal !== null) {
          world.fields.sGlow![cell] = hold.signal;
          markField(world, 'sGlow');
        }
        if (hold.quencher !== undefined) {
          world.fields.quencher![cell] = hold.quencher;
          markField(world, 'quencher');
        }
        if (hold.E !== undefined) c.E[s] = hold.E;
      }
    },
  };
  step(w, hooks);
}

const glowEvents = (w: World, type: 'glowOn' | 'glowOff'): SimEvent[] => w.events.ring.filter((e) => e.type === type);

/** Ticks (1-based) until slot `s` changes glow state under `hold`, or -1 within `max`. */
function ticksUntilSwitch(w: World, s: number, hold: Hold, max: number): number {
  const c = w.ents.cols;
  const start = c.glowState[s];
  for (let t = 1; t <= max; t++) {
    stepHeld(w, [s], hold);
    if (c.glowState[s] !== start) return t;
  }
  return -1;
}

describe('S_GLOW emission (SPEC §7.8; CT §12.6)', () => {
  it('a B09 with E 50 emits exactly 0.02 × DT into its cell per tick, paying 0.20 × DT under signal', () => {
    const w = dish();
    const s = place(w, 'B09', 64.5, 64.5, { E: 50 });
    const c = w.ents.cols;
    const cell = cellOf(w, s);
    expect(profileOf(w, s).glow?.source).toBe('native');
    const sig0 = w.ledger.energy.signal;
    const sec0 = w.ledger.energy.secretion;
    stageStructures(w);
    expect(w.fields.sGlow![cell]).toBe(SIGNAL_EMIT_RATE * DT);
    expect(w.ledger.energy.signal - sig0).toBe(SIGNAL_EMIT_COST * DT);
    expect(w.ledger.energy.secretion).toBe(sec0); // signal emission is not ordinary secretion (D-0106)
    expect(c.E[s]).toBe(50 - SIGNAL_EMIT_COST * DT);
    expect(c.secretionCode[s]).toBe(R.SECRETING);
    expect(c.secreting[s]).toBe(16); // EMITTER_BIT.signal
    // Over full ticks: every tick adds exactly 0.02 × DT to the ledger while E stays above 35.
    for (let t = 0; t < 20; t++) {
      const before = w.ledger.energy.signal;
      step(w);
      expect(w.ledger.energy.signal).toBe(before + SIGNAL_EMIT_COST * DT);
    }
  });

  it('no emission at E ≤ 35; none at local S_GLOW ≥ 1.0, and an existing 1.3 is kept', () => {
    const w = dish();
    const a = place(w, 'B09', 40.5, 64.5, { E: 35 });
    const b = place(w, 'B09', 64.5, 64.5, { E: 80 });
    const d = place(w, 'B09', 90.5, 64.5, { E: 80 });
    const c = w.ents.cols;
    setField(w, 'sGlow', cellOf(w, b), 1.0);
    setField(w, 'sGlow', cellOf(w, d), 1.3);
    stageStructures(w);
    expect(w.fields.sGlow![cellOf(w, a)]).toBe(0);
    expect(c.secretionCode[a]).toBe(R.SECRETION_ENERGY_LOW);
    expect(c.E[a]).toBe(35);
    expect(w.fields.sGlow![cellOf(w, b)]).toBe(1.0);
    expect(c.secretionCode[b]).toBe(R.SECRETION_SATURATED);
    expect(w.fields.sGlow![cellOf(w, d)]).toBe(1.3);
    expect(c.secretionCode[d]).toBe(R.SECRETION_SATURATED);
    expect(w.ledger.energy.signal).toBe(0);
    expect(c.secreting[a]! | c.secreting[b]! | c.secreting[d]!).toBe(0);
  });
});

describe('glow hysteresis (stage-start sensed value)', () => {
  it('held at 0.31 glow turns on at exactly the 50th consecutive tick, not the 49th', () => {
    const w = dish();
    const s = place(w, 'B09', 64.5, 64.5, { E: 80 });
    const c = w.ents.cols;
    for (let t = 1; t <= 49; t++) stepHeld(w, [s], { signal: 0.31 });
    expect(c.glowState[s]).toBe(0);
    expect(c.glowDwell[s]).toBeCloseTo(4.9, 9);
    stepHeld(w, [s], { signal: 0.31 });
    expect(c.glowState[s]).toBe(1);
    expect(c.glowDwell[s]).toBe(0);
    const on = glowEvents(w, 'glowOn');
    expect(on).toHaveLength(1);
    expect(on[0]).toMatchObject({ tick: 49, type: 'glowOn', cause: R.GLOW_ON, birthId: c.birthId[s], species: c.species[s], cell: cellOf(w, s), detail: { sensed: 0.31 } });
  });

  it('both thresholds are inclusive: held at exactly 0.30 it turns on at the 50th tick, at exactly 0.15 it turns off at the 50th', () => {
    const w = dish();
    const s = place(w, 'B09', 64.5, 64.5, { E: 80 });
    expect(ticksUntilSwitch(w, s, { signal: 0.3 }, 60)).toBe(50);
    expect(glowEvents(w, 'glowOn').at(-1)).toMatchObject({ detail: { sensed: 0.3 } });
    expect(ticksUntilSwitch(w, s, { signal: 0.15, E: 30 }, 60)).toBe(50);
    expect(glowEvents(w, 'glowOff').at(-1)).toMatchObject({ detail: { sensed: 0.15, why: 'signal' } });
  });

  it('alternating 0.31 / 0.29 never turns it on (a dip restarts the dwell: no flicker)', () => {
    const w = dish();
    const s = place(w, 'B09', 64.5, 64.5, { E: 80 });
    const c = w.ents.cols;
    for (let t = 0; t < 200; t++) {
      stepHeld(w, [s], { signal: t % 2 === 0 ? 0.31 : 0.29 });
      expect(c.glowState[s]).toBe(0);
      expect(c.glowDwell[s]).toBeLessThanOrEqual(DT + 1e-12);
    }
    expect(glowEvents(w, 'glowOn')).toHaveLength(0);
  });

  it('held at 0.14 a glowing B09 turns off at the 50th tick (why signal); glow costs 0.30 × DT per tick under signal', () => {
    const w = dish();
    const s = place(w, 'B09', 64.5, 64.5, { E: 80 });
    const c = w.ents.cols;
    expect(ticksUntilSwitch(w, s, { signal: 0.31 }, 60)).toBe(50);
    // While glowing at E 30 (no emission below 35), each tick charges exactly the glow cost.
    for (let t = 0; t < 5; t++) {
      const before = w.ledger.energy.signal;
      stepHeld(w, [s], { signal: 0.31, E: 30 });
      expect(c.glowState[s]).toBe(1);
      expect(w.ledger.energy.signal).toBe(before + GLOW_COST * DT);
    }
    expect(ticksUntilSwitch(w, s, { signal: 0.14, E: 30 }, 60)).toBe(50);
    const off = glowEvents(w, 'glowOff');
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ type: 'glowOff', cause: R.GLOW_OFF, detail: { sensed: 0.14, why: 'signal' } });
    expect(c.glowDwell[s]).toBe(0);
    // Dim: no glow cost (and no emission below 35 E).
    const before = w.ledger.energy.signal;
    stepHeld(w, [s], { signal: 0.14, E: 30 });
    expect(w.ledger.energy.signal).toBe(before);
  });

  it('E below 15 turns a glowing B09 off at once (why energy); below 15 it never turns on, and once E recovers it does with the dwell already counted', () => {
    const w = dish();
    const s = place(w, 'B09', 64.5, 64.5, { E: 80 });
    const c = w.ents.cols;
    expect(ticksUntilSwitch(w, s, { signal: 0.31 }, 60)).toBe(50);
    stepHeld(w, [s], { signal: 0.31, E: 14.9 });
    expect(c.glowState[s]).toBe(0);
    expect(glowEvents(w, 'glowOff').at(-1)).toMatchObject({ detail: { sensed: 0.31, why: 'energy' } });
    for (let t = 0; t < 80; t++) {
      stepHeld(w, [s], { signal: 0.31, E: 14 });
      expect(c.glowState[s]).toBe(0);
    }
    expect(c.glowDwell[s]).toBe(5); // counted to the dwell and held there
    stepHeld(w, [s], { signal: 0.31, E: 40 });
    expect(c.glowState[s]).toBe(1);
    expect(glowEvents(w, 'glowOn')).toHaveLength(2);
  });

  it('quencher: S_GLOW 0.5 with quencher 1.0 senses 0.25 (never on); with quencher 0.5 senses 1/3 (on at 50)', () => {
    const w = dish();
    const a = place(w, 'B09', 40.5, 64.5, { E: 80 });
    const b = place(w, 'B09', 90.5, 64.5, { E: 80 });
    setField(w, 'sGlow', cellOf(w, a), 0.5);
    setField(w, 'quencher', cellOf(w, a), 1.0);
    expect(sensedSignal(w, cellOf(w, a))).toBe(0.25);
    setField(w, 'sGlow', cellOf(w, b), 0.5);
    setField(w, 'quencher', cellOf(w, b), 0.5);
    expect(sensedSignal(w, cellOf(w, b))).toBe(0.5 / 1.5);
    expect(ticksUntilSwitch(w, a, { signal: 0.5, quencher: 1.0 }, 100)).toBe(-1);
    expect(ticksUntilSwitch(w, b, { signal: 0.5, quencher: 0.5 }, 100)).toBe(50);
    expect(glowEvents(w, 'glowOn')[0]!.detail).toEqual({ sensed: 0.5 / 1.5 });
  });

  it('glow adds no light: derived.light is byte-equal with glow on and off', () => {
    const lit = dish();
    const dim = dish();
    const s1 = place(lit, 'B09', 64.5, 64.5, { E: 80 });
    const s2 = place(dim, 'B09', 64.5, 64.5, { E: 80 });
    const light0 = Buffer.from(lit.derived.light.buffer.slice(0)).toString('base64');
    for (let t = 0; t < 70; t++) {
      stepHeld(lit, [s1], { signal: 0.31 });
      stepHeld(dim, [s2], { signal: 0.29 });
    }
    expect(lit.ents.cols.glowState[s1]).toBe(1);
    expect(dim.ents.cols.glowState[s2]).toBe(0);
    const bytes = (w: World) => Buffer.from(w.derived.light.buffer.slice(0)).toString('base64');
    expect(bytes(lit)).toBe(bytes(dim));
    expect(bytes(lit)).toBe(light0);
  });
});

describe('E02 carriers', () => {
  it('a B01 with E02 has the module’s numbers, pays the 0.02 surcharge, emits and glows like a Lantern', () => {
    const w = dish();
    const plain = place(w, 'B01', 40.5, 64.5, { E: 80 });
    const s = placeWith(w, 'B01', 64.5, 64.5, ['E02'], { E: 80 });
    const glow = profileOf(w, s).glow!;
    const mod = w.modules.E02!;
    expect(glow).toEqual({ source: 'E02', ...mod.params });
    expect(profileOf(w, plain).glow).toBeNull();
    expect(profileOf(w, s).surcharge - profileOf(w, plain).surcharge).toBeCloseTo(0.02, 15);
    expect(profileOf(w, s).m - profileOf(w, plain).m).toBeCloseTo(0.02, 15);
    const c = w.ents.cols;
    stageStructures(w);
    expect(w.fields.sGlow![cellOf(w, s)]).toBe(mod.params.emitRate! * DT);
    expect(w.ledger.energy.signal).toBe(mod.params.emitCost! * DT);
    expect(c.secreting[s]).toBe(16);
    expect(ticksUntilSwitch(w, s, { signal: 0.31 }, 60)).toBe(50);
    expect(glowEvents(w, 'glowOn')[0]!.birthId).toBe(c.birthId[s]);
  });

  it("the E02 module card reads 'active now' while it emits or glows, and not while it does neither (D-0120)", () => {
    const w = dish();
    const s = placeWith(w, 'B01', 64.5, 64.5, ['E02'], { E: 90 });
    const card = () => moduleSummaries(w, s).find((m) => m.id === 'E02')!;
    stepHeld(w, [s], { signal: 0.31, E: 90 }); // emits (E above 35), not yet glowing
    expect(w.ents.cols.glowState[s]).toBe(0);
    expect(card().activeNow).toBe(true);
    stepHeld(w, [s], { signal: 0.31, E: 30 }); // no emission at or below 35 E, still dim
    expect(card().activeNow).toBe(false);
    expect(ticksUntilSwitch(w, s, { signal: 0.31, E: 30 }, 60)).toBe(48); // the two held ticks above already counted
    expect(card().activeNow).toBe(true); // glowing without emitting
  });

  it('a B09 never carries E02 (E02 lists B09 as its native equivalent and not as eligible)', () => {
    const w = dish();
    const e02 = REG.modules.E02!;
    expect(e02.eligibleAncestors).not.toContain('B09');
    expect(e02.nativeEquivalents).toEqual(['B09']);
    expect(() => placeWith(w, 'B09', 64.5, 64.5, ['E02'])).toThrow();
  });

  it('a resting F04 newborn can never glow: F04 has no SIGNAL_GLOW and E02 cannot be carried by it (no code needed)', () => {
    const f04 = JSON.parse(readFileSync(join(__dirname, '../../content/species/F04.json'), 'utf8')) as { nativeAbilities: string[] };
    expect(f04.nativeAbilities).toContain('RESTING_DAUGHTER');
    expect(f04.nativeAbilities).not.toContain('SIGNAL_GLOW');
    expect(REG.modules.E02!.eligibleAncestors).not.toContain('F04');
  });

  it('an E02+E03 B01 glowing when its food runs out is dim in the very tick it enters Preparing (glowOff, why rest), stays dim through Preparing, Resting and Waking, and needs a fresh 5 s after waking', () => {
    const w = dish();
    const s = placeWith(w, 'B01', 64.5, 64.5, ['E02', 'E03'], { E: 90 });
    const c = w.ents.cols;
    let prev = c.lifeState[s]!;
    let preparingTick = -1;
    let activeTick = -1;
    let onAfterWake = -1;
    for (let t = 1; t <= 1500 && onAfterWake < 0; t++) {
      // Food arrives once it rests: sugar in and around its cell (so it can wake).
      if (c.lifeState[s] === LIFE_RESTING && w.fields.sugar![cellOf(w, s)]! === 0) {
        const cx = Math.floor(c.x[s]!);
        const cy = Math.floor(c.y[s]!);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setField(w, 'sugar', cellIndex(cx + dx, cy + dy), 2);
      }
      stepHeld(w, [s], { signal: 0.31 });
      const now = c.lifeState[s]!;
      if (now !== LIFE_ACTIVE) {
        expect(c.glowState[s]).toBe(0);
        expect(c.glowDwell[s]).toBe(0);
        expect(sensedSignal(w, cellOf(w, s))).toBeGreaterThanOrEqual(0.3);
      }
      if (now === LIFE_PREPARING && prev === LIFE_ACTIVE) {
        preparingTick = t;
        const off = glowEvents(w, 'glowOff');
        expect(off).toHaveLength(1);
        expect(off[0]).toMatchObject({ tick: w.tick - 1, detail: { why: 'rest' } });
      }
      if (now === LIFE_ACTIVE && prev === LIFE_WAKING) activeTick = t;
      if (activeTick > 0 && c.glowState[s] === 1) onAfterWake = t;
      expect([LIFE_ACTIVE, LIFE_PREPARING, LIFE_RESTING, LIFE_WAKING]).toContain(now);
      if (now === LIFE_WAKING) expect(prev === LIFE_RESTING || prev === LIFE_WAKING).toBe(true);
      prev = now;
      if (preparingTick < 0 && t === 60) expect(c.glowState[s]).toBe(1); // it glowed before its food ran out
    }
    expect(preparingTick).toBeGreaterThan(50);
    expect(activeTick).toBeGreaterThan(preparingTick);
    // The waking tick counts as the first of a fresh 50-tick dwell.
    expect(onAfterWake - activeTick + 1).toBe(50);
    expect(glowEvents(w, 'glowOn')).toHaveLength(2);
  });
});

describe("the 'rest' glowOff reading (D-0120)", () => {
  it('records the stage-start sensed value whatever the slot order (a co-located emitter in a lower slot changes nothing)', () => {
    const go = (emitterFirst: boolean): unknown[] => {
      const w = dish();
      let e = -1;
      if (emitterFirst) e = place(w, 'B09', 64.5, 64.5, { E: 90 });
      const s = placeWith(w, 'B01', 64.5, 64.5, ['E02', 'E03'], { E: 90 });
      if (!emitterFirst) e = place(w, 'B09', 64.5, 64.5, { E: 90 });
      const c = w.ents.cols;
      // Test-only state, right before stage 8: the emitter kept in the carrier's cell with energy to emit, and
      // the signal held at 0.31 there.
      const hold: StepHooks = {
        afterStage: (st, world) => {
          if (st !== 7) return;
          c.x[e] = c.x[s]!;
          c.y[e] = c.y[s]!;
          c.E[e] = 90;
          world.fields.sGlow![cellOf(world, s)] = 0.31;
          markField(world, 'sGlow');
        },
      };
      for (let t = 0; t < 3000 && c.lifeState[s] === LIFE_ACTIVE; t++) step(w, hold);
      expect(c.lifeState[s]).toBe(LIFE_PREPARING);
      const off = glowEvents(w, 'glowOff').filter((x) => x.birthId === c.birthId[s]);
      expect(off).toHaveLength(1);
      expect(off[0]).toMatchObject({ detail: { sensed: 0.31, why: 'rest' } });
      return off.map((x) => [x.tick, x.detail]);
    };
    expect(go(true)).toEqual(go(false));
  });
});

describe('glow is never inherited; slots and slot order', () => {
  it('a glowing B01 (E02) that divides leaves both daughters dim with dwell 0 and one glowOff (why division)', () => {
    const w = dish();
    const s = placeWith(w, 'B01', 64.5, 64.5, ['E02'], { E: 90 });
    const c = w.ents.cols;
    expect(ticksUntilSwitch(w, s, { signal: 0.31, E: 90 }, 60)).toBe(50);
    const parentBirth = c.birthId[s]!;
    // Division-ready (test-only state, logged as an input by the helper's rules): biomass 2.5, age 100 s.
    w.ledger.inputs.c += 2.5 - c.B[s]!;
    c.B[s] = 2.5;
    c.age[s] = 100;
    const alive0 = w.ents.count;
    stepHeld(w, [s], { signal: 0.31, E: 90 });
    const birth = w.events.ring.filter((e) => e.type === 'birth' && e.tick === w.tick - 1);
    expect(birth).toHaveLength(1);
    expect(birth[0]!.detail).toMatchObject({ parent: parentBirth });
    expect(w.ents.count).toBe(alive0 + 1);
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      expect(c.glowState[i]).toBe(0);
      expect(c.glowDwell[i]).toBe(0);
    }
    const off = glowEvents(w, 'glowOff');
    expect(off).toHaveLength(1);
    expect(off[0]).toMatchObject({ birthId: parentBirth, detail: { why: 'division' } });
  });

  it('a reused slot starts dim (a new organism and a daughter placed into a dead glower’s slot)', () => {
    const w = dish();
    const a = place(w, 'B09', 40.5, 64.5, { E: 80 });
    const b = place(w, 'B09', 64.5, 64.5, { E: 80 });
    const c = w.ents.cols;
    for (let t = 0; t < 50; t++) stepHeld(w, [a, b], { signal: 0.31 });
    expect(c.glowState[a]).toBe(1);
    expect(c.glowState[b]).toBe(1);
    killEntity(w, a, R.DEATH_AGE);
    const n = place(w, 'B09', 30.5, 64.5, { E: 80 });
    expect(n).toBe(a);
    expect(c.glowState[n]).toBe(0);
    expect(c.glowDwell[n]).toBe(0);
    // A daughter born into a freed glower's slot starts dim too.
    for (let t = 0; t < 50; t++) stepHeld(w, [n, b], { signal: 0.31 });
    expect(c.glowState[n]).toBe(1);
    killEntity(w, n, R.DEATH_AGE);
    w.ledger.inputs.c += 2.5 - c.B[b]!;
    c.B[b] = 2.5;
    c.age[b] = 100;
    stepHeld(w, [b], { signal: 0.31, E: 90 });
    expect(c.alive[n]).toBe(1); // the new daughter took the freed slot
    expect(c.birthId[n]).not.toBe(0);
    expect(c.glowState[n]).toBe(0);
    expect(c.glowDwell[n]).toBe(0);
  });

  it('slot order: the same glowers placed in reverse order switch on the same ticks with identical columns (stage-start sensing)', () => {
    // Non-moving E02 carriers (B02, attached on gel) so placement order changes nothing but slots and birth ids.
    const POS: readonly [number, number][] = [
      [60.5, 60.5],
      [60.5, 60.5],
      [61.5, 60.5],
      [62.5, 61.5],
      [62.5, 61.5],
      [64.5, 63.5],
    ];
    const build = (reverse: boolean, fill: number) => {
      const w = dish();
      paintRect(w, SUB_GEL, 50, 50, 75, 75);
      const order = POS.map((_, k) => k);
      if (reverse) order.reverse();
      const slotOf: number[] = [];
      for (const k of order) slotOf[k] = placeWith(w, 'B02', POS[k]![0], POS[k]![1], ['E02'], { E: 90 });
      const g = w.fields.sGlow!;
      for (let y = 50; y <= 75; y++) for (let x = 50; x <= 75; x++) g[cellIndex(x, y)] = fill;
      markField(w, 'sGlow');
      return { w, slotOf };
    };
    const record = (reverse: boolean, fill: number, ticks: number, hook?: StepHooks) => {
      const { w, slotOf } = build(reverse, fill);
      const switches: number[][] = POS.map(() => []);
      const c = w.ents.cols;
      for (let t = 1; t <= ticks; t++) {
        const before = slotOf.map((s) => c.glowState[s]!);
        step(w, hook);
        slotOf.forEach((s, k) => {
          if (c.glowState[s] !== before[k]) switches[k]!.push(t);
        });
      }
      const cols = slotOf.map((s) => [c.glowState[s], c.glowDwell[s], c.E[s], c.B[s], w.fields.sGlow![cellOf(w, s)]]);
      return { switches, cols };
    };
    // Natural emission around the thresholds.
    const A = record(false, 0.305, 400);
    const B = record(true, 0.305, 400);
    expect(A.switches.flat().length).toBeGreaterThan(0);
    expect(B.switches).toEqual(A.switches);
    A.cols.forEach((row, k) => row.forEach((v, j) => expect(Object.is(v, B.cols[k]![j]), `placement ${k} column ${j}`).toBe(true)));
    // Stage-start sensing: with the field held at 0.299 right before stage 8, a co-located emitter's +0.002
    // written earlier in the same stage never reaches a later slot's thresholds, so nothing ever glows.
    const hold: StepHooks = {
      afterStage: (st, world) => {
        if (st !== 7) return;
        const g = world.fields.sGlow!;
        for (let y = 50; y <= 75; y++) for (let x = 50; x <= 75; x++) g[cellIndex(x, y)] = 0.299;
      },
    };
    for (const rev of [false, true]) {
      const r = record(rev, 0.299, 120, hold);
      expect(r.switches.flat()).toEqual([]);
    }
  });
});
