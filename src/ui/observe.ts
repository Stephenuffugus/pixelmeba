/**
 * Observe tray: the relationship map and region probes in the UI (P4.8; SPEC §12.8; UX §4.4; D-0082).
 *
 * UI state only. The map and the readings are the worker's read-only answers ('relationshipMap',
 * 'probeSet', 'probeRead'); drawing a region is session state sent with 'probeSet' (never a command,
 * never saved). The pure helpers below turn a map into table rows and the picture's nodes, and a drag
 * into a mask; they are tested in tests/ui/observe.test.ts.
 */
import { signal } from '@preact/signals';
import { GRID_H, GRID_W } from '@sim/constants';
import type { MapEdge, MapWindow, RelationshipMapData } from '@worker/relationshipMap';
import type { ProbeId, ProbeMask, ProbeReadings } from '@worker/probes';
import { dishInfo, getClient, showToast } from './state';
import { edgeValue, ENZYME_TARGETS, KIND_TEXT, OBSERVE_TEXT, POOL_NAMES, amount } from './strings/observe';

export const PROBE_LETTERS: readonly ProbeId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
export const OBSERVE_WINDOWS: readonly MapWindow[] = [60, 180, 600];

// ------------------------------------------------------------------------------ relationship map

export const mapWindow = signal<MapWindow>(60);
export const mapData = signal<RelationshipMapData | null>(null);

/** Ask the worker for the open dish's map over the chosen window (read-only). */
export async function refreshMap(): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  const w = mapWindow.value;
  try {
    const map = await getClient().relationshipMap(info.dishId, w);
    if (dishInfo.value?.dishId === info.dishId && mapWindow.value === w) mapData.value = map;
  } catch {
    // the worker's refusal is shown as a toast
  }
}

export interface Names {
  readonly speciesIds: readonly string[];
  readonly speciesNames: readonly string[];
}

/** A species' name, or a pool's, or (converts) the enzyme's work. */
export function targetName(names: Names, kind: MapEdge['kind'], target: string): string {
  if (kind === 'eats') return POOL_NAMES[target] ?? target;
  if (kind === 'converts') return ENZYME_TARGETS[target] ?? target;
  return speciesName(names, target);
}

export function speciesName(names: Names, id: string): string {
  return names.speciesNames[names.speciesIds.indexOf(id)] ?? id;
}

export interface MapRow {
  readonly key: string;
  readonly actor: string;
  readonly kind: string;
  readonly target: string;
  readonly measured: string;
}

/** The table's rows, one per recorded edge, in the map's order. */
export function mapRows(map: RelationshipMapData, names: Names): MapRow[] {
  return map.edges.map((e) => ({
    key: `${e.kind}:${e.actor}:${e.target}`,
    actor: speciesName(names, e.actor),
    kind: KIND_TEXT[e.kind],
    target: targetName(names, e.kind, e.target),
    measured: edgeValue(e.kind, e, map.windowSeconds),
  }));
}

/** The pool lines ("sugar: 1.20 C taken by feeding"). */
export function poolLines(map: RelationshipMapData): string[] {
  return map.pools.map((p) => {
    const name = POOL_NAMES[p.pool] ?? p.pool;
    const label = name.charAt(0).toUpperCase() + name.slice(1);
    if (!p.net) return OBSERVE_TEXT.poolRemoved(label, amount(p.removed));
    return OBSERVE_TEXT.poolNet(label, amount(p.removed), p.removed >= 0);
  });
}

/**
 * Species pairs where each has an arrow to the other in this window (D02 line 149: the only place
 * "resource exchange observed" may be said). Pools and enzymes are never part of a pair.
 */
export function exchangePairs(map: RelationshipMapData): [string, string][] {
  const species = (e: MapEdge) => e.kind !== 'eats' && e.kind !== 'converts' && e.actor !== e.target;
  const arrows = new Set(map.edges.filter(species).map((e) => `${e.actor}>${e.target}`));
  const out: [string, string][] = [];
  for (const a of arrows) {
    const [x, y] = a.split('>') as [string, string];
    if (x < y && arrows.has(`${y}>${x}`)) out.push([x, y]);
  }
  return out.sort((p, q) => (p[0] + p[1] < q[0] + q[1] ? -1 : 1));
}

export interface PictureNode {
  readonly id: string;
  readonly kind: 'species' | 'pool' | 'enzyme';
  readonly label: string;
  readonly x: number;
  readonly y: number;
}

export interface PictureArrow {
  readonly key: string;
  readonly from: string;
  readonly to: string;
  readonly text: string;
  /** Sideways offset index so two arrows between the same nodes never overlap. */
  readonly lane: number;
}

/** Node-link picture of the map: nodes on a circle (species first, then pools and enzymes), one arrow per edge. */
export function mapPicture(
  map: RelationshipMapData,
  names: Names,
  size = 600,
): { nodes: PictureNode[]; arrows: PictureArrow[] } {
  const nodeIds: { id: string; kind: PictureNode['kind']; label: string }[] = [];
  const add = (id: string, kind: PictureNode['kind'], label: string) => {
    if (!nodeIds.some((n) => n.id === id)) nodeIds.push({ id, kind, label });
  };
  for (const e of map.edges) {
    add(`s:${e.actor}`, 'species', speciesName(names, e.actor));
    if (e.kind !== 'eats' && e.kind !== 'converts')
      add(`s:${e.target}`, 'species', speciesName(names, e.target));
  }
  for (const e of map.edges) {
    if (e.kind === 'eats') add(`p:${e.target}`, 'pool', POOL_NAMES[e.target] ?? e.target);
    if (e.kind === 'converts') add(`e:${e.target}`, 'enzyme', ENZYME_TARGETS[e.target] ?? e.target);
  }
  const c = size / 2;
  const r = nodeIds.length <= 1 ? 0 : size * 0.34;
  const nodes = nodeIds.map((n, k) => {
    const a = -Math.PI / 2 + (2 * Math.PI * k) / Math.max(1, nodeIds.length);
    return { ...n, x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  });
  const lanes = new Map<string, number>();
  const arrows: PictureArrow[] = [];
  for (const e of map.edges) {
    const from = `s:${e.actor}`;
    const to =
      e.kind === 'eats' ? `p:${e.target}` : e.kind === 'converts' ? `e:${e.target}` : `s:${e.target}`;
    if (from === to) continue; // a species on itself is in the table only
    const pair = from < to ? `${from}|${to}` : `${to}|${from}`;
    const lane = lanes.get(pair) ?? 0;
    lanes.set(pair, lane + 1);
    arrows.push({ key: `${e.kind}:${e.actor}:${e.target}`, from, to, text: KIND_TEXT[e.kind], lane });
  }
  return { nodes, arrows };
}

// ------------------------------------------------------------------------------ region probes

export const probeMasks = signal<ProbeMask[]>([]);
export const probeReadings = signal<ProbeReadings | null>(null);
export const probeWindow = signal<MapWindow>(60);
/** The drawing session (Observe → Regions): one drag draws one region. */
export const probeDrawing = signal<boolean>(false);
export const probeShape = signal<'rect' | 'circle'>('rect');
/** The region being dragged (outline preview), or null. */
export const probeDraft = signal<ProbeMask | null>(null);

let probesDish: string | null = null;

/** A dish was opened (or reopened after a reload): regions are session state, so they start empty. */
export function probesShowDish(dishId: string | null): void {
  if (probesDish === dishId) return;
  probesDish = dishId;
  probeMasks.value = [];
  probeReadings.value = null;
  probeDrawing.value = false;
  probeDraft.value = null;
}

/** The first free letter A–F, or null when six regions exist. */
export function nextProbeId(masks: readonly ProbeMask[]): ProbeId | null {
  return PROBE_LETTERS.find((id) => !masks.some((m) => m.id === id)) ?? null;
}

const clampCell = (v: number, hi: number) => Math.max(0, Math.min(hi, Math.floor(v)));

/**
 * The mask one drag draws: a rectangle with its corners in the cells the drag started and ended in, or
 * a circle centred on the start cell reaching the end point (whole cells, at most 64).
 */
export function maskFromDrag(
  shape: 'rect' | 'circle',
  id: ProbeId,
  a: readonly [number, number],
  b: readonly [number, number],
): ProbeMask {
  const ax = clampCell(a[0], GRID_W - 1);
  const ay = clampCell(a[1], GRID_H - 1);
  if (shape === 'rect')
    return { id, shape, x0: ax, y0: ay, x1: clampCell(b[0], GRID_W - 1), y1: clampCell(b[1], GRID_H - 1) };
  const r = Math.min(64, Math.round(Math.hypot(b[0] - (ax + 0.5), b[1] - (ay + 0.5))));
  return { id, shape, cx: ax, cy: ay, r };
}

async function sendProbes(next: ProbeMask[]): Promise<string | null> {
  const info = dishInfo.value;
  if (!info) return null;
  const res = await getClient().probeSet(info.dishId, next, probeWindow.value);
  if (dishInfo.value?.dishId !== info.dishId) return null;
  probeMasks.value = [...res.masks];
  probeReadings.value = res.readings;
  return res.refused ?? null;
}

/** One finished drag: add one region (the seventh is refused and nothing changes). */
export async function addProbe(
  shape: 'rect' | 'circle',
  a: readonly [number, number],
  b: readonly [number, number],
): Promise<void> {
  const id = nextProbeId(probeMasks.value);
  if (id === null) {
    showToast(OBSERVE_TEXT.refusedSix, 4000);
    return;
  }
  const refused = await sendProbes([...probeMasks.value, maskFromDrag(shape, id, a, b)]);
  showToast(refused ?? OBSERVE_TEXT.added(id), 4000);
}

export async function deleteProbe(id: ProbeId): Promise<void> {
  await sendProbes(probeMasks.value.filter((m) => m.id !== id));
  showToast(OBSERVE_TEXT.deleted(id), 3000);
}

/** Fresh readings of the open dish's regions (read-only). */
export async function refreshProbes(): Promise<void> {
  const info = dishInfo.value;
  if (!info) return;
  const w = probeWindow.value;
  try {
    const res = await getClient().probeRead(info.dishId, w);
    if (dishInfo.value?.dishId !== info.dishId || probeWindow.value !== w) return;
    probeMasks.value = [...res.masks];
    probeReadings.value = res.readings;
  } catch {
    // the worker's refusal is shown as a toast
  }
}

/** The signed boundary amount in words. */
export function boundaryText(status: 'measured' | 'notMeasured' | 'absent', into: number): string {
  if (status === 'absent') return OBSERVE_TEXT.absent;
  if (status === 'notMeasured') return OBSERVE_TEXT.notMeasured;
  if (amount(into) === '0' || Math.abs(into) < 1e-9) return OBSERVE_TEXT.noDrift;
  return into > 0 ? OBSERVE_TEXT.into(amount(into)) : OBSERVE_TEXT.outOf(amount(into));
}
