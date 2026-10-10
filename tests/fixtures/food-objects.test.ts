/**
 * P3.6 fixture: finite food objects (SPEC §2.4, §3.2 row 3, §3.4, §5.1; CT §5.2 M10/M11, §14).
 *
 * - placement is an exact external input (+10 C, +1 N) under 'tool:M10' / 'tool:M11';
 * - a pellet releases exactly 0.002 C and its proportional N (≈ 0.0002) per tick into its own cell in
 *   stage 3, and lasts 5,000 ticks: the 5,000th transfer moves the exact remainder (0.0019999999999918 C
 *   and every remaining N), never a negative pool, nothing logged as roundoff;
 * - a wafer releases 0.0012 starch C and 0.0008 protein C per tick as deposits, each with 0.10 N per C,
 *   to its last tick;
 * - C and N close every tick for 6,000 ticks with organisms feeding beside a pellet and a wafer;
 * - refusals (cap 128, occupied cell, structure, outside the rim, no foodObjects system) change nothing
 *   but nextSeq; organisms never block an object;
 * - a stone, wall or bead is never placed on an object cell, and grid.ts brushCellOutcome (the preview
 *   rule) agrees with the command cell by cell;
 * - save/reload mid-release and 1× vs four quarter runs give identical hashes;
 * - 'objectEmptied' once per object, passed to the renderer as a VisualEvent with its cell.
 */
import { describe, expect, it } from 'vitest';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import { brushCellOutcome, cellIndex, strokeFootprint, ST_NONE, ST_STONE } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { buildSaveFile, loadSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import {
  createObject,
  FOOD_OBJECT_CAP,
  foodObjectProblem,
  objectAt,
  objectReleasePlan,
  OBJECT_REFUSAL,
  type FoodObject,
} from '../../src/sim/objects';
import { markField } from '../../src/sim/transport';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { occupiedCells } from '../../src/sim/structures';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { objectLine, visualEvents } from '../../src/worker/snapshot';
import { G2_LISTS, registryWith } from '../helpers/registry';
import { trajectoryDigest } from '../helpers/trajectory';
import { clearWater, place } from '../helpers/world';

const LONG = 600_000;
let seq = 0;

function cmd(w: World, payload: CommandPayload) {
  return applyNow(w, `fo-${++seq}`, payload);
}

function placeAt(w: World, materialId: 'M10' | 'M11', x: number, y: number) {
  return cmd(w, { kind: 'placeObject', materialId, x, y });
}

/** The world's state hash with nextSeq put back (a refusal still takes a seq; nothing else may change). */
function hashIgnoringSeq(w: World, seqWas: number): string {
  const now = w.commands.nextSeq;
  w.commands.nextSeq = seqWas;
  const h = stateHash(w);
  w.commands.nextSeq = now;
  return h;
}

const C_CENTER = cellIndex(64, 64);

describe('P3.6 food objects: placement', () => {
  it('placing a pellet is an exact external input: +10 C, +1 N under tool:M10, one object of 10 sugar C and 1 N', () => {
    const w = clearWater();
    const before = { c: w.ledger.inputs.c, n: w.ledger.inputs.n, m: w.ledger.inputs.m };
    const r = placeAt(w, 'M10', 64.5, 64.5).result!;
    expect(r).toEqual({ accepted: 1, rejected: 0 });
    expect(w.ledger.inputs.c - before.c).toBe(10);
    expect(w.ledger.inputs.n - before.n).toBe(1);
    expect(w.ledger.inputs.m - before.m).toBe(0);
    const last = w.ledger.entries[w.ledger.entries.length - 1]!;
    expect(last).toMatchObject({ source: 'tool:M10', c: 10, n: 1, m: 0 });
    expect(w.objects).toEqual([{ id: 1, cell: C_CENTER, kind: 'pellet', pools: { sugar: 10 }, n: 1 }]);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('placing a wafer is +10 C (6 starch + 4 protein) and +1 N under tool:M11', () => {
    const w = clearWater();
    const c0 = w.ledger.inputs.c;
    const n0 = w.ledger.inputs.n;
    expect(placeAt(w, 'M11', 70.2, 60.9).result).toEqual({ accepted: 1, rejected: 0 });
    expect(w.ledger.inputs.c - c0).toBe(10);
    expect(w.ledger.inputs.n - n0).toBe(1);
    expect(w.objects[0]).toEqual({ id: 1, cell: cellIndex(70, 60), kind: 'wafer', pools: { starch: 6, protein: 4 }, n: 1 });
    expect(checkLedger(w).ok).toBe(true);
  });

  it('organisms never block an object: a pellet goes into a cell holding a Sprinter', () => {
    const w = clearWater();
    place(w, 'B01', 64.5, 64.5);
    expect(occupiedCells(w)[C_CENTER]).toBe(1);
    expect(placeAt(w, 'M10', 64.5, 64.5).result!.accepted).toBe(1);
  });

  it('refusals change nothing but nextSeq: occupied cell, structure, outside the rim, cap 128', () => {
    const w = clearWater();
    placeAt(w, 'M10', 64.5, 64.5);
    // A stone two cells away (radius 1 footprint: the cell and its four neighbours).
    expect(cmd(w, { kind: 'placeStructure', structure: 'stone', points: [[50.5, 50.5]], radius: 1 }).result!.accepted).toBeGreaterThan(0);
    expect(w.grid.structure[cellIndex(50, 50)]).toBe(ST_STONE);
    const cases: [string, number, number, string][] = [
      ['occupied (pellet on a pellet)', 64.5, 64.5, OBJECT_REFUSAL.occupied],
      ['occupied (wafer on a pellet)', 64.9, 64.1, OBJECT_REFUSAL.occupied],
      ['structure', 50.5, 50.5, OBJECT_REFUSAL.structure],
      ['outside the rim', 1.5, 1.5, OBJECT_REFUSAL.outside],
      ['off the grid', -3, 200, OBJECT_REFUSAL.outside],
    ];
    for (const [label, x, y, note] of cases) {
      const seqWas = w.commands.nextSeq;
      const h0 = stateHash(w);
      const entries = w.ledger.entries.length;
      const r = placeAt(w, label.includes('wafer') ? 'M11' : 'M10', x, y).result!;
      expect(r, label).toEqual({ accepted: 0, rejected: 1, note });
      expect(w.commands.nextSeq, label).toBe(seqWas + 1);
      expect(hashIgnoringSeq(w, seqWas), label).toBe(h0);
      expect(w.ledger.entries.length, label).toBe(entries);
    }
    // Fill to the cap (128 objects), then one more is refused with the dish's limit.
    const cells: [number, number][] = [];
    for (let y = 40; y < 90 && cells.length < FOOD_OBJECT_CAP - 1; y += 2) for (let x = 40; x < 90 && cells.length < FOOD_OBJECT_CAP - 1; x += 2) if (!(x === 64 && y === 64) && !(x >= 49 && x <= 51 && y >= 49 && y <= 51)) cells.push([x + 0.5, y + 0.5]);
    for (const [x, y] of cells) expect(placeAt(w, 'M10', x, y).result!.accepted).toBe(1);
    expect(w.objects.length).toBe(FOOD_OBJECT_CAP);
    const seqWas = w.commands.nextSeq;
    const h0 = stateHash(w);
    const r = placeAt(w, 'M11', 30.5, 64.5).result!;
    expect(r).toEqual({ accepted: 0, rejected: 1, note: 'The dish holds up to 128 food objects' });
    expect(hashIgnoringSeq(w, seqWas)).toBe(h0);
    expect(checkLedger(w).ok).toBe(true);
  });

  describe('an object holds only its kind’s pools (release reads nothing else)', () => {
    const META = { name: 'x', savedAt: '2026-10-01T00:00:00Z', recipeId: null };
    const off: [FoodObject['kind'], FoodObject['pools']][] = [
      ['pellet', { sugar: 0.004, starch: 0.5 }],
      ['pellet', { starch: 1 }],
      ['wafer', { starch: 1, protein: 1, sugar: 1 }],
      ['wafer', { sugar: 1 }],
    ];
    for (const [kind, pools] of off) {
      const extra = Object.keys(pools).find((k) => !(kind === 'pellet' ? ['sugar'] : ['starch', 'protein']).includes(k))!;
      it(`a ${kind} holding ${JSON.stringify(pools)} is refused by createObject, the record check and the import`, async () => {
        const w = clearWater();
        expect(createObject(w, { cell: C_CENTER, kind, pools, n: 0.05 })).toEqual({ ok: false, reason: 'invalid' });
        expect(w.objects).toEqual([]);
        expect(foodObjectProblem({ id: 1, cell: C_CENTER, kind, pools, n: 0.05 })).toBe(`a ${kind} cannot hold ${extra}`);
        // A save edited to carry such an object (checksum recomputed) builds nothing.
        placeAt(w, kind === 'pellet' ? 'M10' : 'M11', 64.5, 64.5);
        const { text } = await buildSaveFile(w, META);
        const f = JSON.parse(text) as { state: { objects: FoodObject[] }; checksum: string };
        f.state.objects[0] = { ...f.state.objects[0]!, pools };
        f.checksum = `sha256:${await sha256Hex(canonicalJson(f.state))}`;
        const edited = JSON.stringify(f);
        await expect(parseSaveFile(edited)).rejects.toThrow(`a ${kind} cannot hold ${extra}`);
        await expect(loadSaveFile(edited)).rejects.toThrow(/Nothing was loaded/);
      });
    }

    it('the kind’s own pools still load, and the dish keeps its carbon to the last transfer', async () => {
      const w = clearWater();
      placeAt(w, 'M10', 64.5, 64.5);
      const { text } = await buildSaveFile(w, META);
      const { world } = await loadSaveFile(text);
      expect(world.objects).toEqual(w.objects);
      run(world, 5001);
      expect(world.objects).toEqual([]);
      expect(checkLedger(world).ok).toBe(true);
    }, LONG);
  });

  it('a world without the foodObjects system (the g2 content set) refuses an object and changes nothing but nextSeq', () => {
    const w = realizeRecipe(registryWith(G2_LISTS), 'FIRST_DISH_V1');
    expect(w.content.manifest.enabledSystems).not.toContain('foodObjects');
    const seqWas = w.commands.nextSeq;
    const h0 = stateHash(w);
    const r = placeAt(w, 'M10', 64.5, 64.5).result!;
    expect(r).toEqual({ accepted: 0, rejected: 1, note: OBJECT_REFUSAL.missing });
    expect(hashIgnoringSeq(w, seqWas)).toBe(h0);
    expect(w.objects).toEqual([]);
  });
});

describe('P3.6 food objects: structures never cover an object', () => {
  for (const structure of ['stone', 'wall', 'bead'] as const) {
    it(`a ${structure} stroke over a pellet skips the object cell (counted as skipped.object) and brushCellOutcome agrees cell by cell`, () => {
      const w = clearWater();
      placeAt(w, 'M10', 64.5, 64.5);
      const points: [number, number][] = [[64.5, 64.5]];
      const occupied = occupiedCells(w);
      const objectCells = new Uint8Array(w.grid.structure.length);
      for (const o of w.objects) objectCells[o.cell] = 1;
      const footprint = strokeFootprint(points, 3);
      const expectOk = footprint.filter((c) => brushCellOutcome('place', w.grid.structure[c]!, occupied[c] === 1, objectCells[c] === 1) === 'ok');
      expect(brushCellOutcome('place', ST_NONE, false, true)).toBe('object');
      const r = cmd(w, { kind: 'placeStructure', structure, points, radius: 3 }).result!;
      expect(r.skipped?.object).toBe(1);
      expect(r.accepted).toBe(expectOk.length);
      expect(r.rejected).toBe(footprint.length - expectOk.length);
      expect(w.grid.structure[C_CENTER]).toBe(ST_NONE);
      expect(objectAt(w, C_CENTER)?.kind).toBe('pellet');
      for (const c of footprint) expect(w.grid.structure[c] !== ST_NONE, `cell ${c}`).toBe(expectOk.includes(c));
      expect(checkLedger(w).ok).toBe(true);
    });
  }

  it("the food-object tap rule ('object') refuses any structure and an existing object, never an organism", () => {
    expect(brushCellOutcome('object', ST_NONE, true, false)).toBe('ok');
    expect(brushCellOutcome('object', ST_NONE, false, true)).toBe('object');
    expect(brushCellOutcome('object', ST_STONE, false, false)).toBe('structure');
  });
});

describe('P3.6 food objects: release (stage 3)', () => {
  it(
    'a pellet releases exactly 0.002 C and proportional N per tick into its own cell, lasts 5,000 ticks, and its last transfer moves the exact remainder',
    () => {
      const w = clearWater();
      placeAt(w, 'M10', 64.5, 64.5);
      const o = w.objects[0]!;
      const sugar = w.fields.sugar!;
      const sugarN = w.fields.sugarN!;
      const roundoff = { ...w.ledger.roundoff };
      let after2 = { c: 0, n: 0 };
      let plan = objectReleasePlan(o);
      let ticks = 0;
      let movedC = 0;
      let movedN = 0;
      let lastPlan = plan;
      while (w.objects.length > 0) {
        plan = objectReleasePlan(o);
        const cBefore = o.pools.sugar!;
        const nBefore = o.n;
        step(w, {
          afterStage: (stage) => {
            if (stage === 2) after2 = { c: sugar[o.cell]!, n: sugarN[o.cell]! };
            if (stage === 3) {
              // Stage 3 adds exactly this tick's plan to the object's own cell.
              expect(sugar[o.cell]).toBe(after2.c + plan.c[0]!);
              expect(sugarN[o.cell]).toBe(after2.n + plan.n[0]!);
            }
          },
        });
        ticks++;
        movedC += plan.c[0]!;
        movedN += plan.n[0]!;
        expect(o.pools.sugar!).toBeGreaterThanOrEqual(0);
        expect(o.n).toBeGreaterThanOrEqual(0);
        if (!plan.emptied) {
          expect(plan.c[0]).toBe(0.002);
          expect(plan.n[0]).toBeCloseTo(0.0002, 15);
          expect(o.pools.sugar).toBe(cBefore - 0.002);
          expect(o.n).toBe(nBefore - plan.n[0]!);
        } else lastPlan = plan;
        if (ticks > 6000) break;
      }
      expect(ticks).toBe(5000);
      expect(lastPlan.emptied).toBe(true);
      // The 5,000th transfer: the exact remainder of C (below one tick's 0.002) and every remaining N.
      expect(lastPlan.c[0]).toBe(0.0019999999999917983);
      expect(lastPlan.n[0]).toBeGreaterThan(0);
      expect(lastPlan.n[0]).toBeCloseTo(0.0002, 12);
      expect(o.pools.sugar).toBe(0);
      expect(o.n).toBe(0);
      expect(w.objects).toEqual([]);
      expect(movedC).toBeCloseTo(10, 10);
      expect(movedN).toBeCloseTo(1, 10);
      expect(w.ledger.roundoff).toEqual(roundoff);
      expect(checkLedger(w).ok).toBe(true);
    },
    LONG,
  );

  it(
    'a wafer releases 0.0012 starch C and 0.0008 protein C per tick as deposits, each with 0.10 N per C, to its last tick',
    () => {
      const w = clearWater();
      placeAt(w, 'M11', 64.5, 64.5);
      const o = w.objects[0]!;
      const roundoff = { ...w.ledger.roundoff };
      let ticks = 0;
      let last = objectReleasePlan(o);
      while (w.objects.length > 0 && ticks <= 6000) {
        const plan = objectReleasePlan(o);
        if (!plan.emptied) {
          expect(plan.c).toEqual([0.012 * 0.1, 0.008 * 0.1]);
        } else last = plan;
        for (let j = 0; j < 2; j++) expect(Math.abs(plan.n[j]! - 0.1 * plan.c[j]!)).toBeLessThan(1e-17);
        step(w);
        ticks++;
        // Deposits never move: the cell holds everything released so far, at 0.10 N per C.
        const st = w.fields.starch![o.cell]!;
        const pr = w.fields.protein![o.cell]!;
        expect(Math.abs(w.fields.starchN![o.cell]! - 0.1 * st)).toBeLessThan(1e-12);
        expect(Math.abs(w.fields.proteinN![o.cell]! - 0.1 * pr)).toBeLessThan(1e-12);
        expect(o.pools.starch!).toBeGreaterThanOrEqual(0);
        expect(o.pools.protein!).toBeGreaterThanOrEqual(0);
        expect(o.n).toBeGreaterThanOrEqual(0);
      }
      expect(ticks).toBe(5000);
      expect(last.emptied).toBe(true);
      expect(o.pools).toEqual({ starch: 0, protein: 0 });
      expect(o.n).toBe(0);
      expect(w.fields.starch![o.cell]).toBeCloseTo(6, 10);
      expect(w.fields.protein![o.cell]).toBeCloseTo(4, 10);
      expect(w.fields.starchN![o.cell]! + w.fields.proteinN![o.cell]!).toBeCloseTo(1, 10);
      expect(w.ledger.roundoff).toEqual(roundoff);
      expect(checkLedger(w).ok).toBe(true);
    },
    LONG,
  );

  it('release runs in stage 3 before enzymes: a wafer’s first starch is catalysed in the tick it is released', () => {
    const w = clearWater();
    placeAt(w, 'M11', 64.5, 64.5);
    const o = w.objects[0]!;
    const plan = objectReleasePlan(o);
    expect(w.fields.eStarch, 'the shipped manifest has the enzymes system').toBeDefined();
    w.fields.eStarch![o.cell] = 1;
    markField(w, 'eStarch');
    let starchCatalysed = -1;
    let starchLeft = -1;
    step(w, {
      afterStage: (s) => {
        if (s === 3) {
          starchCatalysed = w.conversionTally.starch;
          starchLeft = w.fields.starch![o.cell]!;
        }
      },
    });
    // The enzyme (≈ 0.10 C/s × activity ≫ 0.0012 C) reads the pool the release just filled; were release
    // after the enzyme loop, nothing would be catalysed this tick and the cell would keep its starch.
    expect(starchCatalysed).toBe(plan.c[0]);
    expect(starchLeft).toBe(0);
  });

  it('released sugar is eaten in stage 6 of the same tick', () => {
    const w = clearWater();
    const slot = place(w, 'B01', 64.5, 64.5);
    placeAt(w, 'M10', 64.5, 64.5);
    expect(w.fields.sugar![C_CENTER]).toBe(0);
    let sugarAfter3 = 0;
    step(w, { afterStage: (s) => (s === 3 ? (sugarAfter3 = w.fields.sugar![C_CENTER]!) : undefined) });
    expect(sugarAfter3).toBe(0.002);
    expect(w.ents.cols.lastIntakeTick[slot]).toBe(0);
  });

  it(
    'C and N close every tick for 6,000 ticks with organisms feeding beside a pellet and a wafer',
    () => {
      const w = clearWater();
      for (const [x, y] of [[63.5, 64.5], [65.5, 64.5], [64.5, 63.5], [64.5, 65.5], [64.5, 64.5]] as const) place(w, 'B01', x, y);
      for (const [x, y] of [[71.5, 64.5], [69.5, 64.5], [70.5, 63.5]] as const) place(w, 'B06', x, y);
      placeAt(w, 'M10', 64.5, 64.5);
      placeAt(w, 'M11', 70.5, 64.5);
      let worst = { c: 0, n: 0 };
      let fed = 0;
      for (let t = 0; t < 6000; t++) {
        step(w);
        const chk = checkLedger(w);
        if (!chk.ok) throw new Error(`ledger open at tick ${w.tick}: ${JSON.stringify(chk.relErr)}`);
        worst = { c: Math.max(worst.c, chk.relErr.c), n: Math.max(worst.n, chk.relErr.n) };
        const c = w.ents.cols;
        for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.lastIntakeTick[i] === w.tick - 1) fed++;
      }
      expect(fed).toBeGreaterThan(0);
      expect(w.events.totals.objectEmptied).toBe(2);
      expect(worst.c).toBeLessThan(1e-9);
      expect(worst.n).toBeLessThan(1e-9);
    },
    LONG,
  );
});

describe('P3.6 food objects: determinism, saves and events', () => {
  function dish(): World {
    const w = clearWater();
    for (const [x, y] of [[63.5, 64.5], [65.5, 64.5], [64.5, 63.5]] as const) place(w, 'B01', x, y);
    placeAt(w, 'M10', 64.5, 64.5);
    placeAt(w, 'M11', 70.5, 64.5);
    return w;
  }

  it(
    'save/reload mid-release gives the identical hash, and 1× equals four quarter runs',
    () => {
      const a = dish();
      run(a, 2000);
      const saved = serializeWorld(a);
      const b = deserializeWorld(JSON.parse(JSON.stringify(saved)) as typeof saved);
      expect(stateHash(b)).toBe(stateHash(a));
      expect(b.objects).toEqual(a.objects);
      run(a, 3400);
      run(b, 3400);
      expect(stateHash(b)).toBe(stateHash(a));
      expect(trajectoryDigest(b, 'full')).toBe(trajectoryDigest(a, 'full'));
      expect(a.objects).toEqual([]);

      const one = dish();
      const four = dish();
      run(one, 2400);
      for (let k = 0; k < 4; k++) {
        run(four, 600);
        stateHash(four); // observing never changes the outcome
      }
      expect(stateHash(four)).toBe(stateHash(one));
      expect(four.objects).toEqual(one.objects);
    },
    LONG,
  );

  it(
    "'objectEmptied' fires once per object, with its cell and kind, and reaches the renderer as a VisualEvent",
    () => {
      const w = dish();
      const cells = w.objects.map((o: FoodObject) => o.cell);
      run(w, 5100);
      expect(w.objects).toEqual([]);
      const evs = w.events.ring.filter((e) => e.type === 'objectEmptied');
      expect(w.events.totals.objectEmptied).toBe(2);
      expect(evs.map((e) => [e.cell, e.detail?.kind])).toEqual([
        [cells[0], 'pellet'],
        [cells[1], 'wafer'],
      ]);
      expect(evs.every((e) => e.tick === 4999)).toBe(true);
      const vis = visualEvents(w.events.ring, 0).filter((e) => e.type === 'objectEmptied');
      expect(vis.map((e) => e.cell)).toEqual(cells);
      run(w, 100);
      expect(w.events.totals.objectEmptied).toBe(2);
    },
    LONG,
  );

  it('the cell inspector lists the object and what it still holds', () => {
    const w = clearWater();
    placeAt(w, 'M11', 64.5, 64.5);
    run(w, 10);
    const line = objectLine(w, C_CENTER).object!;
    expect(line.kind).toBe('wafer');
    expect(line.pools.starch).toBeCloseTo(6 - 0.012, 12);
    expect(line.pools.protein).toBeCloseTo(4 - 0.008, 12);
    expect(line.n).toBeCloseTo(1 - 0.002, 12);
    expect(objectLine(w, C_CENTER + 1)).toEqual({});
  });
});
