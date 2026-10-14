/**
 * Phase 5 wave 12, e2-light-algae: determinism and conservation of A03's low-light curve, A04's saved mode and
 * A05's canopy (CLAUDE.md "Determinism", "Conservation"; SPEC §3.3, §3.4, §15; D-0103).
 *
 * The dish: 30 A01, 20 A03, 30 A04 (a quarter of them E06 carriers), 5 A05, sugar patches, shade paint on the west
 * third, the day/night cycle on.
 *   - run(400) equals four run(100) (stateHash and the 'full' trajectory digest);
 *   - buildSaveFile at tick 777 → loadSaveFile → run to 3,000 equals the uninterrupted run (modes switch at dusk);
 *   - 1× and 4× through DishHost (the worker host) reach the same hash at the same tick;
 *   - closed lid, no inputs, 10,000 ticks in 20 chunks: checkLedger relErr < 1e-5 for C and N and the absolute
 *     residual under 1e-8.
 *
 * LOW_LIGHT_CURVE and MIXOTROPHY are not in IMPLEMENTED_NATIVE_ABILITIES yet (the lead appends them at the wave 12
 * integration, D-0104), so the import would refuse this dish: this file mocks the list with both appended (wave 12),
 * and REG uses allowUnimplemented for the same reason.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_NATIVE_ABILITIES: readonly string[] }>();
  // Wave 12 (e2-light-algae): the two abilities this task implements; the lead appends them at integration.
  return { ...orig, IMPLEMENTED_NATIVE_ABILITIES: [...new Set([...orig.IMPLEMENTED_NATIVE_ABILITIES, 'LOW_LIGHT_CURVE', 'MIXOTROPHY'])].sort() };
});

import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { setLightMode } from '../../src/sim/climate';
import { cellIndex, maskCells } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { stateHash } from '../../src/sim/serialize';
import { shadeFactor } from '../../src/sim/structures';
import { run } from '../../src/sim/tick';
import { inactiveFieldsNonZero, markField, updateDerived } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { Speed } from '../../src/worker/protocol';
import { registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';
import { clearWater, place, placeWith, rebaseLedger, registry } from '../helpers/world';

const SHIPPED = registry().manifest;
const REG = registryWith({ enabledSpecies: [...SHIPPED.enabledSpecies, 'A03', 'A04', 'A05'].sort() }, { allowUnimplemented: true });
const meta = { name: 'algae determinism', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const LONG = 900_000;

function algaeDish(lid: 'open' | 'closed' = 'open'): World {
  const w = clearWater({ lid }, REG);
  // Shade paint on the west third (the world's recorded shade factor, CT §5.1: 0.1).
  const shade = shadeFactor(w) ?? 0.1;
  for (const cell of maskCells()) if (cell % 128 < 43) w.grid.shade[cell] = shade;
  w.grid.geometryVersion++;
  updateDerived(w);
  // Sugar patches (east and centre).
  const sugar = w.fields.sugar!;
  for (let y = 56; y <= 72; y++) for (let x = 60; x <= 70; x++) sugar[cellIndex(x, y)] = 0.6;
  for (let y = 40; y <= 48; y++) for (let x = 84; x <= 92; x++) sugar[cellIndex(x, y)] = 0.6;
  markField(w, 'sugar');
  rebaseLedger(w);
  for (let k = 0; k < 30; k++) place(w, 'A01', 30.5 + (k % 10) * 6, 50.5 + Math.floor(k / 10) * 5);
  for (let k = 0; k < 20; k++) place(w, 'A03', 32.5 + (k % 10) * 6, 70.5 + Math.floor(k / 10) * 5);
  for (let k = 0; k < 30; k++) {
    const x = 36.5 + (k % 10) * 5;
    const y = 60.5 + Math.floor(k / 10) * 3;
    if (k % 4 === 0) placeWith(w, 'A04', x, y, ['E06']);
    else place(w, 'A04', x, y);
  }
  for (let k = 0; k < 5; k++) place(w, 'A05', 40.5 + k * 9, 80.5);
  expect(setLightMode(w, 'cycle')).toBe(true);
  return w;
}

const fingerprint = (w: World) => ({ hash: stateHash(w), digest: trajectoryDigest(w, 'full') });

describe('light and algae: determinism', () => {
  it(
    'run(400) equals four run(100)',
    () => {
      const a = algaeDish();
      const b = algaeDish();
      run(a, 400);
      for (let k = 0; k < 4; k++) run(b, 100);
      expect(fingerprint(b)).toEqual(fingerprint(a));
      expect(inactiveFieldsNonZero(a)).toEqual([]);
    },
    LONG,
  );

  it(
    'save at tick 777 → reload → run to 3,000 equals the uninterrupted run (A04s switch at dusk and dawn)',
    async () => {
      const a = algaeDish();
      run(a, 777);
      const { text } = await buildSaveFile(a, meta);
      const { world: b } = await loadSaveFile(text);
      expect(stateHash(b)).toBe(stateHash(a));
      run(a, 3000 - 777);
      run(b, 3000 - 777);
      expect(fingerprint(b)).toEqual(fingerprint(a));
      expect(a.events.totals.modeSwitch ?? 0).toBeGreaterThan(0);
    },
    LONG,
  );

  it(
    '1× and 4× through DishHost reach the same hash at the same tick',
    async () => {
      const start = algaeDish();
      run(start, 20);
      const { text } = await buildSaveFile(start, meta);
      const at = async (speed: Speed) => {
        let now = 0;
        const host = new DishHost(REG, () => {}, { now: () => now, iso: () => '2026-10-14T00:00:00.000Z' });
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
      const headless = algaeDish();
      run(headless, 420);
      expect(stateHash(headless)).toBe(one.hash);
    },
    LONG,
  );
});

describe('light and algae: conservation', () => {
  it(
    'closed lid, no inputs, 10,000 ticks in 20 chunks: C and N reconcile (relErr < 1e-5, absolute residual < 1e-8)',
    () => {
      const w = algaeDish('closed');
      const inputs = { ...w.ledger.inputs };
      const worstAbs = { c: 0, n: 0, m: 0 };
      for (let k = 0; k < 20; k++) {
        run(w, 500);
        const check = checkLedger(w);
        expect(check.ok, `tick ${w.tick}: ${JSON.stringify(check)}`).toBe(true);
        expect(check.relErr.c).toBeLessThan(1e-5);
        expect(check.relErr.n).toBeLessThan(1e-5);
        for (const e of ['c', 'n', 'm'] as const) worstAbs[e] = Math.max(worstAbs[e], Math.abs(check.actual[e] - check.expected[e]));
      }
      expect(w.tick).toBe(10000);
      expect(w.ledger.inputs).toEqual(inputs);
      expect(w.ledger.exchangeC).toBe(0);
      expect(worstAbs.c).toBeLessThan(1e-8);
      expect(worstAbs.n).toBeLessThan(1e-8);
      expect(worstAbs.m).toBeLessThan(1e-8);
      expect(w.events.totals.modeSwitch ?? 0).toBeGreaterThan(0);
      console.info(`algae-determinism: worst absolute residual C ${worstAbs.c.toExponential(3)}, N ${worstAbs.n.toExponential(3)}; alive ${w.ents.count}; births ${w.events.totals.birth ?? 0}; mode switches ${w.events.totals.modeSwitch}`);
    },
    LONG,
  );
});
