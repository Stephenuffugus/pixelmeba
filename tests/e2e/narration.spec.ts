/**
 * P4.9 narration and the reduced-motion audit (UX §7.4, §8.3; D08 §09).
 *
 * A fake speechSynthesis is installed by an init script (it records each utterance's text), so the test
 * reads exactly what would have been spoken:
 *   • Garden with narration off (the default): pause, add food, save → nothing is spoken;
 *   • Settings → Sound → Narration on: the same actions speak exactly "Pause", "Add food", "Saved", in
 *     order, and their visible texts show (the Run control, the placement toast, the saved toast);
 *     Sound settings stay axe clean with the new control (48 px target);
 *   • reduced motion (the device setting, followed until Settings chooses): no CSS animation runs on the
 *     dish screen: the notice, the "Show me" highlight and a sheet all compute animation-name none, while
 *     the same highlight pulses with motion on (so the check can fail).
 */
import { expect, test, type Page } from '@playwright/test';
import { expectNoSeriousA11yViolations, expectReachable, seedSettings, simSeconds, tapViewport } from './helpers';

declare global {
  interface Window {
    __spoken?: string[];
  }
}

async function fakeSpeech(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const W = window as unknown as Record<string, unknown> & { __spoken: string[] };
    W.__spoken = [];
    class FakeUtterance {
      volume = 1;
      rate = 1;
      lang = '';
      onend: ((ev: unknown) => void) | null = null;
      onerror: ((ev: unknown) => void) | null = null;
      constructor(public text: string) {}
    }
    const synth = {
      speaking: false,
      pending: false,
      paused: false,
      speak(u: FakeUtterance) {
        W.__spoken.push(u.text);
        setTimeout(() => u.onend?.({}), 40);
      },
      cancel() {},
      pause() {},
      resume() {},
      getVoices: () => [],
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true, writable: true });
  });
}

const spoken = (page: Page) => page.evaluate(() => window.__spoken ?? []);

async function openGarden(page: Page): Promise<void> {
  await page.getByTestId('home-play').click();
  await page.getByTestId('start-garden').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('sim-time')).toContainText('56 alive');
}

/** Run, then pause by the player; feed once; save to a slot. Checks each visible text equivalent. */
async function pauseFeedSave(page: Page): Promise<void> {
  const run = page.getByTestId('run-toggle');
  await run.click();
  await expect(run).toHaveAccessibleName('Pause');
  await expect.poll(() => simSeconds(page), { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
  await run.click();
  await expect(run).toHaveAccessibleName('Run'); // the visible equivalent of "Pause"
  await page.getByTestId('action-feed').click();
  await page.getByTestId('feed-choose').click();
  await tapViewport(page, 0.62, 0.3);
  await expect(page.locator('.toast', { hasText: /Added sugar to \d+ cells/ })).toBeVisible(); // "Add food"
  await page.getByTestId('more').click();
  await page.getByTestId('more-save').click();
  await page.getByTestId('save-confirm').click();
  await expect(page.locator('.toast', { hasText: /^Saved “/ })).toBeVisible(); // "Saved"
}

test('narration off (the default): pause, add food and save speak nothing', async ({ page }) => {
  await fakeSpeech(page);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await openGarden(page);
  await pauseFeedSave(page);
  await page.waitForTimeout(500);
  expect(await spoken(page)).toEqual([]);
});

test('Settings → Sound → Narration on: the same actions speak "Pause", "Add food", "Saved" in order', async ({ page }) => {
  await fakeSpeech(page);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await page.getByRole('button', { name: 'Settings' }).click();
  const box = page.getByTestId('sound-settings');
  await expect(box).toBeVisible();
  const narration = page.getByRole('checkbox', { name: 'Narration (speak short phrases)' });
  await expect(narration).not.toBeChecked(); // off by default
  await narration.check();
  await expect(narration).toBeChecked();
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('pixelmeba.settings') ?? '{}') as { narration?: boolean }).narration)).toBe(true);
  await expect(box.getByText(/only when it is true on screen/)).toBeVisible();
  // The visible equivalent is the same meaning, not always the same words (the Run button, "Ate last second").
  await expect(page.locator('#sound-narration-note')).toContainText(
    'Speaks one of 16 short fixed phrases, such as “Pause” or “A cell split”, only when it is true on screen. It never reads numbers or names. What it says is always shown on screen too. Uses the voice volume.',
  );
  await expectReachable(page.getByTestId('setting-narration').locator('xpath=..'));
  await expectNoSeriousA11yViolations(page);
  expect(await spoken(page)).toEqual([]); // turning it on says nothing by itself

  await page.getByRole('button', { name: 'Back' }).click();
  await openGarden(page);
  await pauseFeedSave(page);
  await expect.poll(() => spoken(page)).toEqual(['Pause', 'Add food', 'Saved']);
  await page.waitForTimeout(500);
  expect(await spoken(page)).toEqual(['Pause', 'Add food', 'Saved']);
});

test('reduced motion: no CSS animation on the dish screen (notice, Show me highlight, sheet)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await seedSettings(page, { showPrompts: true }); // reduced motion follows the device (nothing chosen)
  await page.goto('/');
  await openGarden(page);
  const notice = page.locator('.prompt');
  await expect(notice).toContainText('Press play and look closely.');
  await notice.getByRole('button', { name: 'Dismiss' }).click();
  await expect(notice.locator('p')).toHaveText('Tap a Sprinter.');
  const look = page.getByTestId('action-look');
  const animation = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).animationName);

  /**
   * Press Show me and read the highlighted control's animation in the same task (the highlight lasts
   * 3 s; under load a separate read could come after it ended).
   */
  const showMeAnimation = () =>
    page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll<HTMLButtonElement>('.prompt button')).find((b) => b.textContent === 'Show me');
      btn?.click();
      const el = document.querySelector('[data-testid="action-look"]')!;
      return { highlighted: el.classList.contains('show-me'), name: getComputedStyle(el).animationName };
    });

  // Motion on: the Show me highlight pulses (so the check below can fail).
  expect(await showMeAnimation()).toEqual({ highlighted: true, name: 'show-me-pulse' });
  await expect(look).not.toHaveClass(/\bshow-me\b/, { timeout: 6000 });

  // The device asks for reduced motion: the app follows it, and nothing animates.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('html')).toHaveClass(/\breduced-motion\b/);
  expect(await showMeAnimation()).toEqual({ highlighted: true, name: 'none' }); // the outline stays, the pulse goes
  expect(await animation('.prompt')).toBe('none');
  await page.getByTestId('more').click();
  await expect(page.locator('.sheet').first()).toBeVisible();
  expect(await animation('.sheet')).toBe('none');
  // Nothing on the dish screen runs a CSS animation or transition (pseudo-elements included).
  const running = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('[data-testid="dish-screen"], [data-testid="dish-screen"] *'))) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        const dur = cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0);
        if (cs.animationName !== 'none' || dur) out.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className}${pseudo ?? ''}`);
      }
    }
    return out;
  });
  expect(running).toEqual([]);
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
});
