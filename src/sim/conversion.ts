/**
 * Stage 3 — conversion (SPEC §5): finite food release (later), grit dissolution (later) and enzyme
 * catalysis. Each enzyme converts its own substrate into its product from the pre-reaction pools:
 *   converted = min(substrate, 0.10 × activity/(1 + breaker) × dt)
 * Carbon and its proportional bound nutrient move together; products are available to feeding in
 * this same tick (stage 6) and cannot chain through another enzyme until the next tick.
 */
import { DT, ENZYME_CONVERSION } from './constants';
import { milestone } from './events';
import type { FieldId } from './fields';
import { maskCells } from './grid';
import { isFieldActive, markField } from './transport';
import { subtractPool } from './ledger';
import type { World } from './world';

interface EnzymeRule {
  readonly activity: FieldId;
  readonly substrate: FieldId;
  readonly substrateN: FieldId;
  readonly product: FieldId;
  readonly productN: FieldId | null;
  readonly name: string;
}

const RULES: readonly EnzymeRule[] = [
  { activity: 'eStarch', substrate: 'starch', substrateN: 'starchN', product: 'sugar', productN: 'sugarN', name: 'starch' },
  { activity: 'eOil', substrate: 'oil', substrateN: 'oilN', product: 'metabolite', productN: null, name: 'oil' },
  { activity: 'eProtein', substrate: 'protein', substrateN: 'proteinN', product: 'broth', productN: 'brothN', name: 'protein' },
];

export interface ConversionTally {
  /** Carbon converted per rule this tick (observation; also accumulated per second for stories). */
  starch: number;
  oil: number;
  protein: number;
}

export function stageConversion(world: World): void {
  const cells = maskCells();
  const breaker = world.fields.breaker;
  const tally = world.conversionTally;
  tally.starch = 0;
  tally.oil = 0;
  tally.protein = 0;
  const seen = world.catalysisCells;
  seen.fill(0);
  for (const r of RULES) {
    const act = world.fields[r.activity];
    const sub = world.fields[r.substrate];
    const subN = world.fields[r.substrateN];
    const prod = world.fields[r.product];
    if (!act || !sub || !subN || !prod || !isFieldActive(world, r.activity)) continue;
    const prodN = r.productN ? world.fields[r.productN] : undefined;
    let total = 0;
    for (let k = 0; k < cells.length; k++) {
      const i = cells[k]!;
      const a = act[i]!;
      if (a <= 0) continue;
      const s = sub[i]!;
      if (s <= 0) continue;
      const eff = breaker ? a / (1 + breaker[i]!) : a;
      const converted = Math.min(s, ENZYME_CONVERSION * eff * DT);
      if (converted <= 0) continue;
      const nMoved = converted === s ? subN[i]! : (subN[i]! * converted) / s;
      if (converted === s) sub[i] = 0;
      else subtractPool(world, sub, i, converted, 'c');
      subtractPool(world, subN, i, nMoved, 'n');
      prod[i]! += converted;
      if (prodN) prodN[i]! += nMoved;
      else if (nMoved > 0) world.fields.nutrient![i]! += nMoved; // product without companion: release N free
      total += converted;
      seen[i]! += converted;
    }
    if (total > 0) {
      markField(world, r.product);
      if (r.productN) markField(world, r.productN);
      else markField(world, 'nutrient');
      tally[r.name as keyof ConversionTally] = total;
      world.conversionTotals[r.name as keyof ConversionTally] += total;
      milestone(world.events, `firstConversion:${r.name}`, world.tick);
    }
  }
}
