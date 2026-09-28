/**
 * P2.3 family tree journey (UX §5.5, SPEC §8.5). The dish is a real simulation state, built here by
 * the headless simulation and loaded through the ordinary Import path: FIRST_DISH_V1, Accelerated
 * Evolution, seed 101, saved 1.5 simulated seconds before its first branch is established. Running it
 * in the app produces the discovery for real (no fake UI state).
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { realizeRecipe } from '../../src/sim/recipes';
import { step } from '../../src/sim/tick';
import { buildSaveFile } from '../../src/persistence/saveFile';
import { loadRegistryFs, REPO_ROOT } from '../../tools/lib/content-fs';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings } from './helpers';

const FIXTURE = join(REPO_ROOT, 'tmp', 'e2e-lineage', 'lineage-fixture.pixelmeba');
const LEAD_TICKS = 15;

test.beforeAll(async () => {
  test.setTimeout(120_000);
  const reg = loadRegistryFs();
  const make = () => realizeRecipe(reg, 'FIRST_DISH_V1', { seed: 101, worldId: 'lineage-e2e', transform: (r) => ({ ...r, mutationPreset: 'accelerated' }) });
  // Find the first establishment, then rebuild the same world and stop just before it.
  const probe = make();
  while (probe.branches.established === 0) {
    step(probe);
    if (probe.tick > 12_000) throw new Error('no branch established by 20 min on seed 101');
  }
  const target = probe.tick - LEAD_TICKS;
  const w = make();
  while (w.tick < target) step(w);
  const { text } = await buildSaveFile(w, { name: 'Lineage fixture', savedAt: '2026-09-28T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
  mkdirSync(join(REPO_ROOT, 'tmp', 'e2e-lineage'), { recursive: true });
  writeFileSync(FIXTURE, text);
});

async function importFixture(page: Page, settings: Record<string, unknown>): Promise<void> {
  await seedSettings(page, { showPrompts: false, ...settings });
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(FIXTURE);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
}

/** Run until the discovery card appears; with "pause on discoveries" it pauses the dish itself. */
async function runToDiscovery(page: Page): Promise<void> {
  await page.getByTestId('run-toggle').click();
  const card = page.getByTestId('discovery-card');
  await expect(card).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
}

test('a real discovery: card, compare ancestor, rename, pin, trait overlay, follow lineage, specimen', async ({ page }) => {
  test.setTimeout(240_000);
  await importFixture(page, { pauseOnDiscoveries: true });
  await runToDiscovery(page);
  const card = page.getByTestId('discovery-card');
  const title = page.getByTestId('discovery-title');
  await expect(title).toContainText(/^New branch: \S+ · .+ · [0-9A-F]{3}/);
  const generated = (await title.innerText()).replace('New branch: ', '').trim();
  await expect(card).toContainText('Ancestor:');
  await expect(card).toContainText('Inherited difference:');
  await expect(card).toContainText(/living descendants across \d+ generations/);
  await expect(card).toContainText('The dish is paused');
  await expectNoSeriousA11yViolations(page);

  // Compare → the family tree opens on the branch with the ancestor comparison.
  await page.getByTestId('discovery-compare').click();
  await expect(card).toBeHidden();
  const panel = page.getByTestId('lineage');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('lineage-name')).toHaveText(generated);
  await expect(page.getByTestId('lineage-state')).toHaveText('Branch established');
  const table = page.getByTestId('lineage-compare-table');
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Ancestor' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'This branch' })).toBeVisible();
  await expect(table.getByRole('rowheader', { name: 'Abilities' })).toBeVisible();
  await expect(panel).not.toContainText(/superior|advanced|perfect|adapted|immune/i);
  await expectNoSeriousA11yViolations(page);

  // Rename: the ID stays visible; the generated name is still shown.
  const id = /· ([0-9A-F]{3}(?:-\d+)?)$/.exec(generated)![1]!;
  await page.getByTestId('lineage-rename').click();
  await page.getByTestId('lineage-name-input').fill('Quiet savers');
  await page.getByTestId('lineage-rename-save').click();
  await expect(page.getByTestId('lineage-name')).toHaveText(`Quiet savers · ${id}`);
  await expect(panel).toContainText(`Generated name: ${generated}`);

  // Pin, then the tree shows both chips.
  await page.getByTestId('lineage-pin').click();
  await expect(page.getByTestId('lineage-pin')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('lineage-save-specimen').click();
  await expect(page.getByRole('status').filter({ hasText: 'Specimen saved' })).toBeVisible();
  await page.getByTestId('lineage-back').click();
  const row = page.getByTestId('lineage-branch').filter({ hasText: `Quiet savers · ${id}` });
  await expect(row).toContainText('Branch established');
  await expect(row).toContainText('Pinned');
  await expect(page.getByTestId('lineage-specimen')).toHaveCount(1);
  await expectNoSeriousA11yViolations(page);

  // Trait overlay: banded by a real locus, with a legend that counts each band.
  await page.getByTestId('trait-select').selectOption({ label: 'Feeding investment' });
  const legend = page.getByTestId('trait-legend');
  await expect(legend).toBeVisible();
  await expect(legend).toContainText('Feeding investment');
  await expect(legend).toContainText(/47–53 \(near the founders’ 50\): \d+/);
  await page.getByTestId('lineage-close').click();
  await expectNoSeriousA11yViolations(page);
  await page.getByTestId('trait-off').click();
  await expect(legend).toBeHidden();

  // Follow lineage: the camera follows one living member and rings the others.
  await page.getByTestId('action-look').click();
  await openTreeFromInspector(page);
  await page.getByTestId('lineage-branch').filter({ hasText: id }).click();
  await page.getByTestId('lineage-follow').click();
  await expect(panel).toBeHidden();
  const following = page.getByTestId('following-label');
  await expect(following).toContainText(`Following Quiet savers · ${id}`);
  await expect(following).toContainText(/\d+ living ringed/);
  await page.getByTestId('stop-following').click();
  await expect(following).toBeHidden();

  // A saved specimen is added through the ordinary command path (a new introduction).
  await openTreeFromInspector(page);
  await page.getByTestId('lineage-specimen-add').click();
  await expect(panel).toBeHidden();
  const before = await aliveCount(page);
  const box = (await page.getByTestId('viewport').boundingBox())!;
  await page.getByRole('button', { name: 'Whole dish' }).click();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(page.getByRole('status').filter({ hasText: /Added 1 from Specimen 1/ })).toBeVisible();
  await expect.poll(() => aliveCount(page)).toBe(before + 1);
  await expectNoHorizontalOverflow(page);
});

test('the family tree works at 200 % text: targets reachable, nothing sideways', async ({ page }) => {
  test.setTimeout(240_000);
  await importFixture(page, { pauseOnDiscoveries: true, textScale: 2 });
  await runToDiscovery(page);
  await expectReachable(page.getByTestId('discovery-dismiss'));
  await expectReachable(page.getByTestId('discovery-follow'));
  await page.getByTestId('discovery-dismiss').click();
  await expect(page.getByTestId('discovery-card')).toBeHidden();
  await openTreeFromInspector(page);
  await page.getByTestId('lineage-branch').first().click();
  for (const t of ['lineage-follow', 'lineage-compare', 'lineage-pin', 'lineage-rename', 'lineage-save-specimen', 'lineage-back']) await expectReachable(page.getByTestId(t));
  await page.getByTestId('lineage-compare').click();
  await expect(page.getByTestId('lineage-compare-table')).toBeVisible();
  await expectReachable(page.getByTestId('trait-select'));
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
});

async function aliveCount(page: Page): Promise<number> {
  const t = await page.getByTestId('sim-time').innerText();
  return Number(/(\d+) alive/.exec(t)![1]);
}

/** "Where is its family?" → Family tree, from any organism (tapping the dish centre area). */
async function openTreeFromInspector(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const box = (await page.getByTestId('viewport').boundingBox())!;
  const heading = page.getByTestId('inspector').getByRole('heading', { level: 2 });
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  const zoom = Math.min(box.width, box.height) / 124;
  // The Sunbead colony and the Sprinters that settle on it (docs/reports/tune-g1.md).
  for (const [x, y] of [
    [52, 50],
    [48.5, 48.5],
    [50, 52],
    [55, 47],
    [45, 50],
    [52, 55],
  ] as const) {
    await page.mouse.click(box.x + box.width / 2 + (x - 64) * zoom, box.y + box.height / 2 + (y - 64) * zoom);
    await expect(list.or(heading)).toBeVisible();
    if (await list.isVisible()) await list.getByRole('option').first().click();
    if (/#\d+/.test(await heading.innerText())) break;
    await page.getByTestId('inspector').getByRole('button', { name: 'Close' }).click();
  }
  await page.getByTestId('shortcut-family').click();
  await page.getByTestId('open-lineage').click();
  await expect(page.getByTestId('lineage')).toBeVisible();
  // Opened on the organism's own branch when it has one; go to the tree.
  if (await page.getByTestId('lineage-back').isVisible()) await page.getByTestId('lineage-back').click();
}
