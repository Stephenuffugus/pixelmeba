/**
 * Import checks for world schema 5 state (SPEC §14.3; src/persistence/phase5State.ts; D-0102, D-0103,
 * D-0106). Every refusal reaches parseSaveFile through a real file: a world edited in memory and saved
 * (buildSaveFile writes a valid checksum), or a saved state edited as JSON and re-checksummed (the resave
 * pattern of migration.test.ts). Each is refused with kind 'integrity', its own sentence and "Nothing was
 * loaded."; a dish that records the systems, with valid stores and Phase 5 organism state, loads and
 * round-trips with an equal stateHash.
 *
 * B09 (SIGNAL_GLOW), A04 (MIXOTROPHY), P10 (HANDLING), F03 (TRAP) and F04 (RESTING_DAUGHTER) are enabled
 * with allowUnimplemented: their abilities are implemented by later Phase 5 waves (e2/e3 organisms); no
 * test here steps a world.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import type { EdgeBarrier } from '../../src/sim/barriers';
import { CELL_COUNT } from '../../src/sim/constants';
import type { Device } from '../../src/sim/devices';
import { ENTITY_COLUMNS, FLAG, LIFE_RESTING, type ColumnName } from '../../src/sim/entities';
import type { SystemFlag } from '../../src/sim/fields';
import { cellIndex, SUB_GEL } from '../../src/sim/grid';
import { canonicalJson, sha256Hex, typedToBase64 } from '../../src/sim/hash';
import type { SampleRow, SampleSlot } from '../../src/sim/sampleSlot';
import { serializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import type { World, WorldContent } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, place, placeWith, registry } from '../helpers/world';

const SHIPPED = registry().manifest;
const SYSTEMS = [...SHIPPED.enabledSystems, 'barriers', 'climate', 'devices', 'signals'].sort() as SystemFlag[];
const SPECIES = [...SHIPPED.enabledSpecies, 'A04', 'B09', 'F03', 'F04', 'P10'].sort();
const REG = registryWith({ enabledSystems: SYSTEMS, enabledSpecies: SPECIES }, { allowUnimplemented: true });
const S_IDS = ['S01', 'S02', 'S03', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'];
const meta = { name: 'phase 5 import', savedAt: '2026-10-13T00:00:00Z', recipeId: null };

const EDGES: readonly EdgeBarrier[] = [
  { id: 1, kind: 'S01', cell: cellIndex(60, 60), dir: 'R' },
  { id: 2, kind: 'S03', cell: cellIndex(61, 62), dir: 'D', open: true },
  { id: 3, kind: 'S04', cell: cellIndex(62, 66), dir: 'R', flow: 1 },
];
const DEVICES: readonly Device[] = [
  { id: 4, kind: 'S08', cell: cellIndex(70, 70), resinSelect: ['inhFung'], bound: { inhFung: 0.5 } },
  { id: 5, kind: 'S09', cell: cellIndex(71, 70), on: false },
];
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

interface Dish {
  readonly w: World;
  readonly slot: Readonly<Record<'b01' | 'b09' | 'a04' | 'p10' | 'f03' | 'p04' | 'f04' | 'spare', number>>;
}

/** A dish recording the Phase 5 systems and S01–S12 with valid stores and one organism of each kind. */
function dish(withStores = true): Dish {
  const w = clearWater({}, REG);
  const m = w.content.manifest;
  (w as { content: WorldContent }).content = { ...w.content, manifest: { ...m, enabledStructures: [...(m.enabledStructures ?? []), ...S_IDS].sort() } };
  const at = (k: number) => [30.5 + 4 * k, 64.5] as const;
  const ids = ['b01', 'b09', 'a04', 'p10', 'f03', 'p04', 'f04', 'spare'] as const;
  const species = ['B01', 'B09', 'A04', 'P10', 'F03', 'P04', 'F04', 'B01'];
  const slot: Record<string, number> = {};
  ids.forEach((id, k) => (slot[id] = place(w, species[k]!, ...at(k), { E: 40 })));
  if (withStores) {
    w.edges.push(...copy(EDGES));
    w.devices.push(...copy(DEVICES));
    w.climate.warmth = new Float64Array(CELL_COUNT).fill(0.5);
    w.gateTally.push({ id: 1, fields: { sugar: 0.25 }, organisms: 1 });
    w.counters.nextDeviceId = 6;
    w.settings = { ...w.settings, lightMode: 'cycle', cycleStartTick: 0, drying: true };
  }
  return { w, slot: slot as Dish['slot'] };
}

async function saved(w: World): Promise<string> {
  return (await buildSaveFile(w, meta)).text;
}

/** A saved state as JSON that a test may edit. */
type EditableState = { -readonly [K in keyof WorldState]: WorldState[K] } & Record<string, unknown>;

/** Edit the saved state as JSON and re-checksum it. */
async function resave(text: string, edit: (s: EditableState) => void): Promise<string> {
  const f = JSON.parse(text) as { state: EditableState; checksum: string };
  edit(f.state);
  f.checksum = `sha256:${await sha256Hex(canonicalJson(f.state))}`;
  return JSON.stringify(f);
}

async function expectRefused(text: string, sentence: RegExp): Promise<void> {
  const err = await parseSaveFile(text).then(
    () => null,
    (e: unknown) => e as Error & { kind?: string },
  );
  expect(err, `expected a refusal matching ${sentence}`).not.toBeNull();
  expect(err!.kind).toBe('integrity');
  expect(err!.message).toMatch(sentence);
  expect(err!.message).toMatch(/ Nothing was loaded\.$/);
}

const withoutSystem = (s: EditableState, sys: string) => {
  const m = s.content.manifest;
  s.content = { ...s.content, manifest: { ...m, enabledSystems: m.enabledSystems.filter((x) => x !== sys) } };
};
const f64Payload = (fill: number, at?: [number, number]) => {
  const arr = new Float64Array(CELL_COUNT).fill(fill);
  if (at) arr[at[0]] = at[1];
  return { dtype: 'f64', length: CELL_COUNT, b64: typedToBase64(arr) };
};

describe('a dish that records the Phase 5 systems loads its valid schema 5 state', () => {
  it('valid stores and Phase 5 organism state load and round-trip with an equal stateHash', async () => {
    const { w, slot } = dish();
    const c = w.ents.cols;
    c.glowState[slot.b09] = 1;
    c.glowDwell[slot.b09] = 2.5;
    c.metabolicMode[slot.a04] = 1;
    c.handlingNeed[slot.p10] = 3;
    c.flags[slot.f04] = c.flags[slot.f04]! | FLAG.restNewborn;
    c.lifeState[slot.f04] = LIFE_RESTING;
    c.trapSlot[slot.f03] = slot.p04;
    c.trapBirthId[slot.f03] = c.birthId[slot.p04]!;
    c.heldBySlot[slot.p04] = slot.f03;
    c.heldByBirthId[slot.p04] = c.birthId[slot.f03]!;
    // The trap reserve stays 0: computeTotals does not count it until e3-traps (D-0108).
    c.trapTimer[slot.f03] = 1.5;
    const { world } = await loadSaveFile(await saved(w));
    expect(stateHash(world)).toBe(stateHash(w));
    expect(world.edges).toEqual(EDGES);
    expect(world.devices).toEqual(DEVICES);
    expect(world.gateTally).toEqual(w.gateTally);
    expect(world.ents.cols.heldBySlot[slot.p04]).toBe(slot.f03);
    const again = await loadSaveFile(await saved(world));
    expect(stateHash(again.world)).toBe(stateHash(w));
  });

  it('a resting B09 carrying E03 that does not glow loads (the control for "glowing while not active")', async () => {
    const { w } = dish();
    const s = placeWith(w, 'B09', 62.5, 64.5, ['E03'], { E: 40 });
    w.ents.cols.lifeState[s] = LIFE_RESTING;
    w.ents.cols.glowDwell[s] = 1;
    const { world } = await loadSaveFile(await saved(w));
    expect(stateHash(world)).toBe(stateHash(w));
  });

  it('a trap cooling down without a target, and a shutter, load', async () => {
    const { w, slot } = dish();
    w.ents.cols.trapCooldown[slot.f03] = 10;
    await expect(loadSaveFile(await saved(w))).resolves.toBeDefined();
  });
});

describe('the import refuses schema 5 stores the dish does not record or that are malformed', () => {
  it('stores and settings that need a system the dish does not record', async () => {
    const text = await saved(dish().w);
    await expectRefused(await resave(text, (s) => withoutSystem(s, 'barriers')), /^The dish has edge barriers, but its rules have no edge barriers\./);
    await expectRefused(await resave(text, (s) => withoutSystem(s, 'devices')), /^The dish has furnishings or devices, but its rules have none\./);
    await expectRefused(await resave(text, (s) => withoutSystem(s, 'climate')), /^The dish has local warmth, but its rules have no climate\./);
    const plain = await saved(dish(false).w);
    const moistNoClimate = await resave(plain, (s) => {
      withoutSystem(s, 'climate');
      s.climate = { warmth: null, moisture: f64Payload(0.8) as never };
    });
    await expectRefused(moistNoClimate, /^The dish has local moisture, but its rules have no climate\./);
    const noClimate = async (edit: (s: EditableState) => void) =>
      resave(plain, (s) => {
        withoutSystem(s, 'climate');
        edit(s);
      });
    await expectRefused(await noClimate((s) => (s.settings = { ...s.settings, lightMode: 'cycle', cycleStartTick: 0 })), /^The dish's light cycles, but its rules have no climate\./);
    await expectRefused(await noClimate((s) => (s.settings = { ...s.settings, drying: true })), /^The dish is drying, but its rules have no climate\./);
    const tally = (s: EditableState) => {
      withoutSystem(s, 'barriers');
      s.gateTally = [{ id: 1, fields: {}, organisms: 0 }];
      s.counters = { ...s.counters, nextDeviceId: 2 };
    };
    await expectRefused(await resave(plain, tally), /^The dish has gate tallies, but its rules have no edge barriers\./);
  });

  it('malformed climate arrays', async () => {
    const text = await saved(dish().w);
    const bad = async (warmth: unknown, re: RegExp) => expectRefused(await resave(text, (s) => (s.climate = { warmth: warmth as never, moisture: null })), re);
    await bad({ ...f64Payload(0.5), dtype: 'f32' }, /^The dish's local warmth cannot be read\./);
    await bad({ dtype: 'f64', length: 10, b64: typedToBase64(new Float64Array(10)) }, /^The dish's local warmth cannot be read\./);
    await bad({ ...f64Payload(0.5), b64: typedToBase64(new Float64Array(10)) }, /^The dish's local warmth cannot be read\./);
    await bad(f64Payload(0.5, [77, 1.5]), /^The dish's local warmth has an invalid value at cell 77\./);
    await bad(f64Payload(0.5, [78, -0.25]), /invalid value at cell 78/);
    await bad(f64Payload(0.5, [79, Number.NaN]), /invalid value at cell 79/);
  });

  it('the light cycle start', async () => {
    const text = await saved(dish().w); // lightMode 'cycle', cycleStartTick 0, tick 0
    const settings = async (edit: Record<string, unknown>) => resave(text, (s) => (s.settings = { ...s.settings, ...edit }));
    await expectRefused(await settings({ cycleStartTick: undefined }), /^The dish's light cycle has no start\./);
    for (const t of [-1, 0.5, 1]) await expectRefused(await settings({ cycleStartTick: t }), /^The dish's light cycle starts at an invalid time\./);
    await expectRefused(await settings({ lightMode: 'fixed' }), /^The dish records a light cycle start, but its light does not cycle\./);
  });

  it('edge barrier and device stores on the dish’s own grid, with one id space', async () => {
    const text = await saved(dish().w);
    // S04 (cell (62, 66) R) beside a gel cell: checked against the saved grid.
    await expectRefused(
      await resave(text, (s) => {
        const sub = Uint8Array.from(atob(s.grid.substrate.b64), (ch) => ch.charCodeAt(0));
        sub[cellIndex(63, 66)] = SUB_GEL;
        s.grid = { ...s.grid, substrate: { ...s.grid.substrate, b64: typedToBase64(sub) } };
      }),
      /^A one-way channel does not join two open water cells\./,
    );
    await expectRefused(
      await resave(text, (s) => {
        const m = s.content.manifest;
        s.content = { ...s.content, manifest: { ...m, enabledStructures: (m.enabledStructures ?? []).filter((x) => x !== 'S01') } };
      }),
      /^An edge barrier is of kind S01, which this dish's rules do not include\./,
    );
    await expectRefused(await resave(text, (s) => (s.devices = [copy(DEVICES[0]!), { id: 7, kind: 'S05', cell: cellIndex(70, 70) }, copy(DEVICES[1]!)] as never)), /^Two devices share one cell\./);
    await expectRefused(await resave(text, (s) => (s.devices = [{ ...copy(DEVICES[0]!), id: 3 }, copy(DEVICES[1]!)] as never)), /^Two structures share one identity\./);
    await expectRefused(await resave(text, (s) => (s.counters = { ...s.counters, nextDeviceId: 5 })), /^A structure has an identity the dish never gave\./);
    for (const n of [0, 1.5]) await expectRefused(await resave(text, (s) => (s.counters = { ...s.counters, nextDeviceId: n })), /^The structure counter is invalid\./);
  });

  it('a present store or counter must be well formed: null is not absent (D-0108)', async () => {
    const text = await saved(dish().w);
    const edit = async (e: (s: EditableState) => void, re: RegExp) => expectRefused(await resave(text, e), re);
    await edit((s) => (s.edges = null as never), /^The edge barriers are not a list\./);
    await edit((s) => (s.devices = null as never), /^The devices are not a list\./);
    await edit((s) => (s.gateTally = null as never), /^The gate tallies are not a list\./);
    for (const climate of [null, [], { warmth: null, moisture: null, light: null }]) {
      await edit((s) => (s.climate = climate as never), /^The dish's local climate cannot be read\./);
    }
    await edit((s) => (s.counters = { ...s.counters, nextDeviceId: null as never }), /^The structure counter is invalid\./);
    await edit((s) => (s.counters = { ...s.counters, nextObjectId: null as never }), /^The food object counter is invalid\./);
    // An absent store is still empty, as deserializeWorld reads it.
    const plain = await saved(dish(false).w);
    const absent = await resave(plain, (s) => {
      delete s.edges;
      delete s.devices;
      delete s.climate;
      delete s.gateTally;
    });
    await expect(parseSaveFile(absent)).resolves.toBeDefined();
  });

  it('gate tallies', async () => {
    const text = await saved(dish().w);
    const tally = async (t: unknown, re: RegExp) => expectRefused(await resave(text, (s) => (s.gateTally = t as never)), re);
    await tally({}, /^The gate tallies are not a list\./);
    await tally([{ id: 2, fields: {}, organisms: 0 }, { id: 1, fields: {}, organisms: 0 }], /^The gate tallies are out of order or repeated\./);
    await tally([{ id: 1, fields: {}, organisms: 0 }, { id: 1, fields: {}, organisms: 0 }], /out of order or repeated/);
    await tally([{ id: 6, fields: {}, organisms: 0 }], /^A gate tally names a structure the dish never placed\./);
    await tally([{ id: 1, fields: { gold: 1 }, organisms: 0 }], /^A gate tally counts an unknown field "gold"\./);
    await tally([{ id: 1, fields: { sugar: -1 }, organisms: 0 }], /^A gate tally holds an invalid amount\./);
    for (const n of [-1, 0.5]) await tally([{ id: 1, fields: {}, organisms: n }], /^A gate tally holds an invalid organism count\./);
    await tally([{ id: 1, fields: {}, organisms: 0, note: 'x' }], /^A gate tally has an unknown entry "note"\./);
  });
});

describe('the import refuses Phase 5 organism state the dish’s rules could not have produced', () => {
  const cases: [string, (d: Dish) => void, RegExp][] = [
    ['glowState 2', ({ w, slot }) => (w.ents.cols.glowState[slot.b09] = 2), /^An organism has an unknown glow state\./],
    ['glowing without SIGNAL_GLOW or E02', ({ w, slot }) => (w.ents.cols.glowState[slot.b01] = 1), /^An organism is glowing although it cannot glow\./],
    ['a negative glow timer', ({ w, slot }) => (w.ents.cols.glowDwell[slot.b09] = -1), /^An organism's glow timer is negative\./],
    ['metabolicMode 3', ({ w, slot }) => (w.ents.cols.metabolicMode[slot.a04] = 3), /^An organism has an unknown feeding mode\./],
    ['a mode without MIXOTROPHY', ({ w, slot }) => (w.ents.cols.metabolicMode[slot.b01] = 1), /^An organism has a feeding mode although it cannot switch modes\./],
    ['a trap reserve without TRAP', ({ w, slot }) => (w.ents.cols.trapReserveC[slot.b01] = 0.1), /^An organism has trap state although it cannot trap\./],
    ['a trap cooldown without TRAP', ({ w, slot }) => (w.ents.cols.trapCooldown[slot.p10] = 1), /cannot trap/],
    ['a negative trap reserve', ({ w, slot }) => (w.ents.cols.trapReserveN[slot.f03] = -0.1), /^An organism's trap reserve is negative\./],
    ['a negative trap hold time', ({ w, slot }) => (w.ents.cols.trapTimer[slot.f03] = -1), /^An organism's trap hold time is negative\./],
    ['a negative trap wait', ({ w, slot }) => (w.ents.cols.trapCooldown[slot.f03] = -1), /^An organism's trap wait is negative\./],
    ['a trap birthId without a slot', ({ w, slot }) => (w.ents.cols.trapBirthId[slot.f03] = 3), /^A trap names an organism it does not hold\./],
    // D-0108: the conservation totals do not count a trap reserve until e3-traps, which replaces this rule.
    ['a trap reserve (carbon)', ({ w, slot }) => (w.ents.cols.trapReserveC[slot.f03] = 0.4), /^A trap holds a food reserve that this version does not count yet\./],
    ['a trap reserve (nutrient)', ({ w, slot }) => (w.ents.cols.trapReserveN[slot.f03] = 0.04), /^A trap holds a food reserve that this version does not count yet\./],
    [
      'a trap holding itself (D-0108)',
      ({ w, slot }) => {
        const c = w.ents.cols;
        c.trapSlot[slot.f03] = slot.f03;
        c.trapBirthId[slot.f03] = c.birthId[slot.f03]!;
        c.heldBySlot[slot.f03] = slot.f03;
        c.heldByBirthId[slot.f03] = c.birthId[slot.f03]!;
      },
      /^A trap holds itself\./,
    ],
    [
      // D-0106: glow is off in any non-Active state. B09 with E03 may rest, so only the glow rule refuses it.
      'glowing while not active (D-0108)',
      ({ w }) => {
        const s = placeWith(w, 'B09', 62.5, 64.5, ['E03'], { E: 40 });
        w.ents.cols.lifeState[s] = LIFE_RESTING;
        w.ents.cols.glowState[s] = 1;
      },
      /^An organism is glowing although it is not active\./,
    ],
    [
      'a trap whose target does not point back',
      ({ w, slot }) => {
        w.ents.cols.trapSlot[slot.f03] = slot.p04;
        w.ents.cols.trapBirthId[slot.f03] = w.ents.cols.birthId[slot.p04]!;
      },
      /^A trap and the organism it holds do not refer to each other\./,
    ],
    [
      'a trap naming another birth',
      ({ w, slot }) => {
        w.ents.cols.trapSlot[slot.f03] = slot.p04;
        w.ents.cols.trapBirthId[slot.f03] = 999;
      },
      /^A trap holds an organism that is not there\./,
    ],
    [
      'a held organism whose trap does not point back',
      ({ w, slot }) => {
        w.ents.cols.heldBySlot[slot.p04] = slot.f03;
        w.ents.cols.heldByBirthId[slot.p04] = w.ents.cols.birthId[slot.f03]!;
      },
      /^A held organism and its trap do not refer to each other\./,
    ],
    ['held by a trap that is not there', ({ w, slot }) => (w.ents.cols.heldBySlot[slot.p04] = slot.f03), /^An organism is held by a trap that is not there\./],
    ['a held-by birthId without a slot', ({ w, slot }) => (w.ents.cols.heldByBirthId[slot.p04] = 4), /^An organism names a trap that does not hold it\./],
    ['a negative handling time', ({ w, slot }) => (w.ents.cols.handlingNeed[slot.p10] = -1), /^An organism's handling time is negative\./],
    ['handling without HANDLING', ({ w, slot }) => (w.ents.cols.handlingNeed[slot.b01] = 2), /^An organism is handling prey although it has no handling ability\./],
    ['restNewborn without RESTING_DAUGHTER', ({ w, slot }) => (w.ents.cols.flags[slot.b01] = w.ents.cols.flags[slot.b01]! | FLAG.restNewborn), /^An organism is marked as a resting newborn although its kind has no resting daughters\./],
    ['restNewborn while Active', ({ w, slot }) => (w.ents.cols.flags[slot.f04] = w.ents.cols.flags[slot.f04]! | FLAG.restNewborn), /^An active organism is marked as a resting newborn\./],
  ];
  for (const [name, edit, re] of cases) {
    it(name, async () => {
      const d = dish();
      edit(d);
      await expectRefused(await saved(d.w), re);
    });
  }

  it('a dead slot holding schema 5 state', async () => {
    const { w, slot } = dish();
    const text = await resave(await saved(w), (s) => {
      // slot.b09 is below highWater; make it a dead slot that still holds a glow timer.
      for (const [name, value] of [['alive', 0], ['glowDwell', 1]] as const) {
        const enc = s.entities.columns[name]!;
        const dtype = ENTITY_COLUMNS.find(([n]) => n === name)![1];
        const bytes = Uint8Array.from(atob(enc.b64), (ch) => ch.charCodeAt(0));
        new (dtype === 'u8' ? Uint8Array : Float64Array)(bytes.buffer, 0, enc.length)[slot.b09] = value;
        (enc as { b64: string }).b64 = btoa(String.fromCharCode(...bytes));
      }
    });
    await expectRefused(text, /^An empty place in the dish holds organism state\./);
  });
});

describe('the import refuses a held sample with a trap, a held organism or impossible Phase 5 state', () => {
  /** Move organism `slot` into a held sample (as Take will), with its Phase 5 columns edited. */
  function hold(w: World, s: number, edit: Partial<Record<ColumnName, number>>): void {
    const cols: Record<string, number> = {};
    for (const [name] of ENTITY_COLUMNS) cols[name] = (w.ents.cols[name] as ArrayLike<number>)[s]!;
    Object.assign(cols, edit);
    const g = w.ents.cols.genome[s]!;
    const x = Math.floor(w.ents.cols.x[s]!);
    const y = Math.floor(w.ents.cols.y[s]!);
    const sample: SampleSlot = {
      txId: 'tx-p5',
      seq: w.commands.nextSeq,
      mode: 'life',
      origin: [x, y],
      radius: 1,
      rows: [{ slot: s, cols: cols as SampleRow['cols'] }],
      cells: [],
      objects: [],
      genomes: [{ index: g, genome: serializeWorld(w).genomes[g]! }],
    };
    w.ents.free(s);
    w.sample = sample;
  }

  it('a plain held organism loads', async () => {
    const { w, slot } = dish();
    hold(w, slot.spare, {});
    const { world } = await loadSaveFile(await saved(w));
    expect(stateHash(world)).toBe(stateHash(w));
  });

  for (const [name, which, edit, re] of [
    ['a held trap', 'f03', { trapSlot: 2, trapBirthId: 5 }, /^The held sample holds a trap or a trapped organism\./],
    ['a held trapped organism', 'p04', { heldBySlot: 4, heldByBirthId: 5 }, /^The held sample holds a trap or a trapped organism\./],
    ['a held organism glowing without the ability', 'spare', { glowState: 1 }, /^The held sample cannot be loaded\. An organism is glowing although it cannot glow\./],
    ['a held organism with an unknown feeding mode', 'a04', { metabolicMode: 9 }, /^The held sample cannot be loaded\. An organism has an unknown feeding mode\./],
  ] as const) {
    it(name, async () => {
      const d = dish();
      hold(d.w, d.slot[which], edit);
      await expectRefused(await saved(d.w), re);
    });
  }
});
