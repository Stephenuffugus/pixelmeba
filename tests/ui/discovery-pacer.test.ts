/**
 * P2.3 discovery cards (UX §5.5, CT §12.10 "notifications ≤ 1 per 60 s"): one card per 1.5 s burst,
 * at most one new card per 60 s, later discoveries join an open card, and a dismissal never lets a
 * new card in before the gap. Wave B fix 2: discoveries are dropped only once a card really shows
 * them; a failed or empty answer, or a dish change while the answer is on its way, keeps them (or
 * drops only the old dish's) and starts no 60 s gap. Driven with a hand-run clock (no browser, no
 * real timers); the harness's delivery shows every id it is given, like a lineage answer that has them.
 */
import { describe, expect, it } from 'vitest';
import {
  DISCOVERY_BURST_MS,
  DISCOVERY_GAP_MS,
  DISCOVERY_JOIN_MS,
  DISCOVERY_RETRY_MS,
  DiscoveryPacer,
} from '../../src/ui/panels/DiscoveryPacer';

/** A delivery still waiting for its lineage answer (the async harness settles it by hand). */
interface Pending {
  readonly ids: number[];
  readonly newCard: boolean;
  settle(shown: readonly number[] | Error): void;
}

function harness(opts: { async?: boolean } = {}) {
  let t = 0;
  let seq = 0;
  let timers: { id: number; at: number; fn: () => void }[] = [];
  const cards: { ids: number[]; at: number }[] = [];
  const inFlight: Pending[] = [];
  let open = false;
  const show = (ids: readonly number[], newCard: boolean) => {
    if (newCard) {
      cards.push({ ids: [...ids], at: t });
      open = true;
    } else cards[cards.length - 1]!.ids.push(...ids);
  };
  const pacer = new DiscoveryPacer({
    now: () => t,
    setTimer: (fn, ms) => {
      const id = ++seq;
      timers.push({ id, at: t + ms, fn });
      return id;
    },
    clearTimer: (h) => {
      timers = timers.filter((x) => x.id !== h);
    },
    cardOpen: () => open,
    deliver: (ids, newCard) => {
      if (!opts.async) {
        show(ids, newCard);
        return ids;
      }
      return new Promise<readonly number[]>((resolve, reject) => {
        inFlight.push({
          ids: [...ids],
          newCard,
          settle: (shown) => {
            if (shown instanceof Error) return reject(shown);
            if (shown.length > 0) show(shown, newCard);
            resolve(shown);
          },
        });
      });
    },
  });
  /** Advance the clock to `to`, running due timers in time order. */
  const advance = (to: number) => {
    for (;;) {
      const due = timers.filter((x) => x.at <= to).sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (!due) break;
      timers = timers.filter((x) => x !== due);
      t = due.at;
      due.fn();
    }
    t = to;
  };
  const dismiss = () => {
    open = false;
    pacer.dismissed();
  };
  /** Settle the oldest delivery still waiting, then let its continuation run. */
  const answer = async (shown: readonly number[] | Error) => {
    inFlight.shift()!.settle(shown);
    for (let k = 0; k < 3; k++) await Promise.resolve();
  };
  return { pacer, cards, advance, dismiss, inFlight, answer };
}

describe('P2.3 discovery cards: one per burst, at most one new card per 60 s', () => {
  it('discoveries within 1.5 s of the first make exactly one card, shown at the end of the burst', () => {
    const h = harness();
    h.pacer.discovered([0]);
    h.advance(1000);
    h.pacer.discovered([1]);
    h.advance(1400);
    h.pacer.discovered([2, 3]);
    h.advance(DISCOVERY_BURST_MS - 1);
    expect(h.cards).toHaveLength(0);
    h.advance(DISCOVERY_BURST_MS);
    expect(h.cards).toEqual([{ ids: [0, 1, 2, 3], at: DISCOVERY_BURST_MS }]);
    h.advance(10_000);
    expect(h.cards).toHaveLength(1);
  });

  it('after a card, the next new card waits for the 60 s gap even if the first was dismissed at once', () => {
    const h = harness();
    h.pacer.discovered([0]);
    h.advance(DISCOVERY_BURST_MS);
    expect(h.cards).toHaveLength(1);
    h.advance(2000);
    h.dismiss();
    h.advance(10_000);
    h.pacer.discovered([1]);
    h.advance(20_000);
    h.pacer.discovered([2]); // a second burst inside the gap joins the same waiting card
    h.advance(DISCOVERY_BURST_MS + DISCOVERY_GAP_MS - 1);
    expect(h.cards).toHaveLength(1);
    h.advance(DISCOVERY_BURST_MS + DISCOVERY_GAP_MS);
    expect(h.cards).toHaveLength(2);
    expect(h.cards[1]).toEqual({ ids: [1, 2], at: DISCOVERY_BURST_MS + DISCOVERY_GAP_MS });
  });

  it('a gap longer than 60 s since the last card waits only for the burst', () => {
    const h = harness();
    h.pacer.discovered([0]);
    h.advance(DISCOVERY_BURST_MS);
    h.dismiss();
    h.advance(100_000);
    h.pacer.discovered([1]);
    h.advance(100_000 + DISCOVERY_BURST_MS);
    expect(h.cards.map((c) => c.at)).toEqual([DISCOVERY_BURST_MS, 100_000 + DISCOVERY_BURST_MS]);
  });

  it('while a card is open, new discoveries join it instead of opening a second card', () => {
    const h = harness();
    h.pacer.discovered([0]);
    h.advance(DISCOVERY_BURST_MS);
    h.advance(5000);
    h.pacer.discovered([1]);
    h.advance(5000 + DISCOVERY_JOIN_MS);
    expect(h.cards).toEqual([{ ids: [0, 1], at: DISCOVERY_BURST_MS }]);
  });

  it('dismissing a card while a discovery waits to join it does not open a new card before the gap', () => {
    const h = harness();
    h.pacer.discovered([0]);
    h.advance(DISCOVERY_BURST_MS);
    h.advance(5000);
    h.pacer.discovered([1]);
    h.advance(5100);
    h.dismiss(); // before the 200 ms join delay ran out
    h.advance(DISCOVERY_BURST_MS + DISCOVERY_GAP_MS - 1);
    expect(h.cards).toHaveLength(1);
    h.advance(DISCOVERY_BURST_MS + DISCOVERY_GAP_MS);
    expect(h.cards).toHaveLength(2);
    expect(h.cards[1]!.ids).toEqual([1]);
  });

  it('undo that rewinds past waiting discoveries drops them; another dish drops everything', () => {
    const h = harness();
    h.pacer.discovered([0, 1]);
    h.pacer.rewound(1);
    expect(h.pacer.waiting).toEqual([0]);
    h.pacer.rewound(0);
    h.advance(DISCOVERY_BURST_MS * 2);
    expect(h.cards).toHaveLength(0);
    h.pacer.discovered([0]);
    h.pacer.reset();
    h.advance(DISCOVERY_BURST_MS * 4);
    expect(h.cards).toHaveLength(0);
  });
});

describe('Wave B fix 2: discoveries wait until a card really shows them', () => {
  it('a failed lineage answer keeps them waiting, starts no 60 s gap, and they are shown on the retry', async () => {
    const h = harness({ async: true });
    h.pacer.discovered([0, 1]);
    h.advance(DISCOVERY_BURST_MS);
    expect(h.inFlight.map((d) => d.ids)).toEqual([[0, 1]]);
    await h.answer(new Error('worker busy'));
    expect(h.cards).toHaveLength(0);
    expect(h.pacer.waiting).toEqual([0, 1]);
    // No second delivery while nothing was shown before the retry delay …
    h.advance(DISCOVERY_BURST_MS + DISCOVERY_RETRY_MS - 1);
    expect(h.inFlight).toHaveLength(0);
    // … then the retry shows them on a new card, long before a 60 s gap would have allowed.
    h.advance(DISCOVERY_BURST_MS + DISCOVERY_RETRY_MS);
    expect(h.inFlight.map((d) => [d.ids, d.newCard])).toEqual([[[0, 1], true]]);
    await h.answer([0, 1]);
    expect(h.cards).toEqual([{ ids: [0, 1], at: DISCOVERY_BURST_MS + DISCOVERY_RETRY_MS }]);
    expect(h.pacer.waiting).toEqual([]);
  });

  it('an answer without their rows shows nothing: they keep waiting; ids a card did show stop waiting', async () => {
    const h = harness({ async: true });
    h.pacer.discovered([0, 1]);
    h.advance(DISCOVERY_BURST_MS);
    await h.answer([]);
    expect(h.cards).toHaveLength(0);
    expect(h.pacer.waiting).toEqual([0, 1]);
    h.advance(DISCOVERY_BURST_MS + DISCOVERY_RETRY_MS);
    await h.answer([0]); // only branch 0's row came back
    expect(h.cards).toEqual([{ ids: [0], at: DISCOVERY_BURST_MS + DISCOVERY_RETRY_MS }]);
    expect(h.pacer.waiting).toEqual([1]);
    // Branch 1 joins the open card on its next try.
    h.advance(DISCOVERY_BURST_MS + 2 * DISCOVERY_RETRY_MS);
    expect(h.inFlight.map((d) => [d.ids, d.newCard])).toEqual([[[1], false]]);
    await h.answer([1]);
    expect(h.cards).toEqual([{ ids: [0, 1], at: DISCOVERY_BURST_MS + DISCOVERY_RETRY_MS }]);
    expect(h.pacer.waiting).toEqual([]);
  });

  it('a dish change while the answer is on its way drops only the old dish’s discoveries and starts no gap', async () => {
    const h = harness({ async: true });
    h.pacer.discovered([0]);
    h.advance(DISCOVERY_BURST_MS);
    expect(h.inFlight).toHaveLength(1);
    h.pacer.reset(); // another dish opened
    await h.answer([]); // the old dish's answer arrives late: it changes nothing here
    expect(h.pacer.waiting).toEqual([]);
    h.advance(2000);
    h.pacer.discovered([0]); // the new dish names its first branch
    h.advance(2000 + DISCOVERY_BURST_MS);
    expect(h.inFlight.map((d) => [d.ids, d.newCard])).toEqual([[[0], true]]);
    await h.answer([0]);
    expect(h.cards).toEqual([{ ids: [0], at: 2000 + DISCOVERY_BURST_MS }]);
  });

  it('a late answer for the old dish cannot drop the new dish’s waiting discoveries', async () => {
    const h = harness({ async: true });
    h.pacer.discovered([0]);
    h.advance(DISCOVERY_BURST_MS);
    h.pacer.reset();
    h.pacer.discovered([0]);
    await h.answer([0]); // the old dish's card (if any) is not this dish's branch 0
    expect(h.pacer.waiting).toEqual([0]);
    h.advance(2 * DISCOVERY_BURST_MS);
    expect(h.inFlight.map((d) => d.ids)).toEqual([[0]]);
  });

  it('discoveries arriving while an answer is on its way wait for it, then join the card it opened', async () => {
    const h = harness({ async: true });
    h.pacer.discovered([0]);
    h.advance(DISCOVERY_BURST_MS);
    h.pacer.discovered([1]);
    h.advance(DISCOVERY_BURST_MS + 5000);
    expect(h.inFlight).toHaveLength(1); // no second delivery while the first is in flight
    await h.answer([0]);
    expect(h.pacer.waiting).toEqual([1]);
    h.advance(DISCOVERY_BURST_MS + 5000 + DISCOVERY_JOIN_MS);
    expect(h.inFlight.map((d) => [d.ids, d.newCard])).toEqual([[[1], false]]);
    await h.answer([1]);
    // The card opened when its answer arrived (the harness shows a card at answer time).
    expect(h.cards).toEqual([{ ids: [0, 1], at: DISCOVERY_BURST_MS + 5000 }]);
  });
});
