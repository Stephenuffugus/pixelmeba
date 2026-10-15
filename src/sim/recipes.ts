/**
 * Recipe realization (SPEC §13.1, CT §9). Builds a fresh, paused world at tick 0:
 * habitat geometry (the habitat's ops, then the recipe's own `ops`) → background overrides → ledger
 * baseline → field patches (logged inputs) → founders in distinct cells (logged inputs) → the habitat's
 * Suggested Community when the recipe asks for it (P5.4: its patches, then its groups; placeCommunity) →
 * scheduled commands.
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
import type { DevicePlacement, EdgePlacement, FieldPatch, FurnishArea, GeometryOp, HabitatDef, RecipeDef, Species } from './content/schema';
import { communityOfferProblem, furnishAreaCells, furnishAreaOutsideCell, regionContains } from './content/habitatRules';
import { climateNeedProblem, placedStructureNeedProblem, PLACEABLE_PHASE5_IDS, type PlacedStructures, type StructureRulesView } from './content/structureRules';
import { edgeCodeArrays, edgeCodeBetween, edgePermits, edgeStoreProblem, freeClassOfSpecies, sortEdges, type EdgeBarrier } from './barriers';
import { pairPermitted } from './edgePassage';
import { createObject, FOOD_OBJECT_CAP, FOOD_OBJECT_RULES, isFoodObjectKind, OBJECT_REFUSAL, type FoodObject } from './objects';
import { deviceStoreProblem, sortDevices, type Device } from './devices';
import { worldHasStructure, worldHasSystem } from './gates';
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
import { isFieldVirus } from './viruses';
import { createEmptyWorld, speciesIndex, type World, type WorldContent } from './world';
import { INITIAL_ENERGY, TICKS_PER_SECOND } from './constants';

export class RecipeError extends Error {}

/**
 * P5.4: a Suggested Community that cannot be placed, with the habitat field it concerns ('suggestedCommunity',
 * 'suggestedCommunity.patches.<n>', 'suggestedCommunity.groups.<k>'), so tools/content-validate.ts can
 * report it on the record. Still a RecipeError for every other caller.
 */
export class CommunityError extends RecipeError {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
  }
}

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
  /**
   * P5.1 (UX §2.3, New Dish Environment; wave 8b): the lid, light mode and drying chosen at creation;
   * absent = the recipe's (or else its habitat's) own. A light cycle or drying needs the 'climate'
   * system (realizeRecipe refuses it otherwise).
   */
  readonly lid?: 'open' | 'closed';
  readonly lightMode?: 'fixed' | 'cycle';
  readonly drying?: boolean;
  /**
   * P5.4 (wave 14, D-0128; CT §8.2): the habitat's Suggested Community was placed (recorded only when
   * true; the worker's build() accepts it only with `empty` and a habitat whose community it offers).
   */
  readonly community?: boolean;
}

/**
 * The recipe with recorded New Dish choices applied: THE one applier (P5.1; wave 8b). The worker's
 * build() and What if? rebuild and the recipe file (recipeWithOverrides) all call it, so a dish, its
 * rebuild and its recipe file can never apply the choices differently. With no choice it returns an
 * equal copy of `r`.
 */
export function applyRecipeOverrides(r: RecipeDef, o: RecipeOverridesRecord): RecipeDef {
  // P5.4 (CT §8.2, D02 "never silently"): the recipe's own community survives only on its own habitat
  // (withHabitatOverride drops it on a habitat start) and only when the start is not Empty; otherwise a
  // community comes only from the recorded choice (build() sends it only with `empty`).
  const { community: own, ...base } = withHabitatOverride(r, o.habitatId);
  const community = o.community === true ? true : o.empty === true ? undefined : own;
  return {
    ...base,
    ...(o.mutationPreset ? { mutationPreset: o.mutationPreset } : {}),
    ...(o.founderMode ? { founderMode: o.founderMode } : {}),
    ...(o.empty ? { founders: [], fieldPatches: [], scheduledCommands: [] } : {}),
    // P5.4: after the empty start and the habitat override, so the life is the (new) habitat's community.
    ...(community !== undefined ? { community } : {}),
    ...(o.lid !== undefined ? { lid: o.lid } : {}),
    ...(o.lightMode !== undefined ? { lightMode: o.lightMode } : {}),
    ...(o.drying !== undefined ? { drying: o.drying } : {}),
  };
}

/** Whether recorded choices change anything but the seed (an empty start counts only when true). */
export function hasRecipeChanges(o: RecipeOverridesRecord): boolean {
  return (
    o.mutationPreset !== undefined ||
    o.founderMode !== undefined ||
    o.empty === true ||
    o.habitatId !== undefined ||
    o.lid !== undefined ||
    o.lightMode !== undefined ||
    o.drying !== undefined ||
    o.community === true
  );
}

/**
 * The recipe on habitat `habitatId` (a recorded override; P3.2). A different habitat is a habitat
 * start: the recipe's background overrides (FIRST_DISH_V1's sugar 0) belong to the recipe's own
 * habitat and are dropped, so the dish starts exactly as the preset defines it (CT §8.1). Wave 14
 * (P5.4; D-0128): so are the recipe's own environment and geometry (lid, lightMode, drying, baseLight,
 * ops, stone removal, edges, devices) and its own Suggested Community choice (the old habitat's; a habitat
 * start's community comes only from the recorded `community` override): a habitat start is the habitat
 * exactly as CT §8 defines it (H06's closed lid and light cycle are not replaced by FIRST_DISH_V1's
 * explicit open lid and fixed light).
 * GEL_COLONY and SEDIMENT_EDGE record FIRST_DISH_V1's values, so their starts are unchanged. The New
 * Dish Environment choices still apply on top (applyRecipeOverrides). The recipe's own habitat (or
 * none) changes nothing. Every path that realizes a dish from its recorded overrides applies this, so
 * it rebuilds the same habitat.
 */
export function withHabitatOverride(r: RecipeDef, habitatId: string | undefined): RecipeDef {
  if (habitatId === undefined || habitatId === r.habitatId) return r;
  const { lid: _lid, lightMode: _lightMode, drying: _drying, baseLight: _baseLight, edges: _edges, devices: _devices, community: _community, ...rest } = r;
  return { ...rest, habitatId, backgroundOverrides: {}, ops: [], removeStones: false };
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
    (r.habitatId === undefined || typeof r.habitatId === 'string') &&
    (r.lid === undefined || r.lid === 'open' || r.lid === 'closed') &&
    (r.lightMode === undefined || r.lightMode === 'fixed' || r.lightMode === 'cycle') &&
    (r.drying === undefined || typeof r.drying === 'boolean') &&
    (r.community === undefined || typeof r.community === 'boolean');
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
export function recipeShapeProblems(
  recipe: RecipeDef,
  habitat: HabitatDef | undefined,
  species: Readonly<Record<string, Species>>,
  /** Structure records, for the name in a founder-chain message (absent: the structure id). */
  structureNames?: Readonly<Record<string, { readonly name: string }>>,
): RecipeShapeProblem[] {
  const out: RecipeShapeProblem[] = [];
  // D-0116, D-0122: a chain's consecutive cells may not straddle a placed edge that blocks the species' class.
  let chainEdges: { codes: ReturnType<typeof edgeCodeArrays>; edges: readonly EdgeBarrier[] } | null | undefined;
  const chainEdgesOf = () => {
    if (chainEdges !== undefined) return chainEdges;
    const edges = habitat ? recipeStructures(habitat, recipe).edges : [];
    chainEdges = edges.length === 0 ? null : { codes: edgeCodeArrays(edges), edges };
    return chainEdges;
  };
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
          else if (sp && inMask(ax, ay) && inMask(bx, by)) {
            const ce = chainEdgesOf();
            if (ce === null) continue;
            const a = cellIndex(ax, ay);
            const b = cellIndex(bx, by);
            const code = edgeCodeBetween(ce.codes, a, b);
            if (edgePermits(code, freeClassOfSpecies(sp))) continue;
            const lower = Math.min(a, b);
            const dir = ay === by ? 'R' : 'D';
            const kind = ce.edges.find((e) => e.cell === lower && e.dir === dir)?.kind ?? '';
            const name = structureNames?.[kind]?.name ?? kind;
            out.push({ path: at(`cells.${k}`), message: `(${bx},${by}) and (${ax},${ay}) are on two sides of a ${name} edge, which a link cannot cross` });
          }
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

// ------------------------------------------------------------------ Phase 5 placed structures (P5.2)

function edgesOf(list: readonly EdgePlacement[] | undefined, out: EdgeBarrier[], nextId: () => number): void {
  for (const p of list ?? []) {
    for (let y = p.y0; y <= p.y1; y++) {
      for (let x = p.x0; x <= p.x1; x++) {
        out.push({
          id: nextId(),
          kind: p.structure,
          cell: cellIndex(x, y),
          dir: p.dir,
          ...(p.structure === 'S03' ? { open: p.open ?? false } : {}),
          ...(p.structure === 'S04' && p.flow !== undefined ? { flow: p.flow } : {}),
        });
      }
    }
  }
}

function devicesOf(list: readonly DevicePlacement[] | undefined, out: Device[], nextId: () => number): void {
  for (const p of list ?? []) {
    out.push({
      id: nextId(),
      kind: p.structure,
      cell: cellIndex(p.at[0], p.at[1]),
      ...(p.structure === 'S09' || p.structure === 'S10' ? { on: p.on ?? false } : {}),
      ...(p.structure === 'S08' ? { resinSelect: [...(p.resinSelect ?? [])] } : {}),
    });
  }
}

/**
 * The cells a habitat's furnished area covers, row-major, in the dish (P5.4; habitatRules.ts
 * furnishAreaCells): the realization, the validator and tests share it.
 */
export function furnishCells(area: FurnishArea['area']): number[] {
  return furnishAreaCells(area);
}

function furnishOf(list: readonly FurnishArea[] | undefined, out: Device[], nextId: () => number): void {
  for (const f of list ?? []) for (const cell of furnishAreaCells(f.area)) out.push({ id: nextId(), kind: f.structure, cell });
}

/**
 * The edge barriers and furnishings or devices a habitat and recipe place (Phase 5; CT §4): pure, no
 * world. Ids run from 1 in this order: the habitat's edges, the habitat's devices, the habitat's
 * furnished areas (area order, each area's cells row-major; P5.4), the recipe's edges, the recipe's
 * devices (a rectangle's cells row-major); the stores are then sorted (sortEdges, sortDevices). A
 * habitat without furnished areas gets exactly the ids it had before them. Not validated here:
 * realizeRecipe and the registry run the store checks on the grid.
 */
export function recipeStructures(
  habitat: Pick<HabitatDef, 'edges' | 'devices' | 'furnish'>,
  recipe?: Pick<RecipeDef, 'edges' | 'devices'>,
): { edges: EdgeBarrier[]; devices: Device[] } {
  let id = 1;
  const nextId = () => id++;
  const edges: EdgeBarrier[] = [];
  const devices: Device[] = [];
  edgesOf(habitat.edges, edges, nextId);
  devicesOf(habitat.devices, devices, nextId);
  furnishOf(habitat.furnish, devices, nextId);
  edgesOf(recipe?.edges, edges, nextId);
  devicesOf(recipe?.devices, devices, nextId);
  return { edges: sortEdges(edges), devices: sortDevices(devices) };
}

/**
 * The first problem with placed structures on `grid` under `rules`, as a sentence, or null: the
 * structures and systems they need (structureRules.ts), then the store rules (barriers.ts
 * edgeStoreProblem, devices.ts deviceStoreProblem: the rim, two barriers on one edge, a channel between
 * two open water cells, a device on a stone, wall or bead, two on one cell, the 512 and 256 caps).
 * `rules` null checks geometry alone (every Phase 5 structure counts as included).
 */
export function placedStructureProblem(placed: PlacedStructures, grid: Grid, rules: StructureRulesView | null): string | null {
  if (placed.edges.length === 0 && placed.devices.length === 0) return null;
  if (rules !== null) {
    const need = placedStructureNeedProblem(placed, rules);
    if (need !== null) return need;
  }
  const enabledStructures = rules === null ? PLACEABLE_PHASE5_IDS : PLACEABLE_PHASE5_IDS.filter((id) => rules.hasStructure(id));
  return edgeStoreProblem(placed.edges, grid, { enabledStructures }) ?? deviceStoreProblem(placed.devices, grid, { enabledStructures });
}

/**
 * Content checks of a habitat's (and, with `recipe`, a recipe's) placed structures and climate
 * settings (the registry runs them; realizeRecipe runs the same with the world's recorded manifest).
 * `rules` null checks geometry alone (and no climate). `only` limits the checks to the placed
 * structures or to the climate settings. Paths: 'edges', 'devices', 'lightMode', 'drying'.
 */
export function structurePlacementProblems(
  habitat: HabitatDef,
  recipe: RecipeDef | null,
  rules: StructureRulesView | null,
  only?: 'placement' | 'climate',
): RecipeShapeProblem[] {
  const out: RecipeShapeProblem[] = [];
  if (only !== 'climate') out.push(...placementProblems(habitat, recipe, rules));
  if (rules !== null && only !== 'placement') {
    // A recipe is held to its own lightMode and drying; its habitat's are reported on the habitat.
    const settings = recipe === null ? { lightMode: habitat.lightMode, drying: habitat.drying } : { lightMode: recipe.lightMode ?? 'fixed', drying: recipe.drying ?? false };
    const climate = climateNeedProblem(settings, rules);
    if (climate !== null) out.push({ path: settings.lightMode === 'cycle' ? 'lightMode' : 'drying', message: climate });
  }
  return out;
}

function placementProblems(habitat: HabitatDef, recipe: RecipeDef | null, rules: StructureRulesView | null): RecipeShapeProblem[] {
  const out: RecipeShapeProblem[] = [];
  const placed = recipeStructures(habitat, recipe ?? undefined);
  const grid = placed.edges.length + placed.devices.length === 0 ? createGrid() : recipe === null ? habitatGrid(habitat) : recipeGrid(habitat, recipe);
  const edgeProblem = placedStructureProblem({ edges: placed.edges, devices: [] }, grid, rules);
  if (edgeProblem !== null) out.push({ path: 'edges', message: edgeProblem });
  const deviceProblem = placedStructureProblem({ edges: [], devices: placed.devices }, grid, rules);
  if (deviceProblem !== null) {
    // P5.4: a problem that only the habitat's furnished areas bring is reported on 'furnish'.
    let path = 'devices';
    if ((habitat.furnish?.length ?? 0) > 0) {
      const without = recipeStructures({ ...habitat, furnish: [] }, recipe ?? undefined);
      if (placedStructureProblem({ edges: [], devices: without.devices }, grid, rules) === null) path = 'furnish';
    }
    out.push({ path, message: deviceProblem });
  }
  return out;
}

/**
 * P5.4 registry-free checks of a habitat record's regions (D-0128): region ids unique, a rect's bounds in
 * order, each anchor inside the dish, inside its region's shape and on a cell the habitat's own geometry
 * leaves open (habitatGrid: no stone, wall or bead). The content validator (habitatShapeProblems) and the
 * save import (src/persistence/saveFile.ts, on the dish's recorded habitat) share it. `grid` is the
 * habitat's grid when the caller has built it.
 */
export function habitatRegionProblems(h: HabitatDef, grid?: Grid): RecipeShapeProblem[] {
  const out: RecipeShapeProblem[] = [];
  const regions = h.regions ?? [];
  if (regions.length === 0) return out;
  const g = grid ?? habitatGrid(h);
  const ids: string[] = [];
  regions.forEach((r, i) => {
    if (ids.includes(r.id)) out.push({ path: `regions.${i}.id`, message: `region id "${r.id}" is used twice` });
    ids.push(r.id);
    if (r.shape.kind === 'rect' && (r.shape.x0 > r.shape.x1 || r.shape.y0 > r.shape.y1)) out.push({ path: `regions.${i}.shape`, message: 'rect must have x0 ≤ x1 and y0 ≤ y1' });
    const [x, y] = r.anchor;
    const where = `(${x},${y})`;
    if (!inMask(x, y)) out.push({ path: `regions.${i}.anchor`, message: `${where} is outside the dish` });
    else if (!regionContains(r, x, y)) out.push({ path: `regions.${i}.anchor`, message: `${where} is outside the region's shape` });
    else if (g.structure[cellIndex(x, y)] !== ST_NONE) out.push({ path: `regions.${i}.anchor`, message: `${where} holds a structure` });
  });
  return out;
}

/** P5.4 (registry-free): Suggested Community group `i`'s region must be one of the habitat's regions, or null. */
export function communityGroupRegionProblem(h: HabitatDef, i: number): RecipeShapeProblem | null {
  const g = h.suggestedCommunity?.groups[i];
  if (g === undefined || (h.regions ?? []).some((r) => r.id === g.region)) return null;
  return { path: `suggestedCommunity.groups.${i}.region`, message: `unknown region "${g.region}"` };
}

/**
 * The registry-free checks of a recorded habitat (habitatRegionProblems, then every community group's
 * region): what the save import runs beyond HabitatSchema, so a forged save cannot load with duplicate
 * region ids, a pin off the dish or a community naming a region the habitat lacks.
 */
export function habitatRecordProblems(h: HabitatDef): RecipeShapeProblem[] {
  const out = habitatRegionProblems(h);
  (h.suggestedCommunity?.groups ?? []).forEach((_, i) => {
    const p = communityGroupRegionProblem(h, i);
    if (p !== null) out.push(p);
  });
  return out;
}

/**
 * P5.4 content checks of a habitat record's regions, furnished areas, objects and Suggested Community
 * shape (the registry runs them on every habitat, shipped or not; D-0128). Its placed structures,
 * furnishings included, are checked by structurePlacementProblems. Paths name the field
 * ('regions.<i>.anchor', 'furnish.<i>.area', 'objects.<i>.at', 'suggestedCommunity.groups.<i>.region').
 */
export function habitatShapeProblems(h: HabitatDef, species: Readonly<Record<string, Species>>): RecipeShapeProblem[] {
  const regions = h.regions ?? [];
  const objects = h.objects ?? [];
  const furnish = h.furnish ?? [];
  const needGrid = regions.length + objects.length > 0;
  const grid = needGrid ? habitatGrid(h) : null;
  const out: RecipeShapeProblem[] = grid !== null ? habitatRegionProblems(h, grid) : [];
  furnish.forEach((f, i) => {
    if (f.area.kind === 'rect' && (f.area.x0 > f.area.x1 || f.area.y0 > f.area.y1)) out.push({ path: `furnish.${i}.area`, message: 'rect must have x0 ≤ x1 and y0 ≤ y1' });
    const outside = furnishAreaOutsideCell(f.area);
    if (outside !== null) out.push({ path: `furnish.${i}.area`, message: `(${outside[0]},${outside[1]}) is outside the dish: a furnished area lies wholly inside it` });
    else if (furnishAreaCells(f.area).length === 0) out.push({ path: `furnish.${i}.area`, message: 'covers no cell' });
  });
  if (objects.length > FOOD_OBJECT_CAP) out.push({ path: 'objects', message: `${objects.length} food objects: a dish holds up to ${FOOD_OBJECT_CAP}` });
  const taken: number[] = [];
  objects.forEach((o, i) => {
    const [x, y] = o.at;
    const where = `(${x},${y})`;
    const idx = cellIndex(x, y);
    if (!inMask(x, y)) out.push({ path: `objects.${i}.at`, message: `${where} is outside the dish` });
    else if (grid !== null && grid.structure[idx] !== ST_NONE) out.push({ path: `objects.${i}.at`, message: `${where} holds a structure` });
    else if (taken.includes(idx)) out.push({ path: `objects.${i}.at`, message: `${where} already holds a food object` });
    taken.push(idx);
  });
  const c = h.suggestedCommunity;
  if (c !== undefined) {
    c.groups.forEach((g, i) => {
      const region = communityGroupRegionProblem(h, i);
      if (region !== null) out.push(region);
      if (species[g.species] === undefined) out.push({ path: `suggestedCommunity.groups.${i}.species`, message: `unknown species "${g.species}"` });
    });
  }
  return out;
}

/**
 * Whether a recipe's own records bear on its placed structures: it places its own, or it repaints the
 * grid (ops, stone removal) under its habitat's. Otherwise its habitat's are checked on the habitat.
 */
export function recipeTouchesStructures(habitat: Pick<HabitatDef, 'edges' | 'devices' | 'furnish'>, recipe: Pick<RecipeDef, 'edges' | 'devices' | 'ops' | 'removeStones'>): boolean {
  if ((recipe.edges?.length ?? 0) > 0 || (recipe.devices?.length ?? 0) > 0) return true;
  return (habitat.edges?.length ?? 0) + (habitat.devices?.length ?? 0) + (habitat.furnish?.length ?? 0) > 0 && (recipe.ops.length > 0 || recipe.removeStones);
}

/**
 * One habitat food object at full pools in `cell` (P5.4): the material must be an 'object' material the
 * world records, in a world that records 'foodObjects'. Its whole inventory is an external input,
 * 'habitat:<habitatId>:<material>' (the tool's 'tool:<material>' precedent).
 */
function placeHabitatObject(world: World, habitatId: string, recipeId: string, materialId: string, cell: number): void {
  const mat = world.content.materials.find((m) => m.id === materialId);
  if (!worldHasSystem(world, 'foodObjects')) throw new RecipeError(`recipe ${recipeId}: habitat ${habitatId} starts with ${materialId}, which needs the "foodObjects" system (not in these rules)`);
  if (!mat || mat.kind !== 'object' || !isFoodObjectKind(mat.target)) throw new RecipeError(`recipe ${recipeId}: habitat ${habitatId} starts with ${materialId}, which these rules do not include`);
  const rule = FOOD_OBJECT_RULES[mat.target];
  const pools: FoodObject['pools'] = {};
  let c = 0;
  for (const p of rule.pools) {
    pools[p.pool] = p.full;
    c += p.full;
  }
  const made = createObject(world, { cell, kind: mat.target, pools, n: rule.n });
  if (!made.ok) throw new RecipeError(`recipe ${recipeId}: habitat ${habitatId}'s ${materialId} at (${cell % 128},${Math.floor(cell / 128)}): ${OBJECT_REFUSAL[made.reason]}`);
  recordInput(world, `habitat:${habitatId}:${materialId}`, c, rule.n);
}

/**
 * One field patch: quantities per included cell, clipped to valid cells of the patch substrate (`add`
 * adds; `set` replaces, its difference counted), logged as one input `source`. A recipe's patches and a
 * Suggested Community's patches (P5.4) share it, so they cannot differ.
 */
function applyFieldPatch(world: World, patch: FieldPatch, source: string): void {
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
  recordInput(world, source, c, nn, mm);
}

/**
 * A habitat's Suggested Community (P5.4; CT §8.2 "five of each named species in valid cells of a
 * radius-10 patch near its region; previewed and recorded; never silently"; D-0128). Gated on the world's
 * recorded manifest (communityOfferProblem: every species and system it needs). Then, in record order:
 * each community patch exactly as a recipe field patch, logged 'community:<habitatId>:patch<n>[:label]';
 * each group k: the eligible cells are its radius disk around its region's anchor, row-major, inside the
 * dish and the region, occupiable by the species (canOccupy) and not used by a recipe founder or an
 * earlier group; fewer than `count` is refused (never cropped or widened); otherwise the first `count`
 * of detPermutation(eligible, seed, 'community.place', k), each introduced through introduceOrganism
 * (input 'introduce:community:<habitatId>'; the founder mode applies as for recipe founders). The
 * eligible count never depends on the seed, only the permutation does.
 */
function placeCommunity(world: World, habitat: HabitatDef, used: Uint8Array): void {
  const c = habitat.suggestedCommunity!;
  const offer = communityOfferProblem(habitat, world.content.manifest, Object.fromEntries(world.content.species.map((sp) => [sp.id, sp])));
  if (offer !== null) throw new CommunityError(`habitat ${habitat.id}: ${offer}`, 'suggestedCommunity');
  (c.patches ?? []).forEach((patch, n) => {
    try {
      applyFieldPatch(world, patch, `community:${habitat.id}:patch${n}${patch.label ? `:${patch.label}` : ''}`);
    } catch (e) {
      if (e instanceof RecipeError) throw new CommunityError(`habitat ${habitat.id}: its Suggested Community's patch ${n}: ${e.message}`, `suggestedCommunity.patches.${n}`);
      throw e;
    }
  });
  const source = `community:${habitat.id}`;
  c.groups.forEach((g, k) => {
    const region = (habitat.regions ?? []).find((r) => r.id === g.region);
    const at = `suggestedCommunity.groups.${k}`;
    if (region === undefined) throw new CommunityError(`habitat ${habitat.id}: its Suggested Community names an unknown region "${g.region}"`, at);
    // A field virus is dosed as field units, never introduced as an organism (introduceOrganism throws a plain Error).
    if (isFieldVirus(g.species)) throw new CommunityError(`habitat ${habitat.id}: its Suggested Community names ${g.species}, a virus (dosed as field units, never placed as organisms)`, `${at}.species`);
    const spIdx = speciesIndex(world, g.species);
    const sp = world.species[spIdx]!;
    const [cx, cy] = region.anchor;
    const eligible = diskCells(cx, cy, g.radius).filter((i) => {
      const x = i % 128;
      const y = Math.floor(i / 128);
      return inMask(x, y) && regionContains(region, x, y) && canOccupy(world, sp, i) && used[i] === 0;
    });
    if (eligible.length < g.count)
      throw new CommunityError(`habitat ${habitat.id}: its Suggested Community has only ${eligible.length} valid cells for ${g.count} ${sp.def.name} in ${region.label}`, at);
    const perm = detPermutation(eligible.length, world.seed, STREAMS.communityPlace, k);
    for (let m = 0; m < g.count; m++) {
      const cell = eligible[perm[m]!]!;
      used[cell] = 1;
      const slot = introduceOrganism(world, spIdx, cell, source, { exactCenter: true, origin: 1 });
      if (slot < 0) throw new CommunityError(`habitat ${habitat.id}: agent capacity exceeded`, at);
    }
  });
}

export function realizeRecipe(registry: ContentRegistry, recipeOrId: string | RecipeDef, opts: RealizeOptions = {}): World {
  const base = typeof recipeOrId === 'string' ? registry.recipes[recipeOrId] : recipeOrId;
  if (!base) throw new RecipeError(`unknown recipe ${typeof recipeOrId === 'string' ? recipeOrId : recipeOrId.id}`);
  const recipe = opts.transform ? opts.transform(base) : base;
  const habitat = registry.habitats[recipe.habitatId];
  if (!habitat) throw new RecipeError(`unknown habitat ${recipe.habitatId}`);
  // P5.4 (wave 14, D-0128): a Suggested Community needs one on the habitat (CT §8.2: never silently).
  if (recipe.community === true && habitat.suggestedCommunity === undefined) throw new RecipeError(`recipe ${recipe.id}: habitat ${habitat.id} has no Suggested Community`);
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
  const lightMode = recipe.lightMode ?? habitat.lightMode;
  const world = createEmptyWorld({
    worldId: opts.worldId ?? `${recipe.id}-r${recipe.revision}-s${seed}`,
    seed,
    settings: {
      lid: recipe.lid ?? habitat.lid,
      lightMode,
      drying: recipe.drying ?? habitat.drying,
      warmth: habitat.warmth,
      mutationPreset: recipe.mutationPreset,
      founderMode: recipe.founderMode,
      // Schema 5 (D-0106): the cycle starts at tick 0; present only in cycle mode.
      ...(lightMode === 'cycle' ? { cycleStartTick: 0 } : {}),
    },
    content,
  });
  // Phase 5 rules are gated on the world's recorded manifest (D-0103): a light cycle or drying needs 'climate'.
  const recorded: StructureRulesView = { hasStructure: (id) => worldHasStructure(world, id), hasSystem: (sys) => worldHasSystem(world, sys) };
  const climate = climateNeedProblem(world.settings, recorded);
  if (climate !== null) throw new RecipeError(`recipe ${recipe.id}: ${climate}`);
  applyHabitat(world, habitat, {
    removeStones: recipe.removeStones,
    ...(recipe.baseLight !== undefined ? { baseLight: recipe.baseLight } : {}),
    ...(recipe.ops.length > 0 ? { ops: recipe.ops } : {}),
  });
  // Phase 5 (P5.2, P5.4): edge barriers, furnishings and devices, placed on the final cell geometry. A
  // recipe without any leaves the stores empty and nextDeviceId 1, so it realizes exactly as before.
  const placed = recipeStructures(habitat, recipe);
  if (placed.edges.length > 0 || placed.devices.length > 0) {
    const problem = placedStructureProblem(placed, world.grid, recorded);
    if (problem !== null) throw new RecipeError(`recipe ${recipe.id}: ${problem}`);
    world.edges = placed.edges;
    world.devices = placed.devices;
    world.counters.nextDeviceId = 1 + placed.edges.length + placed.devices.length;
  }
  const cells = maskCells();
  for (let k = 0; k < cells.length; k++) {
    const i = cells[k]!;
    if (!transportOpen(world.grid, i)) continue;
    setFields(world, i, recipe.backgroundOverrides);
  }
  initializeLedger(world);
  // P5.4: the habitat's food objects (CT §5.2, §8.2), each an external input (SPEC §13.1; D-0128).
  for (const o of habitat.objects ?? []) placeHabitatObject(world, habitat.id, recipe.id, o.material, cellIndex(o.at[0], o.at[1]));

  // Field patches: quantities per included cell, clipped to valid cells of the patch substrate.
  recipe.fieldPatches.forEach((patch, n) => applyFieldPatch(world, patch, `recipe:patch${n}${patch.label ? `:${patch.label}` : ''}`));

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
      // D-0116, D-0122: never link across a placed edge that blocks the species' class.
      const cls = freeClassOfSpecies(world.content.species[spIdx]!);
      for (let k = 1; k < slots.length; k++) {
        const a = cells[k - 1]!;
        const b = cells[k]!;
        if (Math.abs((a % 128) - (b % 128)) + Math.abs(Math.floor(a / 128) - Math.floor(b / 128)) === 1 && !pairPermitted(world, a, b, cls, cls))
          throw new RecipeError(`recipe ${recipe.id}: founder group ${groupIndex} members ${k} and ${k + 1} are on two sides of an edge a link cannot cross`);
        if (!addFungalLink(world, slots[k - 1]!, slots[k]!, LINK_TRANSPORT))
          throw new RecipeError(`recipe ${recipe.id}: founder group ${groupIndex} members ${k} and ${k + 1} cannot be linked`);
      }
    }
  });

  // P5.4: the habitat's Suggested Community, after the recipe's own founders (their cells stay theirs).
  if (recipe.community === true) placeCommunity(world, habitat, used);

  for (const sc of recipe.scheduledCommands) {
    queueCommand(world, `schedule:${sc.label}`, sc.payload as unknown as CommandPayload, Math.round(sc.atSecond * TICKS_PER_SECOND));
  }

  updateDerived(world);
  rebuildIndex(world);
  return world;
}
