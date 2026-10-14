/**
 * Protocol 3 layout (wave 11 structure-render-worker; D-0102, D-0107, D-0119): PROTOCOL_VERSION 3,
 * ENT_STRIDE 15 with E_CUE3 = 14 and every protocol 2 offset unchanged; the CUE3 bits (distinct, masks
 * not overlapping, all below 2^24 so exact in Float32), each set from its own column at pack time and
 * cleared when the column clears; DEPOSIT_BANDS 8 with the grit band; both ends refuse a version-2 packet.
 * Phase 5 species and modules come from a test registry (allowUnimplemented: B09's SIGNAL_GLOW and E02 are
 * e2-signals' this wave and listed as implemented by the lead at integration; A02's SHELL, E11 and the
 * trap/held/handling/mode columns belong to later waves and are set by hand here).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CELL_COUNT } from '../../src/sim/constants';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import type { World } from '../../src/sim/world';
import { SimClient, WorkerRequestError, type WorkerLike } from '../../src/worker/client';
import * as P from '../../src/worker/protocol';
import { DEPOSIT_BANDS, packDeposits, packEntities } from '../../src/worker/snapshot';
import { registryWith } from '../helpers/registry';
import { clearWater, place, placeWith, registry } from '../helpers/world';

function phase5Registry() {
  const m = registry().manifest;
  return registryWith(
    {
      enabledSpecies: [...m.enabledSpecies, 'A02', 'B09'].sort(),
      enabledModules: [...m.enabledModules, 'E02', 'E11'].sort(),
      enabledSystems: [...m.enabledSystems, 'signals', 'silicate'].sort() as SystemFlag[],
    },
    { allowUnimplemented: true },
  );
}

/** E_CUE3 of the organism in `slot` after a fresh pack. */
function cue3(w: World, slot: number): number {
  const p = packEntities(w, null, null);
  for (let k = 0; k < p.count; k++) if (p.ents[k * P.ENT_STRIDE + P.E_SLOT] === slot) return p.ents[k * P.ENT_STRIDE + P.E_CUE3]!;
  throw new Error(`slot ${slot} not packed`);
}

describe('protocol 3 layout', () => {
  it('PROTOCOL_VERSION 3, ENT_STRIDE 15, E_CUE3 14, every protocol 2 offset and constant unchanged', () => {
    expect(P.PROTOCOL_VERSION).toBe(3);
    expect(P.ENT_STRIDE).toBe(15);
    expect(P.E_CUE3).toBe(14);
    expect([P.E_SLOT, P.E_SPECIES, P.E_X, P.E_Y, P.E_HEADING, P.E_FLAGS, P.E_GROWTH, P.E_ENERGY, P.E_HEALTH, P.E_LIFE, P.E_SIZE, P.E_CUE, P.E_CUE2, P.E_LINKMASK]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect(P.ID_STRIDE).toBe(2);
    expect([P.CUE_FEEDING, P.CUE_STRESSED, P.CUE_HUNTING, P.CUE_SECRETING, P.CUE_JUST_BORN, P.CUE_CAPACITY_BLOCKED, P.CUE_MOD_E01, P.CUE_MOD_E03, P.CUE_MOD_E05, P.CUE_RESERVE_BAND_SHIFT]).toEqual([1, 2, 4, 8, 16, 32, 64, 128, 256, 9]);
    expect([P.CUE2_INFECTED, P.CUE2_PARASITIZED, P.CUE2_ANCHORED, P.CUE2_LINKED, P.CUE2_MOD_E04, P.CUE2_MOD_E06, P.CUE2_MOD_E07, P.CUE2_MOD_E08, P.CUE2_MOD_E09, P.CUE2_MOD_E10, P.CUE2_MOD_E12, P.CUE2_SEEKING_LIGHT, P.CUE2_DETRITUS_INTAKE, P.CUE2_RELEASING_PROTEIN]).toEqual([
      1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192,
    ]);
    expect([P.LINKMASK_N, P.LINKMASK_E, P.LINKMASK_S, P.LINKMASK_W, P.LINKMASK_DIRS, P.LINKMASK_TRANSFER, P.LINK_STRIDE, P.LINK_KIND_ADHESION]).toEqual([1, 2, 4, 8, 15, 16, 5, 3]);
    expect([P.DEPOSIT_FILM_BAND, P.FILM_LEVEL_MASK, P.FILM_ERODING, P.DEPOSIT_GRIT_BAND, DEPOSIT_BANDS]).toEqual([6, 127, 128, 7, 8]);
    expect(P.EDGE_FLOW_BACK).toBe(8);
  });

  it('CUE3 bit values are distinct, the masks do not overlap and every value is below 2^24', () => {
    const fields = [
      P.CUE3_GLOWING,
      P.CUE3_MOD_E02,
      P.CUE3_MODE_MASK,
      P.CUE3_HELD,
      P.CUE3_HANDLING,
      P.CUE3_TRAP_MASK,
      P.CUE3_JACKET_MASK,
      P.CUE3_JACKETED,
      P.CUE3_MOD_E11,
      P.CUE3_SHELL,
    ];
    let seen = 0;
    for (const f of fields) {
      expect(f & seen, `0x${f.toString(16)} overlaps`).toBe(0);
      seen |= f;
    }
    expect(seen).toBeLessThan(2 ** 24);
    expect(Math.fround(seen)).toBe(seen);
    expect([P.CUE3_MODE_MASK >> P.CUE3_MODE_SHIFT, P.CUE3_TRAP_MASK >> P.CUE3_TRAP_SHIFT, P.CUE3_JACKET_MASK >> P.CUE3_JACKET_SHIFT]).toEqual([3, 3, 3]);
    expect([P.CUE3_GLOWING, P.CUE3_MOD_E02, P.CUE3_MODE_SHIFT, P.CUE3_HELD, P.CUE3_HANDLING, P.CUE3_TRAP_SHIFT, P.CUE3_JACKET_SHIFT, P.CUE3_JACKETED, P.CUE3_MOD_E11, P.CUE3_SHELL]).toEqual([1, 2, 2, 16, 32, 6, 8, 1024, 2048, 4096]);
  });

  it('packEntities writes E_CUE3 0 for every organism of a v1.0 dish', () => {
    const w = clearWater();
    for (let k = 0; k < 20; k++) place(w, ['B01', 'P01', 'A01', 'F01'][k % 4]!, 30.5 + 3 * k, 64.5);
    const p = packEntities(w, null, null);
    expect(p.count).toBe(20);
    for (let k = 0; k < p.count; k++) expect(p.ents[k * P.ENT_STRIDE + P.E_CUE3]).toBe(0);
  });

  it('each CUE3 bit is set from its column and cleared when the column clears', () => {
    const w = clearWater({}, phase5Registry());
    const c = w.ents.cols;
    // Glowing (B09 SIGNAL_GLOW, glowState 1).
    const glow = place(w, 'B09', 40.5, 64.5);
    expect(cue3(w, glow)).toBe(0);
    c.glowState[glow] = 1;
    expect(cue3(w, glow)).toBe(P.CUE3_GLOWING);
    c.glowState[glow] = 0;
    expect(cue3(w, glow)).toBe(0);
    // Module carriers.
    expect(cue3(w, placeWith(w, 'B01', 42.5, 64.5, ['E02']))).toBe(P.CUE3_MOD_E02);
    const jacket = placeWith(w, 'P01', 44.5, 64.5, ['E11']);
    expect(cue3(w, jacket)).toBe(P.CUE3_MOD_E11);
    // Shell: A02 with bound mineral.
    const shell = place(w, 'A02', 46.5, 64.5);
    c.boundMineral[shell] = 0.2;
    expect(cue3(w, shell)).toBe(P.CUE3_SHELL);
    c.boundMineral[shell] = 0;
    expect(cue3(w, shell)).toBe(0);
    // A non-SHELL species with bound mineral gets no shell bit.
    const plain = place(w, 'B01', 48.5, 64.5);
    c.boundMineral[plain] = 0.2;
    expect(cue3(w, plain)).toBe(0);
    c.boundMineral[plain] = 0;
    // Jacket coverage 0.1, 0.25, 0.5, 1.0 → bands 0, 0, 1, 3 (B 10 → 0.10 × B is exactly 1).
    c.B[jacket] = 10;
    const band = (cov: number) => {
      c.jacketMineral[jacket] = cov;
      return cue3(w, jacket);
    };
    for (const [cov, b] of [
      [0.1, 0],
      [0.25, 0],
      [0.5, 1],
      [1.0, 3],
      [2.5, 3],
    ] as const) {
      expect(band(cov), `coverage ${cov}`).toBe(P.CUE3_MOD_E11 | P.CUE3_JACKETED | (b << P.CUE3_JACKET_SHIFT));
    }
    expect(band(0)).toBe(P.CUE3_MOD_E11);
    // Mode: metabolicMode 1 Photo, 2 Sugar.
    const mode = place(w, 'B01', 50.5, 64.5);
    c.metabolicMode[mode] = 1;
    expect(cue3(w, mode)).toBe(1 << P.CUE3_MODE_SHIFT);
    c.metabolicMode[mode] = 2;
    expect(cue3(w, mode)).toBe(2 << P.CUE3_MODE_SHIFT);
    c.metabolicMode[mode] = 0;
    expect(cue3(w, mode)).toBe(0);
    // Held (a valid reference only).
    const trap = place(w, 'B01', 52.5, 64.5);
    const prey = place(w, 'B01', 53.5, 64.5);
    c.heldBySlot[prey] = trap;
    c.heldByBirthId[prey] = c.birthId[trap]!;
    expect(cue3(w, prey)).toBe(P.CUE3_HELD);
    c.heldByBirthId[prey] = c.birthId[trap]! + 999;
    expect(cue3(w, prey)).toBe(0);
    c.heldBySlot[prey] = -1;
    expect(cue3(w, prey)).toBe(0);
    // Trap: armed (reserve, no target) → 1, holding (valid) → 2, cooldown → 3.
    c.trapReserveC[trap] = 0.3;
    expect(cue3(w, trap)).toBe(1 << P.CUE3_TRAP_SHIFT);
    c.trapSlot[trap] = prey;
    c.trapBirthId[trap] = c.birthId[prey]!;
    expect(cue3(w, trap)).toBe(2 << P.CUE3_TRAP_SHIFT);
    c.trapSlot[trap] = -1;
    c.trapReserveC[trap] = 0;
    c.trapCooldown[trap] = 4;
    expect(cue3(w, trap)).toBe(3 << P.CUE3_TRAP_SHIFT);
    c.trapCooldown[trap] = 0;
    expect(cue3(w, trap)).toBe(0);
    // Handling: handlingNeed > 0 with a valid prey reference.
    const hunter = place(w, 'P01', 56.5, 64.5);
    c.handlingNeed[hunter] = 2;
    c.preySlot[hunter] = prey;
    c.preyBirthId[hunter] = c.birthId[prey]!;
    expect(cue3(w, hunter)).toBe(P.CUE3_HANDLING);
    c.preyBirthId[hunter] = 0;
    expect(cue3(w, hunter)).toBe(0);
    c.handlingNeed[hunter] = 0;
    c.preySlot[hunter] = -1;
    expect(cue3(w, hunter)).toBe(0);
  });

  it('DEPOSIT_BANDS 8: the grit band is 0 without the grit field and > 0 with grit', () => {
    const w = clearWater();
    expect(w.fields.grit).toBeUndefined();
    const d0 = packDeposits(w, null);
    expect(d0.length).toBe(8 * CELL_COUNT);
    expect(d0.subarray(P.DEPOSIT_GRIT_BAND * CELL_COUNT).every((v) => v === 0)).toBe(true);
    const g = clearWater({}, phase5Registry());
    expect(g.fields.grit).toBeDefined();
    const cell = cellIndex(64, 64);
    g.fields.grit![cell] = 0.5;
    const d1 = packDeposits(g, null);
    expect(d1[P.DEPOSIT_GRIT_BAND * CELL_COUNT + cell]).toBeGreaterThan(0);
    expect(d1[P.DEPOSIT_GRIT_BAND * CELL_COUNT + cell + 1]).toBe(0);
    // The same soft log scale as starch: equal amounts give equal bytes.
    g.fields.starch![cell] = 0.5;
    expect(packDeposits(g, null)[cell]).toBe(d1[P.DEPOSIT_GRIT_BAND * CELL_COUNT + cell]);
  });

  it('the client refuses a version-2 packet with the mismatch message naming 3; the worker entry checks PROTOCOL_VERSION', async () => {
    const sent: unknown[] = [];
    let onmessage: ((ev: MessageEvent<P.FromWorker>) => void) | null = null;
    const worker: WorkerLike = {
      postMessage: (m: P.ToWorker) => void sent.push(m),
      get onmessage() {
        return onmessage;
      },
      set onmessage(fn) {
        onmessage = fn;
      },
    };
    const client = new SimClient(worker);
    const errors: string[] = [];
    client.onError((e) => errors.push(e.message));
    const req = client.hash('d1');
    const r = sent.at(-1) as { requestId: number; protocolVersion: number };
    expect(r.protocolVersion).toBe(3);
    onmessage!({ data: { type: 'hash', requestId: r.requestId, dishId: 'd1', hash: 'x', tick: 0, protocolVersion: 2 } } as unknown as MessageEvent<P.FromWorker>);
    await expect(req).rejects.toBeInstanceOf(WorkerRequestError);
    expect(errors[0]).toBe('protocol version mismatch: worker 2, app 3');
    // The worker entry (sim.worker.ts runs only in a browser worker) refuses on msg.protocolVersion !== PROTOCOL_VERSION.
    const src = readFileSync(join(__dirname, '..', '..', 'src', 'worker', 'sim.worker.ts'), 'utf8');
    expect(src).toMatch(/msg\.protocolVersion !== PROTOCOL_VERSION/);
    expect(src).toMatch(/protocol version mismatch: app \$\{String\(msg\.protocolVersion\)\}, worker \$\{PROTOCOL_VERSION\}/);
  });
});
