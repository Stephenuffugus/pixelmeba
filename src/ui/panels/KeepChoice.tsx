/**
 * The one all-slots-used choice (UX §3.4; D09 §3 "offer export or a deliberate replacement; cancel loses
 * nothing"; D-0026, D-0033). Every action that replaces the open dish keeps it first; when its own slot
 * and every empty slot are unavailable the player chooses here: export it as a file and then go ahead,
 * deliberately replace a saved dish (listed, chosen, confirmed in words), or Cancel (nothing changes).
 * What if? shows it inside its sheet (ids 'whatif', its own words); every other action shows it in the
 * Keep sheet (ids 'keep'). The panel only presents: the caller's actions do the work.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { SlotSummary, WhatIfKeep } from '@worker/protocol';
import { IconPlay } from '../icons';
import { slotNumber } from '../strings/whatif';
import type { KeepChoiceText } from '../strings/keep';

/** Where the choice stands: choosing, exported (go ahead), or picking the save to replace. */
export type KeepStep =
  /** 'unavailable': this device cannot save at all, so only export is offered. */
  | { readonly stage: 'choose'; readonly reason: 'full' | 'unavailable' }
  | { readonly stage: 'exported'; readonly file: string }
  | { readonly stage: 'replace'; readonly slots: readonly SlotSummary[]; readonly slotId: string | null };

export interface KeepChoiceProps {
  /** Prefix of test ids, element ids and the radio group's name ('whatif' or 'keep'). */
  readonly ids: string;
  readonly step: KeepStep;
  /** The dish being kept. */
  readonly name: string;
  readonly text: KeepChoiceText;
  readonly busy: boolean;
  /** The caller's notice (a readable refusal or 'Nothing was changed.'). */
  readonly notice: ComponentChildren;
  /** A slot that cannot be replaced (the save being opened): listed, not choosable. */
  readonly exclude?: string | null;
  readonly onExport: () => void;
  readonly onChooseReplacement: () => void;
  readonly onPick: (slotId: string) => void;
  readonly onKeep: (keep: WhatIfKeep) => void;
  readonly onCancel: () => void;
}

/** The ten named slots, in order. */
const SLOT_IDS = Array.from({ length: 10 }, (_, i) => `slot${i + 1}`);

export function KeepChoicePanel(props: KeepChoiceProps) {
  const { ids, step, text, busy } = props;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [step.stage]);
  const unavailable = step.stage === 'choose' && step.reason === 'unavailable';
  const actions = (children: ComponentChildren) => <div class="whatif-actions">{children}</div>;
  const cancel = (
    <button class="btn" disabled={busy} onClick={props.onCancel} data-testid={`${ids}-cancel`}>
      {text.cancel}
    </button>
  );
  return (
    <section class="whatif-full" aria-labelledby={`${ids}-full-title`} data-testid={`${ids}-full`}>
      <h3 id={`${ids}-full-title`} ref={heading} tabIndex={-1}>
        {unavailable ? text.unavailableTitle : text.fullTitle}
      </h3>
      {/* The dialog that shows this panel is described by this sentence (the Keep sheet: aria-describedby). */}
      <p class="whatif-text" id={`${ids}-full-text`}>
        {unavailable ? text.unavailableBody(props.name) : text.fullBody(props.name)}
      </p>
      <p class="whatif-note">{text.pending}</p>
      {props.notice}
      {step.stage === 'choose'
        ? actions(
            <>
              <button class="btn" disabled={busy} onClick={props.onExport} data-testid={`${ids}-export`}>
                {busy ? text.exporting : text.exportIt}
              </button>
              {step.reason === 'full' ? (
                <button class="btn" disabled={busy} onClick={props.onChooseReplacement} data-testid={`${ids}-replace`}>
                  {text.replaceIt}
                </button>
              ) : null}
              {cancel}
            </>,
          )
        : null}
      {step.stage === 'exported'
        ? actions(
            <>
              <p class="whatif-text" role="status" data-testid={`${ids}-exported`}>
                {text.exported(step.file)}
              </p>
              <button
                class="btn primary"
                disabled={busy}
                onClick={() => props.onKeep({ kind: 'exported' })}
                data-testid={`${ids}-start-exported`}
              >
                <IconPlay /> {text.continueAfterExport}
              </button>
              {cancel}
            </>,
          )
        : null}
      {step.stage === 'replace' ? <ReplaceStep {...props} step={step} cancel={cancel} /> : null}
    </section>
  );
}

function ReplaceStep(
  props: KeepChoiceProps & {
    readonly step: Extract<KeepStep, { stage: 'replace' }>;
    readonly cancel: ComponentChildren;
  },
) {
  const { ids, step, text, busy, name } = props;
  const bySlot = Object.fromEntries(step.slots.map((s) => [s.slotId, s]));
  const chosen = step.slotId !== null ? bySlot[step.slotId] : undefined;
  const exclude = props.exclude ?? null;
  return (
    <>
      <fieldset class="whatif-choices">
        <legend>{text.replaceLegend}</legend>
        {SLOT_IDS.map((id, i) => (
          <label
            key={id}
            class={`whatif-choice${step.slotId === id ? ' selected' : ''}`}
            data-testid={`${ids}-slot-${id}`}
          >
            <input
              type="radio"
              name={`${ids}-slot`}
              value={id}
              checked={step.slotId === id}
              disabled={id === exclude}
              onChange={() => props.onPick(id)}
            />
            <span class="whatif-choice-text">
              {id === exclude ? text.replaceExcluded(i + 1, bySlot[id]) : text.replaceSlot(i + 1, bySlot[id])}
            </span>
          </label>
        ))}
      </fieldset>
      {/*
        What the choice will do, said as it is chosen (a polite live region, so a screen reader hears it
        after an arrow key) and describing the button that does it.
      */}
      <div id={`${ids}-replace-said`} aria-live="polite">
        {step.slotId !== null ? (
          <p class="constraint whatif-text" data-testid={`${ids}-replace-confirm`}>
            {chosen
              ? text.replaceConfirm(chosen.name, slotNumber(step.slotId), name, chosen.tick)
              : text.replaceSlot(slotNumber(step.slotId), undefined)}
          </p>
        ) : null}
      </div>
      <div class="whatif-actions">
        <button
          class="btn primary"
          disabled={busy || step.slotId === null}
          aria-describedby={step.slotId !== null ? `${ids}-replace-said` : undefined}
          onClick={() => step.slotId !== null && props.onKeep({ kind: 'replace', slotId: step.slotId })}
          data-testid={`${ids}-replace-start`}
        >
          {text.replaceContinue}
        </button>
        {props.cancel}
      </div>
    </>
  );
}

/**
 * Make everything outside `root` inert (no focus, no pointer, hidden from assistive technology): each
 * sibling of `root` and of every ancestor up to <body>. Returns the undo (only what this set). Shared by
 * the What if? sheet and the Keep sheet (blocking modals, D-0026).
 */
export function inertOutside(root: HTMLElement): () => void {
  const made: HTMLElement[] = [];
  for (let el: HTMLElement | null = root; el && el !== document.body; el = el.parentElement) {
    const parent: HTMLElement | null = el.parentElement;
    if (!parent) break;
    for (const sib of Array.from(parent.children)) {
      if (sib === el || !(sib instanceof HTMLElement) || sib.inert) continue;
      sib.inert = true;
      made.push(sib);
    }
  }
  return () => {
    for (const el of made) el.inert = false;
  };
}
