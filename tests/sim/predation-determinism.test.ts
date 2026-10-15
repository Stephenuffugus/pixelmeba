/**
 * Phase 5 wave 12, e3-predation: determinism, conservation and neutrality of radius capture, handling and the
 * detritus fallback (CLAUDE.md "Determinism", "Conservation"; SPEC §3.2 row 5, §3.3, §7.3; D-0103, D-0122).
 *
 * The dish: a line of P06 along a stone edge among 200 B01 / B03 / B05 on sugar; 6 P10 among 30 P01, 10 P05 and
 * 10 P07; 8 P09 with A02 and Y02 and detritus patches; silicate for the P05 shells.
 *   - run(400) equals four run(100) (stateHash and the 'full' trajectory digest), also with A03 / A04 added;
 *   - buildSaveFile at tick 777 → loadSaveFile → run to 3,000 equals the uninterrupted run;
 *   - 1× and 4× through DishHost (the worker host) reach the same hash at the same tick;
 *   - closed lid, no inputs, 10,000 ticks in 20 chunks: checkLedger relErr < 1e-5 for C, N and mineral (P05
 *     shells go to grit at capture) and the absolute residual under 1e-8;
 *   - NEUTRAL: a dish of shipped predators and prey (P01–P04, B01–B08) under the shipped registry and under a
 *     registry recording the Phase 5 predators (none placed) keeps identical entity columns over 2,000 ticks
 *     (species compared by id: the registries number species differently).
 *
 * P09's prey here are A02 and Y02 for the import parts: A03 (LOW_LIGHT_CURVE) and A04 (MIXOTROPHY) belong to
 * e2-light-algae this wave, and this file's mock appends only its own three abilities; the in-memory check adds them.
 * HANDLING, RADIUS_CAPTURE and DETRITUS_FALLBACK are not yet in IMPLEMENTED_NATIVE_ABILITIES (the lead appends
 * them at the wave 12 integration): the import would refuse these dishes, so the list is mocked with exactly
 * those three appended (wave 12, e3-predation); the registries use allowUnimplemented for the same reason.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_NATIVE_ABILITIES: readonly string[] }>();
  // Wave 12 (e3-predation): the three abilities this task implements.
  return { ...orig, IMPLEMENTED_NATIVE_ABILITIES: [...new Set([...orig.IMPLEMENTED_NATIVE_ABILITIES, 'DETRITUS_FALLBACK', 'HANDLING', 'RADIUS_CAPTURE'])].sort() };
});

import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { ENTITY_COLUMNS } from '../../src/sim/entities';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex, ST_STONE } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { markField, updateDerived } from '../../src/sim/transport';
import { speciesIndex, type World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { Speed } from '../../src/worker/protocol';
import { registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';
import { clearWater, place, preOrganismFlipRegistry, rebaseLedger, registry } from '../helpers/world';

const shipped = registry().manifest;
const regWith = (extra: readonly string[]) =>
  registryWith(
    {
      enabledSpecies: [...shipped.enabledSpecies, ...extra].sort(),
      enabledSystems: [...shipped.enabledSystems, 'silicate'].sort() as SystemFlag[],
    },
    { allowUnimplemented: true },
  );
/** The Phase 5 predators and A02 (all importable under this file's mock). */
const REG = regWith(['A02', 'P05', 'P06', 'P07', 'P09', 'P10']);
/** REG plus A03 and A04 (e2-light-algae's abilities): in-memory runs only. */
const REG_ALGAE = regWith(['A02', 'A03', 'A04', 'P05', 'P06', 'P07', 'P09', 'P10']);
const meta = { name: 'predation determinism', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const LONG = 900_000;

function patch(w: World, id: 'sugar' | 'detritus' | 'detritusN' | 'silicate' | 'broth', x0: number, y0: number, x1: number, y1: number, v: number): void {
  const f = w.fields[id]!;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) f[cellIndex(x, y)] = v;
  markField(w, id);
}

function predationDish(reg: ContentRegistry = REG, lid: 'open' | 'closed' = 'open'): World {
  const w = clearWater({ lid }, reg);
  // A stone wall at x = 40, y 48–72: the cells x = 41 are stone-edge water a P06 attaches to.
  for (let y = 48; y <= 72; y++) w.grid.structure[cellIndex(40, y)] = ST_STONE;
  w.grid.geometryVersion++;
  updateDerived(w);
  for (let y = 50; y <= 70; y += 2) place(w, 'P06', 41.5, y + 0.5, { E: 60 });
  // 200 bacteria on a sugar patch beside the line.
  patch(w, 'sugar', 41, 46, 60, 74, 0.3);
  const bact = ['B01', 'B03', 'B05'] as const;
  for (let k = 0; k < 200; k++) place(w, bact[k % 3]!, 41.8 + (k % 20) * 0.9, 47.5 + Math.floor(k / 20) * 2.6, { E: 60 });
  // 6 P10 among 30 P01, 10 P05 and 10 P07 (and bacteria for those to eat), silicate for the shells.
  patch(w, 'silicate', 66, 36, 92, 62, 0.5);
  patch(w, 'sugar', 66, 36, 92, 62, 0.2);
  for (let k = 0; k < 40; k++) place(w, 'B01', 67.5 + (k % 10) * 2.5, 37.5 + Math.floor(k / 10) * 6, { E: 60 });
  for (let k = 0; k < 6; k++) place(w, 'P10', 70.5 + 3 * k, 49.5, { E: 50 });
  for (let k = 0; k < 30; k++) place(w, 'P01', 67.5 + (k % 10) * 2.4, 44.5 + Math.floor(k / 10) * 4, { E: 60 });
  for (let k = 0; k < 10; k++) place(w, 'P05', 68.5 + 2.2 * k, 55.5, { E: 60 });
  for (let k = 0; k < 10; k++) place(w, 'P07', 68.5 + 2.2 * k, 58.5, { E: 60 });
  // 8 P09 with algae and Creambud (broth for it) and detritus patches.
  patch(w, 'detritus', 50, 82, 58, 88, 0.6);
  patch(w, 'detritusN', 50, 82, 58, 88, 0.06);
  patch(w, 'detritus', 72, 84, 76, 92, 0.3);
  patch(w, 'detritusN', 72, 84, 76, 92, 0.03);
  patch(w, 'broth', 60, 80, 80, 94, 0.2);
  for (let k = 0; k < 8; k++) place(w, 'P09', 52.5 + 3 * k, 86.5, { E: 50 });
  const algae = reg === REG_ALGAE ? (['A02', 'Y02', 'A03', 'A04'] as const) : (['A02', 'Y02'] as const);
  for (let k = 0; k < 24; k++) place(w, algae[k % algae.length]!, 60.5 + (k % 8) * 2, 82.5 + Math.floor(k / 8) * 3);
  rebaseLedger(w);
  return w;
}

const fingerprint = (w: World) => ({ hash: stateHash(w), digest: trajectoryDigest(w, 'full') });

/** Captures by predator species id (from the event ring's totals is not per species: count the ring). */
function capturesBy(w: World, id: string): number {
  const k = speciesIndex(w, id);
  return w.events.ring.filter((e) => e.type === 'capture' && e.species === k).length;
}

describe('radius capture, handling and the detritus fallback: determinism', () => {
  it(
    'run(400) equals four run(100) (also with A03 and A04); P06 and P10 capture, P10 handles',
    () => {
      for (const reg of [REG, REG_ALGAE]) {
        const a = predationDish(reg);
        const b = predationDish(reg);
        run(a, 400);
        for (let k = 0; k < 4; k++) run(b, 100);
        expect(fingerprint(b)).toEqual(fingerprint(a));
        expect(a.events.totals.handlingStart ?? 0).toBeGreaterThan(0);
        expect(a.events.totals.capture ?? 0).toBeGreaterThan(0);
        expect(capturesBy(a, 'P06')).toBeGreaterThan(0);
      }
    },
    LONG,
  );

  it(
    'save at tick 777 → reload → run to 3,000 equals the uninterrupted run',
    async () => {
      const a = predationDish();
      run(a, 777);
      const { text } = await buildSaveFile(a, meta);
      const { world: b } = await loadSaveFile(text);
      expect(stateHash(b)).toBe(stateHash(a));
      run(a, 3000 - 777);
      run(b, 3000 - 777);
      expect(fingerprint(b)).toEqual(fingerprint(a));
      expect(a.events.totals.handlingBreak ?? 0).toBeGreaterThan(0);
    },
    LONG,
  );

  it(
    '1× and 4× through DishHost reach the same hash at the same tick',
    async () => {
      const start = predationDish();
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
      const headless = predationDish();
      run(headless, 420);
      expect(stateHash(headless)).toBe(one.hash);
    },
    LONG,
  );
});

describe('radius capture, handling and the detritus fallback: conservation', () => {
  it(
    'closed lid, no inputs, 10,000 ticks in 20 chunks: C, N and mineral reconcile (relErr < 1e-5, absolute residual < 1e-8)',
    () => {
      const w = predationDish(REG, 'closed');
      const inputs = { ...w.ledger.inputs };
      const worstAbs = { c: 0, n: 0, m: 0 };
      let handled = 0;
      for (let k = 0; k < 20; k++) {
        run(w, 500);
        const check = checkLedger(w);
        expect(check.ok, `tick ${w.tick}: ${JSON.stringify(check)}`).toBe(true);
        expect(check.relErr.c).toBeLessThan(1e-5);
        expect(check.relErr.n).toBeLessThan(1e-5);
        expect(check.relErr.m).toBeLessThan(1e-5);
        for (const e of ['c', 'n', 'm'] as const) worstAbs[e] = Math.max(worstAbs[e], Math.abs(check.actual[e] - check.expected[e]));
        handled += w.events.ring.filter((e) => e.type === 'capture' && e.detail?.handled !== undefined && e.tick >= w.tick - 500).length;
      }
      expect(w.tick).toBe(10000);
      expect(w.ledger.inputs).toEqual(inputs);
      expect(handled).toBeGreaterThan(0);
      expect(worstAbs.c).toBeLessThan(1e-8);
      expect(worstAbs.n).toBeLessThan(1e-8);
      expect(worstAbs.m).toBeLessThan(1e-8);
    },
    LONG,
  );
});

describe('NEUTRAL: shipped predators and prey keep their exact behavior under a registry that records the Phase 5 predators', () => {
  function shippedDish(reg: ContentRegistry): World {
    const w = clearWater({}, reg);
    patch(w, 'sugar', 40, 40, 90, 90, 0.4);
    rebaseLedger(w);
    for (let k = 0; k < 40; k++) place(w, (['B01', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08'] as const)[k % 7]!, 45.5 + (k % 10) * 4, 50.5 + Math.floor(k / 10) * 6);
    for (let k = 0; k < 4; k++) place(w, 'B02', 70.5 + 2 * k, 75.5);
    for (let k = 0; k < 3; k++) place(w, 'P01', 55.5 + 6 * k, 60.5, { E: 50 });
    for (let k = 0; k < 2; k++) place(w, 'P02', 50.5 + 10 * k, 70.5, { E: 50 });
    for (let k = 0; k < 2; k++) place(w, 'P03', 60.5 + 10 * k, 45.5, { E: 50 });
    place(w, 'P04', 64.5, 80.5, { E: 50 });
    return w;
  }

  it(
    'byte-identical entity columns over 2,000 ticks (species by id)',
    () => {
      // Both sides from the pre-organism-flip lists (D-0127): the shipped manifest records the subject itself since the flip.
      const a = shippedDish(preOrganismFlipRegistry());
      const b = shippedDish(preOrganismFlipRegistry({ species: ['A02', 'A03', 'A04', 'P05', 'P06', 'P07', 'P09', 'P10'], systems: ['silicate'] }));
      expect(a.fields.silicate).toBeUndefined();
      expect(b.fields.silicate).toBeDefined();
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
      expect(a.events.totals.capture ?? 0).toBeGreaterThan(0);
      expect(b.events.totals.handlingStart ?? 0).toBe(0);
    },
    LONG,
  );
});
