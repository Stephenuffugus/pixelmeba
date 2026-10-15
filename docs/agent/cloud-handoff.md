# Moving the build to a Claude Code cloud session (and back)

Written 2026-10-15 from the official docs (code.claude.com/docs/en/claude-code-on-the-web, web-quickstart,
cloud-environments, memory, workflows, costs). The owner wants to try Anthropic's cloud sessions with promotional
credits, then come back to the GitHub Codespace. Read with docs/agent/lead-notes.md (the owner's working rules).

## 0. Move only at a stopping point the lead names

A cloud session clones the repository from GitHub (origin), not this Codespace. Anything uncommitted or unpushed stays
behind, and so do running workflows, background processes, `tmp/` and the lead's local memory (its essentials are in
docs/agent/lead-notes.md). The lead says "safe to move" only when `git status` is clean and main is pushed.

## 1. Start (owner, in a browser)

1. Open claude.ai/code and sign in; choose "Sign in with GitHub" and approve.
2. Install the Claude GitHub App on the repository owner and pick `Stephenuffugus/pixelmeba`
   (github.com/apps/claude/installations/new). The repo is public, but the App makes cloud sessions clone it properly.
3. Environment (claude.ai/code → environment settings; create one named e.g. "pixelmeba"):
   - **Network access: Custom**, tick "Also include default list of common package managers", and add these hosts
     (Playwright downloads its browser from them; they are not on the default list):
     `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`
   - **Environment variables** (`.env` format):
     ```
     BASH_DEFAULT_TIMEOUT_MS=600000
     BASH_MAX_TIMEOUT_MS=600000
     PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
     ```
   - **Setup script** (runs as root on Ubuntu 24.04 before each session; cached for about 7 days when it finishes in
     about 5 minutes):
     ```bash
     #!/bin/bash
     set -euo pipefail
     # Node 24: package.json requires node >= 24 (.nvmrc 24); the image ships Node 20-22.
     if ! node -v 2>/dev/null | grep -q '^v24\.'; then
       curl -fsSL https://nodejs.org/dist/v24.21.0/node-v24.21.0-linux-x64.tar.xz | tar -xJ -C /usr/local --strip-components=1
       hash -r
     fi
     node -v
     # Chromium and its system libraries for the Playwright journeys (the repo pins @playwright/test 1.63.0).
     export PLAYWRIGHT_BROWSERS_PATH=/opt/ms-playwright
     npx -y playwright@1.63.0 install --with-deps chromium
     chmod -R a+rX /opt/ms-playwright
     ```
4. New session: pick the repo, branch `main`, permission mode **Auto** (or Accept edits), and paste the first message
   below.

## 2. The first message in the cloud session

> lets get started. This is a cloud session (4 vCPUs) taking over the Pixelmeba build from the Codespace. First read
> docs/agent/RESUME.md's top banner, docs/agent/lead-notes.md and docs/agent/cloud-handoff.md §3. Check the
> environment (node -v must be 24; npm ci; npx playwright --version; one small vitest file), then continue the build
> from the banner. Commit on main and push main at every safe point, as CLAUDE.md says.

## 3. For the cloud session (the lead)

- Check first: `node -v` (v24.x; if it is 22, install 24 and put it first on PATH), `npm ci`,
  `npx playwright install chromium` only if a journey reports a missing browser, then one small vitest file.
  `npm run check` should take roughly half the Codespace's time on 4 vCPUs.
- Git: commit on `main` and push `main` (CLAUDE.md "commit small and often on main"). Nothing in the product blocks a
  push to main; pushing main keeps the move back a plain `git pull`. If the session was started on its own branch,
  fast-forward main to it before pushing, or merge it.
- Commits from cloud sessions carry a `Claude-Session:` trailer as well as the Co-Authored-By line.
- The lead's local memory does not exist here: docs/agent/lead-notes.md is its replacement. Keep the RESUME.md banner
  current at every safe point, because an idle cloud VM can be reclaimed and background processes do not survive it.
  Workflow results are kept with the conversation.
- Android stays on the Codespace: the image has JDK 21 and Gradle but no Android SDK, and Google's SDK host is not on
  the default allowlist. If a gate item needs an Android build, record "Android build verification pending: Codespace"
  in the WORKLOG note and EXPANSION_RESPONSE, and keep going; the owner reruns it back on the Codespace.
- The arcade deploy needs the owner's `gh auth login` (an owner item either way).
- Usage: cloud sessions count against the claude.ai plan's usage. The promotional credit's terms are on
  claude.ai/settings/usage (press reports mention a cloud-only bonus with an early-November expiry: unverified).
  The weekly-usage rules in lead-notes.md still apply.

## 4. Moving back to the Codespace

1. In the cloud session: commit, push main, update the RESUME.md banner, and stop at a safe point (no run in flight).
2. In the Codespace: `git pull` on main (stash or commit anything local first). If the work was left on a branch,
   `git fetch` and merge it, or `claude --teleport <session-id>` to bring the conversation and branch to the terminal.
3. Start the local session with "lets get started" as before; its local memory is still on the Codespace unless the
   Codespace was deleted (docs/agent/lead-notes.md covers that case).
