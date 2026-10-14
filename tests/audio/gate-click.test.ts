/**
 * Phase 5 wave 12 (structures-art-audio): the gate_click cue (UX §8.1 "soft gate clicks"; D02 "Audio adds soft
 * gate clicks"; src/audio/patches.ts, cues.ts; src/ui/panels/GateSheet.tsx).
 *   - 'gate_click' is appended to CUE_IDS after the nine earlier ids (their order kept); it is a UI cue, not a
 *     world cue (no budget, no coalescing); its patch is a soft short tick: attack ≤ 3 ms, ≤ 80 ms in all, at
 *     least 4 dB under 'select'.
 *   - Call sites (PROPOSED DECISION in the wave 12 report: once per intentional gate action, never from the
 *     tracer): opening the gate sheet plays it once per open event (a remount does not replay it); an accepted
 *     shutter Open / Close plays it; a refused one plays no gate_click, and sendLabCommand's placementCue(0)
 *     sounds placement_error for it. The tracer imports no audio.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Cues from '@audio/cues';
import type { CommandPayload, CommandResult } from '../../src/sim/commands';

interface Held {
  played: string[];
  keyed: { id: string; played: boolean }[];
  placements: number[];
  answer: CommandResult | null;
  sent: CommandPayload[];
}

const h = vi.hoisted((): Held => {
  (globalThis as Record<string, unknown>).Worker ??= class {
    onmessage: unknown = null;
    postMessage(): void {}
    terminate(): void {}
  };
  return { played: [], keyed: [], placements: [], answer: { accepted: 1, rejected: 0 }, sent: [] };
});

vi.mock('@audio/cues', async (orig) => {
  const real: typeof Cues = await orig();
  return {
    ...real,
    playCue: (id: string): void => void h.played.push(id),
    playCueFor: (id: Parameters<typeof real.playCueFor>[0], key: unknown): boolean => {
      const played = real.playCueFor(id, key); // the real keyed rule (once per key)
      h.keyed.push({ id, played });
      return played;
    },
    placementCue: (n: number): void => void h.placements.push(n),
  };
});

vi.mock('../../src/ui/state', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClient: () => ({
    command: (_dishId: string, _id: string, payload: CommandPayload) => {
      h.sent.push(payload);
      return Promise.resolve(h.answer);
    },
  }),
}));

const { CUE_IDS, PATCHES, patchSeconds, WORLD_CUES, coalesceMsOf, isWorldCue } = await import('@audio/patches');
const { CueRateLimiter } = await import('@audio/rateLimiter');
const { EDGE_SHUTTER_CLOSED, EDGE_SHUTTER_OPEN } = await import('../../src/sim/barriers');
const { gateOpenCue, gateOpenEvent, openGateSheet, shutterCue, toggleShutter } = await import('../../src/ui/panels/GateSheet');
const { dishInfo, sheet } = await import('../../src/ui/state');

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('the gate_click cue', () => {
  it('is appended after the nine earlier ids, in their order', () => {
    expect([...CUE_IDS]).toEqual(['drop', 'placement_error', 'select', 'save', 'discovery', 'compare_result', 'division', 'card_open', 'wake', 'gate_click']);
  });

  it('is a UI cue: not a world cue, no coalescing, never limited', () => {
    expect(WORLD_CUES).not.toContain('gate_click');
    expect(isWorldCue('gate_click')).toBe(false);
    expect(coalesceMsOf('gate_click')).toBeUndefined();
    let t = 0;
    const lim = new CueRateLimiter({ now: () => t, isWorld: isWorldCue, coalesceOf: coalesceMsOf });
    for (let k = 0; k < 10; k++) {
      t = k * 10;
      expect(lim.request('gate_click').play).toBe(true);
    }
    expect(lim.playsInWindow()).toEqual([]);
  });

  it('is a soft short tick: attack ≤ 3 ms, ≤ 80 ms in all, ≥ 4 dB under select, through a band-pass', () => {
    const p = PATCHES.gate_click;
    expect(p.cueId).toBe('gate_click');
    expect(p.envelope.attack).toBeLessThanOrEqual(0.003);
    expect(patchSeconds(p)).toBeLessThanOrEqual(0.08);
    expect(p.gainDb).toBeLessThanOrEqual(PATCHES.select.gainDb - 4);
    expect(p.filter.type).toBe('bandpass');
    expect(p.source.kind === 'noise' || (p.source.kind === 'oscillator' && p.source.wave === 'sine')).toBe(true);
    expect(p.pitch.notes).toBeUndefined();
  });

  it('patches.ts names its meaning (no longer "deferred") and cues.ts lists its visible equivalent', () => {
    const patches = read('src', 'audio', 'patches.ts');
    expect(patches).not.toMatch(/gate_click` is deferred/);
    expect(patches).toMatch(/\*\s+gate_click\s+the player opened a gate/);
    const head = read('src', 'audio', 'cues.ts');
    expect(head.slice(0, head.indexOf('*/'))).toMatch(/\*\s+gate_click\s+the gate inspector sheet opening/);
  });
});

describe('gate_click call sites (GateSheet.tsx)', () => {
  beforeEach(() => {
    h.played.length = 0;
    h.keyed.length = 0;
    h.placements.length = 0;
    h.sent.length = 0;
    dishInfo.value = { dishId: 'd1', materials: [] } as never;
  });

  it('opening a gate sheet plays gate_click once per open; a remount of the same open sheet does not replay it', () => {
    openGateSheet(5);
    expect(sheet.value).toBe('gate');
    expect(gateOpenCue()).toBe(true); // the sheet mounts
    expect(gateOpenCue()).toBe(false); // remount (e.g. a re-render with the same open event)
    expect(gateOpenCue(gateOpenEvent.value)).toBe(false);
    openGateSheet(5); // the player opens it again: a new event
    expect(gateOpenCue()).toBe(true);
    expect(h.keyed.filter((k) => k.id === 'gate_click' && k.played).length).toBe(2);
    expect(gateOpenCue(null)).toBe(false); // no open event (the sheet shown some other way): no cue
  });

  it('an accepted shutter toggle plays gate_click and no drop (the setDevice command, one per tap)', async () => {
    h.answer = { accepted: 1, rejected: 0 };
    await toggleShutter({ id: 7, code: EDGE_SHUTTER_CLOSED });
    expect(h.sent).toEqual([{ kind: 'setDevice', id: 7, open: true }]);
    expect(h.played).toEqual(['gate_click']);
    await toggleShutter({ id: 7, code: EDGE_SHUTTER_OPEN });
    expect(h.sent[1]).toEqual({ kind: 'setDevice', id: 7, open: false });
    expect(h.played).toEqual(['gate_click', 'gate_click']);
    // Wave 12 lead fix: no drop under the soft click (sendLabCommand skips placementCue for an accepted shutter toggle).
    expect(h.placements).toEqual([]);
  });

  it('a refused toggle plays no gate_click; sendLabCommand sounds placement_error (placementCue(0))', async () => {
    h.answer = { accepted: 0, rejected: 1, note: 'not a shutter' };
    await toggleShutter({ id: 7, code: EDGE_SHUTTER_CLOSED });
    expect(h.played).not.toContain('gate_click');
    expect(h.placements).toEqual([0]);
    // placementCue(0) is placement_error (cues.ts), the refusal sound every placement uses.
    expect(code(read('src', 'audio', 'cues.ts'))).toMatch(/playCue\(accepted > 0 \? 'drop' : 'placement_error'\)/);
    // No answer (the dish is gone): silence.
    h.answer = null;
    await toggleShutter({ id: 7, code: EDGE_SHUTTER_CLOSED });
    expect(h.played).toEqual([]);
    shutterCue(null);
    shutterCue({ accepted: 0 });
    expect(h.played).toEqual([]);
  });

  it('the sheet wires them: the open cue in an effect keyed on the open event, the shutter button through toggleShutter', () => {
    const src = code(read('src', 'ui', 'panels', 'GateSheet.tsx'));
    expect(src).toMatch(/useEffect\(\(\) => \{\s*gateOpenCue\(openEvent\);\s*\}, \[openEvent\]\)/);
    expect(src).toMatch(/onClick=\{\(\) => void toggleShutter\(e\)\}/);
  });

  it('the tracer never sounds: gateTracer.ts and renderer.ts import nothing from src/audio', () => {
    for (const f of ['gateTracer.ts', 'renderer.ts', 'gateBadges.ts']) {
      const src = code(read('src', 'render', f));
      for (const m of src.matchAll(/from '([^']+)'/g)) expect(m[1], f).not.toMatch(/audio/);
      expect(src, f).not.toMatch(/playCue|gate_click/);
    }
  });
});
