/**
 * Module feature layers for the renderer (SPEC §9 visuals, UX §6.2, §7.3 "feature rims"; P2.1).
 *
 * Which marks an organism shows is a pure function of the snapshot's cue bits and life state, which
 * the worker sets only from the genome and measured state (a notch only on an E01 carrier, a pocket
 * only on an E05 carrier with its real fill band, a seam only on an E03 carrier that is Preparing,
 * Resting or Waking). At normal zoom at most two marks show (state first, then stored energy, then
 * the producer marking); a selected organism shows all of them (UX §6.2).
 */
import { FEATURE_LAYERS, type FeatureLayerId } from '@art/src/layers/modules';
import { hexToRgba } from '@art/src/palette';
import { orient } from '@art/src/sprite';
import { CUE_MOD_E01, CUE_MOD_E03, CUE_MOD_E05, CUE_RESERVE_BAND_MASK, CUE_RESERVE_BAND_SHIFT } from '@worker/protocol';

/** Life states as saved in the lifeState column (see src/sim/entities.ts LIFE_*). */
const LIFE_PREPARING = 1;
const LIFE_WAKING = 3;

export interface LayerPick {
  layer: FeatureLayerId;
  frame: number;
}

/** Marks shown at normal zoom when the organism is not selected. */
export const MAX_UNSELECTED_MARKS = 2;

/**
 * Fill `out` with the feature layers to draw for one organism; returns how many were written.
 * Order is priority order: resting-cycle seam, reserve pocket, starch notch, idle seam.
 */
export function featureLayers(cue: number, life: number, selected: boolean, out: LayerPick[]): number {
  let n = 0;
  const push = (layer: FeatureLayerId, frame: number) => {
    const slot = out[n];
    if (slot) {
      slot.layer = layer;
      slot.frame = frame;
    } else out[n] = { layer, frame };
    n++;
  };
  // SPEC §9 E03: "small folded seam; folded pose only while resting". Every carrier shows the small
  // seam (frame 0); the resting cycle shows its state frames first because it is live information.
  const cycling = life >= LIFE_PREPARING && life <= LIFE_WAKING;
  if (cue & CUE_MOD_E03 && cycling) push('resting_seam', life - LIFE_PREPARING);
  if (cue & CUE_MOD_E05) push('reserve_pocket', (cue & CUE_RESERVE_BAND_MASK) >> CUE_RESERVE_BAND_SHIFT);
  if (cue & CUE_MOD_E01) push('starch_notch', 0);
  if (cue & CUE_MOD_E03 && !cycling) push('resting_seam', 0);
  return selected ? n : Math.min(n, MAX_UNSELECTED_MARKS);
}

export interface LayerAtlas {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray<ArrayBuffer>;
  /** Frame rectangle by `${layer}/${frame}/${heading}`. */
  readonly rects: Readonly<Record<string, readonly [number, number, number, number]>>;
}

const TILE = 16;
const PAD = 2;

export function layerKey(layer: FeatureLayerId, frame: number, heading: number): string {
  return `${layer}/${frame}/${heading}`;
}

/**
 * Pack every layer frame in all four headings into one RGBA image (deterministic; nearest-neighbor
 * pixels exactly as authored). The renderer uploads it once as the feature-layer texture.
 */
export function buildLayerAtlas(): LayerAtlas {
  const tiles: { key: string; rgba: Uint8Array }[] = [];
  for (const def of FEATURE_LAYERS) {
    const colors = def.palette.map((hex, i) => (i === 0 ? [0, 0, 0, 0] : hexToRgba(hex)));
    def.frames.forEach((f, fi) => {
      for (let h = 0; h < 4; h++) {
        const o = orient(f, h);
        const rgba = new Uint8Array(TILE * TILE * 4);
        for (let i = 0; i < o.data.length; i++) {
          const c = colors[o.data[i]!];
          if (!c) throw new Error(`${def.id}: palette index ${o.data[i]!} missing`);
          rgba.set(c, i * 4);
        }
        tiles.push({ key: layerKey(def.id, fi, h), rgba });
      }
    });
  }
  const cell = TILE + PAD * 2;
  const cols = 16;
  const width = cols * cell;
  const height = Math.ceil(tiles.length / cols) * cell;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const rects: Record<string, readonly [number, number, number, number]> = {};
  tiles.forEach((t, k) => {
    const x0 = (k % cols) * cell + PAD;
    const y0 = Math.floor(k / cols) * cell + PAD;
    for (let y = 0; y < TILE; y++) rgba.set(t.rgba.subarray(y * TILE * 4, (y + 1) * TILE * 4), ((y0 + y) * width + x0) * 4);
    rects[t.key] = [x0, y0, TILE, TILE];
  });
  return { width, height, rgba, rects };
}
