/**
 * G3 fixture: determinism of a Phase-3-heavy dish (BUILD_DIRECTIVE "G3 gate — evidence", Appendix A
 * "determinism: <hash> (1x) == <hash> (4x) == <hash> (reload)"; SPEC §3.2, §15; CLAUDE.md
 * "Determinism"). The G1 fixture (deterministic-state.test.ts) proves the same for FIRST_DISH_V1, and
 * L303 alone exercises only enzymes, broth and Diverse seeding; this dish carries every Phase 3
 * system at once.
 *
 * One hand-built Water Garden (open lid, Accelerated mutation, shipped manifest) holding:
 *  - film: B02 Velvet on gel, and Sprinters carrying E10 Matrix building on sugar;
 *  - fungi: F01 Threadlace on debris; a four-segment F02 Cordweaver chain with transport links
 *    (labelled test state: links and the donor's B = 4 set by hand, as fungal-transport does);
 *  - phage V01 dosed onto a Sprinter colony; X01 Hitchers beside A01 Sunbeads;
 *  - enzymes: B06 Crumbsmith on starch, B07 Oilwick on oil, B08 Brothmaker on protein, M09 breaker;
 *  - food objects: an M11 wafer at build time, an M10 pellet placed during play;
 *  - modules: E04 Holdfast carriers beside a stone, E07 Light-seeking Sunbeads, E12 Adhesion Sprinters.
 * Then a player session: a protein dose, a pellet, a salt stroke, a Cordweaver inoculation, Clean
 * water, a Sample taken (All, radius 3) and transferred while paused, a gel stroke and a sugar dose.
 *
 * Proven, relationally (no hash literal is pinned):
 *  - through the real worker host (DishHost, fake clock): the 4× session with irregular frames ==
 *    its command log replayed at 1× (one tick per frame) == the log replayed headlessly through the
 *    stage-1 queue, in 1-tick steps and in observed 4-tick chunks;
 *  - save → loadSaveFile at the midpoint with the sample still HELD (the file carries it), then
 *    Transfer and continue == the uninterrupted session; the host's own save opened as a new dish at
 *    the same moment, then Transfer and continue at 4×, == the same;
 *  - non-vacuity: every listed mechanism is observed acting in the replay (film grows, fungal
 *    transfer, infections, a hitcher drain, each enzyme's conversion, the wafer and pellet release,
 *    an anchored E04 carrier, an adhesion link, a moving E07 Sunbead, the sample transfer);
 *  - negative controls: the Transfer one cell further, or a gesture one tick later, end elsewhere;
 *    a save that drops the held sample cannot complete the Transfer and ends elsewhere.
 */
import { describe, expect, it } from 'vitest';
import { applyNow, queueCommand, type CommandPayload, type CommandResult } from '../../src/sim/commands';
import { FLAG } from '../../src/sim/entities';
import { cellIndex } from '../../src/sim/grid';
import { checkLedger } from '../../src/sim/ledger';
import { fungalNeighbors, LINK_TRANSPORT } from '../../src/sim/links';
import { R } from '../../src/sim/reasons';
import { selectSample } from '../../src/sim/sample';
import { deserializeWorld, serializeWorld, stateHash, type WorldState } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { buildSaveFile, loadSaveFile } from '../../src/persistence/saveFile';
import { FakeClockHost } from '../helpers/host';
import { clearWater, linkFungal, place, placeWith, rebaseLedger, setField } from '../helpers/world';

/** The midpoint: the sample is taken here (paused) and the mid-run saves are written while it is held. */
const MID = 400;
const END = 800;
const RADIUS = 3;

let buildSeq = 0;
function cmd(w: World, payload: CommandPayload): void {
  const res = applyNow(w, `build-${++buildSeq}`, payload).result!;
  if (res.accepted <= 0) throw new Error(`setup command refused: ${JSON.stringify(payload)} → ${JSON.stringify(res)}`);
}

function patch(w: World, id: Parameters<typeof setField>[1], cx: number, cy: number, r: number, v: number): void {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) setField(w, id, cellIndex(cx + dx, cy + dy), v);
}

/** The hand-built dish at tick 0 (setup is labelled test state; the ledger is re-based afterwards). */
function build(): World {
  const w = clearWater({ mutationPreset: 'accelerated', lid: 'open' });
  cmd(w, { kind: 'paintSubstrate', substrate: 'gel', points: [[30, 50], [30, 70]], radius: 6 });
  cmd(w, { kind: 'placeStructure', structure: 'stone', points: [[64, 30]], radius: 1 });
  // Shade over the E07 Sunbeads so brighter cells exist beside them (light seeking needs a gradient).
  cmd(w, { kind: 'paintShade', erase: false, points: [[50, 75], [54, 75]], radius: 3 });
  cmd(w, { kind: 'placeStructure', structure: 'wall', points: [[74, 95], [86, 95]], radius: 1 });
  cmd(w, { kind: 'placeStructure', structure: 'bead', points: [[48, 88], [58, 88]], radius: 1 });
  patch(w, 'sugar', 60, 45, 5, 0.2);
  patch(w, 'sugar', 32, 72, 2, 0.3);
  patch(w, 'sugar', 66, 32, 2, 0.3);
  patch(w, 'sugar', 56, 60, 2, 0.3);
  patch(w, 'starch', 70, 58, 2, 0.4);
  patch(w, 'starchN', 70, 58, 2, 0.04);
  patch(w, 'oil', 80, 58, 2, 0.4);
  patch(w, 'oilN', 80, 58, 2, 0.04);
  patch(w, 'protein', 70, 70, 2, 0.4);
  patch(w, 'proteinN', 70, 70, 2, 0.04);
  patch(w, 'detritus', 29, 57, 2, 0.3);
  patch(w, 'detritusN', 29, 57, 2, 0.03);
  cmd(w, { kind: 'deposit', materialId: 'M09', points: [[81, 58]], radius: 1, dose: 0.5 });
  cmd(w, { kind: 'placeObject', materialId: 'M11', x: 66.5, y: 78.5 });
  // Film: B02 on gel; E10 Sprinters on sugar.
  for (let k = 0; k < 6; k++) place(w, 'B02', 27.5 + k, 48.5, { E: 60 });
  for (let k = 0; k < 4; k++) placeWith(w, 'B01', 31.5 + (k % 2), 71.5 + Math.floor(k / 2), ['E10'], { E: 60, B: 1.6 });
  // Fungi: F01 on debris; an F02 chain with transport links (donor first).
  for (let k = 0; k < 4; k++) place(w, 'F01', 27.5 + k, 57.5, { E: 60 });
  const f02 = [0, 1, 2, 3].map((k) => place(w, 'F02', 26.5 + k, 64.5, { E: 50, B: k === 0 ? 4 : 2, N: k === 0 ? 0.4 : 0.2 }));
  for (let k = 0; k + 1 < f02.length; k++) linkFungal(w, f02[k]!, f02[k + 1]!, LINK_TRANSPORT);
  // Phage on a Sprinter colony; Hitchers beside Sunbeads; E07 Sunbeads.
  for (let k = 0; k < 20; k++) place(w, 'B01', 57.5 + (k % 6), 43.5 + Math.floor(k / 6));
  cmd(w, { kind: 'inoculate', speciesId: 'V01', x: 60, y: 45, radius: 3, count: 20 });
  for (let k = 0; k < 8; k++) place(w, 'A01', 42.5 + 2 * (k % 4), 68.5 + 2 * Math.floor(k / 4));
  for (let k = 0; k < 3; k++) place(w, 'X01', 42.6 + 2 * k, 68.5);
  for (let k = 0; k < 3; k++) placeWith(w, 'A01', 50.5 + 2 * k, 74.5, ['E07']);
  // Producers on their deposits.
  for (let k = 0; k < 4; k++) place(w, 'B06', 69.5 + (k % 2), 57.5 + Math.floor(k / 2), { E: 60 });
  for (let k = 0; k < 4; k++) place(w, 'B07', 79.5 + (k % 2), 57.5 + Math.floor(k / 2), { E: 60 });
  for (let k = 0; k < 4; k++) place(w, 'B08', 69.5 + (k % 2), 69.5 + Math.floor(k / 2), { E: 60 });
  for (let k = 0; k < 4; k++) place(w, 'B04', 32.5, 55.5 + k);
  // E04 carriers beside the stone at (64, 30); E12 Sprinters in a cluster; two consumers.
  placeWith(w, 'B01', 66.5, 30.5, ['E04'], { E: 60 });
  placeWith(w, 'B01', 62.5, 30.5, ['E04'], { E: 60 });
  placeWith(w, 'B01', 64.5, 32.5, ['E04'], { E: 60 });
  for (let k = 0; k < 6; k++) placeWith(w, 'B01', 55.5 + 0.4 * (k % 3), 59.5 + 0.4 * Math.floor(k / 3), ['E12'], { E: 60 });
  place(w, 'P01', 52.5, 45.5, { E: 50 });
  place(w, 'P02', 74.5, 66.5, { E: 50 });
  rebaseLedger(w);
  return w;
}

let initial: WorldState | null = null;
/** The built dish as a plain save state (JSON round trip, as the host receives it). */
function initialState(): WorldState {
  initial ??= JSON.parse(JSON.stringify(serializeWorld(build()))) as WorldState;
  return JSON.parse(JSON.stringify(initial)) as WorldState;
}

/** What the player does (ticks at which the gesture is first possible). Sample gestures are added at MID. */
const PLAYER: ReadonlyArray<{ at: number; id: string; payload: CommandPayload; paused?: boolean }> = [
  { at: 0, id: 'protein-dose', payload: { kind: 'deposit', materialId: 'PROTEIN', points: [[70, 70]], radius: 2, dose: 0.5 } },
  { at: 45, id: 'pellet', payload: { kind: 'placeObject', materialId: 'M10', x: 88.5, y: 50.5 } },
  { at: 120, id: 'salt-stroke', payload: { kind: 'deposit', materialId: 'SALT', points: [[40, 90], [44, 91], [50, 92]], radius: 2, dose: 0.3 }, paused: true },
  { at: 210, id: 'add-cordweaver', payload: { kind: 'inoculate', speciesId: 'F02', x: 33.5, y: 66.5, radius: 3, count: 3 } },
  { at: 300, id: 'clean-water', payload: { kind: 'cleanWater', points: [[60, 45]], radius: 3, fraction: 0.5 } },
  { at: 520, id: 'gel-stroke', payload: { kind: 'paintSubstrate', substrate: 'gel', points: [[90, 70], [94, 74]], radius: 3 } },
  { at: 610, id: 'sugar-dose', payload: { kind: 'deposit', materialId: 'SUGAR', points: [[64, 64]], radius: 3, dose: 0.4 } },
];

const FRAMES_MS = [100, 37, 250, 16, 63, 180, 45];

interface Logged {
  readonly id: string;
  readonly tick: number;
  readonly payload: CommandPayload;
  readonly result: CommandResult | null;
}

let baseLog = -1;
/** The commands given after the build (the build's own setup commands are part of the initial state). */
function commandLog(w: World): Logged[] {
  if (baseLog < 0) baseLog = deserializeWorld(initialState()).commands.log.length;
  return w.commands.log.slice(baseLog).map((c) => ({ id: c.commandId, tick: c.targetTick, payload: c.payload, result: c.result ?? null }));
}

/**
 * The Sample gestures at the current moment of `w` (deterministic, from the world): the first living
 * organism whose All sample (radius 3) holds organisms and no split unit, transferred by the first
 * offset that a dry run on a copy accepts in full.
 */
function sampleGestures(w: World): { take: CommandPayload; transfer: CommandPayload } {
  const c = w.ents.cols;
  const offsets: ReadonlyArray<readonly [number, number]> = [[0, 14], [14, 0], [0, -14], [-14, 0], [10, 10]];
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    const x = Math.floor(c.x[i]!) + 0.5;
    const y = Math.floor(c.y[i]!) + 0.5;
    const sel = selectSample(w, x, y, RADIUS, 'all');
    if (sel.slots.length < 2 || sel.missing.length > 0) continue;
    const take: CommandPayload = { kind: 'sampleTake', x, y, radius: RADIUS, mode: 'all' };
    for (const [dx, dy] of offsets) {
      const dry = deserializeWorld(serializeWorld(w));
      if ((applyNow(dry, 'dry-take', take).result?.accepted ?? 0) <= 0) break;
      const res = applyNow(dry, 'dry-transfer', { kind: 'sampleTransfer', dx, dy }).result;
      if (res && res.accepted > 0 && res.rejected === 0 && dry.sample === null) return { take, transfer: { kind: 'sampleTransfer', dx, dy } };
    }
  }
  throw new Error('no samplable point with a valid transfer');
}

let beginReq = 5000;
function sampleBegin(h: FakeClockHost, dishId: string): void {
  const requestId = ++beginReq;
  h.host.handle({ type: 'sampleBegin', requestId, dishId });
  if (!h.out.some((m) => m.type === 'sampleBegun' && m.requestId === requestId)) throw new Error(`sampleBegin refused: ${JSON.stringify(h.errors())}`);
}

interface Session {
  readonly log: readonly Logged[];
  readonly acks: ReadonlyArray<CommandResult | null>;
  readonly finalTick: number;
  readonly hash: string;
  readonly midHash: string;
  readonly maxTicksPerPump: number;
}

let session4x: Session | null = null;

/** The player session on the worker host at 4×: gestures between irregular frames, the Sample at MID. */
function playerSessionAt4x(): Session {
  if (session4x) return session4x;
  const h = new FakeClockHost();
  h.create('g3', { kind: 'state', state: initialState() });
  const acks: Array<CommandResult | null> = [];
  let next = 0;
  let sampled = false;
  let midHash = '';
  const deliverDue = () => {
    while (next < PLAYER.length && PLAYER[next]!.at <= h.tick) {
      const g = PLAYER[next++]!;
      if (g.paused) h.setSpeed(0);
      acks.push(h.command(g.id, g.payload));
      if (g.paused) h.setSpeed(4);
    }
    if (!sampled && h.tick >= MID) {
      sampled = true;
      // Begin pauses (host-level, D-0037); the take is not an undo point; Transfer is.
      sampleBegin(h, 'g3');
      const s = sampleGestures(h.world);
      acks.push(h.command('sample-take', s.take, false));
      expect(h.world.sample).not.toBeNull();
      acks.push(h.command('sample-transfer', s.transfer));
      expect(h.world.sample).toBeNull();
      midHash = h.hash();
      h.setSpeed(4);
    }
  };
  deliverDue();
  h.setSpeed(4);
  for (let f = 0; h.tick < END; f++) {
    deliverDue();
    h.pump(FRAMES_MS[f % FRAMES_MS.length]!);
  }
  h.setSpeed(0);
  expect(next).toBe(PLAYER.length);
  expect(sampled).toBe(true);
  expect(h.errors()).toEqual([]);
  session4x = { log: commandLog(h.world), acks, finalTick: h.tick, hash: h.hash(), midHash, maxTicksPerPump: h.maxTicksPerPump };
  return session4x;
}

/** Deliver logged commands on a host at exactly their logged ticks (Begin before a take), running until `until`. */
function playLog(h: FakeClockHost, dishId: string, log: readonly Logged[], start: number, until: number, acks: Array<CommandResult | null>, speed: 1 | 4): number {
  let next = start;
  for (;;) {
    while (next < log.length && log[next]!.tick === h.tick) {
      const c = log[next++]!;
      if (c.payload.kind === 'sampleTake') sampleBegin(h, dishId);
      acks.push(h.command(c.id, c.payload, c.payload.kind !== 'sampleTake'));
      if (c.payload.kind === 'sampleTransfer') h.setSpeed(speed);
    }
    if (h.tick >= until) return next;
    if (next < log.length && log[next]!.tick < h.tick) throw new Error(`missed command ${log[next]!.id} at tick ${log[next]!.tick}`);
    h.advanceTo(next < log.length ? Math.min(until, log[next]!.tick) : until);
  }
}

/** A fresh headless copy of the built dish with `log` queued for its target ticks (the replay path). */
function queuedWorld(log: readonly Logged[]): World {
  const w = deserializeWorld(initialState());
  for (const c of log) queueCommand(w, c.id, c.payload, c.tick);
  return w;
}

/** Headless run applying `log` as paused edits at its ticks, from `w` until `until` (inclusive of commands at `until` only when `applyAtUntil`). */
function editsTo(w: World, log: readonly Logged[], start: number, until: number, stopBefore?: (c: Logged) => boolean): number {
  let next = start;
  for (;;) {
    while (next < log.length && log[next]!.tick === w.tick) {
      if (stopBefore?.(log[next]!)) return next;
      const c = log[next++]!;
      expect(applyNow(w, c.id, c.payload).result ?? null).toEqual(c.result);
    }
    if (w.tick >= until) return next;
    step(w);
  }
}

interface Seen {
  filmMax: number;
  fungalTransfer: number;
  infections: number;
  drainTicks: number;
  conversions: { starch: number; oil: number; protein: number };
  objectReleased: number;
  anchoredMax: number;
  adhesionLinks: number;
  e07MovingTicks: number;
  lyses: number;
}

/** Observe, read-only, a 1-tick replay of the session's log (also returns the end hash). */
function observedReplay(log: readonly Logged[], until: number): { hash: string; seen: Seen; ledgerOk: boolean; w: World } {
  const w = queuedWorld(log);
  const seen: Seen = { filmMax: 0, fungalTransfer: 0, infections: 0, drainTicks: 0, conversions: { starch: 0, oil: 0, protein: 0 }, objectReleased: 0, anchoredMax: 0, adhesionLinks: 0, e07MovingTicks: 0, lyses: 0 };
  const c = w.ents.cols;
  const x01 = w.species.findIndex((s) => s.id === 'X01');
  const a01 = w.species.findIndex((s) => s.id === 'A01');
  const e07 = w.modules.E07 !== undefined;
  const objC0 = w.objects.reduce((s, o) => s + (o.pools.sugar ?? 0) + (o.pools.starch ?? 0), 0);
  let objIn = 0;
  let lastEvent = w.counters.nextEventId - 1;
  let ledgerOk = true;
  while (w.tick < until) {
    const ids0 = new Set(w.objects.map((o) => o.id));
    step(w, {
      afterStage: (stage, world) => {
        if (stage === 5) {
          for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && c.infectedBy[i] !== 0) seen.infections++;
        } else if (stage === 6) {
          for (let i = 0; i < world.ents.highWater; i++) {
            if (c.alive[i] !== 1) continue;
            if (c.species[i] === x01 && c.hostSlot[i]! >= 0 && c.lastIntakeTick[i] === world.tick) seen.drainTicks++;
            if (e07 && c.species[i] === a01 && (c.flags[i]! & FLAG.moving) !== 0) seen.e07MovingTicks++;
          }
        } else if (stage === 8) {
          seen.fungalTransfer = Math.max(seen.fungalTransfer, world.history.pendingFungalTransfer ?? 0);
        }
      },
    });
    // Objects placed this tick (the pellet) count as input, not release.
    for (const o of w.objects) if (!ids0.has(o.id)) objIn += (o.pools.sugar ?? 0) + (o.pools.starch ?? 0);
    const after = w.objects.reduce((s, o) => s + (o.pools.sugar ?? 0) + (o.pools.starch ?? 0), 0);
    seen.objectReleased = Math.max(seen.objectReleased, objC0 + objIn - after);
    let film = 0;
    const f = w.fields.film!;
    for (let k = 0; k < f.length; k++) film += f[k]!;
    seen.filmMax = Math.max(seen.filmMax, film);
    let anchored = 0;
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.anchorState[i] === 1) anchored++;
    seen.anchoredMax = Math.max(seen.anchoredMax, anchored);
    for (const e of w.events.ring) {
      if (e.id <= lastEvent) continue;
      if (e.type === 'linkFormed' && e.detail?.kind === 'adhesion') seen.adhesionLinks++;
      if (e.type === 'death' && e.cause === R.DEATH_LYSIS) seen.lyses++;
    }
    lastEvent = w.counters.nextEventId - 1;
    if (w.tick % 100 === 0 && !checkLedger(w).ok) ledgerOk = false;
  }
  seen.conversions = { starch: w.conversionTotals.starch, oil: w.conversionTotals.oil, protein: w.conversionTotals.protein };
  return { hash: stateHash(w), seen, ledgerOk: ledgerOk && checkLedger(w).ok, w };
}

describe('G3 determinism — a Phase-3-heavy dish through the worker host at 1× and 4×', () => {
  it('the built dish holds every Phase 3 system and module the fixture names', () => {
    const w = deserializeWorld(initialState());
    for (const id of ['film', 'fungi', 'viruses', 'parasites', 'enzymes', 'foodObjects', 'chemistry']) expect(w.content.manifest.enabledSystems).toContain(id);
    for (const id of ['E04', 'E07', 'E10', 'E12']) expect(w.modules[id]).toBeDefined();
    expect(w.objects.map((o) => o.kind)).toEqual(['wafer']);
    const f02 = w.species.findIndex((sp) => sp.id === 'F02');
    let linked = 0;
    for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1 && w.ents.cols.species[i] === f02) linked += fungalNeighbors(w, i, LINK_TRANSPORT).length;
    expect(linked).toBe(6);
  });

  it('a 4× session with irregular frames applies every gesture, the Sample included', () => {
    const s = playerSessionAt4x();
    expect(s.log.map((c) => c.id)).toEqual([...PLAYER.slice(0, 5).map((g) => g.id), 'sample-take', 'sample-transfer', ...PLAYER.slice(5).map((g) => g.id)]);
    expect(s.log.map((c) => c.result)).toEqual(s.acks);
    console.info(`determinism-g3: results ${JSON.stringify(s.log.map((c) => [c.id, c.tick, c.result]))}`);
    for (const c of s.log) expect(c.result?.accepted ?? 0).toBeGreaterThan(0);
    const take = s.log.find((c) => c.id === 'sample-take')!;
    const transfer = s.log.find((c) => c.id === 'sample-transfer')!;
    expect(take.tick).toBe(transfer.tick);
    expect(take.tick).toBeGreaterThanOrEqual(MID);
    expect(s.maxTicksPerPump).toBeGreaterThanOrEqual(8);
    expect(s.finalTick).toBeGreaterThanOrEqual(END);
    console.info(`determinism-g3: 4× session → tick ${s.finalTick}, hash ${s.hash}; commands at ticks ${s.log.map((c) => c.tick).join(', ')}; max ${s.maxTicksPerPump} ticks/frame`);
  });

  it('replaying the host command log at 1× (one tick per frame) reaches the identical state hash', () => {
    const s = playerSessionAt4x();
    const h = new FakeClockHost();
    h.create('g3-1x', { kind: 'state', state: initialState() });
    h.setSpeed(1);
    const acks: Array<CommandResult | null> = [];
    expect(playLog(h, 'g3-1x', s.log, 0, s.finalTick, acks, 1)).toBe(s.log.length);
    h.setSpeed(0);
    expect(h.maxTicksPerPump).toBe(1);
    expect(h.tick).toBe(s.finalTick);
    expect(commandLog(h.world)).toEqual(s.log);
    expect(acks).toEqual(s.acks);
    expect(h.hash()).toBe(s.hash);
    expect(h.errors()).toEqual([]);
    console.info(`determinism-g3: 1× host replay hash ${h.hash()} == 4× ${s.hash}`);
  });

  it('the headless stage-1 queue replay matches the host in 1-tick steps and in observed 4-tick chunks, and every mechanism acted', () => {
    const s = playerSessionAt4x();
    const one = observedReplay(s.log, s.finalTick);
    const four = queuedWorld(s.log);
    while (four.tick < s.finalTick) {
      const n = Math.min(4, s.finalTick - four.tick);
      for (let k = 0; k < n; k++) step(four);
      stateHash(four); // observing must not perturb
      if (four.tick % 40 === 0) serializeWorld(four);
    }
    console.info(`determinism-g3: headless 1-tick ${one.hash}, 4-tick chunks ${stateHash(four)}, host 4× ${s.hash}`);
    expect(one.hash).toBe(s.hash);
    expect(stateHash(four)).toBe(s.hash);
    expect(commandLog(one.w)).toEqual(s.log);
    expect(one.ledgerOk).toBe(true);
    const seen = one.seen;
    console.info(`determinism-g3: mechanisms seen ${JSON.stringify(seen)}`);
    expect(seen.filmMax).toBeGreaterThan(0);
    expect(seen.fungalTransfer).toBeGreaterThan(0);
    expect(seen.infections).toBeGreaterThan(0);
    expect(seen.drainTicks).toBeGreaterThan(0);
    expect(seen.conversions.starch).toBeGreaterThan(0);
    expect(seen.conversions.oil).toBeGreaterThan(0);
    expect(seen.conversions.protein).toBeGreaterThan(0);
    expect(seen.objectReleased).toBeGreaterThan(0);
    expect(seen.anchoredMax).toBeGreaterThan(0);
    expect(seen.adhesionLinks).toBeGreaterThan(0);
    expect(seen.e07MovingTicks).toBeGreaterThan(0);
  });
});

describe('G3 determinism — mid-run save and reload with a held sample', () => {
  it('save file: take the sample at the midpoint → buildSaveFile while held → loadSaveFile → Transfer → continue equals the uninterrupted session', async () => {
    const s = playerSessionAt4x();
    const take = s.log.findIndex((c) => c.id === 'sample-take');
    const w = deserializeWorld(initialState());
    // Paused edits up to and including the take.
    const next = editsTo(w, s.log, 0, s.log[take]!.tick, (c) => c.id === 'sample-transfer');
    expect(next).toBe(take + 1);
    expect(w.sample).not.toBeNull();
    const heldHash = stateHash(w);
    const built = await buildSaveFile(w, { name: 'held sample', savedAt: '2026-01-01T00:00:00.000Z' });
    const { world: reloaded } = await loadSaveFile(built.text);
    expect(reloaded.tick).toBe(s.log[take]!.tick);
    expect(reloaded.sample).not.toBeNull();
    expect(stateHash(reloaded)).toBe(heldHash);
    editsTo(reloaded, s.log, next, s.finalTick);
    expect(reloaded.tick).toBe(s.finalTick);
    expect(commandLog(reloaded)).toEqual(s.log);
    expect(stateHash(reloaded)).toBe(s.hash);
    expect(checkLedger(reloaded).ok).toBe(true);
    console.info(`determinism-g3: reload at tick ${s.log[take]!.tick} (sample held) → ${stateHash(reloaded)} == ${s.hash}`);
  });

  it("host: the host's own save with the sample held, opened as a new dish, then Transfer and 4× equals the session", () => {
    const s = playerSessionAt4x();
    const take = s.log.findIndex((c) => c.id === 'sample-take');
    const h = new FakeClockHost();
    h.create('before', { kind: 'state', state: initialState() });
    h.setSpeed(4);
    const acks: Array<CommandResult | null> = [];
    // Run to the take's tick, deliver everything before it, then Begin + take only.
    let next = playLog(h, 'before', s.log.slice(0, take), 0, s.log[take]!.tick, acks, 4);
    expect(next).toBe(take);
    h.setSpeed(0);
    sampleBegin(h, 'before');
    acks.push(h.command(s.log[take]!.id, s.log[take]!.payload, false));
    next++;
    expect(h.world.sample).not.toBeNull();
    const json = h.save();
    const heldHash = h.hash();
    const h2 = new FakeClockHost();
    h2.create('after', { kind: 'state', state: JSON.parse(json) as WorldState });
    expect(h2.hash()).toBe(heldHash);
    expect(h2.world.sample).not.toBeNull();
    // Still paused with the sample held: playLog delivers the Transfer first, then runs at 4×.
    expect(playLog(h2, 'after', s.log, next, s.finalTick, acks, 4)).toBe(s.log.length);
    h2.setSpeed(0);
    expect(acks).toEqual(s.acks);
    expect(commandLog(h2.world)).toEqual(s.log);
    expect(h2.hash()).toBe(s.hash);
    expect(h.errors()).toEqual([]);
    expect(h2.errors()).toEqual([]);
  });
});

describe('G3 determinism — negative controls', () => {
  it('the Transfer one cell further ends in a different state', () => {
    const s = playerSessionAt4x();
    const moved = s.log.map((c) => (c.payload.kind === 'sampleTransfer' ? { ...c, payload: { ...c.payload, dx: c.payload.dx + 1 } } : c));
    const w = queuedWorld(moved);
    while (w.tick < s.finalTick) step(w);
    expect(stateHash(w)).not.toBe(s.hash);
  });

  it('the Clean water stroke one tick later ends in a different state', () => {
    const s = playerSessionAt4x();
    const shifted = s.log.map((c) => (c.id === 'clean-water' ? { ...c, tick: c.tick + 1 } : c));
    const w = queuedWorld(shifted);
    while (w.tick < s.finalTick) step(w);
    expect(stateHash(w)).not.toBe(s.hash);
  });

  it('a save that loses the held sample cannot complete the Transfer and ends elsewhere', () => {
    const s = playerSessionAt4x();
    const take = s.log.findIndex((c) => c.id === 'sample-take');
    const w = deserializeWorld(initialState());
    editsTo(w, s.log, 0, s.log[take]!.tick, (c) => c.id === 'sample-transfer');
    const state = JSON.parse(JSON.stringify(serializeWorld(w))) as WorldState & { sample: unknown };
    state.sample = null;
    const lost = deserializeWorld(state);
    const res = applyNow(lost, 'sample-transfer', s.log[take + 1]!.payload).result;
    expect(res?.accepted ?? 0).toBe(0);
    while (lost.tick < s.finalTick) step(lost);
    expect(stateHash(lost)).not.toBe(s.hash);
  });
});
