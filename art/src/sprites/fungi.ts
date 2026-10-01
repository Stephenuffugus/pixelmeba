/**
 * Fungal segment tiles (ARCH §10.1, UX §6.2–6.3): F01 Threadlace and F02 Cordweaver.
 *
 * A fungus is drawn one segment per tile, never as one rotating body, so each species has
 * `headings: 1` and these frame sets instead of the organism animations:
 *
 *   mask/e/<m>      16 connection-mask tiles, m = 0…15. Bit order N = 1, E = 2, S = 4, W = 8:
 *                   bit set ⇔ a thread leaves the tile through that edge. Arms run from the tile
 *                   center to the middle of that edge (core rows/columns 7–8 for F01, 6–9 for F02),
 *                   so tiles placed edge to edge at the frame size join seamlessly. m = 0 is a lone
 *                   segment (a small knot).
 *   decaying/e/<m>  the same 16 masks for a dying segment (remains colours, broken up). Draw it in
 *                   place of mask/e/<m>; the connections stay visible while the links exist.
 *   tip/e/0         growing-tip overlay: drawn over the segment's mask tile at the same position
 *                   (centered; it caps the thread end at the tile center). F01's tips are orange;
 *                   F02's are a light-copper cap with a dark outline, never the pulse colour, so a
 *                   growing end cannot be mistaken for a transfer (CLAUDE.md "every visible feature
 *                   maps to real state"; UX §6.1 reserves #F6D7B0 for F02's pulse).
 *   bud/e/0         branch-bud overlay: a round swelling at the tile center, drawn over the tile.
 *   pulse/e/0…1     F02 only: transfer pulse overlay at the tile center (UX §6.5 link pulse ≤ 1/s);
 *                   drawn only when a transfer happened (never as idle decoration). It is the only
 *                   F02 frame that uses the pulse colour (tests/content/silhouettes.test.ts).
 *   idle/e/0        one-frame thumbnail of a small branching patch, for UI lists (src/ui/atlas.ts
 *                   drawFrame falls back to `idle` when there is no `move`).
 *
 * Silhouette and value carry the pair in grayscale: F01 is a thin pale thread with a dark outline
 * and periodic septa; F02 is a thicker mid-value twisted cord.
 */
import { P } from '../palette';
import type { Px } from '../px';
import { MASK_E, MASK_N, MASK_S, MASK_W, type SpriteDef } from '../sprite';
import { anim, canvas, O } from './kit';

const C = 2; // thread core
const D = 3; // core shade / septum
const T = 4; // accent: F01 tip orange, F02 transfer pulse (pulse frames only)
const L = 5; // light
const R = 6; // remains
const RD = 7; // remains dark

/** Paint a tile's arms and center for mask `m`, with a core `lo..hi` (inclusive pixel rows/cols). */
function arms(m: number, lo: number, hi: number, c: number): Px {
  const p = canvas(16);
  // Center block.
  p.fillRect(lo, lo, hi - lo + 1, hi - lo + 1, c);
  if (m & MASK_N) p.fillRect(lo, 0, hi - lo + 1, hi + 1, c);
  if (m & MASK_S) p.fillRect(lo, lo, hi - lo + 1, 16 - lo, c);
  if (m & MASK_E) p.fillRect(lo, lo, 16 - lo, hi - lo + 1, c);
  if (m & MASK_W) p.fillRect(0, lo, hi + 1, hi - lo + 1, c);
  return p;
}

function remainsOf(tile: Px, salt: number): Px {
  const p = tile.clone();
  for (let i = 0; i < p.data.length; i++) {
    const v = p.data[i]!;
    if (v === 0) continue;
    p.data[i] = v === O ? RD : R;
  }
  return p.erode(0.2, salt);
}

// ------------------------------------------------------------------------------ F01 Threadlace
const lacePalette = ['', P.laceOutline, P.laceIvory, P.laceSeptum, P.laceTip, P.highlight, P.remains, P.remainsDark];

function laceTile(m: number): Px {
  const p = arms(m, 7, 8, C);
  if (m === 0) p.fillEllipse(8, 8, 2.1, 2.1, C);
  // Septa: a darker cross-wall pair on each arm, 4 px from the center.
  if (m & MASK_N) p.set(7, 3, D).set(8, 3, D);
  if (m & MASK_S) p.set(7, 12, D).set(8, 12, D);
  if (m & MASK_E) p.set(12, 7, D).set(12, 8, D);
  if (m & MASK_W) p.set(3, 7, D).set(3, 8, D);
  p.tint(7, 7, L);
  return p.outline(O);
}

const laceMasks = Array.from({ length: 16 }, (_, m) => laceTile(m));

/** Thumbnail: a small branching patch with orange tips (thin 1-px threads). */
function laceThumb(): Px {
  const p = canvas(16);
  p.line(2, 13, 7, 8, C).line(7, 8, 13, 3, C).line(7, 8, 7, 3, C).line(7, 8, 12, 11, C).line(4, 11, 2, 7, C);
  p.outline(O);
  for (const [x, y] of [[13, 3], [7, 3], [12, 11], [2, 7], [2, 13]] as const) p.set(x, y, T);
  p.set(7, 8, L);
  return p;
}

function overlayTip(accent: number, light: number): Px {
  const p = canvas(16);
  p.fillEllipse(8, 8, 2.2, 2.2, accent);
  p.set(7, 7, light);
  return p.outline(O);
}

function overlayBud(body: number, light: number, r: number): Px {
  const p = canvas(16);
  p.fillEllipse(8, 8, r, r, body);
  p.shadeEdge([body], D, 1, 1);
  p.set(7, 6, light).set(6, 7, light);
  return p.outline(O);
}

export const F01_THREADLACE: SpriteDef = {
  assetId: 'f01_threadlace',
  speciesId: 'F01',
  size: 16,
  headings: 1,
  form: 'fungus',
  palette: lacePalette,
  animations: {
    mask: anim(laceMasks, 1000, false, 0),
    decaying: anim(
      laceMasks.map((t, m) => remainsOf(t, 101 + m)),
      1000,
      false,
      0,
    ),
    tip: anim([overlayTip(T, L)], 1000, false, 0),
    bud: anim([overlayBud(C, L, 3.1)], 1000, false, 0),
    idle: anim([laceThumb()], 1000, false, 0),
  },
  required: ['mask', 'decaying', 'tip', 'bud', 'idle'],
};

// ------------------------------------------------------------------------------ F02 Cordweaver
const cordPalette = ['', P.cordDeep, P.cordCopper, P.cordDeep, P.cordPulse, P.cordLight, P.remains, P.remainsDark];

function cordTile(m: number): Px {
  const p = arms(m, 6, 9, C);
  if (m === 0) p.fillEllipse(8, 8, 3, 3, C);
  // Twisted-cord pattern: light diagonal strands, continuous across tile edges (16 % 4 = 0).
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (p.get(x, y) === C && (x + y) % 4 === 0) p.set(x, y, L);
  return p.outline(O);
}

const cordMasks = Array.from({ length: 16 }, (_, m) => cordTile(m));

function cordThumb(): Px {
  const p = canvas(16);
  p.fillStroke([[1.5, 13.5], [7.5, 8.5], [14, 3]], 1.3, C);
  p.fillStroke([[7.5, 8.5], [13.5, 12.5]], 1.2, C);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (p.get(x, y) === C && (x + y) % 4 === 0) p.set(x, y, L);
  p.outline(O);
  // A light-copper growing tip on each free end (no pulse colour: a thumbnail shows no transfer).
  for (const [x, y] of [[14, 3], [13, 12]] as const) p.set(x, y, L);
  return p;
}

function cordPulse(k: number): Px {
  const p = canvas(16);
  if (k === 0) p.fillRect(7, 7, 2, 2, T);
  else {
    p.fillRect(6, 6, 4, 4, T);
    p.fillRect(7, 7, 2, 2, L);
  }
  return p;
}

export const F02_CORDWEAVER: SpriteDef = {
  assetId: 'f02_cordweaver',
  speciesId: 'F02',
  size: 16,
  headings: 1,
  form: 'fungus',
  palette: cordPalette,
  animations: {
    mask: anim(cordMasks, 1000, false, 0),
    decaying: anim(
      cordMasks.map((t, m) => remainsOf(t, 131 + m)),
      1000,
      false,
      0,
    ),
    tip: anim([overlayTip(L, C)], 1000, false, 0),
    bud: anim([overlayBud(C, L, 3.6)], 1000, false, 0),
    pulse: anim([cordPulse(0), cordPulse(1)], 250, false, 1),
    idle: anim([cordThumb()], 1000, false, 0),
  },
  required: ['mask', 'decaying', 'tip', 'bud', 'idle'],
};
