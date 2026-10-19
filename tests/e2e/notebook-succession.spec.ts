/**
 * P5.6 part 3 journey (SPEC §12.8; D02 §23; D-0131): the Garden runs two simulated minutes at 4×; Home → Notebook →
 * Succession lists two minute entries, newest first ("Minute 2 (1:00–2:00)", "Minute 1 (0:00–1:00)"), each with its
 * sentences and a Look back button that opens the dish's History. Nothing was pushed as a notice for them. The tab
 * sits after "Something happened"; the list is a list; text ≥ 16 px; controls ≥ 48 px; axe and no sideways overflow.
 * No screenshot assertions.
 */
import { expect, test } from '@playwright/test';
import { chooseSpeed, expectNoHorizontalOverflow, expectNoSeriousA11yViolations, simSeconds, startGarden } from './helpers';

test('two minutes of the Garden: two minute entries in Notebook → Succession, each with a Look back to History', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await startGarden(page);
  await page.getByTestId('run-toggle').click();
  await chooseSpeed(page, 4);
  await expect.poll(() => simSeconds(page), { timeout: 300_000, intervals: [1000] }).toBeGreaterThanOrEqual(121);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('home-notebook').click();
  await expect(page.getByTestId('notebook')).toBeVisible();

  // The tab order: Something happened, then Succession.
  const tabs = page.getByRole('tablist', { name: 'Notebook sections' }).getByRole('tab');
  await expect(tabs.nth(0)).toHaveText(/^Something happened/);
  await expect(tabs.nth(1)).toHaveText('Succession');
  await page.getByTestId('notebook-tab-succession').click();
  await expect(page.getByTestId('notebook-tab-succession')).toHaveAttribute('aria-selected', 'true');
  const list = page.getByTestId('succession-list');
  await expect(list).toBeVisible();
  await expect(page.getByRole('list', { name: /^Minutes of “.+”, newest first$/ })).toBeVisible();
  const entries = list.getByTestId('succession-entry');
  await expect(entries).toHaveCount(2);
  await expect(entries.nth(0).getByRole('heading')).toHaveText('Minute 2 (1:00–2:00)');
  await expect(entries.nth(1).getByRole('heading')).toHaveText('Minute 1 (0:00–1:00)');
  for (let k = 0; k < 2; k++) {
    const lines = entries.nth(k).getByTestId('succession-line');
    expect(await lines.count()).toBeGreaterThan(0);
    await expect(lines.first()).toHaveText(/\.$/);
  }
  // Sentences from recorded measurements only (gains or losses of living biomass in the Garden).
  await expect(entries.nth(1)).toContainText(/(gained|lost) \d+\.\d\d carbon of living biomass this minute\./);
  await expect(entries.nth(1)).not.toContainText(/because|superior|advanced|perfect|adapted|immune/i);
  const small = await page.getByTestId('succession-list').evaluate((root) =>
    Array.from(root.querySelectorAll('*'))
      .filter((el) => Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== ''))
      .map((el) => parseFloat(getComputedStyle(el).fontSize))
      .filter((px) => px < 15.9),
  );
  expect(small).toEqual([]);
  for (const b of await list.getByTestId('succession-look-back').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);

  // Look back opens the dish's History.
  await entries.nth(1).getByRole('button', { name: 'Look back: minute 1' }).click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('history')).toBeVisible();
  // Fix round 1: at "What happened", showing that minute.
  await expect(page.getByTestId('history-tab-events')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('history-minute')).toContainText('Showing Minute 1 (0:00–1:00)');
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run'); // the dish stays paused
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  expect(errors).toEqual([]);
});
