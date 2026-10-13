/**
 * Edge barriers and devices as pure tables (Phase 5 foundation; src/sim/barriers.ts, src/sim/devices.ts;
 * CT §4, §5.3, §14; D-0106): the whole CT §5.3 permission matrix, the edge-code arrays, the transport
 * class of an organism (rules (a)–(f) of classOf, on real species records), and every refusal of the two
 * store validators the import uses.
 */
import { describe, expect, it } from 'vitest';
import {
  classOf,
  EDGE_CHANNEL,
  EDGE_NONE,
  EDGE_S01,
  EDGE_S02,
  EDGE_SHUTTER_CLOSED,
  EDGE_SHUTTER_OPEN,
  edgeCodeArrays,
  edgeCodeBetween,
  edgeCodeOf,
  edgeFactor,
  edgeKey,
  edgeNeighbour,
  edgePermits,
  edgeStoreProblem,
  sortEdges,
  type EdgeBarrier,
  type TransportClass,
} from '../../src/sim/barriers';
import { CELL_COUNT, DEVICE_CAP, EDGE_BARRIER_CAP, GRID_H, GRID_W } from '../../src/sim/constants';
import { DEVICE_KINDS, deviceStoreProblem, FURNISHING_KINDS, MACHINE_KINDS, RESIN_CAPACITY, RESIN_TARGETS, sortDevices, TOGGLED_KINDS, type Device } from '../../src/sim/devices';
import { EntityStore, FLAG, LIFE_ACTIVE, LIFE_RESTING } from '../../src/sim/entities';
import type { Species } from '../../src/sim/content/schema';
import { cellIndex, createGrid, inMask, ST_STONE, SUB_GEL } from '../../src/sim/grid';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { registry } from '../helpers/world';

// ---- CT §5.3 ------------------------------------------------------------------------------------------

const CODES = { S01: EDGE_S01, S02: EDGE_S02, closed: EDGE_SHUTTER_CLOSED, open: EDGE_SHUTTER_OPEN, channel: EDGE_CHANNEL, none: EDGE_NONE } as const;
type Col = keyof typeof CODES;
const COLS: readonly Col[] = ['S01', 'S02', 'closed', 'open', 'channel', 'none'];

/** CT §5.3 as a literal table: a diffusion factor for field classes, pass/blocked for organism classes. */
const MATRIX: Readonly<Record<TransportClass | 'deposit', readonly (number | boolean)[]>> = {
  //            S01    S02    closed open  channel none
  dissolved: [0.25, 0.5, 0, 1, 0, 1],
  activity: [0.25, 0.5, 0, 1, 0, 1],
  viral: [0, 0.5, 0, 1, 0, 1],
  deposit: [0, 0, 0, 1, 0, 1], // barrier class 'none': deposits, film, food objects never cross a barrier
  small: [false, true, false, true, false, true],
  medium: [false, false, false, true, false, true],
  large: [false, false, false, true, false, true],
  fixed: [false, false, false, true, false, true],
};

describe('the CT §5.3 permission matrix (edgeFactor / edgePermits)', () => {
  for (const [cls, row] of Object.entries(MATRIX)) {
    it(`${cls}: ${COLS.map((c, k) => `${c} ${String(row[k])}`).join(', ')}`, () => {
      COLS.forEach((col, k) => {
        const code = CODES[col];
        const want = row[k]!;
        if (typeof want === 'number') {
          const barrier = cls === 'deposit' ? 'none' : (cls as 'dissolved' | 'activity' | 'viral');
          expect(edgeFactor(code, barrier), `${cls} ${col}`).toBe(want);
          if (cls !== 'deposit') expect(edgePermits(code, cls as TransportClass), `${cls} ${col} permits`).toBe(want > 0);
        } else {
          expect(edgePermits(code, cls as TransportClass), `${cls} ${col}`).toBe(want);
        }
      });
    });
  }

  it('edge codes: S03 open/closed by its setting, S04 is the channel', () => {
    expect(edgeCodeOf({ kind: 'S01' })).toBe(EDGE_S01);
    expect(edgeCodeOf({ kind: 'S02' })).toBe(EDGE_S02);
    expect(edgeCodeOf({ kind: 'S03', open: false })).toBe(EDGE_SHUTTER_CLOSED);
    expect(edgeCodeOf({ kind: 'S03', open: true })).toBe(EDGE_SHUTTER_OPEN);
    expect(edgeCodeOf({ kind: 'S04' })).toBe(EDGE_CHANNEL);
  });
});

// ---- Edge geometry -----------------------------------------------------------------------------------

describe('edge keys, neighbours and code arrays', () => {
  it('edgeNeighbour: R is x + 1, D is y + 1, −1 off the grid', () => {
    expect(edgeNeighbour(cellIndex(5, 5), 'R')).toBe(cellIndex(6, 5));
    expect(edgeNeighbour(cellIndex(5, 5), 'D')).toBe(cellIndex(5, 6));
    expect(edgeNeighbour(cellIndex(GRID_W - 1, 5), 'R')).toBe(-1); // never wraps to the next row
    expect(edgeNeighbour(cellIndex(5, GRID_H - 1), 'D')).toBe(-1);
    expect(edgeKey(10, 'R')).toBe(20);
    expect(edgeKey(10, 'D')).toBe(21);
  });

  it('edgeCodeBetween is symmetric, reads both directions, and throws for cells that are not 4-adjacent', () => {
    const c = cellIndex(64, 64);
    const edges: EdgeBarrier[] = sortEdges([
      { id: 2, kind: 'S03', cell: c, dir: 'D', open: false },
      { id: 1, kind: 'S01', cell: c, dir: 'R' },
      { id: 3, kind: 'S04', cell: cellIndex(63, 64), dir: 'R', flow: 1 },
      { id: 4, kind: 'S02', cell: cellIndex(64, 63), dir: 'D' },
    ]);
    expect(edges.map((e) => e.id)).toEqual([4, 3, 1, 2]);
    const arr = edgeCodeArrays(edges);
    expect(arr.r).toHaveLength(CELL_COUNT);
    const pairs: [number, number, number][] = [
      [c, cellIndex(65, 64), EDGE_S01],
      [c, cellIndex(64, 65), EDGE_SHUTTER_CLOSED],
      [c, cellIndex(63, 64), EDGE_CHANNEL], // the left edge is the neighbour's R
      [c, cellIndex(64, 63), EDGE_S02], // the up edge is the neighbour's D
      [cellIndex(65, 64), cellIndex(66, 64), EDGE_NONE],
    ];
    for (const [a, b, code] of pairs) {
      expect(edgeCodeBetween(arr, a, b)).toBe(code);
      expect(edgeCodeBetween(arr, b, a)).toBe(code);
    }
    expect(() => edgeCodeBetween(arr, c, cellIndex(65, 65))).toThrow(/not 4-adjacent/); // diagonal
    expect(() => edgeCodeBetween(arr, c, c)).toThrow(/not 4-adjacent/);
    expect(() => edgeCodeBetween(arr, c, cellIndex(66, 64))).toThrow(/not 4-adjacent/);
    expect(() => edgeCodeBetween(arr, cellIndex(GRID_W - 1, 5), cellIndex(0, 6))).toThrow(/not 4-adjacent/); // consecutive indices, different rows
  });
});

// ---- classOf -----------------------------------------------------------------------------------------

describe('classOf: the transport class of an organism (rules (a)–(f))', () => {
  // F04 and P06 natives (RESTING_DAUGHTER, RADIUS_CAPTURE) are implemented by later Phase 5 waves (allowUnimplemented).
  const reg = registryWith({ enabledSpecies: [...registry().manifest.enabledSpecies, 'F04', 'P06'].sort() }, { allowUnimplemented: true });
  const fakeFixedAlga: Species = { ...reg.species.A01!, id: 'A99', transportClass: 'fixed' };
  const ids = ['B01', 'B02', 'P06', 'F04', 'X01', 'A01', 'P04', 'F02'];
  const species: Species[] = [...ids.map((id) => reg.species[id]!), fakeFixedAlga];
  const world = { ents: new EntityStore(32), content: { species } } as unknown as Pick<World, 'ents' | 'content'>;
  const c = world.ents.cols;
  const add = (id: string, flags = 0, life = LIFE_ACTIVE): number => {
    const s = world.ents.allocate();
    c.species[s] = species.findIndex((x) => x.id === id);
    c.flags[s] = flags;
    c.lifeState[s] = life;
    return s;
  };

  it('the records say what CT §1.1 says', () => {
    expect(ids.map((id) => reg.species[id]!.transportClass)).toEqual(['small', 'fixed', 'fixed', 'fixed', 'small', 'medium', 'large', 'fixed']);
  });

  it('(f) the record: B01 Small, A01 Medium, P04 Large', () => {
    expect(classOf(world, add('B01'))).toBe('small');
    expect(classOf(world, add('A01'))).toBe('medium');
    expect(classOf(world, add('P04'))).toBe('large');
  });

  it('(b) attached is Fixed; (e) a Fixed record not attached moves by category: B02 disperser Small, free P06 Medium, else Fixed', () => {
    expect(classOf(world, add('B02', FLAG.attached))).toBe('fixed');
    expect(classOf(world, add('B02'))).toBe('small');
    expect(classOf(world, add('P06', FLAG.attached))).toBe('fixed');
    expect(classOf(world, add('P06'))).toBe('medium');
    expect(classOf(world, add('A99'))).toBe('fixed');
  });

  it('(d) a fungal segment is Fixed; (c) a resting F04 newborn is Small, and Fixed again once Active', () => {
    expect(classOf(world, add('F04'))).toBe('fixed');
    expect(classOf(world, add('F02'))).toBe('fixed');
    expect(classOf(world, add('F04', FLAG.restNewborn, LIFE_RESTING))).toBe('small');
    expect(classOf(world, add('F04', FLAG.restNewborn, LIFE_ACTIVE))).toBe('fixed');
    expect(classOf(world, add('F04', 0, LIFE_RESTING))).toBe('fixed'); // resting, but not a newborn
  });

  it('(a) a parasite on a host moves in its host’s class: X01 on A01 Medium, X01 free Small', () => {
    const host = add('A01');
    const x = add('X01');
    c.hostSlot[x] = host;
    c.parasiteSlot[host] = x;
    expect(classOf(world, x)).toBe('medium');
    expect(classOf(world, add('X01'))).toBe('small');
  });
});

// ---- Store validators ---------------------------------------------------------------------------------

const ALL = { enabledStructures: ['BEAD', 'S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'STONE', 'WALL'] };
const C = cellIndex(64, 64);

/** The rightmost dish cell of row 64 (its R edge is on the rim). */
function rimCell(): number {
  let x = 64;
  while (inMask(x + 1, 64)) x++;
  return cellIndex(x, 64);
}

describe('edgeStoreProblem: every refusal, and an accepted store of each kind', () => {
  const grid = createGrid();
  const ok: EdgeBarrier[] = [
    { id: 1, kind: 'S01', cell: C, dir: 'R' },
    { id: 2, kind: 'S02', cell: C, dir: 'D' },
    { id: 3, kind: 'S03', cell: C + 1, dir: 'R', open: true },
    { id: 4, kind: 'S04', cell: C + 2, dir: 'D', flow: -1, nextOrganismTick: 30 },
    { id: 5, kind: 'S04', cell: C + 3, dir: 'R', flow: 1 },
  ];
  const refuse = (edges: unknown, re: RegExp, g = grid, opts = ALL) => expect(edgeStoreProblem(edges, g, opts)).toMatch(re);
  const one = (e: Record<string, unknown>) => [{ id: 1, kind: 'S01', cell: C, dir: 'R', ...e }];

  it('accepts a store of every kind, and the empty store', () => {
    expect(edgeStoreProblem(ok, grid, ALL)).toBeNull();
    expect(edgeStoreProblem([], grid, { enabledStructures: [] })).toBeNull();
    expect(edgeStoreProblem([{ id: 1, kind: 'S03', cell: C, dir: 'D', open: false }], grid, ALL)).toBeNull();
  });

  it('refuses each malformed store with its own sentence', () => {
    refuse({}, /not a list/);
    const many = Array.from({ length: EDGE_BARRIER_CAP + 1 }, (_, k) => ({ id: k + 1, kind: 'S01', cell: C, dir: 'R' }));
    refuse(many, /more than 512 edge barriers/);
    refuse([null], /not a record/);
    refuse(one({ colour: 'red' }), /unknown setting "colour"/);
    for (const id of [0, -1, 1.5, '1']) refuse(one({ id }), /invalid identity/);
    refuse(one({ kind: 'S05' }), /unknown kind "S05"/);
    refuse(one({ kind: 'S02' }), /S02, which this dish's rules do not include/, grid, { enabledStructures: ['S01'] });
    refuse(one({ dir: 'L' }), /invalid direction/);
    for (const cell of [-1, CELL_COUNT, 0, 1.5]) refuse(one({ cell }), /outside the dish/);
    refuse(one({ cell: rimCell() }), /on the rim/);
    refuse([...one({}), { id: 2, kind: 'S02', cell: C, dir: 'R' }], /share one edge/);
    refuse([{ id: 2, kind: 'S02', cell: C, dir: 'D' }, ...one({})], /out of order/);
    refuse(one({ kind: 'S03' }), /neither open nor closed/);
    refuse(one({ kind: 'S03', open: 1 }), /neither open nor closed/);
    refuse(one({ open: true }), /^An edge barrier of kind S01 has a shutter setting\.$/);
    refuse(one({ kind: 'S04' }), /channel has no direction/);
    refuse(one({ kind: 'S04', flow: 2 }), /channel has no direction/);
    for (const t of [-1, 2.5]) refuse(one({ kind: 'S04', flow: 1, nextOrganismTick: t }), /invalid organism wait/);
    refuse(one({ flow: 1 }), /^An edge barrier of kind S01 has a channel direction\.$/);
    refuse(one({ nextOrganismTick: 3 }), /^An edge barrier of kind S01 has a channel organism wait\.$/);
  });

  it('a one-way channel joins two open water cells', () => {
    const gel = createGrid();
    gel.substrate[C + 1] = SUB_GEL;
    refuse(one({ kind: 'S04', flow: 1 }), /does not join two open water cells/, gel);
    const stone = createGrid();
    stone.structure[C] = ST_STONE;
    refuse(one({ kind: 'S04', flow: 1 }), /does not join two open water cells/, stone);
    expect(edgeStoreProblem(one({ kind: 'S01' }), stone, ALL)).toBeNull(); // other kinds may sit beside a stone
  });
});

describe('deviceStoreProblem: every refusal, and an accepted store of each kind', () => {
  const grid = createGrid();
  const ok: Device[] = DEVICE_KINDS.map((kind, k) => ({
    id: k + 1,
    kind,
    cell: C + k,
    ...(TOGGLED_KINDS.includes(kind) ? { on: kind === 'S09' } : {}),
    ...(kind === 'S08' ? { resinSelect: ['inhBact', 'inhPhoto', 'rival'], bound: { inhBact: 2, rival: 3 } } : {}),
  }));
  const refuse = (devices: unknown, re: RegExp, g = grid, opts = ALL) => expect(deviceStoreProblem(devices, g, opts)).toMatch(re);
  const one = (d: Record<string, unknown>) => [{ id: 1, kind: 'S05', cell: C, ...d }];
  const resin = (d: Record<string, unknown>) => one({ kind: 'S08', resinSelect: [], ...d });

  it('the kind tables follow CT §4', () => {
    expect([...FURNISHING_KINDS, ...MACHINE_KINDS].sort()).toEqual([...DEVICE_KINDS]);
    expect(TOGGLED_KINDS).toEqual(['S09', 'S10']);
    expect(RESIN_TARGETS).toEqual(['inhBact', 'inhFung', 'inhPhoto', 'rival']);
    expect(RESIN_CAPACITY).toBe(5);
    expect(DEVICE_CAP).toBe(256);
  });

  it('accepts a store of every kind (a resin bound to exactly its capacity), and sorts by cell', () => {
    expect(deviceStoreProblem(ok, grid, ALL)).toBeNull();
    expect(deviceStoreProblem(resin({ bound: { inhFung: 5 } }), grid, ALL)).toBeNull();
    expect(sortDevices([...ok].reverse()).map((d) => d.id)).toEqual(ok.map((d) => d.id));
  });

  it('refuses each malformed store with its own sentence', () => {
    refuse('x', /not a list/);
    const many = Array.from({ length: DEVICE_CAP + 1 }, (_, k) => ({ id: k + 1, kind: 'S05', cell: C + k }));
    refuse(many, /more than 256 furnishings and devices/);
    refuse([7], /not a record/);
    refuse(one({ power: 3 }), /unknown setting "power"/);
    for (const id of [0, -2, 0.5]) refuse(one({ id }), /invalid identity/);
    refuse(one({ kind: 'S01' }), /unknown kind "S01"/);
    refuse(one({ kind: 'S13' }), /unknown kind "S13"/);
    refuse(one({}), /^A device is of kind S05, which this dish's rules do not include\.$/, grid, { enabledStructures: ['S06'] });
    for (const cell of [-1, CELL_COUNT, 0]) refuse(one({ cell }), /outside the dish/);
    const stone = createGrid();
    stone.structure[C] = ST_STONE;
    refuse(one({}), /sits on a stone, wall or bead/, stone);
    refuse([...one({}), { id: 2, kind: 'S06', cell: C }], /share one cell/);
    refuse([{ id: 2, kind: 'S06', cell: C + 1 }, ...one({})], /out of order/);
    refuse(one({ kind: 'S09' }), /^A device of kind S09 is neither on nor off\.$/);
    refuse(one({ kind: 'S10', on: 'yes' }), /^A device of kind S10 is neither on nor off\.$/);
    refuse(one({ on: false }), /^A device of kind S05 has an on\/off setting\.$/);
    refuse(one({ kind: 'S08' }), /resin has no selection/);
    refuse(resin({ resinSelect: ['rival', 'inhBact'] }), /repeated or out of order/);
    refuse(resin({ resinSelect: ['rival', 'rival'] }), /repeated or out of order/);
    refuse(resin({ resinSelect: ['salt'] }), /unknown target "salt"/);
    refuse(one({ resinSelect: [] }), /^A device of kind S05 has a resin selection\.$/);
    refuse(one({ bound: {} }), /^A device of kind S05 holds resin amounts\.$/);
    refuse(resin({ bound: [] }), /bound amounts are not a record/);
    refuse(resin({ bound: { salt: 1 } }), /holds an unknown target "salt"/);
    for (const v of [-0.1, Number.NaN, Number.POSITIVE_INFINITY, '1']) refuse(resin({ bound: { rival: v } }), /holds an invalid amount/);
    refuse(resin({ bound: { inhBact: 3, rival: 2.01 } }), /more than its capacity of 5/);
  });
});
