import { useEffect, useRef, useState } from 'preact/hooks';
import { DishRenderer } from '@render/renderer';
import { loadAtlas } from '../atlas';
import { attachGestures } from '../gestures';
import {
  IconBack,
  IconFood,
  IconLife,
  IconLook,
  IconPause,
  IconPlay,
  IconStep,
  IconUndo,
  IconZoomDish,
  IconZoomIn,
  IconZoomOut,
} from '../icons';
import {
  attachRenderer,
  candidates,
  dishInfo,
  getRenderer,
  meta,
  prompt,
  route,
  select,
  sendCommand,
  setSpeed,
  setTool,
  sheet,
  showToast,
  stepOnce,
  togglePause,
  tool,
  toast,
  undo,
} from '../state';
import { AddLifeSheet } from '../panels/AddLifeSheet';
import { FeedSheet } from '../panels/FeedSheet';
import { InspectorSheet } from '../panels/Inspector';
import type { Speed } from '@worker/protocol';

function formatTime(tick: number): string {
  const s = Math.floor(tick / 10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function DishScreen() {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const info = dishInfo.value;
  const m = meta.value;

  useEffect(() => {
    let disposed = false;
    let detach: (() => void) | null = null;
    let r: DishRenderer | null = null;
    void (async () => {
      const atlas = await loadAtlas();
      if (disposed || !host.current) return;
      r = await DishRenderer.create(host.current, atlas.url, atlas.manifest);
      if (disposed) {
        r.destroy();
        return;
      }
      attachRenderer(r);
      detach = attachGestures(host.current, r, {
        paints: () => tool.value.kind === 'feed' && tool.value.paint,
        onCameraMoved: () => undefined,
        onTap: (sx, sy, wx, wy) => onTap(r!, sx, sy, wx, wy),
        onStroke: (points) => {
          const t = tool.value;
          if (t.kind === 'feed') void sendCommand({ kind: 'deposit', materialId: t.materialId, points, radius: t.radius, dose: t.dose });
        },
      });
      setReady(true);
    })();
    return () => {
      disposed = true;
      detach?.();
      attachRenderer(null);
      r?.destroy();
    };
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      const r = getRenderer();
      if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      } else if (e.key === '1' || e.key === '2' || e.key === '4') setSpeed(Number(e.key) as Speed);
      else if (e.key === '.') stepOnce();
      else if (e.key === 'Escape') {
        setTool({ kind: 'look' });
        select(null);
        sheet.value = 'none';
      } else if (e.key === 'u' || e.key === 'U') void undo();
      else if (r && (e.key === '+' || e.key === '=')) r.camera.zoomAt(r.camera.viewW / 2, r.camera.viewH / 2, 1.25);
      else if (r && e.key === '-') r.camera.zoomAt(r.camera.viewW / 2, r.camera.viewH / 2, 0.8);
      else if (r && e.key.startsWith('Arrow')) {
        const d = 40;
        r.camera.panBy(e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0, e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const running = (m?.speed ?? 0) > 0;
  const t = tool.value;
  const behind = running && m && m.effectiveSpeed > 0 && m.effectiveSpeed < m.speed * 0.8;

  return (
    <div class="dish-screen" data-testid="dish-screen">
      <header class="topbar">
        <button class="btn ghost" aria-label="Home" onClick={() => (route.value = { name: 'home' })}>
          <IconBack />
        </button>
        <div class="title">
          <strong>{info?.name ?? 'Dish'}</strong>
          <span class="time" aria-live="off" data-testid="sim-time">
            {formatTime(m?.tick ?? 0)} · {m?.count ?? 0} alive{behind ? <span class="speed-badge"> · running at {m.effectiveSpeed.toFixed(1)}×</span> : null}
          </span>
        </div>
        <button class={`btn ${running ? '' : 'primary'}`} onClick={togglePause} aria-label={running ? 'Pause' : 'Run'} data-testid="run-toggle">
          {running ? <IconPause /> : <IconPlay />}
        </button>
        {running ? (
          <button class="btn speed-cycle" aria-label={`Speed ${m?.speed ?? 1}×, tap to change`} onClick={() => setSpeed(m?.speed === 1 ? 2 : m?.speed === 2 ? 4 : 1)}>
            {m?.speed ?? 1}×
          </button>
        ) : null}
        {running ? (
          <div class="speed-group" role="group" aria-label="Speed">
            {([1, 2, 4] as const).map((s) => (
              <button key={s} class="btn" aria-pressed={m?.speed === s} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </div>
        ) : (
          <button class="btn" aria-label="Step one tick" onClick={stepOnce}>
            <IconStep />
          </button>
        )}
      </header>

      <div class="viewport" ref={host} data-testid="viewport">
        {!ready ? <p style={{ color: '#c9d6d8', padding: '1rem' }}>Preparing the dish…</p> : null}
        {prompt.value ? (
          <div class="prompt" role="status">
            <p>{prompt.value}</p>
            <button class="btn ghost" onClick={() => (prompt.value = null)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        ) : null}
        <div class="zoom-buttons">
          <button class="btn" aria-label="Whole dish" onClick={() => getRenderer()?.zoomPreset('dish')}>
            <IconZoomDish />
          </button>
          <button class="btn" aria-label="Zoom in" onClick={() => getRenderer()?.camera.zoomAt(getRenderer()!.camera.viewW / 2, getRenderer()!.camera.viewH / 2, 1.6)}>
            <IconZoomIn />
          </button>
          <button class="btn" aria-label="Zoom out" onClick={() => getRenderer()?.camera.zoomAt(getRenderer()!.camera.viewW / 2, getRenderer()!.camera.viewH / 2, 0.625)}>
            <IconZoomOut />
          </button>
        </div>
        {candidates.value ? <CandidateList /> : null}
        {m?.capacityReached ? <div class="capacity-banner">Simulation capacity reached — a limit of the game, not the ecosystem.</div> : null}
        {toast.value ? (
          <div class="toast" role="status" aria-live="polite">
            {toast.value}
          </div>
        ) : null}
        {sheet.value === 'addLife' ? <AddLifeSheet /> : null}
        {sheet.value === 'feed' ? <FeedSheet /> : null}
        {sheet.value === 'inspect' ? <InspectorSheet /> : null}
      </div>

      <nav class="bottombar" aria-label="Actions">
        <button class="btn" aria-label="Undo (rewinds time)" title="Undo rewinds time" disabled={!m?.undoAvailable} onClick={() => void undo()}>
          <IconUndo />
        </button>
        <div class="actions">
          <button class="btn" aria-pressed={t.kind === 'addLife' || sheet.value === 'addLife'} onClick={() => (sheet.value = sheet.value === 'addLife' ? 'none' : 'addLife')} data-testid="action-addlife">
            <IconLife /> Add Life
          </button>
          <button class="btn" aria-pressed={t.kind === 'feed' || sheet.value === 'feed'} onClick={() => (sheet.value = sheet.value === 'feed' ? 'none' : 'feed')} data-testid="action-feed">
            <IconFood /> Feed
          </button>
          <button
            class="btn"
            aria-pressed={t.kind === 'look'}
            onClick={() => {
              setTool({ kind: 'look' });
              sheet.value = 'none';
            }}
            data-testid="action-look"
          >
            <IconLook /> Look
          </button>
        </div>
      </nav>
    </div>
  );
}

function onTap(r: DishRenderer, sx: number, sy: number, wx: number, wy: number): void {
  const t = tool.value;
  if (t.kind === 'addLife') {
    void sendCommand({ kind: 'inoculate', speciesId: t.speciesId, x: wx, y: wy, radius: t.radius, count: t.count });
    setTool({ kind: 'look' }); // Explore: tap-to-place returns to Look
    return;
  }
  if (t.kind === 'feed') {
    void sendCommand({ kind: 'deposit', materialId: t.materialId, points: [[wx, wy]], radius: t.radius, dose: t.dose });
    if (!t.paint) setTool({ kind: 'look' });
    return;
  }
  const { candidates: list, cell } = r.pick(sx, sy);
  if (list.length === 0) {
    select({ kind: 'cell', cell });
    return;
  }
  const close = list.filter((c) => c.distance - list[0]!.distance < 0.35);
  if (close.length > 1) {
    candidates.value = { x: sx, y: sy, items: close.slice(0, 6).map((c) => ({ birthId: c.birthId, species: c.species })) };
    return;
  }
  select({ kind: 'entity', birthId: list[0]!.birthId });
  if (prompt.value?.startsWith('Tap')) prompt.value = null;
  void showToast;
}

function CandidateList() {
  const c = candidates.value!;
  const info = dishInfo.value;
  return (
    <div class="candidates" style={{ left: `${Math.max(8, c.x - 80)}px`, top: `${Math.max(8, c.y + 12)}px` }} role="listbox" aria-label="Choose an organism">
      {c.items.map((it) => (
        <button key={it.birthId} class="btn" role="option" aria-selected="false" onClick={() => select({ kind: 'entity', birthId: it.birthId })}>
          {info?.speciesNames[it.species] ?? '?'} #{it.birthId}
        </button>
      ))}
      <button class="btn ghost" onClick={() => (candidates.value = null)}>
        Cancel
      </button>
    </div>
  );
}
