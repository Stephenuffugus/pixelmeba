/**
 * P2.2 words (UX §3.3, SPEC §8.6–§8.7): the mode labels are exactly the UX §3.3 strings, the rates
 * panel shows the CT §12.8 numbers, the registry line and the "Core prototype" label follow the
 * recorded registry, and the inspector's module sources and founder-start lines say honestly how an
 * organism came to carry a module or a trait — read end to end from a real inspector payload.
 */
import { describe, expect, it } from 'vitest';
import { introduceOrganism } from '../../src/sim/commands';
import { creationFounders, founderOriginOf, type FounderOrigin } from '../../src/sim/founders';
import { neutralGenome } from '../../src/sim/genome';
import { maskCells } from '../../src/sim/grid';
import { field, type LineageRecordRow } from '../../src/sim/lineage';
import { canOccupy } from '../../src/sim/movement';
import { ratesFor } from '../../src/sim/mutation';
import { realizeRecipe } from '../../src/sim/recipes';
import { run } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { buildInspector } from '../../src/worker/snapshot';
import { deltaText } from '../../src/ui/strings/lineage';
import { originChip } from '../../src/ui/strings/modules';
import {
  CORE_PROTOTYPE_LABEL,
  creationFoundersText,
  evolutionLabel,
  FOUNDER_CHOICES,
  founderNote,
  founderStartText,
  moduleSourceText,
  pacingText,
  percent,
  PRESET_CHOICES,
  presetChangedToast,
  presetChangeText,
  rateRows,
  registryLine,
  slotModesLine,
  startLedgerText,
  worldModesLine,
} from '../../src/ui/strings/modes';
import { aliveOf, clearWater, registry } from '../helpers/world';

const reg = registry();

function origin(partial: Partial<FounderOrigin>): FounderOrigin {
  return {
    founderBirthId: 7,
    founderOrigin: 2,
    generationsFromFounder: 0,
    founderModules: [],
    founderStart: 'neutral',
    modules: [],
    ...partial,
  };
}

describe('P2.2 mode labels (UX §3.3)', () => {
  it('the three evolution settings and the registry label are the exact UX §3.3 strings, in offer order', () => {
    expect(PRESET_CHOICES.map((c) => c.label)).toEqual([
      'Standard Evolution',
      'Accelerated Evolution (game setting, not realism)',
      'Fixed Traits',
    ]);
    expect(evolutionLabel('accelerated')).toBe('Accelerated Evolution (game setting, not realism)');
    expect(CORE_PROTOTYPE_LABEL).toBe('Core prototype — quantitative evolution');
    expect(FOUNDER_CHOICES.map((c) => c.label)).toEqual([
      'Identical founders',
      'Varied founders',
      'Diverse founders',
    ]);
    expect(FOUNDER_CHOICES.find((c) => c.id === 'diverse')!.note).toContain('present at creation');
  });

  it('the world line names the setting and founders, and "Core prototype" only while the registry is partial', () => {
    expect(worldModesLine('accelerated', 'varied', { partial: true })).toBe(
      'Accelerated Evolution (game setting, not realism) · Varied founders · Core prototype — quantitative evolution',
    );
    expect(worldModesLine('fixed', 'identical', { partial: false })).toBe(
      'Fixed Traits · Identical founders',
    );
    expect(worldModesLine('standard', 'diverse', null)).toBe('Standard Evolution · Diverse founders');
  });

  it('a recorded change reads as what changed, from and to', () => {
    expect(presetChangeText({ tick: 30, seq: 1, commandId: 'c', from: 'accelerated', to: 'standard' })).toBe(
      'Evolution changed from Accelerated Evolution (game setting, not realism) to Standard Evolution.',
    );
    expect(presetChangeText({ tick: 30, seq: 1, commandId: 'c', from: null, to: 'fixed' })).toBe(
      'Evolution changed to Fixed Traits.',
    );
  });

  it('the rates panel shows the CT §12.8 chances per offspring; developmental is absent before Phase 7', () => {
    const value = (p: 'standard' | 'accelerated' | 'fixed') =>
      rateRows(ratesFor(p, false), false).map((r) => [r.key, r.value]);
    expect(value('standard')).toEqual([
      ['quantitative', '8 %'],
      ['preference', '2 %'],
      ['module', '0.2 %'],
      ['developmental', '—'],
    ]);
    expect(value('accelerated')).toEqual([
      ['quantitative', '16 %'],
      ['preference', '4 %'],
      ['module', '1 %'],
      ['developmental', '—'],
    ]);
    expect(value('fixed').map((r) => r[1])).toEqual(['0 %', '0 %', '0 %', '—']);
    expect(rateRows(ratesFor('standard', true), true).at(-1)!.value).toBe('1 %');
    expect(percent(0.002)).toBe('0.2 %');
    // SPEC §8.7: about 63 % at Standard; an attempt is not a branch; Fixed never changes.
    expect(pacingText(ratesFor('standard', false))).toContain('about 63 %');
    expect(pacingText(ratesFor('standard', false))).toContain('A try is not a lasting new branch');
    expect(pacingText(ratesFor('fixed', false))).toBe('Offspring never change at this setting.');
  });

  it('the registry line lists the recorded abilities and how many of the catalog they are', () => {
    const line = registryLine({
      moduleRegistryVersion: 1,
      evolutionRulesVersion: 1,
      modules: [
        { id: 'E01', name: 'Starch release' },
        { id: 'E05', name: 'Reserve chamber' },
      ],
      catalogSize: 17,
      partial: true,
      systems: ['core'],
    });
    expect(line).toBe(
      'Module registry version 1: Starch release (E01), Reserve chamber (E05) — 2 of 17 abilities.',
    );
  });
});

describe('P2.2 honest origin words (inspector and lineage)', () => {
  it('each module source reads as what the lineage recorded', () => {
    const o = origin({ founderBirthId: 12 });
    expect(moduleSourceText({ id: 'E05', source: 'creation' }, o, 12)).toBe('Present at creation.');
    expect(moduleSourceText({ id: 'E05', source: 'inherited-creation' }, o, 40)).toBe(
      'Inherited from its founder #12, which had it at creation.',
    );
    expect(moduleSourceText({ id: 'E01', source: 'mutation', gainedAtBirth: 40 }, o, 40)).toBe(
      'Gained by a mutation when it was born.',
    );
    expect(moduleSourceText({ id: 'E01', source: 'mutation', gainedAtBirth: 33 }, o, 40)).toBe(
      'Gained by a mutation in its family (at the birth of #33).',
    );
    // The founder itself "already carried it"; a descendant's founder did.
    expect(moduleSourceText({ id: 'E05', source: 'introduced' }, o, 12)).toBe(
      'It already carried it when it was added to the dish.',
    );
    expect(
      moduleSourceText(
        { id: 'E05', source: 'introduced' },
        origin({ founderBirthId: 12, generationsFromFounder: 2 }),
        40,
      ),
    ).toBe('Its founder already carried it when it was added to the dish.');
    expect(moduleSourceText({ id: 'E05', source: 'unknown' }, o, 40)).toContain('no longer recorded');
  });

  it('starting differences are never called evolution: varied founders, carried genomes, neutral and unknown', () => {
    expect(founderStartText(origin({ founderStart: 'varied' }))).toContain(
      '(varied founders); they did not evolve here',
    );
    expect(founderStartText(origin({ founderStart: 'varied', generationsFromFounder: 3 }))).toBe(
      'Its founder #7 started with traits a little apart from 50 (varied founders), so not every difference from 50 evolved here.',
    );
    expect(founderStartText(origin({ founderStart: 'carried' }))).toContain('did not evolve in this dish');
    expect(founderStartText(origin({ founderStart: 'carried', generationsFromFounder: 2 }))).toContain(
      'Its founder #7 was added already carrying different traits',
    );
    expect(founderStartText(origin({ founderStart: 'neutral' }))).toBeNull();
    expect(
      founderStartText(origin({ founderStart: 'unknown', founderBirthId: 0, generationsFromFounder: -1 })),
    ).toBeNull();
  });

  it('a Diverse dish end to end: the seeded founder reads "present at creation" and its descendant "inherited … at creation"', () => {
    const w: World = realizeRecipe(reg, 'FIRST_DISH_V1', {
      seed: 104729,
      worldId: 'words-diverse',
      transform: (r) => ({ ...r, founderMode: 'diverse', mutationPreset: 'fixed' }),
    });
    const seeded = aliveOf(w).find((s) => w.genomes.get(w.ents.cols.genome[s]!).modules.length > 0)!;
    const fb = w.ents.cols.birthId[seeded]!;
    const f = buildInspector(w, { kind: 'entity', birthId: fb }).entity!;
    expect(originChip(f.origin)).toBe('present at creation');
    for (const m of f.founderOrigin!.modules)
      expect(moduleSourceText(m, f.founderOrigin!, fb)).toBe('Present at creation.');
    expect(founderStartText(f.founderOrigin!)).toBe(
      'Its traits were set a little apart from 50 when it was added (varied founders); they did not evolve here.',
    );
    // The lineage panel's family rows say the same for the founder's record.
    const L = w.lineage;
    const row: LineageRecordRow = {
      birthId: fb,
      birthTick: field(L, 'birthTick', fb)!,
      generation: 0,
      status: 'alive',
      endTick: -1,
      deathCause: 0,
      origin: field(L, 'origin', fb)!,
      mutFlags: field(L, 'mutFlags', fb) ?? 0,
      mutLocus: -1,
      mutDelta: 0,
      mutModule: null,
    };
    expect(deltaText(row, [])).toBe('present at creation');

    // Run until a descendant of any seeded founder is alive, then read it through the inspector.
    let child: number | undefined;
    for (let k = 0; k < 20 && child === undefined; k++) {
      run(w, 100);
      child = aliveOf(w).find((s) => {
        const o = founderOriginOf(w, w.ents.cols.birthId[s]!);
        return o.founderOrigin === 2 && o.generationsFromFounder > 0;
      });
    }
    expect(child).toBeDefined();
    const cb = w.ents.cols.birthId[child!]!;
    const c = buildInspector(w, { kind: 'entity', birthId: cb }).entity!;
    const o = c.founderOrigin!;
    expect(originChip(c.origin)).toBeNull(); // born here, not present at creation itself
    expect(c.modules.length).toBeGreaterThan(0);
    for (const m of o.modules)
      expect(moduleSourceText(m, o, cb)).toBe(
        `Inherited from its founder #${o.founderBirthId}, which had it at creation.`,
      );
    expect(founderStartText(o)).toBe(
      `Its founder #${o.founderBirthId} started with traits a little apart from 50 (varied founders), so not every difference from 50 evolved here.`,
    );
  });

  it('a saved genome added to an Identical dish is not called a varied founder', () => {
    const w = clearWater({ seed: 9 });
    const spIdx = speciesIndex(w, 'B01');
    const genome = w.genomes.intern({
      ...neutralGenome('B01'),
      loci: [55, 50, 48, 50, 50, 50, 50, 50],
      modules: ['E05'],
    });
    const cell = maskCells().find((c) => canOccupy(w, w.species[spIdx]!, c))!;
    const s = introduceOrganism(w, spIdx, cell, 'specimen', { genome });
    const b = w.ents.cols.birthId[s]!;
    const e = buildInspector(w, { kind: 'entity', birthId: b }).entity!;
    expect(e.founderOrigin!.founderStart).toBe('carried');
    expect(founderStartText(e.founderOrigin!)).toBe(
      'It was added already carrying these traits (for example as a saved specimen); their differences from 50 did not evolve in this dish.',
    );
    expect(moduleSourceText(e.founderOrigin!.modules[0]!, e.founderOrigin!, b)).toBe(
      'It already carried it when it was added to the dish.',
    );
  });
});

describe('P2.2 fix round 1: words that must stay true', () => {
  it('founder-mode notes describe what the mode does, never that every founder lacks an ability; Fixed copies traits only', () => {
    const note = (id: string) => FOUNDER_CHOICES.find((c) => c.id === id)!.note;
    for (const id of ['identical', 'varied']) {
      expect(note(id)).toContain('This mode gives them no extra abilities.');
      expect(note(id)).not.toMatch(/every founder/i);
    }
    expect(founderNote('identical')).not.toContain('Every founder');
    expect(note('diverse')).toContain('placed at 0:00');
    expect(note('diverse')).toContain('Life added later gets varied traits only.');
    const fixed = PRESET_CHOICES.find((c) => c.id === 'fixed')!.note;
    expect(fixed).toBe('Offspring inherit their parent’s traits unchanged. Good for controlled experiments.');
    expect(fixed).not.toContain('exact copies');
  });

  it('the Evolution sheet states what this dish’s founders carried: Experiment C’s recipe-given reserve chambers', () => {
    const x = realizeRecipe(reg, 'RESERVE_COMPARE_V1', { worldId: 'words-exp-c' });
    const names = x.species.map((sp) => sp.def.name);
    const moduleName = (id: string) => x.content.modules.find((m) => m.id === id)?.name ?? id;
    const text = creationFoundersText(creationFounders(x), (i) => names[i]!, moduleName);
    expect(text).toBe('Present at creation: 12 of 24 Sprinters carried Reserve chamber.');
    // The identical garden's founders carried none; an unknown or empty history says so, never guesses.
    const g = realizeRecipe(reg, 'FIRST_DISH_V1', { worldId: 'words-garden' });
    expect(creationFoundersText(creationFounders(g), (i) => names[i] ?? '?', moduleName)).toBe(
      'None of the founders placed at 0:00 carried an extra ability.',
    );
    expect(creationFoundersText({ complete: true, rows: [] }, () => '?', moduleName)).toBe(
      'No founders were placed at 0:00.',
    );
    expect(creationFoundersText({ complete: false, rows: [] }, () => '?', moduleName)).toContain(
      'no longer listed',
    );
    expect(
      creationFoundersText(
        {
          complete: true,
          rows: [
            { species: 0, count: 1, withModule: 1, modules: [{ id: 'E05', count: 1 }] },
            {
              species: 1,
              count: 24,
              withModule: 3,
              modules: [
                { id: 'E01', count: 1 },
                { id: 'E05', count: 2 },
              ],
            },
          ],
        },
        (i) => ['Sunbead', 'Sprinter'][i]!,
        moduleName,
      ),
    ).toBe(
      'Present at creation: 1 of 1 Sunbead carried Reserve chamber; and 3 of 24 Sprinters carried extra abilities (1 with Starch release, 2 with Reserve chamber).',
    );
  });

  it('a saved dish is described with its mode labels; the change toast is one short line', () => {
    expect(slotModesLine({ mutationPreset: 'accelerated', founderMode: 'diverse', partial: true })).toBe(
      'Accelerated Evolution (game setting, not realism) · Diverse founders · Core prototype — quantitative evolution',
    );
    expect(slotModesLine({ mutationPreset: 'fixed', founderMode: 'identical' })).toBe(
      'Fixed Traits · Identical founders',
    );
    expect(slotModesLine(undefined)).toBeNull();
    expect(presetChangedToast('standard')).toBe('Now Standard Evolution. Undo rewinds it.');
  });

  it('the New Dish start ledger adds up as displayed (every amount to 0.01)', () => {
    const cases = [
      { habitat: { c: 5399 }, added: { c: 168.05 }, total: { n: 556.71, m: 0 } },
      // Separate rounding would show 0.01 + 0.01 = 0.01; the total is the sum of the parts as shown.
      { habitat: { c: 0.005 }, added: { c: 0.005 }, total: { n: 1, m: 0.004 } },
    ];
    for (const l of cases) {
      const text = startLedgerText(l);
      const m = /holds ([\d.]+) carbon.*own ([\d.]+) carbon plus ([\d.]+) added/.exec(text)!;
      expect(m).not.toBeNull();
      const [total, own, added] = [m[1]!, m[2]!, m[3]!].map((v) => Math.round(Number(v) * 100));
      expect(total).toBe(own! + added!);
      for (const v of [m[1]!, m[2]!, m[3]!]) expect(v).toMatch(/^\d+\.\d\d$/);
    }
    expect(startLedgerText(cases[0]!)).toBe(
      'At the start the dish holds 5567.05 carbon, 556.71 nutrient and 0.00 mineral (game units, to 0.01): the habitat’s own 5399.00 carbon plus 168.05 added with the food and founders.',
    );
  });
});
