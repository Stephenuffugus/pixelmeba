/**
 * The habitat fence drafts (P5.4 part 2; D-0128 "the habitat enable": three fence dishes added with
 * tools/fence-update.ts --add-file from these drafts, since no shipped recipe uses H04–H11 before wave 15).
 * Each draft is a test-only RecipeDef under tests/fixtures/habitats-p5/fence-drafts/ (NOT in
 * tests/fixtures/fence-recipes/, whose file list trajectory-fence-files.test.ts pins until the lead adds
 * them): FENCE_H10_GATE_CYCLE (the Gate Lab's membranes with the light cycle: edges and climate together),
 * FENCE_H09_DRYING_COMMUNITY and FENCE_H06_DUSK_COMMUNITY, each with its habitat's Suggested Community.
 * Realized under habitatRegistry() exactly as tests/helpers/fence.ts fenceStart realizes a 'recipeFile'
 * entry. Proves: the habitat, its structures and the community are there; the 1× run (one run) and the 4×
 * analogue (four steps per chunk, observed between chunks) with a save -> load near tick 600 give the same
 * trajectoryDigest('full') at tick 1200. No digest literal: the lead records them at the enable.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { CONTENT_DIR, REPO_ROOT } from '../../tools/lib/content-fs';
import { readFenceRecipe } from '../helpers/fence';
import { habitatRegistry } from '../helpers/habitats';
import { trajectoryDigest } from '../helpers/trajectory';
import { aliveOf } from '../helpers/world';

const reg = habitatRegistry();
const DIR = 'tests/fixtures/habitats-p5/fence-drafts';
const TICKS = 1200;
const meta = { name: 'fence-draft', savedAt: '2026-10-15T00:00:00Z', recipeId: null };

const DRAFTS = {
  FENCE_H06_DUSK_COMMUNITY: { habitat: 'H06_DUSK_MARSH', life: 20, lid: 'closed', lightMode: 'cycle', drying: false, edges: 0, devices: 0 },
  FENCE_H09_DRYING_COMMUNITY: { habitat: 'H09_DRYING_LACE', life: 10, lid: 'open', lightMode: 'fixed', drying: true, edges: 0, devices: 198 },
  FENCE_H10_GATE_CYCLE: { habitat: 'H10_GATE_LAB', life: 10, lid: 'open', lightMode: 'cycle', drying: false, edges: 6, devices: 0 },
} as const;
type DraftId = keyof typeof DRAFTS;
const IDS = Object.keys(DRAFTS).sort() as DraftId[];

function start(id: DraftId): World {
  return realizeRecipe(reg, readFenceRecipe(`${DIR}/${id}.json`, reg), { worldId: `fence-${id}` });
}

describe('habitat fence drafts', () => {
  it('the three drafts are on disk, outside fence-recipes/ and content/, each id its file name', () => {
    expect(readdirSync(join(REPO_ROOT, DIR)).sort()).toEqual(IDS.map((id) => `${id}.json`));
    const content = readdirSync(join(CONTENT_DIR, 'recipes')).map((f) => f.replace('.json', ''));
    for (const id of IDS) {
      const def = readFenceRecipe(`${DIR}/${id}.json`, reg);
      expect(def.id).toBe(id);
      expect(def.revision).toBe(1);
      expect(def.seed).toBe(104729);
      expect(def.mutationPreset).toBe('standard');
      expect(def.founderMode).toBe('identical');
      expect(def.founders).toEqual([]);
      expect(def.community).toBe(true);
      expect(def.phase).toBe(5);
      expect(def.habitatId).toBe(DRAFTS[id].habitat);
      expect(content).not.toContain(id);
    }
  });

  it.each(IDS)('%s: the habitat, its structures, its settings and its community are there', (id) => {
    const d = DRAFTS[id];
    const w = start(id);
    expect(w.content.habitat.id).toBe(d.habitat);
    expect(aliveOf(w).length).toBe(d.life);
    expect(w.ledger.entries.some((e) => e.source === `introduce:community:${d.habitat}`)).toBe(true);
    expect(w.edges.length).toBe(d.edges);
    expect(w.devices.length).toBe(d.devices);
    expect([w.settings.lid, w.settings.lightMode, w.settings.drying]).toEqual([d.lid, d.lightMode, d.drying]);
    if (id === 'FENCE_H10_GATE_CYCLE') {
      expect(w.edges.every((e) => e.kind === 'S01')).toBe(true);
      expect(w.ledger.entries.some((e) => e.source === 'community:H10_GATE_LAB:patch0:Starch')).toBe(true);
    }
  });

  it.each(IDS)(`%s: 1x and the 4x analogue with a save -> load near tick 600 agree at tick ${TICKS}`, async (id) => {
    const once = start(id);
    run(once, TICKS);
    const ref = trajectoryDigest(once, 'full');

    let w: World = start(id);
    let saved = false;
    while (w.tick < TICKS) {
      for (let k = 0; k < 4 && w.tick < TICKS; k++) step(w);
      stateHash(w); // observing must not perturb
      if (!saved && w.tick >= TICKS / 2) {
        saved = true;
        const before = stateHash(w);
        const { text } = await buildSaveFile(w, meta);
        w = (await loadSaveFile(text)).world;
        expect(stateHash(w)).toBe(before);
      }
    }
    expect(saved).toBe(true);
    expect(w.tick).toBe(TICKS);
    expect(stateHash(w)).toBe(stateHash(once));
    expect(trajectoryDigest(w, 'full')).toBe(ref);
    console.log(`fence draft ${id} @${TICKS}: trajectoryDigest full ${ref}; life ${aliveOf(once).length}`);
  }, 600_000);
});
