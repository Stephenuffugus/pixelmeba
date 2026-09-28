/**
 * P2.3 lineage panel queries (UX §5.5): buildLineage() and packLineageMarks() are pure reads of
 * recorded state — names, states, compare-ancestor values, the founder's recorded family, specimens
 * and the renderer's per-organism trait bands — and never change the world.
 */
import { describe, expect, it } from 'vitest';
import { applyNow } from '../../src/sim/commands';
import { BAND_NONE, bandOf, buildLineage, MARK_MEMBER, packLineageMarks, TRAIT_BANDS } from '../../src/sim/lineage';
import { realizeRecipe } from '../../src/sim/recipes';
import { stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { activeLoci } from '../../src/sim/phenotype';
import { packEntities } from '../../src/worker/snapshot';
import { ID_STRIDE } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

function accelerated() {
  const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { seed: 101, worldId: 'lineage-panel', transform: (r) => ({ ...r, mutationPreset: 'accelerated' }) });
  run(w, 1600);
  return w;
}

describe('P2.3 lineage panel data', () => {
  const w = accelerated();

  it('bands cover 0–100 without gaps', () => {
    expect(TRAIT_BANDS[0]![0]).toBe(0);
    expect(TRAIT_BANDS[TRAIT_BANDS.length - 1]![1]).toBe(100);
    for (let b = 1; b < TRAIT_BANDS.length; b++) expect(TRAIT_BANDS[b]![0]).toBe(TRAIT_BANDS[b - 1]![1] + 1);
    expect([0, 39, 40, 50, 53, 54, 61, 100].map(bandOf)).toEqual([0, 0, 1, 2, 2, 3, 4, 4]);
  });

  it('lists branches with generated names, states and a selected branch in detail; reads never change the world', () => {
    expect(w.branches.established).toBeGreaterThanOrEqual(1);
    const hash = stateHash(w);
    const ans = buildLineage(w, { branch: 0 });
    expect(stateHash(w)).toBe(hash);
    const row = ans.branches[0]!;
    expect(row.name).toBe(row.generatedName);
    expect(row.name.startsWith(`${ans.species[row.species]!.name} · ${row.descriptor} · `)).toBe(true);
    expect(row.state).toBe('established');
    expect(ans.loci).toHaveLength(8);
    const det = ans.selected!;
    expect(det.branch).toBe(0);
    expect(det.ancestorLabel).toMatch(/founders$|·/);
    // Compare ancestor: side-by-side reference values; living members summarized per active locus.
    const br = w.branches.branches[0]!;
    expect(det.compare.map((r) => r.branch)).toEqual([...w.genomes.get(br.refGenome).loci]);
    expect(det.compare.map((r) => r.ancestor)).toEqual([...w.genomes.get(br.ancestorGenome!).loci]);
    for (const r of det.compare) if (r.living) expect(r.living.min <= r.living.median && r.living.median <= r.living.max).toBe(true);
    expect(det.livingTotal).toBe(buildLineage(w).branches[0]!.living);
    expect(det.members.length).toBe(Math.min(200, det.livingTotal));
    // The founder's recorded family: its own record and its parent's two children.
    expect(det.family.root?.birthId).toBe(br.rootBirthId);
    if (det.family.parent) expect([...det.family.siblings.map((s) => s.birthId), br.rootBirthId]).toHaveLength(2);
    // Asking by organism finds its branch.
    const member = det.members[0];
    if (member) expect(buildLineage(w, { birthId: member.birthId }).focusBranch).toBe(member.branch);
  });

  it('a renamed branch shows the player name with its ID, and specimens are listed with a label', () => {
    const w2 = accelerated();
    applyNow(w2, 'r', { kind: 'lineage', op: 'rename', branch: 0, name: 'Quick ones' });
    applyNow(w2, 's', { kind: 'lineage', op: 'saveSpecimen', from: 'branch', id: 0 });
    const ans = buildLineage(w2);
    expect(ans.branches[0]!.name).toBe(`Quick ones · ${ans.branches[0]!.shortId}`);
    expect(ans.branches[0]!.customName).toBe('Quick ones');
    expect(ans.specimens[0]!.label).toBe(`Specimen 1 · Quick ones · ${ans.branches[0]!.shortId}`);
  });

  it('trait marks follow snapshot order and use only real genome values', () => {
    const packed = packEntities(w, null, null);
    const locus = 1; // feeding: active for every species here
    const m = packLineageMarks(w, locus, 0);
    expect(m.marks.length).toBeGreaterThanOrEqual(packed.count);
    const c = w.ents.cols;
    const slotOf: Record<number, number> = {};
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1) slotOf[c.birthId[i]!] = i;
    let members = 0;
    const counts = new Array<number>(TRAIT_BANDS.length).fill(0);
    for (let k = 0; k < packed.count; k++) {
      const slot = slotOf[packed.ids[k * ID_STRIDE]!]!;
      const g = w.genomes.get(c.genome[slot]!);
      const active = activeLoci(w.species[c.species[slot]!]!, g)[locus];
      const band = m.marks[k]! & 7;
      expect(band).toBe(active ? bandOf(g.loci[locus]!) : BAND_NONE);
      if (active) counts[band]!++;
      let b = c.branchId[slot]!;
      while (b > 0) b = w.branches.branches[b]!.parentBranch; // walk up to branch 0 or the ancestral line
      const isMember = b === 0;
      expect((m.marks[k]! & MARK_MEMBER) !== 0).toBe(isMember);
      if (isMember) members++;
    }
    expect(m.bandCounts).toEqual(counts);
    expect(m.members).toBe(members);
    // Off: nothing marked.
    const off = packLineageMarks(w, null, null);
    expect(Array.from(off.marks.subarray(0, packed.count)).every((v) => v === BAND_NONE)).toBe(true);
  });
});
