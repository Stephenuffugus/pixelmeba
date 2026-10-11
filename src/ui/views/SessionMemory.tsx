/**
 * Home's session memory after "Save and leave" (P4.3; D08 "A satisfying stopping point"): the dish name,
 * its current picture, the dish time and at most one recorded change since it was opened. When nothing
 * notable was recorded it shows the saved state without inventing a highlight. Continue resumes paused at
 * the same moment (leaving the dish screen paused it).
 */
import { IconPlay } from '../icons';
import { continueCardText, route, type SessionMemory as Memory } from '../state';
import { HOME_TEXT } from '../strings/home';
import { DishThumb } from './DishThumb';

export function SessionMemory(props: { readonly memory: Memory; readonly modes: string | null }) {
  const m = props.memory;
  return (
    <section class="card session-memory" aria-labelledby="session-memory-title" data-testid="session-memory">
      <h2 id="session-memory-title">{HOME_TEXT.sessionTitle}</h2>
      <div class="card-row">
        <DishThumb thumb={m.thumb} name={m.name} testId="session-memory-thumb" />
        <div>
          <p class="paused-badge">{HOME_TEXT.paused}</p>
          <p data-testid="session-memory-text">{continueCardText(m.name, m.tick)}</p>
          <p data-testid="session-memory-line">{m.line ?? HOME_TEXT.sessionQuiet}</p>
          {props.modes ? (
            <p class="world-modes" data-testid="home-continue-modes">
              {props.modes}
            </p>
          ) : null}
        </div>
      </div>
      <button class="btn primary" onClick={() => (route.value = { name: 'dish' })} data-testid="home-continue">
        <IconPlay /> Continue
      </button>
    </section>
  );
}
