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
import { run, step } from '../../src/sim/tick';
import { SimClient, WorkerRequestError, type WorkerErrorNotice, type WorkerLike } from '../../src/worker/client';
import { DishHost } from '../../src/worker/host';
import {
  CUE2_ANCHORED,
  CUE2_DETRITUS_INTAKE,
  CUE2_INFECTED,
  CUE2_LINKED,
  CUE2_MOD_E04,
  CUE2_MOD_E06,
  CUE2_MOD_E07,
  CUE2_MOD_E10,
  CUE2_MOD_E12,
  CUE2_PARASITIZED,
  CUE2_RELEASING_PROTEIN,
  CUE2_SEEKING_LIGHT,
  DEPOSIT_FILM_BAND,
  E_CUE2,
  E_LINKMASK,
  E_X,
  E_Y,
  ENT_STRIDE,
  FILM_ERODING,
  FILM_LEVEL_MASK,
  ID_STRIDE,
  LINK_KIND_ADHESION,
  LINK_STRIDE,
  LINKMASK_DIRS,
  LINKMASK_E,
  LINKMASK_N,
  LINKMASK_S,
  LINKMASK_TRANSFER,
  LINKMASK_W,
  PROTOCOL_VERSION,
  type FromWorker,
  type ToWorker,
} from '../../src/worker/protocol';
import { DEPOSIT_BANDS, packDeposits, packEntities, packLinks, packObjects } from '../../src/worker/snapshot';
import { introduceOrganism } from '../../src/sim/commands';
import { CELL_COUNT } from '../../src/sim/constants';
import { FLAG } from '../../src/sim/entities';
import { cellIndex, SUB_GEL } from '../../src/sim/grid';
import { FUNGAL_SLOT_COLUMNS, FUNGAL_BIRTH_COLUMNS, LINK_VISUAL } from '../../src/sim/links';
import { rebuildIndex } from '../../src/sim/spatial';
import { speciesIndex, type World } from '../../src/sim/world';
import { linkAdhesion, linkFungal, place, placeObject, registry, setField } from '../helpers/world';
import { registryWith } from '../helpers/registry';

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
  // Hand-delivered replies carry the protocol version like real worker packets (unless a test overrides it).
  const deliver = (m: unknown) => onmessage!({ data: { protocolVersion: PROTOCOL_VERSION, ...(m as object) } as unknown as FromWorker } as MessageEvent<FromWorker>);
  return { sent, worker, deliver };
}

/** SimClient wired to a real DishHost; replies arrive asynchronously, as from a real worker. */
function connected() {
  let onmessage: ((ev: MessageEvent<FromWorker>) => void) | null = null;
  const posted: FromWorker[] = [];
  const host = new DishHost(registry(), (m) => {
    posted.push(m);
    queueMicrotask(() => onmessage?.({ data: m } as unknown as MessageEvent<FromWorker>));
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
  return { host, client: new SimClient(worker), posted, sentToWorker, inject: (m: unknown) => onmessage!({ data: { protocolVersion: PROTOCOL_VERSION, ...(m as object) } as unknown as FromWorker } as MessageEvent<FromWorker>) };
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
    it('exports protocol version 2 (ARCH §7; D-0036: bumped once by wave 2 for the Phase 3 snapshot fields)', () => {
      expect(PROTOCOL_VERSION).toBe(2);
      expect(ENT_STRIDE).toBe(14);
      expect([E_CUE2, E_LINKMASK]).toEqual([12, 13]);
      expect(DEPOSIT_BANDS).toBe(7);
    });

    it('every packet in both directions carries protocolVersion', async () => {
      const c = connected();
      await c.client.create('d1', RECIPE);
      await c.client.command('d1', 'c1', SUGAR);
      await c.client.hash('d1');
      await c.client.hash('missing').catch(() => undefined);
      expect(c.posted.length).toBeGreaterThan(3);
      for (const m of c.posted) expect((m as { protocolVersion?: number }).protocolVersion, m.type).toBe(PROTOCOL_VERSION);
      for (const m of c.sentToWorker) expect((m as { protocolVersion?: number }).protocolVersion, m.type).toBe(PROTOCOL_VERSION);
    });

    it('the client refuses packets from a different protocol version and rejects the request', async () => {
      const w = manualWorker();
      const client = new SimClient(w.worker);
      const errors: string[] = [];
      client.onError((e) => errors.push(e.message));
      const p = client.hash('d1');
      const req = w.sent.at(-1) as { requestId: number };
      w.deliver({ type: 'hash', requestId: req.requestId, dishId: 'd1', hash: 'x', tick: 0, protocolVersion: PROTOCOL_VERSION + 1 });
      await expect(p).rejects.toBeInstanceOf(WorkerRequestError);
      expect(errors[0]).toMatch(/protocol version mismatch/);
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

    // Wave B fix round 2 (item 7d): the UI words an error by what really happened.
    it('error listeners hear whether the worker really paused the dish, and which request failed', async () => {
      const c = connected();
      const errors: WorkerErrorNotice[] = [];
      c.client.onError((e) => errors.push(e));
      await expect(c.client.create('bad', { kind: 'recipe', recipeId: 'NOPE' })).rejects.toBeInstanceOf(WorkerRequestError);
      await expect(c.client.hash('ghost')).rejects.toBeInstanceOf(WorkerRequestError);
      await c.client.create('d1', RECIPE);
      await expect(c.client.command('d1', 'bad', BROKEN, false)).rejects.toBeInstanceOf(WorkerRequestError);
      expect(errors).toEqual([
        { dishId: 'bad', message: expect.stringMatching(/NOPE/), paused: false, request: 'create' },
        { dishId: 'ghost', message: 'no dish ghost', paused: false, request: 'hash' },
        { dishId: 'd1', message: expect.any(String), paused: true, request: 'command' },
      ]);
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
      // The world was rolled back to the last completed tick: the sabotage is gone and the state equals
      // an undisturbed run to the same tick.
      expect(h.host.world('d1')!.fields.oxygen).toBeInstanceOf(Float64Array);
      const ref = harness();
      ref.host.handle({ type: 'create', requestId: 1, dishId: 'r', source: RECIPE });
      const rw = ref.host.world('r')!;
      while (rw.tick < stoppedAt) step(rw);
      expect(h.hash('d1', 90)).toBe(stateHash(rw));
      h.host.handle({ type: 'setSpeed', dishId: 'd1', speed: 4 });
      h.advance(1000);
      expect(h.host.world('d1')!.tick).toBe(stoppedAt);
      expect(h.of('error')).toHaveLength(1); // no error storm: the dish stays paused
      expect(h.of('snapshot').at(-1)!.speed).toBe(0);
    });

    it('a throwing command leaves the last valid state (and hash) exactly as it was', () => {
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

  /**
   * Protocol 2 packing (W2-23): E_CUE2 and E_LINKMASK for every entity, adhesion links, food objects and
   * the film band, from a hand-built world. The species and systems are enabled through registryWith
   * with allowUnimplemented: E04, E06, E07, E10 and E12 are wave 4 modules (no rule runs here; the packer
   * reads only the genome and the columns, set as labelled test state).
   */
  describe('protocol 2 packing (Phase 3 snapshot fields)', () => {
    function phase3World(): World {
      const shipped = registry();
      const m = shipped.manifest;
      const reg = registryWith(
        {
          enabledSpecies: [...new Set([...m.enabledSpecies, 'A01', 'B01', 'F01', 'V01', 'X01'])].sort(),
          enabledSystems: [...new Set([...m.enabledSystems, 'film', 'fungi', 'parasites', 'viruses'] as const)].sort(),
          enabledModules: [...new Set([...m.enabledModules, 'E04', 'E06', 'E07', 'E10', 'E12'])].sort(),
        },
        { allowUnimplemented: true },
      );
      const base = reg.recipes.FIRST_DISH_V1!;
      return realizeRecipe(reg, { ...base, id: 'TEST_P3_PACK', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' }, { worldId: 'p3-pack' });
    }

    function withModules(w: World, speciesId: string, x: number, y: number, modules: readonly string[]): number {
      const slot = introduceOrganism(w, speciesIndex(w, speciesId), cellIndex(Math.floor(x), Math.floor(y)), 'test', { modules, exactCenter: true });
      expect(slot, `${speciesId} ${modules.join(',')}`).toBeGreaterThanOrEqual(0);
      rebuildIndex(w);
      return slot;
    }

    function record(w: World, slot: number, packed = packEntities(w, null, null)): Float32Array {
      const b = w.ents.cols.birthId[slot]!;
      for (let k = 0; k < packed.count; k++) if (packed.ids[k * ID_STRIDE] === b) return packed.ents.subarray(k * ENT_STRIDE, (k + 1) * ENT_STRIDE);
      throw new Error(`slot ${slot} not packed`);
    }

    /** The link table's own answer: the direction of every valid fungal link of `slot` (N 1, E 2, S 4, W 8). */
    function maskFromTable(w: World, slot: number): number {
      const c = w.ents.cols;
      let mask = 0;
      for (let k = 0; k < 4; k++) {
        const j = c[FUNGAL_SLOT_COLUMNS[k]!][slot]!;
        if (j < 0 || !w.ents.refValid(j, c[FUNGAL_BIRTH_COLUMNS[k]!][slot]!)) continue;
        const dx = Math.floor(c.x[j]!) - Math.floor(c.x[slot]!);
        const dy = Math.floor(c.y[j]!) - Math.floor(c.y[slot]!);
        mask |= dx === 1 ? LINKMASK_E : dx === -1 ? LINKMASK_W : dy === 1 ? LINKMASK_S : LINKMASK_N;
      }
      return mask;
    }

    it('a hand-built world decodes to the link table, the expected cue bits, links, objects and film', () => {
      const w = phase3World();
      const c = w.ents.cols;
      // Three F01 segments on gel: a at (30, 40), b east of it, d south of it; a–b and a–d linked.
      for (const [x, y] of [[30, 40], [31, 40], [30, 41], [32, 40]] as const) w.grid.substrate[cellIndex(x, y)] = SUB_GEL;
      const a = place(w, 'F01', 30.5, 40.5);
      const b = place(w, 'F01', 31.5, 40.5);
      const d = place(w, 'F01', 30.5, 41.5);
      const lone = place(w, 'F01', 32.5, 40.5);
      linkFungal(w, a, b);
      linkFungal(w, a, d, LINK_VISUAL);
      // An infected Sprinter (labelled test state: what stage 5 would record).
      const inf = place(w, 'B01', 60.5, 64.5);
      c.infectedBy[inf] = 1;
      // A Hitcher attached to a Sunbead (the pair columns as stage 5 writes them, parasite on the host).
      const host = place(w, 'A01', 40.5, 64.5);
      const par = place(w, 'X01', 40.5, 64.5);
      c.hostSlot[par] = host;
      c.hostBirthId[par] = c.birthId[host]!;
      c.parasiteSlot[host] = par;
      c.parasiteBirthId[host] = c.birthId[par]!;
      // Module carriers: an anchored E04 + E10 Sprinter linked (E12) to another; a moving E07 Sunbead.
      const anch = withModules(w, 'B01', 70.5, 64.5, ['E04', 'E10', 'E12']);
      const mate = withModules(w, 'B01', 71.2, 64.5, ['E12']);
      c.anchorState[anch] = 1;
      linkAdhesion(w, anch, mate);
      const seeker = withModules(w, 'A01', 80.5, 64.5, ['E07', 'E06']);
      c.flags[seeker] = c.flags[seeker]! | FLAG.moving;
      const plain = place(w, 'B01', 90.5, 64.5);
      // A slow feeder pellet, partly used, and film in two cells.
      const pellet = placeObject(w, cellIndex(50, 50), 'pellet', { sugar: 10 }, 1);
      setField(w, 'film', cellIndex(20, 20), 0.25);
      setField(w, 'film', cellIndex(21, 20), 0.5);

      const packed = packEntities(w, null, null);
      // Link masks equal the link table, for every fungal segment.
      for (const s of [a, b, d, lone]) expect(record(w, s, packed)[E_LINKMASK]! & LINKMASK_DIRS, `segment ${s}`).toBe(maskFromTable(w, s));
      expect([a, b, d, lone].map((s) => record(w, s, packed)[E_LINKMASK])).toEqual([LINKMASK_E | LINKMASK_S, LINKMASK_W, LINKMASK_N, 0]);
      // No transfer bit before wave 3's F02 transport.
      for (let k = 0; k < packed.count; k++) expect(packed.ents[k * ENT_STRIDE + E_LINKMASK]! & LINKMASK_TRANSFER).toBe(0);
      // Cue bits from state only.
      expect(record(w, inf, packed)[E_CUE2]).toBe(CUE2_INFECTED);
      expect(record(w, host, packed)[E_CUE2]).toBe(CUE2_PARASITIZED);
      expect(record(w, par, packed)[E_CUE2]).toBe(0);
      expect(record(w, anch, packed)[E_CUE2]).toBe(CUE2_ANCHORED | CUE2_LINKED | CUE2_MOD_E04 | CUE2_MOD_E10 | CUE2_MOD_E12);
      expect(record(w, mate, packed)[E_CUE2]).toBe(CUE2_LINKED | CUE2_MOD_E12);
      expect(record(w, seeker, packed)[E_CUE2]).toBe(CUE2_MOD_E06 | CUE2_MOD_E07 | CUE2_SEEKING_LIGHT);
      expect(record(w, plain, packed)[E_CUE2]).toBe(0);
      // Reserved for wave 4: never set yet.
      for (let k = 0; k < packed.count; k++) expect(packed.ents[k * ENT_STRIDE + E_CUE2]! & (CUE2_DETRITUS_INTAKE | CUE2_RELEASING_PROTEIN)).toBe(0);
      // The parasite is packed exactly at its host's position (the renderer draws it over the host).
      expect([record(w, par, packed)[E_X], record(w, par, packed)[E_Y]]).toEqual([record(w, host, packed)[E_X], record(w, host, packed)[E_Y]]);
      // Adhesion links: each pair once, between the members' positions.
      const links = packLinks(w);
      expect(links.length).toBe(LINK_STRIDE);
      expect([...links]).toEqual([c.x[anch], c.y[anch], c.x[mate], c.y[mate], LINK_KIND_ADHESION].map((v) => Math.fround(v!)));
      // Food objects: cell centre and remaining C / full inventory (CT §5.2: M10 10 C).
      expect(packObjects(w)).toEqual([{ id: pellet.id, x: 50.5, y: 50.5, kind: 'pellet', fill: 1 }]);
      pellet.pools.sugar = 4;
      expect(packObjects(w)[0]!.fill).toBeCloseTo(0.4, 12);
      // Film band: level on a linear scale to the 0.50 C cap (127), not eroding on a first pack.
      const dep = packDeposits(w, null);
      expect(dep.length).toBe(DEPOSIT_BANDS * CELL_COUNT);
      const film = (cell: number) => dep[DEPOSIT_FILM_BAND * CELL_COUNT + cell]!;
      expect(film(cellIndex(20, 20))).toBe(64);
      expect(film(cellIndex(21, 20))).toBe(127);
      expect(film(cellIndex(22, 20))).toBe(0);
    });

    it('the film band marks eroding cells against the previous tick packed, and keeps the bits while paused', () => {
      const w = phase3World();
      setField(w, 'film', cellIndex(60, 60), 0.3);
      setField(w, 'film', cellIndex(64, 60), 0.3);
      const band = (dep: Uint8Array, x: number) => dep[DEPOSIT_FILM_BAND * CELL_COUNT + cellIndex(x, 60)]!;
      expect(band(packDeposits(w, null), 60) & FILM_ERODING).toBe(0);
      // The tick decays film (SPEC §7.1: 0.1 %/s into detritus): lower than at the last pack → eroding.
      step(w);
      // A builder topping the second cell back up (labelled test state) keeps it from eroding.
      setField(w, 'film', cellIndex(64, 60), 0.3);
      const after = packDeposits(w, null);
      expect(band(after, 60) & FILM_ERODING).toBe(FILM_ERODING);
      expect(band(after, 60) & FILM_LEVEL_MASK).toBe(76);
      expect(band(after, 64) & FILM_ERODING).toBe(0);
      // Packed again at the same tick (paused): unchanged.
      expect(band(packDeposits(w, null), 60)).toBe(band(after, 60));
      // A world without the film system packs an empty band.
      const g2 = realizeRecipe(registry(), registry().recipes.FIRST_DISH_V1!, { worldId: 'nofilm' });
      if (g2.fields.film === undefined) expect(packDeposits(g2, null).subarray(DEPOSIT_FILM_BAND * CELL_COUNT).every((v) => v === 0)).toBe(true);
    });

    it('a pooled buffer that held set bits packs 0 for a plain entity', () => {
      const w = phase3World();
      const plain = place(w, 'B01', 90.5, 64.5);
      const ents = new Float32Array(64 * ENT_STRIDE).fill(65535);
      const ids = new Uint32Array(64 * ID_STRIDE);
      const packed = packEntities(w, ents, ids);
      expect(packed.ents).toBe(ents); // reused, not reallocated
      const r = record(w, plain, packed);
      expect([r[E_CUE2], r[E_LINKMASK]]).toEqual([0, 0]);
      expect(packLinks(w).length).toBe(0);
      expect(packObjects(w)).toEqual([]);
    });

    it('every snapshot from the host carries links and objects (transferred with the other buffers)', () => {
      const h = harness();
      h.host.handle({ type: 'create', requestId: 1, dishId: 'd1', source: RECIPE });
      h.host.handle({ type: 'step', dishId: 'd1' });
      const snap = h.of('snapshot').at(-1)!;
      expect(snap.links).toBeInstanceOf(Float32Array);
      expect(Array.isArray(snap.objects)).toBe(true);
      expect(snap.deposits.length).toBe(DEPOSIT_BANDS * CELL_COUNT);
      expect(snap.ents.length % ENT_STRIDE).toBe(0);
    });
  });
});
