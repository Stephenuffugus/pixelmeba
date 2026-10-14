/**
 * Phase 5 wave 10 structure-commands: the climate commands (SPEC §4.6 "manual light changes are commands",
 * §4.8 the wetting brush and drying; D-0106, D-0108, D-0113, D-0116, D-0117; src/sim/structureEdits.ts
 * through src/sim/climate.ts wetCells / setLightMode).
 * - wetBrush sets 0.9 on gel and sediment, leaves water at 1, allocates the moisture array through
 *   ensureMoisture, changes no field (byte-equal) and no ledger line; a stroke over water only changes nothing.
 * - setLightMode cycle then fixed: cycleStartTick set then deleted; the import accepts both files;
 *   choosing the current mode gives accepted 0, 'unchanged'.
 * - setDrying on then off.
 * - All three are refused in a v1.0 dish (no 'climate'), and a paused applyNow equals a command queued
 *   for the same tick (stateHash), each followed by a save round trip.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import { applyNow, queueCommand, type CommandPayload, type CommandResult } from '../../src/sim/commands';
import { FIELD_IDS } from '../../src/sim/fields';
import { cellIndex, maskCells, NOT_IN_DISH, strokeFootprint, SUB_WATER } from '../../src/sim/grid';
import { canonicalJson } from '../../src/sim/hash';
import { moistureAt } from '../../src/sim/climate';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { barrierRegistry, clearWater, place, preFlipRegistry } from '../helpers/world';

const REG = barrierRegistry();
const meta = { name: 'climate commands', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
let seq = 0;
const cmd = (w: World, p: CommandPayload): CommandResult => applyNow(w, `cc${seq++}`, p).result!;

async function roundTrip(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  const { world } = await loadSaveFile(text);
  expect(stateHash(world)).toBe(stateHash(w));
  return world;
}

function fieldsJson(w: World): string {
  return canonicalJson(FIELD_IDS.filter((id) => w.fields[id]).map((id) => [id, Array.from(w.fields[id]!)]));
}

describe('wetBrush', () => {
  it('sets gel and sediment to 0.9, leaves water at 1, and touches no field or ledger line', async () => {
    const w = clearWater({}, REG);
    place(w, 'B01', 64.5, 64.5);
    cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points: [[50.5, 64.5]], radius: 3 });
    cmd(w, { kind: 'paintSubstrate', substrate: 'sediment', points: [[56.5, 64.5]], radius: 3 });
    expect(w.climate.moisture).toBeNull();
    const fields = fieldsJson(w);
    const ledger = canonicalJson(w.ledger);
    const points: (readonly [number, number])[] = [[48.5, 64.5], [60.5, 64.5]];
    const cells = strokeFootprint(points, 3);
    const dry = cells.filter((c) => w.grid.substrate[c] !== SUB_WATER).length;
    const res = cmd(w, { kind: 'wetBrush', points, radius: 3 });
    expect(res).toEqual({ accepted: dry, rejected: cells.length - dry });
    expect(dry).toBeGreaterThan(20);
    const m = w.climate.moisture!;
    expect(m).not.toBeNull();
    for (const c of maskCells()) {
      const covered = cells.includes(c);
      if (w.grid.substrate[c] === SUB_WATER) expect(moistureAt(w, c)).toBe(1);
      else expect(m[c], `${c}`).toBe(covered ? 0.9 : 0.8);
    }
    expect(fieldsJson(w)).toBe(fields);
    expect(canonicalJson(w.ledger)).toBe(ledger);
    await roundTrip(w);
  });

  it('a stroke over water only wets nothing and allocates nothing (no hidden change without an undo point)', () => {
    const w = clearWater({}, REG);
    const hash = stateHash(w);
    const res = cmd(w, { kind: 'wetBrush', points: [[64.5, 64.5]], radius: 6 });
    expect(res.accepted).toBe(0);
    expect(res.note).toBe('nothing wetted');
    expect(w.climate.moisture).toBeNull();
    const twin = clearWater({}, REG);
    cmd(twin, { kind: 'setDrying', drying: false }); // unchanged: the same sequence number taken, nothing else
    expect(stateHash(w)).toBe(stateHash(twin));
    expect(hash).not.toBe(stateHash(w)); // only nextSeq moved
  });
});

describe('setLightMode and setDrying', () => {
  it('cycle sets cycleStartTick = tick, fixed deletes it; the import accepts both; the same mode is unchanged', async () => {
    const w = clearWater({}, REG);
    run(w, 37);
    expect(cmd(w, { kind: 'setLightMode', mode: 'fixed' })).toEqual({ accepted: 0, rejected: 0, note: 'unchanged' });
    expect(cmd(w, { kind: 'setLightMode', mode: 'cycle' })).toEqual({ accepted: 1, rejected: 0 });
    expect(w.settings.lightMode).toBe('cycle');
    expect(w.settings.cycleStartTick).toBe(37);
    await roundTrip(w);
    run(w, 10);
    expect(cmd(w, { kind: 'setLightMode', mode: 'cycle' })).toEqual({ accepted: 0, rejected: 0, note: 'unchanged' });
    expect(w.settings.cycleStartTick).toBe(37);
    expect(cmd(w, { kind: 'setLightMode', mode: 'fixed' })).toEqual({ accepted: 1, rejected: 0 });
    expect(w.settings.lightMode).toBe('fixed');
    expect('cycleStartTick' in w.settings).toBe(false);
    await roundTrip(w);
    // Why the deletion matters: a fixed dish that kept its cycle start is refused by the import (D-0108).
    const kept = deserializeWorld(serializeWorld(w));
    kept.settings.cycleStartTick = 37;
    await expect(parseSaveFile((await buildSaveFile(kept, meta)).text)).rejects.toThrow('The dish records a light cycle start, but its light does not cycle. Nothing was loaded.');
  });

  it('drying on then off; the same value is unchanged; the command allocates no array (stage 2 does)', async () => {
    const w = clearWater({}, REG);
    expect(cmd(w, { kind: 'setDrying', drying: false })).toEqual({ accepted: 0, rejected: 0, note: 'unchanged' });
    expect(cmd(w, { kind: 'setDrying', drying: true })).toEqual({ accepted: 1, rejected: 0 });
    expect(w.settings.drying).toBe(true);
    expect(w.climate.moisture).toBeNull();
    await roundTrip(w);
    run(w, 3);
    expect(w.climate.moisture).not.toBeNull();
    expect(cmd(w, { kind: 'setDrying', drying: false })).toEqual({ accepted: 1, rejected: 0 });
    expect(w.settings.drying).toBe(false);
    await roundTrip(w);
  });

  it('all three are refused in a v1.0 dish (no climate)', () => {
    const w = clearWater({}, preFlipRegistry());
    const json = canonicalJson(serializeWorld(w));
    for (const p of [
      { kind: 'wetBrush', points: [[64.5, 64.5]], radius: 3 },
      { kind: 'setLightMode', mode: 'cycle' },
      { kind: 'setLightMode', mode: 'fixed' },
      { kind: 'setDrying', drying: true },
    ] as CommandPayload[]) {
      const res = cmd(w, p);
      expect(res).toEqual({ accepted: 0, rejected: 0, note: `climate is ${NOT_IN_DISH}` });
    }
    const after = JSON.parse(canonicalJson(serializeWorld(w))) as Record<string, unknown>;
    const before = JSON.parse(json) as Record<string, unknown>;
    // Only the command log, its 'command' events (and their counter) and nothing else moved.
    for (const k of Object.keys(before)) if (k !== 'commands' && k !== 'events' && k !== 'history' && k !== 'counters') expect(after[k], k).toEqual(before[k]);
    expect({ ...(after.counters as object), nextEventId: 0 }).toEqual({ ...(before.counters as object), nextEventId: 0 });
  });
});

describe('paused equals queued', () => {
  const kinds: CommandPayload[] = [
    { kind: 'wetBrush', points: [[50.5, 64.5], [52.5, 66.5]], radius: 3 },
    { kind: 'setLightMode', mode: 'cycle' },
    { kind: 'setDrying', drying: true },
  ];
  it.each(kinds)('$kind: applyNow at tick 50 equals the command queued for tick 50, and the save round trips', async (p) => {
    const make = () => {
      const w = clearWater({}, REG);
      place(w, 'A01', 60.5, 60.5);
      place(w, 'B01', 50.5, 64.5);
      applyNow(w, 'gel', { kind: 'paintSubstrate', substrate: 'gel', points: [[50.5, 64.5]], radius: 6 });
      return w;
    };
    const a = make();
    run(a, 50);
    applyNow(a, 'x', p);
    run(a, 150);
    const b = make();
    queueCommand(b, 'x', p, 50);
    run(b, 200);
    expect(stateHash(b)).toBe(stateHash(a));
    const c = deserializeWorld(serializeWorld(a));
    run(c, 100);
    run(a, 100);
    expect(stateHash(c)).toBe(stateHash(a));
    await roundTrip(a);
  });
});

it('the wetting brush cell rule matches climate.ts (in-dish gel or sediment only)', () => {
  const w = clearWater({}, REG);
  const cell = cellIndex(64, 64);
  expect(cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points: [[64.5, 64.5]], radius: 1 }).accepted).toBe(5);
  expect(cmd(w, { kind: 'wetBrush', points: [[64.5, 64.5]], radius: 1 })).toEqual({ accepted: 5, rejected: 0 });
  expect(w.climate.moisture![cell]).toBe(0.9);
});
