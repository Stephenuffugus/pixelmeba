# Fast track to v1.0 — the plan from 2026‑10‑01 on

Owner, 2026‑10‑01: "I never intended for this to be weeks of building." 2-core codespace, ultracode on, usage
budget limited (memory: feedback-lean-agent-usage). Goal: **v1.0.0-rc1 (Phases 3–4) in about three overnight
sessions.** Phases 5–7 stay in the plan as post-launch updates (v1.1–v1.3).

## What changes (the time went to these)

1. **Browser tests.** Builders run unit tests plus their OWN new e2e journeys on ONE project (desktop) — no
   regression specs, no three-project runs. Verifiers run e2e only for a UI problem they are proving. The whole
   three-project suite runs once per phase, at the gate. (On 2 cores one spec on three projects costs 5–15 min,
   and tonight's agents re-ran the same specs at build, verify, fix and re-verify.)
2. **Verification.** One rules verifier per WAVE over the whole wave diff (effort high), not one per builder.
   A second, targeted verifier only for determinism- or save-critical work: Sample/Cancel (D‑0037), the W4 module
   flip, anything touching serialize/saveFile. Fix rounds only for BLOCKER/MAJOR; MINORs go to the lead's
   integration or ride along with the next wave's owner of that file.
3. **Fewer waves.** The plan's waves 2–6 become three, keeping file ownership disjoint (stage-file table: W3's
   births/conversion/commands and W4's movement/contacts/intake/maintenance/structures do not overlap):
   - **Wave 2** = plan W2: film-fungi, organisms, parasites-phage, art-features (P3.3, P3.4).
   - **Wave 3** = plan W3 + W4: e1-producers, f02-links, food-objects, tools-sample, mod-anchor-light,
     mod-feeding, mod-builders, mod-adhesion (P3.5, P3.6, P3.7), then the lead's module flip.
   - **Wave 4** = plan W5 + W6: field-guide, experiments-curated, g3-fixtures, audio, a11y, perf, g3-evidence
     (P3.8–P3.12), then the G3 gate (check + one full e2e run + EXPANSION_RESPONSE + tag).
   Concurrency is two agents at a time either way, so merging waves loses nothing and saves a whole integration
   cycle (task file, verify pass, check, commit) per merged pair.
4. **One task-file writer per wave** (effort high, no checker, line ranges only), started while the previous
   wave's last builders finish.
5. **Lead.** Short turns, no polling (wait for notifications), integrate once per wave: MINORs, decisions,
   `npm run check`, the touched journeys on desktop, commit, push, tick WORKLOG.

## Schedule (estimates on 2 cores)

| Session | Work |
|---|---|
| 1 (next) | Finish wave 1 (verify art-organisms; integrate; commit). Wave 2. Start wave 3. |
| 2 | Finish wave 3 + module flip. Wave 4. G3 gate → tag `g3`. |
| 3 | Phase 4 in two or three waves with the same rules (Android = debug build + documented device steps; store assets by script). v1.0 gate → tag `v1.0.0-rc1`. |

## Faster still (owner's call — nothing is cut unless he says so)

Moving P4.5 paired Garden variants (R2), P4.7 Try my dish (R4), P4.8 observation tools and P4.9 narration to
v1.1 would save roughly half a session.

## Owner-only items before the store (do not block the build)

Signing keystore and Play Console, one test on a real Android phone, a privacy-policy URL, the five-tester
comprehension session (EXPANSION_RESPONSE §8).
