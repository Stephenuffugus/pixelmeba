/**
 * History buffers (SPEC §12.4): one sample per simulated second for 30 minutes, then one-minute
 * summaries up to six hours. Sampling happens in stage 10 every 10 ticks.
 *
 * P2.8 adds, all observation only (never read by the simulation, not in the state hash, saved with
 * the dish at world schema 3):
 * - the dish's debris total (detritus carbon) on every per-second sample (`debrisTotal`; absent on
 *   samples recorded before schema 3, which then show no debris line);
 * - regional trait samples (`traits`): every 10 simulated seconds, per region (whole dish and its four
 *   quarters) and per species, the living count and, for each locus active in a member's genome, the
 *   member count, median, minimum and maximum. 10-second samples are kept for the last 30 minutes;
 *   older ones are compacted to one sample per minute (the sample at the whole minute) up to six hours,
 *   like the rest of history, so memory stays bounded (≤ 180 + 360 samples);
 * - the dish's journal (`journal`, SPEC §14.1): the Notebook entries that belong to this dish, kept
 *   with its save so they are checksummed, exported and imported with it. Opaque records written by
 *   the UI; the simulation never reads them.
 */
import { HISTORY_MINUTES, HISTORY_SECONDS, TICKS_PER_SECOND } from './constants';
import { LOCUS_COUNT } from './genome';
import { maskCells } from './grid';
import { activeLoci } from './phenotype';
import type { World } from './world';

export interface HistorySample {
  readonly second: number;
  readonly count: readonly number[];
  readonly biomass: readonly number[];
  readonly births: readonly number[];
  readonly deaths: readonly number[];
  readonly oxygenMean: number;
  readonly nutrientTotal: number;
  readonly sugarTotal: number;
  readonly capacityLimited: boolean;
  readonly interventions: number;
  /** Detritus carbon over the dish (P2.8, schema 3). Absent on samples recorded by older builds. */
  readonly debrisTotal?: number;
  /**
   * P3.6: carbon moved along F02 transport links during this second (a minute summary: the sum of its
   * seconds). Present only on samples of a dish whose species form transport links; no schema change.
   */
  readonly fungalTransfer?: number;
}

/**
 * One regional trait sample. `rows` holds one row per region × species with living members there:
 * [region, species, count, locusMask, then (n, median, min, max) for each set bit of locusMask in
 * ascending locus order]. Bit l is set when at least one living member there has locus l active
 * (template loci, plus the dormancy locus for E03 carriers, as phenotype.activeLoci says).
 */
export interface TraitSample {
  readonly second: number;
  readonly rows: readonly (readonly number[])[];
}

export interface TraitHistory {
  /** 10-second samples of the last 30 simulated minutes. */
  recent: TraitSample[];
  /** One sample per compacted minute (the one at the whole minute), at most six hours. */
  minutes: TraitSample[];
  /** Older trait samples were compacted to one per minute (or dropped past six hours). */
  compacted: boolean;
  /**
   * Dish time (seconds) from which this dish records trait samples: 0 for a dish made at world schema 3
   * or later; for an older dish, the moment it was migrated (its earlier time has no trait samples).
   * Absent when not known (records written before this field existed): nothing is then claimed.
   */
  since?: number;
}

/**
 * A Notebook entry kept with its dish (SPEC §14.1; D-0027). The simulation stores and saves it and
 * never reads it; the fields beyond these are the UI's (src/ui/journal.ts).
 */
export interface DishJournalEntry {
  readonly id: string;
  readonly kind: string;
  readonly recordedAt: string;
  readonly [key: string]: unknown;
}

export interface History {
  readonly speciesCount: number;
  seconds: HistorySample[];
  minutes: HistorySample[];
  /** Accumulators for the current second. */
  pendingBirths: number[];
  pendingDeaths: number[];
  pendingInterventions: number;
  pendingCapacity: boolean;
  /** P3.6: carbon moved along F02 transport links so far this second (absent until the first transfer). */
  pendingFungalTransfer?: number;
  compacted: boolean;
  /** Regional trait samples (P2.8). */
  traits: TraitHistory;
  /** Journal entries that belong to this dish, newest first (P2.8). */
  journal: DishJournalEntry[];
}

/** An empty trait record; `since` is the dish second from which samples are recorded (omitted when unknown). */
export function createTraitHistory(since?: number): TraitHistory {
  return { recent: [], minutes: [], compacted: false, ...(since !== undefined ? { since } : {}) };
}

export function createHistory(speciesCount: number): History {
  return {
    speciesCount,
    seconds: [],
    minutes: [],
    pendingBirths: new Array<number>(speciesCount).fill(0),
    pendingDeaths: new Array<number>(speciesCount).fill(0),
    pendingInterventions: 0,
    pendingCapacity: false,
    compacted: false,
    // A new dish records trait samples from its start.
    traits: createTraitHistory(0),
    journal: [],
  };
}

function summarize(samples: readonly HistorySample[]): HistorySample {
  const n = samples.length;
  const last = samples[n - 1]!;
  const sp = last.count.length;
  const sum = (f: (s: HistorySample) => readonly number[], j: number) =>
    samples.reduce((a, s) => a + f(s)[j]!, 0);
  return {
    second: last.second,
    count: last.count,
    biomass: last.biomass,
    births: Array.from({ length: sp }, (_, j) => sum((s) => s.births, j)),
    deaths: Array.from({ length: sp }, (_, j) => sum((s) => s.deaths, j)),
    oxygenMean: samples.reduce((a, s) => a + s.oxygenMean, 0) / n,
    nutrientTotal: last.nutrientTotal,
    sugarTotal: last.sugarTotal,
    capacityLimited: samples.some((s) => s.capacityLimited),
    interventions: samples.reduce((a, s) => a + s.interventions, 0),
    // A stock: the end-of-minute value, when that sample recorded one.
    ...(last.debrisTotal !== undefined ? { debrisTotal: last.debrisTotal } : {}),
    // A flow: the minute's total over the seconds that recorded one.
    ...(samples.some((s) => s.fungalTransfer !== undefined)
      ? { fungalTransfer: samples.reduce((a, s) => a + (s.fungalTransfer ?? 0), 0) }
      : {}),
  };
}

/** Samples per one-minute summary. */
export const SECONDS_PER_SUMMARY = 60;

export function pushSample(h: History, s: HistorySample): void {
  h.seconds.push(s);
  // Compact only once a whole minute lies beyond the 30-minute window, so the most recent 30
  // simulated minutes are always at per-second resolution (1,800–1,859 samples retained).
  if (h.seconds.length >= HISTORY_SECONDS + SECONDS_PER_SUMMARY) {
    // Compact the oldest minute into a summary.
    const minute = h.seconds.splice(0, SECONDS_PER_SUMMARY);
    h.minutes.push(summarize(minute));
    if (h.minutes.length > HISTORY_MINUTES) h.minutes.splice(0, h.minutes.length - HISTORY_MINUTES);
    h.compacted = true;
  }
}

// ---------------------------------------------------------------------------------------------
// Debris total (P2.8; D-0028 follow-up)

/** Detritus carbon summed over the dish's playable cells (the History "Debris" series), or undefined without the field. */
export function debrisTotal(world: World): number | undefined {
  const det = world.fields.detritus;
  if (!det) return undefined;
  const cells = maskCells();
  let sum = 0;
  for (let k = 0; k < cells.length; k++) sum += det[cells[k]!]!;
  return sum;
}

// ---------------------------------------------------------------------------------------------
// Regional trait samples (P2.8; SPEC §12.4 "selected trait median/range per region")

/** One trait sample every 10 simulated seconds. */
export const TRAIT_SAMPLE_TICKS = 10 * TICKS_PER_SECOND;
export const TRAIT_SAMPLE_SECONDS = TRAIT_SAMPLE_TICKS / TICKS_PER_SECOND;
/** 10-second samples retained: the last 30 simulated minutes. */
export const TRAIT_RECENT_SAMPLES = HISTORY_SECONDS / TRAIT_SAMPLE_SECONDS;
/** 10-second samples per compacted minute. */
export const TRAIT_SAMPLES_PER_MINUTE = SECONDS_PER_SUMMARY / TRAIT_SAMPLE_SECONDS;
/** Minute samples retained: six hours. */
export const TRAIT_MINUTE_SAMPLES = HISTORY_MINUTES;

/**
 * Regions until P4.8 adds player regions: the whole dish, then its four quarters split at the dish
 * centre. The mask is centred between cells 63 and 64, so cells 0–63 are left/top and 64–127 are
 * right/bottom (continuous positions x < 64, y < 64); every quarter holds the same number of cells.
 */
export const TRAIT_REGIONS = ['dish', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const;
export type TraitRegion = (typeof TRAIT_REGIONS)[number];
export const TRAIT_SPLIT = 64;

/** The quarter (1–4 in TRAIT_REGIONS) holding continuous position (x, y). */
export function quarterOf(x: number, y: number): number {
  return (y < TRAIT_SPLIT ? 1 : 3) + (x < TRAIT_SPLIT ? 0 : 1);
}

function medianSorted(v: readonly number[]): number {
  const n = v.length;
  return n % 2 === 1 ? v[(n - 1) / 2]! : (v[n / 2 - 1]! + v[n / 2]!) / 2;
}

/** Read the living organisms now and build one regional trait sample (pure read of world state). */
export function buildTraitSample(world: World, second: number): TraitSample {
  const nSp = world.species.length;
  const nReg = TRAIT_REGIONS.length;
  const count = new Array<number>(nReg * nSp).fill(0);
  // values[(region * nSp + species) * LOCUS_COUNT + locus]
  const values: (number[] | undefined)[] = new Array<number[] | undefined>(nReg * nSp * LOCUS_COUNT);
  const actCache: (readonly boolean[] | undefined)[] = [];
  const e = world.ents;
  const c = e.cols;
  for (let i = 0; i < e.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const s = c.species[i]!;
    const gi = c.genome[i]!;
    const g = world.genomes.get(gi);
    const act = (actCache[gi] ??= activeLoci(world.species[s]!, g));
    const q = quarterOf(c.x[i]!, c.y[i]!);
    for (const r of [0, q]) {
      count[r * nSp + s]!++;
      const base = (r * nSp + s) * LOCUS_COUNT;
      for (let l = 0; l < LOCUS_COUNT; l++) if (act[l]) (values[base + l] ??= []).push(g.loci[l]!);
    }
  }
  const rows: number[][] = [];
  for (let r = 0; r < nReg; r++) {
    for (let s = 0; s < nSp; s++) {
      const n = count[r * nSp + s]!;
      if (n === 0) continue;
      let mask = 0;
      const stats: number[] = [];
      for (let l = 0; l < LOCUS_COUNT; l++) {
        const v = values[(r * nSp + s) * LOCUS_COUNT + l];
        if (!v || v.length === 0) continue;
        v.sort((a, b) => a - b);
        mask |= 1 << l;
        stats.push(v.length, medianSorted(v), v[0]!, v[v.length - 1]!);
      }
      rows.push([r, s, n, mask, ...stats]);
    }
  }
  return { second, rows };
}

export function pushTraitSample(t: TraitHistory, sample: TraitSample): void {
  t.recent.push(sample);
  // Same rule as the per-second window: compact a whole minute once it lies beyond the 30 minutes.
  if (t.recent.length >= TRAIT_RECENT_SAMPLES + TRAIT_SAMPLES_PER_MINUTE) {
    const minute = t.recent.splice(0, TRAIT_SAMPLES_PER_MINUTE);
    // Six consecutive 10-second samples always contain exactly one whole minute; keep that one.
    t.minutes.push(minute.find((m) => m.second % SECONDS_PER_SUMMARY === 0) ?? minute[minute.length - 1]!);
    if (t.minutes.length > TRAIT_MINUTE_SAMPLES) t.minutes.splice(0, t.minutes.length - TRAIT_MINUTE_SAMPLES);
    t.compacted = true;
  }
}

/** Stage 10 hook: record a trait sample when the tick being completed ends a 10-second step. */
export function recordTraitSample(world: World, nextTick: number): void {
  if (nextTick % TRAIT_SAMPLE_TICKS !== 0) return;
  pushTraitSample(world.history.traits, buildTraitSample(world, nextTick / TICKS_PER_SECOND));
}

/** One region's recorded statistics for one species and locus at one sample. */
export interface RegionStat {
  /** Living organisms of the species in the region. */
  readonly count: number;
  /** Of those, how many have the locus active (the trait values' sample size). */
  readonly n: number;
  readonly median: number | null;
  readonly min: number | null;
  readonly max: number | null;
}

export interface RegionalTraitPoint {
  readonly second: number;
  /** A compacted minute sample (older than the 10-second window). */
  readonly summary: boolean;
  /** TRAIT_REGIONS order. */
  readonly regions: readonly RegionStat[];
}

export interface RegionalTraitSeries {
  readonly species: number;
  readonly locus: number;
  /** Oldest first: compacted minute samples, then 10-second samples. */
  readonly points: readonly RegionalTraitPoint[];
  /** Older samples were thinned to one per minute, or dropped past six hours: the record is incomplete. */
  readonly compacted: boolean;
  /**
   * The recorded dish second from which this dish records trait samples (TraitHistory.since), or null
   * when not recorded. Never derived from the kept points: compaction thins and drops old samples.
   */
  readonly since: number | null;
}

function finiteRow(row: unknown): row is readonly number[] {
  return (
    Array.isArray(row) && row.length >= 4 && row.every((v) => typeof v === 'number' && Number.isFinite(v))
  );
}

function statOf(
  rows: readonly (readonly number[])[],
  region: number,
  species: number,
  locus: number,
): RegionStat {
  for (const row of rows) {
    if (!finiteRow(row) || row[0] !== region || row[1] !== species) continue;
    const count = row[2]!;
    const mask = row[3]!;
    if (!(mask & (1 << locus))) return { count, n: 0, median: null, min: null, max: null };
    let k = 4;
    for (let l = 0; l < locus; l++) if (mask & (1 << l)) k += 4;
    if (k + 3 >= row.length) return { count, n: 0, median: null, min: null, max: null };
    return { count, n: row[k]!, median: row[k + 1]!, min: row[k + 2]!, max: row[k + 3]! };
  }
  return { count: 0, n: 0, median: null, min: null, max: null };
}

/** The recorded per-region series of one species' locus (read from history only). */
export function regionalTraitSeries(h: History, species: number, locus: number): RegionalTraitSeries {
  const t = h.traits ?? createTraitHistory();
  const since = typeof t.since === 'number' && Number.isFinite(t.since) && t.since >= 0 ? t.since : null;
  const toPoint = (s: TraitSample, summary: boolean): RegionalTraitPoint => ({
    second: s.second,
    summary,
    regions: TRAIT_REGIONS.map((_, r) => statOf(Array.isArray(s.rows) ? s.rows : [], r, species, locus)),
  });
  const points = [...t.minutes.map((s) => toPoint(s, true)), ...t.recent.map((s) => toPoint(s, false))];
  return { species, locus, points, compacted: t.compacted, since };
}

/**
 * When the player changed the dish (SPEC §12.4 "Interventions marked on the timeline"), oldest first:
 * the second of every per-second sample that recorded an intervention, and, for compacted history,
 * the end of every one-minute summary that did (minute resolution). Read from history only.
 */
export function interventionSeconds(h: History): number[] {
  const out: number[] = [];
  for (const s of [...h.minutes, ...h.seconds]) if (s.interventions > 0) out.push(s.second);
  return out;
}

/** Loci with recorded values per species (any region, any sample), ascending; for the trait picker. */
export function traitAvailability(h: History, speciesCount: number): number[][] {
  const masks = new Array<number>(speciesCount).fill(0);
  const t = h.traits ?? createTraitHistory();
  for (const s of [...t.minutes, ...t.recent]) {
    for (const row of Array.isArray(s.rows) ? s.rows : []) {
      if (!finiteRow(row) || row[0] !== 0) continue;
      const sp = row[1]!;
      if (sp >= 0 && sp < speciesCount) masks[sp]! |= row[3]!;
    }
  }
  return masks.map((m) => Array.from({ length: LOCUS_COUNT }, (_, l) => l).filter((l) => m & (1 << l)));
}

// ---------------------------------------------------------------------------------------------
// The dish's journal (P2.8; SPEC §14.1; D-0027)

/** Entries kept with one dish (the Notebook's own limit). */
export const DISH_JOURNAL_MAX = 200;
/** Bytes of JSON per entry at most (a stamp with its measures is about 3 KB). */
export const DISH_JOURNAL_ENTRY_MAX_BYTES = 16_384;
/** Characters (code points) per "I saw …" / "… coincide with …" part of an observation. */
export const JOURNAL_OBSERVATION_MAX = 120;
/**
 * Characters of the dish (world) id an entry names. Ids grow by about 20 characters each time a dish is
 * copied (Duplicate, a comparison's copies); a checkpoint branch does not nest (branchWorldId). The
 * bound leaves room for about 200 nested copies (fix round 2: at 400, 21 nested branches made every
 * note about the dish unreadable).
 */
export const JOURNAL_WORLD_ID_MAX = 4000;
const JOURNAL_KINDS = ['experimentStamp', 'observation'];

/** Wall-clock time as the Journal writes it (Date.toISOString(), milliseconds optional). */
const ISO_TIME = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?Z$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** Plain text of at most `max` characters (code points, as the Journal cleans them). */
function isText(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.length <= 2 * max && Array.from(v).length <= max;
}
const isTextOrNull = (v: unknown, max: number): boolean => v === null || isText(v, max);
const isNumberOrNull = (v: unknown): boolean => v === null || isFiniteNumber(v);

/** Whether a stored or imported value is a wall-clock time the Journal wrote (ISO, UTC). */
export function isJournalTime(v: unknown): v is string {
  return typeof v === 'string' && ISO_TIME.test(v);
}

function stampProblem(r: Record<string, unknown>): string | null {
  for (const k of ['experimentId', 'title', 'journalStamp', 'label', 'contentHash', 'dishName'])
    if (!isText(r[k], 400)) return `its ${k} is not text`;
  if (!isTextOrNull(r.recipeId, 400)) return 'its recipeId is not text';
  if (!isText(r.prediction, 4000)) return 'its prediction is not text';
  if (r.conclusion !== undefined && !isText(r.conclusion, 100)) return 'its conclusion is not text';
  for (const k of ['reachedAtSecond', 'seed', 'recipeRevision', 'contentVersion'])
    if (!isFiniteNumber(r[k])) return `its ${k} is not a number`;
  if (!Array.isArray(r.labels) || r.labels.length > 50 || !r.labels.every((l) => isText(l, 400)))
    return 'its labels are malformed';
  if (
    !Array.isArray(r.gate) ||
    r.gate.length > 50 ||
    !r.gate.every((g) => isRecord(g) && isText(g.text, 1000) && isText(g.value, 400))
  )
    return 'its gate is malformed';
  if (
    !Array.isArray(r.measures) ||
    r.measures.length > 100 ||
    !r.measures.every(
      (m) =>
        isRecord(m) &&
        isText(m.id, 200) &&
        isText(m.label, 400) &&
        isText(m.a, 400) &&
        isTextOrNull(m.b, 400) &&
        isTextOrNull(m.diff, 400) &&
        // A measured NaN is written as null by JSON; such a cell reads "—".
        isNumberOrNull(m.rawA) &&
        isNumberOrNull(m.rawB),
    )
  )
    return 'its measures are malformed';
  return null;
}

function linkProblem(v: unknown): string | null {
  if (v === null) return null;
  if (!isRecord(v)) return 'its link is malformed';
  if (v.kind === 'stamp')
    return isText(v.id, 200) && isText(v.title, 400) && isText(v.journalStamp, 400) ? null : 'its link is malformed';
  if (v.kind === 'compare')
    return isText(v.savedAt, 40) && isText(v.change, 400) && isText(v.dishName, 400) && isText(v.label, 400)
      ? null
      : 'its link is malformed';
  return 'its link is of an unknown kind';
}

function observationProblem(r: Record<string, unknown>): string | null {
  const M = JOURNAL_OBSERVATION_MAX;
  if (!isText(r.saw, M) || r.saw.trim() === '') return 'its "I saw" part is not text';
  if (!isText(r.coincidedWith, M) || r.coincidedWith.trim() === '') return 'its "coincide with" part is not text';
  const d = r.dish;
  if (
    d !== null &&
    !(
      isRecord(d) &&
      isText(d.name, 200) &&
      isFiniteNumber(d.second) &&
      d.second >= 0 &&
      isTextOrNull(d.recipeId, 400) &&
      isFiniteNumber(d.seed)
    )
  )
    return 'its dish is malformed';
  return linkProblem(r.link);
}

/**
 * Why a value is not a journal entry this build can keep and show, or null when it is one. Every field
 * the Notebook reads is checked (SPEC §14.3 "malformed ⇒ clear message and no change"): a file can carry
 * a recomputed checksum, so the checksum alone never vouches for an entry. The UI's isJournalEntry
 * (src/ui/journal.ts) uses the same rules, so what a dish keeps is exactly what the Notebook can list.
 */
export function journalRecordProblem(raw: unknown): string | null {
  if (!isRecord(raw)) return 'it is not a record';
  if (raw.version !== 1) return 'its version is unknown';
  if (!isText(raw.id, 200) || raw.id.length === 0) return 'its id is malformed';
  if (typeof raw.kind !== 'string' || !JOURNAL_KINDS.includes(raw.kind)) return 'its kind is unknown';
  if (!isJournalTime(raw.recordedAt)) return 'its recorded time is malformed';
  if (raw.worldId !== undefined && !isText(raw.worldId, JOURNAL_WORLD_ID_MAX)) return 'its dish id is malformed';
  const p = raw.kind === 'experimentStamp' ? stampProblem(raw) : observationProblem(raw);
  if (p) return p;
  let text: string;
  try {
    text = JSON.stringify(raw);
  } catch {
    return 'it is not plain data';
  }
  if (text.length > DISH_JOURNAL_ENTRY_MAX_BYTES) return 'it is too large';
  return null;
}

/** The entry if it is a well-formed journal record (every read field checked, bounded size), else null. */
export function sanitizeJournalEntry(raw: unknown): DishJournalEntry | null {
  if (journalRecordProblem(raw) !== null) return null;
  return JSON.parse(JSON.stringify(raw)) as DishJournalEntry;
}

/** Add or replace (by id) one entry, newest first, keeping at most DISH_JOURNAL_MAX. False when refused. */
export function putJournalEntry(h: History, raw: unknown): boolean {
  const entry = sanitizeJournalEntry(raw);
  if (!entry) return false;
  const list = Array.isArray(h.journal) ? h.journal : [];
  const k = list.findIndex((e) => e.id === entry.id);
  h.journal =
    k >= 0 ? list.map((e, i) => (i === k ? entry : e)) : [entry, ...list].slice(0, DISH_JOURNAL_MAX);
  return true;
}

/** Why a loaded dish's journal cannot be kept (the first malformed entry, or too many), or null. */
export function journalProblem(list: unknown): string | null {
  if (list === undefined) return null;
  if (!Array.isArray(list)) return 'the journal is not a list';
  if (list.length > DISH_JOURNAL_MAX) return `it holds more than ${DISH_JOURNAL_MAX} entries`;
  for (let k = 0; k < list.length; k++) {
    const p = journalRecordProblem(list[k]);
    if (p) return `entry ${k + 1}: ${p}`;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Loaded history (P2.8): what the History charts, tables and the regional trait view read

function sampleProblem(s: unknown, speciesCount: number): string | null {
  if (!isRecord(s)) return 'is not a record';
  if (!isFiniteNumber(s.second)) return 'has no valid time';
  for (const k of ['count', 'biomass', 'births', 'deaths']) {
    const v = s[k];
    if (!Array.isArray(v) || v.length > speciesCount || !v.every(isFiniteNumber)) return `has a malformed ${k}`;
  }
  for (const k of ['oxygenMean', 'nutrientTotal', 'sugarTotal', 'interventions'])
    if (!isFiniteNumber(s[k])) return `has a non-numeric ${k}`;
  if (typeof s.capacityLimited !== 'boolean') return 'has a malformed capacity flag';
  if (s.debrisTotal !== undefined && !isFiniteNumber(s.debrisTotal)) return 'has a non-numeric debrisTotal';
  if (s.fungalTransfer !== undefined && !(isFiniteNumber(s.fungalTransfer) && s.fungalTransfer >= 0))
    return 'has a malformed fungalTransfer';
  return null;
}

function traitSampleProblem(s: unknown): string | null {
  if (!isRecord(s) || !isFiniteNumber(s.second) || !Array.isArray(s.rows)) return 'is malformed';
  for (const row of s.rows)
    if (!Array.isArray(row) || row.length < 4 || row.length > 4 + 4 * LOCUS_COUNT || !row.every(isFiniteNumber))
      return 'has a malformed row';
  return null;
}

/**
 * Why a loaded dish's recorded history cannot be shown (the first malformed value), or null. Checks
 * every value the History charts and tables read: per-second samples and minute summaries (including
 * the debris total), the accumulators of the current second and the regional trait samples. Applied
 * after migration, so older saves are checked in their current shape.
 */
export function historyProblem(raw: unknown, speciesCount: number): string | null {
  if (!isRecord(raw)) return 'the history is missing';
  for (const list of ['seconds', 'minutes'] as const) {
    const v = raw[list];
    if (!Array.isArray(v)) return `the ${list} list is missing`;
    for (let k = 0; k < v.length; k++) {
      const p = sampleProblem(v[k], speciesCount);
      if (p) return `${list === 'seconds' ? 'per-second sample' : 'minute summary'} ${k + 1} ${p}`;
    }
  }
  for (const k of ['pendingBirths', 'pendingDeaths']) {
    const v = raw[k];
    if (!Array.isArray(v) || v.length !== speciesCount || !v.every(isFiniteNumber)) return `${k} is malformed`;
  }
  if (!isFiniteNumber(raw.pendingInterventions)) return 'pendingInterventions is not a number';
  if (typeof raw.pendingCapacity !== 'boolean' || typeof raw.compacted !== 'boolean') return 'a history flag is malformed';
  if (raw.pendingFungalTransfer !== undefined && !(isFiniteNumber(raw.pendingFungalTransfer) && raw.pendingFungalTransfer >= 0))
    return 'pendingFungalTransfer is malformed';
  const t = raw.traits;
  if (t !== undefined) {
    if (!isRecord(t) || !Array.isArray(t.recent) || !Array.isArray(t.minutes) || typeof t.compacted !== 'boolean')
      return 'the trait record is malformed';
    if (t.since !== undefined && !(isFiniteNumber(t.since) && t.since >= 0)) return 'the trait record start is malformed';
    for (const list of ['recent', 'minutes'] as const) {
      const v = t[list] as unknown[];
      for (let k = 0; k < v.length; k++) {
        const p = traitSampleProblem(v[k]);
        if (p) return `trait sample ${k + 1} ${p}`;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Saved shape (world schema 3)

/**
 * World schema 3 (P2.8): history gains `traits` and `journal`; per-second samples may carry
 * `debrisTotal`. An older history is copied with an empty trait record and an empty journal (the
 * explicit defaults: nothing of either was ever recorded); its samples keep no debris value. The trait
 * record states the dish second it starts at (the migrated world's tick), so the charts can say that
 * the earlier time has no trait samples.
 */
export function historyForSchema3(h: History, tick: number): History {
  const old = h as Partial<History>;
  return {
    ...h,
    traits: old.traits ?? createTraitHistory(tick / TICKS_PER_SECOND),
    journal: old.journal ?? [],
  };
}

/**
 * After loading: keep only well-formed journal entries and trait records (a file whose checksum
 * matched can still come from a faulty writer; these records are display data and never refuse a load).
 */
export function sanitizeHistoryRecords(h: History): void {
  const t = h.traits as Partial<TraitHistory> | undefined;
  const samples = (list: unknown): TraitSample[] =>
    Array.isArray(list) ? list.filter((s): s is TraitSample => traitSampleProblem(s) === null) : [];
  // No written history holds more than the windows allow; a longer list is cut to its newest samples.
  const recent = samples(t?.recent);
  const minutes = samples(t?.minutes);
  const cutRecent = Math.max(0, recent.length - (TRAIT_RECENT_SAMPLES + TRAIT_SAMPLES_PER_MINUTE - 1));
  const cutMinutes = Math.max(0, minutes.length - TRAIT_MINUTE_SAMPLES);
  const since = t?.since;
  h.traits = {
    recent: recent.slice(cutRecent),
    minutes: minutes.slice(cutMinutes),
    // Dropped samples are history that is no longer complete (SPEC §12.4 "labelled incomplete").
    compacted: t?.compacted === true || cutRecent > 0 || cutMinutes > 0,
    ...(typeof since === 'number' && Number.isFinite(since) && since >= 0 ? { since } : {}),
  };
  const journal: DishJournalEntry[] = [];
  for (const e of Array.isArray(h.journal) ? h.journal : []) {
    const ok = sanitizeJournalEntry(e);
    if (ok && !journal.some((x) => x.id === ok.id)) journal.push(ok);
  }
  h.journal = journal.slice(0, DISH_JOURNAL_MAX);
}
