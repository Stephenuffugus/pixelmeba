/**
 * P1.4 done-when: "validator finds no missing required frames for enabled species". The atlas
 * check in tools/content-validate.ts is pure (checkAtlas); these tests feed it the committed atlas
 * and deliberately broken copies, then prove the CLI exits non-zero naming the missing frame. The
 * same holds for the enabled modules' feature marks (ARCH §10.1: prepare/rest/wake, reserve bands),
 * and tools/art-build.ts packs them deterministically.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildAtlas } from '../../tools/art-build';
import { atlasSpeciesRef, checkAtlas, enabledMarks, FEATURE_FRAMES, featureFrameKey, P3_SPRITES, pngSize, requiredFrames, type AtlasSpeciesRef } from '../../tools/content-validate';
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
  features: Record<string, { size: number; headings: number; frames: number; frameNames: string[] }>;
  frames: Frame[];
}

const ATLAS_DIR = join(REPO_ROOT, 'public', 'atlas');
const manifestText = readFileSync(join(ATLAS_DIR, 'manifest.json'), 'utf8');
const png = new Uint8Array(readFileSync(join(ATLAS_DIR, 'organisms.png')));
const reg = loadRegistryFs();
const enabled: AtlasSpeciesRef[] = reg.manifest.enabledSpecies.map((id) => atlasSpeciesRef(reg.species[id]!));
/** Every Phase 1–3 species record, regardless of what the manifest enables (wave 1 art; later waves flip them on). */
const phase13: AtlasSpeciesRef[] = reg.speciesIds.filter((id) => reg.species[id]!.phase <= 3).map((id) => atlasSpeciesRef(reg.species[id]!));
const PHASE3_IDS = ['B02', 'B03', 'B05', 'B07', 'B08', 'F01', 'F02', 'P02', 'P03', 'P04', 'V01', 'X01', 'Y01', 'Y02'];

const atlas = (): Atlas => JSON.parse(manifestText) as Atlas;
const without = (a: Atlas, key: string): Atlas => ({ ...a, frames: a.frames.filter((f) => f.key !== key) });
const messages = (a: unknown, opts: Parameters<typeof checkAtlas>[2] = {}) => checkAtlas(a, enabled, opts).map((i) => i.message);
const marks = enabledMarks(reg);
const markMessages = (a: unknown) => checkAtlas(a, enabled, { marks }).map((i) => i.message);

describe('atlas completeness (P1.4)', () => {
  it('the committed atlas has every required frame for every enabled species, and its image matches', () => {
    // Later phases enable more species; the five Phase 1 organisms must always be among them.
    expect(enabled.map((s) => s.id)).toEqual(expect.arrayContaining(['A01', 'B01', 'B04', 'B06', 'P01']));
    expect(checkAtlas(atlas(), enabled, { png })).toEqual([]);
    expect(pngSize(png)).toEqual({ width: atlas().width, height: atlas().height });
  });

  it('enforces the P1.4 sizes and headings even if content and atlas agree on something smaller', () => {
    const a = atlas();
    const weak = JSON.parse(JSON.stringify(a)) as typeof a;
    weak.sprites.b01_sprinter!.headings = 1;
    const refs = enabled.map((r) => (r.id === 'B01' ? { ...r, headings: 1 } : r));
    const out = checkAtlas(weak, refs).map((i) => i.message);
    expect(out.some((m) => m.includes('B01') && m.includes('requires 4 heading'))).toBe(true);
    const noIdle = JSON.parse(JSON.stringify(a)) as typeof a;
    delete (noIdle.sprites.a01_sunbead!.animations as Record<string, unknown>).idle;
    expect(checkAtlas(noIdle, enabled).map((i) => i.message).some((m) => m.includes('A01') && m.includes('"idle"'))).toBe(true);
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

  describe('module feature marks (ARCH §10.1)', () => {
    it('the committed atlas carries every frame of every enabled module mark, in all four headings', () => {
      expect(marks).toEqual([
        { moduleId: 'E01', layer: 'starch_notch' },
        { moduleId: 'E03', layer: 'resting_seam' },
        { moduleId: 'E05', layer: 'reserve_pocket' },
      ]);
      expect(checkAtlas(atlas(), enabled, { png, marks })).toEqual([]);
      const a = atlas();
      for (const m of marks) {
        expect(a.features[m.layer]!.frames).toBe(FEATURE_FRAMES[m.layer]!.frames);
        for (let h = 0; h < 4; h++) for (let i = 0; i < a.features[m.layer]!.frames; i++) expect(a.frames.some((f) => f.key === featureFrameKey(m.layer, i, h))).toBe(true);
      }
      // ARCH §10.1: dormancy prepare/rest/wake, reserve four bands.
      expect(FEATURE_FRAMES.resting_seam!.frames).toBe(3);
      expect(FEATURE_FRAMES.reserve_pocket!.frames).toBe(4);
    });

    it('reports exactly one precise error when one mark frame is missing', () => {
      const issues = checkAtlas(without(atlas(), 'feature/resting_seam/n/2'), enabled, { marks });
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ severity: 'error', file: 'public/atlas/manifest.json', path: 'frames[feature/resting_seam/n/2]' });
      expect(issues[0]!.message).toBe('E03 (resting_seam): missing frame "feature/resting_seam/n/2"');
      expect(markMessages(without(atlas(), 'feature/reserve_pocket/e/0'))).toEqual(['E05 (reserve_pocket): missing frame "feature/reserve_pocket/e/0"']);
    });

    it('later-phase marks carry their ARCH §10.1 frame counts: a one-frame jacket, cache or glow mark fails when its module is enabled', () => {
      // Every listed layer is a real content visualLayer (a typo would silently never apply).
      const layers = new Set(Object.values(reg.modules).map((m) => m.visualLayer));
      for (const layer of Object.keys(FEATURE_FRAMES)) expect(layers.has(layer), layer).toBe(true);
      // ARCH §10.1 "jacket 4 levels", "cache 4 fills", "Lantern dim/glow"; UX §6.2 "jacket rim (4)", "cache icon (4 fills)".
      expect([FEATURE_FRAMES.jacket_rim?.frames, FEATURE_FRAMES.cache_marker?.frames, FEATURE_FRAMES.glow_center?.frames]).toEqual([4, 4, 2]);
      // A later module turned on with a one-frame mark (all four headings packed) is refused, by name.
      const oneFrame = (layer: string): Atlas => {
        const a = atlas();
        const src = a.frames.find((f) => f.key === 'feature/starch_notch/e/0')!;
        a.features[layer] = { size: 16, headings: 4, frames: 1, frameNames: ['only'] };
        for (const h of ['e', 's', 'w', 'n']) a.frames.push({ ...src, key: `feature/${layer}/${h}/0` });
        return a;
      };
      const later = (moduleId: string, layer: string) => checkAtlas(oneFrame(layer), enabled, { marks: [{ moduleId, layer }] }).map((i) => `${i.path}: ${i.message}`);
      expect(later('E11', 'jacket_rim')).toEqual(['features.jacket_rim.frames: E11 (jacket_rim): mark has 1 frame(s), needs 4 (jacket levels 0–3)']);
      expect(later('E17', 'cache_marker')).toEqual(['features.cache_marker.frames: E17 (cache_marker): mark has 1 frame(s), needs 4 (cache fill bands 0–3)']);
      expect(later('E02', 'glow_center')).toEqual(['features.glow_center.frames: E02 (glow_center): mark has 1 frame(s), needs 2 (dim, glow)']);
      // A layer the docs give no count for still needs one frame, and one is enough.
      expect(later('E12', 'adhesion_link')).toEqual([]);
    });

    it('reports a mark missing from the table, a short frame count, and a wrong size or heading count', () => {
      const a = atlas();
      delete (a.features as Record<string, unknown>).starch_notch;
      expect(markMessages(a)).toEqual(['enabled module E01 (starch_notch) has no feature mark in the atlas (run npm run art:build)']);
      const b = atlas();
      b.features.resting_seam!.frames = 2;
      expect(markMessages(b)).toEqual(['E03 (resting_seam): mark has 2 frame(s), needs 3 (prepare, rest, wake)']);
      const c = atlas();
      c.features.reserve_pocket!.size = 32;
      c.features.reserve_pocket!.headings = 1;
      expect(markMessages(c)).toEqual(['E05 (reserve_pocket): mark frame size 32, expected 16', 'E05 (reserve_pocket): mark has 1 heading(s), needs 4']);
      const d = atlas();
      d.frames.find((f) => f.key === 'feature/starch_notch/w/0')!.w = 15;
      expect(markMessages(d)).toEqual(['E01 (starch_notch): frame "feature/starch_notch/w/0" is 15×16, expected 16×16']);
      // An atlas from before marks were packed fails for every enabled module.
      const old = atlas() as Partial<Atlas>;
      delete old.features;
      expect(markMessages(old)).toHaveLength(3);
      // Without marks to check (species-only callers), the sprite check is unchanged.
      expect(messages(old)).toEqual([]);
    });

    it('art:build is deterministic and the committed atlas is its output (art:build --check)', () => {
      const a = buildAtlas();
      const b = buildAtlas();
      expect(a.errors).toEqual([]);
      expect(Buffer.compare(a.png, b.png)).toBe(0);
      expect(JSON.stringify(a.manifest)).toBe(JSON.stringify(b.manifest));
      expect(Buffer.compare(a.png, Buffer.from(png))).toBe(0);
      expect(JSON.stringify(a.manifest, null, 1) + '\n').toBe(manifestText);
      // Sprite frames come first; the 32 mark frames follow them.
      const firstMark = a.manifest.frames.findIndex((f) => 'layer' in f);
      expect(a.manifest.frames.slice(firstMark).every((f) => 'layer' in f)).toBe(true);
      expect(a.manifest.frames.length - firstMark).toBe(32);
    });
  });

  describe('Phase 3 organism art (UX §6.2, ARCH §10.1)', () => {
    const p3 = (id: string) => phase13.find((r) => r.id === id)!;
    const all = (a: unknown) => checkAtlas(a, phase13);

    it('the committed atlas is complete for every Phase 1–3 species record, enabled or not', () => {
      expect(phase13.map((r) => r.id).sort()).toEqual(['A01', 'B01', 'B04', 'B06', 'P01', ...PHASE3_IDS].sort());
      expect(checkAtlas(atlas(), phase13, { png, marks })).toEqual([]);
      // The independent spec table agrees with the records (sizes and headings).
      for (const id of PHASE3_IDS) {
        expect(p3(id).frameSize, id).toBe(P3_SPRITES[id]!.size);
        expect(p3(id).headings, id).toBe(P3_SPRITES[id]!.headings);
      }
    });

    it('packs the UX §6.2 frame counts per heading for each Phase 3 form', () => {
      const a = atlas();
      const per = (assetId: string, anim: string, h = 'e') => a.frames.filter((f) => f.key.startsWith(`${assetId}/${anim}/${h}/`)).length;
      for (const id of ['b03_dusk', 'b05_crossfeeder', 'b07_oilwick', 'b08_brothmaker']) {
        for (const h of ['e', 's', 'w', 'n']) expect(['move', 'reproduction', 'stress', 'death'].map((n) => per(id, n, h)), `${id} ${h}`).toEqual([4, 4, 2, 3]);
      }
      for (const id of ['b02_velvet', 'y01_bubble', 'y02_creambud']) expect(['idle', 'reproduction', 'stress', 'death'].map((n) => per(id, n)), id).toEqual([4, 4, 2, 3]);
      expect(['move', 'reproduction', 'stress', 'death'].map((n) => per('x01_hitcher', n))).toEqual([4, 4, 2, 3]);
      for (const id of ['p02_ciliate', 'p03_rotifer', 'p04_siltworm']) {
        for (const h of ['e', 's', 'w', 'n']) expect(['move', 'feed', 'reproduction', 'stress', 'death'].map((n) => per(id, n, h)), `${id} ${h}`).toEqual([6, 4, 4, 2, 4]);
      }
      for (const id of ['f01_threadlace', 'f02_cordweaver']) {
        expect(['mask', 'decaying', 'tip', 'bud', 'idle'].map((n) => per(id, n)), id).toEqual([16, 16, 1, 1, 1]);
        expect(a.sprites[id]!.headings).toBe(1);
      }
      expect(per('f02_cordweaver', 'pulse')).toBe(2);
      expect(['glyph', 'idle'].map((n) => per('v01_pinphage', n))).toEqual([1, 1]);
      expect(requiredFrames(16, 'fungus').map((r) => `${r.anims.join('|')}:${r.frames}`)).toEqual(['mask:16', 'decaying:16', 'tip:1', 'bud:1', 'idle:1']);
      expect(requiredFrames(16, 'virus').map((r) => `${r.anims.join('|')}:${r.frames}`)).toEqual(['glyph:1', 'idle:1']);
      // UI thumbnails (src/ui/atlas.ts drawFrame: move, else idle, facing East, frame 0) exist for every species.
      for (const r of phase13) {
        const s = a.sprites[r.assetId]!;
        const anim = s.animations.move ? 'move' : 'idle';
        expect(a.frames.some((f) => f.key === `${r.assetId}/${anim}/e/0`), r.id).toBe(true);
      }
    });

    it('removing one required frame of each kind gives exactly one error naming sprite, animation, heading and frame', () => {
      const cases: [string, string][] = [
        ['B07 (b07_oilwick)', 'b07_oilwick/stress/s/1'], // small, 4 headings
        ['Y02 (y02_creambud)', 'y02_creambud/idle/e/3'], // small, idle loop
        ['P03 (p03_rotifer)', 'p03_rotifer/feed/w/3'], // large
        ['F01 (f01_threadlace)', 'f01_threadlace/mask/e/10'], // fungus mask tile
        ['F02 (f02_cordweaver)', 'f02_cordweaver/tip/e/0'], // fungus overlay
        ['V01 (v01_pinphage)', 'v01_pinphage/glyph/e/0'], // virus glyph
      ];
      for (const [who, key] of cases) {
        const issues = all(without(atlas(), key));
        expect(issues, key).toHaveLength(1);
        expect(issues[0]).toMatchObject({ severity: 'error', path: `frames[${key}]`, message: `${who}: missing frame "${key}"` });
      }
    });

    it('requires the fungus and virus frame sets by category, not by size', () => {
      const a = atlas();
      delete (a.sprites.f01_threadlace!.animations as Record<string, unknown>).bud;
      a.sprites.f02_cordweaver!.animations.mask!.frames = 15;
      delete (a.sprites.v01_pinphage!.animations as Record<string, unknown>).idle;
      expect(all(a).map((i) => i.message)).toEqual([
        'F01 (f01_threadlace): missing required animation "bud" (1 frames × 1 heading(s))',
        'F02 (f02_cordweaver): "mask" has 15 frame(s), needs 16',
        'V01 (v01_pinphage): missing required animation "idle" (1 frames × 1 heading(s))',
      ]);
      // Under the small-organism rule the same fungus would need move/idle, reproduction, … — the category decides.
      const asSmall = checkAtlas(atlas(), [{ ...p3('F01'), category: 'bacterium' }]).map((i) => i.message);
      expect(asSmall).toContain('F01 (f01_threadlace): missing required animation "reproduction" (4 frames × 1 heading(s))');
    });

    it('requires F02 Cordweaver\'s transfer pulse (UX §6.3 "copper threads with pulse on transfer"), not only its fungus frames', () => {
      const a = atlas();
      delete (a.sprites.f02_cordweaver!.animations as Record<string, unknown>).pulse;
      a.frames = a.frames.filter((f) => !f.key.startsWith('f02_cordweaver/pulse/'));
      const issues = all(a);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        path: 'sprites.f02_cordweaver.animations.pulse',
        message: 'F02 (f02_cordweaver): missing required animation "pulse" (1 frames × 1 heading(s), UX §6.3 "pulse on transfer")',
      });
      // F01 has no pulse requirement: pulse is F02's identity, not a fungus-wide frame.
      expect(P3_SPRITES.F01!.extra).toBeUndefined();
    });

    it('enforces the Phase 3 sizes, headings and loops even if content and atlas agree on something weaker', () => {
      const weak = atlas();
      weak.sprites.p02_ciliate!.headings = 1;
      const refs = phase13.map((r) => (r.id === 'P02' ? { ...r, headings: 1 } : r));
      expect(checkAtlas(weak, refs).map((i) => i.message)).toContain('P02 (p02_ciliate): CT §1.3 / UX §6.2 requires 4 heading(s), atlas has 1');
      const noMove = atlas();
      const x = noMove.sprites.x01_hitcher!.animations;
      x.idle = x.move!;
      delete (x as Record<string, unknown>).move;
      expect(all(noMove).map((i) => i.message)).toContain('X01 (x01_hitcher): CT §1.3 / UX §6.2 requires a 4-frame "move" animation');
    });
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
      // Only the atlas error is asserted: other content errors (e.g. a stale contentHash mid-edit) are
      // reported by their own checks and must not make this test fail for an unrelated reason.
      expect(res.stderr).toMatch(/content: \d+ error\(s\)/);
    });

    it('npm run content:validate exits non-zero and names the mark frame when one is missing', () => {
      const manifestPath = join(dir, 'manifest.json');
      writeFileSync(manifestPath, JSON.stringify(without(atlas(), 'feature/resting_seam/w/1'), null, 1) + '\n');
      copyFileSync(join(ATLAS_DIR, 'organisms.png'), join(dir, 'organisms.png'));
      const tsx = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
      const res = spawnSync(tsx, [join(REPO_ROOT, 'tools', 'content-validate.ts'), '--atlas', manifestPath], { cwd: REPO_ROOT, encoding: 'utf8' });
      expect(res.status).toBe(1);
      expect(res.stderr).toContain('→ frames[feature/resting_seam/w/1]: E03 (resting_seam): missing frame "feature/resting_seam/w/1"');
      expect(res.stderr).toMatch(/content: \d+ error\(s\)/);
    });
  });
});
