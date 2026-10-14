/**
 * Phase 5 wave 10 structure-commands: a barrier placed across a link cuts it (D-0106 "links never cross
 * an edge that blocks either party's class"; D-0113; D-0117: sever with a logged reason, never refuse;
 * src/sim/structureEdits.ts severCrossedLinks).
 * - An F02 transport link between 4-adjacent segments is cut by an S01 between them: one 'linkBroken'
 *   event (cause 'barrier'), result.severed 1, and the F02 transport pass no longer uses it.
 * - Two Small E12-linked B01 keep their link across an S02 (Small passes) and lose it across an S01.
 * - Closing a shutter cuts; opening it again does not restore the link.
 * - A diagonal link is cut exactly when the corner rule (pairPermitted) refuses it; a link within one cell
 *   is never cut.
 * - A released sample block whose link would straddle a refusing edge at the destination is cut too.
 * - links.ts linkProblem holds after every cut, and every state round-trips through the save import.
 * Worlds: clear water under barrierRegistry(); barriers placed by the commands; links made with the test
 * helpers linkFungal / linkAdhesion (labelled test setup).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { applyNow, type CommandPayload, type CommandResult } from '../../src/sim/commands';
import { classOf } from '../../src/sim/barriers';
import { pairPermitted } from '../../src/sim/edgePassage';
import { fungalTransport } from '../../src/sim/fungalTransport';
import { cellIndex } from '../../src/sim/grid';
import { adhesionNeighbors, fungalNeighbors, linkProblem, linksValid, LINK_TRANSPORT } from '../../src/sim/links';
import { entityCell } from '../../src/sim/spatial';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import type { World } from '../../src/sim/world';
import { barrierRegistry, clearWater, linkAdhesion, linkFungal, place, placeWith } from '../helpers/world';

const REG = barrierRegistry();
const meta = { name: 'structure links', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
let seq = 0;
const cmd = (w: World, p: CommandPayload): CommandResult => applyNow(w, `sl${seq++}`, p).result!;
const c = cellIndex;

async function roundTrip(w: World): Promise<World> {
  const { text } = await buildSaveFile(w, meta);
  const { world } = await loadSaveFile(text);
  expect(stateHash(world)).toBe(stateHash(w));
  return world;
}

function breaks(w: World): { birthId?: number; detail?: Readonly<Record<string, number | string>> }[] {
  return w.events.ring.filter((e) => e.type === 'linkBroken');
}

/** Two E12 carriers linked, at (x0, y0) and (x1, y1). */
function linkedPair(w: World, x0: number, y0: number, x1: number, y1: number): [number, number] {
  const a = placeWith(w, 'B01', x0, y0, ['E12'], { E: 60 });
  const b = placeWith(w, 'B01', x1, y1, ['E12'], { E: 60 });
  linkAdhesion(w, a, b);
  return [a, b];
}

describe('severing on placement', () => {
  it('an S01 between two linked F02 segments cuts their transport link with one logged event', async () => {
    const w = clearWater({}, REG);
    cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points: [[60.5, 64.5]], radius: 3 });
    const a = place(w, 'F02', 60.5, 64.5, { B: 2.8 }); // b0 2: a donor above 1 × b0
    const b = place(w, 'F02', 61.5, 64.5, { B: 1.6 }); // a receiver below 1.5 × b0
    linkFungal(w, a, b, LINK_TRANSPORT);
    // Before: the transport pass moves carbon along the link (on a copy).
    expect(fungalTransport(deserializeWorld(serializeWorld(w))).length).toBeGreaterThan(0);
    const res = cmd(w, { kind: 'placeEdges', structure: 'S01', edges: [[c(60, 64), 'R']] });
    expect(res).toMatchObject({ accepted: 1, severed: 1 });
    expect(fungalNeighbors(w, a)).toEqual([]);
    expect(fungalNeighbors(w, b)).toEqual([]);
    const ev = breaks(w);
    expect(ev.length).toBe(1);
    expect(ev[0]!.birthId).toBe(w.ents.cols.birthId[a]);
    expect(ev[0]!.detail).toEqual({ kind: 'fungal', link: 'transport', partner: w.ents.cols.birthId[b]!, cause: 'barrier' });
    expect(fungalTransport(deserializeWorld(serializeWorld(w)))).toEqual([]);
    expect(linkProblem(w.ents.cols, w.ents.highWater)).toBeNull();
    await roundTrip(w);
  });

  it('an S02 keeps the link of two Small E12 carriers; an S01 cuts it (with the E12 relink lockout)', async () => {
    const w = clearWater({}, REG);
    const [a, b] = linkedPair(w, 63.8, 64.5, 64.2, 64.5);
    expect(cmd(w, { kind: 'placeEdges', structure: 'S02', edges: [[c(63, 64), 'R']] })).toMatchObject({ accepted: 1 });
    expect(cmd(w, { kind: 'placeEdges', structure: 'S02', edges: [[c(63, 65), 'R']] })).not.toHaveProperty('severed');
    expect(adhesionNeighbors(w, a)).toEqual([b]);
    await roundTrip(w);
    expect(cmd(w, { kind: 'removeStructures', ids: [w.edges.find((e) => e.cell === c(63, 64))!.id] }).accepted).toBe(1);
    const res = cmd(w, { kind: 'placeEdges', structure: 'S01', edges: [[c(63, 64), 'R']] });
    expect(res.severed).toBe(1);
    expect(adhesionNeighbors(w, a)).toEqual([]);
    expect(w.ents.cols.adhLockout[a]).toBe(10);
    expect(w.ents.cols.adhLockout[b]).toBe(10);
    expect(breaks(w).map((e) => e.detail)).toEqual([{ kind: 'adhesion', partner: w.ents.cols.birthId[b]!, cause: 'barrier' }]);
    expect(linksValid(w)).toBe(true);
    await roundTrip(w);
  });

  it('closing a shutter cuts the link; opening it again does not restore it', async () => {
    const w = clearWater({}, REG);
    const [a] = linkedPair(w, 63.8, 64.5, 64.2, 64.5);
    const [shutter] = cmd(w, { kind: 'placeEdges', structure: 'S03', edges: [[c(63, 64), 'R']], open: true }).ids!;
    expect(adhesionNeighbors(w, a).length).toBe(1);
    expect(cmd(w, { kind: 'setDevice', id: shutter!, open: false })).toEqual({ accepted: 1, rejected: 0, severed: 1 });
    expect(adhesionNeighbors(w, a)).toEqual([]);
    await roundTrip(w);
    expect(cmd(w, { kind: 'setDevice', id: shutter!, open: true })).toEqual({ accepted: 1, rejected: 0 });
    expect(adhesionNeighbors(w, a)).toEqual([]);
    expect(linksValid(w)).toBe(true);
    await roundTrip(w);
  });

  it('a closed shutter placed across a link cuts it; an open one does not', () => {
    const w = clearWater({}, REG);
    const [a] = linkedPair(w, 63.8, 64.5, 64.2, 64.5);
    const [p] = linkedPair(w, 63.8, 70.5, 64.2, 70.5);
    expect(cmd(w, { kind: 'placeEdges', structure: 'S03', edges: [[c(63, 64), 'R']], open: true })).not.toHaveProperty('severed');
    expect(cmd(w, { kind: 'placeEdges', structure: 'S03', edges: [[c(63, 70), 'R']], open: false }).severed).toBe(1);
    expect(adhesionNeighbors(w, a).length).toBe(1);
    expect(adhesionNeighbors(w, p)).toEqual([]);
  });

  it('a diagonal link is cut exactly when the corner rule refuses it; a link within one cell never is', async () => {
    const w = clearWater({}, REG);
    const [a, b] = linkedPair(w, 63.9, 64.9, 64.1, 65.1); // cells (63, 64) and (64, 65)
    const [s, t] = linkedPair(w, 70.3, 64.5, 70.7, 64.5); // both in cell (70, 64)
    // Off both L-paths, and every edge around cell (70, 64): nothing is cut.
    const r1 = cmd(w, { kind: 'placeEdges', structure: 'S01', edges: [[c(63, 66), 'R'], [c(69, 64), 'R'], [c(70, 64), 'R'], [c(70, 63), 'D'], [c(70, 64), 'D']] });
    expect(r1.accepted).toBe(5);
    expect(r1).not.toHaveProperty('severed');
    const cells = () => [entityCell(w.ents.cols.x[a]!, w.ents.cols.y[a]!), entityCell(w.ents.cols.x[b]!, w.ents.cols.y[b]!)] as const;
    expect(pairPermitted(w, ...cells(), classOf(w, a), classOf(w, b))).toBe(true);
    expect(adhesionNeighbors(w, a)).toEqual([b]);
    expect(adhesionNeighbors(w, s)).toEqual([t]);
    // On one L-path ((63, 64) → (64, 64) → (64, 65)): the corner rule refuses, so the link is cut.
    const r2 = cmd(w, { kind: 'placeEdges', structure: 'S01', edges: [[c(64, 64), 'D']] });
    expect(pairPermitted(w, ...cells(), classOf(w, a), classOf(w, b))).toBe(false);
    expect(r2.severed).toBe(1);
    expect(adhesionNeighbors(w, a)).toEqual([]);
    expect(adhesionNeighbors(w, s)).toEqual([t]);
    expect(linksValid(w)).toBe(true);
    await roundTrip(w);
  });
});

describe('severing on a sample release', () => {
  it('a released linked pair landing across an S01 has its link cut (and the transfer is not refused)', async () => {
    const w = clearWater({}, REG);
    linkedPair(w, 40.8, 64.5, 41.2, 64.5); // cells (40, 64) and (41, 64)
    expect(cmd(w, { kind: 'placeEdges', structure: 'S01', edges: [[c(63, 64), 'R']] }).accepted).toBe(1);
    expect(cmd(w, { kind: 'sampleTake', x: 40.5, y: 64.5, radius: 1, mode: 'life' }).accepted).toBeGreaterThan(0);
    const res = cmd(w, { kind: 'sampleTransfer', dx: 23, dy: 0 }); // to cells (63, 64) and (64, 64)
    expect(res.accepted).toBeGreaterThan(0);
    expect(res.severed).toBe(1);
    expect(breaks(w).at(-1)!.detail).toMatchObject({ kind: 'adhesion', cause: 'barrier' });
    expect(linksValid(w)).toBe(true);
    await roundTrip(w);
  });

  it('a released pair landing clear of every edge keeps its link and the result has no severed key', () => {
    const w = clearWater({}, REG);
    const [a] = linkedPair(w, 40.8, 64.5, 41.2, 64.5);
    cmd(w, { kind: 'placeEdges', structure: 'S01', edges: [[c(63, 64), 'R']] });
    cmd(w, { kind: 'sampleTake', x: 40.5, y: 64.5, radius: 1, mode: 'life' });
    const res = cmd(w, { kind: 'sampleTransfer', dx: 10, dy: 0 });
    expect(res.accepted).toBeGreaterThan(0);
    expect(res).not.toHaveProperty('severed');
    expect(a).toBeGreaterThanOrEqual(0);
    const alive = [];
    for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1) alive.push(i);
    expect(alive.every((i) => adhesionNeighbors(w, i).length === 1)).toBe(true);
  });
});
