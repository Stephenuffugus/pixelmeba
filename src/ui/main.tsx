import { render } from 'preact';
import './styles.css';
import { App } from './app/App';
import { autosave, compareState, dishInfo, initDisplaySettings, meta, setSpeed } from './state';
import { initAudio, resumeAudio, suspendAudio } from '@audio/cues';
import { wireNarration } from './narration';

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
// Leaving the page (reload, close, navigation): best-effort autosave, like going to the background.
window.addEventListener('pagehide', () => {
  if (dishInfo.value) void autosave();
});
document.addEventListener('visibilitychange', () => {
  // P3.10: audio pauses on suspension (ARCH §10.3) and comes back when the page is visible again.
  if (document.visibilityState === 'hidden') suspendAudio();
  else if (!hostPaused) resumeAudio();
  if (document.visibilityState === 'hidden' && dishInfo.value) {
    if ((meta.value?.speed ?? 0) > 0) setSpeed(0);
    // A comparison paused the dish and will restore its speed on close; backgrounding means it
    // should come back paused (SPEC §14.2: no running on after the app is left).
    const cmp = compareState.value;
    if (cmp && cmp.priorSpeed > 0) compareState.value = { ...cmp, priorSpeed: 0 };
    void autosave();
  }
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
