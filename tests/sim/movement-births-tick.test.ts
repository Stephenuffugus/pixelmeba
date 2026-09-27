import { describe, expect, it } from 'vitest';
import { applyNow, queueCommand } from '../../src/sim/commands';
import { cellIndex, ST_STONE } from '../../src/sim/grid';
import { stageSenseAndMove, traceFraction } from '../../src/sim/movement';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import { R } from '../../src/sim/reasons';
import { clearWater, place, aliveOf } from '../helpers/world';

describe('stage 4 movement (P0.5)', () => {
  it('never tunnels through stone, even when chasing food on the other side', () => {
    const w = clearWater();
    for (let y = 40; y < 90; y++) w.grid.structure[cellIndex(66, y)] = ST_STONE;
    w.grid.geometryVersion++;
    for (let y = 60; y < 70; y++) w.fields.sugar![cellIndex(67, y)] = 5;
    const s = place(w, 'B01', 65.9, 64.5);
    for (let t = 0; t < 300; t++) {
      step(w);
      if (w.ents.cols.alive[s] !== 1) break;
      expect(Math.floor(w.ents.cols.x[s]!)).not.toBe(66);
      expect(w.ents.cols.x[s]).toBeLessThan(66);
    }
  });

  it('traceFraction stops before the first blocked cell', () => {
    const w = clearWater();
    w.grid.structure[cellIndex(66, 64)] = ST_STONE;
    w.grid.geometryVersion++;
    const sp = w.species.find((s) => s.id === 'B01')!;
    const t = traceFraction(w, sp, 65.5, 64.5, 67.5, 64.5);
    expect(65.5 + 2 * t).toBeLessThan(66);
    expect(65.5 + 2 * t).toBeGreaterThan(65.99);
  });

  it('movement is deterministic and wanders when every candidate scores the same', () => {
    const run1 = clearWater();
    const run2 = clearWater();
    const a = place(run1, 'B01', 64.5, 64.5);
    const b = place(run2, 'B01', 64.5, 64.5);
    for (let t = 0; t < 40; t++) {
      stageSenseAndMove(run1);
      stageSenseAndMove(run2);
      run1.tick++;
      run2.tick++;
    }
    expect(run1.ents.cols.x[a]).toBe(run2.ents.cols.x[b]);
    expect(run1.ents.cols.y[a]).toBe(run2.ents.cols.y[b]);
    expect(Math.hypot(run1.ents.cols.x[a]! - 64.5, run1.ents.cols.y[a]! - 64.5)).toBeGreaterThan(0);
  });

  it('non-motile species never move', () => {
    const w = clearWater();
    const s = place(w, 'A01', 64.5, 64.5);
    run(w, 50);
    expect(w.ents.cols.x[s]).toBe(64.5);
    expect(w.ents.cols.y[s]).toBe(64.5);
  });
});

describe('stage 9 births with immutable proposals (P0.6)', () => {
  function readyParent() {
    const w = clearWater();
    const s = place(w, 'B01', 64.5, 64.5, { B: 2, N: 0.2, E: 90, H: 100, age: 20 });
    return { w, s };
  }

  it('a ready parent divides once, splitting every pool and charging the cost once', () => {
    const { w, s } = readyParent();
    const birthBefore = w.ents.cols.birthId[s]!;
    const E = 90;
    run(w, 1);
    const daughters = aliveOf(w, 'B01');
    expect(daughters).toHaveLength(2);
    const c = w.ents.cols;
    const [d0, d1] = daughters as [number, number];
    expect(c.B[d0]! + c.B[d1]!).toBeCloseTo(2, 2); // minus a tick of starvation-free maintenance-only biomass: B unchanged
    expect(c.B[d0]).toBeCloseTo(c.B[d1]!, 12);
    expect(c.N[d0]).toBeCloseTo(c.N[d1]!, 12);
    // Energy: one tick of maintenance, then cost 20, then equal split.
    expect(c.E[d0]! + c.E[d1]!).toBeLessThan(E - 20 + 1e-9);
    expect(c.E[d0]).toBeCloseTo(c.E[d1]!, 12);
    expect(c.age[d0]).toBe(0);
    expect(c.age[d1]).toBe(0);
    // Both daughters have new birth identities whose parent is the pre-division individual.
    for (const d of daughters) {
      expect(c.birthId[d]).not.toBe(birthBefore);
      expect(w.lineage.parent[c.birthId[d]!]).toBe(birthBefore);
      expect(w.lineage.parent[c.birthId[d]!]).not.toBe(c.birthId[d]);
    }
    // The retained daughter keeps the entityId.
    expect(c.entityId[d0] === c.entityId[s] || c.entityId[d1] === c.entityId[s]).toBe(true);
  });

  function crowdedParent() {
    // Own cell over capacity: parent (load 2) + six residents (1 each) + one small resident (0.4) = 8.4.
    const w = clearWater();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) w.grid.structure[cellIndex(64 + dx, 64 + dy)] = ST_STONE;
    w.grid.geometryVersion++;
    const s = place(w, 'B01', 64.5, 64.5, { B: 2, N: 0.2, E: 90, H: 100, age: 20 });
    for (let k = 0; k < 6; k++) place(w, 'B01', 64.2 + k * 0.1, 64.3, { E: 5 });
    const small = place(w, 'B01', 64.8, 64.7, { B: 0.4, N: 0.04, E: 5 });
    return { w, s, small };
  }

  it('a blocked birth keeps the same proposal, charges nothing, and commits once space opens (also across save/reload)', () => {
    const { w, s, small } = crowdedParent();
    run(w, 1);
    const c = w.ents.cols;
    expect(c.divBlockCode[s]).toBe(R.DIV_BLOCK_CROWDING);
    const p0 = c.propG0[s];
    const p1 = c.propG1[s];
    const Eblocked = c.E[s]!;
    expect(p0).toBeGreaterThanOrEqual(0);
    run(w, 5);
    expect(c.propG0[s]).toBe(p0);
    expect(c.propG1[s]).toBe(p1);
    expect(c.B[s]).toBe(2);
    expect(c.E[s]).toBeLessThan(Eblocked); // only maintenance was paid, never the division cost
    expect(c.E[s]).toBeGreaterThan(Eblocked - 1);
    // Save/reload keeps the proposal unchanged.
    const w2 = deserializeWorld(serializeWorld(w));
    expect(stateHash(w2)).toBe(stateHash(w));
    expect(w2.ents.cols.propG0[s]).toBe(p0);
    // The small resident dies in stage 7; stage 9 sees load 8 and the saved proposal commits.
    w2.ents.cols.H[small] = 0.0001;
    w2.ents.cols.E[small] = 0;
    const parentBirth = c.birthId[s]!;
    const bornBefore = w2.events.totals.birth ?? 0;
    run(w2, 1);
    expect(w2.events.totals.birth).toBe(bornBefore + 1);
    const kids = aliveOf(w2, 'B01').filter((k) => w2.lineage.parent[w2.ents.cols.birthId[k]!] === parentBirth);
    expect(kids).toHaveLength(2);
    for (const k of kids) expect([p0, p1]).toContain(w2.ents.cols.genome[k]);
  });

  it('a parent that dies while blocked discards its proposal without a birth', () => {
    const { w, s } = crowdedParent();
    run(w, 1);
    expect(w.ents.cols.propG0[s]).toBeGreaterThanOrEqual(0);
    w.ents.cols.H[s] = 0.0001;
    w.ents.cols.E[s] = 0;
    run(w, 1);
    expect(w.events.totals.birth ?? 0).toBe(0);
  });
});

describe('tick order and commands (P0.7)', () => {
  it('runs the ten stages in canonical order', () => {
    const w = clearWater();
    const seen: number[] = [];
    step(w, { afterStage: (s) => seen.push(s) });
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(w.tick).toBe(1);
  });

  it('a command targeted at tick T acts during tick T, not before', () => {
    const w = clearWater();
    queueCommand(w, 'c1', { kind: 'inoculate', speciesId: 'B01', x: 64.5, y: 64.5, radius: 3, count: 5 }, 3);
    run(w, 3);
    expect(aliveOf(w)).toHaveLength(0);
    step(w);
    expect(aliveOf(w)).toHaveLength(5);
    expect(w.commands.log.at(-1)!.result).toEqual({ accepted: 5, rejected: 0 });
  });

  it('a paused edit applies immediately without advancing time', () => {
    const w = clearWater();
    run(w, 7);
    const cmd = applyNow(w, 'p1', { kind: 'deposit', materialId: 'SUGAR', points: [[64.5, 64.5]], radius: 3, dose: 0.1 });
    expect(w.tick).toBe(7);
    expect(cmd.result!.accepted).toBeGreaterThan(0);
    expect(w.fields.sugar![cellIndex(64, 64)]).toBeCloseTo(0.1, 12);
  });

  it('a deposit rejects stone cells and charges nothing for them', () => {
    const w = clearWater();
    w.grid.structure[cellIndex(64, 64)] = ST_STONE;
    w.grid.geometryVersion++;
    const inputsBefore = w.ledger.inputs.c;
    const cmd = applyNow(w, 'p2', { kind: 'deposit', materialId: 'SUGAR', points: [[64.5, 64.5]], radius: 1, dose: 0.5 });
    expect(cmd.result!.rejected).toBe(1);
    expect(w.fields.sugar![cellIndex(64, 64)]).toBe(0);
    expect(w.ledger.inputs.c - inputsBefore).toBeCloseTo(0.5 * cmd.result!.accepted, 12);
  });
});
