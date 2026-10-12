/**
 * Narration (UX §8.3, D08 §09 "Optional local voice prompts"; P4.9). Sixteen fixed phrases, spoken with
 * the device's SpeechSynthesis when the player turned Settings → Sound → Narration on (off by default).
 *
 *   • Only a phrase id can be spoken: speak(id) looks the text up in PHRASES, so no free text, number,
 *     dish name or family nickname can ever reach SpeechSynthesis (UX §8.3 "never reads dynamic numbers
 *     or custom names").
 *   • The UI asks for a phrase only when its evidence condition is true (src/ui/narration.ts); the text
 *     it stands for is always shown on screen, whether or not narration is on (UX §8.2, §8.3).
 *   • Voice availability does not gate play (D08): speechSynthesis is feature-detected; without it,
 *     nothing is spoken and nothing fails.
 *   • One utterance at a time: a new phrase cancels nothing and waits (at most NARRATION_QUEUE_MAX wait).
 *   • The same phrase is not spoken again within NARRATION_REPEAT_MS (P4.9 proposed decision).
 *   • Nothing before the first user gesture (as the cues, src/audio/cues.ts initAudio), nothing while
 *     audio is held (page hidden, an arcade host's pause): holding cancels what is speaking and drops the
 *     queue, so nothing old is spoken later.
 *   • Volume is the voice bus (src/audio/mix.ts busGains: voice volume, 0 when muted); at 0 nothing is
 *     spoken.
 *
 * Cosmetic only: src/audio imports nothing from the simulation (tests/audio/imports.test.ts).
 */
import { AUDIO_DEFAULTS, busGains, type AudioPrefs } from './mix';

/** The 16 phrases of UX §8.3, in its order. Stable ids; the texts are exactly the spec's. */
export const PHRASES = {
  pressPlay: 'Press play',
  pause: 'Pause',
  addLife: 'Add life',
  addFood: 'Add food',
  lookClosely: 'Look closely',
  eatingSugar: 'Eating sugar',
  needsMoreFood: 'Needs more food',
  needsRoom: 'Needs room',
  resting: 'Resting',
  cellSplit: 'A cell split',
  followFamily: 'Follow this family',
  feederEmpty: 'The feeder is empty',
  lightOn: 'The light is on',
  lightOff: 'The light is off',
  saved: 'Saved',
  undoRewinds: 'Undo rewinds time',
} as const;

export type PhraseId = keyof typeof PHRASES;

export const PHRASE_IDS: readonly PhraseId[] = Object.keys(PHRASES) as PhraseId[];

export function isPhraseId(id: unknown): id is PhraseId {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(PHRASES, id);
}

/** The same phrase is not spoken again within this many ms of the last time it was accepted. */
export const NARRATION_REPEAT_MS = 10_000;
/** Phrases waiting behind the one being spoken; a request beyond this is dropped (never a backlog). */
export const NARRATION_QUEUE_MAX = 2;
/** If the device never reports the end of an utterance, the next one starts after this long. */
export const UTTERANCE_TIMEOUT_MS = 5000;

/** What narration needs of the page (window), feature-detected. */
export interface SpeechHost {
  readonly speechSynthesis?: {
    speak(u: SpeechUtteranceLike): void;
    cancel(): void;
  };
  readonly SpeechSynthesisUtterance?: new (text: string) => SpeechUtteranceLike;
}

export interface SpeechUtteranceLike {
  text: string;
  volume: number;
  rate?: number;
  lang?: string;
  onend: ((this: unknown, ev: unknown) => unknown) | null;
  onerror: ((this: unknown, ev: unknown) => unknown) | null;
}

export interface NarratorOptions {
  /** The page, or null when there is none (tests, a worker). Read at each speak. */
  readonly host: () => SpeechHost | null;
  readonly now: () => number;
  readonly later?: (fn: () => void, ms: number) => unknown;
  readonly clearLater?: (handle: unknown) => void;
}

/** Whether narration speaks with these settings, and at what volume (0 = silent). */
export function narrationVolume(p: AudioPrefs): number {
  if (p.narration !== true) return 0;
  return busGains(p).voice;
}

/** Why a speak() request did not reach SpeechSynthesis (for tests and the dev console). */
export type NarrationRefusal = 'unknown' | 'off' | 'silent' | 'noGesture' | 'held' | 'noVoice' | 'repeat' | 'queued' | 'full';

export class Narrator {
  private prefs: AudioPrefs = AUDIO_DEFAULTS;
  private gestured = false;
  private held = false;
  private speaking: PhraseId | null = null;
  private queue: PhraseId[] = [];
  private readonly lastAt = new Map<PhraseId, number>();
  private timer: unknown = null;
  /** Identity of the utterance started last (its end callbacks compare it). */
  private token = 0;
  /** The last refusal (diagnostics only). */
  lastRefusal: NarrationRefusal | null = null;

  constructor(private readonly opts: NarratorOptions) {}

  setPrefs(p: AudioPrefs): void {
    this.prefs = p;
    if (narrationVolume(p) === 0) this.stop();
  }

  /** The first user gesture happened (autoplay rules); later calls do nothing. */
  gesture(): void {
    this.gestured = true;
  }

  /** Audio held (page hidden, an arcade host's pause): stop and drop; nothing is spoken until released. */
  hold(on: boolean): void {
    this.held = on;
    if (on) this.stop();
  }

  /** The phrase being spoken now (null: none). */
  get current(): PhraseId | null {
    return this.speaking;
  }

  get waiting(): readonly PhraseId[] {
    return this.queue;
  }

  /**
   * Ask for phrase `id`. Returns true when it was spoken now or will be spoken after the current one.
   * Anything that is not one of the 16 phrase ids is refused (no free text ever reaches the voice).
   */
  speak(id: PhraseId): boolean {
    const refusal = this.refusal(id);
    this.lastRefusal = refusal;
    if (refusal !== null) return false;
    this.lastAt.set(id, this.opts.now());
    if (this.speaking !== null) {
      this.queue.push(id);
      return true;
    }
    return this.start(id);
  }

  private refusal(id: PhraseId): NarrationRefusal | null {
    if (!isPhraseId(id)) return 'unknown';
    if (this.prefs.narration !== true) return 'off';
    if (narrationVolume(this.prefs) <= 0) return 'silent';
    if (!this.gestured) return 'noGesture';
    if (this.held) return 'held';
    const h = this.opts.host();
    if (!h?.speechSynthesis || !h.SpeechSynthesisUtterance) return 'noVoice';
    const last = this.lastAt.get(id);
    if (last !== undefined && this.opts.now() - last < NARRATION_REPEAT_MS) return 'repeat';
    if (this.speaking === id || this.queue.includes(id)) return 'queued';
    if (this.speaking !== null && this.queue.length >= NARRATION_QUEUE_MAX) return 'full';
    return null;
  }

  private start(id: PhraseId): boolean {
    const h = this.opts.host();
    const synth = h?.speechSynthesis;
    const Utter = h?.SpeechSynthesisUtterance;
    if (!synth || !Utter) return false;
    let u: SpeechUtteranceLike;
    try {
      u = new Utter(PHRASES[id]);
      u.volume = narrationVolume(this.prefs);
      u.rate = 1;
      u.lang = 'en';
    } catch {
      return false;
    }
    this.speaking = id;
    const token = ++this.token;
    // An utterance cancelled by stop() may still report its end later: only the current one counts.
    const done = () => {
      if (this.token !== token || this.speaking === null) return;
      this.finish();
    };
    u.onend = done;
    u.onerror = done;
    const later = this.opts.later ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
    this.timer = later(done, UTTERANCE_TIMEOUT_MS);
    try {
      synth.speak(u);
    } catch {
      this.finish();
      return false;
    }
    return true;
  }

  private finish(): void {
    this.clearTimer();
    this.speaking = null;
    const next = this.queue.shift();
    if (next === undefined) return;
    if (this.held || narrationVolume(this.prefs) === 0) {
      this.queue = [];
      return;
    }
    this.start(next);
  }

  private clearTimer(): void {
    if (this.timer !== null) (this.opts.clearLater ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>)))(this.timer);
    this.timer = null;
  }

  /** Cancel what is speaking and drop the queue. */
  stop(): void {
    this.queue = [];
    if (this.speaking === null) return;
    this.speaking = null;
    this.token++;
    this.clearTimer();
    try {
      this.opts.host()?.speechSynthesis?.cancel();
    } catch {
      /* nothing to cancel */
    }
  }
}

function pageHost(): SpeechHost | null {
  return typeof window === 'undefined' ? null : (window as unknown as SpeechHost);
}

/** The app's one narrator (fed by src/audio/cues.ts: settings, the first gesture, hold and release). */
export const narrator = new Narrator({ host: pageHost, now: () => performance.now() });

/** Speak one of the 16 phrases if narration is on and allowed now (see the header). */
export function speakPhrase(id: PhraseId): boolean {
  return narrator.speak(id);
}

/** Whether this device offers speech at all (Settings says so when it does not). */
export function speechAvailable(host: SpeechHost | null = pageHost()): boolean {
  return !!host?.speechSynthesis && !!host.SpeechSynthesisUtterance;
}
