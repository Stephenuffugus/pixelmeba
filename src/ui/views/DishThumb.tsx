/**
 * A dish's live thumbnail (P4.3; UX §2 "live thumbnail", §2.2 "Square live-state thumbnails"): the
 * 32 × 32 majority-species grid (src/worker/thumbnail.ts) drawn on a 96 × 96 canvas, each block 3 × 3
 * pixels in its species' identity colour (src/render/speciesColors.ts) on dish water, inside the rim.
 * It is always a recorded state (a snapshot, a save's index copy or a start's preview), never painted.
 */
import { useEffect, useRef } from 'preact/hooks';
import { speciesHex } from '@render/speciesColors';
import { parseThumb, THUMB_SIZE } from '@worker/thumbnail';
import { HOME_TEXT } from '../strings/home';

const PX = 96;
const BLOCK = PX / THUMB_SIZE;
/** UX §6.1 environment colours: outside, water, rim. */
const OUTSIDE = '#14252D';
const WATER = '#D6E7E5';
const RIM = '#2C3F49';

export function DishThumb(props: { readonly thumb: string | null | undefined; readonly name: string; readonly testId?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const t = parseThumb(props.thumb);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g || !t) return;
    g.imageSmoothingEnabled = false;
    g.fillStyle = OUTSIDE;
    g.fillRect(0, 0, PX, PX);
    g.save();
    g.beginPath();
    g.arc(PX / 2, PX / 2, PX / 2 - 3, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = WATER;
    g.fillRect(0, 0, PX, PX);
    for (let by = 0; by < THUMB_SIZE; by++) {
      for (let bx = 0; bx < THUMB_SIZE; bx++) {
        const v = t.grid[by * THUMB_SIZE + bx]!;
        if (v === 0) continue;
        g.fillStyle = speciesHex(t.speciesIds[v - 1]!);
        g.fillRect(bx * BLOCK, by * BLOCK, BLOCK, BLOCK);
      }
    }
    g.restore();
    g.strokeStyle = RIM;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(PX / 2, PX / 2, PX / 2 - 2.5, 0, Math.PI * 2);
    g.stroke();
  }, [props.thumb]);
  if (!t) return null;
  return (
    <canvas
      ref={ref}
      class="dish-thumb"
      width={PX}
      height={PX}
      role="img"
      aria-label={HOME_TEXT.thumbLabel(props.name)}
      data-testid={props.testId ?? 'dish-thumb'}
    />
  );
}
