/**
 * Phase 5 wave 10 structure-commands: determinism, saves, undo and conservation of every new command kind
 * (CLAUDE.md "same seed + same command log ⇒ identical state hash … across save/reload"; SPEC §3.2 stage
 * 1, §10.1, §10.7; D-0113, D-0116, D-0117; src/sim/structureEdits.ts).
 * - A sequence of every new kind and Lab edits applied paused (applyNow at ticks 0, 50, 300) equals the
 *   same commands queued for those ticks (stateHash at 1,000); run(w, 400) equals four run(w, 100) with
 *   queued commands inside the window; save between two commands → load → continue equals uninterrupted.
 * - For EACH kind, applied paused and also queued: the world right after the command equals its
 *   buildSaveFile → loadSaveFile reload in stateHash, and both stay equal for 300 more ticks (a write that
 *   skipped the geometryVersion bump would leave wave 9's edge, shelter, mesh, roof or warmth caches stale
 *   in the running world but not in the reload).
 * - Undo as the host does it (serializeWorld before, apply, deserializeWorld) gives the pre-command hash.
 * - The same for severing (fungal, adhesion, shutter close), a basket moved with its pellet and a resin
 *   removed with bound activity, in a dish that holds links, a basket and a resin: reload and its reload
 *   equal, +300 equal, paused + 301 equals queued + 300.
 * - Conservation: computeTotals c/n/m exactly equal before and after every kind; a closed-lid dish with all
 *   twelve kinds placed by command at tick 100 keeps checkLedger relErr < 1e-5 over 10,000 ticks.
 * - The Life brush preview equals the inoculate filter: for every species of a registry that enables every
 *   Phase 5 species (allowUnimplemented: their abilities are implemented by this and later waves),
 *   lifeCellOutcome(…, extras) === 'ok' exactly when canOccupy, over a dish with 20 S05 and 20 S06.
 */
import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { applyNow, queueCommand, type CommandPayload } from '../../src/sim/commands';
import { freeClassOfSpecies } from '../../src/sim/barriers';
import { CELL_COUNT } from '../../src/sim/constants';
import { deviceKindsOf, KIND_MESH, KIND_SHELTER } from '../../src/sim/edgePassage';
import { SYSTEM_FLAGS } from '../../src/sim/fields';
import { cellIndex, habitatMaskOf, isStoneEdge, lifeCellOutcome, maskCells, ST_NONE, type LifeBrush } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { LINK_TRANSPORT, linksValid } from '../../src/sim/links';
import { canOccupy } from '../../src/sim/movement';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { barrierRegistry, clearWater, linkAdhesion, linkFungal, PHASE5_STRUCTURE_IDS, place, placeObject, placeWith } from '../helpers/world';

const REG = barrierRegistry();
const meta = { name: 'structure determinism', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const c = cellIndex;

async function reload(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  return (await loadSaveFile(text)).world;
}

/** A clear-water dish with life, gel and sediment patches and a pellet: the base of every test here. */
function base(): World {
  const w = clearWater({}, REG);
  applyNow(w, 'gel', { kind: 'paintSubstrate', substrate: 'gel', points: [[44.5, 50.5], [50.5, 54.5]], radius: 6 });
  applyNow(w, 'sed', { kind: 'paintSubstrate', substrate: 'sediment', points: [[80.5, 80.5]], radius: 6 });
  for (let k = 0; k < 6; k++) place(w, 'A01', 55.5 + k * 3, 62.5);
  for (let k = 0; k < 6; k++) place(w, 'B01', 58.5 + k * 2, 66.5);
  place(w, 'P01', 63.5, 64.5, { E: 60 });
  place(w, 'P01', 66.5, 60.5, { E: 60 });
  place(w, 'B02', 46.5, 52.5);
  placeObject(w, c(70, 70), 'pellet', { sugar: 10 }, 1);
  return w;
}

// Stores placed at tick 0 (ids 1…): every kind, around the life in the middle of the dish.
const T0: CommandPayload[] = [
  { kind: 'placeEdges', structure: 'S01', edges: Array.from({ length: 12 }, (_, k) => [c(64, 58 + k), 'R'] as const) },
  { kind: 'placeEdges', structure: 'S02', edges: Array.from({ length: 6 }, (_, k) => [c(56 + k, 70), 'D'] as const) },
  { kind: 'placeEdges', structure: 'S03', edges: [[c(60, 60), 'R'], [c(60, 61), 'R']], open: true },
  { kind: 'placeEdges', structure: 'S04', edges: [[c(70, 64), 'R']], flow: 1 },
  { kind: 'placeDevice', structure: 'S05', cell: c(62, 64) },
  { kind: 'placeDevice', structure: 'S06', cell: c(47, 60) },
  { kind: 'placeDevice', structure: 'S07', cell: c(70, 70) },
  { kind: 'placeDevice', structure: 'S08', cell: c(66, 66) },
  { kind: 'placeDevice', structure: 'S09', cell: c(58, 62) },
  { kind: 'placeDevice', structure: 'S10', cell: c(72, 60) },
  { kind: 'placeDevice', structure: 'S11', cell: c(46, 52) },
  { kind: 'placeDevice', structure: 'S12', cell: c(52, 58) },
  { kind: 'placeStructure', structure: 'stone', points: [[40.5, 70.5]], radius: 1 },
];
// After T0 the ids are: S01 1–12, S02 13–18, S03 19–20, S04 21, S05 22, S06 23, S07 24, S08 25, S09 26,
// S10 27, S11 28, S12 29 (nextDeviceId then 30).
const T50: CommandPayload[] = [
  { kind: 'setDevice', id: 26, on: true },
  { kind: 'setDevice', id: 27, on: true },
  { kind: 'setDevice', id: 19, open: false },
  { kind: 'setDevice', id: 25, resinSelect: ['inhBact', 'rival'] },
  { kind: 'moveDevice', id: 22, cell: c(61, 66) },
  { kind: 'moveDevice', id: 24, cell: c(74, 70) },
  { kind: 'wetBrush', points: [[46.5, 52.5]], radius: 3 },
  { kind: 'setLightMode', mode: 'cycle' },
  { kind: 'setDrying', drying: true },
  { kind: 'paintSubstrate', substrate: 'gel', points: [[62.5, 66.5]], radius: 1 },
];
const T300: CommandPayload[] = [
  { kind: 'removeStructures', ids: [1, 2, 13, 23, 28] },
  { kind: 'setDevice', id: 19, open: true },
  { kind: 'placeEdges', structure: 'S01', edges: [[c(50, 64), 'D']] },
  { kind: 'setLightMode', mode: 'fixed' },
  { kind: 'setDrying', drying: false },
];
const SCHEDULE: readonly (readonly [number, readonly CommandPayload[]])[] = [
  [0, T0],
  [50, T50],
  [300, T300],
];

describe('paused equals queued, 1× equals chunks, save/reload mid-sequence', () => {
  it('the whole sequence paused at ticks 0, 50, 300 equals it queued (stateHash at 1,000)', () => {
    const a = base();
    let n = 0;
    for (const [t, batch] of SCHEDULE) {
      run(a, t - a.tick);
      for (const p of batch) expect(applyNow(a, `p${n++}`, p).result!.accepted, `${p.kind} at ${t}`).toBeGreaterThan(0);
    }
    run(a, 1000 - a.tick);
    const b = base();
    n = 0;
    for (const [t, batch] of SCHEDULE) for (const p of batch) queueCommand(b, `p${n++}`, p, t);
    run(b, 1000);
    expect(b.tick).toBe(1000);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(b.edges.length).toBeGreaterThan(0);
    expect(b.devices.length).toBeGreaterThan(0);
  });

  it('run(w, 400) equals four run(w, 100) with the commands queued inside the window', () => {
    const make = () => {
      const w = base();
      let n = 0;
      for (const [t, batch] of SCHEDULE) for (const p of batch) queueCommand(w, `q${n++}`, p, t);
      return w;
    };
    const a = make();
    run(a, 400);
    const b = make();
    for (let k = 0; k < 4; k++) run(b, 100);
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it('save between two commands → load → continue equals uninterrupted', async () => {
    const a = base();
    let n = 0;
    for (const p of T0) applyNow(a, `s${n++}`, p);
    run(a, 50);
    applyNow(a, 's-heat', T50[0]!);
    const b = await reload(a);
    expect(stateHash(b)).toBe(stateHash(a));
    for (const w of [a, b]) {
      for (const p of T50.slice(1)) applyNow(w, `t${p.kind}`, p);
      run(w, 250);
    }
    expect(stateHash(b)).toBe(stateHash(a));
  });
});

// One case per command kind (and per edge and device kind, and the settings that matter to a cache).
const CASES: readonly (readonly [string, CommandPayload])[] = [
  ['placeEdges S01', { kind: 'placeEdges', structure: 'S01', edges: [[c(62, 63), 'R'], [c(62, 64), 'R'], [c(62, 65), 'R']] }],
  ['placeEdges S02', { kind: 'placeEdges', structure: 'S02', edges: [[c(62, 63), 'R'], [c(62, 64), 'R'], [c(62, 65), 'R']] }],
  ['placeEdges S03 closed', { kind: 'placeEdges', structure: 'S03', edges: [[c(62, 64), 'R']], open: false }],
  ['placeEdges S03 open', { kind: 'placeEdges', structure: 'S03', edges: [[c(62, 64), 'R']], open: true }],
  ['placeEdges S04', { kind: 'placeEdges', structure: 'S04', edges: [[c(62, 64), 'R']], flow: -1 }],
  ...(['S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'] as const).map((k) => [`placeDevice ${k}`, { kind: 'placeDevice', structure: k, cell: c(64, 66) }] as const),
  ['removeStructures', { kind: 'removeStructures', ids: [1, 3, 4] }],
  ['moveDevice shelter', { kind: 'moveDevice', id: 3, cell: c(63, 64) }],
  ['moveDevice mesh', { kind: 'moveDevice', id: 4, cell: c(46, 53) }],
  ['setDevice shutter', { kind: 'setDevice', id: 2, open: false }],
  ['setDevice heater', { kind: 'setDevice', id: 5, on: true }],
  ['setDevice resin', { kind: 'setDevice', id: 6, resinSelect: ['inhBact'] }],
  ['wetBrush', { kind: 'wetBrush', points: [[46.5, 52.5]], radius: 6 }],
  ['setLightMode', { kind: 'setLightMode', mode: 'cycle' }],
  ['setDrying', { kind: 'setDrying', drying: true }],
];

/** The per-kind base: life, an S01 (id 1), an open shutter (2), a shelter (3), a mesh (4), a heater (5), a resin (6), warmed 60 ticks. */
function kindBase(): World {
  const w = base();
  const setup: CommandPayload[] = [
    { kind: 'placeEdges', structure: 'S01', edges: [[c(66, 60), 'D']] },
    { kind: 'placeEdges', structure: 'S03', edges: [[c(60, 60), 'R']], open: true },
    { kind: 'placeDevice', structure: 'S05', cell: c(65, 64) },
    { kind: 'placeDevice', structure: 'S06', cell: c(46, 54) },
    { kind: 'placeDevice', structure: 'S09', cell: c(58, 62) },
    { kind: 'placeDevice', structure: 'S08', cell: c(66, 66) },
  ];
  setup.forEach((p, k) => expect(applyNow(w, `setup${k}`, p).result!.accepted).toBe(1));
  run(w, 60); // warms every per-world cache before the command under test
  return w;
}

describe('every kind: the world right after the command equals its reload, and both stay equal', () => {
  it.each(CASES)('%s (paused and queued)', async (_, p) => {
    for (const path of ['paused', 'queued'] as const) {
      const w = kindBase();
      const totals = computeTotals(w);
      if (path === 'paused') expect(applyNow(w, 'under-test', p).result!.accepted).toBeGreaterThan(0);
      else {
        const q = queueCommand(w, 'under-test', p, w.tick);
        run(w, 1);
        expect(q.result!.accepted).toBeGreaterThan(0);
      }
      if (path === 'paused') expect(computeTotals(w)).toEqual(totals); // no command kind creates or destroys material
      const r = await reload(w);
      expect(stateHash(r), path).toBe(stateHash(w));
      run(w, 300);
      run(r, 300);
      expect(stateHash(r), `${path} +300`).toBe(stateHash(w));
    }
  });

  it.each(CASES)('%s: undo as the host does it restores the pre-command hash', (_, p) => {
    const w = kindBase();
    const before = serializeWorld(w);
    const hash = stateHash(w);
    expect(applyNow(w, 'undoable', p).result!.accepted).toBeGreaterThan(0);
    expect(stateHash(w)).not.toBe(hash);
    expect(stateHash(deserializeWorld(before))).toBe(hash);
  });
});

/**
 * The per-kind cases the base worlds above never reach (wave 10 lead fixes item 5, from the saves
 * verifier's probe): severing a fungal and an adhesion link (link columns, adhesion lockout, linkBroken
 * events), a basket moved with its pellet (relocateObject) and a resin removed while it holds bound
 * activity (the command's `exported`). A dish with an F02 transport pair on gel, two E12 pairs, an open
 * shutter between the second pair, a basket over a pellet and a resin, warmed 30 ticks; the resin's bound
 * amounts are labelled test state (activity, never ledgered).
 */
function linkedBase(): { w: World; ids: Readonly<Record<'shutter' | 'basket' | 'resin', number>> } {
  const w = clearWater({}, REG);
  applyNow(w, 'lb-gel', { kind: 'paintSubstrate', substrate: 'gel', points: [[60.5, 64.5]], radius: 3 });
  const fa = place(w, 'F02', 60.5, 64.5, { B: 2.8 });
  const fb = place(w, 'F02', 61.5, 64.5, { B: 1.6 });
  linkFungal(w, fa, fb, LINK_TRANSPORT);
  linkAdhesion(w, placeWith(w, 'B01', 70.8, 64.5, ['E12'], { E: 60 }), placeWith(w, 'B01', 71.2, 64.5, ['E12'], { E: 60 }));
  linkAdhesion(w, placeWith(w, 'B01', 50.8, 70.5, ['E12'], { E: 60 }), placeWith(w, 'B01', 51.2, 70.5, ['E12'], { E: 60 }));
  for (let k = 0; k < 4; k++) place(w, 'A01', 66.5 + k, 58.5);
  placeObject(w, c(76, 76), 'pellet', { sugar: 10 }, 1);
  const shutter = applyNow(w, 'lb-shutter', { kind: 'placeEdges', structure: 'S03', edges: [[c(50, 70), 'R']], open: true }).result!.ids![0]!;
  const basket = applyNow(w, 'lb-basket', { kind: 'placeDevice', structure: 'S07', cell: c(76, 76) }).result!.ids![0]!;
  const resin = applyNow(w, 'lb-resin', { kind: 'placeDevice', structure: 'S08', cell: c(78, 70) }).result!.ids![0]!;
  expect(applyNow(w, 'lb-select', { kind: 'setDevice', id: resin, resinSelect: ['inhBact', 'rival'] }).result!.accepted).toBe(1);
  run(w, 30);
  w.devices = w.devices.map((d) => (d.id === resin ? { ...d, bound: { ...(d.bound ?? {}), inhBact: 1.25, rival: 0.5 } } : d));
  w.grid.geometryVersion++;
  return { w, ids: { shutter, basket, resin } };
}

const linkBroken = (w: World) => w.events.ring.some((e) => e.type === 'linkBroken');
const LINKED_CASES: readonly (readonly [string, (ids: ReturnType<typeof linkedBase>['ids']) => CommandPayload, (w: World) => boolean])[] = [
  ['an S01 severs the fungal pair', () => ({ kind: 'placeEdges', structure: 'S01', edges: [[c(60, 64), 'R']] }), linkBroken],
  ['an S01 severs an adhesion pair', () => ({ kind: 'placeEdges', structure: 'S01', edges: [[c(70, 64), 'R']] }), linkBroken],
  ['closing the shutter severs the pair across it', (ids) => ({ kind: 'setDevice', id: ids.shutter, open: false }), linkBroken],
  ['moving the basket carries its pellet', (ids) => ({ kind: 'moveDevice', id: ids.basket, cell: c(80, 76) }), (w) => w.objects.some((o) => o.cell === c(80, 76))],
  ['removing the resin with bound activity (and the basket)', (ids) => ({ kind: 'removeStructures', ids: [ids.resin, ids.basket] }), (w) => w.commands.log.at(-1)!.result!.exported !== undefined],
  ['removing the shutter', (ids) => ({ kind: 'removeStructures', ids: [ids.shutter] }), () => true],
];

describe('severing, a basket move and a resin removal: reloads equal, both continue equal, undo restores', () => {
  it.each(LINKED_CASES)('%s (paused and queued)', async (_, mk, effect) => {
    const hashes: string[] = [];
    for (const path of ['paused', 'queued'] as const) {
      const { w, ids } = linkedBase();
      const totals = computeTotals(w);
      const before = serializeWorld(w);
      const h0 = stateHash(w);
      const p = mk(ids);
      if (path === 'paused') expect(applyNow(w, 'under-test', p).result!.accepted).toBeGreaterThan(0);
      else {
        const q = queueCommand(w, 'under-test', p, w.tick);
        run(w, 1);
        expect(q.result!.accepted).toBeGreaterThan(0);
      }
      expect(effect(w), path).toBe(true);
      expect(linksValid(w)).toBe(true);
      if (path === 'paused') {
        expect(computeTotals(w)).toEqual(totals); // no command kind creates or destroys material
        expect(stateHash(deserializeWorld(before))).toBe(h0); // undo as the host does it
      }
      const r = await reload(w);
      expect(stateHash(r), path).toBe(stateHash(w));
      expect(stateHash(await reload(r)), `${path} second generation`).toBe(stateHash(w));
      run(w, 300);
      run(r, 300);
      expect(stateHash(r), `${path} +300`).toBe(stateHash(w));
      if (path === 'paused') run(w, 1); // the queued path ran its command's tick
      hashes.push(stateHash(w));
    }
    // Paused at tick T then 301 ticks equals queued at T then 300 ticks.
    expect(hashes[1]).toBe(hashes[0]);
  });
});

describe('conservation', () => {
  it('a closed-lid dish with all twelve kinds placed by command at tick 100 keeps the books over 10,000 ticks', () => {
    const w = realizeRecipe(REG, 'FIRST_DISH_V1', { transform: (r) => ({ ...r, lid: 'closed' }) });
    run(w, 100);
    const totals = computeTotals(w);
    const placed: CommandPayload[] = [
      { kind: 'placeEdges', structure: 'S01', edges: Array.from({ length: 20 }, (_, k) => [c(64, 50 + k), 'R'] as const) },
      { kind: 'placeEdges', structure: 'S02', edges: Array.from({ length: 10 }, (_, k) => [c(50 + k, 80), 'D'] as const) },
      { kind: 'placeEdges', structure: 'S03', edges: [[c(70, 40), 'R']], open: false },
      { kind: 'placeEdges', structure: 'S04', edges: [[c(75, 64), 'R']], flow: 1 },
      ...(['S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12'] as const).map((k, j) => ({ kind: 'placeDevice' as const, structure: k, cell: c(60 + j, 75) })),
      { kind: 'setDevice', id: 0, on: true }, // filled in below with the heater's id
    ];
    for (const p of placed.slice(0, -1)) expect(applyNow(w, `cl-${p.kind}-${'structure' in p ? p.structure : ''}`, p).result!.accepted, JSON.stringify(p)).toBeGreaterThan(0);
    const heater = w.devices.find((d) => d.kind === 'S09')!.id;
    expect(applyNow(w, 'cl-heat', { kind: 'setDevice', id: heater, on: true }).result!.accepted).toBe(1);
    const resin = w.devices.find((d) => d.kind === 'S08')!.id;
    expect(applyNow(w, 'cl-resin', { kind: 'setDevice', id: resin, resinSelect: ['inhBact'] }).result!.accepted).toBe(1);
    expect(computeTotals(w)).toEqual(totals);
    expect(new Set([...w.edges, ...w.devices].map((s) => s.kind)).size).toBe(12);
    const inputs = { ...w.ledger.inputs };
    for (let chunk = 0; chunk < 20; chunk++) {
      run(w, 500);
      const check = checkLedger(w);
      expect(check.ok, `tick ${w.tick}: ${JSON.stringify(check)}`).toBe(true);
      expect(Math.max(check.relErr.c, check.relErr.n, check.relErr.m)).toBeLessThan(1e-5);
    }
    expect(w.tick).toBe(10100);
    expect(w.ledger.inputs).toEqual(inputs);
  }, 300_000);
});

describe('the Life brush preview equals the inoculate filter with shelters and meshes', () => {
  it('for every species of a registry enabling every Phase 5 species, over every in-dish cell', () => {
    const species = readdirSync('content/species').map((f) => f.replace('.json', '')).sort();
    const materials = readdirSync('content/materials').map((f) => f.replace('.json', '')).sort();
    const reg = registryWith(
      { enabledSpecies: species, enabledSystems: [...SYSTEM_FLAGS].sort(), enabledMaterials: materials, enabledStructures: ['BEAD', ...PHASE5_STRUCTURE_IDS, 'STONE', 'WALL'] },
      { allowUnimplemented: true },
    );
    const w = clearWater({ habitatId: 'WATER_GARDEN', removeStones: false, backgroundOverrides: {} }, reg);
    applyNow(w, 'gel', { kind: 'paintSubstrate', substrate: 'gel', points: [[40.5, 50.5], [50.5, 50.5]], radius: 6 });
    applyNow(w, 'sed', { kind: 'paintSubstrate', substrate: 'sediment', points: [[80.5, 80.5], [90.5, 80.5]], radius: 6 });
    applyNow(w, 'bead', { kind: 'placeStructure', structure: 'bead', points: [[64.5, 100.5]], radius: 3 });
    // 20 shelters and 20 meshes on gel, sediment and water (some beside the garden's stones): pairs of open
    // cells along three rows.
    const spots: [number, number][] = [];
    for (const [y, x0, n] of [[50, 36, 7], [80, 76, 7], [44, 56, 6]] as const) {
      let got = 0;
      for (let x = x0; got < n && x < 120; x += 2) {
        if (w.grid.structure[c(x, y)] !== ST_NONE || w.grid.structure[c(x + 1, y)] !== ST_NONE) continue;
        spots.push([c(x, y), c(x + 1, y)]);
        got++;
      }
    }
    expect(spots.length).toBe(20);
    for (const [s, m] of spots) {
      expect(applyNow(w, `s${s}`, { kind: 'placeDevice', structure: 'S05', cell: s }).result!.accepted).toBe(1);
      expect(applyNow(w, `m${m}`, { kind: 'placeDevice', structure: 'S06', cell: m }).result!.accepted).toBe(1);
    }
    const kinds = deviceKindsOf(w)!;
    let checked = 0;
    let shelterRefusals = 0;
    let meshAdmits = 0;
    for (const sp of w.species) {
      if (sp.def.metabolism === 'viral') continue; // a phage dose is field units (the material brush rule)
      const cls = freeClassOfSpecies(sp.def);
      const life: LifeBrush = {
        habitatMask: habitatMaskOf(sp.def.habitats),
        attached: sp.attached,
        ...(sp.def.attachment ? { surfaces: [...sp.def.attachment.surfaces] } : {}),
        shelterBlocked: cls === 'medium' || cls === 'large',
      };
      for (const cell of maskCells()) {
        const extras = { mesh: kinds[cell] === KIND_MESH, shelter: kinds[cell] === KIND_SHELTER };
        const preview = lifeCellOutcome(w.grid.structure[cell]!, w.grid.substrate[cell]!, life, isStoneEdge(w.grid, cell), extras) === 'ok';
        expect(preview, `${sp.id} ${cell}`).toBe(canOccupy(w, sp, cell));
        if (extras.shelter && !preview && lifeCellOutcome(w.grid.structure[cell]!, w.grid.substrate[cell]!, life, isStoneEdge(w.grid, cell)) === 'ok') shelterRefusals++;
        if (extras.mesh && preview && lifeCellOutcome(w.grid.structure[cell]!, w.grid.substrate[cell]!, life, isStoneEdge(w.grid, cell)) !== 'ok') meshAdmits++;
        checked++;
      }
    }
    expect(w.species.length).toBe(species.length);
    expect(checked).toBeGreaterThan(30 * maskCells().length);
    expect(shelterRefusals).toBeGreaterThan(0); // the shelter extra matters
    expect(meshAdmits).toBeGreaterThan(0); // the mesh extra matters
    expect(CELL_COUNT).toBe(16384);
  });
});
