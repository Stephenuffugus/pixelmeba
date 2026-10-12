import { useEffect, useState } from 'preact/hooks';
import type { RecipeDef } from '@sim/content/schema';
import { IconBack, IconPlay } from '../icons';
import { busy, newDishPreview, route, startRecipe } from '../state';
import { GARDEN_RECIPE } from '../prompts';
import { DishThumb } from './DishThumb';
import { WhatIfHost } from '../panels/WhatIfSheet';
import { openWhatIf } from '../panels/WhatIfState';
import { WHATIF_TEXT } from '../strings/whatif';
import { GoalChoice } from '../panels/GoalChoice';
import { playGoalChoice } from '../goals';
import { RecipeIdImport } from '../panels/RecipeIdImport';
import { DEMO_MODE } from '@platform/web'; // P4.11

/**
 * The Garden's own seed, read from the same content record the worker validates (as New Dish reads its
 * curated dishes); the worker builds the preview from its own validated copy.
 */
const GARDEN_SEED: number | null = (() => {
  const glob = import.meta.glob<RecipeDef>('../../../content/recipes/FIRST_DISH_V1.json', { eager: true, import: 'default' });
  return Object.values(glob)[0]?.seed ?? null;
})();

export function Play() {
  // P4.3 (UX §2.2 "Square live-state thumbnails"): the Garden card shows the start its Start button makes,
  // built by the worker (read-only, then discarded); nothing painted is presented as the dish.
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (GARDEN_SEED === null) return;
    let live = true;
    void newDishPreview(GARDEN_RECIPE, GARDEN_SEED, {})
      .then((p) => live && setThumb(p.thumb ?? null))
      .catch(() => live && setThumb(null));
    return () => {
      live = false;
    };
  }, []);
  return (
    <main class="page" aria-labelledby="play-title">
      <div class="home-grid">
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button class="btn ghost" style={{ color: 'inherit' }} onClick={() => (route.value = { name: 'home' })} aria-label="Back">
            <IconBack />
          </button>
          <h1 id="play-title" style={{ fontSize: '1.5rem' }}>
            Play
          </h1>
        </header>
        <section class="card" aria-labelledby="garden-title">
          <div class="card-row">
            {thumb ? <DishThumb thumb={thumb} name="Little Living Garden" testId="garden-thumb" /> : <div class="card-thumb" aria-hidden="true" />}
            <div>
              <h2 id="garden-title">Little Living Garden</h2>
              <p>Who finds something to eat?</p>
              <p>
                Preloaded: 24 Sprinters, 12 Crumbsmiths, 8 Recyclers and 12 Sunbeads, a sugar patch, a starch patch and some debris. Nothing
                else will appear unless you add it.
              </p>
            </div>
          </div>
          <button class="btn primary" disabled={busy.value} onClick={() => void startRecipe('FIRST_DISH_V1', 'Little Living Garden', playGoalChoice.value)} data-testid="start-garden">
            <IconPlay /> Start
          </button>
          {/* P4.4 (SPEC §13.5): an optional goal, off by default ("No goal" checked); Start starts it at tick 0. */}
          {/* P4.11 DEMO_MODE: the shelf holds the Garden and its What if? link only (no goals). */}
          {DEMO_MODE ? null : <GoalChoice recipeId="FIRST_DISH_V1" />}
          {/* UX §2.2: a secondary What if? link under Garden opens the sheet (§3.4). */}
          <p class="whatif-link-row">
            <button class="btn whatif-link" onClick={() => openWhatIf('play')} data-testid="whatif-open">
              {WHATIF_TEXT.link}
            </button>
            <span>{WHATIF_TEXT.linkHint}</span>
          </p>
        </section>
        {/* P4.6 (UX §2; D09 "an Import recipe ID entry under Play"): a bundled recipe by its offline ID. */}
        {DEMO_MODE ? null : <RecipeIdImport idPrefix="play" />}
      </div>
      <WhatIfHost context="play" />
    </main>
  );
}
