/**
 * P5.6 part 3: the succession detector (src/worker/succession.ts; SPEC §12.8; D02 §23; D-0051; D-0131) on measured
 * dishes, driven as NotebookWatch drives it (its stage hook in every step, afterTick after every step):
 *
 * - FOOD_RELAY's SHARED_LUNCH_V1 (Crumbsmiths make sugar from starch; Sprinters eat it) run 3 minutes, and an H11
 *   Suggested Community dish with twenty Waterbears added (they catch every Cordweaver within the first minute);
 * - each entry's gains and losses equal the differences of the history samples at the minute's bounds;
 * - every evidence id resolves to a record or a sample the dish has (events of the right type, history samples,
 *   reaction-ledger cells that converted carbon, intake records), recorded independently by this test;
 * - a producer is named only where producersNear credited one in that minute (relationships.ts
 *   creditedConversions), and a sugar line without a credited producer is the fallback form (enzyme, no producer);
 * - a first-seen feeding link never repeats in a later entry; an extinction line names the sample second at which
 *   the count reached 0.
 */
import { describe, expect, it } from 'vitest';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import { tookFromPool } from '../../src/sim/intake';
import { lastCompleteSecond, reactionInCell, REACTION_ENZYMES } from '../../src/sim/reactions';
import { realizeRecipe } from '../../src/sim/recipes';
import { step } from '../../src/sim/tick';
import type { SimEvent } from '../../src/sim/events';
import type { World } from '../../src/sim/world';
import { emptyNotebook, type NotebookRecord } from '../../src/persistence/notebook';
import { feedingKey, parseSuccessionEvidence, successionOf, successionProblem, successionSeenOf, successionSeenProblem, SUCCESSION_POOLS, type SuccessionEntry } from '../../src/persistence/notebookSuccession';
import { creditedConversions } from '../../src/worker/relationships';
import { SuccessionDetector, successionAfterRestore } from '../../src/worker/succession';
import { habitatRegistry, habitatStart } from '../helpers/habitats';

const REG = habitatRegistry();

interface Observed {
  readonly events: Map<number, SimEvent>;
  /** 'second:species:pool' the intake record marked at stage 6. */
  readonly intakes: Set<string>;
  /** 'enzyme:second:cell' with converted carbon. */
  readonly reactions: Set<string>;
  /** enzyme → minute → species credited. */
  readonly credited: Map<string, Set<string>>;
}

/** Run `w` to `ticks` with a detector (as NotebookWatch runs it) and this test's own independent record. */
function watch(w: World, ticks: number, cmds: readonly { at: number; payload: CommandPayload }[] = []): { entries: readonly SuccessionEntry[]; obs: Observed; record: () => NotebookRecord } {
  let record: NotebookRecord = emptyNotebook(w.worldId);
  const ref = { get: () => record, set: (r: NotebookRecord) => (record = r) };
  const det = new SuccessionDetector(w, ref);
  const obs: Observed = { events: new Map(), intakes: new Set(), reactions: new Set(), credited: new Map() };
  let lastEvent = w.counters.nextEventId - 1;
  for (const c of cmds) if (c.at === 0) expect(applyNow(w, `c0-${c.payload.kind}`, c.payload).result?.accepted).toBeGreaterThan(0);
  while (w.tick < ticks) {
    step(w, {
      afterStage: (stage, x) => {
        det.hook(stage, x);
        if (stage !== 6 || x.intakeSeen.bits === null) return;
        const second = Math.floor(x.tick / 10);
        for (let s = 0; s < x.species.length; s++) for (const pool of SUCCESSION_POOLS) if (x.fields[pool] !== undefined && tookFromPool(x, s, pool)) obs.intakes.add(`${second}:${x.species[s]!.id}:${pool}`);
      },
    });
    for (const ev of w.events.ring) if (ev.id > lastEvent) obs.events.set(ev.id, ev);
    lastEvent = w.counters.nextEventId - 1;
    if (w.tick % 10 === 0) {
      const last = lastCompleteSecond(w);
      if (last >= 0) for (const e of REACTION_ENZYMES) for (let cell = 0; cell < 16384; cell++) if (reactionInCell(w, e, cell).c > 0) obs.reactions.add(`${e}:${last}:${cell}`);
      const minute = Math.ceil(w.tick / 600);
      for (const cv of creditedConversions(w)) for (const id of cv.credited) {
        const key = `${cv.enzyme}:${minute}`;
        if (!obs.credited.has(key)) obs.credited.set(key, new Set());
        obs.credited.get(key)!.add(id);
      }
    }
    det.afterTick(w);
    for (const c of cmds) if (c.at === w.tick && c.at > 0) applyNow(w, `c${c.at}`, c.payload);
  }
  return { entries: successionOf(record), obs, record: () => record };
}

const sample = (w: World, second: number) => w.history.seconds.find((s) => s.second === second);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** The checks every measured dish passes. */
function checkEntries(w: World, entries: readonly SuccessionEntry[], obs: Observed): void {
  expect(successionProblem(entries)).toBeNull();
  const seenLinks = new Set<string>();
  for (const e of entries) {
    const lo = Math.max(1, e.fromTick / 10);
    const hi = e.toTick / 10;
    const a = sample(w, lo)!;
    const b = sample(w, hi)!;
    for (const l of e.lines) {
      const sp = w.species.findIndex((s) => s.id === l.species);
      if (l.kind === 'gain' || l.kind === 'loss') {
        const d = round2((b.biomass[sp] ?? 0) - (a.biomass[sp] ?? 0));
        expect(l.kind === 'gain' ? l.value : -l.value!, `${e.id} ${l.kind} ${l.species}`).toBe(d);
        expect(l.evidence.slice(0, 2)).toEqual([`history:${lo}`, `history:${hi}`]);
      }
      for (const id of l.evidence) {
        const p = parseSuccessionEvidence(id)!;
        if (p.kind === 'history') expect(sample(w, Number(p.parts[0])), id).toBeDefined();
        if (p.kind === 'event') {
          const ev = obs.events.get(Number(p.parts[0]));
          expect(ev, id).toBeDefined();
          const want = l.kind === 'recovery' ? 'wake' : l.kind === 'newFeeding' ? 'capture' : 'death';
          expect(ev!.type, id).toBe(want);
          expect(w.species[ev!.species!]!.id, id).toBe(l.species);
        }
        if (p.kind === 'reaction') expect(obs.reactions.has(`${p.parts[0]}:${p.parts[1]}:${p.parts[2]}`), id).toBe(true);
        if (p.kind === 'intake') expect(obs.intakes.has(`${p.parts[0]}:${p.parts[1]}:${p.parts[2]}`), id).toBe(true);
      }
      if (l.kind === 'newFeeding') {
        const key = feedingKey(l);
        expect(seenLinks.has(key), `${key} repeated in ${e.id}`).toBe(false);
        seenLinks.add(key);
        // D-0051: a producer only where producersNear credited it in this minute.
        if (l.producer !== undefined) expect(obs.credited.get(`${l.enzyme!}:${e.minute}`)?.has(l.producer), `${e.id} ${l.producer}`).toBe(true);
        if (l.enzyme !== undefined && l.producer === undefined) expect(obs.credited.get(`${l.enzyme}:${e.minute}`)?.size ?? 0).toBe(0);
      }
      if (l.kind === 'extinction') {
        const second = Number(parseSuccessionEvidence(l.evidence[0])!.parts[0]);
        expect(sample(w, second)!.count[sp]).toBe(0);
        expect(sample(w, second - 1)!.count[sp]).toBeGreaterThan(0);
      }
    }
  }
}

describe('the succession detector on measured dishes', () => {
  it('SHARED_LUNCH_V1, 3 minutes: gains and losses from the samples, the sugar link with its credit, every id resolves', () => {
    const w = realizeRecipe(REG, 'SHARED_LUNCH_V1', { worldId: 'succ-lunch' });
    const { entries, obs } = watch(w, 1800);
    expect(entries.map((e) => e.id)).toEqual(['succ-1', 'succ-2', 'succ-3']);
    expect(entries.every((e) => e.watchedFromTick === undefined)).toBe(true);
    checkEntries(w, entries, obs);
    const feeding = entries.flatMap((e) => e.lines.filter((l) => l.kind === 'newFeeding').map((l) => ({ minute: e.minute, ...l })));
    console.log('SHARED_LUNCH_V1 succession:', JSON.stringify(entries.map((e) => ({ id: e.id, lines: e.lines.map((l) => [l.kind, l.species, l.pool ?? l.prey ?? '', l.enzyme ?? '', l.producer ?? '', l.value ?? '']) }))));
    // Sprinters (B01) eat the sugar the starch enzyme makes: written once, in minute 1, naming the enzyme.
    const sugar = feeding.find((l) => l.species === 'B01' && l.pool === 'sugar');
    expect(sugar).toMatchObject({ minute: 1, enzyme: 'starch' });
    expect(entries[0]!.lines.some((l) => l.kind === 'gain' || l.kind === 'loss')).toBe(true);
  }, 180_000);

  it('an H11 community with twenty Waterbears: catching links, the Cordweavers’ extinction second, no repeats', () => {
    const w = habitatStart(REG, 'H11_GRAZING_MEADOW', { community: true });
    const { entries, obs } = watch(w, 1800, [{ at: 0, payload: { kind: 'inoculate', speciesId: 'P08', x: 64, y: 64, radius: 6, count: 20 } }]);
    expect(entries).toHaveLength(3);
    checkEntries(w, entries, obs);
    const lines = entries.flatMap((e) => e.lines.map((l) => ({ minute: e.minute, ...l })));
    console.log('H11 succession:', JSON.stringify(entries.map((e) => ({ id: e.id, lines: e.lines.map((l) => [l.kind, l.species, l.pool ?? l.prey ?? '', l.value ?? '', l.evidence[0]]) }))));
    expect(lines.find((l) => l.kind === 'newFeeding' && l.species === 'P08' && l.prey === 'F02')).toMatchObject({ minute: 1 });
    expect(lines.find((l) => l.kind === 'extinction' && l.species === 'F02')).toMatchObject({ minute: 1 });
  }, 180_000);
});

/**
 * Fix round 1 (wave 15 verifier): "first seen" held only against the entries still kept, so after SUCCESSION_MAX removed
 * the oldest entry (or the line cap left a link out) a reloaded detector announced those links again. The seen list
 * (notebook kind 'successionSeen') keeps every link with the minute that first saw it.
 */
describe('fix round 1: first seen survives removed entries and a reload', () => {
  it('H04 community: minute 1’s links are not announced again after minute 1 is removed and the detector is rebuilt', () => {
    const w = habitatStart(REG, 'H04_LEAF_POOL', { community: true });
    let record: NotebookRecord = emptyNotebook(w.worldId);
    const ref = { get: () => record, set: (r: NotebookRecord) => (record = r) };
    let det = new SuccessionDetector(w, ref);
    const run = (ticks: number) => {
      while (w.tick < ticks) {
        step(w, { afterStage: (st, x) => det.hook(st, x) });
        det.afterTick(w);
      }
    };
    run(1200);
    const m1 = successionOf(record)[0]!.lines.filter((l) => l.kind === 'newFeeding').map(feedingKey);
    expect(m1.length).toBeGreaterThan(0);
    // Every link a kept line names is in the seen list with its entry's minute; the list is valid.
    for (const e of successionOf(record)) for (const l of e.lines) if (l.kind === 'newFeeding') expect(successionSeenOf(record)).toContainEqual([feedingKey(l), e.minute]);
    expect(successionSeenProblem(successionSeenOf(record))).toBeNull();
    // Minute 1 removed, as SUCCESSION_MAX removes the oldest entry; a new detector, as a load builds one.
    record = { ...record, succession: successionOf(record).slice(1) };
    det = new SuccessionDetector(w, ref);
    run(1800);
    const later = successionOf(record).slice(1).flatMap((e) => e.lines.filter((l) => l.kind === 'newFeeding').map(feedingKey));
    expect(later.filter((k) => m1.includes(k))).toEqual([]);
    expect(new Set(later).size).toBe(later.length);
    // A restore to 0:30 drops every link seen after it (minutes 1 … 3), with their entries.
    const back = successionAfterRestore({ ...w, tick: 300 }, record);
    expect(back.changed).toBe(true);
    expect(successionSeenOf(back.record)).toEqual([]);
    expect(successionOf(back.record)).toEqual([]);
  }, 300_000);
});
