/**
 * Module feature layers for the renderer (SPEC §9 visuals, UX §6.2, §7.3 "feature rims"; P2.1).
 *
 * Which marks an organism shows is a pure function of the snapshot's cue bits and life state, which
 * the worker sets only from the genome and measured state (a notch only on an E01 carrier, a pocket
 * only on an E05 carrier with its real fill band, a seam only on an E03 carrier that is Preparing,
 * Resting or Waking). At normal zoom at most two marks show (state first, then stored energy, then
 * the producer marking); a selected organism shows all of them (UX §6.2).
 *
 * The mark frames are atlas frames (ARCH §10.1): tools/art-build.ts packs every frame of every layer
 * in all four headings into the organism atlas as `feature/<layer>/<heading>/<frame>` and lists each
 * layer in the manifest's `features` table; tools/content-validate.ts fails when an enabled module's
 * mark is missing. The renderer only looks them up (ARCH §3: snapshot types and the atlas manifest,
 * nothing from art/src, no runtime texture building).
 */
import { CUE_MOD_E01, CUE_MOD_E03, CUE_MOD_E05, CUE_RESERVE_BAND_MASK, CUE_RESERVE_BAND_SHIFT } from '@worker/protocol';

/** The marks featureLayers() can pick; each is a module's content `visualLayer` id. */
export type FeatureLayerId = 'starch_notch' | 'reserve_pocket' | 'resting_seam';
export const FEATURE_LAYER_IDS: readonly FeatureLayerId[] = ['starch_notch', 'reserve_pocket', 'resting_seam'];

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

/** One feature layer as the atlas manifest's `features` table lists it. */
export interface AtlasFeatureLike {
  /** Authored frame size (16); the renderer scales a mark by the body's frame size / size. */
  readonly size: number;
  readonly headings: number;
  readonly frames: number;
}

const HEADING_CHARS = 'eswn';

/** Authored mark size assumed when a manifest entry has no usable size (content:validate requires 16). */
const FEATURE_SIZE_FALLBACK = 16;

/**
 * Draw scale of one mark over a body whose authored frame is `bodyPx` pixels, at sprite scale
 * `scale`: the mark's authored frame (`markSize`, the manifest's features[layer].size) covers the
 * body's frame, so a 16 px mark sits 1:1 on a 16 px body and ×2 on a 32 px body.
 */
export function featureMarkScale(scale: number, bodyPx: number, markSize: number | undefined): number {
  return (scale * bodyPx) / (markSize !== undefined && markSize > 0 ? markSize : FEATURE_SIZE_FALLBACK);
}

/** Atlas key of one mark frame, the same key tools/art-build.ts writes. */
export function featureFrameKey(layer: FeatureLayerId, frame: number, heading: number): string {
  return `feature/${layer}/${HEADING_CHARS[heading] ?? 'e'}/${frame}`;
}

/**
 * Atlas keys for every mark frame the manifest declares, as [layer][frame][heading 0–3]. A layer the
 * manifest does not list gets no keys, so its marks are simply not drawn (content:validate fails the
 * build long before that can ship for an enabled module).
 */
export function featureFrameKeys(features: Readonly<Record<string, AtlasFeatureLike>> | undefined): Partial<Record<FeatureLayerId, string[][]>> {
  const out: Partial<Record<FeatureLayerId, string[][]>> = {};
  for (const layer of FEATURE_LAYER_IDS) {
    const f = features?.[layer];
    if (!f || !(f.frames > 0)) continue;
    const rows: string[][] = [];
    for (let i = 0; i < f.frames; i++) rows.push([0, 1, 2, 3].map((h) => featureFrameKey(layer, i, h)));
    out[layer] = rows;
  }
  return out;
}
