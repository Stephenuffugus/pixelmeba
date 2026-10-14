/**
 * Previews equal the commands (UX §4.2 "Brush footprint ... preview before release; crossed brush on
 * invalid terrain"; D-0106 "a refusal preview before commit"; wave 11 structure-render-worker). PURE, no
 * Pixi: a model built from the latest GeometryMsg (substrate, structure, edges, devices) and snapshot
 * (organism cells, food-object cells), and per-cell or per-edge outcomes computed with the SAME functions
 * the simulation's commands use (grid.ts brushCellOutcome / lifeCellOutcome, structurePreview.ts
 * edgePlacementOutcome / devicePlacementOutcome / labCellConflict / channelSides / wetCellOutcome). The
 * renderer only draws what these return; the command's own result stays authoritative.
 *
 * Without edges or devices in the geometry every outcome is exactly today's (the Lab brush rule alone).
 */
import { CELL_COUNT, GRID_W } from '@sim/constants';
import { edgeKey, type EdgeCodeArrays, type EdgeDir, type EdgeKind } from '@sim/barriers';
import { DEVICE_KINDS, type DeviceKind } from '@sim/devices';
import { brushCellOutcome, lifeCellOutcome, ST_NONE, ST_STONE, SUB_WATER, type BrushCellOutcome, type LabBrushRule, type LifeBrush } from '@sim/grid';
import {
  channelSides,
  deviceMoveOutcome,
  devicePlacementOutcome,
  edgePlacementOutcome,
  labCellConflict,
  wetCellOutcome,
  type DeviceMoveOutcome,
  type DevicePlacementOutcome,
  type EdgePlacementOutcome,
  type LabConflict,
  type WetCellOutcome,
} from '@sim/structurePreview';
import type { GeometryDevice, GeometryEdge, GeometryMsg, SnapshotMsg } from '@worker/protocol';
import { E_X, E_Y, ENT_STRIDE } from '@worker/protocol';
import { EDGE_CODE_MASK } from './structureLayer';

/** What a model reads from the latest geometry. */
export type PreviewGeometry = Pick<GeometryMsg, 'substrate' | 'structure' | 'edges' | 'devices'>;
/** What a model reads from the latest snapshot. */
export type PreviewSnapshot = Pick<SnapshotMsg, 'count' | 'ents' | 'objects'>;

export interface StructurePreviewModel {
  readonly substrate: Uint8Array | null;
  readonly structure: Uint8Array | null;
  /** Barrier codes without EDGE_FLOW_BACK (structurePreview.ts reads plain barriers.ts codes), or null for none. */
  readonly codes: EdgeCodeArrays | null;
  /** Per cell: 0 none, else DEVICE_KINDS index + 1 (edgePassage.ts deviceKindsOf), or null for none. */
  readonly kinds: Uint8Array | null;
  /** Side cells of an S04 (structurePreview.ts channelSides), or null. */
  readonly sides: Uint8Array | null;
  readonly edgeList: readonly GeometryEdge[];
  readonly devices: readonly GeometryDevice[];
  /** Cells holding a live organism (the Lab 'place' rule) and a food object. */
  readonly occupied: Uint8Array;
  readonly objectCells: Uint8Array | null;
}

/** Build a model from the latest geometry (null before any arrived) and snapshot (null before any). */
export function previewModel(geo: PreviewGeometry | null, snap: PreviewSnapshot | null): StructurePreviewModel {
  let codes: EdgeCodeArrays | null = null;
  const e = geo?.edges;
  if (e) {
    const r = new Uint8Array(CELL_COUNT);
    const d = new Uint8Array(CELL_COUNT);
    for (let i = 0; i < CELL_COUNT; i++) {
      r[i] = e.r[i]! & EDGE_CODE_MASK;
      d[i] = e.d[i]! & EDGE_CODE_MASK;
    }
    codes = { r, d };
  }
  const devices = geo?.devices ?? [];
  let kinds: Uint8Array | null = null;
  if (devices.length > 0) {
    kinds = new Uint8Array(CELL_COUNT);
    for (const dv of devices) kinds[dv.cell] = DEVICE_KINDS.indexOf(dv.kind) + 1;
  }
  const occupied = new Uint8Array(CELL_COUNT);
  let objectCells: Uint8Array | null = null;
  if (snap) {
    for (let k = 0; k < snap.count; k++) {
      const cell = Math.floor(snap.ents[k * ENT_STRIDE + E_Y]!) * GRID_W + Math.floor(snap.ents[k * ENT_STRIDE + E_X]!);
      if (cell >= 0 && cell < CELL_COUNT) occupied[cell] = 1;
    }
    if (snap.objects && snap.objects.length > 0) {
      objectCells = new Uint8Array(CELL_COUNT);
      for (const ob of snap.objects) {
        const cell = Math.floor(ob.y) * GRID_W + Math.floor(ob.x);
        if (cell >= 0 && cell < CELL_COUNT) objectCells[cell] = 1;
      }
    }
  }
  return {
    substrate: geo?.substrate ?? null,
    structure: geo?.structure ?? null,
    codes,
    kinds,
    sides: channelSides(codes),
    edgeList: e?.list ?? [],
    devices,
    occupied,
    objectCells,
  };
}

/** A Lab cell outcome: the brush rule's, or the Phase 5 structure conflict (a device cell, an S04 side). */
export type LabPreviewOutcome = Exclude<BrushCellOutcome, 'habitat'> | Exclude<LabConflict, null>;

/**
 * One covered cell under a Lab brush rule, exactly as structures.ts applyHabitatEdit decides it:
 * brushCellOutcome first, then (only for an 'ok' cell) labCellConflict with the painted substrate code
 * (`paintSubstrate`, SUB_* or null for every other rule). Sealing a region with no open neighbour
 * ('enclosed') is the command's whole-region rule and is not previewed per cell.
 */
export function labCellPreview(m: StructurePreviewModel, rule: LabBrushRule, cell: number, paintSubstrate: number | null = null): LabPreviewOutcome {
  const st = m.structure ? m.structure[cell]! : ST_NONE;
  const o = brushCellOutcome(rule, st, rule === 'place' && m.occupied[cell] === 1, (rule === 'place' || rule === 'object') && m.objectCells !== null && m.objectCells[cell] === 1);
  if (o !== 'ok') return o;
  if (rule !== 'place' && rule !== 'substrate') return o;
  if (m.kinds === null && m.sides === null) return o;
  return labCellConflict(rule, paintSubstrate, m.kinds !== null && m.kinds[cell] !== 0, m.sides !== null && m.sides[cell] === 1) ?? 'ok';
}

/** Whether an open cell is four-adjacent to stone in the model's geometry (grid.ts isStoneEdge). */
export function stoneEdgeAt(m: StructurePreviewModel, cell: number): boolean {
  const st = m.structure;
  if (!st || st[cell] !== ST_NONE) return false;
  const x = cell % GRID_W;
  return (
    (x + 1 < GRID_W && st[cell + 1] === ST_STONE) ||
    (x > 0 && st[cell - 1] === ST_STONE) ||
    (cell + GRID_W < CELL_COUNT && st[cell + GRID_W] === ST_STONE) ||
    (cell >= GRID_W && st[cell - GRID_W] === ST_STONE)
  );
}

const KIND_S05 = DEVICE_KINDS.indexOf('S05') + 1;
const KIND_S06 = DEVICE_KINDS.indexOf('S06') + 1;

/**
 * One covered cell under the Life brush: lifeCellOutcome with the cell's Phase 5 extras (an S06 mesh is an
 * attachment surface, an S05 shelter refuses a species whose `life.shelterBlocked` is true), exactly the
 * inoculate command's canOccupy. A geometry without devices gives today's result (extras omitted).
 */
export function lifeCellPreview(m: StructurePreviewModel, life: LifeBrush, cell: number): BrushCellOutcome {
  const st = m.structure ? m.structure[cell]! : ST_NONE;
  const sub = m.substrate ? m.substrate[cell]! : SUB_WATER;
  const k = m.kinds === null ? 0 : m.kinds[cell]!;
  if (k === 0) return lifeCellOutcome(st, sub, life, stoneEdgeAt(m, cell));
  return lifeCellOutcome(st, sub, life, stoneEdgeAt(m, cell), { mesh: k === KIND_S06, shelter: k === KIND_S05 });
}

/** One edge of a placeEdges stroke as previewed. */
export interface EdgePreviewItem {
  readonly cell: number;
  readonly dir: EdgeDir;
  readonly outcome: EdgePlacementOutcome;
}

/** A stroke's edge preview: each distinct edge in edgeKey order with its outcome, and the counts by reason. */
export interface EdgePreview {
  readonly items: readonly EdgePreviewItem[];
  readonly ok: number;
  readonly refused: number;
  readonly reasons: Readonly<Partial<Record<Exclude<EdgePlacementOutcome, 'ok'>, number>>>;
}

/**
 * The placeEdges preview: the stroke's edges in edgeKey order (a repeated edge previewed once: the command
 * refuses a stroke that repeats one, so the caller sends each edge once), each through edgePlacementOutcome
 * against the model's store with the running cap (store size + edges of this stroke accepted before it).
 */
export function edgeStrokePreview(m: StructurePreviewModel, kind: EdgeKind, edges: ReadonlyArray<readonly [number, EdgeDir]>): EdgePreview {
  const order = [...edges].sort((a, b) => edgeKey(a[0], a[1]) - edgeKey(b[0], b[1]));
  const grid = { substrate: m.substrate ?? new Uint8Array(CELL_COUNT), structure: m.structure ?? new Uint8Array(CELL_COUNT) };
  const items: EdgePreviewItem[] = [];
  const reasons: Partial<Record<Exclude<EdgePlacementOutcome, 'ok'>, number>> = {};
  let ok = 0;
  let last = -1;
  for (const [cell, dir] of order) {
    const key = edgeKey(cell, dir);
    if (key === last) continue;
    last = key;
    const outcome = edgePlacementOutcome(kind, cell, dir, grid, m.codes, m.edgeList.length + ok);
    items.push({ cell, dir, outcome });
    if (outcome === 'ok') ok++;
    else reasons[outcome] = (reasons[outcome] ?? 0) + 1;
  }
  return { items, ok, refused: items.length - ok, reasons };
}

/**
 * placeDevice per cell (one device per command): devicePlacementOutcome against the model's store, with the
 * running cap over the cells in the order given (each accepted cell counts as placed before the next).
 */
export function devicePreview(m: StructurePreviewModel, cells: readonly number[]): { cell: number; outcome: DevicePlacementOutcome }[] {
  const structure = m.structure ?? new Uint8Array(CELL_COUNT);
  let placed = 0;
  return cells.map((cell) => {
    const outcome = devicePlacementOutcome(cell, structure, m.kinds, m.devices.length + placed);
    if (outcome === 'ok') placed++;
    return { cell, outcome };
  });
}

/**
 * moveDevice from `from` to `cell` (D-0120: the Move preview has its own rule, not placement's):
 * deviceMoveOutcome against the model's store, so the device cap never applies, and a basket (S07) carrying a
 * food object is refused 'object' onto a cell that holds another object, as the command decides.
 */
export function deviceMovePreview(m: StructurePreviewModel, from: number, cell: number, kind: DeviceKind): DeviceMoveOutcome {
  const structure = m.structure ?? new Uint8Array(CELL_COUNT);
  const clash = kind === 'S07' && m.objectCells !== null && m.objectCells[from] === 1 && m.objectCells[cell] === 1;
  return deviceMoveOutcome(cell, structure, m.kinds, clash);
}

/** The wetting brush per cell (structurePreview.ts wetCellOutcome: wetBrush accepts the 'ok' cells, rejects the rest). */
export function wetPreview(m: StructurePreviewModel, cells: readonly number[]): { cell: number; outcome: WetCellOutcome }[] {
  return cells.map((cell) => ({ cell, outcome: wetCellOutcome(m.substrate ? m.substrate[cell]! : SUB_WATER, m.structure ? m.structure[cell]! : ST_NONE) }));
}

/** The structures a removeStructures command names: its edges and devices, and how many ids name nothing ('missing'). */
export function removePreview(m: StructurePreviewModel, ids: readonly number[]): { edges: GeometryEdge[]; devices: GeometryDevice[]; missing: number } {
  const want = new Set(ids);
  const edges = m.edgeList.filter((e) => want.has(e.id));
  const devices = m.devices.filter((d) => want.has(d.id));
  return { edges, devices, missing: want.size - edges.length - devices.length };
}
