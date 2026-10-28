#!/bin/sh
# The Bun that CI tests is the Bun that ships.
#
# One version, two readers that cannot share a file. CI's `oven-sh/setup-bun`
# reads `packageManager` from frontend/package.json (through `bun-version-file`,
# since that package.json is not at the repo root where the action looks by
# default). The production image reads `ARG BUN_VERSION` in frontend/Dockerfile,
# because a Dockerfile cannot read package.json. This holds the copy equal to
# the source, and every setup-bun step on the source.
#
# Before it, no setup-bun step named a version, so CI installed the latest Bun
# (1.4.3 on the last green `dev` run) while production ran 1.3.14: a green run
# said nothing about the runtime that shipped.
#
#   bun run lint:bun-pin    # from frontend/, and inside `bun run verify`
#   sh scripts/check-bun-pin.sh
set -eu

cd "$(git rev-parse --show-toplevel)"

pinned=$(sed -n 's/^ *"packageManager": *"bun@\([^"]*\)".*/\1/p' frontend/package.json)
image=$(sed -n 's/^ARG BUN_VERSION=\([^ ]*\)$/\1/p' frontend/Dockerfile)

fail=0
if [ -z "$pinned" ]; then
  echo "::error file=frontend/package.json::frontend/package.json has no \"packageManager\": \"bun@<version>\". It is the one place the Bun version is set."
  fail=1
elif [ "$image" != "$pinned" ]; then
  echo "::error file=frontend/Dockerfile::ARG BUN_VERSION is '${image:-missing}' but frontend/package.json pins bun@$pinned. Set the Dockerfile to the same version, or CI tests one Bun and production runs another."
  fail=1
fi

# A setup-bun step without `bun-version-file` falls back to `latest`, silently.
# The input has to follow within the step's next three lines (`with:` and it).
unpinned=$(awk '
  FNR == 1 { if (at) print file ":" at; at = 0; file = FILENAME }
  /uses: *oven-sh\/setup-bun/ { if (at) print file ":" at; at = FNR; next }
  at && /bun-version-file: *frontend\/package\.json/ { at = 0; next }
  at && FNR > at + 3 { print file ":" at; at = 0 }
  END { if (at) print file ":" at }
' .github/workflows/*.yml)

for step in $unpinned; do
  echo "::error file=${step%:*},line=${step##*:}::This setup-bun step does not read the pinned version. Add 'with: bun-version-file: frontend/package.json' under it."
  fail=1
done

exit "$fail"
