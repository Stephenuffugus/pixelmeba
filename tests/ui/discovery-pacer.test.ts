/**
 * P2.3 discovery cards (UX §5.5, CT §12.10 "notifications ≤ 1 per 60 s"): one card per 1.5 s burst,
 * at most one new card per 60 s, later discoveries join an open card, and a dismissal never lets a
 * new card in before the gap. Driven with a hand-run clock (no browser, no real timers).
 */
import { describe, expect, it } from 'vitest';
import { DISCOVERY_BURST_MS, DISCOVERY_GAP_MS, DISCOVERY_JOIN_MS, DiscoveryPacer } from '../../src/ui/panels/DiscoveryPacer';

function harness() {
  let t = 0;
  let seq = 0;
  let timers: { id: number; at: number; fn: () => void }[] = [];
  const cards: { ids: number[]; at: number }[] = [];
  let open = false;
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
      if (newCard) {
        cards.push({ ids: [...ids], at: t });
        open = true;
      } else cards[cards.length - 1]!.ids.push(...ids);
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
  return { pacer, cards, advance, dismiss };
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
