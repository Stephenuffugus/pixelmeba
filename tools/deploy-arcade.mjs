#!/usr/bin/env node
// Puts this repo's committed game on the Sky Wolf Studio arcade (lucidwinds.com), in the In Development
// shelf behind the workbench gate (the shared /dev-gate.js tester key, as every beta:true game).
//   node tools/deploy-arcade.mjs            dry run: builds dist/, then the deploy commit in a sparse worktree, pushes nothing
//   node tools/deploy-arcade.mjs --push     the same, then pushes it to lucid-winds main and checks the live files
// Copied from lumen's tools/deploy-arcade.mjs (same arcade laws: a worktree on origin/main, fenced paths only,
// HEAD~1 must be origin/main before the push, then the served files are fetched with a random query and compared
// byte for byte). The difference: PixelMeba is a Vite build, so what ships is dist/ built from a clean HEAD.
// What it writes in lucid-winds:
//   satellites/pixelmeba/index.html      dist/index.html, plus noindex, the gate, and <base href="<stamp>/"> so every
//                                        ./assets/ URL loads from the stamped folder
//   satellites/pixelmeba/<stamp>/        dist/ without source maps. The last four folders, and all from today and
//                                        yesterday, stay for pages still holding an older index.
//   satellites/pixelmeba/version.json    commit, time, stamp
//   portal-assets/thumbs/pixelmeba.jpg   the card picture (docs/arcade/thumb.jpg here)
//   portal/index.html                    the PixelMeba row (added after LUMEN the first time; later only its stamps)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), PUSH = args.includes('--push');
const LW = process.env.LW || '/workspaces/lucid-winds', WT = process.env.WT || '/tmp/pixelmeba-arcade-deploy';
const SITE = 'https://lucidwinds.com', DIR = 'satellites/pixelmeba', THUMB = 'portal-assets/thumbs/pixelmeba.jpg';
// The credential that can push to Stephen's repos (the codespace token cannot).
const env = { ...process.env }; delete env.GITHUB_TOKEN; delete env.GH_TOKEN;
const CRED = ['-c', 'credential.helper=', '-c', 'credential.helper=!/usr/bin/gh auth git-credential'];
/** @param {string} cwd @param {...string} a @returns {string} */
const git = (cwd, ...a) => execFileSync('git', [...CRED, ...a], { cwd, env, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const die = (m) => { console.error('deploy-arcade: ' + m); process.exit(1); };

// 1. What ships: dist/ built from HEAD, clean.
const dirty = git(ROOT, 'status', '--porcelain', '--', 'src', 'content', 'art', 'public', 'index.html', 'vite.config.ts', 'package.json', 'package-lock.json', 'docs/arcade/thumb.jpg');
if (dirty) die('uncommitted game files; commit first:\n' + dirty);
const sha = git(ROOT, 'rev-parse', '--short=10', 'HEAD');
execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
const DIST = path.join(ROOT, 'dist');

// 2. A sparse worktree of the arcade's origin/main holding only the paths this deploy touches.
git(LW, 'fetch', '-q', 'origin', 'main');
const base = git(LW, 'rev-parse', 'origin/main');
if (fs.existsSync(WT)) { try { git(LW, 'worktree', 'remove', '--force', WT); } catch { fs.rmSync(WT, { recursive: true, force: true }); } }
git(LW, 'worktree', 'prune');
git(LW, 'worktree', 'add', '-q', '--no-checkout', '--detach', WT, base);
git(WT, 'sparse-checkout', 'set', '--no-cone', '/portal/index.html', '/' + THUMB, `/${DIR}/`);
git(WT, 'checkout', '-q', '--detach', base);

// 3. The stamp: today (UTC) plus a letter, one past today's last deploy.
const portalPath = path.join(WT, 'portal', 'index.html');
let portal = fs.readFileSync(portalPath, 'utf8');
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const prev = /\/satellites\/pixelmeba\/\?v=(\d{8})([a-z])/.exec(portal);
const stamp = today + (prev && prev[1] === today ? String.fromCharCode(prev[2].charCodeAt(0) + 1) : 'a');
if (stamp.endsWith('{')) die('26 deploys today already');

// 4. dist/ under <stamp>/ (no source maps); index.html gated and pointed at the stamp; version.json.
const out = path.join(WT, DIR);
fs.mkdirSync(out, { recursive: true });
const versions = fs.readdirSync(out).filter((f) => /^\d{8}[a-z]$/.test(f)).sort();
// Keep the last four folders AND every folder from today or yesterday (UTC): the game page is served with
// stale-while-revalidate for a day, so a page cached before several deploys that day must still find its code.
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10).replace(/-/g, '');
const older = versions.filter((v) => v !== stamp);
const keep = older.filter((v, i) => i >= older.length - 4 || v.slice(0, 8) >= yesterday);
for (const v of versions) if (!keep.includes(v)) fs.rmSync(path.join(out, v), { recursive: true, force: true });
const code = path.join(out, stamp);
fs.rmSync(code, { recursive: true, force: true });
fs.cpSync(DIST, code, { recursive: true, filter: (f) => !f.endsWith('.map') && path.basename(f) !== 'index.html' });
let html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const head = '<meta charset="UTF-8" />';
if (html.split(head).length !== 2) die('dist/index.html needs exactly one <meta charset="UTF-8" /> to anchor the base and the gate on');
const entry = /<script type="module" crossorigin src="\.\/(assets\/index-[\w-]+\.js)"><\/script>/.exec(html);
if (!entry) die('dist/index.html must load its code as ./assets/index-*.js (relative, so <base> moves it)');
const css = /href="\.\/(assets\/index-[\w-]+\.css)"/.exec(html);
if (/<base\b/i.test(html)) die('dist/index.html already has a <base>');
if (!/<meta name="robots" content="noindex">/.test(html)) html = html.replace(head, `${head}\n    <meta name="robots" content="noindex">`);
// <base> first, before any URL in the page; the gate loads async so a stalled request cannot hold the page blank.
html = html.replace(head, `${head}\n    <base href="/${DIR}/${stamp}/">\n    <!-- The arcade's workbench gate: In Development games ask for the tester key (lucid-winds dev-gate.js). -->\n    <script async src="/dev-gate.js?v=2"></script>`);
fs.writeFileSync(path.join(out, 'index.html'), html);
fs.writeFileSync(path.join(out, 'version.json'), JSON.stringify({ commit: sha, published: new Date().toISOString(), stamp }) + '\n');
fs.mkdirSync(path.dirname(path.join(WT, THUMB)), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'docs', 'arcade', 'thumb.jpg'), path.join(WT, THUMB));

// 5. The portal row: In Development (beta:true), new (fresh:true). Player copy: no dashes, no exclamation points.
const ds = 'Grow a tiny living world in a dish. Change one thing, press play, and see who finds something to eat.';
if (/[–—!]| - /.test(ds)) die('player copy has a dash or an exclamation point');
const row = `  {nm:"PixelMeba", ds:"${ds}", cat:"creative", url:"/${DIR}/?v=${stamp}", ic:"🦠", thumb:"/${THUMB}?v=${stamp}", beta:true, fresh:true},`;
const note = `  // PIXELMEBA (2026-09-29): the microbe dish sandbox, a Phase 2 development build. Its own repo\n  // Stephenuffugus/pixelmeba; deployed only by that repo's tools/deploy-arcade.mjs (it rewrites this row's stamps). Gated: satellites/pixelmeba/index.html loads /dev-gate.js.`;
const lines = portal.split('\n'), at = lines.findIndex((l) => l.includes(`url:"/${DIR}/`));
if (at >= 0) lines[at] = row;
else {
  const after = lines.findIndex((l) => l.includes('url:"/satellites/lumen/'));
  if (after < 0) die('portal/index.html: no LUMEN row to put PixelMeba after');
  lines.splice(after + 1, 0, note, row);
}
portal = lines.join('\n');
fs.writeFileSync(portalPath, portal);

// 6. One commit on top of origin/main, fenced paths only.
git(WT, 'add', '-A', '--', 'portal/index.html', THUMB, DIR);
const staged = git(WT, 'diff', '--cached', '--stat');
console.log(`deploy-arcade: code in ${DIR}/${stamp}/; kept ${keep.join(', ') || 'no older version'}; removed ${versions.filter((v) => !keep.includes(v) && v !== stamp).join(', ') || 'nothing'}`);
if (!staged) { console.log(`deploy-arcade: nothing to deploy, the arcade already has ${sha}`); process.exit(0); }
git(WT, 'commit', '-q', '-m', `PixelMeba ${stamp} on the arcade (In Development, gated): pixelmeba ${sha}\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01WzkX3G2DLRKcUtqhnKi137`);
if (git(WT, 'rev-parse', 'HEAD~1') !== base) die('HEAD~1 is not origin/main');
const files = git(WT, 'diff', '--name-only', 'HEAD~1', 'HEAD').split('\n');
const stray = files.filter((f) => !(f === 'portal/index.html' || f === THUMB || f.startsWith(DIR + '/')));
if (stray.length) die('refusing, the commit touches other paths: ' + stray.join(', '));
const portalDiff = git(WT, 'diff', '--numstat', 'HEAD~1', 'HEAD', '--', 'portal/index.html');
console.log(`deploy-arcade: ${stamp}, pixelmeba ${sha}, ${files.length} files on top of arcade ${base.slice(0, 8)}; portal/index.html ${portalDiff || 'unchanged'}`);
if (!PUSH) { console.log(`deploy-arcade: dry run; the commit is in ${WT}. Run with --push to put it live.`); process.exit(0); }

// 7. Push, then check what the site serves, byte for byte, with a random query (the edge may lag a little).
git(WT, 'push', '-q', 'origin', 'HEAD:main');
console.log(`deploy-arcade: pushed ${git(WT, 'rev-parse', '--short', 'HEAD')} to lucid-winds main`);
const probe = () => 'r=' + Math.random().toString(36).slice(2);
const want = [['index.html', `${DIR}/`, true], ['version.json', `${DIR}/version.json`, true],
  [`${stamp}/${entry[1]}`, `${DIR}/${stamp}/${entry[1]}`]];
if (css) want.push([`${stamp}/${css[1]}`, `${DIR}/${stamp}/${css[1]}`]);
for (let tries = 0; ; tries++) {
  const bad = [];
  for (const [local, url, q] of want) {
    const body = await fetch(`${SITE}/${url}${q ? '?' + probe() : ''}`).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    if (!body || !Buffer.from(body).equals(fs.readFileSync(path.join(out, local)))) bad.push(url);
  }
  const live = await fetch(`${SITE}/portal/?${probe()}`).then((r) => r.text()).catch(() => '');
  if (!live.includes(`/${DIR}/?v=${stamp}`)) bad.push('portal row ' + stamp);
  if (!bad.length) { console.log(`deploy-arcade: live and byte-identical: ${SITE}/${DIR}/?v=${stamp}`); break; }
  if (tries === 18) die('still not served after 3 minutes: ' + bad.join(', '));
  await new Promise((r) => setTimeout(r, 10000));
}
