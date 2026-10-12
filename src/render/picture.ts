/**
 * The share Picture (P4.6; SPEC §14.4, UX §5.10, CT §12.10 "picture 1080×1080"; D-0080).
 *
 * The picture is drawn from a COPY of one published snapshot of the open dish and its geometry, never
 * from the live stage, the camera, a sim world or any random stream. composePicture() is pure: it turns
 * that copy into a draw list (background and text fills, one pre-painted dish layer, atlas blits) with
 * integer rectangles at an integer scale; drawPicture() executes the list on a 2D canvas with
 * nearest-neighbour sampling, and exportPng() encodes it (the browser writes no text chunk and no device
 * metadata; none is added).
 *
 * Layout (1080 × 1080; PROPOSED DECISION in the P4.6 report): the whole dish at 7 px per cell (896 ×
 * 896) centred horizontally at (92, 92); a question band above it (y 48–92, up to two lines); a bottom
 * band (y 992–1032) with the quiet wordmark "Pixelmeba" on the left, then an optional title and dish
 * time, and the recipe identifier on the right; an optional species key in the four corners of the dish
 * square, which lie outside the round dish. Every item keeps a 48 px safe margin on every side. Hide
 * labels leaves only the dish and the wordmark.
 *
 * Organisms are drawn by their atlas frame exactly as the renderer picks it in reduced motion (stress,
 * else feeding while still, else move/idle; the animation's reducedMotionFrame; the heading row from
 * E_HEADING), at their snapshot positions, one sprite pixel per picture pixel (7 px per cell, close to
 * the live view's 8). Fungal segments, food objects and film are one-cell tiles, as on the live dish.
 * Substrates and deposits use the live dish's own colours (layers.ts DISH_COLORS) and cosmetic hash.
 */
import { CELL_COUNT, GRID_W, MASK_CX, MASK_CY, MASK_R } from '@sim/constants';
import {
  CUE2_PARASITIZED,
  CUE_FEEDING,
  CUE_STRESSED,
  E_CUE,
  E_CUE2,
  E_FLAGS,
  E_HEADING,
  E_LIFE,
  E_LINKMASK,
  E_SPECIES,
  E_X,
  E_Y,
  ENT_STRIDE,
  LINKMASK_DIRS,
  type SnapshotObject,
} from '@worker/protocol';
import type { AtlasManifestLike } from './renderer';
import { cosmetic, DISH_COLORS } from './layers';
import { speciesRgb } from './speciesColors';
import { drawKindOf, filmAlpha, filmLevel, filmTile, objectFrame, tileFrameKey } from './world3';

export const PICTURE_PX = 1080;
export const PICTURE_CELL_PX = 7;
export const PICTURE_DISH_PX = GRID_W * PICTURE_CELL_PX;
/** The safe margin on every side (UX §5.10 "safe margin"). */
export const PICTURE_MARGIN = 48;
/** The dish square's top-left corner (centred horizontally; the question band above it). */
export const PICTURE_DISH_X = (PICTURE_PX - PICTURE_DISH_PX) / 2;
export const PICTURE_DISH_Y = PICTURE_MARGIN + 44;
export const PICTURE_WORDMARK = 'Pixelmeba';
export const PICTURE_MIME = 'image/png';

const BG = '#14252d'; // UX §6 "outside"
const TEXT = '#f5f4ef'; // UX §6 surface
const QUIET = '#9fb0b8';
const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const FLAG_MOVING = 1 << 6; // as src/render/renderer.ts

/** A copy of one published snapshot of the open dish, with its geometry and species tables. */
export interface PictureInput {
  readonly tick: number;
  readonly count: number;
  readonly ents: Float32Array;
  readonly ids: Uint32Array;
  readonly deposits: Uint8Array;
  readonly objects: readonly SnapshotObject[];
  readonly substrate: Uint8Array;
  readonly structure: Uint8Array;
  readonly shade: Float32Array;
  /** In the snapshot's species index order (DishInfo). */
  readonly speciesIds: readonly string[];
  readonly speciesAssets: readonly string[];
  readonly speciesNames: readonly string[];
  /** The followed families' nicknames (drawn only with `includeNicknames`). */
  readonly nicknames: readonly string[];
}

export interface PictureOptions {
  readonly question: string | null;
  /** The offline recipe identifier, e.g. "R-G3 / revision 1 / seed 104729" (or null). */
  readonly identity: string | null;
  readonly title: string | null;
  readonly timeLabel: string | null;
  readonly legend: boolean;
  readonly hideLabels: boolean;
  readonly includeNicknames?: boolean;
  /**
   * A square of `cells` cells from (x0, y0), drawn at the largest integer scale (the gallery's specimens).
   * P4.8b: `cellPx` draws it at that many pixels per cell instead; `bare` returns the crop alone (a list of
   * cells × cellPx square, no surround, no labels: the gallery's own small picture).
   */
  readonly crop?: { readonly x0: number; readonly y0: number; readonly cells: number; readonly cellPx?: number; readonly bare?: boolean };
}

export type TextRole = 'question' | 'wordmark' | 'identity' | 'caption' | 'legend';

export type PictureItem =
  | {
      readonly kind: 'fill';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly color: string;
    }
  /** A pre-painted RGBA layer drawn at scale 1 (the dish). */
  | {
      readonly kind: 'pixels';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly rgba: Uint8ClampedArray;
    }
  /** An atlas frame (source rectangle) into a destination rectangle; integers only. */
  | {
      readonly kind: 'blit';
      readonly sx: number;
      readonly sy: number;
      readonly sw: number;
      readonly sh: number;
      readonly dx: number;
      readonly dy: number;
      readonly dw: number;
      readonly dh: number;
      readonly alpha: number;
    }
  /** Text drawn from its top-left (or top-right/top-centre by `align`), squeezed to `maxWidth`. */
  | {
      readonly kind: 'text';
      readonly role: TextRole;
      readonly text: string;
      readonly x: number;
      readonly y: number;
      readonly size: number;
      readonly maxWidth: number;
      readonly align: 'left' | 'right' | 'center';
      readonly color: string;
    };

export interface PictureList {
  readonly width: number;
  readonly height: number;
  /** Pixels per cell of the dish layer (7 for the whole dish). */
  readonly cellPx: number;
  /** One sprite pixel = this many picture pixels. */
  readonly spriteScale: number;
  readonly items: readonly PictureItem[];
}

type RGB = readonly [number, number, number];

/** A rough width of `text` at `size` px (layout only; the executor squeezes to maxWidth). */
function textWidth(text: string, size: number): number {
  return Math.ceil(Array.from(text).length * size * 0.56);
}

/** Up to `lines` lines of at most `width` px at `size` px, splitting at spaces; the last ends with "…" when cut. */
function wrap(text: string, size: number, width: number, lines: number): string[] {
  const words = text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const out: string[] = [];
  let line = '';
  let k = 0;
  for (; k < words.length; k++) {
    const next = line ? `${line} ${words[k]}` : words[k]!;
    if (textWidth(next, size) <= width || !line) line = next;
    else {
      out.push(line);
      line = words[k]!;
      if (out.length === lines) break;
    }
  }
  if (out.length < lines && line) {
    out.push(line);
    k = words.length;
  }
  if (k < words.length && out.length > 0)
    out[out.length - 1] = `${out[out.length - 1]!.replace(/[\s.,;:!?]+$/, '')}…`;
  return out;
}

function frameIndex(
  manifest: AtlasManifestLike,
): Map<string, { x: number; y: number; w: number; h: number }> {
  const m = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const f of manifest.frames) m.set(f.key, { x: f.x, y: f.y, w: f.w, h: f.h });
  return m;
}

/** The dish layer: substrates, structures and shade, then deposits, in the live dish's colours, at `px` per cell. */
function paintDishLayer(
  input: PictureInput,
  x0: number,
  y0: number,
  cells: number,
  px: number,
): Uint8ClampedArray {
  const W = cells * px;
  const out = new Uint8ClampedArray(W * W * 4);
  const C = DISH_COLORS;
  const put = (x: number, y: number, rgb: RGB, a = 255): void => {
    const o = (y * W + x) * 4;
    if (a >= 255 || out[o + 3] === 0) {
      out[o] = rgb[0];
      out[o + 1] = rgb[1];
      out[o + 2] = rgb[2];
      out[o + 3] = a >= 255 ? 255 : Math.max(out[o + 3]!, a);
      return;
    }
    const t = a / 255;
    out[o] = Math.round(out[o]! * (1 - t) + rgb[0] * t);
    out[o + 1] = Math.round(out[o + 1]! * (1 - t) + rgb[1] * t);
    out[o + 2] = Math.round(out[o + 2]! * (1 - t) + rgb[2] * t);
  };
  const { substrate, structure, shade, deposits } = input;
  const hasSugar = deposits.length >= 5 * CELL_COUNT;
  const hasCat = deposits.length >= 6 * CELL_COUNT;
  const k2 = px * px;
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const gx = x0 + cx;
      const gy = y0 + cy;
      if (gx < 0 || gy < 0 || gx >= GRID_W || gy >= GRID_W) continue;
      const i = gy * GRID_W + gx;
      const st = structure[i]!;
      if (st === 4) continue;
      const sub = substrate[i]!;
      for (let y = 0; y < px; y++) {
        for (let x = 0; x < px; x++) {
          const r = cosmetic(i * k2 + y * px + x, 7);
          let rgb: RGB;
          if (st === 1) {
            const up = structure[i - GRID_W] !== 1 && y === 0;
            const left = structure[i - 1] !== 1 && x === 0;
            const down = structure[i + GRID_W] !== 1 && y === px - 1;
            const right = structure[i + 1] !== 1 && x === px - 1;
            rgb = up || left ? C.stoneLight : down || right ? C.stoneDark : r < 0.12 ? C.stoneDark : C.stone;
          } else if (st === 2) rgb = C.wall;
          else if (sub === 1) rgb = r < 0.08 ? C.gelDark : C.gel;
          else if (sub === 2) rgb = r < 0.15 ? C.sedimentDark : r > 0.93 ? C.sedimentLight : C.sediment;
          else rgb = r < 0.03 ? C.waterLight : r > 0.985 ? C.waterDeep : C.water;
          if (st === 3 && (x + y) % 2 === 0) rgb = C.bead;
          if (shade[i]! < 1)
            rgb = [Math.round(rgb[0] * 0.72), Math.round(rgb[1] * 0.74), Math.round(rgb[2] * 0.78)];
          put(cx * px + x, cy * px + y, rgb);
        }
      }
      // Deposits over the substrate (the glyph rules of layers.ts paintDeposits, scaled to the cell).
      const starch = deposits[i]!;
      const det = deposits[CELL_COUNT + i]!;
      const oil = deposits[2 * CELL_COUNT + i]!;
      const prot = deposits[3 * CELL_COUNT + i]!;
      const sugar = hasSugar ? deposits[4 * CELL_COUNT + i]! : 0;
      const cat = hasCat ? deposits[5 * CELL_COUNT + i]! : 0;
      if ((starch | det | oil | prot | sugar | cat) === 0) continue;
      for (let y = 0; y < px; y++) {
        for (let x = 0; x < px; x++) {
          const k = y * px + x;
          const r = cosmetic(i * k2 + k, 13);
          const X = cx * px + x;
          const Y = cy * px + y;
          if (starch > 0 && r < (starch / 255) * 0.55) put(X, Y, (x + y) % 3 === 0 ? C.starchEdge : C.starch);
          else if (det > 0 && r > 1 - (det / 255) * 0.5) put(X, Y, r > 0.98 ? C.detritusLight : C.detritus);
          else if (oil > 0 && cosmetic(i * k2 + k, 17) < (oil / 255) * 0.35) put(X, Y, C.oil, 200);
          else if (prot > 0 && cosmetic(i * k2 + k, 19) < (prot / 255) * 0.35) put(X, Y, C.protein);
          else if (sugar > 8) put(X, Y, C.sugarHaze, Math.min(120, 20 + Math.round(sugar * 0.45)));
          if (cat > 0 && cosmetic(i * k2 + k, 23) < 0.02 + (cat / 255) * 0.08) put(X, Y, C.catalysis);
        }
      }
    }
  }
  return out;
}

/** The atlas frame the renderer shows for entity k in reduced motion, or null (a virus, or no frame). */
function entityFrame(
  input: PictureInput,
  manifest: AtlasManifestLike,
  frames: Map<string, { x: number; y: number; w: number; h: number }>,
  k: number,
): { key: string; tile: boolean } | null {
  const o = k * ENT_STRIDE;
  const asset = input.speciesAssets[input.ents[o + E_SPECIES]!];
  const sprite = asset ? manifest.sprites[asset] : undefined;
  if (!asset || !sprite) return null;
  const kind = drawKindOf(sprite);
  if (kind === 'virus') return null;
  if (kind === 'fungus') {
    const key = `${asset}/mask/e/${(input.ents[o + E_LINKMASK] ?? 0) & LINKMASK_DIRS}`;
    return frames.has(key) ? { key, tile: true } : null;
  }
  const cue = input.ents[o + E_CUE]!;
  const flags = input.ents[o + E_FLAGS]!;
  const dormant = input.ents[o + E_LIFE]! !== 0;
  const a = sprite.animations;
  const name =
    cue & CUE_STRESSED && a.stress
      ? 'stress'
      : !dormant && cue & CUE_FEEDING && a.feed && !(flags & FLAG_MOVING)
        ? 'feed'
        : a.move
          ? 'move'
          : a.idle
            ? 'idle'
            : null;
  if (name === null) return null;
  const anim = a[name]!;
  const h = input.ents[o + E_HEADING]!;
  const row = sprite.headings === 4 && (h === 1 || h === 2 || h === 3) ? 'eswn'[h]! : 'e';
  const key = `${asset}/${name}/${row}/${anim.reducedMotionFrame}`;
  return frames.has(key) ? { key, tile: false } : null;
}

/** Clip a blit to a destination rectangle at sprite-pixel granularity (integers only); null when nothing is left. */
function clipBlit(
  f: { x: number; y: number; w: number; h: number },
  dx: number,
  dy: number,
  s: number,
  vx: number,
  vy: number,
  vw: number,
  vh: number,
  alpha: number,
): PictureItem | null {
  let sx = f.x;
  let sy = f.y;
  let sw = f.w;
  let sh = f.h;
  if (dx < vx) {
    const n = Math.ceil((vx - dx) / s);
    sx += n;
    sw -= n;
    dx += n * s;
  }
  if (dy < vy) {
    const n = Math.ceil((vy - dy) / s);
    sy += n;
    sh -= n;
    dy += n * s;
  }
  if (dx + sw * s > vx + vw) sw -= Math.ceil((dx + sw * s - (vx + vw)) / s);
  if (dy + sh * s > vy + vh) sh -= Math.ceil((dy + sh * s - (vy + vh)) / s);
  if (sw <= 0 || sh <= 0) return null;
  return { kind: 'blit', sx, sy, sw, sh, dx, dy, dw: sw * s, dh: sh * s, alpha };
}

/** A one-cell tile (fungal segment, food object, film) scaled into its cell's destination square. */
function tileBlit(
  f: { x: number; y: number; w: number; h: number },
  dx: number,
  dy: number,
  cellPx: number,
  alpha: number,
): PictureItem {
  return { kind: 'blit', sx: f.x, sy: f.y, sw: f.w, sh: f.h, dx, dy, dw: cellPx, dh: cellPx, alpha };
}

/**
 * The picture's draw list. Pure: reads only `input` (never changed) and the atlas manifest; the same
 * input and options always give the same list.
 */
export function composePicture(
  input: PictureInput,
  manifest: AtlasManifestLike,
  opts: PictureOptions,
): PictureList {
  const items: PictureItem[] = [{ kind: 'fill', x: 0, y: 0, w: PICTURE_PX, h: PICTURE_PX, color: BG }];
  const crop = opts.crop;
  const cells = crop ? Math.max(1, Math.min(GRID_W, Math.floor(crop.cells))) : GRID_W;
  const gx0 = crop ? Math.floor(crop.x0) : 0;
  const gy0 = crop ? Math.floor(crop.y0) : 0;
  const bare = crop?.bare === true;
  const cellPx = crop?.cellPx !== undefined && Number.isInteger(crop.cellPx) && crop.cellPx >= 1 ? Math.min(crop.cellPx, Math.floor(PICTURE_DISH_PX / cells)) : Math.floor(PICTURE_DISH_PX / cells);
  const viewPx = cells * cellPx;
  const vx = bare ? 0 : PICTURE_DISH_X + Math.floor((PICTURE_DISH_PX - viewPx) / 2);
  const vy = bare ? 0 : PICTURE_DISH_Y + Math.floor((PICTURE_DISH_PX - viewPx) / 2);
  if (bare) items[0] = { kind: 'fill', x: 0, y: 0, w: viewPx, h: viewPx, color: BG };
  const s = Math.max(1, Math.floor(cellPx / PICTURE_CELL_PX));
  items.push({
    kind: 'pixels',
    x: vx,
    y: vy,
    w: viewPx,
    h: viewPx,
    rgba: paintDishLayer(input, gx0, gy0, cells, cellPx),
  });

  const frames = frameIndex(manifest);
  const inView = (cx: number, cy: number): boolean =>
    cx >= gx0 && cy >= gy0 && cx < gx0 + cells && cy < gy0 + cells;
  const cellOrigin = (cx: number, cy: number): [number, number] => [
    vx + (cx - gx0) * cellPx,
    vy + (cy - gy0) * cellPx,
  ];

  // Film tiles, then food objects (as the live layers: dish · film · deposits · objects · organisms).
  for (let i = 0; i < CELL_COUNT && input.deposits.length > 0; i++) {
    const t = filmTile(input.deposits, i);
    if (t < 0) continue;
    const cx = i % GRID_W;
    const cy = Math.floor(i / GRID_W);
    if (!inView(cx, cy)) continue;
    const f = frames.get(tileFrameKey('film', t));
    if (!f) continue;
    const [dx, dy] = cellOrigin(cx, cy);
    items.push(tileBlit(f, dx, dy, cellPx, filmAlpha(filmLevel(input.deposits, i))));
  }
  for (const ob of input.objects) {
    const cx = Math.floor(ob.x);
    const cy = Math.floor(ob.y);
    if (!inView(cx, cy)) continue;
    const f = frames.get(tileFrameKey(ob.kind, objectFrame(ob.fill)));
    if (!f) continue;
    const [dx, dy] = cellOrigin(cx, cy);
    items.push(tileBlit(f, dx, dy, cellPx, 1));
  }

  // Organisms: riders (a parasite on its host) after the others, as the renderer draws them.
  const riders = new Set<number>();
  const hostAt = new Map<string, number>();
  for (let k = 0; k < input.count; k++) {
    const o = k * ENT_STRIDE;
    if (input.ents[o + E_CUE2]! & CUE2_PARASITIZED)
      hostAt.set(`${input.ents[o + E_X]},${input.ents[o + E_Y]}`, k);
  }
  if (hostAt.size > 0)
    for (let k = 0; k < input.count; k++) {
      const o = k * ENT_STRIDE;
      const h = hostAt.get(`${input.ents[o + E_X]},${input.ents[o + E_Y]}`);
      if (h !== undefined && h !== k) riders.add(k);
    }
  for (let pass = 0; pass < (riders.size > 0 ? 2 : 1); pass++) {
    for (let k = 0; k < input.count; k++) {
      if (riders.size > 0 && riders.has(k) !== (pass === 1)) continue;
      const o = k * ENT_STRIDE;
      const x = input.ents[o + E_X]!;
      const y = input.ents[o + E_Y]!;
      const pick = entityFrame(input, manifest, frames, k);
      if (!pick) continue;
      const f = frames.get(pick.key)!;
      if (pick.tile) {
        const cx = Math.floor(x);
        const cy = Math.floor(y);
        if (!inView(cx, cy)) continue;
        const [dx, dy] = cellOrigin(cx, cy);
        items.push(tileBlit(f, dx, dy, cellPx, 1));
        continue;
      }
      const px = vx + Math.round((x - gx0) * cellPx);
      const py = vy + Math.round((y - gy0) * cellPx);
      const b = clipBlit(
        f,
        px - Math.floor((f.w * s) / 2),
        py - Math.floor((f.h * s) / 2),
        s,
        vx,
        vy,
        viewPx,
        viewPx,
        1,
      );
      if (b) items.push(b);
    }
  }

  // P4.8b: a bare crop (the gallery's picture) has no surround and no labels.
  if (bare) return { width: viewPx, height: viewPx, cellPx, spriteScale: s, items };
  // Labels. The wordmark always; everything else only without Hide labels.
  const bandY = PICTURE_DISH_Y + PICTURE_DISH_PX + 8;
  const inner = PICTURE_PX - 2 * PICTURE_MARGIN;
  const wordSize = 20;
  items.push({
    kind: 'text',
    role: 'wordmark',
    text: PICTURE_WORDMARK,
    x: PICTURE_MARGIN,
    y: bandY,
    size: wordSize,
    maxWidth: textWidth(PICTURE_WORDMARK, wordSize),
    align: 'left',
    color: QUIET,
  });
  if (opts.hideLabels) return { width: PICTURE_PX, height: PICTURE_PX, cellPx, spriteScale: s, items };

  const q = opts.question?.trim() ?? '';
  if (q) {
    const one = textWidth(q, 28) <= inner;
    const size = one ? 28 : 20;
    const lines = one ? [q] : wrap(q, size, inner, 2);
    const lh = one ? 44 : 22;
    lines.forEach((line, n) =>
      items.push({
        kind: 'text',
        role: 'question',
        text: line,
        x: PICTURE_PX / 2,
        y: PICTURE_MARGIN + (one ? 6 : 0) + n * lh,
        size,
        maxWidth: inner,
        align: 'center',
        color: TEXT,
      }),
    );
  }
  const id = opts.identity?.trim() ?? '';
  const idWidth = id ? Math.min(textWidth(id, 18), 440) : 0;
  if (id)
    items.push({
      kind: 'text',
      role: 'identity',
      text: id,
      x: PICTURE_PX - PICTURE_MARGIN,
      y: bandY + 2,
      size: 18,
      maxWidth: idWidth,
      align: 'right',
      color: QUIET,
    });
  const caption = [opts.title?.trim() ?? '', opts.timeLabel?.trim() ?? '']
    .filter((t) => t.length > 0)
    .join(' · ');
  if (caption) {
    const x = PICTURE_MARGIN + textWidth(PICTURE_WORDMARK, wordSize) + 16;
    const room = PICTURE_PX - PICTURE_MARGIN - (id ? idWidth + 24 : 0) - x;
    if (room > 60)
      items.push({
        kind: 'text',
        role: 'caption',
        text: `· ${caption}`,
        x,
        y: bandY + 2,
        size: 18,
        maxWidth: room,
        align: 'left',
        color: TEXT,
      });
  }
  if (opts.legend) items.push(...legendItems(input, opts.includeNicknames === true));
  return { width: PICTURE_PX, height: PICTURE_PX, cellPx, spriteScale: s, items };
}

/** The four corners of the dish square lie outside the round dish: up to four key lines in each. */
export const LEGEND_BOXES: readonly {
  readonly x: number;
  readonly y: number;
  readonly align: 'left' | 'right';
}[] = [
  { x: PICTURE_DISH_X, y: PICTURE_DISH_Y, align: 'left' },
  { x: PICTURE_DISH_X + PICTURE_DISH_PX, y: PICTURE_DISH_Y, align: 'right' },
  { x: PICTURE_DISH_X, y: PICTURE_DISH_Y + PICTURE_DISH_PX - 88, align: 'left' },
  { x: PICTURE_DISH_X + PICTURE_DISH_PX, y: PICTURE_DISH_Y + PICTURE_DISH_PX - 88, align: 'right' },
];
export const LEGEND_BOX_W = 140;
const LEGEND_LINES = 4;
const LEGEND_LH = 22;

function legendItems(input: PictureInput, nicknames: boolean): PictureItem[] {
  const counts = new Array<number>(input.speciesIds.length).fill(0);
  for (let k = 0; k < input.count; k++) {
    const sp = input.ents[k * ENT_STRIDE + E_SPECIES]!;
    if (sp >= 0 && sp < counts.length) counts[sp]!++;
  }
  const lines: { text: string; color: string | null }[] = [];
  counts.forEach((n, sp) => {
    if (n > 0)
      lines.push({
        text: `${input.speciesNames[sp] ?? input.speciesIds[sp]} ${n}`,
        color: `rgb(${speciesRgb(input.speciesIds[sp]!).join(', ')})`,
      });
  });
  if (nicknames)
    for (const nick of input.nicknames) if (nick.trim()) lines.push({ text: nick.trim(), color: null });
  const max = LEGEND_BOXES.length * LEGEND_LINES;
  if (lines.length > max)
    lines.splice(max - 1, lines.length - max + 1, { text: `+${lines.length - max + 1} more`, color: null });
  const out: PictureItem[] = [];
  lines.forEach((line, n) => {
    const box = LEGEND_BOXES[Math.floor(n / LEGEND_LINES)]!;
    const y = box.y + (n % LEGEND_LINES) * LEGEND_LH;
    const sw = 12;
    const left = box.align === 'left';
    if (line.color)
      out.push({ kind: 'fill', x: left ? box.x : box.x - sw, y: y + 3, w: sw, h: sw, color: line.color });
    out.push({
      kind: 'text',
      role: 'legend',
      text: line.text,
      x: left ? box.x + sw + 6 : box.x - sw - 6,
      y,
      size: 16,
      maxWidth: LEGEND_BOX_W - sw - 6,
      align: box.align,
      color: TEXT,
    });
  });
  return out;
}

/** The disk the dish occupies in the picture (centre and radius in picture pixels; whole-dish layout). */
export function pictureDisk(): { readonly cx: number; readonly cy: number; readonly r: number } {
  return {
    cx: PICTURE_DISH_X + (MASK_CX + 0.5) * PICTURE_CELL_PX,
    cy: PICTURE_DISH_Y + (MASK_CY + 0.5) * PICTURE_CELL_PX,
    r: (MASK_R + 0.5) * PICTURE_CELL_PX,
  };
}

/** The 2D context surface drawPicture needs (a canvas or OffscreenCanvas context). */
export interface PictureContext {
  imageSmoothingEnabled: boolean;
  globalAlpha: number;
  fillStyle: string | CanvasGradient | CanvasPattern;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  putImageData(data: ImageData, x: number, y: number): void;
  drawImage(
    image: CanvasImageSource,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  createImageData(w: number, h: number): ImageData;
  getImageData(x: number, y: number, w: number, h: number): ImageData;
}

/** Execute a draw list with nearest-neighbour sampling. Nothing is read from anywhere else. */
export function drawPicture(ctx: PictureContext, list: PictureList, atlasImage: CanvasImageSource): void {
  ctx.imageSmoothingEnabled = false;
  for (const it of list.items) {
    ctx.globalAlpha = 1;
    if (it.kind === 'fill') {
      ctx.fillStyle = it.color;
      ctx.fillRect(it.x, it.y, it.w, it.h);
    } else if (it.kind === 'pixels') {
      // Composite the layer over what is there (putImageData would replace the background with clear pixels).
      const under = ctx.getImageData(it.x, it.y, it.w, it.h);
      const d = under.data;
      const src = it.rgba;
      for (let o = 0; o < src.length; o += 4) {
        const a = src[o + 3]!;
        if (a === 0) continue;
        if (a === 255) {
          d[o] = src[o]!;
          d[o + 1] = src[o + 1]!;
          d[o + 2] = src[o + 2]!;
          d[o + 3] = 255;
          continue;
        }
        const t = a / 255;
        d[o] = Math.round(d[o]! * (1 - t) + src[o]! * t);
        d[o + 1] = Math.round(d[o + 1]! * (1 - t) + src[o + 1]! * t);
        d[o + 2] = Math.round(d[o + 2]! * (1 - t) + src[o + 2]! * t);
        d[o + 3] = 255;
      }
      ctx.putImageData(under, it.x, it.y);
    } else if (it.kind === 'blit') {
      ctx.globalAlpha = it.alpha;
      ctx.drawImage(atlasImage, it.sx, it.sy, it.sw, it.sh, it.dx, it.dy, it.dw, it.dh);
    } else {
      ctx.fillStyle = it.color;
      ctx.font = `${it.role === 'question' ? 600 : 400} ${it.size}px ${FONT}`;
      ctx.textAlign = it.align;
      ctx.textBaseline = 'top';
      ctx.fillText(it.text, it.x, it.y, it.maxWidth);
    }
  }
  ctx.globalAlpha = 1;
}

/** Encode the canvas as a PNG (no text chunks, no device metadata). Rejects when the browser cannot. */
export function exportPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('The picture could not be made on this device.'))),
      PICTURE_MIME,
    );
  });
}
