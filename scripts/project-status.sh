#!/usr/bin/env bash
# Put an issue on the Jump board and set its Status column.
#
# Usage: project-status.sh <issue-number> <Todo|In Progress|Done>
#
# Shared by scripts/start-work.sh (which sets "In Progress" when work starts) and
# .github/workflows/board-sync.yml (which sets it again on PR open, and "Done" on
# merge). One implementation, so a column rename breaks in one place.
#
# Field and option ids are resolved by name at run time on purpose: the board's
# ids are opaque, and a constant holding one would keep pointing at a column that
# no longer exists without anything failing to say so.
#
# Needs a token with the `project` scope. GITHUB_TOKEN cannot read or write an
# organisation project, so in CI this runs with a PAT (see board-sync.yml).
set -euo pipefail

OWNER="${JUMP_PROJECT_OWNER:-Manta-Epitech-Academy}"
NUMBER="${JUMP_PROJECT_NUMBER:-1}"
REPO="${JUMP_REPO:-Manta-Epitech-Academy/jump}"

issue="${1:-}"
status="${2:-}"

if [ -z "$issue" ] || [ -z "$status" ]; then
  echo "usage: project-status.sh <issue-number> <Todo|In Progress|Done>" >&2
  exit 2
fi

project_id=$(gh project view "$NUMBER" --owner "$OWNER" --format json -q .id)

field_id=$(gh project field-list "$NUMBER" --owner "$OWNER" --format json \
  -q '.fields[] | select(.name == "Status") | .id')
if [ -z "$field_id" ]; then
  echo "error: the board has no Status field. Columns were renamed; fix this script." >&2
  exit 1
fi

option_id=$(gh project field-list "$NUMBER" --owner "$OWNER" --format json \
  -q ".fields[] | select(.name == \"Status\") | .options[] | select(.name == \"$status\") | .id")
if [ -z "$option_id" ]; then
  echo "error: no Status option named '$status' on the board. Available:" >&2
  gh project field-list "$NUMBER" --owner "$OWNER" --format json \
    -q '.fields[] | select(.name == "Status") | .options[].name' >&2
  exit 1
fi

# item-list pages; the board is small, but ask for more than the default 30 so a
# lookup never misses an item that is simply further down the list.
item_id=$(gh project item-list "$NUMBER" --owner "$OWNER" --format json --limit 500 \
  -q ".items[] | select(.content.number == $issue) | .id" | head -1)

if [ -z "$item_id" ]; then
  echo "issue #$issue is not on the board yet, adding it"
  item_id=$(gh project item-add "$NUMBER" --owner "$OWNER" \
    --url "https://github.com/$REPO/issues/$issue" --format json -q .id)
fi

gh project item-edit --id "$item_id" --project-id "$project_id" \
  --field-id "$field_id" --single-select-option-id "$option_id" >/dev/null

echo "issue #$issue -> $status"
