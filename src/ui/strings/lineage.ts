/**
 * Family tree (lineage panel) and discovery card copy (SPEC §8.5, UX §5.5, D06 "Branch discovery").
 * Every sentence is built from recorded branch, lineage and genome values sent by the worker. A branch
 * is a named family line in this dish, not a verified species; nothing is called better, superior,
 * advanced, perfect, adapted or immune, and a difference is never said to have caused an outcome.
 * Costs quote this game's recorded rules (CT §6.1 tradeoffs, module registry), never a benefit.
 */
import type { BranchTrait } from '@sim/branches';
import type { LineageAnswer, LineageBranchRow, LineageLocus, LineageRecordRow, LineageVariationRow } from '@sim/lineage';
import { TRAIT_BANDS } from '@sim/lineage';
import { MUT_MODULE_GAIN, MUT_MODULE_LOSS, MUT_POLICY_ESTABLISHED, MUT_PREF, MUT_QUANT } from '@sim/mutation';
import { GRID_W } from '@sim/constants';
import { reasonText } from './reasons';

export const LINEAGE_TEXT = {
  title: 'Family tree',
  intro: 'Named branches of each kind of organism in this dish. A branch is a family line that kept an inherited difference, not a new species.',
  empty:
    'No branch has been named yet. A branch gets a name once at least five living descendants share an inherited difference and one of them lives three generations after it first appeared. Evolution here takes time and may not happen at all.',
  allBranches: 'All branches',
  follow: 'Follow lineage',
  stopFollow: 'Stop following',
  compare: 'Compare ancestor',
  hideCompare: 'Hide comparison',
  pin: 'Pin branch',
  unpin: 'Unpin',
  rename: 'Rename',
  renameLabel: 'Branch name (its ID stays visible)',
  renameSave: 'Save name',
  renameReset: 'Use generated name',
  cancel: 'Cancel',
  saveSpecimen: 'Save specimen',
  specimens: 'Specimens',
  specimensNone: 'No specimens saved. A specimen keeps a genome and a summary of its family so you can add it to this dish again later.',
  specimenAdd: 'Add to dish',
  specimenNote:
    'Adding a specimen is a new introduction: it starts its own family line with ordinary starting food, is logged as an addition to the dish, and does not rejoin the branch it came from.',
  specimenCount: 'How many to add',
  traitOverlay: 'Trait overlay',
  traitOff: 'Off',
  traitHint: 'Tints living organisms by their inherited value for one trait. It never changes the dish.',
  pauseOnDiscoveries: 'Pause when a new branch is named',
  close: 'Close',
  members: 'Living members',
  showMember: 'Show one on the dish',
  familyTitle: 'Its founder’s family',
  compareTitle: 'Compared with its ancestor',
  historyCompacted: 'Older individual records were summarized; the branch record is kept.',
  fictional: 'Values are fictional game units (0–100).',
  notVerdict: 'A difference is a record, not a verdict: it does not show that this branch does better or worse.',
  openTree: 'Family tree',
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

function lower(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/** Where a cell is, in dish cells (column, row). */
export function cellText(cell: number): string {
  return `(${cell % GRID_W}, ${Math.floor(cell / GRID_W)})`;
}

/** "Motility investment +10 (50 → 60).", "Gained reserve chamber (E05).", … */
export function traitSentence(row: Pick<LineageBranchRow, 'trait' | 'descriptor' | 'locusValues' | 'module'>, loci: readonly LineageLocus[]): string {
  const trait: BranchTrait | null = row.trait;
  if (!trait) return 'An inherited difference from its ancestor.';
  switch (trait.kind) {
    case 'module': {
      const name = row.module?.name ?? trait.module;
      return trait.gained ? `Gained ${lower(name)} (${trait.module}).` : `Lost ${lower(name)} (${trait.module}).`;
    }
    case 'locus': {
      const name = loci[trait.locus]?.name ?? `Trait ${trait.locus}`;
      const v = row.locusValues ? ` (${row.locusValues.ancestor} → ${row.locusValues.branch})` : '';
      return trait.mean ? `Several small inherited changes; the largest is ${lower(name)} ${signed(trait.delta)}${v}.` : `${name} ${signed(trait.delta)}${v}.`;
    }
    case 'policy':
      return trait.policy === 'weighted' ? 'Mixes its foods by inherited weights instead of a fixed order.' : 'Eats its foods in a fixed order again.';
    case 'weight':
      return `${row.descriptor}: one food’s inherited weight rose by ${Math.round(trait.delta * 100) / 100}.`;
  }
}

/** Recorded tradeoffs of each locus in this game's rules (CT §6.1), for a rise and for a fall. */
const LOCUS_COSTS: readonly (readonly [string, string])[] = [
  ['moves faster; every cell moved costs more energy', 'moves more slowly; moving costs less energy'],
  ['takes in food faster; costs more energy to maintain', 'takes in food more slowly; costs less energy to maintain'],
  ['senses food from farther away; costs more energy to maintain', 'senses food less far away; costs less energy to maintain'],
  ['may split sooner; each split costs more energy', 'waits longer between splits; each split costs less energy'],
  ['prefers more basic water; its preferred range keeps its width', 'prefers more acidic water; its preferred range keeps its width'],
  ['prefers saltier water; fresh water suits it less', 'prefers fresher water; salty water suits it less'],
  ['prefers warmer water', 'prefers cooler water'],
  ['starts resting sooner when food runs short, losing feeding time', 'starts resting later when food runs short'],
];

/** The recorded cost of the difference, in this game's rules (never a benefit claim). */
export function costSentence(row: Pick<LineageBranchRow, 'trait' | 'module'>): string {
  const t = row.trait;
  if (!t) return '';
  switch (t.kind) {
    case 'module': {
      const m = row.module;
      if (!m) return '';
      if (!t.gained) return `Without it, it no longer pays that ability’s upkeep (${m.surchargePerSecond} energy per second).`;
      const extra = m.params.upkeepPerSecond ? ` plus ${m.params.upkeepPerSecond} upkeep` : '';
      return `Game rule: carrying it costs ${m.surchargePerSecond} energy per second${extra}.`;
    }
    case 'locus': {
      const pair = LOCUS_COSTS[t.locus];
      return pair ? `Game rule: it ${t.delta > 0 ? pair[0] : pair[1]}.` : '';
    }
    case 'policy':
      return 'Game rule: its intake follows inherited weights over the foods present.';
    case 'weight':
      return 'Game rule: it takes a larger share of that food when several are present.';
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

/** The recorded mutation descriptor of a birth, in words. */
export function deltaText(r: LineageRecordRow, loci: readonly LineageLocus[]): string {
  if (r.origin !== 0) return r.origin === 2 ? 'present at creation' : 'added to the dish';
  const out: string[] = [];
  if (r.mutFlags & MUT_QUANT && r.mutDelta !== 0) out.push(`inherited ${lower(loci[r.mutLocus]?.name ?? 'a trait')} ${signed(r.mutDelta)}`);
  if (r.mutFlags & MUT_POLICY_ESTABLISHED) out.push('began mixing its foods by weight');
  else if (r.mutFlags & MUT_PREF) out.push('inherited a shifted food preference');
  if (r.mutFlags & MUT_MODULE_GAIN && r.mutModule) out.push(`gained ${r.mutModule}`);
  if (r.mutFlags & MUT_MODULE_LOSS && r.mutModule) out.push(`lost ${r.mutModule}`);
  return out.length > 0 ? out.join(', ') : 'no inherited change';
}

export function variationLine(v: LineageVariationRow): string {
  const lines = v.lines === 1 ? 'one family line' : `${v.lines} family lines`;
  return `${lines}, ${v.living} living, up to ${v.deepest} generation${v.deepest === 1 ? '' : 's'} so far — not yet a branch.`;
}

/** Discovery card body (D06 §Branch discovery: ancestor, difference, costs, where, when, how many, depth). */
export function discoveryLines(row: LineageBranchRow, ans: LineageAnswer): string[] {
  const sp = ans.species[row.species]?.name ?? 'organism';
  const parent = row.parentBranch >= 0 ? ans.branches[row.parentBranch] : null;
  const cost = costSentence(row);
  return [
    `Ancestor: ${parent ? parent.name : `${sp} founders`}.`,
    `Inherited difference: ${traitSentence(row, ans.loci)}`,
    ...(cost ? [cost] : []),
    `First appeared at ${formatSimTime(row.candidateTick)}${row.rootCell >= 0 ? ` near ${cellText(row.rootCell)}` : ''}; named at ${formatSimTime(row.establishedTick)}.`,
    `${row.membersAtEstablish} living descendants across ${row.depthAtEstablish} generations when named; ${row.living} living now.`,
  ];
}

/** "0–39 · Drifter side", "47–53 (near the founders’ 50)", … */
export function bandLabel(band: number, locus: LineageLocus | undefined): string {
  const [lo, hi] = TRAIT_BANDS[band]!;
  if (band === 2) return `${lo}–${hi} (near the founders’ 50)`;
  const word = band <= 1 ? (locus?.low ?? 'low') : (locus?.high ?? 'high');
  return `${lo}–${hi} · ${band === 0 || band === 4 ? 'far ' : ''}${word} side`;
}

export function livingLine(row: LineageBranchRow): string {
  if (row.state === 'extinct') return `No members remain (since ${formatSimTime(row.extinctTick)}); its record is kept.`;
  const sub = row.living - row.alive;
  return `${row.living} living${sub > 0 ? ` (${sub} in branches descended from it)` : ''} · most at once ${row.peak}`;
}

/** Toast when a pinned branch has no members left (UX §5.8: calm, no alarm). */
export function pinnedExtinctText(names: readonly string[]): string {
  return `No members of ${names.join(', ')} remain. Its record stays in the family tree.`;
}
