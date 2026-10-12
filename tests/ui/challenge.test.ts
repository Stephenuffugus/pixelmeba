/**
 * P4.8c custom challenges in the UI (src/ui/challenge.ts, src/ui/strings/challenge.ts; SPEC §13.5; D09 line 134):
 *
 * - the restrictions summary a player reads before Start, word for word;
 * - "Move material across a gate" is unavailable on a dish without a gate structure (every v1.0 dish), with
 *   "This dish has no gate to measure.";
 * - the editor emits typed values only: ids picked from the dish's own lists and numbers from number fields;
 *   anything else is refused (never passed on), and the name never reaches the objective.
 */
import { describe, expect, it, vi } from 'vitest';
import { challengeInputProblem, CHALLENGE_TOOL_GROUPS } from '../../src/persistence/notebookChallenges';
import type { DishInfo } from '../../src/worker/protocol';

// state.ts is replaced by a small stand-in (the real one starts a Worker and audio), as tests/ui/try-dish.test.ts does.
vi.mock('../../src/ui/state', async () => {
  const { signal } = await import('@preact/signals');
  const fail = () => {
    throw new Error('no client in this test');
  };
  return {
    dishInfo: signal<unknown>(null),
    sheet: signal<string>('none'),
    meta: signal<unknown>(null),
    route: signal<unknown>({ name: 'dish' }),
    toast: signal<string | null>(null),
    showToast: () => undefined,
    autosave: () => Promise.resolve(true),
    getClient: fail,
    enterStartedDish: fail,
    freshDishId: () => 'fresh',
    namedSlots: fail,
    replaceForTry: fail,
    saveTextFile: fail,
    saveToSlot: fail,
    select: () => undefined,
    getRenderer: () => null,
    dishClock: (t: number) => String(t),
  };
});

const { draftToInput, gateAvailable, newDraft } = await import('../../src/ui/challenge');
const { CHALLENGE_TEXT, objectiveLine, restrictionsSummary } = await import('../../src/ui/strings/challenge');

const GARDEN: Pick<DishInfo, 'speciesIds' | 'fieldIds' | 'structureIds'> = {
  speciesIds: ['B01', 'B02', 'F01'],
  fieldIds: ['sugar', 'sugarN', 'starch', 'oxygen', 'co2', 'broth', 'eStarch'],
  structureIds: ['BEAD', 'STONE', 'WALL'],
};

describe('custom challenge texts and editor values', () => {
  it('the restrictions summary says what is allowed, the limit, that looking is free and that limits stay inside the challenge', () => {
    expect(restrictionsSummary({ allowedTools: ['feed', 'addLife'], commandBudget: 10 })).toBe(
      'Allowed: Add Life, Feed. Up to 10 actions. Inspecting and looking are always free. These limits apply only inside this challenge.',
    );
    expect(restrictionsSummary({ allowedTools: ['feed'], commandBudget: 1 })).toBe(
      'Allowed: Feed. Up to 1 action. Inspecting and looking are always free. These limits apply only inside this challenge.',
    );
    expect(restrictionsSummary({ allowedTools: [...CHALLENGE_TOOL_GROUPS], commandBudget: null })).toBe(
      'Allowed: every tool. No action limit. Inspecting and looking are always free. These limits apply only inside this challenge.',
    );
    expect(restrictionsSummary({ allowedTools: [], commandBudget: null })).toMatch(/^Allowed: no tools, only looking\. No action limit\./);
  });

  it('fix round 1: with a limit, the Lid and Evolution settings are named as never using an action (D07 "Configure and inspect are free")', () => {
    expect(restrictionsSummary({ allowedTools: ['feed', 'lid'], commandBudget: 3 })).toBe(
      'Allowed: Feed, Lid. Up to 3 actions. Changing the Lid never uses an action. Inspecting and looking are always free. These limits apply only inside this challenge.',
    );
    expect(restrictionsSummary({ allowedTools: ['lid', 'evolution', 'feed'], commandBudget: 2 })).toContain('Changing the Lid or Evolution settings never uses an action.');
    expect(restrictionsSummary({ allowedTools: ['lid', 'evolution'], commandBudget: null })).not.toContain('never uses an action');
    expect(CHALLENGE_TEXT.budgetHint).toContain('Lid and Evolution settings never count');
  });

  it('a transfer goal is unavailable on a dish without a gate: it is disabled and never emitted', () => {
    expect(gateAvailable(GARDEN)).toBe(false);
    expect(gateAvailable(null)).toBe(false);
    expect(gateAvailable({ structureIds: ['BEAD', 'S01'] })).toBe(true); // a Phase 5 gate structure id
    const r = draftToInput({ ...newDraft(GARDEN), type: 'transferAcrossGate' }, GARDEN);
    expect(r).toEqual({ ok: false, message: CHALLENGE_TEXT.noGate });
    expect(CHALLENGE_TEXT.noGate).toBe('This dish has no gate to measure.');
  });

  it('the defaults: keep the first kind alive for 60 s, every tool, no limit, 180 s turns', () => {
    const r = draftToInput(newDraft(GARDEN), GARDEN);
    expect(r).toEqual({
      ok: true,
      input: {
        name: 'My challenge',
        objective: { type: 'keepSpeciesAlive', params: { species: 'B01' }, durationSeconds: 60 },
        allowedTools: [...CHALLENGE_TOOL_GROUPS],
        commandBudget: null,
        horizonSeconds: 180,
        region: { kind: 'dish' },
      },
    });
  });

  it('only typed values leave the editor: list ids, numbers, and a name kept out of the objective', () => {
    const base = newDraft(GARDEN);
    const name = 'Feed only <script>alert(1)</script>\u0007';
    const ok = draftToInput({ ...base, name, type: 'fieldInRange', field: 'oxygen', min: '0.5', max: '2', durationSeconds: '30', region: 'topLeft', allowedTools: ['lid', 'feed'], budget: '7' }, GARDEN);
    expect(ok.ok).toBe(true);
    if (!ok.ok) return;
    expect(ok.input.objective).toEqual({ type: 'fieldInRange', params: { field: 'oxygen', min: 0.5, max: 2 }, durationSeconds: 30 });
    expect(ok.input.region).toEqual({ kind: 'quarter', id: 'topLeft' });
    expect(ok.input.allowedTools).toEqual(['feed', 'lid']); // catalog order, no duplicates
    expect(ok.input.commandBudget).toBe(7);
    expect(ok.input.name).toBe('Feed only <script>alert(1)</script>'); // cleaned, only displayed
    expect(JSON.stringify(ok.input.objective)).not.toContain('script');
    for (const v of Object.values(ok.input.objective.params)) expect(typeof v === 'number' || ['oxygen'].includes(v)).toBe(true);
    expect(challengeInputProblem(ok.input)).toBeNull();
    // A region only measures a level: another goal is the whole dish.
    const keep = draftToInput({ ...base, region: 'topLeft' }, GARDEN);
    expect(keep.ok && keep.input.region).toEqual({ kind: 'dish' });

    // Anything not from a list, or not a plain number, is refused (never passed on).
    const refused = [
      { ...base, species: 'B01; drop' },
      { ...base, species: 'Z99' },
      { ...base, durationSeconds: '1e3' },
      { ...base, durationSeconds: '60s' },
      { ...base, durationSeconds: '0' },
      { ...base, durationSeconds: '600' }, // longer than the 180 s turn
      { ...base, type: 'biomassThreshold' as const, threshold: 'Infinity' },
      { ...base, type: 'biomassThreshold' as const, threshold: '-5' },
      { ...base, type: 'fieldInRange' as const, field: 'v01' },
      { ...base, type: 'fieldInRange' as const, field: 'oxygen', min: '3', max: '1' },
      { ...base, type: 'observeEvent' as const, event: 'custom' },
      { ...base, type: 'observeEvent' as const, event: 'conversion', enzyme: 'lipase' },
      { ...base, budget: '0' },
      { ...base, budget: '100' },
      { ...base, budget: '2.5' },
      { ...base, name: '   ' },
    ];
    for (const d of refused) expect(draftToInput(d, GARDEN).ok, JSON.stringify(d)).toBe(false);
    // An event goal: a conversion names an enzyme and no species; another event may name a kind from the list.
    expect(draftToInput({ ...base, type: 'observeEvent', event: 'conversion', enzyme: 'starch', species: 'B01' }, GARDEN)).toMatchObject({ ok: true, input: { objective: { params: { event: 'conversion', enzyme: 'starch' } } } });
    expect(draftToInput({ ...base, type: 'observeEvent', event: 'birth', species: '' }, GARDEN)).toMatchObject({ ok: true, input: { objective: { params: { event: 'birth' } } } });
  });

  it('the goal line is built from the typed values only', () => {
    const name = (id: string) => ({ B01: 'Sprinter' })[id] ?? id;
    expect(objectiveLine({ objective: { type: 'keepSpeciesAlive', params: { species: 'B01' }, durationSeconds: 60 }, region: { kind: 'dish' } }, name)).toBe('Keep at least one Sprinter alive for 60 s of dish time.');
    expect(objectiveLine({ objective: { type: 'fieldInRange', params: { field: 'oxygen', min: 0.5, max: 2 }, durationSeconds: 30 }, region: { kind: 'quarter', id: 'topLeft' } }, name)).toBe(
      'Keep oxygen between 0.5 and 2 in top-left quarter for 30 s of dish time.',
    );
  });
});
