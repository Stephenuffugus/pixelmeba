/**
 * The launcher icon (P4.10; UX §10 "Icon: the dish with one bright colony, no text"): palette-indexed pixel
 * matrices (ARCH §10.1), compiled by tools/android-icons.ts at INTEGER scales only (nearest neighbour).
 *
 * - `iconForeground()`: the adaptive-icon foreground on a 54 × 54 grid (Android's 108 dp canvas at 1 cell =
 *   2 dp). Everything drawn stays inside the central safe circle, 66/108 of the width (a radius of 16.5 cells
 *   around the centre), so no launcher mask ever clips the dish.
 * - `ICON_BACKGROUND`: the adaptive-icon background layer, the solid "outside" colour the dish sits in.
 * - `iconLegacy('square' | 'round')`: the same dish on a 24 × 24 grid for pre-Android-8 launchers (48 px at
 *   mdpi = 24 × 2): full-bleed square, or a disc with a transparent outside. At that grid the colony is one
 *   clump of cells with three gold centres instead of five separate cells (D-0093; the owner looks at both in
 *   docs/ANDROID_SETUP.md §10).
 *
 * The dish is the dark rim, the pale water with its light upper-left and deeper lower-right, and ONE colony
 * of Sunbead-coloured cells (green with a gold centre, the brightest thing in the picture), set a little
 * off-centre the way a single colony grows. No text, no gradients, no anti-aliasing.
 */
import { P } from '../palette';
import { Px } from '../px';

/** Index 0 is transparent; the rest are named palette colours (UX §6.1). */
export const ICON_PALETTE: readonly string[] = [
  '', // 0 transparent
  P.outside, // 1 the surround
  P.rim, // 2 dish rim
  P.rimLight, // 3 rim highlight
  P.water, // 4 water
  P.waterDeep, // 5 deeper water
  P.waterLight, // 6 light on the water
  P.sunbeadDeep, // 7 colony outline / shade
  P.sunbeadGreen, // 8 colony body
  P.sunbeadGold, // 9 colony centre
  P.sunbeadLight, // 10 colony highlight
  P.wall, // 11 inner rim shadow
];

/** The adaptive icon's background layer colour (android/app/src/main/res/values/ic_launcher_background.xml). */
export const ICON_BACKGROUND = P.outside;

const KEY = { d: 7, g: 8, o: 9, l: 10 } as const;

/** One cell of the colony on the 54 grid (5 × 5). */
const CELL5 = Px.fromStrings(['.ddd.', 'dlggd', 'dgogd', 'dggdd', '.ddd.'], KEY);
/** The colony on the 24 grid: one clump of cells with three gold centres (7 × 6). */
const COLONY24 = Px.fromStrings(['..ddd..', '.dlggd.', 'dgogogd', 'dggggod', '.dgogd.', '..ddd..'], KEY);

/** Distance from the grid centre to the farthest corner of cell (x, y). */
function farCorner(x: number, y: number, c: number): number {
  const dx = Math.max(Math.abs(x - c), Math.abs(x + 1 - c));
  const dy = Math.max(Math.abs(y - c), Math.abs(y + 1 - c));
  return Math.hypot(dx, dy);
}

/** Distance from the grid centre to the cell's centre. */
function centreDist(x: number, y: number, c: number): number {
  return Math.hypot(x + 0.5 - c, y + 0.5 - c);
}

/**
 * The dish on an n × n grid: everything within `outer` (by the farthest corner of each cell), a rim `rimW`
 * cells wide, water inside, light upper-left and deeper lower-right, and the colony stamped at (cx, cy).
 */
function drawDish(n: number, outer: number, rimW: number, colony: Px, at: readonly [number, number], specks: readonly (readonly [number, number])[]): Px {
  const p = new Px(n, n);
  const c = n / 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (farCorner(x, y, c) > outer) continue;
      const r = centreDist(x, y, c);
      const inner = outer - rimW - 0.5;
      const dx = x + 0.5 - c;
      const dy = y + 0.5 - c;
      if (r > inner) {
        // Rim: a short highlight arc on the outer edge, upper-left; dark elsewhere.
        p.set(x, y, dx + dy < -1.2 * r && r > outer - 1.5 ? 3 : 2);
      } else if (r > inner - 1) {
        p.set(x, y, 11); // the inner edge of the wall
      } else if (dx + dy > inner * 0.75) {
        p.set(x, y, 5); // deeper water lower-right
      } else if (dx + dy < -inner * 0.9) {
        p.set(x, y, 6); // light upper-left
      } else p.set(x, y, 4);
    }
  }
  for (const [sx, sy] of specks) if (p.get(sx, sy) === 4) p.set(sx, sy, 6);
  return p.stamp(colony, at[0], at[1]);
}

/** The colony on the 54 grid: five cells grown together. */
function colony54(): Px {
  const p = new Px(15, 13);
  for (const [x, y] of [
    [5, 0],
    [0, 3],
    [9, 4],
    [4, 6],
    [10, 8],
  ] as const)
    p.stamp(CELL5, x, y);
  return p;
}

/** The colony on the 24 grid. */
function colony24(): Px {
  return COLONY24.clone();
}

/** Grid size of the adaptive foreground (108 dp at 2 dp per cell). */
export const FOREGROUND_GRID = 54;
/** The safe circle's radius on the foreground grid: 66/108 of the width, halved. */
export const SAFE_RADIUS = (FOREGROUND_GRID * 66) / 108 / 2;
/** Grid size of the legacy icons (48 px at mdpi = 24 × 2). */
export const LEGACY_GRID = 24;

/** The adaptive-icon foreground (transparent outside the dish), 54 × 54. */
export function iconForeground(): Px {
  return drawDish(FOREGROUND_GRID, SAFE_RADIUS - 0.25, 2, colony54(), [21, 21], [
    [20, 19],
    [33, 17],
    [17, 31],
    [23, 36],
    [36, 34],
  ]);
}

/** The legacy launcher icon, 24 × 24: 'square' fills the background; 'round' is a disc on transparency. */
export function iconLegacy(shape: 'square' | 'round'): Px {
  const dish = drawDish(LEGACY_GRID, 10.5, 1, colony24(), [9, 9], [
    [8, 8],
    [15, 8],
  ]);
  const p = new Px(LEGACY_GRID, LEGACY_GRID);
  const c = LEGACY_GRID / 2;
  for (let y = 0; y < LEGACY_GRID; y++) for (let x = 0; x < LEGACY_GRID; x++) if (shape === 'square' || farCorner(x, y, c) <= c) p.set(x, y, 1);
  return p.stamp(dish, 0, 0);
}

/** The foreground over its background layer, 54 × 54 (the splash and the maskable web icon). */
export function iconComposite(): Px {
  const p = new Px(FOREGROUND_GRID, FOREGROUND_GRID);
  p.data.fill(1);
  return p.stamp(iconForeground(), 0, 0);
}
