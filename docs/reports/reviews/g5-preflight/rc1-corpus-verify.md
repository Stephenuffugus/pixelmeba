# rc1-corpus verification (Phase 5 preflight)

Run `wf_f5c6143d-dbc`, saves/determinism lens, effort high. Saved by the lead from the run journal.

**Verdict: ok.** I could not refute that the corpus does its job. I found two minor defects and two nits.

(1) Nothing under src/, content/, public/ or tests/fixtures/saves/ (the g2 corpus) changed. Some docs/ files are modified: docs/DECISIONS.md (D-0101…D-0106 drafts), docs/agent/RESUME.md, docs/agent/g5-plan.md (it changed while I was verifying) and tools/lead/build-run-file.py. These are the lead's own in-progress edits: RESUME says so, and DECISIONS.md was modified at 11:13, before the builder's files. None of them is the builder's.

(2) I decoded every save with gunzip and loadSaveFile myself. All five are schema 4, contentHash d3fbd36c, buildPhase 4.
- first-dish-diverse-notebook-t3000: accelerated/diverse; carriers E01 10, E05 2, E06 59, E10 2, E12 2; X01 41 alive, 39 attached. Notebook: 2 active nicknamed favorites, 10 stories (1 seen), SEE_SPRINTER_SPLIT completed and KEEP_SPRINTERS_GOING running, 1 bookmark, 1 gallery specimen.
- lab-food-sample-held-t1500: 7 rc1:lab-* commands in the log plus sampleTake. Pellet sugar 7.6 of 10; wafer starch 4.56 of 6 and protein 3.04 of 4. Salt 9.88, acid 3.20, buffer 4.00. 197 gel cells, 35 wall cells. A Sample is held: 33 rows, 29 cells.
- borrowed-shelter: 20 B02 and 20 E10 carriers; film over 717 cells.
- fungal-supply-line: 4 F02, all linked, 6 link ends.
- one-host: 11 living B01 infected, 19 lysed by DEATH_LYSIS.

(3) rc1-replay passes, 6/6 tests in about 22 s (heavy cases 1.5–7 s against a 600 s timeout). Values go through loadSaveFile (measureRc1Save), not a direct deserialize. The 'full' digest mode covers state added after g2. Cancel through cancelSample is the same world change the host's sampleCancel makes. g2-replay passes 9/9 (36 s).

(4) Determinism: I ran make-rc1-saves twice from scratch, in a copy of the repo under the scratchpad. Both runs were byte-identical to each other and to the committed files (7/7 sha256 equal). The only timestamp in the files is the fixed savedAt.
- Guard, with buildPhase 5 / contentVersion 3: --force is refused (exit 2) and plain verify gives 7/7 unchanged.
- Guard, with rc1 stamps but a changed enabled list and rc1-manifest.json present: --force is refused (exit 2).
- Guard, with the changed list and no rc1-manifest.json: the run throws on the content-hash mismatch.
- Guard, with a wrong contentHash: the run refuses.

(5) fence-update tests pass (19/19 together with rc1-replay). --rc1 refuses a missing, unknown or bump-less reason with exit 2 and leaves every file byte-identical. It records changedBy and never touches fence.json.

(6) The corpus is 2.47 MB in total. tsc --noEmit exits 0, and eslint on the 5 changed files exits 0. vitest's include pattern covers tests/fixtures/*.test.ts, so npm run check will run the fence.

I edited no files. The scratch copy has been removed.

## Findings and lead disposition

### MINOR — tools/fence-update.ts

**Claim.** The --rc1 rule accepts any decision that only mentions the corpus path. A decision that says the rc1 corpus is NOT re-recorded still passes the 'names the re-record' check, so it can authorize a re-record.

**Evidence.** RC1_RECORD.named = /fence-update(?:\.ts)?\s+--rc1\b|\bsaves-rc1\b/. I ran rc1DecisionProblem('D-0105', 'Decision: content/manifest.json contentVersion 2 → 3.\nEvidence: rc1-replay passes; tests/fixtures/saves-rc1/ unchanged (no re-record).', {..rc1, contentVersion: 3}, rc1) and it returned null (accepted). This is likely in practice: D-0105 (the drafted manifest bump decision, contentVersion 2 → 3) has a MANIFEST_BUMP_EVIDENCE placeholder that will naturally cite the rc1 corpus as unchanged. `fence-update --rc1 --reason D-0105` would then silently re-record the v1.0 save values under a decision that says the opposite. The g2 rule has the same mention-based shape (g2Digest), but a path name is far more likely to appear in an evidence line than a field name.

**Fix.** Require an explicit re-record statement, e.g. only the literal 'fence-update --rc1' / 'fence-update.ts --rc1' (drop the bare \bsaves-rc1\b alternative), or a phrase like 're-records … saves-rc1'. Add a refusal test with a decision that mentions saves-rc1 only as unchanged.

**Lead.** fixed: the rule now requires the literal "fence-update --rc1"; a refusal test covers a decision that names saves-rc1 only as unchanged.

### MINOR — tests/fixtures/rc1-replay.test.ts

**Claim.** The 'Phase 3 module carrier' check counts E05, which is a Phase 2 module. The check would pass on a world with no Phase 3 module at all, and the report mislabels E05 as Phase 3.

**Evidence.** content/modules/E05.json has "phase": 2 (E06, E07, E10 and E12 are phase 3). HOLDS for first-dish-diverse-notebook-t3000 counts modules in ['E05','E06','E07']. tools/make-rc1-saves.ts computes phase3Carriers = E05+E06+E07. The build report says 'Phase 3 module carriers: E05 2, E06 59'. The save does hold real Phase 3 carriers (E06 59, E10 2, E12 2), so the corpus itself is fine; only the guard and the label are weaker than intended.

**Fix.** Derive the Phase 3 set from content (module phase >= 3) or list ['E06','E07','E10','E12'] in both HOLDS and the generator's facts. Correct the report's wording.

**Lead.** fixed: HOLDS and the generator count E06, E07, E10 and E12 (phase 3 in content/modules); the generator re-run reports every file unchanged; the build report is corrected.

### NIT — docs/reports/reviews/g5-preflight/rc1-corpus-build.md

**Claim.** The builder's final summary names only fungal-supply-line as the save without a notebook. one-host-pinphage-t300 has none either.

**Evidence.** Decoded: one-host-pinphage-t300 has no notebook key in the file, and expected.json records notebookChecksum null for it. The report's table says 'No notebook' for it, but the summary text does not.

**Fix.** Say that two saves (fungal-supply-line and one-host-pinphage) cover the no-notebook case.

**Lead.** fixed in the build report.

### NIT — tests/tools/fence-update.test.ts

**Claim.** No test runs a successful --rc1 re-record (main() measuring the saves and writing expected.json). Only recordRc1Expected is unit-tested, and the refusals are tested through main().

**Evidence.** main([...]) is called with exit 0 only for --recipe and --add. The --g2 success path is equally untested, and content/manifest.json is read from CONTENT_DIR with no override, so a success test cannot be written until the manifest bump lands.

**Fix.** After the Phase 5 manifest bump, add a test that runs --rc1 under a temporary decisions file and a copied expected.json, and asserts the result is byte-identical (no changedBy).

**Lead.** deferred: a successful --rc1 re-record test needs a decision file and a landed bump; added to wave 8a LEAD AFTER.

