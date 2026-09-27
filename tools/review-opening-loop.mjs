// G1 opening-loop review: drive the built app like a player and capture evidence.
// Usage: npx vite build && npx vite preview --port 4173 --host 127.0.0.1, then
//   node tools/review-opening-loop.mjs [width height tag]  (writes docs/reports/img/g1/<tag>-*.png)
import { chromium } from 'playwright';
const OUT = new URL('../docs/reports/img/g1/', import.meta.url).pathname;
const W = Number(process.argv[2] ?? 1440), H = Number(process.argv[3] ?? 900), TAG = process.argv[4] ?? 'desktop';
/** @param {string} k @param {Record<string, unknown>} v */
const log = (k, v) => console.log(JSON.stringify({ step: k, ...v }));
const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: W, height: H } });
const p = await ctx.newPage();
p.on('pageerror', (e) => log('pageerror', { msg: e.message }));
await p.addInitScript(() => { if (localStorage.getItem('pixelmeba.settings') === null) localStorage.setItem('pixelmeba.settings', JSON.stringify({ showPrompts: false })); });
await p.goto('http://127.0.0.1:4173/');
await p.getByTestId('home-play').click();
await p.getByTestId('start-garden').click();
await p.getByTestId('sim-time').filter({ hasText: '56 alive' }).waitFor();
const shot = (n) => p.screenshot({ path: `${OUT}${TAG}-${n}.png` });
const simTime = async () => (await p.getByTestId('sim-time').innerText()).trim();
const secs = async () => { const m = /^(?:(\d+):)?(\d+):(\d+)/.exec(await simTime()); return (Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3]); };
await shot('01-open');
log('open', { time: await simTime() });
// Run at 4× to ~40 s.
await p.getByTestId('run-toggle').click();
await p.keyboard.press('4');
while ((await secs()) < 40) await p.waitForTimeout(1000);
await p.getByTestId('run-toggle').click();
await shot('02-growth');
log('growth', { time: await simTime() });
// Zoom into the starch patch (66,64) to look for catalysis dust and sugar haze.
const vp = await p.getByTestId('viewport').boundingBox();
await p.getByRole('button', { name: 'Whole dish' }).click();
const z0 = Math.min(vp.width, vp.height) / 124;
const at = (x, y, z = z0, cx = 64, cy = 64) => [vp.x + vp.width / 2 + (x - cx) * z, vp.y + vp.height / 2 + (y - cy) * z];
const [sx, sy] = at(66, 64);
await p.mouse.move(sx, sy);
for (let k = 0; k < 12; k++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(60); }
await p.waitForTimeout(800);
await shot('03-starch-patch');
// Tap a Crumbsmith there and ask what it eats (try taps around the patch until one is picked).
const list = p.getByRole('listbox', { name: 'Choose an organism' });
const insp = p.getByTestId('inspector');
const zNow = Math.min(32, z0 * Math.pow(Math.exp(0.18), 12));
let found = false;
for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1], [-2, -1], [2, 1], [-1, 2], [1, -2], [-2, 2], [2, -2]]) {
  await p.mouse.click(sx + dx * zNow, sy + dy * zNow);
  await list.or(insp).first().waitFor();
  if (await list.isVisible()) {
    const opts = list.getByRole('option');
    const n = await opts.count();
    for (let i = 0; i < n; i++) if (/Crumbsmith/.test(await opts.nth(i).innerText())) { await opts.nth(i).click(); break; }
    if (await list.isVisible()) await p.keyboard.press('Escape');
  }
  if ((await insp.count()) && /Crumbsmith/.test(await insp.getByRole('heading', { level: 2 }).innerText().catch(() => ''))) { found = true; break; }
  if (await insp.count()) await insp.getByRole('button', { name: 'Close' }).first().click();
}
log('crumbsmith', { found });
log('selected', { heading: await insp.getByRole('heading', { level: 2 }).innerText().catch(() => '?') });
if (await insp.getByTestId('shortcut-eat').count()) {
  await insp.getByTestId('shortcut-eat').click();
  log('eat', { text: await insp.getByTestId('shortcut-answer').innerText() });
}
await shot('04-inspect-eat');
if (await insp.getByTestId('shortcut-why').count()) {
  await insp.getByTestId('shortcut-why').click();
  await p.waitForTimeout(300);
  log('why', { text: (await insp.innerText()).slice(0, 600) });
  await shot('05-why');
}
await insp.getByRole('button', { name: 'Close' }).first().click();
// Intervene: feed sugar where the Sprinters gather, the old sugar patch at (48,64) (whole dish view).
await p.getByRole('button', { name: 'Whole dish' }).click();
await p.getByTestId('action-feed').click();
const choose = p.getByTestId('feed-choose');
if (await choose.count()) await choose.first().click().catch(() => {});
const [fx, fy] = at(48, 64);
await p.mouse.click(fx, fy);
await p.waitForTimeout(800);
log('feed', { toast: await p.locator('[role=status]').allInnerTexts().catch(() => []) });
await shot('06-feed');
// Watch the consequence for ~15 s, then inspect the fed cell.
await p.getByTestId('run-toggle').click();
const t1 = await secs();
while ((await secs()) < t1 + 15) await p.waitForTimeout(1000);
await p.getByTestId('run-toggle').click();
let sprinter = false;
for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 2], [-2, -2], [2, -2], [-2, 2]]) {
  await p.mouse.click(fx + dx * z0, fy + dy * z0);
  await list.or(insp).first().waitFor();
  if (await list.isVisible()) {
    const opts = list.getByRole('option');
    const n = await opts.count();
    for (let i = 0; i < n; i++) if (/Sprinter/.test(await opts.nth(i).innerText())) { await opts.nth(i).click(); break; }
    if (await list.isVisible()) await p.keyboard.press('Escape');
  }
  if ((await insp.count()) && /Sprinter/.test(await insp.getByRole('heading', { level: 2 }).innerText().catch(() => ''))) { sprinter = true; break; }
  if (await insp.count()) await insp.getByRole('button', { name: 'Close' }).first().click();
}
if (sprinter) await insp.getByTestId('shortcut-eat').click();
log('consequence', { text: (await insp.innerText()).slice(0, 500) });
await shot('07-consequence');
await insp.getByRole('button', { name: 'Close' }).first().click();
// Inherited difference or its recorded absence: History → What happened.
await p.getByTestId('more').click();
await p.getByTestId('more-history').click();
const hist = p.getByTestId('history');
await hist.getByRole('tab', { name: 'What happened' }).click();
await p.waitForTimeout(500);
const events = await hist.innerText();
log('history', { mutationLines: events.split('\n').filter((l) => /inherit|differ|mutation|changed/i.test(l)).slice(0, 8) });
await shot('08-history');
await hist.getByRole('tab', { name: 'Charts' }).click();
await p.waitForTimeout(500);
await shot('09-charts');
await p.keyboard.press('Escape');
if (await hist.isVisible()) await hist.getByRole('button', { name: 'Close' }).first().click().catch(() => {});
// Save, reload, continue.
await p.getByTestId('more').click();
await p.getByTestId('more-save').click();
await p.getByTestId('save-confirm').click();
await p.waitForTimeout(800);
const savedAt = await simTime();
await p.reload();
await p.getByTestId('home-continue').click();
await p.getByTestId('dish-screen').waitFor();
await p.waitForTimeout(1500);
log('reload', { savedAt, afterReload: await simTime() });
await shot('10-reloaded');
// Duplicate.
await p.getByTestId('more').click();
await p.getByRole('button', { name: /Duplicate dish/ }).click();
await p.waitForTimeout(1500);
log('duplicate', { title: await p.locator('.topbar').innerText() });
await shot('11-duplicate');
await b.close();
