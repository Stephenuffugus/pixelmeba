# Wave 14 · rules verifier 2 (region-pins, new-dish-habitats)

Verifier: adversarial wave verifier, lens "rules, determinism, conservation, tests and player-facing truth".
I verified the uncommitted working tree at /workspaces/pixelmeba (HEAD 92c074b plus the wave's diff). I edited no tracked file. Scratch files are in tmp/verify-g5-wave-14-1/; the mutants were applied at load time by a vitest transform plugin in tmp/verify-g5-wave-14-1/mutant.config.ts.

**Verdict: ok = true.** There is no BLOCKER or MAJOR. I found 2 MINOR and 2 NIT problems.

## Problems (most severe first)

- MINOR [region-pins] src/ui/views/DishScreen.tsx:152-157 — No test proves that a pin is ever drawn. The worker test proves `DishInfo.regions`; the source-level test pins the layer order and the zoom hook in renderer.ts. But nothing reads DishScreen's `setRegionPins` effect, and nothing observes `drawRegionPins` producing geometry. The journey's claim that "the renderer draws the pins from DishInfo.regions" is proven only as "no page error". — Repro: delete the effect at DishScreen.tsx:152-156, or empty the body of `drawRegionPins`. Then tests/render/region-pins.test.ts, tests/ui/region-legend.test.ts, tests/worker/dishinfo-regions.test.ts and tests/e2e/region-pins.spec.ts all still pass, because the legend reads `dishInfo` directly, not the renderer. The only test that mentions the effect is a comment. A cheap fix: a source-level assertion that DishScreen calls `setRegionPins(dishInfo.value?.regions ?? [])`, plus a renderer test hook such as a pin count in frameStats.
- MINOR [new-dish-habitats] tests/ui/new-dish-starts.test.ts:197 and src/ui/views/NewDish.tsx:195-275, :425 — In the shipped tree, the Phase 5 summary as NewDish.tsx renders it is tested only by a re-implementation. `summaryLines` in the test rebuilds the lines from the string functions. NewDish's own wiring is covered only by journey cases 2-3, which skip until THE HABITAT ENABLE. — Repro (by reading): if Summary always rendered `NO_LIFE_YET` at :266, or if NewDish dropped `setLife(lifeAfterStart(...))` at :425, every unit test and journey case 1 would still pass. The pure `lifeAfterStart` and `startOverrides` mutants are caught; their call sites are not. This closes only when the lead runs habitats-p5.spec.ts cases 2-3 after THE HABITAT ENABLE. Keep that run on the enable checklist.
- NIT [region-pins] tests/render/region-pins.test.ts:128-135 — The assignment asked for the "indicative cost of a redraw with six pins". The report gives only the pure model's cost (35.3 µs). It does not give the Graphics poly/rect/fill redraw, and says "Perf numbers are left to the lead". The redraw runs only on a list change or a zoom move of more than 25 %, so the risk is nil; the number is just missing.
- NIT [region-pins] src/render/regionPins.ts:55 — The pin is 19 screen px tall, not the "about 12 px" the assignment asked for. This is a PROPOSED DECISION with a reason (a 3 × 5 digit at 1 px per dot is 5 px tall). It is for the lead to accept in DECISIONS.

## VERIFIED OK

**Shared checks**
- VERIFIED OK — the FENCE is unchanged. I ran `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/determinism.test.ts tests/fixtures/determinism-g3.test.ts`: "Test Files 10 passed (10) / Tests 77 passed (77)", 1028.7 s, exit 0.
- VERIFIED OK — the builders' new unit tests pass. tests/render/region-pins.test.ts, tests/ui/region-legend.test.ts, tests/worker/dishinfo-regions.test.ts, tests/ui/new-dish-starts.test.ts and tests/ui/new-dish-environment.test.ts: "5 passed (5) / 36 passed (36)".
- VERIFIED OK — the named suites pass. tests/worker/{host, protocol3, protocol3-v1-equivalence, probes, new-dish-habitats}.test.ts, tests/render, tests/ui and tests/fixtures/demo-scope.test.ts: "Test Files 63 passed (63) / Tests 523 passed (523)".
- VERIFIED OK — `npx tsc -p tsconfig.json --noEmit` exits 0 on the whole tree. The habitats-p5.test.ts error the region-pins builder saw is gone.
- VERIFIED OK — `npx eslint` exits 0 on all 19 files the two tasks created or changed.
- VERIFIED OK — `npm run art:build -- --check` reports "atlas up to date · 1691 frames … 08fb56e6b439". The pins are procedural, with no atlas frame.

**region-pins**
- VERIFIED OK [region-pins] — DishInfo.regions is additive. It is an optional `regions?: readonly DishRegion[]` (protocol.ts), and PROTOCOL_VERSION is unchanged.
- VERIFIED OK [region-pins] — host.ts info() reads `w.content.habitat.regions` (the world's record) with number = k + 1. The key is present only when the record has at least one region.
- VERIFIED OK [region-pins] — mutants at load time:
  - info() reading `this.registry.habitats[w.content.habitat.id]`: 3 of 5 dishinfo-regions tests fail.
  - the key always present: 3 of 5 fail (the FIRST_DISH_V1 deep-equal, the rc1 saves, the world-decides test).
- VERIFIED OK [region-pins] — regionPins.ts is pure. It has no Pixi, Math.random, Date or performance import, and nothing that consumes sim randomness or state.
- VERIFIED OK [region-pins] — model mutants at load time:
  - letters instead of digits (the A and B glyphs as 1 and 2): the glyph test fails.
  - anchor without the + 0.5: the centre test fails.
  - a fixed zoom: the 1 / zoom test fails.
- VERIFIED OK [region-pins] — the layer order matches D-0128. regionPinsG is created at construction, and the world.addChild call is: dishSprite, structuresG, deviceParticles, badgesG, filmParticles, depositSprite, objectParticles, overlaySprite, aggSprite, rim, particles, featureParticles, statusParticles, linksG, effects, regionPinsG, selectionG. probesG and the previews are appended later, above it. A source-level test pins the order.
- VERIFIED OK [region-pins] — the redraw rule. Pins redraw on a list change in setRegionPins, or when the zoom moves by more than 25 % (`regionPinsNeedRedraw`) in the frame hook; never per tick. They are static, so reduced motion is unaffected. They read in grayscale: a light fill, a dark stroke and a dark digit, with no colour per region.
- VERIFIED OK [region-pins] — the legend. It renders nothing without regions, uses `role="list"` with an aria-label, has "1 Fresh pool" items, and is mounted at the top of ProbeSheet. Its words carry no claim of a measurement or a cause.
- VERIFIED OK [region-pins] — ownership. The renderer.ts, protocol.ts, host.ts, DishScreen.tsx and ProbePanel.tsx hunks touch only the owned parts.

**new-dish-habitats**
- VERIFIED OK [new-dish-habitats] — START_HABITAT and isEmptyStart are deleted (grep finds neither in src or tests).
- VERIFIED OK [new-dish-habitats] — the start list comes from `habitatStarts` over the content records and BUILD_MANIFEST. The order is right: WATER_GARDEN (phase 1), GEL_COLONY and SEDIMENT_EDGE (phase 3), then H04-H11 (phase 5).
- VERIFIED OK [new-dish-habitats] — the v1.0 ids, labels and notes are verbatim, and the Summary renders exactly as before:
  - `empty` keeps "No life and no food until you add them.";
  - gel and sediment keep their single preset line;
  - `hasLife = !p.empty` for non-Phase 5 starts.
- VERIFIED OK [new-dish-habitats] — raw-JSON safety. The offer rules work on the unparsed records NewDish globs: `ops` is defaulted by the caller, other optional arrays are read with `?? []`, and every species file has `nativeAbilities` and `foodPriority`.
- VERIFIED OK [new-dish-habitats] — mutants at load time:
  - the list ignores habitatOffered: 1 test fails (S01 off still shows H10);
  - Life kept across a start change: 1 fails;
  - community sent without an offer: 2 fail.
- VERIFIED OK [new-dish-habitats] — the community wiring:
  - `community` reaches the preview request and Create only through startOverrides, and only when chosen and offered;
  - the "current" check compares `preview.p.community`;
  - customDishSource without community is byte-equal to today's (a JSON-string test);
  - the host refuses `community` without `empty`, or for a habitat without an offered community.
- VERIFIED OK [new-dish-habitats] — honest labels:
  - "It places …", "Regions …" and "Suggested Community: 5 … near …" restate the worker's measured preview: `uses` counts world edges, devices and objects at tick 0, and `communityGroups` counts the founders actually placed;
  - "Five each of" in the choice note matches CommunityGroupSchema `count: z.literal(5)`;
  - the ledger line attributes food-object carbon to "food and founders", which matches realizeRecipe logging habitat food objects as external inputs.
- VERIFIED OK [new-dish-habitats] — the demo offers only WATER_GARDEN (the Garden and Empty Water Garden, as before), and the curated dishes stay hidden there.
- VERIFIED OK [new-dish-habitats] — ownership. Only NewDish.tsx and state.ts (the community pass-through) changed, plus the new files. styles.css is untouched by this task.

## Not run
I ran no browser tests. No suspected UI problem needed one: the two MINORs are test gaps, proven by reading and by the unit mutants. Both builders report desktop and phone-portrait journey passes on port 4272.
