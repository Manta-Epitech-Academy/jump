#!/bin/sh
# Does `prisma/schema.prisma` say the same thing as the migration trail?
#
# Nothing else in the gate can answer that. The unit suite mocks the database
# layer, and `bun run check` type-checks against the generated client, which is
# generated FROM schema.prisma - so a field added to the schema with no migration
# behind it type-checks, passes every test, and then fails on the first real
# query in an environment that only ever runs `migrate deploy`.
#
# The comparison is against the LIVE test database rather than against
# `--from-migrations`, and that is the stronger form: `scripts/with-test-db.sh`
# has just brought that database up with `migrate deploy`, which is exactly what
# runs in every deployed environment, so what is compared is the schema against
# the state a real deploy produces. It also needs no shadow database (Prisma 7
# dropped `--shadow-database-url` from `migrate diff`), which is one mechanism
# fewer. The database is only ever written by `migrate deploy` and by the test
# suites; nothing here runs `db push`, so it cannot drift on its own.
#
#   bun run test:schema-drift
set -eu

cd "$(dirname "$0")/.."

: "${DATABASE_URL:?run this through scripts/with-test-db.sh}"

# `--exit-code` makes a non-empty diff exit 2, which is the whole point: 0 means
# the migrated database and the schema agree.
if bunx prisma migrate diff \
  --from-config-datasource \
  --to-schema ./prisma/schema.prisma \
  --exit-code; then
  echo "schema.prisma matches the migrated database."
  exit 0
fi

cat >&2 <<'MSG'

schema.prisma and prisma/migrations/ disagree.

The diff above reads as the migration that is MISSING: it is what would have to
run on a freshly-migrated database to reach what schema.prisma describes.

  Generate it     bunx prisma migrate dev --name descriptive_name
  Squash it       one migration per branch (see AGENTS.md, "Prisma Migrations")

If the schema is the thing that is wrong, fix the schema instead. Either way the
two have to agree before this merges: `migrate deploy` is what runs in every
deployed environment, so a schema-only change ships a column that does not exist.

MSG
exit 1
