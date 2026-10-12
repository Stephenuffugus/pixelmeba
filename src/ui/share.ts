/**
 * P4.6 Share (SPEC §14.4; UX §5.10; D09 lines 140-160; D-0080): the Share sheet's state, the picture's
 * options and making, and handing a file to the operating system's share sheet or a download.
 *
 * Opening the sheet pauses the dish (as a blocking panel, UX §2) so a Living dish is written at a
 * consistent paused tick; closing it restores the prior speed. Nothing here changes the world: the
 * picture is drawn from a copy of the latest published snapshot, the files are read-only worker answers,
 * and a cancelled or refused share changes nothing (no toast, no state change).
 */
import { signal } from '@preact/signals';
import {
  composePicture,
  drawPicture,
  exportPng,
  PICTURE_MIME,
  PICTURE_PX,
  type PictureInput,
  type PictureOptions,
} from '@render/picture';
import type { Speed } from '@worker/protocol';
import { isNativePlatform } from '@platform/capacitor';
import { nativeShareEnv } from '@platform/nativeShare';
import { loadAtlas, type LoadedAtlas } from './atlas';
import { notebook } from './favorites';
import { dishClock, dishInfo, getClient, latestDishSnapshots, meta, route, setSpeed, sheet } from './state';
import { storyReturn } from './stories';
import type { ShareChoice } from './strings/share';

export const SHARE_PICTURE_FILENAME = 'pixelmeba-picture.png';
export const RECIPE_FILE_MIME = 'application/vnd.pixelmeba+json';

export interface ShareRequest {
  readonly dishId: string;
  readonly choice: ShareChoice;
  /** A question to start the picture with (a story card's title), else the dish's recorded question. */
  readonly question: string | null;
  /** Opened from a story card's Save picture: the picture is labelled with the dish's own time. */
  readonly fromStory: boolean;
}

/** The open Share sheet's request (null while closed). */
export const shareRequest = signal<ShareRequest | null>(null);

/** The dish's run state when the sheet opened (restored on close, once). */
let resume: { readonly dishId: string; readonly speed: number } | null = null;

/** Open the Share sheet on the open dish, pausing it (the prior speed comes back on close). */
export function openShare(
  opts: {
    readonly choice?: ShareChoice;
    readonly question?: string | null;
    readonly fromStory?: boolean;
    readonly priorSpeed?: number;
  } = {},
): void {
  const info = dishInfo.value;
  if (!info) return;
  const speed = opts.priorSpeed ?? meta.value?.speed ?? 0;
  if (resume?.dishId !== info.dishId || speed > 0) resume = { dishId: info.dishId, speed };
  if ((meta.value?.speed ?? 0) > 0) getClient().setSpeed(info.dishId, 0);
  shareRequest.value = {
    dishId: info.dishId,
    choice: opts.choice ?? 'picture',
    question: opts.question ?? null,
    fromStory: opts.fromStory === true,
  };
  sheet.value = 'share';
}

/**
 * Story card → Save picture (UX §5.9): back to the dish with the Share sheet on Picture and the card's
 * title as the question. A Notebook visit opened from the notice ends here; its recorded speed becomes
 * the sheet's prior speed, so closing the sheet runs the dish again as Spotlight would.
 */
export function openShareFromStory(title: string): void {
  const info = dishInfo.value;
  if (!info) return;
  const from = storyReturn.current;
  storyReturn.current = null;
  const prior = from && from.dishId === info.dishId ? from.speed : (meta.value?.speed ?? 0);
  route.value = { name: 'dish' };
  openShare({ choice: 'picture', question: title, fromStory: true, priorSpeed: prior });
}

/** Close the sheet; the dish runs again at its prior speed unless the player changed it meanwhile. */
export function closeShare(): void {
  shareRequest.value = null;
  if (sheet.value === 'share') sheet.value = 'none';
  restoreShareSpeed();
}

/**
 * The dish screen's key handler asks this first (UX §2: a blocking panel pauses the dish and blocks its
 * keys). While the Share sheet is open no dish key acts behind it (Space, 1/2/4, '.', U, zoom, pan, views):
 * the sheet says "The dish is paused while this is open." and the Living dish is written at that paused
 * tick. Esc is Close (the prior run state comes back). Keys still reach the sheet's own controls (the
 * question field, the choices, Tab), because nothing is prevented here. True when the key was taken.
 */
export function shareSheetKey(key: string): boolean {
  if (sheet.value !== 'share') return false;
  if (key === 'Escape') closeShare();
  return true;
}

/** The prior run state, once (also called when the sheet unmounts some other way). */
export function restoreShareSpeed(): void {
  const r = resume;
  resume = null;
  if (!r || r.speed <= 0) return;
  const now = meta.value?.speed ?? 0;
  if (dishInfo.value?.dishId !== r.dishId || route.value.name !== 'dish') return;
  if (now === 0 || now === r.speed) setSpeed(r.speed as Speed);
}

// ------------------------------------------------------------------------------------ picture

/** The player's picture choices in the sheet. */
export interface PictureChoices {
  readonly question: string;
  readonly hideLabels: boolean;
  /** UX §5.10 "strip metadata (on for pictures)": no dish name and no dish time. */
  readonly stripMetadata: boolean;
  /** UX §5.10 "include nickname (off)". */
  readonly includeNicknames: boolean;
  readonly legend: boolean;
  readonly fromStory: boolean;
}

export const PICTURE_DEFAULTS: Omit<PictureChoices, 'question' | 'fromStory'> = {
  hideLabels: false,
  stripMetadata: true,
  includeNicknames: false,
  legend: false,
};

/**
 * The picture's options from the player's choices and the dish. Strip metadata leaves out the dish name
 * and time; a picture saved from a story card always carries "Dish at m:ss" (the dish now, never the
 * moment of the story: honest labels). The identifier names a bundled recipe only (D09 line 140).
 */
export function pictureOptionsFor(
  c: PictureChoices,
  dish: { readonly name: string; readonly tick: number; readonly identity: string | null },
): PictureOptions {
  const question = c.question.trim().slice(0, 120);
  return {
    question: question.length > 0 ? question : null,
    identity: dish.identity,
    title: c.stripMetadata ? null : dish.name,
    timeLabel: c.stripMetadata && !c.fromStory ? null : `Dish at ${dishClock(dish.tick)}`,
    legend: c.legend,
    hideLabels: c.hideLabels,
    includeNicknames: c.includeNicknames,
  };
}

/** A copy of the open dish's latest published snapshot as the picture's input (never a live object). */
export function pictureInputNow(): PictureInput | null {
  const info = dishInfo.value;
  const got = latestDishSnapshots();
  if (!info || !got) return null;
  const { snap: s, geometry: g } = got;
  const fav = notebook.value?.favorites ?? [];
  return {
    tick: s.tick,
    count: s.count,
    ents: s.ents.slice(),
    ids: s.ids.slice(),
    deposits: s.deposits.slice(),
    objects: (s.objects ?? []).map((o) => ({ ...o })),
    substrate: g.substrate.slice(),
    structure: g.structure.slice(),
    shade: g.shade.slice(),
    speciesIds: [...info.speciesIds],
    speciesAssets: [...info.speciesAssets],
    speciesNames: [...info.speciesNames],
    nicknames: fav.filter((f) => f.active && f.nickname).map((f) => f.nickname!),
  };
}

/** Draw the picture into `canvas` (1080 × 1080, nearest-neighbour). */
export function paintPicture(
  canvas: HTMLCanvasElement,
  input: PictureInput,
  atlas: LoadedAtlas,
  opts: PictureOptions,
): void {
  canvas.width = PICTURE_PX;
  canvas.height = PICTURE_PX;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('This device cannot draw the picture.');
  drawPicture(ctx, composePicture(input, atlas.manifest, opts), atlas.image);
}

/** The PNG of the picture with these options (a fresh offscreen canvas). */
export async function makePicture(input: PictureInput, opts: PictureOptions): Promise<Blob> {
  const atlas = await loadAtlas();
  const canvas = document.createElement('canvas');
  paintPicture(canvas, input, atlas, opts);
  return exportPng(canvas);
}

// ------------------------------------------------------------------------- OS share or save

export interface ShareFile {
  readonly blob: Blob;
  readonly filename: string;
  readonly type: string;
  readonly title: string;
}

export type ShareOutcome = 'shared' | 'saved' | 'cancelled';

/** What deliverFile needs from the platform (a fake in tests). */
export interface ShareEnv {
  readonly nav:
    | {
        readonly canShare?: (data: ShareData) => boolean;
        readonly share?: (data: ShareData) => Promise<void>;
      }
    | undefined;
  readonly makeFile: (blob: Blob, filename: string, type: string) => File | null;
  readonly download: (blob: Blob, filename: string) => void;
}

/** A Blob offered as a download named `filename` (the fallback when the OS share sheet is unavailable). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function browserShareEnv(): ShareEnv {
  return {
    nav: typeof navigator !== 'undefined' ? navigator : undefined,
    makeFile: (blob, filename, type) => {
      try {
        return new File([blob], filename, { type });
      } catch {
        return null;
      }
    },
    download: downloadBlob,
  };
}

/** P4.10: the Android app's share sheet (src/platform/nativeShare.ts) on the native app, else the browser's. */
export function platformShareEnv(): ShareEnv {
  return isNativePlatform() ? nativeShareEnv() : browserShareEnv();
}

/**
 * Hand a file to the OS share sheet when it can take files (Web Share Level 2), else save it as a
 * download. The player cancelling (AbortError) or the platform refusing changes nothing: 'cancelled'.
 * P4.10: on the Android app the share sheet is the Share plugin's (platformShareEnv).
 */
export async function deliverFile(f: ShareFile, env: ShareEnv = platformShareEnv()): Promise<ShareOutcome> {
  const nav = env.nav;
  const file = env.makeFile(f.blob, f.filename, f.type);
  let canShare: boolean;
  try {
    canShare =
      file !== null &&
      typeof nav?.share === 'function' &&
      typeof nav.canShare === 'function' &&
      nav.canShare({ files: [file] });
  } catch {
    canShare = false;
  }
  if (canShare && file && nav?.share) {
    try {
      await nav.share({ files: [file], title: f.title });
      return 'shared';
    } catch {
      // AbortError (the player closed the sheet) or a refusal: nothing is saved and nothing changes.
      return 'cancelled';
    }
  }
  env.download(f.blob, f.filename);
  return 'saved';
}

/** The picture file as shared. */
export function pictureFile(blob: Blob): ShareFile {
  return { blob, filename: SHARE_PICTURE_FILENAME, type: PICTURE_MIME, title: 'Pixelmeba picture' };
}

/** A .pixelmeba text (a recipe or a living dish) as shared. */
export function dishFile(text: string, filename: string, title: string): ShareFile {
  return { blob: new Blob([text], { type: RECIPE_FILE_MIME }), filename, type: RECIPE_FILE_MIME, title };
}
