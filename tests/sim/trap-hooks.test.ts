/**
 * Phase 5 wave 13, e3-jacket: the five hooks e3-jacket writes for e3-traps (F03 Traplace's trap; SPEC §3.2 rows 4
 * and 8, §6.9, §7.17, §9.19; D-0106). The trap pair is set by hand (F03 owner ↔ held P04) so each hook is tested on
 * its own, whatever the trap stage does:
 *   T1 births.ts divisionBlocker / allDivisionBlockers: a held organism cannot divide (DIV_BLOCK_STATE);
 *   T2 births.ts commitDivision: a holding F03 that divides keeps its trap on the retained daughter, whose new
 *      birthId the held P04 now names; the new daughter has no trap (the import accepts the result);
 *   T3 movement.ts stageSenseAndMove: a held organism does not move and its decision timer does not advance;
 *      suitability is still updated;
 *   T4 actions.ts: the shipped table lists native TRAP at id 7, between RIVALRY and the modules;
 *   T5 structures.ts stageStructures: film construction → E11 mineral pass → trap step → F02 transport.
 *
 * F03's TRAP joins IMPLEMENTED_NATIVE_ABILITIES only at the wave 13 integration (the lead), so the registry uses
 * allowUnimplemented and this file mocks the list with exactly TRAP appended for the T2 round trip. The T5 order
 * is observed by wrapping the four passes (each wrapper calls the real function, so behaviour is unchanged).
 */
import { describe, expect, it, vi } from 'vitest';
import type * as ConstructionMod from '../../src/sim/construction';
import type * as JacketMod from '../../src/sim/jacket';
import type * as TrapsMod from '../../src/sim/traps';
import type * as FungalTransportMod from '../../src/sim/fungalTransport';

const order = vi.hoisted(() => ({ log: [] as string[] }));

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_NATIVE_ABILITIES: readonly string[] }>();
  return { ...orig, IMPLEMENTED_NATIVE_ABILITIES: [...new Set([...orig.IMPLEMENTED_NATIVE_ABILITIES, 'TRAP'])].sort() };
});
vi.mock('../../src/sim/construction', async (importOriginal) => {
  const orig = await importOriginal<typeof ConstructionMod>();
  return { ...orig, constructionPass: (...a: Parameters<typeof orig.constructionPass>) => (order.log.push('film'), orig.constructionPass(...a)) };
});
vi.mock('../../src/sim/jacket', async (importOriginal) => {
  const orig = await importOriginal<typeof JacketMod>();
  return { ...orig, jacketPass: (...a: Parameters<typeof orig.jacketPass>) => (order.log.push('mineral'), orig.jacketPass(...a)) };
});
vi.mock('../../src/sim/traps', async (importOriginal) => {
  const orig = await importOriginal<typeof TrapsMod>();
  return { ...orig, trapStep: (...a: Parameters<typeof orig.trapStep>) => (order.log.push('trap'), orig.trapStep(...a)) };
});
vi.mock('../../src/sim/fungalTransport', async (importOriginal) => {
  const orig = await importOriginal<typeof FungalTransportMod>();
  return { ...orig, fungalTransport: (...a: Parameters<typeof orig.fungalTransport>) => (order.log.push('f02'), orig.fungalTransport(...a)) };
});

import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { STAGE8_ACTIONS } from '../../src/sim/actions';
import { allDivisionBlockers, divisionBlocker, stageBirths } from '../../src/sim/births';
import { emptyValueOf, FLAG } from '../../src/sim/entities';
import { cellIndex, SUB_SEDIMENT } from '../../src/sim/grid';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { stageStructures } from '../../src/sim/structures';
import { step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, paintRect, place, registry, setField } from '../helpers/world';

const shipped = registry().manifest;
const REG_T = registryWith(
  { enabledSpecies: [...shipped.enabledSpecies, 'F03'].sort() },
  { allowUnimplemented: true }, // F03's TRAP: appended to the implemented list by the lead at the wave 13 integration
);
const meta = { name: 'trap hooks', savedAt: '2026-10-15T00:00:00Z', recipeId: null };
const TRAP_COLS = ['trapReserveC', 'trapReserveN', 'trapSlot', 'trapBirthId', 'trapTimer', 'trapCooldown'] as const;

/** A sediment patch with an F03 holding a P04 in the same cell (the pair and the built trap set by hand, logged). */
function heldPair(p04State: Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>> = {}, f03State: Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>> = {}) {
  const w = clearWater({}, REG_T);
  paintRect(w, SUB_SEDIMENT, 56, 56, 72, 72);
  const f = place(w, 'F03', 64.3, 64.5, f03State);
  const p = place(w, 'P04', 64.7, 64.5, p04State);
  const c = w.ents.cols;
  c.trapReserveC[f] = 0.2;
  c.trapReserveN[f] = 0.02;
  w.ledger.inputs.c += 0.2;
  w.ledger.inputs.n += 0.02;
  c.trapTimer[f] = 2;
  c.trapSlot[f] = p;
  c.trapBirthId[f] = c.birthId[p]!;
  c.heldBySlot[p] = f;
  c.heldByBirthId[p] = c.birthId[f]!;
  return { w, f, p };
}

function release(w: World, f: number, p: number): void {
  const c = w.ents.cols;
  c.trapSlot[f] = -1;
  c.trapBirthId[f] = 0;
  c.trapTimer[f] = 0;
  c.trapCooldown[f] = 30; // cooling down, so the trap does not catch the P04 again at once
  c.heldBySlot[p] = -1;
  c.heldByBirthId[p] = 0;
}

describe('T1: a held organism cannot divide (SPEC §6.9 "not held")', () => {
  it('DIV_BLOCK_STATE in both blocker functions while every other gate passes; it divides once released', () => {
    const { w, f, p } = heldPair({ B: 16.5, E: 95, age: 100 });
    expect(divisionBlocker(w, p)).toBe(R.DIV_BLOCK_STATE);
    expect(allDivisionBlockers(w, p)).toEqual([R.DIV_BLOCK_STATE]);
    const hw = w.ents.highWater;
    for (let k = 0; k < 3; k++) stageBirths(w);
    expect(w.ents.highWater).toBe(hw);
    expect(w.ents.cols.divBlockCode[p]).toBe(R.DIV_BLOCK_STATE);
    release(w, f, p);
    expect(divisionBlocker(w, p)).toBe(R.NONE);
    expect(allDivisionBlockers(w, p)).toEqual([]);
    stageBirths(w);
    expect(w.ents.highWater).toBe(hw + 1);
    expect(w.ents.cols.species[hw]).toBe(speciesIndex(w, 'P04'));
  });
});

describe('T2: the trap stays with the retained parent (SPEC §9.19)', () => {
  it('a holding F03 divides: the P04 names the retained daughter; the new daughter has no trap; the import accepts it', async () => {
    const { w, f, p } = heldPair({ B: 8 }, { B: 4.4, E: 95, age: 100 });
    const c = w.ents.cols;
    const parentBirth = c.birthId[f]!;
    const hw = w.ents.highWater;
    step(w);
    expect(w.ents.highWater).toBe(hw + 1);
    const d = hw;
    expect(c.species[d]).toBe(speciesIndex(w, 'F03'));
    expect(c.birthId[f]).not.toBe(parentBirth);
    // The retained daughter keeps the trap (target, reserve, timer); the held P04 names her new birthId.
    expect(c.trapSlot[f]).toBe(p);
    expect(c.trapBirthId[f]).toBe(c.birthId[p]);
    expect(c.trapReserveC[f]).toBe(0.2);
    expect(c.trapTimer[f]).toBeGreaterThan(2);
    expect(c.heldBySlot[p]).toBe(f);
    expect(c.heldByBirthId[p]).toBe(c.birthId[f]);
    // The new daughter gets no free trap.
    for (const col of TRAP_COLS) expect(c[col][d]).toBe(emptyValueOf(col));
    // The import accepts the result, and 300 more ticks agree.
    const { text } = await buildSaveFile(w, meta);
    const { world: back } = await loadSaveFile(text);
    expect(stateHash(back)).toBe(stateHash(w));
    for (let t = 0; t < 300; t++) {
      step(w);
      step(back);
    }
    expect(stateHash(back)).toBe(stateHash(w));
  }, 300_000);
});

describe('T3: a held organism does not move (SPEC §3.2 row 4, §7.17)', () => {
  it('a hungry P04 with prey in range stays put for 50 ticks with its decision timer frozen, its suitability still updated; it moves after release', () => {
    const { w, f, p } = heldPair({ E: 40 });
    place(w, 'B01', 66.5, 64.5);
    const c = w.ents.cols;
    c.decisionTimer[p] = 0;
    const x0 = c.x[p]!;
    const y0 = c.y[p]!;
    const timer0 = c.decisionTimer[p];
    const suit0 = c.suitability[p]!;
    let moved = false;
    for (let t = 0; t < 50; t++) {
      if (t === 25) setField(w, 'salt', cellIndex(64, 64), 0.6); // out of P04's salinity range
      step(w);
      expect(c.heldBySlot[p]).toBe(f);
      if (c.x[p] !== x0 || c.y[p] !== y0 || c.movedThisTick[p] !== 0) moved = true;
      expect(c.decisionTimer[p]).toBe(timer0);
      expect(c.flags[p]! & (FLAG.moving | FLAG.hunting)).toBe(0);
    }
    expect(moved).toBe(false);
    expect(c.suitability[p]).not.toBe(suit0);
    expect(c.suitability[p]).toBeLessThan(suit0);
    release(w, f, p);
    step(w);
    expect(c.movedThisTick[p]).toBeGreaterThan(0);
    expect(c.x[p] !== x0 || c.y[p] !== y0).toBe(true);
  });
});

describe('T4: the shipped stage 8 table', () => {
  it('lists native TRAP at id 7, after RIVALRY (6) and before the modules', () => {
    const keys = STAGE8_ACTIONS.map((a) => `${a.tier}:${a.key}:${a.id}`);
    const k = keys.indexOf('native:TRAP:7');
    expect(k).toBeGreaterThan(0);
    expect(keys[k - 1]).toBe('native:RIVALRY:6');
    expect(keys[k + 1]).toBe('module:E01:1');
  });
});

describe('T5: the stage 8 passes (SPEC §3.2 row 8)', () => {
  it('film construction, then the E11 mineral pass, then the trap step, then F02 transport — every tick, in that order', () => {
    const { w } = heldPair();
    rebuildIndex(w);
    order.log.length = 0;
    stageStructures(w);
    expect(order.log).toEqual(['film', 'mineral', 'trap', 'f02']);
    order.log.length = 0;
    step(w);
    expect(order.log).toEqual(['film', 'mineral', 'trap', 'f02']);
  });
});
