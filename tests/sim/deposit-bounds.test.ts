/**
 * Food deposits are bounded like Lab habitat edits (wave B fix round 2 follow-up): a crafted, damaged
 * or replayed deposit stroke with an unbounded path, too many points, a non-finite point or an
 * impossible radius is refused whole, quickly, and places nothing; ordinary strokes (the UI's 1/3/6
 * brushes and the recipes' radius-0 trails) still place food exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { applyNow, invalidDepositStroke } from '../../src/sim/commands';
import { realizeRecipe } from '../../src/sim/recipes';
import { LAB_MAX_POINTS } from '../../src/sim/structures';
import { registry } from '../helpers/world';

function garden() {
  return realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'deposit-bounds', seed: 104729 });
}

describe('deposit stroke bounds', () => {
  it('refuses a crafted alternating stroke quickly and places nothing', () => {
    const w = garden();
    const sugar = () => Array.from(w.fields.sugar!).reduce((a, b) => a + b, 0);
    const before = { sugar: sugar(), inputs: JSON.stringify(w.ledger.inputs) };
    const points: [number, number][] = [];
    for (let k = 0; k < 20_000; k++) points.push(k % 2 === 0 ? [1.5, 64.5] : [126.5, 64.5]);
    const t0 = performance.now();
    const cmd = applyNow(w, 'crafted', { kind: 'deposit', materialId: 'SUGAR', points, radius: 6, dose: 1 });
    const ms = performance.now() - t0;
    expect(cmd.result).toMatchObject({ accepted: 0, rejected: 0, note: 'stroke too long' });
    expect(ms).toBeLessThan(500);
    // The refused command is logged like any refused command, but no material moves or enters.
    expect({ sugar: sugar(), inputs: JSON.stringify(w.ledger.inputs) }).toEqual(before);
  });

  it('refuses malformed strokes whole', () => {
    expect(invalidDepositStroke([[10.5, 10.5]], 7)).toBe('invalid radius');
    expect(invalidDepositStroke([[10.5, 10.5]], -1)).toBe('invalid radius');
    expect(invalidDepositStroke([[10.5, 10.5]], Number.NaN)).toBe('invalid radius');
    expect(invalidDepositStroke([], 3)).toBe('empty stroke');
    expect(invalidDepositStroke([[Number.POSITIVE_INFINITY, 3]], 3)).toBe('invalid point');
    expect(invalidDepositStroke([[500, 3]], 3)).toBe('point outside the dish area');
    expect(invalidDepositStroke(Array.from({ length: LAB_MAX_POINTS + 1 }, () => [64.5, 64.5]), 3)).toBe('stroke too long');
  });

  it('accepts the strokes the app and recipes send', () => {
    for (const r of [0, 1, 3, 6]) expect(invalidDepositStroke([[20.5, 64.5], [100.5, 64.5]], r)).toBeNull();
    const w = garden();
    const cmd = applyNow(w, 'ok', { kind: 'deposit', materialId: 'SUGAR', points: [[40.5, 64.5], [60.5, 64.5]], radius: 3, dose: 1 });
    expect(cmd.result?.accepted ?? 0).toBeGreaterThan(0);
  });
});
