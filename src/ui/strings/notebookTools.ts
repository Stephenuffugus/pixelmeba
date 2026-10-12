/**
 * Copy for bookmarks, the specimen gallery and the storage panel (P4.8b; SPEC §12.8; UX §2, §5.11; D02 §20).
 * Plain words first; every number is a game unit or a stored size; nothing claims more than was recorded.
 */
import { BOOKMARK_TEXT } from '@persist/notebookBookmarks';

export const BOOKMARK_UI = {
  tab: 'Bookmarks',
  noDish: 'Bookmarks are kept with each dish. Open a dish to see its bookmarks.',
  none: 'No bookmarks yet. Use “Bookmark this moment” in More or the Lab’s Observe tray, or “Bookmark” beside a line in History → What happened.',
  reading: 'Reading this dish’s bookmarks…',
  intro: (dish: string) => `Moments bookmarked in “${dish}”. A snapshot bookmark can be opened later as a new branch; a text bookmark keeps the words only.`,
  textOnly: BOOKMARK_TEXT.textOnly,
  snapshotKept: 'Snapshot stored on this device: can be opened as a new branch.',
  snapshotGone: BOOKMARK_TEXT.gone,
  open: 'Open as a new branch',
  delete: 'Delete…',
  deleteConfirm: 'Delete bookmark',
  keep: 'Keep',
  deleteQuestion: (hasSnapshot: boolean) =>
    hasSnapshot
      ? 'Delete this bookmark? Its stored snapshot stays on this device until you remove it in Saved dishes → Storage.'
      : 'Delete this bookmark? Its words go; the dish does not change.',
  deleted: 'Bookmark deleted. The dish did not change.',
  opening: 'Opening the bookmarked moment…',
  /** The sheet (More → Bookmark this moment; Lab → Observe → Bookmarks). */
  sheetTitle: 'Bookmark this moment',
  sheetLead: (time: string) => `The dish is paused at ${time}. A bookmark keeps this moment’s time and what the dish held.`,
  titleLabel: 'Title',
  includeSnapshot: 'Include a snapshot (can be opened later; uses storage)',
  snapshotHelp: 'Without a snapshot the bookmark is text only and cannot be replayed.',
  save: 'Bookmark',
  cancel: 'Cancel',
  saving: 'Bookmarking…',
  saved: (withSnapshot: boolean) => (withSnapshot ? 'Bookmarked with a snapshot. Notebook → Bookmarks lists it.' : 'Bookmarked (text only). Notebook → Bookmarks lists it.'),
  eventButton: 'Bookmark',
  eventButtonDone: 'Bookmarked',
  eventLabel: (text: string, at: string) => `Bookmark: ${text} at ${at} (text only)`,
  moreRow: 'Bookmark this moment',
  labButton: 'Bookmarks',
  at: (time: string) => `Dish time ${time}`,
  branchOpened: (name: string, time: string) => `Opened the bookmark as a new branch, “${name}”, paused at ${time}. The bookmark and the dish it came from are unchanged.`,
} as const;

export const GALLERY_UI = {
  tab: 'Gallery',
  noDish: 'The gallery is kept with each dish. Open a dish to see its specimens.',
  none: 'No specimens yet. Select an organism and choose “Save to gallery”.',
  reading: 'Reading this dish’s gallery…',
  intro: (dish: string) => `Specimens saved from “${dish}”: a picture, the kind and what the inspector showed then. A picture never adds anything to a dish.`,
  save: 'Save to gallery',
  saved: 'Saved to the gallery. Notebook → Gallery lists it.',
  noPicture: 'The dish has not been drawn yet; try again in a moment.',
  delete: 'Delete…',
  deleteConfirm: 'Delete specimen',
  keep: 'Keep',
  deleteQuestion: 'Delete this specimen from the gallery? The organism and the dish do not change.',
  deleted: 'Specimen deleted. The dish did not change.',
  pictureAlt: (species: string, birthId: number, time: string) => `Picture of ${species} #${birthId} and its surroundings at ${time}`,
} as const;

export const STORAGE_UI = {
  button: 'Storage',
  title: 'Storage on this device',
  lead: 'What this device keeps for Pixelmeba, with approximate sizes. Nothing here is removed unless you confirm it, and saved dishes are only ever deleted with their own Delete… above.',
  used: (used: string, quota: string) => `About ${used} of ${quota} used on this device`,
  noEstimate: 'Storage use is not available in this browser.',
  reading: 'Reading what this device stores…',
  groupSaved: 'Saved dishes',
  groupContinue: 'Continue (autosave)',
  groupCheckpoints: 'Automatic checkpoints',
  groupBaselines: 'Try my dish starting points',
  groupSnapshots: 'Snapshot bookmarks',
  empty: 'None.',
  savedNote: 'Each saved dish keeps its previous copy too. Delete a saved dish with its own Delete… in the list above.',
  previous: (size: string) => `previous copy ${size}`,
  remove: 'Remove…',
  removeConfirm: 'Remove',
  cancel: 'Cancel',
  confirmCheckpoint: 'Remove this automatic checkpoint? Your saved dishes and Continue stay.',
  confirmBaseline: 'Remove this starting point? Turns already played stay; Another turn will be unavailable.',
  confirmSnapshot: 'Remove this snapshot? The bookmark text stays in its dish.',
  removed: 'Removed. Nothing else changed.',
  failed: (why: string) => `Could not remove it: ${why} Nothing was changed.`,
  total: (size: string) => `Total ${size}`,
} as const;

/** A stored size in words ("12 KB", "1.4 MB"; whole bytes below 1 KB). */
export function sizeText(bytes: number): string {
  const b = Math.max(0, Math.round(bytes));
  if (b < 1024) return `${b} bytes`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
