# rc1-corpus build (Phase 5 preflight, g5-plan lead call 1)

Builder report, 2026-10-13. Tree: main at 68a8f75 (the v1.0.0-rc1 code). content/manifest.json is the rc1 manifest: buildPhase 4, contentVersion 2, contentHash d3fbd36c…a8bf. Nothing is committed. Nothing under src/, content/ or public/ was touched.

## Files

| File | Status |
|---|---|
| tools/make-rc1-saves.ts | new |
| tests/helpers/rc1-saves.ts | new |
| tests/fixtures/rc1-replay.test.ts | new |
| tests/fixtures/saves-rc1/ (5 saves, rc1-manifest.json, expected.json) | new |
| tools/fence-update.ts | `--rc1` mode added |
| tests/tools/fence-update.test.ts | `--rc1` tests added |

## How the saves are made

- **Real app paths only.** Every dish is played through `DishHost` with a fake clock:
  - `create` with New Dish overrides;
  - `setSpeed` 4 and `pump`, at exactly 10 ticks per 250 ms pump, then `step` for the last ticks;
  - `command` for Add Life, Lab strokes, food objects and Sample Take;
  - `sampleBegin`;
  - the notebook's own requests: `favorite`, `storyMark`, `goalStart`, `bookmarkAdd`, and `galleryAdd`. The gallery entry is built by `src/ui/gallery.ts buildGalleryEntry` from the published snapshot and the inspector answer, as the UI builds it.
- **Nothing is written directly.** No world field is set by hand. The world is only read, to pick tap points and birth ids and to count the facts below.
- **What each file is.** Each file is the host's `exportDish` answer with `strip: false, includeNicknames: true`. That is the same `buildSaveFile(world, meta, { notebook, includeNicknames: true })` call the device's own saves make, so the notebook record sits beside the state. `savedAt` comes from the host clock's `iso()`.
- **Write guard.** The tool writes only while content/manifest.json carries the rc1 stamps and, once rc1-manifest.json exists, equals it field for field. Otherwise it only verifies:
  - it replays the dishes under the committed rc1-manifest.json and the packs, which must still hash to d3fbd36c…;
  - it writes nothing;
  - `--force` is refused with exit 2.

  This mirrors make-g2-saves. `writeRefusal` was checked ad hoc on four inputs: the shipped manifest vs the committed one gives null; no committed manifest gives null; buildPhase 5 / contentVersion 3 is refused; a changed enabled list is refused.
- **Held Sample (D-0037, D-0054).** The app never runs time while a sample is held, and running anyway corrupts the sample: births fill the vacated slots, and the import then refuses the file. So `RC1_RESUME` cancels the held sample after load with `cancelSample`, the function the host's `sampleCancel` calls, and records `hashAfterResume` before the 1,000 ticks. At build time that hash equals the `sampleBegun` hash, 69f025e2ea056b5b. So Cancel after a reload is exact on this save.
- **expected.json, per save:**
  - `hashAtLoad`;
  - `notebookChecksum`: the record's own sha256 checksum as `loadSaveFile` read it back, or null when there is no notebook;
  - `hashAfterResume`, or null;
  - `hashPlus1000`;
  - `digestPlus1000`: `trajectoryDigest(world, 'full')`, which covers post-g2 state.

## What each save holds

Counts were read from the loaded world and notebook. The tool's check refuses to write a save if any of the required counts is zero.

| Save (gz bytes) | Recipe / start | Phase 3–4 state present |
|---|---|---|
| first-dish-diverse-notebook-t3000 (585,715) | FIRST_DISH_V1, overrides accelerated + diverse | (a) 485 alive. Carriers E01 10, E05 2 (phase 2), **Phase 3 modules: E06 59, E10 2, E12 2**. (d) X01: 8 added by Add Life at t600; 41 alive at t3000, **39 attached** to A01. (h) Notebook: 2 followed favorites, both nicknamed ("rc1 Sprinters", "rc1 Sunbeads"); 10 story cards, 1 marked seen; goals SEE_SPRINTER_SPLIT **settled** and KEEP_SPRINTERS_GOING **running**; 1 bookmark; 1 gallery specimen. |
| first-dish-lab-food-sample-held-t1500 (851,027) | FIRST_DISH_V1, standard | (f) 7 Lab commands at t300: SALT, ACID and BUFFER strokes, gel paint, a wall, plus the two objects below. Field totals at save: salt 9.88, acid 3.20, buffer 4.00. (e) **M10 pellet 1 and M11 wafer 1, both partly released**. (g) Sample: Begin, then Take at t1500 ('all' mode, r 3, at the first Crumbsmith's cell). **HELD at save: 33 organism rows, 29 cells.** 9 story cards. |
| borrowed-shelter-velvet-t1500 (458,716) | L306_BORROWED_SHELTER, plus 20 B02 by Add Life at t100 | (b) **B02 Velvet 20 alive, E10 carriers 20, film 27.67 C over 717 cells**. 2 story cards. |
| fungal-supply-line-t900 (31,459) | FUNGAL_SUPPLY_LINE_V1 | (c) **F02 4 alive, 6 link ends (3 transport links)**. No notebook (one-host-pinphage has none either), so two saves cover a save without a notebook. |
| one-host-pinphage-t300 (541,784) | ONE_HOST_V1 (mid-outbreak) | (d) V01: **11 living B01 infected, 19 B01 lysed (DEATH_LYSIS)**, 2,038.6 phage units in the field. No notebook. |

- **Total size:** 2,470,105 bytes, including rc1-manifest.json (1,333 B) and expected.json (1,873 B). That is under the 4 MB budget; the g2 corpus is 3.3 MB. Uncompressed JSON is 5.9 to 6.6 MB per save.
- **Not covered:** E07. The Diverse and accelerated Garden at the recipe seed carries E05 and E06, not E07.
- **Build time:** about 19 s for all five saves.

## Recorded values (expected.json)

| Save | hashAtLoad | notebookChecksum | hashAfterResume | hashPlus1000 | digestPlus1000 |
|---|---|---|---|---|---|
| first-dish-diverse-notebook-t3000 | 3cd5b66c9280d503 | sha256:fb02a606…9cfa | – | 427728064f59550f | 15f00c5f9a78878e |
| first-dish-lab-food-sample-held-t1500 | 71aff808da3b445d | sha256:4f226cff…60d8 | 69f025e2ea056b5b | 7f77c7c1dbe56a75 | 6d06c72bea8d1e8d |
| borrowed-shelter-velvet-t1500 | 0b4d6a8aefce2aac | sha256:91c00d1c…f67b | – | d5c6f6071fc7e81b | ba44d5ec01c18d4c |
| fungal-supply-line-t900 | d395b0893dc83ae3 | – | – | 0cc030f219860362 | 48569cc3cf8e1a0f |
| one-host-pinphage-t300 | 19fe0def828fd576 | – | – | 97b133d9e401042d | 8ee2dafa33792456 |

## rc1-replay.test.ts

For each save (timeout 600 s), the test checks:

- the save's manifest is the rc1 manifest (contentHash and buildPhase 4), and its schema version is at or below this build's;
- `hashAtLoad`;
- the notebook was not dropped, equals the file's record, has the recorded checksum, and re-seals to the same checksum;
- the Phase 3–4 state listed above is still present after load;
- a second, independent load gives the same hash and notebook;
- `hashAfterResume`, and that the sample is gone after Cancel;
- after 1,000 ticks, `hashPlus1000` and the 'full' digest;
- a `buildSaveFile` → `loadSaveFile` round trip of the continued world, with its notebook, gives the same hash and digest and keeps the notebook checksum.

## fence-update --rc1

- **What it re-records.** It re-records only tests/fixtures/saves-rc1/expected.json. It never reads or writes fence.json.
- **Decision rule.** The `--reason` decision must:
  1. state a rules or content bump "<field> N → M" that has landed in content/manifest.json, with M above the rc1-manifest.json value;
  2. name "fence-update --rc1" or saves-rc1. A g2 re-record wording does not count.
- **Trail.** Changed values append `{decision, saves}` to `changedBy`. If no value changed, the file stays byte-identical.
- **Shared rule.** `g2DecisionProblem` now delegates to the same `recordDecisionProblem`, and its messages are unchanged.
- **Default paths.** `--expected` and `--saves` default to the rc1 corpus under `--rc1` and to the g2 saves otherwise.
- **Tests cover:**
  - argument parsing and default paths;
  - accept and refuse for each rule, including the real D-0036, whose contentVersion 1 → 2 is the rc1 value and so is not a bump above it;
  - the `changedBy` trail;
  - refusals exit 2 and leave fence.json, the g2 expected.json and the rc1 expected.json byte-identical.

## Commands run (this session)

| Command | Result |
|---|---|
| `npx tsx tools/make-rc1-saves.ts`, run again after the last change | 7/7 files "unchanged": byte-identical, so the tool is deterministic |
| `npx vitest run tests/fixtures/rc1-replay.test.ts tests/fixtures/g2-replay.test.ts tests/tools/fence-update.test.ts` | 3 files, **34 tests passed** (66 s) |
| `npx tsc -p tsconfig.json --noEmit` | exit 0 |
| `npx eslint` on the five changed TypeScript files | exit 0 |

`npm run check` and e2e were not run; the lead runs them.

## Notes for the lead

- **No guard test for make-rc1-saves.** There is no counterpart to tests/tools/make-g2-saves.test.ts that checks `--force` is refused past rc1 and that `writeRefusal` behaves. That file was outside this task's file list. Once the manifest moves to buildPhase 5 it is worth adding: spawn `make-rc1-saves --force`, expect exit 2 and every fixture byte-identical.
- **When verify mode works.** After the Phase 5 bump, `npx tsx tools/make-rc1-saves.ts` verifies the corpus only while the packs enabled by the rc1 manifest still hash to d3fbd36c…. This is the same constraint as make-g2-saves.
