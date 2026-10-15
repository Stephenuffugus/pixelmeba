/**
 * Phase 5 wave 13, e3-traps: the import's trap rules (src/persistence/phase5State.ts; SPEC §14.3; D-0108, D-0124).
 * The simulation keeps, at every tick boundary (src/sim/traps.ts): every trap state exists only once the trap is
 * built (reserve C 0.20 > 0); a hold time in (0, 8) only while holding; a wait in [0, 30], never while holding; and
 * a trap holds only a TRAP_TARGETS organism (P04, CT §3.3). So the import refuses:
 *   - "A trap acts without a reserve." (holding, a hold time, a wait or reserve N with reserve C 0);
 *   - "A trap's hold time is invalid." (a hold time without a target, or ≥ 8 s);
 *   - "A trap's wait is invalid." (a wait over 30 s, or any wait while holding);
 *   - "A trap holds an organism it cannot catch." (the held organism is not a trap target);
 * each on a living slot and on a held sample row, with "Nothing was loaded." and the open dish untouched (through
 * the worker's import path). A holding pair with its reserve, a cooling trap and an armed trap, all from the real
 * simulation, load with an equal stateHash. A held organism outside its trap's cell is not refused (a Transfer can
 * round a position across a cell edge, the D-0118 channel finding). The rc1 and g2 corpora hold no trap state and
 * keep loading (rc1-replay, g2-replay).
 *
 * TRAP joins IMPLEMENTED_NATIVE_ABILITIES at the wave 13 integration, so this file mocks the list with exactly TRAP
 * appended (wave 13, e3-traps), and the registry uses allowUnimplemented.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_NATIVE_ABILITIES: readonly string[] }>();
  // Wave 13 (e3-traps): the ability this task implements.
  return { ...orig, IMPLEMENTED_NATIVE_ABILITIES: [...new Set([...orig.IMPLEMENTED_NATIVE_ABILITIES, 'TRAP'])].sort() };
});

import { buildSaveFile, loadSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import { applyNow } from '../../src/sim/commands';
import { cellIndex, SUB_SEDIMENT } from '../../src/sim/grid';
import { stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { FromWorker } from '../../src/worker/protocol';
import { registryWith } from '../helpers/registry';
import { clearWater, fillField, place, rebaseLedger, registry } from '../helpers/world';

const shipped = registry().manifest;
const REG = registryWith({ enabledSpecies: [...shipped.enabledSpecies, 'F03'].sort() }, { allowUnimplemented: true });
const meta = { name: 'trap import', savedAt: '2026-10-15T00:00:00Z', recipeId: null };

async function saved(w: World): Promise<string> {
  return (await buildSaveFile(w, meta)).text;
}

async function expectRefused(text: string, sentence: RegExp): Promise<void> {
  const err = await parseSaveFile(text).then(
    () => null,
    (e: unknown) => e as Error & { kind?: string },
  );
  expect(err, `expected a refusal matching ${sentence}`).not.toBeNull();
  expect(err!.kind).toBe('integrity');
  expect(err!.message).toMatch(sentence);
  expect(err!.message).toMatch(/ Nothing was loaded\.$/);
}

async function reply(out: FromWorker[], requestId: number): Promise<FromWorker> {
  for (let k = 0; k < 400; k++) {
    const m = out.find((x) => 'requestId' in x && x.requestId === requestId);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`no reply to request ${requestId}`);
}

/** Through the worker's import path: an error reply naming `message`, no new dish, the open dish untouched. */
async function refusedByHost(text: string, message: string): Promise<void> {
  const out: FromWorker[] = [];
  const host = new DishHost(REG, (m) => out.push(m), { now: () => 0 });
  host.handle({ type: 'create', requestId: 1, dishId: 'open', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
  const before = stateHash(host.world('open')!);
  const tick = host.world('open')!.tick;
  host.handle({ type: 'importDish', requestId: 2, text, newDishId: 'imported' });
  const r = await reply(out, 2);
  expect(r).toMatchObject({ type: 'error', request: 'importDish' });
  expect(r.type === 'error' ? r.message : '').toContain(message);
  expect(host.world('imported')).toBeNull();
  expect(host.world('open')!.tick).toBe(tick);
  expect(stateHash(host.world('open')!)).toBe(before);
  expect(host.activeDishId).toBe('open');
}

/**
 * The E213 dish after `ticks` (default 11: the trap at (64.5, 64.5) has held its P04 for 10 ticks) with a second
 * F03 at (54.5, 64.5) whose trap is armed and empty, and a B01 sharing the holding trap's cell.
 */
function dish(ticks = 11) {
  const w = clearWater({}, REG);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) if ((x + 0.5 - 64) ** 2 + (y + 0.5 - 64) ** 2 <= 225) w.grid.substrate[cellIndex(x, y)] = SUB_SEDIMENT;
  w.grid.geometryVersion++;
  fillField(w, 'broth', 0);
  const f = place(w, 'F03', 64.5, 64.5, { B: 2.8, N: 0.28, E: 80 });
  const p = place(w, 'P04', 64.6, 64.5, { E: 100 });
  const armed = place(w, 'F03', 54.5, 64.5, { B: 2.8, N: 0.28, E: 80 });
  rebaseLedger(w);
  const c = w.ents.cols;
  const pBirth = c.birthId[p]!;
  for (let k = 0; k < ticks; k++)
    step(w, {
      afterStage: (s) => {
        if (s !== 4 || !w.ents.refValid(p, pBirth) || c.heldBySlot[p]! >= 0) return;
        c.x[p] = 64.6;
        c.y[p] = 64.5;
        rebuildIndex(w);
      },
    });
  const b01 = place(w, 'B01', 64.3, 64.7);
  return { w, f, p, armed, b01, c };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type Who = 'f' | 'armed';
type Edit = Partial<Record<'trapReserveC' | 'trapReserveN' | 'trapTimer' | 'trapCooldown', number>>;
const CASES: readonly (readonly [string, Who, Edit, string])[] = [
  ['holding without a reserve', 'f', { trapReserveC: 0, trapReserveN: 0 }, 'A trap acts without a reserve.'],
  ['a wait without a reserve', 'armed', { trapReserveC: 0, trapReserveN: 0, trapCooldown: 5 }, 'A trap acts without a reserve.'],
  ['reserve nutrient without carbon', 'armed', { trapReserveC: 0 }, 'A trap acts without a reserve.'],
  ['a hold time without a target', 'armed', { trapTimer: 0.5 }, "A trap's hold time is invalid."],
  ['a hold time of 8 s', 'f', { trapTimer: 8 }, "A trap's hold time is invalid."],
  ['a wait over 30 s', 'armed', { trapCooldown: 30.5 }, "A trap's wait is invalid."],
  ['a wait while holding', 'f', { trapCooldown: 5 }, "A trap's wait is invalid."],
];

describe('the import accepts the trap states the simulation writes (wave 13)', () => {
  it('a holding pair with its reserve, and an armed trap, load with an equal stateHash', async () => {
    const { w, f, p, armed, c } = dish();
    expect(c.trapSlot[f]).toBe(p);
    expect(c.trapReserveC[f]).toBe(0.2);
    expect(c.trapSlot[armed]).toBe(-1);
    expect(c.trapReserveC[armed]).toBe(0.2);
    const { world } = await loadSaveFile(await saved(w));
    expect(stateHash(world)).toBe(stateHash(w));
  });

  it('a cooling trap loads, and a held organism outside its trap’s cell is not refused', async () => {
    const { w, f, c } = dish(100);
    expect(c.trapCooldown[f]).toBeGreaterThan(0);
    const { world } = await loadSaveFile(await saved(w));
    expect(stateHash(world)).toBe(stateHash(w));
    const d = dish();
    d.c.x[d.p] = 65.0000000001; // as a transfer's x + dx can round across an edge (D-0118)
    await expect(loadSaveFile(await saved(d.w))).resolves.toBeDefined();
  });
});

describe('the import refuses trap state the simulation cannot produce (wave 13)', () => {
  for (const [name, who, edit, sentence] of CASES) {
    it(`on a living slot: ${name}; the open dish is untouched`, async () => {
      const d = dish();
      Object.entries(edit).forEach(([col, v]) => (d.c[col as keyof Edit][d[who]] = v));
      const text = await saved(d.w);
      await expectRefused(text, new RegExp(`^${escape(sentence)}`));
      await refusedByHost(text, sentence);
    });

    it(`on a held sample row: ${name}`, async () => {
      const d = dish();
      const x = who === 'f' ? 64.5 : 54.5;
      const birth = d.c.birthId[d[who]]!;
      expect(applyNow(d.w, 'take', { kind: 'sampleTake', x, y: 64.5, radius: 1, mode: 'life' }).result!.accepted).toBeGreaterThan(0);
      await expect(loadSaveFile(await saved(d.w))).resolves.toBeDefined(); // control: the held sample as taken loads
      const row = d.w.sample!.rows.find((r) => r.cols.birthId === birth)!;
      Object.assign(row.cols as Record<string, number>, edit);
      await expectRefused(await saved(d.w), new RegExp(`^The held sample cannot be loaded\\. ${escape(sentence)}`));
    });
  }

  it('on a living slot: a trap holding an organism it cannot catch (a B01); the open dish is untouched', async () => {
    const { w, armed, b01, c } = dish();
    c.x[b01] = 54.6; // in the armed trap's cell, as if caught (not reachable: B01 is not a trap target)
    c.trapSlot[armed] = b01;
    c.trapBirthId[armed] = c.birthId[b01]!;
    c.trapTimer[armed] = 0.5;
    c.heldBySlot[b01] = armed;
    c.heldByBirthId[b01] = c.birthId[armed]!;
    const text = await saved(w);
    const sentence = 'A trap holds an organism it cannot catch.';
    await expectRefused(text, new RegExp(`^${escape(sentence)}`));
    await refusedByHost(text, sentence);
  });

  it('on a held sample row: a trap holding an organism it cannot catch', async () => {
    const { w, armed, b01, c } = dish();
    c.x[b01] = 54.6;
    rebuildIndex(w);
    expect(applyNow(w, 'take', { kind: 'sampleTake', x: 54.5, y: 64.5, radius: 1, mode: 'life' }).result!.accepted).toBe(2);
    await expect(loadSaveFile(await saved(w))).resolves.toBeDefined(); // control
    const rowA = w.sample!.rows.find((r) => r.slot === armed)!.cols as Record<string, number>;
    const rowB = w.sample!.rows.find((r) => r.slot === b01)!.cols as Record<string, number>;
    rowA.trapSlot = b01;
    rowA.trapBirthId = rowB.birthId!;
    rowA.trapTimer = 0.5;
    rowB.heldBySlot = armed;
    rowB.heldByBirthId = rowA.birthId!;
    await expectRefused(await saved(w), /^The held sample cannot be loaded\. A trap holds an organism it cannot catch\./);
  });

  it('a run of the cooling dish stays loadable at every 25th tick through hold, release and wait', async () => {
    const { w } = dish(0);
    for (let k = 0; k < 16; k++) {
      run(w, 25);
      await expect(loadSaveFile(await saved(w))).resolves.toBeDefined();
    }
  });
});
