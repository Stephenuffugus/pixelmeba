/**
 * One arm of a comparison (UX §5.6): its own renderer instance fed only by that arm's snapshots.
 * Cameras are synced: moving either view moves the other. Only B accepts the queued change; a tap on
 * A with a placement tool explains that A is the baseline.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { DishRenderer } from '@render/renderer';
import { loadAtlas } from '../atlas';
import { attachGestures } from '../gestures';
import { attachCompareRenderer, compareArmMeta, compareState, leadCamera, queueOnB, setTool, showToast, tool, type CompareArm } from '../state';
import { clock } from '../panels/CompareText';

export function CompareViewport({ arm }: { arm: CompareArm }) {
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
        paints: () => arm === 'B' && tool.value.kind === 'feed' && tool.value.paint,
        onCameraMoved: () => leadCamera(arm),
        onTap: (_sx, _sy, wx, wy) => onTap(arm, wx, wy),
        onStroke: (points) => {
          const t = tool.value;
          if (arm === 'B' && t.kind === 'feed') {
            void queueOnB({ kind: 'deposit', materialId: t.materialId, points, radius: t.radius, dose: t.dose });
            setTool({ kind: 'look' });
          }
        },
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

  const title = arm === 'A' ? 'A · baseline' : 'B · with your change';
  const ticks = m && c ? m.tick - c.baselineTick : 0;
  return (
    <section class={`cv cv-${arm}`} aria-label={arm === 'A' ? 'Dish A: the baseline, left unchanged' : 'Dish B: the copy that gets your change'} data-testid={`compare-view-${arm}`}>
      <div class="cv-host" ref={host} data-testid={`compare-canvas-${arm}`} />
      {!ready ? <p class="cv-loading">Preparing {arm}…</p> : null}
      <p class="cv-label" data-testid={`compare-label-${arm}`}>
        <strong>{title}</strong>
        <span>
          +{clock(ticks)} · {m?.count ?? '…'} alive
        </span>
      </p>
    </section>
  );
}

function onTap(arm: CompareArm, wx: number, wy: number): void {
  const t = tool.value;
  if (t.kind === 'look') return;
  if (arm === 'A') {
    showToast('A is the baseline and stays unchanged. Place your change on B.', 3200);
    return;
  }
  const queued =
    t.kind === 'addLife'
      ? queueOnB({ kind: 'inoculate', speciesId: t.speciesId, x: wx, y: wy, radius: t.radius, count: t.count })
      : queueOnB({ kind: 'deposit', materialId: t.materialId, points: [[wx, wy]], radius: t.radius, dose: t.dose });
  setTool({ kind: 'look' }); // one change per comparison
  // m4: a refused placement keeps the chosen food or organism, so the next tap can place it.
  void queued.then((accepted) => {
    if (accepted === 0 && tool.value.kind === 'look' && (compareState.value?.interventions.length ?? 0) === 0) setTool(t);
  });
}
