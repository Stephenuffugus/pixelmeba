/**
 * Settings → Sound (UX §2 Settings "sound/music/voice · haptics", §8, §9 "quiet audio"; P3.10): mute,
 * effects / music / voice volumes, quiet audio and haptics. Device preferences only: they change what
 * the player hears or feels, never the dish. Defaults come from src/audio/mix.ts (W5-21).
 */
import { audioPrefsOf } from '@audio/mix';
import { settings, updateSettings } from '../state';

const T = {
  legend: 'Sound',
  mute: 'Mute all sound',
  effects: 'Effects volume',
  effectsNote: 'Cues for placing, selecting, saving, results, cells splitting and organisms waking.',
  music: 'Music volume',
  musicNote: 'The quiet background loop.',
  voice: 'Voice volume',
  voiceNote: 'For spoken narration, which this version does not have yet.',
  quiet: 'Quiet audio',
  quietNote: 'Softer cues and no background sound.',
  haptics: 'Haptics',
  hapticsNote:
    'A short buzz when the dish accepts something you placed, in a web browser that can vibrate. The Android app does not vibrate yet.',
  gesture: 'Sound starts after your first tap or key press. Everything you can hear is also shown on screen.',
} as const;

type VolumeKey = 'effectsVolume' | 'musicVolume' | 'voiceVolume';

function VolumeSlider({
  k,
  label,
  note,
  value,
}: {
  k: VolumeKey;
  label: string;
  note?: string;
  value: number;
}) {
  const pct = Math.round(value * 100);
  const noteId = note ? `sound-${k}-note` : undefined;
  return (
    <div class="sound-volume">
      <label for={`sound-${k}`}>
        {label} {pct} %
      </label>
      <input
        id={`sound-${k}`}
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        aria-valuetext={`${pct} %`}
        {...(noteId ? { 'aria-describedby': noteId } : {})}
        onInput={(e) => updateSettings({ [k]: Number(e.currentTarget.value) })}
        data-testid={`setting-${k}`}
      />
      {note ? (
        <p class="setting-note sound-note" id={noteId}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

export function SoundSettings() {
  const p = audioPrefsOf(settings.value);
  return (
    <fieldset class="sound-settings" data-testid="sound-settings">
      <legend>{T.legend}</legend>
      <p class="setting-note sound-note">{T.gesture}</p>
      <label class="sound-check">
        <input
          type="checkbox"
          checked={p.muted}
          onChange={(e) => updateSettings({ muted: e.currentTarget.checked })}
          data-testid="setting-muted"
        />
        {T.mute}
      </label>
      <VolumeSlider k="effectsVolume" label={T.effects} note={T.effectsNote} value={p.effectsVolume} />
      <VolumeSlider k="musicVolume" label={T.music} note={T.musicNote} value={p.musicVolume} />
      <VolumeSlider k="voiceVolume" label={T.voice} note={T.voiceNote} value={p.voiceVolume} />
      <label class="sound-check">
        <input
          type="checkbox"
          checked={p.quietAudio}
          onChange={(e) => updateSettings({ quietAudio: e.currentTarget.checked })}
          aria-describedby="sound-quiet-note"
          data-testid="setting-quietAudio"
        />
        {T.quiet}
      </label>
      <p class="setting-note sound-note" id="sound-quiet-note">
        {T.quietNote}
      </p>
      <label class="sound-check">
        <input
          type="checkbox"
          checked={p.haptics}
          onChange={(e) => updateSettings({ haptics: e.currentTarget.checked })}
          aria-describedby="sound-haptics-note"
          data-testid="setting-haptics"
        />
        {T.haptics}
      </label>
      <p class="setting-note sound-note" id="sound-haptics-note">
        {T.hapticsNote}
      </p>
    </fieldset>
  );
}
