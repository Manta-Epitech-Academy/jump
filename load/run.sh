#!/usr/bin/env bash
# Load-test launcher. Knows the right paths so you don't have to.
#
#   ./load/run.sh                      # help
#   ./load/run.sh list                 # list scenarios
#   ./load/run.sh manifest             # refresh data.json (via API)
#   ./load/run.sh seed [N]             # seed N load-test talents (default 100, via API)
#   ./load/run.sh cleanup              # delete all @loadtest.invalid users (via API)
#   ./load/run.sh <scenario>           # run e.g. talent-home, mixed, cohort-view
#
# Everything is remote: seed/manifest/cleanup are curl calls to Jump's API
# (/api/test/*, bearer LOAD_TEST_SECRET) and run against the TARGET's own DB.
# No database access from this machine. Those endpoints must be deployed on the
# target (like /api/test/login-as); a 404 means they aren't.
#
# Env (read from repo-root .env, overridable on the CLI):
#   BASE_URL          default http://localhost:5173
#   LOAD_TEST_SECRET  required for any scenario, seed, manifest, cleanup
#   COUNT             talents to seed (seed command)
#   CHUNK             talents seeded per request (default 500)
#   SAMPLE            manifest pool-size hint (default 50)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load .env so the user doesn't have to export anything by hand.
if [[ -f .env ]]; then
  set -a; . ./.env; set +a
fi

BASE_URL="${BASE_URL:-http://localhost:5173}"
CHUNK="${CHUNK:-500}"
SAMPLE="${SAMPLE:-50}"
SCENARIOS_DIR="load/k6/scenarios"

cmd="${1:-help}"
shift || true

require_secret() {
  if [[ -z "${LOAD_TEST_SECRET:-}" ]]; then
    echo "✗ LOAD_TEST_SECRET not set (check .env or export it)" >&2
    exit 1
  fi
}

api_post() { # path [json-body]
  curl -fsS -X POST "$BASE_URL$1" \
    -H 'content-type: application/json' \
    -H "authorization: Bearer $LOAD_TEST_SECRET" \
    ${2:+-d "$2"}
}
api_get() { # path
  curl -fsS "$BASE_URL$1" -H "authorization: Bearer $LOAD_TEST_SECRET"
}

do_manifest() {
  echo "-> Building manifest from ${BASE_URL}..."
  api_get "/api/test/manifest?sample=$SAMPLE" > "$ROOT/load/data.json" || {
    echo "✗ manifest fetch failed (are the /api/test/* endpoints deployed?)" >&2; exit 1; }
  echo "✓ wrote load/data.json"
}

do_seed() { # total
  local total="$1" start=1 count
  echo "→ Seeding $total load-test talents at $BASE_URL (chunks of $CHUNK)…"
  while (( start <= total )); do
    count=$(( CHUNK < total - start + 1 ? CHUNK : total - start + 1 ))
    api_post /api/test/seed-talents "{\"start\":$start,\"count\":$count}" >/dev/null || {
      echo "✗ seed failed at start=$start (are the /api/test/* endpoints deployed?)" >&2; exit 1; }
    echo "  …$(( start + count - 1 ))/$total"
    start=$(( start + CHUNK ))
  done
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
    require_secret
    do_manifest
    ;;

  seed)
    require_secret
    do_seed "${1:-${COUNT:-100}}"
    do_manifest
    ;;

  cleanup)
    require_secret
    echo "→ Deleting @loadtest.invalid accounts at $BASE_URL…"
    api_post /api/test/cleanup || {
      echo "✗ cleanup failed (are the /api/test/* endpoints deployed?)" >&2; exit 1; }
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
      echo "→ data.json missing, building manifest first…"
      do_manifest
    fi
    exec k6 run \
      -e "BASE_URL=$BASE_URL" \
      -e "LOAD_TEST_SECRET=$LOAD_TEST_SECRET" \
      ${LOGIN_EMAIL:+-e "LOGIN_EMAIL=$LOGIN_EMAIL"} \
      ${COUNT:+-e "COUNT=$COUNT"} \
      "$script"
    ;;
esac
