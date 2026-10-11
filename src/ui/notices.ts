/**
 * The dish view's one visible notice (P4.3; UX §3.2 "one optional prompt at a time"; D09 "Do not layer
 * this message over another D8 notification"). Goals, an experiment card's waiting stamp, story cards and
 * prompts all ask for the same single place (src/ui/views/NoticeHost.tsx), and only one is ever shown:
 *
 * - priority goal > experiment > story > prompt; a notice that cannot show waits, and each kind keeps only
 *   its latest request (a newer one replaces the waiting one of the same kind);
 * - a dismissed notice (✕) never comes back: a later request with the same id is ignored;
 * - while a card is open in the same place (the discovery card, or a followed family's extinction card;
 *   `setCardOpen`), nothing shows; the waiting notices return when the last card closes. The cards are a
 *   set, so one card closing never uncovers the notices while the other is still open;
 * - the cards themselves are one at a time too (D08 "never more than one visible notice"; D09 "Do not
 *   layer this message over another D8 notification"; D-0076): `shownCard` is the one requested card that
 *   shows. A card on screen keeps the place until its own source closes it (no preemption); only then
 *   does the next requested card show. When both are asked for and none is on screen, the followed
 *   family's extinction card goes first (D08 "Prefer a favorite-family event"). The discovery card is
 *   not even created while the extinction card shows (LineageState showDiscovery), and the discovery
 *   pacer counts the extinction card as the last card shown (CT §12.10 one new card per 60 s; the
 *   wiring is src/ui/noticeCards.ts);
 * - withdrawing (the source's state ended, e.g. the stamp arrived) removes a request without counting
 *   as a dismissal.
 *
 * UI state only: nothing here sends a command or reads the world. The app's LiveRegion stays the only
 * announcer of toasts; the notice itself is a role="status" region.
 */
import { signal } from '@preact/signals';

export type NoticeKind = 'goal' | 'experiment' | 'story' | 'prompt';

export interface NoticeAction {
  readonly label: string;
  readonly run: () => void;
  readonly testId?: string;
}

export interface NoticeRequest {
  readonly kind: NoticeKind;
  /** Stable identity: a dismissed id is never shown again. */
  readonly id: string;
  readonly text: string;
  readonly actions?: readonly NoticeAction[];
  /** data-testid of the notice element (e.g. 'experiment-waiting'). */
  readonly testId?: string;
  /** Accessible name of its ✕ button (default "Dismiss"). */
  readonly dismissLabel?: string;
  /** Called once when the player dismisses it (the source's own bookkeeping). */
  readonly onDismiss?: () => void;
}

const PRIORITY: readonly NoticeKind[] = ['goal', 'experiment', 'story', 'prompt'];

/** The notice on screen now (null: none). */
export const currentNotice = signal<NoticeRequest | null>(null);

let waiting: Partial<Record<NoticeKind, NoticeRequest>> = {};
const dismissed = new Set<string>();

/**
 * The cards that sit in the notice's place. When the place is free, the first requested one in this order
 * takes it (D08 "Prefer a favorite-family event": the extinction card first); a card already on screen
 * is never displaced by another (D-0076).
 */
export type NoticeCard = 'discovery' | 'extinct';
const CARD_ORDER: readonly NoticeCard[] = ['extinct', 'discovery'];
/** The cards whose sources ask to show now (each source owns its own entry). */
const cardsOpen = new Set<NoticeCard>();

/** The one card on screen now (null: none); a requested card that is not this one waits. */
export const shownCard = signal<NoticeCard | null>(null);

function recompute(): void {
  // No preemption: the card on screen stays while its source still asks for it.
  const on = shownCard.peek();
  const card = on !== null && cardsOpen.has(on) ? on : (CARD_ORDER.find((c) => cardsOpen.has(c)) ?? null);
  if (shownCard.peek() !== card) shownCard.value = card;
  if (card !== null) {
    currentNotice.value = null;
    return;
  }
  for (const kind of PRIORITY) {
    const n = waiting[kind];
    if (n) {
      // peek: requests come from effects, which must not subscribe to the notice they set.
      if (currentNotice.peek() !== n) currentNotice.value = n;
      return;
    }
  }
  currentNotice.value = null;
}

/** Ask to show a notice. It shows now if nothing of higher priority waits, else it waits. */
export function requestNotice(n: NoticeRequest): void {
  if (dismissed.has(n.id)) return;
  const held = waiting[n.kind];
  if (held && held.id === n.id && held.text === n.text && sameActions(held, n)) return; // unchanged
  waiting = { ...waiting, [n.kind]: n };
  recompute();
}

function sameActions(a: NoticeRequest, b: NoticeRequest): boolean {
  const x = a.actions ?? [];
  const y = b.actions ?? [];
  return x.length === y.length && x.every((v, i) => v.label === y[i]!.label && v.testId === y[i]!.testId);
}

/** The player dismissed it: it goes, and that id never shows again. */
export function dismissNotice(id: string): void {
  dismissed.add(id);
  let hit: NoticeRequest | null = null;
  for (const kind of PRIORITY) {
    const n = waiting[kind];
    if (n && n.id === id) {
      hit = n;
      const next = { ...waiting };
      delete next[kind];
      waiting = next;
    }
  }
  recompute();
  hit?.onDismiss?.();
}

/** The source's state ended: remove the request (not a dismissal; the id may be requested again). */
export function withdrawNotice(id: string): void {
  for (const kind of PRIORITY) {
    if (waiting[kind]?.id === id) {
      const next = { ...waiting };
      delete next[kind];
      waiting = next;
    }
  }
  recompute();
}

/** Remove whatever request of `kind` waits (not a dismissal). */
export function withdrawKind(kind: NoticeKind): void {
  if (!waiting[kind]) return;
  const next = { ...waiting };
  delete next[kind];
  waiting = next;
  recompute();
}

/**
 * A card's source asks to show it (`open`) or no longer does. While any card is asked for, no notice
 * shows; `shownCard` names the one card that may show. Each card is its own entry, so closing one never
 * clears another's.
 */
export function setCardOpen(card: NoticeCard, open: boolean): void {
  setCardsOpen({ [card]: open });
}

/**
 * Several cards' requests at once (one recompute): two cards asked for together while none is on screen
 * is the tie that CARD_ORDER settles (the extinction card first).
 */
export function setCardsOpen(open: Partial<Record<NoticeCard, boolean>>): void {
  let changed = false;
  for (const card of CARD_ORDER) {
    const want = open[card];
    if (want === undefined || cardsOpen.has(card) === want) continue;
    if (want) cardsOpen.add(card);
    else cardsOpen.delete(card);
    changed = true;
  }
  if (changed) recompute();
}

/**
 * Whether another card holds the notice place now, so a new `card` must not be created (D-0076: the
 * discovery card is not created while the extinction card is on screen).
 */
export function cardPlaceHeldByOther(card: NoticeCard): boolean {
  const on = shownCard.peek();
  return on !== null && on !== card;
}

/** Tests only: forget every request, dismissal and card. */
export function resetNoticesForTest(): void {
  waiting = {};
  dismissed.clear();
  cardsOpen.clear();
  shownCard.value = null;
  currentNotice.value = null;
}
