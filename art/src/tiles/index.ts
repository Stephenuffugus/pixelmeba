/**
 * World tiles (UX §6.2 "Film: isolated, edge, center, eroding", §6.5 "film textures; food object
 * outlines that shrink with inventory"; ARCH §10.1; wave 2 art-features). One cell per tile: 16×16
 * frames, never rotated, packed by tools/art-build.ts into the organism atlas as `tile/<id>/<frame>`
 * and listed in the manifest's `tiles` table. The renderer picks each frame from snapshot data only
 * (src/render/world3.ts): the film band's level and eroding bit and the four-neighbour film mask, a
 * food object's fill, and the 'objectEmptied' event.
 *
 *   film    0 isolated (no film in any four-neighbour), 1 edge (some neighbours), 2 center (all four),
 *           3 eroding (the film there is lower than a tick ago). Drawn with opacity by the film band.
 *   pellet  M10 slow feeder pellet, frames 0–3 = fill quartiles (0 = a quarter or less left … 3 = more
 *           than three quarters): the outline shrinks with what is left.
 *   wafer   M11 leaf wafer, the same four fill steps.
 *   stain   the fading stain an emptied object leaves (cosmetic; blocks nothing).
 *
 * Silhouette and value carry each tile in grayscale; texture is deterministic (no randomness).
 */
import { P } from '../palette';
import { Px } from '../px';

export type TileId = 'film' | 'pellet' | 'wafer' | 'stain';

export interface TileDef {
  readonly id: TileId;
  /** Index 0 is transparent. */
  readonly palette: readonly string[];
  readonly frames: readonly Px[];
  readonly frameNames: readonly string[];
}

export const TILE_SIZE = 16;

/** Deterministic texture hash in [0, 1) for pixel (x, y) and a salt (art authoring only). */
function hash(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ------------------------------------------------------------------------------------- film
const F = { base: 1, deep: 2, light: 3, dull: 4 } as const;

/** Film texture over the pixels `inside` accepts: soft base with deep matrix dots and pale glints. */
function filmTexture(inside: (x: number, y: number) => boolean, salt: number): Px {
  const p = new Px(TILE_SIZE, TILE_SIZE);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      if (!inside(x, y)) continue;
      const r = hash(x, y, salt);
      // A seamless lattice of matrix dots (period 4 both ways) so center tiles join without seams.
      const dot = (x + 2 * y) % 4 === 0 && y % 2 === 0;
      p.set(x, y, dot ? F.deep : r < 0.08 ? F.light : F.base);
    }
  }
  return p;
}

const filmIsolated = (() => {
  const p = filmTexture((x, y) => (x - 7.5) ** 2 + (y - 7.5) ** 2 <= 5.6 ** 2, 1);
  // A pale rim marks the free edge of a lone patch.
  for (let y = 0; y < TILE_SIZE; y++)
    for (let x = 0; x < TILE_SIZE; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      if (p.get(x, y) !== 0 && d > 4.6) p.set(x, y, F.light);
    }
  return p;
})();

// Edge: the cell is covered but its border is ragged and pale (some neighbours have no film).
const filmEdge = (() => {
  const p = filmTexture((x, y) => {
    const border = Math.min(x, y, TILE_SIZE - 1 - x, TILE_SIZE - 1 - y);
    return border >= 1 || hash(x, y, 5) < 0.5;
  }, 2);
  for (let y = 0; y < TILE_SIZE; y++)
    for (let x = 0; x < TILE_SIZE; x++) {
      const border = Math.min(x, y, TILE_SIZE - 1 - x, TILE_SIZE - 1 - y);
      if (p.get(x, y) !== 0 && border <= 1 && p.get(x, y) === F.base) p.set(x, y, F.light);
    }
  return p;
})();

// Center: full, seamless cover.
const filmCenter = filmTexture(() => true, 3);

// Eroding: the cover breaks up and dulls (film lower than a tick ago).
const filmEroding = (() => {
  const p = filmTexture(() => true, 4);
  for (let y = 0; y < TILE_SIZE; y++)
    for (let x = 0; x < TILE_SIZE; x++) {
      const r = hash(x, y, 9);
      if (r < 0.38) p.set(x, y, 0);
      else if (p.get(x, y) === F.base) p.set(x, y, F.dull);
    }
  return p;
})();

const FILM: TileDef = {
  id: 'film',
  palette: ['', P.filmTeal, P.filmDeep, P.filmLight, P.filmDull],
  frameNames: ['isolated', 'edge', 'center', 'eroding'],
  frames: [filmIsolated, filmEdge, filmCenter, filmEroding],
};

// ------------------------------------------------------------------------------- food objects
const O = { outline: 1, body: 2, deep: 3, light: 4 } as const;

/** Pellet: a round slow-release lump; radius shrinks with fill step 0–3. */
function pellet(step: number): Px {
  const r = [2.2, 3.3, 4.4, 5.5][step]!;
  const p = new Px(TILE_SIZE, TILE_SIZE);
  p.fillEllipse(7.5, 7.5, r, r, O.body);
  p.shadeEdge([O.body], O.deep, 1, 1);
  p.set(6, 6, O.light);
  if (step >= 2) p.set(7, 6, O.light).set(6, 7, O.light);
  return p.outline(O.outline);
}

/** Wafer: a flat leaf square with a vein; its side shrinks with fill step 0–3. */
function wafer(step: number): Px {
  const half = [2, 3, 4, 5][step]!;
  const p = new Px(TILE_SIZE, TILE_SIZE);
  const lo = 8 - half;
  p.fillRect(lo, lo, half * 2, half * 2, O.body);
  p.shadeEdge([O.body], O.deep, 1, 1);
  // Central vein and side veins (pattern, so it reads in grayscale).
  p.line(lo, lo + half * 2 - 1, lo + half * 2 - 1, lo, O.light);
  if (step >= 2) p.line(lo + 1, lo + half, lo + half, lo + half * 2 - 1, O.light);
  return p.outline(O.outline);
}

const PELLET: TileDef = {
  id: 'pellet',
  palette: ['', P.pelletOutline, P.pelletAmber, P.pelletDeep, P.pelletLight],
  frameNames: ['a quarter or less left', 'up to half left', 'up to three quarters left', 'more than three quarters left'],
  frames: [pellet(0), pellet(1), pellet(2), pellet(3)],
};

const WAFER: TileDef = {
  id: 'wafer',
  palette: ['', P.waferOutline, P.waferLeaf, P.waferDeep, P.waferVein],
  frameNames: ['a quarter or less left', 'up to half left', 'up to three quarters left', 'more than three quarters left'],
  frames: [wafer(0), wafer(1), wafer(2), wafer(3)],
};

// Stain: a faint irregular blot (drawn fading; it blocks nothing).
const STAIN: TileDef = {
  id: 'stain',
  palette: ['', P.stain, P.stainDeep],
  frameNames: ['emptied object stain'],
  frames: [
    (() => {
      const p = new Px(TILE_SIZE, TILE_SIZE);
      for (let y = 0; y < TILE_SIZE; y++)
        for (let x = 0; x < TILE_SIZE; x++) {
          const d = Math.hypot(x - 7.5, y - 7.5);
          const r = hash(x, y, 21);
          if (d <= 4.2 + r * 1.6 && r > 0.25) p.set(x, y, d > 4 ? 2 : 1);
        }
      return p;
    })(),
  ],
};

/** Canonical order (atlas layout and manifest order). */
export const TILES: readonly TileDef[] = [FILM, PELLET, WAFER, STAIN];
