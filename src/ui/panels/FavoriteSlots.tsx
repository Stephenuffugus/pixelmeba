/**
 * Favorite marker slots (UX §3.1 "three favorite marker slots at the right edge"; §5.8 "Marker slots
 * show member count; tap = Find"). One ≥ 48 px button per followed family, with its shape glyph (circle,
 * triangle or square: shape, never colour alone), its name and its living member count from the latest
 * snapshot. No empty or broken buttons: a slot exists only for a followed family with members.
 */
import type { FavoritePattern } from '@persist/notebook';
import { favoriteById, favoriteSlots, findFavorite, nameOf } from '../favorites';
import { findLabel } from '../strings/favorites';

/** The marker shape as an outline glyph (the same shapes the dish draws around highlighted members). */
export function FavoriteGlyph({ pattern, size = 24 }: { pattern: FavoritePattern; size?: number }) {
  return (
    <svg class="fav-glyph" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round">
      {pattern === 'circle' ? <circle cx="12" cy="12" r="8" /> : pattern === 'triangle' ? <path d="M12 3.5 L21 19.5 L3 19.5 Z" /> : <rect x="4.5" y="4.5" width="15" height="15" />}
    </svg>
  );
}

export function FavoriteSlots() {
  const slots = favoriteSlots.value.filter((s) => favoriteById(s.id)?.active && s.members > 0);
  if (slots.length === 0) return null;
  return (
    <div class="fav-slots" role="group" aria-label="Followed families" data-testid="favorite-slots">
      {slots.map((s) => {
        const f = favoriteById(s.id)!;
        const name = nameOf(f);
        return (
          <button key={s.id} class="btn fav-slot" aria-label={findLabel(name, s.members)} data-testid={`favorite-slot-${s.id}`} onClick={() => findFavorite(s.id)}>
            <FavoriteGlyph pattern={f.pattern} />
            <span class="fav-slot-name">{name}</span>
            <span class="fav-slot-count" data-testid="favorite-count">
              {s.members}
            </span>
          </button>
        );
      })}
    </div>
  );
}
