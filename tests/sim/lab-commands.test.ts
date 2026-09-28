/**
 * P2.7 Lab commands (SPEC §2.4, §10.4; CT §4, §5.1): habitat paint, shade, and placing/erasing
 * stone, wall and porous bead. Each command's semantics; the placement rules (never over a live
 * organism, never past the rim, never over another structure, never sealing a pocket with nowhere
 * for its contents to go); erasing restores the substrate underneath; no edit creates or destroys
 * material and none writes a ledger input or export; determinism (twin worlds and save/reload); the
 * preview footprint and rule agree with the command; and the host's ordinary undo restores the
 * exact state hash after every kind of edit. Also: sealing is planned in near-linear time and moves
 * contents exactly as the per-cell reference search does; the brush radius is exactly 1, 3 or 6; the
 * paints, the shade factor and the structures come from the world's recorded content, and an older
 * save without them loads and refuses those edits; the Life preview marks exactly the cells the
 * inoculate command can use.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import {
  applyNow,
  queueCommand,
  strokeCells,
  type CommandPayload,
  type CommandResult,
} from '../../src/sim/commands';
import { CELL_COUNT } from '../../src/sim/constants';
import { FIELD_IDS } from '../../src/sim/fields';
import {
  brushCellOutcome,
  brushCells,
  cellIndex,
  cellX,
  cellY,
  habitatMaskOf,
  inBounds,
  inMask,
  lifeCellOutcome,
  planSealing,
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
  type Grid,
} from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { canOccupy } from '../../src/sim/movement';
import type { WorldState } from '../../src/sim/serialize';
import { occupiedCells, shadeFactor } from '../../src/sim/structures';
import { habitatCompatible } from '../../src/sim/suitability';
import { run, step } from '../../src/sim/tick';
import { transportCache } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { validateContent, type RawFile, type RawPacks } from '../../src/sim/content/registry';
import { loadRawPacksFs } from '../../tools/lib/content-fs';
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
      for (const r of [1, 3, 6]) expect(strokeFootprint(pts, r)).toEqual(strokeCells(pts, r));
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
  it('the painted factor is the recorded SHADE paint (CT §5.1: light × 0.1), read from the world', () => {
    const shade = registry().materials.SHADE!;
    expect(shade.kind).toBe('paint');
    expect(shade.target).toBe('shade');
    for (const d of shade.doses) expect(d).toBe(0.1);
    const w = clearWater();
    expect(shadeFactor(w)).toBe(0.1);
    // The factor is the world's recorded content, not a constant: a world whose recorded shade paint
    // says 0.25 paints 0.25.
    const v = clearWater();
    const materials = v.content.materials.map((m) =>
      m.id === 'SHADE' ? { ...m, doses: [0.25, 0.25, 0.25] } : m,
    );
    Object.assign(v, { content: { ...v.content, materials } });
    expect(shadeFactor(v)).toBe(0.25);
    cmd(v, { kind: 'paintShade', erase: false, points: [[64.5, 64.5]], radius: 1 });
    expect(v.grid.shade[cellIndex(64, 64)]).toBe(0.25);
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
      expect(w.grid.shade[cell]).toBe(0.1);
      expect(w.derived.light[cell]).toBeCloseTo(w.grid.lightBase[cell]! * 0.1, 12);
    }
    // Painting again does not darken further.
    cmd(w, { kind: 'paintShade', erase: false, points, radius: 6 });
    for (const cell of cells) expect(w.grid.shade[cell]).toBe(0.1);
    expect(sameFields(w, fields)).toBe(true);
    expect(computeTotals(w)).toEqual(totals);
    expect(ledgerAccounts(w)).toBe(accounts);
    const erased = cmd(w, { kind: 'paintShade', erase: true, points, radius: 3 });
    const inner = strokeCells(points, 3);
    expect(erased.accepted).toBe(inner.length);
    for (const cell of cells) {
      const expected = inner.includes(cell) ? 1 : 0.1;
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

  it('a stone over a deposit moves the deposit and its bound nutrient aside, in equal shares to the nearest open cells', () => {
    const w = clearWater();
    const at: [number, number][] = [[70.5, 64.5]];
    // Organic debris: 0.5 C per cell plus 0.10 bound N per C, logged as an input.
    expect(cmd(w, { kind: 'deposit', materialId: 'DEBRIS', points: at, radius: 1, dose: 0.5 }).accepted).toBe(5);
    const totals = computeTotals(w);
    const res = cmd(w, { kind: 'placeStructure', structure: 'stone', points: at, radius: 1 });
    // The plus-shaped footprint (the centre and its four neighbours) is sealed and holds nothing.
    const plus = strokeCells(at, 1);
    expect(plus).toHaveLength(5);
    expect(res.accepted).toBe(5);
    for (const c of plus) {
      expect(w.grid.structure[c]).toBe(ST_STONE);
      expect(w.fields.detritus![c]).toBe(0);
      expect(w.fields.detritusN![c]).toBe(0);
    }
    expect(res.moved?.c).toBeGreaterThanOrEqual(2.5);
    // Each arm sends its 0.5 to its three open neighbours; the centre, two steps from open water, to
    // the eight open cells at that distance. Diagonal cells hear from two arms and the centre.
    const arm = 0.5 / 3;
    const centre = 0.5 / 8;
    const got = (x: number, y: number) => w.fields.detritus![cellIndex(x, y)]!;
    for (const [x, y] of [
      [72, 64],
      [68, 64],
      [70, 62],
      [70, 66],
    ] as const)
      expect(got(x, y)).toBeCloseTo(arm + centre, 12);
    for (const [x, y] of [
      [71, 63],
      [69, 63],
      [71, 65],
      [69, 65],
    ] as const)
      expect(got(x, y)).toBeCloseTo(2 * arm + centre, 12);
    expect(w.fields.detritusN![cellIndex(71, 63)]).toBeCloseTo(0.1 * (2 * arm + centre), 12);
    const after = computeTotals(w);
    expect(after.breakdown.detritus).toBeCloseTo(totals.breakdown.detritus!, 12);
    expect(Math.abs(after.c - totals.c) / totals.c).toBeLessThan(1e-12);
    expect(Math.abs(after.n - totals.n) / totals.n).toBeLessThan(1e-12);
    expect(checkLedger(w).ok).toBe(true);
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
    // An existing vertical wall three cells wide (x = 63…65); a stone placed right beside it on the left.
    cmd(w, {
      kind: 'placeStructure',
      structure: 'wall',
      points: [
        [64.5, 40.5],
        [64.5, 88.5],
      ],
      radius: 1,
    });
    for (const x of [63, 64, 65]) expect(w.grid.structure[cellIndex(x, 64)]).toBe(ST_WALL);
    const right = cellIndex(66, 64);
    const rightSugar = w.fields.sugar![right]!;
    const beside = cellIndex(62, 64);
    setField(w, 'sugar', beside, 5); // test-only content in a cell to be sealed (logged as an input)
    const res = cmd(w, { kind: 'placeStructure', structure: 'stone', points: [[61.5, 64.5]], radius: 1 });
    expect(res.accepted).toBe(5);
    expect(w.grid.structure[beside]).toBe(ST_STONE);
    expect(w.fields.sugar![right]).toBe(rightSugar);
    // Everything went to its two open neighbours on the same side (the wall is in the way of the third).
    expect(w.fields.sugar![cellIndex(62, 63)]).toBeCloseTo(2.5, 12);
    expect(w.fields.sugar![cellIndex(62, 65)]).toBeCloseTo(2.5, 12);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('refuses to seal a region with no open neighbor at all (nowhere for its contents to go)', () => {
    const w = clearWater();
    // A radius-1 ring of wall around a 1-cell pocket at (64, 64).
    const ring: [number, number][] = [
      [62.5, 62.5],
      [66.5, 62.5],
      [66.5, 66.5],
      [62.5, 66.5],
      [62.5, 62.5],
    ];
    cmd(w, { kind: 'placeStructure', structure: 'wall', points: ring, radius: 1 });
    const pocket = cellIndex(64, 64);
    expect(w.grid.structure[pocket]).toBe(ST_NONE);
    for (const c of [pocket - 1, pocket + 1, pocket - 128, pocket + 128]) expect(w.grid.structure[c]).toBe(ST_WALL);
    const grid = [w.grid.substrate.slice(), w.grid.structure.slice(), w.grid.shade.slice()];
    const fields = fieldsCopy(w);
    const res = cmd(w, { kind: 'placeStructure', structure: 'wall', points: [[64.5, 64.5]], radius: 1 });
    expect(res).toMatchObject({
      accepted: 0,
      rejected: 5,
      skipped: { structure: 4, enclosed: 1 },
      note: 'nothing placed',
    });
    expect([w.grid.substrate, w.grid.structure, w.grid.shade]).toEqual(grid);
    expect(sameFields(w, fields)).toBe(true);
    // A porous bead holds solutes, so it may fill the pocket.
    expect(
      cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[64.5, 64.5]], radius: 1 }).accepted,
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
    cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[64.5, 64.5]], radius: 1 });
    const held = w.fields.oxygen![bead]!;
    expect(held).toBeGreaterThan(0);
    cmd(w, { kind: 'eraseStructure', points: [[64.5, 64.5]], radius: 1 });
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
      // CT §5.1: exactly 1, 3 or 6; nothing in between, however small.
      { kind: 'paintSubstrate', substrate: 'gel', points: [[64.5, 64.5]], radius: 0.5 },
      { kind: 'placeStructure', structure: 'wall', points: [[64.5, 64.5]], radius: 2 },
      { kind: 'eraseStructure', points: [[64.5, 64.5]], radius: 4 },
      { kind: 'paintShade', erase: false, points: [[64.5, 64.5]], radius: 3.0000001 },
      { kind: 'placeStructure', structure: 'bead', points: [[64.5, 64.5]], radius: '3' as unknown as number },
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

// ------------------------------------------------------------------------------------------------
// Sealing in near-linear time (wave B verification: one search per sealed cell stalled the worker).

/**
 * The sealing search as first built (D-0024): one breadth-first search per sealed cell through the
 * cells sealed by the same edit, stopping at the first ring with open cells. The reference the
 * near-linear planner must reproduce exactly.
 */
function referenceTargets(g: Grid, start: number, sealing: Uint8Array): number[] {
  const seen = new Uint8Array(CELL_COUNT);
  const targets: number[] = [];
  let ring = [start];
  seen[start] = 1;
  while (ring.length > 0 && targets.length === 0) {
    const next: number[] = [];
    for (const i of ring) {
      const x = cellX(i);
      const y = cellY(i);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (!inBounds(nx, ny) || !inMask(nx, ny)) continue;
        const n = cellIndex(nx, ny);
        if (seen[n] === 1) continue;
        seen[n] = 1;
        if (sealing[n] === 1) next.push(n);
        else if (transportOpen(g, n)) targets.push(n);
      }
    }
    ring = next;
  }
  return targets.sort((a, b) => a - b);
}

/** Fields and structures after a stone/wall stroke, by the reference rule (equal shares, ascending). */
function referenceSeal(w: World, p: Extract<CommandPayload, { kind: 'placeStructure' }>) {
  const occ = occupiedCells(w);
  const ok = strokeFootprint(p.points, p.radius).filter(
    (c) => brushCellOutcome('place', w.grid.structure[c]!, occ[c] === 1) === 'ok',
  );
  const sealing = new Uint8Array(CELL_COUNT);
  for (const c of ok) sealing[c] = 1;
  const plan = ok.map((c) => ({ c, t: referenceTargets(w.grid, c, sealing) }));
  const fields = fieldsCopy(w);
  const structure = w.grid.structure.slice();
  const code = p.structure === 'stone' ? ST_STONE : ST_WALL;
  let accepted = 0;
  let enclosed = 0;
  for (const { c, t } of plan) {
    if (t.length === 0) {
      enclosed++;
      continue;
    }
    accepted++;
    const k = t.length;
    for (const id of FIELD_IDS) {
      const arr = fields[id];
      if (!arr) continue;
      const v = arr[c]!;
      if (v === 0) continue;
      const share = v / k;
      for (let j = 0; j < k - 1; j++) arr[t[j]!]! += share;
      arr[t[k - 1]!]! += v - share * (k - 1);
      arr[c] = 0;
    }
    structure[c] = code;
  }
  return { fields, structure, accepted, enclosed };
}

/** A back-and-forth finger scribble across rows y0…y1 (the verifier's probe shape). */
function scribble(y0: number, y1: number, x0 = 1.5, x1 = 126.5, stepY = 4): [number, number][] {
  const pts: [number, number][] = [];
  for (let y = y0; y < y1; y += stepY) {
    pts.push([x0, y + 0.5]);
    pts.push([x1, y + 0.5]);
  }
  return pts;
}

describe('sealing plan (P2.7): near-linear, and exactly the per-cell reference rule', () => {
  it('moves every field bit for bit as the per-cell search does, and refuses the same enclosed cells', () => {
    const cases: [string, () => World, Extract<CommandPayload, { kind: 'placeStructure' }>][] = [
      ['wall line through the sugar patch', () => garden(), { kind: 'placeStructure', structure: 'wall', points: [[40.5, 64.5], [56.5, 64.5]], radius: 1 }],
      ['stone stroke across the island and founders', () => garden(), { kind: 'placeStructure', structure: 'stone', points: [[48.5, 64.5], [60.5, 52.5]], radius: 6 }],
      ['wall scribble over a third of the Garden', () => garden(), { kind: 'placeStructure', structure: 'wall', points: scribble(20, 60, 10.5, 118.5, 6), radius: 6 }],
      ['stone loop around an open pocket', () => clearWater(), { kind: 'placeStructure', structure: 'stone', points: [[54.5, 54.5], [74.5, 54.5], [74.5, 74.5], [54.5, 74.5], [54.5, 54.5]], radius: 3 }],
      [
        'stone over a walled pocket and beyond it (the pocket is enclosed, the rest is sealed)',
        () => {
          const v = clearWater();
          cmd(v, { kind: 'placeStructure', structure: 'wall', points: [[54.5, 54.5], [74.5, 54.5], [74.5, 74.5], [54.5, 74.5], [54.5, 54.5]], radius: 1 });
          return v;
        },
        { kind: 'placeStructure', structure: 'stone', points: scribble(56, 74, 44.5, 84.5, 3), radius: 3 },
      ],
      ['diamond of stone (many equidistant targets)', () => clearWater(), { kind: 'placeStructure', structure: 'stone', points: [[64.5, 44.5], [84.5, 64.5], [64.5, 84.5], [44.5, 64.5], [64.5, 44.5], [64.5, 84.5], [44.5, 64.5], [84.5, 64.5]], radius: 6 }],
    ];
    for (const [name, make, payload] of cases) {
      const w = make();
      // Varied contents, so every share is visible: a debris smear across the stroke.
      cmd(w, { kind: 'deposit', materialId: 'DEBRIS', points: payload.points, radius: 3, dose: 0.37 });
      const expected = referenceSeal(w, payload);
      const res = cmd(w, payload);
      expect(res.accepted, name).toBe(expected.accepted);
      expect(res.skipped?.enclosed ?? 0, name).toBe(expected.enclosed);
      expect(expected.accepted, name).toBeGreaterThan(0);
      let mismatches = 0;
      for (const id of FIELD_IDS) {
        const a = w.fields[id];
        if (!a) continue;
        const b = expected.fields[id]!;
        for (let i = 0; i < CELL_COUNT; i++) if (!Object.is(a[i], b[i])) mismatches++;
      }
      expect(mismatches, name).toBe(0);
      expect(w.grid.structure, name).toEqual(expected.structure);
      expect(checkLedger(w).ok, name).toBe(true);
    }
  });

  it('a region with no open neighbour is enclosed whole; the plan never allocates per cell', () => {
    const w = clearWater();
    const all = Array.from({ length: CELL_COUNT }, (_, i) => i).filter((c) => w.grid.structure[c] === ST_NONE);
    const plan = planSealing(w.grid, all);
    expect(plan.enclosed).toBe(all.length);
    expect(plan.sealed.length).toBe(0);
    // One open cell in the middle: it is every other cell's single nearest open cell.
    const middle = cellIndex(64, 64);
    const rest = all.filter((c) => c !== middle);
    const p2 = planSealing(w.grid, rest);
    expect(p2.enclosed).toBe(0);
    expect(p2.sealed.length).toBe(rest.length);
    for (const c of [cellIndex(10, 64), cellIndex(64, 10), cellIndex(100, 100)]) {
      expect(p2.count[c]).toBe(1);
      expect(p2.targets[p2.start[c]!]).toBe(middle);
    }
  });

  it('whole-dish and half-Garden radius-6 wall scribbles finish well inside a second (< 1.5 s on a loaded machine)', () => {
    const cases: [string, () => World, [number, number][]][] = [
      ['clear water, whole dish', () => clearWater(), scribble(1, 127)],
      ['Garden, half dish', () => garden(), scribble(1, 64)],
      ['Garden, whole dish', () => garden(), scribble(1, 127)],
    ];
    const timings: string[] = [];
    for (const [name, make, points] of cases) {
      const w = make();
      const totals = computeTotals(w);
      const t0 = performance.now();
      const res = cmd(w, { kind: 'placeStructure', structure: 'wall', points, radius: 6 });
      const ms = performance.now() - t0;
      timings.push(`${name}: ${ms.toFixed(0)} ms (accepted ${res.accepted}, enclosed ${res.skipped?.enclosed ?? 0})`);
      expect(ms, name).toBeLessThan(1500);
      const after = computeTotals(w);
      expect(Math.abs(after.c - totals.c) / totals.c, name).toBeLessThan(1e-12);
      if (name.startsWith('clear')) expect(res).toMatchObject({ accepted: 0, skipped: { enclosed: 11304 } });
      else expect(res.accepted, name).toBeGreaterThan(5000);
    }
    console.log(`sealing timings: ${timings.join('; ')}`);
  });
});

// ------------------------------------------------------------------------------------------------
// Content is data (CLAUDE.md; D-0024): the paints, the shade factor and the structures are the
// world's recorded content, and an older world without them keeps its recorded ruleset.

/** Rewrite a current save as one recorded before the paints and structures were content. */
async function withoutLabContent(text: string): Promise<string> {
  const file = JSON.parse(text) as { state: WorldState; checksum: string; contentHash: string };
  const content = file.state.content as unknown as {
    manifest: Record<string, unknown> & { enabledMaterials: string[] };
    materials: { id: string; kind: string }[];
  };
  const manifest = { ...content.manifest };
  delete manifest.enabledStructures;
  manifest.enabledMaterials = manifest.enabledMaterials.filter((id) => !['GEL', 'SEDIMENT', 'SHADE', 'WATER'].includes(id));
  manifest.contentHash = 'a1'.repeat(32); // an older content version
  const state = {
    ...file.state,
    content: { ...file.state.content, manifest, materials: content.materials.filter((m) => m.kind !== 'paint') },
  };
  const checksum = `sha256:${await sha256Hex(canonicalJson(state))}`;
  return JSON.stringify({ ...file, contentHash: manifest.contentHash, state, checksum });
}

describe('Lab content comes from the world (P2.7)', () => {
  it('the build enables the four paints and the three structures as validated content records', () => {
    const reg = registry();
    for (const id of ['GEL', 'SEDIMENT', 'SHADE', 'WATER']) {
      expect(reg.manifest.enabledMaterials).toContain(id);
      expect(reg.materials[id]!.kind).toBe('paint');
      expect(reg.materials[id]!.phase).toBe(2);
    }
    expect(reg.manifest.enabledStructures).toEqual(['BEAD', 'STONE', 'WALL']);
    expect(reg.structureIds).toEqual(['BEAD', 'STONE', 'WALL']);
    // CT §4 names.
    expect(reg.structures.STONE!.name).toBe('Stone');
    expect(reg.structures.WALL!.name).toBe('Impermeable wall');
    expect(reg.structures.BEAD!.name).toBe('Porous bead');
    for (const id of reg.structureIds) {
      expect(reg.structures[id]!.kind).toBe('cell');
      expect(reg.structures[id]!.phase).toBe(2);
    }
    const w = garden();
    expect(w.content.manifest.enabledStructures).toEqual(['BEAD', 'STONE', 'WALL']);
    expect(w.content.materials.filter((m) => m.kind === 'paint').map((m) => m.target).sort()).toEqual(['gel', 'sediment', 'shade', 'water']);
  });

  it('Structure records are validated like every pack: unknown, unshipped or unimplemented IDs are errors', () => {
    const base = loadRawPacksFs();
    const errors = (edit: (raw: RawPacks) => RawPacks) =>
      validateContent(edit(base))
        .issues.filter((i) => i.severity === 'error')
        .map((i) => `${i.file} → ${i.path}: ${i.message}`);
    expect(errors((r) => r)).toEqual([]);
    const withManifest = (r: RawPacks, patch: Record<string, unknown>): RawPacks => ({
      ...r,
      manifest: { ...r.manifest, data: { ...(r.manifest.data as object), ...patch } },
    });
    const withStructure = (r: RawPacks, file: RawFile): RawPacks => ({ ...r, structures: [...r.structures, file] });
    const stone = base.structures.find((f) => f.file.endsWith('STONE.json'))!.data as Record<string, unknown>;
    expect(errors((r) => withManifest(r, { enabledStructures: ['BEAD', 'LAVA', 'STONE', 'WALL'] }))).toEqual([
      'content/manifest.json → enabledStructures.1: unknown structure "LAVA"',
    ]);
    expect(errors((r) => withManifest(r, { enabledStructures: ['STONE', 'BEAD'] }))).toEqual([
      'content/manifest.json → enabledStructures: must be sorted ascending',
    ]);
    // A record the simulation does not implement yet (a Phase 5 membrane) may exist but not be enabled.
    const membrane = { file: 'content/structures/S01.json', data: { ...stone, id: 'S01', name: 'Fine membrane', kind: 'edge', phase: 2 } };
    expect(errors((r) => withStructure(r, membrane))).toEqual([]);
    expect(errors((r) => withManifest(withStructure(r, membrane), { enabledStructures: ['BEAD', 'S01', 'STONE', 'WALL'] }))).toEqual([
      'content/manifest.json → enabledStructures.1: "S01" is not implemented by the simulation yet',
    ]);
    const late = { file: 'content/structures/STONE.json', data: { ...stone, phase: 5 } };
    expect(errors((r) => ({ ...r, structures: r.structures.map((f) => (f.file.endsWith('STONE.json') ? late : f)) }))).toEqual([
      'content/manifest.json → enabledStructures.1: "STONE" belongs to phase 5 (build phase 2)',
    ]);
    const bad = { file: 'content/structures/STONE.json', data: { ...stone, guide: { summary: '' } } };
    expect(errors((r) => ({ ...r, structures: r.structures.map((f) => (f.file.endsWith('STONE.json') ? bad : f)) })).length).toBeGreaterThan(0);
    // Shade paint carries one light factor in (0, 1].
    const shade = base.materials.find((f) => f.file.endsWith('SHADE.json'))!;
    const unevenShade = { ...shade, data: { ...(shade.data as object), doses: [0.1, 0.2, 0.1] } };
    expect(errors((r) => ({ ...r, materials: r.materials.map((f) => (f === shade ? unevenShade : f)) }))).toEqual([
      'content/materials/SHADE.json → doses: shade paint needs one light factor in (0, 1], the same at every dose',
    ]);
  });

  it('an older save without them still loads, keeps its recorded content and refuses every habitat edit whole', async () => {
    const w = garden();
    run(w, 20);
    const { text } = await buildSaveFile(w, { name: 'Older dish', savedAt: '2026-09-27T00:00:00Z', recipeId: 'FIRST_DISH_V1' });
    const { world } = await loadSaveFile(await withoutLabContent(text));
    expect(world.content.manifest.enabledStructures).toBeUndefined();
    expect(world.content.materials.some((m) => m.kind === 'paint')).toBe(false);
    expect(shadeFactor(world)).toBeNull();
    const grid = [world.grid.substrate.slice(), world.grid.structure.slice(), world.grid.shade.slice()];
    const fields = fieldsCopy(world);
    const script: CommandPayload[] = [
      { kind: 'paintSubstrate', substrate: 'gel', points: LINE, radius: 3 },
      { kind: 'paintShade', erase: false, points: LINE, radius: 3 },
      { kind: 'paintShade', erase: true, points: LINE, radius: 3 },
      { kind: 'placeStructure', structure: 'wall', points: LINE, radius: 1 },
      { kind: 'placeStructure', structure: 'bead', points: LINE, radius: 1 },
      { kind: 'eraseStructure', points: [[42.5, 45.5]], radius: 6 }, // the recipe's own stones stay
    ];
    for (const p of script) {
      const r = cmd(world, p);
      expect(r, p.kind).toMatchObject({ accepted: 0, rejected: 0 });
      expect(r.note, p.kind).toMatch(/not in this dish/);
    }
    expect([world.grid.substrate, world.grid.structure, world.grid.shade]).toEqual(grid);
    expect(sameFields(world, fields)).toBe(true);
    // Everything else about the older dish still works.
    run(world, 50);
    expect(checkLedger(world).ok).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------
// The Life brush preview marks exactly the cells the inoculate command can use.

describe('Life brush preview (P2.7)', () => {
  it('agrees with the inoculate command (canOccupy) cell by cell, for every species, ground and structure', () => {
    const w = garden();
    cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points: [[30.5, 64.5], [40.5, 64.5]], radius: 6 });
    cmd(w, { kind: 'paintSubstrate', substrate: 'sediment', points: [[64.5, 100.5]], radius: 6 });
    cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[30.5, 64.5], [64.5, 100.5]], radius: 3 });
    cmd(w, { kind: 'placeStructure', structure: 'wall', points: [[90.5, 40.5], [100.5, 40.5]], radius: 1 });
    let checked = 0;
    let mismatches = 0;
    for (const sp of w.species) {
      // The preview builds its rule from the species' recorded habitats and attachment (DishInfo).
      const life = { habitatMask: habitatMaskOf(sp.def.habitats), attached: sp.def.attachment !== null };
      expect(life).toEqual({ habitatMask: sp.habitatMask, attached: sp.attached });
      // Attached variants too (beads admit attached organisms only).
      for (const variant of [sp, { ...sp, attached: !sp.attached }]) {
        const rule = { habitatMask: variant.habitatMask, attached: variant.attached };
        for (let cell = 0; cell < CELL_COUNT; cell++) {
          const preview = lifeCellOutcome(w.grid.structure[cell]!, w.grid.substrate[cell]!, rule) === 'ok';
          if (preview !== canOccupy(w, variant, cell)) mismatches++;
          checked++;
        }
      }
    }
    expect(checked).toBe(w.species.length * 2 * CELL_COUNT);
    expect(mismatches).toBe(0);
  });

  it('a Sunbead over painted gel: the preview crosses out the gel cells and the command places nothing there', () => {
    const w = clearWater();
    cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points: [[60.5, 64.5]], radius: 6 });
    const sunbead = w.species.find((s) => s.id === 'A01')!;
    expect(sunbead.def.habitats).toEqual(['water']); // algae live only in water
    const life = { habitatMask: habitatMaskOf(sunbead.def.habitats), attached: sunbead.def.attachment !== null };
    const cells = brushCells(64.5, 64.5, 6);
    const ok = cells.filter((c) => lifeCellOutcome(w.grid.structure[c]!, w.grid.substrate[c]!, life) === 'ok');
    const crossed = cells.filter((c) => lifeCellOutcome(w.grid.structure[c]!, w.grid.substrate[c]!, life) === 'habitat');
    expect(crossed.length).toBeGreaterThan(0);
    expect(ok.length + crossed.length).toBe(cells.length);
    const res = cmd(w, { kind: 'inoculate', speciesId: 'A01', x: 64.5, y: 64.5, radius: 6, count: 20 });
    expect(res.accepted).toBe(20);
    for (const slot of aliveOf(w, 'A01')) {
      const cell = cellIndex(Math.floor(w.ents.cols.x[slot]!), Math.floor(w.ents.cols.y[slot]!));
      expect(ok).toContain(cell);
      expect(w.grid.substrate[cell]).toBe(SUB_WATER);
    }
  });
});
