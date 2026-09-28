/**
 * Trait overlay legend and follow status over the dish (P2.3; SPEC §10.8 "legend low→high"). Bands,
 * colors and counts come from the snapshot's recorded marks; each band is named in words and counted,
 * so the color is never the only way to read it.
 */
import { useEffect, useState } from 'preact/hooks';
import { TRAIT_BAND_CSS } from '@render/renderer';
import type { SnapshotMsg } from '@worker/protocol';
import { dishInfo, getClient } from '../state';
import { bandLabel, LINEAGE_TEXT as T } from '../strings/lineage';
import { followedBranch, lineage, openLineage, setTraitLocus, specimenPlacement, cancelSpecimenPlacement, stopFollowing, traitLocus } from './LineageState';

function useMarks(): SnapshotMsg['lineage'] | null {
  const [marks, setMarks] = useState<SnapshotMsg['lineage'] | null>(null);
  useEffect(
    () =>
      getClient().onSnapshot((s) => {
        if (s.dishId !== dishInfo.value?.dishId) return;
        setMarks(s.lineage ?? null);
      }),
    [],
  );
  return marks;
}

export function LineageLegend() {
  const marks = useMarks();
  const locus = traitLocus.value;
  const branch = followedBranch.value;
  const placing = specimenPlacement.value;
  if (locus === null && branch === null && !placing) return null;
  const ans = lineage.value;
  const loc = locus !== null ? ans?.loci[locus] : undefined;
  const row = branch !== null ? ans?.branches[branch] : undefined;
  const counts = marks && marks.locus === locus ? marks.bandCounts : null;
  return (
    <aside class="lineage-legend" aria-label="Family tree overlay" data-testid="trait-legend">
      {placing ? (
        <div class="lineage-legend-row">
          <span>Tap the dish to add {placing.count} from {placing.label}.</span>
          <button class="btn" onClick={cancelSpecimenPlacement}>
            {T.cancel}
          </button>
        </div>
      ) : null}
      {branch !== null ? (
        <div class="lineage-legend-row">
          <span data-testid="following-label">
            <span class="lineage-ring-key" aria-hidden="true" /> Following {row?.name ?? 'a branch'}
            {marks && marks.branch === branch ? ` · ${marks.members} living ringed` : ''}
          </span>
          <button class="btn" onClick={stopFollowing} data-testid="stop-following">
            {T.stopFollow}
          </button>
        </div>
      ) : null}
      {locus !== null ? (
        <>
          <div class="lineage-legend-row">
            <strong>{loc?.name ?? 'Trait'}</strong>
            <button class="btn" onClick={() => void openLineage()}>
              Change
            </button>
            <button class="btn" onClick={() => setTraitLocus(null)} data-testid="trait-off">
              {T.traitOff}
            </button>
          </div>
          <ul class="lineage-bands">
            {TRAIT_BAND_CSS.map((color, b) => (
              <li key={b}>
                <span class="lineage-swatch" style={{ background: color }} aria-hidden="true" />
                {bandLabel(b, loc)}
                {counts ? `: ${counts[b]}` : ''}
              </li>
            ))}
            <li>
              <span class="lineage-swatch dim" aria-hidden="true" />
              Not active for this kind (dimmed){marks && marks.locus === locus ? `: ${marks.inactive}` : ''}
            </li>
          </ul>
        </>
      ) : null}
    </aside>
  );
}
