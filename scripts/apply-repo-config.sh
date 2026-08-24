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
set -uo pipefail

REPO="${JUMP_REPO:-Manta-Epitech-Academy/jump}"
ROOT=$(git rev-parse --show-toplevel)
CONFIG="$ROOT/.github/settings/repo-config.json"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

[ -f "$CONFIG" ] || { echo "error: no $CONFIG" >&2; exit 1; }
command -v jq >/dev/null || { echo "error: jq is required" >&2; exit 1; }

say() { printf '\n== %s\n' "$1"; }

STATUS=0

# ------------------------------------------------------- required status checks
#
# Rulesets need repository *admin*, which is not the same thing as push access.
# The API answers a write attempt without it with a bare 404, so check first and
# say what is missing rather than reporting a mystery.

is_admin=$(gh api "repos/$REPO" --jq '.permissions.admin' 2>/dev/null || echo false)

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

# The bypass exception is the reason this repository is workable by one person, so
# losing it would be worse than never adding the checks. `bypass_actors` is only
# returned to an admin, so it is round-tripped from the GET rather than assumed:
# the payload carries back exactly what was there, and is never defaulted to an
# empty list, which would silently revoke the exception.
echo "bypass actors that will be carried over unchanged:"
printf '%s' "$current" | jq -r '
  if .bypass_actors == null then "  (not returned; only an admin sees this field)"
  elif (.bypass_actors | length) == 0 then "  (none configured)"
  else (.bypass_actors[] | "  - actor_id=\(.actor_id) type=\(.actor_type) mode=\(.bypass_mode)")
  end'

# The whole object is sent back with only `rules` replaced. Whether the endpoint
# treats a partial body as a patch or as a full replacement, this is correct.
new_rules=$(printf '%s' "$current" | jq \
  --argjson checks "$contexts" \
  --argjson strict "$strict" '
  . as $cur
  | {name, target, enforcement, conditions}
  + (if $cur.bypass_actors then {bypass_actors: $cur.bypass_actors} else {} end)
  + {
      rules: (
        ($cur.rules | map(select(.type != "required_status_checks")))
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

if [ "$is_admin" != "true" ] && [ "$DRY_RUN" != "1" ]; then
  cat >&2 <<MSG

Cannot apply the required checks: this account has push access but not admin on
$REPO, and a ruleset is an admin-level setting. GitHub answers with 404 rather
than 403, which is why this looks like a missing endpoint.

Hand this to someone with the Admin role on the repository:

  bash scripts/apply-repo-config.sh

Or, in the web UI: Settings, Rules, "push dev", tick "Require status checks to
pass" and add the contexts listed above, leaving "Require branches to be up to
date" off.

Until then every check on this repository stays advisory, which is the state this
file exists to end.
MSG
  STATUS=1
elif [ "$DRY_RUN" = "1" ]; then
  echo "dry run, payload that would be sent:"
  printf '%s' "$new_rules" | jq .
else
  backup="$ROOT/.ship/ruleset-$ruleset_id-before.json"
  mkdir -p "$(dirname "$backup")"
  printf '%s' "$current" | jq . > "$backup"
  echo "previous ruleset saved to $backup"
  if printf '%s' "$new_rules" | gh api -X PUT "repos/$REPO/rulesets/$ruleset_id" --input - >/dev/null; then
    echo "applied. Re-reading to confirm nothing was dropped:"
    gh api "repos/$REPO/rulesets/$ruleset_id" --jq '
      "  required: " + ([.rules[] | select(.type == "required_status_checks")
        | .parameters.required_status_checks[].context] | join(", "))
      + "\n  bypass actors: " + (
          if .bypass_actors == null then "not returned"
          elif (.bypass_actors | length) == 0 then "NONE - if there was an exception before, it is gone: restore it from the backup"
          else ([.bypass_actors[] | "actor_id=\(.actor_id)"] | join(", "))
          end)'
  else
    echo "error: the ruleset update was refused. The previous state is in $backup." >&2
    STATUS=1
  fi
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

if [ "$STATUS" = "0" ]; then
  say "Done"
else
  say "Done, with the required checks left to apply (see above)"
fi
exit "$STATUS"
