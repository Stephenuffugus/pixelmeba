/**
 * The specimen gallery on the main thread (P4.8b; SPEC §12.8 "specimen gallery (image + species + inspector
 * summary; never spawns)"; D02 §20 "Gallery images do not spawn organisms or alter inventory"; D-0070).
 *
 * - `buildGalleryEntry` composes an entry from a COPY of the latest published snapshot and the inspector
 *   answer already on screen: no new worker query of world state, nothing changes in the world.
 * - `galleryPicture` turns an entry back into a picture input for src/render/picture.ts (a bare 16-cell crop
 *   at 14 px per cell, sprites at scale 2): the picture is drawn from the stored crop only.
 * - The only worker requests are the notebook's own 'galleryAdd' and 'galleryDelete' (GalleryClient). This
 *   module has no command, no Add Life path and no genome: an entry cannot put anything into a dish.
 */
import { CELL_COUNT, GRID_W } from '@sim/constants';
import { ENT_STRIDE, E_HEADING, E_SPECIES, E_X, E_Y, ID_STRIDE, type EntityInspect, type GalleryEntryInput } from '@worker/protocol';
import type { NotebookRecord } from '@persist/notebook';
import {
  cleanGalleryLine,
  cropCoord,
  decodeGround,
  encodeGround,
  GALLERY_CROP_CELLS,
  GALLERY_GROUND_BYTES,
  GALLERY_SPRITES_MAX,
  GALLERY_SUMMARY_LINES,
  groundByte,
  type GalleryEntry,
  type GallerySprite,
} from '@persist/notebookGallery';
import type { PictureInput, PictureOptions } from '@render/picture';
import { actionLabel, dormancyChip, originChip } from './strings/modules';
import { constraintWords, leadConstraint } from './strings/shortcuts';

/** Pixels per cell of the gallery's picture (16 cells → 224 px; sprites at scale 2, as the share picture's 7 px at scale 1). */
export const GALLERY_CELL_PX = 14;
export const GALLERY_PICTURE_PX = GALLERY_CROP_CELLS * GALLERY_CELL_PX;

/** The notebook requests the gallery makes (SimClient has both): notebook state only, never a command. */
export interface GalleryClient {
  galleryAdd(dishId: string, entry: GalleryEntryInput): Promise<{ readonly record: NotebookRecord; readonly refused?: string }>;
  galleryDelete(dishId: string, id: string): Promise<{ readonly record: NotebookRecord; readonly refused?: string }>;
}

/** The inspector's depth-1 lines as it shows them: name and number, the chips, and the constraint line. */
export function gallerySummaryLines(e: EntityInspect, speciesName: string): string[] {
  const chips = [actionLabel(e), `age ${Math.floor(e.age)} s`, `generation ${e.generation}`, originChip(e.origin), dormancyChip(e.dormancy)].filter((c): c is string => typeof c === 'string' && c.length > 0);
  const c = leadConstraint(e);
  const cw = constraintWords(e, c.code, c.value);
  const lines = [`${speciesName} #${e.birthId}`, chips.join(' · '), cw.text, cw.detail].map(cleanGalleryLine).filter((l) => l.length > 0);
  return lines.slice(0, GALLERY_SUMMARY_LINES);
}

/** What `buildGalleryEntry` reads: copies of one published snapshot and its geometry. */
export interface GallerySource {
  readonly tick: number;
  readonly count: number;
  readonly ents: Float32Array;
  readonly ids: Uint32Array;
  readonly substrate: Uint8Array;
  readonly structure: Uint8Array;
  readonly shade: Float32Array;
}

/**
 * An entry for organism `e` (the inspector's answer on screen) from `src`. The crop is the 16 × 16 cells
 * around it (clamped inside the grid); sprites are the organisms whose cell lies in the crop, the selected one
 * first, then by distance from it (at most 200). Null when the organism is not in that snapshot.
 */
export function buildGalleryEntry(e: EntityInspect, speciesName: string, src: GallerySource): GalleryEntryInput | null {
  let k0 = -1;
  for (let k = 0; k < src.count; k++) if (src.ids[k * ID_STRIDE] === e.birthId) k0 = k;
  if (k0 < 0) return null;
  const px = src.ents[k0 * ENT_STRIDE + E_X]!;
  const py = src.ents[k0 * ENT_STRIDE + E_Y]!;
  const half = GALLERY_CROP_CELLS / 2;
  const clampCell = (v: number) => Math.max(0, Math.min(GRID_W - GALLERY_CROP_CELLS, Math.floor(v) - half));
  const x0 = clampCell(px);
  const y0 = clampCell(py);
  const within = (v: number, o: number) => Math.floor(v) >= o && Math.floor(v) < o + GALLERY_CROP_CELLS;
  const picked: { k: number; d: number }[] = [];
  for (let k = 0; k < src.count; k++) {
    const x = src.ents[k * ENT_STRIDE + E_X]!;
    const y = src.ents[k * ENT_STRIDE + E_Y]!;
    if (!within(x, x0) || !within(y, y0)) continue;
    picked.push({ k, d: k === k0 ? -1 : (x - px) ** 2 + (y - py) ** 2 });
  }
  picked.sort((a, b) => a.d - b.d || a.k - b.k);
  const inCrop = (v: number) => Math.min(cropCoord(v), GALLERY_CROP_CELLS - 0.1);
  const sprites: GallerySprite[] = picked.slice(0, GALLERY_SPRITES_MAX).map(({ k }) => {
    const o = k * ENT_STRIDE;
    const h = Math.round(src.ents[o + E_HEADING]!);
    return [Math.max(0, Math.round(src.ents[o + E_SPECIES]!)), inCrop(src.ents[o + E_X]! - x0), inCrop(src.ents[o + E_Y]! - y0), h >= 0 && h <= 3 ? h : 0];
  });
  const ground = new Uint8Array(GALLERY_GROUND_BYTES);
  for (let cy = 0; cy < GALLERY_CROP_CELLS; cy++)
    for (let cx = 0; cx < GALLERY_CROP_CELLS; cx++) {
      const i = (y0 + cy) * GRID_W + (x0 + cx);
      ground[cy * GALLERY_CROP_CELLS + cx] = groundByte(src.substrate[i] ?? 0, src.structure[i] ?? 4, (src.shade[i] ?? 1) < 1);
    }
  return {
    tick: src.tick,
    speciesId: e.speciesId,
    birthId: e.birthId,
    summary: gallerySummaryLines(e, speciesName),
    crop: { x0, y0, cells: GALLERY_CROP_CELLS, sprites, substrate: encodeGround(ground) },
  };
}

/** The picture input for an entry: the stored crop placed back on an empty grid (nothing else is read). */
export function galleryPicture(
  entry: GalleryEntry,
  species: { readonly ids: readonly string[]; readonly assets: readonly string[]; readonly names: readonly string[] },
): { readonly input: PictureInput; readonly options: PictureOptions } | null {
  const g = decodeGround(entry.crop.substrate);
  if (!g) return null;
  const substrate = new Uint8Array(CELL_COUNT);
  const structure = new Uint8Array(CELL_COUNT).fill(4);
  const shade = new Float32Array(CELL_COUNT).fill(1);
  const { x0, y0 } = entry.crop;
  for (let cy = 0; cy < GALLERY_CROP_CELLS; cy++)
    for (let cx = 0; cx < GALLERY_CROP_CELLS; cx++) {
      const j = cy * GALLERY_CROP_CELLS + cx;
      const i = (y0 + cy) * GRID_W + (x0 + cx);
      substrate[i] = g.substrate[j]!;
      structure[i] = g.structure[j]!;
      shade[i] = g.shaded[j] ? 0.5 : 1;
    }
  // Drawn last-first so the specimen itself (row 0) lies on top.
  const rows = [...entry.crop.sprites].reverse();
  const ents = new Float32Array(rows.length * ENT_STRIDE);
  const ids = new Uint32Array(rows.length * ID_STRIDE);
  rows.forEach(([sp, x, y, h], k) => {
    ents[k * ENT_STRIDE + E_SPECIES] = sp;
    ents[k * ENT_STRIDE + E_X] = x0 + x;
    ents[k * ENT_STRIDE + E_Y] = y0 + y;
    ents[k * ENT_STRIDE + E_HEADING] = h;
  });
  return {
    input: {
      tick: entry.tick,
      count: rows.length,
      ents,
      ids,
      deposits: new Uint8Array(0),
      objects: [],
      substrate,
      structure,
      shade,
      speciesIds: species.ids,
      speciesAssets: species.assets,
      speciesNames: species.names,
      nicknames: [],
    },
    options: {
      question: null,
      identity: null,
      title: null,
      timeLabel: null,
      legend: false,
      hideLabels: true,
      crop: { x0, y0, cells: GALLERY_CROP_CELLS, cellPx: GALLERY_CELL_PX, bare: true },
    },
  };
}

/** Save an entry (notebook state only). Resolves the refusal, or null when it was kept. */
export async function saveSpecimen(client: GalleryClient, dishId: string, entry: GalleryEntryInput): Promise<{ readonly record: NotebookRecord | null; readonly refused: string | null }> {
  try {
    const r = await client.galleryAdd(dishId, entry);
    return { record: r.record, refused: r.refused ?? null };
  } catch (e) {
    return { record: null, refused: (e as Error).message };
  }
}

/** Delete an entry (notebook state only). */
export async function deleteSpecimen(client: GalleryClient, dishId: string, id: string): Promise<{ readonly record: NotebookRecord | null; readonly refused: string | null }> {
  try {
    const r = await client.galleryDelete(dishId, id);
    return { record: r.record, refused: r.refused ?? null };
  } catch (e) {
    return { record: null, refused: (e as Error).message };
  }
}
