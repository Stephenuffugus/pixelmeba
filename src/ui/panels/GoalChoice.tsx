/**
 * Goal choices (P4.4; SPEC §13.5; D09 §6 "Goals are off by default in free play"):
 *
 * - `GoalChoice`: on the Play card's Garden, below Start — "Goal (optional)", a radio group with "No goal"
 *   checked by default and each goal the Garden offers with its summary. Start starts the dish and then
 *   the chosen goal at the dish's tick 0 (state.ts startRecipe; the dish starts paused);
 * - `GoalRow`: the More sheet's Goal row — while a goal runs, "Goal: {title} — running since {m:ss}" and
 *   Leave goal; otherwise "Try a goal…" with the goals this dish offers, and the latest record's state.
 *
 * Neither changes the dish's speed or sends a command: goals are notebook state (D-0070, D-0071).
 */
import { useEffect, useState } from 'preact/hooks';
import { goalsOf } from '@persist/notebookGoals';
import { dishClock, dishInfo, getClient, sheet } from '../state';
import { notebook } from '../favorites';
import { goalOffers, leaveGoal, loadPlayOffers, playGoalChoice, playGoalOffers, startGoal } from '../goals';
import { GOAL_TEXT, lastGoalLine } from '../strings/goals';

export function GoalChoice(props: { readonly recipeId: string }) {
  useEffect(() => {
    playGoalChoice.value = null; // "No goal" each time the card opens
    void loadPlayOffers(props.recipeId);
  }, [props.recipeId]);
  const offers = playGoalOffers.value;
  if (offers.length === 0) return null;
  const choice = playGoalChoice.value;
  const options = [{ id: null, title: GOAL_TEXT.noGoal, summary: GOAL_TEXT.noGoalHint }, ...offers];
  return (
    <fieldset class="goal-choices" data-testid="goal-choice">
      <legend>{GOAL_TEXT.choiceLegend}</legend>
      {options.map((o) => {
        const checked = choice === o.id;
        return (
          <label key={o.id ?? 'none'} class={`goal-choice${checked ? ' selected' : ''}`} data-testid={`goal-choice-${o.id ?? 'none'}`}>
            <input type="radio" name="garden-goal" value={o.id ?? ''} checked={checked} onChange={() => (playGoalChoice.value = o.id)} />
            <span class="goal-choice-text">
              <strong>{o.title}</strong>
              <span>{o.summary}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export function GoalRow() {
  const info = dishInfo.value;
  const nb = notebook.value;
  const offers = goalOffers.value;
  const [open, setOpen] = useState(false);
  // The record as the worker holds it now (a goal may have settled while the sheet was closed).
  useEffect(() => {
    const id = info?.dishId;
    if (!id) return;
    void getClient()
      .notebookGet(id)
      .then((r) => {
        if (dishInfo.peek()?.dishId === id) notebook.value = r.record;
      })
      .catch(() => undefined);
  }, [info?.dishId]);
  if (!info) return null;
  const goals = nb ? goalsOf(nb) : [];
  if (offers.length === 0 && goals.length === 0) return null;
  const running = goals.find((g) => g.state === 'running');
  const line = lastGoalLine(running ?? goals.at(-1), dishClock);
  return (
    <div class="goal-row" role="group" aria-labelledby="goal-row-title" data-testid="goal-row">
      <h3 id="goal-row-title">{GOAL_TEXT.rowTitle}</h3>
      {line ? (
        <p class="goal-status" data-testid="goal-status">
          {line}
        </p>
      ) : null}
      {running ? (
        <button class="btn" data-testid="goal-leave" onClick={() => void leaveGoal(info.dishId)}>
          {GOAL_TEXT.leave}
        </button>
      ) : offers.length === 0 ? (
        <p class="goal-status">{GOAL_TEXT.noneOffered}</p>
      ) : (
        <>
          <button class="btn" aria-expanded={open} aria-controls="goal-offers" data-testid="goal-try" onClick={() => setOpen(!open)}>
            {open ? GOAL_TEXT.tryGoalHide : GOAL_TEXT.tryGoal}
          </button>
          {open ? (
            <ul id="goal-offers" class="goal-offers">
              {offers.map((o) => (
                <li key={o.id}>
                  <button
                    class="btn"
                    data-testid={`goal-start-${o.id}`}
                    onClick={() => {
                      setOpen(false);
                      sheet.value = 'none';
                      void startGoal(info.dishId, o.id);
                    }}
                  >
                    {o.title}
                  </button>
                  <p class="goal-summary">{o.summary}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </div>
  );
}
