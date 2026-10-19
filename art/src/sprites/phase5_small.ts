/**
 * Phase 5 small organisms (16×16; UX §6.1–6.3, CT §1.1/§1.3, P5.7): B09 Lantern, B10 Brinecoil,
 * B11 Sourbud, B12 Sleeper, B13 Rampart, A02 Glasswheel, A03 Shadeleaf, A04 Turnleaf, A05 Raftball,
 * X02 Threadrider and the V02 Lacephage glyph. Silhouettes (UX §6.3):
 *   B09 double bead with a tiny dim center (the lime glow is the glow_center layer, shown only while
 *   glowState = 1; D-0046 "a colour belongs to the state it shows") · B10 spiral (a helical rod) with
 *   a cream upper edge · B11 wedge (broad back, pointed front) with a dark bud on its back ·
 *   B12 oval with a central seam; its `dormant` poses are the seam closing (Preparing), the folded
 *   body (Resting) and the body unfolding (Waking) · B13 angular chain patches (square cells joined
 *   corner to edge) · A02 faceted disk (an octagon with facet lines) inside its clear rim: the shell it
 *   always carries (boundMineral > 0 from inoculation, SPEC §6.1, §7.11) · A03 crescent with a mint
 *   vein · A04 split spindle, both halves at mid value; which half brightens is the mode_half layer
 *   (metabolicMode), never the body · A05 rosette of cells round a hollow · X02 filled mauve diamond
 *   (X01 is a hollow gold outline: the pair differs in alpha, not only colour) · V02 lace glyph (a
 *   round lattice head with short fibres, no tail; V01 is head-and-tail).
 * Motile records (CT §1.3 speed > 0: B09, B10, B11, B12, A04, X02) loop `move`; non-motile ones
 * (B13, A02, A03, A05) loop `idle`, which moves interior pixels only (UX §7.1). Headings follow each
 * species record (B09–B12, A03, A04: 4, authored East; B13, A02, A05, X02: 1).
 * Motion only shows what the simulation does: no pose here implies speed, feeding or division the
 * body is not doing.
 */
import { P } from '../palette';
import type { Px } from '../px';
import type { SpriteDef } from '../sprite';
import { anim, canvas, deathFrames, O, stressFrames } from './kit';

/** Palette layout: 1 outline, 2 base, 3 deep, 4 accent, 5 light, 6 stress, 7/8 remains. */
const C = 2;
const D = 3;
const A = 4;
const L = 5;
const S = 6;
const R = 7;
const RD = 8;

const pal = (outline: string, base: string, deep: string, accent: string, light: string, stress: string): string[] => ['', outline, base, deep, accent, light, stress, P.remains, P.remainsDark];

const DEATH = [0.35, 0.65, 0.85] as const;

/** Fill a convex or concave polygon (pixel centers inside, even–odd rule). */
function fillPoly(p: Px, pts: readonly (readonly [number, number])[], c: number): Px {
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) p.set(x, y, c);
    }
  }
  return p;
}

/** Cut a vertical gap (columns x0..x1) through the body: the pinch before a split. */
function pinchAt(p: Px, x0: number, x1: number): Px {
  for (let y = 0; y < 16; y++) for (let x = x0; x <= x1; x++) p.set(x, y, 0);
  return p;
}

// ---------------------------------------------------------------------------------- B09 Lantern
// Two beads joined at a narrow waist; the waist is a tiny dim core (lanternCore). The lime glow is
// never in the body: glow_center's 'glow' frame draws it, only while the organism glows.
const lanternPalette = pal(P.outlineDark, P.lanternBlueGreen, P.lanternDeep, P.lanternCore, P.lanternLight, '#9BA8A6');

const LANTERN_GLINT: readonly (readonly [number, number])[] = [
  [3, 6],
  [5, 6],
  [10, 6],
  [12, 6],
];

function lantern(glint: number, len = 0, pinch = false): Px {
  const p = canvas(16);
  p.fillEllipse(4.8 - len * 0.5, 8, 2.6, 2.6, C);
  p.fillEllipse(11.2 + len * 0.5, 8, 2.6, 2.6, C);
  if (pinch) pinchAt(p, 7, 8);
  else p.fillRect(7, 7, 2, 2, A); // the waist: a tiny dim center joining the two beads
  p.shadeEdge([C], D, 1, 1);
  if (glint >= 0) {
    const [x, y] = LANTERN_GLINT[glint % 4]!;
    p.tint(x, y, L);
  }
  return p.outline(O);
}

function lanternDaughters(): Px {
  const p = canvas(16);
  for (const cx of [3.9, 12.1]) {
    p.fillEllipse(cx - 1.4, 8, 1.8, 1.8, C);
    p.fillEllipse(cx + 1.4, 8, 1.8, 1.8, C);
  }
  p.shadeEdge([C], D, 1, 1);
  p.tint(3, 8, A).tint(4, 8, A).tint(11, 8, A).tint(12, 8, A);
  return p.outline(O);
}

export const B09_LANTERN: SpriteDef = {
  assetId: 'b09_lantern',
  speciesId: 'B09',
  size: 16,
  headings: 4,
  palette: lanternPalette,
  animations: {
    move: anim([lantern(0), lantern(1), lantern(2), lantern(3)], 140, true),
    reproduction: anim([lantern(-1, 0.6), lantern(-1, 1.1), lantern(-1, 1.1, true), lanternDaughters()], 110, false, 3),
    stress: anim(stressFrames(lantern(-1), [C], S, D), 400, true),
    death: anim(deathFrames(lantern(-1), DEATH, R, RD, 211), 140, false, 2),
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};

// -------------------------------------------------------------------------------- B10 Brinecoil
// A helical rod (a spiral seen from the side) with a cream upper edge; the helix turns as it swims.
const coilPalette = pal(P.outlineDark, P.brinecoilRust, P.brinecoilDeep, P.brinecoilCream, P.highlight, '#A9A29E');

function coilPath(phase: number, x0: number, x1: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let k = 0; k <= 32; k++) {
    const t = k / 32;
    pts.push([x0 + (x1 - x0) * t, 8 + 2.2 * Math.sin(2 * Math.PI * (1.5 * t) + (phase * Math.PI) / 2)]);
  }
  return pts;
}

function creamEdge(p: Px): Px {
  const src = p.clone();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (src.get(x, y) === C && src.get(x, y - 1) === 0) p.set(x, y, A);
  return p;
}

function coil(phase: number, len = 0, pinch = false): Px {
  const p = canvas(16);
  p.fillStroke(coilPath(phase, 3.4 - len * 0.5, 12.6 + len * 0.5), 1.05, C);
  if (pinch) pinchAt(p, 7, 8);
  p.shadeEdge([C], D, 0, 1);
  creamEdge(p);
  return p.outline(O);
}

function coilDaughters(): Px {
  const p = canvas(16);
  for (const [a, b] of [
    [1.8, 6.2],
    [9.8, 14.2],
  ] as const) {
    const pts: [number, number][] = [];
    for (let k = 0; k <= 16; k++) pts.push([a + (b - a) * (k / 16), 8 + 1.8 * Math.sin(2 * Math.PI * (k / 16))]);
    p.fillStroke(pts, 1.1, C);
  }
  p.shadeEdge([C], D, 0, 1);
  creamEdge(p);
  return p.outline(O);
}

export const B10_BRINECOIL: SpriteDef = {
  assetId: 'b10_brinecoil',
  speciesId: 'B10',
  size: 16,
  headings: 4,
  palette: coilPalette,
  animations: {
    move: anim([coil(0), coil(1), coil(2), coil(3)], 120, true),
    reproduction: anim([coil(0, 0.6), coil(0, 1.2), coil(0, 1.2, true), coilDaughters()], 100, false, 3),
    stress: anim(stressFrames(coil(0), [C, A], S, D), 400, true),
    death: anim(deathFrames(coil(0), DEATH, R, RD, 223), 140, false, 2),
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};

// ---------------------------------------------------------------------------------- B11 Sourbud
// A wedge: broad flat back to the West, pointed front to the East, with a dark bud on its back.
const sourPalette = pal(P.outlineDark, P.sourbudRed, P.sourbudDeep, P.sourbudBud, P.sourbudLight, '#A39C9C');

const SOUR_GLINT: readonly (readonly [number, number])[] = [
  [6, 6],
  [8, 7],
  [10, 7],
  [8, 8],
];

function wedge(glint: number, grow = 0, pinch = false): Px {
  const p = canvas(16);
  const back = 4.4 - grow * 0.6;
  const tip = 13.4 + grow * 0.3;
  fillPoly(p, [
    [back, 4.2],
    [back + 2, 4.0],
    [tip, 7.6],
    [tip, 8.4],
    [back + 2, 12.0],
    [back, 11.8],
  ], C);
  if (pinch) pinchAt(p, 8, 8);
  p.shadeEdge([C], D, 1, 1);
  // Dark bud on the back, a little above the middle.
  p.fillEllipse(back - 0.6, 7.2, 1.6, 1.6, A);
  if (glint >= 0) {
    const [x, y] = SOUR_GLINT[glint % 4]!;
    p.tint(x, y, L);
  }
  return p.outline(O);
}

function wedgeDaughters(): Px {
  const p = canvas(16);
  fillPoly(p, [
    [2.4, 5.6],
    [7.0, 7.8],
    [7.0, 8.2],
    [2.4, 10.4],
  ], C);
  fillPoly(p, [
    [9.0, 5.6],
    [13.6, 7.8],
    [13.6, 8.2],
    [9.0, 10.4],
  ], C);
  p.shadeEdge([C], D, 1, 1);
  p.set(2, 7, A).set(2, 8, A).set(9, 7, A).set(9, 8, A);
  return p.outline(O);
}

export const B11_SOURBUD: SpriteDef = {
  assetId: 'b11_sourbud',
  speciesId: 'B11',
  size: 16,
  headings: 4,
  palette: sourPalette,
  animations: {
    move: anim([wedge(0), wedge(1), wedge(2), wedge(3)], 130, true),
    reproduction: anim([wedge(-1, 0.6), wedge(-1, 1.2), wedge(-1, 1.2, true), wedgeDaughters()], 100, false, 3),
    stress: anim(stressFrames(wedge(-1), [C], S, D), 400, true),
    death: anim(deathFrames(wedge(-1), DEATH, R, RD, 227), 140, false, 2),
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};

// ---------------------------------------------------------------------------------- B12 Sleeper
// An olive oval with a central seam across its middle. `dormant` holds three still poses, indexed by
// lifeState − 1: Preparing (the seam closes across the body and pinches it), Resting (folded at the
// seam: a short, deep body with fold tucks), Waking (half unfolded, the seam fading).
const sleeperPalette = pal(P.outlineDark, P.sleeperOlive, P.sleeperDeep, P.sleeperSeam, P.sleeperLight, '#A5A898');

const SLEEPER_GLINT: readonly (readonly [number, number])[] = [
  [4, 6],
  [6, 5],
  [10, 5],
  [12, 6],
];

function sleeper(glint: number, opts: { len?: number; pinch?: boolean; seam?: 'short' | 'full' | 'fading' | 'none'; rx?: number; ry?: number } = {}): Px {
  const p = canvas(16);
  const len = opts.len ?? 0;
  const rx = (opts.rx ?? 5.6) + len * 0.5;
  const ry = opts.ry ?? 3.8;
  p.fillEllipse(8, 8, rx, ry, C);
  if (opts.pinch) pinchAt(p, 7, 8);
  p.shadeEdge([C], D, 1, 1);
  const seam = opts.seam ?? 'short';
  const top = Math.ceil(8 - ry);
  const bottom = Math.floor(8 + ry) - 1;
  if (seam === 'short') for (let y = 6; y <= 9; y++) p.tint(8, y, A);
  if (seam === 'full') for (let y = top; y <= bottom; y++) p.tint(8, y, A);
  if (seam === 'fading') p.tint(8, 7, A).tint(8, 6, D).tint(8, 9, D);
  if (glint >= 0) {
    const [x, y] = SLEEPER_GLINT[glint % 4]!;
    p.tint(x, y, L);
  }
  return p.outline(O);
}

/** Preparing: the seam runs right across the body and nicks its outline top and bottom. */
function sleeperPreparing(): Px {
  const p = sleeper(-1, { seam: 'full' });
  p.set(8, 3, 0).set(8, 12, 0);
  return p;
}

/** Resting: folded at the seam — a short, deep body, the seam full, fold tucks at both ends of it. */
function sleeperResting(): Px {
  const p = canvas(16);
  p.fillEllipse(8, 8, 3.6, 4.8, C);
  p.shadeEdge([C], D, 1, 1);
  for (let y = 3; y <= 12; y++) p.tint(8, y, A);
  p.tint(7, 3, A).tint(9, 3, A).tint(7, 12, A).tint(9, 12, A);
  return p.outline(O);
}

/** Waking: halfway between the fold and the oval; the seam fades. */
function sleeperWaking(): Px {
  return sleeper(-1, { rx: 4.6, ry: 4.0, seam: 'fading' });
}

function sleeperDaughters(): Px {
  const p = canvas(16);
  p.fillEllipse(4.2, 8, 3.0, 2.4, C);
  p.fillEllipse(11.8, 8, 3.0, 2.4, C);
  p.shadeEdge([C], D, 1, 1);
  p.tint(4, 8, A).tint(11, 8, A);
  return p.outline(O);
}

export const B12_SLEEPER: SpriteDef = {
  assetId: 'b12_sleeper',
  speciesId: 'B12',
  size: 16,
  headings: 4,
  palette: sleeperPalette,
  animations: {
    move: anim([sleeper(0), sleeper(1), sleeper(2), sleeper(3)], 150, true),
    reproduction: anim([sleeper(-1, { len: 0.6 }), sleeper(-1, { len: 1.2 }), sleeper(-1, { len: 1.2, pinch: true, seam: 'none' }), sleeperDaughters()], 110, false, 3),
    stress: anim(stressFrames(sleeper(-1), [C], S, D), 420, true),
    death: anim(deathFrames(sleeper(-1), DEATH, R, RD, 229), 150, false, 2),
    // Still poses (no loop): frame index = lifeState − 1 (Preparing, Resting, Waking).
    dormant: anim([sleeperPreparing(), sleeperResting(), sleeperWaking()], 1000, false, 1),
  },
  required: ['move', 'reproduction', 'stress', 'death', 'dormant'],
};

// ---------------------------------------------------------------------------------- B13 Rampart
// Angular chain patches: square cells joined in a zig-zag chain. Non-motile: idle moves only the
// pale facet light from cell to cell.
const rampartPalette = pal(P.outlineDark, P.rampartBrick, P.rampartDeep, P.rampartLight, P.highlight, '#A29C9A');

const RAMPART_CELLS: readonly (readonly [number, number])[] = [
  [3, 4],
  [6, 7],
  [9, 4],
  [12, 7],
];

function rampart(light: number, cells: readonly (readonly [number, number])[] = RAMPART_CELLS, size = 3): Px {
  const p = canvas(16);
  for (const [x, y] of cells) p.fillRect(x - 1, y - 1, size, size, C);
  p.shadeEdge([C], D, 1, 1);
  cells.forEach(([x, y], k) => {
    p.tint(x - 1, y - 1, k === light ? L : A);
  });
  return p.outline(O);
}

export const B13_RAMPART: SpriteDef = {
  assetId: 'b13_rampart',
  speciesId: 'B13',
  size: 16,
  headings: 1,
  palette: rampartPalette,
  animations: {
    idle: anim([rampart(0), rampart(1), rampart(2), rampart(3)], 380, true),
    reproduction: anim(
      [
        rampart(-1, [...RAMPART_CELLS, [12, 10]]),
        rampart(-1, [...RAMPART_CELLS, [12, 10], [9, 11]]),
        rampart(-1, [
          [3, 4],
          [6, 7],
          [10, 5],
          [13, 8],
          [12, 11],
          [9, 12],
        ]),
        rampart(-1, [
          [2, 4],
          [5, 7],
          [11, 4],
          [14, 7],
          [13, 11],
          [10, 12],
        ]),
      ],
      130,
      false,
      3,
    ),
    stress: anim(stressFrames(rampart(-1), [C, A], S, D), 420, true),
    death: anim(deathFrames(rampart(-1), DEATH, R, RD, 233), 150, false, 2),
  },
  required: ['idle', 'reproduction', 'stress', 'death'],
};

// ------------------------------------------------------------------------------ A02 Glasswheel
// A gold octagon with facet lines, inside a clear rim (its shell; always present). Idle moves only a
// glint from facet to facet.
const glassPalette = pal(P.outlineDark, P.glasswheelGold, P.glasswheelDeep, P.glasswheelRim, P.highlight, '#B9B5A6');

const GLASS_GLINT: readonly (readonly [number, number])[] = [
  [6, 5],
  [10, 6],
  [9, 10],
  [5, 9],
];

function octagon(p: Px, cx: number, cy: number, r: number, c: number): Px {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const dx = Math.abs(x + 0.5 - cx);
      const dy = Math.abs(y + 0.5 - cy);
      if (dx <= r && dy <= r && dx + dy <= r * 1.42) p.set(x, y, c);
    }
  }
  return p;
}

/** The clear rim: every body pixel on the body's edge. */
function rim(p: Px, body: readonly number[], c: number): Px {
  const src = p.clone();
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!body.includes(src.get(x, y))) continue;
      if (!src.get(x + 1, y) || !src.get(x - 1, y) || !src.get(x, y + 1) || !src.get(x, y - 1)) p.set(x, y, c);
    }
  return p;
}

function glasswheel(glint: number, cx = 8, cy = 8, r = 5.6, facets = true): Px {
  const p = octagon(canvas(16), cx, cy, r, C);
  // Facet lines: an inner octagon edge and four spokes to the rim.
  const inner = octagon(canvas(16), cx, cy, r * 0.45, 1);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (inner.get(x, y) && (!inner.get(x + 1, y) || !inner.get(x - 1, y) || !inner.get(x, y + 1) || !inner.get(x, y - 1))) p.tint(x, y, D);
  if (facets) {
    const ix = Math.round(cx);
    const iy = Math.round(cy);
    p.tint(ix - 4, iy - 4, D).tint(ix - 3, iy - 3, D).tint(ix + 2, iy - 4, D).tint(ix + 1, iy - 3, D);
    p.tint(ix - 4, iy + 2, D).tint(ix - 3, iy + 1, D).tint(ix + 2, iy + 2, D).tint(ix + 1, iy + 1, D);
  }
  rim(p, [C, D], A);
  if (glint >= 0) {
    const [x, y] = GLASS_GLINT[glint % 4]!;
    p.tint(x, y, L);
  }
  return p.outline(O);
}

function glassDaughters(): Px {
  const p = octagon(canvas(16), 4.4, 8, 3.2, C);
  octagon(p, 11.6, 8, 3.2, C);
  rim(p, [C], A);
  p.tint(4, 8, D).tint(11, 8, D);
  return p.outline(O);
}

export const A02_GLASSWHEEL: SpriteDef = {
  assetId: 'a02_glasswheel',
  speciesId: 'A02',
  size: 16,
  headings: 1,
  palette: glassPalette,
  animations: {
    idle: anim([glasswheel(0), glasswheel(1), glasswheel(2), glasswheel(3)], 380, true),
    reproduction: anim(
      [
        glasswheel(-1, 8, 8, 5.9),
        (() => {
          // The disk splits along its middle: two half-shells, each keeping its rim.
          const p = glasswheel(-1, 8, 8, 5.9, false);
          for (let y = 0; y < 16; y++) p.tint(7, y, D).tint(8, y, D);
          return p;
        })(),
        (() => {
          const p = glasswheel(-1, 8, 8, 5.9, false);
          return pinchAt(p, 7, 8);
        })(),
        glassDaughters(),
      ],
      130,
      false,
      3,
    ),
    stress: anim(stressFrames(glasswheel(-1), [C], S, D), 420, true),
    death: anim(deathFrames(glasswheel(-1), DEATH, R, RD, 239), 150, false, 2),
  },
  required: ['idle', 'reproduction', 'stress', 'death'],
};

// ------------------------------------------------------------------------------- A03 Shadeleaf
// A dark-green crescent (horns to the East) with a mint vein along its middle. Non-motile, yet four
// headings (the species record): idle moves only a light pixel along the vein.
const shadePalette = pal(P.outlineDark, P.shadeleafGreen, P.shadeleafDeep, P.shadeleafVein, P.highlight, '#8C938D');

function crescentBody(p: Px, ox = 0, scale = 1): Px {
  const outer = canvas(16).fillEllipse(8.2 + ox, 8, 5.0 * scale, 5.0 * scale, 1);
  const bite = canvas(16).fillEllipse(11.4 + ox * 1.2, 8, 4.1 * scale, 4.4 * scale, 1);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (outer.get(x, y) && !bite.get(x, y)) p.set(x, y, C);
  return p;
}

/** Vein pixels in order from the upper horn round the back to the lower horn. */
function veinPath(p: Px): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < 16; y++) {
    const xs: number[] = [];
    for (let x = 0; x < 16; x++) if (p.get(x, y) === C || p.get(x, y) === D) xs.push(x);
    if (xs.length >= 3) out.push([Math.round((xs[0]! + xs[xs.length - 1]!) / 2), y]);
  }
  return out;
}

function shadeleaf(light: number, ox = 0, scale = 1): Px {
  const p = crescentBody(canvas(16), ox, scale);
  p.shadeEdge([C], D, 1, 1);
  const vein = veinPath(p);
  for (const [x, y] of vein) p.set(x, y, A);
  if (light >= 0 && vein.length > 0) {
    const [x, y] = vein[Math.floor(((light % 4) * vein.length) / 4)]!;
    p.set(x, y, L);
  }
  return p.outline(O);
}

function shadeDaughters(): Px {
  const p = canvas(16);
  const a = canvas(16).fillEllipse(4.6, 8, 3.2, 3.2, 1);
  const ab = canvas(16).fillEllipse(6.6, 8, 2.5, 2.7, 1);
  const b = canvas(16).fillEllipse(11.0, 8, 3.2, 3.2, 1);
  const bb = canvas(16).fillEllipse(13.0, 8, 2.5, 2.7, 1);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((a.get(x, y) && !ab.get(x, y)) || (b.get(x, y) && !bb.get(x, y))) p.set(x, y, C);
  p.shadeEdge([C], D, 1, 1);
  for (const [x, y] of veinPath(p)) p.set(x, y, A);
  return p.outline(O);
}

export const A03_SHADELEAF: SpriteDef = {
  assetId: 'a03_shadeleaf',
  speciesId: 'A03',
  size: 16,
  headings: 4,
  palette: shadePalette,
  animations: {
    idle: anim([shadeleaf(0), shadeleaf(1), shadeleaf(2), shadeleaf(3)], 380, true),
    reproduction: anim(
      [
        shadeleaf(-1, 0, 1.08),
        shadeleaf(-1, 0, 1.14),
        (() => {
          const p = shadeleaf(-1, 0, 1.14);
          for (let x = 0; x < 16; x++) p.set(x, 7, 0).set(x, 8, 0);
          return p;
        })(),
        shadeDaughters(),
      ],
      130,
      false,
      3,
    ),
    stress: anim(stressFrames(shadeleaf(-1), [C, A], S, D), 420, true),
    death: anim(deathFrames(shadeleaf(-1), DEATH, R, RD, 241), 150, false, 2),
  },
  required: ['idle', 'reproduction', 'stress', 'death'],
};

// -------------------------------------------------------------------------------- A04 Turnleaf
// A split spindle: a pointed lens with a seam across its middle (x = 8). Both halves are drawn at
// the same mid value; the half that brightens is the mode_half layer (Photo: the leading half,
// Sugar: the trailing half), never the body, so the body cannot claim a mode it is not in.
const turnPalette = pal(P.outlineDark, P.turnleafGreen, P.turnleafDeep, P.turnleafDeep, P.highlight, '#A2A89D');

function spindle(p: Px, x0: number, x1: number, ry: number, c: number): Px {
  const cx = (x0 + x1) / 2;
  const rx = (x1 - x0) / 2;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const u = (x + 0.5 - cx) / rx;
      if (Math.abs(u) > 1) continue;
      if (Math.abs(y + 0.5 - 8) <= ry * (1 - Math.abs(u) ** 1.4)) p.set(x, y, c);
    }
  return p;
}

const TURN_GLINT: readonly (readonly [number, number])[] = [
  [4, 7],
  [6, 6],
  [10, 6],
  [12, 7],
];

function turnleaf(glint: number, len = 0, pinch = false): Px {
  const p = spindle(canvas(16), 1.8 - len * 0.5, 14.2 + len * 0.5, 3.4, C);
  if (pinch) pinchAt(p, 7, 8);
  p.shadeEdge([C], D, 0, 1);
  if (!pinch) for (let y = 0; y < 16; y++) p.tint(8, y, A);
  if (glint >= 0) {
    const [x, y] = TURN_GLINT[glint % 4]!;
    p.tint(x, y, L);
  }
  return p.outline(O);
}

function turnDaughters(): Px {
  const p = spindle(canvas(16), 0.8, 7.2, 2.6, C);
  spindle(p, 8.8, 15.2, 2.6, C);
  p.shadeEdge([C], D, 0, 1);
  for (let y = 0; y < 16; y++) p.tint(4, y, A).tint(12, y, A);
  return p.outline(O);
}

export const A04_TURNLEAF: SpriteDef = {
  assetId: 'a04_turnleaf',
  speciesId: 'A04',
  size: 16,
  headings: 4,
  palette: turnPalette,
  animations: {
    move: anim([turnleaf(0), turnleaf(1), turnleaf(2), turnleaf(3)], 140, true),
    reproduction: anim([turnleaf(-1, 0.4), turnleaf(-1, 0.8), turnleaf(-1, 0.8, true), turnDaughters()], 110, false, 3),
    stress: anim(stressFrames(turnleaf(-1), [C], S, D), 400, true),
    death: anim(deathFrames(turnleaf(-1), DEATH, R, RD, 251), 140, false, 2),
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};

// -------------------------------------------------------------------------------- A05 Raftball
// A rosette of six emerald cells round a hollow (the hollow is water-coloured, #D6E7E5). Idle
// moves only a light pixel from cell to cell.
const raftPalette = pal(P.outlineDark, P.raftballEmerald, P.raftballDeep, P.raftballHollow, P.raftballLight, '#8F9A94');

const RAFT_N = 6;

function raftCells(cx: number, cy: number, ring: number): [number, number][] {
  return Array.from({ length: RAFT_N }, (_, k) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / RAFT_N;
    return [cx + ring * Math.cos(a), cy + ring * Math.sin(a)] as [number, number];
  });
}

function raftball(light: number, cx = 8, cy = 8, ring = 3.8, cell = 1.75, hollow = 1.6): Px {
  const p = canvas(16);
  const cells = raftCells(cx, cy, ring);
  for (const [x, y] of cells) p.fillEllipse(x, y, cell, cell, C);
  p.shadeEdge([C], D, 1, 1);
  p.fillEllipse(cx, cy, hollow, hollow, A);
  if (light >= 0) {
    const [x, y] = cells[(light * 2) % RAFT_N]!;
    p.tint(Math.floor(x - 0.5), Math.floor(y - 0.5), L);
  }
  return p.outline(O);
}

export const A05_RAFTBALL: SpriteDef = {
  assetId: 'a05_raftball',
  speciesId: 'A05',
  size: 16,
  headings: 1,
  palette: raftPalette,
  animations: {
    idle: anim([raftball(0), raftball(1), raftball(2), raftball(3)], 400, true),
    reproduction: anim(
      [
        raftball(-1, 8, 8, 4.1, 1.8, 1.8),
        raftball(-1, 8, 8, 4.4, 1.85, 2.0),
        (() => pinchAt(raftball(-1, 8, 8, 4.4, 1.85, 2.0), 7, 8))(),
        (() => {
          const p = canvas(16);
          for (const [x, y] of [...raftCells(4.0, 8, 2.2), ...raftCells(12.0, 8, 2.2)]) p.fillEllipse(x, y, 1.2, 1.2, C);
          p.shadeEdge([C], D, 1, 1);
          p.fillEllipse(4.0, 8, 0.9, 0.9, A).fillEllipse(12.0, 8, 0.9, 0.9, A);
          return p.outline(O);
        })(),
      ],
      140,
      false,
      3,
    ),
    stress: anim(stressFrames(raftball(-1), [C], S, D), 420, true),
    death: anim(deathFrames(raftball(-1), DEATH, R, RD, 257), 150, false, 2),
  },
  required: ['idle', 'reproduction', 'stress', 'death'],
};

// ----------------------------------------------------------------------------- X02 Threadrider
// A filled mauve diamond (X01 is a hollow gold outline). One heading; while free it swims, shown by
// a glint travelling round it (no change of outline, so nothing implies extra speed).
const riderPalette = pal(P.outlineDark, P.threadriderMauve, P.threadriderDeep, P.threadriderDeep, P.threadriderLight, '#A7A3AA');

function filledDiamond(cx: number, cy: number, r: number, p = canvas(16)): Px {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (Math.abs(x + 0.5 - cx) + Math.abs(y + 0.5 - cy) <= r) p.set(x, y, C);
  return p;
}

const RIDER_GLINT: readonly (readonly [number, number])[] = [
  [8, 5],
  [10, 8],
  [7, 10],
  [5, 7],
];

function rider(glint: number, r = 4.9): Px {
  const p = filledDiamond(8, 8, r);
  p.shadeEdge([C], D, 1, 1);
  // A deep core dot (pattern in grayscale).
  p.tint(7, 7, A).tint(8, 8, A);
  if (glint >= 0) {
    const [x, y] = RIDER_GLINT[glint % 4]!;
    p.tint(x, y, L);
  }
  return p.outline(O);
}

export const X02_THREADRIDER: SpriteDef = {
  assetId: 'x02_threadrider',
  speciesId: 'X02',
  size: 16,
  headings: 1,
  palette: riderPalette,
  animations: {
    move: anim([rider(0), rider(1), rider(2), rider(3)], 160, true),
    reproduction: anim(
      [
        rider(-1, 5.4),
        rider(-1, 5.9),
        (() => pinchAt(rider(-1, 5.9), 7, 8))(),
        (() => {
          const p = filledDiamond(4.5, 8, 3.4);
          filledDiamond(11.5, 8, 3.4, p);
          p.shadeEdge([C], D, 1, 1);
          p.tint(4, 7, A).tint(11, 7, A);
          return p.outline(O);
        })(),
      ],
      120,
      false,
      3,
    ),
    stress: anim(stressFrames(rider(-1), [C, A], S, D, 1), 420, true),
    death: anim(deathFrames(rider(-1), DEATH, R, RD, 263), 150, false, 2),
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};

// -------------------------------------------------------------------------------- V02 Lacephage
// The inspection glyph (UX §6.3 "lace glyph"; P5.8 polish, D-0109 taste note): an OPEN lace net, not a capsid: a
// thin thread rim and two crossing threads, each outlined, with four open holes between them. Almost nothing is
// filled, so it differs from V01's filled head-and-tail in silhouette and in alpha. No spikes, no tail. Like V01 it is never drawn as a moving body: `glyph` for the
// inspector, `idle` (slightly larger) for UI lists.
const lacePalette = ['', P.outlineDark, P.lacephageGlyph, P.lacephageDeep, P.lacephageLight];

function laceGlyph(big: boolean): Px {
  const p = canvas(16);
  const r = big ? 5.5 : 4.8;
  // The net's rim: a 1-px thread circle (the pixels whose centre lies within half a pixel of radius r).
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
      if (Math.abs(d - r) <= 0.5) p.set(x, y, 2);
    }
  // Two crossing threads (the diagonals) inside the rim.
  const k = Math.floor(r / Math.SQRT2);
  p.line(8 - k, 8 - k, 7 + k, 7 + k, 2).line(7 + k, 8 - k, 8 - k, 7 + k, 2);
  // Knots where the threads cross (light) and the lower rim in the deep tone (gentle volume, light from the top left).
  for (let y = 9; y < 16; y++) for (let x = 0; x < 16; x++) if (p.get(x, y) === 2 && Math.hypot(x + 0.5 - 8, y + 0.5 - 8) > r - 0.6 && x + y > 17) p.set(x, y, 3);
  p.set(7, 7, 4).set(8, 8, 4);
  return p.outline(O);
}

export const V02_LACEPHAGE: SpriteDef = {
  assetId: 'v02_lacephage',
  speciesId: 'V02',
  size: 16,
  headings: 1,
  form: 'virus',
  palette: lacePalette,
  animations: {
    glyph: anim([laceGlyph(false)], 1000, false, 0),
    idle: anim([laceGlyph(true)], 1000, false, 0),
  },
  required: ['glyph', 'idle'],
};
