/**
 * Pacing of discovery cards (UX §5.5, CT §12.10 "notifications ≤ 1 per 60 s"; P2.3). Pure logic with
 * an injected clock and timer, so it is unit-tested without a browser:
 *   • discoveries arriving within 1.5 s of the first one make one card ("one card per burst");
 *   • a new card opens at most once per 60 s; later discoveries wait and join the next card;
 *   • while a card is open, new discoveries join it after a short delay (no second card);
 *   • a card dismissed while discoveries wait never lets the next card open before the 60 s gap;
 *   • discoveries wait until a card really shows them: a delivery that shows nothing (the lineage
 *     answer failed or had no rows, or the dish changed meanwhile) keeps them waiting, does not start
 *     the 60 s gap, and is tried again after DISCOVERY_RETRY_MS; another dish drops only its own.
 * UI timing only: it never touches the simulation (timers pace notices, nothing else).
 */

/** Discoveries arriving within this window after the first make one notice ("one per burst"). */
export const DISCOVERY_BURST_MS = 1500;
/** At most one new notice per 60 s (CT §12.10); later discoveries wait and join the next card. */
export const DISCOVERY_GAP_MS = 60_000;
/** An open card takes in later discoveries after this short delay. */
export const DISCOVERY_JOIN_MS = 200;
/** A delivery that showed nothing is tried again after this delay (the discoveries keep waiting). */
export const DISCOVERY_RETRY_MS = 5000;

export interface DiscoveryPacerEnv {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Whether a discovery card is open now (new discoveries join it). */
  cardOpen(): boolean;
  /**
   * Show these branch ids (ascending): on the open card, or on a new card when `newCard`. Returns (or
   * resolves to) the ids a card really shows now; anything else keeps waiting. A rejection shows none.
   */
  deliver(ids: readonly number[], newCard: boolean): readonly number[] | PromiseLike<readonly number[]>;
}

function isPromiseLike<T>(v: T | PromiseLike<T>): v is PromiseLike<T> {
  return typeof (v as { then?: unknown } | null)?.then === 'function';
}

export class DiscoveryPacer {
  private pending: number[] = [];
  private timer: unknown = null;
  private lastShownAt = -Infinity;
  /** A delivery is waiting for its answer (no second one starts meanwhile). */
  private inFlight = false;
  /** The last delivery showed nothing: the next try waits DISCOVERY_RETRY_MS. */
  private retry = false;
  /** Bumped by reset(): an answer for the previous dish changes nothing here. */
  private epoch = 0;

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

  /**
   * Another dish is open: the previous dish's discoveries no longer wait, and a delivery still in
   * flight for it changes nothing (the one-per-minute limit still holds for cards really shown).
   */
  reset(): void {
    this.epoch++;
    this.pending = [];
    this.inFlight = false;
    this.retry = false;
    this.cancel();
  }

  private cancel(): void {
    if (this.timer !== null) this.env.clearTimer(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.pending.length === 0 || this.timer !== null || this.inFlight) return;
    const paced = this.env.cardOpen() ? DISCOVERY_JOIN_MS : Math.max(DISCOVERY_BURST_MS, this.lastShownAt + DISCOVERY_GAP_MS - this.env.now());
    const wait = this.retry ? Math.max(DISCOVERY_RETRY_MS, paced) : paced;
    this.timer = this.env.setTimer(() => this.fire(), wait);
  }

  private fire(): void {
    this.timer = null;
    if (this.pending.length === 0 || this.inFlight) return;
    const open = this.env.cardOpen();
    // The card closed while these waited to join it: a new card still respects the gap.
    if (!open && this.env.now() < this.lastShownAt + DISCOVERY_GAP_MS) {
      this.schedule();
      return;
    }
    const ids = [...this.pending].sort((a, b) => a - b);
    const epoch = this.epoch;
    this.inFlight = true;
    let answer: readonly number[] | PromiseLike<readonly number[]>;
    try {
      answer = this.env.deliver(ids, !open);
    } catch {
      answer = [];
    }
    if (isPromiseLike(answer))
      answer.then(
        (shown) => this.delivered(epoch, open, shown),
        () => this.delivered(epoch, open, []),
      );
    else this.delivered(epoch, open, answer);
  }

  /** A delivery's answer: only ids a card really shows stop waiting, and only a new card starts the gap. */
  private delivered(epoch: number, joined: boolean, shown: readonly number[]): void {
    if (epoch !== this.epoch) return; // another dish is open now
    this.inFlight = false;
    const done = shown.filter((b) => this.pending.includes(b));
    if (done.length > 0) {
      this.pending = this.pending.filter((b) => !done.includes(b));
      if (!joined) this.lastShownAt = this.env.now();
      this.retry = false;
    } else this.retry = true;
    this.schedule();
  }
}
