/**
 * Phase 5 structure and climate commands (P5.1, P5.2; SPEC §2.4, §3.2 stage 1, §4.6, §4.8, §10.1, §10.4,
 * §10.7; CT §4, §14; D-0106, D-0108, D-0111, D-0113, D-0117). Stage 1 semantics of eight command kinds,
 * dispatched from commands.ts applyCommand like the Lab habitat edits (one gesture = one command, atomic;
 * paused: applied at the current tick; Undo is the host's snapshot):
 *
 * - placeEdges {structure S01–S04, edges [[cell, 'R'|'D'], …], open (S03), flow (S04)}: each edge in
 *   edgeKey order through structurePreview.ts edgePlacementOutcome (rim, structure, barrier, channel, cap);
 *   accepted edges get ids from counters.nextDeviceId in that order.
 * - placeDevice {structure S05–S12, cell}: devicePlacementOutcome (rim, structure, device, cap); placed Off
 *   (SPEC §10.4): an S09/S10 with on false, an S08 with resinSelect [] and no bound.
 * - removeStructures {ids}: edges and devices by id (one Erase gesture); a removed resin's bound activity is
 *   exported in the result (activity is not a conserved material: no ledger line); a basket's object stays;
 *   gate tallies are kept (observation). Structures never changed the substrate, so nothing is restored.
 * - moveDevice {id, cell}: keeps id, kind and settings; a basket carries its food object (objects.ts
 *   relocateObject). Atomic on both the paused and the queued path ("paused" is the UI's offer).
 * - setDevice {id, on | open | resinSelect}: a heater's or cooler's on, a shutter's open, a resin's
 *   selection ([] = Off, bound kept). The same value: accepted 0, 'unchanged'.
 * - wetBrush {points, radius}: climate.ts wetCells over the stroke (moisture 0.9 on gel and sediment).
 * - setLightMode {mode}: climate.ts setLightMode (cycle starts now; fixed deletes cycleStartTick).
 * - setDrying {drying}: settings.drying (stage 2 allocates the moisture array, never this command).
 *
 * Availability (D-0103): a structure command needs the structure in the dish's recorded manifest and every
 * system STRUCTURE_SYSTEM_NEEDS names for it; the climate commands need the 'climate' system. Every v1.0
 * dish refuses all eight and stays byte-identical. A malformed payload is refused whole (accepted 0,
 * rejected 0, a note) and changes nothing.
 *
 * geometryVersion: every accepted command that changes world.edges or world.devices bumps
 * grid.geometryVersion exactly once and replaces the store array (never an in-place write without the
 * bump), so wave 9's edge, shelter and mesh caches (edgePassage.ts, attachment.ts) and the climate and
 * transport caches rebuild. The climate commands change no store and do not bump it.
 *
 * Severing (D-0113, D-0117): a barrier placed across a fungal or adhesion link, or a shutter closed across
 * one, cuts the link (severCrossedLinks) with a 'linkBroken' event, cause 'barrier'; it is never refused.
 *
 * No randomness is drawn anywhere here.
 */
import { CELL_COUNT, DEVICE_CAP, EDGE_BARRIER_CAP } from './constants';
import { adhesionRules } from './adhesion';
import { cellInDish, classOf, EDGE_KINDS, edgeKey, sortEdges, type EdgeBarrier, type EdgeDir, type EdgeKind } from './barriers';
import { wetCells, setLightMode } from './climate';
import { STRUCTURE_SYSTEM_NEEDS } from './content/structureRules';
import { DEVICE_KINDS, RESIN_TARGETS, sortDevices, TOGGLED_KINDS, type Device, type DeviceKind, type ResinTarget } from './devices';
import { deviceKindsOf, edgeCodesOf, pairPermitted, segmentPermitted } from './edgePassage';
import { emit } from './events';
import { worldHasStructure, worldHasSystem } from './gates';
import { NOT_IN_DISH, strokeFootprint, SUB_WATER } from './grid';
import { adhesionNeighbors, fungalLinkKind, fungalNeighbors, LINK_TRANSPORT, removeAdhesionLink, removeFungalLink } from './links';
import { objectAt, relocateObject } from './objects';
import { entityCell } from './spatial';
import { invalidLabStroke, type LabStroke } from './structures';
import { deviceMoveOutcome, devicePlacementOutcome, edgePlacementOutcome } from './structurePreview';
import type { World } from './world';

// ---- Payloads --------------------------------------------------------------------------------------

export type EdgeRef = readonly [cell: number, dir: EdgeDir];

export type StructureCommandPayload =
  | {
      readonly kind: 'placeEdges';
      readonly structure: EdgeKind;
      /** The UI's snapped stroke: 1 to EDGE_BARRIER_CAP distinct edges, each [lower cell, 'R' | 'D']. */
      readonly edges: ReadonlyArray<EdgeRef>;
      /** S03 only (required there): the initial state the player picked. */
      readonly open?: boolean;
      /** S04 only (required there). */
      readonly flow?: 1 | -1;
    }
  | { readonly kind: 'placeDevice'; readonly structure: DeviceKind; readonly cell: number }
  | { readonly kind: 'removeStructures'; readonly ids: readonly number[] }
  | { readonly kind: 'moveDevice'; readonly id: number; readonly cell: number }
  | {
      readonly kind: 'setDevice';
      readonly id: number;
      /** S09/S10. */
      readonly on?: boolean;
      /** S03. */
      readonly open?: boolean;
      /** S08: sorted, unique; [] = Off. */
      readonly resinSelect?: readonly ResinTarget[];
    }
  | { readonly kind: 'wetBrush'; readonly points: LabStroke; readonly radius: number }
  | { readonly kind: 'setLightMode'; readonly mode: 'fixed' | 'cycle' }
  | { readonly kind: 'setDrying'; readonly drying: boolean };

export type StructureCommandKind = StructureCommandPayload['kind'];
export const STRUCTURE_COMMAND_KINDS: readonly StructureCommandKind[] = [
  'placeEdges',
  'placeDevice',
  'removeStructures',
  'moveDevice',
  'setDevice',
  'wetBrush',
  'setLightMode',
  'setDrying',
];

export function isStructureCommand(p: { readonly kind: string }): p is StructureCommandPayload {
  return (STRUCTURE_COMMAND_KINDS as readonly string[]).includes(p.kind);
}

/** Why parts of a structure command were refused (per-reason counts in the result). */
export type StructureRefusal = 'rim' | 'structure' | 'barrier' | 'channel' | 'device' | 'cap' | 'object' | 'missing';

export interface StructureCommandResult {
  readonly accepted: number;
  readonly rejected: number;
  readonly note?: string;
  /** Ids placed (placeEdges, placeDevice) or removed (removeStructures), ascending. */
  readonly ids?: number[];
  /** Per-reason refusal counts; present only when something was refused. */
  readonly refused?: Partial<Record<StructureRefusal, number>>;
  /** A removed resin's bound activity per target (the logged export); present only when non-zero. */
  readonly exported?: Partial<Record<ResinTarget, number>>;
  /** Links cut because a barrier now crosses them; present only when > 0. */
  readonly severed?: number;
}

const MALFORMED = (note: string): StructureCommandResult => ({ accepted: 0, rejected: 0, note });

const KEYS: Readonly<Record<StructureCommandKind, readonly string[]>> = {
  placeEdges: ['kind', 'structure', 'edges', 'open', 'flow'],
  placeDevice: ['kind', 'structure', 'cell'],
  removeStructures: ['kind', 'ids'],
  moveDevice: ['kind', 'id', 'cell'],
  setDevice: ['kind', 'id', 'on', 'open', 'resinSelect'],
  wetBrush: ['kind', 'points', 'radius'],
  setLightMode: ['kind', 'mode'],
  setDrying: ['kind', 'drying'],
};

const isGridCell = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < CELL_COUNT;
const isId = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;

/** Whether this dish records structure `id` and every system it needs (STRUCTURE_SYSTEM_NEEDS). */
export function structureAvailable(world: World, id: string): boolean {
  if (!worldHasStructure(world, id)) return false;
  const needs = STRUCTURE_SYSTEM_NEEDS[id];
  return needs !== undefined && needs.every((s) => worldHasSystem(world, s));
}

/** Whether this dish records any Phase 5 structure it could place (S01–S12 with their systems). */
function anyStructureAvailable(world: World): boolean {
  return EDGE_KINDS.some((k) => structureAvailable(world, k)) || DEVICE_KINDS.some((k) => structureAvailable(world, k));
}

const CLIMATE_NOTE = `climate is ${NOT_IN_DISH}`;
const STRUCTURES_NOTE = `structures are ${NOT_IN_DISH}`;

/** Why the payload is malformed (refused whole), or null. Checks shape only, never the world. */
export function invalidStructureCommand(p: StructureCommandPayload): string | null {
  const raw = p as unknown as Record<string, unknown>;
  const allowed = KEYS[p.kind];
  for (const k of Object.keys(raw)) if (!allowed.includes(k)) return `invalid setting ${k}`;
  switch (p.kind) {
    case 'placeEdges': {
      if (typeof p.structure !== 'string' || !(EDGE_KINDS as readonly string[]).includes(p.structure)) return `unknown edge barrier ${String(p.structure)}`;
      if (p.structure === 'S03') {
        if (typeof p.open !== 'boolean') return 'a shutter gate needs open or closed';
      } else if (raw.open !== undefined) return 'invalid setting open';
      if (p.structure === 'S04') {
        if (p.flow !== 1 && p.flow !== -1) return 'a one-way channel needs a direction';
      } else if (raw.flow !== undefined) return 'invalid setting flow';
      if (!Array.isArray(p.edges) || p.edges.length === 0) return 'no edges';
      if (p.edges.length > EDGE_BARRIER_CAP) return 'too many edges';
      const keys: number[] = [];
      for (const e of p.edges as readonly unknown[]) {
        if (!Array.isArray(e) || e.length !== 2) return 'invalid edge';
        const cell: unknown = e[0];
        const dir: unknown = e[1];
        if (!isGridCell(cell) || (dir !== 'R' && dir !== 'D')) return 'invalid edge';
        keys.push(edgeKey(cell, dir));
      }
      keys.sort((a, b) => a - b);
      for (let k = 1; k < keys.length; k++) if (keys[k] === keys[k - 1]) return 'repeated edge';
      return null;
    }
    case 'placeDevice':
      if (typeof p.structure !== 'string' || !(DEVICE_KINDS as readonly string[]).includes(p.structure)) return `unknown device ${String(p.structure)}`;
      return isGridCell(p.cell) ? null : 'invalid cell';
    case 'removeStructures': {
      if (!Array.isArray(p.ids) || p.ids.length === 0) return 'no structures';
      if (p.ids.length > EDGE_BARRIER_CAP + DEVICE_CAP) return 'too many structures';
      const ids: unknown[] = [...(p.ids as readonly unknown[])];
      if (!ids.every(isId)) return 'invalid identity';
      const sorted = ids.sort((a, b) => a - b);
      for (let k = 1; k < sorted.length; k++) if (sorted[k] === sorted[k - 1]) return 'repeated identity';
      return null;
    }
    case 'moveDevice':
      if (!isId(p.id)) return 'invalid identity';
      return isGridCell(p.cell) ? null : 'invalid cell';
    case 'setDevice': {
      if (!isId(p.id)) return 'invalid identity';
      const given = (['on', 'open', 'resinSelect'] as const).filter((k) => raw[k] !== undefined);
      if (given.length !== 1) return 'a device setting needs exactly one value';
      if (raw.on !== undefined && typeof raw.on !== 'boolean') return 'invalid setting on';
      if (raw.open !== undefined && typeof raw.open !== 'boolean') return 'invalid setting open';
      if (raw.resinSelect !== undefined) {
        const sel = raw.resinSelect;
        if (!Array.isArray(sel)) return 'invalid resin selection';
        let last = -1;
        for (const t of sel as readonly unknown[]) {
          const k = typeof t === 'string' ? (RESIN_TARGETS as readonly string[]).indexOf(t) : -1;
          if (k < 0 || k <= last) return 'invalid resin selection';
          last = k;
        }
      }
      return null;
    }
    case 'wetBrush':
      return invalidLabStroke(p.points, p.radius);
    case 'setLightMode':
      return p.mode === 'fixed' || p.mode === 'cycle' ? null : 'unknown light mode';
    case 'setDrying':
      return typeof p.drying === 'boolean' ? null : 'invalid drying setting';
  }
}

/** Apply one structure or climate command (stage 1). */
export function applyStructureCommand(world: World, p: StructureCommandPayload): StructureCommandResult {
  const bad = invalidStructureCommand(p);
  if (bad) return MALFORMED(bad);
  switch (p.kind) {
    case 'placeEdges':
      return placeEdges(world, p);
    case 'placeDevice':
      return placeDevice(world, p);
    case 'removeStructures':
      return removeStructures(world, p.ids);
    case 'moveDevice':
      return moveDevice(world, p.id, p.cell);
    case 'setDevice':
      return setDevice(world, p);
    case 'wetBrush':
      return wetBrush(world, p.points, p.radius);
    case 'setLightMode': {
      if (!worldHasSystem(world, 'climate')) return MALFORMED(CLIMATE_NOTE);
      if (world.settings.lightMode === p.mode) return { accepted: 0, rejected: 0, note: 'unchanged' };
      setLightMode(world, p.mode);
      return { accepted: 1, rejected: 0 };
    }
    case 'setDrying': {
      if (!worldHasSystem(world, 'climate')) return MALFORMED(CLIMATE_NOTE);
      if (world.settings.drying === p.drying) return { accepted: 0, rejected: 0, note: 'unchanged' };
      world.settings.drying = p.drying;
      return { accepted: 1, rejected: 0 };
    }
  }
}

// ---- Results ---------------------------------------------------------------------------------------

function result(
  accepted: number,
  refused: Partial<Record<StructureRefusal, number>>,
  extra: { note?: string | null; ids?: number[]; exported?: Partial<Record<ResinTarget, number>>; severed?: number } = {},
): StructureCommandResult {
  let rejected = 0;
  for (const k of ['rim', 'structure', 'barrier', 'channel', 'device', 'cap', 'object', 'missing'] as const) rejected += refused[k] ?? 0;
  return {
    accepted,
    rejected,
    ...(extra.note ? { note: extra.note } : {}),
    ...(extra.ids && extra.ids.length > 0 ? { ids: extra.ids } : {}),
    ...(rejected > 0 ? { refused } : {}),
    ...(extra.exported && Object.keys(extra.exported).length > 0 ? { exported: extra.exported } : {}),
    ...(extra.severed !== undefined && extra.severed > 0 ? { severed: extra.severed } : {}),
  };
}

function bump(world: World): void {
  world.grid.geometryVersion++;
}

/** Whether a barrier of this kind and state refuses some organism class (and so may cut a link). */
function blocksOrganisms(kind: EdgeKind, open: boolean | undefined): boolean {
  return kind !== 'S03' || open === false;
}

// ---- placeEdges ------------------------------------------------------------------------------------

function placeEdges(world: World, p: Extract<StructureCommandPayload, { kind: 'placeEdges' }>): StructureCommandResult {
  if (!structureAvailable(world, p.structure)) return MALFORMED(`${p.structure} is ${NOT_IN_DISH}`);
  const order = [...p.edges].sort((a, b) => edgeKey(a[0], a[1]) - edgeKey(b[0], b[1]));
  const codes = edgeCodesOf(world);
  const refused: Partial<Record<StructureRefusal, number>> = {};
  const added: EdgeBarrier[] = [];
  const ids: number[] = [];
  for (const [cell, dir] of order) {
    const o = edgePlacementOutcome(p.structure, cell, dir, world.grid, codes, world.edges.length + added.length);
    if (o !== 'ok') {
      refused[o] = (refused[o] ?? 0) + 1;
      continue;
    }
    const id = world.counters.nextDeviceId++;
    ids.push(id);
    const rec: EdgeBarrier =
      p.structure === 'S03'
        ? { id, kind: p.structure, cell, dir, open: p.open! }
        : p.structure === 'S04'
          ? { id, kind: p.structure, cell, dir, flow: p.flow! }
          : { id, kind: p.structure, cell, dir };
    added.push(rec);
  }
  let severed = 0;
  if (added.length > 0) {
    world.edges = sortEdges([...world.edges, ...added]);
    bump(world);
    if (blocksOrganisms(p.structure, p.open)) severed = severCrossedLinks(world);
  }
  return result(added.length, refused, { note: added.length === 0 ? 'nothing placed' : null, ids, severed });
}

// ---- placeDevice -----------------------------------------------------------------------------------

function placeDevice(world: World, p: Extract<StructureCommandPayload, { kind: 'placeDevice' }>): StructureCommandResult {
  if (!structureAvailable(world, p.structure)) return MALFORMED(`${p.structure} is ${NOT_IN_DISH}`);
  const o = devicePlacementOutcome(p.cell, world.grid.structure, deviceKindsOf(world), world.devices.length);
  if (o !== 'ok') return result(0, { [o]: 1 }, { note: 'nothing placed' });
  const id = world.counters.nextDeviceId++;
  const rec: Device = { id, kind: p.structure, cell: p.cell };
  if (TOGGLED_KINDS.includes(p.structure)) rec.on = false; // SPEC §10.4: devices start Off
  if (p.structure === 'S08') rec.resinSelect = []; // the resin's Off (D-0108)
  world.devices = sortDevices([...world.devices, rec]);
  bump(world);
  return result(1, {}, { ids: [id] });
}

// ---- removeStructures ------------------------------------------------------------------------------

function removeStructures(world: World, given: readonly number[]): StructureCommandResult {
  if (!anyStructureAvailable(world)) return MALFORMED(STRUCTURES_NOTE);
  const ids = [...given].sort((a, b) => a - b);
  const edgeHit: EdgeBarrier[] = [];
  const devHit: Device[] = [];
  for (const id of ids) {
    const e = world.edges.find((x) => x.id === id);
    if (e) edgeHit.push(e);
    const d = world.devices.find((x) => x.id === id);
    if (d) devHit.push(d);
  }
  for (const s of [...edgeHit, ...devHit]) if (!structureAvailable(world, s.kind)) return MALFORMED(`${s.kind} is ${NOT_IN_DISH}`);
  const removed = edgeHit.length + devHit.length;
  const refused: Partial<Record<StructureRefusal, number>> = {};
  if (ids.length > removed) refused.missing = ids.length - removed;
  if (removed === 0) return result(0, refused, { note: 'nothing removed' });
  // A removed resin's bound activity leaves with it: summed per target in RESIN_TARGETS order and devices
  // in id order (the logged export; activity is not a conserved material, so no ledger line).
  const exported: Partial<Record<ResinTarget, number>> = {};
  for (const d of devHit) {
    if (d.kind !== 'S08' || d.bound === undefined) continue;
    for (const t of RESIN_TARGETS) {
      const v = d.bound[t];
      if (v !== undefined && v > 0) exported[t] = (exported[t] ?? 0) + v;
    }
  }
  if (edgeHit.length > 0) world.edges = world.edges.filter((e) => !edgeHit.includes(e));
  if (devHit.length > 0) world.devices = world.devices.filter((d) => !devHit.includes(d));
  bump(world);
  const removedIds = [...edgeHit, ...devHit].map((s) => s.id).sort((a, b) => a - b);
  return result(removed, refused, { ids: removedIds, exported });
}

// ---- moveDevice ------------------------------------------------------------------------------------

function moveDevice(world: World, id: number, cell: number): StructureCommandResult {
  const k = world.devices.findIndex((d) => d.id === id);
  if (k < 0) {
    if (world.edges.some((e) => e.id === id)) return MALFORMED('an edge barrier cannot be moved');
    if (!anyStructureAvailable(world)) return MALFORMED(STRUCTURES_NOTE);
    return result(0, { missing: 1 }, { note: 'no such structure' });
  }
  const d = world.devices[k]!;
  if (!structureAvailable(world, d.kind)) return MALFORMED(`${d.kind} is ${NOT_IN_DISH}`);
  if (d.cell === cell) return { accepted: 0, rejected: 0, note: 'unchanged' };
  // S07: the basket's contents are the food object on its cell; it moves with the basket (D-0117).
  const carried = d.kind === 'S07' ? objectAt(world, d.cell) : null;
  const clash = carried !== null && objectAt(world, cell) !== null;
  const o = deviceMoveOutcome(cell, world.grid.structure, deviceKindsOf(world), clash);
  if (o !== 'ok') return result(0, { [o]: 1 }, { note: 'not moved' });
  if (carried !== null && !relocateObject(world, carried.id, cell)) throw new Error('moveDevice: the basket object cannot follow after validation');
  const moved: Device = { ...d, cell };
  world.devices = sortDevices(world.devices.map((x, j) => (j === k ? moved : x)));
  bump(world);
  return { accepted: 1, rejected: 0 };
}

// ---- setDevice -------------------------------------------------------------------------------------

function sameSelection(a: readonly ResinTarget[] | undefined, b: readonly ResinTarget[]): boolean {
  if (a === undefined || a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}

function setDevice(world: World, p: Extract<StructureCommandPayload, { kind: 'setDevice' }>): StructureCommandResult {
  const e = world.edges.findIndex((x) => x.id === p.id);
  const d = world.devices.findIndex((x) => x.id === p.id);
  if (e < 0 && d < 0) {
    if (!anyStructureAvailable(world)) return MALFORMED(STRUCTURES_NOTE);
    return result(0, { missing: 1 }, { note: 'no such structure' });
  }
  const kind = e >= 0 ? world.edges[e]!.kind : world.devices[d]!.kind;
  if (!structureAvailable(world, kind)) return MALFORMED(`${kind} is ${NOT_IN_DISH}`);
  if (p.open !== undefined) {
    if (kind !== 'S03') return MALFORMED(`${kind} has no open setting`);
    const edge = world.edges[e]!;
    if (edge.open === p.open) return { accepted: 0, rejected: 0, note: 'unchanged' };
    const next: EdgeBarrier = { ...edge, open: p.open };
    world.edges = world.edges.map((x, j) => (j === e ? next : x));
    bump(world);
    const severed = p.open ? 0 : severCrossedLinks(world);
    return result(1, {}, { severed });
  }
  if (d < 0) return MALFORMED(`${kind} has no ${p.on !== undefined ? 'on' : 'resin'} setting`);
  const dev = world.devices[d]!;
  let next: Device;
  if (p.on !== undefined) {
    if (!TOGGLED_KINDS.includes(dev.kind)) return MALFORMED(`${kind} has no on setting`);
    if (dev.on === p.on) return { accepted: 0, rejected: 0, note: 'unchanged' };
    next = { ...dev, on: p.on };
  } else {
    if (dev.kind !== 'S08') return MALFORMED(`${kind} has no resin setting`);
    const sel = p.resinSelect!;
    if (sameSelection(dev.resinSelect, sel)) return { accepted: 0, rejected: 0, note: 'unchanged' };
    next = { ...dev, resinSelect: [...sel] }; // bound is kept (D-0117)
  }
  world.devices = world.devices.map((x, j) => (j === d ? next : x));
  bump(world);
  return { accepted: 1, rejected: 0 };
}

// ---- wetBrush --------------------------------------------------------------------------------------

function wetBrush(world: World, points: LabStroke, radius: number): StructureCommandResult {
  if (!worldHasSystem(world, 'climate')) return MALFORMED(CLIMATE_NOTE);
  const cells = strokeFootprint(points, radius);
  const sub = world.grid.substrate;
  let accepted = 0;
  for (const c of cells) if (cellInDish(c) && sub[c] !== SUB_WATER) accepted++;
  // Nothing to wet: nothing changes (not even the moisture array's allocation), so no undo point is lost.
  if (accepted === 0) return { accepted: 0, rejected: cells.length, note: 'nothing wetted' };
  wetCells(world, cells);
  return { accepted, rejected: cells.length - accepted };
}

// ---- Severing --------------------------------------------------------------------------------------

/**
 * Cut every fungal or adhesion link that an edge barrier now refuses (D-0113, D-0117): for each living
 * organism i in ascending slot order and each valid link to a partner p > i (fungal links fLink0..3 first,
 * then adhesion links aLink0..1, each in position order), when their cells differ and the boundary between
 * them refuses either party's class (edgePassage.ts pairPermitted, the corner rule included; for cells more
 * than one apart, the straight segment between their centres for both classes), the link is removed and
 * one 'linkBroken' event is emitted from i with detail { kind, partner (birthId), cause: 'barrier' } (a
 * fungal one also names its link kind). A survivor of a cut adhesion link starts E12's relink lockout, as
 * every other adhesion break does (adhesion.ts). `only` (by slot), when given, limits the check to links
 * with an end in it (a released sample block). Returns the number of links cut. No randomness.
 */
export function severCrossedLinks(world: World, only: Uint8Array | null = null): number {
  if (world.edges.length === 0) return 0;
  const e = world.ents;
  const c = e.cols;
  const rules = adhesionRules(world);
  let cut = 0;
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    if (c.fLink0[i] === -1 && c.fLink1[i] === -1 && c.fLink2[i] === -1 && c.fLink3[i] === -1 && c.aLink0[i] === -1 && c.aLink1[i] === -1) continue;
    for (const kind of ['fungal', 'adhesion'] as const) {
      const partners = kind === 'fungal' ? fungalNeighbors(world, i) : adhesionNeighbors(world, i);
      for (const p of partners) {
        if (p <= i) continue;
        if (only !== null && only[i] !== 1 && only[p] !== 1) continue;
        if (!crossed(world, i, p)) continue;
        if (kind === 'fungal') {
          const link = fungalLinkKind(world, i, p) === LINK_TRANSPORT ? 'transport' : 'visual';
          if (!removeFungalLink(world, i, p)) continue;
          emit(world.events, world.counters, {
            tick: world.tick,
            type: 'linkBroken',
            species: c.species[i]!,
            birthId: c.birthId[i]!,
            detail: { kind: 'fungal', link, partner: c.birthId[p]!, cause: 'barrier' },
          });
        } else {
          if (!removeAdhesionLink(world, i, p)) continue;
          if (rules !== null) {
            for (const s of [i, p]) {
              c.adhLockout[s] = rules.lockoutSeconds;
              c.adhPartner[s] = 0;
              c.adhSeconds[s] = 0;
            }
          }
          emit(world.events, world.counters, {
            tick: world.tick,
            type: 'linkBroken',
            species: c.species[i]!,
            birthId: c.birthId[i]!,
            detail: { kind: 'adhesion', partner: c.birthId[p]!, cause: 'barrier' },
          });
        }
        cut++;
      }
    }
  }
  return cut;
}

/** Whether an edge barrier stands between organisms i and p for either party's class. */
function crossed(world: World, i: number, p: number): boolean {
  const c = world.ents.cols;
  const a = entityCell(c.x[i]!, c.y[i]!);
  const b = entityCell(c.x[p]!, c.y[p]!);
  if (a === b) return false;
  const ci = classOf(world, i);
  const cp = classOf(world, p);
  const dx = Math.floor(c.x[p]!) - Math.floor(c.x[i]!);
  const dy = Math.floor(c.y[p]!) - Math.floor(c.y[i]!);
  if (dx >= -1 && dx <= 1 && dy >= -1 && dy <= 1) return !pairPermitted(world, a, b, ci, cp);
  return !(segmentPermitted(world, c.x[i]!, c.y[i]!, c.x[p]!, c.y[p]!, ci) && segmentPermitted(world, c.x[i]!, c.y[i]!, c.x[p]!, c.y[p]!, cp));
}
