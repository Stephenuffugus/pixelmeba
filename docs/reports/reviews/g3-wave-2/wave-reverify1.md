# g3 wave 2: re-verification 1 (parasites-phage round-1 fixes)

I found no BLOCKER, MAJOR or MINOR problems. All 7 problems from the earlier verification are fixed, and nothing regressed. ok = true.

Scratch files are in `tmp/reverify1-g3-wave-2/`:
- `import.test.ts`: the verifier's import probes, plus the bad-virus-code repro (infectedBy 7 with the timer at 19.95).
- `vitest.mut.config.ts`: a resolveId plugin that swaps in a mutant module at load time.
- `mut/`: the mutants. No tracked file was edited.

## Findings

(none)

## VERIFIED OK

- **VERIFIED OK — MAJOR [parasites-phage] saveFile.ts: unknown infectedBy codes are now refused.**
  - `hostParasiteProblem` refuses a code where `virusIdOfCode(code)` is null, or whose virus is not in the dish's species. The species list is already checked against the manifest, so "in the dish" means "enabled".
  - Original repro against the current tree:
    - infectedBy 2 and 255 on a B01: "REFUSED: An organism is infected by a virus this dish does not have. Nothing was loaded."
    - infectedBy 7 with the timer at 19.95: the same refusal. Before the fix, `step` threw in `lyse`.
    - Control: infectedBy 1 with the timer at 19.95 loads and runs.
  - Mutant M1 (the unknown-code check removed): phage.test.ts "the import refuses a virus code this build does not simulate" fails.

- **VERIFIED OK — MINOR [parasites-phage] saveFile.ts: codes 2..255 in a viruses world.** This was a duplicate of the MAJOR. The same evidence applies.

- **VERIFIED OK — MINOR [parasites-phage] saveFile.ts: infectedBy 1 on a non-host is refused.**
  - On A01 and on X01 the probe gives "REFUSED: An organism is infected by Pinphage, which cannot infect it. Nothing was loaded."
  - Mutant M2 (the hostIds check off): phage.test.ts "the import refuses an infection of a species V01 does not list in hostIds" fails.

- **VERIFIED OK — MINOR [parasites-phage] saveFile.ts: a timer on an uninfected organism is refused.**
  - infectionTimer 5 with infectedBy 0 gives "REFUSED: An infection timer is set on an organism that is not infected. Nothing was loaded."
  - Mutant M3: phage.test.ts "the import refuses an infection timer on an organism that is not infected" fails.
  - This cannot refuse a save the game produced itself:
    - Only `viruses.ts` writes `infectionTimer`. It sets it to 0 at infection and advances it only while infectedBy ≠ 0.
    - `EntityStore.clearSlot` (entities.ts:290) resets every column when a slot is allocated or freed.
  - An untouched save loads and runs 300 ticks.

- **VERIFIED OK — MINOR [parasites-phage] saveFile.ts:332/374: the generic messages now end "Nothing was loaded."**
  - A NaN timer gives "Entity column infectionTimer has a non-finite value. Nothing was loaded."
  - A stale hostBirthId gives "A host link points at an organism that is not there. Nothing was loaded."
  - Mutant M5 (the old message text) makes both of these fail:
    - phage.test.ts "…negative or non-finite infection timer"
    - parasite.test.ts "the import refuses a pair that is not mutual…"
  - The prey-link message changed as well. No other test pins either message: grep over `tests/` finds only these two files.

- **VERIFIED OK — MINOR [parasites-phage] Inspector.tsx / parasites.ts:439: the Lab drain line is now measured.**
  - `parasiteInfo.rate` is the parasite's `intakeLastSecond`. `commitHostDrains` (parasites.ts:379) is a parasite's only `intakeAccum` source; it adds the full drained C after the free-nutrient limit L and the host-B cap. `publish.ts` rolls that into `intakeLastSecond` once per second.
  - Mutant M4 (rate set back to `def.drainRate`): parasite.test.ts "the inspector reports the measured drain of the last second" fails.

- **VERIFIED OK — MINOR [parasites-phage] Inspector.tsx: INFECTED and PARASITIZED follow the view.**
  - Both lines now call `reasonText(R.INFECTED / R.PARASITIZED, dishView.value, …)`.
  - Explore strings (reasons.ts:52-53) match UX_SPEC.md:148-149 word for word: "It's infected and can't split." and "Something is attached to it."
  - Lab strings match "Infected by {virus}; lysis in {t}s." and "{parasite} draining {rate} C/s."
  - Importing `dishView` from `views/LabView` adds no cycle through Inspector (`madge --circular` on Inspector.tsx lists no cycle that contains it).
  - The withdrawn proposed decision exists only in the build report. It is not in DECISIONS.md.
  - The e2e Explore assertion (phage.spec.ts:80-88) is sound. I did not re-run Playwright because I found no UI problem to prove.

- **VERIFIED OK — fences and fixtures.** I ran these with `npx vitest run … --maxWorkers=2`: **11 files, 99 tests passed.**
  - `tests/fixtures/g2-replay.test.ts`
  - the four `tests/fixtures/trajectory-fence*` files
  - `tests/fixtures/conservation-closed-lid.test.ts`
  - `host-specificity`, `parasite` and `phage` fixtures
  - `tests/worker/protocol.test.ts`
  - `tests/ui/reasons.test.ts`

- **VERIFIED OK — no regression in persistence.**
  - `tests/persistence/*`, `tests/sim/world-stores.test.ts` and `tests/fixtures/registry-imports.test.ts`: 6 files, 49 tests passed.
  - `npx tsc -p tsconfig.json --noEmit` is clean.
  - eslint on the 8 files the fixer touched is clean.

- **VERIFIED OK — other import probes still behave.**
  - An X01 attached to itself is refused ("A Hitcher is attached to an organism it cannot live on. Nothing was loaded.").
  - A negative timer is refused.
  - A forged V01 entity is refused ("genome belongs to another species").
  - infectedBy 1 with infectionTimer 1e300 on a B01 loads and lyses on the next tick. That state is legal and harmless.
