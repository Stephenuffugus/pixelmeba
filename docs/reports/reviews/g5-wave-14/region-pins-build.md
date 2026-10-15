# Wave 14 · region-pins (P5.7 "region pins") build report

## Checklist
Build
1. DONE: protocol `DishInfo.regions?: readonly DishRegion[]` with `DishRegion { id, label, number, anchor: readonly [number, number] }` (src/worker/protocol.ts:719-733). No PROTOCOL_VERSION change. host.ts `info()` (src/worker/host.ts:3339-3345) reads `w.content.habitat.regions`, the world's own record, typed with `HabitatRegion` from habitatRules.ts. `number` = k + 1 in record order. The key is spread in only when the list has ≥ 1 region, so it is absent otherwise. Proved by tests/worker/dishinfo-regions.test.ts.
2. DONE: src/render/regionPins.ts is pure (no Pixi, no time input, no rng). `regionPinModel(regions, zoom)` returns per pin: number, cx/cy (anchor + 0.5), glyph (a 3 × 5 digit, PROBE_GLYPHS convention), size (= 19 / zoom), head centre/radius, digit origin and dot size, and a teardrop outline polygon starting at the point. Also `REGION_DIGIT_GLYPHS` 1-6, `REGION_PIN_SCREEN`, `REGION_PIN_COLORS` and `regionPinsNeedRedraw`. Proved by tests/render/region-pins.test.ts.
3. DONE: renderer.ts. The field `regionPinsG = new Graphics()` at :311 is created at construction and added in the constructor's world.addChild between effects and selectionG (:470), with a comment on the D-0128 ruling. `setRegionPins` at :1626 redraws only when the list changed. `drawRegionPins` at :1632 draws a dark companion stroke (3 px) under a light fill, then the dark digit. The frame hook at :1102 redraws only when the zoom moves more than 25 % (`regionPinsNeedRedraw`), never per tick, and nothing animates. A source-level test pins the order and the hook.
4. DONE: DishScreen.tsx:149-157. The effect calls `getRenderer()?.setRegionPins(dishInfo.value?.regions ?? [])` on [ready, dishId, the regions key]; cleanup on unmount clears it. DishScreen hosts both Explore and Lab. Undo does not resend info, and the restored world keeps its habitat (test).
5. DONE: src/ui/strings/regions.ts holds the words. src/ui/panels/RegionLegend.tsx renders a section with an h3 "Habitat regions", a `ul role="list"` with aria-label "Habitat regions, numbered as their pins on the dish", items "1 Fresh pool", and a note. It renders nothing with no regions. It is mounted at the top of the Regions sheet, under its header (ProbePanel.tsx:28, :60). Text is ≥ 16 px (e2e).

Done when
- DONE: my tests pass. tests/worker/{host,protocol3,protocol3-v1-equivalence,probes,probes-crossings,probes-gates}.test.ts, tests/render/*.test.ts and tests/ui/*.test.ts pass: 63 files, 504 tests.
- DONE: `npx tsc --noEmit` reports no error in my files. The one remaining error is tests/content/habitats-p5.test.ts(226,17), habitat-geometry's in-flight test, not mine. eslint is clean on all 13 changed or created files.
- DONE: `npm run art:build -- --check`: "atlas up to date · 1691 frames … 08fb56e6b439". The pins are procedural and add no atlas frame.
- DONE: FENCE unchanged. g2-replay, rc1-replay, trajectory-fence*, conservation-closed-lid, determinism and determinism-g3 ran: "Test Files 10 passed (10) / Tests 77 passed (77)".
- DONE: e2e on desktop and phone-portrait: "4 passed (2.7m)".

## DishInfo.regions as committed
```ts
readonly regions?: readonly DishRegion[];
export interface DishRegion { readonly id: string; readonly label: string; readonly number: number; readonly anchor: readonly [number, number] }
```

## Layer order (world container, bottom to top)
1. Constructor: dishSprite, structuresG, deviceParticles, badgesG, filmParticles, depositSprite, objectParticles, overlaySprite, aggSprite, rim, particles, featureParticles, statusParticles, linksG, effects, **regionPinsG**, selectionG.
2. bandParticles is inserted just before particles.
3. Appended later on first use: favoritesG, lineageG, probesG, brushG, edgePreviewG, removePreviewG, gateG.

Pins draw over the gate badges, as accepted in D-0128.

## Redraw rule
- On a list change (setRegionPins compares numbers and anchors).
- When |zoom / drawnZoom − 1| > 0.25 (frame() → regionPinsNeedRedraw).
- Never per tick.

## Legend words
"Habitat regions" (heading); items "1 Fresh pool", "2 Channel" …; note "The numbered pins on the dish mark where each region of this habitat is. They are part of the habitat, not probe regions." The one-sentence form, regionLegendText, gives "Habitat regions: 1 Fresh pool · 2 Brine pool · 3 Channel.".

## Indicative cost
The six-pin model takes 35.3 µs per redraw (vitest, shared machine). The Pixi stroke and fill of six polygons plus at most 90 dot rects happens only on the redraw rule above. Lead to confirm under perf.

## What each test proves (mutants by hand, reverted)
- region-pins.test.ts covers:
  - the model: numbers, centres, 1/zoom size, and the digit inside the head;
  - six distinct digits, none equal to a probe letter parsed from renderer.ts;
  - empty and out-of-range input gives no pins;
  - purity;
  - the addChild order and creation at construction;
  - the redraw rule and the frame hook.
  - Mutant "letters instead of digits": the glyph test failed. Mutant "pins before effects": the layer-order test failed.
- dishinfo-regions.test.ts covers:
  - the recorded regions (ids, labels, numbers 1-2, anchors agreeing with regionAnchorCell);
  - unchanged after a command and Undo;
  - the world's record decides (shipped vs edited registry);
  - FIRST_DISH_V1 and all five rc1 saves have no key and deep-equal the info without it;
  - an empty recorded list gives no key;
  - the buildSaveFile → loadSaveFile round trip keeps the regions with an equal stateHash.
  - Mutant "info reads the registry's habitat": 3 tests failed. Mutant "key always present (possibly empty)": 3 tests failed.
- region-legend.test.ts covers the words for 1, 3 and 6 regions, null for none, that the component returns null with no regions, and the honest-words check.
- region-pins.spec.ts covers:
  - the imported two-region fixture: the Regions sheet lists "1 Fresh pool" and "2 Channel" with text ≥ 16 px;
  - axe and no overflow in Explore and in the sheet;
  - no page error in Explore, Lab or back in Explore;
  - the Garden shows no legend.
  - No screenshot assertion.

## Files
- Created:
  - src/render/regionPins.ts
  - src/ui/panels/RegionLegend.tsx
  - src/ui/strings/regions.ts
  - tests/render/region-pins.test.ts
  - tests/ui/region-legend.test.ts
  - tests/worker/dishinfo-regions.test.ts
  - tests/e2e/regionPinsFixture.ts (exports TWO_REGIONS, which the worker test also uses)
  - tests/e2e/region-pins.spec.ts
- Changed (only where I own them):
  - src/render/renderer.ts (import, fields, addChild entry, frame hook, setRegionPins/drawRegionPins)
  - src/worker/protocol.ts (DishInfo.regions, DishRegion)
  - src/worker/host.ts (info() plus a type import)
  - src/ui/views/DishScreen.tsx (the effect)
  - src/ui/panels/ProbePanel.tsx (mounts RegionLegend)

## FENCE notes
Unchanged. No fence value would move: the change is DishInfo, renderer and UI only, and nothing in src/sim changed.

## Bugs noticed elsewhere
- habitat-geometry in flight: tsc reports tests/content/habitats-p5.test.ts(226,17) "Property 'push' does not exist on type 'readonly RawFile[]'".
- The renderer's drawProbes runs every frame (frame() end). It predates this wave and is outside my scope.

## PROPOSED DECISIONS
1. **The pin is about 19 screen px tall, not about 12.** A 3 × 5 digit at 1 px per dot is 5 px tall, which does not read on a phone. Each dot is 2 px instead (the probe letters use 3 px), on a head of radius 7 px. Reason: UX §6.1 readability.
2. **Region pins are content, not probes.** They never count against the six probe regions, and the legend says so. This repeats the task's proposal and D-0128.
3. **Pins carry digits 1-6, not letters.** The probes use A-F, so digits keep the two apart (task proposal, D-0128).
4. **The legend sits under the Regions sheet's header.** It does not also appear in the drawing session bar, which already covers part of the dish on a phone.
5. **A pin carries no colour per region.** It is a light fill, a dark outline and a dark digit, so it reads in grayscale.

## NEEDS
None. HabitatRegion and regionAnchorCell exist in src/sim/content/habitatRules.ts and are imported.
