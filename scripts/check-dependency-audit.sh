#!/usr/bin/env bash
# The `Dependency Audit` guard: does this branch add a known vulnerability?
#
# Only what the branch adds. An advisory published tonight against a package
# already on dev is not this branch's doing and no change to it clears it; it
# used to turn the first pull request opened afterwards red, whatever that pull
# request was about. Those are the daily watch's (scripts/vulnerability-watch.sh),
# which turns each one into an issue of its own.
#
# Same code locally and in CI, like scripts/check-work-item.sh.
#
# Usage:
#   scripts/check-dependency-audit.sh                 # against where it left origin/dev
#   scripts/check-dependency-audit.sh --base <sha>    # what CI passes
#
# How: when frontend/bun.lock differs from the base, both lockfiles are scanned
# under the same frontend/osv-scanner.toml (the working tree's), and the guard
# fails on each advisory + package found on this side and not on the base. When
# the lockfile is unchanged it skips itself without calling OSV at all, so an
# OSV outage cannot block a pull request that touches no dependency.
#
# -e: a report this script cannot read must fail the guard. Without it, a jq
# error left the findings empty and the guard passed on a scan nobody read.
set -euo pipefail

BASE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="${2:-}"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

die() { echo "error: $1" >&2; exit 1; }

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=scripts/vulnerability-lib.sh
. "$SCRIPT_DIR/vulnerability-lib.sh"

cd "$VULN_ROOT" || die "cannot enter $VULN_ROOT"
LOCK=frontend/bun.lock

# Locally, the point this branch left dev and not dev's tip: a lockfile change dev
# made since then would otherwise read as this branch's, and an advisory dev has
# fixed would be reported as added here. CI passes the merge commit's first
# parent, against which the merge already shows only what the branch adds.
if [ -z "$BASE" ]; then
  BASE=$(git merge-base origin/dev HEAD) || die "no common ancestor with origin/dev (fetch it first)"
fi

git cat-file -e "${BASE}^{commit}" 2>/dev/null || die "base $BASE is not a commit here (fetch it first)"

if git diff --quiet "$BASE" -- "$LOCK"; then
  echo "$LOCK is the same as on $BASE: this branch changes no dependency, nothing to audit."
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/base"

# A base without a lockfile has nothing on it, so everything found here is new.
if git show "$BASE:$LOCK" > "$tmp/base/bun.lock" 2>/dev/null; then
  osv_scan "$tmp/base/bun.lock" "$tmp/base.json" || die "osv-scanner could not scan the base lockfile"
  osv_findings "$tmp/base.json" > "$tmp/base.tsv"
else
  : > "$tmp/base.tsv"
fi

osv_scan "$LOCK" "$tmp/head.json" || die "osv-scanner could not scan $LOCK"
osv_findings "$tmp/head.json" > "$tmp/head.tsv"

# FILENAME and not the usual NR == FNR: with no finding on the base, the base
# file is empty, NR == FNR then holds for every line of the head file, and
# everything would read as already there.
awk -F'\t' 'FILENAME == ARGV[1] { seen[$1 FS $2] = 1; next } !seen[$1 FS $2]' \
  "$tmp/base.tsv" "$tmp/head.tsv" > "$tmp/new.tsv"

already=$(wc -l < "$tmp/base.tsv" | tr -d ' ')
if [ "$already" != "0" ]; then
  echo "$already advisory(ies) already on $BASE: not this branch's to fix, the daily watch tracks them as issues."
fi

if [ ! -s "$tmp/new.tsv" ]; then
  echo "This branch's changes to $LOCK add no known vulnerability."
  exit 0
fi

# awk and not `read`: tab is IFS whitespace, so `read` merges the empty `fixed`
# of an advisory with no fix into the next field and reports the severity as
# the version to bump to.
awk -F'\t' -v lock="$LOCK" '{
  printf "::error file=%s::%s %s: https://osv.dev/%s, fixed in %s\n", lock, $2, $3, $1, ($4 == "" ? "no release yet" : $4)
}' "$tmp/new.tsv"

cat >&2 <<'MSG'

This branch adds the vulnerable versions above. Bump them to a fixed release, or,
if the flaw cannot reach Jump, add a reasoned and expiring entry to
frontend/osv-scanner.toml (its header says what qualifies).
MSG
exit 1
