/**
 * One optional prompt at a time (P4.3; UX §3.2 "First minutes"; D08 "Guidance without a compulsory
 * tutorial"). A pure state machine: it is fed published snapshots, the player's selection, command
 * results and dismissals, and keeps time in dish ticks. It never sends a command, never reads or changes
 * the world, and no step advances without its evidence:
 *
 *   0 arrival      the dish's own start line ("Press play and look closely.", src/ui/state.ts) is showing:
 *                  nothing else shows until it clears (Run, or ✕).
 *   1 tapSprinter  "Tap a Sprinter." — done when an organism is selected.
 *   2 pressRun     "Press Run." — only if the dish was paused when step 1 was done; done when it runs.
 *   3 eating       after a snapshot shows a Sprinter (B01) with the feeding cue (CUE_FEEDING in E_CUE), and
 *                  only when the dish's recorded diet lists sugar as the Sprinter's only food (else the step
 *                  is skipped, because the sentence names sugar); done when the inspector opens on a Sprinter.
 *   4 split        "A cell split." after a snapshot's 'birth' event of a Sprinter (a committed division).
 *     noSplit      "Nothing has split yet — tap one to see what's stopping it." when the dish has run 120
 *                  dish seconds since it started (tick 0) with no Sprinter birth and a Sprinter is alive to
 *                  tap. The claim covers the dish's whole life, so it is made only when this machine has
 *                  watched the dish from tick 0 (a Garden started or made from a What if? idea in this page
 *                  session); on a loaded or continued dish the machine cannot know what happened before it
 *                  began, and the line is skipped silently once 120 s pass (never guessed). Show me points
 *                  at "Why did it stop?" once a Sprinter is in the inspector. A later birth replaces it with
 *                  step 4.
 *   5 feed         after step 4 (either line); done on an accepted deposit command.
 *   6 follow       "Follow this family?" after a real Sprinter division and step 5; Show me points at the
 *                  inspector's Follow button when it exists; done when the player presses it.
 *
 * ✕ resolves the visible step and the next eligible one follows. "Show me" only highlights a control
 * (src/ui/views/NoticeHost.tsx highlightControl). "A cell split." is an announcement of a recorded event:
 * it gives way after SPLIT_SHOW_TICKS of dish time (its evidence was already shown).
 */
import { CUE_FEEDING, E_CUE, E_SPECIES, ENT_STRIDE } from '@worker/protocol';
import { PROMPT_TEXT, type PromptStep } from './strings/home';

export type { PromptStep } from './strings/home';

/** The recipe of the Play shelf's Garden (UX §2.2): prompts appear only on its dishes. */
export const GARDEN_RECIPE = 'FIRST_DISH_V1';
/** UX §3.2 step 4's fallback: 120 dish seconds since the dish started (tick 0) without a Sprinter division. */
export const NO_SPLIT_TICKS = 1200;
/** How long "A cell split." stays before the next eligible prompt (dish ticks). */
export const SPLIT_SHOW_TICKS = 150;

/** What the machine knows about the dish when the prompts begin. */
export interface PromptContext {
  /** A Play-shelf Garden dish (recipe or What if? source FIRST_DISH_V1). */
  readonly garden: boolean;
  /**
   * Dish tick when the prompts began. Only a machine that began at tick 0 has seen every Sprinter birth of
   * the dish, so only it may say "Nothing has split yet" (the 120 s count is dish time from tick 0).
   */
  readonly startTick: number;
  /** The Sprinter's (B01) species index in this world, or -1. */
  readonly sprinter: number;
  /** The recorded diet lists sugar as the Sprinter's only food (step 3 names sugar). */
  readonly sugarOnly: boolean;
  /** The dish's start line is showing (step 0). */
  readonly arrival: boolean;
}

export interface PromptState {
  readonly ctx: PromptContext;
  readonly tick: number;
  readonly running: boolean;
  readonly arrivalOpen: boolean;
  /** The inspector shows a Sprinter now. */
  readonly sprinterInspected: boolean;
  readonly feedingSeen: boolean;
  readonly sprinterBirth: boolean;
  /** The latest snapshot shows at least one Sprinter ("tap one" needs one to tap). */
  readonly sprinterAlive: boolean;
  /** Whether the dish was paused when step 1 was resolved (null until then). */
  readonly pausedAtStep1: boolean | null;
  /** Steps done, dismissed or skipped, in the order they were resolved. */
  readonly resolved: readonly PromptStep[];
  readonly current: PromptStep | null;
  /** Dish tick when `current` became visible. */
  readonly shownAt: number;
}

export type PromptInput =
  /** A published snapshot of this dish (tick, speed, entity records and the events since the last one). */
  | {
      readonly kind: 'snapshot';
      readonly tick: number;
      readonly speed: number;
      readonly ents: Float32Array;
      readonly count: number;
      readonly events: readonly { readonly type: string; readonly species: number }[];
    }
  /** What the inspector shows: an organism (with its species index once known) or nothing. */
  | { readonly kind: 'select'; readonly organism: boolean; readonly species: number | null }
  /** The dish's start line cleared (Run or ✕). */
  | { readonly kind: 'arrivalCleared' }
  /** A command's result as the worker answered it. */
  | { readonly kind: 'command'; readonly command: string; readonly accepted: number }
  /** The player pressed the inspector's Follow button. */
  | { readonly kind: 'followed' }
  /** ✕ on a visible step. */
  | { readonly kind: 'dismiss'; readonly step: PromptStep };

/** The visible prompt: its step, sentence and the control "Show me" highlights (a data-testid), if any. */
export interface PromptView {
  readonly step: PromptStep;
  readonly text: string;
  readonly showMe: string | null;
}

export function isGardenDish(info: { readonly recipeId: string | null; readonly whatIfSourceId?: string | null }): boolean {
  return info.recipeId === GARDEN_RECIPE || info.whatIfSourceId === GARDEN_RECIPE;
}

export function initialPrompts(ctx: PromptContext): PromptState {
  return advance({
    ctx,
    tick: ctx.startTick,
    running: false,
    arrivalOpen: ctx.arrival,
    sprinterInspected: false,
    feedingSeen: false,
    sprinterBirth: false,
    sprinterAlive: false,
    pausedAtStep1: null,
    resolved: [],
    current: null,
    shownAt: ctx.startTick,
  });
}

const has = (s: PromptState, step: PromptStep) => s.resolved.includes(step);

function resolve(s: PromptState, step: PromptStep): PromptState {
  if (has(s, step)) return s;
  const resolved = [...s.resolved, step];
  // Step 1 resolved: remember whether the dish was paused then (step 2 is offered only if it was).
  const pausedAtStep1 = step === 'tapSprinter' && s.pausedAtStep1 === null ? !s.running : s.pausedAtStep1;
  return { ...s, resolved, pausedAtStep1, current: s.current === step ? null : s.current };
}

function sprinterCount(ents: Float32Array, count: number, sprinter: number): number {
  if (sprinter < 0) return 0;
  const n = Math.min(count, Math.floor(ents.length / ENT_STRIDE));
  let c = 0;
  for (let k = 0; k < n; k++) if (ents[k * ENT_STRIDE + E_SPECIES] === sprinter) c++;
  return c;
}

function sprinterFeeding(ents: Float32Array, count: number, sprinter: number): boolean {
  if (sprinter < 0) return false;
  const n = Math.min(count, Math.floor(ents.length / ENT_STRIDE));
  for (let k = 0; k < n; k++) {
    const o = k * ENT_STRIDE;
    if (ents[o + E_SPECIES] === sprinter && ((ents[o + E_CUE]! | 0) & CUE_FEEDING) !== 0) return true;
  }
  return false;
}

export function promptReduce(s: PromptState, input: PromptInput): PromptState {
  if (!s.ctx.garden) return s;
  let n = s;
  switch (input.kind) {
    case 'snapshot': {
      const sp = s.ctx.sprinter;
      n = {
        ...n,
        tick: input.tick,
        running: input.speed > 0,
        feedingSeen: n.feedingSeen || sprinterFeeding(input.ents, input.count, sp),
        sprinterBirth: n.sprinterBirth || (sp >= 0 && input.events.some((e) => e.type === 'birth' && e.species === sp)),
        sprinterAlive: sprinterCount(input.ents, input.count, sp) > 0,
      };
      break;
    }
    case 'select': {
      const sprinter = input.organism && input.species !== null && input.species === s.ctx.sprinter;
      const opened = sprinter && !s.sprinterInspected;
      n = { ...n, sprinterInspected: sprinter };
      if (input.organism) n = resolve(n, 'tapSprinter');
      // Step 3 is done when the inspector opens on a Sprinter while it is showing.
      if (opened && n.current === 'eating') n = resolve(n, 'eating');
      break;
    }
    case 'arrivalCleared':
      n = { ...n, arrivalOpen: false };
      break;
    case 'command':
      if (input.command === 'deposit' && input.accepted > 0) n = resolve(n, 'feed');
      break;
    case 'followed':
      n = resolve(n, 'follow');
      break;
    case 'dismiss':
      if (n.current === input.step) n = resolve(n, input.step);
      break;
  }
  return advance(n);
}

/** Resolve what the evidence settles, then choose the visible step (the current one stays until resolved). */
function advance(s0: PromptState): PromptState {
  let s = s0;
  if (!s.ctx.garden) return { ...s, current: null };
  // Step 2: offered only when the dish was paused at step 1; running settles it either way.
  if (has(s, 'tapSprinter') && !has(s, 'pressRun') && (s.running || s.pausedAtStep1 === false)) s = resolve(s, 'pressRun');
  // Step 3 names sugar: without a sugar-only recorded diet it is skipped, never reworded.
  if (!s.ctx.sugarOnly && !has(s, 'eating')) s = resolve(s, 'eating');
  // A real division replaces the "nothing has split yet" line that is showing.
  if (s.sprinterBirth && s.current === 'noSplit') s = resolve(s, 'noSplit');
  // 120 dish seconds without a Sprinter birth, but the line cannot be said truthfully (the machine did not
  // watch the dish from tick 0, or no Sprinter is alive to tap): skip it silently so Feed can follow.
  if (!has(s, 'noSplit') && !has(s, 'split') && !s.sprinterBirth && noSplitDue(s) && !noSplitSayable(s) && s.current !== 'noSplit') s = resolve(s, 'noSplit');
  // The announcement gives way after a while (its evidence was shown).
  if (s.current === 'split' && s.tick - s.shownAt >= SPLIT_SHOW_TICKS) s = resolve(s, 'split');
  if (s.current !== null || s.arrivalOpen) return s;
  const next = nextStep(s);
  return next === null ? s : { ...s, current: next, shownAt: s.tick };
}

/** 120 s of dish time have passed: since tick 0 when watched from the start, else since the prompts began. */
function noSplitDue(s: PromptState): boolean {
  return s.tick - s.ctx.startTick >= NO_SPLIT_TICKS;
}

/** "Nothing has split yet — tap one" is true only for a dish watched from tick 0 with a Sprinter to tap. */
function noSplitSayable(s: PromptState): boolean {
  return s.ctx.startTick === 0 && s.sprinterAlive;
}

function nextStep(s: PromptState): PromptStep | null {
  if (!has(s, 'tapSprinter')) return 'tapSprinter';
  if (!has(s, 'pressRun')) return 'pressRun';
  if (!has(s, 'eating') && s.feedingSeen) return 'eating';
  if (!has(s, 'split') && s.sprinterBirth) return 'split';
  if (!has(s, 'noSplit') && !has(s, 'split') && !s.sprinterBirth && noSplitDue(s) && noSplitSayable(s)) return 'noSplit';
  if (!has(s, 'feed') && (has(s, 'split') || has(s, 'noSplit'))) return 'feed';
  if (!has(s, 'follow') && has(s, 'feed') && s.sprinterBirth) return 'follow';
  return null;
}

/**
 * The prompt to show now, or null: none while prompts are off (Settings "Show gentle prompts"), on a
 * dish that is not the Garden, during the start line, or while a sheet covers the dish.
 */
export function promptView(s: PromptState, opts: { readonly enabled: boolean; readonly covered: boolean }): PromptView | null {
  if (!opts.enabled || opts.covered || !s.ctx.garden || s.current === null || s.current === 'arrival') return null;
  const step = s.current;
  return { step, text: PROMPT_TEXT[step], showMe: showMeTarget(s, step) };
}

function showMeTarget(s: PromptState, step: Exclude<PromptStep, 'arrival'>): string | null {
  switch (step) {
    case 'tapSprinter':
      return 'action-look'; // the tool that taps organisms (Look is the default)
    case 'pressRun':
      return 'run-toggle';
    case 'eating':
      return s.sprinterInspected ? 'shortcut-eat' : null;
    case 'noSplit':
      return s.sprinterInspected ? 'shortcut-why' : null;
    case 'feed':
      return 'action-feed';
    case 'follow':
      return 'follow-family'; // shown only when the button exists (the inspector is open on an organism)
    case 'split':
      return null;
  }
}

/** The class "Show me" adds to a control, and for how long (UX §3.2: highlight without using it). */
export const SHOW_ME_CLASS = 'show-me';
export const SHOW_ME_MS = 3000;

/** A control as "Show me" sees it: only its class list is touched (never click, focus or a command). */
interface Highlightable {
  readonly classList: { add(c: string): void; remove(c: string): void };
}

/**
 * Highlight the control with `testId` for SHOW_ME_MS without pressing it. Returns false when it is not
 * on screen. The pulse is CSS and stops under reduced motion (styles.css `.show-me`).
 */
export function highlightControl(
  root: { querySelector(sel: string): Highlightable | null },
  testId: string,
  later: (fn: () => void, ms: number) => unknown = setTimeout,
): boolean {
  const el = root.querySelector(`[data-testid="${testId}"]`);
  if (!el) return false;
  el.classList.add(SHOW_ME_CLASS);
  later(() => el.classList.remove(SHOW_ME_CLASS), SHOW_ME_MS);
  return true;
}
