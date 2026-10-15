/**
 * P5.4 New Dish habitat starts (UX §2.3 "Basics (habitat/recipe picker with preview …)", "Summary states exactly
 * what is preloaded and the total initial ledger"; CT §8.2 "Empty or Suggested Community"; D-0128 "New Dish").
 *
 * Case 1 (always): the 'Start with' list shows a habitat start exactly for each habitat THIS BUILD's manifest
 * enables (the validator refuses an enabled habitat it cannot offer), ordered by phase then id, and the Empty Gel
 * Colony summary is today's text. Cases 2 and 3 need H04_LEAF_POOL / H10_GATE_LAB in the build manifest and skip
 * until THE HABITAT ENABLE (the structures-environment.spec.ts gating pattern).
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../tools/lib/content-fs';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings } from './helpers';

interface HabitatRecord {
  readonly id: string;
  readonly name: string;
  readonly phase: number;
  readonly guide: { readonly summary: string; readonly rules?: string };
}

const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'content', 'manifest.json'), 'utf8')) as { enabledHabitats: string[] };
const habitat = (id: string) => JSON.parse(readFileSync(join(REPO_ROOT, 'content', 'habitats', `${id}.json`), 'utf8')) as HabitatRecord;
const V1_IDS: Readonly<Record<string, string>> = { WATER_GARDEN: 'empty', GEL_COLONY: 'gel', SEDIMENT_EDGE: 'sediment' };

/** The habitat start ids this build should offer, in list order (phase, then id). */
const EXPECTED_HABITAT_STARTS = manifest.enabledHabitats
  .map(habitat)
  .sort((a, b) => a.phase - b.phase || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  .map((h) => V1_IDS[h.id] ?? `habitat:${h.id}`);

const SLOW = 300_000;

async function openNewDish(page: Page): Promise<void> {
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByTestId('home-new').click();
  await expect(page.getByRole('heading', { name: 'New dish', level: 1 })).toBeVisible();
  await expect(page.getByTestId('new-dish-summary')).toBeVisible();
}

/** Every visible text inside `selector` is at least 16 px (UX §4.1/§9). */
async function expectTextAtLeast16px(page: Page, selector: string): Promise<void> {
  const small = await page.evaluate((sel) => {
    const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(sel))) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim() ?? '';
        const el = n.parentElement;
        if (!text || !el || el.closest('.sr-only')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const fs = parseFloat(getComputedStyle(el).fontSize);
        if (fs < 15.9) out.push(`${el.tagName.toLowerCase()}.${el.className}: ${fs}px “${text.slice(0, 40)}”`);
      }
    }
    return out;
  }, selector);
  expect(small).toEqual([]);
}

/** The carbon "added with the food and founders" in the ledger line. */
async function addedCarbon(page: Page): Promise<number> {
  const text = (await page.getByTestId('new-dish-ledger').textContent()) ?? '';
  const m = /plus ([\d.]+) added/.exec(text);
  expect(m, text).not.toBeNull();
  return Number(m![1]);
}

async function chooseStart(page: Page, id: string): Promise<void> {
  const option = page.getByTestId(`new-dish-start-with-${id}`);
  await expectReachable(option);
  await option.click();
  await expect(option).toHaveAttribute('aria-checked', 'true');
}

test('New Dish matches the build manifest: one start per offered habitat, the v1.0 starts unchanged', async ({ page }, info) => {
  test.setTimeout(SLOW);
  await openNewDish(page);
  const ids = await page
    .getByTestId('new-dish-start-with')
    .getByRole('radio')
    .evaluateAll((els) => els.map((e) => (e.getAttribute('data-testid') ?? '').replace(/^new-dish-start-with-/, '')));
  expect(ids[0]).toBe('garden');
  expect(ids.filter((id) => id !== 'garden' && !id.startsWith('curated:'))).toEqual(EXPECTED_HABITAT_STARTS);
  // The habitat starts sit between the Garden and the curated dishes.
  expect(ids.slice(1, 1 + EXPECTED_HABITAT_STARTS.length)).toEqual(EXPECTED_HABITAT_STARTS);
  if (!manifest.enabledHabitats.some((h) => h.startsWith('H'))) {
    // Before THE HABITAT ENABLE: exactly the three v1.0 starts.
    expect(EXPECTED_HABITAT_STARTS).toEqual(['empty', 'gel', 'sediment']);
  }

  // Empty Gel Colony: today's one habitat line, nothing new.
  await chooseStart(page, 'gel');
  const gel = habitat('GEL_COLONY');
  await expect(page.getByTestId('new-dish-habitat')).toHaveText(`${gel.name}: ${gel.guide.summary} ${gel.guide.rules ?? ''} No life until you add it.`);
  await expect(page.getByTestId('new-dish-community')).toHaveCount(0);
  await expect(page.getByTestId('new-dish-places')).toHaveCount(0);
  await expect(page.getByTestId('new-dish-regions')).toHaveCount(0);
  await expect(page.getByTestId('new-dish-life')).toHaveCount(0);
  await expectNoSeriousA11yViolations(page);
  await expectTextAtLeast16px(page, '[data-testid="new-dish-summary"]');
  if (info.project.name === 'phone-portrait') await expectNoHorizontalOverflow(page);
});

test('Leaf Pool: Empty, then the Suggested Community, then Create opens the Lab paused with 25 organisms', async ({ page }, info) => {
  test.skip(!manifest.enabledHabitats.includes('H04_LEAF_POOL'), 'until THE HABITAT ENABLE (H04_LEAF_POOL not in the build manifest)');
  test.setTimeout(SLOW);
  await openNewDish(page);
  await chooseStart(page, 'habitat:H04_LEAF_POOL');
  const life = page.getByTestId('new-dish-community');
  await expect(life).toBeVisible();
  await expect(page.getByTestId('new-dish-community-empty')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('new-dish-places')).toHaveText('It places: Attachment mesh (197 cells), Nutrient basket (2), Leaf wafer (2).');
  await expect(page.getByTestId('new-dish-regions')).toHaveText('Regions: 1 West wafer, 2 Mesh patch, 3 East wafer.');
  await expect(page.getByTestId('new-dish-life')).toHaveText('No life until you add it.');
  const emptyAdded = await addedCarbon(page);

  const suggested = page.getByTestId('new-dish-community-suggested');
  await expectReachable(suggested);
  await suggested.click();
  await expect(suggested).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('new-dish-life')).toHaveText(
    'Suggested Community: 5 Crumbsmiths near West wafer, 5 Brothmakers near East wafer, 5 Creambuds near East wafer, 5 Cordweavers near Mesh patch and 5 Amoebae near Mesh patch.',
  );
  await expect.poll(() => addedCarbon(page)).toBeGreaterThan(emptyAdded);
  await expectNoSeriousA11yViolations(page);
  await expectTextAtLeast16px(page, '[data-testid="new-dish-summary"]');
  if (info.project.name === 'phone-portrait') await expectNoHorizontalOverflow(page);

  // Another start and back: life returns to Empty (never carried into another start).
  await chooseStart(page, 'gel');
  await expect(life).toHaveCount(0);
  await chooseStart(page, 'habitat:H04_LEAF_POOL');
  await expect(page.getByTestId('new-dish-community-empty')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('new-dish-community-suggested').click();
  await expect(page.getByTestId('new-dish-life')).toContainText('Suggested Community: 5 Crumbsmiths');

  await page.getByTestId('new-dish-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(page.getByTestId('sim-time')).toContainText('0:00 · 25 alive');
  // The region legend (Lab → Observe → Regions → Show readings) numbers the same three regions.
  await page.getByTestId('lab-cat-observe').click();
  await page.getByTestId('lab-regions').click();
  await page.getByTestId('probe-show').click();
  const sheet = page.getByTestId('probe-sheet');
  await expect(sheet.getByTestId('region-legend-list').getByRole('listitem')).toHaveText(['1 West wafer', '2 Mesh patch', '3 East wafer']);
});

test('Gate Lab Suggested Community: the summary names the starch and both sides; Create works', async ({ page }, info) => {
  test.skip(!manifest.enabledHabitats.includes('H10_GATE_LAB'), 'until THE HABITAT ENABLE (H10_GATE_LAB not in the build manifest)');
  test.setTimeout(SLOW);
  await openNewDish(page);
  await chooseStart(page, 'habitat:H10_GATE_LAB');
  const suggested = page.getByTestId('new-dish-community-suggested');
  await expectReachable(suggested);
  await suggested.click();
  await expect(page.getByTestId('new-dish-life')).toHaveText('Suggested Community: 5 Crumbsmiths near Left side and 5 Sprinters near Right side. It also adds: Starch.');
  await expect(page.getByTestId('new-dish-places')).toHaveText('It places: Fine membrane (6).');
  await expectNoSeriousA11yViolations(page);
  if (info.project.name === 'phone-portrait') await expectNoHorizontalOverflow(page);
  await page.getByTestId('new-dish-start').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await expect(page.getByTestId('sim-time')).toContainText('0:00 · 10 alive');
});
