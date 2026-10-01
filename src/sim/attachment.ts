/**
 * Attachment surfaces (SPEC §2.2; CT §1.3; D-0006; P3.2).
 *
 * A species whose record has `attachment !== null` may live only in a cell that offers one of its
 * listed surfaces: gel cells, sediment cells, passable cells four-adjacent to stone ("stone edge",
 * grid.ts isStoneEdge), porous bead cells; attachment mesh arrives with its structure in Phase 5, so
 * no cell offers it yet. Free-living species (attachment null) are not affected at all.
 *
 * The per-cell surface mask is derived state of ONE world: it lives on that world's transport cache
 * (world.derived.transport, never saved, never hashed) and is rebuilt when that world's
 * grid.geometryVersion moves. It is never kept in a module-level cache keyed by geometryVersion alone:
 * every freshly realized world starts at geometryVersion 1 and one worker holds several worlds.
 *
 * Gate: the rule concerns only organisms whose species record lists attachment surfaces, so a world
 * that records none of them (every g2 world) never reaches it (src/sim/suitability.ts habitatCompatible).
 */
import type { Species } from './content/schema';
import { isStoneEdge, maskCells, SUB_GEL, SUB_SEDIMENT, ST_BEAD, ST_NONE, type Grid } from './grid';
import { transportCacheObject } from './transport';
import type { World } from './world';

export const SURF_GEL = 1;
export const SURF_SEDIMENT = 2;
export const SURF_STONE_EDGE = 4;
export const SURF_BEAD = 8;
/** Attachment mesh (S06, Phase 5): no cell offers it yet. */
export const SURF_MESH = 16;

export type SurfaceName = 'gel' | 'sediment' | 'stoneEdge' | 'bead' | 'mesh';

const SURFACE_BIT: Readonly<Record<SurfaceName, number>> = {
  gel: SURF_GEL,
  sediment: SURF_SEDIMENT,
  stoneEdge: SURF_STONE_EDGE,
  bead: SURF_BEAD,
  mesh: SURF_MESH,
};

/** The SURF_* bits of a surface list (unknown names add nothing). */
export function surfaceBitsOf(surfaces: readonly string[]): number {
  let bits = 0;
  for (let k = 0; k < surfaces.length; k++) bits |= SURFACE_BIT[surfaces[k] as SurfaceName] ?? 0;
  return bits;
}

// The bits of a species record's attachment, computed once per record.
// eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated
const bitsByRecord = new WeakMap<object, number>();

/** The SURF_* bits a species record attaches to, or -1 for a free-living species (attachment null). */
export function attachmentBits(def: Pick<Species, 'attachment'>): number {
  const at = def.attachment;
  if (at === null) return -1;
  let bits = bitsByRecord.get(at);
  if (bits === undefined) {
    bits = surfaceBitsOf(at.surfaces);
    bitsByRecord.set(at, bits);
  }
  return bits;
}

/** The surfaces one cell of a grid offers (SURF_* bits). Pure: reads the grid. */
export function cellSurfaces(g: Grid, i: number): number {
  const st = g.structure[i]!;
  if (st === ST_BEAD) return SURF_BEAD;
  if (st !== ST_NONE) return 0;
  const sub = g.substrate[i]!;
  let bits = sub === SUB_GEL ? SURF_GEL : sub === SUB_SEDIMENT ? SURF_SEDIMENT : 0;
  if (isStoneEdge(g, i)) bits |= SURF_STONE_EDGE;
  return bits;
}

/**
 * This world's attachable-surface mask (SURF_* bits per cell; 0 outside the dish), rebuilt when its
 * geometry changed since the mask was built. Derived; the returned array is owned by the cache.
 */
export function attachmentMask(world: World): Uint8Array {
  const tc = transportCacheObject(world);
  const g = world.grid;
  if (tc.attachVersion === g.geometryVersion) return tc.attach;
  const mask = tc.attach;
  mask.fill(0);
  const cells = maskCells();
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    mask[i] = cellSurfaces(g, i);
  }
  tc.attachVersion = g.geometryVersion;
  return mask;
}

/** Whether cell `cell` offers one of the surfaces in `bits` (attachmentBits of a species record). */
export function onAttachmentSurface(world: World, bits: number, cell: number): boolean {
  return (attachmentMask(world)[cell]! & bits) !== 0;
}
