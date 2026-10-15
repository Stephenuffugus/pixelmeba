/**
 * Copy for the Observe tray's relationship map and region probes (P4.8; SPEC §12.8–§12.9; D02 §20 and
 * line 149; UX §4.4). Text comes from recorded kinds and measured values only. Never "mutualism",
 * "helps", "needs", "depends on" or "better": "resource exchange observed" is the only summary label,
 * and only where two species each have an arrow to the other in the window (D02 line 149).
 */
import { FIELD_NAMES } from './fields';
import type { MapEdgeKind } from '@worker/relationshipMap';

export type MapWindowSeconds = 60 | 180 | 600;

/** Carbon and other game amounts, rounded for reading. */
export function amount(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a < 0.01) return '< 0.01';
  if (a >= 100) return a.toFixed(0);
  return a.toFixed(2);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The relationship's verb in the table and on the picture's arrows. */
export const KIND_TEXT: Readonly<Record<MapEdgeKind, string>> = {
  eats: 'eats',
  catches: 'catches',
  infects: 'infects',
  attaches: 'attaches to',
  bursts: 'bursts',
  drains: 'drains',
  converts: 'converts',
};

/** Conversion targets name the enzyme's work (D-0051). */
export const ENZYME_TARGETS: Readonly<Record<string, string>> = {
  starch: 'starch into sugar',
  oil: 'oil into metabolite',
  protein: 'protein into broth',
};

/** Pool names (the pools an "eats" edge can point at). */
export const POOL_NAMES: Readonly<Record<string, string>> = {
  sugar: 'sugar',
  starch: 'starch',
  oil: 'oil',
  protein: 'protein',
  broth: 'broth',
  detritus: 'debris',
  metabolite: 'metabolite',
  film: 'film',
  co2: 'carbon dioxide',
  oxygen: 'oxygen',
};

export const OBSERVE_TEXT = {
  // Observe tray
  mapButton: 'Relationship map',
  regionsButton: 'Regions',
  observeGroup: 'Charts, family, relationships and regions',

  // Relationship map
  mapTitle: 'Relationship map',
  mapIntro:
    'Arrows show only what this dish recorded: which species caught, infected, attached to, burst or drained another, which turned one food into another, and which fed from a food pool. Nothing is drawn for what was not recorded.',
  windowLegend: 'Window',
  windowOption: (w: MapWindowSeconds) => `Last ${w} s`,
  colActor: 'Actor',
  colKind: 'Relationship',
  colTarget: 'Target',
  colMeasured: (w: MapWindowSeconds) => `Measured in the last ${w} s`,
  tableCaption: (w: MapWindowSeconds) => `What this dish recorded in the last ${w} s of dish time`,
  footnote:
    "Only what this dish recorded is shown. A missing arrow means it wasn't seen in this window, not that it can't happen.",
  empty: (w: MapWindowSeconds) => `Nothing was recorded passing between living things in the last ${w} s.`,
  recordedSince: (clock: string) => `Recorded since ${clock}.`,
  recordedSinceWhy:
    'The map keeps what it saw while this dish was open in this visit, and starts again after Undo.',
  poolsTitle: 'Taken from the pools',
  /** P4.13 (D-0085): pool totals are measured only from the map's first opening in this visit. */
  poolsSinceWhy: 'Pool totals are measured from the moment this map was first opened for this dish in this visit.',
  poolRemoved: (pool: string, c: string) => `${pool}: ${c} C taken by feeding`,
  poolNet: (pool: string, c: string, out: boolean) =>
    out
      ? `${pool}: net ${c} C left the pool during feeding (feeding also returns some)`
      : `${pool}: net ${c} C came back to the pool during feeding`,
  poolNotSplit: 'A pool’s total is not divided among the species that ate from it.',
  exchange: (a: string, b: string) =>
    `${a} and ${b}: resource exchange observed (each has an arrow to the other in this window).`,
  pictureLabel: (n: number) =>
    `Picture of the same ${plural(n, 'arrow', 'arrows')}; the table above lists them.`,
  fictional: 'All numbers are fictional game units.',
  close: 'Close relationship map',

  // Region probes
  probesTitle: 'Regions',
  probesIntro:
    'Draw up to six rectangles or circles on the dish. Each region reports who lives in it, its food and gas, and what drifted across its edge.',
  notSaved: 'Regions are not saved with the dish.',
  drawTitle: 'Draw a region',
  drawHint: 'Drag on the dish to draw a region. One drag draws one region.',
  rectangle: 'Rectangle',
  circle: 'Circle',
  shapeGroup: 'Region shape',
  count: (n: number) => `${n} of 6 regions`,
  done: 'Done drawing',
  showReadings: 'Show readings',
  drawAnother: 'Draw a region',
  tapHint: 'Drag to draw a region; a tap draws nothing.',
  refusedSix: 'Six regions is the most. Delete one to draw another.',
  noCells: 'That region has no cells inside the dish.',
  added: (id: string) => `Region ${id} drawn.`,
  deleted: (id: string) => `Region ${id} deleted.`,
  none: 'No regions yet. Choose Regions in Observe, then drag on the dish.',
  overlap: (a: string, b: string) =>
    `Regions ${a} and ${b} overlap. Cells inside both are counted in each, so don't add their totals together.`,
  regionHeading: (id: string, shape: 'rect' | 'circle', cells: number) =>
    `Region ${id} · ${shape === 'rect' ? 'rectangle' : 'circle'} · ${plural(cells, 'cell', 'cells')}`,
  deleteRegion: (id: string) => `Delete region ${id}`,
  delete: 'Delete',
  living: (n: number) => `Living now: ${n}`,
  nobody: 'Nobody lives here now.',
  biomass: (c: string) => `Biomass now: ${c} C`,
  meansTitle: 'Mean per cell now',
  boundaryTitle: (w: MapWindowSeconds) => `Drifted across the edge in the last ${w} s`,
  into: (v: string) => `${v} into the region`,
  outOf: (v: string) => `${v} out of the region`,
  noDrift: 'no change',
  notMeasured: 'not measured here',
  notMeasuredWhy:
    'Not measured here: the dish also adds or removes it where it lies (or it does not drift), so a change inside is not all crossing.',
  absent: 'not in this dish',
  close2: 'Close regions',

  // Phase 5 wave 11 (region-charts-gates; UX §5.4 charts, §9 table alternatives; D-0119)
  notMeasuredDecays: 'Not measured here: it also decays while it spreads.',
  notMeasuredResin: 'Not measured here: a resin in this region removes it.',
  notMeasuredGas: 'Not measured here: with the lid open, the air trades it.',
  chartsTitle: (w: MapWindowSeconds) => `Each second of the last ${w} s`,
  showTable: 'Show as table',
  showCharts: 'Show as charts',
  seriesCaption: (id: string, w: MapWindowSeconds) => `Region ${id}: each recorded second of the last ${w} s`,
  colSecond: 'Dish time',
  colLiving: 'Living',
  colBiomass: 'Biomass (C)',
  colNet: (pool: string) => `${pool} net into the region`,
  chartLiving: 'Living organisms',
  chartBiomass: 'Biomass (C)',
  chartNet: (pool: string) => `${pool} net into the region each second`,
  chartRange: (lo: string, hi: string) => `from ${lo} to ${hi}`,
  chartFlat: (v: string) => `steady at ${v}`,
  chartFrom: 'Dish time',
  noSeries: 'No second recorded yet.',
  crossingsTitle: (w: MapWindowSeconds) => `Entered or left in the last ${w} s`,
  crossed: (name: string, entered: string, left: string) => `${name}: entered ${entered}, left ${left}`,
  noCrossings: (w: MapWindowSeconds) => `No organism entered or left in the last ${w} s.`,
  gatesTitle: 'Gates on this region’s edge',
  gateHeading: (name: string, edges: string) => `${name} · ${edges}`,
  // The sum over the current edges of one kind, each counted since it was placed (a removed edge's
  // share leaves the sum; D-0119 fix 1, worded like the gate sheet's "Measured since this barrier was placed").
  gateSince: (list: string) => `Measured since each of these edges was placed: ${list}`,
  gateWindow: (w: MapWindowSeconds, list: string) => `In the last ${w} s: ${list}`,
  gateWindowSince: (clock: string, list: string) => `Since ${clock}: ${list}`,
  gateNoWindow: 'This window: no whole second recorded yet.',
  gateNothing: 'nothing yet',
  gatesWhy:
    'A gate adds up what crossed it in either direction, so it can be more than the region’s net amount above.',
} as const;

/** "1 edge", "12 edges". */
export const edgeCount = (n: number): string => plural(n, 'edge', 'edges');
/** "0 organisms crossed", "1 organism crossed". */
export const organismsCrossed = (n: number): string => `${plural(n, 'organism', 'organisms')} crossed`;

export const MEAN_NAMES: Readonly<Record<string, string>> = {
  sugar: 'Sugar',
  starch: 'Starch',
  detritus: 'Debris',
  oil: 'Oil',
  protein: 'Protein',
  broth: 'Broth',
  oxygen: 'Oxygen',
  co2: 'Carbon dioxide',
  // Phase 5 wave 11: the boundary list's added pools and every pool a gate can tally.
  salt: 'Salt',
  silicate: 'Silicate',
  sugarN: 'Nutrient in sugar',
  brothN: 'Nutrient in broth',
  metabolite: 'Metabolite',
  nutrient: 'Mineral nutrient',
  acid: 'Acid',
  base: 'Base',
  buffer: 'Buffer',
  inhBact: 'Bacterial inhibitor',
  inhFung: 'Fungal inhibitor',
  inhPhoto: 'Photosynthetic inhibitor',
  eStarch: 'Starch enzyme',
  eOil: 'Oil enzyme',
  eProtein: 'Protein enzyme',
  breaker: 'Enzyme breaker',
  // Wave 13 (D-0120 carry-over): the field's own name, one per field across screens (strings/fields.ts).
  sGlow: FIELD_NAMES.sGlow,
  quencher: FIELD_NAMES.quencher,
  rival: FIELD_NAMES.rival,
  v01: 'Pinphage',
  v02: 'Lacephage',
};

/** The measured value of one map edge, in words. */
export function edgeValue(
  kind: MapEdgeKind,
  e: { readonly count: number; readonly carbon: number; readonly seconds: number },
  w: MapWindowSeconds,
): string {
  switch (kind) {
    case 'eats':
      return `seen eating in ${e.seconds} of the last ${w} s`;
    case 'catches':
      return `${plural(e.count, 'catch', 'catches')}, ${amount(e.carbon)} C taken`;
    case 'converts':
      return `${amount(e.carbon)} C converted`;
    case 'infects':
      return plural(e.count, 'infection began', 'infections began');
    case 'attaches':
      return plural(e.count, 'attachment', 'attachments');
    case 'bursts':
      return plural(e.count, 'host burst', 'hosts burst');
    case 'drains':
      return plural(e.count, 'host died drained', 'hosts died drained');
  }
}

/** Every string a player can read from this file (the forbidden-word test reads them all). */
export function allObserveStrings(): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') {
      const f = v as (...a: unknown[]) => unknown;
      const r =
        f.length === 0 ? f() : f.length === 1 ? f('A') : f.length === 2 ? f('A', 'B') : f('A', 'B', true);
      walk(r);
    } else if (typeof v === 'object' && v !== null) Object.values(v).forEach(walk);
  };
  walk(OBSERVE_TEXT);
  walk(KIND_TEXT);
  walk(ENZYME_TARGETS);
  walk(POOL_NAMES);
  walk(MEAN_NAMES);
  for (const n of [0, 1, 3]) out.push(edgeCount(n), organismsCrossed(n));
  for (const k of Object.keys(KIND_TEXT) as MapEdgeKind[])
    for (const n of [1, 3]) out.push(edgeValue(k, { count: n, carbon: n * 0.5, seconds: n }, 60));
  return out;
}
