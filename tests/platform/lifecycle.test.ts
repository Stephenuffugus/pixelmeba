/**
 * P4.10 (ARCH §12; SPEC §14.2; CLAUDE.md "Backgrounding pauses; there is no offline growth"): the Android
 * app's App plugin 'pause' / 'resume' (a fake plugin here) through the same handler the web's
 * visibilitychange uses (src/platform/lifecycle.ts pauseDishForBackground, wired from src/ui/main.tsx).
 * pause → speed 0, a comparison's prior speed 0, one autosave; resume → no speed change, the one line only
 * when the dish had been running; nothing runs by itself afterwards.
 */
import { signal } from '@preact/signals';
import { describe, expect, it } from 'vitest';
import { Lifecycle, LIFECYCLE_TEXT, pauseDishForBackground, wireNativeLifecycle, type AppEvents } from '../../src/platform/lifecycle';

class FakeApp implements AppEvents {
  readonly listeners: Record<string, (() => void)[]> = {};
  removed = 0;
  addListener(event: 'pause' | 'resume', fn: () => void): Promise<{ remove: () => Promise<void> }> {
    (this.listeners[event] ??= []).push(fn);
    return Promise.resolve({
      remove: () => {
        this.removed++;
        this.listeners[event] = (this.listeners[event] ?? []).filter((f) => f !== fn);
        return Promise.resolve();
      },
    });
  }
  fire(event: 'pause' | 'resume'): void {
    for (const f of this.listeners[event] ?? []) f();
  }
}

function setup(opts: { speed: number; priorSpeed?: number; dish?: boolean }) {
  const speeds: number[] = [];
  let autosaves = 0;
  const said: string[] = [];
  const meta = signal<{ speed: number } | null>({ speed: opts.speed });
  const compareState = signal<{ priorSpeed: number; other: string } | null>(opts.priorSpeed === undefined ? null : { priorSpeed: opts.priorSpeed, other: 'kept' });
  const controls = {
    dishInfo: signal<unknown>(opts.dish === false ? null : { dishId: 'd1' }),
    meta,
    compareState,
    setSpeed: (s: 0) => {
      speeds.push(s);
      meta.value = { speed: s };
    },
    autosave: () => {
      autosaves++;
      return Promise.resolve(true);
    },
  };
  const lc = new Lifecycle({ pauseForBackground: () => pauseDishForBackground(controls), announce: (t) => said.push(t) });
  return { lc, speeds, said, meta, compareState, autosaves: () => autosaves };
}

describe('the Android app lifecycle (fake App plugin)', () => {
  it('pause: speed 0, the comparison prior speed 0, exactly one autosave; resume: no speed change and the one line', async () => {
    const t = setup({ speed: 2, priorSpeed: 4 });
    const app = new FakeApp();
    const unwire = await wireNativeLifecycle(t.lc, {}, app);
    app.fire('pause');
    expect(t.speeds).toEqual([0]);
    expect(t.meta.value).toEqual({ speed: 0 });
    expect(t.compareState.value).toEqual({ priorSpeed: 0, other: 'kept' });
    expect(t.autosaves()).toBe(1);
    // The WebView may also report the page hidden: still one pause and one autosave per absence.
    t.lc.background();
    app.fire('pause');
    expect(t.autosaves()).toBe(1);
    expect(t.speeds).toEqual([0]);
    app.fire('resume');
    expect(t.speeds).toEqual([0]); // never changes the speed
    expect(t.meta.value).toEqual({ speed: 0 }); // nothing auto-runs
    expect(t.said).toEqual([LIFECYCLE_TEXT.resumed]);
    expect(LIFECYCLE_TEXT.resumed).toBe('Paused while Pixelmeba was in the background. No dish time passed.');
    app.fire('resume'); // a second resume says nothing more
    expect(t.said.length).toBe(1);
    await unwire();
    expect(app.removed).toBe(2);
  });

  it('a dish that was already paused: one autosave on pause, no line on resume', async () => {
    const t = setup({ speed: 0 });
    const app = new FakeApp();
    await wireNativeLifecycle(t.lc, {}, app);
    app.fire('pause');
    app.fire('resume');
    expect(t.speeds).toEqual([]);
    expect(t.autosaves()).toBe(1);
    expect(t.said).toEqual([]);
  });

  it('no dish open: nothing is paused, saved or said', async () => {
    const t = setup({ speed: 1, dish: false });
    const app = new FakeApp();
    await wireNativeLifecycle(t.lc, {}, app);
    app.fire('pause');
    app.fire('resume');
    expect(t.speeds).toEqual([]);
    expect(t.autosaves()).toBe(0);
    expect(t.said).toEqual([]);
  });

  it('the web path (hidden, then visible again) never says the line; the next native absence pauses and saves again', async () => {
    const t = setup({ speed: 4 });
    t.lc.background(); // visibilitychange hidden
    t.lc.foreground(false); // visibilitychange visible on the web: no line
    expect(t.said).toEqual([]);
    t.meta.value = { speed: 4 }; // the player runs it again
    const app = new FakeApp();
    await wireNativeLifecycle(t.lc, { onPause: () => t.said.push('audio off'), onResume: () => t.said.push('audio on') }, app);
    app.fire('pause');
    expect(t.speeds).toEqual([0, 0]);
    expect(t.autosaves()).toBe(2);
    app.fire('resume');
    expect(t.said).toEqual(['audio off', 'audio on', LIFECYCLE_TEXT.resumed]);
  });

  it('D-0095: on the app the page visible again ends the absence silently, the resume after it still says the line once, and a missed resume never leaves the next background unpaused', async () => {
    const t = setup({ speed: 2 });
    const app = new FakeApp();
    await wireNativeLifecycle(t.lc, {}, app);
    t.lc.background(); // the page hidden first, then the App pause
    app.fire('pause');
    t.lc.foreground(false); // the page visible again (src/ui/main.tsx, on both platforms)
    expect(t.said).toEqual([]);
    app.fire('resume'); // after it: the line is still owed, and said once
    expect(t.said).toEqual([LIFECYCLE_TEXT.resumed]);
    app.fire('resume');
    expect(t.said.length).toBe(1);
    // No 'resume' at all (missed, or the App listener never started): hidden → visible → hidden pauses and saves each time.
    t.meta.value = { speed: 2 };
    t.lc.background();
    t.lc.foreground(false);
    t.meta.value = { speed: 3 };
    t.lc.background();
    expect(t.speeds).toEqual([0, 0, 0]);
    expect(t.autosaves()).toBe(3);
  });
});
