/**
 * Phase 5 wave 13, e3-traps: a dish with traps is deterministic (CLAUDE.md "Determinism"; SPEC §15): one run of 400
 * ticks equals four runs of 100 (stateHash and the full trajectory digest); a save at tick 777, with traps holding
 * and cooling down, reloads and runs to tick 3,000 equal to the uninterrupted run; and the worker host at 1× and
 * at 4× reaches the same hash.
 *
 * TRAP is not yet in IMPLEMENTED_NATIVE_ABILITIES (the lead appends it at the wave 13 integration), so the import
 * would refuse this dish: this file mocks the list with exactly TRAP appended (wave 13, e3-traps); the registry
 * uses allowUnimplemented for the same reason.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_NATIVE_ABILITIES: readonly string[] }>();
  // Wave 13 (e3-traps): the ability this task implements.
  return { ...orig, IMPLEMENTED_NATIVE_ABILITIES: [...new Set([...orig.IMPLEMENTED_NATIVE_ABILITIES, 'TRAP'])].sort() };
});

import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { cellIndex, SUB_SEDIMENT } from '../../src/sim/grid';
import { serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { FakeClockHost } from '../helpers/host';
import { registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';
import { clearWater, place, rebaseLedger, registry } from '../helpers/world';

const shipped = registry().manifest;
const REG_T = registryWith({ enabledSpecies: [...shipped.enabledSpecies, 'F03'].sort() }, { allowUnimplemented: true });
const meta = { name: 'trap determinism', savedAt: '2026-10-15T00:00:00Z', recipeId: null };
const LONG = 900_000;

/** A sediment band (y 56–71), 12 F03 (eight able to arm at once), 20 P04, broth patches and 200 B01. */
function dish(): World {
  const w = clearWater({ seed: 11 }, REG_T);
  for (let y = 56; y <= 71; y++) for (let x = 30; x <= 98; x++) w.grid.substrate[cellIndex(x, y)] = SUB_SEDIMENT;
  w.grid.geometryVersion++;
  for (const cx of [40, 64, 88]) for (let y = cx === 64 ? 58 : 60; y <= 68; y++) for (let x = cx - 4; x <= cx + 4; x++) w.fields.broth![cellIndex(x, y)] = 0.4;
  for (let k = 0; k < 12; k++) place(w, 'F03', 34.5 + 5 * k, 60.5 + (k % 3) * 4, k % 3 === 2 ? { B: 2.2, E: 60 } : { B: 2.8, N: 0.28, E: 80 });
  for (let k = 0; k < 20; k++) place(w, 'P04', 34.5 + 3 * k, 60.5 + (k % 4) * 3, { E: 70 });
  for (let k = 0; k < 200; k++) place(w, 'B01', 31.5 + (k % 66), 57.5 + Math.floor(k / 66) * 4);
  rebaseLedger(w);
  return w;
}

describe('trap determinism', () => {
  it('run(400) equals four run(100): stateHash and the full trajectory digest', { timeout: LONG }, () => {
    const a = dish();
    const b = dish();
    run(a, 400);
    for (let k = 0; k < 4; k++) run(b, 100);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(trajectoryDigest(b, 'full')).toBe(trajectoryDigest(a, 'full'));
    expect(a.events.totals.trapArmed ?? 0).toBeGreaterThan(0);
    expect(a.events.totals.trapHold ?? 0).toBeGreaterThan(0);
  });

  it('save at tick 777 (traps holding and cooling) → load → tick 3,000 equals the uninterrupted run', { timeout: LONG }, async () => {
    const w = dish();
    run(w, 777);
    const c = w.ents.cols;
    let holding = 0;
    let cooling = 0;
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      if (c.trapSlot[i]! >= 0) holding++;
      else if (c.trapCooldown[i]! > 0) cooling++;
    }
    console.info(`trap-determinism at 777: holding ${holding}, cooling ${cooling}, holds so far ${w.events.totals.trapHold ?? 0}, alive ${w.ents.count}`);
    expect(holding).toBeGreaterThan(0); // seed 11: 1 holding and 3 cooling at tick 777
    expect(cooling).toBeGreaterThan(0);
    const { text } = await buildSaveFile(w, meta);
    const { world: back } = await loadSaveFile(text);
    expect(stateHash(back)).toBe(stateHash(w));
    run(w, 3000 - 777);
    run(back, 3000 - 777);
    expect(back.tick).toBe(3000);
    expect(stateHash(back)).toBe(stateHash(w));
  });

  it('the worker host at 1× and at 4× reaches the same hash', { timeout: LONG }, () => {
    const state = serializeWorld(dish());
    const at = (speed: 1 | 4) => {
      const h = new FakeClockHost(REG_T);
      h.create(`traps-${speed}x`, { kind: 'state', state });
      h.setSpeed(speed);
      h.advanceTo(300);
      expect(h.errors()).toEqual([]);
      return h;
    };
    const one = at(1);
    const four = at(4);
    expect(four.maxTicksPerPump).toBeGreaterThan(1);
    expect(four.hash()).toBe(one.hash());
    expect(one.world.events.totals.trapHold ?? 0).toBeGreaterThan(0);
  });
});
