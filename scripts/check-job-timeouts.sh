#!/bin/sh
# Every workflow job declares its own `timeout-minutes`.
#
# A job without one runs under GitHub's default of 360 minutes. On 2026-11-19
# `SAST (Semgrep)` stalled before its scan, fetching its rulesets from
# semgrep.dev, and sat there printing nothing: a step that takes 16 to 27
# seconds held pull request #523 for 17 minutes until someone cancelled it by
# hand, and would have held it for six hours (#525). No job in
# `.github/workflows/` had a ceiling then, so the same was true of every one.
#
# How a ceiling is sized, so the next job follows the same rule: three times
# the longest run measured on that job, rounded up to the next five minutes,
# never under five. A ceiling is a hang detector, not a performance budget, so
# it sits far enough above a slow day not to fail one. A job whose steps carry
# their own deadlines sits above their sum instead, so the step's own error,
# which says what it was waiting for, is the one that fires.
#
#   bun run lint:job-timeouts    # from frontend/, and inside `bun run verify`
#   sh scripts/check-job-timeouts.sh
set -eu

cd "$(git rev-parse --show-toplevel)"

# A job is a two-space key under `jobs:`, and its own settings are indented
# four spaces. Prints `file:line:job` for every job that ends without one.
# Plain POSIX awk, no gawk-only ENDFILE: a file ends when the next one starts.
missing=$(awk '
  function flush() { if (job != "" && !bounded) print file ":" line ":" job; job = "" }
  FNR == 1 { flush(); injobs = 0; file = FILENAME }
  /^jobs:/ { injobs = 1; next }
  /^[^ #]/ { if (injobs) flush(); injobs = 0 }
  injobs && /^  [A-Za-z0-9_-]+:[[:space:]]*$/ {
    flush(); job = $1; sub(/:$/, "", job); line = FNR; bounded = 0; next
  }
  injobs && /^    timeout-minutes:[[:space:]]*[0-9]+[[:space:]]*(#.*)?$/ { bounded = 1 }
  END { flush() }
' .github/workflows/*.yml)

fail=0
for at in $missing; do
  file=${at%%:*}
  rest=${at#*:}
  echo "::error file=$file,line=${rest%%:*}::Job '${rest#*:}' has no timeout-minutes, so a hang holds it for GitHub's default of six hours. Add one, sized as scripts/check-job-timeouts.sh says."
  fail=1
done

if [ "$fail" -eq 0 ]; then
  echo "Every workflow job declares its timeout-minutes."
fi
exit "$fail"
