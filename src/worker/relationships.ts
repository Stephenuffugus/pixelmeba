/**
 * Relationships seen (P3.8; D-0039 option b; SPEC §14 "A local journal records observed relationships
 * such as 'Recycler consumed debris'"; UX §5.7).
 *
 * The watcher notes, for the open dish only, the first time each relationship shows, from recorded
 * state only:
 * - predation: 'capture' events (the predator is the event's species, detail.preySpecies the prey's);
 * - lysis and parasite drain: 'death' events with cause DEATH_LYSIS / DEATH_PARASITE_DRAIN; the virus or
 *   parasite is the one this watcher saw infecting or riding that host (or found doing so when it
 *   started); a death it cannot attribute is not recorded;
 * - infection (`infectedBy` 0 → non-zero) and parasite attachment (`hostBirthId` 0 → non-zero), by an
 *   after-tick scan of the entity columns;
 * - feeding by pool: the observation-only intake record of stage 6 (src/sim/intake.ts IntakeSeen), read
 *   by a stage hook right after stage 6;
 * - enzyme conversion with provenance: the reaction ledger's last complete second (world.reactionCells),
 *   credited to a species only where snapshot.ts producersNear names it (D-0051's rule: a living
 *   organism of it holds that enzyme's producer rules, sits in the cell or a four-neighbour and released
 *   that enzyme in the last tick); a conversion no producer is credited for is not a relationship.
 *
 * Observation only: the watcher reads the world and never writes it, draws no randomness and adds no
 * events. Its first-seen table is worker state: never saved, never read by the simulation. It runs only
 * in DishHost.stepDish (a played dish), never on comparison copies, rollback replays or experiment arms.
 */
import { R } from '@sim/reasons';
import { REACTION_ENZYMES, reactionInCell, reactionInDish, lastCompleteSecond } from '@sim/reactions';
import { tookFromPool } from '@sim/intake';
import { virusIdOfCode } from '@sim/viruses';
import { CELL_COUNT, TICKS_PER_SECOND } from '@sim/constants';
import type { FieldId } from '@sim/fields';
import type { World } from '@sim/world';
import type { RelationshipSeen } from './protocol';
import { producersNear } from './snapshot';
import { NET_POOLS, RelationshipLedger } from './relationshipMap';
import { poolTotal } from '@sim/pairedRun';
import { isFieldActive } from '@sim/transport';

/** Pools whose intake makes an "eats" relationship (food pools, film eaten as detritus, CO2 taken up in light). */
export const FOOD_POOLS: readonly FieldId[] = ['sugar', 'starch', 'oil', 'protein', 'broth', 'detritus', 'metabolite', 'film', 'co2'];

export type RelationshipKind = 'eats' | 'catches' | 'infects' | 'attaches' | 'bursts' | 'drains' | 'converts';

export type { RelationshipSeen } from './protocol';

export function relationshipId(kind: RelationshipKind, actor: string, target: string): string {
  return `${kind}:${actor}:${target}`;
}

export class RelationshipWatcher {
  /** First-seen entries in the order seen. */
  readonly entries: RelationshipSeen[] = [];
  private readonly seenIds: Set<string> = new Set();
  private world: World;
  private lastEventId = 0;
  /** Per slot, after the last scan: the birthId there, its infectedBy code, and (a parasite) its host's birthId. */
  private prevBirth = new Uint32Array(0);
  private prevInfected = new Uint8Array(0);
  private prevHost = new Uint32Array(0);
  /** Host birthId → the infecting virus's species id / the riding parasite's species id. */
  private readonly infectedBy = new Map<number, string>();
  private readonly riddenBy = new Map<number, string>();
  /** Stage hook for step(); reads only. */
  readonly hook: (stage: number, world: World) => void;
  /**
   * P4.8: the relationship map's per-second ledger (every occurrence with its measured amount, where
   * the first-seen table keeps only the first). Worker session state, like the table.
   */
  readonly ledger: RelationshipLedger;
  /** P4.8: each food pool's total after stage 5 (NaN where the world has no such field). */
  private readonly pre6 = new Float64Array(FOOD_POOLS.length);

  constructor(world: World) {
    this.world = world;
    this.ledger = new RelationshipLedger(world.tick);
    this.rebind(world);
    this.hook = (stage, w) => {
      // P4.13 (D-0085): the pool sums run only once the map has been opened for this dish.
      if (stage === 5 && w === this.world && this.ledger.poolsArmed) this.beforeIntake(w);
      if (stage === 6) this.afterIntake(w);
    };
  }

  /**
   * Start watching `world` (a new or restored world of the same dish): the first-seen table is kept;
   * the scan state is taken from the world as it is now, so what already holds there is not "new".
   */
  rebind(world: World): void {
    // P4.8: a restored world (Undo, rollback): the map's seconds later than it are dropped.
    if (world !== this.world) this.ledger.restoreTo(world.tick);
    this.world = world;
    this.lastEventId = world.counters.nextEventId - 1;
    const n = world.ents.highWater;
    this.prevBirth = new Uint32Array(n);
    this.prevInfected = new Uint8Array(n);
    this.prevHost = new Uint32Array(n);
    this.infectedBy.clear();
    this.riddenBy.clear();
    this.scan(world, false);
  }

  /** P4.13: the relationship map was opened for this dish: measure pool totals from now on. */
  armPools(): void {
    this.ledger.armPools(this.world.tick);
  }

  /** Whether this watcher is bound to `world`. */
  watches(world: World): boolean {
    return this.world === world;
  }

  /** Call once after every step of the watched world. */
  afterTick(world: World): void {
    if (world !== this.world) this.rebind(world);
    const second = Math.floor((world.tick - 1) / TICKS_PER_SECOND);
    const sp = (i: number | undefined) => (i === undefined ? undefined : world.species[i]?.id);
    const ring = world.events.ring;
    let k = ring.length;
    while (k > 0 && ring[k - 1]!.id > this.lastEventId) k--;
    for (; k < ring.length; k++) {
      const ev = ring[k]!;
      if (ev.type === 'capture') {
        const pred = sp(ev.species);
        const preyIndex = ev.detail?.preySpecies;
        const prey = typeof preyIndex === 'number' ? sp(preyIndex) : undefined;
        if (pred !== undefined && prey !== undefined) {
          this.note(relationshipId('catches', pred, prey), second, ev.id);
          this.ledger.add(second, 'catches', pred, prey, 1, ev.amount ?? 0);
        }
      } else if (ev.type === 'death' && ev.birthId !== undefined) {
        const host = sp(ev.species);
        if (host !== undefined && ev.cause === R.DEATH_LYSIS) {
          const v = this.infectedBy.get(ev.birthId);
          if (v !== undefined) {
            this.note(relationshipId('bursts', v, host), second, ev.id);
            this.ledger.add(second, 'bursts', v, host, 1, 0);
          }
        } else if (host !== undefined && ev.cause === R.DEATH_PARASITE_DRAIN) {
          const p = this.riddenBy.get(ev.birthId);
          if (p !== undefined) {
            this.note(relationshipId('drains', p, host), second, ev.id);
            this.ledger.add(second, 'drains', p, host, 1, 0);
          }
        }
        this.infectedBy.delete(ev.birthId);
        this.riddenBy.delete(ev.birthId);
      }
    }
    this.lastEventId = world.counters.nextEventId - 1;
    this.scan(world, true);
    if (world.tick % TICKS_PER_SECOND === 0) this.conversions(world);
  }

  private note(id: string, second: number, eventId?: number): void {
    if (this.seenIds.has(id)) return;
    this.seenIds.add(id);
    this.entries.push(eventId === undefined ? { relationshipId: id, second } : { relationshipId: id, second, eventId });
  }

  /** P4.8: stage 5 just ran: each food pool's total before feeding (read only). */
  private beforeIntake(world: World): void {
    for (let k = 0; k < FOOD_POOLS.length; k++) {
      const pool = FOOD_POOLS[k]!;
      // An inactive field is exactly zero everywhere (transport.ts), so feeding cannot take from it (it
      // can return to sugar, metabolite and CO2, so those are always measured).
      const measured = world.fields[pool] !== undefined && (isFieldActive(world, pool) || NET_POOLS.includes(pool));
      this.pre6[k] = measured ? poolTotal(world, pool) : NaN;
    }
  }

  /** Stage 6 just ran: every (species, pool) the intake record marks; P4.8: what feeding took from each pool. */
  private afterIntake(world: World): void {
    if (world !== this.world) return;
    const second = Math.floor(world.tick / TICKS_PER_SECOND);
    for (let k = 0; k < FOOD_POOLS.length; k++) {
      const before = this.pre6[k]!;
      this.pre6[k] = NaN;
      const pool = FOOD_POOLS[k]!;
      if (!Number.isNaN(before) && world.fields[pool] !== undefined) this.ledger.poolRemoved(second, pool, before - poolTotal(world, pool));
    }
    if (world.intakeSeen.bits === null) return;
    for (let s = 0; s < world.species.length; s++) {
      for (const pool of FOOD_POOLS) {
        if (world.fields[pool] !== undefined && tookFromPool(world, s, pool)) {
          this.note(relationshipId('eats', world.species[s]!.id, pool), second);
          this.ledger.seen(second, world.species[s]!.id, pool);
        }
      }
    }
  }

  /** Infection and attachment transitions since the last scan (record = false: only take the state). */
  private scan(world: World, record: boolean): void {
    const c = world.ents.cols;
    const n = world.ents.highWater;
    if (n > this.prevBirth.length) {
      const grow = <T extends Uint8Array | Uint32Array>(a: T, make: (len: number) => T): T => {
        const b = make(n);
        b.set(a);
        return b;
      };
      this.prevBirth = grow(this.prevBirth, (len) => new Uint32Array(len));
      this.prevInfected = grow(this.prevInfected, (len) => new Uint8Array(len));
      this.prevHost = grow(this.prevHost, (len) => new Uint32Array(len));
    }
    const second = Math.floor((world.tick - 1) / TICKS_PER_SECOND);
    for (let i = 0; i < n; i++) {
      if (c.alive[i] !== 1) {
        this.prevBirth[i] = 0;
        this.prevInfected[i] = 0;
        this.prevHost[i] = 0;
        continue;
      }
      const birth = c.birthId[i]!;
      const same = this.prevBirth[i] === birth;
      const inf = c.infectedBy[i]!;
      if (inf !== 0) {
        const virus = virusIdOfCode(inf);
        if (virus !== null) {
          this.infectedBy.set(birth, virus);
          if (record && !(same && this.prevInfected[i] === inf)) {
            const host = world.species[c.species[i]!]!.id;
            this.note(relationshipId('infects', virus, host), second);
            this.ledger.add(second, 'infects', virus, host, 1, 0);
          }
        }
      }
      const hostBirth = c.hostBirthId[i]!;
      const hostSlot = c.hostSlot[i]!;
      if (hostBirth !== 0 && hostSlot >= 0 && c.alive[hostSlot] === 1 && c.birthId[hostSlot] === hostBirth) {
        const parasite = world.species[c.species[i]!]!.id;
        this.riddenBy.set(hostBirth, parasite);
        if (record && !(same && this.prevHost[i] === hostBirth)) {
          const host = world.species[c.species[hostSlot]!]!.id;
          this.note(relationshipId('attaches', parasite, host), second);
          this.ledger.add(second, 'attaches', parasite, host, 1, 0);
        }
      }
      this.prevBirth[i] = birth;
      this.prevInfected[i] = inf;
      this.prevHost[i] = hostBirth;
    }
  }

  /**
   * A whole second just closed: conversions in it, credited only where producersNear names a producer
   * (D-0051). P4.8: each credited species' carbon is the carbon converted in the cells where it was named
   * (a cell where two producer species were named counts for each; never split between them).
   */
  private conversions(world: World): void {
    const last = lastCompleteSecond(world);
    if (last < 0) return;
    for (const enzyme of REACTION_ENZYMES) {
      if (!(reactionInDish(world, enzyme).c > 0)) continue;
      const credited: string[] = [];
      const carbon: number[] = [];
      for (let cell = 0; cell < CELL_COUNT; cell++) {
        const c = reactionInCell(world, enzyme, cell).c;
        if (!(c > 0)) continue;
        for (const id of producersNear(world, enzyme, cell)) {
          const k = credited.indexOf(id);
          if (k < 0) {
            credited.push(id);
            carbon.push(c);
          } else carbon[k]! += c;
        }
      }
      credited.forEach((id, k) => {
        this.note(relationshipId('converts', id, enzyme), last);
        this.ledger.add(last, 'converts', id, enzyme, 0, carbon[k]!);
      });
    }
  }
}
