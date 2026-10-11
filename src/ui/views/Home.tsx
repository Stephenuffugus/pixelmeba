import { useEffect, useState } from 'preact/hooks';
import type { SlotSummary } from '@worker/protocol';
import { IconGuide, IconLab, IconNotebook, IconPlay, IconSave, IconSettings } from '../icons';
import { continueCardText, dishInfo, getClient, loadSlot, route } from '../state';
import { evolution, meta, openDishThumb, sessionMemory } from '../state';
import { HOME_TEXT } from '../strings/home';
import { DishThumb } from './DishThumb';
import { SessionMemory } from './SessionMemory';
import { slotModesLine, worldModesLine } from '../strings/modes';
import { journalUnseen } from '../journal';
import { unseenStories } from '../stories'; // P4.2: the quiet dot for an unseen story card
import { StoryDot } from './Notebook';

export function Home() {
  const hasDish = dishInfo.value !== null;
  const [auto, setAuto] = useState<SlotSummary | null>(null);
  useEffect(() => {
    if (hasDish) return;
    void getClient()
      .listSlots()
      .then((r) => setAuto(r.slots.find((s) => s.slotId === 'autosave') ?? null))
      .catch(() => setAuto(null));
  }, [hasDish]);
  return (
    <main class="page" aria-labelledby="home-title">
      <div class="home-grid">
        <header>
          <h1 id="home-title">Pixelmeba</h1>
          <p class="tagline">Grow a tiny living world. Change one thing. See what happens.</p>
        </header>
        {hasDish && sessionMemory.value && sessionMemory.value.dishId === dishInfo.value!.dishId ? (
          // P4.3 (D08 "A satisfying stopping point"): after Save and leave, this visit's memory takes the Continue card's place.
          <SessionMemory
            memory={sessionMemory.value}
            modes={worldModesLine(evolution.value?.preset ?? dishInfo.value!.mutationPreset, dishInfo.value!.founderMode, dishInfo.value!.registry)}
          />
        ) : hasDish ? (
          <section class="card" aria-label="Continue">
            <h2>Continue</h2>
            {/* UX §2.1: name, dish time, thumbnail (the latest snapshot), paused badge. Leaving the dish paused it. */}
            <div class="card-row">
              <DishThumb thumb={openDishThumb()} name={dishInfo.value!.name} />
              <div>
                <p class="paused-badge">{HOME_TEXT.paused}</p>
                <p data-testid="home-continue-text">{continueCardText(dishInfo.value!.name, meta.value?.tick ?? dishInfo.value!.tick)}</p>
                {/* P2.2: mode labels wherever a world is described (UX §3.3). */}
                <p class="world-modes" data-testid="home-continue-modes">
                  {worldModesLine(evolution.value?.preset ?? dishInfo.value!.mutationPreset, dishInfo.value!.founderMode, dishInfo.value!.registry)}
                </p>
              </div>
            </div>
            <button class="btn primary" onClick={() => (route.value = { name: 'dish' })}>
              <IconPlay /> Continue
            </button>
          </section>
        ) : auto ? (
          <section class="card" aria-label="Continue">
            <h2>Continue</h2>
            <div class="card-row">
              {/* P4.3: the autosave's own picture (its slot index copy), never painted. */}
              <DishThumb thumb={auto.thumb} name={auto.name} />
              <div>
                <p class="paused-badge">{HOME_TEXT.paused}</p>
                {/* D-0033 J: the dish clock, as Saved dishes names the same save. */}
                <p data-testid="home-continue-text">{continueCardText(auto.name, auto.tick)}</p>
                {slotModesLine(auto.modes) ? (
                  <p class="world-modes" data-testid="home-continue-modes">
                    {slotModesLine(auto.modes)}
                  </p>
                ) : null}
              </div>
            </div>
            {/* Continue opens the autosave only while no dish is open (then there is nothing to keep, D-0033). */}
            <button class="btn primary" onClick={() => void loadSlot('autosave', auto.name)} data-testid="home-continue">
              <IconPlay /> Continue
            </button>
          </section>
        ) : null}
        <section class="card" aria-label="Play">
          <h2>Play</h2>
          <p>Start a little living garden and see who finds something to eat.</p>
          <button class="btn primary" onClick={() => (route.value = { name: 'play' })} data-testid="home-play">
            <IconPlay /> Play
          </button>
        </section>
        <nav class="secondary-row" aria-label="More">
          <button class="btn" onClick={() => (route.value = { name: 'newDish' })} data-testid="home-new">
            <IconLab /> New dish
          </button>
          <button class="btn" onClick={() => (route.value = { name: 'notebook', tab: unseenStories.value > 0 ? 'stories' : 'experiments' })} data-testid="home-notebook">
            <IconNotebook /> Notebook
            {journalUnseen.value > 0 ? <span class="nb-dot">{journalUnseen.value} new</span> : null}
            {unseenStories.value > 0 ? <StoryDot /> : null}
          </button>
          <button class="btn" onClick={() => (route.value = { name: 'saves' })}>
            <IconSave /> Saved dishes
          </button>
          <button class="btn" onClick={() => (route.value = { name: 'guide' })}>
            <IconGuide /> Field Guide
          </button>
          <button class="btn" onClick={() => (route.value = { name: 'settings' })}>
            <IconSettings /> Settings
          </button>
          <button class="btn" onClick={() => (route.value = { name: 'about' })}>
            About
          </button>
        </nav>
      </div>
    </main>
  );
}
