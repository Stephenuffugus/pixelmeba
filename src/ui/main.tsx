import { render } from 'preact';
import './styles.css';
import { App } from './app/App';
import { autosave, dishInfo, meta, setSpeed } from './state';

const root = document.getElementById('app');
if (root) render(<App />, root);

// Backgrounding pauses (SPEC §14.2); returning never advances unseen time.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && dishInfo.value) {
    if ((meta.value?.speed ?? 0) > 0) setSpeed(0);
    void autosave();
  }
});

// Arcade host hooks (ARCH §14): a parent page may pause/resume.
window.addEventListener('message', (e: MessageEvent<unknown>) => {
  const d = e.data as { type?: string } | null;
  if (!d || typeof d !== 'object') return;
  if (d.type === 'pixelmeba:pause') setSpeed(0);
});
