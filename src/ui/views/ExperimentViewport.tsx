/**
 * One copy of a paired experiment card (UX §5.6 comparison views): its own renderer, fed only by that
 * copy's snapshots, with the cameras synced. Nothing is placed here: the card's one change is already
 * on B, so gestures only move the camera.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { DishRenderer } from '@render/renderer';
import { loadAtlas } from '../atlas';
import { attachGestures } from '../gestures';
import { clock } from '../panels/CompareText';
import { attachCompareRenderer, compareArmMeta, compareState, leadCamera, type CompareArm } from '../state';

export function ExperimentViewport({ arm, title, description }: { arm: CompareArm; title: string; description: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const m = compareArmMeta.value[arm];
  const c = compareState.value;

  useEffect(() => {
    let disposed = false;
    let detach: (() => void) | null = null;
    let r: DishRenderer | null = null;
    void (async () => {
      const atlas = await loadAtlas();
      if (disposed || !host.current) return;
      r = await DishRenderer.create(host.current, atlas.url, atlas.manifest);
      if (disposed) {
        r.destroy();
        return;
      }
      attachCompareRenderer(arm, r);
      detach = attachGestures(host.current, r, {
        paints: () => false,
        onCameraMoved: () => leadCamera(arm),
        onTap: () => undefined,
        onStroke: () => undefined,
      });
      setReady(true);
    })();
    return () => {
      disposed = true;
      detach?.();
      attachCompareRenderer(arm, null);
      r?.destroy();
    };
  }, [arm]);

  const ticks = m && c ? m.tick - c.baselineTick : 0;
  return (
    <section class={`cv cv-${arm}`} aria-label={description} data-testid={`experiment-view-${arm}`}>
      <div class="cv-host" ref={host} />
      {!ready ? <p class="cv-loading">Preparing {arm}…</p> : null}
      <p class="cv-label xp-cv-label" data-testid={`experiment-label-${arm}`}>
        <strong>{title}</strong>
        <span>
          +{clock(ticks)} · {m?.count ?? '…'} alive
        </span>
      </p>
    </section>
  );
}
