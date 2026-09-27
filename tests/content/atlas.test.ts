/**
 * P1.4 done-when: "validator finds no missing required frames for enabled species". The atlas
 * check in tools/content-validate.ts is pure (checkAtlas); these tests feed it the committed atlas
 * and deliberately broken copies, then prove the CLI exits non-zero naming the missing frame.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkAtlas, pngSize, requiredFrames, type AtlasSpeciesRef } from '../../tools/content-validate';
import { loadRegistryFs, REPO_ROOT } from '../../tools/lib/content-fs';

interface Frame {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Atlas {
  width: number;
  height: number;
  exportHash: string;
  sprites: Record<string, { speciesId: string; size: number; headings: number; animations: Record<string, { frames: number; durationMs: number; reducedMotionFrame: number }> }>;
  frames: Frame[];
}

const ATLAS_DIR = join(REPO_ROOT, 'public', 'atlas');
const manifestText = readFileSync(join(ATLAS_DIR, 'manifest.json'), 'utf8');
const png = new Uint8Array(readFileSync(join(ATLAS_DIR, 'organisms.png')));
const reg = loadRegistryFs();
const enabled: AtlasSpeciesRef[] = reg.manifest.enabledSpecies.map((id) => {
  const s = reg.species[id]!;
  return { id, assetId: s.assetId, frameSize: s.frameSize, headings: s.headings };
});

const atlas = (): Atlas => JSON.parse(manifestText) as Atlas;
const without = (a: Atlas, key: string): Atlas => ({ ...a, frames: a.frames.filter((f) => f.key !== key) });
const messages = (a: unknown, opts: Parameters<typeof checkAtlas>[2] = {}) => checkAtlas(a, enabled, opts).map((i) => i.message);

describe('atlas completeness (P1.4)', () => {
  it('the committed atlas has every required frame for every enabled species, and its image matches', () => {
    expect(enabled.map((s) => s.id)).toEqual(['A01', 'B01', 'B04', 'B06', 'P01']);
    expect(checkAtlas(atlas(), enabled, { png })).toEqual([]);
    expect(pngSize(png)).toEqual({ width: atlas().width, height: atlas().height });
  });

  it('requires the P1.4 frame counts, per heading, mapped to atlas animation names', () => {
    const a = atlas();
    const perHeading = (assetId: string, anim: string) => a.frames.filter((f) => f.key.startsWith(`${assetId}/${anim}/e/`)).length;
    // Bacteria: 4 headings × (4 move, 4 reproduction, 2 stress, 3 death).
    for (const id of ['b01_sprinter', 'b04_recycler', 'b06_crumbsmith']) {
      expect(a.sprites[id]!.headings).toBe(4);
      expect([perHeading(id, 'move'), perHeading(id, 'reproduction'), perHeading(id, 'stress'), perHeading(id, 'death')]).toEqual([4, 4, 2, 3]);
      for (const h of ['e', 's', 'w', 'n']) expect(a.frames.some((f) => f.key === `${id}/death/${h}/2`)).toBe(true);
    }
    // A01: one heading, idle 4, division (atlas "reproduction") 4, stress 2, death 3.
    expect(a.sprites.a01_sunbead!.headings).toBe(1);
    expect(['idle', 'reproduction', 'stress', 'death'].map((n) => perHeading('a01_sunbead', n))).toEqual([4, 4, 2, 3]);
    // P01 32×32: move 6, feed 4, reproduction 4, stress 2, death 4.
    expect(['move', 'feed', 'reproduction', 'stress', 'death'].map((n) => perHeading('p01_amoeba', n))).toEqual([6, 4, 4, 2, 4]);
    expect(requiredFrames(16).map((r) => r.frames)).toEqual([4, 4, 2, 3]);
    expect(requiredFrames(32).map((r) => r.frames)).toEqual([6, 4, 4, 2, 4]);
  });

  it('reports exactly one error, naming the frame, when a single frame is missing', () => {
    const issues = checkAtlas(without(atlas(), 'b04_recycler/death/n/2'), enabled);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: 'error', file: 'public/atlas/manifest.json', path: 'frames[b04_recycler/death/n/2]' });
    expect(issues[0]!.message).toBe('B04 (b04_recycler): missing frame "b04_recycler/death/n/2"');
  });

  it('reports a missing or short required animation', () => {
    const a = atlas();
    delete a.sprites.p01_amoeba!.animations.feed;
    expect(messages(a)).toContain('P01 (p01_amoeba): missing required animation "feed" (4 frames × 1 heading(s))');
    const b = atlas();
    b.sprites.a01_sunbead!.animations.idle!.frames = 3;
    b.sprites.a01_sunbead!.animations.idle!.reducedMotionFrame = 0;
    expect(messages(b)).toEqual(['A01 (a01_sunbead): "idle" has 3 frame(s), needs 4']);
    // A small sprite with neither move nor idle is incomplete.
    const c = atlas();
    delete c.sprites.a01_sunbead!.animations.idle;
    expect(messages(c)).toContain('A01 (a01_sunbead): missing required animation "move or idle" (4 frames × 1 heading(s))');
  });

  it('reports a sprite missing for an enabled species and heading/size disagreements with content', () => {
    const a = atlas();
    delete a.sprites.b06_crumbsmith;
    expect(messages(a)).toEqual(['enabled species B06 (b06_crumbsmith) has no sprite in the atlas']);
    const b = atlas();
    b.sprites.b01_sprinter!.headings = 1;
    b.sprites.p01_amoeba!.size = 16;
    expect(messages(b)).toEqual(['B01 (b01_sprinter): atlas has 1 heading(s), content needs 4', 'P01 (p01_amoeba): atlas frame size 16 ≠ content frameSize 32']);
    // A heading the content requires but the atlas never packed.
    const c = without(atlas(), 'b01_sprinter/move/w/0');
    expect(messages(c)).toEqual(['B01 (b01_sprinter): missing frame "b01_sprinter/move/w/0"']);
  });

  it('reports frame rects outside the image and an image that does not match the manifest', () => {
    const a = atlas();
    const f = a.frames.find((x) => x.key === 'p01_amoeba/move/e/5')!;
    f.y = a.height - 8;
    expect(messages(a)).toEqual([`frame "p01_amoeba/move/e/5" rect is outside the ${a.width}×${a.height} atlas`]);
    expect(messages(atlas(), { png: null })).toEqual(['atlas image "organisms.png" is missing (run npm run art:build)']);
    const stale = { ...atlas(), exportHash: '0'.repeat(64) };
    expect(messages(stale, { png })[0]).toMatch(/^atlas image hashes to [0-9a-f]{12}…, manifest exportHash is 000000000000…/);
    expect(messages(atlas(), { png: new Uint8Array([1, 2, 3]) })[0]).toBe('atlas image "organisms.png" is not a PNG');
    expect(messages({ format: 'something-else' })).toEqual(['not a pixelmeba-atlas version 1 manifest (run npm run art:build)']);
  });

  describe('CLI', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pixelmeba-atlas-'));
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    it('npm run content:validate exits non-zero and names the frame when one is missing', () => {
      const manifestPath = join(dir, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify(without(atlas(), 'p01_amoeba/death/e/3'), null, 1) + '\n');
      copyFileSync(join(ATLAS_DIR, 'organisms.png'), join(dir, 'organisms.png'));
      const tsx = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
      const res = spawnSync(tsx, [join(REPO_ROOT, 'tools', 'content-validate.ts'), '--atlas', manifestPath], { cwd: REPO_ROOT, encoding: 'utf8' });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('missing frame "p01_amoeba/death/e/3"');
      expect(res.stderr).toContain('content: 1 error(s)');
    });
  });
});
