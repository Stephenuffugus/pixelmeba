/**
 * G2 comprehension self-review, label fixes (D06 §18: labels, hierarchy and event evidence only):
 * M5 the Garden's food link (Sunbeads release sugar; where a Sprinter's sugar can come from), m5 out of
 * energy first, m6 an organism that makes its own food is never "eating", m7 split requirements headed as
 * such, M1 a saved result card's Notebook line, m25 About's versions. Every sentence is checked against
 * the measured payload or the rule constant it states.
 */
import { describe, expect, it } from 'vitest';
import manifest from '../../content/manifest.json';
import { PHOTO_SUGAR_FRACTION } from '../../src/sim/constants';
import { FLAG } from '../../src/sim/entities';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { APP_VERSION } from '../../src/persistence/saveFile';
import type { EntityInspect } from '../../src/worker/protocol';
import { buildInspector } from '../../src/worker/snapshot';
import { constraintWords, dietAnswer, leadConstraint, makesOwnFood, stopAnswer } from '../../src/ui/strings/shortcuts';
import { actionLabel } from '../../src/ui/strings/modules';
import { compareCardLine, headlineDifference, isListableCard } from '../../src/ui/strings/compareCards';
import { aboutLines } from '../../src/ui/strings/about';
import type { CompareCard } from '../../src/ui/state';
import { registry } from '../helpers/world';

function firstOf(world: World, speciesId: string): EntityInspect {
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] === 1 && world.species[c.species[i]!]!.id === speciesId) {
      const p = buildInspector(world, { kind: 'entity', birthId: c.birthId[i]! });
      if (p.entity) return p.entity;
    }
  }
  throw new Error(`no living ${speciesId}`);
}

describe('labels from the Garden payload', () => {
  const world = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'labels', seed: 104729 });
  for (let t = 0; t < 300; t++) step(world);
  const names = world.species.map((s) => s.def.name);

  it('M5: the Sunbead says it releases half of the carbon it takes in as sugar, with the measured amount', () => {
    const sunbead = firstOf(world, 'A01');
    expect(makesOwnFood(sunbead)).toBe(true);
    expect(PHOTO_SUGAR_FRACTION).toBe(0.5);
    const a = dietAnswer(sunbead, names).lines;
    expect(a[0]).toBe('It makes its own food from light, carbon dioxide and minerals.');
    expect(a).toContain('As it does, it releases half of the carbon it takes in into the water as sugar that others nearby can eat.');
    const last = a[a.length - 1]!;
    if (sunbead.intakeLastSecond >= 0.0001) {
      expect(last).toBe(
        `It took in ${sunbead.intakeLastSecond.toPrecision(2)} carbon in the last second, and released ${(0.5 * sunbead.intakeLastSecond).toPrecision(2)} of it as sugar.`,
      );
    } else expect(last).toMatch(/took in/);
  });

  it('M5: the Sprinter says where sugar here can come from (placed sugar, Sunbeads, Crumbsmiths’ enzyme)', () => {
    const a = dietAnswer(firstOf(world, 'B01'), names).lines;
    expect(a[0]).toBe('It eats sugar.');
    expect(a).toContain('Sugar here can come from sugar placed in the dish, Sunbeads (they release sugar as they make food) and Crumbsmiths’ enzyme (it turns starch into sugar).');
    expect(a[a.length - 1]).toMatch(/took in/);
    // A Crumbsmith eats sugar too; its own enzyme is described by its own line, not repeated as a source.
    const crumb = dietAnswer(firstOf(world, 'B06'), names).lines.join(' ');
    expect(crumb).toContain('Sugar here can come from sugar placed in the dish and Sunbeads');
    // A Recycler eats debris, not sugar: no sugar line.
    expect(dietAnswer(firstOf(world, 'B04'), names).lines.join(' ')).not.toContain('Sugar here');
  });

  it('m6: a Sunbead is "Making food", its food-access limit reads as food made, its policy as "makes its own food"', () => {
    const s = firstOf(world, 'A01');
    expect(actionLabel({ ...s, flags: FLAG.feeding | FLAG.usableIntake })).toBe('Making food');
    expect(actionLabel({ ...s, flags: FLAG.feeding })).toBe('Making only a little food');
    // Without the diet (older callers) the chip is unchanged.
    expect(actionLabel({ flags: FLAG.feeding | FLAG.usableIntake, lifeState: 0, predation: null })).toBe('Eating');
    const w = constraintWords(s, R.FOOD_ACCESS_LOW, 0.53);
    expect(w).toEqual({ text: 'It is making less food than it could here.', detail: 'Food made: 53 % of its budget.' });
    const sprinter = firstOf(world, 'B01');
    expect(constraintWords(sprinter, R.FOOD_ACCESS_LOW, 0.16).text).toBe('There is not enough food here.');
    const stop = stopAnswer({ ...s, limitCode: R.FOOD_ACCESS_LOW, limitValue: 0.5, divisionBlockers: [] });
    expect(stop.items[0]!.text).toBe('It is making less food than it could here.');
  });

  it('m5: at energy 0 "Out of energy — losing health." leads the summary and the list', () => {
    const r = firstOf(world, 'B04');
    const starving: EntityInspect = { ...r, E: 0, H: 56, limitCode: R.FOOD_ACCESS_LOW, limitValue: 0, divisionBlockers: [R.DIV_BLOCK_ENERGY] };
    expect(leadConstraint(starving)).toEqual({ code: R.ENERGY_ZERO, value: 0 });
    const w = constraintWords(starving, R.ENERGY_ZERO, 0);
    expect(w.text).toBe('Out of energy — losing health.');
    expect(w.detail).toBe('Energy 0: losing 4 health per second.');
    const stop = stopAnswer(starving);
    expect(stop.items[0]!.code).toBe(R.ENERGY_ZERO);
    expect(stop.splitOnly).toBe(false);
    // Energy above zero (even when the meter rounds it to 0) is not starvation.
    expect(leadConstraint({ ...starving, E: 0.2 }).code).toBe(R.FOOD_ACCESS_LOW);
  });

  it('m7: when every item is a split requirement the list is headed as such and the summary says so', () => {
    const e = firstOf(world, 'B01');
    const young: EntityInspect = { ...e, E: 30, limitCode: R.NONE, predation: null, divisionBlockers: [R.DIV_BLOCK_BIOMASS, R.DIV_BLOCK_AGE], B: e.B0 };
    const a = stopAnswer(young);
    expect(a.splitOnly).toBe(true);
    expect(a.title).toBe('Not ready to split yet.');
    expect(constraintWords(young, R.NONE, 0).text).toBe('Doing fine right now. Not ready to split yet.');
    const limited = stopAnswer({ ...young, limitCode: R.NUTRIENT_LIMITED, limitValue: 0.4 });
    expect(limited.splitOnly).toBe(false);
    expect(limited.title).toBe('A few things are slowing it down.');
    expect(constraintWords({ ...young, divisionBlockers: [] }, R.NONE, 0).text).toBe('Doing fine right now.');
  });
});

describe('M1: a saved result card has one Notebook line from what it recorded', () => {
  const card: CompareCard = {
    version: 1,
    savedAt: '2026-10-01T00:00:00.000Z',
    dishName: 'Little Living Garden',
    recipeId: 'FIRST_DISH_V1',
    seed: 104729,
    baselineTick: 540,
    ticks: 600,
    change: 'Sugar, 0.1 per cell on 24 cells',
    prediction: '',
    conclusion: 'supports',
    note: '',
    label: 'this paired run',
    hashes: { a: 'a', b: 'b' },
    rows: [
      { key: 'alive', a: 168, b: 173, diff: 5 },
      { key: 'carbonAdded', a: 0, b: 2.4, diff: 2.4 },
    ],
  };
  it('dish, change, horizon, headline difference and conclusion', () => {
    expect(compareCardLine(card)).toBe(
      '“Little Living Garden” at 0:54 · B: Sugar, 0.1 per cell on 24 cells · both ran 1:00 · Organisms alive: A 168, B 173 (+5) · Your conclusion: Supports my prediction',
    );
    expect(compareCardLine({ ...card, conclusion: null, rows: [] })).toBe('“Little Living Garden” at 0:54 · B: Sugar, 0.1 per cell on 24 cells · both ran 1:00 · No conclusion chosen');
    expect(headlineDifference({ ...card, rows: [{ key: 'alive', a: 1818, b: 1803, diff: -15 }] })).toBe('Organisms alive: A 1818, B 1803 (−15)');
  });
  it('a damaged stored card is not listed', () => {
    expect(isListableCard(card)).toBe(true);
    expect(isListableCard({ ...card, rows: undefined })).toBe(false);
    expect(isListableCard(null)).toBe(false);
    expect(isListableCard('x')).toBe(false);
  });
});

describe('m25: About names the exact build', () => {
  it('app version, content hash and every rule version from the manifest', () => {
    const l = Object.fromEntries(aboutLines().map((x) => [x.term, x.value]));
    expect(l['App version']).toBe(APP_VERSION);
    expect(l['Content hash']).toBe(manifest.contentHash);
    expect(l['Simulation rules']).toBe(String(manifest.simulationVersion));
    expect(l['Evolution rules']).toBe(String(manifest.evolutionRulesVersion));
    expect(l['Ability registry']).toBe(String(manifest.moduleRegistryVersion));
    expect(l['Trait mapping']).toBe(String(manifest.phenotypeMappingVersion));
    expect(l['Content version']).toBe(String(manifest.contentVersion));
    expect(l['Build phase']).toBe(String(manifest.buildPhase));
  });
});
