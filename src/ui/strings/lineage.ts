/**
 * Family tree (lineage panel) and discovery card copy (SPEC §8.5, UX §5.5, D06 "Branch discovery").
 * Every sentence is built from recorded branch, lineage and genome values sent by the worker. A branch
 * is a named family line in this dish, not a verified species; nothing is called better, superior,
 * advanced, perfect, adapted or immune, and a difference is never said to have caused an outcome.
 * "Game rule:" lines compare the two genomes' phenotype profiles (the same function the simulation
 * uses) and quote every recorded module cost; they state only differences that exist in those numbers.
 */
import type { BranchTrait } from '@sim/branches';
import type { LineageAnswer, LineageBranchRow, LineageLocus, LineageModuleChange, LineageProfile, LineageRecordRow, LineageRules, LineageVariationRow, ModuleCostKey } from '@sim/lineage';
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
  traitHint: 'Rings each living organism in the colour of its inherited value for one trait. It never changes the dish.',
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

/** Two values printed with the fewest decimals (from `minDp`, up to 4) that tell them apart. */
function pair(a: number, b: number, minDp: number): [string, string] {
  const f = (v: number, dp: number) => String(Number(v.toFixed(dp)));
  for (let dp = minDp; dp <= 4; dp++) if (f(a, dp) !== f(b, dp)) return [f(a, dp), f(b, dp)];
  return [f(a, 4), f(b, 4)];
}

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) > 1e-9;
}

/** Each module cost parameter in words (CT §7.1); the value is the world's recorded number. */
const COST_WORDS: Readonly<Record<ModuleCostKey, (v: string) => string>> = {
  upkeepPerSecond: (v) => `${v} energy per second upkeep`,
  emitCost: (v) => `${v} energy per second while releasing`,
  glowCost: (v) => `${v} energy per second while glowing`,
  prepareCost: (v) => `${v} energy to prepare to rest`,
  restMaintenance: (v) => `${v} energy per second while resting`,
  wakeCost: (v) => `${v} energy to wake`,
  attachedUpkeep: (v) => `${v} energy per second while attached`,
  moveCostFactor: (v) => `a moving cost with factor ${v}`,
  energyPerCarbon: (v) => `${v} energy per unit of carbon moved`,
  energyPerMineral: (v) => `${v} energy per unit of mineral bound`,
  linkCost: (v) => `${v} energy per link made`,
  perLinkUpkeep: (v) => `${v} energy per second per link`,
  settleCost: (v) => `${v} energy to settle`,
  adultUpkeep: (v) => `${v} energy per second once settled`,
  bondCost: (v) => `${v} energy per bond made`,
  bondUpkeep: (v) => `${v} energy per second per bond`,
  creationCost: (v) => `${v} energy to make a cache`,
};

function joinWords(parts: readonly string[]): string {
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** A per-second rate as charged (up to 4 decimals, no float noise: 0.021, not 0.020999999999999998). */
function rate(v: number): string {
  return String(Number(v.toFixed(4)));
}

/**
 * Every recorded cost of one module: the surcharge its carrier's profile charges while carried (the
 * registry rate after the carrier's inherited multiplier) plus each cost parameter as recorded.
 */
export function moduleCostWords(m: LineageModuleChange): string {
  return joinWords([`${rate(m.surchargePerSecond)} energy per second while carried`, ...m.costs.map((c) => COST_WORDS[c.key](String(c.value)))]);
}

function moduleLine(m: LineageModuleChange): string {
  const name = `${lower(m.name)} (${m.id})`;
  return m.gained ? `Game rule: it carries ${name}, which costs ${moduleCostWords(m)}.` : `Game rule: it does not carry ${name}; its ancestor did, at ${moduleCostWords(m)}.`;
}

function rangeText(r: readonly [number, number], other: readonly [number, number]): [string, string] {
  const [a0, b0] = pair(r[0], other[0], 1);
  const [a1, b1] = pair(r[1], other[1], 1);
  return [`${a0}–${a1}`, `${b0}–${b1}`];
}

function weightsText(p: LineageProfile): string {
  return p.weights ? p.weights.map((w, k) => `${p.foods[k] ?? 'food'} ${w.toFixed(2)}`).join(' / ') : 'a fixed order';
}

/**
 * The "Game rule:" lines of a branch: one per module it carries and its ancestor did not (or the
 * reverse), with every recorded cost, then one per profile number that differs (branch value first,
 * the ancestor's in brackets). Nothing is said about a number that is the same in both profiles.
 */
export function ruleLines(rules: LineageRules | null): string[] {
  if (!rules) return [];
  const a = rules.ancestor;
  const b = rules.branch;
  const out = rules.modules.map(moduleLine);
  const num = (x: number, y: number, minDp: number, text: (v: string, w: string) => string) => {
    if (!differs(x, y)) return;
    const [va, vb] = pair(x, y, minDp);
    out.push(`Game rule: ${text(vb, va)}.`);
  };
  num(a.sensing, b.sensing, 0, (v, w) => `it senses food up to ${v} cells away (ancestor: ${w})`);
  num(a.speed, b.speed, 2, (v, w) => `it moves up to ${v} cells per second (ancestor: ${w})`);
  num(a.moveCostPerCell, b.moveCostPerCell, 2, (v, w) => `each cell it moves costs ${v} energy (ancestor: ${w})`);
  num(a.intake, b.intake, 2, (v, w) => `it takes in at most ${v} carbon per second (ancestor: ${w})`);
  num(a.maintenance, b.maintenance, 2, (v, w) => `its maintenance costs ${v} energy per second (ancestor: ${w})`);
  // Upkeep comes from modules, whose lines above already quote it.
  if (rules.modules.length === 0) num(a.upkeep, b.upkeep, 2, (v, w) => `its extra upkeep is ${v} energy per second (ancestor: ${w})`);
  num(a.minDivisionAge, b.minDivisionAge, 1, (v, w) => `it can split once it is ${v} s old (ancestor: ${w} s)`);
  num(a.divisionCost, b.divisionCost, 1, (v, w) => `each split costs ${v} energy (ancestor: ${w})`);
  num(a.energyCap, b.energyCap, 0, (v, w) => `it can hold at most ${v} energy (ancestor: ${w})`);
  for (const [key, label] of [
    ['ph', 'pH'],
    ['salinity', 'salinity'],
    ['warmth', 'warmth'],
  ] as const) {
    if (!differs(a[key][0], b[key][0]) && !differs(a[key][1], b[key][1])) continue;
    const [vb, va] = rangeText(b[key], a[key]);
    out.push(`Game rule: its preferred ${label} is ${vb} (ancestor: ${va}).`);
  }
  if (a.restAfter !== null && b.restAfter !== null) num(a.restAfter, b.restAfter, 1, (v, w) => `it starts resting after ${v} s without usable food (ancestor: ${w} s)`);
  if (a.policy !== b.policy) {
    out.push(
      b.policy === 'weighted'
        ? `Game rule: it shares its intake by inherited weights (${weightsText(b)}); its ancestor ate its foods in a fixed order.`
        : `Game rule: it eats its foods in a fixed order; its ancestor shared its intake by inherited weights (${weightsText(a)}).`,
    );
  } else if (a.weights && b.weights && a.weights.some((w, k) => differs(w, b.weights![k] ?? 0))) {
    out.push(`Game rule: its food weights are ${weightsText(b)} (ancestor: ${weightsText(a)}).`);
  }
  if (out.length === 0) out.push('Game rule: none of its rule numbers differ from its ancestor’s.');
  return out;
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
  // The ability by its recorded content name, with its id (D-0034 label ruling: "gained Reserve chamber (E05)").
  const ability = r.mutModule ? (r.mutModuleName ? `${r.mutModuleName} (${r.mutModule})` : r.mutModule) : null;
  if (r.mutFlags & MUT_MODULE_GAIN && ability) out.push(`gained ${ability}`);
  if (r.mutFlags & MUT_MODULE_LOSS && ability) out.push(`lost ${ability}`);
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
  return [
    `Ancestor: ${parent ? parent.name : `the ${sp} founder of this line`}.`,
    `Inherited difference: ${traitSentence(row, ans.loci)}`,
    ...ruleLines(row.rules),
    `First appeared at ${formatSimTime(row.candidateTick)}${row.rootCell >= 0 ? ` near ${cellText(row.rootCell)}` : ''}; named at ${formatSimTime(row.establishedTick)}.`,
    `${row.membersAtEstablish} living descendants across ${row.depthAtEstablish} generations when named; ${row.living} living now.`,
  ];
}

/** "0–39 · far Drifter side", "47–53 · middle", … (founders start at 50 or 45–55, so the middle band names only its range). */
export function bandLabel(band: number, locus: LineageLocus | undefined): string {
  const [lo, hi] = TRAIT_BANDS[band]!;
  if (band === 2) return `${lo}–${hi} · middle`;
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
