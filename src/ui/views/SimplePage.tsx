import { IconBack } from '../icons';
import { route, settings, updateSettings } from '../state';

export function SimplePage({ title, body, settings: showSettings }: { title: string; body: string; settings?: boolean }) {
  const s = settings.value;
  return (
    <main class="page" aria-labelledby="page-title">
      <div class="home-grid">
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button class="btn ghost" style={{ color: 'inherit' }} onClick={() => (route.value = { name: 'home' })} aria-label="Back">
            <IconBack />
          </button>
          <h1 id="page-title" style={{ fontSize: '1.5rem' }}>
            {title}
          </h1>
        </header>
        <section class="card">
          <p>{body}</p>
          {showSettings ? (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', minHeight: '48px' }}>
                <input type="checkbox" checked={s.reducedMotion} onChange={(e) => updateSettings({ reducedMotion: (e.currentTarget).checked })} />
                Reduced motion
              </label>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', minHeight: '48px' }}>
                <input type="checkbox" checked={s.showPrompts} onChange={(e) => updateSettings({ showPrompts: (e.currentTarget).checked })} />
                Show gentle prompts
              </label>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                Overlay opacity {Math.round(s.overlayOpacity * 100)} %
                <input
                  type="range"
                  min="0.2"
                  max="0.9"
                  step="0.05"
                  value={s.overlayOpacity}
                  onInput={(e) => updateSettings({ overlayOpacity: Number((e.currentTarget).value) })}
                />
              </label>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
