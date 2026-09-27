/**
 * Genomes (SPEC §8.1). Immutable, deduplicated, content-addressed.
 * The table only grows during a run; compaction (P1.2) rebuilds it from referenced genomes.
 */
import { StateHasher } from './hash';

export const LOCUS_COUNT = 8;
export const L_MOTILITY = 0;
export const L_FEEDING = 1;
export const L_SENSING = 2;
export const L_DIVISION = 3;
export const L_PH = 4;
export const L_SALINITY = 5;
export const L_WARMTH = 6;
export const L_DORMANCY = 7;

export type FeedingPolicy = 'ordered' | 'weighted';

export interface DevFields {
  readonly sizeLocus: number;
  readonly bodyForm: 'baseline' | 'streamlined';
  readonly strategy: 'ancestral' | 'resource_follower' | 'space_finder' | 'shelter_keeper' | 'night_forager' | 'trail_follower';
  readonly nightLightThreshold: number;
  readonly colonyRole: 'generalist' | 'forager' | 'builder' | 'keeper' | 'breeder';
  /** Bit set of disabled native features (0 = all enabled). */
  readonly nativeDisabled: number;
}

export const NEUTRAL_DEV: DevFields = Object.freeze({
  sizeLocus: 50,
  bodyForm: 'baseline',
  strategy: 'ancestral',
  nightLightThreshold: 25,
  colonyRole: 'generalist',
  nativeDisabled: 0,
});

export interface Genome {
  readonly ancestor: string;
  readonly loci: readonly number[];
  readonly policy: FeedingPolicy;
  /** Weights over the ancestor's supported foods (template order); null while policy is ordered. */
  readonly weights: readonly number[] | null;
  /** Supplementary modules, sorted ascending. */
  readonly modules: readonly string[];
  readonly dev: DevFields;
  /** Content-addressed identity (16 hex chars). */
  readonly id: string;
}

export type GenomeInput = Omit<Genome, 'id'>;

export function genomeKey(g: GenomeInput): string {
  const w = g.weights === null ? 'o' : g.weights.map((x) => x.toFixed(12)).join(',');
  const d = g.dev;
  return [
    g.ancestor,
    g.loci.join(','),
    g.policy,
    w,
    g.modules.join('+'),
    d.sizeLocus,
    d.bodyForm,
    d.strategy,
    d.nightLightThreshold,
    d.colonyRole,
    d.nativeDisabled,
  ].join('|');
}

export function genomeIdFromKey(key: string): string {
  return new StateHasher().string(key).hex();
}

/** Short uppercase display ID used in branch names, e.g. "7C2". */
export function shortGenomeId(id: string): string {
  return id.slice(0, 3).toUpperCase();
}

export function neutralGenome(ancestor: string): GenomeInput {
  return {
    ancestor,
    loci: [50, 50, 50, 50, 50, 50, 50, 50],
    policy: 'ordered',
    weights: null,
    modules: [],
    dev: NEUTRAL_DEV,
  };
}

function validateGenome(g: GenomeInput): void {
  if (g.loci.length !== LOCUS_COUNT) throw new Error('genome: 8 loci required');
  for (const l of g.loci) if (!Number.isInteger(l) || l < 0 || l > 100) throw new Error(`genome: locus ${l} out of 0..100`);
  if (g.modules.length > 3) throw new Error('genome: at most three supplementary modules');
  for (let i = 1; i < g.modules.length; i++) if (g.modules[i - 1]! >= g.modules[i]!) throw new Error('genome: modules must be sorted and unique');
  if (g.policy === 'ordered' && g.weights !== null) throw new Error('genome: ordered policy has no weights');
  if (g.policy === 'weighted') {
    if (g.weights === null || g.weights.length === 0) throw new Error('genome: weighted policy needs weights');
    let sum = 0;
    for (const w of g.weights) {
      if (!(w >= 0) || !Number.isFinite(w)) throw new Error('genome: weights must be finite and ≥ 0');
      sum += w;
    }
    if (Math.abs(sum - 1) > 1e-9 && sum !== 0) throw new Error(`genome: weights must sum to 1 (got ${sum})`);
  }
}

export class GenomeTable {
  readonly list: Genome[] = [];
  // eslint-disable-next-line no-restricted-syntax -- lookup only, never iterated
  private readonly byKey = new Map<string, number>();

  intern(input: GenomeInput): number {
    validateGenome(input);
    const key = genomeKey(input);
    const found = this.byKey.get(key);
    if (found !== undefined) return found;
    const g: Genome = Object.freeze({
      ancestor: input.ancestor,
      loci: Object.freeze([...input.loci]),
      policy: input.policy,
      weights: input.weights === null ? null : Object.freeze([...input.weights]),
      modules: Object.freeze([...input.modules]),
      dev: Object.freeze({ ...input.dev }),
      id: genomeIdFromKey(key),
    });
    const idx = this.list.length;
    this.list.push(g);
    this.byKey.set(key, idx);
    return idx;
  }

  get(idx: number): Genome {
    const g = this.list[idx];
    if (g === undefined) throw new Error(`genome index ${idx} not found`);
    return g;
  }

  get size(): number {
    return this.list.length;
  }
}
