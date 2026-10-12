/**
 * Custom challenge texts (P4.8 part c; SPEC §13.5; D02 §20; D07 line 107; D09 line 134 "must display those
 * restrictions before Start"). Every number is a typed value from the editor; names are only displayed. No
 * score, no "win", no ranking (D09: personal invitations, never an invented universal score).
 */
import { CHALLENGE_TOOL_GROUPS, type ChallengeInput } from '@persist/notebookChallenges';
import { CHALLENGE_TOOL_LABELS } from '@worker/challenge';
import { turnClock } from './tryDish';

export { CHALLENGE_TOOL_LABELS };

/** Field names the editor offers (a field the dish did not allocate is not offered). */
export const CHALLENGE_FIELD_NAMES: Readonly<Record<string, string>> = {
  sugar: 'Sugar',
  starch: 'Starch',
  broth: 'Broth',
  detritus: 'Debris',
  metabolite: 'Metabolite',
  nutrient: 'Nutrient',
  oxygen: 'Oxygen',
  co2: 'Carbon dioxide',
  acid: 'Acid',
  salt: 'Salt',
};

/** Event types the editor offers (observeEvent), in the order shown. */
export const CHALLENGE_EVENT_NAMES: Readonly<Record<string, string>> = {
  birth: 'A birth (a committed split)',
  death: 'A death',
  capture: 'A capture',
  mutation: 'A mutation',
  firstIntake: 'A first meal',
  conversion: 'Food converted by an enzyme',
};

export const CHALLENGE_ENZYME_NAMES: Readonly<Record<string, string>> = { starch: 'Starch', oil: 'Oil', protein: 'Protein' };

export const CHALLENGE_REGION_NAMES: Readonly<Record<string, string>> = {
  dish: 'The whole dish',
  topLeft: 'Top-left quarter',
  topRight: 'Top-right quarter',
  bottomLeft: 'Bottom-left quarter',
  bottomRight: 'Bottom-right quarter',
};

export const CHALLENGE_TYPE_NAMES = {
  keepSpeciesAlive: 'Keep a kind alive',
  biomassThreshold: 'Reach a biomass',
  transferAcrossGate: 'Move material across a gate',
  observeEvent: 'See something happen',
  fieldInRange: 'Keep a level in a range',
} as const;

export const CHALLENGE_TEXT = {
  moreMake: 'Make a challenge…',
  moreStart: (name: string) => `Start challenge: ${name}`,
  moreExport: 'Export challenge',
  moreLeave: 'Leave challenge…',
  editorTitle: 'Make a challenge',
  editorIntro:
    'This moment is kept as the challenge’s starting point. Choose one goal with numbers, the tools a player may use and an optional action limit. Nothing here runs code.',
  nameLabel: 'Challenge name',
  defaultName: 'My challenge',
  typeLegend: 'Goal',
  noGate: 'This dish has no gate to measure.',
  speciesLabel: 'Kind',
  anyKind: 'Any kind',
  allLife: 'All living things',
  durationLabel: 'For how many seconds of dish time',
  thresholdLabel: 'Biomass to reach (game units)',
  fieldLabel: 'Level',
  minLabel: 'At least',
  maxLabel: 'At most',
  regionLegend: 'Where',
  eventLabel: 'What to see',
  enzymeLabel: 'Enzyme',
  toolsLegend: 'Tools a player may use',
  budgetLabel: 'Action limit (optional, 1–99)',
  budgetHint: 'Leave empty for no limit. Each successful Add Life, Feed, Habitat, Sample or Clean water action counts once; Lid and Evolution settings never count.',
  lengthLegend: 'Turn length',
  lengthOption: (seconds: number) => `${turnClock(seconds * 10)} of dish time`,
  summaryHeading: 'Before Start, players see',
  save: 'Save challenge',
  saving: 'Saving…',
  cancel: 'Cancel',
  saved: (name: string) => `Challenge “${name}” saved. Start it from More.`,
  saveFailed: (why: string) => `The challenge was not saved: ${why}`,

  startTitle: (name: string) => `Challenge: ${name}`,
  chooseLabel: 'Challenge',
  checking: 'Checking this dish…',
  start: 'Start challenge',
  starting: 'Starting…',
  started: (name: string, tick: number) => `Challenge “${name}” is ready, paused at ${turnClock(tick)}. Press Run to play it.`,
  startFailed: (why: string) => `The challenge did not start: ${why}`,
  exported: (filename: string) => `Exported ${filename}.`,
  exportFailed: (why: string) => `The challenge was not exported: ${why}`,
  /** D-0096: the share sheet was closed without saving the file (the Android app). */
  exportCancelled: 'The challenge was not exported. Nothing changed.',

  leaveTitle: 'Leave challenge',
  leaveIntro: 'The challenge turn stays as it is. A copy of this moment opens with every tool and no action limit.',
  openCopy: 'Open an unrestricted copy',
  copyOpened: 'This copy has no challenge limits. The challenge turn is unchanged.',
  copyFailed: (why: string) => `No copy was opened; nothing was changed: ${why}`,
  badgePrefix: 'Challenge',
} as const;

/** "Allowed: Add Life, Feed. Up to 10 actions. Inspecting and looking are always free. These limits apply only inside this challenge." */
export function restrictionsSummary(c: Pick<ChallengeInput, 'allowedTools' | 'commandBudget'>): string {
  const tools = CHALLENGE_TOOL_GROUPS.filter((t) => c.allowedTools.includes(t));
  const allowed =
    tools.length === CHALLENGE_TOOL_GROUPS.length ? 'Allowed: every tool.' : tools.length === 0 ? 'Allowed: no tools, only looking.' : `Allowed: ${tools.map((t) => CHALLENGE_TOOL_LABELS[t]).join(', ')}.`;
  // Fix round 1 (D07 "Configure and inspect are free"): when a limit is set and the Lid or Evolution settings are allowed, say they never use an action.
  const configure = tools.filter((t) => t === 'lid' || t === 'evolution').map((t) => CHALLENGE_TOOL_LABELS[t]);
  const free = c.commandBudget !== null && configure.length > 0 ? ` Changing the ${configure.join(' or ')} never uses an action.` : '';
  const budget = (c.commandBudget === null ? 'No action limit.' : `Up to ${c.commandBudget} action${c.commandBudget === 1 ? '' : 's'}.`) + free;
  return `${allowed} ${budget} Inspecting and looking are always free. These limits apply only inside this challenge.`;
}

/** The goal in words, from typed values only (`speciesName` names a species id, e.g. B01 → "Sprinters"). */
export function objectiveLine(c: Pick<ChallengeInput, 'objective' | 'region'>, speciesName: (id: string) => string): string {
  const o = c.objective;
  const p = o.params;
  const sp = (v: unknown) => (typeof v === 'string' ? speciesName(v) : null);
  const secs = o.durationSeconds ?? 0;
  switch (o.type) {
    case 'keepSpeciesAlive':
      return `Keep at least one ${sp(p.species) ?? 'of them'} alive for ${secs} s of dish time.`;
    case 'biomassThreshold':
      return `Reach a living biomass of ${String(p.threshold)}${sp(p.species) ? ` (${sp(p.species)})` : ' (all living things)'}.`;
    case 'transferAcrossGate':
      return `Move ${String(p.threshold)} ${CHALLENGE_FIELD_NAMES[String(p.field)] ?? String(p.field)} across gate ${String(p.gate)}.`;
    case 'observeEvent': {
      if (p.event === 'conversion') return `See ${CHALLENGE_ENZYME_NAMES[String(p.enzyme)]?.toLowerCase() ?? 'food'} converted by an enzyme.`;
      const what = CHALLENGE_EVENT_NAMES[String(p.event)] ?? String(p.event);
      return `See this happen: ${what.charAt(0).toLowerCase()}${what.slice(1)}${sp(p.species) ? ` (${sp(p.species)})` : ''}.`;
    }
    case 'fieldInRange': {
      const where = CHALLENGE_REGION_NAMES[c.region.kind === 'dish' ? 'dish' : c.region.id]!.toLowerCase();
      return `Keep ${(CHALLENGE_FIELD_NAMES[String(p.field)] ?? String(p.field)).toLowerCase()} between ${String(p.min)} and ${String(p.max)} in ${where} for ${secs} s of dish time.`;
    }
  }
}

/** The turn line. */
export function turnLine(horizonSeconds: number): string {
  return `Each turn runs for ${turnClock(horizonSeconds * 10)} of dish time and starts paused.`;
}
