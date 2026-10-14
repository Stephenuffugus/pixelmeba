/**
 * Phase 5 wave 12, e3-predation: the import's handling-progress rules (src/persistence/phase5State.ts
 * organismProblem; SPEC §14.3; D-0108, D-0122). The simulation keeps, at every tick boundary, need > 0 ⇒
 * 0 < progress < need and need 0 ⇒ progress 0 (src/sim/handling.ts), and only a HANDLING predator writes either
 * column, so the import refuses:
 *   - progress on an organism without HANDLING ("An organism is handling prey although it has no handling ability.");
 *   - progress without an attempt ("An organism's handling has no attempt.");
 *   - progress at or past the need ("An organism's handling is already complete.");
 *   - negative progress ("An organism's handling progress is negative.");
 * each on a living slot and on a held sample row, with "Nothing was loaded." and the open dish untouched (through
 * the worker's import path). A stale prey reference with an open attempt still loads (a later-stage death). The
 * rc1 and g2 corpora hold no handling progress (no v1.0 code writes it) and keep loading (rc1-replay, g2-replay).
 *
 * HANDLING (and RADIUS_CAPTURE, DETRITUS_FALLBACK) join IMPLEMENTED_NATIVE_ABILITIES at the wave 12 integration,
 * so this file mocks the list with exactly those three appended (wave 12, e3-predation), and the registry uses
 * allowUnimplemented.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_NATIVE_ABILITIES: readonly string[] }>();
  // Wave 12 (e3-predation): the three abilities this task implements.
  return { ...orig, IMPLEMENTED_NATIVE_ABILITIES: [...new Set([...orig.IMPLEMENTED_NATIVE_ABILITIES, 'DETRITUS_FALLBACK', 'HANDLING', 'RADIUS_CAPTURE'])].sort() };
});

import { buildSaveFile, loadSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import { applyNow } from '../../src/sim/commands';
import type { SystemFlag } from '../../src/sim/fields';
import { stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { FromWorker } from '../../src/worker/protocol';
import { registryWith } from '../helpers/registry';
import { clearWater, place, registry } from '../helpers/world';

const shipped = registry().manifest;
const REG = registryWith(
  {
    enabledSpecies: [...shipped.enabledSpecies, 'P05', 'P06', 'P07', 'P09', 'P10'].sort(),
    enabledSystems: [...shipped.enabledSystems, 'silicate'].sort() as SystemFlag[],
  },
  { allowUnimplemented: true },
);
const meta = { name: 'handling import', savedAt: '2026-10-14T00:00:00Z', recipeId: null };

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

/** A P10 mid-attempt on a P01 (5 of 10 contact ticks, positions pinned after stage 4), and a plain P01. */
function midAttempt(): { w: World; p10: number; prey: number; p01: number } {
  const w = clearWater({}, REG);
  const p10 = place(w, 'P10', 64.5, 64.5, { E: 50 });
  const prey = place(w, 'P01', 64.8, 64.5);
  const p01 = place(w, 'P01', 30.5, 64.5);
  for (let k = 0; k < 5; k++) {
    step(w, {
      afterStage: (s) => {
        if (s !== 4) return;
        w.ents.cols.x[p10] = 64.5;
        w.ents.cols.y[p10] = 64.5;
        w.ents.cols.x[prey] = 64.8;
        w.ents.cols.y[prey] = 64.5;
        rebuildIndex(w);
      },
    });
  }
  expect(w.ents.cols.handlingNeed[p10]).toBe(1);
  return { w, p10, prey, p01 };
}

const CASES = [
  ['progress on an organism without HANDLING', 'p01', { handlingProgress: 0.3 }, 'An organism is handling prey although it has no handling ability.'],
  ['progress without an attempt', 'p10', { handlingNeed: 0, handlingProgress: 0.3 }, "An organism's handling has no attempt."],
  ['progress equal to the need', 'p10', { handlingProgress: 1 }, "An organism's handling is already complete."],
  ['progress past the need', 'p10', { handlingProgress: 1.5 }, "An organism's handling is already complete."],
  ['negative progress', 'p10', { handlingProgress: -0.1 }, "An organism's handling progress is negative."],
] as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('the import refuses handling progress the simulation cannot produce (wave 12)', () => {
  it('control: a dish mid-attempt loads with an equal stateHash', async () => {
    const { w, p10 } = midAttempt();
    const { world } = await loadSaveFile(await saved(w));
    expect(stateHash(world)).toBe(stateHash(w));
    expect(world.ents.cols.handlingProgress[p10]).toBeCloseTo(0.5, 12);
  });

  for (const [name, who, edit, sentence] of CASES) {
    it(`on a living slot: ${name}; the open dish is untouched`, async () => {
      const d = midAttempt();
      const slot = who === 'p10' ? d.p10 : d.p01;
      for (const [col, v] of Object.entries(edit)) (d.w.ents.cols[col as 'handlingProgress'])[slot] = v;
      const text = await saved(d.w);
      await expectRefused(text, new RegExp(`^${escape(sentence)}`));
      await refusedByHost(text, sentence);
    });

    it(`on a held sample row: ${name}`, async () => {
      const d = midAttempt();
      // A Life sample holding the edited organism (the P10's closure takes its prey too).
      const [x, y] = who === 'p10' ? [64.5, 64.5] : [30.5, 64.5];
      const birth = d.w.ents.cols.birthId[who === 'p10' ? d.p10 : d.p01]!;
      expect(applyNow(d.w, 'take', { kind: 'sampleTake', x, y, radius: 1, mode: 'life' }).result!.accepted).toBeGreaterThan(0);
      await expect(loadSaveFile(await saved(d.w))).resolves.toBeDefined(); // control: the held sample as taken loads
      const row = d.w.sample!.rows.find((r) => r.cols.birthId === birth)!;
      Object.assign(row.cols as Record<string, number>, edit);
      await expectRefused(await saved(d.w), new RegExp(`^The held sample cannot be loaded\\. ${escape(sentence)}`));
    });
  }

  it('a stale prey reference with an open attempt still loads (its prey died in a later stage)', async () => {
    const { w, p10, prey } = midAttempt();
    const birth = w.ents.cols.birthId[prey]!;
    w.ents.free(prey); // as a stage 7 death would leave it (test state)
    expect(w.ents.refValid(w.ents.cols.preySlot[p10]!, w.ents.cols.preyBirthId[p10]!)).toBe(false);
    expect(w.ents.cols.preyBirthId[p10]).toBe(birth);
    const { world } = await loadSaveFile(await saved(w));
    expect(stateHash(world)).toBe(stateHash(w));
    // And the next tick ends the attempt as 'target' in both.
    step(world);
    step(w);
    expect(stateHash(world)).toBe(stateHash(w));
    expect(w.events.ring.filter((e) => e.type === 'handlingBreak').map((e) => e.detail!.why)).toEqual(['target']);
  });
});
