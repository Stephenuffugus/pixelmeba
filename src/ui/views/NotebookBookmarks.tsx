/**
 * Notebook → Bookmarks (P4.8b; UX §2; SPEC §12.8): the open dish's bookmarks, newest first. A text-only
 * bookmark always says "Text only — not replayable"; a snapshot bookmark whose stored moment is still on this
 * device can be opened as a new branch (the open dish is kept first, D-0033); one whose snapshot was removed or
 * fails its checks is shown as text only, and says so. Bookmarks are kept with each dish (D-0070).
 */
import { useEffect, useState } from 'preact/hooks';
import { dishInfo } from '../state';
import { notebook, notebookDroppedFor } from '../favorites';
import { bookmarkClock, bookmarksOf } from '@persist/notebookBookmarks';
import { deleteBookmark, openSnapshotBookmark, refreshStoredSnapshots, snapshotState, storedSnapshots } from '../bookmarks';
import { BOOKMARK_UI, sizeText } from '../strings/notebookTools';

export function NotebookBookmarks() {
  const info = dishInfo.value;
  const nb = notebook.value;
  const [message, setMessage] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void refreshStoredSnapshots();
  }, [info?.dishId]);
  if (!info) return <p class="nb-empty">{BOOKMARK_UI.noDish}</p>;
  if (!nb) return <p class="nb-empty">{BOOKMARK_UI.reading}</p>;
  const dropped = notebookDroppedFor.value?.dishId === info.dishId ? notebookDroppedFor.value.message : null;
  const list = [...bookmarksOf(nb)].reverse();
  const stored = storedSnapshots.value;
  return (
    <>
      {dropped ? <p class="constraint">{dropped}</p> : null}
      {list.length === 0 ? (
        <p class="nb-empty">{BOOKMARK_UI.none}</p>
      ) : (
        <p class="nb-intro">{BOOKMARK_UI.intro(info.name)}</p>
      )}
      {message ? (
        <p class="constraint" role="status" data-testid="bookmarks-message">
          {message}
        </p>
      ) : null}
      <ul class="nb-cards" aria-label="Bookmarks" data-testid="bookmarks-list">
        {list.map((b) => {
          const state = snapshotState(b, stored);
          return (
            <li key={b.id} data-testid="bookmark-row" data-bookmark={b.id}>
              <article class="card nb-card" aria-labelledby={`bm-${b.id}`}>
                <h2 id={`bm-${b.id}`}>{b.title}</h2>
                <p class="sub">{BOOKMARK_UI.at(bookmarkClock(b.tick))}</p>
                <p data-testid="bookmark-summary">{b.summary}</p>
                {state === 'stored' ? (
                  <p class="sub" data-testid="bookmark-snapshot">
                    {BOOKMARK_UI.snapshotKept} ({sizeText(b.snapshot!.bytes)})
                  </p>
                ) : state === null ? null : (
                  <>
                    <p class="bookmark-text-only" data-testid="bookmark-text-only">
                      {BOOKMARK_UI.textOnly}
                    </p>
                    {state === 'gone' ? <p class="sub">{BOOKMARK_UI.snapshotGone}</p> : null}
                  </>
                )}
                <div class="nb-actions">
                  {state === 'stored' ? (
                    <button
                      class="btn primary"
                      disabled={busy}
                      data-testid="bookmark-open"
                      onClick={() => {
                        setBusy(true);
                        setMessage(null);
                        void openSnapshotBookmark(b.id, b.title)
                          .then((m) => setMessage(m))
                          .finally(() => setBusy(false));
                      }}
                    >
                      {BOOKMARK_UI.open}
                    </button>
                  ) : null}
                  {confirm === b.id ? (
                    <>
                      <p class="sub" id={`bm-del-${b.id}`}>
                        {BOOKMARK_UI.deleteQuestion(b.snapshot !== null && state === 'stored')}
                      </p>
                      <button
                        class="btn"
                        style={{ color: 'var(--danger)' }}
                        aria-describedby={`bm-del-${b.id}`}
                        data-testid="bookmark-delete-confirm"
                        onClick={() => {
                          setConfirm(null);
                          void deleteBookmark(b.id).then((m) => setMessage(m ?? BOOKMARK_UI.deleted));
                        }}
                      >
                        {BOOKMARK_UI.deleteConfirm}
                      </button>
                      <button class="btn" data-testid="bookmark-keep" onClick={() => setConfirm(null)}>
                        {BOOKMARK_UI.keep}
                      </button>
                    </>
                  ) : (
                    <button class="btn" aria-label={`Delete bookmark ${b.title}…`} data-testid="bookmark-delete" onClick={() => setConfirm(b.id)}>
                      {BOOKMARK_UI.delete}
                    </button>
                  )}
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </>
  );
}
