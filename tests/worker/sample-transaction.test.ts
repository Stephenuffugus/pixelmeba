/**
 * P3.5 Sample as a host transaction (SPEC §10.5; D07 §09; D-0037), driven through the real DishHost
 * with a fake clock (tests/helpers/host.ts):
 * - Begin pauses and records the pre-begin hash; while a sample is held, Run, Step and an inoculate are
 *   refused before anything is applied (no sequence number is taken, nothing changes) with the held-sample
 *   message; Undo while held acts as Cancel.
 * - A reload (the host's own save, opened as a new dish) restores the held sample and the snapshot
 *   offers it (Complete / Cancel / Discard), time stays paused; Complete (Transfer), Cancel and Discard
 *   each work after the reload, and Cancel after a reload gives the pre-begin hash.
 */
import { describe, expect, it } from 'vitest';
import { selectSample, SAMPLE_HELD_REFUSAL } from '../../src/sim/sample';
import { checkLedger } from '../../src/sim/ledger';
import type { WorldState } from '../../src/sim/serialize';
import type { FromWorker, SnapshotMsg } from '../../src/worker/protocol';
import { FakeClockHost } from '../helpers/host';

const SEED = 104729;

/** A point whose Life sample holds organisms and no split unit (found from the world, deterministic). */
function lifePoint(h: FakeClockHost): [number, number] {
  const w = h.world;
  const c = w.ents.cols;
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const x = Math.floor(c.x[i]!) + 0.5;
    const y = Math.floor(c.y[i]!) + 0.5;
    const sel = selectSample(w, x, y, 3, 'all');
    if (sel.slots.length > 0 && sel.missing.length === 0) return [x, y];
  }
  throw new Error('no samplable point');
}

let req = 1000;
function begin(h: FakeClockHost, dishId: string): string {
  const requestId = ++req;
  h.host.handle({ type: 'sampleBegin', requestId, dishId });
  const msg = h.out.find((m) => m.type === 'sampleBegun' && m.requestId === requestId);
  if (!msg || msg.type !== 'sampleBegun') throw new Error(`no sampleBegun: ${JSON.stringify(h.errors())}`);
  return msg.hash;
}
function cancel(h: FakeClockHost, dishId: string): Extract<FromWorker, { type: 'sampleCancelled' }> {
  const requestId = ++req;
  h.host.handle({ type: 'sampleCancel', requestId, dishId });
  const msg = h.out.find((m) => m.type === 'sampleCancelled' && m.requestId === requestId);
  if (!msg || msg.type !== 'sampleCancelled') throw new Error('no sampleCancelled');
  return msg;
}
function lastSnapshot(h: FakeClockHost, dishId: string): SnapshotMsg {
  const s = [...h.out].reverse().find((m): m is SnapshotMsg => m.type === 'snapshot' && m.dishId === dishId);
  if (!s) throw new Error('no snapshot');
  return s;
}

/** A dish run for 10 s, paused, sampled (All, radius 3) at a point holding organisms. */
function heldDish(): { h: FakeClockHost; beginHash: string; seq: number } {
  const h = new FakeClockHost();
  h.create('d1', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: SEED });
  h.setSpeed(1);
  h.advanceTo(100);
  h.setSpeed(0);
  const beginHash = begin(h, 'd1');
  expect(h.hash()).toBe(beginHash);
  const [x, y] = lifePoint(h);
  const seq = h.world.commands.nextSeq;
  const res = h.command('take', { kind: 'sampleTake', x, y, radius: 3, mode: 'all' }, false);
  expect(res!.accepted).toBeGreaterThan(0);
  expect(h.world.sample!.seq).toBe(seq);
  return { h, beginHash, seq };
}

/** Reload: the host's own save opened as a new dish (as Load does), returned with the new host's view. */
function reload(h: FakeClockHost): FakeClockHost {
  const json = h.save();
  const h2 = new FakeClockHost();
  h2.create('d2', { kind: 'state', state: JSON.parse(json) as WorldState });
  return h2;
}

describe('Sample transaction in the worker host (D-0037)', () => {
  it('Begin pauses; Run, Step and an inoculate are refused while held and take no sequence number', () => {
    const { h, seq } = heldDish();
    const held = h.hash();
    const tick = h.tick;
    const errors0 = h.errors().length;
    h.setSpeed(1);
    h.pump(500);
    expect(h.tick).toBe(tick);
    h.host.handle({ type: 'step', dishId: 'd1' });
    expect(h.tick).toBe(tick);
    const before = h.out.length;
    const res = h.command('ino', { kind: 'inoculate', speciesId: 'B01', x: 64.5, y: 64.5, radius: 3, count: 5 });
    expect(res).toBeNull();
    const ack = h.out.slice(before).find((m) => m.type === 'ack');
    expect(ack && ack.type === 'ack' ? ack.error : null).toBe(SAMPLE_HELD_REFUSAL);
    expect(h.world.commands.nextSeq).toBe(seq + 1);
    expect(h.hash()).toBe(held);
    const refusals = h.errors().slice(errors0);
    expect(refusals.length).toBe(3);
    for (const e of refusals) expect(e.type === 'error' ? e.message : '').toBe('A sample is held — transfer, cancel or discard it first');
    expect(lastSnapshot(h, 'd1').speed).toBe(0);
    expect(lastSnapshot(h, 'd1').sample).not.toBeNull();
  });

  it('Undo while held acts as Cancel: the pre-begin hash, no undo slot, and the dish runs again', () => {
    const { h, beginHash, seq } = heldDish();
    h.host.handle({ type: 'undo', requestId: ++req, dishId: 'd1' });
    expect(h.world.sample).toBeNull();
    expect(h.hash()).toBe(beginHash);
    expect(h.world.commands.nextSeq).toBe(seq);
    expect(lastSnapshot(h, 'd1').undoAvailable).toBe(false);
    expect(lastSnapshot(h, 'd1').sample).toBeNull();
    h.setSpeed(1);
    h.advanceTo(h.tick + 5);
    expect(checkLedger(h.world).ok).toBe(true);
  });

  it('Cancel (host-level) restores the pre-begin hash and the command state', () => {
    const { h, beginHash, seq } = heldDish();
    const log = h.world.commands.log.length;
    const msg = cancel(h, 'd1');
    expect(msg.hash).toBe(beginHash);
    expect(msg.beginHash).toBe(beginHash);
    expect(h.world.commands.nextSeq).toBe(seq);
    expect(h.world.commands.log.length).toBe(log - 1);
  });

  it('a reload restores the held sample, keeps time paused and offers it; Complete, Cancel and Discard each work after it', () => {
    // Cancel after reload: the pre-begin hash.
    {
      const { h, beginHash } = heldDish();
      const h2 = reload(h);
      expect(h2.world.sample).not.toBeNull();
      const snap = lastSnapshot(h2, 'd2');
      expect(snap.sample).toMatchObject({ mode: 'all', radius: 3 });
      expect(snap.sample!.organisms).toBe(h.world.sample!.rows.length);
      expect(snap.speed).toBe(0);
      h2.setSpeed(1);
      h2.pump(500);
      expect(h2.tick).toBe(h.tick);
      const msg = cancel(h2, 'd2');
      expect(msg.beginHash).toBeNull(); // Begin happened before the reload
      expect(msg.hash).toBe(beginHash);
    }
    // Complete (Transfer) after reload: the sample lands, the dish runs.
    {
      const { h } = heldDish();
      const h2 = reload(h);
      const before = h2.world.ents.count;
      let moved = null;
      for (const [dx, dy] of [
        [6, 0],
        [-6, 0],
        [0, 6],
        [0, -6],
        [10, 10],
        [-10, -10],
      ] as const) {
        moved = h2.command('xfer', { kind: 'sampleTransfer', dx, dy });
        if (moved && moved.accepted > 0) break;
      }
      expect(moved?.accepted).toBeGreaterThan(0);
      expect(h2.world.sample).toBeNull();
      expect(h2.world.ents.count).toBe(before + h.world.sample!.rows.length);
      expect(checkLedger(h2.world).ok).toBe(true);
      h2.setSpeed(1);
      h2.advanceTo(h2.tick + 5);
    }
    // Discard after reload: exported, the dish runs.
    {
      const { h } = heldDish();
      const h2 = reload(h);
      const exp = h2.world.ledger.exports.c;
      expect(h2.command('discard', { kind: 'sampleDiscard' })!.accepted).toBeGreaterThan(0);
      expect(h2.world.sample).toBeNull();
      expect(h2.world.ledger.exports.c).toBeGreaterThan(exp);
      expect(checkLedger(h2.world).ok).toBe(true);
      h2.setSpeed(1);
      h2.advanceTo(h2.tick + 5);
    }
  });

  it('a second Begin while held is refused (the UI discards first after confirmation), and a take needs a paused dish', () => {
    const { h } = heldDish();
    const requestId = ++req;
    h.host.handle({ type: 'sampleBegin', requestId, dishId: 'd1' });
    const err = h.out.find((m) => m.type === 'error' && m.requestId === requestId);
    expect(err && err.type === 'error' ? err.message : '').toBe(SAMPLE_HELD_REFUSAL);
    // Discard, then Begin again (the proposed replace flow), then a take while running is refused.
    h.command('discard', { kind: 'sampleDiscard' });
    begin(h, 'd1');
    h.setSpeed(1);
    const before = h.out.length;
    const res = h.command('take2', { kind: 'sampleTake', x: 64.5, y: 64.5, radius: 3, mode: 'dissolved' }, false);
    expect(res).toBeNull();
    const ack = h.out.slice(before).find((m) => m.type === 'ack');
    expect(ack && ack.type === 'ack' ? ack.error : '').toMatch(/Pause the dish/);
    expect(h.world.sample).toBeNull();
  });
});
