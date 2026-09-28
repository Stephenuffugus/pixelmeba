/**
 * One experiment card in full (SPEC §13.2; UX §1 Notebook → Experiments): question, recipe, suggested
 * intervention, predicted tradeoff, measurements, stopping point, confounds, observation gate and
 * completion behavior. Start makes a new paused dish from the card's recorded recipe and seed.
 */
import { useEffect } from 'preact/hooks';
import { IconBack, IconPlay } from '../icons';
import { journal } from '../journal';
import { busy, experimentCard, experimentCards, experimentCardsError, loadExperimentCards, route, startExperiment } from '../state';
import { clauseText, completionText, describeArms, durationText, measureLabel, playerStepText } from '../strings/experiments';

export function ExperimentCard() {
  const r = route.value;
  const cardId = r.name === 'experiment' ? r.cardId : '';
  useEffect(() => {
    void loadExperimentCards();
  }, []);
  const card = experimentCards.value ? experimentCard(cardId) : null;
  const back = () => (route.value = { name: 'notebook', tab: 'experiments' });

  if (!card) {
    return (
      <main class="page" aria-labelledby="xp-card-title">
        <div class="home-grid">
          <header class="nb-header">
            <button class="btn ghost nb-back" onClick={back} aria-label="Back to Experiments">
              <IconBack />
            </button>
            <h1 id="xp-card-title">Experiment</h1>
          </header>
          <p class="nb-empty">{experimentCards.value ? 'This card is not in this version of Pixelmeba.' : (experimentCardsError.value ?? 'Reading the card…')}</p>
        </div>
      </main>
    );
  }

  const arms = describeArms(card);
  const labels = card.labels.filter((l) => !/^Experiment\b/.test(l));
  const startAt = card.change.kind === 'commands' ? card.change.atSecond : 0;
  const stamps = journal.value.filter((e) => e.experimentId === card.id).length;
  return (
    <main class="page" aria-labelledby="xp-card-title" data-testid="experiment-card">
      <div class="home-grid">
        <header class="nb-header">
          <button class="btn ghost nb-back" onClick={back} aria-label="Back to Experiments">
            <IconBack />
          </button>
          <h1 id="xp-card-title">{card.title}</h1>
        </header>
        <article class="card xp-card">
          {labels.length > 0 ? (
            <p class="xp-badges">
              {labels.map((l) => (
                <span key={l} class="xp-badge" data-testid="experiment-label">
                  {l}
                </span>
              ))}
            </p>
          ) : null}
          <h2>Question</h2>
          <p class="xp-question">{card.question}</p>

          <h2>Recipe</h2>
          <p>
            “{card.recipeName}” ({card.recipeId}, revision {card.recipeRevision}), seed {card.seed}. {card.expectedObservations}
          </p>

          <h2>Suggested intervention</h2>
          <p>{card.intervention}</p>
          {card.paired ? (
            <dl class="xp-arms" data-testid="experiment-card-arms">
              <dt>A</dt>
              <dd>{arms.a}</dd>
              <dt>B</dt>
              <dd>{arms.b}</dd>
            </dl>
          ) : (
            <p class="xp-note">One dish: the recipe as written. Nothing is changed for you.</p>
          )}

          <h2>Predicted tradeoff</h2>
          <p>{card.predictedTradeoff}</p>

          <h2>Measurements</h2>
          <ul class="xp-list">
            {card.measurements.map((id) => (
              <li key={id}>{measureLabel(card, id)}</li>
            ))}
          </ul>

          <h2>Stopping point</h2>
          <p>
            {card.paired ? 'Both copies run' : 'The dish runs'} to {durationText(card.stoppingSeconds)} of dish time
            {startAt > 0 ? ` (${durationText(card.stoppingSeconds - startAt)} after the copy at ${startAt} s)` : ''}.
          </p>

          <h2>Confounds</h2>
          <p>{card.confounds}</p>

          <h2>Observation gate</h2>
          <ul class="xp-list">
            {card.gate.map((g, i) => (
              <li key={i}>{clauseText(card, g)}</li>
            ))}
          </ul>
          {card.playerSteps.length > 0 ? (
            <>
              <p>The stamp also needs you to:</p>
              <ul class="xp-list" data-testid="experiment-card-steps">
                {card.playerSteps.map((st) => (
                  <li key={st}>{playerStepText(card, st)}</li>
                ))}
              </ul>
            </>
          ) : null}
          <p data-testid="experiment-card-completion">
            {completionText(card)}
            {stamps > 0 ? ` You have ${stamps} stamp${stamps === 1 ? '' : 's'} from this card.` : ''}
          </p>

          <button class="btn primary xp-start" disabled={busy.value} onClick={() => void startExperiment(card.id)} data-testid="experiment-start">
            <IconPlay /> Start this experiment
          </button>
          <p class="xp-note">
            Starts a new paused dish from this recipe and seed{startAt > 0 ? `, run to ${startAt} s before the copy` : ''}. Your current dish is kept in Continue first.
          </p>
        </article>
      </div>
    </main>
  );
}
