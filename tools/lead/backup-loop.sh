#!/usr/bin/env bash
# Back up the working tree every 30 minutes while a wave runs (lead tool):
#   nohup tools/lead/backup-loop.sh <branch> [message] >/dev/null 2>&1 & echo $! > tmp/lead/backup.pid
# Stop it with: kill "$(cat tmp/lead/backup.pid)" (never pkill/pgrep with a pattern the calling command contains).
# Each snapshot line goes to tmp/lead/backup-<branch's last part>.log.
set -u
branch=${1:?usage: backup-loop.sh <branch> [message]}
msg=${2:-"wip: wave in flight"}
cd "$(git rev-parse --show-toplevel)"
log="tmp/lead/backup-${branch##*/}.log"
mkdir -p tmp/lead
while true; do
  tools/lead/backup-tree.sh "$branch" "$msg" >>"$log" 2>&1 || echo "backup failed $(date -u +%H:%M)" >>"$log"
  sleep 1800
done
