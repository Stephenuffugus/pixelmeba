/**
 * P4.13 Settings "Show performance numbers" and the diagnostics bar (src/ui/panels/Diagnostics.tsx; UX §2
 * Settings "diagnostics (opt-in)"; ARCH §13). Off by default; an older stored settings object (no field)
 * loads with it off; the six readings' wording.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { diagReadings, heapMB } from '../../src/ui/panels/Diagnostics';

/** The test environment is node: a minimal localStorage for settings. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}

describe('diagnostics (P4.13)', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('off by default, and older settings (without the field) load with it off', async () => {
    const fresh = await import('../../src/ui/state');
    expect(fresh.settings.value.showPerformance === true).toBe(false);
    vi.resetModules();
    localStorage.setItem('pixelmeba.settings', JSON.stringify({ showPrompts: false, textScale: 1.25, checkpointRing: true }));
    const older = await import('../../src/ui/state');
    expect(older.settings.value.showPerformance === true).toBe(false);
    expect(older.settings.value.textScale).toBe(1.25);
    vi.resetModules();
    localStorage.setItem('pixelmeba.settings', JSON.stringify({ showPerformance: true }));
    const on = await import('../../src/ui/state');
    expect(on.settings.value.showPerformance).toBe(true);
  });

  it('the six readings', () => {
    const r = diagReadings({ tickP50: 3.456, tickP95: 12.04, effective: 3.27, speed: 4, snapshotMs: 2.5, fps: 29.6, memoryMB: 41.7, level: 1 });
    expect(r).toEqual({
      tick: 'Tick 3.5 ms (p95 12.0)',
      speed: 'Speed 3.3× of 4×',
      snapshot: 'Snapshot 2.5 ms',
      fps: '30 fps',
      memory: 'Memory 42 MB',
      level: 'Detail 1',
    });
    const none = diagReadings({ tickP50: null, tickP95: null, effective: 0, speed: 0, snapshotMs: null, fps: null, memoryMB: null, level: null });
    expect(none.memory).toBe('Memory n/a');
    expect(none.tick).toBe('Tick – ms (p95 –)');
  });

  it('memory reads performance.memory where it exists, else n/a', () => {
    const p = performance as Performance & { memory?: unknown };
    const had = 'memory' in p;
    const old = p.memory;
    Object.defineProperty(p, 'memory', { value: { usedJSHeapSize: 50 * 1048576 }, configurable: true });
    expect(heapMB()).toBe(50);
    Object.defineProperty(p, 'memory', { value: undefined, configurable: true });
    expect(heapMB()).toBeNull();
    if (had) Object.defineProperty(p, 'memory', { value: old, configurable: true });
  });
});
