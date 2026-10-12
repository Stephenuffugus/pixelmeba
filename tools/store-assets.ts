/**
 * P4.12 store assets (BUILD_DIRECTIVE P4.12; ARCH §15; UX §10; PLAY_STORE_CHECKLIST §A):
 *
 *   npm run store:assets                          everything below, into store/
 *   npm run store:assets -- --only icon           store/icon-512.png + the two adaptive layers, and
 *                                                 store/privacy-policy.html from PRIVACY_POLICY.md (no browser)
 *   npm run store:assets -- --only feature        store/feature-1024x500.png from a real Share → Picture
 *   npm run store:assets -- --only screenshots    store/screenshots/{phone,tablet7,tablet10}/NN-<topic>.png
 *   (--only takes a comma list; --classes phone,tablet7 and --topics 01,05 narrow the screenshots;
 *    --no-build reuses tmp/dist-store)
 *
 * The icon is the launcher art (art/src/icons/appIcon.ts, P4.10) at an integer scale, nearest neighbour, every
 * pixel opaque, byte-deterministic. The feature graphic and the screenshots come from the production build
 * (vite build → tmp/dist-store, served on 127.0.0.1:5284 and stopped by port) driven by Playwright Chromium
 * through real play; every image's provenance (build commit, recipe or save, seed, tick, state hash, steps)
 * goes to store/screenshots/manifest.json. Nothing is staged: no edited genome, no injected state, no text
 * overlay on a screenshot (captions belong in store/listing.md).
 */
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { FOREGROUND_GRID, ICON_BACKGROUND, ICON_PALETTE, iconComposite, iconForeground } from '../art/src/icons/appIcon';
import { hexToRgba } from '../art/src/palette';
import type { Px } from '../art/src/px';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const STORE = 'store';
export const STORE_PORT = 5284;
export const STORE_DIST = 'tmp/dist-store';

// ---------------------------------------------------------------------------------------------------------
// PNG helpers (pngjs; no text chunks, no time chunk: the same pixels always give the same bytes)

/** Encode RGBA pixels: as RGBA (colour type 6) when `alpha`, else as RGB (colour type 2; no alpha channel). */
export function encodePng(rgba: Uint8Array | Buffer, w: number, h: number, alpha: boolean): Buffer {
  const p = new PNG({ width: w, height: h, colorType: alpha ? 6 : 2, inputColorType: 6, inputHasAlpha: true, deflateLevel: 9 });
  p.data = Buffer.from(rgba);
  return PNG.sync.write(p, { colorType: alpha ? 6 : 2, inputColorType: 6, inputHasAlpha: true, deflateLevel: 9 });
}

/** Re-encode a browser PNG (always RGBA) as 24-bit RGB; refuses an image with any non-opaque pixel. */
export function toOpaqueRgbPng(png: Buffer, what: string): { bytes: Buffer; w: number; h: number } {
  const p = PNG.sync.read(png);
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] !== 255) throw new Error(`${what}: pixel ${(i - 3) / 4} is not opaque (alpha ${p.data[i]})`);
  return { bytes: encodePng(p.data, p.width, p.height, false), w: p.width, h: p.height };
}

export function sha256(b: Buffer | Uint8Array): string {
  return createHash('sha256').update(b).digest('hex');
}

// ---------------------------------------------------------------------------------------------------------
// The store icon and its adaptive layers

const RGBA = ICON_PALETTE.map((hex) => (hex === '' ? ([0, 0, 0, 0] as const) : hexToRgba(hex)));
const BG = hexToRgba(ICON_BACKGROUND);

/** Draw `art` (cells x0..x0+w-1, y0..y0+h-1 of it) at integer scale k with its top-left at (ox, oy). */
function drawArt(out: Uint8Array, size: number, art: Px, k: number, ox: number, oy: number, crop?: { x0: number; y0: number; w: number; h: number }): void {
  if (!Number.isInteger(k) || k < 1) throw new Error(`scale ${k} is not a positive integer`);
  const c = crop ?? { x0: 0, y0: 0, w: art.w, h: art.h };
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const v = art.get(c.x0 + x, c.y0 + y);
      if (v === 0) continue;
      const rgba = RGBA[v]!;
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) out.set(rgba, ((oy + y * k + dy) * size + (ox + x * k + dx)) * 4);
    }
  }
}

/** The cells the foreground draws (its bounding box on the 54 grid). */
export function foregroundBox(): { x0: number; y0: number; w: number; h: number } {
  const p = iconForeground();
  let x0 = p.w;
  let y0 = p.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.get(x, y) === 0) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The store icon's integer scale: the dish (32 cells) at 12 px per cell = 384 px, 75 % of the 512 square. */
export const STORE_ICON_SCALE = 12;
/** The adaptive foreground layer at 512: Android's 108 dp canvas (54 cells) at 9 px per cell, centred. */
export const LAYER_SCALE = 9;

export interface StoreIconFile {
  readonly path: string;
  readonly bytes: Buffer;
  readonly w: number;
  readonly h: number;
  readonly scale: number;
  readonly origin: readonly [number, number];
}

/**
 * store/icon-512.png: the dish with one bright colony (UX §10) on the surround colour, full square, no text, no
 * rounded corners (Play applies its own mask), a 32-bit PNG whose every pixel has alpha 255; plus the adaptive
 * layers: icon-foreground-512.png (transparent outside the dish, the 54-cell canvas at ×9) and
 * icon-background-512.png (the solid surround, opaque RGB).
 */
export function renderStoreIcons(): StoreIconFile[] {
  const N = 512;
  const box = foregroundBox();
  // The icon: the composite (foreground over the surround) cropped to the dish, ×12, centred.
  const icon = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) icon.set(BG, i * 4);
  const iw = box.w * STORE_ICON_SCALE;
  const io: [number, number] = [Math.floor((N - iw) / 2), Math.floor((N - box.h * STORE_ICON_SCALE) / 2)];
  drawArt(icon, N, iconComposite(), STORE_ICON_SCALE, io[0], io[1], box);
  // The foreground layer: transparent, the whole 54-cell canvas ×9 = 486 px, centred (13 px margin).
  const fg = new Uint8Array(N * N * 4);
  const fo = Math.floor((N - FOREGROUND_GRID * LAYER_SCALE) / 2);
  drawArt(fg, N, iconForeground(), LAYER_SCALE, fo, fo);
  // The background layer: the surround colour.
  const bg = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) bg.set(BG, i * 4);
  return [
    { path: `${STORE}/icon-512.png`, bytes: encodePng(icon, N, N, true), w: N, h: N, scale: STORE_ICON_SCALE, origin: io },
    { path: `${STORE}/icon-foreground-512.png`, bytes: encodePng(fg, N, N, true), w: N, h: N, scale: LAYER_SCALE, origin: [fo, fo] },
    { path: `${STORE}/icon-background-512.png`, bytes: encodePng(bg, N, N, false), w: N, h: N, scale: 1, origin: [0, 0] },
  ];
}

// ---------------------------------------------------------------------------------------------------------
// The privacy policy page (PRIVACY_POLICY.md → store/privacy-policy.html, a static page the owner hosts)

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Inline Markdown: `code`, **bold**, [text](url). */
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

/** The small Markdown subset PRIVACY_POLICY.md uses: # headings, paragraphs (with hard-wrapped lines), "- " lists. */
export function markdownToHtml(md: string): string {
  const out: string[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flushPara = (): void => {
    if (para.length > 0) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = (): void => {
    if (list) out.push(`<ul>\n${list.map((li) => `  <li>${inline(li)}</li>`).join('\n')}\n</ul>`);
    list = null;
  };
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const h = /^(#{1,3}) (.*)$/.exec(line);
    if (h) {
      flushPara();
      flushList();
      out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`);
    } else if (line.startsWith('- ')) {
      flushPara();
      (list ??= []).push(line.slice(2));
    } else if (line === '') {
      flushPara();
      flushList();
    } else if (list && raw.startsWith('  ')) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return out.join('\n');
}

export const PRIVACY_HTML = `${STORE}/privacy-policy.html`;

/** store/privacy-policy.html: PRIVACY_POLICY.md as one self-contained page (no script, no external request). */
export function privacyPolicyHtml(md: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pixelmeba privacy policy</title>
<style>
  body { margin: 0 auto; max-width: 44rem; padding: 1.5rem 1rem 3rem; font: 1rem/1.55 system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #172C35; background: #F5F4EF; }
  h1 { font-size: 1.75rem; } h2 { font-size: 1.25rem; margin-top: 2rem; }
  code { font-size: 0.95em; background: #E3EFED; padding: 0 0.2em; border-radius: 3px; }
  a { color: #256E9E; }
</style>
</head>
<body>
<!-- Generated from PRIVACY_POLICY.md by npm run store:assets (tools/store-assets.ts). Edit the Markdown, not this file. -->
${markdownToHtml(md)}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------------------------------------
// The manifest (provenance of every browser-made image)

export interface ShotRecord {
  readonly topic: string;
  readonly file: string;
  readonly size: readonly [number, number];
  readonly viewport: { readonly width: number; readonly height: number };
  readonly deviceScaleFactor: number;
  readonly deviceClass: string;
  readonly buildCommit: string;
  readonly recipe: string | null;
  readonly saveFile: string | null;
  readonly seed: number | null;
  readonly tick: number | null;
  readonly stateHash: string | null;
  readonly shows: string;
  readonly steps: readonly string[];
  readonly sha256: string;
}

export interface FeatureRecord {
  readonly file: string;
  readonly size: readonly [number, number];
  readonly buildCommit: string;
  readonly recipe: string;
  readonly seed: number;
  readonly tick: number;
  readonly stateHash: string;
  readonly picture: { readonly file: string; readonly size: readonly [number, number]; readonly sha256: string; readonly crop: { x: number; y: number; w: number; h: number }; readonly scale: number };
  readonly text: readonly string[];
  readonly steps: readonly string[];
  readonly sha256: string;
}

export interface StoreManifest {
  readonly about: string;
  generatedAt: string;
  feature: FeatureRecord | null;
  shots: ShotRecord[];
}

export const MANIFEST_PATH = `${STORE}/screenshots/manifest.json`;

function readManifest(): StoreManifest {
  const abs = join(ROOT, MANIFEST_PATH);
  const about =
    'Provenance of every store image made from the production build by npm run store:assets (tools/store-assets.ts, tools/lib/storeShots.ts): real play only, no staged state, no text overlay on a screenshot. tick and stateHash are read from the simulation worker at capture.';
  if (!existsSync(abs)) return { about, generatedAt: '', feature: null, shots: [] };
  const m = JSON.parse(readFileSync(abs, 'utf8')) as StoreManifest;
  return { ...m, about };
}

function writeFile(rel: string, bytes: Buffer | string): void {
  const abs = join(ROOT, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, bytes);
}

/** The commit the build was made from, with "+dirty" when the working tree differs from it. */
export function buildCommit(): string {
  try {
    const head = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8' }).trim() !== '';
    return dirty ? `${head}+dirty` : head;
  } catch {
    return 'unknown';
  }
}

// ---------------------------------------------------------------------------------------------------------
// CLI

type Part = 'icon' | 'feature' | 'screenshots';
const PARTS: readonly Part[] = ['icon', 'feature', 'screenshots'];

function argValue(name: string): string | null {
  const i = process.argv.indexOf(name);
  if (i >= 0) return process.argv[i + 1] ?? null;
  const eq = process.argv.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : null;
}

function stopPort(port: number): void {
  try {
    execSync(`lsof -t -i :${port} | xargs -r kill`, { stdio: 'ignore', shell: '/bin/bash' });
  } catch {
    // nothing listening
  }
}

async function main(): Promise<void> {
  const only = argValue('--only');
  const parts = only === null ? PARTS : (only.split(',').map((s) => s.trim()) as Part[]);
  for (const p of parts) if (!PARTS.includes(p)) throw new Error(`--only ${p}: expected icon, feature or screenshots`);

  if (parts.includes('icon')) {
    const html = privacyPolicyHtml(readFileSync(join(ROOT, 'PRIVACY_POLICY.md'), 'utf8'));
    writeFile(PRIVACY_HTML, html);
    console.log(`wrote ${PRIVACY_HTML} from PRIVACY_POLICY.md`);
    for (const f of renderStoreIcons()) {
      writeFile(f.path, f.bytes);
      console.log(`wrote ${f.path} ${f.w}x${f.h} (${f.bytes.length} bytes, sha256 ${sha256(f.bytes).slice(0, 16)}…)`);
    }
  }
  if (!parts.includes('feature') && !parts.includes('screenshots')) return;

  const commit = buildCommit();
  if (!process.argv.includes('--no-build')) {
    console.log(`building the production web app into ${STORE_DIST} (commit ${commit}) …`);
    execFileSync('npx', ['vite', 'build', '--outDir', STORE_DIST, '--emptyOutDir', '--logLevel', 'warn'], { cwd: ROOT, stdio: 'inherit' });
  } else if (!existsSync(join(ROOT, STORE_DIST, 'index.html'))) {
    throw new Error(`--no-build: ${STORE_DIST}/index.html does not exist`);
  }

  const { runStoreSession } = await import('./lib/storeShots');
  const manifest = readManifest();
  stopPort(STORE_PORT);
  try {
    const classes = argValue('--classes')?.split(',') ?? null;
    const topics = argValue('--topics')?.split(',') ?? null;
    const result = await runStoreSession({
      root: ROOT,
      dist: join(ROOT, STORE_DIST),
      port: STORE_PORT,
      commit,
      feature: parts.includes('feature'),
      screenshots: parts.includes('screenshots'),
      classes,
      topics,
      write: writeFile,
      log: (s) => console.log(s),
    });
    if (result.feature) manifest.feature = result.feature;
    if (result.shots.length > 0) {
      const replaced = new Set(result.shots.map((s) => s.file));
      manifest.shots = [...manifest.shots.filter((s) => !replaced.has(s.file)), ...result.shots].sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
    }
    manifest.generatedAt = new Date().toISOString();
    writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`wrote ${MANIFEST_PATH} (${manifest.shots.length} screenshots${manifest.feature ? ' + the feature graphic' : ''})`);
  } finally {
    stopPort(STORE_PORT);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().then(
    () => process.exit(0),
    (e: unknown) => {
      console.error(e instanceof Error ? (e.stack ?? e.message) : e);
      stopPort(STORE_PORT);
      process.exit(1);
    },
  );
}
