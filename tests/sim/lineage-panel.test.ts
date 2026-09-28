/**
 * P2.3 lineage panel queries (UX §5.5): buildLineage() and packLineageMarks() are pure reads of
 * recorded state — names, states, compare-ancestor values, the founder's recorded family, specimens
 * and the renderer's per-organism trait bands — and never change the world.
 */
import { describe, expect, it } from 'vitest';
import { applyNow } from '../../src/sim/commands';
import { BAND_NONE, bandOf, buildLineage, MARK_MEMBER, packLineageMarks, TRAIT_BANDS } from '../../src/sim/lineage';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, stateHash } from '../../src/sim/serialize';
import { run } from '../../src/sim/tick';
import { activeLoci } from '../../src/sim/phenotype';
import { packEntities } from '../../src/worker/snapshot';
import { ID_STRIDE } from '../../src/worker/protocol';
import { bandLabel, discoveryLines } from '../../src/ui/strings/lineage';
import { registry } from '../helpers/world';

function accelerated() {
  const w = realizeRecipe(registry(), 'FIRST_DISH_V1', { seed: 101, worldId: 'lineage-panel', transform: (r) => ({ ...r, mutationPreset: 'accelerated' }) });
  run(w, 1600);
  return w;
}

describe('P2.3 lineage panel data', () => {
  const w = accelerated();
  /** An independent copy of the same world (save/reload is exact), for tests that apply commands. */
  const copy = () => deserializeWorld(JSON.parse(JSON.stringify(serializeWorld(w))));

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
    // On an ancestral line the reference is the one founder genome of that line (singular).
    expect(det.ancestorLabel).toMatch(/^The \S+ founder of this line$|·/);
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
    const w2 = copy();
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
    // Motility is not active for Sunbeads (A01): they get no band and are counted as inactive.
    const mot = packLineageMarks(w, 0, null);
    const a01 = w.species.findIndex((sp) => sp.id === 'A01');
    let sunbeads = 0;
    for (let i = 0; i < w.ents.highWater; i++) if (c.alive[i] === 1 && c.species[i] === a01) sunbeads++;
    expect(sunbeads).toBeGreaterThan(0);
    expect(mot.inactive).toBe(sunbeads);
    expect(mot.bandCounts.reduce((a, b) => a + b, 0)).toBe(packed.count - sunbeads);
  });

  it('a branch row carries the recorded costs of the difference it is named after', () => {
    const ans = buildLineage(w);
    for (const row of ans.branches) {
      const br = w.branches.branches[row.id]!;
      expect(row.trait).toEqual(br.trait);
      if (row.trait?.kind === 'module') {
        const id = row.trait.module;
        const def = w.content.modules.find((m) => m.id === id)!;
        expect(row.module).toEqual({ id: def.id, name: def.name, surchargePerSecond: def.surchargePerSecond, params: { ...def.params } });
        expect(row.descriptor).toBe(row.trait.gained ? def.name : `Without ${def.name.charAt(0).toLowerCase()}${def.name.slice(1)}`);
        expect(row.locusValues).toBeNull();
      } else if (row.trait?.kind === 'locus') {
        expect(row.locusValues).toEqual({ ancestor: w.genomes.get(br.ancestorGenome!).loci[row.trait.locus], branch: w.genomes.get(br.refGenome).loci[row.trait.locus] });
        expect(row.module).toBeNull();
      }
      expect(row.membersAtEstablish).toBeGreaterThanOrEqual(5);
      expect(row.depthAtEstablish).toBeGreaterThanOrEqual(3);
    }
  });

  it('wording: one founder genome is the reference; the middle band names its range, not "the founders’ 50"', () => {
    const ans = buildLineage(w, { branch: 0 });
    const row = ans.branches[0]!;
    expect(row.parentBranch).toBe(-1);
    const sp = ans.species[row.species]!.name;
    expect(ans.selected!.ancestorLabel).toBe(`The ${sp} founder of this line`);
    expect(discoveryLines(row, ans)[0]).toBe(`Ancestor: the ${sp} founder of this line.`);
    const loc = ans.loci[1];
    expect(bandLabel(2, loc)).toBe('47–53 · middle');
    for (let b = 0; b < TRAIT_BANDS.length; b++) expect(bandLabel(b, loc)).not.toMatch(/founders/);
    expect(bandLabel(0, loc)).toBe(`0–39 · far ${loc!.low} side`);
  });

  it('unknown branches, bad ids and bad footprints are refused and change nothing', () => {
    const w3 = copy();
    expect(applyNow(w3, 'x1', { kind: 'lineage', op: 'pin', branch: 99, pinned: true }).result).toMatchObject({ accepted: 0 });
    expect(applyNow(w3, 'x2', { kind: 'lineage', op: 'saveSpecimen', from: 'branch', id: 1.5 }).result).toMatchObject({ accepted: 0 });
    expect(applyNow(w3, 'x3', { kind: 'lineage', op: 'spawnSpecimen', specimen: 1, x: 64, y: 64, radius: 3, count: 1 }).result).toMatchObject({ accepted: 0 });
    // Only the command log and its sequence counter moved (a refused command is still recorded).
    const w4 = copy();
    for (const id of ['x1', 'x2', 'x3']) applyNow(w4, id, w3.commands.log.find((c) => c.commandId === id)!.payload);
    expect(stateHash(w4)).toBe(stateHash(w3));
    expect(w3.branches.specimens).toBeUndefined();
    expect(w3.branches.branches.every((b) => !b.pinned)).toBe(true);
  });
});
