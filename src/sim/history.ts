/**
 * History buffers (SPEC §12.4): one sample per simulated second for 30 minutes, then one-minute
 * summaries up to six hours. Sampling happens in stage 10 every 10 ticks.
 */
import { HISTORY_MINUTES, HISTORY_SECONDS } from './constants';

export interface HistorySample {
  readonly second: number;
  readonly count: readonly number[];
  readonly biomass: readonly number[];
  readonly births: readonly number[];
  readonly deaths: readonly number[];
  readonly oxygenMean: number;
  readonly nutrientTotal: number;
  readonly sugarTotal: number;
  readonly capacityLimited: boolean;
  readonly interventions: number;
}

export interface History {
  readonly speciesCount: number;
  seconds: HistorySample[];
  minutes: HistorySample[];
  /** Accumulators for the current second. */
  pendingBirths: number[];
  pendingDeaths: number[];
  pendingInterventions: number;
  pendingCapacity: boolean;
  compacted: boolean;
}

export function createHistory(speciesCount: number): History {
  return {
    speciesCount,
    seconds: [],
    minutes: [],
    pendingBirths: new Array<number>(speciesCount).fill(0),
    pendingDeaths: new Array<number>(speciesCount).fill(0),
    pendingInterventions: 0,
    pendingCapacity: false,
    compacted: false,
  };
}

function summarize(samples: readonly HistorySample[]): HistorySample {
  const n = samples.length;
  const last = samples[n - 1]!;
  const sp = last.count.length;
  const sum = (f: (s: HistorySample) => readonly number[], j: number) => samples.reduce((a, s) => a + f(s)[j]!, 0);
  return {
    second: last.second,
    count: last.count,
    biomass: last.biomass,
    births: Array.from({ length: sp }, (_, j) => sum((s) => s.births, j)),
    deaths: Array.from({ length: sp }, (_, j) => sum((s) => s.deaths, j)),
    oxygenMean: samples.reduce((a, s) => a + s.oxygenMean, 0) / n,
    nutrientTotal: last.nutrientTotal,
    sugarTotal: last.sugarTotal,
    capacityLimited: samples.some((s) => s.capacityLimited),
    interventions: samples.reduce((a, s) => a + s.interventions, 0),
  };
}

export function pushSample(h: History, s: HistorySample): void {
  h.seconds.push(s);
  if (h.seconds.length > HISTORY_SECONDS) {
    // Compact the oldest minute into a summary.
    const minute = h.seconds.splice(0, 60);
    h.minutes.push(summarize(minute));
    if (h.minutes.length > HISTORY_MINUTES) h.minutes.splice(0, h.minutes.length - HISTORY_MINUTES);
    h.compacted = true;
  }
}
