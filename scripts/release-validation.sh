#!/usr/bin/env bash
# Build the PO's validation checklist for a release.
#
# It collects the issues closed by every pull request merged into `dev` but not
# yet promoted to `staging`, and prints their Acceptance Criteria as one markdown
# checklist, ready to paste into the body of the `release: vX` pull request.
#
# Why this exists: the PO's approval is the one step of the protocol that leaves
# no artifact, and rule 1 of CONTRIBUTING.md says a step whose trace lives
# outside the repository gets forgotten. It also removes the second-largest
# source of PO frustration after unusable data, which is not knowing what one is
# being asked to judge.
#
# Nothing is invented. The `Work item` check already refuses an issue whose
# `Acceptance Criteria` section is missing or empty, so the raw material is
# guaranteed to exist; this only aggregates it.
#
# Usage:
#   scripts/release-validation.sh                      # dev not yet in staging
#   scripts/release-validation.sh --base staging       # against another target
#   scripts/release-validation.sh > .ship/pr-body.md
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=scripts/work-item-sections.sh
. "$SCRIPT_DIR/work-item-sections.sh"

REPO="${JUMP_REPO:-Manta-Epitech-Academy/jump}"
SOURCE="dev"
TARGET="staging"
LIMIT=100

while [ $# -gt 0 ]; do
  case "$1" in
    --source) SOURCE="$2"; shift 2 ;;
    --base) TARGET="$2"; shift 2 ;;
    --limit) LIMIT="$2"; shift 2 ;;
    -h|--help)
      awk 'NR > 1 && /^#/ { sub(/^# ?/, ""); print; next } NR > 1 { exit }' "$0"
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

command -v gh >/dev/null || { echo "gh is required." >&2; exit 1; }

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

git fetch origin "$TARGET" --quiet 2>/dev/null || true

# Every pull request merged into the source branch, newest first, with the commit
# it landed as. The commit is what decides whether it has been promoted: comparing
# merge dates would misread a promotion that happened out of order.
gh pr list --repo "$REPO" --base "$SOURCE" --state merged --limit "$LIMIT" \
  --json number,title,body,mergeCommit \
  --jq '.[] | [.number, (.mergeCommit.oid // ""), .title] | @tsv' > "$WORK/prs.tsv"

printf '## Validation PO\n\n'
printf 'Critères d'"'"'acceptation des issues de cette release, agrégés depuis GitHub par `scripts/release-validation.sh`. Une case cochée est un critère constaté sur `staging`.\n\n'

found=0
while IFS=$'\t' read -r pr_number merge_oid pr_title; do
  [ -n "$merge_oid" ] || continue
  # Already in the target branch means already validated in a previous release.
  if git merge-base --is-ancestor "$merge_oid" "origin/$TARGET" 2>/dev/null; then
    continue
  fi

  gh pr view "$pr_number" --repo "$REPO" --json body --jq '.body // ""' > "$WORK/pr-body.md"

  # The issues this pull request closes, in the same shape the guard accepts.
  issues=$(grep -oiE '(clos(e|es|ed)|fix(e[sd])?|resolv(e|es|ed))[[:space:]]*:?[[:space:]]*#[0-9]+' "$WORK/pr-body.md" \
    | grep -oE '[0-9]+' | sort -u || true)

  if [ -z "$issues" ]; then
    printf '### #%s — %s\n\n' "$pr_number" "$pr_title"
    printf '_Aucune issue liée : rien à valider automatiquement, à vérifier à la main._\n\n'
    found=1
    continue
  fi

  for issue in $issues; do
    title=$(gh issue view "$issue" --repo "$REPO" --json title --jq '.title // ""' 2>/dev/null || true)
    [ -n "$title" ] || continue
    gh issue view "$issue" --repo "$REPO" --json body --jq '.body // ""' > "$WORK/issue.md"

    printf '### #%s — %s\n\n' "$issue" "$title"
    if criteria=$(section_body "$WORK/issue.md" "$WORK_ITEM_CRITERIA_PATTERN"); then
      # Two shapes occur in this repository's issues: a bulleted list, and one
      # criterion per bare line. A list becomes checkboxes marker by marker; a
      # bare block becomes one checkbox per line. The wording is never touched -
      # a criterion is the PO's sentence, and rewording it would quietly change
      # what is being agreed to.
      if printf '%s\n' "$criteria" | grep -qE '^[[:space:]]*[-*][[:space:]]+'; then
        printf '%s\n' "$criteria" \
          | sed -E 's/^([[:space:]]*)[-*][[:space:]]+(\[[ xX]\][[:space:]]*)?/\1- [ ] /' \
          | sed '/^[[:space:]]*$/d'
      else
        printf '%s\n' "$criteria" \
          | sed '/^[[:space:]]*$/d' \
          | sed -E 's/^[[:space:]]*/- [ ] /'
      fi
      printf '\n'
    else
      printf '_Pas de section « Acceptance Criteria » lisible sur cette issue._\n\n'
    fi
    found=1
  done
done < "$WORK/prs.tsv"

if [ "$found" = 0 ]; then
  printf '_Aucune pull request mergée sur `%s` en attente de promotion vers `%s`._\n' "$SOURCE" "$TARGET"
fi
