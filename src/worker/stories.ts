/**
 * Story cards in the worker (P4.2; SPEC §12.7, D08 §07; D-0070): the detector that turns recorded events
 * and observation into notebook cards, and the pacer that offers at most one notification per 60
 * simulated seconds.
 *
 * Where it runs: NotebookWatch (notebookWatch.ts) constructs one per played dish and calls `afterTick`
 * once after every step and after each accepted command. Never for a comparison or experiment arm, never
 * during a rollback replay, never in src/sim.
 *
 * Observation only: it reads the event ring, the reaction ledger, lineage records, branch records,
 * regional trait samples and the command log. It writes nothing into the world, draws no randomness and
 * adds no event or command; its only output is the notebook record (through NotebookRef) and the
 * changes it returns. Its working state (the last event read, the waiting place changes, the pacer) is
 * rebuilt from the world and the record whenever the world it watches is replaced (Undo, rollback,
 * reload), so a card is never invented from events of an undone timeline.
 *
 * The four templates (D08 lines 130–145) and their evidence:
 * - firstSplit: a committed 'birth' event, the first of its species in this dish, or the first split of
 *   a followed family's root (key by root). Evidence: the event id; the summary keeps parent and
 *   daughters and the recorded values of a changed locus while lineage records hold them.
 * - enzymeAtWork: once per whole second, a recorded conversion (reactionInDish > 0) for an enzyme; key
 *   enzyme + the region of the cell that converted most. Evidence: the reaction id with that cell's
 *   recorded amount. A producer is named only when producersNear finds one (D-0051).
 * - familyChanged: a 'branchEstablished' event. Evidence: the event id and the branch id; the summary
 *   keeps the branch record's difference and the two genomes' rule numbers (its tradeoff).
 * - placeChanged: an accepted placement command (Add Life, Feed, a food object) followed by a regional
 *   trait sample at least 60 s later; a card only when a species' count in that region differs from the
 *   last sample at or before the command. Evidence: the command seq and both samples.
 */
import { CELL_COUNT, GRID_W, TICKS_PER_SECOND } from '@sim/constants';
import { buildLineage, recordField } from '@sim/lineage';
import { MUT_MODULE_GAIN, MUT_MODULE_LOSS, MUT_POLICY_ESTABLISHED, MUT_PREF, MUT_QUANT } from '@sim/mutation';
import { lastCompleteSecond, reactionInCell, reactionInDish, REACTION_ENZYMES } from '@sim/reactions';
import { isIntervention } from '@sim/specimens';
import { quarterOf, TRAIT_REGIONS, type TraitSample } from '@sim/history';
import type { Command } from '@sim/commands';
import type { SimEvent } from '@sim/events';
import type { World } from '@sim/world';
import type { NotebookRecord } from '@persist/notebook';
import {
  addStory,
  nextStoryId,
  storyCardProblem,
  storyEventTick,
  storyNumber,
  STORY_EVIDENCE_MAX,
  STORY_WINDOW_TICKS,
  type DaughterChange,
  type EnzymeSummary,
  type FamilySummary,
  type FirstSplitSummary,
  type PlaceCommand,
  type PlaceSummary,
  type StoryCard,
  type StoryRegion,
  type StoryRuleset,
  type StoryTemplate,
} from '@persist/notebookStories';
import { producersNear } from './snapshot';
import type { NotebookChange } from './protocol';

/** Where the dish keeps its notebook record (notebookWatch.ts NotebookRef). */
interface StoryRef {
  get(): NotebookRecord;
  set(record: NotebookRecord): void;
}

/**
 * Tests only: turn detection off (NotebookWatch then builds no detector), to show that story cards never
 * alter behaviour (the same run with and without them has the same stateHash).
 */
export const storyDetection = { enabled: true };

/** A dish's cards (a record written before P4.2 has none). */
export function storiesOf(record: NotebookRecord): readonly StoryCard[] {
  return record.stories ?? [];
}

// ---------------------------------------------------------------------------------------------------
// Pacing
// ---------------------------------------------------------------------------------------------------

/**
 * The card to notify among `waiting` (D08 "Prefer a favorite-family event, then the first unseen
 * template, then the earliest event"): a followed family's card first; then a card whose template the
 * player has not seen yet in this dish (no card of it opened or already announced); then the earliest
 * event (storyEventTick, then creation order). Seen or dismissed cards are never offered.
 */
export function pickStory(waiting: readonly StoryCard[], all: readonly StoryCard[]): StoryCard | null {
  const open = waiting.filter((c) => !c.seen && !c.dismissed);
  if (open.length === 0) return null;
  const seenTemplates = new Set<StoryTemplate>(all.filter((c) => c.seen || c.notified).map((c) => c.template));
  const rank = (c: StoryCard) => (c.favoriteId !== null ? 0 : 2) + (seenTemplates.has(c.template) ? 1 : 0);
  return [...open].sort(
    (a, b) => rank(a) - rank(b) || storyEventTick(a) - storyEventTick(b) || storyNumber(a.id) - storyNumber(b.id),
  )[0]!;
}

/**
 * At most one new card notification per STORY_WINDOW_TICKS (600 ticks = 60 simulated seconds; D08
 * line 151, CT §12.10), in dish ticks, so the same run paces the same way at any speed. Cards found while
 * the window is closed wait; when it opens, one is chosen (pickStory) and the rest stay in the notebook
 * quietly (they are never notified later). StoryDetector.bind starts every pacer with its window closed
 * at the watch's start tick (D-0079); `null` (open at once) is for unit tests of the pacer alone.
 */
export class StoryPacer {
  private waiting: string[] = [];
  constructor(private lastNotify: number | null) {}

  /** A new card asks to be announced. */
  offer(id: string): void {
    if (!this.waiting.includes(id)) this.waiting.push(id);
  }

  get pending(): readonly string[] {
    return this.waiting;
  }

  /** The card to notify at `tick` (null: none now). Clears the waiting list when it picks. */
  next(tick: number, all: readonly StoryCard[]): string | null {
    if (this.waiting.length === 0) return null;
    if (this.lastNotify !== null && tick - this.lastNotify < STORY_WINDOW_TICKS) return null;
    const waiting = all.filter((c) => this.waiting.includes(c.id));
    this.waiting = [];
    const pick = pickStory(waiting, all);
    if (pick === null) return null;
    this.lastNotify = tick;
    return pick.id;
  }
}

// ---------------------------------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------------------------------

/** A placement waiting for its later trait sample. */
interface PendingPlace {
  readonly seq: number;
  readonly tick: number;
  readonly command: PlaceCommand;
  readonly what: string;
  readonly accepted: number;
  readonly x: number;
  readonly y: number;
  readonly region: number;
}

function regionName(q: number): StoryRegion {
  return TRAIT_REGIONS[q] as StoryRegion;
}

/** The position a placement command names (a deposit stroke: the mean of its points), or null. */
function placeOf(cmd: Command): Omit<PendingPlace, 'seq' | 'tick' | 'region'> | null {
  const p = cmd.payload;
  const accepted = cmd.result?.accepted ?? 0;
  if (accepted <= 0) return null;
  if (p.kind === 'inoculate') return { command: 'inoculate', what: p.speciesId, accepted, x: p.x, y: p.y };
  if (p.kind === 'placeObject') return { command: 'placeObject', what: p.materialId, accepted, x: p.x, y: p.y };
  if (p.kind === 'deposit' && p.points.length > 0) {
    let x = 0;
    let y = 0;
    for (const [px, py] of p.points) {
      x += px;
      y += py;
    }
    return { command: 'deposit', what: p.materialId, accepted, x: x / p.points.length, y: y / p.points.length };
  }
  return null;
}

/** Whether an accepted command changed the dish (names, pins and saved specimens are notebook labels). */
function isChange(cmd: Command): boolean {
  if ((cmd.result?.accepted ?? 0) <= 0) return false;
  return cmd.payload.kind !== 'lineage' || isIntervention(cmd.payload);
}

/** Every recorded regional trait sample, oldest first (compacted minutes, then the 10-second window). */
function traitSamples(world: World): readonly TraitSample[] {
  const t = world.history.traits;
  return t.minutes.length === 0 ? t.recent : [...t.minutes, ...t.recent];
}

/** Living count per species index in region `q` of one sample. */
function regionCounts(sample: TraitSample, q: number, nSp: number): number[] {
  const out = new Array<number>(nSp).fill(0);
  for (const r of sample.rows) if (r[0] === q && r[1]! < nSp) out[r[1]!] = r[2]!;
  return out;
}

/** Whether `birthId` is `root` or descends from it through recorded parents (bounded walk). */
function descendsFrom(world: World, birthId: number, root: number): boolean {
  let b = birthId;
  for (let k = 0; k < 100_000 && b > 0; k++) {
    if (b === root) return true;
    if (b < root) return false; // a parent is always born before its child
    const p = recordField(world.lineage, 'parent', b);
    if (p === undefined) return false;
    b = p;
  }
  return false;
}

/** The species that had a committed birth recorded in this dish before now (history, lineage, live generations). */
function speciesWithBirths(world: World): Uint8Array {
  const n = world.species.length;
  const had = new Uint8Array(n);
  const h = world.history;
  for (const list of [h.seconds, h.minutes])
    for (const s of list)
      for (let k = 0; k < n; k++) if ((s.births[k] ?? 0) > 0) had[k] = 1;
  for (let k = 0; k < n; k++) if ((h.pendingBirths[k] ?? 0) > 0) had[k] = 1;
  const L = world.lineage;
  for (let i = 0; i < L.species.length; i++) if (L.origin[i] === 0) had[L.species[i]!] = 1;
  for (const r of L.kept ?? []) if (r.origin === 0) had[r.species] = 1;
  const c = world.ents.cols;
  for (let i = 0; i < world.ents.highWater; i++) if (c.alive[i] === 1 && c.generation[i]! > 0) had[c.species[i]!] = 1;
  return had;
}

/** Whether an evidence id exists in `world` as it is now (an undone or not yet reached one does not). */
export function evidenceInWorld(world: World, id: string): boolean {
  const [kind, a, b] = id.split(':');
  switch (kind) {
    case 'event':
      return Number(a) < world.counters.nextEventId;
    case 'command':
      return Number(a) < world.commands.nextSeq;
    case 'branch':
      return Number(a) < world.branches.branches.length;
    case 'reaction':
      return (Number(b) + 1) * TICKS_PER_SECOND <= world.tick;
    case 'traits':
      return Number(b) * TICKS_PER_SECOND <= world.tick;
    default:
      return false;
  }
}

/**
 * After Undo or a rollback (notebookWatch.ts notebookAfterRestore): cards are kept like the journal
 * (D-0031), but only what the restored dish recorded. A card whose first evidence is not in the restored
 * dish (it was found in the undone time) goes; a card that later evidence joined keeps only the evidence
 * the restored dish has, and its time range ends no later than the restored time.
 */
export function storiesAfterRestore(world: World, record: NotebookRecord): { record: NotebookRecord; removed: number; changed: boolean } {
  const list = storiesOf(record);
  if (list.length === 0) return { record, removed: 0, changed: false };
  let changed = false;
  let removed = 0;
  const out: StoryCard[] = [];
  for (const c of list) {
    if (!evidenceInWorld(world, c.evidence[0]!)) {
      removed++;
      changed = true;
      continue;
    }
    const evidence = c.evidence.filter((e) => evidenceInWorld(world, e));
    const to = Math.max(c.timeRange[0], Math.min(c.timeRange[1], world.tick));
    if (evidence.length !== c.evidence.length || to !== c.timeRange[1]) {
      changed = true;
      out.push({ ...c, evidence, timeRange: [c.timeRange[0], to] });
    } else out.push(c);
  }
  return changed ? { record: { ...record, stories: out }, removed, changed } : { record, removed: 0, changed: false };
}

/** Lineage records of one daughter compared with its parent's recorded genome: the changes it carries. */
function daughterChanges(world: World, parent: number, daughter: number): DaughterChange[] | null {
  const L = world.lineage;
  const flags = recordField(L, 'mutFlags', daughter);
  const dg = recordField(L, 'genome', daughter);
  const pg = recordField(L, 'genome', parent);
  if (flags === undefined || dg === undefined) return null;
  const out: DaughterChange[] = [];
  const base = { daughter, locus: -1, from: -1, to: -1, module: null, moduleName: null };
  if (flags & MUT_QUANT) {
    const locus = recordField(L, 'mutLocus', daughter) ?? -1;
    if (locus >= 0 && pg !== undefined) {
      const from = world.genomes.get(pg).loci[locus];
      const to = world.genomes.get(dg).loci[locus];
      if (from !== undefined && to !== undefined && from !== to) out.push({ ...base, kind: 'locus', locus, from, to });
    } else if (locus >= 0) return null;
  }
  if (flags & (MUT_MODULE_GAIN | MUT_MODULE_LOSS)) {
    const m = recordField(L, 'mutModule', daughter) ?? -1;
    const def = m >= 0 ? world.content.modules[m] : undefined;
    if (def) out.push({ ...base, kind: flags & MUT_MODULE_GAIN ? 'gained' : 'lost', module: def.id, moduleName: def.name });
  }
  if (flags & MUT_POLICY_ESTABLISHED) out.push({ ...base, kind: 'policy' });
  else if (flags & MUT_PREF) out.push({ ...base, kind: 'preference' });
  return out;
}

export class StoryDetector {
  private world: World | null = null;
  private lastEvent = 0;
  private lastSecond = -1;
  private hadBirth: Uint8Array = new Uint8Array(0);
  private pending: PendingPlace[] = [];
  private pacer = new StoryPacer(null);

  constructor(
    world: World,
    private readonly ref: StoryRef,
  ) {
    this.bind(world);
  }

  /** Watch `world`: the working state is rebuilt only when it is a different world (Undo, rollback, reload). */
  rebind(world: World): void {
    if (world !== this.world) this.bind(world);
  }

  /** Rebuild the working state for `world` (new, restored or reloaded) from it and the record. */
  private bind(world: World): void {
    this.world = world;
    // Whatever replaced the world (Undo, rollback, a reload), the record keeps only what this world
    // recorded: the host's restore step (notebookAfterRestore) already did this and announced it, so this
    // is a no-op there; it guards every other path that rebinds the watch to an earlier world.
    const kept = storiesAfterRestore(world, this.ref.get());
    if (kept.changed) this.ref.set(kept.record);
    this.lastEvent = world.counters.nextEventId - 1;
    this.lastSecond = lastCompleteSecond(world);
    this.hadBirth = speciesWithBirths(world);
    const cards = storiesOf(this.ref.get());
    // D-0079 (first minute): the window starts closed at the tick the watch began on this world, whatever
    // began it (a new dish, an opened, loaded, continued, duplicated or branched one, Undo, a rollback, a
    // reload), so the first notification comes no sooner than STORY_WINDOW_TICKS later; the first minute
    // belongs to the arrival line and the optional prompts (UX §3.2). Cards found meanwhile are recorded
    // quietly and wait; pickStory chooses among them when it opens. The pacer's clock is not saved.
    this.pacer = new StoryPacer(world.tick);
    this.pending = [];
    // Placements whose later sample is not recorded yet are waited for again (e.g. Feed before the first Play).
    const samples = traitSamples(world);
    const lastSample = samples.length > 0 ? samples[samples.length - 1]!.second * TICKS_PER_SECOND : -1;
    const used = new Set<string>();
    for (const c of cards) for (const e of c.evidence) used.add(e);
    for (const cmd of world.commands.log) {
      if (lastSample >= cmd.targetTick + STORY_WINDOW_TICKS || used.has(`command:${cmd.seq}`)) continue;
      this.notePlace(cmd);
    }
  }

  /** Call once after every step of the watched world and after each accepted command. */
  afterTick(world: World): NotebookChange[] {
    if (world !== this.world) {
      this.bind(world);
      return [];
    }
    const changes: NotebookChange[] = [];
    const ring = world.events.ring;
    let start = ring.length;
    while (start > 0 && ring[start - 1]!.id > this.lastEvent) start--;
    for (let k = start; k < ring.length; k++) this.onEvent(world, ring[k]!, changes);
    this.lastEvent = world.counters.nextEventId - 1;
    const sec = lastCompleteSecond(world);
    if (sec > this.lastSecond) {
      this.lastSecond = sec;
      this.enzymes(world, sec, changes);
    }
    if (this.pending.length > 0) this.places(world, changes);
    const id = this.pacer.next(world.tick, storiesOf(this.ref.get()));
    if (id !== null) {
      this.update(id, (c) => ({ ...c, notified: true }));
      changes.push({ kind: 'story', id, notify: true });
    }
    return changes;
  }

  private onEvent(world: World, ev: SimEvent, changes: NotebookChange[]): void {
    if (ev.type === 'birth') this.onBirth(world, ev, changes);
    else if (ev.type === 'branchEstablished') this.onBranch(world, ev, changes);
    else if (ev.type === 'command') {
      const seq = Number(ev.detail?.seq ?? 0);
      if (Number(ev.detail?.accepted ?? 0) <= 0 || !(seq > 0)) return;
      const log = world.commands.log;
      for (let k = log.length - 1; k >= 0; k--) {
        if (log[k]!.seq === seq) {
          this.notePlace(log[k]!);
          break;
        }
        if (log[k]!.seq < seq) break;
      }
    }
  }

  private activeFavorites(): readonly { readonly id: string; readonly rootBirthId: number }[] {
    return this.ref.get().favorites.filter((f) => f.active);
  }

  private favoriteOf(world: World, birthId: number): string | null {
    for (const f of this.activeFavorites()) if (descendsFrom(world, birthId, f.rootBirthId)) return f.id;
    return null;
  }

  private onBirth(world: World, ev: SimEvent, changes: NotebookChange[]): void {
    const s = ev.species ?? -1;
    const sp = world.species[s];
    const d = ev.detail ?? {};
    const parent = Number(d.parent ?? 0);
    const a = Number(d.daughterA ?? 0);
    const b = Number(d.daughterB ?? 0);
    if (!sp || !(parent > 0) || !(a > 0) || !(b > 0)) return;
    const firstOfSpecies = this.hadBirth[s] === 0;
    this.hadBirth[s] = 1;
    const familyRoot = this.activeFavorites().find((f) => f.rootBirthId === parent);
    if (!firstOfSpecies && !familyRoot) return;
    const key = firstOfSpecies ? `firstSplit:${sp.id}` : `firstSplit:root-${parent}`;
    const changedA = Number(d.changedA ?? 0) === 1 ? 1 : 0;
    const changedB = Number(d.changedB ?? 0) === 1 ? 1 : 0;
    let recorded = true;
    const list: DaughterChange[] = [];
    for (const [daughter, changed] of [
      [a, changedA],
      [b, changedB],
    ] as const) {
      if (!changed) continue;
      const got = daughterChanges(world, parent, daughter);
      if (got === null) recorded = false;
      else list.push(...got);
    }
    const summary: FirstSplitSummary = {
      species: sp.id,
      parent,
      daughterA: a,
      daughterB: b,
      changedA,
      changedB,
      parentBirthTick: recordField(world.lineage, 'birthTick', parent) ?? -1,
      splitTick: ev.tick,
      cell: ev.cell ?? 0,
      familyRoot: familyRoot ? parent : 0,
      recorded,
      changes: list.slice(0, 8),
    };
    const from = summary.parentBirthTick >= 0 ? Math.min(summary.parentBirthTick, ev.tick) : ev.tick;
    this.record(world, 'firstSplit', key, [`event:${ev.id}`], summary, from, ev.tick, familyRoot?.id ?? this.favoriteOf(world, parent), changes);
  }

  private onBranch(world: World, ev: SimEvent, changes: NotebookChange[]): void {
    const id = Number(ev.detail?.branch ?? -1);
    if (!(id >= 0)) return;
    const ans = buildLineage(world);
    const row = ans.branches[id];
    const sp = row ? world.species[row.species] : undefined;
    if (!row || !sp) return;
    const parent = row.parentBranch >= 0 ? ans.branches[row.parentBranch] : undefined;
    const trait = row.trait;
    const locusName = trait?.kind === 'locus' ? (ans.loci[trait.locus]?.name ?? null) : null;
    let summary: FamilySummary = {
      branch: row.id,
      shortId: row.shortId,
      name: row.generatedName,
      species: sp.id,
      rootBirthId: row.rootBirthId,
      rootCell: row.rootCell,
      candidateTick: row.candidateTick,
      establishedTick: row.establishedTick,
      members: row.membersAtEstablish,
      depth: row.depthAtEstablish,
      parentName: parent ? parent.generatedName : null,
      trait,
      descriptor: row.descriptor,
      module: row.module,
      locusValues: row.locusValues,
      locusName,
      rules: row.rules,
    };
    // JSON keeps only finite numbers: a rule number that is not one is left out rather than stored wrong.
    summary = JSON.parse(JSON.stringify(summary)) as FamilySummary;
    const from = Math.min(row.candidateTick, ev.tick);
    this.record(world, 'familyChanged', `familyChanged:root-${row.rootBirthId}`, [`event:${ev.id}`, `branch:${row.id}`], summary, from, ev.tick, this.favoriteOf(world, row.rootBirthId), changes);
  }

  private enzymes(world: World, second: number, changes: NotebookChange[]): void {
    if (world.reactionCells.acc === null) return;
    for (const enzyme of REACTION_ENZYMES) {
      const dish = reactionInDish(world, enzyme);
      if (!(dish.c > 0)) continue;
      let best = -1;
      let amount = 0;
      for (let cell = 0; cell < CELL_COUNT; cell++) {
        const c = reactionInCell(world, enzyme, cell).c;
        if (c > amount) {
          amount = c;
          best = cell;
        }
      }
      if (best < 0) continue;
      const region = regionName(quarterOf((best % GRID_W) + 0.5, Math.floor(best / GRID_W) + 0.5));
      const summary: EnzymeSummary = {
        enzyme,
        second,
        cell: best,
        amount,
        dishAmount: dish.c,
        region,
        producers: producersNear(world, enzyme, best),
      };
      const t = second * TICKS_PER_SECOND;
      this.record(world, 'enzymeAtWork', `enzymeAtWork:${enzyme}:${region}`, [`reaction:${enzyme}:${second}:${best}`], summary, t, t + TICKS_PER_SECOND - 1, null, changes);
    }
  }

  private notePlace(cmd: Command): void {
    const p = placeOf(cmd);
    if (!p || this.pending.some((x) => x.seq === cmd.seq)) return;
    const region = quarterOf(p.x, p.y);
    // A later placement in a region already waiting joins it (counted among the changes in between).
    if (this.pending.some((x) => x.region === region)) return;
    this.pending.push({ ...p, seq: cmd.seq, tick: cmd.targetTick, region });
  }

  private places(world: World, changes: NotebookChange[]): void {
    const samples = traitSamples(world);
    if (samples.length === 0) return;
    const last = samples[samples.length - 1]!;
    const nSp = world.species.length;
    const still: PendingPlace[] = [];
    for (const p of this.pending) {
      if (last.second * TICKS_PER_SECOND < p.tick + STORY_WINDOW_TICKS) {
        still.push(p);
        continue;
      }
      let before: TraitSample | null = null;
      let after: TraitSample | null = null;
      for (const s of samples) {
        const t = s.second * TICKS_PER_SECOND;
        if (t <= p.tick) before = s;
        if (after === null && t >= p.tick + STORY_WINDOW_TICKS) after = s;
      }
      if (!before || !after) continue;
      const b = regionCounts(before, p.region, nSp);
      const a = regionCounts(after, p.region, nSp);
      let pick = -1;
      let changed = 0;
      for (let k = 0; k < nSp; k++) {
        if (a[k] === b[k]) continue;
        changed++;
        if (pick < 0 || Math.abs(a[k]! - b[k]!) > Math.abs(a[pick]! - b[pick]!)) pick = k;
      }
      if (pick < 0) continue; // no count changed: no card
      const afterTick = after.second * TICKS_PER_SECOND;
      let others = 0;
      for (const cmd of world.commands.log) if (cmd.seq !== p.seq && cmd.targetTick >= p.tick && cmd.targetTick <= afterTick && isChange(cmd)) others++;
      const region = regionName(p.region);
      const summary: PlaceSummary = {
        seq: p.seq,
        command: p.command,
        commandTick: p.tick,
        what: p.what,
        accepted: p.accepted,
        x: p.x,
        y: p.y,
        region,
        beforeSecond: before.second,
        afterSecond: after.second,
        species: world.species[pick]!.id,
        before: b[pick]!,
        after: a[pick]!,
        changedSpecies: changed,
        others,
      };
      const evidence = [`command:${p.seq}`, `traits:${region}:${before.second}`, `traits:${region}:${after.second}`];
      this.record(world, 'placeChanged', `placeChanged:${region}`, evidence, summary, Math.min(before.second * TICKS_PER_SECOND, p.tick), afterTick, null, changes);
    }
    this.pending = still;
  }

  private ruleset(world: World): StoryRuleset {
    const m = world.content.manifest;
    return {
      simulationVersion: m.simulationVersion,
      evolutionRulesVersion: m.evolutionRulesVersion,
      moduleRegistryVersion: m.moduleRegistryVersion,
      contentHash: m.contentHash,
    };
  }

  private update(id: string, f: (c: StoryCard) => StoryCard): void {
    const rec = this.ref.get();
    this.ref.set({ ...rec, stories: storiesOf(rec).map((c) => (c.id === id ? f(c) : c)) });
  }

  /**
   * Record a detection: a new card, or (D08 "Deduplicate repeated events by template and lineage or
   * region within that window") later evidence joining the card with the same key whose first evidence
   * is less than 600 ticks old. Outside that window a key that already has a card makes no new one, except
   * a place change (each later intervention is its own sequence). A card whose evidence or summary fails
   * validation is never recorded.
   */
  private record(
    world: World,
    template: StoryTemplate,
    key: string,
    evidence: readonly string[],
    summary: StoryCard['summary'],
    from: number,
    to: number,
    favoriteId: string | null,
    changes: NotebookChange[],
  ): void {
    if (evidence.length === 0) return;
    const rec = this.ref.get();
    const list = storiesOf(rec);
    let existing: StoryCard | null = null;
    for (const c of list) if (c.key === key && (existing === null || storyNumber(c.id) > storyNumber(existing.id))) existing = c;
    if (existing) {
      const ex: StoryCard = existing;
      if (world.tick - ex.timeRange[0] < STORY_WINDOW_TICKS) {
        const add = evidence.filter((e) => !ex.evidence.includes(e));
        const merged = [...ex.evidence, ...add].slice(0, STORY_EVIDENCE_MAX);
        const end = Math.max(ex.timeRange[1], to);
        if (merged.length === ex.evidence.length && end === ex.timeRange[1]) return;
        this.update(ex.id, (c) => ({ ...c, evidence: merged, timeRange: [c.timeRange[0], end] }));
        changes.push({ kind: 'story', id: ex.id, notify: false });
        return;
      }
      if (template !== 'placeChanged') return;
    }
    const card = {
      id: nextStoryId(list),
      template,
      key,
      worldId: rec.worldId,
      ruleset: this.ruleset(world),
      evidence: [...evidence],
      summary,
      timeRange: [Math.max(0, Math.min(from, to)), Math.max(0, to)],
      imageRefs: [],
      favoriteId,
      notified: false,
      seen: false,
      dismissed: false,
    } as StoryCard;
    // The same check a loaded file gets: a card a later load would refuse is never written.
    if (storyCardProblem(JSON.parse(JSON.stringify(card)) as unknown, rec.worldId) !== null) return;
    const { list: next } = addStory(list, card);
    this.ref.set({ ...rec, stories: next });
    this.pacer.offer(card.id);
    changes.push({ kind: 'story', id: card.id, notify: false });
  }
}
