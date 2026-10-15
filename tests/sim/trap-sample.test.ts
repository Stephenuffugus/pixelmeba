/**
 * Phase 5 wave 13, e3-traps: a trap and its held target are one ownership unit for Sample (SPEC §10.5 "trap + held
 * prey"; D-0124 supersedes D-0106's "released at commit"): Take keeps both rows with every column, Cancel restores
 * them exactly, Transfer remaps both references (birthIds unchanged) and the hold continues where it lands, Discard
 * exports the reserve with the rows and releases nothing; a footprint that holds only one end is refused naming
 * the missing member, and the import refuses a held pair that is not mutual.
 *
 * TRAP is not yet in IMPLEMENTED_NATIVE_ABILITIES (the lead appends it at the wave 13 integration), so the import
 * would refuse these dishes: this file mocks the list with exactly TRAP appended (wave 13, e3-traps); the registry
 * uses allowUnimplemented for the same reason.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/sim/content/implemented', async (importOriginal) => {
  const orig = await importOriginal<{ readonly IMPLEMENTED_NATIVE_ABILITIES: readonly string[] }>();
  // Wave 13 (e3-traps): the ability this task implements.
  return { ...orig, IMPLEMENTED_NATIVE_ABILITIES: [...new Set([...orig.IMPLEMENTED_NATIVE_ABILITIES, 'TRAP'])].sort() };
});

import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import { ENTITY_COLUMNS } from '../../src/sim/entities';
import { cellIndex, SUB_SEDIMENT } from '../../src/sim/grid';
import { killEntity } from '../../src/sim/maintenance';
import { R } from '../../src/sim/reasons';
import { cancelSample } from '../../src/sim/sample';
import { sampleTotals } from '../../src/sim/sampleSlot';
import { stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { clearWater, fillField, place, rebaseLedger, registry } from '../helpers/world';

const shipped = registry().manifest;
const REG_T = registryWith({ enabledSpecies: [...shipped.enabledSpecies, 'F03'].sort() }, { allowUnimplemented: true });
const meta = { name: 'trap sample', savedAt: '2026-10-15T00:00:00Z', recipeId: null };

let seq = 0;
const cmd = (w: World, p: CommandPayload) => applyNow(w, `ts-${++seq}`, p).result!;

/** A B01 in slot 0 (far away), the F03 in slot 1 and the P04 in slot 2; the trap holds the P04 from tick 1. */
function holdingPair() {
  const w = clearWater({}, REG_T);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) if ((x + 0.5 - 64) ** 2 + (y + 0.5 - 64) ** 2 <= 225) w.grid.substrate[cellIndex(x, y)] = SUB_SEDIMENT;
  w.grid.geometryVersion++;
  fillField(w, 'broth', 0);
  const spare = place(w, 'B01', 30.5, 30.5);
  const f = place(w, 'F03', 64.5, 64.5, { B: 2.8, N: 0.28, E: 80 });
  const p = place(w, 'P04', 64.6, 64.5, { E: 100 });
  rebaseLedger(w);
  step(w);
  step(w);
  const c = w.ents.cols;
  expect(c.trapSlot[f]).toBe(p);
  expect(c.heldBySlot[p]).toBe(f);
  return { w, f, p, spare, c };
}

const rowOf = (w: World, slot: number) => w.sample!.rows.find((r) => r.slot === slot)!;

describe('Sample and a held trap pair (SPEC §10.5; D-0124)', () => {
  it('Take keeps both rows with every column; a save with the sample held loads; Cancel restores the exact pre-take hash', async () => {
    const { w, f, p, c } = holdingPair();
    for (let k = 0; k < 8; k++) step(w);
    const before = stateHash(w);
    const cols = (slot: number) => Object.fromEntries(ENTITY_COLUMNS.map(([n]) => [n, (c[n] as ArrayLike<number>)[slot]!]));
    const fCols = cols(f);
    const pCols = cols(p);
    expect(cmd(w, { kind: 'sampleTake', x: 64.5, y: 64.5, radius: 1, mode: 'life' }).accepted).toBe(2);
    expect(w.sample!.rows.map((r) => r.slot).sort()).toEqual([f, p].sort());
    expect(rowOf(w, f).cols).toEqual(fCols);
    expect(rowOf(w, p).cols).toEqual(pCols);
    expect(rowOf(w, f).cols.trapSlot).toBe(p);
    expect(rowOf(w, f).cols.trapReserveC).toBe(0.2);
    expect(rowOf(w, f).cols.trapTimer).toBeGreaterThan(0);
    expect(rowOf(w, p).cols.heldBySlot).toBe(f);
    // The reserve is counted in the held sample (the ledger closes across the take).
    const t = sampleTotals(w.sample);
    expect(t.c).toBe(fCols.B! + fCols.mealC! + fCols.trapReserveC! + (pCols.B! + pCols.mealC! + pCols.trapReserveC!));
    const { text } = await buildSaveFile(w, meta);
    const { world: back } = await loadSaveFile(text);
    expect(stateHash(back)).toBe(stateHash(w));
    cancelSample(back);
    expect(stateHash(back)).toBe(before);
    cancelSample(w);
    expect(stateHash(w)).toBe(before);
  });

  for (const [dx, dy] of [
    [5, 0],
    [0, -7],
  ] as const) {
    it(`Take → Transfer by (${dx}, ${dy}): both references remapped, birthIds unchanged, the hold continues and releases on time`, () => {
      const { w, f, p, spare, c } = holdingPair();
      for (let k = 0; k < 8; k++) step(w); // tick 10: held 9 ticks
      const fBirth = c.birthId[f]!;
      const pBirth = c.birthId[p]!;
      const timer = c.trapTimer[f]!;
      killEntity(w, spare, R.DEATH_AGE); // slot 0 free: the transfer gives the pair new slots
      rebaseLedger(w);
      expect(cmd(w, { kind: 'sampleTake', x: 64.5, y: 64.5, radius: 1, mode: 'life' }).accepted).toBe(2);
      expect(cmd(w, { kind: 'sampleTransfer', dx, dy }).accepted).toBe(2);
      const nf = [...Array(w.ents.highWater).keys()].find((i) => c.alive[i] === 1 && c.birthId[i] === fBirth)!;
      const np = [...Array(w.ents.highWater).keys()].find((i) => c.alive[i] === 1 && c.birthId[i] === pBirth)!;
      expect(nf).not.toBe(f);
      expect(np).not.toBe(p);
      expect(c.trapSlot[nf]).toBe(np);
      expect(c.trapBirthId[nf]).toBe(pBirth);
      expect(c.heldBySlot[np]).toBe(nf);
      expect(c.heldByBirthId[np]).toBe(fBirth);
      expect(c.trapTimer[nf]).toBe(timer);
      expect(c.trapReserveC[nf]).toBe(0.2);
      expect(Math.floor(c.x[nf]!)).toBe(64 + dx);
      expect(Math.floor(c.y[np]!)).toBe(64 + dy);
      rebuildIndex(w);
      const x = c.x[np]!;
      while (w.tick < 80) {
        step(w);
        expect(c.heldBySlot[np]).toBe(nf);
        expect(c.x[np]).toBe(x);
      }
      step(w); // tick 80: released in stage 8
      expect(c.heldBySlot[np]).toBe(-1);
      const rel = w.events.ring.filter((e) => e.type === 'trapRelease');
      expect(rel).toHaveLength(1);
      expect(rel[0]).toMatchObject({ tick: 80, birthId: fBirth, detail: { target: pBirth, why: 'timer', seconds: 8 } });
    });
  }

  it('a transfer that rounds the held organism across a cell edge is accepted: a trap pair is not a link (D-0118)', () => {
    const { w, f, p, c } = holdingPair();
    // By hand: both in cell (63, 64); the largest double below 64 plus 8 rounds to exactly 72.
    const edge = 64 - 2 ** -47;
    expect(Math.floor(edge)).toBe(63);
    expect(edge + 8).toBe(72);
    c.x[f] = 63.5;
    c.x[p] = edge;
    rebuildIndex(w);
    const fBirth = c.birthId[f]!;
    const pBirth = c.birthId[p]!;
    expect(cmd(w, { kind: 'sampleTake', x: 63.5, y: 64.5, radius: 1, mode: 'life' }).accepted).toBe(2);
    expect(cmd(w, { kind: 'sampleTransfer', dx: 8, dy: 0 }).accepted).toBe(2);
    const nf = [...Array(w.ents.highWater).keys()].find((i) => c.alive[i] === 1 && c.birthId[i] === fBirth)!;
    const np = [...Array(w.ents.highWater).keys()].find((i) => c.alive[i] === 1 && c.birthId[i] === pBirth)!;
    expect(Math.floor(c.x[nf]!)).toBe(71);
    expect(Math.floor(c.x[np]!)).toBe(72);
    expect(c.trapSlot[nf]).toBe(np);
    expect(c.heldBySlot[np]).toBe(nf);
  });

  it('Take → Discard exports exactly the rows’ C and N with the reserve and records two REMOVED_SAMPLED deaths, no release', () => {
    const { w, f, p, c } = holdingPair();
    const C = c.B[f]! + c.mealC[f]! + c.trapReserveC[f]! + (c.B[p]! + c.mealC[p]! + c.trapReserveC[p]!);
    const N = c.N[f]! + c.mealN[f]! + c.trapReserveN[f]! + (c.N[p]! + c.mealN[p]! + c.trapReserveN[p]!);
    const births = [c.birthId[f]!, c.birthId[p]!];
    const ex0 = { ...w.ledger.exports };
    expect(cmd(w, { kind: 'sampleTake', x: 64.5, y: 64.5, radius: 1, mode: 'life' }).accepted).toBe(2);
    expect(cmd(w, { kind: 'sampleDiscard' }).accepted).toBe(2);
    expect(Object.is(w.ledger.exports.c, ex0.c + C)).toBe(true);
    expect(Object.is(w.ledger.exports.n, ex0.n + N)).toBe(true);
    const deaths = w.events.ring.filter((e) => e.type === 'death' && e.cause === R.REMOVED_SAMPLED).map((e) => e.birthId);
    expect(deaths.sort()).toEqual(births.sort());
    expect(w.events.ring.filter((e) => e.type === 'trapRelease')).toHaveLength(0);
  });

  it('a footprint holding only one end (positions set by hand across cells) is refused naming the missing member', () => {
    const { w, p, c } = holdingPair();
    c.x[p] = 67.5; // by hand: the pair straddles three cells (not reachable in play)
    rebuildIndex(w);
    const r = cmd(w, { kind: 'sampleTake', x: 64.5, y: 64.5, radius: 1, mode: 'life' });
    expect(r.accepted).toBe(0);
    expect(r.note).toContain(`P04 #${c.birthId[p]} at (67, 64)`);
    expect(w.sample).toBeNull();
    const r2 = cmd(w, { kind: 'sampleTake', x: 67.5, y: 64.5, radius: 1, mode: 'life' });
    expect(r2.accepted).toBe(0);
    expect(r2.note).toContain('F03 #');
  });

  it('the import refuses a held sample whose trap pair is not mutual', async () => {
    const { w, p } = holdingPair();
    expect(cmd(w, { kind: 'sampleTake', x: 64.5, y: 64.5, radius: 1, mode: 'life' }).accepted).toBe(2);
    const { text: good } = await buildSaveFile(w, meta);
    await expect(loadSaveFile(good)).resolves.toBeDefined();
    const row = rowOf(w, p).cols as Record<string, number>;
    row.heldBySlot = -1;
    row.heldByBirthId = 0;
    const { text } = await buildSaveFile(w, meta);
    await expect(loadSaveFile(text)).rejects.toThrow(/a held trap and its target do not refer to each other/);
  });
});
