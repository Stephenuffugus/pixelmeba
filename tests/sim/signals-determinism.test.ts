/**
 * Phase 5 wave 11, e2-signals: determinism, conservation and neutrality of signals and rivalry (CLAUDE.md
 * "Determinism", "Conservation"; SPEC §3.3, §3.4, §15; D-0103, D-0119).
 *
 * The dish: 30 B09 Lanterns, 10 E02 carriers (B01, 4 of them with E03), 10 B13 Ramparts on gel with 20 B01,
 * B10 and B11 around them, M06 / M07 / M08 patches, film on a quarter of the dish and a sugar patch that runs
 * out, so some carriers rest.
 *   - run(400) equals four run(100) (stateHash and the 'full' trajectory digest);
 *   - buildSaveFile at tick 777 → loadSaveFile → run to 3,000 equals the uninterrupted run;
 *   - 1× and 4× through DishHost (the worker host) reach the same hash at the same tick;
 *   - closed lid, no inputs, 10,000 ticks in 20 chunks: checkLedger relErr < 1e-5 for C and N and the
 *     absolute residual under 1e-8 (emission and glow move no material);
 *   - energy identity: Δ Σ E of the living = earned − every other energy category, 'signal' included;
 *   - NEUTRAL: a dish of shipped species (B01, B02, B04, B06, P01, A01, E03 carriers) under the shipped registry
 *     and under the signals registry (which records 'signals' and 'rivalry' but holds no B09, B13 or E02
 *     organism) keeps identical entity columns over 2,000 ticks (species compared by id: the registries number
 *     species differently).
 *
 * E02 is not yet in IMPLEMENTED_MODULES (the lead appends it at integration, D-0119), so this file mocks the list
 * with E02 appended for the import; the registry uses allowUnimplemented (SIGNAL_GLOW, RIVALRY, E02).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_MODULES: readonly string[] }>();
  return { ...orig, IMPLEMENTED_MODULES: [...new Set([...orig.IMPLEMENTED_MODULES, 'E02'])].sort() };
});

import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { ENTITY_COLUMNS } from '../../src/sim/entities';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex, SUB_GEL } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { inactiveFieldsNonZero, markField } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { Speed } from '../../src/worker/protocol';
import { registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';
import { clearWater, paintRect, place, placeWith, preOrganismFlipRegistry, rebaseLedger, registry } from '../helpers/world';

const shipped = registry().manifest;
const REG = registryWith(
  {
    enabledSpecies: [...shipped.enabledSpecies, 'B09', 'B10', 'B11', 'B13'].sort(),
    enabledModules: [...shipped.enabledModules, 'E02'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'rivalry', 'signals'].sort() as SystemFlag[],
    enabledMaterials: [...shipped.enabledMaterials, 'M06', 'M07', 'M08'].sort(),
  },
  { allowUnimplemented: true },
);
const meta = { name: 'signals determinism', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const LONG = 900_000;

/** Write a field over a rectangle (test setup; activity fields carry no material, film and sugar are re-baselined). */
function patch(w: World, id: 'sGlow' | 'quencher' | 'rival' | 'film' | 'sugar', x0: number, y0: number, x1: number, y1: number, v: number): void {
  const f = w.fields[id]!;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f[cellIndex(x, y)] = v;
}

function signalDish(lid: 'open' | 'closed' = 'open'): World {
  const w = clearWater({ lid }, REG);
  paintRect(w, SUB_GEL, 76, 40, 100, 64);
  // 30 Lanterns in a crowd (water).
  for (let k = 0; k < 30; k++) place(w, 'B09', 30.5 + (k % 6), 60.5 + Math.floor(k / 6), { E: 70 });
  // 10 E02 carriers on a sugar patch that runs out; 4 also carry E03 and will rest.
  for (let k = 0; k < 10; k++) placeWith(w, 'B01', 50.5 + (k % 5), 80.5 + Math.floor(k / 5), k < 4 ? ['E02', 'E03'] : ['E02'], { E: 70 });
  // 10 Ramparts on gel with 20 targets around them.
  for (let k = 0; k < 10; k++) place(w, 'B13', 80.5 + 2 * (k % 5), 46.5 + 4 * Math.floor(k / 5), { E: 80 });
  const targets = ['B01', 'B10', 'B11'] as const;
  for (let k = 0; k < 20; k++) place(w, targets[k % 3]!, 79.5 + (k % 10), 48.5 + 2 * Math.floor(k / 10), { E: 70 });
  // M06 / M07 / M08 patches, film on a quarter of the dish, a sugar patch.
  patch(w, 'sGlow', 22, 52, 44, 74, 0.8);
  patch(w, 'quencher', 34, 52, 44, 74, 1.5);
  patch(w, 'sGlow', 42, 72, 62, 90, 0.8);
  patch(w, 'rival', 82, 52, 90, 58, 0.3);
  patch(w, 'film', 64, 64, 127, 127, 0.05);
  patch(w, 'sugar', 48, 78, 56, 83, 0.05);
  for (const id of ['sGlow', 'quencher', 'rival', 'film', 'sugar'] as const) markField(w, id);
  rebaseLedger(w);
  return w;
}

const fingerprint = (w: World) => ({ hash: stateHash(w), digest: trajectoryDigest(w, 'full') });

describe('signals and rivalry: determinism', () => {
  it(
    'run(400) equals four run(100); the dish glows and secretes',
    () => {
      const a = signalDish();
      const b = signalDish();
      run(a, 400);
      for (let k = 0; k < 4; k++) run(b, 100);
      expect(fingerprint(b)).toEqual(fingerprint(a));
      expect(a.events.totals.glowOn ?? 0).toBeGreaterThan(0);
      expect(a.ledger.energy.signal).toBeGreaterThan(0);
      expect(inactiveFieldsNonZero(a)).toEqual([]);
    },
    LONG,
  );

  it(
    'save at tick 777 → reload → run to 3,000 equals the uninterrupted run (glows go off, carriers rest)',
    async () => {
      const a = signalDish();
      run(a, 777);
      const { text } = await buildSaveFile(a, meta);
      const { world: b } = await loadSaveFile(text);
      expect(stateHash(b)).toBe(stateHash(a));
      run(a, 3000 - 777);
      run(b, 3000 - 777);
      expect(fingerprint(b)).toEqual(fingerprint(a));
      expect(a.events.totals.glowOff ?? 0).toBeGreaterThan(0);
      expect(a.events.totals.rest ?? 0).toBeGreaterThan(0); // the sugar ran out and E03 carriers rested
    },
    LONG,
  );

  it(
    '1× and 4× through DishHost reach the same hash at the same tick',
    async () => {
      const start = signalDish();
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
      const headless = signalDish();
      run(headless, 420);
      expect(stateHash(headless)).toBe(one.hash);
    },
    LONG,
  );
});

describe('signals and rivalry: conservation and the energy books', () => {
  it(
    'closed lid, no inputs, 10,000 ticks in 20 chunks: C and N reconcile (relErr < 1e-5, absolute residual < 1e-8)',
    () => {
      const w = signalDish('closed');
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
      expect(w.ledger.energy.signal).toBeGreaterThan(0);
      expect(worstAbs.c).toBeLessThan(1e-8);
      expect(worstAbs.n).toBeLessThan(1e-8);
      expect(worstAbs.m).toBeLessThan(1e-8);
    },
    LONG,
  );

  it(
    'energy identity: Δ Σ E of the living = earned − every other category, signal included',
    () => {
      const w = signalDish();
      const sumE = () => {
        const c = w.ents.cols;
        let s = 0;
        for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1) s += c.E[i]!;
        return s;
      };
      const before = { ...w.ledger.energy };
      const E0 = sumE();
      run(w, 2000);
      const keys = Object.keys(w.ledger.energy).sort() as (keyof typeof before)[];
      expect(keys).toContain('signal');
      let balance = 0;
      for (const k of keys) balance += (k === 'earned' ? 1 : -1) * (w.ledger.energy[k] - before[k]);
      expect(w.ledger.energy.signal - before.signal).toBeGreaterThan(0);
      expect(sumE() - E0).toBeCloseTo(balance, 6);
    },
    LONG,
  );
});

describe('NEUTRAL: shipped species keep their exact behavior under a registry that records signals and rivalry', () => {
  function shippedDish(reg: ContentRegistry): World {
    const w = clearWater({}, reg);
    patch(w, 'sugar', 40, 40, 90, 90, 0.4);
    markField(w, 'sugar');
    rebaseLedger(w);
    for (let k = 0; k < 6; k++) place(w, 'B01', 50.5 + 3 * k, 60.5);
    for (let k = 0; k < 3; k++) placeWith(w, 'B01', 50.5 + 3 * k, 70.5, ['E03']);
    for (let k = 0; k < 3; k++) placeWith(w, 'B06', 60.5 + 3 * k, 74.5, ['E03']);
    paintRect(w, SUB_GEL, 70, 40, 90, 50);
    for (let k = 0; k < 3; k++) place(w, 'B02', 72.5 + 3 * k, 45.5);
    for (let k = 0; k < 4; k++) place(w, 'B04', 50.5 + 4 * k, 50.5);
    for (let k = 0; k < 3; k++) place(w, 'A01', 80.5 + 2 * k, 80.5);
    place(w, 'P01', 64.5, 64.5);
    return w;
  }

  it(
    'byte-identical entity columns over 2,000 ticks (species by id); only the extra fields and the manifest differ',
    () => {
      // Both sides from the pre-organism-flip lists (D-0127): the shipped manifest records the subject itself since the flip.
      const a = shippedDish(preOrganismFlipRegistry());
      const b = shippedDish(preOrganismFlipRegistry({ species: ['B09', 'B10', 'B11', 'B13'], modules: ['E02'], systems: ['rivalry', 'signals'], materials: ['M06', 'M07', 'M08'] }));
      expect(a.fields.sGlow).toBeUndefined();
      expect(b.fields.sGlow).toBeDefined();
      expect(b.fields.rival).toBeDefined();
      const compare = () => {
        expect(b.ents.highWater).toBe(a.ents.highWater);
        const ca = a.ents.cols as unknown as Record<string, ArrayLike<number>>;
        const cb = b.ents.cols as unknown as Record<string, ArrayLike<number>>;
        for (const [name] of ENTITY_COLUMNS) {
          for (let i = 0; i < a.ents.highWater; i++) {
            if (name === 'species') {
              expect(b.species[cb.species![i]!]!.id).toBe(a.species[ca.species![i]!]!.id);
              continue;
            }
            if (!Object.is(ca[name]![i], cb[name]![i])) expect.fail(`tick ${a.tick}: column ${name} slot ${i}: ${ca[name]![i]} vs ${cb[name]![i]}`);
          }
        }
      };
      for (let k = 0; k < 20; k++) {
        run(a, 100);
        run(b, 100);
        compare();
      }
      expect(a.events.totals.birth ?? 0).toBeGreaterThan(0);
      expect(b.ledger.energy.signal).toBe(0);
      for (const id of ['sGlow', 'quencher', 'rival'] as const) expect(b.fields[id]!.every((v) => v === 0)).toBe(true);
    },
    LONG,
  );
});
