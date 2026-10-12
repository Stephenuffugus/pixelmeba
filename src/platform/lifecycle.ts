/**
 * P4.10 (ARCH §12; SPEC §14.2 "Autosave … on background"; CLAUDE.md "Backgrounding pauses; there is no
 * offline growth"): going to the background pauses the dish and autosaves; coming back never changes the
 * speed. On the Android app the Capacitor App plugin's 'pause' and 'resume' drive it; the web keeps
 * `visibilitychange` (src/ui/main.tsx). Both reach the same `Lifecycle`, which acts once per absence: the
 * WebView may also report hidden/visible around the native pause/resume, and that never pauses or saves twice.
 */
export const LIFECYCLE_TEXT = {
  /** The one line shown on return when a dish had been running (the polite live region of the toast). */
  resumed: 'Paused while Pixelmeba was in the background. No dish time passed.',
} as const;

export interface LifecycleHooks {
  /**
   * Pause for the background: speed 0 when running, a comparison's prior speed 0, one autosave. True when a
   * dish was running (so the return can say it was paused).
   */
  readonly pauseForBackground: () => boolean;
  /** Say one line politely (the toast's live region). */
  readonly announce: (text: string) => void;
}

/** What going to the background touches in the UI state (src/ui/state.ts passes its own signals and functions). */
export interface DishControls {
  readonly dishInfo: { readonly value: unknown };
  readonly meta: { readonly value: { readonly speed: number } | null };
  readonly compareState: { value: { readonly priorSpeed: number; readonly status?: string; readonly speed?: number | string } | null };
  readonly setSpeed: (speed: 0) => void;
  /** D-0096: stop a running comparison or experiment (src/ui/state.ts setCompareSpeed). */
  readonly setCompareSpeed?: (speed: 0) => void;
  readonly autosave: () => Promise<unknown>;
}

/**
 * The one handler for going to the background (the page hidden, or the Android app's 'pause'): with a dish
 * open, speed 0 when it was running, a comparison's prior speed 0 (it comes back paused, SPEC §14.2), a
 * running comparison or experiment stopped too (D-0096: its screens stop it only when the page goes hidden,
 * and an App 'pause' can come without that), and one autosave. True when the dish or a comparison was running.
 */
export function pauseDishForBackground(c: DishControls): boolean {
  if (!c.dishInfo.value) return false;
  const running = (c.meta.value?.speed ?? 0) > 0;
  if (running) c.setSpeed(0);
  const cmp = c.compareState.value;
  if (cmp && cmp.priorSpeed > 0) c.compareState.value = { ...cmp, priorSpeed: 0 };
  const run = c.compareState.value;
  const comparing = run !== null && run.status === 'running' && (run.speed ?? 0) !== 0;
  if (comparing) c.setCompareSpeed?.(0);
  void c.autosave();
  return running || comparing;
}

/**
 * The page's visibility (src/ui/main.tsx, on the web and on the Android app alike): hidden → background(),
 * visible → foreground(false). D-0095: on the app 'visible' ends the absence silently, so a missed 'resume'
 * never leaves the next background unpaused; the App plugin's 'resume' says the line.
 */
export function visibilityChanged(lc: Lifecycle, hidden: boolean): void {
  if (hidden) lc.background();
  else lc.foreground(false);
}

export class Lifecycle {
  private away = false;
  private wasRunning = false;

  constructor(private readonly hooks: LifecycleHooks) {}

  /** Gone to the background (native 'pause' or the page hidden): pause and autosave, once per absence. */
  background(): void {
    if (this.away) return;
    this.away = true;
    this.wasRunning = this.hooks.pauseForBackground();
  }

  /**
   * Back in front. Never changes the speed. `announce` (the native 'resume') says it was paused, when it was
   * running, once per absence. D-0095: on the Android app the page's 'visible' also ends the absence, silently
   * (foreground(false)), so a missed 'resume' never leaves the next background unpaused; the line stays owed
   * until 'resume' says it or the next absence starts.
   */
  foreground(announce: boolean): void {
    this.away = false;
    if (!announce) return;
    const was = this.wasRunning;
    this.wasRunning = false;
    if (was) this.hooks.announce(LIFECYCLE_TEXT.resumed);
  }

  get inBackground(): boolean {
    return this.away;
  }
}

/** The part of the App plugin this uses (a fake in tests). */
export interface AppEvents {
  addListener(event: 'pause' | 'resume', fn: () => void): Promise<{ remove: () => Promise<void> }>;
}

/**
 * On the native app: App 'pause' → background(), App 'resume' → foreground(true). Extra callbacks run first
 * (audio). Resolves with a function that removes both listeners.
 */
export async function wireNativeLifecycle(
  lc: Lifecycle,
  extra: { readonly onPause?: () => void; readonly onResume?: () => void } = {},
  events?: AppEvents,
): Promise<() => Promise<void>> {
  // Loaded on demand: the web build never loads the App plugin.
  const app = events ?? ((await import('@capacitor/app')).App);
  const p = await app.addListener('pause', () => {
    extra.onPause?.();
    lc.background();
  });
  const r = await app.addListener('resume', () => {
    extra.onResume?.();
    lc.foreground(true);
  });
  return async () => {
    await p.remove();
    await r.remove();
  };
}
