#!/usr/bin/env bash
# Generate CHANGELOG.md from merged PRs, grouped by date.
# Requires: gh (GitHub CLI), authenticated.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
OUTPUT="$ROOT/CHANGELOG.md"
REPO="Manta-Epitech-Academy/intra-epitech-academy"

echo "# Changelog" > "$OUTPUT"
echo "" >> "$OUTPUT"
echo "All notable changes to this project will be documented in this file." >> "$OUTPUT"
echo "" >> "$OUTPUT"

# Fetch all merged PRs targeting dev, sorted by merge date (oldest first)
gh pr list \
  --repo "$REPO" \
  --base dev \
  --state merged \
  --limit 1000 \
  --json number,title,mergedAt \
  --jq 'sort_by(.mergedAt) | .[] | "\(.mergedAt | split("T")[0])|\(.number)|\(.title)"' \
| awk -F'|' '
{
  date = $1
  number = $2
  title = $3

  # Determine type from conventional commit prefix in PR title
  type = ""
  if (title ~ /^feat/) type = "added"
  else if (title ~ /^fix/) type = "fixed"
  else if (title ~ /^refactor/ || title ~ /^perf/ || title ~ /^style/) type = "changed"
  else type = "other"

  # Skip chore/ci/docs/test PRs
  if (title ~ /^chore/ || title ~ /^ci/ || title ~ /^docs/ || title ~ /^test/ || title ~ /^build/) next

  if (date != current_date) {
    if (current_date != "") printf "\n---\n\n"
    printf "### %s\n\n", date
    current_date = date
  }

  if (type == "other")
    printf "- %s ([#%s](https://github.com/'"$REPO"'/pull/%s))\n", title, number, number
  else
    printf "- **%s:** %s ([#%s](https://github.com/'"$REPO"'/pull/%s))\n", type, title, number, number
}
' >> "$OUTPUT"

echo "" >> "$OUTPUT"
echo "✓ Changelog written to $OUTPUT"
