/**
 * A tiny palette-indexed pixel canvas for authoring sprites in code (ARCH §10.1).
 * Everything is integer and deterministic: the same source always produces the same bytes.
 * Index 0 is transparent. Frames can be printed as strings for review and diffs.
 */
export class Px {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;

  constructor(w: number, h: number, data?: Uint8Array) {
    this.w = w;
    this.h = h;
    this.data = data ? new Uint8Array(data) : new Uint8Array(w * h);
  }

  static fromStrings(rows: readonly string[], key: Readonly<Record<string, number>>): Px {
    const h = rows.length;
    const w = rows[0]?.length ?? 0;
    const p = new Px(w, h);
    rows.forEach((row, y) => {
      if (row.length !== w) throw new Error(`row ${y} has width ${row.length}, expected ${w}`);
      for (let x = 0; x < w; x++) {
        const ch = row[x]!;
        if (ch === '.' || ch === ' ') continue;
        const idx = key[ch];
        if (idx === undefined) throw new Error(`unknown pixel key "${ch}"`);
        p.set(x, y, idx);
      }
    });
    return p;
  }

  clone(): Px {
    return new Px(this.w, this.h, this.data);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  get(x: number, y: number): number {
    return this.inside(x, y) ? this.data[y * this.w + x]! : 0;
  }

  set(x: number, y: number, c: number): this {
    if (this.inside(x, y)) this.data[y * this.w + x] = c;
    return this;
  }

  /** Paint only where a pixel is already set. */
  tint(x: number, y: number, c: number): this {
    if (this.get(x, y) !== 0) this.set(x, y, c);
    return this;
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, c: number): this {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
    }
    return this;
  }

  /** Axis-aligned capsule (rod) from x0..x1 at center row cy with radius r (horizontal). */
  fillRodH(x0: number, x1: number, cy: number, r: number, c: number): this {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(x0 - r); x <= Math.ceil(x1 + r); x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        const nx = Math.min(Math.max(px, x0), x1);
        const d2 = (px - nx) ** 2 + (py - cy) ** 2;
        if (d2 <= r * r) this.set(x, y, c);
      }
    }
    return this;
  }

  /**
   * Thick stroke along a polyline: every pixel whose center lies within `r` of the path. `rAt`
   * (0..1 along the path → radius) tapers it. Integer pixels, so the result is deterministic.
   */
  fillStroke(pts: readonly (readonly [number, number])[], r: number, c: number, rAt?: (t: number) => number): this {
    const segs: { ax: number; ay: number; bx: number; by: number; t0: number; t1: number }[] = [];
    let total = 0;
    for (let k = 1; k < pts.length; k++) total += Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]);
    let acc = 0;
    for (let k = 1; k < pts.length; k++) {
      const [ax, ay] = pts[k - 1]!;
      const [bx, by] = pts[k]!;
      const len = Math.hypot(bx - ax, by - ay);
      segs.push({ ax, ay, bx, by, t0: total > 0 ? acc / total : 0, t1: total > 0 ? (acc + len) / total : 1 });
      acc += len;
    }
    if (pts.length === 1) segs.push({ ax: pts[0]![0], ay: pts[0]![1], bx: pts[0]![0], by: pts[0]![1], t0: 0, t1: 1 });
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const px = x + 0.5;
        const py = y + 0.5;
        for (const s of segs) {
          const dx = s.bx - s.ax;
          const dy = s.by - s.ay;
          const l2 = dx * dx + dy * dy;
          const u = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((px - s.ax) * dx + (py - s.ay) * dy) / l2));
          const qx = s.ax + u * dx;
          const qy = s.ay + u * dy;
          const rr = rAt ? rAt(s.t0 + (s.t1 - s.t0) * u) : r;
          if ((px - qx) ** 2 + (py - qy) ** 2 <= rr * rr) {
            this.set(x, y, c);
            break;
          }
        }
      }
    }
    return this;
  }

  /** One-pixel line (Bresenham) between integer points. */
  line(x0: number, y0: number, x1: number, y1: number, c: number): this {
    let x = x0;
    let y = y0;
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.set(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        x += sx;
      }
      if (e2 <= dx) {
        e += dx;
        y += sy;
      }
    }
    return this;
  }

  fillRect(x0: number, y0: number, w: number, h: number, c: number): this {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c);
    return this;
  }

  /** Recolor every pixel of color `from` to `to`. */
  replace(from: number, to: number): this {
    for (let i = 0; i < this.data.length; i++) if (this.data[i] === from) this.data[i] = to;
    return this;
  }

  /** Draw a 1-px outline (4-neighborhood) of color c around all set pixels. */
  outline(c: number): this {
    const src = this.clone();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (src.get(x, y) !== 0) continue;
        if (src.get(x + 1, y) || src.get(x - 1, y) || src.get(x, y + 1) || src.get(x, y - 1)) this.set(x, y, c);
      }
    }
    return this;
  }

  /** Shade the bottom-right edge pixels of the body (not outline) with `c` for gentle volume. */
  shadeEdge(body: readonly number[], c: number, dx = 1, dy = 1): this {
    const src = this.clone();
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const v = src.get(x, y);
        if (!body.includes(v)) continue;
        const n = src.get(x + dx, y + dy);
        if (!body.includes(n)) this.set(x, y, c);
      }
    }
    return this;
  }

  /** Stamp another canvas onto this one at an offset (transparent pixels skipped). */
  stamp(src: Px, ox: number, oy: number): this {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const v = src.get(x, y);
      if (v !== 0) this.set(x + ox, y + oy, v);
    }
    return this;
  }

  shift(dx: number, dy: number): Px {
    const out = new Px(this.w, this.h);
    return out.stamp(this, dx, dy);
  }

  /** Lossless 90° clockwise rotation (square canvases only). */
  rotateCW(): Px {
    if (this.w !== this.h) throw new Error('rotateCW needs a square canvas');
    const out = new Px(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.set(this.h - 1 - y, x, this.get(x, y));
    return out;
  }

  mirrorX(): Px {
    const out = new Px(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.set(this.w - 1 - x, y, this.get(x, y));
    return out;
  }

  /** Remove pixels whose deterministic hash falls under `fraction` (for dissolves). */
  erode(fraction: number, salt: number): Px {
    const out = this.clone();
    for (let i = 0; i < out.data.length; i++) {
      if (out.data[i] === 0) continue;
      let h = (i * 2654435761 + salt * 40503) >>> 0;
      h ^= h >>> 15;
      h = Math.imul(h, 2246822519) >>> 0;
      h ^= h >>> 13;
      if ((h % 1000) / 1000 < fraction) out.data[i] = 0;
    }
    return out;
  }

  count(): number {
    let n = 0;
    for (const v of this.data) if (v !== 0) n++;
    return n;
  }

  bounds(): { x0: number; y0: number; x1: number; y1: number } | null {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y) === 0) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }

  toStrings(chars = '.abcdefghijklmnopqrstuvwxyz'): string[] {
    const rows: string[] = [];
    for (let y = 0; y < this.h; y++) {
      let s = '';
      for (let x = 0; x < this.w; x++) s += chars[this.get(x, y)] ?? '?';
      rows.push(s);
    }
    return rows;
  }
}
