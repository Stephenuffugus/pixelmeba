import { useEffect, useRef, useState } from 'preact/hooks';
import { DishRenderer } from '@render/renderer';
import { loadAtlas } from '../atlas';
import { attachGestures } from '../gestures';
import { dishCellAt } from '../dishPoint';
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
  dismissExperimentWaiting,
  experimentWaiting,
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
import { MoreSheet, SaveSheet } from '../panels/MoreSheet';
import { HistorySheet } from '../panels/HistorySheet';
import { FamilyMarkers } from '../panels/FamilyMarkers';
import { LineageSheet } from '../panels/LineageSheet';
import { EvolutionSheet } from '../panels/AdvancedEvolution';
import { WhatIfHost } from '../panels/WhatIfSheet';
import { whatIfOpen } from '../panels/WhatIfState';
import { LineageLegend } from '../panels/LineageLegend';
import { DiscoveryCard } from '../panels/DiscoveryCard';
import { placeSpecimenTap } from '../panels/LineageState';
import { IconMore } from '../icons';
import { autosave } from '../state';
import { dishView, handleViewKey, labGestures, LabViewToggle } from './LabView';
import { labTray } from './LabView';
import { LabToolbar, LabTrayHost } from './LabToolbar';
import { OverlayLegend } from '../panels/OverlayLegend';
import type { Speed } from '@worker/protocol';

function formatTime(tick: number): string {
  const s = Math.floor(tick / 10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** Controls that Space activates when the player reached them with the keyboard (UX §4.2; D-0029). */
const SPACE_CONTROLS =
  'button, [role="button"], [role="radio"], [role="tab"], [role="checkbox"], [role="switch"], a[href], summary';

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
      // Lab (P2.7) wraps the same handlers: in Lab its persistent tool uses the gesture first.
      detach = attachGestures(host.current, r, labGestures({
        paints: () => tool.value.kind === 'feed' && tool.value.paint,
        onCameraMoved: () => undefined,
        onTap: (sx, sy, wx, wy) => onTap(r!, sx, sy, wx, wy),
        onStroke: (points) => {
          const t = tool.value;
          if (t.kind === 'feed') void sendCommand({ kind: 'deposit', materialId: t.materialId, points, radius: t.radius, dose: t.dose });
        },
      }));
      setReady(true);
    })();
    return () => {
      disposed = true;
      detach?.();
      attachRenderer(null);
      r?.destroy();
    };
  }, []);

  // A sheet opened from the top strip (More and what it opens) takes the Lab tray's place, as Lab's
  // Inspect tap and the Tools tray's buttons do: on phones the tray would cover it. (P2.2: a new dish
  // opens with the Life tray open, so More must still reach the player.)
  const openSheet = sheet.value;
  useEffect(() => {
    if (openSheet !== 'none' && dishView.value === 'lab') labTray.value = null;
  }, [openSheet]);

  // Autosave every 30 real seconds while this dish is open (SPEC §14.2).
  useEffect(() => {
    const t = setInterval(() => void autosave(), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    // UX §4.2 lists both "Space pause/run" and "Enter/Space activate" (D-0029): Space activates the
    // focused control while the player is navigating with the keyboard (Tab), as :focus-visible does;
    // after a pointer press, Space is pause/run wherever focus was left (it must not press that button
    // again, cycle the speed, or step the dish when the paused bar puts Step where Speed was).
    let modality: 'pointer' | 'keyboard' = 'keyboard';
    const pointer = () => {
      modality = 'pointer';
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Tab') modality = 'keyboard';
      if (whatIfOpen.value !== null) return; // What if? is a blocking modal (D-0026): no dish key acts behind it
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (e.key === ' ' && modality === 'keyboard' && (e.target as HTMLElement | null)?.closest(SPACE_CONTROLS)) return;
      if (handleViewKey(e)) return; // I / L / F / Esc per view (UX §4.2; P2.7)
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
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('keydown', key);
    };
  }, []);

  const running = (m?.speed ?? 0) > 0;
  const t = tool.value;
  // A single-arm card's stamp waiting for a player step (P2.5): one small notice, in the prompt's place.
  const waiting = experimentWaiting.value && experimentWaiting.value.dishId === info?.dishId ? experimentWaiting.value : null;
  const behind = running && m && m.effectiveSpeed > 0 && m.effectiveSpeed < m.speed * 0.8;

  return (
    <div class="dish-screen" data-testid="dish-screen" data-view={dishView.value}>
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
        <LabViewToggle />
        <button class="btn" aria-label="More" onClick={() => (sheet.value = sheet.value === 'more' ? 'none' : 'more')} data-testid="more">
          <IconMore />
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
        {waiting ? (
          <div class="prompt" role="status" data-testid="experiment-waiting">
            <p>{waiting.text}</p>
            <button class="btn ghost" onClick={dismissExperimentWaiting} aria-label="Dismiss this notice">
              ✕
            </button>
          </div>
        ) : prompt.value ? (
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
        <FamilyMarkers />
        <LineageLegend />
        <DiscoveryCard />
        {dishView.value === 'lab' ? <OverlayLegend floating /> : null}
        {dishView.value === 'lab' ? <LabTrayHost /> : null}
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
        {sheet.value === 'more' ? <MoreSheet /> : null}
        {sheet.value === 'save' ? <SaveSheet /> : null}
        {sheet.value === 'history' ? <HistorySheet /> : null}
        {sheet.value === 'lineage' ? <LineageSheet /> : null}
        {sheet.value === 'evolution' ? <EvolutionSheet /> : null}
        <WhatIfHost context="dish" />
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
      {dishView.value === 'lab' ? <LabToolbar /> : null}
    </div>
  );
}

function onTap(r: DishRenderer, sx: number, sy: number, wx: number, wy: number): void {
  if (placeSpecimenTap(wx, wy)) return; // a saved specimen waiting to be placed (P2.3)
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
  const { candidates: list } = r.pick(sx, sy);
  if (list.length === 0) {
    // B1: only a cell inside the dish is ever described; a tap beyond the rim closes the panel instead.
    const cell = dishCellAt(wx, wy);
    if (cell === null) {
      candidates.value = null;
      select(null);
      showToast('Outside the dish.', 1600);
      return;
    }
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
