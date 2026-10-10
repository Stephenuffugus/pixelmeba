/**
 * P3.8 Field Guide content rules (UX §5.7; BUILD_DIRECTIVE P3.8 "every enabled content ID has guide
 * text (validator enforces)"; D-0039; src/sim/content/guideRules.ts).
 *
 * - Removing (or blanking) each guide field of an enabled record of each kind fails with file → field.
 * - Materials: "No additional modeled reaction." unless a modeled reaction is listed (failing and
 *   passing case).
 * - Summary and example never name a species that is not enabled (error); rules text only warns.
 * - The shipped manifest and the g2 lists both validate.
 * - The guide's predator, prey and host lists equal CT §3.2–§3.3, parsed here from
 *   docs/CONTENT_TABLES.md and filtered to enabled species.
 * - The Lab tray and the guide read the same tool record (in-process worker, as view-switch.test.ts).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { validateContent, type ContentIssue, type RawPacks } from '../../src/sim/content/registry';
import { GUIDE_FIELDS, hostsOf, NO_REACTION_SENTENCE, parasitesOf, predatorsOf, preyOf, TOOL_FIELDS } from '../../src/sim/content/guideRules';
import { stateHash } from '../../src/sim/serialize';
import { DishHost } from '../../src/worker/host';
import { MemoryBackend, SaveStore } from '../../src/persistence/store';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import type * as UiState from '../../src/ui/state';
import { loadRawPacksFs } from '../../tools/lib/content-fs';
import { G2_LISTS, patchedRawPacks, registryWith } from '../helpers/registry';
import { registry } from '../helpers/world';

const raw = loadRawPacksFs();

function clone(r: RawPacks): RawPacks {
  return JSON.parse(JSON.stringify(r)) as RawPacks;
}

type Kind = 'species' | 'materials' | 'modules' | 'habitats' | 'structures' | 'tools';

function edit(r: RawPacks, kind: Kind, id: string, fn: (d: Record<string, unknown>) => void): RawPacks {
  const out = clone(r);
  const list = out[kind]!;
  const f = list.find((x) => x.file.endsWith(`/${id}.json`));
  if (!f) throw new Error(`no ${kind}/${id}`);
  fn(f.data as Record<string, unknown>);
  return out;
}

const errors = (r: RawPacks): ContentIssue[] => validateContent(r).issues.filter((i) => i.severity === 'error');
const warnings = (r: RawPacks): ContentIssue[] => validateContent(r).issues.filter((i) => i.severity === 'warning');
const guideOf = (d: Record<string, unknown>) => d.guide as Record<'summary' | 'biology' | 'rules' | 'example', string>;

/** One enabled record of each kind in the shipped manifest. */
const ENABLED: readonly [Kind, string][] = [
  ['species', 'B04'],
  ['materials', 'SALT'],
  ['modules', 'E05'],
  ['habitats', 'WATER_GARDEN'],
  ['structures', 'BEAD'],
  ['tools', 'SAMPLE'],
];

describe('P3.8 every enabled record has Field Guide text (validator)', () => {
  it('the shipped content and the g2 lists both validate with no errors', () => {
    expect(errors(raw)).toEqual([]);
    expect(errors(patchedRawPacks(G2_LISTS))).toEqual([]);
    expect(() => registryWith(G2_LISTS)).not.toThrow();
    const reg = registry();
    expect(reg.toolIds).toEqual(['CLEAN_WATER', 'COMPARE', 'DUPLICATE', 'ERASE_STRUCTURE', 'INSPECT', 'OVERLAYS', 'SAMPLE', 'SNAPSHOT', 'TRANSFER', 'UNDO']);
  });

  for (const [kind, id] of ENABLED) {
    const file = `content/${kind}/${id}.json`;
    for (const field of GUIDE_FIELDS) {
      it(`${kind} ${id}: removing or blanking guide.${field} fails with ${file} → guide.${field}`, () => {
        const removed = errors(edit(raw, kind, id, (d) => delete guideOf(d)[field]));
        expect(removed).toContainEqual(expect.objectContaining({ file, path: `guide.${field}` }));
        const blank = errors(edit(raw, kind, id, (d) => (guideOf(d)[field] = '   ')));
        expect(blank).toContainEqual(expect.objectContaining({ file, path: `guide.${field}`, message: 'enabled record needs Field Guide text here' }));
      });
    }
  }
  for (const field of TOOL_FIELDS) {
    it(`tools SAMPLE: removing or blanking ${field} fails with content/tools/SAMPLE.json → ${field}`, () => {
      const file = 'content/tools/SAMPLE.json';
      expect(errors(edit(raw, 'tools', 'SAMPLE', (d) => delete d[field]))).toContainEqual(expect.objectContaining({ file, path: field }));
      expect(errors(edit(raw, 'tools', 'SAMPLE', (d) => (d[field] = ' ')))).toContainEqual(expect.objectContaining({ file, path: field }));
    });
  }

  it('a record that is not enabled is not held to it (a Phase 5 species with blank text still validates)', () => {
    expect(errors(edit(raw, 'species', 'B09', (d) => (guideOf(d).summary = ' ')))).toEqual([]);
    // A tool of a later phase than the build is not enabled either (one phase past the shipped buildPhase).
    const later = (raw.manifest.data as { buildPhase: number }).buildPhase + 1;
    expect(errors(edit(raw, 'tools', 'SAMPLE', (d) => ((d.phase = later), (d.watchFor = ' '))))).toEqual([]);
  });
});

describe('P3.8 "No additional modeled reaction." (UX §5.7)', () => {
  it('failing case: an enabled material without the sentence is an error on its rules', () => {
    const errs = errors(edit(raw, 'materials', 'SALT', (d) => (guideOf(d).rules = guideOf(d).rules.replace(NO_REACTION_SENTENCE, '').trim())));
    expect(errs).toContainEqual(expect.objectContaining({ file: 'content/materials/SALT.json', path: 'guide.rules' }));
  });
  it('passing case: with the sentence it validates; a material that is not enabled is not checked', () => {
    expect(errors(raw)).toEqual([]);
    for (const id of ['SUGAR', 'NUTRIENT', 'DEBRIS', 'SALT']) expect(registry().materials[id]!.guide.rules, id).toContain(NO_REACTION_SENTENCE);
    expect(registry().materials.NUTRIENT!.guide.rules).toContain('Nutrient alone is not food: it adds no carbon or energy.');
    expect(errors(edit(raw, 'materials', 'M06', (d) => (guideOf(d).rules = 'Lantern signal.')))).toEqual([]);
  });
});

describe('P3.8 summary and example never name a species that is not enabled', () => {
  it('failing case: naming a later-phase species (plural too) in a summary or an example is an error', () => {
    const s = errors(edit(raw, 'species', 'B01', (d) => (guideOf(d).summary = 'A quick swimmer that races Lanterns to sugar.')));
    expect(s).toContainEqual(expect.objectContaining({ file: 'content/species/B01.json', path: 'guide.summary' }));
    const e = errors(edit(raw, 'materials', 'SUGAR', (d) => (guideOf(d).example = 'Put sugar beside a Brinecoil.')));
    expect(e).toContainEqual(expect.objectContaining({ file: 'content/materials/SUGAR.json', path: 'guide.example' }));
    const t = errors(edit(raw, 'tools', 'UNDO', (d) => (d.watchFor = 'A Needlejaw coming back.')));
    expect(t).toContainEqual(expect.objectContaining({ file: 'content/tools/UNDO.json', path: 'watchFor' }));
  });
  it('passing cases: enabled names are fine; in rules text it is only a warning', () => {
    expect(errors(edit(raw, 'species', 'B01', (d) => (guideOf(d).summary = 'Races Recyclers and Crumbsmiths to sugar.')))).toEqual([]);
    const r = edit(raw, 'species', 'B01', (d) => (guideOf(d).rules = `${guideOf(d).rules} Lanterns ignore it.`));
    expect(errors(r)).toEqual([]);
    expect(warnings(r)).toContainEqual(expect.objectContaining({ file: 'content/species/B01.json', path: 'guide.rules', severity: 'warning' }));
    // A test manifest that leaves a shipped species out only warns (the build could still show it).
    const species = registry().manifest.enabledSpecies.filter((x) => x !== 'P03');
    const subset = edit(patchedRawPacks({ enabledSpecies: species }), 'materials', 'SUGAR', (d) => (guideOf(d).summary = 'Food for the prey of Rotifers.'));
    expect(errors(subset)).toEqual([]);
    expect(warnings(subset)).toContainEqual(expect.objectContaining({ file: 'content/materials/SUGAR.json', path: 'guide.summary' }));
  });
});

// ------------------------------------------------------------------------- CT §3.2–§3.3 parsed

const CT = readFileSync('docs/CONTENT_TABLES.md', 'utf8');

function section(title: string): string {
  const start = CT.indexOf(title);
  if (start < 0) throw new Error(`no ${title}`);
  const end = CT.indexOf('\n### ', start + title.length);
  return CT.slice(start, end);
}

/** Table rows "| ID Name | cell |" of a section, as [id, cell]. */
function rows(sec: string): [string, string][] {
  return sec
    .split('\n')
    .filter((l) => /^\| [A-Z][0-9]{2} /.test(l))
    .map((l) => {
      const cells = l.split('|').map((c) => c.trim());
      return [cells[1]!.slice(0, 3), cells[2]!];
    });
}

/** "B01–B05" → B01…B05; "B06" → [B06]. */
function expand(token: string): string[] {
  const m = /^([A-Z])(\d{2})(?:[–-]([A-Z])(\d{2}))?$/.exec(token);
  if (!m) throw new Error(`unparsable id "${token}"`);
  if (!m[3]) return [`${m[1]}${m[2]}`];
  const out: string[] = [];
  for (let k = Number(m[2]); k <= Number(m[4]); k++) out.push(`${m[1]}${String(k).padStart(2, '0')}`);
  return out;
}

type Req = 'any' | 'free' | 'inSediment';

/** A CT §3.2 prey cell → [{id, requires}]: 'free', 'while in sediment' and 'within 1 cell' kept; parenthetical notes ignored. */
function parsePrey(cell: string): { id: string; requires: Req }[] {
  const text = cell.replace(/\([^)]*\)/g, '').trim();
  const out: { id: string; requires: Req }[] = [];
  for (const part of text.split(/[,;]/).map((p) => p.trim()).filter(Boolean)) {
    let t = part;
    let requires: Req = 'any';
    if (t.startsWith('free ')) {
      requires = 'free';
      t = t.slice(5);
    }
    if (t.endsWith(' while in sediment')) {
      requires = 'inSediment';
      t = t.slice(0, -' while in sediment'.length);
    }
    // 'within N cell(s)' (P06) is the hunter's reach, not a requirement on the prey: kept by
    // reachOf() below and checked against the hunter's sensingRadius.
    t = t.replace(/\s+within \d+ cells?$/, '').trim();
    if (/^individual /.test(t)) {
      for (const id of t.match(/[A-Z][0-9]{2}/g) ?? []) out.push({ id, requires });
      continue;
    }
    for (const id of expand(t)) out.push({ id, requires });
  }
  return out;
}

/** CT §3.2 'within N cell(s)' qualifier of a hunter's row (P06: 1), or null. */
function reachOf(cell: string): number | null {
  const m = /within (\d+) cells?/.exec(cell.replace(/\([^)]*\)/g, ''));
  return m ? Number(m[1]) : null;
}

describe('P3.8 the guide’s predators, prey and hosts equal CT §3.2–§3.3 (enabled species)', () => {
  const reg = registry();
  const enabled = reg.manifest.enabledSpecies;
  const CT_PREY = rows(section('### 3.2 Prey lists'));
  const CT_HOSTS = rows(section('### 3.3 Hosts, parasites, viruses, traps'));

  it('parses the tables (ranges expanded, qualifiers kept)', () => {
    expect(CT_PREY.map(([id]) => id)).toEqual(['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07', 'P08', 'P09', 'P10']);
    const p02 = parsePrey(CT_PREY.find(([id]) => id === 'P02')![1]);
    expect(p02).toContainEqual({ id: 'B09', requires: 'free' });
    expect(p02.map((p) => p.id)).not.toContain('B02'); // "(never attached B02)" is a note
    const p04 = parsePrey(CT_PREY.find(([id]) => id === 'P04')![1]);
    expect(p04).toContainEqual({ id: 'B03', requires: 'any' });
    expect(p04).toContainEqual({ id: 'B13', requires: 'inSediment' });
    expect(parsePrey(CT_PREY.find(([id]) => id === 'P06')![1]).map((p) => p.id)).toEqual(['B01', ...expand('B03–B12')]);
  });

  it("keeps 'within 1 cell': the hunter's reach equals its content sensing radius (P06, not enabled in this version)", () => {
    const reached = CT_PREY.filter(([, cell]) => reachOf(cell) !== null);
    expect(reached.map(([id]) => id)).toEqual(['P06']);
    for (const [id, cell] of reached) expect(reg.species[id]?.sensingRadius, id).toBe(reachOf(cell));
    // No other row carries a reach qualifier, so only P06's prey links come with one.
    expect(CT_PREY.filter(([id]) => id !== 'P06').every(([, cell]) => reachOf(cell) === null)).toBe(true);
  });

  it('prey of every enabled hunter', () => {
    const hunters = CT_PREY.filter(([id]) => enabled.includes(id));
    expect(hunters.map(([id]) => id)).toEqual(['P01', 'P02', 'P03', 'P04']);
    for (const [id, cell] of hunters) {
      const want = parsePrey(cell).filter((p) => enabled.includes(p.id));
      expect(preyOf(reg.species, id, enabled), id).toEqual(want);
    }
  });

  it('predators of every enabled species (the same table, read the other way)', () => {
    for (const sp of enabled) {
      const want = CT_PREY.filter(([id]) => enabled.includes(id))
        .flatMap(([id, cell]) => parsePrey(cell).filter((p) => p.id === sp).map((p) => ({ id, requires: p.requires })))
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      expect(predatorsOf(reg.species, sp, enabled), sp).toEqual(want);
    }
  });

  it('hosts and parasites (CT §3.3: "attaches to …" and "infects …"; traps are not hosts)', () => {
    const agents = CT_HOSTS.filter(([id]) => enabled.includes(id));
    expect(agents.map(([id]) => id).sort()).toEqual(['V01', 'X01']);
    for (const [id, rule] of agents) {
      const m = /^(?:attaches to|infects)\s+(?:active\s+)?([^;,]*)/.exec(rule);
      expect(m, rule).not.toBeNull();
      const want = (m![1]!.match(/[A-Z][0-9]{2}/g) ?? []).filter((h) => enabled.includes(h));
      expect(hostsOf(reg.species, id, enabled), id).toEqual(want);
    }
    for (const sp of enabled) {
      const want = agents
        .filter(([, rule]) => (/^(?:attaches to|infects)\s+(?:active\s+)?([^;,]*)/.exec(rule)?.[1] ?? '').includes(sp))
        .map(([id]) => id)
        .sort();
      expect(parasitesOf(reg.species, sp, enabled), sp).toEqual(want);
    }
  });

  it('the guide model shows those lists with their qualifiers', async () => {
    const { guideModel } = await import('../../src/ui/views/FieldGuideData');
    const model = guideModel(reg);
    const b06 = model.species.find((s) => s.id === 'B06')!;
    expect(b06.predators.map((p) => p.text)).toEqual(['Amoeba', 'Ciliate (only free-swimming)', 'Siltworm (only in sediment)']);
    const a01 = model.species.find((s) => s.id === 'A01')!;
    expect(a01.parasites.map((p) => p.text)).toEqual(['Hitcher']);
    expect(model.species.find((s) => s.id === 'V01')!.hosts.map((h) => h.text)).toEqual(['Sprinter']);
    // Every enabled species, module, material, structure, tool and habitat has an entry.
    expect(model.species.map((s) => s.id)).toEqual(reg.manifest.enabledSpecies);
    expect(model.modules.map((s) => s.id)).toEqual(reg.manifest.enabledModules);
    expect(model.materials.map((s) => s.id)).toEqual(reg.manifest.enabledMaterials);
    expect(model.equipment.map((e) => e.id)).toEqual([...reg.manifest.enabledStructures!, ...reg.toolIds, ...reg.manifest.enabledHabitats]);
    // Modules appear in each species entry they can appear in (PROPOSED DECISION, G17 22).
    expect(model.species.find((s) => s.id === 'B01')!.abilities.map((a) => a.id)).toEqual(
      reg.manifest.enabledModules.filter((m) => reg.modules[m]!.eligibleAncestors.includes('B01')),
    );
    // No ranking words anywhere in what the guide shows.
    const text = JSON.stringify(model);
    expect(text).not.toMatch(/superior|advanced|perfect|adapted|immune/i);
  });
});

// --------------------------------------------------------- tray and guide read the same record

type Msg = ToWorker & { protocolVersion?: number };
let host: DishHost;
const sent: Msg[] = [];
class InProcessWorker {
  onmessage: ((ev: { data: FromWorker }) => void) | null = null;
  constructor() {
    host = new DishHost(registry(), (m) => queueMicrotask(() => this.onmessage?.({ data: m })), { now: () => 0 }, new SaveStore(new MemoryBackend()));
  }
  postMessage(msg: Msg): void {
    sent.push(msg);
    host.handle(msg);
  }
  terminate(): void {}
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('P3.8 the Lab tray and the Field Guide read the same tool records (D-0039)', () => {
  let ui: typeof UiState;
  beforeAll(async () => {
    vi.stubGlobal('Worker', InProcessWorker);
    ui = await import('../../src/ui/state');
    await ui.startRecipe('FIRST_DISH_V1', 'Garden');
    await flush();
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('Sample, Transfer, Clean water and Erase structure: tray lines are the record’s, and so are the guide’s', async () => {
    const tray = await import('../../src/ui/panels/LabTray');
    const { guideModel } = await import('../../src/ui/views/FieldGuideData');
    const reg = registry();
    const model = guideModel(reg);
    const pairs = [
      ['sample', 'SAMPLE'],
      ['transfer', 'TRANSFER'],
      ['cleanWater', 'CLEAN_WATER'],
      ['erase', 'ERASE_STRUCTURE'],
    ] as const;
    for (const [trayId, recId] of pairs) {
      const rec = reg.tools[recId]!;
      const copy = tray.itemCopy(trayId)!;
      expect(copy, trayId).toMatchObject({ name: rec.name, purpose: rec.guide.summary, habitats: rec.where, changes: rec.changes, unchanged: rec.doesNotChange, watch: rec.watchFor });
      const entry = model.equipment.find((e) => e.id === recId)!;
      expect(entry, recId).toMatchObject({ name: rec.name, summary: rec.guide.summary, changes: rec.changes, doesNotChange: rec.doesNotChange, watchFor: rec.watchFor });
      expect(entry.changes).toBe(copy.changes);
      expect(entry.doesNotChange).toBe(copy.unchanged);
      expect(entry.watchFor).toBe(copy.watch);
    }
    // Clean water's dose line fills in the chosen fraction from the record's template.
    const dose = tray.itemCopy('cleanWater')!.dose;
    expect(dose).toMatch(/^Removes \d+ % of every dissolved food/);
    expect(dose).toBe(reg.tools.CLEAN_WATER!.dose!.replace('{fraction}', /\d+ %/.exec(dose)![0]));
    // The moved copy is not duplicated in the strings any more.
    expect(readFileSync('src/ui/strings/tools.ts', 'utf8')).not.toContain('Lift part of the dish');
    expect(readFileSync('src/ui/strings/lab.ts', 'utf8')).not.toContain('Remove stones, walls and porous beads.');
  });

  it('syncing what the dish has shown asks the worker one read-only question and changes no world', async () => {
    const { syncRelationships } = await import('../../src/ui/views/FieldGuideNav');
    const info = ui.dishInfo.value!;
    const before = stateHash(host.world(info.dishId)!);
    const mark = sent.length;
    await syncRelationships();
    await flush();
    expect(sent.slice(mark).map((m) => m.type)).toEqual(['relationships']);
    expect(stateHash(host.world(info.dishId)!)).toBe(before);
  });
});
