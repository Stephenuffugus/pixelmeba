/**
 * P4.6 Share texts (UX §5.10, §5.11, §2; SPEC §14.4; D09 lines 140-160). The three one-line descriptions
 * are UX §5.10's exact words.
 */
export type ShareChoice = 'picture' | 'recipe' | 'living';

export const SHARE_CHOICES: readonly {
  readonly id: ShareChoice;
  readonly label: string;
  readonly line: string;
}[] = [
  { id: 'picture', label: 'Picture', line: 'a snapshot image; does not contain the living dish' },
  { id: 'recipe', label: 'Starting recipe', line: 'the setup and seed; others can start the same dish' },
  {
    id: 'living',
    label: 'Living dish',
    line: 'the full save; continue this exact world on a compatible build',
  },
];

export const SHARE_TEXT = {
  title: 'Share',
  intro: 'Choose what to share. Nothing leaves this device until you press Share.',
  paused: 'The dish is paused while this is open.',
  share: 'Share',
  working: 'Making the file…',
  question: 'Question on the picture (optional)',
  hideLabels: 'Hide labels',
  hideLabelsHint: 'Only the dish and the name Pixelmeba.',
  stripMetadata: 'Strip metadata',
  stripMetadataHint: 'Leaves out the dish name and dish time.',
  includeNicknames: 'Include family nicknames',
  legend: 'Show a species key',
  storyTime: 'This picture shows the dish now, labelled with its own dish time, not the moment of the story.',
  pictureAlt: (tick: string) => `Preview of the picture: the whole dish at ${tick} dish time`,
  pictureWaiting: 'Drawing the picture…',
  pictureUnavailable: 'The picture could not be drawn yet. Close this and try again in a moment.',
  livingNote: 'The file includes world names and notes.',
  stripNames: 'Strip names and notes',
  stripNamesHint:
    'Removes the dish name, family names and journal notes. The dish itself runs on exactly the same.',
  livingLine: (name: string, time: string, size: string) => `“${name}” at ${time} dish time · ${size}`,
  recipeVersions: (s: number, r: number, c: number) => `Needs simulation ${s}, rules ${r}, content ${c}.`,
  recipeCustom:
    'This start has its own choices, so it is shared as a file (a recipe ID alone cannot hold it).',
  recipeReading: 'Reading the start…',
  copyDetails: 'Copy recipe details',
  copied: 'Copied the recipe ID.',
  copyFailed: 'Could not copy. Select the recipe ID and copy it.',
  shared: 'Shared.',
  saved: (filename: string) => `Saved ${filename}.`,
  cancelled: 'Not shared. Nothing changed.',
  /** D-0096: the share sheet that offers an export on the Android app was closed without saving. */
  exportCancelled: 'Not exported. Nothing changed.',
  failed: (why: string) => `Could not make the file; nothing changed: ${why}`,
} as const;

/** Import recipe ID (UX §2; D09 "Bundled recipe identifiers"). */
export const RECIPE_ID_TEXT = {
  title: 'Import recipe ID',
  label: 'Recipe ID',
  hint: 'For a recipe that comes with Pixelmeba, such as “R-G3 / revision 1 / seed 104729”. A custom dish or a living world needs its file.',
  start: 'Start',
  starting: 'Starting…',
  empty: 'Type a recipe ID first.',
} as const;

/**
 * UX §5.11 "Import failed: exact reason; nothing changed": the one toast for every refused import (a save
 * file or a Starting recipe file, from Saved dishes, More or Play). The reason is the worker's exact text
 * (a version refusal keeps "This recipe needs a compatible build ({versions})." as its reason); its own
 * closing "Nothing was loaded." / "Nothing was changed." is not repeated before "Nothing changed.".
 */
export function importFailedText(reason: string): string {
  const why = reason
    .trim()
    .replace(/\s*(Nothing was loaded|Nothing was changed|Nothing has changed|Nothing changed)\.?$/i, '')
    .replace(/[\s.]+$/, '');
  return why === '' ? 'Import failed. Nothing changed.' : `Import failed: ${why}. Nothing changed.`;
}

/** "1.2 MB" / "640 KB" for a file's size. */
export function fileSizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
