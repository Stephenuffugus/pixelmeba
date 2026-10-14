/**
 * Phase 5 wave 10 barrier-transport: the S04 one-way channel (SPEC §4.9 "per second requests 2 % of every
 * eligible dissolved/viral pool of the source cell into the adjacent water destination (×dt), all from one
 * snapshot, summed and capped per pool, companions in the same fraction; plus one eligible free Small
 * organism per second if present (deterministic choice, exact state retained, no extra actions). No
 * multi-hop in one tick. Deposits, attached organisms, film and food objects are never advected."; CT §4,
 * §12.2; D-0106 the channel edge is closed to ordinary diffusion and movement; D-0117).
 *
 * Pools are measured against a twin dish whose channel edge is a closed shutter instead: both edges are
 * closed to ordinary diffusion, so the two dishes differ only by the channel's transfers. Organism tests
 * run stage 2 alone (envTick) so stage 4 movement cannot move anyone off the source cell.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import type { EdgeBarrier } from '../../src/sim/barriers';
import { CHANNEL_ORGANISM_TICKS } from '../../src/sim/constants';
import { FLAG, LIFE_RESTING } from '../../src/sim/entities';
import type { FieldId } from '../../src/sim/fields';
import { cellIndex, ST_NONE, ST_STONE } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { removeFungalLink } from '../../src/sim/links';
import { killEntity } from '../../src/sim/maintenance';
import { R } from '../../src/sim/reasons';
import { stateHash } from '../../src/sim/serialize';
import { rebuildIndex, entityCell } from '../../src/sim/spatial';
import { run, step } from '../../src/sim/tick';
import { stageEnvironment } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { aliveOf, barrierDish, linkAdhesion, linkFungal, place, placeWith, pushEdges, rebaseLedger, setField } from '../helpers/world';

const meta = { name: 'channel', savedAt: '2026-10-14T00:00:00Z', recipeId: null };
const X = 60;
const Y = 64;
const A = cellIndex(X, Y);
const B = cellIndex(X + 1, Y);
const C = cellIndex(X + 2, Y);
const F = 0.02 * 0.1;

function relClose(a: number, b: number, rel = 1e-12): void {
  expect(Math.abs(a - b), `${a} vs ${b}`).toBeLessThanOrEqual(rel * Math.max(Math.abs(a), Math.abs(b)));
}

/** A closed-lid barrier dish with the given edges. */
function dish(edges: readonly Omit<EdgeBarrier, 'id'>[], overrides: Parameters<typeof barrierDish>[0] = {}): World {
  const w = barrierDish({ seed: 104729, lid: 'closed', ...overrides });
  pushEdges(w, edges);
  return w;
}

const CHANNEL_AB: Omit<EdgeBarrier, 'id'> = { kind: 'S04', cell: A, dir: 'R', flow: 1 };
const SHUTTER_AB: Omit<EdgeBarrier, 'id'> = { kind: 'S03', cell: A, dir: 'R', open: false };

/** Stage 2 alone, then the tick advances (nothing else moves anyone). */
function envTick(w: World, n = 1): void {
  for (let k = 0; k < n; k++) {
    stageEnvironment(w);
    w.tick++;
  }
}

/** The pair (channel dish, shutter twin), both with `value` of `field` at A, after one stage 2. */
function pair(field: FieldId, value: number, extra?: (w: World) => void): { ch: World; tw: World } {
  const ch = dish([CHANNEL_AB]);
  const tw = dish([SHUTTER_AB]);
  for (const w of [ch, tw]) {
    setField(w, field, A, value);
    extra?.(w);
    stageEnvironment(w);
  }
  return { ch, tw };
}

function columnsOf(w: World, slot: number): Record<string, number> {
  const out: Record<string, number> = {};
  const cols = w.ents.cols as unknown as Record<string, ArrayLike<number>>;
  for (const k of Object.keys(cols)) out[k] = cols[k]![slot]!;
  return out;
}

describe('S04 pools', () => {
  it('flow 1, sugar 1.0 at the source: the destination gains exactly 0.002 × the snapshot and the source loses the same', () => {
    const { ch, tw } = pair('sugar', 1);
    const snapshot = tw.fields.sugar![A]!;
    expect(snapshot).toBeGreaterThan(0.5);
    expect(tw.fields.sugar![B]).toBe(0);
    relClose(ch.fields.sugar![B]!, snapshot * F);
    relClose(tw.fields.sugar![A]! - ch.fields.sugar![A]!, snapshot * F);
    // The tally records the move on the channel's id.
    expect(ch.gateTally).toHaveLength(1);
    expect(ch.gateTally[0]!.id).toBe(ch.edges[0]!.id);
    relClose(ch.gateTally[0]!.fields.sugar!, snapshot * F);
  });

  it('flow −1 reverses the direction', () => {
    const ch = dish([{ kind: 'S04', cell: A, dir: 'R', flow: -1 }]);
    setField(ch, 'sugar', B, 1);
    stageEnvironment(ch);
    expect(ch.fields.sugar![A]).toBeGreaterThan(0);
  });

  it('nothing flows the other way: sugar at the destination never reaches the source through the channel edge', () => {
    const ch = dish([CHANNEL_AB]);
    const tw = dish([SHUTTER_AB]);
    for (const w of [ch, tw]) setField(w, 'sugar', B, 1);
    for (let k = 0; k < 300; k++) {
      envTick(ch);
      envTick(tw);
    }
    // Sugar reaches A around the edge by ordinary diffusion, identically in both dishes; the channel adds nothing back.
    expect(tw.fields.sugar![A]).toBeGreaterThan(0);
    expect(ch.fields.sugar![A]! <= tw.fields.sugar![A]!).toBe(true);
    const ch1 = dish([CHANNEL_AB]);
    setField(ch1, 'sugar', B, 1);
    stageEnvironment(ch1);
    expect(ch1.fields.sugar![A]).toBe(0);
  });

  it('no multi-hop: a chain A → B → C moves nothing from A into C in one tick', () => {
    const w = dish([CHANNEL_AB, { kind: 'S04', cell: B, dir: 'R', flow: 1 }]);
    setField(w, 'sugar', A, 1);
    stageEnvironment(w);
    expect(w.fields.sugar![B]).toBeGreaterThan(0);
    expect(w.fields.sugar![C]).toBe(0);
  });

  it('activity fields and deposits never move', () => {
    const w = dish([CHANNEL_AB]);
    setField(w, 'eStarch', A, 0.5);
    setField(w, 'breaker', A, 0.5);
    setField(w, 'detritus', A, 0.5);
    setField(w, 'detritusN', A, 0.05);
    setField(w, 'film', A, 0.2);
    setField(w, 'filmN', A, 0.02);
    stageEnvironment(w);
    for (const id of ['eStarch', 'breaker', 'detritus', 'detritusN', 'film', 'filmN'] as const) {
      expect(w.fields[id]![B], id).toBe(0);
      // The dish's uniform background pools (oxygen, CO2, nutrient) do ride the channel; these never do.
      expect(w.gateTally[0]?.fields[id], id).toBeUndefined();
    }
  });

  it('v01 and v02 move 0.2 % per tick', () => {
    for (const id of ['v01', 'v02'] as const) {
      const { ch, tw } = pair(id, 100);
      expect(tw.fields[id]![B]).toBe(0);
      relClose(ch.fields[id]![B]! / tw.fields[id]![A]!, F, 1e-12);
    }
  });

  it('companions keep their ratio; inhibitors, salt and oxygen are pools too', () => {
    const { ch, tw } = pair('sugar', 1, (w) => {
      setField(w, 'sugarN', A, 0.1);
      setField(w, 'inhBact', A, 0.4);
      setField(w, 'salt', A, 0.3);
    });
    relClose(ch.fields.sugarN![B]! / ch.fields.sugar![B]!, tw.fields.sugarN![A]! / tw.fields.sugar![A]!);
    relClose(ch.fields.inhBact![B]! - tw.fields.inhBact![B]!, tw.fields.inhBact![A]! * F, 1e-9);
    relClose(ch.fields.salt![B]!, tw.fields.salt![A]! * F);
    expect(ch.fields.oxygen![B]).toBeGreaterThan(tw.fields.oxygen![B]!);
  });
});

describe('S04 organisms', () => {
  it('a B01 at the source moves after one tick with exactly the same in-cell position and every other column unchanged', () => {
    const w = dish([CHANNEL_AB]);
    const s = place(w, 'B01', X + 0.37, Y + 0.81, { E: 60 });
    const before = columnsOf(w, s);
    envTick(w);
    const after = columnsOf(w, s);
    expect(entityCell(after.x!, after.y!)).toBe(B);
    expect(after.x! - Math.floor(after.x!)).toBe(before.x! - Math.floor(before.x!));
    expect(after.y).toBe(before.y);
    expect(after.x).toBe(before.x! + 1);
    for (const k of Object.keys(before)) if (k !== 'x' && k !== 'y') expect(after[k], k).toBe(before[k]);
    expect(w.edges[0]!.nextOrganismTick).toBe(CHANNEL_ORGANISM_TICKS);
    expect(w.gateTally[0]!.organisms).toBe(1);
    // The index sees it in its new cell.
    expect(w.derived.cellHead[B]).toBe(s);
  });

  it('a second B01 waits 10 ticks', () => {
    const w = dish([CHANNEL_AB]);
    const s1 = place(w, 'B01', X + 0.5, Y + 0.5);
    const s2 = place(w, 'B01', X + 0.25, Y + 0.25);
    envTick(w);
    const c = w.ents.cols;
    expect(entityCell(c.x[s1]!, c.y[s1]!)).toBe(B);
    expect(entityCell(c.x[s2]!, c.y[s2]!)).toBe(A);
    envTick(w, CHANNEL_ORGANISM_TICKS - 1);
    expect(entityCell(c.x[s2]!, c.y[s2]!)).toBe(A);
    expect(w.edges[0]!.nextOrganismTick).toBe(10);
    envTick(w);
    expect(entityCell(c.x[s2]!, c.y[s2]!)).toBe(B);
    expect(w.edges[0]!.nextOrganismTick).toBe(20);
    expect(w.gateTally[0]!.organisms).toBe(2);
  });

  it('the lowest birthId goes first (not the lowest slot)', () => {
    const w = dish([CHANNEL_AB]);
    const s0 = place(w, 'B01', 40.5, 64.5);
    const s1 = place(w, 'B01', X + 0.5, Y + 0.5);
    killEntity(w, s0, R.DEATH_STARVATION);
    const s2 = place(w, 'B01', X + 0.5, Y + 0.5);
    expect(s2).toBe(s0);
    const c = w.ents.cols;
    expect(c.birthId[s1]!).toBeLessThan(c.birthId[s2]!);
    envTick(w);
    expect(entityCell(c.x[s1]!, c.y[s1]!)).toBe(B);
    expect(entityCell(c.x[s2]!, c.y[s2]!)).toBe(A);
  });

  it('never moved: a P01 (Medium), an attached B02, an E12-linked B01, an X01 on its host and the host carrying it', () => {
    const cases: [string, (w: World) => number[]][] = [
      ['P01', (w) => [place(w, 'P01', X + 0.5, Y + 0.5)]],
      [
        'attached B02',
        (w) => {
          const s = place(w, 'B02', X + 0.5, Y + 0.5);
          w.ents.cols.flags[s] = w.ents.cols.flags[s]! | FLAG.attached;
          return [s];
        },
      ],
      [
        'unflagged B02 (a species that lives attached)',
        (w) => {
          const s = place(w, 'B02', X + 0.5, Y + 0.5);
          w.ents.cols.flags[s] = w.ents.cols.flags[s]! & ~FLAG.attached;
          return [s];
        },
      ],
      [
        'E12-linked B01',
        (w) => {
          const a = placeWith(w, 'B01', X + 0.5, Y + 0.5, ['E12']);
          const b = placeWith(w, 'B01', X - 0.5, Y + 0.5, ['E12']);
          linkAdhesion(w, a, b);
          return [a];
        },
      ],
      [
        'X01 on an A01 host, both at the source',
        (w) => {
          const h = place(w, 'A01', X + 0.5, Y + 0.5);
          const p = place(w, 'X01', X + 0.5, Y + 0.5);
          attach(w, p, h);
          return [h, p];
        },
      ],
      [
        // A unit check of the free rule: a pair whose host is Small (no shipped host is), so only the
        // hostSlot/parasiteSlot rule keeps them in place.
        'X01 on a Small host (constructed pair), both at the source',
        (w) => {
          const h = place(w, 'B01', X + 0.5, Y + 0.5);
          const p = place(w, 'X01', X + 0.5, Y + 0.5);
          attach(w, p, h);
          return [h, p];
        },
      ],
    ];
    for (const [label, setup] of cases) {
      const w = dish([CHANNEL_AB]);
      const slots = setup(w);
      envTick(w, 25);
      const c = w.ents.cols;
      for (const s of slots) expect(entityCell(c.x[s]!, c.y[s]!), label).toBe(A);
      expect(w.edges[0]!.nextOrganismTick, label).toBeUndefined();
    }
  });

  // Unit checks of the free rule's other parts (wave 10 lead fixes item 1). Each organism is Small and in
  // the source cell, and only the rule under test keeps it there; the release half proves it is that rule.
  it('an E04-anchored B01 is never moved (SPEC "active anchored organisms cannot enter directed channels"); released, it is', () => {
    const w = dish([CHANNEL_AB]);
    const s = placeWith(w, 'B01', X + 0.5, Y + 0.5, ['E04'], { E: 60 });
    const c = w.ents.cols;
    c.anchorState[s] = 1; // labelled test state: anchored (stage 2 alone never runs the anchor machine)
    envTick(w, 25);
    expect(entityCell(c.x[s]!, c.y[s]!)).toBe(A);
    expect(w.edges[0]!.nextOrganismTick).toBeUndefined();
    c.anchorState[s] = 0;
    envTick(w);
    expect(entityCell(c.x[s]!, c.y[s]!)).toBe(B);
  });

  it('a held B01 (heldBySlot ≥ 0) is never moved; let go, it is', () => {
    const w = dish([CHANNEL_AB]);
    const s = place(w, 'B01', X + 0.5, Y + 0.5, { E: 60 });
    const holder = place(w, 'P01', 40.5, 64.5, { E: 60 });
    const c = w.ents.cols;
    // Labelled test state: only the held columns (no shipped trap is Small-adjacent here; stage 2 alone reads no trap).
    c.heldBySlot[s] = holder;
    c.heldByBirthId[s] = c.birthId[holder]!;
    envTick(w, 25);
    expect(entityCell(c.x[s]!, c.y[s]!)).toBe(A);
    expect(w.edges[0]!.nextOrganismTick).toBeUndefined();
    c.heldBySlot[s] = -1;
    c.heldByBirthId[s] = 0;
    envTick(w);
    expect(entityCell(c.x[s]!, c.y[s]!)).toBe(B);
  });

  it('a fungally linked Small organism (constructed link: no shipped rule links one) is never moved; unlinked, it is', () => {
    const w = dish([CHANNEL_AB]);
    const s = place(w, 'B01', X + 0.5, Y + 0.5, { E: 60 });
    const t = place(w, 'B01', X - 1.5, Y + 0.5, { E: 60 });
    linkFungal(w, s, t);
    const c = w.ents.cols;
    envTick(w, 25);
    expect(entityCell(c.x[s]!, c.y[s]!)).toBe(A);
    expect(w.edges[0]!.nextOrganismTick).toBeUndefined();
    removeFungalLink(w, s, t);
    envTick(w);
    expect(entityCell(c.x[s]!, c.y[s]!)).toBe(B);
  });

  it('a destination the organism cannot occupy (a stone at B) refuses it; cleared, it is moved', () => {
    const w = dish([CHANNEL_AB]);
    const s = place(w, 'B01', X + 0.5, Y + 0.5, { E: 60 });
    w.grid.structure[B] = ST_STONE; // labelled test state: the import refuses a channel beside a stone
    w.grid.geometryVersion++;
    const c = w.ents.cols;
    envTick(w, 25);
    expect(entityCell(c.x[s]!, c.y[s]!)).toBe(A);
    expect(w.edges[0]!.nextOrganismTick).toBeUndefined();
    w.grid.structure[B] = ST_NONE;
    w.grid.geometryVersion++;
    envTick(w);
    expect(entityCell(c.x[s]!, c.y[s]!)).toBe(B);
  });

  it('a free X01 (Small, not on a host) is moved', () => {
    const w = dish([CHANNEL_AB]);
    const p = place(w, 'X01', X + 0.5, Y + 0.5);
    envTick(w);
    expect(entityCell(w.ents.cols.x[p]!, w.ents.cols.y[p]!)).toBe(B);
  });

  it('a resting E03 carrier B01 is moved, still resting', () => {
    const w = barrierDish({ seed: 104729 });
    const s = placeWith(w, 'B01', 64.5, 64.5, ['E03']);
    run(w, 250);
    const c = w.ents.cols;
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
    pushEdges(w, [CHANNEL_AB]);
    c.x[s] = X + 0.5;
    c.y[s] = Y + 0.5;
    rebuildIndex(w);
    stageEnvironment(w);
    expect(entityCell(c.x[s], c.y[s])).toBe(B);
    expect(c.lifeState[s]).toBe(LIFE_RESTING);
  });

  it('nextOrganismTick: a save while a channel waits, loaded and continued, equals the uninterrupted run, and the import accepts it', async () => {
    const a = dish([CHANNEL_AB, { kind: 'S04', cell: cellIndex(70, 50), dir: 'D', flow: -1 }], { lid: 'open' });
    for (let k = 0; k < 6; k++) place(a, 'B01', X + 0.1 + k * 0.15, Y + 0.5, { E: 60 });
    for (let k = 0; k < 6; k++) place(a, 'B01', 70.2 + k * 0.1, 51.5, { E: 60 });
    setField(a, 'sugar', A, 0.5);
    rebaseLedger(a);
    let guard = 0;
    while ((a.edges[0]!.nextOrganismTick ?? 0) <= a.tick + 1 && guard++ < 200) step(a);
    expect(a.edges[0]!.nextOrganismTick! > a.tick).toBe(true);
    const { text } = await buildSaveFile(a, meta);
    const { world: b } = await loadSaveFile(text);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(b.edges).toEqual(a.edges);
    run(a, 400);
    run(b, 400);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(b.gateTally).toEqual(a.gateTally);
    expect(a.gateTally.find((t) => t.id === a.edges[0]!.id)!.organisms).toBeGreaterThan(0);
    const again = await loadSaveFile((await buildSaveFile(a, meta)).text);
    expect(stateHash(again.world)).toBe(stateHash(a));
  }, 60_000);

  it('a channel that never moved anyone leaves nextOrganismTick absent (no hashed key appears)', () => {
    const w = dish([CHANNEL_AB]);
    place(w, 'P01', X + 0.5, Y + 0.5);
    envTick(w, 30);
    expect('nextOrganismTick' in w.edges[0]!).toBe(false);
  });
});

describe('S04 conservation', () => {
  it('2,000 closed-lid ticks with three channels: checkLedger relErr < 1e-5', () => {
    const w = dish([
      CHANNEL_AB,
      { kind: 'S04', cell: cellIndex(70, 50), dir: 'D', flow: -1 },
      { kind: 'S04', cell: cellIndex(50, 70), dir: 'R', flow: -1 },
    ]);
    for (let y = 44; y <= 84; y++) for (let x = 44; x <= 84; x++) {
      setField(w, 'sugar', cellIndex(x, y), 0.3);
      setField(w, 'sugarN', cellIndex(x, y), 0.03);
    }
    setField(w, 'v01', B, 50);
    for (let k = 0; k < 30; k++) place(w, 'B01', 45.5 + ((k * 7) % 38), 45.5 + ((k * 11) % 38), { E: 60 });
    rebaseLedger(w);
    for (let chunk = 0; chunk < 4; chunk++) {
      run(w, 500);
      const check = checkLedger(w);
      expect(check.ok, JSON.stringify(check)).toBe(true);
      expect(check.relErr.c).toBeLessThan(1e-5);
      expect(check.relErr.n).toBeLessThan(1e-5);
    }
    expect(aliveOf(w).length).toBeGreaterThan(0);
    const tallied = w.gateTally.filter((t) => w.edges.some((e) => e.id === t.id && e.kind === 'S04'));
    expect(tallied.length).toBeGreaterThan(0);
  }, 120_000);
});

/** Attach parasite p to host h (the column pair parasites.ts writes). */
function attach(w: World, p: number, h: number): void {
  const c = w.ents.cols;
  c.hostSlot[p] = h;
  c.hostBirthId[p] = c.birthId[h]!;
  c.parasiteSlot[h] = p;
  c.parasiteBirthId[h] = c.birthId[p]!;
}
