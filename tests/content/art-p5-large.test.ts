/**
 * P5.7 art-large (the large half of "24 organism sets; dormancy Prepare/Rest/Wake …"; P5.5 "48x48
 * frames for P08/P10"; UX §6.5 "handling arc, trap loop"): the six Phase 5 large consumers P05–P10 and
 * the handling_arc and trap_loop effect marks. Nothing here is enabled before the organism flip
 * (D-0104), so these tests read the art and its records directly, as art-p5.test.ts does for the small half:
 *   - each sprite agrees with its species record and the validator's independent P5_SPRITES row;
 *   - every UX §6.2 large count (6 move, 4 feed, 4 reproduction, 2 stress, 4 death), and P08's 3 dormant;
 *   - each UX §6.1 accent appears only in the part UX §6.3 names (scallop rim, stalk, two tail pixels,
 *     eight legs, crown wheel, front fork), and the motion shows only what the body does (P06's stalk and
 *     P09's body stay still in `move`; P08's trunk keeps its place while its legs step);
 *   - handling_arc grows strictly with the handling quarter; trap_loop's closing loop is open and its
 *     holding loop closed;
 *   - tools/art-build.ts refuses P08 without its dormant poses and an atlas without handling_arc;
 *   - every frame packed before this wave (Phase 1, 3 and stage 1's Phase 5 frames and marks, and the
 *     world tiles) is byte-identical to the wave 8a atlas (commit 60a4731).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { SPRITES } from '../../art/src/index';
import { ATLAS_FEATURE_LAYERS, FEATURE_LAYERS, PHASE5_FEATURE_LAYERS, type AtlasFeatureLayerId, type FeatureLayerDef } from '../../art/src/layers/modules';
import { P } from '../../art/src/palette';
import type { Px } from '../../art/src/px';
import { LARGE_REQUIRED, type AnimName, type SpriteDef } from '../../art/src/sprite';
import { ATLAS_MAX_H, buildAtlas } from '../../tools/art-build';
import { atlasSpeciesRef, checkAtlas, EFFECT_MARKS, effectMarks, P5_SPRITES } from '../../tools/content-validate';
import { loadRegistryFs, REPO_ROOT } from '../../tools/lib/content-fs';

const reg = loadRegistryFs();
const P5_LARGE = ['P05', 'P06', 'P07', 'P08', 'P09', 'P10'];
const sprite = (id: string): SpriteDef => {
  const d = SPRITES.find((s) => s.speciesId === id);
  if (!d) throw new Error(`no sprite for ${id}`);
  return d;
};
const layer = (id: string): FeatureLayerDef<AtlasFeatureLayerId> => ATLAS_FEATURE_LAYERS.find((l) => l.id === id)!;
const frames = (id: string, anim: AnimName): readonly Px[] => sprite(id).animations[anim]!.frames;

const indicesOf = (palette: readonly string[], hex: string): number[] => palette.flatMap((c, i) => (i > 0 && c.toUpperCase() === hex.toUpperCase() ? [i] : []));
const pixelsOf = (f: Px, idx: readonly number[]): [number, number][] => {
  const out: [number, number][] = [];
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (idx.includes(f.get(x, y))) out.push([x, y]);
  return out;
};
/** The accent's palette indices in its own sprite (exactly one). */
const accent = (id: string, hex: string): number[] => {
  const idx = indicesOf(sprite(id).palette, hex);
  expect(idx, `${id} ${hex}`).toHaveLength(1);
  return idx;
};
/** 4-connected components of a pixel set. */
function components(pts: readonly [number, number][]): [number, number][][] {
  const left = new Set(pts.map(([x, y]) => `${x},${y}`));
  const out: [number, number][][] = [];
  for (const [sx, sy] of pts) {
    if (!left.delete(`${sx},${sy}`)) continue;
    const comp: [number, number][] = [[sx, sy]];
    for (let k = 0; k < comp.length; k++) {
      const [x, y] = comp[k]!;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) if (left.delete(`${nx},${ny}`)) comp.push([nx, ny]);
    }
    out.push(comp);
  }
  return out;
}
/** Frames an organism shows in its ordinary states (death erodes to remains colours). */
const living = (id: string): Px[] => (['move', 'feed', 'reproduction', 'stress'] as const).flatMap((a) => [...frames(id, a)]);

describe('Phase 5 large sprites agree with their species records and the validator (P5.7 art-large)', () => {
  it('registers exactly the six large sprites after stage 1\'s, by species id; none is enabled', () => {
    expect(SPRITES.map((d) => d.speciesId).slice(32)).toEqual(P5_LARGE);
    for (const id of P5_LARGE) expect(P5_SPRITES[id], id).toBeDefined();
    for (const id of P5_LARGE) expect(reg.manifest.enabledSpecies, id).not.toContain(id);
  });

  it.each(P5_LARGE)('%s: assetId, frameSize, headings and form match the record and P5_SPRITES; it loops `move`', (id) => {
    const d = sprite(id);
    const sp = reg.species[id]!;
    expect(sp.phase).toBe(5);
    expect([d.assetId, d.size, d.headings, d.form ?? 'organism']).toEqual([sp.assetId, sp.frameSize, sp.headings, 'organism']);
    const spec = P5_SPRITES[id]!;
    expect([d.size, d.headings, spec.loop]).toEqual([spec.size, spec.headings, 'move']);
    // UX §6.2: P01–P07 and P09 are 32×32, P08 and P10 48×48; CT §1.3 motion gives P05, P06, P09 one heading.
    expect(d.size).toBe(id === 'P08' || id === 'P10' ? 48 : 32);
    expect(d.headings).toBe(['P05', 'P06', 'P09'].includes(id) ? 1 : 4);
    expect(d.animations.idle).toBeUndefined();
    for (const a of Object.values(d.animations)) for (const f of a.frames) expect([f.w, f.h]).toEqual([d.size, d.size]);
  });

  it('every UX §6.2 large count exactly, and P08 alone has its three still dormant poses (SPEC §7.6)', () => {
    expect(LARGE_REQUIRED).toEqual({ move: 6, feed: 4, reproduction: 4, stress: 2, death: 4 });
    for (const id of P5_LARGE) {
      for (const [name, n] of Object.entries(LARGE_REQUIRED)) expect(frames(id, name as AnimName), `${id} ${name}`).toHaveLength(n);
      expect(sprite(id).animations.dormant !== undefined, `${id} dormant`).toBe(id === 'P08');
      expect(sprite(id).animations.trap, id).toBeUndefined();
    }
    expect(P5_SPRITES.P08!.extra).toEqual([{ anims: ['dormant'], frames: 3, rule: expect.stringContaining('dormancy prepare/rest/wake') as string }]);
    const dormant = sprite('P08').animations.dormant!;
    expect(dormant.frames).toHaveLength(3);
    expect(dormant.loop).toBe(false);
    const differ = (a: Px, b: Px) => a.data.some((v, i) => v !== b.data[i]);
    const [prep, rest, wake] = dormant.frames as [Px, Px, Px];
    expect(differ(prep, rest) && differ(rest, wake) && differ(prep, wake)).toBe(true);
  });
});

describe('each UX §6.1 accent is only in the part UX §6.3 names (D-0046 "a colour belongs to what it shows")', () => {
  const ACCENTS: Record<string, string> = {
    P05: P.shellgliderScallop,
    P06: P.bellstalkStalk,
    P07: P.dartfinTail,
    P08: P.waterbearLegs,
    P09: P.wheelgrazerWheel,
    P10: P.needlejawFork,
  };

  it('no other sprite and no mark uses a large consumer\'s accent; base colours are the UX §6.1 bases', () => {
    const BASES: Record<string, string> = { P05: '#EADFC8', P06: '#A9C7E6', P07: '#5CC8D8', P08: '#9C8A6E', P09: '#D77FA0', P10: '#3B5FB4' };
    expect(Object.values(ACCENTS).map((h) => h.toUpperCase())).toEqual(['#9C8B6A', '#5E7EA3', '#1F6F7A', '#5E5040', '#F7DCE8', '#B7C6EE']);
    for (const id of P5_LARGE) {
      expect(sprite(id).palette[2]!.toUpperCase(), id).toBe(BASES[id]);
      for (const d of SPRITES) if (d.speciesId !== id) expect(indicesOf(d.palette, ACCENTS[id]!), `${d.assetId} uses ${id}'s accent`).toEqual([]);
      for (const l of ATLAS_FEATURE_LAYERS) expect(indicesOf(l.palette, ACCENTS[id]!), `mark ${l.id} uses ${id}'s accent`).toEqual([]);
    }
  });

  it('P05: the scallop colour is only the shell rim (within 2 px of the outline), in every living frame', () => {
    const sc = accent('P05', ACCENTS.P05!);
    for (const f of living('P05')) {
      const rim = pixelsOf(f, sc);
      // The shell is part of the body (boundMineral from inoculation): every living frame carries it.
      expect(rim.length).toBeGreaterThan(20);
      for (const [x, y] of rim) {
        let near = false;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (f.get(x + dx, y + dy) === 1) near = true;
        expect(near, `scallop pixel (${x}, ${y}) inside the shell`).toBe(true);
      }
    }
  });

  it('P06: the stalk colour is only below the bell, the stalk reaches the foot plate, and `move` never moves it', () => {
    const st = accent('P06', ACCENTS.P06!);
    const bellIdx = [2, 3, 5]; // base, deep, light: the bell
    for (const f of living('P06')) {
      for (const [x, y] of pixelsOf(f, st)) for (let yy = y + 1; yy < 32; yy++) expect(bellIdx.includes(f.get(x, yy)), `stalk (${x}, ${y}) above bell (${x}, ${yy})`).toBe(false);
    }
    const move = frames('P06', 'move');
    const stalk0 = pixelsOf(move[0]!, st);
    // Attached (CT §1.3 speed 0, attachment surfaces): the foot plate is the widest stalk row, at the bottom.
    const foot = stalk0.filter(([, y]) => y === Math.max(...stalk0.map(([, yy]) => yy)));
    expect(foot.length).toBeGreaterThanOrEqual(6);
    for (const f of move) expect(pixelsOf(f, st)).toEqual(stalk0);
    // The bell does contract (the frames differ), always above the same stalk.
    expect(new Set(move.map((f) => f.toStrings().join('\n'))).size).toBeGreaterThan(2);
  });

  it('P07: exactly two tail pixels behind the tip in every move, feed and stress frame (two per daughter while dividing)', () => {
    const tail = accent('P07', ACCENTS.P07!);
    for (const f of [...frames('P07', 'move'), ...frames('P07', 'feed'), ...frames('P07', 'stress')]) {
      const t = pixelsOf(f, tail);
      expect(t).toHaveLength(2);
      const bodyX = pixelsOf(f, [2, 3, 5, 6, 9]).map(([x]) => x);
      for (const [x] of t) expect(x).toBeLessThan(Math.min(...bodyX));
      expect(Math.max(Math.abs(t[0]![0] - t[1]![0]), Math.abs(t[0]![1] - t[1]![1]))).toBe(1);
    }
    expect(frames('P07', 'reproduction').map((f) => pixelsOf(f, tail).length)).toEqual([2, 2, 4, 4]);
    // Fast (3.0 cells/s) reads from short frames and a whipping tail, not blur: the tail is in a different place in most frames.
    expect(sprite('P07').animations.move!.durationMs).toBeLessThan(sprite('P02').animations.move!.durationMs);
    expect(new Set(frames('P07', 'move').map((f) => JSON.stringify(pixelsOf(f, tail)))).size).toBeGreaterThanOrEqual(5);
  });

  it('P08: the leg colour is exactly eight legs, four visible pairs (four above, four below the trunk); the trunk keeps its place while they step', () => {
    const legs = accent('P08', ACCENTS.P08!);
    const pairs = (f: Px) => {
      const comps = components(pixelsOf(f, legs));
      return { n: comps.length, above: comps.filter((c) => c.every(([, y]) => y < 24)).length, below: comps.filter((c) => c.every(([, y]) => y >= 24)).length };
    };
    for (const f of [...frames('P08', 'move'), ...frames('P08', 'feed'), ...frames('P08', 'reproduction'), ...frames('P08', 'stress')]) expect(pairs(f)).toEqual({ n: 8, above: 4, below: 4 });
    const move = frames('P08', 'move');
    const trunk = (f: Px) => JSON.stringify(pixelsOf(f, [2, 3, 5]));
    for (const f of move) expect(trunk(f)).toBe(trunk(move[0]!));
    expect(new Set(move.map((f) => JSON.stringify(pixelsOf(f, legs)))).size).toBeGreaterThan(2);
    // Not vacuous: a leg-coloured pixel inside the trunk is a ninth component.
    const bad = move[0]!.clone().set(24, 24, legs[0]!);
    expect(pairs(bad).n).toBe(9);
  });

  it('P08 dormant: curling draws the legs in, the curled tun has none and is the smallest, uncurling brings stubs back', () => {
    const legs = accent('P08', ACCENTS.P08!);
    const [prep, rest, wake] = frames('P08', 'dormant') as [Px, Px, Px];
    const active = frames('P08', 'move')[0]!;
    const n = (f: Px) => pixelsOf(f, legs).length;
    expect(n(rest)).toBe(0);
    for (const f of [prep, wake]) {
      expect(n(f)).toBeGreaterThan(0);
      expect(n(f)).toBeLessThan(n(active));
    }
    const box = (f: Px) => {
      const b = f.bounds()!;
      return [b.x1 - b.x0 + 1, b.y1 - b.y0 + 1];
    };
    const [rw, rh] = box(rest);
    for (const f of [prep, wake, active]) {
      expect(rw).toBeLessThan(box(f)[0]!);
      expect(rh).toBeLessThan(box(f)[1]!);
    }
  });

  it('P09: the wheel colour is only in the crown disc on top; in `move` only the wheel turns, the body stays still', () => {
    const wheel = accent('P09', ACCENTS.P09!);
    const inCrown = (x: number, y: number) => Math.hypot(x + 0.5 - 16, y + 0.5 - 9) <= 5.2;
    for (const f of living('P09')) for (const [x, y] of pixelsOf(f, wheel)) expect(inCrown(x, y), `wheel (${x}, ${y})`).toBe(true);
    const move = frames('P09', 'move');
    const outside = (f: Px) => f.toStrings().map((row, y) => [...row].map((c, x) => (inCrown(x, y) ? '_' : c)).join('')).join('\n');
    for (const f of move) {
      expect(pixelsOf(f, wheel).length).toBeGreaterThan(10);
      expect(outside(f)).toBe(outside(move[0]!));
    }
    for (let k = 1; k < 6; k++) expect(move[k]!.toStrings()).not.toEqual(move[k - 1]!.toStrings());
  });

  it('P10: the fork colour is only the two prongs at the front (and the rear fragment\'s new prongs while it divides)', () => {
    const fork = accent('P10', ACCENTS.P10!);
    for (const f of [...frames('P10', 'move'), ...frames('P10', 'feed'), ...frames('P10', 'stress')]) {
      const px = pixelsOf(f, fork);
      expect(px.length).toBeGreaterThan(6);
      for (const [x] of px) expect(x).toBeGreaterThanOrEqual(38);
    }
    // Open in move: two prongs (one above, one below the body line), apart at their tips.
    const prongs = components(pixelsOf(frames('P10', 'move')[0]!, fork));
    expect(prongs).toHaveLength(2);
    const repro = frames('P10', 'reproduction');
    for (const f of repro.slice(0, 2)) for (const [x] of pixelsOf(f, fork)) expect(x).toBeGreaterThanOrEqual(38);
    for (const f of repro.slice(2)) {
      expect(pixelsOf(f, fork).some(([x]) => x < 22)).toBe(true);
      for (const [x] of pixelsOf(f, fork)) expect(x >= 38 || (x >= 10 && x < 22), `fork pixel x ${x}`).toBe(true);
    }
    // Feed (a committed meal): the fork is closed, then a swallowed lump (the gut colour) travels down the body.
    const gut = indicesOf(sprite('P10').palette, P.needlejawGut);
    const lumpX = frames('P10', 'feed').slice(1).map((f) => Math.min(...pixelsOf(f, gut).map(([x]) => x)));
    expect(lumpX[0]).toBeGreaterThan(lumpX[1]!);
    expect(lumpX[1]).toBeGreaterThan(lumpX[2]!);
  });
});

describe('effect marks map to recorded state (UX §6.5 "handling arc, trap loop", §7.2 handling/held)', () => {
  const dist = (x: number, y: number) => Math.hypot(x + 0.5 - 8, y + 0.5 - 8);

  it('are packed after stage 1\'s Phase 5 marks with their EFFECT_MARKS counts; the renderer vocabulary is unchanged', () => {
    expect(PHASE5_FEATURE_LAYERS.map((l) => l.id)).toEqual(['glow_center', 'jacket_rim', 'mode_half', 'handling_arc', 'trap_loop']);
    expect(ATLAS_FEATURE_LAYERS.map((l) => l.id).slice(-2)).toEqual(['handling_arc', 'trap_loop']);
    expect(FEATURE_LAYERS.map((l) => l.id)).not.toContain('handling_arc');
    expect(EFFECT_MARKS).toEqual({
      handling_arc: { frames: 4, states: 'handling quarters 1–4', ability: 'HANDLING', drawnOn: expect.stringContaining('handlingProgress / handlingNeed') as string },
      trap_loop: { frames: 2, states: 'closing, holding', ability: 'TRAP', drawnOn: expect.stringContaining('heldBySlot') as string },
    });
    for (const id of ['handling_arc', 'trap_loop']) {
      expect(layer(id).frames).toHaveLength(EFFECT_MARKS[id]!.frames);
      expect(layer(id).frameNames).toHaveLength(EFFECT_MARKS[id]!.frames);
      // The trapper's loop colour belongs to F03's own trap frames (art-p5.test.ts); the held mark has its own tones.
      expect(indicesOf(layer(id).palette, P.traplaceLoop)).toEqual([]);
    }
    // P10 is the only native handler, F03 the only trapper.
    const holders = (ability: string) => reg.speciesIds.filter((id) => (reg.species[id]!.nativeAbilities as readonly string[]).includes(ability));
    expect([holders('HANDLING'), holders('TRAP')]).toEqual([['P10'], ['F03']]);
  });

  it('handling_arc: each quarter strictly adds arc to the last; four fixed progress ticks; a full ring at the last quarter', () => {
    const f = layer('handling_arc').frames;
    const counts = f.map((p) => p.count());
    for (let k = 1; k < 4; k++) {
      expect(counts[k]!, `quarter ${k + 1}`).toBeGreaterThan(counts[k - 1]!);
      for (let i = 0; i < 256; i++) if (f[k - 1]!.data[i]) expect(f[k]!.data[i]).toBe(f[k - 1]!.data[i]);
    }
    const ticks = (p: Px) => JSON.stringify(pixelsOf(p, [2]));
    for (const p of f) {
      expect(ticks(p)).toBe(ticks(f[0]!));
      for (const [x, y] of pixelsOf(p, [1, 2])) expect(dist(x, y) >= 6 && dist(x, y) < 7.6).toBe(true);
    }
    // Ticks at the four quarter points: one in each of E, S, W, N.
    expect(components(pixelsOf(f[0]!, [2]))).toHaveLength(4);
    // The last quarter closes the ring: the center cannot reach the frame edge without crossing it.
    const enclosed = (p: Px) => {
      const seen = new Set<number>([8 * 16 + 8]);
      const stack = [8 * 16 + 8];
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % 16, y = Math.floor(i / 16);
        if (x === 0 || y === 0 || x === 15 || y === 15) return false;
        for (const j of [i + 1, i - 1, i + 16, i - 16]) {
          if (seen.has(j) || p.data[j] !== 0) continue;
          seen.add(j);
          stack.push(j);
        }
      }
      return true;
    };
    expect(f.map(enclosed)).toEqual([false, false, false, true]);
  });

  it('trap_loop: closing is an open loop, holding a closed one round the held worm\'s waist; the frames differ', () => {
    const [closing, holding] = layer('trap_loop').frames as [Px, Px];
    expect(closing.data.some((v, i) => v !== holding.data[i])).toBe(true);
    const enclosed = (p: Px) => {
      const seen = new Set<number>([8 * 16 + 8]);
      const stack = [8 * 16 + 8];
      while (stack.length) {
        const i = stack.pop()!;
        const x = i % 16, y = Math.floor(i / 16);
        if (x === 0 || y === 0 || x === 15 || y === 15) return false;
        for (const j of [i + 1, i - 1, i + 16, i - 16]) {
          if (seen.has(j) || p.data[j] !== 0) continue;
          seen.add(j);
          stack.push(j);
        }
      }
      return true;
    };
    expect([enclosed(closing), enclosed(holding)]).toEqual([false, true]);
    // Round the waist of a 32 px P04 (scaled ×2): the loop stands across the body line (taller than wide).
    const b = holding.bounds()!;
    expect(b.y1 - b.y0).toBeGreaterThan(b.x1 - b.x0);
    expect(pixelsOf(holding, [1]).length).toBeGreaterThan(pixelsOf(holding, [2]).length);
  });
});

describe('tools/art-build.ts and the atlas check refuse large art that breaks a rule', () => {
  const replace = (id: string, edit: (d: SpriteDef) => SpriteDef) => SPRITES.map((d) => (d.speciesId === id ? edit(d) : d));

  it('the real art builds with no errors', () => {
    expect(buildAtlas().errors).toEqual([]);
  });

  it('P08 without its dormant poses (or with two) fails, naming the rule', () => {
    const none = replace('P08', (d) => {
      const { dormant: _dormant, ...rest } = d.animations;
      return { ...d, animations: rest };
    });
    expect(buildAtlas({ sprites: none }).errors).toContain('p08_waterbear: native DORMANCY needs "dormant" (3 frames: Preparing, Resting, Waking)');
    const short = replace('P08', (d) => ({ ...d, animations: { ...d.animations, dormant: { ...d.animations.dormant!, frames: d.animations.dormant!.frames.slice(0, 2), reducedMotionFrame: 1 } } }));
    expect(buildAtlas({ sprites: short }).errors).toContain('p08_waterbear: "dormant" has 2 frames; native DORMANCY needs exactly 3 (Preparing, Resting, Waking)');
    // A large sprite short of a UX §6.2 count fails too.
    const fewMoves = replace('P10', (d) => ({ ...d, animations: { ...d.animations, move: { ...d.animations.move!, frames: d.animations.move!.frames.slice(0, 4) } } }));
    expect(buildAtlas({ sprites: fewMoves }).errors).toContain('p10_needlejaw: "move" has 4 frames, needs 6');
  });

  it('dropping handling_arc (or trap_loop) fails; a three-frame handling_arc fails the frame count', () => {
    const errors = buildAtlas({ layers: ATLAS_FEATURE_LAYERS.filter((l) => l.id !== 'handling_arc' && l.id !== 'trap_loop') }).errors;
    expect(errors).toContain('effect mark "handling_arc" (4 frames: handling quarters 1–4; drawn on the predator while a handling attempt runs (handlingProgress / handlingNeed, SPEC §7.3)) is missing from art/src/layers');
    expect(errors).toContain('effect mark "trap_loop" (2 frames: closing, holding; drawn on the held P04 while heldBySlot >= 0 (SPEC §7.17)) is missing from art/src/layers');
    const short = ATLAS_FEATURE_LAYERS.map((l) => (l.id === 'handling_arc' ? { ...l, frames: l.frames.slice(0, 3), frameNames: l.frameNames.slice(0, 3) } : l));
    expect(buildAtlas({ layers: short }).errors).toContain('features.handling_arc.frames: layer handling_arc (handling_arc): mark has 3 frame(s), needs 4 (handling quarters 1–4)');
  });
});

describe('the committed atlas (npm run art:build)', () => {
  const dir = join(REPO_ROOT, 'public', 'atlas');
  const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
    width: number;
    height: number;
    features: Record<string, unknown>;
    frames: { key: string; x: number; y: number; w: number; h: number }[];
  };
  const img = PNG.sync.read(readFileSync(join(dir, 'organisms.png')));

  it('is complete for the six large records (with P08 dormant) and the effect marks, within the 1024×2048 cap', () => {
    const refs = P5_LARGE.map((id) => atlasSpeciesRef(reg.species[id]!));
    // As if the organism flip had enabled P10 and F03: their effect marks (content:validate's effectMarks).
    const marks = effectMarks({ manifest: { enabledSpecies: ['F03', 'P10', 'P08'] }, species: reg.species });
    expect(marks).toEqual([
      { moduleId: 'F03 TRAP', layer: 'trap_loop', kind: 'species' },
      { moduleId: 'P10 HANDLING', layer: 'handling_arc', kind: 'species' },
    ]);
    // Nothing enabled today needs one, so content:validate's output is unchanged before the flip.
    expect(effectMarks(reg)).toEqual([]);
    expect(checkAtlas(manifest, refs, { marks })).toEqual([]);
    expect([manifest.width, manifest.height]).toEqual([1024, ATLAS_MAX_H]);
    const noDormant = { ...manifest, frames: manifest.frames.filter((f) => f.key !== 'p08_waterbear/dormant/w/1') };
    expect(checkAtlas(noDormant, refs).map((i) => i.message)).toEqual(['P08 (p08_waterbear): missing frame "p08_waterbear/dormant/w/1"']);
    const noArc = JSON.parse(JSON.stringify(manifest)) as typeof manifest;
    delete noArc.features.handling_arc;
    expect(checkAtlas(noArc, refs, { marks }).map((i) => i.message)).toEqual(['enabled species P10 HANDLING (handling_arc) has no feature mark in the atlas (run npm run art:build)']);
  });

  it('every frame packed before wave 8b is byte-identical to the wave 8a atlas (60a4731)', () => {
    // Wave 11 (structure-render-worker) appended the 13 'device' tile frames last: they are not wave 8a frames either.
    const NEW = /^(p05_shellglider|p06_bellstalk|p07_dartfin|p08_waterbear|p09_wheelgrazer|p10_needlejaw)\/|^feature\/(handling_arc|trap_loop)\/|^tile\/device\//;
    const old = manifest.frames.filter((f) => !NEW.test(f.key)).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const h = createHash('sha256');
    for (const f of old) {
      h.update(f.key);
      for (let y = 0; y < f.h; y++) h.update(img.data.subarray(((f.y + y) * img.width + f.x) * 4, ((f.y + y) * img.width + f.x + f.w) * 4));
    }
    // 1342 frames: the 856 v1.0 frames plus stage 1's 486; digest of the same frames read from the 60a4731 atlas.
    expect(old).toHaveLength(1342);
    expect(h.digest('hex')).toBe('327490bd6265f39530fde0360fcc34af4ef8fd4a8215be05a1053328cf4fdfeb');
    // The new frames: 32 px P05/P06/P09 20 each and P07 80; 48 px P08 92 and P10 80; marks (4 + 2) × 4.
    expect(manifest.frames.length - old.length).toBe(20 * 3 + 80 + 92 + 80 + 24 + 13); // + wave 11's 13 device frames
  });
});
