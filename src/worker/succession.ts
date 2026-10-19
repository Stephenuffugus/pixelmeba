/**
 * The succession notebook's detector (P5.6 part 3; SPEC §12.8 "succession notebook (Phase 5: one‑minute
 * templated summaries tied to event IDs, provenance‑aware wording)"; D02 §23 "At one-minute simulated
 * intervals, summarize changes in measured biomass and resource flows … three largest biomass gains/losses,
 * new observed feeding links, and any species extinction or recovery from rest. Use templated sentences tied
 * to event IDs"; D-0051; D-0070; D-0131).
 *
 * Where it runs: NotebookWatch (notebookWatch.ts) builds one per played dish beside the story detector, never
 * for a comparison or experiment arm, never in a rollback replay and never in src/sim; `successionDetection`
 * turns it off for tests.
 *
 * Observation only: it reads the world (entity columns, fields, the intake record, the event ring, the reaction
 * ledger and the history samples) and writes nothing into it, draws no randomness and adds no event or command.
 * Its output is the notebook record's 'succession' entries (src/persistence/notebookSuccession.ts) through the
 * NotebookRef and one NotebookChange { kind: 'succession' } per entry written: no notice, toast or sound (the
 * lines are read in the Notebook, never pushed; D-0079's pacing is untouched).
 *
 * What it watches, per minute (an entry at every whole simulated minute, world.tick % 600 === 0, tick > 0):
 * - gains and losses: each species' living biomass at the history samples of the minute's bounds (saved
 *   state, so exact across a reload; minute 1 starts at the first sample, 0:01): the three largest gains and
 *   the three largest losses (ties by species id); a loss counts the death records of that species by
 *   recorded cause (the event ring, read after every tick);
 * - feeding links first seen in this dish (against every earlier entry of this notebook and what this watch
 *   saw since it started): consumer × pool from the intake record (a stage hook right after stage 6, as
 *   relationships.ts does), predator × prey from 'capture' records. A pool link names the enzyme that makes
 *   its pool when that enzyme converted carbon in the minute, and its producer only where producersNear
 *   credited one (relationships.ts creditedConversions, read at every whole second; D-0051). Its value is
 *   the carbon feeding removed from that pool in the ticks this species was the only one taking from it,
 *   given only when every tick it fed there was such a tick (and never for the net pools sugar, metabolite
 *   and carbon dioxide, which feeding also returns to);
 * - extinctions: the first sample second of the minute at which a species with living members had none
 *   (history), with its last death record when the event ring still holds it;
 * - recoveries from rest: 'wake' records per species.
 * When the watch started after the minute began (a load, Undo, a rollback or a dish opened mid-minute), the
 * entry carries watchedFromTick and its feeding, death-cause and recovery lines cover only that part.
 */
import { TICKS_PER_SECOND } from '@sim/constants';
import { tookFromPool } from '@sim/intake';
import { poolTotal } from '@sim/pairedRun';
import { reasonName } from '@sim/reasons';
import { isFieldActive } from '@sim/transport';
import type { HistorySample } from '@sim/history';
import type { World } from '@sim/world';
import type { NotebookRecord } from '@persist/notebook';
import {
  addSeenLinks,
  addSuccessionEntry,
  feedingKey,
  seenKeysOf,
  successionSeenOf,
  SUCCESSION_EVIDENCE_MAX,
  SUCCESSION_LINES_MAX,
  SUCCESSION_MINUTE_TICKS,
  SUCCESSION_POOLS,
  SUCCESSION_RANKED,
  successionId,
  successionOf,
  type SuccessionEnzyme,
  type SuccessionEntry,
  type SuccessionLine,
  type SuccessionPool,
} from '@persist/notebookSuccession';
import { creditedConversions } from './relationships';
import type { NotebookChange } from './protocol';

/** Tests only: turn detection off (NotebookWatch then builds no detector), to show it never alters behaviour. */
export const successionDetection = { enabled: true };

/** Where the dish keeps its notebook record (notebookWatch.ts NotebookRef). */
interface SuccessionRef {
  get(): NotebookRecord;
  set(record: NotebookRecord): void;
}

/** Pools whose carbon taken by feeding can be attributed (feeding never returns carbon to them; relationshipMap.ts NET_POOLS are the others). */
const ATTRIBUTABLE: readonly SuccessionPool[] = ['starch', 'oil', 'protein', 'broth', 'detritus', 'film'];
/** The enzyme whose product a pool is. */
const ENZYME_OF: Partial<Record<SuccessionPool, SuccessionEnzyme>> = { sugar: 'starch', metabolite: 'oil', broth: 'protein' };

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** A link first seen in the current minute (in the order seen). */
interface NewLink {
  readonly key: string;
  readonly species: string;
  readonly pool?: SuccessionPool;
  readonly prey?: string;
  readonly evidence: string;
}

/**
 * The record without the succession entries after `tick` (Undo, a rollback), and (fix round 1) without the seen
 * feeding links of those minutes: `removed` lists the entries dropped; `changed` is true when anything was.
 */
export function successionAfterRestore(world: World, record: NotebookRecord): { record: NotebookRecord; removed: string[]; changed: boolean } {
  const list = successionOf(record);
  const kept = list.filter((e) => e.toTick <= world.tick);
  const seen = successionSeenOf(record);
  const seenKept = seen.filter(([, minute]) => minute * SUCCESSION_MINUTE_TICKS <= world.tick);
  if (kept.length === list.length && seenKept.length === seen.length) return { record, removed: [], changed: false };
  const next: NotebookRecord = { ...record, ...(kept.length !== list.length ? { succession: kept } : {}), ...(seenKept.length !== seen.length ? { successionSeen: seenKept } : {}) };
  return { record: next, removed: list.filter((e) => e.toTick > world.tick).map((e) => e.id), changed: true };
}

export class SuccessionDetector {
  /** Read-only stage hook (stages 5 and 6) for the intake record and the attributable pool amounts. */
  readonly hook: (stage: number, world: World) => void;
  private world: World | null = null;
  private watchedFrom = 0;
  private lastTick = -1;
  private lastEventId = 0;
  private seen = new Set<string>();
  // The minute being watched.
  private links: NewLink[] = [];
  /** Carbon attributed per link key; a key in `shared` had a tick where another species took from its pool too. */
  private amount: Record<string, number> = {};
  private shared: Record<string, true> = {};
  /** Death records by species id: reason name → count, and their event ids (in order). */
  private deaths: Record<string, Record<string, number>> = {};
  private deathIds: Record<string, number[]> = {};
  private wakes: Record<string, number[]> = {};
  private enzymeEvidence: Partial<Record<SuccessionEnzyme, string>> = {};
  private producerCarbon: Partial<Record<SuccessionEnzyme, Record<string, number>>> = {};
  /** Stage 5 pool totals (NaN: not measured this tick). */
  private readonly pre = new Float64Array(ATTRIBUTABLE.length).fill(NaN);

  constructor(
    world: World,
    private readonly ref: SuccessionRef,
  ) {
    this.hook = (stage, w) => {
      if (w !== this.world) return;
      if (stage === 5) this.beforeIntake(w);
      else if (stage === 6) this.afterIntake(w);
    };
    this.bind(world);
  }

  /** Rebuilt only when the world was replaced (Undo, a rollback, a reload); a favorite change keeps the watch. */
  rebind(world: World): void {
    if (world !== this.world) this.bind(world);
  }

  private bind(world: World): void {
    this.world = world;
    // The record keeps only what this world recorded (notebookAfterRestore did this and announced it; this
    // guards every other path that rebinds to an earlier world).
    const kept = successionAfterRestore(world, this.ref.get());
    if (kept.changed) this.ref.set(kept.record);
    this.watchedFrom = world.tick;
    this.lastTick = world.tick;
    this.lastEventId = world.counters.nextEventId - 1;
    // Fix round 1: every link this dish's notebook saw (the seen list keeps those of removed or capped lines).
    this.seen = seenKeysOf(this.ref.get());
    this.resetMinute();
  }

  private resetMinute(): void {
    this.links = [];
    this.amount = {};
    this.shared = {};
    this.deaths = {};
    this.deathIds = {};
    this.wakes = {};
    this.enzymeEvidence = {};
    this.producerCarbon = {};
    this.pre.fill(NaN);
  }

  /** Stage 5 ran: the attributable pools' totals before feeding. */
  private beforeIntake(world: World): void {
    for (let k = 0; k < ATTRIBUTABLE.length; k++) {
      const pool = ATTRIBUTABLE[k]!;
      this.pre[k] = world.fields[pool] !== undefined && isFieldActive(world, pool) ? poolTotal(world, pool) : NaN;
    }
  }

  /** Stage 6 ran: new consumer × pool links, and the carbon each sole consumer took from an attributable pool. */
  private afterIntake(world: World): void {
    if (world.intakeSeen.bits === null) return;
    const second = Math.floor(world.tick / TICKS_PER_SECOND);
    for (const pool of SUCCESSION_POOLS) {
      if (world.fields[pool] === undefined) continue;
      const eaters: number[] = [];
      for (let s = 0; s < world.species.length; s++) if (tookFromPool(world, s, pool)) eaters.push(s);
      if (eaters.length === 0) continue;
      for (const s of eaters) {
        const species = world.species[s]!.id;
        const key = feedingKey({ species, pool });
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        this.links.push({ key, species, pool, evidence: `intake:${second}:${species}:${pool}` });
      }
      // Attribute the pool's removal this tick only to a link of this minute that was the only consumer.
      const k = ATTRIBUTABLE.indexOf(pool);
      const tracked = eaters.map((s) => feedingKey({ species: world.species[s]!.id, pool })).filter((key) => this.links.some((l) => l.key === key));
      if (tracked.length === 0) continue;
      if (eaters.length > 1 || k < 0 || Number.isNaN(this.pre[k]!)) {
        for (const key of tracked) this.shared[key] = true;
        continue;
      }
      const removed = this.pre[k]! - poolTotal(world, pool);
      this.amount[tracked[0]!] = (this.amount[tracked[0]!] ?? 0) + (removed > 0 ? removed : 0);
    }
    this.pre.fill(NaN);
  }

  /** Call once after every step of the watched world (and after an accepted command: only a new tick counts). */
  afterTick(world: World): NotebookChange[] {
    if (world !== this.world) this.bind(world);
    if (world.tick <= this.lastTick) return [];
    this.lastTick = world.tick;
    this.readEvents(world);
    if (world.tick % TICKS_PER_SECOND === 0) this.readConversions();
    if (world.tick % SUCCESSION_MINUTE_TICKS !== 0) return [];
    // Fix round 1: the minute's links join the seen list first (also those the line cap leaves out); a link the
    // list has no room for is not written, so no link is ever announced as first seen twice.
    const record = this.ref.get();
    const seen = addSeenLinks(successionSeenOf(record), this.links.map((l) => l.key), world.tick / SUCCESSION_MINUTE_TICKS);
    this.links = this.links.filter((l) => seen.added.has(l.key));
    const entry = this.entryAt(world);
    this.resetMinute();
    this.ref.set({ ...record, succession: addSuccessionEntry(successionOf(record), entry), ...(seen.added.size > 0 ? { successionSeen: seen.list } : {}) });
    return [{ kind: 'succession', entry }];
  }

  private readEvents(world: World): void {
    const ring = world.events.ring;
    let k = ring.length;
    while (k > 0 && ring[k - 1]!.id > this.lastEventId) k--;
    const sp = (i: number | undefined) => (i === undefined ? undefined : world.species[i]?.id);
    for (; k < ring.length; k++) {
      const ev = ring[k]!;
      const id = sp(ev.species);
      if (id === undefined) continue;
      if (ev.type === 'death' && ev.cause !== undefined) {
        const cause = reasonName(ev.cause);
        if (cause.startsWith('DEATH_')) {
          const d = (this.deaths[id] ??= {});
          d[cause] = (d[cause] ?? 0) + 1;
          (this.deathIds[id] ??= []).push(ev.id);
        }
      } else if (ev.type === 'capture') {
        const prey = typeof ev.detail?.preySpecies === 'number' ? sp(ev.detail.preySpecies) : undefined;
        if (prey === undefined) continue;
        const key = feedingKey({ species: id, prey });
        if (this.seen.has(key)) continue;
        this.seen.add(key);
        this.links.push({ key, species: id, prey, evidence: `event:${ev.id}` });
      } else if (ev.type === 'wake') (this.wakes[id] ??= []).push(ev.id);
    }
    this.lastEventId = world.counters.nextEventId - 1;
  }

  /** A whole second closed: which enzymes converted carbon in it, and the producers credited (D-0051). */
  private readConversions(): void {
    for (const cv of creditedConversions(this.world!)) {
      this.enzymeEvidence[cv.enzyme] ??= `reaction:${cv.enzyme}:${cv.second}:${cv.topCell}`;
      const p = (this.producerCarbon[cv.enzyme] ??= {});
      cv.credited.forEach((id, k) => (p[id] = (p[id] ?? 0) + cv.carbon[k]!));
    }
  }

  /** The entry for the minute that ends at world.tick. */
  private entryAt(world: World): SuccessionEntry {
    const toTick = world.tick;
    const minute = toTick / SUCCESSION_MINUTE_TICKS;
    const fromTick = toTick - SUCCESSION_MINUTE_TICKS;
    const ids = world.species.map((s) => s.id);
    const lines: SuccessionLine[] = [];
    const seconds = world.history.seconds;
    const sampleAt = (second: number): HistorySample | undefined => {
      for (let k = seconds.length - 1; k >= 0; k--) {
        const s = seconds[k]!;
        if (s.second === second) return s;
        if (s.second < second) return undefined;
      }
      return undefined;
    };
    const loSecond = Math.max(1, fromTick / TICKS_PER_SECOND);
    const hiSecond = toTick / TICKS_PER_SECOND;
    const lo = sampleAt(loSecond);
    const hi = sampleAt(hiSecond);
    if (lo && hi) {
      const diffs = ids.map((id, s) => ({ id, d: round2((hi.biomass[s] ?? 0) - (lo.biomass[s] ?? 0)) }));
      const byId = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      const ev = [`history:${loSecond}`, `history:${hiSecond}`];
      for (const g of diffs.filter((x) => x.d > 0).sort((a, b) => b.d - a.d || byId(a, b)).slice(0, SUCCESSION_RANKED)) lines.push({ kind: 'gain', species: g.id, value: g.d, evidence: ev });
      for (const l of diffs.filter((x) => x.d < 0).sort((a, b) => a.d - b.d || byId(a, b)).slice(0, SUCCESSION_RANKED)) {
        const deaths = this.deaths[l.id];
        const deathEv = (this.deathIds[l.id] ?? []).slice(-(SUCCESSION_EVIDENCE_MAX - ev.length)).map((x) => `event:${x}`);
        lines.push({ kind: 'loss', species: l.id, value: -l.d, ...(deaths ? { deaths: { ...deaths } } : {}), evidence: [...ev, ...deathEv] });
      }
    }
    // Extinctions: the first sample second of the minute at which a species with members had none.
    const minuteSamples = seconds.filter((s) => s.second >= loSecond && s.second <= hiSecond);
    for (let s = 0; s < ids.length; s++) {
      for (let k = 1; k < minuteSamples.length; k++) {
        const before = minuteSamples[k - 1]!;
        const now = minuteSamples[k]!;
        if (now.second !== before.second + 1) continue;
        if ((before.count[s] ?? 0) > 0 && (now.count[s] ?? 0) === 0) {
          const death = lastDeath(world, s, fromTick, now.second * TICKS_PER_SECOND);
          lines.push({ kind: 'extinction', species: ids[s]!, evidence: [`history:${now.second}`, ...(death !== null ? [`event:${death}`] : [])] });
          break;
        }
      }
    }
    for (const l of this.links) {
      if (l.prey !== undefined) {
        lines.push({ kind: 'newFeeding', species: l.species, prey: l.prey, evidence: [l.evidence] });
        continue;
      }
      const pool = l.pool!;
      const enzyme = ENZYME_OF[pool];
      const active = enzyme !== undefined ? this.enzymeEvidence[enzyme] : undefined;
      const credit = enzyme !== undefined && active !== undefined ? this.producerCarbon[enzyme] : undefined;
      const producer = credit ? topProducer(credit) : null;
      const amount = this.amount[l.key];
      const value = ATTRIBUTABLE.includes(pool) && !this.shared[l.key] && amount !== undefined ? round2(amount) : 0;
      lines.push({
        kind: 'newFeeding',
        species: l.species,
        pool,
        ...(active !== undefined ? { enzyme: enzyme! } : {}),
        ...(producer !== null ? { producer } : {}),
        ...(value > 0 ? { value } : {}),
        evidence: [l.evidence, ...(active !== undefined ? [active] : [])],
      });
    }
    for (const s of [...Object.keys(this.wakes)].sort()) {
      const w = this.wakes[s]!;
      lines.push({ kind: 'recovery', species: s, value: w.length, evidence: w.slice(0, SUCCESSION_EVIDENCE_MAX).map((x) => `event:${x}`) });
    }
    return {
      id: successionId(minute),
      minute,
      fromTick,
      toTick,
      ...(this.watchedFrom > fromTick ? { watchedFromTick: this.watchedFrom } : {}),
      lines: lines.slice(0, SUCCESSION_LINES_MAX),
    };
  }
}

/** The credited producer with the most carbon (ties: the lowest species id), or null. */
function topProducer(credit: Readonly<Record<string, number>>): string | null {
  let best: string | null = null;
  for (const id of Object.keys(credit).sort()) if (best === null || credit[id]! > credit[best]!) best = id;
  return best;
}

/** The id of species `s`'s last death record in the event ring with fromTick ≤ tick < beforeTick, or null. */
function lastDeath(world: World, s: number, fromTick: number, beforeTick: number): number | null {
  const ring = world.events.ring;
  for (let k = ring.length - 1; k >= 0; k--) {
    const ev = ring[k]!;
    if (ev.tick < fromTick) return null;
    if (ev.type === 'death' && ev.species === s && ev.tick < beforeTick) return ev.id;
  }
  return null;
}
