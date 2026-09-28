/**
 * P2.3 family tree journeys (UX §5.5, SPEC §8.5). The dish is a real simulation state, built here by
 * the headless simulation and loaded through the ordinary Import path: FIRST_DISH_V1 with Accelerated
 * Evolution on seed 101, saved 1.5 simulated seconds before its first branch is established. Running
 * it in the app produces the discovery for real (no fake UI state): the same seed, content and
 * commands give the same establishment tick in the browser.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { realizeRecipe } from '../../src/sim/recipes';
import { deserializeWorld, serializeWorld, type WorldState } from '../../src/sim/serialize';
import { step } from '../../src/sim/tick';
import { buildSaveFile } from '../../src/persistence/saveFile';
import { loadRegistryFs, REPO_ROOT } from '../../tools/lib/content-fs';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings } from './helpers';

const DIR = join(REPO_ROOT, 'tmp', 'e2e-lineage');
const FIXTURE = join(DIR, `lineage-fixture-${process.pid}.pixelmeba`);
/** Ticks between the saved state and the first establishment. */
const LEAD_TICKS = 15;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  const reg = loadRegistryFs();
  const w = realizeRecipe(reg, 'FIRST_DISH_V1', { seed: 101, worldId: 'lineage-e2e', transform: (r) => ({ ...r, mutationPreset: 'accelerated' }) });
  // Keep a state every 5 ticks; when the first branch is established, save one from ≥ LEAD_TICKS before.
  const kept: WorldState[] = [];
  while (w.branches.established === 0) {
    if (w.tick % 5 === 0) {
      kept.push(serializeWorld(w));
      if (kept.length > 8) kept.shift();
    }
    step(w);
    if (w.tick > 12_000) throw new Error('no branch established by 20 min on seed 101');
  }
  const state = [...kept].reverse().find((s) => s.tick <= w.tick - LEAD_TICKS);
  if (!state) throw new Error('no state kept before the establishment');
  const { text } = await buildSaveFile(deserializeWorld(state), { name: 'Lineage fixture', savedAt: '2026-09-28T00:00:00.000Z', recipeId: 'FIRST_DISH_V1' });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FIXTURE, text);
});

test.afterAll(() => rmSync(FIXTURE, { force: true }));

async function importFixture(page: Page, settings: Record<string, unknown>): Promise<void> {
  await seedSettings(page, { showPrompts: false, ...settings });
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(FIXTURE);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
}

/** Run until the discovery card appears. */
async function runToDiscovery(page: Page): Promise<void> {
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('discovery-card')).toBeVisible({ timeout: 60_000 });
}

async function aliveCount(page: Page): Promise<number> {
  const t = await page.getByTestId('sim-time').innerText();
  return Number(/(\d+) alive/.exec(t)![1]);
}

test('a real discovery: compare ancestor, rename, pin, specimen, trait overlay, follow lineage, family link', async ({ page }) => {
  // The longest journey (Settings, discovery, tree, overlay, follow, specimen); desktop SwiftShader is slow.
  test.setTimeout(360_000);
  // "Pause on discoveries" is chosen in Settings (UX §2), where it lives with the other preferences.
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const pauseSetting = page.getByTestId('pause-on-discoveries');
  await expect(pauseSetting).not.toBeChecked();
  await expectReachable(page.locator('label', { has: pauseSetting }));
  await pauseSetting.check();
  await expectNoSeriousA11yViolations(page);
  await importFixture(page, {});
  await runToDiscovery(page);
  // "Pause on discoveries" was chosen: the card paused the dish.
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const card = page.getByTestId('discovery-card');
  const title = page.getByTestId('discovery-title');
  await expect(title).toContainText(/^New branch: \S+ · .+ · [0-9A-F]{3}/);
  const generated = (await title.innerText()).replace('New branch: ', '').trim();
  await expect(card).toContainText('Ancestor:');
  await expect(card).toContainText('Inherited difference:');
  await expect(card).toContainText('Game rule:');
  await expect(card).not.toContainText(/no longer pays|senses food from farther/);
  await expect(card).toContainText(/living descendants across \d+ generations when named/);
  await expect(card).toContainText('The dish is paused');
  await expect(card).not.toContainText(/superior|advanced|perfect|adapted|immune/i);
  await expectNoSeriousA11yViolations(page);

  // Compare → the family tree opens on the branch with the ancestor comparison showing.
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
  await expect(table).toContainText('founder of this line');
  await expect(page.getByTestId('lineage-rules')).toContainText('Game rule:');
  await expect(panel).not.toContainText(/superior|advanced|perfect|adapted|immune/i);
  await expectNoSeriousA11yViolations(page);

  // Rename: the ID stays visible and the generated name is still shown.
  const id = /· ([0-9A-F]{3}(?:-\d+)?)$/.exec(generated)![1]!;
  await page.getByTestId('lineage-rename').click();
  await page.getByTestId('lineage-name-input').fill('Quiet savers');
  await page.getByTestId('lineage-rename-save').click();
  await expect(page.getByTestId('lineage-name')).toHaveText(`Quiet savers · ${id}`);
  await expect(page.getByTestId('lineage-generated')).toHaveText(`Generated name: ${generated}`);

  // Pin and save a specimen; the tree then shows the name, both chips and the specimen.
  await page.getByTestId('lineage-pin').click();
  await expect(page.getByTestId('lineage-pin')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('lineage-save-specimen').click();
  await expect(page.getByRole('status').filter({ hasText: 'Specimen saved' })).toBeVisible();
  await page.getByTestId('lineage-back').click();
  const row = page.getByTestId('lineage-branch').filter({ hasText: `Quiet savers · ${id}` });
  await expect(row).toContainText('Branch established');
  await expect(row).toContainText('Pinned');
  await expect(page.getByTestId('lineage-specimen')).toHaveCount(1);
  await expect(page.getByTestId('pause-on-discoveries')).toBeChecked();
  await expectNoSeriousA11yViolations(page);

  // Trait overlay: banded by a real locus, with a legend that names and counts each band.
  await page.getByTestId('trait-select').selectOption({ label: 'Feeding investment' });
  const legend = page.getByTestId('trait-legend');
  await expect(legend).toBeVisible();
  await expect(legend).toContainText('Feeding investment');
  await expect(legend).toContainText(/47–53 · middle: \d+/);
  await expect(legend).not.toContainText('founders’ 50');
  await page.getByTestId('lineage-close').click();
  await expect(panel).toBeHidden();
  await expectNoSeriousA11yViolations(page);

  // Follow lineage (from the tree reopened by the legend): the camera follows a living member and
  // the others are ringed.
  await page.getByTestId('legend-open-tree').click();
  await expect(panel).toBeVisible();
  await row.click();
  await page.getByTestId('lineage-follow').click();
  await expect(panel).toBeHidden();
  const following = page.getByTestId('following-label');
  await expect(following).toContainText(`Following Quiet savers · ${id}`);
  await expect(following).toContainText(/[1-9]\d* living ringed/);
  await page.getByTestId('trait-off').click();
  await expect(legend).not.toContainText('Feeding investment');

  // The followed member sits at the centre of the paused dish: inspect it, then "Where is its
  // family?" → Family tree opens on its branch.
  const box = (await page.getByTestId('viewport').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  const inspector = page.getByTestId('inspector');
  await expect(list.or(inspector)).toBeVisible();
  if (await list.isVisible()) await list.getByRole('option').first().click();
  await page.getByTestId('shortcut-family').click();
  await page.getByTestId('open-lineage').click();
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('lineage-name')).toHaveText(`Quiet savers · ${id}`);

  // A saved specimen is added through the ordinary command path (a new introduction).
  await page.getByTestId('lineage-back').click();
  await page.getByTestId('lineage-specimen-add').click();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('specimen-placing')).toBeVisible();
  const before = await aliveCount(page);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('status').filter({ hasText: /Added 1 from Specimen 1/ })).toBeVisible();
  await expect.poll(() => aliveCount(page)).toBe(before + 1);

  await page.getByTestId('stop-following').click();
  await expect(following).toBeHidden();
  await expectNoHorizontalOverflow(page);
});

test('without "pause on discoveries" the card leaves the dish running; Dismiss closes it', async ({ page }) => {
  test.setTimeout(180_000);
  await importFixture(page, {});
  await runToDiscovery(page);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expect(page.getByTestId('discovery-card')).not.toContainText('The dish is paused');
  await page.getByTestId('discovery-dismiss').click();
  await expect(page.getByTestId('discovery-card')).toBeHidden();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
});

test('the family tree works at 200 % text: targets reachable, nothing sideways', async ({ page }) => {
  test.setTimeout(240_000);
  // The Settings row first, at 200 % text.
  await seedSettings(page, { showPrompts: false, pauseOnDiscoveries: true, textScale: 2 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByTestId('pause-on-discoveries')).toBeChecked();
  await expectReachable(page.locator('label', { has: page.getByTestId('pause-on-discoveries') }));
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
  await importFixture(page, {});
  await runToDiscovery(page);
  for (const t of ['discovery-follow', 'discovery-compare', 'discovery-dismiss']) await expectReachable(page.getByTestId(t));
  await expectNoSeriousA11yViolations(page);
  // Follow from the card, then open the tree on that branch from the legend.
  await page.getByTestId('discovery-follow').click();
  await expect(page.getByTestId('discovery-card')).toBeHidden();
  await expect(page.getByTestId('following-label')).toBeVisible();
  await expectReachable(page.getByTestId('stop-following'));
  await page.getByTestId('legend-open-tree').click();
  await expect(page.getByTestId('lineage')).toBeVisible();
  for (const t of ['lineage-follow', 'lineage-compare', 'lineage-pin', 'lineage-rename', 'lineage-save-specimen', 'lineage-back']) await expectReachable(page.getByTestId(t));
  await page.getByTestId('lineage-compare').click();
  await expect(page.getByTestId('lineage-compare-table')).toBeVisible();
  await expectReachable(page.getByTestId('trait-select'));
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
});
