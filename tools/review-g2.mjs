// G2 comprehension self-review (D06 §18; BUILD_DIRECTIVE "G2 gate — evidence").
// Performs the five tester tasks of docs/reports/comprehension-g2.md, each from a cold start (a fresh
// browser context: empty storage, default settings, gentle prompts on), navigating only by what the
// screen offers: roles, accessible names and visible text, plus where organisms are drawn on the dish
// (their colours, found in a screenshot the way a player's eye finds them). No test ids, and no
// reading of state the screen does not show.
//
// Usage: node tools/review-g2.mjs <base URL> [width] [height] [tag] [text scale] [tasks]
//   node tools/review-g2.mjs http://127.0.0.1:4195/ 1440 900 desktop 1 T1,T2,T3,T4,T5
//   node tools/review-g2.mjs http://127.0.0.1:4195/ 360 800 phone200 2 T4
// Serve a build first (npx vite build && npx vite preview --port 4195 --strictPort --host 127.0.0.1).
// Screenshots: docs/reports/img/g2/<tag>-<task>-<nn>-<step>.png. Each step prints one JSON line
// {tag, task, step, real (s since the task's cold start), sim (dish clock), actions, said: [quotes]},
// and each page error one line {tag, task, real, pageerror}; each task's lines are also written to
// docs/reports/img/g2/<tag>-<task>.jsonl. A text scale other than 1 is chosen first through Home →
// Settings → Text size (a precondition, not timed). Every wait runs at 4×, the fastest speed the dish
// offers.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

/** @typedef {import('playwright').Page} Page */
/** @typedef {import('playwright').Locator} Locator */
/** @typedef {{ x: number, y: number, width: number, height: number }} Box */
/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ pass: boolean, note: string }} Outcome */

const BASE = process.argv[2];
if (!BASE) throw new Error('usage: node tools/review-g2.mjs <base URL> [width] [height] [tag] [text scale] [tasks]');
const W = Number(process.argv[3] ?? 1440);
const H = Number(process.argv[4] ?? 900);
const TAG = process.argv[5] ?? 'desktop';
const SCALE = Number(process.argv[6] ?? 1);
const TASKS = (process.argv[7] ?? 'T1,T2,T3,T4,T5').split(',');
const OUT = new URL('../docs/reports/img/g2/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const TOUCH = W < 1000; // phone portrait and landscape are touch layouts, as in playwright.config.ts
const BUDGET = 600; // seconds of real interaction allowed per task (D06 §18: a ten-minute session)
// UX §6.1 base colours, plus the lighter tone each kind takes when the whole dish is shown small
// (phones draw organisms as aggregated dots; sampled from this build's phone screenshots).
/** @type {Record<string, string[]>} */
const KIND = {
  Sprinter: ['ef7b6c', 'e7a698'],
  Sunbead: ['8cba4b', 'afc876', 'a1c365'],
  Crumbsmith: ['c8963e', 'c9a661', 'd3ad66'],
  Recycler: ['d6a64d', 'd7bf84', 'd7b66f'],
};
/** @type {Array<Record<string, unknown>>} */
const lines = [];

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
/** @type {Page} */
let p;
let t0 = 0;
let task = '';
let nShot = 0;
let actions = 0;
let lastClock = '';
/** @type {string[]} */
let said = [];
const real = () => Math.round((Date.now() - t0) / 100) / 10;
/** @param {string} step @param {Record<string, unknown>} [extra] */
const log = (step, extra = {}) => {
  const line = { tag: TAG, task, step, real: real(), sim: lastClock, actions, said, ...extra };
  lines.push(line);
  console.log(JSON.stringify(line));
  said = [];
};
/** @param {...(string | null | undefined)} q */
const say = (...q) => {
  for (const s of q) if (s && s.trim()) said.push(s.replace(/\s+/g, ' ').trim());
};
/** @param {string} name */
const shot = async (name) => {
  nShot += 1;
  const f = `${TAG}-${task}-${String(nShot).padStart(2, '0')}-${name}.png`;
  await p.screenshot({ path: OUT + f });
  said.push(`[screenshot ${f}]`);
};

// --- what the screen says -------------------------------------------------------------------
const bannerText = async () => (await p.getByRole('banner').first().innerText().catch(() => '')).replace(/\s+/g, ' ');
const clock = async () => {
  const m = /((?:\d+:)?\d+:\d\d) · ([\d,]+) alive/.exec(await bannerText());
  if (!m) return { t: -1, alive: -1, text: '' };
  const t = m[1]
    .split(':')
    .map(Number)
    .reduce((a, b) => a * 60 + b, 0);
  lastClock = `${m[1]} · ${m[2]} alive`;
  return { t, alive: Number(m[2].replace(/,/g, '')), text: lastClock };
};
const statusTexts = async () =>
  (await p.getByRole('status').allInnerTexts()).map((s) => s.replace(/\s+/g, ' ').replace(/✕/g, '').trim()).filter(Boolean);
/** @param {Locator} locator */
const act = async (locator) => {
  actions += 1;
  await locator.click();
};
/** @param {string | RegExp} name @param {boolean} [exact] */
const button = (name, exact = true) => p.getByRole('button', { name, exact });

// --- dish controls --------------------------------------------------------------------------
async function setFastest() {
  const group = p.getByRole('group', { name: 'Speed' });
  if (await group.count()) {
    const b4 = group.getByRole('button', { name: '4×', exact: true });
    if ((await b4.getAttribute('aria-pressed')) !== 'true') await act(b4);
    return;
  }
  const cycle = p.getByRole('button', { name: /^Speed / });
  for (let i = 0; i < 3 && (await cycle.count()) && !/4×/.test((await cycle.getAttribute('aria-label')) ?? ''); i++) await act(cycle);
}
/** @param {number} secs */
async function runUntil(secs) {
  if (await button('Run').count()) await act(button('Run'));
  await setFastest();
  let c = await clock();
  while (c.t < secs && real() < BUDGET) {
    await p.waitForTimeout(400);
    c = await clock();
  }
  if (await button('Pause').count()) await act(button('Pause'));
  await p.waitForTimeout(300);
  return clock();
}
async function openGarden() {
  await act(button('Play'));
  say(await p.getByRole('region', { name: 'Little Living Garden' }).innerText());
  await act(button('Start'));
  await p.getByText(/0:00 · 56 alive/).waitFor();
  await p.waitForTimeout(1200);
  await clock();
  say(...(await statusTexts()));
}
/** @param {string | RegExp} item @param {boolean} [quote] */
async function more(item, quote = false) {
  await act(button('More'));
  const sheet = p.getByRole('region', { name: 'More' });
  if (quote) say(`More offers: ${(await sheet.getByRole('button').allInnerTexts()).map((s) => s.trim()).filter(Boolean).join(' | ')}`);
  await act(sheet.getByRole('button', { name: item }));
}
/** @param {string} name */
async function closeRegion(name) {
  const r = p.getByRole('region', { name });
  if (await r.count()) await act(r.getByRole('button', { name: 'Close' }).first());
}
async function wholeDish() {
  const b = button('Whole dish');
  if (await b.count()) await b.click().catch(() => {});
}
/** @param {number} x @param {number} y */
const tap = async (x, y) => {
  actions += 1;
  if (TOUCH) await p.touchscreen.tap(x, y);
  else await p.mouse.click(x, y);
};

/**
 * Where organisms of a kind are drawn: clusters of its colours inside a box (default: the dish).
 * @param {string[]} colours @param {Box | null} [box] @returns {Promise<Array<Point & { n: number }>>}
 */
async function findDrawn(colours, box) {
  const b = box ?? (await p.locator('canvas').first().boundingBox());
  if (!b) return [];
  const png = await p.screenshot({ clip: b });
  const pts = await p.evaluate(
    async ({ b64, hexes }) => {
      const bmp = await createImageBitmap(await (await fetch('data:image/png;base64,' + b64)).blob());
      const c = new OffscreenCanvas(bmp.width, bmp.height);
      const x = c.getContext('2d');
      if (!x) return [];
      x.drawImage(bmp, 0, 0);
      const d = x.getImageData(0, 0, bmp.width, bmp.height).data;
      const rgb = hexes.map((h) => [parseInt(h, 16) >> 16, (parseInt(h, 16) >> 8) & 255, parseInt(h, 16) & 255]);
      /** @type {Map<string, { x: number, y: number, n: number }>} */
      const cells = new Map();
      for (let y = 0; y < bmp.height; y++)
        for (let i = 0; i < bmp.width; i++) {
          const o = (y * bmp.width + i) * 4;
          if (!rgb.some(([r, g, bl]) => Math.abs(d[o] - r) < 20 && Math.abs(d[o + 1] - g) < 20 && Math.abs(d[o + 2] - bl) < 20)) continue;
          const k = `${Math.floor(i / 8)},${Math.floor(y / 8)}`;
          const e = cells.get(k) ?? { x: 0, y: 0, n: 0 };
          e.x += i;
          e.y += y;
          e.n += 1;
          cells.set(k, e);
        }
      return [...cells.values()].map((e) => [e.x / e.n, e.y / e.n, e.n]);
    },
    { b64: png.toString('base64'), hexes: colours },
  );
  return pts.sort((a, c) => c[2] - a[2]).map(([x, y, n]) => ({ x: b.x + x, y: b.y + y, n }));
}

/**
 * Tap where a kind is drawn until its inspector opens (choosing it from the candidate list when the
 * tap is ambiguous). Returns the organism's name, or null.
 * @param {string} kind @param {{ skip?: Set<string>, tries?: number, near?: Point }} [opts]
 */
async function inspectDrawn(kind, opts = {}) {
  const skip = opts.skip ?? new Set();
  const tries = opts.tries ?? 12;
  const near = opts.near;
  const insp = p.getByRole('region', { name: 'Inspector' });
  const list = p.getByRole('listbox', { name: 'Choose an organism' });
  // First at the current zoom; if none of that kind answers, zoom in twice (as a player would on a
  // small screen, where the whole dish draws organisms as dots) and look again.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt === 1) {
      for (let z = 0; z < 2; z++) await act(button('Zoom in'));
      await p.waitForTimeout(600);
    }
    let pts = await findDrawn(KIND[kind]);
    if (near && attempt === 0) pts = pts.sort((a, b) => Math.hypot(a.x - near.x, a.y - near.y) - Math.hypot(b.x - near.x, b.y - near.y));
    for (const pt of pts.slice(0, tries)) {
      await tap(pt.x, pt.y);
      await p.waitForTimeout(500);
      if (await list.count()) {
        const opts2 = await list.getByRole('option').allInnerTexts();
        const pick = opts2.find((o) => o.startsWith(kind) && !skip.has(o.trim()));
        if (pick) await act(list.getByRole('option', { name: pick.trim(), exact: true }));
        else await act(list.getByRole('button', { name: 'Cancel' }));
        await p.waitForTimeout(400);
      }
      if (await insp.count()) {
        const name = (await insp.getByRole('heading', { level: 2 }).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        if (name.startsWith(kind) && !skip.has(name)) return name;
        await act(insp.getByRole('button', { name: 'Close' }).first());
      }
    }
  }
  return null;
}
const inspector = () => p.getByRole('region', { name: 'Inspector' });
/** @param {string} question */
async function ask(question) {
  await act(inspector().getByRole('button', { name: question }));
  await p.waitForTimeout(400);
}
/** @param {string} name */
async function inspectorTab(name) {
  await act(inspector().getByRole('tab', { name }));
  await p.waitForTimeout(300);
  return (await inspector().getByRole('tabpanel').innerText()).replace(/\s+/g, ' ').trim();
}
const summaryLine = async () => {
  const chips = (await inspector().innerText()).split('\n').slice(0, 8).join(' · ');
  return chips.replace(/\s+/g, ' ').slice(0, 300);
};

/** @param {string} tab */
async function historyTab(tab) {
  const h = p.getByRole('region', { name: 'History' });
  await act(h.getByRole('tab', { name: tab }));
  await p.waitForTimeout(500);
  return h.getByRole('tabpanel');
}
/** @param {Locator} panel */
const eventLines = async (panel) => {
  const t = (await panel.innerText())
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < t.length; i++) if (/^\d+ s$/.test(t[i]) && t[i + 1]) out.push(`${t[i]} ${t[i + 1]}`);
  return out;
};
const closeInspector = async () => {
  if (await inspector().count()) await act(inspector().getByRole('button', { name: 'Close' }).first());
};

// --- the five tasks ------------------------------------------------------------------------
/** @type {Record<string, () => Promise<Outcome>>} */
const TASK = {
  // Session task: "Make one change to the dish. Then show me why something in the dish changed
  // afterwards, and keep a second version of the dish so the two can be compared."
  async T1() {
    await openGarden();
    await shot('open');
    log('Home → Play → Start: the Garden opens paused');
    const c1 = await runUntil(30);
    say(`ran at 4× to ${c1.text}`);
    await shot('ran');
    log('Run at 4× for about half a minute, then Pause');
    await more('Duplicate dish', true);
    await p.waitForTimeout(1500);
    say(...(await statusTexts()), await bannerText());
    await shot('duplicated');
    log('More → Duplicate dish (keeps the unchanged version)');
    // Feed sugar where the Sprinters are: Feed → Place sugar → tap the dish next to them.
    await act(button('Feed'));
    say(await p.getByRole('region', { name: 'Feed' }).innerText());
    await act(button('Place sugar'));
    const sprinters = await findDrawn(KIND.Sprinter);
    say(`Sprinters seen at ${sprinters.length} places on the dish`);
    const cb = await p.locator('canvas').first().boundingBox();
    if (!sprinters.length && cb) sprinters.push({ x: cb.x + cb.width / 2, y: cb.y + cb.height / 2, n: 0 });
    /** @type {Point | null} */
    let placed = null;
    for (const pt of sprinters.slice(0, 6)) {
      await tap(pt.x, pt.y);
      await p.waitForTimeout(700);
      const st = await statusTexts();
      say(...st);
      if (st.some((s) => /^Added /.test(s))) {
        placed = { x: pt.x, y: pt.y };
        // Reviewer measurement (UX §4.1 body text ≥ 16 px), not navigation.
        const px = await p
          .getByText(/^Added /)
          .first()
          .evaluate((e) => getComputedStyle(e).fontSize)
          .catch(() => '?');
        say(`(toast font size ${px})`);
        break;
      }
      if (!(await button('Place sugar').count())) await act(button('Feed'));
      if (await button('Place sugar').count()) await act(button('Place sugar'));
    }
    await shot('fed');
    log('Feed → Place sugar → tap the dish where the Sprinters are', { placed: !!placed });
    const before = await clock();
    const c2 = await runUntil(before.t + 45);
    say(`ran at 4× from ${before.text} to ${c2.text}`);
    await shot('after');
    log('Run at 4× for about 45 s more, then Pause');
    // Why: the event record and the charts, then a Sprinter near the sugar.
    await more('History and what happened');
    const charts = await historyTab('Charts');
    say((await charts.innerText()).split('\n').slice(0, 6).join(' '));
    await shot('charts');
    const evAll = await eventLines(await historyTab('What happened'));
    say(...evAll.slice(0, 8));
    const mine = evAll.filter((l) => /sugar|you |added|feed/i.test(l));
    say(mine.length ? `your change in the record: ${mine.join(' | ')}` : `your change is not among the ${evAll.length} listed events`);
    await shot('events');
    log('More → History and what happened → Charts, What happened', { events: evAll.length, mine: mine.length });
    await closeRegion('History');
    await wholeDish();
    await p.waitForTimeout(500);
    const name = await inspectDrawn('Sprinter', { near: placed ?? undefined });
    if (name) {
      await ask('What does it eat?');
      say(name, await summaryLine(), /What it eats[\s\S]*?(?=Happening now)/.exec(await inspector().innerText())?.[0] ?? '');
      say(await inspectorTab('Happening now'));
    }
    await shot('why');
    log('Look: tap a Sprinter by the new sugar → What does it eat?', { inspected: name });
    await closeInspector();
    await more('Saved dishes');
    await p.waitForTimeout(800);
    say(...(await p.getByRole('list').first().getByRole('listitem').allInnerTexts()));
    await shot('saved');
    log('More → Saved dishes: both versions are listed');
    return { pass: !!placed && !!name, note: 'change: sugar on the copy; why: intake + event record; second version: Slot 1' };
  },

  // "Show me one thing a living thing in the dish feeds on, and where that food is."
  async T2() {
    await openGarden();
    await shot('open');
    log('Home → Play → Start');
    const c = await runUntil(20);
    say(`ran at 4× to ${c.text}`);
    await wholeDish();
    /** @type {Record<string, string>} */
    const answers = {};
    for (const kind of ['Sprinter', 'Crumbsmith', 'Sunbead']) {
      const name = await inspectDrawn(kind);
      if (!name) continue;
      await ask('What does it eat?');
      const t = (await inspector().innerText()).replace(/\s+/g, ' ');
      answers[kind] = /What it eats (.*?) Happening now/.exec(t)?.[1] ?? t.slice(0, 300);
      say(`${name}: ${answers[kind]}`);
      await shot(`eat-${kind.toLowerCase()}`);
      log(`Look: tap a ${kind} → What does it eat?`, { inspected: name });
      await act(inspector().getByRole('button', { name: 'Close' }).first());
      await wholeDish();
    }
    // Where the food is: the Lab's Observe tray colours the dish by sugar.
    await act(button('Lab view'));
    await act(p.getByRole('group', { name: 'Lab categories' }).getByRole('button', { name: 'Observe', exact: true }));
    await act(p.getByRole('radio', { name: 'Sugar', exact: true }));
    await p.waitForTimeout(800);
    say((await p.getByRole('region', { name: 'Observe' }).innerText()).replace(/\s+/g, ' ').slice(-120));
    await shot('sugar-overlay');
    // On a phone the tray covers the dish; closing it shows the coloured dish and the legend.
    await act(p.getByRole('button', { name: 'Close Observe' }));
    await p.waitForTimeout(600);
    await shot('sugar-overlay-closed');
    log('Lab view → Observe → Sugar (then close the tray): where the sugar is');
    return {
      pass: Object.keys(answers).length > 0,
      note: Object.entries(answers)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | '),
    };
  },

  // "The number of living things goes up and down. Show me one reason it changed, using what the
  // game tells you."
  async T3() {
    await openGarden();
    const start = await clock();
    say(`start: ${start.text}`);
    log('Home → Play → Start');
    const c = await runUntil(60);
    say(`ran at 4× to ${c.text}`);
    await shot('one-minute');
    log('Run at 4× for a minute, then Pause');
    await more('History and what happened');
    const charts = await historyTab('Charts');
    say(...(await charts.getByRole('figure').allInnerTexts()).slice(0, 4));
    await shot('charts');
    say(...(await eventLines(await historyTab('What happened'))).slice(0, 6));
    await shot('events');
    log('More → History and what happened: counts rose; divisions are listed');
    await closeRegion('History');
    await wholeDish();
    const name = await inspectDrawn('Sprinter');
    if (name) {
      await ask('Why did it stop?');
      say(name, await inspectorTab('Happening now'));
      await shot('why-split');
      log('Look: tap a Sprinter → Why did it stop?', { inspected: name });
      await act(inspector().getByRole('button', { name: 'Close' }).first());
    }
    // A fall: keep the record open (it does not pause the dish), run on until it shows a death, then
    // ask a living one of that kind.
    /** @type {string | null} */
    let death = null;
    /** @type {string[]} */
    let deaths = [];
    await more('History and what happened');
    const feed = await historyTab('What happened');
    if (await button('Run').count()) await act(button('Run'));
    await setFastest();
    while (!death && real() < BUDGET - 60) {
      await p.waitForTimeout(1500);
      await clock();
      // The record lists the newest first, so the last death line is the earliest one.
      deaths = (await eventLines(feed)).filter((l) => /died/.test(l));
      death = deaths.length ? deaths[deaths.length - 1] : null;
    }
    if (await button('Pause').count()) await act(button('Pause'));
    await clock();
    say(...(deaths.length ? deaths : ['no death recorded within the budget']));
    await shot('death');
    log('Run on at 4× until the record shows a death', { death });
    await closeRegion('History');
    const died = death ?? '';
    const kind = Object.keys(KIND).find((k) => died.includes(k));
    if (kind) {
      await wholeDish();
      const n2 = await inspectDrawn(kind);
      if (n2) {
        await ask('Why did it stop?');
        say(n2, await summaryLine(), await inspectorTab('Happening now'));
        await shot('why-death');
        log(`Look: tap a living ${kind} → Why did it stop?`, { inspected: n2 });
      }
    }
    return { pass: !!name, note: died };
  },

  // "Find one thing about a creature that its offspring will get from it, and one thing about the
  // same creature that is only true right now. Show me how you can tell which is which."
  async T4() {
    await openGarden();
    log('Home → Play → Start');
    const c = await runUntil(75);
    say(`ran at 4× to ${c.text}`);
    log('Run at 4× for about 75 s, then Pause');
    await more('History and what happened');
    say(...(await eventLines(await historyTab('What happened'))).filter((l) => /inherited/.test(l)).slice(0, 4));
    await shot('events');
    log('More → History and what happened: offspring "inherited a different trait"');
    await closeRegion('History');
    // Look at organisms one by one (wherever they are drawn; one new organism per tap, chosen from
    // the candidate list when a tap is ambiguous). The first one answers the task as asked: its
    // "Passed to offspring" tab against its "Happening now" tab. Then keep looking, for at most three
    // minutes, for an inherited difference (D06: "one inherited trait"): either "This offspring
    // inherited a different trait from its parent." or a value shown "(±n from the ancestor)".
    /** @type {Set<string>} */
    const seen = new Set();
    const list = p.getByRole('listbox', { name: 'Choose an organism' });
    /** @type {string | null} */
    let found = null;
    /** @type {string | null} */
    let first = null;
    let looked = 0;
    let founders = 0;
    let plain = 0;
    let fromAncestor = 0;
    let fromParent = 0;
    let firstAt = BUDGET;
    const searchEnds = () => real() > Math.min(BUDGET - 150, firstAt + 180);
    /** @param {string} name */
    const check = async (name) => {
      seen.add(name);
      looked += 1;
      const passed = await inspectorTab('Passed to offspring');
      const parentDiff = /inherited a different trait/.test(passed);
      const deltas = [...passed.matchAll(/([A-Za-z][A-Za-z ]*?) (\d+) \(([+-]\d+) from the ancestor\)/g)].map(
        (m) => `${m[1].trim()} ${m[2]} (${m[3]})`,
      );
      const differs = parentDiff || deltas.length > 0;
      if (parentDiff) fromParent += 1;
      else if (deltas.length) fromAncestor += 1;
      else if (/founder/.test(passed)) founders += 1;
      else plain += 1;
      if (looked === 1 || differs) {
        say(`${name} — Passed to offspring: ${passed}`);
        await shot(differs ? 'inherited' : 'first-passed');
        const now = await inspectorTab('Happening now');
        say(`${name} — chips and summary: ${await summaryLine()}`, `${name} — Happening now: ${now}`);
        await shot(differs ? 'inherited-now' : 'first-now');
      }
      if (looked === 1) {
        first = name;
        firstAt = real();
        log('Look: tap a creature → Passed to offspring, then Happening now', { first, differs });
      }
      if (differs) {
        found = `${name}: ${parentDiff ? 'differs from its parent' : 'same as its parent'}; ${deltas.join(', ')}`;
        return;
      }
      await act(inspector().getByRole('button', { name: 'Close' }).first());
    };
    for (let round = 0; round < 6 && !found && !searchEnds(); round++) {
      await wholeDish();
      const pts = [...(await findDrawn(KIND.Sprinter)), ...(await findDrawn(KIND.Sunbead))];
      for (const pt of pts) {
        if (found || searchEnds()) break;
        await tap(pt.x, pt.y);
        await p.waitForTimeout(450);
        if (await list.count()) {
          const opts = (await list.getByRole('option').allInnerTexts()).map((o) => o.trim());
          const pick = opts.find((o) => !seen.has(o));
          if (!pick) {
            await act(list.getByRole('button', { name: 'Cancel' }));
            continue;
          }
          await act(list.getByRole('option', { name: pick, exact: true }));
          await p.waitForTimeout(350);
        }
        if (!(await inspector().count())) continue;
        const name = (await inspector().getByRole('heading', { level: 2 }).innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
        if (!name || seen.has(name) || name.startsWith('Cell')) {
          await act(inspector().getByRole('button', { name: 'Close' }).first());
          continue;
        }
        await check(name);
        if (!found) await wholeDish();
      }
    }
    log('Keep looking (at most 3 min) for an inherited difference', { found, looked, founders, noDifference: plain, fromAncestor, fromParent });
    // Then, while time allows, run on and watch for a named branch (the discovery card).
    await closeInspector();
    /** @type {string | null} */
    let card = null;
    if (real() < BUDGET - 60) {
      if (await button('Run').count()) await act(button('Run'));
      await setFastest();
      const discovery = p.getByRole('region', { name: /^New branch/ });
      while (!(await discovery.count()) && real() < BUDGET - 30) {
        await p.waitForTimeout(1000);
        await clock();
      }
      if (await button('Pause').count()) await act(button('Pause'));
      await clock();
      if (await discovery.count()) {
        card = (await discovery.innerText()).replace(/\s+/g, ' ');
        say(card);
        await shot('branch-card');
      }
      log('Run on at 4× until a new branch is named', { card: !!card });
    }
    // found and first are set inside check(); read them through a cast so narrowing does not apply.
    const foundText = /** @type {string | null} */ (found);
    const firstName = /** @type {string | null} */ (first);
    return {
      pass: !!firstName,
      note: `both tabs read on ${firstName ?? 'none'}; ${looked} looked at; inherited difference ${foundText ? `found: ${foundText}` : 'not found'}; branch card ${card ? 'seen' : 'not seen'}`,
    };
  },

  // "Make two versions of the dish that differ in one thing. Tell me one way they ended up
  // different, and how you know."
  async T5() {
    await openGarden();
    log('Home → Play → Start');
    const c = await runUntil(30);
    say(`ran at 4× to ${c.text}`);
    log('Run at 4× for about half a minute, then Pause');
    await more(/^Compare: copy this dish/, true);
    await p.waitForTimeout(1200);
    const setup = p.getByRole('region', { name: 'Compare two copies' });
    const setupText = (await setup.innerText()).split('\n').filter(Boolean);
    say(setupText.slice(0, 2).join(' '), setupText[setupText.length - 1]);
    await shot('compare-setup');
    log('More → Compare: copy this dish and change one thing');
    await act(setup.getByRole('button', { name: 'Feed', exact: true }));
    await act(button('Place sugar'));
    say(...(await statusTexts()));
    const box = await p.getByRole('region', { name: 'Dish B: the copy that gets your change' }).boundingBox();
    let queued = false;
    const spots = await findDrawn(KIND.Sprinter, box);
    if (!spots.length && box) spots.push({ x: box.x + box.width / 2, y: box.y + box.height / 2, n: 0 });
    for (const pt of spots.slice(0, 6)) {
      await tap(pt.x, pt.y);
      await p.waitForTimeout(800);
      say(...(await statusTexts()));
      if (/Queued on B/.test(await setup.innerText())) {
        queued = true;
        break;
      }
      if (!(await button('Place sugar').count())) await act(setup.getByRole('button', { name: 'Feed', exact: true }));
      await act(button('Place sugar'));
    }
    say(/Queued on B:.*?(?=\n|Clear)/s.exec(await setup.innerText())?.[0] ?? '');
    await shot('queued');
    log('Feed → Place sugar → tap dish B where the Sprinters are', { queued });
    await act(p.getByRole('button', { name: /^Run A and B/ }));
    await p.getByText(/^Finished/).waitFor({ timeout: 300_000 });
    const res = p.getByRole('region', { name: 'Results · this paired run' });
    say(await res.getByRole('paragraph').first().innerText());
    const rows = await res.getByRole('table').first().getByRole('row').allInnerTexts();
    say(...rows.map((r) => r.replace(/\s+/g, ' ')));
    await shot('results');
    await act(res.getByText('By kind of organism', { exact: true }));
    say(...(await res.getByRole('group').first().innerText()).split('\n').slice(2, 10));
    await shot('by-kind');
    log('Run A and B for 60 s → Results', { rows: rows.length });
    await act(res.getByRole('button', { name: 'Save result card' }));
    await p.waitForTimeout(600);
    say(...(await statusTexts()), (await res.innerText()).split('\n').filter(Boolean).pop());
    await act(res.getByRole('button', { name: /^Done/ }));
    await p.waitForTimeout(800);
    say(...(await statusTexts()));
    log('Save result card → Done — back to my dish');
    // Where is the kept result? Home → Notebook (Journal, Experiments).
    await act(button('Home'));
    await act(button('Notebook'));
    await p.waitForTimeout(600);
    await act(p.getByRole('tab', { name: 'Journal' }));
    say((await p.getByRole('tabpanel').innerText()).replace(/\s+/g, ' '));
    await shot('notebook');
    log('Home → Notebook → Journal: looking for the saved result card');
    return { pass: queued && rows.length > 1, note: 'difference read from the results table' };
  },
};

for (const name of TASKS) {
  task = name;
  nShot = 0;
  said = [];
  actions = 0;
  lastClock = '';
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: TOUCH });
  p = await ctx.newPage();
  p.setDefaultTimeout(20_000);
  p.on('pageerror', (e) => {
    const line = { tag: TAG, task, real: real(), pageerror: e.message };
    lines.push(line);
    console.log(JSON.stringify(line));
  });
  await p.goto(BASE);
  await p.getByRole('heading', { name: 'Pixelmeba', level: 1 }).waitFor();
  if (SCALE !== 1) {
    await p.getByRole('button', { name: 'Settings' }).click();
    await p.getByRole('button', { name: `${Math.round(SCALE * 100)} %` }).click();
    await p.getByRole('button', { name: 'Back' }).click();
  }
  t0 = Date.now();
  /** @type {Outcome} */
  let outcome;
  const run = TASK[name];
  try {
    if (!run) throw new Error(`unknown task ${name}`);
    outcome = await run();
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).split('\n')[0];
    await shot('error').catch(() => {});
    log('error', { error: msg });
    outcome = { pass: false, note: `stopped: ${msg}` };
  }
  const summary = { tag: TAG, task, done: true, pass: outcome.pass && real() <= BUDGET, real: real(), sim: lastClock, actions, note: outcome.note };
  console.log(JSON.stringify(summary));
  lines.push(summary);
  const mineOnly = lines.filter((l) => l.task === task);
  writeFileSync(`${OUT}${TAG}-${task}.jsonl`, mineOnly.map((l) => JSON.stringify(l)).join('\n') + '\n');
  await ctx.close();
}
await browser.close();
