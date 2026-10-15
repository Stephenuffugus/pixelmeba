/**
 * npm run content:validate [-- --write] [-- --atlas path/to/manifest.json]
 * Validates every content pack, prints exact file → field on failure, and checks (or with --write,
 * updates) the manifest's contentHash. Then checks the organism atlas (public/atlas by default) for
 * every frame each enabled species requires (BUILD_DIRECTIVE P1.4, UX §6.2) and every frame of each
 * enabled module's feature mark (ARCH §10.1: dormancy prepare/rest/wake, reserve 4 bands, …) in all
 * four headings. Exit code ≠ 0 on any error.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeContentHash, validateContent, type ContentIssue, type ContentRegistry, type RawFile } from '../src/sim/content/registry';
import { communityOffered, habitatOffered } from '../src/sim/content/habitatRules';
import { applyRecipeOverrides, CommunityError, realizeRecipe, RecipeError } from '../src/sim/recipes';
import { CONTENT_DIR, REPO_ROOT, loadRawPacksFs } from './lib/content-fs';

/** What the atlas check needs to know about one enabled species (from its content record). */
export interface AtlasSpeciesRef {
  readonly id: string;
  readonly assetId: string;
  readonly frameSize: number;
  readonly headings: number;
  /** Content category: 'fungus' and 'virus' select their own frame sets; any other is an organism body sized by frameSize. */
  readonly category: string;
}

/** The atlas reference for one species content record. */
export function atlasSpeciesRef(sp: { readonly id: string; readonly assetId: string; readonly frameSize: number; readonly headings: number; readonly category: string }): AtlasSpeciesRef {
  return { id: sp.id, assetId: sp.assetId, frameSize: sp.frameSize, headings: sp.headings, category: sp.category };
}

/** One required animation: the first name present satisfies it; `frames` is the minimum per heading. */
export interface FrameRequirement {
  readonly anims: readonly string[];
  readonly frames: number;
}

/**
 * Required frames per heading (BUILD_DIRECTIVE P1.4, UX §6.2). Small (16×16): 4 move-or-idle,
 * 4 reproduction (A01 "division"), 2 stress, 3 death. Large (32×32, and 48×48 until the spec
 * says otherwise): 6 move, 4 feed, 4 reproduction, 2 stress, 4 death. Every heading the species
 * declares (1 or 4) must carry every frame. Kept independent of art/src so the validator is a
 * second check on the art build, not a copy of it.
 */
export const SMALL_FRAMES: readonly FrameRequirement[] = [
  { anims: ['move', 'idle'], frames: 4 },
  { anims: ['reproduction'], frames: 4 },
  { anims: ['stress'], frames: 2 },
  { anims: ['death'], frames: 3 },
];
export const LARGE_FRAMES: readonly FrameRequirement[] = [
  { anims: ['move'], frames: 6 },
  { anims: ['feed'], frames: 4 },
  { anims: ['reproduction'], frames: 4 },
  { anims: ['stress'], frames: 2 },
  { anims: ['death'], frames: 4 },
];
/**
 * Fungi (ARCH §10.1 "fungi 16 connection-mask tiles + tip/bud/decaying", UX §6.2): `mask` holds the
 * 16 connection-mask tiles (frame index = mask; bits N = 1, E = 2, S = 4, W = 8), `decaying` the same
 * 16 masks for a dying segment, `tip` and `bud` one overlay each, and `idle` the one-frame thumbnail
 * that UI lists draw (src/ui/atlas.ts drawFrame falls back from move to idle).
 */
export const FUNGUS_FRAMES: readonly FrameRequirement[] = [
  { anims: ['mask'], frames: 16 },
  { anims: ['decaying'], frames: 16 },
  { anims: ['tip'], frames: 1 },
  { anims: ['bud'], frames: 1 },
  { anims: ['idle'], frames: 1 },
];
/** Viruses (UX §6.2 "inspection glyph + density overlay only"): the glyph and the one-frame `idle` thumbnail. */
export const VIRUS_FRAMES: readonly FrameRequirement[] = [
  { anims: ['glyph'], frames: 1 },
  { anims: ['idle'], frames: 1 },
];
export const ATLAS_HEADINGS = ['e', 's', 'w', 'n'] as const;

/**
 * BUILD_DIRECTIVE P1.4 sprite sizes and headings for the Phase 1 species, checked independently of
 * the content records so a content edit cannot quietly weaken the art requirements. A01 has no
 * self-propulsion, so its looping animation is "idle".
 */
export interface SpriteSpec {
  readonly size: number;
  readonly headings?: number;
  readonly loop?: string;
  /** Species-specific animations beyond the form's frame table, each with the rule that names it. */
  readonly extra?: readonly (FrameRequirement & { readonly rule: string })[];
}
export const P14_SPRITES: Readonly<Record<string, SpriteSpec>> = {
  B01: { size: 16, headings: 4 },
  B04: { size: 16, headings: 4 },
  B06: { size: 16, headings: 4 },
  A01: { size: 16, headings: 1, loop: 'idle' },
  P01: { size: 32 },
};

/**
 * Phase 3 sprite sizes and headings (CT §1.3, UX §6.2, each record's frameSize/headings at the time
 * the art was made), checked the same way. Non-motile B02, Y01 and Y02 loop "idle"; X01 swims while
 * free (0.4 cells/s) and loops "move" with one heading; fungi and V01 are tiles/glyphs (one heading).
 * F02 also needs its transfer-pulse overlay: UX §6.3 "F02 copper threads with pulse on transfer".
 */
export const P3_SPRITES: Readonly<Record<string, SpriteSpec>> = {
  B02: { size: 16, headings: 1, loop: 'idle' },
  B03: { size: 16, headings: 4, loop: 'move' },
  B05: { size: 16, headings: 4, loop: 'move' },
  B07: { size: 16, headings: 4, loop: 'move' },
  B08: { size: 16, headings: 4, loop: 'move' },
  Y01: { size: 16, headings: 1, loop: 'idle' },
  Y02: { size: 16, headings: 1, loop: 'idle' },
  X01: { size: 16, headings: 1, loop: 'move' },
  F01: { size: 16, headings: 1 },
  F02: { size: 16, headings: 1, extra: [{ anims: ['pulse'], frames: 1, rule: 'UX §6.3 "pulse on transfer"' }] },
  V01: { size: 16, headings: 1 },
  P02: { size: 32, headings: 4 },
  P03: { size: 32, headings: 4 },
  P04: { size: 32, headings: 4 },
};

/**
 * Phase 5 small sprites (P5.7 art-small; CT §1.1/§1.3 speeds, UX §6.2, each record's frameSize and
 * headings): motile B09–B12, A04 and X02 loop "move"; non-motile B13, A02, A03 and A05 loop "idle"
 * (A03 keeps the 4 headings its record gives it). Native state machines add their frame sets
 * (ARCH §10.1 "dormancy prepare/rest/wake; trap open/holding/cooldown"): B12 and F04 (DORMANCY) need
 * `dormant` 3, F03 (TRAP) needs `trap` 3.
 */
export const P5_SPRITES: Readonly<Record<string, SpriteSpec>> = {
  B09: { size: 16, headings: 4, loop: 'move' },
  B10: { size: 16, headings: 4, loop: 'move' },
  B11: { size: 16, headings: 4, loop: 'move' },
  B12: { size: 16, headings: 4, loop: 'move', extra: [{ anims: ['dormant'], frames: 3, rule: 'ARCH §10.1 "dormancy prepare/rest/wake"' }] },
  B13: { size: 16, headings: 1, loop: 'idle' },
  A02: { size: 16, headings: 1, loop: 'idle' },
  A03: { size: 16, headings: 4, loop: 'idle' },
  A04: { size: 16, headings: 4, loop: 'move' },
  A05: { size: 16, headings: 1, loop: 'idle' },
  X02: { size: 16, headings: 1, loop: 'move' },
  F03: { size: 16, headings: 1, extra: [{ anims: ['trap'], frames: 3, rule: 'ARCH §10.1 "trap open/holding/cooldown"' }] },
  F04: { size: 16, headings: 1, extra: [{ anims: ['dormant'], frames: 3, rule: 'ARCH §10.1 "dormancy prepare/rest/wake"' }] },
  V02: { size: 16, headings: 1 },
  // Large consumers (P5.7 art-large; UX §6.2 "Large (P01–P07, P09): 32×32 … P08/P10: 48×48", P5.5
  // "48x48 frames for P08/P10"; headings as CT §1.3 motion gives them: P05, P06 and P09 one, P07, P08
  // and P10 four). P06 (speed 0, attached) still has the large `move` set: a bell contraction on a
  // still stalk. P08 (native DORMANCY) adds `dormant` 3 (SPEC §7.6, D-0106).
  P05: { size: 32, headings: 1, loop: 'move' },
  P06: { size: 32, headings: 1, loop: 'move' },
  P07: { size: 32, headings: 4, loop: 'move' },
  P08: { size: 48, headings: 4, loop: 'move', extra: [{ anims: ['dormant'], frames: 3, rule: 'ARCH §10.1 "dormancy prepare/rest/wake"; P5.7 "dormancy Prepare/Rest/Wake"' }] },
  P09: { size: 32, headings: 1, loop: 'move' },
  P10: { size: 48, headings: 4, loop: 'move' },
};

/** The independent size/heading/loop spec for a species, and the document it comes from. */
function spriteSpec(id: string): { spec: SpriteSpec; source: string } | null {
  const p14 = P14_SPRITES[id];
  if (p14) return { spec: p14, source: 'BUILD_DIRECTIVE P1.4' };
  const p3 = P3_SPRITES[id];
  if (p3) return { spec: p3, source: 'CT §1.3 / UX §6.2' };
  const p5 = P5_SPRITES[id];
  if (p5) return { spec: p5, source: 'CT §1.3 / UX §6.2' };
  return null;
}

/** Required frames per heading for a species: by category for fungi and viruses, otherwise by frame size. */
export function requiredFrames(frameSize: number, category?: string): readonly FrameRequirement[] {
  if (category === 'fungus') return FUNGUS_FRAMES;
  if (category === 'virus') return VIRUS_FRAMES;
  return frameSize >= 32 ? LARGE_FRAMES : SMALL_FRAMES;
}

/**
 * What the atlas check needs to know about one enabled module: its content id and visual layer. A
 * species' native mark (NATIVE_MARKS) uses the same shape with `kind: 'species'` and
 * `moduleId` = "<species id> <ability>".
 */
export interface AtlasMarkRef {
  readonly moduleId: string;
  readonly layer: string;
  readonly kind?: 'module' | 'species';
}

/**
 * Required frames per module feature mark (ARCH §10.1 required frame counts, UX §6.2, SPEC §9
 * visuals). Every mark is authored at FEATURE_SIZE and packed in all FEATURE_HEADINGS headings (it
 * turns with the body it sits on). A layer not listed here still needs at least one frame. Kept
 * independent of art/src, like the sprite requirements above. Layers of modules that later phases
 * enable are listed now, so turning one on with too few frames fails: ARCH §10.1 "jacket 4 levels",
 * "cache 4 fills", "Lantern dim/glow" (E02 glow_center is B09 Lantern's module equivalent), and
 * UX §6.2 "jacket rim (4)", "cache icon (4 fills)".
 */
export const FEATURE_FRAMES: Readonly<Record<string, { readonly frames: number; readonly states: string }>> = {
  starch_notch: { frames: 1, states: 'notch' },
  reserve_pocket: { frames: 4, states: 'reserve fill bands 0–3' },
  resting_seam: { frames: 3, states: 'prepare, rest, wake' },
  glow_center: { frames: 2, states: 'dim, glow' },
  jacket_rim: { frames: 4, states: 'jacket levels 0–3' },
  cache_marker: { frames: 4, states: 'cache fill bands 0–3' },
  // Phase 3 (SPEC §9 visuals, UX §6.2; W2-29): each state the renderer can show from E_CUE2.
  anchor_foot: { frames: 1, states: 'foot while anchored' },
  shade_patch: { frames: 1, states: 'dark interior patch' },
  light_trail: { frames: 1, states: 'two trailing pixels while moving toward light' },
  debris_granule: { frames: 2, states: 'granule, granule pulse on detritus intake' },
  protein_notches: { frames: 2, states: 'paired notches, pale release marks' },
  matrix_edge: { frames: 4, states: 'film bands 0–3' },
  adhesion_link: { frames: 1, states: 'link pixels while linked' },
  // Phase 5 (ARCH §10.1 "Turnleaf two modes"; SPEC §7.10): A04's native metabolicMode mark.
  mode_half: { frames: 2, states: 'photo, sugar' },
};

/**
 * Native abilities drawn by a feature mark rather than by the body (ARCH §10.1 "Lantern dim/glow",
 * "Turnleaf two modes"): an enabled species with the ability needs that mark in the atlas, checked
 * like an enabled module's visualLayer. B09's SIGNAL_GLOW shares E02's glow_center.
 */
export const NATIVE_MARKS: Readonly<Record<string, string>> = {
  SIGNAL_GLOW: 'glow_center',
  MIXOTROPHY: 'mode_half',
};

/**
 * Effect marks (UX §6.5 "handling arc, trap loop"; UX §7.2 'handling', 'held'; P5.7 art-large): atlas
 * marks keyed to a recorded entity column rather than to a module or a body ability, so they are listed
 * apart from FEATURE_FRAMES (whose rows are content visualLayers and native marks). Each is needed once
 * a species with `ability` is enabled (effectMarks), and tools/art-build.ts packs and checks them always.
 */
export const EFFECT_MARKS: Readonly<Record<string, { readonly frames: number; readonly states: string; readonly ability: string; readonly drawnOn: string }>> = {
  handling_arc: { frames: 4, states: 'handling quarters 1–4', ability: 'HANDLING', drawnOn: 'the predator while a handling attempt runs (handlingProgress / handlingNeed, SPEC §7.3)' },
  trap_loop: { frames: 2, states: 'closing, holding', ability: 'TRAP', drawnOn: 'the held P04 while heldBySlot >= 0 (SPEC §7.17)' },
};

/** The effect marks the enabled species need (EFFECT_MARKS by ability), by species id, then mark. */
export function effectMarks(registry: { readonly manifest: { readonly enabledSpecies: readonly string[] }; readonly species: Readonly<Record<string, { readonly nativeAbilities: readonly string[] }>> }): AtlasMarkRef[] {
  const out: AtlasMarkRef[] = [];
  for (const id of [...registry.manifest.enabledSpecies].sort()) {
    for (const [layer, m] of Object.entries(EFFECT_MARKS).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (registry.species[id]!.nativeAbilities.includes(m.ability)) out.push({ moduleId: `${id} ${m.ability}`, layer, kind: 'species' });
    }
  }
  return out;
}
export const FEATURE_SIZE = 16;
export const FEATURE_HEADINGS = 4;

/** Atlas key of one feature-mark frame (the renderer looks up exactly this; see src/render/features.ts). */
export function featureFrameKey(layer: string, frame: number, heading: number): string {
  return `feature/${layer}/${ATLAS_HEADINGS[heading] ?? heading}/${frame}`;
}

/** The feature marks the enabled modules need, from their content records (sorted by module id). */
export function enabledMarks(registry: { readonly manifest: { readonly enabledModules: readonly string[] }; readonly modules: Readonly<Record<string, { readonly visualLayer: string }>> }): AtlasMarkRef[] {
  return [...registry.manifest.enabledModules].sort().map((id) => ({ moduleId: id, layer: registry.modules[id]!.visualLayer }));
}

/** The native marks the enabled species need (NATIVE_MARKS), by species id, then ability. */
export function nativeMarks(registry: { readonly manifest: { readonly enabledSpecies: readonly string[] }; readonly species: Readonly<Record<string, { readonly nativeAbilities: readonly string[] }>> }): AtlasMarkRef[] {
  const out: AtlasMarkRef[] = [];
  for (const id of [...registry.manifest.enabledSpecies].sort()) {
    for (const ability of [...registry.species[id]!.nativeAbilities].sort()) {
      const layer = NATIVE_MARKS[ability];
      if (layer) out.push({ moduleId: `${id} ${ability}`, layer, kind: 'species' });
    }
  }
  return out;
}

/**
 * World tiles (UX §6.2 "Film: isolated, edge, center, eroding", §6.5 food object outlines that shrink
 * with inventory; wave 2 art-features): one cell per 16×16 frame, one heading, keyed `tile/<id>/<frame>`
 * in the manifest's `tiles` table. Kept independent of art/src like the tables above.
 */
export const TILE_FRAMES: Readonly<Record<string, { readonly frames: number; readonly states: string }>> = {
  film: { frames: 4, states: 'isolated, edge, center, eroding' },
  pellet: { frames: 4, states: 'fill quartiles 0–3' },
  wafer: { frames: 4, states: 'fill quartiles 0–3' },
  stain: { frames: 1, states: 'emptied object stain' },
  // Phase 5 devices (wave 11, D-0120: 13 frames appended last; required since the systems flip, D-0121).
  device: { frames: 13, states: 's05, s06, s07, s08_0–3, s09_off/on, s10_off/on, s11, s12' },
};
export const TILE_SIZE = 16;

/** What needs one world tile: the system or material that enables it, and the tile id. */
export interface AtlasTileRef {
  readonly owner: string;
  readonly tile: string;
}

/** Atlas key of one world-tile frame (the renderer looks up exactly this; see src/render/world3.ts). */
export function tileFrameKey(tile: string, frame: number): string {
  return `tile/${tile}/${frame}`;
}

/**
 * The world tiles the manifest's content needs: film textures with the film system, the pellet with
 * M10, the wafer with M11, the emptied-object stain with either, and the device tile with the devices
 * system (S05–S12; since the systems flip, D-0121).
 */
export function enabledTiles(registry: { readonly manifest: { readonly enabledSystems: readonly string[]; readonly enabledMaterials: readonly string[] } }): AtlasTileRef[] {
  const m = registry.manifest;
  const out: AtlasTileRef[] = [];
  if (m.enabledSystems.includes('film')) out.push({ owner: 'film system', tile: 'film' });
  if (m.enabledMaterials.includes('M10')) out.push({ owner: 'M10', tile: 'pellet' });
  if (m.enabledMaterials.includes('M11')) out.push({ owner: 'M11', tile: 'wafer' });
  if (m.enabledMaterials.includes('M10') || m.enabledMaterials.includes('M11')) out.push({ owner: m.enabledMaterials.includes('M10') ? 'M10' : 'M11', tile: 'stain' });
  if (m.enabledSystems.includes('devices')) out.push({ owner: 'devices system', tile: 'device' });
  return out;
}

/** Every world tile this build knows (art-build checks them all, enabled or not). */
export const ALL_TILES: readonly AtlasTileRef[] = [
  { owner: 'film system', tile: 'film' },
  { owner: 'M10', tile: 'pellet' },
  { owner: 'M11', tile: 'wafer' },
  { owner: 'M10', tile: 'stain' },
  { owner: 'devices system', tile: 'device' },
];

export const ATLAS_FILE = 'public/atlas/manifest.json';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

/** Width and height from a PNG's IHDR chunk, or null if the bytes are not a PNG. */
export function pngSize(png: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.length < 24 || sig.some((b, i) => png[i] !== b)) return null;
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

/**
 * Pure atlas completeness check. `atlas` is the parsed atlas manifest; `png`, when given, is the
 * atlas image (null = file missing) and must match the manifest's size and exportHash; `marks`, when
 * given, are the enabled modules' feature marks, each of which must be listed in the manifest's
 * `features` table with every required frame packed in all four headings. Returns one error per
 * missing or malformed item, naming the exact sprite or mark, animation, heading and frame.
 */
export function checkAtlas(
  atlas: unknown,
  species: readonly AtlasSpeciesRef[],
  opts: { file?: string; png?: Uint8Array | null; marks?: readonly AtlasMarkRef[]; tiles?: readonly AtlasTileRef[] } = {},
): ContentIssue[] {
  const file = opts.file ?? ATLAS_FILE;
  const issues: ContentIssue[] = [];
  const err = (path: string, message: string) => issues.push({ severity: 'error', file, path, message });
  if (!isObj(atlas) || atlas.format !== 'pixelmeba-atlas' || atlas.version !== 1) {
    err('', 'not a pixelmeba-atlas version 1 manifest (run npm run art:build)');
    return issues;
  }
  const width = atlas.width;
  const height = atlas.height;
  if (!isInt(width) || !isInt(height) || width <= 0 || height <= 0) err('width', 'atlas width and height must be positive integers');
  const sprites = isObj(atlas.sprites) ? atlas.sprites : null;
  if (!sprites) err('sprites', 'missing sprites table');
  const frameList = Array.isArray(atlas.frames) ? (atlas.frames as unknown[]) : null;
  if (!frameList) err('frames', 'missing frames list');
  if (!sprites || !frameList || !isInt(width) || !isInt(height)) return issues;

  // Index frames by key; every rect must lie inside the image.
  const frames: Record<string, Obj> = {};
  frameList.forEach((f, i) => {
    if (!isObj(f) || typeof f.key !== 'string') {
      err(`frames.${i}`, 'frame without a key');
      return;
    }
    if (frames[f.key]) err(`frames.${i}`, `duplicate frame "${f.key}"`);
    frames[f.key] = f;
    const { x, y, w, h } = f;
    if (!isInt(x) || !isInt(y) || !isInt(w) || !isInt(h) || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > width || y + h > height) {
      err(`frames.${i}`, `frame "${f.key}" rect is outside the ${width}×${height} atlas`);
    }
  });

  for (const sp of species) {
    const who = `${sp.id} (${sp.assetId})`;
    const base = `sprites.${sp.assetId}`;
    const sprite = sprites[sp.assetId];
    if (!isObj(sprite)) {
      err(base, `enabled species ${who} has no sprite in the atlas`);
      continue;
    }
    if (sprite.speciesId !== sp.id) err(`${base}.speciesId`, `${who}: atlas says species "${String(sprite.speciesId)}"`);
    if (sprite.size !== sp.frameSize) err(`${base}.size`, `${who}: atlas frame size ${String(sprite.size)} ≠ content frameSize ${sp.frameSize}`);
    if (sprite.headings !== sp.headings) err(`${base}.headings`, `${who}: atlas has ${String(sprite.headings)} heading(s), content needs ${sp.headings}`);
    const specOf = spriteSpec(sp.id);
    const spec = specOf?.spec;
    const source = specOf?.source ?? '';
    if (spec) {
      // Reported only when atlas and content agree with each other (otherwise the mismatch error above
      // already names the problem): this catches both being weakened together.
      if (sprite.size === sp.frameSize && sprite.size !== spec.size) err(`${base}.size`, `${who}: ${source} requires ${spec.size}×${spec.size} frames, atlas has ${String(sprite.size)}`);
      if (spec.headings !== undefined && sprite.headings === sp.headings && sprite.headings !== spec.headings) err(`${base}.headings`, `${who}: ${source} requires ${spec.headings} heading(s), atlas has ${String(sprite.headings)}`);
    }
    const anims = isObj(sprite.animations) ? sprite.animations : {};
    if (spec?.loop) {
      const a = anims[spec.loop];
      // Missing entirely (a short one is reported by the frame-count check below).
      if (!isObj(a) || !isInt(a.frames) || a.frames <= 0) err(`${base}.animations.${spec.loop}`, `${who}: ${source} requires a 4-frame "${spec.loop}" animation`);
    }
    const declared = (name: string): number => {
      const a = anims[name];
      return isObj(a) && isInt(a.frames) ? a.frames : 0;
    };
    const reqs: readonly (FrameRequirement & { readonly rule?: string })[] = [...requiredFrames(sp.frameSize, sp.category), ...(spec?.extra ?? [])];
    for (const req of reqs) {
      const name = req.anims.find((n) => declared(n) > 0);
      const label = req.anims.join(' or ');
      const why = req.rule ? `, ${req.rule}` : '';
      if (!name) err(`${base}.animations.${req.anims[0]!}`, `${who}: missing required animation "${label}" (${req.frames} frames × ${sp.headings} heading(s)${why})`);
      else if (declared(name) < req.frames) err(`${base}.animations.${name}.frames`, `${who}: "${name}" has ${declared(name)} frame(s), needs ${req.frames}`);
    }
    // Every declared frame of every animation, in every heading the species uses, must be packed.
    for (const name of Object.keys(anims).sort()) {
      const a = anims[name];
      if (!isObj(a)) continue;
      const n = declared(name);
      if (!(typeof a.durationMs === 'number' && a.durationMs > 0)) err(`${base}.animations.${name}.durationMs`, `${who}: "${name}" needs a positive frame duration`);
      if (!isInt(a.reducedMotionFrame) || a.reducedMotionFrame < 0 || a.reducedMotionFrame >= Math.max(1, n)) {
        err(`${base}.animations.${name}.reducedMotionFrame`, `${who}: "${name}" reduced-motion frame ${String(a.reducedMotionFrame)} is not one of its ${n} frame(s)`);
      }
      for (let h = 0; h < sp.headings; h++) {
        for (let i = 0; i < n; i++) {
          const key = `${sp.assetId}/${name}/${ATLAS_HEADINGS[h] ?? h}/${i}`;
          const f = frames[key];
          if (!f) err(`frames[${key}]`, `${who}: missing frame "${key}"`);
          else if (f.w !== sp.frameSize || f.h !== sp.frameSize) err(`frames[${key}]`, `${who}: frame "${key}" is ${String(f.w)}×${String(f.h)}, expected ${sp.frameSize}×${sp.frameSize}`);
        }
      }
    }
  }

  // Module feature marks (ARCH §10.1): listed in `features`, FEATURE_SIZE, four headings, every frame.
  const features = isObj(atlas.features) ? atlas.features : null;
  for (const mark of opts.marks ?? []) {
    const who = `${mark.moduleId} (${mark.layer})`;
    const base = `features.${mark.layer}`;
    const need = FEATURE_FRAMES[mark.layer] ?? EFFECT_MARKS[mark.layer];
    const entry = features?.[mark.layer];
    if (!isObj(entry)) {
      err(base, `enabled ${mark.kind === 'species' ? 'species' : 'module'} ${who} has no feature mark in the atlas (run npm run art:build)`);
      continue;
    }
    if (entry.size !== FEATURE_SIZE) err(`${base}.size`, `${who}: mark frame size ${String(entry.size)}, expected ${FEATURE_SIZE}`);
    if (entry.headings !== FEATURE_HEADINGS) err(`${base}.headings`, `${who}: mark has ${String(entry.headings)} heading(s), needs ${FEATURE_HEADINGS}`);
    const n = isInt(entry.frames) ? entry.frames : 0;
    const required = need?.frames ?? 1;
    if (n < required) err(`${base}.frames`, `${who}: mark has ${n} frame(s), needs ${required}${need ? ` (${need.states})` : ''}`);
    for (let h = 0; h < FEATURE_HEADINGS; h++) {
      for (let i = 0; i < Math.max(n, required); i++) {
        const key = featureFrameKey(mark.layer, i, h);
        const f = frames[key];
        if (!f) {
          // A short declared count is reported once above; only frames it declares are listed here.
          if (i < n) err(`frames[${key}]`, `${who}: missing frame "${key}"`);
        } else if (f.w !== FEATURE_SIZE || f.h !== FEATURE_SIZE) err(`frames[${key}]`, `${who}: frame "${key}" is ${String(f.w)}×${String(f.h)}, expected ${FEATURE_SIZE}×${FEATURE_SIZE}`);
      }
    }
  }

  // World tiles (UX §6.2 film, §6.5 food objects): listed in `tiles`, TILE_SIZE, one heading, every frame.
  const tiles = isObj(atlas.tiles) ? atlas.tiles : null;
  for (const ref of opts.tiles ?? []) {
    const who = `${ref.owner} (tile ${ref.tile})`;
    const base = `tiles.${ref.tile}`;
    const need = TILE_FRAMES[ref.tile];
    const entry = tiles?.[ref.tile];
    if (!isObj(entry)) {
      err(base, `${who} has no world tile in the atlas (run npm run art:build)`);
      continue;
    }
    if (entry.size !== TILE_SIZE) err(`${base}.size`, `${who}: tile frame size ${String(entry.size)}, expected ${TILE_SIZE}`);
    const n = isInt(entry.frames) ? entry.frames : 0;
    const required = need?.frames ?? 1;
    if (n < required) err(`${base}.frames`, `${who}: tile has ${n} frame(s), needs ${required}${need ? ` (${need.states})` : ''}`);
    for (let i = 0; i < n; i++) {
      const key = tileFrameKey(ref.tile, i);
      const f = frames[key];
      if (!f) err(`frames[${key}]`, `${who}: missing frame "${key}"`);
      else if (f.w !== TILE_SIZE || f.h !== TILE_SIZE) err(`frames[${key}]`, `${who}: frame "${key}" is ${String(f.w)}×${String(f.h)}, expected ${TILE_SIZE}×${TILE_SIZE}`);
    }
  }

  if (opts.png !== undefined) {
    const image = typeof atlas.image === 'string' ? atlas.image : 'organisms.png';
    if (opts.png === null) err('image', `atlas image "${image}" is missing (run npm run art:build)`);
    else {
      const size = pngSize(opts.png);
      if (!size) err('image', `atlas image "${image}" is not a PNG`);
      else if (size.width !== width || size.height !== height) err('image', `atlas image is ${size.width}×${size.height}, manifest says ${width}×${height}`);
      const sha = createHash('sha256').update(opts.png).digest('hex');
      if (sha !== atlas.exportHash) err('exportHash', `atlas image hashes to ${sha.slice(0, 12)}…, manifest exportHash is ${String(atlas.exportHash).slice(0, 12)}… (run npm run art:build)`);
    }
  }
  return issues;
}

/**
 * P5.4 (wave 14, D-0128): every Suggested Community the validated manifest offers (habitatOffered and
 * communityOffered, enabled habitat or not) is realized as New Dish would start it: `recipeId` (FIRST_DISH_V1)
 * with { empty: true, habitatId, community: true }, under the registry with that habitat enabled. A group
 * with fewer valid cells than its count (or any other RecipeError) is reported on the habitat's file at
 * 'suggestedCommunity.groups.<k>' (or the field CommunityError names). The eligible counts never depend
 * on the seed (only the order the cells are taken in does), so one realization proves every seed.
 * PROPOSED DECISION (wave 14): this runs here and in the tests, not in validateContent, which also runs at
 * the worker's boot, where realizing eight worlds would cost time for nothing.
 */
export function communityRealizationIssues(
  registry: ContentRegistry,
  habitatFiles: readonly RawFile[],
  recipeId = 'FIRST_DISH_V1',
): ContentIssue[] {
  const out: ContentIssue[] = [];
  const m = registry.manifest;
  for (const id of registry.habitatIds) {
    const h = registry.habitats[id]!;
    if (h.suggestedCommunity === undefined || !habitatOffered(h, m) || !communityOffered(h, m, registry.species)) continue;
    const file = habitatFiles.find((f) => isObj(f.data) && f.data.id === id)?.file ?? `content/habitats/${id}.json`;
    if (registry.recipes[recipeId] === undefined) {
      out.push({ severity: 'error', file, path: 'suggestedCommunity', message: `cannot check: there is no recipe ${recipeId} to start it from` });
      continue;
    }
    const reg: ContentRegistry = m.enabledHabitats.includes(id) ? registry : { ...registry, manifest: { ...m, enabledHabitats: [...m.enabledHabitats, id].sort() } };
    try {
      realizeRecipe(reg, recipeId, { worldId: `community-check:${id}`, transform: (r) => applyRecipeOverrides(r, { empty: true, habitatId: id, community: true }) });
    } catch (e) {
      if (!(e instanceof RecipeError)) throw e;
      out.push({ severity: 'error', file, path: e instanceof CommunityError ? e.path : 'suggestedCommunity', message: e.message });
    }
  }
  return out;
}

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  const raw = loadRawPacksFs();
  const validated = validateContent(raw);
  const registry = validated.registry;
  const issues: ContentIssue[] = [...validated.issues];
  const hash = await computeContentHash(raw);
  const manifestPath = join(CONTENT_DIR, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { contentHash: string };

  // Atlas completeness for enabled species (needs a valid registry to know what is enabled).
  const atlasPath = resolve(argValue('--atlas') ?? join(REPO_ROOT, ATLAS_FILE));
  const rel = relative(REPO_ROOT, atlasPath).split('\\').join('/');
  const atlasFile = rel.startsWith('..') ? atlasPath : rel;
  let atlasFrames = 0;
  let marks: AtlasMarkRef[] = [];
  let tilesNeeded: AtlasTileRef[] = [];
  // P5.4: every offered Suggested Community must realize (five of each in valid cells, never cropped).
  const offersCommunity = (r: ContentRegistry, id: string) => habitatOffered(r.habitats[id]!, r.manifest) && communityOffered(r.habitats[id]!, r.manifest, r.species);
  const communities = registry ? registry.habitatIds.filter((id) => offersCommunity(registry, id)).length : 0;
  if (registry) issues.push(...communityRealizationIssues(registry, raw.habitats));
  if (registry) {
    if (!existsSync(atlasPath)) {
      issues.push({ severity: 'error', file: atlasFile, path: '', message: 'atlas manifest is missing (run npm run art:build)' });
    } else {
      let atlas: unknown = null;
      try {
        atlas = JSON.parse(readFileSync(atlasPath, 'utf8'));
      } catch (e) {
        issues.push({ severity: 'error', file: atlasFile, path: '', message: `invalid JSON (${(e as Error).message})` });
      }
      if (atlas !== null) {
        const image = isObj(atlas) && typeof atlas.image === 'string' ? atlas.image : 'organisms.png';
        const pngPath = join(dirname(atlasPath), image);
        const png = existsSync(pngPath) ? new Uint8Array(readFileSync(pngPath)) : null;
        const refs = registry.manifest.enabledSpecies.map((id) => atlasSpeciesRef(registry.species[id]!));
        marks = [...enabledMarks(registry), ...nativeMarks(registry), ...effectMarks(registry)];
        tilesNeeded = enabledTiles(registry);
        issues.push(...checkAtlas(atlas, refs, { file: atlasFile, png, marks, tiles: tilesNeeded }));
        atlasFrames = isObj(atlas) && Array.isArray(atlas.frames) ? atlas.frames.length : 0;
      }
    }
  }

  let errors = issues.filter((i) => i.severity === 'error').length;
  for (const i of issues) {
    const where = `${i.file}${i.path ? ` → ${i.path}` : ''}`;
    console[i.severity === 'error' ? 'error' : 'warn'](`${i.severity.toUpperCase()} ${where}: ${i.message}`);
  }

  if (manifest.contentHash !== hash) {
    if (write && errors === 0) {
      manifest.contentHash = hash;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
      console.log(`wrote contentHash ${hash}`);
    } else if (!write) {
      console.error(`ERROR content/manifest.json → contentHash: is "${manifest.contentHash}", content hashes to "${hash}" (run npm run content:validate -- --write)`);
      errors++;
    }
  }

  if (errors > 0) {
    console.error(`content: ${errors} error(s)`);
    process.exit(1);
  }
  const r = registry!;
  console.log(
    `content ok · contentHash ${hash} · species ${r.speciesIds.length} (enabled ${r.manifest.enabledSpecies.length}) · ` +
      `materials ${r.materialIds.length} · modules ${r.moduleIds.length} · habitats ${r.habitatIds.length} · structures ${r.structureIds.length} · ` +
      `suggested communities ${communities} realized · recipes ${r.recipeIds.length} · experiments ${r.experimentIds.length} · variants ${r.variantIds.length} · ` +
      `atlas ${atlasFile} complete for ${r.manifest.enabledSpecies.length} enabled species and ${marks.length} enabled module and native marks (${marks.map((m) => m.layer).join(', ')}) and ${tilesNeeded.length} world tiles (${tilesNeeded.map((t) => t.tile).join(', ')}; ${atlasFrames} frames)`,
  );
}

// Run as a script (npx tsx tools/content-validate[.ts]) but not when imported by tests.
const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
const self = fileURLToPath(import.meta.url);
if (invoked === self || `${invoked}.ts` === self) await main();
