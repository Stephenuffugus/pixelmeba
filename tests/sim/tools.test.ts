/**
 * P3.5 tools (SPEC §10.5–10.6, §3.4, §14.3; D07 §09; D-0037, D-0043): Sample, Transfer, Discard,
 * Cancel and Clean water, in the simulation.
 *
 * - The ledger closes at begin, after take, transfer, discard and cancel, and the world + sample totals
 *   stay constant until Discard (an internal move into an accounted compartment).
 * - Take then Cancel restores the pre-begin state exactly (stateHash, rows, slots, fields, objects),
 *   also with a save and reload in between (raw state and the full .pixelmeba file path).
 * - Whole ownership units: an A01 with its X01 moves as a pair; 2 of 4 chained F01 segments (linkFungal
 *   on GEL_COLONY gel, a shipped species) are refused naming the other 2, changing nothing.
 * - Transfer is atomic (one invalid destination: nothing changes, nextSeq + 1 only) and a move, never a
 *   copy (source cells lose what destination cells gain); slot references are remapped.
 * - Discard exports exactly the held totals and records REMOVED_SAMPLED.
 * - Clean water at 25 / 50 / 100 % removes exactly those fractions as exports, restores the habitat's
 *   O2/CO2 baseline with the CO2 difference ledgered, and leaves life, deposits and objects untouched.
 * - The import refuses held rows with negative pools, an invalid life state, or a slot or birthId that
 *   collides with a living organism or another held row.
 *
 * Erase structure ('eraseStructure') is covered by tests/sim/lab-commands.test.ts (P2.7).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, SaveFileError } from '../../src/persistence/saveFile';
import { applyNow, type CommandPayload, type CommandResult } from '../../src/sim/commands';
import { cellIndex, ST_STONE, SUB_SEDIMENT } from '../../src/sim/grid';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { fungalComponent, linksValid } from '../../src/sim/links';
import { recordField } from '../../src/sim/lineage';
import { killEntity } from '../../src/sim/maintenance';
import { hostOf, parasiteOf } from '../../src/sim/parasites';
import { R } from '../../src/sim/reasons';
import { cancelSample, selectSample } from '../../src/sim/sample';
import { decodeSample, encodeSample, sampleTotals, type SavedSample } from '../../src/sim/sampleSlot';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { habitatBaseline } from '../../src/sim/tools';
import type { World } from '../../src/sim/world';
import { clearWater, linkFungal, place, placeObject, rebaseLedger, setField } from '../helpers/world';

let n = 0;
function cmd(w: World, payload: CommandPayload): CommandResult {
  return applyNow(w, `t-${++n}`, payload).result!;
}
const take = (w: World, x: number, y: number, radius: number, mode: 'life' | 'dissolved' | 'deposits' | 'all') => cmd(w, { kind: 'sampleTake', x, y, radius, mode });
const reload = (w: World): World => deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))) as ReturnType<typeof serializeWorld>);

function totals(w: World): { c: number; n: number; m: number } {
  const t = computeTotals(w);
  return { c: t.c, n: t.n, m: t.m };
}
function expectSameTotals(a: { c: number; n: number; m: number }, b: { c: number; n: number; m: number }): void {
  expect(a.c).toBeCloseTo(b.c, 10);
  expect(a.n).toBeCloseTo(b.n, 10);
  expect(a.m).toBeCloseTo(b.m, 10);
}
/** Everything Cancel must restore, compared as saved bytes: entity columns, fields, objects. */
function stateParts(w: World): string {
  const s = serializeWorld(w);
  return canonicalJson({ entities: s.entities, fields: s.fields, objects: s.objects, sample: s.sample, nextSeq: s.commands.nextSeq, log: s.commands.log.map((c) => c.seq) });
}

/** A water dish with organisms, dissolved food, a deposit and a food object around (50, 50). */
function busyDish(): World {
  const w = clearWater();
  for (const [x, y] of [
    [50.5, 50.5],
    [51.2, 49.7],
    [49.4, 51.1],
    [52.6, 50.2],
    [70.5, 70.5],
  ] as const)
    place(w, 'B01', x, y);
  for (const cell of [cellIndex(50, 50), cellIndex(51, 50), cellIndex(49, 51)]) {
    setField(w, 'sugar', cell, 0.4);
    setField(w, 'sugarN', cell, 0.04);
    setField(w, 'starch', cell, 0.3);
    setField(w, 'starchN', cell, 0.03);
    setField(w, 'salt', cell, 0.2);
  }
  placeObject(w, cellIndex(50, 51), 'pellet', { sugar: 0.5 }, 0.05);
  rebuildIndex(w);
  return w;
}

describe('Sample: take and cancel (D-0037)', () => {
  it('conserves at every step and Cancel restores the pre-begin state exactly', () => {
    for (const mode of ['life', 'dissolved', 'deposits', 'all'] as const) {
      const w = busyDish();
      expect(checkLedger(w).ok).toBe(true);
      const before = totals(w);
      const beginHash = stateHash(w);
      const parts = stateParts(w);
      const res = take(w, 50.5, 50.5, 3, mode);
      expect(res.accepted, mode).toBeGreaterThan(0);
      expect(w.sample, mode).not.toBeNull();
      expect(checkLedger(w).ok, mode).toBe(true);
      expectSameTotals(totals(w), before);
      // The held compartment holds what left the dish.
      expect(computeTotals(w).breakdown.sampleC, mode).toBeGreaterThan(0);
      if (mode === 'life' || mode === 'all') expect(w.sample!.rows.length).toBe(4);
      else expect(w.sample!.rows.length).toBe(0);
      if (mode === 'deposits' || mode === 'all') expect(w.sample!.objects.length).toBe(1);
      if (mode === 'dissolved') expect(w.fields.salt![cellIndex(50, 50)]).toBe(0);
      if (mode === 'deposits') expect(w.fields.salt![cellIndex(50, 50)]).toBe(0.2);
      expect(stateHash(w)).not.toBe(beginHash);
      cancelSample(w);
      expect(w.sample).toBeNull();
      expect(stateHash(w), mode).toBe(beginHash);
      expect(stateParts(w), mode).toBe(parts);
      expect(checkLedger(w).ok).toBe(true);
    }
  });

  it('Cancel after a save and reload in between gives the pre-begin hash (raw state and .pixelmeba file)', async () => {
    const w = busyDish();
    const beginHash = stateHash(w);
    const parts = stateParts(w);
    take(w, 50.5, 50.5, 3, 'all');
    const held = stateHash(w);
    const r1 = reload(w);
    expect(stateHash(r1)).toBe(held);
    cancelSample(r1);
    expect(stateHash(r1)).toBe(beginHash);
    expect(stateParts(r1)).toBe(parts);
    const { text } = await buildSaveFile(w, { name: 'held', savedAt: '2026-10-01T00:00:00Z', recipeId: null });
    const { world: r2 } = await loadSaveFile(text);
    expect(r2.sample).not.toBeNull();
    expect(stateHash(r2)).toBe(held);
    cancelSample(r2);
    expect(stateHash(r2)).toBe(beginHash);
    // Non-vacuity: Cancel must return nextSeq to the take's seq (it is in the state hash).
    const w2 = busyDish();
    const h2 = stateHash(w2);
    take(w2, 50.5, 50.5, 3, 'life');
    cancelSample(w2);
    w2.commands.nextSeq++;
    expect(stateHash(w2)).not.toBe(h2);
  });

  it('Cancel drops the take (and any refused transfer since) from the log and returns nextSeq', () => {
    const w = busyDish();
    const seq0 = w.commands.nextSeq;
    const log0 = w.commands.log.length;
    take(w, 50.5, 50.5, 3, 'life');
    expect(w.sample!.seq).toBe(seq0);
    // A transfer onto the rim is refused whole (accepted 0) but takes a seq.
    expect(cmd(w, { kind: 'sampleTransfer', dx: 200, dy: 0 }).accepted).toBe(0);
    expect(w.commands.nextSeq).toBe(seq0 + 2);
    cancelSample(w);
    expect(w.commands.nextSeq).toBe(seq0);
    expect(w.commands.log.length).toBe(log0);
  });

  it('nothing in the circle: no sample, no change but the refused command', () => {
    const w = clearWater();
    const h = stateHash(w);
    const res = take(w, 30.5, 30.5, 1, 'life');
    expect(res.accepted).toBe(0);
    expect(w.sample).toBeNull();
    const ref = reload(deserializeWorld(serializeWorld(w)));
    ref.commands.nextSeq--;
    expect(stateHash(ref)).toBe(h);
  });
});

describe('Sample: whole ownership units', () => {
  function pair(w: World, x: number, y: number): { host: number; rider: number } {
    const host = place(w, 'A01', x, y);
    const rider = place(w, 'X01', x, y);
    const c = w.ents.cols;
    c.hostSlot[rider] = host;
    c.hostBirthId[rider] = c.birthId[host]!;
    c.parasiteSlot[host] = rider;
    c.parasiteBirthId[host] = c.birthId[rider]!;
    return { host, rider };
  }

  it('an A01 with its X01 is taken and moved as a pair; a rider whose host lies outside refuses the take', () => {
    const w = clearWater();
    place(w, 'B01', 20.5, 60.5); // slot 0 stays in the dish
    const gap = place(w, 'B01', 21.5, 60.5); // slot 1: freed below, so the transfer remaps references
    place(w, 'B01', 22.5, 60.5); // slot 2
    const { host, rider } = pair(w, 60.5, 60.5); // slots 3, 4
    expect([host, rider]).toEqual([3, 4]);
    killEntity(w, gap, R.DEATH_AGE);
    rebuildIndex(w);
    const hostBirth = w.ents.cols.birthId[host]!;
    const riderBirth = w.ents.cols.birthId[rider]!;
    expect(take(w, 60.5, 60.5, 1, 'life').accepted).toBe(2);
    expect(w.sample!.rows.map((r) => r.slot)).toEqual([3, 4]);
    expect(checkLedger(w).ok).toBe(true);
    const res = cmd(w, { kind: 'sampleTransfer', dx: -10, dy: 5 });
    expect(res.accepted).toBe(2);
    expect(checkLedger(w).ok).toBe(true);
    // New slots lowest-free-first in ascending original-slot order: 3 → 1, 4 → 3.
    const c = w.ents.cols;
    expect(c.birthId[1]).toBe(hostBirth);
    expect(c.birthId[3]).toBe(riderBirth);
    expect(parasiteOf(w, 1)).toBe(3);
    expect(hostOf(w, 3)).toBe(1);
    expect([c.x[1], c.y[1]]).toEqual([50.5, 65.5]);
    expect(linksValid(w)).toBe(true);

    // A rider whose centre lies outside the circle while its host is inside: refused, naming the rider.
    const w2 = clearWater();
    const p2 = pair(w2, 40.5, 40.5);
    w2.ents.cols.x[p2.rider] = 44.5;
    rebuildIndex(w2);
    const res2 = take(w2, 40.5, 40.5, 1, 'life');
    expect(res2.accepted).toBe(0);
    expect(res2.note).toContain(`X01 #${w2.ents.cols.birthId[p2.rider]} at (44, 40)`);
    expect(w2.sample).toBeNull();
  });

  it('2 of 4 chained F01 segments are refused naming the other 2; nothing changes', () => {
    const w = clearWater({ habitatId: 'GEL_COLONY' });
    const seg = [30, 31, 32, 33].map((x) => place(w, 'F01', x + 0.5, 40.5));
    for (let k = 0; k < 3; k++) linkFungal(w, seg[k]!, seg[k + 1]!);
    rebuildIndex(w);
    expect(fungalComponent(w, seg[0]!)).toEqual(seg);
    const parts = stateParts(w);
    const sel = selectSample(w, 30.5, 40.5, 1, 'life');
    expect(sel.slots).toEqual([seg[0], seg[1]]);
    expect(sel.missing.map((m) => [m.speciesId, m.cell])).toEqual([
      ['F01', [32, 40]],
      ['F01', [33, 40]],
    ]);
    const res = take(w, 30.5, 40.5, 1, 'life');
    expect(res.accepted).toBe(0);
    expect(res.note).toContain(`F01 #${w.ents.cols.birthId[seg[2]!]} at (32, 40)`);
    expect(res.note).toContain(`F01 #${w.ents.cols.birthId[seg[3]!]} at (33, 40)`);
    expect(w.sample).toBeNull();
    // Nothing changed but the refused command's sequence number.
    const after = JSON.parse(stateParts(w)) as { nextSeq: number };
    const expected = JSON.parse(parts) as { nextSeq: number };
    expect({ ...after, nextSeq: after.nextSeq - 1, log: [] }).toEqual({ ...expected, log: [] });
    // The whole chain is taken together with a circle that holds it, and moved with its links.
    expect(take(w, 31.5, 40.5, 3, 'life').accepted).toBeGreaterThanOrEqual(4);
    expect(cmd(w, { kind: 'sampleTransfer', dx: 0, dy: 10 }).accepted).toBeGreaterThan(0);
    expect(linksValid(w)).toBe(true);
    const moved = [0, 1, 2, 3].filter((i) => w.ents.cols.alive[i] === 1);
    expect(fungalComponent(w, moved[0]!).length).toBe(4);
    expect(w.ents.cols.y[moved[0]!]).toBe(50.5);
  });

  it('a predator and its claimed prey go together', () => {
    const w = clearWater();
    const prey = place(w, 'B01', 40.5, 40.5);
    const pred = place(w, 'P01', 46.5, 40.5);
    const c = w.ents.cols;
    c.preySlot[pred] = prey;
    c.preyBirthId[pred] = c.birthId[prey]!;
    const sel = selectSample(w, 40.5, 40.5, 1, 'life');
    expect(sel.missing.map((m) => m.speciesId)).toEqual(['P01']);
    const sel2 = selectSample(w, 46.5, 40.5, 1, 'life');
    expect(sel2.missing.map((m) => m.speciesId)).toEqual(['B01']);
  });
});

describe('Transfer: atomic, a move not a copy', () => {
  it('one invalid destination refuses the whole move: fields, rows and the sample unchanged, nextSeq + 1', () => {
    const w = busyDish();
    take(w, 50.5, 50.5, 3, 'all');
    // A stone under one destination cell of the held fields.
    const stone = cellIndex(50 + 10, 50);
    w.grid.structure[stone] = ST_STONE;
    w.grid.geometryVersion++;
    const pre = serializeWorld(w);
    const res = cmd(w, { kind: 'sampleTransfer', dx: 10, dy: 0 });
    expect(res.accepted).toBe(0);
    expect(res.note).toMatch(/stone or wall/);
    const ref = deserializeWorld(pre);
    ref.commands.nextSeq++;
    expect(stateHash(w)).toBe(stateHash(ref));
    expect(w.sample).not.toBeNull();
    expect(checkLedger(w).ok).toBe(true);
  });

  it('source cells lose exactly what destination cells gain; organisms keep relative positions and state', () => {
    const w = busyDish();
    const total0 = totals(w);
    const c = w.ents.cols;
    const src = [cellIndex(50, 50), cellIndex(51, 50), cellIndex(49, 51)];
    const sugar0 = src.map((i) => w.fields.sugar![i]!);
    const salt0 = src.map((i) => w.fields.salt![i]!);
    const rowsBefore = [0, 1, 2, 3].map((i) => ({ b: c.birthId[i]!, x: c.x[i]!, y: c.y[i]!, B: c.B[i]!, E: c.E[i]!, age: c.age[i]! }));
    take(w, 50.5, 50.5, 3, 'all');
    const dx = -20;
    const dy = 7;
    const dst = src.map((i) => i + dy * 128 + dx);
    const dstSugar0 = dst.map((i) => w.fields.sugar![i]!);
    const dstSalt0 = dst.map((i) => w.fields.salt![i]!);
    expect(cmd(w, { kind: 'sampleTransfer', dx, dy }).accepted).toBeGreaterThan(0);
    expect(w.sample).toBeNull();
    expect(checkLedger(w).ok).toBe(true);
    expectSameTotals(totals(w), total0);
    src.forEach((i, k) => {
      expect(w.fields.sugar![i]).toBe(0);
      expect(w.fields.salt![i]).toBe(0);
      expect(w.fields.sugar![dst[k]!]).toBe(dstSugar0[k]! + sugar0[k]!);
      expect(w.fields.salt![dst[k]!]).toBe(dstSalt0[k]! + salt0[k]!);
    });
    for (const r of rowsBefore) {
      const i = [...Array(w.ents.highWater).keys()].find((s) => c.alive[s] === 1 && c.birthId[s] === r.b)!;
      expect([c.x[i], c.y[i], c.B[i], c.E[i], c.age[i]]).toEqual([r.x + dx, r.y + dy, r.B, r.E, r.age]);
    }
    expect(w.objects.map((o) => o.cell)).toEqual([cellIndex(50 + dx, 51 + dy)]);
  });
});

describe('Transfer: every destination rule refuses the whole move (fix 1)', () => {
  it('habitatCompatible: a water-only A01 is refused onto sediment, accepted one cell further', () => {
    const make = () => {
      const w = clearWater();
      place(w, 'A01', 50.5, 50.5);
      rebuildIndex(w);
      take(w, 50.5, 50.5, 1, 'life');
      expect(w.sample!.rows.length).toBe(1);
      w.grid.substrate[cellIndex(60, 50)] = SUB_SEDIMENT;
      w.grid.geometryVersion++;
      return w;
    };
    const w = make();
    const pre = serializeWorld(w);
    const res = cmd(w, { kind: 'sampleTransfer', dx: 10, dy: 0 });
    expect(res.accepted).toBe(0);
    expect(res.note).toMatch(/cannot live where it would land/);
    const ref = deserializeWorld(pre);
    ref.commands.nextSeq++;
    expect(stateHash(w)).toBe(stateHash(ref));
    const ok = make();
    expect(cmd(ok, { kind: 'sampleTransfer', dx: 11, dy: 0 }).accepted).toBeGreaterThan(0);
    expect(ok.sample).toBeNull();
  });

  it('soft capacity 8: a destination cell already near 8 refuses the arrival; one organism fewer accepts it', () => {
    const make = (residents: number) => {
      const w = clearWater();
      place(w, 'B01', 50.5, 50.5);
      for (let k = 0; k < residents; k++) place(w, 'B01', 70.05 + k * 0.1, 70.5);
      rebuildIndex(w);
      take(w, 50.5, 50.5, 1, 'life');
      expect(w.sample!.rows.length).toBe(1);
      return w;
    };
    const dest = cellIndex(70, 70);
    const crowded = make(8);
    const row = crowded.sample!.rows[0]!;
    const incoming = row.cols.B / crowded.species[row.cols.species]!.def.b0;
    expect(crowded.derived.cellLoad[dest]! + incoming).toBeGreaterThan(8);
    const res = cmd(crowded, { kind: 'sampleTransfer', dx: 20, dy: 20 });
    expect(res.accepted).toBe(0);
    expect(res.note).toMatch(/too crowded/);
    expect(crowded.sample).not.toBeNull();
    const roomy = make(7);
    expect(roomy.derived.cellLoad[dest]! + incoming).toBeLessThanOrEqual(8);
    expect(cmd(roomy, { kind: 'sampleTransfer', dx: 20, dy: 20 }).accepted).toBeGreaterThan(0);
  });
});

describe('Discard', () => {
  it('exports exactly the held totals and records REMOVED_SAMPLED', () => {
    const w = busyDish();
    take(w, 50.5, 50.5, 3, 'all');
    const held = sampleTotals(w.sample);
    const births = w.sample!.rows.map((r) => r.cols.birthId);
    const exp0 = { ...w.ledger.exports };
    expect(cmd(w, { kind: 'sampleDiscard' }).accepted).toBeGreaterThan(0);
    expect(w.sample).toBeNull();
    const entry = w.ledger.entries[w.ledger.entries.length - 1]!;
    expect(entry.source).toBe('sample:discard');
    expect([entry.c, entry.n, entry.m]).toEqual([-held.c, -held.n, -held.m]);
    expect(w.ledger.exports.c).toBe(exp0.c + held.c);
    expect(checkLedger(w).ok).toBe(true);
    for (const b of births) expect(recordField(w.lineage, 'deathCause', b)).toBe(R.REMOVED_SAMPLED);
    expect(w.ents.count).toBe(1);
  });
});

describe('Clean water (SPEC §10.6)', () => {
  it('removes exactly 25 / 50 / 100 % of dissolved non-gas fields as exports, restores O2/CO2 and leaves life, deposits and objects', () => {
    for (const fraction of [0.25, 0.5, 1] as const) {
      const w = busyDish();
      // Radius 1 at (50.5, 50.5) covers (50,50), (49,50), (51,50), (50,49) and (50,51); two hold food.
      const cells = [cellIndex(50, 50), cellIndex(51, 50)];
      for (const i of cells) {
        setField(w, 'co2', i, 0.9);
        w.fields.oxygen![i] = 0.1;
      }
      rebaseLedger(w);
      const b = w.ents.cols.B.slice();
      const starch = cells.map((i) => w.fields.starch![i]!);
      const sugar = cells.map((i) => w.fields.sugar![i]!);
      const sugarN = cells.map((i) => w.fields.sugarN![i]!);
      const salt = cells.map((i) => w.fields.salt![i]!);
      const nut = cells.map((i) => w.fields.nutrient![i]!);
      const objects = JSON.stringify(w.objects);
      const exp0 = { ...w.ledger.exports };
      const in0 = { ...w.ledger.inputs };
      const res = cmd(w, { kind: 'cleanWater', points: [[50.5, 50.5]], radius: 1, fraction });
      expect(res.accepted).toBe(5);
      cells.forEach((i, k) => {
        const left = (v: number) => (fraction === 1 ? 0 : v - v * fraction);
        expect(w.fields.sugar![i]).toBe(left(sugar[k]!));
        expect(w.fields.sugarN![i]).toBe(left(sugarN[k]!));
        expect(w.fields.salt![i]).toBe(left(salt[k]!));
        expect(w.fields.nutrient![i]).toBe(left(nut[k]!));
        expect(w.fields.starch![i]).toBe(starch[k]);
        expect(w.fields.oxygen![i]).toBe(0.8);
        expect(w.fields.co2![i]).toBe(0.5);
      });
      expect(Array.from(w.ents.cols.B)).toEqual(Array.from(b));
      expect(JSON.stringify(w.objects)).toBe(objects);
      // Exports: the removed sugar carbon; inputs: none (CO2 went down in the painted cells only).
      const removedC = cells.reduce((s, _i, k) => s + sugar[k]! * fraction, 0);
      // plus the CO2 above the habitat baseline (0.9 → 0.5) in those two cells.
      expect(w.ledger.exports.c - exp0.c).toBeCloseTo(removedC + 2 * 0.4, 10);
      expect(w.ledger.inputs.c).toBe(in0.c);
      expect(checkLedger(w).ok).toBe(true);
    }
  });

  it('the O2 baseline follows the habitat geometry: SEDIMENT_EDGE sediment rows get 0.2, water rows 0.8; added CO2 is an input', () => {
    const w = clearWater({ habitatId: 'SEDIMENT_EDGE' });
    const water = cellIndex(70, 40);
    const sediment = cellIndex(70, 80);
    expect(habitatBaseline(w, 'oxygen', water)).toBe(0.8);
    expect(habitatBaseline(w, 'oxygen', sediment)).toBe(0.2);
    for (const i of [water, sediment]) {
      w.fields.oxygen![i] = 0;
      setField(w, 'co2', i, 0.1);
    }
    rebaseLedger(w);
    const res = cmd(w, { kind: 'cleanWater', points: [[70.5, 40.5], [70.5, 80.5]], radius: 1, fraction: 0.5 });
    expect(res.accepted).toBeGreaterThan(0);
    expect(w.fields.oxygen![water]).toBe(0.8);
    expect(w.fields.oxygen![sediment]).toBe(0.2);
    expect(w.fields.co2![sediment]).toBe(0.5);
    expect(w.ledger.inputs.c).toBeGreaterThan(0);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('refuses an invalid fraction or radius whole', () => {
    const w = busyDish();
    const h = stateHash(w);
    expect(cmd(w, { kind: 'cleanWater', points: [[50.5, 50.5]], radius: 1, fraction: 0.3 }).accepted).toBe(0);
    expect(cmd(w, { kind: 'cleanWater', points: [[50.5, 50.5]], radius: 2, fraction: 0.5 }).accepted).toBe(0);
    const ref = reload(w);
    ref.commands.nextSeq -= 2;
    expect(stateHash(ref)).toBe(h);
  });
});

describe('Import refuses a held sample that Cancel could not restore (SPEC §14.3; D-0043)', () => {
  async function fileWith(w: World, edit: (s: SavedSample) => SavedSample): Promise<string> {
    const { text } = await buildSaveFile(w, { name: 'held', savedAt: '2026-10-01T00:00:00Z', recipeId: null });
    const file = JSON.parse(text) as { state: { sample: SavedSample }; checksum: string };
    const state = { ...file.state, sample: edit(file.state.sample) };
    const checksum = `sha256:${await sha256Hex(canonicalJson(state))}`;
    return JSON.stringify({ ...file, state, checksum });
  }
  function editRows(fn: (rows: Record<string, number>[], slots: number[]) => void): (s: SavedSample) => SavedSample {
    return (s) => {
      const held = decodeSample(s);
      const rows = held.rows.map((r) => ({ ...r.cols }));
      const slots = held.rows.map((r) => r.slot);
      fn(rows, slots);
      return encodeSample({ ...held, rows: rows.map((cols, k) => ({ slot: slots[k]!, cols: cols as never })) });
    };
  }

  it('each refusal ends "Nothing was loaded." and the untouched file loads', async () => {
    const w = busyDish();
    take(w, 50.5, 50.5, 3, 'life');
    const living = 4; // the B01 at (70.5, 70.5) stays in slot 4
    expect(w.ents.cols.alive[living]).toBe(1);
    const livingBirth = w.ents.cols.birthId[living]!;
    await expect(loadSaveFile(await fileWith(w, (s) => s))).resolves.toBeDefined();
    const cases: [string, (s: SavedSample) => SavedSample, RegExp][] = [
      ['negative pool', editRows((rows) => (rows[0]!.B = -0.1)), /negative B/],
      ['life state', editRows((rows) => (rows[1]!.lifeState = 7)), /unknown life state/],
      ['slot of a living organism', editRows((_r, slots) => (slots[0] = living)), /slot is taken/],
      ['birthId of a living organism', editRows((rows) => (rows[0]!.birthId = livingBirth)), /birth identity with a living/],
      ['two held rows share a slot', editRows((_r, slots) => (slots[1] = slots[0] ?? 0)), /share a slot/],
      ['two held rows share a birthId', editRows((rows) => (rows[1]!.birthId = rows[0]!.birthId ?? 0)), /share a birth identity/],
    ];
    for (const [label, edit, msg] of cases) {
      const text = await fileWith(w, edit);
      const err = await loadSaveFile(text).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err, label).toBeInstanceOf(SaveFileError);
      expect((err as Error).message, label).toMatch(msg);
      expect((err as Error).message, label).toMatch(/Nothing was loaded\.$/);
    }
  });

  it('where Cancel would put it back: off-grid or walled cells, clashing objects, a stale seq, radius, birthId (fix 1)', async () => {
    const w = busyDish();
    placeObject(w, cellIndex(80, 80), 'pellet', { sugar: 0.5 }, 0.05);
    rebuildIndex(w);
    cmd(w, { kind: 'cleanWater', points: [[90.5, 60.5]], radius: 1, fraction: 0.5 }); // a command before the take
    take(w, 50.5, 50.5, 3, 'all');
    expect(w.sample!.objects.length).toBe(1);
    w.grid.structure[cellIndex(60, 50)] = ST_STONE;
    w.grid.geometryVersion++;
    const worldObj = w.objects[0]!;
    await expect(loadSaveFile(await fileWith(w, (s) => s))).resolves.toBeDefined();
    const editHeld = (fn: (h: ReturnType<typeof decodeSample>) => ReturnType<typeof decodeSample>) => (s: SavedSample) => encodeSample(fn(decodeSample(s)));
    const cases: [string, (s: SavedSample) => SavedSample, RegExp][] = [
      ['origin off the grid', (s) => ({ ...s, origin: [5000, 5000] }), /origin lies outside/],
      ['cell offset off the grid', (s) => ({ ...s, cells: s.cells.map((c, k) => (k === 0 ? { ...c, dx: -60 } : c)) }), /sample cell lies outside the dish/],
      ['cell on a stone', (s) => ({ ...s, cells: s.cells.map((c, k) => (k === 0 ? { ...c, dx: 10, dy: 0 } : c)) }), /sample cell lies on a stone or wall/],
      ['two cells share an offset', (s) => ({ ...s, cells: s.cells.map((c, k) => (k === 1 ? { ...c, dx: s.cells[0]!.dx, dy: s.cells[0]!.dy } : c)) }), /two sample cells share a cell/],
      ['object id of a world object', editHeld((h) => ({ ...h, objects: h.objects.map((o) => ({ ...o, id: worldObj.id })) })), /clashes with the dish \(food object ids are out of order\)/],
      ['object on a world object’s cell', editHeld((h) => ({ ...h, objects: h.objects.map((o) => ({ ...o, cell: worldObj.cell })) })), /clashes with the dish \(two food objects share cell/],
      ['object id at or above the counter', editHeld((h) => ({ ...h, objects: h.objects.map((o) => ({ ...o, id: 999 })) })), /clashes with the dish \(food object ids are out of order\)/],
      ['row outside the dish', editRows((rows) => {
          rows[0]!.x = -40.5;
          rows[0]!.y = 500.5;
        }), /row lies outside the dish/],
      ['seq ahead of the dish', (s) => ({ ...s, seq: 999999 }), /lies ahead of the dish/],
      ['seq before an earlier command', (s) => ({ ...s, seq: 1 }), /not the dish’s latest/],
      ['radius 0', (s) => ({ ...s, radius: 0 }), /invalid radius/],
      ['birthId never given', editRows((rows) => (rows[0]!.birthId = 99999)), /birth identity the dish never gave/],
    ];
    for (const [label, edit, msg] of cases) {
      const err = await loadSaveFile(await fileWith(w, edit)).then(
        () => null,
        (e: unknown) => e,
      );
      expect(err, label).toBeInstanceOf(SaveFileError);
      expect((err as Error).message, label).toMatch(msg);
      expect((err as Error).message, label).toMatch(/Nothing was loaded\.$/);
    }
  });
});
