/**
 * A followed family with no members left (UX §5.8; D08 "Gentle and honest failure"): the exact line "No
 * members of the {name} family remain.", the last recorded conditions, and Look back · Continue
 * exploring · Start a new dish. A record, not a resurrection: no sound cue, no alarm styling, no
 * scolding. The family stays in the notebook (marked "No members remain since m:ss").
 *
 * One D8 notification at a time (D09; src/ui/notices.ts): it takes the notice's place, so the one notice
 * waits while it is open, and it waits itself while a discovery card is open, showing when that closes.
 */
import { extinctCard, extinctCardFavorite, nameOf, speciesNameOf } from '../favorites';
import { shownCard } from '../notices';
import { dishInfo, historyFocus, route, sheet } from '../state';
import { extinctLastText, extinctTitle, FAVORITE_TEXT } from '../strings/favorites';

export function FavoriteExtinct() {
  const f = extinctCardFavorite();
  const info = dishInfo.value;
  if (shownCard.value !== 'extinct' || !f || !f.extinct || !info) return null;
  const x = f.extinct;
  const species = speciesNameOf(f.speciesId);
  const close = () => (extinctCard.value = null);
  return (
    <section class="card fav-extinct" role="region" aria-labelledby="fav-extinct-title" data-testid="favorite-extinct">
      <h2 id="fav-extinct-title">{extinctTitle(nameOf(f))}</h2>
      <p>{extinctLastText(species, x.lastBirthId, x.tick, x.cause)}</p>
      <div class="fav-actions">
        <button
          class="btn"
          onClick={() => {
            const k = info.speciesIds.indexOf(f.speciesId);
            historyFocus.value = { species: Math.max(0, k), birthId: x.lastBirthId };
            sheet.value = 'history';
            close();
          }}
        >
          {FAVORITE_TEXT.lookBack}
        </button>
        <button class="btn" onClick={close}>
          {FAVORITE_TEXT.continueExploring}
        </button>
        <button
          class="btn"
          onClick={() => {
            close();
            route.value = { name: 'newDish' };
          }}
        >
          {FAVORITE_TEXT.newDish}
        </button>
      </div>
    </section>
  );
}
