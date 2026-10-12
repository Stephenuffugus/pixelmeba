/**
 * The relationship map's ledger (P4.8; SPEC §12.8 "Relationship map (observed transfers/attacks with type
 * and measured total; windows 60/180/600 s; unknown = absent)"; D02 §20; D-0082 session state).
 *
 * Fed only by the P3.8 RelationshipWatcher (src/worker/relationships.ts), which reads recorded state:
 * - catches: every 'capture' event (count, and its carbon: the event's amount), predator → prey species;
 * - infects / attaches: every new infection / parasite attachment the watcher's after-tick scan finds;
 * - bursts / drains: DEATH_LYSIS / DEATH_PARASITE_DRAIN deaths, credited only as the watcher credits them
 *   (to the virus or parasite it saw on that host);
 * - converts: carbon converted in the last complete second, only in cells where snapshot.ts producersNear
 *   names a producer of that species (D-0051); conversion with no credited producer is no edge;
 * - eats: the intake record holds bits, not amounts, so an "eats" edge counts the seconds in which at
 *   least one organism of the species took from the pool; the pool itself carries the carbon feeding
 *   removed from it (its total before and after stage 6, as ArmObserver's consumed.F). A pool's removal
 *   is never divided among the species that ate from it.
 *
 * P4.13 (D-0085's cost): the pool totals (a sum over every dish cell before and after stage 6, about 0.3 ms
 * per tick on the Garden) are taken only once the map has been opened for the dish in this session
 * (armPools; the 'relationshipMap' request is the signal). From then on the pools have their own record,
 * and when it starts after the window's start the map says "Recorded since m:ss" for them
 * (poolsRecordedSinceSecond), exactly as a mid-second restart does for the whole map. The event-based
 * edges (catches, infects, attaches, bursts, drains, converts, eats-seen) keep their full window.
 *
 * Kept per whole dish second for the last MAP_RETAIN_SECONDS seconds. Worker session state for a played
 * dish: never saved, never hashed, never read by the simulation; it starts empty after a reload. After
 * Undo or a rollback to tick T, every second holding a tick ≥ T is dropped; when T falls inside a second
 * the record restarts at T (a part second is never shown as a whole one).
 */
import type { FieldId } from '@sim/fields';
import { TICKS_PER_SECOND } from '@sim/constants';

export const MAP_WINDOWS = [60, 180, 600] as const;
export type MapWindow = (typeof MAP_WINDOWS)[number];
export const MAP_RETAIN_SECONDS = 600;

export function isMapWindow(v: unknown): v is MapWindow {
  return v === 60 || v === 180 || v === 600;
}

/** Edge kinds the ledger counts (the P3.8 relationship kinds). */
export type MapEdgeKind = 'eats' | 'catches' | 'infects' | 'attaches' | 'bursts' | 'drains' | 'converts';

/** Pools where feeding also returns material (pairedRun.ts CONSUMABLE_POOLS: sugar, metabolite, CO2): their removal is net. */
export const NET_POOLS: readonly FieldId[] = ['sugar', 'metabolite', 'co2'];

export interface MapEdge {
  readonly kind: MapEdgeKind;
  /** Species id (the eater, hunter, virus, parasite or producer). */
  readonly actor: string;
  /** Species id, or a pool id (eats), or the enzyme's substrate (converts: 'starch' | 'oil' | 'protein'). */
  readonly target: string;
  /** Recorded occurrences (catches, infects, attaches, bursts, drains); 0 for eats and converts. */
  readonly count: number;
  /** Carbon: taken by the catches, or converted (converts); 0 otherwise. */
  readonly carbon: number;
  /** Seconds in which it was seen (eats); 0 otherwise. */
  readonly seconds: number;
}

export interface MapPool {
  readonly pool: string;
  /** Carbon feeding removed from the pool in the window (net for NET_POOLS). */
  readonly removed: number;
  readonly net: boolean;
}

export interface RelationshipMapData {
  readonly windowSeconds: MapWindow;
  /** The dish tick the map was read at. */
  readonly tick: number;
  /** First and last dish second the window covers (inclusive; last = the second of the last tick run). */
  readonly fromSecond: number;
  readonly toSecond: number;
  /** When the record starts after the window's start: the second it starts (the map says "Recorded since"). */
  readonly recordedSinceSecond: number | null;
  /**
   * P4.13: when the pool totals start after the window's start (they are measured only since the map was
   * first opened for this dish in this session, or after Undo): that second; null when they cover the
   * whole window.
   */
  readonly poolsRecordedSinceSecond: number | null;
  /** Edges in a stable order: kind, then actor, then target. */
  readonly edges: readonly MapEdge[];
  /** Pools some species was seen eating from in the window, with the carbon feeding removed from them. */
  readonly pools: readonly MapPool[];
}

interface EdgeAcc {
  count: number;
  carbon: number;
}

interface Bucket {
  readonly edges: Map<string, EdgeAcc>;
}

const KIND_ORDER: readonly MapEdgeKind[] = [
  'eats',
  'catches',
  'infects',
  'attaches',
  'bursts',
  'drains',
  'converts',
];

/**
 * Per-second records kept for the last `retain` seconds, with the Undo rule above. Shared by the map's
 * ledger and the region probes' boundary totals (src/worker/probes.ts).
 */
export class SecondRecord<T> {
  private readonly buckets = new Map<number, T>();
  /** The tick from which this record is continuous. */
  startTick: number;

  constructor(
    startTick: number,
    private readonly make: () => T,
    private readonly retain: number = MAP_RETAIN_SECONDS,
  ) {
    this.startTick = startTick;
  }

  /** The bucket for `second`, created on first use; older buckets past the retention go. */
  at(second: number): T {
    let b = this.buckets.get(second);
    if (b === undefined) {
      b = this.make();
      this.buckets.set(second, b);
      const cut = second - this.retain;
      for (const s of [...this.buckets.keys()]) if (s <= cut) this.buckets.delete(s);
    }
    return b;
  }

  /** Buckets with second in [from, to], in ascending second order. */
  range(from: number, to: number): T[] {
    const out: [number, T][] = [];
    for (const [s, b] of this.buckets) if (s >= from && s <= to) out.push([s, b]);
    out.sort((a, b) => a[0] - b[0]);
    return out.map((x) => x[1]);
  }

  /** The dish was restored to `tick` (Undo, a rollback): drop what is later than it. */
  restoreTo(tick: number): void {
    const cutSecond = Math.floor(tick / TICKS_PER_SECOND);
    if (tick % TICKS_PER_SECOND !== 0 || this.startTick > tick) {
      this.buckets.clear();
      this.startTick = tick;
      return;
    }
    for (const s of [...this.buckets.keys()]) if (s >= cutSecond) this.buckets.delete(s);
  }

  /** The window of the last `w` seconds at `tick`: [from, to] and the "recorded since" second, if later than from. */
  window(tick: number, w: number): { from: number; to: number; since: number | null } {
    const to = tick > 0 ? Math.floor((tick - 1) / TICKS_PER_SECOND) : -1;
    // A dish younger than the window: the window starts at the dish's first second.
    const from = Math.max(0, to - w + 1);
    const startSecond = Math.floor(this.startTick / TICKS_PER_SECOND);
    const partStart = this.startTick % TICKS_PER_SECOND !== 0;
    const since = startSecond > from || (partStart && startSecond >= from) ? startSecond : null;
    return { from, to, since };
  }
}

/** The map's per-second ledger (owned by a RelationshipWatcher). */
export class RelationshipLedger {
  private readonly record: SecondRecord<Bucket>;
  /** P4.13: the pools' own record, from the first time the map was opened (null until then). */
  private poolRecord: SecondRecord<Map<string, number>> | null = null;

  constructor(startTick: number) {
    this.record = new SecondRecord<Bucket>(startTick, () => ({ edges: new Map() }));
  }

  get startTick(): number {
    return this.record.startTick;
  }

  /** P4.13: whether pool totals are being measured (the map has been opened for this dish). */
  get poolsArmed(): boolean {
    return this.poolRecord !== null;
  }

  /** P4.13: start measuring pool totals from `tick` (the first time the map is opened; later calls do nothing). */
  armPools(tick: number): void {
    if (this.poolRecord === null) this.poolRecord = new SecondRecord<Map<string, number>>(tick, () => new Map());
  }

  /** Count one occurrence (or carbon) of an edge in `second`. */
  add(second: number, kind: MapEdgeKind, actor: string, target: string, count: number, carbon: number): void {
    const key = `${kind}:${actor}:${target}`;
    const edges = this.record.at(second).edges;
    const e = edges.get(key);
    if (e === undefined) edges.set(key, { count, carbon });
    else {
      e.count += count;
      e.carbon += carbon;
    }
  }

  /** An organism of `actor` took from `pool` in `second` (seconds are counted once each). */
  seen(second: number, actor: string, pool: string): void {
    const key = `eats:${actor}:${pool}`;
    const edges = this.record.at(second).edges;
    if (!edges.has(key)) edges.set(key, { count: 0, carbon: 0 });
  }

  /** Feeding removed `c` carbon from `pool` during one stage 6 in `second` (negative when it returned more). */
  poolRemoved(second: number, pool: string, c: number): void {
    if (c === 0 || this.poolRecord === null) return;
    const pools = this.poolRecord.at(second);
    pools.set(pool, (pools.get(pool) ?? 0) + c);
  }

  restoreTo(tick: number): void {
    this.record.restoreTo(tick);
    this.poolRecord?.restoreTo(tick);
  }

  /** The map of the last `windowSeconds` seconds at `tick`. Pure read. */
  read(tick: number, windowSeconds: MapWindow): RelationshipMapData {
    const { from, to, since } = this.record.window(tick, windowSeconds);
    const acc = new Map<string, { count: number; carbon: number; seconds: number }>();
    const pools = new Map<string, number>();
    for (const b of this.record.range(from, to)) {
      for (const [key, e] of b.edges) {
        const a = acc.get(key);
        if (a === undefined) acc.set(key, { count: e.count, carbon: e.carbon, seconds: 1 });
        else {
          a.count += e.count;
          a.carbon += e.carbon;
          a.seconds += 1;
        }
      }
    }
    // P4.13: pool totals from their own record (same window; "Recorded since" when it starts later).
    let poolsSince: number | null;
    if (this.poolRecord === null) poolsSince = to + 1; // never measured (the map was not opened yet)
    else {
      poolsSince = this.poolRecord.window(tick, windowSeconds).since;
      for (const b of this.poolRecord.range(from, to)) for (const [p, c] of b) pools.set(p, (pools.get(p) ?? 0) + c);
    }
    const edges: MapEdge[] = [];
    for (const [key, a] of acc) {
      const [kind, actor, target] = key.split(':') as [MapEdgeKind, string, string];
      edges.push({
        kind,
        actor,
        target,
        count: kind === 'eats' || kind === 'converts' ? 0 : a.count,
        carbon: kind === 'catches' || kind === 'converts' ? a.carbon : 0,
        seconds: kind === 'eats' ? a.seconds : 0,
      });
    }
    edges.sort(
      (x, y) =>
        KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind) ||
        cmp(x.actor, y.actor) ||
        cmp(x.target, y.target),
    );
    const eaten = [...new Set(edges.filter((e) => e.kind === 'eats').map((e) => e.target))].sort(cmp);
    return {
      windowSeconds,
      tick,
      fromSecond: from,
      toSecond: to,
      recordedSinceSecond: since,
      poolsRecordedSinceSecond: poolsSince,
      edges,
      pools: eaten.map((pool) => ({
        pool,
        removed: pools.get(pool) ?? 0,
        net: NET_POOLS.includes(pool as FieldId),
      })),
    };
  }
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** An empty map (a dish that has not been played in this session yet), recorded from `tick`. */
export function emptyMap(tick: number, windowSeconds: MapWindow): RelationshipMapData {
  return new RelationshipLedger(tick).read(tick, windowSeconds);
}
