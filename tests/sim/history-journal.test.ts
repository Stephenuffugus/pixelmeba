/**
 * P2.8 / D-0027: journal entries that belong to a dish are kept with its save (SPEC §14.1 lists the
 * journal as save content): stored in the dish's history record by the worker's journalPut, written
 * with every save and export (inside the checksummed state, outside the state hash), read back by
 * journalGet after an import, kept through Undo, and malformed or oversized entries are refused
 * without pausing the dish. Old saves without a journal still load (history-debris.test.ts covers the
 * schema 2 path through loadSaveFile).
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { DISH_JOURNAL_MAX, journalRecordProblem, putJournalEntry, createHistory } from '../../src/sim/history';
import { realizeRecipe } from '../../src/sim/recipes';
import { run } from '../../src/sim/tick';
import { canonicalJson, sha256Hex } from '../../src/sim/hash';
import { stateHash } from '../../src/sim/serialize';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import { DishHost } from '../../src/worker/host';
import type { FromWorker } from '../../src/worker/protocol';
import { FakeClockHost } from '../helpers/host';
import { registry } from '../helpers/world';

const observation = (n: number) => ({
  version: 1,
  kind: 'observation',
  id: `observation:2026-09-28T10:00:${String(n).padStart(2, '0')}Z:${n}`,
  saw: `the Sprinters crowding the top left (${n})`,
  coincidedWith: 'the sugar patch getting smaller',
  recordedAt: `2026-09-28T10:00:${String(n).padStart(2, '0')}Z`,
  dish: { name: 'Garden', second: 42, recipeId: 'FIRST_DISH_V1', seed: 104729 },
  link: null,
  worldId: 'd',
});

const stamp = {
  version: 1,
  kind: 'experimentStamp',
  id: 'EXP_103:2026-09-28T10:01:00Z:1',
  experimentId: 'EXP_103',
  title: 'Cleaning crew',
  journalStamp: 'Watched Recyclers clear debris',
  label: 'this run',
  labels: [],
  recordedAt: '2026-09-28T10:01:00Z',
  reachedAtSecond: 90,
  seed: 103,
  recipeId: 'CLEANING_CREW_V1',
  recipeRevision: 1,
  contentVersion: 1,
  contentHash: 'x',
  dishName: 'Cleaning crew',
  gate: [{ text: 'Debris eaten', value: '1.2 C' }],
  measures: [],
  prediction: '',
  worldId: 'd',
};

function put(h: FakeClockHost, entry: unknown, requestId: number): boolean {
  h.host.handle({ type: 'journalPut', requestId, dishId: 'd', entry });
  const m = h.out.find((x) => x.type === 'journal' && x.requestId === requestId);
  if (!m || m.type !== 'journal') throw new Error('no journal reply');
  return m.stored === true;
}

async function exportText(h: FakeClockHost, requestId: number): Promise<string> {
  await h.host.handleAsync({ type: 'exportDish', requestId, dishId: 'd', strip: false });
  const m = h.out.find((x) => x.type === 'exported' && x.requestId === requestId);
  if (!m || m.type !== 'exported') throw new Error(`no export: ${JSON.stringify(h.errors())}`);
  return m.text;
}

describe("the dish's journal in its save (P2.8)", () => {
  it('save → export → import keeps the entries; the state hash ignores them; the checksum covers them', async () => {
    const h = new FakeClockHost();
    h.create('d', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    h.setSpeed(1);
    h.advanceTo(50);
    const hashBefore = h.hash();
    expect(put(h, observation(1), 1)).toBe(true);
    expect(put(h, stamp, 2)).toBe(true);
    // Replacing by id (a conclusion picked later) keeps one copy.
    expect(put(h, { ...stamp, conclusion: 'supports' }, 3)).toBe(true);
    expect(h.hash()).toBe(hashBefore);
    expect(h.world.history.journal.map((e) => e.id)).toEqual([stamp.id, observation(1).id]);
    expect(h.world.history.journal[0]).toMatchObject({ conclusion: 'supports' });

    const text = await exportText(h, 4);
    const file = JSON.parse(text) as { state: { history: { journal: unknown[] } }; checksum: string };
    expect(file.state.history.journal).toHaveLength(2);
    expect(file.checksum).toBe(`sha256:${await sha256Hex(canonicalJson(file.state))}`);

    // Import into a new dish: the same entries come back through journalGet.
    await h.host.handleAsync({ type: 'importDish', requestId: 5, text, newDishId: 'imported' });
    expect(h.out.find((x) => x.type === 'loaded' && x.requestId === 5)).toBeDefined();
    h.host.handle({ type: 'journalGet', requestId: 6, dishId: 'imported' });
    const got = h.out.find((x) => x.type === 'journal' && x.requestId === 6);
    if (!got || got.type !== 'journal') throw new Error('no journalGet reply');
    expect(got.entries).toEqual(h.world.history.journal);
    expect(stateHash(h.host.world('imported')!)).toBe(hashBefore);

    // Editing an entry's words in the file without a new checksum is refused (the journal is checksummed with the file).
    const tampered = JSON.parse(text) as { state: { history: { journal: { saw?: string }[] } } };
    tampered.state.history.journal[1]!.saw = 'something else';
    await expect(loadSaveFile(JSON.stringify(tampered))).rejects.toMatchObject({ kind: 'checksum' });
  });

  it('save to a slot → open the slot → export → import: every step keeps the dish entries (the save path players use)', async () => {
    const out: FromWorker[] = [];
    let now = 0;
    const store = new SaveStore(new MemoryBackend());
    const host = new DishHost(registry(), (m) => out.push(m), { now: () => now, iso: () => '2026-09-28T12:00:00.000Z' }, store, true);
    const reply = async <T extends FromWorker['type']>(msg: Parameters<DishHost['handleAsync']>[0], type: T): Promise<Extract<FromWorker, { type: T }>> => {
      await host.handleAsync(msg);
      const m = out.find((x) => x.type === type && (x as { requestId?: number }).requestId === (msg as { requestId: number }).requestId);
      if (!m) throw new Error(`no ${type} reply: ${JSON.stringify(out.filter((x) => x.type === 'error'))}`);
      return m as Extract<FromWorker, { type: T }>;
    };
    const entries = (dishId: string, requestId: number) => {
      host.handle({ type: 'journalGet', requestId, dishId });
      const m = out.find((x) => x.type === 'journal' && x.requestId === requestId);
      if (!m || m.type !== 'journal') throw new Error('no journalGet reply');
      return m.entries;
    };
    host.handle({ type: 'create', requestId: 1, dishId: 'd', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    host.handle({ type: 'setSpeed', dishId: 'd', speed: 4 });
    while (host.world('d')!.tick < 120) {
      now += 100;
      host.pump();
    }
    host.handle({ type: 'setSpeed', dishId: 'd', speed: 0 });
    host.handle({ type: 'journalPut', requestId: 2, dishId: 'd', entry: observation(7) });
    host.handle({ type: 'journalPut', requestId: 3, dishId: 'd', entry: stamp });
    const kept = entries('d', 4);
    expect(kept.map((e) => e.id)).toEqual([stamp.id, observation(7).id]);
    const hash = stateHash(host.world('d')!);

    await reply({ type: 'saveSlot', requestId: 5, dishId: 'd', slotId: 'slot3', name: 'Garden notes' }, 'slotSaved');
    const opened = await reply({ type: 'loadSlot', requestId: 6, slotId: 'slot3', newDishId: 'reopened' }, 'loaded');
    expect(opened.info.tick).toBe(120);
    expect(entries('reopened', 7)).toEqual(kept);
    expect(stateHash(host.world('reopened')!)).toBe(hash);

    const exported = await reply({ type: 'exportDish', requestId: 8, dishId: 'reopened', strip: false }, 'exported');
    await reply({ type: 'importDish', requestId: 9, text: exported.text, newDishId: 'imported' }, 'loaded');
    expect(entries('imported', 10)).toEqual(kept);
    expect(stateHash(host.world('imported')!)).toBe(hash);
  });

  it('Undo keeps the journal entries written after the undone change (they are notes, not part of it)', () => {
    const h = new FakeClockHost();
    h.create('d', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    const fed = h.command('feed-1', {
      kind: 'deposit',
      materialId: 'SUGAR',
      dose: 0.1,
      points: [[64, 64]],
      radius: 1,
    });
    expect(fed?.accepted).toBeGreaterThan(0);
    expect(put(h, observation(2), 10)).toBe(true);
    h.host.handle({ type: 'undo', requestId: 11, dishId: 'd' });
    const ack = h.out.find((x) => x.type === 'ack' && x.requestId === 11);
    expect(ack && ack.type === 'ack' ? ack.error : 'none').toBeUndefined();
    expect(h.world.history.journal.map((e) => e.id)).toEqual([observation(2).id]);
  });

  it('refuses malformed and oversized entries without pausing the dish, and keeps at most 200', () => {
    const h = new FakeClockHost();
    h.create('d', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    h.setSpeed(1);
    expect(put(h, { kind: 'observation', id: 'x' }, 20)).toBe(false); // no recordedAt
    expect(put(h, { ...observation(3), kind: 'script' }, 21)).toBe(false);
    expect(put(h, { ...observation(4), saw: 'x'.repeat(20_000) }, 22)).toBe(false);
    expect(put(h, 'not an entry', 23)).toBe(false);
    expect(h.errors()).toEqual([]);
    h.pump(200);
    expect(h.tick).toBeGreaterThan(0); // still running
    const hist = createHistory(1);
    for (let k = 0; k < DISH_JOURNAL_MAX + 5; k++)
      expect(putJournalEntry(hist, { ...observation(k % 60), id: `o${k}` })).toBe(true);
    expect(hist.journal).toHaveLength(DISH_JOURNAL_MAX);
    expect(hist.journal[0]!.id).toBe(`o${DISH_JOURNAL_MAX + 4}`);
  });

  it('an imported file whose journal holds a malformed stamp is refused with a clear message and changes nothing (fix round 1)', async () => {
    // The verifier's file: a normal save whose journal holds a minimal stamp and a recomputed checksum
    // (a plain SHA-256 anyone can redo). It used to be accepted, merged into the device Notebook, and
    // then break Notebook → Journal ("Cannot read properties of undefined (reading 'some')").
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'poison', seed: 104729 });
    run(w, 20);
    const { text } = await buildSaveFile(w, { name: 'Shared dish', savedAt: '2026-09-28T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
    const poisoned = async (entry: unknown): Promise<string> => {
      const f = JSON.parse(text) as { state: { history: { journal: unknown[] } }; checksum: string };
      f.state.history.journal = [entry];
      f.checksum = `sha256:${await sha256Hex(canonicalJson(f.state))}`;
      return JSON.stringify(f);
    };
    const minimal = { version: 1, id: 'evil-1', kind: 'experimentStamp', experimentId: 'EXP_A', recordedAt: '2026-09-28T00:00:00Z' };
    const bad = await poisoned(minimal);
    await expect(loadSaveFile(bad)).rejects.toMatchObject({ kind: 'integrity' });
    await expect(loadSaveFile(bad)).rejects.toThrow(/journal has an entry this version of Pixelmeba cannot read \(entry 1: its title is not text\)\. Nothing was loaded\./);
    // Every field the Notebook reads is checked, one at a time (a stamp missing its measures, a note with a numeric part, a time that is not ISO …).
    const cases: [string, unknown][] = [
      ['measures', { ...stamp, measures: undefined }],
      ['measures', { ...stamp, measures: [{ id: 'x' }] }],
      ['gate', { ...stamp, gate: [{ text: 1 }] }],
      ['labels', { ...stamp, labels: 'x' }],
      ['reachedAtSecond', { ...stamp, reachedAtSecond: '90' }],
      ['recorded time', { ...observation(1), recordedAt: 'zzzz-later' }],
      ['"I saw" part', { ...observation(1), saw: 42 }],
      ['dish', { ...observation(1), dish: { name: 'x' } }],
      ['link', { ...observation(1), link: { kind: 'url', href: 'https://example.com' } }],
      ['version', { ...observation(1), version: 2 }],
    ];
    for (const [what, entry] of cases) {
      expect(journalRecordProblem(entry), what).toContain(what);
      await expect(loadSaveFile(await poisoned(entry)), what).rejects.toMatchObject({ kind: 'integrity' });
    }
    // Through the worker: the import is refused, no dish is added, the open dish is untouched.
    const h = new FakeClockHost();
    h.create('d', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    const before = h.hash();
    await h.host.handleAsync({ type: 'importDish', requestId: 90, text: bad, newDishId: 'imported' });
    const err = h.out.find((x) => x.type === 'error' && (x as { requestId?: number }).requestId === 90);
    expect(err && err.type === 'error' ? err.message : '').toMatch(/journal/);
    expect(h.host.world('imported') ?? null).toBeNull();
    expect(h.hash()).toBe(before);
    // The worker's journalPut refuses the same entry (a dish never keeps what the Notebook cannot show).
    expect(put(h, minimal, 91)).toBe(false);
    // Well-formed entries still load: the same file with the full stamp and a note.
    const good = JSON.parse(text) as { state: { history: { journal: unknown[] } }; checksum: string };
    good.state.history.journal = [stamp, observation(1)];
    good.checksum = `sha256:${await sha256Hex(canonicalJson(good.state))}`;
    const { world } = await loadSaveFile(JSON.stringify(good));
    expect(world.history.journal.map((e) => e.id)).toEqual([stamp.id, observation(1).id]);
  });

  it('"Export without names or notes" carries none of the journal (notes, dish names, times) and recomputes the checksum (fix round 1)', async () => {
    const h = new FakeClockHost();
    h.create('d', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' });
    h.setSpeed(1);
    h.advanceTo(20);
    const note = {
      ...observation(5),
      saw: 'MY PRIVATE NOTE about Grandma',
      dish: { name: 'Grandma Garden', second: 2, recipeId: 'FIRST_DISH_V1', seed: 104729 },
    };
    expect(put(h, note, 1)).toBe(true);
    expect(put(h, { ...stamp, dishName: 'Grandma Garden', prediction: 'my secret guess' }, 2)).toBe(true);
    const hash = h.hash();
    await h.host.handleAsync({ type: 'exportDish', requestId: 3, dishId: 'd', strip: true });
    const m = h.out.find((x) => x.type === 'exported' && x.requestId === 3);
    if (!m || m.type !== 'exported') throw new Error('no export');
    for (const secret of ['MY PRIVATE NOTE', 'Grandma Garden', 'my secret guess', note.recordedAt, stamp.recordedAt])
      expect(m.text.includes(secret), secret).toBe(false);
    const f = JSON.parse(m.text) as { meta: { name: string }; state: { history: { journal: unknown[] } }; checksum: string };
    expect(f.meta.name).toBe('Shared dish');
    expect(f.state.history.journal).toEqual([]);
    expect(f.checksum).toBe(`sha256:${await sha256Hex(canonicalJson(f.state))}`);
    const { world } = await loadSaveFile(m.text);
    expect(stateHash(world)).toBe(hash);
    // The ordinary export still carries the dish's journal (D-0027), and the open dish keeps it.
    const full = await exportText(h, 4);
    expect(full.includes('MY PRIVATE NOTE')).toBe(true);
    expect(h.world.history.journal).toHaveLength(2);
  });
});

