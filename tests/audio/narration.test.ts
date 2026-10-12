/**
 * P4.9 narration (UX §8.3; D08 §09) and sound polish.
 *
 * The narrator (src/audio/narration.ts) is driven with a fake SpeechSynthesis and an injected clock:
 *   • only the 16 fixed phrase texts ever reach SpeechSynthesis (a free-text id is refused);
 *   • off by default; muted (or voice volume 0) → volume 0 and nothing spoken;
 *   • nothing before the first gesture, nothing while audio is held, and holding drops what waits;
 *   • one utterance at a time (a new phrase cancels nothing and waits), the same phrase not within 10 s;
 *   • no speechSynthesis → silent, no error;
 *   • the app's narrator follows src/audio/cues.ts (settings, first gesture, suspend/resume).
 * Sound polish: the three cues D08 names (placement = drop, division, discovery card) are distinct by
 * their patch definitions; world cues stay capped at 4 per second with coalescing (D-0064); every cue
 * keeps a visible equivalent in the cues.ts list.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AUDIO_DEFAULTS, audioPrefsOf, type AudioPrefs } from '@audio/mix';
import {
  isPhraseId,
  NARRATION_QUEUE_MAX,
  NARRATION_REPEAT_MS,
  narrationVolume,
  Narrator,
  PHRASE_IDS,
  PHRASES,
  UTTERANCE_TIMEOUT_MS,
  type PhraseId,
  type SpeechHost,
  type SpeechUtteranceLike,
} from '@audio/narration';
import { CUE_IDS, PATCHES, patchSeconds, WORLD_CUES, coalesceMsOf, isWorldCue, type CuePatch } from '@audio/patches';
import { CueRateLimiter } from '@audio/rateLimiter';

const ROOT = join(__dirname, '..', '..');

/** The 16 phrases exactly as UX §8.3 lists them, in its order. */
const UX_PHRASES = [
  'Press play',
  'Pause',
  'Add life',
  'Add food',
  'Look closely',
  'Eating sugar',
  'Needs more food',
  'Needs room',
  'Resting',
  'A cell split',
  'Follow this family',
  'The feeder is empty',
  'The light is on',
  'The light is off',
  'Saved',
  'Undo rewinds time',
];

class FakeUtterance implements SpeechUtteranceLike {
  volume = 1;
  rate?: number;
  lang?: string;
  onend: ((this: unknown, ev: unknown) => unknown) | null = null;
  onerror: ((this: unknown, ev: unknown) => unknown) | null = null;
  constructor(public text: string) {}
}

interface Fake {
  readonly host: SpeechHost;
  readonly spoken: SpeechUtteranceLike[];
  cancels: number;
  /** The device finishes the utterance it is speaking. */
  end(): void;
}

function fakeSpeech(): Fake {
  const spoken: SpeechUtteranceLike[] = [];
  const f: Fake = {
    spoken,
    cancels: 0,
    host: {
      speechSynthesis: {
        speak: (u) => void spoken.push(u),
        cancel: () => void f.cancels++,
      },
      SpeechSynthesisUtterance: FakeUtterance,
    },
    end: () => {
      const u = spoken[spoken.length - 1];
      u?.onend?.call(u, {});
    },
  };
  return f;
}

const ON: AudioPrefs = { ...AUDIO_DEFAULTS, narration: true };

function setup(prefs: AudioPrefs = ON, host: SpeechHost | null = null) {
  const fake = fakeSpeech();
  let t = 1000;
  const timers: (() => void)[] = [];
  const n = new Narrator({
    host: () => (host === null ? fake.host : host),
    now: () => t,
    later: (fn) => {
      timers.push(fn);
      return timers.length;
    },
    clearLater: () => undefined,
  });
  n.setPrefs(prefs);
  return {
    n,
    fake,
    advance: (ms: number) => void (t += ms),
    fireTimers: () => timers.splice(0).forEach((fn) => fn()),
    texts: () => fake.spoken.map((u) => u.text),
  };
}

describe('the 16 phrases (UX §8.3)', () => {
  it('are exactly the spec phrases, with stable ids, and none holds a digit', () => {
    expect(PHRASE_IDS).toHaveLength(16);
    expect(PHRASE_IDS.map((id) => PHRASES[id])).toEqual(UX_PHRASES);
    for (const id of PHRASE_IDS) expect(PHRASES[id]).not.toMatch(/\d/);
    expect(isPhraseId('pause')).toBe(true);
    expect(isPhraseId('Pause')).toBe(false);
    expect(isPhraseId('toString')).toBe(false);
  });
});

describe('Narrator', () => {
  it('only phrase ids reach SpeechSynthesis: free text, names and numbers are refused', () => {
    const s = setup();
    s.n.gesture();
    for (const bad of ['Hello there', 'Saved “Sprinter Garden”', '12 cells', 'constructor', '__proto__', '']) {
      expect(s.n.speak(bad as PhraseId)).toBe(false);
      expect(s.n.lastRefusal).toBe('unknown');
    }
    expect(s.fake.spoken).toHaveLength(0);
    for (const id of PHRASE_IDS) {
      s.n.speak(id);
      s.fake.end();
    }
    expect(s.texts()).toEqual(UX_PHRASES);
    for (const t of s.texts()) expect(Object.values(PHRASES)).toContain(t);
  });

  it('is off by default (older settings without the field load with it off)', () => {
    expect(AUDIO_DEFAULTS.narration).toBe(false);
    expect(audioPrefsOf({}).narration).toBe(false);
    expect(audioPrefsOf({ narration: true }).narration).toBe(true);
    const s = setup(AUDIO_DEFAULTS);
    s.n.gesture();
    expect(s.n.speak('pause')).toBe(false);
    expect(s.n.lastRefusal).toBe('off');
    expect(s.fake.spoken).toHaveLength(0);
  });

  it('speaks at the voice bus volume; muted (or voice 0) → volume 0 and nothing is spoken', () => {
    expect(narrationVolume({ ...ON, voiceVolume: 0.5 })).toBeCloseTo(0.5, 12);
    expect(narrationVolume({ ...ON, muted: true })).toBe(0);
    expect(narrationVolume({ ...ON, voiceVolume: 0 })).toBe(0);
    expect(narrationVolume({ ...AUDIO_DEFAULTS, voiceVolume: 1 })).toBe(0);
    const s = setup({ ...ON, voiceVolume: 0.5 });
    s.n.gesture();
    expect(s.n.speak('pause')).toBe(true);
    expect(s.fake.spoken[0]!.volume).toBeCloseTo(0.5, 12);
    const m = setup({ ...ON, muted: true });
    m.n.gesture();
    expect(m.n.speak('pause')).toBe(false);
    expect(m.n.lastRefusal).toBe('silent');
    expect(m.fake.spoken).toHaveLength(0);
  });

  it('muting while speaking cancels it and drops the queue', () => {
    const s = setup();
    s.n.gesture();
    s.n.speak('pause');
    s.n.speak('saved');
    s.n.setPrefs({ ...ON, muted: true });
    expect(s.fake.cancels).toBe(1);
    expect(s.n.current).toBeNull();
    expect(s.n.waiting).toEqual([]);
  });

  it('says nothing before the first user gesture', () => {
    const s = setup();
    expect(s.n.speak('pause')).toBe(false);
    expect(s.n.lastRefusal).toBe('noGesture');
    s.n.gesture();
    expect(s.n.speak('pause')).toBe(true);
    expect(s.texts()).toEqual(['Pause']);
  });

  it('says nothing while audio is held; holding cancels and drops what waits (nothing old is said later)', () => {
    const s = setup();
    s.n.gesture();
    s.n.speak('addFood');
    s.n.speak('saved');
    s.n.hold(true);
    expect(s.fake.cancels).toBe(1);
    expect(s.n.speak('pause')).toBe(false);
    expect(s.n.lastRefusal).toBe('held');
    s.fake.end(); // a late end from the cancelled utterance starts nothing
    s.n.hold(false);
    expect(s.texts()).toEqual(['Add food']);
    s.advance(NARRATION_REPEAT_MS);
    expect(s.n.speak('undoRewinds')).toBe(true);
    expect(s.texts()).toEqual(['Add food', 'Undo rewinds time']);
  });

  it('one utterance at a time: a new phrase cancels nothing and waits for the end', () => {
    const s = setup();
    s.n.gesture();
    expect(s.n.speak('pause')).toBe(true);
    expect(s.n.speak('addFood')).toBe(true);
    expect(s.n.speak('saved')).toBe(true);
    expect(NARRATION_QUEUE_MAX).toBe(2);
    expect(s.n.speak('addLife')).toBe(false); // a third waiting phrase is dropped, never a backlog
    expect(s.n.lastRefusal).toBe('full');
    expect(s.texts()).toEqual(['Pause']);
    expect(s.fake.cancels).toBe(0);
    s.fake.end();
    expect(s.texts()).toEqual(['Pause', 'Add food']);
    s.fake.end();
    expect(s.texts()).toEqual(['Pause', 'Add food', 'Saved']);
    s.fake.end();
    expect(s.n.current).toBeNull();
  });

  it('a device that never reports the end does not block: the next phrase starts after the timeout', () => {
    expect(UTTERANCE_TIMEOUT_MS).toBeGreaterThan(0);
    const s = setup();
    s.n.gesture();
    s.n.speak('pause');
    s.n.speak('saved');
    s.fireTimers();
    expect(s.texts()).toEqual(['Pause', 'Saved']);
  });

  it('the same phrase is not spoken again within 10 s', () => {
    expect(NARRATION_REPEAT_MS).toBe(10_000);
    const s = setup();
    s.n.gesture();
    expect(s.n.speak('cellSplit')).toBe(true);
    s.fake.end();
    s.advance(9_999);
    expect(s.n.speak('cellSplit')).toBe(false);
    expect(s.n.lastRefusal).toBe('repeat');
    s.advance(1);
    expect(s.n.speak('cellSplit')).toBe(true);
    expect(s.texts()).toEqual(['A cell split', 'A cell split']);
  });

  it('without speechSynthesis (or without a page) it is silent and never throws', () => {
    for (const host of [{} as SpeechHost, { speechSynthesis: { speak: () => undefined, cancel: () => undefined } } as SpeechHost]) {
      const s = setup(ON, host);
      s.n.gesture();
      expect(() => s.n.speak('pause')).not.toThrow();
      expect(s.n.lastRefusal).toBe('noVoice');
    }
    const none = new Narrator({ host: () => null, now: () => 0 });
    none.setPrefs(ON);
    none.gesture();
    expect(() => none.speak('saved')).not.toThrow();
    expect(none.speak('saved')).toBe(false);
    // A device whose speak throws: refused, nothing stuck.
    const broken = setup(ON, {
      speechSynthesis: {
        speak: () => {
          throw new Error('no voice');
        },
        cancel: () => undefined,
      },
      SpeechSynthesisUtterance: FakeUtterance,
    });
    broken.n.gesture();
    expect(broken.n.speak('pause')).toBe(false);
    expect(broken.n.current).toBeNull();
  });
});

describe('the app narrator follows src/audio/cues.ts (settings, first gesture, hold)', () => {
  const g = globalThis as unknown as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it('settings → on; nothing before initAudio (the first gesture); nothing while suspended', async () => {
    const fake = fakeSpeech();
    g.window = fake.host; // no AudioContext: Web Audio unavailable, narration still works
    const cues = await import('@audio/cues');
    const { speakPhrase } = await import('@audio/narration');
    cues.setAudioPrefs({ ...AUDIO_DEFAULTS, narration: true });
    expect(speakPhrase('pause')).toBe(false); // no gesture yet
    expect(cues.initAudio()).toBe(false); // no Web Audio here, but the gesture is recorded
    expect(speakPhrase('pause')).toBe(true);
    cues.suspendAudio();
    expect(fake.cancels).toBe(1);
    expect(speakPhrase('saved')).toBe(false);
    cues.resumeAudio();
    expect(speakPhrase('saved')).toBe(true);
    fake.end();
    cues.setAudioPrefs({ ...AUDIO_DEFAULTS, narration: false });
    expect(speakPhrase('addFood')).toBe(false);
    expect(fake.spoken.map((u) => u.text)).toEqual(['Pause', 'Saved']);
  });
});

describe('sound polish: the cues D08 names are distinct (placement, division, discovery card)', () => {
  /** A cue's pitch contour: a glide, a sequence of notes, or one fixed pitch. */
  const contour = (p: CuePatch) => (p.pitch.notes && p.pitch.notes.length > 1 ? 'notes' : p.pitch.to !== undefined ? 'glide' : 'fixed');
  const source = (p: CuePatch) => (p.source.kind === 'noise' ? 'noise' : `osc:${p.source.wave}`);
  const semitones = (a: number, b: number) => Math.abs(12 * Math.log2(a / b));

  it('drop, division and discovery differ pairwise in source or contour, start pitch (≥ 3 semitones) and length (≥ 1.5×)', () => {
    const three = [PATCHES.drop, PATCHES.division, PATCHES.discovery];
    for (let i = 0; i < three.length; i++) {
      for (let j = i + 1; j < three.length; j++) {
        const a = three[i]!;
        const b = three[j]!;
        const label = `${a.cueId}/${b.cueId}`;
        expect(source(a) !== source(b) || contour(a) !== contour(b), label).toBe(true);
        expect(semitones(a.pitch.hz, b.pitch.hz), label).toBeGreaterThanOrEqual(3);
        const la = patchSeconds(a);
        const lb = patchSeconds(b);
        expect(Math.max(la, lb) / Math.min(la, lb), label).toBeGreaterThanOrEqual(1.5);
      }
    }
    // As defined: a falling sine drop, a short noise click, a two-note sine chime.
    expect([source(PATCHES.drop), contour(PATCHES.drop)]).toEqual(['osc:sine', 'glide']);
    expect([source(PATCHES.division), contour(PATCHES.division)]).toEqual(['noise', 'fixed']);
    expect([source(PATCHES.discovery), contour(PATCHES.discovery)]).toEqual(['osc:sine', 'notes']);
  });

  it('world cues stay at most 4 per second, and division repeats coalesce for 5 s (D-0064)', () => {
    let t = 0;
    const lim = new CueRateLimiter({ now: () => t, isWorld: isWorldCue, coalesceOf: coalesceMsOf });
    let played = 0;
    let requests = 0;
    for (let k = 0; k < 40; k++) {
      t = k * 25; // 40 requests in one second, cycling every world cue
      requests++;
      if (lim.request(WORLD_CUES[k % WORLD_CUES.length]!).play) played++;
    }
    expect(played).toBeLessThanOrEqual(4);
    expect(lim.playsInWindow().length).toBeLessThanOrEqual(4);
    const counted = lim.playsInWindow().reduce((n, p) => n + p.count, 0) + lim.suppressed;
    expect(counted).toBe(requests);
    // Division: one click, then nothing new for 5 s however many split.
    t = 10_000;
    expect(lim.request('division').play).toBe(true);
    t = 14_999;
    expect(lim.request('division', 30).play).toBe(false);
    t = 15_000;
    expect(lim.request('division').play).toBe(true);
    // UI cues (placement, select, save, card) bypass the limiter.
    for (let k = 0; k < 10; k++) expect(lim.request('drop').play).toBe(true);
  });

  it('every cue keeps a visible equivalent in the cues.ts list ("Silence must preserve meaning")', () => {
    const src = readFileSync(join(ROOT, 'src', 'audio', 'cues.ts'), 'utf8');
    const head = src.slice(0, src.indexOf('*/'));
    expect(head).toContain('Silence must preserve meaning');
    for (const id of CUE_IDS) expect(head, id).toMatch(new RegExp(`\\*\\s+${id}\\s+\\S`));
  });
});
