/**
 * P4.13 renderer budgets and the degrade ladder (src/render/budgets.ts; SPEC §16 "reduce particles, label
 * frequency, overlay refresh … first"; ARCH §13 overlay/aggregation refresh ≤ 10 Hz). Cosmetic only: the
 * ladder lives in the renderer, which imports no worker client (checked here on the source).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  AGGREGATION_REFRESH_MS,
  BudgetLadder,
  budgetFor,
  DEGRADE_AFTER_MS,
  EFFECTS_MAX,
  EFFECTS_MAX_DEGRADED,
  FRAME_BUDGET_MS,
  OVERLAY_REFRESH_MS,
  RECOVER_AFTER_MS,
  refreshDue,
} from '../../src/render/budgets';

/** Feed `ms`-long frames for `forMs` of wall time starting at `t`; returns the time reached. */
function frames(l: BudgetLadder, ms: number, t: number, forMs: number): number {
  const end = t + forMs;
  while (t < end) {
    t += ms;
    l.update(ms, t);
  }
  return t;
}

describe('budgets (P4.13)', () => {
  it('what each level allows', () => {
    expect(budgetFor(0)).toEqual({ effectsMax: EFFECTS_MAX, stains: true, markerRedrawMs: 0, overlayRefreshMs: OVERLAY_REFRESH_MS, aggregationRefreshMs: AGGREGATION_REFRESH_MS });
    expect(EFFECTS_MAX).toBe(64);
    expect(OVERLAY_REFRESH_MS).toBeGreaterThanOrEqual(100); // ≤ 10 Hz (ARCH §13)
    expect(AGGREGATION_REFRESH_MS).toBeGreaterThanOrEqual(100);
    expect(budgetFor(1)).toMatchObject({ effectsMax: EFFECTS_MAX_DEGRADED, stains: false, markerRedrawMs: 0, overlayRefreshMs: 100 });
    expect(budgetFor(2)).toMatchObject({ effectsMax: 16, stains: false, markerRedrawMs: 500, overlayRefreshMs: 100 });
    expect(budgetFor(3)).toMatchObject({ effectsMax: 16, stains: false, markerRedrawMs: 500, overlayRefreshMs: 500, aggregationRefreshMs: 500 });
    expect(refreshDue(0, 99, 100)).toBe(false);
    expect(refreshDue(0, 100, 100)).toBe(true);
    expect(refreshDue(1e9, 0, 0)).toBe(true);
  });

  it('steps down one level per 2 s over budget, up to 3, and recovers one level per 5 s under budget', () => {
    const l = new BudgetLadder();
    let t = frames(l, 16, 0, 10_000);
    expect(l.level).toBe(0);
    // 10 fps: the average climbs past the 30 fps budget within a few frames, then one level per 2 s.
    t = frames(l, 100, t, DEGRADE_AFTER_MS + 1000);
    expect(l.level).toBe(1);
    t = frames(l, 100, t, DEGRADE_AFTER_MS);
    expect(l.level).toBe(2);
    t = frames(l, 100, t, 10_000);
    expect(l.level).toBe(3);
    expect(l.maxLevel).toBe(3);
    // Back to 60 fps: not before 5 s, then one level per 5 s.
    t = frames(l, 16, t, RECOVER_AFTER_MS - 1000);
    expect(l.level).toBe(3);
    t = frames(l, 16, t, 2000);
    expect(l.level).toBe(2);
    t = frames(l, 16, t, RECOVER_AFTER_MS);
    expect(l.level).toBe(1);
    frames(l, 16, t, RECOVER_AFTER_MS);
    expect(l.level).toBe(0);
    expect(l.maxLevel).toBe(3);
  });

  it('hysteresis: frames between 0.8 and 1 × the budget neither degrade nor recover; one long frame is clamped', () => {
    const l = new BudgetLadder();
    let t = frames(l, 100, 0, DEGRADE_AFTER_MS + 1000);
    expect(l.level).toBe(1);
    frames(l, FRAME_BUDGET_MS * 0.9, t, 30_000);
    expect(l.level).toBe(1);
    const m = new BudgetLadder();
    t = frames(m, 16, 0, 2000);
    m.update(60_000, t + 60_000); // back from a hidden tab
    expect(m.avgMs).toBeLessThan(50);
    expect(m.level).toBe(0);
  });

  it('the renderer imports no worker client (ARCH §3); the ladder never reaches the worker', () => {
    for (const f of ['src/render/budgets.ts', 'src/render/renderer.ts', 'src/render/camera.ts']) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/from '@worker\/client'|from '\.\.\/worker\/client'|SimClient|getClient/);
    }
  });
});
