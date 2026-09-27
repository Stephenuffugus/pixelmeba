/** Renderer layer helpers (cosmetic only; never simulation state). */
import { describe, expect, it } from 'vitest';
import { cosmetic, DISH_PX_PER_CELL, paintDeposits, repaintDepositCells } from '../../src/render/layers';
import { CELL_COUNT, GRID_W } from '../../src/sim/constants';

const W = GRID_W * DISH_PX_PER_CELL;
const image = () => ({ width: W, height: W, data: new Uint8ClampedArray(W * W * 4) }) as unknown as ImageData;

describe('render layers', () => {
  it('cosmetic noise is uniform in [0, 1) (it was signed, so half of all values were negative)', () => {
    const N = 100_000;
    let below = 0;
    for (let j = 0; j < N; j++) {
      const r = cosmetic(j, 23);
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThan(1);
      if (r < 0.05) below++;
    }
    expect(below / N).toBeCloseTo(0.05, 2);
  });

  it('the incremental deposit repaint is byte-identical to a full paint, including catalysis dust', () => {
    const bands = new Uint8Array(6 * CELL_COUNT);
    const prev = new Uint8Array(6 * CELL_COUNT);
    const inc = image();
    const rect = { x: 0, y: 0, w: 0, h: 0 };
    for (let round = 0; round < 20; round++) {
      for (let k = 0; k < 400; k++) {
        const i = Math.floor(cosmetic(round * 1000 + k, 7) * CELL_COUNT);
        const band = Math.floor(cosmetic(round * 1000 + k, 11) * 6);
        bands[band * CELL_COUNT + i] = Math.floor(cosmetic(round * 1000 + k, 29) * 256);
      }
      repaintDepositCells(inc, bands, prev, rect);
      const full = image();
      paintDeposits(full, bands);
      expect(Buffer.from(inc.data.buffer).equals(Buffer.from(full.data.buffer))).toBe(true);
    }
  });
});
