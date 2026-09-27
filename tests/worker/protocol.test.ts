/**
 * P1.3 worker protocol (ARCH §7–§8; BUILD_DIRECTIVE P1.3 done-when): stale snapshot discard,
 * command ordering at tick boundaries, responses routed by requestId, protocol versioning and the
 * error policy (a failure pauses the dish, emits `error`, and keeps the last valid state).
 * DishHost runs on a fake clock; SimClient talks to it through a fake worker.
 */
import { describe, expect, it } from 'vitest';
import type { CommandPayload } from '../../src/sim/commands';
import { queueCommand } from '../../src/sim/commands';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { SimClient, WorkerRequestError, type WorkerLike } from '../../src/worker/client';
import { DishHost } from '../../src/worker/host';
import { PROTOCOL_VERSION, type FromWorker, type ToWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

const RECIPE = { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } as const;
const SUGAR: CommandPayload = { kind: 'deposit', materialId: 'SUGAR', points: [[64.5, 64.5]], radius: 3, dose: 0.1 };
/** A malformed payload the sim cannot apply: it throws part-way through command application. */
const BROKEN = { kind: 'no-such-command' } as unknown as CommandPayload;

type Of<T extends FromWorker['type']> = Extract<FromWorker, { type: T }>;

/** DishHost with a synchronous fake post and a manual clock. */
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
    of<T extends FromWorker['type']>(type: T): Of<T>[] {
      return out.filter((m): m is Of<T> => m.type === type);
    },
    hash(dishId: string, requestId: number): string {
      host.handle({ type: 'hash', requestId, dishId });
      const m = out.filter((x): x is Of<'hash'> => x.type === 'hash' && x.requestId === requestId).at(-1);
      if (!m) throw new Error(`no hash reply for ${requestId}`);
      return m.hash;
    },
  };
}

/** A fake worker whose replies the test delivers by hand, in any order. */
function manualWorker() {
  const sent: ToWorker[] = [];
  let onmessage: ((ev: MessageEvent<FromWorker>) => void) | null = null;
  const worker: WorkerLike = {
    postMessage: (msg: ToWorker) => void sent.push(msg),
    get onmessage() {
      return onmessage;
    },
    set onmessage(fn) {
      onmessage = fn;
    },
  };
  const deliver = (m: unknown) => onmessage!({ data: m as FromWorker } as MessageEvent<FromWorker>);
  return { sent, worker, deliver };
}

/** SimClient wired to a real DishHost; replies arrive asynchronously, as from a real worker. */
function connected() {
  let onmessage: ((ev: MessageEvent<FromWorker>) => void) | null = null;
  const posted: FromWorker[] = [];
  const host = new DishHost(registry(), (m) => {
    posted.push(m);
    queueMicrotask(() => onmessage?.({ data: m } as MessageEvent<FromWorker>));
  }, { now: () => 0 });
  const sentToWorker: ToWorker[] = [];
  const worker: WorkerLike = {
    postMessage: (msg: ToWorker) => {
      sentToWorker.push(msg);
      host.handle(msg);
    },
    get onmessage() {
      return onmessage;
    },
    set onmessage(fn) {
      onmessage = fn;
    },
  };
  return { host, client: new SimClient(worker), posted, sentToWorker, inject: (m: unknown) => onmessage!({ data: m as FromWorker } as MessageEvent<FromWorker>) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('worker protocol (P1.3)', () => {
  describe('stale snapshot discard', () => {
    it('drops a snapshot whose generation is not newer than the last one seen for that dish', () => {
      const w = manualWorker();
      const client = new SimClient(w.worker);
      const seen: string[] = [];
      client.onSnapshot((s) => seen.push(`${s.dishId}:${s.gen}`));
      const snap = (dishId: string, gen: number) => w.deliver({ type: 'snapshot', dishId, gen, tick: gen });
      snap('a', 2);
      snap('a', 1); // older: stale
      snap('a', 2); // repeated: stale
      snap('b', 1); // generations are per dish
      snap('a', 5);
      snap('b', 1); // repeated for b: stale
      snap('a', 3); // arrived late: stale
      snap('b', 2);
      expect(seen).toEqual(['a:2', 'b:1', 'a:5', 'b:2']);
    });

    it('a live host streams strictly increasing generations and late stale packets never reach listeners', async () => {
      const c = connected();
      const seen: number[] = [];
      c.client.onSnapshot((s) => seen.push(s.gen));
      await c.client.create('d1', RECIPE);
      c.inject({ type: 'snapshot', dishId: 'd1', gen: 0 });
      const res = await c.client.command('d1', 'c1', SUGAR);
      expect(res!.accepted).toBeGreaterThan(0);
      c.client.stepOnce('d1');
      await flush();
      const lastGen = seen.at(-1)!;
      c.inject({ type: 'snapshot', dishId: 'd1', gen: lastGen - 1 });
      await flush();
      expect(seen.length).toBeGreaterThanOrEqual(3);
      expect(seen).not.toContain(0);
      for (let k = 1; k < seen.length; k++) expect(seen[k]!).toBeGreaterThan(seen[k - 1]!);
      expect(seen.at(-1)).toBe(lastGen);
    });

    it('an unsubscribed listener receives nothing further', () => {
      const w = manualWorker();
      const client = new SimClient(w.worker);
      const seen: number[] = [];
      const off = client.onSnapshot((s) => seen.push(s.gen));
      w.deliver({ type: 'snapshot', dishId: 'a', gen: 1 });
      off();
      w.deliver({ type: 'snapshot', dishId: 'a', gen: 2 });
      expect(seen).toEqual([1]);
    });
  });

  describe('command ordering', () => {
    it('stamps increasing seq and the current tick, applies commands at tick boundaries in order, and acks in order', () => {
      const h = harness();
      h.host.handle({ type: 'create', requestId: 1, dishId: 'd1', source: RECIPE });
      h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 1 });
      h.advance(500);
      const w = h.host.world('d1')!;
      const t1 = w.tick;
      expect(t1).toBeGreaterThan(0);
      const issued: { requestId: number; commandId: string; payload: CommandPayload }[] = [
        { requestId: 10, commandId: 'first', payload: SUGAR },
        { requestId: 11, commandId: 'second', payload: { kind: 'inoculate', speciesId: 'P01', x: 48.5, y: 64.5, radius: 3, count: 2 } },
        { requestId: 12, commandId: 'third', payload: { kind: 'deposit', materialId: 'STARCH', points: [[70.5, 60.5]], radius: 2, dose: 0.5 } },
      ];
      for (const c of issued) {
        h.host.handle({ type: 'command', requestId: c.requestId, dishId: 'd1', commandId: c.commandId, payload: c.payload, undoable: true });
        expect(w.tick).toBe(t1); // applying a command never advances time
      }
      h.advance(700);
      const t2 = w.tick;
      expect(t2).toBeGreaterThan(t1);
      h.host.handle({ type: 'command', requestId: 13, dishId: 'd1', commandId: 'fourth', payload: { kind: 'inoculate', speciesId: 'B04', x: 66.5, y: 48.5, radius: 3, count: 5 }, undoable: false });
      h.advance(300);
      h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 0 });
      const t3 = w.tick;

      // Acks come back one per command, in issue order, each routed to its request.
      const acks = h.of('ack');
      expect(acks.map((a) => a.requestId)).toEqual([10, 11, 12, 13]);
      expect(acks.every((a) => a.dishId === 'd1' && a.error === undefined && a.result !== null)).toBe(true);
      expect(acks[1]!.result).toEqual({ accepted: 2, rejected: 0 });

      // The worker stamped seq (strictly increasing) and targetTick (the boundary it was applied at).
      const log = w.commands.log;
      expect(log.map((c) => c.commandId)).toEqual(['first', 'second', 'third', 'fourth']);
      expect(log.map((c) => c.targetTick)).toEqual([t1, t1, t1, t2]);
      for (let k = 1; k < log.length; k++) expect(log[k]!.seq).toBeGreaterThan(log[k - 1]!.seq);
      expect(w.commands.pending).toEqual([]);
      const cmdEvents = w.events.ring.filter((e) => e.type === 'command');
      expect(cmdEvents.map((e) => e.tick)).toEqual([t1, t1, t1, t2]);

      // Replaying the stamped log headlessly (queued at targetTick, seq order) reproduces the live dish.
      const replay = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'd1' });
      for (const c of log) queueCommand(replay, c.commandId, c.payload, c.targetTick);
      run(replay, t3);
      expect(replay.tick).toBe(t3);
      expect(stateHash(replay)).toBe(h.hash('d1', 99));
    });

    it('commands sent through the client resolve in the order they were issued', async () => {
      const c = connected();
      await c.client.create('d1', RECIPE);
      const resolved: string[] = [];
      const ids = ['a', 'b', 'c', 'd'];
      await Promise.all(ids.map((id, k) => c.client.command('d1', id, { ...SUGAR, points: [[60.5 + k, 64.5]] }).then(() => resolved.push(id))));
      expect(resolved).toEqual(ids);
      const sent = c.sentToWorker.filter((m): m is Extract<ToWorker, { type: 'command' }> => m.type === 'command');
      const reqIds = sent.map((m) => m.requestId);
      expect(reqIds).toEqual([...reqIds].sort((x, y) => x - y));
      expect(new Set(reqIds).size).toBe(reqIds.length);
      const acks = c.posted.filter((m): m is Of<'ack'> => m.type === 'ack');
      expect(acks.map((a) => a.requestId)).toEqual(reqIds);
      expect(c.host.world('d1')!.commands.log.map((x) => x.commandId)).toEqual(ids);
    });
  });

  describe('responses routed by requestId', () => {
    it('resolves each pending request with its own reply even when replies arrive out of order', async () => {
      const w = manualWorker();
      const client = new SimClient(w.worker);
      const pa = client.hash('a');
      const pb = client.hash('b');
      const ps = client.save('a');
      const pl = client.listSlots();
      expect(w.sent.map((m) => ('requestId' in m ? m.requestId : -1))).toEqual([1, 2, 3, 4]);
      // Replies in reverse order, plus one for a request nobody made.
      w.deliver({ type: 'done', requestId: 999 });
      w.deliver({ type: 'slots', requestId: 4, slots: [], persistent: false });
      w.deliver({ type: 'saved', requestId: 3, dishId: 'a', json: '{}', hash: 'save-a', tick: 7 });
      w.deliver({ type: 'hash', requestId: 2, dishId: 'b', hash: 'hash-b', tick: 2 });
      w.deliver({ type: 'hash', requestId: 1, dishId: 'a', hash: 'hash-a', tick: 1 });
      expect(await pa).toEqual({ hash: 'hash-a', tick: 1 });
      expect(await pb).toEqual({ hash: 'hash-b', tick: 2 });
      expect(await ps).toEqual({ json: '{}', hash: 'save-a', tick: 7 });
      expect(await pl).toEqual({ slots: [], persistent: false });
    });

    it('routes a live host reply to the dish that was asked', async () => {
      const c = connected();
      await c.client.create('a', RECIPE);
      await c.client.create('b', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 130363 });
      c.client.stepOnce('a');
      const [ha, hb] = await Promise.all([c.client.hash('a'), c.client.hash('b')]);
      expect(ha.tick).toBe(1);
      expect(hb.tick).toBe(0);
      expect(ha.hash).toBe(stateHash(c.host.world('a')!));
      expect(hb.hash).toBe(stateHash(c.host.world('b')!));
      expect(ha.hash).not.toBe(hb.hash);
    });
  });

  describe('protocol version', () => {
    it('exports protocol version 1 (ARCH §7)', () => {
      expect(PROTOCOL_VERSION).toBe(1);
    });

    // KNOWN GAP (reported, src/worker is not editable in this task): BUILD_DIRECTIVE P1.3 requires
    // `protocolVersion` on messages, but neither DishHost nor SimClient stamps it. Change `it.fails`
    // to `it` once host.ts/client.ts stamp PROTOCOL_VERSION on every packet.
    it.fails('every packet in both directions carries protocolVersion', async () => {
      const c = connected();
      await c.client.create('d1', RECIPE);
      await c.client.command('d1', 'c1', SUGAR);
      await c.client.hash('d1');
      await c.client.hash('missing').catch(() => undefined);
      expect(c.posted.length).toBeGreaterThan(3);
      for (const m of c.posted) expect((m as { protocolVersion?: number }).protocolVersion, m.type).toBe(PROTOCOL_VERSION);
      for (const m of c.sentToWorker) expect((m as { protocolVersion?: number }).protocolVersion, m.type).toBe(PROTOCOL_VERSION);
    });
  });

  describe('error policy', () => {
    it('a request for an unknown dish rejects its own promise and notifies error listeners', async () => {
      const c = connected();
      const errors: string[] = [];
      c.client.onError((e) => errors.push(`${e.dishId}: ${e.message}`));
      await expect(c.client.hash('ghost')).rejects.toBeInstanceOf(WorkerRequestError);
      expect(errors).toEqual(['ghost: no dish ghost']);
      // The client stays usable afterwards.
      const info = await c.client.create('d1', RECIPE);
      expect(info.dishId).toBe('d1');
    });

    it('a throwing command pauses the dish and emits error with the request id and last valid tick', async () => {
      const h = harness();
      h.host.handle({ type: 'create', requestId: 1, dishId: 'd1', source: RECIPE });
      h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 2 });
      h.advance(400);
      const w = h.host.world('d1')!;
      const tickAtFailure = w.tick;
      expect(tickAtFailure).toBeGreaterThan(0);
      h.host.handle({ type: 'command', requestId: 7, dishId: 'd1', commandId: 'bad', payload: BROKEN, undoable: false });
      const err = h.of('error');
      expect(err).toHaveLength(1);
      expect(err[0]).toMatchObject({ dishId: 'd1', requestId: 7, lastValidTick: tickAtFailure });
      expect(err[0]!.message.length).toBeGreaterThan(0);
      expect(h.of('ack').some((a) => a.requestId === 7)).toBe(false);
      // Paused: wall time passes, nothing runs; play and step are refused until the dish is replaced.
      h.advance(1000);
      expect(h.host.world('d1')!.tick).toBe(tickAtFailure);
      h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 4 });
      h.host.handle({ type: 'step', dishId: 'd1' });
      h.advance(500);
      expect(h.host.world('d1')!.tick).toBe(tickAtFailure);
      const snaps = h.of('snapshot');
      expect(snaps.at(-1)!.speed).toBe(0);
      expect(snaps.at(-1)!.tick).toBe(tickAtFailure);
      // The dish can still be observed and saved.
      h.host.handle({ type: 'save', requestId: 8, dishId: 'd1' });
      expect(h.of('saved').at(-1)!.tick).toBe(tickAtFailure);

      // Through the client the failing request rejects instead of hanging.
      const c = connected();
      await c.client.create('d2', RECIPE);
      await expect(c.client.command('d2', 'bad', BROKEN)).rejects.toBeInstanceOf(WorkerRequestError);
    });

    it('a tick that throws while running pauses the dish at the last completed tick', () => {
      const h = harness();
      h.host.handle({ type: 'create', requestId: 1, dishId: 'd1', source: RECIPE });
      h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 1 });
      h.advance(500);
      const w = h.host.world('d1')!;
      const before = w.tick;
      // Sabotage authoritative state so the next tick throws inside the simulation.
      (w.fields as Record<string, unknown>).oxygen = undefined;
      h.advance(1000);
      const err = h.of('error');
      expect(err).toHaveLength(1);
      expect(err[0]!.dishId).toBe('d1');
      expect(err[0]!.requestId).toBeUndefined();
      const stoppedAt = h.host.world('d1')!.tick;
      expect(stoppedAt).toBeGreaterThanOrEqual(before);
      expect(err[0]!.lastValidTick).toBe(stoppedAt);
      h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 4 });
      h.advance(1000);
      expect(h.host.world('d1')!.tick).toBe(stoppedAt);
      expect(h.of('error')).toHaveLength(1); // no error storm: the dish stays paused
      expect(h.of('snapshot').at(-1)!.speed).toBe(0);
    });

    // KNOWN GAP (reported): the host pauses a failing dish but does not roll back a request that
    // threw part-way, so the world keeps partial mutations (here: a consumed command seq) and its
    // hash no longer equals the last valid state (ARCH §7 "last valid state preserved"). Change
    // `it.fails` to `it` once DishHost restores the pre-request state on error.
    it.fails('a throwing command leaves the last valid state (and hash) exactly as it was', () => {
      const h = harness();
      h.host.handle({ type: 'create', requestId: 1, dishId: 'd1', source: RECIPE });
      h.host.handle({ type: 'step', dishId: 'd1' });
      h.host.handle({ type: 'command', requestId: 2, dishId: 'd1', commandId: 'ok', payload: SUGAR, undoable: true });
      const before = h.hash('d1', 3);
      h.host.handle({ type: 'command', requestId: 4, dishId: 'd1', commandId: 'bad', payload: BROKEN, undoable: true });
      expect(h.of('error')).toHaveLength(1);
      expect(h.hash('d1', 5)).toBe(before);
      expect(h.host.world('d1')!.commands.log.map((c) => c.commandId)).toEqual(['ok']);
    });
  });
});
