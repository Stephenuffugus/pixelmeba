/**
 * New Dish habitat starts (P5.4; UX §2.3 "Basics (habitat/recipe picker with preview …)"; D-0128 "New Dish").
 * PURE: no DOM and no worker. The 'Start with' list's habitat entries come from the habitat records this
 * build offers (src/sim/content/habitatRules.ts habitatOffered, the one offer rule the validator and the worker
 * share), never from a hard-coded list:
 *
 * - the habitats in manifest.enabledHabitats that habitatOffered accepts, ordered by phase then id
 *   (WATER_GARDEN, GEL_COLONY, SEDIMENT_EDGE, then H04 … H11);
 * - the three v1.0 presets keep their StartIds ('empty', 'gel', 'sediment'), labels and notes verbatim, so a v1.0
 *   start asks the worker for exactly what it asked before (the step 0 golden);
 * - every other habitat is 'habitat:<id>', labelled with its name and noted with its guide summary;
 * - the Suggested Community is offered only when communityOffered accepts it (its species and their systems
 *   enabled); life is never added unless the player picks it (startOverrides).
 */
import { communityOffered, habitatOffered } from '@sim/content/habitatRules';
import type { HabitatDef, Manifest, Species } from '@sim/content/schema';
import { V1_PRESET_STARTS } from './strings/newDish';

/** 'Start with' choices (UX §2.3): the Garden, a habitat start (CT §8.1, §8.2), or a curated dish (P3.9). */
export type StartId = 'garden' | 'empty' | 'gel' | 'sediment' | `habitat:${string}` | `curated:${string}`;

export interface HabitatStart {
  readonly id: StartId;
  readonly habitatId: string;
  readonly label: string;
  readonly note: string;
  readonly communityOffered: boolean;
  /** The Suggested Community's species ids in group order (empty when it has none). */
  readonly communitySpecies: readonly string[];
  /** The structure ids the habitat furnishes over areas (the summary counts them in cells). */
  readonly furnished: readonly string[];
}

export type StartManifest = Pick<Manifest, 'enabledHabitats' | 'buildPhase' | 'enabledSystems' | 'enabledStructures' | 'enabledMaterials' | 'enabledSpecies'>;

const isV1Preset = (id: string): id is keyof typeof V1_PRESET_STARTS => Object.prototype.hasOwnProperty.call(V1_PRESET_STARTS, id);

/**
 * The habitat starts this build offers, in list order. `species` is this build's species records (the
 * community's species and the systems they need); null offers no community. `demo` (P4.11 DEMO_MODE: the
 * Garden's habitat only) keeps WATER_GARDEN alone.
 */
export function habitatStarts(
  habitats: readonly HabitatDef[],
  manifest: StartManifest,
  species: Readonly<Record<string, Species>> | null,
  demo: boolean,
): HabitatStart[] {
  return habitats
    .filter((h) => manifest.enabledHabitats.includes(h.id) && habitatOffered(h, manifest))
    .filter((h) => !demo || h.id === 'WATER_GARDEN')
    .slice()
    .sort((a, b) => a.phase - b.phase || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((h): HabitatStart => {
      const preset = isV1Preset(h.id) ? V1_PRESET_STARTS[h.id] : null;
      const offered = species !== null && communityOffered(h, manifest, species);
      return {
        id: preset ? preset.id : `habitat:${h.id}`,
        habitatId: h.id,
        label: preset ? preset.label : h.name,
        note: preset ? preset.note : h.guide.summary,
        communityOffered: offered,
        communitySpecies: (h.suggestedCommunity?.groups ?? []).map((g) => g.species),
        furnished: [...new Set((h.furnish ?? []).map((f) => f.structure))].sort(),
      };
    });
}

/** What New Dish asks the worker for (RecipeOverrides keys) for a habitat start. */
export interface StartOverrides {
  readonly empty: true;
  readonly habitatId?: string;
  readonly community?: true;
}

/**
 * A habitat start's overrides: always empty (no recipe founders, food or inputs); the habitat unless it is the
 * recipe's own Water Garden (the v1.0 'empty' start, which keeps FIRST_DISH_V1's own values); `community` only
 * when the player chose it AND this build offers it.
 */
export function startOverrides(start: HabitatStart, community: boolean): StartOverrides {
  return {
    empty: true,
    ...(start.id !== 'empty' ? { habitatId: start.habitatId } : {}),
    ...(community && start.communityOffered ? { community: true as const } : {}),
  };
}

/** New Dish 'Life': Empty or the habitat's Suggested Community. */
export type LifeId = 'empty' | 'suggested';

/**
 * The Life choice after the player picks start `next` (from `current`): Empty whenever the start changes, so
 * life is never carried into another start or added unless the player picks it there (D-0128).
 */
export function lifeAfterStart(current: StartId, next: StartId, life: LifeId): LifeId {
  return next === current ? life : 'empty';
}
