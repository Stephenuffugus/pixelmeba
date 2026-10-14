/**
 * New Dish's Environment group (UX §2.3 "Environment (lid, light mode, drying) — Phase 5"; P5.1; CT §8.1;
 * D-0106 "New Dish light defaults to Fixed"; D-0111; D-0119). PURE: no DOM and no worker.
 *
 * The group is offered only when THIS BUILD's manifest enables 'climate' (light cycle and drying are climate
 * rules); until the systems flip (D-0104) it is absent. Its defaults are the preview world's own environment
 * (the recipe's, else the habitat's; NewDishPreview.environment), and only the keys the player changed to
 * something other than the default become RecipeOverrides, so an untouched group records nothing and the
 * dish is byte-identical to one made without the group.
 */
export interface DishEnvironment {
  readonly lid: 'open' | 'closed';
  readonly lightMode: 'fixed' | 'cycle';
  readonly drying: boolean;
}

/** The player's picks in the group (absent = not touched). */
export type EnvironmentChoice = { -readonly [K in keyof DishEnvironment]?: DishEnvironment[K] };

const KEYS = ['lid', 'lightMode', 'drying'] as const;

/** Whether a build manifest offers the Environment group (it enables 'climate'). */
export function environmentGroupVisible(
  manifest: { readonly enabledSystems: readonly string[] } | null | undefined,
): boolean {
  return !!manifest && manifest.enabledSystems.includes('climate');
}

/** Only the keys the player chose that differ from the defaults, in lid, lightMode, drying order. */
export function environmentOverrides(
  defaults: DishEnvironment,
  chosen: EnvironmentChoice,
): EnvironmentChoice {
  const out: EnvironmentChoice = {};
  for (const k of KEYS) {
    const v = chosen[k];
    if (v !== undefined && v !== defaults[k]) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** The environment the dish will start with. */
export function effectiveEnvironment(defaults: DishEnvironment, chosen: EnvironmentChoice): DishEnvironment {
  return { ...defaults, ...environmentOverrides(defaults, chosen) };
}

/** The summary's words: "Lid open, fixed light, drying off." */
export function environmentSummary(env: DishEnvironment): string {
  return `Lid ${env.lid}, ${env.lightMode === 'cycle' ? 'day-and-night light (a 240 s cycle)' : 'fixed light'}, drying ${env.drying ? 'on' : 'off'}.`;
}
