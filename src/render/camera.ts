/**
 * Camera (ARCH §9). World unit = one cell. zoom = screen CSS pixels per cell.
 * Presets: whole dish (fit), neighborhood (8 px/cell), close (16 px/cell). Camera state is UI state
 * and never enters the simulation.
 */
export const ZOOM_NEIGHBORHOOD = 8;
export const ZOOM_CLOSE = 16;
export const ZOOM_MAX = 32;
export const DISH_CENTER = 64;
export const DISH_RADIUS_VIEW = 62; // cells, including the rim

/**
 * P4.13 camera easing (UX §3.2 first-minute feel; UX §7.4 "camera easing | instant" in reduced motion;
 * UX §7.1 "Camera never jumps on its own"). Player-initiated preset moves — the zoom buttons, the
 * whole-dish preset, Find / "go to", the inspector's reveal pan — ease over CAMERA_EASE_MS with an
 * ease-out cubic. Wheel, pinch and drag stay direct (they follow the hand), follow mode is unchanged, and
 * reduced motion makes every move instant. A new eased move replaces an unfinished one (it starts where
 * the view is and is computed from where the last move was going); touching the dish (or any direct move)
 * settles the view at once, so input always lands where the view is going. Camera state is UI state.
 */
export const CAMERA_EASE_MS = 220;

export interface CameraPose {
  readonly cx: number;
  readonly cy: number;
  readonly zoom: number;
}

/** Ease-out cubic on [0, 1] (0 and 1 exact). */
export function easeOutCubic(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  const v = 1 - u;
  return 1 - v * v * v;
}

/** The pose at fraction `t` of an eased move: centre linearly, zoom geometrically; t ≥ 1 is `to` exactly. */
export function easePose(from: CameraPose, to: CameraPose, t: number): CameraPose {
  if (t >= 1) return to;
  if (t <= 0) return from;
  const k = easeOutCubic(t);
  const zoom = from.zoom > 0 && to.zoom > 0 ? from.zoom * Math.pow(to.zoom / from.zoom, k) : from.zoom + (to.zoom - from.zoom) * k;
  return { cx: from.cx + (to.cx - from.cx) * k, cy: from.cy + (to.cy - from.cy) * k, zoom };
}

export class Camera {
  cx = DISH_CENTER;
  cy = DISH_CENTER;
  zoom = 4;
  viewW = 1;
  viewH = 1;
  /** Entity followed by birthId/entityId key, if any. */
  followEntityId: number | null = null;
  /** P4.13: the renderer's clock; while null (tests, before the renderer starts) every move is instant. */
  clock: (() => number) | null = null;
  /** P4.13: reduced motion makes every move instant (UX §7.4). */
  reducedMotion = false;
  private easing: { readonly from: CameraPose; readonly to: CameraPose; readonly start: number } | null = null;

  /** Whether an eased move is under way. */
  get moving(): boolean {
    return this.easing !== null;
  }

  /** Where the view is going (the current pose when nothing is easing). */
  target(): CameraPose {
    return this.easing ? this.easing.to : { cx: this.cx, cy: this.cy, zoom: this.zoom };
  }

  /** Advance an eased move to `now` (the renderer calls this once per frame). Returns whether it is still moving. */
  step(now: number): boolean {
    const e = this.easing;
    if (!e) return false;
    const t = (now - e.start) / CAMERA_EASE_MS;
    const p = easePose(e.from, e.to, t);
    this.cx = p.cx;
    this.cy = p.cy;
    this.zoom = p.zoom;
    if (t >= 1) this.easing = null;
    return this.easing !== null;
  }

  /** End an eased move where it was going (a touch on the dish, a direct move). */
  settle(): void {
    const e = this.easing;
    if (!e) return;
    this.easing = null;
    this.cx = e.to.cx;
    this.cy = e.to.cy;
    this.zoom = e.to.zoom;
  }

  /** Run a player-initiated move as an eased one (instant without a clock or in reduced motion). */
  private eased(move: () => void): void {
    const now = this.clock?.();
    if (now === undefined || this.reducedMotion) {
      this.settle();
      move();
      return;
    }
    const shown: CameraPose = { cx: this.cx, cy: this.cy, zoom: this.zoom };
    this.settle(); // compute the new target from where the unfinished move was going
    move();
    const to: CameraPose = { cx: this.cx, cy: this.cy, zoom: this.zoom };
    this.cx = shown.cx;
    this.cy = shown.cy;
    this.zoom = shown.zoom;
    this.easing = to.cx === shown.cx && to.cy === shown.cy && to.zoom === shown.zoom ? null : { from: shown, to, start: now };
  }

  /** P4.13: a zoom button: zoom by `factor` about the viewport centre, eased. */
  zoomBy(factor: number): void {
    this.eased(() => this.zoomAtDirect(this.viewW / 2, this.viewH / 2, factor));
  }

  setViewport(w: number, h: number): void {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
  }

  fitZoom(): number {
    return Math.min(this.viewW, this.viewH) / (DISH_RADIUS_VIEW * 2);
  }

  /** The whole-dish preset (eased when the player asks for it; `instant` for layout changes). */
  fit(instant = false): void {
    const move = (): void => {
      this.zoom = this.fitZoom();
      this.cx = DISH_CENTER;
      this.cy = DISH_CENTER;
    };
    this.followEntityId = null;
    if (instant) {
      this.settle();
      move();
    } else this.eased(move);
  }

  clampZoom(z: number): number {
    return Math.min(ZOOM_MAX, Math.max(this.fitZoom() * 0.9, z));
  }

  worldToScreen(x: number, y: number): [number, number] {
    return [(x - this.cx) * this.zoom + this.viewW / 2, (y - this.cy) * this.zoom + this.viewH / 2];
  }

  screenToWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.viewW / 2) / this.zoom + this.cx, (sy - this.viewH / 2) / this.zoom + this.cy];
  }

  /** Zoom by a factor keeping the world point under (sx, sy) fixed (wheel and pinch: direct, settles any easing). */
  zoomAt(sx: number, sy: number, factor: number): void {
    this.settle();
    this.zoomAtDirect(sx, sy, factor);
  }

  private zoomAtDirect(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.zoom = this.clampZoom(this.zoom * factor);
    this.cx = wx - (sx - this.viewW / 2) / this.zoom;
    this.cy = wy - (sy - this.viewH / 2) / this.zoom;
    this.clampCenter();
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.settle(); // P4.13: a drag follows the hand from where the view is going
    this.cx -= dxScreen / this.zoom;
    this.cy -= dyScreen / this.zoom;
    this.followEntityId = null;
    this.clampCenter();
  }

  /** Find, "go to", the neighbourhood and close presets: eased (P4.13). */
  centerOn(x: number, y: number, zoom?: number): void {
    this.eased(() => {
      if (zoom !== undefined) this.zoom = this.clampZoom(zoom);
      this.cx = x;
      this.cy = y;
      this.clampCenter();
    });
  }

  /** Follow rule (UX §4.4): only move when the target leaves the middle half of the viewport. */
  follow(x: number, y: number): void {
    const [sx, sy] = this.worldToScreen(x, y);
    const mx = this.viewW / 4;
    const my = this.viewH / 4;
    if (sx < mx) this.cx -= (mx - sx) / this.zoom;
    else if (sx > this.viewW - mx) this.cx += (sx - (this.viewW - mx)) / this.zoom;
    if (sy < my) this.cy -= (my - sy) / this.zoom;
    else if (sy > this.viewH - my) this.cy += (sy - (this.viewH - my)) / this.zoom;
    this.clampCenter();
  }

  private clampCenter(): void {
    const slack = DISH_RADIUS_VIEW;
    this.cx = Math.min(DISH_CENTER + slack, Math.max(DISH_CENTER - slack, this.cx));
    this.cy = Math.min(DISH_CENTER + slack, Math.max(DISH_CENTER - slack, this.cy));
  }

  /**
   * Sprite scale (ARCH §9): pxPerCell / 8 snapped to the nearest of {0.5, 1, 2, 3, 4}; a 16 px frame
   * covers 2 cells at scale 1. Below 1 individual sprites are hidden and the aggregation layer is drawn
   * instead, so sprites are only ever drawn at whole-number scales (DECISIONS D-0016).
   */
  spritePixelScale(): number {
    const raw = this.zoom / 8;
    if (raw < 0.75) return 0.5;
    if (raw < 1.5) return 1;
    return Math.min(4, Math.round(raw));
  }

  /** Whether the aggregation layer replaces individual sprites at the current zoom. */
  aggregated(): boolean {
    return this.spritePixelScale() < 1;
  }

  /**
   * Move the view vertically so world point (x, y) appears at screen height `targetSy`, e.g. above a
   * bottom sheet that covers part of the viewport (UX §4.1). Zoom is unchanged; the usual pan limits
   * apply, so the point may stop short of the target near the dish edge.
   */
  revealAt(x: number, y: number, targetSy: number, targetSx = this.viewW / 2): void {
    this.followEntityId = null;
    // P4.13: the inspector's reveal pan eases (zoom unchanged).
    this.eased(() => {
      this.cx = x - (targetSx - this.viewW / 2) / this.zoom;
      this.cy = y - (targetSy - this.viewH / 2) / this.zoom;
      this.clampCenter();
    });
  }
}
