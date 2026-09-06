#!/bin/sh
# Provision the integration / E2E database, then run the given command against it.
#
# Not called directly: it is what the `test:*` scripts in package.json wrap, so
# the command it execs already has node_modules/.bin on its PATH.
#
#   bun run test:integration    # -> vitest run --project integration
#   bun run test:e2e            # -> playwright test, on the `_e2e` database
#   bun run test:db             # provision only
#
# ONE database per worktree AND per suite, on ONE Postgres, and ONE port per
# worktree for the server the E2E suite drives. Everything that has to differ
# between two worktrees is derived HERE, from one discriminant, because a value
# that is only per-worktree in one of the two layers is not isolated at all.
#
# Per worktree, because the worktrees on this machine share the checkout's history
# but not its untracked files, and they also shared the single `jump_test`
# database from docker-compose.test.yml: a `migrate deploy` run from one branch
# left every other worktree's suite red against a schema it was never written for,
# with nothing to say so. The discriminant is the one `setup-worktree.sh` already
# uses, so the two agree on what "a worktree" means.
#
# Per suite (`TEST_DB_SUITE`), because the integration suites and the E2E fixture
# have incompatible data lifecycles. The E2E fixture is seeded once and has to
# survive the whole Playwright run; an integration suite cleans up per file. And
# several integration assertions read a PLATFORM-WIDE aggregate on purpose (the
# standing image-rights interdictions are the figure no filter narrows), so a
# talent left behind by the E2E fixture silently widens their denominator. That
# is not a scoping bug in the aggregate: it is two lifecycles in one database,
# the same mistake as the worktrees, one level down.
#
# `assertTestDatabase()` still passes on every name produced here: it looks for
# the substring `jump_test`, which every name below carries.
set -eu

cd "$(dirname "$0")/.."

# ── Environment, in the one order that survives Prisma ───────────────────────
#
# `prisma.config.ts` calls `dotenv.config({ path: '../.env' })`, which does NOT
# overwrite a variable already present in the environment. So DATABASE_URL has to
# be exported LAST, after .env.test, or the CLI would migrate whatever the
# repo-root .env points at, which is the shared dev database. The same ordering
# is what lets this script own PORT and ORIGIN: a stale `.env.test` carrying the
# old hardcoded 4173 loses to the exports at the bottom of this file.
if [ -f .env.test ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.test
  set +a
fi

# ── Which database, and which port ──────────────────────────────────────────
repo_root=$(git rev-parse --show-toplevel)
main_root=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")

db_name=jump_test
port=4173

if [ "$repo_root" != "$main_root" ]; then
  slug=$(basename "$repo_root" | tr '[:upper:]' '[:lower:]' \
    | sed 's/[^a-z0-9]\{1,\}/_/g; s/^_//; s/_$//')
  db_name="${db_name}_${slug}"
  # The port matters for the same reason the database name does, and it was the
  # half that stayed shared. Every worktree copied `PORT=4173` out of
  # .env.test.example, and Playwright's `reuseExistingServer` turned that
  # collision into a SILENT one: the second worktree found 4173 answering,
  # skipped its own build, and drove the first worktree's server against the
  # first worktree's database. Every fixture id is a literal, so both seeds look
  # alike and the run goes green against code that was never built.
  #
  # Deterministic, so a worktree always gets the same port and a report can be
  # read tomorrow. Two worktrees whose names hash alike still collide, but that
  # one fails loudly on bind (`reuseExistingServer` is off), which is the whole
  # difference.
  port=$((4173 + $(printf '%s' "$slug" | cksum | cut -d' ' -f1) % 100 + 1))
fi

# Set by the `test:e2e` scripts. Unset means the integration/default database.
if [ -n "${TEST_DB_SUITE:-}" ]; then
  db_name="${db_name}_${TEST_DB_SUITE}"
fi

# ── Where it lives ──────────────────────────────────────────────────────────
#
# CI hands us a server that is already up (a GitHub `services:` container), so
# there is no compose file to start and no `docker` to call. Locally we own the
# container. Either way this script owns the database NAME and the PORT, which
# are the two things the worktrees were fighting over.
if [ -n "${TEST_DATABASE_SERVER:-}" ]; then
  server=${TEST_DATABASE_SERVER%/}
  compose=""
else
  server="postgresql://jump:testpassword@localhost:5434"
  compose="docker compose -f docker-compose.test.yml"
fi

export DATABASE_URL="${server}/${db_name}"

# ORIGIN is derived rather than configured because BetterAuth reads it as its
# base URL (`server/auth.ts`), so a port and an ORIGIN that disagree produce an
# app that boots and then fails every session lookup. One source, three readers.
export PORT="$port"
export ORIGIN="http://localhost:${port}"
export BETTER_AUTH_URL="$ORIGIN"
export PLAYWRIGHT_BASE_URL="$ORIGIN"

echo "[test-db] ${db_name}, server on :${port}" >&2

if [ -n "$compose" ]; then
  echo "[test-db] starting the disposable Postgres (docker-compose.test.yml)" >&2
  $compose up -d --wait >&2
fi

# One transport for both modes: psql inside the container locally (so no local
# client is needed), the host's own client against the given server otherwise.
psql_admin() {
  if [ -n "$compose" ]; then
    $compose exec -T postgres-test psql -U jump -d postgres "$@"
  else
    psql "${server}/postgres" "$@"
  fi
}

# Creating the database is a local concern. A CI runner is handed a server whose
# `POSTGRES_DB` is already the name derived above, and it is not this script's job
# to require a psql client there: if the database were missing anyway,
# `migrate deploy` fails on the next line and names it, which is a loud failure
# and not a silent fallback.
if [ -n "$compose" ] || command -v psql >/dev/null 2>&1; then
  # `CREATE DATABASE` takes no IF NOT EXISTS, so ask first.
  if [ -z "$(psql_admin -tAc "SELECT 1 FROM pg_database WHERE datname = '${db_name}'")" ]; then
    echo "[test-db] creating ${db_name}" >&2
    psql_admin -c "CREATE DATABASE \"${db_name}\"" >&2
  fi
fi

echo "[test-db] applying migrations to ${db_name}" >&2
bunx prisma migrate deploy >&2

if [ "$#" -gt 0 ]; then
  exec "$@"
fi
