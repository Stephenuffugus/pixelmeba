/**
 * Start challenge and Leave challenge (P4.8 part c; D09 line 134 "must display those restrictions before
 * Start"; D07 line 107 "The player can always abandon a challenge and open an explicitly unrestricted copy").
 * Sheet 'challenge', views 'start' and 'leave' (src/ui/challenge.ts); the editor is ChallengeEditor.tsx.
 *
 * - Start shows the goal, the restrictions ("Allowed: Add Life, Feed. Up to 10 actions. Inspecting and
 *   looking are always free. These limits apply only inside this challenge.") and the turn length first;
 *   Start keeps the open dish first and opens the challenge's turn 1, paused. A dish that changed since the
 *   challenge was made (and whose starting point is not on this device) says so and cannot start.
 * - Leave: Open an unrestricted copy (the ordinary Duplicate path); the challenge turn is unchanged.
 * - ChallengeMoreRows: the More sheet's rows (Make a challenge…, Start challenge: {name}, Export challenge,
 *   and in a challenge turn Leave challenge…).
 */
import { IconClose } from '../icons';
import { challengesOf } from '@persist/notebookChallenges';
import { dishInfo, sheet } from '../state';
import { notebook } from '../favorites';
import { currentTurn } from '../tryDish';
import {
  challengeSheet,
  chooseChallenge,
  closeChallengeSheet,
  defaultChallenge,
  exportChallenge,
  openChallengeEditor,
  openChallengeLeave,
  openChallengeStart,
  openUnrestrictedCopy,
  startChallenge,
} from '../challenge';
import { ChallengeEditor } from './ChallengeEditor';
import { CHALLENGE_TEXT, objectiveLine, restrictionsSummary, turnLine } from '../strings/challenge';
import { challengeActive } from '@worker/challenge';

function StartView() {
  const s = challengeSheet.value!;
  const info = dishInfo.value;
  const records = challengesOf(notebook.value ?? {});
  const c = records.find((x) => x.id === s.challengeId) ?? null;
  const speciesName = (id: string) => info?.speciesNames[info.speciesIds.indexOf(id)] ?? id;
  return (
    <section class="sheet try-sheet ch-sheet" aria-labelledby="ch-start-title" data-testid="challenge-start">
      <div class="sheet-scroll">
        <header>
          <h2 id="ch-start-title">{CHALLENGE_TEXT.startTitle(c?.name ?? '')}</h2>
          <button class="btn ghost" aria-label={CHALLENGE_TEXT.cancel} onClick={closeChallengeSheet}>
            <IconClose />
          </button>
        </header>
        {records.length > 1 ? (
          <label class="ch-field" for="ch-choose">
            <span>{CHALLENGE_TEXT.chooseLabel}</span>
            <select id="ch-choose" value={s.challengeId ?? ''} onChange={(e) => chooseChallenge(e.currentTarget.value)}>
              {records.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {c ? (
          <div class="ch-summary">
            <p class="try-text" data-testid="ch-start-goal">
              {objectiveLine(c, speciesName)}
            </p>
            <p class="try-text" data-testid="ch-start-restrictions">
              {restrictionsSummary(c)}
            </p>
            <p class="try-text">{turnLine(c.horizonSeconds)}</p>
          </div>
        ) : null}
        {s.refusal === undefined ? <p class="try-text">{CHALLENGE_TEXT.checking}</p> : null}
        {typeof s.refusal === 'string' ? (
          <p class="constraint try-text" data-testid="ch-start-refusal">
            {s.refusal}
          </p>
        ) : null}
        {s.message !== null ? (
          <p class="constraint try-text" data-testid="ch-message">
            {s.message}
          </p>
        ) : null}
        <div class="try-actions">
          <button class="btn primary" disabled={s.busy || s.refusal !== null || !c} data-testid="ch-start" onClick={() => void startChallenge()}>
            {s.busy ? CHALLENGE_TEXT.starting : CHALLENGE_TEXT.start}
          </button>
          <button class="btn" onClick={closeChallengeSheet} data-testid="ch-cancel">
            {CHALLENGE_TEXT.cancel}
          </button>
        </div>
      </div>
    </section>
  );
}

function LeaveView() {
  const s = challengeSheet.value!;
  return (
    <section class="sheet try-sheet ch-sheet" aria-labelledby="ch-leave-title" data-testid="challenge-leave">
      <div class="sheet-scroll">
        <header>
          <h2 id="ch-leave-title">{CHALLENGE_TEXT.leaveTitle}</h2>
          <button class="btn ghost" aria-label={CHALLENGE_TEXT.cancel} onClick={closeChallengeSheet}>
            <IconClose />
          </button>
        </header>
        <p class="try-text">{CHALLENGE_TEXT.leaveIntro}</p>
        {s.message !== null ? (
          <p class="constraint try-text" data-testid="ch-message">
            {s.message}
          </p>
        ) : null}
        <div class="try-actions">
          <button class="btn primary" disabled={s.busy} data-testid="ch-open-copy" onClick={() => void openUnrestrictedCopy()}>
            {CHALLENGE_TEXT.openCopy}
          </button>
          <button class="btn" onClick={closeChallengeSheet} data-testid="ch-cancel">
            {CHALLENGE_TEXT.cancel}
          </button>
        </div>
      </div>
    </section>
  );
}

/** The sheet 'challenge' (DishScreen): the editor, the start sheet or Leave challenge. */
export function ChallengeSheet() {
  const s = challengeSheet.value;
  if (!s) return null;
  if (s.view === 'edit') return <ChallengeEditor />;
  return s.view === 'start' ? <StartView /> : <LeaveView />;
}

/** The More sheet's challenge rows. */
export function ChallengeMoreRows() {
  const info = dishInfo.value;
  if (!info) return null;
  const records = challengesOf(notebook.value?.worldId === info.worldId ? notebook.value : {});
  const turnChallenge = currentTurn.value?.challenge ?? null;
  const latest = defaultChallenge(records, turnChallenge?.id ?? null);
  // Fix round 1: a finished turn is an ordinary dish (its limits ended with Finish), so there is no challenge to leave.
  const inChallenge = challengeActive(currentTurn.value);
  return (
    <>
      <button
        class="btn"
        data-testid="more-challenge"
        onClick={() => {
          sheet.value = 'none';
          openChallengeEditor();
        }}
      >
        {CHALLENGE_TEXT.moreMake}
      </button>
      {latest ? (
        <button
          class="btn"
          data-testid="more-challenge-start"
          onClick={() => {
            sheet.value = 'none';
            openChallengeStart(latest.id);
          }}
        >
          {CHALLENGE_TEXT.moreStart(latest.name)}
        </button>
      ) : null}
      {latest ? (
        <button
          class="btn"
          data-testid="more-challenge-export"
          onClick={() => {
            sheet.value = 'none';
            void exportChallenge(latest.id);
          }}
        >
          {CHALLENGE_TEXT.moreExport}
        </button>
      ) : null}
      {inChallenge ? (
        <button
          class="btn"
          data-testid="more-challenge-leave"
          onClick={() => {
            sheet.value = 'none';
            openChallengeLeave();
          }}
        >
          {CHALLENGE_TEXT.moreLeave}
        </button>
      ) : null}
    </>
  );
}
