/**
 * P3.7 E04 Surface anchor and the D-0035 usable-intake clock (SPEC §9 E04, §9.19, §6.7; CT §7.1,
 * §12.6; D04 §2 C06; BUILD_DIRECTIVE P3.7; src/sim/{anchor,intakeClock}.ts).
 *
 *  - Attach: an Active carrier with E > 35 beside support anchors on exactly the 50th tick of
 *    continuous adjacency (not the 49th); a one-tick gap restarts the count; E ≤ 35 never counts.
 *  - Anchored: exactly 0.01 E of 'upkeep' per tick (0.10 E/s × 0.1 s) and zero movement, even with a
 *    richer cell in sensing range; FLAG.attached is never set.
 *  - Detach on each cause — 100 ticks without usable intake (the clock), the stone erased, E < 15 —
 *    then a 100-tick reattach lockout (no attach clock during it; reattach 50 ticks after it ends).
 *  - Resting (a real E03 carrier pushed into Resting by a labelled forced state) releases; once Active
 *    again it reattaches through the same clock.
 *  - Division: both daughters start unanchored with fresh clocks; the supported one reattaches.
 *  - A non-motile Y01 carrier anchors and pays the upkeep with an unchanged profile speed and position.
 *  - One rim cell is support (PROPOSED owner decision: the dish edge counts).
 *  - An anchored B01 stays valid prey for P02 (PROPOSED owner decision: anchored is still "free").
 *  - The clock: stays 0 for non-carriers, counts for carriers without usable intake, resets on usable
 *    intake.
 *
 * Worlds: clear water (FIRST_DISH_V1 without stones, background sugar 0) under the shipped manifest
 * plus E04 and E07 (registryWith; the lead enables them after the wave). Stones are placed and erased
 * with the real Lab command (radius 1 is a five-cell plus). Test-only state (E, B, age, position,
 * life state) is set directly and labelled; material overrides are logged as ledger inputs.
 */
import { describe, expect, it } from 'vitest';
import { anchorSupported } from '../../src/sim/anchor';
import { applyNow, introduceOrganism } from '../../src/sim/commands';
import { DT, GRID_W } from '../../src/sim/constants';
import { FLAG, LIFE_ACTIVE, LIFE_RESTING } from '../../src/sim/entities';
import { cellIndex, inBounds, inMask, maskCells, ST_OUTSIDE, ST_STONE } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { preyAllowed } from '../../src/sim/movement';
import { profileOf } from '../../src/sim/profiles';
import { realizeRecipe } from '../../src/sim/recipes';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { registry, setField } from '../helpers/world';

const SHIPPED_MODULES = registry().manifest.enabledModules;
const REG = registryWith({ enabledModules: [...SHIPPED_MODULES, 'E04', 'E07'].sort() });

/** Stone plus centred on (40, 64): cells (40,63) (39,64) (40,64) (41,64) (40,65). */
const STONE: [number, number] = [40.5, 64.5];
/** Beside the stone's east arm (41,64). */
const BESIDE: [number, number] = [42.5, 64.5];
/** Two cells further east: no stone in its four neighbours. */
const AWAY: [number, number] = [44.5, 64.5];

type State = Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>>;

function dish(): World {
  const base = REG.recipes.FIRST_DISH_V1!;
  return realizeRecipe(
    REG,
    { ...base, id: 'TEST_E04', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' },
    { worldId: 'e04' },
  );
}

let cmdN = 0;
function stone(w: World, kind: 'placeStructure' | 'eraseStructure'): void {
  const payload = kind === 'placeStructure' ? { kind, structure: 'stone', points: [STONE], radius: 1 } : { kind, points: [STONE], radius: 1 };
  const res = applyNow(w, `e04-${++cmdN}`, payload as never).result as { accepted: number };
  expect(res.accepted).toBe(5);
}

/** Place one organism carrying `modules` at an exact position (material overrides logged as inputs). */
function placeWith(w: World, speciesId: string, [x, y]: readonly [number, number], modules: readonly string[], state: State = {}): number {
  const slot = introduceOrganism(w, speciesIndex(w, speciesId), cellIndex(Math.floor(x), Math.floor(y)), 'test', { modules, exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  const c = w.ents.cols;
  c.x[slot] = x;
  c.y[slot] = y;
  for (const key of ['B', 'N', 'E', 'H', 'age'] as const) {
    const v = state[key];
    if (v === undefined) continue;
    if (key === 'B') w.ledger.inputs.c += v - c.B[slot]!;
    if (key === 'N') w.ledger.inputs.n += v - c.N[slot]!;
    c[key][slot] = v;
  }
  rebuildIndex(w);
  return slot;
}

/** Test-only position change (labelled): no movement cost, no ledger effect. */
function teleport(w: World, slot: number, [x, y]: readonly [number, number]): void {
  w.ents.cols.x[slot] = x;
  w.ents.cols.y[slot] = y;
  rebuildIndex(w);
}

function feed(w: World, [x, y]: readonly [number, number], amount: number): void {
  setField(w, 'sugar', cellIndex(Math.floor(x), Math.floor(y)), amount);
}

/** Remove every sugar amount in the dish (logged as exports through setField). */
function zeroSugar(w: World): void {
  for (const cell of maskCells()) if (w.fields.sugar![cell]! !== 0) setField(w, 'sugar', cell, 0);
}

/** A stone with a Y01 E04 carrier beside it (E 50 unless given). */
function stoneAndYeast(state: State = {}, modules: readonly string[] = ['E04']): { w: World; s: number } {
  const w = dish();
  stone(w, 'placeStructure');
  const s = placeWith(w, 'Y01', BESIDE, modules, state);
  expect(anchorSupported(w, s)).toBe(true);
  return { w, s };
}

/** Step until the slot anchors; returns the tick count it took (throws after `max`). */
function stepsToAnchor(w: World, s: number, max = 400): number {
  for (let k = 1; k <= max; k++) {
    step(w);
    if (w.ents.cols.anchorState[s] === 1) return k;
  }
  throw new Error('never anchored');
}

/** After a detach on tick 0: the lockout holds for ticks 1–99, ends on tick 100, and it reattaches on tick 149. */
function expectLockoutThenReattach(w: World, s: number): void {
  const c = w.ents.cols;
  expect(c.anchorState[s]).toBe(0);
  expect(c.anchorLockout[s]).toBeCloseTo(10, 9);
  for (let k = 1; k <= 99; k++) {
    step(w);
    expect(c.anchorState[s]).toBe(0);
    expect(c.anchorLockout[s]).toBeGreaterThan(0);
    expect(c.anchorSeconds[s]).toBe(0);
  }
  step(w); // tick 100: the lockout ends and the attach clock starts
  expect(c.anchorLockout[s]).toBe(0);
  expect(c.anchorState[s]).toBe(0);
  for (let k = 101; k <= 148; k++) {
    step(w);
    expect(c.anchorState[s]).toBe(0);
  }
  step(w);
  expect(c.anchorState[s]).toBe(1);
}

describe('P3.7 E04 surface anchor', () => {
  it('registers E04 with its recorded numbers; the profile reads them', () => {
    const { w, s } = stoneAndYeast();
    expect(profileOf(w, s).anchor).toEqual({ attachSeconds: 5, minEnergy: 35, attachedUpkeep: 0.1, detachNoIntakeSeconds: 10, detachEnergy: 15, lockoutSeconds: 10 });
    const plain = placeWith(w, 'Y01', AWAY, []);
    expect(profileOf(w, plain).anchor).toBeNull();
  });

  it('anchors on exactly the 50th tick of continuous adjacency, not the 49th', () => {
    const { w, s } = stoneAndYeast();
    const c = w.ents.cols;
    for (let k = 1; k <= 49; k++) {
      step(w);
      expect(c.anchorState[s]).toBe(0);
    }
    expect(c.anchorSeconds[s]).toBeCloseTo(4.9, 9);
    step(w);
    expect(c.anchorState[s]).toBe(1);
    expect(c.flags[s]! & FLAG.attached).toBe(0);
  });

  it('a gap in adjacency resets the attach clock (gap reset)', () => {
    const { w, s } = stoneAndYeast();
    const c = w.ents.cols;
    for (let k = 1; k <= 30; k++) step(w);
    expect(c.anchorSeconds[s]).toBeCloseTo(3.0, 9);
    teleport(w, s, AWAY); // test-only: one tick out of reach
    step(w);
    expect(c.anchorSeconds[s]).toBe(0);
    teleport(w, s, BESIDE);
    for (let k = 1; k <= 49; k++) {
      step(w);
      expect(c.anchorState[s]).toBe(0);
    }
    step(w);
    expect(c.anchorState[s]).toBe(1);
  });

  it('attaches only with E above 35: at 35 the clock never runs, and E falling to 35 resets it', () => {
    const low = stoneAndYeast({ E: 35 }); // test-only energy; Y01 has no food here, so E only falls
    for (let k = 1; k <= 80; k++) {
      step(low.w);
      expect(low.w.ents.cols.anchorSeconds[low.s]).toBe(0);
      expect(low.w.ents.cols.anchorState[low.s]).toBe(0);
    }
    const { w, s } = stoneAndYeast({ E: 40 });
    const c = w.ents.cols;
    for (let k = 1; k <= 20; k++) step(w);
    expect(c.anchorSeconds[s]).toBeCloseTo(2.0, 9);
    c.E[s] = 35; // test-only: energy at the threshold for one tick
    step(w);
    expect(c.anchorSeconds[s]).toBe(0);
    c.E[s] = 40;
    expect(stepsToAnchor(w, s)).toBe(50);
  });

  it('anchored: exactly 0.01 E upkeep per tick, zero movement and no movement cost, even with richer food in range', () => {
    const w = dish();
    stone(w, 'placeStructure');
    const s = placeWith(w, 'B01', BESIDE, ['E04']);
    feed(w, BESIDE, 0.5);
    const c = w.ents.cols;
    expect(stepsToAnchor(w, s, 50)).toBe(50);
    // Richer food two cells east: an unanchored B01 would move there.
    feed(w, AWAY, 5);
    const x0 = c.x[s]!;
    const y0 = c.y[s]!;
    for (let k = 0; k < 60; k++) {
      const before = { ...w.ledger.energy };
      feed(w, BESIDE, 0.5); // keep usable intake so the anchor holds (logged input)
      step(w);
      expect(c.anchorState[s]).toBe(1);
      expect(w.ledger.energy.upkeep - before.upkeep).toBeCloseTo(0.01, 12);
      expect(w.ledger.energy.movement - before.movement).toBe(0);
      expect(c.movedThisTick[s]).toBe(0);
      expect(c.flags[s]! & FLAG.moving).toBe(0);
    }
    expect(c.x[s]).toBe(x0);
    expect(c.y[s]).toBe(y0);
    // Control: the same organism, once unanchored by a labelled state change, heads for the richer cell.
    c.anchorState[s] = 0;
    c.anchorLockout[s] = 10;
    for (let k = 0; k < 30; k++) step(w);
    expect(c.x[s]).toBeGreaterThan(x0);
  });

  it('detaches after 100 ticks without usable intake (the clock), then a 100-tick lockout', () => {
    const { w, s } = stoneAndYeast();
    feed(w, BESIDE, 0.5);
    const c = w.ents.cols;
    expect(stepsToAnchor(w, s)).toBe(50);
    // Feed until the clock reads 0 on a fed tick, then take the food away.
    for (let k = 0; k < 5; k++) {
      feed(w, BESIDE, 0.5);
      step(w);
    }
    expect(c.noUsableIntakeSeconds[s]).toBe(0);
    zeroSugar(w);
    for (let k = 1; k <= 99; k++) {
      step(w);
      expect(c.anchorState[s]).toBe(1);
    }
    expect(c.noUsableIntakeSeconds[s]).toBeCloseTo(9.9, 9);
    step(w);
    expect(c.anchorState[s]).toBe(0);
    // Feed again so the clock cannot detach it after reattaching.
    feed(w, BESIDE, 0.5);
    expectLockoutThenReattach(w, s);
  });

  it('detaches when its stone is erased, then a 100-tick lockout', () => {
    const { w, s } = stoneAndYeast();
    feed(w, BESIDE, 0.5);
    expect(stepsToAnchor(w, s)).toBe(50);
    stone(w, 'eraseStructure');
    expect(anchorSupported(w, s)).toBe(false);
    step(w);
    expect(w.ents.cols.anchorState[s]).toBe(0);
    stone(w, 'placeStructure'); // support is back at once: only the lockout keeps it free
    feed(w, BESIDE, 0.5);
    expectLockoutThenReattach(w, s);
  });

  it('detaches when E falls below 15, then a 100-tick lockout', () => {
    const { w, s } = stoneAndYeast();
    feed(w, BESIDE, 0.5);
    const c = w.ents.cols;
    expect(stepsToAnchor(w, s)).toBe(50);
    zeroSugar(w); // no intake this tick, so E only falls
    c.E[s] = 15.03; // test-only: stage 7 maintenance (≈ 0.042 E/tick) takes it below 15 this tick
    step(w);
    expect(c.E[s]).toBeLessThan(15);
    expect(c.anchorState[s]).toBe(0);
    c.E[s] = 60; // test-only: enough to reattach (above 35) once the lockout ends
    feed(w, BESIDE, 2);
    expectLockoutThenReattach(w, s);
  });

  it('resting releases the anchor (E03 carrier, labelled forced Resting); once Active it reattaches', () => {
    const { w, s } = stoneAndYeast({}, ['E03', 'E04']);
    feed(w, BESIDE, 0.5);
    const c = w.ents.cols;
    expect(stepsToAnchor(w, s)).toBe(50);
    c.lifeState[s] = LIFE_RESTING; // test-only forced state: the real machine needs 30 s without food
    step(w);
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    expect(c.anchorState[s]).toBe(0);
    expect(c.anchorLockout[s]).toBeCloseTo(10, 9);
    for (let k = 0; k < 30; k++) {
      step(w);
      expect(c.anchorState[s]).toBe(0); // never attaches while resting
    }
    c.lifeState[s] = LIFE_ACTIVE; // test-only: woken
    feed(w, BESIDE, 0.5);
    // 31 of the 100 lockout ticks are spent; 69 remain, then the 50-tick attach clock.
    expect(stepsToAnchor(w, s)).toBe(69 + 50);
  });

  it('division: both daughters start unanchored with fresh clocks; the supported one reattaches', () => {
    const { w, s } = stoneAndYeast();
    feed(w, BESIDE, 0.5);
    const c = w.ents.cols;
    expect(stepsToAnchor(w, s)).toBe(50);
    // Test-only state: ready to divide (B ≥ 2 B0', E ≥ 60, age ≥ min interval).
    w.ledger.inputs.c += 4 - c.B[s]!;
    c.B[s] = 4;
    c.E[s] = 95;
    c.age[s] = 40;
    let other = -1;
    for (let k = 0; k < 50 && other < 0; k++) {
      feed(w, BESIDE, 0.5);
      step(w);
      for (let i = 0; i < w.ents.highWater; i++) if (i !== s && c.alive[i] === 1) other = i;
    }
    expect(other).toBeGreaterThanOrEqual(0);
    for (const d of [s, other]) {
      expect(c.anchorState[d]).toBe(0);
      expect(c.anchorLockout[d]).toBe(0);
      expect(c.noUsableIntakeSeconds[d]).toBe(0);
      expect(w.genomes.get(c.genome[d]!).modules).toEqual(['E04']);
    }
    expect(c.anchorSeconds[s]).toBe(0);
    expect(anchorSupported(w, s)).toBe(true); // the retained daughter keeps its place beside the stone
    expect(stepsToAnchor(w, s)).toBe(50);
  });

  it('a non-motile Y01 carrier anchors and pays the upkeep; its speed and position do not change', () => {
    const { w, s } = stoneAndYeast();
    feed(w, BESIDE, 0.5);
    const plain = placeWith(w, 'Y01', [42.5, 70.5], []);
    expect(profileOf(w, s).speed).toBe(profileOf(w, plain).speed);
    expect(profileOf(w, s).speed).toBe(0);
    expect(profileOf(w, s).selfPropelled).toBe(false);
    expect(stepsToAnchor(w, s)).toBe(50);
    const before = w.ledger.energy.upkeep;
    feed(w, BESIDE, 0.5);
    step(w);
    expect(w.ledger.energy.upkeep - before).toBeCloseTo(0.01, 12);
    expect(w.ents.cols.x[s]).toBe(BESIDE[0]);
    expect(w.ents.cols.y[s]).toBe(BESIDE[1]);
  });

  it('one rim cell supports (the dish edge counts)', () => {
    const w = dish();
    // An open water cell whose only support is a neighbour outside the dish.
    let rim = -1;
    for (const cell of maskCells()) {
      const x = cell % GRID_W;
      const y = Math.floor(cell / GRID_W);
      const outside = [
        [x, y - 1],
        [x + 1, y],
        [x, y + 1],
        [x - 1, y],
      ].filter(([nx, ny]) => !inBounds(nx!, ny!) || w.grid.structure[cellIndex(nx!, ny!)] === ST_OUTSIDE);
      if (outside.length === 1 && w.grid.structure[cell] !== ST_STONE && inMask(x, y)) {
        rim = cell;
        break;
      }
    }
    expect(rim).toBeGreaterThanOrEqual(0);
    const s = placeWith(w, 'Y01', [(rim % GRID_W) + 0.5, Math.floor(rim / GRID_W) + 0.5], ['E04']);
    expect(anchorSupported(w, s)).toBe(true);
    expect(stepsToAnchor(w, s)).toBe(50);
    // A cell one step inward has no support.
    const inner = placeWith(w, 'Y01', BESIDE, ['E04']);
    expect(anchorSupported(w, inner)).toBe(false);
  });

  it('an anchored B01 stays valid prey for P02, which captures it', () => {
    const w = dish();
    stone(w, 'placeStructure');
    const s = placeWith(w, 'B01', BESIDE, ['E04']);
    feed(w, BESIDE, 0.5);
    expect(stepsToAnchor(w, s, 50)).toBe(50);
    const pred = placeWith(w, 'P02', [46.5, 64.5], [], { E: 40 });
    const sp = w.species[speciesIndex(w, 'P02')]!;
    expect(preyAllowed(w, sp, s)).toBe(true);
    const birth = w.ents.cols.birthId[s]!;
    let eaten = false;
    for (let k = 0; k < 200 && !eaten; k++) {
      feed(w, BESIDE, 0.5);
      step(w);
      eaten = !w.ents.refValid(s, birth);
    }
    expect(eaten).toBe(true);
    expect(w.ents.cols.mealC[pred]! > 0 || w.ents.cols.alive[pred] === 1).toBe(true);
  });

  it('the usable-intake clock: 0 for non-carriers, counts for carriers without usable intake, resets on usable intake', () => {
    const w = dish();
    const plain = placeWith(w, 'Y01', [30.5, 64.5], []);
    const carrier = placeWith(w, 'Y01', [30.5, 70.5], ['E04']);
    const c = w.ents.cols;
    for (let k = 1; k <= 40; k++) {
      step(w);
      expect(c.noUsableIntakeSeconds[plain]).toBe(0);
      expect(c.noUsableIntakeSeconds[carrier]).toBeCloseTo(k * DT, 9);
    }
    feed(w, [30.5, 70.5], 0.5);
    step(w);
    expect(c.flags[carrier]! & FLAG.usableIntake).not.toBe(0);
    expect(c.noUsableIntakeSeconds[carrier]).toBe(0);
    step(w);
    expect(c.noUsableIntakeSeconds[plain]).toBe(0);
  });

  it('the ledger closes and Σ energy spent = Σ ledger categories over an anchor cycle', () => {
    const { w, s } = stoneAndYeast();
    feed(w, BESIDE, 0.5);
    const c = w.ents.cols;
    const e0 = { ...w.ledger.energy };
    const E0 = c.E[s]!;
    for (let k = 0; k < 300; k++) step(w);
    const d = (key: keyof typeof e0) => w.ledger.energy[key] - e0[key];
    const balance = d('earned') - d('maintenance') - d('surcharge') - d('upkeep') - d('movement') - d('secretion') - d('division') - d('dormancy') - d('construction') - d('dissipated') - d('other');
    expect(c.alive[s]).toBe(1);
    expect(c.E[s]! - E0).toBeCloseTo(balance, 9);
    expect(d('upkeep')).toBeGreaterThan(0);
    expect(checkLedger(w).ok).toBe(true);
  });
});
