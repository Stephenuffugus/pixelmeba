/**
 * Renderer budgets and the degrade ladder (P4.13; SPEC §16 "Under load reduce particles, label frequency,
 * overlay refresh, snapshot frequency and aggregation detail first; never skip ticks, change the
 * timestep, alter mutation odds or delete life"; ARCH §13 "overlay texture refresh ≤ 10 Hz, aggregation
 * refresh ≤ 10 Hz"; CLAUDE.md "Reduce cosmetics before touching biology").
 *
 * Cosmetic only, renderer only: nothing here reaches the worker (the renderer imports no worker client,
 * ARCH §3), so the dish's ticks, snapshots and results are the same at every level. The snapshot rate is
 * not on the ladder in v1.0: the ladder stops at the renderer (PROPOSED DECISION in perf-rc1.md).
 *
 * Levels (each includes the ones before):
 *   0  normal: the caps below.
 *   1  transient effects capped at EFFECTS_MAX_DEGRADED; no food-object stains.
 *   2  family / favourite markers and labels redraw at 2 Hz.
 *   3  overlay and aggregation textures refresh at 2 Hz.
 * A frame-time moving average drives it with hysteresis: one level down after the average has stayed
 * over FRAME_BUDGET_MS for DEGRADE_AFTER_MS, one level back after it has stayed under
 * RECOVER_BELOW × FRAME_BUDGET_MS for RECOVER_AFTER_MS.
 */

/** Transient ring effects (placement ring, split flash) alive at once (the P1 cap). */
export const EFFECTS_MAX = 64;
/** Level ≥ 1. */
export const EFFECTS_MAX_DEGRADED = 16;
/** Food-object stains fading at once (the P3 cap); level ≥ 1 draws none. */
export const STAINS_MAX = 128;
/** Death dissolves and fading fungal tiles at once (new in P4.13: a mass die-off no longer grows the list without bound). */
export const GHOSTS_MAX = 1024;
/** Marker and label redraw interval at levels 0–1 (every frame) and ≥ 2 (2 Hz). */
export const MARKER_REDRAW_MS = 0;
export const MARKER_REDRAW_MS_DEGRADED = 500;
/** Overlay and aggregation texture refresh: ≤ 10 Hz normally (ARCH §13), 2 Hz at level 3. */
export const OVERLAY_REFRESH_MS = 100;
export const AGGREGATION_REFRESH_MS = 100;
export const TEXTURE_REFRESH_MS_DEGRADED = 500;

/** The frame budget the ladder defends: 30 fps (UX: 30 fps on a mid-range phone). */
export const FRAME_BUDGET_MS = 1000 / 30;
export const DEGRADE_AFTER_MS = 2000;
export const RECOVER_AFTER_MS = 5000;
/** Hysteresis: recovery needs the average this far under the budget. */
export const RECOVER_BELOW = 0.8;
/** Moving-average weight of a new frame. */
export const FRAME_EMA_WEIGHT = 0.1;
/** A single frame longer than this (a background tab, a GC pause) counts as this long. */
export const FRAME_MS_CLAMP = 250;
export const LADDER_MAX = 3;

export type BudgetLevel = 0 | 1 | 2 | 3;

/** What each level allows. */
export interface Budget {
  readonly effectsMax: number;
  readonly stains: boolean;
  readonly markerRedrawMs: number;
  readonly overlayRefreshMs: number;
  readonly aggregationRefreshMs: number;
}

export function budgetFor(level: BudgetLevel): Budget {
  return {
    effectsMax: level >= 1 ? EFFECTS_MAX_DEGRADED : EFFECTS_MAX,
    stains: level < 1,
    markerRedrawMs: level >= 2 ? MARKER_REDRAW_MS_DEGRADED : MARKER_REDRAW_MS,
    overlayRefreshMs: level >= 3 ? TEXTURE_REFRESH_MS_DEGRADED : OVERLAY_REFRESH_MS,
    aggregationRefreshMs: level >= 3 ? TEXTURE_REFRESH_MS_DEGRADED : AGGREGATION_REFRESH_MS,
  };
}

/** Whether something last refreshed at `last` (ms) is due again at `now` under `intervalMs`. */
export function refreshDue(last: number, now: number, intervalMs: number): boolean {
  return intervalMs <= 0 || now - last >= intervalMs;
}

/** The degrade ladder: feed it every frame's time; it moves one level at a time. */
export class BudgetLadder {
  level: BudgetLevel = 0;
  /** Frame-time moving average, ms (NaN until the first frame). */
  avgMs = Number.NaN;
  /** Highest level reached since the last reset (perf-rc1.md records it). */
  maxLevel: BudgetLevel = 0;
  private overSince: number | null = null;
  private underSince: number | null = null;

  /** One rendered frame of `frameMs` at time `now`; returns the level to use. */
  update(frameMs: number, now: number): BudgetLevel {
    const f = Math.min(FRAME_MS_CLAMP, Math.max(0, frameMs));
    this.avgMs = Number.isNaN(this.avgMs) ? f : this.avgMs + FRAME_EMA_WEIGHT * (f - this.avgMs);
    if (this.avgMs > FRAME_BUDGET_MS) {
      this.underSince = null;
      this.overSince ??= now;
      if (now - this.overSince >= DEGRADE_AFTER_MS && this.level < LADDER_MAX) {
        this.level = (this.level + 1) as BudgetLevel;
        this.overSince = now; // the next step needs another full stretch over budget
        if (this.level > this.maxLevel) this.maxLevel = this.level;
      }
    } else if (this.avgMs <= FRAME_BUDGET_MS * RECOVER_BELOW) {
      this.overSince = null;
      this.underSince ??= now;
      if (now - this.underSince >= RECOVER_AFTER_MS && this.level > 0) {
        this.level = (this.level - 1) as BudgetLevel;
        this.underSince = now;
      }
    } else {
      // In the hysteresis band: neither streak continues.
      this.overSince = null;
      this.underSince = null;
    }
    return this.level;
  }

  reset(): void {
    this.level = 0;
    this.maxLevel = 0;
    this.avgMs = Number.NaN;
    this.overSince = null;
    this.underSince = null;
  }
}
