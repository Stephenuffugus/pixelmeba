/**
 * Event records (SPEC §12.3). The last 500 detailed events are kept in a ring; per-second
 * counters feed history. The UI coalesces repeats over 5 s for the feed.
 */
import { EVENT_RING_SIZE } from './constants';

export type EventType =
  | 'birth'
  | 'death'
  | 'introduce'
  | 'mutation'
  | 'capture'
  | 'conversion'
  | 'stressOnset'
  | 'command'
  | 'capacity'
  | 'branchCandidate'
  | 'branchEstablished'
  | 'branchExtinct'
  | 'secretionStart'
  | 'firstIntake'
  /** Dormancy (P2.1): entered Resting (cause = RESTING_FOOD_SCARCE or RESTING_DRY) / finished waking. */
  | 'rest'
  | 'wake'
  /**
   * Links (P3.6): a link joined two organisms / a link ended. detail.kind 'fungal' (F01 visual and F02
   * transport links: detail.link 'visual' | 'transport', detail.partner the other end's birthId) or
   * 'adhesion' (E12). One event per link change, from the end named by birthId.
   */
  | 'linkFormed'
  | 'linkBroken'
  /** E12 (P3.7): a colony link that would exceed a cap was refused, at no cost. detail.kind 'adhesion', detail.partner, detail.reason 'links' | 'component'. */
  | 'linkRefused'
  /** Food objects (P3.6): an M10 pellet or M11 wafer ran out and left the store. detail.cell, detail.kind, detail.id. */
  | 'objectEmptied';

export interface SimEvent {
  readonly id: number;
  readonly tick: number;
  readonly type: EventType;
  readonly species?: number;
  readonly birthId?: number;
  readonly cell?: number;
  readonly cause?: number;
  readonly amount?: number;
  readonly detail?: Readonly<Record<string, number | string>>;
}

export interface EventLog {
  ring: SimEvent[];
  /** Total events ever emitted by type (observation counters). */
  totals: Record<string, number>;
  /** First tick at which each milestone happened (-1 if never), for pacing reports. */
  milestones: Record<string, number>;
}

export function createEventLog(): EventLog {
  return { ring: [], totals: {}, milestones: {} };
}

export function emit(log: EventLog, counter: { nextEventId: number }, e: Omit<SimEvent, 'id'>): SimEvent {
  const ev: SimEvent = { id: counter.nextEventId++, ...e };
  log.ring.push(ev);
  if (log.ring.length > EVENT_RING_SIZE) log.ring.splice(0, log.ring.length - EVENT_RING_SIZE);
  log.totals[e.type] = (log.totals[e.type] ?? 0) + 1;
  return ev;
}

export function milestone(log: EventLog, name: string, tick: number): void {
  if (log.milestones[name] === undefined) log.milestones[name] = tick;
}
