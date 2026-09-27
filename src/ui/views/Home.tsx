import { useEffect, useState } from 'preact/hooks';
import type { SlotSummary } from '@worker/protocol';
import { IconGuide, IconLab, IconNotebook, IconPlay, IconSave, IconSettings } from '../icons';
import { dishInfo, getClient, loadSlot, route } from '../state';

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
        {hasDish ? (
          <section class="card" aria-label="Continue">
            <h2>Continue</h2>
            <p>{dishInfo.value!.name} — paused where you left it.</p>
            <button class="btn primary" onClick={() => (route.value = { name: 'dish' })}>
              <IconPlay /> Continue
            </button>
          </section>
        ) : auto ? (
          <section class="card" aria-label="Continue">
            <h2>Continue</h2>
            <p>
              {auto.name} — {Math.floor(auto.tick / 10)} s simulated. Opens paused.
            </p>
            <button class="btn primary" onClick={() => void loadSlot('autosave')} data-testid="home-continue">
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
          <button class="btn" disabled title="Arrives with favorites and story cards">
            <IconNotebook /> Notebook
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
