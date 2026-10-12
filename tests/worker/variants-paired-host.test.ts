/**
 * P4.5 Paired Garden variants through the real DishHost (an in-memory save store), exactly as
 * sim.worker.ts drives it:
 * - start refuses an unknown idea, R-G0 itself and a busy comparison, and changes nothing (no dish, no
 *   comparison, nothing written);
 * - the open dish is kept first (D-0033), after both arms are realized;
 * - a horizon other than 1800 ticks refuses and nothing runs;
 * - no command reaches either arm (and the change cannot be "cleared");
 * - the run gives both arms exactly 1800 ticks, then Close (compareDelete) leaves the idea's own dish at
 *   tick 0 exactly as it started, and nothing touches any save slot;
 * - sequential mode lets A go before B runs, refuses Stop while B catches up, and its results equal
 *   the paired mode's for the same stop tick.
 */
import { describe, expect, it } from 'vitest';
import { stateHash } from '../../src/sim/serialize';
import { variantRecordOf } from '../../src/sim/variants';
import type { World } from '../../src/sim/world';
import { gunzipText } from '../../src/persistence/compress';
import { loadSaveFile } from '../../src/persistence/saveFile';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import type { ComparisonState } from '../../src/worker/comparison';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, KeepFrom, ToWorker } from '../../src/worker/protocol';
import { VARIANT_PAIR_BASE as WORKER_BASE, VARIANT_PAIR_TICKS } from '../../src/worker/variantPair';
import { VARIANT_PAIR_BASE as UI_BASE, VARIANT_PAIR_SECONDS as UI_SECONDS, pairOffered } from '../../src/ui/strings/variantPair';
import { pairRunsSequentially } from '../../src/ui/state';
import { registry } from '../helpers/world';

const REG = registry();
const GARDEN = { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } as const;

type Of<T extends FromWorker['type']> = Extract<FromWorker, { type: T }>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

function harness() {
  let now = 0;
  let req = 0;
  const out: FromWorker[] = [];
  const backend = new MemoryBackend();
  const host = new DishHost(REG, (m) => out.push(m), { now: () => now, iso: () => '2026-10-11T00:00:00.000Z' }, new SaveStore(backend), true);
  const h = {
    host,
    out,
    backend,
    async ask(msg: DistributiveOmit<ToWorker, 'requestId'>): Promise<FromWorker> {
      const requestId = ++req;
      host.handle({ ...msg, requestId } as ToWorker);
      const deadline = Date.now() + 60_000;
      for (;;) {
        const reply = out.find((m) => 'requestId' in m && m.requestId === requestId);
        if (reply) return reply;
        if (Date.now() > deadline) throw new Error(`no reply to ${msg.type}`);
        await new Promise((r) => setTimeout(r, 2));
      }
    },
    async create(dishId: string): Promise<void> {
      const r = await h.ask({ type: 'create', dishId, source: GARDEN });
      if (r.type !== 'ready') throw new Error(JSON.stringify(r));
    },
    world(dishId: string): World {
      const w = host.world(dishId);
      if (!w) throw new Error(`no dish ${dishId}`);
      return w;
    },
    frame(ms: number): void {
      now += ms;
      host.pump();
    },
    storeState: () => JSON.stringify({ slots: backend.slots, records: Object.keys(backend.records).sort() }),
    async slotHash(slotId: string): Promise<string> {
      const info = backend.slots[slotId];
      if (!info) throw new Error(`slot ${slotId} is empty`);
      return stateHash((await loadSaveFile(await gunzipText(backend.records[info.current]!.data))).world);
    },
    /** The latest comparison state the host posted. */
    lastCompare(): ComparisonState {
      const s = out.filter((m): m is Of<'compareState'> => m.type === 'compareState').at(-1);
      if (!s) throw new Error('no comparison state');
      return s.state;
    },
  };
  return h;
}

type H = ReturnType<typeof harness>;

const ids = (n: string) => ({ compareId: `cmp-${n}`, aDishId: `cmp-${n}-A`, bDishId: `cmp-${n}-B` });

async function startPair(h: H, n: string, variantId: string, opts: { sequential?: boolean; keepFrom?: KeepFrom } = {}): Promise<FromWorker> {
  return h.ask({ type: 'variantPairStart', variantId, newDishId: `idea-${n}`, compare: ids(n), sequential: opts.sequential === true, ...(opts.keepFrom ? { keepFrom: opts.keepFrom } : {}) });
}

async function run(h: H, compareId: string, horizonTicks: number | null, speed: 0 | 1 | 4 | 'max' = 'max'): Promise<FromWorker> {
  return h.ask({ type: 'compareRun', compareId, horizonTicks, speed });
}

/** Pump frames until the comparison completes (bounded). */
function pumpToEnd(h: H): ComparisonState {
  for (let k = 0; k < 2000; k++) {
    h.frame(16);
    const s = h.lastCompare();
    if (s.status === 'complete' || s.status === 'failed') return s;
  }
  throw new Error('comparison did not finish');
}

describe('P4.5 paired Garden variants (host)', () => {
  it('the UI and the worker agree on the horizon and the base; the pair is offered for Garden ideas only', () => {
    expect(UI_SECONDS * 10).toBe(VARIANT_PAIR_TICKS);
    expect(UI_BASE).toBe(WORKER_BASE);
    expect(pairOffered({ id: 'R-G1', sourceId: 'FIRST_DISH_V1' }, 'FIRST_DISH_V1')).toBe(true);
    expect(pairOffered({ id: 'R-G0', sourceId: 'FIRST_DISH_V1' }, 'FIRST_DISH_V1')).toBe(false);
    expect(pairOffered({ id: 'R-L1', sourceId: 'LABR01' }, 'FIRST_DISH_V1')).toBe(false);
    // SPEC §13.4 "sequentially if memory requires": 2 GB or less; unknown memory runs paired.
    expect(pairRunsSequentially({ deviceMemory: 2 })).toBe(true);
    expect(pairRunsSequentially({ deviceMemory: 0.5 })).toBe(true);
    expect(pairRunsSequentially({ deviceMemory: 4 })).toBe(false);
    expect(pairRunsSequentially({})).toBe(false);
    expect(pairRunsSequentially(undefined)).toBe(false);
  });

  it('refuses an unknown idea, R-G0 itself and a busy comparison, and changes nothing', async () => {
    const h = harness();
    await h.create('open');
    for (let k = 0; k < 5; k++) h.host.handle({ type: 'step', dishId: 'open' });
    const openHash = stateHash(h.world('open'));
    const store = h.storeState();
    const keepFrom: KeepFrom = { dishId: 'open', keep: { kind: 'auto' } };
    for (const [n, id, why] of [
      ['u', 'R-G9', /no What if\? idea "R-G9"/],
      ['g', 'R-G0', /compared with/],
    ] as const) {
      const r = await startPair(h, n, id, { keepFrom });
      expect(r).toMatchObject({ type: 'whatIfRefused' });
      expect((r as Of<'whatIfRefused'>).message).toMatch(why);
      expect(h.host.world(`idea-${n}`)).toBeNull();
      expect(h.host.world(ids(n).aDishId)).toBeNull();
      expect(h.host.world(ids(n).bDishId)).toBeNull();
    }
    // A comparison already open: refused too (nothing kept, nothing opened).
    const cmp = await h.ask({ type: 'compareStart', sourceDishId: 'open', ...ids('busy') });
    expect(cmp.type).toBe('compareState');
    const busy = await startPair(h, 'b', 'R-G1', { keepFrom });
    expect(busy).toMatchObject({ type: 'whatIfRefused', message: expect.stringMatching(/already open/) });
    expect(h.host.world('idea-b')).toBeNull();
    expect(h.lastCompare().compareId).toBe('cmp-busy');
    // Ids already in use: refused.
    await h.ask({ type: 'compareDelete', compareId: 'cmp-busy' });
    const clash = await h.ask({ type: 'variantPairStart', variantId: 'R-G1', newDishId: 'open', compare: ids('c'), sequential: false, keepFrom });
    expect(clash).toMatchObject({ type: 'whatIfRefused' });
    expect(h.storeState()).toBe(store); // nothing was written
    expect(stateHash(h.world('open'))).toBe(openHash); // the open dish is untouched
  });

  it('keeps the open dish first, then opens the idea paused at tick 0 with the pair in setup', async () => {
    const h = harness();
    await h.create('open');
    for (let k = 0; k < 7; k++) h.host.handle({ type: 'step', dishId: 'open' });
    const openHash = stateHash(h.world('open'));
    const r = await startPair(h, 'k', 'R-G2', { keepFrom: { dishId: 'open', keep: { kind: 'auto' } } });
    expect(r.type).toBe('variantPairStarted');
    const started = r as Of<'variantPairStarted'>;
    expect(started.kept).toMatchObject({ kind: 'slot', slot: { slotId: 'slot1' } });
    expect(await h.slotHash('slot1')).toBe(openHash); // the kept dish is exactly what was open
    expect(started.info.dishId).toBe('idea-k');
    expect(started.info.tick).toBe(0);
    const c = started.compare;
    expect(c).toMatchObject({ status: 'setup', sourceDishId: 'idea-k', horizonTicks: VARIANT_PAIR_TICKS, interventions: [], baselineTick: 0 });
    expect(c.variantPair).toMatchObject({
      variantId: 'R-G2',
      revision: 1,
      title: 'A bigger meal',
      question: 'Does more food help every family?',
      identity: 'R-G2 / revision 1 / seed 104729',
      baseIdentity: 'R-G0 / revision 1 / seed 104729',
      change: "B's sugar patch held 0.80 C per cell instead of 0.40.",
      sequential: false,
      phase: null,
      sugarEnd: null,
    });
    expect(c.variantPair!.sugarStart.b).toBeGreaterThan(c.variantPair!.sugarStart.a);
    // Both arms are at tick 0; the idea's dish holds exactly the recorded start of the idea.
    expect(h.world(c.aDishId).tick).toBe(0);
    expect(h.world(c.bDishId).tick).toBe(0);
    const idea = h.world('idea-k');
    expect(stateHash(idea)).toBe(variantRecordOf(idea)!.initialStateHash);
    expect(stateHash(h.world(c.bDishId))).toBe(stateHash(idea));
  });

  it('refuses any horizon other than 180 s, takes no command, and runs both arms exactly 1800 ticks; Close leaves the idea at tick 0', async () => {
    const h = harness();
    await h.create('open');
    const r = (await startPair(h, 'r', 'R-G1')) as Of<'variantPairStarted'>;
    expect(r.type).toBe('variantPairStarted');
    const c = r.compare;
    const ideaStart = stateHash(h.world('idea-r'));
    // Any other horizon (60 s, 600 s, until Stop) is refused and nothing runs.
    for (const horizon of [600, 6000, null, 1799]) {
      const refused = await run(h, c.compareId, horizon);
      expect(refused).toMatchObject({ type: 'error', message: expect.stringMatching(/always runs 180 seconds/) });
    }
    h.frame(500);
    expect(h.world(c.aDishId).tick).toBe(0);
    expect(h.world(c.bDishId).tick).toBe(0);
    // No command reaches either arm; the idea's change cannot be cleared.
    for (const dishId of [c.aDishId, c.bDishId]) {
      const ack = (await h.ask({ type: 'command', dishId, commandId: `x-${dishId}`, payload: { kind: 'setLid', lid: 'open' }, undoable: true })) as Of<'ack'>;
      expect(ack.type).toBe('ack');
      expect(ack.result).toBeNull();
      expect(ack.error).toBeTruthy();
    }
    const reset = await h.ask({ type: 'compareReset', compareId: c.compareId });
    expect(reset).toMatchObject({ type: 'error' });
    const store = h.storeState();
    // The fixed horizon runs.
    const running = (await run(h, c.compareId, VARIANT_PAIR_TICKS, 'max')) as Of<'compareState'>;
    expect(running.state.status).toBe('running');
    const done = pumpToEnd(h);
    expect(done.status).toBe('complete');
    const res = done.results!;
    expect(res.ticks).toBe(VARIANT_PAIR_TICKS);
    expect(res.a.tick).toBe(VARIANT_PAIR_TICKS);
    expect(res.b.tick).toBe(VARIANT_PAIR_TICKS);
    expect(res.stoppedEarly).toBe(false);
    expect(res.interventions).toEqual([]);
    expect(res.label).toBe('this paired run');
    expect(done.variantPair!.sugarEnd).not.toBeNull();
    expect(h.world(c.aDishId).commands.log).toEqual([]);
    expect(h.world(c.bDishId).commands.log).toEqual([]);
    // The idea's own dish never ran during the comparison.
    expect(h.world('idea-r').tick).toBe(0);
    expect(stateHash(h.world('idea-r'))).toBe(ideaStart);
    // Close: the comparison and its copies go; the idea's dish opens at tick 0, paused.
    await h.ask({ type: 'compareDelete', compareId: c.compareId });
    expect(h.host.world(c.aDishId)).toBeNull();
    expect(h.host.world(c.bDishId)).toBeNull();
    h.host.handle({ type: 'activate', dishId: 'idea-r' });
    h.frame(200);
    expect(h.world('idea-r').tick).toBe(0);
    expect(stateHash(h.world('idea-r'))).toBe(ideaStart);
    expect(h.storeState()).toBe(store); // nothing touched any save slot
  }, 600_000);

  it('sequential: A runs first and is let go, Stop is refused while B catches up, and the results equal the paired run stopped at the same tick', async () => {
    const results: ComparisonState[] = [];
    for (const sequential of [false, true]) {
      const h = harness();
      const r = (await startPair(h, 's', 'R-G3', { sequential })) as Of<'variantPairStarted'>;
      expect(r.type).toBe('variantPairStarted');
      const c = r.compare;
      expect(c.variantPair!.sequential).toBe(sequential);
      await run(h, c.compareId, VARIANT_PAIR_TICKS, 1);
      for (let k = 0; k < 30; k++) h.frame(100); // 1×: one tick (or pair) per 100 ms
      expect(h.lastCompare().ticksRun).toBe(30);
      if (sequential) {
        expect(h.lastCompare().variantPair!.phase).toBe('A');
        expect(h.world(c.bDishId).tick).toBe(0); // B has not started
      }
      const stopped = (await h.ask({ type: 'compareStop', compareId: c.compareId })) as Of<'compareState'>;
      if (sequential) {
        // A ended at 30 ticks and was let go; B must still run exactly 30 ticks.
        expect(stopped.state.status).toBe('running');
        expect(stopped.state.variantPair).toMatchObject({ phase: 'B', targetTicks: 30 });
        expect(h.host.world(c.aDishId)).toBeNull();
        for (let k = 0; k < 5; k++) h.frame(100);
        expect(h.world(c.bDishId).tick).toBe(5);
        const again = await h.ask({ type: 'compareStop', compareId: c.compareId });
        expect(again).toMatchObject({ type: 'error', message: expect.stringMatching(/same time/) });
        h.host.handle({ type: 'compareSpeed', compareId: c.compareId, speed: 'max' });
        results.push(pumpToEnd(h));
      } else {
        expect(stopped.state.status).toBe('complete');
        results.push(stopped.state);
      }
    }
    const [paired, seq] = results as [ComparisonState, ComparisonState];
    expect(paired.results!.ticks).toBe(30);
    expect(paired.results!.stoppedEarly).toBe(true);
    expect(seq.results).toEqual(paired.results);
    expect(seq.variantPair!.sugarEnd).toEqual(paired.variantPair!.sugarEnd);
  }, 300_000);
});
