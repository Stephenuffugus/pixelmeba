/**
 * npx tsx tools/make-rc1-saves.ts [--force]
 *
 * Writes the rc1 saves of the Phase 5 save fence to tests/fixtures/saves-rc1/ (g5-plan lead call 1;
 * mirrors tools/make-g2-saves.ts, D-0035, D-0042): real .pixelmeba files made by the v1.0.0-rc1 build,
 * gzipped, plus rc1-manifest.json (the rc1 manifest, every field) and expected.json (per save: stateHash
 * at load, the notebook record's checksum as read back, stateHash and trajectoryDigest(world, 'full')
 * 1,000 ticks after loading it through loadSaveFile; see tests/helpers/rc1-saves.ts).
 *
 * Every dish is played through the worker host exactly as the app plays it (src/worker/host.ts DishHost,
 * a fake clock): created from a recipe ('create', with New Dish overrides where named), run by 'setSpeed'
 * and 'pump' (or 'step'), changed only by 'command' messages (Add Life, Lab strokes, food objects, Sample
 * Take), with the notebook changed only by its own requests ('favorite', 'storyMark', 'goalStart',
 * 'bookmarkAdd', 'galleryAdd' built by src/ui/gallery.ts from a published snapshot) and Sample Begun by
 * 'sampleBegin'. Each file is the host's 'exportDish' answer with the player's nicknames kept: the same
 * buildSaveFile call the device's own saves make (the dish's notebook record beside the state). No world
 * field is ever written directly.
 *
 * Fully deterministic, so a re-run on the same tree is byte-identical: fixed save names, order, dish ids
 * (world ids) and savedAt (the host clock's iso()); JSON as buildSaveFile writes it; gzip level 9 with no
 * file name and modification time 0 in the header (checked).
 *
 * It writes only while content/manifest.json is the rc1 manifest (buildPhase 4, contentVersion 2,
 * contentHash d3fbd36c…; and, once committed, equal to tests/fixtures/saves-rc1/rc1-manifest.json in
 * every field), i.e. on the v1.0.0-rc1 code. There it lists each file as written, unchanged
 * (byte-identical) or DIFFERS; with any DIFFERS it writes nothing and exits 1 unless --force is given.
 * From the Phase 5 preflight's manifest bump on it only VERIFIES: it replays every dish under the
 * committed rc1-manifest.json, prints unchanged / DIFFERS / MISSING, writes nothing (not even a missing
 * file), and exits 0 only when every file is byte-identical. --force is refused there (exit 2):
 * tools/fence-update.ts --rc1 --reason D-00xx is the one path that re-records expected.json.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { loadSaveFile } from '../src/persistence/saveFile';
import type { NotebookRecord } from '../src/persistence/notebook';
import type { CommandPayload, CommandResult } from '../src/sim/commands';
import { computeContentHash, ContentError, validateContent, type ContentRegistry, type RawPacks } from '../src/sim/content/registry';
import { ManifestSchema, type Manifest } from '../src/sim/content/schema';
import { FUNGAL_SLOT_COLUMNS } from '../src/sim/links';
import { R } from '../src/sim/reasons';
import { stateHash } from '../src/sim/serialize';
import { speciesIndex, type World } from '../src/sim/world';
import { buildGalleryEntry } from '../src/ui/gallery';
import { DishHost } from '../src/worker/host';
import type { DishSource, FavoriteOp, FromWorker, GeometryMsg, SnapshotMsg, ToWorker } from '../src/worker/protocol';
import { CONTENT_DIR, loadRawPacksFs, REPO_ROOT } from './lib/content-fs';
import {
  measureRc1Save,
  RC1_EXPECTED_PATH,
  RC1_MANIFEST_PATH,
  RC1_REPLAY_TICKS,
  RC1_SAVE_FILES,
  RC1_SAVES_DIR,
  RC1_STAMPS,
  rc1ExpectedText,
  type Rc1Expected,
  type Rc1SaveFile,
} from '../tests/helpers/rc1-saves';

/** Every save's meta.savedAt (the host clock's iso(); fixed so the files are reproducible). */
export const SAVED_AT = '2026-10-13T00:00:00.000Z';
const GZIP_LEVEL = 9;
/** One pump at 4× after 250 ms of the fake clock runs exactly 10 ticks (0.25 s × 10 ticks/s × 4). */
const PUMP_MS = 250;
const TICKS_PER_PUMP = 10;

/** content/manifest.json's key order, used for rc1-manifest.json. */
const MANIFEST_KEYS = [
  'simulationVersion',
  'evolutionRulesVersion',
  'moduleRegistryVersion',
  'phenotypeMappingVersion',
  'contentVersion',
  'contentHash',
  'buildPhase',
  'enabledSpecies',
  'enabledModules',
  'enabledSystems',
  'enabledMaterials',
  'enabledHabitats',
  'enabledStructures',
  'developmentalEnabled',
] as const;

/**
 * The worker host driven as sim.worker.ts drives it, with a fake clock: replies are read synchronously
 * (or awaited for the host's asynchronous requests). Only the latest snapshot and geometry are kept.
 */
class Player {
  readonly host: DishHost;
  private now = 0;
  private req = 0;
  private replies: FromWorker[] = [];
  snapshot: SnapshotMsg | null = null;
  geometry: GeometryMsg | null = null;

  constructor(
    reg: ContentRegistry,
    readonly dishId: string,
    source: DishSource,
    name: string,
  ) {
    this.host = new DishHost(reg, (m) => this.receive(m), { now: () => this.now, iso: () => SAVED_AT });
    const requestId = ++this.req;
    this.host.handle({ type: 'create', requestId, dishId, source, name });
    if (!this.replies.some((m) => m.type === 'ready' && m.requestId === requestId)) throw new Error(`${dishId} was not created: ${JSON.stringify(this.errors())}`);
  }

  private receive(m: FromWorker): void {
    if (m.type === 'snapshot') {
      this.snapshot = m;
      if (m.geometry) this.geometry = m.geometry;
      return;
    }
    this.replies.push(m);
  }

  private errors(): FromWorker[] {
    return this.replies.filter((m) => m.type === 'error');
  }

  private reply(requestId: number): FromWorker {
    const r = this.replies.find((m) => (m as { requestId?: number }).requestId === requestId);
    if (!r) throw new Error(`${this.dishId}: no reply to request ${requestId} (${JSON.stringify(this.errors())})`);
    return r;
  }

  get world(): World {
    const w = this.host.world(this.dishId);
    if (!w) throw new Error(`no dish ${this.dishId}`);
    return w;
  }

  /** Play at 4× (pumps of exactly 10 ticks), then single steps, until the dish reaches `target`; then pause. */
  playTo(target: number): void {
    if (this.world.tick > target) throw new Error(`${this.dishId}: tick ${this.world.tick} is past ${target}`);
    if (target - this.world.tick >= TICKS_PER_PUMP) {
      this.host.handle({ type: 'setSpeed', dishId: this.dishId, speed: 4 });
      while (target - this.world.tick >= TICKS_PER_PUMP) {
        const before = this.world.tick;
        this.now += PUMP_MS;
        this.host.pump();
        if (this.world.tick !== before + TICKS_PER_PUMP) throw new Error(`${this.dishId}: a pump ran ${this.world.tick - before} ticks (${JSON.stringify(this.errors())})`);
      }
      this.host.handle({ type: 'setSpeed', dishId: this.dishId, speed: 0 });
    }
    while (this.world.tick < target) this.host.handle({ type: 'step', dishId: this.dishId });
    if (this.errors().length > 0) throw new Error(`${this.dishId}: ${JSON.stringify(this.errors())}`);
  }

  /** One gesture exactly as the UI sends it (undoable); it must change the dish. */
  command(commandId: string, payload: CommandPayload): CommandResult {
    const requestId = ++this.req;
    this.host.handle({ type: 'command', requestId, dishId: this.dishId, commandId, payload, undoable: true });
    const ack = this.reply(requestId);
    if (ack.type !== 'ack' || !ack.result || ack.result.accepted === 0) throw new Error(`${this.dishId}: ${commandId} (${payload.kind}) changed nothing: ${JSON.stringify(ack)}`);
    return ack.result;
  }

  /** A notebook request (synchronous or asynchronous); it must not be refused. */
  async notebook(msg: Extract<ToWorker, { type: 'favorite' | 'storyMark' | 'goalStart' | 'bookmarkAdd' | 'galleryAdd' }>): Promise<NotebookRecord> {
    if (msg.type === 'bookmarkAdd') await this.host.handleAsync(msg);
    else this.host.handle(msg);
    const r = this.reply(msg.requestId);
    if (r.type !== 'notebook' || r.refused) throw new Error(`${this.dishId}: ${msg.type} refused: ${JSON.stringify(r.type === 'notebook' ? r.refused : r)}`);
    return r.record;
  }

  next(): number {
    return ++this.req;
  }

  async follow(birthId: number, nickname: string, pattern: Extract<FavoriteOp, { kind: 'follow' }>['pattern']): Promise<NotebookRecord> {
    return this.notebook({ type: 'favorite', requestId: this.next(), dishId: this.dishId, op: { kind: 'follow', birthId, nickname, pattern } });
  }

  /** Save organism `birthId` to the gallery as the UI does: its inspector answer and the published snapshot. */
  async gallery(birthId: number): Promise<NotebookRecord> {
    const requestId = this.next();
    this.host.handle({ type: 'notebookGet', requestId, dishId: this.dishId, inspect: birthId });
    const nb = this.reply(requestId);
    if (nb.type !== 'notebook' || !nb.inspected) throw new Error(`${this.dishId}: no inspector answer for #${birthId}`);
    const snap = this.snapshot!;
    const geom = this.geometry!;
    const name = this.world.species[nb.inspected.speciesIdx]!.def.name;
    const entry = buildGalleryEntry(nb.inspected, name, { tick: snap.tick, count: snap.count, ents: snap.ents.slice(), ids: snap.ids.slice(), substrate: geom.substrate.slice(), structure: geom.structure.slice(), shade: geom.shade.slice() });
    if (!entry) throw new Error(`${this.dishId}: #${birthId} is not in the published snapshot`);
    return this.notebook({ type: 'galleryAdd', requestId: this.next(), dishId: this.dishId, entry });
  }

  /** Sample Begin (host-level: pauses and records the stateHash, kept as `beginHash`). */
  sampleBegin(): void {
    const requestId = this.next();
    this.host.handle({ type: 'sampleBegin', requestId, dishId: this.dishId });
    const r = this.reply(requestId);
    if (r.type !== 'sampleBegun') throw new Error(`${this.dishId}: Sample did not begin`);
    this.beginHash = r.hash;
  }

  /** The stateHash Sample Begin recorded, or null. */
  beginHash: string | null = null;

  /** The dish as a file: the host's export with nicknames kept (the buildSaveFile call the device's own saves make). */
  async exportText(): Promise<string> {
    const requestId = this.next();
    await this.host.handleAsync({ type: 'exportDish', requestId, dishId: this.dishId, strip: false, includeNicknames: true });
    const r = this.reply(requestId);
    if (r.type !== 'exported') throw new Error(`${this.dishId}: export failed: ${JSON.stringify(r)}`);
    return r.text;
  }
}

/** Living slots of a species (read-only). */
function living(w: World, speciesId: string): number[] {
  const sp = speciesIndex(w, speciesId);
  const c = w.ents.cols;
  const out: number[] = [];
  for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.species[i] === sp) out.push(i);
  return out;
}

/** Recorded deaths of a species by a cause, over retained lineage records (read-only). */
function deathsBy(w: World, speciesId: string, cause: number): number {
  const sp = speciesIndex(w, speciesId);
  const L = w.lineage;
  let n = 0;
  for (let k = 0; k < L.deathCause.length; k++) if (L.deathCause[k] === cause && L.species[k] === sp) n++;
  return n;
}

function sumField(w: World, id: keyof World['fields']): number {
  const f = w.fields[id];
  let total = 0;
  if (f) for (let k = 0; k < f.length; k++) total += f[k]!;
  return total;
}

function fungalLinkEnds(w: World): number {
  const c = w.ents.cols as unknown as Record<string, ArrayLike<number>>;
  let n = 0;
  for (let i = 0; i < w.ents.highWater; i++) if (w.ents.cols.alive[i] === 1) for (const col of FUNGAL_SLOT_COLUMNS) if (c[col]![i]! >= 0) n++;
  return n;
}

/** Living carriers per module (read-only). */
function carriers(w: World): Record<string, number> {
  const out: Record<string, number> = {};
  const c = w.ents.cols;
  for (let i = 0; i < w.ents.highWater; i++) {
    if (c.alive[i] !== 1) continue;
    for (const m of w.genomes.get(c.genome[i]!).modules) out[m] = (out[m] ?? 0) + 1;
  }
  return out;
}

const count = <T>(xs: readonly T[], f: (x: T) => boolean): number => xs.filter(f).length;

/** What a built dish holds: counts the report prints and the check reads. */
type Facts = Record<string, number | string>;

interface SaveSpec {
  readonly file: Rc1SaveFile;
  readonly tick: number;
  /** Play the dish through the host and return it, at `tick`, ready to export. */
  readonly play: (reg: ContentRegistry) => Player | Promise<Player>;
  /** What the save exercises (from the world and the notebook, read-only). */
  readonly facts: (w: World, nb: NotebookRecord | null) => Facts;
  /** Why this save does not hold what it must exercise, or null. */
  readonly check: (f: Facts) => string | null;
}

const need = (f: Facts, keys: readonly string[]): string | null => {
  const missing = keys.filter((k) => {
    const v = f[k];
    return typeof v === 'number' ? !(v > 0) : v === '' || v === undefined;
  });
  return missing.length === 0 ? null : `nothing of: ${missing.join(', ')} (${JSON.stringify(f)})`;
};

function notebookFacts(nb: NotebookRecord | null): Facts {
  const goals = nb?.goals ?? [];
  return {
    favorites: nb?.favorites.length ?? 0,
    followed: count(nb?.favorites ?? [], (f) => f.active),
    nicknamed: count(nb?.favorites ?? [], (f) => f.nickname !== null),
    stories: nb?.stories?.length ?? 0,
    storiesSeen: count(nb?.stories ?? [], (s) => s.seen === true),
    goalsRunning: count(goals, (g) => g.state === 'running'),
    goalsSettled: count(goals, (g) => g.state !== 'running'),
    bookmarks: nb?.bookmarks?.length ?? 0,
    gallery: nb?.gallery?.length ?? 0,
  };
}

const SPECS: readonly SaveSpec[] = [
  {
    // (a) module carriers incl. Phase 3 modules (Diverse founders, Accelerated draws), X01 on its A01 hosts,
    // (h) a notebook with every kind the app writes for a played dish.
    file: 'first-dish-diverse-notebook-t3000.pixelmeba.gz',
    tick: 3000,
    play: async (reg) => {
      const p = new Player(reg, 'rc1-first-dish-diverse', { kind: 'recipe', recipeId: 'FIRST_DISH_V1', overrides: { mutationPreset: 'accelerated', founderMode: 'diverse' } }, 'rc1 Little Living Garden notebook');
      await p.notebook({ type: 'goalStart', requestId: p.next(), dishId: p.dishId, objectiveId: 'SEE_SPRINTER_SPLIT' });
      p.playTo(100);
      const sprinter = p.world.ents.cols.birthId[living(p.world, 'B01')[0]!]!;
      await p.follow(sprinter, 'rc1 Sprinters', 'triangle');
      p.playTo(600);
      p.command('rc1:add-hitchers', { kind: 'inoculate', speciesId: 'X01', x: 48.5, y: 48.5, radius: 5, count: 8 });
      p.playTo(2000);
      await p.notebook({ type: 'goalStart', requestId: p.next(), dishId: p.dishId, objectiveId: 'KEEP_SPRINTERS_GOING' });
      p.playTo(2500);
      await p.notebook({ type: 'bookmarkAdd', requestId: p.next(), dishId: p.dishId, title: 'rc1 bookmark', snapshot: false, event: null });
      p.playTo(2900);
      await p.notebook({ type: 'storyMark', requestId: p.next(), dishId: p.dishId, id: 'story-1', mark: 'seen' });
      const fav = (await p.follow(p.world.ents.cols.birthId[living(p.world, 'A01')[0]!]!, 'rc1 Sunbeads', 'circle')).favorites;
      // A gallery specimen: the first followed family's eldest living member.
      await p.gallery(fav.find((f) => f.active && f.members.length > 0)!.members[0]![0]);
      p.playTo(3000);
      return p;
    },
    facts: (w, nb) => {
      const c = w.ents.cols;
      const m = carriers(w);
      const x01 = living(w, 'X01');
      return {
        alive: w.ents.count,
        carriers: Object.entries(m)
          .map(([k, v]) => `${k}:${v}`)
          .sort()
          .join(' '),
        // Carriers of the Phase 3 modules (phase 3 in content/modules: E06, E07, E10, E12; E05 is phase 2).
        phase3Carriers: (m.E06 ?? 0) + (m.E07 ?? 0) + (m.E10 ?? 0) + (m.E12 ?? 0),
        x01Alive: x01.length,
        x01Attached: count(x01, (i) => c.hostSlot[i]! >= 0),
        ...notebookFacts(nb),
      };
    },
    check: (f) => need(f, ['phase3Carriers', 'x01Attached', 'followed', 'nicknamed', 'stories', 'storiesSeen', 'goalsRunning', 'goalsSettled', 'bookmarks', 'gallery']),
  },
  {
    // (e) an M10 pellet and an M11 wafer, partly released; (f) Lab chemistry strokes, gel paint, a wall;
    // (g) a Sample taken while paused and HELD at save time.
    file: 'first-dish-lab-food-sample-held-t1500.pixelmeba.gz',
    tick: 1500,
    play: (reg) => {
      const p = new Player(reg, 'rc1-first-dish-lab', { kind: 'recipe', recipeId: 'FIRST_DISH_V1' }, 'rc1 Little Living Garden Lab');
      p.playTo(300);
      const lab: [string, CommandPayload][] = [
        ['salt', { kind: 'deposit', materialId: 'SALT', points: [[30.5, 80.5], [40.5, 80.5]], radius: 3, dose: 0.1 }],
        ['acid', { kind: 'deposit', materialId: 'ACID', points: [[84.5, 80.5], [94.5, 80.5]], radius: 3, dose: 0.1 }],
        ['buffer', { kind: 'deposit', materialId: 'BUFFER', points: [[88.5, 76.5]], radius: 3, dose: 0.5 }],
        ['gel', { kind: 'paintSubstrate', substrate: 'gel', points: [[52.5, 30.5], [76.5, 30.5]], radius: 3 }],
        ['wall', { kind: 'placeStructure', structure: 'wall', points: [[30.5, 92.5], [40.5, 92.5]], radius: 1 }],
        ['pellet', { kind: 'placeObject', materialId: 'M10', x: 44.5, y: 70.5 }],
        ['wafer', { kind: 'placeObject', materialId: 'M11', x: 72.5, y: 60.5 }],
      ];
      for (const [id, payload] of lab) p.command(`rc1:lab-${id}`, payload);
      p.playTo(1500);
      p.sampleBegin();
      // The tap: the cell of the first living Crumbsmith (the player taps where organisms are).
      const at = living(p.world, 'B06')[0]!;
      const [x, y] = [Math.floor(p.world.ents.cols.x[at]!) + 0.5, Math.floor(p.world.ents.cols.y[at]!) + 0.5];
      p.command('rc1:sample-take', { kind: 'sampleTake', x, y, radius: 3, mode: 'all' });
      return p;
    },
    facts: (w, nb) => {
      const objs = w.objects;
      const partly = (o: (typeof objs)[number]) => {
        const left = Object.values(o.pools).reduce((a: number, v) => a + (v ?? 0), 0);
        return left > 0 && left < 10;
      };
      const held = w.sample;
      return {
        alive: w.ents.count,
        pellets: count(objs, (o) => o.kind === 'pellet' && partly(o)),
        wafers: count(objs, (o) => o.kind === 'wafer' && partly(o)),
        labCommands: count(w.commands.log, (c) => c.commandId.startsWith('rc1:lab-')),
        salt: sumField(w, 'salt'),
        acid: sumField(w, 'acid'),
        buffer: sumField(w, 'buffer'),
        sampleRows: held ? held.rows.length : 0,
        sampleCells: held ? held.cells.length : 0,
        ...notebookFacts(nb),
      };
    },
    check: (f) => (f.labCommands === 7 ? need(f, ['pellets', 'wafers', 'salt', 'acid', 'buffer', 'sampleRows', 'sampleCells']) : `Lab commands in the log: ${f.labCommands}, expected 7`),
  },
  {
    // (b) film: Borrowed Shelter's Matrix builders (E10) and Velvets (B02, native biofilm) added by Add Life.
    file: 'borrowed-shelter-velvet-t1500.pixelmeba.gz',
    tick: 1500,
    play: (reg) => {
      const p = new Player(reg, 'rc1-borrowed-shelter', { kind: 'recipe', recipeId: 'L306_BORROWED_SHELTER' }, 'rc1 Borrowed Shelter with Velvets');
      p.playTo(100);
      p.command('rc1:add-velvets', { kind: 'inoculate', speciesId: 'B02', x: 64.5, y: 64.5, radius: 6, count: 20 });
      p.playTo(1500);
      return p;
    },
    facts: (w, nb) => ({
      alive: w.ents.count,
      b02Alive: living(w, 'B02').length,
      e10Carriers: carriers(w).E10 ?? 0,
      film: sumField(w, 'film'),
      filmCells: (() => {
        const f = w.fields.film;
        let n = 0;
        if (f) for (let k = 0; k < f.length; k++) if (f[k]! > 0) n++;
        return n;
      })(),
      ...notebookFacts(nb),
    }),
    check: (f) => need(f, ['b02Alive', 'e10Carriers', 'film', 'filmCells']),
  },
  {
    // (c) F02 Cordweaver transport links carrying food along the line.
    file: 'fungal-supply-line-t900.pixelmeba.gz',
    tick: 900,
    play: (reg) => {
      const p = new Player(reg, 'rc1-fungal-supply-line', { kind: 'recipe', recipeId: 'FUNGAL_SUPPLY_LINE_V1' }, 'rc1 Fungal supply line');
      p.playTo(900);
      return p;
    },
    facts: (w, nb) => ({ alive: w.ents.count, f02Alive: living(w, 'F02').length, fungalLinkEnds: fungalLinkEnds(w), ...notebookFacts(nb) }),
    check: (f) => need(f, ['f02Alive', 'fungalLinkEnds']),
  },
  {
    // (d) V01 Pinphage: Sprinters infected and others already lysed (One compatible host, mid-outbreak).
    file: 'one-host-pinphage-t300.pixelmeba.gz',
    tick: 300,
    play: (reg) => {
      const p = new Player(reg, 'rc1-one-host', { kind: 'recipe', recipeId: 'ONE_HOST_V1' }, 'rc1 One compatible host');
      p.playTo(300);
      return p;
    },
    facts: (w, nb) => {
      const c = w.ents.cols;
      return {
        alive: w.ents.count,
        b01Infected: count(living(w, 'B01'), (i) => c.infectedBy[i]! !== 0),
        b01Lysed: deathsBy(w, 'B01', R.DEATH_LYSIS),
        phageUnits: sumField(w, 'v01'),
        ...notebookFacts(nb),
      };
    },
    check: (f) => need(f, ['b01Infected', 'b01Lysed']),
  },
];

/**
 * Why this tree may not write the rc1 fixtures (null: it is the rc1 build and may). Only the rc1 build
 * writes them: content/manifest.json must carry the rc1 stamps (buildPhase 4, contentVersion 2, the rc1
 * contentHash) and, when rc1-manifest.json is committed, equal it in every field.
 */
export function writeRefusal(contentRaw: Record<string, unknown>, committedRc1: Record<string, unknown> | null): string | null {
  const m = ManifestSchema.parse(contentRaw);
  const stamps = m.buildPhase === RC1_STAMPS.buildPhase && m.contentVersion === RC1_STAMPS.contentVersion && m.contentHash === RC1_STAMPS.contentHash;
  const same = committedRc1 === null || manifestText(contentRaw) === manifestText(committedRc1);
  if (stamps && same) return null;
  return `content/manifest.json is not the rc1 manifest (buildPhase ${m.buildPhase}, contentVersion ${m.contentVersion}, contentHash ${m.contentHash.slice(0, 8)}…${stamps ? '; differs from rc1-manifest.json' : ''}): only the v1.0.0-rc1 build writes the rc1 saves, so this run only verifies them. A decided change re-records expected.json with tools/fence-update.ts --rc1 --reason D-00xx.`;
}

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;

/** The rc1 manifest: the committed rc1-manifest.json, or content/manifest.json while it is still the rc1 one. */
function rc1ManifestSource(): { manifest: Manifest; raw: Record<string, unknown>; from: string } {
  const from = existsSync(RC1_MANIFEST_PATH) ? RC1_MANIFEST_PATH : join(CONTENT_DIR, 'manifest.json');
  const raw = readJson(from);
  const manifest = ManifestSchema.parse(raw);
  if (manifest.buildPhase !== RC1_STAMPS.buildPhase || manifest.contentVersion !== RC1_STAMPS.contentVersion || manifest.contentHash !== RC1_STAMPS.contentHash) {
    throw new Error(`${relative(REPO_ROOT, from)} is not the rc1 manifest (buildPhase ${manifest.buildPhase}, contentVersion ${manifest.contentVersion}): only the v1.0.0-rc1 build writes the rc1 saves.`);
  }
  return { manifest, raw, from };
}

/** rc1-manifest.json's text: content/manifest.json's key order, two-space indent, trailing newline. */
function manifestText(raw: Record<string, unknown>): string {
  const out: Record<string, unknown> = {};
  for (const k of MANIFEST_KEYS) if (raw[k] !== undefined) out[k] = raw[k];
  for (const k of Object.keys(raw).sort()) if (!(k in out)) out[k] = raw[k];
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** The registry the rc1 build shipped: today's packs with the rc1 manifest, whose content hash they must still match. */
async function rc1Registry(manifestRaw: Record<string, unknown>, manifest: Manifest): Promise<ContentRegistry> {
  const disk = loadRawPacksFs();
  const raw: RawPacks = { ...disk, manifest: { file: disk.manifest.file, data: JSON.parse(JSON.stringify(manifestRaw)) as unknown } };
  const hash = await computeContentHash(raw);
  if (hash !== manifest.contentHash) {
    throw new Error(`content/ no longer hashes to the rc1 manifest's contentHash (${manifest.contentHash}; now ${hash}): the rc1 saves can only be written by the rc1 build.`);
  }
  const res = validateContent(raw);
  if (!res.registry) throw new ContentError(res.issues);
  return res.registry;
}

function gzip(text: string): Uint8Array {
  const bytes = gzipSync(Buffer.from(text, 'utf8'), { level: GZIP_LEVEL });
  // RFC 1952 header: ID1 ID2 CM FLG MTIME(4) XFL OS. No FNAME/FCOMMENT/FEXTRA (FLG 0), MTIME 0.
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8 || bytes[3] !== 0 || bytes.readUInt32LE(4) !== 0) {
    throw new Error('gzip header carries a name or a timestamp');
  }
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

const sha256 = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  const refusal = writeRefusal(readJson(join(CONTENT_DIR, 'manifest.json')), existsSync(RC1_MANIFEST_PATH) ? readJson(RC1_MANIFEST_PATH) : null);
  if (force && refusal) {
    console.error(`make-rc1-saves refused --force: ${refusal}`);
    process.exit(2);
  }
  const verifyOnly = refusal !== null;
  if (verifyOnly) console.log(`verify only: ${refusal}`);
  const { manifest, raw: manifestRaw, from } = rc1ManifestSource();
  const reg = await rc1Registry(manifestRaw, manifest);
  console.log(`rc1 manifest from ${relative(REPO_ROOT, from)} · contentHash ${manifest.contentHash} · buildPhase ${manifest.buildPhase} · contentVersion ${manifest.contentVersion}`);

  const outputs: { path: string; bytes: Uint8Array }[] = [{ path: RC1_MANIFEST_PATH, bytes: new TextEncoder().encode(manifestText(manifestRaw)) }];
  const expected: Record<string, Rc1Expected> = {};
  for (const spec of SPECS) {
    const t0 = process.hrtime.bigint();
    const player = await spec.play(reg);
    const world = player.world;
    if (world.tick !== spec.tick) throw new Error(`${spec.file}: tick ${world.tick}, expected ${spec.tick}`);
    const hash = stateHash(world);
    const text = await player.exportText();
    const loaded = await loadSaveFile(text);
    if (stateHash(loaded.world) !== hash) throw new Error(`${spec.file}: the save does not load to the same state (${stateHash(loaded.world)} vs ${hash})`);
    const filed = (JSON.parse(text) as { notebook?: NotebookRecord }).notebook ?? null;
    const facts = spec.facts(loaded.world, filed ? loaded.notebook : null);
    const problem = spec.check(facts);
    if (problem) throw new Error(`${spec.file}: ${problem}`);
    const m = await measureRc1Save(spec.file, text);
    // A held sample cancelled after the reload returns the dish exactly to its state at Sample Begin (D-0037).
    if (m.expected.hashAfterResume !== null && m.expected.hashAfterResume !== player.beginHash) {
      throw new Error(`${spec.file}: Cancel after loading gives ${m.expected.hashAfterResume}, not the Sample Begin hash ${player.beginHash}`);
    }
    expected[spec.file] = m.expected;
    const bytes = gzip(text);
    outputs.push({ path: join(RC1_SAVES_DIR, spec.file), bytes });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    console.log(
      `built ${spec.file}: tick ${world.tick}, stateHash ${hash}, notebook ${m.expected.notebookChecksum ?? 'none'}, resumed ${m.expected.hashAfterResume ?? '-'}, +${RC1_REPLAY_TICKS} ticks ${m.expected.hashPlus1000} / digest ${m.expected.digestPlus1000}; ${text.length} B json, ${bytes.byteLength} B gz (${(ms / 1000).toFixed(1)} s)`,
    );
    console.log(`  facts ${JSON.stringify(facts)}`);
  }
  if (SPECS.map((s) => s.file).join() !== RC1_SAVE_FILES.join()) throw new Error('SPECS and RC1_SAVE_FILES disagree');
  outputs.push({ path: RC1_EXPECTED_PATH, bytes: new TextEncoder().encode(rc1ExpectedText(expected)) });

  const status = outputs.map((o) => {
    if (!existsSync(o.path)) return verifyOnly ? 'MISSING' : 'written';
    const old = new Uint8Array(readFileSync(o.path));
    return sha256(old) === sha256(o.bytes) ? 'unchanged' : 'DIFFERS';
  });
  if (verifyOnly) {
    outputs.forEach((o, k) => console.log(`${status[k]!.padEnd(11)} ${sha256(o.bytes)}  ${o.bytes.byteLength.toString().padStart(8)} B  ${relative(REPO_ROOT, o.path)}`));
    const bad = status.filter((s) => s !== 'unchanged').length;
    if (bad > 0) {
      console.error(`Verify failed: ${bad} rc1 fixture(s) differ from what this build makes of the rc1 saves, or are missing. Nothing was written.`);
      process.exit(1);
    }
    console.log(`verified: all ${outputs.length} rc1 fixtures are byte-identical. Nothing was written.`);
    return;
  }
  const differs = status.some((s) => s === 'DIFFERS');
  if (differs && !force) {
    outputs.forEach((o, k) => console.log(`${status[k]!.padEnd(9)} ${relative(REPO_ROOT, o.path)}`));
    console.error('Refused: existing rc1 fixtures differ from what this build writes. Nothing was written. (Only the rc1 build writes them; --force overwrites.)');
    process.exit(1);
  }
  mkdirSync(RC1_SAVES_DIR, { recursive: true });
  outputs.forEach((o, k) => {
    if (status[k] !== 'unchanged') writeFileSync(o.path, o.bytes);
    console.log(`${(status[k] === 'DIFFERS' ? 'overwritten' : status[k]!).padEnd(11)} ${sha256(o.bytes)}  ${o.bytes.byteLength.toString().padStart(8)} B  ${relative(REPO_ROOT, o.path)}`);
  });
}

const invoked = process.argv[1] ?? '';
const self = fileURLToPath(import.meta.url);
if (invoked === self || `${invoked}.ts` === self) await main();
