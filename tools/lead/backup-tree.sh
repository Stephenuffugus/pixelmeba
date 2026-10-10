#!/usr/bin/env bash
# Back up the whole working tree (tracked changes AND new files; ignored paths such as tmp/ excluded) to a branch on
# origin without touching the real index, HEAD or any file:  tools/lead/backup-tree.sh <branch> [message]
# Restore after a restart (only if `git status` shows the work missing): git checkout <branch> -- . && git reset -q
set -euo pipefail
branch=${1:?usage: backup-tree.sh <branch> [message]}
msg=${2:-"wip: working-tree backup"}
cd "$(git rev-parse --show-toplevel)"
idx=$(mktemp "${TMPDIR:-/tmp}/backup-idx.XXXXXX")
trap 'rm -f "$idx"' EXIT
GIT_INDEX_FILE=$idx git read-tree HEAD
GIT_INDEX_FILE=$idx git add -A
tree=$(GIT_INDEX_FILE=$idx git write-tree)
commit=$(git commit-tree "$tree" -p HEAD -m "$msg ($(date -u +%Y-%m-%dT%H:%MZ), base $(git rev-parse --short HEAD))")
git branch -f "$branch" "$commit"
git push -q -f origin "$branch" 2>&1 | grep -v '^remote:' || true
echo "$branch = $(git rev-parse --short "$branch") ($(git diff --stat HEAD "$branch" | tail -1))"
