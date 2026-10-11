/**
 * The horizon card (P4.7; SPEC §13.6; D09 lines 136-139): a turn reached its end and the dish paused. The
 * text is the recorded facts only — the dish time, how long the turn ran, the goal line from the goal
 * record ("Free observation" when none), births and deaths since the turn started (the read-only
 * 'sessionSummary' query) and the player's prediction, labelled "Your prediction" and never graded. No score.
 * Keep this result / Another turn / Finish; Another turn asks "Discard this turn?" first unless it is kept.
 */
import { IconClose } from '../icons';
import { anotherTurn, cancelDiscard, confirmDiscard, finishTurn, keepTurn, tryCard } from '../tryDish';
import { sheet } from '../state';
import { TRY_TEXT, turnGoalLine } from '../strings/tryDish';

export function TryHorizonSheet() {
  const c = tryCard.value;
  if (!c) return null;
  const t = c.turn;
  const working = c.step === 'working';
  const keptSlot = t.kept ? Number(t.kept.slotId.replace('slot', '')) : null;
  return (
    <section class="sheet try-sheet" aria-labelledby="try-horizon-title" data-testid="try-horizon">
      <div class="sheet-scroll">
        <header>
          <h2 id="try-horizon-title">{TRY_TEXT.horizonTitle(t.turn)}</h2>
          <button class="btn ghost" aria-label="Close" onClick={() => (sheet.value = 'none')}>
            <IconClose />
          </button>
        </header>
        <p class="try-text" data-testid="try-reached">
          {TRY_TEXT.reached(t.turn, t.startTick + c.elapsedTicks)}
        </p>
        <p class="try-text">{TRY_TEXT.ran(c.elapsedTicks, t.startTick)}</p>
        <p class="try-text" data-testid="try-goal-line">
          {turnGoalLine(c.goal)}
        </p>
        <p class="try-text" data-testid="try-events">
          {c.events ? TRY_TEXT.births(c.events.births, c.events.deaths, c.events.atLeast) : TRY_TEXT.eventsLoading}
        </p>
        {t.prediction !== '' ? (
          <div class="try-prediction-note" data-testid="try-prediction-note">
            <h3>{TRY_TEXT.predictionHeading}</h3>
            <p class="try-text">{t.prediction}</p>
          </div>
        ) : null}
        {keptSlot !== null ? (
          <p class="try-text" data-testid="try-kept">
            {TRY_TEXT.kept(keptSlot)}
          </p>
        ) : null}
        {c.message !== null ? (
          <p class="constraint try-text" data-testid="try-card-message">
            {c.message}
          </p>
        ) : null}
        {c.step === 'confirmDiscard' ? (
          <div class="constraint" role="alertdialog" aria-labelledby="try-discard-q" data-testid="try-discard">
            <p id="try-discard-q" class="try-text" style={{ margin: 0 }}>
              {TRY_TEXT.discardQuestion}
            </p>
            <div class="try-actions">
              <button class="btn primary" data-testid="try-discard-confirm" onClick={() => void confirmDiscard()}>
                {TRY_TEXT.discard}
              </button>
              <button class="btn" data-testid="try-discard-cancel" onClick={cancelDiscard}>
                {TRY_TEXT.cancel}
              </button>
            </div>
          </div>
        ) : (
          <div class="try-actions try-actions-stack">
            <button class="btn" disabled={working || keptSlot !== null} data-testid="try-keep" onClick={() => void keepTurn()}>
              {working ? TRY_TEXT.keeping : TRY_TEXT.keep}
            </button>
            <button class="btn primary" disabled={working || c.baselineMissing} data-testid="try-another" onClick={() => void anotherTurn()}>
              {TRY_TEXT.another}
            </button>
            <button class="btn" disabled={working} data-testid="try-finish" onClick={() => void finishTurn()}>
              {TRY_TEXT.finish}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
