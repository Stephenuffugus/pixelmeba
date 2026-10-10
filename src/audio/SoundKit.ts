/**
 * SoundKit (ARCH §10.3; P3.10): Web Audio synthesis of the stable cue ids from patch definitions
 * (patches.ts), separate effects / music / voice buses under one master, the ambient loop on the music
 * bus, mute and quiet audio through mix.ts, suspend and resume. Created only after a user gesture
 * (autoplay rules); everything here is cosmetic and never reaches the simulation.
 */
import { startAmbient, noiseBuffer, type AmbientLoop } from './ambient';
import { busGains, type AudioPrefs, AUDIO_DEFAULTS } from './mix';
import { PATCHES, patchSeconds, type CueId, type CuePatch } from './patches';

type AudioContextCtor = new () => AudioContext;

/** The page's AudioContext constructor, if it has one (feature-detected). */
export function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** Smoothing time constant for bus changes (seconds), so a slider never clicks. */
const RAMP = 0.03;

export class SoundKit {
  readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly effects: GainNode;
  private readonly music: GainNode;
  readonly voice: GainNode;
  private readonly noise: AudioBuffer;
  private ambient: AmbientLoop | null = null;
  private prefs: AudioPrefs = AUDIO_DEFAULTS;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.effects = ctx.createGain();
    this.music = ctx.createGain();
    this.voice = ctx.createGain();
    for (const g of [this.effects, this.music, this.voice]) g.connect(this.master);
    this.noise = noiseBuffer(ctx, 2);
  }

  /** Apply settings: bus gains, and the ambient loop on or off. */
  setPrefs(p: AudioPrefs): void {
    this.prefs = p;
    const g = busGains(p);
    const t = this.ctx.currentTime;
    this.effects.gain.setTargetAtTime(g.effects, t, RAMP);
    this.music.gain.setTargetAtTime(g.music, t, RAMP);
    this.voice.gain.setTargetAtTime(g.voice, t, RAMP);
    if (g.ambient > 0) {
      if (!this.ambient) this.ambient = startAmbient(this.ctx, this.music, g.ambient, this.noise);
      else this.ambient.level.gain.setTargetAtTime(g.ambient, t, RAMP);
    } else if (this.ambient) {
      this.ambient.stop();
      this.ambient = null;
    }
  }

  get ambientRunning(): boolean {
    return this.ambient !== null;
  }

  /** Play one cue now. `count` (coalesced repeats) only nudges the level up a little, never a burst. */
  play(id: CueId, count = 1): void {
    if (this.prefs.muted || this.ctx.state !== 'running') return;
    const p = PATCHES[id];
    const boost = Math.min(3, 1 + Math.log10(Math.max(1, count)) * 0.5);
    const notes = p.pitch.notes ?? [p.pitch.hz];
    const step = p.pitch.step ?? 0;
    const t0 = this.ctx.currentTime + 0.005;
    notes.forEach((hz, i) => this.voiceNote(p, hz, t0 + i * step, boost));
  }

  private voiceNote(p: CuePatch, hz: number, t: number, boost: number): void {
    const ctx = this.ctx;
    const e = p.envelope;
    const peak = Math.pow(10, p.gainDb / 20) * boost;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(peak, t + e.attack);
    const sustainAt = t + e.attack + e.decay;
    env.gain.linearRampToValueAtTime(Math.max(0.0001, peak * e.sustain), sustainAt);
    const releaseAt = sustainAt + e.hold;
    env.gain.setValueAtTime(Math.max(0.0001, peak * e.sustain), releaseAt);
    const end = releaseAt + e.release;
    env.gain.linearRampToValueAtTime(0.0001, end);

    const filter = ctx.createBiquadFilter();
    filter.type = p.filter.type;
    filter.frequency.setValueAtTime(p.filter.hz, t);
    filter.Q.value = p.filter.q;
    filter.connect(env).connect(this.effects);

    let src: AudioScheduledSourceNode;
    if (p.source.kind === 'noise') {
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      n.loop = true;
      // A noise cue's "pitch" moves its filter.
      if (p.pitch.to !== undefined) filter.frequency.exponentialRampToValueAtTime(p.pitch.to, end);
      src = n;
    } else {
      const o = ctx.createOscillator();
      o.type = p.source.wave;
      o.frequency.setValueAtTime(hz, t);
      if (p.pitch.to !== undefined) o.frequency.exponentialRampToValueAtTime(p.pitch.to, end);
      src = o;
    }
    src.connect(filter);
    src.start(t);
    src.stop(end + 0.02);
    src.onended = () => env.disconnect();
  }

  /** Length of a cue in seconds (for the preview page). */
  static seconds(id: CueId): number {
    return patchSeconds(PATCHES[id]);
  }

  suspend(): Promise<void> {
    return this.ctx.state === 'running' ? this.ctx.suspend() : Promise.resolve();
  }

  resume(): Promise<void> {
    return this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve();
  }
}
