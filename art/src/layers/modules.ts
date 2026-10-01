/**
 * Module feature layers (SPEC §9 visuals, UX §6.2 feature layers; P2.1). Small palette-indexed
 * overlays drawn above an organism's body at the same position, heading and scale. Each maps to one
 * recorded fact and is never shown without it:
 *
 *   starch_notch   E01 carrier — three dark notches with pale rims (a producer marking).
 *   reserve_pocket E05 carrier — an interior pocket in four fill bands: 0 = the chamber's extra room
 *                  is empty (pale), 1–3 = thirds of it in use (amber rising from the bottom row).
 *   resting_seam   E03 carrier in a dormancy state — frame 0 Preparing (seam forming), 1 Resting
 *                  (full seam and fold tucks: the folded pose), 2 Waking (seam fading).
 *
 * Phase 3 layers (SPEC §9 E04, E06–E10, E12 visuals; wave 2 art-features). The renderer picks each
 * from the snapshot's E_CUE2 bits only (src/render/features.ts):
 *
 *   anchor_foot     E04 carrier while anchored (CUE2_ANCHORED) — a substrate-facing stalk and foot.
 *   shade_patch     E06 carrier — a broader dark interior patch.
 *   light_trail     E07 carrier moving toward light (CUE2_SEEKING_LIGHT) — two trailing pixels;
 *                   none in reduced motion (UX §7.4 "trails: none").
 *   debris_granule  E08 carrier — frame 0 small granular interior mark; frame 1 its pulse, shown only
 *                   on recorded detritus intake (CUE2_DETRITUS_INTAKE).
 *   protein_notches E09 carrier — frame 0 paired notches; frame 1 with pale release marks, shown only
 *                   while it releases protein (CUE2_RELEASING_PROTEIN).
 *   matrix_edge     E10 carrier — edge film texture, frames 0–3 by the film band of its cell (thirds
 *                   of the 0.50 C film cap; frame 0 no film there).
 *   adhesion_link   E12 carrier while linked (CUE2_LINKED) — small link pixels at its sides (the links
 *                   themselves are drawn between member positions from SnapshotMsg.links).
 *
 * Frames are authored 16×16 facing East, centered on the body, like the sprites. tools/art-build.ts
 * derives the other three headings with the same lossless orient() and packs every frame into the
 * organism atlas as `feature/<layer>/<heading>/<frame>` (ARCH §10.1); the renderer looks them up in
 * the manifest and scales them by the body's frame size. Silhouette and value (not hue alone) carry
 * each mark, so they read in grayscale.
 */
import { P } from '../palette';
import { Px } from '../px';

export type FeatureLayerId =
  | 'starch_notch'
  | 'reserve_pocket'
  | 'resting_seam'
  | 'anchor_foot'
  | 'shade_patch'
  | 'light_trail'
  | 'debris_granule'
  | 'protein_notches'
  | 'matrix_edge'
  | 'adhesion_link';

export interface FeatureLayerDef {
  readonly id: FeatureLayerId;
  /** Index 0 is transparent. */
  readonly palette: readonly string[];
  readonly frames: readonly Px[];
  /** One short name per frame (the state it shows), for the manifest and the asset preview. */
  readonly frameNames: readonly string[];
}

const K = { d: 1, l: 2 } as const;

function frame(rows: readonly string[]): Px {
  if (rows.length !== 16) throw new Error('feature layer frames are 16 rows');
  return Px.fromStrings(rows, K);
}

const EMPTY_ROW = '................';

function grid(marks: Readonly<Record<number, string>>): string[] {
  const rows: string[] = [];
  for (let y = 0; y < 16; y++) rows.push(marks[y] ?? EMPTY_ROW);
  return rows;
}

// Three notches cut into the top body row (y 6) with pale rims beneath (y 7).
const STARCH_NOTCH: FeatureLayerDef = {
  id: 'starch_notch',
  palette: ['', P.starchNotch, P.starchNotchLight],
  frameNames: ['notch'],
  frames: [
    frame(
      grid({
        6: '.....d.d.d......',
        7: '.....l.l.l......',
      }),
    ),
  ],
};

/** 3×3 pocket at x 6–8, y 8–10; `filled` rows from the bottom are amber, the rest pale. */
function pocket(filled: number): Px {
  const rows = grid({});
  const out: string[] = [...rows];
  for (let k = 0; k < 3; k++) {
    const y = 8 + k;
    const fromBottom = 2 - k;
    const ch = fromBottom < filled ? 'd' : 'l';
    out[y] = `......${ch}${ch}${ch}.......`;
  }
  return frame(out);
}

const RESERVE_POCKET: FeatureLayerDef = {
  id: 'reserve_pocket',
  palette: ['', P.reserveAmber, P.reserveEmpty],
  frameNames: [
    'band 0 (extra room empty)',
    'band 1 (up to a third)',
    'band 2 (up to two thirds)',
    'band 3 (more than two thirds)',
  ],
  frames: [pocket(0), pocket(1), pocket(2), pocket(3)],
};

const RESTING_SEAM: FeatureLayerDef = {
  id: 'resting_seam',
  palette: ['', P.restingSeam, P.restingSeamLight],
  frameNames: ['prepare (also the idle carrier seam)', 'rest', 'wake'],
  frames: [
    // Preparing: the seam starts to form at the middle.
    frame(grid({ 7: '........l.......', 8: '........d.......', 9: '........l.......' })),
    // Resting: a full seam across the body with fold tucks at both ends (the folded pose).
    frame(
      grid({
        6: '........d.......',
        7: '....d...d...d...',
        8: '........d.......',
        9: '....d...d...d...',
        10: '........d.......',
      }),
    ),
    // Waking: the seam fades as it unfolds.
    frame(grid({ 6: '........l.......', 8: '........l.......', 10: '........l.......' })),
  ],
};

// ------------------------------------------------------------------ Phase 3 layers (wave 2)

// E04: a short stalk under the body ending in a foot plate (the body's substrate-facing side).
const ANCHOR_FOOT: FeatureLayerDef = {
  id: 'anchor_foot',
  palette: ['', P.anchorFoot, P.anchorFootLight],
  frameNames: ['foot (anchored)'],
  frames: [frame(grid({ 12: '.......dd.......', 13: '.......dl.......', 14: '.....dddddd.....', 15: '.....llllll.....' }))],
};

// E06: a broader dark interior patch.
const SHADE_PATCH: FeatureLayerDef = {
  id: 'shade_patch',
  palette: ['', P.shadePatch, P.shadePatchLight],
  frameNames: ['dark interior patch'],
  frames: [frame(grid({ 6: '.......ll.......', 7: '.....dddddd.....', 8: '....dddddddd....', 9: '.....dddddd.....', 10: '.......ll.......' }))],
};

// E07: two trailing motility pixels behind the body (East-facing frame: the trail is to the West).
const LIGHT_TRAIL: FeatureLayerDef = {
  id: 'light_trail',
  palette: ['', P.lightTrailDeep, P.lightTrail],
  frameNames: ['two trailing pixels (moving toward light)'],
  frames: [frame(grid({ 8: 'l...............', 9: '.d..............' }))],
};

// E08: small granular interior mark; the pulse adds a pale ring of granules.
const DEBRIS_GRANULE: FeatureLayerDef = {
  id: 'debris_granule',
  palette: ['', P.debrisGranule, P.debrisGranuleLight],
  frameNames: ['granule (carrier)', 'granule pulse (detritus intake)'],
  frames: [
    frame(grid({ 7: '........d.......', 8: '......d.........', 9: '.........d......' })),
    frame(grid({ 6: '.......l.l......', 7: '.....l..d..l....', 8: '......d.........', 9: '.....l...d.l....', 10: '.......l.l......' })),
  ],
};

// E09: paired notches top and bottom; the release frame adds pale marks outside them.
const PROTEIN_NOTCHES: FeatureLayerDef = {
  id: 'protein_notches',
  palette: ['', P.proteinNotch, P.proteinRelease],
  frameNames: ['paired notches (carrier)', 'pale release marks (releasing protein)'],
  frames: [
    frame(grid({ 5: '.......d.d......', 10: '.......d.d......' })),
    frame(grid({ 3: '.......l.l......', 5: '.......d.d......', 10: '.......d.d......', 12: '.......l.l......' })),
  ],
};

/** E10 matrix edge: rim speckles around the body, denser with more film in its cell (frame = band). */
function matrix(level: number): Px {
  // Candidate rim pixels, in the order they appear as the film thickens.
  const rim: readonly (readonly [number, number])[] = [
    [4, 3], [11, 12], [1, 7], [14, 9],
    [8, 2], [7, 13], [2, 10], [13, 5], [11, 3], [4, 12],
    [6, 2], [9, 13], [1, 5], [14, 11], [13, 3], [2, 12], [10, 2], [5, 13],
  ];
  const count = [4, 10, 14, 18][level]!;
  const rows = grid({}).map((r) => r.split(''));
  rim.slice(0, count).forEach(([x, y], k) => {
    rows[y]![x] = level >= 2 && k % 3 === 0 ? 'l' : 'd';
  });
  return frame(rows.map((r) => r.join('')));
}

const MATRIX_EDGE: FeatureLayerDef = {
  id: 'matrix_edge',
  palette: ['', P.matrixEdge, P.matrixEdgeLight],
  frameNames: ['trace (no film in its cell)', 'film up to a third of the cap', 'film up to two thirds', 'film above two thirds'],
  frames: [matrix(0), matrix(1), matrix(2), matrix(3)],
};

// E12: small link pixels at both sides of the body (the links are drawn between member positions).
const ADHESION_LINK: FeatureLayerDef = {
  id: 'adhesion_link',
  palette: ['', P.adhesionLink, P.adhesionLinkLight],
  frameNames: ['link pixels (linked)'],
  frames: [frame(grid({ 7: 'dl............ld', 8: 'dl............ld' }))],
};

/** Canonical order (atlas layout and manifest order). Phase 3 layers follow the Phase 2 three. */
export const FEATURE_LAYERS: readonly FeatureLayerDef[] = [
  STARCH_NOTCH,
  RESERVE_POCKET,
  RESTING_SEAM,
  ANCHOR_FOOT,
  SHADE_PATCH,
  LIGHT_TRAIL,
  DEBRIS_GRANULE,
  PROTEIN_NOTCHES,
  MATRIX_EDGE,
  ADHESION_LINK,
];
