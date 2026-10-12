/**
 * P4.9 narration wired to the UI (src/ui/narration.ts wireNarration; wave 6b integration items):
 *
 * - a Lab command reaches the onDishCommand listeners through the one helper sendCommand uses
 *   (src/ui/state.ts reportDishCommand, called by LabView sendLabCommand): an accepted food object speaks
 *   "Add food"; a refused one speaks nothing; the P4.3 prompt machine, which resolves Feed only on a
 *   deposit, is left exactly as it was by a placeObject;
 * - "A cell split" is spoken once for one division: closing the inspector and opening it again on the same
 *   record stays silent;
 * - Space typed into a text field is not a Pause request; Space elsewhere on the running dish is.
 *
 * Node environment: a minimal document and window stand in for the capture listeners, the speech call is
 * recorded (the narrator's own rules are tested in tests/audio/narration.test.ts), and the worker client
 * is a stand-in that answers each command with a chosen result.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommandPayload, CommandResult } from '@sim/commands';
import type { DishInfo } from '@worker/protocol';

const h = vi.hoisted(() => {
  const listeners: Record<string, (e: unknown) => void> = {};
  const target = { addEventListener: (type: string, fn: (e: unknown) => void) => void (listeners[type] = fn), removeEventListener: () => undefined };
  (globalThis as Record<string, unknown>).document ??= target;
  (globalThis as Record<string, unknown>).window ??= target;
  // The app's own client (state.ts getClient, used by its view sync) gets a worker that never answers.
  (globalThis as Record<string, unknown>).Worker ??= class {
    onmessage: unknown = null;
    postMessage(): void {}
    terminate(): void {}
  };
  const answer: CommandResult = { accepted: 1, rejected: 0 };
  return { listeners, spoken: [] as string[], answer, sent: [] as CommandPayload[] };
});

vi.mock('@audio/narration', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  speakPhrase: (id: string) => {
    h.spoken.push(id);
    return true;
  },
}));

vi.mock('../../src/ui/state', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getClient: () => ({
    command: (_dishId: string, _id: string, payload: CommandPayload) => {
      h.sent.push(payload);
      return Promise.resolve(h.answer);
    },
  }),
}));

import { initialPrompts, promptReduce, type PromptInput } from '../../src/ui/prompts';
import { wireNarration } from '../../src/ui/narration';
import { dishInfo, inspector, meta, onDishCommand, route, selection, settings, sheet } from '../../src/ui/state';
import { sendLabCommand } from '../../src/ui/views/LabView';

const FOOD: CommandPayload = { kind: 'placeObject', materialId: 'STARCH_PELLET', x: 64, y: 64 };

beforeAll(() => {
  settings.value = { ...settings.value, narration: true };
  route.value = { name: 'dish' };
  dishInfo.value = { dishId: 'd1', materials: [] } as unknown as DishInfo;
  meta.value = { speed: 0 } as unknown as typeof meta.value;
  wireNarration();
});

beforeEach(() => {
  h.spoken.length = 0;
  h.sent.length = 0;
});

describe('a Lab command reaches narration and the prompt machine through the one path', () => {
  it('an accepted food object speaks "Add food"; a refused one speaks nothing; the prompt machine ignores it', async () => {
    // What the prompt machine is fed (src/ui/views/NoticeHost.tsx wire: one input per answered command).
    const fed: PromptInput[] = [];
    const off = onDishCommand((_dishId, payload, res) => fed.push({ kind: 'command', command: payload.kind, accepted: res.accepted }));

    h.answer = { accepted: 1, rejected: 0 };
    await sendLabCommand(FOOD);
    expect(h.sent).toEqual([FOOD]);
    expect(h.spoken).toEqual(['addFood']);

    h.answer = { accepted: 0, rejected: 1, note: 'occupied' };
    await sendLabCommand(FOOD);
    expect(h.spoken).toEqual(['addFood']); // nothing more: nothing was placed

    expect(fed).toEqual([
      { kind: 'command', command: 'placeObject', accepted: 1 },
      { kind: 'command', command: 'placeObject', accepted: 0 },
    ]);
    // The P4.3 prompt machine resolves Feed only on a deposit: a placeObject leaves it exactly as it was.
    const start = initialPrompts({ garden: true, startTick: 0, sprinter: 1, sugarOnly: true, arrival: false });
    expect(fed.reduce(promptReduce, start)).toEqual(start);
    // (The same answer for a deposit does change it, so the comparison can fail.)
    expect(promptReduce(start, { kind: 'command', command: 'deposit', accepted: 1 })).not.toEqual(start);
    off();
  });
});

describe('one division is spoken at most once', () => {
  it('closing the inspector and opening it again on the same divided organism stays silent', () => {
    selection.value = { kind: 'entity', birthId: 7 };
    inspector.value = { kind: 'gone', gone: { birthId: 7, deathTick: 90, cause: 0, divided: true, children: [8, 9] } };
    sheet.value = 'inspect';
    expect(h.spoken).toEqual(['cellSplit']);
    sheet.value = 'none';
    sheet.value = 'inspect';
    sheet.value = 'none';
    sheet.value = 'inspect';
    expect(h.spoken).toEqual(['cellSplit']);
    // Another division (another organism's record) is new.
    selection.value = { kind: 'entity', birthId: 8 };
    inspector.value = { kind: 'gone', gone: { birthId: 8, deathTick: 140, cause: 0, divided: true, children: [10, 11] } };
    expect(h.spoken).toEqual(['cellSplit', 'cellSplit']);
    sheet.value = 'none';
    selection.value = null;
    inspector.value = null;
  });
});

describe('Space and Pause', () => {
  const field = { closest: (q: string) => (q.includes('textarea') ? {} : null), isContentEditable: false };
  const canvas = { closest: () => null, isContentEditable: false };

  it('Space typed into a text field marks no Pause request; Space on the dish does', () => {
    meta.value = { speed: 2 } as unknown as typeof meta.value;
    h.listeners.keydown!({ key: ' ', target: field });
    meta.value = { speed: 0 } as unknown as typeof meta.value; // the dish pauses (for another reason)
    expect(h.spoken).toEqual([]);

    meta.value = { speed: 2 } as unknown as typeof meta.value;
    h.listeners.keydown!({ key: ' ', target: canvas });
    meta.value = { speed: 0 } as unknown as typeof meta.value;
    expect(h.spoken).toEqual(['pause']);
  });
});
