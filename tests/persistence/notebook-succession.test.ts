/**
 * P5.6 part 3: the notebook kind 'succession' (src/persistence/notebookSuccession.ts; notebook.ts KIND_PROBLEMS;
 * SPEC §12.8; D02 §23; D-0070, D-0073, D-0131).
 *
 * - the validator refuses every malformed entry and line: an unknown field, an entry outside its minute, an
 *   invalid watched time, out-of-order or too many entries (> SUCCESSION_MAX), more than SUCCESSION_LINES_MAX lines,
 *   a line without evidence or with more than SUCCESSION_EVIDENCE_MAX ids, an evidence id outside the grammar or the
 *   minute, a value the writer never writes, a producer without its enzyme, an unrecorded death cause;
 * - against the dish the file carries (successionRefsProblem through notebookProblem's refs): a species, a time
 *   or an event id the dish never had;
 * - a record with the kind round-trips through buildSaveFile → loadSaveFile with the same world checksum, and a
 *   malformed one drops the notebook whole with NOTEBOOK_DROPPED_TEXT while the world loads (D-0073);
 * - Duplicate's favoritesOnly does not carry it; notebookIsEmpty counts it.
 */
import { describe, expect, it } from 'vitest';
import { buildSaveFile, loadSaveFile, type SaveFile } from '../../src/persistence/saveFile';
import { emptyNotebook, favoritesOnly, NOTEBOOK_DROPPED_TEXT, notebookIsEmpty, notebookProblem, sealNotebook, type NotebookRecord } from '../../src/persistence/notebook';
import {
  addSeenLinks,
  addSuccessionEntry,
  SUCCESSION_SEEN_MAX,
  successionSeenProblem,
  successionSeenRefsProblem,
  SUCCESSION_EVIDENCE_MAX,
  SUCCESSION_LINES_MAX,
  SUCCESSION_MAX,
  successionOf,
  successionProblem,
  successionRefsProblem,
  type SuccessionEntry,
  type SuccessionLine,
} from '../../src/persistence/notebookSuccession';
import { realizeRecipe } from '../../src/sim/recipes';
import { run } from '../../src/sim/tick';
import type { World } from '../../src/sim/world';
import { registry } from '../helpers/world';
import { goalWorldRefsOf } from '../../src/persistence/notebookGoals';

const REG = registry();
const META = { name: 'Succession dish', savedAt: '2026-10-18T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' };

const gain = (species = 'B01', extra: Partial<SuccessionLine> = {}): SuccessionLine => ({ kind: 'gain', species, value: 2.4, evidence: ['history:60', 'history:120'], ...extra });
/** An entry; without `lines`, one gain line with the minute's own bound samples (minute 1 starts at 0:01). */
function entry(minute: number, lines?: readonly SuccessionLine[], extra: Partial<SuccessionEntry> = {}): SuccessionEntry {
  const own = [gain('B01', { evidence: [`history:${Math.max(1, (minute - 1) * 60)}`, `history:${minute * 60}`] })];
  return { id: `succ-${minute}`, minute, fromTick: (minute - 1) * 600, toTick: minute * 600, lines: lines ?? own, ...extra };
}
const minute2 = (lines: readonly SuccessionLine[], extra: Partial<SuccessionEntry> = {}) => entry(2, lines, extra);

describe('successionProblem', () => {
  it('accepts every line kind the detector writes', () => {
    const lines: SuccessionLine[] = [
      gain(),
      { kind: 'loss', species: 'B06', value: 1.25, deaths: { DEATH_PREDATION: 12, DEATH_STARVATION: 1 }, evidence: ['history:60', 'history:120', 'event:41'] },
      { kind: 'newFeeding', species: 'B01', pool: 'sugar', enzyme: 'starch', producer: 'B06', evidence: ['intake:61:B01:sugar', 'reaction:starch:61:4500'] },
      { kind: 'newFeeding', species: 'B04', pool: 'detritus', value: 0.37, evidence: ['intake:90:B04:detritus'] },
      { kind: 'newFeeding', species: 'P01', prey: 'B01', evidence: ['event:77'] },
      { kind: 'extinction', species: 'B06', evidence: ['history:111', 'event:80'] },
      { kind: 'recovery', species: 'B12', value: 4, evidence: ['event:90', 'event:91'] },
    ];
    expect(successionProblem([entry(1), minute2(lines, { watchedFromTick: 841 })])).toBeNull();
    expect(successionProblem([])).toBeNull();
    // An empty minute is an entry with no lines ("Nothing changed enough to note this minute." is a rendering).
    expect(successionProblem([entry(1, [])])).toBeNull();
  });

  it('refuses each malformed entry or line', () => {
    const cases: [string, unknown, string][] = [
      ['not a list', {}, 'succession is not a list'],
      ['an unknown entry field', [{ ...entry(1), note: 'x' }], 'a succession entry has an unknown field "note"'],
      ['minute 0', [entry(0)], 'a succession entry has an invalid minute'],
      ['a wrong id', [{ ...entry(1), id: 'succ-2' }], 'a succession entry has an invalid id'],
      ['outside its minute', [{ ...entry(1), toTick: 601 }], 'a succession entry is outside its minute'],
      ['watched before its start', [entry(2, [gain()], { watchedFromTick: 600 })], 'a succession entry has an invalid watched time'],
      ['watched at its end', [entry(2, [gain()], { watchedFromTick: 1200 })], 'a succession entry has an invalid watched time'],
      ['out of order', [entry(2), entry(1)], 'succession entries are out of order'],
      ['two of one minute', [entry(1), entry(1)], 'succession entries are out of order'],
      ['too many entries', Array.from({ length: SUCCESSION_MAX + 1 }, (_, k) => entry(k + 1, [])), 'too many succession entries'],
      ['too many lines', [minute2(Array.from({ length: SUCCESSION_LINES_MAX + 1 }, () => gain()))], 'a succession entry has an invalid line list'],
      ['an unknown line field', [minute2([{ ...gain(), why: 'x' } as unknown as SuccessionLine])], 'a succession line has an unknown field "why"'],
      ['an unknown kind', [minute2([{ ...gain(), kind: 'boom' } as unknown as SuccessionLine])], 'a succession line has an unknown kind'],
      ['a lowercase species', [minute2([gain('b01')])], 'a succession line has an invalid species'],
      ['no evidence', [minute2([gain('B01', { evidence: [] })])], 'a succession line has no evidence'],
      ['too much evidence', [minute2([gain('B01', { evidence: Array.from({ length: SUCCESSION_EVIDENCE_MAX + 1 }, (_, k) => `event:${k}`) })])], 'a succession line has too much evidence'],
      ['a repeated evidence id', [minute2([gain('B01', { evidence: ['event:1', 'event:1'] })])], 'a succession line repeats an evidence id'],
      ['an evidence id outside the grammar', [minute2([gain('B01', { evidence: ['branch:1'] })])], 'a succession line has an invalid evidence id'],
      ['a sample outside its minute', [minute2([gain('B01', { evidence: ['history:59'] })])], 'a succession line names evidence outside its minute'],
      ['an intake outside its minute', [minute2([gain('B01', { evidence: ['intake:121:B01:sugar'] })])], 'a succession line names evidence outside its minute'],
      ['a cell the dish does not have', [minute2([gain('B01', { evidence: ['reaction:starch:70:16384'] })])], 'a succession line names a cell the dish does not have'],
      ['an unknown intake pool', [minute2([gain('B01', { evidence: ['intake:70:B01:glitter'] })])], 'a succession line names an unknown pool'],
      ['a value with three decimals', [minute2([gain('B01', { value: 2.405 })])], 'a succession line has an invalid value'],
      ['a negative value', [minute2([gain('B01', { value: -1 })])], 'a succession line has an invalid value'],
      ['a gain of 0', [minute2([gain('B01', { value: 0 })])], 'a succession line has no measured value'],
      ['a fractional recovery', [minute2([{ kind: 'recovery', species: 'B12', value: 1.5, evidence: ['event:9'] }])], 'a recovery line counts whole organisms'],
      ['an extinction with a value', [minute2([{ kind: 'extinction', species: 'B12', value: 1, evidence: ['history:100'] }])], 'an extinction line carries no value'],
      ['an extinction without its second', [minute2([{ kind: 'extinction', species: 'B12', evidence: ['event:100'] }])], 'an extinction line needs the history second it names'],
      ['a pool on a gain', [minute2([gain('B01', { pool: 'sugar' })])], 'a gain line has no field "pool"'],
      ['a feeding line with pool and prey', [minute2([{ kind: 'newFeeding', species: 'P01', pool: 'sugar', prey: 'B01', evidence: ['event:1'] }])], 'a feeding line names a pool or a prey'],
      ['an enzyme that does not make the pool', [minute2([{ kind: 'newFeeding', species: 'B01', pool: 'broth', enzyme: 'starch', evidence: ['event:1'] }])], 'a feeding line names an enzyme that does not make its pool'],
      ['a producer without its enzyme', [minute2([{ kind: 'newFeeding', species: 'B01', pool: 'sugar', producer: 'B06', evidence: ['event:1'] }])], 'a feeding line names a producer without its enzyme'],
      ['a catching line with a value', [minute2([{ kind: 'newFeeding', species: 'P01', prey: 'B01', value: 1, evidence: ['event:1'] }])], 'a catching line carries no value'],
      ['an unrecorded death cause', [minute2([{ kind: 'loss', species: 'B01', value: 1, deaths: { FOOD_ACCESS_LOW: 2 }, evidence: ['event:1'] }])], 'a loss line has an invalid death cause'],
      ['a zero death count', [minute2([{ kind: 'loss', species: 'B01', value: 1, deaths: { DEATH_AGE: 0 }, evidence: ['event:1'] }])], 'a loss line has an invalid death cause'],
    ];
    for (const [label, raw, message] of cases) expect(successionProblem(raw), label).toBe(message);
  });

  it('against the dish: a species, a time or an event it never had', () => {
    const refs = { speciesIds: ['B01', 'B06'], tick: 1200, nextEventId: 50 };
    expect(successionRefsProblem([entry(1), minute2([gain('B06', { evidence: ['event:49'] })])], refs)).toBeNull();
    expect(successionRefsProblem([entry(1, [gain('B12')])], refs)).toBe('a succession entry names a species this dish does not have');
    expect(successionRefsProblem([minute2([{ kind: 'newFeeding', species: 'B01', pool: 'sugar', enzyme: 'starch', producer: 'B12', evidence: ['event:1'] }])], refs)).toBe('a succession entry names a species this dish does not have');
    expect(successionRefsProblem([minute2([gain('B01', { evidence: ['intake:70:B12:sugar'] })])], refs)).toBe('a succession entry names a species this dish does not have');
    expect(successionRefsProblem([entry(3)], refs)).toBe('a succession entry records a time after the dish’s time');
    expect(successionRefsProblem([minute2([gain('B01', { evidence: ['event:50'] })])], refs)).toBe('a succession entry names an event this dish never had');
  });

  it('fix round 1: the seen-links kind (successionSeen) and its refs', () => {
    expect(successionSeenProblem([])).toBeNull();
    expect(successionSeenProblem([['pool:B01:sugar', 1], ['prey:P01:B01', 1], ['pool:B06:detritus', 3]])).toBeNull();
    const cases: [unknown, string][] = [
      [{}, 'successionSeen is not a list'],
      [[['pool:B01:glitter', 1]], 'a seen feeding link is invalid'],
      [[['pool:b01:sugar', 1]], 'a seen feeding link is invalid'],
      [[['pool:B01:sugar']], 'a seen feeding link is invalid'],
      [[['pool:B01:sugar', 0]], 'a seen feeding link has an invalid minute'],
      [[['pool:B01:sugar', 1.5]], 'a seen feeding link has an invalid minute'],
      [[['pool:B01:sugar', 2], ['prey:P01:B01', 1]], 'seen feeding links are out of order'],
      [[['pool:B01:sugar', 1], ['pool:B01:sugar', 2]], 'a feeding link is seen twice'],
      [Array.from({ length: SUCCESSION_SEEN_MAX + 1 }, (_, k) => [`prey:P${String(k).padStart(3, '0')}:B01`, 1]), 'too many seen feeding links'],
    ];
    for (const [raw, message] of cases) expect(successionSeenProblem(raw), JSON.stringify(raw).slice(0, 60)).toBe(message);
    const refs = { speciesIds: ['B01', 'P01'], tick: 1200 };
    expect(successionSeenRefsProblem([['prey:P01:B01', 2]], refs)).toBeNull();
    expect(successionSeenRefsProblem([['prey:P01:B06', 1]], refs)).toBe('a seen feeding link names a species this dish does not have');
    expect(successionSeenRefsProblem([['pool:B01:sugar', 3]], refs)).toBe('a seen feeding link records a time after the dish’s time');
    // addSeenLinks: new keys only, in order, while there is room.
    const a = addSeenLinks([['pool:B01:sugar', 1]], ['pool:B01:sugar', 'prey:P01:B01'], 2);
    expect(a.list).toEqual([['pool:B01:sugar', 1], ['prey:P01:B01', 2]]);
    expect([...a.added]).toEqual(['prey:P01:B01']);
    const full = Array.from({ length: SUCCESSION_SEEN_MAX }, (_, k) => [`prey:P${String(k).padStart(3, '0')}:B01`, 1] as const);
    expect(addSeenLinks(full, ['pool:B01:sugar'], 2).added.size).toBe(0);
  });

  it('addSuccessionEntry keeps minute order, replaces a minute, and removes the oldest beyond SUCCESSION_MAX', () => {
    let list: SuccessionEntry[] = [];
    for (let m = 1; m <= SUCCESSION_MAX + 2; m++) list = addSuccessionEntry(list, entry(m, []));
    expect(list).toHaveLength(SUCCESSION_MAX);
    expect(list[0]!.minute).toBe(3);
    expect(addSuccessionEntry([entry(1), entry(3)], entry(2)).map((e) => e.minute)).toEqual([1, 2, 3]);
    expect(addSuccessionEntry([entry(1)], entry(1, [])).map((e) => e.lines.length)).toEqual([0]);
  });
});

describe('the kind in a save file', () => {
  function garden(): World {
    const w = realizeRecipe(REG, 'FIRST_DISH_V1', { worldId: 'succ-dish' });
    run(w, 1300);
    return w;
  }

  /** Fix round 1: a gain or loss line with the dish's own measured change between two samples (the loader checks it). */
  function measured(w: World, lo: number, hi: number, extra: string[] = []): SuccessionLine {
    const a = w.history.seconds.find((x) => x.second === lo)!;
    const b = w.history.seconds.find((x) => x.second === hi)!;
    const s = w.species.findIndex((_, k) => Math.round(((b.biomass[k] ?? 0) - (a.biomass[k] ?? 0)) * 100) !== 0);
    expect(s).toBeGreaterThanOrEqual(0);
    const d = Math.round(((b.biomass[s] ?? 0) - (a.biomass[s] ?? 0)) * 100) / 100;
    return { kind: d > 0 ? 'gain' : 'loss', species: w.species[s]!.id, value: Math.abs(d), evidence: [`history:${lo}`, `history:${hi}`, ...extra] };
  }

  it('round-trips through buildSaveFile → loadSaveFile with the same world checksum; Duplicate does not carry it', async () => {
    const w = garden();
    const ev = [...w.events.ring].reverse().find((e) => e.tick >= 600 && e.tick <= 1200);
    const nb: NotebookRecord = {
      ...emptyNotebook(w.worldId),
      succession: [entry(1, [measured(w, 1, 60)]), minute2([measured(w, 61, 120, ev ? [`event:${ev.id}`] : [])], { watchedFromTick: 700 })],
      successionSeen: [['pool:B01:sugar', 1]],
    };
    expect(notebookIsEmpty(nb)).toBe(false);
    const built = await buildSaveFile(w, META, { notebook: nb, includeNicknames: true });
    const plain = await buildSaveFile(w, META);
    expect(built.checksum).toBe(plain.checksum);
    const loaded = await loadSaveFile(built.text);
    expect(loaded.notebookDropped).toBeNull();
    expect(successionOf(loaded.notebook)).toEqual(nb.succession);
    expect(loaded.notebook.checksum).toBe((JSON.parse(built.text) as SaveFile & { notebook: NotebookRecord }).notebook.checksum);
    // A copy of the dish starts with the favorites only (the entries belong to the world they were recorded in).
    expect(favoritesOnly(loaded.notebook, 'copy').succession).toBeUndefined();
    expect(loaded.notebook.successionSeen).toEqual(nb.successionSeen);
    expect(favoritesOnly(loaded.notebook, 'copy').successionSeen).toBeUndefined();
    expect(notebookIsEmpty({ ...emptyNotebook('x'), successionSeen: [['pool:B01:sugar', 1]] })).toBe(false);
  });

  it('fix round 1: refuses a gain or loss, a sample, an extinction or an event the dish never had (its history samples and event ring)', async () => {
    const w = garden();
    const refs = { speciesIds: w.species.map((x) => x.id), nextBirthId: w.counters.nextBirthId, tick: w.tick, ...goalWorldRefsOf(w) };
    const real = measured(w, 61, 120);
    expect(successionRefsProblem([minute2([real])], refs)).toBeNull();
    // The verifier's forged file: a gain of 999 carbon.
    expect(successionRefsProblem([entry(2, [{ kind: 'gain', species: real.species, value: 999, evidence: ['history:61', 'history:120'] }])], refs)).toBe('a succession entry records a biomass change this dish never had');
    expect(successionRefsProblem([minute2([{ ...real, value: real.value! + 0.5 }])], refs)).toBe('a succession entry records a biomass change this dish never had');
    expect(successionRefsProblem([minute2([{ ...real, kind: real.kind === 'gain' ? 'loss' : 'gain' }])], refs)).toBe('a succession entry records a biomass change this dish never had');
    expect(successionRefsProblem([minute2([{ ...real, evidence: ['history:61'] }])], refs)).toBe('a succession gain or loss needs the two samples it compares');
    // An extinction at a second the species still had members.
    const alive = w.species.findIndex((_, k) => (w.history.seconds.find((x) => x.second === 100)!.count[k] ?? 0) > 0);
    expect(successionRefsProblem([minute2([{ kind: 'extinction', species: w.species[alive]!.id, evidence: ['history:100'] }])], refs)).toBe('a succession entry records an extinction this dish never had');
    // An event the ring holds, outside the entry's minute.
    const late = w.events.ring.find((e) => e.tick > 1200);
    if (late) expect(successionRefsProblem([minute2([{ kind: 'recovery', species: refs.speciesIds[0]!, value: 1, evidence: [`event:${late.id}`] }])], refs)).toBe('a succession entry names an event outside its minute');
    // And through a sealed file: the notebook drops whole, the world loads.
    const good = await buildSaveFile(w, META, { notebook: { ...emptyNotebook(w.worldId), succession: [minute2([real])] }, includeNicknames: true });
    expect((await loadSaveFile(good.text)).notebookDropped).toBeNull();
    const file = JSON.parse(good.text) as SaveFile & { notebook: Record<string, unknown> };
    const forged = (await sealNotebook({ ...file.notebook, succession: [entry(2, [{ kind: 'gain', species: real.species, value: 999, evidence: ['history:61', 'history:120'] }])] })) as unknown as Record<string, unknown>;
    const loaded = await loadSaveFile(JSON.stringify({ ...file, notebook: forged }));
    expect(loaded.notebookDropped).toBe(NOTEBOOK_DROPPED_TEXT);
    expect(loaded.world.tick).toBe(w.tick);
  });

  it('a malformed entry, or one naming an event the dish never had, drops the notebook whole; the world loads', async () => {
    const w = garden();
    const good = await buildSaveFile(w, META, { notebook: { ...emptyNotebook(w.worldId), succession: [entry(1)] }, includeNicknames: true });
    const file = JSON.parse(good.text) as SaveFile & { notebook: Record<string, unknown> };
    const variants: Record<string, unknown>[] = [
      { ...file.notebook, succession: [entry(1, [gain('B01', { evidence: [] })])] },
      { ...file.notebook, succession: [entry(1, [gain('B01', { evidence: [`event:${w.counters.nextEventId}`] })])] },
      { ...file.notebook, succession: [entry(3)] },
    ];
    for (const v of variants) {
      const nb = (await sealNotebook(v as unknown as NotebookRecord)) as unknown as Record<string, unknown>;
      const loaded = await loadSaveFile(JSON.stringify({ ...file, notebook: nb }));
      expect(loaded.notebookDropped).toBe(NOTEBOOK_DROPPED_TEXT);
      expect(loaded.notebook).toEqual(emptyNotebook(w.worldId));
      expect(loaded.world.tick).toBe(w.tick);
    }
    // The good one still reads; notebookProblem without refs checks the shapes only.
    expect(await notebookProblem(file.notebook, w.worldId)).toBeNull();
  });
});
