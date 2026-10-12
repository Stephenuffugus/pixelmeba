/**
 * Bookmark this moment (P4.8b; SPEC §12.8; CT §12.10 "bookmarks 50 text / 20 snapshot"). Opened from More and
 * the Lab's Observe tray; the dish is paused while it is open (src/ui/bookmarks.ts restores the prior speed).
 * Title prefilled "{dish name} at {m:ss}"; "Include a snapshot" is off by default (a snapshot uses storage).
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import { IconClose } from '../icons';
import { dishInfo, meta, showToast } from '../state';
import { bookmarkClock, BOOKMARK_TITLE_MAX } from '@persist/notebookBookmarks';
import { addBookmarkNow, closeBookmarkSheet, defaultBookmarkTitle } from '../bookmarks';
import { BOOKMARK_UI } from '../strings/notebookTools';

export function BookmarkSheet() {
  const info = dishInfo.value;
  const tick = meta.value?.tick ?? info?.tick ?? 0;
  const [title, setTitle] = useState(() => defaultBookmarkTitle(info?.name ?? 'Dish', tick));
  const [snapshot, setSnapshot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  if (!info) return null;
  const save = async () => {
    setBusy(true);
    setRefusal(null);
    const r = await addBookmarkNow(title, snapshot);
    setBusy(false);
    if (r !== null) {
      setRefusal(r);
      return;
    }
    showToast(BOOKMARK_UI.saved(snapshot), 3500);
    closeBookmarkSheet();
  };
  return (
    <section class="sheet" aria-labelledby="bookmark-title-h" data-testid="bookmark-sheet">
      <div class="sheet-scroll">
        <header>
          <h2 id="bookmark-title-h">{BOOKMARK_UI.sheetTitle}</h2>
          <button class="btn ghost" aria-label="Close" onClick={closeBookmarkSheet}>
            <IconClose />
          </button>
        </header>
        <p>{BOOKMARK_UI.sheetLead(bookmarkClock(tick))}</p>
        <label class="field">
          {BOOKMARK_UI.titleLabel}
          <input
            ref={field}
            type="text"
            maxLength={BOOKMARK_TITLE_MAX}
            value={title}
            onInput={(e) => setTitle(e.currentTarget.value)}
            data-testid="bookmark-title"
          />
        </label>
        <label class="fav-share-option">
          <input type="checkbox" checked={snapshot} onChange={(e) => setSnapshot(e.currentTarget.checked)} data-testid="bookmark-snapshot" />
          <span>{BOOKMARK_UI.includeSnapshot}</span>
        </label>
        {!snapshot ? <p class="sub">{BOOKMARK_UI.snapshotHelp}</p> : null}
        {refusal ? (
          <p class="constraint" role="status" data-testid="bookmark-refusal">
            {refusal}
          </p>
        ) : null}
        <div class="nb-actions">
          <button class="btn primary" disabled={busy} onClick={() => void save()} data-testid="bookmark-save">
            {busy ? BOOKMARK_UI.saving : BOOKMARK_UI.save}
          </button>
          <button class="btn" onClick={closeBookmarkSheet} data-testid="bookmark-cancel">
            {BOOKMARK_UI.cancel}
          </button>
        </div>
      </div>
    </section>
  );
}
