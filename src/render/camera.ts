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

export class Camera {
  cx = DISH_CENTER;
  cy = DISH_CENTER;
  zoom = 4;
  viewW = 1;
  viewH = 1;
  /** Entity followed by birthId/entityId key, if any. */
  followEntityId: number | null = null;

  setViewport(w: number, h: number): void {
    this.viewW = Math.max(1, w);
    this.viewH = Math.max(1, h);
  }

  fitZoom(): number {
    return Math.min(this.viewW, this.viewH) / (DISH_RADIUS_VIEW * 2);
  }

  fit(): void {
    this.zoom = this.fitZoom();
    this.cx = DISH_CENTER;
    this.cy = DISH_CENTER;
    this.followEntityId = null;
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

  /** Zoom by a factor keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, factor: number): void {
    const [wx, wy] = this.screenToWorld(sx, sy);
    this.zoom = this.clampZoom(this.zoom * factor);
    this.cx = wx - (sx - this.viewW / 2) / this.zoom;
    this.cy = wy - (sy - this.viewH / 2) / this.zoom;
    this.clampCenter();
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.cx -= dxScreen / this.zoom;
    this.cy -= dyScreen / this.zoom;
    this.followEntityId = null;
    this.clampCenter();
  }

  centerOn(x: number, y: number, zoom?: number): void {
    if (zoom !== undefined) this.zoom = this.clampZoom(zoom);
    this.cx = x;
    this.cy = y;
    this.clampCenter();
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
    this.cx = x - (targetSx - this.viewW / 2) / this.zoom;
    this.cy = y - (targetSy - this.viewH / 2) / this.zoom;
    this.followEntityId = null;
    this.clampCenter();
  }
}
