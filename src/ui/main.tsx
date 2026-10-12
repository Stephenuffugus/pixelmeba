import { render } from 'preact';
import './styles.css';
import { App } from './app/App';
import { autosave, compareState, dishInfo, initDisplaySettings, meta, setSpeed, showToast } from './state';
import { initAudio, resumeAudio, suspendAudio } from '@audio/cues';
import { wireNarration } from './narration';
import { Lifecycle, pauseDishForBackground, wireNativeLifecycle } from '@platform/lifecycle';
import { isNativePlatform } from '@platform/capacitor';

initDisplaySettings();
const root = document.getElementById('app');
if (root) render(<App />, root);
// P4.9: narration listens to the UI state and speaks a fixed phrase only with its evidence (off by default).
wireNarration();

// P3.10 (autoplay): no sound before the first user gesture. The audio graph is created lazily on the
// first tap, click or key press; later gestures also resume audio an arcade host's pause suspended.
const GESTURES = ['pointerdown', 'keydown', 'touchend'] as const;
/** An arcade host paused us: audio stays suspended until the player's next gesture here. */
let hostPaused = false;
function onGesture(): void {
  if (document.visibilityState === 'hidden') return;
  if (hostPaused) {
    hostPaused = false;
    resumeAudio();
  }
  initAudio();
}
for (const g of GESTURES) window.addEventListener(g, onGesture, { capture: true, passive: true });

// Backgrounding pauses (SPEC §14.2); returning never advances unseen time.
/**
 * Going to the background (the page hidden, or the Android app's 'pause'; P4.10): the dish pauses when it
 * was running, a comparison comes back paused (SPEC §14.2: no running on after the app is left), and one
 * autosave is written. True when a dish was running.
 */
function pauseForBackground(): boolean {
  return pauseDishForBackground({ dishInfo, meta, compareState, setSpeed, autosave });
}
/** P4.10: one handler for both platforms; it acts once per absence. Returning never changes the speed. */
const lifecycle = new Lifecycle({ pauseForBackground, announce: (text) => showToast(text, 6000) });
const native = isNativePlatform();
if (native) {
  // The Android app: Capacitor's App 'pause' / 'resume' (ARCH §12); the return says the dish was paused.
  wireNativeLifecycle(lifecycle, {
    onPause: () => suspendAudio(),
    onResume: () => {
      if (!hostPaused) resumeAudio();
    },
  }).catch((e: unknown) => console.error('The app lifecycle listener did not start; the page visibility still pauses the dish:', e));
}
// Leaving the page (reload, close, navigation): best-effort autosave, like going to the background.
window.addEventListener('pagehide', () => {
  if (dishInfo.value) void autosave();
});
document.addEventListener('visibilitychange', () => {
  // P3.10: audio pauses on suspension (ARCH §10.3) and comes back when the page is visible again.
  if (document.visibilityState === 'hidden') suspendAudio();
  else if (!hostPaused) resumeAudio();
  if (document.visibilityState === 'hidden') lifecycle.background();
  // Visible again ends the absence silently on both platforms (D-0095: a missed native 'resume' must never
  // leave the next background unpaused); on the native app the App plugin's 'resume', before or after this,
  // says the dish was paused.
  else lifecycle.foreground(false);
});

// Arcade host hooks (ARCH §14): a parent page may pause/resume.
window.addEventListener('message', (e: MessageEvent<unknown>) => {
  const d = e.data as { type?: string } | null;
  if (!d || typeof d !== 'object') return;
  if (d.type === 'pixelmeba:pause') {
    setSpeed(0);
    hostPaused = true;
    suspendAudio(); // P3.10: silent until the player's next gesture here
  }
});
