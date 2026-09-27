/**
 * npm run art:build [-- --check]
 * Packs every sprite frame (all headings) into public/atlas/organisms.png with 2 px transparent
 * padding and writes public/atlas/manifest.json (ARCH §10.1). Output is byte-deterministic.
 * --check rebuilds in memory and fails if the committed files differ or required frames are missing.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SPRITES } from '../art/src/index';
import { frameRgba, HEADING_NAMES, LARGE_REQUIRED, orient, SMALL_REQUIRED, SMALL_STATIC_REQUIRED, type AnimName, type SpriteDef } from '../art/src/sprite';
import { blit, createImage, encodePng } from './lib/png';
import { REPO_ROOT, loadRegistryFs } from './lib/content-fs';

const PAD = 2;
const ATLAS_W = 512;

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
  readonly frames: AtlasFrame[];
}

function validate(def: SpriteDef): string[] {
  const errors: string[] = [];
  const need = def.size >= 32 ? LARGE_REQUIRED : def.animations.idle ? SMALL_STATIC_REQUIRED : SMALL_REQUIRED;
  for (const [name, count] of Object.entries(need)) {
    const a = def.animations[name as AnimName];
    if (!a) errors.push(`${def.assetId}: missing required animation "${name}"`);
    else if (a.frames.length < count) errors.push(`${def.assetId}: "${name}" has ${a.frames.length} frames, needs ${count}`);
  }
  for (const [name, a] of Object.entries(def.animations)) {
    a.frames.forEach((f, i) => {
      if (f.w !== def.size || f.h !== def.size) errors.push(`${def.assetId}: ${name}[${i}] is ${f.w}×${f.h}, expected ${def.size}`);
      if (f.count() === 0 && name !== 'death') errors.push(`${def.assetId}: ${name}[${i}] is empty`);
    });
    if (a.reducedMotionFrame >= a.frames.length) errors.push(`${def.assetId}: ${name} reducedMotionFrame out of range`);
  }
  return errors;
}

export function buildAtlas(): { png: Buffer; manifest: AtlasManifest; errors: string[] } {
  const errors: string[] = [];
  for (const def of SPRITES) errors.push(...validate(def));
  // Every enabled species needs a sprite.
  const reg = loadRegistryFs();
  for (const id of reg.manifest.enabledSpecies) {
    const sp = reg.species[id]!;
    const def = SPRITES.find((s) => s.speciesId === id);
    if (!def) errors.push(`enabled species ${id} has no sprite`);
    else {
      if (def.assetId !== sp.assetId) errors.push(`${id}: sprite assetId ${def.assetId} ≠ content assetId ${sp.assetId}`);
      if (def.size !== sp.frameSize) errors.push(`${id}: sprite size ${def.size} ≠ content frameSize ${sp.frameSize}`);
      if (def.headings !== sp.headings) errors.push(`${id}: sprite headings ${def.headings} ≠ content headings ${sp.headings}`);
    }
  }

  // Canonical frame list.
  const items: { def: SpriteDef; anim: AnimName; heading: number; index: number }[] = [];
  for (const def of SPRITES) {
    for (const anim of Object.keys(def.animations).sort() as AnimName[]) {
      const a = def.animations[anim]!;
      for (let h = 0; h < def.headings; h++) for (let i = 0; i < a.frames.length; i++) items.push({ def, anim, heading: h, index: i });
    }
  }
  // Shelf packing: larger frames first, then canonical order.
  items.sort((a, b) => b.def.size - a.def.size);
  let x = 0;
  let y = 0;
  let rowH = 0;
  const placed: { item: (typeof items)[number]; x: number; y: number }[] = [];
  for (const item of items) {
    const cell = item.def.size + PAD * 2;
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
  const frames: AtlasFrame[] = [];
  for (const { item, x: fx, y: fy } of placed) {
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
  const manifest: AtlasManifest = {
    format: 'pixelmeba-atlas',
    version: 1,
    image: 'organisms.png',
    width: ATLAS_W,
    height,
    padding: PAD,
    exportHash: createHash('sha256').update(png).digest('hex'),
    sprites,
    frames,
  };
  return { png, manifest, errors };
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
    console.log(`atlas up to date · ${manifest.frames.length} frames · ${manifest.width}×${manifest.height} · ${manifest.exportHash.slice(0, 12)}`);
  } else {
    mkdirSync(dir, { recursive: true });
    writeFileSync(pngPath, png);
    writeFileSync(manPath, manText);
    console.log(`wrote atlas · ${manifest.frames.length} frames · ${manifest.width}×${manifest.height} · ${manifest.exportHash.slice(0, 12)}`);
  }
}
