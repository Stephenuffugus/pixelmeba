/**
 * The dish view's one visible notice (P4.3; src/ui/notices.ts), in the place of the old prompt block:
 * the same spot over the dish, role="status". It gathers its sources and shows the one notices.ts picks:
 *
 * - an experiment card's waiting stamp (kind 'experiment'; data-testid experiment-waiting);
 * - the dish's own start line, `prompt` in src/ui/state.ts (kind 'prompt'), e.g. "Press play and look
 *   closely." or an experiment card's start prompt;
 * - otherwise the Garden's one optional prompt from the pure machine in src/ui/prompts.ts (kind 'prompt'),
 *   fed published snapshots, the inspector's selection and command results only;
 * - goals and story cards request their own notices through notices.ts (stage 2).
 *
 * Nothing here changes the world: ✕ and "Show me" never send a command; "Show me" only adds a highlight
 * class to a control for 3 s. While the discovery card or a followed family's extinction card is open
 * nothing shows; the card on screen keeps the place until it closes (notices.ts, noticeCards.ts). Toasts stay with the
 * app's one LiveRegion.
 */
import { effect, signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { whatIfOpen } from '../panels/WhatIfState';
import {
  dishInfo,
  dismissExperimentWaiting,
  experimentWaiting,
  inspector,
  keepFlow,
  onDishCommand,
  onDishSnapshot,
  prompt,
  selection,
  settings,
  sheet,
} from '../state';
import { wireNoticeCards } from '../noticeCards';
import { currentNotice, dismissNotice, requestNotice, withdrawKind, type NoticeRequest } from '../notices';
import { highlightControl, initialPrompts, isGardenDish, promptReduce, promptView, type PromptInput, type PromptState } from '../prompts';
import { PROMPT_UI } from '../strings/home';
import { labTray } from './LabView';

/** Each open dish's prompt machine, by dish id (UI state for this page session only). */
const machines: Record<string, PromptState> = {};
/** A change counter, so the notice effect re-runs when a machine advances. */
const machineVersion = signal(0);

function machineFor(dishId: string): PromptState | null {
  const info = dishInfo.value;
  if (!info || info.dishId !== dishId) return machines[dishId] ?? null;
  let m = machines[dishId];
  if (!m) {
    const sprinter = info.speciesIds.indexOf('B01');
    const foods = sprinter >= 0 ? (info.speciesDiets?.[sprinter]?.foods ?? []) : [];
    m = initialPrompts({
      garden: isGardenDish(info),
      // The dish's tick when this machine first sees it: 0 only for a dish started (or made from a What
      // if? idea) in this page session, the one case where "Nothing has split yet" can be known (prompts.ts).
      startTick: info.tick,
      sprinter,
      sugarOnly: foods.length === 1 && foods[0] === 'sugar',
      arrival: prompt.value !== null,
    });
    machines[dishId] = m;
  }
  return m;
}

function feedMachine(dishId: string, input: PromptInput): void {
  const m = machineFor(dishId);
  if (!m) return;
  const next = promptReduce(m, input);
  if (next !== m) {
    machines[dishId] = next;
    machineVersion.value = machineVersion.peek() + 1;
  }
}

/** A sheet, What if?, the keep choice or a Lab tray covers the dish: the optional prompt waits. */
function dishCovered(): boolean {
  const sh = sheet.value;
  return (sh !== 'none' && sh !== 'inspect') || whatIfOpen.value !== null || keepFlow.value !== null || labTray.value !== null;
}

let wired = false;

/**
 * Connect the sources once per page (module-level effects; they outlive one mount of the dish screen so
 * a dish's machine keeps its evidence while the player visits Home or the Notebook).
 */
function wire(): void {
  if (wired) return;
  wired = true;
  onDishSnapshot((s) => {
    feedMachine(s.dishId, {
      kind: 'snapshot',
      tick: s.tick,
      speed: s.speed,
      ents: s.ents,
      count: s.count,
      events: s.events,
    });
  });
  onDishCommand((dishId, payload, res) => feedMachine(dishId, { kind: 'command', command: payload.kind, accepted: res.accepted }));
  // The dish's start line clearing (Run, ✕) opens the way for the optional prompts.
  effect(() => {
    const info = dishInfo.value;
    const p = prompt.value;
    if (info && p === null) feedMachine(info.dishId, { kind: 'arrivalCleared' });
  });
  // What the inspector shows: an organism (its species once the worker answered) or nothing.
  effect(() => {
    const info = dishInfo.value;
    if (!info) return;
    const sel = selection.value;
    const organism = sel?.kind === 'entity' && sheet.value === 'inspect';
    const ent = inspector.value?.entity;
    const species = organism && ent && sel?.kind === 'entity' && ent.birthId === sel.birthId ? ent.speciesIdx : null;
    feedMachine(info.dishId, { kind: 'select', organism, species });
  });
  // The discovery card and the extinction card sit in the notice's place: nothing shows while either is
  // asked for, one card at a time, never displaced (notices.ts shownCard; src/ui/noticeCards.ts; D-0076).
  wireNoticeCards();
  // The sources → the notice requests (experiment; prompt = the dish's own line, else the optional prompt).
  effect(() => {
    void machineVersion.value;
    const info = dishInfo.value;
    const w = experimentWaiting.value;
    if (info && w && w.dishId === info.dishId) {
      requestNotice({
        kind: 'experiment',
        id: `experiment:${w.dishId}:${w.cardId}:${w.text}`,
        text: w.text,
        testId: 'experiment-waiting',
        dismissLabel: 'Dismiss this notice',
        onDismiss: dismissExperimentWaiting,
      });
    } else withdrawKind('experiment');
    const p = prompt.value;
    if (info && p !== null) {
      requestNotice({ kind: 'prompt', id: `dish-prompt:${info.dishId}:${p}`, text: p, onDismiss: () => (prompt.value = null) });
      return;
    }
    const m = info ? machines[info.dishId] : undefined;
    const view = m ? promptView(m, { enabled: settings.value.showPrompts, covered: dishCovered() }) : null;
    if (!info || !view) {
      withdrawKind('prompt');
      return;
    }
    const dishId = info.dishId;
    const req: NoticeRequest = {
      kind: 'prompt',
      id: `guide:${dishId}:${view.step}`,
      text: view.text,
      testId: 'guide-prompt',
      actions: view.showMe ? [{ label: PROMPT_UI.showMe, testId: 'show-me', run: () => void highlightControl(document, view.showMe!) }] : [],
      onDismiss: () => feedMachine(dishId, { kind: 'dismiss', step: view.step }),
    };
    requestNotice(req);
  });
}

export function NoticeHost() {
  useEffect(() => {
    wire();
    // The dish's machine exists from the moment its screen opens (its start tick and start line).
    const info = dishInfo.value;
    if (info) {
      machineFor(info.dishId);
      machineVersion.value = machineVersion.peek() + 1;
    }
    // "Follow this family?" is done when the player presses the inspector's Follow button.
    const onClick = (e: MouseEvent) => {
      const d = dishInfo.value;
      if (d && (e.target as HTMLElement | null)?.closest?.('[data-testid="follow-family"]')) feedMachine(d.dishId, { kind: 'followed' });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  const n = currentNotice.value;
  // "Show me" is offered only while its control is on screen (e.g. the Follow button needs the inspector):
  // checked after each render, since the sheets render after this host.
  void sheet.value;
  void inspector.value;
  const [avail, setAvail] = useState(false);
  useEffect(() => {
    const now = n !== null && showMeAvailable(n);
    if (now !== avail) setAvail(now);
  });
  if (!n) return null;
  const actions = (n.actions ?? []).filter((a) => a.testId !== 'show-me' || avail);
  return (
    <div class="prompt" role="status" data-testid={n.testId}>
      <p>{n.text}</p>
      {actions.length > 0 ? (
        <span class="notice-actions">
          {actions.map((a) => (
            <button key={a.label} class="btn" data-testid={a.testId} onClick={a.run}>
              {a.label}
            </button>
          ))}
        </span>
      ) : null}
      <button class="btn ghost" onClick={() => dismissNotice(n.id)} aria-label={n.dismissLabel ?? PROMPT_UI.dismiss}>
        ✕
      </button>
    </div>
  );
}

function showMeAvailable(n: NoticeRequest): boolean {
  if (!n.id.startsWith('guide:')) return true;
  const info = dishInfo.value;
  const m = info ? machines[info.dishId] : undefined;
  const target = m ? promptView(m, { enabled: true, covered: false })?.showMe : null;
  return !!target && typeof document !== 'undefined' && document.querySelector(`[data-testid="${target}"]`) !== null;
}
