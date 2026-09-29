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
 * Frames are authored 16×16 facing East, centered on the body, like the sprites. tools/art-build.ts
 * derives the other three headings with the same lossless orient() and packs every frame into the
 * organism atlas as `feature/<layer>/<heading>/<frame>` (ARCH §10.1); the renderer looks them up in
 * the manifest and scales them by the body's frame size. Silhouette and value (not hue alone) carry
 * each mark, so they read in grayscale.
 */
import { P } from '../palette';
import { Px } from '../px';

export type FeatureLayerId = 'starch_notch' | 'reserve_pocket' | 'resting_seam';

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

/** Canonical order (atlas layout and manifest order). */
export const FEATURE_LAYERS: readonly FeatureLayerDef[] = [STARCH_NOTCH, RESERVE_POCKET, RESTING_SEAM];
