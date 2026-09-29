/**
 * What if? sheet state and actions (P2.6; UX §3.4, D09 §3–§5). UI state only: the worker builds every
 * preview, keeps the current dish through the save flow and starts the new dish. Nothing here touches
 * a world; choosing "Another idea" reads catalog order from the worker, never a random stream.
 */
import { batch, signal } from '@preact/signals';
import type { Speed, WhatIfAnswer, WhatIfKeep, WhatIfPick } from '@worker/protocol';
import { dishInfo, enterStartedDish, exportContinueFile, exportDishFile, freshDishId, getClient, meta, namedSlots, setSpeed, showToast } from '../state';
import { startedText, WHATIF_TEXT } from '../strings/whatif';
import type { KeepStep } from './KeepChoice';

/** Where the sheet was opened: the Play shelf (under Garden) or a dish's More sheet. */
export type WhatIfContext = 'play' | 'dish';

/** The Play shelf's What if? always offers the Garden's ideas (UX §2.2). */
export const PLAY_SOURCE = 'FIRST_DISH_V1';

/**
 * The all-slots-used step (UX §3.4): the pick waiting to start, and the player's way of keeping the
 * current dish (the shared KeepStep, D-0033). Cancel clears it and nothing is changed.
 */
export type FullStep = KeepStep & { readonly pick: WhatIfPick };

export const whatIfOpen = signal<WhatIfContext | null>(null);
export const whatIfAnswer = signal<WhatIfAnswer | null>(null);
export const whatIfLoadError = signal<string | null>(null);
export const whatIfSelected = signal<string | null>(null);
/** A readable refusal from the worker (e.g. Again on a revised idea); nothing was changed. */
export const whatIfNotice = signal<string | null>(null);
export const whatIfBusy = signal<boolean>(false);
export const whatIfFull = signal<FullStep | null>(null);

/** The dish the sheet was opened over, and the run speed to restore if nothing is started. */
let openedOver: { dishId: string; speed: Speed } | null = null;
let loadSeq = 0;
/** The control focused when the sheet was opened (the Play link, or the More sheet's item). */
let opener: HTMLElement | null = null;

/**
 * Where focus goes when the sheet closes: the control that opened it; opened from the dish's More
 * sheet (whose item is gone by then), the dish's More button, which opened that sheet.
 */
export function whatIfReturnTarget(context: WhatIfContext): HTMLElement | null {
  if (opener?.isConnected) return opener;
  if (context === 'dish') return document.querySelector<HTMLElement>('[data-testid="more"]');
  return null;
}

export function openWhatIf(context: WhatIfContext): void {
  const info = dishInfo.value;
  opener =
    document.activeElement instanceof HTMLElement && document.activeElement !== document.body
      ? document.activeElement
      : null;
  batch(() => {
    whatIfOpen.value = context;
    whatIfAnswer.value = null;
    whatIfLoadError.value = null;
    whatIfSelected.value = null;
    whatIfNotice.value = null;
    whatIfFull.value = null;
    whatIfBusy.value = false;
  });
  // Opened over a running dish: a blocking panel (UX §2) pauses it, so what is kept is what was seen.
  openedOver = null;
  if (context === 'dish' && info) {
    const speed = meta.value?.speed ?? 0;
    openedOver = { dishId: info.dishId, speed };
    if (speed > 0) setSpeed(0);
  }
  void loadWhatIf(context);
}

async function loadWhatIf(context: WhatIfContext): Promise<void> {
  const seq = ++loadSeq;
  const info = dishInfo.value;
  try {
    const answer = await getClient().whatIf(context === 'play' ? PLAY_SOURCE : null, info?.dishId ?? null);
    if (seq !== loadSeq || whatIfOpen.value !== context) return;
    batch(() => {
      whatIfAnswer.value = answer;
      if (whatIfSelected.value === null) whatIfSelected.value = answer.choices[0]?.preview.id ?? null;
    });
  } catch (e) {
    if (seq === loadSeq) whatIfLoadError.value = (e as Error).message;
  }
}

/** Close without starting anything: the dish it was opened over resumes its prior run state. */
export function closeWhatIf(): void {
  const over = openedOver;
  openedOver = null;
  loadSeq++;
  batch(() => {
    whatIfOpen.value = null;
    whatIfFull.value = null;
    whatIfNotice.value = null;
  });
  if (over && over.speed > 0 && dishInfo.value?.dishId === over.dishId) setSpeed(over.speed);
}

export function selectWhatIf(id: string): void {
  batch(() => {
    whatIfSelected.value = id;
    whatIfNotice.value = null;
  });
}

/**
 * Start a What if? dish. The worker builds it first (a refusal changes nothing), keeps the current
 * dish (its own slot, else a free one; `keep` after the all-slots-used step), then opens it paused.
 */
export async function startWhatIf(pick: WhatIfPick, keep: WhatIfKeep = { kind: 'auto' }): Promise<void> {
  if (whatIfBusy.value) return;
  const from = dishInfo.value?.dishId ?? null;
  batch(() => {
    whatIfBusy.value = true;
    whatIfNotice.value = null;
  });
  try {
    const r = await getClient().whatIfStart({ newDishId: freshDishId(), fromDishId: from, pick, keep });
    if (!r.ok) {
      if (r.code === 'slots-full' || r.code === 'save-unavailable')
        whatIfFull.value = {
          stage: 'choose',
          pick,
          reason: r.code === 'slots-full' ? 'full' : 'unavailable',
        };
      else whatIfNotice.value = r.message;
      return;
    }
    // Started: the previous dish is kept, so it is not resumed.
    openedOver = null;
    batch(() => {
      whatIfOpen.value = null;
      whatIfFull.value = null;
    });
    enterStartedDish(r.info, from);
    showToast(startedText(r.info.variant?.title ?? r.info.name, r.kept, pick.kind === 'again'), 5000);
  } catch (e) {
    whatIfNotice.value = `${WHATIF_TEXT.cancelled} ${(e as Error).message}`;
  } finally {
    whatIfBusy.value = false;
  }
}

/** All slots used → "Export it as a file": a real export of the current dish, then Start is offered. */
export async function exportBeforeStart(): Promise<void> {
  const step = whatIfFull.value;
  const info = dishInfo.value;
  if (!step || whatIfBusy.value) return;
  whatIfBusy.value = true;
  try {
    // With no dish open, the dish being kept is the one Continue holds (D-0033 fix round 1).
    const filename = info ? await exportDishFile(info.dishId) : await exportContinueFile();
    whatIfFull.value = { stage: 'exported', pick: step.pick, file: filename };
  } catch (e) {
    whatIfNotice.value = WHATIF_TEXT.exportFailed((e as Error).message);
  } finally {
    whatIfBusy.value = false;
  }
}

/** All slots used → "Replace a saved dish…": list the ten slots for a deliberate choice. */
export async function chooseReplacement(): Promise<void> {
  const step = whatIfFull.value;
  if (!step) return;
  try {
    whatIfFull.value = {
      stage: 'replace',
      pick: step.pick,
      slots: await namedSlots(),
      slotId: null,
    };
  } catch (e) {
    whatIfNotice.value = (e as Error).message;
  }
}

export function pickReplacement(slotId: string): void {
  const step = whatIfFull.value;
  if (step?.stage === 'replace') whatIfFull.value = { ...step, slotId };
}

/** Cancel the all-slots-used step: nothing was written, the dish is as it was. */
export function cancelFullStep(): void {
  batch(() => {
    whatIfFull.value = null;
    whatIfNotice.value = WHATIF_TEXT.cancelled;
  });
}

/** Copy text; clipboard writes can be unavailable (the text stays selectable on screen). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
