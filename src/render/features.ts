/**
 * Module feature layers for the renderer (SPEC §9 visuals, UX §6.2, §7.3 "feature rims"; P2.1).
 *
 * Which marks an organism shows is a pure function of the snapshot's cue bits (E_CUE, E_CUE2), life
 * state and its cell's film band, which the worker sets only from the genome and measured state (a
 * notch only on an E01 carrier, a pocket only on an E05 carrier with its real fill band, a seam only on
 * an E03 carrier that is Preparing, Resting or Waking, a foot only on an anchored E04 carrier, …). At
 * normal zoom at most two marks show (live state first, then stored energy and film, then plain carrier
 * marks); a selected organism shows all of them (UX §6.2).
 *
 * The mark frames are atlas frames (ARCH §10.1): tools/art-build.ts packs every frame of every layer
 * in all four headings into the organism atlas as `feature/<layer>/<heading>/<frame>` and lists each
 * layer in the manifest's `features` table; tools/content-validate.ts fails when an enabled module's
 * mark is missing. The renderer only looks them up (ARCH §3: snapshot types and the atlas manifest,
 * nothing from art/src, no runtime texture building).
 */
import {
  CUE2_ANCHORED,
  CUE2_DETRITUS_INTAKE,
  CUE2_LINKED,
  CUE2_MOD_E04,
  CUE2_MOD_E06,
  CUE2_MOD_E07,
  CUE2_MOD_E08,
  CUE2_MOD_E09,
  CUE2_MOD_E10,
  CUE2_MOD_E12,
  CUE2_RELEASING_PROTEIN,
  CUE2_SEEKING_LIGHT,
  CUE_MOD_E01,
  CUE_MOD_E03,
  CUE_MOD_E05,
  CUE_FEEDING,
  CUE_RESERVE_BAND_MASK,
  CUE_RESERVE_BAND_SHIFT,
  CUE_STRESSED,
} from '@worker/protocol';
import { STAIN_MS, stainAlpha } from './world3';

/** The marks featureLayers() can pick; each is a module's content `visualLayer` id. */
export type FeatureLayerId =
  | 'starch_notch'
  | 'reserve_pocket'
  | 'resting_seam'
  | 'anchor_foot'
  | 'shade_patch'
  | 'light_trail'
  | 'debris_granule'
  | 'protein_notches'
  | 'matrix_edge'
  | 'adhesion_link';
/** Canonical order (the atlas manifest's `features` order). */
export const FEATURE_LAYER_IDS: readonly FeatureLayerId[] = [
  'starch_notch',
  'reserve_pocket',
  'resting_seam',
  'anchor_foot',
  'shade_patch',
  'light_trail',
  'debris_granule',
  'protein_notches',
  'matrix_edge',
  'adhesion_link',
];

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
 * Per-organism drawing context beyond the cue words (all from the snapshot or the settings):
 * `filmBand` the film level of its cell (0–3: none, then thirds of the 0.50 C cap; see filmLevelBand),
 * `reduced` reduced motion (UX §7.4: no trails, pulses become static marks), `pulseOn` whether a pulsing
 * mark shows its bright frame now (the renderer alternates it on time; ignored in reduced motion).
 */
export interface FeatureContext {
  readonly filmBand?: number | undefined;
  readonly reduced?: boolean | undefined;
  readonly pulseOn?: boolean | undefined;
}

/**
 * Which feature layer each cue bit drives (the single place the mapping lives; tests/render prove every
 * bit maps to exactly one layer and nothing shows when it is 0). Some layers need two bits: the anchor
 * foot shows only on an E04 carrier that is anchored, the link pixels only on a linked E12 carrier, the
 * light trail only on an E07 carrier that is moving toward light.
 */
export const CUE_LAYER: Readonly<Record<number, FeatureLayerId>> = {
  [CUE_MOD_E01]: 'starch_notch',
  [CUE_MOD_E03]: 'resting_seam',
  [CUE_MOD_E05]: 'reserve_pocket',
};
export const CUE2_LAYER: Readonly<Record<number, FeatureLayerId>> = {
  [CUE2_ANCHORED]: 'anchor_foot',
  [CUE2_MOD_E04]: 'anchor_foot',
  [CUE2_MOD_E06]: 'shade_patch',
  [CUE2_MOD_E07]: 'light_trail',
  [CUE2_SEEKING_LIGHT]: 'light_trail',
  [CUE2_MOD_E08]: 'debris_granule',
  [CUE2_DETRITUS_INTAKE]: 'debris_granule',
  [CUE2_MOD_E09]: 'protein_notches',
  [CUE2_RELEASING_PROTEIN]: 'protein_notches',
  [CUE2_MOD_E10]: 'matrix_edge',
  [CUE2_MOD_E12]: 'adhesion_link',
  [CUE2_LINKED]: 'adhesion_link',
};

/**
 * Fill `out` with the feature layers to draw for one organism; returns how many were written.
 * `cue2` (E_CUE2, protocol 2) and `ctx` are optional: without them only the Phase 2 marks can show.
 * Order is priority order (live state first, then stored energy and film, then plain carrier marks):
 * resting-cycle seam, anchor foot, link pixels, light trail, granule pulse, protein release, reserve
 * pocket, matrix edge, starch notch, shade patch, idle granule, idle notches, idle seam.
 */
export function featureLayers(cue: number, life: number, selected: boolean, out: LayerPick[], cue2 = 0, ctx: FeatureContext = {}): number {
  let n = 0;
  const push = (layer: FeatureLayerId, frame: number) => {
    const slot = out[n];
    if (slot) {
      slot.layer = layer;
      slot.frame = frame;
    } else out[n] = { layer, frame };
    n++;
  };
  const reduced = ctx.reduced === true;
  const pulseOn = reduced || ctx.pulseOn !== false;
  // SPEC §9 E03: "small folded seam; folded pose only while resting". Every carrier shows the small
  // seam (frame 0); the resting cycle shows its state frames first because it is live information.
  const cycling = life >= LIFE_PREPARING && life <= LIFE_WAKING;
  if (cue & CUE_MOD_E03 && cycling) push('resting_seam', life - LIFE_PREPARING);
  // SPEC §9 E04 "foot only while attached"; E12 "thin pixel connections" (only while linked).
  if (cue2 & CUE2_MOD_E04 && cue2 & CUE2_ANCHORED) push('anchor_foot', 0);
  if (cue2 & CUE2_MOD_E12 && cue2 & CUE2_LINKED) push('adhesion_link', 0);
  // E07 "two trailing motility pixels while moving"; UX §7.4 reduced motion: trails none.
  if (cue2 & CUE2_MOD_E07 && cue2 & CUE2_SEEKING_LIGHT && !reduced) push('light_trail', 0);
  // E08 "pulses only on recorded detritus intake"; E09 "brief pale release marks" (static in reduced motion).
  const granulePulse = (cue2 & CUE2_MOD_E08) !== 0 && (cue2 & CUE2_DETRITUS_INTAKE) !== 0;
  const releasing = (cue2 & CUE2_MOD_E09) !== 0 && (cue2 & CUE2_RELEASING_PROTEIN) !== 0;
  if (granulePulse) push('debris_granule', pulseOn ? 1 : 0);
  if (releasing) push('protein_notches', 1);
  if (cue & CUE_MOD_E05) push('reserve_pocket', (cue & CUE_RESERVE_BAND_MASK) >> CUE_RESERVE_BAND_SHIFT);
  // E10 "edge film texture with opacity by film carbon": frame = its cell's film band.
  if (cue2 & CUE2_MOD_E10) push('matrix_edge', Math.min(3, Math.max(0, Math.floor(ctx.filmBand ?? 0))));
  if (cue & CUE_MOD_E01) push('starch_notch', 0);
  if (cue2 & CUE2_MOD_E06) push('shade_patch', 0);
  if (cue2 & CUE2_MOD_E08 && !granulePulse) push('debris_granule', 0);
  if (cue2 & CUE2_MOD_E09 && !releasing) push('protein_notches', 0);
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

// -------------------------------------------------------------------------------------------------
// Reduced motion (UX §7.4 filled in at P4.9; D08 "Reduced motion removes camera easing, repeating pulses
// and trails while retaining state patterns and text"). Every time-varying dish effect's choice is one
// of these pure functions; src/render/renderer.ts only calls them, and tests/render/reduced-motion.test.ts
// checks each with reduced motion on and off. Nothing here reads the world: the inputs are snapshot
// cues, the event type and the renderer's own clock.

/** The split flash after a committed division (motion on). */
export const SPLIT_FLASH_MS = 380;
/** UX §7.4: "division flash → static split frame for 1 s". */
export const SPLIT_STATIC_MS = 1000;
/** The expanding ring where the player just placed something (motion on). */
export const PLACEMENT_RING_MS = 700;
/** P4.13 (UX §6.5): the placement ring grows from 0 to the dose radius over this long, then fades out by PLACEMENT_RING_MS. */
export const PLACEMENT_EXPAND_MS = 300;
/** Reduced motion: the same ring, still, at its full radius, for this long. */
export const PLACEMENT_STATIC_MS = 1000;
/** Reduced motion: a death shows the dissolve's still frame (or a fungal segment's decaying tile) this long. */
export const DEATH_STATIC_MS = 600;
/** Period of a feature mark's two-frame pulse (E08 granule on detritus intake), motion on. */
export const FEATURE_PULSE_MS = 400;

export type EffectKind = 'split' | 'deposit';

/** One transient effect on the dish: what it is, how long it stays and whether it moves. */
export interface EffectSpec {
  readonly kind: EffectKind;
  readonly durationMs: number;
  /** false: drawn still (no growth, no fade) for its whole life (reduced motion). */
  readonly animated: boolean;
}

/** A snapshot event's effect, if it has one: only a committed birth ('birth') draws one (the split). */
export function effectForEvent(type: string, reduced: boolean): EffectSpec | null {
  if (type !== 'birth') return null;
  return reduced ? { kind: 'split', durationMs: SPLIT_STATIC_MS, animated: false } : { kind: 'split', durationMs: SPLIT_FLASH_MS, animated: true };
}

/** The placement ring's effect (a placement the player made). */
export function placementEffect(reduced: boolean): EffectSpec {
  return reduced ? { kind: 'deposit', durationMs: PLACEMENT_STATIC_MS, animated: false } : { kind: 'deposit', durationMs: PLACEMENT_RING_MS, animated: true };
}

/** How an effect is drawn at fraction `t` (0..1) of its life: ring radius, stroke alpha, split divider. */
export interface EffectLook {
  readonly radius: number;
  readonly alpha: number;
  /** A short bar across the ring: the static split frame ("it split in two"). */
  readonly divider: boolean;
}

export function effectLook(spec: EffectSpec, baseRadius: number, t: number): EffectLook {
  const u = Math.min(1, Math.max(0, t));
  if (spec.kind === 'split') {
    return spec.animated ? { radius: baseRadius * (0.4 + u), alpha: 0.7 * (1 - u), divider: false } : { radius: baseRadius * 0.9, alpha: 0.7, divider: true };
  }
  if (!spec.animated) return { radius: baseRadius, alpha: 0.6, divider: false };
  // P4.13: expand 0 → the dose radius over PLACEMENT_EXPAND_MS (ease-out), then hold it and fade by the end.
  const ms = u * spec.durationMs;
  const grow = Math.min(1, ms / PLACEMENT_EXPAND_MS);
  const g = 1 - (1 - grow) * (1 - grow);
  const fade = ms <= PLACEMENT_EXPAND_MS ? 1 : Math.max(0, 1 - (ms - PLACEMENT_EXPAND_MS) / (spec.durationMs - PLACEMENT_EXPAND_MS));
  return { radius: baseRadius * g, alpha: u >= 1 ? 0 : 0.6 * fade, divider: false };
}

/**
 * The frame of a body animation (move, idle, feeding, stress): it cycles on the clock with motion on;
 * in reduced motion, and in the still Preparing/Resting/Waking poses (dormant), it is the animation's
 * reducedMotionFrame, so the feeding or stress pose stays as a static state mark.
 */
export function bodyFrameIndex(frames: number, durationMs: number, reducedMotionFrame: number, reduced: boolean, dormant: boolean, clock: number): number {
  if (reduced || dormant || frames <= 1 || !(durationMs > 0)) return reducedMotionFrame;
  return Math.floor(clock / durationMs) % frames;
}

/**
 * P4.13 (UX §7.1 "feeding and reproduction play only after committed events"; UX §6.5 eating pulse): which
 * body animation an organism shows. The feeding animation needs the snapshot's CUE_FEEDING bit (recorded
 * intake this tick), an active life state and no locomotion; without the cue it is never chosen.
 */
export type BodyAnim = 'stress' | 'feed' | 'move' | 'idle';
export function bodyAnimFor(cue: number, moving: boolean, dormant: boolean, has: { readonly stress: boolean; readonly feed: boolean; readonly move: boolean }): BodyAnim {
  if (cue & CUE_STRESSED && has.stress) return 'stress';
  if (!dormant && cue & CUE_FEEDING && has.feed && !moving) return 'feed';
  return has.move ? 'move' : 'idle';
}

/** A feed animation whose cue just turned on: its clock starts at the next rendered frame. */
export const FEED_START_PENDING = -1;

/**
 * P4.13 first feeding pulse: the feed animation's start, carried from snapshot to snapshot per organism.
 * It starts (pending) in the snapshot where the feeding animation turns on, keeps its start while it stays
 * on, and is cleared (NaN) when it stops, so every new bout of eating starts at frame 0.
 */
export function feedStartAfterSnapshot(feedingNow: boolean, previousStart: number): number {
  if (!feedingNow) return Number.NaN;
  return Number.isNaN(previousStart) ? FEED_START_PENDING : previousStart;
}

/**
 * The clock the body frame is chosen on: for a feeding organism, ms since its feed animation started (the
 * first rendered frame after the cue turned on is 0, so frame 0 shows within one snapshot interval of the
 * recorded intake); otherwise the free-running per-organism clock.
 */
export function feedFrameClock(start: number, now: number, freeClock: number): number {
  if (Number.isNaN(start)) return freeClock;
  if (start === FEED_START_PENDING) return 0;
  return Math.max(0, now - start);
}

/** A newborn's alpha over its first snapshot: a short fade in with motion on, full at once in reduced motion. */
export function newbornAlpha(justBorn: boolean, reduced: boolean, alpha: number): number {
  return justBorn && !reduced ? 0.75 + 0.25 * alpha : 1;
}

/** How long a death's ghost stays: the dissolve's frames, a fungal segment's decay, or the static still. */
export function ghostDurationMs(death: { readonly frames: number; readonly durationMs: number } | null, reduced: boolean, decayMs: number): number {
  if (reduced) return DEATH_STATIC_MS;
  return death ? death.frames * death.durationMs : decayMs;
}

/** The dissolve frame at `t` ms after the death (the still frame in reduced motion). */
export function ghostFrameIndex(death: { readonly frames: number; readonly durationMs: number; readonly reducedMotionFrame: number }, reduced: boolean, t: number): number {
  if (reduced) return death.reducedMotionFrame;
  return Math.min(death.frames - 1, Math.floor(t / death.durationMs));
}

/** A dead fungal segment's decaying tile: fades out with motion on, held still in reduced motion. */
export function decayTileAlpha(t: number, total: number, reduced: boolean): number {
  return reduced ? 1 : Math.max(0, 1 - t / total);
}

/** Whether a pulsing feature mark shows its bright frame now; reduced motion: always (a static mark). */
export function featurePulseOn(clock: number, reduced: boolean): boolean {
  return reduced || Math.floor(clock / FEATURE_PULSE_MS) % 2 === 0;
}

/**
 * The stain an emptied food object leaves (src/render/world3.ts stainAlpha): fades over STAIN_MS with
 * motion on; in reduced motion it is held at its first alpha and removed after the same time.
 */
export function stainAlphaAt(t: number, reduced: boolean): number {
  if (!reduced) return stainAlpha(t);
  return t >= 0 && t < STAIN_MS ? stainAlpha(0) : 0;
}
