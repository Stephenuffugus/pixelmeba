/**
 * Wave B fix 2 (fix1-experiments-verify MINOR): the Cleaning crew card, its recipe and the Debris
 * material used to send players to the resource history "to see the debris total", but History
 * charts only what its samples record (src/sim/history.ts HistorySample), and no sample records
 * debris. The texts now point at something that shows debris — the Debris overlay in the Lab's
 * Observe tray — and still send players to the history for what it does chart (the card's player
 * step, CT §10 row 103 "resource history opened").
 */
import { describe, expect, it } from 'vitest';
import { realizeRecipe } from '../../src/sim/recipes';
import { run } from '../../src/sim/tick';
import { LAB_CATEGORIES, LAB_TEXT, OVERLAYS } from '../../src/ui/strings/lab';
import { FakeClockHost } from '../helpers/host';
import { registry } from '../helpers/world';

const reg = registry();

/** Every player-facing sentence of the experiment, recipe and material content. */
function sentences(): { where: string; text: string }[] {
  const out: { where: string; text: string }[] = [];
  const add = (where: string, text: string | undefined) => {
    for (const t of (text ?? '').split(/(?<=[.!?])\s+/)) if (t.trim()) out.push({ where, text: t });
  };
  for (const e of Object.values(reg.experiments)) {
    for (const key of ['question', 'intervention', 'predictedTradeoff', 'confounds'] as const) add(`${e.id}.${key}`, e[key]);
  }
  for (const r of Object.values(reg.recipes)) {
    add(`${r.id}.question`, r.question);
    add(`${r.id}.expectedObservationsText`, r.expectedObservationsText);
  }
  for (const m of Object.values(reg.materials)) {
    for (const key of ['summary', 'biology', 'rules', 'example'] as const) add(`${m.id}.guide.${key}`, m.guide[key]);
  }
  return out;
}

describe('debris texts point at what really shows debris (wave B fix 2)', () => {
  it('History records no debris, so no sentence sends players to the history for debris', () => {
    const w = realizeRecipe(reg, 'CLEANING_CREW_V1', { worldId: 'debris-text', seed: 103 });
    run(w, 30);
    const sample = w.history.seconds[w.history.seconds.length - 1]!;
    expect(Object.keys(sample).filter((k) => /detrit|debris/i.test(k))).toEqual([]);
    const history = sentences().filter((s) => /history/i.test(s.text));
    expect(history.length).toBeGreaterThan(0);
    for (const s of history) expect(s.text, s.where).not.toMatch(/debris|detritus/i);
  });

  it('the Cleaning crew card, its recipe and the Debris material name the Debris overlay, which the dish offers', () => {
    const where = 'Debris overlay (Lab → Observe)';
    expect(reg.experiments.EXP_103!.intervention).toContain(where);
    expect(reg.recipes.CLEANING_CREW_V1!.expectedObservationsText).toContain(where);
    expect(reg.materials.DEBRIS!.guide.example).toContain(where);
    // The card still asks for the resource history: its stamp needs that step (CT §10 row 103).
    expect(reg.experiments.EXP_103!.completion.playerSteps).toEqual(['openResourceHistory']);
    expect(reg.experiments.EXP_103!.intervention).toMatch(/open the resource history to see how the Recyclers’ numbers and living biomass change/);
    // The route exists: the Lab toggle, its Observe tray, and a Debris overlay for a field the dish has.
    expect(LAB_TEXT.toggle).toBe('Lab');
    expect(LAB_CATEGORIES.find((c) => c.id === 'observe')?.label).toBe('Observe');
    expect(OVERLAYS.find((o) => o.id === 'detritus')?.copy.name).toBe('Debris');
    for (const recipeId of ['CLEANING_CREW_V1', 'FIRST_DISH_V1']) {
      const h = new FakeClockHost();
      h.create(recipeId, { kind: 'recipe', recipeId });
      const ready = h.out.find((m) => m.type === 'ready');
      if (!ready || ready.type !== 'ready') throw new Error('no ready');
      expect(ready.info.fieldIds, recipeId).toContain('detritus');
    }
  });
});
