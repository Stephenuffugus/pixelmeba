/**
 * G3 re-measurement of D-0015's FIRST_DISH_V1 proposals (docs/reports/tune-g1.md "Proposed recipe
 * revisions"), in memory: content/ is never changed. Each candidate is a deep copy of the shipped
 * packs with one FIRST_DISH_V1 setting edited (revision 2), its content hash rewritten and the
 * packs validated like shipped content; then tuneSeed (tools/sim-tune.ts) on the six DEV_SEEDS,
 * 600 s, Standard (CT §11), with the G3 shipped manifest (19 species, ten modules).
 */
import { performance } from 'node:perf_hooks';
import { validateContent, ContentError, type RawPacks } from '../src/sim/content/registry';
import { contentHashOf, patchedRawPacks } from '../tests/helpers/registry';
import { tuneSeed, DEV_SEEDS, type SeedRun } from './sim-tune';

type Recipe = {
  revision: number;
  fieldPatches: { center: [number, number]; radius: number; add: Record<string, number>; label: string }[];
  founders: { species: string; center: [number, number] }[];
};

function candidate(edit: ((r: Recipe) => void) | null) {
  const raw = patchedRawPacks({});
  if (edit) {
    const f = raw.recipes.find((x) => (x.data as { id: string }).id === 'FIRST_DISH_V1')!;
    const r = f.data as Recipe;
    r.revision = 2;
    edit(r);
    // The What if? variants pin FIRST_DISH_V1 revision 1; they play no part in this measurement.
    (raw as { variants: RawPacks['variants'] }).variants = raw.variants.filter((v) => (v.data as { sourceId?: string }).sourceId !== 'FIRST_DISH_V1');
    (raw.manifest.data as Record<string, unknown>).contentHash = contentHashOf(raw);
  }
  const res = validateContent(raw, {});
  if (res.registry === null) throw new ContentError(res.issues);
  return res.registry;
}

const patch = (r: Recipe, label: string) => r.fieldPatches.find((p) => p.label === label)!;
const c1 = (r: Recipe) => {
  patch(r, 'Starch patch').add.sugar = 0.1;
};
const c2 = (r: Recipe) => {
  const p = patch(r, 'Debris patch');
  p.add.detritus = 0.5;
  p.add.detritusN = 0.05;
};
const c3 = (r: Recipe) => {
  patch(r, 'Debris patch').center = [58, 48];
  r.founders.find((g) => g.species === 'B04')!.center = [58, 48];
};

const CANDIDATES: [string, ((r: Recipe) => void) | null][] = [
  ['V1 as is', null],
  ['1: starch-patch sugar 0.10', c1],
  ['2: debris 0.50 C (N 0.05)', c2],
  ['3: debris patch + B04 to (58,48)', c3],
  ['1 + 3', (r) => {
    c1(r);
    c3(r);
  }],
];

const only = process.argv[2];
const out: Record<string, unknown>[] = [];
const t0 = performance.now();
for (const [name, edit] of CANDIDATES) {
  if (only && !only.split(',').some((o) => name.startsWith(o))) continue;
  const reg = candidate(edit);
  for (const seed of DEV_SEEDS) {
    const t1 = performance.now();
    const run: SeedRun = tuneSeed(reg, { recipe: 'FIRST_DISH_V1', seed, preset: 'standard', seconds: 600, extendSeconds: 0 });
    const c = run.checkpoint;
    const row = {
      candidate: name,
      seed,
      contentHash: run.contentHash.slice(0, 12),
      hash: c.hash,
      firstIntakeTick: c.firstIntakeTick,
      firstDivisionTick: c.firstDivisionTick,
      starchConverted: Number(c.starchConverted.toFixed(2)),
      births: c.birthsBySpecies,
      alive: c.counts,
      peakB04: c.peak.B04,
      extinct: c.extinct,
      mutations: c.mutations,
      gains: c.inheritance.gains,
      ledgerOk: c.ledger.ok,
      wallS: Number(((performance.now() - t1) / 1000).toFixed(1)),
    };
    out.push(row);
    console.error(JSON.stringify(row));
  }
}
console.log(JSON.stringify({ wallS: (performance.now() - t0) / 1000, rows: out }));
