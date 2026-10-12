/**
 * P4.13 worker performance counters (src/worker/perfCounters.ts; ARCH §13).
 *
 * - The ring keeps the last 300 tick times; p50/p95 are nearest-rank over it; reset forgets them.
 * - Off by default: snapshots carry no `perf`, and the host never calls performance.now() (off costs
 *   nothing). On: every snapshot carries a sample over the ticks run since.
 * - Hash-neutral: a dish whose diagnostics are toggled on and off mid-run hashes exactly as one that never
 *   had them (stateHash and the full trajectory digest).
 *
 * Checked to fail without the mechanism: with the `this.diagnostics ?` guards removed from host.ts pump and
 * sendSnapshot, the "off" test sees performance.now() calls.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PERF_RING, PerfCounters, percentile } from '../../src/worker/perfCounters';
import type { SnapshotMsg } from '../../src/worker/protocol';
import { stateHash } from '../../src/sim/serialize';
import { FakeClockHost } from '../helpers/host';
import { trajectoryDigest } from '../helpers/trajectory';

function snapshots(h: FakeClockHost): SnapshotMsg[] {
  return h.out.filter((m): m is SnapshotMsg => m.type === 'snapshot');
}

afterEach(() => vi.restoreAllMocks());

describe('PerfCounters', () => {
  it('keeps the last 300 ticks; nearest-rank p50/p95; the last snapshot time; the watcher mean', () => {
    const p = new PerfCounters();
    expect(p.sample()).toEqual({ tickMsP50: 0, tickMsP95: 0, ticksMeasured: 0, snapshotMs: 0, relationshipMs: 0 });
    for (let k = 1; k <= 100; k++) p.recordTick(k, 0.5);
    let s = p.sample();
    expect([s.tickMsP50, s.tickMsP95, s.ticksMeasured, s.relationshipMs]).toEqual([50, 95, 100, 0.5]);
    // 400 more: only the last 300 (values 201…500) count.
    for (let k = 101; k <= 500; k++) p.recordTick(k, 1);
    s = p.sample();
    expect(s.ticksMeasured).toBe(PERF_RING);
    expect(s.tickMsP50).toBe(350);
    expect(s.tickMsP95).toBe(485);
    expect(s.relationshipMs).toBe(1);
    p.recordSnapshot(3.456);
    p.recordSnapshot(2.5);
    expect(p.sample().snapshotMs).toBe(2.5);
    p.reset();
    expect(p.sample().ticksMeasured).toBe(0);
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([7], 0.95)).toBe(7);
  });
});

describe('DishHost diagnostics (P4.13)', () => {
  it('off by default: no perf on snapshots and no performance.now() call while the dish runs', () => {
    const h = new FakeClockHost();
    h.create('perf-off', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    const now = vi.spyOn(performance, 'now');
    h.setSpeed(4);
    h.advanceTo(200);
    expect(now).not.toHaveBeenCalled();
    expect(snapshots(h).length).toBeGreaterThan(0);
    expect(snapshots(h).every((m) => m.perf === undefined)).toBe(true);
  });

  it('on: snapshots carry the worker timings; off again: they stop', () => {
    const h = new FakeClockHost();
    h.create('perf-on', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    h.host.handle({ type: 'diagnostics', on: true });
    h.setSpeed(4);
    h.advanceTo(120);
    const last = snapshots(h).at(-1)!;
    expect(last.perf).toBeDefined();
    expect(last.perf!.ticksMeasured).toBeGreaterThan(50);
    expect(last.perf!.tickMsP95).toBeGreaterThanOrEqual(last.perf!.tickMsP50);
    expect(last.perf!.tickMsP50).toBeGreaterThan(0);
    expect(last.perf!.relationshipMs).toBeGreaterThanOrEqual(0);
    h.host.handle({ type: 'diagnostics', on: false });
    const n = snapshots(h).length;
    h.advanceTo(200);
    expect(snapshots(h).length).toBeGreaterThan(n);
    expect(snapshots(h).slice(n).every((m) => m.perf === undefined)).toBe(true);
  });

  it('hash-neutral: diagnostics toggled mid-run change no stateHash or trajectory', () => {
    const a = new FakeClockHost();
    a.create('perf-a', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    const b = new FakeClockHost();
    b.create('perf-b', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    a.setSpeed(4);
    b.setSpeed(4);
    a.advanceTo(300);
    b.host.handle({ type: 'diagnostics', on: true });
    b.advanceTo(300);
    expect(b.hash()).toBe(a.hash());
    a.advanceTo(900);
    b.advanceTo(600);
    b.host.handle({ type: 'diagnostics', on: false });
    b.advanceTo(750);
    b.host.handle({ type: 'diagnostics', on: true });
    b.advanceTo(900);
    expect(b.tick).toBe(a.tick);
    expect(stateHash(b.world)).toBe(stateHash(a.world));
    expect(trajectoryDigest(b.world, 'full')).toBe(trajectoryDigest(a.world, 'full'));
  }, 120_000);
});
