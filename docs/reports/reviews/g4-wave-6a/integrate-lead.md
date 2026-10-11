# g4 wave 6a integration — the lead's own fixes (2026-10-11)

After `integrate-verify1.md` (ok, no BLOCKER/MAJOR), the lead fixed the MINOR and two of the three NITs.

1. **The map intro no longer says one species "ate" another** (verifier MINOR, `src/ui/strings/observe.ts:63`).
   - An 'eats' arrow always ends at a food pool (relationships.ts records it as species → pool), and the intro's
     last clause already says "which fed from a food pool". The first list now reads "which species caught,
     infected, attached to, burst or drained another".
   - No test pins the intro text (it is copy); D-0085 now quotes it.
2. **A unit test proves the global error toast skips import refusals** (verifier NIT, `tests/ui/share.test.ts`).
   - The global toast runs synchronously inside the client's `receive`. importFile's catch runs a microtask
     later. Both say the same words, so the test now checks that `toast.value` is still null right after the
     worker's error arrives, and only then awaits the one toast.
   - Mutant: with 'importDish' and 'recipeImport' removed from the skip list in `src/ui/state.ts`, the test fails
     ("the global error toast skips importDish: expected 'Import failed: …' to be null"). The file was restored
     and checked with `cmp`.
3. **ARCH wording** (verifier NIT).
   - §7: only a RecipeFileError refusal carries a kind. A `recipeImport` with a new dish id already in use goes
     through the generic catch with no kind.
   - §11.2: the refusal list now names every case: not a recipe file, not valid JSON, larger than 25 MB, a
     compatible-build message (or "This recipe file needs a newer version of Pixelmeba."), or a damaged/checksum
     message.
4. **The wip branch** (verifier NIT, no file). `wip/g4-wave-6a` moved on because the 30-minute backup loop wrote a
   new snapshot. That is its job; d5a0c32 stays reachable by hash. No change.
5. **Decisions**: D-0083 gains the toast details (the reason's closing sentence is dropped; the global toast skips
   both import requests; refusals to keep the open dish keep their own sheet). D-0084 gains the full "kept" rule
   as built (any accepted change to what the slot file holds; no-ops keep the slot; a tryNext refused 'unsaved'
   clears it). D-0085 quotes the intro.

## Evidence

- `npx tsc -p tsconfig.json --noEmit`: clean. `npx eslint src/ui/strings/observe.ts tests/ui/share.test.ts`: clean.
- `npx vitest run tests/ui/share.test.ts`: 9 passed (9).
- `npm run check` and the desktop e2e of the touched journeys are in the commit message.
