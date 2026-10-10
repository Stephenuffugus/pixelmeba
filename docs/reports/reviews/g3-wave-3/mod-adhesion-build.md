# g3 wave 3 — mod-adhesion build report (P3.7 E12 Colony adhesion)

## Overall

E12 is implemented and registered. The rules are gated on the world's recorded manifest (`world.modules.E12`). content/manifest.json is unchanged, so the lead's flip turns E12 on.

- Tests: tests/fixtures/module-e12.test.ts has 24 tests and all pass. The fence, g2-replay, conservation, determinism and module-accounting tests all pass too.
- Non-vacuity: each of the three named mechanisms (separation reset, component cap, division hook) was removed one at a time, and each removal made its named test fail.
- No world schema bump, no new World keys, no new RNG stream, no content edits.

## Checklist

### Build

- **DONE: Pairing in stage 5, after attacks, parasite attachment and infection.**
  - Where: src/sim/contacts.ts:47 calls `formAdhesionLinks` (src/sim/adhesion.ts:240) after `infectHosts`.
  - Who may pair (`pairable`): carries E12, Active, not FLAG.attached, not E04-anchored, E ≥ 20, out of lockout, and degree < 2.
  - Clock: each organism times its lowest-birthId neighbour of the same species that is also pairable, within 0.5 cells and not already linked to it. It uses `adhPartner` / `adhSeconds`.
  - Resets: the clock resets when there is no neighbour in reach (adhesion.ts:282) or when the candidate changes. It reaches 5 s on the 50th tick.
  - Tests: "links on exactly the 50th tick…", "one tick out of reach restarts the clock (separation reset)…", "a lower-birthId neighbour arriving in reach restarts the clock (candidate change)", "requires E ≥ 20…".
- **DONE: Linking.**
  - Pairs are deduplicated, sorted by (lower birthId, higher birthId) and resolved greedily (adhesion.ts:300–335).
  - Each partner pays 2 E once, ledgered as energy `'other'` (adhesion.ts:327). Rejected pairs pay nothing.
  - No randomness is drawn. Contact kind 4 stays reserved, and contacts.ts documents this.
  - Tests: "each partner pays exactly 2 E once, in stage 5…" checks E before and after stage 5 on every tick. The degree and component cap tests show refusals cost nothing.
- **DONE: Caps.**
  - At most 2 links per organism (adhesion.ts:308), at most 8 members per `adhesionComponent` (adhesion.ts:312).
  - A refusal emits `'linkRefused'` `{kind:'adhesion', partner, reason:'links'|'component'}` and costs nothing.
  - Tests: "degree cap…" and "component cap: the 9th member is refused…; a 7-chain takes its 8th".
- **DONE: Linked members stop self-propelling.**
  - movement.ts:377–381 is one block after the E04 block, calling `adhesionLinked`.
  - Upkeep is 0.01 E/s per incident link in stage 7, under `'upkeep'`: maintenance.ts:49–50 calls `adhesionUpkeepPerSecond`.
  - Links convey nothing (R17): no transfer code exists.
  - Tests: "linked members do not move and pay no movement…" and "upkeep is exactly 0.001 E per link per tick…".
- **DONE: Severance in the release hook.**
  - `adhesionRelease` (adhesion.ts:198) is called from actions.ts:194 after `anchorStep`, and after `advanceIntakeClock`, which already existed and already covers E12.
  - Causes: module loss, not Active (dormancy), `noUsableIntakeSeconds` ≥ 10, E < 15, and separation > 0.75 cells.
  - Every break starts a 10 s `adhLockout` on both ends. The lockout counts down at the end of stage 5, after the pairing check, so it blocks exactly 100 ticks.
  - Death and capture call `severOnRemoval` before `removeAllLinks` (maintenance.ts:170, contacts.ts:158), so survivors get the same lockout and a `linkBroken {cause:'death'}` event.
  - Division: births.ts:310 calls `onAdhesionDivision` after `rekeyLinks`. Both daughters start unlinked with fresh pairing state, and their former partners are locked out.
  - Tests: one per cause in "severance and the relink lockout" (the "module loss" test checks the lockout value; the other four run the full 100-tick lockout and the relink on the 150th tick), plus the death, capture and division tests.
- **DONE: Saves.** Every path removes links from both ends inside the tick, so `linksValid` holds at every tick boundary. Test: "2,000 ticks… round-trips every 100 ticks" checks `linksValid` after each tick and runs `buildSaveFile` → `loadSaveFile` every 100 ticks with an identical `stateHash`.
- **DONE, existing code reused, no edit: intakeClock.ts.** It already existed (mod-anchor-light) with `CLOCK_MODULES` = E04, E12, and is advanced in `releaseInvalidLinks` before my hook.
- **DONE: events.ts.**
  - Reuses `'linkFormed'` / `'linkBroken'` with `detail.kind 'adhesion'`, plus `partner` and, on a break, `cause`.
  - Added `'linkRefused'` (events.ts:32–33).
- **DONE: moduleView.ts.**
  - `moduleActiveNow` case `'E12'` = at least one valid link. It was already a switch, so I added one case and left E01, E03 and E05 unchanged.
  - `upkeepNow` adds `links` (E/s).
- **DONE: inspector strings and protocol.**
  - protocol.ts `UpkeepInspect.links?`.
  - modules.ts: `moduleText` case `'E12'` and an `upkeepText` part: "… for its colony links".
  - Test: the upkeep test checks the words, the "active now" state and that no forbidden words appear.
- **DONE: implemented.ts and moduleRules.ts.** `IMPLEMENTED_MODULES` gains E12. `MODULE_REQUIRED_PARAMS.E12` lists all 11 parameters.
- **VERIFIED: snapshot.ts.** CUE2_LINKED is packed from valid aLink columns (snapshot.ts:161), CUE2_MOD_E12 from the genome (snapshot.ts:175), and links of kind 3 (`LINK_KIND_ADHESION`) at snapshot.ts:223. No edit.
- **VERIFIED: sample.ts.** Adhesion components are whole ownership units and move with remapped links. Test: "half a colony is refused naming the missing member; the whole colony moves with its links". No edit.

### Done when

- **DONE:** link on exactly the 50th tick, not the 49th.
- **DONE:** the E ≥ 20 gate (19.99 never counts; exactly 20 links).
- **DONE:** each partner pays 2 E once; rejected pairs pay nothing.
- **DONE:** degree-2 and component-8 caps. The 9th member fails with an event, no cost and unchanged genomes.
- **DONE:** the result depends only on birthIds. Two slot permutations give identical links, `linkFormed` events and `linkRefused` events.
- **DONE:** linked members do not move.
- **DONE:** upkeep is exactly 0.001 E per link per tick. A 3-chain pays 0.004 per tick in total.
- **DONE:** each severance cause is followed by a 100-tick lockout.
- **DONE:** division and death remove incident links, and survivors stay valid (capture too).
- **DONE:** a 2,000-tick run with carriers dividing, dying and being eaten.
  - `linksValid` holds every tick and the save → load round trip succeeds every 100 ticks.
  - The test also requires linkFormed, linkBroken, carrier births, carrier deaths and captures to all be above 0.
- **DONE:** save/reload mid-pairing (clock at 3 s) gives an identical hash 100 ticks later.
- **DONE:** one 400-tick run equals four 100-tick quarters with `serializeWorld` / `deserializeWorld` between them.
- **DONE:** sampling half a cluster is rejected.
- **DONE:** tests/fixtures/module-accounting.test.ts passes. Its energy balance already includes `'other'`; my file repeats that balance over a linking run.
- **DONE, non-vacuity:** each of these removals fails the named test:
  - Separation reset (`resetClock` removed at adhesion.ts:282) fails "one tick out of reach restarts the clock (separation reset)…" with `expected 3.0000000000000013 to be +0`.
  - Component cap (the `size > maxComponent` line removed) fails "component cap: the 9th member…" with `expected 4 to be +0`.
  - Division hook (`onAdhesionDivision` made a no-op) fails "a member divides…" with `expected 2 to be +0`.
  - adhesion.ts was restored and checked with `diff` afterwards.
- **DONE:** the fence is unchanged. All four trajectory-fence files and g2-replay pass.

## Files

- **Created:**
  - src/sim/adhesion.ts
  - tests/fixtures/module-e12.test.ts
  - this report
- **Changed (owned):**
  - src/sim/contacts.ts: stage 5 hook, `severOnRemoval` on capture, the contact-kind comment.
  - src/sim/maintenance.ts: link upkeep, `severOnRemoval` in `killEntity`.
- **Changed (shared, additive):**
  - src/sim/actions.ts: one call.
  - src/sim/births.ts: one call.
  - src/sim/movement.ts: one block.
  - src/sim/events.ts: `'linkRefused'`.
  - src/sim/moduleView.ts: E12 case, `links`.
  - src/sim/content/implemented.ts, src/sim/content/moduleRules.ts.
  - src/worker/protocol.ts: `UpkeepInspect.links`.
  - src/ui/strings/modules.ts: E12 text, upkeep part.

## Commands

| Command | Result |
|---|---|
| `npx tsc -p tsconfig.json --noEmit` | clean |
| `npx eslint` on every file above | clean |
| `npx vitest run` on the 16 files listed below | `Test Files 19 passed (19)`, `Tests 166 passed (166)` |
| `npx vitest run tests/fixtures/module-e12.test.ts` (final) | `Tests 24 passed (24)` |
| `npx vitest run tests/fixtures/module-e12.test.ts -t <name>` (three mutations) | each `1 failed` as quoted above |

The 16 files in the broad run were: tests/fixtures/g2-replay.test.ts, tests/fixtures/trajectory-fence, tests/fixtures/conservation-closed-lid.test.ts, tests/fixtures/determinism.test.ts, tests/fixtures/module-e12.test.ts, tests/fixtures/module-accounting.test.ts, tests/fixtures/module-e04.test.ts, tests/sim/stage8-order.test.ts, tests/fixtures/shared-budget.test.ts, tests/fixtures/registry-imports.test.ts, tests/helpers/registry.test.ts, tests/sim/module-visuals.test.ts, tests/sim/modules.test.ts, tests/sim/fungal-links.test.ts, tests/sim/tools.test.ts and tests/worker/host.test.ts.

**E2E:** there are no new or changed journeys. E12 is off in the shipped manifest until the lead's flip, so the app cannot show it yet. The inspector text is covered by the unit assertions above. Port 4238 was not used. Once the flip lands, the lead may want an inspector axe pass on an E12 carrier.

## Test device (labelled in the test file)

"Held" positions: after stage 4 the test puts named organisms back at fixed points and rebuilds the spatial index. This lets the pairing rule see the intended distances. B01 swims, and no shipped state keeps a free carrier still.

Other test-only states, each labelled where used: energy set right before contacts (stage 4 hook) or before the release hook (stage 7 hook), forced Resting, biomass and age set ready to divide, and a link to a non-carrier standing in for "module loss".

Sugar of 0.02 per cell per tick gives usable intake every tick without reaching division size in these windows. I measured this: a held B01 fed 0.02 for 600 ticks had 0 births and 600 usable-intake ticks. At 0.3, divisions moved the relink tick from 50 to 57.

## FENCE

None. No fence value changed, and no recipe was created.

## Bugs or notes elsewhere

- links.ts `removeAllLinks` emits `'linkBroken'` only for fungal links. Adhesion events on removal come from adhesion.ts `severOnRemoval`, which runs first. This is consistent, but anyone adding a new removal path must call `severOnRemoval` too. Today there are only two such paths: `killEntity` and `consumePrey`. sample.ts frees slots without breaking links, which is correct.
- Not built because the systems do not exist before Phase 5:
  - "Held" (handling) severance and "gate placed between members" severance.
  - The ban on directed channels while linked.
  - To be added when Phase 5 handling, gates and channels land.
- Event volume: a static colony whose members are close to unlinked members re-proposes a refused pair every 5 s. The clocks restart after a refusal, so the refusal is not repeated every tick. This is the visible failure the spec asks for.

## Proposed decisions

1. **What "free" means:** not FLAG.attached and not E04-anchored (`anchorState === 1`). An anchored carrier may not pair. Links are not cut when an organism anchors later, because a linked member does not move and so cannot reach support on its own.
2. **Link cost category:** the 2 E link cost is ledgered as energy `'other'` (G17 21).
3. **Full members don't look:** a member that already holds 2 links neither times nor is timed by others. So a third-link refusal happens only when two pairs sharing a member resolve on the same tick (the test shows this on tick 50). The alternative would have an outsider fix on a full member forever, never trying a free neighbour and emitting a refusal every 5 s. The 8-member colony cap is still checked at resolution, so a 9th member fails visibly, as D04 §6 asks.
4. **One-sided proposals:** each organism's clock proposes (itself, its candidate). Pairs proposed by both ends are deduplicated. Every proposal is re-checked at resolution: both alive, not linked to each other, both E ≥ 20, then the caps. After a link or a refusal, both ends' clocks restart.
5. **Lockout timing:** the lockout counts down at the end of stage 5, after the pairing check, so a 10 s lockout blocks exactly 100 ticks for both ends, whatever their slot order.
6. **Who is locked out:**
   - Every severed survivor gets the 10 s lockout, including the other ends of a link removed by death, capture or division.
   - The dividing organism's two daughters start fresh, with no lockout and a clean clock.
   - Module loss cannot happen to a living organism today (genomes change only at division, which removes links first). The check stays for safety and is tested with a labelled state.
7. **Events:**
   - `'linkBroken'` detail.cause is one of `moduleLoss`, `dormancy`, `noIntake`, `energy`, `separation`, `death`, `division`.
   - `'linkRefused'` detail.reason is `links` or `component`.
