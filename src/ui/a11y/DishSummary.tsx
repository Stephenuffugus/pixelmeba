/**
 * The canvas, summarized (UX §9 "canvas summarized via an accessible species list"; P3.11 W6-03): each
 * species in the dish with its living count (SnapshotMsg.speciesCounts), the count's trend over the
 * last 30 s of dish time as this screen received it, and "extinct" once its members were seen and none
 * is alive (members held in a Sample are named as held, never as extinct). A visually hidden region beside the dish; screen readers reach it like any section.
 *
 * Why counts, not History's biomass: a History request is a player step for experiment cards
 * (DishHost.experimentHistoryOpened → 'openResourceHistory'), so a summary that polled it would tick
 * steps the player never took (see docs/reports/reviews/g3-wave-4b/a11y-build.md, proposed decision).
 */
import { heldSample } from '../panels/SampleSession';
import { dishInfo, meta } from '../state';
import { dishSummaryText, organismInputs, recordCounts, summaryInputs, type CountTrack } from './describe';

let track: CountTrack | null = null;

export function DishSummary() {
  const info = dishInfo.value;
  const m = meta.value;
  if (!info || !m) return null;
  track = recordCounts(track, info.dishId, m.tick, m.speciesCounts);
  const inputs = summaryInputs(track, info.speciesNames, heldSample.value?.speciesHeld ?? []);
  const text = dishSummaryText(organismInputs(inputs, info.speciesDiets));
  return (
    <section class="sr-only" aria-labelledby="dish-summary-title" data-testid="dish-summary">
      <h2 id="dish-summary-title">Dish summary</h2>
      <p>{text.heading}</p>
      {text.lines.length > 0 ? (
        <ul>
          {text.lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      {text.absent ? <p>{text.absent}</p> : null}
    </section>
  );
}
