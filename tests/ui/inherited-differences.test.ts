/**
 * G2 comprehension M2 (labels and event evidence from recorded birth records only):
 * (a) the inspector's "Passed to offspring" lead states both comparisons — with its parent and with its
 *     line's founder — instead of "Same inherited traits as its parent." beside a listed difference;
 * (b) the event line of a quantitative inherited change names the trait and both values
 *     ("A Sprinter offspring inherited a lower Division value (parent 50 → 48)."); a burst coalesces.
 * Also m11: death lines read "A Recycler died — it …" / "2 Sprinters died — they …".
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { clearFeed, feed, pushFeed } from '../../src/ui/feed';
import { inheritedLead, locusNote } from '../../src/ui/strings/inherited';
import { MUT_MODULE_GAIN, MUT_PREF, MUT_QUANT } from '../../src/sim/mutation';
import { field } from '../../src/sim/lineage';
import { R } from '../../src/sim/reasons';
import { realizeRecipe } from '../../src/sim/recipes';
import { step } from '../../src/sim/tick';
import { buildInspector, lociOfBirth, visualEvents } from '../../src/worker/snapshot';
import type { EntityInspect, VisualEvent } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

const SPECIES = ['Sunbead', 'Sprinter', 'Recycler'];
const lines = () => feed.value.map((l) => l.text);
const ALL = [true, true, true, true, true, true, true, false];

function quant(tick: number, species: number, locus: number, from: number, to: number, flags = MUT_QUANT): VisualEvent {
  return { type: 'mutation', tick, species, cell: 0, birthId: tick, mutation: { flags, delta: to - from, module: null, locus, from, to } };
}

type G = EntityInspect['genome'];
function view(loci: number[], over: Partial<G> & { generation?: number } = {}) {
  const { generation = 3, ...g } = over;
  return {
    generation,
    lociActiveEffective: ALL,
    genome: { id: 'abc123', loci, lociActive: ALL, ancestorLoci: loci.map(() => 50), modules: [], changedFromParent: false, ...g },
  };
}

describe('M2 (a): the lead sentence states both comparisons', () => {
  const N = [50, 50, 50, 50, 50, 50, 50, 50];
  it('inherited unchanged from its parent, but different from its founder (the case the review met)', () => {
    const e = view([50, 50, 50, 45, 50, 50, 50, 50], { parentLoci: [50, 50, 50, 45, 50, 50, 50, 50], founderLoci: N });
    expect(inheritedLead(e)).toBe('Inherited from its parent unchanged. Differs from the founder of its line: Division 45 (founder 50).');
    expect(inheritedLead(e)).not.toContain('Same inherited traits');
    expect(locusNote(e, 3)).toBe(' (founder 50)');
    expect(locusNote(e, 0)).toBe('');
  });

  it('a change from its parent names the trait and the parent value', () => {
    const e = view([50, 50, 50, 50, 48, 50, 50, 50], { changedFromParent: true, parentLoci: N, founderLoci: N });
    expect(inheritedLead(e)).toBe('Inherited a change from its parent: pH preference 48 (parent 50). Differs from the founder of its line: pH preference 48 (founder 50).');
    expect(locusNote(e, 4)).toBe(' (parent 50 · founder 50)');
  });

  it('same as parent and founder; a change that is not a trait value; a founder; a summarized parent record', () => {
    expect(inheritedLead(view(N, { parentLoci: N, founderLoci: N }))).toBe('Inherited from its parent unchanged. Same trait values as the founder of its line.');
    expect(inheritedLead(view(N, { changedFromParent: true, parentLoci: N, founderLoci: N }))).toMatch(/^Inherited a change from its parent \(a food preference or an extra ability; see below\)\./);
    expect(inheritedLead(view(N, { generation: 0, parentLoci: null, founderLoci: N }))).toBe('A founder: it has no parent in this dish.');
    expect(inheritedLead(view([50, 52, 50, 50, 50, 50, 50, 50], { parentLoci: null, founderLoci: N }))).toBe(
      "Its parent's record was summarized, so it can't be compared with its parent. Differs from the founder of its line: Feeding 52 (founder 50).",
    );
    // Without either record (an older payload), the note falls back to the difference from 50.
    expect(locusNote(view([50, 52, 50, 50, 50, 50, 50, 50]), 1)).toBe(' (+2 from the ancestor)');
  });

  it('inactive loci are never listed', () => {
    const e = { ...view([50, 50, 50, 50, 50, 50, 50, 40], { parentLoci: N, founderLoci: N }), lociActiveEffective: [true, true, true, true, true, true, true, false] };
    expect(inheritedLead(e)).toBe('Inherited from its parent unchanged. Same trait values as the founder of its line.');
  });
});

describe('M2 (b): event lines name the trait and both values', () => {
  beforeEach(() => clearFeed());

  it('one change: lower or higher, with parent → offspring values', () => {
    pushFeed([quant(10, 1, 3, 50, 48)], SPECIES);
    expect(lines()).toEqual(['A Sprinter offspring inherited a lower Division value (parent 50 → 48).']);
    clearFeed();
    pushFeed([quant(10, 0, 4, 50, 55)], SPECIES);
    expect(lines()).toEqual(['A Sunbead offspring inherited a higher pH preference value (parent 50 → 55).']);
    clearFeed();
    pushFeed([quant(10, 0, 4, 50, 55, MUT_QUANT | MUT_PREF)], SPECIES);
    expect(lines()).toEqual(['A Sunbead offspring inherited a higher pH preference value (parent 50 → 55), and a shifted food preference.']);
  });

  it('a burst coalesces into one line that lists the recorded values', () => {
    pushFeed([quant(10, 0, 3, 50, 45), quant(12, 0, 4, 50, 55)], SPECIES);
    expect(lines()).toEqual(['2 Sunbead offspring inherited different traits: Division 50 → 45; pH preference 50 → 55.']);
    // A birth whose values were not sent (another kind of change) is counted, not invented.
    pushFeed([{ type: 'mutation', tick: 14, species: 0, cell: 0, birthId: 14, mutation: { flags: MUT_PREF, delta: 0, module: null } }], SPECIES);
    expect(lines()).toEqual(['3 Sunbead offspring inherited different traits: Division 50 → 45; pH preference 50 → 55; 1 other change.']);
    // More than four values: the rest are counted.
    clearFeed();
    pushFeed([0, 1, 2, 3, 4, 5].map((k) => quant(10 + k, 1, k, 50, 48)), SPECIES);
    expect(lines()).toEqual(['6 Sprinter offspring inherited different traits: Motility 50 → 48; Feeding 50 → 48; Sensing 50 → 48; Division 50 → 48; 2 other changes.']);
  });

  it('without recorded values the line keeps its old wording; module gains keep their own line', () => {
    pushFeed([{ type: 'mutation', tick: 10, species: 1, cell: 0, birthId: 10, mutation: { flags: MUT_QUANT, delta: 2, module: null } }], SPECIES);
    expect(lines()).toEqual(['A Sprinter offspring inherited a different trait.']);
    clearFeed();
    pushFeed([{ type: 'mutation', tick: 10, species: 0, cell: 0, birthId: 10, mutation: { flags: MUT_MODULE_GAIN, delta: 0, module: 'E05' } }], SPECIES, () => 'Reserve chamber');
    pushFeed([quant(11, 0, 3, 50, 48)], SPECIES);
    expect(lines()).toEqual(['A Sunbead offspring inherited a lower Division value (parent 50 → 48).', 'A Sunbead offspring gained Reserve chamber.']);
  });
});

describe('m11: death lines read naturally', () => {
  beforeEach(() => clearFeed());
  it('one: "A Recycler died — it ran out of energy."; several: "… they ran out of energy."', () => {
    const death = (tick: number, species: number, cause: number): VisualEvent => ({ type: 'death', tick, species, cell: 0, birthId: tick, cause });
    pushFeed([death(10, 2, R.DEATH_STARVATION)], SPECIES);
    expect(lines()).toEqual(['A Recycler died — it ran out of energy.']);
    pushFeed([death(11, 2, R.DEATH_STARVATION)], SPECIES);
    expect(lines()).toEqual(['2 Recyclers died — they ran out of energy.']);
    pushFeed([death(12, 1, R.DEATH_PREDATION), death(13, 1, R.DEATH_PREDATION), death(14, 1, R.DEATH_AGE)], SPECIES);
    expect(lines().slice(0, 2)).toEqual(['A Sprinter died — it reached the end of its life.', '2 Sprinters died — they were eaten.']);
  });
});

describe('through the simulation: every value comes from the recorded birth records', () => {
  it('Garden seed 104729: quantitative changes carry the parent and offspring values, and the inspector compares them', () => {
    const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { worldId: 'inherited', seed: 104729 });
    const events: VisualEvent[] = [];
    let last = 0;
    for (let t = 0; t < 700; t++) {
      step(w);
      events.push(...visualEvents(w.events.ring, last, w.content.modules, lociOfBirth(w)));
      last = w.counters.nextEventId - 1;
    }
    const quants = events.filter((e) => e.type === 'mutation' && e.mutation && (e.mutation.flags & MUT_QUANT) !== 0);
    expect(quants.length).toBeGreaterThan(0);
    for (const e of quants) {
      const m = e.mutation!;
      expect(m.locus).toBe(field(w.lineage, 'mutLocus', e.birthId));
      const parent = field(w.lineage, 'parent', e.birthId)!;
      expect(m.from).toBe(w.genomes.get(field(w.lineage, 'genome', parent)!).loci[m.locus!]);
      expect(m.to).toBe(w.genomes.get(field(w.lineage, 'genome', e.birthId)!).loci[m.locus!]);
      expect(m.to! - m.from!).toBe(m.delta);
    }
    clearFeed();
    pushFeed([quants[0]!], w.species.map((s) => s.def.name));
    expect(lines()[0]).toMatch(/^A \w+ offspring inherited a (lower|higher) [\w ]+ value \(parent \d+ → \d+\)\.$/);

    // The inspector of a living offspring: its parent's and its founder's recorded loci.
    const c = w.ents.cols;
    let checked = 0;
    for (let i = 0; i < w.ents.highWater && checked < 25; i++) {
      if (c.alive[i] !== 1 || c.generation[i] === 0) continue;
      const e = buildInspector(w, { kind: 'entity', birthId: c.birthId[i]! }).entity!;
      const parent = field(w.lineage, 'parent', e.birthId)!;
      expect(e.genome.parentLoci).toEqual(w.genomes.get(field(w.lineage, 'genome', parent)!).loci);
      expect(e.genome.founderLoci).toEqual(w.genomes.get(field(w.lineage, 'genome', e.founderOrigin!.founderBirthId)!).loci);
      const lead = inheritedLead(e);
      expect(lead).toMatch(e.genome.changedFromParent ? /^Inherited a change from its parent/ : /^Inherited from its parent unchanged\./);
      expect(lead).toMatch(/founder of its line/);
      expect(lead).not.toMatch(/undefined|NaN/);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
