/**
 * The cell inspector's reaction ledger (P3.6; SPEC §12.1, §5.3; UX §5.1): per enzyme in this cell —
 * activity and effective activity, substrate present, carbon converted and product made here in the
 * last whole second, bound nutrient moved — and the whole dish's last second and cumulative total.
 * Body text (16 px), never the small key/value grid. Reads the worker's measured rows only.
 */
import type { ReactionRow } from '@worker/protocol';
import { dishInfo } from '../state';
import { activityText, dishText, ENZYME_NAMES, lastSecondText, provenanceText, REACTION_TEXT, substrateText } from '../strings/reactions';

function speciesName(id: string): string {
  const info = dishInfo.value;
  if (!info) return id;
  return info.speciesNames[info.speciesIds.indexOf(id)] ?? id;
}

export function ReactionLedger({ rows }: { rows: readonly ReactionRow[] }) {
  return (
    <section class="reaction-ledger" aria-labelledby="reaction-ledger-heading" data-testid="reaction-ledger">
      <h3 id="reaction-ledger-heading">{REACTION_TEXT.heading}</h3>
      {rows.length === 0 ? (
        <p data-testid="reaction-none">{REACTION_TEXT.none}</p>
      ) : (
        rows.map((r) => (
          <div key={r.enzyme} class="reaction-row" data-testid={`reaction-${r.enzyme}`}>
            <p class="reaction-name">
              <strong>{ENZYME_NAMES[r.enzyme]}</strong>{' '}
              <span data-testid={`reaction-${r.enzyme}-source`}>· {provenanceText(r.madeBy.map(speciesName))}</span>
            </p>
            <p>{activityText(r)}</p>
            <p>{substrateText(r)}</p>
            <p data-testid={`reaction-${r.enzyme}-last`}>{lastSecondText(r)}</p>
            <p class="sub" data-testid={`reaction-${r.enzyme}-dish`}>
              {dishText(r)}
            </p>
          </div>
        ))
      )}
    </section>
  );
}
