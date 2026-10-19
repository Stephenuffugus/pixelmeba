/**
 * The succession notebook, the notebook kind 'succession' (P5.6 part 3; SPEC §12.8 "succession notebook
 * (Phase 5: one‑minute templated summaries tied to event IDs, provenance‑aware wording)"; D02 §23; D-0070
 * "Notebook state is not world state"; D-0131).
 *
 * One entry per whole simulated minute of a played dish, written by the worker's detector
 * (src/worker/succession.ts) and kept in the per-dish notebook record next to the world save: never in the
 * world state, its checksum or its stateHash, and never read by src/sim. An entry is DATA, never prose: the
 * Notebook renders its sentences from the line kinds and values (src/ui/strings/succession.ts).
 *
 * - `id` 'succ-<minute>', `minute` ≥ 1, `fromTick` = (minute − 1) · 600, `toTick` = minute · 600;
 *   `watchedFromTick` only when the detector started after fromTick (a load, an Undo or a dish opened
 *   mid-minute): its feeding, death-cause and recovery lines then cover watchedFromTick … toTick only.
 * - At most SUCCESSION_LINES_MAX lines, each with 1 … SUCCESSION_EVIDENCE_MAX evidence ids:
 *   - 'gain' / 'loss': a species' living biomass change between the history samples at the minute's bounds
 *     (value: carbon, > 0, rounded to 0.01); a loss may carry `deaths` { reason name: count } from recorded
 *     death records only;
 *   - 'newFeeding': a feeding link first seen in this dish (against every earlier entry of this notebook):
 *     consumer × `pool` (with `enzyme` when that pool's enzyme converted carbon in the minute, `producer`
 *     only when snapshot.ts producersNear credited one, D-0051, and `value` only when the carbon taken from
 *     the pool is attributable to this species alone), or predator × `prey` from a 'capture' record;
 *   - 'extinction': no living member of the species at the dish second its evidence 'history:<second>'
 *     names (with the species' last death record when the event ring held it);
 *   - 'recovery': `value` organisms of the species woke from rest ('wake' records).
 * - Evidence grammar (the stories' D-0077 forms where they exist): 'event:<id>', 'history:<second>',
 *   'reaction:<enzyme>:<second>:<cell>', 'intake:<second>:<speciesId>:<pool>'.
 *
 * `successionProblem` validates the kind (notebook.ts KIND_PROBLEMS); `successionRefsProblem` checks it
 * against the dish the file carries (its species, tick and next event id). Any problem drops the whole
 * notebook with a message and the world still loads (D-0073).
 */
import { CELL_COUNT, TICKS_PER_SECOND } from '@sim/constants';
import { REASONS } from '@sim/reasons';
import type { HistorySample } from '@sim/history';
import type { SimEvent } from '@sim/events';

/** Ticks per entry: one simulated minute. */
export const SUCCESSION_MINUTE_TICKS = 60 * TICKS_PER_SECOND;
/**
 * Entries kept per dish, oldest removed first (D-0131: from 360, the history's six-hour minute horizon, lowered
 * until the D-0090 tripwire holds; tests/persistence/bookmarks.test.ts "every kind at its limit"). Measured
 * 2026-10-18: 360 entries of 12 lines with 5 evidence ids each add 1,601,641 UTF-16 units (4,449 per entry), and
 * every other kind at its limit already holds 1,285,282 of the 2 MiB cap (61.3 %), so at most 41 entries keep
 * the generator's record under 70 %. Fix round 1 (2026-10-19): the seen-links kind at SUCCESSION_SEEN_MAX adds
 * 16,385 units, so at most 37 entries keep it under 70 %: 36, i.e. 36 minutes of dish time.
 */
export const SUCCESSION_MAX = 36;
export const SUCCESSION_LINES_MAX = 12;
export const SUCCESSION_EVIDENCE_MAX = 5;
/** Lines of each ranked kind: the three largest gains and the three largest losses. */
export const SUCCESSION_RANKED = 3;

export const SUCCESSION_LINE_KINDS = ['gain', 'loss', 'newFeeding', 'extinction', 'recovery'] as const;
export type SuccessionLineKind = (typeof SUCCESSION_LINE_KINDS)[number];

/** The pools a feeding line may name (relationships.ts FOOD_POOLS). */
export const SUCCESSION_POOLS = ['sugar', 'starch', 'oil', 'protein', 'broth', 'detritus', 'metabolite', 'film', 'co2'] as const;
export type SuccessionPool = (typeof SUCCESSION_POOLS)[number];
export const SUCCESSION_ENZYMES = ['starch', 'oil', 'protein'] as const;
export type SuccessionEnzyme = (typeof SUCCESSION_ENZYMES)[number];
/** The pool each enzyme makes (reactions.ts: starch → sugar, oil → metabolite, protein → broth). */
export const ENZYME_PRODUCT: Readonly<Record<SuccessionEnzyme, SuccessionPool>> = { starch: 'sugar', oil: 'metabolite', protein: 'broth' };
/** The recorded death causes a loss line may count (reason names). */
export const SUCCESSION_DEATH_CAUSES: readonly string[] = REASONS.filter((r) => r.startsWith('DEATH_'));

export interface SuccessionLine {
  readonly kind: SuccessionLineKind;
  readonly species: string;
  /** Carbon (gain, loss, newFeeding) or a count (recovery), rounded to 0.01. */
  readonly value?: number;
  readonly pool?: SuccessionPool;
  readonly prey?: string;
  readonly enzyme?: SuccessionEnzyme;
  /** A species id, only when producersNear credited it (D-0051). */
  readonly producer?: string;
  /** Recorded death causes in the watched part of the minute (reason name → count). */
  readonly deaths?: Readonly<Record<string, number>>;
  readonly evidence: readonly string[];
}

export interface SuccessionEntry {
  readonly id: string;
  readonly minute: number;
  readonly fromTick: number;
  readonly toTick: number;
  readonly watchedFromTick?: number;
  readonly lines: readonly SuccessionLine[];
}

export const SUCCESSION_EVIDENCE = {
  event: /^event:(0|[1-9][0-9]{0,11})$/,
  history: /^history:([1-9][0-9]{0,9})$/,
  reaction: /^reaction:(starch|oil|protein):(0|[1-9][0-9]{0,9}):(0|[1-9][0-9]{0,5})$/,
  intake: /^intake:(0|[1-9][0-9]{0,9}):([A-Z][A-Z0-9_]{0,31}):([a-z0-9]{1,24})$/,
} as const;
export type SuccessionEvidenceKind = keyof typeof SUCCESSION_EVIDENCE;

/** The kind and numbers of one evidence id, or null when it is not one. */
export function parseSuccessionEvidence(id: unknown): { kind: SuccessionEvidenceKind; parts: string[] } | null {
  if (typeof id !== 'string') return null;
  for (const k of Object.keys(SUCCESSION_EVIDENCE) as SuccessionEvidenceKind[]) {
    const m = SUCCESSION_EVIDENCE[k].exec(id);
    if (m) return { kind: k, parts: m.slice(1) };
  }
  return null;
}

/** The second an extinction line's first evidence names (its 'history:<second>'), or null. */
export function extinctionSecond(line: Pick<SuccessionLine, 'evidence'>): number | null {
  const e = parseSuccessionEvidence(line.evidence[0]);
  return e && e.kind === 'history' ? Number(e.parts[0]) : null;
}

const isInt = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const includes = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const SPECIES_RE = /^[A-Z][A-Z0-9_]{0,31}$/;
const ENTRY_KEYS = ['id', 'minute', 'fromTick', 'toTick', 'watchedFromTick', 'lines'];
const LINE_KEYS = ['kind', 'species', 'value', 'pool', 'prey', 'enzyme', 'producer', 'deaths', 'evidence'];
/** A value as written: finite, ≥ 0, at most two decimals (rounded to 0.01 by the writer). */
const valueOk = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1e9 && Math.round(v * 100) / 100 === v;

/** The entry id of a minute. */
export function successionId(minute: number): string {
  return `succ-${minute}`;
}

/** The evidence second range of an entry: [from / 10, to / 10]. */
function secondsOf(e: Pick<SuccessionEntry, 'fromTick' | 'toTick'>): [number, number] {
  return [e.fromTick / TICKS_PER_SECOND, e.toTick / TICKS_PER_SECOND];
}

/** The first problem with one line of entry `e`, or null. */
function lineProblem(raw: unknown, e: SuccessionEntry): string | null {
  if (!isObj(raw)) return 'a succession line is not an object';
  for (const k of Object.keys(raw)) if (!LINE_KEYS.includes(k)) return `a succession line has an unknown field "${k.slice(0, 40)}"`;
  if (!includes(SUCCESSION_LINE_KINDS, raw.kind)) return 'a succession line has an unknown kind';
  const kind = raw.kind;
  if (typeof raw.species !== 'string' || !SPECIES_RE.test(raw.species)) return 'a succession line has an invalid species';
  if (raw.value !== undefined && !valueOk(raw.value)) return 'a succession line has an invalid value';
  const needsValue = kind === 'gain' || kind === 'loss' || kind === 'recovery';
  if (needsValue && (raw.value === undefined || !(raw.value > 0))) return 'a succession line has no measured value';
  if (kind === 'recovery' && !Number.isInteger(raw.value)) return 'a recovery line counts whole organisms';
  if (kind === 'extinction' && raw.value !== undefined) return 'an extinction line carries no value';
  // The fields each kind may carry.
  const allowed: Readonly<Record<SuccessionLineKind, readonly string[]>> = {
    gain: [],
    loss: ['deaths'],
    newFeeding: ['pool', 'prey', 'enzyme', 'producer'],
    extinction: [],
    recovery: [],
  };
  for (const k of ['pool', 'prey', 'enzyme', 'producer', 'deaths']) if (raw[k] !== undefined && !allowed[kind].includes(k)) return `a ${kind} line has no field "${k}"`;
  if (kind === 'newFeeding') {
    if ((raw.pool === undefined) === (raw.prey === undefined)) return 'a feeding line names a pool or a prey';
    if (raw.pool !== undefined && !includes(SUCCESSION_POOLS, raw.pool)) return 'a feeding line names an unknown pool';
    if (raw.prey !== undefined && (typeof raw.prey !== 'string' || !SPECIES_RE.test(raw.prey))) return 'a feeding line names an invalid prey';
    if (raw.enzyme !== undefined) {
      if (!includes(SUCCESSION_ENZYMES, raw.enzyme)) return 'a feeding line names an unknown enzyme';
      if (raw.pool !== ENZYME_PRODUCT[raw.enzyme]) return 'a feeding line names an enzyme that does not make its pool';
    }
    if (raw.producer !== undefined && (raw.enzyme === undefined || typeof raw.producer !== 'string' || !SPECIES_RE.test(raw.producer))) return 'a feeding line names a producer without its enzyme';
    if (raw.prey !== undefined && raw.value !== undefined) return 'a catching line carries no value';
  }
  if (raw.deaths !== undefined) {
    const d = raw.deaths;
    if (!isObj(d) || Object.keys(d).length === 0) return 'a loss line has invalid death causes';
    for (const [cause, n] of Object.entries(d)) if (!SUCCESSION_DEATH_CAUSES.includes(cause) || !isInt(n, 1)) return 'a loss line has an invalid death cause';
  }
  const ev = raw.evidence;
  if (!Array.isArray(ev) || ev.length === 0) return 'a succession line has no evidence';
  if (ev.length > SUCCESSION_EVIDENCE_MAX) return 'a succession line has too much evidence';
  if (new Set(ev).size !== ev.length) return 'a succession line repeats an evidence id';
  const [s0, s1] = secondsOf(e);
  for (const id of ev as unknown[]) {
    const p = parseSuccessionEvidence(id);
    if (p === null) return 'a succession line has an invalid evidence id';
    if (p.kind === 'history' || p.kind === 'intake' || p.kind === 'reaction') {
      const second = Number(p.kind === 'reaction' ? p.parts[1] : p.parts[0]);
      // A sample second closes a second (≥ 1); a reaction or intake second is the second that ran (from 0).
      const lo = p.kind === 'history' ? Math.max(1, s0) : s0;
      if (second < lo || second > s1) return 'a succession line names evidence outside its minute';
    }
    if (p.kind === 'reaction' && Number(p.parts[2]) >= CELL_COUNT) return 'a succession line names a cell the dish does not have';
    if (p.kind === 'intake' && !includes(SUCCESSION_POOLS, p.parts[2])) return 'a succession line names an unknown pool';
  }
  if (kind === 'extinction' && extinctionSecond(raw as unknown as SuccessionLine) === null) return 'an extinction line needs the history second it names';
  return null;
}

/** The first problem with one entry, or null. */
function entryProblem(raw: unknown): string | null {
  if (!isObj(raw)) return 'a succession entry is not an object';
  for (const k of Object.keys(raw)) if (!ENTRY_KEYS.includes(k)) return `a succession entry has an unknown field "${k.slice(0, 40)}"`;
  if (!isInt(raw.minute, 1) || raw.minute > 1e8) return 'a succession entry has an invalid minute';
  if (raw.id !== successionId(raw.minute)) return 'a succession entry has an invalid id';
  if (raw.fromTick !== (raw.minute - 1) * SUCCESSION_MINUTE_TICKS || raw.toTick !== raw.minute * SUCCESSION_MINUTE_TICKS) return 'a succession entry is outside its minute';
  if (raw.watchedFromTick !== undefined && !(isInt(raw.watchedFromTick, 0) && raw.watchedFromTick > raw.fromTick && raw.watchedFromTick < raw.toTick)) return 'a succession entry has an invalid watched time';
  if (!Array.isArray(raw.lines) || raw.lines.length > SUCCESSION_LINES_MAX) return 'a succession entry has an invalid line list';
  for (const l of raw.lines as unknown[]) {
    const p = lineProblem(l, raw as unknown as SuccessionEntry);
    if (p) return p;
  }
  return null;
}

/** The first problem with the succession kind, or null (notebook.ts KIND_PROBLEMS.succession; a missing key reads as []). */
export function successionProblem(raw: unknown): string | null {
  if (!Array.isArray(raw)) return 'succession is not a list';
  if (raw.length > SUCCESSION_MAX) return 'too many succession entries';
  let last = 0;
  for (const e of raw as unknown[]) {
    const p = entryProblem(e);
    if (p) return p;
    const m = (e as SuccessionEntry).minute;
    if (m <= last) return 'succession entries are out of order';
    last = m;
  }
  return null;
}

/** What the kind is checked against: the dish the file carries (plain values). */
export interface SuccessionWorldRefs {
  readonly speciesIds: readonly string[];
  readonly tick: number;
  /** world.counters.nextEventId (absent: event ids are not checked). */
  readonly nextEventId?: number;
  /**
   * Fix round 1: the dish's per-second history samples (world.history.seconds; absent: not checked). A 'history'
   * id the samples still cover must be a sample; a gain or loss whose two bound samples are kept must equal
   * their difference; an extinction must be a count that reached 0 at its second.
   */
  readonly historySeconds?: readonly Pick<HistorySample, 'second' | 'count' | 'biomass'>[];
  /** Fix round 1: the dish's event ring (absent: not checked). An 'event' id the ring holds must lie in its entry's minute. */
  readonly eventRing?: readonly Pick<SimEvent, 'id' | 'tick'>[];
}

/**
 * The first entry naming a species, a time or an event the dish never had, or null: no entry ends after the
 * dish's tick, every species (consumer, prey, producer) and intake evidence species is the dish's, and every
 * event id is below its next event id.
 */
export function successionRefsProblem(raw: unknown, refs: SuccessionWorldRefs): string | null {
  const list = (Array.isArray(raw) ? raw : []) as readonly SuccessionEntry[];
  const samples = refs.historySeconds;
  const sampleAt = (second: number) => samples?.find((x) => x.second === second);
  // The seconds the samples cover (contiguous: a sample per closed second since the oldest one kept).
  const covered = (second: number) => samples !== undefined && samples.length > 0 && second >= samples[0]!.second && second <= samples[samples.length - 1]!.second;
  const ring = refs.eventRing;
  for (const e of list) {
    if (e.toTick > refs.tick) return 'a succession entry records a time after the dish’s time';
    for (const l of e.lines) {
      const sp = [l.species, ...(l.prey !== undefined ? [l.prey] : []), ...(l.producer !== undefined ? [l.producer] : [])];
      for (const id of l.evidence) {
        const p = parseSuccessionEvidence(id)!;
        if (p.kind === 'intake') sp.push(p.parts[1]!);
        if (p.kind === 'event') {
          const n = Number(p.parts[0]);
          if (refs.nextEventId !== undefined && n >= refs.nextEventId) return 'a succession entry names an event this dish never had';
          const ev = ring?.find((x) => x.id === n);
          if (ev !== undefined && (ev.tick < e.fromTick || ev.tick > e.toTick)) return 'a succession entry names an event outside its minute';
        }
        if (p.kind === 'history' && covered(Number(p.parts[0])) && sampleAt(Number(p.parts[0])) === undefined) return 'a succession entry names a sample this dish never had';
      }
      if (sp.some((s) => !refs.speciesIds.includes(s))) return 'a succession entry names a species this dish does not have';
      const s = refs.speciesIds.indexOf(l.species);
      if ((l.kind === 'gain' || l.kind === 'loss') && samples !== undefined) {
        // The writer's two bounds: 'history:<lo>' and 'history:<hi>' (the first two evidence ids).
        const [lo, hi] = l.evidence.slice(0, 2).map((x) => parseSuccessionEvidence(x)!);
        if (lo?.kind !== 'history' || hi?.kind !== 'history') return 'a succession gain or loss needs the two samples it compares';
        const a = sampleAt(Number(lo.parts[0]));
        const b = sampleAt(Number(hi.parts[0]));
        if (a !== undefined && b !== undefined) {
          const d = Math.round(((b.biomass[s] ?? 0) - (a.biomass[s] ?? 0)) * 100) / 100;
          if (Math.abs((l.kind === 'gain' ? d : -d) - l.value!) > 0.011) return 'a succession entry records a biomass change this dish never had';
        }
      }
      if (l.kind === 'extinction' && samples !== undefined) {
        const second = extinctionSecond(l)!;
        const now = sampleAt(second);
        const before = sampleAt(second - 1);
        if (now !== undefined && before !== undefined && !((before.count[s] ?? 0) > 0 && (now.count[s] ?? 0) === 0)) return 'a succession entry records an extinction this dish never had';
      }
    }
  }
  return null;
}

/** The dish's succession entries (an absent kind reads as []). */
export function successionOf(record: { readonly succession?: readonly SuccessionEntry[] }): readonly SuccessionEntry[] {
  return record.succession ?? [];
}

/** The list with `entry` added in minute order (an entry of the same minute is replaced), oldest removed beyond SUCCESSION_MAX. */
export function addSuccessionEntry(list: readonly SuccessionEntry[], entry: SuccessionEntry): SuccessionEntry[] {
  const out = list.filter((e) => e.minute !== entry.minute);
  out.push(entry);
  out.sort((a, b) => a.minute - b.minute);
  while (out.length > SUCCESSION_MAX) out.shift();
  return out;
}

/** The key of a feeding link ('pool:B01:sugar' or 'prey:P01:B01'), for "first seen". */
export function feedingKey(l: Pick<SuccessionLine, 'species' | 'pool' | 'prey'>): string {
  return l.pool !== undefined ? `pool:${l.species}:${l.pool}` : `prey:${l.species}:${l.prey ?? ''}`;
}

/** Every feeding link the entries recorded. */
export function feedingKeysOf(list: readonly SuccessionEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of list) for (const l of e.lines) if (l.kind === 'newFeeding') out.add(feedingKey(l));
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Fix round 1: the links already seen in this dish, the notebook kind 'successionSeen'.
//
// "First seen in this dish" must hold after a reload although SUCCESSION_MAX removes the oldest entries and the
// SUCCESSION_LINES_MAX cap leaves lines out of a busy minute: every link the detector saw is kept here with the
// minute whose entry first saw it ([key, minute], in minute order), whether or not its line was kept. A link the
// list has no room for (SUCCESSION_SEEN_MAX) is not written as a line either, so no link is ever announced twice.
// Undo or a rollback drops the links of the minutes after the restored tick, with their entries.

/** Links kept per dish (pool links are species × 9 pools, catching links predator × prey: far below this in a dish). */
export const SUCCESSION_SEEN_MAX = 512;
/** One seen link: its feedingKey and the minute of the entry that first saw it. */
export type SuccessionSeenLink = readonly [string, number];
const SEEN_KEY = /^(pool:([A-Z][A-Z0-9_]{0,31}):([a-z0-9]{1,24})|prey:([A-Z][A-Z0-9_]{0,31}):([A-Z][A-Z0-9_]{0,31}))$/;

/** The species a seen key names (consumer, and prey for a catching link), or null when it is not a key. */
function seenKeySpecies(key: string): string[] | null {
  const m = SEEN_KEY.exec(key);
  if (!m) return null;
  if (m[2] !== undefined) return includes(SUCCESSION_POOLS, m[3]) ? [m[2]] : null;
  return [m[4]!, m[5]!];
}

/** The first problem with the successionSeen kind, or null (notebook.ts KIND_PROBLEMS; a missing key reads as []). */
export function successionSeenProblem(raw: unknown): string | null {
  if (!Array.isArray(raw)) return 'successionSeen is not a list';
  if (raw.length > SUCCESSION_SEEN_MAX) return 'too many seen feeding links';
  const keys = new Set<string>();
  let last = 1;
  for (const x of raw as unknown[]) {
    if (!Array.isArray(x) || x.length !== 2 || typeof x[0] !== 'string' || seenKeySpecies(x[0]) === null) return 'a seen feeding link is invalid';
    if (!isInt(x[1], 1) || x[1] > 1e8) return 'a seen feeding link has an invalid minute';
    if (x[1] < last) return 'seen feeding links are out of order';
    last = x[1];
    if (keys.has(x[0])) return 'a feeding link is seen twice';
    keys.add(x[0]);
  }
  return null;
}

/** The first seen link naming a species or a minute the dish never had, or null. */
export function successionSeenRefsProblem(raw: unknown, refs: Pick<SuccessionWorldRefs, 'speciesIds' | 'tick'>): string | null {
  for (const [key, minute] of (Array.isArray(raw) ? raw : []) as readonly SuccessionSeenLink[]) {
    if (minute * SUCCESSION_MINUTE_TICKS > refs.tick) return 'a seen feeding link records a time after the dish’s time';
    if (seenKeySpecies(key)!.some((s) => !refs.speciesIds.includes(s))) return 'a seen feeding link names a species this dish does not have';
  }
  return null;
}

/** The dish's seen links (an absent kind reads as []). */
export function successionSeenOf(record: { readonly successionSeen?: readonly SuccessionSeenLink[] }): readonly SuccessionSeenLink[] {
  return record.successionSeen ?? [];
}

/** Every link this dish's notebook has seen: the kept entries' feeding lines and the seen list. */
export function seenKeysOf(record: { readonly succession?: readonly SuccessionEntry[]; readonly successionSeen?: readonly SuccessionSeenLink[] }): Set<string> {
  const out = feedingKeysOf(successionOf(record));
  for (const [k] of successionSeenOf(record)) out.add(k);
  return out;
}

/** The seen list with `keys` (new ones only, in order) added for `minute` while there is room; `added` lists the keys kept. */
export function addSeenLinks(list: readonly SuccessionSeenLink[], keys: readonly string[], minute: number): { list: SuccessionSeenLink[]; added: Set<string> } {
  const out = [...list];
  const have = new Set(out.map(([k]) => k));
  const added = new Set<string>();
  for (const k of keys) {
    if (have.has(k) || out.length >= SUCCESSION_SEEN_MAX) continue;
    out.push([k, minute]);
    have.add(k);
    added.add(k);
  }
  return { list: out, added };
}
