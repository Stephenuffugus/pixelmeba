# Wave 1 — stage 8 verify (rules, determinism, conservation, tests)

Verifier lens: rules, determinism, conservation and tests. I edited no tracked file. Scratch work, including a mutant copy of the repo, is in tmp/verify-stage8-rules/.

**Verdict: ok.** No BLOCKER and no MAJOR. Four MINORs (test gaps and one edge case), plus two informational notes.

## Problems (most severe first)

### MINOR 1 — construction pass throws on a cell whose film is already above FILM_CAP
- **Where:** `src/sim/construction.ts:136-138`.
- **Mechanism:** headroom = max(0, 0.5 − film) = 0, so the cell is "scaled" with scale 0. The pin then computes dust = 0.5 − film, which is −0.1, and throws "allocation defect".
- **Repro** (scratch test in the mutant copy): a film world, `setField(w,'film',CELL,0.6)`, one B01, `constructionPass(w,[{slot,cell:CELL,bodyC:0.01,energyReserved:0.02,energyPerC:2}])`. Result: `Error: stage 8: film in cell 8256 missed the cap by -0.09999999999999998 — allocation defect`.
- **What the spec says:** SPEC §7.1, "stopping at 0.50 film C per cell". At or above the cap the builder should accept 0 and pay nothing. The tick should not stop.
- **Reachability today:** none. Only construction writes film, it pins, and no content patches film. A future recipe `fieldPatch` or an import could reach it.
- **Fix:** pin only when the snapshot film was below FILM_CAP. Otherwise leave the cell untouched.

### MINOR 2 — no test shows secretion seeing a construction reservation
- **The claim:** secretion checks energy remaining after earlier *reservations*.
- **Mutant:** in `src/sim/secretion.ts:52,57`, replace `ctx.remainingEnergy()` with `c.E[i]!`, so reservations are ignored.
- **Result:** construction, shared-budget and stage8-order (order / budget / construction describes) still pass: 19 passed, 4 skipped. Every builder test that puts a cost before secretion uses `spend`, which deducts E. None uses `requestConstruction`.
- **Shipped behaviour is correct.** This is a test gap only.
- **When it starts to matter:** a native B02 with E01 (E01 is eligible for B02, CT §7) reserves through BIOFILM (action ID 3) before E01. Today B02's energyPerC is 0, so no energy is reserved; the body-carbon side is reserved. Wave 2 should add a test with a construction reservation ahead of a producer.

### MINOR 3 — the PROPOSED two-producer `secretionCode` precedence is untested
- **Mutant:** at `src/sim/secretion.ts:93`, change `else if (c.secreting[i] !== 1)` to `else`.
- **Result:** every builder test passes.
- **Shipped impact:** none. No shipped organism has two producers.
- **Fix:** a test belongs with E09 (wave 4), or the proposed decision should say it is unproven until then.

### MINOR 4 — "slot order of equal requests" is checked only to toBeCloseTo for filmN
- **Where:** `tests/sim/construction.test.ts:176`, `expect(y.filmN).toBeCloseTo(x.filmN!, 15)`.
- **Why the tolerance is there:** filmN accumulates `filmN += dn` in slot order. Two donors with different N/B can therefore leave filmN differing by an ulp when their slots swap.
- **Determinism is not at risk:** slot order is itself deterministic.
- **But:** the claim "the result does not depend on the slot order" holds only up to an ulp, and only for filmN. Body B/N/E and film are exact.
- **Also:** the "snapshot" for movedN (`construction.ts:103`) is indistinguishable from reading live values today. I mutated it to compute dn from live B/N in the commit phase, and all tests still passed. The two only differ when one organism submits two requests, which the CT eligibility lists rule out today (no B02 can gain E10).

### Note (not the builder's defect) — the g2 fence cannot see the secreting branch
- **Confirmed independently.** At t900, every starch producer in both saves shows `secretionCode` 60 (SECRETION_ENERGY_LOW). Max E is 16.01 (native) and 6.45 (E01 carriers), against a 35 threshold.
- **Mutant:** emit `rules.emitRate * DT * 1.5` in `secretion.ts:59`.
- **Result:** all 9 g2-replay tests and both "from save" bit-identity tests PASS. Only the two from-tick-0 tests in `tests/sim/stage8-order.test.ts` fail.
- **So:** the builder's from-tick-0 comparison is the real guard. When the fixtures are next re-recorded, a g2 save taken while producers secrete would close this gap. That is for the lead.

### Note (not the builder's file) — energyBalance does not list `construction`
- `tests/fixtures/module-accounting.test.ts:62` `energyBalance` lists the energy categories by hand and omits `construction`, as the builder reported. It is harmless while no species builds.

## VERIFIED OK
- **Fence and regression list.** VERIFIED OK — g2-replay, trajectory fence, conservation, builder tests — I ran them:
  - Run 1: `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/trajectory-fence.test.ts tests/fixtures/conservation-closed-lid.test.ts tests/fixtures/shared-budget.test.ts tests/sim/construction.test.ts tests/sim/stage8-order.test.ts` → 6 files, 42 tests passed (250 s).
  - Run 2: `npx vitest run` over trajectory-fence-arms, trajectory-fence-current and trajectory-fence-current-arms, plus enzyme-source, module-accounting, dormancy, modules, movement-births-tick, determinism, lab-commands and deposit-bounds → 11 files, 110 tests passed (330 s).
  - Both runs used the working tree with the foundation's in-flight schema-4 edits.
- **Typecheck and lint.** VERIFIED OK — `npx tsc -p tsconfig.json --noEmit` reported no errors, and `npx eslint` on the 9 owned or shared files reported no problems.
- **Hash neutrality and bit-identity.** VERIFIED OK — secretion.ts:
  - It makes the same comparisons in the same order: `remainingEnergy() <= minEnergy`, then substrate, then cap, then `< cost`, then `E -= cost`, then `ledger.energy.secretion += cost`.
  - `remainingEnergy()` is `E − 0`, which is bit-exact.
  - `stageStructures` resets `secreting` and `FLAG.secreting`, runs dormancy, and skips non-Active organisms before `secretionCode` is written (structures.ts:66-73).
  - With a single producer, `producerRun` always writes the outcome, as g2 did.
  - The from-tick-0 tests kill a ×1.5 emit mutant, so the comparison is not vacuous.
- **Reservation order.** VERIFIED OK — actions.ts:
  - It sorts by tier rank (mandatory 0, native 1, module 2), then by ID. The native ID is `NativeAbility.options.indexOf`, and the module ID is its number.
  - Duplicates throw. The shipped table is frozen and checked at load to be in canonical order.
  - This matches SPEC §3.2 row 8, "mandatory transitions → native optional actions by action ID → E01…E17 ascending", and D04 §9, "mandatory transition costs; native optional actions in stable action-ID order; supplementary E01–E12 actions in ascending ID order".
  - The order tests register actions out of order, so they are non-vacuous.
- **Remaining energy and body.** VERIFIED OK — `remainingEnergy`/`remainingBody` subtract this organism's reservations. `begin()` resets them per organism. `spend` refuses more than remains. Nothing is retried or refunded.
- **C08 fixture.** VERIFIED OK — at E = 35.03, the first action sees 35.03 and the second sees `35.03 − 0.04` and gets ENERGY_LOW. Reversing the order refuses the other one. The change in E equals the change in Σ ledger categories excluding `earned`.
- **Shared construction.** VERIFIED OK against SPEC §9 E10 ("All builders read one snapshot; requests above headroom scale proportionally; commit together"; "cost 2 E per C actually transferred (reserved first)"), CT §12.6 (cap 0.50; E10 2 E/C) and D04 §9 ("reserve a maximum budget, undergo proportional allocation, then charge only actual accepted work. Return unused reservations before births").
  - Requests are sorted by cell, then slot, then submission order.
  - The read phase works from the snapshot (film, B, N).
  - headroom = max(0, 0.5 − film). When Σ exceeds headroom, every request in the cell is scaled.
  - N moves as N·a/B.
  - The builder is charged `energyPerC × accepted` into `ledger.energy.construction`.
  - Reservations are never deducted, so the unused part is returned implicitly.
- **Construction conservation.** VERIFIED OK — the move is internal (body to film). The pin's dust goes to `ledger.roundoff.c`, which follows the same sign convention as `subtractPool` (ledger.ts:219) and is part of the explained total (ledger.ts:180). The test checks `checkLedger` is ok and relative drift is under 1e-15.
- **Pass order.** VERIFIED OK — the transport hook `fungalTransportPass` (a no-op) runs after `constructionPass` and before stage 9 (structures.ts:78-79). The `releaseInvalidLinks` hook (a no-op) runs after dormancy for every living organism, consistent with SPEC §3.2 row 8 ("Dormancy transitions; … release invalid links/anchors; reserve and pay optional actions").
- **Determinism.** VERIFIED OK — the new or changed sim files contain no Math.random, Date, Map, Set, Object.keys or for-in. `TIER_RANK` is only indexed by key, never iterated. Sorts are total orders (index tiebreak). `ActionContext` is created per stage call and holds no persistent state.
- **Gating.** VERIFIED OK — construction depends on `world.fields.film` (from the world's manifest systems) and throws without it. It does not use a build constant. The tests use `registryWith({enabledSystems:[...shipped,'film']})`.
- **Shared files are additive.** VERIFIED OK:
  - `git diff src/sim/phenotype.ts` has no removed lines. It adds ProducerRules, BuilderRules, and Profile `oil`/`protein`/`builder` set to null.
  - `src/sim/constants.ts` only adds `FILM_CAP = 0.5`, matching CT §12.6 "cap 0.50 C/cell".
  - `moduleView.ts` has no diff.
  - BuilderRules comments match CT §12.6 (B02: E > 40, 0.05 B/s, stop at B0'; E10: E > 35, B > 1.2 B0', 2 E/C).
- **Ownership.** VERIFIED OK:
  - The structures.ts diff touches only lines 1-80, the stage-8 part. The Lab habitat-edit block is unchanged.
  - tick.ts, ledger.ts, reasons.ts, ui strings and content have no edits from this builder. The manifest diff (chemistry systems and materials) belongs to another wave-1 builder.
  - `ledger.energy.construction` exists, from the foundation.
  - No reason code was added.
- **Hash literals.** VERIFIED OK — the new tests contain none. The bit-identity test compares two worlds relationally (stateHash and serializeWorld equality).
- **Saves.** VERIFIED OK — the saved shape is unchanged by this builder. ActionContext and requests are transient, and the `construction` ledger field is the foundation's schema-4 work.
- **Builder's own mutation claims.** VERIFIED OK in part. The emit-rate mutant reproduced the builder's claim that only the from-tick-0 tests catch secreting-branch changes. I did not repeat the other mutants. Mine (MINOR 2, 3 and 4) show the gaps listed above.
