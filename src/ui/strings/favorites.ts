/**
 * Favorite families in words (P4.1; SPEC §12.6, UX §5.8, D08 §06). Every sentence states a record: a
 * count, a birth tick, a recorded reason code. No sentence calls a family better or worse, and the
 * extinction card neither scolds nor alarms.
 */
import { FAVORITE_REFUSALS, defaultFavoriteName } from '@worker/favorites';
import { NOTEBOOK_DROPPED_TEXT, type FavoritePattern, type FavoriteRecord } from '@persist/notebook';
import { reasonText } from './reasons';

export { FAVORITE_REFUSALS, defaultFavoriteName };

export const FAVORITE_TEXT = {
  follow: 'Follow this family',
  sheetTitle: 'Follow this family',
  nicknameLabel: 'Nickname (optional)',
  nicknameNote: 'Nicknames stay on this device unless you choose to share them.',
  patternLegend: 'Marker shape',
  confirm: 'Follow',
  cancel: 'Cancel',
  full: FAVORITE_REFUSALS.full,
  unpinOne: 'Unpin',
  find: 'Find',
  rename: 'Rename',
  pattern: 'Change marker',
  unpin: 'Unpin',
  pinAgain: 'Pin again',
  save: 'Save',
  lookBack: 'Look back',
  continueExploring: 'Continue exploring',
  newDish: 'Start a new dish',
  notebookEmpty: 'Favorites are kept with each dish. Open a dish to see its families.',
  notebookNone: 'No families followed in this dish yet. Select an organism and choose “Follow this family”.',
  stateFollowing: 'Following',
  stateUnpinned: 'Unpinned',
  inheritedTitle: 'Confirmed inherited differences',
  inheritedLoading: 'Reading its recorded inheritance…',
  representativeGone: 'The organism you were following is no longer in the dish.',
  /** The worker's own words (one constant: what a dropped notebook loses). */
  dropped: NOTEBOOK_DROPPED_TEXT,
} as const;

export const PATTERN_NAMES: Readonly<Record<FavoritePattern, string>> = {
  circle: 'Circle',
  triangle: 'Triangle',
  square: 'Square',
};

/** Dish time as m:ss (the captions' sim time). */
export function mss(tick: number): string {
  const s = Math.max(0, Math.floor(tick / 10));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** A favorite's name: its nickname, else "{Species} #{root}" (D08: the default caption uses the ancestor and its id). */
export function favoriteDisplayName(
  f: Pick<FavoriteRecord, 'nickname' | 'rootBirthId'>,
  speciesName: string,
): string {
  return f.nickname ?? defaultFavoriteName(speciesName, f.rootBirthId);
}

/** "from {Species} #{root}". */
export function fromRootText(speciesName: string, root: number): string {
  return `from ${speciesName} #${root}`;
}

export function membersText(n: number): string {
  return n === 1 ? '1 member' : `${n} members`;
}

/** The slot button's accessible name. */
export function findLabel(name: string, n: number): string {
  return `Find the ${name} family: ${n} ${n === 1 ? 'member' : 'members'}`;
}

/** The inspector's button once its family is followed (opens the Family sheet). */
export function followingText(name: string): string {
  return `Following the ${name} family`;
}

/** "Follow next: {Species} #{id}, born {m:ss}". */
export function followNextText(speciesName: string, birthId: number, birthTick: number): string {
  return birthTick >= 0
    ? `Follow next: ${speciesName} #${birthId}, born ${mss(birthTick)}`
    : `Follow next: ${speciesName} #${birthId}, born before the kept records`;
}

/** UX §5.8, exact: "No members of the {name} family remain." */
export function extinctTitle(name: string): string {
  return `No members of the ${name} family remain.`;
}

/** The last recorded conditions: "The last member, {Species} #{id}, was recorded at {m:ss}: {reason}." */
export function extinctLastText(
  speciesName: string,
  lastBirthId: number,
  tick: number,
  cause: number,
): string {
  return `The last member, ${speciesName} #${lastBirthId}, was recorded at ${mss(tick)}: ${lastConditions(cause)}.`;
}

/** The recorded reason, as the inspector words it; a record no longer kept says so. */
function lastConditions(cause: number): string {
  if (cause === 0) return 'its last record was not kept';
  if (cause === -1) return 'it split, and its daughters are no longer in the dish';
  return reasonText(cause)
    .replace(/\.$/, '')
    .replace(/^./, (c) => c.toLowerCase());
}

/** The Notebook's state line for one favorite. */
export function favoriteStateText(f: Pick<FavoriteRecord, 'active' | 'extinct'>): string {
  if (f.extinct) return `No members remain since ${mss(f.extinct.tick)}`;
  return f.active ? FAVORITE_TEXT.stateFollowing : FAVORITE_TEXT.stateUnpinned;
}

/** "Generation depth": generations spanned below the root by living members. */
export function depthText(depth: number | null): string {
  if (depth === null) return 'Generation depth: not recorded';
  return depth === 1
    ? 'Generation depth: 1 generation below the first'
    : `Generation depth: ${depth} generations below the first`;
}

/** An unpinned favorite removed to make room (the notebook keeps 20). */
export function removedText(name: string): string {
  return `The notebook keeps 20 unpinned families, so “${name}” was removed.`;
}

/** Undo or a rollback restored a moment before these favorites' first organisms were in the dish (fix round 1). */
export function restoredRemovedText(names: readonly string[]): string {
  const list = names.map((n) => `“${n}”`).join(', ');
  return names.length === 1
    ? `The ${list} family is no longer followed: its first organisms are not in the dish at this time.`
    : `The families ${list} are no longer followed: their first organisms are not in the dish at this time.`;
}

/** An unpinned favorite's members line: they are counted only while it is followed (fix round 1). */
export const UNPINNED_MEMBERS_TEXT =
  'Living members are counted while the family is followed. Pin again to count them.';

/** The other Follow next candidates, in order (SPEC §12.6 "sorted by birth tick then ID"). */
export const OTHER_CANDIDATES_TEXT = 'Or choose another surviving member, by birth time, then ID:';

/** One candidate button: "{Species} #{id}, born {m:ss}". */
export function candidateText(speciesName: string, birthId: number, birthTick: number): string {
  return birthTick >= 0
    ? `${speciesName} #${birthId}, born ${mss(birthTick)}`
    : `${speciesName} #${birthId}, born before the kept records`;
}
