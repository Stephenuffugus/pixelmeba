/**
 * Lineage panel and discovery card copy (SPEC §8.5, UX §5.5). Every sentence is built from recorded
 * branch, lineage and genome values sent by the worker. A branch is a named family line in this
 * dish, not a verified species; nothing is called better, superior, advanced, perfect, adapted or
 * immune, and a difference is never said to have caused an outcome.
 */
import type { BranchTrait } from '@sim/branches';
import type { LineageAnswer, LineageBranchRow, LineageLocus, LineageRecordRow, LineageVariationRow } from '@sim/lineage';
import { TRAIT_BANDS } from '@sim/lineage';
import { MUT_MODULE_GAIN, MUT_MODULE_LOSS, MUT_POLICY_ESTABLISHED, MUT_PREF, MUT_QUANT } from '@sim/mutation';
import { reasonText } from './reasons';

export const LINEAGE_TEXT = {
  title: 'Family tree',
  intro: 'Named branches of each kind of organism in this dish. A branch is a family line with an inherited difference, not a new species.',
  empty:
    'No branch has been named yet. A branch gets a name once at least five living descendants share an inherited difference, three generations after it first appeared. Evolution here takes time and may not happen at all.',
  allBranches: 'All branches',
  follow: 'Follow lineage',
  stopFollow: 'Stop following',
  compare: 'Compare ancestor',
  pin: 'Pin branch',
  unpin: 'Unpin',
  rename: 'Rename',
  renameLabel: 'Branch name (the ID stays visible)',
  renameSave: 'Save name',
  renameReset: 'Use generated name',
  cancel: 'Cancel',
  saveSpecimen: 'Save specimen',
  specimens: 'Specimens',
  specimensNone: 'No specimens saved. A specimen keeps a genome and its family history so you can add it again later.',
  specimenAdd: 'Add to dish',
  specimenNote: 'Adding a specimen is a new introduction: it starts its own family line, with ordinary starting food, and is logged as an addition to the dish.',
  traitOverlay: 'Trait overlay',
  traitOff: 'Off',
  traitHint: 'Colours living organisms by their inherited value for one trait. It never changes the dish.',
  pauseOnDiscoveries: 'Pause when a new branch is named',
  close: 'Close',
  members: 'Living members',
  showMember: 'Show one on the dish',
  familyTitle: 'Its founder’s family',
  compareTitle: 'Compared with its ancestor',
  historyCompacted: 'Older individual records were summarized; the branch record is kept.',
  fictional: 'Values are fictional game units (0–100).',
} as const;

export function formatSimTime(tick: number): string {
  const s = Math.floor(Math.max(0, tick) / 10);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

export function stateLabel(row: Pick<LineageBranchRow, 'state'>): string {
  return row.state === 'extinct' ? 'Branch extinct' : 'Branch established';
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** "Motility investment +10 (50 → 60).", "Gained Reserve chamber.", … (descriptor = the name word). */
export function traitSentence(trait: BranchTrait | null, descriptor: string, loci: readonly LineageLocus[], values?: { readonly ancestor: number; readonly branch: number }): string {
  if (!trait) return 'An inherited difference from its ancestor.';
  switch (trait.kind) {
    case 'module':
      return trait.gained ? `Gained ${descriptor.toLowerCase()} (${trait.module}).` : `Lost ${trait.module} (${descriptor.toLowerCase()}).`;
    case 'locus': {
      const name = loci[trait.locus]?.name ?? `Trait ${trait.locus}`;
      const v = values ? ` (${values.ancestor} → ${values.branch})` : '';
      return trait.mean ? `Several small inherited changes, the largest in ${name.toLowerCase()} ${signed(trait.delta)}${v}.` : `${name} ${signed(trait.delta)}${v}.`;
    }
    case 'policy':
      return trait.policy === 'weighted' ? 'Mixes its foods by inherited weights instead of a fixed order.' : 'Eats its foods in a fixed order again.';
    case 'weight':
      return `${descriptor}: one food's inherited weight rose by ${Math.round(trait.delta * 100) / 100}.`;
  }
}

/** One line per family record: who, when, and what it inherited. */
export function recordLine(r: LineageRecordRow, role: string, loci: readonly LineageLocus[]): string {
  const parts = [`${role} #${r.birthId}`, `born ${formatSimTime(r.birthTick)}`, `generation ${r.generation}`];
  const change = deltaText(r, loci);
  if (change) parts.push(change);
  if (r.status === 'divided') parts.push(`split at ${formatSimTime(r.endTick)}`);
  else if (r.status === 'died') parts.push(`died at ${formatSimTime(r.endTick)} (${reasonText(r.deathCause, 'explore').replace(/\.$/, '').toLowerCase()})`);
  else parts.push('alive');
  return parts.join(' · ');
}

/** The recorded mutation descriptor of a birth, in words ('' when it inherited no change). */
export function deltaText(r: LineageRecordRow, loci: readonly LineageLocus[]): string {
  if (r.origin !== 0) return r.origin === 2 ? 'present at creation' : 'added to the dish';
  const out: string[] = [];
  if (r.mutFlags & MUT_QUANT && r.mutDelta !== 0) out.push(`inherited ${(loci[r.mutLocus]?.name ?? 'a trait').toLowerCase()} ${signed(r.mutDelta)}`);
  if (r.mutFlags & MUT_POLICY_ESTABLISHED) out.push('began mixing its foods by weight');
  else if (r.mutFlags & MUT_PREF) out.push('inherited a shifted food preference');
  if (r.mutFlags & MUT_MODULE_GAIN && r.mutModule) out.push(`gained ${r.mutModule}`);
  if (r.mutFlags & MUT_MODULE_LOSS && r.mutModule) out.push(`lost ${r.mutModule}`);
  return out.length > 0 ? out.join(', ') : 'no inherited change';
}

export function variationLine(v: LineageVariationRow): string {
  const lines = v.lines === 1 ? 'one family line' : `${v.lines} family lines`;
  return `Variation observed: ${lines}, ${v.living} living, up to ${v.deepest} generation${v.deepest === 1 ? '' : 's'} so far — not yet a branch.`;
}

/** Discovery card body lines (D06 §Branch discovery: ancestor, difference, where, when, how many). */
export function discoveryLines(row: LineageBranchRow, ans: LineageAnswer): string[] {
  const sp = ans.species[row.species]?.name ?? 'organism';
  const parent = row.parentBranch >= 0 ? ans.branches[row.parentBranch] : null;
  const lines = [
    `Ancestor: ${parent ? parent.name : `${sp} founders`}.`,
    `Inherited difference: ${traitSentence(row.trait, row.descriptor, ans.loci)}`,
    `First appeared at ${formatSimTime(row.candidateTick)}${row.rootCell >= 0 ? ` near (${row.rootCell % 128}, ${Math.floor(row.rootCell / 128)})` : ''}; named at ${formatSimTime(row.establishedTick)}.`,
    `${row.membersAtEstablish} living descendants across ${row.depthAtEstablish} generations when named; ${row.living} living now.`,
  ];
  return lines;
}

export function bandLabel(band: number, locus: LineageLocus | undefined): string {
  const [lo, hi] = TRAIT_BANDS[band]!;
  const word = band <= 1 ? (locus?.low ?? 'low') : band >= 3 ? (locus?.high ?? 'high') : 'near the founders’ 50';
  return `${lo}–${hi}${band === 2 ? ` (${word})` : ` · ${word} side`}`;
}

export function livingLine(row: LineageBranchRow): string {
  if (row.state === 'extinct') return `No members remain (since ${formatSimTime(row.extinctTick)}); its record is kept.`;
  const sub = row.living - row.alive;
  return `${row.living} living${sub > 0 ? ` (${sub} in branches descended from it)` : ''} · largest ${row.peak}`;
}
