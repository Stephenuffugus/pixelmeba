/**
 * Story card copy (P4.2; SPEC §12.7, §12.9; UX §5.9; D08 §07). Every caption is built from the card's
 * stored summary (the measured values the worker recorded with its evidence) plus the dish's names; a
 * species the dish no longer names falls back to its id. A card describes a recorded sequence: it never
 * claims a cause, a benefit, a winner or an adaptation, and the time shown is dish time (m:ss).
 */
import type { LineageLocus } from '@sim/lineage';
import { type StoryCard, type StoryEnzyme, type StoryRegion, type StoryTemplate } from '@persist/notebookStories';
import { REGION_LABELS } from '../panels/TraitData';
import { locusName } from './inherited';
import { plural } from './experiments';
import { formatSimTime, LINEAGE_TEXT, ruleLines, traitSentence } from './lineage';
import { provenanceText, reactionAmount } from './reactions';

export const STORY_TEXT = {
  tab: 'Something happened',
  intro:
    'Story cards are short memories of things recorded in this dish: a first split, an enzyme at work, a family that changed, a place that changed after you changed it. They describe what was recorded, in order; they do not say why.',
  noDish: 'Story cards are kept with each dish. Open a dish to see what happened in it.',
  reading: 'Reading this dish’s story cards…',
  empty: 'Nothing has been recorded as a story in this dish yet. Cards appear here as things happen; most enter quietly, without a notice.',
  badge: 'Memory, not replay',
  memoryNote: 'This card was written from recorded events and measurements. It holds no picture of the dish, so it is a memory, not a replay.',
  open: 'Open',
  spotlight: 'Spotlight',
  dismiss: 'Dismiss',
  back: 'All story cards',
  unseen: 'New',
  dismissedTitle: 'Dismissed cards',
  removed:
    'This dish keeps up to 50 story cards, so the oldest were removed to make room (dismissed cards first, then cards you had opened).',
  noticeDismiss: 'Dismiss this notice',
  spotlightHint: 'Spotlight shows where it happened. It moves only the view: nothing in the dish changes or happens again.',
  sequenceNote: 'This lists what was recorded, in order. It does not show that your change caused the difference.',
  /** The Lineage sheet's own label for the rule lines (LineageSheet.tsx "Game rules"). */
  gameRules: 'Game rules',
  noAncestorRules: 'Its ancestor’s genome is not recorded, so no game rule numbers can be compared.',
} as const;

export const STORY_TITLES: Readonly<Record<StoryTemplate, string>> = {
  firstSplit: 'A first split',
  enzymeAtWork: 'An enzyme at work',
  familyChanged: 'A family changed',
  placeChanged: 'A place changed',
};

/** SPEC §12.7's sentence for each enzyme (exact for starch). */
export const ENZYME_CAPTIONS: Readonly<Record<StoryEnzyme, string>> = {
  starch: 'Starch became sugar here.',
  oil: 'Oil became metabolite here.',
  protein: 'Protein became broth here.',
};

/** SPEC §12.7, exact. */
export const SPLIT_CAPTION = 'A cell split. Its offspring inherited these traits.';

/** The names a caption reads from the dish (DishInfo's fields). */
export interface StoryNames {
  readonly speciesIds: readonly string[];
  readonly speciesNames: readonly string[];
  readonly materials: readonly { readonly id: string; readonly name: string }[];
}

export interface StoryPanel {
  /** Dish tick the panel is about. */
  readonly tick: number;
  /** Dish time m:ss. */
  readonly time: string;
  readonly caption: string;
  /** Further measured lines (may be empty). */
  readonly details: readonly string[];
}

export function storyTitle(card: Pick<StoryCard, 'template'>): string {
  return STORY_TITLES[card.template];
}

export function storyNoticeText(card: Pick<StoryCard, 'template'>): string {
  return `Something happened: ${storyTitle(card)}`;
}

/** A species' name in this dish, else its id (a card outlives the names it was recorded with). */
export function speciesName(names: StoryNames, id: string): string {
  const i = names.speciesIds.indexOf(id);
  return (i >= 0 ? names.speciesNames[i] : undefined) ?? id;
}

/** "A Sprinter", "An Oilwick", "An Amoeba": the indefinite article by the name's first letter. */
export function withArticle(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'An' : 'A'} ${name}`;
}

/**
 * "13 Sprinters", "1 Sprinter", "5 Amoebae": a count of a species, plural unless it is one (the app's
 * species plural, strings/experiments.ts). A species the dish no longer names keeps its bare id.
 */
export function speciesCount(names: StoryNames, id: string, n: number): string {
  const i = names.speciesIds.indexOf(id);
  const name = i >= 0 ? names.speciesNames[i] : undefined;
  if (name === undefined || name === null) return `${n} ${id}`;
  return `${n} ${n === 1 ? name : plural(name)}`;
}

function materialName(names: StoryNames, id: string): string {
  return names.materials.find((m) => m.id === id)?.name ?? id;
}

/** "top left", "whole dish" (REGION_LABELS, lower-cased). */
export function regionWords(region: StoryRegion): string {
  const i = ['dish', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'].indexOf(region);
  return (REGION_LABELS[i] ?? region).toLowerCase();
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function panel(tick: number, caption: string, details: readonly string[] = []): StoryPanel {
  return { tick, time: formatSimTime(tick), caption, details };
}

function cellWords(cell: number): string {
  return `(${cell % 128}, ${Math.floor(cell / 128)})`;
}

function firstSplitPanels(c: Extract<StoryCard, { template: 'firstSplit' }>, names: StoryNames): StoryPanel[] {
  const s = c.summary;
  const sp = speciesName(names, s.species);
  const n = s.changedA + s.changedB;
  let later: string;
  if (n === 0) later = 'Both daughters carry the parent’s traits.';
  else {
    const words: string[] = [];
    for (const ch of s.changes) {
      const w =
        ch.kind === 'locus'
          ? `${locusName(ch.locus)} ${ch.from} → ${ch.to}`
          : ch.kind === 'gained'
            ? `gained ${ch.moduleName ?? ch.module} (${ch.module})`
            : ch.kind === 'lost'
              ? `lost ${ch.moduleName ?? ch.module} (${ch.module})`
              : ch.kind === 'policy'
                ? 'began mixing its foods by weight'
                : 'a shifted food preference';
      if (!words.includes(w)) words.push(w);
    }
    later = s.recorded && words.length > 0 ? `${n} of 2 daughters carry a recorded change: ${words.join('; ')}.` : `${n} of 2 daughters carry a recorded change.`;
  }
  return [
    panel(s.parentBirthTick >= 0 ? s.parentBirthTick : s.splitTick, `${withArticle(sp)} was growing.`, [`Parent #${s.parent}`]),
    panel(s.splitTick, SPLIT_CAPTION, [`Daughters #${s.daughterA} and #${s.daughterB}, from parent #${s.parent}.`]),
    panel(s.splitTick, later),
  ];
}

function enzymePanels(c: Extract<StoryCard, { template: 'enzymeAtWork' }>, names: StoryNames): StoryPanel[] {
  const s = c.summary;
  const t = s.second * 10;
  const out = [
    panel(t, ENZYME_CAPTIONS[s.enzyme], [
      `Recorded in that second: ${reactionAmount(s.amount)} carbon in cell ${cellWords(s.cell)}, in the ${regionWords(s.region)}; ${reactionAmount(s.dishAmount)} across the dish.`,
    ]),
  ];
  // A producer is named only with recorded provenance (D-0051); otherwise no producer panel at all.
  if (s.producers.length > 0) out.push(panel(t, `${provenanceText(s.producers.map((id) => speciesName(names, id)))}.`, ['Releasing this enzyme in that cell or next to it.']));
  return out;
}

function familyPanels(c: Extract<StoryCard, { template: 'familyChanged' }>, names: StoryNames): StoryPanel[] {
  const s = c.summary;
  const sp = speciesName(names, s.species);
  const loci: LineageLocus[] = [];
  if (s.trait?.kind === 'locus') loci[s.trait.locus] = { index: s.trait.locus, name: s.locusName ?? locusName(s.trait.locus), low: '', high: '' };
  const difference = traitSentence({ trait: s.trait, descriptor: s.descriptor, locusValues: s.locusValues, module: s.module }, loci);
  // The Lineage sheet's structure: "Game rules", then each differing rule with its ancestor's value. The
  // lineage record marks no rule as a cost or a gain, so none is called a tradeoff (SPEC §12.9).
  const rules = ruleLines(s.rules);
  const ancestor = s.parentName ?? `the ${sp} founder of this line`;
  return [
    panel(s.candidateTick, `Inherited difference: ${difference}`, [`Ancestor: ${ancestor}.`]),
    panel(s.establishedTick, `A branch was named: ${s.name}.`, [`${s.members} living descendants across ${s.depth} generation${s.depth === 1 ? '' : 's'} when named.`]),
    panel(s.establishedTick, STORY_TEXT.gameRules, [
      ...(s.rules === null ? [STORY_TEXT.noAncestorRules] : rules),
      LINEAGE_TEXT.notVerdict,
    ]),
  ];
}

function changeWords(s: Extract<StoryCard, { template: 'placeChanged' }>['summary'], names: StoryNames): string {
  if (s.command === 'inoculate') return `You added ${speciesCount(names, s.what, s.accepted)}`;
  const m = lowerFirst(materialName(names, s.what));
  return s.command === 'placeObject' ? `You placed ${s.accepted === 1 ? 'a' : s.accepted} ${m}` : `You added ${m}`;
}

function placePanels(c: Extract<StoryCard, { template: 'placeChanged' }>, names: StoryNames): StoryPanel[] {
  const s = c.summary;
  const where = regionWords(s.region);
  const details = [
    ...(s.others > 0 ? [`Other recorded changes in between: ${s.others}`] : []),
    ...(s.changedSpecies > 1 ? [`${s.changedSpecies - 1} other kind${s.changedSpecies - 1 === 1 ? '' : 's'} also changed in number there.`] : []),
    STORY_TEXT.sequenceNote,
  ];
  return [
    panel(s.commandTick, changeWords(s, names), [`In the ${where}.`]),
    panel(s.beforeSecond * 10, `Before: ${speciesCount(names, s.species, s.before)} in the ${where}`),
    panel(s.afterSecond * 10, `After: ${speciesCount(names, s.species, s.after)} in the ${where}`, details),
  ];
}

/** The card's panels (at most 3), each captioned with dish time, from its stored summary only. */
export function storyPanels(card: StoryCard, names: StoryNames): StoryPanel[] {
  switch (card.template) {
    case 'firstSplit':
      return firstSplitPanels(card, names);
    case 'enzymeAtWork':
      return enzymePanels(card, names);
    case 'familyChanged':
      return familyPanels(card, names);
    case 'placeChanged':
      return placePanels(card, names);
  }
}

/** One line for the card list: the title's subject and when. */
export function storyListLine(card: StoryCard, names: StoryNames): string {
  switch (card.template) {
    case 'firstSplit': {
      const x = card.summary;
      return `${speciesName(names, x.species)} #${x.parent} split at ${formatSimTime(x.splitTick)}`;
    }
    case 'enzymeAtWork': {
      const x = card.summary;
      return `${ENZYME_CAPTIONS[x.enzyme].replace(' here.', '')} in the ${regionWords(x.region)} at ${formatSimTime(x.second * 10)}`;
    }
    case 'familyChanged':
      return `${card.summary.name} named at ${formatSimTime(card.summary.establishedTick)}`;
    case 'placeChanged':
      return `${changeWords(card.summary, names)} in the ${regionWords(card.summary.region)} at ${formatSimTime(card.summary.commandTick)}`;
  }
}
