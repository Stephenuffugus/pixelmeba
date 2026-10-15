# Wave 13 re-verify, round 1 (org-ui fixes)

Tree: 3daebb2 plus the uncommitted wave 13 work. Scratch work is in tmp/reverify1-g5-wave-13/. No tracked file was edited except this report.

## Problems

MINOR [org-ui] src/ui/strings/organisms.ts:101 / src/ui/strings/reasons.ts:109 — Still open, as reported. "It senses neighbors." shows whenever the sensed signal reaches 0.30, including signal from an M06 dose or the organism's own emission with no neighbour present. The wording is canonical: UX_SPEC.md:165 reads `| NEIGHBORS_DETECTED | "It senses neighbors." | "Signal {v} (threshold 0.30)." |`. Under CLAUDE.md's "record the concern, implement the canonical rule, flag it", this goes to the owner. The fixer's PROPOSED DECISION ("It senses glow signal.") appears only in org-ui-fix1.md. It is not yet in DECISIONS.md or EXPANSION_RESPONSE.md §8. NEEDS (lead): record it there at integration. — repro: grep shows the canonical row at UX_SPEC.md:165; tests/e2e/organismFixture.ts holds a single Lantern at sGlow 0.5.

MINOR [lead] src/render/picture.ts:256-276 — Still open, as reported. The dish picture has no grit (band 7) branch, so a picture of a dish with grit omits the glyph the live view draws (layers.ts:219 paintGrit). The file is outside org-ui's ownership. The fixer's NEEDS gives a concrete recipe (read band 7, include it in the skip, port paintGrit's specks gritPale #e9eef2 / gritEdge #45525c, add a byte-identical v1.0 test). This needs the lead or P5.8. No shipped dish can hold grit before the organism flip. — repro: `grep -n "grit\|7 \* CELL" src/render/picture.ts` finds nothing.

## Verified OK

VERIFIED OK — MAJOR [org-ui] stopAnswer "Holding on: ? of ? s" and duplicate key 42 — fixed.
- I re-ran the original repro (a copy of tmp/verify-g5-wave-13-1/stop.ts, saved as tmp/reverify1-g5-wave-13/stop.ts: a P10 pinned in contact with a P01 for 4 ticks) on the current tree.
- P10: stopAnswer has one item with code 42, detail "Holding on: 0.4 of 1.0 s of contact (resets if contact breaks).", then 28/29/31. Its codes are unique and no detail contains "?".
- P01 prey: CAPTURED_HANDLING (27) "Being caught by Needlejaw #1: 0.4 of 1.0 s ..." leads, and PRED_NO_PREY (38) is listed once, although it appears both as limitCode and as the predation code.
- When measured values are missing, reasons.ts falls back to "Holding on to its prey (resets if contact breaks)." and "Being caught (resets if contact breaks).", never "?".
- The other Phase 5 limit codes cannot reach a "?". The sim writes MODE_PHOTO/MODE_SUGAR as a limitCode with limitValue = the light (intake.ts:542-543). RIVAL_EXPOSURE and NEIGHBORS_DETECTED are never written as a limitCode (RIVAL_EXPOSURE is only a suitability reason, suitability.ts:128).

VERIFIED OK — the new MAJOR tests fail on the old behaviour.
- I made a load-time mutant: tmp/reverify1-g5-wave-13/mut/shortcuts.ts, which restores the old `items.push({ code: e.predation.code, ..., detail: reasonText(e.predation.code, 'lab') })`. A vitest resolveId plugin swaps it in (mut/vitest.config.ts).
- With the mutant, both new tests fail: "names a handler's attempt once" and "a real P10 mid-attempt". Each gives `expected 4 to be 5`, from the uniqueness check.
- On the real tree both pass.
- mutant -> failing tests: tests/ui/inspector-p5.test.ts:97 and :113.

VERIFIED OK — MINOR [org-ui] v1.0 inspector golden — fixed and independently confirmed.
- I extracted HEAD 3daebb2 with `git archive` into tmp/reverify1-g5-wave-13/head (src, tests/helpers, tests/fixtures, content, tools, art) and ran the generator from org-ui-fix1.md there.
- The decoded JSON is byte-identical to the committed tests/worker/inspect-p5-v1-golden.json (497,979 chars each, `a === b` true). It covers 5 dishes: FIRST_DISH_V1 with 71 organisms, PREDATOR_BALANCE_V1+5xP01 with 95, and the borrowed-shelter, fungal-supply-line and one-host-pinphage saves with 79, 4 and 37.
- The golden is genuinely HEAD's output, not circular.
- The current tree passes it: `vitest run tests/worker/inspect-p5.test.ts -t "HEAD code"` gave 2 passed (3.1 s and 1.6 s).

VERIFIED OK — v1.0 UI side effect of the dedupe (information for the lead).
- Before the fix, a lone hunting predator (limitCode PRED_NO_PREY and predation PRED_NO_PREY, no blockers) got two items under one React key. Its title read "A few things are slowing it down."
- It now gets one item, so the title is "Nothing to hunt nearby." (shortcuts.ts:242).
- This is a correction on a shipped screen. It touches the UI only (the payload golden holds). tests/ui/shortcuts.test.ts and tests/e2e/inspector.spec.ts (the fixer's run) still pass.
- Worth one line in DECISIONS.md at integration.

VERIFIED OK — e2e assertion (read, not run): organisms-p5.spec.ts:115-118 checks, in Lab, that why-stop contains the measured line, contains no "?", and has exactly one "Holding on to its prey." li. The old code would fail both the not-"?" check and the count. I did not run the browser: I suspected no UI problem the unit tests miss. Port 4394 was not used.

VERIFIED OK — fence — `npx vitest run tests/fixtures/g2-replay.test.ts tests/fixtures/rc1-replay.test.ts tests/fixtures/trajectory-fence tests/fixtures/conservation-closed-lid.test.ts` gave 8 files and 64 tests passed, exit 0. The round-1 fix touches no sim file.

VERIFIED OK — touched units — `npx vitest run tests/ui tests/worker/inspect-p5.test.ts tests/worker/cue3-org.test.ts tests/worker/protocol3-v1-equivalence.test.ts tests/sim/module-visuals.test.ts` gave 46 files and 365 tests passed, exit 0.

VERIFIED OK — typecheck and lint.
- `npx tsc -p tsconfig.json --noEmit`: exit 0.
- `npx eslint` on src/ui/strings/shortcuts.ts, src/ui/strings/reasons.ts, tests/ui/inspector-p5.test.ts, tests/worker/inspect-p5.test.ts and tests/e2e/organisms-p5.spec.ts: exit 0.

VERIFIED OK — ownership — the round-1 changes are confined to org-ui's files: shortcuts.ts, reasons.ts, its own tests, the new golden JSON and its report. No sim, content, manifest or protocol-version change.
