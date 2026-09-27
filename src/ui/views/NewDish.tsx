/**
 * New Dish (UX §2.3): progressive disclosure — basics, evolution, then a summary of exactly what
 * is preloaded. Enters paused.
 */
import { useState } from 'preact/hooks';
import { IconBack, IconPlay } from '../icons';
import { busy, route, startCustom } from '../state';

const MODES = [
  { id: 'standard', label: 'Standard Evolution', note: 'Offspring sometimes inherit small differences.' },
  { id: 'accelerated', label: 'Accelerated Evolution', note: 'Twice as many variations — a game setting, not realism.' },
  { id: 'fixed', label: 'Fixed Traits', note: 'Offspring are exact copies. Good for controlled experiments.' },
] as const;

export function NewDish() {
  const [start, setStart] = useState<'garden' | 'empty'>('garden');
  const [name, setName] = useState('My dish');
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 900000) + 100000);
  const [mode, setMode] = useState<'standard' | 'accelerated' | 'fixed'>('standard');
  const [founders, setFounders] = useState<'identical' | 'varied'>('identical');
  const [advanced, setAdvanced] = useState(false);
  return (
    <main class="page" aria-labelledby="new-title">
      <div class="home-grid">
        <header style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button class="btn ghost" style={{ color: 'inherit' }} onClick={() => (route.value = { name: 'home' })} aria-label="Back">
            <IconBack />
          </button>
          <h1 id="new-title" style={{ fontSize: '1.5rem' }}>
            New dish
          </h1>
        </header>
        <section class="card" aria-label="Basics">
          <h2>Start with</h2>
          <div class="chips" role="radiogroup" aria-label="Start with" style={{ margin: '0.5rem 0' }}>
            <button class="btn" role="radio" aria-checked={start === 'garden'} aria-pressed={start === 'garden'} onClick={() => setStart('garden')}>
              Little Living Garden
            </button>
            <button class="btn" role="radio" aria-checked={start === 'empty'} aria-pressed={start === 'empty'} onClick={() => setStart('empty')}>
              Empty Water Garden
            </button>
          </div>
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            Name
            <input
              value={name}
              maxLength={60}
              onInput={(e) => setName(e.currentTarget.value)}
              style={{ minHeight: '48px', padding: '0 0.75rem', borderRadius: '10px', border: '1px solid var(--line)' }}
            />
          </label>
        </section>
        <section class="card" aria-label="Evolution">
          <h2>Evolution</h2>
          <div style={{ display: 'grid', gap: '0.4rem' }} role="radiogroup" aria-label="Evolution mode">
            {MODES.map((m) => (
              <button key={m.id} class="btn" role="radio" aria-checked={mode === m.id} aria-pressed={mode === m.id} style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => setMode(m.id)}>
                <span>
                  {m.label}
                  <br />
                  <span class="sub" style={{ fontWeight: 400 }}>
                    {m.note}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <button class="btn ghost" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)} style={{ marginTop: '0.5rem' }}>
            {advanced ? 'Hide' : 'Show'} starting variation and seed
          </button>
          {advanced ? (
            <div style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem' }}>
              <div class="segmented" role="radiogroup" aria-label="Starting variation">
                <button class="btn" role="radio" aria-checked={founders === 'identical'} aria-pressed={founders === 'identical'} onClick={() => setFounders('identical')}>
                  Identical founders
                </button>
                <button class="btn" role="radio" aria-checked={founders === 'varied'} aria-pressed={founders === 'varied'} onClick={() => setFounders('varied')}>
                  Varied traits
                </button>
              </div>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                Seed (same seed + same actions = same history)
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    inputMode="numeric"
                    value={String(seed)}
                    onInput={(e) => setSeed(Math.max(0, Math.min(4294967295, Number(e.currentTarget.value.replace(/\D/g, '')) || 0)))}
                    style={{ minHeight: '48px', padding: '0 0.75rem', borderRadius: '10px', border: '1px solid var(--line)', flex: 1 }}
                  />
                  <button class="btn" onClick={() => setSeed(Math.floor(Math.random() * 900000) + 100000)}>
                    New seed
                  </button>
                </div>
              </label>
            </div>
          ) : null}
        </section>
        <section class="card" aria-label="Summary">
          <h2>What you get</h2>
          <p>
            {start === 'garden'
              ? 'Water with two stones; a sugar patch, a starch patch and some debris; 24 Sprinters, 12 Crumbsmiths, 8 Recyclers and 12 Sunbeads.'
              : 'Water with two stones, oxygen, carbon dioxide and a little mineral nutrient. No life and no food until you add them.'}{' '}
            {MODES.find((m) => m.id === mode)!.label}; {founders === 'identical' ? 'identical founders' : 'founders with small starting differences'}; seed {seed}. Nothing else
            appears on its own. Starts paused.
          </p>
          <button
            class="btn primary"
            disabled={busy.value}
            data-testid="new-dish-start"
            onClick={() => void startCustom({ recipeId: 'FIRST_DISH_V1', name, seed, mutationPreset: mode, founderMode: founders, empty: start === 'empty' })}
          >
            <IconPlay /> Create dish
          </button>
        </section>
      </div>
    </main>
  );
}
