/**
 * P4.3 the dish view's one visible notice (src/ui/notices.ts; D09 "Do not layer this message over another
 * D8 notification"): one notice at a time, priority goal > experiment > story > prompt, a notice that
 * cannot show waits (the latest per kind), a dismissed notice never comes back, and nothing shows while
 * a card is open in the same place: the discovery card or a followed family's extinction card. The cards
 * are a set (one closing never uncovers the notices while the other is open), and they are one at a time
 * too (shownCard): a card on screen keeps the place until its own source closes it, and a tie goes to the
 * extinction card (D-0076; D08 "Prefer a favorite-family event").
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cardPlaceHeldByOther,
  currentNotice,
  dismissNotice,
  requestNotice,
  resetNoticesForTest,
  setCardOpen,
  setCardsOpen,
  shownCard,
  withdrawKind,
  withdrawNotice,
} from '../../src/ui/notices';

beforeEach(() => resetNoticesForTest());

const id = () => currentNotice.value?.id ?? null;

describe('one visible notice', () => {
  it('shows one notice; a second request of the same kind replaces the waiting one (latest per kind)', () => {
    expect(currentNotice.value).toBeNull();
    requestNotice({ kind: 'prompt', id: 'p1', text: 'Tap a Sprinter.' });
    expect(id()).toBe('p1');
    requestNotice({ kind: 'prompt', id: 'p2', text: 'Press Run.' });
    expect(id()).toBe('p2');
    expect(currentNotice.value!.text).toBe('Press Run.');
  });

  it('priority goal > experiment > story > prompt; the lower one waits and returns when the higher one goes', () => {
    requestNotice({ kind: 'prompt', id: 'p', text: 'prompt' });
    requestNotice({ kind: 'story', id: 's', text: 'story' });
    expect(id()).toBe('s');
    requestNotice({ kind: 'experiment', id: 'x', text: 'experiment' });
    expect(id()).toBe('x');
    requestNotice({ kind: 'goal', id: 'g', text: 'goal' });
    expect(id()).toBe('g');
    // A lower-priority request while a higher one shows waits.
    requestNotice({ kind: 'prompt', id: 'p-latest', text: 'latest prompt' });
    expect(id()).toBe('g');
    dismissNotice('g');
    expect(id()).toBe('x');
    withdrawNotice('x');
    expect(id()).toBe('s');
    withdrawKind('story');
    expect(id()).toBe('p-latest'); // the latest prompt, not the first
    withdrawKind('prompt');
    expect(currentNotice.value).toBeNull();
  });

  it('a dismissed notice never comes back; a withdrawn one may be requested again', () => {
    const onDismiss = vi.fn();
    requestNotice({ kind: 'experiment', id: 'x1', text: 'waiting', onDismiss });
    dismissNotice('x1');
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(currentNotice.value).toBeNull();
    requestNotice({ kind: 'experiment', id: 'x1', text: 'waiting' });
    requestNotice({ kind: 'experiment', id: 'x1', text: 'waiting, reworded' });
    expect(currentNotice.value).toBeNull();
    requestNotice({ kind: 'prompt', id: 'p1', text: 'a prompt' });
    withdrawNotice('p1');
    expect(currentNotice.value).toBeNull();
    requestNotice({ kind: 'prompt', id: 'p1', text: 'a prompt' });
    expect(id()).toBe('p1');
  });

  it('nothing shows while the discovery card is open, nothing new appears meanwhile, and the waiting notices return when it closes', () => {
    requestNotice({ kind: 'prompt', id: 'p', text: 'prompt' });
    setCardOpen('discovery', true);
    expect(currentNotice.value).toBeNull();
    requestNotice({ kind: 'goal', id: 'g', text: 'goal' });
    requestNotice({ kind: 'story', id: 's', text: 'story' });
    expect(currentNotice.value).toBeNull();
    setCardOpen('discovery', false);
    expect(id()).toBe('g');
    dismissNotice('g');
    expect(id()).toBe('s');
  });

  it('an unchanged repeat request keeps the same notice object (no flicker for the status region)', () => {
    requestNotice({ kind: 'prompt', id: 'p', text: 'same' });
    const first = currentNotice.value;
    requestNotice({ kind: 'prompt', id: 'p', text: 'same' });
    expect(currentNotice.value).toBe(first);
  });
});

describe('one D8 card at a time (D09 "Do not layer this message over another D8 notification")', () => {
  it('nothing shows while the extinction card is open; the waiting notices return when it closes', () => {
    requestNotice({ kind: 'prompt', id: 'p', text: 'prompt' });
    expect(id()).toBe('p');
    setCardOpen('extinct', true);
    expect(shownCard.value).toBe('extinct');
    expect(currentNotice.value).toBeNull();
    requestNotice({ kind: 'goal', id: 'g', text: 'goal' });
    expect(currentNotice.value).toBeNull();
    setCardOpen('extinct', false);
    expect(shownCard.value).toBeNull();
    expect(id()).toBe('g');
    dismissNotice('g');
    expect(id()).toBe('p');
  });

  it('overlapping discovery and extinction cards keep the notices hidden until both close, in either order', () => {
    requestNotice({ kind: 'story', id: 's', text: 'story' });
    // discovery opens, extinction asks, discovery closes first: still hidden behind the extinction card.
    setCardOpen('discovery', true);
    setCardOpen('extinct', true);
    setCardOpen('discovery', false);
    expect(currentNotice.value).toBeNull();
    expect(shownCard.value).toBe('extinct');
    setCardOpen('extinct', false);
    expect(id()).toBe('s');
    // extinction opens, discovery opens over it, extinction closes first: still hidden behind discovery.
    setCardOpen('extinct', true);
    setCardOpen('discovery', true);
    setCardOpen('extinct', false);
    expect(currentNotice.value).toBeNull();
    expect(shownCard.value).toBe('discovery');
    setCardOpen('discovery', false);
    expect(id()).toBe('s');
    expect(shownCard.value).toBeNull();
  });

  it('a repeated open or close from one source changes nothing (a set, not a toggle or a count)', () => {
    requestNotice({ kind: 'prompt', id: 'p', text: 'prompt' });
    setCardOpen('discovery', true);
    setCardOpen('discovery', true);
    setCardOpen('extinct', false); // never opened: does not uncover anything
    expect(currentNotice.value).toBeNull();
    setCardOpen('discovery', false);
    expect(id()).toBe('p');
    setCardOpen('discovery', false);
    expect(id()).toBe('p');
  });

  it('the extinction card waits while a discovery card is open and shows when it closes', () => {
    setCardOpen('discovery', true);
    setCardOpen('extinct', true);
    expect(shownCard.value).toBe('discovery'); // not layered over the discovery card
    setCardOpen('discovery', false);
    expect(shownCard.value).toBe('extinct'); // it was waiting, not dropped
    setCardOpen('extinct', false);
    expect(shownCard.value).toBeNull();
  });

  it('D-0076 no preemption: a discovery card asked for while the extinction card shows waits, and shows after it closes', () => {
    setCardOpen('extinct', true);
    expect(shownCard.value).toBe('extinct');
    setCardOpen('discovery', true);
    expect(shownCard.value).toBe('extinct'); // it keeps the place the player is reading
    setCardOpen('discovery', true); // a repeat changes nothing
    expect(shownCard.value).toBe('extinct');
    setCardOpen('extinct', false);
    expect(shownCard.value).toBe('discovery');
    // And the other way round: the discovery card on screen is not displaced either.
    setCardOpen('extinct', true);
    expect(shownCard.value).toBe('discovery');
    setCardOpen('discovery', false);
    expect(shownCard.value).toBe('extinct');
  });

  it('D-0076 a tie (both asked for together, none on screen) goes to the extinction card', () => {
    setCardsOpen({ discovery: true, extinct: true });
    expect(shownCard.value).toBe('extinct');
    expect(currentNotice.value).toBeNull();
    setCardsOpen({ discovery: false, extinct: false });
    expect(shownCard.value).toBeNull();
    setCardsOpen({ extinct: true, discovery: true }); // key order does not matter
    expect(shownCard.value).toBe('extinct');
  });

  it('D-0076 cardPlaceHeldByOther: true only while the other card is on screen', () => {
    expect(cardPlaceHeldByOther('discovery')).toBe(false);
    setCardOpen('extinct', true);
    expect(cardPlaceHeldByOther('discovery')).toBe(true);
    expect(cardPlaceHeldByOther('extinct')).toBe(false);
    setCardOpen('discovery', true);
    expect(cardPlaceHeldByOther('discovery')).toBe(true); // asked for, but waiting
    setCardOpen('extinct', false);
    expect(cardPlaceHeldByOther('discovery')).toBe(false);
    expect(cardPlaceHeldByOther('extinct')).toBe(true);
  });
});
