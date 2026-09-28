/**
 * What if? copy (UX §3.4, D09 §3–§5, SPEC §13.3). Plain words first; numbers only under Details.
 * Every sentence is built from recorded content (the variant record, the source recipe) or from what
 * the worker reports it did. A What if? dish is the authored recipe with exactly one change and the
 * same seed; nothing here promises an outcome, and nothing calls a result better or worse.
 */
import type { SlotSummary, WhatIfKept, WhatIfPlan } from '@worker/protocol';
import type { VariantChange, VariantPreview, VariantRecord } from '@sim/variants';

export const WHATIF_TEXT = {
  title: 'What if?',
  /** The secondary link under Garden on the Play shelf (UX §2.2). */
  link: 'What if?',
  linkHint: 'Try the Garden with one change.',
  moreItem: 'What if? Start this recipe with one change',
  loading: 'Loading ideas…',
  close: 'Close',
  intro: (source: string) =>
    `Each idea starts a separate new dish: the ${source} as designed, with the same seed and the same starting life, and exactly one change. What happens next is not decided in advance.`,
  chooseLegend: 'Choose one change',
  noChoices: 'This version of Pixelmeba has no What if? ideas for this recipe.',
  question: 'Question',
  thisDish: 'This dish',
  thisDishIntro: (title: string, source: string) =>
    `Made from the idea “${title}”: the ${source} with one change.`,
  again: 'Again',
  againHint:
    'Start this same idea again from its first moment. The start is identical; what happens after may differ once you act.',
  another: 'Another idea',
  anotherHint: (title: string, difference: string) => `Next: “${title}”. ${difference}`,
  noAnother: 'There is no other idea for this recipe.',
  details: 'Details',
  hideDetails: 'Hide details',
  copy: 'Copy',
  copied: 'Copied.',
  copyFailed: 'Copying is not available here. Select the text to copy it.',
  start: (title: string) => `Start “${title}”`,
  startNote: 'Opens paused as a separate dish.',
  pending: (title: string) => `Waiting to start: “${title}”.`,
  starting: 'Starting…',
  before: 'Before',
  after: 'After',
  previewLabel: 'Before and after',
  cancel: 'Cancel',
  cancelled: 'Nothing was changed.',
  // All ten slots used (UX §3.4; D09 §3 "offer export or a deliberate replacement; cancel loses nothing").
  fullTitle: 'All ten save slots are used',
  fullBody: (name: string) =>
    `Keep “${name}” before the new dish opens: export it as a file, or choose a saved dish to replace. Cancel changes nothing.`,
  exportIt: 'Export it as a file',
  exporting: 'Exporting…',
  exported: (file: string) => `Exported ${file}. Keep that file to open this dish again.`,
  exportFailed: (why: string) => `Export failed, so nothing was started: ${why}`,
  startAfterExport: 'Start the new dish',
  replaceIt: 'Replace a saved dish…',
  replaceLegend: 'Choose the save to replace',
  replaceSlot: (n: number, s: SlotSummary | undefined) =>
    s ? `Slot ${n}: ${s.name} · ${clock(s.tick)}` : `Slot ${n}: empty`,
  replaceConfirm: (old: string, n: number, name: string) =>
    `“${old}” in Slot ${n} will be replaced by “${name}”.`,
  replaceStart: 'Replace and start',
  unavailableBody: (name: string) =>
    `This device cannot keep saves. Export “${name}” as a file first, or cancel.`,
} as const;

/** Simulated time as m:ss. */
export function clock(tick: number): string {
  const s = Math.floor(tick / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function slotNumber(slotId: string): number {
  const m = /^slot(\d+)$/.exec(slotId);
  return m ? Number(m[1]) : 0;
}

/** How the current dish will be kept if Start is pressed (shown before Start; UX §3.4). */
export function planText(plan: WhatIfPlan): string {
  switch (plan.kind) {
    case 'none':
      return 'No dish is open, so there is nothing to save first.';
    case 'unchanged':
      return `“${plan.name}” has not changed since it started, so it is not saved again: starting that idea again rebuilds it exactly.`;
    case 'slot':
      return plan.own
        ? `Your current dish “${plan.name}” will first be saved to Slot ${slotNumber(plan.slotId)}, where it was saved before, and to Continue.`
        : `Your current dish “${plan.name}” will first be saved to Slot ${slotNumber(plan.slotId)} (empty now) and to Continue.`;
    case 'full':
      return `All ten save slots are used. Before the new dish opens you will choose how to keep “${plan.name}”.`;
    case 'unavailable':
      return `This device cannot keep saves. You will be asked to export “${plan.name}” as a file first.`;
  }
}

/** What happened to the previous dish, for the toast after a start. */
export function startedText(title: string, kept: WhatIfKept, again: boolean): string {
  const opened = again
    ? `Started “${title}” again from the same start — paused.`
    : `Started “${title}” — paused. Press Run when you are ready.`;
  let keptLine = '';
  if (kept.kind === 'slot' && kept.slot) {
    keptLine = kept.replaced
      ? `“${kept.name ?? 'Your dish'}” replaced “${kept.replaced}” in Slot ${slotNumber(kept.slot.slotId)}.`
      : `“${kept.name ?? 'Your dish'}” was saved to Slot ${slotNumber(kept.slot.slotId)}.`;
  } else if (kept.kind === 'exported') {
    keptLine = `“${kept.name ?? 'Your dish'}” is in the file you exported.`;
  }
  const autosaveLine =
    (kept.kind === 'slot' || kept.kind === 'exported') && !kept.autosaved
      ? ' Continue could not be updated.'
      : '';
  return `${keptLine ? `${keptLine} ` : ''}${opened}${autosaveLine}`;
}

/** UX §3.3 mode labels, wherever a world is described. */
export function evolutionLabel(preset: string): string {
  if (preset === 'accelerated') return 'Accelerated Evolution (game setting, not realism)';
  if (preset === 'fixed') return 'Fixed Traits';
  return 'Standard Evolution';
}

export function founderLabel(mode: string): string {
  if (mode === 'varied') return 'Varied founders';
  if (mode === 'diverse') return 'Diverse founders';
  return 'Identical founders';
}

function amount(v: number): string {
  return v.toFixed(2);
}

function cellText(c: readonly [number, number]): string {
  return `(${c[0]}, ${c[1]})`;
}

function amountsText(a: Readonly<Partial<Record<string, number>>>): string {
  return Object.entries(a)
    .map(([k, v]) => `${amount(v ?? 0)} ${k}`)
    .join(', ');
}

/** The patch's name for sentences ("the sugar patch"). */
export function patchName(change: VariantChange): string {
  if (change.kind === 'unchanged') return 'the dish';
  return change.patchLabel ? `the ${change.patchLabel.toLowerCase()}` : `field patch ${change.patchIndex}`;
}

/** The one change with its values (Details). All amounts are fictional game units. */
export function changeValues(change: VariantChange): string {
  switch (change.kind) {
    case 'unchanged':
      return 'Nothing is changed.';
    case 'amount':
      return `${capital(patchName(change))}: ${amount(change.before)} → ${amount(change.after)} ${change.field} per cell, over ${change.cells.length} cells (radius ${change.radius}, centre ${cellText(change.center)}). Everything else is as designed.`;
    case 'moved':
      return `${capital(patchName(change))}: moved from ${cellText(change.from)} to ${cellText(change.to)}; still ${amountsText(change.amounts)} per cell, radius ${change.radius}, ${change.newCells.length} cells before and after. Everything else is as designed.`;
  }
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The caption under a preview panel; an amount change also names its direction in words, not by fill alone. */
export function previewCaption(change: VariantChange, side: 'before' | 'after'): string {
  if (side === 'before') return WHATIF_TEXT.before;
  if (change.kind === 'amount')
    return `${WHATIF_TEXT.after}: ${change.direction === 'less' ? 'less' : 'more'} ${change.field}`;
  return WHATIF_TEXT.after;
}

/** Accessible descriptions of the two preview panels. */
export function previewAlt(change: VariantChange, side: 'before' | 'after'): string {
  const p = patchName(change);
  if (change.kind === 'unchanged')
    return side === 'before' ? 'Before: the dish as designed.' : 'After: the same dish, unchanged.';
  if (change.kind === 'amount') {
    return side === 'before'
      ? `Before: ${p} as designed.`
      : `After: ${p} in the same place with ${change.direction === 'less' ? 'less' : 'more'} ${change.field}.`;
  }
  return side === 'before'
    ? `Before: ${p} where it usually starts.`
    : `After: ${p} starts in a new place; a dashed outline marks where it was.`;
}

export interface DetailRow {
  readonly term: string;
  readonly value: string;
}

/**
 * Details for a choice: values, seed, versions, checksums (UX §3.4), and the world-to-be's mode and
 * registry labels (UX §3.3 "wherever a world is described"), the same rows as provenanceDetails.
 */
export function choiceDetails(
  p: VariantPreview,
  sums: { sourceChecksum: string; variantChecksum: string },
  registryLabel: string | null,
): DetailRow[] {
  const v = p.versions;
  return [
    { term: 'Change', value: changeValues(p.change) },
    { term: 'Starts from', value: `${p.sourceName} (${p.sourceId}, revision ${p.sourceRevision})` },
    { term: 'Seed', value: String(p.seed) },
    { term: 'Evolution', value: `${evolutionLabel(p.mutationPreset)} · ${founderLabel(p.founderMode)}` },
    ...(registryLabel !== null ? [{ term: 'Registry', value: registryLabel }] : []),
    {
      term: 'Versions',
      value: `simulation ${v.simulationVersion} · evolution rules ${v.evolutionRulesVersion} · module registry ${v.moduleRegistryVersion} · phenotype mapping ${v.phenotypeMappingVersion} · content ${v.contentVersion}`,
    },
    { term: 'Content hash', value: v.contentHash },
    { term: 'Recipe checksum', value: sums.sourceChecksum },
    { term: 'Idea checksum', value: sums.variantChecksum },
  ];
}

/** Provenance of a What if? dish (D09 §4 "Identity"): what its save and export record. */
export function provenanceDetails(
  r: VariantRecord,
  sourceName: string,
  dish: {
    readonly mutationPreset: string;
    readonly founderMode: string;
    readonly manifestLabel: string;
  } | null,
): DetailRow[] {
  return [
    { term: 'Idea', value: `${r.title} (${r.variantId}, revision ${r.variantRevision})` },
    { term: 'Made from', value: `${sourceName} (${r.sourceId}, revision ${r.sourceRevision})` },
    { term: 'Seed', value: String(r.seed) },
    ...(dish
      ? [
          {
            term: 'Evolution',
            value: `${evolutionLabel(dish.mutationPreset)} · ${founderLabel(dish.founderMode)}`,
          },
          { term: 'Registry', value: dish.manifestLabel },
        ]
      : []),
    { term: 'Recipe checksum', value: r.sourceChecksum },
    { term: 'Idea checksum', value: r.variantChecksum },
    { term: 'Start state hash', value: r.initialStateHash },
    {
      term: 'Recorded with',
      value: `simulation ${r.simulationVersion} · evolution rules ${r.evolutionRulesVersion} · content ${r.contentVersion}`,
    },
    { term: 'Content hash', value: r.contentHash },
  ];
}

export function identityLine(r: {
  readonly variantId: string;
  readonly variantRevision: number;
  readonly seed: number;
}): string {
  return `${r.variantId} / rev ${r.variantRevision} / seed ${r.seed}`;
}
