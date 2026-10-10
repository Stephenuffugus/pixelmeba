/**
 * World-cue rate limiter (UX §8.1, CT §12.10 "sound cues ≤ 4/s"; P3.10). Pure logic with an injected
 * clock, so it is unit-tested without a browser.
 *
 *   • World cues (division, wake, discovery) share one budget: at most `maxPerWindow` plays in any
 *     rolling `windowMs` (4 per second).
 *   • A repeat of a world cue within that cue's coalescing gap (`coalesceOf(id)`, default `coalesceMs`)
 *     of its last play joins it: no new sound, the play's `count` grows ("coalesce repeats"). The game
 *     gives `division` a 5 s gap (src/audio/patches.ts WORLD_CUE_COALESCE_MS), so a growing dish is
 *     never a click track and division takes at most one slot of any second's budget (fix 1, W5-20).
 *   • When the budget is spent, a request joins its cue's most recent play inside the rolling window if
 *     there is one; otherwise it is not played and is counted in `suppressed`. Every request is
 *     accounted for: the sum of the play counts plus `suppressed` equals the requests made.
 *   • UI cues (one player action each) bypass the limiter and never use the budget.
 *
 * Silence never removes meaning: every cue has a visible equivalent (src/audio/cues.ts header).
 */

export interface CuePlay {
  readonly id: string;
  /** Clock time of the play (ms). */
  readonly at: number;
  /** Requests this one play stands for (1 + repeats that joined it). */
  count: number;
}

export type CueDecision =
  | { readonly play: true; readonly entry: CuePlay }
  | { readonly play: false; readonly joined: CuePlay | null };

export interface RateLimiterOptions {
  readonly now: () => number;
  readonly isWorld: (id: string) => boolean;
  readonly maxPerWindow?: number;
  readonly windowMs?: number;
  readonly coalesceMs?: number;
  /** Per-cue coalescing gap in ms (falls back to `coalesceMs`). */
  readonly coalesceOf?: (id: string) => number | undefined;
}

/** CT §12.10: sound cues ≤ 4 per second. */
export const WORLD_CUES_PER_SECOND = 4;
export const WINDOW_MS = 1000;
/** Repeats of one world cue this close to its last play are the same sound. */
export const COALESCE_MS = 250;

export class CueRateLimiter {
  private readonly now: () => number;
  private readonly isWorld: (id: string) => boolean;
  readonly maxPerWindow: number;
  readonly windowMs: number;
  readonly coalesceMs: number;
  private readonly coalesceOf: (id: string) => number | undefined;
  /** World plays still inside the rolling window, oldest first. */
  private recent: CuePlay[] = [];
  /** The last world play of each cue id (one entry per cue id, replaced by its next play). */
  private readonly lastOf = new Map<string, CuePlay>();
  /** World requests neither played nor joined to a play (budget spent, nothing to join). */
  suppressed = 0;

  constructor(opts: RateLimiterOptions) {
    this.now = opts.now;
    this.isWorld = opts.isWorld;
    this.maxPerWindow = opts.maxPerWindow ?? WORLD_CUES_PER_SECOND;
    this.windowMs = opts.windowMs ?? WINDOW_MS;
    this.coalesceMs = opts.coalesceMs ?? COALESCE_MS;
    this.coalesceOf = opts.coalesceOf ?? (() => undefined);
  }

  /** Ask to play cue `id`, standing for `count` happenings (e.g. 3 births in one snapshot). */
  request(id: string, count = 1): CueDecision {
    const t = this.now();
    if (!this.isWorld(id)) return { play: true, entry: { id, at: t, count } };
    this.expire(t);
    const last = this.lastOf.get(id);
    if (last && t - last.at < (this.coalesceOf(id) ?? this.coalesceMs)) {
      last.count += count;
      return { play: false, joined: last };
    }
    if (this.recent.length < this.maxPerWindow) {
      const entry: CuePlay = { id, at: t, count };
      this.recent.push(entry);
      this.lastOf.set(id, entry);
      return { play: true, entry };
    }
    if (last && t - last.at < this.windowMs) {
      last.count += count;
      return { play: false, joined: last };
    }
    this.suppressed += count;
    return { play: false, joined: null };
  }

  /** World plays inside the rolling window ending now. */
  playsInWindow(): readonly CuePlay[] {
    this.expire(this.now());
    return this.recent;
  }

  private expire(t: number): void {
    while (this.recent.length > 0 && t - this.recent[0]!.at >= this.windowMs) {
      this.recent.shift();
    }
  }
}
