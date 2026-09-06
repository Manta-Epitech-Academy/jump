#!/usr/bin/env bash
# Start a piece of work the way the protocol in .github/CONTRIBUTING.md expects:
# the issue first, then the board, then the branch.
#
# Usage:
#   scripts/start-work.sh --issue 248 --type feat --slug dossier-annuel
#   scripts/start-work.sh --title "feat(onboarding): dossier annuel" \
#       --body-file .ship/issue-body.md --type feat --slug dossier-annuel
#
# Options:
#   --issue N        reuse an existing issue instead of opening one
#   --title T        issue title, Conventional Commit style: type(scope): subject
#   --body-file F    issue body, must hold User Stories and Acceptance Criteria
#   --type T         branch type (see scripts/work-item-lib.sh)
#   --slug S         lowercase kebab-case, no issue number (it is added for you)
#   --label L        issue label, defaults to enhancement
#   --base B         branch off this branch, defaults to dev
#
# What this script will never do is write the issue's content. User stories and
# acceptance criteria are the one part of the pipeline that has to come from a
# person or from an agent that talked to one.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=scripts/work-item-lib.sh
. "$SCRIPT_DIR/work-item-lib.sh"

REPO="${JUMP_REPO:-Manta-Epitech-Academy/jump}"

ISSUE=""; TITLE=""; BODY_FILE=""; TYPE=""; SLUG=""; LABEL="enhancement"; BASE="dev"

while [ $# -gt 0 ]; do
  case "$1" in
    --issue)     ISSUE="${2:-}"; shift 2 ;;
    --title)     TITLE="${2:-}"; shift 2 ;;
    --body-file) BODY_FILE="${2:-}"; shift 2 ;;
    --type)      TYPE="${2:-}"; shift 2 ;;
    --slug)      SLUG="${2:-}"; shift 2 ;;
    --label)     LABEL="${2:-}"; shift 2 ;;
    --base)      BASE="${2:-}"; shift 2 ;;
    -h|--help)  work_item_usage "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

die() { echo "error: $1" >&2; exit 1; }

[ -n "$TYPE" ] || die "--type is required. One of: $(work_item_types_human)"
printf '%s' "$TYPE" | grep -qE "^(${WORK_ITEM_TYPES})$" \
  || die "unknown type '$TYPE'. One of: $(work_item_types_human)"

[ -n "$SLUG" ] || die "--slug is required, lowercase kebab-case, for example dossier-annuel"
printf '%s' "$SLUG" | grep -qE '^[a-z0-9]+(-[a-z0-9]+)*$' \
  || die "slug '$SLUG' must be lowercase kebab-case"
# A slug that opens with digits produces feat/248-248-dossier-annuel, which passes
# work_item_branch_ok (the guard reads the first number) and so looks fine while
# being wrong. Saying "do not include the number" in the help was not enough.
printf '%s' "$SLUG" | grep -qE '^[0-9]+(-|$)' \
  && die "slug '$SLUG' looks like it carries the issue number. The number is added for you, pass just the words: --slug ${SLUG#*-}"

if [ -z "$ISSUE" ]; then
  [ -n "$TITLE" ] || die "pass --issue N, or --title and --body-file to open one"
  [ -n "$BODY_FILE" ] || die "--body-file is required when opening an issue"
  [ -f "$BODY_FILE" ] || die "no such file: $BODY_FILE"

  # Fail before creating anything if the body would not survive the guard.
  if ! grep -qiE '^#+[[:space:]]+(user stor(y|ies)|histoires? utilisateur)' "$BODY_FILE"; then
    die "$BODY_FILE has no 'User Stories' heading, and the Work item check would reject the issue"
  fi
  if ! grep -qiE "^#+[[:space:]]+(acceptance criteria|crit[eè]res d'acceptation)" "$BODY_FILE"; then
    die "$BODY_FILE has no 'Acceptance Criteria' heading, and the Work item check would reject the issue"
  fi

  url=$(gh issue create --repo "$REPO" --title "$TITLE" --body-file "$BODY_FILE" --label "$LABEL")
  ISSUE=$(printf '%s' "$url" | grep -oE '[0-9]+$')
  echo "opened issue #$ISSUE: $url"
else
  gh issue view "$ISSUE" --repo "$REPO" --json number -q .number >/dev/null \
    || die "issue #$ISSUE does not exist in $REPO"
  echo "reusing issue #$ISSUE"
fi

"$SCRIPT_DIR/project-status.sh" "$ISSUE" "In Progress"

BRANCH="${TYPE}/${ISSUE}-${SLUG}"
work_item_branch_ok "$BRANCH" || die "computed branch name '$BRANCH' is not valid, which is a bug in this script"

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  die "branch $BRANCH already exists. git switch $BRANCH to continue on it."
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "note: the working tree is dirty, so those changes follow you onto the new branch."
fi

git fetch origin "$BASE" --quiet
if ! git checkout -b "$BRANCH" "origin/$BASE"; then
  # The issue and the board are already done by this point, and that is fine:
  # both steps are idempotent and --issue picks the work back up.
  cat >&2 <<MSG

The issue is open and sitting on the board, but the branch could not be created:
git refused to switch with the working tree in its current state. Settle it
(commit, stash or discard), then pick this back up with:

  scripts/start-work.sh --issue $ISSUE --type $TYPE --slug $SLUG
MSG
  exit 1
fi

cat <<EOF

Ready. Branch $BRANCH, issue #$ISSUE, board set to In Progress.
Before pushing:  bash scripts/check-work-item.sh
To open the PR:  scripts/finish-work.sh
EOF
