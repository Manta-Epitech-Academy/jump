#!/bin/sh
# Generate and verify the seed, at more than one volume.
#
# Not inlined in package.json, because the reason there are two profiles here is
# the whole point and package.json cannot carry it.
#
# `ci` is the small one: wide enough that every enum value and every reachable
# state is present, small enough to run inside `verify` without anybody noticing.
# It is what proves the generator COVERS the schema.
#
# `dev` is the second one, and it exists because a check that only ever runs at
# the smallest volume is blind to any defect whose trigger IS volume. That is not
# hypothetical: `stage` derived a dossier's filing date from the enrolment index,
# which held at a cohort of fourteen and dated 115 dossiers after `--today` at
# every profile a person actually opens. `assert/clock.ts` would have said so on
# the first run, and never got one.
#
# `staging` is deliberately NOT here. It runs the same scenarios at production
# volume, so it exercises no branch `dev` does not, and it costs about 45 seconds
# against `dev`'s few. It is what somebody runs before a release freeze, not what
# every pull request pays for.
#
# Called through scripts/with-test-db.sh, which owns the database and exports
# DATABASE_URL, so both runs land on the same disposable one: the second wipes
# what the first wrote, which is itself the wipe path getting exercised.
set -eu

# Early enough in the calendar year that a school-year switcher has two
# years to switch between: this anchor is inside 2025-2026 (the cycle opens
# 31 July), and `longTail.ts` places one event 300 days back on purpose,
# which is more than the ~227 days between this anchor and the preceding
# 31 July 2025 cutover, so it lands in 2024-2025. The previous anchor,
# 2026-06-15, sat 319 days after that same cutover - past every offset the
# generator draws - so every event stayed inside one school year and
# `SchoolYearMenu` had nothing to switch between in the exact configuration
# this check runs.
ANCHOR=2026-03-15

for profile in ci dev; do
  echo "[seed] profile ${profile}" >&2
  bun run scripts/seed/index.ts \
    --env test --profile "$profile" --today "$ANCHOR" --check
done

# Last, and on the database the loop leaves behind: the gate that decides whether
# the generator may run at all is the one thing `--check` cannot speak about,
# since a refusal means there is nothing to check. It needs a generated database
# to have something to accept, and it dirties that database to have something to
# refuse, so it goes after everything else.
echo "[seed] ownership gate" >&2
bun run scripts/seed/check-gate.ts
