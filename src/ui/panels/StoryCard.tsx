/**
 * One story card (P4.2; UX §5.9, SPEC §12.7): at most three panels (earlier state or action · recorded
 * event · later observation), each captioned with dish time; the "Memory, not replay" badge (no card
 * holds a snapshot yet); Spotlight, Save picture (P4.6: the Share sheet on Picture) and Dismiss.
 * Everything shown comes from the card's stored summary (src/ui/strings/stories.ts); nothing here sends
 * a command or reads the world.
 */
import type { StoryCard as StoryCardRecord } from '@persist/notebookStories';
import { STORY_TEXT, storyPanels, storyTitle, type StoryNames } from '../strings/stories';
import { openShareFromStory } from '../share';

export function StoryCard({
  card,
  names,
  onSpotlight,
  onDismiss,
}: {
  readonly card: StoryCardRecord;
  readonly names: StoryNames;
  readonly onSpotlight: () => void;
  readonly onDismiss: (() => void) | null;
}) {
  const panels = storyPanels(card, names).slice(0, 3);
  const titleId = `story-title-${card.id}`;
  return (
    <article class="card story-card" aria-labelledby={titleId} data-testid="story-card">
      <h2 id={titleId}>{storyTitle(card)}</h2>
      <p class="xp-badges">
        <span class="xp-badge story-badge" data-testid="story-badge">
          {STORY_TEXT.badge}
        </span>
      </p>
      <ol class="story-panels" aria-label="What was recorded, in order">
        {panels.map((p, i) => (
          <li key={i} class="story-panel" data-testid="story-panel">
            <p class="story-time">
              <span class="sr-only">Dish time </span>
              {p.time}
            </p>
            <p class="story-caption">{p.caption}</p>
            {p.details.map((d, k) => (
              <p key={k} class="story-detail">
                {d}
              </p>
            ))}
          </li>
        ))}
      </ol>
      <p class="story-note">{STORY_TEXT.memoryNote}</p>
      <p class="story-note">{STORY_TEXT.spotlightHint}</p>
      <div class="story-actions">
        <button class="btn primary" onClick={onSpotlight} data-testid="story-spotlight">
          {STORY_TEXT.spotlight}
        </button>
        {/* P4.6 (UX §5.9): the dish NOW as a picture, the card's title as its question, labelled with its own dish time. */}
        <button class="btn" onClick={() => openShareFromStory(storyTitle(card))} data-testid="story-save-picture">
          Save picture
        </button>
        {onDismiss ? (
          <button class="btn" onClick={onDismiss} data-testid="story-dismiss">
            {STORY_TEXT.dismiss}
          </button>
        ) : null}
      </div>
    </article>
  );
}
