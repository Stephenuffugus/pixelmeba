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
import type { NotMeasuredWhy, ProbeGate, ProbeId, ProbeMask, ProbeReading, ProbeReadings, ProbeSeries } from '@worker/probes';
import { dishInfo, getClient, showToast } from './state';
import { edgeValue, ENZYME_TARGETS, KIND_TEXT, MEAN_NAMES, OBSERVE_TEXT, POOL_NAMES, amount } from './strings/observe';

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

/** The signed boundary amount in words (a 'notMeasured' entry with a reason says why: Phase 5 wave 11). */
export function boundaryText(
  status: 'measured' | 'notMeasured' | 'absent',
  into: number,
  why?: NotMeasuredWhy,
): string {
  if (status === 'absent') return OBSERVE_TEXT.absent;
  if (status === 'notMeasured') {
    if (why === 'decays') return OBSERVE_TEXT.notMeasuredDecays;
    if (why === 'resin') return OBSERVE_TEXT.notMeasuredResin;
    if (why === 'gas') return OBSERVE_TEXT.notMeasuredGas;
    return OBSERVE_TEXT.notMeasured;
  }
  if (amount(into) === '0' || Math.abs(into) < 1e-9) return OBSERVE_TEXT.noDrift;
  return into > 0 ? OBSERVE_TEXT.into(amount(into)) : OBSERVE_TEXT.outOf(amount(into));
}

// ------------------------------------------------------------------------------ region charts (Phase 5 wave 11)
// Pure helpers for the probe sheet's charts, table alternative, crossings and gates (tests/ui/probe-charts.test.ts).

/** Which regions show their series as a table instead of charts (session UI state). */
export const probeTables = signal<readonly ProbeId[]>([]);

export function toggleProbeTable(id: ProbeId): void {
  const now = probeTables.value;
  probeTables.value = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
}

/** A pool's display name (never the internal id). */
export function poolLabel(field: string): string {
  return MEAN_NAMES[field] ?? OBSERVE_TEXT.absent;
}

export interface Spark {
  /** One polyline per unbroken run of values (a null breaks the line). */
  readonly lines: readonly string[];
  readonly min: number;
  readonly max: number;
  /** y of value 0 when 0 lies strictly inside (min, max) (the net charts' baseline), else null. */
  readonly zeroY: number | null;
}

/**
 * Scale a series into a width × height box (x by index, the first at 0 and the last at width; a single
 * point in the middle; y from max at the top to min at the bottom, inside `pad`; a flat series on the
 * middle line). Null when the series has no value.
 */
export function sparkLines(values: readonly (number | null)[], width: number, height: number, pad = 2): Spark | null {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length === 0) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min;
  const x = (i: number) => (values.length === 1 ? width / 2 : (i / (values.length - 1)) * width);
  const y = (v: number) => (span === 0 ? height / 2 : pad + ((max - v) / span) * (height - 2 * pad));
  const r = (v: number) => Math.round(v * 100) / 100;
  const lines: string[] = [];
  let run: string[] = [];
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      if (run.length > 0) lines.push(run.join(' '));
      run = [];
      return;
    }
    run.push(`${r(x(i))},${r(y(v))}`);
  });
  if (run.length > 0) lines.push(run.join(' '));
  return { lines, min, max, zeroY: min < 0 && max > 0 ? r(y(0)) : null };
}

/** A chart's value range in words ("from 3 to 12", or "steady at 4"). */
export function sparkRange(s: Spark): string {
  return s.min === s.max ? OBSERVE_TEXT.chartFlat(amount(s.min)) : OBSERVE_TEXT.chartRange(signedAmount(s.min), signedAmount(s.max));
}

/** An amount with its sign (net values can be negative). */
export function signedAmount(v: number): string {
  const a = amount(v);
  return v < 0 && a !== '0' ? `−${a}` : a;
}

export interface SeriesColumn {
  readonly key: string;
  readonly label: string;
  readonly chart: string;
  readonly values: readonly (number | null)[];
}

/** The series' columns in table and chart order: living, biomass, then each measured pool's net. */
export function seriesColumns(series: ProbeSeries): SeriesColumn[] {
  return [
    { key: 'living', label: OBSERVE_TEXT.colLiving, chart: OBSERVE_TEXT.chartLiving, values: series.total },
    { key: 'biomass', label: OBSERVE_TEXT.colBiomass, chart: OBSERVE_TEXT.chartBiomass, values: series.biomass },
    ...series.pools.map((p) => ({
      key: `net:${p.field}`,
      label: OBSERVE_TEXT.colNet(poolLabel(p.field)),
      chart: OBSERVE_TEXT.chartNet(poolLabel(p.field)),
      values: p.into,
    })),
  ];
}

/** The table alternative: one row per recorded second, the same values as the charts, in words. */
export function seriesRows(series: ProbeSeries): { readonly second: number; readonly cells: readonly string[] }[] {
  const cols = seriesColumns(series);
  return series.seconds.map((second, i) => ({
    second,
    cells: cols.map((c, k) => {
      const v = c.values[i] ?? null;
      if (v === null) return '—';
      return k === 0 ? String(v) : signedAmount(v);
    }),
  }));
}

/** "Sprinter: entered 3, left 1" per species with a crossing in the window. */
export function crossingLines(r: Pick<ProbeReading, 'crossings'>, names: Names): string[] {
  return r.crossings.map((c) => OBSERVE_TEXT.crossed(speciesName(names, c.species), String(c.entered), String(c.left)));
}

export interface GateGroup {
  /** The structure id ('S01' … 'S04'). */
  readonly kind: string;
  readonly edges: number;
  readonly since: readonly { readonly field: string; readonly amount: number }[];
  readonly sinceOrganisms: number;
  /**
   * Null while any of the group's gates has no whole second recorded in this window; recordedSinceSecond:
   * the latest second a gate's record starts at, when that is after the window's start.
   */
  readonly window: {
    readonly fields: readonly { readonly field: string; readonly amount: number }[];
    readonly organisms: number;
    readonly recordedSinceSecond: number | null;
  } | null;
}

function addAmounts(into: Map<string, number>, list: readonly { readonly field: string; readonly amount: number }[]): void {
  for (const f of list) into.set(f.field, (into.get(f.field) ?? 0) + f.amount);
}

/**
 * The gates on region `id`'s boundary, summed per structure kind (kind order; fields in the order the
 * readings list them). A line of gates is many edges, each with its own tally; the sheet shows their sum.
 */
export function gateGroups(gates: readonly ProbeGate[], id: ProbeId): GateGroup[] {
  const kinds = [...new Set(gates.filter((g) => g.regions.includes(id)).map((g) => g.kind))].sort();
  return kinds.map((kind) => {
    const mine = gates.filter((g) => g.kind === kind && g.regions.includes(id));
    const since = new Map<string, number>();
    const win = new Map<string, number>();
    let sinceOrganisms = 0;
    let winOrganisms = 0;
    let full = true;
    let sinceSecond: number | null = null;
    for (const g of mine) {
      addAmounts(since, g.sinceStart.fields);
      sinceOrganisms += g.sinceStart.organisms;
      if (g.window === null) full = false;
      else {
        addAmounts(win, g.window.fields);
        winOrganisms += g.window.organisms;
        const at = g.window.recordedSinceSecond;
        if (at !== null && (sinceSecond === null || at > sinceSecond)) sinceSecond = at;
      }
    }
    const list = (m: Map<string, number>) => [...m].map(([field, amount]) => ({ field, amount }));
    return {
      kind,
      edges: mine.length,
      since: list(since),
      sinceOrganisms,
      window: full ? { fields: list(win), organisms: winOrganisms, recordedSinceSecond: sinceSecond } : null,
    };
  });
}

/** "Sugar 3.20, Salt < 0.01" (or "nothing yet"). */
export function gateAmountText(list: readonly { readonly field: string; readonly amount: number }[]): string {
  const shown = list.filter((f) => f.amount > 0);
  return shown.length === 0 ? OBSERVE_TEXT.gateNothing : shown.map((f) => `${poolLabel(f.field)} ${amount(f.amount)}`).join(', ');
}
