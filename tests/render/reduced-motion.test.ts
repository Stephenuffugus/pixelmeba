/**
 * P4.9 reduced-motion audit (UX §7.4; D08 "Reduced motion removes camera easing, repeating pulses and
 * trails while retaining state patterns and text").
 *
 * One assertion per table row whose effect exists: each effect's pure choice (src/render/features.ts,
 * world3.ts fungalPick, camera.ts) with reduced motion on and off, including the 1 s static split frame.
 * Static effects (favorite glyphs, probe outlines) are checked to read no clock. The CSS rules remove
 * every animation and transition. Finally every "As built" cell of the UX §7.4 table names a real file
 * and symbol.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Camera, ZOOM_CLOSE } from '../../src/render/camera';
import {
  bodyFrameIndex,
  DEATH_STATIC_MS,
  decayTileAlpha,
  effectForEvent,
  effectLook,
  featureLayers,
  featurePulseOn,
  FEATURE_PULSE_MS,
  ghostDurationMs,
  ghostFrameIndex,
  newbornAlpha,
  placementEffect,
  PLACEMENT_RING_MS,
  PLACEMENT_STATIC_MS,
  SPLIT_FLASH_MS,
  SPLIT_STATIC_MS,
  stainAlphaAt,
  type LayerPick,
} from '../../src/render/features';
import { fungalPick, PULSE_FRAME_MS, STAIN_MS, stainAlpha } from '../../src/render/world3';
import { CUE2_DETRITUS_INTAKE, CUE2_MOD_E07, CUE2_MOD_E08, CUE2_SEEKING_LIGHT } from '../../src/worker/protocol';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

describe('UX §7.4 reduced motion, effect by effect', () => {
  it('eating pulse / body animation: cycles with motion; the still frame (feeding pose) in reduced motion', () => {
    // feed animation: 4 frames of 150 ms, still frame 2.
    expect([0, 150, 300, 450, 600].map((t) => bodyFrameIndex(4, 150, 2, false, false, t))).toEqual([0, 1, 2, 3, 0]);
    expect([0, 150, 300, 450, 600].map((t) => bodyFrameIndex(4, 150, 2, true, false, t))).toEqual([2, 2, 2, 2, 2]);
  });

  it('unfolding (wake) is a state swap: a dormant pose is still in both modes', () => {
    expect(bodyFrameIndex(4, 150, 1, false, true, 300)).toBe(1);
    expect(bodyFrameIndex(4, 150, 1, true, true, 300)).toBe(1);
  });

  it('division flash → static split frame for 1 s (a still ring with a bar), only after a committed birth', () => {
    const moving = effectForEvent('birth', false)!;
    const still = effectForEvent('birth', true)!;
    expect(moving).toEqual({ kind: 'split', durationMs: SPLIT_FLASH_MS, animated: true });
    expect(still).toEqual({ kind: 'split', durationMs: SPLIT_STATIC_MS, animated: false });
    expect(SPLIT_STATIC_MS).toBe(1000);
    // Motion on: it grows and fades.
    expect(effectLook(moving, 1, 0)).toEqual({ radius: 0.4, alpha: 0.7, divider: false });
    expect(effectLook(moving, 1, 0.5).radius).toBeCloseTo(0.9, 12);
    expect(effectLook(moving, 1, 0.5).alpha).toBeCloseTo(0.35, 12);
    // Reduced: the same look for its whole second.
    for (const t of [0, 0.25, 0.5, 0.99]) expect(effectLook(still, 1, t)).toEqual({ radius: 0.9, alpha: 0.7, divider: true });
    // Nothing else draws an effect (deaths, captures, wakes, mutations …).
    for (const type of ['death', 'capture', 'wake', 'mutation', 'introduce', 'objectEmptied']) {
      expect(effectForEvent(type, false)).toBeNull();
      expect(effectForEvent(type, true)).toBeNull();
    }
  });

  it('newborn fade-in → none', () => {
    expect(newbornAlpha(true, false, 0)).toBe(0.75);
    expect(newbornAlpha(true, false, 1)).toBe(1);
    expect(newbornAlpha(true, true, 0)).toBe(1);
    expect(newbornAlpha(false, false, 0)).toBe(1);
  });

  it('death dissolve → the still frame for 0.6 s; fungal decay → held still for 0.6 s', () => {
    const death = { frames: 4, durationMs: 120, reducedMotionFrame: 1 };
    expect(ghostDurationMs(death, false, 1200)).toBe(480);
    expect(ghostDurationMs(death, true, 1200)).toBe(DEATH_STATIC_MS);
    expect([0, 130, 250, 470, 900].map((t) => ghostFrameIndex(death, false, t))).toEqual([0, 1, 2, 3, 3]);
    expect([0, 130, 250, 470].map((t) => ghostFrameIndex(death, true, t))).toEqual([1, 1, 1, 1]);
    expect(ghostDurationMs(null, false, 1200)).toBe(1200);
    expect(ghostDurationMs(null, true, 1200)).toBe(DEATH_STATIC_MS);
    expect(decayTileAlpha(600, 1200, false)).toBeCloseTo(0.5, 12);
    expect(decayTileAlpha(300, DEATH_STATIC_MS, true)).toBe(1);
  });

  it('link/transfer pulse (F02) → static link with dot', () => {
    const TRANSFER = 16; // LINKMASK bit 4: a transfer this second
    const at = (now: number, reduced: boolean) => fungalPick(1 | TRANSFER, 0, reduced, now).pulse;
    expect([0, PULSE_FRAME_MS].map((t) => at(t, false))).toEqual([0, 1]);
    expect([0, PULSE_FRAME_MS].map((t) => at(t, true))).toEqual([0, 0]);
    expect(fungalPick(1, 0, true, 0).pulse).toBe(-1); // no transfer, no dot
  });

  it('granule pulse (E08) → static bright granule', () => {
    expect([0, FEATURE_PULSE_MS].map((t) => featurePulseOn(t, false))).toEqual([true, false]);
    expect([0, FEATURE_PULSE_MS].map((t) => featurePulseOn(t, true))).toEqual([true, true]);
    const out: LayerPick[] = [];
    const cue2 = CUE2_MOD_E08 | CUE2_DETRITUS_INTAKE;
    featureLayers(0, 0, true, out, cue2, { reduced: true, pulseOn: featurePulseOn(FEATURE_PULSE_MS, true) });
    expect(out[0]).toEqual({ layer: 'debris_granule', frame: 1 });
    featureLayers(0, 0, true, out, cue2, { reduced: false, pulseOn: featurePulseOn(FEATURE_PULSE_MS, false) });
    expect(out[0]).toEqual({ layer: 'debris_granule', frame: 0 });
  });

  it('trails (E07) → none', () => {
    const out: LayerPick[] = [];
    const cue2 = CUE2_MOD_E07 | CUE2_SEEKING_LIGHT;
    expect(featureLayers(0, 0, true, out, cue2, { reduced: false }) && out.slice(0, 1).map((p) => p.layer)).toEqual(['light_trail']);
    expect(featureLayers(0, 0, true, out, cue2, { reduced: true })).toBe(0);
  });

  it('deposit/placement ring → a still ring at full radius for 1 s', () => {
    expect(placementEffect(false)).toEqual({ kind: 'deposit', durationMs: PLACEMENT_RING_MS, animated: true });
    expect(placementEffect(true)).toEqual({ kind: 'deposit', durationMs: PLACEMENT_STATIC_MS, animated: false });
    // P4.13 (UX §6.5): with motion on the ring now grows from 0 to the dose radius over 300 ms, then fades by 700 ms.
    expect(effectLook(placementEffect(false), 2, 0).radius).toBe(0);
    expect(effectLook(placementEffect(false), 2, 300 / PLACEMENT_RING_MS).radius).toBeCloseTo(2, 12);
    expect(effectLook(placementEffect(false), 2, 1).alpha).toBe(0);
    for (const t of [0, 0.5, 0.99]) expect(effectLook(placementEffect(true), 2, t)).toEqual({ radius: 2, alpha: 0.6, divider: false });
  });

  it('food-object stain → held still, removed after the same 6 s', () => {
    expect(stainAlphaAt(STAIN_MS / 2, false)).toBeCloseTo(stainAlpha(STAIN_MS / 2), 12);
    expect(stainAlphaAt(STAIN_MS / 2, false)).toBeLessThan(stainAlpha(0));
    expect(stainAlphaAt(0, true)).toBe(stainAlpha(0));
    expect(stainAlphaAt(STAIN_MS / 2, true)).toBe(stainAlpha(0));
    expect(stainAlphaAt(STAIN_MS, true)).toBe(0);
    expect(stainAlphaAt(STAIN_MS, false)).toBe(0);
  });

  it('camera easing → instant: in reduced motion presets and Find set the view at once', () => {
    // P4.13: with motion on, player-initiated moves ease over 220 ms (tests/render/camera-easing.test.ts);
    // in reduced motion every move is instant (UX §7.4).
    const c = new Camera();
    c.setViewport(800, 600);
    c.clock = () => 0;
    c.reducedMotion = true;
    c.centerOn(30, 40, ZOOM_CLOSE);
    expect([c.cx, c.cy, c.zoom]).toEqual([30, 40, ZOOM_CLOSE]);
    expect(c.moving).toBe(false);
    c.fit();
    expect([c.cx, c.cy, c.zoom]).toEqual([64, 64, c.fitZoom()]);
    expect(read('src', 'render', 'camera.ts')).not.toMatch(/requestAnimationFrame|performance\.now/);
  });

  it('favorite glyphs, probe outlines, selection, lineage marks and links are static (they read no clock)', () => {
    const src = read('src', 'render', 'renderer.ts');
    const body = (name: string) => {
      const start = src.indexOf(`  private ${name}(`);
      expect(start, name).toBeGreaterThan(0);
      const end = src.indexOf('\n  }\n', start);
      return src.slice(start, end);
    };
    for (const name of ['drawFavorites', 'drawProbes', 'drawLineage', 'drawLinks']) {
      expect(body(name), name).not.toMatch(/\bnow\b|performance|Date/);
    }
  });

  it('the renderer takes every reduced-motion choice from these functions (no inline clock math left)', () => {
    const src = read('src', 'render', 'renderer.ts');
    for (const fn of ['effectForEvent', 'placementEffect', 'effectLook', 'bodyFrameIndex', 'newbornAlpha', 'ghostDurationMs', 'ghostFrameIndex', 'decayTileAlpha', 'featurePulseOn', 'stainAlphaAt'])
      expect(src, fn).toContain(`${fn}(`);
    expect(src).not.toContain('if (this.opts.reducedMotion) return;'); // the placement ring no longer vanishes
  });
});

describe('CSS: no animation or transition runs with reduced motion (notices, sheets, Show me)', () => {
  const css = read('src', 'ui', 'styles.css');

  it('the device setting and the Settings class both remove every animation and transition, pseudo-elements included', () => {
    const media = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    const block = media.slice(0, media.indexOf('\n}\n'));
    for (const sel of ['*,', '*::before,', '*::after']) expect(block).toContain(sel);
    expect(block).toContain('animation: none !important');
    expect(block).toContain('transition: none !important');
    for (const sel of ['.reduced-motion *,', '.reduced-motion *::before,', '.reduced-motion *::after']) expect(css).toContain(sel);
  });

  it('the only CSS animation is the Show me pulse, and no transition is declared anywhere else', () => {
    expect([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])).toEqual(['show-me-pulse']);
    const transitions = css.split('\n').filter((l) => /^\s*transition\s*:/.test(l));
    expect(transitions.every((l) => /none !important/.test(l))).toBe(true);
  });
});

describe('UX §7.4 table: every "As built" cell names a real file and symbol', () => {
  it('rows parse, the files exist and hold each symbol', () => {
    const ux = read('docs', 'UX_SPEC.md');
    const start = ux.indexOf('### 7.4 Reduced motion');
    const section = ux.slice(start, ux.indexOf('\n## 8.', start));
    const rows = section.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Effect') && !l.startsWith('|---'));
    expect(rows.length).toBeGreaterThanOrEqual(20);
    const effects = rows.map((r) => r.split('|')[1]!.trim());
    for (const e of ['eating pulse', 'division flash', 'death dissolve', 'link/transfer pulse (F02)', 'handling arc', 'glow halo', 'camera easing', 'particles', 'unfolding (wake)', 'trails (E07)', 'trails (P07)', 'deposit/placement ring', 'food‑object stain', 'favorite glyphs', 'probe outlines', 'prompt "Show me" highlight', 'notices and sheets'])
      expect(effects, e).toContain(e);
    for (const r of rows) {
      const cell = r.split('|')[3]!;
      const refs = [...cell.matchAll(/`([^`:]+): ([^`]+)`/g)];
      expect(refs.length, r).toBeGreaterThan(0);
      for (const [, file, symbols] of refs) {
        expect(existsSync(join(ROOT, file!)), file).toBe(true);
        const text = read(file!);
        for (const sym of symbols!.split(',').map((x) => x.trim())) expect(text, `${file}: ${sym}`).toContain(sym);
      }
    }
    // Phase 5 effects really are absent from the v1.0 manifest.
    const manifest = JSON.parse(read('content', 'manifest.json')) as { enabledSpecies: string[] };
    expect(manifest.enabledSpecies.length).toBeGreaterThan(0);
    expect(manifest.enabledSpecies).not.toContain('P07');
  });
});
