#!/usr/bin/env bash
# Stress 2K launcher — seeds a throwaway 2000-user pool, refreshes the manifest,
# then runs the stress-2k.js write-flood against it. One command, end to end.
#
#   ./load/stress-2k.sh                 # full run: seed → manifest → stress
#   ./load/stress-2k.sh run             #   (same as no arg)
#   ./load/stress-2k.sh seed            # seed + manifest only, no k6 run
#   ./load/stress-2k.sh cleanup         # delete every @loadtest.invalid user
#
# Note: there is no drain step. signRules fires `void runOnboardingPdfJob` inline
# (fire-and-forget, Puppeteer on the pod), so the queue drains itself as the
# flood runs. Retry any FAILED jobs from /staff/admin/onboarding-pdfs.
#
# Env (read from repo-root .env, overridable on the CLI):
#   BASE_URL          default http://localhost:5173   (must be localhost or *preprod*)
#   LOAD_TEST_SECRET  required
#   VUS               talent VUs / distinct users   (default 2000)
#   STAFF_VUS         staff contention VUs          (default 50)
#   RAMP              ramp-up duration              (default 1m)
#   HOLD              soak-at-full duration         (default 5m)
#   SEED              talents to seed before run    (default = VUS; 0 skips seeding)
#   FORCE=1           skip the destructive-target confirmation prompt
#
# ⚠️  This is a WRITE FLOOD: it stamps signatures, appends XpGrant rows and
#     enqueues an OnboardingPdfJob on EVERY iteration across up to 2000 users.
#     It pollutes the target DB hard. Run `./load/stress-2k.sh cleanup` after.
#     NEVER point it at prod.

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
FORCE="${FORCE:-0}"
SCRIPT="load/k6/scenarios/stress-2k.js"

cmd="${1:-run}"

# --- prerequisites -----------------------------------------------------------
require_secret() {
  if [[ -z "${LOAD_TEST_SECRET:-}" ]]; then
    echo "✗ LOAD_TEST_SECRET not set (check .env or export it)" >&2
    exit 1
  fi
}

require_k6() {
  command -v k6 >/dev/null 2>&1 || { echo "✗ k6 not found in PATH" >&2; exit 1; }
}

bun_script() {
  ( cd "$ROOT/frontend" && bun --env-file=../.env "scripts/load-test/$1" "${@:2}" )
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

do_seed() {
  if [[ "$SEED" -gt 0 ]]; then
    echo "→ Seeding $SEED load-test talents…"
    COUNT="$SEED" bun_script seed-load-talents.ts
  else
    echo "→ SEED=0, skipping seed."
  fi
  echo "→ Refreshing manifest…"
  bun_script manifest.ts
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
    bun_script cleanup.ts
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
