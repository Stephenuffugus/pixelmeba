# Wave 6b integration: the lead's items and the verifier's notes

Lead, 2026-10-12. Integration run `wf_67897fae-84f` gave the two fixers' reports (integrate-code-minors-6b.md, integrate-docs-a11y-6b.md). Its verifier was stopped at the overnight codespace stop. The lead then made items a–d (D-0090), and the verify-only run `wf_f5f03585-9db` checked the whole integration: integrate-verify1.md, **ok = true**, 0 BLOCKER/MAJOR, 3 MINOR, 3 NIT. The lead fixed all six; no repair round was needed.

## Lead items before the verifier (D-0090)

| Item | Change | Proof |
|---|---|---|
| a. Notebook cap | `NOTEBOOK_MAX_BYTES` 1 MiB → 2 MiB (src/persistence/notebook.ts). A wide case (story texts at the validator's bounds) was added to tests/persistence/bookmarks.test.ts "every kind at its limit". ARCH §11.2 updated. | The test prints and asserts the sizes; see the verifier notes below for the final numbers. |
| b. Two false sentences | CompareSetup.tsx: "Your own dish is never changed by it." ExperimentRun.tsx: "The experiment's dish is never changed by them." Both dropped "and your saves": completion autosaves Continue, and an experiment start may keep the open dish first. | Pinned in e2e (see NIT 1 below). |
| c. Challenge starting points | challengeSave shares a shelf baseline only with a challenge's own record (`challengeBaseline(c, true)`, createdFor 'ch-'), never a Try my dish 'try-<n>' one. | tests/worker/challenge-host.test.ts "D-0090: a challenge never shares a Try my dish starting point …". Mutant (sharing without ownOnly): fails with `expected [ 'try-1' ] to deeply equal [ 'ch-1', 'try-1' ]`. |
| d. Shelf refusal words | SHELF_REMOVE_REFUSED names challenge starting points too. | tests/persistence/shelf.test.ts asserts Try my dish, challenge and snapshot bookmark (9/9). |

## The verifier's notes (integrate-verify1.md) and what the lead did

1. **MINOR [lead] challengeStart kept depending on a Try my dish record.** This happened for saves from the pre-fix 6b build, and in new saves after the challenge's own record was removed. Fix: when Start finds only a non-'ch-' record holding the moment, it stores the challenge's own 'ch-' copy when the shelf has room (`shelf.check` first). With no room it starts from the Try my dish record as before. ARCH §7/§11.2 and D-0090 say so.
   - Test: tests/worker/challenge-host.test.ts "D-0090: when only a Try my dish record holds the moment … Start stores the challenge's own copy". The test removes 'ch-1', starts (a copy is written and used), removes 'try-1', and starts again from the copy.
   - Mutant (the copy branch disabled): fails with `expected undefined to match object { shelfKind: 'baseline', …(2) }`.
2. **MINOR [lead] ARCH §7 (lines ≈ 367) and §11.2 (≈ 725–736) were stale after D-0090.** Rewritten: Save shares only a challenge's own baseline; Start and Export look the moment up among all baselines; Start copies a Try my dish record; a removed challenge baseline falls back to another baseline holding the moment, else the open dish or the challenge file.
3. **MINOR [lead] the size test's assumption was false.** Nested families can each be followed, so each of the three followed families may hold AGENT_CAP members.
   - The test now builds that case. Measured: 1,285,268 (61.3 % of 2 MiB) with the generator's texts, 1,647,868 (78.6 %) wide. Both match the verifier's own measures.
   - The tripwire: what the app writes must stay under 70 % of the cap, and the wide case under the cap.
   - The comment in notebook.ts, ARCH §11.2 and D-0090 carry the numbers.
4. **NIT [lead] the two new sentences were unpinned.**
   - tests/e2e/compare.spec.ts (setup) and tests/e2e/experiments.spec.ts (setup) now assert the exact sentences.
   - Both also assert that "your saves" is absent from the screen.
5. **NIT [docs-a11y-6b] ARCH §11.2 said "shelf.ts unchanged".** It now says that writes are serialized per page and that SHELF_TEXT names both uses of a baseline.
6. **NIT [docs-a11y-6b] ARCH §7 named only the comparison copy** in the refusal of bookmarkDelete, galleryAdd and galleryDelete. It now also names the transient Continue copy (host.ts: `d.arm || d.transient`).

## Commands (lead)

- `npx vitest run tests/worker/challenge-host.test.ts -t D-0090`: 2 passed; each mutant above: 1 failed.
- `npx vitest run tests/persistence/bookmarks.test.ts -t "every kind at its limit"`: 1 passed (sizes above).
- `npx vitest run tests/persistence/shelf.test.ts`: 9 passed.
- `npx tsc -p tsconfig.json --noEmit` and `npx eslint` on the changed files: clean.
- Then `npm run check` and the desktop e2e project: results in the wave 6b commit message.
