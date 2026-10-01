/**
 * A predator's prey link may still name a prey removed in this tick (dead of age, lysed, or taken by
 * another predator) until the predator's next decision re-validates it (movement.ts refValid). The game
 * saves that state itself, so the import must load it and the world must continue exactly; the inspector
 * no longer names the removed prey as a target. Wave 2 verifier MAJOR: a g2 defect that refused such
 * saves ("A prey link points at an organism that is not there."), so an autosave could be unloadable.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { base64ToBytes, bytesToBase64, canonicalJson, sha256Hex } from '../../src/sim/hash';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { run, step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { buildInspector } from '../../src/worker/snapshot';
import { clearWater, place } from '../helpers/world';

const meta = { name: 'stale prey', savedAt: '2026-10-01T00:00:00Z', recipeId: null };

/** Save, load, compare hashes; then both copies run 50 ticks and still agree. */
async function roundTrip(w: World): Promise<void> {
  const { text } = await buildSaveFile(w, meta);
  const loaded = (await loadSaveFile(text)).world;
  expect(stateHash(loaded)).toBe(stateHash(w));
  run(w, 50);
  run(loaded, 50);
  expect(stateHash(loaded)).toBe(stateHash(w));
}

/** The inspector's predation line for a predator whose stored prey is gone: no target is named. */
function expectNoTarget(w: World, pred: number): void {
  const p = buildInspector(w, { kind: 'entity', birthId: w.ents.cols.birthId[pred]! });
  if (p.kind !== 'entity' || !p.entity) throw new Error('predator not found');
  expect(p.entity.predation?.targetBirthId).toBe(0);
  expect(p.entity.predation?.code).not.toBe(R.PRED_OUT_OF_CONTACT);
}

describe('stale prey links: the game saves them, the import loads them', () => {
  it('a Hunter whose prey dies of age in the same tick', async () => {
    const w = clearWater();
    const prey = place(w, 'B01', 40.5, 64.5, { age: 599.95 });
    const pred = place(w, 'P01', 42.5, 64.5, { E: 40 });
    w.ents.cols.decisionTimer[pred] = 0;
    step(w);
    const c = w.ents.cols;
    expect(c.alive[prey]).toBe(0);
    expect(c.preySlot[pred]).toBe(prey); // stale until the next decision
    expectNoTarget(w, pred);
    await roundTrip(w);
  });

  it('a Hunter whose prey lyses in the same tick (labelled test state: infected 20 s ago)', async () => {
    const w = clearWater();
    expect(w.fields.v01).toBeDefined(); // the shipped manifest enables the viruses system since wave 2
    const prey = place(w, 'B01', 40.5, 64.5);
    const pred = place(w, 'P01', 42.5, 64.5, { E: 5 });
    const c = w.ents.cols;
    c.infectedBy[prey] = 1;
    c.infectionTimer[prey] = 20;
    c.decisionTimer[pred] = 0;
    step(w);
    expect(w.events.ring.some((e) => e.type === 'death' && e.cause === R.DEATH_LYSIS)).toBe(true);
    expect(c.alive[prey]).toBe(0);
    expect(c.preySlot[pred]).toBe(prey);
    await roundTrip(w);
  });

  it('the loser of a contested capture', async () => {
    const w = clearWater();
    const prey = place(w, 'B01', 64.5, 64.5);
    const a = place(w, 'P01', 65.0, 64.5, { E: 5 });
    const b = place(w, 'P01', 64.0, 64.5, { E: 5 });
    const c = w.ents.cols;
    c.decisionTimer[a] = 0;
    c.decisionTimer[b] = 0;
    let t = 0;
    while (c.alive[prey] === 1 && t++ < 200) step(w);
    expect(c.alive[prey]).toBe(0);
    // One of the two took it; whichever still names it holds a stale link.
    const stale = [a, b].filter((p) => c.alive[p] === 1 && c.preySlot[p] === prey);
    expect(stale.length).toBeGreaterThan(0);
    for (const p of stale) expectNoTarget(w, p);
    await roundTrip(w);
  });

  it('a prey link outside the entity table is still refused', async () => {
    const w = clearWater();
    const pred = place(w, 'P01', 42.5, 64.5);
    const { text } = await buildSaveFile(w, meta);
    const file = JSON.parse(text) as { state: { entities: { columns: Record<string, { b64: string }> } }; checksum: string };
    const col = new Int32Array(base64ToBytes(file.state.entities.columns.preySlot!.b64).slice().buffer);
    col[pred] = 6000;
    file.state.entities.columns.preySlot!.b64 = bytesToBase64(new Uint8Array(col.buffer));
    file.checksum = `sha256:${await sha256Hex(canonicalJson(file.state))}`;
    await expect(loadSaveFile(JSON.stringify(file))).rejects.toThrow('A prey link points outside the dish. Nothing was loaded.');
  });
});
