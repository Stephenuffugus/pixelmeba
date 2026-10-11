/**
 * The Family sheet of a favorite (sheet 'favorite'; UX §5.8, SPEC §12.6): its name, species and root,
 * living members, generation depth and confirmed inherited differences, with Find, Follow next, Rename,
 * Change marker and Unpin. Inherited differences come from the worker's read-only answers (the
 * representative's inspector payload and the lineage answer) and keep founder traits, its own inherited
 * change and established branches distinct, as the inspector and the Lineage sheet do. Never "better".
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { EntityInspect } from '@worker/protocol';
import type { LineageAnswer } from '@sim/lineage';
import { FAVORITE_PATTERNS, NICKNAME_MAX } from '@persist/notebook';
import { IconClose } from '../icons';
import { dishInfo, getClient, sheet } from '../state';
import {
  favoriteById,
  favoriteOp,
  favoriteSheetId,
  favoriteSlots,
  findFavorite,
  findFavoriteAfterChange,
  nameOf,
  speciesNameOf,
} from '../favorites';
import {
  candidateText,
  depthText,
  FAVORITE_TEXT,
  favoriteStateText,
  followNextText,
  fromRootText,
  membersText,
  OTHER_CANDIDATES_TEXT,
  PATTERN_NAMES,
  UNPINNED_MEMBERS_TEXT,
} from '../strings/favorites';
import { inheritedLead } from '../strings/inherited';
import { founderStartText } from '../strings/modes';
import { formatSimTime, stateLabel, traitSentence } from '../strings/lineage';
import { FavoriteGlyph } from './FavoriteSlots';

export function FavoriteSheet() {
  const f = favoriteById(favoriteSheetId.value);
  const slot = favoriteSlots.value.find((s) => s.id === f?.id) ?? null;
  const info = dishInfo.value;
  const [inspected, setInspected] = useState<EntityInspect | null | undefined>(undefined);
  const [lineage, setLineage] = useState<LineageAnswer | null>(null);
  const [editing, setEditing] = useState<'none' | 'rename' | 'pattern'>('none');
  const [nick, setNick] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const rep = f?.representative ?? null;
  const repAlive = slot?.representativeEntity !== null && slot?.representativeEntity !== undefined;
  // Read-only answers about the representative (its inspector payload; its branch).
  useEffect(() => {
    setInspected(undefined);
    setLineage(null);
    if (!info || rep === null || !repAlive) return;
    let live = true;
    void getClient()
      .notebookGet(info.dishId, rep)
      .then((r) => live && setInspected(r.inspected ?? null))
      .catch(() => live && setInspected(null));
    void getClient()
      .lineage(info.dishId, null, rep)
      .then((l) => live && setLineage(l))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [info?.dishId, rep, repAlive]);
  useEffect(() => titleRef.current?.focus({ preventScroll: true }), [f?.id]);
  if (!f || !info) return null;
  const name = nameOf(f);
  const species = speciesNameOf(f.speciesId);
  const close = () => (sheet.value = 'none');
  const members = slot?.members ?? f.members.length;
  const next = slot?.next ?? null;
  const branchRow =
    lineage && lineage.focusBranch !== null && lineage.focusBranch >= 0
      ? (lineage.branches[lineage.focusBranch] ?? null)
      : null;
  const act = async (op: Parameters<typeof favoriteOp>[0]) => {
    const refused = await favoriteOp(op);
    setRefusal(refused);
    return refused;
  };
  // Follow next: the new representative is selected and centred from the snapshot sent after the change.
  const followNext = (birthId: number) =>
    void act({ kind: 'representative', id: f.id, birthId }).then((refused) => {
      if (refused === null) findFavoriteAfterChange(f.id);
    });
  const others = (slot?.candidates ?? []).slice(1);
  return (
    <section class="sheet fav-sheet" aria-labelledby="fav-sheet-title" data-testid="favorite-sheet">
      <div class="sheet-scroll">
        <header>
          <h2 id="fav-sheet-title" tabIndex={-1} ref={titleRef}>
            <FavoriteGlyph pattern={f.pattern} /> {name}
          </h2>
          <button class="btn ghost" aria-label="Close" onClick={close}>
            <IconClose />
          </button>
        </header>
        <p class="sub">
          {species} · {fromRootText(species, f.rootBirthId)} · {favoriteStateText(f)}
        </p>
        <ul class="fav-facts">
          <li data-testid="favorite-members">
            {f.active
              ? `Living members: ${membersText(members)}`
              : f.extinct
                ? `Living members: ${membersText(0)}`
                : UNPINNED_MEMBERS_TEXT}
          </li>
          {f.active ? <li>{depthText(slot?.depth ?? null)}</li> : null}
          {f.historyIncomplete ? (
            <li>Older records of this family were summarized, so it may be larger than shown.</li>
          ) : null}
        </ul>
        {f.active && !repAlive && next ? (
          <div class="answer" role="status">
            <p>{FAVORITE_TEXT.representativeGone}</p>
            <button
              class="btn primary"
              data-testid="favorite-follow-next"
              onClick={() => followNext(next[0])}
            >
              {followNextText(info.speciesNames[next[2]] ?? species, next[0], next[1])}
            </button>
            {others.length > 0 ? (
              <>
                <p class="sub">{OTHER_CANDIDATES_TEXT}</p>
                <ul class="fav-candidates" data-testid="favorite-candidates">
                  {others.map(([b, t, sp]) => (
                    <li key={b}>
                      <button class="btn" onClick={() => followNext(b)}>
                        {candidateText(info.speciesNames[sp] ?? species, b, t)}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
        {f.active && repAlive ? (
          <section aria-labelledby="fav-inherited-title" class="fav-inherited">
            <h3 id="fav-inherited-title">{FAVORITE_TEXT.inheritedTitle}</h3>
            <p class="sub">
              Of {species} #{rep}, the organism you follow.
            </p>
            {inspected === undefined ? <p class="sub">{FAVORITE_TEXT.inheritedLoading}</p> : null}
            {inspected ? (
              <dl class="fav-inherited-list">
                <dt>Founder</dt>
                <dd>
                  {inspected.founderOrigin && founderStartText(inspected.founderOrigin)
                    ? founderStartText(inspected.founderOrigin)
                    : 'Its line began from the species’ own starting traits.'}
                </dd>
                <dt>Its own inheritance</dt>
                <dd>{inheritedLead(inspected)}</dd>
                <dt>Branch</dt>
                <dd>
                  {branchRow
                    ? `“${branchRow.name}”: ${stateLabel(branchRow).toLowerCase()} at ${formatSimTime(branchRow.establishedTick)}. ${traitSentence(branchRow, lineage!.loci)}`
                    : 'No established branch is recorded for it.'}
                </dd>
              </dl>
            ) : null}
          </section>
        ) : null}
        {refusal ? (
          <p class="constraint" role="status">
            {refusal}
          </p>
        ) : null}
        {editing === 'rename' ? (
          <form
            class="fav-edit"
            onSubmit={(e) => {
              e.preventDefault();
              void act({
                kind: 'rename',
                id: f.id,
                nickname: nick.trim().length > 0 ? nick.trim() : null,
              }).then(() => setEditing('none'));
            }}
          >
            <label class="fav-field">
              {FAVORITE_TEXT.nicknameLabel}
              <input value={nick} maxLength={NICKNAME_MAX} onInput={(e) => setNick(e.currentTarget.value)} />
            </label>
            <p class="sub fav-note">{FAVORITE_TEXT.nicknameNote}</p>
            <div class="fav-actions">
              <button class="btn primary" type="submit">
                {FAVORITE_TEXT.save}
              </button>
              <button class="btn" type="button" onClick={() => setEditing('none')}>
                {FAVORITE_TEXT.cancel}
              </button>
            </div>
          </form>
        ) : null}
        {editing === 'pattern' ? (
          <fieldset class="fav-patterns">
            <legend>{FAVORITE_TEXT.patternLegend}</legend>
            {FAVORITE_PATTERNS.map((p) => (
              <label key={p} class="fav-pattern">
                <input
                  type="radio"
                  name={`fav-sheet-pattern-${f.id}`}
                  value={p}
                  checked={f.pattern === p}
                  onChange={() => void act({ kind: 'pattern', id: f.id, pattern: p })}
                />
                <FavoriteGlyph pattern={p} />
                <span>{PATTERN_NAMES[p]}</span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <div class="fav-actions fav-sheet-actions">
          {f.active && repAlive ? (
            <button class="btn primary" onClick={() => findFavorite(f.id)} data-testid="favorite-find">
              {FAVORITE_TEXT.find}
            </button>
          ) : null}
          <button
            class="btn"
            aria-expanded={editing === 'rename'}
            onClick={() => {
              setNick(f.nickname ?? '');
              setEditing(editing === 'rename' ? 'none' : 'rename');
            }}
          >
            {FAVORITE_TEXT.rename}
          </button>
          <button
            class="btn"
            aria-expanded={editing === 'pattern'}
            onClick={() => setEditing(editing === 'pattern' ? 'none' : 'pattern')}
          >
            {FAVORITE_TEXT.pattern}
          </button>
          {f.active ? (
            <button
              class="btn"
              onClick={() => void act({ kind: 'unpin', id: f.id })}
              data-testid="favorite-unpin"
            >
              {FAVORITE_TEXT.unpin}
            </button>
          ) : f.extinct === null ? (
            <button class="btn" onClick={() => void act({ kind: 'pin', id: f.id })}>
              {FAVORITE_TEXT.pinAgain}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
