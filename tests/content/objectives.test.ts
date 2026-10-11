/**
 * P4.4 objective content (content/objectives; src/sim/content/schema.ts ObjectiveSchema; the validator's
 * objectivePredicateProblem in src/sim/objectives.ts; SPEC §13.5; CT §10.5).
 *
 * - the three shipped goals validate, carry CT §10.5's titles and are offered on the Garden;
 * - a gate objective (no enabled gate structure), a 'custom' one, an unknown species, a bad number and a
 *   keepSpeciesAlive without endedText are refused with the record and field named;
 * - a phase 5 objective is skipped under buildPhase 4 (not an error, not in the catalog);
 * - registryWith(G2_LISTS) (buildPhase 2) still validates: the phase 4 goals are skipped there too.
 */
import { describe, expect, it } from 'vitest';
import { validateContent, type RawFile, type RawPacks } from '../../src/sim/content/registry';
import { objectiveCatalog } from '../../src/sim/objectives';
import { G2_LISTS, contentHashOf, patchedRawPacks, registryWith } from '../helpers/registry';
import { registry } from '../helpers/world';

function packsWith(extra: readonly Record<string, unknown>[], patch = {}): RawPacks {
  const raw = patchedRawPacks(patch);
  const files: RawFile[] = extra.map((data) => ({ file: `content/objectives/${String(data.id)}.json`, data }));
  const packs: RawPacks = { ...raw, objectives: [...raw.objectives, ...files] };
  (packs.manifest.data as Record<string, unknown>).contentHash = contentHashOf(packs);
  return packs;
}

const goal = (id: string, predicate: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
  id,
  title: 'A test goal',
  predicate,
  summary: 'Test.',
  completedText: 'Done at {time}.',
  offerOn: ['FIRST_DISH_V1'],
  phase: 4,
  ...more,
});

function errorsFor(id: string, packs: RawPacks): string[] {
  const res = validateContent(packs);
  return res.issues.filter((i) => i.severity === 'error' && i.file.includes(id)).map((i) => `${i.path}: ${i.message}`);
}

describe('content/objectives', () => {
  it('the three shipped goals validate, with CT §10.5 titles, offered on the Garden', () => {
    const reg = registry();
    expect(reg.manifest.buildPhase).toBe(4);
    const shipped = objectiveCatalog(reg);
    expect(shipped.map((o) => [o.id, o.title])).toEqual([
      ['KEEP_SPRINTERS_GOING', 'Keep Sprinters going'],
      ['SEE_SPRINTER_SPLIT', 'See a Sprinter split'],
      ['WATCH_STARCH_BECOME_FOOD', 'Watch starch become food'],
    ]);
    for (const o of shipped) {
      expect(o.offerOn).toEqual(['FIRST_DISH_V1']);
      expect(o.phase).toBe(4);
    }
    expect(reg.objectives.SEE_SPRINTER_SPLIT!.predicate).toEqual({ type: 'observeEvent', params: { event: 'birth', species: 'B01' } });
    expect(reg.objectives.KEEP_SPRINTERS_GOING!.predicate).toEqual({ type: 'keepSpeciesAlive', params: { species: 'B01' }, durationSeconds: 180 });
    expect(reg.objectives.KEEP_SPRINTERS_GOING!.endedText).toMatch(/\{time\}/);
    expect(reg.objectives.WATCH_STARCH_BECOME_FOOD!.predicate).toEqual({ type: 'observeEvent', params: { event: 'conversion', enzyme: 'starch' } });
    // D09: "Do not invent a producer attribution" — the starch sentence names no organism.
    expect(reg.objectives.WATCH_STARCH_BECOME_FOOD!.completedText).not.toMatch(/Crumbsmith|B06|made|by /i);
  });

  it('refuses a gate no enabled structure provides, custom, unknown names, bad numbers and a missing endedText', () => {
    const cases: [Record<string, unknown>, RegExp][] = [
      [goal('T_GATE', { type: 'transferAcrossGate', params: { gate: 'S02', field: 'sugar', threshold: 1 } }), /predicate\.params\.gate: no enabled gate structure provides "S02"/],
      [goal('T_GATE_STONE', { type: 'transferAcrossGate', params: { gate: 'STONE', field: 'sugar', threshold: 1 } }), /no enabled gate structure provides "STONE"/],
      [goal('T_CUSTOM', { type: 'custom', params: { all: [{ arm: 'A', measure: 'births.B01', op: 'gt', value: 0 }] } }), /predicate\.type: .*never "custom"/],
      [goal('T_SPECIES', { type: 'observeEvent', params: { event: 'birth', species: 'B99' } }), /predicate\.params\.species: unknown species "B99"/],
      [goal('T_NOT_ENABLED', { type: 'observeEvent', params: { event: 'birth', species: 'B10' } }), /"B10" is not enabled/],
      [goal('T_FIELD', { type: 'fieldInRange', params: { field: 'glitter', min: 0, max: 1 }, durationSeconds: 5 }), /unknown field "glitter"/],
      [goal('T_REGION', { type: 'fieldInRange', params: { field: 'oxygen', region: 'middle', min: 0, max: 1 }, durationSeconds: 5 }), /unknown region/],
      [goal('T_ENZYME', { type: 'observeEvent', params: { event: 'conversion', enzyme: 'chitin' } }), /unknown enzyme/],
      [goal('T_EVENT', { type: 'observeEvent', params: { event: 'sneeze' } }), /unknown event type/],
      [goal('T_DUR', { type: 'keepSpeciesAlive', params: { species: 'B01' }, durationSeconds: 0 }, { endedText: 'x' }), /durationSeconds/],
      [goal('T_THRESH', { type: 'biomassThreshold', params: { threshold: 0 } }), /threshold must be a finite number above 0/],
      [goal('T_ENDED', { type: 'keepSpeciesAlive', params: { species: 'B01' }, durationSeconds: 60 }), /endedText: .*needs endedText/],
      [goal('T_OFFER', { type: 'observeEvent', params: { event: 'birth' } }, { offerOn: ['NO_SUCH_RECIPE'] }), /offerOn\.0: unknown recipe/],
    ];
    for (const [data, re] of cases) {
      const errs = errorsFor(String(data.id), packsWith([data]));
      expect(errs.join('\n'), String(data.id)).toMatch(re);
    }
    // A schema-level problem (no completedText) is named too.
    const { completedText: _c, ...noText } = goal('T_TEXT', { type: 'observeEvent', params: { event: 'birth' } });
    expect(errorsFor('T_TEXT', packsWith([noText])).join('\n')).toMatch(/completedText/);
  });

  it('a phase 5 objective is skipped under buildPhase 4: no error, not in the catalog', () => {
    const later = goal('T_LATER', { type: 'transferAcrossGate', params: { gate: 'S02', field: 'sugar', threshold: 1 } }, { phase: 5 });
    const res = validateContent(packsWith([later]));
    expect(res.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(res.registry).not.toBeNull();
    expect(res.registry!.objectives.T_LATER).toBeDefined();
    expect(objectiveCatalog(res.registry!).map((o) => o.id)).not.toContain('T_LATER');
    // Its shape is still checked: a later objective that is malformed is an error.
    const broken = goal('T_LATER_BAD', { type: 'custom', params: {} }, { phase: 5 });
    expect(errorsFor('T_LATER_BAD', packsWith([broken])).join('\n')).toMatch(/custom/);
  });

  it('registryWith(G2_LISTS) (buildPhase 2) still validates and ships no goal', () => {
    const g2 = registryWith(G2_LISTS);
    expect(g2.manifest.buildPhase).toBe(2);
    expect(g2.objectiveIds).toEqual(['KEEP_SPRINTERS_GOING', 'SEE_SPRINTER_SPLIT', 'WATCH_STARCH_BECOME_FOOD']);
    expect(objectiveCatalog(g2)).toEqual([]);
  });
});
