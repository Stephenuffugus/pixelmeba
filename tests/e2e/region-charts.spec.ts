/**
 * Phase 5 wave 11 region-charts-gates journey (SPEC §12.4, §12.8; UX §5.4, §9; D-0119). The membrane
 * fixture dish (tests/e2e/regionFixture.ts: a fine membrane down the middle, sugar on the left, Sprinters
 * on both sides) is imported through Saved dishes. In Lab → Observe → Regions one rectangle is drawn on
 * each side of the membrane, the dish runs 30 dish seconds, and the Regions sheet shows for both regions
 * charts of each second with a "Show as table" toggle that gives a captioned table, the fine membrane in
 * the Gates section with a sugar amount and "0 organisms crossed", and the reason a decaying pool is not
 * measured. No screenshot assertions; axe, no sideways overflow, readable text and 48 px targets.
 */
import { expect, test, type Page } from '@playwright/test';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT } from '../../tools/lib/content-fs';
import { FIXTURE_TICKS, writeMembraneFixture } from './regionFixture';
import {
  chooseSpeed,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  expectReachable,
  seedSettings,
  simSeconds,
} from './helpers';

const FIXTURE = join(REPO_ROOT, 'tmp', 'e2e-region-charts', `membrane-${process.pid}.pixelmeba`);

test.beforeAll(async () => {
  test.setTimeout(120_000);
  await writeMembraneFixture(FIXTURE);
});

test.afterAll(() => rmSync(FIXTURE, { force: true }));

/** One mouse drag across the dish at the whole-dish zoom, in cells (as observe-tools.spec.ts draws). */
async function drag(page: Page, from: [number, number], to: [number, number]): Promise<void> {
  const box = await page.getByTestId('viewport').boundingBox();
  if (!box) throw new Error('no viewport');
  const zoom = Math.min(box.width, box.height) / 124;
  const at = (cx: number, cy: number): [number, number] => [
    box.x + box.width / 2 + (cx - 64) * zoom,
    box.y + box.height / 2 + (cy - 64) * zoom,
  ];
  const a = at(...from);
  const b = at(...to);
  await page.mouse.move(a[0], a[1]);
  await page.mouse.down();
  await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 6 });
  await page.mouse.move(b[0], b[1], { steps: 6 });
  await page.mouse.up();
}

/** Inside the panel: every text at least 16 CSS px and every button a 48 px target (sr-only content skipped). */
async function expectReadableTargets(page: Page, testid: string): Promise<void> {
  const bad = await page.evaluate((id) => {
    const root = document.querySelector(`[data-testid="${id}"]`);
    if (!root) return [`no ${id}`];
    const out: string[] = [];
    for (const el of Array.from(root.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || el.closest('.sr-only')) continue;
      const text = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? '').trim() !== '');
      if (text && el.closest('svg')) {
        if (r.height < 15) out.push(`svg text "${el.textContent}" ${r.height.toFixed(1)}px tall`);
      } else if (text && parseFloat(getComputedStyle(el).fontSize) < 15.9)
        out.push(`"${(el.textContent ?? '').slice(0, 30)}" ${getComputedStyle(el).fontSize}`);
      if ((el.tagName === 'BUTTON' || el.classList.contains('observe-radio')) && Math.min(r.width, r.height) < 47.5)
        out.push(`target "${(el.textContent ?? '').slice(0, 30)}" ${r.width.toFixed(0)}×${r.height.toFixed(0)}`);
    }
    return out;
  }, testid);
  expect(bad).toEqual([]);
}

test('Regions on the membrane dish: charts with a table, the gate’s sugar and no organism crossing', async ({ page }) => {
  test.setTimeout(420_000);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Saved dishes' }).click();
  await page.locator('input[aria-label="Import a dish file"]').setInputFiles(FIXTURE);
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const start = await simSeconds(page);
  expect(start).toBe(FIXTURE_TICKS / 10);

  await page.getByTestId('view-toggle').click();
  await expect(page.getByTestId('lab-bar')).toBeVisible();
  await page.getByRole('button', { name: 'Whole dish' }).click();
  await page.getByTestId('lab-cat-observe').click();
  await expect(page.getByTestId('lab-tray')).toHaveAttribute('data-category', 'observe');
  await page.getByTestId('lab-regions').click();
  await expect(page.getByTestId('probe-session')).toBeVisible();
  // A: the left side up to column 63 (beside the membrane); B: the right side from column 64. Both in the
  // dish's lower part, clear of the drawing panel that covers its upper half on a 360 px phone.
  await drag(page, [63.5, 86.5], [12.5, 118.5]);
  await expect(page.getByTestId('probe-count')).toHaveText('1 of 6 regions');
  await drag(page, [64.5, 86.5], [115.5, 118.5]);
  await expect(page.getByTestId('probe-count')).toHaveText('2 of 6 regions');

  // Run 30 dish seconds at 4×, then pause.
  await page.getByTestId('run-toggle').click();
  await chooseSpeed(page, 4);
  await expect.poll(() => simSeconds(page), { timeout: 300_000, intervals: [500] }).toBeGreaterThanOrEqual(start + 30);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');

  await page.getByTestId('probe-show').click();
  const sheet = page.getByTestId('probe-sheet');
  await expect(sheet).toBeVisible();
  for (const id of ['A', 'B']) {
    const charts = sheet.getByTestId(`probe-charts-${id}`);
    await expect(charts).toBeVisible();
    await expect(charts.locator('figure[data-chart="living"] svg')).toBeVisible();
    await expect(charts.locator('figure[data-chart="net:sugar"] figcaption')).toContainText('Sugar net into the region each second');
    // Sprinters may cross the region's other edges (rows near the rim); never the membrane (below).
    await expect(sheet.getByTestId(`probe-crossings-${id}`)).toHaveText(/^(No organism entered or left in the last 60 s\.|(Sprinter: entered \d+, left \d+)\.)$/);
    // The membrane is on both regions' edge, with a sugar amount and no organism.
    const gates = sheet.getByTestId(`probe-gates-${id}`);
    await expect(gates).toContainText('Fine membrane');
    await expect(gates).toContainText(/Measured since each of these edges was placed: Sugar \d/);
    await expect(gates).toContainText(/(In the last 60 s|Since \d+:\d\d): Sugar \d/);
    await expect(gates).toContainText('0 organisms crossed');
    // A decaying pool says why it is not measured.
    await expect(sheet.getByTestId(`probe-boundary-${id}`)).toContainText('Not measured here: it also decays while it spreads.');
  }
  await expect(sheet.getByTestId('probe-boundary-A')).toContainText(/Sugar.*out of the region/);
  await expect(sheet.getByTestId('probe-boundary-B')).toContainText(/Sugar.*into the region/);
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  await expectReadableTargets(page, 'probe-sheet');

  // Show as table: the same series as a captioned table.
  const toggle = sheet.getByTestId('probe-table-toggle-A');
  await expectReachable(toggle);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(toggle).toHaveText('Show as charts');
  const table = sheet.getByTestId('probe-series-A');
  await expect(table).toBeVisible();
  await expect(table.locator('caption')).toHaveText('Region A: each recorded second of the last 60 s');
  await expect(table.getByRole('columnheader', { name: 'Sugar net into the region' })).toBeVisible();
  expect(await table.locator('tbody tr').count()).toBeGreaterThanOrEqual(30);
  await expect(sheet.getByTestId('probe-charts-A')).toBeHidden();
  await expect(sheet.getByTestId('probe-charts-B')).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  await expectReadableTargets(page, 'probe-sheet');
  await toggle.click();
  await expect(sheet.getByTestId('probe-charts-A')).toBeVisible();
});
