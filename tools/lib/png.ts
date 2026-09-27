/** Minimal deterministic PNG writing and scaling helpers for tools (pngjs). */
import { PNG } from 'pngjs';

export interface RgbaImage {
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
}

export function createImage(w: number, h: number, fill: [number, number, number, number] = [0, 0, 0, 0]): RgbaImage {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill, i * 4);
  return { w, h, data };
}

export function blit(dst: RgbaImage, src: RgbaImage, ox: number, oy: number, alphaOnly = true): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const si = (y * src.w + x) * 4;
      if (alphaOnly && src.data[si + 3] === 0) continue;
      const dx = x + ox;
      const dy = y + oy;
      if (dx < 0 || dy < 0 || dx >= dst.w || dy >= dst.h) continue;
      dst.data.set(src.data.subarray(si, si + 4), (dy * dst.w + dx) * 4);
    }
  }
}

export function scaleNearest(src: RgbaImage, k: number): RgbaImage {
  const out = createImage(src.w * k, src.h * k);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const si = (Math.floor(y / k) * src.w + Math.floor(x / k)) * 4;
      out.data.set(src.data.subarray(si, si + 4), (y * out.w + x) * 4);
    }
  }
  return out;
}

export function toGrayscale(src: RgbaImage): RgbaImage {
  const out = { w: src.w, h: src.h, data: new Uint8Array(src.data) };
  for (let i = 0; i < out.data.length; i += 4) {
    const l = Math.round(0.2126 * out.data[i]! + 0.7152 * out.data[i + 1]! + 0.0722 * out.data[i + 2]!);
    out.data[i] = l;
    out.data[i + 1] = l;
    out.data[i + 2] = l;
  }
  return out;
}

export function encodePng(img: RgbaImage): Buffer {
  const png = new PNG({ width: img.w, height: img.h, colorType: 6, inputHasAlpha: true, deflateLevel: 9 });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png, { colorType: 6, deflateLevel: 9 });
}
