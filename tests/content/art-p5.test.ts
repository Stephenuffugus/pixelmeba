/**
 * P5.7 art-small (the 16 px half of "24 organism sets; dormancy Prepare/Rest/Wake; trap
 * Open/Holding/Cooldown; Lantern Dim/Glow; Turnleaf modes; shell"): the 13 Phase 5 small sprites
 * (B09–B13, A02–A05, X02, F03, F04, V02) and the glow_center, jacket_rim and mode_half marks. None of
 * these species or modules is enabled before the organism flip (D-0104), so these tests read the art
 * and its records directly, as the Phase 3 art was checked before its flip (D-0046):
 *   - each sprite agrees with its species record and the validator's independent P5_SPRITES row;
 *   - small bodies are 8–12 px with a clear 1 px margin (UX §6.2, D-0046);
 *   - every required frame set is there, including `dormant` (B12, F04) and `trap` (F03) with exactly 3;
 *   - a colour belongs to the state it shows (D-0046): lime only while glowing, the trap loop only in
 *     trap frames, amber only in Sugar mode;
 *   - the marks map to their recorded facts (glowState, jacket coverage bands, metabolicMode);
 *   - tools/art-build.ts refuses a short `dormant`, a missing glow_center and a sheet over the cap;
 *   - every Phase 1 and Phase 3 frame (and every Phase 2–3 mark and world tile) in the committed
 *     atlas is byte-identical to the v1.0.0-rc1 atlas (pinned digest of the packed pixels).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { SPRITES } from '../../art/src/index';
import { ATLAS_FEATURE_LAYERS, FEATURE_LAYERS, type AtlasFeatureLayerId, type FeatureLayerDef } from '../../art/src/layers/modules';
import { FEATURE_LAYER_IDS } from '../../src/render/features';
import { P } from '../../art/src/palette';
import { Px } from '../../art/src/px';
import { FUNGUS_REQUIRED, NATIVE_ABILITY_FRAMES, SMALL_REQUIRED, SMALL_STATIC_REQUIRED, VIRUS_REQUIRED, type AnimName, type SpriteDef } from '../../art/src/sprite';
import { ATLAS_MAX_H, atlasSizeError, buildAtlas } from '../../tools/art-build';
import { atlasSpeciesRef, checkAtlas, FEATURE_FRAMES, NATIVE_MARKS, nativeMarks, P5_SPRITES } from '../../tools/content-validate';
import { loadRegistryFs, REPO_ROOT } from '../../tools/lib/content-fs';

const reg = loadRegistryFs();
const P5_IDS = ['A02', 'A03', 'A04', 'A05', 'B09', 'B10', 'B11', 'B12', 'B13', 'F03', 'F04', 'V02', 'X02'];
const sprite = (id: string): SpriteDef => {
  const d = SPRITES.find((s) => s.speciesId === id);
  if (!d) throw new Error(`no sprite for ${id}`);
  return d;
};
const layer = (id: string): FeatureLayerDef<AtlasFeatureLayerId> => ATLAS_FEATURE_LAYERS.find((l) => l.id === id)!;
const p5 = P5_IDS.map(sprite);

/** Palette indices of a hex colour in a palette (index 0 is transparent). */
const indicesOf = (palette: readonly string[], hex: string): number[] => palette.flatMap((c, i) => (i > 0 && c.toUpperCase() === hex.toUpperCase() ? [i] : []));
const uses = (f: Px, idx: readonly number[]) => Array.from(f.data).filter((v) => idx.includes(v)).length;

/** Every frame that draws `hex`: sprites ("<asset>/<anim>/<frame>"), marks ("mark <layer>/<frame>"). */
function framesUsing(hex: string): string[] {
  const out: string[] = [];
  for (const d of SPRITES) {
    const idx = indicesOf(d.palette, hex);
    if (idx.length === 0) continue;
    for (const [name, a] of Object.entries(d.animations)) a.frames.forEach((f, i) => uses(f, idx) > 0 && out.push(`${d.assetId}/${name}/${i}`));
  }
  for (const l of ATLAS_FEATURE_LAYERS) {
    const idx = indicesOf(l.palette, hex);
    l.frames.forEach((f, i) => idx.length > 0 && uses(f, idx) > 0 && out.push(`mark ${l.id}/${i}`));
  }
  return out;
}

describe('Phase 5 small sprites agree with their species records and the validator (P5.7)', () => {
  it('registers exactly the 13 art-small sprites after the Phase 1 and Phase 3 ones, by species id', () => {
    const ids = SPRITES.map((d) => d.speciesId);
    expect(ids.slice(19, 19 + P5_IDS.length)).toEqual(P5_IDS);
    expect(Object.entries(P5_SPRITES).filter(([, spec]) => spec.size === 16).map(([id]) => id).sort()).toEqual(P5_IDS);
    // Nothing here is enabled: the organism flip (D-0104) turns them on.
    for (const id of P5_IDS) expect(reg.manifest.enabledSpecies, id).not.toContain(id);
  });

  it.each(P5_IDS)('%s: assetId, frameSize, headings and form match the record; size, headings and loop match P5_SPRITES', (id) => {
    const d = sprite(id);
    const sp = reg.species[id]!;
    expect(sp.phase).toBe(5);
    expect(d.assetId).toBe(sp.assetId);
    expect(d.size).toBe(sp.frameSize);
    expect(d.headings).toBe(sp.headings);
    expect(d.form ?? 'organism').toBe(sp.category === 'fungus' ? 'fungus' : sp.category === 'virus' ? 'virus' : 'organism');
    const spec = P5_SPRITES[id]!;
    expect(d.size).toBe(spec.size);
    expect(d.headings).toBe(spec.headings);
    if (spec.loop) {
      expect(d.animations[spec.loop as AnimName]?.frames.length, `${id} loop ${spec.loop}`).toBe(4);
      // The loop follows CT §1.3: motile bodies move, non-motile ones idle (never both).
      const motile = (sp as unknown as { speed?: number }).speed;
      if (typeof motile === 'number') expect(spec.loop).toBe(motile > 0 ? 'move' : 'idle');
      expect(d.animations[spec.loop === 'move' ? 'idle' : 'move']).toBeUndefined();
    }
  });

  it('every required frame count, per form, plus exactly 3 dormant (B12, F04) and 3 trap (F03) frames', () => {
    for (const d of p5) {
      const need = d.form === 'fungus' ? FUNGUS_REQUIRED : d.form === 'virus' ? VIRUS_REQUIRED : d.animations.idle ? SMALL_STATIC_REQUIRED : SMALL_REQUIRED;
      for (const [name, n] of Object.entries(need)) expect(d.animations[name as AnimName]?.frames.length, `${d.assetId} ${name}`).toBeGreaterThanOrEqual(n);
      for (const extra of P5_SPRITES[d.speciesId]!.extra ?? []) expect(d.animations[extra.anims[0] as AnimName]?.frames.length, `${d.assetId} ${extra.anims[0]!}`).toBe(extra.frames);
      for (const a of Object.values(d.animations)) for (const f of a.frames) expect([f.w, f.h]).toEqual([16, 16]);
    }
    expect(sprite('B12').animations.dormant!.frames).toHaveLength(3);
    expect(sprite('F04').animations.dormant!.frames).toHaveLength(3);
    expect(sprite('F03').animations.trap!.frames).toHaveLength(3);
    // The frame sets belong to the native state machines and to nothing else.
    for (const d of SPRITES) {
      const abilities = reg.species[d.speciesId]!.nativeAbilities as readonly string[];
      expect(d.animations.dormant !== undefined, `${d.assetId} dormant`).toBe(abilities.includes('DORMANCY'));
      expect(d.animations.trap !== undefined, `${d.assetId} trap`).toBe(abilities.includes('TRAP'));
    }
    expect(NATIVE_ABILITY_FRAMES).toEqual({
      DORMANCY: { anim: 'dormant', frames: 3, states: 'Preparing, Resting, Waking' },
      TRAP: { anim: 'trap', frames: 3, states: 'Open, Holding, Cooldown' },
    });
    // Still poses: never a loop, so the renderer holds the state's frame (src/render/features.ts bodyFrameIndex).
    for (const a of [sprite('B12').animations.dormant!, sprite('F04').animations.dormant!, sprite('F03').animations.trap!]) expect(a.loop).toBe(false);
  });

  it('dormant poses differ from each other and from the body; the trap states differ from each other', () => {
    const differ = (a: Px, b: Px) => a.data.some((v, i) => v !== b.data[i]);
    for (const [id, name] of [['B12', 'dormant'], ['F04', 'dormant'], ['F03', 'trap']] as const) {
      const f = sprite(id).animations[name]!.frames;
      expect(differ(f[0]!, f[1]!) && differ(f[1]!, f[2]!) && differ(f[0]!, f[2]!), `${id} ${name}`).toBe(true);
    }
    // B12 Resting is the folded pose: shorter than the active oval and taller than it.
    const box = (f: Px) => f.bounds()!;
    const active = box(sprite('B12').animations.move!.frames[0]!);
    const resting = box(sprite('B12').animations.dormant!.frames[1]!);
    expect(resting.x1 - resting.x0).toBeLessThan(active.x1 - active.x0);
    expect(resting.y1 - resting.y0).toBeGreaterThan(active.y1 - active.y0);
  });
});

describe('small body size (UX §6.2 "16×16 frames, 8–12 px visible body"; D-0046 1 px margin)', () => {
  const organisms = p5.filter((d) => !d.form);
  it('covers the ten Phase 5 small organisms', () => {
    expect(organisms.map((d) => d.speciesId).sort()).toEqual(['A02', 'A03', 'A04', 'A05', 'B09', 'B10', 'B11', 'B12', 'B13', 'X02']);
  });
  it.each(organisms.map((d) => [d.speciesId, d] as const))('%s: every loop (and dormant) frame has an 8–12 px body and a clear 1 px margin', (id, d) => {
    const frames = [...(d.animations.move ?? d.animations.idle)!.frames, ...(d.animations.dormant?.frames ?? [])];
    frames.forEach((f, i) => {
      let bx0 = 16, by0 = 16, bx1 = -1, by1 = -1;
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const v = f.get(x, y);
          if (v === 0 || v === 1) continue;
          [bx0, by0, bx1, by1] = [Math.min(bx0, x), Math.min(by0, y), Math.max(bx1, x), Math.max(by1, y)];
        }
      const long = Math.max(bx1 - bx0 + 1, by1 - by0 + 1);
      expect(long, `${id} frame ${i}`).toBeGreaterThanOrEqual(8);
      expect(long, `${id} frame ${i}`).toBeLessThanOrEqual(12);
      const all = f.bounds()!;
      expect([all.x0, all.y0], `${id} frame ${i} touches the top/left edge`).not.toContain(0);
      expect([all.x1, all.y1], `${id} frame ${i} touches the bottom/right edge`).not.toContain(15);
    });
  });
});

describe('a colour belongs to the state it shows (D-0046; CLAUDE.md "every visible feature maps to real state")', () => {
  it('Lantern lime #C6F04D appears only in glow_center\'s glow frame (glowState 1), never in a body', () => {
    expect(P.lanternLime.toUpperCase()).toBe('#C6F04D');
    expect(framesUsing(P.lanternLime)).toEqual(['mark glow_center/1']);
    // B09's tiny center is a dim tone in every body frame.
    const b09 = sprite('B09');
    const core = indicesOf(b09.palette, P.lanternCore);
    for (const f of b09.animations.move!.frames) expect(uses(f, core)).toBeGreaterThan(0);
  });

  it('the Traplace loop colour appears only in its Open and Holding trap frames', () => {
    expect(framesUsing(P.traplaceLoop)).toEqual(['f03_traplace/trap/0', 'f03_traplace/trap/1']);
    // Cooldown is a slack, dimmer loop: its own tone, lighter than the held loop.
    const f03 = sprite('F03');
    expect(uses(f03.animations.trap!.frames[2]!, indicesOf(f03.palette, P.traplaceSlack))).toBeGreaterThan(0);
  });

  it('Turnleaf amber appears only in mode_half\'s sugar frame (no A04 body frame claims a mode)', () => {
    expect(framesUsing(P.turnleafAmber)).toEqual(['mark mode_half/1']);
    expect(framesUsing(P.turnleafAmberLight)).toEqual(['mark mode_half/1']);
    // Both halves of the A04 body are drawn in the same tones: over its move loop (the glint visits both
    // halves) the West and East halves use the same palette indices.
    const half = (west: boolean) => {
      const s = new Set<number>();
      for (const body of sprite('A04').animations.move!.frames)
        for (let y = 0; y < 16; y++) for (let x = west ? 0 : 9; x < (west ? 8 : 16); x++) if (body.get(x, y) > 1) s.add(body.get(x, y));
      return [...s].sort();
    };
    expect(half(true)).toEqual(half(false));
  });

  it('X02 differs from X01 in alpha (filled vs hollow diamond) and V02 from V01 (lace vs head-and-tail)', () => {
    const alpha = (a: Px, b: Px) => {
      let union = 0, xor = 0;
      for (let i = 0; i < 256; i++) {
        const ia = a.data[i]! > 0, ib = b.data[i]! > 0;
        if (ia || ib) union++;
        if (ia !== ib) xor++;
      }
      return xor / union;
    };
    expect(alpha(sprite('X01').animations.move!.frames[0]!, sprite('X02').animations.move!.frames[0]!)).toBeGreaterThanOrEqual(0.12);
    expect(alpha(sprite('V01').animations.glyph!.frames[0]!, sprite('V02').animations.glyph!.frames[0]!)).toBeGreaterThanOrEqual(0.12);
  });
});

describe('Phase 5 feature marks map to recorded facts (ARCH §10.1, UX §6.2/§6.5, SPEC §7.8/§7.10/§9 E11)', () => {
  const dist = (x: number, y: number) => Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
  const pixels = (f: Px) => {
    const out: [number, number, number][] = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (f.get(x, y)) out.push([x, y, f.get(x, y)]);
    return out;
  };

  it('FEATURE_LAYERS is the renderer vocabulary; the Phase 5 marks are appended to it, after the v1.0 layers (wave 13, D-0109/D-0112)', () => {
    // tests/sim/module-visuals.test.ts pins FEATURE_LAYERS to src/render FEATURE_LAYER_IDS (type and
    // order). Re-pinned in wave 13 (org-ui, D-0109/D-0112): the five Phase 5 marks moved from the former
    // PHASE5_FEATURE_LAYERS into FEATURE_LAYERS and FEATURE_LAYER_IDS, in their packing order.
    expect(FEATURE_LAYERS.map((l) => l.id)).toEqual([...FEATURE_LAYER_IDS]);
    expect(FEATURE_LAYERS.slice(10).map((l) => l.id)).toEqual(['glow_center', 'jacket_rim', 'mode_half', 'handling_arc', 'trap_loop']);
    for (const id of ['glow_center', 'jacket_rim', 'mode_half']) expect(FEATURE_LAYER_IDS as readonly string[], id).toContain(id);
    // The atlas packs exactly the renderer's layers, the v1.0 ten first, so the shipped marks keep their positions.
    expect(ATLAS_FEATURE_LAYERS).toEqual(FEATURE_LAYERS);
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'public', 'atlas', 'manifest.json'), 'utf8')) as { features: Record<string, unknown> };
    expect(Object.keys(manifest.features)).toEqual(ATLAS_FEATURE_LAYERS.map((l) => l.id));
  });

  it('the three marks are packed with their validator frame counts and names', () => {
    // Re-pinned in wave 13 (org-ui, D-0109): the marks follow the ten v1.0 layers inside FEATURE_LAYERS now.
    expect(ATLAS_FEATURE_LAYERS.slice(10, 13).map((l) => l.id)).toEqual(['glow_center', 'jacket_rim', 'mode_half']);
    for (const id of ['glow_center', 'jacket_rim', 'mode_half']) {
      expect(layer(id).frames, id).toHaveLength(FEATURE_FRAMES[id]!.frames);
      expect(layer(id).frameNames, id).toHaveLength(FEATURE_FRAMES[id]!.frames);
    }
    expect(NATIVE_MARKS).toEqual({ SIGNAL_GLOW: 'glow_center', MIXOTROPHY: 'mode_half' });
    // E02 and E11 use the same marks as content visualLayers.
    expect(reg.modules.E02!.visualLayer).toBe('glow_center');
    expect(reg.modules.E11!.visualLayer).toBe('jacket_rim');
  });

  it('glow_center: dim is a small pale center; glow is a bright center and a 2 px halo just outside a 12 px body', () => {
    const [dim, glow] = layer('glow_center').frames as [Px, Px];
    const dimBox = dim.bounds()!;
    expect(dimBox.x1 - dimBox.x0 + 1).toBeLessThanOrEqual(2);
    const halo = pixels(glow).filter(([, , v]) => v === 3);
    const lime = pixels(glow).filter(([, , v]) => v === 2);
    expect(lime.length).toBeGreaterThan(pixels(dim).length);
    for (const [x, y] of lime) expect(dist(x, y)).toBeLessThan(2.5);
    // The halo sits within 2 px outside the body radius (6: a 12 px body), never farther.
    expect(halo.length).toBeGreaterThan(0);
    for (const [x, y] of halo) expect(dist(x, y) >= 6 && dist(x, y) < 8).toBe(true);
    // Pixels exist at distance 2 outside the dim extent (Chebyshev), and outside B09's whole body.
    expect(pixels(glow).some(([x, y]) => Math.max(dimBox.x0 - x, x - dimBox.x1, dimBox.y0 - y, y - dimBox.y1) >= 2)).toBe(true);
    const b09 = sprite('B09').animations.move!.frames[0]!;
    expect(halo.some(([x, y]) => b09.get(x, y) === 0)).toBe(true);
  });

  it('jacket_rim: levels 0–3 strictly gain rim pixels and always keep the East soft-body gap', () => {
    const frames = layer('jacket_rim').frames;
    const counts = frames.map((f) => f.count());
    for (let k = 1; k < 4; k++) expect(counts[k]!, `level ${k}`).toBeGreaterThan(counts[k - 1]!);
    expect(counts[0]).toBeGreaterThan(0);
    for (const f of frames) {
      for (const [x, y] of pixels(f)) {
        const deg = Math.abs((Math.atan2(y + 0.5 - 8, x + 0.5 - 8) * 180) / Math.PI);
        expect(deg, `rim pixel (${x}, ${y}) in the soft-body gap`).toBeGreaterThan(45);
      }
      // Each level only adds plates: the previous level is contained in it.
    }
    for (let k = 1; k < 4; k++) for (const [x, y] of pixels(frames[k - 1]!)) expect(frames[k]!.get(x, y)).toBeGreaterThan(0);
  });

  it('mode_half: photo brightens the leading (East) half, sugar the trailing (West) half, both on A04 body pixels only', () => {
    const [photo, sugar] = layer('mode_half').frames as [Px, Px];
    expect(pixels(photo).length).toBeGreaterThan(0);
    expect(pixels(sugar).length).toBeGreaterThan(0);
    for (const [x] of pixels(photo)) expect(x).toBeGreaterThanOrEqual(9);
    for (const [x] of pixels(sugar)) expect(x).toBeLessThanOrEqual(7);
    for (const f of sprite('A04').animations.move!.frames) {
      for (const [x, y] of [...pixels(photo), ...pixels(sugar)]) expect(f.get(x, y), `(${x}, ${y}) is A04 body`).toBeGreaterThan(1);
    }
    // Photo is lighter than the body, sugar is amber (the colour Sugar mode owns).
    expect(indicesOf(layer('mode_half').palette, P.turnleafAmber).some((i) => uses(sugar, [i]) > 0)).toBe(true);
    expect(indicesOf(layer('mode_half').palette, P.turnleafAmber).some((i) => uses(photo, [i]) > 0)).toBe(false);
  });
});

describe('tools/art-build.ts refuses Phase 5 art that breaks a rule (validate)', () => {
  const replace = (id: string, edit: (d: SpriteDef) => SpriteDef) => SPRITES.map((d) => (d.speciesId === id ? edit(d) : d));

  it('the real art builds with no errors', () => {
    expect(buildAtlas().errors).toEqual([]);
  });

  it('a B12 without one of its three dormant frames fails, naming the rule', () => {
    const short = replace('B12', (d) => ({ ...d, animations: { ...d.animations, dormant: { ...d.animations.dormant!, frames: d.animations.dormant!.frames.slice(0, 2), reducedMotionFrame: 1 } } }));
    expect(buildAtlas({ sprites: short }).errors).toContain('b12_sleeper: "dormant" has 2 frames; native DORMANCY needs exactly 3 (Preparing, Resting, Waking)');
    const none = replace('F03', (d) => {
      const { trap: _trap, ...rest } = d.animations;
      return { ...d, animations: rest };
    });
    expect(buildAtlas({ sprites: none }).errors).toContain('f03_traplace: native TRAP needs "trap" (3 frames: Open, Holding, Cooldown)');
    // A dormancy pose on a species that cannot rest is refused too.
    const extra = replace('B10', (d) => ({ ...d, animations: { ...d.animations, dormant: sprite('B12').animations.dormant! } }));
    expect(buildAtlas({ sprites: extra }).errors).toContain('b10_brinecoil: "dormant" frames without native DORMANCY (no recorded state shows them)');
  });

  it('removing glow_center (or mode_half) fails for the species whose native ability needs it', () => {
    const errors = buildAtlas({ layers: ATLAS_FEATURE_LAYERS.filter((l) => l.id !== 'glow_center' && l.id !== 'mode_half') }).errors;
    expect(errors).toContain('B09: native SIGNAL_GLOW needs feature mark "glow_center" in art/src/layers');
    expect(errors).toContain('A04: native MIXOTROPHY needs feature mark "mode_half" in art/src/layers');
  });

  it('a sheet taller than 1024×2048 fails with the cap message', () => {
    expect(ATLAS_MAX_H).toBe(2048);
    expect(atlasSizeError(1024, 2048)).toBeNull();
    expect(atlasSizeError(1024, 4096)).toBe('atlas would be 1024x4096; the cap is 1024x2048 (assumed safe WebGL texture height on low-end Android, ARCH §10.1)');
    // 48 px frames: 20 per 1024 px shelf of 52 px; 900 more frames need ~45 shelves → over 2048.
    const big = new Px(48, 48).fillRect(4, 4, 40, 40, 1);
    const tall: SpriteDef = { ...sprite('A02'), size: 48, animations: { ...sprite('A02').animations, idle: { frames: Array.from({ length: 900 }, () => big), durationMs: 100, loop: true, reducedMotionFrame: 0 } } };
    const errors = buildAtlas({ sprites: SPRITES.map((d) => (d.speciesId === 'A02' ? tall : d)) }).errors;
    expect(errors.some((e) => /^atlas would be 1024x\d+; the cap is 1024x2048 \(assumed safe WebGL texture height on low-end Android, ARCH §10\.1\)$/.test(e))).toBe(true);
  });
});

describe('the committed atlas (npm run art:build)', () => {
  const dir = join(REPO_ROOT, 'public', 'atlas');
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
    width: number;
    height: number;
    frames: { key: string; x: number; y: number; w: number; h: number; speciesId?: string; layer?: string; tile?: string }[];
  };
  const img = PNG.sync.read(readFileSync(join(dir, 'organisms.png')));

  it('is complete for every Phase 5 small species record and stays within the 1024×2048 cap', () => {
    const refs = P5_IDS.map((id) => atlasSpeciesRef(reg.species[id]!));
    // As if the organism flip had enabled them: their frames, their native marks and E02/E11's marks.
    const marks = [
      ...nativeMarks({ manifest: { enabledSpecies: P5_IDS }, species: reg.species }),
      { moduleId: 'E02', layer: 'glow_center' },
      { moduleId: 'E11', layer: 'jacket_rim' },
    ];
    expect(marks.map((m) => `${m.moduleId}:${m.layer}`)).toEqual(['A04 MIXOTROPHY:mode_half', 'B09 SIGNAL_GLOW:glow_center', 'E02:glow_center', 'E11:jacket_rim']);
    expect(checkAtlas(manifest, refs, { marks })).toEqual([]);
    expect(manifest.width).toBe(1024);
    expect(manifest.height).toBeLessThanOrEqual(ATLAS_MAX_H);
    // Dropping a dormant frame or the glow mark from the packed atlas is reported by content:validate too.
    const noDormant = { ...manifest, frames: manifest.frames.filter((f) => f.key !== 'b12_sleeper/dormant/n/2') };
    expect(checkAtlas(noDormant, refs).map((i) => i.message)).toEqual(['B12 (b12_sleeper): missing frame "b12_sleeper/dormant/n/2"']);
    const shortTable = JSON.parse(JSON.stringify(manifest)) as { sprites: Record<string, { animations: Record<string, unknown> }> };
    delete shortTable.sprites.b12_sleeper!.animations.dormant;
    expect(checkAtlas(shortTable, refs).map((i) => i.message)).toContain('B12 (b12_sleeper): missing required animation "dormant" (3 frames × 4 heading(s), ARCH §10.1 "dormancy prepare/rest/wake")');
    const noGlow = JSON.parse(JSON.stringify(manifest)) as { features: Record<string, unknown> };
    delete noGlow.features.glow_center;
    expect(checkAtlas(noGlow, refs, { marks }).map((i) => i.message)).toEqual([
      'enabled species B09 SIGNAL_GLOW (glow_center) has no feature mark in the atlas (run npm run art:build)',
      'enabled module E02 (glow_center) has no feature mark in the atlas (run npm run art:build)',
    ]);
  });

  it('every Phase 1 and Phase 3 sprite frame, Phase 2–3 mark frame and world tile is byte-identical to the v1.0.0-rc1 atlas', () => {
    const OLD_SPECIES = ['A01', 'B01', 'B04', 'B06', 'P01', 'B02', 'B03', 'B05', 'B07', 'B08', 'F01', 'F02', 'P02', 'P03', 'P04', 'V01', 'X01', 'Y01', 'Y02'];
    const OLD_LAYERS = ['starch_notch', 'reserve_pocket', 'resting_seam', 'anchor_foot', 'shade_patch', 'light_trail', 'debris_granule', 'protein_notches', 'matrix_edge', 'adhesion_link'];
    const old = manifest.frames
      // The v1.0 world tiles; wave 11's Phase 5 'device' tile (appended last, tests/render/structure-layers.test.ts) is not a v1.0 frame.
      .filter((f) => (f.speciesId !== undefined && OLD_SPECIES.includes(f.speciesId)) || (f.layer !== undefined && OLD_LAYERS.includes(f.layer)) || (f.tile !== undefined && f.tile !== 'device'))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const h = createHash('sha256');
    for (const f of old) {
      h.update(f.key);
      for (let y = 0; y < f.h; y++) h.update(img.data.subarray(((f.y + y) * img.width + f.x) * 4, ((f.y + y) * img.width + f.x + f.w) * 4));
    }
    // 856 frames; digest of the same frames read from the rc1 atlas (git show v1.0.0-rc1:public/atlas/…).
    expect(old).toHaveLength(856);
    expect(h.digest('hex')).toBe('2a0a089e66a63d16f58e045bfd21b1c902a2f66b9412fa27cabee918c66beaad');
  });
});
