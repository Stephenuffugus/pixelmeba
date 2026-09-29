/**
 * Wave A's recorded measurement numbers (tests/experiments/golden/wave-a-measurements.json), and the
 * check that the unified paired-run measurement (src/sim/pairedRun.ts) reproduces every one of them
 * exactly: the six Phase 2 cards through runExperiment and three comparisons through
 * runPairedComparison, recorded with the code as it was before the two observers were merged.
 * State hashes are not in the file (they cover the content hash); replay identity is proven by the
 * card fixtures themselves.
 *
 * One recorded change (D-0029): EXP_101 arm A's timeline hash. Samples now tally secretion by the
 * organism's producer rules, so a Sprinter that gained E01 by mutation is counted (from 60 s on). With
 * that Sprinter tally removed the timeline hashes to wave A's value 5345c782…4bf527 exactly.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect } from 'vitest';
import { canonicalJson } from '../../src/sim/hash';
import type { ExperimentResult } from '../../src/sim/experiments';
import type { ComparisonResults } from '../../src/sim/pairedRun';

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

interface Golden {
  readonly cards: Readonly<Record<string, { readonly [k: string]: Json }>>;
  readonly comparisons: Readonly<Record<string, { readonly [k: string]: Json }>>;
}

let golden: Golden | null = null;
export function waveA(): Golden {
  return (golden ??= JSON.parse(readFileSync(new URL('./golden/wave-a-measurements.json', import.meta.url), 'utf8')) as Golden);
}

/**
 * Every value in `expected` must be present in `actual` and identical (numbers with ===, so +0 and
 * −0 agree, as JSON cannot tell them apart). Keys only in `actual` are listed in `extra`.
 */
export function diffJson(actual: unknown, expected: Json, path: string, out: { diffs: string[]; extra: string[] }): void {
  if (expected === null || typeof expected !== 'object') {
    if (actual !== expected) out.diffs.push(`${path}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return;
  }
  if (actual === null || typeof actual !== 'object') {
    out.diffs.push(`${path}: expected an object, got ${JSON.stringify(actual)}`);
    return;
  }
  const a = actual as Record<string, unknown>;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) out.diffs.push(`${path}: expected ${expected.length} items, got ${Array.isArray(actual) ? actual.length : 'no array'}`);
    else expected.forEach((v, i) => diffJson(a[i], v, `${path}[${i}]`, out));
    return;
  }
  for (const k of Object.keys(expected)) diffJson(a[k], expected[k]!, `${path}.${k}`, out);
  for (const k of Object.keys(a)) if (!(k in expected)) out.extra.push(`${path}.${k}`);
}

const sha256 = (v: unknown) => createHash('sha256').update(canonicalJson(v)).digest('hex');

/** Measurement families added after wave A (they may appear in a catalog; nothing else may). */
const NEW_FAMILIES = /^\.(A|B)\.measurements\.(reserveHeld|reservePeak|founders|descendants|groupEnergy|groupExtinctAt|groupEnergyMedian|groupEnergyMin|groupEnergyMax)\./;

/** A card's result reproduces wave A's numbers exactly: gate, stamp, both arms' measurements, ledger, timeline. */
export function expectWaveANumbers(r: ExperimentResult): void {
  const g = waveA().cards[r.experimentId];
  if (!g) throw new Error(`no wave A record for ${r.experimentId}`);
  const arm = (x: ExperimentResult['A'] | null) =>
    x && { worldId: x.worldId, measurements: x.measurements, reported: x.reported, ledger: x.ledger, unattributedDeaths: x.unattributedDeaths, timelineSha256: sha256(x.timeline) };
  const actual = {
    label: r.label,
    startTick: r.startTick,
    endTick: r.endTick,
    interventions: r.interventions,
    gate: r.gate,
    stamp: r.stamp,
    A: arm(r.A),
    B: arm(r.B),
  };
  const out = { diffs: [] as string[], extra: [] as string[] };
  diffJson(actual, g, '', out);
  expect(out.diffs, out.diffs.slice(0, 20).join('\n')).toEqual([]);
  // Only the new measurement families and the fields wave A's record leaves out (hashes) are extra.
  const unexpected = out.extra.filter((p) => !NEW_FAMILIES.test(p) && !/\.(contentHash)$/.test(p));
  expect(unexpected).toEqual([]);
}

/** A comparison's results reproduce wave A's numbers exactly (state hashes excepted). */
export function expectWaveAComparison(name: string, results: ComparisonResults): void {
  const g = waveA().comparisons[name];
  if (!g) throw new Error(`no wave A comparison ${name}`);
  const out = { diffs: [] as string[], extra: [] as string[] };
  diffJson(results, g, '', out);
  expect(out.diffs, out.diffs.slice(0, 20).join('\n')).toEqual([]);
  expect(out.extra.filter((p) => !/\.hash$/.test(p))).toEqual([]);
}
