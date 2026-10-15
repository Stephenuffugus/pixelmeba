/**
 * Phase 5 wave 13, e3-traps: trap state survives save and reload at every transition this task writes (D-0108's
 * general round trip; g5-plan "Carry-overs"). At each point buildSaveFile → loadSaveFile is accepted, the loaded
 * world has the same stateHash, and 300 more ticks give the same stateHash as the uninterrupted run: the arm tick;
 * the hold-start tick; mid-hold (40 of 80); the tick before release; the release tick; mid-cooldown; the tick the
 * cooldown reaches 0; the re-capture tick; the owner's death with a held target; the target's drain death; the
 * owner's division while holding (T2); and an rc1 save loaded and saved (hash unchanged).
 *
 * TRAP is not yet in IMPLEMENTED_NATIVE_ABILITIES (the lead appends it at the wave 13 integration), so the import
 * would refuse these dishes ("this version of Pixelmeba cannot simulate"): this file mocks the list with exactly
 * TRAP appended (wave 13, e3-traps). The registry uses allowUnimplemented for the same reason.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_NATIVE_ABILITIES: readonly string[] }>();
  // Wave 13 (e3-traps): the ability this task implements.
  return { ...orig, IMPLEMENTED_NATIVE_ABILITIES: [...new Set([...orig.IMPLEMENTED_NATIVE_ABILITIES, 'TRAP'])].sort() };
});

import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { cellIndex, SUB_SEDIMENT } from '../../src/sim/grid';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { step, type StepHooks } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { RC1_SAVE_FILES, readRc1SaveText } from '../helpers/rc1-saves';
import { clearWater, fillField, place, rebaseLedger, registry } from '../helpers/world';

const shipped = registry().manifest;
const REG_T = registryWith({ enabledSpecies: [...shipped.enabledSpecies, 'F03'].sort() }, { allowUnimplemented: true });
const meta = { name: 'trap saves', savedAt: '2026-10-15T00:00:00Z', recipeId: null };

type State = Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>>;

function e213(f03: State = {}, p04: State = {}) {
  const w = clearWater({}, REG_T);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) if ((x + 0.5 - 64) ** 2 + (y + 0.5 - 64) ** 2 <= 225) w.grid.substrate[cellIndex(x, y)] = SUB_SEDIMENT;
  w.grid.geometryVersion++;
  fillField(w, 'broth', 0);
  const f = place(w, 'F03', 64.5, 64.5, { B: 2.8, N: 0.28, E: 80, ...f03 });
  const p = place(w, 'P04', 64.6, 64.5, { E: 100, ...p04 });
  rebaseLedger(w);
  return { w, f, p, c: w.ents.cols };
}

/** Keep the P04 (by birthId, so the hook names it in a loaded world too) in the trap's cell after stage 4. */
function keepIn(preyBirth: number): StepHooks {
  return {
    afterStage: (s, w) => {
      if (s !== 4) return;
      const c = w.ents.cols;
      for (let i = 0; i < w.ents.highWater; i++) {
        if (c.alive[i] !== 1 || c.birthId[i] !== preyBirth || c.heldBySlot[i]! >= 0) continue;
        c.x[i] = 64.6;
        c.y[i] = 64.5;
      }
      rebuildIndex(w);
    },
  };
}

interface Checkpoint {
  readonly label: string;
  readonly text: string;
  readonly hash: string;
  readonly tick: number;
}

/**
 * Run `w` under `hook` until `until(w)` is false or `max` ticks, saving after each tick for which `saveIf(w)`
 * names a label; then continue 300 ticks past the last save, recording each save's hash 300 ticks later.
 * Each save is then loaded and run 300 ticks: the hashes must match at load and 300 ticks later.
 */
async function checkpoints(w: World, hook: StepHooks, max: number, saveIf: (w: World) => string | null): Promise<string[]> {
  const saves: Checkpoint[] = [];
  const later = new Map<number, string>();
  let last = -1;
  for (let k = 0; k < max; k++) {
    step(w, hook);
    const label = saveIf(w);
    if (label !== null) {
      const { text } = await buildSaveFile(w, meta);
      saves.push({ label, text, hash: stateHash(w), tick: w.tick });
      last = w.tick;
    }
    if (last >= 0 && w.tick === last + 300) break;
    for (const s of saves) if (w.tick === s.tick + 300) later.set(s.tick, stateHash(w));
  }
  while (w.tick < last + 300) {
    step(w, hook);
    for (const s of saves) if (w.tick === s.tick + 300) later.set(s.tick, stateHash(w));
  }
  for (const s of saves) if (w.tick === s.tick + 300) later.set(s.tick, stateHash(w));
  const labels: string[] = [];
  for (const s of saves) {
    const { world: back } = await loadSaveFile(s.text);
    expect(stateHash(back), s.label).toBe(s.hash);
    for (let t = 0; t < 300; t++) step(back, hook);
    expect(back.tick, s.label).toBe(s.tick + 300);
    expect(stateHash(back), `${s.label}: 300 ticks after the reload`).toBe(later.get(s.tick));
    labels.push(s.label);
  }
  return labels;
}

describe('trap state round-trips at every transition (D-0108)', () => {
  it('arm, hold start, mid-hold, before release, release, mid-cooldown, cooldown 0, re-capture', { timeout: 600_000 }, async () => {
    const { w, p, c } = e213();
    const pBirth = c.birthId[p]!;
    const points: Record<number, string> = {
      1: 'arm (tick 0)',
      2: 'hold start (tick 1)',
      41: 'mid-hold (40 of 80)',
      80: 'the tick before release',
      81: 'the release tick',
      231: 'mid-cooldown',
      381: 'the cooldown reaches 0',
      382: 're-capture',
    };
    const labels = await checkpoints(w, keepIn(pBirth), 400, (ww) => points[ww.tick] ?? null);
    expect(labels).toEqual(Object.values(points));
    // The states saved were the ones named (checked on the uninterrupted world's events).
    const ev = (type: string) => w.events.ring.filter((e) => e.type === type).map((e) => e.tick);
    expect(ev('trapArmed')).toEqual([0]);
    expect(ev('trapHold').slice(0, 2)).toEqual([1, 381]);
    expect(ev('trapRelease')[0]).toBe(80);
  });

  it("the owner's death with a held target", { timeout: 600_000 }, async () => {
    const { w, f, p, c } = e213({ age: 1399.55 });
    const fBirth = c.birthId[f]!;
    const labels = await checkpoints(w, keepIn(c.birthId[p]!), 20, (ww) =>
      ww.events.ring.some((e) => e.type === 'death' && e.birthId === fBirth && e.tick === ww.tick - 1) ? 'owner died' : null,
    );
    expect(labels).toEqual(['owner died']);
    expect(w.events.ring.find((e) => e.type === 'trapRelease')).toMatchObject({ detail: { why: 'ownerDied' } });
  });

  it("the target's drain death", { timeout: 600_000 }, async () => {
    const { w, p, c } = e213({}, { B: 2.0005, N: 0.20005 });
    const pBirth = c.birthId[p]!;
    const labels = await checkpoints(w, {}, 20, (ww) =>
      ww.events.ring.some((e) => e.type === 'death' && e.birthId === pBirth && e.cause === R.DEATH_TRAP_DRAIN && e.tick === ww.tick - 1) ? 'target died' : null,
    );
    expect(labels).toEqual(['target died']);
  });

  it("the owner's division while holding (T2)", { timeout: 600_000 }, async () => {
    const { w, f, p, c } = e213();
    const hook = keepIn(c.birthId[p]!);
    step(w, hook);
    step(w, hook);
    expect(c.trapSlot[f]).toBe(p);
    c.B[f] = 4.5;
    c.N[f] = 0.45;
    c.E[f] = 95;
    c.age[f] = 50;
    c.H[f] = 100;
    rebaseLedger(w);
    const f03 = c.species[f]!;
    const labels = await checkpoints(w, hook, 30, (ww) =>
      ww.events.ring.some((e) => e.type === 'birth' && e.species === f03 && e.tick === ww.tick - 1) ? 'owner divided' : null,
    );
    expect(labels).toEqual(['owner divided']);
  });

  it('an rc1 save loaded and saved keeps its hash', async () => {
    for (const file of RC1_SAVE_FILES) {
      const { world } = await loadSaveFile(readRc1SaveText(file));
      const { text } = await buildSaveFile(world, meta);
      const { world: back } = await loadSaveFile(text);
      expect(stateHash(back), file).toBe(stateHash(world));
    }
  });
});
