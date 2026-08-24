#!/usr/bin/env bash
# The `Work item` guard: does this branch trace back to a real, well-formed issue?
#
# Same code locally and in CI, deliberately. A guard you can only run by opening a
# pull request teaches you nothing until it is too late, so this lives in a script
# rather than inline in .github/workflows/work-item.yml.
#
# Usage:
#   scripts/check-work-item.sh                       # infer everything from git + gh
#   scripts/check-work-item.sh --branch NAME --base dev --pr 251 \
#       --labels "a,b" --body-file /tmp/pr-body.md   # what CI passes
#
# What it checks, and why each one exists:
#   1. the branch name carries an issue number  (the number is the process key)
#   2. that issue exists
#   3. it has non-empty User Stories and Acceptance Criteria sections
#   4. it was created BEFORE the branch's first commit  (an issue written
#      afterwards is reconstructed traceability, which is the failure this whole
#      guard was built for)
#   5. the pull request body links it with a closing keyword
#
# Exits 0 on a release promotion (source branch dev or staging) and on a pull
# request labelled `no-issue` that explains itself in a `## Process exception`
# section. Every other failure is a merge blocker.
set -uo pipefail

REPO="${JUMP_REPO:-Manta-Epitech-Academy/jump}"

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=scripts/work-item-lib.sh
. "$SCRIPT_DIR/work-item-lib.sh"

BRANCH=""
BASE=""
PR=""
LABELS=""
BODY_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --branch)    BRANCH="${2:-}"; shift 2 ;;
    --base)      BASE="${2:-}"; shift 2 ;;
    --pr)        PR="${2:-}"; shift 2 ;;
    --labels)    LABELS="${2:-}"; shift 2 ;;
    --body-file) BODY_FILE="${2:-}"; shift 2 ;;
    -h|--help)  work_item_usage "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

FAILURES=0

# Bodies are read from files rather than variables so grep can work on them, and
# they are ours to clean up.
TMP_FILES=""
trap 'for f in $TMP_FILES; do rm -f "$f"; done' EXIT

new_tmp() {
  local f
  f=$(mktemp)
  TMP_FILES="$TMP_FILES $f"
  printf '%s' "$f"
}

fail() {
  FAILURES=$((FAILURES + 1))
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    echo "::error::$1"
  else
    echo "FAIL: $1" >&2
  fi
}

note() { echo "  $1"; }

# ---------------------------------------------------------------- discovery

[ -n "$BRANCH" ] || BRANCH=$(git rev-parse --abbrev-ref HEAD)
[ -n "$BASE" ] || BASE="dev"

# A promotion pull request has no work item and never will: dev and staging are
# long-lived branches, not a piece of work. Without this, every release fails.
if work_item_is_protected "$BRANCH"; then
  echo "$BRANCH is a promotion source, nothing to check."
  exit 0
fi

# Locally, the pull request may not exist yet. That is fine: everything except the
# Closes line can be checked from git and the issue alone.
if [ -z "$PR" ] && command -v gh >/dev/null 2>&1; then
  # `gh pr view` cannot infer the pull request from the current branch once
  # --repo is given, and it then reports nothing rather than failing, which made
  # this whole block skip the Closes check while still printing OK. Ask by head
  # branch instead.
  PR=$(gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number \
    -q '.[0].number' 2>/dev/null || true)
fi
if [ -n "$PR" ] && [ -z "$BODY_FILE" ]; then
  BODY_FILE=$(new_tmp)
  gh pr view "$PR" --repo "$REPO" --json body -q .body > "$BODY_FILE" 2>/dev/null || : > "$BODY_FILE"
fi
if [ -n "$PR" ] && [ -z "$LABELS" ]; then
  LABELS=$(gh pr view "$PR" --repo "$REPO" --json labels -q '[.labels[].name] | join(",")' 2>/dev/null || true)
fi

echo "branch: $BRANCH"
echo "base:   $BASE"
echo "pr:     ${PR:-<none yet>}"

# ------------------------------------------------------- the named escape hatch

has_label() {
  case ",${LABELS}," in *",$1,"*) return 0 ;; *) return 1 ;; esac
}

# True when file $1 has a heading matching $2 followed by at least one line of
# real content. HTML comments and GitHub's "_No response_" filler are stripped, so
# a section that only holds the template's own placeholder reads as empty.
has_section() {
  local file="$1" pattern="$2" start end
  start=$(grep -niE "^#+[[:space:]]+(${pattern})[[:space:]]*:?[[:space:]]*$" "$file" | head -1 | cut -d: -f1)
  [ -n "$start" ] || return 1
  end=$(awk -v s="$start" 'NR > s && /^#+[ \t]/ { print NR - 1; exit }' "$file")
  [ -n "$end" ] || end=$(wc -l < "$file")
  sed -n "$((start + 1)),${end}p" "$file" \
    | grep -v '^[[:space:]]*<!--' \
    | grep -v '^[[:space:]]*-->' \
    | grep -viF '_No response_' \
    | grep -q '[^[:space:]]'
}

if has_label "no-issue"; then
  echo
  echo "This pull request carries the 'no-issue' label."
  if [ -n "$BODY_FILE" ] && [ -f "$BODY_FILE" ] && has_section "$BODY_FILE" "process exception"; then
    echo "Process exception is documented in the body. Passing."
    exit 0
  fi
  fail "Label 'no-issue' requires a non-empty '## Process exception' section in the pull request body saying why the issue-first rule does not apply here."
  exit 1
fi

# ------------------------------------------------------------- 1. branch name

if ! work_item_branch_ok "$BRANCH"; then
  fail "Branch '$BRANCH' does not carry an issue number."
  note "Expected: type/<issue>-slug, for example feat/248-dossier-annuel."
  note "Allowed types: $(work_item_types_human)."
  note "Open the issue first, then: scripts/start-work.sh --issue <n> --type feat --slug short-name"
  note "Already committed on the wrong name? git branch -m feat/<n>-slug && git push -u origin feat/<n>-slug"
  exit 1
fi

ISSUE=$(work_item_issue "$BRANCH")
echo "issue:  #$ISSUE"
echo

# --------------------------------------------------------- 2. the issue exists

ISSUE_META=$(gh issue view "$ISSUE" --repo "$REPO" --json createdAt,title \
  -q '.createdAt + "\t" + .title' 2>/dev/null || true)
if [ -z "$ISSUE_META" ]; then
  fail "Issue #$ISSUE does not exist in $REPO, but the branch name points at it."
  note "Open it first, or rename the branch to point at the right number."
  exit 1
fi
ISSUE_CREATED=${ISSUE_META%%$'\t'*}
echo "issue title: ${ISSUE_META#*$'\t'}"

ISSUE_BODY=$(new_tmp)
gh issue view "$ISSUE" --repo "$REPO" --json body -q .body > "$ISSUE_BODY"

# -------------------------------------------------- 3. the issue is structured

if ! has_section "$ISSUE_BODY" "user stor(y|ies)|histoires? utilisateur"; then
  fail "Issue #$ISSUE has no non-empty 'User Stories' section."
  note "Format: As a [role], I want to [action] so that [benefit]."
  note "Or in French: En tant que [rôle], je veux [action], pour [bénéfice]."
fi

if ! has_section "$ISSUE_BODY" "acceptance criteria|crit[eè]res d'acceptation"; then
  fail "Issue #$ISSUE has no non-empty 'Acceptance Criteria' section."
  note "Format: Given X, when Y, then Z. These become the tests."
fi

# ------------------------------------------- 4. the issue predates the branch

git fetch origin "$BASE" --quiet 2>/dev/null || true

MERGE_BASE=$(git merge-base "origin/$BASE" HEAD 2>/dev/null || true)
if [ -z "$MERGE_BASE" ]; then
  note "Skipping the ordering check: no merge base with origin/$BASE (shallow clone?)."
else
  FIRST_COMMIT=$(git log --reverse --format='%aI' "$MERGE_BASE..HEAD" 2>/dev/null | head -1)
  if [ -z "$FIRST_COMMIT" ]; then
    note "Ordering check: no commits on this branch yet, nothing to order."
  else
    issue_epoch=$(date -u -d "$ISSUE_CREATED" +%s 2>/dev/null || echo "")
    commit_epoch=$(date -u -d "$FIRST_COMMIT" +%s 2>/dev/null || echo "")
    if [ -z "$issue_epoch" ] || [ -z "$commit_epoch" ]; then
      note "Ordering check: could not parse the dates, skipping."
    elif [ "$issue_epoch" -gt "$commit_epoch" ]; then
      fail "Issue #$ISSUE was created AFTER this branch's first commit ($ISSUE_CREATED vs $FIRST_COMMIT)."
      note "The issue is meant to come first: it is what the work is scoped against, not a record written afterwards."
      note "If it was legitimately opened mid-branch, label the pull request 'no-issue' and say so under '## Process exception'."
    else
      echo "ordering ok: issue $ISSUE_CREATED, first commit $FIRST_COMMIT"
    fi
  fi
fi

# ---------------------------------------------------- 5. the pull request link

if [ -z "$PR" ] || [ ! -s "${BODY_FILE:-/dev/null}" ]; then
  note "No pull request body available yet, skipping the Closes check. CI will run it."
else
  if ! grep -qiE "(clos(e|es|ed)|fix(e[sd])?|resolv(e|es|ed))[[:space:]]*:?[[:space:]]*#${ISSUE}([^0-9]|$)" "$BODY_FILE"; then
    fail "The pull request body does not link issue #$ISSUE."
    note "Add 'Closes #$ISSUE' under ## Context. scripts/finish-work.sh does it for you."
  else
    echo "pull request links #$ISSUE"
  fi
fi

echo
if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES check(s) failed." >&2
  exit 1
fi
echo "Work item OK: branch $BRANCH, issue #$ISSUE."
