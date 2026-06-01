#!/usr/bin/env bash
# Stress 2K launcher — seeds a throwaway 2000-user pool, builds the manifest,
# then runs the stress-2k.js write-flood against it. One command, end to end.
#
#   ./load/stress-2k.sh                 # full run: seed → manifest → stress
#   ./load/stress-2k.sh run             #   (same as no arg)
#   ./load/stress-2k.sh seed            # seed + manifest only, no k6 run
#   ./load/stress-2k.sh cleanup         # delete every @loadtest.invalid user
#
# Everything is remote. Seed, manifest and cleanup are plain curl calls to Jump's
# API (/api/test/*, bearer LOAD_TEST_SECRET); the server does the DB work against
# the TARGET's own database. This machine never touches a DB or kube — just the
# token + BASE_URL. The /api/test/* endpoints must be deployed on the target
# (same as /api/test/login-as); a 404 from seed/manifest means they aren't yet.
#
# No drain step: signRules fires `void runOnboardingPdfJob` inline (Puppeteer on
# the pod), so the queue drains itself. Retry FAILED jobs from
# /staff/admin/onboarding-pdfs.
#
# Env (read from repo-root .env, overridable on the CLI):
#   BASE_URL          default https://jump-preprod.epiboost.eu (localhost or *preprod*)
#   LOAD_TEST_SECRET  required
#   VUS               talent VUs / distinct users   (default 2000)
#   STAFF_VUS         staff contention VUs          (default 50)
#   RAMP              ramp-up duration              (default 1m)
#   HOLD              soak-at-full duration         (default 5m)
#   SEED              talents to seed before run    (default = VUS; 0 skips seeding)
#   CHUNK             talents seeded per request    (default 500)
#   SAMPLE            manifest pool-size hint        (default 50)
#   FORCE=1           skip the destructive-target confirmation prompt
#
# ⚠️  WRITE FLOOD: it stamps signatures, appends XpGrant rows and enqueues an
#     OnboardingPdfJob on EVERY iteration across up to 2000 users. It pollutes the
#     target DB hard. Run `./load/stress-2k.sh cleanup` after. NEVER point at prod.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load .env so the user doesn't have to export anything by hand.
if [[ -f .env ]]; then
  set -a; . ./.env; set +a
fi

BASE_URL="${BASE_URL:-https://jump-preprod.epiboost.eu}"
VUS="${VUS:-2000}"
STAFF_VUS="${STAFF_VUS:-50}"
RAMP="${RAMP:-1m}"
HOLD="${HOLD:-5m}"
SEED="${SEED:-$VUS}"
CHUNK="${CHUNK:-500}"
SAMPLE="${SAMPLE:-50}"
FORCE="${FORCE:-0}"
SCRIPT="load/k6/scenarios/stress-2k.js"

cmd="${1:-run}"

# --- prerequisites -----------------------------------------------------------
require_secret() {
  [[ -n "${LOAD_TEST_SECRET:-}" ]] || {
    echo "✗ LOAD_TEST_SECRET not set (check .env or export it)" >&2; exit 1; }
}
require_k6() {
  command -v k6 >/dev/null 2>&1 || { echo "✗ k6 not found in PATH" >&2; exit 1; }
}

# Thin HTTP helpers — all data ops go through the API with the bearer token.
api_post() { # path [json-body]
  curl -fsS -X POST "$BASE_URL$1" \
    -H 'content-type: application/json' \
    -H "authorization: Bearer $LOAD_TEST_SECRET" \
    ${2:+-d "$2"}
}
api_get() { # path
  curl -fsS "$BASE_URL$1" -H "authorization: Bearer $LOAD_TEST_SECRET"
}

# Safety net: this floods writes, so refuse any target that isn't obviously
# localhost or a preprod host unless FORCE=1 is set. Keeps a stray prod URL out.
guard_target() {
  case "$BASE_URL" in
    *localhost*|*127.0.0.1*|*preprod*) return 0 ;;
  esac
  if [[ "$FORCE" != "1" ]]; then
    echo "✗ BASE_URL='$BASE_URL' is neither localhost nor a *preprod* host." >&2
    echo "  This script floods writes and must NEVER hit prod. Re-run with FORCE=1" >&2
    echo "  if you are certain this target is a throwaway environment." >&2
    exit 1
  fi
  echo "⚠ FORCE=1 — proceeding against non-preprod target '$BASE_URL'."
}

confirm_run() {
  [[ "$FORCE" == "1" ]] && return 0
  echo
  echo "About to FLOOD writes at: $BASE_URL"
  echo "  talent VUs: $VUS   staff VUs: $STAFF_VUS   ramp: $RAMP   hold: $HOLD   seed: $SEED"
  echo "  This appends XpGrant + OnboardingPdfJob rows on every iteration."
  read -r -p "Continue? [y/N] " ans
  [[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "Aborted."; exit 1; }
}

print_manifest_counts() {
  command -v python3 >/dev/null 2>&1 || return 0
  python3 - "$ROOT/load/data.json" <<'PY' || true
import json, sys
d = json.load(open(sys.argv[1]))
for k in ("talents","staffDev","staffPeda","events","activities","participations","loadTestTalents"):
    v = d.get(k, [])
    print(f"  {k:<18}{len(v) if isinstance(v, list) else v}")
PY
}

# seed (via API, chunked) + manifest (via API → load/data.json)
do_seed() {
  if [[ "$SEED" -gt 0 ]]; then
    echo "→ Seeding $SEED load-test talents at $BASE_URL (chunks of $CHUNK)…"
    local start=1 count
    while (( start <= SEED )); do
      count=$(( CHUNK < SEED - start + 1 ? CHUNK : SEED - start + 1 ))
      api_post /api/test/seed-talents "{\"start\":$start,\"count\":$count}" >/dev/null || {
        echo "✗ seed failed at start=$start (are the /api/test/* endpoints deployed?)" >&2
        exit 1
      }
      echo "  …$(( start + count - 1 ))/$SEED"
      start=$(( start + CHUNK ))
    done
  else
    echo "→ SEED=0, skipping seed."
  fi
  echo "→ Building manifest from $BASE_URL…"
  api_get "/api/test/manifest?sample=$SAMPLE" > "$ROOT/load/data.json" || {
    echo "✗ manifest fetch failed (are the /api/test/* endpoints deployed?)" >&2
    exit 1
  }
  print_manifest_counts
}

# --- commands ----------------------------------------------------------------
case "$cmd" in
  help|-h|--help)
    grep '^#' "${BASH_SOURCE[0]}" | grep -v '^#!/' | sed 's/^# \?//'
    ;;

  seed)
    require_secret
    guard_target
    do_seed
    ;;

  cleanup)
    require_secret
    echo "→ Deleting @loadtest.invalid accounts at $BASE_URL…"
    api_post /api/test/cleanup || {
      echo "✗ cleanup failed (are the /api/test/* endpoints deployed?)" >&2; exit 1; }
    echo
    ;;

  run)
    require_secret
    require_k6
    guard_target
    confirm_run
    do_seed
    echo "→ Running stress-2k ($VUS talent VUs + $STAFF_VUS staff VUs)…"
    exec k6 run \
      -e "BASE_URL=$BASE_URL" \
      -e "LOAD_TEST_SECRET=$LOAD_TEST_SECRET" \
      -e "VUS=$VUS" \
      -e "STAFF_VUS=$STAFF_VUS" \
      -e "RAMP=$RAMP" \
      -e "HOLD=$HOLD" \
      "$SCRIPT"
    ;;

  *)
    echo "✗ Unknown command '$cmd'. Try: run | seed | cleanup | help" >&2
    exit 1
    ;;
esac
