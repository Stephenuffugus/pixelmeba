/**
 * The dish renderer (ARCH §9, UX §6–§7). Draws snapshots; never touches simulation state.
 *
 * Layers (bottom → top): dish substrates · deposits · overlay · wide-zoom aggregation · organisms
 * (one ParticleContainer over the organism atlas) · effects · selection. Positions interpolate
 * between the last two snapshots by entityId (the retained daughter keeps its entityId across a
 * division). Animation state comes only from snapshot flags and events.
 */
import { Application, Container, Graphics, Particle, ParticleContainer, Rectangle, Sprite, Texture, TextureStyle } from 'pixi.js';
import { CELL_COUNT, GRID_W, MASK_CX, MASK_CY, MASK_R } from '@sim/constants';
import {
  CUE_FEEDING,
  CUE_JUST_BORN,
  CUE_STRESSED,
  E_CUE,
  E_FLAGS,
  E_HEADING,
  E_LIFE,
  E_SPECIES,
  E_X,
  E_Y,
  ENT_STRIDE,
  ID_STRIDE,
  type SnapshotMsg,
  type VisualEvent,
} from '@worker/protocol';
import { Camera, ZOOM_CLOSE, ZOOM_NEIGHBORHOOD } from './camera';
import { DISH_PX_PER_CELL, DISH_TEX, paintAggregation, paintDeposits, paintDish, paintOverlay, repaintDepositCells, type DirtyRect } from './layers';
import { speciesRgb } from './speciesColors';
import { buildLayerAtlas, featureLayers, layerKey, type LayerPick } from './features';
import { FEATURE_LAYERS, type FeatureLayerId } from '@art/src/layers/modules';

const FLAG_MOVING = 1 << 6;

export interface AtlasManifestLike {
  readonly width: number;
  readonly height: number;
  readonly sprites: Record<string, { speciesId: string; size: number; headings: number; animations: Record<string, { frames: number; durationMs: number; loop: boolean; reducedMotionFrame: number }> }>;
  readonly frames: ReadonlyArray<{ key: string; x: number; y: number; w: number; h: number }>;
}

interface Ghost {
  particle: Particle;
  death: AnimTex;
  /** Row into death.tex (0 for single-heading sprites). */
  row: number;
  start: number;
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
  /** Module feature layers above the bodies (UX §7.3 "feature rims"), from their own small atlas. */
  private featureParticles!: ParticleContainer;
  /** [layer][frame][heading] → texture. */
  private layerTex: Record<string, Texture[][]> = {};
  private featurePool: Particle[] = [];
  private readonly picks: LayerPick[] = [];
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
    this.buildFeatureLayers();
    this.drawRim();
    this.world.addChild(this.dishSprite, this.depositSprite, this.overlaySprite, this.aggSprite, this.rim, this.particles, this.featureParticles, this.effects, this.selectionG);
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

  /** Upload the module feature-layer frames (art/src/layers) as one nearest-neighbor texture. */
  private buildFeatureLayers(): void {
    const la = buildLayerAtlas();
    const canvas = document.createElement('canvas');
    canvas.width = la.width;
    canvas.height = la.height;
    canvas.getContext('2d')!.putImageData(new ImageData(la.rgba, la.width, la.height), 0, 0);
    const tex = Texture.from(canvas);
    tex.source.scaleMode = 'nearest';
    for (const def of FEATURE_LAYERS) {
      this.layerTex[def.id] = def.frames.map((_, fi) =>
        [0, 1, 2, 3].map((h) => {
          const r = la.rects[layerKey(def.id, fi, h)]!;
          return new Texture({ source: tex.source, frame: new Rectangle(r[0], r[1], r[2], r[3]) });
        }),
      );
    }
    this.featureParticles = new ParticleContainer({
      dynamicProperties: { position: true, uvs: true, color: true, vertex: true, rotation: false },
      texture: tex,
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
    this.draws = this.speciesAssets.map((asset) => {
      const meta = asset ? this.manifest.sprites[asset] : undefined;
      if (!meta) return null;
      return {
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
    this.handleEvents(s.events, now);
    this.cur = s;
    this.aggDirty = true;
  }

  private paintAggregation(s: SnapshotMsg): void {
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
        if (!d?.death) continue;
        const p = new Particle({ texture: Texture.EMPTY, x: prev.ents[o + E_X]!, y: prev.ents[o + E_Y]!, anchorX: 0.5, anchorY: 0.5 });
        this.ghosts.push({ particle: p, death: d.death, row: headingRow(d.headings, prev.ents[o + E_HEADING]!), start: now });
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
    this.particles.alpha = 1;
    if (!s) return;
    if (wide && this.aggDirty) this.paintAggregation(s);

    const alpha = Math.min(1, (now - this.curAt) / this.interval);
    const pxScale = cam.spritePixelScale();
    const scale = pxScale / cam.zoom;
    const reduced = this.opts.reducedMotion;
    // Pixi skips an invisible or fully transparent container; so do we (ghosts still expire).
    const draw = this.particles.visible && this.particles.alpha > 0;
    const list = this.particles.particleChildren;
    const flist = this.featureParticles.particleChildren;
    let n = 0;
    let nf = 0;
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
      // Rebuild the particle list: live organisms, then ghosts.
      for (let k = 0; k < needed; k++) {
        const o = k * ENT_STRIDE;
        const d = this.draws[ents[o + E_SPECIES]!];
        if (!d) continue;
        const x0 = prevX[k]!;
        const y0 = prevY[k]!;
        const x = x0 + (curX[k]! - x0) * alpha;
        const y = y0 + (curY[k]! - y0) * alpha;
        if (x < minX || x > maxX || y < minY || y > maxY) continue;
        const flags = ents[o + E_FLAGS]!;
        const cue = ents[o + E_CUE]!;
        // Preparing/Resting/Waking hold a still, folded pose (UX §7.2): no locomotion or feeding frames.
        const life = ents[o + E_LIFE]!;
        const dormant = life !== 0;
        const a = cue & CUE_STRESSED && d.stress ? d.stress : !dormant && cue & CUE_FEEDING && d.feed && !(flags & FLAG_MOVING) ? d.feed : (d.move ?? d.idle);
        if (!a) continue;
        const entityId = ids[k * ID_STRIDE + 1]!;
        const phase = (entityId * 97) % 1000;
        const idx = reduced || dormant ? a.reducedMotionFrame : Math.floor((now + phase) / a.durationMs) % a.frames;
        const hRow = headingRow(d.headings, ents[o + E_HEADING]!);
        const tex = a.tex[hRow]![idx];
        const p = this.pool[k]!;
        if (tex) p.texture = tex;
        p.x = x;
        p.y = y;
        p.scaleX = scale;
        p.scaleY = scale;
        // Newborns fade in over their first snapshot; feeders glow very slightly brighter.
        const born = cue & CUE_JUST_BORN ? 0.75 + 0.25 * alpha : 1;
        if (p.alpha !== born) p.alpha = born;
        const tint = dormant ? 0xc8c8c8 : cue & CUE_FEEDING ? 0xffffff : 0xf0f0f0;
        if (this.poolTint[k] !== tint) {
          p.tint = tint;
          this.poolTint[k] = tint;
        }
        list[n++] = p;
        // Module feature layers: only marks the snapshot says are real for this organism.
        const marks = featureLayers(cue, life, ids[k * ID_STRIDE] === this.selectedBirthId, this.picks);
        for (let m = 0; m < marks; m++) {
          const pick = this.picks[m]!;
          const lt = this.layerTexture(pick.layer, pick.frame, hRow);
          if (!lt) continue;
          let fp = this.featurePool[nf];
          if (!fp) {
            fp = new Particle({ texture: lt, anchorX: 0.5, anchorY: 0.5 });
            this.featurePool[nf] = fp;
          }
          fp.texture = lt;
          fp.x = x;
          fp.y = y;
          fp.scaleX = (scale * d.size) / 16;
          fp.scaleY = (scale * d.size) / 16;
          if (fp.alpha !== born) fp.alpha = born;
          flist[nf++] = fp;
        }
      }
    }
    // Death dissolves (3–4 frames), then removed.
    let live = 0;
    for (const gh of this.ghosts) {
      const a = gh.death;
      const t = now - gh.start;
      const total = reduced ? 600 : a.frames * a.durationMs;
      if (t > total) continue;
      this.ghosts[live++] = gh;
      if (!draw) continue;
      const idx = reduced ? a.reducedMotionFrame : Math.floor(t / a.durationMs);
      const tex = a.tex[gh.row]![Math.min(a.frames - 1, idx)];
      if (tex) gh.particle.texture = tex;
      gh.particle.scaleX = scale;
      gh.particle.scaleY = scale;
      list[n++] = gh.particle;
    }
    this.ghosts.length = live;
    if (draw) {
      list.length = n;
      this.particles.update();
      flist.length = nf;
      this.featureParticles.update();
    }

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

  /** Current interpolated position of an entity (for follow / find). */
  positionOf(entityId: number): [number, number] | null {
    const k = this.curIndex.get(entityId);
    return k === undefined ? null : [this.curX[k]!, this.curY[k]!];
  }

  destroy(): void {
    this.destroyed = true;
    this.app.destroy(true, { children: true, texture: true });
  }
}
