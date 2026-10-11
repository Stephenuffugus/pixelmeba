/**
 * Offline recipe identifiers (P4.6; SPEC §14.4, D09 "Bundled recipe identifiers", UX §2 Lab "Import
 * recipe ID", §3.4).
 *
 * An identifier such as "R-G3 / revision 1 / seed 104729" names a recipe this build ships: a What if?
 * variant (with its source's own seed) or a shipped recipe (with any valid seed). It is not a link and
 * cannot encode a custom world. Parsing accepts "revision" or "rev", any spacing and either hyphen form
 * ("-" or the non-breaking "‑" the documents print), and nothing else. Resolution accepts only the exact
 * id and revision this build has and a valid seed; anything else is refused with the identifier as
 * typed, never reinterpreted (D09 line 157). Pure: reads content only, never a world or a random stream.
 */
import type { ContentRegistry } from '@sim/content/registry';
import { resolveVariant, VariantError } from '@sim/variants';

/** The Import recipe ID field's length limit (characters). */
export const RECIPE_ID_MAX = 80;

/** The largest seed a recipe identifier may name (a uint32; SPEC §14.4 "valid seed values"). */
export const RECIPE_SEED_MAX = 4294967295;

/** An identifier as typed, split into its three parts (numbers still as text: resolution judges them). */
export interface ParsedRecipeId {
  readonly id: string;
  readonly revisionText: string;
  readonly seedText: string;
  /** The identifier in its SPEC §14.4 form, e.g. "R-G3 / revision 1 / seed 104729" (as typed, normalized). */
  readonly text: string;
}

/** What an identifier starts: a What if? variant, or a shipped recipe with a seed. */
export type ResolvedRecipeId =
  | {
      readonly kind: 'variant';
      readonly variantId: string;
      readonly revision: number;
      readonly seed: number;
      readonly title: string;
    }
  | {
      readonly kind: 'recipe';
      readonly recipeId: string;
      readonly revision: number;
      readonly seed: number;
      readonly title: string;
    };

export type RecipeIdAnswer =
  { readonly ok: true; readonly start: ResolvedRecipeId } | { readonly ok: false; readonly message: string };

/** SPEC §14.4's form: "R-G3 / revision 1 / seed 104729" (the What if? Details line keeps "rev", UX §3.4). */
export function formatRecipeId(id: string, revision: number | string, seed: number | string): string {
  return `${id} / revision ${revision} / seed ${seed}`;
}

/** The refusal for an identifier this build does not ship exactly (D09: "This recipe needs a compatible build"). */
export function recipeIdCompatibleText(identifier: string): string {
  return `This recipe needs a compatible build (${identifier}).`;
}

/** The refusal for a variant identifier with another seed than its source's. */
export function recipeIdSeedText(id: string, revision: number, seed: number): string {
  return `${id} revision ${revision} starts from seed ${seed}.`;
}

/** Shown when the text is not an identifier at all. */
export const RECIPE_ID_FORMAT_TEXT =
  'That is not a recipe ID. A recipe ID looks like “R-G3 / revision 1 / seed 104729”.';

// One id (letters, digits, "_" and either hyphen), "/", "revision" or "rev" and digits, "/", "seed" and digits.
const ID_RE = /^\s*([A-Za-z0-9_‑-]+)\s*\/\s*(?:revision|rev)\s*([0-9]+)\s*\/\s*seed\s*([0-9]+)\s*$/i;

/** Parse an identifier as typed, or null when it is not one (nothing else is accepted). */
export function parseRecipeId(text: string): ParsedRecipeId | null {
  if (typeof text !== 'string' || text.length > RECIPE_ID_MAX) return null;
  const m = ID_RE.exec(text);
  if (!m) return null;
  const id = m[1]!.replace(/‑/g, '-');
  if (!/^[A-Za-z0-9]/.test(id) || /--|-$/.test(id)) return null;
  return { id, revisionText: m[2]!, seedText: m[3]!, text: formatRecipeId(id, m[2]!, m[3]!) };
}

/** A canonical non-negative integer (no leading zeros) up to `max`, else null. */
function canonicalInt(text: string, max: number): number | null {
  if (!/^(0|[1-9][0-9]{0,9})$/.test(text)) return null;
  const n = Number(text);
  return Number.isSafeInteger(n) && n <= max ? n : null;
}

/**
 * Resolve a parsed identifier against this build's content: a supported variant with its exact revision
 * and its source's seed, or a shipped recipe (phase ≤ the build phase) with its exact revision and an
 * integer seed 0…4294967295. Every other identifier is refused with readable text; nothing is guessed.
 */
export function resolveRecipeId(parsed: ParsedRecipeId, registry: ContentRegistry): RecipeIdAnswer {
  const refuse = { ok: false as const, message: recipeIdCompatibleText(parsed.text) };
  const revision = canonicalInt(parsed.revisionText, Number.MAX_SAFE_INTEGER);
  const seed = canonicalInt(parsed.seedText, RECIPE_SEED_MAX);
  if (revision === null || seed === null) return refuse;
  const variant = Object.prototype.hasOwnProperty.call(registry.variants, parsed.id)
    ? registry.variants[parsed.id]
    : undefined;
  if (variant !== undefined) {
    let source;
    try {
      source = resolveVariant(registry, variant.id).source;
    } catch (e) {
      if (e instanceof VariantError) return refuse;
      throw e;
    }
    if (revision !== variant.revision) return refuse;
    if (seed !== source.seed)
      return { ok: false, message: recipeIdSeedText(variant.id, variant.revision, source.seed) };
    return {
      ok: true,
      start: { kind: 'variant', variantId: variant.id, revision, seed, title: variant.title },
    };
  }
  const recipe = Object.prototype.hasOwnProperty.call(registry.recipes, parsed.id)
    ? registry.recipes[parsed.id]
    : undefined;
  if (recipe === undefined || recipe.phase > registry.manifest.buildPhase || revision !== recipe.revision)
    return refuse;
  return { ok: true, start: { kind: 'recipe', recipeId: recipe.id, revision, seed, title: recipe.name } };
}

/** Parse and resolve typed text in one step (the worker's answer to Import recipe ID). */
export function recipeIdAnswer(text: string, registry: ContentRegistry): RecipeIdAnswer {
  const parsed = parseRecipeId(text);
  if (parsed === null) return { ok: false, message: RECIPE_ID_FORMAT_TEXT };
  return resolveRecipeId(parsed, registry);
}
