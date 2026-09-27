import { IconBack, IconPlay } from '../icons';
import { busy, route, startRecipe } from '../state';

export function Play() {
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
            <GardenThumb />
            <div>
              <h2 id="garden-title">Little Living Garden</h2>
              <p>Who finds something to eat?</p>
              <p style={{ fontSize: '0.85rem' }}>
                Preloaded: 24 Sprinters, 12 Crumbsmiths, 8 Recyclers and 12 Sunbeads, a sugar patch, a starch patch and some debris. Nothing
                else will appear unless you add it.
              </p>
            </div>
          </div>
          <button class="btn primary" disabled={busy.value} onClick={() => void startRecipe('FIRST_DISH_V1', 'Little Living Garden')} data-testid="start-garden">
            <IconPlay /> Start
          </button>
        </section>
      </div>
    </main>
  );
}

function GardenThumb() {
  // A quiet painted thumbnail: the dish with three colored patches (not a live capture).
  return (
    <svg class="card-thumb" viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="46" fill="#D6E7E5" stroke="#2C3F49" stroke-width="3" />
      <circle cx="32" cy="34" r="7" fill="#6E7B84" />
      <circle cx="64" cy="63" r="7" fill="#6E7B84" />
      <circle cx="36" cy="50" r="6" fill="#EF7B6C" opacity="0.85" />
      <circle cx="51" cy="50" r="5" fill="#C8963E" opacity="0.85" />
      <circle cx="51" cy="37" r="4" fill="#D6A64D" opacity="0.85" />
      <circle cx="36" cy="38" r="5" fill="#8CBA4B" opacity="0.85" />
    </svg>
  );
}
