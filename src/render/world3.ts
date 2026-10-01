/**
 * Phase 3 drawing rules for the renderer (UX §6.2, §6.5, §7.2–7.4; SPEC §7.1–7.5, §10.8; wave 2
 * art-features). Pure functions of snapshot data and display settings, so tests can prove that nothing
 * is drawn the snapshot does not report: film tiles from the film band and its four neighbours, fungal
 * segment tiles from E_LINKMASK and E_GROWTH, food objects from their fill, a parasite drawn over its
 * host, and the infection glyph only on an infected host that is inspected or while the Infection
 * markers toggle is on. src/render reads snapshot types and the atlas manifest only (ARCH §3).
 */
import { CELL_COUNT, GRID_W } from '@sim/constants';
import {
  CUE2_INFECTED,
  CUE2_PARASITIZED,
  DEPOSIT_FILM_BAND,
  E_CUE2,
  E_X,
  E_Y,
  ENT_STRIDE,
  FILM_ERODING,
  FILM_LEVEL_MASK,
  LINKMASK_DIRS,
  LINKMASK_TRANSFER,
} from '@worker/protocol';

// ------------------------------------------------------------------------------------- tiles

/** World tile ids in the atlas manifest's `tiles` table (art/src/tiles, packed by tools/art-build.ts). */
export type TileId = 'film' | 'pellet' | 'wafer' | 'stain';

/** One world tile set as the manifest lists it. */
export interface AtlasTileLike {
  readonly size: number;
  readonly frames: number;
}

/** Atlas key of one world-tile frame, the same key tools/art-build.ts writes and content:validate checks. */
export function tileFrameKey(tile: string, frame: number): string {
  return `tile/${tile}/${frame}`;
}

/** World tiles cover one cell: a 16 px tile frame is drawn at 1/16 cell per pixel (ARCH §9 world unit = one cell). */
export const TILE_PX = 16;

// -------------------------------------------------------------------------------------- film

export const FILM_ISOLATED = 0;
export const FILM_EDGE = 1;
export const FILM_CENTER = 2;
export const FILM_ERODING_TILE = 3;

/** Film level of a cell (0–127, 127 = the 0.50 C cap) from the snapshot's film deposit band. */
export function filmLevel(deposits: Uint8Array, cell: number): number {
  if (deposits.length < (DEPOSIT_FILM_BAND + 1) * CELL_COUNT) return 0;
  return deposits[DEPOSIT_FILM_BAND * CELL_COUNT + cell]! & FILM_LEVEL_MASK;
}

/** The film band a mark reads (E10 matrix edge): 0 no film, 1–3 thirds of the film cap. */
export function filmLevelBand(level: number): number {
  if (level <= 0) return 0;
  return level <= 42 ? 1 : level <= 85 ? 2 : 3;
}

/**
 * Film tile for one cell (UX §6.2 "isolated, edge, center, eroding"), or −1 when it holds no film:
 * eroding while the snapshot's eroding bit is set; otherwise by the four-neighbour film mask — no
 * neighbour with film → isolated, all four → center, some → edge.
 */
export function filmTile(deposits: Uint8Array, cell: number): number {
  if (deposits.length < (DEPOSIT_FILM_BAND + 1) * CELL_COUNT) return -1;
  const base = DEPOSIT_FILM_BAND * CELL_COUNT;
  const v = deposits[base + cell]!;
  if ((v & FILM_LEVEL_MASK) === 0) return -1;
  if (v & FILM_ERODING) return FILM_ERODING_TILE;
  const x = cell % GRID_W;
  let n = 0;
  if (cell >= GRID_W && deposits[base + cell - GRID_W]! & FILM_LEVEL_MASK) n++;
  if (cell + GRID_W < CELL_COUNT && deposits[base + cell + GRID_W]! & FILM_LEVEL_MASK) n++;
  if (x > 0 && deposits[base + cell - 1]! & FILM_LEVEL_MASK) n++;
  if (x + 1 < GRID_W && deposits[base + cell + 1]! & FILM_LEVEL_MASK) n++;
  return n === 0 ? FILM_ISOLATED : n === 4 ? FILM_CENTER : FILM_EDGE;
}

/** Film opacity by its level (SPEC §9 E10 "opacity by film carbon"): faint at a trace, near-opaque at the cap. */
export function filmAlpha(level: number): number {
  return level <= 0 ? 0 : 0.25 + 0.6 * Math.min(1, level / FILM_LEVEL_MASK);
}

// ------------------------------------------------------------------------------------- fungi

/** How one fungal segment is drawn (never through the body path). */
export interface FungalPick {
  /** `<assetId>/mask/e/<mask>`: the live link directions (N 1, E 2, S 4, W 8). */
  mask: number;
  /** Growing tip overlay: the segment has at most one link. */
  tip: boolean;
  /** Branch-bud overlay: E_GROWTH ≥ 1 (B ≥ 2 B0, ready to place a daughter segment). */
  bud: boolean;
  /** F02 transfer pulse frame (0 or 1), or −1: only while bit 4 (a transfer this second) is set. */
  pulse: number;
}

/** Period of the transfer pulse: two frames per second at most (UX §6.5 "fungal link pulse ≤ 1/s"). */
export const PULSE_FRAME_MS = 500;

/**
 * The tiles of one fungal segment from its snapshot record. In reduced motion the pulse is a static
 * dot (frame 0, UX §7.4 "link/transfer pulse → static link with dot").
 */
export function fungalPick(linkMask: number, growth: number, reduced: boolean, now: number, out: FungalPick = { mask: 0, tip: false, bud: false, pulse: -1 }): FungalPick {
  const mask = linkMask & LINKMASK_DIRS;
  let bits = 0;
  for (let m = mask; m > 0; m >>= 1) bits += m & 1;
  out.mask = mask;
  out.tip = bits <= 1;
  out.bud = growth >= 1;
  out.pulse = linkMask & LINKMASK_TRANSFER ? (reduced ? 0 : Math.floor(now / PULSE_FRAME_MS) % 2) : -1;
  return out;
}

/** What a species' atlas sprite is drawn as: an organism body, fungal segment tiles, or a virus (no body). */
export type DrawKind = 'body' | 'fungus' | 'virus';

/** From the manifest only: a sprite with `mask` tiles is a fungus, one with a `glyph` a virus (D-0046). */
export function drawKindOf(sprite: { readonly animations: Readonly<Record<string, unknown>> } | undefined): DrawKind {
  if (!sprite) return 'body';
  if ('mask' in sprite.animations) return 'fungus';
  if ('glyph' in sprite.animations) return 'virus';
  return 'body';
}

// ------------------------------------------------------------------------------ food objects

/** Fill step of a food object (0–3): its outline shrinks with what is left (UX §6.5). */
export function objectFrame(fill: number): number {
  return fill > 0.75 ? 3 : fill > 0.5 ? 2 : fill > 0.25 ? 1 : 0;
}

/** How long an emptied object's stain fades (cosmetic). */
export const STAIN_MS = 6000;

/** Stain opacity `t` ms after its 'objectEmptied' event (0 once gone). */
export function stainAlpha(t: number): number {
  return t >= STAIN_MS || t < 0 ? 0 : 0.7 * (1 - t / STAIN_MS);
}

// -------------------------------------------------------------------- parasites and infection

/**
 * Riders: the organisms the snapshot places exactly at a parasitized host's position (an attached
 * parasite follows its host, SPEC §7.4), other than the host itself. The renderer draws them after
 * every other body so a parasite shows on its host. `out[k]` = 1 for a rider; returns how many.
 */
export function riderMarks(ents: Float32Array, count: number, out: Uint8Array, scratch?: { head: Int32Array; next: Int32Array }): number {
  out.fill(0, 0, count);
  const head = scratch?.head ?? new Int32Array(CELL_COUNT);
  head.fill(-1);
  const next = scratch && scratch.next.length >= count ? scratch.next : new Int32Array(Math.max(1, count));
  let hosts = 0;
  for (let k = 0; k < count; k++) {
    const o = k * ENT_STRIDE;
    if (!(ents[o + E_CUE2]! & CUE2_PARASITIZED)) continue;
    const cell = cellOf(ents[o + E_X]!, ents[o + E_Y]!);
    if (cell < 0) continue;
    next[k] = head[cell]!;
    head[cell] = k;
    hosts++;
  }
  if (hosts === 0) return 0;
  let riders = 0;
  for (let k = 0; k < count; k++) {
    const o = k * ENT_STRIDE;
    const x = ents[o + E_X]!;
    const y = ents[o + E_Y]!;
    const cell = cellOf(x, y);
    if (cell < 0) continue;
    for (let h = head[cell]!; h >= 0; h = next[h]!) {
      if (h === k) continue;
      if (ents[h * ENT_STRIDE + E_X] === x && ents[h * ENT_STRIDE + E_Y] === y) {
        out[k] = 1;
        riders++;
        break;
      }
    }
  }
  return riders;
}

function cellOf(x: number, y: number): number {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= GRID_W || cy >= GRID_W) return -1;
  return cy * GRID_W + cx;
}

/**
 * The infection glyph shows only on an infected host (CUE2_INFECTED) that is inspected, or while the
 * Observe tray's Infection markers toggle is on (SPEC §7.5 last line, §10.8; UX §4.4, §7.2).
 */
export function infectionGlyphShown(cue2: number, selected: boolean, markersOn: boolean): boolean {
  return (cue2 & CUE2_INFECTED) !== 0 && (selected || markersOn);
}
