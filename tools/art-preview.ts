/**
 * npm run art:preview -- [assetId…]  → docs/reports/art/<assetId>.png
 * Renders every animation × heading of a sprite at 8× on water, plus a grayscale strip, for review.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hexToRgba, P } from '../art/src/palette';
import { frameRgba, orient, type SpriteDef } from '../art/src/sprite';
import { SPRITES } from '../art/src/index';
import { blit, createImage, encodePng, scaleNearest, toGrayscale } from './lib/png';
import { REPO_ROOT } from './lib/content-fs';

const K = 8;
const want = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const outDir = join(REPO_ROOT, 'docs', 'reports', 'art');
mkdirSync(outDir, { recursive: true });

function sheet(def: SpriteDef): Buffer {
  const anims = Object.entries(def.animations);
  const maxFrames = Math.max(...anims.map(([, a]) => a.frames.length));
  const cell = def.size + 4;
  const rows = anims.length * def.headings + 1;
  const img = createImage(maxFrames * cell * 2 + 8, rows * cell, hexToRgba(P.water));
  let row = 0;
  for (const [, anim] of anims) {
    for (let h = 0; h < def.headings; h++) {
      anim.frames.forEach((f, k) => {
        const o = orient(f, h);
        const rgba = { w: o.w, h: o.h, data: frameRgba(def, o) };
        blit(img, rgba, k * cell + 2, row * cell + 2);
        blit(img, toGrayscale(rgba), maxFrames * cell + 8 + k * cell + 2, row * cell + 2);
      });
      row++;
    }
  }
  // Last row: a dense group of first move/idle frames, to judge legibility in a crowd.
  const first = (def.animations.move ?? def.animations.idle)!.frames[0]!;
  for (let k = 0; k < maxFrames * 2; k++) {
    const o = orient(first, k % def.headings);
    blit(img, { w: o.w, h: o.h, data: frameRgba(def, o) }, k * (cell / 2) + 2, row * cell + ((k * 3) % 5));
  }
  return encodePng(scaleNearest(img, K));
}

for (const def of SPRITES) {
  if (want.length > 0 && !want.includes(def.assetId)) continue;
  const path = join(outDir, `${def.assetId}.png`);
  writeFileSync(path, sheet(def));
  console.log(`wrote ${path}`);
}
