/**
 * P2.8 regional trait graphs (SPEC §12.4 "selected trait median/range per region"): the recorded
 * regional series — whole dish and four quarters — equals an independent recomputation from world
 * state at every sample tick, through stage 10 directly and through the worker's `traitHistory`
 * request; the table view shows exactly those values; compaction keeps memory bounded like the rest
 * of history; recording is observation only (state hash unchanged by it, never read back).
 */
import { describe, expect, it } from 'vitest';
import {
  createHistory,
  interventionSeconds,
  pushSample,
  createTraitHistory,
  pushTraitSample,
  regionalTraitSeries,
  traitAvailability,
  TRAIT_MINUTE_SAMPLES,
  TRAIT_RECENT_SAMPLES,
  type RegionStat,
  type TraitSample,
} from '../../src/sim/history';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { changeMarksText, REGION_LABELS, traitRecordNote, traitSummaryText, traitTableRows } from '../../src/ui/panels/TraitData';
import { FakeClockHost } from '../helpers/host';
import { registry } from '../helpers/world';

const reg = registry();

/**
 * Independent recomputation from world state (not the recorder's code): the quarter from the
 * organism's continuous position against the dish centre line x = 64, y = 64 (cells 0–63 | 64–127),
 * active loci from the species record plus the dormancy locus (7) for carriers of module E03.
 */
function expectedStats(world: World, species: number, locus: number): RegionStat[] {
  const groups: number[][] = [[], [], [], [], []];
  const counts = [0, 0, 0, 0, 0];
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) {
    if (c.alive[i] !== 1 || c.species[i] !== species) continue;
    const g = world.genomes.get(c.genome[i]!);
    const top = c.y[i]! < 64;
    const left = c.x[i]! < 64;
    const quarter = top ? (left ? 1 : 2) : left ? 3 : 4;
    const active =
      world.species[species]!.def.lociActive[locus] === true || (locus === 7 && g.modules.includes('E03'));
    for (const r of [0, quarter]) {
      counts[r]!++;
      if (active) groups[r]!.push(g.loci[locus]!);
    }
  }
  return groups.map((v, r) => {
    const s = [...v].sort((a, b) => a - b);
    const n = s.length;
    const median = n === 0 ? null : n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
    return { count: counts[r]!, n, median, min: n ? s[0]! : null, max: n ? s[n - 1]! : null };
  });
}

/** Every (species, locus) with at least one member carrying that locus somewhere. */
function pairsOf(world: World): [number, number][] {
  const out: [number, number][] = [];
  for (let s = 0; s < world.species.length; s++) for (let l = 0; l < 8; l++) out.push([s, l]);
  return out;
}

function varied(): World {
  // Varied founders and accelerated mutation, so the loci really differ between organisms and regions.
  return realizeRecipe(reg, 'FIRST_DISH_V1', {
    worldId: 'traits',
    seed: 104729,
    transform: (r) => ({ ...r, founderMode: 'varied', mutationPreset: 'accelerated' }),
  });
}

describe('regional trait history (P2.8)', () => {
  it('stage 10 records, every 10 simulated seconds, what an independent recomputation finds in each region', () => {
    const w = varied();
    const expected: Record<number, Record<string, RegionStat[]>> = {};
    const seconds: number[] = [];
    for (let t = 0; t < 1200; t++) {
      step(w);
      if (w.tick % 100 !== 0) continue;
      const sec = w.tick / 10;
      seconds.push(sec);
      expected[sec] = {};
      for (const [s, l] of pairsOf(w)) expected[sec][`${s}:${l}`] = expectedStats(w, s, l);
    }
    expect(seconds).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]);
    expect(w.history.traits.recent.map((x) => x.second)).toEqual(seconds);
    let nonTrivial = 0;
    for (const [s, l] of pairsOf(w)) {
      const series = regionalTraitSeries(w.history, s, l);
      expect(series.points.map((p) => p.second)).toEqual(seconds);
      for (const p of series.points) {
        expect(p.summary).toBe(false);
        expect(p.regions, `species ${s} locus ${l} at ${p.second} s`).toEqual(
          expected[p.second]![`${s}:${l}`],
        );
        if (p.regions.some((r) => r.min !== null && r.max !== null && r.max > r.min)) nonTrivial++;
      }
    }
    // Not vacuous: organisms live in several quarters and their loci differ within regions.
    expect(nonTrivial).toBeGreaterThan(20);
    const occupied = new Set<number>();
    for (let s = 0; s < w.species.length; s++) {
      const last = regionalTraitSeries(w.history, s, 0).points.at(-1)!;
      expect(last.regions[0]!.count).toBe(last.regions.slice(1).reduce((a, r) => a + r.count, 0));
      last.regions.forEach((r, k) => (k > 0 && r.count > 0 ? occupied.add(k) : null));
    }
    expect(occupied.size).toBeGreaterThanOrEqual(3);
    // The picker offers exactly the loci that were recorded (template-active ones here).
    const avail = traitAvailability(w.history, w.species.length);
    for (let s = 0; s < w.species.length; s++) {
      const seen = seconds.some((sec) =>
        w.species[s]!.def.lociActive.some((a, l) => a && (expected[sec]![`${s}:${l}`]![0]!.n ?? 0) > 0),
      );
      if (seen) expect(avail[s]!.length).toBeGreaterThan(0);
      for (const l of avail[s]!)
        expect(seconds.some((sec) => expected[sec]![`${s}:${l}`]![0]!.n > 0)).toBe(true);
    }
  });

  it('through the worker: the traitHistory reply and the table view match the recomputation at the sample ticks', () => {
    const h = new FakeClockHost();
    h.create('d', {
      kind: 'recipe',
      recipeId: 'FIRST_DISH_V1',
      seed: 104729,
      overrides: { founderMode: 'varied', mutationPreset: 'accelerated' },
    });
    // Two changes to the dish: at tick 0 (recorded with second 1) and at tick 500 (second 51).
    const feed = (id: string) =>
      h.command(id, { kind: 'deposit', materialId: 'SUGAR', dose: 0.1, points: [[64, 64]], radius: 1 });
    expect(feed('feed-0')?.accepted).toBeGreaterThan(0);
    h.setSpeed(4);
    const expected: Record<number, RegionStat[]> = {};
    const SPECIES = 0;
    const LOCUS = 1;
    for (let target = 100; target <= 900; target += 100) {
      h.advanceTo(target);
      expected[target / 10] = expectedStats(h.world, SPECIES, LOCUS);
      if (target === 500) expect(feed('feed-500')?.accepted).toBeGreaterThan(0);
    }
    h.host.handle({ type: 'traitHistory', requestId: 77, dishId: 'd', species: SPECIES, locus: LOCUS });
    const reply = h.out.find((m) => m.type === 'traitHistory' && m.requestId === 77);
    if (!reply || reply.type !== 'traitHistory') throw new Error('no traitHistory reply');
    expect(reply.series.points.map((p) => p.second)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
    for (const p of reply.series.points) expect(p.regions).toEqual(expected[p.second]);
    expect(reply.loci.map((l) => l.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    // The changes are marked where they happened (SPEC §12.4), read from recorded history.
    expect(reply.interventions).toEqual([1, 51]);
    expect(reply.available[SPECIES]).toContain(LOCUS);
    // Table view: newest first, one row per recorded sample, each region's alive / median / range.
    const rows = traitTableRows(reply.series);
    expect(rows.map((r) => r.second)).toEqual([90, 80, 70, 60, 50, 40, 30, 20, 10]);
    const fmt = (v: number | null) => (v === null ? '—' : Number.isInteger(v) ? String(v) : v.toFixed(1));
    for (const row of rows) {
      const exp = expected[row.second]!;
      expect(row.cells).toHaveLength(REGION_LABELS.length);
      row.cells.forEach((cell, k) => {
        const e = exp[k]!;
        expect(cell.alive).toBe(String(e.count));
        expect(cell.median).toBe(fmt(e.median));
        expect(cell.range).toBe(
          e.min === null ? '—' : e.min === e.max ? fmt(e.min) : `${fmt(e.min)}–${fmt(e.max)}`,
        );
      });
    }
    // The text summary reads the latest sample, region by region.
    const text = traitSummaryText(reply.series, 'Sprinters', 'Feeding investment');
    expect(text).toContain('at 1:30');
    for (const label of REGION_LABELS) expect(text).toContain(`${label}:`);
    // Asking is read-only: the world did not change and the dish is still running.
    expect(h.errors()).toEqual([]);
  });

  it('recording is observation only: the state hash is the same with or without trait records, and they survive save/reload', () => {
    const w = varied();
    for (let t = 0; t < 300; t++) step(w);
    const hash = stateHash(w);
    const saved = serializeWorld(w);
    const without = deserializeWorld({
      ...saved,
      history: { ...saved.history, traits: createTraitHistory() },
    });
    expect(stateHash(without)).toBe(hash);
    const copy = deserializeWorld(JSON.parse(JSON.stringify(saved)) as typeof saved);
    expect(copy.history.traits).toEqual(w.history.traits);
    for (let t = 0; t < 200; t++) {
      step(w);
      step(copy);
      step(without);
    }
    expect(stateHash(copy)).toBe(stateHash(w));
    expect(stateHash(without)).toBe(stateHash(w));
    expect(regionalTraitSeries(copy.history, 0, 0)).toEqual(regionalTraitSeries(w.history, 0, 0));
  });

  it('a loaded world never holds more trait samples than the windows allow; malformed samples are dropped', () => {
    const w = varied();
    for (let t = 0; t < 100; t++) step(w);
    const saved = serializeWorld(w);
    const fake = (second: number): TraitSample => ({ second, rows: [[0, 0, 1, 1, 1, 50, 50, 50]] });
    const loaded = deserializeWorld({
      ...saved,
      history: {
        ...saved.history,
        traits: {
          recent: [...Array.from({ length: 400 }, (_, k) => fake((k + 1) * 10)), { second: 'x', rows: [] } as never],
          minutes: Array.from({ length: 500 }, (_, k) => fake((k + 1) * 60)),
          compacted: false,
        },
      },
    });
    const t = loaded.history.traits;
    expect(t.recent).toHaveLength(TRAIT_RECENT_SAMPLES + 5);
    expect(t.recent.at(-1)!.second).toBe(4000);
    expect(t.minutes).toHaveLength(TRAIT_MINUTE_SAMPLES);
    expect(t.minutes.at(-1)!.second).toBe(500 * 60);
    expect(t.compacted).toBe(true);
    expect(stateHash(loaded)).toBe(stateHash(w));
  });

  it('change marks: per-second samples at their second, compacted minutes at the end of their minute', () => {
    const h = createHistory(1);
    const at = new Set([5, 70, 1900]);
    for (let k = 1; k <= 1800 + 120; k++)
      pushSample(h, {
        second: k,
        count: [1],
        biomass: [1],
        births: [0],
        deaths: [0],
        oxygenMean: 1,
        nutrientTotal: 1,
        sugarTotal: 0,
        capacityLimited: false,
        interventions: at.has(k) ? 1 : 0,
      });
    // Seconds 1–120 were compacted into two minute summaries (ending at 60 and 120).
    expect(h.minutes.map((m) => m.second)).toEqual([60, 120]);
    expect(interventionSeconds(h)).toEqual([60, 120, 1900]);
  });

  it('compaction keeps the last 30 minutes of 10-second samples and one sample per minute up to six hours', () => {
    const t = createTraitHistory();
    const sample = (second: number): TraitSample => ({
      second,
      rows: [[0, 0, second, 1, 1, second % 100, 0, 100]],
    });
    const last = (TRAIT_RECENT_SAMPLES + TRAIT_MINUTE_SAMPLES * 6 + 60) * 10;
    for (let s = 10; s <= last; s += 10) {
      pushTraitSample(t, sample(s));
      expect(t.recent.length).toBeLessThan(TRAIT_RECENT_SAMPLES + 6);
      expect(t.minutes.length).toBeLessThanOrEqual(TRAIT_MINUTE_SAMPLES);
    }
    expect(t.compacted).toBe(true);
    expect(t.minutes).toHaveLength(TRAIT_MINUTE_SAMPLES);
    // Minute samples are the whole minutes, contiguous, ending right before the 10-second window.
    for (const m of t.minutes) expect(m.second % 60).toBe(0);
    for (let k = 1; k < t.minutes.length; k++)
      expect(t.minutes[k]!.second - t.minutes[k - 1]!.second).toBe(60);
    expect(t.recent[0]!.second - t.minutes.at(-1)!.second).toBeLessThanOrEqual(60);
    for (let k = 1; k < t.recent.length; k++) expect(t.recent[k]!.second - t.recent[k - 1]!.second).toBe(10);
    expect(t.recent.at(-1)!.second - t.recent[0]!.second).toBeGreaterThanOrEqual(1790);
    // The series marks minute samples as summaries.
    const series = regionalTraitSeries({ traits: t } as never, 0, 0);
    expect(series.compacted).toBe(true);
    expect(series.points.filter((p) => p.summary)).toHaveLength(TRAIT_MINUTE_SAMPLES);
    expect(series.points.at(-1)!.regions[0]).toEqual({
      count: last,
      n: 1,
      median: last % 100,
      min: 0,
      max: 100,
    });
  });

  it('the charts state only recorded facts about what the trait record lacks: never "none before" for a thinned record (fix round 1)', () => {
    // A dish made today: trait samples every 10 s from 0:10 to 31 minutes.
    const h = createHistory(1);
    for (let s = 10; s <= 31 * 60; s += 10) pushTraitSample(h.traits, { second: s, rows: [[0, 0, 1, 1, 1, 50, 50, 50]] });
    const series = regionalTraitSeries(h, 0, 0);
    // The first kept point is the 1:00 minute sample, although 0:10–0:50 were recorded (then thinned).
    expect(series.points[0]!.second).toBe(60);
    expect(series.since).toBe(0);
    expect(series.compacted).toBe(true);
    const note = traitRecordNote(series);
    expect(note).toBe(
      'This trait history is incomplete: for times older than the last 30 simulated minutes it keeps one sample per minute, and none older than six hours.',
    );
    expect(note).not.toMatch(/recorded no|none before|start/);
    // Before any compaction nothing is claimed.
    expect(traitRecordNote(regionalTraitSeries(createHistory(1), 0, 0))).toBe('');
    // An older dish migrated at 2:03 (world schema 2 → 3) records from then on: that is said, from the record.
    const migrated = { ...createHistory(1), traits: createTraitHistory(123.4) };
    pushTraitSample(migrated.traits, { second: 130, rows: [] });
    expect(traitRecordNote(regionalTraitSeries(migrated, 0, 0))).toBe(
      'Trait samples start after 2:03: this dish was saved by an older version of Pixelmeba before then, which recorded no trait samples.',
    );
    // A record written before `since` existed claims nothing about its start.
    expect(regionalTraitSeries({ ...createHistory(1), traits: createTraitHistory() }, 0, 0).since).toBeNull();
  });

  it('changes to the dish are listed in words and in the table, not only drawn (fix round 1)', () => {
    expect(changeMarksText([])).toBe('No changes were made to the dish in this time.');
    expect(changeMarksText([15])).toBe('Dashed vertical lines mark changes made to the dish: at 0:15.');
    expect(changeMarksText([15, 40, 3725])).toBe('Dashed vertical lines mark changes made to the dish: at 0:15, 0:40 and 1:02:05.');
    expect(changeMarksText([1, 2, 3, 4, 5, 6])).toBe(
      'Dashed vertical lines mark changes made to the dish at 6 moments, from 0:01 to 0:06; the table view marks each one.',
    );
    const t = createTraitHistory(0);
    for (let s = 10; s <= 50; s += 10) pushTraitSample(t, { second: s, rows: [[0, 0, 1, 1, 1, 50, 50, 50]] });
    const rows = traitTableRows(regionalTraitSeries({ traits: t } as never, 0, 0), [10, 25, 26]);
    // Newest first; a change after the previous row and up to this one.
    expect(rows.map((r) => [r.time, r.changed])).toEqual([
      ['0:50', false],
      ['0:40', false],
      ['0:30', true],
      ['0:20', false],
      ['0:10', true],
    ]);
  });

  it('a command that placed nothing is not marked as a change to the dish (fix round 1)', () => {
    const h = new FakeClockHost();
    h.create('d', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', seed: 104729 });
    h.setSpeed(1);
    h.advanceTo(50);
    // Outside the round dish: nothing is placed.
    const refused = h.command('refused', { kind: 'deposit', materialId: 'SUGAR', dose: 0.1, points: [[1, 1]], radius: 0 });
    expect(refused?.accepted).toBe(0);
    h.advanceTo(120);
    expect(interventionSeconds(h.world.history)).toEqual([]);
    // A deposit that placed sugar is marked at its second.
    const fed = h.command('fed', { kind: 'deposit', materialId: 'SUGAR', dose: 0.1, points: [[64, 64]], radius: 1 });
    expect(fed?.accepted).toBeGreaterThan(0);
    h.advanceTo(200);
    expect(interventionSeconds(h.world.history)).toEqual([13]);
  });
});

