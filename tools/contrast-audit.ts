/**
 * Contrast audit (UX §4.1, §6.1, §9; BUILD_DIRECTIVE P3.11; W6-08).
 *
 *   npx tsx tools/contrast-audit.ts            # print the summary; exit 1 on an unexplained failure
 *   npx tsx tools/contrast-audit.ts --write    # also write docs/reports/contrast.md
 *
 * Every text/background and essential-graphic pair the game draws, from the sources themselves:
 * - interface tokens and colour rules parsed from src/ui/styles.css (:root custom properties);
 * - the named palette in art/src/palette.ts (UX §6.1) and each organism sprite's outline and body
 *   colours (art/src/index.ts SPRITES: palette index 1 is the outline, index 2 the body);
 * - the dish and deposit colours and the overlay ramps in src/render/layers.ts (DISH_COLORS, RAMPS);
 * - the species identity colours (src/render/speciesColors.ts) and the trait band colours
 *   (TRAIT_BAND_COLORS, read from src/render/renderer.ts's source: importing it would load Pixi).
 *
 * Text needs ≥ 4.5:1, essential graphics ≥ 3:1 (WCAG 1.4.3 / 1.4.11). A failing pair passes the audit
 * only with a written justification below (JUSTIFIED); the report prints the justification next to it.
 * Ratios are rounded down when printed. Translucent backgrounds are composited over the darkest and
 * the lightest thing they can sit on, and the worse result counts.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { P } from '../art/src/palette';
import { SPRITES } from '../art/src/index';
import { DISH_COLORS, RAMPS, type Colormap } from '../src/render/layers';
import { AGG_INK_HEX, speciesHex } from '../src/render/speciesColors';
import {
  bestRingRatio,
  contrastRatio,
  formatRatio,
  fromInt,
  GRAPHIC_MIN,
  over,
  parseHex,
  TEXT_MIN,
  toHex,
  type Rgb,
} from '../src/ui/a11y/contrast';

const ROOT = join(import.meta.dirname, '..');
const REPORT = join(ROOT, 'docs', 'reports', 'contrast.md');

// ------------------------------------------------------------------------------------ sources

/** The :root custom properties of styles.css whose values are hex colours. */
function cssTokens(): Record<string, string> {
  const css = readFileSync(join(ROOT, 'src', 'ui', 'styles.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const root = /:root\s*\{([^}]*)\}/.exec(css);
  if (!root) throw new Error('styles.css: no :root block');
  const out: Record<string, string> = {};
  for (const m of root[1]!.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)) out[m[1]!] = m[2]!;
  return out;
}

/** TRAIT_BAND_COLORS and TRAIT_INACTIVE_COLOR from renderer.ts's source text. */
function traitBands(): { bands: number[]; inactive: number; outline: string } {
  const src = readFileSync(join(ROOT, 'src', 'render', 'renderer.ts'), 'utf8');
  const b = /TRAIT_BAND_COLORS = \[([^\]]+)\]/.exec(src);
  const i = /TRAIT_INACTIVE_COLOR = (0x[0-9a-fA-F]{6})/.exec(src);
  const o = /TRAIT_RING_OUTLINE_CSS = '(#[0-9a-fA-F]{6})'/.exec(src);
  if (!b || !i || !o) throw new Error('renderer.ts: trait band constants not found');
  return { bands: b[1]!.split(',').map((s) => Number(s.trim())), inactive: Number(i[1]), outline: o[1]! };
}

const T = cssTokens();
const tok = (name: string): Rgb => {
  const v = T[name];
  if (!v) throw new Error(`styles.css: no --${name} token`);
  return parseHex(v);
};
const hex = parseHex;
const rgb = (c: readonly [number, number, number]): Rgb => [c[0], c[1], c[2]];

// ------------------------------------------------------------------------------------ pairs

type Kind = 'text' | 'graphic';
interface Pair {
  readonly group: string;
  readonly id: string;
  readonly what: string;
  readonly kind: Kind;
  readonly fg: Rgb;
  readonly bg: Rgb;
  /** Several foreground colours that together form one indicator (the focus ring): the best counts. */
  readonly rings?: readonly Rgb[];
  /** Informative pairs are listed but carry no requirement (decoration, or meaning carried elsewhere). */
  readonly informative?: boolean;
}

const pairs: Pair[] = [];
const add = (p: Pair) => pairs.push(p);

/** A translucent surface (alpha) as it looks over its darkest and lightest possible backdrops. */
function translucent(surface: Rgb, alpha: number): Rgb[] {
  return [
    over(surface, alpha, hex(P.outside)),
    over(surface, alpha, hex(P.sediment)),
    over(surface, alpha, hex(P.gel)),
  ];
}

// --- Interface text (styles.css) ---------------------------------------------------------------
const surfaces: [string, Rgb][] = [
  ['--surface', tok('surface')],
  ['--surface-2', tok('surface-2')],
  ['--surface-3', tok('surface-3')],
  ['.constraint #EEF4F6', hex('#eef4f6')],
  ['inputs #FFFFFF', hex('#ffffff')],
];
for (const [name, bg] of surfaces) {
  add({
    group: 'Interface text',
    id: `text/${name}`,
    what: `--text on ${name}`,
    kind: 'text',
    fg: tok('text'),
    bg,
  });
  add({
    group: 'Interface text',
    id: `muted/${name}`,
    what: `--text-muted on ${name}`,
    kind: 'text',
    fg: tok('text-muted'),
    bg,
  });
}
const ui: [string, Rgb, Rgb, string][] = [
  [
    'primary/surface',
    tok('primary'),
    tok('surface'),
    '--primary text (links, What if? link, journal mark) on --surface',
  ],
  ['primary/surface-2', tok('primary'), tok('surface-2'), '--primary text on --surface-2 (link hover)'],
  ['primary-ink/primary', tok('primary-ink'), tok('primary'), 'primary button label on --primary'],
  [
    'primary-ink/primary-hover',
    tok('primary-ink'),
    hex('#1f5f89'),
    'primary button label on its hover #1F5F89',
  ],
  [
    'surface/text',
    tok('surface'),
    tok('text'),
    'selected/pressed button, chosen tab, toast: --surface on --text',
  ],
  [
    'danger/surface',
    tok('danger'),
    tok('surface'),
    '--danger text ("running at …", journal errors) on --surface',
  ],
  ['danger/surface-2-unused', tok('danger'), tok('surface-2'), '--danger text on --surface-2'],
  ['ok/surface', tok('ok'), tok('surface'), '--ok text (stamp and gate marks) on --surface'],
  [
    'established/surface-2',
    hex('#2c5a2a'),
    tok('surface-2'),
    'lineage chip "established" #2C5A2A on --surface-2',
  ],
  ['pinned/surface-2', hex('#1f5f89'), tok('surface-2'), 'lineage chip "pinned" #1F5F89 on --surface-2'],
  ['nb-dot', tok('text'), tok('focus'), 'Notebook dot: --text on --focus'],
  ['capacity', tok('text'), hex('#fff4dd'), 'capacity banner: --text on #FFF4DD'],
  ['page/outside', tok('surface'), tok('outside'), 'page titles: --surface on --outside'],
  [
    'page/gradient',
    tok('surface'),
    hex('#1d3440'),
    'page titles: --surface on the page gradient centre #1D3440',
  ],
  [
    'tagline/outside',
    hex('#c9d6d8'),
    tok('outside'),
    'tagline, "Preparing the dish…", compare loading #C9D6D8 on --outside',
  ],
  ['tagline/gradient', hex('#c9d6d8'), hex('#1d3440'), 'tagline #C9D6D8 on the page gradient centre #1D3440'],
  [
    'nb-intro/outside',
    hex('#dfe8ea'),
    tok('outside'),
    'Notebook intro and section titles #DFE8EA on --outside',
  ],
];
for (const [id, fg, bg, what] of ui) add({ group: 'Interface text', id, what, kind: 'text', fg, bg });
// Translucent panels over the dish (prompt, legends, Lab brush chip, sample panel, compare labels).
for (const [id, a, what] of [
  [
    'prompt',
    0.92,
    'zoom buttons, prompt, legends, brush chip, sample panel, compare labels (--surface at 92–97 %)',
  ],
] as const) {
  for (const bg of translucent(tok('surface'), a)) {
    add({
      group: 'Interface text',
      id: `${id}/text/${toHex(bg)}`,
      what: `--text on ${what}, over ${toHex(bg)}`,
      kind: 'text',
      fg: tok('text'),
      bg,
    });
    add({
      group: 'Interface text',
      id: `${id}/muted/${toHex(bg)}`,
      what: `--text-muted on ${what}, over ${toHex(bg)}`,
      kind: 'text',
      fg: tok('text-muted'),
      bg,
    });
  }
}

// --- The UX §6.1 interface palette (art/src/palette.ts) ------------------------------------------
add({
  group: 'UX §6.1 palette',
  id: 'P.text/P.surface',
  what: 'palette text on surface',
  kind: 'text',
  fg: hex(P.text),
  bg: hex(P.surface),
});
add({
  group: 'UX §6.1 palette',
  id: 'P.primary/P.surface',
  what: 'palette primary on surface',
  kind: 'text',
  fg: hex(P.primary),
  bg: hex(P.surface),
});
add({
  group: 'UX §6.1 palette',
  id: 'P.muted/P.surface',
  what: 'palette muted #6B7B84 on surface',
  kind: 'text',
  fg: hex(P.muted),
  bg: hex(P.surface),
});
add({
  group: 'UX §6.1 palette',
  id: 'P.danger/P.surface',
  what: 'palette danger on surface',
  kind: 'text',
  fg: hex(P.danger),
  bg: hex(P.surface),
});
add({
  group: 'UX §6.1 palette',
  id: 'P.surface/P.outside',
  what: 'palette surface on outside',
  kind: 'text',
  fg: hex(P.surface),
  bg: hex(P.outside),
});

// --- Focus ring: the amber with its ink companion, against every surface it can sit on -----------
const ring = [tok('focus'), tok('focus-ink')];
const ringSurfaces: [string, Rgb][] = [
  ...surfaces,
  ['--outside', tok('outside')],
  ['page gradient #1D3440', hex('#1d3440')],
  ['--text (inside a chosen control)', tok('text')],
  ['--primary', tok('primary')],
  ['water', hex(P.water)],
  ['gel', hex(P.gel)],
  ['sediment', hex(P.sediment)],
  ['stone', hex(P.stone)],
  ['wall', hex(P.wall)],
];
for (const [name, bg] of ringSurfaces) {
  add({
    group: 'Focus ring',
    id: `ring/${name}`,
    what: `focus ring (amber ${T['focus']} + ink ${T['focus-ink']}) on ${name}`,
    kind: 'graphic',
    fg: ring[0]!,
    bg,
    rings: ring,
  });
  add({
    group: 'Focus ring',
    id: `amber/${name}`,
    what: `amber alone on ${name}`,
    kind: 'graphic',
    fg: tok('focus'),
    bg,
    informative: true,
  });
}

// --- Meters and marks --------------------------------------------------------------------------
const css = readFileSync(join(ROOT, 'src', 'ui', 'styles.css'), 'utf8');
const ruleColor = (selector: string, prop = 'background'): Rgb => {
  const re = new RegExp(
    `${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{[^}]*?${prop}:\\s*(#[0-9a-fA-F]{3,6})`,
  );
  const m = re.exec(css);
  if (!m) throw new Error(`styles.css: ${selector} ${prop} not found`);
  return parseHex(m[1]!);
};
add({
  group: 'Meters and marks',
  id: 'bar/primary',
  what: 'inspector bar fill --primary on its track --surface-3',
  kind: 'graphic',
  fg: tok('primary'),
  bg: tok('surface-3'),
});
add({
  group: 'Meters and marks',
  id: 'bar/energy',
  what: 'Energy bar fill (.bar.energy) on --surface-3',
  kind: 'graphic',
  fg: ruleColor('.bar.energy > span'),
  bg: tok('surface-3'),
});
add({
  group: 'Meters and marks',
  id: 'bar/health',
  what: 'Health bar fill (.bar.health) on --surface-3',
  kind: 'graphic',
  fg: ruleColor('.bar.health > span'),
  bg: tok('surface-3'),
});
add({
  group: 'Meters and marks',
  id: 'line/surface',
  what: 'control border --line on --surface',
  kind: 'graphic',
  fg: tok('line'),
  bg: tok('surface'),
  informative: true,
});
add({
  group: 'Meters and marks',
  id: 'chart/ink',
  what: 'chart ink #256E9E on --surface (D-0014)',
  kind: 'graphic',
  fg: hex('#256E9E'),
  bg: tok('surface'),
});

// --- Dish: structures and deposits against the substrates (layers.ts DISH_COLORS) ----------------
const subs: [string, Rgb][] = [
  ['water', rgb(DISH_COLORS.water)],
  ['gel', rgb(DISH_COLORS.gel)],
  ['sediment', rgb(DISH_COLORS.sediment)],
];
for (const [name, bg] of subs) {
  for (const [what, fg] of [
    ['stone', rgb(DISH_COLORS.stone)],
    ['wall', rgb(DISH_COLORS.wall)],
    ['bead', rgb(DISH_COLORS.bead)],
    ['starch grains', rgb(DISH_COLORS.starch)],
    ['starch grain edge', rgb(DISH_COLORS.starchEdge)],
    ['debris flecks', rgb(DISH_COLORS.detritus)],
    ['oil sheen', rgb(DISH_COLORS.oil)],
    ['protein motes', rgb(DISH_COLORS.protein)],
    ['catalysis dust', rgb(DISH_COLORS.catalysis)],
  ] as const) {
    add({
      group: 'Dish structures and deposits',
      id: `${what}/${name}`,
      what: `${what} on ${name}`,
      kind: 'graphic',
      fg,
      bg,
    });
  }
}
// P5.8 (wave 15; D-0125 leftover (a), org-ui-build.md NEEDS 1): grit specks (deposit band 7, layers.ts paintGrit and
// picture.ts paintGritSpecks) are two-tone: a pale face with a dark slate corner. Each substrate has a >= 3:1 part, so
// the part that carries it is required there and the other part is informative.
for (const [name, bg] of subs) {
  const pale = name === 'sediment';
  add({
    group: 'Dish structures and deposits',
    id: `grit speck corner/${name}`,
    what: `grit speck corner (gritEdge) on ${name}`,
    kind: 'graphic',
    fg: rgb(DISH_COLORS.gritEdge),
    bg,
    ...(pale ? { informative: true } : {}),
  });
  add({
    group: 'Dish structures and deposits',
    id: `grit speck face/${name}`,
    what: `grit speck face (gritPale) on ${name}`,
    kind: 'graphic',
    fg: rgb(DISH_COLORS.gritPale),
    bg,
    ...(pale ? {} : { informative: true }),
  });
}
add({
  group: 'Dish structures and deposits',
  id: 'water/outside',
  what: 'water (dish) on outside',
  kind: 'graphic',
  fg: rgb(DISH_COLORS.water),
  bg: hex(P.outside),
});
add({
  group: 'Dish structures and deposits',
  id: 'rim/outside',
  what: 'rim ring #2C3F49 on outside',
  kind: 'graphic',
  fg: hex(P.rim),
  bg: hex(P.outside),
  informative: true,
});

// --- Phase 5 structures against the substrates (wave 12 structures-art-audio; D-0120 "the edge-glyph rows") ---
// The procedural edge glyphs (structureLayer.ts EDGE_GLYPH_COLORS reads these DISH_COLORS), the gate-class badge
// pips (gateBadges.ts BADGE_COLORS) and the device tile outline (art/src/tiles/structures.ts, P.deviceInk).
for (const [name, bg] of subs) {
  for (const [id, what, fg] of [
    ['edgeMembrane', 'S01 membrane edge glyph', rgb(DISH_COLORS.edgeMembrane)],
    ['edgeSieve', 'S02 small gate edge glyph', rgb(DISH_COLORS.edgeSieve)],
    ['edgeShutter', 'S03 shutter edge glyph', rgb(DISH_COLORS.edgeShutter)],
    ['edgeChannel', 'S04 channel edge glyph', rgb(DISH_COLORS.edgeChannel)],
    ['badgePip', 'gate badge pip', rgb(DISH_COLORS.badgePip)],
    ['deviceInk', 'device tile outline (P.deviceInk)', hex(P.deviceInk)],
  ] as const) {
    add({ group: 'Dish structures and deposits', id: `${id}/${name}`, what: `${what} on ${name}`, kind: 'graphic', fg, bg });
  }
}
add({
  group: 'Dish structures and deposits',
  id: 'edgeHalo/sediment',
  what: 'edge glyph halo under-stroke (opaque) on sediment',
  kind: 'graphic',
  fg: rgb(DISH_COLORS.edgeHalo),
  bg: rgb(DISH_COLORS.sediment),
});
add({
  group: 'Dish structures and deposits',
  id: 'edgeHalo@55/sediment',
  what: 'edge glyph halo under-stroke as drawn (55 % over sediment)',
  kind: 'graphic',
  fg: over(rgb(DISH_COLORS.edgeHalo), 0.55, rgb(DISH_COLORS.sediment)),
  bg: rgb(DISH_COLORS.sediment),
  informative: true,
});
add({
  group: 'Dish structures and deposits',
  id: 'badgePip/badgePlate',
  what: 'gate badge pip on its plate',
  kind: 'graphic',
  fg: rgb(DISH_COLORS.badgePip),
  bg: rgb(DISH_COLORS.badgePlate),
});
add({
  group: 'Dish structures and deposits',
  id: 'gatePip/--surface',
  what: 'gate sheet pip (.gate-pip, --text) on the sheet --surface',
  kind: 'graphic',
  fg: tok('text'),
  bg: tok('surface'),
});

// --- Organisms against water, gel and sediment (art/src/index.ts SPRITES) ------------------------
/** The grounds a species lives on (content/species/<id>.json habitats); all three when unknown. */
function habitats(speciesId: string): readonly string[] {
  const f = join(ROOT, 'content', 'species', `${speciesId}.json`);
  if (!existsSync(f)) return ['water', 'gel', 'sediment'];
  const d = JSON.parse(readFileSync(f, 'utf8')) as { habitats?: string[] };
  return d.habitats ?? ['water', 'gel', 'sediment'];
}
// The silhouette is the outline ring (palette index 1) around the body (index 2): the body's shape
// reads against the ground when either of them contrasts with it (the better one counts). On ground
// the species never lives on, the pair is informative.
for (const s of SPRITES) {
  const outline = s.palette[1];
  const body = s.palette[2];
  if (!outline || !body) continue;
  const lives = habitats(s.speciesId);
  for (const [name, bg] of subs) {
    const away = !lives.includes(name);
    add({
      group: 'Organisms (sprites)',
      id: `${s.assetId}/silhouette/${name}`,
      what: `${s.speciesId} ${s.assetId}: outline ${outline} / body ${body} on ${name}${away ? ' (never lives there)' : ''}`,
      kind: 'graphic',
      fg: hex(outline),
      bg,
      rings: [hex(outline), hex(body)],
      ...(away ? { informative: true } : {}),
    });
  }
}

// --- Species identity colours (aggregation at whole-dish zoom on phones; legends; markers) --------
// P5.8 (wave 15, D-0123 MINOR 5, as built): the aggregation layer draws each identity tone with the sprites' ink
// outline (speciesColors.ts paintAggregationInked, AGG_INK = palette outlineDark), so a cell's mark is the tone
// AND its ring, the better one counting (as the sprite silhouette rows). Viruses draw no aggregation cell (they
// are fields, not entities): their tones appear only in legends beside a text label, so they are measured alone.
const speciesIds = [...new Set(SPRITES.map((s) => s.speciesId))].sort();
for (const id of speciesIds) {
  const virus = id.startsWith('V');
  for (const [name, bg] of subs) {
    add({
      group: 'Species identity colours (aggregation)',
      id: `${id}/${name}`,
      what: virus ? `${id} ${speciesHex(id)} on ${name} (legend swatch only)` : `${id} ${speciesHex(id)} with its ink ring ${AGG_INK_HEX} on ${name}`,
      kind: 'graphic',
      fg: hex(speciesHex(id)),
      bg,
      ...(virus ? {} : { rings: [hex(AGG_INK_HEX), hex(speciesHex(id))] }),
    });
  }
}

// --- Overlay ramps (layers.ts RAMPS): low end vs high end, as the legend draws them and over water ---
for (const map of Object.keys(RAMPS) as Colormap[]) {
  const r = RAMPS[map];
  const lo = rgb(r[0]!);
  const hi = rgb(r[r.length - 1]!);
  add({
    group: 'Overlay ramps',
    id: `${map}/legend`,
    what: `${map}: low ${toHex(lo)} vs high ${toHex(hi)} (legend, opaque)`,
    kind: 'graphic',
    fg: hi,
    bg: lo,
  });
  add({
    group: 'Overlay ramps',
    id: `${map}/dish45`,
    what: `${map}: low vs high at the default 45 % opacity over water`,
    kind: 'graphic',
    fg: over(hi, 0.45, rgb(DISH_COLORS.water)),
    bg: over(lo, 0.45, rgb(DISH_COLORS.water)),
  });
}

// --- Trait bands (renderer.ts): each band ring against its ink outline, and legend swatches -------
const tb = traitBands();
for (const [k, v] of tb.bands.entries()) {
  add({
    group: 'Trait bands',
    id: `band${k}/outline`,
    what: `band ${k + 1} ${toHex(fromInt(v))} against its ring outline ${tb.outline}`,
    kind: 'graphic',
    fg: fromInt(v),
    bg: hex(tb.outline),
  });
  add({
    group: 'Trait bands',
    id: `band${k}/surface`,
    what: `band ${k + 1} legend swatch on --surface`,
    kind: 'graphic',
    fg: fromInt(v),
    bg: tok('surface'),
    informative: true,
  });
}
add({
  group: 'Trait bands',
  id: 'inactive/outline',
  what: `inactive grey ${toHex(fromInt(tb.inactive))} against the ring outline`,
  kind: 'graphic',
  fg: fromInt(tb.inactive),
  bg: hex(tb.outline),
});
for (const [name, bg] of subs)
  add({
    group: 'Trait bands',
    id: `ringOutline/${name}`,
    what: `ring outline ${tb.outline} on ${name}`,
    kind: 'graphic',
    fg: hex(tb.outline),
    bg,
  });

// ------------------------------------------------------------------------------------ justifications

/**
 * Failing pairs that stay, with the reason (matched by id prefix). Everything else that fails is a bug.
 * Fixes in art/src and the render colours are proposals for the art owner (no art:build this wave).
 */
const JUSTIFIED: readonly (readonly [string, string])[] = [
  [
    'edgeHalo@55/',
    'Informative: the halo is a pale under-stroke that separates a glyph from dark organisms; the glyph itself (its dark ink, ≥ 3:1 on every substrate) carries the shape.',
  ],
  [
    'P.muted/P.surface',
    'Not used for text: styles.css draws muted text in --text-muted #4F5F67 (6.6:1). Proposal: set P.muted to #4F5F67 in art/src/palette.ts so the palette names the colour the UI uses.',
  ],
  [
    'amber/',
    'Informative: the amber is never the only ring; the ink companion carries it on light surfaces (see "focus ring").',
  ],
  [
    'ring/--primary',
    'The ring is drawn outside the control, on the panel behind it, never on the primary fill; listed for completeness.',
  ],
  [
    'bead/',
    'Beads are drawn as a checkerboard with the substrate showing through (pattern, not colour), and the cell inspector names the ground. Proposal (render/art owner): a darker bead tone such as #7F8C93.',
  ],
  [
    'starch grain',
    'Deposits are glyph textures (grains, flecks, sheen, motes) read by shape and density; the Food access and pool overlays, the legend and the cell inspector give every amount. Proposal: darker deposit edge tones.',
  ],
  [
    'oil sheen',
    'As starch grains: a texture, with the oil overlay and the cell inspector as the exact reading.',
  ],
  [
    'protein motes',
    'As starch grains: a texture, with the protein overlay and the cell inspector as the exact reading.',
  ],
  [
    'catalysis dust/',
    'A sparse speck texture showing where an enzyme converted; the reaction ledger in the cell inspector is the exact reading.',
  ],
  [
    'debris flecks/sediment',
    'Debris on sediment: same as starch grains; the Debris overlay and the cell inspector give the amount.',
  ],
  [
    'stone/sediment',
    'Stone and sediment have the same luminance (1.0:1): stone is told apart only by its bevel (light top-left, dark bottom-right edges, UX §6.5, themselves ≤ 1.8:1 here), its smooth texture and the Ground row of the cell inspector. A real gap. Proposal (art/render owner): a darker stone body on sediment or an ink edge (#232B31) around stone.',
  ],
  [
    'wall/sediment',
    'Wall #3A4650 on sediment is 2.2:1: walls are solid impermeable blocks drawn without the substrate texture, the Lab Inspect Ground row names them, and placements refuse them with a message. Proposal (render/art owner): wall #232B31 (3.3:1 on sediment, still ≥ 3:1 on water and gel).',
  ],
  [
    'f02_cordweaver/silhouette/sediment',
    "Cordweaver copper on sediment (outline #7E4C1F, body #B87333): a real gap. Its hyphae still read by the connection-mask tiles' line shape, and the inspector and the species list name it. Proposal (art owner): the F02 outline in outlineDark #1E2A30 (3.3:1 on sediment) or a pale cordPulse rim.",
  ],
  ['rim/outside', 'Decorative ring; the dish edge is the water/outside boundary (≥ 3:1).'],
  ['line/surface', 'Informative: controls are identified by their text labels and icons, not by the border.'],
  // P5.8 (wave 15, D-0123 MINOR 5) AS BUILT: the Y01 proposal ("aggregation could draw identity colours with the ink
  // outline the sprites use") is built (speciesColors.ts paintAggregationInked, AGG_INK #1E2A30). Every identity row of
  // the 36 organism species now passes by its ring or its tone: the lowest is 3.40:1 (the ink on sediment), the pale
  // tones on water and gel 11.2:1 or more (docs/reports/contrast.md). The Phase 3 and wave 12 identity justifications
  // ('Y01' … 'X01', and the Phase 5 list) are gone with the gap; only the viruses, which draw no aggregation cell, stay.
  [
    'V01',
    'Viruses draw no aggregation cell (density overlay only); identity tone used in legends with a text label.',
  ],
  [
    '/dish45',
    'At the default 45 % opacity an overlay is a tint over the dish; the legend (opaque ramp with numbers), the cell inspector and the opacity setting (up to 90 %) carry the reading, and Settings → Simplified overlay colours gives one light-to-dark ramp.',
  ],
  [
    'food/legend',
    'Food ramp ends at 2.98:1, a hair under 3:1; the legend prints 0 and the measured maximum at its ends, and Simplified overlay colours gives 13:1. Proposal (render owner): high end #CC7019 (3.3:1).',
  ],
  [
    'ph/legend',
    'pH is diverging (acid red, neutral white, base blue): both ends contrast with the neutral centre; Simplified overlay colours gives a monotonic ramp.',
  ],
  ['light/legend', 'Never fails today; listed for completeness.'],
  [
    'band',
    'Trait band rings are tinted rings between two ink outlines: the ring reads against the substrate by its outline; the legend names and counts every band in text (D-0028).',
  ],
  ['inactive/outline', 'Grey ring for inactive loci: named in the legend text.'],
  // Wave 12 (structures-art-audio) justified the Phase 5 identity tones here as the Phase 3 ones; since P5.8 they pass
  // with the ink ring (above), so only V02's legend-only row is kept.
  ['V02/', 'As V01: viruses draw no aggregation cell (density overlay only); the identity tone appears in legends beside a text label.'],
  // P5.8 (wave 15) AS BUILT: F04 Sporeveil's outline is the ring ink sporeveilRing #23272B (art/src/sprites/phase5_fungi.ts),
  // so its silhouette on sediment passes at 3.48:1 (it was 2.30:1 with #5F666D, the gap wave 12 justified here).
  [
    'warmth/legend',
    'Warmth is diverging (cool blue, neutral, warm orange) as pH is: both ends contrast with the neutral centre, the legend prints the values, and the cell inspector gives the local warmth in numbers.',
  ],
  ['bar/energy', 'The meter shows its number in text beside the bar; the bar is supplementary.'],
  ['bar/health', 'The meter shows its number in text beside the bar; the bar is supplementary.'],
];

function justification(id: string): string | null {
  for (const [prefix, why] of JUSTIFIED) if (id.startsWith(prefix) || id.includes(prefix)) return why;
  return null;
}

// ------------------------------------------------------------------------------------ evaluate

interface Row extends Pair {
  readonly ratio: number;
  readonly need: number;
  readonly pass: boolean;
  readonly note: string | null;
}

const rows: Row[] = pairs.map((p) => {
  const ratio = p.rings ? bestRingRatio(p.rings, p.bg) : contrastRatio(p.fg, p.bg);
  const need = p.kind === 'text' ? TEXT_MIN : GRAPHIC_MIN;
  const pass = ratio >= need;
  return {
    ...p,
    ratio,
    need,
    pass,
    note: pass ? null : p.informative ? (justification(p.id) ?? 'Informative only.') : justification(p.id),
  };
});

const required = rows.filter((r) => !r.informative);
const failing = required.filter((r) => !r.pass);
const unexplained = failing.filter((r) => r.note === null);

function report(): string {
  const groups = [...new Set(rows.map((r) => r.group))];
  const out: string[] = [
    '# Contrast audit (P3.11)',
    '',
    'Generated by `npx tsx tools/contrast-audit.ts --write` from the sources (styles.css tokens and rules, art/src/palette.ts, the organism sprites in art/src/index.ts, src/render/layers.ts, src/render/speciesColors.ts, renderer.ts trait bands). Do not edit by hand.',
    '',
    `Thresholds (UX §4.1): text ≥ ${TEXT_MIN}:1, essential graphics ≥ ${GRAPHIC_MIN}:1. Ratios are rounded down. "info" rows carry no requirement (decoration, or meaning carried elsewhere). A failing required row stays only with the justification printed beside it; fixes in art/src and the render colours are proposals for their owners (no art:build in this wave).`,
    '',
    `Summary: ${rows.length} pairs; ${required.length} required, ${required.length - failing.length} pass, ${failing.length} fail with a justification, ${unexplained.length} unexplained.`,
    '',
  ];
  for (const g of groups) {
    const rs = rows.filter((r) => r.group === g);
    const f = rs.filter((r) => !r.informative && !r.pass).length;
    out.push(
      `## ${g}`,
      '',
      `${rs.length} pairs, ${f} required failing.`,
      '',
      '| Pair | Fg | Bg | Ratio | Need | Result | Note |',
      '|---|---|---|---|---|---|---|',
    );
    for (const r of rs) {
      const result = r.informative ? 'info' : r.pass ? 'pass' : r.note ? 'FAIL (justified)' : 'FAIL';
      const fg = r.rings ? r.rings.map(toHex).join(' + ') : toHex(r.fg);
      out.push(
        `| ${r.what} | ${fg} | ${toHex(r.bg)} | ${formatRatio(r.ratio)} | ${r.need}:1 | ${result} | ${r.note ?? ''} |`,
      );
    }
    out.push('');
  }
  return out.join('\n');
}

const write = process.argv.includes('--write');
if (write) writeFileSync(REPORT, report() + '\n');
console.log(
  `contrast audit: ${rows.length} pairs; ${required.length} required, ${required.length - failing.length} pass, ${failing.length} justified failures, ${unexplained.length} unexplained${write ? ` → ${REPORT}` : ''}`,
);
for (const r of unexplained)
  console.log(`  FAIL ${r.id}: ${r.what} ${formatRatio(r.ratio)} (need ${r.need}:1)`);
if (unexplained.length > 0) process.exit(1);
