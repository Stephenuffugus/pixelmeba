/**
 * P5.6 part 3: the seven play prompts as content (content/objectives; ObjectiveSchema.offerOnHabitats and
 * challengeTemplate; the validator's objectivePredicateProblem; CT §10.6; D02 §23; D-0131).
 *
 * - the seven records validate under the shipped registry, phase 5, with their offers and honest texts;
 * - refusals: offerOnHabitats naming an unknown or a disabled habitat, a region absent from an offered habitat
 *   (or from an offerOn recipe's habitat), a cycle window offered on fixed light, a challengeTemplate with an
 *   empty or repeated tool list, an objective with a template in offerOn;
 * - the template's tool groups are the challenge kind's (CHALLENGE_TOOL_GROUPS).
 */
import { describe, expect, it } from 'vitest';
import { validateContent, type RawFile, type RawPacks } from '../../src/sim/content/registry';
import { ObjectiveSchema } from '../../src/sim/content/schema';
import { objectiveCatalog } from '../../src/sim/objectives';
import { CHALLENGE_TOOL_GROUPS } from '../../src/persistence/notebookChallenges';
import { contentHashOf, patchedRawPacks } from '../helpers/registry';
import { registry } from '../helpers/world';

const PROMPTS = ['FOOD_RELAY', 'LEAVE_A_REFUGE', 'LIVING_BRIDGE', 'NIGHT_GARDEN', 'RECOVER_A_NEIGHBORHOOD', 'SUSTAIN_THREE_SPECIES', 'TWO_NEIGHBORHOODS'];

function packsWith(extra: readonly Record<string, unknown>[], patch = {}): RawPacks {
  const raw = patchedRawPacks(patch);
  const files: RawFile[] = extra.map((data) => ({ file: `content/objectives/${String(data.id)}.json`, data }));
  const packs: RawPacks = { ...raw, objectives: [...raw.objectives, ...files] };
  (packs.manifest.data as Record<string, unknown>).contentHash = contentHashOf(packs);
  return packs;
}
function errorsFor(id: string, packs: RawPacks): string[] {
  return validateContent(packs)
    .issues.filter((i) => i.severity === 'error' && i.file.includes(id))
    .map((i) => `${i.path}: ${i.message}`);
}
const prompt = (id: string, predicate: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
  id,
  title: 'A test prompt',
  predicate,
  summary: 'Test.',
  completedText: 'Done at {time}.',
  offerOn: [],
  phase: 5,
  ...more,
});
const KEEP_REGION = { type: 'keepSpeciesAlive', params: { species: ['B01'], regions: ['FRESH_POOL'] }, durationSeconds: 30 };

describe('the seven play prompts', () => {
  it('validate under the shipped registry with their offers', () => {
    const reg = registry();
    const shipped = objectiveCatalog(reg).filter((o) => o.phase === 5);
    expect(shipped.map((o) => o.id)).toEqual(PROMPTS);
    const offers = Object.fromEntries(shipped.map((o) => [o.id, { offerOn: o.offerOn, offerOnHabitats: o.offerOnHabitats ?? null, template: o.challengeTemplate ?? null }]));
    expect(offers).toEqual({
      FOOD_RELAY: { offerOn: ['SHARED_LUNCH_V1'], offerOnHabitats: ['H04_LEAF_POOL'], template: null },
      LEAVE_A_REFUGE: { offerOn: [], offerOnHabitats: ['H11_GRAZING_MEADOW'], template: null },
      LIVING_BRIDGE: { offerOn: ['FUNGAL_SUPPLY_LINE_V1'], offerOnHabitats: ['H11_GRAZING_MEADOW'], template: null },
      NIGHT_GARDEN: { offerOn: [], offerOnHabitats: ['H08_NIGHT_LANTERNS'], template: null },
      RECOVER_A_NEIGHBORHOOD: { offerOn: [], offerOnHabitats: null, template: { commandBudget: 3, allowedTools: [...CHALLENGE_TOOL_GROUPS], horizonSeconds: 180 } },
      SUSTAIN_THREE_SPECIES: {
        offerOn: reg.recipes.L305_THE_JACKET_GARDEN ? reg.objectives.SUSTAIN_THREE_SPECIES!.offerOn : [],
        offerOnHabitats: ['H04_LEAF_POOL', 'H06_DUSK_MARSH', 'H07_GLASS_GARDEN', 'H08_NIGHT_LANTERNS', 'H11_GRAZING_MEADOW'],
        template: null,
      },
      TWO_NEIGHBORHOODS: { offerOn: [], offerOnHabitats: ['H05_BRINE_MOSAIC'], template: null },
    });
    // Every Phase 5 habitat whose Suggested Community names at least three species offers SUSTAIN_THREE_SPECIES.
    const three = reg.manifest.enabledHabitats.filter((h) => (reg.habitats[h]!.suggestedCommunity?.groups ?? []).map((g) => g.species).filter((s, i, a) => a.indexOf(s) === i).length >= 3);
    expect(three).toEqual(reg.objectives.SUSTAIN_THREE_SPECIES!.offerOnHabitats);
    // Honest texts: this attempt, measured; never a promise or a ranking word.
    for (const o of shipped) {
      const text = [o.title, o.summary, o.completedText, o.endedText ?? ''].join(' ');
      expect(text, o.id).not.toMatch(/superior|advanced|perfect|adapted|immune|\bwin\b|because/i);
      expect(o.completedText, o.id).toMatch(/\{time\}/);
    }
    // A prompt that can end has its sentence; one that cannot has none.
    // Fix round 1: NIGHT_GARDEN ends when the dish is switched to fixed light (its cycle window cannot run then).
    expect(['LEAVE_A_REFUGE', 'LIVING_BRIDGE', 'NIGHT_GARDEN', 'TWO_NEIGHBORHOODS'].every((id) => reg.objectives[id]!.endedText !== undefined)).toBe(true);
    expect(['FOOD_RELAY', 'RECOVER_A_NEIGHBORHOOD', 'SUSTAIN_THREE_SPECIES'].every((id) => reg.objectives[id]!.endedText === undefined)).toBe(true);
  });

  it('the schema keeps the additions optional (a v1.0 record parses without them)', () => {
    const v1 = ObjectiveSchema.parse({ id: 'X', title: 'X', predicate: { type: 'observeEvent', params: { event: 'birth' } }, summary: 's', completedText: 'c', phase: 4 });
    expect('offerOnHabitats' in v1).toBe(false);
    expect('challengeTemplate' in v1).toBe(false);
    expect(ObjectiveSchema.safeParse({ ...v1, challengeTemplate: { commandBudget: 3, allowedTools: ['feed'], horizonSeconds: 90 } }).success).toBe(false);
    expect(ObjectiveSchema.safeParse({ ...v1, challengeTemplate: { commandBudget: 0, allowedTools: ['feed'], horizonSeconds: 60 } }).success).toBe(false);
    expect(ObjectiveSchema.safeParse({ ...v1, challengeTemplate: { commandBudget: 3, allowedTools: ['paint'], horizonSeconds: 60 } }).success).toBe(false);
  });
});

describe('refusals', () => {
  it('offerOnHabitats: an unknown habitat, and one this build does not enable', () => {
    expect(errorsFor('T_HAB', packsWith([prompt('T_HAB', KEEP_REGION, { offerOnHabitats: ['H99_NOWHERE'], endedText: 'e' })])).join('\n')).toMatch(/offerOnHabitats\.0: unknown habitat "H99_NOWHERE"/);
    const disabled = registry().manifest.enabledHabitats.filter((h) => h !== 'H05_BRINE_MOSAIC');
    expect(errorsFor('T_OFF', packsWith([prompt('T_OFF', KEEP_REGION, { offerOnHabitats: ['H05_BRINE_MOSAIC'], endedText: 'e' })], { enabledHabitats: disabled })).join('\n')).toMatch(/offerOnHabitats\.0: habitat "H05_BRINE_MOSAIC" is not enabled/);
    // The same record offered on an enabled H05 validates.
    expect(errorsFor('T_OK', packsWith([prompt('T_OK', KEEP_REGION, { offerOnHabitats: ['H05_BRINE_MOSAIC'], endedText: 'e' })]))).toEqual([]);
  });

  it('a region absent from an offered habitat, or from an offerOn recipe’s habitat, or with nowhere offered', () => {
    expect(errorsFor('T_R1', packsWith([prompt('T_R1', KEEP_REGION, { offerOnHabitats: ['H05_BRINE_MOSAIC', 'H08_NIGHT_LANTERNS'], endedText: 'e' })])).join('\n')).toMatch(/offerOnHabitats\.1: habitat "H08_NIGHT_LANTERNS" has no region "FRESH_POOL"/);
    expect(errorsFor('T_R2', packsWith([prompt('T_R2', KEEP_REGION, { offerOn: ['FIRST_DISH_V1'], endedText: 'e' })])).join('\n')).toMatch(/offerOn\.0: habitat "WATER_GARDEN" has no region "FRESH_POOL"/);
    expect(errorsFor('T_R3', packsWith([prompt('T_R3', KEEP_REGION, { endedText: 'e' })])).join('\n')).toMatch(/region "FRESH_POOL" needs a habitat/);
    // A quarter is every dish's.
    expect(errorsFor('T_R4', packsWith([prompt('T_R4', { ...KEEP_REGION, params: { species: ['B01'], regions: ['topLeft'] } }, { offerOn: ['FIRST_DISH_V1'], endedText: 'e' })]))).toEqual([]);
  });

  it('a cycle window offered on fixed light', () => {
    const glow = { type: 'observeEvent', params: { all: [{ event: 'glowOn', species: 'B09' }], window: 'cycle' } };
    expect(errorsFor('T_CY', packsWith([prompt('T_CY', glow, { offerOnHabitats: ['H05_BRINE_MOSAIC'] })])).join('\n')).toMatch(/cycle-window goal needs the light cycle, and "H05_BRINE_MOSAIC" runs fixed light/);
    expect(errorsFor('T_CY2', packsWith([prompt('T_CY2', glow, { offerOnHabitats: ['H08_NIGHT_LANTERNS'] })]))).toEqual([]);
  });

  it('a challengeTemplate with an empty or repeated tool list, or offered as a goal', () => {
    const recover = { type: 'biomassThreshold', params: { measure: 'activeCount', threshold: 20, fromBelow: 5 } };
    const tpl = (allowedTools: string[]) => ({ commandBudget: 3, allowedTools, horizonSeconds: 180 });
    expect(errorsFor('T_T1', packsWith([prompt('T_T1', recover, { challengeTemplate: tpl([]) })])).join('\n')).toMatch(/challengeTemplate\.allowedTools/);
    expect(errorsFor('T_T2', packsWith([prompt('T_T2', recover, { challengeTemplate: tpl(['feed', 'feed']) })])).join('\n')).toMatch(/names a tool group twice/);
    expect(errorsFor('T_T3', packsWith([prompt('T_T3', recover, { challengeTemplate: tpl(['feed']), offerOn: ['FIRST_DISH_V1'] })])).join('\n')).toMatch(/challengeTemplate: .*never offered as a goal/);
    expect(errorsFor('T_T4', packsWith([prompt('T_T4', recover, { challengeTemplate: tpl(['feed']), offerOnHabitats: ['H05_BRINE_MOSAIC'] })])).join('\n')).toMatch(/challengeTemplate: .*never offered as a goal/);
    expect(errorsFor('T_T5', packsWith([prompt('T_T5', recover, { challengeTemplate: tpl(['feed', 'addLife']) })]))).toEqual([]);
  });

  it('a prompt that can end needs endedText; a species list must be enabled', () => {
    expect(errorsFor('T_E1', packsWith([prompt('T_E1', { type: 'observeEvent', params: { all: [{ event: 'birth' }], endOn: ['linkBroken'] } })])).join('\n')).toMatch(/endedText: an observeEvent goal can end/);
    expect(errorsFor('T_E2', packsWith([prompt('T_E2', { type: 'keepSpeciesAlive', params: { minSpecies: 2 }, durationSeconds: 10 })]))).toEqual([]);
    expect(errorsFor('T_E3', packsWith([prompt('T_E3', { type: 'keepSpeciesAlive', params: { species: ['B01', 'B99'] }, durationSeconds: 10 }, { endedText: 'e' })])).join('\n')).toMatch(/unknown species "B99"/);
  });
});
