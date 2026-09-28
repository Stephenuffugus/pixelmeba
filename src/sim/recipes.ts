/**
 * Recipe realization (SPEC §13.1, CT §9). Builds a fresh, paused world at tick 0:
 * habitat geometry → background overrides → ledger baseline → field patches (logged inputs) →
 * founders in distinct cells ordered by distance, then y, then x (logged inputs) → scheduled commands.
 */
import type { ContentRegistry } from './content/registry';
import type { GeometryOp, HabitatDef, RecipeDef } from './content/schema';
import { FIELD_DEFS, FIELD_IDS, isFieldId, type FieldId } from './fields';
import {
  cellIndex,
  createGrid,
  diskCells,
  inMask,
  maskCells,
  ST_BEAD,
  ST_NONE,
  ST_STONE,
  ST_WALL,
  SUB_GEL,
  SUB_SEDIMENT,
  SUB_WATER,
  transportOpen,
  type Grid,
} from './grid';
import { initializeLedger, recordInput } from './ledger';
import { canOccupy } from './movement';
import { introduceOrganism, queueCommand, type CommandPayload } from './commands';
import { rebuildIndex } from './spatial';
import { updateDerived } from './transport';
import { createEmptyWorld, speciesIndex, type World, type WorldContent } from './world';
import { TICKS_PER_SECOND } from './constants';

export class RecipeError extends Error {}

export function worldContentFor(registry: ContentRegistry, habitat: HabitatDef, provenance: WorldContent['provenance']): WorldContent {
  const m = registry.manifest;
  return {
    manifest: m,
    species: m.enabledSpecies.map((id) => registry.species[id]!),
    modules: m.enabledModules.map((id) => registry.modules[id]!),
    materials: m.enabledMaterials.map((id) => registry.materials[id]!),
    loci: registry.loci,
    habitat,
    provenance,
  };
}

/** Substrate code for each habitat kind a recipe patch can target. */
export const SUB_CODE = { water: SUB_WATER, gel: SUB_GEL, sediment: SUB_SEDIMENT } as const;

function setFields(world: World, cell: number, values: Partial<Record<FieldId, number>>): void {
  for (const key of Object.keys(values).sort()) {
    if (!isFieldId(key)) throw new RecipeError(`unknown field ${key}`);
    const arr = world.fields[key];
    if (!arr) throw new RecipeError(`field ${key} is not enabled in this world`);
    arr[cell] = values[key]!;
  }
}

/** Cells covered by one habitat geometry op, row-major and clipped to the grid (not yet to the dish mask). */
function opCells(op: GeometryOp): number[] {
  if (op.op === 'disk') return diskCells(op.center[0], op.center[1], op.radius);
  const out: number[] = [];
  for (let y = op.y0; y <= op.y1; y++) for (let x = op.x0; x <= op.x1; x++) if (x >= 0 && y >= 0 && x < 128 && y < 128) out.push(cellIndex(x, y));
  return out;
}

/** The substrate or structure one habitat op paints into cell i. */
function applyOpGeometry(g: Grid, op: GeometryOp, i: number, removeStones: boolean): void {
  if (!op.substrate) return;
  if (op.substrate === 'stone') {
    if (!removeStones) g.structure[i] = ST_STONE;
  } else if (op.substrate === 'wall') g.structure[i] = ST_WALL;
  else if (op.substrate === 'bead') g.structure[i] = ST_BEAD;
  else g.substrate[i] = SUB_CODE[op.substrate];
}

/**
 * The habitat's substrate and structure layout alone (no fields, light or world): exactly the geometry
 * applyHabitat() paints. Pure; used to validate and preview patch placement without building a world.
 */
export function habitatGrid(h: HabitatDef, opts: { removeStones?: boolean } = {}): Grid {
  const g = createGrid();
  const baseSub = SUB_CODE[h.baseSubstrate];
  const cells = maskCells();
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    g.substrate[i] = baseSub;
    g.structure[i] = ST_NONE;
  }
  for (const op of h.ops) {
    for (const i of opCells(op)) {
      if (!inMask(i % 128, Math.floor(i / 128))) continue;
      applyOpGeometry(g, op, i, opts.removeStones === true);
    }
  }
  return g;
}

export function applyHabitat(world: World, h: HabitatDef, opts: { removeStones?: boolean; baseLight?: number } = {}): void {
  const g = world.grid;
  const cells = maskCells();
  const baseSub = SUB_CODE[h.baseSubstrate];
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    g.substrate[i] = baseSub;
    g.structure[i] = ST_NONE;
    g.lightBase[i] = opts.baseLight ?? h.baseLight;
    setFields(world, i, h.baseFields);
  }
  for (const op of h.ops) {
    for (const i of opCells(op)) {
      if (!inMask(i % 128, Math.floor(i / 128))) continue;
      applyOpGeometry(g, op, i, opts.removeStones === true);
      if (op.fields) setFields(world, i, op.fields);
      if (op.light !== undefined && opts.baseLight === undefined) g.lightBase[i] = op.light;
    }
  }
  // Stone and wall cells hold no mobile resource inventory.
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    if (transportOpen(g, i)) continue;
    for (const id of FIELD_IDS) {
      const arr = world.fields[id];
      if (arr) arr[i] = 0;
    }
  }
  g.geometryVersion++;
}

/**
 * The cells a field patch fills: its disk clipped to open cells (inside the dish, no structure) of the
 * patch substrate, row-major. Realization and What if? validation share this so they cannot disagree.
 */
export function validPatchCells(g: Grid, center: readonly [number, number], radius: number, substrate: number): number[] {
  return diskCells(center[0], center[1], radius).filter(
    (i) => inMask(i % 128, Math.floor(i / 128)) && g.structure[i] === ST_NONE && g.substrate[i] === substrate,
  );
}

function patchCells(world: World, center: readonly [number, number], radius: number, substrate: number): number[] {
  return validPatchCells(world.grid, center, radius, substrate);
}

export interface RealizeOptions {
  readonly worldId?: string;
  readonly seed?: number;
  /** Apply a variant or experiment modification to the recipe before realization. */
  readonly transform?: (r: RecipeDef) => RecipeDef;
  /** Provenance recorded in the world (default: this recipe). What if? variants record their identity here. */
  readonly provenance?: WorldContent['provenance'];
}

export function realizeRecipe(registry: ContentRegistry, recipeOrId: string | RecipeDef, opts: RealizeOptions = {}): World {
  const base = typeof recipeOrId === 'string' ? registry.recipes[recipeOrId] : recipeOrId;
  if (!base) throw new RecipeError(`unknown recipe ${typeof recipeOrId === 'string' ? recipeOrId : recipeOrId.id}`);
  const recipe = opts.transform ? opts.transform(base) : base;
  const habitat = registry.habitats[recipe.habitatId];
  if (!habitat) throw new RecipeError(`unknown habitat ${recipe.habitatId}`);
  const content = worldContentFor(
    registry,
    habitat,
    opts.provenance ?? {
      recipeId: recipe.id,
      recipeRevision: recipe.revision,
      createdFrom: 'recipe',
    },
  );
  const seed = opts.seed ?? recipe.seed;
  const world = createEmptyWorld({
    worldId: opts.worldId ?? `${recipe.id}-r${recipe.revision}-s${seed}`,
    seed,
    settings: {
      lid: recipe.lid ?? habitat.lid,
      lightMode: recipe.lightMode ?? habitat.lightMode,
      drying: recipe.drying ?? habitat.drying,
      warmth: habitat.warmth,
      mutationPreset: recipe.mutationPreset,
      founderMode: recipe.founderMode,
    },
    content,
  });
  applyHabitat(world, habitat, {
    removeStones: recipe.removeStones,
    ...(recipe.baseLight !== undefined ? { baseLight: recipe.baseLight } : {}),
  });
  const cells = maskCells();
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    if (!transportOpen(world.grid, i)) continue;
    setFields(world, i, recipe.backgroundOverrides);
  }
  initializeLedger(world);

  // Field patches: quantities per included cell, clipped to valid cells of the patch substrate.
  recipe.fieldPatches.forEach((patch, n) => {
    const pc = patchCells(world, patch.center, patch.radius, SUB_CODE[patch.substrate]);
    let c = 0;
    let nn = 0;
    let mm = 0;
    for (const i of pc) {
      for (const key of Object.keys(patch.add).sort()) {
        if (!isFieldId(key)) throw new RecipeError(`unknown field ${key}`);
        const arr = world.fields[key];
        if (!arr) throw new RecipeError(`field ${key} is not enabled in this world`);
        const v = patch.add[key]!;
        arr[i]! += v;
        const def = FIELD_DEFS[key];
        if (def.material === 'carbon') c += v * (def.carbonPerUnit ?? 1);
        else if (def.material === 'nutrient') nn += v;
        else if (def.material === 'mineral') mm += v;
      }
      if (Object.keys(patch.set).length > 0) {
        // "set" replaces a value; the difference is logged as an input or export.
        for (const key of Object.keys(patch.set).sort()) {
          if (!isFieldId(key)) throw new RecipeError(`unknown field ${key}`);
          const arr = world.fields[key]!;
          const before = arr[i]!;
          const v = patch.set[key]!;
          arr[i] = v;
          const def = FIELD_DEFS[key];
          const d = (v - before) * (def.carbonPerUnit ?? 1);
          if (def.material === 'carbon') c += d;
          else if (def.material === 'nutrient') nn += d;
          else if (def.material === 'mineral') mm += d;
        }
      }
    }
    recordInput(world, `recipe:patch${n}${patch.label ? `:${patch.label}` : ''}`, c, nn, mm);
  });

  // Founders: distinct cells nearest the requested center (distance, then y, then x).
  const used = new Uint8Array(128 * 128);
  for (const f of recipe.founders) {
    const spIdx = speciesIndex(world, f.species);
    const sp = world.species[spIdx]!;
    const [cx, cy] = f.center;
    const eligible = diskCells(cx, cy, f.radius).filter(
      (i) => inMask(i % 128, Math.floor(i / 128)) && canOccupy(world, sp, i) && used[i] === 0,
    );
    eligible.sort((a, b) => {
      const ax = a % 128;
      const ay = Math.floor(a / 128);
      const bx = b % 128;
      const by = Math.floor(b / 128);
      const da = (ax - cx) ** 2 + (ay - cy) ** 2;
      const db = (bx - cx) ** 2 + (by - cy) ** 2;
      return da - db || ay - by || ax - bx;
    });
    if (eligible.length < f.count) {
      throw new RecipeError(`recipe ${recipe.id}: only ${eligible.length} valid cells for ${f.count} ${f.species} within r ${f.radius} of (${cx},${cy})`);
    }
    for (let k = 0; k < f.count; k++) {
      const cell = eligible[k]!;
      used[cell] = 1;
      const ordinal = k + 1;
      const give =
        f.moduleAssignment === 'all' ||
        (f.moduleAssignment === 'alternate-odd' && ordinal % 2 === 1) ||
        (f.moduleAssignment === 'alternate-even' && ordinal % 2 === 0);
      const slot = introduceOrganism(world, spIdx, cell, `recipe:${recipe.id}`, {
        modules: give ? f.modules : [],
        exactCenter: true,
        origin: give && f.modules.length > 0 ? 2 : 1,
      });
      if (slot < 0) throw new RecipeError(`recipe ${recipe.id}: agent capacity exceeded`);
    }
  }

  for (const sc of recipe.scheduledCommands) {
    queueCommand(world, `schedule:${sc.label}`, sc.payload as unknown as CommandPayload, Math.round(sc.atSecond * TICKS_PER_SECOND));
  }

  updateDerived(world);
  rebuildIndex(world);
  return world;
}
