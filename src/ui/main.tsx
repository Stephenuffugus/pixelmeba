import { render } from 'preact';
import './styles.css';
import { App } from './app/App';
import { autosave, compareState, dishInfo, initDisplaySettings, meta, setCompareSpeed, setSpeed, showToast } from './state';
import { initAudio, resumeAudio, suspendAudio } from '@audio/cues';
import { wireNarration } from './narration';
import { Lifecycle, pauseDishForBackground, visibilityChanged, wireNativeLifecycle } from '@platform/lifecycle';
import { isNativePlatform } from '@platform/capacitor';
import { hostMessage, registerServiceWorker } from '@platform/web';

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
/** P4.11: the player has tapped, clicked or pressed a key here (a host's resume never starts sound before that). */
let gestured = false;
function onGesture(): void {
  if (document.visibilityState === 'hidden') return;
  gestured = true;
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
 * was running, a comparison comes back paused (SPEC §14.2: no running on after the app is left) and a running
 * one stops (D-0096), and one autosave is written. True when the dish or a comparison was running.
 */
function pauseForBackground(): boolean {
  return pauseDishForBackground({ dishInfo, meta, compareState, setSpeed, setCompareSpeed, autosave });
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
  // Both platforms (D-0095): visible again ends the absence silently, so a missed native 'resume' never leaves
  // the next background unpaused; on the native app the App plugin's 'resume' says the dish was paused.
  visibilityChanged(lifecycle, document.visibilityState === 'hidden');
});

// Arcade host hooks (ARCH §14): a parent page may pause/resume. Any origin may send them, but only the two exact
// shapes { type: 'pixelmeba:pause' } and { type: 'pixelmeba:resume' } act (src/platform/web.ts hostMessage).
window.addEventListener('message', (e: MessageEvent<unknown>) => {
  const m = hostMessage(e.data);
  if (m === 'pause') {
    setSpeed(0);
    hostPaused = true;
    suspendAudio(); // P3.10: silent until the player's next gesture here
  } else if (m === 'resume') {
    // P4.11 (SPEC §14.2 "paused, with Resume"): the host's pause ends, but the dish stays paused until the
    // player presses Run; sound comes back only if the player had already made a gesture here.
    if (!hostPaused) return;
    hostPaused = false;
    if (gestured && document.visibilityState !== 'hidden') resumeAudio();
  }
});

// P4.11: offline web play (a precache service worker) — production web builds only; never in the native app,
// on an insecure origin, or under a <base> that moves the page's directory (the arcade's stamped layout).
window.addEventListener('load', () => void registerServiceWorker(), { once: true });
