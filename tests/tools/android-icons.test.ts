/**
 * P4.10: the launcher icons, splash images and web icons from art/src/icons/appIcon.ts (tools/android-icons.ts).
 * Deterministic bytes (rendered twice); every PNG at its exact size; the adaptive foreground draws only inside
 * the safe circle (66/108 of the width); integer scale only (each matrix cell is one solid k × k block); the
 * files on disk are exactly what the tool writes.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { allOutputs, DENSITIES, renderIcons, SPLASHES } from '../../tools/android-icons';

const ROOT = join(__dirname, '..', '..');

function decode(bytes: Buffer): { w: number; h: number; data: Buffer; px: (x: number, y: number) => number } {
  const p = PNG.sync.read(bytes);
  // One pixel as a 32-bit RGBA number.
  return { w: p.width, h: p.height, data: p.data, px: (x, y) => p.data.readUInt32BE((y * p.width + x) * 4) };
}

const FILES = renderIcons();

describe('android icons', () => {
  it('render the same bytes every time, and the files on disk are exactly those', () => {
    const a = allOutputs();
    const b = [...FILES.map((f) => ({ path: f.path, bytes: f.bytes })), a[a.length - 1]!];
    expect(a.map((o) => o.path)).toEqual(b.map((o) => o.path));
    for (let i = 0; i < a.length; i++) expect(Buffer.compare(a[i]!.bytes, b[i]!.bytes)).toBe(0);
    for (const o of a) expect(Buffer.compare(readFileSync(join(ROOT, o.path)), o.bytes), o.path).toBe(0);
  });

  it('every PNG has its exact size', () => {
    const files = FILES;
    const want: Record<string, [number, number]> = {};
    const fg = [108, 162, 216, 324, 432];
    const legacy = [48, 72, 96, 144, 192];
    DENSITIES.forEach((d, i) => {
      want[`android/app/src/main/res/mipmap-${d.name}/ic_launcher_foreground.png`] = [fg[i]!, fg[i]!];
      want[`android/app/src/main/res/mipmap-${d.name}/ic_launcher.png`] = [legacy[i]!, legacy[i]!];
      want[`android/app/src/main/res/mipmap-${d.name}/ic_launcher_round.png`] = [legacy[i]!, legacy[i]!];
    });
    for (const s of SPLASHES) want[`android/app/src/main/res/${s.dir}/splash.png`] = [s.w, s.h];
    want['public/icons/icon-192.png'] = [192, 192];
    want['public/icons/icon-512.png'] = [512, 512];
    want['public/icons/maskable-512.png'] = [512, 512];
    expect(files.map((f) => f.path).sort()).toEqual(Object.keys(want).sort());
    for (const f of files) {
      const img = decode(f.bytes);
      expect([img.w, img.h], f.path).toEqual(want[f.path]);
    }
  });

  it('the adaptive foreground draws only inside the safe circle (66/108 of the width)', () => {
    for (const f of FILES.filter((x) => x.path.endsWith('ic_launcher_foreground.png'))) {
      const img = decode(f.bytes);
      const c = img.w / 2;
      const r = (img.w * 66) / 108 / 2;
      let drawn = 0;
      for (let y = 0; y < img.h; y++)
        for (let x = 0; x < img.w; x++) {
          if (img.data[(y * img.w + x) * 4 + 3] === 0) continue;
          drawn++;
          const dx = Math.max(Math.abs(x - c), Math.abs(x + 1 - c));
          const dy = Math.max(Math.abs(y - c), Math.abs(y + 1 - c));
          expect(Math.hypot(dx, dy), `${f.path} (${x}, ${y})`).toBeLessThanOrEqual(r + 1e-9);
        }
      expect(drawn).toBeGreaterThan(img.w * img.h * 0.2);
    }
  });

  it('opaque files have no transparency; the round legacy icon and the foreground do', () => {
    for (const f of FILES) {
      const img = decode(f.bytes);
      let transparent = 0;
      for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 255) transparent++;
      const mayBeClear = f.path.endsWith('ic_launcher_foreground.png') || f.path.endsWith('ic_launcher_round.png');
      if (mayBeClear) expect(transparent, f.path).toBeGreaterThan(0);
      else expect(transparent, f.path).toBe(0);
    }
  });

  it('integer scale only: each matrix cell is one solid k × k block', () => {
    for (const f of FILES) {
      expect(Number.isInteger(f.scale) && f.scale >= 1).toBe(true);
      const img = decode(f.bytes);
      const [ox, oy] = f.origin;
      for (let gy = 0; gy < f.grid; gy++)
        for (let gx = 0; gx < f.grid; gx++) {
          const first = img.px(ox + gx * f.scale, oy + gy * f.scale);
          for (let dy = 0; dy < f.scale; dy++)
            for (let dx = 0; dx < f.scale; dx++) {
              const v = img.px(ox + gx * f.scale + dx, oy + gy * f.scale + dy);
              if (v !== first) throw new Error(`${f.path}: cell (${gx}, ${gy}) is not one solid ${f.scale} × ${f.scale} block`);
            }
        }
    }
  });
});
