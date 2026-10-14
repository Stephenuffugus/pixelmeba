import { useEffect, useRef, useState } from 'preact/hooks';
import { DEMO_MODE } from '@platform/web'; // P4.11
import { DishRenderer } from '@render/renderer';
import { loadAtlas } from '../atlas';
import { attachGestures, type GestureHandlers } from '../gestures';
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
import { DeviceSheet } from '../panels/DeviceSheet';
import { GateSheet } from '../panels/GateSheet';
import { MoreSheet, SaveSheet } from '../panels/MoreSheet';
import { HistorySheet } from '../panels/HistorySheet';
import { FamilyMarkers } from '../panels/FamilyMarkers';
import { FavoriteExtinct } from '../panels/FavoriteExtinct';
import { FavoriteMarkers } from '../panels/FavoriteMarkers';
import { FavoriteSheet } from '../panels/FavoriteSheet';
import { ShareSheet } from '../panels/ShareSheet';
import { RelationshipMapSheet } from '../panels/RelationshipMap';
import { ProbeSheet } from '../panels/ProbePanel';
import { FavoriteSlots } from '../panels/FavoriteSlots';
import { LineageSheet } from '../panels/LineageSheet';
import { EvolutionSheet } from '../panels/AdvancedEvolution';
import { WhatIfHost } from '../panels/WhatIfSheet';
import { whatIfOpen } from '../panels/WhatIfState';
import { LineageLegend } from '../panels/LineageLegend';
import { DiscoveryCard } from '../panels/DiscoveryCard';
import { placeSpecimenTap } from '../panels/LineageState';
import { IconMore } from '../icons';
import { autosave } from '../state';
import { dishView, handleViewKey, labGestures, LabViewToggle, setDishView } from './LabView';
import { labTray } from './LabView';
import { LabToolbar, LabTrayHost } from './LabToolbar';
import { OverlayLegend } from '../panels/OverlayLegend';
import { SamplePanel } from '../panels/SamplePanel';
import type { Speed } from '@worker/protocol';
import { DishSummary } from '../a11y/DishSummary';
import { CellDescription, CELL_DESCRIPTION_ID } from '../a11y/CellDescription';
import { lastInputWasKeyboard, restoreFocus, revealOnSheetChange } from '../a11y/focus';
import { NoticeHost } from './NoticeHost';
import { TryBadge } from '../panels/TryBadge';
import { TrySetupSheet } from '../panels/TrySetup';
import { closeTrySetup } from '../tryDish';
import { shareSheetKey } from '../share';
import { TryHorizonSheet } from '../panels/TryHorizon';
import { BookmarkSheet } from '../panels/BookmarkSheet';
import { bookmarkSheetKey } from '../bookmarks';
import { ChallengeSheet } from '../panels/ChallengeStart';
import { challengeSheetKey } from '../challenge';
import { useSpeedBadge } from '../speedBadge';
import { DiagnosticsBar } from '../panels/Diagnostics';
import { settings as appSettings } from '../state';

function formatTime(tick: number): string {
  const s = Math.floor(tick / 10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/**
 * Keyboard placement and selection (UX §4.2, §9; P3.11 W6-06): with the dish focused, a centre reticle
 * marks the target and Enter is one tap there, through the same handlers the pointer gestures use. The
 * candidate list that a keyboard tap opens takes focus on its first organism.
 */
let candidatesFromKey = false;

/** Controls that Space activates when the player reached them with the keyboard (UX §4.2; D-0029). */
const SPACE_CONTROLS =
  'button, [role="button"], [role="radio"], [role="tab"], [role="checkbox"], [role="switch"], a[href], summary';

export function DishScreen() {
  const host = useRef<HTMLDivElement>(null);
  /** The dish's keyboard stop (W6-06): focusable, under every panel, never in the pointer's way. */
  const dishFocus = useRef<HTMLDivElement>(null);
  /** The handlers attachGestures received (Lab-wrapped): Enter at the reticle taps through them. */
  const gestures = useRef<GestureHandlers | null>(null);
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
      detach = attachGestures(host.current, r, (gestures.current = labGestures({
        paints: () => tool.value.kind === 'feed' && tool.value.paint,
        onCameraMoved: () => undefined,
        onTap: (sx, sy, wx, wy) => onTap(r!, sx, sy, wx, wy),
        onStroke: (points) => {
          const t = tool.value;
          if (t.kind === 'feed') void sendCommand({ kind: 'deposit', materialId: t.materialId, points, radius: t.radius, dose: t.dose });
        },
      })));
      setReady(true);
    })();
    return () => {
      disposed = true;
      gestures.current = null;
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

  // P4.11 fix round 1 (D09 line 209 "Explore controls"): the demo has no Lab, so the dish never shows in it
  // (a guard behind the hidden toggle and New Dish's Explore start).
  const view = dishView.value;
  useEffect(() => {
    if (DEMO_MODE && view === 'lab') setDishView('explore');
  }, [view]);

  // P3.11 (W6-04/W6-06): when a key or a choice closes the panel that held focus (a sheet, the candidate
  // list, a Lab tray), focus returns to the dish instead of the page body, so the next key acts there.
  // Not after a pointer action (restoreFocus checks the input modality): the reticle would stay hidden.
  const openCandidates = candidates.value;
  const openTray = labTray.value;
  const currentTool = tool.value;
  // D-0099: the inspector's reveal pan (UX §4.1) moved the view so the organism shows beside the panel.
  // When a key closes the inspector (no other sheet takes its place) and the dish has focus, the view eases
  // back to where the player left it, so the reticle is on the dish again and the next Enter acts there.
  // Any other change (a pointer close, another sheet such as Add Life or the Try horizon card) keeps the view.
  const prevSheet = useRef(openSheet);
  useEffect(() => void lastInputWasKeyboard(), []);
  useEffect(() => {
    restoreFocus(dishFocus.current);
    const reveal = revealOnSheetChange(prevSheet.current, openSheet, lastInputWasKeyboard(), document.activeElement === dishFocus.current);
    prevSheet.current = openSheet;
    if (reveal === 'undo') getRenderer()?.camera.undoReveal();
    else if (reveal === 'forget') getRenderer()?.camera.forgetReveal();
  }, [openSheet, openCandidates, openTray, currentTool]);

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
      if (sheet.value === 'trySetup') {
        if (e.key === 'Escape') closeTrySetup(); // P4.7: a blocking panel; Esc is its Cancel (run state restored)
        return;
      }
      if (shareSheetKey(e.key)) return; // P4.6: the Share sheet is a blocking panel too; Esc is its Close (run state restored)
      if (bookmarkSheetKey(e.key)) return; // P4.8b: the Bookmark sheet pauses the dish; Esc is its Cancel (run state restored)
      if (challengeSheetKey(e.key)) return; // P4.8c: the challenge sheet is a blocking panel; Esc is its Cancel (run state restored)
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
      if (e.key === ' ' && modality === 'keyboard' && (e.target as HTMLElement | null)?.closest(SPACE_CONTROLS)) return;
      if (handleViewKey(e)) return; // I / L / F / Esc per view (UX §4.2; P2.7)
      const r = getRenderer();
      // P3.11 (W6-06): Enter on the focused dish is one tap at the reticle (the viewport's centre), through
      // the same handlers as a pointer tap: a placement tool commits one gesture, Look / Lab Inspect selects.
      if (e.key === 'Enter' && e.target === dishFocus.current && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        const h = gestures.current;
        if (!r || !h) return;
        r.camera.settle(); // P4.13: an eased move ends where it was going, so the tap lands where the view goes
        const sx = r.camera.viewW / 2;
        const sy = r.camera.viewH / 2;
        const [wx, wy] = r.camera.screenToWorld(sx, sy);
        candidatesFromKey = true;
        h.onTap(sx, sy, wx, wy);
        if (!candidates.value) candidatesFromKey = false;
        return;
      }
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
      else if (r && (e.key === '+' || e.key === '=')) r.camera.zoomBy(1.25); // P4.13: eased like the zoom buttons
      else if (r && e.key === '-') r.camera.zoomBy(0.8);
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
  // P4.13 (src/ui/speedBadge.ts): shown after 2 s below 0.8 × the chosen speed, gone after 2 s at ≥ 0.9 ×.
  const badge = useSpeedBadge(running, m?.speed ?? 0, m?.effectiveSpeed ?? 0);
  const diagnostics = appSettings.value.showPerformance === true;

  return (
    <div class={`dish-screen${diagnostics ? ' with-diag' : ''}`} data-testid="dish-screen" data-view={dishView.value}>
      <header class="topbar">
        <button class="btn ghost" aria-label="Home" onClick={() => (route.value = { name: 'home' })}>
          <IconBack />
        </button>
        <div class="title">
          <strong>{info?.name ?? 'Dish'}</strong>
          <span class="time" aria-live="off" data-testid="sim-time">
            {formatTime(m?.tick ?? 0)} · {m?.count ?? 0} alive
            {badge.shown ? (
              <span class="speed-badge" title={badge.label} aria-label={badge.label} role="img" data-testid="speed-badge">
                {badge.text}
              </span>
            ) : null}
          </span>
          {/* P4.7: a Try my dish turn's time left, or "Turn n finished" at its horizon. */}
          <TryBadge />
        </div>
        <button class={`btn ${running ? '' : 'primary'}`} onClick={togglePause} aria-label={running ? 'Pause' : 'Run'} data-testid="run-toggle">
          {running ? <IconPause /> : <IconPlay />}
        </button>
        {/* P4.11 DEMO_MODE (D09 §10 "Explore controls"): Explore only, no Lab. */}
        {DEMO_MODE ? null : <LabViewToggle />}
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
      {/* P4.13: Settings "Show performance numbers": a line under the top strip, part of the layout (never over the dish). */}
      {diagnostics ? <DiagnosticsBar /> : null}

      <div class="viewport" ref={host} data-testid="viewport">
        {!ready ? <p style={{ color: '#c9d6d8', padding: '1rem' }}>Preparing the dish…</p> : null}
        {/* P3.11 (UX §4.2, §9): the dish's keyboard stop. It lies under every panel and takes no pointer
            input (taps reach the canvas); focused, it shows the centre reticle that Enter taps at. */}
        <div
          class="dish-focus"
          ref={dishFocus}
          tabIndex={0}
          role="application"
          aria-label={`Dish: ${info?.name ?? 'Dish'}`}
          aria-describedby={`dish-keys-hint ${CELL_DESCRIPTION_ID}`}
          data-testid="dish-focus"
        >
          <div class="reticle" aria-hidden="true" data-testid="reticle" />
        </div>
        <p id="dish-keys-hint" class="sr-only">
          Enter uses the chosen tool at the centre mark; with Look it inspects there. Arrow keys pan, plus and minus zoom, Space runs or pauses, U undoes.
        </p>
        <CellDescription />
        <DishSummary />
        {/* P4.3: the one visible notice (goal > experiment > story > prompt; src/ui/notices.ts), in the prompt's old place. */}
        <NoticeHost />
        <div class="zoom-buttons">
          <button class="btn" aria-label="Whole dish" onClick={() => getRenderer()?.zoomPreset('dish')}>
            <IconZoomDish />
          </button>
          <button class="btn" aria-label="Zoom in" onClick={() => getRenderer()?.camera.zoomBy(1.6)}>
            <IconZoomIn />
          </button>
          <button class="btn" aria-label="Zoom out" onClick={() => getRenderer()?.camera.zoomBy(0.625)}>
            <IconZoomOut />
          </button>
        </div>
        <FamilyMarkers />
        <FavoriteMarkers />
        <FavoriteExtinct />
        <LineageLegend />
        <DiscoveryCard />
        {dishView.value === 'lab' ? <OverlayLegend floating /> : null}
        {dishView.value === 'lab' ? <LabTrayHost /> : null}
        <SamplePanel />
        {candidates.value ? <CandidateList /> : null}
        {m?.capacityReached ? <div class="capacity-banner">Simulation capacity reached — a limit of the game, not the ecosystem.</div> : null}
        {/* Announced once by the app's live region (src/ui/a11y/LiveRegion.tsx); this one is visual only. */}
        {toast.value ? <div class="toast">{toast.value}</div> : null}
        {sheet.value === 'addLife' ? <AddLifeSheet /> : null}
        {sheet.value === 'feed' ? <FeedSheet /> : null}
        {sheet.value === 'inspect' ? <InspectorSheet /> : null}
        {/* P5.1/P5.2: the device settings and gate sheets (opened from the cell inspector). */}
        {sheet.value === 'device' ? <DeviceSheet /> : null}
        {sheet.value === 'gate' ? <GateSheet /> : null}
        {sheet.value === 'more' ? <MoreSheet /> : null}
        {sheet.value === 'save' ? <SaveSheet /> : null}
        {sheet.value === 'history' ? <HistorySheet /> : null}
        {sheet.value === 'lineage' ? <LineageSheet /> : null}
        {sheet.value === 'evolution' ? <EvolutionSheet /> : null}
        {sheet.value === 'favorite' ? <FavoriteSheet /> : null}
        {/* P4.6 (UX §5.10): the Share sheet (opening it paused the dish; closing restores the speed). */}
        {sheet.value === 'share' ? <ShareSheet /> : null}
        {sheet.value === 'trySetup' ? <TrySetupSheet /> : null}
        {sheet.value === 'tryHorizon' ? <TryHorizonSheet /> : null}
        {/* P4.8: the Observe tray's relationship map and region probes (read-only sheets). */}
        {sheet.value === 'relationshipMap' ? <RelationshipMapSheet /> : null}
        {sheet.value === 'probes' ? <ProbeSheet /> : null}
        {/* P4.8b: Bookmark this moment (opening it paused the dish; closing restores the speed). */}
        {sheet.value === 'bookmark' ? <BookmarkSheet /> : null}
        {/* P4.8c: Make a challenge, Start challenge, Leave challenge (opening it paused the dish; closing restores the speed). */}
        {sheet.value === 'challenge' ? <ChallengeSheet /> : null}
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
        <FavoriteSlots />
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
  const list = useRef<HTMLDivElement>(null);
  // P3.11 (W6-06): a list opened by Enter at the reticle takes focus on its first organism.
  useEffect(() => {
    if (!candidatesFromKey) return;
    candidatesFromKey = false;
    list.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }, [c]);
  return (
    <div class="candidates" ref={list} style={{ left: `${Math.max(8, c.x - 80)}px`, top: `${Math.max(8, c.y + 12)}px` }}>
      {/* P3.11: a listbox holds options only (axe aria-required-children); Cancel sits beside it. */}
      <div class="candidate-options" role="listbox" aria-label="Choose an organism">
        {c.items.map((it) => (
          <button key={it.birthId} class="btn" role="option" aria-selected="false" onClick={() => select({ kind: 'entity', birthId: it.birthId })}>
            {info?.speciesNames[it.species] ?? '?'} #{it.birthId}
          </button>
        ))}
      </div>
      <button class="btn ghost" onClick={() => (candidates.value = null)}>
        Cancel
      </button>
    </div>
  );
}
