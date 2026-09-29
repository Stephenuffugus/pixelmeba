/**
 * The Keep sheet (D-0033): when an action that replaces the open dish (Play shelf Start, New Dish
 * Create, an experiment card's Start, Saved dishes → Open, Import, Duplicate) finds all ten slots used,
 * or a device that cannot save, it waits here while the player chooses how to keep the open dish (with
 * none open, the dish Continue holds: fix round 1): export it as a
 * file and then go ahead, deliberately replace a save, or Cancel (nothing changes). The choice is the
 * shared KeepChoicePanel, as in the What if? sheet. A blocking modal like What if? (D-0026): everything
 * behind it is inert and no key reaches the dish; Close and Escape cancel. It is rendered into its own
 * root on <body> (mounted on first use), so it can stand over any page an action starts from.
 */
import { render } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { IconClose } from '../icons';
import {
  cancelKeep,
  chooseKeepReplacement,
  continueKeep,
  exportBeforeKeep,
  keepBusy,
  keepFlow,
  keepNotice,
  keepReturnTarget,
  pickKeepReplacement,
  type KeepFlow,
} from '../state';
import { KEEP_TEXT, keepChoiceText } from '../strings/keep';
import { inertOutside, KeepChoicePanel } from './KeepChoice';

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** Shows the Keep sheet while a replacing action waits for the player's choice. */
export function KeepHost() {
  const flow = keepFlow.value;
  return flow ? <KeepModal flow={flow} /> : null;
}

let root: HTMLElement | null = null;

/** Mount the Keep sheet's host once, on <body> after the app (a no-op without a document). */
export function mountKeepHost(): void {
  if (root || typeof document === 'undefined') return;
  root = document.createElement('div');
  root.id = 'keep-root';
  document.body.appendChild(root);
  render(<KeepHost />, root);
}

function KeepNotice() {
  const n = keepNotice.value;
  return n ? (
    <p class="constraint whatif-text" role="alert" data-testid="keep-notice">
      {n}
    </p>
  ) : null;
}

function KeepModal(props: { readonly flow: KeepFlow }) {
  const { flow } = props;
  const modal = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const restore = modal.current ? inertOutside(modal.current) : () => undefined;
    // The panel's own heading takes focus as it appears; otherwise the sheet's.
    if (!dialog.current?.contains(document.activeElement)) heading.current?.focus();
    // Keys that arrive outside the sheet (focus left on the page) never reach the page or dish behind it.
    const guard = (e: KeyboardEvent) => {
      const d = dialog.current;
      if (!d || (e.target instanceof Node && d.contains(e.target))) return; // the sheet's own handler runs
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelKeep();
      } else if (e.key === 'Tab' || e.key === ' ') {
        e.preventDefault();
        heading.current?.focus();
      }
    };
    window.addEventListener('keydown', guard, true);
    return () => {
      window.removeEventListener('keydown', guard, true);
      restore(); // before returning focus: an inert element cannot take it
      // Nothing replaced (Cancel): back to the control that started the action. A new dish's screen
      // places focus itself.
      keepReturnTarget()?.focus();
    };
  }, []);
  const onKeyDown = (e: KeyboardEvent) => {
    // A modal: the page's and the dish's keyboard shortcuts never act behind it.
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      cancelKeep();
    } else if (e.key === 'Tab' && dialog.current) {
      const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && (document.activeElement === first || dialog.current.querySelector('h2, h3') === document.activeElement)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  const busy = keepBusy.value;
  return (
    <div
      ref={modal}
      class="whatif-modal"
      data-testid="keep-modal"
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
        aria-labelledby="keep-title"
        // What the choice is about is read out with the dialog's name (the panel's first sentence).
        aria-describedby="keep-full-text"
        onKeyDown={onKeyDown}
        data-testid="keep-sheet"
      >
        <header class="whatif-header">
          <h2 id="keep-title" ref={heading} tabIndex={-1}>
            {KEEP_TEXT.title}
          </h2>
          <button class="btn ghost" aria-label={KEEP_TEXT.close} onClick={cancelKeep} disabled={busy} data-testid="keep-close">
            <IconClose />
          </button>
        </header>
        <div class="sheet-scroll">
          <KeepChoicePanel
            ids="keep"
            step={flow.step}
            name={flow.name}
            text={keepChoiceText(flow.verb, flow.waiting, flow.dishId === null)}
            busy={busy}
            notice={<KeepNotice />}
            exclude={flow.exclude}
            onExport={() => void exportBeforeKeep()}
            onChooseReplacement={() => void chooseKeepReplacement()}
            onPick={pickKeepReplacement}
            onKeep={(keep) => void continueKeep(keep)}
            onCancel={cancelKeep}
          />
        </div>
      </section>
    </div>
  );
}
