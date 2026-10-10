/**
 * Field Guide words (UX §5.7; SPEC §14 "Discovery and knowledge", §18 glossary; P3.8). Plain
 * statements; the guide separates "General biology" (what is broadly true of real microbes) from
 * "Rules of this game" (what this simulation does). Nothing here claims the game is real biology, and
 * no word ranks an organism ("superior", "advanced", "perfect", "adapted", "immune" are never used).
 * Relationship sentences name only what a dish recorded. All numbers are fictional game units.
 */
import type { Species } from '@sim/content/schema';
import { foodWord, listWords } from './shortcuts';

export const GUIDE_TEXT = {
  title: 'Field Guide',
  intro: 'Every organism, material, structure and tool in this version, all open from the start. Nothing here is locked.',
  searchLabel: 'Search the Field Guide',
  searchHint: 'Search by name or ID (press / to search)',
  noMatch: (q: string) => `Nothing in this tab matches “${q}”.`,
  back: 'Back',
  generalBiology: 'General biology',
  rulesOfGame: 'Rules of this game',
  example: 'Example',
  diet: 'Food',
  habitat: 'Where it lives',
  preferred: 'Preferred conditions',
  predators: 'Hunted by',
  prey: 'Hunts',
  hosts: 'Hosts',
  parasites: 'Infected or ridden by',
  products: 'What it makes',
  abilities: 'Abilities it can gain',
  abilitiesNone: 'None in this version.',
  abilityFor: 'Can appear in',
  changes: 'Changes',
  doesNotChange: 'Does not change',
  watchFor: 'Watch for',
  where: 'Where',
  seen: 'Seen in your dishes',
  seenNone: 'Not seen in your dishes yet.',
  seenNotNoted: 'Your dishes note who ate, caught, infected, rode or burst whom, and which enzymes turned food into something else. This entry is none of those, so nothing is noted for it.',
  /** A module entry (an ability): notes are kept for species; name what a carrier can be noted for (src/sim/moduleNotes.ts). */
  seenModule: (notes: { readonly converts: readonly string[]; readonly eats: readonly string[] }) => {
    const items = [...notes.converts.map((e) => `its enzyme turning ${ENZYME_WORDS[e] ?? e}`), ...notes.eats.map((p) => `eating ${POOL_WORDS[p] ?? p}`)];
    return items.length > 0
      ? `Your dishes keep notes for species, not for abilities. A species carrying this ability can be noted for ${listWords(items)}: look for that note on the species that carry it.`
      : 'Your dishes keep notes for species, not for abilities, and this ability adds nothing they note: whatever its carriers were seen doing is on their own species’ entries.';
  },
  seenIn: (dish: string, time: string) => `in “${dish}” at ${time} of dish time`,
  badges: 'Badges',
  badgesIntro: 'Badges only mark relationships you have watched happen. They change nothing in any dish.',
  badgesNone: 'No badges yet. They appear when your dishes show a relationship.',
  storeUnavailable: 'This device is not keeping a record of what you have seen, so “Seen in your dishes” stays empty.',
  none: 'None in this version.',
  noneEnabled: 'None of the kinds it can target are in this version.',
  fictional: 'All numbers are fictional game units.',
  notReal:
    'Pixelmeba is a game. Its organisms, rates and chemicals are invented rules inspired by real microbes, not laboratory measurements.',
  glossaryIntro: 'Words the game uses, and what they mean here.',
} as const;

export type GuideTab = 'species' | 'materials' | 'tools' | 'glossary';

export const GUIDE_TABS: readonly { readonly id: GuideTab; readonly label: string }[] = [
  { id: 'species', label: 'Species' },
  { id: 'materials', label: 'Materials' },
  { id: 'tools', label: 'Structures & tools' },
  { id: 'glossary', label: 'Rules glossary' },
];

/** SPEC §18 glossary, in plain words, plus the fictional-units notice. */
export const GLOSSARY: readonly { readonly term: string; readonly meaning: string }[] = [
  { term: 'Organism (agent)', meaning: 'One simulated organism you can see and inspect. It stands for itself, not for a real count of cells.' },
  { term: 'B0', meaning: 'The body carbon of a grown individual of the original kind, before any inherited change.' },
  { term: 'Q (intake ceiling)', meaning: 'The most food an organism can take in per second.' },
  { term: 'M (upkeep)', meaning: 'The energy an organism spends every second just to stay alive.' },
  { term: 'Suitability', meaning: 'How well a place fits an organism, from 0 (cannot live here) to 1 (fits fully), from its surroundings such as the ground, pH, warmth, salt and moisture.' },
  { term: 'Meal', meaning: 'Carbon and nutrient a hunter has caught and is still digesting.' },
  { term: 'Film', meaning: 'Biofilm carbon lying in a cell. Some kinds make it; film digesters eat it as debris.' },
  { term: 'Activity', meaning: 'The strength of an enzyme (or another signal) in a cell. It is not a substance and holds no carbon.' },
  { term: 'Proposal', meaning: 'A birth that is decided but not yet placed, with its offspring’s traits already drawn.' },
  { term: 'Branch', meaning: 'A named family whose inherited difference has lasted. A single mutation is not a branch.' },
  { term: 'Manifest', meaning: 'The list of content and rule versions a dish recorded when it was made. Old dishes keep theirs.' },
  { term: 'Variant (What if?)', meaning: 'A bundled dish with exactly one thing changed.' },
  { term: 'Ledger', meaning: 'The game’s bookkeeping of carbon, nutrient and mineral: nothing is made or lost without a record.' },
  { term: 'Explore and Lab', meaning: 'Two views of the same dish. Switching views never changes the dish.' },
  { term: 'Fictional game units', meaning: 'All numbers are fictional game units: they compare things inside the game, not in a real laboratory.' },
];

const CATEGORY_WORDS: Readonly<Record<Species['category'], string>> = {
  bacterium: 'Bacterium',
  yeast: 'Yeast',
  fungus: 'Fungus (threads)',
  alga: 'Alga (makes food from light)',
  consumer: 'Hunter',
  parasite: 'Parasite',
  virus: 'Phage (a virus of bacteria)',
};

export function categoryWord(c: Species['category']): string {
  return CATEGORY_WORDS[c];
}

const SURFACE_WORDS: Readonly<Record<string, string>> = {
  water: 'open water',
  gel: 'gel',
  sediment: 'sediment',
  stoneEdge: 'stone edges',
  bead: 'porous beads',
  mesh: 'attachment mesh',
};

/** "Open water, gel and sediment." + "Attached: needs gel or stone edges." */
export function habitatWords(s: Pick<Species, 'habitats' | 'attachment' | 'category'>): string {
  if (s.category === 'virus') return 'Carried in the water as units; it multiplies only inside its host.';
  const places = s.habitats.map((h) => SURFACE_WORDS[h] ?? h);
  const text = places.length > 0 ? `${capital(listWords(places))}.` : 'Not recorded.';
  if (!s.attachment) return text;
  return `${text} Lives attached: needs ${listWords(s.attachment.surfaces.map((a) => SURFACE_WORDS[a] ?? a)).replace(/ and /g, ' or ')}.`;
}

function capital(s: string): string {
  return s.length > 0 ? `${s[0]!.toUpperCase()}${s.slice(1)}` : s;
}

/** Diet sentence from the species record (CT §3.1). */
export function dietWords(s: Pick<Species, 'metabolism' | 'foodPriority' | 'digestsFilm' | 'prey' | 'hostIds'>): string {
  const foods = s.foodPriority.map(foodWord);
  const parts: string[] = [];
  if (s.metabolism === 'photosynthesis') parts.push('Makes its own food from light, carbon dioxide and minerals.');
  else if (s.metabolism === 'mixotroph') parts.push(`Makes food from light, or eats ${listWords(foods)} when light is low.`);
  else if (s.metabolism === 'viral') parts.push('Does not eat: it multiplies inside its host.');
  else if (s.metabolism === 'hostDrain') parts.push('Drains carbon from the host it rides.');
  else if (s.prey.length > 0 && foods.length === 0) parts.push('Catches and digests other organisms.');
  if (s.metabolism !== 'mixotroph' && foods.length > 0) {
    const how = s.metabolism === 'anaerobic' ? ' without oxygen' : '';
    parts.push(foods.length === 1 ? `Eats ${foods[0]!}${how}.` : `Eats ${listWords(foods)}${how}, in that order of preference.`);
  }
  if (s.digestsFilm) parts.push('It can also digest biofilm as debris.');
  return parts.length > 0 ? parts.join(' ') : 'Takes in no food.';
}

/** "pH 6–8 · warmth 0.3–0.7 · salt 0–0.2 · moisture 0.5–1" (fictional game units). */
export function rangeWords(t: Species['tolerances']): string[] {
  const r = (v: readonly [number, number]) => `${fmt(v[0])} to ${fmt(v[1])}`;
  return [`pH ${r(t.ph)}`, `Warmth ${r(t.warmth)}`, `Salt ${r(t.salinity)}`, `Moisture ${r(t.moisture)}`];
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Qualifier for a prey link (CT §3.2): 'free' excludes attached prey; 'inSediment' only while in sediment. */
export function preyQualifier(requires: 'any' | 'free' | 'inSediment'): string {
  return requires === 'free' ? ' (only free-swimming)' : requires === 'inSediment' ? ' (only in sediment)' : '';
}

const ABILITY_PRODUCTS: Readonly<Record<string, string>> = {
  E_STARCH_SECRETION: 'starch enzyme (turns starch into sugar)',
  E_OIL_SECRETION: 'lipid enzyme (turns oil into metabolite)',
  E_PROTEIN_SECRETION: 'protein enzyme (turns protein into broth)',
  BIOFILM: 'biofilm',
  LYSIS: 'new phage units when its host bursts',
};

/** What a species releases (from native abilities and metabolism; every eater also releases metabolite). */
export function productWords(s: Pick<Species, 'nativeAbilities' | 'metabolism' | 'acidPerCarbon'>): string[] {
  const out: string[] = [];
  for (const a of s.nativeAbilities) {
    const p = ABILITY_PRODUCTS[a];
    if (p) out.push(p);
  }
  if (s.metabolism === 'photosynthesis') out.push('oxygen and sugar while it makes food from light');
  if (s.metabolism === 'aerobic' || s.metabolism === 'anaerobic') out.push('carbon dioxide and metabolite as it eats');
  if (s.acidPerCarbon > 0) out.push('acid as it eats');
  return out;
}

// ------------------------------------------------------------------------------ relationships

const POOL_WORDS: Readonly<Record<string, string>> = { ...Object.fromEntries(['sugar', 'starch', 'oil', 'protein', 'broth', 'detritus', 'metabolite', 'film'].map((f) => [f, foodWord(f)])) };
const ENZYME_WORDS: Readonly<Record<string, string>> = {
  starch: 'starch into sugar',
  oil: 'oil into metabolite',
  protein: 'protein into broth',
};

function a(name: string): string {
  return /^[AEIOU]/.test(name) ? `an ${name}` : `a ${name}`;
}

/**
 * The sentence for a relationship a dish recorded (D-0039): "Recycler ate debris", "Ciliate caught a
 * Sprinter", "Pinphage burst a Sprinter". `nameOf` maps a species id to its name. Null for an id this
 * build cannot read.
 */
export function relationshipSentence(id: string, nameOf: (speciesId: string) => string): string | null {
  const [kind, actor, target] = id.split(':');
  if (!kind || !actor || target === undefined) return null;
  const who = nameOf(actor);
  switch (kind) {
    case 'eats':
      if (target === 'co2') return `${who} took up carbon dioxide in light`;
      return POOL_WORDS[target] ? `${who} ate ${POOL_WORDS[target]}` : null;
    case 'catches':
      return `${who} caught ${a(nameOf(target))}`;
    case 'infects':
      return `${who} infected ${a(nameOf(target))}`;
    case 'bursts':
      return `${who} burst ${a(nameOf(target))}`;
    case 'attaches':
      return `${who} attached to ${a(nameOf(target))}`;
    case 'drains':
      return `${who} drained ${a(nameOf(target))} until it died`;
    case 'converts':
      return ENZYME_WORDS[target] ? `${who}’s enzyme turned ${ENZYME_WORDS[target]}` : null;
    default:
      return null;
  }
}

/** Cosmetic badges: one per kind of relationship seen (never counts, streaks or timers). */
export const BADGE_COPY: Readonly<Record<string, { readonly name: string; readonly meaning: string }>> = {
  eats: { name: 'Mealtime', meaning: 'You watched an organism eat.' },
  catches: { name: 'The chase', meaning: 'You watched a hunter catch its prey.' },
  infects: { name: 'Uninvited', meaning: 'You watched a phage infect its host.' },
  bursts: { name: 'Burst', meaning: 'You watched an infected host burst.' },
  attaches: { name: 'Hitching a ride', meaning: 'You watched a parasite attach to its host.' },
  drains: { name: 'Drained', meaning: 'You watched a host die while a parasite drained it.' },
  converts: { name: 'Kitchen chemistry', meaning: 'You watched an organism’s enzyme turn one food into another.' },
};
