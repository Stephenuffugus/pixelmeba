/** Loads the organism atlas once and draws individual frames for UI thumbnails. */
import type { AtlasManifestLike } from '@render/renderer';

export interface LoadedAtlas {
  readonly manifest: AtlasManifestLike;
  readonly image: HTMLImageElement;
  readonly url: string;
}

let promise: Promise<LoadedAtlas> | null = null;

export function loadAtlas(): Promise<LoadedAtlas> {
  promise ??= (async () => {
    const base = new URL('./atlas/', document.baseURI);
    const res = await fetch(new URL('manifest.json', base));
    if (!res.ok) throw new Error(`atlas manifest failed to load (${res.status})`);
    const manifest = (await res.json()) as AtlasManifestLike;
    const url = new URL('organisms.png', base).toString();
    const image = new Image();
    image.src = url;
    await image.decode();
    return { manifest, image, url };
  })();
  return promise;
}

/** Draw one frame (default: first move/idle frame facing East) scaled to fill the canvas. */
export function drawFrame(canvas: HTMLCanvasElement, atlas: LoadedAtlas, assetId: string, anim?: string, index = 0): void {
  const sprite = atlas.manifest.sprites[assetId];
  if (!sprite) return;
  const a = anim ?? (sprite.animations.move ? 'move' : 'idle');
  const f = atlas.manifest.frames.find((fr) => fr.key === `${assetId}/${a}/e/${index}`);
  if (!f) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = Math.floor(Math.min(canvas.width / f.w, canvas.height / f.h));
  const w = f.w * s;
  const h = f.h * s;
  ctx.drawImage(atlas.image, f.x, f.y, f.w, f.h, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
}
