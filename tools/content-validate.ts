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
import { computeContentHash, validateContent, type ContentIssue } from '../src/sim/content/registry';
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

/** The independent size/heading/loop spec for a species, and the document it comes from. */
function spriteSpec(id: string): { spec: SpriteSpec; source: string } | null {
  const p14 = P14_SPRITES[id];
  if (p14) return { spec: p14, source: 'BUILD_DIRECTIVE P1.4' };
  const p3 = P3_SPRITES[id];
  if (p3) return { spec: p3, source: 'CT §1.3 / UX §6.2' };
  return null;
}

/** Required frames per heading for a species: by category for fungi and viruses, otherwise by frame size. */
export function requiredFrames(frameSize: number, category?: string): readonly FrameRequirement[] {
  if (category === 'fungus') return FUNGUS_FRAMES;
  if (category === 'virus') return VIRUS_FRAMES;
  return frameSize >= 32 ? LARGE_FRAMES : SMALL_FRAMES;
}

/** What the atlas check needs to know about one enabled module: its content id and visual layer. */
export interface AtlasMarkRef {
  readonly moduleId: string;
  readonly layer: string;
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
};
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
  opts: { file?: string; png?: Uint8Array | null; marks?: readonly AtlasMarkRef[] } = {},
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
    const need = FEATURE_FRAMES[mark.layer];
    const entry = features?.[mark.layer];
    if (!isObj(entry)) {
      err(base, `enabled module ${who} has no feature mark in the atlas (run npm run art:build)`);
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
        marks = enabledMarks(registry);
        issues.push(...checkAtlas(atlas, refs, { file: atlasFile, png, marks }));
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
      `recipes ${r.recipeIds.length} · experiments ${r.experimentIds.length} · variants ${r.variantIds.length} · ` +
      `atlas ${atlasFile} complete for ${r.manifest.enabledSpecies.length} enabled species and ${marks.length} enabled module marks (${marks.map((m) => m.layer).join(', ')}; ${atlasFrames} frames)`,
  );
}

// Run as a script (npx tsx tools/content-validate[.ts]) but not when imported by tests.
const invoked = process.argv[1] ? resolve(process.argv[1]) : '';
const self = fileURLToPath(import.meta.url);
if (invoked === self || `${invoked}.ts` === self) await main();
