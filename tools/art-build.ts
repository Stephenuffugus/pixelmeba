/**
 * npm run art:build [-- --check]
 * Packs every sprite frame (all headings), every module feature-mark frame (all four headings;
 * art/src/layers) and every world tile (film textures, food objects; art/src/tiles, one heading) into
 * public/atlas/organisms.png with 2 px transparent padding and writes
 * public/atlas/manifest.json (ARCH §10.1). Output is byte-deterministic.
 * --check rebuilds in memory and fails if the committed files differ or required frames are missing
 * (sprite and mark requirements here, plus the packed-atlas completeness check shared with
 * content:validate).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPRITES } from '../art/src/index';
import { FEATURE_LAYERS, type FeatureLayerDef } from '../art/src/layers/modules';
import { TILES, type TileDef } from '../art/src/tiles/index';
import {
  frameRgba,
  FUNGUS_REQUIRED,
  HEADING_NAMES,
  LARGE_REQUIRED,
  orient,
  paletteRgba,
  SMALL_REQUIRED,
  SMALL_STATIC_REQUIRED,
  VIRUS_REQUIRED,
  type AnimName,
  type SpriteDef,
} from '../art/src/sprite';
import { blit, createImage, encodePng } from './lib/png';
import { REPO_ROOT, loadRegistryFs } from './lib/content-fs';
import { ALL_TILES, atlasSpeciesRef, checkAtlas, enabledMarks, enabledTiles, FEATURE_HEADINGS, FEATURE_SIZE, featureFrameKey, TILE_SIZE, tileFrameKey } from './content-validate';

const PAD = 2;
/**
 * Atlas width. 1024 since Phase 3 (14 more species: ~760 frames do not fit 512 wide without a
 * 2048-tall sheet); the height stays the next power of two of the packed shelves, so the sheet is
 * 1024×1024 at most for this content, inside every WebGL texture limit we target.
 */
const ATLAS_W = 1024;

export interface AtlasFrame {
  readonly key: string;
  readonly assetId: string;
  readonly speciesId: string;
  readonly anim: AnimName;
  readonly heading: number;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One module feature-mark frame (key `feature/<layer>/<heading>/<frame>`). */
export interface AtlasFeatureFrame {
  readonly key: string;
  readonly layer: string;
  readonly heading: number;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One world-tile frame (key `tile/<tile>/<frame>`; one heading, never rotated). */
export interface AtlasTileFrame {
  readonly key: string;
  readonly tile: string;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One world tile set (film textures, food object fill steps, the emptied stain): one cell per frame. */
export interface AtlasTile {
  readonly size: number;
  readonly frames: number;
  readonly frameNames: string[];
}

/** One module feature mark: drawn over the body at its center, heading and scale (size / 16). */
export interface AtlasFeature {
  readonly size: number;
  readonly headings: number;
  readonly anchor: [number, number];
  readonly frames: number;
  readonly frameNames: string[];
}

export interface AtlasAnimation {
  readonly frames: number;
  readonly durationMs: number;
  readonly loop: boolean;
  readonly reducedMotionFrame: number;
}

export interface AtlasManifest {
  readonly format: 'pixelmeba-atlas';
  readonly version: 1;
  readonly image: string;
  readonly width: number;
  readonly height: number;
  readonly padding: number;
  readonly exportHash: string;
  readonly sprites: Record<string, { speciesId: string; size: number; headings: number; anchor: [number, number]; animations: Record<string, AtlasAnimation> }>;
  /** Module feature marks by visual layer id (ARCH §10.1), in art/src/layers canonical order. */
  readonly features: Record<string, AtlasFeature>;
  /** World tiles by id (UX §6.2 film, §6.5 food objects), in art/src/tiles canonical order. */
  readonly tiles: Record<string, AtlasTile>;
  /** Sprite frames first, then feature-mark frames, then world-tile frames. */
  readonly frames: (AtlasFrame | AtlasFeatureFrame | AtlasTileFrame)[];
}

function validate(def: SpriteDef): string[] {
  const errors: string[] = [];
  const form = def.form ?? 'organism';
  const need = form === 'fungus' ? FUNGUS_REQUIRED : form === 'virus' ? VIRUS_REQUIRED : def.size >= 32 ? LARGE_REQUIRED : def.animations.idle ? SMALL_STATIC_REQUIRED : SMALL_REQUIRED;
  if (form !== 'organism' && def.headings !== 1) errors.push(`${def.assetId}: ${form} tiles and glyphs have one heading (never rotated)`);
  for (const [name, count] of Object.entries(need)) {
    const a = def.animations[name as AnimName];
    if (!a) errors.push(`${def.assetId}: missing required animation "${name}"`);
    else if (a.frames.length < count) errors.push(`${def.assetId}: "${name}" has ${a.frames.length} frames, needs ${count}`);
  }
  for (const [name, a] of Object.entries(def.animations)) {
    a.frames.forEach((f, i) => {
      if (f.w !== def.size || f.h !== def.size) errors.push(`${def.assetId}: ${name}[${i}] is ${f.w}×${f.h}, expected ${def.size}`);
      // Death dissolves to nothing; decaying fungal tiles may erode away entirely at a lone knot.
      if (f.count() === 0 && name !== 'death' && name !== 'decaying') errors.push(`${def.assetId}: ${name}[${i}] is empty`);
    });
    if (a.reducedMotionFrame >= a.frames.length) errors.push(`${def.assetId}: ${name} reducedMotionFrame out of range`);
  }
  return errors;
}

function validateLayer(def: FeatureLayerDef): string[] {
  const errors: string[] = [];
  if (def.frames.length === 0) errors.push(`mark ${def.id}: no frames`);
  if (def.frameNames.length !== def.frames.length) errors.push(`mark ${def.id}: ${def.frameNames.length} frame name(s) for ${def.frames.length} frame(s)`);
  def.frames.forEach((f, i) => {
    if (f.w !== FEATURE_SIZE || f.h !== FEATURE_SIZE) errors.push(`mark ${def.id}[${i}] is ${f.w}×${f.h}, expected ${FEATURE_SIZE}`);
    if (f.count() === 0) errors.push(`mark ${def.id}[${i}] is empty`);
    for (const px of f.data) if (px !== 0 && !def.palette[px]) errors.push(`mark ${def.id}[${i}]: palette index ${px} missing`);
  });
  return errors;
}

function validateTile(def: TileDef): string[] {
  const errors: string[] = [];
  if (def.frames.length === 0) errors.push(`tile ${def.id}: no frames`);
  if (def.frameNames.length !== def.frames.length) errors.push(`tile ${def.id}: ${def.frameNames.length} frame name(s) for ${def.frames.length} frame(s)`);
  def.frames.forEach((f, i) => {
    if (f.w !== TILE_SIZE || f.h !== TILE_SIZE) errors.push(`tile ${def.id}[${i}] is ${f.w}×${f.h}, expected ${TILE_SIZE}`);
    if (f.count() === 0) errors.push(`tile ${def.id}[${i}] is empty`);
    for (const px of f.data) if (px !== 0 && !def.palette[px]) errors.push(`tile ${def.id}[${i}]: palette index ${px} missing`);
  });
  return errors;
}

type PackItem =
  | { readonly kind: 'sprite'; readonly size: number; readonly def: SpriteDef; readonly anim: AnimName; readonly heading: number; readonly index: number }
  | { readonly kind: 'feature'; readonly size: number; readonly def: FeatureLayerDef; readonly heading: number; readonly index: number }
  | { readonly kind: 'tile'; readonly size: number; readonly def: TileDef; readonly index: number };

export function buildAtlas(): { png: Buffer; manifest: AtlasManifest; errors: string[] } {
  const errors: string[] = [];
  for (const def of SPRITES) errors.push(...validate(def));
  for (const def of FEATURE_LAYERS) errors.push(...validateLayer(def));
  for (const def of TILES) errors.push(...validateTile(def));
  // Every enabled species needs a sprite.
  const reg = loadRegistryFs();
  for (const id of reg.manifest.enabledSpecies) if (!SPRITES.some((s) => s.speciesId === id)) errors.push(`enabled species ${id} has no sprite`);
  // Every sprite (enabled or not yet) must agree with its species record, so a later phase can
  // enable it without touching the art.
  for (const def of SPRITES) {
    const id = def.speciesId;
    const sp = reg.species[id];
    if (!sp) {
      errors.push(`${def.assetId}: no species record ${id} in content`);
      continue;
    }
    if (def.assetId !== sp.assetId) errors.push(`${id}: sprite assetId ${def.assetId} ≠ content assetId ${sp.assetId}`);
    if (def.size !== sp.frameSize) errors.push(`${id}: sprite size ${def.size} ≠ content frameSize ${sp.frameSize}`);
    if (def.headings !== sp.headings) errors.push(`${id}: sprite headings ${def.headings} ≠ content headings ${sp.headings}`);
    const form = sp.category === 'fungus' ? 'fungus' : sp.category === 'virus' ? 'virus' : 'organism';
    if ((def.form ?? 'organism') !== form) errors.push(`${id}: sprite form ${def.form ?? 'organism'} ≠ content category ${sp.category}`);
  }

  // Every enabled module needs its feature mark (content visualLayer → art/src/layers).
  const marks = enabledMarks(reg);
  for (const m of marks) if (!FEATURE_LAYERS.some((l) => l.id === m.layer)) errors.push(`enabled module ${m.moduleId} has no feature mark "${m.layer}" in art/src/layers`);
  // Every enabled system or material that draws a world tile needs it (film textures, food objects).
  for (const t of enabledTiles(reg)) if (!TILES.some((d) => d.id === t.tile)) errors.push(`${t.owner} has no world tile "${t.tile}" in art/src/tiles`);

  // Canonical frame list: sprites (animation names sorted, then heading, then frame), then feature
  // marks (art/src/layers order, then frame, then heading).
  const items: PackItem[] = [];
  for (const def of SPRITES) {
    for (const anim of Object.keys(def.animations).sort() as AnimName[]) {
      const a = def.animations[anim]!;
      for (let h = 0; h < def.headings; h++) for (let i = 0; i < a.frames.length; i++) items.push({ kind: 'sprite', size: def.size, def, anim, heading: h, index: i });
    }
  }
  for (const def of FEATURE_LAYERS) {
    for (let i = 0; i < def.frames.length; i++) for (let h = 0; h < FEATURE_HEADINGS; h++) items.push({ kind: 'feature', size: FEATURE_SIZE, def, heading: h, index: i });
  }
  // World tiles last (art/src/tiles order, then frame): one heading, never rotated.
  for (const def of TILES) for (let i = 0; i < def.frames.length; i++) items.push({ kind: 'tile', size: TILE_SIZE, def, index: i });
  // Shelf packing: larger frames first, then canonical order (Array.prototype.sort is stable).
  items.sort((a, b) => b.size - a.size);
  let x = 0;
  let y = 0;
  let rowH = 0;
  const placed: { item: PackItem; x: number; y: number }[] = [];
  for (const item of items) {
    const cell = item.size + PAD * 2;
    if (x + cell > ATLAS_W) {
      x = 0;
      y += rowH;
      rowH = 0;
    }
    placed.push({ item, x: x + PAD, y: y + PAD });
    x += cell;
    rowH = Math.max(rowH, cell);
  }
  let height = 1;
  while (height < y + rowH) height *= 2;
  const img = createImage(ATLAS_W, height);
  const frames: (AtlasFrame | AtlasFeatureFrame | AtlasTileFrame)[] = [];
  for (const { item, x: fx, y: fy } of placed) {
    if (item.kind === 'tile') {
      const { def, index } = item;
      const f = def.frames[index]!;
      blit(img, { w: f.w, h: f.h, data: paletteRgba(def.palette, f, `tile ${def.id}`) }, fx, fy);
      frames.push({ key: tileFrameKey(def.id, index), tile: def.id, index, x: fx, y: fy, w: f.w, h: f.h });
      continue;
    }
    if (item.kind === 'feature') {
      const { def, heading, index } = item;
      const f = orient(def.frames[index]!, heading);
      blit(img, { w: f.w, h: f.h, data: paletteRgba(def.palette, f, `mark ${def.id}`) }, fx, fy);
      frames.push({ key: featureFrameKey(def.id, index, heading), layer: def.id, heading, index, x: fx, y: fy, w: f.w, h: f.h });
      continue;
    }
    const { def, anim, heading, index } = item;
    const f = orient(def.animations[anim]!.frames[index]!, heading);
    blit(img, { w: f.w, h: f.h, data: frameRgba(def, f) }, fx, fy);
    frames.push({
      key: `${def.assetId}/${anim}/${HEADING_NAMES[heading]}/${index}`,
      assetId: def.assetId,
      speciesId: def.speciesId,
      anim,
      heading,
      index,
      x: fx,
      y: fy,
      w: f.w,
      h: f.h,
    });
  }
  const png = encodePng(img);
  const sprites: AtlasManifest['sprites'] = {};
  for (const def of SPRITES) {
    const animations: Record<string, AtlasAnimation> = {};
    for (const anim of Object.keys(def.animations).sort()) {
      const a = def.animations[anim as AnimName]!;
      animations[anim] = { frames: a.frames.length, durationMs: a.durationMs, loop: a.loop, reducedMotionFrame: a.reducedMotionFrame };
    }
    sprites[def.assetId] = { speciesId: def.speciesId, size: def.size, headings: def.headings, anchor: [def.size / 2, def.size / 2], animations };
  }
  const features: AtlasManifest['features'] = {};
  for (const def of FEATURE_LAYERS) {
    features[def.id] = { size: FEATURE_SIZE, headings: FEATURE_HEADINGS, anchor: [FEATURE_SIZE / 2, FEATURE_SIZE / 2], frames: def.frames.length, frameNames: [...def.frameNames] };
  }
  const tiles: AtlasManifest['tiles'] = {};
  for (const def of TILES) tiles[def.id] = { size: TILE_SIZE, frames: def.frames.length, frameNames: [...def.frameNames] };
  const manifest: AtlasManifest = {
    format: 'pixelmeba-atlas',
    version: 1,
    image: 'organisms.png',
    width: ATLAS_W,
    height,
    padding: PAD,
    exportHash: createHash('sha256').update(png).digest('hex'),
    sprites,
    features,
    tiles,
    frames,
  };
  // The packed result must pass the same completeness check content:validate applies (P1.4, the
  // enabled modules' marks), for every species that has a sprite, enabled or not.
  const refs = SPRITES.filter((d) => reg.species[d.speciesId]).map((d) => atlasSpeciesRef(reg.species[d.speciesId]!));
  // Every mark and every world tile is checked, enabled or not (a later flip needs no art change).
  const allMarks = FEATURE_LAYERS.map((l) => ({ moduleId: marks.find((m) => m.layer === l.id)?.moduleId ?? `layer ${l.id}`, layer: l.id }));
  for (const i of checkAtlas(manifest, refs, { png, marks: allMarks, tiles: ALL_TILES })) errors.push(`${i.path}: ${i.message}`);
  return { png, manifest, errors };
}

function featureCount(m: AtlasManifest): number {
  return m.frames.filter((f) => 'layer' in f).length;
}

function tileCount(m: AtlasManifest): number {
  return m.frames.filter((f) => 'tile' in f).length;
}

const isMain = process.argv[1]?.endsWith('art-build.ts');
if (isMain) {
  const check = process.argv.includes('--check');
  const { png, manifest, errors } = buildAtlas();
  for (const e of errors) console.error(`ERROR ${e}`);
  if (errors.length > 0) process.exit(1);
  const dir = join(REPO_ROOT, 'public', 'atlas');
  const pngPath = join(dir, 'organisms.png');
  const manPath = join(dir, 'manifest.json');
  const manText = JSON.stringify(manifest, null, 1) + '\n';
  if (check) {
    const same = existsSync(pngPath) && existsSync(manPath) && Buffer.compare(readFileSync(pngPath), png) === 0 && readFileSync(manPath, 'utf8') === manText;
    if (!same) {
      console.error('ERROR public/atlas is out of date (run npm run art:build)');
      process.exit(1);
    }
    console.log(`atlas up to date · ${manifest.frames.length} frames (${featureCount(manifest)} feature-mark frames, ${tileCount(manifest)} world-tile frames) · ${manifest.width}×${manifest.height} · ${manifest.exportHash.slice(0, 12)}`);
  } else {
    mkdirSync(dir, { recursive: true });
    writeFileSync(pngPath, png);
    writeFileSync(manPath, manText);
    console.log(`wrote atlas · ${manifest.frames.length} frames (${featureCount(manifest)} feature-mark frames, ${tileCount(manifest)} world-tile frames) · ${manifest.width}×${manifest.height} · ${manifest.exportHash.slice(0, 12)}`);
  }
}
