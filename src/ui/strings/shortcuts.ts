/**
 * Inspector shortcuts (SPEC §12.1, UX §5.3): "What does it eat?", "Why did it stop?",
 * "Where is its family?". Every sentence is built from the worker's inspector or family payload —
 * recorded diet rules, reason codes and measured values — never from art or guesses. Explore
 * wording; no claims such as "adapted", "immune" or "superior".
 */
import { R } from '@sim/reasons';
import type { EntityInspect, FamilyAnswer, FamilyMember } from '@worker/protocol';
import { reasonText } from './reasons';
import { lifeStateWhile } from './modules';

const FOOD_WORDS: Readonly<Record<string, string>> = {
  sugar: 'sugar',
  starch: 'starch',
  oil: 'oil',
  protein: 'protein',
  broth: 'broth',
  detritus: 'debris',
  metabolite: 'metabolite',
  film: 'biofilm',
};

export function foodWord(food: string): string {
  return FOOD_WORDS[food] ?? food;
}

/** "a", "a and b", "a, b and c". */
export function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]!}`;
}

export interface ShortAnswer {
  readonly title: string;
  readonly lines: readonly string[];
}

/** "What does it eat?" — its recorded diet, what it can unlock, and what is in its cell now. */
export function dietAnswer(e: EntityInspect, speciesNames: readonly string[]): ShortAnswer {
  const lines: string[] = [];
  const d = e.diet;
  const foods = e.profile.foods;
  if (d.metabolism === 'photosynthesis' || d.metabolism === 'mixotroph') lines.push('It makes its own food from light, carbon dioxide and minerals.');
  const predator = d.prey.length > 0 || d.abilities.includes('PREDATION');
  if (predator) {
    const names = d.prey.map((j) => speciesNames[j]).filter((n): n is string => typeof n === 'string');
    lines.push(names.length > 0 ? `It catches other organisms. In this dish it can catch: ${listWords(names)}.` : 'It catches other organisms, but nothing in this dish is its prey.');
  }
  if (foods.length > 0) {
    const words = foods.map(foodWord);
    if (words.length === 1) lines.push(`It eats ${words[0]!}.`);
    else if (e.profile.policy === 'ordered') lines.push(`It eats ${listWords(words)}, in that order of preference.`);
    else lines.push(`It eats ${listWords(words)}, mixed by its inherited preference.`);
  }
  if (d.digestsFilm) lines.push('It can also digest biofilm as debris.');
  if (d.abilities.includes('E_STARCH_SECRETION') || e.genome.modules.includes('E01')) {
    lines.push(
      foods.includes('starch')
        ? 'It also releases an enzyme that turns nearby starch into sugar that anyone nearby can eat.'
        : "It can't eat starch itself, but it releases an enzyme that turns nearby starch into sugar that anyone nearby can eat.",
    );
  }
  if (lines.length === 0) lines.push('No food rule is recorded for it.');
  if (foods.length > 0) {
    const here = e.foodHere.filter((f) => f.amount > 1e-6);
    lines.push(here.length > 0 ? `In its cell now: ${here.map((f) => `${foodWord(f.food)} ${f.amount.toFixed(3)}`).join(', ')}.` : 'None of its foods is in its cell right now.');
  }
  if (e.predation) lines.push(reasonText(e.predation.code, 'explore'));
  lines.push(
    e.intakeLastSecond <= 0
      ? 'It took in nothing in the last second.'
      : e.intakeLastSecond < 0.0001
        ? 'It took in a trace of carbon (under 0.0001) in the last second.'
        : `It took in ${e.intakeLastSecond.toPrecision(2)} carbon in the last second.`,
  );
  return { title: 'What it eats', lines };
}

export interface StopItem {
  readonly code: number;
  /** Explore wording from the reason code. */
  readonly text: string;
  /** The measured value behind it. */
  readonly detail: string;
}

export interface StopAnswer {
  readonly title: string;
  readonly items: readonly StopItem[];
}

function blockerDetail(e: EntityInspect, code: number): string {
  switch (code) {
    case R.DIV_BLOCK_BIOMASS:
      return `Body ${e.B.toFixed(2)} of ${e.divisionNeeds.biomass.toFixed(2)} needed.`;
    case R.DIV_BLOCK_ENERGY:
      return `Energy ${Math.floor(e.E)} of ${Math.ceil(e.divisionNeeds.energy)} needed.`;
    case R.DIV_BLOCK_HEALTH:
      return `Health ${Math.floor(e.H)} of ${e.divisionNeeds.health} needed.`;
    case R.DIV_BLOCK_AGE:
      return `Age ${Math.floor(e.age)} s of ${Math.ceil(e.divisionNeeds.age)} s.`;
    case R.DIV_BLOCK_STATE:
      return `Can't split while ${lifeStateWhile(e.lifeState)}.`;
    default:
      return reasonText(code, 'lab');
  }
}

/**
 * "Why did it stop?" — every division blocker with its measured value, plus the strongest current
 * constraint when it is not already one of them. Several at once ⇒ "A few things are slowing it down."
 */
export function stopAnswer(e: EntityInspect): StopAnswer {
  const items: StopItem[] = e.divisionBlockers.map((code) => ({ code, text: reasonText(code, 'explore'), detail: blockerDetail(e, code) }));
  if (e.limitCode !== R.NONE && !e.divisionBlockers.includes(e.limitCode)) {
    items.unshift({ code: e.limitCode, text: reasonText(e.limitCode, 'explore'), detail: reasonText(e.limitCode, 'lab', { value: e.limitValue }) });
  }
  if (e.predation && e.predation.code !== R.NONE) items.push({ code: e.predation.code, text: reasonText(e.predation.code, 'explore'), detail: reasonText(e.predation.code, 'lab') });
  let title: string;
  if (items.length === 0) title = e.proposalPending ? reasonText(R.DIV_PENDING_PROPOSAL, 'explore') : 'Nothing is holding it back right now. It is ready to split.';
  else if (items.length === 1) title = items[0]!.text;
  else title = reasonText(R.MIXED_CAUSES, 'explore');
  return { title, items };
}

const gens = (n: number) => `${n} ${n === 1 ? 'generation' : 'generations'}`;

export function relationLabel(m: FamilyMember): string {
  switch (m.relation) {
    case 'parent':
      return 'parent';
    case 'ancestor':
      return `ancestor, ${gens(m.stepsUp)} back`;
    case 'child':
      return 'daughter';
    case 'descendant':
      return `descendant, ${gens(m.stepsDown)} on`;
    case 'sibling':
      return 'sibling (same parent)';
    case 'relative':
      return m.stepsUp === 2 && m.stepsDown === 2 ? 'cousin (same grandparent)' : `relative (shared ancestor ${gens(m.stepsUp)} back)`;
  }
}

/** "Where is its family?" — words for the worker's family answer. */
export function familySummary(f: FamilyAnswer): ShortAnswer {
  const lines: string[] = [];
  if (f.parent) {
    lines.push(f.parent.alive ? `Its parent #${f.parent.birthId} is alive.` : f.parent.divided ? `Its parent #${f.parent.birthId} split in two to make it.` : `Its parent #${f.parent.birthId} is no longer alive.`);
  } else if (!f.historyIncomplete) {
    lines.push('It was added to the dish, so its family starts with it.');
  }
  if (f.parent && f.rootIntroduced && f.rootBirthId !== f.birthId) lines.push(`Its family starts with #${f.rootBirthId}, which was added to the dish.`);
  if (f.livingTotal === 0) lines.push('No other members of its family are alive right now.');
  else {
    const counts: Record<string, number> = {};
    for (const m of f.members) {
      const k = m.relation === 'child' ? 'daughter' : m.relation === 'relative' || m.relation === 'descendant' || m.relation === 'ancestor' ? 'other relative' : m.relation;
      counts[k] = (counts[k] ?? 0) + 1;
    }
    const order = ['parent', 'sibling', 'daughter', 'other relative'];
    // Break the total down only when every member is listed, so the parts always add up.
    const parts = f.members.length === f.livingTotal ? order.filter((k) => counts[k]).map((k) => `${counts[k]!} ${k}${counts[k] === 1 ? '' : 's'}`) : [];
    lines.push(`${f.livingTotal} other living ${f.livingTotal === 1 ? 'member' : 'members'} of its family${parts.length ? `: ${listWords(parts)}` : ''}.`);
    if (f.members.length < f.livingTotal) lines.push(`Showing the closest ${f.members.length}.`);
  }
  if (f.historyIncomplete) lines.push('Older family records were summarized, so some relatives may be missing.');
  return { title: 'Its family', lines };
}
