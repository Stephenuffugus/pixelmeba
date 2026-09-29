/**
 * P2.2 mutation presets (SPEC §8.3/§8.6, CT §12.8). A preset change during play is a timestamped
 * intervention in the command log (the tick it took effect and the setting it replaced), undoable
 * like any command, kept through save/reload and marked on the History timeline. Faster playback
 * never changes per-birth rates: the same dish run at 1× and at 4× records the change at the same
 * tick, and every birth drew its inheritance with the rate of the preset in effect when it was set
 * up — identical records, identical hashes.
 */
import { describe, expect, it } from 'vitest';
import { applyNow } from '../../src/sim/commands';
import { neutralGenome } from '../../src/sim/genome';
import { field } from '../../src/sim/lineage';
import {
  evolutionState,
  isMutationPreset,
  moduleGainAttemptChance,
  MUT_QUANT,
  MUT_QUANT_NEUTRAL,
  presetChanges,
  proposeDaughters,
  ratesFor,
} from '../../src/sim/mutation';
import { detFloat, STREAMS } from '../../src/sim/rng';
import { deserializeWorld, serializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { FakeClockHost } from '../helpers/host';
import { clearWater, place } from '../helpers/world';

const CHANGE_AT = 250;
const END = 600;

/**
 * A fast-growing dish so both sides of the change have many births: clear water with sugar
 * everywhere and 40 Sprinters (Standard evolution), handed to the host as a saved state.
 */
function sugarDish(): WorldState {
  const w = clearWater({ mutationPreset: 'standard', backgroundOverrides: { sugar: 0.5 }, seed: 104729 });
  for (let k = 0; k < 40; k++) place(w, 'B01', 40.5 + (k % 8) * 6, 40.5 + Math.floor(k / 8) * 10);
  return serializeWorld(w);
}

function playWithChange(speed: 1 | 4, state: WorldState): FakeClockHost {
  const h = new FakeClockHost();
  h.create('evo', { kind: 'state', state });
  h.setSpeed(speed);
  h.advanceTo(CHANGE_AT);
  const res = h.command('ui-evo', { kind: 'setMutationPreset', preset: 'accelerated' });
  expect(res).toMatchObject({ accepted: 1, presetFrom: 'standard' });
  h.advanceTo(END);
  return h;
}

/** Daughter index of a birth: its sibling is the neighbouring birth id with the same parent. */
function daughterIndex(w: World, b: number): number {
  const p = field(w.lineage, 'parent', b)!;
  return field(w.lineage, 'parent', b - 1) === p ? 1 : 0;
}

describe('P2.2 mutation presets', () => {
  it('the three presets carry the CT §12.8 per-daughter rates; developmental stays 0 before Phase 7', () => {
    expect(ratesFor('standard', false)).toEqual({
      quantitative: 0.08,
      preference: 0.02,
      module: 0.002,
      developmental: 0,
    });
    expect(ratesFor('accelerated', false)).toEqual({
      quantitative: 0.16,
      preference: 0.04,
      module: 0.01,
      developmental: 0,
    });
    expect(ratesFor('fixed', false)).toEqual({ quantitative: 0, preference: 0, module: 0, developmental: 0 });
    expect(ratesFor('standard', true).developmental).toBe(0.01);
    expect(ratesFor('accelerated', true).developmental).toBe(0.02);
    // SPEC §8.7: 1 − 0.999^1000 ≈ 63 % at Standard.
    expect(Math.round(moduleGainAttemptChance(ratesFor('standard', false), 1000) * 100)).toBe(63);
    expect(['standard', 'accelerated', 'fixed'].every(isMutationPreset)).toBe(true);
    expect(isMutationPreset('turbo')).toBe(false);
  });

  it('a change is a timestamped command: the tick it took effect and the setting it replaced', () => {
    const w = clearWater({ mutationPreset: 'standard' });
    run(w, 37);
    const cmd = applyNow(w, 'evo-1', { kind: 'setMutationPreset', preset: 'accelerated' });
    expect(cmd.targetTick).toBe(37);
    expect(cmd.result).toEqual({ accepted: 1, rejected: 0, presetFrom: 'standard' });
    expect(w.settings.mutationPreset).toBe('accelerated');
    expect(presetChanges(w)).toEqual([
      { tick: 37, seq: cmd.seq, commandId: 'evo-1', from: 'standard', to: 'accelerated' },
    ]);
    // The same setting again changes nothing and is not a change; an unknown one is refused.
    expect(applyNow(w, 'evo-2', { kind: 'setMutationPreset', preset: 'accelerated' }).result).toMatchObject({
      accepted: 0,
      note: 'unchanged',
    });
    const bad = applyNow(w, 'evo-3', { kind: 'setMutationPreset', preset: 'turbo' as never });
    expect(bad.result).toMatchObject({ accepted: 0, rejected: 1 });
    expect(w.settings.mutationPreset).toBe('accelerated');
    expect(presetChanges(w).map((c) => c.commandId)).toEqual(['evo-1']);
    // Only the real change is an intervention: the unchanged and refused choices mark nothing.
    expect(w.history.pendingInterventions).toBe(1);
    expect(evolutionState(w)).toMatchObject({
      preset: 'accelerated',
      founderMode: 'identical',
      rates: ratesFor('accelerated', false),
      developmentalEnabled: false,
    });
  });

  it('choosing the setting already in effect (e.g. a second quick tap) never marks the History timeline', () => {
    const w = clearWater({ mutationPreset: 'standard' });
    run(w, 5);
    const same = applyNow(w, 'tap-1', { kind: 'setMutationPreset', preset: 'standard' });
    expect(same.result).toMatchObject({ accepted: 0, rejected: 0, note: 'unchanged' });
    applyNow(w, 'tap-2', { kind: 'setMutationPreset', preset: 'nonsense' as never });
    expect(w.history.pendingInterventions).toBe(0);
    run(w, 20);
    expect(w.history.seconds.every((sec) => sec.interventions === 0)).toBe(true);
    expect(presetChanges(w)).toEqual([]);
    // A real change in the same dish is marked at its second.
    applyNow(w, 'tap-3', { kind: 'setMutationPreset', preset: 'fixed' });
    run(w, 20);
    expect(w.history.seconds.filter((sec) => sec.interventions > 0)).toHaveLength(1);
  });

  it('proposals made after a change draw with the new rates (16 % trait draws at Accelerated)', () => {
    const w = clearWater({ mutationPreset: 'standard' });
    const s = place(w, 'B01', 64.5, 64.5);
    applyNow(w, 'evo', { kind: 'setMutationPreset', preset: 'accelerated' });
    let quant = 0;
    const N = 20000;
    for (let pb = 1; pb <= N / 2; pb++) {
      w.ents.cols.birthId[s] = pb;
      w.ents.cols.genome[s] = w.genomes.intern(neutralGenome('B01'));
      const p = proposeDaughters(w, s);
      p.draws.forEach((d, k) => {
        const drawn = (d.flags & (MUT_QUANT | MUT_QUANT_NEUTRAL)) !== 0;
        expect(drawn).toBe(detFloat(w.seed, STREAMS.mutQuant, pb, 0, k, 0) < 0.16);
        if (drawn) quant++;
      });
    }
    expect(Math.abs(quant / N - 0.16)).toBeLessThan(0.01);
  });

  it('1× and 4× record the change at the same tick and draw every birth with the same per-birth rate', () => {
    const state = sugarDish();
    const slow = playWithChange(1, state);
    const fast = playWithChange(4, state);
    expect(fast.maxTicksPerPump).toBeGreaterThan(1); // 4× really ran several ticks per frame
    for (const h of [slow, fast]) {
      expect(h.tick).toBe(END);
      expect(presetChanges(h.world)).toEqual([
        {
          tick: CHANGE_AT,
          seq: presetChanges(h.world)[0]!.seq,
          commandId: 'ui-evo',
          from: 'standard',
          to: 'accelerated',
        },
      ]);
      expect(evolutionState(h.world).rates).toEqual(ratesFor('accelerated', false));
    }
    expect(fast.hash()).toBe(slow.hash());
    const a = slow.world.lineage;
    const b = fast.world.lineage;
    expect(b.mutFlags).toEqual(a.mutFlags);
    expect(b.genome).toEqual(a.genome);
    expect(b.birthTick).toEqual(a.birthTick);
    // Per-birth rate check against the draw oracle: births committed before the change used 8 %,
    // births whose parent was born after it (so its proposal was made after it) used 16 %.
    const w = slow.world;
    let before = 0;
    let after = 0;
    for (let bid = a.base; bid < a.base + a.parent.length; bid++) {
      const parent = field(a, 'parent', bid)!;
      if (parent === 0) continue;
      const tick = field(a, 'birthTick', bid)!;
      const parentTick = field(a, 'birthTick', parent);
      let rate: number;
      if (tick < CHANGE_AT) rate = 0.08;
      else if (parentTick !== undefined && parentTick >= CHANGE_AT) rate = 0.16;
      else continue; // set up before the change, born after it: its recorded draw came first
      const flags = field(a, 'mutFlags', bid)!;
      const drawn = (flags & (MUT_QUANT | MUT_QUANT_NEUTRAL)) !== 0;
      expect(drawn).toBe(detFloat(w.seed, STREAMS.mutQuant, parent, 0, daughterIndex(w, bid), 0) < rate);
      if (rate === 0.08) before++;
      else after++;
    }
    expect(before).toBeGreaterThan(20);
    expect(after).toBeGreaterThan(20);
  }, 120_000);

  it('Undo removes the change like any command; the History timeline marks it; save/reload keeps it', () => {
    const h = new FakeClockHost();
    h.create('evo-undo', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 101 });
    h.setSpeed(1);
    h.advanceTo(100);
    h.command('ui-evo', { kind: 'setMutationPreset', preset: 'fixed' });
    expect(h.world.settings.mutationPreset).toBe('fixed');
    h.advanceTo(130);
    // Marked on the History timeline: the second the change was made has an intervention.
    expect(h.world.history.seconds.some((s) => s.interventions > 0 && s.second >= 10 && s.second <= 11)).toBe(
      true,
    );
    // Saved and reloaded, the change is still in the log with its tick.
    const reloaded = deserializeWorld(JSON.parse(h.save()) as WorldState);
    expect(presetChanges(reloaded)).toEqual(presetChanges(h.world));
    expect(stateHash(reloaded)).toBe(h.hash());
    // Undo rewinds to before the change.
    h.host.handle({ type: 'undo', requestId: 999, dishId: 'evo-undo' });
    expect(h.world.tick).toBe(100);
    expect(h.world.settings.mutationPreset).toBe('standard');
    expect(presetChanges(h.world)).toEqual([]);
  });
});
