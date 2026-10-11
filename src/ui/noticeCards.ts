/**
 * The wiring that puts the two cards into the notice's place (src/ui/notices.ts; D-0076), moved out of
 * NoticeHost's wire() so it is tested in node with the real signals (tests/ui/notice-cards.test.ts):
 *
 * - the discovery card asks for the place while `discovery` (LineageState) holds a card;
 * - the extinction card asks for it while the head of the extinct-family queue has something to show
 *   (favorites.ts extinctCardFavorite); both requests go to notices.ts in one call, so two cards asked
 *   for together are the tie CARD_ORDER settles (the extinction card first);
 * - each time an extinction card becomes the card on screen (a new head included), the discovery pacer
 *   counts it as the last card shown (CT §12.10 one new card notification per 60 s across the cards).
 *
 * UI state only: nothing here sends a command or reads the world.
 */
import { computed, effect, untracked } from '@preact/signals';
import { extinctCardToShow, extinctCardFavorite } from './favorites';
import { setCardsOpen } from './notices';
import { discovery, discoveryOtherCardShown } from './panels/LineageState';

/** Connect the two cards to the notice place. Returns the disposer (the app keeps it for the page's life). */
export function wireNoticeCards(): () => void {
  const requests = effect(() => {
    const discoveryOpen = discovery.value !== null;
    const extinctOpen = extinctCardFavorite() !== null;
    setCardsOpen({ discovery: discoveryOpen, extinct: extinctOpen });
  });
  // The id, not the record: a notebook change that keeps the same card on screen is not a new card.
  const shownExtinct = computed(() => extinctCardToShow()?.id ?? null);
  const pacing = effect(() => {
    if (shownExtinct.value !== null) untracked(discoveryOtherCardShown);
  });
  return () => {
    pacing();
    requests();
  };
}
