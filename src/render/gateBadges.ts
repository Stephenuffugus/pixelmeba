/**
 * Gate-class badges (P5.7 "gate badges"; D02 "region pins and gate-class badges"; UX §6.5, §7.3, §9 "No
 * essential meaning by color alone"; CT §5.3; wave 12 structures-art-audio). PURE: no Pixi, no audio, no
 * simulation randomness; the renderer (renderer.ts drawGateBadges) strokes what this returns and GateSheet.tsx
 * draws the same pips as inline SVG beside each row of its permission table.
 *
 * A badge is seven pips, one per CT §5.3 transport class in the class order Dissolved, Activity, Viral, Small,
 * Medium, Large, Fixed. Each pip state comes from barriers.ts for the edge's code — the single source the gate
 * table (strings/structures.ts gateRows) and the tracer (gateTracer.ts) read; this file holds no table:
 *   field classes      edgeFactor 1 → 'pass', 0 < f < 1 → 'partial', 0 → 'blocked';
 *   organism classes   edgePermits → 'pass', else 'blocked';
 *   an S04 channel     the classes its directed transfer carries (gateTracer.ts tracerCrosses from the
 *                      upstream side: the dissolved and viral pools and Small) → 'oneWay'; the rest
 *                      'blocked' (D-0106: closed to ordinary spreading and movement).
 * Pips read by SHAPE: filled = pass, half-filled = partial, hollow = blocked, a chevron = one way, a dashed ring =
 * not applicable (P5.8: the world badge of an OPEN S03 draws its Fixed pip so, worldPipsFor — an open shutter's
 * "passes every class" does not apply to Fixed things, which never move: the gate table says "Stays put" and the
 * tracer never crosses Fixed; the badge has no words to say so). badgeFor itself, which the gate sheet's pips
 * read beside those words, is unchanged.
 *
 * World layer: one badge per straight run of same-code edges (runsOf) at the 'close' zoom preset only, plus one
 * beside the selected gate (its gate sheet open) at every zoom. Static: nothing animates, so reduced motion
 * changes nothing. Redrawn on a geometry change, a selection change or a zoom band change, never per tick.
 */
import { EDGE_CHANNEL, EDGE_NONE, EDGE_SHUTTER_OPEN, edgeFactor, edgeKey, edgePermits, type TransportClass } from '@sim/barriers';
import { GRID_W } from '@sim/constants';
import { EDGE_FLOW_BACK, type GeometryEdges } from '@worker/protocol';
import { ZOOM_CLOSE, ZOOM_NEIGHBORHOOD } from './camera';
import { tracerCrosses } from './gateTracer';
import { DISH_COLORS } from './layers';
import { EDGE_CODE_MASK } from './structureLayer';

/**
 * 'notApplicable' (P5.8, D-0123 notes): the class has no crossing to show here, drawn as a dashed ring (never
 * filled, never hollow-blocked). Only the world badge's Fixed pip of an OPEN S03 uses it (worldPipsFor).
 */
export type PipState = 'pass' | 'partial' | 'blocked' | 'oneWay' | 'notApplicable';

/** The CT §5.3 classes in badge (and gate table) order. */
export const BADGE_CLASSES: readonly TransportClass[] = ['dissolved', 'activity', 'viral', 'small', 'medium', 'large', 'fixed'];

export interface BadgePip {
  readonly cls: TransportClass;
  readonly state: PipState;
}

const FIELD = new Set<TransportClass>(['dissolved', 'activity', 'viral']);

/** The seven pips of an edge with GeometryMsg / barriers.ts `code` (EDGE_FLOW_BACK ignored), in class order. */
export function badgeFor(code: number): readonly BadgePip[] {
  const base = code & EDGE_CODE_MASK;
  return BADGE_CLASSES.map((cls) => {
    if (base === EDGE_CHANNEL) {
      // The channel's directed transfer only (the tracer's rule), from whichever side is upstream.
      const carried = tracerCrosses(code, cls, -1).crosses || tracerCrosses(code, cls, 1).crosses;
      return { cls, state: carried ? 'oneWay' : 'blocked' };
    }
    if (FIELD.has(cls)) {
      const f = edgeFactor(base, cls as 'dissolved' | 'activity' | 'viral');
      return { cls, state: f >= 1 ? 'pass' : f > 0 ? 'partial' : 'blocked' };
    }
    return { cls, state: edgePermits(base, cls) ? 'pass' : 'blocked' };
  });
}

/**
 * The pips the WORLD badge draws (P5.8): badgeFor, except an OPEN S03's Fixed pip, which is 'notApplicable'
 * (edgePermits says an open shutter passes every class, but a Fixed organism never moves, so there is no crossing
 * for the pip to show; D-0123 note "the open S03's Fixed pip reads 'pass'").
 */
export function worldPipsFor(code: number): readonly BadgePip[] {
  const pips = badgeFor(code);
  if ((code & EDGE_CODE_MASK) !== EDGE_SHUTTER_OPEN) return pips;
  return pips.map((p) => (p.cls === 'fixed' ? { cls: p.cls, state: 'notApplicable' as const } : p));
}

/** One barrier edge as GeometryMsg lists it, with its code (EDGE_FLOW_BACK included). */
export interface BadgeEdge {
  readonly cell: number;
  readonly dir: 'R' | 'D';
  readonly code: number;
}

/** A maximal straight run of consecutive same-code edges, and the world point at its middle (on the line). */
export interface EdgeRun {
  readonly dir: 'R' | 'D';
  readonly code: number;
  /** The run's cells in order along the line (ascending y for 'R', ascending x for 'D'). */
  readonly cells: readonly number[];
  readonly mid: readonly [number, number];
}

/**
 * The maximal straight runs of `list`: edges with the same direction and the same code, adjacent along their
 * line ('R' edges are vertical segments, so the next one is the cell below; 'D' edges horizontal, the next one
 * the cell to the right). An L-shaped line is two runs; alternating codes give single-edge runs.
 */
export function runsOf(list: readonly BadgeEdge[]): EdgeRun[] {
  // Line-major order: R by (x, y), D by (y, x), so neighbours along a line are consecutive.
  const sorted = [...list].sort((a, b) => {
    if (a.dir !== b.dir) return a.dir === 'R' ? -1 : 1;
    const ka = a.dir === 'R' ? (a.cell % GRID_W) * GRID_W + Math.floor(a.cell / GRID_W) : a.cell;
    const kb = b.dir === 'R' ? (b.cell % GRID_W) * GRID_W + Math.floor(b.cell / GRID_W) : b.cell;
    return ka - kb;
  });
  const out: EdgeRun[] = [];
  let cur: BadgeEdge[] = [];
  const flush = () => {
    if (cur.length === 0) return;
    const first = cur[0]!;
    const last = cur[cur.length - 1]!;
    const fx = first.cell % GRID_W;
    const fy = Math.floor(first.cell / GRID_W);
    const lx = last.cell % GRID_W;
    const ly = Math.floor(last.cell / GRID_W);
    const mid: [number, number] = first.dir === 'R' ? [fx + 1, (fy + ly + 1) / 2] : [(fx + lx + 1) / 2, fy + 1];
    out.push({ dir: first.dir, code: first.code, cells: cur.map((e) => e.cell), mid });
    cur = [];
  };
  for (const e of sorted) {
    const prev = cur[cur.length - 1];
    const next = prev && (prev.dir === 'R' ? prev.cell + GRID_W : prev.cell % GRID_W < GRID_W - 1 ? prev.cell + 1 : -1);
    if (prev && !(e.dir === prev.dir && e.code === prev.code && e.cell === next)) flush();
    cur.push(e);
  }
  flush();
  return out;
}

/** The barrier edges of GeometryMsg.edges with their codes (EDGE_FLOW_BACK included), in its list order. */
export function badgeEdges(edges: GeometryEdges | null | undefined): BadgeEdge[] {
  if (!edges) return [];
  const out: BadgeEdge[] = [];
  for (const e of edges.list) {
    const code = (e.dir === 'R' ? edges.r : edges.d)[e.cell]!;
    if ((code & EDGE_CODE_MASK) !== EDGE_NONE) out.push({ cell: e.cell, dir: e.dir, code });
  }
  return out;
}

/** Run badges show from this zoom up (screen px per cell): halfway between the neighborhood and close presets. */
export const BADGE_CLOSE_ZOOM = (ZOOM_NEIGHBORHOOD + ZOOM_CLOSE) / 2;

/** Whether `zoom` is the 'close' preset band (where every run carries its badge). */
export function badgeZoomBand(zoom: number): 'close' | 'far' {
  return zoom >= BADGE_CLOSE_ZOOM ? 'close' : 'far';
}

/** One badge to draw: its anchor on the line, the run's direction and code, its pips, and whether it is the selected gate's. */
export interface WorldBadge {
  readonly at: readonly [number, number];
  readonly dir: 'R' | 'D';
  readonly code: number;
  readonly pips: readonly BadgePip[];
  readonly selected: boolean;
}

/**
 * The world layer's badges: at the 'close' band one per run (at its middle); at any zoom one for the selected
 * gate (`selectedKey`, barriers.ts edgeKey(cell, dir)) at that edge's own middle, marked selected (a run that
 * contains the selected edge is not drawn twice: the selected badge replaces its run's badge).
 */
export function worldBadges(edges: GeometryEdges | null | undefined, zoom: number, selectedKey: number | null): WorldBadge[] {
  const list = badgeEdges(edges);
  const sel = selectedKey === null ? null : (list.find((e) => edgeKey(e.cell, e.dir) === selectedKey) ?? null);
  const out: WorldBadge[] = [];
  if (badgeZoomBand(zoom) === 'close') {
    for (const r of runsOf(list)) {
      if (sel && r.dir === sel.dir && r.cells.includes(sel.cell)) continue;
      out.push({ at: r.mid, dir: r.dir, code: r.code, pips: worldPipsFor(r.code), selected: false });
    }
  }
  if (sel) {
    const cx = sel.cell % GRID_W;
    const cy = Math.floor(sel.cell / GRID_W);
    const at: [number, number] = sel.dir === 'R' ? [cx + 1, cy + 0.5] : [cx + 0.5, cy + 1];
    out.push({ at, dir: sel.dir, code: sel.code, pips: worldPipsFor(sel.code), selected: true });
  }
  return out;
}

/** Badge geometry in SCREEN pixels (the renderer divides by the zoom): pip radius, pip pitch, plate padding, offset from the line. */
export const BADGE_PX = { pipR: 3, pitch: 8, pad: 3, offset: 6 } as const;

/**
 * Where a badge's plate sits (world units) for `b` at `zoom`: beside its line, never on it — to the right of a
 * vertical ('R') edge, above a horizontal ('D') one. The pips run left to right in class order.
 */
export function badgeBox(b: Pick<WorldBadge, 'at' | 'dir'>, zoom: number): { x: number; y: number; w: number; h: number } {
  const px = 1 / Math.max(1e-6, zoom);
  const w = (BADGE_CLASSES.length * BADGE_PX.pitch + 2 * BADGE_PX.pad) * px;
  const h = (2 * BADGE_PX.pipR + 2 * BADGE_PX.pad + 2) * px;
  const off = BADGE_PX.offset * px;
  return b.dir === 'R' ? { x: b.at[0] + off, y: b.at[1] - h / 2, w, h } : { x: b.at[0] - w / 2, y: b.at[1] - off - h, w, h };
}

/** Whether a one-way pip should point backward (the flow runs toward the edge's own cell: EDGE_FLOW_BACK). */
export function pipPointsBack(code: number): boolean {
  return (code & EDGE_FLOW_BACK) !== 0;
}

const rgbInt = (c: readonly [number, number, number]): number => (c[0] << 16) | (c[1] << 8) | c[2];
/** Pip ink and plate colours (layers.ts DISH_COLORS badgePip / badgePlate; the contrast audit reads them there). */
export const BADGE_COLORS = {
  pip: rgbInt(DISH_COLORS.badgePip),
  plate: rgbInt(DISH_COLORS.badgePlate),
} as const;
