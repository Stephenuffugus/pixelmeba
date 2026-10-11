/**
 * Notebook → Something happened (P4.2; UX §2, §5.9): the open dish's story cards, newest first, with a
 * "New" mark on cards not opened yet; opening one shows its panels (StoryCard) and marks it seen.
 * Dismissed cards stay listed in their own group (they are removed first when the dish keeps 50).
 * Story cards are kept with each dish (D-0070), so with no dish open there is nothing to list here.
 */
import { useEffect, useRef } from 'preact/hooks';
import { storiesWereRemoved } from '@persist/notebookStories';
import type { StoryCard as StoryCardRecord } from '@persist/notebookStories';
import { dishInfo } from '../state';
import { notebook, notebookDroppedFor } from '../favorites';
import { StoryCard } from '../panels/StoryCard';
import { dishStories, dismissStory, markStory, openStoryId, spotlightStory, storyNames } from '../stories';
import { STORY_TEXT, storyListLine, storyTitle, type StoryNames } from '../strings/stories';

export function NotebookStories() {
  const info = dishInfo.value;
  const nb = notebook.value;
  const list = dishStories.value;
  const openId = openStoryId.value;
  const backRef = useRef<HTMLButtonElement>(null);
  const open = openId !== null ? (list?.find((c) => c.id === openId) ?? null) : null;
  // A card opened from the list (or from the notice) is seen.
  useEffect(() => {
    if (open && !open.seen) void markStory(open.id, 'seen');
  }, [open?.id]);
  useEffect(() => {
    if (open) backRef.current?.focus();
  }, [open?.id]);
  if (!info) return <p class="nb-empty">{STORY_TEXT.noDish}</p>;
  if (!nb || !list) return <p class="nb-empty">{STORY_TEXT.reading}</p>;
  const names = storyNames();
  const dropped = notebookDroppedFor.value?.dishId === info.dishId ? notebookDroppedFor.value.message : null;
  if (open) {
    return (
      <>
        <button ref={backRef} class="btn ghost story-back" onClick={() => (openStoryId.value = null)} data-testid="story-back">
          {STORY_TEXT.back}
        </button>
        <StoryCard
          card={open}
          names={names}
          onSpotlight={() => spotlightStory(open)}
          onDismiss={open.dismissed ? null : () => dismissStory(open.id)}
        />
      </>
    );
  }
  const live = list.filter((c) => !c.dismissed);
  const gone = list.filter((c) => c.dismissed);
  return (
    <>
      {dropped ? (
        <p class="constraint" data-testid="stories-dropped">
          {dropped}
        </p>
      ) : null}
      <p class="nb-intro">{STORY_TEXT.intro}</p>
      {storiesWereRemoved(nb.stories ?? []) ? (
        <p class="nb-empty" data-testid="stories-removed">
          {STORY_TEXT.removed}
        </p>
      ) : null}
      {live.length === 0 && gone.length === 0 ? (
        <p class="nb-empty" data-testid="stories-empty">
          {STORY_TEXT.empty}
        </p>
      ) : null}
      {live.length > 0 ? <StoryList cards={live} names={names} label={`Story cards of “${info.name}”`} /> : null}
      {gone.length > 0 ? (
        <details class="xp-details story-dismissed">
          <summary>
            {STORY_TEXT.dismissedTitle} ({gone.length})
          </summary>
          <StoryList cards={gone} names={names} label={STORY_TEXT.dismissedTitle} />
        </details>
      ) : null}
    </>
  );
}

function StoryList({ cards, names, label }: { cards: readonly StoryCardRecord[]; names: StoryNames; label: string }) {
  return (
    <ul class="nb-cards story-list" aria-label={label} data-testid="stories-list">
      {cards.map((c) => (
        <li key={c.id}>
          <article class="card nb-card story-item" aria-labelledby={`story-item-${c.id}`}>
            <h2 id={`story-item-${c.id}`}>
              {storyTitle(c)}
              {!c.seen && !c.dismissed ? <span class="nb-dot story-new">{STORY_TEXT.unseen}</span> : null}
            </h2>
            <p class="sub">{storyListLine(c, names)}</p>
            <button
              class="btn nb-open"
              onClick={() => (openStoryId.value = c.id)}
              aria-label={`${STORY_TEXT.open}: ${storyTitle(c)}, ${storyListLine(c, names)}`}
              data-testid={`story-open-${c.template}`}
            >
              {STORY_TEXT.open}
            </button>
          </article>
        </li>
      ))}
    </ul>
  );
}
