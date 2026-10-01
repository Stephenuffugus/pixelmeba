/**
 * P3.2 attachment surfaces (SPEC §2.2; CT §1.3; D-0006): src/sim/attachment.ts's per-cell surface mask
 * is exact, follows its own world's geometry (rebuilt when grid.geometryVersion moves; never shared
 * between worlds that happen to have the same version), and habitatCompatible requires a listed surface
 * for a species whose record has one, so inoculation refuses plain open water and says how many.
 */
import { describe, expect, it } from 'vitest';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import {
  attachmentMask,
  SURF_BEAD,
  SURF_GEL,
  SURF_MESH,
  SURF_SEDIMENT,
  SURF_STONE_EDGE,
} from '../../src/sim/attachment';
import { CELL_COUNT, GRID_W } from '../../src/sim/constants';
import { cellIndex, ST_BEAD, ST_NONE, ST_STONE, SUB_GEL, SUB_SEDIMENT, type Grid } from '../../src/sim/grid';
import { canOccupy } from '../../src/sim/movement';
import { buildSpeciesTable } from '../../src/sim/species';
import type { World } from '../../src/sim/world';
import { withEnabled } from '../helpers/registry';
import { clearWater, registry } from '../helpers/world';
import { realizeRecipe } from '../../src/sim/recipes';

let n = 0;
function cmd(w: World, payload: CommandPayload) {
  return applyNow(w, `att-${++n}`, payload).result!;
}

/** The surfaces of every cell, by the SPEC §2.2 wording, computed independently of attachment.ts. */
function expectedMask(g: Grid): Uint8Array {
  const out = new Uint8Array(CELL_COUNT);
  for (let i = 0; i < CELL_COUNT; i++) {
    const st = g.structure[i]!;
    if (st === ST_BEAD) {
      out[i] = SURF_BEAD;
      continue;
    }
    if (st !== ST_NONE) continue; // stone, wall, outside: nothing attaches inside them
    let bits = 0;
    if (g.substrate[i] === SUB_GEL) bits |= SURF_GEL;
    if (g.substrate[i] === SUB_SEDIMENT) bits |= SURF_SEDIMENT;
    const x = i % GRID_W;
    const y = Math.floor(i / GRID_W);
    for (const [nx, ny] of [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ] as const) {
      if (nx >= 0 && ny >= 0 && nx < GRID_W && ny < GRID_W && g.structure[ny * GRID_W + nx] === ST_STONE)
        bits |= SURF_STONE_EDGE;
    }
    out[i] = bits;
  }
  return out;
}

function mismatches(w: World): number {
  const got = attachmentMask(w);
  const want = expectedMask(w.grid);
  let bad = 0;
  for (let i = 0; i < CELL_COUNT; i++) if (got[i] !== want[i]) bad++;
  return bad;
}

function countBits(mask: Uint8Array, bit: number): number {
  let k = 0;
  for (let i = 0; i < CELL_COUNT; i++) if ((mask[i]! & bit) !== 0) k++;
  return k;
}

function habitatWorld(habitatId: string): World {
  const reg = registry();
  const base = reg.recipes.FIRST_DISH_V1!;
  return realizeRecipe(
    reg,
    {
      ...base,
      id: `T_${habitatId}`,
      habitatId,
      fieldPatches: [],
      founders: [],
      scheduledCommands: [],
      backgroundOverrides: {},
    },
    { worldId: habitatId },
  );
}

describe('attachment surface mask (P3.2)', () => {
  it('the stone-edge mask is exact before and after placing and erasing a stone (the cache follows geometryVersion)', () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'att' });
    expect(mismatches(w)).toBe(0);
    const edgesBefore = countBits(attachmentMask(w), SURF_STONE_EDGE);
    expect(edgesBefore).toBeGreaterThan(0); // the Garden's two stone disks
    const probe = cellIndex(101, 30); // open water, far from both disks; next to the stone placed below
    expect(attachmentMask(w)[probe]).toBe(0);
    const v0 = w.grid.geometryVersion;
    expect(
      cmd(w, { kind: 'placeStructure', structure: 'stone', points: [[99.5, 30.5]], radius: 1 }).accepted,
    ).toBeGreaterThan(0);
    expect(w.grid.geometryVersion).toBe(v0 + 1);
    expect(mismatches(w)).toBe(0);
    expect(attachmentMask(w)[probe]! & SURF_STONE_EDGE).toBe(SURF_STONE_EDGE);
    expect(countBits(attachmentMask(w), SURF_STONE_EDGE)).toBeGreaterThan(edgesBefore);
    expect(cmd(w, { kind: 'eraseStructure', points: [[99.5, 30.5]], radius: 1 }).accepted).toBeGreaterThan(0);
    expect(mismatches(w)).toBe(0);
    expect(attachmentMask(w)[probe]).toBe(0);
    expect(countBits(attachmentMask(w), SURF_STONE_EDGE)).toBe(edgesBefore);
    // Gel, sediment and bead paint show up too; mesh is not offered by any cell before Phase 5.
    cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points: [[30.5, 80.5]], radius: 3 });
    cmd(w, { kind: 'paintSubstrate', substrate: 'sediment', points: [[90.5, 100.5]], radius: 3 });
    cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[64.5, 20.5]], radius: 1 });
    expect(mismatches(w)).toBe(0);
    const m = attachmentMask(w);
    expect(m[cellIndex(30, 80)]).toBe(SURF_GEL);
    expect(m[cellIndex(90, 100)]).toBe(SURF_SEDIMENT);
    expect(m[cellIndex(64, 20)]).toBe(SURF_BEAD);
    expect(countBits(m, SURF_MESH)).toBe(0);
  });

  it('two worlds with different habitats at the same geometryVersion get their own masks', () => {
    const gel = habitatWorld('GEL_COLONY');
    const sed = habitatWorld('SEDIMENT_EDGE');
    expect(gel.grid.geometryVersion).toBe(sed.grid.geometryVersion);
    // Interleaved reads: each world always sees its own grid.
    for (let k = 0; k < 3; k++) {
      expect(mismatches(gel)).toBe(0);
      expect(mismatches(sed)).toBe(0);
    }
    expect(attachmentMask(gel)).not.toBe(attachmentMask(sed));
    expect(countBits(attachmentMask(gel), SURF_GEL)).toBe(11304 - 1200); // gel everywhere but the channel
    expect(countBits(attachmentMask(gel), SURF_STONE_EDGE)).toBe(0); // no stones
    expect(countBits(attachmentMask(sed), SURF_GEL)).toBe(0);
    expect(countBits(attachmentMask(sed), SURF_SEDIMENT)).toBe(5652);
    expect(countBits(attachmentMask(sed), SURF_STONE_EDGE)).toBeGreaterThan(0);
    // A clear water dish at the same version: no surface anywhere.
    const water = clearWater();
    expect(water.grid.geometryVersion).toBe(gel.grid.geometryVersion);
    expect(mismatches(water)).toBe(0);
    expect(countBits(attachmentMask(water), 0xff)).toBe(0);
  });

  it('inoculating an attached species refuses open water and reports the rejected count; gel, sediment and stone edges accept', () => {
    // Velvet (B02) enabled for this test only (unvalidated; its BIOFILM ability arrives in wave 2, so this
    // world is never stepped: placement only).
    const reg = withEnabled(registry(), { species: ['B02'] });
    const base = reg.recipes.FIRST_DISH_V1!;
    const w = realizeRecipe(
      reg,
      {
        ...base,
        id: 'T_B02',
        habitatId: 'SEDIMENT_EDGE',
        fieldPatches: [],
        founders: [],
        scheduledCommands: [],
        backgroundOverrides: {},
      },
      { worldId: 'b02' },
    );
    // Open water far from the stone: nothing to hold on to.
    const open = cmd(w, { kind: 'inoculate', speciesId: 'B02', x: 100.5, y: 30.5, radius: 3, count: 5 });
    expect(open).toMatchObject({ accepted: 0, rejected: 5 });
    // Sediment: accepted.
    const sed = cmd(w, { kind: 'inoculate', speciesId: 'B02', x: 64.5, y: 100.5, radius: 3, count: 5 });
    expect(sed).toMatchObject({ accepted: 5, rejected: 0 });
    // Across the stone's rim: only the stone-edge water cells qualify.
    const edge = cmd(w, { kind: 'inoculate', speciesId: 'B02', x: 45.5, y: 29.5, radius: 3, count: 20 });
    expect(edge.accepted).toBeGreaterThan(0);
    const [velvet] = buildSpeciesTable([reg.species.B02!]);
    const c = w.ents.cols;
    for (let i = 0; i < w.ents.highWater; i++) {
      if (c.alive[i] !== 1) continue;
      const cell = cellIndex(Math.floor(c.x[i]!), Math.floor(c.y[i]!));
      expect(canOccupy(w, velvet!, cell)).toBe(true);
      expect(attachmentMask(w)[cell]).not.toBe(0);
    }
  });
});
