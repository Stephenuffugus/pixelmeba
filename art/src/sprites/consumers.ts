/**
 * Phase 3 large consumers (32×32, 4 headings; UX §6.1–6.3, CT §1.3): P02 Ciliate, P03 Rotifer,
 * P04 Siltworm. Authored facing East; tools/art-build.ts derives S, W and N with orient().
 *   P02 slender cyan body with short white cilia beating in a wave and a dark oral groove ·
 *   P03 peach vase-shaped body on a forked foot with a two-lobed feeding crown at the front ·
 *   P04 long brown segmented worm with a pale head, undulating.
 * Each needs 6 move, 4 feed, 4 reproduction, 2 stress and 4 death frames (UX §6.2).
 */
import { P } from '../palette';
import type { Px } from '../px';
import type { SpriteDef } from '../sprite';
import { anim, canvas, curve, deathFrames, O, stressFrames } from './kit';

const C = 2;
const D = 3;
const A = 4; // accent (cilia / crown / head)
const L = 5;
const S = 6;
const R = 7;
const RD = 8;
const G = 9; // groove / gut / ring

// ---------------------------------------------------------------------------------- P02 Ciliate
const ciliatePalette = ['', P.outlineSoft, P.ciliateCyan, P.ciliateDeep, P.ciliateCilia, P.highlight, '#A9B4B7', P.remains, P.remainsDark, P.ciliateGroove];

/** Short cilia: one pixel outside the outline wherever the beat pattern says so. */
function cilia(p: Px, phase: number, every = 3): Px {
  const src = p.clone();
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      if (src.get(x, y) !== 0) continue;
      const nearOutline = src.get(x + 1, y) === O || src.get(x - 1, y) === O || src.get(x, y + 1) === O || src.get(x, y - 1) === O;
      if (nearOutline && (x + phase) % every === 0) p.set(x, y, A);
    }
  }
  return p;
}

function ciliateBody(opts: { wave?: number; len?: number; pinch?: boolean; groove?: number; vacuoles?: number } = {}): Px {
  const p = canvas(32);
  const w = opts.wave ?? 0;
  const len = opts.len ?? 0;
  const pts = curve([5 - len, 16 + w * 0.5], [16, 16 - w], [26 + len * 0.3, 15.5 + w * 0.5], 20);
  p.fillStroke(pts, 4.6, C, (t) => 2 + 3 * Math.sin(Math.PI * Math.min(1, t * 1.08)) ** 0.7);
  if (opts.pinch) for (let y = 0; y < 32; y++) p.set(15, y, 0).set(16, y, 0);
  p.shadeEdge([C], D, 1, 1);
  // Oral groove: a dark diagonal from the front top toward the middle.
  const g = opts.groove ?? 0;
  for (let k = 0; k < 5 + g; k++) p.tint(23 - k, 14 + Math.floor(k / 2), G);
  // Macronucleus.
  for (const [x, y] of [[13, 16], [14, 16], [15, 16], [14, 17], [15, 17]] as const) p.tint(x - (opts.pinch ? 5 : 0), y, D);
  if (opts.pinch) for (const [x, y] of [[20, 16], [21, 16], [21, 17]] as const) p.tint(x, y, D);
  // Food vacuoles (feeding only).
  for (let k = 0; k < (opts.vacuoles ?? 0); k++) p.tint(18 - k * 3, 18, G);
  p.tint(9, 14, L).tint(10, 13, L);
  return p.outline(O);
}

const ciliateMove = [0, 1, 2, 3, 4, 5].map((k) => cilia(ciliateBody({ wave: [0, 0.5, 1, 0.5, 0, -0.5][k]! }), k));
const ciliateFeed = [0, 1, 2, 3].map((k) => cilia(ciliateBody({ groove: [1, 2, 2, 1][k]!, vacuoles: [0, 1, 2, 3][k]! }), k * 2));
const ciliateRepro = [
  cilia(ciliateBody({ len: 1 }), 0),
  cilia(ciliateBody({ len: 2 }), 1),
  cilia(ciliateBody({ len: 2, pinch: true }), 2),
  (() => {
    const p = canvas(32);
    p.fillStroke(curve([3, 16], [7.5, 15.5], [12, 16], 8), 3.4, C, (t) => 1.8 + 2 * Math.sin(Math.PI * t) ** 0.7);
    p.fillStroke(curve([19, 16], [23.5, 15.5], [28, 16], 8), 3.4, C, (t) => 1.8 + 2 * Math.sin(Math.PI * t) ** 0.7);
    p.shadeEdge([C], D, 1, 1);
    for (const x of [7, 8, 23, 24]) p.tint(x, 16, D);
    p.tint(11, 15, G).tint(27, 15, G);
    return cilia(p.outline(O), 0);
  })(),
];
const ciliateBase = cilia(ciliateBody(), 0);

export const P02_CILIATE: SpriteDef = {
  assetId: 'p02_ciliate',
  speciesId: 'P02',
  size: 32,
  headings: 4,
  palette: ciliatePalette,
  animations: {
    move: anim(ciliateMove, 90, true),
    feed: anim(ciliateFeed, 140, false, 2),
    reproduction: anim(ciliateRepro, 140, false, 3),
    stress: anim(stressFrames(cilia(ciliateBody(), 0, 6), [C, A], S, D, 2), 420, true),
    death: anim(deathFrames(ciliateBase, [0.25, 0.5, 0.72, 0.9], R, RD, 83), 160, false, 3),
  },
  required: ['move', 'feed', 'reproduction', 'stress', 'death'],
};

// ---------------------------------------------------------------------------------- P03 Rotifer
const rotiferPalette = ['', P.outlineDark, P.rotiferPeach, P.rotiferDeep, P.rotiferCrown, P.highlight, '#B9B2AD', P.remains, P.remainsDark, P.rotiferGut];

function rotifer(opts: { sway?: number; spread?: number; beat?: number; gut?: number; egg?: number; laid?: boolean } = {}): Px {
  const p = canvas(32);
  const sw = opts.sway ?? 0;
  // Trunk: narrow foot at the West, widest behind the crown.
  p.fillStroke(curve([6, 16 + sw], [14, 16 - sw], [23, 16], 16), 4.6, C, (t) => 1.3 + 3.6 * Math.sin((Math.PI / 2) * Math.min(1, t * 1.25)));
  // Forked toes.
  p.set(4, 15 + sw, C).set(4, 17 + sw, C).set(5, 15 + sw, C).set(5, 17 + sw, C);
  // Crown: two round lobes at the front.
  const s = opts.spread ?? 0;
  p.fillEllipse(25.2, 12 - s, 3.3, 3, A);
  p.fillEllipse(25.2, 20 + s, 3.3, 3, A);
  p.fillRect(22, 14 - s, 4, 4 + 2 * s, C);
  p.shadeEdge([C], D, 1, 1);
  // Gut.
  const gut = opts.gut ?? 0;
  for (const [x, y] of [[15, 16], [16, 16], [17, 16], [16, 17], [17, 15]] as const) p.tint(x, y, G);
  for (let k = 0; k < gut; k++) p.tint(18 + k, 16 + (k % 2), G);
  // Egg.
  if (opts.egg && !opts.laid) {
    p.fillEllipse(12, 18.2, 1.2 + opts.egg * 0.5, 1 + opts.egg * 0.4, L);
  }
  p.tint(12, 13 + sw, L);
  p.outline(O);
  // Crown cilia: short ticks in front of the lobes, rotating with the beat (the wheel).
  const beat = opts.beat ?? 0;
  for (const [cy, dir] of [[12 - s, -1], [20 + s, 1]] as const) {
    for (let k = 0; k < 3; k++) {
      const yy = Math.round(cy) + dir * ((k + beat) % 3) - dir;
      const xx = 29 - Math.abs(Math.round(cy) - yy);
      if (p.get(xx, yy) === 0) p.set(xx, yy, A);
    }
  }
  if (opts.laid) {
    // A laid egg resting behind the foot.
    const e = canvas(32);
    e.fillEllipse(2.6, 23, 2.2, 1.8, L);
    e.outline(O);
    p.stamp(e, 0, 0);
  }
  return p;
}

export const P03_ROTIFER: SpriteDef = {
  assetId: 'p03_rotifer',
  speciesId: 'P03',
  size: 32,
  headings: 4,
  palette: rotiferPalette,
  animations: {
    move: anim([0, 1, 2, 3, 4, 5].map((k) => rotifer({ sway: [0, 1, 1, 0, -1, -1][k]!, beat: k % 3 })), 140, true),
    feed: anim([0, 1, 2, 3].map((k) => rotifer({ spread: [1, 2, 2, 1][k]!, beat: k % 3, gut: k + 1 })), 150, false, 2),
    reproduction: anim([rotifer({ egg: 1 }), rotifer({ egg: 2 }), rotifer({ egg: 3 }), rotifer({ laid: true })], 160, false, 3),
    stress: anim(stressFrames(rotifer(), [C, A], S, D, 2), 420, true),
    death: anim(deathFrames(rotifer(), [0.25, 0.5, 0.72, 0.9], R, RD, 89), 160, false, 3),
  },
  required: ['move', 'feed', 'reproduction', 'stress', 'death'],
};

// --------------------------------------------------------------------------------- P04 Siltworm
const siltPalette = ['', P.outlineDark, P.siltBrown, P.siltDeep, P.siltHead, P.highlight, '#9F9891', P.remains, P.remainsDark, P.siltRing];

function wormPath(phase: number, x0: number, x1: number, amp: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let k = 0; k <= 24; k++) {
    const x = x0 + ((x1 - x0) * k) / 24;
    // Amplitude fades toward the head, so the head stays on line.
    const fade = 1 - k / 30;
    pts.push([x, 16 + amp * fade * Math.sin((x / 26) * Math.PI * 2 * 1.2 - (phase * Math.PI) / 3)]);
  }
  return pts;
}

function worm(phase: number, opts: { x0?: number; x1?: number; amp?: number; mouth?: number; split?: boolean } = {}): Px {
  const p = canvas(32);
  const x0 = opts.x0 ?? 3.5;
  const x1 = opts.x1 ?? 25;
  const pts = wormPath(phase, x0, x1, opts.amp ?? 2);
  p.fillStroke(pts, 2.5, C, (t) => 1.6 + 1.1 * Math.min(1, t * 4));
  // Segment rings every 3 columns behind the head.
  for (let y = 0; y < 32; y++) for (let x = 0; x < Math.floor(x1) - 2; x++) if (p.get(x, y) === C && x % 3 === 0) p.set(x, y, G);
  if (opts.split) for (let y = 0; y < 32; y++) p.set(14, y, 0).set(15, y, 0);
  p.shadeEdge([C, G], D, 0, 1);
  // Pale head: a rounded cap at the East end.
  const hy = pts[pts.length - 1]![1];
  p.fillEllipse(x1 + 1.6, hy, 3, 2.7, A);
  const mouth = opts.mouth ?? 0;
  if (mouth > 0) for (let k = 0; k < mouth; k++) p.set(Math.round(x1 + 4.2) - k, Math.round(hy - 0.5), 0);
  p.tint(Math.round(x1 + 1), Math.round(hy) - 1, L);
  if (opts.split) {
    // The rear fragment grows its own pale head.
    const rhy = pts[Math.floor((24 * (13 - x0)) / (x1 - x0))]![1];
    p.fillEllipse(12.4, rhy, 2.2, 2.2, A);
  }
  return p.outline(O);
}

export const P04_SILTWORM: SpriteDef = {
  assetId: 'p04_siltworm',
  speciesId: 'P04',
  size: 32,
  headings: 4,
  palette: siltPalette,
  animations: {
    move: anim([0, 1, 2, 3, 4, 5].map((k) => worm(k)), 130, true),
    feed: anim([1, 2, 3, 1].map((m, k) => worm(k % 2, { amp: 1.4, mouth: m })), 150, false, 2),
    reproduction: anim([worm(0, { x0: 2.5, x1: 26 }), worm(0, { x0: 2, x1: 26.5, amp: 1.2 }), worm(0, { x0: 2, x1: 26.5, amp: 1.2, split: true }), worm(0, { x0: 1, x1: 27, amp: 1.2, split: true })], 160, false, 3),
    stress: anim(stressFrames(worm(0), [C, G], S, D, 2), 420, true),
    death: anim(deathFrames(worm(0), [0.25, 0.5, 0.72, 0.9], R, RD, 97), 160, false, 3),
  },
  required: ['move', 'feed', 'reproduction', 'stress', 'death'],
};
