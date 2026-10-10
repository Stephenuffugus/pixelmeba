/**
 * New Dish preview map (P3.2, P3.9; "every visible feature maps to real state"): the layout the
 * preview draws is the grid realizeRecipe() paints, including a recipe's own geometry ops. Borrowed
 * Shelter (L306) paints a gel disk over its Water Garden; a recipe without ops still previews its
 * habitat (and stone removal) exactly.
 */
import { describe, expect, it } from 'vitest';
import { cellIndex, SUB_GEL } from '../../src/sim/grid';
import { realizeRecipe } from '../../src/sim/recipes';
import type { NewDishPreview } from '../../src/worker/protocol';
import { FakeClockHost } from '../helpers/host';
import { registry } from '../helpers/world';

function preview(recipeId: string, overrides: { empty?: boolean; habitatId?: string } = {}): NewDishPreview {
  const h = new FakeClockHost();
  h.host.handle({ type: 'newDishPreview', requestId: 77, recipeId, seed: 104729, overrides });
  const msg = h.out.find((m) => m.type === 'newDishPreview' && m.requestId === 77);
  if (!msg || msg.type !== 'newDishPreview')
    throw new Error(`no preview: ${JSON.stringify(h.out.filter((m) => m.type === 'error'))}`);
  return msg.preview;
}

describe('New Dish preview map', () => {
  it("Borrowed Shelter previews its gel disk: the preview grid is the realized dish's grid", () => {
    const reg = registry();
    const recipe = reg.recipes.L306_BORROWED_SHELTER!;
    expect(recipe.ops.length).toBeGreaterThan(0);
    const w = realizeRecipe(reg, 'L306_BORROWED_SHELTER', { seed: 104729 });
    expect(w.grid.substrate[cellIndex(64, 64)]).toBe(SUB_GEL);
    const p = preview('L306_BORROWED_SHELTER');
    expect(p.habitat.grid!.substrate[cellIndex(64, 64)]).toBe(SUB_GEL);
    expect(Array.from(p.habitat.grid!.substrate)).toEqual(Array.from(w.grid.substrate));
    expect(Array.from(p.habitat.grid!.structure)).toEqual(Array.from(w.grid.structure));
  });

  it('a recipe without ops still previews its habitat layout exactly', () => {
    const reg = registry();
    for (const id of ['FIRST_DISH_V1', 'BROKEN_CATALYST_V1']) {
      expect(reg.recipes[id]!.ops.length).toBe(0);
      const w = realizeRecipe(reg, id, { seed: 104729 });
      const p = preview(id);
      expect(Array.from(p.habitat.grid!.substrate)).toEqual(Array.from(w.grid.substrate));
      expect(Array.from(p.habitat.grid!.structure)).toEqual(Array.from(w.grid.structure));
    }
  });
});
