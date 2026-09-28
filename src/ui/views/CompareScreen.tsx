/**
 * Comparison screen (UX §5.6). Phone: one viewport at a time with an A/B toggle and a synced camera.
 * Large screens: A and B side by side. The panel walks setup → running → results.
 */
import { useEffect, useRef } from 'preact/hooks';
import { IconBack, IconZoomDish } from '../icons';
import { AddLifeSheet } from '../panels/AddLifeSheet';
import { CompareResults } from '../panels/CompareResults';
import { CompareRunning, CompareSetup } from '../panels/CompareSetup';
import { clock } from '../panels/CompareText';
import { FeedSheet } from '../panels/FeedSheet';
import {
  closeCompare,
  compareShown,
  compareState,
  dishInfo,
  getCompareRenderer,
  route,
  setCompareSpeed,
  setTool,
  sheet,
  showCompareArm,
  syncCompareCameras,
  toast,
} from '../state';
import { CompareViewport } from './CompareViewport';

export function CompareScreen() {
  const c = compareState.value;
  const info = dishInfo.value;
  const panel = useRef<HTMLElement>(null);
  const status = c?.status;

  // Each stage (setup → running → results) starts at the top of the panel.
  useEffect(() => {
    if (panel.current) panel.current.scrollTop = 0;
  }, [status]);

  // Keep the two cameras together every frame (whichever the player moved last leads).
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      syncCompareCameras();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Backgrounding pauses (SPEC §14.2) and so does an arcade host's pause message: a running
  // comparison stops advancing; the player resumes it with a pace button.
  useEffect(() => {
    const pause = () => {
      if (compareState.value?.status === 'running' && compareState.value.speed !== 0) setCompareSpeed(0);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause();
    };
    const onMessage = (e: MessageEvent<unknown>) => {
      const d = e.data as { type?: string } | null;
      if (d && typeof d === 'object' && d.type === 'pixelmeba:pause') pause();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('message', onMessage);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      setTool({ kind: 'look' });
      sheet.value = 'none';
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  if (!c || !info) {
    return (
      <div class="page">
        <p>No comparison is open.</p>
        <button class="btn primary" onClick={() => (route.value = { name: info ? 'dish' : 'home' })}>
          Back
        </button>
      </div>
    );
  }

  const shown = compareShown.value;
  const progress =
    status === 'setup'
      ? `Paused at ${clock(c.baselineTick)} · nothing has run yet`
      : status === 'running'
        ? `Running · ${clock(c.ticksRun)}${c.horizonTicks !== null ? ` of ${clock(c.horizonTicks)}` : ''}`
        : status === 'complete'
          ? `Finished · both ran ${clock(c.ticksRun)}`
          : 'Stopped by an error';

  return (
    <div class="compare-screen" data-testid="compare-screen" data-status={status}>
      <header class="topbar">
        <button class="btn ghost" aria-label="Close comparison and return to my dish" onClick={() => void closeCompare()} data-testid="compare-close">
          <IconBack />
        </button>
        <div class="title">
          <strong>Compare · {info.name}</strong>
          <span class="time" data-testid="compare-time">
            {progress}
          </span>
        </div>
        <button
          class="btn"
          aria-label="Whole dish"
          onClick={() => {
            getCompareRenderer('A')?.zoomPreset('dish');
            getCompareRenderer('B')?.zoomPreset('dish');
          }}
        >
          <IconZoomDish />
        </button>
      </header>

      <div class="compare-views" data-show={shown}>
        <div class="segmented compare-toggle" role="group" aria-label="Show dish">
          <button class="btn" aria-pressed={shown === 'A'} onClick={() => showCompareArm('A')} data-testid="compare-show-A">
            A · baseline
          </button>
          <button class="btn" aria-pressed={shown === 'B'} onClick={() => showCompareArm('B')} data-testid="compare-show-B">
            B · changed
          </button>
        </div>
        <CompareViewport arm="A" />
        <CompareViewport arm="B" />
        {status === 'setup' && sheet.value === 'feed' ? <FeedSheet /> : null}
        {status === 'setup' && sheet.value === 'addLife' ? <AddLifeSheet /> : null}
        {toast.value ? (
          <div class="toast" role="status" aria-live="polite">
            {toast.value}
          </div>
        ) : null}
      </div>

      <section class="compare-panel" aria-labelledby="compare-heading" ref={panel}>
        {status === 'setup' ? <CompareSetup /> : null}
        {status === 'running' ? <CompareRunning /> : null}
        {status === 'complete' ? <CompareResults /> : null}
        {status === 'failed' ? (
          <div class="compare-body">
            <h2 id="compare-heading">The comparison stopped</h2>
            <p>{c.error ?? 'Something went wrong.'} No results are shown because A and B may not have run the same time. Your dish is untouched.</p>
            <button class="btn primary" onClick={() => void closeCompare()} data-testid="compare-done">
              Back to my dish
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
