/**
 * P3.10 Audio (W5-23): Settings → Sound is reachable and operable by keyboard; mute and a volume change
 * the stored settings; the screen is axe clean, has 48 px targets and ≥ 16 px text, and works at 200 %
 * text. Also: no AudioContext before the first gesture (autoplay), and a player's select plays a cue
 * that mute silences. The page's AudioContext is wrapped in an init script that only counts.
 */
import { expect, test, type Page } from '@playwright/test';
import {
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  expectReachable,
  seedSettings,
  selectOrganism,
  startGarden,
} from './helpers';

declare global {
  interface Window {
    __audio?: { contexts: number; oscillators: number; states: string[]; freqs: number[] };
  }
}

async function countAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const W = window as unknown as {
      AudioContext?: typeof AudioContext;
      __audio: { contexts: number; oscillators: number; states: string[]; freqs: number[] };
    };
    W.__audio = { contexts: 0, oscillators: 0, states: [], freqs: [] };
    const Base = W.AudioContext;
    if (!Base) return;
    class Counted extends Base {
      constructor() {
        super();
        W.__audio.contexts++;
        W.__audio.states.push(this.state);
      }
      override createOscillator(): OscillatorNode {
        W.__audio.oscillators++;
        const o = super.createOscillator();
        // A cue sets its pitch with setValueAtTime (src/audio/SoundKit.ts); record it to tell cues apart.
        const set = o.frequency.setValueAtTime.bind(o.frequency);
        o.frequency.setValueAtTime = (v: number, t: number) => {
          W.__audio.freqs.push(v);
          return set(v, t);
        };
        return o;
      }
    }
    W.AudioContext = Counted;
  });
}

const audio = (page: Page) => page.evaluate(() => window.__audio!);
const stored = (page: Page) =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem('pixelmeba.settings') ?? '{}') as Record<string, unknown>,
  );

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
        if (fs < 15.9)
          out.push(`${el.tagName.toLowerCase()}.${el.className}: ${fs}px “${text.slice(0, 40)}”`);
      }
    }
    return out;
  }, selector);
  expect(small).toEqual([]);
}

/** Tab forward until `testId` has focus (at most `max` presses). */
async function tabTo(page: Page, testId: string, max = 40): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await page.evaluate((id) => document.activeElement?.getAttribute('data-testid') === id, testId))
      return;
  }
  throw new Error(`${testId} not reached by Tab`);
}

test('Settings → Sound: keyboard, stored settings, targets, text size, axe; no audio before a gesture', async ({
  page,
}) => {
  await countAudio(page);
  await seedSettings(page, { showPrompts: false });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  // Autoplay: nothing is created before the first gesture.
  expect((await audio(page)).contexts).toBe(0);

  // Reach Settings by keyboard from Home (a key press is the first gesture).
  await page.getByRole('button', { name: 'Settings' }).focus();
  await page.keyboard.press('Enter');
  const box = page.getByTestId('sound-settings');
  await expect(box).toBeVisible();
  await expect.poll(async () => (await audio(page)).contexts).toBe(1);

  // Every sound control is labelled and reachable by Tab; Space toggles mute; arrows move a slider.
  await expect(page.getByRole('checkbox', { name: 'Mute all sound' })).toBeVisible();
  await expect(page.getByRole('slider', { name: /Effects volume/ })).toBeVisible();
  await expect(page.getByRole('slider', { name: /Music volume/ })).toBeVisible();
  await expect(page.getByRole('slider', { name: /Voice volume/ })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Quiet audio' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Haptics' })).toBeVisible();
  // Truthful note (fix 1): the Android build has no VIBRATE permission until P4.10.
  await expect(page.getByText(/The Android app does not vibrate yet\./)).toBeVisible();

  await page.locator('body').focus();
  await tabTo(page, 'setting-muted');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('setting-muted')).toBeChecked();
  expect((await stored(page)).muted).toBe(true);

  await tabTo(page, 'setting-effectsVolume', 4);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(async () => (await stored(page)).effectsVolume).toBeCloseTo(0.65, 6);
  await expect(page.getByText('Effects volume 65 %')).toBeVisible();

  await tabTo(page, 'setting-musicVolume', 4);
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await stored(page)).musicVolume).toBeCloseTo(0.45, 6);
  await tabTo(page, 'setting-voiceVolume', 4);
  await tabTo(page, 'setting-quietAudio', 4);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await stored(page)).quietAudio).toBe(true);
  await tabTo(page, 'setting-haptics', 4);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await stored(page)).haptics).toBe(true);

  // The choices survive a reload (stored device preferences).
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByTestId('setting-muted')).toBeChecked();
  await expect(page.getByTestId('setting-effectsVolume')).toHaveValue('0.65');

  // 48 px targets and ≥ 16 px text, axe clean.
  for (const id of ['setting-muted', 'setting-quietAudio', 'setting-haptics'])
    await expectReachable(page.getByTestId(id).locator('xpath=..'));
  for (const id of ['setting-effectsVolume', 'setting-musicVolume', 'setting-voiceVolume'])
    await expectReachable(page.getByTestId(id));
  await expectTextAtLeast16px(page, '[data-testid="sound-settings"]');
  await expectNoSeriousA11yViolations(page);

  // 200 % text: the controls stay reachable, nothing scrolls sideways, still axe clean.
  await page.getByTestId('text-size-200').click();
  await expect(page.locator('html')).toHaveAttribute('data-text-scale', '2');
  for (const id of ['setting-muted', 'setting-quietAudio', 'setting-haptics'])
    await expectReachable(page.getByTestId(id).locator('xpath=..'));
  for (const id of ['setting-effectsVolume', 'setting-musicVolume', 'setting-voiceVolume'])
    await expectReachable(page.getByTestId(id));
  await expectNoHorizontalOverflow(page);
  await expectTextAtLeast16px(page, '[data-testid="sound-settings"]');
  await expectNoSeriousA11yViolations(page);
});

test('a player select plays a cue', async ({ page }) => {
  await countAudio(page);
  await startGarden(page);
  await expect.poll(async () => (await audio(page)).contexts).toBe(1);
  // The select cue is one 880 Hz oscillator voice (src/audio/patches.ts PATCHES.select).
  expect((await audio(page)).freqs).not.toContain(880);
  await selectOrganism(page);
  await expect.poll(async () => (await audio(page)).freqs).toContain(880);
});

test('muted: a select plays nothing and no ambient loop starts', async ({ page }) => {
  await countAudio(page);
  await startGarden(page, { muted: true });
  await expect.poll(async () => (await audio(page)).contexts).toBe(1);
  const muted = (await audio(page)).oscillators;
  expect(muted).toBe(0);
  await selectOrganism(page);
  await expect(page.getByTestId('inspector')).toBeVisible();
  await page.waitForTimeout(300);
  expect((await audio(page)).oscillators).toBe(muted);
  expect((await audio(page)).freqs).toEqual([]);
});
