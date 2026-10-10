/**
 * The dish renderer (ARCH §9, UX §6–§7). Draws snapshots; never touches simulation state.
 *
 * Layers (bottom → top, UX §7.3): dish substrates · film tiles · deposits · food objects and stains ·
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
  CUE_STRESSED,
  DEPOSIT_FILM_BAND,
  E_CUE,
  E_CUE2,
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
  stainAlpha,
  tileFrameKey,
  type AtlasTileLike,
  type DrawKind,
  type FungalPick,
} from './world3';
import { Camera, ZOOM_CLOSE, ZOOM_NEIGHBORHOOD } from './camera';
import { DISH_PX_PER_CELL, DISH_TEX, paintAggregation, paintDeposits, paintDish, paintOverlay, repaintDepositCells, type DirtyRect } from './layers';
import { speciesRgb } from './speciesColors';
import { featureFrameKeys, featureLayers, featureMarkScale, type AtlasFeatureLike, type FeatureLayerId, type LayerPick } from './features';
import { brushCellOutcome, lifeCellOutcome, ST_NONE, ST_STONE, SUB_WATER, type LabBrushRule, type LifeBrush } from '@sim/grid';
import type { LineageMarks } from '@worker/protocol';

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
}

const HEADING_CHARS = 'eswn';

/** Heading row as frameKey resolved it: 'eswn'[h] for 4-heading sprites, else (or if unknown) 'e'. */
function headingRow(headings: number, h: number): number {
  return headings === 4 && (h === 1 || h === 2 || h === 3) ? h : 0;
}

interface Effect {
  g: Graphics;
  start: number;
  duration: number;
  kind: 'ring' | 'split' | 'deposit';
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
    this.objectParticles = tileContainer();
    this.statusParticles = tileContainer();
    this.drawRim();
    this.world.addChild(
      this.dishSprite,
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
    this.camera.fit();
    this.app.renderer.on('resize', (w: number, h: number) => {
      const wasFit = Math.abs(this.camera.zoom - this.camera.fitZoom()) < 1e-6;
      this.camera.setViewport(w, h);
      if (wasFit) this.camera.fit();
    });
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
              }
            : null,
        headings: meta.headings,
        size: meta.size,
        stress: anim(asset, 'stress', meta.headings),
        feed: anim(asset, 'feed', meta.headings),
        move: anim(asset, 'move', meta.headings),
        idle: anim(asset, 'idle', meta.headings),
        death: anim(asset, 'death', meta.headings),
      };
    });
  }

  setOptions(o: Partial<RendererOptions>): void {
    this.opts = { ...this.opts, ...o };
    this.overlaySprite.alpha = this.opts.overlayOpacity;
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
    this.brushSubstrate = s.geometry.substrate;
    const ctx = this.dishCanvas.getContext('2d')!;
    const img = ctx.createImageData(DISH_TEX, DISH_TEX);
    paintDish(img, s.geometry.substrate, s.geometry.structure, s.geometry.shade);
    ctx.putImageData(img, 0, 0);
    this.dishTex.source.update();
  }

  applySnapshot(s: SnapshotMsg, now = performance.now()): void {
    if (this.destroyed) return;
    if (s.geometry) this.applyGeometry(s);
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
      const ctx = this.overlayCanvas.getContext('2d')!;
      const img = (this.overlayImg ??= ctx.createImageData(GRID_W, GRID_W));
      paintOverlay(img, s.overlay.data, this.structure, s.overlay.id, s.overlay.max);
      ctx.putImageData(img, 0, 0);
      this.overlayTex.source.update();
      this.overlaySprite.visible = true;
    } else this.overlaySprite.visible = false;

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
    }
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
      const a = stainAlpha(now - st.start);
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
    // Deaths still leave a dissolve (a static frame in reduced motion); births flash only with motion.
    const prev = this.cur;
    let byBirth: Map<number, number> | null = null;
    for (const ev of events) {
      const cx = (ev.cell % GRID_W) + 0.5;
      const cy = Math.floor(ev.cell / GRID_W) + 0.5;
      if (ev.type === 'birth' && !this.opts.reducedMotion) this.spawnEffect('split', cx, cy, 0.9, 380, now);
      if (ev.type === 'objectEmptied') {
        // A fading stain where a food object ran out (cosmetic; it blocks nothing).
        const tex = this.frames[tileFrameKey('stain', 0)];
        if (tex && ev.cell >= 0 && this.stains.length < 128) {
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
        if (k === undefined) continue;
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

  /** UI hook: a placement ring where the player just added something. */
  placementRing(x: number, y: number, radius: number): void {
    if (this.opts.reducedMotion) return;
    this.spawnEffect('deposit', x, y, radius, 500, performance.now());
  }

  private spawnEffect(kind: Effect['kind'], x: number, y: number, radius: number, duration: number, now: number): void {
    if (this.fx.length > 64) return; // budget: cosmetic effects degrade first
    const g = new Graphics();
    this.effects.addChild(g);
    this.fx.push({ g, start: now, duration, kind, x, y, radius });
  }

  private frame(): void {
    if (this.destroyed) return;
    const now = performance.now();
    const cam = this.camera;
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
    if (wide && this.aggDirty) this.paintAggregation(s);
    this.drawObjects(s, now);

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
            const a = cue & CUE_STRESSED && d.stress ? d.stress : !dormant && cue & CUE_FEEDING && d.feed && !(flags & FLAG_MOVING) ? d.feed : (d.move ?? d.idle);
            if (!a) continue;
            const idx = reduced || dormant ? a.reducedMotionFrame : Math.floor((now + phase) / a.durationMs) % a.frames;
            hRow = headingRow(d.headings, ents[o + E_HEADING]!);
            tex = a.tex[hRow]![idx];
          }
          const p = this.pool[k]!;
          if (tex) p.texture = tex;
          p.x = px;
          p.y = py;
          p.scaleX = sc;
          p.scaleY = sc;
          // Newborns fade in over their first snapshot; feeders glow very slightly brighter.
          const born = cue & CUE_JUST_BORN ? 0.75 + 0.25 * alpha : 1;
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
          } else {
            // Module feature layers: only marks the snapshot says are real for this organism.
            const cell = Math.floor(curY[k]!) * GRID_W + Math.floor(curX[k]!);
            const filmBand = cue2 & CUE2_MOD_E10 && cell >= 0 && cell < CELL_COUNT ? filmLevelBand(filmLevel(s.deposits, cell)) : 0;
            const pulseOn = Math.floor((now + phase) / 400) % 2 === 0;
            const marks = featureLayers(cue, life, selected, this.picks, cue2, { filmBand, reduced, pulseOn });
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
      const total = reduced ? 600 : a ? a.frames * a.durationMs : DECAY_MS;
      if (t > total) continue;
      this.ghosts[live++] = gh;
      if (!draw) continue;
      if (a) {
        const idx = reduced ? a.reducedMotionFrame : Math.floor(t / a.durationMs);
        const tex = a.tex[gh.row]![Math.min(a.frames - 1, idx)];
        if (tex) gh.particle.texture = tex;
        gh.particle.scaleX = scale;
        gh.particle.scaleY = scale;
      } else gh.particle.alpha = reduced ? 1 : 1 - t / total;
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
      const t = (now - e.start) / e.duration;
      if (t >= 1) {
        e.g.destroy();
        return false;
      }
      e.g.clear();
      if (e.kind === 'split') {
        e.g.circle(e.x, e.y, e.radius * (0.4 + t)).stroke({ width: 1.5 / cam.zoom, color: 0xffffff, alpha: 0.7 * (1 - t) });
      } else if (e.kind === 'deposit') {
        e.g.circle(e.x, e.y, e.radius * (0.7 + 0.3 * t)).stroke({ width: 2 / cam.zoom, color: 0x256e9e, alpha: 0.6 * (1 - t) });
      } else {
        e.g.circle(e.x, e.y, e.radius).stroke({ width: 1 / cam.zoom, color: 0xffffff, alpha: 1 - t });
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
  // Lab brush preview (UX §4.2; P2.7): drawn above everything, cosmetic only.

  private brushG: Graphics | null = null;
  /** Substrate codes from the latest geometry (the Life brush preview's habitat rule). */
  private brushSubstrate: Uint8Array | null = null;
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
      | { readonly cells: readonly number[]; readonly rule: LabBrushRule }
      | { readonly cells: readonly number[]; readonly rule: 'life'; readonly life: LifeBrush }
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
    const occupied = new Uint8Array(CELL_COUNT);
    const s = this.cur;
    if (s && p.rule === 'place') {
      for (let k = 0; k < s.count; k++) {
        const cell = Math.floor(s.ents[k * ENT_STRIDE + E_Y]!) * GRID_W + Math.floor(s.ents[k * ENT_STRIDE + E_X]!);
        if (cell >= 0 && cell < CELL_COUNT) occupied[cell] = 1;
      }
    }
    // P3.6: cells holding a food object (snapshot objects) refuse a structure and a second object.
    let objectCells: Uint8Array | null = null;
    if (s && (p.rule === 'place' || p.rule === 'object') && s.objects && s.objects.length > 0) {
      objectCells = new Uint8Array(CELL_COUNT);
      for (const ob of s.objects) {
        const cell = Math.floor(ob.y) * GRID_W + Math.floor(ob.x);
        if (cell >= 0 && cell < CELL_COUNT) objectCells[cell] = 1;
      }
    }
    const refused: number[] = [];
    let ok = 0;
    for (const cell of p.cells) {
      const st = this.structure ? this.structure[cell]! : ST_NONE;
      const o =
        p.rule === 'life'
          ? lifeCellOutcome(st, this.brushSubstrate ? this.brushSubstrate[cell]! : SUB_WATER, p.life, this.stoneEdgeAt(cell))
          : brushCellOutcome(p.rule, st, occupied[cell] === 1, objectCells !== null && objectCells[cell] === 1);
      if (o === 'ok') {
        ok++;
        g.rect(cell % GRID_W, Math.floor(cell / GRID_W), 1, 1);
      } else if (o !== 'noop') refused.push(cell);
    }
    if (ok > 0) g.fill({ color: 0xf2b84b, alpha: 0.45 });
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
    return { ok, refused: refused.length };
  }

  /**
   * Whether an open cell is four-adjacent to stone in the latest geometry (grid.ts isStoneEdge, the
   * attachment surface 'stoneEdge'), for the Life brush preview of attached species.
   */
  private stoneEdgeAt(cell: number): boolean {
    const st = this.structure;
    if (!st || st[cell] !== ST_NONE) return false;
    const x = cell % GRID_W;
    return (
      (x + 1 < GRID_W && st[cell + 1] === ST_STONE) ||
      (x > 0 && st[cell - 1] === ST_STONE) ||
      (cell + GRID_W < CELL_COUNT && st[cell + GRID_W] === ST_STONE) ||
      (cell >= GRID_W && st[cell - GRID_W] === ST_STONE)
    );
  }

  destroy(): void {
    this.hostObserver?.disconnect();
    this.destroyed = true;
    this.app.destroy(true, { children: true, texture: true });
  }
}
