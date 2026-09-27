/**
 * npm run sim:run -- --recipe FIRST_DISH_V1 --seed 104729 --ticks 6000
 *   [--commands file.json] [--hash-every K] [--perf] [--out file.json] [--lid open|closed]
 *
 * Headless run of a recipe: prints a JSON summary with populations, ledger error, event totals,
 * milestones and the endpoint state hash. --perf adds tick timing percentiles and a stage breakdown.
 * The commands file is an array of { atTick, commandId, payload } entries (the CommandPayload union).
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { checkLedger } from '../src/sim/ledger';
import { realizeRecipe } from '../src/sim/recipes';
import { stateHash } from '../src/sim/serialize';
import { step } from '../src/sim/tick';
import { queueCommand, type CommandPayload } from '../src/sim/commands';
import { loadRegistryFs } from './lib/content-fs';

interface Args {
  recipe: string;
  seed?: number;
  ticks: number;
  commands?: string;
  hashEvery?: number;
  perf: boolean;
  out?: string;
  lid?: 'open' | 'closed';
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const recipe = get('recipe') ?? 'FIRST_DISH_V1';
  const ticks = Number(get('ticks') ?? '6000');
  if (!Number.isInteger(ticks) || ticks < 0) throw new Error('--ticks must be a non-negative integer');
  const seedStr = get('seed');
  const hashEvery = get('hash-every');
  const lid = get('lid');
  return {
    recipe,
    ticks,
    perf: argv.includes('--perf'),
    ...(seedStr !== undefined ? { seed: Number(seedStr) } : {}),
    ...(get('commands') !== undefined ? { commands: get('commands')! } : {}),
    ...(hashEvery !== undefined ? { hashEvery: Number(hashEvery) } : {}),
    ...(get('out') !== undefined ? { out: get('out')! } : {}),
    ...(lid === 'open' || lid === 'closed' ? { lid } : {}),
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

const args = parseArgs(process.argv.slice(2));
const registry = loadRegistryFs();
const world = realizeRecipe(registry, args.recipe, {
  ...(args.seed !== undefined ? { seed: args.seed } : {}),
  ...(args.lid ? { transform: (r) => ({ ...r, lid: args.lid! }) } : {}),
});

if (args.commands) {
  const list = JSON.parse(readFileSync(args.commands, 'utf8')) as { atTick: number; commandId: string; payload: CommandPayload }[];
  for (const c of list) queueCommand(world, c.commandId, c.payload, c.atTick);
}

const hashes: { tick: number; hash: string }[] = [{ tick: 0, hash: stateHash(world) }];
const tickMs: number[] = [];
const stageMs = new Array<number>(11).fill(0);
let last = 0;
const hooks = args.perf
  ? {
      afterStage: (s: number) => {
        const now = performance.now();
        stageMs[s]! += now - last;
        last = now;
      },
    }
  : {};

const wall0 = performance.now();
for (let t = 0; t < args.ticks; t++) {
  const t0 = performance.now();
  last = t0;
  step(world, hooks);
  tickMs.push(performance.now() - t0);
  if (args.hashEvery && world.tick % args.hashEvery === 0) hashes.push({ tick: world.tick, hash: stateHash(world) });
}
const wallMs = performance.now() - wall0;

const counts: Record<string, number> = {};
const biomass: Record<string, number> = {};
const c = world.ents.cols;
for (let i = 0; i < world.ents.highWater; i++) {
  if (c.alive[i] !== 1) continue;
  const id = world.species[c.species[i]!]!.id;
  counts[id] = (counts[id] ?? 0) + 1;
  biomass[id] = (biomass[id] ?? 0) + c.B[i]!;
}
const ledger = checkLedger(world);
const sorted = [...tickMs].sort((a, b) => a - b);
const summary = {
  recipe: args.recipe,
  seed: world.seed,
  ticks: world.tick,
  simulatedSeconds: world.tick / 10,
  contentHash: world.content.manifest.contentHash,
  endpointHash: stateHash(world),
  alive: world.ents.count,
  counts,
  biomass: Object.fromEntries(Object.entries(biomass).map(([k, v]) => [k, +v.toFixed(4)])),
  ledger: { ok: ledger.ok, relErrC: ledger.relErr.c, relErrN: ledger.relErr.n, relErrM: ledger.relErr.m },
  events: world.events.totals,
  milestones: world.events.milestones,
  capacityLimitedTicks: world.capacityLimitedTicks,
  genomes: world.genomes.size,
  ...(args.hashEvery ? { hashes } : {}),
  ...(args.perf
    ? {
        perf: {
          wallMs: +wallMs.toFixed(1),
          tickMs: { p50: +percentile(sorted, 0.5).toFixed(3), p95: +percentile(sorted, 0.95).toFixed(3), p99: +percentile(sorted, 0.99).toFixed(3), max: +(sorted.at(-1) ?? 0).toFixed(3) },
          stageMsPerTick: Object.fromEntries(stageMs.slice(1).map((v, k) => [`stage${k + 1}`, +(v / Math.max(1, args.ticks)).toFixed(4)])),
          machine: `${process.platform} ${process.arch} node ${process.version}`,
        },
      }
    : {}),
};
const text = JSON.stringify(summary, null, 2);
if (args.out) writeFileSync(args.out, text + '\n');
console.log(text);
if (!ledger.ok) process.exit(2);
