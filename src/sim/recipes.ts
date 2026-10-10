/**
 * Recipe realization (SPEC §13.1, CT §9). Builds a fresh, paused world at tick 0:
 * habitat geometry (the habitat's ops, then the recipe's own `ops`) → background overrides → ledger
 * baseline → field patches (logged inputs) → founders in distinct cells (logged inputs) → scheduled
 * commands.
 *
 * Founder groups (P3.9; all options default to the Phase 2 behaviour, so every earlier recipe realizes
 * bit-identically): the eligible cells of a group's disk are taken row-major (inside the dish,
 * occupiable by the species, not taken by an earlier group); 'nearest' sorts them by distance, then y,
 * then x; 'scatter' takes the first `count` of detPermutation(eligible, seed, 'founder.place', group
 * index); explicit `cells` name them. `initial` sets a member's starting B, N and E as a labelled setup
 * (the B and N difference is logged as 'recipe:<id>:initial'); `links: 'chain'` joins listed F02
 * members with transport links (SPEC §7.7).
 */
import type { ContentRegistry } from './content/registry';
import type { GeometryOp, HabitatDef, RecipeDef, Species } from './content/schema';
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
import { addFungalLink, LINK_TRANSPORT } from './links';
import { canOccupy } from './movement';
import { detPermutation, STREAMS } from './rng';
import { introduceOrganism, queueCommand, type CommandPayload } from './commands';
import { rebuildIndex } from './spatial';
import { updateDerived } from './transport';
import { createEmptyWorld, speciesIndex, type World, type WorldContent } from './world';
import { INITIAL_ENERGY, TICKS_PER_SECOND } from './constants';

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
 * applyHabitat() paints, including any extra `ops` a recipe paints after the habitat's own (P3.9).
 * Pure; used to validate and preview patch placement without building a world.
 */
export function habitatGrid(h: HabitatDef, opts: { removeStones?: boolean; ops?: readonly GeometryOp[] } = {}): Grid {
  const g = createGrid();
  const baseSub = SUB_CODE[h.baseSubstrate];
  const cells = maskCells();
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    g.substrate[i] = baseSub;
    g.structure[i] = ST_NONE;
  }
  for (const op of [...h.ops, ...(opts.ops ?? [])]) {
    for (const i of opCells(op)) {
      if (!inMask(i % 128, Math.floor(i / 128))) continue;
      applyOpGeometry(g, op, i, opts.removeStones === true);
    }
  }
  return g;
}

/**
 * A recipe's substrate and structure layout (its habitat, stone removal and its own ops; P3.9): the
 * grid realizeRecipe() builds. Pure: What if? validation, previews and registry checks share it.
 */
export function recipeGrid(habitat: HabitatDef, recipe: Pick<RecipeDef, 'removeStones' | 'ops'>): Grid {
  return habitatGrid(habitat, { removeStones: recipe.removeStones, ops: recipe.ops });
}

export function applyHabitat(world: World, h: HabitatDef, opts: { removeStones?: boolean; baseLight?: number; /** P3.9: a recipe's own ops, painted after the habitat's. */ ops?: readonly GeometryOp[] } = {}): void {
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
  for (const op of opts.ops && opts.ops.length > 0 ? [...h.ops, ...opts.ops] : h.ops) {
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

/**
 * What a custom New Dish changed from the authored recipe (its own seed, evolution setting, founders,
 * or an empty start), recorded in the world's provenance so a save says whether it IS the authored
 * recipe (D09 §4: What if? remixes authored starting recipes, not custom dishes). `{}` = no change.
 */
export interface RecipeOverridesRecord {
  readonly seed?: number;
  readonly mutationPreset?: RecipeDef['mutationPreset'];
  readonly founderMode?: RecipeDef['founderMode'];
  readonly empty?: boolean;
  /**
   * P3.2: start on another habitat preset than the recipe's (New Dish 'Empty Gel Colony', 'Empty
   * Sediment Edge'); absent = the recipe's own habitat. See withHabitatOverride.
   */
  readonly habitatId?: string;
}

/**
 * The recipe on habitat `habitatId` (a recorded override; P3.2). A different habitat is a habitat
 * start: the recipe's background overrides (FIRST_DISH_V1's sugar 0) belong to the recipe's own
 * habitat and are dropped, so the dish starts exactly as the preset defines it (CT §8.1). The
 * recipe's own habitat (or none) changes nothing. Every path that realizes a dish from its recorded
 * overrides applies this, so it rebuilds the same habitat.
 */
export function withHabitatOverride(r: RecipeDef, habitatId: string | undefined): RecipeDef {
  if (habitatId === undefined || habitatId === r.habitatId) return r;
  return { ...r, habitatId, backgroundOverrides: {} };
}

/** Provenance of a world realized from a recipe; `overrides` is absent in saves made before it was recorded. */
export interface RecipeWorldProvenance extends Readonly<WorldContent['provenance']> {
  readonly overrides?: RecipeOverridesRecord;
}

/**
 * The overrides a recipe world recorded at creation: `{}` for none; undefined when the world did not
 * record them (an older save); null when they are malformed (provenance also arrives from save files).
 */
export function recipeOverridesOf(world: World): RecipeOverridesRecord | null | undefined {
  const o = (world.content.provenance as RecipeWorldProvenance).overrides;
  if (o === undefined) return undefined;
  if (typeof o !== 'object' || o === null || Array.isArray(o)) return null;
  const r = o as Record<string, unknown>;
  const ok =
    (r.seed === undefined || (Number.isInteger(r.seed) && (r.seed as number) >= 0)) &&
    (r.mutationPreset === undefined || typeof r.mutationPreset === 'string') &&
    (r.founderMode === undefined || typeof r.founderMode === 'string') &&
    (r.empty === undefined || typeof r.empty === 'boolean') &&
    (r.habitatId === undefined || typeof r.habitatId === 'string');
  return ok ? o : null;
}

export interface RealizeOptions {
  readonly worldId?: string;
  readonly seed?: number;
  /** Apply a variant or experiment modification to the recipe before realization. */
  readonly transform?: (r: RecipeDef) => RecipeDef;
  /** Provenance recorded in the world (default: this recipe). What if? variants record their identity here. */
  readonly provenance?: WorldContent['provenance'];
}

type FounderDef = RecipeDef['founders'][number];

/** A content problem in one recipe file (registry.ts reports it against that file). */
export interface RecipeShapeProblem {
  readonly path: string;
  readonly message: string;
}

/**
 * P3.9 content checks for a recipe's own ops and its founder placement options (the registry runs them
 * beside its founder checks): rect bounds as for habitats; listed `cells` one per member, distinct,
 * inside the dish and the group's disk, open cells of a substrate the species lives in on the recipe's
 * grid (realization also applies the species' full occupancy rule); `initial` one entry per member;
 * `links: 'chain'` only for a TRANSPORT_LINKS species with listed four-neighbour cells.
 */
export function recipeShapeProblems(recipe: RecipeDef, habitat: HabitatDef | undefined, species: Readonly<Record<string, Species>>): RecipeShapeProblem[] {
  const out: RecipeShapeProblem[] = [];
  recipe.ops.forEach((op, i) => {
    if (op.op === 'rect' && (op.x0 > op.x1 || op.y0 > op.y1)) out.push({ path: `ops.${i}`, message: 'rect must have x0 ≤ x1 and y0 ≤ y1' });
  });
  const grid = habitat ? recipeGrid(habitat, recipe) : null;
  recipe.founders.forEach((f, i) => {
    const at = (field: string) => `founders.${i}.${field}`;
    const sp = species[f.species];
    if (f.cells !== undefined) {
      if (f.placement === 'scatter') out.push({ path: at('placement'), message: 'listed cells and scatter placement exclude each other' });
      if (f.cells.length !== f.count) out.push({ path: at('cells'), message: `lists ${f.cells.length} cells for ${f.count} founders` });
      const seen: number[] = [];
      f.cells.forEach(([x, y], k) => {
        const where = `(${x},${y})`;
        const idx = cellIndex(x, y);
        if (seen.includes(idx)) out.push({ path: at(`cells.${k}`), message: `${where} is listed twice` });
        seen.push(idx);
        if (!inMask(x, y)) out.push({ path: at(`cells.${k}`), message: `${where} is outside the dish` });
        else if ((x - f.center[0]) ** 2 + (y - f.center[1]) ** 2 > f.radius * f.radius)
          out.push({ path: at(`cells.${k}`), message: `${where} is outside r ${f.radius} of (${f.center[0]},${f.center[1]})` });
        else if (grid && sp) {
          const sub = grid.substrate[idx]!;
          const name = sub === SUB_WATER ? 'water' : sub === SUB_GEL ? 'gel' : sub === SUB_SEDIMENT ? 'sediment' : '';
          if (grid.structure[idx] !== ST_NONE) out.push({ path: at(`cells.${k}`), message: `${where} holds a structure` });
          else if (!sp.habitats.includes(name as Species['habitats'][number])) out.push({ path: at(`cells.${k}`), message: `${f.species} cannot live on ${name || 'this substrate'} at ${where}` });
        }
      });
    }
    if (f.initial !== undefined && f.initial.length !== f.count) out.push({ path: at('initial'), message: `has ${f.initial.length} entries for ${f.count} founders (one per founder, in founder order)` });
    if (f.links === 'chain') {
      if (sp && !sp.nativeAbilities.includes('TRANSPORT_LINKS')) out.push({ path: at('links'), message: `${f.species} does not form transport links` });
      if (f.cells === undefined) out.push({ path: at('links'), message: "a 'chain' needs the members' listed cells" });
      else
        for (let k = 1; k < f.cells.length; k++) {
          const [ax, ay] = f.cells[k - 1]!;
          const [bx, by] = f.cells[k]!;
          if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) out.push({ path: at(`cells.${k}`), message: `(${bx},${by}) is not a four-neighbour of (${ax},${ay}), so the chain cannot link them` });
        }
    }
  });
  return out;
}

/**
 * The cells of founder group `groupIndex`, one per member in member order (P3.9). Eligible cells are its
 * disk's cells row-major, inside the dish, occupiable by the species and not used by an earlier group.
 * Listed `cells` must each be eligible; otherwise 'nearest' (distance, then y, then x — the Phase 2
 * order) or 'scatter' (the first `count` of a permutation drawn from the recipe seed). Throws
 * RecipeError when the group cannot be placed; never widens the disk or repeats a cell.
 */
export function founderCells(world: World, recipe: Pick<RecipeDef, 'id'>, f: FounderDef, groupIndex: number, used: Uint8Array): number[] {
  const sp = world.species[speciesIndex(world, f.species)]!;
  const [cx, cy] = f.center;
  if (f.cells !== undefined) {
    if (f.cells.length !== f.count) throw new RecipeError(`recipe ${recipe.id}: founder group ${groupIndex} lists ${f.cells.length} cells for ${f.count} ${f.species}`);
    const out: number[] = [];
    for (const [x, y] of f.cells) {
      const i = cellIndex(x, y);
      if (!inMask(x, y)) throw new RecipeError(`recipe ${recipe.id}: founder cell (${x},${y}) is outside the dish`);
      if ((x - cx) ** 2 + (y - cy) ** 2 > f.radius * f.radius) throw new RecipeError(`recipe ${recipe.id}: founder cell (${x},${y}) is outside r ${f.radius} of (${cx},${cy})`);
      if (used[i] !== 0 || out.includes(i)) throw new RecipeError(`recipe ${recipe.id}: founder cell (${x},${y}) is already taken`);
      if (!canOccupy(world, sp, i)) throw new RecipeError(`recipe ${recipe.id}: ${f.species} cannot live in founder cell (${x},${y})`);
      out.push(i);
    }
    return out;
  }
  const eligible = diskCells(cx, cy, f.radius).filter(
    (i) => inMask(i % 128, Math.floor(i / 128)) && canOccupy(world, sp, i) && used[i] === 0,
  );
  if (eligible.length < f.count) {
    throw new RecipeError(`recipe ${recipe.id}: only ${eligible.length} valid cells for ${f.count} ${f.species} within r ${f.radius} of (${cx},${cy})`);
  }
  if (f.placement === 'scatter') {
    const perm = detPermutation(eligible.length, world.seed, STREAMS.founderPlace, groupIndex);
    return perm.slice(0, f.count).map((k) => eligible[k]!);
  }
  eligible.sort((a, b) => {
    const ax = a % 128;
    const ay = Math.floor(a / 128);
    const bx = b % 128;
    const by = Math.floor(b / 128);
    const da = (ax - cx) ** 2 + (ay - cy) ** 2;
    const db = (bx - cx) ** 2 + (by - cy) ** 2;
    return da - db || ay - by || ax - bx;
  });
  return eligible.slice(0, f.count);
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
    ...(recipe.ops.length > 0 ? { ops: recipe.ops } : {}),
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

  // Founders: distinct cells, group by group (nearest-first, scattered, or listed).
  const used = new Uint8Array(128 * 128);
  recipe.founders.forEach((f, groupIndex) => {
    const spIdx = speciesIndex(world, f.species);
    const cells = founderCells(world, recipe, f, groupIndex, used);
    const slots: number[] = [];
    let dB = 0;
    let dN = 0;
    for (let k = 0; k < f.count; k++) {
      const cell = cells[k]!;
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
      slots.push(slot);
      // A labelled setup (never a test-only override): this member's own B, N and E.
      const init = f.initial?.[k];
      if (init) {
        const c = world.ents.cols;
        if (init.B !== undefined) {
          dB += init.B - c.B[slot]!;
          c.B[slot] = init.B;
        }
        if (init.N !== undefined) {
          dN += init.N - c.N[slot]!;
          c.N[slot] = init.N;
        }
        if (init.E !== undefined && init.E !== INITIAL_ENERGY) {
          // Energy is an abstract budget, not a material: the difference is recorded, never as an input.
          const dE = init.E - c.E[slot]!;
          if (dE > 0) world.ledger.energy.earned += dE;
          else world.ledger.energy.other += -dE;
          c.E[slot] = init.E;
        }
      }
    }
    if (dB !== 0 || dN !== 0) recordInput(world, `recipe:${recipe.id}:initial`, dB, dN);
    if (f.links === 'chain') {
      for (let k = 1; k < slots.length; k++) {
        if (!addFungalLink(world, slots[k - 1]!, slots[k]!, LINK_TRANSPORT))
          throw new RecipeError(`recipe ${recipe.id}: founder group ${groupIndex} members ${k} and ${k + 1} cannot be linked`);
      }
    }
  });

  for (const sc of recipe.scheduledCommands) {
    queueCommand(world, `schedule:${sc.label}`, sc.payload as unknown as CommandPayload, Math.round(sc.atSecond * TICKS_PER_SECOND));
  }

  updateDerived(world);
  rebuildIndex(world);
  return world;
}
