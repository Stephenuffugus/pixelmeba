import { describe, expect, it } from 'vitest';
import { cellIndex, maskCells, ST_WALL, SUB_GEL, SUB_SEDIMENT } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { stageEnvironment, updateDerived } from '../../src/sim/transport';
import { clearWater } from '../helpers/world';

function sumField(arr: Float64Array): number {
  let s = 0;
  const cells = maskCells();
  for (let k = 0; k < cells.length; k++) s += arr[cells[k]!]!;
  return s;
}

describe('stage 2 transport (P0.4)', () => {
  it('a pulse spreads symmetrically without creating or destroying quantity', () => {
    const w = clearWater();
    w.settings.lid = 'closed';
    const sugar = w.fields.sugar!;
    const center = cellIndex(64, 64);
    sugar[center] = 10;
    const before = sumField(sugar);
    for (let t = 0; t < 200; t++) stageEnvironment(w);
    expect(Math.abs(sumField(sugar) - before) / before).toBeLessThan(1e-12);
    expect(sugar[center]).toBeLessThan(10);
    expect(sugar[cellIndex(65, 64)]).toBeCloseTo(sugar[cellIndex(63, 64)]!, 12);
    expect(sugar[cellIndex(64, 65)]).toBeCloseTo(sugar[cellIndex(64, 63)]!, 12);
    for (const k of maskCells()) expect(sugar[k]).toBeGreaterThanOrEqual(0);
  });

  it('walls block transport completely', () => {
    const w = clearWater();
    w.settings.lid = 'closed';
    // Vertical wall at x = 64 across the whole dish.
    for (let y = 0; y < 128; y++) w.grid.structure[cellIndex(64, y)] = ST_WALL;
    w.grid.geometryVersion++;
    w.fields.sugar!.fill(0);
    w.fields.sugar![cellIndex(60, 64)] = 5;
    for (let t = 0; t < 500; t++) stageEnvironment(w);
    let right = 0;
    for (const k of maskCells()) if (k % 128 > 64) right += w.fields.sugar![k]!;
    expect(right).toBe(0);
  });

  it('uses the lower coefficient across a habitat boundary', () => {
    const w = clearWater();
    w.settings.lid = 'closed';
    const a = cellIndex(64, 64);
    const b = cellIndex(65, 64);
    w.grid.substrate[b] = SUB_GEL;
    w.grid.geometryVersion++;
    w.fields.salt!.fill(0);
    w.fields.salt![a] = 1;
    stageEnvironment(w);
    // Water→gel edge uses 0.025; water→water edges use 0.10.
    expect(w.fields.salt![b]).toBeCloseTo(0.025, 12);
    expect(w.fields.salt![cellIndex(63, 64)]).toBeCloseTo(0.1, 12);
  });

  it('open-lid gas exchange relaxes toward 0.8 O2 / 0.5 CO2 and is ledgered as carbon exchange', () => {
    const w = clearWater();
    const cells = maskCells();
    for (const k of cells) {
      w.fields.oxygen![k] = 0.2;
      w.fields.co2![k] = 0.1;
    }
    const sed = cellIndex(64, 64);
    w.grid.substrate[sed] = SUB_SEDIMENT;
    w.grid.geometryVersion++;
    const before = computeTotals(w).c;
    w.ledger.initial.c = before;
    w.ledger.inputs = { c: 0, n: 0, m: 0 };
    stageEnvironment(w);
    expect(w.ledger.exchangeC).toBeGreaterThan(0);
    expect(checkLedger(w).ok).toBe(true);
    // Uniform open-water cell far from the sediment cell: exactly 0.02 of the difference.
    expect(w.fields.oxygen![cellIndex(30, 64)]).toBeCloseTo(0.2 + 0.02 * 0.6, 12);
  });

  it('closed lid exchanges nothing', () => {
    const w = clearWater();
    w.settings.lid = 'closed';
    w.fields.oxygen!.fill(0.2);
    stageEnvironment(w);
    expect(w.ledger.exchangeC).toBe(0);
    expect(w.fields.oxygen![cellIndex(64, 64)]).toBeCloseTo(0.2, 12);
  });

  it('computes pH = clamp(7 + (base − acid)/(1 + buffer), 2, 12) and neutralizes equal equivalents', () => {
    const w = clearWater();
    const i = cellIndex(64, 64);
    w.fields.base![i] = 3;
    w.fields.buffer![i] = 1;
    updateDerived(w);
    expect(w.derived.ph[i]).toBeCloseTo(8.5, 12);
    w.fields.acid![i] = 100;
    w.fields.base![i] = 0;
    w.fields.buffer![i] = 0;
    updateDerived(w);
    expect(w.derived.ph[i]).toBe(2);
    w.fields.acid![i] = 0.3;
    w.fields.base![i] = 0.5;
    w.settings.lid = 'closed';
    stageEnvironment(w);
    // Neutralization happens after diffusion; the cell keeps only excess base (some diffused away).
    expect(w.fields.acid![i]).toBe(0);
    expect(w.fields.base![i]).toBeGreaterThan(0);
  });
});
