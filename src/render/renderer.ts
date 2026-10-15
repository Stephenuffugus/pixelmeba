/**
 * The dish renderer (ARCH §9, UX §6–§7). Draws snapshots; never touches simulation state.
 *
 * Layers (bottom → top, UX §7.3): dish substrates · structures (Phase 5 edge glyphs, furnishing and device
 * tiles; src/render/structureLayer.ts) · film tiles · deposits · food objects and stains ·
 * overlay · wide-zoom aggregation · organisms and fungal segment tiles (one ParticleContainer over the
 * organism atlas) · feature rims · status marks (infection glyph) · adhesion links · effects ·
 * selection. Fungi are drawn as connection-mask tiles from E_LINKMASK, never through the body path;
 * viruses have no body (their units are a density overlay). Positions interpolate
 * between the last two snapshots by entityId (the retained daughter keeps its entityId across a
 * division). Animation state comes only from snapshot flags and events.
 */
import { Application, Container, Graphics, Particle, ParticleContainer, Rectangle, Sprite, Texture, TextureStyle, type IParticle } from 'pixi.js';
import { CELL_COUNT, GRID_W, MASK_CX, MASK_CY, MASK_R } from '@sim/constants';
import {
  CUE2_MOD_E10,
  CUE_FEEDING,
  CUE_JUST_BORN,
  DEPOSIT_FILM_BAND,
  E_CUE,
  E_CUE2,
  E_CUE3,
  E_FLAGS,
  E_GROWTH,
  E_HEADING,
  E_LIFE,
  E_LINKMASK,
  E_SPECIES,
  E_X,
  E_Y,
  ENT_STRIDE,
  ID_STRIDE,
  LINK_STRIDE,
  type SnapshotMsg,
  type VisualEvent,
} from '@worker/protocol';
import {
  drawKindOf,
  filmAlpha,
  filmLevel,
  filmLevelBand,
  filmTile,
  fungalPick,
  infectionGlyphShown,
  objectFrame,
  riderMarks,
  tileFrameKey,
  type AtlasTileLike,
  type DrawKind,
  type FungalPick,
} from './world3';
import { Camera, ZOOM_CLOSE, ZOOM_NEIGHBORHOOD } from './camera';
import { DISH_PX_PER_CELL, DISH_TEX, paintAggregation, paintDeposits, paintDish, paintOverlay, repaintDepositCells, type DirtyRect } from './layers';
import { speciesRgb } from './speciesColors';
import {
  bodyAnimFor,
  bodyFrameIndex,
  dormantPoseFrame,
  trapPoseFrame,
  decayTileAlpha,
  FEED_START_PENDING,
  feedFrameClock,
  feedStartAfterSnapshot,
  effectForEvent,
  effectLook,
  featureFrameKeys,
  featureLayers,
  featureMarkScale,
  featurePulseOn,
  ghostDurationMs,
  ghostFrameIndex,
  newbornAlpha,
  placementEffect,
  stainAlphaAt,
  type AtlasFeatureLike,
  type EffectSpec,
  type FeatureLayerId,
  type LayerPick,
} from './features';
import { BudgetLadder, budgetFor, GHOSTS_MAX, refreshDue, STAINS_MAX, type Budget, type BudgetLevel } from './budgets';
import { SUBSTRATE_CODES, type LabBrushRule, type LifeBrush, type SubstrateName } from '@sim/grid';
import type { EdgeKind } from '@sim/barriers';
import type { DeviceKind } from '@sim/devices';
import { deviceSprites, edgeDetail, edgeGlyphs, edgeSegment, EDGE_GLYPH_COLORS } from './structureLayer';
import { BADGE_COLORS, BADGE_PX, badgeBox, badgeZoomBand, pipPointsBack, worldBadges, type PipState } from './gateBadges';
import {
  deviceMovePreview,
  devicePreview,
  edgeStrokePreview,
  labCellPreview,
  lifeCellPreview,
  previewModel,
  removePreview,
  wetPreview,
  type StructurePreviewModel,
} from './structurePreviewModel';
import { tracerDrawList, tracerPoint } from './gateTracer';
import type { LineageMarks } from '@worker/protocol';
import type { FavoriteMarks } from '@worker/protocol';
import type { ProbeMask } from '@worker/probes';

const FLAG_MOVING = 1 << 6;

/**
 * Trait overlay (P2.3): one colour per locus band (low → high, see @sim/lineage TRAIT_BANDS), a
 * blue–orange diverging scale that stays distinct under common colour-vision deficiencies; grey for
 * organisms whose locus is not active. Zoomed in, each organism gets a band ring drawn around it in
 * exactly that colour (a white ring texture tinted, framed by a dark outline, beneath the body), so
 * the species sprite and its resting grey are never recoloured and every band reads the same on
 * every species. At wide zoom each cell shows its most common band in the same colours. The legend
 * uses these same values (TRAIT_BAND_CSS, TRAIT_INACTIVE_CSS) and names and counts every band.
 */
export const TRAIT_BAND_COLORS = [0x2f6bc0, 0x8fbde8, 0xf2efe6, 0xf5b56a, 0xd4552a] as const;
export const TRAIT_INACTIVE_COLOR = 0x7a7a7a;
const hexCss = (v: number) => `#${v.toString(16).padStart(6, '0')}`;
export const TRAIT_BAND_CSS: readonly string[] = TRAIT_BAND_COLORS.map(hexCss);
export const TRAIT_INACTIVE_CSS = hexCss(TRAIT_INACTIVE_COLOR);
/** Outline around each band ring (the dish's dark ink). */
export const TRAIT_RING_OUTLINE_CSS = '#172c35';
const TRAIT_BAND_AGG: readonly [number, number, number][] = TRAIT_BAND_COLORS.map((v) => [(v >> 16) & 255, (v >> 8) & 255, v & 255]);
/** Band ring texture: 20 px, a white band (tinted to the band colour) between two dark outlines. */
const TRAIT_RING_PX = 20;
/** The ring's outer diameter is the sprite frame plus this many sprite pixels. */
const TRAIT_RING_EXTRA = 4;
/** Lineage rings drawn at once (CT §12.10 "descendants highlighted ≤ 200"). */
const LINEAGE_RINGS_MAX = 200;
/** P4.1: favorite outlines drawn per followed family at most (CT §12.10 "descendants highlighted ≤ 200"). */
const FAVORITE_GLYPHS_MAX = 200;

export interface AtlasManifestLike {
  readonly width: number;
  readonly height: number;
  readonly sprites: Record<string, { speciesId: string; size: number; headings: number; animations: Record<string, { frames: number; durationMs: number; loop: boolean; reducedMotionFrame: number }> }>;
  readonly frames: ReadonlyArray<{ key: string; x: number; y: number; w: number; h: number }>;
  /** Module feature marks by visual layer (ARCH §10.1); their frames are in `frames` as feature/<layer>/<heading>/<frame>. */
  readonly features?: Readonly<Record<string, AtlasFeatureLike>>;
  /** World tiles (film, food objects, stain); frames in `frames` as tile/<id>/<frame> (src/render/world3.ts). */
  readonly tiles?: Readonly<Record<string, AtlasTileLike>>;
}

interface Ghost {
  particle: Particle;
  /** A body's death dissolve, or null for a fungal segment's decaying tile (`still`). */
  death: AnimTex | null;
  /** decaying/e/<mask> of a fungal segment (drawn at one cell per tile, fading). */
  still: Texture | null;
  /** Row into death.tex (0 for single-heading sprites). */
  row: number;
  start: number;
}

/** How long a dead fungal segment's decaying tile stays (it fades out; reduced motion: as other deaths). */
const DECAY_MS = 1200;

/** A fungal species' tiles, resolved once from the atlas manifest (ARCH §10.1, D-0046). */
interface FungusTex {
  /** mask/e/<0..15> and decaying/e/<0..15>, indexed by connection mask. */
  readonly mask: readonly (Texture | undefined)[];
  readonly decaying: readonly (Texture | undefined)[];
  readonly tip: Texture | undefined;
  readonly bud: Texture | undefined;
  /** F02's transfer pulse (empty for F01). */
  readonly pulse: readonly (Texture | undefined)[];
  /** Phase 5 (wave 13): F03's trap overlays Open, Holding, Cooldown (empty without native TRAP). */
  readonly trap: readonly (Texture | undefined)[];
  /** Phase 5 (wave 13): F04's resting-spore tiles Preparing, Resting, Waking (empty without native DORMANCY). */
  readonly dormant: readonly (Texture | undefined)[];
}

/** One animation's frame textures, resolved once from the atlas manifest (no per-frame string keys). */
interface AnimTex {
  readonly frames: number;
  readonly durationMs: number;
  readonly reducedMotionFrame: number;
  /** [heading row][frame index]; a single row for single-heading sprites. Missing frames are undefined. */
  readonly tex: readonly (readonly (Texture | undefined)[])[];
}

/** Per species index: the animations the renderer can pick from. */
interface SpeciesDraw {
  /** body: organism animations; fungus: connection-mask tiles; virus: never drawn as a body. */
  readonly kind: DrawKind;
  readonly fungus: FungusTex | null;
  readonly headings: number;
  readonly size: number;
  readonly stress: AnimTex | null;
  readonly feed: AnimTex | null;
  readonly move: AnimTex | null;
  readonly idle: AnimTex | null;
  readonly death: AnimTex | null;
  /** Phase 5 (wave 13): a native rester's still poses Preparing, Resting, Waking (B12, P08), else null. */
  readonly dormant: AnimTex | null;
}

const HEADING_CHARS = 'eswn';

/** Heading row as frameKey resolved it: 'eswn'[h] for 4-heading sprites, else (or if unknown) 'e'. */
function headingRow(headings: number, h: number): number {
  return headings === 4 && (h === 1 || h === 2 || h === 3) ? h : 0;
}

interface Effect {
  g: Graphics;
  start: number;
  /** What it is, how long it stays and whether it moves (features.ts effectForEvent / placementEffect; UX §7.4). */
  spec: EffectSpec;
  x: number;
  y: number;
  radius: number;
}

export interface PickCandidate {
  readonly birthId: number;
  readonly entityId: number;
  readonly species: number;
  readonly distance: number;
}

export interface RendererOptions {
  readonly reducedMotion: boolean;
  readonly overlayOpacity: number;
  /** Settings "Simplified overlay colours" (UX §9; P3.11): every overlay in one light-to-dark ramp. */
  readonly simplifiedOverlayPalette?: boolean;
}

export class DishRenderer {
  readonly camera = new Camera();
  private readonly app: Application;
  private readonly root = new Container();
  private readonly world = new Container();
  private dishCanvas!: HTMLCanvasElement;
  private dishTex!: Texture;
  private depositCanvas!: HTMLCanvasElement;
  private depositTex!: Texture;
  private overlayCanvas!: HTMLCanvasElement;
  private overlayTex!: Texture;
  private aggCanvas!: HTMLCanvasElement;
  private aggTex!: Texture;
  private readonly dishSprite = new Sprite();
  private readonly depositSprite = new Sprite();
  private readonly overlaySprite = new Sprite();
  private readonly aggSprite = new Sprite();
  private particles!: ParticleContainer;
  /** Module feature layers above the bodies (UX §7.3 "feature rims"), drawn from the organism atlas. */
  private featureParticles!: ParticleContainer;
  /** [layer][frame][heading] → atlas texture (undefined when the manifest lacks that frame). */
  private layerTex: Record<string, (Texture | undefined)[][]> = {};
  /** Authored frame size of each mark layer, from the manifest's `features` table. */
  private layerSize: Record<string, number> = {};
  private featurePool: Particle[] = [];
  private readonly picks: LayerPick[] = [];
  /** Film tiles (UX §6.2), one particle per cell holding film, rebuilt when the film band changes. */
  private filmParticles!: ParticleContainer;
  private filmPool: Particle[] = [];
  private filmPrev: Uint8Array | null = null;
  /** Food objects (fill steps) and the fading stains of emptied ones (UX §6.5). */
  private objectParticles!: ParticleContainer;
  private objectPool: Particle[] = [];
  private stains: { particle: Particle; start: number }[] = [];
  /** Status marks above the feature rims: the infection glyph (SPEC §7.5, §10.8). */
  private statusParticles!: ParticleContainer;
  private statusPool: Particle[] = [];
  /** Adhesion links between member positions (SPEC §9 E12 "thin pixel connections"). */
  private readonly linksG = new Graphics();
  private linksDrawn = false;
  /** Observe tray: show the infection glyph on every infected host, not only the inspected one. */
  private infectionMarkers = false;
  /** The dish's virus glyph (v01_pinphage/glyph/e/0 in Phase 3), from its species list. */
  private infectionGlyph: Texture | undefined;
  /** Per snapshot entry: 1 = drawn after the other bodies (a parasite on its host). */
  private rider = new Uint8Array(0);
  private riders = 0;
  private readonly riderScratch = { head: new Int32Array(CELL_COUNT), next: new Int32Array(64) };
  private readonly fpick: FungalPick = { mask: 0, tip: false, bud: false, pulse: -1 };
  private readonly effects = new Container();
  private readonly selectionG = new Graphics();
  private readonly rim = new Graphics();
  private frames: Record<string, Texture> = {};
  private manifest!: AtlasManifestLike;
  private speciesAssets: readonly string[] = [];
  private speciesIds: readonly string[] = [];
  /** Per species index: resolved animation textures (rebuilt when species or atlas change). */
  private draws: (SpeciesDraw | null)[] = [];
  private speciesColors: [number, number, number][] = [];
  /** Largest sprite frame in the atlas (px), for the off-screen cull margin. */
  private maxFrameSize = 16;
  private structure: Uint8Array | null = null;
  /** Phase 5 (protocol 3): the latest geometry (edges and devices too), and its structures layer. */
  private geometry: SnapshotMsg['geometry'] = null;
  private readonly structuresG = new Graphics();
  private deviceParticles!: ParticleContainer;
  private devicePool: Particle[] = [];
  /** Zoom the edge glyphs were last stroked at (their minimum screen width); NaN = not drawn. */
  private edgesZoom = Number.NaN;
  /** Resin saturations the device tiles were last drawn with (redrawn only when they change). */
  private lastResinKey = '';
  /** Wave 12: gate-class badges (gateBadges.ts), above the device tiles and below the gate tracer (UX §7.3). */
  private readonly badgesG = new Graphics();
  /** The gate whose sheet is open (barriers.ts edgeKey), or null; its badge shows at every zoom. */
  private selectedGateKey: number | null = null;
  /** Zoom the badges were last drawn at; NaN = nothing drawn. */
  private badgesZoom = Number.NaN;

  private cur: SnapshotMsg | null = null;
  private curAt = 0;
  private interval = 100;
  // Interpolation endpoints by index into the current snapshot, resolved once per snapshot by
  // entityId (the previous snapshot's position, or the current one for newcomers).
  private curX = new Float32Array(0);
  private curY = new Float32Array(0);
  private prevX = new Float32Array(0);
  private prevY = new Float32Array(0);
  private spareX = new Float32Array(0);
  private spareY = new Float32Array(0);
  /** entityId → index in the current snapshot (and a spare map reused for the next one). */
  private curIndex = new Map<number, number>();
  private spareIndex = new Map<number, number>();
  private pool: Particle[] = [];
  /** Last tint written to each pool particle (the tint setter converts colours; skip repeats). */
  private poolTint = new Int32Array(0);
  private ghosts: Ghost[] = [];
  // Reused paint buffers (no per-snapshot allocation).
  private depositCtx: CanvasRenderingContext2D | null = null;
  private depositImg: ImageData | null = null;
  private depositPrev: Uint8Array | null = null;
  private readonly depositDirty: DirtyRect = { x: 0, y: 0, w: 0, h: 0 };
  private overlayImg: ImageData | null = null;
  private aggImg: ImageData | null = null;
  private aggDominant = new Int16Array(CELL_COUNT);
  private aggDensity = new Uint16Array(CELL_COUNT);
  private aggPerCell = new Uint16Array(0);
  /** Aggregation is painted lazily, only while it is visible (wide zoom), at most once per snapshot. */
  private aggDirty = false;
  private fx: Effect[] = [];
  private selectedBirthId: number | null = null;
  private selectedCell: number | null = null;
  private opts: RendererOptions = { reducedMotion: false, overlayOpacity: 0.45 };
  /** P4.13 (src/render/budgets.ts): the degrade ladder and what its level allows (cosmetic only). */
  private readonly ladder = new BudgetLadder();
  private budget: Budget = budgetFor(0);
  private lastFrameAt = Number.NaN;
  private fpsFrames = 0;
  private fpsSince = Number.NaN;
  private fpsNow = 0;
  /** P4.13: overlay and aggregation textures refresh at most every budget interval. */
  private lastOverlayPaint = Number.NEGATIVE_INFINITY;
  private pendingOverlay: NonNullable<SnapshotMsg['overlay']> | null = null;
  private lastAggPaint = Number.NEGATIVE_INFINITY;
  /**
   * P4.13 first feeding pulse: per index of the current snapshot, when its feed animation started (NaN: not
   * feeding; FEED_START_PENDING: started in this snapshot, so its clock begins at the next frame).
   */
  private feedStart = new Float64Array(0);
  private spareFeed = new Float64Array(0);
  private depositVersion = -1;
  private destroyed = false;

  private constructor(app: Application) {
    this.app = app;
  }

  static async create(host: HTMLElement, atlasUrl: string, manifest: AtlasManifestLike): Promise<DishRenderer> {
    TextureStyle.defaultOptions.scaleMode = 'nearest';
    const app = new Application();
    await app.init({
      background: '#14252D',
      resizeTo: host,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(2, globalThis.devicePixelRatio || 1),
      preference: 'webgl',
    });
    host.appendChild(app.canvas);
    app.canvas.setAttribute('aria-hidden', 'true');
    app.canvas.style.display = 'block';
    app.canvas.style.touchAction = 'none';
    const r = new DishRenderer(app);
    await r.init(atlasUrl, manifest);
    // `resizeTo` follows window resizes only; the host also changes size when the chrome around it
    // does (Explore ⇄ Lab bars, text size), so follow the element itself (P2.7).
    if (typeof ResizeObserver === 'function') {
      r.hostObserver = new ResizeObserver(() => {
        if (!r.destroyed) app.queueResize();
      });
      r.hostObserver.observe(host);
    }
    return r;
  }

  private async init(atlasUrl: string, manifest: AtlasManifestLike): Promise<void> {
    this.manifest = manifest;
    const img = new Image();
    img.src = atlasUrl;
    await img.decode();
    const atlas = Texture.from(img);
    atlas.source.scaleMode = 'nearest';
    for (const f of manifest.frames) {
      this.frames[f.key] = new Texture({ source: atlas.source, frame: new Rectangle(f.x, f.y, f.w, f.h) });
      this.maxFrameSize = Math.max(this.maxFrameSize, f.w, f.h);
    }
    this.rebuildDraws();
    const mk = (w: number, h: number) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    };
    this.dishCanvas = mk(DISH_TEX, DISH_TEX);
    this.depositCanvas = mk(DISH_TEX, DISH_TEX);
    this.overlayCanvas = mk(GRID_W, GRID_W);
    this.aggCanvas = mk(GRID_W, GRID_W);
    this.dishTex = Texture.from(this.dishCanvas);
    this.depositTex = Texture.from(this.depositCanvas);
    this.overlayTex = Texture.from(this.overlayCanvas);
    this.aggTex = Texture.from(this.aggCanvas);
    for (const t of [this.dishTex, this.depositTex, this.overlayTex, this.aggTex]) t.source.scaleMode = 'nearest';
    this.dishSprite.texture = this.dishTex;
    this.depositSprite.texture = this.depositTex;
    this.overlaySprite.texture = this.overlayTex;
    this.aggSprite.texture = this.aggTex;
    this.dishSprite.scale.set(1 / DISH_PX_PER_CELL);
    this.depositSprite.scale.set(1 / DISH_PX_PER_CELL);
    this.overlaySprite.alpha = this.opts.overlayOpacity;
    this.overlaySprite.visible = false;
    this.particles = new ParticleContainer({
      dynamicProperties: { position: true, uvs: true, color: true, vertex: true, rotation: false },
      texture: atlas,
      roundPixels: false,
    });
    this.buildFeatureLayers(atlas);
    const tileContainer = () =>
      new ParticleContainer({
        dynamicProperties: { position: true, uvs: true, color: true, vertex: true, rotation: false },
        texture: atlas,
        roundPixels: false,
      });
    this.filmParticles = tileContainer();
    this.deviceParticles = tileContainer();
    this.objectParticles = tileContainer();
    this.statusParticles = tileContainer();
    this.drawRim();
    this.world.addChild(
      this.dishSprite,
      this.structuresG,
      this.deviceParticles,
      this.badgesG,
      this.filmParticles,
      this.depositSprite,
      this.objectParticles,
      this.overlaySprite,
      this.aggSprite,
      this.rim,
      this.particles,
      this.featureParticles,
      this.statusParticles,
      this.linksG,
      this.effects,
      this.selectionG,
    );
    this.buildBandRings();
    this.root.addChild(this.world);
    this.app.stage.addChild(this.root);
    this.app.ticker.add(() => this.frame());
    this.camera.setViewport(this.app.screen.width, this.app.screen.height);
    this.camera.fit(true);
    // P4.13: player-initiated preset moves ease on the renderer's clock (instant in reduced motion).
    this.camera.clock = () => performance.now();
    this.app.renderer.on('resize', (w: number, h: number) => {
      const wasFit = Math.abs(this.camera.target().zoom - this.camera.fitZoom()) < 1e-6;
      this.camera.setViewport(w, h);
      if (wasFit) this.camera.fit(true);
    });
    // P4.13: touching the dish ends an eased move where it was going, so a tap lands where the view goes.
    this.app.canvas.addEventListener('pointerdown', () => this.camera.settle(), { capture: true });
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  /**
   * Resolve the module feature-mark frames (packed into the organism atlas by tools/art-build.ts and
   * listed in the manifest's `features` table) to the atlas textures made in init(): no runtime
   * texture building. A frame the manifest does not carry stays undefined and is not drawn.
   */
  private buildFeatureLayers(atlas: Texture): void {
    const keys = featureFrameKeys(this.manifest.features);
    for (const layer of Object.keys(keys) as FeatureLayerId[]) {
      this.layerTex[layer] = keys[layer]!.map((row) => row.map((key) => this.frames[key]));
      this.layerSize[layer] = this.manifest.features![layer]!.size;
    }
    this.featureParticles = new ParticleContainer({
      dynamicProperties: { position: true, uvs: true, color: true, vertex: true, rotation: false },
      texture: atlas,
      roundPixels: false,
    });
  }

  private layerTexture(layer: FeatureLayerId, frame: number, heading: number): Texture | undefined {
    return this.layerTex[layer]?.[frame]?.[heading];
  }

  setSpecies(ids: readonly string[], assets: readonly string[]): void {
    this.speciesIds = ids;
    this.speciesAssets = assets;
    this.speciesColors = ids.map((id) => speciesRgb(id));
    this.rebuildDraws();
    this.aggDirty = this.cur !== null;
  }

  /** Resolve every species' animation frames to textures once, instead of per sprite per frame. */
  private rebuildDraws(): void {
    if (!this.manifest) return;
    const anim = (asset: string, name: string, headings: number): AnimTex | null => {
      const a = this.manifest.sprites[asset]?.animations[name];
      if (!a) return null;
      const rows: (Texture | undefined)[][] = [];
      for (let h = 0; h < (headings === 4 ? 4 : 1); h++) {
        const row: (Texture | undefined)[] = [];
        for (let i = 0; i < a.frames; i++) row.push(this.frames[`${asset}/${name}/${HEADING_CHARS[h]}/${i}`]);
        rows.push(row);
      }
      return { frames: a.frames, durationMs: a.durationMs, reducedMotionFrame: a.reducedMotionFrame, tex: rows };
    };
    const frames = (asset: string, name: string, n: number): (Texture | undefined)[] => {
      const out: (Texture | undefined)[] = [];
      const count = Math.min(n, this.manifest.sprites[asset]?.animations[name]?.frames ?? 0);
      for (let i = 0; i < count; i++) out.push(this.frames[`${asset}/${name}/e/${i}`]);
      return out;
    };
    this.infectionGlyph = undefined;
    this.draws = this.speciesAssets.map((asset) => {
      const meta = asset ? this.manifest.sprites[asset] : undefined;
      if (!meta) return null;
      const kind = drawKindOf(meta);
      if (kind === 'virus') this.infectionGlyph ??= this.frames[`${asset}/glyph/e/0`];
      return {
        kind,
        fungus:
          kind === 'fungus'
            ? {
                mask: frames(asset, 'mask', 16),
                decaying: frames(asset, 'decaying', 16),
                tip: this.frames[`${asset}/tip/e/0`],
                bud: this.frames[`${asset}/bud/e/0`],
                pulse: frames(asset, 'pulse', 2),
                trap: frames(asset, 'trap', 3),
                dormant: frames(asset, 'dormant', 3),
              }
            : null,
        headings: meta.headings,
        size: meta.size,
        stress: anim(asset, 'stress', meta.headings),
        feed: anim(asset, 'feed', meta.headings),
        move: anim(asset, 'move', meta.headings),
        idle: anim(asset, 'idle', meta.headings),
        death: anim(asset, 'death', meta.headings),
        dormant: kind === 'body' ? anim(asset, 'dormant', meta.headings) : null,
      };
    });
  }

  setOptions(o: Partial<RendererOptions>): void {
    const palette = this.opts.simplifiedOverlayPalette === true;
    this.opts = { ...this.opts, ...o };
    this.camera.reducedMotion = this.opts.reducedMotion; // P4.13: UX §7.4 camera easing → instant
    this.overlaySprite.alpha = this.opts.overlayOpacity;
    // A paused dish sends no new snapshot: repaint the shown overlay in the chosen palette now.
    if ((this.opts.simplifiedOverlayPalette === true) !== palette && this.lastOverlay) this.paintOverlayLayer(this.lastOverlay);
  }

  /** The overlay last painted (kept so a palette switch can repaint it; cosmetic only). */
  private lastOverlay: NonNullable<SnapshotMsg['overlay']> | null = null;

  private paintOverlayLayer(o: NonNullable<SnapshotMsg['overlay']>): void {
    const ctx = this.overlayCanvas.getContext('2d')!;
    const img = (this.overlayImg ??= ctx.createImageData(GRID_W, GRID_W));
    paintOverlay(img, o.data, this.structure, o.id, o.max, this.opts.simplifiedOverlayPalette === true);
    ctx.putImageData(img, 0, 0);
    this.overlayTex.source.update();
  }

  /** Observe tray "Infection markers" (SPEC §10.8): the glyph on every infected host while on. */
  setInfectionMarkers(on: boolean): void {
    this.infectionMarkers = on;
  }

  select(birthId: number | null, cell: number | null = null): void {
    this.selectedBirthId = birthId;
    this.selectedCell = cell;
  }

  zoomPreset(kind: 'dish' | 'neighborhood' | 'close', around?: [number, number]): void {
    if (kind === 'dish') this.camera.fit();
    else this.camera.centerOn(around?.[0] ?? this.camera.cx, around?.[1] ?? this.camera.cy, kind === 'close' ? ZOOM_CLOSE : ZOOM_NEIGHBORHOOD);
  }

  private drawRim(): void {
    const g = this.rim;
    g.clear();
    const cx = MASK_CX + 0.5;
    const cy = MASK_CY + 0.5;
    g.circle(cx, cy, MASK_R + 1.2).stroke({ width: 1.2, color: 0x2c3f49, alpha: 1 });
    g.circle(cx, cy, MASK_R + 2.2).stroke({ width: 0.6, color: 0x2c3f49, alpha: 0.8 });
    const a0 = -2.6;
    g.moveTo(cx + Math.cos(a0) * (MASK_R + 1.2), cy + Math.sin(a0) * (MASK_R + 1.2));
    g.arc(cx, cy, MASK_R + 1.2, a0, -1.9).stroke({ width: 0.5, color: 0xf5f4ef, alpha: 0.7 });
  }

  /** Apply a new snapshot from the worker. */
  /** Paint dish geometry (substrates, stone, walls, shade) from a snapshot that carries it. */
  applyGeometry(s: SnapshotMsg): void {
    if (this.destroyed || !s.geometry) return;
    this.structure = s.geometry.structure;
    this.geometry = s.geometry;
    this.previewCache = null;
    const ctx = this.dishCanvas.getContext('2d')!;
    const img = ctx.createImageData(DISH_TEX, DISH_TEX);
    paintDish(img, s.geometry.substrate, s.geometry.structure, s.geometry.shade);
    ctx.putImageData(img, 0, 0);
    this.dishTex.source.update();
    // Phase 5: edge glyphs and device tiles, redrawn only when the geometry changes (never per tick).
    this.drawEdges();
    this.drawDevices(s.resins);
    this.drawBadges();
  }

  /**
   * Wave 12 (gateBadges.ts): the gate whose sheet is open (barriers.ts edgeKey(cell, dir)), or null on close.
   * Its badge shows at every zoom, running or paused (the tracer preview stays paused-only). UI state only.
   */
  setSelectedGate(key: number | null): void {
    if (key === this.selectedGateKey) return;
    this.selectedGateKey = key;
    this.drawBadges();
  }

  /**
   * Gate-class badges: one per straight run of same-code edges at the close preset, and the selected gate's at
   * every zoom (gateBadges.ts worldBadges). Static (nothing animates). Drawn on a geometry or selection change,
   * and when the zoom changes band or moves by more than a quarter (frame()), never per tick.
   */
  private drawBadges(): void {
    const g = this.badgesG;
    g.clear();
    const z = Math.max(1e-6, this.camera.zoom);
    const badges = worldBadges(this.geometry?.edges, z, this.selectedGateKey);
    // Track the zoom whenever the dish has barriers (so zooming into the close band shows the run badges).
    this.badgesZoom = badges.length > 0 || (this.geometry?.edges?.list.length ?? 0) > 0 ? z : Number.NaN;
    const px = 1 / z;
    for (const b of badges) {
      const box = badgeBox(b, z);
      g.roundRect(box.x, box.y, box.w, box.h, 2 * px)
        .fill({ color: BADGE_COLORS.plate, alpha: 0.94 })
        .stroke({ width: (b.selected ? 2 : 1) * px, color: BADGE_COLORS.pip, alpha: 1 });
      const cy = box.y + box.h / 2;
      const r = BADGE_PX.pipR * px;
      b.pips.forEach((p, i) => this.drawPip(g, p.state, box.x + (BADGE_PX.pad + BADGE_PX.pitch * (i + 0.5)) * px, cy, r, px, b.dir, pipPointsBack(b.code)));
    }
  }

  /** One pip by shape: filled = pass, half-filled = partial, hollow = blocked, a chevron (in the flow direction) = one way. */
  private drawPip(g: Graphics, state: PipState, x: number, y: number, r: number, px: number, dir: 'R' | 'D', back: boolean): void {
    const color = BADGE_COLORS.pip;
    const line = { width: 1.25 * px, color, alpha: 1 };
    if (state === 'pass') g.circle(x, y, r).fill({ color, alpha: 1 });
    else if (state === 'blocked') g.circle(x, y, r - 0.6 * px).stroke(line);
    else if (state === 'partial') {
      g.circle(x, y, r - 0.6 * px).stroke(line);
      g.moveTo(x, y - r).arc(x, y, r, -Math.PI / 2, Math.PI / 2, true).closePath().fill({ color, alpha: 1 });
    } else {
      // Chevron toward the flow: +x for an 'R' edge (−x with EDGE_FLOW_BACK), +y for a 'D' edge (−y back).
      const s = back ? -1 : 1;
      const [ux, uy] = dir === 'R' ? [s, 0] : [0, s];
      const [vx, vy] = [-uy, ux];
      g.moveTo(x - ux * r * 0.6 + vx * r, y - uy * r * 0.6 + vy * r)
        .lineTo(x + ux * r * 0.8, y + uy * r * 0.8)
        .lineTo(x - ux * r * 0.6 - vx * r, y - uy * r * 0.6 - vy * r)
        .stroke({ width: 1.75 * px, color, alpha: 1, cap: 'round', join: 'round' });
    }
  }

  /**
   * Edge-barrier glyphs (structureLayer.ts edgeGlyph) on the shared cell edges, a pale halo stroke under
   * each dark glyph, at least ~1.5 screen pixels wide so they read at every zoom preset. Drawn when the
   * geometry changes, or when the zoom moved by more than a quarter since (frame() checks; not per tick).
   */
  private drawEdges(): void {
    const g = this.structuresG;
    g.clear();
    const z = this.camera.zoom;
    // Wave 12: the glyph's marks follow the zoom's detail band, and each keeps its own minimum screen width.
    const glyphs = edgeGlyphs(this.geometry?.edges, z);
    this.edgesZoom = glyphs.length > 0 ? z : Number.NaN;
    if (glyphs.length === 0) return;
    const px = 1 / Math.max(1e-6, z);
    for (const pass of [0, 1] as const) {
      for (const { glyph } of glyphs) {
        const sg = glyph.segments;
        for (let k = 0; k < sg.length; k += 4) g.moveTo(sg[k]!, sg[k + 1]!).lineTo(sg[k + 2]!, sg[k + 3]!);
        const w = Math.max(glyph.width, glyph.minPx * px);
        if (pass === 0) g.stroke({ width: w * 2, color: EDGE_GLYPH_COLORS.halo, alpha: 0.55, cap: 'round' });
        else g.stroke({ width: w, color: glyph.color, alpha: 1, cap: 'butt' });
      }
    }
  }

  /** Furnishing and device tiles ('device' atlas tile; structureLayer.ts deviceFrame), S08 by its snapshot saturation. */
  private drawDevices(resins: SnapshotMsg['resins']): void {
    const list = this.deviceParticles.particleChildren;
    const sprites = deviceSprites(this.geometry?.devices, resins);
    let n = 0;
    const size = this.manifest.tiles?.device?.size ?? 16;
    for (const d of sprites) {
      const tex = this.frames[tileFrameKey('device', d.frame)];
      if (!tex) continue;
      let p = this.devicePool[n];
      if (!p) {
        p = new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5 });
        this.devicePool[n] = p;
      }
      p.texture = tex;
      p.x = d.x;
      p.y = d.y;
      p.scaleX = 1 / size;
      p.scaleY = 1 / size;
      list[n++] = p;
    }
    if (list.length !== n || n > 0) {
      list.length = n;
      this.deviceParticles.update();
    }
    this.lastResinKey = resinKey(resins);
  }

  applySnapshot(s: SnapshotMsg, now = performance.now()): void {
    if (this.destroyed) return;
    if (s.geometry) this.applyGeometry(s);
    // Phase 5: a resin's saturation travels per snapshot (no geometry resend): retile only when it changed.
    else if (s.resins && resinKey(s.resins) !== this.lastResinKey) this.drawDevices(s.resins);
    this.previewCache = null;
    // Deposits: repaint only the cells whose bands changed (byte-identical to a full repaint) and
    // touch the canvas/texture only when something did.
    {
      const ctx = (this.depositCtx ??= this.depositCanvas.getContext('2d')!);
      const img = (this.depositImg ??= ctx.createImageData(DISH_TEX, DISH_TEX));
      let r: DirtyRect;
      if (!this.depositPrev || this.depositPrev.length !== s.deposits.length) {
        paintDeposits(img, s.deposits);
        this.depositPrev = s.deposits.slice();
        r = this.depositDirty;
        r.x = 0;
        r.y = 0;
        r.w = DISH_TEX;
        r.h = DISH_TEX;
      } else r = repaintDepositCells(img, s.deposits, this.depositPrev, this.depositDirty);
      if (r.w > 0) {
        ctx.putImageData(img, 0, 0, r.x, r.y, r.w, r.h);
        this.depositTex.source.update();
      }
      this.depositVersion++;
    }
    this.applyFilm(s.deposits);
    if (s.overlay) {
      this.lastOverlay = s.overlay;
      // P4.13 (ARCH §13): the overlay texture refreshes at most every budget interval; a later frame paints it.
      if (refreshDue(this.lastOverlayPaint, now, this.budget.overlayRefreshMs)) {
        this.paintOverlayLayer(s.overlay);
        this.lastOverlayPaint = now;
        this.pendingOverlay = null;
      } else this.pendingOverlay = s.overlay;
      this.overlaySprite.visible = true;
    } else {
      this.lastOverlay = null;
      this.pendingOverlay = null;
      this.overlaySprite.visible = false;
    }

    // Interpolation endpoints, keyed by entityId against the previous snapshot.
    const n = s.count;
    const lastX = this.curX;
    const lastY = this.curY;
    const lastIndex = this.curIndex;
    if (this.spareX.length < n) {
      const cap = Math.max(64, Math.ceil(n * 1.25));
      this.spareX = new Float32Array(cap);
      this.spareY = new Float32Array(cap);
    }
    if (this.prevX.length < n) {
      const cap = Math.max(64, Math.ceil(n * 1.25));
      this.prevX = new Float32Array(cap);
      this.prevY = new Float32Array(cap);
    }
    const nx = this.spareX;
    const ny = this.spareY;
    const px = this.prevX;
    const py = this.prevY;
    const index = this.spareIndex;
    index.clear();
    // P4.13: the feed animation's start per organism (a new bout of eating starts at frame 0).
    if (this.spareFeed.length < n) this.spareFeed = new Float64Array(Math.max(64, Math.ceil(n * 1.25)));
    const lastFeed = this.feedStart;
    const feed = this.spareFeed;
    for (let k = 0; k < n; k++) {
      const o = k * ENT_STRIDE;
      const entityId = s.ids[k * ID_STRIDE + 1]!;
      const x = s.ents[o + E_X]!;
      const y = s.ents[o + E_Y]!;
      nx[k] = x;
      ny[k] = y;
      const j = lastIndex.get(entityId);
      if (j === undefined) {
        px[k] = x;
        py[k] = y;
      } else {
        px[k] = lastX[j]!;
        py[k] = lastY[j]!;
      }
      index.set(entityId, k);
      const d = this.draws[s.ents[o + E_SPECIES]!];
      const feeding =
        d?.kind === 'body' &&
        bodyAnimFor(s.ents[o + E_CUE]!, (s.ents[o + E_FLAGS]! & FLAG_MOVING) !== 0, s.ents[o + E_LIFE]! !== 0, {
          stress: d.stress !== null,
          feed: d.feed !== null,
          move: d.move !== null,
        }) === 'feed';
      feed[k] = feedStartAfterSnapshot(feeding, j === undefined || j >= lastFeed.length ? Number.NaN : lastFeed[j]!);
    }
    this.spareFeed = lastFeed;
    this.feedStart = feed;
    this.spareX = lastX;
    this.spareY = lastY;
    this.spareIndex = lastIndex;
    this.curX = nx;
    this.curY = ny;
    this.curIndex = index;
    if (this.cur) this.interval = Math.min(400, Math.max(40, now - this.curAt));
    this.curAt = now;
    if (this.rider.length < n) this.rider = new Uint8Array(Math.max(64, Math.ceil(n * 1.25)));
    if (this.riderScratch.next.length < n) this.riderScratch.next = new Int32Array(this.rider.length);
    this.riders = riderMarks(s.ents, n, this.rider, this.riderScratch);
    this.handleEvents(s.events, now);
    this.cur = s;
    this.lineage = s.lineage ?? null;
    this.favorites = s.favorites ?? null; // P4.1: followed families' marks (snapshot data only)
    this.aggDirty = true;
  }

  /**
   * Film tiles (UX §6.2): one particle per cell with film, its tile from the four-neighbour mask and
   * the eroding bit, its opacity from the film level. Rebuilt only when the film band changed.
   */
  private applyFilm(deposits: Uint8Array): void {
    const base = DEPOSIT_FILM_BAND * CELL_COUNT;
    const prev = this.filmPrev;
    if (deposits.length < base + CELL_COUNT) {
      if (prev) {
        this.filmParticles.particleChildren.length = 0;
        this.filmParticles.update();
        this.filmPrev = null;
      }
      return;
    }
    let changed = !prev;
    if (prev) for (let i = 0; i < CELL_COUNT && !changed; i++) changed = prev[i] !== deposits[base + i];
    if (!changed) return;
    this.filmPrev = deposits.slice(base, base + CELL_COUNT);
    const list = this.filmParticles.particleChildren;
    let n = 0;
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      const t = filmTile(deposits, cell);
      if (t < 0) continue;
      const tex = this.frames[tileFrameKey('film', t)];
      if (!tex) continue;
      let p = this.filmPool[n];
      if (!p) {
        p = new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5 });
        this.filmPool[n] = p;
      }
      const size = this.manifest.tiles?.film?.size ?? 16;
      p.texture = tex;
      p.x = (cell % GRID_W) + 0.5;
      p.y = Math.floor(cell / GRID_W) + 0.5;
      p.scaleX = 1 / size;
      p.scaleY = 1 / size;
      p.alpha = filmAlpha(filmLevel(deposits, cell));
      list[n++] = p;
    }
    list.length = n;
    this.filmParticles.update();
  }

  /** Food objects at their fill step, then the fading stains of emptied ones (UX §6.5). */
  private drawObjects(s: SnapshotMsg, now: number): void {
    const list = this.objectParticles.particleChildren;
    let n = 0;
    for (const o of s.objects ?? []) {
      const tex = this.frames[tileFrameKey(o.kind, objectFrame(o.fill))];
      if (!tex) continue;
      let p = this.objectPool[n];
      if (!p) {
        p = new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5 });
        this.objectPool[n] = p;
      }
      const size = this.manifest.tiles?.[o.kind]?.size ?? 16;
      p.texture = tex;
      p.x = o.x;
      p.y = o.y;
      p.scaleX = 1 / size;
      p.scaleY = 1 / size;
      list[n++] = p;
    }
    let live = 0;
    for (const st of this.stains) {
      const a = stainAlphaAt(now - st.start, this.opts.reducedMotion); // UX §7.4: held still in reduced motion
      if (a <= 0) continue;
      this.stains[live++] = st;
      st.particle.alpha = a;
      list[n++] = st.particle;
    }
    this.stains.length = live;
    if (list.length !== n || n > 0) {
      list.length = n;
      this.objectParticles.update();
    }
  }

  private paintAggregation(s: SnapshotMsg): void {
    if (this.paintTraitAggregation(s)) return;
    this.aggDirty = false;
    const nSp = Math.max(1, this.speciesIds.length);
    const dominant = this.aggDominant.fill(-1);
    const density = this.aggDensity.fill(0);
    if (this.aggPerCell.length !== CELL_COUNT * nSp) this.aggPerCell = new Uint16Array(CELL_COUNT * nSp);
    const perCell = this.aggPerCell.fill(0);
    for (let k = 0; k < s.count; k++) {
      const o = k * ENT_STRIDE;
      const cell = Math.floor(s.ents[o + E_Y]!) * GRID_W + Math.floor(s.ents[o + E_X]!);
      const sp = s.ents[o + E_SPECIES]!;
      if (cell < 0 || cell >= CELL_COUNT) continue;
      const v = ++perCell[cell * nSp + sp]!;
      density[cell]!++;
      const d = dominant[cell]!;
      if (d < 0 || v > perCell[cell * nSp + d]!) dominant[cell] = sp;
    }
    const ctx = this.aggCanvas.getContext('2d')!;
    const img = (this.aggImg ??= ctx.createImageData(GRID_W, GRID_W));
    paintAggregation(img, dominant, density, this.speciesColors);
    ctx.putImageData(img, 0, 0);
    this.aggTex.source.update();
  }

  private handleEvents(events: readonly VisualEvent[], now: number): void {
    // Deaths leave a dissolve (a static frame in reduced motion); a committed birth leaves the split flash,
    // or in reduced motion a static split frame for 1 s (UX §7.4; features.ts effectForEvent).
    const prev = this.cur;
    let byBirth: Map<number, number> | null = null;
    for (const ev of events) {
      const cx = (ev.cell % GRID_W) + 0.5;
      const cy = Math.floor(ev.cell / GRID_W) + 0.5;
      const fx = effectForEvent(ev.type, this.opts.reducedMotion);
      if (fx) this.spawnEffect(fx, cx, cy, 0.9, now);
      if (ev.type === 'objectEmptied') {
        // A fading stain where a food object ran out (cosmetic; it blocks nothing).
        const tex = this.frames[tileFrameKey('stain', 0)];
        if (tex && ev.cell >= 0 && this.budget.stains && this.stains.length < STAINS_MAX) {
          const size = this.manifest.tiles?.stain?.size ?? 16;
          const particle = new Particle({ texture: tex, x: cx, y: cy, anchorX: 0.5, anchorY: 0.5, scaleX: 1 / size, scaleY: 1 / size });
          this.stains.push({ particle, start: now });
        }
        continue;
      }
      if (ev.type === 'death' && prev) {
        // The organism's last position in the previous snapshot, by birthId (first match).
        if (!byBirth) {
          byBirth = new Map<number, number>();
          for (let k = prev.count - 1; k >= 0; k--) byBirth.set(prev.ids[k * ID_STRIDE]!, k);
        }
        const k = byBirth.get(ev.birthId);
        if (k === undefined || this.ghosts.length >= GHOSTS_MAX) continue; // P4.13: ghost cap (cosmetic)
        const o = k * ENT_STRIDE;
        const d = this.draws[prev.ents[o + E_SPECIES]!];
        if (d?.kind === 'fungus') {
          // A dead segment shows decaying/e/<mask> for its last link mask (there is no dying flag, W2-27).
          const still = d.fungus?.decaying[(prev.ents[o + E_LINKMASK] ?? 0) & 15];
          if (!still) continue;
          // Centred on its cell like the live tile it replaces.
          const p = new Particle({ texture: still, x: Math.floor(prev.ents[o + E_X]!) + 0.5, y: Math.floor(prev.ents[o + E_Y]!) + 0.5, anchorX: 0.5, anchorY: 0.5, scaleX: 1 / d.size, scaleY: 1 / d.size });
          this.ghosts.push({ particle: p, death: null, still, row: 0, start: now });
          continue;
        }
        if (!d?.death || d.kind !== 'body') continue;
        const p = new Particle({ texture: Texture.EMPTY, x: prev.ents[o + E_X]!, y: prev.ents[o + E_Y]!, anchorX: 0.5, anchorY: 0.5 });
        this.ghosts.push({ particle: p, death: d.death, still: null, row: headingRow(d.headings, prev.ents[o + E_HEADING]!), start: now });
      }
    }
  }

  /**
   * P4.13: one frame's budget bookkeeping: the frame-time moving average drives the degrade ladder
   * (budgets.ts; cosmetic only), and the frames counted per second are the diagnostics bar's fps.
   */
  private frameBudget(now: number): void {
    if (!Number.isNaN(this.lastFrameAt)) {
      const level = this.ladder.update(now - this.lastFrameAt, now);
      if (level !== this.budgetLevelNow) {
        this.budgetLevelNow = level;
        this.budget = budgetFor(level);
        if (!this.budget.stains) this.stains.length = 0; // level ≥ 1: no stains
      }
    }
    this.lastFrameAt = now;
    if (Number.isNaN(this.fpsSince)) this.fpsSince = now;
    this.fpsFrames++;
    if (now - this.fpsSince >= 1000) {
      this.fpsNow = (this.fpsFrames * 1000) / (now - this.fpsSince);
      this.fpsFrames = 0;
      this.fpsSince = now;
    }
  }

  private budgetLevelNow: BudgetLevel = 0;

  /** P4.13: the degrade ladder's level now (0 normal … 3), for the diagnostics bar. */
  get budgetLevel(): BudgetLevel {
    return this.budgetLevelNow;
  }

  /** P4.13: frames per second over the last whole second, the ladder's level, the highest level reached and the frame-time average. */
  frameStats(): { fps: number; level: BudgetLevel; maxLevel: BudgetLevel; frameMsAvg: number } {
    return { fps: this.fpsNow, level: this.budgetLevelNow, maxLevel: this.ladder.maxLevel, frameMsAvg: this.ladder.avgMs };
  }

  /** P4.13: how often HTML markers and labels over the dish should redraw (0 = every frame; 500 ms at level ≥ 2). */
  get markerRedrawMs(): number {
    return this.budget.markerRedrawMs;
  }

  /** UI hook: a placement ring where the player just added something (a still ring in reduced motion). */
  placementRing(x: number, y: number, radius: number): void {
    this.spawnEffect(placementEffect(this.opts.reducedMotion), x, y, radius, performance.now());
  }

  private spawnEffect(spec: EffectSpec, x: number, y: number, radius: number, now: number): void {
    if (this.fx.length >= this.budget.effectsMax) return; // budget: cosmetic effects degrade first (budgets.ts)
    const g = new Graphics();
    this.effects.addChild(g);
    this.fx.push({ g, start: now, spec, x, y, radius });
  }

  private frame(): void {
    if (this.destroyed) return;
    const now = performance.now();
    this.frameBudget(now);
    const cam = this.camera;
    cam.step(now); // P4.13: an eased player move advances before the follow rule
    const s = this.cur;
    // Follow target, if any.
    if (s && cam.followEntityId !== null) {
      const k = this.curIndex.get(cam.followEntityId);
      if (k !== undefined) cam.follow(this.curX[k]!, this.curY[k]!);
    }
    this.world.scale.set(cam.zoom);
    this.world.position.set(cam.viewW / 2 - cam.cx * cam.zoom, cam.viewH / 2 - cam.cy * cam.zoom);
    // ARCH §9: below sprite scale 1 the aggregation layer replaces individual sprites.
    const wide = cam.aggregated();
    this.aggSprite.visible = wide;
    this.particles.visible = !wide;
    this.featureParticles.visible = !wide;
    this.statusParticles.visible = !wide;
    this.particles.alpha = 1;
    if (!s) return;
    if (wide && this.aggDirty && refreshDue(this.lastAggPaint, now, this.budget.aggregationRefreshMs)) {
      this.paintAggregation(s);
      this.lastAggPaint = now;
    }
    if (this.pendingOverlay && refreshDue(this.lastOverlayPaint, now, this.budget.overlayRefreshMs)) {
      this.paintOverlayLayer(this.pendingOverlay);
      this.lastOverlayPaint = now;
      this.pendingOverlay = null;
    }
    this.drawObjects(s, now);
    // Phase 5: edge glyph widths follow big zoom changes (a redraw, not a per-tick one); the paused-only gate tracer.
    if (!Number.isNaN(this.edgesZoom) && (Math.abs(cam.zoom / this.edgesZoom - 1) > 0.25 || edgeDetail(cam.zoom) !== edgeDetail(this.edgesZoom))) this.drawEdges();
    // Wave 12: badges keep their screen size and show runs only at the close band (a redraw on a band change or a big zoom move).
    if (!Number.isNaN(this.badgesZoom) && (Math.abs(cam.zoom / this.badgesZoom - 1) > 0.25 || badgeZoomBand(cam.zoom) !== badgeZoomBand(this.badgesZoom))) this.drawBadges();
    this.drawGateTracer(s, now);

    const alpha = Math.min(1, (now - this.curAt) / this.interval);
    const pxScale = cam.spritePixelScale();
    const scale = pxScale / cam.zoom;
    const reduced = this.opts.reducedMotion;
    // Pixi skips an invisible or fully transparent container; so do we (ghosts still expire).
    const draw = this.particles.visible && this.particles.alpha > 0;
    const list = this.particles.particleChildren;
    const flist = this.featureParticles.particleChildren;
    const slist = this.statusParticles.particleChildren;
    const blist = this.bandParticles?.particleChildren;
    let n = 0;
    let nf = 0;
    let ns = 0;
    let nb = 0;
    /** One overlay frame (feature rim, fungal tip/bud/pulse, or status mark) into a pooled list. */
    const overlay = (pool: Particle[], out: IParticle[], i: number, tex: Texture, x: number, y: number, sc: number, a: number): void => {
      let fp = pool[i];
      if (!fp) {
        fp = new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5 });
        pool[i] = fp;
      }
      fp.texture = tex;
      fp.x = x;
      fp.y = y;
      fp.scaleX = sc;
      fp.scaleY = sc;
      if (fp.alpha !== a) fp.alpha = a;
      out[i] = fp;
    };
    if (draw) {
      const needed = s.count;
      while (this.pool.length < needed) {
        const p = new Particle({ texture: Texture.EMPTY, anchorX: 0.5, anchorY: 0.5 });
        this.pool.push(p);
      }
      if (this.poolTint.length < this.pool.length) {
        const t = new Int32Array(this.pool.length).fill(-1);
        t.set(this.poolTint);
        this.poolTint = t;
      }
      // Off-screen organisms are not submitted (a sprite never reaches past half its frame).
      const margin = (this.maxFrameSize * scale) / 2 + 0.5;
      const halfW = cam.viewW / (2 * cam.zoom) + margin;
      const halfH = cam.viewH / (2 * cam.zoom) + margin;
      const minX = cam.cx - halfW;
      const maxX = cam.cx + halfW;
      const minY = cam.cy - halfH;
      const maxY = cam.cy + halfH;
      const ents = s.ents;
      const ids = s.ids;
      const curX = this.curX;
      const curY = this.curY;
      const prevX = this.prevX;
      const prevY = this.prevY;
      const rider = this.rider;
      // Rebuild the particle list: live organisms (riders — a parasite on its host — in a second pass,
      // so they show over the host), then ghosts.
      for (let pass = 0; pass < (this.riders > 0 ? 2 : 1); pass++) {
        for (let k = 0; k < needed; k++) {
          if (this.riders > 0 && rider[k] !== pass) continue;
          const o = k * ENT_STRIDE;
          const d = this.draws[ents[o + E_SPECIES]!];
          // A virus has no body (its units are a density overlay, UX §6.2).
          if (!d || d.kind === 'virus') continue;
          const x0 = prevX[k]!;
          const y0 = prevY[k]!;
          const x = x0 + (curX[k]! - x0) * alpha;
          const y = y0 + (curY[k]! - y0) * alpha;
          if (x < minX || x > maxX || y < minY || y > maxY) continue;
          const flags = ents[o + E_FLAGS]!;
          const cue = ents[o + E_CUE]!;
          const cue2 = ents[o + E_CUE2] ?? 0;
          // Protocol 3 (wave 13): the Phase 5 marks and poses read only E_CUE3 (0 for every v1.0 organism).
          const cue3 = ents[o + E_CUE3] ?? 0;
          // Preparing/Resting/Waking hold a still, folded pose (UX §7.2): no locomotion or feeding frames.
          const life = ents[o + E_LIFE]!;
          const dormant = life !== 0;
          const entityId = ids[k * ID_STRIDE + 1]!;
          const phase = (entityId * 97) % 1000;
          const selected = ids[k * ID_STRIDE] === this.selectedBirthId;
          let tex: Texture | undefined;
          let sc = scale;
          let hRow = 0;
          let fungal: FungalPick | null = null;
          let px = x;
          let py = y;
          if (d.kind === 'fungus') {
            // Fungal segments: the connection-mask tile of its live links, one cell per tile (D-0046),
            // centred on its cell (not the segment's jittered position) so neighbouring arms meet.
            fungal = fungalPick(ents[o + E_LINKMASK] ?? 0, ents[o + E_GROWTH]!, reduced, now + phase, this.fpick);
            tex = d.fungus?.mask[fungal.mask];
            sc = 1 / d.size;
            px = Math.floor(x) + 0.5;
            py = Math.floor(y) + 0.5;
            if (!tex) continue;
          } else {
            // P4.13: the feeding animation only with the snapshot's CUE_FEEDING bit (features.ts bodyAnimFor),
            // and each new bout of eating starts at frame 0 on the first frame after its snapshot.
            const anim = bodyAnimFor(cue, (flags & FLAG_MOVING) !== 0, dormant, { stress: d.stress !== null, feed: d.feed !== null, move: d.move !== null });
            const a = anim === 'stress' ? d.stress : anim === 'feed' ? d.feed : anim === 'move' ? d.move : d.idle;
            if (!a) continue;
            let clock = now + phase;
            if (anim === 'feed') {
              if (this.feedStart[k] === FEED_START_PENDING) this.feedStart[k] = now;
              clock = feedFrameClock(this.feedStart[k]!, now, clock);
            }
            const idx = bodyFrameIndex(a.frames, a.durationMs, a.reducedMotionFrame, reduced, dormant, clock);
            hRow = headingRow(d.headings, ents[o + E_HEADING]!);
            tex = a.tex[hRow]![idx];
          }
          // Wave 13 (D-0109): a native rester shows its own still pose per life state (Preparing, Resting,
          // Waking): B12 and P08 their `dormant` body frames, F04's segment its lone resting spore tile.
          const rest = dormantPoseFrame(life);
          if (rest >= 0) tex = (fungal ? d.fungus?.dormant[rest] : d.dormant?.tex[hRow]?.[rest]) ?? tex;
          const p = this.pool[k]!;
          if (tex) p.texture = tex;
          p.x = px;
          p.y = py;
          p.scaleX = sc;
          p.scaleY = sc;
          // Newborns fade in over their first snapshot (not in reduced motion, UX §7.4: no flash);
          // feeders glow very slightly brighter.
          const born = newbornAlpha((cue & CUE_JUST_BORN) !== 0, reduced, alpha);
          if (p.alpha !== born) p.alpha = born;
          const tint = dormant ? 0xc8c8c8 : cue & CUE_FEEDING ? 0xffffff : 0xf0f0f0;
          if (this.poolTint[k] !== tint) {
            p.tint = tint;
            this.poolTint[k] = tint;
          }
          list[n++] = p;
          // Trait overlay: a band ring in the legend's exact colour (the body keeps its own colours).
          const band = this.traitColor(k);
          if (band !== undefined && blist) {
            blist[nb] = this.bandRing(nb, px, py, (sc * (d.size + TRAIT_RING_EXTRA)) / TRAIT_RING_PX, band, born);
            nb++;
          }
          if (fungal && d.fungus) {
            // Tip over a growing end (≤ 1 link), bud when ready to branch, F02 pulse only on a transfer.
            if (fungal.tip && d.fungus.tip) overlay(this.featurePool, flist, nf++, d.fungus.tip, px, py, sc, born);
            if (fungal.bud && d.fungus.bud) overlay(this.featurePool, flist, nf++, d.fungus.bud, px, py, sc, born);
            const pt = fungal.pulse >= 0 ? d.fungus.pulse[fungal.pulse] : undefined;
            if (pt) overlay(this.featurePool, flist, nf++, pt, px, py, sc, born);
            // Wave 13: F03's recorded trap state (Open, Holding, Cooldown) over its segment, like tip and bud.
            const trapPose = trapPoseFrame(cue3);
            const tt = trapPose >= 0 ? d.fungus.trap[trapPose] : undefined;
            if (tt) overlay(this.featurePool, flist, nf++, tt, px, py, sc, born);
          } else {
            // Module feature layers: only marks the snapshot says are real for this organism.
            const cell = Math.floor(curY[k]!) * GRID_W + Math.floor(curX[k]!);
            const filmBand = cue2 & CUE2_MOD_E10 && cell >= 0 && cell < CELL_COUNT ? filmLevelBand(filmLevel(s.deposits, cell)) : 0;
            const pulseOn = featurePulseOn(now + phase, reduced);
            const marks = featureLayers(cue, life, selected, this.picks, cue2, { filmBand, reduced, pulseOn, cue3 });
            for (let m = 0; m < marks; m++) {
              const pick = this.picks[m]!;
              const lt = this.layerTexture(pick.layer, pick.frame, hRow);
              if (!lt) continue;
              const ms = featureMarkScale(scale, d.size, this.layerSize[pick.layer]);
              overlay(this.featurePool, flist, nf++, lt, x, y, ms, born);
            }
          }
          // Status mark: the infection glyph on an inspected infected host, or on every one while the
          // Infection markers toggle is on (SPEC §7.5, §10.8).
          if (this.infectionGlyph && infectionGlyphShown(cue2, selected, this.infectionMarkers)) {
            const off = (Math.max(d.size * sc, 16 * scale) * 0.35);
            overlay(this.statusPool, slist, ns++, this.infectionGlyph, x + off, y - off, scale, 1);
          }
        }
      }
    }
    // Death dissolves (3–4 frames), and fading decaying tiles of dead fungal segments, then removed.
    let live = 0;
    for (const gh of this.ghosts) {
      const a = gh.death;
      const t = now - gh.start;
      const total = ghostDurationMs(a, reduced, DECAY_MS);
      if (t > total) continue;
      this.ghosts[live++] = gh;
      if (!draw) continue;
      if (a) {
        const tex = a.tex[gh.row]![ghostFrameIndex(a, reduced, t)];
        if (tex) gh.particle.texture = tex;
        gh.particle.scaleX = scale;
        gh.particle.scaleY = scale;
      } else gh.particle.alpha = decayTileAlpha(t, total, reduced);
      list[n++] = gh.particle;
    }
    this.ghosts.length = live;
    if (draw) {
      list.length = n;
      this.particles.update();
      flist.length = nf;
      this.featureParticles.update();
      slist.length = ns;
      this.statusParticles.update();
    }
    if (this.bandParticles && blist) {
      this.bandParticles.visible = draw && nb > 0;
      if (blist.length !== nb || nb > 0) {
        blist.length = nb;
        this.bandParticles.update();
      }
    }
    this.drawLinks(s, draw, scale);

    // Effects.
    this.fx = this.fx.filter((e) => {
      const t = (now - e.start) / e.spec.durationMs;
      if (t >= 1) {
        e.g.destroy();
        return false;
      }
      e.g.clear();
      // Growth and fade only with motion on; reduced motion draws the same ring still (features.ts effectLook).
      const look = effectLook(e.spec, e.radius, t);
      if (e.spec.kind === 'split') {
        e.g.circle(e.x, e.y, look.radius).stroke({ width: 1.5 / cam.zoom, color: 0xffffff, alpha: look.alpha });
        // The static split frame: a short bar across the ring ("it split in two"), dark-edged to read on any substrate.
        if (look.divider) {
          const lw = 1.5 / cam.zoom;
          e.g.moveTo(e.x, e.y - look.radius).lineTo(e.x, e.y + look.radius).stroke({ width: lw * 2.2, color: 0x172c35, alpha: look.alpha });
          e.g.moveTo(e.x, e.y - look.radius).lineTo(e.x, e.y + look.radius).stroke({ width: lw, color: 0xffffff, alpha: look.alpha });
        }
      } else {
        e.g.circle(e.x, e.y, look.radius).stroke({ width: 2 / cam.zoom, color: 0x256e9e, alpha: look.alpha });
      }
      return true;
    });

    // Selection ring outside the body (never recolors the organism).
    const g = this.selectionG;
    g.clear();
    if (this.selectedBirthId !== null) {
      for (let k = 0; k < s.count; k++) {
        if (s.ids[k * ID_STRIDE] !== this.selectedBirthId) continue;
        const x = this.prevX[k]! + (this.curX[k]! - this.prevX[k]!) * alpha;
        const y = this.prevY[k]! + (this.curY[k]! - this.prevY[k]!) * alpha;
        const asset = this.speciesAssets[s.ents[k * ENT_STRIDE + E_SPECIES]!];
        const size = (asset ? this.manifest.sprites[asset]?.size : 16) ?? 16;
        const r = (size / 16) * 1.05;
        const lw = 2 / cam.zoom;
        g.circle(x, y, r).stroke({ width: lw * 2, color: 0x172c35, alpha: 0.9 });
        g.circle(x, y, r).stroke({ width: lw, color: 0xf2b84b, alpha: 1 });
        break;
      }
    } else if (this.selectedCell !== null) {
      const x = this.selectedCell % GRID_W;
      const y = Math.floor(this.selectedCell / GRID_W);
      g.rect(x, y, 1, 1).stroke({ width: 2 / cam.zoom, color: 0xf2b84b });
    }
    this.drawLineage(s, alpha);
    this.drawFavorites(s, alpha);
    this.drawProbes();
  }

  // -------------------------------------------------------------------------------------------
  // Favorite families (P4.1; SPEC §12.6, UX §5.8): each highlighted member of a followed family gets its
  // slot's outline shape (circle, triangle or square: shape, never colour alone) with the dark companion
  // stroke drawLineage uses; the representative gets a second, larger outline. Only from the snapshot's
  // marks, at most FAVORITE_GLYPHS_MAX per slot (the worker already caps highlighting at 200). Static.

  private favorites: FavoriteMarks | null = null;
  private favoritesG: Graphics | null = null;

  private favoriteShape(g: Graphics, pattern: string, x: number, y: number, r: number): void {
    if (pattern === 'triangle') g.poly([x, y - r * 1.1, x + r * 0.95, y + r * 0.62, x - r * 0.95, y + r * 0.62]);
    else if (pattern === 'square') g.rect(x - r * 0.82, y - r * 0.82, r * 1.64, r * 1.64);
    else g.circle(x, y, r);
  }

  private drawFavorites(s: SnapshotMsg, alpha: number): void {
    const fav = this.favorites;
    if (!this.favoritesG) {
      if (!fav) return;
      this.favoritesG = new Graphics();
      this.world.addChild(this.favoritesG);
    }
    const g = this.favoritesG;
    g.clear();
    if (!fav || fav.slots.length === 0) return;
    const cam = this.camera;
    const lw = 1.2 / cam.zoom;
    const r = Math.max(1.5, 8 / cam.zoom);
    const halfW = cam.viewW / (2 * cam.zoom) + 2;
    const halfH = cam.viewH / (2 * cam.zoom) + 2;
    const drawn = fav.slots.map(() => 0);
    for (let k = 0; k < s.count; k++) {
      const m = fav.marks[k] ?? 0;
      if (!m) continue;
      const x = this.prevX[k]! + (this.curX[k]! - this.prevX[k]!) * alpha;
      const y = this.prevY[k]! + (this.curY[k]! - this.prevY[k]!) * alpha;
      if (Math.abs(x - cam.cx) > halfW || Math.abs(y - cam.cy) > halfH) continue;
      for (let j = 0; j < fav.slots.length; j++) {
        const member = (m & (1 << j)) !== 0;
        const rep = (m & (1 << (3 + j))) !== 0;
        if ((!member && !rep) || drawn[j]! >= FAVORITE_GLYPHS_MAX) continue;
        drawn[j]!++;
        const pattern = fav.slots[j]!.pattern;
        // Slots share a body without hiding each other: each sits a little further out.
        const rr = r + j * 2.2 * lw;
        for (const size of rep ? [rr, rr + 3 * lw] : [rr]) {
          this.favoriteShape(g, pattern, x, y, size);
          g.stroke({ width: lw * 2.4, color: 0x172c35, alpha: 0.9 });
          this.favoriteShape(g, pattern, x, y, size);
          g.stroke({ width: lw, color: 0xf5f4ef, alpha: 1 });
        }
      }
    }
  }

  /**
   * Adhesion links (SPEC §9 E12 "thin pixel connections"): a one-sprite-pixel line between the two
   * members' snapshot positions, dark-edged so it reads on every substrate. Only links the snapshot
   * reports; none at wide zoom (no bodies there either). Static (no pulse to replace in reduced motion).
   */
  private drawLinks(s: SnapshotMsg, draw: boolean, scale: number): void {
    const g = this.linksG;
    const L = s.links;
    const has = draw && L !== undefined && L.length >= LINK_STRIDE;
    if (!has) {
      if (this.linksDrawn) g.clear();
      this.linksDrawn = false;
      return;
    }
    g.clear();
    for (let i = 0; i + LINK_STRIDE <= L.length; i += LINK_STRIDE) g.moveTo(L[i]!, L[i + 1]!).lineTo(L[i + 2]!, L[i + 3]!);
    g.stroke({ width: scale * 2.2, color: 0x2c3f49, alpha: 0.9 });
    for (let i = 0; i + LINK_STRIDE <= L.length; i += LINK_STRIDE) g.moveTo(L[i]!, L[i + 1]!).lineTo(L[i + 2]!, L[i + 3]!);
    g.stroke({ width: scale, color: 0xe8e1c9, alpha: 1 });
    this.linksDrawn = true;
  }

  /** Organisms near a screen point, nearest first (then lower birthId). */
  pick(sx: number, sy: number, radiusCells = 0.9): { candidates: PickCandidate[]; cell: number } {
    const [wx, wy] = this.camera.screenToWorld(sx, sy);
    const cell = Math.floor(wy) * GRID_W + Math.floor(wx);
    const out: PickCandidate[] = [];
    const s = this.cur;
    if (!s) return { candidates: out, cell };
    const r = Math.max(radiusCells, 24 / this.camera.zoom / 2); // ≥ 24 px touch radius
    for (let k = 0; k < s.count; k++) {
      const o = k * ENT_STRIDE;
      const d = Math.hypot(s.ents[o + E_X]! - wx, s.ents[o + E_Y]! - wy);
      if (d <= r) out.push({ birthId: s.ids[k * ID_STRIDE]!, entityId: s.ids[k * ID_STRIDE + 1]!, species: s.ents[o + E_SPECIES]!, distance: d });
    }
    out.sort((a, b) => a.distance - b.distance || a.birthId - b.birthId);
    return { candidates: out, cell };
  }

  // -------------------------------------------------------------------------------------------
  // Lineage view (P2.3): trait-band tints, rings on living members of the followed branch, and a
  // follow that moves to another living member when the followed one is gone. Cosmetic only: every
  // mark comes from the snapshot's recorded genome values and branch ids.

  private lineage: LineageMarks | null = null;
  private lineageG: Graphics | null = null;
  private lineageFollow = false;

  /** Band rings beneath the bodies (trait overlay), their pool and the last colour set on each. */
  private bandParticles: ParticleContainer | null = null;
  private bandPool: Particle[] = [];
  private bandTint: number[] = [];

  /** Band colour for snapshot entry k while a trait overlay is on (undefined = overlay off). */
  private traitColor(k: number): number | undefined {
    const l = this.lineage;
    if (!l || l.locus === null) return undefined;
    const band = (l.marks[k] ?? 7) & 7;
    return band < TRAIT_BAND_COLORS.length ? TRAIT_BAND_COLORS[band] : TRAIT_INACTIVE_COLOR;
  }

  /** The white band ring texture and its container, inserted just beneath the organism bodies. */
  private buildBandRings(): void {
    const canvas = document.createElement('canvas');
    canvas.width = TRAIT_RING_PX;
    canvas.height = TRAIT_RING_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(TRAIT_RING_PX, TRAIT_RING_PX);
    const c = TRAIT_RING_PX / 2;
    for (let y = 0; y < TRAIT_RING_PX; y++) {
      for (let x = 0; x < TRAIT_RING_PX; x++) {
        const dist = Math.hypot(x + 0.5 - c, y + 0.5 - c);
        const o = (y * TRAIT_RING_PX + x) * 4;
        // Dark outline, white band (takes the tint exactly), dark outline.
        const rgb = dist >= 6.5 && dist < 7.5 ? [0x17, 0x2c, 0x35] : dist >= 7.5 && dist < 9 ? [255, 255, 255] : dist >= 9 && dist < 10 ? [0x17, 0x2c, 0x35] : null;
        if (!rgb) continue;
        img.data[o] = rgb[0]!;
        img.data[o + 1] = rgb[1]!;
        img.data[o + 2] = rgb[2]!;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    this.bandParticles = new ParticleContainer({
      dynamicProperties: { position: true, uvs: false, color: true, vertex: true, rotation: false },
      texture: tex,
      roundPixels: false,
    });
    this.bandParticles.visible = false;
    this.world.addChildAt(this.bandParticles, this.world.getChildIndex(this.particles));
  }

  private bandRing(i: number, x: number, y: number, scale: number, color: number, alpha: number): Particle {
    let bp = this.bandPool[i];
    if (!bp) {
      bp = new Particle({ texture: this.bandParticles!.texture, anchorX: 0.5, anchorY: 0.5 });
      this.bandPool[i] = bp;
      this.bandTint[i] = -1;
    }
    bp.x = x;
    bp.y = y;
    bp.scaleX = scale;
    bp.scaleY = scale;
    if (bp.alpha !== alpha) bp.alpha = alpha;
    if (this.bandTint[i] !== color) {
      bp.tint = color;
      this.bandTint[i] = color;
    }
    return bp;
  }

  /** Wide zoom with a trait overlay: each cell shows its most common band (ties → lower band). */
  private paintTraitAggregation(s: SnapshotMsg): boolean {
    const l = this.lineage;
    if (!l || l.locus === null) return false;
    this.aggDirty = false;
    const nB = TRAIT_BAND_AGG.length;
    const dominant = this.aggDominant.fill(-1);
    const density = this.aggDensity.fill(0);
    if (this.aggPerCell.length < CELL_COUNT * nB) this.aggPerCell = new Uint16Array(CELL_COUNT * nB);
    const perCell = this.aggPerCell.fill(0);
    for (let k = 0; k < s.count; k++) {
      const band = (l.marks[k] ?? 7) & 7;
      if (band >= nB) continue;
      const o = k * ENT_STRIDE;
      const cell = Math.floor(s.ents[o + E_Y]!) * GRID_W + Math.floor(s.ents[o + E_X]!);
      if (cell < 0 || cell >= CELL_COUNT) continue;
      const v = ++perCell[cell * nB + band]!;
      density[cell]!++;
      const d = dominant[cell]!;
      if (d < 0 || v > perCell[cell * nB + d]! || (v === perCell[cell * nB + d]! && band < d)) dominant[cell] = band;
    }
    const ctx = this.aggCanvas.getContext('2d')!;
    const img = (this.aggImg ??= ctx.createImageData(GRID_W, GRID_W));
    paintAggregation(img, dominant, density, TRAIT_BAND_AGG);
    ctx.putImageData(img, 0, 0);
    this.aggTex.source.update();
    return true;
  }

  /** Follow a branch: keep the camera on `entityId`, moving to another living member if it goes. */
  followLineage(entityId: number | null): void {
    this.lineageFollow = entityId !== null;
    this.camera.followEntityId = entityId;
  }

  get followingLineage(): boolean {
    return this.lineageFollow;
  }

  /** Repaint the wide-zoom layer on the next frame (e.g. the trait overlay was switched off). */
  refreshAggregation(): void {
    this.aggDirty = true;
  }

  private drawLineage(s: SnapshotMsg, alpha: number): void {
    const l = this.lineage;
    const cam = this.camera;
    if (!this.lineageG) {
      if (!l || l.branch === null) return;
      this.lineageG = new Graphics();
      this.world.addChild(this.lineageG);
    }
    const g = this.lineageG;
    g.clear();
    // Touch or pan cancels following (UX §4.2); then only the rings remain.
    if (this.lineageFollow && cam.followEntityId === null) this.lineageFollow = false;
    if (!l || l.branch === null) return;
    let nearest = -1;
    let nearestD = Infinity;
    let rings = 0;
    const lw = 1.2 / cam.zoom;
    const halfW = cam.viewW / (2 * cam.zoom) + 1;
    const halfH = cam.viewH / (2 * cam.zoom) + 1;
    // Outside the trait band rings when both show.
    const bandR = l.locus !== null ? ((this.maxFrameSize + TRAIT_RING_EXTRA) / 2) * (cam.spritePixelScale() / cam.zoom) + 3 / cam.zoom : 0;
    const r = Math.max(1.1, 6 / cam.zoom, bandR);
    for (let k = 0; k < s.count; k++) {
      if (!((l.marks[k] ?? 0) & 8)) continue;
      const x = this.prevX[k]! + (this.curX[k]! - this.prevX[k]!) * alpha;
      const y = this.prevY[k]! + (this.curY[k]! - this.prevY[k]!) * alpha;
      const d = Math.hypot(x - cam.cx, y - cam.cy);
      if (d < nearestD) {
        nearestD = d;
        nearest = k;
      }
      if (rings >= LINEAGE_RINGS_MAX || Math.abs(x - cam.cx) > halfW || Math.abs(y - cam.cy) > halfH) continue;
      rings++;
      g.circle(x, y, r).stroke({ width: lw * 2.2, color: 0x172c35, alpha: 0.85 });
      g.circle(x, y, r).stroke({ width: lw, color: 0xf5f4ef, alpha: 1 });
    }
    if (this.lineageFollow && cam.followEntityId !== null && !this.curIndex.has(cam.followEntityId)) {
      cam.followEntityId = nearest >= 0 ? s.ids[nearest * ID_STRIDE + 1]! : null;
      if (cam.followEntityId === null) this.lineageFollow = false;
    }
  }

  /** Current interpolated position of an entity (for follow / find). */
  positionOf(entityId: number): [number, number] | null {
    const k = this.curIndex.get(entityId);
    return k === undefined ? null : [this.curX[k]!, this.curY[k]!];
  }

  // -------------------------------------------------------------------------------------------
  // Region probes (P4.8; SPEC §12.8): each mask's outline as a light dashed stroke over the dark
  // companion stroke drawLineage uses, and its letter (shape + letter, never colour alone), from the
  // masks the UI passes in, never from the world. Static: nothing moves or blinks, so reduced motion
  // needs no change. The region being dragged is drawn the same way in amber.

  private probes: readonly ProbeMask[] = [];
  private probeDraft: ProbeMask | null = null;
  private probesG: Graphics | null = null;

  /** The regions to outline (and the one being dragged, or null). Cosmetic only. */
  setProbes(masks: readonly ProbeMask[], draft: ProbeMask | null = null): void {
    this.probes = masks;
    this.probeDraft = draft;
    if (!this.destroyed) this.drawProbes();
  }

  /** 3 × 5 pixel letters A–F (rows top to bottom, bit 2 = left column). */
  private static readonly PROBE_GLYPHS: Readonly<Record<string, readonly number[]>> = {
    A: [2, 5, 7, 5, 5],
    B: [6, 5, 6, 5, 6],
    C: [3, 4, 4, 4, 3],
    D: [6, 5, 5, 5, 6],
    E: [7, 4, 6, 4, 7],
    F: [7, 4, 6, 4, 4],
  };

  private drawProbes(): void {
    if (!this.probesG) {
      if (this.probes.length === 0 && !this.probeDraft) return;
      this.probesG = new Graphics();
      this.world.addChild(this.probesG);
    }
    const g = this.probesG;
    g.clear();
    const z = this.camera.zoom;
    const list = this.probeDraft ? [...this.probes, this.probeDraft] : this.probes;
    for (const m of list) {
      const path = probeOutline(m);
      const draft = m === this.probeDraft;
      // Companion stroke (solid, dark) under a dashed light stroke: readable on any dish colour.
      g.poly(path, true).stroke({ width: 4 / z, color: 0x172c35, alpha: 0.85 });
      dashed(g, path, 6 / z, 4 / z);
      g.stroke({ width: 2 / z, color: draft ? 0xf2b84b : 0xf5f4ef, alpha: 1 });
      // The letter on a dark tile at the mask's top-left (rectangle) or top (circle).
      const glyph = DishRenderer.PROBE_GLYPHS[m.id];
      if (!glyph) continue;
      const px = 3 / z;
      const [lx, ly] = m.shape === 'rect' ? [Math.min(m.x0, m.x1), Math.min(m.y0, m.y1)] : [m.cx + 0.5 - 2.5 * px, m.cy + 0.5 - m.r - 0.5 - 7 * px];
      g.rect(lx, ly, 5 * px, 7 * px).fill({ color: 0x172c35, alpha: 0.9 });
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) if (glyph[row]! & (4 >> col)) g.rect(lx + (1 + col) * px, ly + (1 + row) * px, px, px);
      }
      g.fill({ color: draft ? 0xf2b84b : 0xf5f4ef, alpha: 1 });
    }
  }

  // -------------------------------------------------------------------------------------------
  // Lab brush preview (UX §4.2; P2.7): drawn above everything, cosmetic only.

  private brushG: Graphics | null = null;
  /** Follows the host element's size (see create()). */
  private hostObserver: ResizeObserver | null = null;

  /**
   * Show a brush footprint before release: covered cells the edit applies to are tinted; cells it
   * would refuse (a structure, a live organism, past the rim) are tinted red and crossed. Uses the same
   * rule as the simulation (brushCellOutcome) over the latest geometry and snapshot (its organisms and,
   * P3.6, its food objects), so it never promises what the command refuses; the command's own counts stay authoritative. 'life' marks
   * the cells the inoculate command can use for that species (lifeCellOutcome: structure and
   * habitat, exactly canOccupy) and crosses out the rest. Returns the counts shown to the player;
   * null clears the preview.
   */
  setBrushPreview(
    p:
      | { readonly cells: readonly number[]; readonly rule: LabBrushRule; readonly substrate?: SubstrateName }
      | { readonly cells: readonly number[]; readonly rule: 'life'; readonly life: LifeBrush }
      | { readonly cells: readonly number[]; readonly rule: 'device'; readonly structure: DeviceKind }
      | { readonly cells: readonly number[]; readonly rule: 'move'; readonly structure: DeviceKind; readonly from: number }
      | { readonly cells: readonly number[]; readonly rule: 'wet' }
      | null,
  ): { ok: number; refused: number } {
    if (this.destroyed) return { ok: 0, refused: 0 };
    if (!this.brushG) {
      this.brushG = new Graphics();
      this.world.addChild(this.brushG);
    }
    const g = this.brushG;
    g.clear();
    if (!p) return { ok: 0, refused: 0 };
    // Phase 5 (wave 11): every rule goes through structurePreviewModel.ts, which calls the commands' own
    // functions (brushCellOutcome, labCellConflict, lifeCellOutcome with extras, devicePlacementOutcome,
    // wetCellOutcome). A geometry without edges or devices gives exactly the protocol 2 outcomes.
    const m = this.previewModelNow();
    const okCells: number[] = [];
    const refused: number[] = [];
    if (p.rule === 'device') {
      for (const r of devicePreview(m, p.cells)) (r.outcome === 'ok' ? okCells : refused).push(r.cell);
    } else if (p.rule === 'move') {
      for (const cell of p.cells) (deviceMovePreview(m, p.from, cell, p.structure) === 'ok' ? okCells : refused).push(cell);
    } else if (p.rule === 'wet') {
      // Water is a no-op (always moisture 1): neither tinted nor crossed, as an erase on an empty cell.
      for (const r of wetPreview(m, p.cells)) if (r.outcome === 'ok') okCells.push(r.cell);
      else if (r.outcome === 'refused') refused.push(r.cell);
    } else {
      const paint = p.rule === 'substrate' && 'substrate' in p && p.substrate !== undefined ? SUBSTRATE_CODES[p.substrate] : null;
      for (const cell of p.cells) {
        const o = p.rule === 'life' ? lifeCellPreview(m, p.life, cell) : labCellPreview(m, p.rule, cell, paint);
        if (o === 'ok') okCells.push(cell);
        else if (o !== 'noop') refused.push(cell);
      }
    }
    this.paintCells(g, okCells, refused);
    return { ok: okCells.length, refused: refused.length };
  }

  /** Accepted cells tinted amber; refused cells tinted red and crossed (the Lab brush preview's look). */
  private paintCells(g: Graphics, okCells: readonly number[], refused: readonly number[]): void {
    for (const cell of okCells) g.rect(cell % GRID_W, Math.floor(cell / GRID_W), 1, 1);
    if (okCells.length > 0) g.fill({ color: 0xf2b84b, alpha: 0.45 });
    if (refused.length > 0) {
      for (const cell of refused) g.rect(cell % GRID_W, Math.floor(cell / GRID_W), 1, 1);
      g.fill({ color: 0xb3473f, alpha: 0.35 });
      for (const cell of refused) {
        const x = cell % GRID_W;
        const y = Math.floor(cell / GRID_W);
        g.moveTo(x + 0.2, y + 0.2).lineTo(x + 0.8, y + 0.8).moveTo(x + 0.8, y + 0.2).lineTo(x + 0.2, y + 0.8);
      }
      g.stroke({ width: 0.16, color: 0x172c35, alpha: 0.9 });
    }
  }

  /** The preview model for the latest geometry and snapshot (rebuilt only when either changed). */
  private previewCache: StructurePreviewModel | null = null;
  private previewModelNow(): StructurePreviewModel {
    return (this.previewCache ??= previewModel(this.geometry, this.cur));
  }

  private edgePreviewG: Graphics | null = null;

  /**
   * Phase 5 (D-0106 "a refusal preview before commit"): preview a placeEdges stroke. Each distinct edge, in
   * edgeKey order with the running cap, goes through the command's own edgePlacementOutcome
   * (structurePreviewModel.ts edgeStrokePreview): accepted edges are tinted along the edge, refused ones red
   * with a cross at the midpoint. Returns the counts and the refusals by reason ('rim', 'structure',
   * 'barrier', 'channel', 'cap'); null clears it. Cosmetic only; the command's result stays authoritative.
   */
  setEdgePreview(
    p: { readonly edges: ReadonlyArray<readonly [number, 'R' | 'D']>; readonly structure: EdgeKind } | null,
  ): { ok: number; refused: number; reasons: Readonly<Partial<Record<string, number>>> } {
    if (this.destroyed) return { ok: 0, refused: 0, reasons: {} };
    const g = (this.edgePreviewG ??= this.world.addChild(new Graphics()));
    g.clear();
    if (!p) return { ok: 0, refused: 0, reasons: {} };
    const r = edgeStrokePreview(this.previewModelNow(), p.structure, p.edges);
    const z = Math.max(1e-6, this.camera.zoom);
    const w = Math.max(0.3, 3 / z);
    for (const it of r.items) {
      if (it.outcome !== 'ok') continue;
      const [x1, y1, x2, y2] = edgeSegment(it.cell, it.dir);
      g.moveTo(x1, y1).lineTo(x2, y2);
    }
    if (r.ok > 0) g.stroke({ width: w, color: 0xf2b84b, alpha: 0.85 });
    for (const it of r.items) {
      if (it.outcome === 'ok') continue;
      const [x1, y1, x2, y2] = edgeSegment(it.cell, it.dir);
      g.moveTo(x1, y1).lineTo(x2, y2);
    }
    if (r.refused > 0) g.stroke({ width: w, color: 0xb3473f, alpha: 0.85 });
    const c = Math.max(0.18, 4 / z);
    for (const it of r.items) {
      if (it.outcome === 'ok') continue;
      const [x1, y1, x2, y2] = edgeSegment(it.cell, it.dir);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      g.moveTo(mx - c, my - c).lineTo(mx + c, my + c).moveTo(mx + c, my - c).lineTo(mx - c, my + c);
    }
    if (r.refused > 0) g.stroke({ width: Math.max(0.08, 1.5 / z), color: 0x172c35, alpha: 0.9 });
    return { ok: r.ok, refused: r.refused, reasons: r.reasons };
  }

  private removePreviewG: Graphics | null = null;

  /**
   * Phase 5: outline the edges and devices a removeStructures command would take (ids from the latest
   * geometry; an id naming nothing is not drawn). Returns how many of each it found; null clears it.
   */
  setRemovePreview(p: { readonly ids: readonly number[] } | null): { edges: number; devices: number; missing: number } {
    if (this.destroyed) return { edges: 0, devices: 0, missing: 0 };
    const g = (this.removePreviewG ??= this.world.addChild(new Graphics()));
    g.clear();
    if (!p) return { edges: 0, devices: 0, missing: 0 };
    const r = removePreview(this.previewModelNow(), p.ids);
    const z = Math.max(1e-6, this.camera.zoom);
    for (const e of r.edges) {
      const [x1, y1, x2, y2] = edgeSegment(e.cell, e.dir);
      g.moveTo(x1, y1).lineTo(x2, y2);
    }
    for (const d of r.devices) g.rect(d.cell % GRID_W, Math.floor(d.cell / GRID_W), 1, 1);
    if (r.edges.length + r.devices.length > 0) {
      g.stroke({ width: Math.max(0.2, 4 / z), color: 0x172c35, alpha: 0.9 });
      for (const e of r.edges) {
        const [x1, y1, x2, y2] = edgeSegment(e.cell, e.dir);
        g.moveTo(x1, y1).lineTo(x2, y2);
      }
      for (const d of r.devices) g.rect(d.cell % GRID_W, Math.floor(d.cell / GRID_W), 1, 1);
      g.stroke({ width: Math.max(0.1, 2 / z), color: 0xb3473f, alpha: 1 });
    }
    return { edges: r.edges.length, devices: r.devices.length, missing: r.missing };
  }

  // Gate preview tracer (P5.2; src/render/gateTracer.ts): cosmetic, paused only.
  private gateSel: { readonly cell: number; readonly dir: 'R' | 'D' } | null = null;
  private gateStart = 0;
  private gateG: Graphics | null = null;

  /**
   * Phase 5 (SPEC §4.9 last line, D-0119): show the gate preview tracer for the edge (cell, dir), or clear it
   * with null. It reads only that edge's current code from the latest geometry, moves nothing, sends no
   * command and draws no simulation randomness; it draws nothing while the current snapshot's speed is not
   * 0 (the UI also clears it on Run). Reduced motion: a static frame (every token at its end position).
   */
  setGatePreview(sel: { readonly cell: number; readonly dir: 'R' | 'D' } | null): void {
    this.gateSel = sel;
    this.gateStart = performance.now();
    if (sel === null && this.gateG) this.gateG.clear();
  }

  private drawGateTracer(s: SnapshotMsg, now: number): void {
    const sel = this.gateSel;
    const e = this.geometry?.edges;
    const code = sel && e ? (sel.dir === 'R' ? e.r : e.d)[sel.cell] ?? 0 : 0;
    const tokens = tracerDrawList(sel, s.speed, code, now - this.gateStart, this.opts.reducedMotion);
    if (tokens === null) {
      if (this.gateG && this.gateDrawn) {
        this.gateG.clear();
        this.gateDrawn = false;
      }
      return;
    }
    const g = (this.gateG ??= this.world.addChild(new Graphics()));
    g.clear();
    this.gateDrawn = true;
    const z = Math.max(1e-6, this.camera.zoom);
    const r = Math.max(0.05, 2.5 / z);
    for (const t of tokens) {
      const [x, y] = tracerPoint(t, sel!.cell, sel!.dir);
      const color = TRACER_COLORS[t.cls] ?? 0xf5f4ef;
      // Field classes leave a trail whose density is the edge's factor (dots behind the token).
      const dots = Math.round(4 * t.trail);
      for (let k = 1; k <= dots; k++) {
        // A token moves toward −side; its trail lies behind it, toward +side.
        const back = tracerPoint({ along: t.along, across: t.across + t.side * 0.09 * k }, sel!.cell, sel!.dir);
        g.circle(back[0], back[1], r * 0.45).fill({ color, alpha: 0.5 });
      }
      g.circle(x, y, r).fill({ color, alpha: 1 }).stroke({ width: r * 0.4, color: 0x172c35, alpha: 0.9 });
    }
  }
  private gateDrawn = false;

  destroy(): void {
    this.hostObserver?.disconnect();
    this.destroyed = true;
    this.app.destroy(true, { children: true, texture: true });
  }
}

/** A key for a snapshot's resin saturations (device tiles are retiled only when it changes). */
function resinKey(resins: SnapshotMsg['resins']): string {
  if (!resins || resins.length === 0) return '';
  let k = '';
  for (const r of resins) k += `${r.id}:${r.saturation};`;
  return k;
}

/** Gate tracer token colours by transport class (neutral and distinct; the class is also its lane along the edge). */
const TRACER_COLORS: Readonly<Record<string, number>> = {
  dissolved: 0xf3c95c,
  activity: 0xbe8ce6,
  viral: 0x3e7bc4,
  small: 0xef7b6c,
  medium: 0x8cba4b,
  large: 0xd99ba6,
  fixed: 0x6e7b84,
};

/** A region's outline in world units: cells are [x, x+1); integer cell indices are the mask's centres. */
export function probeOutline(m: ProbeMask): number[] {
  if (m.shape === 'rect') {
    const x0 = Math.min(m.x0, m.x1);
    const y0 = Math.min(m.y0, m.y1);
    const x1 = Math.max(m.x0, m.x1) + 1;
    const y1 = Math.max(m.y0, m.y1) + 1;
    return [x0, y0, x1, y0, x1, y1, x0, y1];
  }
  const cx = m.cx + 0.5;
  const cy = m.cy + 0.5;
  const r = m.r + 0.5;
  const out: number[] = [];
  const n = 72;
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    out.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return out;
}

/** Add a closed polyline as dashes (dash and gap in world units) to `g`'s current path. */
function dashed(g: Graphics, pts: readonly number[], dash: number, gap: number): void {
  const n = pts.length / 2;
  let on = true;
  let left = dash;
  for (let k = 0; k < n; k++) {
    let x = pts[2 * k]!;
    let y = pts[2 * k + 1]!;
    const x2 = pts[(2 * ((k + 1) % n))]!;
    const y2 = pts[(2 * ((k + 1) % n)) + 1]!;
    let len = Math.hypot(x2 - x, y2 - y);
    while (len > 0) {
      const step = Math.min(left, len);
      const nx = x + ((x2 - x) * step) / len;
      const ny = y + ((y2 - y) * step) / len;
      if (on) g.moveTo(x, y).lineTo(nx, ny);
      x = nx;
      y = ny;
      len -= step;
      left -= step;
      if (left <= 1e-9) {
        on = !on;
        left = on ? dash : gap;
      }
    }
  }
}
