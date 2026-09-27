/**
 * G1 fixture: blocked division proposal (SPEC §6.9, D05 A01; BUILD_DIRECTIVE G1 gate). A parent that
 * meets every division gate in a crowded, stone-enclosed cell gets one proposal whose daughter
 * genomes (including a real mutation draw) are drawn once. While crowding blocks the birth:
 *  - every proposal column and both candidate genomes stay identical on every blocked tick;
 *  - nothing is charged (no division energy, no split, no new birth identities).
 * When the residents starve and space opens by itself, the cost is paid and the split commits
 * exactly once: one birth event, two daughters with the proposed genomes and mutation records, the
 * parent's pools halved once, the ledger closed. A save/reload in the middle of the blocked period
 * (the real save-file path) keeps the same proposal and ends at the same commit tick and final hash.
 */
import { describe, expect, it } from 'vitest';
import { DT, MOVE_COST_PER_CELL } from '../../src/sim/constants';
import { genomeKey } from '../../src/sim/genome';
import { cellIndex, ST_STONE } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { field } from '../../src/sim/lineage';
import { MUT_QUANT, proposeDaughters } from '../../src/sim/mutation';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { clearWater, place } from '../helpers/world';

const PROPOSAL_COLUMNS = [
  'propG0',
  'propG1',
  'propTick',
  'propFlags0',
  'propFlags1',
  'propLocus0',
  'propLocus1',
  'propDelta0',
  'propDelta1',
  'propModule0',
  'propModule1',
] as const;

type Proposal = Record<(typeof PROPOSAL_COLUMNS)[number], number> & { genome0: string; genome1: string };

function proposalOf(w: World, slot: number): Proposal {
  const c = w.ents.cols;
  const out = {} as Record<string, number | string>;
  for (const col of PROPOSAL_COLUMNS) out[col] = c[col][slot]!;
  out.genome0 = c.propG0[slot]! >= 0 ? genomeKey(w.genomes.get(c.propG0[slot]!)) : '';
  out.genome1 = c.propG1[slot]! >= 0 ? genomeKey(w.genomes.get(c.propG1[slot]!)) : '';
  return out as Proposal;
}

/**
 * Parent (B 2 = 2 × B0, E 90, H 100, age 20: every gate passes) alone in a cell whose eight
 * neighbours are stone, with seven starving residents: load 2 + 6 × 1 + 0.4 = 8.4 > 8 ⇒ crowding.
 * The residents (E 0.5, H 20) starve on their own after ~6 s, which opens the space.
 */
function scene(seed: number): { w: World; parent: number } {
  const w = clearWater({ seed, mutationPreset: 'accelerated' });
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) w.grid.structure[cellIndex(64 + dx, 64 + dy)] = ST_STONE;
  w.grid.geometryVersion++;
  const parent = place(w, 'B01', 64.5, 64.5, { B: 2, N: 0.2, E: 90, H: 100, age: 20 });
  for (let k = 0; k < 6; k++) place(w, 'B01', 64.2 + k * 0.1, 64.3, { E: 0.5, H: 20 });
  place(w, 'B01', 64.8, 64.7, { B: 0.4, N: 0.04, E: 0.5, H: 20 });
  return { w, parent };
}

/** First seed (from the Garden seed up) whose proposal carries a non-neutral quantitative mutation. */
function mutatingSeed(): number {
  for (let seed = 104729; seed < 104729 + 200; seed++) {
    const { w, parent } = scene(seed);
    const p = proposeDaughters(w, parent);
    if (p.draws.some((d) => (d.flags & MUT_QUANT) !== 0 && d.delta !== 0)) return seed;
  }
  throw new Error('no seed with a mutating proposal in range');
}

interface RunRecord {
  readonly proposal: Proposal;
  readonly commitTick: number;
  readonly hashes: readonly string[];
  readonly finalHash: string;
}

const AFTER_COMMIT = 60;

/**
 * Run the scene tick by tick with every blocked-tick and commit assertion. When `reloadAt` is set,
 * the world is saved and loaded through the real save-file path at that tick and the run continues
 * on the loaded world.
 */
async function runScene(seed: number, reloadAt: number | null): Promise<RunRecord> {
  const built0 = scene(seed);
  let w = built0.w;
  const parent = built0.parent;
  const c = () => w.ents.cols;
  const expected = proposeDaughters(w, parent);
  const parentBirth = c().birthId[parent]!;
  const nextBirth = w.counters.nextBirthId;
  const cost = profileOf(w, parent).divisionCost;
  const hashes: string[] = [];

  // Tick 0: the proposal is made once, then the birth is blocked by crowding.
  step(w);
  expect(c().divBlockCode[parent]).toBe(R.DIV_BLOCK_CROWDING);
  const P = proposalOf(w, parent);
  expect(P.propTick).toBe(0);
  expect([P.propG0, P.propG1]).toEqual(expected.genomes);
  expect([P.propFlags0, P.propLocus0, P.propDelta0]).toEqual([expected.draws[0].flags, expected.draws[0].locus, expected.draws[0].delta]);
  expect([P.propFlags1, P.propLocus1, P.propDelta1]).toEqual([expected.draws[1].flags, expected.draws[1].locus, expected.draws[1].delta]);
  expect(P.propG0 !== P.propG1 || P.propFlags0 !== 0).toBe(true);
  hashes.push(stateHash(w));

  let blockedTicks = 1;
  for (;;) {
    if (reloadAt !== null && w.tick === reloadAt) {
      const built = await buildSaveFile(w, { name: 'blocked', savedAt: '2026-01-01T00:00:00.000Z', recipeId: null });
      const loaded = (await loadSaveFile(built.text)).world;
      expect(stateHash(loaded)).toBe(stateHash(w));
      expect(proposalOf(loaded, parent)).toEqual(P);
      expect(loaded.ents.cols.divBlockCode[parent]).toBe(R.DIV_BLOCK_CROWDING);
      w = loaded;
    }
    const Ebefore = c().E[parent]!;
    let pre: { B: number; N: number; E: number; mealC: number; mealN: number } | null = null;
    step(w, {
      afterStage: (stage, world) => {
        if (stage !== 8) return;
        const k = world.ents.cols;
        pre = { B: k.B[parent]!, N: k.N[parent]!, E: k.E[parent]!, mealC: k.mealC[parent]!, mealN: k.mealN[parent]! };
      },
    });
    hashes.push(stateHash(w));
    expect(checkLedger(w).ok, `ledger at tick ${w.tick}`).toBe(true);
    const births = w.events.totals.birth ?? 0;
    if (births === 0) {
      // Still blocked: identical proposal, nothing charged, no identities spent.
      blockedTicks++;
      expect(c().divBlockCode[parent]).toBe(R.DIV_BLOCK_CROWDING);
      expect(proposalOf(w, parent)).toEqual(P);
      expect(c().birthId[parent]).toBe(parentBirth);
      expect(c().B[parent]).toBe(2);
      expect(w.counters.nextBirthId).toBe(nextBirth);
      expect(w.ledger.energy.division).toBe(0);
      const prof = profileOf(w, parent);
      const paid = (prof.m + prof.upkeep) * DT + MOVE_COST_PER_CELL * c().movedThisTick[parent]! * prof.motilityFactor;
      expect(Ebefore - c().E[parent]!).toBeCloseTo(paid, 12);
      expect(blockedTicks).toBeLessThan(400);
      continue;
    }

    // Committed this tick, exactly once — space opened because all seven residents starved.
    expect(births).toBe(1);
    expect(w.events.totals.death).toBe(7);
    expect(w.events.ring.filter((e) => e.type === 'death').map((e) => e.cause)).toEqual(new Array(7).fill(R.DEATH_STARVATION));
    const commitTick = w.tick - 1;
    expect(pre).not.toBeNull();
    const before = pre!;
    const k = c();
    const kids: number[] = [];
    for (let i = 0; i < w.ents.highWater; i++) if (k.alive[i] === 1 && field(w.lineage, 'parent', k.birthId[i]!) === parentBirth) kids.push(i);
    expect(kids).toHaveLength(2);
    expect(kids).toContain(parent); // the retained daughter keeps the slot
    const other = kids.find((s) => s !== parent)!;
    expect([k.birthId[parent], k.birthId[other]]).toEqual([nextBirth, nextBirth + 1]);
    expect([k.genome[parent], k.genome[other]]).toEqual([P.propG0, P.propG1]);
    for (const [slot, d] of [
      [parent, 0],
      [other, 1],
    ] as const) {
      const b = k.birthId[slot]!;
      expect(field(w.lineage, 'generation', b)).toBe(1);
      expect(field(w.lineage, 'birthTick', b)).toBe(commitTick);
      expect(field(w.lineage, 'mutFlags', b)).toBe(d === 0 ? P.propFlags0 : P.propFlags1);
      expect(field(w.lineage, 'mutLocus', b)).toBe(d === 0 ? P.propLocus0 : P.propLocus1);
      expect(field(w.lineage, 'mutDelta', b)).toBe(d === 0 ? P.propDelta0 : P.propDelta1);
      // The parent's pools were split once, after paying the cost once.
      expect(k.B[slot]).toBeCloseTo(before.B / 2, 14);
      expect(k.N[slot]).toBeCloseTo(before.N / 2, 14);
      expect(k.E[slot]).toBeCloseTo((before.E - cost) / 2, 12);
      expect(k.mealC[slot]).toBeCloseTo(before.mealC / 2, 14);
      expect(k.age[slot]).toBe(0);
    }
    expect(w.ledger.energy.division).toBe(cost);
    // The parent's own record ends by division (cause −1), at the commit tick.
    expect(field(w.lineage, 'deathTick', parentBirth)).toBe(commitTick);
    expect(field(w.lineage, 'deathCause', parentBirth)).toBe(-1);
    const birthEvents = w.events.ring.filter((e) => e.type === 'birth');
    expect(birthEvents).toHaveLength(1);
    expect(birthEvents[0]!.detail).toMatchObject({ parent: parentBirth, daughterA: nextBirth, daughterB: nextBirth + 1 });
    for (const col of ['propG0', 'propG1'] as const) expect(k[col][parent]).toBe(-1);

    // Nothing commits twice: the daughters (B 1 each, no food) cannot divide again.
    for (let t = 0; t < AFTER_COMMIT; t++) {
      step(w);
      hashes.push(stateHash(w));
    }
    expect(w.events.totals.birth).toBe(1);
    expect(w.ledger.energy.division).toBe(cost);
    expect(w.counters.nextBirthId).toBe(nextBirth + 2);
    expect(checkLedger(w).ok).toBe(true);
    expect(blockedTicks).toBeGreaterThan(20);
    return { proposal: P, commitTick, hashes, finalHash: stateHash(w) };
  }
}

describe('G1 blocked division proposal', () => {
  const seed = mutatingSeed();
  let uninterrupted: RunRecord | null = null;

  it('keeps one identical proposal on every blocked tick, charges nothing, then commits exactly once when space opens', async () => {
    uninterrupted = await runScene(seed, null);
    console.info(
      `blocked-division-proposal: seed ${seed}; blocked ticks 0–${uninterrupted.commitTick - 1}, committed at tick ${uninterrupted.commitTick}; ` +
        `proposal flags ${uninterrupted.proposal.propFlags0}/${uninterrupted.proposal.propFlags1}, ` +
        `locus ${uninterrupted.proposal.propLocus0}/${uninterrupted.proposal.propLocus1}, delta ${uninterrupted.proposal.propDelta0}/${uninterrupted.proposal.propDelta1}; ` +
        `final hash ${uninterrupted.finalHash}`,
    );
  });

  it('a save/reload in the middle of the blocked period gives the same proposal, commit tick and final hash', async () => {
    const base = uninterrupted ?? (await runScene(seed, null));
    const mid = Math.floor(base.commitTick / 2);
    expect(mid).toBeGreaterThan(0);
    const reloaded = await runScene(seed, mid);
    expect(reloaded.proposal).toEqual(base.proposal);
    expect(reloaded.commitTick).toBe(base.commitTick);
    expect(reloaded.hashes).toEqual(base.hashes);
    expect(reloaded.finalHash).toBe(base.finalHash);
  });
});
