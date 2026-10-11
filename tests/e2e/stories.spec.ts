/**
 * P4.2 journey (SPEC §12.7, UX §5.9; D-0079): the Garden runs at 4×; nothing is announced in its first
 * 60 dish seconds (the first minute belongs to the arrival line and the prompts) → the one story notice
 * "Something happened: <the card the pacer picked>" shows once, no sooner than tick 600 (no second notice
 * beside it) → Open shows that card in Notebook → Something happened with its dish times and the "Memory,
 * not replay" badge (Open pauses the running dish: it leaves the dish screen) → Spotlight returns to the
 * dish at the speed it had before Open (4×, running again: D08 §07's pause-and-restore, the Field Guide's
 * convention) → Home → "A first split" opened from the Notebook list (not from the notice) with its three
 * captions → Spotlight moves only the view and keeps the dish paused (the worker's state hash is
 * unchanged) → Dismiss files the card under Dismissed cards. Which card the pacer announces first is
 * pickStory's choice among the cards found in the first minute (unit-tested in tests/ui/stories.test.ts);
 * this journey reads it from the notice rather than assuming a template. The tab, the card and the dish after Spotlight have no serious accessibility
 * violations; Home's Notebook button shows the quiet dot while a card is unseen. The state hash and tick
 * are asked of the worker through the protocol's read-only 'hash' request, and every setSpeed the UI
 * sends is recorded (an init script wraps the page's Worker; the app has no test hook).
 */
import { expect, test, type Page } from '@playwright/test';
import { PROTOCOL_VERSION } from '../../src/worker/protocol';
import { chooseSpeed, expectNoHorizontalOverflow, expectNoSeriousA11yViolations, expectSpeed, startGarden } from './helpers';

async function watchWorker(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { Worker: typeof Worker; __pm: { workers: Worker[]; dishId: string | null; next: number; speeds: number[] } };
    const Orig = w.Worker;
    w.__pm = { workers: [], dishId: null, next: 1_000_000_000, speeds: [] };
    w.Worker = class extends Orig {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        w.__pm.workers.push(this);
        this.addEventListener('message', (e: MessageEvent<{ type?: string; info?: { dishId: string } }>) => {
          if ((e.data?.type === 'ready' || e.data?.type === 'loaded') && e.data.info) w.__pm.dishId = e.data.info.dishId;
        });
      }
      override postMessage(msg: unknown, ...rest: unknown[]): void {
        const m = msg as { type?: string; speed?: number };
        if (m?.type === 'setSpeed' && typeof m.speed === 'number') w.__pm.speeds.push(m.speed);
        (super.postMessage as (...a: unknown[]) => void)(msg, ...rest);
      }
    };
  });
}

async function lastSpeedSent(page: Page): Promise<number | undefined> {
  return page.evaluate(() => (window as unknown as { __pm: { speeds: number[] } }).__pm.speeds.at(-1));
}

async function workerHash(page: Page): Promise<string> {
  return (await workerState(page)).hash;
}

async function workerTick(page: Page): Promise<number> {
  return (await workerState(page)).tick;
}

async function workerState(page: Page): Promise<{ hash: string; tick: number }> {
  return page.evaluate(async (protocolVersion) => {
    const pm = (window as unknown as { __pm: { workers: Worker[]; dishId: string | null; next: number } }).__pm;
    const worker = pm.workers[pm.workers.length - 1];
    if (!worker || !pm.dishId) throw new Error('no worker or dish yet');
    const requestId = pm.next++;
    return new Promise<{ hash: string; tick: number }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no hash reply')), 10_000);
      const on = (e: MessageEvent<{ type: string; requestId?: number; hash?: string; tick?: number; message?: string }>) => {
        if (e.data?.requestId !== requestId) return;
        worker.removeEventListener('message', on);
        clearTimeout(timer);
        if (e.data.type === 'hash' && e.data.hash && typeof e.data.tick === 'number') resolve({ hash: e.data.hash, tick: e.data.tick });
        else reject(new Error(e.data.message ?? e.data.type));
      };
      worker.addEventListener('message', on);
      worker.postMessage({ type: 'hash', requestId, dishId: pm.dishId, protocolVersion });
    });
  }, PROTOCOL_VERSION);
}

const STORY_WINDOW_TICKS = 600; // src/persistence/notebookStories.ts (60 simulated seconds)

test('Garden at 4×: quiet first minute, then one card announced once; the card, Spotlight restores 4× (view only otherwise), A first split and Dismiss', async ({ page }) => {
  test.setTimeout(300_000);
  await watchWorker(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await startGarden(page);
  await page.getByTestId('run-toggle').click();
  await chooseSpeed(page, 4);

  // D-0079: no story notice in the dish's first 60 seconds (several cards are found meanwhile, quietly).
  await expect.poll(() => workerTick(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(STORY_WINDOW_TICKS / 2);
  await expect(page.getByTestId('story-notice')).toHaveCount(0);

  // Then one card is announced in the one notice place, whichever the pacer picked, once the window opens.
  const notice = page.getByTestId('story-notice');
  await expect(notice.locator('p')).toHaveText(/^Something happened: (A first split|An enzyme at work|A family changed|A place changed)$/, { timeout: 150_000 });
  expect((await workerState(page)).tick).toBeGreaterThanOrEqual(STORY_WINDOW_TICKS);
  const announced = (await notice.locator('p').innerText()).replace(/^Something happened: /, '');
  await expect(page.getByTestId('story-notice')).toHaveCount(1);
  await expect(page.locator('.prompt[role="status"]')).toHaveCount(1); // never a second visible notice
  await expect(notice.getByRole('button', { name: 'Open' })).toBeVisible();
  await expect(notice.getByRole('button', { name: 'Dismiss this notice' })).toBeVisible();

  // Open → Notebook → Something happened, the card open (leaving the dish screen pauses it).
  await notice.getByTestId('story-notice-open').click();
  await expect(page.getByTestId('notebook')).toBeVisible();
  await expect.poll(() => lastSpeedSent(page)).toBe(0);
  await expect(page.getByTestId('notebook-tab-stories')).toHaveAttribute('aria-selected', 'true');
  const tabs = page.getByRole('tab');
  await expect(tabs.first()).toHaveText(/^Something happened/);
  const card = page.getByTestId('story-card');
  await expect(card.getByRole('heading', { name: announced })).toBeVisible(); // the very card the notice announced
  await expect(card.getByTestId('story-badge')).toHaveText('Memory, not replay');
  const opened = card.getByTestId('story-panel');
  expect(await opened.count()).toBeGreaterThan(0);
  for (let i = 0; i < (await opened.count()); i++) await expect(opened.nth(i).locator('.story-time')).toHaveText(/\d+:\d\d$/);
  await expect(card.getByRole('button', { name: 'Save picture' })).toHaveCount(0); // arrives with P4.6
  await expectNoHorizontalOverflow(page);
  await expectNoSeriousA11yViolations(page);

  // Paused while the card is read: the world does not move.
  const s0 = await workerState(page);
  await page.waitForTimeout(500);
  expect(await workerState(page)).toEqual(s0);

  // Spotlight from the notice's visit: back to the dish at the speed it had before Open (4×, running).
  await card.getByTestId('story-spotlight').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect.poll(() => lastSpeedSent(page)).toBe(4);
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Pause');
  await expectSpeed(page, 4);
  await expect.poll(() => workerTick(page), { timeout: 20_000 }).toBeGreaterThan(s0.tick);
  await expectNoSeriousA11yViolations(page);

  // Home's Notebook button carries the quiet dot while a card is unseen (the Garden recorded several).
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect.poll(() => lastSpeedSent(page)).toBe(0); // leaving the dish screen pauses it
  await expect(page.getByTestId('home-notebook').getByTestId('story-dot')).toBeVisible();
  await page.getByTestId('home-notebook').click();
  await expect(page.getByTestId('notebook-tab-stories')).toHaveAttribute('aria-selected', 'true');
  const list = page.getByTestId('stories-list').first();
  await expect(list).toBeVisible();
  await expectNoSeriousA11yViolations(page);

  // "A first split" opened from the list (not the notice; found in the first minute): its three captions.
  // Spotlight moves only the view and the dish stays paused; nothing in the dish changes (same hash, same tick).
  await list.getByTestId('story-open-firstSplit').first().click();
  const split = page.getByTestId('story-card');
  await expect(split.getByRole('heading', { name: 'A first split' })).toBeVisible();
  await expect(split.getByTestId('story-badge')).toHaveText('Memory, not replay');
  const panels = split.getByTestId('story-panel');
  await expect(panels).toHaveCount(3);
  await expect(panels.nth(0)).toContainText(/ was growing\./);
  await expect(panels.nth(1)).toContainText('A cell split. Its offspring inherited these traits.');
  await expect(panels.nth(2)).toContainText(/daughters carry/);
  for (let i = 0; i < 3; i++) await expect(panels.nth(i).locator('.story-time')).toHaveText(/\d+:\d\d$/);
  await expectNoSeriousA11yViolations(page);
  const speedsBefore = await page.evaluate(() => (window as unknown as { __pm: { speeds: number[] } }).__pm.speeds.length);
  const h0 = await workerHash(page);
  await page.getByTestId('story-spotlight').click();
  await expect(page.getByTestId('dish-screen')).toBeVisible();
  await expect(page.getByTestId('run-toggle')).toHaveAttribute('aria-label', 'Run');
  await page.waitForTimeout(500);
  expect(await workerHash(page)).toBe(h0);
  expect(await page.evaluate(() => (window as unknown as { __pm: { speeds: number[] } }).__pm.speeds.length)).toBe(speedsBefore);
  await expectNoSeriousA11yViolations(page);

  // Dismiss: the card leaves the list for the Dismissed group; the dish is still unchanged.
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByTestId('home-notebook').click();
  await expect(page.getByTestId('notebook-tab-stories')).toHaveAttribute('aria-selected', 'true');
  await page.getByTestId('stories-list').first().getByTestId('story-open-firstSplit').first().click();
  await expect(page.getByTestId('story-card')).toBeVisible();
  await page.getByTestId('story-dismiss').click();
  await expect(page.locator('.story-dismissed summary')).toContainText('Dismissed cards (1)');
  expect(await workerHash(page)).toBe(h0);
  expect(pageErrors).toEqual([]);
});
