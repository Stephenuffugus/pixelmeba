/**
 * The gate preview tracer (P5.2 "gate preview tracer (paused, no sim)"; SPEC §4.9 last line; g5-briefs S6;
 * D-0119). COSMETIC ONLY: for the selected edge's current barrier code, seven tokens — one per CT §5.3
 * transport class (Dissolved, Activity, Viral, Small, Medium, Large, Fixed) — approach the edge from both
 * sides (14 tokens). A token whose class the edge lets through (barriers.ts edgePermits; the three field
 * classes cross with a trail density equal to edgeFactor) crosses to the far side; a blocked one turns back
 * just before the edge and never reaches the far side. The Fixed token never moves at all (D-0120: fixed
 * things do not travel, even where the edge would let them through). An S04 channel shows only its directed transfer:
 * the pool tokens it moves (Dissolved, Viral; never Activity) and Small cross in the flow direction from
 * the upstream side, and nothing crosses back (D-0106).
 *
 * Positions are a pure function of (code, token index, elapsed ms), with phase offsets from layers.ts
 * `cosmetic(i, salt)`: no simulation randomness (this file never imports src/sim/rng.ts), no world read
 * beyond the edge code, no command. The renderer (renderer.ts setGatePreview) animates it only while the
 * dish is paused and draws nothing at any other speed. Reduced motion: a static frame, every token at its
 * end position (crossed tokens on the far side, blocked ones back at their start).
 */
import { EDGE_CHANNEL, edgeFactor, edgePermits, type TransportClass } from '@sim/barriers';
import { EDGE_FLOW_BACK } from '@worker/protocol';
import { cosmetic } from './layers';
import { EDGE_CODE_MASK, edgeSegment } from './structureLayer';

/** Token classes in token order (index % 7). */
export const TRACER_CLASSES: readonly TransportClass[] = ['dissolved', 'activity', 'viral', 'small', 'medium', 'large', 'fixed'];
/** 7 classes × 2 sides: tokens 0–6 start on the edge's own cell side, 7–13 on the neighbour's. */
export const TRACER_TOKENS = 14;
/** One approach-and-cross (or approach-and-return) cycle. */
export const TRACER_PERIOD_MS = 3200;
/** How far from the edge a token starts and ends (cells). */
export const TRACER_REACH = 0.85;
/** A blocked token turns back this far before the edge (cells), so it never touches the far side. */
export const TRACER_TURN_GAP = 0.08;

export interface TracerToken {
  readonly index: number;
  readonly cls: TransportClass;
  /** −1: started on the edge's own cell (edge.cell) side; +1: on the neighbour's side. */
  readonly side: -1 | 1;
  /** Whether this token crosses the edge. */
  readonly crosses: boolean;
  /** Field classes: the trail density (edgeFactor; 1 for a channel's directed transfer); organisms 0. */
  readonly trail: number;
  /** 0–1 along the edge. */
  readonly along: number;
  /** Signed distance from the edge (cells): < 0 on the edge's own cell side, > 0 on the neighbour's. */
  readonly across: number;
}

/** Whether a token of class `cls` starting on `side` crosses an edge with GeometryMsg `code` (EDGE_FLOW_BACK included). */
export function tracerCrosses(code: number, cls: TransportClass, side: -1 | 1): { crosses: boolean; trail: number } {
  if (cls === 'fixed') return { crosses: false, trail: 0 }; // fixed things never move (D-0120)
  const base = code & EDGE_CODE_MASK;
  const field = cls === 'dissolved' || cls === 'activity' || cls === 'viral';
  if (base === EDGE_CHANNEL) {
    // The channel's directed transfer only: from the upstream side (flow +1: edge.cell's side, −1).
    const upstream: -1 | 1 = (code & EDGE_FLOW_BACK) !== 0 ? 1 : -1;
    const moved = cls === 'dissolved' || cls === 'viral' || cls === 'small';
    const crosses = side === upstream && moved;
    return { crosses, trail: crosses && field ? 1 : 0 };
  }
  const crosses = edgePermits(base, cls);
  return { crosses, trail: crosses && field ? edgeFactor(base, cls) : 0 };
}

/** One token at `ms` milliseconds into the preview (pure). `reduced`: the static end frame. */
export function tracerToken(code: number, index: number, ms: number, reduced = false): TracerToken {
  const cls = TRACER_CLASSES[index % TRACER_CLASSES.length]!;
  const side: -1 | 1 = index < TRACER_CLASSES.length ? -1 : 1;
  const { crosses, trail } = tracerCrosses(code, cls, side);
  const k = index % TRACER_CLASSES.length;
  // Lanes along the edge, one per class, the two sides offset so they do not overlap; a small cosmetic jitter.
  const along = 0.1 + (0.8 * (k + (side === 1 ? 0.5 : 0))) / TRACER_CLASSES.length + (cosmetic(index, 41) - 0.5) * 0.02;
  const p = reduced ? 1 : (((ms / TRACER_PERIOD_MS + cosmetic(index, 37)) % 1) + 1) % 1;
  let across: number;
  if (cls === 'fixed') {
    across = side * TRACER_REACH; // stays where it starts
  } else if (p <= 0.5) {
    // Approach: from the start side to the edge (a blocked token stops TRACER_TURN_GAP short of it).
    const stop = crosses ? 0 : TRACER_TURN_GAP;
    across = side * (stop + (TRACER_REACH - stop) * (1 - 2 * p));
  } else if (crosses) {
    across = -side * TRACER_REACH * (2 * p - 1);
  } else {
    across = side * (TRACER_TURN_GAP + (TRACER_REACH - TRACER_TURN_GAP) * (2 * p - 1));
  }
  return { index, cls, side, crosses, trail, along, across };
}

/** Every token of one frame. */
export function tracerFrame(code: number, ms: number, reduced = false): TracerToken[] {
  const out: TracerToken[] = [];
  for (let i = 0; i < TRACER_TOKENS; i++) out.push(tracerToken(code, i, ms, reduced));
  return out;
}

/** A token's position in world units for the edge (cell, dir): along the shared edge, across its normal (+x for 'R', +y for 'D'). */
export function tracerPoint(t: Pick<TracerToken, 'along' | 'across'>, cell: number, dir: 'R' | 'D'): [number, number] {
  const [x1, y1, x2, y2] = edgeSegment(cell, dir);
  const x = x1 + (x2 - x1) * t.along + (dir === 'R' ? t.across : 0);
  const y = y1 + (y2 - y1) * t.along + (dir === 'D' ? t.across : 0);
  return [x, y];
}

/**
 * What the renderer draws for the tracer this frame: nothing (null) unless a selection is set and the
 * dish is paused (`speed === 0`); else the frame's tokens. The one gate the renderer path goes through.
 */
export function tracerDrawList(sel: { readonly cell: number; readonly dir: 'R' | 'D' } | null, speed: number, code: number, ms: number, reduced: boolean): TracerToken[] | null {
  if (sel === null || speed !== 0) return null;
  return tracerFrame(code, ms, reduced);
}
