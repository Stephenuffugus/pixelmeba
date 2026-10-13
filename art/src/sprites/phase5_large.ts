/**
 * Phase 5 large consumers (UX §6.1–6.3, CT §1.3, P5.5/P5.7 art-large): P05 Shellglider, P06 Bellstalk,
 * P07 Dartfin, P09 Wheelgrazer (32×32) and P08 Waterbear, P10 Needlejaw (48×48, UX §6.2 "readable at
 * default zoom via selection magnification"). Each draws the UX §6.2 large set: 6 move, 4 feed,
 * 4 reproduction, 2 stress, 4 death frames per heading; P08 (native DORMANCY) adds `dormant`, three
 * still poses indexed by lifeState − 1 (ARCH §10.1 "dormancy prepare/rest/wake", SPEC §7.6, D-0106).
 * Silhouettes (UX §6.3), each accent (UX §6.1) only in the part it names:
 *   P05 scalloped disk with a front lobe: the shell is part of the body (boundMineral = 0.10 B0' from
 *       inoculation, SPEC §6.1, §7.11), so every frame carries it; the scallop colour is only its rim.
 *       The cream lobe pushing out of the aperture is the moving, feeding cytoplasm.
 *   P06 bell on a stalk (speed 0, attached; CT §1.3): the stalk and its foot are the only stalk-coloured
 *       pixels and are identical in every move frame — `move` is a bell contraction on a still stalk
 *       (the renderer loops `move` whenever a sprite has one), never locomotion.
 *   P07 teardrop with two tail pixels (exactly two, the tail colour, behind the tip). Its `move` cycle is
 *       quick (60 ms frames) and the tail whips and the body squashes, so 3.0 cells/s reads as fast without
 *       blur or streaks.
 *   P08 eight-leg silhouette (four visible pairs): leg-coloured pixels are only the eight stubby legs,
 *       four on each side; the gait shifts them in a wave. Dormant: curling (legs drawn in), the curled
 *       tun (no legs, a short wrinkled barrel), uncurling (stubs back).
 *   P09 round rotifer with a ciliary wheel: the wheel-coloured spokes are only in the crown disc on top
 *       and turn by 10° a frame; the body never sways (one heading: a still body never implies travel).
 *   P10 long body with a forked front: the fork colour is only the two prongs at the head (and, while it
 *       divides, the rear fragment's new prongs); `feed` closes the fork and a swallowed lump travels down
 *       the gut (a committed meal only: the renderer plays it on the recorded intake cue).
 * Authored facing East; tools/art-build.ts derives S, W and N for the 4-heading records (P07, P08, P10)
 * with orient(). P05, P06 and P09 have one heading. Feeding and reproduction frames show only the
 * committed event the renderer plays them for (UX §7.1).
 */
import { P } from '../palette';
import type { Px } from '../px';
import type { SpriteDef } from '../sprite';
import { anim, canvas, curve, deathFrames, O, stressFrames } from './kit';

/** Palette layout: 1 outline, 2 base, 3 deep, 4 accent (UX §6.1), 5 light, 6 stress, 7/8 remains, 9 gut / vacuole, 10 claw. */
const C = 2;
const D = 3;
const A = 4;
const L = 5;
const S = 6;
const R = 7;
const RD = 8;
const G = 9;
const K = 10;

const pal = (outline: string, base: string, deep: string, accent: string, light: string, stress: string, gut: string, claw: string = P.outlineDark): string[] => [
  '',
  outline,
  base,
  deep,
  accent,
  light,
  stress,
  P.remains,
  P.remainsDark,
  gut,
  claw,
];

const DEATH = [0.25, 0.5, 0.72, 0.9] as const;
const MOVE6 = [0, 1, 2, 3, 4, 5] as const;

// ------------------------------------------------------------------------------ P05 Shellglider
const shellPalette = pal(P.outlineDark, P.shellgliderCream, P.shellgliderDeep, P.shellgliderScallop, P.shellgliderLobe, '#B3B0A8', P.shellgliderVacuole);

const SHELL_GRAINS: readonly (readonly [number, number])[] = [
  [-4, -3],
  [2, -5],
  [-6, 2],
  [3, 3],
  [-1, 6],
  [5, -1],
  [-2, 0],
];

/** A scalloped shell disk (radius r, ten scallops) with its rim in the scallop colour. */
function shell(p: Px, cx: number, cy: number, r: number, grains = true): Px {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const edge = r + 0.75 * Math.cos(10 * Math.atan2(dy, dx));
      if (d > edge) continue;
      p.set(x, y, d > edge - 1.7 ? A : C);
    }
  }
  if (grains) for (const [gx, gy] of SHELL_GRAINS) p.tint(Math.floor(cx + gx * (r / 9.5)), Math.floor(cy + gy * (r / 9.5)), D);
  return p;
}

/** The cytoplasm lobe at the aperture (East of the shell), drawn over the rim there. */
function lobe(p: Px, cx: number, cy: number, rx: number, ry: number): Px {
  p.fillEllipse(cx, cy, rx, ry, C);
  // The lobe's own soft shade on its lower edge (only on lobe pixels outside the shell rim).
  for (let y = 0; y < p.h; y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) if (p.get(x, y) === C && p.get(x, y + 1) === 0 && x >= cx - 1) p.set(x, y, L);
  return p;
}

function shellglider(o: { lobeRx?: number; lobeRy?: number; lobeDy?: number; vacuole?: number } = {}): Px {
  const p = canvas(32);
  shell(p, 14, 16, 9.5);
  lobe(p, 24.2, 16 + (o.lobeDy ?? 0), o.lobeRx ?? 3, o.lobeRy ?? 3);
  // A food vacuole moving from the lobe into the shell (feeding only: after a committed meal).
  if (o.vacuole !== undefined) {
    const vx = [25, 21, 17, 13][o.vacuole]!;
    p.fillRect(vx, 15, 2, 2, G);
  }
  return p.outline(O);
}

/** Division: a cytoplasm bud grows from the aperture, builds its own scalloped rim, and parts. */
function shellRepro(k: number): Px {
  const p = canvas(32);
  if (k < 3) {
    shell(p, k === 2 ? 11.5 : 12.5, 16, k === 2 ? 8 : 8.5);
    if (k === 0) lobe(p, 23, 16, 5, 4.5);
    if (k === 1) lobe(p, 24, 16, 6.2, 5.6);
    if (k === 2) {
      // The bud has built its own scalloped rim; a thin cytoplasm bridge still joins it to the parent.
      p.fillRect(18, 15, 4, 2, C);
      shell(p, 25.5, 16, 5.2, false);
      p.tint(25, 16, D).tint(24, 14, D);
    }
    return p.outline(O);
  }
  shell(p, 8.2, 16, 6.3);
  shell(p, 23.8, 16, 6.3);
  return p.outline(O);
}

const shellBase = shellglider();

export const P05_SHELLGLIDER: SpriteDef = {
  assetId: 'p05_shellglider',
  speciesId: 'P05',
  size: 32,
  headings: 1,
  palette: shellPalette,
  animations: {
    // A slow glider (0.45 cells/s): only the lobe flows; the shell never moves within the frame.
    move: anim(MOVE6.map((k) => shellglider({ lobeRx: [2.6, 3.1, 3.6, 4.0, 3.6, 3.1][k]!, lobeRy: [3, 3, 3.2, 3.2, 3, 3][k]!, lobeDy: [0, 0, 0.5, 0.5, 0, -0.5][k]! })), 200, true),
    feed: anim([0, 1, 2, 3].map((k) => shellglider({ lobeRx: [4, 4.4, 3.6, 3][k]!, lobeRy: [4, 4.2, 3.6, 3][k]!, vacuole: k })), 160, false, 1),
    reproduction: anim([0, 1, 2, 3].map(shellRepro), 180, false, 3),
    stress: anim(stressFrames(shellBase, [C, L], S, D), 420, true),
    death: anim(deathFrames(shellBase, DEATH, R, RD, 311), 160, false, 3),
  },
  required: ['move', 'feed', 'reproduction', 'stress', 'death'],
};

// ------------------------------------------------------------------------------- P06 Bellstalk
const bellPalette = pal(P.outlineDark, P.bellstalkBlue, P.bellstalkDeep, P.bellstalkStalk, P.bellstalkLight, '#AEB4BA', P.bellstalkVacuole);

/** The stalk and its foot plate: identical in every frame that shows the attached bell. */
function stalk(p: Px): Px {
  for (let y = 19; y <= 28; y++) p.set(15, y, A).set(16, y, A);
  p.fillRect(13, 29, 6, 1, A);
  return p;
}

/** An inverted bell from its mouth row y0 down to y1, mouth half-width w at the top, centered on cx. */
function bell(p: Px, cx: number, y0: number, y1: number, w: number): Px {
  for (let y = Math.floor(y0); y <= y1; y++) {
    const t = (y1 - y) / (y1 - y0);
    const half = 1.6 + (w - 1.6) * Math.sqrt(Math.max(0, t));
    for (let x = 0; x < p.w; x++) if (Math.abs(x + 0.5 - cx) <= half) p.set(x, y, C);
  }
  // The peristome: the mouth's pale lip on the top row.
  for (let x = 0; x < p.w; x++) if (p.get(x, Math.floor(y0)) === C) p.set(x, Math.floor(y0), L);
  return p;
}

/** Cilia above the mouth: ticks that beat (phase) along the lip. */
function mouthCilia(p: Px, cx: number, y0: number, w: number, phase: number): Px {
  const top = Math.floor(y0) - 1;
  for (let x = Math.ceil(cx - w); x < cx + w; x++) if ((x + phase) % 3 === 0 && p.get(x, top) === 0) p.set(x, top, D);
  return p;
}

function bellstalk(o: { y0?: number; w?: number; phase?: number; particle?: number } = {}): Px {
  const p = canvas(32);
  const y0 = o.y0 ?? 6;
  const w = o.w ?? 7;
  stalk(p);
  bell(p, 16, y0, 18, w);
  p.shadeEdge([C], D, 1, 0);
  // Macronucleus: a curved band across the bell.
  for (const [x, y] of [[13, 12], [14, 13], [15, 13], [16, 13], [17, 13], [18, 12]] as const) p.tint(x, y, D);
  // A captured particle: at the mouth, then a vacuole sinking into the bell (feeding only).
  if (o.particle !== undefined) {
    const spots: readonly (readonly [number, number])[] = [[16, Math.floor(y0)], [16, Math.floor(y0) + 2], [15, 10], [14, 15]];
    const [px, py] = spots[o.particle]!;
    p.set(px, py, G).set(px + 1, py, G);
  }
  p.outline(O);
  return mouthCilia(p, 16, y0, w, o.phase ?? 0);
}

/** Division along the bell: a cleft, two bells on the stalk top, then the daughter swims free (no stalk). */
function bellRepro(k: number): Px {
  const p = canvas(32);
  stalk(p);
  if (k < 2) {
    bell(p, 16, 6, 18, 8);
    p.shadeEdge([C], D, 1, 0);
    const deep = k === 0 ? 3 : 7;
    for (let y = 6; y < 6 + deep; y++) p.set(15, y, k === 0 ? D : 0).set(16, y, k === 0 ? D : 0);
    return p.outline(O);
  }
  if (k === 2) {
    // Two bells on short branches of the stalk top (the branches are stalk).
    p.line(15, 18, 12, 16, A).line(16, 18, 19, 16, A);
    bell(p, 11, 7, 15, 3.6);
    bell(p, 21, 7, 15, 3.6);
    p.shadeEdge([C], D, 1, 0);
    return p.outline(O);
  }
  bell(p, 16, 8, 18, 6);
  // The free daughter (a telotroch): a small bell, no stalk, with its ring of cilia at the base.
  bell(p, 26, 3, 9, 3.6);
  p.shadeEdge([C], D, 1, 0);
  p.outline(O);
  for (const x of [24, 26, 28]) if (p.get(x, 11) === 0) p.set(x, 11, L);
  return p;
}

const bellBase = bellstalk();

export const P06_BELLSTALK: SpriteDef = {
  assetId: 'p06_bellstalk',
  speciesId: 'P06',
  size: 32,
  headings: 1,
  palette: bellPalette,
  animations: {
    // Speed 0 and attached (CT §1.3): the bell contracts toward the stalk and re-opens; the stalk is still.
    move: anim(MOVE6.map((k) => bellstalk({ y0: [6, 6, 7, 8, 7, 6][k]!, w: [7, 7, 6.4, 5.8, 6.4, 7][k]!, phase: k })), 170, true),
    feed: anim([0, 1, 2, 3].map((k) => bellstalk({ y0: 5, w: 8, phase: k, particle: k })), 150, false, 2),
    reproduction: anim([0, 1, 2, 3].map(bellRepro), 180, false, 3),
    stress: anim(stressFrames(bellBase, [C, L], S, D), 420, true),
    death: anim(deathFrames(bellBase, DEATH, R, RD, 313), 160, false, 3),
  },
  required: ['move', 'feed', 'reproduction', 'stress', 'death'],
};

// --------------------------------------------------------------------------------- P07 Dartfin
const dartPalette = pal(P.outlineDark, P.dartfinAqua, P.dartfinDeep, P.dartfinTail, P.dartfinLight, '#A2B2B5', P.dartfinDeep);

/** Two tail pixels behind the tip, whipping: offsets (dy of the near pixel, dy of the far pixel). */
const TAIL_WHIP: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -1],
  [-1, -2],
  [0, 0],
  [0, 1],
  [1, 2],
];

/** A teardrop: rounded head at hx, tapering West to the tip at tx; its two tail pixels behind the tip. */
function teardrop(p: Px, tx: number, hx: number, cy: number, o: { bend?: number; whip?: number; mouth?: number; vacuoles?: number; headR?: number } = {}): Px {
  const hr = o.headR ?? 4.2;
  const bend = o.bend ?? 0;
  p.fillStroke(curve([tx, cy + bend], [(tx + hx) / 2, cy - bend * 0.5], [hx, cy], 10), hr, C, (t) => 0.7 + (hr - 0.7) * Math.sin((Math.PI / 2) * t) ** 0.9);
  p.fillEllipse(hx, cy, hr, hr * 0.95, C);
  p.shadeEdge([C], D, 0, 1);
  p.tint(Math.floor(hx), Math.floor(cy) - 2, L).tint(Math.floor(hx) - 1, Math.floor(cy) - 2, L);
  for (let k = 0; k < (o.vacuoles ?? 0); k++) p.tint(Math.floor(hx) - 2 - k * 2, Math.floor(cy) + 1, G);
  const mouth = o.mouth ?? 0;
  for (let k = 0; k < mouth; k++) p.set(Math.ceil(hx + hr) - 1 - k, Math.floor(cy), 0);
  p.outline(O);
  // The tail pixels, outside the outline behind the tip (exactly two).
  const [a, b] = TAIL_WHIP[o.whip ?? 0]!;
  const tip = Math.round(cy + bend - 0.5);
  const tipX = Math.floor(tx) - 1;
  p.set(tipX - 1, tip + a, A).set(tipX - 2, tip + b, A);
  return p;
}

function dartfin(o: { tail?: number; bend?: number; whip?: number; mouth?: number; vacuoles?: number } = {}): Px {
  return teardrop(canvas(32), o.tail ?? 10, 20, 16, o);
}

function dartRepro(k: number): Px {
  if (k === 0) return teardrop(canvas(32), 8.5, 21, 16, { headR: 4.4 });
  if (k === 1) {
    const p = teardrop(canvas(32), 7, 22, 16, { headR: 4.2 });
    // A pale band where it will part.
    for (let y = 0; y < 32; y++) if (p.get(15, y) === C || p.get(15, y) === D) p.set(15, y, L);
    return p;
  }
  const p = canvas(32);
  const gap = k === 2 ? 0 : 1;
  teardrop(p, 4 - gap, 11.5 - gap, 16, { headR: 3.2 });
  const q = teardrop(canvas(32), 17 + gap, 24.5 + gap, 16, { headR: 3.2 });
  return p.stamp(q, 0, 0);
}

const dartBase = dartfin();

export const P07_DARTFIN: SpriteDef = {
  assetId: 'p07_dartfin',
  speciesId: 'P07',
  size: 32,
  headings: 4,
  palette: dartPalette,
  animations: {
    // Fast (3.0 cells/s): short frames, a whipping tail and a squash-and-stretch body; no blur, no streaks.
    move: anim(MOVE6.map((k) => dartfin({ tail: [10, 9, 10, 11, 10, 9][k]!, bend: [0, -0.8, -1.2, 0, 0.8, 1.2][k]!, whip: k })), 60, true),
    feed: anim([0, 1, 2, 3].map((k) => dartfin({ mouth: [1, 2, 1, 0][k]!, vacuoles: [0, 1, 2, 3][k]! })), 120, false, 2),
    reproduction: anim([0, 1, 2, 3].map(dartRepro), 140, false, 3),
    stress: anim(stressFrames(dartBase, [C, L], S, D), 420, true),
    death: anim(deathFrames(dartBase, DEATH, R, RD, 317), 140, false, 3),
  },
  required: ['move', 'feed', 'reproduction', 'stress', 'death'],
};

// ----------------------------------------------------------------------------- P09 Wheelgrazer
const wheelPalette = pal(P.outlineDark, P.wheelgrazerRose, P.wheelgrazerDeep, P.wheelgrazerWheel, P.wheelgrazerLight, '#B4A9AD', P.wheelgrazerGut);

/** The crown disc on top with its ciliary wheel: a pale wheel round a dark hub, six base-colour spokes every 60°, turned by `deg`. */
function crown(p: Px, cx: number, cy: number, r: number, deg: number, spokes = true): Px {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const a = ((Math.atan2(dy, dx) * 180) / Math.PI + 360 + deg) % 360;
      p.set(x, y, d <= 1.5 ? D : spokes && d >= 3 && a % 60 >= 20 ? A : C);
    }
  }
  return p;
}

function wheelgrazer(o: { deg?: number; gut?: number; particles?: number; egg?: number; laid?: boolean } = {}): Px {
  const p = canvas(32);
  // Round trunk with two short toes below.
  p.fillEllipse(16, 19.5, 8.2, 7.8, C);
  p.set(14, 27, C).set(14, 28, C).set(17, 27, C).set(17, 28, C);
  p.shadeEdge([C], D, 1, 1);
  // Mastax (the jaws) below the crown, and the gut.
  p.tint(15, 14, D).tint(16, 14, D).tint(15, 15, D).tint(16, 15, D);
  const gut = o.gut ?? 1;
  for (let k = 0; k < gut; k++) p.tint(15 + (k % 2), 19 + Math.floor(k / 2), G);
  if (o.egg) p.fillEllipse(20.5, 21.5, 0.9 + o.egg * 0.55, 0.8 + o.egg * 0.45, L);
  p.tint(11, 17, L).tint(12, 16, L);
  crown(p, 16, 9, 5.2, o.deg ?? 0);
  p.outline(O);
  // Food particles drawn down toward the wheel (feeding only).
  for (let k = 0; k < (o.particles ?? 0); k++) p.set([10, 22, 13][k]!, [2, 2, 1][k]!, G);
  if (o.laid) {
    const e = canvas(32);
    e.fillEllipse(26.5, 27.5, 2.4, 2, L);
    e.outline(O);
    p.stamp(e, 0, 0);
  }
  return p;
}

const wheelBase = wheelgrazer();

export const P09_WHEELGRAZER: SpriteDef = {
  assetId: 'p09_wheelgrazer',
  speciesId: 'P09',
  size: 32,
  headings: 1,
  palette: wheelPalette,
  animations: {
    // The wheel turns 10° a frame (six frames = two spokes: a seamless loop); the body never moves.
    move: anim(MOVE6.map((k) => wheelgrazer({ deg: k * 10 })), 110, true),
    feed: anim([0, 1, 2, 3].map((k) => wheelgrazer({ deg: k * 15, gut: k + 2, particles: 3 - k })), 130, false, 2),
    reproduction: anim([wheelgrazer({ egg: 1 }), wheelgrazer({ egg: 2 }), wheelgrazer({ egg: 3 }), wheelgrazer({ laid: true })], 170, false, 3),
    stress: anim(stressFrames(wheelgrazer({ deg: 0 }), [C, L], S, D), 420, true),
    death: anim(deathFrames(wheelBase, DEATH, R, RD, 331), 160, false, 3),
  },
  required: ['move', 'feed', 'reproduction', 'stress', 'death'],
};

// ------------------------------------------------------------------------------- P08 Waterbear
const bearPalette = pal(P.outlineDark, P.waterbearTan, P.waterbearDeep, P.waterbearLegs, P.waterbearLight, '#A7A39B', P.waterbearGut, P.waterbearClaw);

/** Leg columns of the four pairs (East-facing body, head at the East). */
const LEG_X = [12, 19, 26, 33] as const;

/**
 * The trunk: a plump rod from x0 to x1 at row 24 with radius r, four segment creases, two eyespots and
 * the mouth cone at the head. `legLen` 0 draws no legs.
 */
function waterbear(o: { x0?: number; x1?: number; r?: number; legLen?: number; step?: number; snout?: number; bulb?: number; gut?: number; eggs?: number; creases?: number } = {}): Px {
  const p = canvas(48);
  const x0 = o.x0 ?? 12;
  const x1 = o.x1 ?? 33;
  const r = o.r ?? 8.2;
  const legLen = o.legLen ?? 3;
  // Legs first (the trunk covers their roots): 3 px wide, legLen px beyond the trunk edge, claws at the tips.
  if (legLen > 0) {
    LEG_X.forEach((lx, k) => {
      for (const side of [-1, 1] as const) {
        const shift = o.step === undefined ? 0 : Math.round(Math.sin(((o.step + k * 1.5 + (side > 0 ? 3 : 0)) * Math.PI) / 3));
        const x = lx + shift;
        const edge = side < 0 ? Math.floor(24 - r) : Math.ceil(24 + r) - 1;
        for (let d = -1; d <= legLen; d++) for (let dx = -1; dx <= 1; dx++) p.set(x + dx, edge + side * d, A);
        const tip = edge + side * (legLen + 1);
        p.set(x - 1, tip, K).set(x + 1, tip, K);
      }
    });
  }
  p.fillRodH(x0, x1, 24, r, C);
  p.shadeEdge([C], D, 0, 1);
  // Segment creases.
  const creases = o.creases ?? 4;
  for (let k = 0; k < creases; k++) {
    const cx = Math.round(x0 + ((x1 - x0) * (k + 0.5)) / creases) - 1;
    for (let y = Math.ceil(24 - r + 3); y <= Math.floor(24 + r - 3); y++) if (y % 3 !== 0) p.tint(cx, y, D);
  }
  p.tint(Math.round(x1) - 1, 21, L).tint(Math.round(x1) - 2, 21, L);
  // Eyespots.
  p.tint(Math.round(x1) + 2, 21, K).tint(Math.round(x1) + 2, 27, K);
  // Pharynx bulb (pumping while it feeds) and gut contents (algae).
  if (o.bulb) p.fillEllipse(x1 - 1, 24, o.bulb, o.bulb, D);
  for (let k = 0; k < (o.gut ?? 0); k++) p.tint(x1 - 6 - k * 3, 24 + (k % 2), G);
  for (let k = 0; k < (o.eggs ?? 0); k++) p.tint(x0 + 2 + (k % 2) * 3, 22 + Math.floor(k / 2) * 3, L);
  p.outline(O);
  // Mouth cone (stylets out while it feeds).
  const snout = o.snout ?? 1;
  const hx = Math.ceil(x1 + r);
  for (let k = 0; k < snout; k++) p.set(hx + k, 24, L).set(hx + k, 23, k === 0 ? L : p.get(hx + k, 23));
  if (snout > 0) p.set(hx + snout, 24, O).set(hx + snout, 23, O);
  return p;
}

/** Laid eggs below the body after division (a short-lived pose: the newborn is placed by the simulation). */
function bearLaid(): Px {
  const p = waterbear({});
  const e = canvas(48);
  for (const [x, y] of [[7, 41], [11, 42], [9, 44]] as const) e.fillEllipse(x, y, 1.8, 1.6, L);
  e.outline(O);
  return p.stamp(e, 0, 0);
}

const bearBase = waterbear({ step: 0 });

export const P08_WATERBEAR: SpriteDef = {
  assetId: 'p08_waterbear',
  speciesId: 'P08',
  size: 48,
  headings: 4,
  palette: bearPalette,
  animations: {
    // A lumbering gait (0.35 cells/s): the legs step in a wave; the trunk keeps its place in the frame.
    move: anim(MOVE6.map((k) => waterbear({ step: k })), 190, true),
    feed: anim([0, 1, 2, 3].map((k) => waterbear({ snout: [2, 3, 3, 2][k]!, bulb: [1.4, 2.2, 1.4, 2.2][k]!, gut: k + 1 })), 170, false, 2),
    reproduction: anim([waterbear({ eggs: 2 }), waterbear({ eggs: 4 }), waterbear({ eggs: 4, r: 7.9 }), bearLaid()], 200, false, 3),
    stress: anim(stressFrames(bearBase, [C, L], S, D), 420, true),
    death: anim(deathFrames(bearBase, DEATH, R, RD, 337), 170, false, 3),
    // Still poses (no loop): frame index = lifeState − 1. Preparing curls (legs half drawn in, the body
    // shortening), Resting is the curled tun (no legs, a short wrinkled barrel), Waking uncurls.
    dormant: anim(
      [
        waterbear({ x0: 15, x1: 30, r: 8.6, legLen: 1, snout: 0 }),
        waterbear({ x0: 19, x1: 27, r: 9, legLen: 0, snout: 0, creases: 3 }),
        waterbear({ x0: 14, x1: 31, r: 8.4, legLen: 2, snout: 1 }),
      ],
      1000,
      false,
      1,
    ),
  },
  required: ['move', 'feed', 'reproduction', 'stress', 'death', 'dormant'],
};

// ------------------------------------------------------------------------------- P10 Needlejaw
const needlePalette = pal(P.outlineDark, P.needlejawBlue, P.needlejawDeep, P.needlejawFork, P.needlejawLight, '#8E949E', P.needlejawGut);

/** Path of the long body from tail (x0) to neck (x1): an undulation that fades toward the head. */
function needlePath(phase: number, x0: number, x1: number, amp: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let k = 0; k <= 30; k++) {
    const x = x0 + ((x1 - x0) * k) / 30;
    const fade = 1 - k / 30;
    pts.push([x, 24 + amp * fade * Math.sin((x / 30) * Math.PI * 2 - (phase * Math.PI) / 3)]);
  }
  return pts;
}

/** The two prongs of the fork from the head front; `close` (0–2) pulls the tips together. */
function fork(p: Px, hx: number, cy: number, close: number, len = 5.5): Px {
  const spread = 3.6 - close * 1.3;
  p.fillStroke([[hx, cy - 1.4], [hx + len, cy - spread]], 0.85, A);
  p.fillStroke([[hx, cy + 1.4], [hx + len, cy + spread]], 0.85, A);
  return p;
}

/** Draw one long body (no outline) into p: tail x0, neck x1, head and fork at the East end. */
function needleBody(p: Px, phase: number, o: { x0?: number; x1?: number; amp?: number; close?: number; lump?: number; forkLen?: number; thin?: number } = {}): Px {
  const x0 = o.x0 ?? 4;
  const x1 = o.x1 ?? 35;
  const thin = o.thin ?? 1;
  const pts = needlePath(phase, x0, x1, o.amp ?? 1.8);
  p.fillStroke(pts, 3.4 * thin, C, (t) => (1.1 + 2.3 * Math.min(1, t * 2.2)) * thin);
  // Head: a slightly broader snout at the East end, on line.
  p.fillEllipse(x1 + 1.5, 24, 3.4 * thin, 3.4 * thin, C);
  const lumpAt = (k: number): [number, number] => {
    const lx = [x1 - 3, x1 - 10, x1 - 17][k]!;
    return [lx, pts[Math.round(((lx - x0) / (x1 - x0)) * 30)]![1]];
  };
  // A swallowed meal travelling down the gut: a bulge.
  if (o.lump !== undefined) {
    const [lx, ly] = lumpAt(o.lump);
    p.fillEllipse(lx, ly, 3.2, 4.2, C);
  }
  p.shadeEdge([C], D, 0, 1);
  // A pale dorsal line and the gut.
  for (const [x, y] of pts) if (x > x0 + 4 && x < x1 - 1) p.tint(Math.round(x), Math.round(y) - 2, L);
  for (const [x, y] of pts) if (x > x0 + 6 && x < x1 - 2 && Math.round(x) % 2 === 0) p.tint(Math.round(x), Math.round(y), D);
  if (o.lump !== undefined) {
    const [lx, ly] = lumpAt(o.lump);
    p.fillEllipse(lx, ly, 1.6, 1.6, G);
  }
  return fork(p, x1 + 4 * thin, 24, o.close ?? 0, o.forkLen ?? 5.5);
}

function needlejaw(phase: number, o: { x0?: number; x1?: number; amp?: number; close?: number; lump?: number } = {}): Px {
  return needleBody(canvas(48), phase, o).outline(O);
}

/** Fission: the body lengthens and thins, parts, and the rear fragment grows its own short fork. */
function needleRepro(k: number): Px {
  if (k === 0) return needlejaw(0, { x0: 3, x1: 36, amp: 1.2 });
  if (k === 1) {
    const p = needleBody(canvas(48), 0, { x0: 2, x1: 36, amp: 1 });
    // The waist where it will part narrows.
    for (let y = 0; y < 48; y++) for (const x of [18, 19]) if (p.get(x, y) !== 0 && Math.abs(y + 0.5 - 24) > 1.5) p.set(x, y, 0);
    return p.outline(O);
  }
  const p = canvas(48);
  needleBody(p, 0, { x0: 22 + (k - 2), x1: 36, amp: 0.6 });
  needleBody(p, 0, { x0: 2, x1: 13 - (k - 2), amp: 0.6, forkLen: k === 2 ? 1.5 : 2.5, close: 1, thin: 0.85 });
  return p.outline(O);
}

const needleBase = needlejaw(0);

export const P10_NEEDLEJAW: SpriteDef = {
  assetId: 'p10_needlejaw',
  speciesId: 'P10',
  size: 48,
  headings: 4,
  palette: needlePalette,
  animations: {
    move: anim(MOVE6.map((k) => needlejaw(k)), 110, true),
    // A committed meal only (the renderer plays it on the recorded intake cue): the fork closes, then the
    // swallowed lump travels down the gut. The handling attempt before it is the handling_arc mark.
    feed: anim([0, 1, 2, 3].map((k) => needlejaw(0, { amp: 1, close: [2, 2, 1, 0][k]!, ...(k > 0 ? { lump: k - 1 } : {}) })), 160, false, 2),
    reproduction: anim([0, 1, 2, 3].map(needleRepro), 180, false, 3),
    stress: anim(stressFrames(needleBase, [C, L], S, D), 420, true),
    death: anim(deathFrames(needleBase, DEATH, R, RD, 347), 170, false, 3),
  },
  required: ['move', 'feed', 'reproduction', 'stress', 'death'],
};
