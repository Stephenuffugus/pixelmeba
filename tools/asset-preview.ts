/**
 * Asset previewer (BUILD_DIRECTIVE P1.4, UX §6.1–6.2). Served by the Vite dev server:
 *   npx vite --port 4175 → http://127.0.0.1:4175/tools/asset-preview.html
 * Loads the shipped atlas (public/atlas/organisms.png + manifest.json) and shows every sprite in
 * every animation and heading, animated and as frame strips, every module feature mark in every
 * frame and heading (alone and over bodies, as the dish draws it), every world tile (film textures and
 * a film patch, food object fill steps, the emptied stain), with grayscale and color-vision
 * simulations, and a dense mixed group at neighborhood scale. Nearest-neighbour everywhere.
 * A development tool: it never touches simulation state and is not part of the production build.
 */
import { hexToRgba, P } from '../art/src/palette';
import contentManifest from '../content/manifest.json';

interface AtlasFrame {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
interface AtlasAnimation {
  readonly frames: number;
  readonly durationMs: number;
  readonly loop: boolean;
  readonly reducedMotionFrame: number;
}
interface AtlasSprite {
  readonly speciesId: string;
  readonly size: number;
  readonly headings: number;
  readonly anchor: readonly [number, number];
  readonly animations: Readonly<Record<string, AtlasAnimation>>;
}
interface AtlasFeature {
  readonly size: number;
  readonly headings: number;
  readonly frames: number;
  readonly frameNames?: readonly string[];
}
interface AtlasManifest {
  readonly format: string;
  readonly image: string;
  readonly width: number;
  readonly height: number;
  readonly exportHash: string;
  readonly sprites: Readonly<Record<string, AtlasSprite>>;
  /** Module feature marks by visual layer (ARCH §10.1); frames keyed feature/<layer>/<heading>/<frame>. */
  readonly features?: Readonly<Record<string, AtlasFeature>>;
  /** World tiles (film, food objects, stain; one cell per frame); frames keyed tile/<id>/<frame>. */
  readonly tiles?: Readonly<Record<string, { readonly size: number; readonly frames: number; readonly frameNames?: readonly string[] }>>;
  readonly frames: readonly AtlasFrame[];
}

type Vision = 'none' | 'protan' | 'deutan' | 'tritan';
type Ground = 'water' | 'gel' | 'sediment' | 'outside';

const HEADINGS = ['e', 's', 'w', 'n'] as const;
const HEADING_LABEL: Record<string, string> = { e: 'East', s: 'South', w: 'West', n: 'North' };
const ANIM_ORDER = ['move', 'idle', 'feed', 'reproduction', 'stress', 'death', 'mask', 'decaying', 'tip', 'bud', 'pulse', 'glyph'];
/** Frame sets that are not organism bodies (ARCH §10.1 fungal tiles, UX §6.2 virus glyph): kept out of the dense group. */
const isTileOrGlyph = (sprite: AtlasSprite): boolean => 'mask' in sprite.animations || 'glyph' in sprite.animations;
const ANIM_NOTE: Record<string, string> = {
  mask: 'frame index = connection mask (N 1, E 2, S 4, W 8)',
  decaying: 'dying segment, frame index = connection mask',
  tip: 'overlay drawn over the mask tile at a growing end',
  bud: 'overlay drawn over the mask tile at a branch bud',
  pulse: 'overlay drawn only when a transfer happened (≤ 1/s)',
  glyph: 'inspection glyph (density is a field overlay)',
};
const GROUND: Record<Ground, string> = { water: P.water, gel: P.gel, sediment: P.sediment, outside: P.outside };
/** Machado, Oliveira & Fernandes (2009), severity 1.0, applied in linear RGB. */
const CVD: Record<Exclude<Vision, 'none'>, readonly number[]> = {
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  tritan: [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
};

const speciesNames: Record<string, string> = {};
for (const mod of Object.values(import.meta.glob<{ id: string; name: string }>('../content/species/*.json', { eager: true, import: 'default' }))) {
  speciesNames[mod.id] = mod.name;
}
const enabledSpecies = new Set<string>(contentManifest.enabledSpecies);
const moduleDefs: { id: string; name: string; visualLayer: string }[] = [];
for (const mod of Object.values(import.meta.glob<{ id: string; name: string; visualLayer: string }>('../content/modules/*.json', { eager: true, import: 'default' }))) {
  moduleDefs.push({ id: mod.id, name: mod.name, visualLayer: mod.visualLayer });
}
moduleDefs.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const enabledModules = new Set<string>(contentManifest.enabledModules);
/** Atlas key of a feature-mark frame (as tools/art-build.ts writes it and src/render/features.ts reads it). */
const markKey = (layer: string, heading: string, frame: number): string => `feature/${layer}/${heading}/${frame}`;

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
};

const state = {
  gray: false,
  vision: 'none' as Vision,
  scale: 3,
  ground: 'water' as Ground,
  reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  paused: false,
  denseZoom: 8,
  denseStates: 'mixed' as 'mixed' | 'move',
  denseCount: 60,
  denseSeed: 1,
};

let manifest: AtlasManifest;
let atlasImage: HTMLImageElement;
const frames: Record<string, AtlasFrame> = {};
const variants: Record<string, HTMLCanvasElement> = {};

// ---------- colour variants of the atlas (pixel-exact, computed once per mode) ----------

const toLinear = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (l: number): number => {
  const v = Math.min(1, Math.max(0, l));
  return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055));
};

function source(): HTMLCanvasElement {
  const key = `${state.vision}|${state.gray ? 'gray' : 'color'}`;
  const hit = variants[key];
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = manifest.width;
  c.height = manifest.height;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(atlasImage, 0, 0);
  if (state.vision !== 'none' || state.gray) {
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    const m = state.vision === 'none' ? null : CVD[state.vision];
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      let r = d[i]!;
      let g = d[i + 1]!;
      let b = d[i + 2]!;
      if (m) {
        const lr = toLinear(r);
        const lg = toLinear(g);
        const lb = toLinear(b);
        r = toSrgb(m[0]! * lr + m[1]! * lg + m[2]! * lb);
        g = toSrgb(m[3]! * lr + m[4]! * lg + m[5]! * lb);
        b = toSrgb(m[6]! * lr + m[7]! * lg + m[8]! * lb);
      }
      if (state.gray) {
        // Same luma as tools/lib/png toGrayscale (Rec. 709 weights on sRGB values).
        const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
        r = g = b = l;
      }
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    ctx.putImageData(img, 0, 0);
  }
  variants[key] = c;
  return c;
}

function groundColor(): string {
  const hex = GROUND[state.ground];
  if (!state.gray && state.vision === 'none') return hex;
  // Put the ground through the same transform as the sprites so contrast is judged honestly.
  const [r0, g0, b0] = hexToRgba(hex);
  let r = r0;
  let g = g0;
  let b = b0;
  if (state.vision !== 'none') {
    const m = CVD[state.vision];
    const lr = toLinear(r);
    const lg = toLinear(g);
    const lb = toLinear(b);
    r = toSrgb(m[0]! * lr + m[1]! * lg + m[2]! * lb);
    g = toSrgb(m[3]! * lr + m[4]! * lg + m[5]! * lb);
    b = toSrgb(m[6]! * lr + m[7]! * lg + m[8]! * lb);
  }
  if (state.gray) r = g = b = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
  return `rgb(${r}, ${g}, ${b})`;
}

// ---------- canvases ----------

const dpr = (): number => Math.max(1, Math.round(window.devicePixelRatio || 1));

function sizeCanvas(c: HTMLCanvasElement, cssW: number, cssH: number): CanvasRenderingContext2D {
  const k = dpr();
  c.width = cssW * k;
  c.height = cssH * k;
  c.style.width = `${cssW}px`;
  c.style.height = `${cssH}px`;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Draw one atlas frame with its top-left at (x, y) CSS px, scaled by an integer factor. */
function drawFrame(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, scale: number): boolean {
  const f = frames[key];
  if (!f) return false;
  const k = dpr();
  ctx.drawImage(source(), f.x, f.y, f.w, f.h, Math.round(x * k), Math.round(y * k), f.w * scale * k, f.h * scale * k);
  return true;
}

function frameIndex(a: AtlasAnimation, t: number): number {
  if (state.reduced) return a.reducedMotionFrame;
  if (a.loop) return Math.floor(t / a.durationMs) % a.frames;
  // One-shot animations play once, hold the last frame briefly, then repeat for review.
  const cycle = a.frames * a.durationMs + 600;
  return Math.min(a.frames - 1, Math.floor((t % cycle) / a.durationMs));
}

interface Live {
  readonly draw: (now: number, force: boolean) => void;
}
/** Animated cells of the species section, and the dense-group stage (rebuilt independently). */
let live: Live[] = [];
let dense: Live | null = null;
let strips: (() => void)[] = [];
const allLive = (): Live[] => (dense ? [dense, ...live] : live);

function orderedAnims(sprite: AtlasSprite): string[] {
  const names = Object.keys(sprite.animations);
  return [...ANIM_ORDER.filter((n) => names.includes(n)), ...names.filter((n) => !ANIM_ORDER.includes(n)).sort()];
}

function buildSpecies(): void {
  const root = $('species');
  root.replaceChildren();
  live = [];
  strips = [];
  const s = state.scale;
  for (const [assetId, sprite] of Object.entries(manifest.sprites)) {
    const card = document.createElement('article');
    card.className = 'card';
    const head = document.createElement('header');
    const h3 = document.createElement('h3');
    h3.textContent = `${sprite.speciesId} ${speciesNames[sprite.speciesId] ?? ''}`.trim();
    const meta = document.createElement('span');
    meta.className = 'anim-meta';
    meta.textContent = `${assetId} · ${sprite.size}×${sprite.size} · ${sprite.headings} heading${sprite.headings === 1 ? '' : 's'}`;
    head.append(h3, meta);
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = enabledSpecies.has(sprite.speciesId) ? 'enabled in this build' : 'not enabled';
    head.append(badge);
    const missing: string[] = [];
    card.append(head);
    for (const anim of orderedAnims(sprite)) {
      const a = sprite.animations[anim]!;
      const block = document.createElement('div');
      block.className = 'anim';
      const title = document.createElement('div');
      title.innerHTML = `<span class="anim-title"></span> <span class="anim-meta"></span>`;
      title.children[0]!.textContent = anim;
      title.children[1]!.textContent = ANIM_NOTE[anim]
        ? `${a.frames} frame${a.frames === 1 ? '' : 's'} · ${ANIM_NOTE[anim]}`
        : `${a.frames} frame${a.frames === 1 ? '' : 's'} · ${a.durationMs} ms/frame · ${a.loop ? 'loops' : 'plays once'} · reduced-motion frame ${a.reducedMotionFrame}`;
      block.append(title);
      const row = document.createElement('div');
      row.className = 'headings';
      for (let h = 0; h < sprite.headings; h++) {
        const hk = HEADINGS[h]!;
        const cell = document.createElement('div');
        cell.className = 'heading';
        const label = document.createElement('div');
        label.className = 'h-label';
        label.textContent = sprite.headings === 1 ? 'Any heading' : HEADING_LABEL[hk]!;
        const anim1 = document.createElement('canvas');
        anim1.className = 'stage';
        anim1.setAttribute('aria-label', `${assetId} ${anim} ${label.textContent} animated`);
        const strip = document.createElement('canvas');
        strip.className = 'stage';
        strip.setAttribute('aria-label', `${assetId} ${anim} ${label.textContent} frames`);
        const stripWrap = document.createElement('div');
        stripWrap.className = 'scroll';
        // A sideways-scrolling strip must be reachable by keyboard (axe scrollable-region-focusable).
        stripWrap.tabIndex = 0;
        stripWrap.setAttribute('role', 'region');
        stripWrap.setAttribute('aria-label', `${assetId} ${anim} ${label.textContent} frames (scrolls sideways)`);
        stripWrap.append(strip);
        cell.append(label, anim1, stripWrap);
        row.append(cell);
        const size = sprite.size;
        const pad = 2;
        const actx = sizeCanvas(anim1, size * s + pad * 2, size * s + pad * 2);
        const sctx = sizeCanvas(strip, a.frames * (size * s + pad) + pad, size * s + pad * 2);
        for (let i = 0; i < a.frames; i++) if (!frames[`${assetId}/${anim}/${hk}/${i}`]) missing.push(`${anim}/${hk}/${i}`);
        const phase = h * 37;
        let shown = -1;
        live.push({
          draw(now, force) {
            const idx = frameIndex(a, now + phase);
            if (idx === shown && !force) return;
            shown = idx;
            actx.fillStyle = groundColor();
            actx.fillRect(0, 0, anim1.width, anim1.height);
            drawFrame(actx, `${assetId}/${anim}/${hk}/${idx}`, pad, pad, s);
          },
        });
        strips.push(() => {
          sctx.fillStyle = groundColor();
          sctx.fillRect(0, 0, strip.width, strip.height);
          for (let i = 0; i < a.frames; i++) drawFrame(sctx, `${assetId}/${anim}/${hk}/${i}`, pad + i * (size * s + pad), pad, s);
        });
      }
      block.append(row);
      card.append(block);
    }
    if (missing.length > 0) {
      const warn = document.createElement('span');
      warn.className = 'badge warn';
      warn.textContent = `missing frames: ${missing.join(', ')}`;
      head.append(warn);
    }
    root.append(card);
  }
}

// ---------- fungal networks ----------

/** A small network ('#' segment, 'b' bud, 'd' decaying, 'p' pulse junction), edges joined by mask. */
const NETWORK = ['..#.....', '.####...', '..#.#d#.', '..p..#..', '.#b###d.', '.#......'];

function buildFungi(): void {
  const root = $('fungi');
  root.replaceChildren();
  const s = state.scale;
  const fungi = Object.keys(manifest.sprites).filter((id) => 'mask' in manifest.sprites[id]!.animations);
  const at = (x: number, y: number): string => NETWORK[y]?.[x] ?? '.';
  for (const assetId of fungi) {
    const sprite = manifest.sprites[assetId]!;
    const card = document.createElement('article');
    card.className = 'card';
    const head = document.createElement('header');
    const h3 = document.createElement('h3');
    h3.textContent = `${sprite.speciesId} ${speciesNames[sprite.speciesId] ?? ''} network`.trim();
    head.append(h3);
    card.append(head);
    const wrap = document.createElement('div');
    wrap.className = 'scroll';
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', `${assetId} network (scrolls sideways)`);
    const canvas = document.createElement('canvas');
    canvas.className = 'stage';
    canvas.setAttribute('aria-label', `${assetId} tiles assembled into a network`);
    wrap.append(canvas);
    card.append(wrap);
    root.append(card);
    const t = sprite.size * s;
    const cols = NETWORK[0]!.length;
    const ctx = sizeCanvas(canvas, cols * t, NETWORK.length * t);
    strips.push(() => {
      ctx.fillStyle = groundColor();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let y = 0; y < NETWORK.length; y++) {
        for (let x = 0; x < cols; x++) {
          const c = at(x, y);
          if (c === '.') continue;
          const on = (cx: number, cy: number) => at(cx, cy) !== '.';
          const mask = (on(x, y - 1) ? 1 : 0) | (on(x + 1, y) ? 2 : 0) | (on(x, y + 1) ? 4 : 0) | (on(x - 1, y) ? 8 : 0);
          const degree = [1, 2, 4, 8].filter((b) => mask & b).length;
          drawFrame(ctx, `${assetId}/${c === 'd' ? 'decaying' : 'mask'}/e/${mask}`, x * t, y * t, s);
          if (c === 'b') drawFrame(ctx, `${assetId}/bud/e/0`, x * t, y * t, s);
          else if (c === 'p') drawFrame(ctx, `${assetId}/pulse/e/1`, x * t, y * t, s);
          else if (c !== 'd' && degree <= 1) drawFrame(ctx, `${assetId}/tip/e/0`, x * t, y * t, s);
        }
      }
    });
  }
}

// ---------- module feature marks ----------

/** Body a mark is shown over: the first move/idle frame of a sprite in one heading. */
function bodyKey(assetId: string, heading: string): string | null {
  const sprite = manifest.sprites[assetId];
  if (!sprite) return null;
  const anim = sprite.animations.move ? 'move' : 'idle';
  return `${assetId}/${anim}/${sprite.headings === 4 ? heading : 'e'}/0`;
}

function buildMarks(): void {
  const root = $('marks');
  root.replaceChildren();
  const s = state.scale;
  const features = manifest.features ?? {};
  // A small (16×16, four-heading) body and a large one, as the dish scales marks by frame size / 16.
  const small = Object.keys(manifest.sprites).find((id) => manifest.sprites[id]!.size === 16 && manifest.sprites[id]!.headings === 4) ?? null;
  const large = Object.keys(manifest.sprites).find((id) => manifest.sprites[id]!.size >= 32) ?? null;
  for (const [layer, feat] of Object.entries(features)) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.mark = layer;
    const head = document.createElement('header');
    const h3 = document.createElement('h3');
    h3.textContent = layer;
    const meta = document.createElement('span');
    meta.className = 'anim-meta';
    meta.textContent = `${feat.frames} frame${feat.frames === 1 ? '' : 's'} · ${feat.size}×${feat.size} · ${feat.headings} headings · drawn at the body's center, heading and scale`;
    head.append(h3, meta);
    for (const m of moduleDefs.filter((d) => d.visualLayer === layer)) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = `${m.id} ${m.name} · ${enabledModules.has(m.id) ? 'enabled in this build' : 'not enabled'}`;
      head.append(badge);
    }
    card.append(head);
    const missing: string[] = [];
    for (let i = 0; i < feat.frames; i++) {
      const block = document.createElement('div');
      block.className = 'anim';
      const title = document.createElement('div');
      title.innerHTML = `<span class="anim-title"></span> <span class="anim-meta"></span>`;
      title.children[0]!.textContent = `frame ${i}`;
      title.children[1]!.textContent = feat.frameNames?.[i] ?? '';
      block.append(title);
      const row = document.createElement('div');
      row.className = 'headings';
      for (let h = 0; h < feat.headings; h++) {
        const hk = HEADINGS[h]!;
        const key = markKey(layer, hk, i);
        if (!frames[key]) missing.push(`${hk}/${i}`);
        const cell = document.createElement('div');
        cell.className = 'heading';
        const label = document.createElement('div');
        label.className = 'h-label';
        label.textContent = `${HEADING_LABEL[hk]!} · alone, then over ${small ?? 'a body'}`;
        const canvas = document.createElement('canvas');
        canvas.className = 'stage';
        canvas.setAttribute('aria-label', `${layer} frame ${i} ${HEADING_LABEL[hk]!}, alone and over a body`);
        cell.append(label, canvas);
        row.append(cell);
        const size = feat.size;
        const pad = 2;
        const ctx = sizeCanvas(canvas, 2 * (size * s) + pad * 3, size * s + pad * 2);
        strips.push(() => {
          ctx.fillStyle = groundColor();
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          drawFrame(ctx, key, pad, pad, s);
          const body = small ? bodyKey(small, hk) : null;
          if (body) drawFrame(ctx, body, pad * 2 + size * s, pad, s);
          drawFrame(ctx, key, pad * 2 + size * s, pad, s);
        });
      }
      // A large body (one heading) carries the East mark scaled ×(frame size / 16), as the dish does.
      if (large) {
        const lsize = manifest.sprites[large]!.size;
        const k = lsize / feat.size;
        const cell = document.createElement('div');
        cell.className = 'heading';
        const label = document.createElement('div');
        label.className = 'h-label';
        label.textContent = `over ${large} (${lsize}×${lsize}, mark ×${k})`;
        const canvas = document.createElement('canvas');
        canvas.className = 'stage';
        canvas.setAttribute('aria-label', `${layer} frame ${i} over ${large}`);
        cell.append(label, canvas);
        row.append(cell);
        const pad = 2;
        const ctx = sizeCanvas(canvas, lsize * s + pad * 2, lsize * s + pad * 2);
        const key = markKey(layer, 'e', i);
        strips.push(() => {
          ctx.fillStyle = groundColor();
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const body = bodyKey(large, 'e');
          if (body) drawFrame(ctx, body, pad, pad, s);
          drawFrame(ctx, key, pad, pad, s * k);
        });
      }
      block.append(row);
      card.append(block);
    }
    if (missing.length > 0) {
      const warn = document.createElement('span');
      warn.className = 'badge warn';
      warn.textContent = `missing frames: ${missing.join(', ')}`;
      head.append(warn);
    }
    root.append(card);
  }
}

// ---------- world tiles (film, food objects) ----------

/**
 * A film patch as the dish draws it (src/render/world3.ts filmTile): '#' film, 'e' eroding film, '.'
 * none; each cell's tile from its four neighbours, opacity rising toward the patch centre.
 */
const FILM_PATCH = ['..........', '.#.....##.', '......###.', '..####.##.', '..#####...', '..##e#e...', '...#ee....', '..........'];

/** One card per world tile: every frame, then (film) a patch drawn edge to edge with the dish's opacities. */
function buildTiles(): void {
  const root = $('tiles');
  root.replaceChildren();
  const s = state.scale;
  for (const [id, tile] of Object.entries(manifest.tiles ?? {})) {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.tile = id;
    const head = document.createElement('header');
    const h3 = document.createElement('h3');
    h3.textContent = id;
    const meta = document.createElement('span');
    meta.className = 'anim-meta';
    meta.textContent = `${tile.frames} frame${tile.frames === 1 ? '' : 's'} · ${tile.size}×${tile.size} · one cell per frame, never rotated`;
    head.append(h3, meta);
    card.append(head);
    const row = document.createElement('div');
    row.className = 'headings';
    const missing: string[] = [];
    for (let i = 0; i < tile.frames; i++) {
      const key = `tile/${id}/${i}`;
      if (!frames[key]) missing.push(String(i));
      const cell = document.createElement('div');
      cell.className = 'heading';
      const label = document.createElement('div');
      label.className = 'h-label';
      label.textContent = `${i} · ${tile.frameNames?.[i] ?? ''}`;
      const canvas = document.createElement('canvas');
      canvas.className = 'stage';
      canvas.setAttribute('aria-label', `${id} frame ${i}`);
      cell.append(label, canvas);
      row.append(cell);
      const pad = 2;
      const ctx = sizeCanvas(canvas, tile.size * s + pad * 2, tile.size * s + pad * 2);
      strips.push(() => {
        ctx.fillStyle = groundColor();
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawFrame(ctx, key, pad, pad, s);
      });
    }
    card.append(row);
    if (id === 'film') {
      const canvas = document.createElement('canvas');
      canvas.className = 'stage';
      canvas.setAttribute('aria-label', 'film patch: isolated, edge, center and eroding tiles edge to edge, opacity by film level');
      card.append(canvas);
      const t = tile.size * s;
      const cols = FILM_PATCH[0]!.length;
      const ctx = sizeCanvas(canvas, cols * t, FILM_PATCH.length * t);
      const at = (x: number, y: number): string => FILM_PATCH[y]?.[x] ?? '.';
      strips.push(() => {
        ctx.fillStyle = groundColor();
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let y = 0; y < FILM_PATCH.length; y++)
          for (let x = 0; x < cols; x++) {
            const c = at(x, y);
            if (c === '.') continue;
            const n = [at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)].filter((v) => v !== '.').length;
            const frame = c === 'e' ? 3 : n === 0 ? 0 : n === 4 ? 2 : 1;
            // The dish's opacity rule (world3.ts filmAlpha) for a level that rises toward the middle.
            const level = Math.min(127, 30 + 24 * n);
            ctx.globalAlpha = 0.25 + 0.6 * (level / 127);
            drawFrame(ctx, `tile/film/${frame}`, x * t, y * t, s);
            ctx.globalAlpha = 1;
          }
      });
    }
    if (missing.length > 0) {
      const warn = document.createElement('span');
      warn.className = 'badge warn';
      warn.textContent = `missing frames: ${missing.join(', ')}`;
      head.append(warn);
    }
    root.append(card);
  }
}

// ---------- dense group ----------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Body {
  readonly assetId: string;
  readonly anim: string;
  readonly heading: string;
  readonly x: number;
  readonly y: number;
  readonly phase: number;
}

const DENSE_W = 40; // cells
const DENSE_H = 24;
let bodies: Body[] = [];

function layoutDense(): void {
  const rnd = mulberry32(state.denseSeed * 7919 + state.denseCount);
  const assets = Object.keys(manifest.sprites).filter((id) => !isTileOrGlyph(manifest.sprites[id]!));
  const large = assets.filter((id) => manifest.sprites[id]!.size >= 32);
  const small = assets.filter((id) => manifest.sprites[id]!.size < 32);
  // Every sprite appears: ~6 % large consumers (at least one each), the rest shared evenly among
  // small organisms, as in a busy first dish. Then shuffled, so draw order is arbitrary, as in
  // the dish (entity order, no depth sort).
  const pool: string[] = [];
  const nLarge = large.length === 0 ? 0 : Math.max(1, Math.round((state.denseCount * 0.06) / large.length));
  for (const id of large) for (let k = 0; k < nLarge && pool.length < state.denseCount; k++) pool.push(id);
  for (let k = 0; pool.length < state.denseCount; k++) pool.push((small.length > 0 ? small : large)[k % (small.length || large.length)]!);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const cx = DENSE_W / 2;
  const cy = DENSE_H / 2;
  const radius = Math.max(2, Math.sqrt(state.denseCount) * 0.8);
  bodies = [];
  for (const assetId of pool) {
    const sprite = manifest.sprites[assetId]!;
    const minGap = sprite.size >= 32 ? 2.5 : 1; // visible bodies ≈ 1 cell (small) / 3 cells (large)
    let x = cx;
    let y = cy;
    for (let tries = 0; tries < 60; tries++) {
      const ang = rnd() * Math.PI * 2;
      const rr = radius * Math.sqrt(rnd());
      x = cx + Math.cos(ang) * rr * 1.4;
      y = cy + Math.sin(ang) * rr;
      if (bodies.every((b) => Math.hypot(b.x - x, b.y - y) >= Math.max(minGap, manifest.sprites[b.assetId]!.size >= 32 ? 2.5 : 1))) break;
    }
    const anims = Object.keys(sprite.animations);
    let anim = anims.includes('move') ? 'move' : 'idle';
    if (state.denseStates === 'mixed') {
      const r = rnd();
      if (r < 0.12 && anims.includes('stress')) anim = 'stress';
      else if (r < 0.24 && anims.includes('reproduction')) anim = 'reproduction';
      else if (r < 0.4 && anims.includes('feed')) anim = 'feed';
    }
    const heading = sprite.headings === 4 ? HEADINGS[Math.floor(rnd() * 4)]! : 'e';
    bodies.push({ assetId, anim, heading, x, y, phase: Math.floor(rnd() * 1000) });
  }
}

function buildDense(): void {
  const canvas = $<HTMLCanvasElement>('dense');
  const z = state.denseZoom;
  const ctx = sizeCanvas(canvas, DENSE_W * z, DENSE_H * z);
  const scale = z / 8; // ARCH §9: 16 px frame = 2 cells at scale 1 (8 px/cell)
  const mix: Record<string, number> = {};
  for (const b of bodies) mix[manifest.sprites[b.assetId]!.speciesId] = (mix[manifest.sprites[b.assetId]!.speciesId] ?? 0) + 1;
  const parts = Object.keys(mix)
    .sort()
    .map((id) => `${mix[id]} ${id}`);
  $('dense-sub').textContent = `${bodies.length} organisms (${parts.join(', ')}) at ${z} px per cell, sprite scale ${scale}×, as the dish draws them at this zoom.`;
  dense = {
    draw(now) {
      ctx.fillStyle = groundColor();
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (const b of bodies) {
        const sprite = manifest.sprites[b.assetId]!;
        const a = sprite.animations[b.anim]!;
        const idx = frameIndex(a, now + b.phase);
        const half = (sprite.size * scale) / 2;
        drawFrame(ctx, `${b.assetId}/${b.anim}/${b.heading}/${idx}`, Math.round(b.x * z - half), Math.round(b.y * z - half), scale);
      }
    },
  };
}

function drawSheet(): void {
  const canvas = $<HTMLCanvasElement>('sheet');
  const k = 2;
  const ctx = sizeCanvas(canvas, manifest.width * k, manifest.height * k);
  ctx.fillStyle = groundColor();
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source(), 0, 0, manifest.width, manifest.height, 0, 0, canvas.width, canvas.height);
  $('atlas-sub').textContent = `${manifest.image} · ${manifest.width}×${manifest.height} · ${manifest.frames.length} frames · export ${manifest.exportHash.slice(0, 12)} · shown at ${k}×`;
}

// ---------- loop and controls ----------

let pausedAt = 0;
let offset = 0;
function clock(): number {
  return state.paused ? pausedAt : performance.now() - offset;
}

function redrawAll(): void {
  for (const s of strips) s();
  const t = clock();
  for (const l of allLive()) l.draw(t, true);
  drawSheet();
}

function tick(): void {
  const t = clock();
  for (const l of allLive()) l.draw(t, false);
  requestAnimationFrame(tick);
}

function wire(): void {
  const gray = $<HTMLInputElement>('gray');
  gray.addEventListener('change', () => {
    state.gray = gray.checked;
    redrawAll();
  });
  const vision = $<HTMLSelectElement>('cvd');
  vision.addEventListener('change', () => {
    state.vision = vision.value as Vision;
    redrawAll();
  });
  const scale = $<HTMLSelectElement>('scale');
  scale.addEventListener('change', () => {
    state.scale = Number(scale.value);
    buildSpecies();
    buildFungi();
    buildMarks();
    buildTiles();
    redrawAll();
  });
  const ground = $<HTMLSelectElement>('ground');
  ground.addEventListener('change', () => {
    state.ground = ground.value as Ground;
    redrawAll();
  });
  const reduced = $<HTMLInputElement>('reduced');
  reduced.checked = state.reduced;
  reduced.addEventListener('change', () => {
    state.reduced = reduced.checked;
    redrawAll();
  });
  const pause = $<HTMLButtonElement>('pause');
  pause.addEventListener('click', () => {
    if (state.paused) offset = performance.now() - pausedAt;
    else pausedAt = clock();
    state.paused = !state.paused;
    pause.textContent = state.paused ? 'Play' : 'Pause';
    pause.setAttribute('aria-pressed', String(state.paused));
  });
  const zoom = $<HTMLSelectElement>('dense-zoom');
  zoom.addEventListener('change', () => {
    state.denseZoom = Number(zoom.value);
    buildDense();
    redrawAll();
  });
  const states = $<HTMLSelectElement>('dense-states');
  states.addEventListener('change', () => {
    state.denseStates = states.value as 'mixed' | 'move';
    layoutDense();
    buildDense();
    redrawAll();
  });
  const count = $<HTMLInputElement>('dense-count');
  count.addEventListener('change', () => {
    state.denseCount = Math.max(1, Math.min(400, Math.round(Number(count.value)) || 60));
    count.value = String(state.denseCount);
    layoutDense();
    buildDense();
    redrawAll();
  });
  $('dense-shuffle').addEventListener('click', () => {
    state.denseSeed++;
    layoutDense();
    buildDense();
    redrawAll();
  });
}

async function main(): Promise<void> {
  const status = $('status');
  try {
    const base = new URL('../atlas/', window.location.href);
    const res = await fetch(new URL('manifest.json', base));
    if (!res.ok) throw new Error(`manifest.json: HTTP ${res.status}`);
    manifest = (await res.json()) as AtlasManifest;
    if (manifest.format !== 'pixelmeba-atlas') throw new Error('manifest.json is not a pixelmeba atlas');
    for (const f of manifest.frames) frames[f.key] = f;
    atlasImage = new Image();
    atlasImage.src = new URL(manifest.image, base).href;
    await atlasImage.decode();
    const sprites = Object.keys(manifest.sprites).length;
    const missingEnabled = [...enabledSpecies].filter((id) => !Object.values(manifest.sprites).some((s) => s.speciesId === id));
    const markless = moduleDefs.filter((m) => enabledModules.has(m.id) && !manifest.features?.[m.visualLayer]).map((m) => `${m.id} (${m.visualLayer})`);
    status.textContent =
      `${sprites} sprites · ${Object.keys(manifest.features ?? {}).length} module marks · ${Object.keys(manifest.tiles ?? {}).length} world tiles · ${manifest.frames.length} frames · export ${manifest.exportHash.slice(0, 12)}` +
      (missingEnabled.length > 0 ? ` · NO SPRITE for enabled ${missingEnabled.join(', ')}` : ' · every enabled species has a sprite') +
      (markless.length > 0 ? ` · NO MARK for enabled ${markless.join(', ')}` : ' · every enabled module has its mark');
    if (missingEnabled.length > 0 || markless.length > 0) status.className = 'error';
    wire();
    layoutDense();
    buildDense();
    buildSpecies();
    buildFungi();
    buildMarks();
    buildTiles();
    redrawAll();
    requestAnimationFrame(tick);
    document.body.dataset.ready = '1';
  } catch (e) {
    status.textContent = `Could not load the atlas: ${e instanceof Error ? e.message : String(e)}. Run npm run art:build, then serve with the Vite dev server.`;
    status.className = 'error';
    document.body.dataset.ready = 'error';
  }
}

void main();
