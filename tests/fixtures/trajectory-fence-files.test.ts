/**
 * The fence's test-only recipe files (kind 'recipeFile'; D-0121, the systems flip): FENCE_CYCLE_HEATER
 * (FIRST_DISH_V1 under the light cycle with a heater placed and switched on by command at tick 0) and
 * FENCE_BARRIER_LINE (an S01 line with S02 gates, a closed S03 shutter, an S04 channel and an S08 resin,
 * placed by command at tick 0). No shipped recipe uses the cycle, edges or devices, so these entries are
 * what fences them. THE HABITAT ENABLE (D-0130) added three habitat dishes, each its habitat's Suggested
 * Community (drafted in wave 14, D-0128; no shipped recipe uses H04–H11 before wave 15): FENCE_H10_GATE_CYCLE
 * (the Gate Lab's wall and six S01 membranes under the light cycle: edges and climate together),
 * FENCE_H09_DRYING_COMMUNITY (drying, the S11 roof and the S12 wick, F04 and B12 resting rules) and
 * FENCE_H06_DUSK_COMMUNITY (the closed lid, the cycle, the low-oxygen sediment, P04 and A03).
 * tests/fixtures/trajectory-fence-current.test.ts digests each at 1× (one run); this file
 * proves the same digest at the 4× analogue (four steps per chunk, observed between chunks) and across a
 * save → load through the import at the midpoint, and that the structures and the cycle are really there.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { stateHash } from '../../src/sim/serialize';
import { cellIndex, maskCells, ST_WALL, SUB_GEL, SUB_SEDIMENT } from '../../src/sim/grid';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { CONTENT_DIR, loadRegistryFs, REPO_ROOT } from '../../tools/lib/content-fs';
import { fenceStart, readFence, readFenceRecipe, type FenceEntry } from '../helpers/fence';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf } from '../helpers/world';

const shipped = loadRegistryFs();
const files = readFence().entries.filter((e): e is FenceEntry & { kind: 'recipeFile' } => e.kind === 'recipeFile');
const meta = { name: 'fence', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const fileEntry = (id: string) => files.find((e) => e.id === id)!;
const cellOf = (w: World, slot: number): number => cellIndex(Math.floor(w.ents.cols.x[slot]!), Math.floor(w.ents.cols.y[slot]!));
const xOf = (w: World, slot: number): number => Math.floor(w.ents.cols.x[slot]!);

describe('trajectory fence: test-only recipe files (D-0121)', () => {
  it('the two flip entries and the three habitat entries exist, each file is under tests/fixtures/fence-recipes, its id is the entry id and no content recipe has it', () => {
    expect(files.map((e) => e.id)).toEqual(['FENCE_CYCLE_HEATER', 'FENCE_BARRIER_LINE', 'FENCE_H10_GATE_CYCLE', 'FENCE_H09_DRYING_COMMUNITY', 'FENCE_H06_DUSK_COMMUNITY']);
    const onDisk = readdirSync(join(REPO_ROOT, 'tests', 'fixtures', 'fence-recipes')).sort();
    expect(onDisk).toEqual([
      'FENCE_BARRIER_LINE.json',
      'FENCE_CYCLE_HEATER.json',
      'FENCE_H06_DUSK_COMMUNITY.json',
      'FENCE_H09_DRYING_COMMUNITY.json',
      'FENCE_H10_GATE_CYCLE.json',
    ]);
    const content = readdirSync(join(CONTENT_DIR, 'recipes')).map((f) => f.replace('.json', ''));
    for (const e of files) {
      expect(e.file).toBe(`tests/fixtures/fence-recipes/${e.id}.json`);
      expect(readFenceRecipe(e.file, shipped).id).toBe(e.id);
      expect(content).not.toContain(e.id);
      expect(e.g2Digest).toBeNull();
    }
    // The habitat entries (drafted in wave 14): one revision, the fence seed, standard mutation, identical founders,
    // no founders of their own, the habitat's Suggested Community, phase 5.
    for (const id of ['FENCE_H10_GATE_CYCLE', 'FENCE_H09_DRYING_COMMUNITY', 'FENCE_H06_DUSK_COMMUNITY']) {
      const def = readFenceRecipe(fileEntry(id).file, shipped);
      expect([def.revision, def.seed, def.mutationPreset, def.founderMode, def.founders.length, def.community, def.phase], id).toEqual([1, 104729, 'standard', 'identical', 0, true, 5]);
    }
  });

  it('the cycle dish runs the light cycle with a heater on; the barrier dish has its line, gates, shutter, channel and resin', () => {
    const cycle = fenceStart(shipped, files[0]!);
    step(cycle);
    expect(cycle.settings.lightMode).toBe('cycle');
    expect(cycle.devices).toEqual([expect.objectContaining({ kind: 'S09', on: true })]);
    const barrier = fenceStart(shipped, files[1]!);
    step(barrier);
    const kinds: Record<string, number> = {};
    for (const e of barrier.edges) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    expect(kinds).toEqual({ S01: 42, S02: 5, S03: 1, S04: 1 });
    expect(barrier.edges.find((e) => e.kind === 'S03')!.open).toBe(false);
    expect(barrier.edges.find((e) => e.kind === 'S04')!.flow).toBe(1);
    expect(barrier.devices).toEqual([expect.objectContaining({ kind: 'S08', resinSelect: ['inhBact'] })]);
  });

  it('the habitat dishes (D-0130) are really there: each habitat, its Suggested Community, structures and settings', () => {
    for (const [id, habitat, life] of [
      ['FENCE_H10_GATE_CYCLE', 'H10_GATE_LAB', 10],
      ['FENCE_H09_DRYING_COMMUNITY', 'H09_DRYING_LACE', 10],
      ['FENCE_H06_DUSK_COMMUNITY', 'H06_DUSK_MARSH', 20],
    ] as const) {
      const w = fenceStart(shipped, fileEntry(id));
      expect(w.content.habitat.id, id).toBe(habitat);
      expect(aliveOf(w).length, id).toBe(life);
      expect(w.ledger.entries.some((e) => e.source === `introduce:community:${habitat}`), id).toBe(true);
    }
    // The Gate Lab: 114 WALL cells in column 64, six S01 membranes, the cycle by override, B06 and its starch left, B01 right.
    const gate = fenceStart(shipped, fileEntry('FENCE_H10_GATE_CYCLE'));
    expect(Array.from(maskCells()).filter((i) => gate.grid.structure[i] === ST_WALL).length).toBe(114);
    expect(gate.edges.map((e) => e.kind)).toEqual(['S01', 'S01', 'S01', 'S01', 'S01', 'S01']);
    expect(gate.devices).toHaveLength(0);
    expect([gate.settings.lid, gate.settings.lightMode, gate.settings.drying]).toEqual(['open', 'cycle', false]);
    expect(aliveOf(gate, 'B06')).toHaveLength(5);
    expect(aliveOf(gate, 'B01')).toHaveLength(5);
    for (const s of aliveOf(gate, 'B06')) expect(xOf(gate, s)).toBeLessThanOrEqual(63);
    for (const s of aliveOf(gate, 'B01')) expect(xOf(gate, s)).toBeGreaterThanOrEqual(65);
    expect(gate.ledger.entries.some((e) => e.source === 'community:H10_GATE_LAB:patch0:Starch')).toBe(true);
    // The Drying Lace: the S11 roof (197 cells) and the S12 wick, drying on; F04 on gel under the roof, B12 on open gel.
    const lace = fenceStart(shipped, fileEntry('FENCE_H09_DRYING_COMMUNITY'));
    expect(lace.devices).toHaveLength(198);
    expect(lace.edges).toHaveLength(0);
    expect(lace.devices.filter((d) => d.kind === 'S11')).toHaveLength(197);
    expect(lace.devices.filter((d) => d.kind === 'S12')).toHaveLength(1);
    expect([lace.settings.lid, lace.settings.lightMode, lace.settings.drying]).toEqual(['open', 'fixed', true]);
    expect(aliveOf(lace, 'F04')).toHaveLength(5);
    expect(aliveOf(lace, 'B12')).toHaveLength(5);
    for (const s of aliveOf(lace, 'F04')) expect(lace.grid.substrate[cellOf(lace, s)]).toBe(SUB_GEL);
    // The Dusk Marsh: the closed lid and the cycle; P04 on the sediment of the marsh floor.
    const marsh = fenceStart(shipped, fileEntry('FENCE_H06_DUSK_COMMUNITY'));
    expect([marsh.settings.lid, marsh.settings.lightMode, marsh.settings.drying]).toEqual(['closed', 'cycle', false]);
    expect(marsh.edges).toHaveLength(0);
    expect(marsh.devices).toHaveLength(0);
    for (const sp of ['A03', 'B03', 'B04', 'P04']) expect(aliveOf(marsh, sp), sp).toHaveLength(5);
    for (const s of aliveOf(marsh, 'P04')) expect(marsh.grid.substrate[cellOf(marsh, s)]).toBe(SUB_SEDIMENT);
  });

  for (const e of files) {
    it(`${e.id}: the 4× analogue with a save → load near the midpoint digests to the recorded currentDigest and equals the 1× run`, { timeout: 300_000 }, async () => {
      let w: World = fenceStart(shipped, e);
      let saved = false;
      while (w.tick < e.ticks) {
        for (let k = 0; k < 4 && w.tick < e.ticks; k++) step(w);
        stateHash(w); // observing must not perturb
        if (!saved && w.tick >= e.ticks / 2) {
          saved = true;
          const before = stateHash(w);
          const { text } = await buildSaveFile(w, meta);
          w = (await loadSaveFile(text)).world;
          expect(stateHash(w)).toBe(before);
        }
      }
      expect(w.tick).toBe(e.ticks);
      expect(trajectoryDigest(w, 'full')).toBe(e.currentDigest);
      // The whole state too (the digest leaves out history, events and provenance): one uninterrupted 1× run.
      const once = fenceStart(shipped, e);
      run(once, e.ticks);
      expect(stateHash(w)).toBe(stateHash(once));
    });
  }
});
