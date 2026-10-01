/**
 * Screen-to-cell mapping for taps on the dish (G2 comprehension B1). A world point maps to the cell
 * that contains it only when that cell lies inside the dish (the circular mask of SPEC §2.1); a point
 * beyond the grid or outside the rim maps to null, so a tap there never describes another cell.
 */
import { GRID_W } from '@sim/constants';
import { cellIndex, inBounds, inMask } from '@sim/grid';

/** The dish cell under a world point (cell (x, y) spans [x, x+1) × [y, y+1)), or null outside the dish. */
export function dishCellAt(wx: number, wy: number): number | null {
  if (!Number.isFinite(wx) || !Number.isFinite(wy)) return null;
  const x = Math.floor(wx);
  const y = Math.floor(wy);
  if (!inBounds(x, y) || !inMask(x, y)) return null;
  return cellIndex(x, y);
}

/** Column and row of a cell index (for tests and labels). */
export function cellXY(cell: number): readonly [number, number] {
  return [cell % GRID_W, Math.floor(cell / GRID_W)];
}
