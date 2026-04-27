---
name: align-migrations
description: Rename branch-local Prisma migration folders whose timestamp is earlier than the base branch's latest migration, so the CI workflow `.github/workflows/migrations-order.yml` passes. Use after merging dev/staging/main into a feature branch, or proactively before opening a PR that touches `frontend/prisma/migrations/`.
disable-model-invocation: true
---

# Align Prisma migrations after a merge

The CI check `.github/workflows/migrations-order.yml` fails any migration added on the PR branch whose timestamp is `≤` the latest migration on the target branch. After merging `dev` (or `main`/`staging`) into a feature branch, branch-local migrations can end up "in the past" relative to migrations the base picked up in the meantime — rename those folders to fresh timestamps that preserve SQL dependency order.

## Steps

1. **Identify the base branch.** PRs target `dev` by default; confirm with the user if ambiguous (`staging`, `main`).

2. **Find the latest migration timestamp on base:**

   ```bash
   git fetch origin
   git ls-tree -r --name-only "origin/<base>" -- frontend/prisma/migrations/ \
     | awk -F/ 'NF>=5 {print $4}' | cut -d_ -f1 | sort -u | tail -1
   ```

3. **List migrations added only on this branch:**

   ```bash
   git diff --name-only --diff-filter=A "origin/<base>...HEAD" -- frontend/prisma/migrations/ \
     | awk -F/ 'NF>=5 {print $4}' | sort -u
   ```

4. **For each branch-local migration whose timestamp ≤ base latest, plan a rename.** Pick a new timestamp that:
   - Is **strictly greater** than base's latest.
   - Preserves the **relative order vs other branch-local migrations** that depend on it (e.g. a later migration references a table created by an earlier one — keep the creation first).
   - A good default is base's latest + 1 second (`20260416142044` → `20260416142045`). If several renames are needed, increment by 1s each, keeping relative order.

5. **Rename with `git mv` (not plain `mv`)** so the move is tracked:

   ```bash
   git mv frontend/prisma/migrations/<old_ts>_<slug> frontend/prisma/migrations/<new_ts>_<slug>
   ```

   Do not edit the SQL or the folder's `migration.sql` contents.

6. **Validate:**

   ```bash
   cd frontend && bunx prisma validate
   ```

7. **Warn the user** that teammates who already applied the old-named migration locally must run:
   ```bash
   bunx prisma migrate resolve --rolled-back <old_name>
   bunx prisma migrate deploy
   ```
   or reset their dev DB. Production is unaffected if the old name was never deployed.

## Rules

- **Never edit `migration.sql`** — only rename the enclosing folder.
- **Never rename migrations already on the base branch** — only branch-local ones (`--diff-filter=A` against `origin/<base>`).
- **Confirm with the user before renaming** if the branch has already been pushed and others may have pulled it — renames rewrite future migration history for collaborators.
- Check with `grep` whether downstream branch-local migrations reference tables/columns introduced by the one being renamed — if so, keep the renamed migration before them.
