/**
 * P5.6 (g5-briefs risk "Measurement additions must stay observation-only"; D-0131): a world run with an
 * ArmObserver that tracks EVERY Phase 5 measure (every head for every species, every region of the world's
 * recorded habitat, every gate kind it places) and reads them all every 50 ticks is bit-identical — stateHash
 * and the 'full' trajectory digest — to the same world run without an observer. Seven new recipes, one H05
 * Suggested Community dish, and FIRST_DISH_V1 stepped in 4× chunks.
 */
import { describe, expect, it } from 'vitest';
import { allocatedFieldIds } from '../../src/sim/fields';
import { ArmObserver, EVENT_MEASURE_TYPES, measureArm, stepObserved } from '../../src/sim/pairedRun';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { trajectoryDigest } from '../helpers/trajectory';
import { habitatRegistry, habitatStart } from '../helpers/habitats';
import { registry } from './helpers';

const P5_RECIPES = ['GLOW_THRESHOLD_V1', 'QUIET_NEIGHBORS_V1', 'BRINE_CROSSING_V1', 'GLASS_BUDGET_V1', 'GATE_MEAL_V1', 'SLEEPING_SHORTAGE_V1', 'SHELTERED_LACE_V1'] as const;

/** Every Phase 5 measure id this world can track, plus the plain reads (state, glowingStart, firstCaptureAt). */
function everyP5Measure(w: World): { readonly tracked: string[]; readonly plain: string[] } {
  const tracked: string[] = [];
  const plain: string[] = [];
  const fields = allocatedFieldIds(w.fields);
  for (const sp of w.species.map((s) => s.id)) {
    plain.push(`resting.${sp}`, `glowing.${sp}`, `glowingStart.${sp}`, `attached.${sp}`, `firstCaptureAt.${sp}`);
    for (const t of EVENT_MEASURE_TYPES) tracked.push(`events.${t}.${sp}`);
    tracked.push(`intakePhoto.${sp}`, `intakeSugar.${sp}`, `secretingSeconds.${sp}`, `infections.${sp}.V01`, `infections.${sp}.V02`, `wholeUnitCells.${sp}.V01`, `wholeUnitCells.${sp}.V02`, `limitSeconds.${sp}.RIVAL_EXPOSURE`);
    for (const r of w.content.habitat.regions ?? []) tracked.push(`alive.${sp}@${r.id}`, `resting.${sp}@${r.id}`, `biomass.${sp}@${r.id}`);
  }
  for (const r of w.content.habitat.regions ?? []) {
    tracked.push(`moisture@${r.id}`);
    for (const f of fields) tracked.push(`mean.${f}@${r.id}`);
  }
  for (const kind of [...new Set(w.edges.map((e) => e.kind))].sort()) {
    tracked.push(`gateCrossings.${kind}`);
    for (const f of fields) tracked.push(`gateTransfer.${kind}.${f}`);
  }
  return { tracked, plain };
}

function observedRun(w: World, ticks: number, chunk = 1): void {
  const all = everyP5Measure(w);
  const obs = new ArmObserver(w, { observe: all.tracked, pools: ['sugar', 'detritus', 'starch'] });
  const ids = [...all.tracked, ...all.plain];
  for (let k = 0; k < ticks; k += chunk) {
    for (let j = 0; j < chunk; j++) stepObserved(w, obs);
    if (chunk > 1 || (k + 1) % 50 === 0) measureArm(w, obs, ids);
  }
  measureArm(w, obs, null);
}

const plainRun = (w: World, ticks: number) => {
  for (let k = 0; k < ticks; k++) step(w);
};

describe('P5.6 measures are observation only', () => {
  for (const id of P5_RECIPES) {
    it(`${id}: 600 ticks with every Phase 5 measure tracked equal 600 ticks without an observer`, () => {
      const a = realizeRecipe(registry(), id, { worldId: 'neutral' });
      const b = realizeRecipe(registry(), id, { worldId: 'neutral' });
      observedRun(a, 600);
      plainRun(b, 600);
      expect(stateHash(a)).toBe(stateHash(b));
      expect(trajectoryDigest(a, 'full')).toBe(trajectoryDigest(b, 'full'));
    });
  }

  it('an H05 Suggested Community dish (regions, no gates) is unchanged by the observer', () => {
    const a = habitatStart(habitatRegistry(), 'H05_BRINE_MOSAIC', { community: true });
    const b = habitatStart(habitatRegistry(), 'H05_BRINE_MOSAIC', { community: true });
    expect(everyP5Measure(a).tracked.some((m) => m.endsWith('@BRINE_POOL'))).toBe(true);
    observedRun(a, 600);
    plainRun(b, 600);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(trajectoryDigest(a, 'full')).toBe(trajectoryDigest(b, 'full'));
  });

  it('FIRST_DISH_V1 observed in 4× chunks (reads between chunks) equals the unobserved 1× run', () => {
    const a = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'neutral' });
    const b = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'neutral' });
    observedRun(a, 600, 4);
    plainRun(b, 600);
    expect(stateHash(a)).toBe(stateHash(b));
    expect(trajectoryDigest(a, 'full')).toBe(trajectoryDigest(b, 'full'));
  });
});
