/**
 * G2 comprehension B1: a tap outside the dish never reaches the cell inspector. The screen-to-cell
 * mapping (camera screenToWorld, then dishCellAt) rejects points beyond the grid and beyond the rim and
 * maps rim points to the cell actually under them; the worker's cell payload for every mapped cell has
 * the measured values the cell panel formats.
 */
import { describe, expect, it } from 'vitest';
import { Camera } from '../../src/render/camera';
import { GRID_H, GRID_W, MASK_CX, MASK_CY, MASK_R } from '../../src/sim/constants';
import { inMask, maskCells } from '../../src/sim/grid';
import { realizeRecipe } from '../../src/sim/recipes';
import { buildInspector } from '../../src/worker/snapshot';
import { cellXY, dishCellAt } from '../../src/ui/dishPoint';
import { registry } from '../helpers/world';

describe('dishCellAt: world point → dish cell', () => {
  it('maps a point to the cell that contains it', () => {
    expect(dishCellAt(64.2, 64.9)).toBe(64 * GRID_W + 64);
    expect(cellXY(dishCellAt(10.5, 63.5)!)).toEqual([10, 63]);
  });

  it('rejects points beyond the grid instead of wrapping to another row (the cause of B1)', () => {
    // Left of the grid: floor(-0.5) = -1 used to give the last cell of the row above.
    for (const [x, y] of [
      [-0.5, 58.5],
      [-30, 64],
      [GRID_W + 0.1, 64],
      [64, -0.01],
      [64, GRID_H],
      [200, 300],
      [Number.NaN, 4],
      [Number.POSITIVE_INFINITY, 64],
    ] as const) {
      expect(dishCellAt(x, y), `(${x}, ${y})`).toBeNull();
    }
  });

  it('rejects the dark corners inside the grid but outside the rim', () => {
    for (const [x, y] of [
      [0.5, 0.5],
      [127.5, 127.5],
      [119.5, 117.5],
      [3.5, 124.5],
    ] as const) {
      expect(dishCellAt(x, y), `(${x}, ${y})`).toBeNull();
    }
  });

  it('maps every cell of the mask, rim cells included, and nothing else', () => {
    const inside = new Set(maskCells());
    let mapped = 0;
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const c = dishCellAt(x + 0.5, y + 0.5);
        if (inside.has(y * GRID_W + x)) {
          expect(c).toBe(y * GRID_W + x);
          mapped++;
        } else expect(c).toBeNull();
      }
    }
    expect(mapped).toBe(inside.size);
    // Rim cells: the outermost mask cell on each axis maps to itself; one step further out is outside.
    const xs = [...Array(GRID_W).keys()].filter((x) => inMask(x, Math.round(MASK_CY)));
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const row = Math.round(MASK_CY);
    expect(cellXY(dishCellAt(left + 0.01, row + 0.5)!)).toEqual([left, row]);
    expect(cellXY(dishCellAt(right + 0.99, row + 0.5)!)).toEqual([right, row]);
    expect(dishCellAt(left - 0.01, row + 0.5)).toBeNull();
    expect(dishCellAt(right + 1.01, row + 0.5)).toBeNull();
    expect(MASK_R).toBeGreaterThan(0);
    expect(MASK_CX).toBe(MASK_CY);
  });
});

describe('screen → dish cell through the camera', () => {
  /** A phone in portrait: the dish fills the width, a dark band lies below it. */
  const cam = new Camera();
  cam.setViewport(360, 640);
  cam.fit();
  const at = (sx: number, sy: number) => dishCellAt(...cam.screenToWorld(sx, sy));

  it('the dark area below and beside the dish maps to no cell', () => {
    for (const [sx, sy] of [
      [180, 630], // the band below the dish
      [5, 320], // left edge at the dish's middle row: just outside the rim
      [355, 320],
      [5, 5],
      [355, 635],
    ] as const) {
      expect(at(sx, sy), `screen (${sx}, ${sy})`).toBeNull();
    }
  });

  it('the dish centre and points just inside the rim map to the cell under them', () => {
    const centre = at(180, 320)!;
    expect(cellXY(centre)).toEqual([64, 64]);
    const [sx, sy] = cam.worldToScreen(MASK_CX - MASK_R + 0.5, MASK_CY + 0.5); // leftmost rim cell centre
    const rim = at(sx, sy);
    expect(rim).not.toBeNull();
    expect(inMask(...cellXY(rim!))).toBe(true);
  });

  it('after zooming out, a tap far beyond the dish still maps to no cell', () => {
    const z = new Camera();
    z.setViewport(1440, 900);
    z.fit();
    z.zoomAt(720, 450, 0.5);
    expect(dishCellAt(...z.screenToWorld(30, 450))).toBeNull();
    expect(dishCellAt(...z.screenToWorld(720, 890))).toBeNull();
  });
});

describe('the cell payload of every mapped cell has the values the panel formats', () => {
  it('pH, light, fields and residents are present and finite for rim and centre cells', () => {
    const world = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'dish-point', seed: 104729 });
    const cells = maskCells();
    for (const cell of [cells[0]!, cells[cells.length - 1]!, dishCellAt(64.5, 64.5)!, dishCellAt(MASK_CX - MASK_R + 0.5, MASK_CY + 0.5)!]) {
      const p = buildInspector(world, { kind: 'cell', cell });
      expect(p.kind).toBe('cell');
      expect(Number.isFinite(p.cell!.ph)).toBe(true);
      expect(Number.isFinite(p.cell!.light)).toBe(true);
      expect(Array.isArray(p.cell!.residents)).toBe(true);
      for (const v of Object.values(p.cell!.fields)) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
