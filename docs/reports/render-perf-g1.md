# Renderer performance evidence, G1 (P1.5)

Date: 2026-09-27. Covers the BUILD_DIRECTIVE P1.5 done-when: *"60 fps on the dev machine with
6,000 sprites at neighborhood zoom in a synthetic scene; aggregation kicks in at whole-dish zoom;
reduced-motion flag removes pulses/trails."*

## Verdict

| Criterion | Result here | Status |
|---|---|---|
| 60 fps, 6,000 sprites, neighborhood zoom | **Not reached.** 1.8–3.1 fps at 1440×900 and 4.4–9.9 fps at 360×800 under SwiftShader, software WebGL on a shared 2-CPU Codespace with no GPU. | **Open.** Needs a GPU device measurement (P3.12). |
| Aggregation at whole-dish zoom | Phone 360×800 (fit = 2.9 px/cell): aggregation on (about 4,500 cells painted), sprites hidden. Desktop 1440×900 (fit = 7.26 px/cell): aggregation **off**, sprites drawn. | **Met on phone sizes only.** See §4 for a ruling the lead needs to make. |
| Reduced motion removes pulses/trails | Split flashes and placement rings: 0 spawned (control run: 4–7). Animated frames: 0 of about 3,100–6,000 sprites off their `reducedMotionFrame` (control run: 2,400–4,800). Trails are not implemented yet, because no Phase 1 species has one. | **Met.** Passed in all 3 viewports in every run. |

The honest answer to the fps criterion: **this environment cannot show 60 fps.** A bare WebGL2 clear
loop reaches 60 fps here. One full-screen textured quad on its own already drops to about 23 fps at
1440×900 (§3). The limit is software rasterization plus the software compositor's per-frame
readback. The renderer's own JavaScript is not the limit. After the fixes in §5, the renderer's JS
costs about 0.5 ms per frame plus about 1.3 ms per snapshot on one core of this machine.

## 1. How it was measured

```
npx tsx tools/render-bench-run.ts            # full run, about 3 min; prints one JSON document
npx tsx tools/render-bench-run.ts --quick    # smoke run (short windows)
```

- `tools/render-bench-run.ts` starts `npx vite --port 4176 --strictPort` and opens
  `/tools/render-bench.html` in Playwright Chromium (headless shell, build 1243). It passes the same flags as
  `playwright.config.ts`: `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist`. It runs at
  1440×900@1x, 360×800@1x and 360×800@2x, waits for `window.__bench`, then stops the server by port.
- `tools/render-bench.ts` builds the **real `DishRenderer`** with the **real atlas**
  (`public/atlas/organisms.png` + `manifest.json`). It sends one geometry snapshot, then
  `SnapshotMsg`s at **10/s** in the worker's exact packed format (`ENT_STRIDE` = 12 floats and
  `ID_STRIDE` = 2 ids per entity, 5 deposit bands). The scene:
  - **6,000 organisms** of the five Phase 1 species: A01 18 %, B01 25 %, B04 23 %, B06 23 %, P01 11 %.
  - Organisms move smoothly and reflect off the rim.
  - Mixed states: about 70 % moving, 15 % feeding (P01 plays `feed`), 7 % stressed, 8 % resting.
  - 3 births and 3 deaths per snapshot, so split effects and death dissolves run too.
  - A few deposit cells change every snapshot.

  Motion comes from a fixed-seed cosmetic PRNG. None of it is simulation.
- Per viewport, the bench records:
  - rAF intervals over 2 s on the empty page (baseline).
  - Neighborhood zoom (`zoomPreset('neighborhood')`, 8 px/cell): a 2 s warm-up, then 10 s measured.
  - Whole-dish zoom (`zoomPreset('dish')`): 5 s measured.
  - A zoom sweep.
  - A reduced-motion audit.
  - Neighborhood zoom with reduced motion: 5 s measured.
  - A **GPU-free CPU phase**: the Pixi ticker is stopped, and 60 snapshots are applied, each
    followed by 6 renderer frame updates.
- Timing wraps the renderer's per-frame update (`frame()`), `app.renderer.render` and
  `applySnapshot` without replacing them. The Pixi render time is CPU submission only. SwiftShader
  runs its work in the GPU process.
- Machine: AMD EPYC 7763, **nproc 2**, shared with three other agents running tests and builds.
  The 1-minute load average was 1.1–7.4 across runs, and it is recorded with every run. GL:
  `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`,
  WebGL 2.0. Pixi picked its `webgl` renderer, with no canvas fallback. Canvas: 1440×900 @1,
  360×800 @1, 720×1600 @2 (the renderer caps resolution at 2).
- The page is dev-only. `npx vite build --outDir tmp/bench-build-check` produced only `index.html`,
  `assets/*` and `atlas/*`, and `grep -r render-bench` found no matches. The check directory was deleted.

## 2. Measured frame rates (SwiftShader: a lower bound, not a device number)

*Upd* = mean renderer `frame()` time. *Render* = mean Pixi `render()` CPU submission. *Apply* = mean
`applySnapshot` time. All are in ms, measured live, so they include contention with the SwiftShader
threads. At these frame rates the 10/s snapshot timer was starved, so apply `n` is below 10/s.

| Run (load 1m) | Viewport | Zoom | Sprites drawn | fps | p50 / p95 / p99 ms | >33 ms | Upd | Render | Apply |
|---|---|---|---|---|---|---|---|---|---|
| **before fixes** (1.2→3.2) | 1440×900 | neighborhood | 6,003 | 3.06 | 317 / 450 / 450 | 31/31 | 7.23 | 1.31 | 13.79 |
| | 1440×900 | whole dish (7.26) | 6,000+ | 3.48 | 283 / 350 / 350 | 18/18 | 4.77 | 1.04 | 8.76 |
| | 360×800 | neighborhood | 6,013 (all submitted) | 9.00 | 100 / 150 / 233 | 90/90 | 4.75 | 1.18 | 8.46 |
| | 360×800 | whole dish (2.9) | 0 (aggregation) | 14.75 | 67 / 100 / 117 | 75/75 | 5.17 | 0.39 | 8.23 |
| | 360×800@2x | neighborhood | 6,004 | 2.65 | 367 / 450 / 500 | 27/27 | 5.54 | 1.35 | 11.00 |
| **after fixes** (1.4→4.4) | 1440×900 | neighborhood | 6,003 | 1.85 | 517 / 683 / 683 | 19/19 | 2.33 | 3.70 | 6.44 |
| | 1440×900 | whole dish (7.26) | 6,000+ | 2.80 | 317 / 617 / 617 | 15/15 | 1.36 | 2.39 | 5.22 |
| | 360×800 | neighborhood | 3,151 (culled; 3,042 on screen) | 9.85 | 100 / 133 / 200 | 99/99 | 0.71 | 1.14 | 2.69 |
| | 360×800 | whole dish (2.9) | 0 (aggregation) | 10.00 | 100 / 150 / 183 | 51/51 | 0.79 | 0.63 | 4.62 |
| | 360×800@2x | neighborhood | 3,154 | 2.38 | 383 / 633 / 717 | 24/24 | 0.85 | 1.84 | 2.73 |
| **final** (5.3→7.4) | 1440×900 | neighborhood | 6,003 | 1.84 | 517 / 900 / 900 | 19/19 | 2.01 | 4.72 | 7.32 |
| | 360×800 | neighborhood | 3,155 | 4.43 | 217 / 300 / 433 | 45/45 | 1.39 | 2.27 | 5.70 |
| | 360×800@2x | neighborhood | 3,153 | 1.21 | 833 / 1100 / 1100 | 13/13 | 2.13 | 3.31 | 7.35 |

The empty-page baseline was 60 fps (p99 16.8 ms) in every run, so rAF is not capped. Every measured
frame of the renderer took longer than 33 ms. The fps swings between runs follow the machine load,
not the code (§3). The final run's reduced-motion and whole-dish rows are in the JSON the runner prints.

## 3. Where the frame time goes here (diagnosis)

These ad-hoc runs used the bench's `?manual=1` mode, which exposes `window.__benchApi`, and
Chromium tracing:

- **Chrome trace, 1440×900, neighborhood, 4 s.** The GPU process main thread spent **3.82 s** running
  WebGL command buffers (SwiftShader rasterizing). The page's main thread spent **3.52 s** blocked in
  `Commit → LayerTreeHost::DoUpdateLayers → GLES2::ReadPixels → WaitForGetOffset`: with no GPU,
  Chromium composites in software and reads the WebGL canvas back every frame. JavaScript
  (`FunctionCall`) took **0.18 s** of the 4 s.
- **Layer isolation** (fps; `renderable` toggled, with the live feed running):

  | Viewport | all layers | no organisms | organisms only | dish substrate only | nothing |
  |---|---|---|---|---|---|
  | 1440×900 | 3.4 | 3.8 | 16.2 | 7.7 | 60 |
  | 360×800 | 9.3 | 12.9 | 38.8 | 22.2 | 60 |

  The 6,000 sprites are not the main cost. The whole-dish textured layers (substrate and deposit
  sprites) are, because SwiftShader's fill rate is the bottleneck.
- **Bare WebGL2, no Pixi, 1440×900:** a clear-only loop runs at 60 fps. One full-screen textured
  quad runs at 23.4 fps with a 1-sampler shader and 12.8 fps with a 16-sampler if-chain, which is the
  shape of Pixi's batch shader. So even an empty dish cannot reach 60 fps under SwiftShader on this box.

**Conclusion.** The fps numbers above are a floor set by software rasterization on 2 shared vCPUs.
They say nothing about a phone GPU. The renderer-side costs that do carry over to a device (JS per
frame and per snapshot, plus allocation) were fixed and measured separately (§5). Lowering Pixi's
batch texture count would speed up SwiftShader but might cost draw calls on real GPUs, so it was
**not** changed.

## 4. Aggregation and reduced motion

**Zoom sweep.** The renderer's rule is `wide = zoom < 5`: aggregation shows below 5 px/cell, and
sprites fade from 5 down to 3.5 px/cell, then hide.

| px/cell | 2.61 (min) | 3 | 3.5 | 4 | 4.5 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|---|
| aggregation layer | on | on | on | on | on | off | off | off | off |
| sprites | hidden | hidden | alpha 0 | 0.33 | 0.67 | 1 | 1 | 1 | 1 |

The "whole dish" preset fits the dish: zoom = min(viewW, viewH) / 124. That gives 2.9 px/cell on a
phone in portrait or landscape (aggregation on) but **7.26 px/cell at 1440×900**. On desktop, and
on any viewport whose short side is at least 620 px, whole-dish view therefore draws individual sprites.
ARCH §9 says sprites hide and aggregation draws *"below 1 (whole dish)"* on the scale
`pxPerCell / 8`. BUILD_DIRECTIVE P1.5 says *"aggregation below neighborhood zoom"*, which is below
8 px/cell. Changing the threshold is a behaviour change, and this task was limited to performance,
so it was **not** changed. **Ruling needed from the lead or owner:** whether to move the threshold to
8 px/cell (or to 6, where the snapped sprite scale drops below 1). The bench will show the effect.
Related: `Camera.spritePixelScale()` returns raw values below 0.75 rather than the snapped {0.5, …}
set in ARCH §9.

**Reduced motion** (`setOptions({reducedMotion: true})`): birth split flashes and placement rings
are not spawned. Every organism shows its animation's `reducedMotionFrame`. Death dissolves show a
static frame for 600 ms. Audit results (final run), with the control run first:

| Viewport | effects spawned (control → reduced) | sprites off the reduced-motion frame (control → reduced) | sprites audited |
|---|---|---|---|
| 1440×900 | 4 → **0** | 4,764 → **0** | 6,003 |
| 360×800 | 7 → **0** | 2,453 → **0** | 3,134 |
| 360×800@2x | 4 → **0** | 2,528 → **0** | 3,147 |

The placement-ring hook added 1 effect with motion on and 0 with reduced motion. There are no
trails in the renderer yet. E07 and P07 trails, and the rest of UX §7.4, belong to later phases
(P4.9 audit).

## 5. Renderer fixes (src/render) and before/after

All fixes produce the same output; only the work behind them changed. Public API (`create`, `setSpecies`, `setOptions`,
`select`, `zoomPreset`, `applyGeometry`, `applySnapshot`, `placementRing`, `pick`, `positionOf`,
`destroy`, `camera`, `canvas`) and behaviour are unchanged.

1. **Per-sprite texture lookups.** The old code built a `${asset}/${anim}/${h}/${i}` string and did
   a record lookup for every sprite, every frame, plus manifest lookups in `pickAnim`. Now each
   species' animations are resolved to texture tables once, when species or the atlas change.
2. **Interpolation state.** The old code created a `Record<entityId, [x, y]>` with 6,000 new arrays
   per snapshot and did two dictionary lookups per sprite per frame. Now there are typed arrays
   indexed by snapshot position, with the previous position resolved once per snapshot through a
   reused `Map`. Follow mode and `positionOf` use the same index.
3. **Tint.** `Particle.tint` runs a colour conversion on every set. It is now set only when the
   value changes.
4. **Off-screen culling.** Sprites more than half the largest frame outside the viewport are not
   submitted. This does not change what appears on screen. At 360×800 neighborhood zoom, 3,151 are
   submitted instead of 6,013.
5. **Hidden particle layer.** When the particle layer is invisible or has alpha 0 (whole dish on a
   phone), the per-sprite work is skipped, as Pixi itself does. Ghosts still expire. They are no
   longer pushed into a stale list with `addParticle`, which previously grew for as long as the dish
   stayed zoomed out.
6. **Aggregation painted lazily.** It is painted only while visible, at most once per snapshot, still
   at ≤ 10 Hz (ARCH §13). Buffers and `ImageData` are reused instead of allocating about 290 KB per
   snapshot.
7. **Deposits repainted incrementally.** `layers.ts: repaintDepositCells` repaints only the cells
   whose bands changed, `putImageData` covers just the dirty rectangle, and the texture uploads only
   when something changed. The old code allocated and repainted a 1 MB `ImageData` every snapshot.
   A scratch check (60 rounds of random edits, 5-band and 4-band) found **0 byte mismatches** against
   a full `paintDeposits`.
8. **Death-ghost lookup.** A birthId map is built only when a snapshot carries deaths, instead of an
   O(n) scan per death.

**CPU-only A/B.** The GPU is out of the loop (ticker stopped). The old renderer and the new one were
interleaved on the same synthetic scene, 2 repetitions each, 80 snapshots × 6 frames, load average
about 2.1–3.0. Values are mean ms per call, with p95 in brackets.

| Viewport, zoom | `applySnapshot` before | after | `frame()` before | after |
|---|---|---|---|---|
| 1440×900 neighborhood (6,000 drawn) | 5.21 / 4.59 (p95 10.2 / 7.1) | **1.35 / 1.40** (2.0 / 2.7) | 3.10 / 2.72 (5.2 / 4.3) | **0.52 / 0.52** (0.8 / 0.8) |
| 360×800 neighborhood | 5.16 / 5.57 (8.3 / 11.0) | **1.54 / 1.49** (3.4 / 3.5) | 3.03 / 3.05 (4.7 / 5.8) | **0.49 / 0.47** (0.8 / 0.7) |
| 360×800 whole dish (aggregation) | 4.69 / 4.59 (7.8 / 6.0) | **2.06 / 1.05** (5.4 / 1.5) | 2.91 / 3.00 (4.2 / 4.9) | **0.30 / 0.15** (0.7 / 0.5) |

At 60 fps with 10 snapshots/s, renderer JS per frame fell from about 3.9 ms to about 0.8 ms on
this core. That is about 5× less, before counting Pixi's own particle buffer upload, which measured
about 1–2 ms live. The final run's CPU phase, taken at load 5–7, measured `frame()` at 0.9–1.6 ms and
`applySnapshot` at 2.9–6.8 ms. Contention inflates those figures. The GPU-bound fps did not move
(§2, §3), as expected.

Checks after the change:
- `npx tsc -p tsconfig.json --noEmit`: clean.
- `npx eslint src/render tools/render-bench.ts tools/render-bench-run.ts`: clean.
- `npx vitest run`: 27 files, 198 passed and 2 expected-fail.
- `npx vite build`: OK.
- A dev-server smoke test (Garden at 1440×900, running, zoomed in) showed no page errors, organisms
  moving and deposits updating.

## 6. What the device measurement needs (P3.12)

- **Hardware.** A physical, nominated midrange Android phone with GPU compositing, which is what the
  Capacitor WebView uses, plus a desktop browser with a real GPU for the "60 fps on desktop" row
  (SPEC §16). The phone target is 30 fps, not 60.
- **Serving the page.** Run `npx vite --host` and open `http://<dev-ip>:5173/tools/render-bench.html`
  in Chrome on the phone. Use `?measure=30` for longer windows.
- **What to record.** The `window.__bench` JSON from remote DevTools, plus the device model, GPU
  string, DPR, the resolution cap (2) and the thermal state.
- **Longer sessions.** Repeat for a 15-minute dense session to check memory growth and thermal
  collapse. Also measure inside the Capacitor WebView build.
- **If the phone misses 30 fps with 6,000 organisms, reduce cosmetics first** (ARCH §13, SPEC §16):
  - Skip redundant full-dish layers (the deposit layer could merge into the substrate texture).
  - Lower the canvas resolution cap from 2 to 1.5.
  - Lower Pixi `maxBatchableTextures` if the device shows the SwiftShader-like sampler cost.

  Never skip ticks or reduce life.
- **Do not reuse these numbers.** Nothing here is a device measurement. The SwiftShader figures above
  must not be quoted as phone or desktop performance.
