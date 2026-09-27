/**
 * Regressions for defects found by the G0 adversarial review (see docs/DECISIONS.md D-0009).
 * Each test reproduces the reviewer's failure scenario and pins the corrected behavior.
 */
import { describe, expect, it } from 'vitest';
import { queueCommand } from '../../src/sim/commands';
import { FLAG } from '../../src/sim/entities';
import { cellIndex, ST_STONE } from '../../src/sim/grid';
import { stageIntake } from '../../src/sim/intake';
import { checkLedger } from '../../src/sim/ledger';
import { stageSenseAndMove } from '../../src/sim/movement';
import { rebuildIndex } from '../../src/sim/spatial';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import { R } from '../../src/sim/reasons';
import type { World } from '../../src/sim/world';
import { aliveOf, clearWater, fillField, place, setField } from '../helpers/world';

const CELL = cellIndex(64, 64);

function pin(world: World, slots: number[], x = 64.5, y = 64.5): void {
  for (const s of slots) {
    world.ents.cols.x[s] = x;
    world.ents.cols.y[s] = y;
  }
  rebuildIndex(world);
}

describe('G0 review regressions', () => {
  it('stage 9 ignores organisms that died in stage 7 of the same tick (cell load is rebuilt)', () => {
    const w = clearWater();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) w.grid.structure[cellIndex(64 + dx, 64 + dy)] = ST_STONE;
    w.grid.geometryVersion++;
    const parent = place(w, 'B01', 64.5, 64.5, { B: 2, N: 0.2, E: 90, H: 100, age: 20 });
    // Seven dying residents fill the cell to load 9 > 8 at stage 4, but all die in stage 7.
    for (let k = 0; k < 7; k++) place(w, 'B01', 64.2 + k * 0.08, 64.3, { E: 0, H: 0.0001 });
    step(w);
    expect(aliveOf(w, 'B01').length).toBe(2); // the parent divided into its own cell
    expect(w.ents.cols.divBlockCode[parent]).toBe(R.NONE);
  });

  it('a daughter may be placed in the parent cell when that cell is exactly at capacity', () => {
    const w = clearWater();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) w.grid.structure[cellIndex(64 + dx, 64 + dy)] = ST_STONE;
    w.grid.geometryVersion++;
    place(w, 'B01', 64.5, 64.5, { B: 2, N: 0.2, E: 90, H: 100, age: 20 });
    for (let k = 0; k < 6; k++) place(w, 'B01', 64.2 + k * 0.1, 64.3, { E: 50 }); // load 2 + 6 = 8
    step(w);
    expect(w.events.totals.birth ?? 0).toBe(1);
  });

  it('inoculation capacity checks see the same cell load after save/reload as in an uninterrupted run', () => {
    const build = () => {
      const w = clearWater();
      // Eight organisms that all die in stage 7 of tick 0 leave the cell empty for tick 1.
      for (let k = 0; k < 8; k++) place(w, 'B01', 64.1 + k * 0.1, 64.5, { E: 0, H: 0.0001 });
      queueCommand(w, 'late', { kind: 'inoculate', speciesId: 'B01', x: 64.5, y: 64.5, radius: 0.4, count: 5 }, 1);
      return w;
    };
    const a = build();
    step(a);
    const b = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(a))) as ReturnType<typeof serializeWorld>);
    step(a);
    step(b);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(a.commands.log.at(-1)!.result!.accepted).toBe(5);
  });

  it('nutrient limiting fractions are identical for co-located identical organisms regardless of slot order', () => {
    const w = clearWater();
    fillField(w, 'nutrient', 0);
    setField(w, 'sugar', CELL, 1);
    setField(w, 'nutrient', CELL, 0.0005);
    const a = place(w, 'B01', 64.3, 64.5);
    const b = place(w, 'B01', 64.7, 64.5);
    stageSenseAndMove(w);
    pin(w, [a, b]);
    stageIntake(w);
    const ga = w.ents.cols.B[a]! - 1;
    const gb = w.ents.cols.B[b]! - 1;
    expect(ga).toBeGreaterThan(0);
    expect(gb).toBeCloseTo(ga, 14);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('oxygen made by photosynthesis this tick cannot fund an aerobic consumer in the same pass', () => {
    const w = clearWater();
    w.settings.lid = 'closed';
    fillField(w, 'oxygen', 0);
    setField(w, 'sugar', CELL, 1);
    const alga = place(w, 'A01', 64.3, 64.5);
    const bact = place(w, 'B01', 64.7, 64.5);
    stageSenseAndMove(w);
    pin(w, [alga, bact]);
    stageIntake(w);
    expect(w.ents.cols.B[alga]!).toBeGreaterThan(1.5);
    expect(w.ents.cols.B[bact]).toBe(1);
    expect(w.ents.cols.limitCode[bact]).toBe(R.OXYGEN_LIMITED);
  });

  it('a weighted genome keeps the availability factor (same request as ordered when one food is present)', () => {
    const intake = (weighted: boolean) => {
      const w = clearWater();
      setField(w, 'detritus', CELL, 0.05);
      setField(w, 'detritusN', CELL, 0.005);
      const s = place(w, 'B04', 64.5, 64.5);
      if (weighted) {
        const g = w.genomes.get(w.ents.cols.genome[s]!);
        w.ents.cols.genome[s] = w.genomes.intern({ ...g, policy: 'weighted', weights: [0.4, 0.2, 0.2, 0.2] });
      }
      stageSenseAndMove(w);
      pin(w, [s]);
      stageIntake(w);
      return w.ents.cols.B[s]! - 1;
    };
    expect(intake(true)).toBeCloseTo(intake(false), 14);
  });

  it('no feeding cue, intake timestamp or first-intake milestone when nothing was consumed', () => {
    const w = clearWater();
    fillField(w, 'nutrient', 0);
    setField(w, 'sugar', CELL, 10);
    const s = place(w, 'B01', 64.5, 64.5);
    run(w, 20);
    expect(w.ents.cols.B[s]).toBe(1);
    expect(w.ents.cols.flags[s]! & FLAG.feeding).toBe(0);
    expect(w.ents.cols.lastIntakeTick[s]).toBe(-1);
    expect(w.events.milestones.firstIntake).toBeUndefined();
  });

  it('stress shows only after 3 continuous seconds below threshold', () => {
    const w = clearWater();
    const s = place(w, 'B01', 64.5, 64.5);
    const cell = cellIndex(64, 64);
    const setSalt = (v: number) => {
      for (let y = 60; y < 70; y++) for (let x = 60; x < 70; x++) setField(w, 'salt', cellIndex(x, y), v);
    };
    const hold = (ticks: number) => {
      for (let t = 0; t < ticks; t++) {
        w.ents.cols.x[s] = 64.5;
        w.ents.cols.y[s] = 64.5;
        stageSenseAndMove(w);
        w.tick++;
      }
    };
    setSalt(5); // far outside 0–0.2 ⇒ suitability 0
    hold(20);
    setSalt(0);
    hold(10);
    setSalt(5);
    hold(15);
    expect(w.ents.cols.flags[s]! & FLAG.stressed).toBe(0); // 2 s + 1.5 s, never 3 s continuous
    hold(15);
    expect(w.ents.cols.flags[s]! & FLAG.stressed).not.toBe(0);
    void cell;
  });

  it('the energy ledger records only energy actually paid, maintenance before movement', () => {
    const w = clearWater();
    place(w, 'B01', 64.5, 64.5, { E: 0 });
    run(w, 30);
    expect(w.ledger.energy.maintenance).toBeGreaterThanOrEqual(0);
    expect(w.ledger.energy.movement).toBeGreaterThanOrEqual(0);
    expect(w.ledger.energy.maintenance + w.ledger.energy.movement).toBeCloseTo(0, 12);
  });
});
