/**
 * Notebook (UX §1, §2): Journal · Experiments. The Journal lists the stamps recorded when an
 * experiment card's observation gate was reached (P2.8 adds observed relationships); Experiments lists
 * the cards this build ships (SPEC §13.2). Opening the Notebook never pauses or changes a dish.
 */
import { Component, type ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ExperimentCardView } from '@sim/experiments';
import { IconBack } from '../icons';
import { journal, journalUnseen, type JournalStampEntry } from '../journal';
import { JournalComposer, ObservationCard } from './NotebookJournal';
import { CONCLUSIONS } from '../panels/CompareText';
import { experimentCards, experimentCardsError, loadCompareCards, loadExperimentCards, route, type CompareCard } from '../state';
import { compareCardLine, isListableCard } from '../strings/compareCards';
import { fmt, fmtDiff, measureLabel } from '../panels/CompareText';
import { durationText, journalMeasureCells, recordedText } from '../strings/experiments';
import { clock } from '../panels/CompareText';

type Tab = 'journal' | 'experiments';
const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'journal', label: 'Journal' },
  { id: 'experiments', label: 'Experiments' },
];

export function Notebook() {
  const r = route.value;
  const tab: Tab = r.name === 'notebook' ? r.tab : 'experiments';
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ journal: null, experiments: null });

  useEffect(() => {
    void loadExperimentCards();
  }, []);
  useEffect(() => {
    if (tab === 'journal') journalUnseen.value = 0;
  }, [tab]);

  const select = (t: Tab, focus = false) => {
    route.value = { name: 'notebook', tab: t };
    if (focus) tabRefs.current[t]?.focus();
  };
  const onKey = (e: KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      select(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.id, true);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      select(TABS[e.key === 'Home' ? 0 : TABS.length - 1]!.id, true);
    }
  };

  return (
    <main class="page nb-page" aria-labelledby="nb-title" data-testid="notebook">
      <div class="home-grid">
        <header class="nb-header">
          <button class="btn ghost nb-back" onClick={() => (route.value = { name: 'home' })} aria-label="Back to Home">
            <IconBack />
          </button>
          <h1 id="nb-title">Notebook</h1>
        </header>
        <div class="nb-tabs" role="tablist" aria-label="Notebook sections" onKeyDown={onKey}>
          {TABS.map((t) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              class="btn"
              role="tab"
              id={`nb-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls="nb-panel"
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => select(t.id)}
              data-testid={`notebook-tab-${t.id}`}
            >
              {t.label}
              {t.id === 'journal' && journalUnseen.value > 0 ? <span class="nb-dot">{journalUnseen.value} new</span> : null}
            </button>
          ))}
        </div>
        <section id="nb-panel" role="tabpanel" aria-labelledby={`nb-tab-${tab}`} class="nb-panel">
          {tab === 'journal' ? <JournalTab /> : <ExperimentsTab />}
        </section>
      </div>
    </main>
  );
}

function stampedIds(): Set<string> {
  return new Set(journal.value.flatMap((e) => (e.kind === 'experimentStamp' ? [e.experimentId] : [])));
}

function ExperimentsTab() {
  const cards = experimentCards.value;
  if (!cards) {
    return <p class="nb-empty">{experimentCardsError.value ? `The experiment cards could not be read: ${experimentCardsError.value}` : 'Reading the experiment cards…'}</p>;
  }
  const stamped = stampedIds();
  return (
    <>
      <p class="nb-intro">
        Each card asks one question, suggests one change and says what to measure. Starting a card makes a new paused dish from its recipe and seed; paired cards run two copies side by
        side.
      </p>
      <ul class="nb-cards" aria-label="Experiment cards">
        {cards.map((c) => (
          <li key={c.id}>
            <CardSummary card={c} stamped={stamped.has(c.id)} />
          </li>
        ))}
      </ul>
    </>
  );
}

function CardSummary({ card, stamped }: { card: ExperimentCardView; stamped: boolean }) {
  const labels = card.labels.filter((l) => !/^Experiment\b/.test(l));
  return (
    <article class="card nb-card" aria-labelledby={`nb-card-${card.id}`}>
      <h2 id={`nb-card-${card.id}`}>{card.title}</h2>
      <p class="nb-question">{card.question}</p>
      <p class="xp-badges">
        <span class="xp-badge">{card.paired ? 'Paired run' : 'One dish'}</span>
        <span class="xp-badge">{durationText(card.stoppingSeconds)}</span>
        {labels.map((l) => (
          <span key={l} class="xp-badge" data-testid="experiment-label">
            {l}
          </span>
        ))}
        {stamped ? <span class="xp-badge xp-badge-stamp">Stamped in Journal</span> : null}
      </p>
      <button class="btn primary nb-open" onClick={() => (route.value = { name: 'experiment', cardId: card.id })} data-testid={`experiment-card-${card.id}`}>
        Open card
      </button>
    </article>
  );
}

function conclusionText(id: string | undefined): string | null {
  return CONCLUSIONS.find((k) => k.id === id)?.label ?? null;
}

/**
 * Journal (P2.8): experiment stamps and the player's observed relationships, newest first, with a form
 * to record "I saw X coincide with Y" (about the open dish when there is one).
 */
/**
 * One Journal entry that fails to render shows a short line instead, so it can never hide the others
 * (entries are validated when read and merged; this is the last guard).
 */
class EntryBoundary extends Component<{ readonly children: ComponentChildren }, { readonly failed: boolean }> {
  override state = { failed: false };
  override componentDidCatch(): void {
    this.setState({ failed: true });
  }
  override render() {
    return this.state.failed ? <p class="nb-empty">This Journal entry could not be shown.</p> : this.props.children;
  }
}

function JournalTab() {
  const list = journal.value;
  const [composing, setComposing] = useState(false);
  // Keyboard and screen reader users land back on the button that opened the form when it closes.
  const recordRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  useEffect(() => {
    if (!composing && returnFocus.current) {
      returnFocus.current = false;
      recordRef.current?.focus();
    }
  }, [composing]);
  return (
    <>
      <p class="nb-intro">
        Stamps from experiment cards and notes of what you saw happen together. A note records that two things coincided; it never says one caused the other.
      </p>
      {composing ? (
        <JournalComposer
          onDone={() => {
            returnFocus.current = true;
            setComposing(false);
          }}
        />
      ) : (
        <button ref={recordRef} class="btn primary nb-open nb-record" onClick={() => setComposing(true)} data-testid="journal-record">
          Record what you saw
        </button>
      )}
      {list.length === 0 ? (
        <p class="nb-empty" data-testid="journal-empty">
          No stamps or notes yet. Record something you saw, or start an experiment card: when its observation is complete, a stamp appears here with what was measured.
        </p>
      ) : (
        <ul class="nb-journal" aria-label="Journal entries">
          {list.map((e) => (
            <li key={e.id}>
              <EntryBoundary>{e.kind === 'experimentStamp' ? <JournalStamp entry={e} /> : <ObservationCard entry={e} />}</EntryBoundary>
            </li>
          ))}
        </ul>
      )}
      <SavedResults />
    </>
  );
}

/**
 * G2 comprehension M1: saved comparison result cards, newest first, one line each from what the card
 * recorded; opening one shows its saved table. They stay on this device (localStorage).
 */
function SavedResults() {
  const cards = useMemo(() => loadCompareCards().filter(isListableCard), []);
  return (
    <section class="nb-results" aria-labelledby="nb-results-title" data-testid="journal-results">
      <h2 id="nb-results-title" class="nb-section-title">
        Saved comparison results
      </h2>
      {cards.length === 0 ? (
        <p class="nb-empty" data-testid="journal-results-empty">
          No comparison results saved yet. After a paired run (More → Compare), Save result card keeps its table here, on this device.
        </p>
      ) : (
        <ul class="nb-journal" aria-label="Saved comparison results">
          {cards.map((c, i) => (
            <li key={`${c.savedAt}-${i}`}>
              <EntryBoundary>
                <SavedResult card={c} index={i} />
              </EntryBoundary>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SavedResult({ card: c, index }: { card: CompareCard; index: number }) {
  const rows = c.rows.filter((r) => measureLabel(r.key as Parameters<typeof measureLabel>[0]) !== null);
  return (
    <article class="card nb-note nb-result" aria-labelledby={`nb-result-${index}`} data-testid="journal-result">
      <p class="nb-note-mark" aria-hidden="true">
        A|B
      </p>
      <h3 id={`nb-result-${index}`}>{compareCardLine(c)}</h3>
      <p class="nb-stamp-meta">
        Comparison result · saved {recordedText(c.savedAt)} · seed {c.seed}
      </p>
      {c.prediction ? (
        <figure class="compare-prediction">
          <figcaption>Your prediction</figcaption>
          <blockquote>{c.prediction}</blockquote>
        </figure>
      ) : null}
      {c.note ? (
        <p>
          <strong>Your note:</strong> {c.note}
        </p>
      ) : null}
      <details class="xp-details">
        <summary>Measured at the end of that paired run</summary>
        <p class="nb-note-honest">
          A and B started identical; the change on B was the only recorded difference. Every difference traces back to it, directly or through knock-on effects; this table does
          not show which. These numbers describe that paired run only.
        </p>
        <div class="compare-table-wrap" tabIndex={0} role="region" aria-label="Measured values of this result card">
          <table class="xp-table">
            <caption>“{c.dishName}”, seed {c.seed}</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
                <th scope="col">B − A</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = r.key as Parameters<typeof fmt>[1];
                return (
                  <tr key={r.key}>
                    <th scope="row">{measureLabel(key)}</th>
                    <td>{fmt(r.a, key)}</td>
                    <td>{fmt(r.b, key)}</td>
                    <td>{fmtDiff(r.diff, key)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </article>
  );
}

function JournalStamp({ entry: e }: { entry: JournalStampEntry }) {
  const paired = e.measures.some((m) => m.b !== null);
  const conclusion = conclusionText(e.conclusion);
  return (
    <article class="card nb-stamp" aria-labelledby={`nb-stamp-${e.id}`} data-testid={`journal-entry-${e.experimentId}`}>
      <p class="nb-stamp-mark" aria-hidden="true">
        ✓
      </p>
      <h2 id={`nb-stamp-${e.id}`}>{e.journalStamp}</h2>
      <p class="nb-stamp-meta">
        {e.title} · {e.label} · reached at {clock(e.reachedAtSecond * 10)} dish time · recorded {recordedText(e.recordedAt)}
      </p>
      {e.labels.filter((l) => !/^Experiment\b/.test(l)).length > 0 ? (
        <p class="xp-badges">
          {e.labels
            .filter((l) => !/^Experiment\b/.test(l))
            .map((l) => (
              <span key={l} class="xp-badge">
                {l}
              </span>
            ))}
        </p>
      ) : null}
      <ul class="xp-gate">
        {e.gate.map((g, i) => (
          <li key={i} data-pass="true">
            <span class="xp-mark" aria-hidden="true">
              ✓
            </span>
            <span>
              {g.text} — {g.value}
            </span>
          </li>
        ))}
      </ul>
      {e.prediction ? (
        <figure class="compare-prediction">
          <figcaption>Your prediction</figcaption>
          <blockquote>{e.prediction}</blockquote>
        </figure>
      ) : null}
      {conclusion ? (
        <p>
          <strong>Your conclusion:</strong> {conclusion}
        </p>
      ) : null}
      <details class="xp-details">
        <summary>Measured when the stamp was recorded</summary>
        <div class="compare-table-wrap" tabIndex={0} role="region" aria-label="Measured values of this stamp">
          <table class="xp-table">
            <caption>
              {e.title}, seed {e.seed}, recipe {e.recipeId} r{e.recipeRevision}
            </caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">{paired ? 'A' : 'Value'}</th>
                {paired ? <th scope="col">B</th> : null}
                {paired ? <th scope="col">B − A</th> : null}
              </tr>
            </thead>
            <tbody>
              {journalMeasureCells(e.measures).map((m) => (
                <tr key={m.id}>
                  <th scope="row">{m.label}</th>
                  <td>{m.a}</td>
                  {paired ? <td>{m.b ?? '—'}</td> : null}
                  {paired ? <td>{m.diff ?? '—'}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </article>
  );
}
