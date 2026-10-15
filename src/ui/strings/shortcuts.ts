/**
 * Inspector shortcuts (SPEC §12.1, UX §5.3): "What does it eat?", "Why did it stop?",
 * "Where is its family?". Every sentence is built from the worker's inspector or family payload —
 * recorded diet rules, reason codes and measured values — never from art or guesses. Explore
 * wording; no claims such as "adapted", "immune" or "superior".
 */
import { FUNGAL_CAP, PHOTO_SUGAR_FRACTION } from '@sim/constants';
import { R, reasonName } from '@sim/reasons';
import type { EntityInspect, FamilyAnswer, FamilyMember } from '@worker/protocol';
import { reasonText, type ReasonContext } from './reasons';
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

/** Plural of a kind's name for a sentence ("Sunbeads", "Crumbsmiths"). */
function plural(name: string): string {
  return /s$/.test(name) ? name : `${name}s`;
}

/** Whether this organism makes its food from light only (it releases sugar as it does; SPEC §6.5). */
export function makesOwnFood(e: Pick<EntityInspect, 'diet' | 'profile'>): boolean {
  return e.diet.metabolism === 'photosynthesis' && e.profile.foods.length === 0;
}

/**
 * Where sugar can come from in this dish under its recorded rules (M5): sugar placed in it, the kinds
 * that make food from light (they release sugar as they do) and the kinds whose enzyme turns starch into
 * sugar. A rule of the game, never a claim about which sugar a given cell holds.
 */
function sugarSourcesLine(e: EntityInspect, speciesNames: readonly string[]): string | null {
  const src = e.diet.sugarSources;
  if (!src || !e.profile.foods.includes('sugar')) return null;
  const parts = ['sugar placed in the dish'];
  const names = (ids: readonly number[]) => ids.map((j) => speciesNames[j]).filter((n): n is string => typeof n === 'string').map(plural);
  // Wave 13: a mixotroph (A04) is a maker only in light, its Photo mode (sugarSources.inLight).
  const inLight = src.inLight ?? [];
  const makers = names(src.makers.filter((j) => !inLight.includes(j)));
  const lightMakers = names(src.makers.filter((j) => inLight.includes(j)));
  const enzyme = names(src.enzyme.filter((j) => j !== e.speciesIdx));
  if (makers.length > 0) parts.push(`${listWords(makers)} (they release sugar as they make food)`);
  if (lightMakers.length > 0) parts.push(`${listWords(lightMakers)} in light (they release sugar as they make food from light)`);
  if (enzyme.length > 0) parts.push(`${listWords(enzyme.map((n) => `${n}’`))} enzyme (it turns starch into sugar)`);
  return `Sugar here can come from ${listWords(parts)}.`;
}

/** "What does it eat?" — its recorded diet, what it can unlock, and what is in its cell now. */
export function dietAnswer(e: EntityInspect, speciesNames: readonly string[]): ShortAnswer {
  const lines: string[] = [];
  const d = e.diet;
  const foods = e.profile.foods;
  if (d.metabolism === 'photosynthesis' || d.metabolism === 'mixotroph') lines.push('It makes its own food from light, carbon dioxide and minerals.');
  // SPEC §6.5: photosynthesis puts half of the fixed carbon into its cell as sugar (PHOTO_SUGAR_FRACTION).
  if (d.metabolism === 'photosynthesis') {
    const share = PHOTO_SUGAR_FRACTION === 0.5 ? 'half' : `${Math.round(PHOTO_SUGAR_FRACTION * 100)} %`;
    lines.push(`As it does, it releases ${share} of the carbon it takes in into the water as sugar that others nearby can eat.`);
  }
  if (d.metabolism === 'mixotroph') {
    // Wave 13 (SPEC §7.10): one mode per tick; in its Photo mode it releases sugar as a photosynthesizer does.
    const share = PHOTO_SUGAR_FRACTION === 0.5 ? 'half' : `${Math.round(PHOTO_SUGAR_FRACTION * 100)} %`;
    lines.push(`It uses one mode at a time: in bright light it makes food from light and releases ${share} of the carbon it fixes as sugar; in low light it eats sugar instead.`);
  }
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
  const sources = sugarSourcesLine(e, speciesNames);
  if (sources) lines.push(sources);
  if (lines.length === 0) lines.push('No food rule is recorded for it.');
  if (foods.length > 0) {
    const here = e.foodHere.filter((f) => f.amount > 1e-6);
    lines.push(here.length > 0 ? `In its cell now: ${here.map((f) => `${foodWord(f.food)} ${f.amount.toFixed(3)}`).join(', ')}.` : 'None of its foods is in its cell right now.');
  }
  if (e.predation) lines.push(reasonText(e.predation.code, 'explore'));
  // The release is the rule's share of its measured intake (both from the same recorded second).
  const released = d.metabolism === 'photosynthesis' && e.intakeLastSecond >= 0.0001 ? `, and released ${(PHOTO_SUGAR_FRACTION * e.intakeLastSecond).toPrecision(2)} of it as sugar` : '';
  lines.push(
    e.intakeLastSecond <= 0
      ? 'It took in nothing in the last second.'
      : e.intakeLastSecond < 0.0001
        ? 'It took in a trace of carbon (under 0.0001) in the last second.'
        : `It took in ${e.intakeLastSecond.toPrecision(2)} carbon in the last second${released}.`,
  );
  return { title: 'What it eats', lines };
}

/**
 * The leading constraint the inspector's summary shows (UX §5.2). Out of energy comes first whenever
 * energy is 0, since health then falls by the starvation rule every tick (m5); otherwise the
 * simulation's recorded limit, then a division blocker once it is big enough to split, then hunting.
 */
export function leadConstraint(e: EntityInspect): { code: number; value: number } {
  if (e.E <= 0) return { code: R.ENERGY_ZERO, value: 0 };
  // Wave 13: derived states the simulation never writes as a reason (D-0124): held in a trap, being caught.
  if (e.heldBy) return { code: R.HELD_IN_TRAP, value: e.heldBy.heldSeconds };
  if (e.beingHandled && e.beingHandled.length > 0) return { code: R.CAPTURED_HANDLING, value: e.beingHandled[0]!.progress };
  if (e.limitCode !== R.NONE) return { code: e.limitCode, value: e.limitValue };
  if (e.divisionBlockers.length > 0 && e.B >= 1.5 * e.B0) return { code: e.divisionBlockers[0]!, value: 0 };
  if (e.predation) return { code: e.predation.code, value: 0 };
  return { code: R.NONE, value: 0 };
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

/**
 * A constraint in words for this organism: Explore sentence and the measured Lab detail. An organism
 * that makes its own food is never said to lack food: its share is food made (m6). With nothing limiting
 * it and split requirements still open, the summary says it is not ready to split yet (m7).
 */
export function constraintWords(e: EntityInspect, code: number, value: number, speciesNames: readonly string[] = []): { readonly text: string; readonly detail: string } {
  if (makesOwnFood(e) && code === R.FOOD_ACCESS_LOW) return { text: 'It is making less food than it could here.', detail: `Food made: ${pct(value)} of its budget.` };
  if (code === R.NONE) return { text: e.divisionBlockers.length > 0 ? 'Doing fine right now. Not ready to split yet.' : reasonText(R.NONE, 'explore'), detail: '' };
  return { text: reasonText(code, 'explore'), detail: reasonText(code, 'lab', phase5Context(e, code, value, speciesNames)) };
}

/**
 * Wave 13: the measured values behind a Phase 5 code's Lab wording, each from the inspector field that states it
 * (the held and handling lines read the trap's and the handler's columns; a code without its field falls back to
 * the recorded value alone).
 */
function phase5Context(e: EntityInspect, code: number, value: number, names: readonly string[]): ReasonContext {
  if (code === R.HELD_IN_TRAP && e.heldBy)
    return { value: e.heldBy.heldSeconds, need: e.heldBy.holdSeconds, birthId: e.heldBy.ownerBirthId, drained: e.heldBy.drained, speciesName: names[e.heldBy.ownerSpeciesIdx] ?? 'a trap' };
  const b = e.beingHandled?.[0];
  if (code === R.CAPTURED_HANDLING && b) return { value: b.progress, need: b.need, birthId: b.predatorBirthId, speciesName: names[b.predatorSpeciesIdx] ?? 'a predator' };
  if (code === R.PRED_HANDLING_IN_PROGRESS && e.handling) return { value: e.handling.progress, need: e.handling.need };
  if (code === R.NEIGHBORS_DETECTED && e.signal) return { value: e.signal.sensed, threshold: e.signal.onThreshold };
  return { value };
}

/** A requirement for splitting (DIV_* reason codes), not a limit on its life now. */
function splitRequirement(code: number): boolean {
  return reasonName(code).startsWith('DIV_');
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
  /** Every item is a requirement for splitting (m7): the list is headed "Before it can split". */
  readonly splitOnly: boolean;
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
      // Wave 13 (T1, D-0124): a held organism cannot split; the words come from heldBy, its derived state.
      return `Can't split while ${lifeStateWhile(e.lifeState, e.heldBy !== undefined)}.`;
    case R.DIV_BLOCK_CAPACITY:
      // A fungal segment meets the fungal limit first (FUNGAL_CAP; SPEC §7.2), not the 6,000 organism limit.
      return e.network ? `Fungal segment limit reached (${FUNGAL_CAP.toLocaleString('en-US')} across all fungi). This is a limit of the game, not the ecosystem.` : reasonText(code, 'lab');
    default:
      return reasonText(code, 'lab');
  }
}

/**
 * "Why did it stop?" — every division blocker with its measured value, plus the strongest current
 * constraint when it is not already one of them. Several at once ⇒ "A few things are slowing it down."
 */
export function stopAnswer(e: EntityInspect, speciesNames: readonly string[] = []): StopAnswer {
  const items: StopItem[] = e.divisionBlockers.map((code) => ({ code, text: reasonText(code, 'explore'), detail: blockerDetail(e, code) }));
  if (e.limitCode !== R.NONE && !e.divisionBlockers.includes(e.limitCode)) {
    const w = constraintWords(e, e.limitCode, e.limitValue, speciesNames);
    items.unshift({ code: e.limitCode, text: w.text, detail: w.detail });
  }
  // Wave 13: derived states (never recorded as a reason): caught in a trap, being caught by a handler.
  if (e.beingHandled && e.beingHandled.length > 0 && !items.some((it) => it.code === R.CAPTURED_HANDLING)) {
    const w = constraintWords(e, R.CAPTURED_HANDLING, e.beingHandled[0]!.progress, speciesNames);
    items.unshift({ code: R.CAPTURED_HANDLING, text: w.text, detail: w.detail });
  }
  if (e.heldBy && !items.some((it) => it.code === R.HELD_IN_TRAP)) {
    const w = constraintWords(e, R.HELD_IN_TRAP, e.heldBy.heldSeconds, speciesNames);
    items.unshift({ code: R.HELD_IN_TRAP, text: w.text, detail: w.detail });
  }
  // m5: at energy 0 the starvation rule takes health every tick; it leads the list.
  if (e.E <= 0) items.unshift({ code: R.ENERGY_ZERO, text: reasonText(R.ENERGY_ZERO, 'explore'), detail: reasonText(R.ENERGY_ZERO, 'lab') });
  // The hunting state, once: a code the list already holds (a predator's limitCode is PRED_NO_PREY or, mid-attempt,
  // PRED_HANDLING_IN_PROGRESS) is not repeated (item keys are codes). A handler's detail is measured from its
  // handling field (wave 13 fix 1); the v1.0 hunting codes keep their record-free Lab wording.
  const hunt = e.predation?.code ?? R.NONE;
  if (hunt !== R.NONE && !items.some((it) => it.code === hunt)) {
    const detail = hunt === R.PRED_HANDLING_IN_PROGRESS ? constraintWords(e, hunt, 0, speciesNames).detail : reasonText(hunt, 'lab');
    items.push({ code: hunt, text: reasonText(hunt, 'explore'), detail });
  }
  const splitOnly = items.length > 0 && items.every((it) => splitRequirement(it.code));
  let title: string;
  if (items.length === 0) title = e.proposalPending ? reasonText(R.DIV_PENDING_PROPOSAL, 'explore') : 'Nothing is holding it back right now. It is ready to split.';
  else if (items.length === 1) title = items[0]!.text;
  else title = splitOnly ? 'Not ready to split yet.' : reasonText(R.MIXED_CAUSES, 'explore');
  return { title, items, splitOnly };
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
