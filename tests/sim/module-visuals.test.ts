/**
 * P2.1 inspector exposure and visual-layer mapping (SPEC §9 visuals, §12.1; UX §6.2): every mark
 * and every inspector line comes from the genome and measured state. No notch without E01, no
 * pocket without E05 (and its fill band is the real stored energy), no seam without E03 (its
 * prepare/rest/wake frames only while it is Preparing, Resting or Waking); at most two marks unless
 * selected. The marks are atlas frames, and the inspector's DORMANCY_LOCKOUT line and chip come from
 * the engine's reason code.
 */
import { describe, expect, it } from 'vitest';
import { introduceOrganism } from '../../src/sim/commands';
import { LIFE_RESTING } from '../../src/sim/entities';
import { cellIndex } from '../../src/sim/grid';
import { reserveBand } from '../../src/sim/moduleView';
import { profileOf } from '../../src/sim/profiles';
import { R } from '../../src/sim/reasons';
import { rebuildIndex } from '../../src/sim/spatial';
import { run } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import {
  CUE2_ANCHORED,
  CUE2_DETRITUS_INTAKE,
  CUE2_LINKED,
  CUE2_MOD_E04,
  CUE2_MOD_E06,
  CUE2_MOD_E07,
  CUE2_MOD_E08,
  CUE2_MOD_E09,
  CUE2_MOD_E10,
  CUE2_MOD_E12,
  CUE2_RELEASING_PROTEIN,
  CUE2_SEEKING_LIGHT,
  CUE_MOD_E01,
  CUE_MOD_E03,
  CUE_MOD_E05,
  CUE_RESERVE_BAND_MASK,
  CUE_RESERVE_BAND_SHIFT,
  E_CUE,
  E_LIFE,
  ENT_STRIDE,
  ID_STRIDE,
} from '../../src/worker/protocol';
import { buildInspector, packEntities } from '../../src/worker/snapshot';
import { FEATURE_LAYER_IDS, featureFrameKey, featureFrameKeys, featureLayers, featureMarkScale, type AtlasFeatureLike, type FeatureLayerId, type LayerPick } from '../../src/render/features';
import { FEATURE_LAYERS } from '../../art/src/layers/modules';
import { orient, paletteRgba } from '../../art/src/sprite';
import { FEATURE_FRAMES, featureFrameKey as validatorFrameKey } from '../../tools/content-validate';
import { loadRegistryFs, REPO_ROOT } from '../../tools/lib/content-fs';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { clearWater, fillField, setField } from '../helpers/world';
import { dormancyChip, dormancyLines, energyCapText, LIFE_ACTIVE, lifeStateLabel, moduleText, upkeepText } from '../../src/ui/strings/modules';
import { dormancyReason } from '../../src/sim/dormancy';
import { step } from '../../src/sim/tick';
import { stopAnswer } from '../../src/ui/strings/shortcuts';
import { reasonText } from '../../src/ui/strings/reasons';

const FORBIDDEN = /\b(immune|superior|adapted|advanced|perfect|invincible)\b/i;

interface AtlasJson {
  image: string;
  features: Record<string, AtlasFeatureLike & { anchor: number[]; frameNames: string[] }>;
  frames: { key: string; x: number; y: number; w: number; h: number }[];
}
function clean(lines: readonly string[]): void {
  for (const l of lines) {
    expect(l.length).toBeGreaterThan(3);
    expect(l).not.toMatch(FORBIDDEN);
    expect(l).not.toMatch(/undefined|NaN|null|\?/);
  }
}

function placeWith(w: World, x: number, modules: readonly string[], E?: number): number {
  const s = introduceOrganism(w, speciesIndex(w, 'B01'), cellIndex(x, 64), 'test', { modules, exactCenter: true });
  if (E !== undefined) w.ents.cols.E[s] = E;
  rebuildIndex(w);
  return s;
}

function cueOf(w: World, birthId: number): { cue: number; life: number } {
  const p = packEntities(w, null, null);
  for (let k = 0; k < p.count; k++) {
    if (p.ids[k * ID_STRIDE] === birthId) return { cue: p.ents[k * ENT_STRIDE + E_CUE]!, life: p.ents[k * ENT_STRIDE + E_LIFE]! };
  }
  throw new Error('not packed');
}

describe('P2.1 module visuals and inspector', () => {
  it('cue bits follow the genome; the reserve band follows stored energy above the base cap', () => {
    const w = clearWater();
    const plain = placeWith(w, 20, []);
    const e01 = placeWith(w, 30, ['E01']);
    const e03 = placeWith(w, 40, ['E03']);
    const bands = [50, 100, 105, 113.3, 120, 127, 140].map((E, k) => placeWith(w, 50 + 5 * k, ['E05'], E));
    const c = w.ents.cols;
    const mods = CUE_MOD_E01 | CUE_MOD_E03 | CUE_MOD_E05;
    expect(cueOf(w, c.birthId[plain]!).cue & (mods | CUE_RESERVE_BAND_MASK)).toBe(0);
    expect(cueOf(w, c.birthId[e01]!).cue & mods).toBe(CUE_MOD_E01);
    expect(cueOf(w, c.birthId[e03]!).cue & mods).toBe(CUE_MOD_E03);
    const got = bands.map((s) => {
      const cue = cueOf(w, c.birthId[s]!).cue;
      expect(cue & mods).toBe(CUE_MOD_E05);
      return (cue & CUE_RESERVE_BAND_MASK) >> CUE_RESERVE_BAND_SHIFT;
    });
    expect(got).toEqual([0, 0, 1, 1, 2, 3, 3]);
    expect(reserveBand(140, profileOf(w, plain))).toBe(0); // no chamber, no band
  });

  it('marks map only from cue bits and life state; two at most unless selected', () => {
    const picks: LayerPick[] = [];
    expect(featureLayers(0, 0, true, picks)).toBe(0);
    // An Active E03 carrier shows the small seam (frame 0), after any live marks.
    expect(featureLayers(CUE_MOD_E03, 0, true, picks)).toBe(1);
    expect(picks[0]).toEqual({ layer: 'resting_seam', frame: 0 });
    expect(featureLayers(CUE_MOD_E03 | CUE_MOD_E01 | CUE_MOD_E05, 0, false, picks)).toBe(2);
    expect(picks.slice(0, 2).map((p) => p.layer)).toEqual(['reserve_pocket', 'starch_notch']);
    expect(featureLayers(CUE_MOD_E01, 0, false, picks)).toBe(1);
    expect(picks[0]).toEqual({ layer: 'starch_notch', frame: 0 });
    const all = CUE_MOD_E01 | CUE_MOD_E03 | CUE_MOD_E05 | (2 << CUE_RESERVE_BAND_SHIFT);
    expect(featureLayers(all, LIFE_RESTING, false, picks)).toBe(2);
    expect(picks.slice(0, 2)).toEqual([
      { layer: 'resting_seam', frame: 1 },
      { layer: 'reserve_pocket', frame: 2 },
    ]);
    expect(featureLayers(all, LIFE_RESTING, true, picks)).toBe(3);
    expect(picks[2]).toEqual({ layer: 'starch_notch', frame: 0 });
    for (const life of [1, 2, 3]) {
      featureLayers(CUE_MOD_E03, life, false, picks);
      expect(picks[0]).toEqual({ layer: 'resting_seam', frame: life - 1 });
    }
  });

  it('the marks are atlas frames: every layer frame in all four headings, pixel-exact from art/src/layers', () => {
    const dir = join(REPO_ROOT, 'public', 'atlas');
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as AtlasJson;
    const img = PNG.sync.read(readFileSync(join(dir, manifest.image)));
    const frames = new Map(manifest.frames.map((f) => [f.key, f]));
    // The renderer's vocabulary is exactly the authored layers, in the same order.
    expect(FEATURE_LAYERS.map((l) => l.id)).toEqual([...FEATURE_LAYER_IDS]);
    expect(FEATURE_LAYERS.find((l) => l.id === 'reserve_pocket')!.frames).toHaveLength(4);
    expect(FEATURE_LAYERS.find((l) => l.id === 'resting_seam')!.frames).toHaveLength(3);
    // Each layer carries at least the frames content:validate requires of it (W2-29).
    for (const def of FEATURE_LAYERS) expect(def.frames.length, def.id).toBeGreaterThanOrEqual(FEATURE_FRAMES[def.id]?.frames ?? 1);
    let checked = 0;
    for (const def of FEATURE_LAYERS) {
      expect(manifest.features[def.id]).toEqual({ size: 16, headings: 4, anchor: [8, 8], frames: def.frames.length, frameNames: def.frameNames });
      def.frames.forEach((frame, fi) => {
        for (let h = 0; h < 4; h++) {
          const key = featureFrameKey(def.id, fi, h);
          const f = frames.get(key);
          expect(f, key).toMatchObject({ w: 16, h: 16 });
          const want = paletteRgba(def.palette, orient(frame, h), def.id);
          let opaque = 0;
          for (let y = 0; y < 16; y++) {
            for (let x = 0; x < 16; x++) {
              const a = ((f!.y + y) * img.width + f!.x + x) * 4;
              const b = (y * 16 + x) * 4;
              expect([img.data[a], img.data[a + 1], img.data[a + 2], img.data[a + 3]], `${key} (${x}, ${y})`).toEqual([want[b], want[b + 1], want[b + 2], want[b + 3]]);
              if (want[b + 3]! > 0) opaque++;
            }
          }
          expect(opaque, key).toBeGreaterThan(0);
          checked++;
        }
      });
    }
    // Every frame of every layer, in all four headings: (1 notch + 4 bands + 3 seam states) and the
    // Phase 3 layers (foot 1, shade 1, trail 1, granule 2, notches 2, matrix 4, link 1) × 4 headings.
    expect(checked).toBe(4 * FEATURE_LAYERS.reduce((sum, l) => sum + l.frames.length, 0));
    expect(checked).toBe(80);
  });

  it('every mark the renderer can pick is an atlas frame, and each module draws its content visual layer', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'public', 'atlas', 'manifest.json'), 'utf8')) as AtlasJson;
    const have = new Set(manifest.frames.map((f) => f.key));
    const keys = featureFrameKeys(manifest.features);
    expect(Object.keys(keys).sort()).toEqual([...FEATURE_LAYER_IDS].sort());
    for (const id of FEATURE_LAYER_IDS) {
      keys[id]!.forEach((row, frame) =>
        row.forEach((k, h) => {
          expect(have.has(k), k).toBe(true);
          // The key the renderer asks for is the key the build writes and content:validate checks.
          expect(validatorFrameKey(id, frame, h)).toBe(k);
        }),
      );
    }
    const picks: LayerPick[] = [];
    // Every pick over every cue word, life state, film band and motion setting (collected once).
    const seen = new Set<string>();
    const CUE2_BITS = [CUE2_ANCHORED, CUE2_LINKED, CUE2_MOD_E04, CUE2_MOD_E06, CUE2_MOD_E07, CUE2_MOD_E08, CUE2_MOD_E09, CUE2_MOD_E10, CUE2_MOD_E12, CUE2_SEEKING_LIGHT, CUE2_DETRITUS_INTAKE, CUE2_RELEASING_PROTEIN];
    for (let bits = 0; bits < 8; bits++) {
      for (let band = 0; band < 4; band++) {
        const cue = (bits & 1 ? CUE_MOD_E01 : 0) | (bits & 2 ? CUE_MOD_E03 : 0) | (bits & 4 ? CUE_MOD_E05 : 0) | (band << CUE_RESERVE_BAND_SHIFT);
        for (let b2 = 0; b2 < 1 << CUE2_BITS.length; b2 += bits === 0 ? 1 : 97) {
          const cue2 = CUE2_BITS.reduce((acc, bit, i) => (b2 & (1 << i) ? acc | bit : acc), 0);
          for (const life of [0, 1, 2, 3])
            for (const reduced of [false, true]) {
              const n = featureLayers(cue, life, true, picks, cue2, { filmBand: band, reduced, pulseOn: (b2 & 1) === 0 });
              for (let m = 0; m < n; m++) seen.add(`${picks[m]!.layer}|${picks[m]!.frame}`);
            }
        }
      }
    }
    for (const lf of seen) {
      const [layer, frame] = lf.split('|') as [FeatureLayerId, string];
      for (let h = 0; h < 4; h++) expect(keys[layer]?.[Number(frame)]?.[h], lf).toBe(featureFrameKey(layer, Number(frame), h));
    }
    // Every frame of every layer is reachable from some snapshot state (no dead art, no missing state).
    const all = FEATURE_LAYER_IDS.flatMap((id) => keys[id]!.map((_, f) => `${id}|${f}`));
    expect([...seen].sort()).toEqual(all.sort());
    // A module's mark is the one its content record names, for every module with a layer in this build:
    // E01 → notch, E03 → seam, E05 → pocket, and the Phase 3 E04, E06–E10, E12 (with the state each needs).
    const reg = loadRegistryFs();
    const P3: readonly (readonly [string, number])[] = [
      ['E04', CUE2_MOD_E04 | CUE2_ANCHORED],
      ['E06', CUE2_MOD_E06],
      ['E07', CUE2_MOD_E07 | CUE2_SEEKING_LIGHT],
      ['E08', CUE2_MOD_E08],
      ['E09', CUE2_MOD_E09],
      ['E10', CUE2_MOD_E10],
      ['E12', CUE2_MOD_E12 | CUE2_LINKED],
    ];
    for (const [id, bit] of [['E01', CUE_MOD_E01], ['E03', CUE_MOD_E03], ['E05', CUE_MOD_E05]] as const) {
      expect(featureLayers(bit, 0, true, picks)).toBe(1);
      expect(picks[0]!.layer).toBe(reg.modules[id]!.visualLayer);
    }
    for (const [id, bits] of P3) {
      expect(featureLayers(0, 0, true, picks, bits), id).toBe(1);
      expect(picks[0]!.layer, id).toBe(reg.modules[id]!.visualLayer);
    }
    // A manifest without the table draws no marks rather than failing.
    expect(featureFrameKeys(undefined)).toEqual({});
  });

  it('src/render builds no textures from art/src: it imports only snapshot types and the atlas manifest', () => {
    // Any import form: named, side-effect, re-export, dynamic import() or require().
    const ART = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"`](?:@art\/|(?:\.{1,2}\/)+art\/)/;
    for (const bad of [
      "import { FEATURE_LAYERS } from '@art/src/layers/modules';",
      "import '@art/src/palette';",
      "export { P } from '../../art/src/palette';",
      "const m = await import('@art/src/layers/modules');",
      "const m = import(\"../../art/src/sprite\");",
      "const p = require('../../art/src/palette');",
      'const m = await import(`@art/src/sprite`);',
    ])
      expect(bad, bad).toMatch(ART);
    expect("import { featureLayers } from './features';").not.toMatch(ART);
    const dir = join(REPO_ROOT, 'src', 'render');
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f));
    expect(files.length).toBeGreaterThan(3);
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8');
      expect(text, f).not.toMatch(ART);
      expect(text, f).not.toMatch(/buildLayerAtlas|putImageData\(new ImageData\(la\./);
    }
    // ESLint enforces the same boundary (ARCH §3 "enforced by ESLint import rules").
    const eslint = readFileSync(join(REPO_ROOT, 'eslint.config.js'), 'utf8');
    const render = eslint.slice(eslint.indexOf("files: ['src/render/**/*.ts']"));
    expect(render.slice(0, render.indexOf('files:', 10))).toMatch(/'@art\/\*'[\s\S]*ImportExpression/);
  });

  it('a mark covers the body it sits on at the manifest mark size (not a fixed 16)', () => {
    expect(featureMarkScale(4, 16, 16)).toBe(4); // 16 px body, 16 px mark: 1:1 at sprite scale 4
    expect(featureMarkScale(4, 32, 16)).toBe(8); // 32 px body: the 16 px mark is drawn ×2 over it
    expect(featureMarkScale(4, 32, 32)).toBe(4); // a 32 px mark would sit 1:1 on the 32 px body
    expect(featureMarkScale(2, 16, undefined)).toBe(2); // no size in the manifest: the authored 16
    expect(featureMarkScale(2, 16, 0)).toBe(2);
    // The renderer passes the manifest's own features[layer].size.
    const src = readFileSync(join(REPO_ROOT, 'src', 'render', 'renderer.ts'), 'utf8');
    expect(src).toMatch(/featureMarkScale\(scale, d\.size, this\.layerSize\[pick\.layer\]\)/);
    expect(src).toMatch(/this\.layerSize\[layer\] = this\.manifest\.features!\[layer\]!\.size/);
    expect(src).not.toMatch(/\(scale \* d\.size\) \/ 16/);
  });

  it('the inspector carries DORMANCY_LOCKOUT from the engine: the Lab line and the chip come from the reason code', () => {
    const w = clearWater();
    const s = placeWith(w, 64, ['E03']);
    const b = w.ents.cols.birthId[s]!;
    const c = w.ents.cols;
    const inspect = () => buildInspector(w, { kind: 'entity', birthId: b }).entity!;
    run(w, 250); // rests: 20 s without food, 5 s getting ready
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setField(w, 'sugar', cellIndex(64 + dx, 64 + dy), 0.5);
    let woke = false;
    const states = new Set<number>();
    for (let t = 0; t < 200 && !woke; t++) {
      step(w);
      woke = c.lifeState[s] === LIFE_ACTIVE;
      if (woke) break;
      const e = inspect();
      states.add(e.dormancy!.state);
      // Every state the machine passes through reaches the payload as the engine's own reason.
      expect(e.dormancy!.reason).toEqual(dormancyReason(w, s));
      expect(e.dormancy!.reason.code).toBe(e.limitCode);
      expect(dormancyChip(e.dormancy)).toBeNull();
      const lines = dormancyLines(e.dormancy!, e.E).join(' ');
      expect(lines).not.toMatch(/Just woke up| 0 s left/);
    }
    expect([...states].sort()).toEqual([LIFE_RESTING, 3]); // resting, then waking (5 s)
    expect(woke).toBe(true);
    let e = inspect();
    expect(e.dormancy!.reason).toEqual({ code: R.DORMANCY_LOCKOUT, value: 30, restHeld: false });
    expect(dormancyChip(e.dormancy)).toBe('just woke up');
    expect(dormancyLines(e.dormancy!, e.E)).toContain('Just woke up: it cannot rest again for 30 s.');
    fillField(w, 'sugar', 0);
    fillField(w, 'sugarN', 0);
    c.E[s] = 60; // labelled test state: enough energy (≥ 15) to rest again after the lockout
    let held = 0;
    let lockout = 0;
    let lastLine = '';
    for (let t = 0; t < 400 && c.lifeState[s] === LIFE_ACTIVE; t++) {
      step(w);
      e = inspect();
      const d = e.dormancy!;
      expect(d.reason).toEqual(dormancyReason(w, s));
      // The chip the Inspector shows today (Active with lockout seconds left) is exactly the code.
      const code = d.reason.code === R.DORMANCY_LOCKOUT;
      expect(d.state === LIFE_ACTIVE && d.lockoutSeconds > 0).toBe(code);
      expect(dormancyChip(d) !== null).toBe(code);
      const lines = dormancyLines(d, e.E);
      const line = lines.find((l) => l.startsWith('Just woke up'));
      if (code) {
        lockout++;
        expect(line).toBe(reasonText(R.DORMANCY_LOCKOUT, 'lab', { value: d.reason.value, restHeld: d.reason.restHeld }));
        if (d.reason.restHeld) {
          held++;
          expect(line).toMatch(/^Just woke up: it would start resting now, but cannot rest again for [1-9]\d* s\.$/);
        } else expect(line).toMatch(/^Just woke up: it cannot rest again for [1-9]\d* s\.$/);
        lastLine = line!;
      } else expect(line).toBeUndefined();
      clean(lines);
    }
    // 30 s of lockout; the 20 s trigger is met after 20 s, so a rest waits for the last 10 s.
    expect(lockout).toBe(299);
    expect(held).toBe(100);
    // The last lockout tick leaves 0.1 s: the countdown reads 1 s, never 0 s.
    expect(lastLine).toBe('Just woke up: it would start resting now, but cannot rest again for 1 s.');
    expect(inspect().dormancy!.state).not.toBe(LIFE_ACTIVE);
    expect(dormancyChip(null)).toBeNull();
  });

  it('the inspector lists carried modules with their recorded costs and the resting state with reasons', () => {
    const w = clearWater();
    const s = placeWith(w, 64, ['E03', 'E05']);
    const b = w.ents.cols.birthId[s]!;
    const active = buildInspector(w, { kind: 'entity', birthId: b }).entity!;
    expect(active.modules.map((m) => m.id)).toEqual(['E03', 'E05']);
    const e05 = active.modules.find((m) => m.id === 'E05')!;
    expect(e05.name).toBe('Reserve chamber');
    expect(e05.surchargePerSecond).toBe(0.02);
    expect(e05.params).toEqual({ capacityBonus: 40, upkeepPerSecond: 0.03 });
    expect(active.energyCap).toBe(140);
    expect(active.energyCapBase).toBe(100);
    expect(active.upkeep.resting).toBe(false);
    expect(active.upkeep.surcharge).toBeCloseTo(0.04, 12);
    expect(active.upkeep.chamber).toBeCloseTo(0.03, 12);
    expect(active.upkeep.maintenance).toBeCloseTo(0.5, 12);
    expect(active.lociActiveEffective[7]).toBe(true);
    expect(active.genome.lociActive[7]).toBe(false); // the template alone does not activate it
    expect(active.dormancy!.state).toBe(0);
    expect(active.dormancy!.triggerSeconds).toBeCloseTo(20, 12);
    expect(active.dormancy!.rules.prepareCost).toBe(10);
    run(w, 250);
    const resting = buildInspector(w, { kind: 'entity', birthId: b }).entity!;
    expect(resting.lifeState).toBe(LIFE_RESTING);
    expect(resting.limitCode).toBe(R.RESTING_FOOD_SCARCE);
    expect(resting.dormancy!.cause).toBe(R.RESTING_FOOD_SCARCE);
    expect(resting.dormancy!.wake.food).toBe(false);
    expect(resting.upkeep).toEqual({ resting: true, maintenance: 0.01, surcharge: 0, chamber: 0 });
    expect(resting.modules.find((m) => m.id === 'E03')!.activeNow).toBe(true);
    expect(resting.divisionBlockers).toContain(R.DIV_BLOCK_STATE);
    // Words come from the payload: recorded numbers, state and reasons.
    const e03 = moduleText(resting.modules.find((m) => m.id === 'E03')!);
    expect(e03.costs).toBe('Carrying it costs 0.02 energy/s except while resting; 10 energy to get ready, 0.01 energy/s while resting (instead of all other upkeep), 5 energy to wake.');
    expect(moduleText(e05).does).toContain('room, not energy');
    expect(lifeStateLabel(resting.lifeState)).toBe('Resting');
    expect(upkeepText(resting)).toBe('0.01 energy/s while resting (instead of all other upkeep)');
    expect(upkeepText(active)).toBe('0.5 energy/s + 0.04 for carrying extra abilities + 0.03 reserve chamber upkeep');
    expect(energyCapText(active)).toBe('50 / 140 (100 + 40 room from its reserve chamber)');
    const restLines = dormancyLines(resting.dormancy!, resting.E);
    expect(restLines[0]).toBe('Resting because food stayed scarce.');
    expect(restLines.join(' ')).toContain('Food here: not yet');
    const stop = stopAnswer(resting);
    expect(stop.items.map((i) => i.code)).toContain(R.DIV_BLOCK_STATE);
    expect(stop.items.find((i) => i.code === R.DIV_BLOCK_STATE)!.detail).toBe("Can't split while resting.");
    expect(reasonText(resting.limitCode, 'lab', { value: resting.limitValue })).toMatch(/^Resting because food stayed scarce; wakes after 10 s of food and energy ≥ 5 \(\d+ s so far\)\.$/);
    clean([...restLines, e03.does, e03.costs, upkeepText(resting), upkeepText(active), ...dormancyLines(active.dormancy!, active.E)]);
    // Plain organisms carry no module rows and no dormancy machine.
    const p = placeWith(w, 20, []);
    const plain = buildInspector(w, { kind: 'entity', birthId: w.ents.cols.birthId[p]! }).entity!;
    expect(plain.modules).toEqual([]);
    expect(plain.dormancy).toBeNull();
  });
});
