/**
 * Worker performance counters (P4.13; ARCH §13 "in-app opt-in diagnostics overlay shows tick ms, effective
 * speed, snapshot ms, fps, memory"; SPEC §16).
 *
 * Worker only: DishHost times stepDish and sendSnapshot with performance.now() while Settings → "Show
 * performance numbers" is on, and each snapshot then carries a PerfSample. Nothing here is read by the
 * simulation, saved or hashed, and nothing is timed while diagnostics are off (the host does not call
 * performance.now() at all then). Timings are wall clock in the worker, so on a busy device they include
 * waiting for a CPU; a bug report quotes them with the device.
 */
import type { PerfSample } from './protocol';

/** Ticks and snapshots the ring keeps (30 s of dish time at 1×). */
export const PERF_RING = 300;

export class PerfCounters {
  private readonly tickMs = new Float64Array(PERF_RING);
  private readonly relMs = new Float64Array(PERF_RING);
  private readonly snapMs = new Float64Array(PERF_RING);
  private ticks = 0;
  private tickHead = 0;
  private snaps = 0;
  private snapHead = 0;

  /** Forget everything (diagnostics turned on again). */
  reset(): void {
    this.ticks = 0;
    this.tickHead = 0;
    this.snaps = 0;
    this.snapHead = 0;
  }

  /** One tick of the played dish took `ms`, of which `relationshipMs` was the relationship watcher. */
  recordTick(ms: number, relationshipMs: number): void {
    this.tickMs[this.tickHead] = ms;
    this.relMs[this.tickHead] = relationshipMs;
    this.tickHead = (this.tickHead + 1) % PERF_RING;
    if (this.ticks < PERF_RING) this.ticks++;
  }

  /** One snapshot took `ms` to build and post. */
  recordSnapshot(ms: number): void {
    this.snapMs[this.snapHead] = ms;
    this.snapHead = (this.snapHead + 1) % PERF_RING;
    if (this.snaps < PERF_RING) this.snaps++;
  }

  get ticksMeasured(): number {
    return this.ticks;
  }

  /** The current reading: tick p50 / p95 over the ring, the last snapshot's time, the watcher's mean share. */
  sample(): PerfSample {
    const n = this.ticks;
    const sorted = Array.from(this.tickMs.subarray(0, n)).sort((a, b) => a - b);
    let rel = 0;
    for (let k = 0; k < n; k++) rel += this.relMs[k]!;
    const lastSnap = this.snaps === 0 ? 0 : this.snapMs[(this.snapHead + PERF_RING - 1) % PERF_RING]!;
    return {
      tickMsP50: round2(percentile(sorted, 0.5)),
      tickMsP95: round2(percentile(sorted, 0.95)),
      ticksMeasured: n,
      snapshotMs: round2(lastSnap),
      relationshipMs: round2(n === 0 ? 0 : rel / n),
    };
  }
}

/** Nearest-rank percentile of an ascending list (0 when empty). */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const k = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[k]!;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
