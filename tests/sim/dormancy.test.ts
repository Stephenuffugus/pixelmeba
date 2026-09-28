/**
 * P2.1 dormancy state machine (SPEC §7.6, CT §12.7) as gained through E03: triggers (food and dry),
 * entry energy, lockout after waking, reduced damage while resting, no feeding/movement/secretion
 * while dormant, still prey, no immortal dormancy, and saved clocks (reload never changes a
 * transition).
 */
import { describe, expect, it } from 'vitest';
import { introduceOrganism } from '../../src/sim/commands';
import { DT } from '../../src/sim/constants';
import type { ContentRegistry } from '../../src/sim/content/registry';
import { LIFE_ACTIVE, LIFE_PREPARING, LIFE_RESTING } from '../../src/sim/entities';
import { neutralGenome } from '../../src/sim/genome';
import { cellIndex, SUB_GEL } from '../../src/sim/grid';
import { field } from '../../src/sim/lineage';
import { profileOfGenome } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { clearWater, fillField, registry, setField } from '../helpers/world';

function placeWith(w: World, speciesId: string, x: number, y: number, modules: readonly string[], state: Partial<Record<'E' | 'H', number>> = {}): number {
  const slot = introduceOrganism(w, speciesIndex(w, speciesId), cellIndex(Math.floor(x), Math.floor(y)), 'test', { modules, exactCenter: true });
  const c = w.ents.cols;
  c.x[slot] = x;
  c.y[slot] = y;
  if (state.E !== undefined) c.E[slot] = state.E;
  if (state.H !== undefined) c.H[slot] = state.H;
  rebuildIndex(w);
  return slot;
}

/** A B01 E03 carrier in food-free clear water, stepped until it rests (20 s trigger + 5 s preparing). */
function restingSprinter(w = clearWater()): { w: World; s: number } {
  const s = placeWith(w, 'B01', 64.5, 64.5, ['E03']);
  run(w, 250);
  expect(w.ents.cols.lifeState[s]).toBe(LIFE_RESTING);
  return { w, s };
}

function sugarAround(w: World, x: number, y: number, amount: number): void {
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setField(w, 'sugar', cellIndex(x + dx, y + dy), amount);
}

describe('P2.1 dormancy (E03)', () => {
  it('does not rest while fed, and never enters below 15 energy', () => {
    const w = clearWater();
    sugarAround(w, 64, 64, 1);
    const fed = placeWith(w, 'B01', 64.5, 64.5, ['E03']);
    const low = placeWith(w, 'B01', 30.5, 64.5, ['E03'], { E: 12 });
    run(w, 300);
    const c = w.ents.cols;
    expect(c.lifeState[fed]).toBe(LIFE_ACTIVE);
    expect(c.stateTimer[fed]).toBeLessThan(1); // no-intake clock resets on every intake
    expect(c.lifeState[low]).toBe(LIFE_ACTIVE); // trigger held for 30 s, but E < 15
    expect(c.stateTimer[low]).toBeGreaterThan(20);
    expect(w.ledger.energy.dormancy).toBe(0);
  });

  it('the dormancy locus scales the food-shortage trigger: 20 s × (1.5 − g)', () => {
    const w = clearWater();
    const spIdx = speciesIndex(w, 'B01');
    const trigger = (g: number, modules: string[]) =>
      profileOfGenome(w, w.genomes.intern({ ...neutralGenome('B01'), loci: [50, 50, 50, 50, 50, 50, 50, g], modules }), spIdx).dormancyTriggerSeconds;
    expect(trigger(50, ['E03'])).toBeCloseTo(20, 12);
    expect(trigger(100, ['E03'])).toBeCloseTo(10, 12);
    expect(trigger(0, ['E03'])).toBeCloseTo(30, 12);
    // Without E03 the locus is inactive for a Sprinter (and it cannot rest at all).
    expect(trigger(100, [])).toBeCloseTo(20, 12);
    expect(profileOfGenome(w, w.genomes.intern(neutralGenome('B01')), spIdx).dormancy).toBeNull();
  });

  it('waking starts a 30 s lockout: without food it rests again exactly when the lockout ends', () => {
    const { w, s } = restingSprinter();
    const c = w.ents.cols;
    sugarAround(w, 64, 64, 0.5);
    // 10 s of wake conditions, then 5 s waking.
    let wokeAt = -1;
    for (let t = 0; t < 200 && wokeAt < 0; t++) {
      step(w);
      if (c.lifeState[s] === LIFE_ACTIVE) wokeAt = w.tick;
    }
    expect(wokeAt).toBeGreaterThan(0);
    expect(c.lockoutTimer[s]).toBe(30);
    // Take every trace of food away (test setup, ledger re-based) so the no-intake clock runs from now.
    fillField(w, 'sugar', 0);
    fillField(w, 'sugarN', 0);
    c.E[s] = 60; // labelled test state: enough energy (≥ 15) to prepare again after the lockout
    let preparedAt = -1;
    for (let t = 0; t < 600 && preparedAt < 0; t++) {
      step(w);
      if (c.lifeState[s] === LIFE_PREPARING) preparedAt = w.tick;
      else if (w.tick - wokeAt < 300) expect(c.lifeState[s]).toBe(LIFE_ACTIVE);
    }
    // The trigger (20 s) was met during the lockout; the attempt waits for the lockout (30 s).
    expect(preparedAt - wokeAt).toBe(300);
  });

  it('rests without moving, feeding or secreting; stress and inhibitor damage × 0.10', () => {
    const w = clearWater();
    const s = placeWith(w, 'B01', 64.5, 64.5, ['E01', 'E03']);
    run(w, 250);
    const c = w.ents.cols;
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    const x = c.x[s]!;
    const y = c.y[s]!;
    // Starch arrives next to it: an Active E01 carrier would secrete; a resting one does not.
    setField(w, 'starch', cellIndex(64, 64), 0.6);
    const sec = w.ledger.energy.secretion;
    run(w, 50);
    expect(w.ledger.energy.secretion).toBe(sec);
    expect(w.fields.eStarch![cellIndex(64, 64)]).toBe(0);
    expect(c.x[s]).toBe(x);
    expect(c.y[s]).toBe(y);
    expect(w.ledger.energy.earned).toBe(0);
    // Harsh water (salt far outside its range ⇒ suitability 0): 2 H/s becomes 0.2 H/s.
    fillField(w, 'salt', 1);
    step(w);
    expect(c.suitability[s]).toBe(0);
    const h0 = c.H[s]!;
    run(w, 10);
    expect(h0 - c.H[s]!).toBeCloseTo(0.2 * 10 * DT, 10);
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    // ... and an unsuitable environment is not a wake condition, even with food.
    sugarAround(w, 64, 64, 0.5);
    run(w, 150);
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    expect(c.stateTimer[s]).toBe(0);
  });

  it('a resting organism is still prey', () => {
    const { w, s } = restingSprinter();
    const b = w.ents.cols.birthId[s]!;
    placeWith(w, 'P01', 64.6, 64.5, [], { E: 40 });
    run(w, 20);
    expect(field(w.lineage, 'deathCause', b)).toBe(R.DEATH_PREDATION);
  });

  it('no immortal dormancy: without waking energy it stays resting until it starves', () => {
    const { w, s } = restingSprinter();
    const c = w.ents.cols;
    const b = c.birthId[s]!;
    c.E[s] = 0.5; // labelled test state: too little energy to pay the 5 E wake cost
    sugarAround(w, 64, 64, 0.5);
    let t = 0;
    while (c.alive[s] === 1 && c.birthId[s] === b && t < 2000) {
      step(w);
      t++;
      if (c.alive[s] === 1 && c.birthId[s] === b) expect(c.lifeState[s]).toBe(LIFE_RESTING);
    }
    expect(field(w.lineage, 'deathCause', b)).toBe(R.DEATH_STARVATION);
    expect(w.ledger.energy.dormancy).toBe(10); // prepared once, never woke
  });

  it('too dry for 10 s triggers rest (RESTING_DRY) and a dry cell never satisfies waking', () => {
    const reg = registry();
    const b01 = reg.species.B01!;
    const thirsty: ContentRegistry = { ...reg, species: { ...reg.species, B01: { ...b01, tolerances: { ...b01.tolerances, moisture: [1, 1] } } } };
    const w = realizeRecipe(thirsty, { ...reg.recipes.FIRST_DISH_V1!, removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' }, { worldId: 'dry' });
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) w.grid.substrate[cellIndex(64 + dx, 64 + dy)] = SUB_GEL;
    w.grid.geometryVersion++;
    const s = placeWith(w, 'B01', 64.5, 64.5, ['E03']);
    sugarAround(w, 64, 64, 1);
    const c = w.ents.cols;
    let at = -1;
    for (let t = 0; t < 300 && at < 0; t++) {
      step(w);
      if (c.lifeState[s] === LIFE_PREPARING) at = t;
    }
    expect(at).toBe(99); // 10 s of moisture suitability 0 (< 0.20); well before the 20 s food trigger
    run(w, 50);
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    expect(c.limitCode[s]).toBe(R.RESTING_DRY);
    run(w, 200);
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
  });

  it('dormancy clocks are saved state: a reload mid-rest ends at the same hashes as an uninterrupted run', () => {
    const a = restingSprinter();
    const b = restingSprinter();
    run(a.w, 30);
    run(b.w, 30);
    sugarAround(a.w, 64, 64, 0.5);
    sugarAround(b.w, 64, 64, 0.5);
    run(a.w, 57);
    run(b.w, 57);
    const reloaded = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(b.w))) as ReturnType<typeof serializeWorld>);
    expect(stateHash(reloaded)).toBe(stateHash(a.w));
    const hashes = (w: World) => {
      const out: string[] = [];
      for (let t = 0; t < 120; t++) {
        step(w);
        if (t % 20 === 0) out.push(stateHash(w));
      }
      return out;
    };
    expect(hashes(reloaded)).toEqual(hashes(a.w));
    expect(a.w.ents.cols.lifeState[a.s]).toBe(LIFE_ACTIVE);
    expect(reloaded.ents.cols.lifeState[b.s]).toBe(LIFE_ACTIVE);
  });

  it('a schema 1 state (before the dryTimer column) migrates with it empty', () => {
    const { w } = restingSprinter();
    const state = serializeWorld(w);
    const cols = { ...state.entities.columns } as Record<string, unknown>;
    delete cols.dryTimer;
    const old = { ...state, schemaVersion: 1, entities: { ...state.entities, columns: cols } } as unknown as ReturnType<typeof serializeWorld>;
    const back = deserializeWorld(JSON.parse(JSON.stringify(old)) as ReturnType<typeof serializeWorld>);
    expect(Array.from(back.ents.cols.dryTimer.subarray(0, back.ents.highWater)).every((v) => v === 0)).toBe(true);
    // A schema 1 world could not rest, so an empty timer is exact there; here the resting sprinter's
    // dry timer was already 0 (food-scarce rest), so the hash is unchanged.
    expect(stateHash(back)).toBe(stateHash(w));
    // The current schema never omits the column.
    expect(() => deserializeWorld(JSON.parse(JSON.stringify({ ...state, entities: { ...state.entities, columns: cols } })) as ReturnType<typeof serializeWorld>)).toThrow(/dryTimer missing/);
  });
});
