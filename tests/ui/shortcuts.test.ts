/**
 * P1.7 inspector shortcuts: "What does it eat?" and "Why did it stop?" answers are built from the
 * worker's inspector payload (recorded diet rules, reason codes, measured values); "Where is its
 * family?" words match the family query. No forbidden claims, no undefined/NaN text.
 */
import { describe, expect, it } from 'vitest';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import type { EntityInspect, FamilyAnswer } from '../../src/worker/protocol';
import { buildFamily, buildInspector } from '../../src/worker/snapshot';
import { dietAnswer, familySummary, listWords, relationLabel, stopAnswer } from '../../src/ui/strings/shortcuts';
import { registry } from '../helpers/world';

const FORBIDDEN = /\b(immune|superior|adapted|advanced|perfect|invincible)\b/i;

function clean(lines: readonly string[]): void {
  for (const l of lines) {
    expect(l.length).toBeGreaterThan(3);
    expect(l).not.toMatch(FORBIDDEN);
    expect(l).not.toMatch(/undefined|NaN|null/);
  }
}

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

describe('inspector shortcut answers (P1.7)', () => {
  const world = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'shortcuts', seed: 104729 });
  for (let t = 0; t < 300; t++) step(world);
  const names = world.species.map((s) => s.def.name);

  it('"What does it eat?" follows each Garden species\' recorded diet', () => {
    const sprinter = dietAnswer(firstOf(world, 'B01'), names);
    expect(sprinter.lines[0]).toBe('It eats sugar.');
    const crumb = dietAnswer(firstOf(world, 'B06'), names).lines.join(' ');
    expect(crumb).toContain("can't eat starch itself");
    expect(crumb).toContain('enzyme');
    const recycler = dietAnswer(firstOf(world, 'B04'), names).lines.join(' ');
    expect(recycler).toContain('debris');
    // Film digestion is not simulated until P3.3, so the answer must not claim it.
    expect(recycler).not.toContain('biofilm');
    const sunbead = dietAnswer(firstOf(world, 'A01'), names).lines.join(' ');
    expect(sunbead).toContain('light');
    for (const id of ['B01', 'B04', 'B06', 'A01']) {
      const a = dietAnswer(firstOf(world, id), names);
      clean(a.lines);
      // Measured intake is always reported.
      expect(a.lines[a.lines.length - 1]).toMatch(/took in/);
    }
  });

  it('a predator lists the prey species that live in this dish', () => {
    const base = firstOf(world, 'B01');
    const amoebaIdx = world.species.findIndex((s) => s.id === 'P01');
    const sprinterIdx = world.species.findIndex((s) => s.id === 'B01');
    const predator: EntityInspect = {
      ...base,
      speciesIdx: amoebaIdx,
      profile: { ...base.profile, foods: [] },
      foodHere: [],
      predation: { code: R.PRED_NO_PREY, targetBirthId: 0, cooldown: 0 },
      diet: { metabolism: 'aerobic', prey: [sprinterIdx], abilities: ['PREDATION'], digestsFilm: false },
    };
    const a = dietAnswer(predator, names);
    expect(a.lines[0]).toBe(`It catches other organisms. In this dish it can catch: ${names[sprinterIdx]!}.`);
    expect(a.lines).toContain('Nothing to hunt nearby.');
    clean(a.lines);
  });

  it('"Why did it stop?" lists every division blocker with its measured value', () => {
    const e = firstOf(world, 'B01');
    const blocked: EntityInspect = { ...e, limitCode: R.FOOD_ACCESS_LOW, limitValue: 0.25, divisionBlockers: [R.DIV_BLOCK_BIOMASS, R.DIV_BLOCK_ENERGY, R.DIV_BLOCK_AGE], divisionNeeds: { ...e.divisionNeeds, biomass: 2 }, B: 1.2, B0: 1, E: 40, age: 12 };
    const a = stopAnswer(blocked);
    expect(a.title).toBe('A few things are slowing it down.');
    expect(a.items.map((i) => i.code)).toEqual([R.FOOD_ACCESS_LOW, R.DIV_BLOCK_BIOMASS, R.DIV_BLOCK_ENERGY, R.DIV_BLOCK_AGE]);
    expect(a.items[0]!.detail).toContain('25 %');
    expect(a.items[1]!.detail).toBe('Body 1.20 of 2.00 needed.');
    expect(a.items[2]!.detail).toMatch(/^Energy 40 of \d+ needed\.$/);
    expect(a.items[3]!.detail).toMatch(/^Age 12 s of \d+ s\.$/);
    const single = stopAnswer({ ...e, limitCode: R.NONE, predation: null, divisionBlockers: [R.DIV_BLOCK_HEALTH], H: 20 });
    expect(single.title).toBe('Too hurt to split.');
    expect(single.items[0]!.detail).toBe('Health 20 of 50 needed.');
    const ready = stopAnswer({ ...e, limitCode: R.NONE, predation: null, divisionBlockers: [], proposalPending: false });
    expect(ready.items).toEqual([]);
    expect(ready.title).toMatch(/ready to split/);
    const waiting = stopAnswer({ ...e, limitCode: R.NONE, predation: null, divisionBlockers: [], proposalPending: true });
    expect(waiting.title).toBe('Ready to split when there is room.');
    for (const x of [a, single, ready, waiting]) clean([x.title, ...x.items.flatMap((i) => [i.text, i.detail])]);
  });

  it('"Where is its family?" words match the family query', () => {
    const founder = firstOf(world, 'A01');
    const f = buildFamily(world, founder.birthId);
    const s = familySummary(f);
    if (f.livingTotal === 0) expect(s.lines).toContain('No other members of its family are alive right now.');
    expect(s.lines[0]).toBe('It was added to the dish, so its family starts with it.');
    const synthetic: FamilyAnswer = {
      birthId: 90,
      tick: 100,
      alive: true,
      parent: { birthId: 40, alive: false, divided: true },
      rootBirthId: 3,
      rootIntroduced: true,
      historyIncomplete: false,
      livingTotal: 3,
      members: [
        { birthId: 91, entityId: 1, speciesIdx: 0, x: 1, y: 1, generation: 3, relation: 'sibling', stepsUp: 1, stepsDown: 1 },
        { birthId: 70, entityId: 2, speciesIdx: 0, x: 1, y: 1, generation: 3, relation: 'relative', stepsUp: 2, stepsDown: 2 },
        { birthId: 60, entityId: 3, speciesIdx: 0, x: 1, y: 1, generation: 2, relation: 'relative', stepsUp: 3, stepsDown: 1 },
      ],
    };
    const t = familySummary(synthetic);
    expect(t.lines).toEqual([
      'Its parent #40 split in two to make it.',
      'Its family starts with #3, which was added to the dish.',
      '3 other living members of its family: 1 sibling and 2 other relatives.',
    ]);
    expect(synthetic.members.map(relationLabel)).toEqual(['sibling (same parent)', 'cousin (same grandparent)', 'relative (shared ancestor 3 generations back)']);
    expect(relationLabel({ ...synthetic.members[2]!, stepsUp: 1, stepsDown: 2 })).toBe('relative (shared ancestor 1 generation back)');
    const partial = familySummary({ ...synthetic, livingTotal: 250, historyIncomplete: true });
    expect(partial.lines).toContain('250 other living members of its family.');
    expect(partial.lines).toContain('Showing the closest 3.');
    expect(partial.lines).toContain('Older family records were summarized, so some relatives may be missing.');
    for (const x of [s, t, partial]) clean(x.lines);
  });

  it('lists read naturally', () => {
    expect(listWords([])).toBe('');
    expect(listWords(['a'])).toBe('a');
    expect(listWords(['a', 'b'])).toBe('a and b');
    expect(listWords(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
