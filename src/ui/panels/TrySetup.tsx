/**
 * Try my dish setup (P4.7; SPEC §13.6; D09 lines 135-136; UX §2 blocking panels): More → Try my dish….
 * The dish is paused while it is open (src/ui/tryDish.ts openTrySetup) and Cancel restores its run state.
 * Choices: a goal ("Free observation" checked by default, then each goal this dish offers that fits the
 * turn), the turn length (60 / 180 / 600 s, 180 by default) and an optional prediction note. Start keeps
 * the open dish first and opens turn 1, paused. A refusal is shown here and nothing changes.
 */
import { IconClose } from '../icons';
import { TURN_HORIZON_SECONDS, TURN_PREDICTION_MAX } from '@persist/notebookTurns';
import { chooseTurnLength, closeTrySetup, currentTurn, offeredGoals, openTrySetup, reopenHorizon, startTry, tryCard, trySetup, updateSetup } from '../tryDish';
import { sheet } from '../state';
import { TRY_TEXT } from '../strings/tryDish';

export function TrySetupSheet() {
  const s = trySetup.value;
  if (!s) return null;
  const offered = offeredGoals(s.goals, s.horizonSeconds);
  const hidden = (s.goals ?? []).length - offered.length;
  const options = [{ id: null as string | null, title: TRY_TEXT.freeObservation, summary: TRY_TEXT.freeObservationHint }, ...offered];
  return (
    <section class="sheet try-sheet" aria-labelledby="try-setup-title" data-testid="try-setup">
      <div class="sheet-scroll">
        <header>
          <h2 id="try-setup-title">{TRY_TEXT.setupTitle}</h2>
          <button class="btn ghost" aria-label={TRY_TEXT.cancel} onClick={closeTrySetup}>
            <IconClose />
          </button>
        </header>
        <p class="try-text">{TRY_TEXT.setupIntro}</p>
        {s.goals === null ? <p class="try-text">{TRY_TEXT.loading}</p> : null}
        {s.refusal !== null ? (
          <p class="constraint try-text" data-testid="try-refusal">
            {s.refusal}
          </p>
        ) : null}
        <fieldset class="goal-choices" data-testid="try-length">
          <legend>{TRY_TEXT.lengthLegend}</legend>
          {TURN_HORIZON_SECONDS.map((sec) => {
            const checked = s.horizonSeconds === sec;
            return (
              <label key={sec} class={`goal-choice${checked ? ' selected' : ''}`} data-testid={`try-length-${sec}`}>
                <input type="radio" name="try-length" value={String(sec)} checked={checked} onChange={() => chooseTurnLength(sec)} />
                <span class="goal-choice-text">
                  <strong>{TRY_TEXT.lengthOption(sec)}</strong>
                </span>
              </label>
            );
          })}
        </fieldset>
        <fieldset class="goal-choices" data-testid="try-goal">
          <legend>{TRY_TEXT.goalLegend}</legend>
          {options.map((o) => {
            const checked = s.objectiveId === o.id;
            return (
              <label key={o.id ?? 'free'} class={`goal-choice${checked ? ' selected' : ''}`} data-testid={`try-goal-${o.id ?? 'free'}`}>
                <input type="radio" name="try-goal" value={o.id ?? ''} checked={checked} onChange={() => updateSetup({ objectiveId: o.id })} />
                <span class="goal-choice-text">
                  <strong>{o.title}</strong>
                  <span>{o.summary}</span>
                </span>
              </label>
            );
          })}
          {hidden > 0 ? <p class="try-text try-muted">{TRY_TEXT.longerGoals}</p> : null}
        </fieldset>
        <label class="try-prediction">
          <span>{TRY_TEXT.predictionLabel}</span>
          <textarea
            value={s.prediction}
            maxLength={TURN_PREDICTION_MAX}
            rows={2}
            data-testid="try-prediction"
            onInput={(e) => updateSetup({ prediction: e.currentTarget.value })}
          />
        </label>
        {s.message !== null ? (
          <p class="constraint try-text" data-testid="try-message">
            {s.message}
          </p>
        ) : null}
        <div class="try-actions">
          <button class="btn primary" disabled={s.busy || s.refusal !== null || s.goals === null} data-testid="try-start" onClick={() => void startTry()}>
            {s.busy ? TRY_TEXT.starting : TRY_TEXT.start}
          </button>
          <button class="btn" onClick={closeTrySetup} data-testid="try-cancel">
            {TRY_TEXT.cancel}
          </button>
        </div>
      </div>
    </section>
  );
}

/** The More sheet's row: "Try my dish…", or for a turn at its horizon "Turn {n} result…" (the card again). */
export function TryMoreRow() {
  const t = currentTurn.value;
  const atHorizon = t !== null && t.state === 'atHorizon';
  return (
    <button
      class="btn"
      data-testid="more-try"
      onClick={() => {
        if (!atHorizon) {
          openTrySetup();
          return;
        }
        const c = tryCard.value;
        if (c && c.turn.turn === t.turn) sheet.value = 'tryHorizon';
        else {
          sheet.value = 'none';
          void reopenHorizon();
        }
      }}
    >
      {atHorizon ? TRY_TEXT.moreResult(t.turn) : TRY_TEXT.moreItem}
    </button>
  );
}
