/**
 * P2.7 Lab commands (SPEC §2.4, §10.4; CT §4, §5.1): habitat paint, shade, and placing/erasing
 * stone, wall and porous bead. Each command's semantics; the placement rules (never over a live
 * organism, never past the rim, never over another structure, never sealing a pocket with nowhere
 * for its contents to go); erasing restores the substrate underneath; no edit creates or destroys
 * material and none writes a ledger input or export; determinism (twin worlds and save/reload); the
 * preview footprint and rule agree with the command; and the host's ordinary undo restores the
 * exact state hash after every kind of edit.
 */
import { describe, expect, it } from 'vitest';
import {
  applyNow,
  queueCommand,
  strokeCells,
  type CommandPayload,
  type CommandResult,
} from '../../src/sim/commands';
import { FIELD_IDS } from '../../src/sim/fields';
import {
  brushCellOutcome,
  cellIndex,
  inMask,
  PAINTED_SHADE,
  strokeFootprint,
  ST_BEAD,
  ST_NONE,
  ST_OUTSIDE,
  ST_STONE,
  ST_WALL,
  SUB_GEL,
  SUB_SEDIMENT,
  SUB_WATER,
  transportOpen,
} from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { occupiedCells } from '../../src/sim/structures';
import { habitatCompatible } from '../../src/sim/suitability';
import { step } from '../../src/sim/tick';
import { transportCache } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { FakeClockHost } from '../helpers/host';
import { aliveOf, clearWater, place, registry, setField } from '../helpers/world';

let n = 0;
function cmd(w: World, payload: CommandPayload): CommandResult {
  const c = applyNow(w, `lab-${++n}`, payload);
  if (!c.result) throw new Error('no result');
  return c.result;
}

function garden(seed = 104729): World {
  return realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'lab-test', seed });
}

/** Every allocated field, copied (to prove an edit left them untouched). */
function fieldsCopy(w: World): Record<string, Float64Array> {
  const out: Record<string, Float64Array> = {};
  for (const id of FIELD_IDS) if (w.fields[id]) out[id] = w.fields[id].slice();
  return out;
}

function sameFields(w: World, before: Record<string, Float64Array>): boolean {
  for (const id of FIELD_IDS) {
    const a = w.fields[id];
    if (!a) continue;
    const b = before[id]!;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  }
  return true;
}

function entitySnapshot(w: World): string {
  const c = w.ents.cols;
  const rows: string[] = [];
  for (let i = 0; i < w.ents.highWater; i++)
    if (c.alive[i] === 1)
      rows.push(`${c.birthId[i]}:${c.x[i]}:${c.y[i]}:${c.B[i]}:${c.E[i]}:${c.lifeState[i]}`);
  return rows.join('|');
}

/** The ledger's external accounts (a habitat edit must never write to them). */
function ledgerAccounts(w: World): string {
  const L = w.ledger;
  return JSON.stringify({
    inputs: L.inputs,
    exports: L.exports,
    entries: L.entries.length,
    roundoff: L.roundoff,
  });
}

const LINE: ReadonlyArray<readonly [number, number]> = [
  [52.5, 30.5],
  [76.5, 30.5],
];

describe('stroke footprint (P2.7)', () => {
  it('the preview footprint is exactly the command footprint (strokeCells) for taps and strokes', () => {
    const strokes: [number, number][][] = [
      [[64.2, 64.7]],
      [
        [10.3, 20.9],
        [40.1, 22.2],
        [41.7, 60.4],
      ],
      [
        [64.5, 1.5],
        [64.5, -3.5],
      ],
      [
        [100.25, 100.75],
        [100.5, 100.5],
        [127.9, 90.1],
      ],
    ];
    for (const pts of strokes)
      for (const r of [0.5, 1, 3, 6]) expect(strokeFootprint(pts, r)).toEqual(strokeCells(pts, r));
  });
});

describe('paint substrate (P2.7)', () => {
  it('replaces water/gel/sediment on open cells only, and moves nothing', () => {
    const w = garden();
    const fields = fieldsCopy(w);
    const ents = entitySnapshot(w);
    const totals = computeTotals(w);
    const accounts = ledgerAccounts(w);
    const version = w.grid.geometryVersion;
    // A stroke that crosses the stone island at (42, 45) r 9.
    const points: [number, number][] = [
      [28.5, 45.5],
      [56.5, 45.5],
    ];
    const cells = strokeCells(points, 3);
    const res = cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points, radius: 3 });
    let open = 0;
    let stone = 0;
    for (const cell of cells) {
      if (w.grid.structure[cell] === ST_STONE) {
        stone++;
        expect(w.grid.substrate[cell]).toBe(SUB_WATER); // the substrate under the stone is kept
      } else {
        open++;
        expect(w.grid.substrate[cell]).toBe(SUB_GEL);
      }
    }
    expect(stone).toBeGreaterThan(0);
    expect(res).toMatchObject({
      accepted: open,
      rejected: stone,
      skipped: { rim: 0, structure: stone, organism: 0, enclosed: 0 },
    });
    expect(w.grid.geometryVersion).toBe(version + 1);
    // Life, deposits and dissolved amounts stay exactly where they are; totals and ledger identical.
    expect(sameFields(w, fields)).toBe(true);
    expect(entitySnapshot(w)).toBe(ents);
    expect(computeTotals(w)).toEqual(totals);
    expect(ledgerAccounts(w)).toBe(accounts);
    // Transport now uses gel's coefficient (0.025 per tick) between two painted cells.
    const a = cellIndex(30, 45);
    expect(w.grid.substrate[a]).toBe(SUB_GEL);
    expect(w.grid.substrate[a + 1]).toBe(SUB_GEL);
    expect(transportCache(w).kR[a]).toBe(0.025);
  });

  it('refuses cells outside the rim and paints sediment where asked', () => {
    const w = clearWater();
    const points: [number, number][] = [[64.5, 1.5]]; // straddles the rim at the top of the dish
    const cells = strokeCells(points, 3);
    const outside = cells.filter((c) => !inMask(c % 128, Math.floor(c / 128))).length;
    expect(outside).toBeGreaterThan(0);
    const res = cmd(w, { kind: 'paintSubstrate', substrate: 'sediment', points, radius: 3 });
    expect(res.accepted).toBe(cells.length - outside);
    expect(res.skipped?.rim).toBe(outside);
    for (const cell of cells) {
      if (w.grid.structure[cell] === ST_OUTSIDE) continue;
      expect(w.grid.substrate[cell]).toBe(SUB_SEDIMENT);
    }
  });

  it('repainting what is already there is accepted but changes no geometry', () => {
    const w = clearWater();
    const version = w.grid.geometryVersion;
    const res = cmd(w, { kind: 'paintSubstrate', substrate: 'water', points: [[64.5, 64.5]], radius: 3 });
    expect(res.accepted).toBe(strokeCells([[64.5, 64.5]], 3).length);
    expect(w.grid.geometryVersion).toBe(version);
  });
});

describe('shade (P2.7)', () => {
  it('the painted factor is the recorded SHADE paint (CT §5.1: light × 0.1)', () => {
    const shade = registry().materials.SHADE!;
    expect(shade.kind).toBe('paint');
    for (const d of shade.doses) expect(d).toBe(PAINTED_SHADE);
  });

  it('multiplies light by 0.1 and erasing restores 1.0; nothing else changes', () => {
    const w = clearWater();
    const fields = fieldsCopy(w);
    const totals = computeTotals(w);
    const accounts = ledgerAccounts(w);
    const points: [number, number][] = [[64.5, 64.5]];
    const cells = strokeCells(points, 6);
    const res = cmd(w, { kind: 'paintShade', erase: false, points, radius: 6 });
    expect(res).toMatchObject({ accepted: cells.length, rejected: 0 });
    for (const cell of cells) {
      expect(w.grid.shade[cell]).toBe(PAINTED_SHADE);
      expect(w.derived.light[cell]).toBeCloseTo(w.grid.lightBase[cell]! * 0.1, 12);
    }
    // Painting again does not darken further.
    cmd(w, { kind: 'paintShade', erase: false, points, radius: 6 });
    for (const cell of cells) expect(w.grid.shade[cell]).toBe(PAINTED_SHADE);
    expect(sameFields(w, fields)).toBe(true);
    expect(computeTotals(w)).toEqual(totals);
    expect(ledgerAccounts(w)).toBe(accounts);
    const erased = cmd(w, { kind: 'paintShade', erase: true, points, radius: 3 });
    const inner = strokeCells(points, 3);
    expect(erased.accepted).toBe(inner.length);
    for (const cell of cells) {
      const expected = inner.includes(cell) ? 1 : PAINTED_SHADE;
      expect(w.grid.shade[cell]).toBe(expected);
      expect(w.derived.light[cell]).toBeCloseTo(w.grid.lightBase[cell]! * expected, 12);
    }
  });
});

describe('stone, wall and porous bead placement (P2.7)', () => {
  it('a wall seals empty cells, moves their contents exactly into the nearest open cells, and changes no totals', () => {
    const w = garden();
    w.settings.lid = 'closed';
    const totals = computeTotals(w);
    const accounts = ledgerAccounts(w);
    // Through the sugar patch (48, 64) r 6: sealed cells hold sugar, oxygen and CO2.
    const points: [number, number][] = [
      [40.5, 64.5],
      [56.5, 64.5],
    ];
    const occupied = occupiedCells(w);
    const cells = strokeCells(points, 1);
    const res = cmd(w, { kind: 'placeStructure', structure: 'wall', points, radius: 1 });
    const placed = cells.filter((c) => w.grid.structure[c] === ST_WALL);
    expect(placed.length).toBeGreaterThan(0);
    expect(res.accepted).toBe(placed.length);
    expect(res.accepted + res.rejected).toBe(cells.length);
    expect(res.skipped?.organism ?? 0).toBe(cells.filter((c) => occupied[c] === 1).length);
    for (const c of cells) if (occupied[c] === 1) expect(w.grid.structure[c]).toBe(ST_NONE);
    // Sealed cells hold nothing (the "no inventory under stone or wall" invariant).
    for (const c of placed) for (const id of FIELD_IDS) if (w.fields[id]) expect(w.fields[id][c]).toBe(0);
    expect(res.moved?.c).toBeGreaterThan(0);
    const after = computeTotals(w);
    expect(Math.abs(after.c - totals.c) / totals.c).toBeLessThan(1e-12);
    expect(Math.abs(after.n - totals.n) / totals.n).toBeLessThan(1e-12);
    expect(after.m).toBe(totals.m);
    expect(ledgerAccounts(w)).toBe(accounts); // a move, not an input or an export
    expect(checkLedger(w).ok).toBe(true);
    // The wall blocks transport: no open edge into a wall cell, no gas exchange there.
    const tc = transportCache(w);
    for (const c of placed) {
      expect(transportOpen(w.grid, c)).toBe(false);
      expect(tc.kR[c]).toBe(0);
      expect(tc.kD[c]).toBe(0);
      expect(tc.kR[c - 1]).toBe(0);
      expect(tc.kD[c - 128]).toBe(0);
      expect(tc.gasRate[c]).toBe(0);
    }
    // A closed-lid run afterwards stays conserved.
    for (let t = 0; t < 300; t++) step(w);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('a stone over a deposit moves the deposit and its bound nutrient aside, exactly', () => {
    const w = garden();
    const cell = cellIndex(70, 64); // inside the starch patch (66, 64) r 5
    const starch = w.fields.starch![cell]!;
    expect(starch).toBeGreaterThan(0);
    const totals = computeTotals(w);
    const occupied = occupiedCells(w);
    expect(occupied[cell]).toBe(0);
    const res = cmd(w, { kind: 'placeStructure', structure: 'stone', points: [[70.5, 64.5]], radius: 0.5 });
    expect(res.accepted).toBe(1);
    expect(w.grid.structure[cell]).toBe(ST_STONE);
    expect(w.fields.starch![cell]).toBe(0);
    expect(res.moved?.c).toBeGreaterThanOrEqual(starch);
    const after = computeTotals(w);
    expect(after.breakdown.starch).toBeCloseTo(totals.breakdown.starch!, 12);
    expect(Math.abs(after.c - totals.c) / totals.c).toBeLessThan(1e-12);
    expect(Math.abs(after.n - totals.n) / totals.n).toBeLessThan(1e-12);
    // Its four open neighbors share it equally.
    for (const nb of [cell - 1, cell + 1, cell - 128, cell + 128])
      expect(w.fields.starch![nb]).toBeGreaterThan(starch);
  });

  it('never overlaps a live organism: its cell is skipped and the organism is untouched', () => {
    const w = clearWater();
    const slot = place(w, 'B01', 64.5, 64.5);
    const before = entitySnapshot(w);
    const res = cmd(w, { kind: 'placeStructure', structure: 'wall', points: [[64.5, 64.5]], radius: 3 });
    const target = cellIndex(64, 64);
    expect(w.grid.structure[target]).toBe(ST_NONE);
    expect(res.skipped?.organism).toBe(1);
    expect(res.accepted).toBe(strokeCells([[64.5, 64.5]], 3).length - 1);
    expect(w.ents.cols.alive[slot]).toBe(1);
    expect(entitySnapshot(w)).toBe(before);
    // Stone and bead follow the same rule, and so does a resting (not active) organism.
    for (const structure of ['stone', 'bead'] as const) {
      const v = clearWater();
      const s = place(v, 'B01', 30.5, 64.5);
      v.ents.cols.lifeState[s] = 2;
      const r = cmd(v, { kind: 'placeStructure', structure, points: [[30.5, 64.5]], radius: 1 });
      expect(v.grid.structure[cellIndex(30, 64)]).toBe(ST_NONE);
      expect(r.skipped?.organism).toBe(1);
    }
  });

  it('cannot cross the rim: cells past it are refused and stay outside', () => {
    const w = clearWater();
    const points: [number, number][] = [
      [64.5, 12.5],
      [64.5, -3.5],
    ];
    const cells = strokeCells(points, 1);
    const outside = cells.filter((c) => !inMask(c % 128, Math.floor(c / 128)));
    expect(outside.length).toBeGreaterThan(0);
    const res = cmd(w, { kind: 'placeStructure', structure: 'wall', points, radius: 1 });
    expect(res.skipped?.rim).toBe(outside.length);
    for (const c of outside) expect(w.grid.structure[c]).toBe(ST_OUTSIDE);
    expect(res.accepted).toBe(cells.length - outside.length);
  });

  it('skips cells that already hold a structure', () => {
    const w = garden();
    const cells = strokeCells([[42.5, 45.5]], 6); // inside the recipe's stone island
    const res = cmd(w, { kind: 'placeStructure', structure: 'wall', points: [[42.5, 45.5]], radius: 6 });
    expect(res.accepted).toBe(0);
    expect(res.skipped?.structure).toBe(cells.length);
    expect(res.note).toBe('nothing placed');
    for (const c of cells) expect(w.grid.structure[c]).toBe(ST_STONE);
  });

  it('moved contents never jump across an existing wall', () => {
    const w = clearWater();
    w.settings.lid = 'closed';
    // An existing vertical wall at x = 64; a stone placed right beside it on the left.
    cmd(w, {
      kind: 'placeStructure',
      structure: 'wall',
      points: [
        [64.5, 40.5],
        [64.5, 88.5],
      ],
      radius: 0.5,
    });
    const right = cellIndex(65, 64);
    const rightSugar = w.fields.sugar![right]!;
    const left = cellIndex(63, 64);
    setField(w, 'sugar', left, 5); // test-only content in the cell to be sealed (logged as an input)
    const res = cmd(w, { kind: 'placeStructure', structure: 'stone', points: [[63.5, 64.5]], radius: 0.5 });
    expect(res.accepted).toBe(1);
    expect(w.grid.structure[left]).toBe(ST_STONE);
    expect(w.fields.sugar![right]).toBe(rightSugar);
    // Everything went to the three open neighbors on the same side.
    const got = [cellIndex(62, 64), cellIndex(63, 63), cellIndex(63, 65)].map((c) => w.fields.sugar![c]!);
    expect(got.reduce((a, b) => a + b, 0)).toBeCloseTo(5, 12);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('refuses to seal a region with no open neighbor at all (nowhere for its contents to go)', () => {
    const w = clearWater();
    // Ring of wall around a 1-cell pocket at (64, 64).
    const ring: [number, number][] = [
      [63.5, 63.5],
      [65.5, 63.5],
      [65.5, 65.5],
      [63.5, 65.5],
      [63.5, 63.5],
    ];
    cmd(w, { kind: 'placeStructure', structure: 'wall', points: ring, radius: 0.5 });
    const pocket = cellIndex(64, 64);
    expect(w.grid.structure[pocket]).toBe(ST_NONE);
    const grid = [w.grid.substrate.slice(), w.grid.structure.slice(), w.grid.shade.slice()];
    const fields = fieldsCopy(w);
    const res = cmd(w, { kind: 'placeStructure', structure: 'wall', points: [[64.5, 64.5]], radius: 0.5 });
    expect(res).toMatchObject({ accepted: 0, rejected: 1, skipped: { enclosed: 1 }, note: 'nothing placed' });
    expect([w.grid.substrate, w.grid.structure, w.grid.shade]).toEqual(grid);
    expect(sameFields(w, fields)).toBe(true);
    // A porous bead holds solutes, so it may fill the pocket.
    expect(
      cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[64.5, 64.5]], radius: 0.5 }).accepted,
    ).toBe(1);
  });

  it('a porous bead passes solutes (nothing moves) but blocks free swimmers', () => {
    const w = clearWater();
    const fields = fieldsCopy(w);
    const res = cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[64.5, 64.5]], radius: 1 });
    const bead = cellIndex(64, 64);
    expect(res.accepted).toBe(strokeCells([[64.5, 64.5]], 1).length);
    expect(res.moved).toBeUndefined();
    expect(w.grid.structure[bead]).toBe(ST_BEAD);
    expect(sameFields(w, fields)).toBe(true);
    expect(transportOpen(w.grid, bead)).toBe(true);
    expect(transportCache(w).kR[bead]).toBeGreaterThan(0);
    const sprinter = w.species.find((s) => s.id === 'B01')!;
    expect(habitatCompatible(w, sprinter, bead)).toBe(false);
  });
});

describe('erase structure (P2.7)', () => {
  it('removes only the structure and restores the substrate underneath', () => {
    const w = clearWater();
    const points: [number, number][] = [[64.5, 64.5]];
    cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points, radius: 6 });
    cmd(w, { kind: 'placeStructure', structure: 'wall', points, radius: 3 });
    const walled = strokeCells(points, 3);
    for (const c of walled) expect(w.grid.structure[c]).toBe(ST_WALL);
    const totals = computeTotals(w);
    const res = cmd(w, { kind: 'eraseStructure', points, radius: 3 });
    expect(res).toMatchObject({ accepted: walled.length, rejected: 0 });
    for (const c of walled) {
      expect(w.grid.structure[c]).toBe(ST_NONE);
      expect(w.grid.substrate[c]).toBe(SUB_GEL);
      for (const id of FIELD_IDS) if (w.fields[id]) expect(w.fields[id][c]).toBe(0); // starts empty
    }
    expect(computeTotals(w)).toEqual(totals);
    // The recipe's stone islands sit on water: erasing one gives water back.
    const g = garden();
    const island = strokeCells([[83.5, 82.5]], 3);
    const r = cmd(g, { kind: 'eraseStructure', points: [[83.5, 82.5]], radius: 3 });
    expect(r.accepted).toBe(island.length);
    for (const c of island) {
      expect(g.grid.structure[c]).toBe(ST_NONE);
      expect(g.grid.substrate[c]).toBe(SUB_WATER);
    }
    // Nothing to erase is reported, and nothing changes; the outside is never erased.
    const again = cmd(g, { kind: 'eraseStructure', points: [[83.5, 82.5]], radius: 3 });
    expect(again).toMatchObject({ accepted: 0, note: 'nothing to erase' });
    const rim = cmd(g, { kind: 'eraseStructure', points: [[64.5, 1.5]], radius: 3 });
    expect(rim.accepted).toBe(0);
    expect(rim.skipped?.rim).toBeGreaterThan(0);
    for (const c of strokeCells([[64.5, 1.5]], 3))
      if (!inMask(c % 128, Math.floor(c / 128))) expect(g.grid.structure[c]).toBe(ST_OUTSIDE);
  });

  it('a bead keeps what it held when erased (it was never sealed)', () => {
    const w = clearWater();
    const bead = cellIndex(64, 64);
    cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[64.5, 64.5]], radius: 0.5 });
    const held = w.fields.oxygen![bead]!;
    expect(held).toBeGreaterThan(0);
    cmd(w, { kind: 'eraseStructure', points: [[64.5, 64.5]], radius: 0.5 });
    expect(w.grid.structure[bead]).toBe(ST_NONE);
    expect(w.fields.oxygen![bead]).toBe(held);
  });
});

describe('Lab commands: validation, determinism, save/reload and undo (P2.7)', () => {
  const SCRIPT: CommandPayload[] = [
    { kind: 'paintSubstrate', substrate: 'gel', points: LINE, radius: 3 },
    {
      kind: 'paintShade',
      erase: false,
      points: [
        [60.5, 80.5],
        [90.5, 80.5],
      ],
      radius: 6,
    },
    {
      kind: 'placeStructure',
      structure: 'wall',
      points: [
        [40.5, 64.5],
        [56.5, 64.5],
      ],
      radius: 1,
    },
    { kind: 'placeStructure', structure: 'stone', points: [[66.5, 64.5]], radius: 3 },
    { kind: 'placeStructure', structure: 'bead', points: [[64.5, 100.5]], radius: 3 },
    { kind: 'eraseStructure', points: [[42.5, 45.5]], radius: 6 },
    {
      kind: 'paintSubstrate',
      substrate: 'sediment',
      points: [
        [90.5, 50.5],
        [100.5, 60.5],
      ],
      radius: 3,
    },
    { kind: 'paintShade', erase: true, points: [[75.5, 80.5]], radius: 3 },
  ];

  it('refuses malformed strokes whole, without changing the dish', () => {
    const w = clearWater();
    const grid = [w.grid.substrate.slice(), w.grid.structure.slice(), w.grid.shade.slice()];
    const fields = fieldsCopy(w);
    const bad: CommandPayload[] = [
      { kind: 'paintSubstrate', substrate: 'gel', points: [[64.5, 64.5]], radius: 0 },
      { kind: 'paintSubstrate', substrate: 'gel', points: [[64.5, 64.5]], radius: 7 },
      { kind: 'paintShade', erase: false, points: [[Number.NaN, 64.5]], radius: 3 },
      { kind: 'placeStructure', structure: 'wall', points: [], radius: 3 },
      { kind: 'placeStructure', structure: 'wall', points: [[64.5, 1e9]], radius: 3 },
      { kind: 'paintSubstrate', substrate: 'lava' as 'gel', points: [[64.5, 64.5]], radius: 3 },
      { kind: 'placeStructure', structure: 'tower' as 'wall', points: [[64.5, 64.5]], radius: 3 },
      { kind: 'paintShade', erase: 'yes' as unknown as boolean, points: [[64.5, 64.5]], radius: 3 },
    ];
    for (const p of bad) {
      const r = cmd(w, p);
      expect(r).toMatchObject({ accepted: 0, rejected: 0 });
      expect(r.note).toBeTruthy();
    }
    expect([w.grid.substrate, w.grid.structure, w.grid.shade]).toEqual(grid);
    expect(sameFields(w, fields)).toBe(true);
  });

  it('is deterministic: twin worlds, and a save/reload between edit and run, give identical hashes', () => {
    const a = garden();
    const b = garden();
    for (const p of SCRIPT) expect(cmd(a, p)).toEqual(cmd(b, p));
    expect(stateHash(a)).toBe(stateHash(b));
    const c = deserializeWorld(serializeWorld(b));
    expect(stateHash(c)).toBe(stateHash(a));
    for (let t = 0; t < 200; t++) {
      step(a);
      step(c);
    }
    expect(stateHash(c)).toBe(stateHash(a));
    expect(checkLedger(a).ok).toBe(true);
    expect(aliveOf(a).length).toBeGreaterThan(0);
  });

  it('each edit queued for a later tick while running gives the same world as the paused edit at that tick', () => {
    for (const p of SCRIPT) {
      const a = garden();
      const b = garden();
      for (let t = 0; t < 30; t++) {
        step(a);
        step(b);
      }
      // a: queued for tick 40 and applied at stage 1 of that tick; b: run to 40, then a paused edit.
      queueCommand(a, 'q', p, 40);
      while (b.tick < 40) step(b);
      cmd(b, p);
      while (a.tick < 45) step(a);
      while (b.tick < 45) step(b);
      expect(a.commands.log.at(-1)?.result).toEqual(b.commands.log.at(-1)?.result);
      expect(stateHash(a), p.kind).toBe(stateHash(b));
    }
  });

  it('the host applies each edit as one undoable command and Undo restores the exact state hash', () => {
    const h = new FakeClockHost();
    h.create('lab', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    h.setSpeed(1);
    h.advanceTo(50);
    h.setSpeed(0);
    for (const [i, p] of SCRIPT.entries()) {
      const before = h.hash();
      const log = h.world.commands.log.length;
      const res = h.command(`c${i}`, p);
      expect(res).not.toBeNull();
      expect(h.world.commands.log.length).toBe(log + 1); // one gesture = one command
      if (res!.accepted > 0) expect(h.hash()).not.toBe(before);
      h.host.handle({ type: 'undo', requestId: 900 + i, dishId: 'lab' });
      expect(h.out.find((m) => m.type === 'ack' && m.requestId === 900 + i && !m.error)).toBeDefined();
      expect(h.hash()).toBe(before);
      // Re-apply so the next edit builds on this one.
      h.command(`r${i}`, p);
    }
    expect(h.errors()).toEqual([]);
    expect(checkLedger(h.world).ok).toBe(true);
  });

  it('the preview rule and the command agree cell by cell', () => {
    const w = garden();
    const occ = occupiedCells(w);
    const pts: [number, number][] = [
      [48.5, 64.5],
      [60.5, 52.5],
    ];
    const cells = strokeFootprint(pts, 6);
    const expectOk = cells.filter(
      (c) => brushCellOutcome('place', w.grid.structure[c]!, occ[c] === 1) === 'ok',
    );
    const res = cmd(w, { kind: 'placeStructure', structure: 'stone', points: pts, radius: 6 });
    expect(res.accepted).toBe(expectOk.length);
    expect(cells.filter((c) => w.grid.structure[c] === ST_STONE && expectOk.includes(c))).toEqual(expectOk);
    expect(res.skipped?.organism ?? 0).toBe(
      cells.filter((c) => occ[c] === 1 && w.grid.structure[c] === ST_NONE).length,
    );
  });
});
