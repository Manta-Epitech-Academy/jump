#!/usr/bin/env bash
# Apply .github/settings/repo-config.json to GitHub: the required status checks on
# the `dev` ruleset, and the labels the issue templates and the CI escape hatch
# reference.
#
# Usage:
#   scripts/apply-repo-config.sh --dry-run   # print what would change
#   scripts/apply-repo-config.sh
#
# Why a script and a committed file rather than clicking in Settings: a ruleset
# edited in a browser is invisible to review, unreproducible, and impossible to
# explain six months later. The reasons for each choice live next to the choice,
# in the JSON.
#
# Needs a token that can administer the repository. The previous ruleset is saved
# to .ship/ before anything is written, so a mistake is recoverable.
set -euo pipefail

REPO="${JUMP_REPO:-Manta-Epitech-Academy/jump}"
ROOT=$(git rev-parse --show-toplevel)
CONFIG="$ROOT/.github/settings/repo-config.json"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

[ -f "$CONFIG" ] || { echo "error: no $CONFIG" >&2; exit 1; }
command -v jq >/dev/null || { echo "error: jq is required" >&2; exit 1; }

say() { printf '\n== %s\n' "$1"; }

# ------------------------------------------------------- required status checks

ruleset_name=$(jq -r '.requiredStatusChecks.ruleset' "$CONFIG")
strict=$(jq -r '.requiredStatusChecks.strict' "$CONFIG")
contexts=$(jq -c '.requiredStatusChecks.contexts' "$CONFIG")

say "Ruleset '$ruleset_name'"

ruleset_id=$(gh api "repos/$REPO/rulesets" \
  --jq ".[] | select(.name == \"$ruleset_name\") | .id" | head -1)
[ -n "$ruleset_id" ] || { echo "error: no ruleset named '$ruleset_name' on $REPO" >&2; exit 1; }

current=$(gh api "repos/$REPO/rulesets/$ruleset_id")

echo "currently required:"
printf '%s' "$current" | jq -r '
  (.rules[] | select(.type == "required_status_checks")
    | .parameters.required_status_checks[].context)
  // empty' | sed 's/^/  - /' || true
printf '%s' "$current" | jq -e '.rules[] | select(.type == "required_status_checks")' >/dev/null 2>&1 \
  || echo "  (none, so every check is advisory today)"

echo "will be required:"
printf '%s' "$contexts" | jq -r '.[]' | sed 's/^/  - /'

# Send only the rules array. The update endpoint takes partial bodies, so keeping
# the payload to what actually changes cannot disturb conditions or bypass actors.
new_rules=$(printf '%s' "$current" | jq \
  --argjson checks "$contexts" \
  --argjson strict "$strict" '
  {
    rules: (
      (.rules | map(select(.type != "required_status_checks")))
      + [{
          type: "required_status_checks",
          parameters: {
            strict_required_status_checks_policy: $strict,
            do_not_enforce_on_create: false,
            required_status_checks: ($checks | map({context: .}))
          }
        }]
    )
  }')

if [ "$DRY_RUN" = "1" ]; then
  echo "dry run, payload that would be sent:"
  printf '%s' "$new_rules" | jq .
else
  backup="$ROOT/.ship/ruleset-$ruleset_id-before.json"
  mkdir -p "$(dirname "$backup")"
  printf '%s' "$current" | jq . > "$backup"
  echo "previous ruleset saved to $backup"
  printf '%s' "$new_rules" | gh api -X PUT "repos/$REPO/rulesets/$ruleset_id" --input - >/dev/null
  echo "applied."
fi

# ----------------------------------------------------------------------- labels

say "Labels"

jq -c '.labels[]' "$CONFIG" | while read -r label; do
  name=$(printf '%s' "$label" | jq -r .name)
  color=$(printf '%s' "$label" | jq -r .color)
  desc=$(printf '%s' "$label" | jq -r .description)
  if [ "$DRY_RUN" = "1" ]; then
    echo "  would upsert: $name (#$color)"
  else
    # --force upserts, so this is safe to re-run.
    gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force >/dev/null
    echo "  upserted: $name"
  fi
done

say "Done"
