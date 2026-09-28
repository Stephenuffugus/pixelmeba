/**
 * Lab toolbar (UX §4.4; P2.7): bottom categories Inspect · Life · Food · Chemistry · Habitat · Tools ·
 * Observe (+ Undo, always visible), a strip naming the persistent tool with its brush radius and the
 * live footprint while previewing, and the open tray. Portrait: the tray floats above the bar;
 * landscape/desktop: the whole bar is the side panel and the tray sits inside it.
 */
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import type { JSX } from 'preact';
import { IconFood, IconLife, IconUndo } from '../icons';
import { dishInfo, meta, undo } from '../state';
import { LAB_CATEGORIES, LAB_TEXT, MATERIAL_COPY, RADII, type LabCategory } from '../strings/lab';
import { LabTray, categoryOf, itemCopy } from '../panels/LabTray';
import { IconChemistry, IconHabitat, IconInspect, IconObserve, IconTools } from '../panels/LabTrayIcons';
import { brushInfo, brushRule, labRadius, labTool, labTray, materialDose, openLabTray, selectLabTool, setLabRadius } from './LabView';

const CATEGORY_ICONS: Record<LabCategory, () => JSX.Element> = {
  inspect: IconInspect,
  life: () => <IconLife />,
  food: () => <IconFood />,
  chemistry: IconChemistry,
  habitat: IconHabitat,
  tools: IconTools,
  observe: IconObserve,
};

/** Landscape/desktop: the Lab bar is a side panel and the tray sits inside it (UX §4.4). */
const SIDE_PANEL_QUERY = '(orientation: landscape) and (min-width: 700px)';
const sidePanel = signal<boolean>(typeof matchMedia === 'function' && matchMedia(SIDE_PANEL_QUERY).matches);

function useSidePanel(): boolean {
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia(SIDE_PANEL_QUERY);
    const on = () => (sidePanel.value = mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return sidePanel.value;
}

/**
 * Portrait phones: the open tray is a sheet inside the viewport (like every other panel), so it
 * never covers the top strip or the categories. Rendered by the dish screen's viewport.
 */
export function LabTrayHost() {
  const side = useSidePanel();
  const tray = labTray.value;
  return !side && tray && tray !== 'inspect' ? <LabTray category={tray} /> : null;
}

function toolName(id: string): string {
  if (id === 'inspect') return 'Inspect';
  return itemCopy(id as Parameters<typeof itemCopy>[0])?.name ?? 'Inspect';
}

function StripInfo() {
  const id = labTool.value;
  const b = brushInfo.value;
  if (!b) {
    const hint = id === 'inspect' ? LAB_TEXT.inspectHint : id.startsWith('life:') ? LAB_TEXT.lifeHint : LAB_TEXT.brushHint;
    return <span class="lab-hint">{hint}</span>;
  }
  let total = '';
  if (id.startsWith('material:')) {
    const mid = id.slice('material:'.length);
    const unit = MATERIAL_COPY[mid]?.unit ?? '';
    total = ` · total ${(b.cells * materialDose(mid)).toFixed(2)}${unit ? ` ${unit}` : ''}`;
  }
  return (
    <span class="lab-brush-info" data-testid="brush-info">
      {b.cells} cell{b.cells === 1 ? '' : 's'}
      {total}
      {b.refused > 0 ? ` · ${b.refused} crossed out (skipped)` : ''}
    </span>
  );
}

function ToolStrip() {
  const id = labTool.value;
  const radiusTool = brushRule(id) !== null || id.startsWith('life:');
  const cat = categoryOf(id);
  return (
    <div class="lab-strip" data-testid="lab-strip">
      <div class="lab-strip-tool">
        <span class="lab-strip-label">{LAB_TEXT.toolLabel}:</span> <strong data-testid="lab-tool-name">{toolName(id)}</strong>
        {radiusTool ? <span class="lab-strip-radius"> · r {labRadius.value}</span> : null}
      </div>
      <StripInfo />
      <div class="lab-strip-actions">
        {radiusTool ? (
          <div class="segmented" role="group" aria-label={LAB_TEXT.radius}>
            {RADII.map((r) => (
              <button key={r} class="btn" aria-pressed={labRadius.value === r} onClick={() => setLabRadius(r)} aria-label={`Radius ${r}`}>
                {r}
              </button>
            ))}
          </div>
        ) : null}
        {id !== 'inspect' ? (
          <button class="btn" onClick={() => openLabTray(labTray.value === cat ? null : cat)} aria-expanded={labTray.value === cat}>
            {labTray.value === cat ? LAB_TEXT.hideTray : LAB_TEXT.showTray}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function LabToolbar() {
  const info = dishInfo.value;
  const m = meta.value;
  const tray = labTray.value;
  const id = labTool.value;
  const toolCat = categoryOf(id);
  const side = useSidePanel();

  // A tool that names something this dish does not have (e.g. after opening another dish) falls
  // back to Inspect instead of sending a command the simulation would refuse.
  useEffect(() => {
    if (!info || id === 'inspect') return;
    if (id.startsWith('life:') && !info.speciesIds.includes(id.slice('life:'.length))) selectLabTool('inspect');
    else if (id.startsWith('material:') && !info.materials.some((mt) => mt.id === id.slice('material:'.length))) selectLabTool('inspect');
  }, [info?.dishId, id]);

  return (
    <nav class="bottombar lab-bar" aria-label="Lab tools" data-testid="lab-bar">
      <div class="lab-cats" role="group" aria-label="Lab categories">
        {LAB_CATEGORIES.map((c) => {
          const Icon = CATEGORY_ICONS[c.id];
          const holdsTool = c.id !== 'inspect' && toolCat === c.id;
          return c.id === 'inspect' ? (
            <button key={c.id} class="btn lab-cat" aria-pressed={id === 'inspect'} onClick={() => openLabTray('inspect')} data-testid="lab-cat-inspect">
              <Icon />
              <span>{c.label}</span>
            </button>
          ) : (
            <button
              key={c.id}
              class={`btn lab-cat${holdsTool ? ' holds-tool' : ''}`}
              aria-expanded={tray === c.id}
              onClick={() => openLabTray(c.id)}
              data-testid={`lab-cat-${c.id}`}
              title={holdsTool ? `${c.label} (selected tool: ${toolName(id)})` : c.label}
            >
              <Icon />
              <span>{c.label}</span>
            </button>
          );
        })}
        <button class="btn lab-cat" aria-label="Undo (rewinds time)" title="Undo rewinds time" disabled={!m?.undoAvailable} onClick={() => void undo()} data-testid="lab-undo">
          <IconUndo />
          <span aria-hidden="true">Undo</span>
        </button>
      </div>
      <ToolStrip />
      {side && tray && tray !== 'inspect' ? <LabTray category={tray} /> : null}
    </nav>
  );
}
