/**
 * Notebook → Favorites (UX §2, §5.8): the open dish's followed and unpinned families with their state
 * ("Following", "Unpinned", "No members remain since m:ss") and Pin again. Favorites are kept with each
 * dish (D-0070), so with no dish open there is nothing to list here.
 */
import { useState } from 'preact/hooks';
import { dishInfo } from '../state';
import { favoriteOp, nameOf, notebook, notebookDroppedFor, speciesNameOf } from '../favorites';
import { FAVORITE_TEXT, favoriteStateText, fromRootText } from '../strings/favorites';
import { FavoriteGlyph } from '../panels/FavoriteSlots';

export function NotebookFavorites() {
  const info = dishInfo.value;
  const nb = notebook.value;
  const [refusal, setRefusal] = useState<string | null>(null);
  if (!info) return <p class="nb-empty">{FAVORITE_TEXT.notebookEmpty}</p>;
  if (!nb) return <p class="nb-empty">Reading this dish’s favorites…</p>;
  // Fix round 1: a notebook dropped when this dish was opened says so here too (not only in a toast).
  const dropped = notebookDroppedFor.value?.dishId === info.dishId ? notebookDroppedFor.value.message : null;
  const droppedLine = dropped ? (
    <p class="constraint" data-testid="favorites-dropped">
      {dropped}
    </p>
  ) : null;
  if (nb.favorites.length === 0)
    return (
      <>
        {droppedLine}
        <p class="nb-empty">{FAVORITE_TEXT.notebookNone}</p>
      </>
    );
  const list = [...nb.favorites].sort(
    (a, b) => Number(b.active) - Number(a.active) || Number(a.id.slice(4)) - Number(b.id.slice(4)),
  );
  return (
    <>
      {droppedLine}
      <p class="nb-intro">
        Families followed in “{info.name}”. Up to three are followed at a time; unpinned families stay listed
        here.
      </p>
      {refusal ? (
        <p class="constraint" role="status">
          {refusal}
        </p>
      ) : null}
      <ul class="nb-cards fav-list" aria-label="Favorite families" data-testid="favorites-list">
        {list.map((f) => {
          const species = speciesNameOf(f.speciesId);
          return (
            <li key={f.id}>
              <article class="card nb-card" aria-labelledby={`fav-nb-${f.id}`}>
                <h2 id={`fav-nb-${f.id}`}>
                  <FavoriteGlyph pattern={f.pattern} /> {nameOf(f)}
                </h2>
                <p class="sub">
                  {species} · {fromRootText(species, f.rootBirthId)}
                </p>
                <p data-testid="favorite-state">{favoriteStateText(f)}</p>
                {!f.active && f.extinct === null ? (
                  <button
                    class="btn"
                    onClick={() => void favoriteOp({ kind: 'pin', id: f.id }).then(setRefusal)}
                  >
                    {FAVORITE_TEXT.pinAgain}
                  </button>
                ) : null}
              </article>
            </li>
          );
        })}
      </ul>
    </>
  );
}
