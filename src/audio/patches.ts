/**
 * Synthesized cue patches (ARCH §10.3, UX §8.1; P3.10). One patch per stable cue id:
 * `{ cueId, source (oscillator | noise), envelope, pitch, filter, gain }`. The ids are stable so
 * recorded assets can replace a patch later without touching a call site.
 *
 * Cue ids (W5-20 mapping, proposed decision in the audio build report):
 *   drop            a placement the dish accepted (ARCH's `placement_ok` is this cue)
 *   placement_error a placement the dish refused entirely (dull)
 *   select          the player selected an organism or a cell
 *   save            a manual save completed
 *   discovery       a discovery card opened (soft chime)
 *   compare_result  a comparison's results appeared
 *   division        a non-bacterial organism split (soft click; at most one per 5 s; bacteria and
 *                   virus bursts never sound)
 *   card_open       an experiment card opened
 *   wake            a resting organism woke
 * `gate_click` is deferred (P3.10 "gate click later"): no gate exists to click yet.
 *
 * World cues (driven by what happens in the dish) pass the rate limiter; UI cues answer one player
 * action each and bypass it. Nothing here imports the simulation.
 */

export type CueId =
  | 'drop'
  | 'placement_error'
  | 'select'
  | 'save'
  | 'discovery'
  | 'compare_result'
  | 'division'
  | 'card_open'
  | 'wake';

export const CUE_IDS: readonly CueId[] = [
  'drop',
  'placement_error',
  'select',
  'save',
  'discovery',
  'compare_result',
  'division',
  'card_open',
  'wake',
];

/** World cues share the ≤ 4 per second budget (CT §12.10 "sound cues ≤ 4/s"). */
export const WORLD_CUES: readonly CueId[] = ['division', 'wake', 'discovery'];

export function isWorldCue(id: string): boolean {
  return (WORLD_CUES as readonly string[]).includes(id);
}

/**
 * Coalescing gap of each world cue in ms (UX §8.1 "No sound per bacterial division burst … coalesce
 * repeats"; CT §12.10 "events … coalesce 5 s"). Division joins every split within 5 s of its last
 * click into that click, so a growing dish clicks at most once per 5 s; wake joins wakes within 1 s;
 * a discovery card is its own event (250 ms only joins a double report).
 */
export const WORLD_CUE_COALESCE_MS = { division: 5000, wake: 1000, discovery: 250 } as const;

export function coalesceMsOf(id: string): number | undefined {
  switch (id) {
    case 'division':
      return WORLD_CUE_COALESCE_MS.division;
    case 'wake':
      return WORLD_CUE_COALESCE_MS.wake;
    case 'discovery':
      return WORLD_CUE_COALESCE_MS.discovery;
    default:
      return undefined;
  }
}

/**
 * Species categories whose births never sound (UX §8.1 "No sound per bacterial division burst";
 * D01 "No sound per bacterial division"): bacteria, and viruses, whose births are burst releases.
 */
export const SILENT_DIVISION_CATEGORIES: readonly string[] = ['bacterium', 'virus'];

export interface Envelope {
  /** Seconds from silence to peak. */
  readonly attack: number;
  /** Seconds from peak to the sustain level. */
  readonly decay: number;
  /** Sustain level as a fraction of the peak (0..1). */
  readonly sustain: number;
  /** Seconds held at the sustain level. */
  readonly hold: number;
  /** Seconds from the sustain level to silence. */
  readonly release: number;
}

export interface CuePatch {
  readonly cueId: CueId;
  /** An oscillator waveform, or band-limited noise through the filter. */
  readonly source:
    { readonly kind: 'oscillator'; readonly wave: OscillatorType } | { readonly kind: 'noise' };
  readonly envelope: Envelope;
  /**
   * Start frequency in Hz, an optional glide to `to` over the envelope, and optional extra notes
   * (`notes`: frequencies started `step` seconds apart, e.g. a two-note chime).
   */
  readonly pitch: {
    readonly hz: number;
    readonly to?: number;
    readonly notes?: readonly number[];
    readonly step?: number;
  };
  readonly filter: { readonly type: BiquadFilterType; readonly hz: number; readonly q: number };
  /** Peak level in dB relative to the effects bus (0 dB = full bus level). */
  readonly gainDb: number;
}

export const PATCHES: Readonly<Record<CueId, CuePatch>> = {
  drop: {
    cueId: 'drop',
    source: { kind: 'oscillator', wave: 'sine' },
    envelope: { attack: 0.004, decay: 0.09, sustain: 0, hold: 0, release: 0.05 },
    pitch: { hz: 520, to: 330 },
    filter: { type: 'lowpass', hz: 2400, q: 0.7 },
    gainDb: -10,
  },
  placement_error: {
    cueId: 'placement_error',
    source: { kind: 'oscillator', wave: 'triangle' },
    envelope: { attack: 0.006, decay: 0.16, sustain: 0, hold: 0, release: 0.06 },
    pitch: { hz: 150, to: 120 },
    filter: { type: 'lowpass', hz: 700, q: 0.5 },
    gainDb: -9,
  },
  select: {
    cueId: 'select',
    source: { kind: 'oscillator', wave: 'sine' },
    envelope: { attack: 0.002, decay: 0.05, sustain: 0, hold: 0, release: 0.03 },
    pitch: { hz: 880 },
    filter: { type: 'lowpass', hz: 3000, q: 0.7 },
    gainDb: -16,
  },
  save: {
    cueId: 'save',
    source: { kind: 'oscillator', wave: 'triangle' },
    envelope: { attack: 0.005, decay: 0.12, sustain: 0.2, hold: 0.05, release: 0.15 },
    pitch: { hz: 392, notes: [392, 523.25], step: 0.09 },
    filter: { type: 'lowpass', hz: 2200, q: 0.7 },
    gainDb: -12,
  },
  discovery: {
    cueId: 'discovery',
    source: { kind: 'oscillator', wave: 'sine' },
    envelope: { attack: 0.01, decay: 0.4, sustain: 0.15, hold: 0.1, release: 0.6 },
    pitch: { hz: 659.25, notes: [659.25, 987.77], step: 0.12 },
    filter: { type: 'lowpass', hz: 4000, q: 0.5 },
    gainDb: -14,
  },
  compare_result: {
    cueId: 'compare_result',
    source: { kind: 'oscillator', wave: 'triangle' },
    envelope: { attack: 0.008, decay: 0.2, sustain: 0.2, hold: 0.08, release: 0.25 },
    pitch: { hz: 440, notes: [440, 554.37, 659.25], step: 0.08 },
    filter: { type: 'lowpass', hz: 2600, q: 0.6 },
    gainDb: -14,
  },
  division: {
    cueId: 'division',
    source: { kind: 'noise' },
    envelope: { attack: 0.001, decay: 0.025, sustain: 0, hold: 0, release: 0.015 },
    pitch: { hz: 1800 },
    filter: { type: 'bandpass', hz: 1800, q: 6 },
    gainDb: -20,
  },
  card_open: {
    cueId: 'card_open',
    source: { kind: 'noise' },
    envelope: { attack: 0.02, decay: 0.12, sustain: 0, hold: 0, release: 0.06 },
    pitch: { hz: 1200, to: 2400 },
    filter: { type: 'bandpass', hz: 1200, q: 1.2 },
    gainDb: -18,
  },
  wake: {
    cueId: 'wake',
    source: { kind: 'oscillator', wave: 'sine' },
    envelope: { attack: 0.06, decay: 0.2, sustain: 0, hold: 0, release: 0.1 },
    pitch: { hz: 330, to: 495 },
    filter: { type: 'lowpass', hz: 1800, q: 0.7 },
    gainDb: -18,
  },
};

/** Total length of a patch's envelope in seconds (the last note's start included). */
export function patchSeconds(p: CuePatch): number {
  const e = p.envelope;
  const extra = (p.pitch.notes?.length ?? 1) - 1;
  return extra * (p.pitch.step ?? 0) + e.attack + e.decay + e.hold + e.release;
}
