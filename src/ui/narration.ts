/**
 * Narration evidence (P4.9; UX §8.3 "Played only when the evidence condition is true; text always
 * shown"; D08 §09 "Use the available phrase only when its evidence condition is true; otherwise provide
 * the text explanation").
 *
 * One pure rule per phrase over a transition of what the UI already holds (previous view → next view):
 * the speed the dish reports, the player's own Pause and Look gestures, the worker's answer to a command,
 * the inspector's payload, the snapshot's committed births, the notice on screen and the toast. Each rule
 * names its evidence and its visible text (src/ui/strings/narration.ts NARRATION_EVIDENCE); the visible
 * text shows whether or not narration is on. A rule can only pick a phrase id: the words are fixed in
 * src/audio/narration.ts and never carry a number, a dish name or a family nickname.
 *
 * Nothing here reads the world, sends a command or changes the dish: it listens to UI state and asks the
 * narrator (which speaks only with Settings → Sound → Narration on, after a gesture, while not held).
 */
import { effect } from '@preact/signals';
import { PHRASE_IDS, speakPhrase, type PhraseId } from '@audio/narration';
import { R } from '@sim/reasons';
import { ID_STRIDE, type InspectorPayload, type Selection, type SnapshotMsg } from '@worker/protocol';
import { currentNotice } from './notices';
import { dishInfo, inspector, meta, onDishCommand, onDishSnapshot, PLAY_PROMPT, route, selection, settings, sheet, toast } from './state';
import { leadConstraint, makesOwnFood } from './strings/shortcuts';

/** What the inspector shows about the inspected organism, reduced to what the phrases need. */
export interface InspectedView {
  readonly birthId: number;
  /** Its only recorded food is sugar and it took in carbon in the last second (the "Ate last second" line). */
  readonly eatingSugar: boolean;
  /** The leading reason line's kind, if it is one a phrase names. */
  readonly need: 'food' | 'room' | 'resting' | null;
}

/** The answer to the last command the open dish's controls sent. */
export interface CommandView {
  /** Increases with every answered command (a new answer is a new happening). */
  readonly seq: number;
  readonly kind: string;
  readonly accepted: number;
}

export interface NarrationView {
  readonly dishId: string | null;
  /** The dish screen is showing (route 'dish'). */
  readonly onDish: boolean;
  /** The dish's reported speed (0 = paused); null before its first snapshot. */
  readonly speed: number | null;
  /** The player pressed Pause (button or Space) on the running dish within the last few seconds. */
  readonly pauseRequested: boolean;
  /** Increases each time the player chooses Look (Explore) or Inspect (Lab) while another tool was chosen. */
  readonly lookSeq: number;
  readonly command: CommandView | null;
  /** The inspector sheet's organism (null: no organism inspected). */
  readonly inspected: InspectedView | null;
  /** The inspected organism's record says it divided (its birth id), else null. */
  readonly splitRecord: number | null;
  /** Increases with each snapshot holding a committed birth of a followed family member. */
  readonly familySplitSeq: number;
  /** The visible notice (src/ui/notices.ts currentNotice). */
  readonly notice: { readonly id: string; readonly text: string } | null;
  readonly toast: string | null;
}

export const EMPTY_VIEW: NarrationView = {
  dishId: null,
  onDish: false,
  speed: null,
  pauseRequested: false,
  lookSeq: 0,
  command: null,
  inspected: null,
  splitRecord: null,
  familySplitSeq: 0,
  notice: null,
  toast: null,
};

/** How long a Pause gesture counts as the reason the dish paused (the worker answers within a snapshot). */
export const PAUSE_GESTURE_MS = 3000;

/** The toast a successful manual save shows (src/ui/state.ts savedToastText). */
export function isSavedToast(text: string | null): boolean {
  return text !== null && /^Saved “.+”(\.|, but Continue could not be updated)/s.test(text);
}

/** The toast an accepted Undo shows (src/ui/state.ts undo). "Nothing to undo." is not it. */
export const UNDO_TOAST = 'Undone — time rewound to before that change.';

export function isUndoToast(text: string | null): boolean {
  return text === UNDO_TOAST;
}

/** The inspector payload → the inspected organism as the phrases see it (null unless an organism is inspected). */
export function inspectedViewOf(sel: Selection | null, sheetOpen: boolean, p: InspectorPayload | null): InspectedView | null {
  if (!sheetOpen || sel?.kind !== 'entity' || p?.kind !== 'entity' || !p.entity || p.entity.birthId !== sel.birthId) return null;
  const e = p.entity;
  const d = e.diet;
  const foods = e.profile.foods;
  const ownFood = makesOwnFood(e) || d.metabolism === 'photosynthesis' || d.metabolism === 'mixotroph';
  const hunts = d.prey.length > 0 || e.predation !== null;
  const eatingSugar = !ownFood && !hunts && !d.digestsFilm && foods.length === 1 && foods[0] === 'sugar' && e.intakeLastSecond > 0;
  const lead = leadConstraint(e).code;
  let need: InspectedView['need'] = null;
  if ((lead === R.FOOD_ACCESS_LOW && !makesOwnFood(e)) || lead === R.FOOD_NONE_COMPATIBLE) need = 'food';
  else if (lead === R.DIV_BLOCK_PLACEMENT || lead === R.DIV_BLOCK_CROWDING) need = 'room';
  else if (lead === R.RESTING_FOOD_SCARCE || lead === R.RESTING_DRY) need = 'resting';
  return { birthId: e.birthId, eatingSugar, need };
}

/** The inspected organism's record says it divided: its birth id, else null. */
export function splitRecordOf(sel: Selection | null, sheetOpen: boolean, p: InspectorPayload | null): number | null {
  if (!sheetOpen || sel?.kind !== 'entity' || p?.kind !== 'gone' || !p.gone || p.gone.birthId !== sel.birthId) return null;
  return p.gone.divided ? p.gone.birthId : null;
}

/** A snapshot's committed births include a member of a followed family (by the snapshot's own marks). */
export function familyBirthIn(s: Pick<SnapshotMsg, 'events' | 'ids' | 'count' | 'favorites'>): boolean {
  const member = s.favorites?.member;
  if (!member || s.events.length === 0) return false;
  for (const ev of s.events) {
    if (ev.type !== 'birth') continue;
    for (let k = 0; k < s.count; k++) {
      if (s.ids[k * ID_STRIDE] !== ev.birthId) continue;
      if ((member[k] ?? 0) !== 0) return true;
      break;
    }
  }
  return false;
}

type Rule = (prev: NarrationView, next: NarrationView) => boolean;

const sameDish = (a: NarrationView, b: NarrationView) => a.dishId !== null && a.dishId === b.dishId;
const newCommand = (a: NarrationView, b: NarrationView) => b.command !== null && b.command.seq !== a.command?.seq;
const newToast = (a: NarrationView, b: NarrationView) => b.toast !== a.toast;
const newNotice = (a: NarrationView, b: NarrationView) => b.notice !== null && b.notice.id !== a.notice?.id;
/** The inspected organism shows `test` now and did not a moment ago (or another organism is inspected). */
const inspectedBecomes = (a: NarrationView, b: NarrationView, test: (v: InspectedView) => boolean) =>
  b.onDish && b.inspected !== null && test(b.inspected) && !(a.inspected !== null && a.inspected.birthId === b.inspected.birthId && test(a.inspected));

/**
 * The evidence rule of each phrase. Equipment (feeders, lamps and light cycles) is Phase 6: no v1.0 dish
 * records any, so those three phrases have no evidence and are never spoken (P4.9 proposed decision).
 */
export const RULES: Readonly<Record<PhraseId, Rule>> = {
  pressPlay: (a, b) => b.onDish && b.speed === 0 && newNotice(a, b) && b.notice!.id.startsWith('dish-prompt:') && b.notice!.text.endsWith(PLAY_PROMPT),
  pause: (a, b) => b.onDish && sameDish(a, b) && b.pauseRequested && a.speed !== null && a.speed > 0 && b.speed === 0,
  addLife: (a, b) => newCommand(a, b) && b.command!.kind === 'inoculate' && b.command!.accepted > 0,
  addFood: (a, b) => newCommand(a, b) && (b.command!.kind === 'deposit' || b.command!.kind === 'placeObject') && b.command!.accepted > 0,
  lookClosely: (a, b) => b.onDish && b.lookSeq > a.lookSeq,
  eatingSugar: (a, b) => inspectedBecomes(a, b, (v) => v.eatingSugar),
  needsMoreFood: (a, b) => inspectedBecomes(a, b, (v) => v.need === 'food'),
  needsRoom: (a, b) => inspectedBecomes(a, b, (v) => v.need === 'room'),
  resting: (a, b) => inspectedBecomes(a, b, (v) => v.need === 'resting'),
  cellSplit: (a, b) => b.onDish && ((b.splitRecord !== null && b.splitRecord !== a.splitRecord) || (sameDish(a, b) && b.familySplitSeq > a.familySplitSeq)),
  followFamily: (a, b) => b.onDish && newNotice(a, b) && b.notice!.id.startsWith('guide:') && b.notice!.id.endsWith(':follow'),
  feederEmpty: () => false,
  lightOn: () => false,
  lightOff: () => false,
  saved: (a, b) => newToast(a, b) && isSavedToast(b.toast),
  undoRewinds: (a, b) => newToast(a, b) && isUndoToast(b.toast),
};

/** The phrases whose evidence this transition shows, in UX §8.3 order. */
export function phrasesFor(prev: NarrationView, next: NarrationView): PhraseId[] {
  return PHRASE_IDS.filter((id) => RULES[id](prev, next));
}

/** Speak what a transition shows (the narrator refuses everything while narration is off). */
export function narrateTransition(prev: NarrationView, next: NarrationView, speak: (id: PhraseId) => boolean = speakPhrase): PhraseId[] {
  const ids = phrasesFor(prev, next);
  for (const id of ids) speak(id);
  return ids;
}

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : 0);

let wired = false;

/**
 * Watch the UI state and speak the phrases whose evidence appears (from main.tsx, once). The player's
 * Pause and Look gestures are read from the controls themselves (capture listeners that never stop or
 * change the event), the same way the prompt machine notices the Follow button (NoticeHost).
 */
export function wireNarration(): void {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  let pauseAt: number | null = null;
  let lookSeq = 0;
  let commandSeq = 0;
  let familySplitSeq = 0;
  let command: CommandView | null = null;
  let prev: NarrationView = EMPTY_VIEW;

  const view = (): NarrationView => {
    const info = dishInfo.value;
    const m = meta.value;
    const sel = selection.value;
    const sheetOpen = sheet.value === 'inspect';
    const p = inspector.value;
    const n = currentNotice.value;
    return {
      dishId: info?.dishId ?? null,
      onDish: route.value.name === 'dish',
      speed: m ? m.speed : null,
      pauseRequested: pauseAt !== null && nowMs() - pauseAt < PAUSE_GESTURE_MS,
      lookSeq,
      command,
      inspected: inspectedViewOf(sel, sheetOpen, p),
      splitRecord: splitRecordOf(sel, sheetOpen, p),
      familySplitSeq,
      notice: n ? { id: n.id, text: n.text } : null,
      toast: toast.value,
    };
  };

  /** Compare the new view with the last one and speak what it shows (only with narration on). */
  const step = (): void => {
    const next = view();
    if (settings.peek().narration === true && narrateTransition(prev, next).includes('pause')) pauseAt = null;
    prev = next;
  };

  onDishCommand((dishId, payload, res) => {
    if (dishInfo.peek()?.dishId !== dishId) return;
    command = { seq: ++commandSeq, kind: payload.kind, accepted: res.accepted };
    step();
  });
  onDishSnapshot((s) => {
    if (familyBirthIn(s)) {
      familySplitSeq++;
      step();
    }
  });
  document.addEventListener(
    'click',
    (e) => {
      const t = e.target as HTMLElement | null;
      const run = t?.closest?.('[data-testid="run-toggle"]');
      if (run && run.getAttribute('aria-label') === 'Pause') pauseAt = nowMs();
      const look = t?.closest?.('[data-testid="action-look"], [data-testid="lab-cat-inspect"]');
      if (look && look.getAttribute('aria-pressed') === 'false') {
        lookSeq++;
        queueMicrotask(step);
      }
    },
    true,
  );
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === ' ' && route.peek().name === 'dish' && (meta.peek()?.speed ?? 0) > 0) pauseAt = nowMs();
    },
    true,
  );

  // Every signal the view reads re-runs this (settings too, so turning narration on starts from now).
  effect(() => {
    void settings.value.narration;
    step();
  });
}
