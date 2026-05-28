#!/usr/bin/env bash
# Load-test launcher. Knows the right paths so you don't have to.
#
#   ./load/run.sh                      # help
#   ./load/run.sh list                 # list scenarios
#   ./load/run.sh manifest             # refresh data.json
#   ./load/run.sh seed [N]             # seed N load-test talents (default 100)
#   ./load/run.sh cleanup              # delete all @loadtest.invalid users
#   ./load/run.sh <scenario>           # run e.g. talent-home, mixed, cohort-view
#   ./load/run.sh drain-pdfs           # POST /api/jobs/onboarding-pdfs
#
# Env (read from repo-root .env, overridable on the CLI):
#   BASE_URL          default http://localhost:5173
#   LOAD_TEST_SECRET  required for any scenario or drain-pdfs
#   CRON_SECRET       required for drain-pdfs
#   COUNT             passed through to seed / signature-burst

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load .env so the user doesn't have to export anything by hand.
if [[ -f .env ]]; then
  set -a; . ./.env; set +a
fi

BASE_URL="${BASE_URL:-http://localhost:5173}"
SCENARIOS_DIR="load/k6/scenarios"

cmd="${1:-help}"
shift || true

bun_script() {
  cd "$ROOT/frontend"
  bun --env-file=../.env "scripts/load-test/$1" "${@:2}"
}

require_secret() {
  if [[ -z "${LOAD_TEST_SECRET:-}" ]]; then
    echo "✗ LOAD_TEST_SECRET not set (check .env or export it)" >&2
    exit 1
  fi
}

list_scenarios() {
  for f in "$SCENARIOS_DIR"/*.js; do basename "$f" .js; done
}

case "$cmd" in
  help|-h|--help)
    grep '^#' "${BASH_SOURCE[0]}" | grep -v '^#!/' | sed 's/^# \?//'
    ;;

  list)
    list_scenarios
    ;;

  manifest)
    bun_script manifest.ts
    ;;

  seed)
    COUNT="${1:-${COUNT:-100}}" bun_script seed-load-talents.ts
    echo "→ Refreshing manifest…"
    bun_script manifest.ts
    ;;

  cleanup)
    bun_script cleanup.ts
    ;;

  drain-pdfs)
    require_secret
    if [[ -z "${CRON_SECRET:-}" ]]; then
      echo "✗ CRON_SECRET not set" >&2; exit 1
    fi
    curl -fsS -X POST "$BASE_URL/api/jobs/onboarding-pdfs" \
      -H "Authorization: Bearer $CRON_SECRET"
    echo
    ;;

  *)
    script="$SCENARIOS_DIR/$cmd.js"
    if [[ ! -f "$script" ]]; then
      echo "✗ Unknown scenario '$cmd'. Available:" >&2
      list_scenarios | sed 's/^/  /' >&2
      exit 1
    fi
    require_secret
    if [[ ! -f load/data.json ]]; then
      echo "→ data.json missing, generating manifest first…"
      bun_script manifest.ts
      cd "$ROOT"
    fi
    exec k6 run \
      -e "BASE_URL=$BASE_URL" \
      -e "LOAD_TEST_SECRET=$LOAD_TEST_SECRET" \
      ${LOGIN_EMAIL:+-e "LOGIN_EMAIL=$LOGIN_EMAIL"} \
      ${COUNT:+-e "COUNT=$COUNT"} \
      "$script"
    ;;
esac
