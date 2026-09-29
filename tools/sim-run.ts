/**
 * npm run sim:run -- --recipe FIRST_DISH_V1 --seed 104729 --ticks 6000
 *   [--commands file.json] [--hash-every K] [--perf] [--out file.json] [--lid open|closed]
 *   [--preset standard|accelerated|fixed]
 *
 * Headless run of a recipe: prints a JSON summary with populations, ledger error, event totals,
 * milestones and the endpoint state hash. --perf adds tick timing percentiles, a stage breakdown,
 * the living-agent count (start, end, peak, mean over ticks), the 1-minute load average and the
 * process CPU time over the tick loop (wall time on a shared machine also counts waiting for a CPU;
 * CPU time does not). --preset realizes the recipe with that
 * mutation preset (the recipe's own when omitted), as tools/sim-tune.ts does.
 * The commands file is an array of { atTick, commandId, payload } entries (the CommandPayload union).
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { loadavg } from 'node:os';
import { performance } from 'node:perf_hooks';
import { checkLedger } from '../src/sim/ledger';
import { realizeRecipe } from '../src/sim/recipes';
import { stateHash } from '../src/sim/serialize';
import { step } from '../src/sim/tick';
import { queueCommand, type CommandPayload } from '../src/sim/commands';
import { isMutationPreset } from '../src/sim/mutation';
import type { MutationPreset } from '../src/sim/world';
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
  preset?: MutationPreset;
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
  const preset = get('preset');
  if (preset !== undefined && !isMutationPreset(preset)) throw new Error('--preset must be standard, accelerated or fixed');
  return {
    recipe,
    ticks,
    perf: argv.includes('--perf'),
    ...(seedStr !== undefined ? { seed: Number(seedStr) } : {}),
    ...(get('commands') !== undefined ? { commands: get('commands')! } : {}),
    ...(hashEvery !== undefined ? { hashEvery: Number(hashEvery) } : {}),
    ...(get('out') !== undefined ? { out: get('out')! } : {}),
    ...(lid === 'open' || lid === 'closed' ? { lid } : {}),
    ...(preset !== undefined && isMutationPreset(preset) ? { preset } : {}),
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
  ...(args.lid || args.preset
    ? {
        transform: (r) => ({
          ...r,
          ...(args.lid ? { lid: args.lid } : {}),
          ...(args.preset ? { mutationPreset: args.preset } : {}),
        }),
      }
    : {}),
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

// Living agents after every tick (read between ticks; observation only).
const agentsStart = world.ents.count;
let agentsPeak = agentsStart;
let agentsSum = 0;
const load0 = loadavg()[0]!;
// Process CPU time over the tick loop: on a shared machine wall time also counts waiting for a CPU.
const cpu0 = process.cpuUsage();
const wall0 = performance.now();
for (let t = 0; t < args.ticks; t++) {
  const t0 = performance.now();
  last = t0;
  step(world, hooks);
  tickMs.push(performance.now() - t0);
  agentsSum += world.ents.count;
  if (world.ents.count > agentsPeak) agentsPeak = world.ents.count;
  if (args.hashEvery && world.tick % args.hashEvery === 0) hashes.push({ tick: world.tick, hash: stateHash(world) });
}
const wallMs = performance.now() - wall0;
const cpu = process.cpuUsage(cpu0);
const load1 = loadavg()[0]!;

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
  mutationPreset: world.settings.mutationPreset,
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
          agents: { start: agentsStart, end: world.ents.count, peak: agentsPeak, mean: +(agentsSum / Math.max(1, args.ticks)).toFixed(1) },
          loadAverage1m: { start: +load0.toFixed(2), end: +load1.toFixed(2) },
          // User + system CPU time of this process (all its threads, GC included) over the tick loop.
          cpu: {
            userMs: +(cpu.user / 1000).toFixed(1),
            systemMs: +(cpu.system / 1000).toFixed(1),
            msPerTick: +((cpu.user + cpu.system) / 1000 / Math.max(1, args.ticks)).toFixed(3),
            shareOfWall: +((cpu.user + cpu.system) / 1000 / Math.max(1e-9, wallMs)).toFixed(3),
          },
        },
      }
    : {}),
};
const text = JSON.stringify(summary, null, 2);
if (args.out) writeFileSync(args.out, text + '\n');
console.log(text);
if (!ledger.ok) process.exit(2);
