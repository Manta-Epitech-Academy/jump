#!/usr/bin/env bash
# Open the pull request for the current branch, carrying the link the Work item
# guard requires.
#
# Usage:
#   scripts/finish-work.sh
#   scripts/finish-work.sh --base dev --body-file .ship/pr-body.md --ready
#
# Options:
#   --base B         target branch, defaults to dev
#   --title-file F   defaults to .ship/pr-title.txt, then to the issue's own title
#   --body-file F    defaults to .ship/pr-body.md
#   --ready          open ready for review instead of as a draft
#
# The Closes line is the point of this script. It reads the issue number off the
# branch name and guarantees the body links it, so the one step that used to be
# remembered by hand stops being remembered at all.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=scripts/work-item-lib.sh
. "$SCRIPT_DIR/work-item-lib.sh"

REPO="${JUMP_REPO:-Manta-Epitech-Academy/jump}"
ROOT=$(git rev-parse --show-toplevel)

BASE="dev"; TITLE_FILE=""; BODY_FILE=""; DRAFT="--draft"

while [ $# -gt 0 ]; do
  case "$1" in
    --base)       BASE="${2:-}"; shift 2 ;;
    --title-file) TITLE_FILE="${2:-}"; shift 2 ;;
    --body-file)  BODY_FILE="${2:-}"; shift 2 ;;
    --ready)      DRAFT=""; shift ;;
    -h|--help)    sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

die() { echo "error: $1" >&2; exit 1; }

BRANCH=$(git rev-parse --abbrev-ref HEAD)
work_item_branch_ok "$BRANCH" || die "branch '$BRANCH' carries no issue number. Rename it: git branch -m ${BRANCH%%/*}/<issue>-slug"
ISSUE=$(work_item_issue "$BRANCH")

[ -n "$TITLE_FILE" ] || TITLE_FILE="$ROOT/.ship/pr-title.txt"
[ -n "$BODY_FILE" ] || BODY_FILE="$ROOT/.ship/pr-body.md"

if [ -f "$TITLE_FILE" ]; then
  TITLE=$(head -1 "$TITLE_FILE")
else
  TITLE=$(gh issue view "$ISSUE" --repo "$REPO" --json title -q .title)
  echo "no $TITLE_FILE, using the issue title: $TITLE"
fi

if [ ! -f "$BODY_FILE" ]; then
  mkdir -p "$(dirname "$BODY_FILE")"
  printf '## Context\n\nCloses #%s\n' "$ISSUE" > "$BODY_FILE"
  echo "no body file, wrote a minimal one to $BODY_FILE"
fi

# The linking keyword. GitHub accepts several; CONTRIBUTING.md asks for Closes, so
# that is what gets added when none is there.
if ! grep -qiE "(clos(e|es|ed)|fix(e[sd])?|resolv(e|es|ed))[[:space:]]*:?[[:space:]]*#${ISSUE}([^0-9]|$)" "$BODY_FILE"; then
  if grep -qE '^##[[:space:]]+Context[[:space:]]*$' "$BODY_FILE"; then
    # Land it right under the existing Context heading, where a reviewer looks.
    awk -v issue="$ISSUE" '
      { print }
      !done && /^##[[:space:]]+Context[[:space:]]*$/ { print ""; print "Closes #" issue; done = 1 }
    ' "$BODY_FILE" > "$BODY_FILE.tmp" && mv "$BODY_FILE.tmp" "$BODY_FILE"
  else
    printf '## Context\n\nCloses #%s\n\n%s' "$ISSUE" "$(cat "$BODY_FILE")" > "$BODY_FILE.tmp"
    mv "$BODY_FILE.tmp" "$BODY_FILE"
  fi
  echo "added 'Closes #$ISSUE' to $BODY_FILE"
fi

# The pull request template only auto-fills a pull request opened in the browser,
# and every one here is opened from a terminal. Without this, the Definition of
# Done would be a file nobody ever sees, which is how it ended up unread in
# CONTRIBUTING.md in the first place.
TEMPLATE="$ROOT/.github/pull_request_template.md"
if [ -f "$TEMPLATE" ] && ! grep -qiE '^#+[[:space:]]+definition of done' "$BODY_FILE"; then
  {
    printf '\n'
    awk '
      /^##[[:space:]]+Definition of Done/ { found = 1 }
      found && /^[[:space:]]*<!--/ { exit }
      found { print }
    ' "$TEMPLATE"
  } >> "$BODY_FILE"
  echo "appended the Definition of Done from $TEMPLATE"
fi

if ! git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' >/dev/null 2>&1; then
  git push -u origin "$BRANCH"
fi

# shellcheck disable=SC2086
url=$(gh pr create --repo "$REPO" --base "$BASE" $DRAFT \
  --title "$TITLE" --body-file "$BODY_FILE")
echo "$url"

echo
echo "Verifying the same way CI will:"
bash "$SCRIPT_DIR/check-work-item.sh" --base "$BASE"
