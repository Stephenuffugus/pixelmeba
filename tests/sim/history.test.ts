/**
 * P1.10 history buffers (SPEC §12.4): per-second samples for the last 30 simulated minutes, older
 * whole minutes compacted into one-minute summaries, summaries capped at six hours, compaction
 * labelled, interventions never lost. Driven with synthetic samples (no simulation needed), plus
 * one short real run to prove stage 10 feeds the buffer once per simulated second.
 */
import { describe, expect, it } from 'vitest';
import { HISTORY_MINUTES, HISTORY_SECONDS } from '../../src/sim/constants';
import { createHistory, pushSample, SECONDS_PER_SUMMARY, type History, type HistorySample } from '../../src/sim/history';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { registry } from '../helpers/world';

const SPECIES = 3;

/** A synthetic sample whose every field is a known function of its second. */
function sample(second: number, opts: { interventions?: number; capacity?: boolean } = {}): HistorySample {
  return {
    second,
    count: [second, 2 * second, 7],
    biomass: [second * 0.5, 1, 0],
    births: [1, second % 2, 0],
    deaths: [0, 1, second % 3 === 0 ? 1 : 0],
    oxygenMean: second,
    nutrientTotal: 1000 - second,
    sugarTotal: second * 0.25,
    capacityLimited: opts.capacity ?? false,
    interventions: opts.interventions ?? 0,
  };
}

function feed(h: History, from: number, to: number, special: Record<number, { interventions?: number; capacity?: boolean }> = {}): void {
  for (let s = from; s <= to; s++) pushSample(h, sample(s, special[s] ?? {}));
}

describe('history compaction (P1.10)', () => {
  it('keeps one sample per second for the first 30 minutes with nothing compacted', () => {
    const h = createHistory(SPECIES);
    feed(h, 1, HISTORY_SECONDS);
    expect(h.seconds).toHaveLength(HISTORY_SECONDS);
    expect(h.minutes).toHaveLength(0);
    expect(h.compacted).toBe(false);
    expect(h.seconds[0]!.second).toBe(1);
    expect(h.seconds.at(-1)!.second).toBe(HISTORY_SECONDS);
  });

  it('always retains the most recent 30 minutes at per-second resolution', () => {
    const h = createHistory(SPECIES);
    for (let s = 1; s <= HISTORY_SECONDS + 5 * SECONDS_PER_SUMMARY + 17; s++) {
      pushSample(h, sample(s));
      const newest = h.seconds.at(-1)!.second;
      const oldest = h.seconds[0]!.second;
      // Every second of the last 30 minutes is present, in order, with no gaps.
      expect(newest - oldest + 1).toBe(h.seconds.length);
      expect(h.seconds.length).toBeGreaterThanOrEqual(Math.min(s, HISTORY_SECONDS));
      expect(h.seconds.length).toBeLessThan(HISTORY_SECONDS + SECONDS_PER_SUMMARY);
    }
  });

  it('compacts the oldest whole minute into one summary once it falls outside the window', () => {
    const h = createHistory(SPECIES);
    feed(h, 1, HISTORY_SECONDS + SECONDS_PER_SUMMARY - 1);
    expect(h.minutes).toHaveLength(0);
    expect(h.compacted).toBe(false);
    pushSample(h, sample(HISTORY_SECONDS + SECONDS_PER_SUMMARY));
    expect(h.compacted).toBe(true);
    expect(h.minutes).toHaveLength(1);
    expect(h.seconds).toHaveLength(HISTORY_SECONDS);
    expect(h.seconds[0]!.second).toBe(SECONDS_PER_SUMMARY + 1);
    // Summaries and per-second samples tile time without overlap or gap.
    expect(h.minutes[0]!.second).toBe(SECONDS_PER_SUMMARY);
    expect(h.seconds[0]!.second).toBe(h.minutes[0]!.second + 1);
  });

  it('summarises stocks as end-of-minute values, flows as sums and oxygen as the minute mean', () => {
    const h = createHistory(SPECIES);
    feed(h, 1, HISTORY_SECONDS + SECONDS_PER_SUMMARY);
    const m = h.minutes[0]!;
    // Seconds 1..60 were compacted.
    expect(m.count).toEqual([60, 120, 7]);
    expect(m.biomass).toEqual([30, 1, 0]);
    expect(m.nutrientTotal).toBe(1000 - 60);
    expect(m.sugarTotal).toBe(15);
    // Flows keep their totals: births of species 1 = count of odd seconds, deaths of species 2 =
    // count of multiples of three in 1..60.
    expect(m.births).toEqual([60, 30, 0]);
    expect(m.deaths).toEqual([0, 60, 20]);
    expect(m.oxygenMean).toBeCloseTo(30.5, 12);
    expect(m.capacityLimited).toBe(false);
    expect(m.interventions).toBe(0);
  });

  it('preserves and marks interventions and capacity-limited intervals in summaries', () => {
    const h = createHistory(SPECIES);
    feed(h, 1, HISTORY_SECONDS + 2 * SECONDS_PER_SUMMARY, {
      5: { interventions: 2 },
      44: { interventions: 1, capacity: true },
      90: { interventions: 3 },
    });
    expect(h.minutes).toHaveLength(2);
    expect(h.minutes[0]!.interventions).toBe(3);
    expect(h.minutes[0]!.capacityLimited).toBe(true);
    expect(h.minutes[1]!.interventions).toBe(3);
    expect(h.minutes[1]!.capacityLimited).toBe(false);
    // Nothing is lost: every recorded intervention is in a summary or a per-second sample.
    const total = [...h.minutes, ...h.seconds].reduce((a, s) => a + s.interventions, 0);
    expect(total).toBe(6);
  });

  it('caps summaries at six hours, dropping the oldest minute first', () => {
    const h = createHistory(SPECIES);
    const fullSeconds = HISTORY_SECONDS + HISTORY_MINUTES * SECONDS_PER_SUMMARY + SECONDS_PER_SUMMARY - 1;
    feed(h, 1, fullSeconds);
    expect(h.minutes).toHaveLength(HISTORY_MINUTES);
    expect(h.minutes[0]!.second).toBe(SECONDS_PER_SUMMARY);
    // Two more minutes: the two oldest summaries go, the cap holds.
    feed(h, fullSeconds + 1, fullSeconds + 2 * SECONDS_PER_SUMMARY);
    expect(h.minutes).toHaveLength(HISTORY_MINUTES);
    expect(h.minutes[0]!.second).toBe(3 * SECONDS_PER_SUMMARY);
    expect(h.compacted).toBe(true);
    // Summaries stay contiguous minute steps ending right before the per-second window.
    for (let k = 1; k < h.minutes.length; k++) expect(h.minutes[k]!.second - h.minutes[k - 1]!.second).toBe(SECONDS_PER_SUMMARY);
    expect(h.seconds[0]!.second).toBe(h.minutes.at(-1)!.second + 1);
    expect(h.seconds).toHaveLength(HISTORY_SECONDS + SECONDS_PER_SUMMARY - 1);
  });

  it('stage 10 records one sample per simulated second and history survives save/reload', () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1');
    run(w, 120);
    const h = w.history;
    expect(h.seconds).toHaveLength(12);
    expect(h.seconds.map((s) => s.second)).toEqual(Array.from({ length: 12 }, (_, k) => k + 1));
    expect(h.seconds[0]!.count).toHaveLength(w.species.length);
    expect(h.seconds.at(-1)!.count.reduce((a, b) => a + b, 0)).toBe(w.ents.count);
    const copy = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))) as ReturnType<typeof serializeWorld>);
    expect(copy.history.seconds).toEqual(h.seconds);
    expect(copy.history.compacted).toBe(h.compacted);
  });
});
