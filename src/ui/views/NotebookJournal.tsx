/**
 * Notebook → Journal, observed relationships (P2.8; UX §1; SPEC §12.5, §12.9). The player records
 * "I saw X coincide with Y" with the dish and its time, optionally linked to an experiment stamp or a
 * saved comparison result card. The Journal words every note as "coincided with": what happened
 * together, never a cause. A note about the open dish is also kept with that dish's saves.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'preact/hooks';
import {
  addObservation,
  journal,
  journalRemovedText,
  observationSentence,
  OBSERVATION_MAX,
  type JournalLink,
  type JournalObservationEntry,
  type JournalStampEntry,
} from '../journal';
import { dishInfo, loadCompareCards, meta, showToast } from '../state';
import { recordedText } from '../strings/experiments';
import { clockText } from '../panels/TraitData';

/** Offered links, newest first: journal stamps, then saved comparison result cards. */
function linkChoices(): { readonly key: string; readonly label: string; readonly link: JournalLink }[] {
  const stamps = journal.value
    .filter((e): e is JournalStampEntry => e.kind === 'experimentStamp')
    .slice(0, 20)
    .map((e) => ({
      key: `stamp:${e.id}`,
      label: `Experiment stamp: ${e.journalStamp} (${e.title})`,
      link: { kind: 'stamp', id: e.id, title: e.title, journalStamp: e.journalStamp } as const,
    }));
  const cards = loadCompareCards()
    .slice(0, 20)
    .filter((c) => typeof c.savedAt === 'string' && typeof c.change === 'string')
    .map((c) => ({
      key: `compare:${c.savedAt}`,
      label: `Comparison result: ${c.change} (${c.dishName}, ${recordedText(c.savedAt)})`,
      link: {
        kind: 'compare',
        savedAt: c.savedAt,
        change: c.change,
        dishName: c.dishName,
        label: c.label,
      } as const,
    }));
  return [...stamps, ...cards];
}

/** "I saw … coincide with …" form. `onDone` runs after an entry was added or the form was cancelled. */
export function JournalComposer({
  onDone,
  testId = 'journal-compose',
  headingLevel = 2,
}: {
  onDone?: (added: boolean) => void;
  testId?: string;
  /** 2 on the Notebook page; 3 inside a sheet that has its own h2 (History). */
  headingLevel?: 2 | 3;
}) {
  const uid = useId();
  const info = dishInfo.value;
  const tick = meta.value?.tick ?? info?.tick ?? 0;
  const [saw, setSaw] = useState('');
  const [withWhat, setWithWhat] = useState('');
  const [aboutDish, setAboutDish] = useState(info !== null);
  const [linkKey, setLinkKey] = useState('none');
  const [error, setError] = useState<string | null>(null);
  const choices = useMemo(linkChoices, [journal.value]);
  // Opening the form moves focus into it, so its name and first field are announced (focus returns to
  // the opening button when it closes; the parent does that).
  const sawRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    sawRef.current?.focus();
  }, []);

  const submit = (e: Event) => {
    e.preventDefault();
    const link = choices.find((c) => c.key === linkKey)?.link ?? null;
    const r = addObservation({
      saw,
      coincidedWith: withWhat,
      dish:
        aboutDish && info
          ? {
              worldId: info.worldId,
              name: info.name,
              second: Math.floor(tick / 10),
              recipeId: info.recipeId,
              seed: info.seed,
            }
          : null,
      link,
    });
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setError(null);
    setSaw('');
    setWithWhat('');
    setLinkKey('none');
    // A full Notebook: the note took the place of an older entry, and the player is told which (fix round 2).
    const removed = r.removed ? ` ${journalRemovedText(r.removed)}` : '';
    showToast(
      r.stored
        ? `Added to your Journal.${removed}`
        : `Added to your Journal for this session (this device did not store it).${removed}`,
      r.removed ? 9000 : 3500,
    );
    onDone?.(true);
  };

  return (
    <form class="card nb-compose" onSubmit={submit} aria-labelledby={`${uid}-title`} data-testid={testId}>
      {headingLevel === 3 ? (
        <h3 id={`${uid}-title`}>Record what you saw</h3>
      ) : (
        <h2 id={`${uid}-title`}>Record what you saw</h2>
      )}
      <p class="nb-compose-intro">
        Two things you noticed at the same time. The Journal keeps them as “coincided with”: a note of what
        happened together, not a claim that one caused the other.
      </p>
      <label class="nb-field">
        <span>I saw…</span>
        <input
          ref={sawRef}
          type="text"
          value={saw}
          maxLength={OBSERVATION_MAX}
          placeholder="the Sprinters crowding the top left"
          onInput={(e) => setSaw(e.currentTarget.value)}
          data-testid="journal-saw"
        />
      </label>
      <label class="nb-field">
        <span>…coincide with…</span>
        <input
          type="text"
          value={withWhat}
          maxLength={OBSERVATION_MAX}
          placeholder="the sugar patch getting smaller"
          onInput={(e) => setWithWhat(e.currentTarget.value)}
          data-testid="journal-with"
        />
      </label>
      {info ? (
        <label class="nb-check">
          <input
            type="checkbox"
            checked={aboutDish}
            onChange={(e) => setAboutDish(e.currentTarget.checked)}
            data-testid="journal-about-dish"
          />
          <span>
            About “{info.name}” at {clockText(Math.floor(tick / 10))} dish time (kept with this dish when it
            is saved)
          </span>
        </label>
      ) : (
        <p class="nb-compose-intro">No dish is open, so this note is not tied to a dish.</p>
      )}
      <label class="nb-field">
        <span>Link (optional)</span>
        <select
          value={linkKey}
          onChange={(e) => setLinkKey(e.currentTarget.value)}
          data-testid="journal-link"
        >
          <option value="none">No link</option>
          {choices.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p class="nb-compose-error" role="alert">
          {error}
        </p>
      ) : null}
      <div class="nb-compose-actions">
        <button type="submit" class="btn primary" data-testid="journal-add">
          Add to Journal
        </button>
        {onDone ? (
          <button type="button" class="btn" onClick={() => onDone(false)}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

function linkText(l: JournalLink): string {
  return l.kind === 'stamp'
    ? `Linked to the experiment stamp “${l.journalStamp}” (${l.title}).`
    : `Linked to the comparison result “${l.change}” (${l.dishName}, ${l.label}).`;
}

/** One observed relationship as the Journal lists it. */
export function ObservationCard({ entry: e }: { entry: JournalObservationEntry }) {
  const uid = useId();
  return (
    <article class="card nb-note" aria-labelledby={`${uid}-h`} data-testid="journal-observation">
      <p class="nb-note-mark" aria-hidden="true">
        ≈
      </p>
      <h2 id={`${uid}-h`}>{observationSentence(e)}</h2>
      <p class="nb-stamp-meta">
        {e.dish ? `${e.dish.name} at ${clockText(e.dish.second)} dish time` : 'Not tied to a dish'} · recorded{' '}
        {recordedText(e.recordedAt)}
      </p>
      {e.link ? <p>{linkText(e.link)}</p> : null}
      <p class="nb-note-honest">
        Coincided with: seen together. This note does not say that one caused the other.
      </p>
    </article>
  );
}
