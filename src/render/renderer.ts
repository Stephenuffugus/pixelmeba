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
  E_SPECIES,
  E_X,
  E_Y,
  ENT_STRIDE,
  ID_STRIDE,
  type SnapshotMsg,
  type VisualEvent,
} from '@worker/protocol';
import { Camera, ZOOM_CLOSE, ZOOM_NEIGHBORHOOD } from './camera';
import { DISH_PX_PER_CELL, DISH_TEX, paintAggregation, paintDeposits, paintDish, paintOverlay } from './layers';
import { speciesRgb } from './speciesColors';

const FLAG_MOVING = 1 << 6;

export interface AtlasManifestLike {
  readonly width: number;
  readonly height: number;
  readonly sprites: Record<string, { speciesId: string; size: number; headings: number; animations: Record<string, { frames: number; durationMs: number; loop: boolean; reducedMotionFrame: number }> }>;
  readonly frames: ReadonlyArray<{ key: string; x: number; y: number; w: number; h: number }>;
}

interface Ghost {
  particle: Particle;
  asset: string;
  heading: number;
  start: number;
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
  private readonly effects = new Container();
  private readonly selectionG = new Graphics();
  private readonly rim = new Graphics();
  private frames: Record<string, Texture> = {};
  private manifest!: AtlasManifestLike;
  private speciesAssets: readonly string[] = [];
  private speciesIds: readonly string[] = [];
  private structure: Uint8Array | null = null;

  private cur: SnapshotMsg | null = null;
  private curAt = 0;
  private interval = 100;
  private prevPos: Record<number, [number, number]> = {};
  private curPos: Record<number, [number, number]> = {};
  private pool: Particle[] = [];
  private ghosts: Ghost[] = [];
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
    }
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
    this.drawRim();
    this.world.addChild(this.dishSprite, this.depositSprite, this.overlaySprite, this.aggSprite, this.rim, this.particles, this.effects, this.selectionG);
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

  setSpecies(ids: readonly string[], assets: readonly string[]): void {
    this.speciesIds = ids;
    this.speciesAssets = assets;
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
    // Deposits (every snapshot; cheap relative to rendering).
    {
      const ctx = this.depositCanvas.getContext('2d')!;
      const img = ctx.createImageData(DISH_TEX, DISH_TEX);
      paintDeposits(img, s.deposits);
      ctx.putImageData(img, 0, 0);
      this.depositTex.source.update();
      this.depositVersion++;
    }
    if (s.overlay) {
      const ctx = this.overlayCanvas.getContext('2d')!;
      const img = ctx.createImageData(GRID_W, GRID_W);
      paintOverlay(img, s.overlay.data, this.structure, s.overlay.id, s.overlay.max);
      ctx.putImageData(img, 0, 0);
      this.overlayTex.source.update();
      this.overlaySprite.visible = true;
    } else this.overlaySprite.visible = false;

    // Positions for interpolation, keyed by entityId.
    this.prevPos = this.curPos;
    this.curPos = {};
    for (let k = 0; k < s.count; k++) {
      const o = k * ENT_STRIDE;
      this.curPos[s.ids[k * ID_STRIDE + 1]!] = [s.ents[o + E_X]!, s.ents[o + E_Y]!];
    }
    if (this.cur) this.interval = Math.min(400, Math.max(40, now - this.curAt));
    this.curAt = now;
    this.handleEvents(s.events, now);
    this.cur = s;
    this.paintAggregation(s);
  }

  private paintAggregation(s: SnapshotMsg): void {
    const dominant = new Int16Array(CELL_COUNT).fill(-1);
    const density = new Uint16Array(CELL_COUNT);
    const perCell = new Uint16Array(CELL_COUNT * Math.max(1, this.speciesIds.length));
    const nSp = Math.max(1, this.speciesIds.length);
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
    const img = ctx.createImageData(GRID_W, GRID_W);
    paintAggregation(img, dominant, density, this.speciesIds.map((id) => speciesRgb(id)));
    ctx.putImageData(img, 0, 0);
    this.aggTex.source.update();
  }

  private handleEvents(events: readonly VisualEvent[], now: number): void {
    if (!this.cur || this.opts.reducedMotion) {
      // Deaths still leave a static dissolve frame even in reduced motion (handled via ghosts).
    }
    const prev = this.cur;
    for (const ev of events) {
      const cx = (ev.cell % GRID_W) + 0.5;
      const cy = Math.floor(ev.cell / GRID_W) + 0.5;
      if (ev.type === 'birth' && !this.opts.reducedMotion) this.spawnEffect('split', cx, cy, 0.9, 380, now);
      if (ev.type === 'death' && prev) {
        // Find the organism's last position in the previous snapshot by birthId.
        for (let k = 0; k < prev.count; k++) {
          if (prev.ids[k * ID_STRIDE] !== ev.birthId) continue;
          const o = k * ENT_STRIDE;
          const asset = this.speciesAssets[prev.ents[o + E_SPECIES]!];
          if (!asset) break;
          const p = new Particle({ texture: Texture.EMPTY, x: prev.ents[o + E_X]!, y: prev.ents[o + E_Y]!, anchorX: 0.5, anchorY: 0.5 });
          this.ghosts.push({ particle: p, asset, heading: prev.ents[o + E_HEADING]!, start: now });
          this.particles.addParticle(p);
          break;
        }
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

  private frameKey(asset: string, anim: string, heading: number, index: number): string {
    return `${asset}/${anim}/${'eswn'[heading] ?? 'e'}/${index}`;
  }

  private pickAnim(asset: string, flags: number, cue: number): string {
    const anims = this.manifest.sprites[asset]?.animations ?? {};
    if (cue & CUE_STRESSED && anims.stress) return 'stress';
    if (cue & CUE_FEEDING && anims.feed && !(flags & FLAG_MOVING)) return 'feed';
    if (anims.move) return 'move';
    return 'idle';
  }

  private frame(): void {
    if (this.destroyed) return;
    const now = performance.now();
    const cam = this.camera;
    const s = this.cur;
    // Follow target, if any.
    if (s && cam.followEntityId !== null) {
      const p = this.curPos[cam.followEntityId];
      if (p) cam.follow(p[0], p[1]);
    }
    this.world.scale.set(cam.zoom);
    this.world.position.set(cam.viewW / 2 - cam.cx * cam.zoom, cam.viewH / 2 - cam.cy * cam.zoom);
    const wide = cam.zoom < 5;
    this.aggSprite.visible = wide;
    this.particles.visible = !wide || cam.zoom >= 3.5;
    this.particles.alpha = wide ? Math.max(0, (cam.zoom - 3.5) / 1.5) : 1;
    if (!s) return;

    const alpha = Math.min(1, (now - this.curAt) / this.interval);
    const pxScale = cam.spritePixelScale();
    const needed = s.count;
    while (this.pool.length < needed) {
      const p = new Particle({ texture: Texture.EMPTY, anchorX: 0.5, anchorY: 0.5 });
      this.pool.push(p);
    }
    // Rebuild the particle list: live organisms, then ghosts.
    const list = this.particles.particleChildren;
    list.length = 0;
    for (let k = 0; k < needed; k++) {
      const o = k * ENT_STRIDE;
      const entityId = s.ids[k * ID_STRIDE + 1]!;
      const sp = s.ents[o + E_SPECIES]!;
      const asset = this.speciesAssets[sp];
      if (!asset) continue;
      const meta = this.manifest.sprites[asset];
      if (!meta) continue;
      const cur = this.curPos[entityId]!;
      const prev = this.prevPos[entityId] ?? cur;
      const x = prev[0] + (cur[0] - prev[0]) * alpha;
      const y = prev[1] + (cur[1] - prev[1]) * alpha;
      const flags = s.ents[o + E_FLAGS]!;
      const cue = s.ents[o + E_CUE]!;
      const anim = this.pickAnim(asset, flags, cue);
      const a = meta.animations[anim]!;
      const heading = meta.headings === 4 ? s.ents[o + E_HEADING]! : 0;
      const phase = (entityId * 97) % 1000;
      const idx = this.opts.reducedMotion ? a.reducedMotionFrame : Math.floor((now + phase) / a.durationMs) % a.frames;
      const tex = this.frames[this.frameKey(asset, anim, heading, idx)];
      const p = this.pool[k]!;
      if (tex) p.texture = tex;
      p.x = x;
      p.y = y;
      const scale = pxScale / cam.zoom;
      p.scaleX = scale;
      p.scaleY = scale;
      // Newborns fade in over their first snapshot; feeders glow very slightly brighter.
      const born = cue & CUE_JUST_BORN ? 0.75 + 0.25 * alpha : 1;
      p.alpha = born;
      p.tint = cue & CUE_FEEDING ? 0xffffff : 0xf0f0f0;
      list.push(p);
    }
    // Death dissolves (3–4 frames), then removed.
    this.ghosts = this.ghosts.filter((gh) => {
      const meta = this.manifest.sprites[gh.asset];
      const a = meta?.animations.death;
      if (!meta || !a) return false;
      const t = now - gh.start;
      const idx = this.opts.reducedMotion ? a.reducedMotionFrame : Math.floor(t / a.durationMs);
      const total = this.opts.reducedMotion ? 600 : a.frames * a.durationMs;
      if (t > total) return false;
      const tex = this.frames[this.frameKey(gh.asset, 'death', meta.headings === 4 ? gh.heading : 0, Math.min(a.frames - 1, idx))];
      if (tex) gh.particle.texture = tex;
      const sc = pxScale / cam.zoom;
      gh.particle.scaleX = sc;
      gh.particle.scaleY = sc;
      list.push(gh.particle);
      return true;
    });
    this.particles.update();

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
        const entityId = s.ids[k * ID_STRIDE + 1]!;
        const cur = this.curPos[entityId]!;
        const prev = this.prevPos[entityId] ?? cur;
        const x = prev[0] + (cur[0] - prev[0]) * alpha;
        const y = prev[1] + (cur[1] - prev[1]) * alpha;
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
    return this.curPos[entityId] ?? null;
  }

  destroy(): void {
    this.destroyed = true;
    this.app.destroy(true, { children: true, texture: true });
  }
}
