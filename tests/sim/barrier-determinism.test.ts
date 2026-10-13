/**
 * Phase 5 wave 9 barrier-movement: determinism, saves and conservation with edge barriers, shelters and
 * meshes in play (CLAUDE.md "Determinism", "Conservation", "Saves are sacred"; D-0103; g5-plan
 * carry-overs: a buildSaveFile → loadSaveFile round trip at every state the task writes).
 *
 * The dish: an S01 membrane line with S02 gates, a closed and an open shutter and an S04 channel on it,
 * 20 S05 shelters and 20 S06 meshes, and 60 organisms (B01, B02 and F02 on meshes, P01, P04 on a
 * sediment band, A01 carrying X01). Ledgers are re-baselined after the hand-built setup.
 *  - run(400) equals four run(100) (stateHash);
 *  - a save at tick 777, loaded and run to 3,000, equals the uninterrupted run (stateHash and the 'full'
 *    trajectory digest), and the saves at 0, 777 and 3,000 pass the import;
 *  - closed lid, no inputs: 10,000 ticks conserve C and N (relative error < 1e-5, absolute < 1e-8);
 *  - NEUTRAL: the same dish without edges and devices, under the Phase 5 registry, is byte-identical
 *    (entity columns and fields) to the shipped-registry run after 2,000 ticks.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import type { EdgeBarrier } from '../../src/sim/barriers';
import type { Device } from '../../src/sim/devices';
import { cellIndex, maskCells, SUB_GEL, SUB_SEDIMENT } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { hostOf } from '../../src/sim/parasites';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { markField, updateDerived } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { trajectoryDigest } from '../helpers/trajectory';
import {
  aliveOf,
  barrierDish,
  clearWater,
  place,
  pushDevices,
  pushEdges,
  rebaseLedger,
  registry,
  verticalLine,
} from '../helpers/world';

const meta = { name: 'barrier determinism', savedAt: '2026-10-13T00:00:00Z', recipeId: null };

const EDGES: Omit<EdgeBarrier, 'id'>[] = [
  ...verticalLine('S01', 63, 30, 55),
  ...verticalLine('S02', 63, 56, 61),
  ...verticalLine('S03', 63, 62, 64, { open: false }),
  ...verticalLine('S03', 63, 65, 67, { open: true }),
  ...verticalLine('S04', 63, 68, 69, { flow: 1 }),
  ...verticalLine('S01', 63, 70, 98),
];
const SHELTERS: Omit<Device, 'id'>[] = [];
for (let y = 50; y <= 53; y++)
  for (let x = 70; x <= 74; x++) SHELTERS.push({ kind: 'S05', cell: cellIndex(x, y) });
const MESHES: Omit<Device, 'id'>[] = [];
for (let y = 60; y <= 63; y++)
  for (let x = 54; x <= 58; x++) MESHES.push({ kind: 'S06', cell: cellIndex(x, y) });

/**
 * The dish's geometry, food and organisms. `structures` false leaves edges and devices out and paints the
 * mesh block as gel instead, so B02 and F02 have the same homes (the NEUTRAL comparison).
 */
function populate(w: World, structures: boolean): void {
  for (const cell of maskCells()) {
    const x = cell % 128;
    const y = Math.floor(cell / 128);
    if (x >= 30 && x <= 40) w.grid.substrate[cell] = SUB_SEDIMENT;
    if (!structures && x >= 54 && x <= 58 && y >= 60 && y <= 63) w.grid.substrate[cell] = SUB_GEL;
  }
  w.grid.geometryVersion++;
  updateDerived(w);
  if (structures) {
    expect(EDGES).toHaveLength(69);
    pushEdges(w, EDGES);
    expect(SHELTERS).toHaveLength(20);
    expect(MESHES).toHaveLength(20);
    pushDevices(w, [...SHELTERS, ...MESHES]);
  }
  const sugar = w.fields.sugar!;
  for (const cell of maskCells()) {
    const x = cell % 128;
    const y = Math.floor(cell / 128);
    if (Math.abs(x - 64) <= 12 && Math.abs(y - 60) <= 14) sugar[cell] = 0.4;
  }
  markField(w, 'sugar');
  // 26 B01 on both sides of the line and in the shelters.
  for (let k = 0; k < 26; k++) place(w, 'B01', 52.5 + ((k * 7) % 24), 48.5 + ((k * 5) % 24), { E: 60 });
  // B02 ×6 and F02 ×6 on the mesh block.
  for (let k = 0; k < 6; k++) place(w, 'B02', 54.5 + (k % 5), 60.5 + Math.floor(k / 5), { E: 60 });
  for (let k = 0; k < 6; k++) place(w, 'F02', 54.5 + (k % 5), 62.5 + Math.floor(k / 5), { E: 60 });
  for (let k = 0; k < 6; k++) place(w, 'P01', 58.5 + k * 2, 52.5 + (k % 3) * 6, { E: 50 });
  for (let k = 0; k < 6; k++) place(w, 'P04', 32.5 + k, 56.5 + (k % 3) * 3, { E: 50 });
  for (let k = 0; k < 5; k++) {
    place(w, 'A01', 60.5 + k, 70.5 + k, { E: 60 });
    place(w, 'X01', 60.5 + k, 70.5 + k, { E: 60 });
  }
  expect(aliveOf(w)).toHaveLength(60);
  rebaseLedger(w);
}

function dish(overrides: Parameters<typeof barrierDish>[0] = {}): World {
  const w = barrierDish({ seed: 104729, ...overrides });
  populate(w, true);
  return w;
}

async function roundTrip(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  const { world } = await loadSaveFile(text);
  expect(stateHash(world)).toBe(stateHash(w));
  return world;
}

describe('barrier dish determinism and saves', () => {
  it('the dish holds every barrier kind and the pairs attach', () => {
    const w = dish();
    run(w, 1);
    expect(new Set(w.edges.map((e) => e.kind))).toEqual(new Set(['S01', 'S02', 'S03', 'S04']));
    const xs = aliveOf(w, 'X01');
    expect(xs.filter((s) => hostOf(w, s) >= 0)).toHaveLength(5);
  });

  it('run(400) equals four run(100)', () => {
    const a = dish();
    const b = dish();
    run(a, 400);
    for (let k = 0; k < 4; k++) run(b, 100);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(trajectoryDigest(b, 'full')).toBe(trajectoryDigest(a, 'full'));
  }, 60_000);

  it('a save at 777, loaded and run to 3,000, equals the uninterrupted run; saves at 0, 777 and 3,000 pass the import', async () => {
    const a = dish();
    await roundTrip(a); // tick 0
    run(a, 777);
    let b = await roundTrip(a); // tick 777
    run(a, 3000 - 777);
    run(b, 3000 - 777);
    expect(b.tick).toBe(3000);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(trajectoryDigest(b, 'full')).toBe(trajectoryDigest(a, 'full'));
    b = await roundTrip(a); // tick 3,000
    expect(b.edges).toEqual(a.edges);
    expect(b.devices).toEqual(a.devices);
    expect(aliveOf(a).length).toBeGreaterThan(0);
  }, 180_000);
});

describe('barrier dish conservation (closed lid, no inputs)', () => {
  it('10,000 ticks in 20 chunks: C and N relative error < 1e-5 and absolute residual < 1e-8', () => {
    const w = dish({ lid: 'closed' });
    const inputs = { ...w.ledger.inputs };
    let worstRel = 0;
    let worstAbs = 0;
    for (let chunk = 0; chunk < 20; chunk++) {
      run(w, 500);
      const check = checkLedger(w);
      for (const e of ['c', 'n'] as const) {
        worstRel = Math.max(worstRel, check.relErr[e]);
        worstAbs = Math.max(worstAbs, Math.abs(check.actual[e] - check.expected[e]));
      }
      expect(check.ok, `tick ${w.tick}: ${JSON.stringify(check)}`).toBe(true);
    }
    expect(w.tick).toBe(10_000);
    expect(w.ledger.exchangeC).toBe(0);
    expect(w.ledger.inputs).toEqual(inputs);
    expect(worstRel).toBeLessThan(1e-5);
    expect(worstAbs).toBeLessThan(1e-8);
  }, 300_000);
});

describe('NEUTRAL: no edges and no devices is the old code path', () => {
  it('the dish without structures under the Phase 5 registry is byte-identical to the shipped-registry run after 2,000 ticks', () => {
    const a = barrierDish({ seed: 104729 });
    const b = clearWater({ seed: 104729 }, registry());
    populate(a, false);
    populate(b, false);
    expect(a.edges).toEqual([]);
    expect(a.devices).toEqual([]);
    run(a, 2000);
    run(b, 2000);
    expect(a.ents.highWater).toBe(b.ents.highWater);
    const ca = a.ents.cols as unknown as Record<string, ArrayLike<number>>;
    const cb = b.ents.cols as unknown as Record<string, ArrayLike<number>>;
    for (const k of Object.keys(cb)) {
      expect(Array.from(ca[k]!).slice(0, a.ents.highWater), k).toEqual(
        Array.from(cb[k]!).slice(0, b.ents.highWater),
      );
    }
    for (const id of Object.keys(b.fields)) {
      const fa = a.fields[id as keyof typeof a.fields]!;
      const fb = b.fields[id as keyof typeof b.fields]!;
      expect(Buffer.from(fa.buffer).equals(Buffer.from(fb.buffer)), id).toBe(true);
    }
    expect(aliveOf(b).length).toBeGreaterThan(0);
  }, 120_000);
});
