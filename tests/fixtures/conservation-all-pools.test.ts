/**
 * G3 gate fixture "conservation-all-pools" (BUILD_DIRECTIVE "G3 gate — evidence"; SPEC §3.4, §17; D01
 * acceptance "Resource accounting": closed lid, no inputs, 10,000 ticks, carbon and nutrient error below
 * 0.001 %, including feeding, predation, parasites, film and phage lysis).
 *
 * One closed-lid Water Garden (stones removed, no background sugar) under the shipped manifest, built by
 * hand and then left alone: no command, input or export after setup (the ledger is re-based once the
 * dish is built). It holds every Phase 3 pool and mechanism at once:
 *  - film: B02 Velvet on gel and Matrix-building (E10) Sprinters on sugar;
 *  - fungi: F01 Threadlace on debris and a four-segment F02 Cordweaver chain with transport links
 *    (labelled test state: links and the donor's B = 4 set by hand, as tests/fixtures/fungal-transport
 *    does);
 *  - parasites: X01 Hitchers beside A01 Sunbeads; phage: V01 dosed onto a Sprinter colony;
 *  - enzymes: B06 Crumbsmith on starch, B07 Oilwick on oil, B08 Brothmaker on protein, an M09 breaker
 *    patch over part of the oil;
 *  - food objects: one M10 pellet and one M11 wafer (the Lab command);
 *  - obstacles: stones, walls and beads (the Lab command), gel and sediment paint;
 *  - consumers P01–P04, the anaerobes B03 (low-oxygen sediment) and Y01 (acid), B04/B05 recyclers;
 *  - modules: E04 carriers beside a stone, E07 Sunbeads, E12 Sprinters in a cluster.
 *
 * Every 100th tick: C, N and M within 1e-5 relative of initial + inputs − exports ± exchange
 * (checkLedger), inputs and exports unchanged, no exchange (closed lid), every inactive field exactly 0.
 * Non-vacuity: each mechanism is observed happening (film, fungal transfer, infection and lysis,
 * parasite drain, each enzyme's conversion, both objects releasing and one emptying, captures, an
 * adhesion link), so a dish where a mechanism silently stopped would fail here.
 */
import { describe, expect, it } from 'vitest';
import { applyNow, type CommandPayload } from '../../src/sim/commands';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger, computeTotals } from '../../src/sim/ledger';
import { LINK_TRANSPORT } from '../../src/sim/links';
import { R } from '../../src/sim/reasons';
import { step } from '../../src/sim/tick';
import { inactiveFieldsNonZero } from '../../src/sim/transport';
import type { World } from '../../src/sim/world';
import { aliveOf, clearWater, linkFungal, place, placeWith, rebaseLedger, setField } from '../helpers/world';

const TICKS = 10_000;
const CHECK_EVERY = 100;

let seq = 0;
function cmd(w: World, payload: CommandPayload): void {
  const res = applyNow(w, `pools-${++seq}`, payload).result!;
  if (res.accepted <= 0) throw new Error(`setup command refused: ${JSON.stringify(payload)} → ${JSON.stringify(res)}`);
}

/** A square patch of one field (setField logs it as an input; the ledger is re-based after setup). */
function patch(w: World, id: Parameters<typeof setField>[1], cx: number, cy: number, r: number, v: number): void {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) setField(w, id, cellIndex(cx + dx, cy + dy), v);
}

interface Built {
  readonly w: World;
  readonly f02: readonly number[];
}

function build(): Built {
  const w = clearWater({ lid: 'closed' });
  // Habitat: gel and sediment paint, stones, walls and beads (all through the Lab commands).
  cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points: [[30, 50], [30, 70]], radius: 6 });
  cmd(w, { kind: 'paintSubstrate', substrate: 'sediment', points: [[96, 55], [96, 72]], radius: 6 });
  cmd(w, { kind: 'placeStructure', structure: 'stone', points: [[64, 30]], radius: 1 });
  cmd(w, { kind: 'placeStructure', structure: 'stone', points: [[86, 40]], radius: 1 });
  cmd(w, { kind: 'placeStructure', structure: 'wall', points: [[74, 95], [86, 95]], radius: 1 });
  cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[48, 88], [58, 88]], radius: 1 });

  // Food: sugar patches, deposits, debris, two food objects, and the breaker (not material).
  patch(w, 'sugar', 60, 45, 5, 0.2);
  patch(w, 'sugar', 32, 72, 2, 0.3);
  patch(w, 'sugar', 66, 32, 2, 0.3);
  patch(w, 'sugar', 56, 60, 2, 0.3);
  patch(w, 'sugar', 40, 40, 2, 0.3);
  patch(w, 'sugar', 96, 62, 3, 0.2);
  patch(w, 'starch', 70, 58, 2, 0.4);
  patch(w, 'starchN', 70, 58, 2, 0.04);
  patch(w, 'oil', 80, 58, 2, 0.4);
  patch(w, 'oilN', 80, 58, 2, 0.04);
  patch(w, 'protein', 70, 70, 2, 0.4);
  patch(w, 'proteinN', 70, 70, 2, 0.04);
  patch(w, 'detritus', 29, 57, 2, 0.3);
  patch(w, 'detritusN', 29, 57, 2, 0.03);
  cmd(w, { kind: 'deposit', materialId: 'M09', points: [[81, 58]], radius: 1, dose: 0.5 });
  cmd(w, { kind: 'placeObject', materialId: 'M10', x: 60.5, y: 78.5 });
  cmd(w, { kind: 'placeObject', materialId: 'M11', x: 66.5, y: 78.5 });
  // Low oxygen in the sediment patch for Dusk (oxygen is not a ledgered material).
  for (let dy = -9; dy <= 9; dy++) for (let dx = -6; dx <= 6; dx++) w.fields.oxygen![cellIndex(96 + dx, 63 + dy)] = 0.05;

  // Film: B02 on gel; E10 Sprinters on sugar.
  for (let k = 0; k < 6; k++) place(w, 'B02', 27.5 + k, 48.5, { E: 60 });
  for (let k = 0; k < 4; k++) placeWith(w, 'B01', 31.5 + (k % 2), 71.5 + Math.floor(k / 2), ['E10'], { E: 60, B: 1.6 });
  // Fungi: F01 on debris; an F02 chain with transport links (donor first).
  for (let k = 0; k < 4; k++) place(w, 'F01', 27.5 + k, 57.5, { E: 60 });
  const f02 = [0, 1, 2, 3].map((k) => place(w, 'F02', 26.5 + k, 64.5, { E: 50, B: k === 0 ? 4 : 2, N: k === 0 ? 0.4 : 0.2 }));
  for (let k = 0; k + 1 < f02.length; k++) linkFungal(w, f02[k]!, f02[k + 1]!, LINK_TRANSPORT);
  // Phage on a Sprinter colony.
  for (let k = 0; k < 20; k++) place(w, 'B01', 57.5 + (k % 6), 43.5 + Math.floor(k / 6));
  cmd(w, { kind: 'inoculate', speciesId: 'V01', x: 60, y: 45, radius: 3, count: 20 });
  // Parasites on Sunbeads; E07 Sunbeads.
  for (let k = 0; k < 8; k++) place(w, 'A01', 42.5 + 2 * (k % 4), 68.5 + 2 * Math.floor(k / 4));
  for (let k = 0; k < 3; k++) place(w, 'X01', 42.6 + 2 * k, 68.5);
  for (let k = 0; k < 3; k++) placeWith(w, 'A01', 50.5 + 2 * k, 74.5, ['E07']);
  // Producers on their deposits.
  for (let k = 0; k < 4; k++) place(w, 'B06', 69.5 + (k % 2), 57.5 + Math.floor(k / 2), { E: 60 });
  for (let k = 0; k < 4; k++) place(w, 'B07', 79.5 + (k % 2), 57.5 + Math.floor(k / 2), { E: 60 });
  for (let k = 0; k < 4; k++) place(w, 'B08', 69.5 + (k % 2), 69.5 + Math.floor(k / 2), { E: 60 });
  // Recyclers and cross-feeders, the anaerobes.
  for (let k = 0; k < 4; k++) place(w, 'B04', 32.5, 55.5 + k);
  for (let k = 0; k < 3; k++) place(w, 'B05', 76.5 + k, 64.5);
  for (let k = 0; k < 5; k++) place(w, 'B03', 94.5 + k, 61.5);
  for (let k = 0; k < 5; k++) place(w, 'Y01', 38.5 + k, 40.5);
  // E04 carriers beside the stone at (64, 30); E12 Sprinters in a cluster.
  placeWith(w, 'B01', 66.5, 30.5, ['E04'], { E: 60 });
  placeWith(w, 'B01', 62.5, 30.5, ['E04'], { E: 60 });
  placeWith(w, 'B01', 64.5, 32.5, ['E04'], { E: 60 });
  for (let k = 0; k < 6; k++) placeWith(w, 'B01', 55.5 + 0.4 * (k % 3), 59.5 + 0.4 * Math.floor(k / 3), ['E12'], { E: 60 });
  // Consumers.
  place(w, 'P01', 52.5, 45.5, { E: 50 });
  place(w, 'P01', 72.5, 62.5, { E: 50 });
  place(w, 'P02', 62.5, 50.5, { E: 50 });
  place(w, 'P02', 74.5, 66.5, { E: 50 });
  place(w, 'P03', 46.5, 72.5, { E: 50 });
  place(w, 'P03', 41.5, 42.5, { E: 50 });
  place(w, 'P04', 97.5, 66.5, { E: 50 });
  place(w, 'P04', 95.5, 58.5, { E: 50 });
  rebaseLedger(w);
  return { w, f02 };
}

interface Seen {
  filmMax: number;
  fungalTransfer: number;
  infections: number;
  lyses: number;
  drainTicks: number;
  captures: number;
  adhesionLinks: number;
  objectsEmptied: string[];
  objectReleased: Record<string, number>;
  worstC: number;
  worstN: number;
  worstM: number;
  /** Worst absolute ledger residual |actual − expected| per element over the checkpoints. */
  worstAbs: { c: number; n: number; m: number };
  peakAlive: number;
  /** The last checkpoint tick with a living organism. */
  lastAlive: number;
  checks: number;
}

function sumOf(w: World, id: 'film'): number {
  const a = w.fields[id]!;
  let s = 0;
  for (let k = 0; k < a.length; k++) s += a[k]!;
  return s;
}

function runAndWatch(w: World): Seen {
  const seen: Seen = { filmMax: 0, fungalTransfer: 0, infections: 0, lyses: 0, drainTicks: 0, captures: 0, adhesionLinks: 0, objectsEmptied: [], objectReleased: {}, worstC: 0, worstN: 0, worstM: 0, worstAbs: { c: 0, n: 0, m: 0 }, peakAlive: 0, lastAlive: 0, checks: 0 };
  const inputs0 = { ...w.ledger.inputs };
  const exports0 = { ...w.ledger.exports };
  const objects0 = new Map(w.objects.map((o) => [o.id, { kind: o.kind, c: (o.pools.sugar ?? 0) + (o.pools.starch ?? 0) + (o.pools.protein ?? 0) }]));
  let lastEvent = w.counters.nextEventId - 1;
  const x01 = w.species.findIndex((s) => s.id === 'X01');
  const c = w.ents.cols;
  for (let t = 0; t < TICKS; t++) {
    step(w, {
      afterStage: (stage, world) => {
        if (stage === 5) {
          for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && c.infectedBy[i] !== 0 && c.infectionTimer[i] === 0) seen.infections++;
        } else if (stage === 6) {
          for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && c.species[i] === x01 && c.hostSlot[i]! >= 0 && c.lastIntakeTick[i] === world.tick) seen.drainTicks++;
        } else if (stage === 8) {
          seen.fungalTransfer = Math.max(seen.fungalTransfer, world.history.pendingFungalTransfer ?? 0);
        }
      },
    });
    for (const e of w.events.ring) {
      if (e.id <= lastEvent) continue;
      if (e.type === 'death' && e.cause === R.DEATH_LYSIS) seen.lyses++;
      if (e.type === 'capture') seen.captures++;
      if (e.type === 'linkFormed' && e.detail?.kind === 'adhesion') seen.adhesionLinks++;
      if (e.type === 'objectEmptied') seen.objectsEmptied.push(String(e.detail?.kind));
    }
    lastEvent = w.counters.nextEventId - 1;
    for (const o of w.objects) {
      const left = (o.pools.sugar ?? 0) + (o.pools.starch ?? 0) + (o.pools.protein ?? 0);
      seen.objectReleased[o.kind] = objects0.get(o.id)!.c - left;
    }
    for (const [id, o] of objects0) if (!w.objects.some((x) => x.id === id)) seen.objectReleased[o.kind] = o.c;
    if ((t + 1) % CHECK_EVERY === 0) {
      const check = checkLedger(w);
      seen.checks++;
      seen.worstC = Math.max(seen.worstC, check.relErr.c);
      seen.worstN = Math.max(seen.worstN, check.relErr.n);
      seen.worstM = Math.max(seen.worstM, check.expected.m === 0 ? Math.abs(check.actual.m) : check.relErr.m);
      for (const e of ['c', 'n', 'm'] as const) seen.worstAbs[e] = Math.max(seen.worstAbs[e], Math.abs(check.actual[e] - check.expected[e]));
      if (!check.ok) throw new Error(`tick ${w.tick}: ledger open ${JSON.stringify(check)}`);
      expect(w.ledger.inputs).toEqual(inputs0);
      expect(w.ledger.exports).toEqual(exports0);
      expect(w.ledger.exchangeC).toBe(0);
      expect(inactiveFieldsNonZero(w)).toEqual([]);
      seen.filmMax = Math.max(seen.filmMax, sumOf(w, 'film'));
      seen.peakAlive = Math.max(seen.peakAlive, w.ents.count);
      if (w.ents.count > 0) seen.lastAlive = w.tick;
    }
  }
  return seen;
}

describe('G3 conservation, every pool (closed lid, 10,000 ticks)', () => {
  it('C, N and M reconcile within 1e-5 at every 100th tick while film, fungi, parasites, phage, enzymes, objects and modules all act', () => {
    const t0 = performance.now();
    const { w, f02 } = build();
    const species = [...new Set(aliveOf(w).map((s) => w.species[w.ents.cols.species[s]!]!.id))].sort();
    expect(species).toEqual(['A01', 'B01', 'B02', 'B03', 'B04', 'B05', 'B06', 'B07', 'B08', 'F01', 'F02', 'P01', 'P02', 'P03', 'P04', 'X01', 'Y01']);
    expect(w.fields.v01!.some((v) => v > 0)).toBe(true);
    expect(w.objects.map((o) => o.kind).sort()).toEqual(['pellet', 'wafer']);
    expect(f02.length).toBe(4);
    const totals0 = computeTotals(w);
    expect(totals0.c).toBeGreaterThan(0);
    expect(totals0.n).toBeGreaterThan(0);

    const seen = runAndWatch(w);
    const ms = performance.now() - t0;
    console.info(
      `conservation-all-pools: ${TICKS} ticks in ${(ms / 1000).toFixed(1)} s; worst rel. error C ${seen.worstC.toExponential(2)}, N ${seen.worstN.toExponential(2)}, |M| ${seen.worstM.toExponential(2)}; worst absolute residual C ${seen.worstAbs.c.toExponential(3)}, N ${seen.worstAbs.n.toExponential(3)}, M ${seen.worstAbs.m.toExponential(3)}; ` +
        `peak alive ${seen.peakAlive}, last alive at tick ${seen.lastAlive}; births ${w.events.totals.birth ?? 0}, deaths ${w.events.totals.death ?? 0}; film max ${seen.filmMax.toFixed(3)} C; fungal transfer (max per second) ${seen.fungalTransfer.toExponential(2)} C; infections ${seen.infections}; lyses ${seen.lyses}; ` +
        `drain ticks ${seen.drainTicks}; captures ${seen.captures}; adhesion links ${seen.adhesionLinks}; converted ${JSON.stringify(w.conversionTotals)}; ` +
        `objects released ${JSON.stringify(seen.objectReleased)} emptied ${JSON.stringify(seen.objectsEmptied)}; roundoff ${JSON.stringify(w.ledger.roundoff)}`,
    );
    expect(w.tick).toBe(TICKS);
    expect(seen.checks).toBe(TICKS / CHECK_EVERY);
    expect(seen.worstC).toBeLessThan(1e-5);
    expect(seen.worstN).toBeLessThan(1e-5);
    expect(seen.worstM).toBeLessThan(1e-9); // no mineral in a Phase 3 dish: the total stays exactly 0
    // Tripwire beyond SPEC §3.4: the dish's carbon is dominated by ~5,600 C of dissolved CO2, so 1e-5
    // relative is ~0.06 C, more than a few lost viral units (0.01 C each). The books close to roundoff
    // (measured ~1e-14), so a leak of even one unit trips this.
    expect(seen.worstC).toBeLessThan(1e-9);
    expect(seen.worstN).toBeLessThan(1e-9);
    // Absolute ledger residual per element (lead fix 4a), the same bound as the G0 closed-lid fixture:
    // measured worst 3.6e-11 C, 8.1e-11 N, 0 M here (2026-10-10); 1e-8 is 10x the worst residual of
    // either fixture rounded up to a power of ten, six orders below a 0.01 C leak.
    expect(seen.worstAbs.c).toBeLessThan(1e-8);
    expect(seen.worstAbs.n).toBeLessThan(1e-8);
    expect(seen.worstAbs.m).toBeLessThan(1e-8);
    // Non-vacuity: every mechanism of the dish acted.
    expect(seen.filmMax).toBeGreaterThan(0);
    expect(seen.fungalTransfer).toBeGreaterThan(0);
    expect(seen.infections).toBeGreaterThanOrEqual(1);
    expect(seen.lyses).toBeGreaterThanOrEqual(1);
    expect(seen.drainTicks).toBeGreaterThan(0);
    expect(w.conversionTotals.starch).toBeGreaterThan(0);
    expect(w.conversionTotals.oil).toBeGreaterThan(0);
    expect(w.conversionTotals.protein).toBeGreaterThan(0);
    expect(seen.objectReleased.pellet).toBeGreaterThan(0);
    expect(seen.objectReleased.wafer).toBeGreaterThan(0);
    expect(seen.objectsEmptied.length).toBeGreaterThanOrEqual(1);
    expect(seen.captures).toBeGreaterThan(0);
    expect(seen.adhesionLinks).toBeGreaterThan(0);
    expect(w.events.totals.birth ?? 0).toBeGreaterThan(0);
    expect(w.events.totals.death ?? 0).toBeGreaterThan(0);
    expect(seen.lastAlive).toBeGreaterThanOrEqual(TICKS / 2); // life lasts at least half the run
    // A small dish: a few hundred agents at most. Its run time is reported above, not asserted (wall
    // time on the shared 2-CPU machine varies threefold with load: 23 s alone under tsx, 66–206 s here).
    expect(seen.peakAlive).toBeLessThan(1000);
  }, 600_000);
});
