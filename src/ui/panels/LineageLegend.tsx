/**
 * Trait overlay legend and follow status over the dish (P2.3; SPEC §10.8 "legend low→high"). Bands,
 * colours and counts come from the snapshot's recorded marks; each band is named in words and
 * counted, so colour is never the only way to read it. Also the "tap to place a specimen" hint. Kept
 * compact so the middle of the dish, where Follow keeps its organism, stays uncovered.
 */
import { TRAIT_BAND_CSS } from '@render/renderer';
import { bandLabel, LINEAGE_TEXT as T } from '../strings/lineage';
import { cancelSpecimenPlacement, followedBranch, lineage, lineageMarks, openLineage, setTraitLocus, specimenPlacement, stopFollowing, traitLocus } from './LineageState';

export function LineageLegend() {
  const locus = traitLocus.value;
  const branch = followedBranch.value;
  const placing = specimenPlacement.value;
  if (locus === null && branch === null && !placing) return null;
  // Read only while shown, so the 10 Hz snapshot marks never re-render a hidden legend.
  const marks = lineageMarks.value;
  const ans = lineage.value;
  const loc = locus !== null ? ans?.loci[locus] : undefined;
  const row = branch !== null ? ans?.branches[branch] : undefined;
  const counts = marks && marks.locus === locus ? marks.bandCounts : null;
  const treeButton = (
    <button class="btn" onClick={() => void openLineage({ ...(branch !== null ? { branch } : {}) })} data-testid="legend-open-tree">
      {T.openTree}
    </button>
  );
  return (
    <aside class="lineage-legend" aria-label="Family tree overlay" data-testid="trait-legend">
      <div class="lineage-legend-scroll">
        {/* While a specimen waits for its tap, only that prompt shows, so it covers as little as possible. */}
        {placing ? (
          <>
            <p class="lineage-legend-text" data-testid="specimen-placing">
              Tap the dish to add {placing.count} from {placing.label}.
            </p>
            <div class="lineage-legend-row">
              <button class="btn" onClick={cancelSpecimenPlacement}>
                {T.cancel}
              </button>
            </div>
          </>
        ) : null}
        {branch !== null && !placing ? (
          <>
            <p class="lineage-legend-text" data-testid="following-label">
              <span class="lineage-ring-key" aria-hidden="true" /> Following {row?.name ?? 'a branch'}
              {marks && marks.branch === branch ? ` · ${marks.members} living ringed` : ''}
            </p>
            <div class="lineage-legend-row">
              <button class="btn" onClick={stopFollowing} data-testid="stop-following">
                {T.stopFollow}
              </button>
              {treeButton}
            </div>
          </>
        ) : null}
        {locus !== null && !placing ? (
          <>
            <p class="lineage-legend-text">
              <strong>{loc?.name ?? 'Trait'}</strong> (inherited value)
            </p>
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
                Not active for this kind (grey){marks && marks.locus === locus ? `: ${marks.inactive}` : ''}
              </li>
            </ul>
            <div class="lineage-legend-row">
              <button class="btn" onClick={() => setTraitLocus(null)} data-testid="trait-off">
                Overlay off
              </button>
              {branch === null ? treeButton : null}
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
