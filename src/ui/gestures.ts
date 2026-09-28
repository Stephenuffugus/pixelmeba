/**
 * Viewport input contract (UX §4.2):
 * - Look: one-finger drag pans, tap inspects (candidate list when several organisms overlap).
 * - A placement tool acts only on tap (Explore) or on stroke when Paint is on; otherwise drag pans.
 * - Two fingers always pan/zoom and cancel any uncommitted paint stroke.
 * - Mouse: left uses the tool, middle/right drag pans, wheel zooms at the cursor.
 */
import type { DishRenderer } from '@render/renderer';

export interface GestureHandlers {
  onTap(sx: number, sy: number, wx: number, wy: number): void;
  onStroke(points: [number, number][]): void;
  /** Whether the current tool paints on drag (instead of panning). */
  paints(): boolean;
  onCameraMoved(): void;
  /** Lab (P2.7): a paint stroke began / grew (brush preview before release). */
  onStrokeStart?(w: [number, number]): void;
  onStrokeMove?(points: readonly [number, number][]): void;
  /** The uncommitted stroke was dropped (two fingers, pointer cancel, or an external cancel). */
  onStrokeCancel?(): void;
  /** Mouse hovering over the dish (null when it leaves): footprint preview before pressing. */
  onHover?(w: [number, number] | null): void;
  /** Receives a function that drops the uncommitted stroke (e.g. on a view switch mid-gesture). */
  bindCancel?(cancel: (() => void) | null): void;
}

const TAP_SLOP = 8;
const TAP_MS = 400;

export function attachGestures(el: HTMLElement, r: DishRenderer, h: GestureHandlers): () => void {
  const pointers: Record<number, { x: number; y: number; sx: number; sy: number; t: number; button: number }> = {};
  let stroke: [number, number][] | null = null;
  let pinch: { d: number; mx: number; my: number } | null = null;
  let moved = false;

  const local = (e: PointerEvent | WheelEvent): [number, number] => {
    const rect = el.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };
  const ids = () => Object.keys(pointers).map(Number);

  const down = (e: PointerEvent) => {
    // Only presses that start on the dish itself are dish gestures; sheets, prompts and buttons
    // layered over the viewport handle their own input.
    if (e.target !== r.canvas) return;
    el.setPointerCapture(e.pointerId);
    const [x, y] = local(e);
    pointers[e.pointerId] = { x, y, sx: x, sy: y, t: performance.now(), button: e.button };
    moved = false;
    if (ids().length === 2) {
      if (stroke) h.onStrokeCancel?.();
      stroke = null; // two fingers cancel an uncommitted stroke
      const [a, b] = ids().map((id) => pointers[id]!);
      pinch = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), mx: (a!.x + b!.x) / 2, my: (a!.y + b!.y) / 2 };
    } else if (ids().length === 1 && e.button === 0 && h.paints()) {
      stroke = [r.camera.screenToWorld(x, y)];
      h.onStrokeStart?.(stroke[0]!);
    }
  };

  const move = (e: PointerEvent) => {
    const p = pointers[e.pointerId];
    if (!p && h.onHover && e.pointerType === 'mouse') h.onHover(e.target === r.canvas ? r.camera.screenToWorld(...local(e)) : null);
    if (!p) return;
    const [x, y] = local(e);
    const dx = x - p.x;
    const dy = y - p.y;
    p.x = x;
    p.y = y;
    if (Math.hypot(x - p.sx, y - p.sy) > TAP_SLOP) moved = true;
    const list = ids();
    if (list.length >= 2 && pinch) {
      const [a, b] = list.map((id) => pointers[id]!);
      const d = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const mx = (a!.x + b!.x) / 2;
      const my = (a!.y + b!.y) / 2;
      if (pinch.d > 0) r.camera.zoomAt(mx, my, d / pinch.d);
      r.camera.panBy(mx - pinch.mx, my - pinch.my);
      pinch = { d, mx, my };
      h.onCameraMoved();
      return;
    }
    if (stroke) {
      const w = r.camera.screenToWorld(x, y);
      const last = stroke[stroke.length - 1]!;
      if (Math.hypot(w[0] - last[0], w[1] - last[1]) >= 0.5) {
        stroke.push(w);
        h.onStrokeMove?.(stroke);
      }
      return;
    }
    if (moved || p.button !== 0) {
      r.camera.panBy(dx, dy);
      h.onCameraMoved();
    }
  };

  const up = (e: PointerEvent) => {
    const p = pointers[e.pointerId];
    if (!p) return;
    delete pointers[e.pointerId];
    const wasPinch = pinch !== null;
    if (ids().length < 2) pinch = null;
    if (wasPinch) {
      if (stroke) h.onStrokeCancel?.();
      stroke = null;
      return;
    }
    const [x, y] = local(e);
    const quick = performance.now() - p.t < TAP_MS;
    if (stroke) {
      const s = stroke;
      stroke = null;
      if (!moved) {
        const [wx, wy] = r.camera.screenToWorld(x, y);
        h.onTap(x, y, wx, wy);
      } else if (s.length > 0) h.onStroke(s);
      return;
    }
    if (!moved && quick && p.button === 0) {
      const [wx, wy] = r.camera.screenToWorld(x, y);
      h.onTap(x, y, wx, wy);
    }
  };

  const cancel = (e: PointerEvent) => {
    delete pointers[e.pointerId];
    if (stroke) h.onStrokeCancel?.();
    stroke = null;
    pinch = null;
  };

  const wheel = (e: WheelEvent) => {
    if (e.target !== r.canvas) return;
    e.preventDefault();
    const [x, y] = local(e);
    r.camera.zoomAt(x, y, Math.exp(-e.deltaY * 0.0015));
    h.onCameraMoved();
  };

  const context = (e: Event) => e.preventDefault();
  const leave = () => h.onHover?.(null);
  h.bindCancel?.(() => {
    if (stroke) h.onStrokeCancel?.();
    stroke = null;
    pinch = null;
    // Forget the pressed pointers too, so their release is neither a stroke nor a tap.
    for (const id of ids()) delete pointers[id];
  });

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('contextmenu', context);
  el.addEventListener('pointerleave', leave);
  return () => {
    el.removeEventListener('pointerleave', leave);
    h.bindCancel?.(null);
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('contextmenu', context);
  };
}
