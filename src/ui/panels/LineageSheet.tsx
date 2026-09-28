/**
 * Family tree panel (UX §5.5, SPEC §8.5): the named-branch tree of each kind of organism (state chips
 * variation observed / established / extinct), then one branch in detail — Follow lineage, Compare
 * ancestor (side-by-side reference values), Pin, Rename (ID stays visible), Save specimen — with its
 * founder's recorded family. Also the trait overlay, specimens and the pause-on-discoveries choice.
 * Not a blocking panel: the dish keeps its run state (UX §2). Every value comes from the worker's
 * read-only lineage answer; every change is a 'lineage' command.
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { LineageAnswer, LineageBranchRow, LineageDetail } from '@sim/lineage';
import { SPECIMEN_COUNTS } from '@sim/specimens';
import { IconBack, IconClose, IconFollow, IconSave } from '../icons';
import { getRenderer, showOrganism } from '../state';
import { cellText, costSentence, formatSimTime, LINEAGE_TEXT as T, livingLine, recordLine, stateLabel, traitSentence, variationLine } from '../strings/lineage';
import { PauseOnDiscoveriesToggle } from './DiscoverySetting';
import {
  beginSpecimenPlacement,
  closeLineage,
  followedBranch,
  followLineage,
  lineage,
  lineageBranch,
  lineageSection,
  pinBranch,
  renameBranch,
  saveSpecimen,
  selectBranch,
  setTraitLocus,
  stopFollowing,
  traitLocus,
} from './LineageState';

function depthOf(rows: readonly LineageBranchRow[], row: LineageBranchRow): number {
  let d = 0;
  for (let p = row.parentBranch; p >= 0 && d < 32; p = rows[p]?.parentBranch ?? -1) d++;
  return d;
}

/** Branch rows under one species, parents before their sub-branches. */
function treeOrder(rows: readonly LineageBranchRow[], species: number): LineageBranchRow[] {
  const out: LineageBranchRow[] = [];
  const add = (parent: number, depth: number) => {
    if (depth > 32) return;
    for (const r of rows) {
      if (r.species !== species || r.parentBranch !== parent) continue;
      out.push(r);
      add(r.id, depth + 1);
    }
  };
  add(-1, 0);
  return out;
}

/** The trait overlay picker (also used by the Lab Observe tray). */
export function TraitControl({ ans }: { ans: LineageAnswer }) {
  const locus = traitLocus.value;
  return (
    <div class="lineage-control">
      <label for="trait-locus">{T.traitOverlay}</label>
      <select
        id="trait-locus"
        data-testid="trait-select"
        value={locus === null ? '' : String(locus)}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setTraitLocus(v === '' ? null : Number(v));
        }}
      >
        <option value="">{T.traitOff}</option>
        {ans.loci.map((l) => (
          <option key={l.index} value={String(l.index)}>
            {l.name}
          </option>
        ))}
      </select>
      <p class="lineage-hint">{T.traitHint}</p>
    </div>
  );
}

function Tree({ ans }: { ans: LineageAnswer }) {
  const rows = ans.branches;
  const species = ans.species.filter((s) => s.living > 0 || rows.some((r) => r.species === s.idx) || ans.variation.some((v) => v.species === s.idx));
  return (
    <>
      <p>{T.intro}</p>
      {rows.length === 0 ? <p class="lineage-empty">{T.empty}</p> : null}
      {species.map((s) => {
        const list = treeOrder(rows, s.idx);
        const lineVariation = ans.variation.filter((v) => v.species === s.idx && v.parentBranch < 0);
        return (
          <section key={s.idx} class="lineage-species" aria-label={`${s.name} family tree`}>
            <h3>{s.name}</h3>
            <p>
              Founders’ line: {s.lineLiving} living{s.living !== s.lineLiving ? ` · ${s.living} in all` : ''}
            </p>
            {lineVariation.map((v) => (
              <p key={`v${v.parentBranch}`} class="lineage-variation">
                <span class="lineage-chip variation">Variation observed</span> {variationLine(v)}
              </p>
            ))}
            {list.length > 0 ? (
              <ul class="lineage-tree">
                {list.map((r) => {
                  const sub = ans.variation.filter((v) => v.parentBranch === r.id);
                  return (
                    <li key={r.id} style={{ paddingLeft: `${Math.min(4, depthOf(rows, r)) * 1}rem` }}>
                      <button class="btn lineage-row" data-testid="lineage-branch" data-branch={r.id} onClick={() => void selectBranch(r.id)}>
                        <span class="lineage-row-name">{r.name}</span>
                        <span class="lineage-row-meta">
                          <span class={`lineage-chip ${r.state}`}>{stateLabel(r)}</span>
                          {r.pinned ? <span class="lineage-chip pinned">Pinned</span> : null}
                          <span>{r.state === 'extinct' ? 'none living' : `${r.living} living`}</span>
                        </span>
                      </button>
                      {sub.map((v) => (
                        <p key={`v${v.parentBranch}`} class="lineage-variation">
                          <span class="lineage-chip variation">Variation observed</span> {variationLine(v)}
                        </p>
                      ))}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </>
  );
}

function RenameForm({ row, onDone }: { row: LineageBranchRow; onDone: () => void }) {
  const [name, setName] = useState(row.customName ?? '');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form
      class="lineage-rename"
      onSubmit={(e) => {
        e.preventDefault();
        void renameBranch(row.id, name).then(onDone);
      }}
    >
      <label for="branch-name">{T.renameLabel}</label>
      <div class="lineage-rename-row">
        <input id="branch-name" ref={ref} data-testid="lineage-name-input" value={name} maxLength={60} autoComplete="off" onInput={(e) => setName(e.currentTarget.value)} />
        <span class="lineage-id">· {row.shortId}</span>
      </div>
      <div class="lineage-actions">
        <button class="btn primary" type="submit" data-testid="lineage-rename-save">
          {T.renameSave}
        </button>
        {row.customName ? (
          <button class="btn" type="button" onClick={() => void renameBranch(row.id, null).then(onDone)}>
            {T.renameReset}
          </button>
        ) : null}
        <button class="btn" type="button" onClick={onDone}>
          {T.cancel}
        </button>
      </div>
    </form>
  );
}

function CompareTable({ ans, det }: { ans: LineageAnswer; det: LineageDetail }) {
  const rows = det.compare.filter((r) => r.active);
  const inactive = det.compare.filter((r) => !r.active).map((r) => ans.loci[r.locus]?.name ?? '');
  return (
    <section class="lineage-compare" aria-labelledby="compare-title" data-testid="lineage-compare-table">
      <h4 id="compare-title">{T.compareTitle}</h4>
      <div class="lineage-table-wrap" tabIndex={0} role="region" aria-label="Trait comparison table">
        <table>
          <caption>{det.ancestorLabel} (reference) beside this branch’s founder; “Living now” is the median and range of its living members.</caption>
          <thead>
            <tr>
              <th scope="col">Trait</th>
              <th scope="col">Ancestor</th>
              <th scope="col">This branch</th>
              <th scope="col">Living now</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const d = r.branch - r.ancestor;
              return (
                <tr key={r.locus}>
                  <th scope="row">{ans.loci[r.locus]?.name}</th>
                  <td>{r.ancestor}</td>
                  <td>
                    {r.branch}
                    {d !== 0 ? ` (${d > 0 ? '+' : ''}${d})` : ''}
                  </td>
                  <td>{r.living ? `${r.living.median} (${r.living.min}–${r.living.max})` : '—'}</td>
                </tr>
              );
            })}
            <tr>
              <th scope="row">Abilities</th>
              <td>{det.modules.ancestor.length > 0 ? det.modules.ancestor.join(', ') : 'none'}</td>
              <td>{det.modules.branch.length > 0 ? det.modules.branch.join(', ') : 'none'}</td>
              <td>—</td>
            </tr>
            <tr>
              <th scope="row">Feeding</th>
              <td>{det.policy.ancestor}</td>
              <td>{det.policy.branch}</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>
      </div>
      {inactive.length > 0 ? <p class="lineage-hint">Not active for this kind, so not compared: {inactive.join(', ')}.</p> : null}
      <p class="lineage-hint">
        {T.fictional} {T.notVerdict}
      </p>
    </section>
  );
}

function Detail({ ans, det }: { ans: LineageAnswer; det: LineageDetail }) {
  const row = ans.branches[det.branch]!;
  const [renaming, setRenaming] = useState(false);
  const [comparing, setComparing] = useState(lineageSection.value === 'compare');
  const compareRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!comparing) return;
    compareRef.current?.scrollIntoView({ block: 'nearest' });
  }, [comparing]);
  const following = followedBranch.value === row.id;
  const f = det.family;
  const cost = costSentence(row);
  return (
    <>
      <button class="btn ghost lineage-back" data-testid="lineage-back" onClick={() => void selectBranch(null)}>
        <IconBack /> {T.allBranches}
      </button>
      <h3 class="lineage-title" data-testid="lineage-name">
        {row.name}
      </h3>
      <p class="lineage-chips">
        <span class={`lineage-chip ${row.state}`} data-testid="lineage-state">
          {stateLabel(row)}
        </span>
        {row.pinned ? <span class="lineage-chip pinned">Pinned</span> : null}
        <span class="lineage-chip">ID {row.shortId}</span>
      </p>
      {row.customName ? <p data-testid="lineage-generated">Generated name: {row.generatedName}</p> : null}
      <dl class="lineage-facts">
        <dt>Ancestor</dt>
        <dd>{det.ancestorLabel}</dd>
        <dt>Inherited difference</dt>
        <dd>
          {traitSentence(row, ans.loci)}
          {cost ? ` ${cost}` : ''}
        </dd>
        <dt>First appeared</dt>
        <dd>
          {formatSimTime(row.candidateTick)} (founder #{row.rootBirthId}
          {row.rootCell >= 0 ? `, near ${cellText(row.rootCell)}` : ''})
        </dd>
        <dt>Named</dt>
        <dd>
          {formatSimTime(row.establishedTick)}, with {row.membersAtEstablish} living descendants across {row.depthAtEstablish} generations
        </dd>
        <dt>Now</dt>
        <dd data-testid="lineage-living">{livingLine(row)}</dd>
        {det.depth ? (
          <>
            <dt>Generations</dt>
            <dd>living members are {det.depth.min === det.depth.max ? det.depth.min : `${det.depth.min}–${det.depth.max}`} generations after the founder</dd>
          </>
        ) : null}
      </dl>
      <div class="lineage-actions" role="group" aria-label="Branch actions">
        {following ? (
          <button class="btn" aria-pressed="true" data-testid="lineage-follow" onClick={stopFollowing}>
            <IconFollow /> {T.stopFollow}
          </button>
        ) : (
          <button class="btn" data-testid="lineage-follow" disabled={row.living === 0} onClick={() => void followLineage(row.id)}>
            <IconFollow /> {T.follow}
          </button>
        )}
        <button class="btn" aria-expanded={comparing} data-testid="lineage-compare" onClick={() => setComparing(!comparing)}>
          {comparing ? T.hideCompare : T.compare}
        </button>
        <button class="btn" aria-pressed={row.pinned} data-testid="lineage-pin" onClick={() => void pinBranch(row.id, !row.pinned)}>
          {row.pinned ? T.unpin : T.pin}
        </button>
        <button class="btn" aria-expanded={renaming} data-testid="lineage-rename" onClick={() => setRenaming(!renaming)}>
          {T.rename}
        </button>
        <button class="btn" data-testid="lineage-save-specimen" onClick={() => void saveSpecimen(row.id)}>
          <IconSave /> {T.saveSpecimen}
        </button>
      </div>
      {renaming ? <RenameForm row={row} onDone={() => setRenaming(false)} /> : null}
      <div ref={compareRef}>{comparing ? <CompareTable ans={ans} det={det} /> : null}</div>
      <section class="lineage-family" aria-labelledby="family-title">
        <h4 id="family-title">{T.familyTitle}</h4>
        {f.historyIncomplete ? <p class="lineage-hint">{T.historyCompacted}</p> : null}
        <ul>
          {f.parent ? <li>{recordLine(f.parent, 'Parent', ans.loci)}</li> : null}
          {f.root ? <li>{recordLine(f.root, 'Founder', ans.loci)}</li> : null}
          {f.siblings.map((s) => (
            <li key={s.birthId}>{recordLine(s, 'Sibling', ans.loci)}</li>
          ))}
          {f.children.map((c) => (
            <li key={c.birthId}>{recordLine(c, 'Child', ans.loci)}</li>
          ))}
        </ul>
      </section>
      {det.subBranches.length > 0 ? (
        <section aria-labelledby="sub-title">
          <h4 id="sub-title">Branches descended from it</h4>
          <ul class="lineage-tree">
            {det.subBranches.map((b) => (
              <li key={b}>
                <button class="btn lineage-row" onClick={() => void selectBranch(b)}>
                  <span class="lineage-row-name">{ans.branches[b]?.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {det.members.length > 0 ? (
        <section aria-labelledby="members-title">
          <h4 id="members-title">
            {T.members}: {det.livingTotal}
          </h4>
          <button
            class="btn"
            data-testid="lineage-show-member"
            onClick={() => {
              const m = det.members[0]!;
              const p = getRenderer()?.positionOf(m.entityId) ?? [m.x, m.y];
              closeLineage();
              showOrganism(m.birthId, p[0], p[1]);
            }}
          >
            {T.showMember}
          </button>
        </section>
      ) : null}
    </>
  );
}

function Specimens({ ans }: { ans: LineageAnswer }) {
  const [count, setCount] = useState<number>(1);
  return (
    <section class="lineage-specimens" aria-labelledby="specimens-title">
      <h3 id="specimens-title">{T.specimens}</h3>
      {ans.specimens.length === 0 ? (
        <p>{T.specimensNone}</p>
      ) : (
        <>
          <p class="lineage-hint">{T.specimenNote}</p>
          <div class="lineage-actions" role="group" aria-label={T.specimenCount}>
            {SPECIMEN_COUNTS.map((n) => (
              <button key={n} class="btn" aria-pressed={count === n} onClick={() => setCount(n)}>
                {n}
              </button>
            ))}
          </div>
          <ul class="lineage-specimen-list">
            {ans.specimens.map((s) => (
              <li key={s.id} data-testid="lineage-specimen">
                <p>
                  <strong>{s.label}</strong>
                  <br />
                  Saved at {formatSimTime(s.savedTick)} · {s.generation >= 0 ? `generation ${s.generation}` : 'generation not recorded'} · added {s.spawned} so far
                </p>
                <button class="btn" data-testid="lineage-specimen-add" onClick={() => beginSpecimenPlacement(s.id, count, `Specimen ${s.id}`)}>
                  {T.specimenAdd}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function LineageSheet() {
  const ans = lineage.value;
  const selected = lineageBranch.value;
  const det = ans?.selected && ans.selected.branch === selected ? ans.selected : null;
  return (
    <section class="sheet lineage" aria-labelledby="lineage-title" data-testid="lineage">
      <div class="sheet-scroll">
        <header>
          <h2 id="lineage-title">{T.title}</h2>
          <button class="btn ghost" aria-label={T.close} onClick={closeLineage} data-testid="lineage-close">
            <IconClose />
          </button>
        </header>
        {!ans ? (
          <p>Reading the family tree…</p>
        ) : (
          <>
            <TraitControl ans={ans} />
            {selected !== null && det ? <Detail key={det.branch} ans={ans} det={det} /> : <Tree ans={ans} />}
            {selected === null ? <Specimens ans={ans} /> : null}
            {selected === null ? <PauseOnDiscoveriesToggle /> : null}
          </>
        )}
      </div>
    </section>
  );
}
