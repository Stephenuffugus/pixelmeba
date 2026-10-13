/**
 * Attachment surfaces (SPEC §2.2; CT §1.3; D-0006; P3.2).
 *
 * A species whose record has `attachment !== null` may live only in a cell that offers one of its
 * listed surfaces: gel cells, sediment cells, passable cells four-adjacent to stone ("stone edge",
 * grid.ts isStoneEdge), porous bead cells, and cells holding an S06 attachment mesh (Phase 5 wave 9;
 * CT §4 "attachment for B02, B13, fungi, P06; no protection": the mesh adds the surface and nothing
 * else). Free-living species (attachment null) are not affected at all.
 *
 * The per-cell surface mask is derived state of ONE world: it lives on that world's transport cache
 * (world.derived.transport, never saved, never hashed) and is rebuilt when that world's
 * grid.geometryVersion moves, or when world.devices is not the store (identity and length) its S06 mesh
 * bits were built from (a store replaced or emptied without a bump). It is never kept in a module-level
 * cache keyed by geometryVersion alone:
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
/** Attachment mesh (S06, Phase 5): offered by every cell holding an S06 (world.devices; attachmentMask). */
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
 * Wave 9: SURF_MESH on every cell holding an S06. Every writer of world.devices bumps geometryVersion
 * (wave 10's contract); the store's identity and length are also checked, so a store replaced
 * (realizeRecipe assigns new arrays) or emptied without a bump still rebuilds the mask.
 * With no devices the mask is cellSurfaces' alone, byte for byte as before.
 */
export function attachmentMask(world: World): Uint8Array {
  const tc = transportCacheObject(world);
  const g = world.grid;
  const devices = world.devices;
  const from = devices.length === 0 ? null : devices;
  if (tc.attachVersion === g.geometryVersion && tc.attachMeshFrom === from && tc.attachMeshLen === devices.length) return tc.attach;
  const mask = tc.attach;
  mask.fill(0);
  const cells = maskCells();
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    mask[i] = cellSurfaces(g, i);
  }
  for (let k = 0; k < devices.length; k++) {
    const d = devices[k]!;
    if (d.kind === 'S06') mask[d.cell] = mask[d.cell]! | SURF_MESH;
  }
  tc.attachMeshFrom = from;
  tc.attachMeshLen = devices.length;
  tc.attachVersion = g.geometryVersion;
  return mask;
}

/** Whether cell `cell` offers one of the surfaces in `bits` (attachmentBits of a species record). */
export function onAttachmentSurface(world: World, bits: number, cell: number): boolean {
  return (attachmentMask(world)[cell]! & bits) !== 0;
}
