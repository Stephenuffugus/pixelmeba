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
  | 'firstIntake';

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
