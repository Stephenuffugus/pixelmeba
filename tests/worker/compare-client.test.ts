/**
 * P2.4 comparison over the worker protocol: SimClient ↔ DishHost with asynchronous delivery, as in
 * the app. Requests resolve by requestId; unsolicited progress and completion reach onCompare
 * listeners; A refuses changes with a readable reason while B takes them through the ordinary command
 * path; snapshots for both arms stream with their own generations; delete resolves and leaves the
 * source dish in place.
 */
import { describe, expect, it } from 'vitest';
import type { CommandPayload } from '../../src/sim/commands';
import { SimClient, WorkerRequestError, type WorkerLike } from '../../src/worker/client';
import type { ComparisonState } from '../../src/worker/comparison';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, SnapshotMsg, ToWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

const FEED: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[40.5, 64.5]], radius: 3, dose: 0.1 };
const IDS = { compareId: 'c1', aDishId: 'c1-A', bDishId: 'c1-B' };
const flush = () => new Promise((r) => setTimeout(r, 0));

function connected() {
  let now = 0;
  let onmessage: ((ev: MessageEvent<FromWorker>) => void) | null = null;
  const host = new DishHost(registry(), (m) => queueMicrotask(() => onmessage?.({ data: m } as unknown as MessageEvent<FromWorker>)), { now: () => now });
  const worker: WorkerLike = {
    postMessage: (msg: ToWorker) => host.handle(msg),
    get onmessage() {
      return onmessage;
    },
    set onmessage(fn) {
      onmessage = fn;
    },
  };
  return {
    host,
    client: new SimClient(worker),
    frame(ms: number) {
      now += ms;
      host.pump();
    },
  };
}

describe('comparison over the worker protocol (P2.4)', () => {
  it('start → change on B → run → progress and completion reach listeners → delete', async () => {
    const c = connected();
    await c.client.create('src', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' }, 'Garden');
    const states: ComparisonState[] = [];
    c.client.onCompare((s) => states.push(s));
    const snaps: SnapshotMsg[] = [];
    c.client.onSnapshot((s) => snaps.push(s));

    const started = await c.client.compareStart('src', IDS);
    expect(started).toMatchObject({ ...IDS, sourceDishId: 'src', status: 'setup', baselineTick: 0, ticksRun: 0, interventions: [] });
    await flush();
    expect(snaps.filter((s) => s.dishId === IDS.aDishId && s.geometry)).toHaveLength(1);
    expect(snaps.filter((s) => s.dishId === IDS.bDishId && s.geometry)).toHaveLength(1);

    const refused = await c.client.commandAck(IDS.aDishId, 'a1', FEED);
    expect(refused.result).toBeNull();
    expect(refused.error).toMatch(/A is the baseline/);
    const fed = await c.client.commandAck(IDS.bDishId, 'b1', FEED);
    expect(fed.error).toBeNull();
    expect(fed.result!.accepted).toBeGreaterThan(0);
    await flush();
    expect(states.at(-1)!.interventions.map((i) => i.commandId)).toEqual(['b1']);

    const running = await c.client.compareRun(IDS.compareId, 100, 4);
    expect(running.status).toBe('running');
    const before = states.length;
    for (let k = 0; k < 40 && states.at(-1)!.status === 'running'; k++) {
      c.frame(120);
      await flush();
    }
    const progress = states.slice(before).filter((s) => s.status === 'running');
    expect(progress.length).toBeGreaterThan(0); // unsolicited progress packets
    for (const s of progress) expect(s.ticksRun).toBeLessThanOrEqual(100);
    const done = states.at(-1)!;
    expect(done.status).toBe('complete');
    expect(done.results!.ticks).toBe(100);
    expect(done.results!.label).toBe('this paired run');
    // Generations per arm are strictly increasing (stale discard works per dish).
    for (const id of [IDS.aDishId, IDS.bDishId]) {
      const gens = snaps.filter((s) => s.dishId === id).map((s) => s.gen);
      for (let k = 1; k < gens.length; k++) expect(gens[k]!).toBeGreaterThan(gens[k - 1]!);
      expect(snaps.filter((s) => s.dishId === id).at(-1)!.tick).toBe(100);
    }

    await c.client.compareDelete(IDS.compareId);
    expect(c.host.world(IDS.aDishId)).toBeNull();
    expect(c.host.world('src')!.tick).toBe(0);
    await expect(c.client.compareRun(IDS.compareId, 100, 4)).rejects.toBeInstanceOf(WorkerRequestError);
  });

  it('pace changes are fire-and-forget and never alter the tick count; Stop resolves with equal ticks', async () => {
    const c = connected();
    await c.client.create('src', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    await c.client.compareStart('src', IDS);
    await c.client.commandAck(IDS.bDishId, 'b1', FEED);
    await c.client.compareRun(IDS.compareId, null, 1);
    c.frame(300);
    c.client.compareSpeed(IDS.compareId, 0);
    const paused = c.host.world(IDS.aDishId)!.tick;
    c.frame(500);
    expect(c.host.world(IDS.aDishId)!.tick).toBe(paused);
    c.client.compareSpeed(IDS.compareId, 'max');
    c.frame(16);
    const stopped = await c.client.compareStop(IDS.compareId);
    expect(stopped.status).toBe('complete');
    expect(c.host.world(IDS.aDishId)!.tick).toBe(stopped.ticksRun);
    expect(c.host.world(IDS.bDishId)!.tick).toBe(stopped.ticksRun);
    expect(stopped.results!.ticks).toBe(stopped.ticksRun);
  });
});
