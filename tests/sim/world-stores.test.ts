/**
 * World schema 4 stores (Phase 3 foundation; SPEC §3.4, §5.1, §10.5; D-0035): finite food objects
 * (src/sim/objects.ts) and the sample slot (src/sim/sampleSlot.ts).
 * - Both are ledgered compartments: a move from a cell into either keeps the ledger balanced, and
 *   deleting the moved material without an export breaks it.
 * - They save and load exactly (held rows as typed payloads, −0 included), and stateHash is equal
 *   after the round trip.
 * - Hash-neutral only while empty: a non-empty store, a set link, a non-empty Phase 3 column or a
 *   moved object counter changes stateHash.
 * - The import refuses malformed schema 4 state with a readable message before any world is built.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import { ENTITY_COLUMNS, type ColumnName } from '../../src/sim/entities';
import { cellIndex, ST_STONE } from '../../src/sim/grid';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { checkLedger, recordExport } from '../../src/sim/ledger';
import { addFungalLink, LINK_TRANSPORT, linksValid, removeAllLinks } from '../../src/sim/links';
import { createObject, FOOD_OBJECT_CAP, removeObject, type FoodObject } from '../../src/sim/objects';
import type { SampleRow, SampleSlot } from '../../src/sim/sampleSlot';
import { deserializeWorld, serializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import type { World } from '../../src/sim/world';
import {
  clearWater,
  linkAdhesion,
  linkFungal,
  place,
  placeObject,
  rebaseLedger,
  setField,
} from '../helpers/world';

const CELL = cellIndex(64, 64);
const meta = { name: 'stores', savedAt: '2026-10-01T00:00:00Z', recipeId: null };

/** A world with 1 C of sugar and 0.1 N of its companion in CELL, ledger re-baselined. */
function sugarWorld(): World {
  const w = clearWater();
  setField(w, 'sugar', CELL, 1);
  setField(w, 'sugarN', CELL, 0.1);
  rebaseLedger(w);
  expect(checkLedger(w).ok).toBe(true);
  return w;
}

function rowOf(w: World, slot: number): SampleRow {
  const cols: Record<string, number> = {};
  for (const [name] of ENTITY_COLUMNS) cols[name] = w.ents.cols[name][slot]!;
  return { slot, cols: cols as Record<ColumnName, number> };
}

function emptySample(w: World, over: Partial<SampleSlot> = {}): SampleSlot {
  return {
    txId: 'tx-1',
    seq: w.commands.nextSeq,
    mode: 'all',
    origin: [64, 64],
    radius: 1,
    rows: [],
    cells: [],
    objects: [],
    genomes: [],
    ...over,
  };
}

/** Move organism `slot` into a held sample with its genome (as Take will), freeing its slot. */
function holdOrganism(w: World, slot: number, over: Partial<SampleSlot> = {}): SampleSlot {
  const g = w.ents.cols.genome[slot]!;
  const sample = emptySample(w, {
    rows: [rowOf(w, slot)],
    genomes: [{ index: g, genome: serializeWorld(w).genomes[g]! }],
    ...over,
  });
  removeAllLinks(w, slot);
  w.ents.free(slot);
  w.sample = sample;
  return sample;
}

/** A world holding a little of everything schema 4 adds. */
function richWorld(): World {
  const w = clearWater();
  const [a, b, c, d] = [
    place(w, 'B01', 40.5, 64.5, { E: 5 }),
    place(w, 'B01', 44.5, 64.5, { E: 5 }),
    place(w, 'B04', 48.5, 64.5, { E: 5 }),
    place(w, 'B01', 52.5, 64.5, { E: 5 }),
  ];
  linkFungal(w, a, b, LINK_TRANSPORT);
  linkAdhesion(w, b, c);
  w.ents.cols.filmSeconds[c] = 3.5;
  w.ents.cols.noUsableIntakeSeconds[a] = 1.25;
  placeObject(w, CELL, 'pellet', { sugar: 10 }, 1);
  placeObject(w, cellIndex(70, 70), 'wafer', { starch: 6, protein: 4 }, 1);
  w.ents.cols.targetX[d] = -0; // a −0 in a held row must survive the save
  holdOrganism(w, d, { cells: [{ dx: 0, dy: 0, fields: { sugar: 0.5, sugarN: 0.05 } }] });
  w.ledger.inputs.c += 0.5;
  w.ledger.inputs.n += 0.05;
  return w;
}

async function editedSave(
  w: World,
  edit: (s: WorldState & Record<string, unknown>) => void,
): Promise<string> {
  const { text } = await buildSaveFile(w, meta);
  const f = JSON.parse(text) as { state: WorldState & Record<string, unknown>; checksum: string };
  edit(f.state);
  f.checksum = `sha256:${await sha256Hex(canonicalJson(f.state))}`;
  return JSON.stringify(f);
}

/** Overwrite one value of an entity column payload in a saved state. */
function setColumn(s: WorldState, name: ColumnName, slot: number, value: number): void {
  const enc = s.entities.columns[name]!;
  const dtype = ENTITY_COLUMNS.find(([n]) => n === name)![1];
  const bytes = Uint8Array.from(atob(enc.b64), (ch) => ch.charCodeAt(0));
  const Ctor = {
    f64: Float64Array,
    f32: Float32Array,
    i32: Int32Array,
    u32: Uint32Array,
    u16: Uint16Array,
    u8: Uint8Array,
  }[dtype];
  new Ctor(bytes.buffer, 0, enc.length)[slot] = value;
  (enc as { b64: string }).b64 = btoa(String.fromCharCode(...bytes));
}

async function expectRefused(text: string, message: RegExp): Promise<void> {
  // parseSaveFile runs every check before a world is built; loadSaveFile builds nothing when it throws.
  await expect(parseSaveFile(text)).rejects.toMatchObject({ kind: 'integrity' });
  await expect(parseSaveFile(text)).rejects.toThrow(message);
  await expect(loadSaveFile(text)).rejects.toThrow(/Nothing was loaded/);
}

describe('food objects and the sample slot are ledgered compartments', () => {
  it('moving 1 C + 0.1 N from a cell into an object keeps the ledger; deleting it without an export breaks it', () => {
    const w = sugarWorld();
    w.fields.sugar![CELL] = 0;
    w.fields.sugarN![CELL] = 0;
    const res = createObject(w, { cell: CELL, kind: 'pellet', pools: { sugar: 1 }, n: 0.1 });
    expect(res.ok).toBe(true);
    expect(checkLedger(w).ok).toBe(true);
    const id = (res as { object: FoodObject }).object.id;
    removeObject(w, id);
    expect(checkLedger(w).ok).toBe(false);
    // … unless the removal is logged as an export.
    recordExport(w, 'test', 1, 0.1);
    expect(checkLedger(w).ok).toBe(true);
  });

  it('moving 1 C + 0.1 N from a cell into the sample slot keeps the ledger; deleting it without an export breaks it', () => {
    const w = sugarWorld();
    w.fields.sugar![CELL] = 0;
    w.fields.sugarN![CELL] = 0;
    w.sample = emptySample(w, { cells: [{ dx: 0, dy: 0, fields: { sugar: 1, sugarN: 0.1 } }] });
    expect(checkLedger(w).ok).toBe(true);
    w.sample = null;
    expect(checkLedger(w).ok).toBe(false);
  });

  it('a held organism (with its shell-free body, meal and nutrient) and a held object are counted too', () => {
    const w = clearWater();
    const s = place(w, 'B01', 64.5, 64.5);
    placeObject(w, cellIndex(60, 60), 'wafer', { starch: 6, protein: 4 }, 1);
    rebaseLedger(w);
    const obj = removeObject(w, w.objects[0]!.id)!;
    holdOrganism(w, s, { objects: [obj] });
    expect(w.ents.isAlive(s)).toBe(false);
    expect(checkLedger(w).ok).toBe(true);
    w.sample = null;
    expect(checkLedger(w).ok).toBe(false);
  });

  it('createObject refuses the cap, an occupied cell, the outside and a structure, changing nothing', () => {
    const w = clearWater();
    w.grid.structure[cellIndex(66, 64)] = ST_STONE;
    const spec = { kind: 'pellet' as const, pools: { sugar: 10 }, n: 1 };
    expect(createObject(w, { ...spec, cell: cellIndex(0, 0) })).toEqual({ ok: false, reason: 'outside' });
    expect(createObject(w, { ...spec, cell: cellIndex(66, 64) })).toEqual({ ok: false, reason: 'structure' });
    expect(createObject(w, { ...spec, cell: CELL }).ok).toBe(true);
    expect(createObject(w, { ...spec, cell: CELL })).toEqual({ ok: false, reason: 'occupied' });
    expect(createObject(w, { ...spec, cell: CELL + 1, pools: { sugar: -1 } })).toEqual({
      ok: false,
      reason: 'invalid',
    });
    for (let k = 1; w.objects.length < FOOD_OBJECT_CAP; k++)
      expect(createObject(w, { ...spec, cell: cellIndex(30 + (k % 60), 50 + Math.floor(k / 60)) }).ok).toBe(
        true,
      );
    expect(createObject(w, { ...spec, cell: cellIndex(64, 80) })).toEqual({ ok: false, reason: 'cap' });
    expect(w.objects).toHaveLength(FOOD_OBJECT_CAP);
    expect(w.objects.map((o) => o.id)).toEqual(Array.from({ length: FOOD_OBJECT_CAP }, (_, k) => k + 1));
    expect(w.counters.nextObjectId).toBe(FOOD_OBJECT_CAP + 1);
  });
});

describe('schema 4 state saves exactly and hashes only when it holds something', () => {
  it('serialize → deserialize and save → load keep stateHash with non-empty stores, links and columns (−0 kept)', async () => {
    const w = richWorld();
    expect(checkLedger(w).ok).toBe(true);
    expect(linksValid(w)).toBe(true);
    const h = stateHash(w);
    const back = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))) as WorldState);
    expect(stateHash(back)).toBe(h);
    expect(back.objects).toEqual(w.objects);
    expect(back.sample).toEqual(w.sample);
    expect(linksValid(back)).toBe(true);
    const { world } = await loadSaveFile((await buildSaveFile(w, meta)).text);
    expect(stateHash(world)).toBe(h);
    expect(Object.is(world.sample!.rows[0]!.cols.targetX, -0)).toBe(true);
    expect(checkLedger(world).ok).toBe(true);
    // The held rows are typed payloads in the file, not JSON numbers.
    const saved = JSON.parse((await buildSaveFile(w, meta)).text) as {
      state: { sample: { rows: { columns: Record<string, { dtype: string }> } } };
    };
    expect(saved.state.sample.rows.columns.targetX!.dtype).toBe('f64');
    expect(saved.state.sample.rows.columns.species!.dtype).toBe('u16');
  });

  it('a non-empty store, a set link, a non-empty Phase 3 column or a moved object counter each change stateHash', () => {
    const base = () => {
      const w = clearWater();
      place(w, 'B01', 40.5, 64.5, { E: 5 });
      place(w, 'B01', 44.5, 64.5, { E: 5 });
      return w;
    };
    const h0 = stateHash(base());
    expect(stateHash(base())).toBe(h0);
    const variants: [string, (w: World) => void][] = [
      ['fungal link', (w) => addFungalLink(w, 0, 1, LINK_TRANSPORT)],
      ['adhesion link', (w) => linkAdhesion(w, 0, 1)],
      ['filmSeconds', (w) => (w.ents.cols.filmSeconds[1] = 0.1)],
      ['anchorState', (w) => (w.ents.cols.anchorState[0] = 1)],
      ['adhPartner', (w) => (w.ents.cols.adhPartner[0] = 2)],
      ['waterCrossed', (w) => (w.ents.cols.waterCrossed[0] = 1)],
      ['noUsableIntakeSeconds', (w) => (w.ents.cols.noUsableIntakeSeconds[0] = 0.1)],
      ['−0 in a Phase 3 column', (w) => (w.ents.cols.adhSeconds[0] = -0)],
      ['object', (w) => void createObject(w, { cell: CELL, kind: 'pellet', pools: { sugar: 10 }, n: 1 })],
      ['object counter', (w) => (w.counters.nextObjectId = 2)],
      ['sample', (w) => (w.sample = emptySample(w))],
    ];
    const seen: string[] = [h0];
    for (const [what, change] of variants) {
      const w = base();
      change(w);
      const h = stateHash(w);
      expect(h, what).not.toBe(h0);
      expect(seen, what).not.toContain(h);
      seen.push(h);
    }
  });
});

describe('the import refuses malformed schema 4 state before building a world', () => {
  it('a valid file with every schema 4 store loads', async () => {
    const w = richWorld();
    const { world } = await loadSaveFile(await editedSave(w, () => {}));
    expect(stateHash(world)).toBe(stateHash(w));
  });

  it('more than 128 food objects', async () => {
    const text = await editedSave(richWorld(), (s) => {
      const objects = Array.from({ length: FOOD_OBJECT_CAP + 1 }, (_, k) => ({
        id: k + 1,
        cell: cellIndex(30 + (k % 60), 50 + Math.floor(k / 60)),
        kind: 'pellet',
        pools: { sugar: 1 },
        n: 0,
      }));
      (s as Record<string, unknown>).objects = objects;
      (s.counters as { nextObjectId: number }).nextObjectId = FOOD_OBJECT_CAP + 2;
    });
    await expectRefused(text, /food objects cannot be loaded \(more than 128 food objects\)/);
  });

  it('a food object outside the dish', async () => {
    const text = await editedSave(
      richWorld(),
      (s) => ((s.objects as FoodObject[])[0] = { ...(s.objects as FoodObject[])[0]!, cell: cellIndex(0, 0) }),
    );
    await expectRefused(text, /food object lies outside the dish/);
  });

  it('a food object on a structure', async () => {
    const w = richWorld();
    w.grid.structure[cellIndex(66, 64)] = ST_STONE;
    const text = await editedSave(
      w,
      (s) =>
        ((s.objects as FoodObject[])[0] = { ...(s.objects as FoodObject[])[0]!, cell: cellIndex(66, 64) }),
    );
    await expectRefused(text, /food object lies on a structure/);
  });

  it('an asymmetric link', async () => {
    const text = await editedSave(
      richWorld(),
      (s) => setColumn(s, 'fLink0', 1, -1) /* slot 1 forgets slot 0 */,
    );
    // (its birthId stays set, which is itself malformed; clear it so only the asymmetry remains)
    const f = JSON.parse(text) as { state: WorldState; checksum: string };
    setColumn(f.state, 'fLinkB0', 1, 0);
    setColumn(f.state, 'fLinkKind0', 1, 0);
    f.checksum = `sha256:${await sha256Hex(canonicalJson(f.state))}`;
    await expectRefused(
      JSON.stringify(f),
      /links are inconsistent \(the fungal link between slots 0 and 1 is not symmetric\)/,
    );
  });

  it('a dangling link (wrong birthId)', async () => {
    const text = await editedSave(richWorld(), (s) => setColumn(s, 'aLinkB0', 1, 999));
    await expectRefused(text, /links are inconsistent \(slot 1 has a dangling adhesion link\)/);
  });

  it('a fungal degree above 4 and an adhesion degree above 2', async () => {
    const copy = (s: WorldState, from: string, to: string) =>
      ((s.entities.columns as Record<string, unknown>)[to] = s.entities.columns[from]);
    const fungal = await editedSave(richWorld(), (s) => {
      copy(s, 'fLink0', 'fLink4');
      copy(s, 'fLinkB0', 'fLinkB4');
      copy(s, 'fLinkKind0', 'fLinkKind4');
    });
    await expectRefused(fungal, /more than 4 fungal links/);
    const adhesion = await editedSave(richWorld(), (s) => {
      copy(s, 'aLink0', 'aLink2');
      copy(s, 'aLinkB0', 'aLinkB2');
    });
    await expectRefused(adhesion, /more than 2 adhesion links/);
  });

  it('a held sample row with an unknown species or genome', async () => {
    type Saved = {
      rows: { columns: Record<string, { b64: string; length: number }> };
      genomes: { index: number }[];
    };
    const setRow = (s: WorldState & Record<string, unknown>, name: ColumnName, value: number) => {
      const sample = s.sample as unknown as Saved;
      setColumn({ entities: { columns: sample.rows.columns } } as unknown as WorldState, name, 0, value);
    };
    await expectRefused(
      await editedSave(richWorld(), (s) => setRow(s, 'species', 40)),
      /held sample cannot be loaded \(a sample row refers to an unknown species\)/,
    );
    await expectRefused(
      await editedSave(richWorld(), (s) => setRow(s, 'genome', 77)),
      /held sample cannot be loaded \(a sample row refers to an unknown genome\)/,
    );
    await expectRefused(
      await editedSave(richWorld(), (s) => ((s.sample as unknown as Saved).genomes = [])),
      /held sample cannot be loaded \(a sample row refers to a genome the sample does not carry\)/,
    );
  });
});
