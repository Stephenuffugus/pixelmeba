/**
 * P3.7 E12 Colony adhesion (SPEC §3.2 rows 5, 7, 8, §6.8, §9 E12, §9.19; CT §7.1, §12.6; R17; D04 §6
 * "E12 Colony adhesion", §13; BUILD_DIRECTIVE P3.7; src/sim/adhesion.ts).
 *
 *  - Pairing: two free, Active B01 carriers within 0.5 cells link on exactly the 50th continuous tick
 *    (not the 49th); one tick out of reach restarts the clock (the separation reset); a lower-birthId
 *    newcomer in reach restarts it too (candidate change); E ≥ 20 is required (19.99 never counts).
 *  - Cost: each partner pays exactly 2 E once, in stage 5, ledgered as energy 'other'; refused pairs pay
 *    nothing.
 *  - Caps: a third link is refused with a 'linkRefused' event; a 9th colony member is refused with an
 *    event, no cost and unchanged genomes, while a 7-member colony takes its 8th.
 *  - The pairs depend only on birthIds: the same organisms in permuted slots form the same links.
 *  - Linked members do not move; upkeep is exactly 0.001 E per link per tick (0.01 E/s).
 *  - Each severance cause (no usable intake for 10 s, E < 15, rest, module loss, forced separation
 *    > 0.75 cells) is followed by a 100-tick relink lockout; death, capture and division remove incident
 *    links and the survivors stay valid with the same lockout (D04 §13).
 *  - A 2,000-tick dish with E12 carriers dividing, dying and being eaten keeps linksValid, and its
 *    .pixelmeba file round-trips every 100 ticks with an identical hash; a save mid-pairing continues
 *    identically; one run equals four quarter runs with a reload between quarters.
 *  - Sampling half a colony is refused naming the missing member; the whole colony moves with its links.
 *  - The energy ledger balances with the link cost included; the worlds without E12 never run any of it.
 *
 * Worlds: clear water (FIRST_DISH_V1 without stones, background sugar 0) under the shipped manifest
 * plus E12 (registryWith; the lead enables it after the wave). "Held" positions are a labelled test
 * device: after stage 4 (movement) the test puts the named organisms back at fixed points and rebuilds
 * the spatial index, so the pairing rule sees exactly the distances the test intends. Other test-only
 * state (energy, biomass, age, life state) is set directly and labelled; material overrides are logged
 * as ledger inputs.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { adhesionRules } from '../../src/sim/adhesion';
import { applyNow, introduceOrganism, type CommandPayload, type CommandResult } from '../../src/sim/commands';
import { IMPLEMENTED_MODULES } from '../../src/sim/content/implemented';
import { MODULE_REQUIRED_PARAMS } from '../../src/sim/content/moduleRules';
import { consumePrey } from '../../src/sim/contacts';
import { ENTITY_COLUMNS, LIFE_ACTIVE, LIFE_RESTING } from '../../src/sim/entities';
import type { SimEvent } from '../../src/sim/events';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { adhesionComponent, adhesionDegree, adhesionNeighbors, linksValid } from '../../src/sim/links';
import { killEntity } from '../../src/sim/maintenance';
import { moduleSummaries, upkeepNow } from '../../src/sim/moduleView';
import { moduleText, upkeepText } from '../../src/ui/strings/modules';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { rebuildIndex } from '../../src/sim/spatial';
import { step } from '../../src/sim/tick';
import { speciesIndex, type World } from '../../src/sim/world';
import { registryWith } from '../helpers/registry';
import { linkAdhesion, registry, setField } from '../helpers/world';

const SHIPPED_MODULES = registry().manifest.enabledModules;
const REG = registryWith({ enabledModules: [...SHIPPED_MODULES, 'E12'].sort() });

type State = Partial<Record<'B' | 'N' | 'E' | 'H' | 'age', number>>;
type Pos = readonly [number, number];
type Energy = World['ledger']['energy'];

function dish(): World {
  const base = REG.recipes.FIRST_DISH_V1!;
  return realizeRecipe(
    REG,
    { ...base, id: 'TEST_E12', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' },
    { worldId: 'e12' },
  );
}

/** Place one organism carrying `modules` at an exact position (material overrides logged as inputs). */
function placeWith(w: World, speciesId: string, [x, y]: Pos, modules: readonly string[] = ['E12'], state: State = {}): number {
  const slot = introduceOrganism(w, speciesIndex(w, speciesId), cellIndex(Math.floor(x), Math.floor(y)), 'test', { modules, exactCenter: true });
  if (slot < 0) throw new Error('capacity');
  const c = w.ents.cols;
  c.x[slot] = x;
  c.y[slot] = y;
  for (const key of ['B', 'N', 'E', 'H', 'age'] as const) {
    const v = state[key];
    if (v === undefined) continue;
    if (key === 'B') w.ledger.inputs.c += v - c.B[slot]!;
    if (key === 'N') w.ledger.inputs.n += v - c.N[slot]!;
    c[key][slot] = v;
  }
  rebuildIndex(w);
  return slot;
}

/**
 * Keep sugar in the cells under these points (logged inputs): enough for usable intake every tick, too
 * little to grow to division size within these tests (0.02 per cell per tick).
 */
function feed(w: World, points: readonly Pos[], amount = 0.02): void {
  for (const [x, y] of points) setField(w, 'sugar', cellIndex(Math.floor(x), Math.floor(y)), amount);
}

/** Held slots: [slot, x, y]. */
type Held = ReadonlyArray<readonly [number, number, number]>;

/**
 * One tick with the named organisms held at fixed points (test device, see the file comment), and an
 * optional labelled state change right after stage 4 (before contacts) or after stage 7 (before the
 * stage 8 release hook).
 */
function stepHeld(w: World, held: Held, opts: { at4?: () => void; at7?: () => void; at5?: () => void } = {}): void {
  step(w, {
    afterStage: (stage) => {
      if (stage === 4) {
        const c = w.ents.cols;
        for (const [s, x, y] of held) {
          if (c.alive[s] !== 1) continue;
          c.x[s] = x;
          c.y[s] = y;
        }
        rebuildIndex(w);
        opts.at4?.();
      } else if (stage === 5) opts.at5?.();
      else if (stage === 7) opts.at7?.();
    },
  });
}

function eventsOf(w: World, type: SimEvent['type'], fromTick = 0): SimEvent[] {
  return w.events.ring.filter((e) => e.type === type && e.tick >= fromTick && e.detail?.kind === 'adhesion');
}

function linked(w: World, a: number, b: number): boolean {
  return adhesionNeighbors(w, a).includes(b);
}

const A: Pos = [64.3, 64.5];
const B: Pos = [64.7, 64.5];
const FAR: Pos = [65.3, 64.5]; // 1.0 from A
const PULLED: Pos = [65.1, 64.5]; // 0.8 from A (> 0.75)

/** Two fed B01 E12 carriers 0.4 apart, held. */
function pair(stateA: State = {}, stateB: State = {}, modsA: readonly string[] = ['E12'], modsB: readonly string[] = ['E12']): { w: World; a: number; b: number; held: [number, number, number][] } {
  const w = dish();
  const a = placeWith(w, 'B01', A, modsA, stateA);
  const b = placeWith(w, 'B01', B, modsB, stateB);
  return { w, a, b, held: [[a, ...A], [b, ...B]] };
}

/** Step (fed, held) until a and b link; returns the tick count it took. */
function ticksToLink(w: World, a: number, b: number, held: Held, max = 400): number {
  for (let k = 1; k <= max; k++) {
    feed(w, [A, B]);
    stepHeld(w, held);
    if (linked(w, a, b)) return k;
  }
  throw new Error('never linked');
}

/**
 * After a severance on the last tick: for 100 ticks neither end may time or link (lockout), then the
 * 50-tick clock runs again and they relink on its 50th tick. Fed and held throughout.
 */
function expectLockoutThenRelink(w: World, a: number, b: number, held: Held): void {
  const c = w.ents.cols;
  expect(linked(w, a, b)).toBe(false);
  expect(linksValid(w)).toBe(true);
  expect(c.adhLockout[a]).toBeCloseTo(10, 9);
  expect(c.adhLockout[b]).toBeCloseTo(10, 9);
  for (let k = 1; k <= 100; k++) {
    feed(w, [A, B]);
    stepHeld(w, held);
    expect(linked(w, a, b)).toBe(false);
    expect(c.adhSeconds[a]).toBe(0);
    expect(c.adhSeconds[b]).toBe(0);
  }
  expect(c.adhLockout[a]).toBe(0);
  expect(c.adhLockout[b]).toBe(0);
  expect(ticksToLink(w, a, b, held)).toBe(50);
}

describe('P3.7 E12 colony adhesion: registration and gating', () => {
  it('registers E12 with its recorded numbers; a world whose manifest lacks E12 never runs it', () => {
    expect(IMPLEMENTED_MODULES).toContain('E12');
    expect(MODULE_REQUIRED_PARAMS.E12).toHaveLength(11);
    const w = dish();
    expect(adhesionRules(w)).toEqual({
      linkDistance: 0.5,
      linkSeconds: 5,
      minEnergy: 20,
      linkCost: 2,
      maxLinks: 2,
      maxComponent: 8,
      perLinkUpkeep: 0.01,
      severNoIntakeSeconds: 10,
      severEnergy: 15,
      severDistance: 0.75,
      lockoutSeconds: 10,
    });
    // The shipped manifest (no E12 yet): no rules, and two plain B01 side by side never touch the columns.
    const base = registry().recipes.FIRST_DISH_V1!;
    const plain = realizeRecipe(registry(), { ...base, id: 'TEST_PLAIN', removeStones: true, fieldPatches: [], founders: [], scheduledCommands: [], backgroundOverrides: { sugar: 0 }, mutationPreset: 'fixed' }, { worldId: 'plain' });
    expect(adhesionRules(plain)).toBeNull();
    const p = placeWith(plain, 'B01', A, []);
    const q = placeWith(plain, 'B01', B, []);
    for (let k = 0; k < 60; k++) stepHeld(plain, [[p, ...A], [q, ...B]]);
    for (const s of [p, q]) {
      expect(plain.ents.cols.adhPartner[s]).toBe(0);
      expect(plain.ents.cols.adhSeconds[s]).toBe(0);
      expect(plain.ents.cols.noUsableIntakeSeconds[s]).toBe(0);
    }
  });
});

describe('P3.7 E12 pairing and linking', () => {
  it('links on exactly the 50th tick within 0.5 cells, not the 49th', () => {
    const { w, a, b, held } = pair();
    const c = w.ents.cols;
    for (let k = 1; k <= 49; k++) {
      feed(w, [A, B]);
      stepHeld(w, held);
      expect(linked(w, a, b)).toBe(false);
    }
    expect(c.adhSeconds[a]).toBeCloseTo(4.9, 9);
    expect(c.adhPartner[a]).toBe(c.birthId[b]);
    expect(c.adhPartner[b]).toBe(c.birthId[a]);
    feed(w, [A, B]);
    stepHeld(w, held);
    expect(linked(w, a, b)).toBe(true);
    expect(linked(w, b, a)).toBe(true);
    expect(linksValid(w)).toBe(true);
    expect(eventsOf(w, 'linkFormed').map((e) => [e.birthId, e.detail!.partner])).toEqual([[c.birthId[a], c.birthId[b]]]);
    expect(c.adhSeconds[a]).toBe(0); // the clocks restart after linking
  });

  it('one tick out of reach restarts the clock (separation reset): the link needs 50 more ticks', () => {
    const { w, a, b, held } = pair();
    const c = w.ents.cols;
    for (let k = 1; k <= 30; k++) {
      feed(w, [A, B]);
      stepHeld(w, held);
    }
    expect(c.adhSeconds[a]).toBeCloseTo(3, 9);
    feed(w, [A, B]);
    stepHeld(w, [[a, ...A], [b, ...FAR]]); // 1.0 cells apart for one tick
    expect(c.adhSeconds[a]).toBe(0);
    expect(c.adhPartner[a]).toBe(0);
    for (let k = 1; k <= 49; k++) {
      feed(w, [A, B]);
      stepHeld(w, held);
      expect(linked(w, a, b)).toBe(false);
    }
    feed(w, [A, B]);
    stepHeld(w, held);
    expect(linked(w, a, b)).toBe(true);
  });

  it('a lower-birthId neighbour arriving in reach restarts the clock (candidate change)', () => {
    const w = dish();
    const first = placeWith(w, 'B01', [70.5, 70.5]); // lowest birthId, parked far away
    const a = placeWith(w, 'B01', A);
    const b = placeWith(w, 'B01', B);
    const c = w.ents.cols;
    const near: Pos = [64.5, 64.8]; // within 0.5 of both a and b
    for (let k = 1; k <= 30; k++) {
      feed(w, [A, B, [70.5, 70.5]]);
      stepHeld(w, [[first, 70.5, 70.5], [a, ...A], [b, ...B]]);
    }
    expect(c.adhPartner[b]).toBe(c.birthId[a]);
    feed(w, [A, B, near]);
    stepHeld(w, [[first, ...near], [a, ...A], [b, ...B]]);
    expect(c.adhPartner[b]).toBe(c.birthId[first]);
    expect(c.adhSeconds[b]).toBeCloseTo(0.1, 12);
  });

  it('requires E ≥ 20 at both ends: 19.99 never starts the clock, exactly 20 links on the 50th tick', () => {
    const { w, a, b, held } = pair();
    const c = w.ents.cols;
    for (let k = 1; k <= 80; k++) {
      feed(w, [A, B]);
      stepHeld(w, held, { at4: () => void (c.E[b] = 19.99) }); // test-only energy, set just before contacts
      expect(c.adhSeconds[a]).toBe(0);
      expect(c.adhSeconds[b]).toBe(0);
      expect(linked(w, a, b)).toBe(false);
    }
    for (let k = 1; k <= 50; k++) {
      feed(w, [A, B]);
      stepHeld(w, held, { at4: () => void (c.E[b] = 20) });
      expect(linked(w, a, b)).toBe(k === 50);
    }
  });

  it('each partner pays exactly 2 E once, in stage 5, ledgered as energy "other"', () => {
    const { w, a, b, held } = pair();
    const c = w.ents.cols;
    let paid = 0;
    for (let k = 1; k <= 90; k++) {
      let ea = 0;
      let eb = 0;
      let other = 0;
      feed(w, [A, B]);
      stepHeld(w, held, {
        at4: () => {
          ea = c.E[a]!;
          eb = c.E[b]!;
          other = w.ledger.energy.other;
        },
        at5: () => {
          const da = ea - c.E[a]!;
          const db = eb - c.E[b]!;
          const dOther = w.ledger.energy.other - other;
          if (k === 50) {
            expect(da).toBeCloseTo(2, 12);
            expect(db).toBeCloseTo(2, 12);
            expect(dOther).toBeCloseTo(4, 12);
          } else {
            expect(da).toBe(0);
            expect(db).toBe(0);
            expect(dOther).toBe(0);
          }
          paid += dOther;
        },
      });
    }
    expect(paid).toBeCloseTo(4, 12);
    expect(linked(w, a, b)).toBe(true);
  });
});

describe('P3.7 E12 caps', () => {
  it('degree cap: a third link is refused with an event at no cost; nobody holds more than 2 links', () => {
    const w = dish();
    const pts: Pos[] = [
      [64.3, 64.3],
      [64.5, 64.3],
      [64.3, 64.5],
      [64.5, 64.5],
    ];
    const s = pts.map((p) => placeWith(w, 'B01', p));
    const held: Held = s.map((slot, k) => [slot, ...pts[k]!] as const);
    const c = w.ents.cols;
    const genomesBefore = s.map((slot) => c.genome[slot]);
    for (let k = 1; k <= 110; k++) {
      feed(w, pts);
      stepHeld(w, held);
      for (const slot of s) expect(adhesionDegree(w, slot)).toBeLessThanOrEqual(2);
      expect(linksValid(w)).toBe(true);
    }
    // Tick 50: the lowest birthId (s0) is everyone's choice; (s0,s1) and (s0,s2) link, (s0,s3) is refused.
    const refused = eventsOf(w, 'linkRefused');
    expect(refused.length).toBeGreaterThanOrEqual(1);
    expect(refused[0]!.tick).toBe(49); // world.tick during the 50th step
    expect(refused[0]!.detail).toEqual({ kind: 'adhesion', partner: c.birthId[s[3]!], reason: 'links' });
    expect(adhesionDegree(w, s[0]!)).toBe(2);
    // Tick 100: s1 and s2 (one link each) close the ring; s3 is left without a partner.
    expect(linked(w, s[1]!, s[2]!)).toBe(true);
    expect(adhesionDegree(w, s[3]!)).toBe(0);
    const formed = eventsOf(w, 'linkFormed');
    expect(formed).toHaveLength(3);
    expect(w.ledger.energy.other).toBeCloseTo(3 * 4, 12); // refusals cost nothing
    expect(s.map((slot) => c.genome[slot])).toEqual(genomesBefore);
  });

  /** A held chain of `n` linked B01 carriers 0.4 apart along y = 60.5, plus one newcomer 0.4 west of its end. */
  function chainAndNewcomer(n: number): { w: World; chain: number[]; extra: number; held: Held; pts: Pos[] } {
    const w = dish();
    const pts: Pos[] = [];
    for (let k = 0; k < n; k++) pts.push([60.1 + 0.4 * k, 60.5]);
    const chain = pts.map((p) => placeWith(w, 'B01', p));
    for (let k = 0; k + 1 < n; k++) linkAdhesion(w, chain[k]!, chain[k + 1]!);
    const extraPos: Pos = [59.7, 60.5];
    const extra = placeWith(w, 'B01', extraPos);
    pts.push(extraPos);
    const held: Held = [...chain, extra].map((slot, k) => [slot, ...pts[k]!] as const);
    return { w, chain, extra, held, pts };
  }

  it('component cap: the 9th member is refused with an event, no cost, genomes unchanged; a 7-chain takes its 8th', () => {
    const { w, chain, extra, held, pts } = chainAndNewcomer(8);
    const c = w.ents.cols;
    expect(adhesionComponent(w, chain[0]!)).toHaveLength(8);
    const genomes = [...chain, extra].map((s) => c.genome[s]);
    let other = 0;
    for (let k = 1; k <= 50; k++) {
      feed(w, pts);
      stepHeld(w, held, { at4: () => void (other = w.ledger.energy.other), at5: () => expect(w.ledger.energy.other).toBe(other) });
    }
    expect(adhesionDegree(w, extra)).toBe(0);
    expect(adhesionComponent(w, chain[0]!)).toHaveLength(8);
    const refused = eventsOf(w, 'linkRefused');
    expect(refused.map((e) => [e.birthId, e.detail!.partner, e.detail!.reason])).toEqual([[c.birthId[chain[0]!], c.birthId[extra], 'component']]);
    expect(w.ledger.energy.other).toBe(0);
    expect([...chain, extra].map((s) => c.genome[s])).toEqual(genomes);
    // Control: with 7 members the newcomer becomes the 8th on the same tick.
    const ok = chainAndNewcomer(7);
    for (let k = 1; k <= 50; k++) {
      feed(ok.w, ok.pts);
      stepHeld(ok.w, ok.held);
    }
    expect(adhesionComponent(ok.w, ok.extra)).toHaveLength(8);
    expect(eventsOf(ok.w, 'linkRefused')).toHaveLength(0);
  });

  it('the links depend only on birthIds: the same organisms in permuted slots form the same links', () => {
    const pts: Pos[] = [
      [60.2, 60.2],
      [60.6, 60.3],
      [60.4, 60.6],
      [60.9, 60.7],
      [60.7, 61.0],
      [61.1, 61.1],
    ];
    const run = (perm: readonly number[] | null) => {
      const w = dish();
      const slots = pts.map((p) => placeWith(w, 'B01', p));
      const birthAt = new Map(slots.map((s, k) => [w.ents.cols.birthId[s]!, pts[k]!] as const));
      if (perm) {
        // Test device: relabel slots by swapping every column (no links or references exist yet).
        const c = w.ents.cols as unknown as Record<string, { [k: number]: number }>;
        const tmp = slots.map((s) => ENTITY_COLUMNS.map(([name]) => c[name]![s]!));
        slots.forEach((s, k) => ENTITY_COLUMNS.forEach(([name], j) => (c[name]![s] = tmp[perm[k]!]![j]!)));
        rebuildIndex(w);
      }
      const cc = w.ents.cols;
      const heldNow = (): Held => slots.map((s) => [s, ...birthAt.get(cc.birthId[s]!)!] as const);
      for (let k = 1; k <= 110; k++) {
        feed(w, pts);
        stepHeld(w, heldNow());
      }
      expect(linksValid(w)).toBe(true);
      const links: [number, number][] = [];
      for (const s of slots) for (const p of adhesionNeighbors(w, s)) if (cc.birthId[s]! < cc.birthId[p]!) links.push([cc.birthId[s]!, cc.birthId[p]!]);
      links.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const ev = (t: SimEvent['type']) => eventsOf(w, t).map((e) => [e.tick, e.birthId, e.detail!.partner, e.detail!.reason ?? '']);
      return { links, formed: ev('linkFormed'), refused: ev('linkRefused') };
    };
    const base = run(null);
    expect(base.links.length).toBeGreaterThanOrEqual(3);
    expect(run([5, 4, 3, 2, 1, 0])).toEqual(base);
    expect(run([2, 0, 5, 1, 4, 3])).toEqual(base);
  });
});

describe('P3.7 E12 linked members', () => {
  it('linked members do not move and pay no movement, even with richer food in reach; unlinked they would', () => {
    const { w, a, b, held } = pair();
    const c = w.ents.cols;
    expect(ticksToLink(w, a, b, held)).toBe(50);
    const rich: Pos = [66.5, 64.5];
    const x0 = [c.x[a]!, c.x[b]!];
    for (let k = 0; k < 40; k++) {
      feed(w, [A, B]);
      feed(w, [rich], 5);
      const move0 = w.ledger.energy.movement;
      step(w); // not held
      expect(linked(w, a, b)).toBe(true);
      expect(w.ledger.energy.movement).toBe(move0);
      expect(c.movedThisTick[a]).toBe(0);
      expect(c.movedThisTick[b]).toBe(0);
    }
    expect([c.x[a], c.x[b]]).toEqual(x0);
    expect([c.y[a], c.y[b]]).toEqual([A[1], B[1]]);
    // Control: an unlinked carrier in the same spot heads for the richer cell.
    const ctl = pair();
    for (let k = 0; k < 30; k++) {
      feed(ctl.w, [A, B]);
      feed(ctl.w, [rich], 5);
      step(ctl.w);
    }
    expect(ctl.w.ents.cols.x[ctl.a]).toBeGreaterThan(A[0]);
  });

  it('upkeep is exactly 0.001 E per link per tick (0.01 E/s); the inspector shows it', () => {
    const w = dish();
    const pts: Pos[] = [
      [60.2, 60.5],
      [60.6, 60.5],
      [61.0, 60.5],
    ];
    const s = pts.map((p) => placeWith(w, 'B01', p));
    linkAdhesion(w, s[0]!, s[1]!);
    linkAdhesion(w, s[1]!, s[2]!);
    const held: Held = s.map((slot, k) => [slot, ...pts[k]!] as const);
    for (let k = 0; k < 30; k++) {
      feed(w, pts);
      const up = w.ledger.energy.upkeep;
      stepHeld(w, held);
      expect(w.ledger.energy.upkeep - up).toBeCloseTo(0.001 * (1 + 2 + 1), 12);
    }
    expect(upkeepNow(w, s[1]!).links).toBeCloseTo(0.02, 12);
    expect(upkeepNow(w, s[0]!).links).toBeCloseTo(0.01, 12);
    // Unlinked: no link upkeep at all.
    const solo = placeWith(w, 'B01', [80.5, 80.5]);
    expect(upkeepNow(w, solo).links).toBeUndefined();
    // The inspector words quote the recorded numbers and the measured state, with no value judgement.
    expect(upkeepText({ upkeep: upkeepNow(w, s[1]!) })).toContain('0.02 for its colony links');
    expect(upkeepText({ upkeep: upkeepNow(w, solo) })).not.toContain('colony');
    const card = moduleSummaries(w, s[1]!).find((m) => m.id === 'E12')!;
    expect(card.activeNow).toBe(true);
    expect(moduleSummaries(w, solo).find((m) => m.id === 'E12')!.activeNow).toBe(false);
    const words = moduleText(card);
    expect(words.now).toBe('Linked to its colony right now.');
    expect(words.does).toContain('within 0.5 cells');
    expect(words.does).toContain('share no food or energy');
    expect(words.costs).toContain('2 energy once per link');
    expect(`${words.does} ${words.costs}`).not.toMatch(/superior|advanced|perfect|adapted|immune|multicellular/i);
  });

  it('the energy ledger balances over a linking run (link cost and upkeep included)', () => {
    const { w, a, b, held } = pair();
    const c = w.ents.cols;
    const sumE = () => c.E[a]! + c.E[b]!;
    const before = { ...w.ledger.energy };
    const E0 = sumE();
    for (let k = 0; k < 90; k++) {
      feed(w, [A, B]);
      stepHeld(w, held);
    }
    expect(linked(w, a, b)).toBe(true);
    const d = (k: keyof Energy) => w.ledger.energy[k] - before[k];
    const balance = d('earned') - d('maintenance') - d('surcharge') - d('upkeep') - d('movement') - d('secretion') - d('division') - d('dormancy') - d('construction') - d('dissipated') - d('other');
    expect(sumE() - E0).toBeCloseTo(balance, 9);
    expect(d('other')).toBeCloseTo(4, 12);
    expect(d('upkeep')).toBeCloseTo(41 * 0.002, 12); // ticks 50–90 (stage 7 of the link tick charges it), one link each
    expect(checkLedger(w).ok).toBe(true);
  });
});

describe('P3.7 E12 severance and the relink lockout', () => {
  it('no usable intake for 10 s severs (the D-0035 clock), then a 100-tick lockout', () => {
    const { w, a, b, held } = pair();
    const c = w.ents.cols;
    expect(ticksToLink(w, a, b, held)).toBe(50);
    // Fed ticks keep the clock at 0; then no food for exactly 100 ticks.
    for (let k = 1; k <= 99; k++) {
      stepHeld(w, held, { at4: () => feed(w, [A, B], 0) });
      expect(linked(w, a, b)).toBe(true);
    }
    expect(c.noUsableIntakeSeconds[a]).toBeCloseTo(9.9, 9);
    stepHeld(w, held, { at4: () => feed(w, [A, B], 0) });
    expect(linked(w, a, b)).toBe(false);
    expect(eventsOf(w, 'linkBroken').map((e) => e.detail!.cause)).toEqual(['noIntake']);
    expectLockoutThenRelink(w, a, b, held);
  });

  it('E below 15 severs, then a 100-tick lockout', () => {
    const { w, a, b, held } = pair();
    const c = w.ents.cols;
    expect(ticksToLink(w, a, b, held)).toBe(50);
    feed(w, [A, B]);
    stepHeld(w, held, { at7: () => void (c.E[a] = 14.99) }); // test-only energy, read by the stage 8 check
    expect(eventsOf(w, 'linkBroken').map((e) => e.detail!.cause)).toEqual(['energy']);
    c.E[a] = 50; // test-only: enough to relink after the lockout
    expectLockoutThenRelink(w, a, b, held);
  });

  it('resting severs (E03 carrier, labelled forced Resting), then a 100-tick lockout', () => {
    const { w, a, b, held } = pair({}, {}, ['E03', 'E12']);
    const c = w.ents.cols;
    expect(ticksToLink(w, a, b, held)).toBe(50);
    feed(w, [A, B]);
    stepHeld(w, held, { at7: () => void (c.lifeState[a] = LIFE_RESTING) }); // test-only forced state
    expect(eventsOf(w, 'linkBroken').map((e) => e.detail!.cause)).toEqual(['dormancy']);
    expect(linked(w, a, b)).toBe(false);
    c.lifeState[a] = LIFE_ACTIVE; // test-only: woken at once
    expectLockoutThenRelink(w, a, b, held);
  });

  it('module loss severs (labelled: a plain B01 holding a link) and starts the 10 s lockout', () => {
    const { w, a, b, held } = pair({}, {}, ['E12'], []);
    linkAdhesion(w, a, b); // test-only: a link to an organism without E12
    feed(w, [A, B]);
    stepHeld(w, held);
    expect(linked(w, a, b)).toBe(false);
    expect(eventsOf(w, 'linkBroken').map((e) => e.detail!.cause)).toEqual(['moduleLoss']);
    expect(w.ents.cols.adhLockout[a]).toBeCloseTo(10, 9);
    expect(linksValid(w)).toBe(true);
  });

  it('forced separation beyond 0.75 cells breaks the link, then a 100-tick lockout', () => {
    const { w, a, b, held } = pair();
    expect(ticksToLink(w, a, b, held)).toBe(50);
    feed(w, [A, B]);
    stepHeld(w, [[a, ...A], [b, 64.95, 64.5]]); // 0.65 apart: still linked
    expect(linked(w, a, b)).toBe(true);
    feed(w, [A, B]);
    stepHeld(w, [[a, ...A], [b, ...PULLED]]); // 0.8 apart (test-only relocation)
    expect(eventsOf(w, 'linkBroken').map((e) => e.detail!.cause)).toEqual(['separation']);
    expectLockoutThenRelink(w, a, b, held);
  });
});

describe('P3.7 E12 death, capture and division (D04 §13: survivors stay valid independent organisms)', () => {
  /** A held chain s0–s1–s2 (0.4 apart; s0 and s2 are 0.8 apart, out of reach of each other). */
  function chain3(): { w: World; s: number[]; held: Held; pts: Pos[] } {
    const w = dish();
    const pts: Pos[] = [
      [50.2, 50.5],
      [50.6, 50.5],
      [51.0, 50.5],
    ];
    const s = pts.map((p) => placeWith(w, 'B01', p));
    linkAdhesion(w, s[0]!, s[1]!);
    linkAdhesion(w, s[1]!, s[2]!);
    return { w, s, held: s.map((slot, k) => [slot, ...pts[k]!] as const), pts };
  }

  it('a member dies: its links leave both ends; the survivors are valid, unlinked and locked out', () => {
    const { w, s } = chain3();
    killEntity(w, s[1]!, R.DEATH_AGE);
    expect(linksValid(w)).toBe(true);
    expect(adhesionDegree(w, s[0]!)).toBe(0);
    expect(adhesionDegree(w, s[2]!)).toBe(0);
    expect(w.ents.cols.adhLockout[s[0]!]).toBe(10);
    expect(w.ents.cols.adhLockout[s[2]!]).toBe(10);
    expect(eventsOf(w, 'linkBroken').map((e) => e.detail!.cause)).toEqual(['death', 'death']);
  });

  it('a member is captured: the same', () => {
    const { w, s } = chain3();
    const pred = placeWith(w, 'P01', [52.5, 52.5], []);
    consumePrey(w, pred, s[1]!);
    expect(w.ents.cols.alive[s[1]!]).toBe(0);
    expect(linksValid(w)).toBe(true);
    expect(adhesionDegree(w, s[0]!) + adhesionDegree(w, s[2]!)).toBe(0);
    expect(w.ents.cols.adhLockout[s[0]!]).toBe(10);
  });

  it('a member divides: both daughters start unlinked, its partners are freed with a lockout, links stay valid', () => {
    const { w, s, held, pts } = chain3();
    const c = w.ents.cols;
    // Test-only state: the middle member is ready to divide (B ≥ 2 B0', E high, age ≥ minimum).
    w.ledger.inputs.c += 2.6 - c.B[s[1]!]!;
    c.B[s[1]!] = 2.6;
    c.E[s[1]!] = 95;
    c.age[s[1]!] = 40;
    const known = new Set(s);
    let daughter = -1;
    for (let k = 0; k < 50 && daughter < 0; k++) {
      feed(w, pts);
      stepHeld(w, held);
      for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && !known.has(i)) daughter = i;
    }
    expect(daughter).toBeGreaterThanOrEqual(0);
    expect(linksValid(w)).toBe(true);
    for (const d of [s[1]!, daughter]) {
      expect(adhesionDegree(w, d)).toBe(0);
      expect(c.adhLockout[d]).toBe(0);
      expect(w.genomes.get(c.genome[d]!).modules).toEqual(['E12']);
    }
    expect(adhesionDegree(w, s[0]!)).toBe(0);
    expect(adhesionDegree(w, s[2]!)).toBe(0);
    expect(c.adhLockout[s[0]!]).toBe(10);
    expect(c.adhLockout[s[2]!]).toBe(10);
    expect(eventsOf(w, 'linkBroken').map((e) => e.detail!.cause)).toEqual(['division', 'division']);
  });
});

describe('P3.7 E12 saves and determinism', () => {
  /** A fed dish with clumps of E12 carriers of all three eligible kinds and four Grazers (P01) hunting them. */
  function busy(): World {
    const base = REG.recipes.FIRST_DISH_V1!;
    const w = realizeRecipe(REG, { ...base, id: 'TEST_E12_BUSY', removeStones: true, founders: [], scheduledCommands: [], mutationPreset: 'fixed' }, { worldId: 'e12-busy' });
    const clumps: [string, number, number][] = [
      ['B01', 48, 64],
      ['B01', 56, 72],
      ['B04', 66, 48],
      ['B06', 66, 64],
    ];
    for (const [sp, cx, cy] of clumps) {
      for (let k = 0; k < 10; k++) placeWith(w, sp, [cx + 0.3 + 0.2 * (k % 4), cy + 0.3 + 0.2 * Math.floor(k / 4)], ['E12']);
    }
    for (const [x, y] of [
      [50.5, 64.5],
      [58.5, 72.5],
      [64.5, 50.5],
      [64.5, 66.5],
    ] as const)
      placeWith(w, 'P01', [x, y], []);
    return w;
  }

  it('2,000 ticks with carriers dividing, dying and being eaten: links stay valid and the file round-trips every 100 ticks', async () => {
    let w = busy();
    const sp = (id: string) => speciesIndex(w, id);
    const carriers = new Set([sp('B01'), sp('B04'), sp('B06')]);
    let births = 0;
    let deaths = 0;
    let captures = 0;
    for (let t = 1; t <= 2000; t++) {
      step(w);
      expect(linksValid(w)).toBe(true);
      if (t % 100 === 0) {
        const built = await buildSaveFile(w, { name: 'e12', savedAt: '2026-01-01T00:00:00.000Z', recipeId: null });
        const loaded = (await loadSaveFile(built.text)).world;
        expect(stateHash(loaded)).toBe(stateHash(w));
        for (const e of w.events.ring) {
          if (e.tick < t - 100 || e.species === undefined || !carriers.has(e.species)) continue;
          if (e.type === 'birth') births++;
          if (e.type === 'death') deaths++;
        }
        captures = w.events.totals.capture ?? 0;
        w = loaded;
      }
    }
    expect(w.events.totals.linkFormed ?? 0).toBeGreaterThan(0);
    expect(w.events.totals.linkBroken ?? 0).toBeGreaterThan(0);
    expect(births).toBeGreaterThan(0);
    expect(deaths).toBeGreaterThan(0);
    expect(captures).toBeGreaterThan(0);
    expect(checkLedger(w).ok).toBe(true);
  }, 120_000);

  it('a save mid-pairing continues identically 100 ticks later', async () => {
    const { w, a, b, held } = pair();
    for (let k = 1; k <= 30; k++) {
      feed(w, [A, B]);
      stepHeld(w, held);
    }
    expect(w.ents.cols.adhSeconds[a]).toBeCloseTo(3, 9);
    const built = await buildSaveFile(w, { name: 'mid', savedAt: '2026-01-01T00:00:00.000Z', recipeId: null });
    const w2 = (await loadSaveFile(built.text)).world;
    expect(w2.ents.cols.adhSeconds[a]).toBe(w.ents.cols.adhSeconds[a]);
    for (const x of [w, w2]) {
      for (let k = 1; k <= 100; k++) {
        feed(x, [A, B]);
        stepHeld(x, held);
      }
    }
    expect(linked(w2, a, b)).toBe(true);
    expect(stateHash(w2)).toBe(stateHash(w));
  });

  it('one 400-tick run equals four 100-tick quarters with a reload between them', () => {
    const one = busy();
    for (let t = 0; t < 400; t++) step(one);
    let q = busy();
    for (let k = 0; k < 4; k++) {
      for (let t = 0; t < 100; t++) step(q);
      q = deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(q))) as ReturnType<typeof serializeWorld>);
    }
    expect(one.events.totals.linkFormed ?? 0).toBeGreaterThan(0);
    expect(stateHash(q)).toBe(stateHash(one));
  });
});

describe('P3.7 E12 sampling takes whole colonies', () => {
  let n = 0;
  const cmd = (w: World, payload: CommandPayload): CommandResult => applyNow(w, `e12-${++n}`, payload).result!;

  it('half a colony is refused naming the missing member; the whole colony moves with its links', () => {
    const w = dish();
    const pts: Pos[] = [
      [30.5, 40.5],
      [31.2, 40.5],
      [31.9, 40.5],
      [32.6, 40.5],
    ];
    const s = pts.map((p) => placeWith(w, 'B01', p));
    for (let k = 0; k < 3; k++) linkAdhesion(w, s[k]!, s[k + 1]!);
    const c = w.ents.cols;
    const births = s.map((slot) => c.birthId[slot]!);
    const half = cmd(w, { kind: 'sampleTake', x: 30.5, y: 40.5, radius: 1, mode: 'life' });
    expect(half.accepted).toBe(0);
    expect(half.note).toContain(`B01 #${births[3]} at (32, 40)`);
    expect(w.sample).toBeNull();
    expect(adhesionComponent(w, s[0]!)).toEqual(s);
    expect(cmd(w, { kind: 'sampleTake', x: 31.5, y: 40.5, radius: 3, mode: 'life' }).accepted).toBeGreaterThanOrEqual(4);
    expect(cmd(w, { kind: 'sampleTransfer', dx: 0, dy: 10 }).accepted).toBeGreaterThan(0);
    expect(linksValid(w)).toBe(true);
    const moved = births.map((b) => {
      for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.birthId[i] === b) return i;
      return -1;
    });
    expect(moved.every((m) => m >= 0)).toBe(true);
    expect(adhesionComponent(w, moved[0]!).map((m) => c.birthId[m])).toEqual(expect.arrayContaining(births));
    expect(c.y[moved[0]!]).toBeCloseTo(50.5, 9);
  });
});
