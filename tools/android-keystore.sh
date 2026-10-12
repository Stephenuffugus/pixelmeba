#!/usr/bin/env bash
# npm run android:keystore -- --out /path/outside/the/repo/pixelmeba-upload.jks [--dry-run]
#
# P4.10 (D-0091; docs/ANDROID_SETUP.md §5-§6): create the Google Play UPLOAD key for the owner, once, OUTSIDE
# the repository. keytool asks for the passwords and the name itself; this script never stores, prints or
# passes a password. It refuses any path inside the repository. Afterwards it prints the four lines for
# android/keystore.properties (gitignored) with placeholders for the passwords.
# --dry-run prints the keytool command and creates nothing.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
OUT=""
DRY=0
ALIAS="pixelmeba-upload"

usage() {
  echo "usage: npm run android:keystore -- --out /path/outside/the/repo/pixelmeba-upload.jks [--dry-run]" >&2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --out)
      [ $# -ge 2 ] || { usage; exit 2; }
      OUT="$2"
      shift 2
      ;;
    --dry-run)
      DRY=1
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage
      exit 2
      ;;
  esac
done

if [ -z "$OUT" ]; then
  usage
  exit 2
fi

# Resolve the path (its folder need not exist yet): absolute, with symlinks in the existing part followed.
case "$OUT" in
  /*) ABS="$OUT" ;;
  *) ABS="$(pwd -P)/$OUT" ;;
esac
DIR="$(dirname "$ABS")"
BASE="$(basename "$ABS")"
EXISTING="$DIR"
REST=""
while [ ! -d "$EXISTING" ]; do
  REST="/$(basename "$EXISTING")$REST"
  EXISTING="$(dirname "$EXISTING")"
done
RESOLVED="$(cd "$EXISTING" && pwd -P)$REST/$BASE"
# Collapse any "." and ".." left in the part that does not exist yet.
RESOLVED="$(printf '%s\n' "$RESOLVED" | awk -F/ '{n=0; for (i=2;i<=NF;i++) { if ($i=="" || $i==".") continue; if ($i=="..") { if (n>0) n--; continue } p[++n]=$i } s=""; for (i=1;i<=n;i++) s=s "/" p[i]; print (s==""?"/":s)}')"

case "$RESOLVED/" in
  "$REPO_ROOT"/*)
    echo "Refused: $RESOLVED is inside the repository ($REPO_ROOT). The upload key must live outside it (docs/ANDROID_SETUP.md §5); nothing was created." >&2
    exit 1
    ;;
esac

if [ -e "$RESOLVED" ]; then
  echo "Refused: $RESOLVED already exists; nothing was changed." >&2
  exit 1
fi

CMD=(keytool -genkeypair -v -keystore "$RESOLVED" -alias "$ALIAS" -keyalg RSA -keysize 2048 -validity 10000)

if [ "$DRY" -eq 1 ]; then
  echo "Dry run: nothing was created. This would run:"
  printf ' %q' "${CMD[@]}"
  echo
else
  command -v keytool > /dev/null 2>&1 || { echo "keytool not found: install a JDK 21 and put its bin/ on PATH (docs/ANDROID_SETUP.md §2)." >&2; exit 1; }
  mkdir -p "$(dirname "$RESOLVED")"
  "${CMD[@]}"
  echo
  echo "Created $RESOLVED. Back it up, with its passwords, somewhere other than this machine."
fi

echo
echo "android/keystore.properties (gitignored; docs/ANDROID_SETUP.md §6):"
echo "storeFile=$RESOLVED"
echo "storePassword=<the store password you chose>"
echo "keyAlias=$ALIAS"
echo "keyPassword=<the key password you chose>"
