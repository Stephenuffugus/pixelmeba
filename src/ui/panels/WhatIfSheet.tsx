/**
 * The What if? sheet (UX §3.4; D09 §3–§5; SPEC §13.3). A modal sheet over the Play shelf or the dish:
 * at most three choices, each an icon + label + one sentence naming the single difference; the
 * selected choice shows a small before/after preview, Details (values, seed, versions, the identity
 * line with Copy) and a separate Start. On a What if? dish it also offers Again and Another idea and
 * shows the dish's provenance. Starting keeps the current dish through the save flow; when all ten
 * slots are used the player exports it or deliberately replaces a save, and Cancel changes nothing.
 */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { WhatIfAnswer, WhatIfChoice, WhatIfPick } from '@worker/protocol';
import { IconClose, IconCopy, IconPlay, IconSave } from '../icons';
import { dishInfo } from '../state';
import {
  choiceDetails,
  identityLine,
  planText,
  provenanceDetails,
  slotNumber,
  WHATIF_TEXT,
  type DetailRow,
} from '../strings/whatif';
import { IconAgain, IconAnother, WhatIfIcon } from './WhatIfIcons';
import { amountScale, WhatIfPreview } from './WhatIfPreview';
import {
  cancelFullStep,
  chooseReplacement,
  closeWhatIf,
  copyText,
  exportBeforeStart,
  pickReplacement,
  selectWhatIf,
  startWhatIf,
  whatIfAnswer,
  whatIfBusy,
  whatIfFull,
  whatIfLoadError,
  whatIfNotice,
  whatIfOpen,
  whatIfReturnTarget,
  whatIfSelected,
  type FullStep,
  type WhatIfContext,
} from './WhatIfState';

/** Rendered by the Play shelf and the dish screen; shows the sheet while it is open there. */
export function WhatIfHost(props: { readonly context: WhatIfContext }) {
  return whatIfOpen.value === props.context ? <WhatIfModal context={props.context} /> : null;
}

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/**
 * Make everything outside `root` inert (no focus, no pointer, hidden from assistive technology): each
 * sibling of `root` and of every ancestor up to <body>. Returns the undo (only what this set).
 */
function inertOutside(root: HTMLElement): () => void {
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

function WhatIfModal(props: { readonly context: WhatIfContext }) {
  const modal = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // A blocking modal (D-0026): the dish or shelf behind is inert while the sheet is open.
    const restore = modal.current ? inertOutside(modal.current) : () => undefined;
    heading.current?.focus();
    // Keys that arrive outside the sheet (focus left on the page) never reach the dish behind it.
    const guard = (e: KeyboardEvent) => {
      const d = dialog.current;
      if (!d || (e.target instanceof Node && d.contains(e.target))) return; // the sheet's own handler runs
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!whatIfBusy.value) closeWhatIf();
      } else if (e.key === 'Tab' || e.key === ' ') {
        e.preventDefault();
        heading.current?.focus();
      }
    };
    window.addEventListener('keydown', guard, true);
    return () => {
      window.removeEventListener('keydown', guard, true);
      restore(); // before returning focus: an inert element cannot take it
      whatIfReturnTarget(props.context)?.focus();
    };
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    // A modal: the dish's keyboard shortcuts never act behind it.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!whatIfBusy.value) closeWhatIf();
    } else if (e.key === 'Tab' && dialog.current) {
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  return (
    <div
      ref={modal}
      class="whatif-modal"
      data-testid="whatif-modal"
      // A press on the backdrop keeps focus in the sheet (it would otherwise fall to the page).
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <section
        ref={dialog}
        class="sheet whatif-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="whatif-title"
        onKeyDown={onKeyDown}
        data-testid="whatif-sheet"
      >
        {/* The header stays put so Close is always in reach; only the content scrolls. */}
        <header class="whatif-header">
          <h2 id="whatif-title" ref={heading} tabIndex={-1}>
            {WHATIF_TEXT.title}
          </h2>
          <button
            class="btn ghost"
            aria-label={WHATIF_TEXT.close}
            onClick={closeWhatIf}
            disabled={whatIfBusy.value}
            data-testid="whatif-close"
          >
            <IconClose />
          </button>
        </header>
        <div class="sheet-scroll">
          <Body context={props.context} />
        </div>
      </section>
    </div>
  );
}

function Body(props: { readonly context: WhatIfContext }) {
  const a = whatIfAnswer.value;
  const err = whatIfLoadError.value;
  if (err) {
    return (
      <p class="constraint whatif-text" role="alert">
        {err}
      </p>
    );
  }
  if (!a) {
    return (
      <p class="whatif-note" role="status">
        {WHATIF_TEXT.loading}
      </p>
    );
  }
  const full = whatIfFull.value;
  if (full) return <FullStepPanel answer={a} step={full} />;
  const selected = a.choices.find((c) => c.preview.id === whatIfSelected.value) ?? null;
  const showCurrent = props.context === 'dish' && a.current !== null;
  return (
    <>
      <p class="whatif-text">{WHATIF_TEXT.intro(a.sourceName)}</p>
      <p class="whatif-plan whatif-text" data-testid="whatif-plan">
        <IconSave /> <span>{planText(a.plan)}</span>
      </p>
      <Notice />
      {showCurrent ? <CurrentDish answer={a} /> : null}
      {a.choices.length === 0 ? <p class="whatif-text">{WHATIF_TEXT.noChoices}</p> : <Choices answer={a} />}
      {selected ? <Selected key={selected.preview.id} answer={a} choice={selected} /> : null}
    </>
  );
}

function Notice() {
  const n = whatIfNotice.value;
  return n ? (
    <p class="constraint whatif-text" role="alert" data-testid="whatif-notice">
      {n}
    </p>
  ) : null;
}

function Choices(props: { readonly answer: WhatIfAnswer }) {
  const sel = whatIfSelected.value;
  return (
    <fieldset class="whatif-choices">
      <legend>{WHATIF_TEXT.chooseLegend}</legend>
      {props.answer.choices.map((c) => {
        const p = c.preview;
        const checked = sel === p.id;
        return (
          <label
            key={p.id}
            class={`whatif-choice${checked ? ' selected' : ''}`}
            data-testid={`whatif-choice-${p.id}`}
          >
            <input
              type="radio"
              name="whatif-choice"
              value={p.id}
              checked={checked}
              onChange={() => selectWhatIf(p.id)}
            />
            <WhatIfIcon change={p.change} />
            <span class="whatif-choice-text">
              <strong>{p.title}</strong>
              <span>{p.previewDifference}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function Selected(props: { readonly answer: WhatIfAnswer; readonly choice: WhatIfChoice }) {
  const p = props.choice.preview;
  const busy = whatIfBusy.value;
  return (
    <section class="whatif-selected" aria-labelledby="whatif-selected-title" data-testid="whatif-selected">
      <h3 id="whatif-selected-title">{p.title}</h3>
      <p class="whatif-text whatif-question">{p.question}</p>
      <WhatIfPreview choice={props.choice} layout={props.answer.layout} scale={amountScale(props.answer.choices)} />
      <Details
        rows={choiceDetails(p, props.choice, props.answer.registryLabel)}
        identity={p.identity}
        testid="whatif-choice"
      />
      <button
        class="btn primary whatif-wide"
        disabled={busy}
        onClick={() => void startWhatIf({ kind: 'variant', variantId: p.id })}
        data-testid="whatif-start"
      >
        <IconPlay /> {busy ? WHATIF_TEXT.starting : WHATIF_TEXT.start(p.title)}
      </button>
      <p class="whatif-note">{WHATIF_TEXT.startNote}</p>
    </section>
  );
}

function CurrentDish(props: { readonly answer: WhatIfAnswer }) {
  const a = props.answer;
  const r = a.current!;
  const busy = whatIfBusy.value;
  return (
    <section class="whatif-current" aria-labelledby="whatif-current-title" data-testid="whatif-current">
      <h3 id="whatif-current-title">
        {WHATIF_TEXT.thisDish}: {r.title}
      </h3>
      <p class="whatif-text">{WHATIF_TEXT.thisDishIntro(r.title, a.sourceName)}</p>
      <div class="whatif-actions">
        <button
          class="btn primary"
          disabled={busy}
          onClick={() => void startWhatIf({ kind: 'again' })}
          data-testid="whatif-again"
        >
          <IconAgain /> {WHATIF_TEXT.again}
        </button>
        <p class="whatif-note">{WHATIF_TEXT.againHint}</p>
        {a.next ? (
          <>
            <button
              class="btn"
              disabled={busy}
              onClick={() => void startWhatIf({ kind: 'another' })}
              data-testid="whatif-another"
            >
              <IconAnother /> {WHATIF_TEXT.another}
            </button>
            <p class="whatif-note" data-testid="whatif-next">
              {WHATIF_TEXT.anotherHint(a.next.title, a.next.previewDifference)}
            </p>
          </>
        ) : (
          <p class="whatif-note">{WHATIF_TEXT.noAnother}</p>
        )}
      </div>
      <Details
        rows={provenanceDetails(r, a.sourceName, dishInfo.value)}
        identity={identityLine(r)}
        testid="whatif-current"
      />
    </section>
  );
}

/** Details disclosure: the identity line (selectable, with Copy) and labelled values. */
function Details(props: {
  readonly rows: readonly DetailRow[];
  readonly identity: string;
  readonly testid: string;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const id = `${props.testid}-details-body`;
  return (
    <div class="whatif-details">
      <button
        class="btn"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        data-testid={`${props.testid}-details`}
      >
        {open ? WHATIF_TEXT.hideDetails : WHATIF_TEXT.details}
      </button>
      {open ? (
        <div id={id} class="whatif-details-body">
          <div class="whatif-identity-row">
            <code class="whatif-identity" data-testid={`${props.testid}-identity`}>
              {props.identity}
            </code>
            <button
              class="btn"
              onClick={() =>
                void copyText(props.identity).then((ok) =>
                  setCopied(ok ? WHATIF_TEXT.copied : WHATIF_TEXT.copyFailed),
                )
              }
              data-testid={`${props.testid}-copy`}
            >
              <IconCopy /> {WHATIF_TEXT.copy}
            </button>
          </div>
          <p class="whatif-note" role="status">
            {copied ?? ''}
          </p>
          <dl class="whatif-kv">
            {props.rows.map((r) => (
              <div key={r.term}>
                <dt>{r.term}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function pickTitle(a: WhatIfAnswer, pick: WhatIfPick): string {
  if (pick.kind === 'variant')
    return a.choices.find((c) => c.preview.id === pick.variantId)?.preview.title ?? pick.variantId;
  if (pick.kind === 'again') return a.current?.title ?? '';
  return a.next?.title ?? '';
}

/** All ten slots used (or no saving on this device): export, or deliberately replace; Cancel changes nothing. */
function FullStepPanel(props: { readonly answer: WhatIfAnswer; readonly step: FullStep }) {
  const { answer: a, step } = props;
  const busy = whatIfBusy.value;
  const name = a.plan.kind === 'none' ? (dishInfo.value?.name ?? '') : a.plan.name;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [step.stage]);
  const unavailable = step.stage === 'choose' && step.reason === 'unavailable';
  const actions = (children: ComponentChildren) => <div class="whatif-actions">{children}</div>;
  const cancel = (
    <button class="btn" disabled={busy} onClick={cancelFullStep} data-testid="whatif-cancel">
      {WHATIF_TEXT.cancel}
    </button>
  );
  return (
    <section class="whatif-full" aria-labelledby="whatif-full-title" data-testid="whatif-full">
      <h3 id="whatif-full-title" ref={heading} tabIndex={-1}>
        {unavailable ? WHATIF_TEXT.exportIt : WHATIF_TEXT.fullTitle}
      </h3>
      <p class="whatif-text">
        {unavailable ? WHATIF_TEXT.unavailableBody(name) : WHATIF_TEXT.fullBody(name)}
      </p>
      <p class="whatif-note">{WHATIF_TEXT.pending(pickTitle(a, step.pick))}</p>
      <Notice />
      {step.stage === 'choose'
        ? actions(
            <>
              <button
                class="btn"
                disabled={busy}
                onClick={() => void exportBeforeStart()}
                data-testid="whatif-export"
              >
                {busy ? WHATIF_TEXT.exporting : WHATIF_TEXT.exportIt}
              </button>
              {step.reason === 'full' ? (
                <button
                  class="btn"
                  disabled={busy}
                  onClick={() => void chooseReplacement()}
                  data-testid="whatif-replace"
                >
                  {WHATIF_TEXT.replaceIt}
                </button>
              ) : null}
              {cancel}
            </>,
          )
        : null}
      {step.stage === 'exported'
        ? actions(
            <>
              <p class="whatif-text" role="status" data-testid="whatif-exported">
                {WHATIF_TEXT.exported(step.file)}
              </p>
              <button
                class="btn primary"
                disabled={busy}
                onClick={() => void startWhatIf(step.pick, { kind: 'exported' })}
                data-testid="whatif-start-exported"
              >
                <IconPlay /> {WHATIF_TEXT.startAfterExport}
              </button>
              {cancel}
            </>,
          )
        : null}
      {step.stage === 'replace' ? <ReplaceStep step={step} name={name} busy={busy} cancel={cancel} /> : null}
    </section>
  );
}

function ReplaceStep(props: {
  readonly step: Extract<FullStep, { stage: 'replace' }>;
  readonly name: string;
  readonly busy: boolean;
  readonly cancel: ComponentChildren;
}) {
  const { step, name, busy } = props;
  const bySlot = Object.fromEntries(step.slots.map((s) => [s.slotId, s]));
  const ids = Array.from({ length: 10 }, (_, i) => `slot${i + 1}`);
  const chosen = step.slotId !== null ? bySlot[step.slotId] : undefined;
  return (
    <>
      <fieldset class="whatif-choices">
        <legend>{WHATIF_TEXT.replaceLegend}</legend>
        {ids.map((id, i) => (
          <label
            key={id}
            class={`whatif-choice${step.slotId === id ? ' selected' : ''}`}
            data-testid={`whatif-slot-${id}`}
          >
            <input
              type="radio"
              name="whatif-slot"
              value={id}
              checked={step.slotId === id}
              onChange={() => pickReplacement(id)}
            />
            <span class="whatif-choice-text">{WHATIF_TEXT.replaceSlot(i + 1, bySlot[id])}</span>
          </label>
        ))}
      </fieldset>
      {step.slotId !== null ? (
        <p class="constraint whatif-text" data-testid="whatif-replace-confirm">
          {chosen
            ? WHATIF_TEXT.replaceConfirm(chosen.name, slotNumber(step.slotId), name)
            : WHATIF_TEXT.replaceSlot(slotNumber(step.slotId), undefined)}
        </p>
      ) : null}
      <div class="whatif-actions">
        <button
          class="btn primary"
          disabled={busy || step.slotId === null}
          onClick={() =>
            step.slotId !== null && void startWhatIf(step.pick, { kind: 'replace', slotId: step.slotId })
          }
          data-testid="whatif-replace-start"
        >
          {WHATIF_TEXT.replaceStart}
        </button>
        {props.cancel}
      </div>
    </>
  );
}
