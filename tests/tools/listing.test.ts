/**
 * P4.12 (PLAY_STORE_CHECKLIST §A; UX §10; D09 §11; CLAUDE.md "Honest labels"): the store listing text.
 * - Play's limits: app name ≤ 30, short description ≤ 80, full description ≤ 4000, release notes ≤ 500.
 * - No forbidden claim: "superior", "advanced", "perfect", "real biology", "scientifically accurate" (and the
 *   honest-label words "adapted", "immune").
 * - Nothing from a later update: no Phase 5–7 feature name (BUILD_DIRECTIVE Phases 5–7) and no organism the
 *   shipped manifest does not enable.
 * - The fictional-simulation note and the promise line are present; the counts claimed match the content.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');
const listing = readFileSync(join(ROOT, 'store', 'listing.md'), 'utf8');
const manifest = JSON.parse(readFileSync(join(ROOT, 'content', 'manifest.json'), 'utf8')) as { enabledSpecies: string[]; enabledHabitats: string[]; buildPhase: number };

function block(key: string): string {
  const m = new RegExp(`<!-- listing:${key} -->\\n\`\`\`text\\n([\\s\\S]*?)\\n\`\`\``).exec(listing);
  if (!m) throw new Error(`store/listing.md has no listing:${key} block`);
  return m[1]!;
}

/** Play counts characters (code points). */
const len = (s: string): number => [...s].length;

const FORBIDDEN = ['superior', 'advanced', 'perfect', 'real biology', 'scientifically accurate', 'adapted', 'immune'];
/** Phase 5–7 features (BUILD_DIRECTIVE "Phase 5 — Expanded Ecology", "Phase 6 — Living Lab", "Phase 7 — Advanced Living Worlds"). */
const LATER = [
  'day/night',
  'day and night',
  'climate',
  'warmth',
  'moisture',
  'heater',
  'cooler',
  'membrane',
  'shutter',
  'transport class',
  'dosing',
  'reservoir',
  'light lens',
  'controller',
  'cross-dish',
  'research record',
  'playground',
  'equipment',
  'life stage',
  'body size',
  'body form',
  'developmental',
  'food cache',
  'portrait',
  'timeline',
  'multicellular',
  'partners',
];

describe('store listing', () => {
  const texts = { name: block('name'), short: block('short'), full: block('full'), release: block('release') };
  const notes = /<en-US>\n([\s\S]*?)\n<\/en-US>/.exec(readFileSync(join(ROOT, 'store', 'release-notes-1.0.0.md'), 'utf8'))![1]!;
  const all = [texts.name, texts.short, texts.full, texts.release, notes].join('\n');

  it("fits Play's length limits", () => {
    expect(texts.name).toBe('Pixelmeba');
    expect(len(texts.name)).toBeLessThanOrEqual(30);
    expect(len(texts.short)).toBeLessThanOrEqual(80);
    expect(len(texts.full)).toBeLessThanOrEqual(4000);
    expect(len(texts.release)).toBeLessThanOrEqual(500);
    expect(notes).toBe(texts.release);
  });

  it('carries the promise line and the fictional-simulation note', () => {
    expect(texts.short).toBe('Grow a tiny living world. Change one thing. See what happens.');
    expect(texts.full).toContain('Every organism, rate and chemical is a fictional game rule, not a real laboratory measurement.');
    expect(texts.full).toContain('Android 7.0 or newer');
  });

  it('makes no forbidden claim and names nothing from a later update', () => {
    const lower = listing.toLowerCase();
    for (const w of FORBIDDEN) expect(lower, w).not.toContain(w);
    for (const w of LATER) expect(all.toLowerCase(), w).not.toContain(w);
    // No organism name the shipped manifest does not enable.
    for (const f of readdirSync(join(ROOT, 'content', 'species'))) {
      const sp = JSON.parse(readFileSync(join(ROOT, 'content', 'species', f), 'utf8')) as { id: string; name: string };
      if (!manifest.enabledSpecies.includes(sp.id)) expect(lower, sp.name).not.toMatch(new RegExp(`\\b${sp.name.toLowerCase()}\\b`));
    }
  });

  it('every count it claims matches the shipped content', () => {
    expect(texts.full).toContain(`${manifest.enabledSpecies.length} kinds of fictional microscopic life`);
    expect(manifest.enabledSpecies).toHaveLength(19);
    expect(manifest.enabledHabitats).toHaveLength(3);
    expect(texts.full).toContain('Three habitats');
    // The curated dishes this build offers (CT §9.3: recipes L3xx at or below the build phase).
    const curated = readdirSync(join(ROOT, 'content', 'recipes')).filter((f) => /^L3\d\d_/.test(f)).filter((f) => (JSON.parse(readFileSync(join(ROOT, 'content', 'recipes', f), 'utf8')) as { phase: number }).phase <= manifest.buildPhase);
    expect(curated).toHaveLength(4);
    expect(texts.full).toContain('four curated dishes');
    const experiments = readdirSync(join(ROOT, 'content', 'experiments')).filter((f) => f.endsWith('.json'));
    expect(experiments).toHaveLength(14);
    expect(texts.full).toContain('14 guided experiments');
    expect(texts.release).toContain('14 Notebook experiments');
  });
});
