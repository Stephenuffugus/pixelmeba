/**
 * The small before/after preview of one What if? choice (UX §3.4, D09 §5). Drawn only from recorded
 * content the worker sent: the changed patch's exact cells before and after (the same cells
 * realization fills) and the founders' recorded start areas. Nothing is simulated.
 * R-G3: the After panel shows a dashed outline at the old patch and a solid new patch. An amount
 * change keeps the cells and changes the fill strength. Shapes carry the meaning, not color alone.
 */
import type { JSX } from 'preact';
import { GRID_W, MASK_CX, MASK_CY, MASK_R } from '@sim/constants';
import type { WhatIfChoice, WhatIfLayout } from '@worker/protocol';
import { patchName, previewAlt, WHATIF_TEXT } from '../strings/whatif';

/** Colors from the UX §6.1 palette: water, rim, text; the patch is a dark amber for ≥ 3:1 on water. */
const WATER = '#D6E7E5';
const RIM = '#2C3F49';
const OUTSIDE = '#14252D';
const PATCH = '#9C6412';
const OUTLINE = '#172C35';
const START_RING = '#256E9E';

interface View {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

const xy = (cell: number): [number, number] => [cell % GRID_W, Math.floor(cell / GRID_W)];

/** A square window around the changed cells (both positions), padded; the whole dish when nothing moves. */
function viewFor(choice: WhatIfChoice): View {
  const cells = [...choice.oldCells, ...choice.newCells];
  if (cells.length === 0) return { x: 0, y: 0, size: 128 };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of cells) {
    const [x, y] = xy(c);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + 1);
    y1 = Math.max(y1, y + 1);
  }
  const size = Math.max(40, x1 - x0 + 16, y1 - y0 + 16);
  return { x: (x0 + x1) / 2 - size / 2, y: (y0 + y1) / 2 - size / 2, size };
}

/** One path of unit squares (pixel-exact cells). */
function cellsPath(cells: readonly number[]): string {
  return cells
    .map((c) => {
      const [x, y] = xy(c);
      return `M${x} ${y}h1v1h-1z`;
    })
    .join('');
}

/** The outline of a set of cells: every cell edge whose neighbour is not in the set. */
function outlinePath(cells: readonly number[]): string {
  const set = new Set(cells);
  let d = '';
  for (const c of cells) {
    const [x, y] = xy(c);
    if (!set.has(c - GRID_W)) d += `M${x} ${y}h1`;
    if (!set.has(c + GRID_W)) d += `M${x} ${y + 1}h1`;
    if (x === 0 || !set.has(c - 1)) d += `M${x} ${y}v1`;
    if (x === GRID_W - 1 || !set.has(c + 1)) d += `M${x + 1} ${y}v1`;
  }
  return d;
}

/** Founder start areas whose centre lies inside the window (rings cut by the edge would only clutter). */
function startsIn(v: View, layout: WhatIfLayout): WhatIfLayout['founders'] {
  return layout.founders.filter((f) => {
    const cx = f.center[0] + 0.5;
    const cy = f.center[1] + 0.5;
    return cx >= v.x && cx <= v.x + v.size && cy >= v.y && cy <= v.y + v.size;
  });
}

function strength(value: number, max: number): number {
  return max > 0 ? 0.3 + (0.7 * value) / max : 1;
}

function Panel(props: {
  readonly choice: WhatIfChoice;
  readonly layout: WhatIfLayout;
  readonly view: View;
  readonly side: 'before' | 'after';
}) {
  const { choice, layout, view, side } = props;
  const change = choice.preview.change;
  const k = view.size / 48; // stroke widths scale with the window so lines look the same size
  const starts = startsIn(view, layout);
  let patch: JSX.Element | null = null;
  if (change.kind === 'amount') {
    const max = Math.max(change.before, change.after);
    const v = side === 'before' ? change.before : change.after;
    patch = (
      <path
        d={cellsPath(choice.oldCells)}
        fill={PATCH}
        fill-opacity={strength(v, max)}
        data-testid={side === 'before' ? 'whatif-before-patch' : 'whatif-new-patch'}
      />
    );
  } else if (change.kind === 'moved') {
    patch =
      side === 'before' ? (
        <path d={cellsPath(choice.oldCells)} fill={PATCH} data-testid="whatif-before-patch" />
      ) : (
        <g>
          <path
            d={outlinePath(choice.oldCells)}
            fill="none"
            stroke={OUTLINE}
            stroke-width={0.6 * k}
            stroke-dasharray={`${1.4 * k} ${1 * k}`}
            data-testid="whatif-old-patch"
          />
          <path d={cellsPath(choice.newCells)} fill={PATCH} data-testid="whatif-new-patch" />
        </g>
      );
  }
  const alt = previewAlt(change, side);
  return (
    <figure class="whatif-panel">
      <svg
        viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`}
        role="img"
        aria-label={alt}
        shape-rendering="crispEdges"
        data-testid={`whatif-${side}`}
      >
        <rect x={view.x} y={view.y} width={view.size} height={view.size} fill={OUTSIDE} />
        <circle
          cx={MASK_CX + 0.5}
          cy={MASK_CY + 0.5}
          r={MASK_R + 0.5}
          fill={WATER}
          stroke={RIM}
          stroke-width={1.2 * k}
        />
        {patch}
        {starts.map((f) => (
          <g key={`${f.speciesId}-${f.center[0]}-${f.center[1]}`} shape-rendering="geometricPrecision">
            {/* A pale halo keeps the dotted ring readable over the patch. */}
            <circle
              cx={f.center[0] + 0.5}
              cy={f.center[1] + 0.5}
              r={f.radius + 0.5}
              fill="none"
              stroke={WATER}
              stroke-width={1.4 * k}
            />
            <circle
              cx={f.center[0] + 0.5}
              cy={f.center[1] + 0.5}
              r={f.radius + 0.5}
              fill="none"
              stroke={START_RING}
              stroke-width={0.7 * k}
              stroke-dasharray={`${0.4 * k} ${0.8 * k}`}
            />
          </g>
        ))}
      </svg>
      <figcaption>{side === 'before' ? WHATIF_TEXT.before : WHATIF_TEXT.after}</figcaption>
    </figure>
  );
}

export function WhatIfPreview(props: { readonly choice: WhatIfChoice; readonly layout: WhatIfLayout }) {
  const { choice, layout } = props;
  const change = choice.preview.change;
  const view = viewFor(choice);
  const starts = startsIn(view, layout);
  const name = patchName(change);
  return (
    <div
      class="whatif-preview"
      data-testid="whatif-preview"
      role="group"
      aria-label={WHATIF_TEXT.previewLabel}
    >
      <div class="whatif-panels">
        <Panel choice={choice} layout={layout} view={view} side="before" />
        <Panel choice={choice} layout={layout} view={view} side="after" />
      </div>
      <ul class="whatif-legend">
        {change.kind !== 'unchanged' ? (
          <li>
            <svg class="whatif-swatch" viewBox="0 0 16 16" aria-hidden="true">
              <rect x="2" y="2" width="12" height="12" fill={PATCH} />
            </svg>
            {change.kind === 'amount'
              ? `${capital(name)}: a stronger fill means more ${change.field}`
              : capital(name)}
          </li>
        ) : null}
        {change.kind === 'moved' ? (
          <li>
            <svg class="whatif-swatch" viewBox="0 0 16 16" aria-hidden="true">
              <rect
                x="2.5"
                y="2.5"
                width="11"
                height="11"
                fill="none"
                stroke={OUTLINE}
                stroke-width="1.5"
                stroke-dasharray="3 2"
              />
            </svg>
            Where it was before
          </li>
        ) : null}
        {starts.map((f) => (
          <li key={`${f.speciesId}-${f.center[0]}-${f.center[1]}`}>
            <svg class="whatif-swatch" viewBox="0 0 16 16" aria-hidden="true">
              <circle
                cx="8"
                cy="8"
                r="5.5"
                fill="none"
                stroke={START_RING}
                stroke-width="1.5"
                stroke-dasharray="1 2"
              />
            </svg>
            Where the {f.count} {f.count === 1 ? f.name : plural(f.name)} start
          </li>
        ))}
      </ul>
    </div>
  );
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function plural(name: string): string {
  return name.endsWith('s') ? name : `${name}s`;
}
