# g3 wave 3 — f02-links build report (P3.6 part 2: F02 Cordweaver, transport links, E212)

## Checklist

### Build
- DONE: **Links at branching.** The F02 parent and daughter get a LINK_TRANSPORT link (F01 keeps LINK_VISUAL), but only when both have degree < 4. Otherwise the daughter is placed unlinked, the 'birth' detail carries `{link: 'degree'}` and lineage is unchanged.
  - Code: src/sim/fungi.ts:84 `branchLinkRefused`, src/sim/fungi.ts:93 `joinBranch` (emits 'linkFormed'), src/sim/births.ts:191-194, and the `birthDetail` parameter on commitDivision.
  - Tests: tests/sim/fungal-links.test.ts:77 (F02 transport and F01 visual, four-neighbour cell, one event) and :98 (degree, unlinked daughter, lineage parent).
- DONE: **Undirected links, degree ≤ 4, and links break on removal.**
  - removeAllLinks already existed. It now emits one 'linkBroken' event per valid fungal link, with detail {kind: 'fungal', link: 'transport'|'visual', partner}: src/sim/links.ts:271-279. See the ownership note below.
  - Tests: fungal-links:127 (death), :145 (capture), :180 (each tick, links formed and broken equal that tick's events).
  - Event types: src/sim/events.ts:31. tsc needed no feed case, because the feed reads VisualEvent, not EventType.
- DONE: **Only living F02 transport links carry anything.** Both ends must be alive, the reference valid, and Active, and both must be of a TRANSPORT_LINKS species (fungalTransport.ts, edge scan).
  - Tests: fungal-transport.test.ts:314 (crossing threads and an adhesion link carry nothing), :357 (an F01 visual link moves nothing), :366 (a transport-kind link between B01 moves nothing).
- DONE: **Transport pass.** src/sim/fungalTransport.ts:220 `fungalTransport`, called once from src/sim/structures.ts:55 (`fungalTransportPass` body) after constructionPass and before births. The order is:
  1. Canonical edge order (lower slot first, then partner slot ascending).
  2. One snapshot of B, N and the phenotype b0 (B0').
  3. Donor = the end with more B (equal: no flow). Active iff B_d > B0'_d, B_r < 1.5 B0'_r and B_d − B_r ≥ 0.01 B0'_r.
  4. Request r = min(0.02·dt, ½ diff).
  5. Donor cap (:286), then receiver cap (:293). No re-offer.
  6. Commit together (:296) with N = N_d·r/B_d from the snapshot. No energy moves and the ledger is untouched.
- DONE: **The pass acts only where transport links exist.** It returns before touching anything when no species has TRANSPORT_LINKS, and it finds no edges otherwise. The fence values are unchanged (see the commands below).
- DONE: **Shared files.**
  - Manifest: enabledSpecies += F02, then `content-validate --write`.
  - implemented.ts: += TRANSPORT_LINKS.
  - world.ts:143/207: `fungalFlow: FungalFlowObs | null`. It is observation only (per-slot sent/received carbon over a 10-bucket per-second ring, plus partners and lastTick), owned by birthId, so it clears on death, division or slot reuse. It is never hashed or saved, and is registered in tests/helpers/trajectory.ts:207 POST_G2_DERIVED_KEYS.
  - history.ts:41/91/140/537/572: the optional sample field `fungalTransfer` is validated in sampleProblem and summed by summarize (it is a flow). An optional `History.pendingFungalTransfer` is validated in historyProblem.
  - publish.ts:51-66: writes `fungalTransfer` on every sample of a dish whose species form transport links.
  - snapshot.ts:198: sets LINKMASK_TRANSFER when the segment sent or received during the last 10 ticks.
  - snapshot.ts:473 and protocol.ts:549: optional `EntityInspect.transfer`.
  - Inspector.tsx:125 `transferText`, :529: a 16 px `inspector-line`, for example "Sent 0.130 carbon to 1 linked segment in the last 10 s. Received …", or "No carbon moved along its links in the last 10 s.".

### Done when
- DONE: **E212 oracle.** tests/fixtures/fungal-transport.test.ts:154. For 100 ticks, the per-edge carbon and N (derived from chain deltas between stage 7 and stage 8) and every pool equal an oracle written from SPEC §7.7 alone (no sim imports) to 1e-12.
- DONE: **Conservation and energy.** :178: Σ B and Σ N are constant every tick to 1e-12, checkLedger is ok every tick, and inputs and exports stay zero. :193: energy is bit-equal to an unlinked copy every tick.
- DONE: **No relay on tick 1.** :205: segment 3 (and 2) receive nothing on tick 1. :213: the dedicated single-snapshot test.
- DONE: **Caps.** :229: the star donor's 4 × 0.002 is scaled to 0.005 and the donor never goes below B0' over 50 ticks. :253: the receiver with 4 donors ends at exactly 3.0 and never goes above it.
- DONE: **Kill mid-run and degree.** :274: segment 2 is killed in stage 7 of tick 50 → 2 linkBroken events, no flow to 3, and segment 1 receives exactly the oracle's 0–1 amount. A 5th link is refused.
- DONE: **Save and determinism.** :299: save at t50, load → same hash, and the same hash at t100. 1× equals 4 × 25-tick runs.
- DONE: **tests/sim/fungal-links.test.ts.** It covers:
  - formation (both kinds) and the degree-refused unlinked daughter;
  - death and capture removal with one event per link;
  - a 1,500-tick growing F02 + F01 network on sugar, with linksValid after every tick and events equal to link-set diffs keyed by entityId (≥ 5 births);
  - :221 save → load mid-second with live transport links, fungalTransfer samples and the pending accumulator; equal hash and equal history after +25 ticks;
  - :245 a malformed fungalTransfer is refused by historyProblem.
- DONE: **tests/e2e/cordweaver.spec.ts (desktop).** New Dish → Empty Gel Colony → Lab → Life → Cordweaver on gel (30,90) → 4× until "2 alive" (about 110 s of dish time) → tap the original segment. The test asserts the network line "Cordweaver: 2 segments in 1 separate thread; this one has 2 segments.", the transport line's format, transport text ≥ 16 px, and axe clean at each step. No new interactive controls, so there are no new touch targets.
  - Note: at the first branch both halves hold about 2.0 B, so the line truthfully reads "No carbon moved…". Real transfer first happens around 290 s of dish time, after the second branch (probe: 0.13 C sent). The regex accepts both forms.
- DONE: **Non-vacuity.** Each mutant was applied to fungalTransport.ts in place, the file was run, and the original was restored (`cmp` identical):
  - Donor cap removed: only "a star donor … (donor cap)" fails.
  - Receiver cap removed: only "a receiver with four donors … (receiver cap)" fails.
  - Live reads with edge-by-edge commits (no snapshot): fails the oracle test, "received carbon relays only on later ticks (one snapshot…)", both cap tests and the observation test.
- DONE: **Fence unchanged.** All four trajectory-fence files and g2-replay pass.

## Files
- **Created:** src/sim/fungalTransport.ts, tests/fixtures/fungal-transport.test.ts, tests/sim/fungal-links.test.ts, tests/e2e/cordweaver.spec.ts, and this report.
- **Changed (owned):** src/sim/births.ts, src/sim/fungi.ts.
- **Changed (shared, additive):** content/manifest.json (+F02 and contentHash), src/sim/content/implemented.ts, src/sim/structures.ts (fungalTransportPass body plus import), src/sim/world.ts, src/sim/events.ts, src/sim/history.ts, src/sim/publish.ts, src/worker/snapshot.ts, src/worker/protocol.ts, src/ui/panels/Inspector.tsx, tests/helpers/trajectory.ts.
- **OUTSIDE MY LIST:** src/sim/links.ts gained the linkBroken emission inside `removeAllLinks` (an `emit` import and one loop before the fungal removal). removeAllLinks is the single choke point for every removal path (killEntity, consumePrey, later sampling), and its call sites belong to mod-adhesion (maintenance.ts, contacts.ts). No builder owns links.ts this wave. Without this change, "one event per link change" could not hold on death or capture. The lead may move the loop elsewhere. Events are not hashed (nextEventId is excluded from the digest), so there is no fence effect.

## Commands and results
- `npx tsc -p tsconfig.json --noEmit` → exit 0.
- `npx eslint` on every touched file → exit 0.
- `npx tsx tools/content-validate.ts --write` → "content ok · contentHash a9072927… · species 38 (enabled 19) … atlas … complete for 19 enabled species". The species count includes e1-producers' in-flight B07/B08/Y02, and the hash will move again with their edits.
- `vitest run` on g2-replay, trajectory-fence*, conservation-closed-lid, determinism, fungal-transport, fungal-links, fungal-branching, links, stage8-order, history, history-debris, worker/host, world-stores → "Test Files 16 passed (16) · Tests 135 passed (135)".
  - An earlier run failed two tests. One was "fence entry for BROKEN_CATALYST_V1", e1-producers' new recipe before their fence add, which is not mine. The other was a links.test.ts division test, which was mine and is fixed: a test B01 pair linked with the helper's default LINK_TRANSPORT was carrying carbon, so the pass now requires TRANSPORT_LINKS species at both ends.
- `E2E_PORT=4232 E2E_OUTDIR=tmp/dist-f02 npx playwright test tests/e2e/cordweaver.spec.ts --project=desktop` → "1 passed (2.9m)". The first run failed on font size: 14 px in the kv grid. The line now uses the 16 px `inspector-line`, which the inspector owner introduced this wave for the network line. Port 4232 was stopped before and after each run.

## FENCE
None. Every recorded digest is unchanged.

## Bugs or environment issues noticed
- **The shell's `grep` stopped working mid-session.** It is a profile-defined function that calls the Claude binary, and it now fails with "claude native binary not installed". Any agent that pipes through `grep` gets that error instead of output, and `until grep -q …` loops never end. Use `command grep`.
- **Gel Colony pacing.** Cordweaver takes about 110 dish seconds to branch and about 290 s before its links first carry carbon, because both halves of a division are equal. A player watching the first branch sees "No carbon moved…". This is truthful, but it is a pacing note for the owner.

## Proposed decisions
- PROPOSED DECISION: A parent–daughter link forms only when both ends have fewer than 4 fungal links. Otherwise the daughter is placed unlinked, the 'birth' event's detail says `{link: 'degree'}`, and lineage records are unchanged. This applies to F01 visual links too. With today's rules it is reachable only through hand-made links: four links occupy all four side cells, so no placement exists.
- PROPOSED DECISION: In the transport pass, the donor cap is applied first and the receiver cap second, to the donor-capped requests, with no re-offer of what a cap removed.
- PROPOSED DECISION: "At least 0.01 B0' less" and the 1.5 B0' headroom use the receiver's B0'. The donor threshold uses the donor's B0'.
- PROPOSED DECISION: Only Active F02 segments at both ends of a valid LINK_TRANSPORT link take part (a Resting segment has no links in use, SPEC §7.6). A transport-kind link on a non-TRANSPORT_LINKS species carries nothing.
- PROPOSED DECISION: Transfer observation is per slot and keyed to the segment's birthId, so a division (a new individual) starts empty. The window is the current dish second plus the nine before it. A reload starts it empty, because it is never saved. The per-second history total accumulates in an optional saved `history.pendingFungalTransfer`, so samples stay exact across a mid-second save. History is not hashed and there is no world schema change.
- PROPOSED DECISION: Every link change emits one event from the end named by birthId. 'linkFormed' carries the retained parent's birthId with partner = the daughter. 'linkBroken' carries the removed organism's birthId with partner = the survivor.
