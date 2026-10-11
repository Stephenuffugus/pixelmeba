/**
 * P4.6 Share flow (src/ui/share.ts; UX §5.10, SPEC §14.4 "OS share/save flow; cancellation changes
 * nothing"): the OS share sheet when it can take files, else a download; a cancelled or refused share
 * changes nothing and raises no toast; the three choices' exact texts; the picture's options from the
 * player's choices (strip metadata, nicknames, a story picture's own dish time).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  deliverFile,
  dishFile,
  openShareFromStory,
  pictureFile,
  openShare,
  pictureOptionsFor,
  PICTURE_DEFAULTS,
  SHARE_PICTURE_FILENAME,
  shareRequest,
  shareSheetKey,
  type ShareEnv,
} from '../../src/ui/share';
import { storyReturn } from '../../src/ui/stories';
import type { DishInfo } from '../../src/worker/protocol';
import { importFailedText, SHARE_CHOICES, SHARE_TEXT } from '../../src/ui/strings/share';
import { effect } from '@preact/signals';
import { dishInfo, errorToastText, getClient, importFile, meta, route, sheet, toast, type SnapMeta } from '../../src/ui/state';
import { PROTOCOL_VERSION, type ToWorker } from '../../src/worker/protocol';

function fakeEnv(
  nav: ShareEnv['nav'],
  makeFile: ShareEnv['makeFile'] = (b, n, t) => new File([b], n, { type: t }),
) {
  const downloads: { blob: Blob; filename: string }[] = [];
  const shared: ShareData[] = [];
  const env: ShareEnv = {
    nav: nav
      ? {
          ...(nav.canShare ? { canShare: nav.canShare } : {}),
          ...(nav.share
            ? {
                share: (d: ShareData) => {
                  shared.push(d);
                  return nav.share!(d);
                },
              }
            : {}),
        }
      : undefined,
    makeFile,
    download: (blob, filename) => downloads.push({ blob, filename }),
  };
  return { env, downloads, shared };
}

const png = () => pictureFile(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));

/** Everything the share flow could have touched in the UI's state. */
const uiState = () =>
  JSON.stringify({ toast: toast.value, sheet: sheet.value, route: route.value, dish: dishInfo.value });

describe('OS share or save', () => {
  it('without file sharing (canShare false, missing, or no File) the file is saved as a download', async () => {
    for (const nav of [
      { canShare: () => false, share: () => Promise.resolve() },
      { share: () => Promise.resolve() },
      {},
      undefined,
    ] as ShareEnv['nav'][]) {
      const { env, downloads, shared } = fakeEnv(nav);
      const f = png();
      expect(await deliverFile(f, env)).toBe('saved');
      expect(shared).toHaveLength(0);
      expect(downloads).toHaveLength(1);
      expect(downloads[0]!.filename).toBe(SHARE_PICTURE_FILENAME);
      expect(downloads[0]!.blob).toBe(f.blob);
    }
    const noFile = fakeEnv({ canShare: () => true, share: () => Promise.resolve() }, () => null);
    expect(await deliverFile(png(), noFile.env)).toBe('saved');
    expect(noFile.downloads).toHaveLength(1);
    // A canShare that throws is "cannot share".
    const throwing = fakeEnv({
      canShare: () => {
        throw new TypeError('bad');
      },
      share: () => Promise.resolve(),
    });
    expect(await deliverFile(png(), throwing.env)).toBe('saved');
  });

  it('with file sharing the OS sheet gets the file (and nothing is downloaded)', async () => {
    const { env, downloads, shared } = fakeEnv({
      canShare: (d) => (d.files?.length ?? 0) === 1,
      share: () => Promise.resolve(),
    });
    const f = dishFile(
      '{"format":"pixelmeba-recipe"}',
      'little-living-garden-recipe.pixelmeba',
      'Little Living Garden',
    );
    expect(await deliverFile(f, env)).toBe('shared');
    expect(downloads).toHaveLength(0);
    expect(shared).toHaveLength(1);
    const file = shared[0]!.files![0]!;
    expect(file.name).toBe('little-living-garden-recipe.pixelmeba');
    expect(file.type).toBe('application/vnd.pixelmeba+json');
    expect(await file.text()).toBe('{"format":"pixelmeba-recipe"}');
  });

  it('the player cancelling (AbortError) or a refusal changes nothing: no download, no toast, no state change', async () => {
    const before = uiState();
    for (const err of [
      new DOMException('The user aborted a request.', 'AbortError'),
      new DOMException('Not allowed', 'NotAllowedError'),
      new Error('boom'),
    ]) {
      const { env, downloads, shared } = fakeEnv({
        canShare: () => true,
        share: () => Promise.reject(err),
      });
      expect(await deliverFile(png(), env)).toBe('cancelled');
      expect(shared).toHaveLength(1);
      expect(downloads).toHaveLength(0);
    }
    expect(uiState()).toBe(before);
    expect(toast.value).toBeNull();
    expect(SHARE_TEXT.cancelled).toBe('Not shared. Nothing changed.');
  });
});

describe('the Share sheet', () => {
  it('offers the three choices with UX §5.10’s exact one-line descriptions', () => {
    expect(SHARE_CHOICES.map((c) => [c.id, c.label, c.line])).toEqual([
      ['picture', 'Picture', 'a snapshot image; does not contain the living dish'],
      ['recipe', 'Starting recipe', 'the setup and seed; others can start the same dish'],
      ['living', 'Living dish', 'the full save; continue this exact world on a compatible build'],
    ]);
    expect(SHARE_TEXT.livingNote).toBe('The file includes world names and notes.');
    expect(SHARE_TEXT.stripNames).toBe('Strip names and notes');
  });

  it('picture options: metadata stripped and nicknames off by default; a story picture keeps its own dish time', () => {
    const dish = { name: 'My secret dish', tick: 200, identity: 'R-G3 / revision 1 / seed 104729' };
    const base = { ...PICTURE_DEFAULTS, question: '  Who reaches the food now?  ', fromStory: false };
    expect(PICTURE_DEFAULTS).toEqual({
      hideLabels: false,
      stripMetadata: true,
      includeNicknames: false,
      legend: false,
    });
    expect(pictureOptionsFor(base, dish)).toEqual({
      question: 'Who reaches the food now?',
      identity: 'R-G3 / revision 1 / seed 104729',
      title: null,
      timeLabel: null,
      legend: false,
      hideLabels: false,
      includeNicknames: false,
    });
    const shown = pictureOptionsFor({ ...base, stripMetadata: false, includeNicknames: true }, dish);
    expect([shown.title, shown.timeLabel, shown.includeNicknames]).toEqual([
      'My secret dish',
      'Dish at 0:20',
      true,
    ]);
    // From a story card the picture is the dish NOW and says so, even with metadata stripped.
    const story = pictureOptionsFor({ ...base, question: 'A first split', fromStory: true }, dish);
    expect([story.question, story.title, story.timeLabel]).toEqual(['A first split', null, 'Dish at 0:20']);
    expect(pictureOptionsFor({ ...base, question: '   ' }, dish).question).toBeNull();
    expect(pictureOptionsFor({ ...base, question: 'x'.repeat(200) }, dish).question).toHaveLength(120);
  });
});

describe('Save picture from a story card', () => {
  it('opens the Share sheet on Picture with the card title as the question, back on the dish (UX §5.9)', () => {
    // state.ts talks to a worker when a dish is open: a silent stand-in (no message is ever answered).
    vi.stubGlobal(
      'Worker',
      class {
        onmessage: unknown = null;
        postMessage(): void {}
        addEventListener(): void {}
        removeEventListener(): void {}
        terminate(): void {}
      },
    );
    dishInfo.value = {
      dishId: 'd1',
      name: 'Garden',
      tick: 300,
      speciesIds: [],
      speciesNames: [],
      speciesAssets: [],
    } as unknown as DishInfo;
    route.value = { name: 'notebook', tab: 'stories' };
    storyReturn.current = { dishId: 'd1', speed: 2 };
    openShareFromStory('A first split');
    expect(route.value).toEqual({ name: 'dish' });
    expect(sheet.value).toBe('share');
    expect(shareRequest.value).toEqual({
      dishId: 'd1',
      choice: 'picture',
      question: 'A first split',
      fromStory: true,
    });
    expect(storyReturn.current).toBeNull(); // the Notebook visit ended here; its speed is the sheet's prior speed
    expect(toast.value).toBeNull();
    shareRequest.value = null;
    sheet.value = 'none';
    dishInfo.value = null;
    vi.unstubAllGlobals();
  });
});

describe('the Share sheet blocks dish keys (UX §2 blocking panel; wave 6a integration)', () => {
  it('while it is open no dish key acts (Space, 1/2/4, ".", U, zoom, pan, views); Esc closes it and the prior speed comes back', () => {
    vi.stubGlobal(
      'Worker',
      class {
        onmessage: unknown = null;
        postMessage(): void {}
        addEventListener(): void {}
        removeEventListener(): void {}
        terminate(): void {}
      },
    );
    dishInfo.value = { dishId: 'd1', name: 'Garden', tick: 300, speciesIds: [], speciesNames: [], speciesAssets: [] } as unknown as DishInfo;
    route.value = { name: 'dish' };
    meta.value = { speed: 2 } as unknown as SnapMeta;
    const speeds: number[] = [];
    const client = getClient();
    const spy = vi.spyOn(client, 'setSpeed').mockImplementation((_id: string, s: number) => {
      speeds.push(s);
      meta.value = { speed: s } as unknown as SnapMeta;
    });
    expect(shareSheetKey(' ')).toBe(false); // no sheet: the dish screen handles the key
    openShare();
    expect(sheet.value).toBe('share');
    expect(speeds).toEqual([0]); // opening pauses
    for (const key of [' ', '1', '2', '4', '.', 'u', 'U', '+', '-', '=', 'ArrowLeft', 'ArrowUp', 'i', 'I', 'l', 'L', 'f', 'Enter', 'Tab'])
      expect(shareSheetKey(key), key).toBe(true);
    expect(sheet.value).toBe('share');
    expect(speeds).toEqual([0]); // nothing ran, stepped or changed speed behind the sheet
    expect(shareSheetKey('Escape')).toBe(true);
    expect(sheet.value).toBe('none');
    expect(shareRequest.value).toBeNull();
    expect(speeds).toEqual([0, 2]); // Esc = Close: the prior speed, once
    expect(shareSheetKey('Escape')).toBe(false);
    spy.mockRestore();
    meta.value = null;
    dishInfo.value = null;
    vi.unstubAllGlobals();
  });
});

describe('a refused import is one toast in UX §5.11 form (wave 6a integration)', () => {
  it('"Import failed: {exact reason}. Nothing changed." for save and recipe refusals; the reason is kept, not doubled', () => {
    expect(importFailedText('This is not a Pixelmeba save file.')).toBe('Import failed: This is not a Pixelmeba save file. Nothing changed.');
    expect(importFailedText('A prey link points outside the dish. Nothing was loaded.')).toBe(
      'Import failed: A prey link points outside the dish. Nothing changed.',
    );
    expect(importFailedText('This recipe needs a compatible build (simulation 4, rules 1, content 2).')).toBe(
      'Import failed: This recipe needs a compatible build (simulation 4, rules 1, content 2). Nothing changed.',
    );
    expect(importFailedText('This recipe file does not match its checksum, so it may be damaged.')).toBe(
      'Import failed: This recipe file does not match its checksum, so it may be damaged. Nothing changed.',
    );
    expect(importFailedText('The file is larger than 25 MB')).toBe('Import failed: The file is larger than 25 MB. Nothing changed.');
    expect(importFailedText('  ')).toBe('Import failed. Nothing changed.');
    // The worker's error for either import says the same words (the global toast skips both requests).
    for (const request of ['importDish', 'recipeImport'] as const)
      expect(errorToastText({ dishId: '', message: 'This is not a Pixelmeba save file.', paused: false, request })).toBe(
        'Import failed: This is not a Pixelmeba save file. Nothing changed.',
      );
  });
});

describe('importFile: a refused save or recipe file shows exactly one toast (wave 6a integration)', () => {
  it('the worker refuses (its error notice and the request rejection both arrive): one "Import failed: …. Nothing changed." toast', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        onmessage: unknown = null;
        postMessage(): void {}
        addEventListener(): void {}
        removeEventListener(): void {}
        terminate(): void {}
      },
    );
    dishInfo.value = null;
    const client = getClient();
    const priv = client as unknown as { send(m: ToWorker): void; receive(m: unknown): void };
    const sent: ToWorker[] = [];
    const spy = vi.spyOn(priv, 'send').mockImplementation((m: ToWorker) => void sent.push(m));
    const shown: string[] = [];
    const stop = effect(() => {
      if (toast.value !== null) shown.push(toast.value);
    });
    for (const [text, type, reason, expected] of [
      ['this is not a dish', 'importDish', 'This is not a Pixelmeba save file.', 'Import failed: This is not a Pixelmeba save file. Nothing changed.'],
      [
        '{"format":"pixelmeba-recipe"}',
        'recipeImport',
        'This recipe needs a compatible build (simulation 9, rules 1, content 2).',
        'Import failed: This recipe needs a compatible build (simulation 9, rules 1, content 2). Nothing changed.',
      ],
    ] as const) {
      toast.value = null;
      shown.length = 0;
      const done = importFile(new File([text], 'broken.pixelmeba'));
      await vi.waitFor(() => expect(sent.some((m) => m.type === type)).toBe(true));
      const req = sent.find((m) => m.type === type) as { requestId: number };
      sent.length = 0;
      // Exactly what the worker posts for a refused import: one 'error' carrying the request.
      priv.receive({ protocolVersion: PROTOCOL_VERSION, type: 'error', dishId: '', requestId: req.requestId, message: reason, lastValidTick: 0, paused: false, request: type });
      // The global error toast runs synchronously inside receive and must skip this request; importFile's
      // catch (a later microtask) is the one toast. Both say the same words, so only the timing tells them apart.
      expect(toast.value, `the global error toast skips ${type}`).toBeNull();
      await done;
      expect(shown, type).toEqual([expected]);
      expect(dishInfo.value).toBeNull(); // nothing opened
    }
    stop();
    spy.mockRestore();
    toast.value = null;
    vi.unstubAllGlobals();
  });
});
