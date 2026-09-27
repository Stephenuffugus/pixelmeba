/**
 * G1 fixture: deterministic state (BUILD_DIRECTIVE G1 gate; SPEC §3.2, §15). A command log with
 * placements (Add Life) and Feed doses, issued through the paths the game uses, always reproduces
 * the same state hash:
 *  - through the worker host (DishHost with a fake clock): a player session at 4× with irregular
 *    frame timing, and the host's own command log replayed at 1× at the logged ticks;
 *  - headlessly: the same log replayed through the stage-1 command queue in 1-tick and 4-tick
 *    chunks (observed between chunks), and as paused edits (applyNow) at the logged ticks;
 *  - across a mid-run save → reload → continue, through the host (save → new dish from state) and
 *    through the real save-file path (buildSaveFile → loadSaveFile) with commands still pending.
 */
import { describe, expect, it } from 'vitest';
import { applyNow, queueCommand, type CommandPayload, type CommandResult } from '../../src/sim/commands';
import { checkLedger } from '../../src/sim/ledger';
import { realizeRecipe } from '../../src/sim/recipes';
import { serializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { FakeClockHost } from '../helpers/host';
import { registry } from '../helpers/world';

const RECIPE = 'FIRST_DISH_V1';
const END = 320;

/** What the player does, in dish ticks at which the gesture is first possible. */
const PLAYER: ReadonlyArray<{ at: number; id: string; payload: CommandPayload; paused?: boolean }> = [
  // Before pressing play: Add Life (tap) at the edge of the sugar patch.
  { at: 0, id: 'add-sprinters', payload: { kind: 'inoculate', speciesId: 'B01', x: 54.3, y: 66.8, radius: 3, count: 6 } },
  // Feed: a painted stroke of sugar (one gesture, one command).
  { at: 31, id: 'feed-stroke', payload: { kind: 'deposit', materialId: 'SUGAR', points: [[60, 80], [70, 82], [80, 80]], radius: 3, dose: 0.5 } },
  { at: 77, id: 'add-amoeba', payload: { kind: 'inoculate', speciesId: 'P01', x: 48.5, y: 64.5, radius: 3, count: 2 } },
  // Pause, feed with a single tap, resume.
  { at: 122, id: 'feed-tap', payload: { kind: 'deposit', materialId: 'SUGAR', points: [[50.3, 60.7]], radius: 2, dose: 0.1 }, paused: true },
  { at: 169, id: 'add-recyclers', payload: { kind: 'inoculate', speciesId: 'B04', x: 66.5, y: 48.5, radius: 3, count: 5 } },
  { at: 233, id: 'feed-starch', payload: { kind: 'deposit', materialId: 'STARCH', points: [[66, 64]], radius: 2, dose: 0.5 } },
  { at: 271, id: 'add-crumbsmiths', payload: { kind: 'inoculate', speciesId: 'B06', x: 70.9, y: 60.2, radius: 2, count: 3 } },
];

/** Irregular frame durations (ms): at 4× these run 0.64 to 10 ticks per frame. */
const FRAMES_MS = [100, 37, 250, 16, 63, 180, 45];

interface LoggedCommand {
  readonly id: string;
  readonly tick: number;
  readonly payload: CommandPayload;
  readonly result: CommandResult | null;
}

interface Session {
  readonly log: readonly LoggedCommand[];
  readonly acks: ReadonlyArray<CommandResult | null>;
  readonly finalTick: number;
  readonly hash: string;
  readonly maxTicksPerPump: number;
  readonly births: number;
  readonly alive: number;
}

function commandLog(w: World): LoggedCommand[] {
  return w.commands.log.map((c) => ({ id: c.commandId, tick: c.targetTick, payload: c.payload, result: c.result ?? null }));
}

let session4x: Session | null = null;

/** A player session on the worker host at 4×, gestures delivered between irregular frames. */
function playerSessionAt4x(): Session {
  if (session4x) return session4x;
  const h = new FakeClockHost();
  h.create('garden', { kind: 'recipe', recipeId: RECIPE });
  const acks: Array<CommandResult | null> = [];
  let next = 0;
  const deliverDue = () => {
    while (next < PLAYER.length && PLAYER[next]!.at <= h.tick) {
      const g = PLAYER[next++]!;
      if (g.paused) h.setSpeed(0);
      acks.push(h.command(g.id, g.payload));
      if (g.paused) h.setSpeed(4);
    }
  };
  deliverDue();
  h.setSpeed(4);
  for (let f = 0; h.tick < END; f++) {
    deliverDue();
    h.pump(FRAMES_MS[f % FRAMES_MS.length]!);
  }
  h.setSpeed(0);
  expect(next).toBe(PLAYER.length);
  expect(h.errors()).toEqual([]);
  const w = h.world;
  session4x = {
    log: commandLog(w),
    acks,
    finalTick: w.tick,
    hash: h.hash(),
    maxTicksPerPump: h.maxTicksPerPump,
    births: w.events.totals.birth ?? 0,
    alive: w.ents.count,
  };
  return session4x;
}

/** Deliver logged commands on a host at exactly their logged ticks, running until `until`. */
function playLog(h: FakeClockHost, log: readonly LoggedCommand[], start: number, until: number, acks: Array<CommandResult | null>): number {
  let next = start;
  for (;;) {
    while (next < log.length && log[next]!.tick === h.tick) {
      const c = log[next++]!;
      acks.push(h.command(c.id, c.payload));
    }
    if (h.tick >= until) return next;
    if (next < log.length && log[next]!.tick < h.tick) throw new Error(`missed command ${log[next]!.id} at tick ${log[next]!.tick}`);
    h.advanceTo(next < log.length ? Math.min(until, log[next]!.tick) : until);
  }
}

/** A fresh headless world with the whole log queued for its target ticks (the replay path). */
function queuedWorld(log: readonly LoggedCommand[]): World {
  const w = realizeRecipe(registry(), RECIPE);
  for (const c of log) queueCommand(w, c.id, c.payload, c.tick);
  return w;
}

describe('G1 deterministic state — worker host at 1× vs 4×', () => {
  it('a 4× session with irregular frames has a command log with placements and feeds that all took effect', () => {
    const s = playerSessionAt4x();
    expect(s.log.map((c) => c.id)).toEqual(PLAYER.map((g) => g.id));
    expect(s.log.map((c) => c.payload.kind)).toEqual(['inoculate', 'deposit', 'inoculate', 'deposit', 'inoculate', 'deposit', 'inoculate']);
    for (const c of s.log) expect(c.result?.accepted ?? 0).toBeGreaterThan(0);
    expect(s.log.map((c) => c.result)).toEqual(s.acks);
    // Gestures landed at whatever tick boundary the frame timing gave; the log records it.
    for (let k = 0; k < PLAYER.length; k++) expect(s.log[k]!.tick).toBeGreaterThanOrEqual(PLAYER[k]!.at);
    // 4× really batched several ticks into single frames.
    expect(s.maxTicksPerPump).toBeGreaterThanOrEqual(8);
    expect(s.finalTick).toBeGreaterThanOrEqual(END);
    console.info(
      `deterministic-state: 4× session → tick ${s.finalTick}, hash ${s.hash}, alive ${s.alive}, births ${s.births}; ` +
        `commands at ticks ${s.log.map((c) => c.tick).join(', ')}; max ${s.maxTicksPerPump} ticks/frame`,
    );
  });

  it('replaying the host command log at 1× reaches the identical state hash', () => {
    const s = playerSessionAt4x();
    const h = new FakeClockHost();
    h.create('garden-1x', { kind: 'recipe', recipeId: RECIPE });
    h.setSpeed(1);
    const acks: Array<CommandResult | null> = [];
    const next = playLog(h, s.log, 0, s.finalTick, acks);
    h.setSpeed(0);
    expect(next).toBe(s.log.length);
    expect(h.maxTicksPerPump).toBe(1);
    expect(h.tick).toBe(s.finalTick);
    expect(commandLog(h.world)).toEqual(s.log);
    expect(acks).toEqual(s.acks);
    expect(h.hash()).toBe(s.hash);
    expect(h.errors()).toEqual([]);
  });
});

describe('G1 deterministic state — headless replay of the command log', () => {
  it('the stage-1 queue replay matches the host, in 1-tick steps and in observed 4-tick chunks', () => {
    const s = playerSessionAt4x();
    const one = queuedWorld(s.log);
    const four = queuedWorld(s.log);
    expect(stateHash(one)).toBe(stateHash(four));
    while (one.tick < s.finalTick) step(one);
    while (four.tick < s.finalTick) {
      const n = Math.min(4, s.finalTick - four.tick);
      for (let k = 0; k < n; k++) step(four);
      stateHash(four); // observing must not perturb
      if (four.tick % 40 === 0) serializeWorld(four);
    }
    expect(stateHash(one)).toBe(s.hash);
    expect(stateHash(four)).toBe(s.hash);
    expect(commandLog(one)).toEqual(s.log);
    expect(commandLog(four)).toEqual(s.log);
    expect(checkLedger(one).ok).toBe(true);
  });

  it('paused edits (applyNow) at the logged ticks give the same state as the queued replay', () => {
    const s = playerSessionAt4x();
    const w = realizeRecipe(registry(), RECIPE);
    let next = 0;
    while (w.tick < s.finalTick || next < s.log.length) {
      while (next < s.log.length && s.log[next]!.tick === w.tick) {
        const c = s.log[next++]!;
        expect(applyNow(w, c.id, c.payload).result).toEqual(c.result);
      }
      if (w.tick >= s.finalTick) break;
      step(w);
    }
    expect(stateHash(w)).toBe(s.hash);
  });

  it('negative control: the same log with one Feed dose a single tick later ends in a different state', () => {
    const s = playerSessionAt4x();
    const shifted = s.log.map((c) => (c.id === 'feed-tap' ? { ...c, tick: c.tick + 1 } : c));
    const w = queuedWorld(shifted);
    run(w, s.finalTick);
    expect(stateHash(w)).not.toBe(s.hash);
  });
});

describe('G1 deterministic state — mid-run save/reload', () => {
  it('host: save mid-session → new dish from the saved state → continue at 4× equals the uninterrupted session', () => {
    const s = playerSessionAt4x();
    // Save straight after a gesture was applied (the edit is part of the saved state).
    const saveAt = s.log[3]!.tick;
    const h = new FakeClockHost();
    h.create('before-save', { kind: 'recipe', recipeId: RECIPE });
    h.setSpeed(4);
    const acks: Array<CommandResult | null> = [];
    const next = playLog(h, s.log, 0, saveAt, acks);
    expect(next).toBe(4);
    h.setSpeed(0);
    const json = h.save();
    const savedHash = h.hash();
    h.create('after-load', { kind: 'state', state: JSON.parse(json) as WorldState });
    expect(h.tick).toBe(saveAt);
    expect(h.hash()).toBe(savedHash);
    h.setSpeed(4);
    expect(playLog(h, s.log, next, s.finalTick, acks)).toBe(s.log.length);
    h.setSpeed(0);
    expect(h.tick).toBe(s.finalTick);
    expect(acks).toEqual(s.acks);
    expect(commandLog(h.world)).toEqual(s.log);
    expect(h.hash()).toBe(s.hash);
    expect(h.errors()).toEqual([]);
  });

  it('save file: save with commands still pending → load → continue equals the uninterrupted run', async () => {
    const s = playerSessionAt4x();
    // Between gestures: three commands are still queued in the saved world.
    const saveAt = s.log[3]!.tick + 17;
    expect(saveAt).toBeLessThan(s.log[4]!.tick);
    const first = queuedWorld(s.log);
    run(first, saveAt);
    expect(first.commands.pending).toHaveLength(3);
    const built = await buildSaveFile(first, { name: 'mid-run', savedAt: '2026-01-01T00:00:00.000Z', recipeId: RECIPE });
    const { world: reloaded } = await loadSaveFile(built.text);
    expect(reloaded.tick).toBe(saveAt);
    expect(stateHash(reloaded)).toBe(stateHash(first));
    expect(reloaded.commands.pending.map((c) => [c.commandId, c.targetTick])).toEqual(s.log.slice(4).map((c) => [c.id, c.tick]));
    run(reloaded, s.finalTick - saveAt);
    run(first, s.finalTick - saveAt);
    expect(stateHash(reloaded)).toBe(stateHash(first));
    expect(stateHash(reloaded)).toBe(s.hash);
    expect(commandLog(reloaded)).toEqual(s.log);
    expect(checkLedger(reloaded).ok).toBe(true);
  });
});
