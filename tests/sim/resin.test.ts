/**
 * Phase 5 wave 10 barrier-transport: the S08 adsorption resin (SPEC §4.9 "removes selected inhibitor/RIVAL
 * activity from its own cell at ≤ 0.05 units/s, proportionally, until 5 total units are bound; saturated
 * resin is inert until replaced"; CT §4, §12.2; D-0117: the last selected target takes the exact
 * remainder, bound is created lazily, no ledger line).
 *
 * Worlds: barrierDish (clear water, shipped manifest + 'barriers', 'climate', 'devices', S01–S12,
 * allowUnimplemented: the structures are listed as implemented at the systems flip, D-0104). Devices are
 * pushed with wave 9's pushDevices (ids below nextDeviceId, geometryVersion bumped).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { RESIN_CAPACITY, type Device, type ResinTarget } from '../../src/sim/devices';
import { cellIndex } from '../../src/sim/grid';
import { computeTotals } from '../../src/sim/ledger';
import { resinBoundSum, resinStep } from '../../src/sim/resin';
import { stateHash } from '../../src/sim/serialize';
import { stageEnvironment } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { barrierDish, pushDevices, setField } from '../helpers/world';

const meta = { name: 'resin', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const CELL = cellIndex(64, 64);
const PER_TICK = 0.05 * 0.1;

function relClose(a: number, b: number, rel = 1e-12): void {
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.max(Math.abs(a), Math.abs(b)));
}

function dish(select: ResinTarget[]): { w: World; resin: Device } {
  const w = barrierDish({ seed: 104729, lid: 'closed' });
  pushDevices(w, [{ kind: 'S08', cell: CELL, resinSelect: select }]);
  return { w, resin: w.devices[0]! };
}

async function roundTrip(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  const { world } = await loadSaveFile(text);
  expect(stateHash(world)).toBe(stateHash(w));
  return world;
}

describe('S08 adsorption resin', () => {
  it('inhBact held at 1.0: exactly 0.005 per tick until 5 are bound, then nothing more; the bound sum never exceeds 5', async () => {
    const { w, resin } = dish(['inhBact']);
    expect(resin.bound).toBeUndefined();
    let last = 0;
    let ticks = 0;
    let checkedPartial = false;
    while (resinBoundSum(resin) < RESIN_CAPACITY && ticks < 1100) {
      setField(w, 'inhBact', CELL, 1);
      stageEnvironment(w);
      w.tick++;
      ticks++;
      const sum = resinBoundSum(resin);
      expect(sum).toBeLessThanOrEqual(RESIN_CAPACITY + 1e-9);
      const delta = sum - last;
      if (RESIN_CAPACITY - last >= PER_TICK) relClose(delta, PER_TICK, 1e-9);
      else expect(delta).toBeLessThan(PER_TICK);
      last = sum;
      if (ticks === 400 && !checkedPartial) {
        checkedPartial = true;
        await roundTrip(w); // partial bound passes the import
      }
    }
    expect(ticks).toBeGreaterThanOrEqual(999);
    expect(ticks).toBeLessThanOrEqual(1001);
    relClose(resinBoundSum(resin), RESIN_CAPACITY);
    expect(Object.keys(resin.bound!)).toEqual(['inhBact']);
    // Saturated: inert. The field at its cell is untouched from now on.
    const saturated = { ...resin.bound };
    for (let k = 0; k < 50; k++) {
      setField(w, 'inhBact', CELL, 1);
      const before = Float64Array.from(w.fields.inhBact!);
      resinStep(w);
      expect(Buffer.from(w.fields.inhBact!.buffer).equals(Buffer.from(before.buffer))).toBe(true);
      stageEnvironment(w);
      w.tick++;
    }
    expect(resin.bound).toEqual(saturated);
    const loaded = await roundTrip(w); // saturated bound passes the import
    expect(loaded.devices[0]!.bound).toEqual(resin.bound);
  }, 60_000);

  it('two selected targets share the budget in proportion; the last takes the exact remainder; an unselected target is untouched', () => {
    const { w, resin } = dish(['inhBact', 'inhFung']);
    setField(w, 'inhBact', CELL, 0.6);
    setField(w, 'inhFung', CELL, 0.2);
    setField(w, 'inhPhoto', CELL, 0.4);
    resinStep(w);
    const b = resin.bound!;
    relClose(b.inhBact!, PER_TICK * 0.75);
    expect(b.inhFung).toBe(PER_TICK - b.inhBact!);
    expect(w.fields.inhBact![CELL]).toBe(0.6 - b.inhBact!);
    expect(w.fields.inhFung![CELL]).toBe(0.2 - b.inhFung!);
    expect(w.fields.inhPhoto![CELL]).toBe(0.4);
    expect(Object.keys(b)).toEqual(['inhBact', 'inhFung']);
  });

  it('a target that appears later keeps the bound keys in RESIN_TARGETS order', () => {
    const { w, resin } = dish(['inhBact', 'inhFung']);
    setField(w, 'inhFung', CELL, 0.3);
    resinStep(w);
    expect(Object.keys(resin.bound!)).toEqual(['inhFung']);
    setField(w, 'inhBact', CELL, 0.3);
    resinStep(w);
    expect(Object.keys(resin.bound!)).toEqual(['inhBact', 'inhFung']);
  });

  it('less activity than the budget: everything is taken, nothing below 0', () => {
    const { w, resin } = dish(['inhBact', 'inhPhoto']);
    setField(w, 'inhBact', CELL, 0.001);
    setField(w, 'inhPhoto', CELL, 0.002);
    resinStep(w);
    expect(w.fields.inhBact![CELL]).toBe(0);
    expect(w.fields.inhPhoto![CELL]).toBe(0);
    relClose(resinBoundSum(resin), 0.003);
  });

  it('a target the world does not allocate (rival without rivalry) is skipped', () => {
    const { w, resin } = dish(['inhBact', 'rival']);
    expect(w.fields.rival).toBeUndefined();
    setField(w, 'inhBact', CELL, 0.5);
    resinStep(w);
    relClose(resin.bound!.inhBact!, PER_TICK);
    expect(resin.bound!.rival).toBeUndefined();
  });

  it('[] selection does nothing', () => {
    const { w, resin } = dish([]);
    setField(w, 'inhBact', CELL, 1);
    resinStep(w);
    expect(w.fields.inhBact![CELL]).toBe(1);
    expect(resin.bound).toBeUndefined();
  });

  it('computeTotals c / n / m are unchanged by resin', () => {
    const { w } = dish(['inhBact', 'inhFung', 'inhPhoto']);
    setField(w, 'inhBact', CELL, 0.6);
    setField(w, 'inhFung', CELL, 0.2);
    setField(w, 'sugar', CELL, 0.3);
    const before = computeTotals(w);
    resinStep(w);
    const after = computeTotals(w);
    expect(after.c).toBe(before.c);
    expect(after.n).toBe(before.n);
    expect(after.m).toBe(before.m);
    expect(w.devices[0]!.bound).toBeDefined();
  });

  it('a resin moved by its device record keeps working at its new cell (read afresh every tick)', () => {
    const { w, resin } = dish(['inhBact']);
    const other = cellIndex(70, 64);
    resin.cell = other;
    w.grid.geometryVersion++;
    setField(w, 'inhBact', CELL, 0.5);
    setField(w, 'inhBact', other, 0.5);
    resinStep(w);
    expect(w.fields.inhBact![CELL]).toBe(0.5);
    expect(w.fields.inhBact![other]).toBeLessThan(0.5);
  });
});
