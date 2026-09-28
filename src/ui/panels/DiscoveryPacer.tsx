/**
 * Pacing of discovery cards (UX §5.5, CT §12.10 "notifications ≤ 1 per 60 s"; P2.3). Pure logic with
 * an injected clock and timer, so it is unit-tested without a browser:
 *   • discoveries arriving within 1.5 s of the first one make one card ("one card per burst");
 *   • a new card opens at most once per 60 s; later discoveries wait and join the next card;
 *   • while a card is open, new discoveries join it after a short delay (no second card);
 *   • a card dismissed while discoveries wait never lets the next card open before the 60 s gap.
 * UI timing only: it never touches the simulation (timers pace notices, nothing else).
 */

/** Discoveries arriving within this window after the first make one notice ("one per burst"). */
export const DISCOVERY_BURST_MS = 1500;
/** At most one new notice per 60 s (CT §12.10); later discoveries wait and join the next card. */
export const DISCOVERY_GAP_MS = 60_000;
/** An open card takes in later discoveries after this short delay. */
export const DISCOVERY_JOIN_MS = 200;

export interface DiscoveryPacerEnv {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Whether a discovery card is open now (new discoveries join it). */
  cardOpen(): boolean;
  /** Show these branch ids (ascending): on the open card, or on a new card when `newCard`. */
  deliver(ids: readonly number[], newCard: boolean): void;
}

export class DiscoveryPacer {
  private pending: number[] = [];
  private timer: unknown = null;
  private lastShownAt = -Infinity;

  constructor(private readonly env: DiscoveryPacerEnv) {}

  /** Branch ids waiting for a card. */
  get waiting(): readonly number[] {
    return this.pending;
  }

  /** Newly named branches (ids from a snapshot's branch count). */
  discovered(ids: readonly number[]): void {
    for (const b of ids) if (!this.pending.includes(b)) this.pending.push(b);
    this.schedule();
  }

  /** The open card was dismissed: waiting discoveries get the next card, after the gap. */
  dismissed(): void {
    this.schedule();
  }

  /** Undo rewound the dish to `count` branches: later ids no longer exist. */
  rewound(count: number): void {
    this.pending = this.pending.filter((b) => b < count);
    if (this.pending.length === 0) this.cancel();
  }

  /** Another dish is open: nothing waits any more (the one-per-minute limit still holds). */
  reset(): void {
    this.pending = [];
    this.cancel();
  }

  private cancel(): void {
    if (this.timer !== null) this.env.clearTimer(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.pending.length === 0 || this.timer !== null) return;
    const wait = this.env.cardOpen() ? DISCOVERY_JOIN_MS : Math.max(DISCOVERY_BURST_MS, this.lastShownAt + DISCOVERY_GAP_MS - this.env.now());
    this.timer = this.env.setTimer(() => this.fire(), wait);
  }

  private fire(): void {
    this.timer = null;
    if (this.pending.length === 0) return;
    const open = this.env.cardOpen();
    // The card closed while these waited to join it: a new card still respects the gap.
    if (!open && this.env.now() < this.lastShownAt + DISCOVERY_GAP_MS) {
      this.schedule();
      return;
    }
    const ids = [...this.pending].sort((a, b) => a - b);
    this.pending = [];
    if (!open) this.lastShownAt = this.env.now();
    this.env.deliver(ids, !open);
  }
}
