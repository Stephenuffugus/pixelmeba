/**
 * The diagnostics bar (P4.13; UX §2 Settings "diagnostics (opt-in)"; ARCH §13 "in-app opt-in diagnostics
 * overlay shows tick ms, effective speed, snapshot ms, fps, memory (where available)").
 *
 * Shown only while Settings → "Show performance numbers" is on: one line BELOW the dish's top strip that
 * is part of the layout (it shrinks the viewport and never covers the dish, UX §3.1 "Nothing small sits
 * over the dish"). Each reading has a data-testid so tools/perf-web.ts can read it. It reads the worker's
 * timings on the snapshots (src/worker/perfCounters.ts), the snapshot's effective speed, the renderer's
 * frame count and degrade level (src/render/budgets.ts), and performance.memory where the browser has it.
 * Reading it changes nothing.
 */
import { useEffect, useState } from 'preact/hooks';
import { diagPerf, getRenderer, meta } from '../state';

/** The main thread's JS heap in MB where the browser reports it (Chromium's performance.memory), else null. */
export function heapMB(): number | null {
  const m = (performance as Performance & { memory?: { usedJSHeapSize?: number } }).memory;
  return m && typeof m.usedJSHeapSize === 'number' ? m.usedJSHeapSize / 1048576 : null;
}

export interface DiagReadings {
  readonly tick: string;
  readonly speed: string;
  readonly snapshot: string;
  readonly fps: string;
  readonly memory: string;
  readonly level: string;
}

/** The six readings as shown (pure, so the wording is tested). */
export function diagReadings(r: {
  tickP50: number | null;
  tickP95: number | null;
  effective: number;
  speed: number;
  snapshotMs: number | null;
  fps: number | null;
  memoryMB: number | null;
  level: number | null;
}): DiagReadings {
  const ms = (v: number | null) => (v === null ? '–' : v.toFixed(1));
  return {
    tick: `Tick ${ms(r.tickP50)} ms (p95 ${ms(r.tickP95)})`,
    speed: `Speed ${r.effective.toFixed(1)}× of ${r.speed}×`,
    snapshot: `Snapshot ${ms(r.snapshotMs)} ms`,
    fps: `${r.fps === null ? '–' : Math.round(r.fps)} fps`,
    memory: r.memoryMB === null ? 'Memory n/a' : `Memory ${Math.round(r.memoryMB)} MB`,
    level: `Detail ${r.level === null ? '–' : r.level}`,
  };
}

export function DiagnosticsBar() {
  const [frame, setFrame] = useState<{ fps: number | null; level: number | null; memory: number | null }>({ fps: null, level: null, memory: null });
  useEffect(() => {
    const read = () => {
      const st = getRenderer()?.frameStats();
      setFrame({ fps: st ? st.fps : null, level: st ? st.level : null, memory: heapMB() });
    };
    read();
    const t = setInterval(read, 1000);
    return () => clearInterval(t);
  }, []);
  const p = diagPerf.value;
  const m = meta.value;
  const r = diagReadings({
    tickP50: p ? p.tickMsP50 : null,
    tickP95: p ? p.tickMsP95 : null,
    effective: m?.effectiveSpeed ?? 0,
    speed: m?.speed ?? 0,
    snapshotMs: p ? p.snapshotMs : null,
    fps: frame.fps,
    memoryMB: frame.memory,
    level: frame.level,
  });
  return (
    <div class="diag-bar" role="group" aria-label="Performance numbers" data-testid="diag-bar">
      <span data-testid="diag-tick">{r.tick}</span>
      <span data-testid="diag-speed">{r.speed}</span>
      <span data-testid="diag-snapshot">{r.snapshot}</span>
      <span data-testid="diag-fps">{r.fps}</span>
      <span data-testid="diag-memory">{r.memory}</span>
      <span data-testid="diag-level">{r.level}</span>
    </div>
  );
}
