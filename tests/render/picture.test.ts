/**
 * P4.6 the share Picture's composition (src/render/picture.ts; SPEC §14.4, UX §5.10, CT §12.10, D-0080),
 * in node without a canvas: the draw list of a real Garden snapshot taken through the worker host.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  composePicture,
  LEGEND_BOX_W,
  PICTURE_DISH_PX,
  PICTURE_MARGIN,
  PICTURE_PX,
  PICTURE_WORDMARK,
  pictureDisk,
  type PictureInput,
  type PictureItem,
  type PictureOptions,
} from '../../src/render/picture';
import type { AtlasManifestLike } from '../../src/render/renderer';
import {
  E_HEADING,
  E_SPECIES,
  E_X,
  E_Y,
  ENT_STRIDE,
  type DishInfo,
  type SnapshotMsg,
} from '../../src/worker/protocol';
import { FakeClockHost } from '../helpers/host';

const manifest = JSON.parse(readFileSync('public/atlas/manifest.json', 'utf8')) as AtlasManifestLike;

function gardenInput(): PictureInput {
  const h = new FakeClockHost();
  h.create('g', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
  h.setSpeed(4);
  h.advanceTo(200);
  h.setSpeed(0);
  const info = (h.out.find((m) => m.type === 'ready') as { info: DishInfo }).info;
  const snaps = h.out.filter((m): m is SnapshotMsg => m.type === 'snapshot');
  const geo = snaps.find((s) => s.geometry)!.geometry!;
  const s = snaps[snaps.length - 1]!;
  return {
    tick: s.tick,
    count: s.count,
    ents: s.ents.slice(),
    ids: s.ids.slice(),
    deposits: s.deposits.slice(),
    objects: (s.objects ?? []).map((o) => ({ ...o })),
    substrate: geo.substrate.slice(),
    structure: geo.structure.slice(),
    shade: geo.shade.slice(),
    speciesIds: info.speciesIds,
    speciesAssets: info.speciesAssets,
    speciesNames: info.speciesNames,
    nicknames: ['Quiet savers'],
  };
}

const input = gardenInput();
const base: PictureOptions = {
  question: 'Who finds something to eat?',
  identity: 'FIRST_DISH_V1 / revision 1 / seed 104729',
  title: 'Little Living Garden',
  timeLabel: 'Dish at 0:20',
  legend: true,
  hideLabels: false,
};

/** An item's bounding box in picture pixels (text: its squeezed width and 1.25 × its size). */
function box(it: PictureItem): [number, number, number, number] {
  if (it.kind === 'blit') return [it.dx, it.dy, it.dx + it.dw, it.dy + it.dh];
  if (it.kind === 'text') {
    const x0 =
      it.align === 'left' ? it.x : it.align === 'right' ? it.x - it.maxWidth : it.x - it.maxWidth / 2;
    return [x0, it.y, x0 + it.maxWidth, it.y + Math.ceil(it.size * 1.25)];
  }
  return [it.x, it.y, it.x + it.w, it.y + it.h];
}

const texts = (items: readonly PictureItem[]) =>
  items.filter((i): i is Extract<PictureItem, { kind: 'text' }> => i.kind === 'text');

describe('share picture composition', () => {
  it('is 1080 × 1080 with the whole dish at an integer scale (7 px per cell, 896 px) and integer rectangles', () => {
    expect(input.count).toBeGreaterThan(40);
    const list = composePicture(input, manifest, base);
    expect([list.width, list.height]).toEqual([1080, 1080]);
    expect(list.cellPx).toBe(7);
    expect(Number.isInteger(list.cellPx) && Number.isInteger(list.spriteScale)).toBe(true);
    const dish = list.items.find((i) => i.kind === 'pixels')!;
    expect(dish.kind === 'pixels' && [dish.w, dish.h, dish.rgba.length]).toEqual([
      PICTURE_DISH_PX,
      PICTURE_DISH_PX,
      896 * 896 * 4,
    ]);
    const blits = list.items.filter((i) => i.kind === 'blit');
    expect(blits.length).toBeGreaterThanOrEqual(input.count - 5); // every body (no viruses in the Garden)
    for (const b of list.items) {
      const nums =
        b.kind === 'blit'
          ? [b.sx, b.sy, b.sw, b.sh, b.dx, b.dy, b.dw, b.dh]
          : b.kind === 'text'
            ? [b.x, b.y, b.size]
            : [b.x, b.y, b.w, b.h];
      for (const n of nums) expect(Number.isInteger(n), JSON.stringify({ ...b, rgba: undefined })).toBe(true);
      // Organism sprites: one sprite pixel = one picture pixel (an integer scale); tiles fill one 7 px cell.
      if (b.kind === 'blit') expect(b.dw === b.sw * list.spriteScale || b.dw === list.cellPx).toBe(true);
    }
  });

  it('nothing but the background lies in the 48 px safe margin', () => {
    const list = composePicture(input, manifest, {
      ...base,
      question: 'Q'.repeat(30) + ' ' + 'word '.repeat(18),
    });
    expect(list.items[0]).toEqual({
      kind: 'fill',
      x: 0,
      y: 0,
      w: PICTURE_PX,
      h: PICTURE_PX,
      color: '#14252d',
    });
    for (const it of list.items.slice(1)) {
      const [x0, y0, x1, y1] = box(it);
      expect(x0, it.kind).toBeGreaterThanOrEqual(PICTURE_MARGIN);
      expect(y0, it.kind).toBeGreaterThanOrEqual(PICTURE_MARGIN);
      expect(x1, it.kind).toBeLessThanOrEqual(PICTURE_PX - PICTURE_MARGIN);
      expect(y1, it.kind).toBeLessThanOrEqual(PICTURE_PX - PICTURE_MARGIN);
    }
    // A long question wraps to at most two lines; the key never covers the round dish.
    expect(texts(list.items).filter((t) => t.role === 'question').length).toBeLessThanOrEqual(2);
    const { cx, cy, r } = pictureDisk();
    for (const it of list.items.filter(
      (i) => (i.kind === 'text' && i.role === 'legend') || (i.kind === 'fill' && i !== list.items[0]),
    )) {
      const [x0, y0, x1, y1] = box(it);
      const nx = Math.max(x0, Math.min(cx, x1));
      const ny = Math.max(y0, Math.min(cy, y1));
      expect(Math.hypot(nx - cx, ny - cy), JSON.stringify(it)).toBeGreaterThan(r);
      expect(x1 - x0).toBeLessThanOrEqual(LEGEND_BOX_W);
    }
  });

  it('draws the question, identity, caption and key; Hide labels leaves only the dish and the wordmark', () => {
    const shown = texts(composePicture(input, manifest, base).items).map((t) => t.text);
    expect(shown).toContain('Who finds something to eat?');
    expect(shown).toContain('FIRST_DISH_V1 / revision 1 / seed 104729');
    expect(shown).toContain('· Little Living Garden · Dish at 0:20');
    expect(shown).toContain(PICTURE_WORDMARK);
    expect(shown.some((t) => /^Sprinter/.test(t))).toBe(true);
    const hidden = composePicture(input, manifest, { ...base, hideLabels: true });
    expect(texts(hidden.items).map((t) => t.text)).toEqual([PICTURE_WORDMARK]);
    expect(hidden.items.filter((i) => i.kind === 'fill')).toHaveLength(1); // no key swatch either
    expect(hidden.items.filter((i) => i.kind === 'blit').length).toBe(
      composePicture(input, manifest, base).items.filter((i) => i.kind === 'blit').length,
    );
    // No title, time or identity when the options give none (strip metadata is resolved by the share sheet).
    const bare = texts(
      composePicture(input, manifest, {
        ...base,
        title: null,
        timeLabel: null,
        identity: null,
        legend: false,
      }).items,
    ).map((t) => t.text);
    expect(bare).toEqual(['Pixelmeba', 'Who finds something to eat?']);
  });

  it('family nicknames are drawn only when the player opted in', () => {
    const off = texts(composePicture(input, manifest, base).items).map((t) => t.text);
    expect(off.join('\n')).not.toContain('Quiet savers');
    const on = texts(composePicture(input, manifest, { ...base, includeNicknames: true }).items).map(
      (t) => t.text,
    );
    expect(on).toContain('Quiet savers');
    // Without the key there is nowhere a nickname would go.
    expect(
      texts(composePicture(input, manifest, { ...base, legend: false, includeNicknames: true }).items)
        .map((t) => t.text)
        .join('\n'),
    ).not.toContain('Quiet savers');
  });

  it('organisms use the reduced-motion frame of their heading row, at their snapshot positions', () => {
    const list = composePicture(input, manifest, { ...base, legend: false });
    const frames = new Map(manifest.frames.map((f) => [f.key, f]));
    const blits = list.items.filter((i): i is Extract<PictureItem, { kind: 'blit' }> => i.kind === 'blit');
    let checked = 0;
    for (let k = 0; k < input.count && checked < 10; k++) {
      const o = k * ENT_STRIDE;
      const asset = input.speciesAssets[input.ents[o + E_SPECIES]!]!;
      if (asset !== 'b01_sprinter') continue;
      const sprite = manifest.sprites[asset]!;
      const keys = ['move', 'stress'].map(
        (a) =>
          `${asset}/${a}/${'eswn'[input.ents[o + E_HEADING]!]}/${sprite.animations[a]!.reducedMotionFrame}`,
      );
      const cx = 92 + Math.round(input.ents[o + E_X]! * 7);
      const cy = 92 + Math.round(input.ents[o + E_Y]! * 7);
      const hit = blits.find(
        (b) =>
          b.dx === cx - 8 &&
          b.dy === cy - 8 &&
          keys.some((key) => frames.get(key)!.x === b.sx && frames.get(key)!.y === b.sy),
      );
      expect(hit, `entity ${k}`).toBeTruthy();
      checked++;
    }
    expect(checked).toBe(10);
  });

  it('the crop option draws one square of cells at the largest integer scale (the gallery)', () => {
    const list = composePicture(input, manifest, {
      ...base,
      legend: false,
      crop: { x0: 40, y0: 52, cells: 24 },
    });
    expect(list.cellPx).toBe(37);
    expect(list.spriteScale).toBe(5);
    const dish = list.items.find((i) => i.kind === 'pixels')!;
    expect(dish.kind === 'pixels' && dish.w).toBe(24 * 37);
    const blits = list.items.filter((i): i is Extract<PictureItem, { kind: 'blit' }> => i.kind === 'blit');
    expect(blits.length).toBeGreaterThan(0);
    let inside = 0;
    for (let k = 0; k < input.count; k++) {
      const x = input.ents[k * ENT_STRIDE + E_X]!;
      const y = input.ents[k * ENT_STRIDE + E_Y]!;
      if (x >= 40 && x < 64 && y >= 52 && y < 76) inside++;
    }
    expect(blits.length).toBeLessThanOrEqual(inside + 40);
    for (const b of blits) {
      expect(b.dx).toBeGreaterThanOrEqual(dish.x);
      expect(b.dy).toBeGreaterThanOrEqual(dish.y);
      expect(b.dx + b.dw).toBeLessThanOrEqual(dish.x + (dish.kind === 'pixels' ? dish.w : 0));
      expect(b.dw % 5 === 0 || b.dw === 37).toBe(true);
    }
  });

  it('composing twice from one input is identical and leaves the input unchanged', () => {
    const copy = {
      ents: input.ents.slice(),
      ids: input.ids.slice(),
      deposits: input.deposits.slice(),
      substrate: input.substrate.slice(),
      structure: input.structure.slice(),
      shade: input.shade.slice(),
      objects: JSON.stringify(input.objects),
    };
    const a = composePicture(input, manifest, base);
    const b = composePicture(input, manifest, base);
    expect(b).toEqual(a);
    expect(input.ents).toEqual(copy.ents);
    expect(input.ids).toEqual(copy.ids);
    expect(input.deposits).toEqual(copy.deposits);
    expect(input.substrate).toEqual(copy.substrate);
    expect(input.structure).toEqual(copy.structure);
    expect(input.shade).toEqual(copy.shade);
    expect(JSON.stringify(input.objects)).toBe(copy.objects);
  });
});
