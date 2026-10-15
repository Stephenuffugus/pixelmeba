/**
 * Wave 14 fix-minors item 5 (P5.4; D-0128; SPEC §14.3): the save import runs the content validator's
 * registry-free region rules on the dish's recorded habitat (src/sim/recipes.ts habitatRecordProblems, which
 * habitatShapeProblems shares), not only HabitatSchema. A forged H07 save with duplicate region ids, an anchor
 * outside the dish, or a community group naming an unknown region is refused through parseSaveFile ("The habitat
 * definition is invalid.") and through the worker's import with the open dish untouched; the unedited save loads.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, parseSaveFile } from '../../src/persistence/saveFile';
import type { HabitatDef } from '../../src/sim/content/schema';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { stateHash } from '../../src/sim/serialize';
import { DishHost } from '../../src/worker/host';
import type { FromWorker } from '../../src/worker/protocol';
import { habitatRegistry, habitatStart } from '../helpers/habitats';

const REG = habitatRegistry();
const meta = { name: 'habitat import', savedAt: '2026-10-15T00:00:00Z', recipeId: null };

type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? Mutable<U>[] : T[K] extends object ? Mutable<T[K]> : T[K] };
type EditableHabitat = Mutable<HabitatDef>;

let savedText: string | null = null;
async function h07Save(): Promise<string> {
  savedText ??= (await buildSaveFile(habitatStart(REG, 'H07_GLASS_GARDEN', { community: true }), meta)).text;
  return savedText;
}

/** The save with its recorded habitat edited as JSON and re-checksummed. */
async function withHabitat(edit: (h: EditableHabitat) => void): Promise<string> {
  const f = JSON.parse(await h07Save()) as { state: { content: { habitat: EditableHabitat } }; checksum: string };
  edit(f.state.content.habitat);
  f.checksum = `sha256:${await sha256Hex(canonicalJson(f.state))}`;
  return JSON.stringify(f);
}

async function expectRefused(text: string): Promise<void> {
  const err = await parseSaveFile(text).then(
    () => null,
    (e: unknown) => e as Error & { kind?: string },
  );
  expect(err, 'expected the habitat refusal').not.toBeNull();
  expect(err!.kind).toBe('content');
  expect(err!.message).toBe('The habitat definition is invalid.');
}

async function reply(out: FromWorker[], requestId: number): Promise<FromWorker> {
  for (let k = 0; k < 400; k++) {
    const m = out.find((x) => 'requestId' in x && x.requestId === requestId);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`no reply to request ${requestId}`);
}

/** Through the worker's import path: an error reply, no new dish, the open dish untouched. */
async function refusedByHost(text: string): Promise<void> {
  const out: FromWorker[] = [];
  const host = new DishHost(REG, (m) => out.push(m), { now: () => 0 });
  host.handle({ type: 'create', requestId: 1, dishId: 'open', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
  const before = stateHash(host.world('open')!);
  const tick = host.world('open')!.tick;
  host.handle({ type: 'importDish', requestId: 2, text, newDishId: 'imported' });
  const r = await reply(out, 2);
  expect(r).toMatchObject({ type: 'error', request: 'importDish' });
  expect(r.type === 'error' ? r.message : '').toContain('The habitat definition is invalid.');
  expect(host.world('imported')).toBeNull();
  expect(host.world('open')!.tick).toBe(tick);
  expect(stateHash(host.world('open')!)).toBe(before);
  expect(host.activeDishId).toBe('open');
}

describe("the import checks the recorded habitat's regions and community regions", () => {
  it('control: the unedited H07 Suggested save loads with its two regions', async () => {
    const { world } = await loadSaveFile(await h07Save());
    expect(world.content.habitat.regions?.map((r) => r.id)).toEqual(['WEST_BAY', 'EAST_BAY']);
    expect(world.content.habitat.suggestedCommunity?.groups.length).toBe(4);
  });

  it('duplicate region ids are refused (groups renamed so nothing else is wrong); the open dish is untouched', async () => {
    const text = await withHabitat((h) => {
      h.regions![1]!.id = 'WEST_BAY';
      for (const g of h.suggestedCommunity!.groups) g.region = 'WEST_BAY';
    });
    await expectRefused(text);
    await refusedByHost(text);
  });

  it('an anchor outside the dish is refused; the open dish is untouched', async () => {
    const text = await withHabitat((h) => {
      h.regions![0]!.anchor = [0, 0];
    });
    await expectRefused(text);
    await refusedByHost(text);
  });

  it('a community group naming an unknown region is refused; the open dish is untouched', async () => {
    const text = await withHabitat((h) => {
      h.suggestedCommunity!.groups[2]!.region = 'NOWHERE';
    });
    await expectRefused(text);
    await refusedByHost(text);
  });
});
