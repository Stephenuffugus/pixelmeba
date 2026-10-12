/**
 * Cue façade for the UI (ARCH §10.3, UX §8; P3.10). The UI calls these at the points where a player
 * action or a recorded dish event has already happened; no cue is triggered by the renderer, none
 * consumes simulation randomness, and src/audio never imports src/sim (tests/audio/imports.test.ts).
 *
 * Silence must preserve meaning (UX §8.2). Every audible cue and its visible equivalent:
 *   drop             the accepted-placement toast ("Added 12 …", the Lab outcome toast) and the new
 *                    organisms, food or habitat change on the dish (placement ring with motion on)
 *   placement_error  the refusal toast saying why nothing was placed ("No room here …", "can't go there")
 *   select           the inspector sheet opening on the organism or cell, and the selection highlight
 *   save             the "Saved “name”." toast
 *   discovery        the discovery card "New branch: …" (and its live-region line)
 *   compare_result   the comparison results table appearing
 *   division         the split flash on the dish (motion on), the population count rising and the
 *                    "… split in two" / "N … divisions" feed line (non-bacterial splits only, at most
 *                    one click per 5 s; bacterial and viral births never sound, UX §8.1)
 *   card_open        the experiment card page opening
 *   wake             the resting mark leaving the organism as it becomes active again
 *
 * Nothing sounds before the first user gesture (autoplay): initAudio() runs from that gesture
 * (src/ui/main.tsx); until then every cue is silently skipped. World cues pass the rate limiter.
 */
import { hapticTap } from './haptics';
import { AUDIO_DEFAULTS, type AudioPrefs } from './mix';
import { coalesceMsOf, isWorldCue, SILENT_DIVISION_CATEGORIES, type CueId } from './patches';
import { narrator } from './narration';
import { CueRateLimiter } from './rateLimiter';
import { audioContextCtor, SoundKit } from './SoundKit';

export type { CueId } from './patches';

let kit: SoundKit | null = null;
let prefs: AudioPrefs = AUDIO_DEFAULTS;
/** Suspended by the app (hidden page or an arcade host's pause), not by the browser. */
let held = false;
const limiter = new CueRateLimiter({ now: () => performance.now(), isWorld: isWorldCue, coalesceOf: coalesceMsOf });

/** Create the audio graph from a user gesture (idempotent). False when Web Audio is unavailable. */
export function initAudio(): boolean {
  narrator.gesture(); // P4.9: narration, like every sound, waits for the first gesture (with or without Web Audio)
  if (kit) {
    if (!held) void kit.resume().catch(() => undefined);
    return true;
  }
  const Ctor = audioContextCtor();
  if (!Ctor) return false;
  try {
    kit = new SoundKit(new Ctor());
  } catch {
    return false;
  }
  kit.setPrefs(prefs);
  if (held) void kit.suspend().catch(() => undefined);
  else void kit.resume().catch(() => undefined);
  return true;
}

/** Whether the audio graph exists (a gesture has happened and Web Audio is available). */
export function audioReady(): boolean {
  return kit !== null;
}

/** The current settings (Settings → Sound). */
export function setAudioPrefs(p: AudioPrefs): void {
  prefs = p;
  kit?.setPrefs(p);
  narrator.setPrefs(p); // P4.9: narration on/off and the voice bus volume
}

/** Hidden page or the arcade host's pause: stop all sound until resumeAudio(). */
export function suspendAudio(): void {
  held = true;
  narrator.hold(true); // P4.9: stop speaking, drop what waits
  void kit?.suspend().catch(() => undefined);
}

export function resumeAudio(): void {
  held = false;
  narrator.hold(false);
  void kit?.resume().catch(() => undefined);
}

/** Play a cue (world cues through the rate limiter). `count`: happenings it stands for. */
export function playCue(id: CueId, count = 1): void {
  if (!kit || held || prefs.muted || count <= 0) return;
  const d = limiter.request(id, count);
  if (d.play) kit.play(id, d.entry.count);
}

/** The last key each keyed cue played for (playCueFor). */
const lastKeyOf = new Map<CueId, unknown>();

/**
 * Play `id` once per `key` (an event's identity, e.g. the discovery or results object): a panel that
 * remounts while the same card or results are still up does not replay the cue. The key is recorded
 * even when audio is not ready yet, so a later gesture does not replay an old event. True if new.
 */
export function playCueFor(id: CueId, key: unknown): boolean {
  if (lastKeyOf.get(id) === key) return false;
  lastKeyOf.set(id, key);
  playCue(id);
  return true;
}

/**
 * A placement the player made (Add Life, Add food, a Lab tool): `drop` when the dish accepted any of
 * it, `placement_error` when it accepted none; a short buzz with haptics on, only when accepted.
 */
export function placementCue(accepted: number): void {
  playCue(accepted > 0 ? 'drop' : 'placement_error');
  if (accepted > 0) hapticTap(prefs.haptics);
}

/**
 * Whether a species' births may sound (by its recorded category, in the dish's species order; UX §8.1
 * "No sound per bacterial division burst"). Unknown category → silent.
 */
export function divisionAudible(categories: readonly string[] | undefined): (species: number) => boolean {
  return (species) => {
    const c = categories?.[species];
    return c !== undefined && !SILENT_DIVISION_CATEGORIES.includes(c);
  };
}

/**
 * Audible births and wakes among snapshot events, by the protocol's VisualEvent type names (no
 * simulation import). A birth counts only when `audible(species)` (bacterial births never do).
 */
export function worldCueCounts(
  events: readonly { readonly type: string; readonly species: number }[],
  audible: (species: number) => boolean,
): {
  readonly division: number;
  readonly wake: number;
} {
  let division = 0;
  let wake = 0;
  for (const ev of events) {
    if (ev.type === 'birth') {
      if (audible(ev.species)) division++;
    } else if (ev.type === 'wake') wake++;
  }
  return { division, wake };
}

/** Snapshot events → world cues: audible births → one coalesced `division`, wakes → `wake`. */
export function eventCues(
  events: readonly { readonly type: string; readonly species: number }[],
  audible: (species: number) => boolean,
): void {
  if (!kit || events.length === 0) return;
  const n = worldCueCounts(events, audible);
  if (n.division > 0) playCue('division', n.division);
  if (n.wake > 0) playCue('wake', n.wake);
}
