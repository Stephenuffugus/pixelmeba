/**
 * Phase 3 small organisms (16×16; UX §6.1–6.3, CT §1.3): B02 Velvet, B03 Dusk, B05 Crossfeeder,
 * B07 Oilwick, B08 Brothmaker, Y01 Bubble, Y02 Creambud and X01 Hitcher. Silhouettes:
 *   B02 paired dots with a velvet stipple (colony texture) · B03 curved rod with a pale inner stripe ·
 *   B05 comma (round head, tapering tail) with a pale contrasting tail tip · B07 the same curved rod
 *   as B03, dark navy with an amber head (the pair is told apart by value, not outline) ·
 *   B08 fat capsule with two white bands · Y01 horizontal oval with a dark bud ·
 *   Y02 upright pear with an orange bud on its narrow end · X01 hollow gold diamond outline.
 * Elongated, motile bodies (B03, B05, B07, B08) face East; tools/art-build.ts derives the other
 * headings with the lossless orient(). B02, Y01 and Y02 are non-motile and loop "idle"; X01 swims
 * while free (0.4 cells/s) and loops "move" with one heading (a diamond needs no turning).
 * Motion only shows what the simulation does: no pose here implies speed, feeding or division
 * the body is not doing.
 */
import { P } from '../palette';
import type { Px } from '../px';
import type { SpriteDef } from '../sprite';
import { anim, canvas, curve, deathFrames, O, stressFrames } from './kit';

/** Palette layout shared by the files in this module: 1 outline, 2 base, 3 deep, 4 accent, 5 light, 6 stress, 7/8 remains. */
const C = 2;
const D = 3;
const A = 4;
const L = 5;
const S = 6;
const R = 7;
const RD = 8;

const pal = (outline: string, base: string, deep: string, accent: string, light: string, stress: string): string[] => ['', outline, base, deep, accent, light, stress, P.remains, P.remainsDark];

// ---------------------------------------------------------------------------------- B02 Velvet
// Two attached round cells (a pair) with a velvet stipple; non-motile, film producer.
const velvetPalette = pal(P.outlineDark, P.velvetTeal, P.velvetDeep, P.velvetLight, P.highlight, '#9FAAA8');

function velvet(phase: number, opts: { apart?: number; split?: number } = {}): Px {
  const p = canvas(16);
  const g = opts.apart ?? 0;
  const cells: [number, number][] = [
    [5.5 - g, 6.5 - g],
    [10.5 + g, 9.5 + g],
  ];
  const sp = opts.split ?? 0;
  for (const [x, y] of cells) {
    if (sp > 0) {
      // Each cell elongates across the pair axis, then divides into two.
      p.fillEllipse(x - sp * 0.9, y + sp * 0.9, 2.4 - sp * 0.25, 2.4 - sp * 0.25, C);
      p.fillEllipse(x + sp * 0.9, y - sp * 0.9, 2.4 - sp * 0.25, 2.4 - sp * 0.25, C);
    } else p.fillEllipse(x, y, 2.9, 2.9, C);
  }
  p.shadeEdge([C], D, 1, 1);
  // Velvet stipple: a light checker inside the body (colony texture), shifting with the phase.
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + 2 * y + phase) % 4 === 0 && p.get(x, y) === C) p.set(x, y, A);
  for (const [x, y] of cells) p.tint(Math.round(x) - 1, Math.round(y) - 2, L);
  return p.outline(O);
}

export const B02_VELVET: SpriteDef = {
  assetId: 'b02_velvet',
  speciesId: 'B02',
  size: 16,
  headings: 1,
  palette: velvetPalette,
  animations: {
    idle: anim([velvet(0), velvet(1), velvet(2), velvet(3)], 340, true),
    reproduction: anim([velvet(0, { split: 0.6 }), velvet(0, { split: 1.1 }), velvet(0, { split: 1.5 }), velvet(0, { split: 1.8, apart: 0.6 })], 120, false, 3),
    stress: anim(stressFrames(velvet(0), [C, A], S, D), 420, true),
    death: anim(deathFrames(velvet(0), [0.35, 0.65, 0.85], R, RD, 41), 150, false, 2),
  },
  required: ['idle', 'reproduction', 'stress', 'death'],
};

// ------------------------------------------------------------------------ B03 Dusk / B07 Oilwick
// Both are curved rods (UX §6.3); B03 is mid violet with a pale stripe along the inner (top) edge,
// B07 is dark navy with an amber head. The shared outline is deliberate; value and pattern tell
// them apart in grayscale.

function curvedRod(bend: number, len = 0, pinch = false): Px {
  const p = canvas(16);
  p.fillStroke(curve([3.4 - len, 9.6], [8, 5.6 - bend], [12.6 + len, 9.6], 16), 1.95, C);
  if (pinch) for (let y = 0; y < 16; y++) p.set(7, y, 0).set(8, y, 0);
  p.shadeEdge([C], D, 0, 1);
  return p;
}

function dusk(bend: number, glint: number, len = 0, pinch = false): Px {
  const p = curvedRod(bend, len, pinch);
  // Pale stripe on the inner (upper) edge.
  const src = p.clone();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (src.get(x, y) === C && src.get(x, y - 1) === 0) p.set(x, y, A);
  p.tint(4 + glint * 2, 9 - (glint === 0 ? 0 : 1), L);
  return p.outline(O);
}

const duskPalette = pal(P.outlineDark, P.duskViolet, P.duskDeep, P.duskLight, P.highlight, '#A6A3AE');

function daughtersCurved(paint: (p: Px) => void): Px {
  const p = canvas(16);
  p.fillStroke(curve([2, 10], [4, 5.6], [6, 10], 8), 1.5, C);
  p.fillStroke(curve([10, 10], [12, 5.6], [14, 10], 8), 1.5, C);
  p.shadeEdge([C], D, 0, 1);
  paint(p);
  return p.outline(O);
}

export const B03_DUSK: SpriteDef = {
  assetId: 'b03_dusk',
  speciesId: 'B03',
  size: 16,
  headings: 4,
  palette: duskPalette,
  animations: {
    move: anim([dusk(0, 0), dusk(0.6, 1), dusk(0, 2), dusk(-0.6, 3)], 130, true),
    reproduction: anim(
      [
        dusk(0, 0, 0.5),
        dusk(-0.4, 0, 0.9),
        dusk(-0.4, 0, 0.9, true),
        daughtersCurved((p) => {
          const src = p.clone();
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (src.get(x, y) === C && src.get(x, y - 1) === 0) p.set(x, y, A);
        }),
      ],
      100,
      false,
      3,
    ),
    stress: anim(stressFrames(dusk(0, 0), [C, A], S, D), 400, true),
    death: anim(deathFrames(dusk(0, 0), [0.35, 0.65, 0.85], R, RD, 43), 140, false, 2),
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};

const oilPalette = pal(P.outlineDark, P.oilNavy, P.oilDeep, P.oilAmber, P.oilLight, '#7D838C');

function oilwick(bend: number, glint: number, len = 0, pinch = false): Px {
  const p = curvedRod(bend, len, pinch);
  // Amber head: the East end of the rod.
  const headX = 12 + Math.ceil(len) - 1;
  for (let y = 0; y < 16; y++) for (let x = headX; x < 16; x++) p.tint(x, y, A);
  // A light sheen dot travels along the back.
  p.tint(5 + glint * 2, 8 - (glint === 0 || glint === 3 ? 0 : 1), L);
  return p.outline(O);
}

export const B07_OILWICK: SpriteDef = {
  assetId: 'b07_oilwick',
  speciesId: 'B07',
  size: 16,
  headings: 4,
  palette: oilPalette,
  animations: {
    move: anim([oilwick(0, 0), oilwick(0.6, 1), oilwick(0, 2), oilwick(-0.6, 3)], 130, true),
    reproduction: anim(
      [
        oilwick(0, 0, 0.5),
        oilwick(-0.4, 0, 0.9),
        oilwick(-0.4, 0, 0.9, true),
        daughtersCurved((p) => {
          for (let y = 0; y < 16; y++) for (const x of [5, 6, 13, 14]) p.tint(x, y, A);
        }),
      ],
      100,
      false,
      3,
    ),
    stress: anim(stressFrames(oilwick(0, 0), [C, L], S, D), 400, true),
    death: anim(deathFrames(oilwick(0, 0), [0.35, 0.65, 0.85], R, RD, 47), 140, false, 2),
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};

// ----------------------------------------------------------------------------- B05 Crossfeeder
// Comma: round head leading East, a tapering curved tail to the West ending in a pale tip.
const crossPalette = pal(P.outlineDark, P.crossBlue, P.crossDeep, P.crossTip, P.highlight, '#9AA3AA');

function comma(sway: number, opts: { grow?: number; pinch?: boolean } = {}): Px {
  const p = canvas(16);
  const g = opts.grow ?? 0;
  const head: [number, number] = [10.6 + g * 0.5, 7.4];
  p.fillEllipse(head[0], head[1], 3.1 + g * 0.2, 3.1, C);
  const tail = curve([head[0] - 1, 8.4], [5.6 - g * 0.5, 11.4], [2.4 - g * 0.6, 9.4 + sway], 14);
  p.fillStroke(tail, 2.2, C, (t) => 2.3 - 1.5 * t);
  if (opts.pinch) for (let y = 0; y < 16; y++) p.set(7, y, 0);
  p.shadeEdge([C], D, 1, 1);
  // Pale contrasting tip: the last pixels of the tail.
  const b = p.bounds();
  if (b) for (let y = 0; y < 16; y++) for (let x = b.x0; x <= b.x0 + 1; x++) p.tint(x, y, A);
  p.tint(Math.round(head[0]) - 1, 5, L);
  return p.outline(O);
}

export const B05_CROSSFEEDER: SpriteDef = {
  assetId: 'b05_crossfeeder',
  speciesId: 'B05',
  size: 16,
  headings: 4,
  palette: crossPalette,
  animations: {
    move: anim([comma(0), comma(-1), comma(0), comma(1)], 120, true),
    reproduction: anim(
      [
        comma(0, { grow: 0.6 }),
        comma(0, { grow: 1.2 }),
        comma(0, { grow: 1.2, pinch: true }),
        (() => {
          // Two small commas side by side, each with its own pale tip.
          const p = canvas(16);
          p.fillEllipse(5.4, 6, 2.2, 2.2, C);
          p.fillStroke(curve([4.6, 7], [3, 9.6], [1.4, 9.2], 6), 1.4, C, (t) => 1.5 - t);
          p.fillEllipse(12.6, 9.4, 2.2, 2.2, C);
          p.fillStroke(curve([11.8, 10.4], [10.2, 13], [8.8, 12.6], 6), 1.4, C, (t) => 1.5 - t);
          p.shadeEdge([C], D, 1, 1);
          p.tint(1, 9, A).tint(2, 9, A).tint(9, 12, A).tint(9, 13, A);
          return p.outline(O);
        })(),
      ],
      100,
      false,
      3,
    ),
    stress: anim(stressFrames(comma(0), [C], S, D), 400, true),
    death: anim(deathFrames(comma(0), [0.35, 0.65, 0.85], R, RD, 53), 140, false, 2),
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};

// ----------------------------------------------------------------------------- B08 Brothmaker
// Fat capsule with two white bands (vs B01's slimmer rod with one pale band).
const brothPalette = pal(P.outlineDark, P.brothRose, P.brothDeep, P.brothBand, P.highlight, '#B4A9AD');

function broth(len = 0, pinch = false, shimmer = -1): Px {
  const p = canvas(16);
  p.fillRodH(4.6 - len * 0.5, 11.4 + len * 0.5, 8, 3.4, C);
  if (pinch) for (const y of [4, 5, 10, 11]) p.set(8, y, 0).set(7, y, 0);
  p.shadeEdge([C], D, 0, 1);
  for (let y = 0; y < 16; y++) {
    p.tint(5 - Math.round(len * 0.5), y, A);
    p.tint(10 + Math.round(len * 0.5), y, A);
  }
  p.tint(3, 7, L);
  if (shimmer >= 0) p.tint(7 + (shimmer % 2), 6 + shimmer, L);
  return p.outline(O);
}

export const B08_BROTHMAKER: SpriteDef = {
  assetId: 'b08_brothmaker',
  speciesId: 'B08',
  size: 16,
  headings: 4,
  palette: brothPalette,
  animations: {
    move: anim([broth(0, false, -1), broth(0, false, 0), broth(0, false, 2), broth(0, false, 4)], 140, true),
    reproduction: anim(
      [
        broth(0.8),
        broth(1.6),
        broth(1.6, true),
        (() => {
          const p = canvas(16);
          p.fillRodH(3, 4.4, 8, 2.8, C);
          p.fillRodH(11.6, 13, 8, 2.8, C);
          p.shadeEdge([C], D, 0, 1);
          for (let y = 0; y < 16; y++) p.tint(4, y, A).tint(12, y, A);
          return p.outline(O);
        })(),
      ],
      100,
      false,
      3,
    ),
    stress: anim(stressFrames(broth(), [C], S, D), 400, true),
    death: anim(deathFrames(broth(), [0.35, 0.65, 0.85], R, RD, 59), 140, false, 2),
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};

// ----------------------------------------------------------------------------------- Y01 Bubble
// Horizontal cream oval with a burgundy bud on its upper right; a vacuole drifts inside.
const bubblePalette = pal(P.outlineSoft, P.bubbleCream, P.bubbleDeep, P.bubbleBud, P.highlight, '#BDB9B0');

function bubble(vac: number, bud = 1.7, budSep = 0): Px {
  const p = canvas(16);
  p.fillEllipse(7, 9.2, 4.6, 3.7, C);
  p.shadeEdge([C], D, 1, 1);
  const bx = 12.1 + budSep;
  const by = 5.3 - budSep * 0.7;
  p.fillEllipse(bx, by, bud, bud, A);
  if (budSep === 0) p.set(11, 6, A);
  // Vacuole: a 2-px light pocket that drifts within the cell.
  const vx = [5, 6, 7, 6][vac % 4]!;
  p.tint(vx, 8, L).tint(vx + 1, 8, L);
  p.tint(4, 10, D);
  return p.outline(O);
}

export const Y01_BUBBLE: SpriteDef = {
  assetId: 'y01_bubble',
  speciesId: 'Y01',
  size: 16,
  headings: 1,
  palette: bubblePalette,
  animations: {
    idle: anim([bubble(0), bubble(1), bubble(2), bubble(3)], 360, true),
    reproduction: anim(
      [
        bubble(0, 2.1),
        bubble(0, 2.6),
        bubble(0, 2.9, 0.4),
        (() => {
          // Mother and a separated daughter (cream) carrying a bud scar.
          const p = canvas(16);
          p.fillEllipse(6, 10, 4, 3.4, C);
          p.fillEllipse(12.4, 4.4, 2.7, 2.5, C);
          p.shadeEdge([C], D, 1, 1);
          p.tint(9, 8, A).tint(11, 6, A);
          return p.outline(O);
        })(),
      ],
      130,
      false,
      3,
    ),
    stress: anim(stressFrames(bubble(0), [C, L], S, D), 420, true),
    death: anim(deathFrames(bubble(0), [0.35, 0.65, 0.85], R, RD, 61), 150, false, 2),
  },
  required: ['idle', 'reproduction', 'stress', 'death'],
};

// --------------------------------------------------------------------------------- Y02 Creambud
// Upright ivory pear, wide at the base; the orange bud sits on its narrow upper end.
const creamPalette = pal(P.outlineSoft, P.creamIvory, P.creamDeep, P.creamBud, P.highlight, '#C4C0B6');

function pear(budR: number, sway = 0, budLift = 0): Px {
  const p = canvas(16);
  p.fillStroke([[7.6, 11.4], [8.4 + sway * 0.5, 5.6]], 3.6, C, (t) => 3.7 - 2.1 * t);
  p.shadeEdge([C], D, 1, 1);
  p.fillEllipse(8.8 + sway * 0.5, 3.2 - budLift, budR, budR, A);
  p.tint(6, 10, L).tint(6, 9, L);
  return p.outline(O);
}

export const Y02_CREAMBUD: SpriteDef = {
  assetId: 'y02_creambud',
  speciesId: 'Y02',
  size: 16,
  headings: 1,
  palette: creamPalette,
  animations: {
    idle: anim([pear(1.5), pear(1.6, 0.4), pear(1.5), pear(1.6, -0.4)], 380, true),
    reproduction: anim(
      [
        pear(1.9),
        pear(2.3, 0, 0.3),
        pear(2.5, 0, 0.8),
        (() => {
          const p = canvas(16);
          p.fillStroke([[6.6, 12.2], [7.2, 8]], 3.2, C, (t) => 3.3 - 1.8 * t);
          p.fillEllipse(11.6, 3.6, 2.3, 2.5, C);
          p.shadeEdge([C], D, 1, 1);
          p.tint(7, 6, A).tint(12, 1, A);
          return p.outline(O);
        })(),
      ],
      130,
      false,
      3,
    ),
    stress: anim(stressFrames(pear(1.5), [C, L], S, D), 420, true),
    death: anim(deathFrames(pear(1.5), [0.35, 0.65, 0.85], R, RD, 67), 150, false, 2),
  },
  required: ['idle', 'reproduction', 'stress', 'death'],
};

// ---------------------------------------------------------------------------------- X01 Hitcher
// A hollow gold diamond outline (the inside is empty). One heading; while free it swims, shown by
// a glint travelling round the ring (no change of outline, so nothing implies extra speed).
const hitcherPalette = pal(P.outlineDark, P.hitcherGold, P.hitcherDeep, P.hitcherGold, P.highlight, '#B4AF9E');

function diamond(cx: number, cy: number, outer: number, inner: number, p = canvas(16)): Px {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.abs(x + 0.5 - cx) + Math.abs(y + 0.5 - cy);
      if (d <= outer && d > inner) p.set(x, y, C);
    }
  }
  return p;
}

const GLINT: readonly (readonly [number, number])[] = [
  [8, 3],
  [12, 8],
  [7, 12],
  [3, 7],
];

function hitcher(glint: number): Px {
  const p = diamond(8, 8, 5.6, 3.1);
  p.shadeEdge([C], D, 1, 1);
  if (glint >= 0) {
    const [x, y] = GLINT[glint % 4]!;
    p.tint(x, y, L);
  }
  return p.outline(O);
}

export const X01_HITCHER: SpriteDef = {
  assetId: 'x01_hitcher',
  speciesId: 'X01',
  size: 16,
  headings: 1,
  palette: hitcherPalette,
  animations: {
    move: anim([hitcher(0), hitcher(1), hitcher(2), hitcher(3)], 160, true),
    reproduction: anim(
      [
        hitcher(-1),
        (() => {
          const p = diamond(8, 8, 6.2, 3.4);
          p.shadeEdge([C], D, 1, 1);
          return p.outline(O);
        })(),
        (() => {
          const p = diamond(8, 8, 6.2, 3.4);
          for (let y = 0; y < 16; y++) p.set(7, y, 0).set(8, y, 0);
          p.shadeEdge([C], D, 1, 1);
          return p.outline(O);
        })(),
        (() => {
          const p = diamond(4.5, 8, 3.8, 1.6);
          diamond(11.5, 8, 3.8, 1.6, p);
          p.shadeEdge([C], D, 1, 1);
          return p.outline(O);
        })(),
      ],
      120,
      false,
      3,
    ),
    stress: anim(stressFrames(hitcher(-1), [C], S, D, 1), 420, true),
    death: anim(deathFrames(hitcher(-1), [0.35, 0.65, 0.85], R, RD, 71), 150, false, 2),
  },
  required: ['move', 'reproduction', 'stress', 'death'],
};
