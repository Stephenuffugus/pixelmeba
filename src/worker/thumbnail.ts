/**
 * Live dish thumbnails (P4.3; UX §2 "Continue (last dish, live thumbnail)", §2.2 "Square live-state
 * thumbnails"). A thumbnail is a pure read of the living organisms' positions: a 32 × 32 grid over the
 * 128 × 128 dish, each block holding the species with the most living organisms in it (the lowest
 * species index on a tie), or nothing. It never touches the world, consumes no randomness and is never
 * part of a world, its state hash or a save checksum: Saved dishes, Continue and the Play shelf show it
 * from the slot index or a preview, and the open dish draws it from its latest snapshot.
 *
 * The string is self-describing, because a species index means something only within one world (an old
 * save records fewer species than this build): `pt1:<species ids in the world's index order>:<base64>`,
 * the base64 holding THUMB_SIZE² bytes, row-major from the top-left block, each 0 = empty, else 1 + the
 * species index. The same world (the same entity columns) always gives the same string, so a slot index
 * that copies it still compares equal for an unchanged dish (src/persistence/store.ts holdsSave).
 *
 * Block of an organism: floor(fround(x) / 4), with the position rounded to 32-bit float first, exactly as
 * a snapshot carries it (SnapshotMsg.ents is a Float32Array), so the snapshot and the world agree on
 * every organism, including one a hair below a block edge.
 */
import { base64ToBytes, typedToBase64 } from '@sim/hash';
import type { WorldState } from '@sim/serialize';
import type { World } from '@sim/world';
import { E_SPECIES, E_X, E_Y, ENT_STRIDE, type SnapshotMsg } from './protocol';

/** Blocks per side. */
export const THUMB_SIZE = 32;
/** Dish cells per block side (GRID_W 128 / THUMB_SIZE). */
const CELLS_PER_BLOCK = 4;
const PREFIX = 'pt1';
/** At most 255 species can be told apart in one byte (1 + index); worlds hold far fewer. */
const MAX_SPECIES = 255;

/** A parsed thumbnail: the world's species ids by index and the block grid (THUMB_SIZE² bytes). */
export interface ThumbGrid {
  readonly speciesIds: readonly string[];
  readonly grid: Uint8Array;
}

function blockOf(v: number): number {
  const b = Math.floor(Math.fround(v) / CELLS_PER_BLOCK);
  return b < 0 ? 0 : b >= THUMB_SIZE ? THUMB_SIZE - 1 : b;
}

/**
 * The core: `n` organisms read through `at(k)` → [species index, x, y]. Counts per block and species in
 * one flat array (no Map/Set/object-key iteration), then picks each block's majority, lowest index first.
 */
function buildThumb(speciesIds: readonly string[], n: number, at: (k: number, out: number[]) => void): string {
  const sp = Math.min(speciesIds.length, MAX_SPECIES);
  const blocks = THUMB_SIZE * THUMB_SIZE;
  const counts = new Uint16Array(blocks * Math.max(1, sp));
  const rec = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    at(k, rec);
    const s = rec[0]!;
    if (!(s >= 0 && s < sp)) continue;
    const b = blockOf(rec[2]!) * THUMB_SIZE + blockOf(rec[1]!);
    const i = b * sp + s;
    if (counts[i]! < 0xffff) counts[i] = counts[i]! + 1;
  }
  const grid = new Uint8Array(blocks);
  for (let b = 0; b < blocks; b++) {
    let best = 0;
    let bestCount = 0;
    for (let s = 0; s < sp; s++) {
      const c = counts[b * sp + s]!;
      if (c > bestCount) {
        bestCount = c;
        best = s + 1; // strictly greater: the lowest index wins a tie
      }
    }
    grid[b] = best;
  }
  return `${PREFIX}:${speciesIds.slice(0, sp).join(',')}:${typedToBase64(grid)}`;
}

/** The thumbnail of a world, read from its entity columns (read-only). */
export function dishThumb(world: World): string {
  const c = world.ents.cols;
  const live: number[] = [];
  for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1) live.push(i);
  return buildThumb(
    world.species.map((s) => s.id),
    live.length,
    (k, out) => {
      const i = live[k]!;
      out[0] = c.species[i]!;
      out[1] = c.x[i]!;
      out[2] = c.y[i]!;
    },
  );
}

/**
 * The thumbnail of a serialized world (a save file's `state`): the same bytes dishThumb gives for the
 * world it was serialized from. Used for the slot index, so the picture is exactly the saved moment even
 * when the dish kept running while the file was being checksummed.
 */
export function thumbFromState(state: WorldState): string {
  const cols = state.entities.columns;
  const hw = state.entities.highWater;
  const alive = base64ToBytes(cols.alive!.b64);
  const species = new Uint16Array(hw);
  const x = new Float64Array(hw);
  const y = new Float64Array(hw);
  copyBytes(cols.species!.b64, species);
  copyBytes(cols.x!.b64, x);
  copyBytes(cols.y!.b64, y);
  const live: number[] = [];
  for (let i = 0; i < hw; i++) if (alive[i] === 1) live.push(i);
  return buildThumb(
    state.content.species.map((s) => s.id),
    live.length,
    (k, out) => {
      const i = live[k]!;
      out[0] = species[i]!;
      out[1] = x[i]!;
      out[2] = y[i]!;
    },
  );
}

function copyBytes(b64: string, target: Uint16Array | Float64Array): void {
  const bytes = base64ToBytes(b64);
  new Uint8Array(target.buffer, target.byteOffset, Math.min(bytes.length, target.byteLength)).set(bytes.subarray(0, target.byteLength));
}

/** The thumbnail of a published snapshot (the open dish's latest picture), given that dish's species ids. */
export function thumbFromSnapshot(snap: Pick<SnapshotMsg, 'ents' | 'count'>, speciesIds: readonly string[]): string {
  const e = snap.ents;
  const n = Math.min(snap.count, Math.floor(e.length / ENT_STRIDE));
  return buildThumb(speciesIds, n, (k, out) => {
    const o = k * ENT_STRIDE;
    out[0] = e[o + E_SPECIES]!;
    out[1] = e[o + E_X]!;
    out[2] = e[o + E_Y]!;
  });
}

const ID_RE = /^[A-Z0-9_]{1,24}$/;

/** Parse and validate a thumbnail string (stored data: a slot index copy is checked before use). Null when malformed. */
export function parseThumb(thumb: unknown): ThumbGrid | null {
  if (typeof thumb !== 'string' || thumb.length > 8192) return null;
  const parts = thumb.split(':');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const speciesIds = parts[1] === '' ? [] : parts[1]!.split(',');
  if (speciesIds.length > MAX_SPECIES || !speciesIds.every((id) => ID_RE.test(id))) return null;
  let grid: Uint8Array;
  try {
    grid = base64ToBytes(parts[2]!);
  } catch {
    return null;
  }
  if (grid.length !== THUMB_SIZE * THUMB_SIZE) return null;
  for (let i = 0; i < grid.length; i++) if (grid[i]! > speciesIds.length) return null;
  return { speciesIds, grid };
}
