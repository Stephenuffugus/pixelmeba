/**
 * tools/fence-update.ts (g3-plan lines 132–134; g3-plan-recheck P-23): the only writer of the fence
 * digests and of the g2 saves' expected.json. It refuses to run without a reason that names a recorded
 * decision, refuses a g2 re-record under a decision that does not state a landed version bump and the
 * g2 re-record itself (fix round 1: merely mentioning a version field was enough), writes nothing when
 * it refuses, never touches g2Digest outside --g2, --add records only a current digest, and a --g2
 * re-record that changes expected.json leaves a changedBy trail there.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decisionText, g2DecisionProblem, main, parseArgs, recordG2Expected, Refusal, statedBumps, VERSION_FIELDS, type VersionStamps } from '../../tools/fence-update';
import { REPO_ROOT } from '../../tools/lib/content-fs';
import { FENCE_PATH, fenceText, readFence, type FenceFile } from '../helpers/fence';
import { EXPECTED_PATH, expectedText, readExpected, type G2Expected } from '../helpers/g2-saves';

const DECISIONS = join(REPO_ROOT, 'docs', 'DECISIONS.md');

describe('fence-update argument refusals', () => {
  it('needs exactly one mode, and every mode but --add needs --reason D-00xx', () => {
    const refusal = (argv: string[], message: RegExp) => {
      expect(() => parseArgs(argv), argv.join(' ')).toThrow(Refusal);
      expect(() => parseArgs(argv), argv.join(' ')).toThrow(message);
    };
    refusal([], /no mode given/);
    refusal(['--all', '--g2', '--reason', 'D-0036'], /one mode at a time/);
    refusal(['--recipe', 'FIRST_DISH_V1'], /--recipe refuses to run without --reason D-00xx/);
    refusal(['--all'], /--all refuses to run without --reason/);
    refusal(['--g2'], /--g2 refuses to run without --reason/);
    refusal(['--all', '--reason', 'because'], /a decision id like D-0040/);
    refusal(['--all', '--reason', 'D-36'], /a decision id like D-0040/);
    refusal(['--recipe', '--reason', 'D-0036'], /--recipe needs a value/);
    refusal(['--all', '--reason'], /--reason needs a value/);
    refusal(['--add', 'FIRST_DISH_V1', '--ticks', '0'], /positive integer/);
    refusal(['--add', 'FIRST_DISH_V1', '--reason', 'D-0036'], /takes no --reason/);
    refusal(['--all', '--reason', 'D-0036', '--ticks', '600'], /only goes with --add/);
    expect(parseArgs(['--all', '--reason', 'D-0036']).mode).toEqual({ kind: 'all', reason: 'D-0036' });
    expect(parseArgs(['--recipe', 'R-G1', '--reason', 'D-0036']).mode).toEqual({ kind: 'recipe', id: 'R-G1', reason: 'D-0036' });
    expect(parseArgs(['--g2', '--reason', 'D-0036']).mode).toEqual({ kind: 'g2', reason: 'D-0036' });
    expect(parseArgs(['--add', 'NEW_V1']).mode).toEqual({ kind: 'add', recipe: 'NEW_V1', ticks: 1200 });
    expect(parseArgs(['--add', 'NEW_V1', '--ticks', '900']).mode).toEqual({ kind: 'add', recipe: 'NEW_V1', ticks: 900 });
  });

  it('the reason must be a decision recorded in docs/DECISIONS.md (its text runs to the next decision)', () => {
    const d36 = decisionText(DECISIONS, 'D-0036');
    expect(d36.startsWith('## D-0036 · ')).toBe(true);
    expect(d36).toContain('contentVersion 1 → 2');
    expect(d36).not.toMatch(/^## D-0037/m);
    expect(() => decisionText(DECISIONS, 'D-9999')).toThrow(/D-9999 is not in .*DECISIONS\.md: record the decision first/);
  });

  it('reads every stated bump "<field> N → M" (or "->") with M above N, and nothing else', () => {
    expect(statedBumps('evolutionRulesVersion 1 → 2; moduleRegistryVersion 2->3, contentVersion  4 →5; `phenotypeMappingVersion` 1 → 2; contentVersion: 5 → 6')).toEqual([
      { field: 'evolutionRulesVersion', from: 1, to: 2 },
      { field: 'moduleRegistryVersion', from: 2, to: 3 },
      { field: 'contentVersion', from: 4, to: 5 },
      { field: 'phenotypeMappingVersion', from: 1, to: 2 },
      { field: 'contentVersion', from: 5, to: 6 },
    ]);
    // Mentions, decreases, and simulationVersion (pinned to 3) are not bumps.
    expect(statedBumps('a forced rules change (evolutionRulesVersion bump, fence update with a DECISIONS id)')).toEqual([]);
    expect(statedBumps('evolutionRulesVersion 2 → 1; simulationVersion 3 → 4; contentVersion 2 → 2')).toEqual([]);
  });

  describe('a g2 re-record needs a decision that states a landed version bump and the g2 re-record', () => {
    const g2: VersionStamps = { evolutionRulesVersion: 1, moduleRegistryVersion: 1, phenotypeMappingVersion: 1, contentVersion: 1 };
    const shipped = (field: string, value: number): VersionStamps => ({ ...g2, contentVersion: 2, [field]: value });
    const RECORDS = 'It re-records every g2Digest (fence-update --g2).';

    it('accepts each rules or content version bump that has landed above g2, named with the re-record', () => {
      for (const field of VERSION_FIELDS) {
        expect(g2DecisionProblem('D-0101', `## D-0101 · x\nDecision: ${field} 1 → 2. ${RECORDS}`, shipped(field, 2), g2), field).toBeNull();
        expect(g2DecisionProblem('D-0101', `## D-0101 · x\nDecision: ${field} 1 -> 2; run npx tsx tools/fence-update.ts --g2 --reason D-0101.`, shipped(field, 2), g2), field).toBeNull();
      }
    });

    it('refuses a decision that only mentions a version field (as D-0038 does), or bumps simulationVersion', () => {
      const d38 = 'Owner review: yes — if film should be a separate food, that is a forced rules change (evolutionRulesVersion bump, fence update with a DECISIONS id).';
      expect(g2DecisionProblem('D-0100', `## D-0100 · a label change\n${d38} ${RECORDS}`, shipped('evolutionRulesVersion', 2), g2)).toMatch(/^D-0100 does not state which rules or content version it bumps/);
      expect(g2DecisionProblem('D-0102', `## D-0102 · simulationVersion 3 → 4. ${RECORDS}`, shipped('contentVersion', 2), g2)).toMatch(/does not state which rules or content version it bumps/);
    });

    it('refuses a bump that has not landed in content/manifest.json, or is not above the g2 value', () => {
      // Stated, but the manifest still holds evolutionRulesVersion 1 (a plan for later, like D-0036's wave 4 line).
      expect(g2DecisionProblem('D-0103', `## D-0103 · x\nevolutionRulesVersion 1 → 2. ${RECORDS}`, shipped('evolutionRulesVersion', 1), g2)).toMatch(
        /^D-0103 states evolutionRulesVersion 1 → 2, but no such bump has landed: content\/manifest.json holds evolutionRulesVersion 1 \(g2: 1\)/,
      );
      expect(g2DecisionProblem('D-0104', `## D-0104 · x\nmoduleRegistryVersion 0 → 1. ${RECORDS}`, shipped('moduleRegistryVersion', 1), g2)).toMatch(/no such bump has landed/);
    });

    it('refuses a landed bump whose decision does not say it re-records the g2 fence (as D-0036 does)', () => {
      const d36 = 'Decision: the Preflight commit bumps content/manifest.json buildPhase 2 → 3 and contentVersion 1 → 2; moduleRegistryVersion 1 → 2 at the wave 4 module flip.';
      expect(g2DecisionProblem('D-0105', `## D-0105 · x\n${d36}`, shipped('contentVersion', 2), g2)).toMatch(/^D-0105 does not say that it re-records the g2 fence/);
      expect(g2DecisionProblem('D-0105', `## D-0105 · x\n${d36} ${RECORDS}`, shipped('contentVersion', 2), g2)).toBeNull();
    });
  });
});

describe('a --g2 re-record leaves a changedBy trail in expected.json', () => {
  const recorded = readExpected().saves;
  // expected.json as the g2 build writes it: these values, no trail (whatever trail the committed file gains later).
  const text = expectedText(recorded);

  it('expectedText writes no changedBy key while there is no trail', () => {
    expect(Object.keys(JSON.parse(text) as object)).toEqual(['about', 'replayTicks', 'saves']);
    expect(expectedText(recorded, [])).toBe(text);
  });

  it('unchanged values leave the file byte-identical; changed ones append {decision, saves}, oldest first', () => {
    expect(recordG2Expected(text, recorded, 'D-0101')).toBe(text);
    const first: Record<string, G2Expected> = { ...recorded, 'first-dish-t3000.pixelmeba.gz': { ...recorded['first-dish-t3000.pixelmeba.gz']!, digestPlus1000: '00000000000000aa' } };
    const once = recordG2Expected(text, first, 'D-0101');
    expect(JSON.parse(once)).toEqual({ ...JSON.parse(text), saves: first, changedBy: [{ decision: 'D-0101', saves: ['first-dish-t3000.pixelmeba.gz'] }] });
    const second: Record<string, G2Expected> = { ...first, 'e03-dormancy-t500.pixelmeba.gz': { ...first['e03-dormancy-t500.pixelmeba.gz']!, hashAtLoad: '00000000000000bb' } };
    const twice = recordG2Expected(once, second, 'D-0102');
    expect((JSON.parse(twice) as { changedBy: unknown }).changedBy).toEqual([
      { decision: 'D-0101', saves: ['first-dish-t3000.pixelmeba.gz'] },
      { decision: 'D-0102', saves: ['e03-dormancy-t500.pixelmeba.gz'] },
    ]);
    expect(recordG2Expected(twice, second, 'D-0103')).toBe(twice);
  });
});

describe('fence-update writes nothing when it refuses, and keeps g2Digest outside --g2', () => {
  let dir = '';
  let fencePath = '';
  let expectedPath = '';
  let decisionsPath = '';
  const errors: string[] = [];
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'fence-update-'));
    fencePath = join(dir, 'fence.json');
    expectedPath = join(dir, 'expected.json');
    decisionsPath = join(dir, 'DECISIONS.md');
    copyFileSync(FENCE_PATH, fencePath);
    copyFileSync(EXPECTED_PATH, expectedPath);
    // A decisions file of its own, with one decision that bumps no version.
    writeFileSync(decisionsPath, '# Decisions\n\n## D-0100 · 2026-10-01 · test · A label change\nDecision: a label.\n');
    errors.length = 0;
    vi.spyOn(console, 'error').mockImplementation((m: unknown) => void errors.push(String(m)));
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());
  const paths = () => ['--fence', fencePath, '--expected', expectedPath];

  it('every refusal exits 2, says why, and leaves fence.json and expected.json byte-identical', async () => {
    const fenceBefore = readFileSync(fencePath, 'utf8');
    const expectedBefore = readFileSync(expectedPath, 'utf8');
    const cases: [string[], RegExp][] = [
      [[], /no mode given/],
      [['--all'], /without --reason/],
      [['--recipe', 'FIRST_DISH_V1'], /without --reason/],
      [['--g2'], /without --reason/],
      [['--all', '--reason', 'D-9999'], /D-9999 is not in/],
      [['--g2', '--reason', 'D-9999'], /D-9999 is not in/],
      // A decision that bumps no rules or content version: no g2 re-record under it.
      [['--g2', '--reason', 'D-0100', '--decisions', decisionsPath], /D-0100 does not state which rules or content version it bumps/],
      // The real D-0038 only mentions an evolutionRulesVersion bump as a possibility, and the real D-0036
      // bumps contentVersion without re-recording the g2 fence: neither carries a g2 re-record.
      [['--g2', '--reason', 'D-0038'], /^fence-update refused: D-0038 does not state which rules or content version it bumps/],
      [['--g2', '--reason', 'D-0036'], /^fence-update refused: D-0036 /],
      [['--recipe', 'NOPE_V1', '--reason', 'D-0036'], /no fence entry "NOPE_V1"/],
      [['--add', 'FIRST_DISH_V1'], /already has an entry "FIRST_DISH_V1"/],
      [['--add', 'NOPE_V1'], /unknown recipe "NOPE_V1"/],
    ];
    for (const [argv, why] of cases) {
      errors.length = 0;
      expect(await main([...argv, ...paths()]), argv.join(' ')).toBe(2);
      expect(errors.join('\n'), argv.join(' ')).toMatch(/^fence-update refused: /);
      expect(errors.join('\n'), argv.join(' ')).toMatch(why);
    }
    expect(readFileSync(fencePath, 'utf8')).toBe(fenceBefore);
    expect(readFileSync(expectedPath, 'utf8')).toBe(expectedBefore);
  });

  it('--recipe re-records currentDigest under its decision and never touches g2Digest', async () => {
    const real = readFence().entries.find((e) => e.id === 'CLEANING_CREW_V1')!;
    const edited: FenceFile = readFence(fencePath);
    const target = edited.entries.find((e) => e.id === 'CLEANING_CREW_V1')!;
    target.g2Digest = '00000000000000aa';
    target.currentDigest = '00000000000000bb';
    writeFileSync(fencePath, fenceText(edited));
    expect(await main(['--recipe', 'CLEANING_CREW_V1', '--reason', 'D-0036', ...paths()])).toBe(0);
    const after = readFence(fencePath);
    const e = after.entries.find((x) => x.id === 'CLEANING_CREW_V1')!;
    expect(e.currentDigest).toBe(real.currentDigest);
    expect(e.g2Digest).toBe('00000000000000aa');
    expect(e.changedBy).toEqual([{ decision: 'D-0036', field: 'currentDigest' }]);
    // Every other entry is untouched.
    expect(after.entries.filter((x) => x.id !== 'CLEANING_CREW_V1')).toEqual(readFence().entries.filter((x) => x.id !== 'CLEANING_CREW_V1'));
  });

  it('--add records a new recipe entry with a current digest only (g2Digest null)', async () => {
    const real = readFence().entries.find((e) => e.id === 'FOOD_TRAIL_V1')!;
    const without: FenceFile = { ...readFence(fencePath), entries: readFence(fencePath).entries.filter((e) => e.id !== 'FOOD_TRAIL_V1') };
    writeFileSync(fencePath, fenceText(without));
    expect(await main(['--add', 'FOOD_TRAIL_V1', ...paths()])).toBe(0);
    const added = readFence(fencePath).entries.at(-1)!;
    expect(added).toEqual({ id: 'FOOD_TRAIL_V1', kind: 'recipe', recipe: 'FOOD_TRAIL_V1', ticks: 1200, g2Digest: null, currentDigest: real.currentDigest, changedBy: [] });
  });
});

describe('fence-update as a command', () => {
  it('exits 2 with the reason on stderr and changes no file', () => {
    const before = readFileSync(FENCE_PATH, 'utf8');
    const res = spawnSync(join(REPO_ROOT, 'node_modules', '.bin', 'tsx'), [join(REPO_ROOT, 'tools', 'fence-update.ts'), '--all'], { cwd: REPO_ROOT, encoding: 'utf8' });
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('fence-update refused: --all refuses to run without --reason D-00xx');
    expect(readFileSync(FENCE_PATH, 'utf8')).toBe(before);
  });
});
