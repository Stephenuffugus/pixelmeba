/**
 * P4.3 one optional prompt at a time (UX §3.2; D08 "Guidance without a compulsory tutorial"): the pure
 * prompt machine (src/ui/prompts.ts), tested without a DOM. Each step fires only with its evidence — a
 * snapshot's feeding cue on a Sprinter, a snapshot 'birth' event of a Sprinter, a selection, a command
 * result — and the 120 s line only when no Sprinter has split. Dismissing and "Show me" never send a
 * command: the machine has no way to, and highlightControl only touches a class list.
 */
import { describe, expect, it, vi } from 'vitest';
import { CUE_FEEDING, CUE_STRESSED, E_CUE, E_SPECIES, ENT_STRIDE } from '../../src/worker/protocol';
import {
  highlightControl,
  initialPrompts,
  isGardenDish,
  NO_SPLIT_TICKS,
  promptReduce,
  promptView,
  SHOW_ME_CLASS,
  SHOW_ME_MS,
  SPLIT_SHOW_TICKS,
  type PromptContext,
  type PromptInput,
  type PromptState,
} from '../../src/ui/prompts';
import { PROMPT_TEXT } from '../../src/ui/strings/home';

const A01 = 0;
const B01 = 1;
const CTX: PromptContext = { garden: true, startTick: 0, sprinter: B01, sugarOnly: true, arrival: true };
const ON = { enabled: true, covered: false };

/** A snapshot fixture: entities as [species, cue] pairs, and events. */
function snap(tick: number, speed: number, ents: readonly (readonly [number, number])[], events: readonly { type: string; species: number }[] = []): PromptInput {
  const arr = new Float32Array(Math.max(1, ents.length) * ENT_STRIDE);
  ents.forEach(([sp, cue], k) => {
    arr[k * ENT_STRIDE + E_SPECIES] = sp;
    arr[k * ENT_STRIDE + E_CUE] = cue;
  });
  return { kind: 'snapshot', tick, speed, ents: arr, count: ents.length, events };
}

const QUIET = [
  [B01, 0],
  [A01, CUE_FEEDING], // an alga's cue never counts as a Sprinter eating
  [B01, CUE_STRESSED],
] as const;
const FEEDING = [
  [B01, 0],
  [B01, CUE_FEEDING | CUE_STRESSED],
] as const;
const BIRTH = [{ type: 'birth', species: B01 }];

function feed(s: PromptState, ...inputs: PromptInput[]): PromptState {
  return inputs.reduce(promptReduce, s);
}
const shown = (s: PromptState) => promptView(s, ON)?.text ?? null;

/** Arrival cleared by Run, a Sprinter selected while running, inspector closed: the machine waits for evidence. */
function afterIntro(ctx: PromptContext = CTX): PromptState {
  return feed(initialPrompts(ctx), snap(10, 1, QUIET), { kind: 'arrivalCleared' }, { kind: 'select', organism: true, species: B01 }, { kind: 'select', organism: false, species: null });
}

describe('the first steps', () => {
  it('nothing shows during the arrival line; "Tap a Sprinter." follows when it clears, and is done when an organism is selected', () => {
    let s = initialPrompts(CTX);
    expect(shown(s)).toBeNull(); // the dish's own start line shows instead (state.ts PLAY_PROMPT)
    s = feed(s, snap(0, 0, QUIET));
    expect(shown(s)).toBeNull();
    s = feed(s, snap(5, 1, QUIET), { kind: 'arrivalCleared' });
    expect(shown(s)).toBe('Tap a Sprinter.');
    expect(promptView(s, ON)!.showMe).toBe('action-look');
    // Evidence is a selection, not time.
    s = feed(s, snap(400, 1, QUIET));
    expect(shown(s)).toBe('Tap a Sprinter.');
    s = feed(s, { kind: 'select', organism: true, species: A01 });
    expect(shown(s)).not.toBe('Tap a Sprinter.');
  });

  it('"Press Run." only when the dish was paused when step 1 was done, and done when it runs', () => {
    // Paused at the selection (arrival dismissed with ✕, never run).
    let s = feed(initialPrompts(CTX), snap(0, 0, QUIET), { kind: 'arrivalCleared' }, { kind: 'select', organism: true, species: B01 });
    expect(shown(s)).toBe('Press Run.');
    expect(promptView(s, ON)!.showMe).toBe('run-toggle');
    s = feed(s, snap(0, 0, QUIET));
    expect(shown(s)).toBe('Press Run.');
    s = feed(s, snap(1, 1, QUIET));
    expect(shown(s)).toBeNull(); // no further evidence yet
    expect(s.resolved).toContain('pressRun');
    // Running at the selection: step 2 is skipped.
    const r = afterIntro();
    expect(r.resolved).toContain('pressRun');
    expect(shown(r)).toBeNull();
  });
});

describe('evidence-gated steps', () => {
  it('"It’s eating sugar" only after a snapshot shows a Sprinter with the feeding cue; done when the inspector opens on a Sprinter', () => {
    let s = afterIntro();
    s = feed(s, snap(20, 1, QUIET), snap(30, 1, QUIET));
    expect(shown(s)).toBeNull();
    s = feed(s, snap(40, 1, FEEDING));
    expect(shown(s)).toBe(PROMPT_TEXT.eating);
    expect(shown(s)).toBe('It’s eating sugar — tap to see how much.');
    expect(promptView(s, ON)!.showMe).toBeNull(); // nothing to point at until a Sprinter is in the inspector
    // Opening the inspector on another kind is not the evidence.
    s = feed(s, { kind: 'select', organism: true, species: A01 });
    expect(shown(s)).toBe(PROMPT_TEXT.eating);
    s = feed(s, { kind: 'select', organism: true, species: B01 });
    expect(shown(s)).toBeNull();
    expect(s.resolved).toContain('eating');
  });

  it('the eating step is skipped (never reworded) when the recorded diet does not list sugar as the Sprinter’s only food', () => {
    let s = afterIntro({ ...CTX, sugarOnly: false });
    s = feed(s, snap(40, 1, FEEDING));
    expect(shown(s)).toBeNull();
    expect(s.resolved).toContain('eating');
  });

  it('"A cell split." only after a snapshot birth event of a Sprinter; another kind’s birth is not evidence', () => {
    let s = afterIntro({ ...CTX, sugarOnly: false });
    s = feed(s, snap(50, 1, QUIET, [{ type: 'birth', species: A01 }]), snap(60, 1, QUIET, [{ type: 'death', species: B01 }]));
    expect(shown(s)).toBeNull();
    s = feed(s, snap(70, 1, QUIET, BIRTH));
    expect(shown(s)).toBe('A cell split.');
    // An announcement: it gives way after SPLIT_SHOW_TICKS of dish time; the Feed prompt follows.
    s = feed(s, snap(70 + SPLIT_SHOW_TICKS - 1, 1, QUIET));
    expect(shown(s)).toBe('A cell split.');
    s = feed(s, snap(70 + SPLIT_SHOW_TICKS, 1, QUIET));
    expect(shown(s)).toBe(PROMPT_TEXT.feed);
  });

  it('the 120 s line appears only with zero Sprinter births, and a later birth replaces it with "A cell split."', () => {
    let s = afterIntro({ ...CTX, sugarOnly: false });
    s = feed(s, snap(NO_SPLIT_TICKS - 1, 1, QUIET));
    expect(shown(s)).toBeNull();
    s = feed(s, snap(NO_SPLIT_TICKS, 1, QUIET));
    expect(shown(s)).toBe('Nothing has split yet — tap one to see what’s stopping it.');
    expect(promptView(s, ON)!.showMe).toBeNull();
    s = feed(s, { kind: 'select', organism: true, species: B01 });
    expect(promptView(s, ON)!.showMe).toBe('shortcut-why'); // "Why did it stop?" once a Sprinter is selected
    s = feed(s, snap(NO_SPLIT_TICKS + 30, 1, QUIET, BIRTH));
    expect(shown(s)).toBe('A cell split.');

    // With a Sprinter birth before 120 s, the 120 s line never appears.
    let t = afterIntro({ ...CTX, sugarOnly: false });
    t = feed(t, snap(300, 1, QUIET, BIRTH), { kind: 'dismiss', step: 'split' });
    for (let tick = 400; tick <= NO_SPLIT_TICKS * 3; tick += 200) {
      t = feed(t, snap(tick, 1, QUIET));
      expect(shown(t)).not.toBe(PROMPT_TEXT.noSplit);
    }
  });

  it('a loaded or continued Garden dish never says "Nothing has split yet" (fix round 1): the machine did not watch it from tick 0', () => {
    // A save from late in a run, where Sprinters split long ago: the prompts begin at its tick, not at 0.
    const late = { ...CTX, sugarOnly: false, startTick: 18_000 };
    let s = feed(initialPrompts(late), snap(late.startTick, 0, QUIET), { kind: 'arrivalCleared' }, { kind: 'select', organism: true, species: B01 }, { kind: 'select', organism: false, species: null });
    for (let tick = late.startTick; tick <= late.startTick + NO_SPLIT_TICKS * 3; tick += 100) {
      s = feed(s, snap(tick, 1, QUIET));
      expect(shown(s)).not.toBe(PROMPT_TEXT.noSplit); // the old machine said it at startTick + 1200
    }
    // The line is skipped silently once 120 s pass, so Feed still follows.
    expect(s.resolved).toContain('noSplit');
    expect(shown(s)).toBe(PROMPT_TEXT.feed);
    // A live Sprinter birth is still announced (it is a recorded event seen now).
    s = feed(s, { kind: 'command', command: 'deposit', accepted: 3 }, snap(late.startTick + NO_SPLIT_TICKS * 3 + 10, 1, QUIET, BIRTH));
    expect(shown(s)).toBe('A cell split.');

    // A dish opened at tick 600 of a fresh run: 120 s of dish time are reached at tick 1200, but its first
    // 60 s were not watched, so the line is still not said.
    let m = feed(initialPrompts({ ...CTX, sugarOnly: false, startTick: 600 }), snap(600, 0, QUIET), { kind: 'arrivalCleared' }, { kind: 'select', organism: true, species: B01 });
    m = feed(m, snap(NO_SPLIT_TICKS, 1, QUIET), snap(600 + NO_SPLIT_TICKS, 1, QUIET));
    expect(shown(m)).not.toBe(PROMPT_TEXT.noSplit);
  });

  it('"tap one" needs a Sprinter to tap: with none alive at 120 s the line is skipped silently', () => {
    const NONE = [[A01, 0]] as const;
    let s = afterIntro({ ...CTX, sugarOnly: false });
    s = feed(s, snap(NO_SPLIT_TICKS, 1, NONE));
    expect(shown(s)).toBe(PROMPT_TEXT.feed);
    expect(s.resolved).toContain('noSplit');
  });

  it('the Feed prompt is done on an accepted deposit only; Follow this family? follows only after a real Sprinter division', () => {
    let s = afterIntro({ ...CTX, sugarOnly: false });
    s = feed(s, snap(NO_SPLIT_TICKS, 1, QUIET), { kind: 'dismiss', step: 'noSplit' });
    expect(shown(s)).toBe(PROMPT_TEXT.feed);
    expect(promptView(s, ON)!.showMe).toBe('action-feed');
    s = feed(s, { kind: 'command', command: 'deposit', accepted: 0 }, { kind: 'command', command: 'inoculate', accepted: 5 });
    expect(shown(s)).toBe(PROMPT_TEXT.feed);
    s = feed(s, { kind: 'command', command: 'deposit', accepted: 29 });
    expect(shown(s)).toBeNull(); // no division yet: nothing to follow
    s = feed(s, snap(NO_SPLIT_TICKS + 100, 1, QUIET, BIRTH));
    expect(shown(s)).toBe('A cell split.');
    s = feed(s, { kind: 'dismiss', step: 'split' });
    expect(shown(s)).toBe('Follow this family?');
    expect(promptView(s, ON)!.showMe).toBe('follow-family');
    s = feed(s, { kind: 'followed' });
    expect(shown(s)).toBeNull();
  });
});

describe('one prompt at a time', () => {
  it('a later step’s evidence waits behind the visible one; ✕ moves to the next eligible step', () => {
    let s = afterIntro();
    s = feed(s, snap(40, 1, FEEDING), snap(50, 1, FEEDING, BIRTH));
    expect(shown(s)).toBe(PROMPT_TEXT.eating);
    s = feed(s, { kind: 'dismiss', step: 'eating' });
    expect(shown(s)).toBe('A cell split.');
    // A dismissal of a step that is not visible changes nothing.
    const same = feed(s, { kind: 'dismiss', step: 'feed' });
    expect(shown(same)).toBe('A cell split.');
    expect(same.resolved).not.toContain('feed');
  });

  it('every input sequence shows at most one prompt, and a resolved step never comes back', () => {
    let s = initialPrompts(CTX);
    const seen: string[] = [];
    const inputs: PromptInput[] = [
      snap(1, 1, QUIET),
      { kind: 'arrivalCleared' },
      { kind: 'select', organism: true, species: B01 },
      snap(20, 1, FEEDING),
      { kind: 'dismiss', step: 'eating' },
      snap(30, 1, FEEDING, BIRTH),
      { kind: 'dismiss', step: 'split' },
      { kind: 'command', command: 'deposit', accepted: 3 },
      { kind: 'dismiss', step: 'follow' },
      snap(5000, 1, FEEDING, BIRTH),
    ];
    for (const i of inputs) {
      s = promptReduce(s, i);
      const v = promptView(s, ON);
      if (v && seen[seen.length - 1] !== v.step) seen.push(v.step);
    }
    expect(seen).toEqual(['tapSprinter', 'eating', 'split', 'feed', 'follow']);
    expect(new Set(seen).size).toBe(seen.length);
    expect(shown(s)).toBeNull();
  });
});

describe('when prompts are off or do not apply', () => {
  it('Settings "Show gentle prompts" off → none; a covering sheet → none (the step waits)', () => {
    const s = feed(afterIntro(), snap(40, 1, FEEDING));
    expect(promptView(s, { enabled: false, covered: false })).toBeNull();
    expect(promptView(s, { enabled: true, covered: true })).toBeNull();
    expect(promptView(s, ON)!.text).toBe(PROMPT_TEXT.eating);
  });

  it('a dish that is not the Play-shelf Garden → none, whatever the evidence', () => {
    let s = initialPrompts({ ...CTX, garden: false, arrival: false });
    s = feed(s, snap(10, 1, FEEDING, BIRTH), { kind: 'select', organism: true, species: B01 }, snap(NO_SPLIT_TICKS * 2, 1, QUIET));
    expect(promptView(s, ON)).toBeNull();
    expect(isGardenDish({ recipeId: 'FIRST_DISH_V1' })).toBe(true);
    expect(isGardenDish({ recipeId: null, whatIfSourceId: 'FIRST_DISH_V1' })).toBe(true);
    expect(isGardenDish({ recipeId: 'FOOD_TRAIL_V1', whatIfSourceId: null })).toBe(false);
  });
});

describe('dismiss and Show me never send a command', () => {
  it('the machine returns state only; Show me only adds a class to the control for 3 s (never click or focus)', () => {
    const s = feed(afterIntro({ ...CTX, sugarOnly: false }), snap(NO_SPLIT_TICKS, 1, QUIET), { kind: 'dismiss', step: 'noSplit' });
    const view = promptView(s, ON)!;
    expect(view.showMe).toBe('action-feed');
    const classes = new Set<string>();
    const click = vi.fn();
    const focus = vi.fn();
    const el = { classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) }, click, focus };
    const timers: { fn: () => void; ms: number }[] = [];
    const asked: string[] = [];
    const ok = highlightControl(
      {
        querySelector: (sel: string) => {
          asked.push(sel);
          return sel === '[data-testid="action-feed"]' ? el : null;
        },
      },
      view.showMe!,
      (fn, ms) => timers.push({ fn, ms }),
    );
    expect(ok).toBe(true);
    expect(classes.has(SHOW_ME_CLASS)).toBe(true);
    expect(timers.map((t) => t.ms)).toEqual([SHOW_ME_MS]);
    timers[0]!.fn();
    expect(classes.has(SHOW_ME_CLASS)).toBe(false);
    expect(click).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
    // An absent control: nothing happens.
    expect(highlightControl({ querySelector: () => null }, 'follow-family', () => undefined)).toBe(false);
    // The machine module has no command path: its exports are pure functions and constants.
    const after = promptReduce(s, { kind: 'dismiss', step: 'feed' });
    expect(after).not.toBe(s);
    expect(s.current).toBe('feed'); // the input state is not mutated
  });
});
