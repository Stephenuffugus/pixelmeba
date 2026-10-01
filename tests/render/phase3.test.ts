/**
 * Phase 3 drawing rules (wave 2 art-features; UX §6.2, §6.5, §7.2–7.4; SPEC §7.1–7.5, §9 visuals,
 * §10.8). Everything the renderer draws for Phase 3 is a pure function of snapshot data and the
 * display settings (src/render/features.ts, src/render/world3.ts), so these tests prove: every E_CUE2
 * bit maps to exactly one layer and nothing shows when it is 0; reduced motion picks the static
 * variants; at most two cues at normal zoom; fungi never take the body path; film, food objects and the
 * infection glyph follow the snapshot only; and src/render reads nothing but snapshot types, the atlas
 * manifest, @sim/constants and @sim/grid (ARCH §3, W2-30).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CELL_COUNT, GRID_W } from '../../src/sim/constants';
import { cellIndex } from '../../src/sim/grid';
import {
  CUE2_ANCHORED,
  CUE2_DETRITUS_INTAKE,
  CUE2_INFECTED,
  CUE2_LINKED,
  CUE2_MOD_E04,
  CUE2_MOD_E06,
  CUE2_MOD_E07,
  CUE2_MOD_E08,
  CUE2_MOD_E09,
  CUE2_MOD_E10,
  CUE2_MOD_E12,
  CUE2_PARASITIZED,
  CUE2_RELEASING_PROTEIN,
  CUE2_SEEKING_LIGHT,
  CUE_MOD_E01,
  CUE_MOD_E03,
  CUE_MOD_E05,
  DEPOSIT_FILM_BAND,
  E_CUE2,
  E_X,
  E_Y,
  ENT_STRIDE,
  FILM_ERODING,
  LINKMASK_E,
  LINKMASK_N,
  LINKMASK_S,
  LINKMASK_TRANSFER,
  LINKMASK_W,
} from '../../src/worker/protocol';
import { CUE2_LAYER, featureLayers, MAX_UNSELECTED_MARKS, type LayerPick } from '../../src/render/features';
import {
  drawKindOf,
  FILM_CENTER,
  FILM_EDGE,
  FILM_ERODING_TILE,
  FILM_ISOLATED,
  filmAlpha,
  filmLevelBand,
  filmTile,
  fungalPick,
  infectionGlyphShown,
  objectFrame,
  PULSE_FRAME_MS,
  riderMarks,
  STAIN_MS,
  stainAlpha,
  tileFrameKey,
} from '../../src/render/world3';
import { TILE_FRAMES, tileFrameKey as validatorTileKey } from '../../tools/content-validate';
import { REPO_ROOT } from '../../tools/lib/content-fs';

const ALL_CUE2 = [
  CUE2_INFECTED,
  CUE2_PARASITIZED,
  CUE2_ANCHORED,
  CUE2_LINKED,
  CUE2_MOD_E04,
  CUE2_MOD_E06,
  CUE2_MOD_E07,
  CUE2_MOD_E08,
  CUE2_MOD_E09,
  CUE2_MOD_E10,
  CUE2_MOD_E12,
  CUE2_SEEKING_LIGHT,
  CUE2_DETRITUS_INTAKE,
  CUE2_RELEASING_PROTEIN,
];

/** The bits each layer needs together (a foot only on an anchored E04 carrier, …). */
const NEEDS: Readonly<Record<number, number>> = {
  [CUE2_ANCHORED]: CUE2_MOD_E04,
  [CUE2_MOD_E04]: CUE2_ANCHORED,
  [CUE2_LINKED]: CUE2_MOD_E12,
  [CUE2_MOD_E12]: CUE2_LINKED,
  [CUE2_SEEKING_LIGHT]: CUE2_MOD_E07,
  [CUE2_MOD_E07]: CUE2_SEEKING_LIGHT,
  [CUE2_DETRITUS_INTAKE]: CUE2_MOD_E08,
  [CUE2_RELEASING_PROTEIN]: CUE2_MOD_E09,
};

function layers(cue: number, cue2: number, opts: { selected?: boolean; reduced?: boolean; filmBand?: number; pulseOn?: boolean; life?: number } = {}): string[] {
  const picks: LayerPick[] = [];
  const n = featureLayers(cue, opts.life ?? 0, opts.selected ?? true, picks, cue2, { reduced: opts.reduced, filmBand: opts.filmBand, pulseOn: opts.pulseOn });
  return picks.slice(0, n).map((p) => `${p.layer}/${p.frame}`);
}

/** Entities record buffer for riderMarks (only the fields it reads). */
function ents(records: readonly { x: number; y: number; cue2?: number }[]): Float32Array {
  const out = new Float32Array(records.length * ENT_STRIDE);
  records.forEach((r, k) => {
    out[k * ENT_STRIDE + E_X] = r.x;
    out[k * ENT_STRIDE + E_Y] = r.y;
    out[k * ENT_STRIDE + E_CUE2] = r.cue2 ?? 0;
  });
  return out;
}

describe('Phase 3 cue bits → layers (W2-28, W2-29)', () => {
  it('every E_CUE2 bit maps to exactly one drawn layer', () => {
    // The two status bits drive the infection glyph and the rider order; every other bit one feature layer.
    expect(new Set(ALL_CUE2).size).toBe(14);
    const featureBits = ALL_CUE2.filter((b) => b !== CUE2_INFECTED && b !== CUE2_PARASITIZED);
    expect(Object.keys(CUE2_LAYER).map(Number).sort((a, b) => a - b)).toEqual([...featureBits].sort((a, b) => a - b));
    for (const bit of featureBits) {
      const layer = CUE2_LAYER[bit]!;
      const full = bit | (NEEDS[bit] ?? 0);
      // With what it needs, the bit shows its layer and nothing else.
      const shown = layers(0, full);
      expect(shown.map((s) => s.split('/')[0]), `bit ${bit}`).toEqual([layer]);
      // Without the bit, what it drove is gone (the layer, or for a pulse/release bit its live frame).
      const without = layers(0, full & ~bit);
      expect(without, `bit ${bit} off`).not.toContain(shown[0]);
    }
    // The status bits draw no feature layer.
    expect(layers(0, CUE2_INFECTED | CUE2_PARASITIZED)).toEqual([]);
    expect(infectionGlyphShown(CUE2_INFECTED, true, false)).toBe(true);
    expect(riderMarks(ents([{ x: 4.5, y: 4.5, cue2: CUE2_PARASITIZED }, { x: 4.5, y: 4.5 }]), 2, new Uint8Array(2))).toBe(1);
  });

  it('nothing shows when its bit is 0', () => {
    expect(layers(0, 0)).toEqual([]);
    // No foot without CUE2_ANCHORED, no link pixels without CUE2_LINKED, no trail without SEEKING_LIGHT.
    expect(layers(0, CUE2_MOD_E04)).toEqual([]);
    expect(layers(0, CUE2_ANCHORED)).toEqual([]);
    expect(layers(0, CUE2_MOD_E12)).toEqual([]);
    expect(layers(0, CUE2_LINKED)).toEqual([]);
    expect(layers(0, CUE2_MOD_E07)).toEqual([]);
    expect(layers(0, CUE2_SEEKING_LIGHT)).toEqual([]);
    // No granule pulse without recorded detritus intake; no pale release marks without a release.
    expect(layers(0, CUE2_MOD_E08)).toEqual(['debris_granule/0']);
    expect(layers(0, CUE2_MOD_E08 | CUE2_DETRITUS_INTAKE)).toEqual(['debris_granule/1']);
    expect(layers(0, CUE2_DETRITUS_INTAKE)).toEqual([]);
    expect(layers(0, CUE2_MOD_E09)).toEqual(['protein_notches/0']);
    expect(layers(0, CUE2_MOD_E09 | CUE2_RELEASING_PROTEIN)).toEqual(['protein_notches/1']);
    expect(layers(0, CUE2_RELEASING_PROTEIN)).toEqual([]);
    // Matrix edge by the film band of its cell (frame 0 = no film there).
    expect([0, 1, 2, 3].map((b) => layers(0, CUE2_MOD_E10, { filmBand: b })[0])).toEqual(['matrix_edge/0', 'matrix_edge/1', 'matrix_edge/2', 'matrix_edge/3']);
    expect(filmLevelBand(0)).toBe(0);
    expect([1, 42, 43, 85, 86, 127].map(filmLevelBand)).toEqual([1, 1, 2, 2, 3, 3]);
    // No glyph without infection, whatever is selected or toggled; with it, only inspected or toggled.
    for (const sel of [false, true]) for (const on of [false, true]) expect(infectionGlyphShown(0, sel, on)).toBe(false);
    expect(infectionGlyphShown(CUE2_INFECTED, false, false)).toBe(false);
    expect(infectionGlyphShown(CUE2_INFECTED, false, true)).toBe(true);
    expect(infectionGlyphShown(CUE2_INFECTED | CUE2_PARASITIZED, true, false)).toBe(true);
    // No rider without a parasitized host: same position, but the host bit is 0.
    expect(riderMarks(ents([{ x: 4.5, y: 4.5 }, { x: 4.5, y: 4.5 }]), 2, new Uint8Array(2))).toBe(0);
  });

  it('reduced motion picks the static variants (UX §7.4)', () => {
    // Trails (E07): none.
    expect(layers(0, CUE2_MOD_E07 | CUE2_SEEKING_LIGHT, { reduced: true })).toEqual([]);
    expect(layers(0, CUE2_MOD_E07 | CUE2_SEEKING_LIGHT, { reduced: false })).toEqual(['light_trail/0']);
    // Eating pulse → a static feeding mark: the bright frame, whatever the pulse phase.
    expect(layers(0, CUE2_MOD_E08 | CUE2_DETRITUS_INTAKE, { reduced: true, pulseOn: false })).toEqual(['debris_granule/1']);
    expect(layers(0, CUE2_MOD_E08 | CUE2_DETRITUS_INTAKE, { reduced: false, pulseOn: false })).toEqual(['debris_granule/0']);
    // Link/transfer pulse → a static dot (pulse frame 0 at every moment).
    const frames = new Set<number>();
    for (let t = 0; t < 3000; t += 50) frames.add(fungalPick(LINKMASK_E | LINKMASK_TRANSFER, 0.5, true, t).pulse);
    expect([...frames]).toEqual([0]);
  });

  it('at most two cues at normal zoom; the rest on selection', () => {
    const bits = [CUE_MOD_E01, CUE_MOD_E03, CUE_MOD_E05];
    let maxSelected = 0;
    for (let a = 0; a < 8; a++) {
      const cue = bits.reduce((acc, b, i) => (a & (1 << i) ? acc | b : acc), 0);
      for (let m = 0; m < 1 << 12; m += 7) {
        const cue2 = ALL_CUE2.slice(2).reduce((acc, b, i) => (m & (1 << i) ? acc | b : acc), 0);
        for (const life of [0, 2]) {
          const normal = layers(cue, cue2, { selected: false, life });
          const selected = layers(cue, cue2, { selected: true, life });
          expect(normal.length).toBeLessThanOrEqual(MAX_UNSELECTED_MARKS);
          expect(selected.slice(0, normal.length)).toEqual(normal);
          maxSelected = Math.max(maxSelected, selected.length);
        }
      }
    }
    expect(MAX_UNSELECTED_MARKS).toBe(2);
    expect(maxSelected).toBeGreaterThan(2);
    // Live state comes first: an anchored, linked E04/E12 carrier with a reserve shows foot and link pixels.
    expect(layers(CUE_MOD_E05, CUE2_MOD_E04 | CUE2_ANCHORED | CUE2_MOD_E12 | CUE2_LINKED | CUE2_MOD_E06, { selected: false })).toEqual(['anchor_foot/0', 'adhesion_link/0']);
  });
});

describe('fungal segments (D-0046; never the body path)', () => {
  it('the tile is the link mask; a tip on ≤ 1 link; a bud at E_GROWTH ≥ 1; a pulse only with bit 4, ≤ 1/s', () => {
    for (let mask = 0; mask < 16; mask++) {
      const p = fungalPick(mask, 0.5, false, 0);
      expect(p.mask).toBe(mask);
      const bits = [LINKMASK_N, LINKMASK_E, LINKMASK_S, LINKMASK_W].filter((b) => mask & b).length;
      expect(p.tip, `mask ${mask}`).toBe(bits <= 1);
      expect(p.bud).toBe(false);
      expect(p.pulse).toBe(-1);
    }
    expect(fungalPick(LINKMASK_E, 0.99, false, 0).bud).toBe(false);
    expect(fungalPick(LINKMASK_E, 1, false, 0).bud).toBe(true);
    // No pulse without bit 4, at any time.
    for (let t = 0; t < 5000; t += 37) expect(fungalPick(LINKMASK_E | LINKMASK_W, 1, false, t).pulse).toBe(-1);
    // With bit 4: alternates 0/1, at most one full pulse per second.
    let changes = 0;
    let last = fungalPick(LINKMASK_E | LINKMASK_TRANSFER, 0.5, false, 0).pulse;
    for (let t = 0; t <= 1000; t += 10) {
      const f = fungalPick(LINKMASK_E | LINKMASK_TRANSFER, 0.5, false, t).pulse;
      expect([0, 1]).toContain(f);
      if (f !== last) changes++;
      last = f;
    }
    expect(PULSE_FRAME_MS).toBeGreaterThanOrEqual(500);
    expect(changes).toBeLessThanOrEqual(2);
  });

  it('fungi and viruses are told from the manifest; the renderer routes fungi to tiles and never draws a virus body', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'public', 'atlas', 'manifest.json'), 'utf8')) as {
      sprites: Record<string, { speciesId: string; animations: Record<string, unknown> }>;
    };
    const kinds = Object.fromEntries(Object.values(manifest.sprites).map((s) => [s.speciesId, drawKindOf(s)]));
    expect(kinds.F01).toBe('fungus');
    expect(kinds.F02).toBe('fungus');
    expect(kinds.V01).toBe('virus');
    for (const id of ['A01', 'B01', 'B02', 'P01', 'P04', 'X01', 'Y01']) expect(kinds[id], id).toBe('body');
    expect(drawKindOf(undefined)).toBe('body');
    // renderer.ts: the body animation (move ?? idle) is chosen only in the non-fungus branch; a virus
    // is skipped; a dead segment shows its decaying tile, never a body dissolve.
    const src = readFileSync(join(REPO_ROOT, 'src', 'render', 'renderer.ts'), 'utf8');
    expect(src).toMatch(/if \(!d \|\| d\.kind === 'virus'\) continue;/);
    expect(src).toMatch(/if \(d\.kind === 'fungus'\) \{[\s\S]{0,400}?d\.fungus\?\.mask\[fungal\.mask\][\s\S]{0,200}?\} else \{\s*const a = [^\n]*\(d\.move \?\? d\.idle\);/);
    expect(src.match(/d\.move \?\? d\.idle/g)).toHaveLength(1);
    expect(src).toMatch(/d\.fungus\?\.decaying\[\(prev\.ents\[o \+ E_LINKMASK\] \?\? 0\) & 15\]/);
    expect(src).toMatch(/if \(!d\?\.death \|\| d\.kind !== 'body'\) continue;/);
  });
});

describe('film, food objects and riders (UX §6.2, §6.5; SPEC §7.4)', () => {
  const deposits = () => new Uint8Array(7 * CELL_COUNT);
  const setFilm = (d: Uint8Array, x: number, y: number, v: number) => (d[DEPOSIT_FILM_BAND * CELL_COUNT + cellIndex(x, y)] = v);

  it('film tiles follow the four-neighbour film mask and the eroding bit; opacity follows the level', () => {
    const d = deposits();
    expect(filmTile(d, cellIndex(10, 10))).toBe(-1);
    setFilm(d, 10, 10, 40);
    expect(filmTile(d, cellIndex(10, 10))).toBe(FILM_ISOLATED);
    setFilm(d, 11, 10, 40);
    expect(filmTile(d, cellIndex(10, 10))).toBe(FILM_EDGE);
    setFilm(d, 9, 10, 40);
    setFilm(d, 10, 9, 40);
    setFilm(d, 10, 11, 40);
    expect(filmTile(d, cellIndex(10, 10))).toBe(FILM_CENTER);
    // Diagonals do not count; an eroding cell shows eroding whatever its neighbours.
    setFilm(d, 20, 20, 30);
    setFilm(d, 21, 21, 30);
    expect(filmTile(d, cellIndex(20, 20))).toBe(FILM_ISOLATED);
    setFilm(d, 10, 10, 40 | FILM_ERODING);
    expect(filmTile(d, cellIndex(10, 10))).toBe(FILM_ERODING_TILE);
    // An eroding neighbour still holds film.
    expect(filmTile(d, cellIndex(11, 10))).toBe(FILM_EDGE);
    // Row ends do not wrap to the neighbouring row.
    const e = deposits();
    setFilm(e, GRID_W - 1, 5, 20);
    setFilm(e, 0, 6, 20);
    expect(filmTile(e, cellIndex(GRID_W - 1, 5))).toBe(FILM_ISOLATED);
    // Opacity rises with film carbon; nothing at 0. An old (6-band) snapshot shows no film.
    expect(filmAlpha(0)).toBe(0);
    expect(filmAlpha(1)).toBeLessThan(filmAlpha(64));
    expect(filmAlpha(64)).toBeLessThan(filmAlpha(127));
    expect(filmAlpha(127)).toBeLessThanOrEqual(1);
    expect(filmTile(new Uint8Array(6 * CELL_COUNT), 0)).toBe(-1);
  });

  it('food objects: four fill steps, the outline shrinking with fill; a stain fades out', () => {
    expect([1, 0.76, 0.75, 0.51, 0.5, 0.26, 0.25, 0.01].map(objectFrame)).toEqual([3, 3, 2, 2, 1, 1, 0, 0]);
    expect(stainAlpha(0)).toBeGreaterThan(stainAlpha(STAIN_MS / 2));
    expect(stainAlpha(STAIN_MS)).toBe(0);
    expect(stainAlpha(-1)).toBe(0);
  });

  it('a parasite is drawn at its host, after it; the host and everyone else are not riders', () => {
    const e = ents([
      { x: 40.5, y: 64.5 }, // the parasite (packed at the host's position)
      { x: 40.5, y: 64.5, cue2: CUE2_PARASITIZED }, // its host
      { x: 40.6, y: 64.5 }, // a neighbour in the same cell, not on the host
      { x: 70.5, y: 64.5 },
    ]);
    const out = new Uint8Array(4);
    expect(riderMarks(e, 4, out)).toBe(1);
    expect([...out]).toEqual([1, 0, 0, 0]);
  });

  it('tile keys are the keys the art build writes and content:validate checks, for every world tile', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'public', 'atlas', 'manifest.json'), 'utf8')) as {
      tiles: Record<string, { size: number; frames: number }>;
      frames: { key: string }[];
    };
    const have = new Set(manifest.frames.map((f) => f.key));
    expect(Object.keys(manifest.tiles).sort()).toEqual(Object.keys(TILE_FRAMES).sort());
    for (const [id, t] of Object.entries(manifest.tiles)) {
      expect(t.frames, id).toBe(TILE_FRAMES[id]!.frames);
      for (let f = 0; f < t.frames; f++) {
        expect(tileFrameKey(id, f)).toBe(validatorTileKey(id, f));
        expect(have.has(tileFrameKey(id, f)), tileFrameKey(id, f)).toBe(true);
      }
    }
    // The renderer's film tiles (isolated, edge, center, eroding) and object steps exist.
    for (const t of [FILM_ISOLATED, FILM_EDGE, FILM_CENTER, FILM_ERODING_TILE]) expect(have.has(tileFrameKey('film', t))).toBe(true);
    for (const kind of ['pellet', 'wafer']) for (let f = 0; f < 4; f++) expect(have.has(tileFrameKey(kind, f))).toBe(true);
  });
});

describe('module boundary (ARCH §3, W2-30)', () => {
  it('src/render imports nothing from art/src and no @sim module beyond @sim/constants and @sim/grid', () => {
    const dir = join(REPO_ROOT, 'src', 'render');
    const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((f) => /\.tsx?$/.test(f));
    expect(files).toContain('world3.ts');
    const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"`]([^'"`]+)['"`]/g;
    const seen = new Set<string>();
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8');
      for (const m of text.matchAll(IMPORT)) {
        const spec = m[1]!;
        seen.add(spec);
        expect(spec, `${f}: ${spec}`).not.toMatch(/(^@art\/|art\/src)/);
        if (spec.startsWith('@sim/')) expect(['@sim/constants', '@sim/grid'], `${f}: ${spec}`).toContain(spec);
        expect(spec.startsWith('../'), `${f}: ${spec}`).toBe(false);
      }
    }
    expect(seen.has('@worker/protocol')).toBe(true);
  });
});

