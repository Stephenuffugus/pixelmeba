/**
 * Audio settings → bus gains (UX §2 Settings "sound/music/voice"; UX §8.1, §9 "quiet audio"; P3.10).
 * Pure functions, unit-tested in tests/audio/settings.test.ts.
 *
 * W5-21 (proposed decision): defaults effects 0.7, music 0.4, voice 0.8, not muted, quiet audio off,
 * haptics off. Quiet audio = effects −12 dB and the ambient loop off. The ambient loop sits at −24 dB
 * on the music bus (ARCH §10.3). Mute silences every bus.
 */

export interface AudioPrefs {
  readonly effectsVolume: number;
  readonly musicVolume: number;
  readonly voiceVolume: number;
  readonly muted: boolean;
  readonly quietAudio: boolean;
  readonly haptics: boolean;
}

/** The stored settings' audio fields; any may be missing (settings stored by an older build). */
export type StoredAudioPrefs = { readonly [K in keyof AudioPrefs]?: AudioPrefs[K] | undefined };

export const AUDIO_DEFAULTS: AudioPrefs = {
  effectsVolume: 0.7,
  musicVolume: 0.4,
  voiceVolume: 0.8,
  muted: false,
  quietAudio: false,
  haptics: false,
};

/** Quiet audio lowers effects by this much (W5-21). */
export const QUIET_EFFECTS_DB = -12;
/** The ambient loop's level on the music bus (ARCH §10.3). */
export const AMBIENT_DB = -24;

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

function volume(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

/** Fill missing or malformed fields with the defaults and clamp volumes to 0..1. */
export function audioPrefsOf(s: StoredAudioPrefs): AudioPrefs {
  return {
    effectsVolume: volume(s.effectsVolume, AUDIO_DEFAULTS.effectsVolume),
    musicVolume: volume(s.musicVolume, AUDIO_DEFAULTS.musicVolume),
    voiceVolume: volume(s.voiceVolume, AUDIO_DEFAULTS.voiceVolume),
    muted: s.muted === true,
    quietAudio: s.quietAudio === true,
    haptics: s.haptics === true,
  };
}

export interface BusGains {
  /** Cue bus (UI and world cues). */
  readonly effects: number;
  /** Music bus (the ambient loop). */
  readonly music: number;
  /** Narration bus. */
  readonly voice: number;
  /** The ambient loop's own level on the music bus (0 when it is off). */
  readonly ambient: number;
}

/** Linear gains for each bus. */
export function busGains(p: AudioPrefs): BusGains {
  if (p.muted) return { effects: 0, music: 0, voice: 0, ambient: 0 };
  const effects = p.effectsVolume * (p.quietAudio ? dbToGain(QUIET_EFFECTS_DB) : 1);
  const ambientOn = !p.quietAudio && p.musicVolume > 0;
  return {
    effects,
    music: p.musicVolume,
    voice: p.voiceVolume,
    ambient: ambientOn ? dbToGain(AMBIENT_DB) : 0,
  };
}

/** Whether the ambient loop should be running at all (not muted, not quiet audio, music above 0). */
export function ambientWanted(p: AudioPrefs): boolean {
  return busGains(p).ambient > 0;
}
