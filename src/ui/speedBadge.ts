/**
 * The effective-speed indicator (P4.13; SPEC §3.1 "If real time falls behind, cap ticks per frame, keep the
 * timestep, and report effective speed"; UX §2.4 "effective-speed badge when behind").
 *
 * The decision is pure (stepBadge) so it can be tested without a clock: the badge appears after the
 * effective speed has stayed below 0.8 × the chosen speed for 2 s of real time, and goes after it has
 * stayed at or above 0.9 × for 2 s (hysteresis, so a speed near the line does not flicker). Never while
 * paused or stepping. The visible text stays " · running at {x.x}×"; its accessible name and title say
 * why, and the polite live region announces it once per appearance (useSpeedBadge).
 *
 * UI only: it reads snapshots (the worker's measured effective speed) or, on screens whose worker state
 * carries no effective speed (a comparison, an experiment run), the ticks the screen saw per real second
 * (EffectiveSpeedMeter). It never changes the dish.
 */
import { h } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { announcement } from './state';

export const BADGE_SHOW_BELOW = 0.8;
export const BADGE_HIDE_AT = 0.9;
export const BADGE_HOLD_MS = 2000;
/** How long the live region holds the badge's sentence. */
const ANNOUNCE_MS = 5000;

export interface BadgeInput {
  /** The dish is running (not paused, not stepping). */
  readonly running: boolean;
  /** The chosen speed multiple (1, 2, 4). */
  readonly speed: number;
  /** The speed actually achieved (ticks per real second / 10). */
  readonly effective: number;
  /** Real time, ms. */
  readonly now: number;
}

export interface BadgeState {
  readonly shown: boolean;
  /** When the current run of readings that would flip the badge began (null: none). */
  readonly since: number | null;
}

export const BADGE_IDLE: BadgeState = { shown: false, since: null };

/** The next badge state after one reading. */
export function stepBadge(s: BadgeState, i: BadgeInput): BadgeState {
  if (!i.running || !(i.speed > 0)) return BADGE_IDLE;
  if (!s.shown) {
    if (!(i.effective < BADGE_SHOW_BELOW * i.speed)) return BADGE_IDLE;
    const since = s.since ?? i.now;
    return i.now - since >= BADGE_HOLD_MS ? { shown: true, since: null } : { shown: false, since };
  }
  if (!(i.effective >= BADGE_HIDE_AT * i.speed)) return { shown: true, since: null };
  const since = s.since ?? i.now;
  return i.now - since >= BADGE_HOLD_MS ? BADGE_IDLE : { shown: true, since };
}

/** The visible text (unchanged from P1: the time strip's suffix). */
export function badgeText(effective: number): string {
  return ` · running at ${effective.toFixed(1)}×`;
}

/** The accessible name and title, and what the live region says once. */
export function badgeLabel(speed: number, effective: number): string {
  return `This device can't keep up with ${speed}×, so the dish runs at ${effective.toFixed(1)}×. No dish time is skipped.`;
}

/**
 * Ticks per real second / 10 over the last `windowMs` of readings (the worker's own measure for screens
 * whose state does not carry one). A tick count that goes back (a restart) starts the window again.
 */
export class EffectiveSpeedMeter {
  private readonly samples: { t: number; tick: number }[] = [];
  constructor(private readonly windowMs = 2000) {}

  push(now: number, tick: number): number {
    const last = this.samples.at(-1);
    if (last && tick < last.tick) this.samples.length = 0;
    this.samples.push({ t: now, tick });
    while (this.samples.length > 2 && now - this.samples[0]!.t > this.windowMs) this.samples.shift();
    const first = this.samples[0]!;
    const span = now - first.t;
    if (span < 250) return Number.NaN; // too short to say
    return (tick - first.tick) / (span / 1000) / 10;
  }

  reset(): void {
    this.samples.length = 0;
  }
}

/**
 * The badge for a screen: re-evaluated on every render and twice a second (so it still appears or goes
 * when readings stall). On each appearance the label is announced once through the polite live region.
 */
export function useSpeedBadge(running: boolean, speed: number, effective: number): { shown: boolean; text: string; label: string } {
  const state = useRef<BadgeState>(BADGE_IDLE);
  const input = useRef<BadgeInput>({ running, speed, effective, now: 0 });
  const [, force] = useState(0);
  input.current = { running, speed, effective, now: now() };
  const before = state.current.shown;
  state.current = stepBadge(state.current, input.current);
  const shown = state.current.shown;
  const label = badgeLabel(speed, effective);
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (shown && !before) {
      announced.current = label;
      announcement.value = label;
      // Cleared after it has been read, so a later toast ending never brings it back (said once per appearance).
      setTimeout(() => {
        if (announcement.value === label) announcement.value = null;
      }, ANNOUNCE_MS);
    } else if (!shown && announced.current !== null) {
      if (announcement.value === announced.current) announcement.value = null;
      announced.current = null;
    }
  });
  useEffect(() => {
    const t = setInterval(() => {
      const next = stepBadge(state.current, { ...input.current, now: now() });
      if (next.shown !== state.current.shown) force((n) => n + 1);
      else state.current = next;
    }, 500);
    return () => {
      clearInterval(t);
      if (announced.current !== null && announcement.value === announced.current) announcement.value = null;
    };
  }, []);
  return { shown, text: badgeText(effective), label };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * The badge on a comparison or experiment run (P4.13): their worker state has no effective speed, so the
 * screen measures it from the ticks it saw run (EffectiveSpeedMeter). Rendered inside the time strip.
 * Never at 'Fast' (no chosen multiple to fall behind) or while paused.
 */
export function PairSpeedBadge({ running, speed, ticks }: { running: boolean; speed: number | 'max'; ticks: number }) {
  const meter = useRef(new EffectiveSpeedMeter());
  const on = running && typeof speed === 'number' && speed > 0;
  const chosen = typeof speed === 'number' ? speed : 0;
  const effective = on ? meter.current.push(now(), ticks) : Number.NaN;
  if (!on) meter.current.reset();
  const badge = useSpeedBadge(on, chosen, Number.isNaN(effective) ? chosen : effective);
  if (!badge.shown) return null;
  return h('span', { class: 'speed-badge', title: badge.label, 'aria-label': badge.label, role: 'img', 'data-testid': 'speed-badge' }, badge.text);
}
