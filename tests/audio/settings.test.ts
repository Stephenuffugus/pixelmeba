/**
 * P3.10 audio settings (UX §2, §8.1, §9 quiet audio; W5-21): mute, quiet audio and volumes map to bus
 * gains through pure functions (src/audio/mix.ts); haptics are feature-detected and off by default.
 */
import { describe, expect, it } from 'vitest';
import {
  AMBIENT_DB,
  ambientWanted,
  AUDIO_DEFAULTS,
  audioPrefsOf,
  busGains,
  dbToGain,
  QUIET_EFFECTS_DB,
} from '@audio/mix';
import { hapticTap, HAPTIC_TAP_MS } from '@audio/haptics';

describe('audio settings → gains', () => {
  it('defaults: effects 0.7, music 0.4, voice 0.8, unmuted, quiet audio and haptics off', () => {
    expect(AUDIO_DEFAULTS).toEqual({
      effectsVolume: 0.7,
      musicVolume: 0.4,
      voiceVolume: 0.8,
      muted: false,
      quietAudio: false,
      haptics: false,
      narration: false, // P4.9: narration off by default
    });
    // Settings stored by an older build have no audio fields: they take the defaults.
    expect(audioPrefsOf({})).toEqual(AUDIO_DEFAULTS);
    const g = busGains(AUDIO_DEFAULTS);
    expect(g.effects).toBeCloseTo(0.7, 12);
    expect(g.music).toBeCloseTo(0.4, 12);
    expect(g.voice).toBeCloseTo(0.8, 12);
    expect(g.ambient).toBeCloseTo(dbToGain(-24), 12);
    expect(ambientWanted(AUDIO_DEFAULTS)).toBe(true);
  });

  it('volumes map one to one to their own bus and are clamped to 0..1', () => {
    const p = audioPrefsOf({ effectsVolume: 0.25, musicVolume: 0.9, voiceVolume: 0.1 });
    expect(busGains(p)).toMatchObject({ effects: 0.25, music: 0.9, voice: 0.1 });
    const c = audioPrefsOf({ effectsVolume: 3, musicVolume: -1, voiceVolume: Number.NaN });
    expect(c.effectsVolume).toBe(1);
    expect(c.musicVolume).toBe(0);
    expect(c.voiceVolume).toBe(AUDIO_DEFAULTS.voiceVolume);
  });

  it('mute silences every bus and the ambient loop, whatever the volumes', () => {
    const g = busGains(audioPrefsOf({ muted: true, effectsVolume: 1, musicVolume: 1, voiceVolume: 1 }));
    expect(g).toEqual({ effects: 0, music: 0, voice: 0, ambient: 0 });
    expect(ambientWanted(audioPrefsOf({ muted: true }))).toBe(false);
  });

  it('quiet audio lowers effects by 12 dB and turns the ambient loop off; voice and music volume are kept', () => {
    expect(QUIET_EFFECTS_DB).toBe(-12);
    const loud = busGains(audioPrefsOf({ effectsVolume: 0.8 }));
    const quiet = busGains(audioPrefsOf({ effectsVolume: 0.8, quietAudio: true }));
    expect(20 * Math.log10(quiet.effects / loud.effects)).toBeCloseTo(-12, 9);
    expect(quiet.ambient).toBe(0);
    expect(quiet.voice).toBe(loud.voice);
    expect(ambientWanted(audioPrefsOf({ quietAudio: true }))).toBe(false);
  });

  it('the ambient loop sits at −24 dB on the music bus and stops when music is at 0', () => {
    expect(AMBIENT_DB).toBe(-24);
    expect(dbToGain(-24)).toBeCloseTo(0.0631, 4);
    expect(busGains(audioPrefsOf({ musicVolume: 0 })).ambient).toBe(0);
    expect(ambientWanted(audioPrefsOf({ musicVolume: 0 }))).toBe(false);
  });

  it('haptics: only when turned on and only where vibrate exists', () => {
    const calls: unknown[] = [];
    const host = { vibrate: (p: number | number[]) => (calls.push(p), true) };
    expect(hapticTap(false, host)).toBe(false);
    expect(hapticTap(true, null)).toBe(false);
    expect(hapticTap(true, {})).toBe(false);
    expect(calls).toHaveLength(0);
    expect(hapticTap(true, host)).toBe(true);
    expect(calls).toEqual([HAPTIC_TAP_MS]);
    expect(audioPrefsOf({}).haptics).toBe(false);
  });
});
