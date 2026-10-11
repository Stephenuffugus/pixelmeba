/**
 * "Follow this family" (UX §5.8): an optional nickname, then one of three marker shapes, then Follow.
 * Shown inside the inspector for the selected organism. With three families already followed it says so
 * and offers to unpin one (CT §12.10 "favorites 3"). Notebook state only: nothing here is a command.
 */
import { useState } from 'preact/hooks';
import { FAVORITE_PATTERNS, NICKNAME_MAX, type FavoritePattern } from '@persist/notebook';
import { favoriteOp, followFamily, followTarget, nameOf, notebook } from '../favorites';
import { FAVORITE_TEXT, PATTERN_NAMES } from '../strings/favorites';
import { FavoriteGlyph } from './FavoriteSlots';

export function FavoriteFollow({ birthId, speciesName }: { birthId: number; speciesName: string }) {
  const [nickname, setNickname] = useState('');
  const [pattern, setPattern] = useState<FavoritePattern>(() => firstFreePattern());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const active = notebook.value?.favorites.filter((f) => f.active) ?? [];
  const close = () => (followTarget.value = null);
  const titleId = `fav-follow-title-${birthId}`;
  return (
    <div class="answer fav-follow" role="group" aria-labelledby={titleId} data-testid="favorite-follow">
      <h3 id={titleId}>
        {FAVORITE_TEXT.sheetTitle}: {speciesName} #{birthId}
      </h3>
      {active.length >= 3 ? (
        <>
          <p data-testid="favorite-full">{FAVORITE_TEXT.full}</p>
          <ul class="fav-unpin-list" aria-label="Followed families">
            {active.map((f) => (
              <li key={f.id}>
                <span class="fav-unpin-name">
                  <FavoriteGlyph pattern={f.pattern} /> {nameOf(f)}
                </span>
                <button class="btn" onClick={() => void favoriteOp({ kind: 'unpin', id: f.id })}>
                  {FAVORITE_TEXT.unpinOne} {nameOf(f)}
                </button>
              </li>
            ))}
          </ul>
          <button class="btn" onClick={close}>
            {FAVORITE_TEXT.cancel}
          </button>
        </>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            void followFamily(birthId, nickname.trim(), pattern).then((refused) => {
              setBusy(false);
              if (refused) setError(refused);
              else close();
            });
          }}
        >
          <label class="fav-field">
            {FAVORITE_TEXT.nicknameLabel}
            <input value={nickname} maxLength={NICKNAME_MAX} autocomplete="off" data-testid="favorite-nickname" onInput={(e) => setNickname(e.currentTarget.value)} />
          </label>
          <p class="sub fav-note">{FAVORITE_TEXT.nicknameNote}</p>
          <fieldset class="fav-patterns">
            <legend>{FAVORITE_TEXT.patternLegend}</legend>
            {FAVORITE_PATTERNS.map((p) => (
              <label key={p} class="fav-pattern">
                <input type="radio" name={`fav-pattern-${birthId}`} value={p} checked={pattern === p} onChange={() => setPattern(p)} data-testid={`favorite-pattern-${p}`} />
                <FavoriteGlyph pattern={p} />
                <span>{PATTERN_NAMES[p]}</span>
              </label>
            ))}
          </fieldset>
          {error ? (
            <p class="constraint" role="status">
              {error}
            </p>
          ) : null}
          <div class="fav-actions">
            <button class="btn primary" type="submit" disabled={busy} data-testid="favorite-confirm">
              {FAVORITE_TEXT.confirm}
            </button>
            <button class="btn" type="button" onClick={close}>
              {FAVORITE_TEXT.cancel}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** The first shape no followed family uses (so families start apart), else the circle. */
function firstFreePattern(): FavoritePattern {
  const used = new Set((notebook.value?.favorites ?? []).filter((f) => f.active).map((f) => f.pattern));
  return FAVORITE_PATTERNS.find((p) => !used.has(p)) ?? 'circle';
}
