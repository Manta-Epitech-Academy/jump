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
. "$SCRIPT_DIR/work-item-sections.sh"

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

# A body file that is not there is a mistake in the call, not an empty body: the
# difference decides whether the Closes check runs, so it is not one to guess at.
if [ -n "$BODY_FILE" ] && [ ! -f "$BODY_FILE" ]; then
  echo "no such body file: $BODY_FILE" >&2
  exit 2
fi

FAILURES=0

# Bodies are read from files rather than variables so grep can work on them. One
# directory holds all of them: a helper that echoed a path could only register it
# for cleanup from inside a command substitution, where the assignment is lost and
# the trap ends up with nothing to remove.
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

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

# Whether the body is KNOWN, which is not the same question as whether it has any
# bytes in it. A body handed over with --body-file is authoritative even when it
# is empty: that is a pull request whose body really is empty, and it must fail
# the Closes check rather than skip it. A body we fetched ourselves is only
# authoritative if the call worked, because an empty file is otherwise
# indistinguishable from a failed one, and treating the two alike is how this
# check once skipped itself while printing OK.
BODY_KNOWN=0
[ -z "$BODY_FILE" ] || BODY_KNOWN=1

if [ -n "$PR" ] && [ "$BODY_KNOWN" = 0 ]; then
  BODY_FILE="$TMP_DIR/pr-body.md"
  if gh pr view "$PR" --repo "$REPO" --json body -q .body > "$BODY_FILE" 2>/dev/null; then
    BODY_KNOWN=1
  fi
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

if has_label "no-issue"; then
  echo
  echo "This pull request carries the 'no-issue' label."
  if [ "$BODY_KNOWN" = 1 ] && has_section "$BODY_FILE" "$WORK_ITEM_EXCEPTION_PATTERN"; then
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

ISSUE_BODY="$TMP_DIR/issue-body.md"
gh issue view "$ISSUE" --repo "$REPO" --json body -q .body > "$ISSUE_BODY"

# -------------------------------------------------- 3. the issue is structured

if ! has_section "$ISSUE_BODY" "$WORK_ITEM_STORIES_PATTERN"; then
  fail "Issue #$ISSUE has no non-empty 'User Stories' section."
  note "Format: As a [role], I want to [action] so that [benefit]."
  note "Or in French: En tant que [rôle], je veux [action], pour [bénéfice]."
fi

if ! has_section "$ISSUE_BODY" "$WORK_ITEM_CRITERIA_PATTERN"; then
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

if [ -z "$PR" ]; then
  note "No pull request yet, so there is no body to read. CI runs this check when you open one."
elif [ "$BODY_KNOWN" != 1 ]; then
  # Not a skip. An unreadable body means the link is unverified, and an
  # unverified check that reports OK is the failure this guard exists to end.
  fail "Could not read the body of pull request #$PR, so its link to #$ISSUE is unverified."
  note "Check 'gh auth status', or hand the body over with --body-file."
elif ! grep -qiE "(clos(e|es|ed)|fix(e[sd])?|resolv(e|es|ed))[[:space:]]*:?[[:space:]]*#${ISSUE}([^0-9]|$)" "$BODY_FILE"; then
  fail "The pull request body does not link issue #$ISSUE."
  note "Add 'Closes #$ISSUE' under ## Context. scripts/finish-work.sh does it for you."
else
  echo "pull request links #$ISSUE"
fi

echo
if [ "$FAILURES" -gt 0 ]; then
  echo "$FAILURES check(s) failed." >&2
  exit 1
fi
echo "Work item OK: branch $BRANCH, issue #$ISSUE."
