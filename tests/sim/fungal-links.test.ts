/**
 * Fungal links at branching, on death and on capture (SPEC §6.8, §6.9, §7.2, §7.7, §9.19; D-0043,
 * D-0047; P3.6; src/sim/fungi.ts joinBranch, src/sim/births.ts, src/sim/links.ts removeAllLinks).
 *
 *  - A fungal division joins parent and daughter on a four-neighbour cell: LINK_TRANSPORT for F02,
 *    LINK_VISUAL for F01, with one 'linkFormed' event.
 *  - A parent that already has 4 links places its daughter unlinked; the 'birth' event says so
 *    ({link: 'degree'}); lineage records are unchanged.
 *  - Death and capture remove every incident link from both ends, one 'linkBroken' event per link.
 *  - Over a growing network, linksValid holds after every tick and the links formed and broken each
 *    tick equal the 'linkFormed' and 'linkBroken' events of that tick.
 *  - buildSaveFile → loadSaveFile succeeds with live transport links and the new history field.
 *
 * Dishes: clear water with every in-dish cell turned to gel; F01/F02 state set directly and logged as
 * inputs (tests/helpers/world.ts place). Links made with linkFungal are labelled test state.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { stageContacts } from '../../src/sim/contacts';
import type { SimEvent } from '../../src/sim/events';
import { cellIndex, maskCells, SUBSTRATE_CODES } from '../../src/sim/grid';
import { historyProblem } from '../../src/sim/history';
import { checkLedger } from '../../src/sim/ledger';
import { field } from '../../src/sim/lineage';
import {
  fungalDegree,
  fungalLinkKind,
  fungalNeighbors,
  FUNGAL_SLOT_COLUMNS,
  FUNGAL_BIRTH_COLUMNS,
  LINK_TRANSPORT,
  LINK_VISUAL,
  linksValid,
} from '../../src/sim/links';
import { killEntity } from '../../src/sim/maintenance';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { entityCell, rebuildIndex } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import { updateDerived } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { aliveOf, clearWater, fillField, linkFungal, place, rebaseLedger } from '../helpers/world';

function gelDish(): World {
  const w = clearWater();
  for (const k of maskCells()) w.grid.substrate[k] = SUBSTRATE_CODES.gel;
  w.grid.geometryVersion++;
  updateDerived(w);
  return w;
}

/** A segment ready to divide (B ≥ 2 B0', E ≥ 60, age past its minimum) at the centre of (x, y). */
function ready(w: World, sp: 'F01' | 'F02', x: number, y: number): number {
  return place(w, sp, x + 0.5, y + 0.5, { B: 4.2, E: 80, age: 100 });
}

/** A segment that will not divide. */
function segment(w: World, sp: 'F01' | 'F02', x: number, y: number): number {
  return place(w, sp, x + 0.5, y + 0.5);
}

function eventsSince(w: World, firstId: number, type?: SimEvent['type']): SimEvent[] {
  return w.events.ring.filter((e) => e.id >= firstId && (type === undefined || e.type === type));
}

/** The slot of the one living organism of `sp` in `cell` other than `except`. */
function slotIn(w: World, sp: string, cell: number, except = -1): number {
  const c = w.ents.cols;
  return aliveOf(w, sp).find((s) => s !== except && entityCell(c.x[s]!, c.y[s]!) === cell) ?? -1;
}

describe('links form at branching (SPEC §7.2, §7.7)', () => {
  for (const [sp, kind, label] of [
    ['F02', LINK_TRANSPORT, 'transport'],
    ['F01', LINK_VISUAL, 'visual'],
  ] as const) {
    it(`${sp}: parent and daughter on a four-neighbour cell, joined by one ${label} link and one event`, () => {
      const w = gelDish();
      const p = ready(w, sp, 60, 64);
      const parentBirth = w.ents.cols.birthId[p]!;
      const first = w.counters.nextEventId;
      step(w);
      const d = slotIn(w, sp, cellIndex(61, 64)); // E first: every side cell is equal here
      expect(d).toBeGreaterThanOrEqual(0);
      expect(fungalLinkKind(w, p, d)).toBe(kind);
      expect(fungalNeighbors(w, p)).toEqual([d]);
      const formed = eventsSince(w, first, 'linkFormed');
      expect(formed).toHaveLength(1);
      expect(formed[0]!.detail).toMatchObject({ kind: 'fungal', link: label, partner: w.ents.cols.birthId[d]! });
      expect(formed[0]!.birthId).toBe(w.ents.cols.birthId[p]);
      const birth = eventsSince(w, first, 'birth')[0]!;
      expect(birth.detail?.link).toBeUndefined();
      expect(field(w.lineage, 'parent', w.ents.cols.birthId[d]!)).toBe(parentBirth);
      expect(linksValid(w)).toBe(true);
    });
  }

  it('a parent with 4 links places its daughter unlinked; the birth event says so; lineage is unchanged', () => {
    const w = gelDish();
    const p = ready(w, 'F02', 60, 64);
    // Labelled test state: four links to segments elsewhere (no rule makes this before E14 settlement).
    for (const [x, y] of [
      [80, 80],
      [82, 80],
      [84, 80],
      [86, 80],
    ] as const)
      linkFungal(w, p, segment(w, 'F02', x, y));
    const parentBirth = w.ents.cols.birthId[p]!;
    const first = w.counters.nextEventId;
    step(w);
    const d = slotIn(w, 'F02', cellIndex(61, 64));
    expect(d).toBeGreaterThanOrEqual(0);
    expect(fungalDegree(w, p)).toBe(4); // its four links were rekeyed and kept
    expect(fungalDegree(w, d)).toBe(0);
    expect(eventsSince(w, first, 'linkFormed')).toHaveLength(0);
    const birth = eventsSince(w, first, 'birth');
    expect(birth).toHaveLength(1);
    expect(birth[0]!.detail).toMatchObject({ parent: parentBirth, link: 'degree' });
    expect(field(w.lineage, 'parent', w.ents.cols.birthId[d]!)).toBe(parentBirth);
    expect(field(w.lineage, 'parent', w.ents.cols.birthId[p]!)).toBe(parentBirth);
    expect(linksValid(w)).toBe(true);
  });
});

describe('links end with the organism (SPEC §6.8)', () => {
  it('death removes every incident link from both ends, one linkBroken event per link', () => {
    const w = gelDish();
    const hub = segment(w, 'F02', 60, 64);
    const arms = [segment(w, 'F02', 61, 64), segment(w, 'F02', 60, 65), segment(w, 'F02', 59, 64)];
    for (const a of arms) linkFungal(w, hub, a);
    const visual = segment(w, 'F01', 60, 63);
    linkFungal(w, hub, visual, LINK_VISUAL);
    const hubBirth = w.ents.cols.birthId[hub]!;
    const first = w.counters.nextEventId;
    killEntity(w, hub, R.DEATH_STARVATION);
    for (const a of [...arms, visual]) expect(fungalDegree(w, a)).toBe(0);
    const broken = eventsSince(w, first, 'linkBroken');
    expect(broken).toHaveLength(4);
    expect(broken.every((e) => e.birthId === hubBirth && e.detail?.kind === 'fungal')).toBe(true);
    expect(broken.map((e) => e.detail?.link).sort()).toEqual(['transport', 'transport', 'transport', 'visual']);
    expect(linksValid(w)).toBe(true);
  });

  it('capture removes the prey’s links (labelled test state: a fungal link on a Sprinter prey)', () => {
    const w = clearWater();
    const pred = place(w, 'P01', 64.5, 64.5, { E: 50 });
    const prey = place(w, 'B01', 64.8, 64.5);
    const other = place(w, 'B01', 70.5, 70.5);
    linkFungal(w, prey, other);
    rebuildIndex(w);
    const first = w.counters.nextEventId;
    stageContacts(w);
    expect(w.ents.isAlive(prey)).toBe(false);
    expect(w.ents.cols.mealC[pred]!).toBeGreaterThan(0);
    expect(fungalDegree(w, other)).toBe(0);
    expect(eventsSince(w, first, 'linkBroken')).toHaveLength(1);
    expect(linksValid(w)).toBe(true);
    expect(checkLedger(w).ok).toBe(true);
  });
});

/** Fungal links as unordered pairs of entityIds (stable across a division's rekey) with their kind. */
function linkSet(w: World): Set<string> {
  const c = w.ents.cols;
  const out = new Set<string>();
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    for (let k = 0; k < 4; k++) {
      const p = c[FUNGAL_SLOT_COLUMNS[k]!][i]!;
      if (p < 0 || !w.ents.refValid(p, c[FUNGAL_BIRTH_COLUMNS[k]!][i]!)) continue;
      const [a, b] = [c.entityId[i]!, c.entityId[p]!].sort((x, y) => x - y);
      out.add(`${a}-${b}:${fungalLinkKind(w, i, p)}`);
    }
  }
  return out;
}

describe('a growing network', () => {
  it('linksValid after every tick; links formed and broken each tick equal that tick’s events', () => {
    const w = gelDish();
    fillField(w, 'sugar', 0.3);
    fillField(w, 'nutrient', 0.2);
    for (const [x, y] of [
      [40, 64],
      [44, 64],
      [48, 64],
    ] as const)
      ready(w, 'F02', x, y);
    ready(w, 'F01', 80, 64);
    ready(w, 'F01', 84, 64);
    rebaseLedger(w);
    let prev = linkSet(w);
    let formedTotal = 0;
    let brokenTotal = 0;
    let fungalBirths = 0;
    for (let t = 0; t < 1500; t++) {
      const first = w.counters.nextEventId;
      step(w);
      expect(linksValid(w)).toBe(true);
      const now = linkSet(w);
      const added = [...now].filter((k) => !prev.has(k)).length;
      const removed = [...prev].filter((k) => !now.has(k)).length;
      const ev = eventsSince(w, first);
      expect(ev.filter((e) => e.type === 'linkFormed').length).toBe(added);
      expect(ev.filter((e) => e.type === 'linkBroken').length).toBe(removed);
      formedTotal += added;
      brokenTotal += removed;
      fungalBirths += ev.filter((e) => e.type === 'birth').length;
      prev = now;
    }
    // Not vacuous: the network branched several times (every daughter here had a free side cell).
    expect(fungalBirths).toBeGreaterThanOrEqual(5);
    expect(formedTotal).toBe(fungalBirths);
    expect(brokenTotal).toBeGreaterThanOrEqual(0);
    expect(checkLedger(w).ok).toBe(true);
  });
});

describe('saves keep transport links and the transfer history', () => {
  it('buildSaveFile → loadSaveFile with live transport links and fungalTransfer samples, mid-second', async () => {
    const w = gelDish();
    const s = [segment(w, 'F02', 60, 64), segment(w, 'F02', 61, 64), segment(w, 'F02', 62, 64)];
    w.ents.cols.B[s[0]!] = 4;
    w.ledger.inputs.c += 2;
    linkFungal(w, s[0]!, s[1]!);
    linkFungal(w, s[1]!, s[2]!);
    rebaseLedger(w);
    run(w, 25); // mid-second: this second's accumulator is pending
    expect(w.history.seconds.at(-1)!.fungalTransfer).toBeGreaterThan(0);
    expect(w.history.pendingFungalTransfer).toBeGreaterThan(0);
    const { text } = await buildSaveFile(w, { name: 'links', savedAt: '2026-10-01T00:00:00Z', recipeId: null });
    const loaded = (await loadSaveFile(text)).world;
    expect(stateHash(loaded)).toBe(stateHash(w));
    expect(linksValid(loaded)).toBe(true);
    expect(fungalLinkKind(loaded, s[0]!, s[1]!)).toBe(LINK_TRANSPORT);
    expect(loaded.history.seconds.map((x) => x.fungalTransfer)).toEqual(w.history.seconds.map((x) => x.fungalTransfer));
    expect(loaded.history.pendingFungalTransfer).toBe(w.history.pendingFungalTransfer);
    run(w, 25);
    run(loaded, 25);
    expect(stateHash(loaded)).toBe(stateHash(w));
    expect(loaded.history.seconds.map((x) => x.fungalTransfer)).toEqual(w.history.seconds.map((x) => x.fungalTransfer));
  });

  it('a malformed fungalTransfer in a saved sample is refused with a message', () => {
    const w = gelDish();
    segment(w, 'F02', 60, 64);
    run(w, 10);
    expect(w.history.seconds[0]!.fungalTransfer).toBe(0); // a dish whose species form transport links
    const h = JSON.parse(JSON.stringify(w.history)) as { seconds: { fungalTransfer?: unknown }[] };
    expect(historyProblem(h, w.species.length)).toBeNull();
    h.seconds[0]!.fungalTransfer = -1;
    expect(historyProblem(h, w.species.length)).toMatch(/fungalTransfer/);
  });
});
