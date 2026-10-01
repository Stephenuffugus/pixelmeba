/**
 * Inherited differences in words (G2 comprehension M2; SPEC §12.1 "Passed to offspring", UX §5.2
 * "Inherited change"). Every value comes from recorded birth records sent by the worker: the organism's
 * genome, its parent's recorded genome and the recorded genome of the founder its line began with.
 * A difference is stated as a record, never as a cause or a verdict, and a temporary state is never
 * described here.
 */
import type { EntityInspect } from '@worker/protocol';

/** Trait names as the inspector lists them (locus order of the content's loci). */
export const LOCUS_NAMES: readonly string[] = [
  'Motility',
  'Feeding',
  'Sensing',
  'Division',
  'pH preference',
  'Salt preference',
  'Warmth preference',
  'Dormancy',
];

export function locusName(locus: number): string {
  return LOCUS_NAMES[locus] ?? `Trait ${locus + 1}`;
}

type Genome = EntityInspect['genome'];
type InheritedInput = Pick<EntityInspect, 'generation' | 'lociActiveEffective'> & { readonly genome: Genome };

/** The active loci where `values` differ from `other`, as "Division 45 (founder 50)". */
function differences(e: InheritedInput, other: readonly number[], word: 'parent' | 'founder'): string[] {
  const out: string[] = [];
  e.genome.loci.forEach((v, i) => {
    const o = other[i];
    if (!e.lociActiveEffective[i] || o === undefined || o === v) return;
    out.push(`${locusName(i)} ${v} (${word} ${o})`);
  });
  return out;
}

/**
 * The lead sentence of "Passed to offspring": how its inherited traits compare with its parent's and
 * with its line's founder's, both from recorded genomes. Older records may be summarized; then it says so
 * instead of comparing.
 */
export function inheritedLead(e: InheritedInput): string {
  if (e.generation === 0) return 'A founder: it has no parent in this dish.';
  const parent = e.genome.parentLoci ?? null;
  const founder = e.genome.founderLoci ?? null;
  let first: string;
  if (parent === null) {
    first = "Its parent's record was summarized, so it can't be compared with its parent.";
  } else if (!e.genome.changedFromParent) {
    first = 'Inherited from its parent unchanged.';
  } else {
    const d = differences(e, parent, 'parent');
    first =
      d.length > 0
        ? `Inherited a change from its parent: ${d.join('; ')}.`
        : 'Inherited a change from its parent (a food preference or an extra ability; see below).';
  }
  if (founder === null) return first;
  const f = differences(e, founder, 'founder');
  return f.length > 0 ? `${first} Differs from the founder of its line: ${f.join('; ')}.` : `${first} Same trait values as the founder of its line.`;
}

/**
 * The note beside one trait value: "(parent 50 · founder 50)" for each recorded genome it differs from.
 * Without either record it falls back to the difference from 50, every founder's neutral start.
 */
export function locusNote(e: InheritedInput, locus: number): string {
  const v = e.genome.loci[locus]!;
  const parent = e.genome.parentLoci ?? null;
  const founder = e.genome.founderLoci ?? null;
  if (parent === null && founder === null) return v !== 50 ? ` (${v > 50 ? '+' : ''}${v - 50} from the ancestor)` : '';
  const parts: string[] = [];
  const p = parent?.[locus];
  const f = founder?.[locus];
  if (e.generation > 0 && p !== undefined && p !== v) parts.push(`parent ${p}`);
  if (e.generation > 0 && f !== undefined && f !== v) parts.push(`founder ${f}`);
  return parts.length > 0 ? ` (${parts.join(' · ')})` : '';
}
