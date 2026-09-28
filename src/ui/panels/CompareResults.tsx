/**
 * Comparison results (SPEC §13.4, UX §5.6): a table of measures with A, B and the absolute difference
 * B − A, always labelled "this paired run"; the prediction note beside it; a conclusion label picked
 * by the player; Save result card. Every number is a measured value from the worker.
 */
import type { ArmMeasures, ComparisonResults } from '@worker/comparison';
import type { DishInfo } from '@worker/protocol';
import {
  closeCompare,
  compareCardSaved,
  compareConclusion,
  compareNote,
  compareState,
  dishInfo,
  saveCompareCard,
} from '../state';
import { causeLabel, clock, CONCLUSIONS, describeChanges, fmt, fmtDiff, rowLabel } from './CompareText';
import { PredictionNote } from './CompareSetup';

export function CompareResults() {
  const c = compareState.value;
  const info = dishInfo.value;
  const r = c?.results;
  if (!c || !info || !r) return null;
  const change = describeChanges(info, r.interventions);
  const main = r.rows.filter((row) => row.key !== 'speciesCount' && row.key !== 'speciesBiomass');
  const perSpecies = r.rows.filter((row) => row.key === 'speciesCount' || row.key === 'speciesBiomass');
  return (
    <div class="compare-body">
      <h2 id="compare-heading" data-testid="compare-results-title">
        Results · {r.label}
      </h2>
      <p class="sub" data-testid="compare-summary">
        A (baseline) and B ({change}) each ran {clock(r.ticks)} from {clock(r.baselineTick)}
        {r.stoppedEarly ? ' (stopped early)' : ''}. They started identical; your change was the only recorded difference. These numbers describe this paired run only —
        another seed, horizon or change could turn out differently.
      </p>
      <div class="compare-results-grid">
        <PredictionNote />
        <div class="compare-table-wrap">
          <table class="compare-table" data-testid="compare-table">
            <caption>Measures at the end of this paired run</caption>
            <thead>
              <tr>
                <th scope="col">Measure</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
                <th scope="col">B − A</th>
              </tr>
            </thead>
            <tbody>
              {main.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{rowLabel(row, info)}</th>
                  <td>{fmt(row.a, row.key)}</td>
                  <td>{fmt(row.b, row.key)}</td>
                  <td>{fmtDiff(row.diff, row.key)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p class="sub">Differences are absolute, in the game's fictional units. Diversity index: Shannon H = −Σ p ln p over living counts (0 when one kind is left; higher with more kinds in more even numbers).</p>

      {perSpecies.length > 0 ? (
        <details class="compare-details">
          <summary>By kind of organism</summary>
          <div class="compare-table-wrap">
            <table class="compare-table">
              <caption>Living organisms and biomass by kind</caption>
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  <th scope="col">A</th>
                  <th scope="col">B</th>
                  <th scope="col">B − A</th>
                </tr>
              </thead>
              <tbody>
                {perSpecies.map((row) => (
                  <tr key={`${row.key}:${row.species ?? ''}`}>
                    <th scope="row">{rowLabel(row, info)}</th>
                    <td>{fmt(row.a, row.key)}</td>
                    <td>{fmt(row.b, row.key)}</td>
                    <td>{fmtDiff(row.diff, row.key)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}

      <DeathsByCause r={r} />
      <Traits r={r} info={info} />
      <Modules r={r} info={info} />
      <Capacity r={r} />

      <fieldset class="compare-conclusion">
        <legend>Does this paired run support your prediction?</legend>
        <div class="segmented compare-conclusions" role="radiogroup" aria-label="Conclusion">
          {CONCLUSIONS.map((o) => (
            <button
              key={o.id}
              class="btn"
              role="radio"
              aria-checked={compareConclusion.value === o.id}
              onClick={() => {
                compareConclusion.value = o.id;
                compareCardSaved.value = false;
              }}
              data-testid={`compare-conclusion-${o.id}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label class="compare-note-label" for="compare-conclusion-note">
          Note (optional)
        </label>
        <textarea
          id="compare-conclusion-note"
          class="compare-note"
          rows={2}
          maxLength={280}
          value={compareNote.value}
          onInput={(e) => {
            compareNote.value = e.currentTarget.value;
            compareCardSaved.value = false;
          }}
        />
      </fieldset>

      <div class="compare-final-actions">
        <button class="btn" disabled={compareCardSaved.value} onClick={() => saveCompareCard(change)} data-testid="compare-save-card">
          {compareCardSaved.value ? 'Result card saved' : 'Save result card'}
        </button>
        <button class="btn primary" onClick={() => void closeCompare()} data-testid="compare-done">
          Done — back to my dish
        </button>
      </div>
      <p class="sub">Done discards the two copies. Your dish is exactly as you left it.</p>
    </div>
  );
}

function DeathsByCause({ r }: { r: ComparisonResults }) {
  const codes: number[] = [];
  for (const d of [...r.a.deathsByCause, ...r.b.deathsByCause]) if (!codes.includes(d.cause)) codes.push(d.cause);
  codes.sort((x, y) => x - y);
  const n = (arm: ArmMeasures, code: number) => arm.deathsByCause.find((d) => d.cause === code)?.count ?? 0;
  const unattributed = r.a.deathsUnattributed + r.b.deathsUnattributed > 0;
  return (
    <details class="compare-details">
      <summary>Deaths by cause</summary>
      {codes.length === 0 && !unattributed ? (
        <p class="sub">No deaths were recorded in either copy.</p>
      ) : (
        <div class="compare-table-wrap">
          <table class="compare-table">
            <caption>Deaths during this paired run, by recorded cause</caption>
            <thead>
              <tr>
                <th scope="col">Cause</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
                <th scope="col">B − A</th>
              </tr>
            </thead>
            <tbody>
              {codes.map((code) => (
                <tr key={code}>
                  <th scope="row">{causeLabel(code)}</th>
                  <td>{n(r.a, code)}</td>
                  <td>{n(r.b, code)}</td>
                  <td>{fmtDiff(n(r.b, code) - n(r.a, code), 'deaths')}</td>
                </tr>
              ))}
              {unattributed ? (
                <tr>
                  <th scope="row">Details not kept</th>
                  <td>{r.a.deathsUnattributed}</td>
                  <td>{r.b.deathsUnattributed}</td>
                  <td>{fmtDiff(r.b.deathsUnattributed - r.a.deathsUnattributed, 'deaths')}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

function Traits({ r, info }: { r: ComparisonResults; info: DishInfo }) {
  const keys: string[] = [];
  for (const t of [...r.a.traits, ...r.b.traits]) {
    const k = `${t.species}:${t.locus}`;
    if (!keys.includes(k)) keys.push(k);
  }
  const find = (arm: ArmMeasures, k: string) => arm.traits.find((t) => `${t.species}:${t.locus}` === k);
  const cell = (arm: ArmMeasures, k: string) => {
    const t = find(arm, k);
    return t ? `${fmt(t.median, 'speciesBiomass')} (${t.min}–${t.max}, n ${t.n})` : '—';
  };
  return (
    <details class="compare-details">
      <summary>Inherited traits (median and range)</summary>
      {keys.length === 0 ? (
        <p class="sub">No living organisms to measure.</p>
      ) : (
        <div class="compare-table-wrap">
          <table class="compare-table">
            <caption>Trait values of living organisms: median (lowest–highest, how many)</caption>
            <thead>
              <tr>
                <th scope="col">Kind · trait</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const t = find(r.a, k) ?? find(r.b, k)!;
                return (
                  <tr key={k}>
                    <th scope="row">
                      {info.speciesNames[t.species] ?? '?'} · {t.locusName}
                    </th>
                    <td>{cell(r.a, k)}</td>
                    <td>{cell(r.b, k)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

function Modules({ r, info }: { r: ComparisonResults; info: DishInfo }) {
  const keys: string[] = [];
  for (const m of [...r.a.modules, ...r.b.modules]) {
    const k = `${m.species}:${m.moduleId}`;
    if (!keys.includes(k)) keys.push(k);
  }
  const cell = (arm: ArmMeasures, k: string) => {
    const m = arm.modules.find((x) => `${x.species}:${x.moduleId}` === k);
    return m ? `${m.count} (${Math.round(m.share * 100)} %)` : '0';
  };
  return (
    <details class="compare-details">
      <summary>Ability modules</summary>
      {keys.length === 0 ? (
        <p class="sub">No living organism in either copy carries a supplementary module.</p>
      ) : (
        <div class="compare-table-wrap">
          <table class="compare-table">
            <caption>Living organisms carrying each module (share of their kind)</caption>
            <thead>
              <tr>
                <th scope="col">Kind · module</th>
                <th scope="col">A</th>
                <th scope="col">B</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => {
                const [sp, id] = k.split(':');
                const name = [...r.a.modules, ...r.b.modules].find((m) => `${m.species}:${m.moduleId}` === k)?.name ?? id;
                return (
                  <tr key={k}>
                    <th scope="row">
                      {info.speciesNames[Number(sp)] ?? '?'} · {name}
                    </th>
                    <td>{cell(r.a, k)}</td>
                    <td>{cell(r.b, k)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

function Capacity({ r }: { r: ComparisonResults }) {
  const list = (arm: ArmMeasures) =>
    arm.capacityIntervals.length === 0 ? 'never' : arm.capacityIntervals.map(([f, t]) => `${clock(f - r.baselineTick)}–${clock(t + 1 - r.baselineTick)}`).join(', ');
  return (
    <details class="compare-details">
      <summary>When the dish was full</summary>
      <p class="sub">The game's organism limit (a limit of the game, not the ecosystem) blocked births or placements during these stretches of the run.</p>
      <dl class="kv">
        <dt>A</dt>
        <dd>{list(r.a)}</dd>
        <dt>B</dt>
        <dd>{list(r.b)}</dd>
      </dl>
    </details>
  );
}
