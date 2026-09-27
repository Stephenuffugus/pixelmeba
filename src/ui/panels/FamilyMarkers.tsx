/**
 * Family rings (UX §5.3 "Where is its family?"): one ring over each living relative returned by the
 * worker's family query, positioned from the renderer's latest snapshot positions every frame. A
 * relative that has died or split since the query has no position and loses its ring. Close family
 * (parent, sibling, daughter) gets a double ring, other relatives a dashed one, so the meaning never
 * depends on color. Decorative: the inspector lists the same members as text and buttons.
 */
import { useEffect, useRef } from 'preact/hooks';
import { familyView, getRenderer } from '../state';

export function FamilyMarkers() {
  const f = familyView.value;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!f || f.members.length === 0) return;
    let raf = 0;
    const place = () => {
      const r = getRenderer();
      const host = ref.current;
      if (r && host) {
        const cam = r.camera;
        for (let k = 0; k < f.members.length; k++) {
          const el = host.children[k] as HTMLElement | undefined;
          const m = f.members[k]!;
          if (!el) continue;
          const p = r.positionOf(m.entityId);
          if (!p) {
            el.hidden = true;
            continue;
          }
          const [sx, sy] = cam.worldToScreen(p[0], p[1]);
          el.hidden = sx < -24 || sy < -24 || sx > cam.viewW + 24 || sy > cam.viewH + 24;
          el.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px)`;
        }
      }
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [f]);
  if (!f || f.members.length === 0) return null;
  return (
    <div class="family-markers" ref={ref} aria-hidden="true" data-testid="family-markers">
      {f.members.map((m) => (
        <span
          key={m.birthId}
          class={`family-marker${m.relation === 'sibling' || m.relation === 'child' || m.relation === 'parent' ? ' close' : ''}`}
          hidden
        />
      ))}
    </div>
  );
}
