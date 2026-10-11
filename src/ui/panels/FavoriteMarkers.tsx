/**
 * Aggregate markers of followed families (CT §12.10 "descendants highlighted ≤ 200"; SPEC §12.6 "then an
 * aggregate marker"): beyond 200 members the dish marks only the first 200, and this HTML overlay shows
 * one "+{n}" marker at the mean position of all members, from the snapshot's slot summary only. Static
 * (no animation, so reduced motion needs nothing more). Decorative: the slot button states the count.
 */
import { useEffect, useRef } from 'preact/hooks';
import { getRenderer } from '../state';
import { favoriteById, favoriteSlots } from '../favorites';
import { FavoriteGlyph } from './FavoriteSlots';

export function FavoriteMarkers() {
  const slots = favoriteSlots.value.filter((s) => s.aggregate !== null && favoriteById(s.id));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (slots.length === 0) return;
    let raf = 0;
    const place = () => {
      const r = getRenderer();
      const host = ref.current;
      if (r && host) {
        slots.forEach((s, k) => {
          const el = host.children[k] as HTMLElement | undefined;
          if (!el || !s.aggregate) return;
          const [sx, sy] = r.camera.worldToScreen(s.aggregate.x, s.aggregate.y);
          el.hidden = sx < -40 || sy < -40 || sx > r.camera.viewW + 40 || sy > r.camera.viewH + 40;
          el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
        });
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [slots.map((s) => `${s.id}:${s.aggregate?.x}:${s.aggregate?.y}`).join('|')]);
  if (slots.length === 0) return null;
  return (
    <div class="fav-markers" ref={ref} aria-hidden="true" data-testid="favorite-markers">
      {slots.map((s) => (
        <span key={s.id} class="fav-marker" hidden>
          <FavoriteGlyph pattern={favoriteById(s.id)!.pattern} size={18} />+{s.aggregate!.count - s.highlighted}
        </span>
      ))}
    </div>
  );
}
