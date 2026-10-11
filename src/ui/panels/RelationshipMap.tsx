/**
 * The relationship map sheet (P4.8; SPEC §12.8: observed transfers and attacks with type and measured
 * total, windows 60/180/600 s, unknown = absent; D02 §20 and line 149; UX §9 table first).
 *
 * An accessible table first (Actor, Relationship, Target, Measured), then a small node-link picture of
 * the same edges: species with their atlas icon and name, pools by name, one arrow per edge with its
 * kind as text (never meaning by colour alone). Everything is the worker's read-only ledger; reading it
 * changes nothing.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { drawFrame, loadAtlas } from '../atlas';
import { IconClose } from '../icons';
import { dishInfo, sheet } from '../state';
import { clockText } from './TraitData';
import { OBSERVE_TEXT } from '../strings/observe';
import {
  exchangePairs,
  mapData,
  mapPicture,
  mapRows,
  mapWindow,
  OBSERVE_WINDOWS,
  poolLines,
  refreshMap,
  speciesName,
  type PictureArrow,
  type PictureNode,
} from '../observe';
import type { MapWindow } from '@worker/relationshipMap';

const REFRESH_MS = 1000;

/** The 60 / 180 / 600 s choice: a labelled radio group (native radios: arrow keys move the choice). */
export function WindowChoice({
  name,
  value,
  onChange,
  testid,
}: {
  name: string;
  value: MapWindow;
  onChange: (w: MapWindow) => void;
  testid: string;
}) {
  return (
    <fieldset class="observe-window" data-testid={testid}>
      <legend>{OBSERVE_TEXT.windowLegend}</legend>
      {OBSERVE_WINDOWS.map((w) => (
        <label key={w} class="observe-radio">
          <input
            type="radio"
            name={name}
            value={String(w)}
            checked={value === w}
            onChange={() => onChange(w)}
            data-testid={`${testid}-${w}`}
          />
          <span>{OBSERVE_TEXT.windowOption(w)}</span>
        </label>
      ))}
    </fieldset>
  );
}

function useAtlasIcons(assets: readonly string[]): Record<string, string> {
  const [icons, setIcons] = useState<Record<string, string>>({});
  const key = assets.join(',');
  useEffect(() => {
    let live = true;
    void loadAtlas()
      .then((atlas) => {
        const out: Record<string, string> = {};
        for (const a of assets) {
          const c = document.createElement('canvas');
          c.width = 32;
          c.height = 32;
          try {
            drawFrame(c, atlas, a);
            out[a] = c.toDataURL();
          } catch {
            // no icon: the name stands alone
          }
        }
        if (live) setIcons(out);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key]);
  return icons;
}

const SIZE = 600;
const NODE_R = 46;

function arrowPath(a: PictureNode, b: PictureNode, lane: number): { d: string; mx: number; my: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / len;
  const uy = dy / len;
  // Two arrows between the same pair go side by side; the direction decides which side.
  const side = a.id < b.id ? 1 : -1;
  const off = (lane * 26 + 13) * side;
  const ox = -uy * off;
  const oy = ux * off;
  const x1 = a.x + ux * NODE_R + ox;
  const y1 = a.y + uy * NODE_R + oy;
  const x2 = b.x - ux * (NODE_R + 6) + ox;
  const y2 = b.y - uy * (NODE_R + 6) + oy;
  return {
    d: `M${x1.toFixed(1)},${y1.toFixed(1)}L${x2.toFixed(1)},${y2.toFixed(1)}`,
    mx: (x1 + x2) / 2,
    my: (y1 + y2) / 2,
  };
}

function Picture({
  nodes,
  arrows,
  icons,
  assetOf,
}: {
  nodes: PictureNode[];
  arrows: PictureArrow[];
  icons: Record<string, string>;
  assetOf: (id: string) => string | undefined;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(SIZE);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth || SIZE));
    ro.observe(el);
    setWidth(el.clientWidth || SIZE);
    return () => ro.disconnect();
  }, []);
  // Text on the picture stays at least 16 CSS px whatever width the picture is shown at.
  const font = Math.max(16, (16 * SIZE) / Math.max(1, width));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return (
    <div class="relmap-picture" ref={box}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="100%"
        role="img"
        aria-label={OBSERVE_TEXT.pictureLabel(arrows.length)}
        data-testid="relmap-picture"
      >
        <defs>
          <marker
            id="relmap-head"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0L10,5L0,10Z" fill="#172C35" />
          </marker>
        </defs>
        {arrows.map((a) => {
          const from = byId.get(a.from);
          const to = byId.get(a.to);
          if (!from || !to) return null;
          const p = arrowPath(from, to, a.lane);
          return (
            <g key={a.key} data-testid="relmap-arrow" data-edge={a.key}>
              <path d={p.d} stroke="#172C35" stroke-width="3" fill="none" marker-end="url(#relmap-head)" />
              <text
                x={p.mx}
                y={p.my - 6}
                text-anchor="middle"
                font-size={font}
                fill="#172C35"
                stroke="#F5F4EF"
                stroke-width={font / 5}
                paint-order="stroke"
              >
                {a.text}
              </text>
            </g>
          );
        })}
        {nodes.map((n) => {
          const asset = n.kind === 'species' ? assetOf(n.id.slice(2)) : undefined;
          const icon = asset ? icons[asset] : undefined;
          return (
            <g key={n.id} data-node={n.id}>
              {n.kind === 'species' ? (
                <circle cx={n.x} cy={n.y} r={NODE_R} fill="#F5F4EF" stroke="#172C35" stroke-width="3" />
              ) : (
                <rect
                  x={n.x - NODE_R}
                  y={n.y - NODE_R * 0.7}
                  width={NODE_R * 2}
                  height={NODE_R * 1.4}
                  rx="10"
                  fill="#E8E4D8"
                  stroke="#172C35"
                  stroke-width="3"
                  stroke-dasharray={n.kind === 'enzyme' ? '8 5' : undefined}
                />
              )}
              {icon ? (
                <image
                  href={icon}
                  x={n.x - 20}
                  y={n.y - 34}
                  width="40"
                  height="40"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : null}
              <text
                x={n.x}
                y={icon ? n.y + 26 : n.y + 6}
                text-anchor="middle"
                font-size={font}
                fill="#172C35"
                stroke="#F5F4EF"
                stroke-width={font / 5}
                paint-order="stroke"
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function RelationshipMapSheet() {
  const info = dishInfo.value;
  const w = mapWindow.value;
  useEffect(() => {
    void refreshMap();
    const t = setInterval(() => void refreshMap(), REFRESH_MS);
    return () => clearInterval(t);
  }, [w, info?.dishId]);
  const map = mapData.value;
  const icons = useAtlasIcons(info?.speciesAssets ?? []);
  if (!info) return null;
  const names = { speciesIds: info.speciesIds, speciesNames: info.speciesNames };
  const shown = map && map.windowSeconds === w ? map : null;
  const rows = shown ? mapRows(shown, names) : [];
  const pools = shown ? poolLines(shown) : [];
  const pairs = shown ? exchangePairs(shown) : [];
  const picture = shown ? mapPicture(shown, names, SIZE) : { nodes: [], arrows: [] };
  const assetOf = (id: string) => info.speciesAssets[info.speciesIds.indexOf(id)];
  return (
    <section class="sheet relmap-sheet" aria-labelledby="relmap-title" data-testid="relmap-sheet">
      <div class="sheet-scroll">
        <header>
          <h2 id="relmap-title">{OBSERVE_TEXT.mapTitle}</h2>
          <button
            class="btn ghost"
            aria-label={OBSERVE_TEXT.close}
            onClick={() => (sheet.value = 'none')}
            data-testid="relmap-close"
          >
            <IconClose />
          </button>
        </header>
        <p class="sub">{OBSERVE_TEXT.mapIntro}</p>
        <WindowChoice
          name="relmap-window"
          value={w}
          onChange={(v) => (mapWindow.value = v)}
          testid="relmap-window"
        />
        {shown && shown.recordedSinceSecond !== null ? (
          <p data-testid="relmap-since">
            {OBSERVE_TEXT.recordedSince(clockText(shown.recordedSinceSecond))} {OBSERVE_TEXT.recordedSinceWhy}
          </p>
        ) : null}
        {shown && rows.length === 0 ? <p data-testid="relmap-empty">{OBSERVE_TEXT.empty(w)}</p> : null}
        {rows.length > 0 ? (
          <div class="relmap-table-wrap" tabIndex={0} role="region" aria-label={OBSERVE_TEXT.tableCaption(w)}>
            <table class="relmap-table" data-testid="relmap-table">
              <caption class="sr-only">{OBSERVE_TEXT.tableCaption(w)}</caption>
              <thead>
                <tr>
                  <th scope="col">{OBSERVE_TEXT.colActor}</th>
                  <th scope="col">{OBSERVE_TEXT.colKind}</th>
                  <th scope="col">{OBSERVE_TEXT.colTarget}</th>
                  <th scope="col">{OBSERVE_TEXT.colMeasured(w)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} data-edge={r.key}>
                    <th scope="row">{r.actor}</th>
                    <td>{r.kind}</td>
                    <td>{r.target}</td>
                    <td>{r.measured}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {pairs.length > 0 ? (
          <ul class="relmap-exchange" data-testid="relmap-exchange">
            {pairs.map(([a, b]) => (
              <li key={`${a}-${b}`}>{OBSERVE_TEXT.exchange(speciesName(names, a), speciesName(names, b))}</li>
            ))}
          </ul>
        ) : null}
        {pools.length > 0 ? (
          <section aria-labelledby="relmap-pools-title">
            <h3 id="relmap-pools-title">{OBSERVE_TEXT.poolsTitle}</h3>
            <ul data-testid="relmap-pools">
              {pools.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <p class="sub">{OBSERVE_TEXT.poolNotSplit}</p>
          </section>
        ) : null}
        {picture.arrows.length > 0 ? (
          <Picture nodes={picture.nodes} arrows={picture.arrows} icons={icons} assetOf={assetOf} />
        ) : null}
        <p class="sub" data-testid="relmap-footnote">
          {OBSERVE_TEXT.footnote}
        </p>
        <p class="sub">{OBSERVE_TEXT.fictional}</p>
      </div>
    </section>
  );
}
