import { describe, expect, it } from 'vitest';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, SnapshotMsg } from '../../src/worker/protocol';
import { ENT_STRIDE, E_SPECIES } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

function harness() {
  let t = 0;
  const out: FromWorker[] = [];
  const host = new DishHost(registry(), (m) => out.push(m), { now: () => t });
  return {
    host,
    out,
    advance(ms: number, stepMs = 16) {
      for (let k = 0; k < ms; k += stepMs) {
        t += stepMs;
        host.pump();
      }
    },
    snapshots: () => out.filter((m): m is SnapshotMsg => m.type === 'snapshot'),
  };
}

// Client-side stale-snapshot discard and request routing live in protocol.test.ts.
describe('worker host (P1.3)', () => {
  it('creates a dish from a recipe and publishes a first snapshot with every founder', () => {
    const h = harness();
    h.host.handle({ type: 'create', requestId: 1, dishId: 'd1', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    const ready = h.out.find((m) => m.type === 'ready');
    expect(ready && ready.type === 'ready' && ready.info.speciesIds).toEqual(['A01', 'B01', 'B04', 'B06', 'P01']);
    const snap = h.snapshots()[0]!;
    expect(snap.count).toBe(56);
    expect(snap.tick).toBe(0);
    expect(snap.geometry).not.toBeNull();
    // Species index of the first packed entity is valid.
    expect(snap.ents[E_SPECIES]).toBeGreaterThanOrEqual(0);
    expect(snap.ents.length).toBeGreaterThanOrEqual(56 * ENT_STRIDE);
  });

  it('runs 10 ticks per second at 1× and 40 at 4× of simulated wall time, and nothing while paused', () => {
    const h = harness();
    h.host.handle({ type: 'create', requestId: 1, dishId: 'd1', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    h.advance(1000);
    expect(h.host.world('d1')!.tick).toBe(0);
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 1 });
    h.advance(1000);
    const t1 = h.host.world('d1')!.tick;
    expect(t1).toBeGreaterThanOrEqual(9);
    expect(t1).toBeLessThanOrEqual(11);
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 4 });
    h.advance(1000);
    const t4 = h.host.world('d1')!.tick - t1;
    expect(t4).toBeGreaterThanOrEqual(38);
    expect(t4).toBeLessThanOrEqual(42);
    const last = h.snapshots().at(-1)!;
    expect(last.effectiveSpeed).toBeGreaterThan(2);
  });

  it('applies a command at a tick boundary, acks the accepted amount, and undo rewinds action and time', () => {
    const h = harness();
    h.host.handle({ type: 'create', requestId: 1, dishId: 'd1', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    h.host.handle({ type: 'hash', requestId: 2, dishId: 'd1' });
    const before = h.out.find((m) => m.type === 'hash')!;
    h.host.handle({
      type: 'command',
      requestId: 3,
      dishId: 'd1',
      commandId: 'g1',
      payload: { kind: 'inoculate', speciesId: 'P01', x: 48.5, y: 64.5, radius: 3, count: 2 },
      undoable: true,
    });
    const ack = h.out.find((m) => m.type === 'ack' && m.requestId === 3);
    expect(ack && ack.type === 'ack' && ack.result).toEqual({ accepted: 2, rejected: 0 });
    h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 1 });
    h.advance(500);
    expect(h.host.world('d1')!.tick).toBeGreaterThan(0);
    h.host.handle({ type: 'undo', requestId: 4, dishId: 'd1' });
    h.host.handle({ type: 'hash', requestId: 5, dishId: 'd1' });
    const after = h.out.filter((m) => m.type === 'hash').at(-1)!;
    expect(after.type === 'hash' && before.type === 'hash' && after.hash).toBe(before.type === 'hash' ? before.hash : '');
    expect(h.host.world('d1')!.tick).toBe(0);
  });

  it('duplicates into an independent world', () => {
    const h = harness();
    h.host.handle({ type: 'create', requestId: 1, dishId: 'a', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    h.host.handle({ type: 'duplicate', requestId: 2, dishId: 'a', newDishId: 'b' });
    h.host.handle({ type: 'setSpeed', dishId: 'a', speed: 1 });
    h.advance(1000);
    expect(h.host.world('a')!.tick).toBeGreaterThan(0);
    expect(h.host.world('b')!.tick).toBe(0);
    expect(h.host.world('b')!.worldId).not.toBe(h.host.world('a')!.worldId);
  });

  it('reports an error and pauses instead of crashing on a bad request', () => {
    const h = harness();
    h.host.handle({ type: 'create', requestId: 1, dishId: 'd1', source: { kind: 'recipe', recipeId: 'NOPE' } });
    const err = h.out.find((m) => m.type === 'error');
    expect(err && err.type === 'error' && err.message).toContain('unknown recipe');
  });
});
