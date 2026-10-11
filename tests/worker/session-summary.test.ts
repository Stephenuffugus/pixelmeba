/**
 * P4.3 session memory (D08 "A satisfying stopping point": the dish name, a current image and one
 * recorded change if available; nothing invented when the dish was quiet). The worker's 'sessionSummary'
 * query reads history samples and branch records only. Unlike 'history' (whose host case records the
 * experiment player step "open the resource history"), it never notes a player step, so a summary on
 * Home can never complete a card step the player did not take (docs/reports/reviews/g3-wave-4b/a11y-build.md).
 */
import { describe, expect, it } from 'vitest';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { DishHost, sessionSummaryOf } from '../../src/worker/host';
import type { FromWorker, SessionSummary, ToWorker } from '../../src/worker/protocol';
import { sessionMemoryLine } from '../../src/ui/strings/home';
import { registry } from '../helpers/world';

type Of<T extends FromWorker['type']> = Extract<FromWorker, { type: T }>;
const REG = registry();

function harness() {
  let now = 0;
  let req = 0;
  const out: FromWorker[] = [];
  const host = new DishHost(REG, (m) => out.push(m), { now: () => now, iso: () => '2026-10-10T00:00:00.000Z' });
  return {
    host,
    out,
    ask<T extends FromWorker['type']>(type: T, build: (requestId: number) => ToWorker): Of<T> {
      const requestId = ++req;
      host.handle(build(requestId));
      const reply = out.find((m) => 'requestId' in m && m.requestId === requestId);
      if (!reply || reply.type !== type) throw new Error(`expected ${type}, got ${JSON.stringify(reply).slice(0, 300)}`);
      return reply as Of<T>;
    },
    runTo(dishId: string, tick: number): void {
      host.handle({ type: 'setSpeed', dishId, speed: 4 });
      while (host.world(dishId)!.tick < tick) {
        now += 25;
        host.pump();
      }
      host.handle({ type: 'setSpeed', dishId, speed: 0 });
    },
    stamps: () => out.filter((m) => m.type === 'experimentStamp'),
  };
}

const summaryOf = (h: ReturnType<typeof harness>, dishId: string, sinceTick: number): SessionSummary =>
  h.ask('sessionSummary', (requestId) => ({ type: 'sessionSummary', requestId, dishId, sinceTick })).summary;

describe('the sessionSummary query', () => {
  it('is read-only (the state hash is equal) and records no experiment player step, where History would (EXP_103)', () => {
    const h = harness();
    h.ask('experimentStarted', (requestId) => ({ type: 'experimentStart', requestId, cardId: 'EXP_103', newDishId: 'crew', compare: null }));
    h.runTo('crew', 200);
    // EXP_103's measured gate held at 12 s; its stamp waits only for the step "open the resource history".
    expect(h.stamps()).toHaveLength(0);
    const before = stateHash(h.host.world('crew')!);
    const s = summaryOf(h, 'crew', 0);
    summaryOf(h, 'crew', 100);
    expect(stateHash(h.host.world('crew')!)).toBe(before);
    expect(s.toTick).toBe(200);
    expect(h.stamps()).toHaveLength(0); // no player step was noted
    // The control: the History sheet's own request does note the step, and the stamp posts.
    h.ask('history', (requestId) => ({ type: 'history', requestId, dishId: 'crew' }));
    expect(h.stamps()).toHaveLength(1);
  }, 120_000);

  it('a quiet paused dish yields no line: nothing recorded since it was opened', () => {
    const h = harness();
    h.ask('ready', (requestId) => ({ type: 'create', requestId, dishId: 'g', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } }));
    h.runTo('g', 120);
    const opened = h.host.world('g')!.tick;
    // Paused since: the player looked, then saved and left.
    const s = summaryOf(h, 'g', opened);
    expect(s.fromTick).toBe(opened);
    expect(s.toTick).toBe(opened);
    expect(s.births.every((n) => n === 0)).toBe(true);
    expect(s.deaths.every((n) => n === 0)).toBe(true);
    expect(s.branches).toEqual([]);
    expect(s.compacted).toBe(false);
    expect(sessionMemoryLine(s)).toBeNull();
  });

  it('a dish with births yields the births line, counting exactly the per-second samples after the opening tick', () => {
    const h = harness();
    h.ask('ready', (requestId) => ({ type: 'create', requestId, dishId: 'g', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } }));
    h.runTo('g', 100);
    const opened = 100;
    h.runTo('g', 600);
    const w = h.host.world('g')!;
    const s = summaryOf(h, 'g', opened);
    // Sample S covers the steps starting at ticks (S − 1)·10 … S·10 − 1: whole after the opening when (S − 1)·10 ≥ opened.
    const want = w.history.seconds.filter((x) => (x.second - 1) * 10 >= opened).reduce((a, x) => a + x.births.reduce((p, q) => p + q, 0), 0);
    const total = s.births.reduce((a, b) => a + b, 0);
    expect(want).toBeGreaterThan(0); // FIRST_DISH_V1's Sprinters first divide at about 36 s
    expect(total).toBe(want);
    expect(s.branches).toEqual([]);
    expect(sessionMemoryLine(s)).toBe(`${total} births were recorded since you opened it.`);
    // Births before the opening tick are not claimed.
    const all = summaryOf(h, 'g', 0).births.reduce((a, b) => a + b, 0);
    expect(all).toBeGreaterThanOrEqual(total);
  });
});

describe('sessionSummaryOf at an opening tick that is not a whole second (fix round 1)', () => {
  const sumBirths = (b: readonly number[]) => b.reduce((a, x) => a + x, 0);

  it('the step starting at tick T records its births into the sample with second ⌊T/10⌋ + 1 (the arithmetic the query relies on)', () => {
    const w = realizeRecipe(REG, REG.recipes.FIRST_DISH_V1!, { worldId: 'b' });
    let checked = 0;
    for (let k = 0; k < 600; k++) {
      const t = w.tick;
      const before = w.counters.nextEventId;
      run(w, 1);
      const births = w.events.ring.filter((e) => e.id >= before && e.type === 'birth');
      for (const e of births) expect(e.tick).toBe(t);
      if (births.length === 0) continue;
      // Finish the second, then the sample for ⌊t/10⌋ + 1 holds at least these births.
      while (w.tick % 10 !== 0) run(w, 1);
      const smp = w.history.seconds.find((x) => x.second === Math.floor(t / 10) + 1)!;
      expect(sumBirths(smp.births)).toBeGreaterThanOrEqual(births.length);
      checked++;
      if (checked >= 3) break;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('opened at tick 105: the second 10–11 s (steps 100…109) is left out and flagged, never counted as “since you opened it”', () => {
    const w = realizeRecipe(REG, REG.recipes.FIRST_DISH_V1!, { worldId: 'p' });
    run(w, 200);
    const n = w.species.length;
    const sample = (second: number, births: number) => ({
      ...w.history.seconds[0]!,
      second,
      births: Array.from({ length: n }, (_, j) => (j === 0 ? births : 0)),
      deaths: new Array<number>(n).fill(0),
    });
    // A test-only history (observation records; the simulation never reads them).
    w.history.minutes = [];
    w.history.seconds = [sample(10, 1), sample(11, 4), sample(12, 2), sample(13, 3)];
    const at105 = sessionSummaryOf(w, 105);
    expect(at105.births[0]).toBe(5); // seconds 12 and 13 only; the old rule (second > 10.5) also took second 11's 4
    expect(at105.compacted).toBe(true);
    expect(sessionMemoryLine(at105)).toBe('At least 5 births were recorded since you opened it.');
    const at110 = sessionSummaryOf(w, 110); // a whole second: nothing straddles
    expect(at110.births[0]).toBe(5);
    expect(at110.compacted).toBe(false);
    const at100 = sessionSummaryOf(w, 100);
    expect(at100.births[0]).toBe(9);
    expect(at100.compacted).toBe(false);
    // Opened at 129: second 13 (steps 120…129) straddles; nothing whole is left, so no line at all.
    const at129 = sessionSummaryOf(w, 129);
    expect(sumBirths(at129.births)).toBe(0);
    expect(sessionMemoryLine(at129)).toBeNull();
  });

  it('a branch established in the first step after opening counts (establishedTick = the opening tick); one from the step before does not', () => {
    const w = realizeRecipe(REG, REG.recipes.FIRST_DISH_V1!, { worldId: 'q' });
    run(w, 200);
    const sp = w.species.findIndex((x) => x.id === 'B01');
    const branch = (id: number, establishedTick: number) => ({
      id,
      species: sp,
      rootBirthId: 1,
      refGenome: 0,
      parentBranch: -1,
      shortId: `b${id}`,
      candidateTick: establishedTick - 50,
      establishedTick,
      extinctTick: -1,
      alive: 3,
      name: `Test ${id}`,
    });
    // Test-only records: the step that starts at world tick T stamps establishedTick T (src/sim/branches.ts).
    (w.branches.branches as unknown[]).push(branch(0, 149), branch(1, 150));
    const s = sessionSummaryOf(w, 150);
    expect(s.branches.map((b) => b.id)).toEqual([1]);
    expect(sessionMemoryLine(s)).toBe('A new branch was established: Test 1 · b1.');
  });
});

describe('sessionSummaryOf and its one line', () => {
  it('a summarized minute that began before the opening is left out and flagged; the line then says “At least”', () => {
    const w = realizeRecipe(REG, REG.recipes.FIRST_DISH_V1!, { worldId: 's' });
    run(w, 20);
    const n = w.species.length;
    const sample = (second: number, births: number) => ({
      ...w.history.seconds[0]!,
      second,
      births: Array.from({ length: n }, (_, j) => (j === 1 ? births : 0)),
      deaths: new Array<number>(n).fill(0),
    });
    // A test-only history (observation records; the simulation never reads them).
    w.history.minutes = [sample(60, 7), sample(120, 5)];
    w.history.seconds = [sample(121, 1), sample(122, 2)];
    w.tick = 1220; // the clock those records end at (sessionSummaryOf never reads past the world's tick)
    const straddling = sessionSummaryOf(w, 900); // opened at 90 s: the minute 60–120 s began before
    expect(straddling.births[1]).toBe(3);
    expect(straddling.compacted).toBe(true);
    expect(sessionMemoryLine(straddling)).toBe('At least 3 births were recorded since you opened it.');
    const whole = sessionSummaryOf(w, 600); // opened at 60 s: the minute 60–120 s is whole
    expect(whole.births[1]).toBe(8);
    expect(whole.compacted).toBe(false);
  });

  it('the first established branch is the one line, before births', () => {
    const base: SessionSummary = { births: [0, 4], deaths: [0, 0], branches: [], fromTick: 0, toTick: 100, compacted: false };
    expect(sessionMemoryLine(base)).toBe('4 births were recorded since you opened it.');
    expect(sessionMemoryLine({ ...base, births: [0, 1] })).toBe('1 birth was recorded since you opened it.');
    const withBranches: SessionSummary = {
      ...base,
      branches: [
        { id: 3, name: 'Sprinter · faster · b7', tick: 80 },
        { id: 2, name: 'Sprinter · slower · a1', tick: 40 },
      ],
    };
    expect(sessionMemoryLine(withBranches)).toBe('A new branch was established: Sprinter · slower · a1.');
  });
});
