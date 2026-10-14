/**
 * Phase 5 wave 10 barrier-transport: determinism, saves and conservation with barrier diffusion, S04
 * channels, S08 resins and gate tallies in play (CLAUDE.md "Determinism", "Conservation", "Saves are
 * sacred"; D-0103; D-0108 gateTally saved, never hashed; g5-plan carry-overs: a buildSaveFile →
 * loadSaveFile round trip at every state the task writes).
 *
 * The dish (barrierDish: shipped manifest + 'barriers', 'climate', 'devices', S01–S12, allowUnimplemented
 * until the systems flip, D-0104): an S01 membrane line at x = 63|64 with S02 gates, a closed and an open
 * shutter and two S04 channels with opposite flows on it, two resins, 40 B01 and 4 P01, a v01 dose, sugar
 * and inhibitor patches. Ledgers are re-baselined after the hand-built setup.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import type { EdgeBarrier } from '../../src/sim/barriers';
import type { Device } from '../../src/sim/devices';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { markField } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf, barrierDish, clearWater, place, pushDevices, pushEdges, rebaseLedger, registry, verticalLine } from '../helpers/world';

const meta = { name: 'barrier transport determinism', savedAt: '2026-10-14T00:00:00Z', recipeId: null };

const EDGES: Omit<EdgeBarrier, 'id'>[] = [
  ...verticalLine('S01', 63, 0, 40),
  ...verticalLine('S02', 63, 41, 52),
  ...verticalLine('S03', 63, 53, 56, { open: false }),
  ...verticalLine('S03', 63, 57, 60, { open: true }),
  ...verticalLine('S04', 63, 61, 61, { flow: 1 }),
  ...verticalLine('S04', 63, 62, 62, { flow: -1 }),
  ...verticalLine('S02', 63, 63, 72),
  ...verticalLine('S01', 63, 73, 127),
];
const RESINS: Omit<Device, 'id'>[] = [
  { kind: 'S08', cell: cellIndex(58, 64), resinSelect: ['inhBact'] },
  { kind: 'S08', cell: cellIndex(70, 58), resinSelect: ['inhBact', 'inhFung'] },
];

function populate(w: World, structures: boolean): void {
  if (structures) {
    pushEdges(w, EDGES);
    pushDevices(w, RESINS);
  }
  const f = w.fields;
  for (const cell of maskCells()) {
    const x = cell % 128;
    const y = Math.floor(cell / 128);
    if (Math.abs(x - 60) <= 10 && Math.abs(y - 60) <= 14) {
      f.sugar![cell] = 0.4;
      f.sugarN![cell] = 0.04;
    }
    if (Math.abs(x - 58) <= 2 && Math.abs(y - 64) <= 2) f.inhBact![cell] = 0.3;
    if (Math.abs(x - 70) <= 2 && Math.abs(y - 58) <= 2) {
      f.inhBact![cell] = 0.2;
      f.inhFung![cell] = 0.2;
    }
  }
  f.v01![cellIndex(66, 66)] = 200;
  for (const id of ['sugar', 'sugarN', 'inhBact', 'inhFung', 'v01'] as const) markField(w, id);
  for (let k = 0; k < 40; k++) place(w, 'B01', 52.5 + ((k * 7) % 22), 48.5 + ((k * 5) % 24), { E: 60 });
  for (let k = 0; k < 4; k++) place(w, 'P01', 56.5 + k * 3, 52.5 + (k % 2) * 10, { E: 50 });
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

describe('barrier transport determinism and saves', () => {
  it('run(400) equals four run(100) (stateHash, full digest, gateTally)', () => {
    const a = dish();
    const b = dish();
    run(a, 400);
    for (let k = 0; k < 4; k++) run(b, 100);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(trajectoryDigest(b, 'full')).toBe(trajectoryDigest(a, 'full'));
    expect(b.gateTally).toEqual(a.gateTally);
    expect(a.gateTally.length).toBeGreaterThan(0);
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
    expect(b.gateTally).toEqual(a.gateTally);
    b = await roundTrip(a); // tick 3,000
    expect(b.edges).toEqual(a.edges);
    expect(b.devices).toEqual(a.devices);
    expect(b.gateTally).toEqual(a.gateTally);
    // The run exercised every new state: a channel waited, the resins bound activity.
    expect(a.edges.some((e) => e.nextOrganismTick !== undefined)).toBe(true);
    expect(a.devices.every((d) => d.bound !== undefined)).toBe(true);
    // Movement never crossed an S01 or a closed shutter (a crossing there would be a wave 9 movement bug).
    const blocking = new Set(a.edges.filter((e) => e.kind === 'S01' || (e.kind === 'S03' && e.open === false)).map((e) => e.id));
    for (const t of a.gateTally) if (blocking.has(t.id)) expect(t.organisms, `structure ${t.id}`).toBe(0);
    expect(a.gateTally.some((t) => blocking.has(t.id))).toBe(true);
  }, 180_000);
});

describe('barrier transport conservation (closed lid, no inputs)', () => {
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
  it('the dish without structures under the Phase 5 registry is byte-identical to the shipped-registry run after 2,000 ticks and never allocates a gateTally record', () => {
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
      expect(Array.from(ca[k]!).slice(0, a.ents.highWater), k).toEqual(Array.from(cb[k]!).slice(0, b.ents.highWater));
    }
    for (const id of Object.keys(b.fields)) {
      const fa = a.fields[id as keyof typeof a.fields]!;
      const fb = b.fields[id as keyof typeof b.fields]!;
      expect(Buffer.from(fa.buffer).equals(Buffer.from(fb.buffer)), id).toBe(true);
    }
    expect(a.gateTally).toEqual([]);
    expect(aliveOf(b).length).toBeGreaterThan(0);
  }, 120_000);
});
