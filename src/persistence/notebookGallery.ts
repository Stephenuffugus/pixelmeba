/**
 * The specimen gallery, the notebook kind 'gallery' (P4.8 part b; SPEC §12.8 "specimen gallery (image +
 * species + inspector summary; never spawns)"; CT §12.10 "gallery 100"; D02 §20 "Specimen gallery … do not
 * spawn organisms or alter inventory"; D-0070 "Notebook state is not world state").
 *
 * - An entry is a picture, the species, the organism's birth id and the inspector's first lines as they
 *   were shown when it was saved. It holds no genome, no organism data and no command: nothing here (or in
 *   the gallery's UI) can add anything to a dish.
 * - The picture is a CROP, not pixels (PROPOSED DECISION): a 16 × 16-cell square of the dish as published
 *   in one snapshot: one byte per cell for the ground (substrate, structure, shade) and at most 200 sprite
 *   rows [species index, x, y, heading]. It is re-drawn with src/render/picture.ts composePicture's crop
 *   option at an integer scale. 100 full entries stay well under NOTEBOOK_MAX_BYTES (tests measure it).
 * - At most 100 per dish (GALLERY_MAX); the 101st is refused, never a silent removal.
 * - Never in the world state, its checksum or its stateHash; nothing in src/sim imports this file. Entries
 *   survive Undo and a rollback like journal notes, so their ticks and birth ids are not checked against
 *   the dish's time (only their species, which a dish never loses).
 */
import { GRID_W } from '@sim/constants';
import type { NotebookWorldRefs } from './notebook';

/** CT §12.10 "gallery 100": entries kept per dish. */
export const GALLERY_MAX = 100;
/** The inspector lines kept (its depth-1 summary: name, chips, the constraint line). */
export const GALLERY_SUMMARY_LINES = 4;
export const GALLERY_LINE_MAX = 120;
/** The crop is a square of this many cells. */
export const GALLERY_CROP_CELLS = 16;
/** Sprite rows a crop keeps at most. */
export const GALLERY_SPRITES_MAX = 200;
/** One byte per crop cell, base64 (256 bytes → 344 characters). */
export const GALLERY_GROUND_BYTES = GALLERY_CROP_CELLS * GALLERY_CROP_CELLS;
const GROUND_B64_LENGTH = Math.ceil(GALLERY_GROUND_BYTES / 3) * 4;

/** A sprite row: [species index in the dish's species table, x, y (cells within the crop, 0.1 steps), heading 0–3]. */
export type GallerySprite = readonly [number, number, number, number];

export interface GalleryCrop {
  /** The crop's top-left cell (whole cells, 0 … 112). */
  readonly x0: number;
  readonly y0: number;
  readonly cells: typeof GALLERY_CROP_CELLS;
  readonly sprites: readonly GallerySprite[];
  /**
   * Base64 of one byte per cell, row by row: bits 0–1 the substrate, bits 2–4 the structure (4: outside the
   * dish), bit 5 shaded.
   */
  readonly substrate: string;
}

export interface GalleryEntry {
  /** 'gal-<n>': one more than the highest held when it was saved. */
  readonly id: string;
  /** The dish tick of the snapshot the picture was taken from. */
  readonly tick: number;
  readonly speciesId: string;
  readonly birthId: number;
  /** The inspector's depth-1 lines as shown when saved (≤ 4 lines of ≤ 120 characters). */
  readonly summary: readonly string[];
  readonly crop: GalleryCrop;
}

const isInt = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const ENTRY_KEYS = ['id', 'tick', 'speciesId', 'birthId', 'summary', 'crop'];
const CROP_KEYS = ['x0', 'y0', 'cells', 'sprites', 'substrate'];
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
/** Species ids as content ids are written (src/persistence/notebook.ts uses the same pattern for favorites). */
const SPECIES_ID = /^[A-Z][A-Z0-9_]{0,31}$/;

/** One summary line as a record keeps it: control characters become spaces, trimmed, at most 120 characters. */
export function cleanGalleryLine(text: unknown): string {
  if (typeof text !== 'string') return '';
  const s = Array.from(text)
    .map((ch) => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch))
    .join('')
    .trim();
  return Array.from(s).slice(0, GALLERY_LINE_MAX).join('').trim();
}

/** A crop coordinate kept in 0.1-cell steps (the record stays small and exact). */
export function cropCoord(v: number): number {
  return Math.round(v * 10) / 10;
}

/** The first problem with one sprite row, or null. */
function spriteProblem(raw: unknown): string | null {
  if (!Array.isArray(raw) || raw.length !== 4) return 'a gallery picture has an invalid organism';
  const [sp, x, y, h] = raw as unknown[];
  if (!isInt(sp, 0, 255)) return 'a gallery picture has an invalid organism';
  for (const v of [x, y])
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v >= GALLERY_CROP_CELLS || cropCoord(v) !== v) return 'a gallery picture has an organism outside it';
  if (!isInt(h, 0, 3)) return 'a gallery picture has an invalid heading';
  return null;
}

/** The first problem with one gallery entry (its own fields only), or null. */
export function galleryEntryProblem(raw: unknown): string | null {
  if (!isObj(raw)) return 'a gallery entry is not an object';
  for (const k of Object.keys(raw)) if (!ENTRY_KEYS.includes(k)) return `a gallery entry has an unknown field "${k.slice(0, 40)}"`;
  if (typeof raw.id !== 'string' || !/^gal-[1-9][0-9]{0,8}$/.test(raw.id)) return 'a gallery entry has an invalid id';
  if (!isInt(raw.tick, 0)) return 'a gallery entry has an invalid time';
  if (typeof raw.speciesId !== 'string' || !SPECIES_ID.test(raw.speciesId)) return 'a gallery entry has an invalid species';
  if (!isInt(raw.birthId, 1)) return 'a gallery entry has an invalid organism';
  if (!Array.isArray(raw.summary) || raw.summary.length > GALLERY_SUMMARY_LINES) return 'a gallery entry has an invalid summary';
  for (const line of raw.summary as unknown[]) if (typeof line !== 'string' || line.length === 0 || cleanGalleryLine(line) !== line) return 'a gallery entry has an invalid summary line';
  const c = raw.crop;
  if (!isObj(c) || Object.keys(c).some((k) => !CROP_KEYS.includes(k))) return 'a gallery entry has an invalid picture';
  if (c.cells !== GALLERY_CROP_CELLS) return 'a gallery picture has an invalid size';
  if (!isInt(c.x0, 0, GRID_W - GALLERY_CROP_CELLS) || !isInt(c.y0, 0, GRID_W - GALLERY_CROP_CELLS)) return 'a gallery picture is outside the dish';
  if (!Array.isArray(c.sprites) || c.sprites.length > GALLERY_SPRITES_MAX) return `a gallery picture has more than ${GALLERY_SPRITES_MAX} organisms`;
  for (const s of c.sprites as unknown[]) {
    const p = spriteProblem(s);
    if (p) return p;
  }
  if (typeof c.substrate !== 'string' || c.substrate.length !== GROUND_B64_LENGTH || !BASE64.test(c.substrate)) return 'a gallery picture has an invalid ground';
  return null;
}

/** The first problem with the gallery kind, or null (notebook.ts KIND_PROBLEMS). */
export function galleryProblem(raw: unknown): string | null {
  if (!Array.isArray(raw)) return 'gallery is not a list';
  if (raw.length > GALLERY_MAX) return `more than ${GALLERY_MAX} gallery entries`;
  const ids: string[] = [];
  for (const e of raw as unknown[]) {
    const p = galleryEntryProblem(e);
    if (p) return p;
    const id = (e as GalleryEntry).id;
    if (ids.includes(id)) return 'two gallery entries share an id';
    ids.push(id);
  }
  return null;
}

/** The first gallery entry naming a species the dish does not have, or null (checked against the file's dish). */
export function galleryWorldProblem(raw: Record<string, unknown>, refs: NotebookWorldRefs): string | null {
  const list = (raw.gallery ?? []) as readonly GalleryEntry[];
  for (const e of list) {
    if (!refs.speciesIds.includes(e.speciesId)) return 'a gallery entry names a species this dish does not have';
    if (e.crop.sprites.some(([sp]) => sp >= refs.speciesIds.length)) return 'a gallery picture names a species this dish does not have';
  }
  return null;
}

/** The gallery of a record (a record written before it reads as none). */
export function galleryOf(record: { readonly gallery?: readonly GalleryEntry[] }): readonly GalleryEntry[] {
  return record.gallery ?? [];
}

/** The id the next entry of `list` takes ('gal-<highest + 1>'). */
export function nextGalleryId(list: readonly GalleryEntry[]): string {
  let n = 0;
  for (const e of list) n = Math.max(n, Number(e.id.slice(4)) || 0);
  return `gal-${n + 1}`;
}

/** Ground byte of one crop cell (see GalleryCrop.substrate). */
export function groundByte(substrate: number, structure: number, shaded: boolean): number {
  return (substrate & 3) | ((structure & 7) << 2) | (shaded ? 32 : 0);
}

/** The ground of a crop, decoded: substrate, structure and shade per crop cell (null when malformed). */
export function decodeGround(b64: string): { substrate: Uint8Array; structure: Uint8Array; shaded: Uint8Array } | null {
  try {
    const bin = atob(b64);
    if (bin.length !== GALLERY_GROUND_BYTES) return null;
    const substrate = new Uint8Array(GALLERY_GROUND_BYTES);
    const structure = new Uint8Array(GALLERY_GROUND_BYTES);
    const shaded = new Uint8Array(GALLERY_GROUND_BYTES);
    for (let i = 0; i < GALLERY_GROUND_BYTES; i++) {
      const b = bin.charCodeAt(i);
      substrate[i] = b & 3;
      structure[i] = (b >> 2) & 7;
      shaded[i] = (b >> 5) & 1;
    }
    return { substrate, structure, shaded };
  } catch {
    return null;
  }
}

/** Base64 of ground bytes. */
export function encodeGround(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Readable refusals (nothing was added or changed). */
export const GALLERY_TEXT = {
  full: `This dish keeps ${GALLERY_MAX} gallery specimens. Delete one to add another.`,
  arm: 'Comparison copies keep no gallery.',
  unknown: 'That specimen is not in this dish’s gallery.',
  bad: (problem: string) => `That specimen could not be saved (${problem}). Nothing was added.`,
} as const;
