/**
 * Phase 5 wave 13, e3-jacket: determinism of the E11 mineral jacket (CLAUDE.md "Determinism"; SPEC §3.2 rows 4 and
 * 8, §9 E11; D-0045's one-snapshot construction pass).
 *
 * The dish: 40 P01 / P02 / P07 (half carrying E11), 4 P10 hunting them, B01 prey on sugar, silicate patches (shared
 * by the carriers of a cell) and grit dissolving back to silicate.
 *   - run(400) equals four run(100) (stateHash and the 'full' trajectory digest), jackets built, shared and handled;
 *   - buildSaveFile at tick 777 → loadSaveFile → run to 3,000 equals the uninterrupted run;
 *   - 1× and 4× through DishHost (the worker host) reach the same hash at the same tick, equal to a headless run.
 *
 * E11 is not yet in IMPLEMENTED_MODULES (the lead appends it at the organism flip, D-0104): the import would refuse
 * this dish, so this file mocks the list with exactly E11 appended (wave 13, e3-jacket); the registry uses
 * allowUnimplemented for the same reason.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_MODULES: readonly string[] }>();
  return { ...orig, IMPLEMENTED_MODULES: [...new Set([...orig.IMPLEMENTED_MODULES, 'E11'])].sort() };
});

import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex } from '../../src/sim/grid';
import { profileOf } from '../../src/sim/profiles';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { markField } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { Speed } from '../../src/worker/protocol';
import { registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf, clearWater, place, placeWith, rebaseLedger, registry } from '../helpers/world';

const shipped = registry().manifest;
const REG_J = registryWith(
  {
    enabledModules: [...shipped.enabledModules, 'E11'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'silicate'].sort() as SystemFlag[],
    enabledSpecies: [...shipped.enabledSpecies, 'P07', 'P10'].sort(),
  },
  { allowUnimplemented: true },
);
const meta = { name: 'jacket determinism', savedAt: '2026-10-15T00:00:00Z', recipeId: null };
const LONG = 900_000;

function patch(w: World, id: 'sugar' | 'silicate' | 'grit', x0: number, y0: number, x1: number, y1: number, v: number): void {
  const f = w.fields[id]!;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f[cellIndex(x, y)] = v;
  markField(w, id);
}

function jacketDish(): World {
  const w = clearWater({}, REG_J);
  patch(w, 'sugar', 44, 44, 84, 84, 0.25);
  patch(w, 'silicate', 48, 48, 62, 80, 0.02); // thin: several carriers of a cell share it
  patch(w, 'silicate', 66, 48, 80, 62, 0.2);
  patch(w, 'grit', 66, 66, 80, 80, 0.3);
  for (let k = 0; k < 60; k++) place(w, 'B01', 45.5 + (k % 12) * 3.2, 46.5 + Math.floor(k / 12) * 7.5, { E: 60 });
  const sps = ['P01', 'P02', 'P07'] as const;
  for (let k = 0; k < 40; k++) {
    const sp = sps[k % 3]!;
    const x = 49.5 + (k % 10) * 3.1;
    const y = 50.5 + Math.floor(k / 10) * 7.3;
    if (k % 2 === 0) placeWith(w, sp, x, y, ['E11'], { E: 60 });
    else place(w, sp, x, y, { E: 60 });
  }
  for (let k = 0; k < 4; k++) place(w, 'P10', 54.5 + 7 * k, 64.5, { E: 50 });
  rebaseLedger(w);
  return w;
}

const fingerprint = (w: World) => ({ hash: stateHash(w), digest: trajectoryDigest(w, 'full') });

function jacketed(w: World): number {
  const c = w.ents.cols;
  return aliveOf(w).filter((i) => c.jacketMineral[i]! > 0 && profileOf(w, i).jacket !== null).length;
}

describe('E11 jacket: determinism', () => {
  it(
    'run(400) equals four run(100); jackets are built and P10 handles',
    () => {
      const a = jacketDish();
      const b = jacketDish();
      run(a, 400);
      for (let k = 0; k < 4; k++) run(b, 100);
      expect(fingerprint(b)).toEqual(fingerprint(a));
      expect(jacketed(a)).toBeGreaterThan(5);
      expect(a.ledger.energy.construction).toBeGreaterThan(0);
      expect(a.events.totals.handlingStart ?? 0).toBeGreaterThan(0);
    },
    LONG,
  );

  it(
    'save at tick 777 → reload → run to 3,000 equals the uninterrupted run',
    async () => {
      const a = jacketDish();
      run(a, 777);
      expect(jacketed(a)).toBeGreaterThan(0);
      const { text } = await buildSaveFile(a, meta);
      const { world: b } = await loadSaveFile(text);
      expect(stateHash(b)).toBe(stateHash(a));
      run(a, 3000 - 777);
      run(b, 3000 - 777);
      expect(fingerprint(b)).toEqual(fingerprint(a));
    },
    LONG,
  );

  it(
    '1× and 4× through DishHost reach the same hash at the same tick',
    async () => {
      const start = jacketDish();
      run(start, 20);
      const { text } = await buildSaveFile(start, meta);
      const at = async (speed: Speed) => {
        let now = 0;
        const host = new DishHost(REG_J, () => {}, { now: () => now, iso: () => '2026-10-15T00:00:00.000Z' });
        await host.handleAsync({ type: 'importDish', requestId: 1, text, newDishId: 'd' });
        host.handle({ type: 'activate', dishId: 'd' });
        host.handle({ type: 'setSpeed', dishId: 'd', speed });
        const w = host.world('d')!;
        while (w.tick < 20 + 400) {
          now += 100;
          host.pump();
        }
        return { tick: w.tick, hash: stateHash(w) };
      };
      const one = await at(1);
      const four = await at(4);
      expect(one.tick).toBe(420);
      expect(four).toEqual(one);
      const headless = jacketDish();
      run(headless, 420);
      expect(stateHash(headless)).toBe(one.hash);
    },
    LONG,
  );
});
