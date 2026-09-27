/**
 * P1.7 "Where is its family?": the worker's read-only family query. Members are exactly the living
 * organisms that share the asked-about organism's recorded founder; relations come from recorded
 * parent links; the query changes nothing and answers identically when repeated.
 */
import { describe, expect, it } from 'vitest';
import { field, has } from '../../src/sim/lineage';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { FromWorker } from '../../src/worker/protocol';
import { buildFamily } from '../../src/worker/snapshot';
import { registry } from '../helpers/world';

function living(world: World): number[] {
  const c = world.ents.cols;
  const out: number[] = [];
  for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1) out.push(c.birthId[i]!);
  return out;
}

/** Brute force: the ancestor chain (self first) of a birth record. */
function chain(world: World, b: number): number[] {
  const out = [b];
  let p = field(world.lineage, 'parent', b) ?? 0;
  while (p > 0 && has(world.lineage, p)) {
    out.push(p);
    p = field(world.lineage, 'parent', p) ?? 0;
  }
  return out;
}

function grownGarden(ticks: number): World {
  const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'family-test', seed: 104729 });
  for (let t = 0; t < ticks; t++) step(w);
  return w;
}

describe('family query (P1.7 shortcut)', () => {
  const world = grownGarden(1500);
  const alive = living(world);
  const born = alive.filter((b) => (field(world.lineage, 'parent', b) ?? 0) > 0);

  it('the garden has organisms born in the dish to ask about', () => {
    expect(born.length).toBeGreaterThan(0);
  });

  it('members are exactly the living organisms that share the founder, with recorded relations', () => {
    let seen = 0;
    for (const target of born.slice(0, 12)) {
      const f = buildFamily(world, target);
      seen += f.livingTotal;
      const mine = chain(world, target);
      const root = mine[mine.length - 1]!;
      expect(f.rootBirthId).toBe(root);
      expect(f.rootIntroduced).toBe(true);
      expect(f.historyIncomplete).toBe(false);
      expect(f.alive).toBe(true);
      const expected = alive.filter((b) => b !== target && chain(world, b).includes(root)).sort((a, b) => a - b);
      expect(f.livingTotal).toBe(expected.length);
      expect(f.members.map((m) => m.birthId).sort((a, b) => a - b)).toEqual(expected.slice(0, 200));
      for (const m of f.members) {
        const theirs = chain(world, m.birthId);
        const shared = mine.find((a) => theirs.includes(a))!;
        expect(m.stepsUp).toBe(mine.indexOf(shared));
        expect(m.stepsDown).toBe(theirs.indexOf(shared));
        if (m.relation === 'sibling') expect(field(world.lineage, 'parent', m.birthId)).toBe(field(world.lineage, 'parent', target));
        if (m.relation === 'child') expect(field(world.lineage, 'parent', m.birthId)).toBe(target);
      }
      // Closest first, then by birth id.
      const order = f.members.map((m) => [m.stepsUp + m.stepsDown, m.birthId] as const);
      expect(order).toEqual([...order].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
      // Its parent split to make it, so the parent record is closed by division.
      expect(f.parent).toEqual({ birthId: field(world.lineage, 'parent', target), alive: false, divided: true });
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('a founder that never split has no living family, and a parent query lists its daughters as children', () => {
    const founders = alive.filter((b) => (field(world.lineage, 'parent', b) ?? 0) === 0);
    const lonely = founders.find((b) => !alive.some((o) => o !== b && chain(world, o).includes(b)));
    if (lonely !== undefined) {
      const f = buildFamily(world, lonely);
      expect(f.members).toEqual([]);
      expect(f.parent).toBeNull();
    }
    // Ask about a parent that has divided: its living daughters are its children.
    const parentId = field(world.lineage, 'parent', born[0]!)!;
    const f = buildFamily(world, parentId);
    expect(f.alive).toBe(false);
    const daughters = f.members.filter((m) => m.relation === 'child').map((m) => m.birthId);
    expect(daughters).toContain(born[0]);
  });

  it('is read-only and repeatable: state hash unchanged, identical answers', () => {
    const before = stateHash(world);
    const a = buildFamily(world, born[0]!);
    const b = buildFamily(world, born[0]!);
    expect(stateHash(world)).toBe(before);
    expect(b).toEqual(a);
  });

  it('the worker host answers a family request without advancing or changing the dish', () => {
    const out: FromWorker[] = [];
    const host = new DishHost(registry(), (m) => out.push(m), { now: () => 0 });
    host.handle({ type: 'create', requestId: 1, dishId: 'd', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    const w = host.world('d')!;
    const before = stateHash(w);
    const any = living(w)[0]!;
    host.handle({ type: 'family', requestId: 2, dishId: 'd', birthId: any });
    const reply = out.find((m) => m.type === 'family');
    expect(reply && reply.type === 'family' && reply.requestId).toBe(2);
    expect(reply && reply.type === 'family' && reply.family.birthId).toBe(any);
    expect(stateHash(w)).toBe(before);
    expect(w.tick).toBe(0);
  });
});
