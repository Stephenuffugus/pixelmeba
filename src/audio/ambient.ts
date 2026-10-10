/**
 * Ambient loop (ARCH §10.3; UX §8.1 "ambient loop quiet and optional"; P3.10): low-passed noise and a
 * slow, detuned sine pad, at −24 dB (mix.ts AMBIENT_DB) on the music bus. Cosmetic only: the noise
 * buffer uses Math.random, which is allowed here (src/audio never touches the simulation).
 */

export interface AmbientLoop {
  /** The loop's own level node (its gain is the ambient level, mix.ts busGains().ambient). */
  readonly level: GainNode;
  stop(): void;
}

/** A looping buffer of white noise (seconds long), shared by cues and the ambient loop. */
export function noiseBuffer(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Start the ambient loop into `bus` at linear `level`. */
export function startAmbient(
  ctx: BaseAudioContext,
  bus: AudioNode,
  level: number,
  noise: AudioBuffer,
): AmbientLoop {
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(bus);

  // Low-passed noise: a soft wash, like water under a lid.
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  lp.Q.value = 0.4;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.5;
  src.connect(lp).connect(noiseGain).connect(out);

  // Slow detuned sine pad (two voices a few cents apart) with a very slow swell.
  const padGain = ctx.createGain();
  padGain.gain.value = 0.35;
  padGain.connect(out);
  const voices: OscillatorNode[] = [];
  for (const [hz, cents] of [
    [110, -6],
    [110, 6],
    [164.81, -4],
  ] as const) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = hz;
    o.detune.value = cents;
    o.connect(padGain);
    voices.push(o);
  }
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.05;
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.15;
  lfo.connect(lfoDepth).connect(padGain.gain);

  const t = ctx.currentTime;
  src.start(t);
  for (const o of voices) o.start(t);
  lfo.start(t);

  return {
    level: out,
    stop() {
      for (const n of [src, lfo, ...voices]) {
        try {
          n.stop();
        } catch {
          /* already stopped */
        }
      }
      out.disconnect();
    },
  };
}
