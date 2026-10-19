/**
 * Notebook → Succession (P5.6 part 3; SPEC §12.8 "succession notebook (Phase 5: one‑minute templated summaries
 * tied to event IDs, provenance‑aware wording)"; D02 §23 names it; the tab is UX-silent, PROPOSED DECISION in
 * D-0131's wave): the open dish's minute entries, newest first. Each entry reads "Minute 3 (2:00–3:00)", its
 * sentences (src/ui/strings/succession.ts, built from the stored kinds and values), "Watched from 2:41 …" when
 * the watch started inside the minute, and Look back, which opens the dish's History (the Look back pattern of
 * the favorite's extinction card). Text only: no colour carries meaning. Entries are kept with each dish
 * (D-0070), so with no dish open there is nothing to list here.
 */
import { successionOf } from '@persist/notebookSuccession';
import { dishInfo, historyMinute, route, sheet } from '../state';
import type { SuccessionEntry } from '@persist/notebookSuccession';
import { notebook } from '../favorites';
import { storyNames } from '../stories';
import { entrySentences, minuteHeading, SUCCESSION_TEXT, watchedLine } from '../strings/succession';

/**
 * Look back: back to the dish with History open at "What happened" for the entry's minute (the dish stays paused;
 * nothing is changed). Fix round 1: the minute focus (state.ts historyMinute) filters the events listed to it.
 */
function lookBack(e: SuccessionEntry): void {
  historyMinute.value = { fromTick: e.fromTick, toTick: e.toTick, label: minuteHeading(e) };
  route.value = { name: 'dish' };
  sheet.value = 'history';
}

export function NotebookSuccession() {
  const info = dishInfo.value;
  const nb = notebook.value;
  if (!info) return <p class="nb-empty">{SUCCESSION_TEXT.noDish}</p>;
  if (!nb) return <p class="nb-empty">{SUCCESSION_TEXT.reading}</p>;
  const entries = [...successionOf(nb)].reverse();
  const names = storyNames();
  return (
    <>
      <p class="nb-intro">{SUCCESSION_TEXT.intro}</p>
      {entries.length === 0 ? (
        <p class="nb-empty" data-testid="succession-empty">
          {SUCCESSION_TEXT.empty}
        </p>
      ) : (
        <ul class="nb-cards" aria-label={SUCCESSION_TEXT.listLabel(info.name)} data-testid="succession-list">
          {entries.map((e) => {
            const watched = watchedLine(e);
            return (
              <li key={e.id}>
                <article class="card nb-card" aria-labelledby={`succ-${e.minute}-title`} data-testid="succession-entry">
                  <h2 id={`succ-${e.minute}-title`}>{minuteHeading(e)}</h2>
                  {watched !== null ? (
                    <p class="nb-question" data-testid="succession-watched">
                      {watched}
                    </p>
                  ) : null}
                  {entrySentences(e, names).map((s, k) => (
                    <p key={k} data-testid="succession-line">
                      {s}
                    </p>
                  ))}
                  <button class="btn" onClick={() => lookBack(e)} aria-label={`${SUCCESSION_TEXT.lookBack}: minute ${e.minute}`} data-testid="succession-look-back">
                    {SUCCESSION_TEXT.lookBack}
                  </button>
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
