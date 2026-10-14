/**
 * Protocol 3 v1.0 equivalence (wave 11 structure-render-worker; D-0102, D-0103, D-0119): a dish with no
 * edges, devices, climate or signals packs, inspects and hashes under protocol 3 exactly as protocol 2 did.
 * tests/fixtures/protocol2-golden/ was written by the UNMODIFIED HEAD code before the bump (step 0 of the
 * task; byte arrays are base64 of raw-deflated bytes). For both golden dishes the new code reproduces it:
 * per entity slots 0–13 equal the golden (Object.is) and slot 14 (E_CUE3) is 0; deposit bands 0–6 are
 * byte-equal and band 7 (grit) is zero; geometry substrate/structure/shade are equal with edges null and
 * devices []; the snapshot has no resins or environment key; CellInspect for the 24 recorded cells and
 * EntityInspect for the 5 lowest birthIds deep-equal the golden; the 'light' and 'sugar' overlays are equal;
 * stateHash is equal; and packing 300 snapshots between ticks leaves stateHash and trajectoryDigest unchanged.
 * A v1.0 dish is built under preFlipRegistry() (the manifest before the systems flip, D-0121, with the same
 * contentHash): since the flip a new dish under the shipped registry records the Phase 5 systems.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CELL_COUNT } from '../../src/sim/constants';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { DEPOSIT_GRIT_BAND, E_CUE3, ENT_STRIDE, ID_STRIDE } from '../../src/worker/protocol';
import { buildInspector, DEPOSIT_BANDS, packDeposits, packEntities, packEnvironment, packGeometry, packOverlay, packResins } from '../../src/worker/snapshot';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, SnapshotMsg } from '../../src/worker/protocol';
import { preFlipRegistry } from '../helpers/world';
import { readRc1SaveText, resumeRc1 } from '../helpers/rc1-saves';
import { trajectoryDigest } from '../helpers/trajectory';

const DIR = join(__dirname, '..', 'fixtures', 'protocol2-golden');

interface Golden {
  tick: number;
  stateHash: string;
  count: number;
  speciesCounts: number[];
  ents: number[][];
  ids: number[];
  deposits: string;
  depositBands: number;
  geometry: { version: number; substrate: string; structure: string; shade: string };
  cells: { cell: number; why: string }[];
  cellInspect: unknown[];
  entityBirthIds: number[];
  entityInspect: unknown[];
  overlays: Record<'light' | 'sugar', { max: number; data: string }>;
}

const golden = (name: string): Golden => JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as Golden;
const bytes = (b64: string): Uint8Array => new Uint8Array(inflateRawSync(Buffer.from(b64, 'base64')));
const f32 = (b64: string): Float32Array => {
  const u = bytes(b64);
  return new Float32Array(u.buffer, u.byteOffset, u.byteLength / 4);
};
/** JSON as the golden stored it (undefined keys dropped, -0 → 0). */
const asJson = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

async function dish(name: string): Promise<World> {
  if (name === 'first-dish-104729-t300') {
    const w = realizeRecipe(preFlipRegistry(), 'FIRST_DISH_V1', { seed: 104729, worldId: 'golden' });
    run(w, 300);
    return w;
  }
  const file = 'first-dish-lab-food-sample-held-t1500.pixelmeba.gz';
  const { world } = await loadSaveFile(readRc1SaveText(file));
  resumeRc1(file, world);
  run(world, 100);
  return world;
}

const NAMES = ['first-dish-104729-t300', 'rc1-lab-food-sample-t1600'] as const;

describe('protocol 3 packs a v1.0 dish exactly as protocol 2 did (golden written by the HEAD code)', () => {
  for (const name of NAMES) {
    it(`${name}: entities, deposits, geometry, inspectors, overlays and stateHash equal the protocol 2 golden`, { timeout: 120_000 }, async () => {
      const g = golden(name);
      const w = await dish(name);
      expect(w.tick).toBe(g.tick);
      expect(stateHash(w)).toBe(g.stateHash);
      expect(w.edges).toEqual([]);
      expect(w.devices).toEqual([]);

      const packed = packEntities(w, null, null);
      expect(packed.count).toBe(g.count);
      expect(packed.speciesCounts).toEqual(g.speciesCounts);
      expect(ENT_STRIDE).toBe(15);
      for (let k = 0; k < packed.count; k++) {
        for (let slot = 0; slot < 14; slot++) expect(Object.is(packed.ents[k * ENT_STRIDE + slot], g.ents[k]![slot]), `entity ${k} slot ${slot}`).toBe(true);
        expect(packed.ents[k * ENT_STRIDE + E_CUE3], `entity ${k} E_CUE3`).toBe(0);
      }
      expect(Array.from(packed.ids.subarray(0, packed.count * ID_STRIDE))).toEqual(g.ids);

      const dep = packDeposits(w, null);
      expect(DEPOSIT_BANDS).toBe(8);
      expect(dep.length).toBe(8 * CELL_COUNT);
      const old = bytes(g.deposits);
      expect(g.depositBands).toBe(7);
      expect(Buffer.compare(Buffer.from(dep.subarray(0, 7 * CELL_COUNT)), Buffer.from(old))).toBe(0);
      expect(dep.subarray(DEPOSIT_GRIT_BAND * CELL_COUNT).every((v) => v === 0)).toBe(true);

      const geo = packGeometry(w);
      expect(geo.version).toBe(g.geometry.version);
      expect(Buffer.compare(Buffer.from(geo.substrate), Buffer.from(bytes(g.geometry.substrate)))).toBe(0);
      expect(Buffer.compare(Buffer.from(geo.structure), Buffer.from(bytes(g.geometry.structure)))).toBe(0);
      const shade = f32(g.geometry.shade);
      expect(geo.shade.length).toBe(shade.length);
      for (let i = 0; i < shade.length; i++) if (!Object.is(geo.shade[i], shade[i])) throw new Error(`shade ${i}`);
      expect(geo.edges).toBeNull();
      expect(geo.devices).toEqual([]);
      expect(packResins(w)).toBeUndefined();
      expect(packEnvironment(w)).toBeUndefined();

      g.cells.forEach(({ cell }, k) => {
        const now = buildInspector(w, { kind: 'cell', cell });
        expect(asJson(now), `cell ${cell}`).toEqual(g.cellInspect[k]);
        const c = now.cell!;
        for (const key of ['climate', 'lightFactors', 'edges', 'device'] as const) expect(key in c, `${cell} ${key}`).toBe(false);
        if (c.exposure) expect('rival' in c.exposure).toBe(false);
      });
      g.entityBirthIds.forEach((birthId, k) => expect(asJson(buildInspector(w, { kind: 'entity', birthId })), `birth ${birthId}`).toEqual(g.entityInspect[k]));

      for (const id of ['light', 'sugar'] as const) {
        const o = packOverlay(w, id, null)!;
        expect(o.max).toBe(g.overlays[id].max);
        const want = f32(g.overlays[id].data);
        for (let i = 0; i < CELL_COUNT; i++) if (!Object.is(o.data[i], want[i])) throw new Error(`${id} overlay cell ${i}`);
      }
      expect(stateHash(w)).toBe(g.stateHash);
    });
  }

  it('the host snapshot of a v1.0 dish has no resins or environment key, and its geometry has edges null and devices []', () => {
    const out: FromWorker[] = [];
    const host = new DishHost(preFlipRegistry(), (m) => out.push(m), { now: () => 0 });
    host.handle({ type: 'create', requestId: 1, dishId: 'd', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    const snap = out.filter((m): m is SnapshotMsg => m.type === 'snapshot').at(-1)!;
    expect('resins' in snap).toBe(false);
    expect('environment' in snap).toBe(false);
    expect(snap.geometry!.edges).toBeNull();
    expect(snap.geometry!.devices).toEqual([]);
    const info = out.find((m): m is Extract<FromWorker, { type: 'ready' }> => m.type === 'ready');
    expect(info?.info.systems).toEqual([...preFlipRegistry().manifest.enabledSystems]);
  });

  it('packing 300 snapshots between ticks leaves stateHash and trajectoryDigest unchanged (packing only reads)', () => {
    const a = realizeRecipe(preFlipRegistry(), 'FIRST_DISH_V1', { seed: 104729, worldId: 'pack' });
    const b = realizeRecipe(preFlipRegistry(), 'FIRST_DISH_V1', { seed: 104729, worldId: 'pack' });
    for (let t = 0; t < 300; t++) {
      step(a);
      step(b);
      packEntities(b, null, null);
      packDeposits(b, null);
      packGeometry(b);
      packResins(b);
      packEnvironment(b);
      packOverlay(b, 'warmth', null);
      packOverlay(b, 'moisture', null);
      packOverlay(b, 'light', null);
      buildInspector(b, { kind: 'cell', cell: 64 * 128 + 64 });
    }
    expect(stateHash(b)).toBe(stateHash(a));
    expect(trajectoryDigest(b, 'full')).toBe(trajectoryDigest(a, 'full'));
    expect(b.climate).toEqual({ warmth: null, moisture: null });
  });
});
