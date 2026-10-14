# Wave 12 task writer (run wf_f5b989a5-62e) — final message

The task file is written and parses. Its header table gives every file exactly one owner. 12 lead placeholders are left, all about what wave 11 and the systems flip actually built. One finding needs your attention before launch: after the flip, the import refuses this wave's own round-trip saves unless tests mock the implemented list (contradiction 9). I also argued against one of your calls: A04's mode is set at its first stage 4, not at inoculation, so `commands.ts` has no owner this wave.

**Parse output**
```
e2-light-algae 4271 1 own 22745
e3-predation 4272 1 own 20931
structures-art-audio 4273 1 false 16315
```
File: /workspaces/pixelmeba/docs/agent/g5-wave-12.tasks.js.txt (STATE is 7,765 characters). I edited no other file.

**Stage and ownership (one stage of three; nothing forces a second stage)**
| Task | Port | Critical | New files | Owns |
|---|---|---|---|---|
| e2-light-algae | 4271 | 'own' | src/sim/mixotrophy.ts; tests/fixtures/{low-light,mixotrophy,canopy-a05}, tests/sim/{mode-saves,algae-determinism,predation-hooks}, tests/worker/cue3-mode | intake.ts, movement.ts, births.ts, species.ts (`lowLight` only), events.ts (3 members, item 0), constants.ts (item 0, both tasks' constants) |
| e3-predation | 4272 | 'own' | src/sim/handling.ts; tests/fixtures/{radius-capture,handling,detritus-fallback,predators-p5}, tests/sim/{handling-saves,predation-determinism}, tests/persistence/handling-import | contacts.ts, phenotype.ts (`debrisFeeder` for DETRITUS_FALLBACK only), debrisFeeder.ts (doc), phase5State.ts (handling-progress refusals only) |
| structures-art-audio | 4273 | no (no saved or hashed state; the atlas is outside contentHash) | src/render/gateBadges.ts; tests/render/gate-badges, tests/content/structure-silhouettes, tests/ui/{structure-icons,material-swatches}, tests/audio/{gate-click,wake-native}, tests/e2e/structures-art.spec.ts | art/src/tiles/structures.ts, palette.ts, public/atlas/*, structureLayer.ts, renderer.ts (badge layer), layers.ts (colours), LabTrayIcons.tsx, GateSheet.tsx (pips and cue), strings/lab.ts, styles.css, patches.ts, cues.ts, contrast-audit.ts |

- e2-light-algae writes three hooks for e3-predation in its own files: H1 in movement.ts (no re-acquiring a target while `handlingNeed > 0`), H2 in births.ts (division ends an open handling attempt), H3 in intake.ts (the PRED_HANDLING_IN_PROGRESS reason).
- These files have no owner this wave: transport.ts, actions.ts, suitability.ts, chemistry.ts, commands.ts, content/schema.ts, recipes.ts, protocol.ts, snapshot.ts and art/src/index.ts.
- Verifiers: `verifyGroups` = [['e2-light-algae','e3-predation'], ['structures-art-audio']] on ports 4390 and 4391; saves verifiers on 4396 and 4397; re-verify on 4394; 4398 free; 4290 never used.

**PROPOSED DECISIONs**
- PROPOSED DECISION: one stage of three. movement.ts, intake.ts and births.ts go to e2-light-algae, with H1–H3 written by it to an exact spec. contacts.ts and phenotype.ts go to e3-predation. events.ts and constants.ts go to e2-light-algae, which adds them first, as item 0.
- PROPOSED DECISION (against your call, with evidence): A04's mode is set at its first stage 4, not at inoculation.
  - The climate.ts header at HEAD (lines 20–28) says the hash stays safe only because "stage 1 reads no light".
  - After a reload, light is recomputed from the current A05 canopy biomass (D-0113, D-0116). A stage-1 read could then pick a different mode in the 0.25–0.35 band.
  - So commands.ts has no owner. Tick-0 founders keep mode 0, which the import already accepts. A reload test proves the choice.
- PROPOSED DECISION: the mode updates for every living A04 right after suitability, before the life-state overrides (SPEC §3.2 row 4). Thresholds are inclusive with no tolerance. A newborn gets the hysteresis rule applied to the parent's mode in its own cell. `modeSwitch` fires only on a real switch, not at birth or at the first setting.
- PROPOSED DECISION: an A04 shows MODE_PHOTO or MODE_SUGAR (with the light as its value) when no limit binds. A03 uses `SpeciesRT.lowLight`, with E06's access-base treatment.
- PROPOSED DECISION: the handling attempt.
  - An attempt is continuous contact with one target. Per D04 line 155, c is kept until contact breaks.
  - The start tick counts as contact, so capture lands on contact tick 10 (1 s), 40 (P05) or 25 (c = 0.5).
  - A break sets need and progress to 0 together, and no new attempt starts that tick.
  - A completing attempt joins the ordinary claim pool under the same det priority (KIND_ATTACK). Losers end their attempt as 'taken'. No new RNG stream or contact KIND.
- PROPOSED DECISION: division ends an open attempt (`handlingBreak` why 'division'); preySlot is kept as v1.0 keeps it.
- PROPOSED DECISION: new events `modeSwitch`, `handlingStart` and `handlingBreak` stay in the event ring only. A handled capture's event gains `detail.handled`.
- PROPOSED DECISION: P06 captures within a fixed 1.0 Euclidean distance, inclusive. It does not use `prof.sensing` (CT §6.2) and does not need FLAG.attached (D-0115). The existing pairPermitted check stays.
- PROPOSED DECISION: P09's DETRITUS_FALLBACK is one phenotype line that sends it down E08's detritus route. The amount equals HEAD's field-route amount; only the route and its cue change.
- PROPOSED DECISION: three new import refusals for handling progress: progress without HANDLING, progress without an attempt, and progress ≥ need. No new rule for metabolic mode, because a tick-0 game save holds mode 0.
- PROPOSED DECISION: a held predator's contact captures need no code, only a test.
- PROPOSED DECISION: the prey's "Being caught." (CAPTURED_HANDLING) moves to wave 13's org-ui.
- PROPOSED DECISION: the founder-chain validator moves to wave 14 p5.4a, which owns registry.ts and recipes.ts. No shipped recipe has structures before then.
- PROPOSED DECISION: region pins move to wave 14 p5.4b. No habitat regions exist before p5.4a.
- PROPOSED DECISION: gate badges are a 7-pip strip computed from `edgeFactor` / `edgePermits`, drawn per straight run at 'close' zoom plus beside the selected gate, static. The gate sheet shows the same pips.
- PROPOSED DECISION: `gate_click` is a UI cue, played once per "Show gate" and once per accepted shutter toggle, never by the tracer.
- PROPOSED DECISION: round-trip tests mock `@sim/content/implemented` (the pattern at tests/helpers/registry.test.ts:17), appending only their own task's abilities.
- PROPOSED DECISION: V02 glyph polish is not in this wave.

**Placeholders left (12)**
- STATE: wave 11 as built; systems flip as built; post-flip contentHash; post-flip systems and structures lists; this wave's D-number.
- Header: the import's unimplemented-ability check (symbol, sentence, whether IMPLEMENTED_SYSTEMS includes 'silicate', how glow-saves got E02 through); the flip's two fence-dish test files.
- e2-light-algae: line numbers for events.ts, the births.ts glow reset, `rivalTarget`, and the cue3Of mode constants; whether 'climate' is now shipped.
- e3-predation: phenotype.ts's `debrisFeeder` line and Profile shape; CUE3_HANDLING and CUE3_HELD as built.
- structures-art-audio: the device tile frames, structureLayer.ts exports, `setGatePreview`, GateSheet and LabTrayIcons as built, the atlas pins; the post-flip manifest; resterRegistry's form after the flip.
- Check: `grep -n "<lead: " docs/agent/g5-wave-12.tasks.js.txt | grep -v "as built — …>"` must print nothing (prints 12 now).

**Contradictions between the tree and the plan, briefs or BUILD_DIRECTIVE**
1. The briefs give movement.ts to both E2-LIGHT-ALGAE and E3-PREDATION, and phenotype.ts to SIGNALS, PREDATION and JACKET. Resolved by the table above.
2. Your call puts mode setting in commands.ts, which breaks climate.ts's documented "stage 1 reads no light" invariant. Ruled above.
3. P09's content `foodPriority` is ["detritus"], so at HEAD it already eats detritus through the field route. DETRITUS_FALLBACK only changes the route and its label.
4. D-0112 says handling progress "can return to 0 mid-attempt", while D04 155 says a break ends the attempt and a new one resamples c. I followed D04; the handling-arc frame rule still works.
5. The briefs name src/ui/icons.tsx and src/render/regionPins.ts. The tree uses src/ui/panels/LabTrayIcons.tsx, and region pins move to wave 14.
6. P06's JSON has `sensingRadius` 1, but CT §6.2 says its sensing is inactive. The capture radius is a constant.
7. After the flip, the shipped manifest already has 'barriers', 'climate' and 'devices'. `barrierRegistry()` and `resterRegistry()` append them again; the flip must settle this.
8. snapshot.ts `sugarSourcesOf` leaves out A04, although a Photo-mode A04 releases sugar. Noted for wave 13.
9. The flip's item 2a closes the import gap, so wave 12's round-trip tests are refused without the implemented-list mock. The plan's round-trip carry-over assumed a test-registry dish would load.
10. The runner's built-in text tells builders to "add the native abilities you implement to implemented.ts". STATE and the prompts override it, as wave 10 did.

**Builder-hour estimates (2 shared cores):** e2-light-algae 2–2.5 h; e3-predation 2–2.5 h; structures-art-audio about 2 h, including two-project e2e. That is about 4.5 h of wall time with two agents running, plus verification.
