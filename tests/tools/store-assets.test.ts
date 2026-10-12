/**
 * P4.12 store assets (tools/store-assets.ts, tools/lib/storeShots.ts; PLAY_STORE_CHECKLIST §A):
 * - the icon run is byte-deterministic and the files in store/ are exactly what it writes;
 * - store/icon-512.png is 512 × 512, a 32-bit PNG (RGBA) whose every pixel is opaque, full square (the corners
 *   are the surround colour), drawn at an integer scale; the adaptive layers are 512 × 512;
 * - store/feature-1024x500.png is 1024 × 500 with no alpha channel (24-bit RGB);
 * - every device class has its six topics at the exact size, 24-bit RGB, and store/screenshots/manifest.json
 *   holds the provenance of each (and of the feature graphic) with the file's sha256.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { hexToRgba } from '../../art/src/palette';
import { ICON_BACKGROUND } from '../../art/src/icons/appIcon';
import { DEVICE_CLASSES, FEATURE_FILE, TOPICS } from '../../tools/lib/storeShots';
import { foregroundBox, MANIFEST_PATH, PRIVACY_HTML, privacyPolicyHtml, renderStoreIcons, STORE_ICON_SCALE, type StoreManifest } from '../../tools/store-assets';

const ROOT = join(__dirname, '..', '..');

/** IHDR: width, height, bit depth, colour type (2 = RGB, 6 = RGBA). */
function ihdr(b: Buffer): { w: number; h: number; depth: number; colourType: number } {
  expect([...b.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(b.subarray(12, 16).toString('latin1')).toBe('IHDR');
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24]!, colourType: b[25]! };
}

const read = (rel: string): Buffer => readFileSync(join(ROOT, rel));
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

describe('store icon', () => {
  const files = renderStoreIcons();

  it('renders the same bytes every time, and store/ holds exactly those bytes', () => {
    const again = renderStoreIcons();
    expect(files.map((f) => f.path)).toEqual(['store/icon-512.png', 'store/icon-foreground-512.png', 'store/icon-background-512.png']);
    for (let i = 0; i < files.length; i++) {
      expect(Buffer.compare(files[i]!.bytes, again[i]!.bytes)).toBe(0);
      expect(Buffer.compare(read(files[i]!.path), files[i]!.bytes), files[i]!.path).toBe(0);
    }
  });

  it('icon-512: 512 × 512, 32-bit RGBA, every pixel opaque, full square, integer-scale blocks', () => {
    const f = files[0]!;
    expect(ihdr(f.bytes)).toEqual({ w: 512, h: 512, depth: 8, colourType: 6 });
    const p = PNG.sync.read(f.bytes);
    for (let i = 3; i < p.data.length; i += 4) if (p.data[i] !== 255) throw new Error(`pixel ${(i - 3) / 4} has alpha ${p.data[i]}`);
    const bg = hexToRgba(ICON_BACKGROUND);
    const px = (x: number, y: number) => [...p.data.subarray((y * 512 + x) * 4, (y * 512 + x) * 4 + 4)];
    // No rounded corners of our own: the four corners are the surround colour (Play applies its mask).
    for (const [x, y] of [
      [0, 0],
      [511, 0],
      [0, 511],
      [511, 511],
    ] as const)
      expect(px(x, y)).toEqual(bg);
    // Every art cell is one solid k × k block (nearest neighbour, integer scale).
    const box = foregroundBox();
    const k = STORE_ICON_SCALE;
    const [ox, oy] = f.origin;
    expect(box.w * k).toBeLessThanOrEqual(512);
    for (let cy = 0; cy < box.h; cy++) {
      for (let cx = 0; cx < box.w; cx++) {
        const c = px(ox + cx * k, oy + cy * k);
        for (const [dx, dy] of [
          [k - 1, 0],
          [0, k - 1],
          [k - 1, k - 1],
          [k >> 1, k >> 1],
        ] as const)
          expect(px(ox + cx * k + dx, oy + cy * k + dy)).toEqual(c);
      }
    }
    // The dish is drawn (not only the surround): the centre is not the surround colour.
    expect(px(256, 256)).not.toEqual(bg);
  });

  it('adaptive layers: a transparent-outside foreground and an opaque solid background, both 512 × 512', () => {
    const fg = PNG.sync.read(files[1]!.bytes);
    expect([fg.width, fg.height]).toEqual([512, 512]);
    expect(fg.data[3]).toBe(0); // the corner is transparent
    expect(fg.data[(256 * 512 + 256) * 4 + 3]).toBe(255);
    expect(ihdr(files[2]!.bytes)).toEqual({ w: 512, h: 512, depth: 8, colourType: 2 });
    const bg = PNG.sync.read(files[2]!.bytes);
    const want = hexToRgba(ICON_BACKGROUND);
    for (let i = 0; i < bg.data.length; i += 4) if (bg.data[i] !== want[0] || bg.data[i + 1] !== want[1] || bg.data[i + 2] !== want[2]) throw new Error(`background pixel ${i / 4}`);
  });
});

describe('privacy policy', () => {
  it('store/privacy-policy.html is PRIVACY_POLICY.md as written now, and the policy says what the app does', () => {
    const md = read('PRIVACY_POLICY.md').toString('utf8');
    expect(read(PRIVACY_HTML).toString('utf8')).toBe(privacyPolicyHtml(md));
    for (const line of ['Pixelmeba collects no data', 'allowBackup', 'system share sheet', 'INTERNET', 'VIBRATE', 'Filesystem', 'Preferences', 'Splash Screen', 'Status Bar', 'Children', 'Effective date']) expect(md, line).toContain(line);
    const html = read(PRIVACY_HTML).toString('utf8');
    expect(html).not.toMatch(/<script|https?:\/\/(?!play\.google)/);
  });
});

describe('feature graphic and screenshots (made by npm run store:assets from the production build)', () => {
  const manifest = JSON.parse(read(MANIFEST_PATH).toString('utf8')) as StoreManifest;

  it('feature-1024x500.png: 1024 × 500, 24-bit RGB (no alpha channel), with its provenance', () => {
    const b = read(FEATURE_FILE);
    expect(ihdr(b)).toEqual({ w: 1024, h: 500, depth: 8, colourType: 2 });
    const f = manifest.feature!;
    expect(f.file).toBe(FEATURE_FILE);
    expect(f.sha256).toBe(sha(b));
    expect(f.recipe).toBe('FIRST_DISH_V1');
    expect(f.seed).toBe(104729);
    expect(f.tick).toBeGreaterThanOrEqual(1200);
    expect(f.stateHash).toMatch(/^[0-9a-f]{16}$/);
    expect(f.buildCommit).toMatch(/^[0-9a-f]{7,}(\+dirty)?$/);
    expect(f.text).toEqual(['Pixelmeba', 'Grow a tiny living world.', 'Change one thing.', 'See what happens.']);
    expect(Number.isInteger(f.picture.scale) && f.picture.scale >= 1).toBe(true);
    // The source picture is the real 1080 × 1080 Share → Picture, kept beside it.
    const pic = read(f.picture.file);
    expect(ihdr(pic)).toMatchObject({ w: 1080, h: 1080 });
    expect(f.picture.sha256).toBe(sha(pic));
  });

  for (const dc of DEVICE_CLASSES) {
    it(`${dc.id}: six topics at ${dc.viewport.width * dc.deviceScaleFactor} × ${dc.viewport.height * dc.deviceScaleFactor}, 24-bit RGB, each with provenance`, () => {
      const w = dc.viewport.width * dc.deviceScaleFactor;
      const h = dc.viewport.height * dc.deviceScaleFactor;
      // Play: 9:16 portrait, the long side at most twice the short one, 320–3840 px.
      expect(w * 16).toBe(h * 9);
      expect(Math.max(w, h)).toBeLessThanOrEqual(3840);
      expect(Math.min(w, h)).toBeGreaterThanOrEqual(1080);
      for (const t of TOPICS) {
        const file = `store/screenshots/${dc.id}/${t.n}-${t.id}.png`;
        expect(existsSync(join(ROOT, file)), file).toBe(true);
        const b = read(file);
        expect(ihdr(b), file).toEqual({ w, h, depth: 8, colourType: 2 });
        const rec = manifest.shots.find((s) => s.file === file);
        expect(rec, file).toBeDefined();
        expect(rec!.topic).toBe(`${t.n} ${t.id}`);
        expect(rec!.sha256).toBe(sha(b));
        expect(rec!.size).toEqual([w, h]);
        expect(rec!.viewport).toEqual(dc.viewport);
        expect(rec!.deviceScaleFactor).toBe(dc.deviceScaleFactor);
        expect(rec!.buildCommit).toMatch(/^[0-9a-f]{7,}(\+dirty)?$/);
        expect(rec!.recipe).toMatch(/^[A-Z0-9_]+$/);
        expect(rec!.seed).toBe(104729);
        expect(rec!.tick).toBeGreaterThan(0);
        expect(rec!.steps.length).toBeGreaterThan(0);
        // A paused capture names its exact world; only a running one (02) or a paired run (06) has no single hash.
        if (t.n !== '02' && t.n !== '06') expect(rec!.stateHash).toMatch(/^[0-9a-f]{16}$/);
        if (t.n === '05') expect(rec!.saveFile).toBe('tests/fixtures/saves/first-dish-accelerated-varied-t6000.pixelmeba.gz');
      }
    });
  }
});
