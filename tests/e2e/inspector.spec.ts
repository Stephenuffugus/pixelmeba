import { expect, test, type Locator } from '@playwright/test';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, selectOrganism, simSeconds, startGarden } from './helpers';

// P1.7 (SPEC §12.1, UX §5.1/§5.3): Summary, then each shortcut once.
test('tap an organism, read its Summary, and use each shortcut', async ({ page }) => {
  test.setTimeout(180_000);
  await startGarden(page);
  const id = await selectOrganism(page);
  const insp = page.getByTestId('inspector');
  await expect(insp.getByRole('heading', { level: 2 })).toContainText(`#${id}`);
  await expect(insp.getByTestId('constraint')).not.toBeEmpty();
  await expect(insp.getByRole('meter', { name: 'Energy' })).toBeVisible();
  await expect(insp.getByRole('meter', { name: 'Health' })).toBeVisible();

  // What does it eat? — its recorded diet and the measured intake.
  await insp.getByTestId('shortcut-eat').click();
  const answer = insp.getByTestId('shortcut-answer');
  await expect(answer).toContainText('What it eats');
  await expect(answer).toContainText(/It eats|makes its own food|catches other organisms/);
  await expect(answer).toContainText(/took in/);

  // Why did it stop? — jumps to "Happening now" and focuses the blockers.
  await insp.getByRole('tab', { name: 'Details' }).click();
  await insp.getByTestId('shortcut-why').click();
  await expect(insp.getByRole('tab', { name: 'Happening now' })).toHaveAttribute('aria-selected', 'true');
  const why = insp.getByTestId('why-stop');
  await expect(why).toBeFocused();
  await expect(why).toContainText("What's holding it back");
  await expect(why).toContainText(/split|slowing|food|room|energy|grow/i);

  // Where is its family? — a founder at 0:00 starts its own family.
  await insp.getByTestId('shortcut-family').click();
  await expect(answer).toContainText('Its family');
  await expect(answer).toContainText('It was added to the dish, so its family starts with it.');

  // What changed? — History opens at "What happened" for this kind of organism.
  await insp.getByTestId('shortcut-changed').click();
  const history = page.getByTestId('history');
  await expect(history).toBeVisible();
  await expect(history.getByRole('tab', { name: 'What happened' })).toHaveAttribute('aria-selected', 'true');
  await expect(history.getByTestId('history-organism')).toContainText(`#${id}`);
  await expect(history).toContainText(/Showing .+ events and events for the whole dish/);
  // P1.10: living biomass per species, as small multiples and in the table.
  await history.getByRole('tab', { name: 'Charts' }).click();
  await expect(history.getByRole('heading', { name: 'Living biomass' })).toBeVisible();
  await history.getByRole('tab', { name: 'Table' }).click();
  await expect(history.getByTestId('history-table').getByRole('columnheader', { name: 'Living biomass' })).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  await history.getByRole('tab', { name: 'What happened' }).click();
  await expectNoSeriousA11yViolations(page);
  await history.getByTestId('history-back').click();
  await expect(insp).toBeVisible();
  await expect(insp.getByRole('heading', { level: 2 })).toContainText(`#${id}`);
  await expectNoSeriousA11yViolations(page);
});

test('after divisions, "Where is its family?" rings living relatives and can show one', async ({ page }) => {
  test.setTimeout(240_000); // runs the dish past the first divisions under software WebGL
  await startGarden(page);
  await page.getByTestId('run-toggle').click();
  await page.keyboard.press('4');
  // Sunbeads first split at about 29 s (docs/reports/tune-g1.md, seed 104729).
  await expect.poll(() => simSeconds(page), { timeout: 180_000, intervals: [1000] }).toBeGreaterThanOrEqual(34);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  const id = await selectOrganism(page, [48.5, 48.5]); // the Sunbead patch
  const insp = page.getByTestId('inspector');
  await insp.getByTestId('shortcut-family').click();
  const answer = insp.getByTestId('shortcut-answer');
  await expect(answer).toContainText(/other living members? of its family|No other members of its family/);
  const members = answer.getByTestId('family-member');
  if ((await members.count()) === 0) test.skip(true, `#${id} has no living relatives in this run`);
  await expect(page.getByTestId('family-markers')).toBeAttached();
  // At least one ring is placed over a living relative (positions come from the renderer).
  await expect(page.locator('[data-testid="family-markers"] .family-marker:not([hidden])').first()).toBeVisible();
  const first = members.first();
  const label = await first.innerText();
  const other = /#(\d+)/.exec(label)![1]!;
  await first.click();
  await expect(insp.getByRole('heading', { level: 2 })).toContainText(`#${other}`);
  // The rings stay while looking at a relative; the new organism's answers start closed.
  await expect(page.getByTestId('family-markers')).toBeAttached();
  await expect(insp.getByTestId('shortcut-answer')).toHaveCount(0);
  // Hiding the rings closes the family answer instead of leaving it waiting.
  await insp.getByTestId('shortcut-family').click();
  await expect(insp.getByTestId('family-member').first()).toBeVisible();
  await insp.getByRole('button', { name: 'Hide family rings' }).click();
  await expect(page.getByTestId('family-markers')).toHaveCount(0);
  await expect(insp.getByTestId('shortcut-answer')).toHaveCount(0);
});


// G2 comprehension B1: a tap outside the dish never reaches the cell inspector, nothing throws, and the
// inspector keeps working afterwards (all three projects; the dark band below the dish on a phone).
test('taps around the dish edge: outside points open nothing and throw nothing; the inspector still works', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await startGarden(page);
  await page.getByRole('button', { name: 'Whole dish' }).click();
  const box = (await page.getByTestId('viewport').boundingBox())!;
  // Points outside the dish circle in every layout: the corners, the longer axis's ends (below the dish
  // on a phone in portrait, beside it on wide screens) and just beyond the rim on the diagonals. Only
  // points where the dish canvas itself is under the finger (no button over it) are tapped.
  const R = Math.min(box.width, box.height) / 2;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const candidates: [number, number][] = [
    [box.x + 4, box.y + 4],
    [box.x + box.width - 4, box.y + 4],
    [box.x + 4, box.y + box.height - 4],
    [box.x + box.width - 4, box.y + box.height - 4],
    [cx, box.y + box.height - 6],
    [cx, box.y + 6],
    [box.x + 6, cy],
    [box.x + box.width - 6, cy],
    ...[45, 135, 225, 315].map((deg): [number, number] => [cx + 1.03 * R * Math.cos((deg * Math.PI) / 180), cy + 1.03 * R * Math.sin((deg * Math.PI) / 180)]),
  ];
  const outside: [number, number][] = [];
  for (const [x, y] of candidates) {
    const onCanvas = await page.evaluate(([px, py]) => document.elementFromPoint(px!, py!)?.tagName === 'CANVAS', [x, y]);
    // Beyond the drawn dish: farther from its centre than its fitted radius (62 cells; the mask is 60).
    if (onCanvas && Math.hypot(x - cx, y - cy) > R) outside.push([x, y]);
  }
  expect(outside.length).toBeGreaterThanOrEqual(4);
  const insp = page.getByTestId('inspector');
  const toast = page.getByText('Outside the dish.');
  for (const [x, y] of outside) {
    await page.mouse.click(x, y);
    await expect(toast).toBeVisible();
    await expect(insp).toHaveCount(0);
    await expect(toast).toBeHidden();
  }
  // After zooming out as far as the dish allows, a tap beyond the rim is still rejected.
  for (let k = 0; k < 3; k++) await page.getByRole('button', { name: 'Zoom out' }).click();
  await page.mouse.click(...outside[0]!);
  await expect(toast).toBeVisible();
  await expect(insp).toHaveCount(0);
  await page.getByRole('button', { name: 'Whole dish' }).click();

  // A tap just inside the rim describes the cell under it, with measured values.
  const zoom = Math.min(box.width, box.height) / 124;
  const rimX = box.x + box.width / 2 + (4.5 - 64) * zoom; // cell 4 on the middle row: inside the mask
  await page.mouse.click(rimX, box.y + box.height / 2 + 0.5 * zoom);
  const list = page.getByRole('listbox', { name: 'Choose an organism' });
  await expect(list.or(insp)).toBeVisible();
  if (await list.isVisible()) await page.getByRole('button', { name: 'Cancel' }).click();
  else if (/^Cell /.test(await insp.getByRole('heading', { level: 2 }).innerText())) {
    await expect(insp.getByRole('heading', { level: 2 })).toHaveText(/^Cell \d+, \d+$/);
    await expect(insp).toContainText('pH');
    await expect(insp).not.toContainText('not measured');
    await insp.getByRole('button', { name: 'Close' }).click();
  }

  // The inspector still opens on an organism, and Continue still works.
  const id = await selectOrganism(page);
  await expect(insp.getByRole('heading', { level: 2 })).toContainText(`#${id}`);
  await insp.getByRole('tab', { name: 'Passed to offspring' }).click();
  await expect(insp.getByTestId('inherited-lead')).toContainText('A founder: it has no parent in this dish.');
  await insp.getByRole('button', { name: 'Close' }).click();
  // The dish still runs, and the inspector still opens afterwards.
  await page.getByTestId('run-toggle').click();
  await expect.poll(() => simSeconds(page), { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  await page.getByTestId('run-toggle').click();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await selectOrganism(page);
  await expect(insp.getByTestId('constraint')).not.toBeEmpty();
  // m12: a kind never added to the dish reads "none added yet" instead of a flat chart.
  await insp.getByTestId('shortcut-changed').click();
  await page.getByTestId('history').getByRole('tab', { name: 'Charts' }).click();
  await expect(page.getByTestId('history').getByText('Amoeba — none added yet')).toBeVisible();
  expect(errors).toEqual([]);
});

/** Every button's text inside its own box (no clipped labels; G2 comprehension M3). */
async function clippedButtons(scope: Locator): Promise<string[]> {
  return scope.evaluate((root) => {
    const out: string[] = [];
    for (const b of Array.from(root.querySelectorAll('button'))) {
      const r = b.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const range = document.createRange();
      range.selectNodeContents(b);
      for (const t of Array.from(range.getClientRects())) {
        if (t.width === 0) continue;
        if (t.left < r.left - 1 || t.right > r.right + 1 || t.top < r.top - 1 || t.bottom > r.bottom + 1) {
          out.push(`${b.textContent?.trim() ?? ''} (${Math.round(t.left - r.left)}…${Math.round(r.right - t.right)})`);
          break;
        }
      }
    }
    return out;
  });
}

// G2 comprehension M3: at 200 % text the inspector's tab names are never clipped, and the open tab's
// answer gets the sheet's height (phone portrait and landscape; desktop too).
test('at 200 % text the inspector tabs are read whole and the open tab gets the sheet', async ({ page }) => {
  test.setTimeout(180_000);
  await startGarden(page, { textScale: 2 });
  await selectOrganism(page);
  const insp = page.getByTestId('inspector');
  const tabs = insp.getByRole('tab');
  await expect(tabs).toHaveText(['Happening now', 'Passed to offspring', 'Details']);
  expect(await clippedButtons(insp)).toEqual([]);
  for (const name of ['Passed to offspring', 'Happening now', 'Details']) {
    const tab = insp.getByRole('tab', { name });
    await tab.scrollIntoViewIfNeeded();
    const b = (await tab.boundingBox())!;
    expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(47.5);
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    // The open tab's answer shows more than a line: at least 40 % of the sheet's scroll area.
    const panel = insp.getByRole('tabpanel');
    const visible = await panel.evaluate((p) => {
      const sc = p.closest('.sheet-scroll')!.getBoundingClientRect();
      const r = p.getBoundingClientRect();
      return { shown: Math.min(r.bottom, sc.bottom) - Math.max(r.top, sc.top), sheet: sc.height, total: r.height };
    });
    expect(visible.shown).toBeGreaterThanOrEqual(Math.min(visible.total, visible.sheet * 0.4) - 2);
    expect(await clippedButtons(insp)).toEqual([]);
  }
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
});
