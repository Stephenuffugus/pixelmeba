/**
 * D-0076 the two cards in the notice's place, through the real modules (notices.ts, favorites.ts,
 * noticeCards.ts, LineageState.tsx with its DiscoveryPacer, FavoriteExtinct.tsx, DiscoveryCard.tsx's
 * guard) with state.ts replaced by a small stand-in (the real one starts a Worker and audio):
 * - no preemption: a discovery card never takes the extinction card's place; a tie goes to the
 *   extinction card (D08 "Prefer a favorite-family event");
 * - the discovery card is not created while the extinction card shows (no pause, no 60 s gap; it shows
 *   after the extinction card closes);
 * - one new card notification per 60 s across both cards (CT §12.10): the pacer counts the extinction card;
 * - no extinction card is lost: a FIFO queue of favorite ids, each shown in turn; Undo drops the ones whose
 *   family is back or gone; another dish clears it;
 * - the wiring (wireNoticeCards) and the render guards (extinctCardToShow, discoveryCardToShow).
 * Each test loads fresh modules (vi.resetModules) so module state never leaks between them.
 */
import { batch } from '@preact/signals';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyNotebook, type FavoriteRecord, type NotebookRecord } from '../../src/persistence/notebook';
import type { DishInfo, SnapshotMsg } from '../../src/worker/protocol';
import type { NotebookNotice, SimClient } from '../../src/worker/client';

interface Io {
  setSpeed: (speed: number) => void;
  lineageCalls: number;
  snapshotListeners: ((s: unknown) => void)[];
  answer: unknown;
}
const io: Io = vi.hoisted(() => ({ setSpeed: () => undefined, lineageCalls: 0, snapshotListeners: [], answer: null }));

vi.mock('../../src/ui/state', async () => {
  const { signal } = await import('@preact/signals');
  const toast = signal<string | null>(null);
  const client = {
    lineage: () => {
      io.lineageCalls++;
      return Promise.resolve(io.answer);
    },
    lineageView: () => undefined,
    onSnapshot: (fn: (s: unknown) => void) => {
      io.snapshotListeners.push(fn);
      return () => undefined;
    },
    notebookGet: () => new Promise(() => undefined), // never answers: the test sets the record itself
  };
  return {
    dishInfo: signal<unknown>(null),
    sheet: signal<string>('none'),
    toast,
    historyFocus: signal<unknown>(null),
    route: signal<unknown>({ name: 'dish' }),
    meta: signal<unknown>({ speed: 1 }),
    settings: signal<unknown>({ pauseOnDiscoveries: true }),
    setSpeed: (s: number) => io.setSpeed(s),
    showToast: (t: string) => (toast.value = t),
    select: () => undefined,
    autosave: () => Promise.resolve(),
    getRenderer: () => null,
    getClient: () => client,
  };
});

const W = 'w';
const fav = (id: string, extinct: boolean): FavoriteRecord => ({
  id,
  rootBirthId: 5,
  speciesId: 'B01',
  nickname: id,
  pattern: 'triangle',
  representative: 5,
  active: !extinct,
  createdTick: 0,
  members: extinct ? [] : [[5, 0]],
  historyIncomplete: false,
  extinct: extinct ? { tick: 100, lastBirthId: 5, cause: 0, cell: 3 } : null,
});
const rec = (fs: FavoriteRecord[]): NotebookRecord => ({ ...emptyNotebook(W), favorites: fs, nextFavorite: fs.length + 1 });
const died = (id: string, fs: FavoriteRecord[]): NotebookNotice => ({
  type: 'notebookChanged',
  dishId: 'd',
  record: rec(fs),
  change: { kind: 'favoriteExtinct', id },
});
const restored = (fs: FavoriteRecord[]): NotebookNotice => ({
  type: 'notebookChanged',
  dishId: 'd',
  record: rec(fs),
  change: { kind: 'favoritesRestored', removed: [] },
});
const DISH = { dishId: 'd', speciesIds: ['B01'], speciesNames: ['Sprinter'] } as unknown as DishInfo;
const ROW = { id: 0, name: 'Quick Sprinters', living: 3, pinned: false };
const fakeDiscovery = { branches: [0], rows: [ROW], answer: { branches: [ROW] }, paused: false };

/** Fresh copies of every module this test drives (module state never leaks between tests). */
async function load() {
  vi.resetModules();
  io.snapshotListeners = [];
  io.lineageCalls = 0;
  io.answer = { branches: [ROW] };
  const state = (await import('../../src/ui/state')) as unknown as {
    dishInfo: { value: DishInfo | null };
  };
  const notices = await import('../../src/ui/notices');
  const fav = await import('../../src/ui/favorites');
  const lin = await import('../../src/ui/panels/LineageState');
  const cards = await import('../../src/ui/noticeCards');
  const { FavoriteExtinct } = await import('../../src/ui/panels/FavoriteExtinct');
  const { discoveryCardToShow } = await import('../../src/ui/panels/DiscoveryCard');
  state.dishInfo.value = DISH;
  /** The extinction card's title text, or null when it does not render. */
  const extinctTitleShown = (): string | null => {
    const v = FavoriteExtinct();
    if (!v) return null;
    return String(v.props.children[0]!.props.children);
  };
  /** The extinction card's buttons, by their visible label. */
  const extinctButtons = (): Record<string, () => void> => {
    const v = FavoriteExtinct();
    const out: Record<string, () => void> = {};
    for (const b of v?.props.children[2]!.props.children ?? []) out[String(b.props.children)] = b.props.onClick;
    return out;
  };
  return { state, notices, fav, lin, cards, extinctTitleShown, extinctButtons, discoveryCardToShow };
}

/** Send a snapshot carrying `branchCount` to the lineage watcher (the first one is the baseline). */
function snap(branchCount: number): void {
  const s = { type: 'snapshot', dishId: 'd', branchCount, events: [], lineage: null } as unknown as SnapshotMsg;
  for (const fn of io.snapshotListeners) fn(s);
}

let disposers: (() => void)[] = [];
afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
  vi.useRealTimers();
});

describe('D-0076 rule 1: a card on screen keeps the place; a tie goes to the extinction card', () => {
  it('a discovery card asked for while the extinction card shows does not take its place, and shows after it closes', async () => {
    const m = await load();
    disposers.push(m.cards.wireNoticeCards());
    m.fav.notebook.value = rec([fav('a', false)]);
    m.fav.onNotebookNotice(died('a', [fav('a', true)]));
    expect(m.notices.shownCard.value).toBe('extinct');
    expect(m.extinctTitleShown()).toBe('No members of the a family remain.');
    // A discovery card arrives (e.g. a delivery that was already past its check): it only waits.
    m.lin.discovery.value = fakeDiscovery as never;
    expect(m.notices.shownCard.value).toBe('extinct');
    expect(m.extinctTitleShown()).toBe('No members of the a family remain.');
    expect(m.discoveryCardToShow()).toBeNull();
    // The player closes the extinction card: the waiting discovery card shows.
    m.extinctButtons()['Continue exploring']!();
    expect(m.notices.shownCard.value).toBe('discovery');
    expect(m.extinctTitleShown()).toBeNull();
    expect(m.discoveryCardToShow()).toBe(m.lin.discovery.value);
  });

  it('a tie (both asked for at once, none on screen) goes to the extinction card', async () => {
    const m = await load();
    disposers.push(m.cards.wireNoticeCards());
    m.fav.notebook.value = rec([fav('a', true)]);
    batch(() => {
      m.lin.discovery.value = fakeDiscovery as never;
      m.fav.queueExtinctCard('a');
    });
    expect(m.notices.shownCard.value).toBe('extinct');
    expect(m.discoveryCardToShow()).toBeNull();
    m.fav.closeExtinctCard('a');
    expect(m.notices.shownCard.value).toBe('discovery');
  });

  it('the extinction card is never delayed except while a discovery card is on screen', async () => {
    const m = await load();
    disposers.push(m.cards.wireNoticeCards());
    m.lin.discovery.value = fakeDiscovery as never;
    expect(m.notices.shownCard.value).toBe('discovery');
    m.fav.notebook.value = rec([fav('a', false)]);
    m.fav.onNotebookNotice(died('a', [fav('a', true)]));
    expect(m.notices.shownCard.value).toBe('discovery'); // not layered, not preempting
    expect(m.extinctTitleShown()).toBeNull();
    m.lin.dismissDiscovery();
    expect(m.notices.shownCard.value).toBe('extinct'); // at once
    expect(m.extinctTitleShown()).toBe('No members of the a family remain.');
  });
});

describe('D-0076 rule 4: no extinction card is lost (a FIFO queue)', () => {
  it('two extinctions queue and both show, in order; each button removes the head; no duplicates', async () => {
    const m = await load();
    disposers.push(m.cards.wireNoticeCards());
    m.fav.notebook.value = rec([fav('a', false), fav('b', false), fav('c', false)]);
    m.fav.onNotebookNotice(died('a', [fav('a', true), fav('b', false), fav('c', false)]));
    m.fav.onNotebookNotice(died('b', [fav('a', true), fav('b', true), fav('c', false)]));
    m.fav.onNotebookNotice(died('a', [fav('a', true), fav('b', true), fav('c', false)])); // a repeat: no duplicate
    m.fav.onNotebookNotice(died('c', [fav('a', true), fav('b', true), fav('c', true)]));
    expect(m.fav.extinctQueue.value).toEqual(['a', 'b', 'c']);
    expect(m.extinctTitleShown()).toBe('No members of the a family remain.');
    m.extinctButtons()['Look back']!();
    expect(m.extinctTitleShown()).toBe('No members of the b family remain.');
    expect(m.notices.shownCard.value).toBe('extinct');
    m.extinctButtons()['Continue exploring']!();
    expect(m.extinctTitleShown()).toBe('No members of the c family remain.');
    m.extinctButtons()['Start a new dish']!();
    expect(m.extinctTitleShown()).toBeNull();
    expect(m.fav.extinctQueue.value).toEqual([]);
    expect(m.notices.shownCard.value).toBeNull();
  });

  it('a second extinction while the first card waits behind a discovery card is not lost', async () => {
    const m = await load();
    disposers.push(m.cards.wireNoticeCards());
    m.lin.discovery.value = fakeDiscovery as never;
    m.fav.notebook.value = rec([fav('a', false), fav('b', false)]);
    m.fav.onNotebookNotice(died('a', [fav('a', true), fav('b', false)]));
    m.fav.onNotebookNotice(died('b', [fav('a', true), fav('b', true)]));
    m.lin.dismissDiscovery();
    expect(m.extinctTitleShown()).toBe('No members of the a family remain.');
    m.extinctButtons()['Continue exploring']!();
    expect(m.extinctTitleShown()).toBe('No members of the b family remain.');
  });

  it("'favoritesRestored' drops every queued id whose family is back or gone, the shown one and the waiting ones", async () => {
    const m = await load();
    disposers.push(m.cards.wireNoticeCards());
    m.fav.notebook.value = rec([fav('a', false), fav('b', false), fav('c', false), fav('e', false)]);
    for (const id of ['a', 'b', 'c', 'e']) m.fav.queueExtinctCard(id);
    m.fav.notebook.value = rec([fav('a', true), fav('b', true), fav('c', true), fav('e', true)]);
    expect(m.extinctTitleShown()).toBe('No members of the a family remain.');
    // Undo: a (shown) and c (waiting) are back, e is gone from the record, b is still extinct.
    m.fav.onNotebookNotice(restored([fav('a', false), fav('b', true), fav('c', false)]));
    expect(m.fav.extinctQueue.value).toEqual(['b']);
    expect(m.extinctTitleShown()).toBe('No members of the b family remain.');
  });

  it('another dish (followOpenDish) clears the queue', async () => {
    const m = await load();
    m.fav.wireFavorites({ onNotebook: () => () => undefined, onSnapshot: () => () => undefined } as unknown as SimClient);
    m.fav.queueExtinctCard('a');
    m.fav.queueExtinctCard('b');
    m.state.dishInfo.value = { ...DISH, dishId: 'other' };
    expect(m.fav.extinctQueue.value).toEqual([]);
  });
});

describe('D-0076 rule 5: the wiring and the render guards', () => {
  it('wireNoticeCards asks for the place from the real sources; without it no card ever shows', async () => {
    const m = await load();
    m.fav.notebook.value = rec([fav('a', true)]);
    m.fav.queueExtinctCard('a');
    expect(m.notices.shownCard.value).toBeNull(); // not wired yet: nothing asks for the place
    expect(m.extinctTitleShown()).toBeNull();
    const off = m.cards.wireNoticeCards();
    expect(m.notices.shownCard.value).toBe('extinct');
    expect(m.extinctTitleShown()).toBe('No members of the a family remain.');
    m.notices.requestNotice({ kind: 'prompt', id: 'p', text: 'prompt' });
    expect(m.notices.currentNotice.value).toBeNull(); // the card holds the place
    m.fav.closeExtinctCard('a');
    expect(m.notices.shownCard.value).toBeNull();
    expect(m.notices.currentNotice.value?.id).toBe('p');
    m.lin.discovery.value = fakeDiscovery as never;
    expect(m.notices.shownCard.value).toBe('discovery');
    expect(m.discoveryCardToShow()).toBe(m.lin.discovery.value);
    m.lin.discovery.value = null;
    expect(m.notices.shownCard.value).toBeNull();
    off();
  });

  it('extinctCardToShow: the head when the place is the extinction card’s, its family is extinct and a dish is open; else null', async () => {
    const m = await load();
    m.fav.notebook.value = rec([fav('a', true), fav('b', false)]);
    m.fav.queueExtinctCard('a');
    expect(m.fav.extinctCardToShow()).toBeNull(); // the place is not its own
    m.notices.setCardOpen('discovery', true);
    m.notices.setCardOpen('extinct', true);
    expect(m.notices.shownCard.value).toBe('discovery');
    expect(m.fav.extinctCardToShow()).toBeNull(); // a discovery card is on screen
    m.notices.setCardOpen('discovery', false);
    expect(m.fav.extinctCardToShow()?.id).toBe('a');
    m.state.dishInfo.value = null;
    expect(m.fav.extinctCardToShow()).toBeNull(); // no dish open
    m.state.dishInfo.value = DISH;
    m.fav.extinctQueue.value = ['b'];
    expect(m.fav.extinctCardToShow()).toBeNull(); // b's family is not extinct
    m.fav.extinctQueue.value = [];
    expect(m.fav.extinctCardToShow()).toBeNull();
  });

  it('discoveryCardToShow: the card only while the place is the discovery card’s', async () => {
    const m = await load();
    m.lin.discovery.value = fakeDiscovery as never;
    expect(m.discoveryCardToShow()).toBeNull(); // asked for nothing yet (not wired)
    m.notices.setCardOpen('extinct', true);
    m.notices.setCardOpen('discovery', true);
    expect(m.discoveryCardToShow()).toBeNull(); // a waiting request
    m.notices.setCardOpen('extinct', false);
    expect(m.discoveryCardToShow()).toBe(m.lin.discovery.value);
  });
});

describe('D-0076 rules 2 and 3: the discovery pacer and the extinction card', () => {
  let paused: number[] = [];
  beforeEach(() => {
    paused = [];
    io.setSpeed = (s) => void paused.push(s);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
  });

  async function dish() {
    const m = await load();
    disposers.push(m.lin.watchLineage());
    disposers.push(m.cards.wireNoticeCards());
    snap(0); // the baseline
    m.fav.notebook.value = rec([fav('a', false)]);
    return m;
  }

  it('the 60 s gap counts the extinction card: a discovery card shows no sooner than 60 s after it appeared', async () => {
    const m = await dish();
    m.fav.onNotebookNotice(died('a', [fav('a', true)])); // t = 0: the extinction card shows
    expect(m.notices.shownCard.value).toBe('extinct');
    await vi.advanceTimersByTimeAsync(1000);
    snap(1); // a branch is named at 1 s
    await vi.advanceTimersByTimeAsync(9000);
    m.fav.closeExtinctCard('a'); // closed at 10 s
    await vi.advanceTimersByTimeAsync(49_000); // 59 s
    expect(m.lin.discovery.value).toBeNull();
    expect(paused).toEqual([]);
    await vi.advanceTimersByTimeAsync(6000); // 65 s
    expect(m.lin.discovery.value?.branches).toEqual([0]);
    expect(m.notices.shownCard.value).toBe('discovery');
    expect(paused).toEqual([0]);
  });

  it('showDiscovery refuses a new card while the extinction card shows: no card, no pause, no gap; it shows soon after the card closes', async () => {
    const m = await dish();
    m.fav.onNotebookNotice(died('a', [fav('a', true)])); // t = 0
    await vi.advanceTimersByTimeAsync(1000);
    snap(1);
    await vi.advanceTimersByTimeAsync(64_000); // 65 s: the gap passed; deliveries are refused meanwhile
    expect(io.lineageCalls).toBeGreaterThan(0); // the pacer did try
    expect(m.lin.discovery.value).toBeNull();
    expect(paused).toEqual([]);
    expect(m.notices.shownCard.value).toBe('extinct');
    m.fav.closeExtinctCard('a'); // closed at 65 s
    // A refusal starts no gap: the ids still wait and the next try (≤ DISCOVERY_RETRY_MS) shows them.
    await vi.advanceTimersByTimeAsync(5000);
    expect(m.lin.discovery.value?.branches).toEqual([0]);
    expect(m.notices.shownCard.value).toBe('discovery');
    expect(paused).toEqual([0]); // paused once, when the card really showed
  });
});
