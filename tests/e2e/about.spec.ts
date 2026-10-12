/**
 * P4.12 (PLAY_STORE_CHECKLIST §A "Accessibility statement in About"; PRIVACY_POLICY.md): Home → About shows the
 * app version (one source: package.json, tests/tools/version-scheme.test.ts), the content hash this build
 * ships, the accessibility statement and the privacy line; no serious axe violation; text ≥ 16 px; nothing
 * scrolls sideways at 200 % text, where Back stays a 48 px target.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectReachable, seedSettings } from './helpers';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSION = (JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string }).version;
const CONTENT_HASH = (JSON.parse(readFileSync(join(ROOT, 'content', 'manifest.json'), 'utf8')) as { contentHash: string }).contentHash;
const ACCESSIBILITY =
  'Accessibility: every control works with a keyboard; the dish has a screen-reader summary and a selected-cell description; Reduced motion, Quiet audio, Simplified overlay colours and text up to 200 % are in Settings.';
const PRIVACY = 'Privacy: Pixelmeba collects no data. Saves stay on this device (your phone\'s own backup may copy them). Files leave it only when you choose Share or Export.';

async function openAbout(page: Page): Promise<void> {
  await page.goto('/');
  const about = page.getByRole('button', { name: 'About', exact: true });
  await expectReachable(about);
  await about.click();
  await expect(page.getByRole('heading', { level: 1, name: 'About Pixelmeba' })).toBeVisible();
}

/** Every visible text node under `selector` is at least 16 px (UX §9). */
async function smallText(page: Page, selector: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const root of Array.from(document.querySelectorAll(sel))) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim() ?? '';
        const el = n.parentElement;
        if (!text || !el || el.closest('.sr-only')) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (parseFloat(getComputedStyle(el).fontSize) < 15.9) out.push(`${el.tagName.toLowerCase()} “${text.slice(0, 40)}”`);
      }
    }
    return out;
  }, selector);
}

test('Home → About: version 1.0.0, the content hash, the accessibility statement and the privacy line', async ({ page }) => {
  await seedSettings(page, { showPrompts: false });
  await openAbout(page);
  expect(VERSION).toBe('1.0.0');
  const versions = page.getByTestId('about-versions');
  await expect(versions).toContainText(`App version${VERSION}`);
  await expect(versions).toContainText(`Content hash${CONTENT_HASH}`);
  await expect(page.getByTestId('about-accessibility')).toHaveText(ACCESSIBILITY);
  await expect(page.getByTestId('about-privacy')).toHaveText(PRIVACY);
  // Said once: the description no longer repeats where saves live.
  await expect(page.getByText(/saved only on this device|Nothing is uploaded/)).toHaveCount(0);
  await expect(page.getByText('Saves stay on this device', { exact: false })).toHaveCount(1);
  // The description keeps the fictional-simulation note.
  await expect(page.locator('main')).toContainText('Every organism, rate and chemical is a fictional game rule, not a real laboratory measurement.');
  expect(await smallText(page, 'main')).toEqual([]);
  await expectNoSeriousA11yViolations(page);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'About', exact: true })).toBeVisible();
});

test('About at 200 % text: nothing sideways, Back reachable, both statements whole', async ({ page }) => {
  await seedSettings(page, { showPrompts: false, textScale: 2 });
  await openAbout(page);
  await expect(page.getByTestId('about-accessibility')).toHaveText(ACCESSIBILITY);
  await expect(page.getByTestId('about-privacy')).toHaveText(PRIVACY);
  await expectReachable(page.getByRole('button', { name: 'Back' }));
  await page.getByTestId('about-privacy').scrollIntoViewIfNeeded();
  await expect(page.getByTestId('about-privacy')).toBeInViewport();
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);
});
