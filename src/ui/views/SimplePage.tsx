import { IconBack } from '../icons';
import { PauseOnDiscoveriesToggle } from '../panels/DiscoverySetting';
import { SoundSettings } from '../panels/SoundSettings';
import { reducedMotionFollowsDevice, route, settings, TEXT_SCALES, updateSettings } from '../state';
import { checkpointSettingText, lastCheckpoint } from '../state';
import { ABOUT_TEXT, aboutLines } from '../strings/about';

export function SimplePage({ title, body, settings: showSettings, about }: { title: string; body: string; settings?: boolean; about?: boolean }) {
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
          {/* P4.12 (PLAY_STORE_CHECKLIST §A): the accessibility statement and the privacy line. */}
          {about ? (
            <>
              <p class="about-statement" data-testid="about-accessibility">
                {ABOUT_TEXT.accessibility}
              </p>
              <p class="about-statement" data-testid="about-privacy">
                {ABOUT_TEXT.privacy}
              </p>
            </>
          ) : null}
          {about ? (
            <dl class="kv about-versions" data-testid="about-versions">
              {aboutLines().map((l) => (
                <>
                  <dt>{l.term}</dt>
                  <dd>{l.value}</dd>
                </>
              ))}
            </dl>
          ) : null}
          {showSettings ? (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', minHeight: '48px' }}>
                <input type="checkbox" checked={s.reducedMotion} onChange={(e) => updateSettings({ reducedMotion: e.currentTarget.checked })} data-testid="setting-reduced-motion" />
                Reduced motion
              </label>
              {reducedMotionFollowsDevice() ? <p class="setting-note">Follows your device setting until you change it here.</p> : null}
              <fieldset class="text-size">
                <legend>Text size</legend>
                <div class="segmented" role="group" aria-label="Text size">
                  {TEXT_SCALES.map((t) => (
                    <button key={t} class="btn" aria-pressed={s.textScale === t} onClick={() => updateSettings({ textScale: t })} data-testid={`text-size-${Math.round(t * 100)}`}>
                      {Math.round(t * 100)} %
                    </button>
                  ))}
                </div>
              </fieldset>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', minHeight: '48px' }}>
                <input type="checkbox" checked={s.showPrompts} onChange={(e) => updateSettings({ showPrompts: e.currentTarget.checked })} />
                Show gentle prompts
              </label>
              <PauseOnDiscoveriesToggle />
              <SoundSettings />
              {/* P2.8 (UX §2 Settings "checkpoint ring"; SPEC §10.7): off unless the player turns it on. */}
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', minHeight: '48px' }}>
                <input type="checkbox" checked={s.checkpointRing === true} onChange={(e) => updateSettings({ checkpointRing: e.currentTarget.checked })} aria-describedby="checkpoint-ring-note" data-testid="setting-checkpoint-ring" />
                Automatic checkpoints
              </label>
              <p class="setting-note ring-note" id="checkpoint-ring-note">
                Every minute of dish time, keep an automatic copy of the dish you are playing (not the copies of a comparison), up to the last 10 across all your dishes; the oldest automatic one is replaced. Your named saves are never removed. Open them from Saved dishes: each opens as a new branch.
                {checkpointSettingText(lastCheckpoint.value)}
              </p>
              {/* P3.11 (UX §9): every overlay in one light-to-dark ramp; off unless chosen. */}
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', minHeight: '48px' }}>
                <input
                  type="checkbox"
                  checked={s.simplifiedOverlayPalette === true}
                  onChange={(e) => updateSettings({ simplifiedOverlayPalette: e.currentTarget.checked })}
                  aria-describedby="simplified-overlay-note"
                  data-testid="setting-simplified-overlay"
                />
                Simplified overlay colours
              </label>
              <p class="setting-note" id="simplified-overlay-note">
                Every overlay uses one light-to-dark scale: darker means higher.
              </p>
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                Overlay opacity {Math.round(s.overlayOpacity * 100)} %
                <input
                  type="range"
                  min="0.2"
                  max="0.9"
                  step="0.05"
                  value={s.overlayOpacity}
                  onInput={(e) => updateSettings({ overlayOpacity: Number(e.currentTarget.value) })}
                />
              </label>
              {/* P4.13 (UX §2 Settings "diagnostics (opt-in)"; ARCH §13): off unless the player turns it on. */}
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', minHeight: '48px' }}>
                <input
                  type="checkbox"
                  checked={s.showPerformance === true}
                  onChange={(e) => updateSettings({ showPerformance: e.currentTarget.checked })}
                  aria-describedby="show-performance-note"
                  data-testid="setting-show-performance"
                />
                Show performance numbers
              </label>
              <p class="setting-note" id="show-performance-note">
                Tick time, speed, frame rate and memory, for bug reports. Off by default.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
