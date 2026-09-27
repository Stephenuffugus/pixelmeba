import { IconGuide, IconLab, IconNotebook, IconPlay, IconSettings } from '../icons';
import { dishInfo, route } from '../state';

export function Home() {
  const hasDish = dishInfo.value !== null;
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
        ) : null}
        <section class="card" aria-label="Play">
          <h2>Play</h2>
          <p>Start a little living garden and see who finds something to eat.</p>
          <button class="btn primary" onClick={() => (route.value = { name: 'play' })} data-testid="home-play">
            <IconPlay /> Play
          </button>
        </section>
        <nav class="secondary-row" aria-label="More">
          <button class="btn" disabled title="Arrives with the Lab view">
            <IconLab /> Lab
          </button>
          <button class="btn" disabled title="Arrives with favorites and story cards">
            <IconNotebook /> Notebook
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
