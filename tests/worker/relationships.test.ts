/**
 * P3.8 relationships seen (D-0039; src/worker/relationships.ts; src/sim/intake.ts IntakeSeen).
 *
 * Each relationship is recorded once, at the second it first showed, from recorded state only:
 * a capture, an infection, a parasite attachment, a lysis, a Recycler eating debris, a film digester
 * eating film and an enzyme conversion credited to its producer (D-0051's rule). A pool a species did
 * not take is never recorded, and a conversion with no credited producer is not a relationship. The
 * watcher and the intake record are observation: stateHash and trajectoryDigest(world, 'full') are
 * identical with and without them. The host runs the watcher on the played dish only and answers the
 * 'relationships' request from it.
 *
 * Every "right second" below is measured independently of the watcher: from the event ring, from the
 * entity columns, from pool totals across stage 6, or from the cumulative conversion totals.
 */
import { describe, expect, it } from 'vitest';
import { TICKS_PER_SECOND } from '../../src/sim/constants';
import { maskCells, cellIndex } from '../../src/sim/grid';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import type { FieldId } from '../../src/sim/fields';
import { markField } from '../../src/sim/transport';
import { R } from '../../src/sim/reasons';
import { RelationshipWatcher, FOOD_POOLS } from '../../src/worker/relationships';
import { FakeClockHost } from '../helpers/host';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf, clearWater, place, registry, setField } from '../helpers/world';

const sec = (tick: number) => Math.floor(tick / TICKS_PER_SECOND);

/** Step with the watcher exactly as DishHost.stepDish does; `after` sees the world after each tick. */
function watch(w: World, ticks: number, after?: (w: World) => boolean | void): RelationshipWatcher {
  const rw = new RelationshipWatcher(w);
  for (let t = 0; t < ticks; t++) {
    step(w, { afterStage: rw.hook });
    rw.afterTick(w);
    if (after?.(w) === true) break;
  }
  return rw;
}

function only(rw: RelationshipWatcher, id: string) {
  const hits = rw.entries.filter((e) => e.relationshipId === id);
  expect(hits, id).toHaveLength(1);
  return hits[0]!;
}

function total(w: World, id: FieldId): number {
  const f = w.fields[id]!;
  let s = 0;
  for (const k of maskCells()) s += f[k]!;
  return s;
}

describe('relationships seen (P3.8)', () => {
  it('a capture: once, at the capture event’s second, with its event id', () => {
    const w = clearWater();
    const x = 50.5;
    const y = 60.5;
    place(w, 'B01', x, y);
    place(w, 'B01', x + 0.2, y);
    place(w, 'P01', x + 0.1, y, { E: 50 });
    const rw = watch(w, 600);
    const captures = w.events.ring.filter((e) => e.type === 'capture');
    expect(captures.length).toBeGreaterThan(0);
    const first = captures[0]!;
    const e = only(rw, 'catches:P01:B01');
    expect(e.second).toBe(sec(first.tick));
    expect(e.eventId).toBe(first.id);
  });

  it('an infection and a lysis: once each, at the second the host was first infected and the second it burst', () => {
    const w = clearWater({ backgroundOverrides: { sugar: 0.2, nutrient: 0.2 } });
    for (let k = 0; k < 6; k++) place(w, 'B01', 40.5 + k, 60.5);
    for (const k of maskCells()) w.fields.v01![k] = 0;
    for (let dx = -3; dx <= 9; dx++) for (let dy = -3; dy <= 3; dy++) setField(w, 'v01', cellIndex(40 + dx, 60 + dy), 20);
    markField(w, 'v01');
    let firstInfected = -1;
    const rw = watch(w, 1500, (world) => {
      if (firstInfected < 0) {
        const c = world.ents.cols;
        for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && c.infectedBy[i] !== 0) firstInfected = world.tick - 1;
      }
      return world.events.ring.some((e) => e.type === 'death' && e.cause === R.DEATH_LYSIS);
    });
    expect(firstInfected).toBeGreaterThanOrEqual(0);
    expect(only(rw, 'infects:V01:B01').second).toBe(sec(firstInfected));
    const lysis = w.events.ring.find((e) => e.type === 'death' && e.cause === R.DEATH_LYSIS)!;
    expect(lysis).toBeDefined();
    const burst = only(rw, 'bursts:V01:B01');
    expect(burst.second).toBe(sec(lysis.tick));
    expect(burst.eventId).toBe(lysis.id);
  });

  it('a parasite attachment: once, at the second the Hitcher first rode a Sunbead', () => {
    const w = clearWater({ backgroundOverrides: { sugar: 0, nutrient: 0.2 } });
    const host = place(w, 'A01', 60.5, 40.5);
    const x = place(w, 'X01', 60.6, 40.5);
    let attachedAt = -1;
    const rw = watch(w, 100, (world) => {
      if (attachedAt < 0 && world.ents.cols.hostSlot[x] === host) attachedAt = world.tick - 1;
      return attachedAt >= 0 && world.tick > attachedAt + 30;
    });
    expect(attachedAt).toBeGreaterThanOrEqual(0);
    expect(only(rw, 'attaches:X01:A01').second).toBe(sec(attachedAt));
  });

  it('a Recycler eating debris and a film digester eating film: once each, at the first second the pool lost carbon in stage 6; pools not taken are never recorded', () => {
    const w = clearWater({ backgroundOverrides: { sugar: 0.3, nutrient: 0.2 } });
    // Recycler on debris; a second Recycler on film only; a Sprinter and a Sunbead beside debris.
    const a = cellIndex(40, 60);
    const b = cellIndex(90, 60);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      setField(w, 'detritus', a + dx + dy * 128, 0.5);
      setField(w, 'detritusN', a + dx + dy * 128, 0.05);
      setField(w, 'film', b + dx + dy * 128, 0.5);
    }
    place(w, 'B04', 40.5, 60.5);
    place(w, 'B04', 90.5, 60.5);
    place(w, 'B01', 41.5, 60.5);
    place(w, 'A01', 39.5, 61.5);
    const firstLoss: Partial<Record<FieldId, number>> = {};
    const rw = new RelationshipWatcher(w);
    for (let t = 0; t < 300; t++) {
      const before: Partial<Record<FieldId, number>> = {};
      step(w, {
        afterStage: (stage, world) => {
          rw.hook(stage, world);
          if (stage === 5) for (const id of ['detritus', 'film'] as const) before[id] = total(world, id);
          if (stage === 6) for (const id of ['detritus', 'film'] as const) if (firstLoss[id] === undefined && total(world, id) < before[id]!) firstLoss[id] = world.tick;
        },
      });
      rw.afterTick(w);
    }
    expect(firstLoss.detritus).toBeDefined();
    expect(firstLoss.film).toBeDefined();
    expect(only(rw, 'eats:B04:detritus').second).toBe(sec(firstLoss.detritus!));
    expect(only(rw, 'eats:B04:film').second).toBe(sec(firstLoss.film!));
    // Sugar sits under every one of them: the Recycler never eats it, the Sunbead never does, and
    // the Sprinter never eats debris (none of these pools is in their diets).
    expect(total(w, 'sugar')).toBeGreaterThan(0);
    const ids = rw.entries.map((e) => e.relationshipId);
    for (const never of ['eats:B04:sugar', 'eats:A01:sugar', 'eats:B01:detritus', 'eats:B01:film', 'eats:A01:detritus']) expect(ids).not.toContain(never);
    expect(ids).toContain('eats:B01:sugar');
    // Every eats entry names a pool the species' own diet (or film digestion, or light) allows.
    const reg = registry();
    for (const id of ids.filter((x) => x.startsWith('eats:'))) {
      const [, sp, pool] = id.split(':') as [string, string, FieldId];
      const def = reg.species[sp]!;
      const allowed = [...def.foodPriority, ...(def.digestsFilm ? ['film'] : []), ...(def.metabolism === 'photosynthesis' ? ['co2'] : [])];
      expect(allowed, id).toContain(pool);
      expect(FOOD_POOLS).toContain(pool);
    }
  });

  it('a diet pool that is present in the dish but out of reach is never recorded (the record, not the diet, decides)', () => {
    // A Recycler (debris in its diet) and a Velvet (sugar in its diet, sessile) stay alive the whole
    // run; a debris patch and a Sprinter's sugar patch lie far from both. The Sprinter eats its sugar,
    // so the intake record is in use; nobody takes debris and the Velvet takes no sugar, measured
    // independently: the debris total never falls across stage 6 and the sugar around the Velvet never
    // does either. A watcher that reported diet membership would record eats:B04:detritus and
    // eats:B02:sugar.
    const w = clearWater({ backgroundOverrides: { sugar: 0, nutrient: 0.2 } });
    const debris = cellIndex(100, 30);
    const sugar = cellIndex(90, 90);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
      setField(w, 'detritus', debris + dx + dy * 128, 0.5);
      setField(w, 'detritusN', debris + dx + dy * 128, 0.05);
      setField(w, 'sugar', sugar + dx + dy * 128, 0.5);
    }
    const recycler = place(w, 'B04', 40.5, 40.5);
    const velvet = place(w, 'B02', 30.5, 30.5);
    place(w, 'B01', 90.5, 90.5);
    const birth = [w.ents.cols.birthId[recycler], w.ents.cols.birthId[velvet]];
    const nearVelvet = (world: World) => {
      let s = 0;
      for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) s += world.fields.sugar![cellIndex(30 + dx, 30 + dy)]!;
      return s;
    };
    const fell = { detritus: false, sugar: false, sugarNearVelvet: false };
    const rw = new RelationshipWatcher(w);
    for (let t = 0; t < 100; t++) {
      let before = { detritus: 0, sugar: 0, sugarNearVelvet: 0 };
      step(w, {
        afterStage: (stage, world) => {
          rw.hook(stage, world);
          const now = { detritus: total(world, 'detritus'), sugar: total(world, 'sugar'), sugarNearVelvet: nearVelvet(world) };
          if (stage === 5) before = now;
          if (stage === 6) for (const k of ['detritus', 'sugar', 'sugarNearVelvet'] as const) if (now[k] < before[k]) fell[k] = true;
        },
      });
      rw.afterTick(w);
    }
    // Debris and sugar are present in the dish, in these diets, their eaters alive, and never taken.
    expect(total(w, 'detritus')).toBeGreaterThan(1);
    expect(total(w, 'sugar')).toBeGreaterThan(1);
    expect(fell).toEqual({ detritus: false, sugar: true, sugarNearVelvet: false });
    const c = w.ents.cols;
    expect([c.alive[recycler], c.alive[velvet]]).toEqual([1, 1]);
    expect([c.birthId[recycler], c.birthId[velvet]]).toEqual(birth);
    expect(registry().species.B04!.foodPriority).toContain('detritus');
    expect(registry().species.B02!.foodPriority).toContain('sugar');
    const ids = rw.entries.map((e) => e.relationshipId);
    for (const never of ['eats:B04:detritus', 'eats:B02:sugar']) expect(ids).not.toContain(never);
    expect(ids.filter((x) => x.startsWith('eats:'))).toEqual(['eats:B01:sugar']);
  });

  it('a conversion credited to its producer (D-0051): Crumbsmiths on starch; enzyme material alone is not a relationship', () => {
    const reg = registry();
    const w = realizeRecipe(reg, 'STARCH_UNLOCK_V1', { worldId: 'rel-starch' });
    const totals: number[] = [];
    const rw = watch(w, 1200, (world) => {
      if (world.tick % TICKS_PER_SECOND === 0) totals.push(world.conversionTotals.starch);
    });
    const e = only(rw, 'converts:B06:starch');
    // Conversion really happened during that second (cumulative totals rose across it).
    const before = e.second === 0 ? 0 : totals[e.second - 1]!;
    expect(totals[e.second]!).toBeGreaterThan(before);
    expect(aliveOf(w, 'B06').length).toBeGreaterThan(0);

    // Starch enzyme dosed on starch with no producer anywhere: conversion is measured, nobody credited.
    const w2 = clearWater({ backgroundOverrides: { sugar: 0, starch: 0.3 } });
    for (let dx = -2; dx <= 2; dx++) setField(w2, 'eStarch', cellIndex(60 + dx, 60), 1);
    const rw2 = watch(w2, 50);
    expect(w2.conversionTotals.starch).toBeGreaterThan(0);
    expect(rw2.entries.filter((x) => x.relationshipId.startsWith('converts:'))).toEqual([]);
  });

  it('observation only: stateHash and the full trajectory digest are identical with and without the watcher and the intake record', () => {
    const reg = registry();
    const make = () => {
      const w = realizeRecipe(reg, 'PREDATOR_BALANCE_V1', { worldId: 'rel-hash' });
      // A busy dish: hunters, a phage dose, Hitchers on Sunbeads and debris for Recyclers.
      place(w, 'A01', 70.5, 40.5);
      place(w, 'X01', 70.6, 40.5);
      place(w, 'B04', 60.5, 80.5);
      setField(w, 'detritus', cellIndex(60, 80), 0.5);
      setField(w, 'v01', cellIndex(50, 70), 20);
      return w;
    };
    const ticks = 400;
    const plain = make();
    for (let t = 0; t < ticks; t++) step(plain);
    const watched = make();
    const rw = watch(watched, ticks);
    expect(rw.entries.length).toBeGreaterThan(3);
    // "Without the intake record": its bytes overwritten or dropped after every tick never matter.
    const scrambled = make();
    for (let t = 0; t < ticks; t++) {
      step(scrambled);
      if (t % 2 === 0) scrambled.intakeSeen.bits?.fill(1);
      else scrambled.intakeSeen.bits = null;
    }
    for (const w of [watched, scrambled]) {
      expect(stateHash(w)).toBe(stateHash(plain));
      expect(trajectoryDigest(w, 'full')).toBe(trajectoryDigest(plain, 'full'));
    }
  }, 120_000);

  it('the host runs the watcher on the played dish and answers "relationships"; it is never saved', () => {
    const h = new FakeClockHost();
    h.create('rel-host', { kind: 'recipe', recipeId: 'CLEANING_CREW_V1' });
    h.setSpeed(4);
    h.advanceTo(100);
    h.host.handle({ type: 'relationships', requestId: 9001, dishId: 'rel-host' });
    const reply = h.out.find((m) => m.type === 'relationships' && m.requestId === 9001);
    expect(reply).toBeDefined();
    if (reply?.type !== 'relationships') throw new Error('no reply');
    expect(reply.worldId).toBe(h.world.worldId);
    expect(reply.entries.map((e) => e.relationshipId)).toContain('eats:B04:detritus');
    // Never in a save, and the dish's hash equals an unwatched run of the same state.
    expect(h.save()).not.toMatch(/eats:B04|relationships|intakeSeen/);
  });

  it('a watched host dish hashes exactly as the same state stepped without a watcher', () => {
    const h = new FakeClockHost();
    h.create('rel-host-2', { kind: 'recipe', recipeId: 'CLEANING_CREW_V1' });
    const plain = deserializeWorld(JSON.parse(h.save()) as WorldState);
    h.setSpeed(4);
    h.advanceTo(150);
    for (let t = 0; t < 150; t++) step(plain);
    expect(h.world.tick).toBe(plain.tick);
    expect(stateHash(h.world)).toBe(stateHash(plain));
    expect(trajectoryDigest(h.world, 'full')).toBe(trajectoryDigest(plain, 'full'));
  });
});
