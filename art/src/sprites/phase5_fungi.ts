/**
 * Phase 5 fungal segment tiles (ARCH §10.1, UX §6.1–6.3; P5.7): F03 Traplace and F04 Sporeveil.
 * Same frame-set conventions as sprites/fungi.ts (one heading; `mask/e/<m>` with N = 1, E = 2, S = 4,
 * W = 8; `decaying/e/<m>`; `tip` and `bud` centred overlays; `idle` one-frame thumbnail), plus:
 *
 *   trap/e/0…2     F03 only (native TRAP): the recorded trap state, drawn over the trapping segment's
 *                  mask tile at its center like tip and bud — 0 Open (an open loop), 1 Holding (the
 *                  loop closed), 2 Cooldown (a slack, dimmer loop). The loop colour #6B4A12 (UX §6.1
 *                  "F03 … loop") appears only in Open and Holding: a loop is drawn only while the
 *                  segment really has a trap state (D-0046 "a colour belongs to the state it shows").
 *   dormant/e/0…2  F04 only (native DORMANCY, RESTING_DAUGHTER): what a resting F04 newborn shows
 *                  instead of a mask tile (it is unattached, unlinked and Small while resting; D-0106):
 *                  a lone ringed spore speck, 0 Preparing (the ring closing), 1 Resting (the ring
 *                  complete and thick), 2 Waking (the ring opening on one side). Still poses, frame =
 *                  lifeState − 1.
 *
 * Silhouettes (UX §6.3): F03 "looped threads" — an amber 2-px thread whose arms each carry a small
 * closed loop of thread (shape, not the trap colour); F04 "web with ringed specks" — a thin 1-px
 * silver thread, webbing strands between neighbouring arms, and a dark-ringed speck at every node.
 * Arms run from the tile center to the middle of each edge (rows/columns 7–8 for F03, 7 for F04),
 * so tiles placed edge to edge join seamlessly.
 */
import { P } from '../palette';
import type { Px } from '../px';
import { MASK_E, MASK_N, MASK_S, MASK_W, type SpriteDef } from '../sprite';
import { anim, canvas, O } from './kit';

/** Paint a tile's arms and center for mask `m`, with a core `lo..hi` (inclusive pixel rows/cols). */
function arms(m: number, lo: number, hi: number, c: number): Px {
  const p = canvas(16);
  p.fillRect(lo, lo, hi - lo + 1, hi - lo + 1, c);
  if (m & MASK_N) p.fillRect(lo, 0, hi - lo + 1, hi + 1, c);
  if (m & MASK_S) p.fillRect(lo, lo, hi - lo + 1, 16 - lo, c);
  if (m & MASK_E) p.fillRect(lo, lo, 16 - lo, hi - lo + 1, c);
  if (m & MASK_W) p.fillRect(0, lo, hi + 1, hi - lo + 1, c);
  return p;
}

/** A dying segment: remains colours (outline → remains dark), broken up deterministically. */
function remainsOf(tile: Px, salt: number, remains: number, remainsDark: number): Px {
  const p = tile.clone();
  for (let i = 0; i < p.data.length; i++) {
    const v = p.data[i]!;
    if (v === 0) continue;
    p.data[i] = v === O ? remainsDark : remains;
  }
  return p.erode(0.2, salt);
}

// ------------------------------------------------------------------------------- F03 Traplace
const TC = 2; // thread amber
const TD = 3; // shade
const TL = 4; // light
const TLOOP = 5; // trap loop colour (trap frames only)
const TSLACK = 6; // cooldown slack loop
const TR = 7; // remains
const TRD = 8; // remains dark

const traplacePalette = ['', P.traplaceOutline, P.traplaceAmber, '#9C6A1E', P.traplaceLight, P.traplaceLoop, P.traplaceSlack, P.remains, P.remainsDark];

/** A small closed thread loop (a 4×4 ring) straddling the arm, centred at (x, y) between pixels. */
function threadLoop(p: Px, x: number, y: number, vertical: boolean): void {
  // Ring pixels around a 2×2 hole; for a horizontal arm the ring stands above it, for a vertical arm
  // it stands to its left, so the loop reads as a side loop of thread, not as a knot.
  const ring: [number, number][] = [];
  for (let k = -1; k <= 2; k++) {
    ring.push([k, -1], [k, 2]);
  }
  ring.push([-1, 0], [-1, 1], [2, 0], [2, 1]);
  for (const [dx, dy] of ring) {
    if (vertical) p.set(x - 3 + dy, y + dx, TC);
    else p.set(x + dx, y - 3 + dy, TC);
  }
}

function traplaceTile(m: number): Px {
  const p = arms(m, 7, 8, TC);
  if (m === 0) p.fillEllipse(8, 8, 2.1, 2.1, TC);
  if (m & MASK_N) threadLoop(p, 7, 3, true);
  if (m & MASK_S) threadLoop(p, 7, 11, true);
  if (m & MASK_E) threadLoop(p, 11, 7, false);
  if (m & MASK_W) threadLoop(p, 3, 7, false);
  p.shadeEdge([TC], TD, 1, 1);
  p.tint(7, 7, TL);
  return p.outline(O);
}

const traplaceMasks = Array.from({ length: 16 }, (_, m) => traplaceTile(m));

function traplaceThumb(): Px {
  const p = canvas(16);
  p.line(2, 13, 7, 8, TC).line(7, 8, 13, 3, TC).line(7, 8, 12, 12, TC).line(7, 8, 7, 2, TC);
  // Two side loops of thread.
  for (const [x, y] of [[10, 4], [4, 9]] as const) {
    p.set(x, y - 1, TC).set(x + 1, y - 1, TC).set(x - 1, y, TC).set(x + 2, y, TC).set(x - 1, y + 1, TC).set(x + 2, y + 1, TC).set(x, y + 2, TC).set(x + 1, y + 2, TC);
  }
  p.outline(O);
  p.set(7, 8, TL);
  return p;
}

function tipOverlay(): Px {
  const p = canvas(16);
  p.fillEllipse(8, 8, 2.2, 2.2, TL);
  p.set(7, 7, TC);
  return p.outline(O);
}

function budOverlay(): Px {
  const p = canvas(16);
  p.fillEllipse(8, 8, 3.1, 3.1, TC);
  p.shadeEdge([TC], TD, 1, 1);
  p.set(7, 6, TL).set(6, 7, TL);
  return p.outline(O);
}

/** Trap overlays: 0 Open (a loop with a gap), 1 Holding (closed loop), 2 Cooldown (slack and dim). */
function trapOverlay(state: 0 | 1 | 2): Px {
  const p = canvas(16);
  if (state === 2) {
    // Slack: a wider, flattened loop, broken in two places, in the dim slack tone.
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const dx = (x + 0.5 - 8) / 5.0;
        const dy = (y + 0.5 - 8.6) / 3.2;
        const d = dx * dx + dy * dy;
        if (d <= 1 && d >= 0.55 && !(y < 7 && (x === 5 || x === 10))) p.set(x, y, TSLACK);
      }
    return p;
  }
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (d <= 4.4 && d >= 3.1) p.set(x, y, TLOOP);
    }
  if (state === 0) {
    // Open: a gap on the East side (the mouth of the loop).
    for (let y = 6; y <= 9; y++) for (let x = 10; x < 16; x++) p.set(x, y, 0);
  } else {
    // Holding: the loop drawn tight (one ring thicker) with a light glint on it.
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
        if (d < 3.1 && d >= 2.4) p.set(x, y, TLOOP);
      }
    p.set(6, 4, TL);
  }
  return p;
}

export const F03_TRAPLACE: SpriteDef = {
  assetId: 'f03_traplace',
  speciesId: 'F03',
  size: 16,
  headings: 1,
  form: 'fungus',
  palette: traplacePalette,
  animations: {
    mask: anim(traplaceMasks, 1000, false, 0),
    decaying: anim(
      traplaceMasks.map((t, m) => remainsOf(t, 301 + m, TR, TRD)),
      1000,
      false,
      0,
    ),
    tip: anim([tipOverlay()], 1000, false, 0),
    bud: anim([budOverlay()], 1000, false, 0),
    idle: anim([traplaceThumb()], 1000, false, 0),
    // Recorded trap state, not a loop: Open, Holding, Cooldown.
    trap: anim([trapOverlay(0), trapOverlay(1), trapOverlay(2)], 1000, false, 1),
  },
  required: ['mask', 'decaying', 'tip', 'bud', 'idle', 'trap'],
};

// ------------------------------------------------------------------------------ F04 Sporeveil
const SC = 2; // silver thread
const SD = 3; // shade
const SRING = 4; // speck ring
const SL = 5; // light
const SR = 6; // remains
const SRD = 7; // remains dark

// P5.8 polish (wave 15; D-0123 MINOR 5): the outline (index 1) is the ring ink #23272B, not the mid grey #5F666D, so
// the silver web reads on sediment too (the grey outline was 2.3:1 there, a real gap; the ink is >= 3:1 on water,
// gel and sediment). The frames' pixels (indices) are unchanged; only the outline's colour moved.
const sporeveilPalette = ['', P.sporeveilRing, P.sporeveilSilver, '#959BA2', P.sporeveilRing, P.sporeveilLight, P.remains, P.remainsDark];

/** A ringed speck: a dark ring round a light center at (x, y) (3×3, or 5×5 with a 3×3 core when big). */
function speck(p: Px, x: number, y: number, big = false): void {
  const r = big ? 2 : 1;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) p.set(x + dx, y + dy, Math.abs(dx) === r || Math.abs(dy) === r ? SRING : SC);
  p.set(x, y, SL);
}

function sporeveilTile(m: number): Px {
  const p = arms(m, 7, 7, SC);
  // Webbing: a thin strand between each pair of neighbouring arms, 4 px out along each.
  const has = (bit: number) => (m & bit) !== 0;
  if (has(MASK_N) && has(MASK_E)) p.line(7, 3, 11, 7, SC);
  if (has(MASK_E) && has(MASK_S)) p.line(11, 7, 7, 11, SC);
  if (has(MASK_S) && has(MASK_W)) p.line(7, 11, 3, 7, SC);
  if (has(MASK_W) && has(MASK_N)) p.line(3, 7, 7, 3, SC);
  p.outline(O);
  speck(p, 7, 7, m === 0);
  return p;
}

const sporeveilMasks = Array.from({ length: 16 }, (_, m) => sporeveilTile(m));

function sporeveilThumb(): Px {
  const p = canvas(16);
  p.line(2, 13, 7, 8, SC).line(7, 8, 13, 3, SC).line(7, 8, 13, 12, SC).line(7, 8, 7, 2, SC).line(7, 4, 10, 6, SC).line(4, 11, 10, 10, SC);
  p.outline(O);
  speck(p, 7, 8);
  speck(p, 12, 4);
  speck(p, 3, 12);
  return p;
}

function sporeTip(): Px {
  const p = canvas(16);
  p.fillEllipse(8, 8, 2.0, 2.0, SL);
  p.set(8, 8, SC);
  return p.outline(O);
}

function sporeBud(): Px {
  const p = canvas(16);
  p.fillEllipse(8, 8, 3.0, 3.0, SC);
  p.shadeEdge([SC], SD, 1, 1);
  p.set(7, 6, SL).set(6, 7, SL);
  return p.outline(O);
}

/** A lone resting spore: 0 Preparing (ring closing), 1 Resting (ring complete, thick), 2 Waking (ring opening). */
function sporeDormant(state: 0 | 1 | 2): Px {
  const p = canvas(16);
  p.fillEllipse(8, 8, 2.6, 2.6, SC);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      const ring = state === 1 ? d >= 1.6 && d <= 3.6 : d >= 2.2 && d <= 3.4;
      if (!ring) continue;
      // Preparing: the ring still open at the top; Waking: open on the East side.
      if (state === 0 && y <= 5 && x >= 7 && x <= 9) continue;
      if (state === 2 && x >= 10 && y >= 7 && y <= 8) continue;
      p.set(x, y, SRING);
    }
  p.set(7, 7, SL);
  return p.outline(O);
}

export const F04_SPOREVEIL: SpriteDef = {
  assetId: 'f04_sporeveil',
  speciesId: 'F04',
  size: 16,
  headings: 1,
  form: 'fungus',
  palette: sporeveilPalette,
  animations: {
    mask: anim(sporeveilMasks, 1000, false, 0),
    decaying: anim(
      sporeveilMasks.map((t, m) => remainsOf(t, 331 + m, SR, SRD)),
      1000,
      false,
      0,
    ),
    tip: anim([sporeTip()], 1000, false, 0),
    bud: anim([sporeBud()], 1000, false, 0),
    idle: anim([sporeveilThumb()], 1000, false, 0),
    // Still poses (no loop): frame index = lifeState − 1 (Preparing, Resting, Waking).
    dormant: anim([sporeDormant(0), sporeDormant(1), sporeDormant(2)], 1000, false, 1),
  },
  required: ['mask', 'decaying', 'tip', 'bud', 'idle', 'dormant'],
};
