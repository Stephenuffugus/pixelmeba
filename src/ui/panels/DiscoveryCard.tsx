/**
 * Discovery card (UX §5.5, D04 §8, D06): "New branch: {name}" with Follow · Compare · Dismiss. One
 * card per burst of discoveries, at most one per minute; it pauses the dish only when the player
 * chose "Pause when a new branch is named". Text comes from the recorded branch.
 */
import { useEffect } from 'preact/hooks';
import { IconClose, IconFollow } from '../icons';
import { discoveryLines, LINEAGE_TEXT as T } from '../strings/lineage';
import { discovery, dismissDiscovery, followLineage, openLineage, watchDiscoveries } from './LineageState';

export function DiscoveryCard() {
  useEffect(() => watchDiscoveries(), []);
  const d = discovery.value;
  return (
    <div class="discovery-live" role="status" aria-live="polite">
      {d ? <Card /> : null}
    </div>
  );
}

function Card() {
  const d = discovery.value!;
  const first = d.rows[0]!;
  const more = d.rows.length - 1;
  return (
    <section class="discovery-card" aria-labelledby="discovery-title" data-testid="discovery-card">
      <header>
        <h2 id="discovery-title" data-testid="discovery-title">
          New branch: {first.name}
        </h2>
        <button class="btn ghost" aria-label="Dismiss" onClick={dismissDiscovery}>
          <IconClose />
        </button>
      </header>
      {discoveryLines(first, d.answer).map((l) => (
        <p key={l}>{l}</p>
      ))}
      {more > 0 ? <p>{more === 1 ? `Also named: ${d.rows[1]!.name}.` : `Also named: ${more} more branches (see the family tree).`}</p> : null}
      {d.paused ? <p>The dish is paused, as you chose in the family tree settings.</p> : null}
      <div class="lineage-actions">
        <button
          class="btn primary"
          data-testid="discovery-follow"
          disabled={first.living === 0}
          onClick={() => {
            dismissDiscovery();
            void followLineage(first.id);
          }}
        >
          <IconFollow /> Follow
        </button>
        <button
          class="btn"
          data-testid="discovery-compare"
          onClick={() => {
            dismissDiscovery();
            void openLineage({ branch: first.id, section: 'compare' });
          }}
        >
          {T.compare.replace(' ancestor', '')}
        </button>
        <button class="btn" data-testid="discovery-dismiss" onClick={dismissDiscovery}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
